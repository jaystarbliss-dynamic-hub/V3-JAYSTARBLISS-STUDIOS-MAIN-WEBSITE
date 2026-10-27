import React from 'react';

/**
 * Base Shimmer Skeleton
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`glass-skeleton-pulse rounded-md ${className}`} />
);

/**
 * Metric Summary Card Skeleton
 */
export const MetricCardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 ${className}`}>
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-28 rounded-md" />
      <Skeleton className="h-7 w-7 rounded-lg" />
    </div>
    <Skeleton className="h-8 w-20 rounded-lg" />
    <Skeleton className="h-3.5 w-36 rounded-md" />
  </div>
);

/**
 * Metric Grid Skeleton (3, 4, or 5 cards)
 */
export const MetricGridSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 3,
  className = '',
}) => {
  const gridCols =
    count === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : count === 5
      ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5'
      : 'grid-cols-1 sm:grid-cols-3';

  return (
    <div className={`grid gap-3 sm:gap-4 ${gridCols} ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
  );
};

/**
 * Table Skeleton matching data table headers & rows
 */
export const TableSkeleton: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
  showHeader?: boolean;
}> = ({ rows = 5, columns = 4, className = '', showHeader = true }) => {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          {showHeader && (
            <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {Array.from({ length: columns }).map((_, c) => (
                  <th key={c} className="p-3.5">
                    <Skeleton className={`h-4 ${c === 0 ? 'w-32' : c === columns - 1 ? 'w-16 ml-auto' : 'w-24'}`} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                {Array.from({ length: columns }).map((_, c) => (
                  <td key={c} className="p-3.5">
                    {c === 0 ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    ) : c === columns - 1 ? (
                      <div className="flex justify-end">
                        <Skeleton className="h-7 w-20 rounded-lg" />
                      </div>
                    ) : (
                      <Skeleton className={`h-4 ${c % 2 === 0 ? 'w-24' : 'w-20'}`} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * Roster / Sidebar List Skeleton
 */
export const RosterListSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 6,
  className = '',
}) => {
  return (
    <div className={`space-y-2 p-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-100 dark:border-slate-800/80 p-3 space-y-2 bg-slate-50/40 dark:bg-white/[0.02]"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3.5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-24 rounded-md" />
        </div>
      ))}
    </div>
  );
};

/**
 * Assessment / Exam / Assignment Card List Skeleton
 */
export const ExamListSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 4,
  className = '',
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="space-y-2.5 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-4 w-20 rounded-full" />
            </div>
            <Skeleton className="h-5 w-3/4 max-w-md rounded-md" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-3.5 w-24 rounded-md" />
              <Skeleton className="h-3.5 w-20 rounded-md" />
              <Skeleton className="h-3.5 w-16 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Schedule / Timeline Session Skeleton
 */
export const ScheduleTimelineSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 3,
  className = '',
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-5 w-44 rounded-md" />
            </div>
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 p-3.5 space-y-2 bg-slate-50/50 dark:bg-white/[0.02]">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3.5 w-20 rounded-md" />
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 p-3.5 space-y-2 bg-slate-50/50 dark:bg-white/[0.02]">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3.5 w-20 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Form / Wizard Skeleton
 */
export const FormSkeleton: React.FC<{
  fields?: number;
  className?: string;
  hasFooter?: boolean;
}> = ({ fields = 4, className = '', hasFooter = true }) => {
  return (
    <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5 ${className}`}>
      <div className="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-4">
        <Skeleton className="h-6 w-1/3 rounded-md" />
        <Skeleton className="h-3.5 w-2/3 rounded-md" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
      {hasFooter && (
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-5">
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      )}
    </div>
  );
};

/**
 * Document Reader / Agreement / Report Skeleton
 */
export const DocumentReaderSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-6 ${className}`}>
      <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
        <Skeleton className="h-7 w-2/3 rounded-lg" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-3.5 w-32 rounded-md" />
          <Skeleton className="h-3.5 w-28 rounded-md" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-11/12 rounded-md" />
        <Skeleton className="h-4 w-4/5 rounded-md" />
      </div>
      <div className="space-y-3 pt-2">
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-5/6 rounded-md" />
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-5">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
    </div>
  );
};

/**
 * Standard Card Skeleton
 */
export const CardSkeleton: React.FC<{
  className?: string;
  variant?: 'standard' | 'program' | 'service' | 'portfolio' | 'blog';
}> = ({ className = '', variant = 'standard' }) => {
  if (variant === 'program') {
    return (
      <div className={`flex flex-col glass-card rounded-2xl sm:rounded-3xl overflow-hidden h-full ${className}`}>
        <Skeleton className="h-48 w-full rounded-none" />
        <div className="p-6 sm:p-8 flex flex-col flex-grow space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-7 w-3/4" />
          <div className="space-y-2 flex-grow">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="mt-auto pt-4 border-t border-slate-200/40 dark:border-white/5 flex items-center justify-between">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-8 w-1/4 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col glass-card rounded-2xl sm:rounded-3xl overflow-hidden h-full ${className}`}>
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="p-6 sm:p-8 flex flex-col flex-grow space-y-4">
        <Skeleton className="h-7 w-3/4" />
        <div className="space-y-2 flex-grow">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="mt-auto pt-4 border-t border-slate-200/40 dark:border-white/5 flex items-center justify-between">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-8 w-1/4 rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export { GlassCardSkeleton, GlassGridSkeleton } from './GlassCardSkeleton';
