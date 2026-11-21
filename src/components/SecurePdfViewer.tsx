import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  FileText,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { auth } from '../services/firebase';
import {
  FIRESTORE_PDF_MAX_BYTES,
  firestoreService,
  isQuotaExceededError,
} from '../services/firestoreService';
import { storageService } from '../services/storage';

pdfjsLib.GlobalWorkerOptions.workerSrc = import.meta.env.DEV
  ? '/pdf.worker.min.mjs'
  : pdfWorkerUrl;

const PDFJS_ASSET_OPTS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
};

interface SecurePdfViewerProps {
  pdfData?: string;
  pdfUrl?: string;
  fileName?: string;
  isProtected: boolean;
  canSyncCloud?: boolean;
  onSwitchToNotes?: () => void;
  onReuploadPdf?: () => void;
}

interface PdfPageSlideProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  shouldRender: boolean;
  containerWidth: number;
  zoom: number;
  rotation: number;
  slideRef: (el: HTMLDivElement | null) => void;
  canvasWrapperRef: (el: HTMLDivElement | null) => void;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3;

function base64DataUriToUint8Array(dataUri: string): Uint8Array {
  const rawPart = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
  const cleaned = rawPart.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    cleaned.length % 4 === 0 ? cleaned : cleaned.padEnd(cleaned.length + (4 - (cleaned.length % 4)), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hasPdfHeader(bytes: Uint8Array): boolean {
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

const MAX_CANVAS_PIXELS = 12_000_000;
const MAX_CANVAS_SIDE = 4096;

const PdfPageSlide: React.FC<PdfPageSlideProps> = ({
  pdfDoc,
  pageNum,
  shouldRender,
  containerWidth,
  zoom,
  rotation,
  slideRef,
  canvasWrapperRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!shouldRender) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    setRendering(true);
    setPageError(false);

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const targetRotation = (page.rotate + rotation) % 360;
        const baseViewport = page.getViewport({ scale: 1, rotation: targetRotation });
        const fitScale = Math.min(2.2, Math.max(0.45, containerWidth / baseViewport.width));
        const effectiveScale = fitScale * zoom;
        const viewport = page.getViewport({ scale: effectiveScale, rotation: targetRotation });

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const safeSideScale = Math.min(
          dpr,
          MAX_CANVAS_SIDE / Math.max(1, viewport.width),
          MAX_CANVAS_SIDE / Math.max(1, viewport.height)
        );
        const safeAreaScale = Math.sqrt(
          MAX_CANVAS_PIXELS / Math.max(1, viewport.width * viewport.height)
        );
        const outputScale = Math.max(0.5, Math.min(safeSideScale, safeAreaScale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`;
        canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`;

        const transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform,
        });
        await renderTask.promise;
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : '';
        if (!cancelled && name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
          setPageError(true);
        }
      } finally {
        if (!cancelled) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum, shouldRender, containerWidth, zoom, rotation, retryCount]);

  return (
    <div
      ref={slideRef}
      data-page={pageNum}
      className="w-full h-full shrink-0 snap-center overflow-auto px-2 sm:px-6 py-3 flex items-start justify-center"
    >
      {shouldRender ? (
        pageError ? (
          <div className="my-auto w-full max-w-md rounded-xl bg-white border border-rose-200 p-5 text-center space-y-2.5 shadow-sm">
            <p className="text-xs font-semibold text-rose-700">
              পৃষ্ঠা {pageNum} দেখাতে সমস্যা হয়েছে।
            </p>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              আবার চেষ্টা করো
            </button>
          </div>
        ) : (
          <div ref={canvasWrapperRef} className="relative inline-block my-auto transition-transform duration-75">
            <canvas
              ref={canvasRef}
              className="block bg-white shadow-lg rounded-lg pointer-events-none select-none"
            />
            {rendering && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-lg pointer-events-none">
                <Loader2 className="w-5 h-5 animate-spin text-slate-700" />
              </div>
            )}
          </div>
        )
      ) : (
        <div className="my-auto w-full max-w-xl h-72 rounded-xl bg-white/70 border border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
          <span className="text-xs font-semibold">পৃষ্ঠা {pageNum}</span>
        </div>
      )}
    </div>
  );
};

export const SecurePdfViewer: React.FC<SecurePdfViewerProps> = ({
  pdfData,
  pdfUrl,
  fileName,
  isProtected,
  canSyncCloud = false,
  onSwitchToNotes,
  onReuploadPdf,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasWrapperRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);
  const programmaticScrollUntilRef = useRef<number>(0);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [containerWidth, setContainerWidth] = useState(680);
  const [loading, setLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [error, setError] = useState('');
  const [isMissingFile, setIsMissingFile] = useState(false);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pageNumberRef = useRef(pageNumber);
  pageNumberRef.current = pageNumber;
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;
  const canSyncCloudRef = useRef(canSyncCloud);
  canSyncCloudRef.current = canSyncCloud;

  // Measure horizontal stage width so each page fits cleanly on mobile and desktop
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) {
        const padding = el.clientWidth >= 640 ? 48 : 20;
        setContainerWidth(Math.max(260, el.clientWidth - padding));
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, pdfDoc]);

  // Load PDF document from inline base64 data or range-streamed URL / Firestore chunks
  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    setLoading(true);
    setDownloadProgress(null);
    setError('');
    setIsMissingFile(false);
    setPdfDoc(null);
    setNumPages(0);
    setPageNumber(1);
    setZoom(1);
    setRotation(0);
    pageRefs.current = {};
    canvasWrapperRefs.current = {};

    (async () => {
      try {
        if (pdfDocRef.current) {
          await pdfDocRef.current.cleanup().catch(() => {});
          pdfDocRef.current = null;
        }
        if (loadingTaskRef.current) {
          await loadingTaskRef.current.destroy().catch(() => {});
          loadingTaskRef.current = null;
        }

        const openDocFromBytes = async (rawBytes: Uint8Array) => {
          // Pass a copy so PDF.js worker transfer never mutates/detaches our source buffer
          const task = pdfjsLib.getDocument({
            data: rawBytes.slice(),
            ...PDFJS_ASSET_OPTS,
          });
          loadingTask = task;
          loadingTaskRef.current = task;
          return task.promise;
        };

        const healCloudCopyIfNeeded = (pdfId: string, bytes: Uint8Array) => {
          const currentUser = auth.currentUser;
          if (
            !canSyncCloudRef.current ||
            !currentUser ||
            !pdfId ||
            bytes.byteLength <= 0 ||
            bytes.byteLength > FIRESTORE_PDF_MAX_BYTES
          ) {
            return;
          }
          firestoreService
            .isPdfCompleteInCloud(pdfId)
            .then((complete) => {
              if (!complete) {
                return firestoreService.savePdfBytesToCloud(
                  pdfId,
                  fileNameRef.current || 'notes.pdf',
                  bytes,
                  currentUser.uid
                );
              }
            })
            .catch(() => {
              // Best-effort silent background repair
            });
        };

        let doc: pdfjsLib.PDFDocumentProxy | null = null;

        if (pdfData && pdfData.trim().length > 0) {
          try {
            const bytes = base64DataUriToUint8Array(pdfData.trim());
            if (bytes.byteLength > 0) {
              doc = await openDocFromBytes(bytes);
            }
          } catch {
            doc = null;
          }
        }

        if (!doc && pdfUrl) {
          const apiMatch = pdfUrl.match(/\/api\/pdfs\/([a-zA-Z0-9_-]+)/);
          const pdfId = apiMatch ? apiMatch[1] : '';
          const fetchUrl = pdfId ? `/api/pdfs/${pdfId}` : pdfUrl;

          // 1. Try local IndexedDB cache first (instant & survives server restarts)
          if (pdfId) {
            const cachedBytes = await storageService.getCachedPdf(pdfId);
            if (cancelled) return;
            if (cachedBytes && cachedBytes.byteLength > 0 && hasPdfHeader(cachedBytes)) {
              try {
                doc = await openDocFromBytes(cachedBytes);
                healCloudCopyIfNeeded(pdfId, cachedBytes);
              } catch {
                doc = null;
                await storageService.deleteCachedPdf(pdfId);
              }
            } else if (cachedBytes) {
              await storageService.deleteCachedPdf(pdfId);
            }
          }

          // 2. Try server URL if not yet loaded
          if (!doc) {
            let serverSize = 0;
            let tryGet = true;
            try {
              const headRes = await fetch(fetchUrl, { method: 'HEAD', cache: 'no-store' });
              if (headRes.status === 404) {
                tryGet = false;
              } else if (headRes.ok) {
                const ct = (headRes.headers.get('content-type') || '').toLowerCase();
                if (ct.includes('text/html') || ct.includes('application/json')) {
                  tryGet = false;
                } else {
                  serverSize = Number(headRes.headers.get('content-length') || 0);
                }
              }
            } catch {
              // Some proxies/WebViews block HEAD; fall through to GET
              tryGet = true;
            }

            if (cancelled) return;

            if (tryGet) {
              const STREAM_THRESHOLD = 50 * 1024 * 1024;
              if (serverSize > STREAM_THRESHOLD) {
                try {
                  const streamTask = pdfjsLib.getDocument({
                    url: fetchUrl,
                    rangeChunkSize: 65536,
                    disableAutoFetch: true,
                    disableStream: false,
                    ...PDFJS_ASSET_OPTS,
                  });
                  loadingTask = streamTask;
                  loadingTaskRef.current = streamTask;
                  doc = await streamTask.promise;
                } catch {
                  doc = null;
                }
              }

              if (!doc && serverSize <= 100 * 1024 * 1024) {
                try {
                  const res = await fetch(fetchUrl, { cache: 'no-store' });
                  const ct = (res.headers.get('content-type') || '').toLowerCase();
                  if (res.ok && !ct.includes('text/html') && !ct.includes('application/json')) {
                    const buf = await res.arrayBuffer();
                    if (cancelled) return;
                    const bytes = new Uint8Array(buf);
                    if (bytes.byteLength > 0 && hasPdfHeader(bytes)) {
                      if (pdfId) {
                        storageService.saveCachedPdf(pdfId, bytes).catch(() => {});
                      }
                      doc = await openDocFromBytes(bytes);
                      if (pdfId) {
                        healCloudCopyIfNeeded(pdfId, bytes);
                      }
                    }
                  }
                } catch {
                  doc = null;
                }
              }
            }
          }

          // 3. Fall back to persistent Firestore chunk storage
          let cloudError: unknown = null;
          if (!doc && pdfId) {
            const cloudRes = await firestoreService.loadPdfBytesDetailed(pdfId, (pct) => {
              if (!cancelled) {
                setDownloadProgress(pct);
              }
            });
            if (cancelled) return;
            if (cloudRes.status === 'ok' && cloudRes.bytes.byteLength > 0) {
              storageService.saveCachedPdf(pdfId, cloudRes.bytes).catch(() => {});
              doc = await openDocFromBytes(cloudRes.bytes);
            } else if (cloudRes.status === 'error') {
              cloudError = cloudRes.error;
            }
          }

          if (!doc) {
            if (cancelled) return;
            if (cloudError) {
              setIsMissingFile(false);
              setError(
                isQuotaExceededError(cloudError)
                  ? 'আজকের জন্য Firestore ফ্রি রিড কোটা শেষ হয়ে গেছে। আগামীকাল কোটা রিসেট হলে PDF ফাইলটি খুলতে পারবে।'
                  : 'PDF ফাইলটি লোড করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করো।'
              );
            } else {
              setIsMissingFile(true);
              setError(
                'এই PDF ফাইলটি সার্ভারে আর পাওয়া যাচ্ছে না। অনুগ্রহ করে নিচ থেকে সারাংশ পড়ো অথবা শিক্ষককে PDF-টি পুনরায় আপলোড করতে বলো।'
              );
            }
            setLoading(false);
            return;
          }
        } else if (!doc) {
          throw new Error('কোনো PDF উৎস পাওয়া যায়নি।');
        }

        if (!doc) return;
        if (cancelled) {
          await doc.cleanup().catch(() => {});
          return;
        }
        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNumber(1);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          const isNotFound =
            msg.includes('404') ||
            msg.includes('MissingPDFException') ||
            msg.includes('Unexpected server response');
          if (isNotFound) {
            setIsMissingFile(true);
            setError(
              'এই PDF ফাইলটি সার্ভারে আর পাওয়া যাচ্ছে না। অনুগ্রহ করে নিচ থেকে সারাংশ পড়ো অথবা শিক্ষককে PDF-টি পুনরায় আপলোড করতে বলো।'
            );
          } else {
            console.error('PDF load error:', err);
            setError('PDF ফাইলটি লোড করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করো।');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setDownloadProgress(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDocRef.current) {
        pdfDocRef.current.cleanup().catch(() => {});
        pdfDocRef.current = null;
      }
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
      loadingTaskRef.current = null;
      setPdfDoc(null);
    };
  }, [pdfData, pdfUrl, reloadNonce]);

  // Manual two-finger pinch-to-zoom (touch) + trackpad Ctrl/Meta wheel zoom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !pdfDoc) return;

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pendingTargetZoom = 1;
    let isPinching = false;

    const getTouchDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const clearPreviewTransform = () => {
      Object.values(canvasWrapperRefs.current).forEach((wrapper) => {
        if (wrapper) {
          wrapper.style.transform = '';
          wrapper.style.transformOrigin = '';
        }
      });
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinching = true;
        pinchStartDist = Math.max(1, getTouchDistance(e.touches[0], e.touches[1]));
        pinchStartZoom = zoomRef.current;
        pendingTargetZoom = pinchStartZoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPinching || e.touches.length !== 2) return;
      e.preventDefault();
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      const ratio = dist / pinchStartDist;
      const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(pinchStartZoom * ratio).toFixed(2)));
      pendingTargetZoom = targetZoom;

      const activeWrapper = canvasWrapperRefs.current[pageNumberRef.current];
      if (activeWrapper && pinchStartZoom > 0) {
        const previewScale = targetZoom / pinchStartZoom;
        activeWrapper.style.transformOrigin = 'center center';
        activeWrapper.style.transform = `scale(${previewScale})`;
      }
    };

    const finishPinch = (e: TouchEvent) => {
      if (isPinching && e.touches.length < 2) {
        isPinching = false;
        clearPreviewTransform();
        setZoom((prev) => (Math.abs(prev - pendingTargetZoom) >= 0.02 ? pendingTargetZoom : prev));
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.004;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', finishPinch, { passive: true });
    container.addEventListener('touchcancel', finishPinch, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      clearPreviewTransform();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', finishPinch);
      container.removeEventListener('touchcancel', finishPinch);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [pdfDoc]);

  // Sync active page indicator as the user scrolls horizontally sideways
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || numPages <= 0) return;

    const handleScroll = () => {
      if (Date.now() < programmaticScrollUntilRef.current) return;
      const width = container.clientWidth;
      if (width <= 0) return;
      const estimatedPage = Math.round(container.scrollLeft / width) + 1;
      const clamped = Math.min(numPages, Math.max(1, estimatedPage));
      setPageNumber((prev) => (prev === clamped ? prev : clamped));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [numPages]);

  const scrollToPage = useCallback(
    (targetPage: number) => {
      const clamped = Math.min(numPages, Math.max(1, targetPage));
      setPageNumber(clamped);
      const targetEl = pageRefs.current[clamped];
      if (targetEl) {
        programmaticScrollUntilRef.current = Date.now() + 450;
        targetEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    },
    [numPages]
  );

  // Keyboard Left/Right navigation for quick sideways paging
  useEffect(() => {
    if (numPages <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToPage(pageNumber + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToPage(pageNumber - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, pageNumber, scrollToPage]);

  return (
    <div
      className="flex-1 flex flex-col bg-slate-200/90 min-h-[55vh] overflow-hidden protected-content relative"
      onContextMenu={(e) => {
        if (isProtected) e.preventDefault();
      }}
    >
      {/* Toolbar: Sideways Pagination, Zoom & Rotate (no download/print buttons) */}
      <div className="px-3 py-2 bg-slate-800 text-white flex items-center justify-between gap-2 flex-wrap border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={pageNumber <= 1 || loading}
            onClick={() => scrollToPage(pageNumber - 1)}
            className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-xs font-semibold flex items-center gap-0.5 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">আগের পৃষ্ঠা</span>
          </button>

          <span className="text-xs font-mono px-2 py-1 rounded bg-slate-900 text-amber-300">
            {numPages > 0 ? `${pageNumber} / ${numPages}` : '—'}
          </span>

          <button
            type="button"
            disabled={pageNumber >= numPages || loading}
            onClick={() => scrollToPage(pageNumber + 1)}
            className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-xs font-semibold flex items-center gap-0.5 cursor-pointer"
          >
            <span className="hidden sm:inline">পরের পৃষ্ঠা</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {numPages > 1 && (
            <span className="hidden md:inline text-[11px] text-slate-300 ml-1">
              • পাশাপাশি স্ক্রল করো
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-700">
            <button
              type="button"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.2).toFixed(2)))}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              title="ছোট করো"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-300 px-1.5">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.2).toFixed(2)))}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              title="বড় করো"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            disabled={loading || !pdfDoc}
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className={`px-2 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-40 ${
              rotation !== 0
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
            title="পৃষ্ঠা ঘোরাও (৯০°)"
            aria-label="পৃষ্ঠা ঘোরাও"
          >
            <RotateCw className="w-3.5 h-3.5" />
            {rotation !== 0 && (
              <span className="text-[10px] font-mono">{rotation}°</span>
            )}
          </button>
        </div>
      </div>

      {/* Horizontal Sideways-Scrollable PDF Page Track */}
      <div className="relative flex-1 overflow-hidden flex">
        {loading ? (
          <div className="m-auto flex flex-col items-center gap-2 text-slate-600 py-12">
            <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
            <p className="text-xs font-semibold">
              {downloadProgress !== null
                ? `PDF পৃষ্ঠা লোড হচ্ছে... ${downloadProgress}%`
                : 'PDF পৃষ্ঠা লোড হচ্ছে...'}
            </p>
          </div>
        ) : error ? (
          <div className="m-auto bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-5 text-xs sm:text-sm font-semibold max-w-md text-center space-y-3 shadow-sm">
            <p className="leading-relaxed">{error}</p>
            {(isMissingFile || onSwitchToNotes) && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {!isMissingFile && (
                  <button
                    type="button"
                    onClick={() => setReloadNonce((n) => n + 1)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>আবার চেষ্টা করো</span>
                  </button>
                )}
                {onSwitchToNotes && (
                  <button
                    type="button"
                    onClick={onSwitchToNotes}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>সারাংশ পড়ো</span>
                  </button>
                )}
                {isMissingFile && onReuploadPdf && (
                  <button
                    type="button"
                    onClick={onReuploadPdf}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>পুনরায় PDF আপলোড করো</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : pdfDoc ? (
          <>
            <div
              ref={scrollContainerRef}
              className={`flex-1 h-full flex flex-row overflow-x-auto overflow-y-hidden scroll-smooth touch-pan-x touch-pan-y touch-pinch-zoom ${
                zoom <= 1.05 ? 'snap-x snap-mandatory' : ''
              }`}
            >
              {Array.from({ length: numPages }, (_, idx) => {
                const p = idx + 1;
                const shouldRender = Math.abs(p - pageNumber) <= 2;
                return (
                  <PdfPageSlide
                    key={p}
                    pdfDoc={pdfDoc}
                    pageNum={p}
                    shouldRender={shouldRender}
                    containerWidth={containerWidth}
                    zoom={zoom}
                    rotation={rotation}
                    slideRef={(el) => {
                      pageRefs.current[p] = el;
                    }}
                    canvasWrapperRef={(el) => {
                      canvasWrapperRefs.current[p] = el;
                    }}
                  />
                );
              })}
            </div>

            {numPages > 1 && pageNumber > 1 && (
              <button
                type="button"
                onClick={() => scrollToPage(pageNumber - 1)}
                aria-label="আগের পৃষ্ঠা"
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white shadow-lg absolute left-3 top-1/2 -translate-y-1/2 z-10 cursor-pointer transition-opacity"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {numPages > 1 && pageNumber < numPages && (
              <button
                type="button"
                onClick={() => scrollToPage(pageNumber + 1)}
                aria-label="পরের পৃষ্ঠা"
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white shadow-lg absolute right-3 top-1/2 -translate-y-1/2 z-10 cursor-pointer transition-opacity"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
