import { jsPDF } from 'jspdf';
import { ChapterNote } from '../types';
import { firestoreService } from './firestoreService';
import { storageService } from './storage';

/**
 * Downloads a chapter note as a real PDF document.
 * If a custom uploaded PDF exists, it downloads the actual PDF file.
 * Otherwise, it generates a clean formatted study guide PDF using jsPDF.
 */
export async function downloadChapterPDF(chapter: ChapterNote, subjectNameBn: string, subjectNameEn: string): Promise<void> {
  const triggerBlobDownload = (bytes: Uint8Array, name: string) => {
    const safeBytes = new Uint8Array(bytes.byteLength);
    safeBytes.set(bytes);
    const blob = new Blob([safeBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // Case 1a: Custom uploaded small inline PDF file exists (base64 data)
  if (chapter.pdfData && chapter.pdfData.trim().length > 0) {
    try {
      const trimmed = chapter.pdfData.trim();
      const rawPart = trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
      const cleaned = rawPart.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const padded =
        cleaned.length % 4 === 0
          ? cleaned
          : cleaned.padEnd(cleaned.length + (4 - (cleaned.length % 4)), '=');
      const byteCharacters = atob(padded);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      triggerBlobDownload(
        byteArray,
        chapter.pdfFileName || `${chapter.titleEn.replace(/\s+/g, '_')}_Notes.pdf`
      );
      return;
    } catch {
      if (!chapter.pdfUrl) {
        throw new Error('PDF ডেটা পড়তে সমস্যা হয়েছে।');
      }
    }
  }

  // Case 1b: Custom uploaded large PDF file exists via IndexedDB cache, server endpoint, or Firestore chunks (teacher only)
  if (chapter.pdfUrl) {
    const downloadName = chapter.pdfFileName || `${chapter.titleEn.replace(/\s+/g, '_')}_Notes.pdf`;
    const apiMatch = chapter.pdfUrl.match(/\/api\/pdfs\/([a-zA-Z0-9_-]+)/);
    const pdfId = apiMatch ? apiMatch[1] : '';
    const fetchUrl = pdfId ? `/api/pdfs/${pdfId}` : chapter.pdfUrl;

    if (pdfId) {
      const cached = await storageService.getCachedPdf(pdfId);
      if (cached && cached.byteLength > 0) {
        triggerBlobDownload(cached, downloadName);
        return;
      }
    }

    try {
      const res = await fetch(fetchUrl, { cache: 'no-store' });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && !ct.includes('text/html') && !ct.includes('application/json')) {
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        if (pdfId && bytes.byteLength > 0) {
          storageService.saveCachedPdf(pdfId, bytes).catch(() => {});
        }
        triggerBlobDownload(bytes, downloadName);
        return;
      }
    } catch {
      // Fall through to Firestore backup
    }

    if (pdfId) {
      const cloudBytes = await firestoreService.loadPdfBytes(pdfId);
      if (cloudBytes && cloudBytes.byteLength > 0) {
        storageService.saveCachedPdf(pdfId, cloudBytes).catch(() => {});
        triggerBlobDownload(cloudBytes, downloadName);
        return;
      }
    }

    throw new Error('PDF ফাইলটি বর্তমানে পাওয়া যাচ্ছে না। অনুগ্রহ করে পুনরায় আপলোড করো।');
  }

  // Case 2: Generate crisp, styled PDF study sheet
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // Header Banner
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 28, 'F');

  // App Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text("AKASH SIR'S STUDY NOTES", margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Offline Educational Resource & Study Portal | West Bengal Board', margin, 18);

  // Subject Pill & Date
  doc.setFillColor(245, 158, 11); // amber-500
  doc.roundedRect(pageWidth - margin - 52, 6, 52, 16, 2, 2, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`SUBJECT: ${subjectNameEn.toUpperCase()}`, pageWidth - margin - 50, 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`CH #${chapter.chapterNumber} | ${chapter.uploadedAt}`, pageWidth - margin - 50, 18);

  let currentY = 38;

  // Chapter Title Bar
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, currentY, contentWidth, 18, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, contentWidth, 18, 2, 2, 'S');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Chapter ${chapter.chapterNumber}: ${chapter.titleEn}`, margin + 5, currentY + 7);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Bengali Title: ${chapter.titleBn} (${subjectNameBn})`, margin + 5, currentY + 13);

  currentY += 26;

  // Overview / Summary Section
  doc.setFillColor(239, 246, 255); // blue-50
  doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
  doc.setTextColor(30, 64, 175);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('1. CHAPTER SUMMARY & CORE CONCEPTS', margin + 3, currentY + 5.5);
  currentY += 12;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // Split summary lines cleanly
  const summaryLines = doc.splitTextToSize(chapter.summaryBn, contentWidth - 4);
  doc.text(summaryLines, margin + 2, currentY);
  currentY += summaryLines.length * 4.8 + 8;

  // Key Revision Points
  if (chapter.keyPoints && chapter.keyPoints.length > 0) {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(240, 253, 244); // green-50
    doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
    doc.setTextColor(22, 101, 52);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('2. KEY HIGH-YIELD POINTS FOR REVISION', margin + 3, currentY + 5.5);
    currentY += 12;

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    chapter.keyPoints.forEach((point, idx) => {
      if (currentY > pageHeight - 25) {
        doc.addPage();
        currentY = 20;
      }
      const bulletText = `[${idx + 1}] ${point}`;
      const pointLines = doc.splitTextToSize(bulletText, contentWidth - 6);
      doc.text(pointLines, margin + 3, currentY);
      currentY += pointLines.length * 4.5 + 2.5;
    });

    currentY += 6;
  }

  // Model Examination Questions
  if (chapter.questions && chapter.questions.length > 0) {
    if (currentY > pageHeight - 45) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(254, 242, 242); // red-50
    doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
    doc.setTextColor(153, 27, 27);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('3. IMPORTANT EXAM QUESTIONS & SUGGESTIVE ANSWERS', margin + 3, currentY + 5.5);
    currentY += 12;

    chapter.questions.forEach((q, qIndex) => {
      if (currentY > pageHeight - 35) {
        doc.addPage();
        currentY = 20;
      }

      // Question header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const qHeader = `Q${qIndex + 1} (${q.marks} Marks): ${q.question}`;
      const qLines = doc.splitTextToSize(qHeader, contentWidth - 6);
      doc.text(qLines, margin + 3, currentY);
      currentY += qLines.length * 4.5 + 2;

      // Answer
      if (q.answer) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        const ansText = `Answer: ${q.answer}`;
        const ansLines = doc.splitTextToSize(ansText, contentWidth - 10);
        doc.text(ansLines, margin + 6, currentY);
        currentY += ansLines.length * 4 + 4;
      }
    });
  }

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Akash Sir's Notes (আকাশ স্যারের নোটস) | Offline Study Material | Page ${i} of ${totalPages}`,
      margin,
      pageHeight - 7
    );
    doc.text('Prepared for Students - Free Educational Distribution', pageWidth - margin - 70, pageHeight - 7);
  }

  // Download
  const fileName = chapter.pdfFileName || `${chapter.titleEn.replace(/\s+/g, '_')}_Notes.pdf`;
  doc.save(fileName);
}
