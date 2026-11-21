import React, { useState } from 'react';
import {
  X,
  UserCheck,
  XCircle,
  Smartphone,
  Clock,
  ShieldCheck,
  Trash2,
  RefreshCw,
  GraduationCap,
  AlertCircle,
  Check,
  BookOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { PendingAccessRequest, PermittedDevice } from '../services/api';
import { SubjectItem } from '../types';
import {
  ALL_CLASS_IDS,
  DEFAULT_CLASSES,
  isSubjectAllowedForClass,
  isSubjectChoiceClass,
} from '../data/defaultData';

interface TeacherRequestsModalProps {
  subjects: SubjectItem[];
  pendingRequests: PendingAccessRequest[];
  permittedDevices: PermittedDevice[];
  onApprove: (
    targetDeviceId: string,
    permittedClassId: string,
    permittedSubjectIds?: string[]
  ) => Promise<void>;
  onDeny: (targetDeviceId: string) => Promise<void>;
  onRevoke: (targetDeviceId: string) => Promise<void>;
  onUpdatePermittedAccess: (
    targetDeviceId: string,
    newClassId: string,
    newSubjectIds?: string[]
  ) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onClose: () => void;
}

const CLASS_OPTIONS = DEFAULT_CLASSES.filter((c) => c.id !== 'all');

function getClassNameBn(classId?: string): string | null {
  if (!classId) return null;
  return CLASS_OPTIONS.find((c) => c.id === classId)?.nameBn || null;
}

export const TeacherRequestsModal: React.FC<TeacherRequestsModalProps> = ({
  subjects,
  pendingRequests,
  permittedDevices,
  onApprove,
  onDeny,
  onRevoke,
  onUpdatePermittedAccess,
  onRefresh,
  onClose,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClassByReq, setSelectedClassByReq] = useState<Record<string, string>>({});
  const [selectedSubjectsByReq, setSelectedSubjectsByReq] = useState<Record<string, string[]>>({});
  const [editingSubjectsDeviceId, setEditingSubjectsDeviceId] = useState<string | null>(null);
  const [draftSubjectsByDev, setDraftSubjectsByDev] = useState<Record<string, string[]>>({});
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const getAvailableSubjectsForClass = (classId: string) =>
    subjects.filter((sub) => isSubjectAllowedForClass(sub, classId));

  const formatSubjectNames = (subjectIds: string[] | undefined): string => {
    if (!subjectIds || subjectIds.length === 0) return '';
    return subjectIds
      .map((id) => subjects.find((s) => s.id === id)?.nameBn || id)
      .join(' · ');
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const getSelectedClassForRequest = (req: PendingAccessRequest) => {
    if (selectedClassByReq[req.deviceId] !== undefined) {
      return selectedClassByReq[req.deviceId];
    }
    return req.requestedClassId && ALL_CLASS_IDS.includes(req.requestedClassId)
      ? req.requestedClassId
      : '';
  };

  const getSelectedSubjectsForRequest = (
    req: PendingAccessRequest,
    classId: string
  ): string[] => {
    if (!isSubjectChoiceClass(classId)) return [];
    const allowedIds = getAvailableSubjectsForClass(classId).map((s) => s.id);
    const allowedSet = new Set(allowedIds);

    const customDraft = selectedSubjectsByReq[req.deviceId];
    if (customDraft !== undefined) {
      return customDraft.filter((id) => allowedSet.has(id));
    }

    if (Array.isArray(req.requestedSubjectIds) && req.requestedSubjectIds.length > 0) {
      const requestedValid = req.requestedSubjectIds.filter((id) => allowedSet.has(id));
      if (requestedValid.length > 0) return requestedValid;
    }

    return allowedIds;
  };

  const toggleRequestSubject = (req: PendingAccessRequest, classId: string, subjectId: string) => {
    const current = getSelectedSubjectsForRequest(req, classId);
    const next = current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId];
    setSelectedSubjectsByReq((prev) => ({
      ...prev,
      [req.deviceId]: next,
    }));
    setActionError('');
  };

  const handleApproveClick = async (req: PendingAccessRequest) => {
    const classToPermit = getSelectedClassForRequest(req);
    if (!classToPermit || !ALL_CLASS_IDS.includes(classToPermit)) {
      setActionError('শিক্ষার্থীকে অনুমতি দেওয়ার আগে একটি শ্রেণি নির্বাচন করো।');
      return;
    }

    let subjectsToPermit: string[] | undefined;
    if (isSubjectChoiceClass(classToPermit)) {
      subjectsToPermit = getSelectedSubjectsForRequest(req, classToPermit);
      if (subjectsToPermit.length === 0) {
        setActionError('একাদশ ও দ্বাদশ শ্রেণির শিক্ষার্থীর জন্য অন্তত একটি বিষয় নির্বাচন করো।');
        return;
      }
    }

    setActionError('');
    setBusyDeviceId(req.deviceId);
    try {
      await onApprove(req.deviceId, classToPermit, subjectsToPermit);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'অনুমতি দেওয়া যায়নি।');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleDenyClick = async (deviceId: string) => {
    setActionError('');
    setBusyDeviceId(deviceId);
    try {
      await onDeny(deviceId);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleRevokeClick = async (deviceId: string) => {
    setActionError('');
    setBusyDeviceId(deviceId);
    try {
      await onRevoke(deviceId);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleClassChange = async (dev: PermittedDevice, newClassId: string) => {
    if (!ALL_CLASS_IDS.includes(newClassId)) return;
    setActionError('');
    setBusyDeviceId(dev.deviceId);
    try {
      if (isSubjectChoiceClass(newClassId)) {
        const allowedForNewClass = getAvailableSubjectsForClass(newClassId).map((s) => s.id);
        const existingValid = Array.isArray(dev.permittedSubjectIds)
          ? dev.permittedSubjectIds.filter((id) => allowedForNewClass.includes(id))
          : [];
        const initialSubjects = existingValid.length > 0 ? existingValid : allowedForNewClass;
        await onUpdatePermittedAccess(dev.deviceId, newClassId, initialSubjects);
        setDraftSubjectsByDev((prev) => ({
          ...prev,
          [dev.deviceId]: initialSubjects,
        }));
        setEditingSubjectsDeviceId(dev.deviceId);
      } else {
        await onUpdatePermittedAccess(dev.deviceId, newClassId, undefined);
        if (editingSubjectsDeviceId === dev.deviceId) {
          setEditingSubjectsDeviceId(null);
        }
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'শ্রেণি পরিবর্তন করা যায়নি।');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const openDeviceSubjectEditor = (dev: PermittedDevice) => {
    if (!dev.permittedClassId || !isSubjectChoiceClass(dev.permittedClassId)) return;
    if (editingSubjectsDeviceId === dev.deviceId) {
      setEditingSubjectsDeviceId(null);
      return;
    }
    const allowedIds = getAvailableSubjectsForClass(dev.permittedClassId).map((s) => s.id);
    const current =
      Array.isArray(dev.permittedSubjectIds) && dev.permittedSubjectIds.length > 0
        ? dev.permittedSubjectIds.filter((id) => allowedIds.includes(id))
        : allowedIds;
    setDraftSubjectsByDev((prev) => ({
      ...prev,
      [dev.deviceId]: current.length > 0 ? current : allowedIds,
    }));
    setEditingSubjectsDeviceId(dev.deviceId);
    setActionError('');
  };

  const toggleDeviceDraftSubject = (deviceId: string, subjectId: string) => {
    const current = draftSubjectsByDev[deviceId] || [];
    const next = current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId];
    setDraftSubjectsByDev((prev) => ({
      ...prev,
      [deviceId]: next,
    }));
    setActionError('');
  };

  const handleSaveDeviceSubjects = async (dev: PermittedDevice) => {
    const classId = dev.permittedClassId;
    if (!classId || !isSubjectChoiceClass(classId)) return;
    const chosen = draftSubjectsByDev[dev.deviceId] || [];
    if (chosen.length === 0) {
      setActionError('একাদশ ও দ্বাদশ শ্রেণির শিক্ষার্থীর জন্য অন্তত একটি বিষয় নির্বাচন করো।');
      return;
    }

    setActionError('');
    setBusyDeviceId(dev.deviceId);
    try {
      await onUpdatePermittedAccess(dev.deviceId, classId, chosen);
      setEditingSubjectsDeviceId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'বিষয় পরিবর্তন করা যায়নি।');
    } finally {
      setBusyDeviceId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                শিক্ষার্থী প্রবেশের অনুমতি প্যানেল
              </h2>
              <p className="text-[11px] text-slate-400">
                শিক্ষার্থীর অনুমোদিত শ্রেণি ও (একাদশ/দ্বাদশ) বিষয় নির্ধারণ করো
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                title="নতুন অনুরোধ খুঁজো"
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          {actionError && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Pending Requests */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>অপেক্ষমান অনুমতির অনুরোধ</span>
              </h3>
              <span className="text-[11px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full tabular-nums">
                {pendingRequests.length}
              </span>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-500">
                এই মুহূর্তে কোনো নতুন ডিভাইস প্রবেশের অনুমতি চাইছে না।
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingRequests.map((req) => {
                  const requestedClassName = getClassNameBn(req.requestedClassId);
                  const chosenClass = getSelectedClassForRequest(req);
                  const isClass11Or12 = isSubjectChoiceClass(chosenClass);
                  const classSubjects = isClass11Or12
                    ? getAvailableSubjectsForClass(chosenClass)
                    : [];
                  const chosenSubjects = isClass11Or12
                    ? getSelectedSubjectsForRequest(req, chosenClass)
                    : [];
                  const isBusy = busyDeviceId === req.deviceId;

                  return (
                    <div
                      key={req.deviceId}
                      className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Smartphone className="w-4 h-4 text-amber-700 shrink-0" />
                            <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {req.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                            ID: {req.deviceId.slice(0, 14)} · {new Date(req.requestedAt).toLocaleTimeString('bn-IN')}
                          </p>
                          {isSubjectChoiceClass(req.requestedClassId) &&
                            req.requestedSubjectIds &&
                            req.requestedSubjectIds.length > 0 && (
                              <p className="text-[11px] text-amber-950 mt-1 leading-snug">
                                শিক্ষার্থীর চাওয়া বিষয়:{' '}
                                <span className="font-semibold">
                                  {formatSubjectNames(req.requestedSubjectIds)}
                                </span>
                              </p>
                            )}
                        </div>

                        {requestedClassName ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-200/70 text-amber-950 text-[11px] font-bold shrink-0">
                            <GraduationCap className="w-3 h-3 shrink-0" />
                            <span>{requestedClassName.split(' (')[0]}</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-semibold shrink-0">
                            শ্রেণি নেই
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-amber-200/70">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <label className="text-[11px] font-semibold text-slate-700 shrink-0">
                            অনুমোদিত শ্রেণি:
                          </label>
                          <select
                            value={chosenClass}
                            disabled={isBusy}
                            onChange={(e) => {
                              const nextCls = e.target.value;
                              setSelectedClassByReq((prev) => ({
                                ...prev,
                                [req.deviceId]: nextCls,
                              }));
                              setActionError('');
                            }}
                            className="flex-1 min-w-0 py-1.5 px-2.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                          >
                            <option value="">-- শ্রেণি নির্বাচন করো --</option>
                            {CLASS_OPTIONS.map((cls) => (
                              <option key={cls.id} value={cls.id}>
                                {cls.nameBn}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveClick(req)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>অনুমতি দাও</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDenyClick(req.deviceId)}
                            className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 disabled:opacity-50 text-rose-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>বাতিল</span>
                          </button>
                        </div>
                      </div>

                      {/* Teacher subject access selector ONLY for Class 11 & 12 */}
                      {isClass11Or12 && (
                        <div className="pt-2 border-t border-amber-200/70 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>অনুমোদিত বিষয় নির্বাচন করো (Class 11/12):</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-600 tabular-nums">
                              {chosenSubjects.length}/{classSubjects.length}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {classSubjects.map((sub) => {
                              const checked = chosenSubjects.includes(sub.id);
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  disabled={isBusy}
                                  aria-pressed={checked}
                                  onClick={() =>
                                    toggleRequestSubject(req, chosenClass, sub.id)
                                  }
                                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-left text-xs font-semibold flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                                    checked
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white text-slate-700 border-amber-200 hover:border-amber-400'
                                  }`}
                                >
                                  <span className="truncate">{sub.nameBn}</span>
                                  <Check
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      checked ? 'opacity-100' : 'opacity-20'
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Permitted Devices */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>অনুমোদিত ডিভাইসসমূহ</span>
              </h3>
              <span className="text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full tabular-nums">
                {permittedDevices.length}
              </span>
            </div>

            {permittedDevices.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-500">
                এখনও কোনো শিক্ষার্থী ডিভাইস অনুমোদিত হয়নি।
              </div>
            ) : (
              <div className="space-y-2">
                {permittedDevices.map((dev) => {
                  const permittedClassId =
                    dev.permittedClassId && ALL_CLASS_IDS.includes(dev.permittedClassId)
                      ? dev.permittedClassId
                      : '';
                  const isClass11Or12 = isSubjectChoiceClass(permittedClassId);
                  const isEditingSubjects = editingSubjectsDeviceId === dev.deviceId;
                  const classSubjects = isClass11Or12
                    ? getAvailableSubjectsForClass(permittedClassId)
                    : [];
                  const draftSubjects = draftSubjectsByDev[dev.deviceId] || [];
                  const isBusy = busyDeviceId === dev.deviceId;

                  return (
                    <div
                      key={dev.deviceId}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{dev.label}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">
                            অনুমোদিত: {new Date(dev.approvedAt).toLocaleDateString('bn-IN')}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRevokeClick(dev.deviceId)}
                          className="px-2.5 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 disabled:opacity-50 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                          title="অনুমতি বাতিল করো"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>সরাও</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200/80">
                        <GraduationCap className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                          অনুমোদিত শ্রেণি:
                        </span>
                        <select
                          value={permittedClassId}
                          disabled={isBusy}
                          onChange={(e) => handleClassChange(dev, e.target.value)}
                          className={`flex-1 min-w-0 py-1 px-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                            permittedClassId
                              ? 'border-emerald-300 bg-white text-emerald-950'
                              : 'border-amber-300 bg-amber-50 text-amber-900'
                          }`}
                        >
                          <option value="">-- শ্রেণি নির্ধারিত নয় --</option>
                          {CLASS_OPTIONS.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.nameBn}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Subject permissions summary & editor ONLY for Class 11 & 12 */}
                      {isClass11Or12 && (
                        <div className="pt-2 border-t border-slate-200/80 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-600 min-w-0">
                              <span className="font-semibold text-slate-700">অনুমোদিত বিষয়: </span>
                              {dev.permittedSubjectIds && dev.permittedSubjectIds.length > 0 ? (
                                <span className="font-semibold text-emerald-800">
                                  {formatSubjectNames(dev.permittedSubjectIds)}
                                </span>
                              ) : (
                                <span className="text-slate-500">সকল উপলব্ধ বিষয়</span>
                              )}
                            </p>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openDeviceSubjectEditor(dev)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <SlidersHorizontal className="w-3 h-3" />
                              <span>{isEditingSubjects ? 'বন্ধ করো' : 'বিষয় পরিবর্তন'}</span>
                            </button>
                          </div>

                          {isEditingSubjects && (
                            <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                              <div className="grid grid-cols-2 gap-1.5">
                                {classSubjects.map((sub) => {
                                  const checked = draftSubjects.includes(sub.id);
                                  return (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      disabled={isBusy}
                                      aria-pressed={checked}
                                      onClick={() => toggleDeviceDraftSubject(dev.deviceId, sub.id)}
                                      className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border text-left text-xs font-semibold flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                                        checked
                                          ? 'bg-emerald-600 text-white border-emerald-600'
                                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      <span className="truncate">{sub.nameBn}</span>
                                      <Check
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                          checked ? 'opacity-100' : 'opacity-20'
                                        }`}
                                      />
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setEditingSubjectsDeviceId(null)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                                >
                                  বাতিল
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleSaveDeviceSubjects(dev)}
                                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  বিষয় সংরক্ষণ করো
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
