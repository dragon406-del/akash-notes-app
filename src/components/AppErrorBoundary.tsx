import React from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || ''),
    };
  }

  componentDidCatch(error: unknown) {
    console.error('AppErrorBoundary caught error:', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-white">অ্যাপটি লোড করতে সমস্যা হয়েছে</h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            তোমার ডিভাইসে অ্যাপটি চালু করার সময় একটি অপ্রত্যাশিত সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করো অথবা Chrome / Safari ব্রাউজারে খোলো।
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="w-full min-h-[44px] py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>আবার লোড করো</span>
          </button>
        </div>
      </div>
    );
  }
}
