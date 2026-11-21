import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Download, 
  CheckCircle2, 
  BookOpen, 
  FileText, 
  HelpCircle, 
  Award, 
  ZoomIn, 
  ZoomOut,
  BookmarkCheck,
  BookmarkPlus,
  Edit3,
  Trash2,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { ChapterNote, ProgressStatus, SubjectItem } from '../types';
import { SecurePdfViewer } from './SecurePdfViewer';

interface NoteReaderModalProps {
  chapter: ChapterNote;
  subject?: SubjectItem;
  currentStatus: ProgressStatus;
  onUpdateStatus: (status: ProgressStatus) => void;
  onDownloadPDF: (chapter: ChapterNote) => void;
  isSavedOffline: boolean;
  onToggleSaveOffline: (chapter: ChapterNote) => void;
  onClose: () => void;
  isTeacherMode?: boolean;
  isTeacherDevice?: boolean;
  privacyCurtain?: React.ReactNode;
  toastOverlay?: React.ReactNode;
  onEditChapter?: (chapter: ChapterNote) => void;
  onDeleteChapter?: (chapter: ChapterNote) => void;
}

export const NoteReaderModal: React.FC<NoteReaderModalProps> = ({
  chapter,
  subject,
  currentStatus,
  onUpdateStatus,
  onDownloadPDF,
  isSavedOffline,
  onToggleSaveOffline,
  onClose,
  isTeacherMode,
  isTeacherDevice,
  privacyCurtain,
  toastOverlay,
  onEditChapter,
  onDeleteChapter,
}) => {
  const hasUploadedPdf = Boolean(chapter.pdfData || chapter.pdfUrl);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'notes' | 'pdf'>(hasUploadedPdf ? 'pdf' : 'notes');
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const modalRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleFsChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (viewMode !== 'pdf' && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [viewMode]);

  const handleToggleNativeFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      modalRootRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (direction === 'in' && zoomLevel < 1.35) {
      setZoomLevel((prev) => +(prev + 0.15).toFixed(2));
    } else if (direction === 'out' && zoomLevel > 0.85) {
      setZoomLevel((prev) => +(prev - 0.15).toFixed(2));
    }
  };

  const isPdfFullscreen = viewMode === 'pdf' && hasUploadedPdf;

  return (
    <div
      ref={modalRootRef}
      className={
        isPdfFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col w-screen h-[100dvh] overflow-hidden'
          : 'fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto'
      }
    >
      <div 
        className={
          isPdfFullscreen
            ? 'bg-slate-950 w-full h-full flex flex-col overflow-hidden'
            : 'bg-white rounded-2xl sm:rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden'
        }
        style={isPdfFullscreen ? undefined : { fontSize: `${zoomLevel * 100}%` }}
      >
        {/* Top Sticky Bar */}
        <div className="p-3 sm:p-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider block truncate">
                {subject?.nameBn || 'স্টাডি নোটস'} • অধ্যায় {chapter.chapterNumber}
              </span>
              <h2 className="text-xs sm:text-base font-bold text-white truncate">
                {chapter.titleBn}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Toggle if uploaded PDF exists */}
            {(chapter.pdfData || chapter.pdfUrl) && (
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs mr-1">
                <button
                  onClick={() => setViewMode('pdf')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    viewMode === 'pdf' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  আসল PDF
                </button>
                <button
                  onClick={() => setViewMode('notes')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    viewMode === 'notes' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  সারাংশ
                </button>
              </div>
            )}

            {/* Font Zoom Controls */}
            {viewMode === 'notes' && (
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button
                  onClick={() => handleZoom('out')}
                  disabled={zoomLevel <= 0.85}
                  className="p-1.5 text-slate-300 hover:text-white disabled:opacity-40"
                  title="ফন্ট সাইজ কমাও"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-400 px-1 font-mono">{Math.round(zoomLevel * 100)}%</span>
                <button
                  onClick={() => handleZoom('in')}
                  disabled={zoomLevel >= 1.35}
                  className="p-1.5 text-slate-300 hover:text-white disabled:opacity-40"
                  title="ফন্ট সাইজ বাড়াও"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Teacher Controls if in teacher mode */}
            {isTeacherMode && (
              <div className="flex items-center gap-1 border-r border-slate-700 pr-1.5 mr-0.5">
                {onEditChapter && (
                  <button
                    onClick={() => {
                      onEditChapter(chapter);
                      onClose();
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300"
                    title="নোটস সম্পাদনা করো"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDeleteChapter && (
                  <button
                    onClick={() => {
                      onDeleteChapter(chapter);
                      onClose();
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300"
                    title="নোটস মুছে ফেলো (শিক্ষক পিন প্রয়োজন)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Fullscreen toggle button when viewing PDF */}
            {isPdfFullscreen && (
              <button
                type="button"
                onClick={handleToggleNativeFullscreen}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
                title={isNativeFullscreen ? 'স্বাভাবিক পূর্ণ স্ক্রিন' : 'সম্পূর্ণ স্ক্রিন'}
              >
                {isNativeFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
              title="বন্ধ করো"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Automatic Completion Strip (hidden in full-screen PDF mode so PDF uses 100% height) */}
        {!isPdfFullscreen && (
          <div className="bg-emerald-50 px-3.5 py-2 border-b border-emerald-200/80 flex items-center justify-between text-xs text-emerald-900 shrink-0">
            <div className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>নোটসটি খোলার সাথে সাথেই তোমার পড়া সম্পন্ন হিসেবে যুক্ত হয়েছে!</span>
            </div>
            <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold font-mono shrink-0">
              সম্পন্ন ✓
            </span>
          </div>
        )}

        {/* Modal Body Content */}
        {isPdfFullscreen ? (
          /* Canvas-based Full-Screen Secure PDF Viewer (No browser download/print toolbar) */
          <SecurePdfViewer
            pdfData={chapter.pdfData}
            pdfUrl={chapter.pdfUrl}
            fileName={chapter.pdfFileName}
            isProtected={true}
            canSyncCloud={Boolean(isTeacherMode || isTeacherDevice)}
            onSwitchToNotes={() => setViewMode('notes')}
            onReuploadPdf={
              (isTeacherMode || isTeacherDevice) && onEditChapter
                ? () => {
                    onEditChapter(chapter);
                    onClose();
                  }
                : undefined
            }
          />
        ) : (
          /* Structured Text Reader Content */
          <div
            onContextMenu={(e) => e.preventDefault()}
            className="relative p-3.5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 leading-relaxed protected-content"
          >
            {/* Header Banner */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-amber-800 font-mono">
                  {chapter.pdfFileName}
                </span>
                {chapter.pdfFileSize && (
                  <span className="text-[10px] font-mono text-slate-500">
                    সাইজ: {chapter.pdfFileSize}
                  </span>
                )}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 mb-0.5">
                {chapter.titleBn}
              </h1>
              {chapter.titleEn && (
                <p className="text-xs text-slate-500 font-medium">
                  English Reference: {chapter.titleEn}
                </p>
              )}
            </div>

            {/* Section 1: Summary */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-200">
                <FileText className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  ১. অধ্যায়ের মূল কথা ও সারসংক্ষেপ
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200/70">
                {chapter.summaryBn}
              </p>
            </div>

            {/* Section 2: Key Revision Points */}
            {chapter.keyPoints && chapter.keyPoints.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-200">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    ২. তোমার পরীক্ষার জন্য মূল রিভিশন পয়েন্ট
                  </h3>
                </div>
                <ul className="space-y-2">
                  {chapter.keyPoints.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="flex-1">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Section 3: Questions */}
            {chapter.questions && chapter.questions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-200">
                  <HelpCircle className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    ৩. সম্ভাব্য প্রশ্ন ও উত্তর (পরীক্ষার জন্য)
                  </h3>
                </div>
                <div className="space-y-3">
                  {chapter.questions.map((q, idx) => (
                    <div key={q.id || idx} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex-1">
                          প্রশ্ন {idx + 1}: {q.question}
                        </h4>
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded-md shrink-0">
                          {q.marks} নম্বর
                        </span>
                      </div>
                      {q.answer && (
                        <div className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200/80 leading-relaxed">
                          <strong className="text-emerald-700 block mb-0.5">উত্তর:</strong>
                          {q.answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom Actions (Hidden in full-screen PDF mode except compact teacher download if needed, or shown in notes mode) */}
        {!isPdfFullscreen && (
          <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {currentStatus === 'completed' ? (
                <button
                  onClick={() => onUpdateStatus('in_progress')}
                  className="min-h-[40px] flex-1 sm:flex-initial px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>পড়া সম্পন্ন হয়েছে (চলছে হিসেবে চিহ্নিত করো)</span>
                </button>
              ) : (
                <button
                  onClick={() => onUpdateStatus('completed')}
                  className="min-h-[40px] flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>তোমার পড়া শেষ চিহ্নিত করো ✓</span>
                </button>
              )}

              <button
                onClick={() => onToggleSaveOffline(chapter)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1 transition-colors ${
                  isSavedOffline
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
                title="তোমার অফলাইনে রাখো"
              >
                {isSavedOffline ? (
                  <>
                    <BookmarkCheck className="w-4 h-4 text-emerald-600" />
                    <span>সংরক্ষিত</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-4 h-4 text-slate-500" />
                    <span>অফলাইনে রাখো</span>
                  </>
                )}
              </button>
            </div>

            {isTeacherMode && (
              <button
                onClick={() => onDownloadPDF(chapter)}
                className="min-h-[40px] w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>PDF ফাইল ডাউনলোড করো</span>
              </button>
            )}
          </div>
        )}
      </div>
      {privacyCurtain}
      {toastOverlay}
    </div>
  );
};
