import React, { useRef } from 'react';
import { GraduationCap, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { ClassLevel } from '../types';

interface ClassBarProps {
  classes: ClassLevel[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  lockedClassId?: string | null;
}

export const ClassBar: React.FC<ClassBarProps> = ({
  classes,
  selectedClassId,
  onSelectClass,
  lockedClassId = null,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (delta: number) => {
    scrollContainerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  if (lockedClassId) {
    const permittedClass = classes.find((c) => c.id === lockedClassId);
    return (
      <div className="w-full max-w-full overflow-hidden bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              তোমার অনুমোদিত শ্রেণি:
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500 text-slate-950 text-xs sm:text-sm font-bold shadow-xs">
              <Lock className="w-3 h-3 shrink-0" />
              <span>{permittedClass?.nameBn || lockedClassId}</span>
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            শিক্ষক শুধুমাত্র এই শ্রেণির নোটস দেখার অনুমতি দিয়েছেন
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-amber-600 shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-800">
              তোমার শ্রেণি নির্বাচন করো (Class 6 - 12):
            </h2>
          </div>
          <div className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium">
            <span>পাশাপাশি স্ক্রোল করো</span>
            <button
              type="button"
              onClick={() => scrollByAmount(-180)}
              aria-label="বামে স্ক্রোল করো"
              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scrollByAmount(180)}
              aria-label="ডানে স্ক্রোল করো"
              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sideways Scrollable Class Strip - Isolated so it NEVER overflows the main display */}
        <div className="w-full overflow-hidden relative">
          <div
            ref={scrollContainerRef}
            className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 scrollbar-thin scrollbar-thumb-slate-300 no-scrollbar touch-pan-x smooth-scroll-x"
          >
            {classes.map((cls) => {
              const isSelected = selectedClassId === cls.id;
              return (
                <button
                  type="button"
                  key={cls.id}
                  onClick={() => onSelectClass(cls.id)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all border shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <span>{cls.nameBn}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
