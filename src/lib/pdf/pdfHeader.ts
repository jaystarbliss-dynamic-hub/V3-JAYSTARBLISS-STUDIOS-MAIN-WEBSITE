import type jsPDF from 'jspdf';
import { JDI_COLORS, JDI_INSTITUTION_NAME, PDF_LAYOUT, sanitizePdfText } from './documentBranding';

export interface InstitutionalHeaderOptions {
  institutionTitle?: string;
  subtitleLine: string;
  refNo: string;
  compactContinuation?: boolean;
}

/**
 * Draws the official Jaystarbliss faceted navy geometric banner at the top of a portrait A4 page.
 * Matches the diagonal layered polygons and right-aligned REF NO design reference.
 */
export function drawTopGeometricBanner(doc: jsPDF, refNo: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const bannerHeight = PDF_LAYOUT.HEADER_BANNER_HEIGHT;
  const anyDoc = doc as any;

  // Base full-width navy band
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  // Layered faceted geometric polygons on the upper-left corner
  if (typeof anyDoc.triangle === 'function') {
    // Steel-blue wide diagonal facet extending slightly below the main band
    doc.setFillColor(...JDI_COLORS.NAVY_STEEL);
    anyDoc.triangle(0, 0, 74, 0, 38, bannerHeight + 8, 'F');
    anyDoc.triangle(0, 0, 38, bannerHeight + 8, 0, bannerHeight + 8, 'F');

    // Obsidian-navy crisp foreground facet
    doc.setFillColor(...JDI_COLORS.NAVY_DEEP);
    anyDoc.triangle(0, 0, 42, 0, 0, bannerHeight + 12, 'F');

    // Subtle steel diagonal wedge on lower-left corner edge
    doc.setFillColor(...JDI_COLORS.NAVY_STEEL);
    anyDoc.triangle(0, bannerHeight - 6, 44, bannerHeight + 8, 0, bannerHeight + 8, 'F');

    // Sharp navy inner bevel
    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    anyDoc.triangle(18, 12, 74, 0, 38, bannerHeight + 8, 'F');
  } else {
    doc.setFillColor(...JDI_COLORS.NAVY_STEEL);
    doc.rect(0, 0, 48, bannerHeight + 6, 'F');
  }

  // Right-aligned REF NO in crisp white
  const cleanRef = sanitizePdfText(refNo || 'JDI-OFFICIAL');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...JDI_COLORS.WHITE);
  doc.text(`REF NO: ${cleanRef}`, pageWidth - PDF_LAYOUT.MARGIN_X, 12.5, { align: 'right' });

  return bannerHeight + 8;
}

/**
 * Draws the official first-page banner, centered institutional title (auto-sized for long school names),
 * and centered classification / session / date subtitle. Returns the Y coordinate where content begins.
 */
export function drawInstitutionalDocumentHeader(
  doc: jsPDF,
  options: InstitutionalHeaderOptions
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  const afterBannerY = drawTopGeometricBanner(doc, options.refNo);
  if (options.compactContinuation) {
    return afterBannerY + 2;
  }

  const rawTitle = sanitizePdfText(options.institutionTitle || JDI_INSTITUTION_NAME)
    .trim()
    .toUpperCase();

  // Dynamic font sizing so short and very long school names fit cleanly without truncation
  let titleFontSize = 18.5;
  if (rawTitle.length > 52) {
    titleFontSize = 14;
  } else if (rawTitle.length > 38) {
    titleFontSize = 16;
  } else if (rawTitle.length > 30) {
    titleFontSize = 17;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  doc.setTextColor(...JDI_COLORS.INK_DARK);

  const maxTitleWidth = pageWidth - 36;
  const titleLines = doc.splitTextToSize(rawTitle, maxTitleWidth) as string[];
  const titleStartY = afterBannerY + 9;
  const lineAdvance = titleFontSize * 0.42;

  titleLines.forEach((line, idx) => {
    doc.text(line, centerX, titleStartY + idx * lineAdvance, { align: 'center' });
  });

  const subtitleY = titleStartY + (titleLines.length - 1) * lineAdvance + 7.5;
  const subtitle = sanitizePdfText(options.subtitleLine).trim().toUpperCase();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  const subtitleLines = doc.splitTextToSize(subtitle, pageWidth - 28) as string[];
  subtitleLines.forEach((line, idx) => {
    doc.text(line, centerX, subtitleY + idx * 4.5, { align: 'center' });
  });

  return subtitleY + subtitleLines.length * 4.5 + 8;
}
