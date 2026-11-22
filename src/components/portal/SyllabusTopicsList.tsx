import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Circle, Clock } from 'lucide-react';

export interface SyllabusTopicsListProps {
  topics: string[];
  /** Overall percentage (0–100) for the active programme/unit */
  overallProgress: number;
  /** Optional explicit completed topic titles */
  completedTopics?: string[];
  /** Optional right-side header action (e.g. a link) */
  headerAction?: React.ReactNode;
  /** Maximum visible rows when collapsed for long tracks */
  collapsedLimit?: number;
  /** Whether to start expanded */
  defaultExpanded?: boolean;
  /** Optional custom heading text (defaults to "Syllabus Topics") */
  heading?: string;
}

interface ComputedTopicItem {
  index: number;
  title: string;
  state: 'completed' | 'active' | 'pending';
  activePercent: number;
}

export const SyllabusTopicsList: React.FC<SyllabusTopicsListProps> = ({
  topics,
  overallProgress,
  completedTopics = [],
  headerAction,
  collapsedLimit = 8,
  defaultExpanded = false,
  heading = 'Syllabus Topics',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const clampedOverall = Math.max(0, Math.min(100, Math.round(Number(overallProgress) || 0)));

  const items: ComputedTopicItem[] = useMemo(() => {
    if (!topics.length) return [];

    const completedSet = new Set(
      completedTopics.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean)
    );

    const exactProgressUnits = (clampedOverall / 100) * topics.length;
    const completedCountByProgress = Math.floor(exactProgressUnits);
    const partialFraction = Math.round((exactProgressUnits - completedCountByProgress) * 100);

    // If overallProgress === 100, all topics are completed.
    if (clampedOverall >= 100) {
      return topics.map((title, idx) => ({
        index: idx,
        title,
        state: 'completed',
        activePercent: 100,
      }));
    }

    // Determine active topic index
    let activeIdx = completedCountByProgress;
    if (completedSet.size > 0) {
      // Find first topic not explicitly completed
      const firstUncompleted = topics.findIndex(
        (t) => !completedSet.has(String(t || '').trim().toLowerCase())
      );
      if (firstUncompleted >= 0) {
        activeIdx = Math.max(activeIdx, firstUncompleted);
      } else {
        activeIdx = topics.length; // All explicitly completed
      }
    }
    if (activeIdx >= topics.length && clampedOverall < 100) {
      activeIdx = topics.length - 1;
    }

    const activeTopicPct =
      clampedOverall === 0
        ? 0
        : partialFraction > 0
        ? partialFraction
        : Math.max(10, Math.min(95, clampedOverall));

    return topics.map((title, idx) => {
      const normalized = String(title || '').trim().toLowerCase();
      if (idx < activeIdx || completedSet.has(normalized)) {
        return {
          index: idx,
          title,
          state: 'completed',
          activePercent: 100,
        };
      }
      if (idx === activeIdx) {
        return {
          index: idx,
          title,
          state: 'active',
          activePercent: activeTopicPct,
        };
      }
      return {
        index: idx,
        title,
        state: 'pending',
        activePercent: 0,
      };
    });
  }, [topics, clampedOverall, completedTopics]);

  const completedTotal = useMemo(
    () => items.filter((i) => i.state === 'completed').length,
    [items]
  );

  const visibleItems = useMemo(() => {
    if (expanded || items.length <= collapsedLimit) {
      return items;
    }
    const activeIdx = items.findIndex((i) => i.state === 'active');
    const anchor = activeIdx >= 0 ? activeIdx : 0;
    // Show up to 2 completed topics before active, the active topic, and remaining upcoming topics up to collapsedLimit
    let start = Math.max(0, anchor - 2);
    if (start + collapsedLimit > items.length) {
      start = Math.max(0, items.length - collapsedLimit);
    }
    return items.slice(start, start + collapsedLimit);
  }, [items, expanded, collapsedLimit]);

  const hiddenCount = items.length - visibleItems.length;

  if (!topics.length) return null;

  return (
    <div className="space-y-3">
      {/* Header Row — Clean Title + Unboxed Count + Optional Action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-bold text-[#14284B] dark:text-white tracking-tight">
            {heading}
          </h3>
          <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 tabular-nums">
            {completedTotal} of {items.length} completed
          </span>
        </div>

        <div className="flex items-center gap-3">
          {headerAction}
          {items.length > collapsedLimit && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#14284B] dark:text-zinc-300 hover:text-[#B91C1C] dark:hover:text-white transition-colors cursor-pointer"
            >
              {expanded ? (
                <>
                  <span>Collapse</span>
                  <ChevronUp size={14} />
                </>
              ) : (
                <>
                  <span>Show all {items.length} topics</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Structured Vertical List */}
      <div className="divide-y divide-slate-200/80 dark:divide-zinc-800/80 border-t border-b border-slate-200/80 dark:border-zinc-800/80">
        {visibleItems.map((item) => {
          const isCompleted = item.state === 'completed';
          const isActive = item.state === 'active';

          return (
            <div
              key={`${item.index}-${item.title}`}
              className={`py-3 px-2 sm:px-3 transition-colors ${
                isActive
                  ? 'bg-slate-50/90 dark:bg-[#18181B]'
                  : 'hover:bg-slate-50/50 dark:hover:bg-zinc-900/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Index */}
                  <span
                    className={`font-mono text-xs font-bold tabular-nums w-6 shrink-0 ${
                      isActive
                        ? 'text-[#B91C1C] dark:text-red-400'
                        : isCompleted
                        ? 'text-[#14284B] dark:text-zinc-300'
                        : 'text-slate-400 dark:text-zinc-600'
                    }`}
                  >
                    {String(item.index + 1).padStart(2, '0')}
                  </span>

                  {/* Status Icon */}
                  <span className="shrink-0 flex items-center justify-center">
                    {isCompleted ? (
                      <Check size={15} className="text-[#14284B] dark:text-zinc-200 stroke-[2.5]" />
                    ) : isActive ? (
                      <Clock size={14} className="text-[#B91C1C] dark:text-red-400" />
                    ) : (
                      <Circle size={12} className="text-slate-300 dark:text-zinc-700" />
                    )}
                  </span>

                  {/* Topic Title */}
                  <span
                    className={`text-xs sm:text-sm truncate ${
                      isActive
                        ? 'font-bold text-[#14284B] dark:text-white'
                        : isCompleted
                        ? 'font-medium text-slate-700 dark:text-zinc-300'
                        : 'font-normal text-slate-500 dark:text-zinc-500'
                    }`}
                  >
                    {item.title}
                  </span>
                </div>

                {/* Unboxed Status Text (Zero Pill Badges) */}
                <span
                  className={`text-[11px] font-semibold shrink-0 tabular-nums ${
                    isCompleted
                      ? 'text-[#14284B] dark:text-zinc-300'
                      : isActive
                      ? 'text-[#B91C1C] dark:text-red-400 font-bold'
                      : 'text-slate-400 dark:text-zinc-500'
                  }`}
                >
                  {isCompleted
                    ? 'Completed'
                    : isActive
                    ? item.activePercent > 0
                      ? `In Progress · ${item.activePercent}%`
                      : 'Current Topic'
                    : 'Pending'}
                </span>
              </div>

              {/* Active Topic Inline Progress Bar */}
              {isActive && (
                <div className="mt-2.5 pl-9 pr-1">
                  <div className="h-1.5 w-full bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#B91C1C] dark:bg-[#DC2626] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.max(4, item.activePercent)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expand Footer Button when Collapsed */}
      {!expanded && hiddenCount > 0 && (
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs font-semibold text-[#B91C1C] dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>View {hiddenCount} more topic{hiddenCount === 1 ? '' : 's'}</span>
            <ChevronDown size={13} />
          </button>
        </div>
      )}
    </div>
  );
};

export default SyllabusTopicsList;
