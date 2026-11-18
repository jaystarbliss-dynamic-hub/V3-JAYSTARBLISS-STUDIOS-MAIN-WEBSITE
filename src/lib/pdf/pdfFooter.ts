import type jsPDF from 'jspdf';
import { JDI_COLORS, JDI_CONTACTS, PDF_LAYOUT } from './documentBranding';

export interface InstitutionalFooterOptions {
  pageNumber: number;
  totalPages: number;
  hideCornerGeometry?: boolean;
}

function drawEnvelopeIcon(doc: jsPDF, cx: number, cy: number, r: number): void {
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.circle(cx, cy, r, 'F');
  doc.setDrawColor(...JDI_COLORS.WHITE);
  doc.setLineWidth(0.32);
  const w = r * 1.15;
  const h = r * 0.82;
  doc.rect(cx - w / 2, cy - h / 2, w, h, 'S');
  doc.line(cx - w / 2, cy - h / 2, cx, cy + 0.25);
  doc.line(cx + w / 2, cy - h / 2, cx, cy + 0.25);
}

function drawBrandEmblemIcon(doc: jsPDF, cx: number, cy: number, r: number): void {
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.circle(cx, cy, r, 'F');
  doc.setDrawColor(...JDI_COLORS.WHITE);
  doc.setLineWidth(0.28);
  doc.circle(cx, cy, r * 0.78, 'S');
  doc.setFont('times', 'bold');
  doc.setFontSize(5.4);
  doc.setTextColor(...JDI_COLORS.WHITE);
  doc.text('J', cx, cy + 0.9, { align: 'center' });
}

function drawGlobeIcon(doc: jsPDF, cx: number, cy: number, r: number): void {
  doc.setDrawColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.setLineWidth(0.35);
  doc.circle(cx, cy, r, 'S');
  // Equator
  doc.line(cx - r, cy, cx + r, cy);
  // Latitude arcs
  doc.line(cx - r * 0.8, cy - r * 0.45, cx + r * 0.8, cy - r * 0.45);
  doc.line(cx - r * 0.8, cy + r * 0.45, cx + r * 0.8, cy + r * 0.45);
  // Meridian ellipse approximation
  doc.ellipse(cx, cy, r * 0.48, r, 'S');
}

/**
 * Draws the bottom-right navy faceted polygon corner accent complementing the top header.
 */
export function drawBottomRightGeometricCorner(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const anyDoc = doc as any;

  if (typeof anyDoc.triangle !== 'function') return;

  // Steel-blue outer corner wedge
  doc.setFillColor(...JDI_COLORS.NAVY_STEEL);
  anyDoc.triangle(
    pageWidth - 68,
    pageHeight,
    pageWidth - 34,
    pageHeight - 20,
    pageWidth,
    pageHeight,
    'F'
  );
  anyDoc.triangle(
    pageWidth - 34,
    pageHeight - 20,
    pageWidth,
    pageHeight - 20,
    pageWidth,
    pageHeight,
    'F'
  );

  // Obsidian-navy crisp central polygon
  doc.setFillColor(...JDI_COLORS.NAVY_DEEP);
  anyDoc.triangle(
    pageWidth - 46,
    pageHeight,
    pageWidth - 28,
    pageHeight - 18,
    pageWidth - 10,
    pageHeight,
    'F'
  );

  // Primary navy outer right edge
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  anyDoc.triangle(
    pageWidth - 24,
    pageHeight,
    pageWidth,
    pageHeight - 21,
    pageWidth,
    pageHeight,
    'F'
  );
}

/**
 * Draws the unified Jaystarbliss contact footer, subtle pagination counter,
 * and bottom-right navy geometric corner on a PDF page.
 */
export function drawInstitutionalDocumentFooter(
  doc: jsPDF,
  options: InstitutionalFooterOptions
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  if (!options.hideCornerGeometry) {
    drawBottomRightGeometricCorner(doc);
  }

  const footerY = pageHeight - 13;
  const iconR = 2.05;

  // Contact items positioned cleanly within the safe horizontal zone (x: 15..144 on portrait A4)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...JDI_COLORS.INK_DARK);

  const emailIconX = PDF_LAYOUT.MARGIN_X + iconR;
  drawEnvelopeIcon(doc, emailIconX, footerY - 0.7, iconR);
  const emailTextX = emailIconX + iconR + 1.6;
  doc.text(JDI_CONTACTS.email, emailTextX, footerY);

  const handleIconX = emailTextX + doc.getTextWidth(JDI_CONTACTS.email) + 5.5;
  drawBrandEmblemIcon(doc, handleIconX, footerY - 0.7, iconR);
  const handleTextX = handleIconX + iconR + 1.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text(JDI_CONTACTS.handle, handleTextX, footerY);

  const webIconX = handleTextX + doc.getTextWidth(JDI_CONTACTS.handle) + 5.5;
  drawGlobeIcon(doc, webIconX, footerY - 0.7, iconR);
  const webTextX = webIconX + iconR + 1.6;
  doc.text(JDI_CONTACTS.website, webTextX, footerY);

  // Subtle pagination indicator on the bottom-left clear of the right geometric corner
  if (options.totalPages >= 1) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...JDI_COLORS.INK_LIGHT);
    doc.text(
      `Page ${options.pageNumber} of ${options.totalPages}`,
      PDF_LAYOUT.MARGIN_X,
      pageHeight - 5.5
    );
  }

  // Keep pageWidth referenced for callers / future landscape alignment checks
  void pageWidth;
}
