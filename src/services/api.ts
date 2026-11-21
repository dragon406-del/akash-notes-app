import { ChapterNote, SubjectItem } from '../types';

export type AccessStatus = 'approved' | 'pending' | 'denied' | 'needs_permission';

export interface PendingAccessRequest {
  deviceId: string;
  label: string;
  requestedClassId?: string;
  requestedSubjectIds?: string[];
  userAgent: string;
  requestedAt: string;
  status: 'pending' | 'denied';
}

export interface PermittedDevice {
  deviceId: string;
  label: string;
  permittedClassId?: string;
  permittedSubjectIds?: string[];
  approvedAt: string;
}

export interface ServerStateResponse {
  hasPin: boolean;
  teacherLoggedIn: boolean;
  isTeacherDevice: boolean;
  isTeacherActiveOnThisDevice: boolean;
  accessStatus: AccessStatus;
  subjects: SubjectItem[];
  chapters: ChapterNote[];
  pendingRequests: PendingAccessRequest[];
  permittedDevices: PermittedDevice[];
}

const DEVICE_ID_KEY = 'akash_device_id';
const DEVICE_APPROVED_KEY = 'akash_device_approved';
const DEVICE_IS_TEACHER_KEY = 'akash_is_teacher_device';
const SERVER_HAS_PIN_KEY = 'akash_server_has_pin';
const PERMITTED_CLASS_KEY = 'akash_permitted_class_id';
const PERMITTED_SUBJECTS_KEY = 'akash_permitted_subject_ids';

const memoryStorage = new Map<string, string>();

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function safeSetItem(key: string, value: string): void {
  memoryStorage.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Fallback to memoryStorage when storage is blocked
  }
}

function safeRemoveItem(key: string): void {
  memoryStorage.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Fallback to memoryStorage when storage is blocked
  }
}

function generateRandomDeviceId(prefix = 'dev'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  let id = safeGetItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateRandomDeviceId('dev');
    safeSetItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function setActiveDeviceId(id: string): string {
  const clean = id.trim();
  if (clean) {
    safeSetItem(DEVICE_ID_KEY, clean);
  }
  return clean || getOrCreateDeviceId();
}

export function rotateDeviceIdForUid(uid: string): string {
  const cleanUidPrefix = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'user';
  const nextId = generateRandomDeviceId(`dev_${cleanUidPrefix}`);
  safeSetItem(DEVICE_ID_KEY, nextId);
  return nextId;
}

export function getDefaultDeviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  let os = 'মোবাইল / কম্পিউটার';
  if (/Android/i.test(ua)) os = 'Android মোবাইল';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iPhone / iPad';
  else if (/Windows/i.test(ua)) os = 'Windows পিসি';
  else if (/Mac/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'ব্রাউজার';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  return `${os} (${browser})`;
}

export function getCachedAccessFlags() {
  let permittedSubjectIds: string[] | null = null;
  const rawSubjects = safeGetItem(PERMITTED_SUBJECTS_KEY);
  if (rawSubjects) {
    try {
      const parsed = JSON.parse(rawSubjects);
      if (Array.isArray(parsed)) {
        permittedSubjectIds = parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      }
    } catch {
      permittedSubjectIds = null;
    }
  }
  return {
    approved: safeGetItem(DEVICE_APPROVED_KEY) === 'true',
    isTeacherDevice: safeGetItem(DEVICE_IS_TEACHER_KEY) === 'true',
    hasPin: safeGetItem(SERVER_HAS_PIN_KEY) === 'true',
    permittedClassId: safeGetItem(PERMITTED_CLASS_KEY) || '',
    permittedSubjectIds,
  };
}

export function setCachedAccessFlags(opts: {
  approved?: boolean;
  isTeacherDevice?: boolean;
  hasPin?: boolean;
  permittedClassId?: string | null;
  permittedSubjectIds?: string[] | null;
}) {
  if (typeof opts.approved === 'boolean') {
    safeSetItem(DEVICE_APPROVED_KEY, opts.approved ? 'true' : 'false');
  }
  if (typeof opts.isTeacherDevice === 'boolean') {
    safeSetItem(DEVICE_IS_TEACHER_KEY, opts.isTeacherDevice ? 'true' : 'false');
  }
  if (typeof opts.hasPin === 'boolean') {
    safeSetItem(SERVER_HAS_PIN_KEY, opts.hasPin ? 'true' : 'false');
  }
  if (opts.permittedClassId !== undefined) {
    if (opts.permittedClassId) {
      safeSetItem(PERMITTED_CLASS_KEY, opts.permittedClassId);
    } else {
      safeRemoveItem(PERMITTED_CLASS_KEY);
    }
  }
  if (opts.permittedSubjectIds !== undefined) {
    if (Array.isArray(opts.permittedSubjectIds)) {
      safeSetItem(PERMITTED_SUBJECTS_KEY, JSON.stringify(opts.permittedSubjectIds));
    } else {
      safeRemoveItem(PERMITTED_SUBJECTS_KEY);
    }
  }
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'সার্ভারে সংযোগে সমস্যা হয়েছে।');
  }
  return data as T;
}

export const apiService = {
  fetchState(deviceId: string) {
    return apiRequest<ServerStateResponse>(`/api/state?deviceId=${encodeURIComponent(deviceId)}`);
  },

  setupTeacherPin(deviceId: string, newPin: string) {
    return apiRequest<{ ok: boolean; state: ServerStateResponse }>('/api/teacher/setup-pin', {
      method: 'POST',
      body: JSON.stringify({ deviceId, newPin }),
    });
  },

  loginTeacher(deviceId: string, pin: string) {
    return apiRequest<{ ok: boolean; state: ServerStateResponse }>('/api/teacher/login', {
      method: 'POST',
      body: JSON.stringify({ deviceId, pin }),
    });
  },

  turnOffTeacherMode(deviceId: string, pin: string) {
    return apiRequest<{ ok: boolean; state: ServerStateResponse }>('/api/teacher/turn-off', {
      method: 'POST',
      body: JSON.stringify({ deviceId, pin }),
    });
  },

  changeTeacherPin(deviceId: string, previousPin: string, newPin: string) {
    return apiRequest<{ ok: boolean; state: ServerStateResponse }>('/api/teacher/change-pin', {
      method: 'POST',
      body: JSON.stringify({ deviceId, previousPin, newPin }),
    });
  },

  requestStudentAccess(deviceId: string, label?: string) {
    return apiRequest<{
      ok: boolean;
      accessStatus: AccessStatus;
      request?: PendingAccessRequest;
      state?: ServerStateResponse;
    }>('/api/access/request', {
      method: 'POST',
      body: JSON.stringify({
        deviceId,
        label: label?.trim() || getDefaultDeviceLabel(),
        userAgent: navigator.userAgent,
      }),
    });
  },

  respondToAccessRequest(
    deviceId: string,
    targetDeviceId: string,
    action: 'approve' | 'deny' | 'revoke'
  ) {
    return apiRequest<{ ok: boolean; state: ServerStateResponse }>('/api/access/respond', {
      method: 'POST',
      body: JSON.stringify({ deviceId, targetDeviceId, action }),
    });
  },

  saveChapter(deviceId: string, pin: string, chapter: ChapterNote) {
    return apiRequest<{ ok: boolean; chapters: ChapterNote[] }>('/api/chapters', {
      method: 'POST',
      body: JSON.stringify({ deviceId, pin, chapter }),
    });
  },

  deleteChapter(deviceId: string, pin: string, chapterId: string) {
    return apiRequest<{ ok: boolean; chapters: ChapterNote[] }>(
      `/api/chapters/${encodeURIComponent(chapterId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ deviceId, pin }),
      }
    );
  },

  saveSubject(deviceId: string, subject: SubjectItem, classId: string) {
    return apiRequest<{ ok: boolean; subject: SubjectItem; subjects: SubjectItem[] }>('/api/subjects', {
      method: 'POST',
      body: JSON.stringify({ deviceId, subject, classId }),
    });
  },

  deleteSubject(deviceId: string, subjectId: string, classId: string) {
    return apiRequest<{ ok: boolean; subjects: SubjectItem[]; chapters: ChapterNote[] }>(
      `/api/subjects/${encodeURIComponent(subjectId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ deviceId, classId }),
      }
    );
  },
};
