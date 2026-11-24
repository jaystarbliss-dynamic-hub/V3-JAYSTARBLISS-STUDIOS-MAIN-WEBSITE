import React, { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  PlusSquare,
  MinusSquare,
  Trash2,
  Image as ImageIcon,
  Highlighter,
  SeparatorHorizontal,
  PenTool,
  X,
  Search,
  Replace,
  Eraser,
  Columns2,
  MessageSquareQuote,
  Calendar,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  Ruler,
  ChevronUp,
  ChevronDown,
  LayoutTemplate,
} from 'lucide-react';
import type { PaperMarginPreset } from './OfficialA4PageFrame';

export type RibbonTabId = 'home' | 'insert' | 'table' | 'layout';

export interface DocumentRibbonProps {
  editor: Editor | null;
  authorName?: string;
  paperTheme?: 'light' | 'dark';
  onTogglePaperTheme?: () => void;
  marginPreset?: PaperMarginPreset;
  onMarginPresetChange?: (next: PaperMarginPreset) => void;
  showMarginGuides?: boolean;
  onToggleMarginGuides?: () => void;
  zoom?: number;
  onZoomChange?: (nextZoom: number) => void;
  onOpenTemplates?: () => void;
}

const FONT_FAMILIES = [
  { label: 'Inter / System Sans', value: '' },
  { label: 'Georgia (Serif)', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri / Carlito', value: 'Calibri, Carlito, sans-serif' },
  { label: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
];

const TEXT_COLORS = [
  { label: 'Dark Ink', value: '#0F172A' },
  { label: 'JDI Navy', value: '#0C2340' },
  { label: 'JDI Crimson', value: '#991B1B' },
  { label: 'Steel Blue', value: '#193B68' },
  { label: 'Muted Slate', value: '#475569' },
  { label: 'Emerald', value: '#047857' },
  { label: 'Amber', value: '#B45309' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Warm Yellow', value: '#FEF3C7' },
  { label: 'Soft Rose', value: '#FFE4E6' },
  { label: 'Ice Blue', value: '#E0F2FE' },
  { label: 'Mint Green', value: '#D1FAE5' },
];

export const DocumentRibbon: React.FC<DocumentRibbonProps> = ({
  editor,
  authorName,
  paperTheme = 'light',
  onTogglePaperTheme,
  marginPreset = 'normal',
  onMarginPresetChange,
  showMarginGuides = false,
  onToggleMarginGuides,
  zoom = 100,
  onZoomChange,
  onOpenTemplates,
}) => {
  const [activeTab, setActiveTab] = useState<RibbonTabId>('home');
  const [collapsed, setCollapsed] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findFeedback, setFindFeedback] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tableRowsInput, setTableRowsInput] = useState(3);
  const [tableColsInput, setTableColsInput] = useState(3);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!editor) return null;

  const isTableActive = editor.isActive('table');

  const btnClass = (active = false) =>
    `p-1.5 rounded-lg text-xs transition-colors inline-flex items-center justify-center shrink-0 ${
      active
        ? 'bg-[#991B1B] text-white shadow-2xs'
        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-200/70 dark:hover:bg-zinc-800'
    }`;

  const labeledBtnClass = (active = false) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shrink-0 ${
      active
        ? 'bg-[#991B1B] text-white shadow-2xs'
        : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
    }`;

  const handleInsertImageUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = imageUrl.trim();
    if (!cleaned) return;
    if (!/^https?:\/\//i.test(cleaned) && !cleaned.startsWith('data:image/')) {
      return;
    }
    editor.chain().focus().setImage({ src: cleaned }).run();
    setImageUrl('');
    setShowImageDialog(false);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor.chain().focus().setImage({ src: reader.result }).run();
        setShowImageDialog(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertSignatureBlock = () => {
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    editor
      .chain()
      .focus()
      .insertContent(
        `<hr /><p><strong>${authorName || 'Authorized Representative'}</strong><br />Jaystarbliss Dynamic Institute<br />Date: ${today}</p>`
      )
      .run();
  };

  const insertDualSignatureTable = () => {
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    editor
      .chain()
      .focus()
      .insertContent(
        `<table><thead><tr><th>For Jaystarbliss Dynamic Institute</th><th>For Partner Institution / Recipient</th></tr></thead><tbody><tr><td><strong>Name:</strong> ${authorName || 'Authorized Signatory'}<br /><strong>Signature:</strong> ______________________<br /><strong>Date:</strong> ${today}</td><td><strong>Name:</strong> ______________________<br /><strong>Signature:</strong> ______________________<br /><strong>Date:</strong> ______________________</td></tr></tbody></table>`
      )
      .run();
  };

  const insertCalloutBox = () => {
    editor
      .chain()
      .focus()
      .insertContent(
        `<blockquote><p><strong>OFFICIAL NOTE / KEY HIGHLIGHT:</strong> Enter important institutional guidance, executive summary remarks, or special instructions here.</p></blockquote><p></p>`
      )
      .run();
  };

  const insertTwoColumnComparison = () => {
    editor
      .chain()
      .focus()
      .insertContent(
        `<table><thead><tr><th>Key Strengths &amp; Milestones</th><th>Action Items &amp; Next Steps</th></tr></thead><tbody><tr><td><ul><li>Enter primary observation or milestone achieved.</li><li>Add supporting evidence or project result.</li></ul></td><td><ul><li>Enter recommended follow-up action.</li><li>Specify target completion timeline.</li></ul></td></tr></tbody></table><p></p>`
      )
      .run();
  };

  const insertDateStamp = () => {
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    editor.chain().focus().insertContent(`<strong>${today}</strong> `).run();
  };

  const insertPageBreak = () => {
    editor
      .chain()
      .focus()
      .insertContent('<hr data-page-break="true" /><p></p>')
      .run();
  };

  const handleReplaceAll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!findQuery.trim()) return;
    const currentHtml = editor.getHTML();
    const plainText = editor.getText();
    const matches = plainText.split(findQuery).length - 1;
    if (matches <= 0) {
      setFindFeedback(`No matches found for "${findQuery}".`);
      return;
    }
    if (!replaceQuery) {
      setFindFeedback(`Found ${matches} match${matches === 1 ? '' : 'es'} in document.`);
      return;
    }
    const escapedFind = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updatedHtml = currentHtml.replace(new RegExp(escapedFind, 'g'), replaceQuery);
    editor.commands.setContent(updatedHtml, { emitUpdate: true });
    setFindFeedback(`Replaced ${matches} occurrence${matches === 1 ? '' : 's'}.`);
  };

  const currentHeading = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
    ? 'h2'
    : editor.isActive('heading', { level: 3 })
    ? 'h3'
    : 'p';

  return (
    <div className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/95 dark:bg-[#141418] select-none">
      {/* Top Ribbon Tab Strip (HUB-MIND style with Jaystarbliss Navy & Crimson accents) */}
      <div className="px-3 pt-1.5 flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-zinc-800 bg-[#0C2340]/[0.03] dark:bg-zinc-900/60">
        <div className="flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: 'home', label: 'Home' },
              { id: 'insert', label: 'Insert & Blocks' },
              { id: 'table', label: `Table Tools${isTableActive ? ' •' : ''}` },
              { id: 'layout', label: 'Page Layout & View' },
            ] as Array<{ id: RibbonTabId; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setCollapsed(false);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id && !collapsed
                  ? 'border-[#991B1B] text-[#991B1B] dark:text-red-400 bg-white dark:bg-[#141418]'
                  : 'border-transparent text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 pb-1">
          {onOpenTemplates && (
            <button
              type="button"
              onClick={onOpenTemplates}
              className="px-2.5 py-1 rounded-md bg-[#0C2340] hover:bg-[#193B68] text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
              title="Browse 17+ Official Document Templates"
            >
              <LayoutTemplate size={12} />
              <span>Template Gallery</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFindBar((prev) => !prev)}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
              showFindBar
                ? 'bg-[#991B1B] text-white'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/70 dark:hover:bg-zinc-800'
            }`}
            title="Find & Replace in document"
          >
            <Search size={12} />
            <span className="hidden sm:inline">Find &amp; Replace</span>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"
            title={collapsed ? 'Expand Ribbon' : 'Collapse Ribbon'}
            aria-label={collapsed ? 'Expand Ribbon' : 'Collapse Ribbon'}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Ribbon Command Panel */}
      {!collapsed && (
        <div className="px-3 py-2 space-y-2">
          {/* TAB 1: HOME (Typography, Formatting, Lists, Quick Insert) */}
          {activeTab === 'home' && (
            <div className="flex flex-wrap items-center gap-1">
              {/* Undo / Redo */}
              <button
                type="button"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                className={`${btnClass()} disabled:opacity-35`}
                title="Undo"
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                className={`${btnClass()} disabled:opacity-35`}
                title="Redo"
              >
                <Redo2 size={14} />
              </button>

              <span className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-1" />

              {/* Block Style / Heading */}
              <select
                aria-label="Text style"
                value={currentHeading}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'p') editor.chain().focus().setParagraph().run();
                  else if (val === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
                  else if (val === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
                  else if (val === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
                }}
                className="h-7 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none"
              >
                <option value="p">Normal Paragraph</option>
                <option value="h1">Heading 1 (Title)</option>
                <option value="h2">Heading 2 (Section)</option>
                <option value="h3">Heading 3 (Sub-section)</option>
              </select>

              {/* Font Family */}
              <select
                aria-label="Font family"
                value={editor.getAttributes('textStyle').fontFamily || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) editor.chain().focus().unsetFontFamily().run();
                  else editor.chain().focus().setFontFamily(v).run();
                }}
                className="h-7 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-800 dark:text-zinc-200 focus:outline-none hidden sm:block"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              <span className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-1" />

              {/* Inline formatting */}
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={btnClass(editor.isActive('bold'))}
                title="Bold (Ctrl+B)"
              >
                <Bold size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={btnClass(editor.isActive('italic'))}
                title="Italic (Ctrl+I)"
              >
                <Italic size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={btnClass(editor.isActive('underline'))}
                title="Underline (Ctrl+U)"
              >
                <UnderlineIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={btnClass(editor.isActive('strike'))}
                title="Strikethrough"
              >
                <Strikethrough size={14} />
              </button>

              {/* Highlight Swatches */}
              <div className="inline-flex items-center gap-0.5 px-1">
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleHighlight({ color: '#FEF3C7' }).run()}
                  className={btnClass(editor.isActive('highlight'))}
                  title="Toggle Highlight"
                >
                  <Highlighter size={14} />
                </button>
                {HIGHLIGHT_COLORS.map((hc) => (
                  <button
                    key={hc.value}
                    type="button"
                    onClick={() => editor.chain().focus().toggleHighlight({ color: hc.value }).run()}
                    title={`Highlight: ${hc.label}`}
                    className="w-3.5 h-3.5 rounded-xs border border-slate-300 dark:border-zinc-600 transition-transform hover:scale-110 hidden md:inline-block"
                    style={{ backgroundColor: hc.value }}
                  />
                ))}
              </div>

              {/* Text Color Palette */}
              <div className="inline-flex items-center gap-0.5 px-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => editor.chain().focus().setColor(c.value).run()}
                    title={`Text Color: ${c.label}`}
                    className="w-4 h-4 rounded-full border border-slate-300 dark:border-zinc-600 transition-transform hover:scale-110"
                    style={{ backgroundColor: c.value }}
                    aria-label={`Set text color to ${c.label}`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                className={btnClass()}
                title="Clear Formatting"
              >
                <Eraser size={14} />
              </button>

              <span className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-1" />

              {/* Alignment */}
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                className={btnClass(editor.isActive({ textAlign: 'left' }))}
                title="Align Left"
              >
                <AlignLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                className={btnClass(editor.isActive({ textAlign: 'center' }))}
                title="Align Center"
              >
                <AlignCenter size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                className={btnClass(editor.isActive({ textAlign: 'right' }))}
                title="Align Right"
              >
                <AlignRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                className={btnClass(editor.isActive({ textAlign: 'justify' }))}
                title="Justify"
              >
                <AlignJustify size={14} />
              </button>

              <span className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-1" />

              {/* Lists & Quote */}
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={btnClass(editor.isActive('bulletList'))}
                title="Bullet List"
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={btnClass(editor.isActive('orderedList'))}
                title="Numbered List"
              >
                <ListOrdered size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={btnClass(editor.isActive('blockquote'))}
                title="Callout / Blockquote"
              >
                <Quote size={14} />
              </button>

              <span className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-1" />

              {/* Quick Insert Shortcuts on Home tab */}
              <button
                type="button"
                onClick={() =>
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
                className={btnClass(isTableActive)}
                title="Insert 3x3 Table"
              >
                <TableIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setShowImageDialog((prev) => !prev)}
                className={btnClass(showImageDialog)}
                title="Insert Image"
              >
                <ImageIcon size={14} />
              </button>
              <button
                type="button"
                onClick={insertPageBreak}
                className={btnClass()}
                title="Insert Page Break"
              >
                <SeparatorHorizontal size={14} />
              </button>
              <button
                type="button"
                onClick={insertSignatureBlock}
                className={btnClass()}
                title="Insert Official Signature Block"
              >
                <PenTool size={14} />
              </button>
            </div>
          )}

          {/* TAB 2: INSERT & INSTITUTIONAL BLOCKS */}
          {activeTab === 'insert' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
                className={labeledBtnClass()}
              >
                <TableIcon size={13} className="text-[#0C2340] dark:text-sky-400" />
                <span>3×3 Data Table</span>
              </button>

              <button
                type="button"
                onClick={() => setShowImageDialog((prev) => !prev)}
                className={labeledBtnClass(showImageDialog)}
              >
                <ImageIcon size={13} className="text-[#991B1B] dark:text-red-400" />
                <span>Image / Stamp</span>
              </button>

              <button
                type="button"
                onClick={insertCalloutBox}
                className={labeledBtnClass()}
              >
                <MessageSquareQuote size={13} className="text-[#991B1B] dark:text-red-400" />
                <span>Executive Callout Box</span>
              </button>

              <button
                type="button"
                onClick={insertTwoColumnComparison}
                className={labeledBtnClass()}
              >
                <Columns2 size={13} className="text-[#0C2340] dark:text-sky-400" />
                <span>2-Column Summary Grid</span>
              </button>

              <button
                type="button"
                onClick={insertSignatureBlock}
                className={labeledBtnClass()}
              >
                <PenTool size={13} className="text-[#991B1B] dark:text-red-400" />
                <span>Single Sign-Off Block</span>
              </button>

              <button
                type="button"
                onClick={insertDualSignatureTable}
                className={labeledBtnClass()}
              >
                <PenTool size={13} className="text-[#0C2340] dark:text-sky-400" />
                <span>Dual-Party Sign-Off Grid</span>
              </button>

              <button
                type="button"
                onClick={insertDateStamp}
                className={labeledBtnClass()}
              >
                <Calendar size={13} />
                <span>Insert Today&rsquo;s Date</span>
              </button>

              <button
                type="button"
                onClick={insertPageBreak}
                className={labeledBtnClass()}
              >
                <SeparatorHorizontal size={13} />
                <span>Page Break / Divider</span>
              </button>
            </div>
          )}

          {/* TAB 3: TABLE TOOLS */}
          {activeTab === 'table' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1">
                <span className="font-semibold text-slate-600 dark:text-zinc-400">New Table:</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={tableRowsInput}
                  onChange={(e) => setTableRowsInput(Math.max(1, Math.min(15, Number(e.target.value) || 3)))}
                  className="w-11 px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-center font-bold"
                  aria-label="Table rows"
                />
                <span>×</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={tableColsInput}
                  onChange={(e) => setTableColsInput(Math.max(1, Math.min(8, Number(e.target.value) || 3)))}
                  className="w-11 px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-center font-bold"
                  aria-label="Table columns"
                />
                <button
                  type="button"
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: tableRowsInput, cols: tableColsInput, withHeaderRow: true })
                      .run()
                  }
                  className="px-2.5 py-1 rounded-md bg-[#0C2340] hover:bg-[#193B68] text-white font-bold"
                >
                  Insert Table
                </button>
              </div>

              <span className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-1" />

              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().addRowBefore().run()}
                className={`${labeledBtnClass()} disabled:opacity-40`}
              >
                <PlusSquare size={12} /> Row Above
              </button>
              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className={`${labeledBtnClass()} disabled:opacity-40`}
              >
                <PlusSquare size={12} /> Row Below
              </button>
              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().deleteRow().run()}
                className={`${labeledBtnClass()} disabled:opacity-40`}
              >
                <MinusSquare size={12} /> Delete Row
              </button>
              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                className={`${labeledBtnClass()} disabled:opacity-40`}
              >
                <PlusSquare size={12} /> Col Left
              </button>
              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className={`${labeledBtnClass()} disabled:opacity-40`}
              >
                <PlusSquare size={12} /> Col Right
              </button>
              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className={`${labeledBtnClass()} disabled:opacity-40`}
              >
                <MinusSquare size={12} /> Delete Col
              </button>
              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                className={`${labeledBtnClass()} disabled:opacity-40`}
              >
                Toggle Header Row
              </button>
              <button
                type="button"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-[#991B1B] dark:text-red-400 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Trash2 size={12} /> Delete Table
              </button>
            </div>
          )}

          {/* TAB 4: PAGE LAYOUT & VIEW */}
          {activeTab === 'layout' && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {/* Margins Preset */}
              {onMarginPresetChange && (
                <div className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-slate-600 dark:text-zinc-400">Page Margins:</span>
                  {(['normal', 'narrow', 'wide'] as PaperMarginPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onMarginPresetChange(preset)}
                      className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-colors ${
                        marginPreset === preset
                          ? 'bg-[#0C2340] text-white'
                          : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}

              <span className="w-px h-5 bg-slate-200 dark:bg-zinc-700" />

              {/* Print Margin Guides Toggle */}
              {onToggleMarginGuides && (
                <button
                  type="button"
                  onClick={onToggleMarginGuides}
                  className={labeledBtnClass(showMarginGuides)}
                >
                  <Ruler size={13} />
                  <span>{showMarginGuides ? 'Hide Margin Guides' : 'Show Margin Guides'}</span>
                </button>
              )}

              {/* Paper Theme Toggle */}
              {onTogglePaperTheme && (
                <button
                  type="button"
                  onClick={onTogglePaperTheme}
                  className={labeledBtnClass(paperTheme === 'dark')}
                >
                  {paperTheme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
                  <span>{paperTheme === 'dark' ? 'Switch to White Print Paper' : 'Dark Canvas Sheet'}</span>
                </button>
              )}

              {/* Zoom Controls */}
              {onZoomChange && (
                <div className="inline-flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.max(75, zoom - 10))}
                    className={btnClass()}
                    title="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-xs font-bold tabular-nums min-w-[44px] text-center text-slate-700 dark:text-zinc-300">
                    {zoom}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.min(140, zoom + 10))}
                    className={btnClass()}
                    title="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </button>
                  {zoom !== 100 && (
                    <button
                      type="button"
                      onClick={() => onZoomChange(100)}
                      className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 text-[11px] font-semibold text-slate-700 dark:text-zinc-300"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Contextual Table Row when inside a table on Home tab */}
          {activeTab === 'home' && isTableActive && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-200/80 dark:border-zinc-800 text-[11px]">
              <span className="font-semibold text-slate-500 dark:text-zinc-400 mr-1">Table Active:</span>
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1 font-medium text-slate-700 dark:text-zinc-300"
              >
                <PlusSquare size={12} /> Row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1 font-medium text-slate-700 dark:text-zinc-300"
              >
                <MinusSquare size={12} /> Row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1 font-medium text-slate-700 dark:text-zinc-300"
              >
                <PlusSquare size={12} /> Col
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1 font-medium text-slate-700 dark:text-zinc-300"
              >
                <MinusSquare size={12} /> Col
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="px-2 py-1 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-[#991B1B] dark:text-red-400 inline-flex items-center gap-1 font-semibold ml-auto"
              >
                <Trash2 size={12} /> Delete Table
              </button>
            </div>
          )}

          {/* Inline Find & Replace Bar */}
          {showFindBar && (
            <form
              onSubmit={handleReplaceAll}
              className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-zinc-800 text-xs"
            >
              <div className="relative flex-1 min-w-[160px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={findQuery}
                  onChange={(e) => {
                    setFindQuery(e.target.value);
                    setFindFeedback('');
                  }}
                  placeholder="Find text in document..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                />
              </div>
              <div className="relative flex-1 min-w-[160px]">
                <Replace size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={replaceQuery}
                  onChange={(e) => {
                    setReplaceQuery(e.target.value);
                    setFindFeedback('');
                  }}
                  placeholder="Replace with..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#0C2340] hover:bg-[#193B68] text-white font-bold"
              >
                {replaceQuery ? 'Replace All' : 'Find Count'}
              </button>
              {findFeedback && (
                <span className="text-[11px] font-semibold text-[#991B1B] dark:text-red-400">
                  {findFeedback}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowFindBar(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                <X size={14} />
              </button>
            </form>
          )}

          {/* Inline Image Inserter */}
          {showImageDialog && (
            <form
              onSubmit={handleInsertImageUrl}
              className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-zinc-800"
            >
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Paste image URL (https://...)"
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#991B1B] text-white text-xs font-semibold hover:bg-[#7F1D1D]"
              >
                Insert URL
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                Upload Image (≤2MB)
              </button>
              <button
                type="button"
                onClick={() => setShowImageDialog(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                <X size={14} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentRibbon;
