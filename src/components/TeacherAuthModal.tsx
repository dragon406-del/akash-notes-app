import React, { useState } from 'react';
import {
  Lock,
  KeyRound,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  PowerOff,
  Upload,
  Trash2,
  FileText,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';

export type TeacherAuthMode =
  | 'create_pin'
  | 'login'
  | 'turn_off'
  | 'change_pin'
  | 'add_note'
  | 'delete_note';

interface TeacherAuthModalProps {
  hasPin: boolean;
  teacherLoggedIn?: boolean;
  initialMode?: TeacherAuthMode;
  targetItemTitle?: string;
  onSetupPin: (newPin: string) => Promise<void>;
  onLoginWithPin: (pin: string) => Promise<void>;
  onTurnOffWithPin: (pin: string) => Promise<void>;
  onChangePin: (previousPin: string, newPin: string) => Promise<void>;
  onVerifyPinAction?: (pin: string) => Promise<void>;
  onClose: () => void;
}

export const TeacherAuthModal: React.FC<TeacherAuthModalProps> = ({
  hasPin,
  teacherLoggedIn = false,
  initialMode = 'login',
  targetItemTitle,
  onSetupPin,
  onLoginWithPin,
  onTurnOffWithPin,
  onChangePin,
  onVerifyPinAction,
  onClose,
}) => {
  const effectiveInitialMode: TeacherAuthMode = !hasPin ? 'create_pin' : initialMode;
  const [activeMode, setActiveMode] = useState<TeacherAuthMode>(effectiveInitialMode);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Fields for creating or changing PIN
  const [previousPinInput, setPreviousPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');

  // Visibility toggles for PIN inputs
  const [showPin, setShowPin] = useState(false);
  const [showPreviousPin, setShowPreviousPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmNewPin, setShowConfirmNewPin] = useState(false);

  const formatAuthError = (err: unknown, fallback: string) => {
    if (err instanceof Error) {
      if (err.message.startsWith('{') && err.message.toLowerCase().includes('permission')) {
        return 'কেবল শিক্ষকের নিবন্ধিত Google অ্যাকাউন্ট থেকেই পিন যাচাই বা পরিবর্তন করা যাবে।';
      }
      return err.message;
    }
    return fallback;
  };

  // First-time PIN creation (NO previous verification needed when no PIN exists yet)
  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPinInput.trim().length < 4) {
      setErrorMsg('নতুন পিন কমপক্ষে ৪ সংখ্যার হতে হবে।');
      return;
    }
    if (newPinInput.trim() !== confirmNewPinInput.trim()) {
      setErrorMsg('নতুন পিন এবং নিশ্চিত করা পিন মিলছে না! উভয় ঘরে একই পিন লেখো।');
      return;
    }

    setLoading(true);
    try {
      await onSetupPin(newPinInput.trim());
    } catch (err) {
      setErrorMsg(formatAuthError(err, 'পিন তৈরি করতে সমস্যা হয়েছে।'));
    } finally {
      setLoading(false);
    }
  };

  // Handle login, turn_off, add_note, delete_note
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!pinInput.trim()) {
      setErrorMsg('তোমার শিক্ষক পিন লেখো।');
      return;
    }

    setLoading(true);
    try {
      if (activeMode === 'turn_off') {
        await onTurnOffWithPin(pinInput.trim());
      } else if (activeMode === 'add_note' || activeMode === 'delete_note') {
        if (onVerifyPinAction) {
          await onVerifyPinAction(pinInput.trim());
        }
      } else {
        await onLoginWithPin(pinInput.trim());
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err, 'পিন যাচাই করা যায়নি।'));
    } finally {
      setLoading(false);
    }
  };

  // Handle Changing PIN - Strict verification of previous PIN required
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!previousPinInput.trim()) {
      setErrorMsg('তোমার আগের পিনটি লেখো।');
      return;
    }
    if (newPinInput.trim().length < 4) {
      setErrorMsg('নতুন পিন কমপক্ষে ৪ সংখ্যার হতে হবে।');
      return;
    }
    if (newPinInput.trim() !== confirmNewPinInput.trim()) {
      setErrorMsg('নতুন পিন এবং নিশ্চিত করা পিন মিলছে না! উভয় ঘরে একই নতুন পিন লেখো।');
      return;
    }
    if (newPinInput.trim() === previousPinInput.trim()) {
      setErrorMsg('নতুন পিনটি তোমার আগের পিনের চেয়ে আলাদা হতে হবে।');
      return;
    }

    setLoading(true);
    try {
      await onChangePin(previousPinInput.trim(), newPinInput.trim());
      setSuccessMsg('তোমার শিক্ষক পিন সফলভাবে পরিবর্তন করা হয়েছে!');
      setPreviousPinInput('');
      setNewPinInput('');
      setConfirmNewPinInput('');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setErrorMsg(formatAuthError(err, 'পিন পরিবর্তন করা যায়নি।'));
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (activeMode) {
      case 'create_pin':
        return 'নতুন শিক্ষক পিন তৈরি করো';
      case 'add_note':
        return 'নোটস যোগ করতে পিন দাও';
      case 'delete_note':
        return 'নোটস মুছে ফেলতে পিন দাও';
      case 'turn_off':
        return 'শিক্ষক মোড বন্ধ করো';
      case 'change_pin':
        return 'শিক্ষক পিন পরিবর্তন করো';
      case 'login':
      default:
        return 'শিক্ষক প্রবেশ পোর্টাল';
    }
  };

  const getSubtitle = () => {
    switch (activeMode) {
      case 'create_pin':
        return 'প্রথমবার তোমার ব্যক্তিগত শিক্ষক পিন তৈরি করে প্রবেশ করো';
      case 'add_note':
        return 'নতুন নোটস বা PDF আপলোড করতে শিক্ষক পিন দিয়ে নিশ্চিত করো';
      case 'delete_note':
        return 'নোটসটি চিরতরে মুছে ফেলতে শিক্ষক পিন দিয়ে নিশ্চিত করো';
      case 'turn_off':
        return 'শিক্ষক মোড বন্ধ করতে তোমার বর্তমান পিন নিশ্চিত করো';
      case 'change_pin':
        return 'পূর্ববর্তী পিন মিলিয়ে নিশ্চিত করে নতুন পিন দাও';
      case 'login':
      default:
        return 'শিক্ষক নিয়ন্ত্রণে প্রবেশ করতে তোমার পিন দাও';
    }
  };

  const getHeaderIcon = () => {
    switch (activeMode) {
      case 'create_pin':
        return <Sparkles className="w-5 h-5 text-amber-600" />;
      case 'delete_note':
        return <Trash2 className="w-5 h-5 text-rose-600" />;
      case 'add_note':
        return <Upload className="w-5 h-5 text-rose-600" />;
      case 'turn_off':
        return <PowerOff className="w-5 h-5 text-amber-700" />;
      case 'change_pin':
        return <ShieldCheck className="w-5 h-5 text-amber-600" />;
      case 'login':
      default:
        return <Lock className="w-5 h-5 text-rose-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <div className="flex items-center gap-2">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold ${
                activeMode === 'turn_off' || activeMode === 'create_pin'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {getHeaderIcon()}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">{getTitle()}</h3>
              <p className="text-[11px] text-slate-500">{getSubtitle()}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target item indicator if deleting a specific chapter */}
        {activeMode === 'delete_note' && targetItemTitle && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-xs text-rose-900 font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate">অধ্যায়: {targetItemTitle}</span>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* Success message */}
        {successMsg && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 mb-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {activeMode === 'create_pin' ? (
          /* First-time PIN Creation Form (No Default PIN, No Verification Needed) */
          <form onSubmit={handleCreatePin} className="space-y-3">
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
              এখনও কোনো শিক্ষক পিন তৈরি করা হয়নি। তুমি সরাসরি নিজের পিন তৈরি করে শিক্ষক হিসেবে লগইন করতে পারো (একসাথে কেবল একজনই শিক্ষক হিসেবে থাকতে পারবে)।
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ১. তোমার নতুন শিক্ষক পিন তৈরি করো (কমপক্ষে ৪ সংখ্যা): *
              </label>
              <div className="relative">
                <input
                  type={showNewPin ? 'text' : 'password'}
                  maxLength={8}
                  value={newPinInput}
                  onChange={(e) => {
                    setNewPinInput(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="নতুন পিন লেখো"
                  autoFocus
                  className="w-full text-center tracking-widest font-mono text-base py-2 px-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin((prev) => !prev)}
                  aria-label={showNewPin ? 'পিন লুকাও' : 'পিন দেখো'}
                  title={showNewPin ? 'লুকাও (Hide)' : 'দেখো (Show)'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ২. পিনটি আবার লিখে নিশ্চিত করো: *
              </label>
              <div className="relative">
                <input
                  type={showConfirmNewPin ? 'text' : 'password'}
                  maxLength={8}
                  value={confirmNewPinInput}
                  onChange={(e) => {
                    setConfirmNewPinInput(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="একই পিন আবার লেখো"
                  className="w-full text-center tracking-widest font-mono text-base py-2 px-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPin((prev) => !prev)}
                  aria-label={showConfirmNewPin ? 'পিন লুকাও' : 'পিন দেখো'}
                  title={showConfirmNewPin ? 'লুকাও (Hide)' : 'দেখো (Show)'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {showConfirmNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[42px] py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors shadow-xs flex items-center justify-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'তৈরি হচ্ছে...' : 'পিন তৈরি করো ও প্রবেশ করো'}</span>
            </button>
          </form>
        ) : activeMode !== 'change_pin' ? (
          /* Single PIN verification form (login, turn_off, add_note, delete_note) */
          <form onSubmit={handleVerify} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {activeMode === 'turn_off'
                  ? 'শিক্ষক মোড বন্ধ করতে তোমার বর্তমান / আগের পিন দিয়ে নিশ্চিত করো: *'
                  : activeMode === 'add_note'
                  ? 'নোটস যোগ করতে তোমার শিক্ষক পিন দিয়ে নিশ্চিত করো: *'
                  : activeMode === 'delete_note'
                  ? 'নোটস মুছে ফেলতে তোমার শিক্ষক পিন দিয়ে নিশ্চিত করো: *'
                  : 'তোমার তৈরি করা শিক্ষক পিন দাও: *'}
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="তোমার পিন লেখো"
                  autoFocus
                  className="w-full text-center tracking-widest text-lg font-mono py-2 px-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  aria-label={showPin ? 'পিন লুকাও' : 'পিন দেখো'}
                  title={showPin ? 'লুকাও (Hide)' : 'দেখো (Show)'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full min-h-[42px] py-2 font-bold rounded-xl text-xs sm:text-sm transition-colors shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                activeMode === 'turn_off'
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {activeMode === 'delete_note' ? (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>{loading ? 'যাচাই হচ্ছে...' : 'পিন যাচাই করে মুছে ফেলো'}</span>
                </>
              ) : activeMode === 'add_note' ? (
                <>
                  <Upload className="w-4 h-4" />
                  <span>{loading ? 'যাচাই হচ্ছে...' : 'পিন নিশ্চিত করে নোটস যোগ করো'}</span>
                </>
              ) : activeMode === 'turn_off' ? (
                <>
                  <PowerOff className="w-4 h-4" />
                  <span>{loading ? 'যাচাই হচ্ছে...' : 'শিক্ষক মোড বন্ধ করো'}</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'প্রবেশ হচ্ছে...' : 'প্রবেশ করো (Login)'}</span>
                </>
              )}
            </button>

            {activeMode === 'login' && (
              <div className="pt-1 flex flex-col items-center gap-1.5 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('change_pin');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  পিন পরিবর্তন করতে চাও? (আগের পিন লাগবে)
                </button>
                {teacherLoggedIn && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode('turn_off');
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 underline"
                  >
                    শিক্ষক মোড বন্ধ করতে চাও? (আগের পিন লাগবে)
                  </button>
                )}
              </div>
            )}
          </form>
        ) : (
          /* Change PIN Form - Previous PIN Confirmation is Strictly Mandatory */
          <form onSubmit={handleChangePin} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ১. তোমার বর্তমান / আগের পিন দিয়ে নিশ্চিত করো: *
              </label>
              <div className="relative">
                <input
                  type={showPreviousPin ? 'text' : 'password'}
                  maxLength={8}
                  value={previousPinInput}
                  onChange={(e) => {
                    setPreviousPinInput(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="আগের পিন লেখো"
                  autoFocus
                  className="w-full text-center tracking-widest font-mono text-sm py-2 px-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPreviousPin((prev) => !prev)}
                  aria-label={showPreviousPin ? 'আগের পিন লুকাও' : 'আগের পিন দেখো'}
                  title={showPreviousPin ? 'লুকাও (Hide)' : 'দেখো (Show)'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {showPreviousPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ২. তোমার নতুন পিন লেখো (কমপক্ষে ৪ সংখ্যা): *
              </label>
              <div className="relative">
                <input
                  type={showNewPin ? 'text' : 'password'}
                  maxLength={8}
                  value={newPinInput}
                  onChange={(e) => {
                    setNewPinInput(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="নতুন পিন"
                  className="w-full text-center tracking-widest font-mono text-sm py-2 px-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin((prev) => !prev)}
                  aria-label={showNewPin ? 'নতুন পিন লুকাও' : 'নতুন পিন দেখো'}
                  title={showNewPin ? 'লুকাও (Hide)' : 'দেখো (Show)'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ৩. নতুন পিনটি পুনরায় লিখে নিশ্চিত করো: *
              </label>
              <div className="relative">
                <input
                  type={showConfirmNewPin ? 'text' : 'password'}
                  maxLength={8}
                  value={confirmNewPinInput}
                  onChange={(e) => {
                    setConfirmNewPinInput(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="নতুন পিন আবার লেখো"
                  className="w-full text-center tracking-widest font-mono text-sm py-2 px-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPin((prev) => !prev)}
                  aria-label={showConfirmNewPin ? 'নিশ্চিত করা পিন লুকাও' : 'নিশ্চিত করা পিন দেখো'}
                  title={showConfirmNewPin ? 'লুকাও (Hide)' : 'দেখো (Show)'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {showConfirmNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setActiveMode('login');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                {loading ? 'যাচাই হচ্ছে...' : 'পিন পরিবর্তন করো'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
