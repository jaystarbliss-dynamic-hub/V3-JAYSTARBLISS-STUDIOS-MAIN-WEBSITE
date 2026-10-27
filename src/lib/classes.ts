import {
  CANONICAL_CLASSES as SHARED_CANONICAL_CLASSES,
  normalizeClassName as sharedNormalizeClassName,
  isCanonicalClass as sharedIsCanonicalClass,
  normalizeClassList as sharedNormalizeClassList,
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
} from '../../api/_lib/jdi-assessment.js';

export type AcademicWorkType = 'ASSIGNMENT' | 'ACTIVITY' | 'TEST' | 'EXAMINATION';
export type WorkType = AcademicWorkType;
export const WORK_TYPES: AcademicWorkType[] = SHARED_WORK_TYPES as AcademicWorkType[];

export function normalizeWorkType(input: unknown, fallbackObj?: Record<string, any> | null): AcademicWorkType {
  return sharedNormalizeWorkType(input, fallbackObj) as AcademicWorkType;
}

export function validateWorkTypeTransition(
  existingRecord: Record<string, any> | null | undefined,
  nextWorkType?: unknown,
  attemptCount = 0
) {
  return sharedValidateWorkTypeTransition(existingRecord, nextWorkType, attemptCount);
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

export function normalizeDeliveryMode(
  input: unknown,
  fallbackExam?: Record<string, any> | null
): 'NATIVE' | 'EXTERNAL_LINK' {
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


