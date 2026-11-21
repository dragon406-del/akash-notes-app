export type ProgressStatus = 'not_started' | 'in_progress' | 'completed' | 'revision';

export interface QuestionItem {
  id: string;
  question: string;
  marks: number;
  answer?: string;
}

export interface ClassLevel {
  id: string;
  nameBn: string;
  shortBn: string;
}

export interface ChapterNote {
  id: string;
  subjectId: string;
  classLevel?: string; // e.g. 'class-10', 'class-12', 'all'
  chapterNumber: number;
  titleBn: string;
  titleEn: string;
  summaryBn: string;
  keyPoints: string[];
  questions: QuestionItem[];
  pdfFileName: string;
  pdfFileSize?: string;
  pdfData?: string; // base64 representation for small inline PDFs
  pdfUrl?: string; // streaming endpoint URL for large PDFs up to 10 GB
  isCustomUploaded?: boolean;
  uploadedAt: string;
}

export interface SubjectItem {
  id: string;
  nameBn: string;
  nameEn: string;
  code: string;
  icon: string; // Lucide icon name
  color: string; // Tailwind color token
  descriptionBn: string;
  isCustom?: boolean;
  allowedClasses?: string[]; // Restrict subject to specific class IDs if defined
}

export interface StudentProgress {
  chapterId: string;
  status: ProgressStatus;
  updatedAt: string;
  personalNotes?: string;
}

export interface OfflineSavedItem {
  chapterId: string;
  subjectId: string;
  titleBn: string;
  subjectNameBn: string;
  pdfFileName: string;
  savedAt: string;
  sizeKb: number;
  pdfData?: string;
}

export interface AppSettings {
  teacherPin: string;
  lowDataMode: boolean;
  fontSize: 'normal' | 'large' | 'extra-large';
  language: 'bn' | 'en';
}
