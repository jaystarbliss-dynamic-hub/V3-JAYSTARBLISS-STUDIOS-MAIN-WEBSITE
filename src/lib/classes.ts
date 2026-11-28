import {
  CANONICAL_CLASSES as SHARED_CANONICAL_CLASSES,
  normalizeClassName as sharedNormalizeClassName,
  isCanonicalClass as sharedIsCanonicalClass,
  normalizeClassList as sharedNormalizeClassList,
  expandGradeRange as sharedExpandGradeRange,
  formatNormalizedClassDisplay as sharedFormatNormalizedClassDisplay,
  classesMatch as sharedClassesMatch,
  canAuthorOrMutateExam as sharedCanAuthorOrMutateExam,
  canManageExamRecord as sharedCanManageExamRecord,
  resolveExamDeletionMode as sharedResolveExamDeletionMode,
  computeExamMaxScore as sharedComputeExamMaxScore,
  calculateScorePercentage as sharedCalculateScorePercentage,
  calculateGradeLetter as sharedCalculateGradeLetter,
  formatScoreSummary as sharedFormatScoreSummary,
  resolvePartnerSchoolName as sharedResolvePartnerSchoolName,
  resolveAttemptQuestions as sharedResolveAttemptQuestions,
  gradeAnswers as sharedGradeAnswers,
  recalculateAttemptForUpdatedExam as sharedRecalculateAttemptForUpdatedExam,
  type RecalculatedAttemptResult,
  normalizeDeliveryMode as sharedNormalizeDeliveryMode,
  validateExternalExamUrl as sharedValidateExternalExamUrl,
  validateExamCreationPayload as sharedValidateExamCreationPayload,
  WORK_TYPES as SHARED_WORK_TYPES,
  normalizeWorkType as sharedNormalizeWorkType,
  validateWorkTypeTransition as sharedValidateWorkTypeTransition,
  normalizeRecipientTargets as sharedNormalizeRecipientTargets,
  isStudentEligibleForWork as sharedIsStudentEligibleForWork,
  parseBulkStudentText as sharedParseBulkStudentText,
  validateBulkStudentRows as sharedValidateBulkStudentRows,
  buildAttendanceRecordKey as sharedBuildAttendanceRecordKey,
  AGREEMENT_CATEGORIES as SHARED_AGREEMENT_CATEGORIES,
  AGREEMENT_STATUSES as SHARED_AGREEMENT_STATUSES,
  createAgreementVersionSnapshot as sharedCreateAgreementVersionSnapshot,
  canAccessAgreement as sharedCanAccessAgreement,
  shouldAutoReleaseAttemptResult as sharedShouldAutoReleaseAttemptResult,
  isAttemptResultReleased as sharedIsAttemptResultReleased,
  canViewOrPrintAttemptResult as sharedCanViewOrPrintAttemptResult,
  getWorkTypeLabels as sharedGetWorkTypeLabels,
  classifyStudentEnrolment as sharedClassifyStudentEnrolment,
  isAttemptOverdueForExpiry as sharedIsAttemptOverdueForExpiry,
  isExamPastEffectiveDeadline as sharedIsExamPastEffectiveDeadline,
  resolveCanonicalExamStatus as sharedResolveCanonicalExamStatus,
  mergeExamRecordByPrecedence as sharedMergeExamRecordByPrecedence,
  MANUAL_DELIVERABLE_TYPES as SHARED_MANUAL_DELIVERABLE_TYPES,
  buildDefaultAssessmentLayout as sharedBuildDefaultAssessmentLayout,
  normalizeAssessmentLayout as sharedNormalizeAssessmentLayout,
  resolveAssessmentLayout as sharedResolveAssessmentLayout,
  generateAttemptOrdering as sharedGenerateAttemptOrdering,
  buildQuestionContextMap as sharedBuildQuestionContextMap,
  canPauseAssessmentWorkType as sharedCanPauseAssessmentWorkType,
  type WorkTypeLabels as SharedWorkTypeLabels,
  type StudentEnrolmentClassification as SharedStudentEnrolmentClassification,
  type AssessmentLayout as SharedAssessmentLayout,
  type AssessmentSection as SharedAssessmentSection,
  type AssessmentSectionItem as SharedAssessmentSectionItem,
  type AssessmentComprehensionItem as SharedAssessmentComprehensionItem,
  type AssessmentContentBlockItem as SharedAssessmentContentBlockItem,
  type AssessmentQuestionRefItem as SharedAssessmentQuestionRefItem,
  type QuestionContextEntry as SharedQuestionContextEntry,
} from './jdi-assessment.js';

export const MANUAL_DELIVERABLE_TYPES = SHARED_MANUAL_DELIVERABLE_TYPES;
export type StudentEnrolmentClassification = SharedStudentEnrolmentClassification;

export function classifyStudentEnrolment(
  studentRecord?: Record<string, any> | null,
  options?: {
    knownParentIds?: Set<string>;
    knownParentEmails?: Set<string>;
    knownParentChildIds?: Set<string>;
  }
): StudentEnrolmentClassification {
  return sharedClassifyStudentEnrolment(studentRecord || {}, options);
}

export function isAttemptOverdueForExpiry(
  attempt?: Record<string, any> | null,
  exam?: Record<string, any> | null,
  nowMs?: number
): boolean {
  return sharedIsAttemptOverdueForExpiry(attempt || {}, exam || {}, nowMs);
}

export function isExamPastEffectiveDeadline(
  exam?: Record<string, any> | null,
  nowMs?: number
): boolean {
  return sharedIsExamPastEffectiveDeadline(exam || {}, nowMs);
}

export type CanonicalExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'archived';

export function resolveCanonicalExamStatus(
  exam?: Record<string, any> | null,
  nowMs?: number
): CanonicalExamStatus {
  return sharedResolveCanonicalExamStatus(exam || {}, nowMs) as CanonicalExamStatus;
}

export function mergeExamRecordByPrecedence(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any> | null | undefined,
  incomingSource?: 'jdiExams' | 'schoolExams' | 'exams',
  nowMs?: number
): Record<string, any> {
  return sharedMergeExamRecordByPrecedence(existing || null, incoming || null, incomingSource || 'jdiExams', nowMs);
}

export type AcademicWorkType = 'ASSIGNMENT' | 'ACTIVITY' | 'TEST' | 'EXAMINATION';
export type WorkType = AcademicWorkType;
export type WorkTypeLabels = SharedWorkTypeLabels;
export const WORK_TYPES: AcademicWorkType[] = SHARED_WORK_TYPES as AcademicWorkType[];

export function normalizeWorkType(input: unknown, fallbackObj?: Record<string, any> | null): AcademicWorkType {
  return sharedNormalizeWorkType(input, fallbackObj) as AcademicWorkType;
}

export function getWorkTypeLabels(input?: unknown, fallbackObj?: Record<string, any> | null): WorkTypeLabels {
  return sharedGetWorkTypeLabels(input, fallbackObj);
}

export function validateWorkTypeTransition(
  existingRecord: Record<string, any> | null | undefined,
  nextWorkType?: unknown,
  attemptCount = 0
) {
  return sharedValidateWorkTypeTransition(existingRecord, nextWorkType, attemptCount);
}

export function expandGradeRange(fromClass: unknown, toClass: unknown): string[] {
  return sharedExpandGradeRange(fromClass, toClass);
}

export function normalizeRecipientTargets(
  body?: Record<string, any>,
  existingDoc?: Record<string, any> | null
) {
  return sharedNormalizeRecipientTargets(body, existingDoc);
}

export function isStudentEligibleForWork(
  student?: Record<string, any>,
  workItem?: Record<string, any>
): boolean {
  return sharedIsStudentEligibleForWork(student, workItem);
}

export interface BulkStudentParsedRow {
  rowNumber: number;
  fullName: string;
  rawClass: string;
  canonicalClass: string;
  className: string;
  isValidClass: boolean;
  programme: string;
  programName: string;
  email: string;
  username: string;
  status?: 'READY' | 'DUPLICATE_EXISTING' | 'DUPLICATE_IN_BATCH' | 'INVALID';
  errors: string[];
  isValid: boolean;
  valid: boolean;
}

export type ValidatedBulkStudentRow = BulkStudentParsedRow;

export function parseBulkStudentText(rawText: string, defaultProgramme = 'Digital Literacy'): BulkStudentParsedRow[] {
  return sharedParseBulkStudentText(rawText, defaultProgramme) as BulkStudentParsedRow[];
}

export function validateBulkStudentRows(
  rows: Array<Partial<BulkStudentParsedRow>>,
  existingStudentsOrOpts: Array<Record<string, any>> | {
    existingStudents?: Array<Record<string, any>>;
    existingUsernames?: Iterable<string>;
    existingEmails?: Iterable<string>;
  } = []
): BulkStudentParsedRow[] & {
  rows: BulkStudentParsedRow[];
  validCount: number;
  invalidCount: number;
} {
  return sharedValidateBulkStudentRows(rows, existingStudentsOrOpts) as BulkStudentParsedRow[] & {
    rows: BulkStudentParsedRow[];
    validCount: number;
    invalidCount: number;
  };
}

export function buildAttendanceRecordKey(params: {
  studentId: string;
  dateKey?: string;
  date?: string;
  scheduleId?: string;
}): string {
  return sharedBuildAttendanceRecordKey(params);
}

export type AgreementCategory = 'PROPOSAL' | 'COMMUNICATION' | 'CONTRACT';
export type AgreementStatus =
  | 'DRAFT'
  | 'SHARED'
  | 'UNDER_DISCUSSION'
  | 'REVISION_REQUESTED'
  | 'AGREED'
  | 'SIGNED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'ARCHIVED';

export const AGREEMENT_CATEGORIES: AgreementCategory[] = SHARED_AGREEMENT_CATEGORIES as AgreementCategory[];
export const AGREEMENT_STATUSES: AgreementStatus[] = SHARED_AGREEMENT_STATUSES as AgreementStatus[];

export function createAgreementVersionSnapshot(
  agreement: Record<string, any>,
  actor?: { uid?: string; name?: string }
) {
  return sharedCreateAgreementVersionSnapshot(agreement, actor);
}

export function canAccessAgreement(
  agreement: Record<string, any>,
  actor?: { uid?: string; role?: string; schoolId?: string }
): boolean {
  return sharedCanAccessAgreement(agreement, actor);
}

export type CanonicalClassName =
  | 'Early Years'
  | 'Grade 1'
  | 'Grade 2'
  | 'Grade 3'
  | 'Grade 4'
  | 'Grade 5'
  | 'Grade 6'
  | 'Grade 7'
  | 'Grade 8'
  | 'Grade 9'
  | 'Grade 10'
  | 'Grade 11'
  | 'Grade 12'
  | 'University (Undergraduate)'
  | 'Graduate (BSc, HND, ND, etc.)';

export const CANONICAL_CLASSES: CanonicalClassName[] = SHARED_CANONICAL_CLASSES as CanonicalClassName[];

export function normalizeClassName(input: unknown, fallback = ''): string {
  return sharedNormalizeClassName(input, fallback);
}

export function isCanonicalClass(input: unknown): boolean {
  return sharedIsCanonicalClass(input);
}

export function normalizeClassList(input: unknown): string[] {
  return sharedNormalizeClassList(input);
}

export function formatNormalizedClassDisplay(input: unknown, fallback = 'Grade 1'): string {
  return sharedFormatNormalizedClassDisplay(input, fallback);
}

export function classesMatch(
  studentClass: unknown,
  targetClasses: unknown,
  options: { allowEmptyTarget?: boolean } = {}
): boolean {
  return sharedClassesMatch(studentClass, targetClasses, options);
}

export function canAuthorOrMutateExam(role: unknown): boolean {
  return sharedCanAuthorOrMutateExam(role);
}

export function canManageExamRecord(
  examOrOpts: any,
  callerUid?: string,
  callerRole?: string,
  assignedSchoolIds?: string[]
): boolean {
  return sharedCanManageExamRecord(examOrOpts, callerUid, callerRole, assignedSchoolIds);
}

export function resolveExamDeletionMode(attemptCount: number): 'archive' | 'delete' {
  return sharedResolveExamDeletionMode(attemptCount);
}

export function computeExamMaxScore(exam: any, attempt?: any): number {
  return sharedComputeExamMaxScore(exam, attempt);
}

export function calculateScorePercentage(score: unknown, maxScore: unknown): number {
  return sharedCalculateScorePercentage(score, maxScore);
}

export function calculateGradeLetter(percentage: number): string {
  return sharedCalculateGradeLetter(percentage);
}

export interface ScoreSummary {
  score: number | null;
  maxScore: number;
  percentage: number | null;
  percentageLabel: string;
  fractionLabel: string;
  summaryLabel: string;
  display: string;
  grade: string;
}

export function formatScoreSummary(score: unknown, maxScore: unknown): ScoreSummary {
  return sharedFormatScoreSummary(score, maxScore) as ScoreSummary;
}

export function resolvePartnerSchoolName(...candidates: unknown[]): string {
  return sharedResolvePartnerSchoolName(...candidates);
}

export function resolveAttemptQuestions(exam: any, attempt?: any): any[] {
  return sharedResolveAttemptQuestions(exam, attempt);
}

export function gradeAnswers(
  exam: { gradingMode?: string; questions?: Array<any> },
  answers?: Record<string, any>
) {
  return sharedGradeAnswers(exam, answers);
}

export function recalculateAttemptForUpdatedExam(
  exam: Record<string, any>,
  attempt: Record<string, any>
): RecalculatedAttemptResult {
  return sharedRecalculateAttemptForUpdatedExam(exam, attempt);
}

export type { RecalculatedAttemptResult };

export function normalizeDeliveryMode(
  input: unknown,
  fallbackExam?: Record<string, any> | null
): 'NATIVE' | 'EXTERNAL_LINK' | 'CODING_LAB' {
  return sharedNormalizeDeliveryMode(input, fallbackExam);
}

export function validateExternalExamUrl(input: unknown) {
  return sharedValidateExternalExamUrl(input);
}

export function validateExamCreationPayload(
  body?: Record<string, any>,
  existingDoc?: Record<string, any> | null
) {
  return sharedValidateExamCreationPayload(body, existingDoc);
}

export function shouldAutoReleaseAttemptResult(
  exam?: Record<string, any> | null,
  grading?: Record<string, any> | null
): boolean {
  return sharedShouldAutoReleaseAttemptResult(exam || {}, grading || {});
}

export function isAttemptResultReleased(
  attempt?: Record<string, any> | null,
  exam?: Record<string, any> | null
): boolean {
  return sharedIsAttemptResultReleased(attempt || {}, exam || {});
}

export function canViewOrPrintAttemptResult(
  attempt?: Record<string, any> | null,
  callerRole?: unknown,
  exam?: Record<string, any> | null
): boolean {
  return sharedCanViewOrPrintAttemptResult(attempt || {}, callerRole, exam || {});
}

export type AssessmentLayout = SharedAssessmentLayout;
export type AssessmentSection = SharedAssessmentSection;
export type AssessmentSectionItem = SharedAssessmentSectionItem;
export type AssessmentComprehensionItem = SharedAssessmentComprehensionItem;
export type AssessmentContentBlockItem = SharedAssessmentContentBlockItem;
export type AssessmentQuestionRefItem = SharedAssessmentQuestionRefItem;
export type QuestionContextEntry = SharedQuestionContextEntry;

export function buildDefaultAssessmentLayout(questions?: Array<Record<string, any>>): AssessmentLayout {
  return sharedBuildDefaultAssessmentLayout(questions);
}

export function normalizeAssessmentLayout(
  rawLayout: unknown,
  questions?: Array<Record<string, any>>,
  options?: { dropUnknownQuestions?: boolean }
) {
  return sharedNormalizeAssessmentLayout(rawLayout, questions, options);
}

export function resolveAssessmentLayout(
  examOrAttempt?: Record<string, any> | null,
  questions?: Array<Record<string, any>>
): AssessmentLayout {
  return sharedResolveAssessmentLayout(examOrAttempt, questions);
}

export function generateAttemptOrdering(
  exam?: Record<string, any> | null,
  questions?: Array<Record<string, any>>,
  rng?: () => number
) {
  return sharedGenerateAttemptOrdering(exam, questions, rng);
}

export function buildQuestionContextMap(
  layout?: AssessmentLayout | null
): Record<string, QuestionContextEntry> {
  return sharedBuildQuestionContextMap(layout);
}

export function canPauseAssessmentWorkType(workType?: unknown): boolean {
  return sharedCanPauseAssessmentWorkType(workType);
}




