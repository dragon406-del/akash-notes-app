import React, { useMemo, useState } from 'react';
import { 
  X, 
  Layers, 
  BookOpen, 
  Globe, 
  Landmark, 
  Brain, 
  Scroll, 
  Sparkles, 
  Check, 
  AlertCircle,
  GraduationCap
} from 'lucide-react';
import { SubjectItem } from '../types';
import {
  ALL_CLASS_IDS,
  getSubjectAllowedClasses,
  isSubjectAllowedForClass,
} from '../data/defaultData';

interface AddSubjectModalProps {
  selectedClassId: string;
  selectedClassLabel: string;
  allSubjects: SubjectItem[];
  onAddSubject: (subject: SubjectItem) => Promise<void> | void;
  onClose: () => void;
}

const AVAILABLE_ICONS = [
  { name: 'BookOpen', label: 'বই (Book)', icon: <BookOpen className="w-4 h-4" /> },
  { name: 'Globe', label: 'ভূগোল (Globe)', icon: <Globe className="w-4 h-4" /> },
  { name: 'Landmark', label: 'স্মারক (History)', icon: <Landmark className="w-4 h-4" /> },
  { name: 'Brain', label: 'দর্শন (Philosophy)', icon: <Brain className="w-4 h-4" /> },
  { name: 'Scroll', label: 'পুঁথি (Sanskrit)', icon: <Scroll className="w-4 h-4" /> },
  { name: 'Sparkles', label: 'সাধারণ (General)', icon: <Sparkles className="w-4 h-4" /> },
];

const PRESET_SUBJECTS = [
  { nameBn: 'রাষ্ট্রবিজ্ঞান', nameEn: 'Political Science', code: 'POLS', icon: 'Landmark', desc: 'সংবিধান, আন্তর্জাতিক সম্পর্ক ও রাষ্ট্রীয় তত্ত্ব' },
  { nameBn: 'শিক্ষাবিজ্ঞান', nameEn: 'Education', code: 'EDUN', icon: 'BookOpen', desc: 'শিক্ষা মনোবিজ্ঞান ও শিক্ষাদর্শন' },
  { nameBn: 'ইংরেজি', nameEn: 'English', code: 'ENG', icon: 'BookOpen', desc: 'Prose, Poetry, Grammar & Writing Skills' },
  { nameBn: 'অর্থনীতি', nameEn: 'Economics', code: 'ECON', icon: 'Brain', desc: 'ব্যষ্টিক ও সামগ্রিক অর্থনীতি এবং ভারতীয় অর্থনীতি' },
  { nameBn: 'সমাজবিদ্যা', nameEn: 'Sociology', code: 'SOC', icon: 'Sparkles', desc: 'সমাজ কাঠামো ও সামাজিক পরিবর্তন' },
];

export const AddSubjectModal: React.FC<AddSubjectModalProps> = ({
  selectedClassId,
  selectedClassLabel,
  allSubjects,
  onAddSubject,
  onClose,
}) => {
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState('');
  const [icon, setIcon] = useState('BookOpen');
  const [color] = useState('amber');
  const [descriptionBn, setDescriptionBn] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Existing subjects that are not yet active in the currently selected class scope
  const readdableSubjects = useMemo(() => {
    if (selectedClassId === 'all') {
      return allSubjects.filter((sub) => {
        const allowed = getSubjectAllowedClasses(sub);
        return allowed ? allowed.length < ALL_CLASS_IDS.length : false;
      });
    }
    return allSubjects.filter((sub) => !isSubjectAllowedForClass(sub, selectedClassId));
  }, [allSubjects, selectedClassId]);

  const handleApplyPreset = (preset: typeof PRESET_SUBJECTS[0]) => {
    setNameBn(preset.nameBn);
    setNameEn(preset.nameEn);
    setCode(preset.code);
    setIcon(preset.icon);
    setDescriptionBn(preset.desc);
    setErrorMsg('');
  };

  const handleReaddExisting = async (existing: SubjectItem) => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const classesToAdd = selectedClassId === 'all' ? [...ALL_CLASS_IDS] : [selectedClassId];
      const existingAllowed = getSubjectAllowedClasses(existing) ?? [...ALL_CLASS_IDS];
      const mergedAllowed = Array.from(new Set([...existingAllowed, ...classesToAdd]));

      await onAddSubject({
        ...existing,
        allowedClasses: mergedAllowed,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'বিষয়টি যোগ করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameBn.trim()) {
      setErrorMsg('বিষয়ের নাম (বাংলায়) লেখো।');
      return;
    }

    const cleanNameBn = nameBn.trim().slice(0, 100);
    const existingMatch = allSubjects.find(
      (s) => s.nameBn.trim().toLowerCase() === cleanNameBn.toLowerCase()
    );

    const classesToAdd = selectedClassId === 'all' ? [...ALL_CLASS_IDS] : [selectedClassId];
    const cleanCode = (code.trim() || nameEn.slice(0, 4) || 'SUB').toUpperCase().slice(0, 20);
    const generatedId =
      existingMatch?.id ||
      nameEn.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) ||
      `sub-${Date.now()}`;

    const existingAllowed = existingMatch
      ? getSubjectAllowedClasses(existingMatch) ?? [...ALL_CLASS_IDS]
      : [];
    const mergedAllowed = Array.from(new Set([...existingAllowed, ...classesToAdd]));

    const newSubject: SubjectItem = {
      id: generatedId,
      nameBn: cleanNameBn,
      nameEn: (nameEn.trim() || existingMatch?.nameEn || cleanNameBn).slice(0, 100),
      code: cleanCode,
      icon,
      color: existingMatch?.color || color,
      descriptionBn: (
        descriptionBn.trim() ||
        existingMatch?.descriptionBn ||
        'শিক্ষকের আপলোডকৃত বিশেষ নোটস ও স্টাডি মেটেরিয়াল'
      ).slice(0, 400),
      isCustom: existingMatch ? Boolean(existingMatch.isCustom) : true,
      allowedClasses: mergedAllowed,
    };

    setSubmitting(true);
    setErrorMsg('');
    try {
      await onAddSubject(newSubject);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'বিষয়টি যোগ করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">নতুন বিষয় যোগ করো</h3>
              <p className="text-[11px] text-slate-500">Add Subject</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Class Scope Indicator */}
        <div className="mb-3.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-900">
          <GraduationCap className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            {selectedClassId === 'all' ? (
              <>
                <strong>সকল শ্রেণি</strong> নির্বাচিত — বিষয়টি ৬ষ্ঠ থেকে ১২শ শ্রেণির সব ক্লাসে যোগ হবে।
              </>
            ) : (
              <>
                নির্বাচিত শ্রেণি: <strong>{selectedClassLabel}</strong> — বিষয়টি শুধুমাত্র এই শ্রেণিতে যোগ হবে।
              </>
            )}
          </span>
        </div>

        {/* Existing Subjects from other classes that can be added to this class */}
        {readdableSubjects.length > 0 && (
          <div className="mb-3.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="block text-[11px] font-bold text-slate-600 mb-1.5">
              {selectedClassId === 'all'
                ? 'আংশিক শ্রেণির বিষয়গুলো সকল শ্রেণিতে যোগ করো:'
                : 'অন্য শ্রেণির বিষয়টি এই শ্রেণিতে যোগ করো:'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {readdableSubjects.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReaddExisting(sub)}
                  className="text-xs py-1 px-2.5 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 hover:text-emerald-800 font-semibold transition-colors"
                >
                  + {sub.nameBn}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Suggestion Presets */}
        <div className="mb-3.5">
          <span className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
            জনপ্রিয় বিষয় থেকে দ্রুত নির্বাচন করো:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_SUBJECTS.map((preset) => (
              <button
                key={preset.code}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="text-xs py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 font-medium transition-colors"
              >
                + {preset.nameBn}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200 mb-3">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              বিষয়ের নাম (বাংলায়) *
            </label>
            <input
              type="text"
              value={nameBn}
              onChange={(e) => setNameBn(e.target.value)}
              placeholder="যেমন: রাষ্ট্রবিজ্ঞান"
              className="w-full py-2 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ইংরেজি নাম (English)
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Political Science"
                className="w-full py-2 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                বিষয় কোড (Code)
              </label>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="POLS"
                className="w-full py-2 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
          </div>

          {/* Icon Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              প্রতীক চিহ্ন (Icon) নির্বাচন করো
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {AVAILABLE_ICONS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setIcon(item.name)}
                  className={`py-1.5 px-2 rounded-xl text-xs flex items-center justify-center gap-1.5 border transition-all ${
                    icon === item.name
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              সংক্ষিপ্ত বিবরণ (ঐচ্ছিক)
            </label>
            <textarea
              rows={2}
              value={descriptionBn}
              onChange={(e) => setDescriptionBn(e.target.value)}
              placeholder="বিষয়টির সংক্ষিপ্ত রূপ..."
              className="w-full py-1.5 px-3 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>

          <div className="pt-1 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{submitting ? 'যোগ হচ্ছে...' : 'যোগ করো'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
