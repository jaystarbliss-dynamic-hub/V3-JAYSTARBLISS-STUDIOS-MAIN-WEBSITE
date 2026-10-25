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
} from '../../api/_lib/jdi-assessment.js';

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
