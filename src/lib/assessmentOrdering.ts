export type AssessmentSortOrder = 'newest' | 'oldest' | 'alpha';

export type AssessmentRecencyBucketKey = 'most_recent' | 'this_month' | 'older';

export interface AssessmentRecencyGroup<T> {
  key: AssessmentRecencyBucketKey;
  label: string;
  subtitle: string;
  items: T[];
}

export interface AssessmentOrderingOptions {
  mode?: 'general' | 'concluded';
  nowMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 7;
const MONTH_WINDOW_DAYS = 30;

/**
 * Safely converts Firestore Timestamps, serialized {_seconds}/{seconds} objects,
 * Date instances, ISO strings, or numeric epoch values into milliseconds.
 * Returns 0 when missing or unparseable.
 */
export function toTimestampMs(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0;
    // Handle seconds vs milliseconds gracefully
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1e11 ? Math.round(numeric * 1000) : Math.round(numeric);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (typeof obj.toDate === 'function') {
      try {
        const d = obj.toDate();
        const ms = d instanceof Date ? d.getTime() : 0;
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
      } catch {
        return 0;
      }
    }
    if (typeof obj.seconds === 'number' && Number.isFinite(obj.seconds)) {
      return Math.round(obj.seconds * 1000 + Number(obj.nanoseconds || 0) / 1e6);
    }
    if (typeof obj._seconds === 'number' && Number.isFinite(obj._seconds)) {
      return Math.round(obj._seconds * 1000 + Number(obj._nanoseconds || 0) / 1e6);
    }
  }
  return 0;
}

/**
 * Computes the canonical recency timestamp (in ms) for an assessment.
 *
 * - In `'concluded'` mode (Assessment History / Archive), prioritizes completion/closing
 *   timestamps (`manuallyClosedAt`, `completedAt`, `closedAt`, past `availableUntil`/`dueDate`,
 *   `updatedAt`, `publishedAt`, `createdAt`) so just-concluded assessments always float to the top.
 * - In `'general'` mode (Assessment Overview & filter dropdowns), prioritizes actual authoring/activity
 *   timestamps (`manuallyClosedAt`, `updatedAt`, `publishedAt`, `createdAt`) so an older active exam
 *   with a far-future closing date never jumps ahead of a newly published assessment.
 */
export function getAssessmentRecencyTimestampMs(
  exam: Record<string, any> | null | undefined,
  options: AssessmentOrderingOptions = {}
): number {
  if (!exam || typeof exam !== 'object') return 0;
  const mode = options.mode || 'general';
  const nowMs = options.nowMs ?? Date.now();

  const manuallyClosedAt = toTimestampMs(exam.manuallyClosedAt);
  const completedAt = toTimestampMs(exam.completedAt || exam.closedAt);
  const updatedAt = toTimestampMs(exam.updatedAt);
  const publishedAt = toTimestampMs(exam.publishedAt);
  const createdAt = toTimestampMs(exam.createdAt);
  const availableFrom = toTimestampMs(exam.availableFrom);
  const availableUntil = toTimestampMs(exam.availableUntil);
  const dueDate = toTimestampMs(exam.dueDate);

  const statusLower = String(exam.status || '').trim().toLowerCase();
  const isConcluded =
    mode === 'concluded' ||
    statusLower === 'completed' ||
    statusLower === 'closed' ||
    manuallyClosedAt > 0;

  if (isConcluded) {
    // Only consider deadline dates that have already passed (or all if no activity stamps exist)
    const pastClosing = availableUntil > 0 && availableUntil <= nowMs ? availableUntil : 0;
    const pastDue = dueDate > 0 && dueDate <= nowMs ? dueDate : 0;
    const bestConcluded = Math.max(
      manuallyClosedAt,
      completedAt,
      pastClosing,
      pastDue,
      updatedAt,
      publishedAt,
      createdAt
    );
    if (bestConcluded > 0) return bestConcluded;
    return Math.max(availableUntil, dueDate, availableFrom, 0);
  }

  const bestActivity = Math.max(updatedAt, publishedAt, createdAt);
  if (bestActivity > 0) return bestActivity;
  return Math.max(availableFrom, availableUntil, dueDate, 0);
}

/**
 * Sorts assessments deterministically by newest first (default), oldest first, or A–Z title.
 */
export function sortAssessments<T extends Record<string, any>>(
  items: readonly T[],
  order: AssessmentSortOrder = 'newest',
  options: AssessmentOrderingOptions = {}
): T[] {
  const list = [...items];
  const titleOf = (item: T) => String(item?.title || '').trim();

  if (order === 'alpha') {
    return list.sort((a, b) => {
      const cmp = titleOf(a).localeCompare(titleOf(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (cmp !== 0) return cmp;
      return (
        getAssessmentRecencyTimestampMs(b, options) - getAssessmentRecencyTimestampMs(a, options)
      );
    });
  }

  return list.sort((a, b) => {
    const tsA = getAssessmentRecencyTimestampMs(a, options);
    const tsB = getAssessmentRecencyTimestampMs(b, options);

    if (order === 'oldest') {
      // Push undated (0) items to the bottom even in oldest-first mode so real dated items lead
      if (tsA === 0 && tsB > 0) return 1;
      if (tsB === 0 && tsA > 0) return -1;
      if (tsA !== tsB) return tsA - tsB;
    } else {
      if (tsA !== tsB) return tsB - tsA;
    }

    return titleOf(a).localeCompare(titleOf(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

/**
 * Groups assessments into clean Gmail-style recency sections (Most Recent, Earlier This Month,
 * Older Assessments), keeping each bucket ordered newest → oldest and omitting empty buckets.
 */
export function groupAssessmentsByRecency<T extends Record<string, any>>(
  items: readonly T[],
  options: AssessmentOrderingOptions = {}
): AssessmentRecencyGroup<T>[] {
  const nowMs = options.nowMs ?? Date.now();
  const mode = options.mode || 'general';
  const sorted = sortAssessments(items, 'newest', { mode, nowMs });

  const mostRecent: T[] = [];
  const thisMonth: T[] = [];
  const older: T[] = [];

  for (const item of sorted) {
    const ts = getAssessmentRecencyTimestampMs(item, { mode, nowMs });
    if (ts <= 0) {
      older.push(item);
      continue;
    }
    const ageMs = nowMs - ts;
    if (ageMs <= RECENT_WINDOW_DAYS * DAY_MS) {
      mostRecent.push(item);
    } else if (ageMs <= MONTH_WINDOW_DAYS * DAY_MS) {
      thisMonth.push(item);
    } else {
      older.push(item);
    }
  }

  const groups: AssessmentRecencyGroup<T>[] = [];
  if (mostRecent.length > 0) {
    groups.push({
      key: 'most_recent',
      label: mode === 'concluded' ? 'Most Recent & Just Concluded' : 'Most Recent',
      subtitle: 'Last 7 days',
      items: mostRecent,
    });
  }
  if (thisMonth.length > 0) {
    groups.push({
      key: 'this_month',
      label: 'Earlier This Month',
      subtitle: '8–30 days ago',
      items: thisMonth,
    });
  }
  if (older.length > 0) {
    groups.push({
      key: 'older',
      label: 'Older Assessments',
      subtitle: 'More than 30 days ago',
      items: older,
    });
  }
  return groups;
}

/**
 * Formats a concise Gmail-style relative/short date label for an assessment row or dropdown option.
 */
export function formatAssessmentRecencyLabel(
  exam: Record<string, any> | null | undefined,
  options: AssessmentOrderingOptions = {}
): string {
  const nowMs = options.nowMs ?? Date.now();
  const ts = getAssessmentRecencyTimestampMs(exam, options);
  if (ts <= 0) return 'Undated';

  const date = new Date(ts);
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / DAY_MS);

  if (dayDiff === 0) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  if (dayDiff > 1 && dayDiff <= 6) {
    return `${dayDiff} days ago`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Sorts dropdown string labels cleanly in numeric-aware alphabetical order (e.g. Grade 1, Grade 2, Grade 10).
 */
export function sortDropdownLabels(items: readonly string[]): string[] {
  return [...items].sort((a, b) =>
    String(a || '').localeCompare(String(b || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

/**
 * Sorts named entities (schools, learners, programmes, profiles) alphabetically (A–Z).
 */
export function sortNamedEntities<
  T extends { name?: string | null; fullName?: string | null; title?: string | null }
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const labelA = String(a?.name || a?.fullName || a?.title || '').trim();
    const labelB = String(b?.name || b?.fullName || b?.title || '').trim();
    return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: 'base' });
  });
}
