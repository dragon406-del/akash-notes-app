import React, { useRef } from 'react';
import { 
  BookOpen, 
  Globe, 
  Landmark, 
  Brain, 
  Scroll, 
  Plus, 
  Trash2, 
  Layers, 
  Bookmark,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { SubjectItem } from '../types';

interface SubjectBarProps {
  subjects: SubjectItem[];
  selectedSubjectId: string | null;
  selectedClassLabel?: string;
  onSelectSubject: (id: string | null) => void;
  chapterCounts: Record<string, number>;
  completedCounts: Record<string, number>;
  isTeacherMode: boolean;
  onOpenAddSubject: () => void;
  onDeleteSubject?: (subject: SubjectItem) => void;
}

const getSubjectIcon = (iconName: string) => {
  switch (iconName.toLowerCase()) {
    case 'globe':
      return <Globe className="w-3.5 h-3.5" />;
    case 'landmark':
      return <Landmark className="w-3.5 h-3.5" />;
    case 'brain':
      return <Brain className="w-3.5 h-3.5" />;
    case 'scroll':
      return <Scroll className="w-3.5 h-3.5" />;
    case 'bookopen':
    case 'book':
    default:
      return <BookOpen className="w-3.5 h-3.5" />;
  }
};

export const SubjectBar: React.FC<SubjectBarProps> = ({
  subjects,
  selectedSubjectId,
  selectedClassLabel,
  onSelectSubject,
  chapterCounts,
  completedCounts,
  isTeacherMode,
  onOpenAddSubject,
  onDeleteSubject,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const totalAllChapters = Object.values(chapterCounts).reduce((a, b) => a + b, 0);
  const totalAllCompleted = Object.values(completedCounts).reduce((a, b) => a + b, 0);

  const scrollByAmount = (delta: number) => {
    scrollContainerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className="w-full max-w-full overflow-hidden bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-slate-500 shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold tracking-tight text-slate-800">
              তোমার বিষয় বেছে নাও (Select Subject):
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-medium">
              <span>পাশাপাশি স্ক্রোল করো</span>
              <button
                type="button"
                onClick={() => scrollByAmount(-180)}
                aria-label="বামে স্ক্রোল করো"
                className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollByAmount(180)}
                aria-label="ডানে স্ক্রোল করো"
                className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Teacher Add Subject Button */}
            {isTeacherMode && (
              <button
                type="button"
                onClick={onOpenAddSubject}
                className="min-h-[34px] px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>নতুন বিষয়</span>
              </button>
            )}
          </div>
        </div>

        {/* Sideways Scrollable Subject Strip - Isolated so it NEVER overflows the main display */}
        <div className="w-full overflow-hidden relative">
          <div
            ref={scrollContainerRef}
            className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pt-2 pb-1 pr-2 scrollbar-thin scrollbar-thumb-slate-300 no-scrollbar touch-pan-x smooth-scroll-x"
          >
            {/* All Subjects Tab */}
            <button
              type="button"
              onClick={() => onSelectSubject(null)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${
                selectedSubjectId === null
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>সব বিষয়</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
                selectedSubjectId === null ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/80 text-slate-600'
              }`}>
                {totalAllCompleted}/{totalAllChapters}
              </span>
            </button>

            {/* Individual Subjects */}
            {subjects.map((sub) => {
              const count = chapterCounts[sub.id] || 0;
              const completed = completedCounts[sub.id] || 0;
              const isSelected = selectedSubjectId === sub.id;

              return (
                <div key={sub.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectSubject(sub.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs font-bold'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <span className={isSelected ? 'text-slate-950' : 'text-slate-500'}>
                      {getSubjectIcon(sub.icon)}
                    </span>
                    <span>{sub.nameBn}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
                        isSelected ? 'bg-amber-600 text-white' : 'bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      {completed}/{count}
                    </span>
                  </button>

                  {/* Teacher Mode: Remove ANY subject from the currently selected class (or all classes) */}
                  {isTeacherMode && onDeleteSubject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSubject(sub);
                      }}
                      title={
                        selectedClassLabel
                          ? `${selectedClassLabel} থেকে "${sub.nameBn}" সরাও`
                          : `"${sub.nameBn}" বিষয়টি সরাও`
                      }
                      aria-label={`${sub.nameBn} বিষয়টি সরাও`}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 hover:bg-rose-700 text-white rounded-full flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
