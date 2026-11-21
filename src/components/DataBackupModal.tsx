import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  Database 
} from 'lucide-react';
import { storageService } from '../services/storage';

interface DataBackupModalProps {
  onRefreshData: () => void;
  onClose: () => void;
}

export const DataBackupModal: React.FC<DataBackupModalProps> = ({
  onRefreshData,
  onClose,
}) => {
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleExport = async () => {
    try {
      setIsProcessing(true);
      const json = await storageService.exportFullDatabase();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Akash_Sirer_Notes_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg({ text: 'তোমার নোটস ব্যাকআপ সফলভাবে ডাউনলোড হয়েছে!' });
    } catch {
      setStatusMsg({ text: 'ব্যাকআপ ডাউনলোডে সমস্যা হয়েছে।', isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const res = await storageService.importFullDatabase(text);
        if (res.success) {
          setStatusMsg({ text: res.message });
          onRefreshData();
        } else {
          setStatusMsg({ text: res.message, isError: true });
        }
      } catch {
        setStatusMsg({ text: 'ফাইলটি পড়তে সমস্যা হয়েছে।', isError: true });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    if (confirm('তুমি কি সমস্ত নোটস ও বিষয়বস্তু রিসেট করতে চাও?')) {
      setIsProcessing(true);
      await storageService.resetToDefaults();
      onRefreshData();
      setStatusMsg({ text: 'অ্যাপটি রিসেট করা হয়েছে।' });
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">নোটস ব্যাকআপ ও অফলাইন শেয়ার</h3>
              <p className="text-[11px] text-slate-500">Offline Sync &amp; Share</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 mb-3.5 leading-relaxed">
          ইন্টারনেট না থাকলেও ব্লুটুথ বা পেনড্রাইভের মাধ্যমে অন্য ডিভাইসে সম্পূর্ণ নোটস শেয়ার করো বা অন্য ডিভাইস থেকে নোটস ফাইল নিয়ে আসো।
        </p>

        {statusMsg && (
          <div
            className={`flex items-center gap-2 p-2.5 rounded-xl text-xs mb-3.5 border ${
              statusMsg.isError
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {statusMsg.isError ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="space-y-2.5">
          <button
            onClick={handleExport}
            disabled={isProcessing}
            className="w-full py-2.5 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-colors shadow-xs"
          >
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-400" />
              <span>তোমার নোটস ব্যাকআপ ডাউনলোড করো</span>
            </div>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">.JSON</span>
          </button>

          <label className="w-full py-2.5 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between cursor-pointer transition-colors">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-600" />
              <span>অন্য ডিভাইস থেকে নোটস ফাইল যোগ করো</span>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={isProcessing}
              className="hidden"
            />
          </label>

          <button
            onClick={handleReset}
            disabled={isProcessing}
            className="w-full py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>নোটস খালি করো (রিসেট)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
