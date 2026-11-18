import { jsPDF } from 'jspdf';
import {
  JDI_COLORS,
  PDF_LAYOUT,
  formatDocumentRefNo,
  formatShortDateDDMMYY,
  sanitizePdfText,
  resolveDocumentIdentity,
  loadOfficialWatermarkAsset,
  drawInstitutionalDocumentHeader,
  preparePageBackgroundAndWatermark,
  ensurePdfSpace,
  applyFooterAcrossAllPages,
  drawTranslucentRect,
  drawSectionHeading,
} from './index';

export interface LearnerInsightsPdfInput {
  school: {
    schoolId: string;
    schoolCode?: string;
    name: string;
  };
  learner: {
    id: string;
    fullName: string;
    className: string;
  };
  summary: {
    assessments: number;
    averageAssessmentScore: number | null;
    attendanceRate: number | null;
  };
  categorizedWork: {
    assignments: Array<{
      id: string;
      title: string;
      subject: string;
      status: string;
      grade?: number | null;
      maxPoints?: number | null;
      dueDate?: string | null;
      submittedAt?: string | null;
      feedback?: string;
    }>;
    activities: Array<{
      id: string;
      title: string;
      subject: string;
      status: string;
      score?: number | null;
      maxScore?: number | null;
      isUngradedActivity?: boolean;
      submittedAt?: string | null;
    }>;
    tests: Array<{
      id: string;
      title: string;
      subject: string;
      status: string;
      score?: number | null;
      maxScore?: number | null;
      submittedAt?: string | null;
    }>;
    examinations: Array<{
      id: string;
      title: string;
      subject: string;
      status: string;
      score?: number | null;
      maxScore?: number | null;
      submittedAt?: string | null;
      releasedAt?: string | null;
    }>;
  };
  assessments: Array<{
    id: string;
    title: string;
    subject: string;
    score?: number | null;
    feedback?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  }>;
  attendance: Array<{
    id: string;
    date?: string | null;
    status: string;
    notes?: string;
  }>;
}

function formatInsightDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB');
}

function formatInsightScore(
  score?: number | null,
  max?: number | null,
  ungraded?: boolean
): string {
  if (ungraded) return 'Ungraded';
  if (score === null || score === undefined) return 'Pending';
  const denom = typeof max === 'number' && max > 0 ? max : 100;
  return `${score} / ${denom}`;
}

export async function createLearnerInsightsPdfDocument(
  data: LearnerInsightsPdfInput
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  const identity = resolveDocumentIdentity({
    schoolId: data.school.schoolId,
    schoolName: data.school.name,
  });

  const shortDate = formatShortDateDDMMYY(new Date());
  const refNo = formatDocumentRefNo(
    'JDI-PRG',
    `${data.school.schoolId}:${data.learner.id}`
  );

  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  let y = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: identity.headerTitle,
    subtitleLine: `OFFICIAL LEARNER PROGRESS & INSIGHTS REPORT  |  DATE: ${shortDate}`,
    refNo,
  });

  // Learner & School Metadata + Summary KPI Card
  const cardH = 30;
  drawTranslucentRect(
    doc,
    marginX,
    y,
    contentWidth,
    cardH,
    JDI_COLORS.ICE_BG,
    0.85,
    JDI_COLORS.ICE_BORDER,
    2.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text('LEARNER PROFILE & ACADEMIC SUMMARY', marginX + 5, y + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  doc.text(sanitizePdfText(`Learner: ${data.learner.fullName}`), marginX + 5, y + 12.5, {
    maxWidth: 90,
  });
  doc.text(
    sanitizePdfText(`Class: ${data.learner.className}  •  ID: ${data.learner.id}`),
    marginX + 5,
    y + 18,
    { maxWidth: 90 }
  );
  doc.text(
    sanitizePdfText(
      `School ID: ${data.school.schoolId}${
        data.school.schoolCode ? ` (${data.school.schoolCode})` : ''
      }`
    ),
    marginX + 5,
    y + 23.5,
    { maxWidth: 90 }
  );

  // Right KPI Metrics inside card
  const kpiX = marginX + 104;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('AVG SCORE', kpiX, y + 8);
  doc.text('ATTENDANCE', kpiX + 38, y + 8);

  doc.setFontSize(12);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(
    data.summary.averageAssessmentScore === null
      ? '—'
      : `${data.summary.averageAssessmentScore.toFixed(1)}%`,
    kpiX,
    y + 15.5
  );
  doc.text(
    data.summary.attendanceRate === null ? '—' : `${data.summary.attendanceRate.toFixed(1)}%`,
    kpiX + 38,
    y + 15.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(
    `Assignments: ${data.categorizedWork.assignments.length}  |  Tests: ${
      data.categorizedWork.tests.length + data.assessments.length
    }  |  Exams: ${data.categorizedWork.examinations.length}`,
    kpiX,
    y + 23.5,
    { maxWidth: 72 }
  );

  y += cardH + 8;

  const renderRecordTable = (
    sectionTitle: string,
    headers: string[],
    colWidths: number[],
    rows: string[][],
    emptyMessage: string
  ) => {
    y = ensurePdfSpace(doc, y, 22, refNo, watermarkAsset);
    y = drawSectionHeading(doc, sectionTitle, marginX, y, contentWidth);

    if (rows.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.2);
      doc.setTextColor(...JDI_COLORS.INK_MUTED);
      doc.text(emptyMessage, marginX, y);
      y += 8;
      return;
    }

    const drawHeader = (headerY: number): number => {
      doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
      doc.rect(marginX, headerY, contentWidth, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(...JDI_COLORS.WHITE);
      let x = marginX;
      headers.forEach((h, i) => {
        doc.text(h, x + 2, headerY + 5);
        x += colWidths[i];
      });
      return headerY + 7.5;
    };

    y = drawHeader(y);

    rows.forEach((row, idx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      const wrapped = row.map((cell, ci) =>
        doc.splitTextToSize(sanitizePdfText(cell || '—'), Math.max(8, colWidths[ci] - 4))
      );
      const maxLines = Math.max(1, ...wrapped.map((l: string[]) => l.length));
      const rowH = Math.max(6.8, maxLines * 3.7 + 3.2);

      y = ensurePdfSpace(doc, y, rowH, refNo, watermarkAsset, (freshY) => drawHeader(freshY));

      if (idx % 2 === 1) {
        drawTranslucentRect(doc, marginX, y, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.52);
      }

      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      let x = marginX;
      wrapped.forEach((lines: string[], ci: number) => {
        doc.setFont('helvetica', ci === 1 ? 'bold' : 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(...JDI_COLORS.INK_BODY);
        doc.text(lines, x + 2, y + 4.3);
        x += colWidths[ci];
      });
      y += rowH;
    });

    y += 4.5;
  };

  renderRecordTable(
    'Assignments',
    ['Date', 'Title', 'Subject', 'Score', 'Status'],
    [24, 68, 38, 24, 26],
    data.categorizedWork.assignments.map((a) => [
      formatInsightDate(a.submittedAt || a.dueDate),
      a.title,
      a.subject,
      formatInsightScore(a.grade, a.maxPoints),
      a.status,
    ]),
    'No assignments recorded for this learner.'
  );

  renderRecordTable(
    'Learning Activities',
    ['Date', 'Activity', 'Subject', 'Score', 'Status'],
    [24, 68, 38, 24, 26],
    data.categorizedWork.activities.map((a) => [
      formatInsightDate(a.submittedAt),
      a.title,
      a.subject,
      formatInsightScore(a.score, a.maxScore, a.isUngradedActivity),
      a.status,
    ]),
    'No learning activities recorded for this learner.'
  );

  const combinedTestRows: string[][] = [
    ...data.categorizedWork.tests.map((t) => [
      formatInsightDate(t.submittedAt),
      t.title,
      t.subject,
      formatInsightScore(t.score, t.maxScore),
      t.status,
    ]),
    ...data.assessments.map((a) => [
      formatInsightDate(a.updatedAt || a.createdAt),
      a.title,
      a.subject,
      formatInsightScore(a.score, 100),
      a.feedback ? `Feedback: ${a.feedback}` : 'Evaluated',
    ]),
  ];

  renderRecordTable(
    'Tests & Academic Assessments',
    ['Date', 'Title', 'Subject', 'Score', 'Status / Notes'],
    [24, 62, 34, 22, 38],
    combinedTestRows,
    'No tests or academic assessments recorded.'
  );

  renderRecordTable(
    'Examination History',
    ['Date', 'Assessment', 'Subject', 'Score', 'Release Status'],
    [24, 62, 34, 22, 38],
    data.categorizedWork.examinations.map((e) => [
      formatInsightDate(e.submittedAt),
      e.title,
      e.subject,
      formatInsightScore(e.score, e.maxScore),
      e.releasedAt ? `Released ${formatInsightDate(e.releasedAt)}` : `${e.status} (Awaiting Release)`,
    ]),
    'No formal assessment attempts recorded.'
  );

  renderRecordTable(
    'Attendance History',
    ['Date', 'Status', 'Remarks / Notes'],
    [28, 34, 118],
    data.attendance.map((a) => [
      formatInsightDate(a.date),
      a.status,
      a.notes || '—',
    ]),
    'No attendance records recorded.'
  );

  y = ensurePdfSpace(doc, y, 12, refNo, watermarkAsset);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.6);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(
    'This progress report reflects official records available to the school portal at the time of generation. Separate denominators are preserved across categories.',
    marginX,
    y,
    { maxWidth: contentWidth }
  );

  applyFooterAcrossAllPages(doc);
  return doc;
}

export async function generateLearnerInsightsPdf(data: LearnerInsightsPdfInput): Promise<void> {
  const doc = await createLearnerInsightsPdfDocument(data);
  doc.save(`learner-progress-${data.learner.id}.pdf`);
}
