import React, { useRef } from 'react';
import { Search, X } from 'lucide-react';

export interface StatusCounts {
  all: number;
  uncompleted: number;
  completed: number;
  revision: number;
}

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  resultCount: number;
  totalCount: number;
  statusCounts?: StatusCounts;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  resultCount,
  totalCount,
  statusCounts,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const counts: StatusCounts = statusCounts || {
    all: totalCount,
    uncompleted: 0,
    completed: 0,
    revision: 0,
  };

  const activeFilterLabel =
    statusFilter === 'uncompleted'
      ? 'পড়া বাকি'
      : statusFilter === 'completed'
      ? 'পড়া শেষ'
      : statusFilter === 'revision'
      ? 'রিভিশন'
      : '';

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inputRef.current?.focus();
    onSearchChange(searchQuery.trimStart());
  };

  return (
    <div className="w-full max-w-full bg-white rounded-2xl border border-slate-200 p-2.5 sm:p-3.5 shadow-xs overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        {/* Search Input + Explicit Search Action Button */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="তোমার প্রয়োজনীয় বিষয়, অধ্যায় বা প্রশ্ন খোঁজো..."
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="অনুসন্ধান খালি করো"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            title="খুঁজো"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">খুঁজো</span>
          </button>
        </form>

        {/* Status Filter Buttons under/beside Search - Always clickable with accurate counts */}
        <div className="flex flex-wrap items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onStatusFilterChange('all')}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            সব ({counts.all})
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('uncompleted')}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              statusFilter === 'uncompleted'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            পড়া বাকি{statusCounts ? ` (${counts.uncompleted})` : ''}
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('completed')}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              statusFilter === 'completed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            পড়া শেষ{statusCounts ? ` (${counts.completed})` : ''}
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('revision')}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              statusFilter === 'revision'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            রিভিশন{statusCounts ? ` (${counts.revision})` : ''}
          </button>
        </div>
      </div>

      {/* Query or Active Status Filter Notice */}
      {(searchQuery || statusFilter !== 'all') && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 gap-2">
          <span className="truncate pr-2">
            {searchQuery ? (
              <>
                &ldquo;<strong className="text-slate-800">{searchQuery}</strong>&rdquo;
                {activeFilterLabel ? ` (${activeFilterLabel})` : ''} এর জন্য{' '}
                <strong className="text-slate-800 font-mono">{resultCount}</strong> টি অধ্যায় পেয়েছো
              </>
            ) : (
              <>
                ফিল্টার: <strong className="text-slate-800">{activeFilterLabel}</strong> —{' '}
                <strong className="text-slate-800 font-mono">{resultCount}</strong> টি অধ্যায় পাওয়া গেছে
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              onStatusFilterChange('all');
            }}
            className="text-amber-600 hover:underline font-semibold shrink-0 cursor-pointer"
          >
            রিসেট করো
          </button>
        </div>
      )}
    </div>
  );
};
