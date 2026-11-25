import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import {
  Eye,
  FileDown,
  History,
  Save,
  Send,
  CheckCircle2,
  Loader2,
  ChevronDown,
  FileText,
  Code2,
  FileType,
  LayoutTemplate,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { JDI_INSTITUTION_NAME, formatDocumentRefNo } from '../../lib/pdf/documentBranding';
import {
  DOCUMENT_CATEGORY_META,
  buildTemplateForCategory,
  extractPlainTextFromHtml,
  sanitizeDocumentHtml,
  type DocumentTemplateContext,
  type DocumentVersionSnapshot,
  type OfficialDocumentCategory,
} from '../../lib/documents/documentTemplates';
import {
  exportStudioDocumentAsDocx,
  exportStudioDocumentAsHtml,
  exportStudioDocumentAsPdf,
  exportStudioDocumentAsTxt,
  type OfficialStudioExportInput,
} from '../../lib/documents/documentExporter';
import { DocumentRibbon } from './DocumentRibbon';
import {
  OfficialA4PageFrame,
  measureAndPaginateA4Blocks,
  type PaperMarginPreset,
} from './OfficialA4PageFrame';
import { TemplateSelector } from './TemplateSelector';
import { FullPagePreviewModal } from './FullPagePreviewModal';
import { VersionHistoryModal } from './VersionHistoryModal';

export interface DocumentStudioProps {
  title: string;
  onTitleChange: (next: string) => void;
  contentHtml: string;
  onContentChange: (nextHtml: string) => void;
  category: OfficialDocumentCategory;
  allowedCategories?: OfficialDocumentCategory[];
  onCategoryChange?: (next: OfficialDocumentCategory) => void;
  templateContext?: DocumentTemplateContext;
  versionNumber?: number;
  versions?: DocumentVersionSnapshot[];
  statusLabel?: string;
  authorName?: string;
  recipientName?: string;
  studentName?: string;
  studentClass?: string;
  programmeName?: string;
  schoolName?: string;
  reportingPeriod?: string;
  effectiveDate?: string;
  expiryDate?: string;
  documentId?: string;
  onSaveDraft?: (html: string) => Promise<void>;
  onAutosave?: (html: string) => Promise<void>;
  onPrimarySubmit?: (html: string) => Promise<void>;
  primarySubmitLabel?: string;
  saveDraftLabel?: string;
  isBusy?: boolean;
  compact?: boolean;
  headerSlot?: React.ReactNode;
}

export const DocumentStudio: React.FC<DocumentStudioProps> = ({
  title,
  onTitleChange,
  contentHtml,
  onContentChange,
  category,
  allowedCategories = ['PERFORMANCE_REPORT'],
  onCategoryChange,
  templateContext,
  versionNumber = 1,
  versions = [],
  statusLabel = 'DRAFT',
  authorName,
  recipientName,
  studentName,
  studentClass,
  programmeName,
  schoolName,
  reportingPeriod,
  effectiveDate,
  expiryDate,
  documentId,
  onSaveDraft,
  onAutosave,
  onPrimarySubmit,
  primarySubmitLabel = 'Send Official Document',
  saveDraftLabel = 'Save Draft',
  isBusy = false,
  compact = false,
  headerSlot,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [paperTheme, setPaperTheme] = useState<'light' | 'dark'>('light');
  const [marginPreset, setMarginPreset] = useState<PaperMarginPreset>('normal');
  const [showMarginGuides, setShowMarginGuides] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [measuredPageCount, setMeasuredPageCount] = useState<number>(1);
  const autosaveTimerRef = useRef<number | null>(null);
  const paginationRafRef = useRef<number | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const lastExternalHtmlRef = useRef<string>(contentHtml);

  const getMountedProseMirrorDom = (): HTMLElement | null => {
    return (editorContainerRef.current?.querySelector('.ProseMirror') as HTMLElement | null) || null;
  };

  const schedulePaginationMeasurement = () => {
    if (paginationRafRef.current) {
      window.cancelAnimationFrame(paginationRafRef.current);
    }
    paginationRafRef.current = window.requestAnimationFrame(() => {
      const domEl = getMountedProseMirrorDom();
      if (!domEl) return;
      const { totalPages } = measureAndPaginateA4Blocks(domEl);
      setMeasuredPageCount((prev) => (prev === totalPages ? prev : totalPages));
    });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder:
          'Start drafting your official Jaystarbliss document here, or open the Template Gallery above...',
      }),
    ],
    content: sanitizeDocumentHtml(contentHtml || ''),
    onCreate: () => {
      schedulePaginationMeasurement();
    },
    onUpdate: ({ editor: ed }) => {
      schedulePaginationMeasurement();
      const nextHtml = sanitizeDocumentHtml(ed.getHTML());
      lastExternalHtmlRef.current = nextHtml;
      onContentChange(nextHtml);

      if (onAutosave) {
        setAutosaveState('saving');
        if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = window.setTimeout(async () => {
          try {
            await onAutosave(nextHtml);
            setAutosaveState('saved');
            setLastSavedTime(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
          } catch {
            setAutosaveState('idle');
          }
        }, 2200);
      }
    },
    editorProps: {
      attributes: {
        class:
          'focus:outline-none min-h-[780px] text-sm leading-relaxed text-[#0F172A] [&_h1]:text-lg [&_h1]:sm:text-xl [&_h1]:font-black [&_h1]:text-[#0C2340] [&_h1]:mb-3 [&_h2]:text-sm [&_h2]:font-extrabold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-[#0C2340] [&_h2]:border-b-2 [&_h2]:border-[#0C2340]/20 [&_h2]:pb-1 [&_h2]:mt-5 [&_h2]:mb-2.5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-[#991B1B] [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:mb-2.5 [&_p]:text-[#0F172A] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_li]:text-[#0F172A] [&_table]:w-full [&_table]:border-collapse [&_table]:my-3.5 [&_table]:text-xs [&_th]:border [&_th]:border-slate-300 [&_th]:bg-[#0C2340] [&_th]:text-white [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_td]:text-[#0F172A] [&_blockquote]:border-l-4 [&_blockquote]:border-[#991B1B] [&_blockquote]:bg-slate-50 [&_blockquote]:px-3.5 [&_blockquote]:py-2.5 [&_blockquote]:rounded-r-lg [&_blockquote]:italic [&_blockquote]:text-[#0F172A] [&_hr]:my-5 [&_hr]:border-slate-300 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-3',
      },
    },
  });

  // Sync external content swaps (e.g., loading a different draft or clicking template)
  useEffect(() => {
    if (!editor) return;
    const sanitized = sanitizeDocumentHtml(contentHtml || '');
    if (sanitized !== lastExternalHtmlRef.current) {
      lastExternalHtmlRef.current = sanitized;
      editor.commands.setContent(sanitized, { emitUpdate: false });
      schedulePaginationMeasurement();
    }
  }, [contentHtml, editor]);

  // Re-measure A4 pagination when margins, fonts, images, or layout resize change
  useEffect(() => {
    const containerEl = editorContainerRef.current;
    if (!containerEl) return;
    schedulePaginationMeasurement();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => schedulePaginationMeasurement())
        : null;
    resizeObserver?.observe(containerEl);

    const handleImageLoad = (e: Event) => {
      if ((e.target as HTMLElement)?.tagName === 'IMG') {
        schedulePaginationMeasurement();
      }
    };
    containerEl.addEventListener('load', handleImageLoad, true);

    if (typeof document !== 'undefined' && 'fonts' in document) {
      void (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() =>
        schedulePaginationMeasurement()
      );
    }

    return () => {
      resizeObserver?.disconnect();
      containerEl.removeEventListener('load', handleImageLoad, true);
    };
  }, [editor, marginPreset]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      if (paginationRafRef.current) window.cancelAnimationFrame(paginationRafRef.current);
    };
  }, []);

  const meta = DOCUMENT_CATEGORY_META[category] || DOCUMENT_CATEGORY_META.PERFORMANCE_REPORT;

  const refNo = useMemo(
    () => formatDocumentRefNo(meta.refPrefix, documentId || title || meta.shortLabel),
    [meta.refPrefix, documentId, title, meta.shortLabel]
  );

  const mergedTemplateContext: DocumentTemplateContext = useMemo(
    () => ({
      studentName,
      studentClass,
      programmeName,
      schoolName,
      tutorName: authorName,
      parentName: recipientName,
      recipientName,
      reportingPeriod,
      effectiveDate,
      ...templateContext,
    }),
    [
      studentName,
      studentClass,
      programmeName,
      schoolName,
      authorName,
      recipientName,
      reportingPeriod,
      effectiveDate,
      templateContext,
    ]
  );

  const currentExportPayload = (): OfficialStudioExportInput => ({
    id: documentId,
    title: title || meta.label,
    category,
    contentHtml: sanitizeDocumentHtml(editor ? editor.getHTML() : contentHtml),
    versionNumber,
    status: statusLabel,
    authorName,
    recipientName,
    studentName,
    studentClass,
    programmeName,
    schoolName,
    reportingPeriod,
    effectiveDate,
    expiryDate,
  });

  const handleLoadDefaultCategoryTemplate = () => {
    const html = buildTemplateForCategory(category, mergedTemplateContext);
    lastExternalHtmlRef.current = html;
    editor?.commands.setContent(html, { emitUpdate: false });
    schedulePaginationMeasurement();
    onContentChange(html);
  };

  const handleExport = async (format: 'pdf' | 'docx' | 'html' | 'txt') => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const payload = currentExportPayload();
      if (format === 'pdf') await exportStudioDocumentAsPdf(payload);
      else if (format === 'docx') await exportStudioDocumentAsDocx(payload);
      else if (format === 'html') exportStudioDocumentAsHtml(payload);
      else exportStudioDocumentAsTxt(payload);
    } finally {
      setExporting(false);
    }
  };

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Live Word & Character Count + Physical DOM-Measured A4 Page Count
  const { wordCount, charCount } = useMemo(() => {
    const rawHtml = editor ? editor.getHTML() : contentHtml;
    const text = extractPlainTextFromHtml(rawHtml);
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    return { wordCount: words, charCount: chars };
  }, [editor, contentHtml]);
  const estimatedPages = Math.max(1, measuredPageCount);

  const metadataItems = useMemo(() => {
    if (category === 'PERFORMANCE_REPORT') {
      return [
        {
          label: 'Learner',
          value:
            [studentName || 'Assigned Learner', studentClass].filter(Boolean).join(' • ') ||
            'Assigned Learner',
        },
        {
          label: 'Programme / Campus',
          value:
            [programmeName, schoolName].filter(Boolean).join(' — ') ||
            'Jaystarbliss Core Programme',
        },
        {
          label: 'Prepared By',
          value: authorName || 'Jaystarbliss Faculty',
        },
        {
          label: 'Date & Period',
          value: [reportingPeriod, todayLabel].filter(Boolean).join(' • '),
        },
      ];
    }
    return [
      {
        label: 'Document Category',
        value: meta.shortLabel,
      },
      {
        label: 'Recipient / Institution',
        value: recipientName || schoolName || 'Authorized Recipient',
      },
      {
        label: 'Prepared By',
        value: authorName || JDI_INSTITUTION_NAME,
      },
      {
        label: 'Date Issued',
        value: effectiveDate || todayLabel,
      },
    ];
  }, [
    category,
    studentName,
    studentClass,
    programmeName,
    schoolName,
    authorName,
    reportingPeriod,
    todayLabel,
    meta.shortLabel,
    recipientName,
    effectiveDate,
  ]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden flex flex-col shadow-sm">
      {/* Top Studio Header Bar (Jaystarbliss Navy & Crimson Chrome) */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340] text-white flex items-center justify-center shrink-0">
            <FileText size={16} />
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={`Enter ${meta.shortLabel} title...`}
            className="flex-1 min-w-[200px] text-sm sm:text-base font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-zinc-700 focus:border-[#991B1B] focus:outline-none py-0.5"
          />

          {allowedCategories.length > 1 && onCategoryChange ? (
            <select
              aria-label="Document assignment category"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value as OfficialDocumentCategory)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-xs font-bold text-[#0C2340] dark:text-zinc-200 focus:outline-none focus:border-[#991B1B]"
            >
              {allowedCategories.map((cat) => (
                <option key={cat} value={cat}>
                  Assign as: {DOCUMENT_CATEGORY_META[cat].shortLabel}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-2.5 py-0.5 rounded-md bg-[#0C2340]/10 dark:bg-white/10 text-[11px] font-bold uppercase tracking-wider text-[#0C2340] dark:text-slate-200">
              {meta.shortLabel}
            </span>
          )}

          <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 tabular-nums">
            v{versionNumber} · {statusLabel}
            {autosaveState === 'saving'
              ? ' · Saving...'
              : autosaveState === 'saved' && lastSavedTime
              ? ` · Saved ${lastSavedTime}`
              : ''}
          </span>
        </div>

        {/* Studio Utility Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTemplateSelector(true)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-[#0C2340] dark:text-zinc-200 inline-flex items-center gap-1.5"
            title="Browse 17+ HUB-MIND & Jaystarbliss Official Templates"
          >
            <LayoutTemplate size={13} className="text-[#991B1B] dark:text-red-400" />
            <span>Templates</span>
          </button>

          <button
            type="button"
            onClick={handleLoadDefaultCategoryTemplate}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1.5"
            title={`Load default ${meta.shortLabel} template`}
          >
            <FileText size={13} className="text-[#991B1B] dark:text-red-400" />
            <span className="hidden md:inline">Load {meta.shortLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1.5"
          >
            <Eye size={13} />
            <span className="hidden sm:inline">A4 Preview</span>
          </button>

          {versions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowVersions(true)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1.5 tabular-nums"
            >
              <History size={13} />
              <span className="hidden sm:inline">Versions ({versions.length})</span>
            </button>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={exporting}
              onClick={() => setShowExportMenu((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
              <span>Export</span>
              <ChevronDown size={12} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-700 shadow-xl py-1.5 z-40">
                <button
                  type="button"
                  onClick={() => void handleExport('pdf')}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                >
                  <FileDown size={14} className="text-[#991B1B] dark:text-red-400" />
                  Official Jaystarbliss PDF
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('docx')}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                >
                  <FileText size={14} className="text-[#0C2340] dark:text-sky-400" />
                  Word Document (.docx)
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('html')}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                >
                  <Code2 size={14} className="text-slate-500" />
                  Standalone HTML
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('txt')}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                >
                  <FileType size={14} className="text-slate-500" />
                  Plain Text (.txt)
                </button>
              </div>
            )}
          </div>

          {onSaveDraft && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                void onSaveDraft(sanitizeDocumentHtml(editor ? editor.getHTML() : contentHtml))
              }
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save size={13} />
              <span>{saveDraftLabel}</span>
            </button>
          )}

          {onPrimarySubmit && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                void onPrimarySubmit(sanitizeDocumentHtml(editor ? editor.getHTML() : contentHtml))
              }
              className="px-3.5 py-1.5 rounded-lg bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              <span>{primarySubmitLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Optional Metadata Controls Slot (e.g. Student Picker, Recipient Picker) */}
      {headerSlot && (
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#0D0D10]">
          {headerSlot}
        </div>
      )}

      {/* Multi-Tabbed HUB-MIND Rich-Text Editing Ribbon */}
      <DocumentRibbon
        editor={editor}
        authorName={authorName}
        paperTheme={paperTheme}
        onTogglePaperTheme={() => setPaperTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        marginPreset={marginPreset}
        onMarginPresetChange={setMarginPreset}
        showMarginGuides={showMarginGuides}
        onToggleMarginGuides={() => setShowMarginGuides((prev) => !prev)}
        zoom={zoom}
        onZoomChange={setZoom}
        onOpenTemplates={() => setShowTemplateSelector(true)}
      />

      {/* Centered A4 Institutional Paper Canvas with Authentic Jaystarbliss Top & Bottom Navy Geometric Frame */}
      <div
        className={`bg-slate-200/85 dark:bg-[#09090B] overflow-y-auto flex justify-center ${
          compact ? 'p-3 sm:p-5 max-h-[68vh]' : 'p-4 sm:p-8'
        }`}
      >
        <OfficialA4PageFrame
          institutionTitle={JDI_INSTITUTION_NAME}
          subtitleLine={`${meta.pdfSubtitle} • ${todayLabel.toUpperCase()}`}
          refNo={refNo}
          dateLabel={todayLabel}
          versionNumber={versionNumber}
          statusLabel={statusLabel}
          pageNumber={1}
          totalPages={estimatedPages}
          paperTheme={paperTheme}
          marginPreset={marginPreset}
          showMarginGuides={showMarginGuides}
          zoom={zoom}
          metadataItems={metadataItems}
        >
          <div ref={editorContainerRef}>
            <EditorContent editor={editor} />
          </div>
        </OfficialA4PageFrame>
      </div>

      {/* Bottom HUB-MIND Status & Live Document Metrics Bar */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#141418] flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-zinc-400 select-none">
        <div className="flex flex-wrap items-center gap-3 tabular-nums">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#0C2340] dark:text-slate-200">
            <CheckCircle2 size={12} className="text-[#991B1B] dark:text-red-400" />
            Official Jaystarbliss A4 Printout Standard
          </span>
          <span>•</span>
          <span>
            Page 1 of {estimatedPages}
          </span>
          <span>•</span>
          <span>{wordCount.toLocaleString()} words</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">{charCount.toLocaleString()} characters</span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline font-mono text-[10px]">REF: {refNo}</span>
        </div>

        <div className="flex items-center gap-2 tabular-nums">
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-semibold">
            A4 (210 × 297 mm)
          </span>
          <div className="inline-flex items-center gap-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(75, z - 10))}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut size={12} />
            </button>
            <span className="font-bold text-slate-700 dark:text-zinc-200 min-w-[34px] text-center">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(140, z + 10))}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
              title="Zoom In"
            >
              <ZoomIn size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* HUB-MIND Template Selector Modal */}
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        templateContext={mergedTemplateContext}
        currentCategory={category}
        onSelect={(html, templateName, mappedCategory) => {
          lastExternalHtmlRef.current = html;
          editor?.commands.setContent(html, { emitUpdate: false });
          onContentChange(html);
          if (!title.trim() && templateName && templateName !== 'Blank Official Document') {
            onTitleChange(templateName);
          }
          if (
            mappedCategory &&
            onCategoryChange &&
            allowedCategories.includes(mappedCategory) &&
            mappedCategory !== category
          ) {
            onCategoryChange(mappedCategory);
          }
          setShowTemplateSelector(false);
        }}
      />

      {/* Full-Page A4 Preview Modal */}
      <FullPagePreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        documentData={currentExportPayload()}
      />

      {/* Version History Modal */}
      <VersionHistoryModal
        isOpen={showVersions}
        onClose={() => setShowVersions(false)}
        versions={versions}
        onRestoreVersion={(snap) => {
          onTitleChange(snap.title);
          const clean = sanitizeDocumentHtml(snap.contentHtml);
          lastExternalHtmlRef.current = clean;
          editor?.commands.setContent(clean, { emitUpdate: false });
          onContentChange(clean);
        }}
      />
    </div>
  );
};

export default DocumentStudio;
