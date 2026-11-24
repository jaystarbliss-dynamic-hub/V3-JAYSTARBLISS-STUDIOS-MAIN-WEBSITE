import React from 'react';
import { Mail, Globe } from 'lucide-react';
import { JDI_CONTACTS, JDI_INSTITUTION_NAME } from '../../lib/pdf/documentBranding';
import { PERMANENT_WATERMARK_ASSET_PATH } from '../../lib/pdf/pdfWatermark';

export type PaperMarginPreset = 'normal' | 'narrow' | 'wide';

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

const MARGIN_PADDING_CLASSES: Record<PaperMarginPreset, string> = {
  normal: 'px-7 sm:px-12 md:px-14',
  narrow: 'px-4 sm:px-7 md:px-8',
  wide: 'px-10 sm:px-16 md:px-20',
};

/**
 * Renders the exact standard Jaystarbliss A4 PDF printout frame matching
 * `/src/lib/pdf/pdfHeader.ts`, `/src/lib/pdf/pdfFooter.ts`, and `/src/lib/pdf/pdfWatermark.ts`:
 * - Top faceted navy geometric banner (#0C2340 / #193B68 / #061326) with right-aligned REF NO
 * - Centered bold institutional title & classification subtitle
 * - Subtle centered Jaystarbliss emblem watermark
 * - Bottom official contact bar + pagination + bottom-right faceted navy geometric corner
 */
export const OfficialA4PageFrame: React.FC<OfficialA4PageFrameProps> = ({
  institutionTitle = JDI_INSTITUTION_NAME,
  subtitleLine,
  refNo,
  dateLabel,
  versionNumber = 1,
  statusLabel,
  pageNumber = 1,
  totalPages = 1,
  paperTheme = 'light',
  marginPreset = 'normal',
  showMarginGuides = false,
  zoom = 100,
  metadataItems = [],
  children,
}) => {
  const isDarkPaper = paperTheme === 'dark';
  const paddingClass = MARGIN_PADDING_CLASSES[marginPreset] || MARGIN_PADDING_CLASSES.normal;
  const scale = Math.max(0.6, Math.min(1.5, zoom / 100));

  return (
    <div
      className="w-full flex justify-center transition-all duration-150"
      style={
        scale !== 1
          ? {
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
              marginBottom: `${(scale - 1) * 1123}px`,
            }
          : undefined
      }
    >
      <div
        className={`w-full max-w-[794px] min-h-[1123px] relative flex flex-col justify-between overflow-hidden shadow-2xl border transition-colors ${
          isDarkPaper
            ? 'bg-[#121621] text-slate-100 border-slate-800'
            : 'bg-white text-slate-900 border-slate-300'
        }`}
      >
        {/* 1. TOP FACETED NAVY GEOMETRIC BANNER (Exact match to drawTopGeometricBanner in pdfHeader.ts) */}
        <div className="relative w-full select-none shrink-0">
          <svg
            viewBox="0 0 210 26"
            preserveAspectRatio="none"
            className="w-full h-[54px] sm:h-[68px] block"
            aria-hidden="true"
          >
            {/* Base full-width navy band (y: 0..18) */}
            <rect x="0" y="0" width="210" height="18" fill="#0C2340" />
            {/* Steel-blue wide diagonal facet extending below the main band */}
            <polygon points="0,0 74,0 38,26 0,26" fill="#193B68" />
            {/* Obsidian-navy crisp foreground facet */}
            <polygon points="0,0 42,0 0,26" fill="#061326" />
            {/* Subtle steel diagonal wedge on lower-left corner edge */}
            <polygon points="0,12 44,26 0,26" fill="#193B68" />
            {/* Sharp navy inner bevel */}
            <polygon points="18,12 74,0 38,26" fill="#0C2340" />
          </svg>

          {/* Right-aligned REF NO inside top navy band */}
          <div className="absolute top-0 right-0 h-[38px] sm:h-[47px] pr-6 sm:pr-12 flex items-center justify-end pointer-events-none">
            <span className="text-[10px] sm:text-xs font-semibold tracking-wider text-white font-mono">
              REF NO: {refNo || 'JDI-OFFICIAL'}
            </span>
          </div>
        </div>

        {/* 2. PERMANENT CENTER WATERMARK EMBLEM (Exact match to drawPermanentPageWatermark in pdfWatermark.ts) */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-0 overflow-hidden"
        >
          <img
            src={PERMANENT_WATERMARK_ASSET_PATH}
            alt=""
            className={`w-[340px] sm:w-[430px] max-w-[64%] object-contain select-none ${
              isDarkPaper ? 'opacity-[0.05]' : 'opacity-[0.075] invert brightness-0'
            }`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Optional Print Margin Guides */}
        {showMarginGuides && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-7 sm:inset-x-12 md:inset-x-14 top-[110px] bottom-[88px] border border-dashed border-sky-400/45 z-20"
          />
        )}

        {/* 3. INSTITUTIONAL LETTERHEAD HEADER + EDITABLE DOCUMENT BODY */}
        <div className={`relative z-10 flex-1 flex flex-col ${paddingClass} pt-2 pb-8`}>
          {/* Centered Institutional Title & Classification Subtitle (Exact match to drawInstitutionalDocumentHeader) */}
          <header className="text-center pb-4 mb-5 border-b border-slate-200/90 dark:border-slate-800 select-none">
            <h1
              className={`text-lg sm:text-[22px] font-black tracking-tight uppercase leading-tight ${
                isDarkPaper ? 'text-white' : 'text-[#0F172A]'
              }`}
            >
              {institutionTitle || JDI_INSTITUTION_NAME}
            </h1>
            <p
              className={`text-[10px] sm:text-[11.5px] font-extrabold tracking-widest uppercase mt-1 ${
                isDarkPaper ? 'text-slate-300' : 'text-[#1E293B]'
              }`}
            >
              {subtitleLine}
            </p>

            {/* Compact Institutional Metadata Strip */}
            {metadataItems.length > 0 && (
              <div
                className={`mt-3.5 rounded-lg border px-3.5 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-left text-[11px] ${
                  isDarkPaper
                    ? 'bg-slate-900/70 border-slate-800 text-slate-200'
                    : 'bg-[#F8FAFC] border-[#CBD5E1]/80 text-[#0F172A]'
                }`}
              >
                {metadataItems.map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="min-w-0">
                    <span
                      className={`block text-[9px] font-bold uppercase tracking-wider ${
                        isDarkPaper ? 'text-slate-400' : 'text-[#64748B]'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="block font-bold truncate mt-0.5">{item.value}</span>
                  </div>
                ))}
              </div>
            )}

            {dateLabel && metadataItems.length === 0 && (
              <p
                className={`text-[10px] font-medium mt-1 ${
                  isDarkPaper ? 'text-slate-400' : 'text-[#64748B]'
                }`}
              >
                {dateLabel} · v{versionNumber} {statusLabel ? `· ${statusLabel}` : ''}
              </p>
            )}
          </header>

          {/* Main Document Content Slot */}
          <div className="flex-1">{children}</div>
        </div>

        {/* 4. BOTTOM OFFICIAL CONTACT FOOTER & RIGHT FACETED GEOMETRIC CORNER (Exact match to pdfFooter.ts) */}
        <footer className="relative z-10 w-full pt-3 select-none shrink-0">
          <div
            className={`${paddingClass} pb-4 pr-24 sm:pr-44 flex flex-col gap-1.5 relative z-10`}
          >
            {/* Contact Row: Email, Handle, Website */}
            <div
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] sm:text-[11px] font-medium ${
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
                <span className="w-4 h-4 rounded-full border border-[#0C2340] text-[#0C2340] dark:border-slate-400 dark:text-slate-300 inline-flex items-center justify-center shrink-0">
                  <Globe size={9} />
                </span>
                <span>{JDI_CONTACTS.website}</span>
              </span>
            </div>

            {/* Bottom-Left Pagination Counter */}
            <div
              className={`text-[9.5px] font-medium tabular-nums ${
                isDarkPaper ? 'text-slate-500' : 'text-[#64748B]'
              }`}
            >
              Page {pageNumber} of {Math.max(1, totalPages)}
            </div>
          </div>

          {/* Bottom-Right Navy Faceted Polygon Corner Accent (Exact match to drawBottomRightGeometricCorner) */}
          <svg
            viewBox="0 0 210 24"
            preserveAspectRatio="none"
            className="absolute bottom-0 right-0 w-full h-[46px] sm:h-[56px] pointer-events-none"
            aria-hidden="true"
          >
            {/* Steel-blue outer corner wedge */}
            <polygon points="142,24 176,4 210,4 210,24" fill="#193B68" />
            {/* Obsidian-navy crisp central polygon */}
            <polygon points="164,24 182,6 200,24" fill="#061326" />
            {/* Primary navy outer right edge */}
            <polygon points="186,24 210,3 210,24" fill="#0C2340" />
          </svg>
        </footer>
      </div>
    </div>
  );
};

export default OfficialA4PageFrame;
