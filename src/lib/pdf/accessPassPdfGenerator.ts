import { jsPDF } from 'jspdf';
import {
  JDI_COLORS,
  JDI_CONTACTS,
  PDF_LAYOUT,
  formatDocumentRefNo,
  formatLongDate,
  formatShortDateDDMMYY,
  sanitizePdfText,
  resolveDocumentIdentity,
  loadOfficialWatermarkAsset,
  drawInstitutionalDocumentHeader,
  preparePageBackgroundAndWatermark,
  applyFooterAcrossAllPages,
  drawTranslucentRect,
} from './index';

export interface AccessPassPdfInput {
  studentId?: string;
  studentName: string;
  username: string;
  accessCode: string;
  portalUrl?: string;
  className?: string;
  schoolId?: string;
  schoolName?: string;
  enrolmentType?: string;
  parentId?: string;
  parentName?: string;
}

export async function createAccessPassPdfDocument(data: AccessPassPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  const identity = resolveDocumentIdentity({
    schoolId: data.schoolId,
    schoolName: data.schoolName,
    enrolmentType: data.enrolmentType,
    parentId: data.parentId,
    parentName: data.parentName,
  });

  const shortDate = formatShortDateDDMMYY(new Date());
  const refNo = formatDocumentRefNo(
    'JDI-ID',
    data.studentId || `${data.username}:${data.studentName}`
  );
  const portalUrl = sanitizePdfText(data.portalUrl || `https://${JDI_CONTACTS.portalUrl}`);
  const studentName = sanitizePdfText(data.studentName || 'Student');
  const className = sanitizePdfText(data.className || 'General');

  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  let cursorY = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: identity.headerTitle,
    subtitleLine: `OFFICIAL STUDENT PORTAL ACCESS PASS  |  DATE: ${shortDate}`,
    refNo,
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  doc.text(
    'Official student authentication credential for the Jaystarbliss Dynamic Institute Learning Portal.',
    marginX,
    cursorY
  );
  cursorY += 8;

  // Credential Card
  const cardH = 88;
  drawTranslucentRect(
    doc,
    marginX,
    cursorY,
    contentWidth,
    cardH,
    JDI_COLORS.ICE_BG,
    0.82,
    JDI_COLORS.ICE_BORDER,
    3
  );

  // Top Band inside card
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.roundedRect(marginX, cursorY, contentWidth, 10, 2, 2, 'F');
  doc.rect(marginX, cursorY + 5, contentWidth, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...JDI_COLORS.WHITE);
  doc.text('AUTHORIZED LEARNER PORTAL CREDENTIALS', marginX + 6, cursorY + 6.6);

  const leftColX = marginX + 8;
  const rightColX = marginX + contentWidth * 0.54;

  // Row 1: Student Name & Class
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('STUDENT FULL NAME', leftColX, cursorY + 20);
  doc.text('CLASS / LEVEL', rightColX, cursorY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text(studentName, leftColX, cursorY + 26.5, { maxWidth: contentWidth * 0.48 });
  doc.text(className, rightColX, cursorY + 26.5, { maxWidth: contentWidth * 0.4 });

  // Row 2: Enrolment / School
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(identity.isSchoolDocument ? 'PARTNER SCHOOL' : 'ENROLMENT CLASSIFICATION', leftColX, cursorY + 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  doc.text(
    sanitizePdfText(identity.isSchoolDocument ? identity.schoolName : identity.enrolmentLabel),
    leftColX,
    cursorY + 42.5,
    { maxWidth: contentWidth - 16 }
  );

  // Divider inside card
  doc.setDrawColor(...JDI_COLORS.ICE_BORDER);
  doc.setLineWidth(0.3);
  doc.line(leftColX, cursorY + 48, marginX + contentWidth - 8, cursorY + 48);

  // Row 3: Username & Access Code
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('PORTAL USERNAME', leftColX, cursorY + 56);
  doc.text('ACCESS PASSCODE', rightColX, cursorY + 56);

  doc.setFont('courier', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(sanitizePdfText(data.username || 'student'), leftColX, cursorY + 63.5, {
    maxWidth: contentWidth * 0.48,
  });

  doc.setTextColor(...JDI_COLORS.CRIMSON);
  doc.text(sanitizePdfText(data.accessCode || '—'), rightColX, cursorY + 63.5, {
    maxWidth: contentWidth * 0.4,
  });

  // Row 4: Portal URL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('PORTAL SIGN-IN URL:', leftColX, cursorY + 75);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...JDI_COLORS.NAVY_ROYAL);
  doc.text(portalUrl, leftColX, cursorY + 80.5, { maxWidth: contentWidth - 16 });

  cursorY += cardH + 10;

  // Security Notice
  drawTranslucentRect(
    doc,
    marginX,
    cursorY,
    contentWidth,
    24,
    JDI_COLORS.CREAM_BG,
    0.85,
    JDI_COLORS.CREAM_BORDER,
    2.2
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...JDI_COLORS.AMBER_TITLE);
  doc.text('CONFIDENTIAL SECURITY NOTICE:', marginX + 5, cursorY + 6.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...JDI_COLORS.AMBER_BODY);
  doc.text(
    'Keep this access code strictly private. Do not share your passcode with unauthorized persons.',
    marginX + 5,
    cursorY + 12.5
  );
  doc.text(
    `Issued on ${formatLongDate(new Date())}. Contact your school coordinator or tutor if a code rotation is needed.`,
    marginX + 5,
    cursorY + 17.5
  );

  applyFooterAcrossAllPages(doc);
  return doc;
}

export async function generateAccessPassPdf(data: AccessPassPdfInput): Promise<void> {
  const doc = await createAccessPassPdfDocument(data);
  const slug = (data.studentName || 'student').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${slug}-access-pass.pdf`);
}
