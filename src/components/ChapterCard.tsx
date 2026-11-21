import React from 'react';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  Circle, 
  Check, 
  Edit3, 
  Trash2, 
  BookmarkCheck, 
  BookmarkPlus, 
  HelpCircle,
  GraduationCap,
  ExternalLink
} from 'lucide-react';
import { ChapterNote, ProgressStatus, StudentProgress, SubjectItem } from '../types';
import { DEFAULT_CLASSES } from '../data/defaultData';

interface ChapterCardProps {
  chapter: ChapterNote;
  subject?: SubjectItem;
  progress?: StudentProgress;
  onUpdateProgress: (chapterId: string, status: ProgressStatus) => void;
  onReadNotes: (chapter: ChapterNote) => void;
  onDownloadPDF: (chapter: ChapterNote) => void;
  isSavedOffline: boolean;
  onToggleSaveOffline: (chapter: ChapterNote) => void;
  isTeacherMode: boolean;
  onEditChapter?: (chapter: ChapterNote) => void;
  onDeleteChapter?: (chapter: ChapterNote) => void;
  lowDataMode: boolean;
}

export const ChapterCard: React.FC<ChapterCardProps> = ({
  chapter,
  subject,
  progress,
  onUpdateProgress,
  onReadNotes,
  onDownloadPDF,
  isSavedOffline,
  onToggleSaveOffline,
  isTeacherMode,
  onEditChapter,
  onDeleteChapter,
  lowDataMode,
}) => {
  const currentStatus: ProgressStatus = progress?.status || 'not_started';
  const classInfo = DEFAULT_CLASSES.find((c) => c.id === chapter.classLevel);

  const getStatusBadge = () => {
    switch (currentStatus) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>পড়া শেষ</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>চলছে</span>
          </span>
        );
      case 'revision':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <RotateCcw className="w-3 h-3 text-sky-600" />
            <span>রিভিশন</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Circle className="w-2.5 h-2.5 text-slate-400" />
            <span>পড়া বাকি</span>
          </span>
        );
    }
  };

  return (
    <div
      onClick={() => onReadNotes(chapter)}
      className={`rounded-2xl transition-all w-full max-w-full overflow-hidden cursor-pointer group ${
        lowDataMode
          ? 'bg-white border border-slate-300 p-3 sm:p-4 hover:border-slate-400'
          : 'bg-white border border-slate-200 hover:border-amber-400 p-3.5 sm:p-5 shadow-xs hover:shadow-md'
      }`}
    >
      {/* Top Row: Chapter, Class, Subject & Controls */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-xs font-bold border border-slate-200">
            অধ্যায় {chapter.chapterNumber}
          </span>

          {classInfo && classInfo.id !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
              <GraduationCap className="w-3 h-3" />
              <span>{classInfo.shortBn}</span>
            </span>
          )}

          {subject && (
            <span className="text-xs font-medium text-slate-500">
              {subject.nameBn}
            </span>
          )}

          {isSavedOffline && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
              <Check className="w-2.5 h-2.5" />
              <span>সংরক্ষিত</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {getStatusBadge()}

          {/* Teacher Controls */}
          {isTeacherMode && (
            <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-slate-200">
              {onEditChapter && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditChapter(chapter);
                  }}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                  title="অধ্যায়টি সম্পাদনা করো"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {onDeleteChapter && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChapter(chapter);
                  }}
                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                  title="অধ্যায়টি মুছে ফেলো (শিক্ষক পিন প্রয়োজন)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chapter Title & Click Indicator */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug group-hover:text-amber-600 transition-colors">
          {chapter.titleBn}
        </h3>
        <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-500 shrink-0 mt-0.5 transition-colors" />
      </div>

      {chapter.titleEn && (
        <p className="text-[11px] text-slate-400 font-medium mb-2">
          {chapter.titleEn}
        </p>
      )}

      {/* Summary Snippet */}
      <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed mb-3">
        {chapter.summaryBn}
      </p>

      {/* Info Metadata */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-3.5 flex-wrap">
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3 text-amber-500" />
          <span>{chapter.keyPoints?.length || 0} টি মূল পয়েন্ট</span>
        </span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className="flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-sky-500" />
          <span>{chapter.questions?.length || 0} টি প্রশ্নোত্তর</span>
        </span>
        {chapter.pdfFileSize && (
          <>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
              PDF {chapter.pdfFileSize}
            </span>
          </>
        )}
      </div>

      {/* Progress & Study Controls */}
      <div 
        className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Status Buttons in 2nd person */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={() => onUpdateProgress(chapter.id, 'not_started')}
            className={`min-h-[34px] flex-1 sm:flex-initial px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              currentStatus === 'not_started'
                ? 'bg-white text-slate-800 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="পড়া শুরু করোনি"
          >
            বাকি
          </button>
          <button
            onClick={() => onUpdateProgress(chapter.id, 'in_progress')}
            className={`min-h-[34px] flex-1 sm:flex-initial px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              currentStatus === 'in_progress'
                ? 'bg-amber-500 text-slate-950 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="পড়ছো"
          >
            চলছে
          </button>
          <button
            onClick={() => onUpdateProgress(chapter.id, 'completed')}
            className={`min-h-[34px] flex-1 sm:flex-initial px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              currentStatus === 'completed'
                ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="পড়া শেষ করেছো"
          >
            শেষ ✓
          </button>
          <button
            onClick={() => onUpdateProgress(chapter.id, 'revision')}
            className={`min-h-[34px] flex-1 sm:flex-initial px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              currentStatus === 'revision'
                ? 'bg-sky-600 text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="পুনরায় রিভিশন করো"
          >
            রিভিশন
          </button>
        </div>

        {/* Read & Download in 2nd person */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
          <button
            onClick={() => onToggleSaveOffline(chapter)}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 transition-colors border ${
              isSavedOffline
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
            }`}
            title={isSavedOffline ? 'তোমার অফলাইন তালিকা থেকে সরাও' : 'ইন্টারনেট ছাড়া পড়ার জন্য সেভ করো'}
          >
            {isSavedOffline ? (
              <>
                <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>সেভড</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="w-3.5 h-3.5 text-slate-400" />
                <span>সেভ করো</span>
              </>
            )}
          </button>

          <button
            onClick={() => onReadNotes(chapter)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>নোটস পড়ো</span>
          </button>

          {isTeacherMode && (
            <button
              onClick={() => onDownloadPDF(chapter)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-1 shadow-xs"
              title="PDF ফাইল ডাউনলোড করো"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
