import { ChapterNote, OfflineSavedItem, ProgressStatus, StudentProgress, SubjectItem } from '../types';
import { DEFAULT_CHAPTERS, DEFAULT_SUBJECTS } from '../data/defaultData';

const DB_NAME = 'AkashSirNotesDB';
const DB_VERSION = 2;

interface StorageSettings {
  teacherPin?: string;
  lowDataMode: boolean;
  fontSize: 'normal' | 'large' | 'extra-large';
}

const DEFAULT_SETTINGS: StorageSettings = {
  lowDataMode: false,
  fontSize: 'normal',
};

const storageMemFallback = new Map<string, string>();

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return storageMemFallback.get(key) ?? null;
  }
}

function safeStorageSet(key: string, value: string): void {
  storageMemFallback.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or security restriction errors
  }
}

function safeStorageRemove(key: string): void {
  storageMemFallback.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage restriction errors
  }
}

class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported on this browser'));
        return;
      }

      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.dbPromise = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const timer = window.setTimeout(() => {
        fail(new Error('IndexedDB open timed out'));
      }, 2500);

      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        fail(err);
        return;
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('subjects')) {
          db.createObjectStore('subjects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chapters')) {
          const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chapterStore.createIndex('subjectId', 'subjectId', { unique: false });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'chapterId' });
        }
        if (!db.objectStoreNames.contains('offline_downloads')) {
          db.createObjectStore('offline_downloads', { keyPath: 'chapterId' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('pdf_cache')) {
          db.createObjectStore('pdf_cache', { keyPath: 'pdfId' });
        }
      };

      request.onsuccess = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(request.result);
      };

      request.onerror = () => {
        fail(request.error || new Error('IndexedDB open failed'));
      };

      request.onblocked = () => {
        fail(new Error('IndexedDB open blocked'));
      };
    });

    return this.dbPromise;
  }

  // Helper transaction execution
  private async withTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
  ): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      try {
        const result = callback(store);
        if ('onsuccess' in result) {
          (result as IDBRequest).onsuccess = () => resolve((result as IDBRequest).result);
          (result as IDBRequest).onerror = () => reject((result as IDBRequest).error);
        } else {
          Promise.resolve(result).then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  // Initialize and seed if empty
  public async initialize(): Promise<void> {
    try {
      const subjects = await this.getAllSubjects();
      if (subjects.length === 0) {
        // Seed default subjects
        for (const sub of DEFAULT_SUBJECTS) {
          await this.saveSubject(sub);
        }
      } else {
        const phil = subjects.find((s) => s.id === 'philosophy');
        if (phil && !Array.isArray(phil.allowedClasses)) {
          await this.saveSubject({
            ...phil,
            descriptionBn: 'পাশ্চাত্য ও ভারতীয় দর্শন, যুক্তিবিজ্ঞান ও নীতিবিদ্যা (একাদশ ও দ্বাদশ শ্রেণি)',
            allowedClasses: ['class-11', 'class-12'],
          });
        }
      }

      // Check migration flag for clearing mock notes
      if (!safeStorageGet('akash_v2_empty_notes_applied')) {
        const db = await this.getDB();
        const tx = db.transaction(['chapters', 'offline_downloads', 'progress'], 'readwrite');
        tx.objectStore('chapters').clear();
        tx.objectStore('offline_downloads').clear();
        tx.objectStore('progress').clear();
        safeStorageRemove('akash_chapters');
        safeStorageRemove('akash_progress');
        safeStorageRemove('akash_offline_downloads');
        safeStorageSet('akash_v2_empty_notes_applied', 'true');
      }
    } catch (err) {
      console.warn('Storage initialization fallback to localStorage:', err);
      this.initLocalStorageFallback();
    }
  }

  private initLocalStorageFallback() {
    if (!safeStorageGet('akash_subjects')) {
      safeStorageSet('akash_subjects', JSON.stringify(DEFAULT_SUBJECTS));
    }
    if (!safeStorageGet('akash_v2_empty_notes_applied')) {
      safeStorageSet('akash_chapters', JSON.stringify([]));
      safeStorageSet('akash_v2_empty_notes_applied', 'true');
    }
  }

  // SUBJECTS
  public async getAllSubjects(): Promise<SubjectItem[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('subjects', 'readonly');
        const store = tx.objectStore('subjects');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        const local = safeStorageGet('akash_subjects');
        return local ? JSON.parse(local) : DEFAULT_SUBJECTS;
      } catch {
        return DEFAULT_SUBJECTS;
      }
    }
  }

  public async saveSubject(subject: SubjectItem): Promise<void> {
    try {
      await this.withTransaction('subjects', 'readwrite', (store) => store.put(subject));
    } catch {
      const subjects = await this.getAllSubjects();
      const existingIdx = subjects.findIndex((s) => s.id === subject.id);
      if (existingIdx >= 0) {
        subjects[existingIdx] = subject;
      } else {
        subjects.push(subject);
      }
      safeStorageSet('akash_subjects', JSON.stringify(subjects));
    }
  }

  public async deleteSubject(subjectId: string): Promise<void> {
    try {
      await this.withTransaction('subjects', 'readwrite', (store) => store.delete(subjectId));
      // Also delete all chapters under this subject
      const chapters = await this.getChaptersBySubject(subjectId);
      for (const ch of chapters) {
        await this.deleteChapter(ch.id);
      }
    } catch {
      const subjects = (await this.getAllSubjects()).filter((s) => s.id !== subjectId);
      safeStorageSet('akash_subjects', JSON.stringify(subjects));
    }
  }

  // CHAPTERS
  public async getAllChapters(): Promise<ChapterNote[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('chapters', 'readonly');
        const store = tx.objectStore('chapters');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        const local = safeStorageGet('akash_chapters');
        return local ? JSON.parse(local) : DEFAULT_CHAPTERS;
      } catch {
        return DEFAULT_CHAPTERS;
      }
    }
  }

  public async getChaptersBySubject(subjectId: string): Promise<ChapterNote[]> {
    const all = await this.getAllChapters();
    return all.filter((c) => c.subjectId === subjectId);
  }

  public async getChapterById(chapterId: string): Promise<ChapterNote | undefined> {
    const all = await this.getAllChapters();
    return all.find((c) => c.id === chapterId);
  }

  public async saveChapter(chapter: ChapterNote): Promise<void> {
    try {
      await this.withTransaction('chapters', 'readwrite', (store) => store.put(chapter));
    } catch {
      const chapters = await this.getAllChapters();
      const idx = chapters.findIndex((c) => c.id === chapter.id);
      if (idx >= 0) {
        chapters[idx] = chapter;
      } else {
        chapters.push(chapter);
      }
      safeStorageSet('akash_chapters', JSON.stringify(chapters));
    }
  }

  public async deleteChapter(chapterId: string): Promise<void> {
    try {
      await this.withTransaction('chapters', 'readwrite', (store) => store.delete(chapterId));
      await this.removeOfflineChapter(chapterId);
    } catch {
      const chapters = (await this.getAllChapters()).filter((c) => c.id !== chapterId);
      safeStorageSet('akash_chapters', JSON.stringify(chapters));
    }
  }

  public async replaceAllSubjects(subjects: SubjectItem[]): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('subjects', 'readwrite');
        const store = tx.objectStore('subjects');
        store.clear();
        for (const sub of subjects) {
          store.put(sub);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      safeStorageSet('akash_subjects', JSON.stringify(subjects));
    }
  }

  public async replaceAllChapters(chapters: ChapterNote[]): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chapters', 'readwrite');
        const store = tx.objectStore('chapters');
        store.clear();
        for (const ch of chapters) {
          store.put(ch);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      safeStorageSet('akash_chapters', JSON.stringify(chapters));
    }
  }

  // STUDENT PROGRESS
  public async getAllProgress(): Promise<Record<string, StudentProgress>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('progress', 'readonly');
        const store = tx.objectStore('progress');
        const req = store.getAll();
        req.onsuccess = () => {
          const list: StudentProgress[] = req.result || [];
          const map: Record<string, StudentProgress> = {};
          list.forEach((p) => {
            map[p.chapterId] = p;
          });
          resolve(map);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        const local = safeStorageGet('akash_progress');
        return local ? JSON.parse(local) : {};
      } catch {
        return {};
      }
    }
  }

  public async updateProgress(
    chapterId: string,
    status: ProgressStatus,
    personalNotes?: string
  ): Promise<StudentProgress> {
    const progressItem: StudentProgress = {
      chapterId,
      status,
      updatedAt: new Date().toISOString(),
      personalNotes,
    };

    try {
      await this.withTransaction('progress', 'readwrite', (store) => store.put(progressItem));
    } catch {
      const local = (await this.getAllProgress()) || {};
      local[chapterId] = progressItem;
      safeStorageSet('akash_progress', JSON.stringify(local));
    }
    return progressItem;
  }

  // OFFLINE DOWNLOADS / CACHING
  public async saveOfflineChapter(
    chapter: ChapterNote,
    subjectNameBn: string,
    pdfData?: string,
    sizeKb: number = 450
  ): Promise<void> {
    const offlineItem: OfflineSavedItem = {
      chapterId: chapter.id,
      subjectId: chapter.subjectId,
      titleBn: chapter.titleBn,
      subjectNameBn,
      pdfFileName: chapter.pdfFileName,
      savedAt: new Date().toISOString(),
      sizeKb,
      pdfData: pdfData || chapter.pdfData,
    };

    try {
      await this.withTransaction('offline_downloads', 'readwrite', (store) => store.put(offlineItem));
    } catch {
      const list = await this.getAllOfflineDownloads();
      const filtered = list.filter((item) => item.chapterId !== chapter.id);
      filtered.push(offlineItem);
      safeStorageSet('akash_offline_downloads', JSON.stringify(filtered));
    }
  }

  public async removeOfflineChapter(chapterId: string): Promise<void> {
    try {
      await this.withTransaction('offline_downloads', 'readwrite', (store) => store.delete(chapterId));
    } catch {
      const list = (await this.getAllOfflineDownloads()).filter((item) => item.chapterId !== chapterId);
      safeStorageSet('akash_offline_downloads', JSON.stringify(list));
    }
  }

  public async getAllOfflineDownloads(): Promise<OfflineSavedItem[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('offline_downloads', 'readonly');
        const store = tx.objectStore('offline_downloads');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        const local = safeStorageGet('akash_offline_downloads');
        return local ? JSON.parse(local) : [];
      } catch {
        return [];
      }
    }
  }

  public async getOfflineChapterData(chapterId: string): Promise<OfflineSavedItem | undefined> {
    const list = await this.getAllOfflineDownloads();
    return list.find((item) => item.chapterId === chapterId);
  }

  // LOCAL BINARY PDF CACHE (resilient across ephemeral server restarts)
  public async saveCachedPdf(pdfId: string, bytes: Uint8Array): Promise<void> {
    if (!pdfId || bytes.byteLength === 0 || bytes.byteLength > 100 * 1024 * 1024) return;
    try {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      await this.withTransaction('pdf_cache', 'readwrite', (store) =>
        store.put({
          pdfId,
          buffer: copy.buffer,
          cachedAt: Date.now(),
        })
      );
    } catch {
      // Best-effort IndexedDB cache (ignore quota errors)
    }
  }

  public async getCachedPdf(pdfId: string): Promise<Uint8Array | null> {
    if (!pdfId) return null;
    try {
      const record = await this.withTransaction<{ pdfId: string; buffer?: ArrayBuffer } | undefined>(
        'pdf_cache',
        'readonly',
        (store) => store.get(pdfId)
      );
      if (!record || !(record.buffer instanceof ArrayBuffer)) return null;
      return new Uint8Array(record.buffer.slice(0));
    } catch {
      return null;
    }
  }

  public async deleteCachedPdf(pdfId: string): Promise<void> {
    if (!pdfId) return;
    try {
      await this.withTransaction('pdf_cache', 'readwrite', (store) => store.delete(pdfId));
    } catch {
      // Ignore cleanup failure
    }
  }

  // SETTINGS
  public getSettings(): StorageSettings {
    try {
      const saved = localStorage.getItem('akash_settings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      return DEFAULT_SETTINGS;
    }
    return DEFAULT_SETTINGS;
  }

  public saveSettings(settings: Partial<StorageSettings>): StorageSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    try {
      localStorage.setItem('akash_settings', JSON.stringify(updated));
    } catch {
      // Ignore storage write errors on restricted WebViews
    }
    return updated;
  }

  // EXPORT / IMPORT ALL DATA (Ideal for offline sharing between students & teacher)
  public async exportFullDatabase(): Promise<string> {
    const subjects = await this.getAllSubjects();
    const chapters = await this.getAllChapters();
    const progress = await this.getAllProgress();
    const offlineDownloads = await this.getAllOfflineDownloads();
    const settings = this.getSettings();

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      appName: 'Akash Sirer Notes',
      data: {
        subjects,
        chapters,
        progress,
        offlineDownloads,
        settings: {
          lowDataMode: settings.lowDataMode,
          fontSize: settings.fontSize,
        },
      },
    };

    return JSON.stringify(backup, null, 2);
  }

  public async importFullDatabase(jsonString: string): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.data || !Array.isArray(parsed.data.subjects) || !Array.isArray(parsed.data.chapters)) {
        return { success: false, message: 'ফাইলটির গঠন সঠিক নয় (Invalid backup file structure).' };
      }

      for (const sub of parsed.data.subjects) {
        await this.saveSubject(sub);
      }
      for (const ch of parsed.data.chapters) {
        await this.saveChapter(ch);
      }
      return { success: true, message: 'সমস্ত নোটস ও বিষয়বস্তু সফলভাবে আপলোড হয়েছে।' };
    } catch (err: unknown) {
      const error = err as Error;
      return { success: false, message: `ভুল হয়েছে: ${error.message}` };
    }
  }

  public async resetToDefaults(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['subjects', 'chapters'], 'readwrite');
      tx.objectStore('subjects').clear();
      tx.objectStore('chapters').clear();
      await this.initialize();
    } catch {
      localStorage.removeItem('akash_subjects');
      localStorage.removeItem('akash_chapters');
      this.initLocalStorageFallback();
    }
  }
}

export const storageService = new StorageService();
