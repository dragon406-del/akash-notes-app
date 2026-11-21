import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { ChapterNote, SubjectItem } from './src/types/index.ts';

interface PendingAccessRequest {
  deviceId: string;
  label: string;
  userAgent: string;
  requestedAt: string;
  status: 'pending' | 'denied';
}

interface PermittedDevice {
  deviceId: string;
  label: string;
  approvedAt: string;
}

interface ServerPersistedState {
  pinHash: string | null;
  pinSalt: string | null;
  teacherDeviceId: string | null;
  teacherLoggedIn: boolean;
  pinCreatedAt: string | null;
  permittedDevices: Record<string, PermittedDevice>;
  pendingRequests: Record<string, PendingAccessRequest>;
  subjects: SubjectItem[];
  chapters: ChapterNote[];
}

const ALL_CLASS_IDS = [
  'class-6',
  'class-7',
  'class-8',
  'class-9',
  'class-10',
  'class-11',
  'class-12',
];

const SEED_SUBJECTS: SubjectItem[] = [
  {
    id: 'bengali',
    nameBn: 'বাংলা',
    nameEn: 'Bengali',
    code: 'BNG',
    icon: 'BookOpen',
    color: 'amber',
    descriptionBn: 'প্রথম ভাষা: গদ্য, পদ্য, ব্যাকরণ ও সাহিত্যের ইতিহাস',
  },
  {
    id: 'geography',
    nameBn: 'ভূগোল',
    nameEn: 'Geography',
    code: 'GEO',
    icon: 'Globe',
    color: 'emerald',
    descriptionBn: 'প্রাকৃতিক ও অর্থনৈতিক ভূগোল, মানচিত্র ও পরিবেশ',
  },
  {
    id: 'history',
    nameBn: 'ইতিহাস',
    nameEn: 'History',
    code: 'HIST',
    icon: 'Landmark',
    color: 'rose',
    descriptionBn: 'আধুনিক ভারত, বাংলার নবজাগরণ ও জাতীয়তাবাদী আন্দোলন',
  },
  {
    id: 'philosophy',
    nameBn: 'দর্শন',
    nameEn: 'Philosophy',
    code: 'PHIL',
    icon: 'Brain',
    color: 'indigo',
    descriptionBn: 'পাশ্চাত্য ও ভারতীয় দর্শন, যুক্তিবিজ্ঞান ও নীতিবিদ্যা (একাদশ ও দ্বাদশ শ্রেণি)',
    allowedClasses: ['class-11', 'class-12'],
  },
  {
    id: 'sanskrit',
    nameBn: 'সংস্কৃত',
    nameEn: 'Sanskrit',
    code: 'SNSK',
    icon: 'Scroll',
    color: 'sky',
    descriptionBn: 'গদ্যাংশ, পদ্যাংশ, ব্যাকরণ ও সংস্কৃত সাহিত্যের ইতিহাস',
  },
];

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');

function createInitialState(): ServerPersistedState {
  return {
    pinHash: null,
    pinSalt: null,
    teacherDeviceId: null,
    teacherLoggedIn: false,
    pinCreatedAt: null,
    permittedDevices: {},
    pendingRequests: {},
    subjects: [...SEED_SUBJECTS],
    chapters: [],
  };
}

function loadState(): ServerPersistedState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ServerPersistedState>;
      const subjects = Array.isArray(parsed.subjects)
        ? parsed.subjects.map((s) =>
            s.id === 'philosophy' && !Array.isArray(s.allowedClasses)
              ? {
                  ...s,
                  descriptionBn:
                    'পাশ্চাত্য ও ভারতীয় দর্শন, যুক্তিবিজ্ঞান ও নীতিবিদ্যা (একাদশ ও দ্বাদশ শ্রেণি)',
                  allowedClasses: ['class-11', 'class-12'],
                }
              : s
          )
        : [...SEED_SUBJECTS];

      return {
        pinHash: parsed.pinHash ?? null,
        pinSalt: parsed.pinSalt ?? null,
        teacherDeviceId: parsed.teacherDeviceId ?? null,
        teacherLoggedIn: Boolean(parsed.teacherLoggedIn && parsed.pinHash && parsed.teacherDeviceId),
        pinCreatedAt: parsed.pinCreatedAt ?? null,
        permittedDevices: parsed.permittedDevices ?? {},
        pendingRequests: parsed.pendingRequests ?? {},
        subjects,
        chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      };
    }
  } catch (err) {
    console.error('Failed to load persisted state, initializing fresh:', err);
  }
  return createInitialState();
}

let state: ServerPersistedState = loadState();

function saveState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state), 'utf-8');
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    console.error('Failed to persist state:', err);
  }
}

function hashPin(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

function verifyPin(pin: string): boolean {
  if (!state.pinHash || !state.pinSalt) return false;
  const candidate = hashPin(pin, state.pinSalt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(state.pinHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Track WebSocket clients by deviceId
const deviceSockets = new Map<string, Set<WebSocket>>();

function sendToDevice(deviceId: string, payload: Record<string, unknown>) {
  const sockets = deviceSockets.get(deviceId);
  if (!sockets) return;
  const serialized = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

function broadcastAll(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload);
  for (const sockets of deviceSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }
}

function getAccessStatusForDevice(deviceId: string): 'approved' | 'pending' | 'denied' | 'needs_permission' {
  // Before any teacher creates a PIN, everyone can open the app normally
  if (!state.pinHash) {
    return 'approved';
  }
  // Teacher's own device never requires student approval
  if (state.teacherDeviceId && deviceId === state.teacherDeviceId) {
    return 'approved';
  }
  // Previously permitted device requires no verification on subsequent visits
  if (state.permittedDevices[deviceId]) {
    return 'approved';
  }
  const req = state.pendingRequests[deviceId];
  if (req) {
    return req.status === 'denied' ? 'denied' : 'pending';
  }
  return 'needs_permission';
}

function buildStateResponse(deviceId: string) {
  const hasPin = Boolean(state.pinHash);
  const isTeacherDevice = Boolean(state.teacherDeviceId && deviceId === state.teacherDeviceId);
  const isTeacherActiveOnThisDevice = Boolean(isTeacherDevice && state.teacherLoggedIn);
  const accessStatus = getAccessStatusForDevice(deviceId);
  const canAccessContent = accessStatus === 'approved';

  return {
    hasPin,
    teacherLoggedIn: state.teacherLoggedIn,
    isTeacherDevice,
    isTeacherActiveOnThisDevice,
    accessStatus,
    subjects: state.subjects,
    chapters: canAccessContent ? state.chapters : [],
    pendingRequests: isTeacherDevice
      ? Object.values(state.pendingRequests)
          .filter((r) => r.status === 'pending')
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      : [],
    permittedDevices: isTeacherDevice
      ? Object.values(state.permittedDevices).sort((a, b) =>
          b.approvedAt.localeCompare(a.approvedAt)
        )
      : [],
  };
}

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const PDF_TMP_DIR = path.join(PDF_DIR, 'tmp');

interface ActivePdfUpload {
  uploadId: string;
  fileName: string;
  totalSize: number;
  receivedBytes: number;
  tmpPath: string;
}

const activePdfUploads = new Map<string, ActivePdfUpload>();

function isValidSafePdfId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

async function startServer() {
  fs.mkdirSync(PDF_TMP_DIR, { recursive: true });
  const app = express();

  app.use((_req: Request, res: Response, next) => {
    res.setHeader('Permissions-Policy', 'display-capture=()');
    next();
  });

  // Serve legacy PDF.js worker & supporting font/cmap/wasm assets cleanly
  const pdfjsDir = path.resolve(process.cwd(), 'node_modules/pdfjs-dist');
  const pdfWorkerFile = path.join(pdfjsDir, 'legacy/build/pdf.worker.min.mjs');
  app.get('/pdf.worker.min.mjs', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(pdfWorkerFile);
  });
  app.use('/pdfjs/cmaps', express.static(path.join(pdfjsDir, 'cmaps'), { maxAge: '1d' }));
  app.use('/pdfjs/standard_fonts', express.static(path.join(pdfjsDir, 'standard_fonts'), { maxAge: '1d' }));
  app.use('/pdfjs/wasm', express.static(path.join(pdfjsDir, 'wasm'), { maxAge: '1d' }));

  // Chunked streaming PDF upload (supports up to 10 GB in 4 MB chunks without holding file in memory)
  app.put(
    '/api/pdfs/chunk/:uploadId',
    express.raw({ type: 'application/octet-stream', limit: '16mb' }),
    async (req: Request, res: Response) => {
      const uploadId = String(req.params.uploadId || '').trim();
      if (!isValidSafePdfId(uploadId)) {
        res.status(400).json({ error: 'অকার্যকর আপলোড আইডি।' });
        return;
      }
      const meta = activePdfUploads.get(uploadId);
      if (!meta) {
        res.status(404).json({ error: 'আপলোড সেশন পাওয়া যায়নি।' });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'খালি ফাইল অংশ পাঠানো হয়েছে।' });
        return;
      }
      if (
        meta.receivedBytes + req.body.length > MAX_PDF_UPLOAD_BYTES ||
        meta.receivedBytes + req.body.length > meta.totalSize
      ) {
        res.status(413).json({ error: 'PDF ফাইলটি সর্বোচ্চ ১০ GB সীমা অতিক্রম করেছে।' });
        return;
      }
      try {
        await fs.promises.appendFile(meta.tmpPath, req.body);
        meta.receivedBytes += req.body.length;
        res.json({ ok: true, receivedBytes: meta.receivedBytes });
      } catch (err) {
        console.error('Failed writing PDF chunk:', err);
        res.status(500).json({ error: 'PDF অংশ সংরক্ষণে সমস্যা হয়েছে।' });
      }
    }
  );

  app.use(express.json({ limit: '50mb' }));

  app.post('/api/pdfs/init', async (req: Request, res: Response) => {
    const { fileName, totalSize } = (req.body || {}) as {
      fileName?: string;
      totalSize?: number;
    };
    const cleanName = String(fileName || 'notes.pdf').trim().slice(0, 200);
    const sizeNum = Number(totalSize);

    if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
      res.status(400).json({ error: 'PDF ফাইলের সঠিক সাইজ পাওয়া যায়নি।' });
      return;
    }
    if (sizeNum > MAX_PDF_UPLOAD_BYTES) {
      res.status(413).json({ error: 'PDF ফাইলটি সর্বোচ্চ ১০ GB-এর মধ্যে হতে হবে।' });
      return;
    }

    const uploadId = `pdf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const tmpPath = path.join(PDF_TMP_DIR, `${uploadId}.part`);
    try {
      await fs.promises.writeFile(tmpPath, Buffer.alloc(0));
      activePdfUploads.set(uploadId, {
        uploadId,
        fileName: cleanName,
        totalSize: sizeNum,
        receivedBytes: 0,
        tmpPath,
      });
      res.json({ ok: true, uploadId });
    } catch (err) {
      console.error('Failed initializing PDF upload:', err);
      res.status(500).json({ error: 'PDF আপলোড শুরু করা যায়নি।' });
    }
  });

  app.post('/api/pdfs/complete/:uploadId', async (req: Request, res: Response) => {
    const uploadId = String(req.params.uploadId || '').trim();
    if (!isValidSafePdfId(uploadId)) {
      res.status(400).json({ error: 'অকার্যকর আপলোড আইডি।' });
      return;
    }
    const meta = activePdfUploads.get(uploadId);
    if (!meta) {
      res.status(404).json({ error: 'আপলোড সেশন পাওয়া যায়নি।' });
      return;
    }
    if (meta.receivedBytes !== meta.totalSize) {
      res.status(400).json({ error: 'সম্পূর্ণ PDF ফাইল আপলোড হয়নি।' });
      return;
    }

    const finalPdfPath = path.join(PDF_DIR, `${uploadId}.pdf`);
    const finalMetaPath = path.join(PDF_DIR, `${uploadId}.json`);
    try {
      await fs.promises.rename(meta.tmpPath, finalPdfPath);
      await fs.promises.writeFile(
        finalMetaPath,
        JSON.stringify({ fileName: meta.fileName, sizeBytes: meta.receivedBytes })
      );
      activePdfUploads.delete(uploadId);
      res.json({
        ok: true,
        pdfId: uploadId,
        pdfUrl: `/api/pdfs/${uploadId}`,
        sizeBytes: meta.receivedBytes,
      });
    } catch (err) {
      console.error('Failed completing PDF upload:', err);
      res.status(500).json({ error: 'PDF ফাইল সংরক্ষণ সম্পন্ন করা যায়নি।' });
    }
  });

  app.delete('/api/pdfs/upload/:uploadId', async (req: Request, res: Response) => {
    const uploadId = String(req.params.uploadId || '').trim();
    if (!isValidSafePdfId(uploadId)) {
      res.status(400).json({ error: 'অকার্যকর আপলোড আইডি।' });
      return;
    }
    const meta = activePdfUploads.get(uploadId);
    if (meta) {
      activePdfUploads.delete(uploadId);
      await fs.promises.unlink(meta.tmpPath).catch(() => {});
    }
    res.json({ ok: true });
  });

  app.get('/api/pdfs/:pdfId', async (req: Request, res: Response) => {
    const pdfId = String(req.params.pdfId || '').trim();
    if (!isValidSafePdfId(pdfId)) {
      res.status(400).json({ error: 'অকার্যকর PDF আইডি।' });
      return;
    }
    const pdfPath = path.join(PDF_DIR, `${pdfId}.pdf`);
    const metaPath = path.join(PDF_DIR, `${pdfId}.json`);
    try {
      const stat = await fs.promises.stat(pdfPath);
      const fileSize = stat.size;
      let fileName = `${pdfId}.pdf`;
      try {
        const rawMeta = await fs.promises.readFile(metaPath, 'utf-8');
        const parsedMeta = JSON.parse(rawMeta) as { fileName?: string };
        if (parsedMeta.fileName) fileName = parsedMeta.fileName;
      } catch {
        // Fallback to default fileName
      }

      const safeDownloadName = encodeURIComponent(fileName).replace(/'/g, '%27');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeDownloadName}`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.setHeader('Content-Length', String(fileSize));
      if (req.method === 'HEAD') {
        res.status(200).end();
        return;
      }

      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
        if (start >= fileSize || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', String(end - start + 1));
        fs.createReadStream(pdfPath, { start, end }).pipe(res);
      } else {
        fs.createReadStream(pdfPath).pipe(res);
      }
    } catch {
      res.status(404).json({ error: 'PDF ফাইলটি পাওয়া যায়নি।' });
    }
  });

  app.delete('/api/pdfs/:pdfId', async (req: Request, res: Response) => {
    const pdfId = String(req.params.pdfId || '').trim();
    if (!isValidSafePdfId(pdfId)) {
      res.status(400).json({ error: 'অকার্যকর PDF আইডি।' });
      return;
    }
    await fs.promises.unlink(path.join(PDF_DIR, `${pdfId}.pdf`)).catch(() => {});
    await fs.promises.unlink(path.join(PDF_DIR, `${pdfId}.json`)).catch(() => {});
    res.json({ ok: true });
  });

  // Temporary endpoint to download current app files ZIP
  app.get('/api/download-app-zip', (_req: Request, res: Response) => {
    const zipPath = '/tmp/akash-sirer-notes-app.zip';
    if (!fs.existsSync(zipPath)) {
      res.status(404).json({ error: 'ZIP archive not found.' });
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="akash-sirer-notes-app.zip"');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(zipPath);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const deviceId = url.searchParams.get('deviceId') || '';
    if (!deviceId) {
      ws.close();
      return;
    }

    let set = deviceSockets.get(deviceId);
    if (!set) {
      set = new Set();
      deviceSockets.set(deviceId, set);
    }
    set.add(ws);

    // If the teacher device reconnects and there are pending requests, push refresh immediately
    if (
      state.teacherDeviceId &&
      deviceId === state.teacherDeviceId &&
      Object.values(state.pendingRequests).some((r) => r.status === 'pending')
    ) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'state:refresh' }));
      }
    }

    ws.on('close', () => {
      const existing = deviceSockets.get(deviceId);
      if (existing) {
        existing.delete(ws);
        if (existing.size === 0) {
          deviceSockets.delete(deviceId);
        }
      }
    });
  });

  // Keep WebSocket connections alive behind proxies (nginx / Cloud Run)
  const wsHeartbeat = setInterval(() => {
    for (const sockets of deviceSockets.values()) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }
  }, 25000);
  server.on('close', () => clearInterval(wsHeartbeat));

  // 1. Fetch state for a specific device
  app.get('/api/state', (req: Request, res: Response) => {
    const deviceId = String(req.query.deviceId || '').trim();
    if (!deviceId) {
      res.status(400).json({ error: 'ডিভাইস আইডি পাওয়া যায়নি।' });
      return;
    }
    res.json(buildStateResponse(deviceId));
  });

  // 2. First-time Teacher PIN Setup (NO default PIN, NO verification needed when no PIN exists yet)
  app.post('/api/teacher/setup-pin', (req: Request, res: Response) => {
    const { deviceId, newPin } = req.body as { deviceId?: string; newPin?: string };
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanPin = String(newPin || '').trim();

    if (!cleanDeviceId) {
      res.status(400).json({ error: 'ডিভাইস আইডি পাওয়া যায়নি।' });
      return;
    }
    if (state.pinHash !== null) {
      res.status(403).json({
        error: 'ইতিমধ্যেই শিক্ষক পিন তৈরি করা হয়েছে। আগের পিন ছাড়া পরিবর্তন বা প্রবেশ করা যাবে না।',
      });
      return;
    }
    if (cleanPin.length < 4) {
      res.status(400).json({ error: 'নতুন পিন কমপক্ষে ৪ সংখ্যার হতে হবে।' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    state.pinSalt = salt;
    state.pinHash = hashPin(cleanPin, salt);
    state.teacherDeviceId = cleanDeviceId;
    state.teacherLoggedIn = true;
    state.pinCreatedAt = new Date().toISOString();
    saveState();

    broadcastAll({ type: 'state:refresh' });
    res.json({ ok: true, state: buildStateResponse(cleanDeviceId) });
  });

  // 3. Teacher Login (Only ONE teacher can be logged in at a time)
  app.post('/api/teacher/login', (req: Request, res: Response) => {
    const { deviceId, pin } = req.body as { deviceId?: string; pin?: string };
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!cleanDeviceId) {
      res.status(400).json({ error: 'ডিভাইস আইডি পাওয়া যায়নি।' });
      return;
    }
    if (!state.pinHash) {
      res.status(400).json({ error: 'এখনও কোনো শিক্ষক পিন তৈরি করা হয়নি। প্রথমে নতুন পিন তৈরি করো।' });
      return;
    }
    if (state.teacherLoggedIn && state.teacherDeviceId && state.teacherDeviceId !== cleanDeviceId) {
      res.status(403).json({
        error: 'অন্য একটি ডিভাইস থেকে ইতিমধ্যেই শিক্ষক লগইন করা আছেন! একসাথে কেবল একজনই শিক্ষক হিসেবে লগইন করতে পারবে।',
      });
      return;
    }
    if (!verifyPin(cleanPin)) {
      res.status(401).json({ error: 'ভুল পিন কোড! তোমার সঠিক শিক্ষক পিন দিয়ে প্রবেশ করো।' });
      return;
    }

    // If no teacher was actively logged in, bind this verified teacher device as the active teacher device
    state.teacherDeviceId = cleanDeviceId;
    state.teacherLoggedIn = true;
    saveState();

    broadcastAll({ type: 'state:refresh' });
    res.json({ ok: true, state: buildStateResponse(cleanDeviceId) });
  });

  // 4. Turn Off Teacher Mode (Requires previous/current PIN from ANY device)
  app.post('/api/teacher/turn-off', (req: Request, res: Response) => {
    const { deviceId, pin } = req.body as { deviceId?: string; pin?: string };
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!state.pinHash) {
      res.status(400).json({ error: 'কোনো শিক্ষক পিন সেট করা নেই।' });
      return;
    }
    if (!verifyPin(cleanPin)) {
      res.status(401).json({
        error: 'ভুল পিন কোড! আগের পিন নিশ্চিত করা ছাড়া কোনো ডিভাইস থেকে শিক্ষক মোড বন্ধ করা যাবে না।',
      });
      return;
    }

    state.teacherLoggedIn = false;
    saveState();

    broadcastAll({ type: 'state:refresh' });
    res.json({ ok: true, state: buildStateResponse(cleanDeviceId) });
  });

  // 5. Change Teacher PIN (Requires previous PIN from ANY device)
  app.post('/api/teacher/change-pin', (req: Request, res: Response) => {
    const { deviceId, previousPin, newPin } = req.body as {
      deviceId?: string;
      previousPin?: string;
      newPin?: string;
    };
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanPrev = String(previousPin || '').trim();
    const cleanNew = String(newPin || '').trim();

    if (!state.pinHash) {
      res.status(400).json({ error: 'এখনও কোনো শিক্ষক পিন তৈরি করা হয়নি।' });
      return;
    }
    if (!verifyPin(cleanPrev)) {
      res.status(401).json({
        error: 'তোমার আগের পিনটি সঠিক নয়! পূর্ববর্তী পিন নিশ্চিত না করলে পিন পরিবর্তন করা যাবে না।',
      });
      return;
    }
    if (cleanNew.length < 4) {
      res.status(400).json({ error: 'নতুন পিন কমপক্ষে ৪ সংখ্যার হতে হবে।' });
      return;
    }
    if (cleanNew === cleanPrev) {
      res.status(400).json({ error: 'নতুন পিনটি তোমার আগের পিনের চেয়ে আলাদা হতে হবে।' });
      return;
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    state.pinSalt = newSalt;
    state.pinHash = hashPin(cleanNew, newSalt);
    saveState();

    broadcastAll({ type: 'state:refresh' });
    res.json({ ok: true, state: buildStateResponse(cleanDeviceId) });
  });

  // 6. Student Device Access Request -> Sends live message to Teacher Device
  app.post('/api/access/request', (req: Request, res: Response) => {
    const { deviceId, label, userAgent } = req.body as {
      deviceId?: string;
      label?: string;
      userAgent?: string;
    };
    const cleanDeviceId = String(deviceId || '').trim();
    if (!cleanDeviceId) {
      res.status(400).json({ error: 'ডিভাইস আইডি পাওয়া যায়নি।' });
      return;
    }

    const accessStatus = getAccessStatusForDevice(cleanDeviceId);
    if (accessStatus === 'approved') {
      res.json({ ok: true, accessStatus: 'approved', state: buildStateResponse(cleanDeviceId) });
      return;
    }

    const cleanLabel = String(label || '').trim() || `শিক্ষার্থী ডিভাইস (${cleanDeviceId.slice(0, 6)})`;
    const cleanUa = String(userAgent || '').trim().slice(0, 120);

    const requestEntry: PendingAccessRequest = {
      deviceId: cleanDeviceId,
      label: cleanLabel,
      userAgent: cleanUa,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    state.pendingRequests[cleanDeviceId] = requestEntry;
    saveState();

    if (state.teacherDeviceId) {
      sendToDevice(state.teacherDeviceId, {
        type: 'access:request',
        request: requestEntry,
      });
    }

    res.json({ ok: true, accessStatus: 'pending', request: requestEntry });
  });

  // 7. Teacher Approves / Denies / Revokes Student Device
  app.post('/api/access/respond', (req: Request, res: Response) => {
    const { deviceId, targetDeviceId, action } = req.body as {
      deviceId?: string;
      targetDeviceId?: string;
      action?: 'approve' | 'deny' | 'revoke';
    };
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanTarget = String(targetDeviceId || '').trim();

    if (!state.teacherDeviceId || cleanDeviceId !== state.teacherDeviceId) {
      res.status(403).json({ error: 'কেবলমাত্র শিক্ষক ডিভাইস থেকেই অনুমতি দেওয়া বা বাতিল করা যাবে।' });
      return;
    }
    if (!cleanTarget) {
      res.status(400).json({ error: 'টার্গেট ডিভাইস আইডি পাওয়া যায়নি।' });
      return;
    }

    if (action === 'approve') {
      const pending = state.pendingRequests[cleanTarget];
      const label = pending?.label || `শিক্ষার্থী ডিভাইস (${cleanTarget.slice(0, 6)})`;
      state.permittedDevices[cleanTarget] = {
        deviceId: cleanTarget,
        label,
        approvedAt: new Date().toISOString(),
      };
      delete state.pendingRequests[cleanTarget];
      saveState();

      sendToDevice(cleanTarget, { type: 'access:approved' });
      sendToDevice(state.teacherDeviceId, { type: 'state:refresh' });
      res.json({ ok: true, state: buildStateResponse(cleanDeviceId) });
      return;
    }

    if (action === 'deny') {
      if (state.pendingRequests[cleanTarget]) {
        state.pendingRequests[cleanTarget].status = 'denied';
      }
      saveState();

      sendToDevice(cleanTarget, { type: 'access:denied' });
      sendToDevice(state.teacherDeviceId, { type: 'state:refresh' });
      res.json({ ok: true, state: buildStateResponse(cleanDeviceId) });
      return;
    }

    if (action === 'revoke') {
      delete state.permittedDevices[cleanTarget];
      delete state.pendingRequests[cleanTarget];
      saveState();

      sendToDevice(cleanTarget, { type: 'access:revoked' });
      sendToDevice(state.teacherDeviceId, { type: 'state:refresh' });
      res.json({ ok: true, state: buildStateResponse(cleanDeviceId) });
      return;
    }

    res.status(400).json({ error: 'অকার্যকর অনুরোধ।' });
  });

  // 8. Save / Update Chapter Note (Requires active teacher device + PIN)
  app.post('/api/chapters', (req: Request, res: Response) => {
    const { deviceId, pin, chapter } = req.body as {
      deviceId?: string;
      pin?: string;
      chapter?: ChapterNote;
    };
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!state.teacherDeviceId || cleanDeviceId !== state.teacherDeviceId || !state.teacherLoggedIn) {
      res.status(403).json({ error: 'কেবলমাত্র লগইন করা শিক্ষকই নোটস যোগ বা পরিবর্তন করতে পারবেন।' });
      return;
    }
    if (!verifyPin(cleanPin)) {
      res.status(401).json({ error: 'ভুল শিক্ষক পিন! নোটস সংরক্ষণ করা যায়নি।' });
      return;
    }
    if (!chapter || !chapter.id || !chapter.titleBn) {
      res.status(400).json({ error: 'নোটসের তথ্য অসম্পূর্ণ।' });
      return;
    }

    const idx = state.chapters.findIndex((c) => c.id === chapter.id);
    if (idx >= 0) {
      state.chapters[idx] = chapter;
    } else {
      state.chapters.push(chapter);
    }
    saveState();

    broadcastAll({ type: 'content:updated' });
    res.json({ ok: true, chapters: state.chapters });
  });

  // 9. Delete Chapter Note (Requires active teacher device + PIN)
  app.delete('/api/chapters/:id', (req: Request, res: Response) => {
    const chapterId = req.params.id;
    const { deviceId, pin } = req.body as { deviceId?: string; pin?: string };
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!state.teacherDeviceId || cleanDeviceId !== state.teacherDeviceId || !state.teacherLoggedIn) {
      res.status(403).json({ error: 'কেবলমাত্র লগইন করা শিক্ষকই নোটস মুছে ফেলতে পারবেন।' });
      return;
    }
    if (!verifyPin(cleanPin)) {
      res.status(401).json({ error: 'ভুল শিক্ষক পিন! নোটস মুছে ফেলা যায়নি।' });
      return;
    }

    state.chapters = state.chapters.filter((c) => c.id !== chapterId);
    saveState();

    broadcastAll({ type: 'content:updated' });
    res.json({ ok: true, chapters: state.chapters });
  });

  // 10. Add Subject (Scoped to selected class or all classes; requires active teacher device)
  app.post('/api/subjects', (req: Request, res: Response) => {
    const { deviceId, subject, classId } = req.body as {
      deviceId?: string;
      subject?: SubjectItem;
      classId?: string;
    };
    const cleanDeviceId = String(deviceId || '').trim();
    const targetClassId = String(classId || 'all').trim();

    if (!state.teacherDeviceId || cleanDeviceId !== state.teacherDeviceId || !state.teacherLoggedIn) {
      res.status(403).json({ error: 'কেবলমাত্র লগইন করা শিক্ষকই নতুন বিষয় যোগ করতে পারবেন।' });
      return;
    }
    if (!subject || !subject.id || !subject.nameBn) {
      res.status(400).json({ error: 'বিষয়ের তথ্য অসম্পূর্ণ।' });
      return;
    }

    const classesToAdd = targetClassId === 'all' ? [...ALL_CLASS_IDS] : [targetClassId];
    const cleanNameBn = subject.nameBn.trim().toLowerCase();
    const idx = state.subjects.findIndex(
      (s) => s.id === subject.id || s.nameBn.trim().toLowerCase() === cleanNameBn
    );

    let savedSubject: SubjectItem;
    if (idx >= 0) {
      const existing = state.subjects[idx];
      const existingAllowed = Array.isArray(existing.allowedClasses)
        ? existing.allowedClasses
        : existing.id === 'philosophy'
        ? ['class-11', 'class-12']
        : [...ALL_CLASS_IDS];
      const mergedAllowed = Array.from(new Set([...existingAllowed, ...classesToAdd]));
      savedSubject = {
        ...existing,
        ...subject,
        id: existing.id,
        allowedClasses: mergedAllowed,
      };
      state.subjects[idx] = savedSubject;
    } else {
      savedSubject = {
        ...subject,
        allowedClasses: Array.isArray(subject.allowedClasses)
          ? subject.allowedClasses
          : classesToAdd,
      };
      state.subjects.push(savedSubject);
    }
    saveState();

    broadcastAll({ type: 'content:updated' });
    res.json({ ok: true, subject: savedSubject, subjects: state.subjects });
  });

  // 11. Remove Subject (Scoped to selected class or all classes; requires active teacher device)
  app.delete('/api/subjects/:id', (req: Request, res: Response) => {
    const subjectId = req.params.id;
    const { deviceId, classId } = (req.body || {}) as { deviceId?: string; classId?: string };
    const cleanDeviceId = String(deviceId || '').trim();
    const targetClassId = String(classId || req.query.classId || 'all').trim();

    if (!state.teacherDeviceId || cleanDeviceId !== state.teacherDeviceId || !state.teacherLoggedIn) {
      res.status(403).json({ error: 'কেবলমাত্র লগইন করা শিক্ষকই বিষয় সরাতে পারবেন।' });
      return;
    }

    const subIndex = state.subjects.findIndex((s) => s.id === subjectId);
    if (subIndex === -1) {
      res.json({ ok: true, subjects: state.subjects, chapters: state.chapters });
      return;
    }

    if (!targetClassId || targetClassId === 'all') {
      state.subjects = state.subjects.filter((s) => s.id !== subjectId);
      state.chapters = state.chapters.filter((c) => c.subjectId !== subjectId);
    } else {
      const existing = state.subjects[subIndex];
      const currentAllowed = Array.isArray(existing.allowedClasses)
        ? existing.allowedClasses
        : existing.id === 'philosophy'
        ? ['class-11', 'class-12']
        : [...ALL_CLASS_IDS];
      const remaining = currentAllowed.filter((c) => c !== targetClassId);

      if (remaining.length === 0) {
        state.subjects = state.subjects.filter((s) => s.id !== subjectId);
        state.chapters = state.chapters.filter((c) => c.subjectId !== subjectId);
      } else {
        state.subjects[subIndex] = {
          ...existing,
          allowedClasses: remaining,
        };
        state.chapters = state.chapters.filter(
          (c) => !(c.subjectId === subjectId && c.classLevel === targetClassId)
        );
      }
    }

    saveState();

    broadcastAll({ type: 'content:updated' });
    res.json({ ok: true, subjects: state.subjects, chapters: state.chapters });
  });

  // Vite middleware for dev, static dist for prod
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
