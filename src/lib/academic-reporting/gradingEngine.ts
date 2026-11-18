import { formatDocumentRefNo } from '../pdf/documentBranding';
import type {
  AcademicEvidenceItem,
  AcademicGradingProfile,
  AcademicReportType,
  AcademicTermConfig,
  AcademicTermKey,
  AcademicWorkSourceType,
  AttendancePeriodSummary,
  CalculationAuditBreakdown,
  CategoryCalculationResult,
  GradeBoundaryConfig,
  GradingCategoryConfig,
  MilestonePeriodSummary,
  ProgrammePerformanceSummary,
  SubjectPerformanceSummary,
  TermComparisonItem,
} from './types';

export const DEFAULT_JDI_GRADE_BOUNDARIES: GradeBoundaryConfig[] = [
  { grade: 'A', minPercentage: 70, maxPercentage: 100, label: 'Distinction', isPass: true },
  { grade: 'B', minPercentage: 60, maxPercentage: 69.99, label: 'Very Good', isPass: true },
  { grade: 'C', minPercentage: 50, maxPercentage: 59.99, label: 'Credit', isPass: true },
  { grade: 'D', minPercentage: 45, maxPercentage: 49.99, label: 'Pass', isPass: true },
  { grade: 'E', minPercentage: 40, maxPercentage: 44.99, label: 'Fair Pass', isPass: true },
  { grade: 'F', minPercentage: 0, maxPercentage: 39.99, label: 'Fail', isPass: false },
];

export const DEFAULT_JDI_CATEGORIES: GradingCategoryConfig[] = [
  {
    id: 'cat_assignments_projects',
    name: 'Assignments & Projects',
    weight: 20,
    aggregationMethod: 'TOTAL_MARKS',
    sourceWorkTypes: ['ASSIGNMENT', 'PROJECT'],
    enabled: true,
    description: 'Take-home coursework, coding deliverables, and project submissions',
  },
  {
    id: 'cat_activities',
    name: 'Class Activities & Practicals',
    weight: 10,
    aggregationMethod: 'TOTAL_MARKS',
    sourceWorkTypes: ['ACTIVITY', 'PRACTICAL'],
    enabled: true,
    description: 'Graded studio tasks, practical exercises, and lab work',
  },
  {
    id: 'cat_quizzes',
    name: 'Quizzes',
    weight: 10,
    aggregationMethod: 'PERCENTAGE_AVERAGE',
    sourceWorkTypes: ['QUIZ'],
    enabled: true,
    description: 'Short concept checks and module quizzes',
  },
  {
    id: 'cat_tests',
    name: 'Tests & Mid-Term Assessments',
    weight: 20,
    aggregationMethod: 'PERCENTAGE_AVERAGE',
    sourceWorkTypes: ['TEST', 'MID_TERM'],
    enabled: true,
    description: 'Continuous assessment tests and mid-term evaluations',
  },
  {
    id: 'cat_examinations',
    name: 'Final Examinations',
    weight: 40,
    aggregationMethod: 'TOTAL_MARKS',
    sourceWorkTypes: ['EXAMINATION'],
    enabled: true,
    description: 'End-of-term, end-of-programme, or session examinations',
  },
];

export function createStarterGradingProfiles(actorUid = 'system', actorName = 'Jaystarbliss System'): AcademicGradingProfile[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'preset_school_standard',
      name: 'School Standard Grading Profile',
      description: 'Balanced 5-category institutional evaluation framework for partner schools.',
      scopeType: 'SCHOOL',
      enrolmentTarget: 'SCHOOL',
      version: 1,
      categories: DEFAULT_JDI_CATEGORIES.map((c) => ({ ...c })),
      gradeBoundaries: DEFAULT_JDI_GRADE_BOUNDARIES.map((b) => ({ ...b })),
      passMark: 45,
      missingWorkPolicy: 'FLAG_INCOMPLETE',
      emptyCategoryPolicy: 'RETAIN_AND_FLAG',
      sessionCalculationMethod: 'EQUAL_TERM_WEIGHTS',
      termWeights: { TERM_1: 33.33, TERM_2: 33.33, TERM_3: 33.34 },
      includeAttendanceInGrade: false,
      attendanceWeight: 0,
      isDefaultPreset: true,
      createdBy: actorUid,
      createdByName: actorName,
      updatedBy: actorUid,
      updatedByName: actorName,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'preset_private_programme',
      name: 'Practical Technology & Private Programme Profile',
      description: 'Emphasizes practical deliverables, projects, and milestone assessments for private learners.',
      scopeType: 'PROGRAMME',
      enrolmentTarget: 'PRIVATE',
      version: 1,
      categories: [
        {
          id: 'cat_assignments_projects',
          name: 'Projects & Assignments',
          weight: 30,
          aggregationMethod: 'TOTAL_MARKS',
          sourceWorkTypes: ['ASSIGNMENT', 'PROJECT'],
          enabled: true,
        },
        {
          id: 'cat_practical_activities',
          name: 'Practical Tasks & Activities',
          weight: 20,
          aggregationMethod: 'TOTAL_MARKS',
          sourceWorkTypes: ['ACTIVITY', 'PRACTICAL'],
          enabled: true,
        },
        {
          id: 'cat_quizzes_tests',
          name: 'Quizzes & Module Tests',
          weight: 20,
          aggregationMethod: 'PERCENTAGE_AVERAGE',
          sourceWorkTypes: ['QUIZ', 'TEST', 'MID_TERM'],
          enabled: true,
        },
        {
          id: 'cat_final_exam',
          name: 'Capstone & Final Assessment',
          weight: 30,
          aggregationMethod: 'TOTAL_MARKS',
          sourceWorkTypes: ['EXAMINATION'],
          enabled: true,
        },
      ],
      gradeBoundaries: DEFAULT_JDI_GRADE_BOUNDARIES.map((b) => ({ ...b })),
      passMark: 50,
      missingWorkPolicy: 'FLAG_INCOMPLETE',
      emptyCategoryPolicy: 'RETAIN_AND_FLAG',
      sessionCalculationMethod: 'EQUAL_TERM_WEIGHTS',
      termWeights: { TERM_1: 33.33, TERM_2: 33.33, TERM_3: 33.34 },
      includeAttendanceInGrade: false,
      attendanceWeight: 0,
      isDefaultPreset: true,
      createdBy: actorUid,
      createdByName: actorName,
      updatedBy: actorUid,
      updatedByName: actorName,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function normalizeReferenceCode(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function getReportReferencePrefix(reportType: AcademicReportType): string {
  switch (reportType) {
    case 'SCHOOL_TERM':
      return 'JDI-TRM';
    case 'SCHOOL_SESSION':
      return 'JDI-SES';
    case 'PRIVATE_PROGRAMME':
      return 'JDI-PRG';
    case 'PRIVATE_ANNUAL':
      return 'JDI-ANN';
    default:
      return 'JDI-RPT';
  }
}

/**
 * Generates or preserves a deterministic, permanent report reference number using the
 * established Jaystarbliss `formatDocumentRefNo` algorithm.
 */
export function allocateReportReferenceNumber(params: {
  existingRef?: string | null;
  reportType: AcademicReportType;
  studentId: string;
  periodId: string;
  programId?: string;
  termKey?: string;
  version?: number;
}): string {
  const existing = String(params.existingRef || '').trim();
  if (existing && existing.toUpperCase().startsWith('JDI-')) {
    return existing.toUpperCase();
  }
  const prefix = getReportReferencePrefix(params.reportType);
  const seed = [
    params.reportType,
    params.studentId,
    params.periodId,
    params.termKey || '',
    params.programId || '',
    params.version && params.version > 1 ? `v${params.version}` : 'v1',
  ].join(':');
  return formatDocumentRefNo(prefix, seed);
}

/**
 * Validates that enabled grading categories sum to 100% (plus attendanceWeight if enabled).
 */
export function validateCategoryWeights(
  categories: GradingCategoryConfig[],
  includeAttendanceInGrade = false,
  attendanceWeight = 0
): { valid: boolean; totalWeight: number; error?: string } {
  const enabled = (categories || []).filter((c) => c.enabled);
  if (enabled.length === 0) {
    return {
      valid: false,
      totalWeight: 0,
      error: 'At least one grading category must be enabled.',
    };
  }
  for (const cat of enabled) {
    if (!Number.isFinite(cat.weight) || cat.weight < 0 || cat.weight > 100) {
      return {
        valid: false,
        totalWeight: 0,
        error: `Category "${cat.name}" has an invalid weight (${cat.weight}%).`,
      };
    }
  }
  const catSum = enabled.reduce((acc, c) => acc + Number(c.weight || 0), 0);
  const attWeight = includeAttendanceInGrade ? Math.max(0, Number(attendanceWeight || 0)) : 0;
  const totalWeight = Math.round((catSum + attWeight) * 100) / 100;
  if (Math.abs(totalWeight - 100) > 0.05) {
    return {
      valid: false,
      totalWeight,
      error: `Active category weights sum to ${totalWeight.toFixed(2)}%. Total must equal exactly 100%.`,
    };
  }
  return { valid: true, totalWeight };
}

/**
 * Validates that grade boundaries cover 0 to 100 without overlaps or invalid thresholds.
 */
export function validateGradeBoundaries(
  boundaries: GradeBoundaryConfig[]
): { valid: boolean; error?: string } {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    return { valid: false, error: 'At least one grade boundary must be defined.' };
  }
  const sorted = [...boundaries].sort((a, b) => b.minPercentage - a.minPercentage);
  for (let i = 0; i < sorted.length; i += 1) {
    const b = sorted[i];
    if (!String(b.grade || '').trim()) {
      return { valid: false, error: 'Every grade entry must have a grade letter or code.' };
    }
    if (
      !Number.isFinite(b.minPercentage) ||
      !Number.isFinite(b.maxPercentage) ||
      b.minPercentage < 0 ||
      b.maxPercentage > 100 ||
      b.minPercentage > b.maxPercentage
    ) {
      return {
        valid: false,
        error: `Grade "${b.grade}" has invalid range (${b.minPercentage}% – ${b.maxPercentage}%).`,
      };
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (b.maxPercentage >= prev.minPercentage) {
        return {
          valid: false,
          error: `Grade "${b.grade}" (${b.minPercentage}–${b.maxPercentage}%) overlaps with "${prev.grade}" (${prev.minPercentage}–${prev.maxPercentage}%).`,
        };
      }
      if (prev.minPercentage - b.maxPercentage > 1.01) {
        return {
          valid: false,
          error: `Unexplained gap between grade "${prev.grade}" (min ${prev.minPercentage}%) and "${b.grade}" (max ${b.maxPercentage}%).`,
        };
      }
    }
  }
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  if (highest.maxPercentage < 100) {
    return { valid: false, error: 'Highest grade boundary must reach 100%.' };
  }
  if (lowest.minPercentage > 0) {
    return { valid: false, error: 'Lowest grade boundary must start at 0%.' };
  }
  return { valid: true };
}

export function resolveGradeFromBoundaries(
  percentage: number | null,
  boundaries: GradeBoundaryConfig[] = DEFAULT_JDI_GRADE_BOUNDARIES,
  passMark = 45
): { grade: string; classification: string; isPass: boolean } {
  if (percentage === null || !Number.isFinite(percentage)) {
    return { grade: '—', classification: 'Incomplete / Pending', isPass: false };
  }
  const clamped = Math.max(0, Math.min(100, percentage));
  const sorted = [...(boundaries.length ? boundaries : DEFAULT_JDI_GRADE_BOUNDARIES)].sort(
    (a, b) => b.minPercentage - a.minPercentage
  );
  for (const b of sorted) {
    if (clamped >= b.minPercentage && clamped <= b.maxPercentage + 0.001) {
      return {
        grade: b.grade,
        classification: b.label || b.grade,
        isPass: b.isPass && clamped >= passMark,
      };
    }
  }
  const fallback = sorted[sorted.length - 1];
  return {
    grade: fallback?.grade || 'F',
    classification: fallback?.label || 'Fail',
    isPass: clamped >= passMark,
  };
}

/**
 * Classifies a raw work item into one of the canonical AcademicWorkSourceType values.
 */
export function classifyAcademicWorkSourceType(raw: {
  workType?: string;
  activityType?: string;
  title?: string;
  category?: string;
}): AcademicWorkSourceType {
  const token = String(
    raw.workType || raw.activityType || raw.category || ''
  )
    .trim()
    .toUpperCase();
  const titleLower = String(raw.title || '').trim().toLowerCase();

  if (token === 'PROJECT' || titleLower.includes('project') || titleLower.includes('capstone')) {
    return 'PROJECT';
  }
  if (token === 'PRACTICAL' || titleLower.includes('practical') || titleLower.includes('lab ')) {
    return 'PRACTICAL';
  }
  if (token === 'MID_TERM' || titleLower.includes('mid-term') || titleLower.includes('midterm')) {
    return 'MID_TERM';
  }
  if (token === 'QUIZ' || titleLower.includes('quiz')) {
    return 'QUIZ';
  }
  if (token === 'ASSIGNMENT') return 'ASSIGNMENT';
  if (token === 'ACTIVITY') return 'ACTIVITY';
  if (token === 'TEST') return 'TEST';
  if (token === 'EXAMINATION' || token === 'EXAM') return 'EXAMINATION';
  return 'EXAMINATION';
}

/**
 * Matches a work item's source type to the best enabled category in a grading profile.
 */
export function matchCategoryForWorkType(
  workType: AcademicWorkSourceType,
  categories: GradingCategoryConfig[]
): GradingCategoryConfig | null {
  const enabled = (categories || []).filter((c) => c.enabled);
  const exact = enabled.find((c) => (c.sourceWorkTypes || []).includes(workType));
  if (exact) return exact;

  // Fallback mapping when custom categories group similar work types
  const fallbackMap: Record<AcademicWorkSourceType, AcademicWorkSourceType[]> = {
    PROJECT: ['ASSIGNMENT'],
    PRACTICAL: ['ACTIVITY', 'TEST'],
    MID_TERM: ['TEST', 'EXAMINATION'],
    QUIZ: ['TEST', 'ACTIVITY'],
    ASSIGNMENT: ['PROJECT', 'ACTIVITY'],
    ACTIVITY: ['ASSIGNMENT', 'PRACTICAL'],
    TEST: ['QUIZ', 'MID_TERM', 'EXAMINATION'],
    EXAMINATION: ['TEST'],
    CUSTOM: ['ASSIGNMENT', 'ACTIVITY', 'TEST'],
  };

  for (const alt of fallbackMap[workType] || []) {
    const match = enabled.find((c) => (c.sourceWorkTypes || []).includes(alt));
    if (match) return match;
  }
  return enabled[0] || null;
}

/**
 * Checks whether a timestamp belongs within [startDate, endDate] inclusive.
 * Handles YYYY-MM-DD strings by treating endDate as 23:59:59.999 of that day.
 */
export function isDateWithinPeriod(
  isoOrDateStr: string | null | undefined,
  periodStartDate: string,
  periodEndDate: string
): boolean {
  if (!isoOrDateStr) return false;
  const itemMs = new Date(isoOrDateStr).getTime();
  if (!Number.isFinite(itemMs)) return false;

  const startMs = /^\d{4}-\d{2}-\d{2}$/.test(periodStartDate.trim())
    ? new Date(`${periodStartDate.trim()}T00:00:00.000Z`).getTime() - 12 * 3600 * 1000
    : new Date(periodStartDate).getTime();

  const endMs = /^\d{4}-\d{2}-\d{2}$/.test(periodEndDate.trim())
    ? new Date(`${periodEndDate.trim()}T23:59:59.999Z`).getTime() + 14 * 3600 * 1000
    : new Date(periodEndDate).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
  return itemMs >= startMs && itemMs <= endMs;
}

/**
 * Resolves which configured school term (TERM_1, TERM_2, TERM_3) a completion date falls into.
 */
export function resolveTermForDate(
  isoOrDateStr: string | null | undefined,
  terms: AcademicTermConfig[]
): AcademicTermKey | undefined {
  if (!isoOrDateStr || !Array.isArray(terms) || terms.length === 0) return undefined;
  for (const term of terms) {
    if (term.startDate && term.endDate && isDateWithinPeriod(isoOrDateStr, term.startDate, term.endDate)) {
      return term.termKey;
    }
  }
  return undefined;
}

/**
 * Normalizes a raw score and maximum marks into a standard percentage:
 * Percentage = (Earned Marks / Maximum Available Marks) * 100
 * Strictly validates both numerator and denominator and never invents a score.
 */
export function normalizeScoreToPercentage(
  rawEarnedMarks: number | null | undefined,
  maxAvailableMarks: number | null | undefined
): { valid: boolean; earned: number | null; max: number; percentage: number | null } {
  const max = Number(maxAvailableMarks);
  if (!Number.isFinite(max) || max <= 0) {
    return { valid: false, earned: null, max: 0, percentage: null };
  }
  if (rawEarnedMarks === null || rawEarnedMarks === undefined || !Number.isFinite(Number(rawEarnedMarks))) {
    return { valid: false, earned: null, max, percentage: null };
  }
  const earned = Math.max(0, Math.min(max, Number(rawEarnedMarks)));
  const percentage = Math.round(((earned / max) * 100) * 100) / 100;
  return { valid: true, earned, max, percentage };
}

/**
 * Deduplicates candidate evidence records by canonicalWorkId so mirrored records across
 * `assignments`, `assignmentSubmissions`, `jdiExams`, `schoolExams`, and `jdiExamAttempts`
 * contribute at most once per learner.
 *
 * When multiple attempts or submissions exist for the same canonical work item, selects:
 * 1. The officially released & graded result (latest by completion timestamp).
 * 2. Otherwise a graded result awaiting release.
 * 3. Otherwise a pending submission awaiting tutor marking.
 * 4. Otherwise the unsubmitted/missing work definition.
 */
export function deduplicateCanonicalEvidence(
  items: AcademicEvidenceItem[]
): AcademicEvidenceItem[] {
  const byCanonical = new Map<string, AcademicEvidenceItem>();

  const scorePriority = (item: AcademicEvidenceItem): number => {
    if (item.status === 'GRADED' && item.isReleased && item.normalizedPercentage !== null) return 50;
    if (item.status === 'GRADED' && item.normalizedPercentage !== null) return 40;
    if (item.status === 'PENDING_REVIEW') return 30;
    if (item.status === 'UNGRADED_ACTIVITY') return 20;
    if (item.status === 'MISSING') return 10;
    return 0;
  };

  for (const candidate of items) {
    const key = `${candidate.studentId}::${candidate.canonicalWorkId}`;
    const existing = byCanonical.get(key);
    if (!existing) {
      byCanonical.set(key, candidate);
      continue;
    }

    const pNew = scorePriority(candidate);
    const pOld = scorePriority(existing);

    if (pNew > pOld) {
      byCanonical.set(key, candidate);
    } else if (pNew === pOld) {
      const tNew = candidate.completedAt ? new Date(candidate.completedAt).getTime() : 0;
      const tOld = existing.completedAt ? new Date(existing.completedAt).getTime() : 0;
      if (tNew >= tOld) {
        byCanonical.set(key, candidate);
      }
    }
  }

  return Array.from(byCanonical.values());
}

export interface RunGradingCalculationParams {
  evidenceItems: AcademicEvidenceItem[];
  profile: AcademicGradingProfile;
  periodStartDate: string;
  periodEndDate: string;
  attendanceSummary: AttendancePeriodSummary;
  milestoneSummary: MilestonePeriodSummary;
  approveWeightRedistribution?: boolean;
  redistributionApprovedBy?: string;
  redistributionReason?: string;
  nowMs?: number;
}

export interface GradingCalculationOutput {
  overallPercentage: number | null;
  overallGrade: string;
  classification: string;
  isPass: boolean;
  isComplete: boolean;
  calculationBreakdown: CalculationAuditBreakdown;
  subjectBreakdowns: SubjectPerformanceSummary[];
  programmeBreakdowns: ProgrammePerformanceSummary[];
}

/**
 * Executes the core Jaystarbliss Academic Performance & Grading calculation for a learner
 * over a defined period using a specified grading profile.
 */
export function calculatePeriodAcademicPerformance(
  params: RunGradingCalculationParams
): GradingCalculationOutput {
  const {
    profile,
    periodStartDate,
    periodEndDate,
    attendanceSummary,
    milestoneSummary,
    approveWeightRedistribution = false,
    redistributionApprovedBy,
    redistributionReason,
    nowMs = Date.now(),
  } = params;

  const deduplicated = deduplicateCanonicalEvidence(params.evidenceItems);
  const warnings: string[] = [];
  const processedItems: AcademicEvidenceItem[] = [];

  for (const rawItem of deduplicated) {
    const item = { ...rawItem };
    const matchedCat = matchCategoryForWorkType(item.workType, profile.categories);
    if (matchedCat) {
      item.categoryId = matchedCat.id;
      item.categoryName = matchedCat.name;
    }

    // 1. Check period membership by actual submission / completion date (or dueDate for missing work)
    const relevantDate = item.completedAt || item.dueDate;
    if (relevantDate && periodStartDate && periodEndDate) {
      const inWindow = isDateWithinPeriod(relevantDate, periodStartDate, periodEndDate);
      if (!inWindow) {
        item.includedInCalculation = false;
        item.status = 'EXCLUDED';
        item.exclusionReason = `Completed/due date (${relevantDate.slice(0, 10)}) falls outside reporting period (${periodStartDate} to ${periodEndDate}).`;
        processedItems.push(item);
        continue;
      }
    } else if (!relevantDate) {
      warnings.push(`Record "${item.title}" (${item.referenceNumber}) lacks a reliable completion date and requires tutor review.`);
    }

    // 2. Ungraded activities never receive a numerical score
    if (item.isUngraded || item.status === 'UNGRADED_ACTIVITY') {
      item.includedInCalculation = false;
      item.status = 'UNGRADED_ACTIVITY';
      item.exclusionReason = 'Ungraded learning activity (recorded as qualitative participation evidence only).';
      processedItems.push(item);
      continue;
    }

    // 3. Pending submissions awaiting tutor review are NEVER converted to zero
    if (item.status === 'PENDING_REVIEW') {
      item.includedInCalculation = false;
      item.exclusionReason = 'Submission received and awaiting tutor grading; excluded from numerical denominator until marked.';
      warnings.push(`"${item.title}" has been submitted by the learner and is awaiting tutor marking.`);
      processedItems.push(item);
      continue;
    }

    // 4. Missing work policy handling
    if (item.status === 'MISSING') {
      const dueMs = item.dueDate ? new Date(item.dueDate).getTime() : NaN;
      const isOverdue = Number.isFinite(dueMs) && nowMs > dueMs;

      if (profile.missingWorkPolicy === 'ZERO_AFTER_DUE' && isOverdue && item.maxAvailableMarks > 0) {
        item.rawEarnedMarks = 0;
        item.normalizedPercentage = 0;
        item.includedInCalculation = matchedCat !== null;
        item.exclusionReason = undefined;
        warnings.push(`Overdue missing work "${item.title}" awarded 0/${item.maxAvailableMarks} per active grading policy.`);
      } else if (profile.missingWorkPolicy === 'EXCLUDE') {
        item.includedInCalculation = false;
        item.exclusionReason = 'Missing work excluded from numerical calculation per grading profile policy.';
        warnings.push(`Missing work "${item.title}" excluded from calculation and flagged.`);
      } else {
        // Default: FLAG_INCOMPLETE
        item.includedInCalculation = false;
        item.exclusionReason = 'Missing submission flagged as incomplete pending tutor review.';
        warnings.push(`Missing work "${item.title}" requires submission or tutor review before final grade release.`);
      }
      processedItems.push(item);
      continue;
    }

    // 5. Graded item validation & normalization
    if (item.status === 'GRADED') {
      if (!item.isReleased) {
        item.includedInCalculation = false;
        item.exclusionReason = 'Graded result has not yet been officially released by the tutor.';
        warnings.push(`"${item.title}" is graded (${item.rawEarnedMarks}/${item.maxAvailableMarks}) but not yet released.`);
        processedItems.push(item);
        continue;
      }

      const normScore = normalizeScoreToPercentage(item.rawEarnedMarks, item.maxAvailableMarks);
      if (!normScore.valid || normScore.percentage === null) {
        item.includedInCalculation = false;
        item.exclusionReason = 'Invalid or missing maximum marks schema.';
        warnings.push(`"${item.title}" skipped due to unverifiable maximum marks.`);
        processedItems.push(item);
        continue;
      }

      item.rawEarnedMarks = normScore.earned;
      item.maxAvailableMarks = normScore.max;
      item.normalizedPercentage = normScore.percentage;
      if (!matchedCat) {
        item.includedInCalculation = false;
        item.exclusionReason = `Work type "${item.workType}" is not mapped to any enabled category in profile "${profile.name}".`;
      } else {
        item.includedInCalculation = true;
      }
      processedItems.push(item);
      continue;
    }

    item.includedInCalculation = false;
    item.exclusionReason = item.exclusionReason || 'Not eligible for official grading calculation.';
    processedItems.push(item);
  }

  // Group into enabled categories
  const enabledCategories = (profile.categories || []).filter((c) => c.enabled);
  const rawCategoryResults: CategoryCalculationResult[] = enabledCategories.map((cat) => {
    const catItems = processedItems.filter((i) => i.categoryId === cat.id);
    const included = catItems.filter((i) => i.includedInCalculation && i.normalizedPercentage !== null);
    const pending = catItems.filter((i) => i.status === 'PENDING_REVIEW');
    const missing = catItems.filter((i) => i.status === 'MISSING' && !i.includedInCalculation);
    const excluded = catItems.filter((i) => !i.includedInCalculation);

    const rawEarnedTotal = included.reduce((sum, i) => sum + Number(i.rawEarnedMarks || 0), 0);
    const maxAvailableTotal = included.reduce((sum, i) => sum + Number(i.maxAvailableMarks || 0), 0);

    let categoryPercentage: number | null = null;
    if (included.length > 0) {
      if (cat.aggregationMethod === 'TOTAL_MARKS' && maxAvailableTotal > 0) {
        categoryPercentage = Math.round(((rawEarnedTotal / maxAvailableTotal) * 100) * 100) / 100;
      } else {
        const avg =
          included.reduce((sum, i) => sum + Number(i.normalizedPercentage || 0), 0) / included.length;
        categoryPercentage = Math.round(avg * 100) / 100;
      }
    }

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      aggregationMethod: cat.aggregationMethod,
      configuredWeight: cat.weight,
      effectiveWeight: cat.weight,
      rawEarnedTotal: Math.round(rawEarnedTotal * 100) / 100,
      maxAvailableTotal: Math.round(maxAvailableTotal * 100) / 100,
      categoryPercentage,
      weightedContribution: 0,
      includedCount: included.length,
      pendingCount: pending.length,
      missingCount: missing.length,
      excludedCount: excluded.length,
      isEmpty: included.length === 0,
      items: catItems,
    };
  });

  // Check empty categories & weight redistribution rules
  const populatedCategories = rawCategoryResults.filter((c) => !c.isEmpty);
  const emptyCategories = rawCategoryResults.filter((c) => c.isEmpty && c.configuredWeight > 0);
  let weightRedistributed = false;
  let isComplete = true;

  const totalPendingCount = processedItems.filter((i) => i.status === 'PENDING_REVIEW').length;
  const totalMissingFlaggedCount = processedItems.filter(
    (i) => i.status === 'MISSING' && !i.includedInCalculation
  ).length;

  if (totalPendingCount > 0) {
    isComplete = false;
  }
  if (profile.missingWorkPolicy === 'FLAG_INCOMPLETE' && totalMissingFlaggedCount > 0) {
    isComplete = false;
  }

  if (emptyCategories.length > 0) {
    const emptyNames = emptyCategories.map((c) => `${c.categoryName} (${c.configuredWeight}%)`).join(', ');
    if (
      (profile.emptyCategoryPolicy === 'REDISTRIBUTE_APPROVED' || approveWeightRedistribution) &&
      populatedCategories.length > 0
    ) {
      const populatedWeightSum = populatedCategories.reduce((s, c) => s + c.configuredWeight, 0);
      const targetAcademicWeight = profile.includeAttendanceInGrade
        ? Math.max(0, 100 - Number(profile.attendanceWeight || 0))
        : 100;

      if (populatedWeightSum > 0) {
        weightRedistributed = true;
        rawCategoryResults.forEach((cat) => {
          if (cat.isEmpty) {
            cat.effectiveWeight = 0;
          } else {
            cat.effectiveWeight =
              Math.round(((cat.configuredWeight / populatedWeightSum) * targetAcademicWeight) * 100) / 100;
          }
        });
        warnings.push(
          `Empty categories (${emptyNames}) were excluded and weights redistributed across populated categories.`
        );
      }
    } else {
      // Do NOT silently redistribute weights or silently assign zero
      isComplete = false;
      rawCategoryResults.forEach((cat) => {
        if (cat.isEmpty) {
          cat.effectiveWeight = cat.configuredWeight;
        }
      });
      warnings.push(
        `Missing eligible scores in required categories: ${emptyNames}. Report is marked incomplete until graded records are added or weight redistribution is explicitly approved.`
      );
    }
  }

  // Compute weighted contribution per category
  let totalWeightedScore = 0;
  let totalEffectiveWeightEvaluated = 0;

  rawCategoryResults.forEach((cat) => {
    if (!cat.isEmpty && cat.categoryPercentage !== null) {
      cat.weightedContribution =
        Math.round(((cat.categoryPercentage * cat.effectiveWeight) / 100) * 100) / 100;
      totalWeightedScore += cat.weightedContribution;
      totalEffectiveWeightEvaluated += cat.effectiveWeight;
    } else {
      cat.weightedContribution = 0;
    }
  });

  // Optional explicit attendance contribution (only when enabled by admin/tutor)
  if (profile.includeAttendanceInGrade && profile.attendanceWeight > 0) {
    if (attendanceSummary.attendanceRate !== null) {
      const attContrib =
        Math.round(((attendanceSummary.attendanceRate * profile.attendanceWeight) / 100) * 100) / 100;
      totalWeightedScore += attContrib;
      totalEffectiveWeightEvaluated += profile.attendanceWeight;
    } else {
      isComplete = false;
      warnings.push(
        `Attendance is configured for ${profile.attendanceWeight}% of the overall grade, but no attendance sessions were recorded in this period.`
      );
    }
  }

  const includedItems = processedItems.filter((i) => i.includedInCalculation);
  const excludedItems = processedItems.filter((i) => !i.includedInCalculation);

  const overallPercentage =
    includedItems.length > 0 && totalEffectiveWeightEvaluated > 0
      ? Math.round(totalWeightedScore * 100) / 100
      : null;

  const gradeInfo = resolveGradeFromBoundaries(
    overallPercentage,
    profile.gradeBoundaries,
    profile.passMark
  );

  // Subject breakdown (only from actual graded items, never fabricated)
  const bySubject = new Map<string, AcademicEvidenceItem[]>();
  for (const item of includedItems) {
    const subjKey = String(item.subject || item.programName || 'General Studies').trim();
    const list = bySubject.get(subjKey) || [];
    list.push(item);
    bySubject.set(subjKey, list);
  }

  const subjectBreakdowns: SubjectPerformanceSummary[] = Array.from(bySubject.entries()).map(
    ([subject, list]) => {
      const earned = list.reduce((s, i) => s + Number(i.rawEarnedMarks || 0), 0);
      const max = list.reduce((s, i) => s + Number(i.maxAvailableMarks || 0), 0);
      const avgPct =
        max > 0
          ? Math.round(((earned / max) * 100) * 100) / 100
          : Math.round(
              (list.reduce((s, i) => s + Number(i.normalizedPercentage || 0), 0) / list.length) * 100
            ) / 100;
      const g = resolveGradeFromBoundaries(avgPct, profile.gradeBoundaries, profile.passMark);
      return {
        subject,
        programName: list[0]?.programName,
        assessmentCount: list.length,
        rawEarnedTotal: Math.round(earned * 100) / 100,
        maxAvailableTotal: Math.round(max * 100) / 100,
        averagePercentage: avgPct,
        grade: g.grade,
        classification: g.classification,
      };
    }
  );

  // Programme breakdown
  const byProg = new Map<string, AcademicEvidenceItem[]>();
  for (const item of includedItems) {
    const progKey = String(item.programName || item.subject || 'Assigned Programme').trim();
    const list = byProg.get(progKey) || [];
    list.push(item);
    byProg.set(progKey, list);
  }

  const programmeBreakdowns: ProgrammePerformanceSummary[] = Array.from(byProg.entries()).map(
    ([programName, list]) => {
      const earned = list.reduce((s, i) => s + Number(i.rawEarnedMarks || 0), 0);
      const max = list.reduce((s, i) => s + Number(i.maxAvailableMarks || 0), 0);
      const pct = max > 0 ? Math.round(((earned / max) * 100) * 100) / 100 : null;
      const g = resolveGradeFromBoundaries(pct, profile.gradeBoundaries, profile.passMark);
      const progMilestones = (milestoneSummary.items || []).filter(
        (m) => !m.programName || m.programName.toLowerCase() === programName.toLowerCase()
      );
      const completedM = progMilestones.filter((m) => m.status === 'COMPLETED');
      return {
        programId: programName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        programName,
        status: completedM.length > 0 && completedM.length === progMilestones.length ? 'COMPLETED' : 'ACTIVE',
        assessmentCount: list.filter((i) => !['ASSIGNMENT', 'PROJECT'].includes(i.workType)).length,
        assignmentCount: list.filter((i) => ['ASSIGNMENT', 'PROJECT'].includes(i.workType)).length,
        completedMilestones: completedM.length,
        totalMilestones: progMilestones.length,
        overallPercentage: pct,
        grade: g.grade,
        classification: g.classification,
        skillsAcquired: Array.from(
          new Set(completedM.flatMap((m) => m.skills || [m.title]).filter(Boolean))
        ),
      };
    }
  );

  const calculationBreakdown: CalculationAuditBreakdown = {
    totalRecordsInspected: deduplicated.length,
    includedRecordsCount: includedItems.length,
    excludedRecordsCount: excludedItems.length,
    pendingReviewCount: totalPendingCount,
    missingWorkCount: totalMissingFlaggedCount,
    ungradedActivitiesCount: processedItems.filter((i) => i.status === 'UNGRADED_ACTIVITY').length,
    weightRedistributed,
    redistributionApprovedBy: weightRedistributed ? redistributionApprovedBy : undefined,
    redistributionReason: weightRedistributed ? redistributionReason : undefined,
    categoryResults: rawCategoryResults,
    includedItems,
    excludedItems,
    warnings,
  };

  return {
    overallPercentage,
    overallGrade: gradeInfo.grade,
    classification: gradeInfo.classification,
    isPass: gradeInfo.isPass,
    isComplete,
    calculationBreakdown,
    subjectBreakdowns,
    programmeBreakdowns,
  };
}

/**
 * Calculates a 3-Term End-of-Session School Report, preserving Term 1, Term 2, and Term 3
 * results separately while computing the annual result using the profile's configured method
 * (`EQUAL_TERM_WEIGHTS`, `CUSTOM_TERM_WEIGHTS`, or `CUMULATIVE_SESSION`) and ensuring
 * each underlying academic record contributes at most once.
 */
export function calculateSessionThreeTermPerformance(params: {
  evidenceItems: AcademicEvidenceItem[];
  profile: AcademicGradingProfile;
  terms: AcademicTermConfig[];
  sessionStartDate: string;
  sessionEndDate: string;
  attendanceByTerm: Record<AcademicTermKey, AttendancePeriodSummary>;
  overallAttendance: AttendancePeriodSummary;
  milestoneSummary: MilestonePeriodSummary;
  approveWeightRedistribution?: boolean;
  redistributionApprovedBy?: string;
}): GradingCalculationOutput & { termBreakdowns: TermComparisonItem[] } {
  const {
    profile,
    terms,
    sessionStartDate,
    sessionEndDate,
    attendanceByTerm,
    overallAttendance,
    milestoneSummary,
    approveWeightRedistribution = false,
    redistributionApprovedBy,
  } = params;

  // Deduplicate once across the entire session first so no assessment/assignment is counted in two terms
  const deduplicatedSessionItems = deduplicateCanonicalEvidence(params.evidenceItems).map((item) => {
    const resolvedTerm = item.termKey || resolveTermForDate(item.completedAt || item.dueDate, terms);
    return { ...item, termKey: resolvedTerm };
  });

  const orderedTerms: AcademicTermConfig[] =
    terms.length === 3
      ? terms
      : [
          { termKey: 'TERM_1', name: 'First Term', startDate: sessionStartDate, endDate: sessionEndDate, status: 'ACTIVE' },
          { termKey: 'TERM_2', name: 'Second Term', startDate: sessionStartDate, endDate: sessionEndDate, status: 'ACTIVE' },
          { termKey: 'TERM_3', name: 'Third Term', startDate: sessionStartDate, endDate: sessionEndDate, status: 'ACTIVE' },
        ];

  const termOutputs = orderedTerms.map((termCfg) => {
    const termEvidence = deduplicatedSessionItems.filter((i) => i.termKey === termCfg.termKey);
    const termCalc = calculatePeriodAcademicPerformance({
      evidenceItems: termEvidence,
      profile,
      periodStartDate: termCfg.startDate,
      periodEndDate: termCfg.endDate,
      attendanceSummary: attendanceByTerm[termCfg.termKey] || overallAttendance,
      milestoneSummary,
      approveWeightRedistribution,
      redistributionApprovedBy,
    });
    return { termCfg, termCalc };
  });

  const rawWeights: Record<AcademicTermKey, number> =
    profile.sessionCalculationMethod === 'CUSTOM_TERM_WEIGHTS' && profile.termWeights
      ? profile.termWeights
      : { TERM_1: 33.33, TERM_2: 33.33, TERM_3: 33.34 };

  const termBreakdowns: TermComparisonItem[] = [];
  let prevPct: number | null = null;

  termOutputs.forEach(({ termCfg, termCalc }) => {
    const pct = termCalc.overallPercentage;
    const configuredWeight = rawWeights[termCfg.termKey] ?? 33.33;
    const weightedContrib =
      pct !== null ? Math.round(((pct * configuredWeight) / 100) * 100) / 100 : 0;
    const delta =
      pct !== null && prevPct !== null ? Math.round((pct - prevPct) * 100) / 100 : null;
    if (pct !== null) {
      prevPct = pct;
    }

    const gradedAssessments = termCalc.calculationBreakdown.includedItems.filter(
      (i) => !['ASSIGNMENT', 'PROJECT'].includes(i.workType)
    ).length;
    const completedAssignments = termCalc.calculationBreakdown.includedItems.filter((i) =>
      ['ASSIGNMENT', 'PROJECT'].includes(i.workType)
    ).length;

    termBreakdowns.push({
      termKey: termCfg.termKey,
      termName: termCfg.name,
      startDate: termCfg.startDate,
      endDate: termCfg.endDate,
      overallPercentage: pct,
      grade: termCalc.overallGrade,
      classification: termCalc.classification,
      gradedAssessmentCount: gradedAssessments,
      completedAssignmentCount: completedAssignments,
      attendanceRate: (attendanceByTerm[termCfg.termKey] || overallAttendance).attendanceRate,
      configuredTermWeight: configuredWeight,
      weightedAnnualContribution: weightedContrib,
      deltaFromPreviousTerm: delta,
      categoryResults: termCalc.calculationBreakdown.categoryResults,
    });
  });

  // Compute cumulative session calculation for full category/subject breakdowns
  const cumulativeCalc = calculatePeriodAcademicPerformance({
    evidenceItems: deduplicatedSessionItems,
    profile,
    periodStartDate: sessionStartDate,
    periodEndDate: sessionEndDate,
    attendanceSummary: overallAttendance,
    milestoneSummary,
    approveWeightRedistribution,
    redistributionApprovedBy,
  });

  if (profile.sessionCalculationMethod === 'CUMULATIVE_SESSION') {
    return {
      ...cumulativeCalc,
      termBreakdowns,
    };
  }

  // Term-weighted annual percentage (EQUAL_TERM_WEIGHTS or CUSTOM_TERM_WEIGHTS)
  const populatedTerms = termBreakdowns.filter((t) => t.overallPercentage !== null);
  let annualPercentage: number | null = null;
  let sessionComplete = cumulativeCalc.isComplete && populatedTerms.length === 3;

  if (populatedTerms.length > 0) {
    const activeWeightSum = populatedTerms.reduce((s, t) => s + t.configuredTermWeight, 0);
    if (populatedTerms.length < 3) {
      const missingTerms = termBreakdowns
        .filter((t) => t.overallPercentage === null)
        .map((t) => t.termName)
        .join(', ');
      cumulativeCalc.calculationBreakdown.warnings.push(
        `Session report is missing graded results for: ${missingTerms}.`
      );
      sessionComplete = false;
    }
    if (activeWeightSum > 0) {
      const weightedSum = populatedTerms.reduce(
        (s, t) => s + Number(t.overallPercentage || 0) * t.configuredTermWeight,
        0
      );
      annualPercentage = Math.round((weightedSum / activeWeightSum) * 100) / 100;
    }
  }

  const annualGradeInfo = resolveGradeFromBoundaries(
    annualPercentage,
    profile.gradeBoundaries,
    profile.passMark
  );

  return {
    ...cumulativeCalc,
    overallPercentage: annualPercentage,
    overallGrade: annualGradeInfo.grade,
    classification: annualGradeInfo.classification,
    isPass: annualGradeInfo.isPass,
    isComplete: sessionComplete,
    termBreakdowns,
  };
}
