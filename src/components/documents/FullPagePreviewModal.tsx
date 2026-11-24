import React from 'react';
import { X, FileDown, FileText, Printer } from 'lucide-react';
import {
  DOCUMENT_CATEGORY_META,
  extractPlainTextFromHtml,
  sanitizeDocumentHtml,
  type OfficialDocumentCategory,
} from '../../lib/documents/documentTemplates';
import {
  exportStudioDocumentAsDocx,
  exportStudioDocumentAsPdf,
  type OfficialStudioExportInput,
} from '../../lib/documents/documentExporter';
import { JDI_INSTITUTION_NAME, formatDocumentRefNo } from '../../lib/pdf/documentBranding';
import { OfficialA4PageFrame } from './OfficialA4PageFrame';

interface FullPagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentData: OfficialStudioExportInput;
}

export const FullPagePreviewModal: React.FC<FullPagePreviewModalProps> = ({
  isOpen,
  onClose,
  documentData,
}) => {
  if (!isOpen) return null;

  const category: OfficialDocumentCategory = documentData.category || 'PERFORMANCE_REPORT';
  const meta = DOCUMENT_CATEGORY_META[category];
  const cleanHtml = sanitizeDocumentHtml(documentData.contentHtml || '');
  const dateDisplay =
    documentData.dateLabel ||
    new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  const refNo = formatDocumentRefNo(
    meta.refPrefix,
    documentData.id || documentData.title || meta.shortLabel
  );

  const plainWords = extractPlainTextFromHtml(cleanHtml)
    .split(/\s+/)
    .filter(Boolean).length;
  const totalPages = Math.max(1, Math.ceil(plainWords / 420));

  const metadataItems =
    category === 'PERFORMANCE_REPORT'
      ? [
          {
            label: 'Learner',
            value:
              [documentData.studentName || 'Assigned Learner', documentData.studentClass]
                .filter(Boolean)
                .join(' • ') || 'Assigned Learner',
          },
          {
            label: 'Programme / Campus',
            value:
              [documentData.programmeName, documentData.schoolName].filter(Boolean).join(' — ') ||
              'Jaystarbliss Programme',
          },
          {
            label: 'Prepared By',
            value: documentData.authorName || 'Jaystarbliss Faculty',
          },
          {
            label: 'Date & Period',
            value: [documentData.reportingPeriod, dateDisplay].filter(Boolean).join(' • '),
          },
        ]
      : [
          {
            label: 'Document Category',
            value: meta.shortLabel,
          },
          {
            label: 'Recipient / Institution',
            value:
              documentData.recipientName || documentData.schoolName || 'Authorized Recipient',
          },
          {
            label: 'Prepared By',
            value: documentData.authorName || JDI_INSTITUTION_NAME,
          },
          {
            label: 'Date Issued',
            value: documentData.effectiveDate || dateDisplay,
          },
        ];

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Full-page A4 document preview"
    >
      {/* Top Preview Bar */}
      <div className="px-4 sm:px-6 py-3 bg-[#0C2340] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 text-white">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">
            Official A4 Printout Preview — {documentData.title || meta.label}
          </p>
          <p className="text-xs text-slate-300">
            {meta.label} · REF: {refNo} · Version v{documentData.versionNumber || 1}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void exportStudioDocumentAsPdf(documentData)}
            className="px-3 py-1.5 rounded-lg bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <FileDown size={14} />
            <span>Download Official PDF</span>
          </button>
          <button
            type="button"
            onClick={() => void exportStudioDocumentAsDocx(documentData)}
            className="hidden sm:inline-flex px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold items-center gap-1.5"
          >
            <FileText size={14} />
            <span>DOCX</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:inline-flex px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold items-center gap-1.5"
          >
            <Printer size={14} />
            <span>Print</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Scrollable A4 Sheet Container using OfficialA4PageFrame */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-200/90 dark:bg-[#09090B]">
        <OfficialA4PageFrame
          institutionTitle={JDI_INSTITUTION_NAME}
          subtitleLine={`${meta.pdfSubtitle} • ${dateDisplay.toUpperCase()}`}
          refNo={refNo}
          dateLabel={dateDisplay}
          versionNumber={documentData.versionNumber || 1}
          statusLabel={documentData.status}
          pageNumber={1}
          totalPages={totalPages}
          metadataItems={metadataItems}
        >
          <article
            className="jdi-document-prose max-w-none text-sm leading-relaxed text-slate-800 [&_h1]:text-lg [&_h1]:sm:text-xl [&_h1]:font-black [&_h1]:text-[#0C2340] [&_h1]:mb-3 [&_h2]:text-sm [&_h2]:font-extrabold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-[#0C2340] [&_h2]:border-b-2 [&_h2]:border-[#0C2340]/20 [&_h2]:pb-1 [&_h2]:mt-5 [&_h2]:mb-2.5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-[#991B1B] [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3.5 [&_table]:text-xs [&_th]:border [&_th]:border-slate-300 [&_th]:bg-[#0C2340] [&_th]:text-white [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_blockquote]:border-l-4 [&_blockquote]:border-[#991B1B] [&_blockquote]:bg-slate-50 [&_blockquote]:px-3.5 [&_blockquote]:py-2.5 [&_blockquote]:rounded-r-lg [&_blockquote]:italic [&_blockquote]:text-slate-700 [&_hr]:my-5 [&_hr]:border-slate-300"
            dangerouslySetInnerHTML={{ __html: cleanHtml }}
          />
        </OfficialA4PageFrame>
      </div>
    </div>
  );
};

export default FullPagePreviewModal;
