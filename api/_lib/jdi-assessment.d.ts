export type CanonicalClassName =
  | "Early Years"
  | "Grade 1"
  | "Grade 2"
  | "Grade 3"
  | "Grade 4"
  | "Grade 5"
  | "Grade 6"
  | "Grade 7"
  | "Grade 8"
  | "Grade 9"
  | "Grade 10"
  | "Grade 11"
  | "Grade 12"
  | "University (Undergraduate)"
  | "Graduate (BSc, HND, ND, etc.)";

export const CANONICAL_CLASSES: CanonicalClassName[];

export function normalizeClassName(input: unknown, fallback?: string): string;
export function isCanonicalClass(input: unknown): boolean;
export function normalizeClassList(input: unknown): string[];
export function formatNormalizedClassDisplay(input: unknown, fallback?: string): string;
export function classesMatch(
  studentClass: unknown,
  targetClasses: unknown,
  options?: { allowEmptyTarget?: boolean }
): boolean;

export function isAssessmentStudentRole(role: unknown): boolean;
export function isSchoolAdminRole(role: unknown): boolean;
export function isTutorRole(role: unknown): boolean;
export function isPlatformAdminRole(role: unknown): boolean;
export function canAuthorOrMutateExam(role: unknown): boolean;
export function canManageExamRecord(
  examOrOpts: any,
  callerUid?: string,
  callerRole?: string,
  assignedSchoolIds?: string[]
): boolean;
export function resolveExamDeletionMode(attemptCount: number): "archive" | "delete";
export function resolvePartnerSchoolName(...candidates: unknown[]): string;
export function resolveAttemptQuestions(exam: any, attempt?: any): any[];
export function computeExamMaxScore(exam: any, attempt?: any): number;
export function calculateScorePercentage(score: unknown, maxScore: unknown): number;
export function calculateGradeLetter(percentage: number): string;

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

export function formatScoreSummary(score: unknown, maxScore: unknown): ScoreSummary;

export interface NormalizedQuestion {
  id: string;
  type: "single_choice" | "multiple_choice" | "true_false" | "dropdown" | "short_answer" | "essay";
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionIds: string[];
  acceptedAnswers: string[];
  points: number;
  required: boolean;
  explanation?: string;
}

export function normalizeQuestions(
  input: unknown,
  gradingMode?: string
):
  | { questions: NormalizedQuestion[]; maxScore: number; error?: never }
  | { error: string; questions?: never; maxScore?: never };

export function normalizeDeliveryMode(
  input: unknown,
  fallbackExam?: Record<string, any> | null
): "NATIVE" | "EXTERNAL_LINK";

export function validateExternalExamUrl(
  input: unknown
): { valid: true; url: string; error?: never } | { valid: false; error: string; url?: never };

export function validateExamCreationPayload(
  body?: Record<string, any>,
  existingDoc?: Record<string, any> | null
):
  | {
      deliveryMode: "NATIVE" | "EXTERNAL_LINK";
      title: string;
      subject: string;
      description: string;
      externalUrl: string;
      classIds: string[];
      questions: NormalizedQuestion[];
      questionCount: number;
      maxScore: number;
      durationMinutes: number;
      gradingMode: "automatic" | "manual";
      status: string;
      error?: never;
    }
  | { error: string };

export function gradeAnswers(
  exam: { gradingMode?: string; questions?: Array<any> },
  answers?: Record<string, any>
): {
  score: number;
  maxScore: number;
  percentage: number;
  autoGraded: boolean;
  questionResults: Array<Record<string, any>>;
};

export function schoolSafeQuestion(question: Record<string, any>): {
  id: string;
  prompt: string;
  type: string;
  points: number;
  options: Array<{ id: string; text: string }>;
};

export function schoolSafeQuestionResult(result: Record<string, any>): {
  questionId: string;
  correct?: boolean;
  manualReview: boolean;
  pointsAwarded: number;
  maxPoints: number;
};

export function attemptBelongsToLinkedChild(
  attempt: Record<string, any>,
  child: { id: string; studentUid: string }
): boolean;

export function answersForFinalization<T extends Record<string, any>>(
  currentAnswers?: T,
  requestedAnswers?: T,
  deadlinePassed?: boolean
): T;

