import { ChapterNote, ClassLevel, SubjectItem } from '../types';

export const DEFAULT_SUBJECTS: SubjectItem[] = [
  {
    id: 'bengali',
    nameBn: 'বাংলা',
    nameEn: 'Bengali',
    code: 'BNG',
    icon: 'BookOpen',
    color: 'amber',
    descriptionBn: 'প্রথম ভাষা: গদ্য, পদ্য, ব্যাকরণ ও সাহিত্যের ইতিহাস'
  },
  {
    id: 'geography',
    nameBn: 'ভূগোল',
    nameEn: 'Geography',
    code: 'GEO',
    icon: 'Globe',
    color: 'emerald',
    descriptionBn: 'প্রাকৃতিক ও অর্থনৈতিক ভূগোল, মানচিত্র ও পরিবেশ'
  },
  {
    id: 'history',
    nameBn: 'ইতিহাস',
    nameEn: 'History',
    code: 'HIST',
    icon: 'Landmark',
    color: 'rose',
    descriptionBn: 'আধুনিক ভারত, বাংলার নবজাগরণ ও জাতীয়তাবাদী আন্দোলন'
  },
  {
    id: 'sanskrit',
    nameBn: 'সংস্কৃত',
    nameEn: 'Sanskrit',
    code: 'SNSK',
    icon: 'Scroll',
    color: 'sky',
    descriptionBn: 'গদ্যাংশ, পদ্যাংশ, ব্যাকরণ ও সংস্কৃত সাহিত্যের ইতিহাস'
  },
  {
    id: 'philosophy',
    nameBn: 'দর্শন',
    nameEn: 'Philosophy',
    code: 'PHIL',
    icon: 'Brain',
    color: 'indigo',
    descriptionBn: 'পাশ্চাত্য ও ভারতীয় দর্শন, যুক্তিবিজ্ঞান ও নীতিবিদ্যা (একাদশ ও দ্বাদশ শ্রেণি)',
    allowedClasses: ['class-11', 'class-12']
  }
];

const DEFAULT_SUBJECT_ORDER = ['bengali', 'geography', 'history', 'sanskrit', 'philosophy'];

export function sortSubjects(list: SubjectItem[]): SubjectItem[] {
  return [...list].sort((a, b) => {
    const idxA = DEFAULT_SUBJECT_ORDER.indexOf(a.id);
    const idxB = DEFAULT_SUBJECT_ORDER.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.nameBn.localeCompare(b.nameBn, 'bn');
  });
}

export const DEFAULT_CLASSES: ClassLevel[] = [
  { id: 'all', nameBn: 'সকল শ্রেণি', shortBn: 'সব শ্রেণি' },
  { id: 'class-6', nameBn: 'ষষ্ঠ শ্রেণি (Class 6)', shortBn: '৬ষ্ঠ শ্রেণি' },
  { id: 'class-7', nameBn: 'সপ্তম শ্রেণি (Class 7)', shortBn: '৭ম শ্রেণি' },
  { id: 'class-8', nameBn: 'অষ্টম শ্রেণি (Class 8)', shortBn: '৮ম শ্রেণি' },
  { id: 'class-9', nameBn: 'নবম শ্রেণি (Class 9)', shortBn: '৯ম শ্রেণি' },
  { id: 'class-10', nameBn: 'দশম শ্রেণি / মাধ্যমিক (Class 10)', shortBn: '১০ম (মাধ্যমিক)' },
  { id: 'class-11', nameBn: 'একাদশ শ্রেণি (Class 11)', shortBn: '১১শ শ্রেণি' },
  { id: 'class-12', nameBn: 'দ্বাদশ শ্রেণি / উচ্চমাধ্যমিক (Class 12)', shortBn: '১২শ (উচ্চমাধ্যমিক)' },
];

export const ALL_CLASS_IDS = [
  'class-6',
  'class-7',
  'class-8',
  'class-9',
  'class-10',
  'class-11',
  'class-12',
];

export const PHILOSOPHY_ALLOWED_CLASSES = ['class-11', 'class-12'];
export const SUBJECT_CHOICE_CLASS_IDS = ['class-11', 'class-12'];

export function isSubjectChoiceClass(classId?: string | null): boolean {
  return Boolean(classId && SUBJECT_CHOICE_CLASS_IDS.includes(classId));
}

export function getSubjectAllowedClasses(
  subject?: Pick<SubjectItem, 'id' | 'allowedClasses'>
): string[] | undefined {
  if (!subject) return undefined;
  if (Array.isArray(subject.allowedClasses)) {
    return subject.allowedClasses;
  }
  if (subject.id === 'philosophy') {
    return PHILOSOPHY_ALLOWED_CLASSES;
  }
  return undefined;
}

export function isSubjectAllowedForClass(
  subject: Pick<SubjectItem, 'id' | 'allowedClasses'> | undefined,
  classId: string
): boolean {
  const allowed = getSubjectAllowedClasses(subject);
  if (!classId || classId === 'all') {
    return allowed ? allowed.length > 0 : true;
  }
  if (!allowed) return true;
  return allowed.includes(classId);
}

export const DEFAULT_CHAPTERS: ChapterNote[] = [];

