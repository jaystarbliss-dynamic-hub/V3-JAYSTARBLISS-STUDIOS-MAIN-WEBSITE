import jsPDF from 'jspdf';
import {
  computeExamMaxScore,
  calculateScorePercentage,
  normalizeClassName,
  resolvePartnerSchoolName,
} from './classes';

export interface ExamReportQuestion {
  id: string;
  prompt: string;
  type?: string;
  points: number;
  options?: { id: string; text: string }[];
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  explanation?: string;
}

export interface ExamReportAttempt {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  studentUsername?: string;
  className?: string;
  schoolId?: string;
  schoolName?: string;
  status: string;
  score?: number;
  maxScore?: number;
  percentage?: number;
  submittedAt?: any;
  releasedAt?: any;
  autoGraded?: boolean;
  answers?: Record<string, string | string[]>;
  questions?: ExamReportQuestion[];
  questionsSnapshot?: ExamReportQuestion[];
  questionResults?: {
    questionId: string;
    answer?: string | string[];
    correct?: boolean;
    pointsAwarded?: number;
    maxPoints?: number;
    manualReview?: boolean;
  }[];
  manualMarks?: {
    questionId: string;
    pointsAwarded: number;
    maxPoints: number;
  }[];
  feedback?: string;
}

export interface ExamReportExamMeta {
  id?: string;
  title: string;
  subject: string;
  schoolId?: string;
  schoolName?: string;
  maxScore?: number;
  seriesName?: string;
  courseName?: string;
  durationMinutes?: number;
  instructions?: string;
  questions?: ExamReportQuestion[];
}

export interface ExamReportQuestionRow {
  index: number;
  questionId: string;
  prompt: string;
  studentAnswerText: string;
  officialAnswerText: string;
  pointsAwarded: number;
  maxPoints: number;
  status: 'PASS' | 'PART' | 'FAIL';
  isCorrect: boolean;
  explanation?: string;
}

export interface ExamReportViewModel {
  attemptId: string;
  examId: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  schoolName: string;
  examTitle: string;
  examSubject: string;
  submittedAtText: string;
  releasedAtText: string;
  isReleased: boolean;
  evaluationMode: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  remarks: string;
  feedbackText: string;
  questionRows: ExamReportQuestionRow[];
}

// Convert image url to base64 data url safely in browser
async function fetchImageAsBase64(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

let cachedLogos: { jdiLogo: string; emblemLogo: string } | null = null;
async function getReportLogos() {
  if (cachedLogos) return cachedLogos;
  const [jdiLogo, emblemLogo] = await Promise.all([
    fetchImageAsBase64('/FINAL_LOGO_JDI-removebg-preview.png'),
    fetchImageAsBase64('/Untitled design.png')
  ]);
  cachedLogos = { jdiLogo, emblemLogo };
  return cachedLogos;
}

export function formatReportDateTime(val: any): string {
  if (!val) return '—';
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime())
      ? val
      : d.toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  }
  if (val.toDate && typeof val.toDate === 'function') {
    return val.toDate().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof val === 'object' && typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(val);
}

export function getPerformanceGrade(percentage: number): { grade: string; remarks: string } {
  if (percentage >= 85) return { grade: 'Distinction (A*)', remarks: 'Exceptional mastery and analytical proficiency' };
  if (percentage >= 75) return { grade: 'Excellent (A)', remarks: 'Very strong subject comprehension' };
  if (percentage >= 65) return { grade: 'Very Good (B)', remarks: 'Solid understanding of key curriculum competencies' };
  if (percentage >= 50) return { grade: 'Credit (C)', remarks: 'Satisfactory completion of assessment requirements' };
  if (percentage >= 40) return { grade: 'Pass (D)', remarks: 'Fair performance; revision recommended' };
  return { grade: 'Needs Improvement (F)', remarks: 'Targeted support and structured intervention advised' };
}

function formatAnswerText(q: ExamReportQuestion, val: any): string {
  if (val === undefined || val === null || val === '') return 'No Answer Provided';
  const ids = Array.isArray(val) ? val.map(String) : [String(val)];
  return ids
    .map((id) => {
      const match = q.options?.find((o) => String(o.id).toUpperCase() === id.trim().toUpperCase());
      return match ? `${match.id}. ${match.text}` : id;
    })
    .join('; ');
}

function formatCorrectText(q: ExamReportQuestion): string {
  if (q.correctOptionIds && q.correctOptionIds.length > 0) {
    return q.correctOptionIds
      .map((id) => {
        const match = q.options?.find((o) => String(o.id).toUpperCase() === String(id).trim().toUpperCase());
        return match ? `${match.id}. ${match.text}` : id;
      })
      .join('; ');
  }
  if (q.acceptedAnswers && q.acceptedAnswers.length > 0) {
    return q.acceptedAnswers.join(' / ');
  }
  return 'Subjective / Manual Review';
}

export function buildExamReportViewModel(
  attempt: ExamReportAttempt,
  examMeta?: ExamReportExamMeta
): ExamReportViewModel {
  const examTitle = examMeta?.title || 'Examination Assessment';
  const examSubject = examMeta?.subject || 'Computer & Digital Technology';
  const schoolName = resolvePartnerSchoolName(
    attempt.schoolName,
    examMeta?.schoolName,
    'Assigned Partner School'
  );
  const studentName = (attempt.studentName || 'Student').trim() || 'Student';
  const studentClass =
    normalizeClassName(attempt.className || '') ||
    (attempt.className || '').trim() ||
    'General Class';

  const questions: ExamReportQuestion[] =
    Array.isArray(attempt.questionsSnapshot) && attempt.questionsSnapshot.length > 0
      ? attempt.questionsSnapshot
      : Array.isArray(attempt.questions) && attempt.questions.length > 0
      ? attempt.questions
      : Array.isArray(examMeta?.questions) && examMeta!.questions!.length > 0
      ? examMeta!.questions!
      : [];

  const questionResults = Array.isArray(attempt.questionResults) ? attempt.questionResults : [];
  const manualMarks = Array.isArray(attempt.manualMarks) ? attempt.manualMarks : [];

  const maxScore = computeExamMaxScore(
    { questions, maxScore: examMeta?.maxScore },
    attempt
  );
  const rawScore = typeof attempt.score === 'number' && Number.isFinite(attempt.score) ? attempt.score : 0;
  const percentage = calculateScorePercentage(rawScore, maxScore);
  const gradeInfo = getPerformanceGrade(percentage);

  const questionRows: ExamReportQuestionRow[] = questions.map((q, idx) => {
    const maxPoints = Math.max(0.5, Number(q.points ?? 1) || 1);
    const result = questionResults.find((r) => r.questionId === q.id);
    const manual = manualMarks.find((r) => r.questionId === q.id);
    const rawAwarded = manual?.pointsAwarded ?? result?.pointsAwarded;
    const isCorrect =
      result?.correct === true ||
      (rawAwarded !== undefined && Number(rawAwarded) >= maxPoints);
    const pointsAwarded =
      rawAwarded !== undefined
        ? Number(rawAwarded)
        : isCorrect
        ? maxPoints
        : 0;
    const status: 'PASS' | 'PART' | 'FAIL' = isCorrect
      ? 'PASS'
      : pointsAwarded > 0
      ? 'PART'
      : 'FAIL';

    return {
      index: idx + 1,
      questionId: q.id || `q_${idx + 1}`,
      prompt: q.prompt || `Question ${idx + 1}`,
      studentAnswerText: formatAnswerText(q, attempt.answers?.[q.id] ?? result?.answer),
      officialAnswerText: formatCorrectText(q),
      pointsAwarded,
      maxPoints,
      status,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const feedbackText =
    attempt.feedback?.trim() ||
    `${gradeInfo.remarks}. Continued engagement with course practicals is highly encouraged.`;

  return {
    attemptId: attempt.id || '',
    examId: attempt.examId || examMeta?.id || '',
    studentId: attempt.studentId || '',
    studentName,
    studentClass,
    schoolName,
    examTitle,
    examSubject,
    submittedAtText: formatReportDateTime(attempt.submittedAt),
    releasedAtText: attempt.releasedAt ? formatReportDateTime(attempt.releasedAt) : '',
    isReleased: Boolean(attempt.releasedAt),
    evaluationMode: attempt.autoGraded !== false ? 'Standard CBT Auto' : 'Instructor Verified',
    rawScore,
    maxScore,
    percentage,
    grade: gradeInfo.grade,
    remarks: gradeInfo.remarks,
    feedbackText,
    questionRows,
  };
}

export async function generateExamReportPdf(
  attempt: ExamReportAttempt,
  examMeta?: ExamReportExamMeta
): Promise<Uint8Array> {
  const vm = buildExamReportViewModel(attempt, examMeta);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logos = await getReportLogos();

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // Helper to draw standard header on any page
  const drawHeader = (_pageNumber?: number) => {
    // Top Navy Accent Bar
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 5, 'F');
    doc.setFillColor(37, 99, 235); // blue-600
    doc.rect(0, 5, pageWidth, 1.5, 'F');

    const currentY = 11;

    // Logos on left and right
    if (logos.emblemLogo) {
      try {
        doc.addImage(logos.emblemLogo, 'PNG', marginX, currentY, 16, 16);
      } catch {}
    }
    if (logos.jdiLogo) {
      try {
        doc.addImage(logos.jdiLogo, 'PNG', pageWidth - marginX - 18, currentY, 18, 16);
      } catch {}
    }

    // Header Text in Center
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('JAYSTARBLISS DYNAMIC INSTITUTE', pageWidth / 2, currentY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text('Center for Excellence in Tech Education, Digital Skills & Computer-Based Testing (CBT)', pageWidth / 2, currentY + 8, { align: 'center' });

    doc.setFontSize(6.8);
    doc.text('Lagos, Nigeria  |  +234 913 651 8194 / +234 913 052 9010  |  jaystarblissstudios@gmail.com  |  www.jaystarbliss-studios.name.ng', pageWidth / 2, currentY + 12, { align: 'center' });

    // Badge Title
    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(marginX, currentY + 16, contentWidth, 7, 1.5, 1.5, 'F');
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.roundedRect(marginX, currentY + 16, contentWidth, 7, 1.5, 1.5, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('OFFICIAL EXAMINATION PERFORMANCE REPORT & AUDIT TRANSCRIPT', pageWidth / 2, currentY + 20.8, { align: 'center' });

    return currentY + 26;
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    const footerY = pageHeight - 10;
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, footerY - 3, pageWidth - marginX, footerY - 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`${vm.schoolName}  ·  Jaystarbliss Dynamic Institute Official Examination Record`, marginX, footerY);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - marginX, footerY, { align: 'right' });
  };

  // PAGE 1 Start
  let y = drawHeader(1);

  // CANDIDATE & EXAMINATION INFORMATION TABLE
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, y, contentWidth, 34, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(marginX, y, contentWidth, 34, 'D');

  // Divider lines inside table
  doc.line(marginX + contentWidth / 2, y, marginX + contentWidth / 2, y + 34);
  doc.line(marginX, y + 8.5, marginX + contentWidth, y + 8.5);
  doc.line(marginX, y + 17, marginX + contentWidth, y + 17);
  doc.line(marginX, y + 25.5, marginX + contentWidth, y + 25.5);

  const col1X = marginX + 3;
  const col2X = marginX + contentWidth / 2 + 3;

  doc.setFontSize(8);

  // Row 1
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Student Full Name:', col1X, y + 5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(vm.studentName, col1X + 34, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Examination Title:', col2X, y + 5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const examTitleShort = vm.examTitle.length > 32 ? vm.examTitle.slice(0, 31) + '…' : vm.examTitle;
  doc.text(examTitleShort, col2X + 34, y + 5.5);

  // Row 2
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Candidate Class:', col1X, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(vm.studentClass, col1X + 34, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Subject / Domain:', col2X, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(vm.examSubject, col2X + 34, y + 14);

  // Row 3
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Partner School:', col1X, y + 22.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const schNameShort = vm.schoolName.length > 32 ? vm.schoolName.slice(0, 31) + '…' : vm.schoolName;
  doc.text(schNameShort, col1X + 34, y + 22.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Submitted At:', col2X, y + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(vm.submittedAtText, col2X + 34, y + 22.5);

  // Row 4
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Candidate ID / Ref:', col1X, y + 31);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(vm.studentId.slice(0, 24), col1X + 34, y + 31);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Release Status:', col2X, y + 31);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(vm.isReleased ? 16 : 180, vm.isReleased ? 185 : 83, vm.isReleased ? 129 : 9);
  doc.text(
    vm.isReleased ? `Released on ${vm.releasedAtText}` : 'Provisional / Verification in Progress',
    col2X + 34,
    y + 31
  );

  y += 38;

  // SCORE & PERFORMANCE METRIC CARD
  doc.setFillColor(240, 249, 255); // sky-50
  doc.roundedRect(marginX, y, contentWidth, 22, 2, 2, 'F');
  doc.setDrawColor(186, 230, 253); // sky-200
  doc.roundedRect(marginX, y, contentWidth, 22, 2, 2, 'D');

  const metricW = contentWidth / 4;

  // Metric 1: Score
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(3, 105, 161); // sky-700
  doc.text('SCORE OBTAINED', marginX + metricW * 0.5, y + 6, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(12, 74, 110); // sky-900
  doc.text(`${vm.rawScore} / ${vm.maxScore}`, marginX + metricW * 0.5, y + 15, { align: 'center' });

  // Metric 2: Percentage
  doc.setFontSize(7.5);
  doc.setTextColor(3, 105, 161);
  doc.text('PERCENTAGE', marginX + metricW * 1.5, y + 6, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(12, 74, 110);
  doc.text(`${vm.percentage}%`, marginX + metricW * 1.5, y + 15, { align: 'center' });

  // Metric 3: Grade
  doc.setFontSize(7.5);
  doc.setTextColor(3, 105, 161);
  doc.text('ASSESSMENT GRADE', marginX + metricW * 2.5, y + 6, { align: 'center' });
  doc.setFontSize(10.5);
  doc.setTextColor(12, 74, 110);
  doc.text(vm.grade, marginX + metricW * 2.5, y + 14.5, { align: 'center' });

  // Metric 4: Method
  doc.setFontSize(7.5);
  doc.setTextColor(3, 105, 161);
  doc.text('EVALUATION MODE', marginX + metricW * 3.5, y + 6, { align: 'center' });
  doc.setFontSize(9.5);
  doc.setTextColor(12, 74, 110);
  doc.text(vm.evaluationMode, marginX + metricW * 3.5, y + 14.5, { align: 'center' });

  y += 26;

  // QUESTION-BY-QUESTION REVIEW TABLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Comprehensive Question-by-Question Review', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total Questions: ${vm.questionRows.length}  |  Total Marks: ${vm.maxScore}`, pageWidth - marginX, y, { align: 'right' });

  y += 4;

  // Table Column Definitions
  const colQNumW = 10;
  const colPromptW = 76;
  const colStudentAnsW = 36;
  const colCorrectAnsW = 36;
  const colMarksW = 14;
  const colResultW = 10;

  const colQNumX = marginX;
  const colPromptX = colQNumX + colQNumW;
  const colStudentAnsX = colPromptX + colPromptW;
  const colCorrectAnsX = colStudentAnsX + colStudentAnsW;
  const colMarksX = colCorrectAnsX + colCorrectAnsW;
  const colResultX = colMarksX + colMarksW;

  const drawTableHeader = (atY: number) => {
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(marginX, atY, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    doc.text('#', colQNumX + colQNumW / 2, atY + 4.8, { align: 'center' });
    doc.text('Question & Prompt', colPromptX + 2, atY + 4.8);
    doc.text('Student Answer', colStudentAnsX + 2, atY + 4.8);
    doc.text('Official Answer Key', colCorrectAnsX + 2, atY + 4.8);
    doc.text('Marks', colMarksX + colMarksW / 2, atY + 4.8, { align: 'center' });
    doc.text('Result', colResultX + colResultW / 2, atY + 4.8, { align: 'center' });

    return atY + 7;
  };

  y = drawTableHeader(y);

  if (vm.questionRows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Question detail is preserved in the central CBT audit ledger and available in the digital portal.', marginX + 3, y + 8);
    y += 16;
  } else {
    for (let i = 0; i < vm.questionRows.length; i++) {
      const row = vm.questionRows[i];

      const promptLines = doc.splitTextToSize(row.prompt, colPromptW - 4);
      const studentAnsLines = doc.splitTextToSize(row.studentAnswerText, colStudentAnsW - 4);
      const correctAnsLines = doc.splitTextToSize(row.officialAnswerText, colCorrectAnsW - 4);

      const maxLines = Math.max(promptLines.length, studentAnsLines.length, correctAnsLines.length, 1);
      const rowHeight = Math.max(7, maxLines * 3.8 + 3);

      // Page break check
      if (y + rowHeight > pageHeight - 24) {
        doc.addPage();
        y = drawHeader(doc.getNumberOfPages());
        y = drawTableHeader(y);
      }

      // Zebra striping
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, rowHeight, 'F');
      }

      // Border for row
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(marginX, y, contentWidth, rowHeight, 'D');

      // Vertical dividers
      doc.line(colPromptX, y, colPromptX, y + rowHeight);
      doc.line(colStudentAnsX, y, colStudentAnsX, y + rowHeight);
      doc.line(colCorrectAnsX, y, colCorrectAnsX, y + rowHeight);
      doc.line(colMarksX, y, colMarksX, y + rowHeight);
      doc.line(colResultX, y, colResultX, y + rowHeight);

      // Text contents
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(String(row.index), colQNumX + colQNumW / 2, y + 4.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(promptLines, colPromptX + 2, y + 4.2);

      // Student Answer styling
      doc.setTextColor(row.isCorrect ? 16 : 185, row.isCorrect ? 149 : 28, row.isCorrect ? 193 : 28);
      doc.text(studentAnsLines, colStudentAnsX + 2, y + 4.2);

      // Correct Answer styling
      doc.setTextColor(71, 85, 105);
      doc.text(correctAnsLines, colCorrectAnsX + 2, y + 4.2);

      // Marks
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`${row.pointsAwarded} / ${row.maxPoints}`, colMarksX + colMarksW / 2, y + 4.5, { align: 'center' });

      // Result symbol
      if (row.status === 'PASS') {
        doc.setTextColor(16, 185, 129); // emerald-500
        doc.text('PASS', colResultX + colResultW / 2, y + 4.5, { align: 'center' });
      } else if (row.status === 'PART') {
        doc.setTextColor(217, 119, 6); // amber-600
        doc.text('PART', colResultX + colResultW / 2, y + 4.5, { align: 'center' });
      } else {
        doc.setTextColor(239, 68, 68); // red-500
        doc.text('FAIL', colResultX + colResultW / 2, y + 4.5, { align: 'center' });
      }

      y += rowHeight;
    }
  }

  // TUTOR REMARKS & FEEDBACK BOX
  const feedbackLines = doc.splitTextToSize(vm.feedbackText, contentWidth - 8);
  const feedbackBoxHeight = Math.max(14, feedbackLines.length * 4 + 7);

  if (y + feedbackBoxHeight + 25 > pageHeight - 12) {
    doc.addPage();
    y = drawHeader(doc.getNumberOfPages());
  }

  y += 4;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(marginX, y, contentWidth, feedbackBoxHeight, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, y, contentWidth, feedbackBoxHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('EXAMINER REMARKS & ACADEMIC FEEDBACK:', marginX + 3, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(feedbackLines, marginX + 3, y + 9);

  y += feedbackBoxHeight + 4;

  // SIGNATURE & AUTHENTICATION SEAL SECTION
  const sigBoxHeight = 18;
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginX, y, contentWidth, sigBoxHeight, 'D');

  const halfW = contentWidth / 2;

  // Left: Lead Examiner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Lead CBT Examiner / Tutor Authorization:', marginX + 3, y + 5);
  doc.setDrawColor(148, 163, 184);
  doc.line(marginX + 3, y + 13, marginX + halfW - 10, y + 13);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Digitally Authenticated by Jaystarbliss Central Assessment Authority', marginX + 3, y + 16.5);

  // Right: Institution Seal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Partner School & Institutional Verification:', marginX + halfW + 3, y + 5);
  doc.line(marginX + halfW + 3, y + 13, marginX + contentWidth - 4, y + 13);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`${vm.schoolName} · Issued ${new Date().toLocaleDateString('en-GB')}`, marginX + halfW + 3, y + 16.5);

  // Apply Footers to ALL pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
