import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, FileText, Info } from 'lucide-react';
import type {
  AssessmentComprehensionItem,
  AssessmentContentBlockItem,
  AssessmentSection,
} from '../../lib/classes';

interface SectionBannerProps {
  section: AssessmentSection;
  sectionIndex: number;
  totalSections: number;
  compact?: boolean;
}

export const SectionBanner: React.FC<SectionBannerProps> = ({
  section,
  sectionIndex,
  totalSections,
  compact = false,
}) => {
  const hasCustomTitle =
    section.title.trim().length > 0 &&
    !(totalSections === 1 && section.title.trim().toLowerCase() === 'section 1' && !section.description?.trim());

  if (!hasCustomTitle && !section.description?.trim()) {
    return null;
  }

  return (
    <div
      className={`${
        compact ? 'pb-2 mb-3' : 'pt-2 pb-3 mb-1'
      } border-b border-slate-200 dark:border-slate-800`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        {totalSections > 1 && (
          <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400 tabular-nums">
            Section {sectionIndex + 1} of {totalSections}
          </span>
        )}
        {totalSections > 1 && section.title.trim() && (
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
        )}
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          {section.title.trim() || `Section ${sectionIndex + 1}`}
        </h2>
      </div>
      {section.description?.trim() && (
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line max-w-[72ch]">
          {section.description.trim()}
        </p>
      )}
    </div>
  );
};

interface ContentBlockCardProps {
  block: AssessmentContentBlockItem;
  compact?: boolean;
}

export const ContentBlockCard: React.FC<ContentBlockCardProps> = ({ block, compact = false }) => {
  const isInstruction = block.blockType === 'instruction';

  return (
    <div
      className={`rounded-2xl border ${
        isInstruction
          ? 'border-amber-200/80 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50'
      } ${compact ? 'p-4' : 'p-5 sm:p-6'}`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {isInstruction ? (
          <Info size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
        ) : (
          <FileText size={14} className="text-slate-500 dark:text-slate-400 shrink-0" />
        )}
        <span>{isInstruction ? 'Instructions' : 'Note'}</span>
        {block.title?.trim() && (
          <>
            <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
              ·
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{block.title.trim()}</span>
          </>
        )}
      </div>
      {block.body?.trim() && (
        <div className="mt-2.5 text-sm sm:text-[15px] text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line max-w-[75ch]">
          {block.body}
        </div>
      )}
    </div>
  );
};

interface ComprehensionPassagePanelProps {
  comprehension: AssessmentComprehensionItem;
  questionRangeLabel?: string;
  defaultCollapsed?: boolean;
}

export const ComprehensionPassagePanel: React.FC<ComprehensionPassagePanelProps> = ({
  comprehension,
  questionRangeLabel,
  defaultCollapsed = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section
      aria-label={comprehension.title?.trim() || 'Reading Passage'}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] overflow-hidden shadow-2xs"
    >
      <div className="px-5 py-3.5 sm:px-6 border-b border-slate-100 dark:border-slate-800/90 bg-slate-50/80 dark:bg-slate-900/60 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <BookOpen size={14} className="text-[#B91C1C] dark:text-red-400 shrink-0" />
            <span className="font-semibold text-slate-700 dark:text-slate-200">Reading Passage</span>
            {questionRangeLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{questionRangeLabel}</span>
              </>
            )}
          </div>
          {comprehension.title?.trim() && (
            <h3 className="mt-1 text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              {comprehension.title.trim()}
            </h3>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0 whitespace-nowrap"
        >
          <span>{collapsed ? 'Show passage' : 'Collapse'}</span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="text-[15px] sm:text-base text-slate-800 dark:text-slate-200 leading-[1.75] whitespace-pre-line max-w-[74ch]">
            {comprehension.body?.trim() || (
              <span className="italic text-slate-400 dark:text-slate-500">
                No passage text provided.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
