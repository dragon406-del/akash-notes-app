import React from 'react';
import { CheckCircle2, Clock, RotateCcw, Award } from 'lucide-react';
import { ChapterNote, StudentProgress, SubjectItem } from '../types';

interface ProgressStatsProps {
  subjects: SubjectItem[];
  chapters: ChapterNote[];
  progressMap: Record<string, StudentProgress>;
  selectedSubjectId: string | null;
}

export const ProgressStats: React.FC<ProgressStatsProps> = ({
  subjects,
  chapters,
  progressMap,
  selectedSubjectId,
}) => {
  const totalChapters = chapters.length;

  let completedCount = 0;
  let inProgressCount = 0;
  let revisionCount = 0;

  for (const ch of chapters) {
    const status = progressMap[ch.id]?.status;
    if (status === 'completed') {
      completedCount += 1;
    } else if (status === 'in_progress') {
      inProgressCount += 1;
    } else if (status === 'revision') {
      revisionCount += 1;
    }
  }

  const percentage =
    totalChapters > 0 ? Math.min(100, Math.round((completedCount / totalChapters) * 100)) : 0;

  const activeSubject = selectedSubjectId ? subjects.find((s) => s.id === selectedSubjectId) : null;

  return (
    <div className="w-full max-w-full overflow-hidden bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {activeSubject ? `${activeSubject.nameBn} - তোমার অগ্রগতি` : 'তোমার সার্বিক পড়াশোনার অগ্রগতি'}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-snug">
            নোটস পড়ে অধ্যায় সম্পন্ন হিসেবে চিহ্নিত করো ও পরীক্ষার সেরা প্রস্তুতি নাও
          </p>
        </div>

        {/* Percentage badge */}
        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          <div className="text-right">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
              {percentage}%
            </span>
            <span className="block text-[10px] text-slate-400 font-medium">সিলেবাস সম্পন্ন</span>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-3 border-slate-100 flex items-center justify-center relative overflow-hidden bg-amber-50 shrink-0">
            <div 
              className="absolute inset-0 bg-amber-500/25" 
              style={{ clipPath: `polygon(0 0, 100% 0, 100% ${percentage}%, 0 ${percentage}%)` }}
            />
            <span className="text-[11px] font-bold text-amber-900 font-mono z-10">{completedCount}/{totalChapters}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
        <div
          className="bg-amber-500 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2">
          <div className="flex items-center justify-center gap-1 text-emerald-700 mb-0.5">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span className="text-[10px] sm:text-[11px] font-semibold truncate">পড়া শেষ</span>
          </div>
          <span className="text-base sm:text-lg font-bold text-emerald-900 font-mono tabular-nums">{completedCount}</span>
        </div>

        <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-2">
          <div className="flex items-center justify-center gap-1 text-amber-700 mb-0.5">
            <Clock className="w-3 h-3 shrink-0" />
            <span className="text-[10px] sm:text-[11px] font-semibold truncate">পড়া চলছে</span>
          </div>
          <span className="text-base sm:text-lg font-bold text-amber-900 font-mono tabular-nums">{inProgressCount}</span>
        </div>

        <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-2">
          <div className="flex items-center justify-center gap-1 text-sky-700 mb-0.5">
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span className="text-[10px] sm:text-[11px] font-semibold truncate">রিভিশন বাকি</span>
          </div>
          <span className="text-base sm:text-lg font-bold text-sky-900 font-mono tabular-nums">{revisionCount}</span>
        </div>
      </div>
    </div>
  );
};
