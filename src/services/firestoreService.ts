import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { ChapterNote, SubjectItem } from '../types';
import {
  ALL_CLASS_IDS,
  DEFAULT_SUBJECTS,
  isSubjectChoiceClass,
  sortSubjects,
} from '../data/defaultData';
import { getDefaultDeviceLabel, PendingAccessRequest, PermittedDevice } from './api';
import { db, handleFirestoreError, logFirestoreError, OperationType } from './firebase';

function parseSubjectIdsForClass(
  rawIds: unknown,
  classId?: unknown
): string[] | undefined {
  if (typeof classId !== 'string' || !isSubjectChoiceClass(classId) || !Array.isArray(rawIds)) {
    return undefined;
  }
  const clean = Array.from(
    new Set(
      rawIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 128)
    )
  ).slice(0, 20);
  return clean.length > 0 ? clean : undefined;
}

export const FIRESTORE_PDF_MAX_BYTES = 25 * 1024 * 1024; // 25 MB cloud cap (matches 26,214,400 bytes / 64 chunks rules limit)
const FIRESTORE_PDF_CHUNK_BYTES = 450 * 1024; // ~450 KB raw -> ~614 KB base64 (< 750 KB chunk limit)
const FIRESTORE_MAX_CHUNKS = 64;

const utf8Encoder = new TextEncoder();

function truncateUtf8(value: string, maxBytes: number): string {
  const input = String(value || '');
  if (!input || maxBytes <= 0) return '';
  if (utf8Encoder.encode(input).length <= maxBytes) return input;

  let result = '';
  let usedBytes = 0;
  for (const ch of input) {
    const chBytes = utf8Encoder.encode(ch).length;
    if (usedBytes + chBytes > maxBytes) break;
    result += ch;
    usedBytes += chBytes;
  }
  return result;
}

function truncatePdfFileNameUtf8(fileName: string, maxBytes = 180): string {
  const clean = (fileName || '').trim() || 'notes.pdf';
  if (utf8Encoder.encode(clean).length <= maxBytes) return clean;

  const lower = clean.toLowerCase();
  if (lower.endsWith('.pdf') && maxBytes > 4) {
    const stem = clean.slice(0, -4);
    const trimmedStem = truncateUtf8(stem, maxBytes - 4).trim();
    return `${trimmedStem || 'notes'}.pdf`;
  }
  return truncateUtf8(clean, maxBytes) || 'notes.pdf';
}

function hasPdfMagicHeader(bytes: Uint8Array): boolean {
  if (!bytes || bytes.byteLength < 5) return false;
  const searchLimit = Math.min(bytes.byteLength - 4, 1024);
  for (let i = 0; i <= searchLimit; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    cleaned.length % 4 === 0 ? cleaned : cleaned.padEnd(cleaned.length + (4 - (cleaned.length % 4)), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const READ_QUOTA_ERROR_MESSAGE =
  'আজকের জন্য Firestore ফ্রি রিড কোটা শেষ হয়ে গেছে। আগামীকাল কোটা রিসেট হলে আবার চেষ্টা করো।';
export const WRITE_QUOTA_ERROR_MESSAGE =
  'আজকের জন্য Firestore ফ্রি রাইট কোটা শেষ হয়ে গেছে। আগামীকাল কোটা রিসেট হলে আবার চেষ্টা করো।';

export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota') ||
    msg.includes('ফ্রি রিড কোটা') ||
    msg.includes('ফ্রি রাইট কোটা')
  );
}

const VERIFIED_CLOUD_PDFS_KEY = 'akash_cloud_verified_pdfs';
const MAX_VERIFIED_CLOUD_PDFS = 200;

function readVerifiedCloudPdfIds(): string[] {
  try {
    const raw = localStorage.getItem(VERIFIED_CLOUD_PDFS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function writeVerifiedCloudPdfIds(ids: string[]): void {
  try {
    localStorage.setItem(
      VERIFIED_CLOUD_PDFS_KEY,
      JSON.stringify(ids.slice(-MAX_VERIFIED_CLOUD_PDFS))
    );
  } catch {
    // Ignore localStorage quota or restricted storage errors
  }
}

function isPdfVerifiedLocally(pdfId: string): boolean {
  if (!pdfId) return false;
  return readVerifiedCloudPdfIds().includes(pdfId);
}

function markPdfVerifiedLocally(pdfId: string): void {
  if (!pdfId) return;
  const existing = readVerifiedCloudPdfIds().filter((id) => id !== pdfId);
  existing.push(pdfId);
  writeVerifiedCloudPdfIds(existing);
}

function unmarkPdfVerifiedLocally(pdfId: string): void {
  if (!pdfId) return;
  const filtered = readVerifiedCloudPdfIds().filter((id) => id !== pdfId);
  writeVerifiedCloudPdfIds(filtered);
}

const ADMIN_EMAILS = ['d42653503@gmail.com', 'pradipmallick635343@gmail.com'];

function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email));
}

function buildFirestoreSubjectPayload(
  sub: SubjectItem,
  teacherUid: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: sub.id,
    nameBn: truncateUtf8(sub.nameBn.trim(), 96) || 'বিষয়',
    nameEn: truncateUtf8((sub.nameEn || sub.nameBn).trim(), 96) || 'Subject',
    code: truncateUtf8((sub.code || 'SUB').trim(), 18) || 'SUB',
    icon: truncateUtf8((sub.icon || 'BookOpen').trim(), 36) || 'BookOpen',
    color: truncateUtf8((sub.color || 'amber').trim(), 28) || 'amber',
    descriptionBn: truncateUtf8((sub.descriptionBn || '').trim(), 380),
    teacherUid,
  };
  if (typeof sub.isCustom === 'boolean') {
    payload.isCustom = sub.isCustom;
  }
  if (Array.isArray(sub.allowedClasses)) {
    payload.allowedClasses = sub.allowedClasses.slice(0, 10);
  }
  return payload;
}

export interface AppPublicConfigDoc {
  hasPin: boolean;
  teacherLoggedIn: boolean;
  teacherDeviceId: string;
  teacherUid: string;
  updatedAt?: Timestamp | string;
}

interface AppSecurityConfigDoc {
  pinHash: string;
  pinSalt: string;
  teacherUid: string;
  teacherDeviceId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const SECURITY_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedSecurityConfig: {
  pinHash: string;
  pinSalt: string;
  cachedAt: number;
} | null = null;

function setCachedSecurityConfig(pinHash: string, pinSalt: string): void {
  if (!pinHash || !pinSalt) return;
  cachedSecurityConfig = {
    pinHash,
    pinSalt,
    cachedAt: Date.now(),
  };
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val) {
    return val;
  }
  return new Date().toISOString();
}

function generateSaltHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPinHex(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPin(pin: string): Promise<boolean> {
  if (
    cachedSecurityConfig &&
    Date.now() - cachedSecurityConfig.cachedAt < SECURITY_CACHE_TTL_MS
  ) {
    const candidate = await hashPinHex(pin, cachedSecurityConfig.pinSalt);
    return candidate === cachedSecurityConfig.pinHash;
  }

  const secPath = 'appConfig/security';
  let snap;
  try {
    snap = await getDoc(doc(db, 'appConfig', 'security'));
  } catch (err) {
    if (isQuotaExceededError(err)) {
      if (cachedSecurityConfig) {
        const candidate = await hashPinHex(pin, cachedSecurityConfig.pinSalt);
        return candidate === cachedSecurityConfig.pinHash;
      }
      logFirestoreError(err, OperationType.GET, secPath);
      throw new Error(READ_QUOTA_ERROR_MESSAGE);
    }
    handleFirestoreError(err, OperationType.GET, secPath);
  }
  if (!snap.exists()) return false;
  const sec = snap.data() as AppSecurityConfigDoc;
  setCachedSecurityConfig(sec.pinHash, sec.pinSalt);
  const candidate = await hashPinHex(pin, sec.pinSalt);
  return candidate === sec.pinHash;
}

let subjectsSeededInSession = false;

async function ensureDefaultSubjectsSeeded(teacherUid: string, forceFetch = false): Promise<SubjectItem[]> {
  if (subjectsSeededInSession && !forceFetch) {
    return DEFAULT_SUBJECTS;
  }
  const path = 'subjects';
  try {
    const snap = await getDocs(collection(db, 'subjects'));
    if (!snap.empty) {
      subjectsSeededInSession = true;
      return snap.docs.map((d) => d.data() as SubjectItem);
    }
    const batch = writeBatch(db);
    for (const sub of DEFAULT_SUBJECTS) {
      batch.set(doc(db, 'subjects', sub.id), buildFirestoreSubjectPayload(sub, teacherUid));
    }
    await batch.commit();
    subjectsSeededInSession = true;
    return DEFAULT_SUBJECTS;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      logFirestoreError(err, OperationType.WRITE, path);
      throw new Error(READ_QUOTA_ERROR_MESSAGE);
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export const firestoreService = {
  subscribePublicConfig(
    onChange: (cfg: AppPublicConfigDoc | null) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const path = 'appConfig/public';
    const docRef = doc(db, 'appConfig', 'public');
    let settled = false;

    const fallbackTimer = window.setTimeout(async () => {
      if (settled) return;
      try {
        const snap = await getDoc(docRef);
        if (!settled) {
          settled = true;
          onChange(snap.exists() ? (snap.data() as AppPublicConfigDoc) : null);
        }
      } catch (err) {
        if (!settled && onError) {
          settled = true;
          logFirestoreError(err, OperationType.GET, path);
          onError(err);
        }
      }
    }, 6000);

    const unsub = onSnapshot(
      docRef,
      (snap) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (!snap.exists()) {
          onChange(null);
          return;
        }
        onChange(snap.data() as AppPublicConfigDoc);
      },
      (err) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (onError) {
          logFirestoreError(err, OperationType.GET, path);
          onError(err);
          return;
        }
        handleFirestoreError(err, OperationType.GET, path);
      }
    );

    return () => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  },

  subscribePermittedDevice(
    deviceId: string,
    onChange: (device: PermittedDevice | null) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const path = `permittedDevices/${deviceId}`;
    const docRef = doc(db, 'permittedDevices', deviceId);
    let settled = false;

    const mapSnap = (snap: Awaited<ReturnType<typeof getDoc>>): PermittedDevice | null => {
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      const permittedClassId =
        typeof data.permittedClassId === 'string' ? data.permittedClassId : undefined;
      return {
        deviceId: String(data.deviceId || snap.id),
        label: String(data.label || ''),
        permittedClassId,
        permittedSubjectIds: parseSubjectIdsForClass(data.permittedSubjectIds, permittedClassId),
        approvedAt: toIsoString(data.approvedAt),
      };
    };

    const fallbackTimer = window.setTimeout(async () => {
      if (settled) return;
      try {
        const snap = await getDoc(docRef);
        if (!settled) {
          settled = true;
          onChange(mapSnap(snap));
        }
      } catch (err) {
        if (!settled && onError) {
          settled = true;
          logFirestoreError(err, OperationType.GET, path);
          onError(err);
        }
      }
    }, 6000);

    const unsub = onSnapshot(
      docRef,
      (snap) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        onChange(mapSnap(snap));
      },
      (err) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (onError) {
          logFirestoreError(err, OperationType.GET, path);
          onError(err);
          return;
        }
        handleFirestoreError(err, OperationType.GET, path);
      }
    );

    return () => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  },

  subscribeMyAccessRequest(
    deviceId: string,
    onChange: (req: PendingAccessRequest | null) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const path = `accessRequests/${deviceId}`;
    const docRef = doc(db, 'accessRequests', deviceId);
    let settled = false;

    const mapSnap = (snap: Awaited<ReturnType<typeof getDoc>>): PendingAccessRequest | null => {
      if (!snap.exists()) return null;
      const d = snap.data() as Record<string, unknown>;
      const requestedClassId =
        typeof d.requestedClassId === 'string' ? d.requestedClassId : undefined;
      return {
        deviceId: String(d.deviceId || deviceId),
        label: String(d.label || ''),
        requestedClassId,
        requestedSubjectIds: parseSubjectIdsForClass(d.requestedSubjectIds, requestedClassId),
        userAgent: String(d.userAgent || ''),
        status: d.status === 'denied' ? 'denied' : 'pending',
        requestedAt: toIsoString(d.requestedAt),
      };
    };

    const fallbackTimer = window.setTimeout(async () => {
      if (settled) return;
      try {
        const snap = await getDoc(docRef);
        if (!settled) {
          settled = true;
          onChange(mapSnap(snap));
        }
      } catch (err) {
        if (!settled && onError) {
          settled = true;
          logFirestoreError(err, OperationType.GET, path);
          onError(err);
        }
      }
    }, 6000);

    const unsub = onSnapshot(
      docRef,
      (snap) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        onChange(mapSnap(snap));
      },
      (err) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (onError) {
          logFirestoreError(err, OperationType.GET, path);
          onError(err);
          return;
        }
        handleFirestoreError(err, OperationType.GET, path);
      }
    );

    return () => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  },

  async findPermittedDeviceByStudentUid(studentUid: string): Promise<PermittedDevice | null> {
    try {
      const snap = await getDocs(
        query(collection(db, 'permittedDevices'), where('studentUid', '==', studentUid))
      );
      if (snap.empty) return null;
      const list: PermittedDevice[] = snap.docs.map((d) => {
        const data = d.data();
        const permittedClassId =
          typeof data.permittedClassId === 'string' ? data.permittedClassId : undefined;
        return {
          deviceId: String(data.deviceId || d.id),
          label: String(data.label || ''),
          permittedClassId,
          permittedSubjectIds: parseSubjectIdsForClass(data.permittedSubjectIds, permittedClassId),
          approvedAt: toIsoString(data.approvedAt),
        };
      });
      list.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
      return (
        list.find((d) => d.permittedClassId && ALL_CLASS_IDS.includes(d.permittedClassId)) ||
        list[0]
      );
    } catch (err) {
      logFirestoreError(err, OperationType.LIST, 'permittedDevices');
      return null;
    }
  },

  async findAccessRequestByRequesterUid(
    requesterUid: string
  ): Promise<PendingAccessRequest | null> {
    try {
      const snap = await getDocs(
        query(collection(db, 'accessRequests'), where('requesterUid', '==', requesterUid))
      );
      if (snap.empty) return null;
      const list: PendingAccessRequest[] = snap.docs.map((d) => {
        const data = d.data();
        const requestedClassId =
          typeof data.requestedClassId === 'string' ? data.requestedClassId : undefined;
        return {
          deviceId: String(data.deviceId || d.id),
          label: String(data.label || ''),
          requestedClassId,
          requestedSubjectIds: parseSubjectIdsForClass(data.requestedSubjectIds, requestedClassId),
          userAgent: String(data.userAgent || ''),
          status: data.status === 'denied' ? 'denied' : 'pending',
          requestedAt: toIsoString(data.requestedAt),
        };
      });
      list.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      return list[0];
    } catch (err) {
      logFirestoreError(err, OperationType.LIST, 'accessRequests');
      return null;
    }
  },

  subscribePendingRequestsForTeacher(
    teacherUid: string,
    email: string | null | undefined,
    onChange: (requests: (PendingAccessRequest & { requesterUid?: string })[]) => void
  ): Unsubscribe {
    const path = 'accessRequests';
    const q =
      isAdminEmail(email)
        ? collection(db, 'accessRequests')
        : query(collection(db, 'accessRequests'), where('teacherUid', '==', teacherUid));

    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data();
            const requestedClassId =
              typeof data.requestedClassId === 'string' ? data.requestedClassId : undefined;
            return {
              deviceId: String(data.deviceId || d.id),
              requesterUid: String(data.requesterUid || ''),
              label: String(data.label || ''),
              requestedClassId,
              requestedSubjectIds: parseSubjectIdsForClass(
                data.requestedSubjectIds,
                requestedClassId
              ),
              userAgent: String(data.userAgent || ''),
              status: (data.status === 'denied' ? 'denied' : 'pending') as 'pending' | 'denied',
              requestedAt: toIsoString(data.requestedAt),
            };
          })
          .filter((r) => r.status === 'pending')
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
        onChange(list);
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          logFirestoreError(err, OperationType.LIST, path);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
  },

  subscribePermittedDevicesForTeacher(
    teacherUid: string,
    email: string | null | undefined,
    onChange: (devices: PermittedDevice[]) => void
  ): Unsubscribe {
    const path = 'permittedDevices';
    const q =
      isAdminEmail(email)
        ? collection(db, 'permittedDevices')
        : query(collection(db, 'permittedDevices'), where('teacherUid', '==', teacherUid));

    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data();
            const permittedClassId =
              typeof data.permittedClassId === 'string' ? data.permittedClassId : undefined;
            return {
              deviceId: String(data.deviceId || d.id),
              label: String(data.label || ''),
              permittedClassId,
              permittedSubjectIds: parseSubjectIdsForClass(
                data.permittedSubjectIds,
                permittedClassId
              ),
              approvedAt: toIsoString(data.approvedAt),
            };
          })
          .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
        onChange(list);
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          logFirestoreError(err, OperationType.LIST, path);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
  },

  subscribeSubjects(
    onChange: (subjects: SubjectItem[]) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const path = 'subjects';
    let settled = false;

    const mapSubjectsSnap = (snap: Awaited<ReturnType<typeof getDocs>>) => {
      if (snap.empty) {
        return DEFAULT_SUBJECTS;
      }
      const loaded = snap.docs.map((d) => {
        const item = d.data() as SubjectItem;
        if (item.id === 'philosophy' && !Array.isArray(item.allowedClasses)) {
          return { ...item, allowedClasses: ['class-11', 'class-12'] };
        }
        return item;
      });
      return sortSubjects(loaded);
    };

    const fallbackTimer = window.setTimeout(async () => {
      if (settled) return;
      try {
        const snap = await getDocs(collection(db, 'subjects'));
        if (!settled) {
          settled = true;
          onChange(mapSubjectsSnap(snap));
        }
      } catch (err) {
        if (!settled && onError) {
          settled = true;
          logFirestoreError(err, OperationType.LIST, path);
          onError(err);
        }
      }
    }, 7500);

    const unsub = onSnapshot(
      collection(db, 'subjects'),
      (snap) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        onChange(mapSubjectsSnap(snap));
      },
      (err) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (onError) {
          logFirestoreError(err, OperationType.LIST, path);
          onError(err);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  },

  subscribeChapters(
    onChange: (chapters: ChapterNote[]) => void,
    _permittedClassId?: string,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const path = 'chapters';
    let settled = false;

    const normalizeChapter = (raw: Record<string, unknown>, docId: string): ChapterNote => ({
      id: typeof raw.id === 'string' && raw.id ? raw.id : docId,
      subjectId: typeof raw.subjectId === 'string' ? raw.subjectId : 'bengali',
      classLevel: typeof raw.classLevel === 'string' && raw.classLevel ? raw.classLevel : 'all',
      chapterNumber: typeof raw.chapterNumber === 'number' ? raw.chapterNumber : Number(raw.chapterNumber) || 1,
      titleBn: typeof raw.titleBn === 'string' && raw.titleBn ? raw.titleBn : 'শিরোনামহীন অধ্যায়',
      titleEn: typeof raw.titleEn === 'string' ? raw.titleEn : '',
      summaryBn: typeof raw.summaryBn === 'string' ? raw.summaryBn : '',
      keyPoints: Array.isArray(raw.keyPoints)
        ? raw.keyPoints.filter((p): p is string => typeof p === 'string')
        : [],
      questions: Array.isArray(raw.questions) ? (raw.questions as ChapterNote['questions']) : [],
      pdfFileName: typeof raw.pdfFileName === 'string' ? raw.pdfFileName : 'notes.pdf',
      pdfFileSize: typeof raw.pdfFileSize === 'string' ? raw.pdfFileSize : undefined,
      pdfData: typeof raw.pdfData === 'string' ? raw.pdfData : undefined,
      pdfUrl: typeof raw.pdfUrl === 'string' ? raw.pdfUrl : undefined,
      isCustomUploaded: Boolean(raw.isCustomUploaded),
      uploadedAt: typeof raw.uploadedAt === 'string' ? raw.uploadedAt : '',
    });

    const mapChaptersSnap = (snap: Awaited<ReturnType<typeof getDocs>>) => {
      const list = snap.docs.map((d) =>
        normalizeChapter(d.data() as Record<string, unknown>, d.id)
      );
      list.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
      return list;
    };

    const fallbackTimer = window.setTimeout(async () => {
      if (settled) return;
      try {
        const snap = await getDocs(collection(db, 'chapters'));
        if (!settled) {
          settled = true;
          onChange(mapChaptersSnap(snap));
        }
      } catch (err) {
        if (!settled && onError) {
          settled = true;
          logFirestoreError(err, OperationType.LIST, path);
          onError(err);
        }
      }
    }, 7500);

    const unsub = onSnapshot(
      collection(db, 'chapters'),
      (snap) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        onChange(mapChaptersSnap(snap));
      },
      (err) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (onError) {
          logFirestoreError(err, OperationType.LIST, path);
          onError(err);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  },

  async setupTeacherPin(uid: string, deviceId: string, newPin: string): Promise<void> {
    const cleanPin = newPin.trim();
    if (cleanPin.length < 4) {
      throw new Error('নতুন পিন কমপক্ষে ৪ সংখ্যার হতে হবে।');
    }

    let existingPub;
    try {
      existingPub = await getDoc(doc(db, 'appConfig', 'public'));
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.GET, 'appConfig/public');
        throw new Error(READ_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.GET, 'appConfig/public');
    }

    if (existingPub.exists() && (existingPub.data() as AppPublicConfigDoc).hasPin) {
      throw new Error('ইতিমধ্যেই শিক্ষক পিন তৈরি করা হয়েছে। আগের পিন ছাড়া পরিবর্তন বা প্রবেশ করা যাবে না।');
    }

    const salt = generateSaltHex(16);
    const pinHash = await hashPinHex(cleanPin, salt);

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'appConfig', 'security'), {
        pinHash,
        pinSalt: salt,
        teacherUid: uid,
        teacherDeviceId: deviceId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'appConfig', 'public'), {
        hasPin: true,
        teacherLoggedIn: true,
        teacherDeviceId: deviceId,
        teacherUid: uid,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setCachedSecurityConfig(pinHash, salt);

      await ensureDefaultSubjectsSeeded(uid).catch(() => {});
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.WRITE, 'appConfig');
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.WRITE, 'appConfig');
    }
  },

  async loginTeacher(uid: string, deviceId: string, pin: string): Promise<void> {
    const cleanPin = pin.trim();
    let pubSnap;
    try {
      pubSnap = await getDoc(doc(db, 'appConfig', 'public'));
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.GET, 'appConfig/public');
        throw new Error(READ_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.GET, 'appConfig/public');
    }
    if (!pubSnap.exists() || !(pubSnap.data() as AppPublicConfigDoc).hasPin) {
      throw new Error('এখনও কোনো শিক্ষক পিন তৈরি করা হয়নি। প্রথমে নতুন পিন তৈরি করো।');
    }
    const pub = pubSnap.data() as AppPublicConfigDoc;

    if (pub.teacherLoggedIn && pub.teacherDeviceId && pub.teacherDeviceId !== deviceId) {
      throw new Error(
        'অন্য একটি ডিভাইস থেকে ইতিমধ্যেই শিক্ষক লগইন করা আছেন! একসাথে কেবল একজনই শিক্ষক হিসেবে লগইন করতে পারবে।'
      );
    }

    const valid = await verifyPin(cleanPin);
    if (!valid) {
      throw new Error('ভুল পিন কোড! তোমার সঠিক শিক্ষক পিন দিয়ে প্রবেশ করো।');
    }

    try {
      await updateDoc(doc(db, 'appConfig', 'public'), {
        hasPin: true,
        teacherLoggedIn: true,
        teacherDeviceId: deviceId,
        teacherUid: pub.teacherUid || uid,
        updatedAt: serverTimestamp(),
      });
      await ensureDefaultSubjectsSeeded(uid).catch(() => {});
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.UPDATE, 'appConfig/public');
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.UPDATE, 'appConfig/public');
    }
  },

  async turnOffTeacherMode(pin: string): Promise<void> {
    const cleanPin = pin.trim();
    let pubSnap;
    try {
      pubSnap = await getDoc(doc(db, 'appConfig', 'public'));
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.GET, 'appConfig/public');
        throw new Error(READ_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.GET, 'appConfig/public');
    }
    if (!pubSnap.exists() || !(pubSnap.data() as AppPublicConfigDoc).hasPin) {
      throw new Error('কোনো শিক্ষক পিন সেট করা নেই।');
    }

    const valid = await verifyPin(cleanPin);
    if (!valid) {
      throw new Error(
        'ভুল পিন কোড! আগের পিন নিশ্চিত করা ছাড়া কোনো ডিভাইস থেকে শিক্ষক মোড বন্ধ করা যাবে না।'
      );
    }

    try {
      await updateDoc(doc(db, 'appConfig', 'public'), {
        teacherLoggedIn: false,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.UPDATE, 'appConfig/public');
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.UPDATE, 'appConfig/public');
    }
  },

  async changeTeacherPin(previousPin: string, newPin: string): Promise<void> {
    const cleanPrev = previousPin.trim();
    const cleanNew = newPin.trim();

    if (cleanNew.length < 4) {
      throw new Error('নতুন পিন কমপক্ষে ৪ সংখ্যার হতে হবে।');
    }
    if (cleanNew === cleanPrev) {
      throw new Error('নতুন পিনটি তোমার আগের পিনের চেয়ে আলাদা হতে হবে।');
    }

    const valid = await verifyPin(cleanPrev);
    if (!valid) {
      throw new Error(
        'তোমার আগের পিনটি সঠিক নয়! পূর্ববর্তী পিন নিশ্চিত না করলে পিন পরিবর্তন করা যাবে না।'
      );
    }

    const newSalt = generateSaltHex(16);
    const newHash = await hashPinHex(cleanNew, newSalt);

    try {
      await updateDoc(doc(db, 'appConfig', 'security'), {
        pinHash: newHash,
        pinSalt: newSalt,
        updatedAt: serverTimestamp(),
      });
      setCachedSecurityConfig(newHash, newSalt);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.UPDATE, 'appConfig/security');
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.UPDATE, 'appConfig/security');
    }
  },

  async verifyActionPin(pin: string): Promise<void> {
    const valid = await verifyPin(pin.trim());
    if (!valid) {
      throw new Error('ভুল শিক্ষক পিন! সঠিক পিন দিয়ে নিশ্চিত করো।');
    }
  },

  async requestStudentAccess(
    deviceId: string,
    requesterUid: string,
    teacherUid: string,
    requestedClassId: string,
    label?: string,
    requestedSubjectIds?: string[]
  ): Promise<'approved' | 'pending'> {
    const cleanClassId = requestedClassId.trim();
    if (!ALL_CLASS_IDS.includes(cleanClassId)) {
      throw new Error('অনুগ্রহ করে তোমার সঠিক শ্রেণি নির্বাচন করো।');
    }

    const cleanSubjectIds = parseSubjectIdsForClass(requestedSubjectIds, cleanClassId);
    if (isSubjectChoiceClass(cleanClassId) && (!cleanSubjectIds || cleanSubjectIds.length === 0)) {
      throw new Error('একাদশ ও দ্বাদশ শ্রেণির জন্য অন্তত একটি বিষয় নির্বাচন করো।');
    }

    try {
      const permSnap = await getDoc(doc(db, 'permittedDevices', deviceId));
      if (permSnap.exists()) {
        const existingClass = permSnap.data().permittedClassId;
        if (typeof existingClass === 'string' && ALL_CLASS_IDS.includes(existingClass)) {
          return 'approved';
        }
      }
    } catch {
      // Ignore permission error on colliding deviceId and still proceed with request submission
    }

    const cleanLabel = (label?.trim() || getDefaultDeviceLabel()).slice(0, 100);
    const cleanUa = (navigator.userAgent || '').slice(0, 200);
    const path = `accessRequests/${deviceId}`;

    const requestPayload: Record<string, unknown> = {
      deviceId,
      requesterUid,
      teacherUid,
      label: cleanLabel,
      requestedClassId: cleanClassId,
      userAgent: cleanUa,
      status: 'pending',
      requestedAt: serverTimestamp(),
    };
    if (cleanSubjectIds) {
      requestPayload.requestedSubjectIds = cleanSubjectIds;
    }

    try {
      await setDoc(doc(db, 'accessRequests', deviceId), requestPayload);
      return 'pending';
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.WRITE, path);
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async respondToAccessRequest(
    teacherUid: string,
    targetDeviceId: string,
    action: 'approve' | 'deny' | 'revoke',
    pendingMeta?: {
      label?: string;
      requesterUid?: string;
      permittedClassId?: string;
      permittedSubjectIds?: string[];
    }
  ): Promise<void> {
    try {
      if (action === 'approve') {
        const reqRef = doc(db, 'accessRequests', targetDeviceId);
        let label = pendingMeta?.label;
        let studentUid = pendingMeta?.requesterUid;
        let permittedClassId = pendingMeta?.permittedClassId;
        let rawSubjectIds = pendingMeta?.permittedSubjectIds;

        if (!label || !studentUid || !permittedClassId || (isSubjectChoiceClass(permittedClassId) && !rawSubjectIds)) {
          const reqSnap = await getDoc(reqRef);
          if (reqSnap.exists()) {
            const data = reqSnap.data();
            label = label || String(data.label || '');
            studentUid = studentUid || String(data.requesterUid || '');
            permittedClassId =
              permittedClassId ||
              (typeof data.requestedClassId === 'string' ? data.requestedClassId : '');
            if (!rawSubjectIds && Array.isArray(data.requestedSubjectIds)) {
              rawSubjectIds = data.requestedSubjectIds;
            }
          }
        }

        if (!permittedClassId || !ALL_CLASS_IDS.includes(permittedClassId)) {
          throw new Error('শিক্ষার্থীকে অনুমতি দেওয়ার আগে একটি শ্রেণি নির্বাচন করো।');
        }

        const cleanSubjectIds = parseSubjectIdsForClass(rawSubjectIds, permittedClassId);
        if (isSubjectChoiceClass(permittedClassId) && (!cleanSubjectIds || cleanSubjectIds.length === 0)) {
          throw new Error('একাদশ ও দ্বাদশ শ্রেণির শিক্ষার্থীর জন্য অন্তত একটি বিষয় নির্বাচন করো।');
        }

        const permittedPayload: Record<string, unknown> = {
          deviceId: targetDeviceId,
          studentUid: studentUid || teacherUid,
          teacherUid,
          label: (label || `শিক্ষার্থী ডিভাইস (${targetDeviceId.slice(0, 6)})`).slice(0, 100),
          permittedClassId,
          approvedAt: serverTimestamp(),
        };
        if (cleanSubjectIds) {
          permittedPayload.permittedSubjectIds = cleanSubjectIds;
        }

        const batch = writeBatch(db);
        batch.set(doc(db, 'permittedDevices', targetDeviceId), permittedPayload);
        batch.delete(reqRef);
        await batch.commit();
        return;
      }

      if (action === 'deny') {
        const reqRef = doc(db, 'accessRequests', targetDeviceId);
        const reqSnap = await getDoc(reqRef);
        if (reqSnap.exists()) {
          const reqData = reqSnap.data();
          if (typeof reqData.requestedClassId === 'string' && ALL_CLASS_IDS.includes(reqData.requestedClassId)) {
            await updateDoc(reqRef, {
              status: 'denied',
            });
          } else {
            await deleteDoc(reqRef);
          }
        }
        return;
      }

      if (action === 'revoke') {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'permittedDevices', targetDeviceId));
        batch.delete(doc(db, 'accessRequests', targetDeviceId));
        await batch.commit();
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('শ্রেণি নির্বাচন করো') || err.message.includes('বিষয় নির্বাচন করো'))
      ) {
        throw err;
      }
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.WRITE, `accessRequests/${targetDeviceId}`);
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.WRITE, `accessRequests/${targetDeviceId}`);
    }
  },

  async updatePermittedDeviceAccess(
    targetDeviceId: string,
    newClassId: string,
    newSubjectIds?: string[]
  ): Promise<void> {
    const cleanClassId = newClassId.trim();
    if (!ALL_CLASS_IDS.includes(cleanClassId)) {
      throw new Error('অকার্যকর শ্রেণি নির্বাচিত হয়েছে।');
    }
    const cleanSubjectIds = parseSubjectIdsForClass(newSubjectIds, cleanClassId);
    if (isSubjectChoiceClass(cleanClassId) && (!cleanSubjectIds || cleanSubjectIds.length === 0)) {
      throw new Error('একাদশ ও দ্বাদশ শ্রেণির জন্য অন্তত একটি বিষয় নির্বাচন করো।');
    }

    const path = `permittedDevices/${targetDeviceId}`;
    try {
      await updateDoc(doc(db, 'permittedDevices', targetDeviceId), {
        permittedClassId: cleanClassId,
        permittedSubjectIds: cleanSubjectIds ?? deleteField(),
        approvedAt: serverTimestamp(),
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.UPDATE, path);
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  async saveSubject(
    teacherUid: string,
    subject: SubjectItem,
    classId: string
  ): Promise<SubjectItem> {
    const existingList = await ensureDefaultSubjectsSeeded(teacherUid, true);
    const classesToAdd = classId === 'all' ? [...ALL_CLASS_IDS] : [classId];
    const cleanNameBn = subject.nameBn.trim().toLowerCase();
    const existing = existingList.find(
      (s) => s.id === subject.id || s.nameBn.trim().toLowerCase() === cleanNameBn
    );

    let finalSubject: SubjectItem;
    if (existing) {
      const existingAllowed = Array.isArray(existing.allowedClasses)
        ? existing.allowedClasses
        : existing.id === 'philosophy'
        ? ['class-11', 'class-12']
        : [...ALL_CLASS_IDS];
      const mergedAllowed = Array.from(new Set([...existingAllowed, ...classesToAdd]));
      finalSubject = {
        ...existing,
        ...subject,
        id: existing.id,
        allowedClasses: mergedAllowed,
      };
    } else {
      finalSubject = {
        ...subject,
        allowedClasses: Array.isArray(subject.allowedClasses)
          ? subject.allowedClasses
          : classesToAdd,
      };
    }

    try {
      await setDoc(
        doc(db, 'subjects', finalSubject.id),
        buildFirestoreSubjectPayload(finalSubject, teacherUid)
      );
      return finalSubject;
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.WRITE, `subjects/${finalSubject.id}`);
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.WRITE, `subjects/${finalSubject.id}`);
    }
  },

  async deleteSubject(
    teacherUid: string,
    subjectId: string,
    classId: string
  ): Promise<void> {
    const existingList = await ensureDefaultSubjectsSeeded(teacherUid, true);
    const existing = existingList.find((s) => s.id === subjectId);
    if (!existing) return;

    try {
      const chaptersSnap = await getDocs(
        query(collection(db, 'chapters'), where('subjectId', '==', subjectId))
      );

      if (!classId || classId === 'all') {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'subjects', subjectId));
        chaptersSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        return;
      }

      const currentAllowed = Array.isArray(existing.allowedClasses)
        ? existing.allowedClasses
        : existing.id === 'philosophy'
        ? ['class-11', 'class-12']
        : [...ALL_CLASS_IDS];
      const remaining = currentAllowed.filter((c) => c !== classId);

      const batch = writeBatch(db);
      if (remaining.length === 0) {
        batch.delete(doc(db, 'subjects', subjectId));
        chaptersSnap.docs.forEach((d) => batch.delete(d.ref));
      } else {
        batch.set(
          doc(db, 'subjects', subjectId),
          buildFirestoreSubjectPayload(
            {
              ...existing,
              allowedClasses: remaining,
            },
            teacherUid
          )
        );
        chaptersSnap.docs.forEach((d) => {
          if ((d.data() as ChapterNote).classLevel === classId) {
            batch.delete(d.ref);
          }
        });
      }
      await batch.commit();
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.WRITE, `subjects/${subjectId}`);
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.WRITE, `subjects/${subjectId}`);
    }
  },

  async saveChapter(
    teacherUid: string,
    pin: string,
    chapter: ChapterNote
  ): Promise<void> {
    const valid = await verifyPin(pin.trim());
    if (!valid) {
      throw new Error('ভুল শিক্ষক পিন! নোটস সংরক্ষণ করা যায়নি।');
    }

    if (chapter.pdfData && chapter.pdfData.length > 850000) {
      throw new Error(
        'PDF ফাইলটি একটু বড় (প্রায় 600 KB-এর বেশি)। অনুগ্রহ করে কমপ্রেস্‌ড বা ছোট PDF ফাইল আপলোড করো।'
      );
    }

    const cleanTitleBn = truncateUtf8(chapter.titleBn.trim(), 190) || 'শিরোনামহীন অধ্যায়';
    const cleanTitleEn = truncateUtf8((chapter.titleEn || chapter.titleBn).trim(), 190) || cleanTitleBn;
    const cleanSummaryBn = truncateUtf8(chapter.summaryBn || '', 19500);
    const cleanPdfFileName = truncatePdfFileNameUtf8(chapter.pdfFileName || 'notes.pdf', 190);
    const cleanPdfFileSize = truncateUtf8(chapter.pdfFileSize || '420 KB', 36);

    const payload: Record<string, unknown> = {
      id: chapter.id,
      subjectId: chapter.subjectId,
      classLevel: chapter.classLevel || 'all',
      chapterNumber: chapter.chapterNumber,
      titleBn: cleanTitleBn,
      titleEn: cleanTitleEn,
      summaryBn: cleanSummaryBn,
      keyPoints: chapter.keyPoints,
      questions: chapter.questions,
      pdfFileName: cleanPdfFileName,
      pdfFileSize: cleanPdfFileSize,
      isCustomUploaded: Boolean(chapter.isCustomUploaded),
      uploadedAt: chapter.uploadedAt,
      teacherUid,
    };
    if (chapter.pdfData) {
      payload.pdfData = chapter.pdfData;
    }
    if (chapter.pdfUrl) {
      payload.pdfUrl = truncateUtf8(chapter.pdfUrl, 480);
    }

    try {
      await setDoc(doc(db, 'chapters', chapter.id), payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (msg.includes('resource-exhausted') || msg.includes('quota')) {
        throw new Error(
          'আজকের জন্য Firestore ফ্রি রাইট কোটা শেষ হয়ে গেছে। আগামীকাল কোটা রিসেট হলে আবার নোটস ও PDF প্রকাশ করতে পারবে।'
        );
      }
      handleFirestoreError(err, OperationType.WRITE, `chapters/${chapter.id}`);
    }
  },

  async deleteChapter(pin: string, chapterId: string): Promise<void> {
    const valid = await verifyPin(pin.trim());
    if (!valid) {
      throw new Error('ভুল শিক্ষক পিন! নোটস মুছে ফেলা যায়নি।');
    }

    try {
      await deleteDoc(doc(db, 'chapters', chapterId));
    } catch (err) {
      if (isQuotaExceededError(err)) {
        logFirestoreError(err, OperationType.DELETE, `chapters/${chapterId}`);
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.DELETE, `chapters/${chapterId}`);
    }
  },

  async savePdfBytesToCloud(
    pdfId: string,
    fileName: string,
    bytes: Uint8Array,
    teacherUid: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!pdfId || !teacherUid || bytes.byteLength <= 0) {
      throw new Error('PDF ফাইলের তথ্য অসম্পূর্ণ।');
    }
    if (bytes.byteLength > FIRESTORE_PDF_MAX_BYTES) {
      throw new Error('PDF ফাইলটি ২৫ MB-এর বেশি হওয়ায় ক্লাউডে সংরক্ষণ করা যাবে না।');
    }
    if (!hasPdfMagicHeader(bytes)) {
      throw new Error('ফাইলটি সঠিক PDF ফরম্যাটে নেই।');
    }
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const totalChunks = Math.ceil(bytes.byteLength / FIRESTORE_PDF_CHUNK_BYTES);
    if (totalChunks < 1 || totalChunks > FIRESTORE_MAX_CHUNKS) {
      throw new Error('PDF ফাইলটি ২৫ MB সীমা অতিক্রম করেছে।');
    }

    const cleanFileName = truncatePdfFileNameUtf8(fileName, 190);
    const metaPath = `pdfFiles/${pdfId}`;

    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const writeWithRetry = async (fn: () => Promise<void>) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        try {
          await fn();
          return;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
          if (
            msg.includes('permission') ||
            msg.includes('insufficient') ||
            msg.includes('resource-exhausted') ||
            msg.includes('quota')
          ) {
            throw err;
          }
          if (attempt < 2) {
            await sleep(300 * (attempt + 1));
          }
        }
      }
      throw lastErr;
    };

    try {
      await writeWithRetry(() =>
        setDoc(doc(db, 'pdfFiles', pdfId), {
          id: pdfId,
          fileName: cleanFileName,
          totalSize: bytes.byteLength,
          totalChunks,
          teacherUid,
          uploadedAt: serverTimestamp(),
        })
      );

      let completedChunks = 0;
      const WRITE_BATCH_SIZE = 4;
      for (let startIdx = 0; startIdx < totalChunks; startIdx += WRITE_BATCH_SIZE) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const batchIndices = Array.from(
          { length: Math.min(WRITE_BATCH_SIZE, totalChunks - startIdx) },
          (_, offset) => startIdx + offset
        );
        await Promise.all(
          batchIndices.map(async (idx) => {
            const start = idx * FIRESTORE_PDF_CHUNK_BYTES;
            const end = Math.min(start + FIRESTORE_PDF_CHUNK_BYTES, bytes.byteLength);
            const slice = bytes.subarray(start, end);
            const b64 = bytesToBase64(slice);
            await writeWithRetry(() =>
              setDoc(doc(db, 'pdfFiles', pdfId, 'chunks', String(idx)), {
                pdfId,
                chunkIndex: idx,
                data: b64,
                teacherUid,
              })
            );
            completedChunks += 1;
            if (!signal?.aborted) {
              onProgress?.(Math.round((completedChunks / totalChunks) * 100));
            }
          })
        );
      }
      markPdfVerifiedLocally(pdfId);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (isQuotaExceededError(err)) {
        throw new Error(WRITE_QUOTA_ERROR_MESSAGE);
      }
      handleFirestoreError(err, OperationType.WRITE, metaPath);
    }
  },

  async savePdfChunks(
    pdfId: string,
    file: File,
    teacherUid: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (file.size > FIRESTORE_PDF_MAX_BYTES) return;
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const buf = await file.arrayBuffer();
    await firestoreService.savePdfBytesToCloud(
      pdfId,
      file.name,
      new Uint8Array(buf),
      teacherUid,
      onProgress,
      signal
    );
  },

  isPdfVerifiedLocally(pdfId: string): boolean {
    return isPdfVerifiedLocally(pdfId);
  },

  async isPdfCompleteInCloud(pdfId: string): Promise<boolean> {
    if (!pdfId) return false;
    if (isPdfVerifiedLocally(pdfId)) {
      return true;
    }
    try {
      const metaSnap = await getDoc(doc(db, 'pdfFiles', pdfId));
      if (!metaSnap.exists()) return false;
      const meta = metaSnap.data() as { totalChunks?: number };
      const totalChunks = Number(meta.totalChunks || 0);
      if (!Number.isFinite(totalChunks) || totalChunks <= 0 || totalChunks > FIRESTORE_MAX_CHUNKS) {
        return false;
      }

      const boundaryIndices = totalChunks > 1 ? [0, totalChunks - 1] : [0];
      const snaps = await Promise.all(
        boundaryIndices.map((idx) => getDoc(doc(db, 'pdfFiles', pdfId, 'chunks', String(idx))))
      );
      for (const snap of snaps) {
        if (!snap.exists()) return false;
        const chunkData = (snap.data() as { data?: string }).data;
        if (typeof chunkData !== 'string' || !chunkData) return false;
      }

      markPdfVerifiedLocally(pdfId);
      return true;
    } catch (err) {
      if (isQuotaExceededError(err)) {
        throw err;
      }
      return false;
    }
  },

  async loadPdfBytesDetailed(
    pdfId: string,
    onProgress?: (percent: number) => void
  ): Promise<
    | { status: 'ok'; bytes: Uint8Array }
    | { status: 'missing' }
    | { status: 'error'; error: unknown }
  > {
    const metaPath = `pdfFiles/${pdfId}`;
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

    const getDocWithRetry = async (ref: ReturnType<typeof doc>) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await getDoc(ref);
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
          if (msg.includes('permission') || msg.includes('insufficient') || isQuotaExceededError(err)) {
            throw err;
          }
          if (attempt < 2) {
            await sleep(250 * (attempt + 1));
          }
        }
      }
      throw lastErr;
    };

    try {
      const metaSnap = await getDocWithRetry(doc(db, 'pdfFiles', pdfId));
      if (!metaSnap.exists()) return { status: 'missing' };

      const meta = metaSnap.data() as { totalChunks?: number; totalSize?: number };
      const totalChunks = Number(meta.totalChunks || 0);
      if (!Number.isFinite(totalChunks) || totalChunks <= 0 || totalChunks > FIRESTORE_MAX_CHUNKS) {
        return { status: 'missing' };
      }

      const chunkSnaps: Awaited<ReturnType<typeof getDoc>>[] = new Array(totalChunks);
      let loadedChunks = 0;
      const BATCH_SIZE = 6;
      for (let start = 0; start < totalChunks; start += BATCH_SIZE) {
        const batchIndices = Array.from(
          { length: Math.min(BATCH_SIZE, totalChunks - start) },
          (_, offset) => start + offset
        );
        const batchSnaps = await Promise.all(
          batchIndices.map(async (idx) => {
            const snap = await getDocWithRetry(doc(db, 'pdfFiles', pdfId, 'chunks', String(idx)));
            loadedChunks += 1;
            onProgress?.(Math.round((loadedChunks / totalChunks) * 100));
            return snap;
          })
        );
        batchIndices.forEach((idx, i) => {
          chunkSnaps[idx] = batchSnaps[i];
        });
      }

      const parts: Uint8Array[] = [];
      let totalLen = 0;
      for (const snap of chunkSnaps) {
        if (!snap || !snap.exists()) return { status: 'missing' };
        const chunkData = (snap.data() as { data?: string }).data;
        if (typeof chunkData !== 'string' || !chunkData) return { status: 'missing' };
        const bytes = base64ToBytes(chunkData);
        parts.push(bytes);
        totalLen += bytes.length;
      }

      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of parts) {
        merged.set(part, offset);
        offset += part.length;
      }
      if (!hasPdfMagicHeader(merged)) {
        return { status: 'missing' };
      }
      markPdfVerifiedLocally(pdfId);
      return { status: 'ok', bytes: merged };
    } catch (err) {
      logFirestoreError(err, OperationType.GET, metaPath);
      return { status: 'error', error: err };
    }
  },

  async loadPdfBytes(pdfId: string): Promise<Uint8Array | null> {
    const res = await firestoreService.loadPdfBytesDetailed(pdfId);
    return res.status === 'ok' ? res.bytes : null;
  },

  async deletePdfChunks(pdfId: string): Promise<void> {
    if (!pdfId) return;
    unmarkPdfVerifiedLocally(pdfId);
    try {
      const metaSnap = await getDoc(doc(db, 'pdfFiles', pdfId));
      if (metaSnap.exists()) {
        const totalChunks = Number((metaSnap.data() as { totalChunks?: number }).totalChunks || 0);
        for (let idx = 0; idx < totalChunks; idx++) {
          await deleteDoc(doc(db, 'pdfFiles', pdfId, 'chunks', String(idx))).catch(() => {});
        }
        await deleteDoc(doc(db, 'pdfFiles', pdfId));
      }
    } catch {
      // Best-effort cleanup
    }
  },
};
