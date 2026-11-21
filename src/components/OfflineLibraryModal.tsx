import React from 'react';
import { 
  X, 
  DownloadCloud, 
  FileText, 
  Trash2, 
  Download, 
  HardDrive, 
  BookOpen 
} from 'lucide-react';
import { ChapterNote, OfflineSavedItem } from '../types';

interface OfflineLibraryModalProps {
  savedItems: OfflineSavedItem[];
  chapters: ChapterNote[];
  isTeacherMode?: boolean;
  onReadChapter: (chapter: ChapterNote) => void;
  onDownloadPDF: (chapter: ChapterNote) => void;
  onRemoveOffline: (chapterId: string) => void;
  onClose: () => void;
}

export const OfflineLibraryModal: React.FC<OfflineLibraryModalProps> = ({
  savedItems,
  chapters,
  isTeacherMode = false,
  onReadChapter,
  onDownloadPDF,
  onRemoveOffline,
  onClose,
}) => {
  const totalKb = savedItems.reduce((acc, item) => acc + (item.sizeKb || 400), 0);
  const totalSizeFormatted =
    totalKb > 1024 ? `${(totalKb / 1024).toFixed(1)} MB` : `${totalKb} KB`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <DownloadCloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">তোমার সংরক্ষিত অফলাইন নোটস</h2>
              <p className="text-[11px] text-slate-400">ইন্টারনেট ছাড়া পড়ার জন্য সংরক্ষিত</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Storage Strip */}
        <div className="bg-amber-50/80 px-3.5 py-2 border-b border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-1.5 font-medium">
            <HardDrive className="w-3.5 h-3.5 text-amber-700" />
            <span>মোট সংরক্ষিত: <strong>{savedItems.length}</strong> টি অধ্যায়</span>
          </div>
          <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300 font-bold text-[11px]">
            স্থান: {totalSizeFormatted}
          </span>
        </div>

        {/* Content List */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-2 flex-1">
          {savedItems.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <DownloadCloud className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
              <p className="text-xs sm:text-sm font-semibold text-slate-600 mb-0.5">তোমার কোনো অফলাইন নোটস সংরক্ষিত নেই</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                যে কোনো অধ্যায়ের &quot;সেভ করো&quot; বাটনে ট্যাপ করে ইন্টারনেট ছাড়াই পড়ার জন্য এখানে জমা রাখো।
              </p>
            </div>
          ) : (
            savedItems.map((item) => {
              const chapter = chapters.find((c) => c.id === item.chapterId);

              return (
                <div
                  key={item.chapterId}
                  className="bg-slate-50 hover:bg-white border border-slate-200 rounded-2xl p-3 transition-colors flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2 overflow-hidden min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                        {item.subjectNameBn}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {item.titleBn}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {item.pdfFileName} • {item.sizeKb} KB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {chapter && (
                      <button
                        onClick={() => {
                          onReadChapter(chapter);
                          onClose();
                        }}
                        className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                        title="নোটস পড়ো"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>পড়ো</span>
                      </button>
                    )}

                    {isTeacherMode && chapter && (
                      <button
                        onClick={() => onDownloadPDF(chapter)}
                        className="p-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs"
                        title="PDF ডাউনলোড করো"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => onRemoveOffline(item.chapterId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="অফলাইন থেকে সরাও"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-500">
            এই সমস্ত ফাইলগুলি তোমার ডিভাইসে সম্পূর্ণ অফলাইনে সংরক্ষিত থাকে।
          </p>
        </div>
      </div>
    </div>
  );
};
