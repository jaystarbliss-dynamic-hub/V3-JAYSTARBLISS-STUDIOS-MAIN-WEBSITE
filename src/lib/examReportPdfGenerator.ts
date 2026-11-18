import { jsPDF } from 'jspdf';
import {
  computeExamMaxScore,
  formatScoreSummary,
  resolveAttemptQuestions,
  formatNormalizedClassDisplay,
  canViewOrPrintAttemptResult,
  getWorkTypeLabels,
} from './classes';
import { getCurrentAcademicSessionLabel } from './tutorRemarks';
import {
  JDI_COLORS,
  PDF_LAYOUT,
  formatDocumentRefNo,
  formatShortDateDDMMYY,
  formatDisplayDateTime,
  sanitizePdfText,
  resolveDocumentIdentity,
  loadOfficialWatermarkAsset,
  drawInstitutionalDocumentHeader,
  preparePageBackgroundAndWatermark,
  ensurePdfSpace,
  applyFooterAcrossAllPages,
  drawTranslucentRect,
  coerceValidDate,
} from './pdf';

export interface ExamReportQuestionItem {
  id: string;
  prompt: string;
  type: string;
  points: number;
  options?: Array<{ id: string; text: string }>;
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  explanation?: string;
}

export interface ExamReportQuestionResult {
  questionId: string;
  correct?: boolean;
  manualReview?: boolean;
  pointsAwarded: number;
  maxPoints: number;
}

export interface ExamReportData {
  attemptId?: string;
  examId?: string;
  examTitle: string;
  subject: string;
  workType?: string;
  schoolId?: string;
  schoolName?: string;
  schoolDirectory?: Record<string, string> | Map<string, string>;
  enrolmentType?: string;
  parentId?: string;
  parentName?: string;
  parentEmail?: string;
  className?: string;
  programName?: string;
  studentName: string;
  studentEmail?: string;
  studentCode?: string;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  grade?: string;
  status?: string;
  startedAt?: string | null;
  submittedAt?: string | null;
  releasedAt?: string | null;
  resultReleased?: boolean;
  callerRole?: string;
  tutorFeedback?: string;
  academicSession?: string;
  questions?: ExamReportQuestionItem[];
  answers?: Record<string, any>;
  questionResults?: ExamReportQuestionResult[];
  includeAnswerKey?: boolean;
}

function formatAnswerText(question: ExamReportQuestionItem, rawAnswer: any): string {
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') {
    return 'No response recorded';
  }
  const options = Array.isArray(question.options) ? question.options : [];
  if (Array.isArray(rawAnswer)) {
    if (rawAnswer.length === 0) return 'No response recorded';
    return rawAnswer
      .map((val) => {
        const match = options.find((o) => o.id === val);
        return match ? match.text : String(val);
      })
      .join(', ');
  }
  const match = options.find((o) => o.id === String(rawAnswer));
  return match ? match.text : String(rawAnswer);
}

function formatCorrectAnswerText(question: ExamReportQuestionItem): string {
  const options = Array.isArray(question.options) ? question.options : [];
  if (Array.isArray(question.correctOptionIds) && question.correctOptionIds.length > 0) {
    return question.correctOptionIds
      .map((id) => {
        const match = options.find((o) => o.id === id);
        return match ? match.text : id;
      })
      .join(', ');
  }
  if (Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length > 0) {
    return question.acceptedAnswers.join(' / ');
  }
  return 'Manual / Tutor Rubric Evaluation';
}

export async function createExamReportPdfDocument(data: ExamReportData): Promise<jsPDF> {
  // Enforce tutor release check for student, parent, and school-admin callers
  if (
    data.callerRole &&
    !canViewOrPrintAttemptResult(
      {
        status: data.status || 'submitted',
        releasedAt: data.releasedAt,
        resultReleased: data.resultReleased,
      },
      data.callerRole
    )
  ) {
    throw new Error('This result has not yet been released by the tutor.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  // Resolve authoritative document identity: Official School Report vs Private Learner Report
  const identity = resolveDocumentIdentity({
    schoolId: data.schoolId,
    schoolName: data.schoolName,
    schoolDirectory: data.schoolDirectory,
    enrolmentType: data.enrolmentType,
    parentId: data.parentId,
    parentName: data.parentName,
    parentEmail: data.parentEmail,
  });

  const resolvedClass = formatNormalizedClassDisplay(data.className, 'General');
  const maxScore = computeExamMaxScore(
    { maxScore: data.maxScore, questions: data.questions },
    { maxScore: data.maxScore }
  );
  const summary = formatScoreSummary(data.score, maxScore);
  const typeLabels = getWorkTypeLabels(data.workType, data);

  const reportDateObj =
    coerceValidDate(data.submittedAt) ||
    coerceValidDate(data.releasedAt) ||
    coerceValidDate(data.startedAt) ||
    new Date();
  const sessionLabel = sanitizePdfText(
    data.academicSession || getCurrentAcademicSessionLabel(reportDateObj)
  ).toUpperCase();
  const shortDate = formatShortDateDDMMYY(reportDateObj);
  const refNo = formatDocumentRefNo(
    'JDI',
    data.attemptId || `${data.examId || ''}:${data.studentName}:${data.submittedAt || ''}`
  );

  // Page 1 paper surface + centered institutional watermark strictly behind foreground elements
  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  const subtitleLine = `${identity.subtitleClassification} ${sessionLabel} | DATE: ${shortDate}`;
  let cursorY = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: identity.headerTitle,
    subtitleLine,
    refNo,
  });

  // =========================================================================
  // 1. LEARNER & ASSESSMENT DETAILS (Left) + FINAL SCORE CARD (Right)
  // =========================================================================
  const detailsTopY = cursorY;
  const scoreCardW = 58;
  const scoreCardX = pageWidth - marginX - scoreCardW;
  const leftMaxWidth = scoreCardX - marginX - 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text('LEARNER & ASSESSMENT DETAILS', marginX, detailsTopY);

  let leftY = detailsTopY + 7;
  const drawDetailLine = (label: string, value: string) => {
    const cleanText = sanitizePdfText(`${label}: ${value}`);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...JDI_COLORS.INK_BODY);
    const wrapped = doc.splitTextToSize(cleanText, leftMaxWidth) as string[];
    wrapped.forEach((line) => {
      doc.text(line, marginX, leftY);
      leftY += 5.4;
    });
    leftY += 0.6;
  };

  drawDetailLine('Student Name', data.studentName || 'Student');
  drawDetailLine('Class / Level', resolvedClass);

  if (identity.isSchoolDocument) {
    drawDetailLine('SCHOOL', identity.schoolName.toUpperCase());
    drawDetailLine(
      typeLabels.singular,
      `${data.examTitle || typeLabels.singular}${data.subject ? ` (${data.subject})` : ''}`
    );
  } else {
    const programLabel =
      data.programName ||
      data.subject ||
      (data.examTitle ? `${data.examTitle}` : 'Mentorship Track');
    drawDetailLine('Program', programLabel);
    if (data.examTitle && data.examTitle !== programLabel) {
      drawDetailLine(typeLabels.singular, data.examTitle);
    }
    drawDetailLine('Enrolment', identity.enrolmentLabel);
  }

  // Right-side Final Score Card (soft ice blue translucent panel)
  const scoreCardH = 31;
  drawTranslucentRect(
    doc,
    scoreCardX,
    detailsTopY - 2,
    scoreCardW,
    scoreCardH,
    JDI_COLORS.ICE_BG,
    0.88,
    JDI_COLORS.ICE_BORDER,
    2.5
  );

  const scoreCenterX = scoreCardX + scoreCardW / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text('FINAL SCORE', scoreCenterX, detailsTopY + 5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  const scoreMainLabel =
    summary.score !== null
      ? `${summary.fractionLabel} (${summary.percentageLabel})`
      : 'Pending Review';
  doc.text(sanitizePdfText(scoreMainLabel), scoreCenterX, detailsTopY + 13.5, {
    align: 'center',
    maxWidth: scoreCardW - 6,
  });

  const statusText = (data.status || 'SUBMITTED').toUpperCase();
  const gradeLabel = sanitizePdfText(
    `Grade: ${data.grade || summary.grade}  •  ${statusText.charAt(0) + statusText.slice(1).toLowerCase()}`
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...JDI_COLORS.NAVY_ROYAL);
  doc.text(gradeLabel, scoreCenterX, detailsTopY + 20.2, {
    align: 'center',
    maxWidth: scoreCardW - 6,
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(
    sanitizePdfText(`Submitted: ${formatDisplayDateTime(data.submittedAt)}`),
    scoreCenterX,
    detailsTopY + 25.8,
    { align: 'center', maxWidth: scoreCardW - 6 }
  );

  cursorY = Math.max(leftY + 2, detailsTopY - 2 + scoreCardH + 7);

  // =========================================================================
  // 2. TUTOR REMARK & FEEDBACK PANEL
  // =========================================================================
  if (data.tutorFeedback && data.tutorFeedback.trim()) {
    const feedbackClean = sanitizePdfText(data.tutorFeedback.trim());
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const feedbackLines = doc.splitTextToSize(feedbackClean, contentWidth - 10) as string[];
    const boxHeight = Math.max(17, feedbackLines.length * 4.5 + 11);

    cursorY = ensurePdfSpace(doc, cursorY, boxHeight + 4, refNo, watermarkAsset);

    drawTranslucentRect(
      doc,
      marginX,
      cursorY,
      contentWidth,
      boxHeight,
      JDI_COLORS.CREAM_BG,
      0.86,
      JDI_COLORS.CREAM_BORDER,
      2.2
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...JDI_COLORS.AMBER_TITLE);
    doc.text('TUTOR REMARK & FEEDBACK:', marginX + 5, cursorY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...JDI_COLORS.AMBER_BODY);
    doc.text(feedbackLines, marginX + 5, cursorY + 11.5);

    cursorY += boxHeight + 7;
  }

  // =========================================================================
  // 3. QUESTION BREAKDOWN TABLE
  // =========================================================================
  const questions = resolveAttemptQuestions({ questions: data.questions }, data);
  const resultsMap = new Map<string, ExamReportQuestionResult>();
  (data.questionResults || []).forEach((r) => {
    if (r && r.questionId) resultsMap.set(r.questionId, r);
  });

  if (questions.length > 0) {
    const includeKey = data.includeAnswerKey !== false;
    const colWidths = includeKey
      ? [9, 52, 40, 40, 19, 20]
      : [10, 70, 56, 22, 22];
    const headers = includeKey
      ? ['#', 'Question Prompt', 'Learner Response', 'Expected Answer', 'Marks', 'Status']
      : ['#', 'Question Prompt', 'Learner Response', 'Marks', 'Status'];

    const drawTableHeader = (y: number): number => {
      doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
      doc.rect(marginX, y, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(...JDI_COLORS.WHITE);
      let x = marginX;
      headers.forEach((h, i) => {
        doc.text(h, x + 2.2, y + 5.3);
        x += colWidths[i];
      });
      return y + 8;
    };

    cursorY = ensurePdfSpace(doc, cursorY, 20, refNo, watermarkAsset);
    cursorY = drawTableHeader(cursorY);

    questions.forEach((q: ExamReportQuestionItem, idx: number) => {
      const res = resultsMap.get(q.id);
      const rawAns = data.answers ? data.answers[q.id] : undefined;
      const ansText = sanitizePdfText(formatAnswerText(q, rawAns));
      const expectedText = sanitizePdfText(formatCorrectAnswerText(q));
      const promptText = sanitizePdfText(String(q.prompt || `Question ${idx + 1}`));
      const maxPts = Number(res?.maxPoints ?? q.points ?? 1);
      const awardedPts = res?.pointsAwarded !== undefined ? Number(res.pointsAwarded) : 0;
      const statusLabel = res?.manualReview
        ? 'Review'
        : res?.correct
        ? 'Correct'
        : 'Incorrect';

      const cells = includeKey
        ? [
            String(idx + 1),
            promptText,
            ansText,
            expectedText,
            `${awardedPts} / ${maxPts}`,
            statusLabel,
          ]
        : [
            String(idx + 1),
            promptText,
            ansText,
            `${awardedPts} / ${maxPts}`,
            statusLabel,
          ];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const wrappedCells = cells.map((cellText, colIdx) =>
        doc.splitTextToSize(String(cellText || '—'), Math.max(6, colWidths[colIdx] - 4.4))
      );
      const maxLines = Math.max(1, ...wrappedCells.map((lines: string[]) => lines.length));
      const rowHeight = Math.max(7.2, maxLines * 3.8 + 3.4);

      cursorY = ensurePdfSpace(doc, cursorY, rowHeight, refNo, watermarkAsset, (freshY) =>
        drawTableHeader(freshY)
      );

      // Keep rows translucent so centered institutional watermark remains visible cleanly behind text
      if (idx % 2 === 1) {
        drawTranslucentRect(
          doc,
          marginX,
          cursorY,
          contentWidth,
          rowHeight,
          JDI_COLORS.SOFT_TINT,
          0.52
        );
      }
      // Subtle translucent highlight in column 1 matching institutional table style
      drawTranslucentRect(
        doc,
        marginX,
        cursorY,
        colWidths[0],
        rowHeight,
        JDI_COLORS.ICE_BG,
        0.48
      );

      // Subtle vertical & bottom borders
      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(marginX, cursorY + rowHeight, marginX + contentWidth, cursorY + rowHeight);

      let colX = marginX;
      wrappedCells.forEach((lines: string[], colIdx: number) => {
        if (colIdx > 0) {
          doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
          doc.line(colX, cursorY, colX, cursorY + rowHeight);
        }
        const isFirstOrLast = colIdx === 0 || colIdx === cells.length - 1;
        doc.setFont('helvetica', isFirstOrLast ? 'bold' : 'normal');
        doc.setFontSize(7.5);

        if (colIdx === cells.length - 1) {
          if (statusLabel === 'Correct') doc.setTextColor(...JDI_COLORS.EMERALD_TEXT);
          else if (statusLabel === 'Review') doc.setTextColor(...JDI_COLORS.AMBER_BADGE);
          else doc.setTextColor(...JDI_COLORS.CRIMSON);
        } else {
          doc.setTextColor(...JDI_COLORS.INK_BODY);
        }

        doc.text(lines, colX + 2.2, cursorY + 4.4);
        colX += colWidths[colIdx];
      });

      cursorY += rowHeight;
    });
  } else {
    cursorY = ensurePdfSpace(doc, cursorY, 14, refNo, watermarkAsset);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    doc.text(
      `Summary score report (${typeLabels.lowerSingular} question breakdown not attached to this record).`,
      marginX,
      cursorY + 6
    );
  }

  applyFooterAcrossAllPages(doc);
  return doc;
}

export async function downloadSingleExamReportPdf(
  data: ExamReportData,
  filename?: string
): Promise<void> {
  const doc = await createExamReportPdfDocument(data);
  const safeStudent = (data.studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeExam = (data.examTitle || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(filename || `${safeStudent}_${safeExam}_Report.pdf`);
}

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipArchiveBlob(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = computeCrc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord] as BlobPart[], {
    type: 'application/zip',
  });
}

export async function downloadBulkExamReportsZip(
  reports: ExamReportData[],
  zipFilename = 'JDI_Assessment_Reports.zip'
): Promise<void> {
  const zipEntries: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < reports.length; i += 1) {
    const item = reports[i];
    const doc = await createExamReportPdfDocument(item);
    const pdfArrayBuffer = doc.output('arraybuffer');
    const safeStudent = (item.studentName || `Student_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeClass = (item.className || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeExam = (item.examTitle || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
    zipEntries.push({
      name: `${safeClass}/${safeStudent}_${safeExam}_${i + 1}.pdf`,
      data: new Uint8Array(pdfArrayBuffer),
    });
  }

  const content = buildZipArchiveBlob(zipEntries);
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ExamReportQuestionRow {
  index: number;
  questionId: string;
  prompt: string;
  studentAnswerText: string;
  officialAnswerText: string;
  pointsAwarded: number;
  maxPoints: number;
  isCorrect: boolean;
  status: 'PASS' | 'PART' | 'FAIL';
}

export interface ExamReportViewModel {
  attemptId: string;
  examTitle: string;
  examSubject: string;
  workType: string;
  workTypeLabel: string;
  studentName: string;
  studentClass: string;
  schoolName: string;
  submittedAtText: string;
  releasedAtText: string;
  evaluationMode: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  feedbackText: string;
  questionRows: ExamReportQuestionRow[];
}

function normalizeTimestampToIso(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return String(val);
}

export function buildExamReportViewModel(
  attempt: Record<string, any> = {},
  exam: Record<string, any> = {}
): ExamReportViewModel {
  const questions = resolveAttemptQuestions(exam, attempt) as ExamReportQuestionItem[];
  const maxScore = computeExamMaxScore(exam, attempt);
  const rawScore = typeof attempt.score === 'number' ? attempt.score : 0;
  const summary = formatScoreSummary(rawScore, maxScore);
  const labels = getWorkTypeLabels(exam.workType || attempt.workType, exam);
  const answers = attempt.answers || {};
  const resultList: any[] = Array.isArray(attempt.questionResults) ? attempt.questionResults : [];
  const manualList: any[] = Array.isArray(attempt.manualMarks) ? attempt.manualMarks : [];
  const identity = resolveDocumentIdentity({
    schoolId: attempt.schoolId || exam.schoolId,
    schoolName: attempt.schoolName || exam.schoolName,
    enrolmentType: attempt.enrolmentType,
    parentId: attempt.parentId,
    parentName: attempt.parentName,
    parentEmail: attempt.parentEmail,
  });

  const questionRows: ExamReportQuestionRow[] = questions.map((q, idx) => {
    const qr = resultList.find((r) => r?.questionId === q.id);
    const mm = manualList.find((m) => m?.questionId === q.id);
    const qMax = Number(qr?.maxPoints ?? q.points ?? 1);
    const awarded =
      mm && typeof mm.pointsAwarded === 'number'
        ? mm.pointsAwarded
        : typeof qr?.pointsAwarded === 'number'
        ? qr.pointsAwarded
        : 0;
    const isCorrect = qr ? Boolean(qr.correct) : awarded >= qMax && qMax > 0;
    const status: 'PASS' | 'PART' | 'FAIL' =
      awarded >= qMax && qMax > 0 ? 'PASS' : awarded > 0 ? 'PART' : 'FAIL';

    return {
      index: idx + 1,
      questionId: q.id,
      prompt: q.prompt || `Question ${idx + 1}`,
      studentAnswerText: formatAnswerText(q, answers[q.id]),
      officialAnswerText: formatCorrectAnswerText(q),
      pointsAwarded: awarded,
      maxPoints: qMax,
      isCorrect,
      status,
    };
  });

  return {
    attemptId: String(attempt.id || attempt.attemptId || ''),
    examTitle: String(exam.title || attempt.examTitle || labels.singular),
    examSubject: String(exam.subject || attempt.examSubject || 'General'),
    workType: labels.workType,
    workTypeLabel: labels.singular,
    studentName: String(attempt.studentName || 'Student'),
    studentClass: formatNormalizedClassDisplay(attempt.className || attempt.studentClass, 'General'),
    schoolName: identity.isSchoolDocument ? identity.schoolName : identity.enrolmentLabel,
    submittedAtText: formatDisplayDateTime(normalizeTimestampToIso(attempt.submittedAt)),
    releasedAtText: formatDisplayDateTime(normalizeTimestampToIso(attempt.releasedAt)),
    evaluationMode: String(attempt.evaluationMode || exam.gradingMode || 'Automatic'),
    rawScore,
    maxScore,
    percentage: summary.percentage ?? 0,
    grade: String(attempt.grade || summary.grade),
    feedbackText: String(attempt.feedback || attempt.tutorFeedback || attempt.tutorRemark || ''),
    questionRows,
  };
}

export async function generateExamReportPdf(
  attempt: Record<string, any>,
  exam: Record<string, any> = {},
  options: {
    callerRole?: string;
    includeAnswerKey?: boolean;
    schoolDirectory?: Record<string, string> | Map<string, string>;
  } = {}
): Promise<Uint8Array> {
  const vm = buildExamReportViewModel(attempt, exam);
  const questions = resolveAttemptQuestions(exam, attempt) as ExamReportQuestionItem[];
  const submittedIso = normalizeTimestampToIso(attempt.submittedAt);
  const releasedIso = normalizeTimestampToIso(attempt.releasedAt);

  const doc = await createExamReportPdfDocument({
    attemptId: vm.attemptId,
    examId: String(exam.id || attempt.examId || ''),
    examTitle: vm.examTitle,
    subject: vm.examSubject,
    workType: exam.workType || attempt.workType || vm.workType,
    schoolId: String(exam.schoolId || attempt.schoolId || ''),
    schoolName: String(attempt.schoolName || exam.schoolName || ''),
    schoolDirectory: options.schoolDirectory,
    enrolmentType: String(attempt.enrolmentType || ''),
    parentId: String(attempt.parentId || ''),
    parentName: String(attempt.parentName || ''),
    parentEmail: String(attempt.parentEmail || ''),
    className: vm.studentClass,
    programName: String(
      attempt.programName || attempt.programmeName || exam.programName || vm.examSubject || ''
    ),
    studentName: vm.studentName,
    score: vm.rawScore,
    maxScore: vm.maxScore,
    percentage: vm.percentage,
    grade: vm.grade,
    status: String(attempt.status || 'submitted'),
    submittedAt: submittedIso,
    releasedAt: releasedIso,
    resultReleased: Boolean(attempt.resultReleased || attempt.releasedAt),
    callerRole: options.callerRole,
    tutorFeedback: String(attempt.feedback || attempt.tutorFeedback || attempt.tutorRemark || ''),
    questions,
    answers: attempt.answers || {},
    questionResults: vm.questionRows.map((r) => ({
      questionId: r.questionId,
      correct: r.isCorrect,
      pointsAwarded: r.pointsAwarded,
      maxPoints: r.maxPoints,
    })),
    includeAnswerKey: options.includeAnswerKey ?? true,
  });

  const arrayBuf = doc.output('arraybuffer');
  return new Uint8Array(arrayBuf);
}
