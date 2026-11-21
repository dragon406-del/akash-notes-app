import React, { useRef, useState } from 'react';
import { 
  X, 
  Upload, 
  Plus, 
  Minus,
  Trash2, 
  Check, 
  FileUp, 
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { ChapterNote, QuestionItem, SubjectItem } from '../types';
import { auth } from '../services/firebase';
import { FIRESTORE_PDF_MAX_BYTES, firestoreService } from '../services/firestoreService';
import { storageService } from '../services/storage';
import {
  ALL_CLASS_IDS,
  DEFAULT_CLASSES,
  getSubjectAllowedClasses,
  isSubjectAllowedForClass,
} from '../data/defaultData';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const INLINE_PDF_LIMIT_BYTES = 600 * 1024; // 600 KB (fits safely inside Firestore 1 MiB document)
const PDF_CHUNK_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB chunks for reliable mobile/proxy uploads

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface TeacherUploadModalProps {
  subjects: SubjectItem[];
  defaultSubjectId?: string | null;
  defaultClassId?: string;
  chapterToEdit?: ChapterNote | null;
  initialVerifiedPin?: string;
  onVerifyPin?: (pin: string) => Promise<void>;
  onSaveChapter: (chapter: ChapterNote, pin: string) => Promise<void>;
  onClose: () => void;
}

export const TeacherUploadModal: React.FC<TeacherUploadModalProps> = ({
  subjects,
  defaultSubjectId,
  defaultClassId,
  chapterToEdit,
  initialVerifiedPin = '',
  onVerifyPin,
  onSaveChapter,
  onClose,
}) => {
  const activeSubjects = subjects.filter((s) => isSubjectAllowedForClass(s, 'all'));
  const classMatchedSubject = defaultClassId
    ? activeSubjects.find((s) => isSubjectAllowedForClass(s, defaultClassId))
    : undefined;
  const initialSubjectId =
    chapterToEdit?.subjectId ||
    defaultSubjectId ||
    classMatchedSubject?.id ||
    activeSubjects[0]?.id ||
    'bengali';
  const initialSubject = subjects.find((s) => s.id === initialSubjectId);
  const initialAllowed = getSubjectAllowedClasses(initialSubject);
  const rawInitialClass = chapterToEdit?.classLevel || defaultClassId || 'class-10';
  const resolvedInitialClass =
    initialAllowed &&
    rawInitialClass !== 'all' &&
    !initialAllowed.includes(rawInitialClass)
      ? initialAllowed[0] || 'class-10'
      : initialAllowed &&
        rawInitialClass === 'all' &&
        !ALL_CLASS_IDS.every((id) => initialAllowed.includes(id))
      ? initialAllowed[0] || 'class-10'
      : rawInitialClass;

  const [subjectId, setSubjectId] = useState<string>(initialSubjectId);
  const [classLevel, setClassLevel] = useState<string>(resolvedInitialClass);
  const [chapterNumberInput, setChapterNumberInput] = useState<string>(
    String(chapterToEdit?.chapterNumber || 1)
  );
  const [titleBn, setTitleBn] = useState<string>(chapterToEdit?.titleBn || '');
  const [titleEn, setTitleEn] = useState<string>(chapterToEdit?.titleEn || '');
  const [summaryBn, setSummaryBn] = useState<string>(chapterToEdit?.summaryBn || '');
  
  const [keyPoints, setKeyPoints] = useState<string[]>(
    chapterToEdit?.keyPoints && chapterToEdit.keyPoints.length > 0
      ? chapterToEdit.keyPoints
      : ['']
  );

  const [questions, setQuestions] = useState<QuestionItem[]>(
    chapterToEdit?.questions && chapterToEdit.questions.length > 0
      ? chapterToEdit.questions
      : [{ id: 'q-init', question: '', marks: 5, answer: '' }]
  );

  const [pdfFileName, setPdfFileName] = useState<string>(chapterToEdit?.pdfFileName || '');
  const [pdfFileSize, setPdfFileSize] = useState<string>(chapterToEdit?.pdfFileSize || '');
  const [pdfData, setPdfData] = useState<string | undefined>(chapterToEdit?.pdfData);
  const [pdfUrl, setPdfUrl] = useState<string | undefined>(chapterToEdit?.pdfUrl);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [teacherPinInput, setTeacherPinInput] = useState(initialVerifiedPin);
  const [showTeacherPin, setShowTeacherPin] = useState(false);
  const [saving, setSaving] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeUploadIdRef = useRef<string | null>(null);

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeUploadIdRef.current) {
      const cleanupId = activeUploadIdRef.current;
      activeUploadIdRef.current = null;
      fetch(`/api/pdfs/upload/${cleanupId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
    }
    onClose();
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('কেবলমাত্র আসল PDF (.pdf) ফাইল নির্বাচন করো।');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      setErrorMsg('PDF ফাইলটি সর্বোচ্চ ১০ GB-এর বেশি হতে পারবে না।');
      e.target.value = '';
      return;
    }

    const sizeString = formatFileSize(file.size);
    setErrorMsg('');

    if (file.size <= INLINE_PDF_LIMIT_BYTES) {
      setFileLoading(true);
      const reader = new FileReader();
      reader.onload = () => {
        const rawResult = String(reader.result || '');
        const b64Index = rawResult.indexOf(';base64,');
        const normalizedData =
          b64Index >= 0
            ? `data:application/pdf;base64,${rawResult.slice(b64Index + 8)}`
            : rawResult;
        setPdfData(normalizedData);
        setPdfUrl(undefined);
        setSelectedPdfFile(null);
        setPdfFileName(file.name);
        setPdfFileSize(sizeString);
        setFileLoading(false);
      };
      reader.onerror = () => {
        setErrorMsg('ফাইলটি পড়তে সমস্যা হয়েছে। অন্য ফাইল দিয়ে চেষ্টা করো।');
        setFileLoading(false);
      };
      reader.readAsDataURL(file);
    } else {
      // Large PDF (> 600 KB up to 10 GB): keep File reference for chunked streaming upload
      setSelectedPdfFile(file);
      setPdfData(undefined);
      setPdfUrl(undefined);
      setPdfFileName(file.name);
      setPdfFileSize(sizeString);
    }
    e.target.value = '';
  };

  const uploadLargePdfInChunks = async (file: File): Promise<string> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setUploadProgress(0);

    const initRes = await fetch('/api/pdfs/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, totalSize: file.size }),
      signal: controller.signal,
    });
    const initJson = (await initRes.json().catch(() => ({}))) as {
      uploadId?: string;
      error?: string;
    };
    if (!initRes.ok || !initJson.uploadId) {
      throw new Error(initJson.error || 'PDF আপলোড শুরু করা যায়নি।');
    }

    const uploadId = initJson.uploadId;
    activeUploadIdRef.current = uploadId;

    try {
      const willAttemptFirestoreBackup =
        file.size <= FIRESTORE_PDF_MAX_BYTES && Boolean(auth.currentUser);
      const serverUploadMaxPct = willAttemptFirestoreBackup ? 90 : 99;

      let offset = 0;
      while (offset < file.size) {
        const end = Math.min(offset + PDF_CHUNK_SIZE_BYTES, file.size);
        const chunk = file.slice(offset, end);

        const chunkRes = await fetch(`/api/pdfs/chunk/${uploadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunk,
          signal: controller.signal,
        });

        if (!chunkRes.ok) {
          const chunkErr = (await chunkRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(chunkErr.error || 'PDF ফাইল আপলোড করতে সমস্যা হয়েছে।');
        }

        offset = end;
        setUploadProgress(
          Math.min(serverUploadMaxPct, Math.round((offset / file.size) * serverUploadMaxPct))
        );
      }

      const completeRes = await fetch(`/api/pdfs/complete/${uploadId}`, {
        method: 'POST',
        signal: controller.signal,
      });
      const completeJson = (await completeRes.json().catch(() => ({}))) as {
        pdfId?: string;
        pdfUrl?: string;
        error?: string;
      };
      if (!completeRes.ok || !completeJson.pdfUrl) {
        throw new Error(completeJson.error || 'PDF আপলোড সম্পন্ন করা যায়নি।');
      }

      const resolvedPdfId = completeJson.pdfId || uploadId;
      if (file.size <= 100 * 1024 * 1024) {
        try {
          const buf = await file.arrayBuffer();
          await storageService.saveCachedPdf(resolvedPdfId, new Uint8Array(buf));
        } catch {
          // Best-effort local IndexedDB cache
        }
      }
      if (willAttemptFirestoreBackup && auth.currentUser) {
        try {
          await firestoreService.savePdfChunks(
            resolvedPdfId,
            file,
            auth.currentUser.uid,
            (pct) => {
              if (!controller.signal.aborted) {
                setUploadProgress(Math.min(99, 90 + Math.round(pct * 0.09)));
              }
            },
            controller.signal
          );
        } catch (cloudErr) {
          fetch(`/api/pdfs/${resolvedPdfId}`, { method: 'DELETE' }).catch(() => {});
          if (cloudErr instanceof DOMException && cloudErr.name === 'AbortError') {
            throw cloudErr;
          }
          const detail = cloudErr instanceof Error ? cloudErr.message : '';
          if (detail.includes('কোটা') || detail.includes('২৫ MB') || detail.includes('সঠিক PDF')) {
            throw new Error(detail);
          }
          throw new Error(
            'PDF ফাইলটি ক্লাউডে সংরক্ষণ করা যায়নি। ইন্টারনেট সংযোগ যাচাই করে আবার আপলোড করো।'
          );
        }
      }

      activeUploadIdRef.current = null;
      abortControllerRef.current = null;
      setUploadProgress(100);
      return completeJson.pdfUrl;
    } catch (err) {
      if (activeUploadIdRef.current) {
        const cleanupId = activeUploadIdRef.current;
        activeUploadIdRef.current = null;
        fetch(`/api/pdfs/upload/${cleanupId}`, { method: 'DELETE' }).catch(() => {});
      }
      abortControllerRef.current = null;
      throw err;
    }
  };

  const handleAddPoint = () => setKeyPoints([...keyPoints, '']);
  const handlePointChange = (idx: number, text: string) => {
    const updated = [...keyPoints];
    updated[idx] = text;
    setKeyPoints(updated);
  };
  const handleRemovePoint = (idx: number) => {
    setKeyPoints(keyPoints.filter((_, i) => i !== idx));
  };

  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      { id: `q-${Date.now()}`, question: '', marks: 5, answer: '' },
    ]);
  };
  const handleQuestionChange = (idx: number, field: keyof QuestionItem, val: string | number) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], [field]: val };
    setQuestions(updated);
  };
  const handleRemoveQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedPin = teacherPinInput.trim();
    if (!trimmedPin) {
      setErrorMsg('নোটস যোগ বা সংরক্ষণ করতে তোমার শিক্ষক পিন লেখো।');
      return;
    }

    const parsedChapterNumber = parseInt(chapterNumberInput.trim(), 10);
    if (!Number.isFinite(parsedChapterNumber) || parsedChapterNumber < 1 || parsedChapterNumber > 999) {
      setErrorMsg('অধ্যায় নম্বর ১ থেকে ৯৯৯ এর মধ্যে লেখো।');
      return;
    }

    if (!titleBn.trim()) {
      setErrorMsg('অধ্যায়ের নাম (বাংলায়) লেখো।');
      return;
    }

    if (!summaryBn.trim() && !pdfData && !selectedPdfFile && !pdfUrl) {
      setErrorMsg('অধ্যায়ের সারসংক্ষেপ লেখো অথবা একটি PDF ফাইল আপলোড করো।');
      return;
    }

    const cleanPoints = keyPoints.map((p) => p.trim()).filter(Boolean);
    const cleanQuestions = questions
      .filter((q) => q.question.trim().length > 0)
      .map((q, idx) => ({ ...q, id: q.id || `q-${idx}` }));

    const selectedSubject = subjects.find((s) => s.id === subjectId);
    const allowedClassesForSubject = getSubjectAllowedClasses(selectedSubject);
    const isAllClassesEnabled =
      !allowedClassesForSubject ||
      ALL_CLASS_IDS.every((id) => allowedClassesForSubject.includes(id));

    if (
      allowedClassesForSubject &&
      ((classLevel === 'all' && !isAllClassesEnabled) ||
        (classLevel !== 'all' && !allowedClassesForSubject.includes(classLevel)))
    ) {
      const allowedNames = DEFAULT_CLASSES.filter((c) =>
        allowedClassesForSubject.includes(c.id)
      )
        .map((c) => c.shortBn)
        .join(', ');
      setErrorMsg(
        `"${selectedSubject?.nameBn || 'এই বিষয়'}" কেবলমাত্র (${allowedNames}) শ্রেণির জন্য উপলব্ধ। সঠিক শ্রেণি বেছে নাও।`
      );
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      // Verify teacher PIN before streaming PDF (skip duplicate read if already verified entering modal)
      if (selectedPdfFile && onVerifyPin && (!initialVerifiedPin || trimmedPin !== initialVerifiedPin)) {
        await onVerifyPin(trimmedPin);
      }

      let finalPdfUrl = pdfUrl;
      let finalPdfData = pdfData;
      if (selectedPdfFile) {
        finalPdfUrl = await uploadLargePdfInChunks(selectedPdfFile);
        finalPdfData = undefined;
        setPdfUrl(finalPdfUrl);
        setPdfData(undefined);
        setSelectedPdfFile(null);
      } else if (finalPdfUrl && auth.currentUser) {
        const existingMatch = finalPdfUrl.match(/\/api\/pdfs\/([a-zA-Z0-9_-]+)/);
        const existingPdfId = existingMatch ? existingMatch[1] : '';
        if (existingPdfId) {
          const cachedBytes = await storageService.getCachedPdf(existingPdfId);
          if (
            cachedBytes &&
            cachedBytes.byteLength > 0 &&
            cachedBytes.byteLength <= FIRESTORE_PDF_MAX_BYTES
          ) {
            const completeInCloud = await firestoreService.isPdfCompleteInCloud(existingPdfId);
            if (!completeInCloud) {
              await firestoreService.savePdfBytesToCloud(
                existingPdfId,
                pdfFileName || 'notes.pdf',
                cachedBytes,
                auth.currentUser.uid
              );
            }
          }
        }
      }

      const fallbackFileName =
        pdfFileName ||
        `${selectedSubject?.code || 'SUB'}_Ch${parsedChapterNumber}_${(titleEn || 'Notes').replace(/\s+/g, '_')}.pdf`;

      const chapter: ChapterNote = {
        id: chapterToEdit?.id || `ch-${Date.now()}`,
        subjectId,
        classLevel: classLevel || 'all',
        chapterNumber: parsedChapterNumber,
        titleBn: titleBn.trim(),
        titleEn: titleEn.trim() || titleBn.trim(),
        summaryBn: summaryBn.trim() || 'শিক্ষকের আপলোডকৃত স্টাডি মেটেরিয়াল ও PDF নোটস।',
        keyPoints: cleanPoints,
        questions: cleanQuestions,
        pdfFileName: fallbackFileName,
        pdfFileSize: pdfFileSize || '420 KB',
        pdfData: finalPdfData,
        pdfUrl: finalPdfUrl,
        isCustomUploaded: !!(finalPdfData || finalPdfUrl),
        uploadedAt: new Date().toISOString().split('T')[0],
      };

      await onSaveChapter(chapter, trimmedPin);

      // Remove previous large PDF file if replaced during chapter edit
      if (chapterToEdit?.pdfUrl && chapterToEdit.pdfUrl !== finalPdfUrl) {
        const match = chapterToEdit.pdfUrl.match(/\/api\/pdfs\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const oldPdfId = match[1];
          fetch(`/api/pdfs/${oldPdfId}`, { method: 'DELETE' }).catch(() => {});
          firestoreService.deletePdfChunks(oldPdfId).catch(() => {});
          storageService.deleteCachedPdf(oldPdfId).catch(() => {});
        }
      }

      onClose();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('PDF আপলোড বাতিল করা হয়েছে।');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'নোটস সংরক্ষণ করা যায়নি।');
      }
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const currentSelectedSubject = subjects.find((s) => s.id === subjectId);
  const currentAllowedClasses = getSubjectAllowedClasses(currentSelectedSubject);
  const isSubjectInAllClasses =
    !currentAllowedClasses ||
    ALL_CLASS_IDS.every((id) => currentAllowedClasses.includes(id));

  const availableClasses = isSubjectInAllClasses
    ? DEFAULT_CLASSES
    : DEFAULT_CLASSES.filter((c) => currentAllowedClasses.includes(c.id));

  const handleSubjectChange = (newSubjectId: string) => {
    setSubjectId(newSubjectId);
    const nextSubject = subjects.find((s) => s.id === newSubjectId);
    const nextAllowed = getSubjectAllowedClasses(nextSubject);
    const nextInAll =
      !nextAllowed || ALL_CLASS_IDS.every((id) => nextAllowed.includes(id));
    if (!nextInAll && nextAllowed && !nextAllowed.includes(classLevel)) {
      setClassLevel(nextAllowed[0] || 'class-10');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                {chapterToEdit ? 'অধ্যায় সম্পাদনা করো' : 'নতুন নোটস ও PDF আপলোড করো'}
              </h2>
              <p className="text-[11px] text-slate-400">শিক্ষক নিয়ন্ত্রণ প্যানেল</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-3.5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-slate-800">
          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Class & Subject */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                কোন শ্রেণির জন্য? (Class Level) *
              </label>
              <select
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-medium focus:ring-2 focus:ring-rose-500/30"
              >
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameBn}
                  </option>
                ))}
              </select>
              {!isSubjectInAllClasses && currentAllowedClasses && (
                <p className="text-[11px] text-indigo-600 mt-1 font-medium">
                  * {currentSelectedSubject?.nameBn} শুধুমাত্র{' '}
                  {DEFAULT_CLASSES.filter((c) => currentAllowedClasses.includes(c.id))
                    .map((c) => c.shortBn)
                    .join(', ')}{' '}
                  শ্রেণির জন্য উপলব্ধ
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                বিষয় বেছে নাও (Select Subject) *
              </label>
              <select
                value={subjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-medium focus:ring-2 focus:ring-rose-500/30"
              >
                {activeSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameBn} ({s.nameEn})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Chapter Number & Bengali Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                অধ্যায় নম্বর *
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(chapterNumberInput, 10) || 1;
                    setChapterNumberInput(String(Math.max(1, current - 1)));
                    setErrorMsg('');
                  }}
                  aria-label="অধ্যায় নম্বর কমাও"
                  className="w-9 h-9 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={chapterNumberInput}
                  onChange={(e) => {
                    const ascii = e.target.value
                      .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
                      .replace(/[^0-9]/g, '')
                      .slice(0, 3);
                    setChapterNumberInput(ascii);
                    setErrorMsg('');
                  }}
                  placeholder="1"
                  className="w-full py-2 px-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-mono font-bold text-center focus:ring-2 focus:ring-rose-500/30 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(chapterNumberInput, 10) || 0;
                    setChapterNumberInput(String(Math.min(999, current + 1)));
                    setErrorMsg('');
                  }}
                  aria-label="অধ্যায় নম্বর বাড়াও"
                  className="w-9 h-9 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                অধ্যায়ের নাম (বাংলায়) *
              </label>
              <input
                type="text"
                value={titleBn}
                onChange={(e) => setTitleBn(e.target.value)}
                placeholder="যেমন: ভারতের ভূপ্রকৃতি ও নদনদী"
                className="w-full py-2 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm"
                required
              />
            </div>
          </div>

          {/* PDF File Upload Box */}
          <div className="border-2 border-dashed border-rose-300 hover:border-rose-400 rounded-2xl p-4 bg-rose-50/40 text-center">
            <FileUp className="w-7 h-7 text-rose-500 mx-auto mb-1.5" />
            <label className="cursor-pointer inline-block">
              <span className="py-1.5 px-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors mb-1 inline-block">
                তোমার আসল PDF ফাইল আপলোড করো
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={saving}
                onChange={handlePdfUpload}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-slate-500">
              (২৫ MB পর্যন্ত .pdf ফাইল স্থায়ীভাবে ক্লাউডে সংরক্ষিত হবে এবং সকল শিক্ষার্থীর ডিভাইসে খুলবে)
            </p>
            {selectedPdfFile && selectedPdfFile.size > FIRESTORE_PDF_MAX_BYTES && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-2 inline-block">
                সতর্কতা: ফাইলটি ২৫ MB-এর বেশি ({pdfFileSize})। সব শিক্ষার্থীর ফোনে স্থায়ীভাবে লোড করতে ২৫ MB-এর মধ্যে PDF আপলোড করা উত্তম।
              </p>
            )}

            {fileLoading && (
              <p className="text-xs text-amber-600 font-medium mt-1">ফাইলটি প্রস্তুত হচ্ছে...</p>
            )}

            {uploadProgress !== null && (
              <div className="mt-3 max-w-sm mx-auto text-left space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-rose-700">
                  <span>PDF আপলোড হচ্ছে...</span>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <progress
                  value={uploadProgress}
                  max={100}
                  className="w-full h-2 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-rose-100 [&::-webkit-progress-value]:bg-rose-600 [&::-moz-progress-bar]:bg-rose-600"
                />
              </div>
            )}

            {pdfFileName && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1 rounded-lg text-xs font-medium max-w-full">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{pdfFileName} ({pdfFileSize})</span>
                {!saving && (
                  <button
                    type="button"
                    onClick={() => {
                      setPdfFileName('');
                      setPdfFileSize('');
                      setPdfData(undefined);
                      setPdfUrl(undefined);
                      setSelectedPdfFile(null);
                    }}
                    title="নির্বাচিত PDF সরাও"
                    className="ml-1 text-emerald-700 hover:text-rose-600 p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              অধ্যায়ের মূল আলোচনা ও সারসংক্ষেপ
            </label>
            <textarea
              rows={4}
              value={summaryBn}
              onChange={(e) => setSummaryBn(e.target.value)}
              placeholder="শিক্ষার্থীদের জন্য অধ্যায়ের বিশদ বিবরণ বা গুরুত্বপূর্ণ নির্দেশিকা লেখো..."
              className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm leading-relaxed"
            />
          </div>

          {/* Key Points */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                মূল রিভিশন পয়েন্টসমূহ (Key Points)
              </label>
              <button
                type="button"
                onClick={handleAddPoint}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>পয়েন্ট যোগ করো</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {keyPoints.map((point, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="w-5 text-center text-xs font-mono font-bold text-slate-400">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={point}
                    onChange={(e) => handlePointChange(idx, e.target.value)}
                    placeholder="পয়েন্ট লেখো..."
                    className="flex-1 py-1 px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                  {keyPoints.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePoint(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                পরীক্ষার সম্ভাব্য প্রশ্নোত্তর (Model Q&amp;A)
              </label>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>প্রশ্ন যোগ করো</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {questions.map((q, idx) => (
                <div key={q.id || idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600">প্রশ্ন {idx + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">নম্বর:</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={q.marks}
                        onChange={(e) => handleQuestionChange(idx, 'marks', parseInt(e.target.value) || 1)}
                        className="w-12 py-0.5 px-1.5 text-center text-xs rounded border border-slate-300 font-mono"
                      />
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(idx)}
                          className="text-rose-500 hover:text-rose-700 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) => handleQuestionChange(idx, 'question', e.target.value)}
                    placeholder="প্রশ্নটি লেখো..."
                    className="w-full py-1 px-2.5 rounded-lg border border-slate-300 text-xs"
                  />

                  <textarea
                    rows={2}
                    value={q.answer || ''}
                    onChange={(e) => handleQuestionChange(idx, 'answer', e.target.value)}
                    placeholder="মডেল উত্তর বা সংকেত (ঐচ্ছিক)..."
                    className="w-full py-1 px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Teacher PIN Confirmation for adding/saving notes */}
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold shrink-0">
                <KeyRound className="w-3.5 h-3.5" />
              </div>
              <label className="text-xs sm:text-sm font-bold text-slate-800">
                নোটস যোগ/সংরক্ষণ করতে শিক্ষক পিন নিশ্চিত করো (Required PIN) *
              </label>
            </div>
            <p className="text-[11px] text-slate-600 mb-2 leading-relaxed">
              নোটস যোগ বা প্রকাশ করার জন্য তোমার বর্তমান শিক্ষক পিন দেওয়া বাধ্যতামূলক।
            </p>
            <div className="relative w-full sm:w-64">
              <input
                type={showTeacherPin ? 'text' : 'password'}
                maxLength={8}
                value={teacherPinInput}
                onChange={(e) => {
                  setTeacherPinInput(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="তোমার শিক্ষক পিন লেখো"
                className="w-full py-2 px-10 rounded-xl border border-slate-300 bg-white font-mono text-sm tracking-widest text-center focus:ring-2 focus:ring-rose-500/30 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowTeacherPin((prev) => !prev)}
                aria-label={showTeacherPin ? 'পিন লুকাও' : 'পিন দেখো'}
                title={showTeacherPin ? 'লুকাও (Hide)' : 'দেখো (Show)'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {showTeacherPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={saving}
              className="py-2 px-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'প্রকাশ হচ্ছে...' : 'নোটস প্রকাশ করো'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
