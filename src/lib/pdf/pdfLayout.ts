import type jsPDF from 'jspdf';
import { JDI_COLORS, PDF_LAYOUT, sanitizePdfText } from './documentBranding';
import { drawInstitutionalDocumentFooter } from './pdfFooter';
import { drawTopGeometricBanner } from './pdfHeader';
import {
  drawPermanentPageWatermark,
  loadOfficialWatermarkAsset,
  type DrawWatermarkOptions,
  type LoadedWatermarkAsset,
} from './pdfWatermark';

export interface MultiPageChromeOptions {
  refNo: string;
  watermark?: DrawWatermarkOptions;
  drawSubPageBanner?: boolean;
  hideFooterCornerGeometry?: boolean;
}

export function getSafeBottomY(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - PDF_LAYOUT.FOOTER_RESERVED_HEIGHT;
}

/**
 * Prepares a fresh PDF page with an optional background fill, permanent centered watermark
 * placed strictly behind foreground elements, and an optional top geometric banner.
 */
export function preparePageBackgroundAndWatermark(
  doc: jsPDF,
  watermarkAsset: LoadedWatermarkAsset | null,
  options: {
    backgroundRgb?: readonly [number, number, number];
    watermark?: DrawWatermarkOptions;
  } = {}
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bg = options.backgroundRgb || JDI_COLORS.WHITE;
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  drawPermanentPageWatermark(doc, watermarkAsset, options.watermark);
}

/**
 * Ensures enough vertical space remains on the current page; when adding a new page,
 * paints the light paper surface and centered watermark FIRST (strictly behind foreground content),
 * draws the top geometric banner, and runs any repeating table header callback.
 */
export function ensurePdfSpace(
  doc: jsPDF,
  currentY: number,
  neededHeight: number,
  refNo: string,
  watermarkAsset: LoadedWatermarkAsset | null,
  onNewPage?: (freshY: number) => number,
  watermarkOptions?: DrawWatermarkOptions
): number {
  const limitY = getSafeBottomY(doc);
  if (currentY + neededHeight <= limitY) {
    return currentY;
  }
  doc.addPage();
  preparePageBackgroundAndWatermark(doc, watermarkAsset, { watermark: watermarkOptions });
  drawTopGeometricBanner(doc, refNo);
  const startY = PDF_LAYOUT.CONTENT_TOP_SUBPAGE_Y;
  return onNewPage ? onNewPage(startY) : startY;
}

/**
 * Applies the unified Jaystarbliss footer and pagination counter across every page.
 * Use when each page already had `preparePageBackgroundAndWatermark` called prior to foreground drawing.
 */
export function applyFooterAcrossAllPages(
  doc: jsPDF,
  options: { hideCornerGeometry?: boolean } = {}
): void {
  const totalPages = doc.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    doc.setPage(pageIndex);
    drawInstitutionalDocumentFooter(doc, {
      pageNumber: pageIndex,
      totalPages,
      hideCornerGeometry: options.hideCornerGeometry,
    });
  }
}

export async function finalizeInstitutionalDocument(
  doc: jsPDF,
  options: MultiPageChromeOptions,
  preloadedWatermark?: LoadedWatermarkAsset | null
): Promise<void> {
  const watermarkAsset =
    preloadedWatermark !== undefined ? preloadedWatermark : await loadOfficialWatermarkAsset();

  const totalPages = doc.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    doc.setPage(pageIndex);

    if (options.drawSubPageBanner && pageIndex > 1) {
      drawTopGeometricBanner(doc, options.refNo);
    }

    drawPermanentPageWatermark(doc, watermarkAsset, options.watermark);
    drawInstitutionalDocumentFooter(doc, {
      pageNumber: pageIndex,
      totalPages,
      hideCornerGeometry: options.hideFooterCornerGeometry,
    });
  }
}

/**
 * Helper to draw a subtle semi-transparent filled rectangle (e.g., table stripe or info card)
 * so the permanent background watermark remains gently visible behind translucent surfaces.
 */
export function drawTranslucentRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fillRgb: readonly [number, number, number],
  opacity = 0.72,
  borderRgb?: readonly [number, number, number],
  radius = 0
): void {
  const anyDoc = doc as any;
  const canUseGState = typeof anyDoc.GState === 'function' && typeof anyDoc.setGState === 'function';

  if (canUseGState) {
    anyDoc.saveGraphicsState?.();
    anyDoc.setGState(new anyDoc.GState({ opacity }));
  }

  doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
  if (radius > 0) {
    doc.roundedRect(x, y, w, h, radius, radius, 'F');
  } else {
    doc.rect(x, y, w, h, 'F');
  }

  if (canUseGState) {
    anyDoc.setGState(new anyDoc.GState({ opacity: 1 }));
    anyDoc.restoreGraphicsState?.();
  }

  if (borderRgb) {
    doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
    doc.setLineWidth(0.3);
    if (radius > 0) {
      doc.roundedRect(x, y, w, h, radius, radius, 'S');
    } else {
      doc.rect(x, y, w, h, 'S');
    }
  }
}

export function drawSectionHeading(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
  maxWidth: number
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  const cleanTitle = sanitizePdfText(title).toUpperCase();
  doc.text(cleanTitle, x, y, { maxWidth });
  doc.setDrawColor(...JDI_COLORS.BORDER_MID);
  doc.setLineWidth(0.35);
  doc.line(x, y + 2, x + maxWidth, y + 2);
  return y + 7;
}
