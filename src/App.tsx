import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  BookOpen, 
  Plus, 
  Sparkles, 
  CheckCircle, 
  Download, 
  Layers, 
  Upload,
  Bell,
  UserCheck,
  XCircle,
  Trash2,
  ShieldAlert,
  RefreshCw,
  LogOut
} from 'lucide-react';
import { 
  ChapterNote, 
  OfflineSavedItem, 
  ProgressStatus, 
  StudentProgress, 
  SubjectItem 
} from './types';
import { storageService } from './services/storage';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  AccessStatus,
  getCachedAccessFlags,
  getOrCreateDeviceId,
  PendingAccessRequest,
  PermittedDevice,
  rotateDeviceIdForUid,
  setActiveDeviceId,
  setCachedAccessFlags,
} from './services/api';
import { auth } from './services/firebase';
import {
  AppPublicConfigDoc,
  FIRESTORE_PDF_MAX_BYTES,
  firestoreService,
  isQuotaExceededError,
} from './services/firestoreService';
import { downloadChapterPDF } from './services/pdfGenerator';
import { useOnlineStatus } from './hooks/useAppHooks';
import { useScreenProtection } from './hooks/useScreenProtection';
import {
  ALL_CLASS_IDS,
  DEFAULT_CLASSES,
  DEFAULT_SUBJECTS,
  isSubjectAllowedForClass,
  isSubjectChoiceClass,
} from './data/defaultData';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { ClassBar } from './components/ClassBar';
import { SubjectBar } from './components/SubjectBar';
import { ProgressStats } from './components/ProgressStats';
import { ChapterCard } from './components/ChapterCard';
import { NoteReaderModal } from './components/NoteReaderModal';
import { TeacherAuthModal, TeacherAuthMode } from './components/TeacherAuthModal';
import { TeacherUploadModal } from './components/TeacherUploadModal';
import { AddSubjectModal } from './components/AddSubjectModal';
import { OfflineLibraryModal } from './components/OfflineLibraryModal';
import { DataBackupModal } from './components/DataBackupModal';
import { StudentAccessGate } from './components/StudentAccessGate';
import { TeacherRequestsModal } from './components/TeacherRequestsModal';
import { GoogleAuthGate } from './components/GoogleAuthGate';

export default function App() {
  const isOnline = useOnlineStatus();
  const [deviceId, setDeviceId] = useState<string>(() => getOrCreateDeviceId());

  // Firebase Auth & Realtime Cloud State
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [publicConfig, setPublicConfig] = useState<AppPublicConfigDoc | null | undefined>(undefined);
  const [permittedDeviceDoc, setPermittedDeviceDoc] = useState<PermittedDevice | null | undefined>(
    undefined
  );
  const [myRequestDoc, setMyRequestDoc] = useState<PendingAccessRequest | null | undefined>(undefined);
  const [offlineFallbackReady, setOfflineFallbackReady] = useState(false);
  const [offlinePermittedClassId, setOfflinePermittedClassId] = useState<string>('');
  const [offlinePermittedSubjectIds, setOfflinePermittedSubjectIds] = useState<string[] | null>(null);
  const [initialSplashDone, setInitialSplashDone] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [loadingStalled, setLoadingStalled] = useState(false);
  const [syncRetryNonce, setSyncRetryNonce] = useState(0);
  const [forceOfflineMode, setForceOfflineMode] = useState(false);
  const recoveredUidRef = useRef<string | null>(null);
  const recoveryInFlightRef = useRef<boolean>(false);
  const effectiveOnline = isOnline && !forceOfflineMode;

  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialSplashDone(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Auth & Device Access Gate state
  const [authReady, setAuthReady] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [teacherLoggedIn, setTeacherLoggedIn] = useState(false);
  const [isTeacherDevice, setIsTeacherDevice] = useState(false);
  const [isTeacherMode, setIsTeacherMode] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('approved');
  const [pendingRequests, setPendingRequests] = useState<
    (PendingAccessRequest & { requesterUid?: string })[]
  >([]);
  const [permittedDevices, setPermittedDevices] = useState<PermittedDevice[]>([]);
  const [verifiedActionPin, setVerifiedActionPin] = useState<string>('');
  const prevPendingIdsRef = useRef<Set<string>>(new Set());
  const pendingListenerInitializedRef = useRef(false);
  const prevAccessStatusRef = useRef<AccessStatus | null>(null);
  const prevPermittedClassRef = useRef<string | null>(null);
  const prevPermittedSubjectsKeyRef = useRef<string | null>(null);

  // App data state
  const [subjects, setSubjects] = useState<SubjectItem[]>(DEFAULT_SUBJECTS);
  const [chapters, setChapters] = useState<ChapterNote[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, StudentProgress>>({});
  const [offlineDownloads, setOfflineDownloads] = useState<OfflineSavedItem[]>([]);

  // Selection states
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // Filters & Search (Placed at main menu top)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Low data mode
  const [lowDataMode, setLowDataMode] = useState(false);

  // Modals
  const [readingChapter, setReadingChapter] = useState<ChapterNote | null>(null);
  const [editingChapter, setEditingChapter] = useState<ChapterNote | null>(null);
  const [pendingDeleteChapter, setPendingDeleteChapter] = useState<ChapterNote | null>(null);
  const [pendingDeleteSubject, setPendingDeleteSubject] = useState<SubjectItem | null>(null);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<TeacherAuthMode>('login');
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showOfflineLibraryModal, setShowOfflineLibraryModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  const isStudentReadingProtected = true;

  const { isPrivacyShieldActive, shieldReason, dismissShield } = useScreenProtection(
    isStudentReadingProtected,
    showToast
  );

  // Initialize local IndexedDB data (progress, offline downloads, settings)
  const loadLocalData = useCallback(async () => {
    try {
      await storageService.initialize();
      const loadedProgress = await storageService.getAllProgress();
      const loadedOffline = await storageService.getAllOfflineDownloads();
      const settings = storageService.getSettings();

      setProgressMap(loadedProgress);
      setOfflineDownloads(loadedOffline);
      setLowDataMode(settings.lowDataMode || false);
    } catch {
      // Fallback gracefully if IndexedDB is blocked in a restricted WebView
    }
  }, []);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  // Listen to Firebase Auth state (with 4s safety fallback if browser storage blocks Auth persistence)
  useEffect(() => {
    let settled = false;
    const authWatchdog = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setFirebaseUser(auth.currentUser);
        setFirebaseAuthReady(true);
      }
    }, 4000);

    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        settled = true;
        window.clearTimeout(authWatchdog);
        setFirebaseUser(user);
        setFirebaseAuthReady(true);
        if (!user) {
          setPublicConfig(undefined);
          setPermittedDeviceDoc(undefined);
          setMyRequestDoc(undefined);
          setOfflinePermittedClassId('');
          setOfflinePermittedSubjectIds(null);
          setPendingRequests([]);
          setPermittedDevices([]);
          setCloudSyncError(null);
          setLoadingStalled(false);
          setForceOfflineMode(false);
          recoveredUidRef.current = null;
          recoveryInFlightRef.current = false;
          pendingListenerInitializedRef.current = false;
          prevPendingIdsRef.current = new Set();
        }
      },
      () => {
        settled = true;
        window.clearTimeout(authWatchdog);
        setFirebaseUser(auth.currentUser);
        setFirebaseAuthReady(true);
      }
    );
    return () => {
      window.clearTimeout(authWatchdog);
      unsub();
    };
  }, []);

  // Offline fallback when disconnected from internet or switched to offline cache mode
  useEffect(() => {
    if (!firebaseAuthReady) return;
    if (effectiveOnline) {
      setOfflineFallbackReady(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await storageService.initialize();
        const cached = getCachedAccessFlags();
        if (cancelled) return;

        setHasPin(cached.hasPin);
        setIsTeacherDevice(cached.isTeacherDevice);
        setIsTeacherMode(false);

        const cachedClass =
          cached.permittedClassId && ALL_CLASS_IDS.includes(cached.permittedClassId)
            ? cached.permittedClassId
            : '';

        if (!cached.hasPin || cached.isTeacherDevice) {
          setAccessStatus('approved');
          setOfflinePermittedClassId('');
          setOfflinePermittedSubjectIds(null);
          const loadedSubjects = await storageService.getAllSubjects();
          const loadedChapters = await storageService.getAllChapters();
          if (!cancelled) {
            setSubjects(loadedSubjects.length > 0 ? loadedSubjects : DEFAULT_SUBJECTS);
            setChapters(loadedChapters);
          }
        } else if (cached.approved && cachedClass) {
          const cachedSubjects = isSubjectChoiceClass(cachedClass)
            ? cached.permittedSubjectIds
            : null;
          setAccessStatus('approved');
          setOfflinePermittedClassId(cachedClass);
          setOfflinePermittedSubjectIds(cachedSubjects);
          setSelectedClassId(cachedClass);
          const loadedSubjects = await storageService.getAllSubjects();
          const loadedChapters = await storageService.getAllChapters();
          const activeSubjects = loadedSubjects.length > 0 ? loadedSubjects : DEFAULT_SUBJECTS;
          const classChapters = loadedChapters.filter((ch) => {
            const sub = activeSubjects.find((s) => s.id === ch.subjectId);
            if (!isSubjectAllowedForClass(sub || { id: ch.subjectId }, cachedClass)) return false;
            if (cachedSubjects && !cachedSubjects.includes(ch.subjectId)) return false;
            return !ch.classLevel || ch.classLevel === 'all' || ch.classLevel === cachedClass;
          });
          if (!cancelled) {
            setSubjects(activeSubjects);
            setChapters(classChapters);
          }
        } else {
          setAccessStatus('needs_permission');
          setOfflinePermittedClassId('');
          setOfflinePermittedSubjectIds(null);
          setChapters([]);
        }
      } catch {
        if (!cancelled) {
          setAccessStatus('needs_permission');
          setOfflinePermittedClassId('');
        }
      } finally {
        if (!cancelled) {
          setOfflineFallbackReady(true);
          setAuthReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseAuthReady, effectiveOnline]);

  // Subscribe to public config when online and signed in
  useEffect(() => {
    if (!firebaseAuthReady || !firebaseUser || !effectiveOnline) return;

    setPublicConfig(undefined);
    setCloudSyncError(null);
    const unsub = firestoreService.subscribePublicConfig(
      (cfg) => {
        setCloudSyncError(null);
        setPublicConfig(cfg);
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          setCloudSyncError(
            'আজকের জন্য Firestore ফ্রি রিড কোটা শেষ হয়ে গেছে। আগামীকাল কোটা রিসেট হবে। নিচে থাকা অফলাইন সংরক্ষিত নোটস ব্যবহার করতে পারো।'
          );
          return;
        }
        const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
        if (msg.includes('permission') || msg.includes('insufficient')) {
          setCloudSyncError(
            'তোমার Google অ্যাকাউন্ট দিয়ে সার্ভারে প্রবেশ যাচাই করা যাচ্ছে না। অনুগ্রহ করে আবার সাইন-ইন করো।'
          );
        } else {
          setCloudSyncError(
            'সার্ভারের সাথে সংযোগ করতে সমস্যা হচ্ছে। তোমার ইন্টারনেট সংযোগ যাচাই করে আবার চেষ্টা করো।'
          );
        }
      }
    );
    return () => unsub();
  }, [firebaseAuthReady, firebaseUser, effectiveOnline, syncRetryNonce]);

  const publicConfigReady = publicConfig !== undefined;
  const publicPinActive = Boolean(publicConfig?.hasPin);
  const publicTeacherDeviceId = publicConfig?.teacherDeviceId || '';

  // Subscribe to student's permission & access request docs when PIN is active on a non-teacher device
  useEffect(() => {
    if (!firebaseUser || !effectiveOnline || !publicConfigReady) return;

    const thisIsTeacherDevice = Boolean(publicPinActive && publicTeacherDeviceId === deviceId);

    if (!publicPinActive || thisIsTeacherDevice) {
      setPermittedDeviceDoc(undefined);
      setMyRequestDoc(undefined);
      return;
    }

    let cancelled = false;
    setPermittedDeviceDoc(undefined);
    setMyRequestDoc(undefined);

    const handleStudentSubscriptionError = (err: unknown) => {
      if (cancelled) return;
      if (isQuotaExceededError(err)) {
        setCloudSyncError(
          'আজকের জন্য Firestore ফ্রি রিড কোটা শেষ হয়ে গেছে। আগামীকাল কোটা রিসেট হবে। নিচে থাকা অফলাইন সংরক্ষিত নোটস ব্যবহার করতে পারো।'
        );
        return;
      }
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isPermissionIssue = msg.includes('permission') || msg.includes('insufficient');

      if (!isPermissionIssue) {
        setCloudSyncError(
          'ডিভাইসের অনুমতি যাচাই করতে সমস্যা হচ্ছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করো।'
        );
        return;
      }

      if (recoveryInFlightRef.current) return;

      if (recoveredUidRef.current !== firebaseUser.uid) {
        recoveredUidRef.current = firebaseUser.uid;
        recoveryInFlightRef.current = true;
        Promise.all([
          firestoreService.findPermittedDeviceByStudentUid(firebaseUser.uid),
          firestoreService.findAccessRequestByRequesterUid(firebaseUser.uid),
        ])
          .then(([existingPermitted, existingReq]) => {
            recoveryInFlightRef.current = false;
            if (cancelled) return;
            if (existingPermitted && existingPermitted.deviceId !== deviceId) {
              setActiveDeviceId(existingPermitted.deviceId);
              setDeviceId(existingPermitted.deviceId);
              return;
            }
            if (existingReq && existingReq.deviceId !== deviceId) {
              setActiveDeviceId(existingReq.deviceId);
              setDeviceId(existingReq.deviceId);
              return;
            }
            const nextId = rotateDeviceIdForUid(firebaseUser.uid);
            if (nextId !== deviceId) {
              setDeviceId(nextId);
              return;
            }
            setPermittedDeviceDoc((prev) => (prev === undefined ? null : prev));
            setMyRequestDoc((prev) => (prev === undefined ? null : prev));
          })
          .catch(() => {
            recoveryInFlightRef.current = false;
            if (cancelled) return;
            setPermittedDeviceDoc((prev) => (prev === undefined ? null : prev));
            setMyRequestDoc((prev) => (prev === undefined ? null : prev));
          });
      } else {
        setPermittedDeviceDoc((prev) => (prev === undefined ? null : prev));
        setMyRequestDoc((prev) => (prev === undefined ? null : prev));
      }
    };

    const unsubPerm = firestoreService.subscribePermittedDevice(
      deviceId,
      (permitted) => {
        if (!cancelled) {
          setCloudSyncError(null);
          setPermittedDeviceDoc(permitted);
        }
      },
      handleStudentSubscriptionError
    );
    const unsubReq = firestoreService.subscribeMyAccessRequest(
      deviceId,
      (req) => {
        if (!cancelled) {
          setCloudSyncError(null);
          setMyRequestDoc(req);
        }
      },
      handleStudentSubscriptionError
    );

    return () => {
      cancelled = true;
      unsubPerm();
      unsubReq();
    };
  }, [
    deviceId,
    firebaseUser,
    effectiveOnline,
    publicConfigReady,
    publicPinActive,
    publicTeacherDeviceId,
    syncRetryNonce,
  ]);

  // Subscribe to pending student access requests & permitted devices on the teacher device
  useEffect(() => {
    if (!firebaseUser || !effectiveOnline || !publicConfig?.hasPin) {
      setPendingRequests([]);
      setPermittedDevices([]);
      pendingListenerInitializedRef.current = false;
      prevPendingIdsRef.current = new Set();
      return;
    }

    const thisIsTeacherDevice = publicConfig.teacherDeviceId === deviceId;
    if (!thisIsTeacherDevice) {
      setPendingRequests([]);
      setPermittedDevices([]);
      pendingListenerInitializedRef.current = false;
      prevPendingIdsRef.current = new Set();
      return;
    }

    const unsubReqs = firestoreService.subscribePendingRequestsForTeacher(
      firebaseUser.uid,
      firebaseUser.email,
      (requests) => {
        setPendingRequests(requests);

        const nextIds = new Set(requests.map((r) => r.deviceId));
        if (!pendingListenerInitializedRef.current) {
          pendingListenerInitializedRef.current = true;
          prevPendingIdsRef.current = nextIds;
          return;
        }

        const newArrivals = requests.filter((r) => !prevPendingIdsRef.current.has(r.deviceId));
        prevPendingIdsRef.current = nextIds;
        if (newArrivals.length > 0) {
          const first = newArrivals[0];
          showToast(`নতুন অনুমতির বার্তা: ${first.label || 'একটি নতুন ডিভাইস'} অ্যাপে প্রবেশ করতে চাইছে!`);
        }
      }
    );

    const unsubPerms = firestoreService.subscribePermittedDevicesForTeacher(
      firebaseUser.uid,
      firebaseUser.email,
      (devices) => {
        setPermittedDevices(devices);
      }
    );

    return () => {
      unsubReqs();
      unsubPerms();
    };
  }, [deviceId, firebaseUser, effectiveOnline, publicConfig, showToast]);

  // Compute accessStatus & teacher flags (students explicitly select their class before sending a request)
  useEffect(() => {
    if (!firebaseAuthReady || !effectiveOnline) return;

    if (!firebaseUser) {
      setAuthReady(true);
      return;
    }

    if (publicConfig === undefined) {
      setAuthReady(false);
      return;
    }

    const pinActive = Boolean(publicConfig?.hasPin);
    const tLoggedIn = Boolean(pinActive && publicConfig?.teacherLoggedIn);
    const thisIsTeacherDevice = Boolean(pinActive && publicConfig?.teacherDeviceId === deviceId);
    const thisIsTeacherMode = Boolean(thisIsTeacherDevice && tLoggedIn);

    setHasPin(pinActive);
    setTeacherLoggedIn(tLoggedIn);
    setIsTeacherDevice(thisIsTeacherDevice);
    setIsTeacherMode(thisIsTeacherMode);

    if (!pinActive || thisIsTeacherDevice) {
      setAccessStatus('approved');
      setCachedAccessFlags({
        hasPin: pinActive,
        isTeacherDevice: thisIsTeacherDevice,
        approved: true,
        permittedClassId: null,
      });
      prevAccessStatusRef.current = 'approved';
      prevPermittedClassRef.current = null;
      setAuthReady(true);
      return;
    }

    // Student device with active teacher PIN: wait for both docs to resolve
    if (permittedDeviceDoc === undefined || myRequestDoc === undefined) {
      return;
    }

    const permittedClass =
      permittedDeviceDoc?.permittedClassId &&
      ALL_CLASS_IDS.includes(permittedDeviceDoc.permittedClassId)
        ? permittedDeviceDoc.permittedClassId
        : '';

    let nextStatus: AccessStatus;
    if (permittedDeviceDoc && permittedClass) {
      nextStatus = 'approved';
    } else if (myRequestDoc?.status === 'denied') {
      nextStatus = 'denied';
    } else if (myRequestDoc?.status === 'pending') {
      nextStatus = 'pending';
    } else {
      nextStatus = 'needs_permission';
    }

    const permittedSubjects =
      isSubjectChoiceClass(permittedClass) &&
      Array.isArray(permittedDeviceDoc?.permittedSubjectIds)
        ? permittedDeviceDoc.permittedSubjectIds
        : null;
    const nextSubjectsKey = permittedSubjects ? [...permittedSubjects].sort().join(',') : null;

    const prevStatus = prevAccessStatusRef.current;
    const prevClass = prevPermittedClassRef.current;
    const prevSubjectsKey = prevPermittedSubjectsKeyRef.current;
    if (prevStatus === 'pending' && nextStatus === 'approved') {
      const clsName = DEFAULT_CLASSES.find((c) => c.id === permittedClass)?.shortBn || '';
      showToast(
        clsName
          ? `শিক্ষক তোমাকে ${clsName} শ্রেণির নোটস দেখার অনুমতি দিয়েছেন! স্বাগতম!`
          : 'শিক্ষক তোমাকে প্রবেশের অনুমতি দিয়েছেন! স্বাগতম!'
      );
    } else if (
      prevStatus === 'approved' &&
      nextStatus === 'approved' &&
      prevClass &&
      permittedClass &&
      prevClass !== permittedClass
    ) {
      const clsName = DEFAULT_CLASSES.find((c) => c.id === permittedClass)?.shortBn || '';
      showToast(`শিক্ষক তোমার অনুমোদিত শ্রেণি পরিবর্তন করেছেন: ${clsName}`);
    } else if (
      prevStatus === 'approved' &&
      nextStatus === 'approved' &&
      prevClass === permittedClass &&
      prevSubjectsKey !== null &&
      nextSubjectsKey !== null &&
      prevSubjectsKey !== nextSubjectsKey
    ) {
      showToast('শিক্ষক তোমার অনুমোদিত বিষয়সমূহ পরিবর্তন করেছেন।');
    } else if (prevStatus === 'pending' && nextStatus === 'denied') {
      showToast('শিক্ষক তোমার প্রবেশের অনুরোধ বাতিল করেছেন।');
    } else if (prevStatus === 'approved' && nextStatus !== 'approved') {
      showToast('শিক্ষক তোমার ডিভাইসের প্রবেশাধিকার সরিয়ে নিয়েছেন।');
    }

    prevAccessStatusRef.current = nextStatus;
    prevPermittedClassRef.current = nextStatus === 'approved' ? permittedClass : null;
    prevPermittedSubjectsKeyRef.current = nextStatus === 'approved' ? nextSubjectsKey : null;

    setAccessStatus(nextStatus);
    setCachedAccessFlags({
      hasPin: true,
      isTeacherDevice: false,
      approved: nextStatus === 'approved',
      permittedClassId: nextStatus === 'approved' ? permittedClass : null,
      permittedSubjectIds: nextStatus === 'approved' ? permittedSubjects : null,
    });
    setAuthReady(true);
  }, [
    deviceId,
    firebaseAuthReady,
    firebaseUser,
    effectiveOnline,
    myRequestDoc,
    permittedDeviceDoc,
    publicConfig,
    showToast,
  ]);

  // Locked class ID for approved student devices (null for teacher device or when PIN is inactive)
  const studentPermittedClassId = useMemo(() => {
    if (!hasPin || isTeacherDevice) return null;
    if (effectiveOnline) {
      const cls = permittedDeviceDoc?.permittedClassId || '';
      return ALL_CLASS_IDS.includes(cls) ? cls : null;
    }
    return offlinePermittedClassId && ALL_CLASS_IDS.includes(offlinePermittedClassId)
      ? offlinePermittedClassId
      : null;
  }, [hasPin, isTeacherDevice, effectiveOnline, permittedDeviceDoc, offlinePermittedClassId]);

  // Permitted subject IDs ONLY for approved Class 11 & 12 student devices (null means no subject subset restriction)
  const studentPermittedSubjectIds = useMemo(() => {
    if (!hasPin || isTeacherDevice || !isSubjectChoiceClass(studentPermittedClassId)) {
      return null;
    }
    if (effectiveOnline) {
      return Array.isArray(permittedDeviceDoc?.permittedSubjectIds)
        ? permittedDeviceDoc.permittedSubjectIds
        : null;
    }
    return Array.isArray(offlinePermittedSubjectIds) ? offlinePermittedSubjectIds : null;
  }, [
    hasPin,
    isTeacherDevice,
    studentPermittedClassId,
    effectiveOnline,
    permittedDeviceDoc,
    offlinePermittedSubjectIds,
  ]);

  const effectiveClassId = studentPermittedClassId || selectedClassId;

  // Keep selectedClassId, selectedSubjectId, and active reader synced to student's permitted class & subjects
  useEffect(() => {
    if (!studentPermittedClassId) return;
    setSelectedClassId(studentPermittedClassId);
    if (selectedSubjectId) {
      const currentSub = subjects.find((s) => s.id === selectedSubjectId);
      const allowedByClass = isSubjectAllowedForClass(
        currentSub || { id: selectedSubjectId },
        studentPermittedClassId
      );
      const allowedBySubjectList =
        !studentPermittedSubjectIds || studentPermittedSubjectIds.includes(selectedSubjectId);
      if (!allowedByClass || !allowedBySubjectList) {
        setSelectedSubjectId(null);
      }
    }
  }, [studentPermittedClassId, studentPermittedSubjectIds, selectedSubjectId, subjects]);

  useEffect(() => {
    if (
      readingChapter &&
      studentPermittedSubjectIds &&
      !studentPermittedSubjectIds.includes(readingChapter.subjectId)
    ) {
      setReadingChapter(null);
    }
  }, [readingChapter, studentPermittedSubjectIds]);

  // Subscribe to subjects whenever signed in & online (needed on StudentAccessGate for Class 11 & 12 choices too)
  useEffect(() => {
    if (!firebaseUser || !effectiveOnline || !authReady) return;

    let cancelled = false;
    const unsubSubjects = firestoreService.subscribeSubjects(
      (list) => {
        setSubjects(list);
        storageService.replaceAllSubjects(list).catch(() => {});
      },
      async (err) => {
        if (isQuotaExceededError(err)) {
          try {
            await storageService.initialize();
            const cachedSubjects = await storageService.getAllSubjects();
            if (!cancelled && cachedSubjects.length > 0) {
              setSubjects(cachedSubjects);
            }
          } catch {
            // Ignore IndexedDB fallback errors
          }
          if (!cancelled && accessStatus === 'approved') {
            showToast('আজকের জন্য Firestore রিড কোটা শেষ — সংরক্ষিত অফলাইন বিষয় তালিকা দেখানো হচ্ছে।');
          }
          return;
        }
        if (accessStatus === 'approved') {
          showToast('বিষয় তালিকা লোড করতে সমস্যা হচ্ছে। ইন্টারনেট যাচাই করো।');
        }
      }
    );

    return () => {
      cancelled = true;
      unsubSubjects();
    };
  }, [accessStatus, authReady, firebaseUser, effectiveOnline, showToast]);

  // Subscribe to chapters in real time once approved and online
  useEffect(() => {
    if (!firebaseUser || !effectiveOnline || !authReady) return;

    if (accessStatus !== 'approved') {
      setChapters([]);
      return;
    }

    let cancelled = false;
    const unsubChapters = firestoreService.subscribeChapters(
      (list) => {
        const scopedList = studentPermittedClassId
          ? list.filter((ch) => {
              const matchesClass =
                !ch.classLevel ||
                ch.classLevel === 'all' ||
                ch.classLevel === studentPermittedClassId;
              const matchesSubject =
                !studentPermittedSubjectIds ||
                studentPermittedSubjectIds.includes(ch.subjectId);
              return matchesClass && matchesSubject;
            })
          : list;
        setChapters(scopedList);
        storageService.replaceAllChapters(scopedList).catch(() => {});
      },
      studentPermittedClassId || undefined,
      async (err) => {
        if (isQuotaExceededError(err)) {
          try {
            await storageService.initialize();
            const cachedChapters = await storageService.getAllChapters();
            if (!cancelled) {
              const scopedList = studentPermittedClassId
                ? cachedChapters.filter((ch) => {
                    const matchesClass =
                      !ch.classLevel ||
                      ch.classLevel === 'all' ||
                      ch.classLevel === studentPermittedClassId;
                    const matchesSubject =
                      !studentPermittedSubjectIds ||
                      studentPermittedSubjectIds.includes(ch.subjectId);
                    return matchesClass && matchesSubject;
                  })
                : cachedChapters;
              if (scopedList.length > 0) {
                setChapters(scopedList);
              }
              showToast('আজকের জন্য Firestore রিড কোটা শেষ — সংরক্ষিত অফলাইন নোটস দেখানো হচ্ছে।');
            }
          } catch {
            if (!cancelled) {
              showToast('আজকের জন্য Firestore রিড কোটা শেষ হয়ে গেছে। আগামীকাল কোটা রিসেট হবে।');
            }
          }
          return;
        }
        showToast('নোটস তালিকা সিঙ্ক করতে সমস্যা হচ্ছে। ইন্টারনেট যাচাই করো।');
      }
    );

    return () => {
      cancelled = true;
      unsubChapters();
    };
  }, [
    accessStatus,
    authReady,
    firebaseUser,
    effectiveOnline,
    studentPermittedClassId,
    studentPermittedSubjectIds,
    showToast,
  ]);

  const checkedCloudPdfIdsRef = useRef<Set<string>>(new Set());
  const cloudHealRunIdRef = useRef(0);
  const canHealCloudPdfs = isTeacherDevice || isTeacherMode;

  // Clear per-session cloud-heal tracking when user signs out
  useEffect(() => {
    if (!firebaseUser) {
      checkedCloudPdfIdsRef.current.clear();
      cloudHealRunIdRef.current += 1;
    }
  }, [firebaseUser]);

  // Auto-heal locally cached / same-server PDFs to Firestore cloud storage on teacher device
  useEffect(() => {
    if (!canHealCloudPdfs || !firebaseUser || !effectiveOnline || !authReady || chapters.length === 0) {
      return;
    }

    const candidates = chapters
      .map((ch) => {
        const match = ch.pdfUrl?.match(/\/api\/pdfs\/([a-zA-Z0-9_-]+)/);
        const pdfId = match ? match[1] : '';
        return { ch, pdfId };
      })
      .filter(
        ({ pdfId }) =>
          Boolean(pdfId) &&
          !checkedCloudPdfIdsRef.current.has(pdfId) &&
          !firestoreService.isPdfVerifiedLocally(pdfId)
      );

    if (candidates.length === 0) return;

    const myRunId = ++cloudHealRunIdRef.current;
    const isStale = () => cloudHealRunIdRef.current !== myRunId;

    (async () => {
      let healedCount = 0;
      for (const { ch, pdfId } of candidates) {
        if (isStale()) break;
        if (checkedCloudPdfIdsRef.current.has(pdfId)) continue;

        let bytes = await storageService.getCachedPdf(pdfId);
        if ((!bytes || bytes.byteLength === 0) && ch.pdfUrl) {
          try {
            const headRes = await fetch(`/api/pdfs/${pdfId}`, {
              method: 'HEAD',
              cache: 'no-store',
            });
            const size = Number(headRes.headers.get('content-length') || 0);
            const ctHead = (headRes.headers.get('content-type') || '').toLowerCase();
            if (
              headRes.ok &&
              !ctHead.includes('text/html') &&
              !ctHead.includes('application/json') &&
              size <= FIRESTORE_PDF_MAX_BYTES
            ) {
              const res = await fetch(`/api/pdfs/${pdfId}`, { cache: 'no-store' });
              const ct = (res.headers.get('content-type') || '').toLowerCase();
              if (res.ok && !ct.includes('text/html') && !ct.includes('application/json')) {
                const buf = await res.arrayBuffer();
                const fetched = new Uint8Array(buf);
                if (fetched.byteLength > 0 && fetched.byteLength <= FIRESTORE_PDF_MAX_BYTES) {
                  bytes = fetched;
                  storageService.saveCachedPdf(pdfId, fetched).catch(() => {});
                }
              }
            }
          } catch {
            // Ignore unreachable server PDFs
          }
        }

        if (isStale()) break;
        checkedCloudPdfIdsRef.current.add(pdfId);

        if (!bytes || bytes.byteLength === 0 || bytes.byteLength > FIRESTORE_PDF_MAX_BYTES) {
          continue;
        }

        try {
          const complete = await firestoreService.isPdfCompleteInCloud(pdfId);
          if (!complete && !isStale()) {
            await firestoreService.savePdfBytesToCloud(
              pdfId,
              ch.pdfFileName || 'notes.pdf',
              bytes,
              firebaseUser.uid
            );
            healedCount += 1;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
          if (
            isQuotaExceededError(err) ||
            msg.includes('permission') ||
            msg.includes('insufficient')
          ) {
            break;
          }
        }
      }

      if (!isStale() && healedCount > 0) {
        showToast(
          healedCount === 1
            ? '১টি PDF ফাইল ক্লাউডে সিঙ্ক হয়েছে — শিক্ষার্থীরা এখন খুলতে পারবে ✓'
            : `${healedCount}টি PDF ফাইল ক্লাউডে সিঙ্ক হয়েছে — শিক্ষার্থীরা এখন খুলতে পারবে ✓`
        );
      }
    })();

    return () => {
      if (cloudHealRunIdRef.current === myRunId) {
        cloudHealRunIdRef.current += 1;
      }
    };
  }, [canHealCloudPdfs, firebaseUser, effectiveOnline, authReady, chapters, showToast]);

  // Visible subjects for the currently effective class & student's permitted subjects (Class 11 & 12)
  const visibleSubjects = useMemo(() => {
    return subjects.filter((sub) => {
      if (!isSubjectAllowedForClass(sub, effectiveClassId)) return false;
      if (studentPermittedSubjectIds && !studentPermittedSubjectIds.includes(sub.id)) {
        return false;
      }
      return true;
    });
  }, [subjects, effectiveClassId, studentPermittedSubjectIds]);

  // Filter offline downloads to only chapters accessible for the permitted class & subjects
  const visibleOfflineDownloads = useMemo(() => {
    if (!studentPermittedClassId && !studentPermittedSubjectIds) return offlineDownloads;
    const allowedChapterIds = new Set(chapters.map((c) => c.id));
    return offlineDownloads.filter((item) => {
      if (studentPermittedSubjectIds && !studentPermittedSubjectIds.includes(item.subjectId)) {
        return false;
      }
      return allowedChapterIds.has(item.chapterId);
    });
  }, [offlineDownloads, studentPermittedClassId, studentPermittedSubjectIds, chapters]);

  // Compute chapter counts and completed counts per subject (respecting class filter)
  const chapterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    chapters.forEach((ch) => {
      const sub = subjects.find((s) => s.id === ch.subjectId);
      if (effectiveClassId !== 'all' && !isSubjectAllowedForClass(sub || { id: ch.subjectId }, effectiveClassId)) {
        return;
      }
      if (effectiveClassId === 'all' || !ch.classLevel || ch.classLevel === 'all' || ch.classLevel === effectiveClassId) {
        counts[ch.subjectId] = (counts[ch.subjectId] || 0) + 1;
      }
    });
    return counts;
  }, [chapters, subjects, effectiveClassId]);

  const completedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    chapters.forEach((ch) => {
      const sub = subjects.find((s) => s.id === ch.subjectId);
      if (effectiveClassId !== 'all' && !isSubjectAllowedForClass(sub || { id: ch.subjectId }, effectiveClassId)) {
        return;
      }
      if (effectiveClassId === 'all' || !ch.classLevel || ch.classLevel === 'all' || ch.classLevel === effectiveClassId) {
        if (progressMap[ch.id]?.status === 'completed') {
          counts[ch.subjectId] = (counts[ch.subjectId] || 0) + 1;
        }
      }
    });
    return counts;
  }, [chapters, subjects, progressMap, effectiveClassId]);

  // Filter chapters based on Class, Permitted Subjects (Class 11-12), Subject, and Search Query first
  const searchScopedChapters = useMemo(() => {
    return chapters.filter((chapter) => {
      if (studentPermittedSubjectIds && !studentPermittedSubjectIds.includes(chapter.subjectId)) {
        return false;
      }

      // 1. Class filter (also ensures Philosophy chapters are hidden for Class 6-10)
      if (effectiveClassId !== 'all') {
        const sub = subjects.find((s) => s.id === chapter.subjectId);
        if (!isSubjectAllowedForClass(sub || { id: chapter.subjectId }, effectiveClassId)) {
          return false;
        }
        if (chapter.classLevel && chapter.classLevel !== 'all' && chapter.classLevel !== effectiveClassId) {
          return false;
        }
      }

      // 2. Subject filter
      if (selectedSubjectId && chapter.subjectId !== selectedSubjectId) {
        return false;
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitleBn = (chapter.titleBn || '').toLowerCase().includes(q);
        const matchesTitleEn = chapter.titleEn?.toLowerCase().includes(q);
        const matchesSummary = (chapter.summaryBn || '').toLowerCase().includes(q);
        const matchesPoints = chapter.keyPoints?.some((p) => p.toLowerCase().includes(q));
        const matchesQuestions = chapter.questions?.some((qu) => qu.question.toLowerCase().includes(q));

        if (!matchesTitleBn && !matchesTitleEn && !matchesSummary && !matchesPoints && !matchesQuestions) {
          return false;
        }
      }

      return true;
    });
  }, [chapters, subjects, effectiveClassId, studentPermittedSubjectIds, selectedSubjectId, searchQuery]);

  const statsChapters = useMemo(() => {
    return chapters.filter((chapter) => {
      if (studentPermittedSubjectIds && !studentPermittedSubjectIds.includes(chapter.subjectId)) {
        return false;
      }
      if (effectiveClassId !== 'all') {
        const sub = subjects.find((s) => s.id === chapter.subjectId);
        if (!isSubjectAllowedForClass(sub || { id: chapter.subjectId }, effectiveClassId)) {
          return false;
        }
        if (chapter.classLevel && chapter.classLevel !== 'all' && chapter.classLevel !== effectiveClassId) {
          return false;
        }
      }
      if (selectedSubjectId && chapter.subjectId !== selectedSubjectId) {
        return false;
      }
      return true;
    });
  }, [chapters, subjects, effectiveClassId, studentPermittedSubjectIds, selectedSubjectId]);

  const statusCounts = useMemo(() => {
    let completed = 0;
    let revision = 0;
    let uncompleted = 0;
    searchScopedChapters.forEach((chapter) => {
      const chStatus = progressMap[chapter.id]?.status || 'not_started';
      if (chStatus === 'completed') {
        completed += 1;
      } else {
        uncompleted += 1;
      }
      if (chStatus === 'revision') {
        revision += 1;
      }
    });
    return {
      all: searchScopedChapters.length,
      uncompleted,
      completed,
      revision,
    };
  }, [searchScopedChapters, progressMap]);

  // Apply Status filter on top of searchScopedChapters
  const filteredChapters = useMemo(() => {
    if (statusFilter === 'all') return searchScopedChapters;
    return searchScopedChapters.filter((chapter) => {
      const chStatus = progressMap[chapter.id]?.status || 'not_started';
      if (statusFilter === 'completed') return chStatus === 'completed';
      if (statusFilter === 'revision') return chStatus === 'revision';
      if (statusFilter === 'uncompleted') return chStatus !== 'completed';
      return true;
    });
  }, [searchScopedChapters, statusFilter, progressMap]);

  // Handle Opening Chapter Notes - Automatically marks chapter as completed as requested!
  const handleOpenChapter = async (chapter: ChapterNote) => {
    setReadingChapter(chapter);
    if (progressMap[chapter.id]?.status !== 'completed') {
      const updated = await storageService.updateProgress(chapter.id, 'completed');
      setProgressMap((prev) => ({ ...prev, [chapter.id]: updated }));
      showToast(`"${chapter.titleBn}" খোলা হয়েছে এবং তোমার পড়া সম্পন্ন তালিকায় যুক্ত হয়েছে ✓`);
    }
  };

  // Handle Progress Status update
  const handleUpdateProgress = async (chapterId: string, status: ProgressStatus) => {
    const updated = await storageService.updateProgress(chapterId, status);
    setProgressMap((prev) => ({ ...prev, [chapterId]: updated }));
    if (status === 'completed') {
      showToast('তোমার অধ্যায়টি পড়া শেষ হিসেবে চিহ্নিত হয়েছে! চমৎকার!');
    }
  };

  // Handle PDF Download (Strictly Teacher-only)
  const handleDownloadPDF = async (chapter: ChapterNote) => {
    if (!isTeacherMode) {
      showToast('শিক্ষার্থীদের জন্য PDF ডাউনলোড বন্ধ রাখা হয়েছে। কেবলমাত্র অ্যাপের ভেতর থেকে নোটস পড়তে পারবে।');
      return;
    }
    const subject = subjects.find((s) => s.id === chapter.subjectId);
    showToast(`"${chapter.titleBn}" এর PDF ফাইল ডাউনলোড হচ্ছে...`);
    try {
      await downloadChapterPDF(
        chapter,
        subject?.nameBn || 'বাংলা',
        subject?.nameEn || 'Bengali'
      );
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'PDF তৈরিতে সমস্যা হয়েছে। আবার চেষ্টা করো।');
    }
  };

  // Toggle Save for Offline
  const handleToggleSaveOffline = async (chapter: ChapterNote) => {
    const isAlreadySaved = offlineDownloads.some((item) => item.chapterId === chapter.id);
    const subject = subjects.find((s) => s.id === chapter.subjectId);

    if (isAlreadySaved) {
      await storageService.removeOfflineChapter(chapter.id);
      setOfflineDownloads((prev) => prev.filter((item) => item.chapterId !== chapter.id));
      showToast('তোমার অফলাইন তালিকা থেকে নোটস সরানো হয়েছে।');
    } else {
      const approxTextKb = Math.max(
        12,
        Math.round(
          new Blob([
            chapter.summaryBn || '',
            ...(chapter.keyPoints || []),
            JSON.stringify(chapter.questions || []),
          ]).size / 1024
        )
      );
      const localSizeKb = chapter.pdfData
        ? Math.max(approxTextKb, Math.round((chapter.pdfData.length * 3) / 4 / 1024))
        : approxTextKb;
      await storageService.saveOfflineChapter(
        chapter,
        subject?.nameBn || 'বিষয়',
        chapter.pdfData,
        localSizeKb
      );
      const updatedList = await storageService.getAllOfflineDownloads();
      setOfflineDownloads(updatedList);
      showToast(
        chapter.pdfUrl && !chapter.pdfData
          ? 'নোটসের লিখিত অংশ তোমার ফোনে অফলাইনে সেভ হয়েছে! বড় PDF ডাউনলোড করতে ইন্টারনেট প্রয়োজন হবে।'
          : 'নোটস ও PDF তোমার ফোনে সেভ হয়েছে! ইন্টারনেট ছাড়াই পড়তে পারবে।'
      );
    }
  };

  // Teacher actions: Save chapter to Firestore (Requires Teacher PIN)
  const handleSaveChapter = async (chapter: ChapterNote, pin: string) => {
    if (!firebaseUser) {
      throw new Error('প্রথমে Google দিয়ে যুক্ত হও।');
    }
    await firestoreService.saveChapter(firebaseUser.uid, pin, chapter);
    showToast(
      editingChapter
        ? 'অধ্যায়টি সফলভাবে আপডেট করেছো।'
        : 'তোমার নতুন অধ্যায় ও PDF সফলভাবে আপলোড হয়েছে!'
    );
    setEditingChapter(null);
    setVerifiedActionPin('');
  };

  // Teacher actions: Request Add Note (Requires Teacher PIN)
  const handleRequestAddChapter = () => {
    setEditingChapter(null);
    setPendingDeleteChapter(null);
    setVerifiedActionPin('');
    setAuthModalMode('add_note');
    setShowAuthModal(true);
  };

  // Teacher actions: Request Edit Note (Requires Teacher PIN)
  const handleRequestEditChapter = (chapter: ChapterNote) => {
    setEditingChapter(chapter);
    setPendingDeleteChapter(null);
    setVerifiedActionPin('');
    setAuthModalMode('add_note');
    setShowAuthModal(true);
  };

  // Teacher actions: Request Delete Note (Requires Teacher PIN)
  const handleRequestDeleteChapter = (chapter: ChapterNote) => {
    setPendingDeleteChapter(chapter);
    setAuthModalMode('delete_note');
    setShowAuthModal(true);
  };

  // Teacher actions: Add subject scoped to selected class (or all classes)
  const handleAddSubject = async (newSubject: SubjectItem) => {
    if (!firebaseUser) {
      throw new Error('প্রথমে Google দিয়ে যুক্ত হও।');
    }
    const saved = await firestoreService.saveSubject(firebaseUser.uid, newSubject, selectedClassId);
    setSelectedSubjectId(saved.id);
    const clsInfo = DEFAULT_CLASSES.find((c) => c.id === selectedClassId);
    showToast(
      selectedClassId === 'all'
        ? `সকল শ্রেণির জন্য "${saved.nameBn}" বিষয়টি যোগ করা হয়েছে!`
        : `${clsInfo?.shortBn || ''} শ্রেণির জন্য "${saved.nameBn}" বিষয়টি যোগ করা হয়েছে!`
    );
  };

  // Teacher actions: Remove subject scoped to selected class (or all classes)
  const handleConfirmDeleteSubject = async () => {
    if (!pendingDeleteSubject || !firebaseUser) return;
    setDeletingSubject(true);
    try {
      await firestoreService.deleteSubject(
        firebaseUser.uid,
        pendingDeleteSubject.id,
        selectedClassId
      );
      if (selectedSubjectId === pendingDeleteSubject.id) {
        setSelectedSubjectId(null);
      }
      const clsInfo = DEFAULT_CLASSES.find((c) => c.id === selectedClassId);
      showToast(
        selectedClassId === 'all'
          ? `সকল শ্রেণি থেকে "${pendingDeleteSubject.nameBn}" বিষয়টি সরানো হয়েছে।`
          : `${clsInfo?.shortBn || ''} থেকে "${pendingDeleteSubject.nameBn}" বিষয়টি সরানো হয়েছে।`
      );
      setPendingDeleteSubject(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'বিষয়টি সরানো যায়নি।');
    } finally {
      setDeletingSubject(false);
    }
  };

  // Respond to student device access request
  const handleAccessRespond = async (
    targetDeviceId: string,
    action: 'approve' | 'deny' | 'revoke',
    permittedClassId?: string,
    permittedSubjectIds?: string[]
  ) => {
    if (!firebaseUser) return;
    try {
      const pendingMeta = pendingRequests.find((r) => r.deviceId === targetDeviceId);
      await firestoreService.respondToAccessRequest(
        firebaseUser.uid,
        targetDeviceId,
        action,
        {
          label: pendingMeta?.label,
          requesterUid: pendingMeta?.requesterUid,
          permittedClassId: permittedClassId || pendingMeta?.requestedClassId,
          permittedSubjectIds: permittedSubjectIds || pendingMeta?.requestedSubjectIds,
        }
      );
      if (action === 'approve') {
        const clsName = DEFAULT_CLASSES.find(
          (c) => c.id === (permittedClassId || pendingMeta?.requestedClassId)
        )?.shortBn;
        showToast(
          clsName
            ? `শিক্ষার্থী ডিভাইসকে ${clsName} শ্রেণির অনুমতি দেওয়া হয়েছে ✓`
            : 'শিক্ষার্থী ডিভাইসকে প্রবেশের অনুমতি দেওয়া হয়েছে ✓'
        );
      } else if (action === 'deny') {
        showToast('অনুরোধটি বাতিল করা হয়েছে।');
      } else {
        showToast('ডিভাইসটির অনুমতি বাতিল করা হয়েছে।');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'অনুমতি পরিবর্তন করা যায়নি।');
    }
  };

  const handleUpdatePermittedAccess = async (
    targetDeviceId: string,
    newClassId: string,
    newSubjectIds?: string[]
  ) => {
    if (!firebaseUser) return;
    try {
      await firestoreService.updatePermittedDeviceAccess(targetDeviceId, newClassId, newSubjectIds);
      const clsName = DEFAULT_CLASSES.find((c) => c.id === newClassId)?.shortBn || '';
      showToast(
        isSubjectChoiceClass(newClassId)
          ? `${clsName} শ্রেণির অনুমোদিত বিষয় আপডেট করা হয়েছে ✓`
          : `অনুমোদিত শ্রেণি পরিবর্তন করে ${clsName} করা হয়েছে ✓`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'তথ্য পরিবর্তন করা যায়নি।');
    }
  };

  // Low data mode toggle
  const handleToggleLowDataMode = () => {
    const updated = !lowDataMode;
    setLowDataMode(updated);
    storageService.saveSettings({ lowDataMode: updated });
    showToast(
      updated
        ? 'ডাটা সেভার চালু: কম খরচে দ্রুত লোড হবে'
        : 'স্বাভাবিক মোড চালু'
    );
  };

  const activeSubject = subjects.find((s) => s.id === selectedSubjectId);
  const activeClass = DEFAULT_CLASSES.find((c) => c.id === effectiveClassId);

  const privacyCurtainOverlay = isPrivacyShieldActive ? (
    <div className="fixed inset-0 z-[100] bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-14 h-14 rounded-2xl bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center mb-4">
        <ShieldAlert className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-extrabold text-white mb-2">
        নিরাপদ পাঠ মোড
      </h3>
      <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed mb-5">
        {shieldReason}
      </p>
      <button
        type="button"
        onClick={dismissShield}
        className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
      >
        অ্যাপে ফিরে যাও
      </button>
    </div>
  ) : null;

  const toastOverlay = toast ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[120] bg-slate-900 text-white px-3.5 py-2.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 max-w-sm"
    >
      <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
      <span>{toast}</span>
    </div>
  ) : null;

  const cachedOfflineAccess = useMemo(() => {
    const cached = getCachedAccessFlags();
    return Boolean(
      !cached.hasPin ||
        cached.isTeacherDevice ||
        (cached.approved && cached.permittedClassId && ALL_CLASS_IDS.includes(cached.permittedClassId))
    );
  }, []);

  const isLoadingScreen =
    !initialSplashDone ||
    !firebaseAuthReady ||
    (!effectiveOnline && !offlineFallbackReady) ||
    (effectiveOnline && Boolean(firebaseUser) && !authReady);

  useEffect(() => {
    if (!isLoadingScreen) {
      setLoadingStalled(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoadingStalled(true);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [isLoadingScreen, syncRetryNonce]);

  const handleRetryCloudSync = () => {
    if (syncRetryNonce >= 2 && (cloudSyncError || loadingStalled)) {
      window.location.reload();
      return;
    }
    if (!firebaseAuthReady) {
      setFirebaseUser(auth.currentUser);
      setFirebaseAuthReady(true);
    }
    setForceOfflineMode(false);
    setCloudSyncError(null);
    setLoadingStalled(false);
    setSyncRetryNonce((n) => n + 1);
  };

  const handleSwitchGoogleAccount = async () => {
    try {
      await signOut(auth);
      setCloudSyncError(null);
      setLoadingStalled(false);
    } catch {
      showToast('অ্যাকাউন্ট থেকে বের হতে সমস্যা হয়েছে। পেজ রিলোড করো।');
    }
  };

  // Loading Screen while initial splash, Firebase Auth, or cloud/offline check finishes
  if (isLoadingScreen) {
    return (
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="min-h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-4 protected-content"
      >
        <div className="flex flex-row items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shrink-0 animate-book-blink">
            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <p className="text-sm sm:text-base font-semibold text-slate-100 tracking-wide">
            আকাশ স্যারের নোটস লোড হচ্ছে...
          </p>
        </div>

        {(cloudSyncError || loadingStalled) && (
          <div className="mt-6 max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center space-y-3 shadow-xl">
            <p className="text-xs text-slate-300 leading-relaxed">
              {cloudSyncError ||
                'সংযোগ স্থাপনে স্বাভাবিকের চেয়ে একটু বেশি সময় লাগছে। ইন্টারনেট চালু আছে কি না দেখে আবার চেষ্টা করো।'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleRetryCloudSync}
                className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>পুনরায় চেষ্টা করো</span>
              </button>
              {firebaseUser && (
                <button
                  type="button"
                  onClick={handleSwitchGoogleAccount}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>অ্যাকাউন্ট বদলাও</span>
                </button>
              )}
            </div>
            {cachedOfflineAccess && (
              <button
                type="button"
                onClick={() => {
                  setForceOfflineMode(true);
                  setCloudSyncError(null);
                  setLoadingStalled(false);
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-amber-300 border border-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                অফলাইন সংরক্ষিত নোটসে প্রবেশ করো
              </button>
            )}
          </div>
        )}

        {privacyCurtainOverlay}
        {toastOverlay}
      </div>
    );
  }

  // Google Sign-In Gate when online and not yet signed in (offline permitted devices bypass via IndexedDB)
  if (!firebaseUser && (effectiveOnline || !offlineFallbackReady || (hasPin && accessStatus !== 'approved'))) {
    return (
      <>
        <GoogleAuthGate isOnline={effectiveOnline} />
        {privacyCurtainOverlay}
        {toastOverlay}
      </>
    );
  }

  // Student Access Gate: Required once teacher creates/logs in with PIN, until teacher permits this device for a class
  if (hasPin && accessStatus !== 'approved') {
    return (
      <>
        <StudentAccessGate
          accessStatus={accessStatus}
          isOnline={effectiveOnline}
          subjects={subjects}
          initialClassId={myRequestDoc?.requestedClassId}
          initialSubjectIds={myRequestDoc?.requestedSubjectIds}
          initialLabel={myRequestDoc?.label}
          onSendRequest={async (requestedClassId, label, requestedSubjectIds) => {
            if (!firebaseUser) {
              throw new Error('প্রথমে Google দিয়ে প্রবেশ করো।');
            }
            const teacherUid = publicConfig?.teacherUid || firebaseUser.uid;
            const status = await firestoreService.requestStudentAccess(
              deviceId,
              firebaseUser.uid,
              teacherUid,
              requestedClassId,
              label,
              requestedSubjectIds
            );
            setAccessStatus(status);
          }}
          onRefreshStatus={async () => {
            if (firebaseUser) {
              const found = await firestoreService.findPermittedDeviceByStudentUid(firebaseUser.uid);
              if (found && found.permittedClassId && ALL_CLASS_IDS.includes(found.permittedClassId)) {
                setActiveDeviceId(found.deviceId);
                setDeviceId(found.deviceId);
                setPermittedDeviceDoc(found);
                showToast('তোমার অনুমতি নিশ্চিত করা হয়েছে! স্বাগতম!');
                return;
              }
            }
            setSyncRetryNonce((n) => n + 1);
            showToast('অবস্থা পুনরায় যাচাই করা হয়েছে ✓');
          }}
          onOpenTeacherRecovery={() => {
            setAuthModalMode('login');
            setShowAuthModal(true);
          }}
        />

        {showAuthModal && (
          <TeacherAuthModal
            hasPin={hasPin}
            teacherLoggedIn={teacherLoggedIn}
            initialMode={authModalMode}
            onSetupPin={async (newPin) => {
              if (!firebaseUser) throw new Error('প্রথমে Google দিয়ে যুক্ত হও।');
              await firestoreService.setupTeacherPin(firebaseUser.uid, deviceId, newPin);
              setShowAuthModal(false);
            }}
            onLoginWithPin={async (pin) => {
              if (!firebaseUser) throw new Error('প্রথমে Google দিয়ে যুক্ত হও।');
              await firestoreService.loginTeacher(firebaseUser.uid, deviceId, pin);
              setShowAuthModal(false);
              showToast('শিক্ষক মোডে প্রবেশ করেছো!');
            }}
            onTurnOffWithPin={async (pin) => {
              await firestoreService.turnOffTeacherMode(pin);
              setShowAuthModal(false);
              showToast('সঠিক পিন নিশ্চিত করে শিক্ষক মোড বন্ধ করা হয়েছে।');
            }}
            onChangePin={async (previousPin, newPin) => {
              await firestoreService.changeTeacherPin(previousPin, newPin);
              showToast('তোমার শিক্ষক পিন সফলভাবে পরিবর্তন করা হয়েছে!');
            }}
            onClose={() => setShowAuthModal(false)}
          />
        )}

        {privacyCurtainOverlay}

        {toastOverlay}
      </>
    );
  }

  return (
    <div
      onContextMenu={(e) => {
        if (!isTeacherMode && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
        }
      }}
      className={`min-h-screen w-full max-w-full overflow-x-hidden flex flex-col ${
        lowDataMode ? 'bg-slate-100' : 'bg-slate-50'
      } ${!isTeacherMode ? 'protected-content' : ''}`}
    >
      {/* 1. Header Bar */}
      <Header
        hasPin={hasPin}
        isTeacherMode={isTeacherMode}
        isTeacherDevice={isTeacherDevice}
        onToggleTeacherMode={() => {
          if (!hasPin) {
            setAuthModalMode('create_pin');
            setShowAuthModal(true);
          } else if (isTeacherMode) {
            // Must confirm previous PIN to turn off teacher mode
            setAuthModalMode('turn_off');
            setShowAuthModal(true);
          } else {
            setAuthModalMode('login');
            setShowAuthModal(true);
          }
        }}
        onOpenChangePinModal={() => {
          setAuthModalMode('change_pin');
          setShowAuthModal(true);
        }}
        pendingRequestsCount={pendingRequests.length}
        onOpenRequestsModal={() => setShowRequestsModal(true)}
        isOnline={isOnline}
        offlineCount={visibleOfflineDownloads.length}
        onOpenOfflineLibrary={() => setShowOfflineLibraryModal(true)}
        lowDataMode={lowDataMode}
        onToggleLowDataMode={handleToggleLowDataMode}
        onOpenBackupModal={() => setShowBackupModal(true)}
        onShareAppLink={async () => {
          const directUrl = window.location.origin.startsWith('https://ais-dev-')
            ? window.location.origin.replace('https://ais-dev-', 'https://ais-pre-')
            : window.location.origin;
          try {
            if (navigator.share) {
              await navigator.share({
                title: 'আকাশ স্যারের নোটস - Akash Sirer Notes',
                text: 'আকাশ স্যারের নোটস অ্যাপটি সরাসরি খুলতে এই লিংকে ক্লিক করো:',
                url: directUrl,
              });
              return true;
            }
          } catch {
            // User cancelled share sheet or share unavailable; fall back to clipboard
          }
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(directUrl);
              showToast('সরাসরি অ্যাপ খোলার লিংক কপি হয়েছে ✓');
              return true;
            }
          } catch {
            // Fallback below
          }
          try {
            const ta = document.createElement('textarea');
            ta.value = directUrl;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('সরাসরি অ্যাপ খোলার লিংক কপি হয়েছে ✓');
            return true;
          } catch {
            showToast(directUrl);
            return false;
          }
        }}
      />

      {/* Live Incoming Student Permission Alert Banner on Teacher Device */}
      {(isTeacherMode || isTeacherDevice) && pendingRequests.length > 0 && (
        <div className="w-full bg-amber-50 border-b border-amber-300">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0 animate-bounce" />
              <div className="text-xs text-amber-950 min-w-0 flex items-center gap-1.5 flex-wrap">
                <strong className="font-bold">
                  নতুন প্রবেশের অনুমতি চাইছে ({pendingRequests.length}):
                </strong>
                <span className="font-semibold">{pendingRequests[0].label}</span>
                {pendingRequests[0].requestedClassId && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-bold text-[11px]">
                    {DEFAULT_CLASSES.find((c) => c.id === pendingRequests[0].requestedClassId)?.shortBn ||
                      pendingRequests[0].requestedClassId}
                  </span>
                )}
                {isSubjectChoiceClass(pendingRequests[0].requestedClassId) &&
                  pendingRequests[0].requestedSubjectIds &&
                  pendingRequests[0].requestedSubjectIds.length > 0 && (
                    <span className="text-[11px] text-amber-900">
                      ({pendingRequests[0].requestedSubjectIds
                        .map((id) => subjects.find((s) => s.id === id)?.nameBn || id)
                        .join(', ')})
                    </span>
                  )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              <button
                onClick={() => {
                  const req = pendingRequests[0];
                  if (isSubjectChoiceClass(req.requestedClassId)) {
                    setShowRequestsModal(true);
                  } else if (req.requestedClassId && ALL_CLASS_IDS.includes(req.requestedClassId)) {
                    handleAccessRespond(req.deviceId, 'approve', req.requestedClassId);
                  } else {
                    setShowRequestsModal(true);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>
                  {isSubjectChoiceClass(pendingRequests[0].requestedClassId)
                    ? 'বিষয় বেছে অনুমতি দাও'
                    : 'অনুমতি দাও'}
                </span>
              </button>
              <button
                onClick={() => handleAccessRespond(pendingRequests[0].deviceId, 'deny')}
                className="px-2.5 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>বাতিল</span>
              </button>
              {pendingRequests.length > 1 && (
                <button
                  onClick={() => setShowRequestsModal(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  সব দেখো ({pendingRequests.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. MAIN MENU TOP SECTION: Search Bar prominently at the very top */}
      <div className="w-full bg-slate-900 border-b border-slate-800 pb-3 pt-2">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            resultCount={filteredChapters.length}
            totalCount={searchScopedChapters.length}
            statusCounts={statusCounts}
          />
        </div>
      </div>

      {/* 3. Class Selection Option (Locked to permitted class for students) */}
      <ClassBar
        classes={DEFAULT_CLASSES}
        selectedClassId={effectiveClassId}
        lockedClassId={studentPermittedClassId}
        onSelectClass={(clsId) => {
          if (studentPermittedClassId) return;
          setSelectedClassId(clsId);
          if (selectedSubjectId) {
            const currentSub = subjects.find((s) => s.id === selectedSubjectId);
            if (!isSubjectAllowedForClass(currentSub || { id: selectedSubjectId }, clsId)) {
              setSelectedSubjectId(null);
            }
          }
        }}
      />

      {/* 4. Subject Selection Option (Class-scoped subjects + Add/Remove Subject) */}
      <SubjectBar
        subjects={visibleSubjects}
        selectedSubjectId={selectedSubjectId}
        selectedClassLabel={activeClass?.shortBn || 'সকল শ্রেণি'}
        onSelectSubject={(id) => {
          setSelectedSubjectId(id);
          setSearchQuery('');
        }}
        chapterCounts={chapterCounts}
        completedCounts={completedCounts}
        isTeacherMode={isTeacherMode}
        onOpenAddSubject={() => setShowAddSubjectModal(true)}
        onDeleteSubject={(sub) => setPendingDeleteSubject(sub)}
      />

      {/* 5. Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5">
        {/* Hero Banner in Second Person Bengali */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white rounded-3xl p-4 sm:p-6 shadow-xs border border-slate-800 relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>আকাশ স্যারের ডিজিটাল পাঠশালা</span>
            </div>

            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white mb-1.5 leading-snug">
              {activeSubject
                ? `${activeSubject.nameBn} - তোমার পছন্দের বিষয়ের নোটস`
                : 'তোমার বিষয় ও অধ্যায়ভিত্তিক স্টাডি মেটেরিয়াল'}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3.5">
              {activeClass && activeClass.id !== 'all'
                ? `${activeClass.nameBn} - `
                : ''}
              {activeSubject
                ? activeSubject.descriptionBn
                : `${
                    visibleSubjects.length > 0
                      ? visibleSubjects.map((s) => s.nameBn).join(', ')
                      : 'তোমার পছন্দের বিষয়গুলোর'
                  } প্রয়োজনীয় নোটস ও PDF মনোযোগ দিয়ে অ্যাপের ভেতর থেকেই পড়ো।`}
            </p>

            {/* Quick Hero Action */}
            <div className="flex items-center gap-2 flex-wrap">
              {isTeacherMode ? (
                <button
                  onClick={handleRequestAddChapter}
                  className="min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>নতুন নোটস ও PDF আপলোড করো</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowOfflineLibraryModal(true)}
                    className="min-h-[40px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>তোমার অফলাইন নোটস ({visibleOfflineDownloads.length})</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 6. Progress Tracker (Second Person) */}
        <ProgressStats
          subjects={visibleSubjects}
          chapters={statsChapters}
          progressMap={progressMap}
          selectedSubjectId={selectedSubjectId}
        />

        {/* 7. Active Status Header */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers className="w-4 h-4 text-slate-500 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {activeSubject ? `${activeSubject.nameBn}` : 'উপলব্ধ সকল বিষয়'}
              {activeClass && activeClass.id !== 'all' ? ` (${activeClass.shortBn})` : ''} - অধ্যায় তালিকা
            </h3>
            <span className="text-[11px] font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.2 rounded-full shrink-0">
              {filteredChapters.length}
            </span>
          </div>

          {isTeacherMode && (
            <button
              onClick={handleRequestAddChapter}
              className="min-h-[34px] px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>নোটস আপলোড</span>
            </button>
          )}
        </div>

        {/* 8. Chapters Grid & Empty State (No Default Notes) */}
        {filteredChapters.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 text-center text-slate-500 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto mb-3 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>

            <h4 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
              {searchQuery
                ? `"${searchQuery}" এর জন্য কোনো নোটস পাওয়া যায়নি`
                : statusFilter !== 'all'
                ? 'এই ফিল্টারে কোনো নোটস পাওয়া যায়নি'
                : 'এখনও কোনো নোটস আপলোড করা হয়নি'}
            </h4>

            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4 leading-relaxed">
              {searchQuery ? (
                'অনুসন্ধানের বানান পরীক্ষা করো অথবা অন্য বিষয় নির্বাচন করো।'
              ) : statusFilter !== 'all' ? (
                'অন্য ফিল্টার বা "সব" বাটনে ট্যাপ করে তোমার সব নোটস দেখো।'
              ) : isTeacherMode ? (
                'তুমি শিক্ষক হিসেবে লগইন করে আছো। এই বিষয়ে শিক্ষার্থীদের জন্য প্রথম নোটস ও PDF ফাইল আপলোড করো।'
              ) : (
                'তুমি এখনও এই বিষয়ে কোনো নোটস পাওনি। আকাশ স্যার শীঘ্রই তোমার ক্লাসের জন্য নতুন নোটস ও PDF আপলোড করবেন।'
              )}
            </p>

            {statusFilter !== 'all' || searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setSearchQuery('');
                }}
                className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                সব ফিল্টার মুছে সব নোটস দেখো
              </button>
            ) : isTeacherMode ? (
              <button
                type="button"
                onClick={handleRequestAddChapter}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>প্রথম নোটস ও PDF ফাইল আপলোড করো</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedSubjectId(null);
                  if (!studentPermittedClassId) {
                    setSelectedClassId('all');
                  }
                  setStatusFilter('all');
                  setSearchQuery('');
                }}
                className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                অন্যান্য বিষয় দেখো
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            {filteredChapters.map((chapter) => {
              const subject = subjects.find((s) => s.id === chapter.subjectId);
              const progress = progressMap[chapter.id];
              const isSaved = offlineDownloads.some((d) => d.chapterId === chapter.id);

              return (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  subject={subject}
                  progress={progress}
                  onUpdateProgress={handleUpdateProgress}
                  onReadNotes={(ch) => handleOpenChapter(ch)}
                  onDownloadPDF={handleDownloadPDF}
                  isSavedOffline={isSaved}
                  onToggleSaveOffline={handleToggleSaveOffline}
                  isTeacherMode={isTeacherMode}
                  onEditChapter={handleRequestEditChapter}
                  onDeleteChapter={handleRequestDeleteChapter}
                  lowDataMode={lowDataMode}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* 9. Footer in Second Person Bengali */}
      <footer className="bg-white border-t border-slate-200 py-5 mt-10 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 flex flex-col items-center justify-center gap-1.5">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-bold text-slate-800">আকাশ স্যারের নোটস (Akash Sirer Notes)</span>
            <span>• তোমার অফলাইন স্টাডি অ্যাপ</span>
          </div>
          <p className="text-[11px] sm:text-xs font-medium text-amber-700">
            প্রতিদিন একটু একটু করে এগিয়ে চলো—তোমার নিয়মিত অধ্যবসায়ই তোমাকে সাফল্যের শিখরে পৌঁছে দেবে।
          </p>
        </div>
      </footer>

      {/* MODALS */}

      {/* Note Reader Modal */}
      {readingChapter && (
        <NoteReaderModal
          key={readingChapter.id}
          chapter={readingChapter}
          subject={subjects.find((s) => s.id === readingChapter.subjectId)}
          currentStatus={progressMap[readingChapter.id]?.status || 'not_started'}
          onUpdateStatus={(status) => handleUpdateProgress(readingChapter.id, status)}
          onDownloadPDF={handleDownloadPDF}
          isSavedOffline={offlineDownloads.some((d) => d.chapterId === readingChapter.id)}
          onToggleSaveOffline={handleToggleSaveOffline}
          onClose={() => setReadingChapter(null)}
          isTeacherMode={isTeacherMode}
          isTeacherDevice={isTeacherDevice}
          privacyCurtain={privacyCurtainOverlay}
          toastOverlay={toastOverlay}
          onEditChapter={(ch) => {
            setReadingChapter(null);
            handleRequestEditChapter(ch);
          }}
          onDeleteChapter={(ch) => {
            setReadingChapter(null);
            handleRequestDeleteChapter(ch);
          }}
        />
      )}

      {/* Teacher Authentication Modal - Enforces Single Teacher Setup, Previous PIN on Change/Off, and Add/Delete PIN Verification */}
      {showAuthModal && (
        <TeacherAuthModal
          hasPin={hasPin}
          teacherLoggedIn={teacherLoggedIn}
          initialMode={authModalMode}
          targetItemTitle={pendingDeleteChapter?.titleBn}
          onSetupPin={async (newPin) => {
            if (!firebaseUser) throw new Error('প্রথমে Google দিয়ে যুক্ত হও।');
            await firestoreService.setupTeacherPin(firebaseUser.uid, deviceId, newPin);
            setShowAuthModal(false);
            showToast('তোমার শিক্ষক পিন তৈরি হয়েছে এবং তুমি শিক্ষক মোডে প্রবেশ করেছো!');
          }}
          onLoginWithPin={async (pin) => {
            if (!firebaseUser) throw new Error('প্রথমে Google দিয়ে যুক্ত হও।');
            await firestoreService.loginTeacher(firebaseUser.uid, deviceId, pin);
            setShowAuthModal(false);
            showToast('শিক্ষক মোডে প্রবেশ করেছো! এখন তুমি নোটস ও বিষয় যোগ করতে পারবে।');
          }}
          onTurnOffWithPin={async (pin) => {
            await firestoreService.turnOffTeacherMode(pin);
            setShowAuthModal(false);
            showToast('সঠিক পিন নিশ্চিত করে শিক্ষক মোড বন্ধ করা হয়েছে।');
          }}
          onChangePin={async (previousPin, newPin) => {
            await firestoreService.changeTeacherPin(previousPin, newPin);
            showToast('তোমার শিক্ষক পিন সফলভাবে পরিবর্তন করা হয়েছে!');
          }}
          onVerifyPinAction={async (pin) => {
            if (authModalMode === 'delete_note' && pendingDeleteChapter) {
              const chTitle = pendingDeleteChapter.titleBn;
              const chId = pendingDeleteChapter.id;
              const chPdfUrl = pendingDeleteChapter.pdfUrl;
              await firestoreService.deleteChapter(pin, chId);
              if (chPdfUrl) {
                const match = chPdfUrl.match(/\/api\/pdfs\/([a-zA-Z0-9_-]+)/);
                if (match) {
                  const pdfId = match[1];
                  fetch(`/api/pdfs/${pdfId}`, { method: 'DELETE' }).catch(() => {});
                  firestoreService.deletePdfChunks(pdfId).catch(() => {});
                  storageService.deleteCachedPdf(pdfId).catch(() => {});
                }
              }
              await storageService.removeOfflineChapter(chId);
              setOfflineDownloads((prev) => prev.filter((item) => item.chapterId !== chId));
              showToast(`"${chTitle}" অধ্যায়টি পিন দিয়ে নিশ্চিত করে মুছে ফেলা হয়েছে।`);
              setPendingDeleteChapter(null);
              setShowAuthModal(false);
            } else if (authModalMode === 'add_note') {
              await firestoreService.verifyActionPin(pin);
              setVerifiedActionPin(pin);
              setShowAuthModal(false);
              setShowUploadModal(true);
            }
          }}
          onClose={() => {
            setShowAuthModal(false);
            setPendingDeleteChapter(null);
          }}
        />
      )}

      {/* Teacher Permission Requests & Permitted Devices Modal */}
      {showRequestsModal && (
        <TeacherRequestsModal
          subjects={subjects}
          pendingRequests={pendingRequests}
          permittedDevices={permittedDevices}
          onApprove={(targetId, permittedClassId, permittedSubjectIds) =>
            handleAccessRespond(targetId, 'approve', permittedClassId, permittedSubjectIds)
          }
          onDeny={(targetId) => handleAccessRespond(targetId, 'deny')}
          onRevoke={(targetId) => handleAccessRespond(targetId, 'revoke')}
          onUpdatePermittedAccess={handleUpdatePermittedAccess}
          onRefresh={async () => {
            showToast('অনুমতির অনুরোধসমূহ লাইভ সিঙ্ক করা আছে ✓');
          }}
          onClose={() => setShowRequestsModal(false)}
        />
      )}

      {/* Teacher Upload / Edit Chapter Modal - Validates Teacher PIN upon saving notes */}
      {showUploadModal && (
        <TeacherUploadModal
          subjects={subjects}
          defaultSubjectId={selectedSubjectId}
          defaultClassId={selectedClassId !== 'all' ? selectedClassId : undefined}
          chapterToEdit={editingChapter}
          initialVerifiedPin={verifiedActionPin}
          onVerifyPin={(pin) => firestoreService.verifyActionPin(pin)}
          onSaveChapter={handleSaveChapter}
          onClose={() => {
            setShowUploadModal(false);
            setEditingChapter(null);
            setVerifiedActionPin('');
          }}
        />
      )}

      {/* Teacher Add Subject Modal */}
      {showAddSubjectModal && (
        <AddSubjectModal
          selectedClassId={selectedClassId}
          selectedClassLabel={activeClass?.nameBn || 'সকল শ্রেণি'}
          allSubjects={subjects}
          onAddSubject={handleAddSubject}
          onClose={() => setShowAddSubjectModal(false)}
        />
      )}

      {/* Teacher Confirm Subject Removal Modal */}
      {pendingDeleteSubject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">বিষয়টি সরাবে?</h3>
                <p className="text-[11px] text-slate-500">
                  {selectedClassId === 'all'
                    ? 'সকল শ্রেণি থেকে সরানো হবে'
                    : `শুধুমাত্র ${activeClass?.shortBn || ''} থেকে সরানো হবে`}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              {selectedClassId === 'all' ? (
                <>
                  তুমি কি <strong>সকল শ্রেণি</strong> থেকে{' '}
                  <strong>&quot;{pendingDeleteSubject.nameBn}&quot;</strong> বিষয়টি এবং এর নোটস
                  সম্পূর্ণভাবে সরাতে চাও?
                </>
              ) : (
                <>
                  তুমি কি শুধুমাত্র <strong>{activeClass?.nameBn}</strong> থেকে{' '}
                  <strong>&quot;{pendingDeleteSubject.nameBn}&quot;</strong> বিষয়টি সরাতে চাও?
                  (অন্যান্য শ্রেণিতে বিষয়টি আগের মতোই থাকবে)
                </>
              )}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={deletingSubject}
                onClick={() => setPendingDeleteSubject(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={deletingSubject}
                onClick={handleConfirmDeleteSubject}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
              >
                {deletingSubject ? 'সরানো হচ্ছে...' : 'হ্যাঁ, সরাও'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Offline Downloads Library */}
      {showOfflineLibraryModal && (
        <OfflineLibraryModal
          savedItems={visibleOfflineDownloads}
          chapters={chapters}
          isTeacherMode={isTeacherMode}
          onReadChapter={(ch) => handleOpenChapter(ch)}
          onDownloadPDF={handleDownloadPDF}
          onRemoveOffline={async (chapterId) => {
            await storageService.removeOfflineChapter(chapterId);
            setOfflineDownloads((prev) => prev.filter((d) => d.chapterId !== chapterId));
            showToast('তোমার অফলাইন ফাইল মুছে ফেলা হয়েছে।');
          }}
          onClose={() => setShowOfflineLibraryModal(false)}
        />
      )}

      {/* Offline Data Sync & Backup Modal (Teacher only) */}
      {showBackupModal && isTeacherMode && (
        <DataBackupModal
          onRefreshData={async () => {
            await loadLocalData();
            const loadedSubjects = await storageService.getAllSubjects();
            const loadedChapters = await storageService.getAllChapters();
            const activeSubjects = loadedSubjects.length > 0 ? loadedSubjects : DEFAULT_SUBJECTS;
            setSubjects(activeSubjects);
            setChapters(
              studentPermittedClassId
                ? loadedChapters.filter((ch) => {
                    const sub = activeSubjects.find((s) => s.id === ch.subjectId);
                    if (!isSubjectAllowedForClass(sub || { id: ch.subjectId }, studentPermittedClassId)) {
                      return false;
                    }
                    return !ch.classLevel || ch.classLevel === 'all' || ch.classLevel === studentPermittedClassId;
                  })
                : loadedChapters
            );
          }}
          onClose={() => setShowBackupModal(false)}
        />
      )}

      {/* Global Anti-Screenshot / Anti-Recording Blackout Privacy Curtain */}
      {privacyCurtainOverlay}

      {/* Toast Notification */}
      {toastOverlay}
    </div>
  );
}
