import { jsPDF } from 'jspdf';
import {
  JDI_COLORS,
  JDI_INSTITUTION_NAME,
  PDF_LAYOUT,
  applyFooterAcrossAllPages,
  coerceValidDate,
  drawInstitutionalDocumentHeader,
  drawTranslucentRect,
  ensurePdfSpace,
  formatShortDateDDMMYY,
  loadOfficialWatermarkAsset,
  preparePageBackgroundAndWatermark,
  sanitizePdfText,
} from '../pdf';
import { createZip, type ZipFile } from '../../modules/examinations/zip';
import type { AcademicPerformanceReportSnapshot } from './types';

function resolveReportDocumentSubtitle(snapshot: AcademicPerformanceReportSnapshot, shortDate: string): string {
  switch (snapshot.reportType) {
    case 'SCHOOL_TERM':
      return `END-OF-TERM ACADEMIC REPORT • ${(snapshot.termName || 'TERM 1').toUpperCase()} • ${snapshot.sessionName.toUpperCase()} | DATE: ${shortDate}`;
    case 'SCHOOL_SESSION':
      return `END-OF-SESSION ANNUAL REPORT • ${snapshot.sessionName.toUpperCase()} | DATE: ${shortDate}`;
    case 'PRIVATE_PROGRAMME':
      return `END-OF-PROGRAMME PERFORMANCE REPORT • ${snapshot.programName.toUpperCase()} | DATE: ${shortDate}`;
    case 'PRIVATE_ANNUAL':
      return `END-OF-YEAR ACADEMIC PERFORMANCE REPORT • ${snapshot.periodStartDate} TO ${snapshot.periodEndDate} | DATE: ${shortDate}`;
  }
}

function resolvePrimaryHeading(snapshot: AcademicPerformanceReportSnapshot): string {
  if (
    (snapshot.reportType === 'SCHOOL_TERM' || snapshot.reportType === 'SCHOOL_SESSION') &&
    snapshot.schoolName &&
    snapshot.schoolName.trim()
  ) {
    return snapshot.schoolName.trim().toUpperCase();
  }
  return JDI_INSTITUTION_NAME;
}

/**
 * Builds a jsPDF document instance for any of the 4 official Jaystarbliss performance report types.
 * Strictly reuses `snapshot.reportRef` so re-downloading never creates a new reference number.
 */
export async function buildOfficialPerformanceReportPdfDoc(
  snapshot: AcademicPerformanceReportSnapshot
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const watermark = await loadOfficialWatermarkAsset();
  preparePageBackgroundAndWatermark(doc, watermark);

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;

  const refDate =
    coerceValidDate(snapshot.issuedAt) ||
    coerceValidDate(snapshot.generatedAt) ||
    new Date();
  const shortDate = formatShortDateDDMMYY(refDate);

  const primaryHeading = resolvePrimaryHeading(snapshot);
  const subtitleLine = resolveReportDocumentSubtitle(snapshot, shortDate);

  let y = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: primaryHeading,
    subtitleLine,
    refNo: snapshot.reportRef,
  });

  // Version & status indicator if revised or draft
  if (snapshot.version > 1 || snapshot.status !== 'ISSUED') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...JDI_COLORS.NAVY_STEEL);
    const metaTag = [
      `VERSION ${snapshot.version}.0`,
      snapshot.status !== 'ISSUED' ? `STATUS: ${snapshot.status}` : 'OFFICIAL RELEASE',
      snapshot.supersedesReportRef ? `SUPERSEDES: ${snapshot.supersedesReportRef}` : '',
    ]
      .filter(Boolean)
      .join('  •  ');
    doc.text(sanitizePdfText(metaTag), pageWidth / 2, y - 3, { align: 'center' });
    y += 2;
  }

  // ============================================================================
  // SECTION 1: LEARNER IDENTITY & OVERALL SCORE SUMMARY CARD
  // ============================================================================
  const scoreCardW = 58;
  const scoreCardH = 34;
  const scoreCardX = pageWidth - marginX - scoreCardW;
  const scoreCardY = y;

  drawTranslucentRect(
    doc,
    scoreCardX,
    scoreCardY,
    scoreCardW,
    scoreCardH,
    JDI_COLORS.ICE_BG,
    0.85,
    JDI_COLORS.ICE_BORDER,
    2.5
  );

  const scoreCenterX = scoreCardX + scoreCardW / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text(
    snapshot.reportType === 'SCHOOL_SESSION'
      ? 'ANNUAL OVERALL SCORE'
      : snapshot.reportType === 'PRIVATE_PROGRAMME'
      ? 'PROGRAMME SCORE'
      : 'OVERALL SCORE',
    scoreCenterX,
    scoreCardY + 6.5,
    { align: 'center' }
  );

  const pctDisplay =
    snapshot.overallPercentage !== null
      ? `${snapshot.overallPercentage.toFixed(1)}%`
      : 'INCOMPLETE';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text(sanitizePdfText(pctDisplay), scoreCenterX, scoreCardY + 15, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(
    sanitizePdfText(`Grade: ${snapshot.overallGrade} • ${snapshot.classification}`),
    scoreCenterX,
    scoreCardY + 22,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...JDI_COLORS.AMBER_BODY);
  doc.text(
    sanitizePdfText(
      `Profile: ${snapshot.gradingProfileName.slice(0, 26)} (v${snapshot.gradingProfileVersion})`
    ),
    scoreCenterX,
    scoreCardY + 28,
    { align: 'center' }
  );

  // Left-side Learner Details Block
  const leftMaxW = scoreCardX - marginX - 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text('LEARNER & ACADEMIC PERIOD DETAILS', marginX, y + 4);

  const detailRows: Array<{ label: string; value: string }> = [
    { label: 'Learner Name', value: snapshot.studentName },
    {
      label:
        snapshot.enrolmentCategory === 'school'
          ? 'School & Class / Grade'
          : 'Enrolment & Track',
      value:
        snapshot.enrolmentCategory === 'school'
          ? `${snapshot.schoolName || 'Partner School'} — ${snapshot.className}`
          : `${snapshot.enrolmentLabel} — ${snapshot.className}`,
    },
    { label: 'Programme / Track', value: snapshot.programName },
    {
      label: 'Reporting Period',
      value: `${snapshot.periodLabel} (${snapshot.periodStartDate} to ${snapshot.periodEndDate})`,
    },
  ];

  if (snapshot.assignedTutorName) {
    detailRows.push({ label: 'Assigned Facilitator / Tutor', value: snapshot.assignedTutorName });
  }

  let detailY = y + 10.5;
  detailRows.forEach((row) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...JDI_COLORS.AMBER_BODY);
    const lineText = sanitizePdfText(`${row.label}: ${row.value}`);
    const wrapped = doc.splitTextToSize(lineText, leftMaxW) as string[];
    wrapped.forEach((line, idx) => {
      doc.text(line, marginX, detailY + idx * 4.1);
    });
    detailY += wrapped.length * 4.1 + 1.5;
  });

  y = Math.max(detailY + 3, scoreCardY + scoreCardH + 6);

  // ============================================================================
  // SECTION 2: THREE-TERM PROGRESSION COMPARISON (FOR SCHOOL_SESSION REPORTS)
  // ============================================================================
  if (
    snapshot.reportType === 'SCHOOL_SESSION' &&
    Array.isArray(snapshot.termBreakdowns) &&
    snapshot.termBreakdowns.length > 0
  ) {
    y = ensurePdfSpace(doc, y, 42, snapshot.reportRef, watermark);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.text('THREE-TERM ACADEMIC PROGRESSION & ANNUAL SUMMARY', marginX, y);
    y += 3.5;

    // Table Header
    const colTerm = 38;
    const colWindow = 42;
    const colWork = 28;
    const colAtt = 22;
    const colScore = 26;
    const colDelta = contentWidth - colTerm - colWindow - colWork - colAtt - colScore;

    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.rect(marginX, y, contentWidth, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...JDI_COLORS.WHITE);
    doc.text('Term', marginX + 2.5, y + 5);
    doc.text('Period Dates', marginX + colTerm + 2, y + 5);
    doc.text('Graded Work', marginX + colTerm + colWindow + 2, y + 5);
    doc.text('Attendance', marginX + colTerm + colWindow + colWork + 2, y + 5);
    doc.text('Term Score', marginX + colTerm + colWindow + colWork + colAtt + 2, y + 5);
    doc.text('Progression', marginX + colTerm + colWindow + colWork + colAtt + colScore + 2, y + 5);
    y += 7.5;

    snapshot.termBreakdowns.forEach((tb, idx) => {
      const rowH = 7.5;
      if (idx % 2 === 1) {
        drawTranslucentRect(doc, marginX, y, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.72);
      }
      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(sanitizePdfText(tb.termName), marginX + 2.5, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...JDI_COLORS.INK_MUTED);
      doc.text(sanitizePdfText(`${tb.startDate} – ${tb.endDate}`), marginX + colTerm + 2, y + 5);

      const workCount = tb.gradedAssessmentCount + tb.completedAssignmentCount;
      doc.text(
        sanitizePdfText(`${workCount} record(s)`),
        marginX + colTerm + colWindow + 2,
        y + 5
      );

      doc.text(
        sanitizePdfText(tb.attendanceRate !== null ? `${tb.attendanceRate.toFixed(0)}%` : '—'),
        marginX + colTerm + colWindow + colWork + 2,
        y + 5
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(
        sanitizePdfText(
          tb.overallPercentage !== null
            ? `${tb.overallPercentage.toFixed(1)}% (${tb.grade})`
            : 'No Records'
        ),
        marginX + colTerm + colWindow + colWork + colAtt + 2,
        y + 5
      );

      const deltaText =
        tb.deltaFromPreviousTerm === null
          ? 'Baseline'
          : tb.deltaFromPreviousTerm > 0
          ? `+${tb.deltaFromPreviousTerm.toFixed(1)}%`
          : `${tb.deltaFromPreviousTerm.toFixed(1)}%`;
      doc.setFont('helvetica', 'bold');
      const deltaColor =
        tb.deltaFromPreviousTerm !== null && tb.deltaFromPreviousTerm < 0
          ? JDI_COLORS.CRIMSON
          : JDI_COLORS.NAVY_PRIMARY;
      doc.setTextColor(deltaColor[0], deltaColor[1], deltaColor[2]);
      doc.text(
        sanitizePdfText(deltaText),
        marginX + colTerm + colWindow + colWork + colAtt + colScore + 2,
        y + 5
      );

      y += rowH;
    });

    // Visual horizontal bar comparison if graphical analysis is enabled
    if (snapshot.includeOptions.includeGraphicalAnalysis) {
      y += 3;
      const chartH = 18;
      y = ensurePdfSpace(doc, y, chartH + 4, snapshot.reportRef, watermark);
      drawTranslucentRect(
        doc,
        marginX,
        y,
        contentWidth,
        chartH,
        JDI_COLORS.SOFT_TINT,
        0.8,
        JDI_COLORS.BORDER_LIGHT,
        1.5
      );

      let barY = y + 4.5;
      snapshot.termBreakdowns.forEach((tb) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...JDI_COLORS.INK_DARK);
        doc.text(sanitizePdfText(tb.termName.slice(0, 14)), marginX + 3, barY);

        const trackX = marginX + 28;
        const trackW = contentWidth - 52;
        doc.setFillColor(226, 232, 240);
        doc.rect(trackX, barY - 2.4, trackW, 2.8, 'F');

        const pctVal = Math.max(0, Math.min(100, Number(tb.overallPercentage || 0)));
        if (pctVal > 0) {
          doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
          doc.rect(trackX, barY - 2.4, (trackW * pctVal) / 100, 2.8, 'F');
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(
          sanitizePdfText(tb.overallPercentage !== null ? `${tb.overallPercentage.toFixed(1)}%` : '—'),
          trackX + trackW + 3,
          barY
        );
        barY += 4.5;
      });
      y += chartH + 5;
    } else {
      y += 5;
    }
  }

  // ============================================================================
  // SECTION 3: WEIGHTED GRADING CATEGORY BREAKDOWN TABLE
  // ============================================================================
  const catResults = snapshot.calculationBreakdown.categoryResults || [];
  if (catResults.length > 0) {
    y = ensurePdfSpace(doc, y, 36, snapshot.reportRef, watermark);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.text('WEIGHTED ASSESSMENT CATEGORY PERFORMANCE', marginX, y);
    y += 3.5;

    const cNameW = 62;
    const cItemsW = 24;
    const cRawW = 30;
    const cPctW = 24;
    const cWeightW = 22;
    const cContribW = contentWidth - cNameW - cItemsW - cRawW - cPctW - cWeightW;

    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.rect(marginX, y, contentWidth, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...JDI_COLORS.WHITE);
    doc.text('Assessment Category', marginX + 2.5, y + 5);
    doc.text('Records', marginX + cNameW + 2, y + 5);
    doc.text('Raw Marks', marginX + cNameW + cItemsW + 2, y + 5);
    doc.text('Category %', marginX + cNameW + cItemsW + cRawW + 2, y + 5);
    doc.text('Weight', marginX + cNameW + cItemsW + cRawW + cPctW + 2, y + 5);
    doc.text('Contribution', marginX + cNameW + cItemsW + cRawW + cPctW + cWeightW + Math.min(2, cContribW), y + 5);
    y += 7.5;

    catResults.forEach((cat, idx) => {
      const rowH = 7.2;
      y = ensurePdfSpace(doc, y, rowH + 4, snapshot.reportRef, watermark);
      if (idx % 2 === 1) {
        drawTranslucentRect(doc, marginX, y, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.72);
      }
      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(sanitizePdfText(cat.categoryName.slice(0, 34)), marginX + 2.5, y + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...JDI_COLORS.INK_MUTED);
      doc.text(
        sanitizePdfText(`${cat.includedCount} graded`),
        marginX + cNameW + 2,
        y + 4.8
      );

      doc.text(
        sanitizePdfText(
          cat.includedCount > 0 ? `${cat.rawEarnedTotal} / ${cat.maxAvailableTotal}` : '—'
        ),
        marginX + cNameW + cItemsW + 2,
        y + 4.8
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(
        sanitizePdfText(
          cat.categoryPercentage !== null ? `${cat.categoryPercentage.toFixed(1)}%` : 'No Score'
        ),
        marginX + cNameW + cItemsW + cRawW + 2,
        y + 4.8
      );

      doc.setFont('helvetica', 'normal');
      doc.text(
        sanitizePdfText(`${cat.effectiveWeight.toFixed(1)}%`),
        marginX + cNameW + cItemsW + cRawW + cPctW + 2,
        y + 4.8
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
      doc.text(
        sanitizePdfText(
          cat.categoryPercentage !== null ? `${cat.weightedContribution.toFixed(2)}%` : '0.00%'
        ),
        marginX + cNameW + cItemsW + cRawW + cPctW + cWeightW + 2,
        y + 4.8
      );

      y += rowH;
    });

    y += 5;
  }

  // ============================================================================
  // SECTION 4: SUBJECT OR PROGRAMME BREAKDOWN TABLE
  // ============================================================================
  if (
    (snapshot.reportType === 'PRIVATE_ANNUAL' || snapshot.reportType === 'PRIVATE_PROGRAMME') &&
    snapshot.programmeBreakdowns &&
    snapshot.programmeBreakdowns.length > 0
  ) {
    y = ensurePdfSpace(doc, y, 28, snapshot.reportRef, watermark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.text(
      snapshot.reportType === 'PRIVATE_ANNUAL'
        ? 'PROGRAMME-BY-PROGRAMME PERFORMANCE BREAKDOWN'
        : 'PROGRAMME & MODULE PERFORMANCE SUMMARY',
      marginX,
      y
    );
    y += 3.5;

    const pNameW = 68;
    const pAssessW = 28;
    const pAssignW = 28;
    const pMileW = 28;

    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.rect(marginX, y, contentWidth, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...JDI_COLORS.WHITE);
    doc.text('Programme / Module', marginX + 2.5, y + 5);
    doc.text('Assessments', marginX + pNameW + 2, y + 5);
    doc.text('Assignments', marginX + pNameW + pAssessW + 2, y + 5);
    doc.text('Milestones', marginX + pNameW + pAssessW + pAssignW + 2, y + 5);
    doc.text('Normalized Score', marginX + pNameW + pAssessW + pAssignW + pMileW + 2, y + 5);
    y += 7.5;

    snapshot.programmeBreakdowns.forEach((pb, idx) => {
      const rowH = 7.2;
      y = ensurePdfSpace(doc, y, rowH + 4, snapshot.reportRef, watermark);
      if (idx % 2 === 1) {
        drawTranslucentRect(doc, marginX, y, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.72);
      }
      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(sanitizePdfText(pb.programName.slice(0, 38)), marginX + 2.5, y + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...JDI_COLORS.INK_MUTED);
      doc.text(sanitizePdfText(String(pb.assessmentCount)), marginX + pNameW + 2, y + 4.8);
      doc.text(sanitizePdfText(String(pb.assignmentCount)), marginX + pNameW + pAssessW + 2, y + 4.8);
      doc.text(
        sanitizePdfText(`${pb.completedMilestones}/${pb.totalMilestones}`),
        marginX + pNameW + pAssessW + pAssignW + 2,
        y + 4.8
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(
        sanitizePdfText(
          pb.overallPercentage !== null
            ? `${pb.overallPercentage.toFixed(1)}% (${pb.grade})`
            : 'Pending'
        ),
        marginX + pNameW + pAssessW + pAssignW + pMileW + 2,
        y + 4.8
      );
      y += rowH;
    });
    y += 5;
  } else if (
    snapshot.includeOptions.includeSubjectBreakdown &&
    snapshot.subjectBreakdowns &&
    snapshot.subjectBreakdowns.length > 0
  ) {
    y = ensurePdfSpace(doc, y, 28, snapshot.reportRef, watermark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.text('SUBJECT / COURSE PERFORMANCE SUMMARY', marginX, y);
    y += 3.5;

    const sNameW = 72;
    const sCountW = 26;
    const sMarksW = 32;
    const sPctW = 26;

    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.rect(marginX, y, contentWidth, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...JDI_COLORS.WHITE);
    doc.text('Subject / Course Area', marginX + 2.5, y + 5);
    doc.text('Evaluations', marginX + sNameW + 2, y + 5);
    doc.text('Total Marks', marginX + sNameW + sCountW + 2, y + 5);
    doc.text('Percentage', marginX + sNameW + sCountW + sMarksW + 2, y + 5);
    doc.text('Grade', marginX + sNameW + sCountW + sMarksW + sPctW + 2, y + 5);
    y += 7.5;

    snapshot.subjectBreakdowns.forEach((sb, idx) => {
      const rowH = 7.2;
      y = ensurePdfSpace(doc, y, rowH + 4, snapshot.reportRef, watermark);
      if (idx % 2 === 1) {
        drawTranslucentRect(doc, marginX, y, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.72);
      }
      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(sanitizePdfText(sb.subject.slice(0, 40)), marginX + 2.5, y + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...JDI_COLORS.INK_MUTED);
      doc.text(sanitizePdfText(`${sb.assessmentCount} item(s)`), marginX + sNameW + 2, y + 4.8);
      doc.text(
        sanitizePdfText(`${sb.rawEarnedTotal} / ${sb.maxAvailableTotal}`),
        marginX + sNameW + sCountW + 2,
        y + 4.8
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(
        sanitizePdfText(`${sb.averagePercentage.toFixed(1)}%`),
        marginX + sNameW + sCountW + sMarksW + 2,
        y + 4.8
      );
      doc.text(
        sanitizePdfText(`${sb.grade} (${sb.classification})`),
        marginX + sNameW + sCountW + sMarksW + sPctW + 2,
        y + 4.8
      );

      y += rowH;
    });
    y += 5;
  }

  // ============================================================================
  // SECTION 5: INDIVIDUAL EVALUATED WORK ITEMS (ASSESSMENTS, ASSIGNMENTS, PROJECTS)
  // ============================================================================
  const includedItems = snapshot.calculationBreakdown.includedItems || [];
  if (
    includedItems.length > 0 &&
    (snapshot.includeOptions.includeDetailedAssessments ||
      snapshot.includeOptions.includeAssignmentsAndProjects)
  ) {
    y = ensurePdfSpace(doc, y, 28, snapshot.reportRef, watermark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.text('RECORDED ACADEMIC EVALUATIONS & COURSEWORK', marginX, y);
    y += 3.5;

    const iRefW = 30;
    const iTitleW = 58;
    const iTypeW = 28;
    const iDateW = 22;
    const iScoreW = 24;

    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.rect(marginX, y, contentWidth, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...JDI_COLORS.WHITE);
    doc.text('Reference', marginX + 2, y + 5);
    doc.text('Assessment / Coursework Title', marginX + iRefW + 2, y + 5);
    doc.text('Category', marginX + iRefW + iTitleW + 2, y + 5);
    doc.text('Date', marginX + iRefW + iTitleW + iTypeW + 2, y + 5);
    doc.text('Marks', marginX + iRefW + iTitleW + iTypeW + iDateW + 2, y + 5);
    doc.text('Normalized', marginX + iRefW + iTitleW + iTypeW + iDateW + iScoreW + 2, y + 5);
    y += 7.5;

    includedItems.slice(0, 18).forEach((item, idx) => {
      const rowH = 6.8;
      y = ensurePdfSpace(doc, y, rowH + 4, snapshot.reportRef, watermark);
      if (idx % 2 === 1) {
        drawTranslucentRect(doc, marginX, y, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.72);
      }
      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.9);
      doc.setTextColor(...JDI_COLORS.INK_MUTED);
      doc.text(sanitizePdfText(item.referenceNumber.slice(0, 16)), marginX + 2, y + 4.6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(sanitizePdfText(item.title.slice(0, 34)), marginX + iRefW + 2, y + 4.6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.1);
      doc.setTextColor(...JDI_COLORS.INK_MUTED);
      doc.text(
        sanitizePdfText((item.categoryName || item.workType).slice(0, 16)),
        marginX + iRefW + iTitleW + 2,
        y + 4.6
      );

      const dateText = item.completedAt ? item.completedAt.slice(0, 10) : '—';
      doc.text(sanitizePdfText(dateText), marginX + iRefW + iTitleW + iTypeW + 2, y + 4.6);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(
        sanitizePdfText(`${item.rawEarnedMarks ?? 0} / ${item.maxAvailableMarks}`),
        marginX + iRefW + iTitleW + iTypeW + iDateW + 2,
        y + 4.6
      );

      doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
      doc.text(
        sanitizePdfText(
          item.normalizedPercentage !== null ? `${item.normalizedPercentage.toFixed(1)}%` : '—'
        ),
        marginX + iRefW + iTitleW + iTypeW + iDateW + iScoreW + 2,
        y + 4.6
      );

      y += rowH;
    });
    y += 5;
  }

  // ============================================================================
  // SECTION 6: ATTENDANCE & MILESTONES / PRACTICAL SKILLS SUMMARY
  // ============================================================================
  const showAttendance = snapshot.includeOptions.includeAttendance;
  const showMilestones = snapshot.includeOptions.includeMilestones;

  if (showAttendance || showMilestones) {
    y = ensurePdfSpace(doc, y, 24, snapshot.reportRef, watermark);
    const halfW = (contentWidth - 4) / 2;

    if (showAttendance) {
      const att = snapshot.attendanceSummary;
      const boxW = showMilestones ? halfW : contentWidth;
      drawTranslucentRect(
        doc,
        marginX,
        y,
        boxW,
        20,
        JDI_COLORS.SOFT_TINT,
        0.8,
        JDI_COLORS.BORDER_LIGHT,
        2
      );
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
      doc.text('ATTENDANCE & PARTICIPATION SUMMARY', marginX + 3.5, y + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(...JDI_COLORS.INK_BODY);
      const attLine =
        att.totalSessions > 0
          ? `Attendance Rate: ${att.attendanceRate !== null ? `${att.attendanceRate.toFixed(1)}%` : '—'} (${att.presentCount} Present, ${att.lateCount} Late, ${att.absentCount} Absent across ${att.totalSessions} sessions)`
          : 'No formal attendance sessions recorded during this reporting window.';
      const attLines = doc.splitTextToSize(sanitizePdfText(attLine), boxW - 7) as string[];
      attLines.forEach((l, i) => doc.text(l, marginX + 3.5, y + 11 + i * 4));
    }

    if (showMilestones) {
      const ms = snapshot.milestoneSummary;
      const boxX = showAttendance ? marginX + halfW + 4 : marginX;
      const boxW = showAttendance ? halfW : contentWidth;
      drawTranslucentRect(
        doc,
        boxX,
        y,
        boxW,
        20,
        JDI_COLORS.SOFT_TINT,
        0.8,
        JDI_COLORS.BORDER_LIGHT,
        2
      );
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
      doc.text('CURRICULUM MILESTONES & PRACTICAL SKILLS', boxX + 3.5, y + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(...JDI_COLORS.INK_BODY);
      const msLine =
        ms.totalMilestones > 0
          ? `Completed ${ms.completedCount} of ${ms.totalMilestones} milestones (${ms.completionRate !== null ? `${ms.completionRate.toFixed(0)}%` : '0%'}). ${ms.skillsAcquired.length ? `Competencies: ${ms.skillsAcquired.slice(0, 4).join(', ')}` : ''}`
          : 'Curriculum milestones tracked continuously alongside studio practical coursework.';
      const msLines = doc.splitTextToSize(sanitizePdfText(msLine), boxW - 7) as string[];
      msLines.forEach((l, i) => doc.text(l, boxX + 3.5, y + 11 + i * 4));
    }

    y += 24;
  }

  // ============================================================================
  // SECTION 7: TUTOR EVALUATION, REMARKS & NEXT-STAGE RECOMMENDATION
  // ============================================================================
  if (snapshot.includeOptions.includeTutorRemarks && snapshot.tutorRemarks) {
    const rem = snapshot.tutorRemarks;
    const remarkEntries = [
      rem.generalFeedback ? `Summary Evaluation: ${rem.generalFeedback}` : '',
      rem.strengths ? `Key Strengths Demonstrated: ${rem.strengths}` : '',
      rem.areasForImprovement ? `Areas for Improvement: ${rem.areasForImprovement}` : '',
      rem.nextStageRecommendation ? `Recommendation: ${rem.nextStageRecommendation}` : '',
      snapshot.reportType === 'PRIVATE_PROGRAMME'
        ? `Programme Completion Status: ${
            rem.certifiedCompleted
              ? 'CERTIFIED COMPLETED — Met all programme academic & practical completion requirements'
              : rem.completionRecommendation === 'COMPLETED'
              ? 'Completed Curriculum Modules'
              : 'In Progress / Extended Practice Recommended'
          }`
        : '',
    ].filter(Boolean);

    const wrappedLines: string[] = [];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    remarkEntries.forEach((entry) => {
      const split = doc.splitTextToSize(sanitizePdfText(entry), contentWidth - 10) as string[];
      wrappedLines.push(...split);
    });

    const boxH = Math.max(18, 9 + wrappedLines.length * 4);
    y = ensurePdfSpace(doc, y, boxH + 6, snapshot.reportRef, watermark);

    drawTranslucentRect(
      doc,
      marginX,
      y,
      contentWidth,
      boxH,
      JDI_COLORS.CREAM_BG,
      0.85,
      JDI_COLORS.CREAM_BORDER,
      2
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...JDI_COLORS.AMBER_TITLE);
    doc.text('OFFICIAL TUTOR EVALUATION & ACADEMIC RECOMMENDATION:', marginX + 4, y + 5.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...JDI_COLORS.AMBER_BODY);
    wrappedLines.forEach((line, idx) => {
      doc.text(line, marginX + 4, y + 10.8 + idx * 3.9);
    });

    y += boxH + 4;
  }

  // Apply official Jaystarbliss contact footer across all pages
  applyFooterAcrossAllPages(doc);

  return doc;
}

/**
 * Generates and downloads an official performance report PDF using its stored `snapshot.reportRef`.
 */
export async function generateOfficialPerformanceReportPdf(
  snapshot: AcademicPerformanceReportSnapshot
): Promise<string> {
  const doc = await buildOfficialPerformanceReportPdfDoc(snapshot);
  const safeStudent = sanitizePdfText(snapshot.studentName || 'Learner')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const safeRef = sanitizePdfText(snapshot.reportRef).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeRef}_${safeStudent}_${snapshot.reportType}.pdf`;
  doc.save(filename);
  return snapshot.reportRef;
}

/**
 * Generates raw PDF bytes (`Uint8Array`) for an official performance report snapshot
 * so multiple learner reports can be bundled into a single cohort ZIP archive.
 */
export async function createOfficialPerformanceReportPdfBytes(
  snapshot: AcademicPerformanceReportSnapshot
): Promise<Uint8Array> {
  const doc = await buildOfficialPerformanceReportPdfDoc(snapshot);
  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}

/**
 * Generates and downloads a ZIP archive containing individual official PDF reports for a class,
 * school, or programme cohort, preserving each learner's permanent reference number.
 */
export async function downloadBulkOfficialReportsZip(
  snapshots: AcademicPerformanceReportSnapshot[],
  archiveBaseName = 'JDI_Official_Academic_Reports'
): Promise<number> {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error('No reports selected for bulk ZIP download.');
  }

  const zipFiles: ZipFile[] = [];
  for (const snap of snapshots) {
    const pdfBytes = await createOfficialPerformanceReportPdfBytes(snap);
    const safeStudent = sanitizePdfText(snap.studentName || 'Learner')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const safeRef = sanitizePdfText(snap.reportRef).replace(/[^a-zA-Z0-9_-]/g, '_');
    zipFiles.push({
      name: `${safeRef}_${safeStudent}_${snap.reportType}.pdf`,
      data: pdfBytes,
    });
  }

  const zipBytes = createZip(zipFiles);
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${archiveBaseName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date()
    .toISOString()
    .slice(0, 10)}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return zipFiles.length;
}
