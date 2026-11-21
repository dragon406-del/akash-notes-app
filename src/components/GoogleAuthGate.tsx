import React, { useState } from 'react';
import { BookOpen, LogIn, ShieldCheck, AlertCircle, WifiOff, Copy, Check } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { setAuthPopupActive } from '../hooks/useScreenProtection';

interface GoogleAuthGateProps {
  isOnline: boolean;
}

export const GoogleAuthGate: React.FC<GoogleAuthGateProps> = ({ isOnline }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');
    setAuthPopupActive(true);
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      setAuthPopupActive(false);
      setLoading(false);
      setErrorMsg(
        'Google সাইন-ইন পপ-আপ থেকে কোনো উত্তর পাওয়া যায়নি। ব্রাউজার পপ-আপ অনুমতি দিয়ে আবার চেষ্টা করো অথবা লিঙ্কটি সরাসরি Chrome / Safari-তে খোলো।'
      );
    }, 25000);

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (timedOut) return;
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      const msg = err instanceof Error ? err.message : '';
      const combined = `${code} ${msg}`.toLowerCase();

      if (combined.includes('popup-closed-by-user') || combined.includes('cancelled-popup-request')) {
        setErrorMsg('সাইন-ইন পপ-আপ বন্ধ হয়ে গেছে। আবার চেষ্টা করো।');
      } else if (combined.includes('popup-blocked')) {
        setErrorMsg(
          'ব্রাউজারে পপ-আপ ব্লক করা আছে। ব্রাউজার সেটিংস থেকে পপ-আপ চালু করো অথবা লিঙ্কটি সরাসরি Chrome / Safari ব্রাউজারে খোলো।'
        );
      } else if (combined.includes('operation-not-supported-in-this-environment')) {
        setErrorMsg(
          'এই ইন-অ্যাপ ব্রাউজারে Google লগইন সমর্থিত নয়। অনুগ্রহ করে লিঙ্কটি Chrome বা Safari ব্রাউজারে খোলো।'
        );
      } else if (combined.includes('unauthorized-domain')) {
        setErrorMsg(
          'এই ওয়েবসাইট ডোমেইনটি এখনও অনুমোদিত নয়। কিছুক্ষণ পর চেষ্টা করো বা শিক্ষককে জানাও।'
        );
      } else if (combined.includes('network-request-failed')) {
        setErrorMsg('ইন্টারনেট সংযোগে সমস্যা হচ্ছে। নেটওয়ার্ক যাচাই করে আবার চেষ্টা করো।');
      } else {
        setErrorMsg('গুগল অ্যাকাউন্ট দিয়ে যুক্ত হতে সমস্যা হয়েছে। লিঙ্কটি Chrome / Safari-তে খুলে আবার চেষ্টা করো।');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (!timedOut) {
        setAuthPopupActive(false);
        setLoading(false);
      }
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(false);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">
              আকাশ স্যারের নোটস
            </h1>
            <p className="text-xs text-slate-400">তোমার ডিজিটাল অফলাইন পাঠশালা</p>
          </div>
        </div>

        <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 mb-5">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              সকল ডিভাইসে রিয়েল-টাইম নোটস এবং শিক্ষকের প্রবেশ-অনুমতি নিরাপদ রাখতে তোমার Google অ্যাকাউন্ট দিয়ে একবার যুক্ত হও।
            </p>
          </div>
        </div>

        {!isOnline && (
          <div className="bg-amber-950/60 border border-amber-700/70 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-amber-200">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>তুমি অফলাইনে আছো। প্রথমবার যুক্ত হতে ইন্টারনেট চালু করো।</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-950/70 border border-rose-700 rounded-xl p-3 mb-4 space-y-2 text-xs text-rose-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="w-full py-1.5 px-3 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-rose-700/60 text-slate-200 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'লিঙ্ক কপি হয়েছে! এখন Chrome-এ পেস্ট করো' : 'অ্যাপের লিঙ্ক কপি করো (Chrome-এ খোলার জন্য)'}</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading || !isOnline}
          className="w-full min-h-[44px] py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>{loading ? 'যুক্ত হচ্ছে...' : 'Google দিয়ে প্রবেশ করো'}</span>
        </button>
      </div>
    </div>
  );
};
