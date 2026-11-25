import React from 'react';
import { Mail, Globe } from 'lucide-react';
import { JDI_CONTACTS, JDI_INSTITUTION_NAME } from '../../lib/pdf/documentBranding';
import { PERMANENT_WATERMARK_ASSET_PATH } from '../../lib/pdf/pdfWatermark';

export type PaperMarginPreset = 'normal' | 'narrow' | 'wide';

/**
 * Physical A4 Sheet Constants at 96 DPI (210 mm × 297 mm = 794 px × 1123 px)
 */
export const A4_PAGE_WIDTH_PX = 794;
export const A4_PAGE_HEIGHT_PX = 1123;
export const A4_PAGE_GAP_PX = 36;
export const A4_PAGE_STRIDE_PX = A4_PAGE_HEIGHT_PX + A4_PAGE_GAP_PX;

/**
 * Usable vertical content boundaries inside each A4 sheet:
 * - Page 1 reserves 216px at the top for the geometric navy banner + institutional letterhead + metadata strip
 * - Continuation pages (Page 2..N) reserve 114px at the top for the geometric navy banner + continuation bar
 * - All pages reserve 92px at the bottom for the official contact footer + page counter + geometric corner
 */
export const A4_PAGE1_CONTENT_TOP_PX = 216;
export const A4_SUBPAGE_CONTENT_TOP_PX = 114;
export const A4_FOOTER_RESERVED_PX = 92;

export const A4_MARGIN_PRESET_MM: Record<PaperMarginPreset, { mm: number; px: number; label: string }> = {
  normal: { mm: 20, px: 56, label: '20 mm (Standard A4)' },
  narrow: { mm: 12.7, px: 36, label: '12.7 mm (Narrow)' },
  wide: { mm: 25.4, px: 72, label: '25.4 mm (Wide)' },
};

export function getA4PageTopPx(pageNumber: number): number {
  return Math.max(0, pageNumber - 1) * A4_PAGE_STRIDE_PX;
}

export function getA4PageContentStartPx(pageNumber: number): number {
  return (
    getA4PageTopPx(pageNumber) +
    (pageNumber <= 1 ? A4_PAGE1_CONTENT_TOP_PX : A4_SUBPAGE_CONTENT_TOP_PX)
  );
}

export function getA4PageContentMaxPx(pageNumber: number): number {
  return getA4PageTopPx(pageNumber) + A4_PAGE_HEIGHT_PX - A4_FOOTER_RESERVED_PX;
}

/**
 * Measures real rendered DOM block heights inside an A4 content root (.ProseMirror or preview article)
 * and pushes any block that overflows a page's bottom content boundary—or follows an explicit
 * `<hr data-page-break="true" />`—cleanly onto the top content margin of the next physical A4 sheet.
 */
export function measureAndPaginateA4Blocks(containerEl: HTMLElement | null): {
  totalPages: number;
} {
  if (!containerEl) {
    return { totalPages: 1 };
  }

  const blocks = Array.from(containerEl.children) as HTMLElement[];
  if (blocks.length === 0) {
    return { totalPages: 1 };
  }

  // 1. Reset prior pagination shifts before measuring clean natural flow
  for (const block of blocks) {
    if (block.dataset.jdiPaginationShift) {
      block.style.marginTop = '';
      delete block.dataset.jdiPaginationShift;
    }
    block.removeAttribute('data-jdi-page-start');
  }

  let currentPage = 1;
  let forceBreakOnNextBlock = false;
  const baseOffsetTop = containerEl.offsetTop;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isManualBreakHr =
      block.tagName === 'HR' && block.getAttribute('data-page-break') === 'true';

    let relTop = Math.max(0, block.offsetTop - baseOffsetTop);
    let absTop = A4_PAGE1_CONTENT_TOP_PX + relTop;
    let blockHeight = Math.max(1, block.offsetHeight);
    let absBottom = absTop + blockHeight;

    while (absTop >= getA4PageContentStartPx(currentPage + 1)) {
      currentPage += 1;
    }

    if (forceBreakOnNextBlock) {
      const nextPage = currentPage + 1;
      const targetStart = getA4PageContentStartPx(nextPage);
      const shiftPx = Math.max(0, Math.ceil(targetStart - absTop));
      if (shiftPx > 0) {
        block.style.marginTop = `${shiftPx}px`;
        block.dataset.jdiPaginationShift = String(shiftPx);
      }
      block.setAttribute('data-jdi-page-start', String(nextPage));
      currentPage = nextPage;
      forceBreakOnNextBlock = false;

      relTop = Math.max(0, block.offsetTop - baseOffsetTop);
      absTop = A4_PAGE1_CONTENT_TOP_PX + relTop;
      blockHeight = Math.max(1, block.offsetHeight);
      absBottom = absTop + blockHeight;
    }

    if (isManualBreakHr) {
      if (absBottom > getA4PageContentMaxPx(currentPage)) {
        const nextPage = currentPage + 1;
        const targetStart = getA4PageContentStartPx(nextPage);
        const shiftPx = Math.max(0, Math.ceil(targetStart - absTop));
        if (shiftPx > 0) {
          block.style.marginTop = `${shiftPx}px`;
          block.dataset.jdiPaginationShift = String(shiftPx);
        }
        currentPage = nextPage;
      }
      forceBreakOnNextBlock = true;
      continue;
    }

    const pageMaxY = getA4PageContentMaxPx(currentPage);
    const pageStartY = getA4PageContentStartPx(currentPage);

    // If this block overflows the current page's usable content area and isn't already at the top of the page, push it to the next page
    if (absBottom > pageMaxY && absTop > pageStartY + 14) {
      const nextPage = currentPage + 1;
      const targetStart = getA4PageContentStartPx(nextPage);
      const shiftPx = Math.max(0, Math.ceil(targetStart - absTop));
      if (shiftPx > 0) {
        block.style.marginTop = `${shiftPx}px`;
        block.dataset.jdiPaginationShift = String(shiftPx);
      }
      block.setAttribute('data-jdi-page-start', String(nextPage));
      currentPage = nextPage;

      relTop = Math.max(0, block.offsetTop - baseOffsetTop);
      absTop = A4_PAGE1_CONTENT_TOP_PX + relTop;
      blockHeight = Math.max(1, block.offsetHeight);
      absBottom = absTop + blockHeight;
    }

    while (absBottom > getA4PageContentMaxPx(currentPage) && currentPage < 50) {
      currentPage += 1;
    }
  }

  if (forceBreakOnNextBlock) {
    currentPage += 1;
  }

  return { totalPages: Math.max(1, currentPage) };
}

export interface OfficialA4PageFrameProps {
  institutionTitle?: string;
  subtitleLine: string;
  refNo: string;
  dateLabel?: string;
  versionNumber?: number;
  statusLabel?: string;
  pageNumber?: number;
  totalPages?: number;
  paperTheme?: 'light' | 'dark';
  marginPreset?: PaperMarginPreset;
  showMarginGuides?: boolean;
  zoom?: number;
  metadataItems?: Array<{ label: string; value: string }>;
  children: React.ReactNode;
}

/**
 * Renders an authentic multi-page A4 sheet stack (`210 mm × 297 mm` = `794 px × 1123 px` per page)
 * matching `/src/lib/pdf/pdfHeader.ts`, `/src/lib/pdf/pdfFooter.ts`, and `/src/lib/pdf/pdfWatermark.ts`.
 * Every sheet has its own top geometric banner, watermark, margin guides, and bottom contact footer.
 */
export const OfficialA4PageFrame: React.FC<OfficialA4PageFrameProps> = ({
  institutionTitle = JDI_INSTITUTION_NAME,
  subtitleLine,
  refNo,
  dateLabel,
  versionNumber = 1,
  statusLabel,
  totalPages = 1,
  paperTheme = 'light',
  marginPreset = 'normal',
  showMarginGuides = false,
  zoom = 100,
  metadataItems = [],
  children,
}) => {
  const isDarkPaper = paperTheme === 'dark';
  const pageCount = Math.max(1, totalPages);
  const marginSpec = A4_MARGIN_PRESET_MM[marginPreset] || A4_MARGIN_PRESET_MM.normal;
  const scale = Math.max(0.6, Math.min(1.5, zoom / 100));
  const totalStackHeightPx =
    pageCount * A4_PAGE_HEIGHT_PX + Math.max(0, pageCount - 1) * A4_PAGE_GAP_PX;

  return (
    <div
      className="w-full flex justify-center transition-all duration-150"
      style={
        scale !== 1
          ? {
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
              marginBottom: `${(scale - 1) * totalStackHeightPx}px`,
            }
          : undefined
      }
    >
      <div
        className={`jdi-a4-paper-sheet ${
          isDarkPaper ? 'jdi-a4-paper-dark' : ''
        } relative w-full max-w-[794px] select-text`}
        style={{
          width: `${A4_PAGE_WIDTH_PX}px`,
          minHeight: `${totalStackHeightPx}px`,
          backgroundColor: 'transparent',
        }}
      >
        {/* BACKGROUND STACK OF PHYSICAL A4 SHEETS (210mm × 297mm = 794px × 1123px each) */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none flex flex-col"
          style={{ gap: `${A4_PAGE_GAP_PX}px` }}
        >
          {Array.from({ length: pageCount }, (_, index) => {
            const sheetNumber = index + 1;
            const isFirstPage = sheetNumber === 1;

            return (
              <div
                key={`a4-sheet-${sheetNumber}`}
                className={`relative w-full overflow-hidden shadow-2xl border flex flex-col justify-between transition-colors ${
                  isDarkPaper
                    ? 'bg-[#121621] text-slate-100 border-slate-800'
                    : 'bg-white text-[#0F172A] border-slate-300'
                }`}
                style={{
                  height: `${A4_PAGE_HEIGHT_PX}px`,
                  minHeight: `${A4_PAGE_HEIGHT_PX}px`,
                  maxHeight: `${A4_PAGE_HEIGHT_PX}px`,
                }}
              >
                {/* 1. TOP FACETED NAVY GEOMETRIC BANNER */}
                <div className="relative w-full shrink-0">
                  <svg
                    viewBox="0 0 210 26"
                    preserveAspectRatio="none"
                    className="w-full h-[64px] block"
                  >
                    <rect x="0" y="0" width="210" height="18" fill="#0C2340" />
                    <polygon points="0,0 74,0 38,26 0,26" fill="#193B68" />
                    <polygon points="0,0 42,0 0,26" fill="#061326" />
                    <polygon points="0,12 44,26 0,26" fill="#193B68" />
                    <polygon points="18,12 74,0 38,26" fill="#0C2340" />
                  </svg>

                  {/* Right-aligned REF NO inside top navy band */}
                  <div className="absolute top-0 right-0 h-[44px] pr-8 sm:pr-12 flex items-center justify-end">
                    <span className="text-[11px] font-semibold tracking-wider text-white font-mono">
                      REF NO: {refNo || 'JDI-OFFICIAL'}
                    </span>
                  </div>
                </div>

                {/* 2. PERMANENT CENTER WATERMARK EMBLEM */}
                <div className="absolute inset-0 flex items-center justify-center z-0 overflow-hidden">
                  <img
                    src={PERMANENT_WATERMARK_ASSET_PATH}
                    alt=""
                    className={`w-[390px] max-w-[62%] object-contain ${
                      isDarkPaper ? 'opacity-[0.05]' : 'opacity-[0.075] invert brightness-0'
                    }`}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>

                {/* Optional Print Margin Guides per A4 Sheet */}
                {showMarginGuides && (
                  <div
                    className="absolute border border-dashed border-sky-500/45 z-20"
                    style={{
                      left: `${marginSpec.px}px`,
                      right: `${marginSpec.px}px`,
                      top: `${
                        isFirstPage ? A4_PAGE1_CONTENT_TOP_PX : A4_SUBPAGE_CONTENT_TOP_PX
                      }px`,
                      bottom: `${A4_FOOTER_RESERVED_PX}px`,
                    }}
                  />
                )}

                {/* 3. SHEET HEADER: FULL INSTITUTIONAL LETTERHEAD ON PAGE 1, CONTINUATION STRIP ON PAGE 2+ */}
                <div
                  className="relative z-10 w-full shrink-0"
                  style={{
                    paddingLeft: `${marginSpec.px}px`,
                    paddingRight: `${marginSpec.px}px`,
                  }}
                >
                  {isFirstPage ? (
                    <header className="text-center pt-1.5 pb-3 border-b border-slate-200/90 dark:border-slate-800">
                      <h1
                        className={`text-[20px] font-black tracking-tight uppercase leading-tight ${
                          isDarkPaper ? 'text-white' : 'text-[#0F172A]'
                        }`}
                      >
                        {institutionTitle || JDI_INSTITUTION_NAME}
                      </h1>
                      <p
                        className={`text-[10.5px] font-extrabold tracking-widest uppercase mt-0.5 ${
                          isDarkPaper ? 'text-slate-300' : 'text-[#1E293B]'
                        }`}
                      >
                        {subtitleLine}
                      </p>

                      {metadataItems.length > 0 ? (
                        <div
                          className={`mt-2.5 rounded-lg border px-3 py-1.5 grid grid-cols-4 gap-2 text-left text-[10.5px] ${
                            isDarkPaper
                              ? 'bg-slate-900/70 border-slate-800 text-slate-200'
                              : 'bg-[#F8FAFC] border-[#CBD5E1]/80 text-[#0F172A]'
                          }`}
                        >
                          {metadataItems.map((item, idx) => (
                            <div key={`${item.label}-${idx}`} className="min-w-0">
                              <span
                                className={`block text-[8.5px] font-bold uppercase tracking-wider ${
                                  isDarkPaper ? 'text-slate-400' : 'text-[#64748B]'
                                }`}
                              >
                                {item.label}
                              </span>
                              <span className="block font-bold truncate mt-0.5">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        dateLabel && (
                          <p
                            className={`text-[10px] font-medium mt-1 ${
                              isDarkPaper ? 'text-slate-400' : 'text-[#64748B]'
                            }`}
                          >
                            {dateLabel} · v{versionNumber} {statusLabel ? `· ${statusLabel}` : ''}
                          </p>
                        )
                      )}
                    </header>
                  ) : (
                    <header className="pt-1 pb-2 border-b border-slate-200/90 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                      <span className={isDarkPaper ? 'text-slate-300' : 'text-[#0C2340]'}>
                        {institutionTitle || JDI_INSTITUTION_NAME} — Continuation Sheet
                      </span>
                      <span className={isDarkPaper ? 'text-slate-400' : 'text-[#64748B]'}>
                        Page {sheetNumber} of {pageCount}
                      </span>
                    </header>
                  )}
                </div>

                {/* Middle Spacer for Sheet Body */}
                <div className="flex-1" />

                {/* 4. BOTTOM OFFICIAL CONTACT FOOTER & RIGHT FACETED GEOMETRIC CORNER */}
                <footer className="relative z-10 w-full pt-2.5 shrink-0 border-t border-slate-100 dark:border-slate-800/70">
                  <div
                    className="pb-3.5 pr-44 flex flex-col gap-1 relative z-10"
                    style={{
                      paddingLeft: `${marginSpec.px}px`,
                    }}
                  >
                    <div
                      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] font-medium ${
                        isDarkPaper ? 'text-slate-300' : 'text-[#0F172A]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-[#0C2340] text-white inline-flex items-center justify-center shrink-0">
                          <Mail size={9} />
                        </span>
                        <span>{JDI_CONTACTS.email}</span>
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-[#0C2340] text-white inline-flex items-center justify-center font-serif font-bold text-[9px] shrink-0">
                          J
                        </span>
                        <span>{JDI_CONTACTS.handle}</span>
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full border border-[#0C2340] text-[#0C2340] inline-flex items-center justify-center shrink-0">
                          <Globe size={9} />
                        </span>
                        <span>{JDI_CONTACTS.website}</span>
                      </span>
                    </div>

                    <div
                      className={`text-[9.5px] font-semibold tabular-nums ${
                        isDarkPaper ? 'text-slate-400' : 'text-[#64748B]'
                      }`}
                    >
                      Page {sheetNumber} of {pageCount} • A4 (210 × 297 mm)
                    </div>
                  </div>

                  <svg
                    viewBox="0 0 210 24"
                    preserveAspectRatio="none"
                    className="absolute bottom-0 right-0 w-full h-[52px]"
                  >
                    <polygon points="142,24 176,4 210,4 210,24" fill="#193B68" />
                    <polygon points="164,24 182,6 200,24" fill="#061326" />
                    <polygon points="186,24 210,3 210,24" fill="#0C2340" />
                  </svg>
                </footer>
              </div>
            );
          })}
        </div>

        {/* FOREGROUND EDITABLE / RENDERED CONTENT LAYER ALIGNED TO EXACT A4 MARGINS */}
        <div
          className="absolute top-0 left-0 right-0 z-10"
          style={{
            paddingTop: `${A4_PAGE1_CONTENT_TOP_PX}px`,
            paddingBottom: `${A4_FOOTER_RESERVED_PX}px`,
            paddingLeft: `${marginSpec.px}px`,
            paddingRight: `${marginSpec.px}px`,
            minHeight: `${totalStackHeightPx}px`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default OfficialA4PageFrame;
