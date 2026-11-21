import React, { useState } from 'react';
import { 
  BookOpen,
  DownloadCloud, 
  Lock, 
  Unlock, 
  WifiOff, 
  Zap, 
  HelpCircle,
  Smartphone,
  KeyRound,
  Bell,
  Share2,
  Check
} from 'lucide-react';
import { usePWAInstall } from '../hooks/useAppHooks';

interface HeaderProps {
  hasPin: boolean;
  isTeacherMode: boolean;
  isTeacherDevice?: boolean;
  onToggleTeacherMode: () => void;
  onOpenChangePinModal?: () => void;
  pendingRequestsCount?: number;
  onOpenRequestsModal?: () => void;
  isOnline: boolean;
  offlineCount: number;
  onOpenOfflineLibrary: () => void;
  lowDataMode: boolean;
  onToggleLowDataMode: () => void;
  onOpenBackupModal: () => void;
  onShareAppLink?: () => Promise<boolean> | boolean | void;
}

export const Header: React.FC<HeaderProps> = ({
  hasPin,
  isTeacherMode,
  isTeacherDevice = false,
  onToggleTeacherMode,
  onOpenChangePinModal,
  pendingRequestsCount = 0,
  onOpenRequestsModal,
  isOnline,
  offlineCount,
  onOpenOfflineLibrary,
  lowDataMode,
  onToggleLowDataMode,
  onOpenBackupModal,
  onShareAppLink,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleShareClick = async () => {
    if (!onShareAppLink) return;
    const ok = await onShareAppLink();
    if (ok !== false) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full max-w-full overflow-hidden bg-slate-900 text-white shadow-md border-b border-slate-800">
      {/* Offline Status Bar when disconnected in second person language */}
      {!isOnline && (
        <div className="bg-amber-600 text-amber-50 px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-2 text-center">
          <WifiOff className="w-3.5 h-3.5 shrink-0 animate-pulse" />
          <span>তুমি অফলাইনে আছো — তোমার ফোনে সংরক্ষিত সব নোটস ও চ্যাপ্টার পড়তে পারবে</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col gap-2">
        {/* First Row: Book icon + Akash Sirer Notes text + teacher-only indicator */}
        <div className="w-full flex items-center justify-start gap-2 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shrink-0">
            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
            আকাশ স্যারের নোটস
          </h1>
          {isTeacherMode && (
            <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full shrink-0">
              শিক্ষক
            </span>
          )}
        </div>

        {/* Second Row: All Action Buttons starting from left */}
        <div className="w-full flex items-center justify-start flex-wrap gap-1.5">
          {/* Low Bandwidth / Data Saver Toggle */}
          <button
            onClick={onToggleLowDataMode}
            title={lowDataMode ? 'স্বাভাবিক মোড চালু করো' : 'লো-ডাটা মোড (দুর্বল নেটওয়ার্কে দ্রুত পড়ার জন্য)'}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
              lowDataMode
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ডাটা সেভার</span>
            {lowDataMode && <span className="text-[9px] bg-emerald-700 text-white px-1 rounded">অন</span>}
          </button>

          {/* Offline Downloads library */}
          <button
            onClick={onOpenOfflineLibrary}
            className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
            title="তোমার অফলাইনে সংরক্ষিত নোটস"
          >
            <DownloadCloud className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">সংরক্ষিত নোটস</span>
            {offlineCount > 0 && (
              <span className="bg-amber-500 text-slate-950 font-bold text-[10px] px-1.5 rounded-full">
                {offlineCount}
              </span>
            )}
          </button>

          {/* PWA Install Button for mobile users */}
          {isInstallable && !isInstalled && (
            <button
              onClick={install}
              className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1 shadow-xs transition-colors"
              title="তোমার ফোনে অ্যাপটি ইনস্টল করো"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ইনস্টল</span>
            </button>
          )}

          {isIOS && !isInstalled && (
            <button
              onClick={() => setShowIOSPrompt(true)}
              className="min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 border border-slate-700"
              title="iPhone-এ যোগ করো"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Direct App Link Copy / Share */}
          {onShareAppLink && (
            <button
              type="button"
              onClick={handleShareClick}
              className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
                copiedLink
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'text-slate-300 hover:bg-slate-800 border-slate-700/60'
              }`}
              title="সরাসরি অ্যাপ খোলার লিংক কপি বা শেয়ার করো"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5 text-amber-400" />}
              <span className="hidden sm:inline">{copiedLink ? 'কপি হয়েছে' : 'অ্যাপ লিংক'}</span>
            </button>
          )}

          {/* Backup / Export / Import (Teacher only so students cannot export embedded PDFs) */}
          {isTeacherMode && (
            <button
              onClick={onOpenBackupModal}
              className="min-h-[36px] p-2 rounded-lg text-slate-300 hover:bg-slate-800 border border-slate-700 flex items-center justify-center"
              title="নোটস ব্যাকআপ ও অফলাইন শেয়ার করো"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {/* Permission Requests Bell for teacher device */}
          {(isTeacherMode || isTeacherDevice) && onOpenRequestsModal && (
            <button
              onClick={onOpenRequestsModal}
              className={`min-h-[36px] px-2.5 py-1 rounded-lg border flex items-center gap-1 text-xs relative transition-colors ${
                pendingRequestsCount > 0
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'text-slate-300 hover:bg-slate-800 border-slate-700'
              }`}
              title="শিক্ষার্থী প্রবেশের অনুমতির অনুরোধসমূহ"
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">অনুমতি</span>
              {pendingRequestsCount > 0 && (
                <>
                  <span className="bg-rose-600 text-white font-bold text-[10px] px-1.5 rounded-full">
                    {pendingRequestsCount}
                  </span>
                  <span
                    aria-label="অপেক্ষমাণ অনুরোধ রয়েছে"
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-slate-900"
                  />
                </>
              )}
            </button>
          )}

          {/* Change PIN button for logged-in teacher */}
          {isTeacherMode && hasPin && onOpenChangePinModal && (
            <button
              onClick={onOpenChangePinModal}
              className="min-h-[36px] px-2.5 py-1 rounded-lg text-slate-300 hover:bg-slate-800 border border-slate-700 flex items-center gap-1 text-xs"
              title="তোমার শিক্ষক পিন পরিবর্তন করো"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">পিন বদলাও</span>
            </button>
          )}

          {/* Teacher Mode Switch */}
          <button
            onClick={onToggleTeacherMode}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
              isTeacherMode
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs font-semibold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            {isTeacherMode ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>শিক্ষক মোড</span>
              </>
            ) : !hasPin ? (
              <>
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>পিন তৈরি করো</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>শিক্ষক প্রবেশ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* iOS Safari install instructions modal */}
      {showIOSPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 text-white">
            <h3 className="text-base font-bold text-amber-400 mb-2">তোমার iPhone বা iPad-এ যোগ করো</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              ১. Safari ব্রাউজারের নিচে থাকা <strong>Share (শেয়ার)</strong> বাটনে ট্যাপ করো।<br />
              ২. নিচে স্ক্রল করে <strong>&quot;Add to Home Screen&quot; (হোম স্ক্রিনে যোগ করো)</strong> নির্বাচন করো।<br />
              ৩. এরপর ইন্টারনেট ছাড়াই অ্যাপটি যেকোনো সময় সরাসরি খুলতে পারবে।
            </p>
            <button
              onClick={() => setShowIOSPrompt(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-white"
            >
              বুঝেছি (বন্ধ করো)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
