import { jsPDF } from 'jspdf';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} from 'docx';
import {
  JDI_COLORS,
  JDI_INSTITUTION_NAME,
  PDF_LAYOUT,
  formatDocumentRefNo,
  formatShortDateDDMMYY,
  sanitizePdfText,
  loadOfficialWatermarkAsset,
  drawInstitutionalDocumentHeader,
  preparePageBackgroundAndWatermark,
  ensurePdfSpace,
  applyFooterAcrossAllPages,
  drawTranslucentRect,
  drawSectionHeading,
} from '../pdf';
import {
  DOCUMENT_CATEGORY_META,
  extractPlainTextFromHtml,
  sanitizeDocumentHtml,
  type OfficialDocumentCategory,
} from './documentTemplates';

export interface OfficialStudioExportInput {
  id?: string;
  title: string;
  category: OfficialDocumentCategory;
  contentHtml: string;
  versionNumber?: number;
  status?: string;
  dateLabel?: string;
  authorName?: string;
  recipientName?: string;
  studentName?: string;
  studentClass?: string;
  programmeName?: string;
  schoolName?: string;
  reportingPeriod?: string;
  effectiveDate?: string;
  expiryDate?: string;
}

function safeFileSlug(title: string, fallback = 'jdi-document'): string {
  const cleaned = String(title || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates an official Jaystarbliss Dynamic Institute branded A4 PDF using the
 * shared institutional letterhead, watermark, metadata block, structured rich-text renderer,
 * and pagination footer.
 */
export async function createOfficialStudioPdfDocument(
  input: OfficialStudioExportInput
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  const meta = DOCUMENT_CATEGORY_META[input.category] || DOCUMENT_CATEGORY_META.PERFORMANCE_REPORT;
  const versionNum = Number(input.versionNumber || 1);
  const shortDate = formatShortDateDDMMYY(new Date());
  const refNo = formatDocumentRefNo(meta.refPrefix, `${input.id || input.title}:v${versionNum}`);
  const statusUpper = sanitizePdfText(input.status || 'ISSUED').toUpperCase();

  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  let cursorY = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: JDI_INSTITUTION_NAME,
    subtitleLine: `${meta.pdfSubtitle}  •  v${versionNum}  |  DATE: ${shortDate}`,
    refNo,
  });

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  const titleLines = doc.splitTextToSize(
    sanitizePdfText(input.title || meta.label),
    contentWidth
  ) as string[];
  doc.text(titleLines, marginX, cursorY);
  cursorY += titleLines.length * 6.2 + 3;

  // Institutional Metadata Block
  const isReport = input.category === 'PERFORMANCE_REPORT';
  const metaH = 26;
  drawTranslucentRect(
    doc,
    marginX,
    cursorY,
    contentWidth,
    metaH,
    JDI_COLORS.ICE_BG,
    0.88,
    JDI_COLORS.ICE_BORDER,
    2.2
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(isReport ? 'LEARNER & CLASS' : 'ISSUING INSTITUTION', marginX + 5, cursorY + 6.5);
  doc.text(isReport ? 'PROGRAMME / SCHOOL' : 'RECIPIENT / COUNTERPARTY', marginX + 70, cursorY + 6.5);
  doc.text('STATUS & VERSION', marginX + 142, cursorY + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  const col1 = isReport
    ? sanitizePdfText(
        [input.studentName || 'Assigned Learner', input.studentClass].filter(Boolean).join(' • ')
      )
    : JDI_INSTITUTION_NAME;
  const col2 = isReport
    ? sanitizePdfText(
        [input.programmeName || 'Core Programme', input.schoolName].filter(Boolean).join(' — ')
      )
    : sanitizePdfText(input.recipientName || input.schoolName || 'Authorized Recipient');

  doc.text(col1, marginX + 5, cursorY + 12.2, { maxWidth: 61 });
  doc.text(col2, marginX + 70, cursorY + 12.2, { maxWidth: 68 });
  doc.setTextColor(...JDI_COLORS.NAVY_ROYAL);
  doc.text(`${statusUpper} (v${versionNum})`, marginX + 142, cursorY + 12.2, { maxWidth: 34 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.7);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  const bottomMetaLine = isReport
    ? `Prepared By: ${input.authorName || 'Faculty Tutor'}   |   Period: ${
        input.reportingPeriod || 'Current Period'
      }   |   Parent / Guardian: ${input.recipientName || 'Parent / Guardian'}`
    : `Prepared By: ${input.authorName || 'Jaystarbliss Administration'}   |   Effective: ${
        input.effectiveDate || shortDate
      }   |   Expiry: ${input.expiryDate || 'Ongoing'}`;
  doc.text(sanitizePdfText(bottomMetaLine), marginX + 5, cursorY + 20.5, {
    maxWidth: contentWidth - 10,
  });

  cursorY += metaH + 8;

  // Render Sanitized HTML Structurally
  const cleanHtml = sanitizeDocumentHtml(input.contentHtml || '');
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(cleanHtml, 'text/html');

  const renderParagraph = (
    text: string,
    opts?: { bold?: boolean; italic?: boolean; fontSize?: number; indent?: number; color?: readonly [number, number, number] }
  ) => {
    const cleaned = sanitizePdfText(text);
    if (!cleaned) return;
    const indent = opts?.indent || 0;
    const fontSize = opts?.fontSize || 9.2;
    const style =
      opts?.bold && opts?.italic
        ? 'bolditalic'
        : opts?.bold
        ? 'bold'
        : opts?.italic
        ? 'italic'
        : 'normal';
    const color = opts?.color || JDI_COLORS.INK_BODY;

    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(cleaned, contentWidth - indent) as string[];
    const lineH = fontSize * 0.54;

    lines.forEach((line) => {
      cursorY = ensurePdfSpace(doc, cursorY, lineH + 1, refNo, watermarkAsset);
      doc.setFont('helvetica', style);
      doc.setFontSize(fontSize);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(line, marginX + indent, cursorY);
      cursorY += lineH;
    });
    cursorY += 2.2;
  };

  const renderTable = (tableEl: HTMLTableElement) => {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    if (!rows.length) return;

    const maxCols = Math.max(
      1,
      ...rows.map((tr) => Array.from(tr.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH').length)
    );
    const colW = contentWidth / maxCols;

    rows.forEach((tr, rowIdx) => {
      const cells = Array.from(tr.children).filter(
        (c) => c.tagName === 'TD' || c.tagName === 'TH'
      ) as HTMLElement[];
      if (!cells.length) return;

      const isHeaderRow =
        rowIdx === 0 && (cells.every((c) => c.tagName === 'TH') || tr.parentElement?.tagName === 'THEAD');

      const cellWrapped = cells.map((cell) => {
        const txt = sanitizePdfText(cell.textContent || '');
        doc.setFont('helvetica', isHeaderRow || cell.tagName === 'TH' ? 'bold' : 'normal');
        doc.setFontSize(8.2);
        return doc.splitTextToSize(txt || '—', colW - 4) as string[];
      });

      const maxLines = Math.max(1, ...cellWrapped.map((l) => l.length));
      const rowH = Math.max(7.2, maxLines * 4.2 + 3.4);

      cursorY = ensurePdfSpace(doc, cursorY, rowH + 1, refNo, watermarkAsset);

      // Row background
      if (isHeaderRow) {
        doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
        doc.rect(marginX, cursorY, contentWidth, rowH, 'F');
      } else if (rowIdx % 2 === 1) {
        drawTranslucentRect(doc, marginX, cursorY, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.72);
      }

      // Draw cells & borders
      doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.rect(marginX, cursorY, contentWidth, rowH, 'S');

      cells.forEach((cell, colIdx) => {
        const cellX = marginX + colIdx * colW;
        if (colIdx > 0) {
          doc.line(cellX, cursorY, cellX, cursorY + rowH);
        }
        const isCellHeader = isHeaderRow || cell.tagName === 'TH';
        doc.setFont('helvetica', isCellHeader ? 'bold' : 'normal');
        doc.setFontSize(8.2);
        if (isHeaderRow) {
          doc.setTextColor(...JDI_COLORS.WHITE);
        } else if (isCellHeader) {
          doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
        } else {
          doc.setTextColor(...JDI_COLORS.INK_DARK);
        }
        const lines = cellWrapped[colIdx] || [''];
        lines.forEach((line, lIdx) => {
          doc.text(line, cellX + 2, cursorY + 4.6 + lIdx * 4.2);
        });
      });

      cursorY += rowH;
    });
    cursorY += 4.5;
  };

  const walkNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').trim();
      if (txt) renderParagraph(txt);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === 'HR') {
      if (el.getAttribute('data-page-break') === 'true') {
        doc.addPage();
        preparePageBackgroundAndWatermark(doc, watermarkAsset);
        cursorY = ensurePdfSpace(doc, PDF_LAYOUT.CONTENT_TOP_SUBPAGE_Y, 10, refNo, watermarkAsset);
        return;
      }
      cursorY = ensurePdfSpace(doc, cursorY, 6, refNo, watermarkAsset);
      doc.setDrawColor(...JDI_COLORS.BORDER_MID);
      doc.setLineWidth(0.3);
      doc.line(marginX, cursorY, marginX + contentWidth, cursorY);
      cursorY += 4.5;
      return;
    }

    if (tag === 'H1') {
      const txt = sanitizePdfText(el.textContent || '');
      if (txt && txt.toLowerCase() !== sanitizePdfText(input.title || '').toLowerCase()) {
        cursorY += 2;
        cursorY = ensurePdfSpace(doc, cursorY, 10, refNo, watermarkAsset);
        renderParagraph(txt, { bold: true, fontSize: 12.2, color: JDI_COLORS.NAVY_PRIMARY });
      }
      return;
    }

    if (tag === 'H2') {
      const txt = sanitizePdfText(el.textContent || '');
      if (txt) {
        cursorY += 2;
        cursorY = ensurePdfSpace(doc, cursorY, 12, refNo, watermarkAsset);
        cursorY = drawSectionHeading(doc, txt, marginX, cursorY, contentWidth);
      }
      return;
    }

    if (tag === 'H3' || tag === 'H4') {
      const txt = sanitizePdfText(el.textContent || '');
      if (txt) {
        cursorY += 1.5;
        renderParagraph(txt, { bold: true, fontSize: 10.2, color: JDI_COLORS.NAVY_ROYAL });
      }
      return;
    }

    if (tag === 'TABLE') {
      renderTable(el as HTMLTableElement);
      return;
    }

    if (tag === 'UL' || tag === 'OL') {
      const items = Array.from(el.children).filter((c) => c.tagName === 'LI');
      items.forEach((li, idx) => {
        const prefix = tag === 'OL' ? `${idx + 1}. ` : '• ';
        renderParagraph(`${prefix}${li.textContent || ''}`, { indent: 4, fontSize: 9.1 });
      });
      cursorY += 1.5;
      return;
    }

    if (tag === 'BLOCKQUOTE') {
      const txt = sanitizePdfText(el.textContent || '');
      if (txt) {
        cursorY = ensurePdfSpace(doc, cursorY, 10, refNo, watermarkAsset);
        const startY = cursorY - 3;
        renderParagraph(txt, { italic: true, indent: 6, color: JDI_COLORS.INK_MUTED });
        doc.setDrawColor(...JDI_COLORS.CRIMSON);
        doc.setLineWidth(0.8);
        doc.line(marginX + 2, startY, marginX + 2, cursorY - 2);
      }
      return;
    }

    if (tag === 'P' || tag === 'DIV') {
      const hasBlockChildren = Array.from(el.children).some((c) =>
        ['P', 'DIV', 'TABLE', 'UL', 'OL', 'H1', 'H2', 'H3', 'HR', 'BLOCKQUOTE'].includes(c.tagName)
      );
      if (hasBlockChildren) {
        Array.from(el.childNodes).forEach(walkNode);
      } else {
        const text = (el.innerHTML || '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
          .replace(/&rsquo;|&#39;/g, "'");
        const lines = text.split('\n');
        const isMostlyBold =
          el.querySelectorAll('strong, b').length > 0 &&
          sanitizePdfText(el.textContent || '').length < 100 &&
          el.children.length === 1;
        lines.forEach((line) => renderParagraph(line, { bold: isMostlyBold }));
      }
      return;
    }

    Array.from(el.childNodes).forEach(walkNode);
  };

  const bodyNodes = Array.from(htmlDoc.body.childNodes);
  if (bodyNodes.length === 0) {
    renderParagraph('No document content entered yet.');
  } else {
    bodyNodes.forEach(walkNode);
  }

  applyFooterAcrossAllPages(doc);
  return doc;
}

export async function exportStudioDocumentAsPdf(input: OfficialStudioExportInput): Promise<void> {
  const doc = await createOfficialStudioPdfDocument(input);
  const slug = safeFileSlug(input.title, 'jdi-official-document');
  doc.save(`${slug}-v${input.versionNumber || 1}.pdf`);
}

export async function exportStudioDocumentAsDocx(input: OfficialStudioExportInput): Promise<void> {
  const meta = DOCUMENT_CATEGORY_META[input.category] || DOCUMENT_CATEGORY_META.PERFORMANCE_REPORT;
  const cleanHtml = sanitizeDocumentHtml(input.contentHtml || '');
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(cleanHtml, 'text/html');

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: JDI_INSTITUTION_NAME,
          bold: true,
          size: 28,
          color: '1E293B',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: `${meta.pdfSubtitle} • Version v${input.versionNumber || 1}`,
          bold: true,
          size: 18,
          color: '991B1B',
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 160 },
      children: [new TextRun({ text: input.title || meta.label, bold: true, color: '0F172A' })],
    }),
  ];

  const metaPairs: Array<[string, string]> = [];
  if (input.studentName) metaPairs.push(['Learner', input.studentName]);
  if (input.studentClass) metaPairs.push(['Class / Level', input.studentClass]);
  if (input.programmeName) metaPairs.push(['Programme', input.programmeName]);
  if (input.schoolName) metaPairs.push(['School / Campus', input.schoolName]);
  if (input.recipientName) metaPairs.push(['Recipient / Parent', input.recipientName]);
  if (input.reportingPeriod) metaPairs.push(['Reporting Period', input.reportingPeriod]);
  if (input.authorName) metaPairs.push(['Prepared By', input.authorName]);
  metaPairs.push(['Date', input.dateLabel || new Date().toLocaleDateString('en-GB')]);

  if (metaPairs.length > 0) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: metaPairs.map(
          ([k, v]) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: k, bold: true, size: 19, color: '334155' })],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 70, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: v, size: 19, color: '0F172A' })],
                    }),
                  ],
                }),
              ],
            })
        ),
      })
    );
    children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
  }

  const walkToDocx = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').trim();
      if (txt) {
        children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: txt, size: 21 })] }));
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      children.push(
        new Paragraph({
          heading:
            tag === 'H1'
              ? HeadingLevel.HEADING_1
              : tag === 'H2'
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3,
          spacing: { before: 180, after: 100 },
          children: [
            new TextRun({
              text: txt,
              bold: true,
              color: tag === 'H2' ? '991B1B' : '1E293B',
            }),
          ],
        })
      );
      return;
    }

    if (tag === 'UL' || tag === 'OL') {
      Array.from(el.children)
        .filter((c) => c.tagName === 'LI')
        .forEach((li, idx) => {
          const txt = (li.textContent || '').trim();
          if (!txt) return;
          children.push(
            new Paragraph({
              indent: { left: 420 },
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: `${tag === 'OL' ? `${idx + 1}. ` : '• '}${txt}`,
                  size: 21,
                }),
              ],
            })
          );
        });
      return;
    }

    if (tag === 'TABLE') {
      const trs = Array.from(el.querySelectorAll('tr'));
      if (!trs.length) return;
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          },
          rows: trs.map((tr, rIdx) => {
            const cells = Array.from(tr.children).filter(
              (c) => c.tagName === 'TD' || c.tagName === 'TH'
            );
            const isHeader = rIdx === 0 && tr.parentElement?.tagName === 'THEAD';
            return new TableRow({
              children: cells.map(
                (cell) =>
                  new TableCell({
                    shading: isHeader
                      ? { type: ShadingType.CLEAR, fill: '1E293B' }
                      : cell.tagName === 'TH'
                      ? { type: ShadingType.CLEAR, fill: 'F8FAFC' }
                      : undefined,
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: (cell.textContent || '').trim() || '—',
                            bold: isHeader || cell.tagName === 'TH',
                            color: isHeader ? 'FFFFFF' : '0F172A',
                            size: 19,
                          }),
                        ],
                      }),
                    ],
                  })
              ),
            });
          }),
        })
      );
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }));
      return;
    }

    if (tag === 'P' || tag === 'BLOCKQUOTE') {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      children.push(
        new Paragraph({
          spacing: { after: 110 },
          children: [
            new TextRun({
              text: txt,
              italics: tag === 'BLOCKQUOTE',
              size: 21,
              color: tag === 'BLOCKQUOTE' ? '475569' : '1E293B',
            }),
          ],
        })
      );
      return;
    }

    Array.from(el.childNodes).forEach(walkToDocx);
  };

  Array.from(htmlDoc.body.childNodes).forEach(walkToDocx);

  const docxDoc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(docxDoc);
  const slug = safeFileSlug(input.title, 'jdi-official-document');
  triggerBlobDownload(blob, `${slug}-v${input.versionNumber || 1}.docx`);
}

export function exportStudioDocumentAsHtml(input: OfficialStudioExportInput): void {
  const meta = DOCUMENT_CATEGORY_META[input.category] || DOCUMENT_CATEGORY_META.PERFORMANCE_REPORT;
  const cleanBody = sanitizeDocumentHtml(input.contentHtml || '');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${input.title || meta.label} — ${JDI_INSTITUTION_NAME}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 32px; }
    .page { max-width: 794px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; padding: 48px 56px; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06); }
    .letterhead { border-bottom: 3px solid #991b1b; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 0.04em; }
    .subtitle { font-size: 11px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
    h1 { font-size: 20px; color: #0f172a; margin: 0 0 12px; }
    h2 { font-size: 14px; color: #991b1b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-top: 22px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    hr[data-page-break="true"] { page-break-after: always; border: none; border-top: 1px dashed #cbd5e1; margin: 24px 0; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="page">
    <div class="letterhead">
      <div>
        <div class="brand">${JDI_INSTITUTION_NAME}</div>
        <div class="subtitle">${meta.pdfSubtitle}</div>
      </div>
      <div style="font-size:11px;color:#475569;text-align:right;">
        <div>Version v${input.versionNumber || 1}</div>
        <div>${input.dateLabel || new Date().toLocaleDateString('en-GB')}</div>
      </div>
    </div>
    ${cleanBody}
    <div class="footer">
      <span>${JDI_INSTITUTION_NAME} • Official Portal Document</span>
      <span>Confidential Institutional Record</span>
    </div>
  </div>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const slug = safeFileSlug(input.title, 'jdi-official-document');
  triggerBlobDownload(blob, `${slug}-v${input.versionNumber || 1}.html`);
}

export function exportStudioDocumentAsTxt(input: OfficialStudioExportInput): void {
  const meta = DOCUMENT_CATEGORY_META[input.category] || DOCUMENT_CATEGORY_META.PERFORMANCE_REPORT;
  const plain = [
    JDI_INSTITUTION_NAME,
    meta.pdfSubtitle,
    '='.repeat(64),
    `Title: ${input.title || meta.label}`,
    input.studentName ? `Learner: ${input.studentName}` : '',
    input.programmeName ? `Programme: ${input.programmeName}` : '',
    input.schoolName ? `School: ${input.schoolName}` : '',
    input.authorName ? `Prepared By: ${input.authorName}` : '',
    `Version: v${input.versionNumber || 1}`,
    `Date: ${input.dateLabel || new Date().toLocaleDateString('en-GB')}`,
    '='.repeat(64),
    '',
    extractPlainTextFromHtml(input.contentHtml || ''),
  ]
    .filter((line, idx) => line !== '' || idx > 8)
    .join('\n');

  const blob = new Blob([plain], { type: 'text/plain;charset=utf-8' });
  const slug = safeFileSlug(input.title, 'jdi-official-document');
  triggerBlobDownload(blob, `${slug}-v${input.versionNumber || 1}.txt`);
}
