import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ShieldAlert,
  Send,
  Clock,
  RefreshCw,
  UserCheck,
  XCircle,
  Lock,
  GraduationCap,
  Check,
  Layers,
} from 'lucide-react';
import { AccessStatus } from '../services/api';
import { SubjectItem } from '../types';
import {
  ALL_CLASS_IDS,
  DEFAULT_CLASSES,
  isSubjectAllowedForClass,
  isSubjectChoiceClass,
} from '../data/defaultData';

interface StudentAccessGateProps {
  accessStatus: AccessStatus;
  isOnline: boolean;
  subjects: SubjectItem[];
  initialClassId?: string;
  initialSubjectIds?: string[];
  initialLabel?: string;
  onSendRequest: (
    requestedClassId: string,
    studentLabel?: string,
    requestedSubjectIds?: string[]
  ) => Promise<void>;
  onRefreshStatus: () => Promise<void>;
  onOpenTeacherRecovery?: () => void;
}

const CLASS_OPTIONS = DEFAULT_CLASSES.filter((c) => c.id !== 'all');

export const StudentAccessGate: React.FC<StudentAccessGateProps> = ({
  accessStatus,
  isOnline,
  subjects,
  initialClassId,
  initialSubjectIds,
  initialLabel,
  onSendRequest,
  onRefreshStatus,
  onOpenTeacherRecovery,
}) => {
  const [selectedClassId, setSelectedClassId] = useState(
    initialClassId && ALL_CLASS_IDS.includes(initialClassId) ? initialClassId : ''
  );
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(
    initialClassId && isSubjectChoiceClass(initialClassId) && Array.isArray(initialSubjectIds)
      ? initialSubjectIds
      : []
  );
  const [studentName, setStudentName] = useState(initialLabel || '');
  const [submitting, setSubmitting] = useState(false);
  const [sentNotice, setSentNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialClassId && ALL_CLASS_IDS.includes(initialClassId)) {
      setSelectedClassId((prev) => prev || initialClassId);
    }
  }, [initialClassId]);

  useEffect(() => {
    if (
      initialClassId &&
      isSubjectChoiceClass(initialClassId) &&
      Array.isArray(initialSubjectIds) &&
      initialSubjectIds.length > 0
    ) {
      setSelectedSubjectIds((prev) => (prev.length > 0 ? prev : initialSubjectIds));
    }
  }, [initialClassId, initialSubjectIds]);

  useEffect(() => {
    if (initialLabel) {
      setStudentName((prev) => prev || initialLabel);
    }
  }, [initialLabel]);

  const showSubjectChoice = isSubjectChoiceClass(selectedClassId);

  const availableSubjectsForClass = useMemo(() => {
    if (!showSubjectChoice) return [];
    return subjects.filter((sub) => isSubjectAllowedForClass(sub, selectedClassId));
  }, [subjects, selectedClassId, showSubjectChoice]);

  useEffect(() => {
    if (!showSubjectChoice) return;
    const validIds = new Set(availableSubjectsForClass.map((s) => s.id));
    setSelectedSubjectIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [availableSubjectsForClass, showSubjectChoice]);

  const requestedClassInfo = initialClassId
    ? CLASS_OPTIONS.find((c) => c.id === initialClassId)
    : undefined;

  const requestedSubjectNames = useMemo(() => {
    if (!initialClassId || !isSubjectChoiceClass(initialClassId) || !initialSubjectIds?.length) {
      return [];
    }
    return initialSubjectIds
      .map((id) => subjects.find((s) => s.id === id)?.nameBn || id)
      .filter(Boolean);
  }, [initialClassId, initialSubjectIds, subjects]);

  const toggleSubjectSelection = (subjectId: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId]
    );
    setErrorMsg('');
    setSentNotice(false);
  };

  const handleSelectAllSubjects = () => {
    const allIds = availableSubjectsForClass.map((s) => s.id);
    if (selectedSubjectIds.length === allIds.length) {
      setSelectedSubjectIds([]);
    } else {
      setSelectedSubjectIds(allIds);
    }
    setErrorMsg('');
    setSentNotice(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId || !ALL_CLASS_IDS.includes(selectedClassId)) {
      setErrorMsg('অনুগ্রহ করে তোমার শ্রেণি নির্বাচন করো।');
      return;
    }

    if (showSubjectChoice && selectedSubjectIds.length === 0) {
      setErrorMsg('একাদশ ও দ্বাদশ শ্রেণির জন্য অনুগ্রহ করে অন্তত একটি বিষয় নির্বাচন করো।');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await onSendRequest(
        selectedClassId,
        studentName.trim() || undefined,
        showSubjectChoice ? selectedSubjectIds : undefined
      );
      setSentNotice(true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'অনুমতির অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করো।'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      await onRefreshStatus();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'সার্ভারের সাথে সংযোগ করা যায়নি।'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl">
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">আকাশ স্যারের নোটস</h1>
            <p className="text-xs text-slate-400">তোমার ডিজিটাল অফলাইন পাঠশালা</p>
          </div>
        </div>

        {/* Status Card */}
        {accessStatus === 'denied' ? (
          <div className="bg-rose-950/60 border border-rose-800/80 rounded-2xl p-4 mb-5">
            <div className="flex items-start gap-2.5">
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-rose-200 mb-1">
                  প্রবেশের অনুমতি বাতিল করা হয়েছে
                </h2>
                <p className="text-xs text-rose-200/80 leading-relaxed">
                  শিক্ষক তোমার এই ডিভাইসটির প্রবেশের অনুরোধ বাতিল করেছেন। প্রয়োজন হলে নিচে তোমার শ্রেণি নির্বাচন করে ও নাম লিখে পুনরায় অনুমতি চাইতে পারো।
                </p>
              </div>
            </div>
          </div>
        ) : accessStatus === 'needs_permission' ? (
          <div className="bg-sky-950/50 border border-sky-700/60 rounded-2xl p-4 mb-5">
            <div className="flex items-start gap-2.5">
              <Send className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-sky-200 mb-1">
                  অ্যাপে প্রবেশের জন্য শিক্ষকের অনুমতি প্রয়োজন
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  অ্যাপ ও নোটস খোলার জন্য নিচে তোমার <strong>শ্রেণি নির্বাচন করো</strong> ও নাম লিখে শিক্ষকের কাছে অনুমতির অনুরোধ পাঠাও। শিক্ষক অনুমতি দিলে কেবল তোমার অনুমোদিত শ্রেণির নোটস দেখতে পারবে।
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-950/40 border border-amber-700/60 rounded-2xl p-4 mb-5">
            <div className="flex items-start gap-2.5">
              <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-amber-200 mb-1">
                  শিক্ষকের অনুমতির জন্য অপেক্ষা করা হচ্ছে
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  তোমার ডিভাইস থেকে শিক্ষকের কাছে অনুমতির বার্তা পাঠানো হয়েছে। শিক্ষক অনুমতি দিলে তুমি স্বয়ংক্রিয়ভাবে প্রবেশ করতে পারবে।
                </p>
                {requestedClassInfo && (
                  <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-200">
                    <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                    <span>নির্বাচিত শ্রেণি: {requestedClassInfo.nameBn}</span>
                  </p>
                )}
                {requestedSubjectNames.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-slate-300 leading-relaxed">
                    নির্বাচিত বিষয়সমূহ: <span className="font-semibold text-amber-200">{requestedSubjectNames.join(' · ')}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-amber-300">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>তুমি এখন অফলাইনে আছো। প্রথমবার শিক্ষকের অনুমতি নেওয়ার জন্য ইন্টারনেট চালু করো।</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-950/70 border border-rose-700 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-rose-200">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Student class, Class 11/12 subject choice, & name form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              তোমার শ্রেণি নির্বাচন করো (Class) *
            </label>
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  const nextClass = e.target.value;
                  setSelectedClassId(nextClass);
                  if (!isSubjectChoiceClass(nextClass)) {
                    setSelectedSubjectIds([]);
                  }
                  setErrorMsg('');
                  setSentNotice(false);
                }}
                required
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <option value="">-- তোমার শ্রেণি বেছে নাও --</option>
                {CLASS_OPTIONS.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.nameBn}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {showSubjectChoice
                ? 'একাদশ ও দ্বাদশ শ্রেণির জন্য তুমি নিচে নিজের পছন্দের বিষয়গুলো বেছে নিতে পারবে।'
                : 'তুমি শুধুমাত্র তোমার অনুমোদিত শ্রেণির নোটসই দেখতে ও পড়তে পারবে।'}
            </p>
          </div>

          {/* Class 11 & 12 Only Subject Choice */}
          {showSubjectChoice && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span>কোন কোন বিষয়ের নোটস চাও? *</span>
                </label>
                {availableSubjectsForClass.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllSubjects}
                    className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2 shrink-0 cursor-pointer"
                  >
                    {selectedSubjectIds.length === availableSubjectsForClass.length
                      ? 'সব বাদ দাও'
                      : 'সবগুলো বেছে নাও'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableSubjectsForClass.map((sub) => {
                  const isChecked = selectedSubjectIds.includes(sub.id);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      aria-pressed={isChecked}
                      onClick={() => toggleSubjectSelection(sub.id)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{sub.nameBn}</p>
                        <p className="text-[10px] text-slate-400 truncate">{sub.nameEn}</p>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          isChecked
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-950 border-slate-600 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-slate-400 tabular-nums">
                নির্বাচিত বিষয়: {selectedSubjectIds.length} / {availableSubjectsForClass.length}টি (শিক্ষক চূড়ান্ত বিষয় অনুমোদন করবেন)
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              তোমার নাম লেখো (যাতে স্যার তোমাকে চিনতে পারেন):
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => {
                setStudentName(e.target.value);
                setSentNotice(false);
              }}
              placeholder="যেমন: অর্ণব মণ্ডল"
              maxLength={60}
              className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !isOnline}
            className="w-full min-h-[44px] py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>
              {accessStatus === 'denied'
                ? 'আবার অনুমতির অনুরোধ পাঠাও'
                : accessStatus === 'needs_permission'
                ? 'শিক্ষকের কাছে অনুমতির অনুরোধ পাঠাও'
                : 'তথ্যসহ আবার অনুমতি পাঠাও'}
            </span>
          </button>
        </form>

        {sentNotice && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-300 flex items-center gap-2">
            <UserCheck className="w-4 h-4 shrink-0" />
            <span>তোমার অনুরোধের বার্তা শিক্ষকের ডিভাইসে পাঠানো হয়েছে!</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={submitting || !isOnline}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${submitting ? 'animate-spin' : ''}`} />
            <span>অবস্থা যাচাই করো</span>
          </button>

          {onOpenTeacherRecovery && (
            <button
              type="button"
              onClick={onOpenTeacherRecovery}
              className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <Lock className="w-3 h-3" />
              <span>শিক্ষক পিন অপশন</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
