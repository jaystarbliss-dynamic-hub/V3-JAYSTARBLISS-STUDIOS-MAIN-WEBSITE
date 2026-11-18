import { jsPDF } from 'jspdf';
import {
  JDI_COLORS,
  JDI_INSTITUTION_NAME,
  PDF_LAYOUT,
  formatDocumentRefNo,
  formatShortDateDDMMYY,
  formatDisplayDateTime,
  sanitizePdfText,
  loadOfficialWatermarkAsset,
  drawInstitutionalDocumentHeader,
  preparePageBackgroundAndWatermark,
  ensurePdfSpace,
  applyFooterAcrossAllPages,
  drawTranslucentRect,
  drawSectionHeading,
} from './index';

export interface AgreementPdfInput {
  id: string;
  title: string;
  category: string;
  status: string;
  recipientType?: string;
  recipientName?: string;
  recipientSchoolName?: string;
  versionNumber?: number;
  effectiveDate?: string;
  expiryDate?: string;
  contentHtml?: string;
  acknowledgedAt?: string;
  acknowledgedByName?: string;
}

export function stripHtmlForPdf(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function createAgreementPdfDocument(data: AgreementPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  const categoryUpper = sanitizePdfText(data.category || 'AGREEMENT').toUpperCase();
  const versionNum = Number(data.versionNumber || 1);
  const statusUpper = sanitizePdfText(data.status || 'SHARED').toUpperCase();
  const shortDate = formatShortDateDDMMYY(new Date());
  const refNo = formatDocumentRefNo('JDI-AGR', `${data.id || data.title}:v${versionNum}`);

  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  let cursorY = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: JDI_INSTITUTION_NAME,
    subtitleLine: `OFFICIAL ${categoryUpper}  •  VERSION v${versionNum}  |  DATE: ${shortDate}`,
    refNo,
  });

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  const titleLines = doc.splitTextToSize(
    sanitizePdfText(data.title || 'Institutional Agreement'),
    contentWidth
  ) as string[];
  doc.text(titleLines, marginX, cursorY);
  cursorY += titleLines.length * 6.5 + 3;

  // Formal Parties & Metadata Card
  const recipientDisplay = sanitizePdfText(
    data.recipientName || data.recipientSchoolName || data.recipientType || 'Authorized Recipient'
  );
  const metaH = 26;
  drawTranslucentRect(
    doc,
    marginX,
    cursorY,
    contentWidth,
    metaH,
    JDI_COLORS.ICE_BG,
    0.85,
    JDI_COLORS.ICE_BORDER,
    2.2
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('ISSUING INSTITUTION', marginX + 5, cursorY + 6.5);
  doc.text('COUNTERPARTY / RECIPIENT', marginX + 70, cursorY + 6.5);
  doc.text('STATUS & VERSION', marginX + 142, cursorY + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text('Jaystarbliss Dynamic Institute', marginX + 5, cursorY + 12.2, { maxWidth: 60 });
  doc.text(recipientDisplay, marginX + 70, cursorY + 12.2, { maxWidth: 68 });
  doc.setTextColor(...JDI_COLORS.NAVY_ROYAL);
  doc.text(`${statusUpper} (v${versionNum})`, marginX + 142, cursorY + 12.2, { maxWidth: 34 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  doc.text(
    sanitizePdfText(
      `Effective Date: ${data.effectiveDate || 'Not specified'}   |   Expiry Date: ${
        data.expiryDate || 'Ongoing'
      }`
    ),
    marginX + 5,
    cursorY + 20.5
  );

  cursorY += metaH + 9;

  cursorY = drawSectionHeading(doc, 'Terms, Provisions & Specifications', marginX, cursorY, contentWidth);

  const plainBody = sanitizePdfText(stripHtmlForPdf(data.contentHtml || '')) || 'No content provided.';
  const paragraphs = plainBody.split(/\n+/);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(...JDI_COLORS.INK_BODY);

  paragraphs.forEach((para) => {
    const trimmed = para.trim();
    if (!trimmed) {
      cursorY += 3;
      return;
    }
    const lines = doc.splitTextToSize(trimmed, contentWidth) as string[];
    lines.forEach((line) => {
      cursorY = ensurePdfSpace(doc, cursorY, 5.4, refNo, watermarkAsset);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.2);
      doc.setTextColor(...JDI_COLORS.INK_BODY);
      doc.text(line, marginX, cursorY);
      cursorY += 5.1;
    });
    cursorY += 2.2;
  });

  // Authoritative Execution & Acknowledgment Block
  cursorY += 4;
  cursorY = ensurePdfSpace(doc, cursorY, 26, refNo, watermarkAsset);

  if (data.acknowledgedAt) {
    drawTranslucentRect(
      doc,
      marginX,
      cursorY,
      contentWidth,
      19,
      JDI_COLORS.EMERALD_BG,
      0.86,
      JDI_COLORS.EMERALD_BORDER,
      2.2
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...JDI_COLORS.EMERALD_TEXT);
    doc.text('ELECTRONIC EXECUTION & ACKNOWLEDGMENT VERIFIED', marginX + 5, cursorY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...JDI_COLORS.INK_DARK);
    doc.text(
      sanitizePdfText(
        `Acknowledged by ${data.acknowledgedByName || recipientDisplay} on ${formatDisplayDateTime(
          data.acknowledgedAt
        )}`
      ),
      marginX + 5,
      cursorY + 13.5
    );
  } else {
    drawTranslucentRect(
      doc,
      marginX,
      cursorY,
      contentWidth,
      19,
      JDI_COLORS.SOFT_TINT,
      0.78,
      JDI_COLORS.BORDER_MID,
      2.2
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.text('EXECUTION STATUS', marginX + 5, cursorY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    doc.text(
      `Current Status: ${statusUpper} — Pending digital acknowledgment inside Jaystarbliss Agreements Center.`,
      marginX + 5,
      cursorY + 13.5
    );
  }

  applyFooterAcrossAllPages(doc);
  return doc;
}

export async function generateAgreementPdf(data: AgreementPdfInput): Promise<void> {
  const doc = await createAgreementPdfDocument(data);
  const safeFile = String(data.title || 'agreement')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`${safeFile}-v${data.versionNumber || 1}.pdf`);
}
