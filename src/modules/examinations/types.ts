/** JAYSTARBLISS DYNAMIC INSTITUTE (JDI) examination domain types. */
export type ExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'archived';
export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
export type AssessmentContentBlockType = 'instruction' | 'text';
export interface AssessmentQuestionRefItem { id: string; kind: 'question'; questionId: string }
export interface AssessmentContentBlockItem { id: string; kind: 'content'; blockType: AssessmentContentBlockType; title?: string; body: string }
export interface AssessmentComprehensionItem { id: string; kind: 'comprehension'; title?: string; body: string; questionIds: string[] }
export type AssessmentSectionItem = AssessmentQuestionRefItem | AssessmentContentBlockItem | AssessmentComprehensionItem;
export interface AssessmentSection { id: string; title: string; description?: string; items: AssessmentSectionItem[] }
export interface AssessmentLayout { version: 1; sections: AssessmentSection[] }
export interface ExamOption { id: string; text: string }
export interface ExamQuestion { id: string; type: QuestionType; prompt: string; options: ExamOption[]; correctOptionIds?: string[]; acceptedAnswers?: string[]; points: number; required: boolean }
export interface ExamDefinition { id: string; schoolId: string; classIds: string[]; title: string; subject: string; courseName?: string; seriesName?: string; learningVideoUrl?: string; instructions?: string; status: ExamStatus; durationMinutes: number; maxAttempts?: number; shuffleQuestions?: boolean; shuffleOptions?: boolean; gradingMode?: "automatic" | "manual"; availableFrom?: string; availableUntil?: string; questionCount: number; assessmentLayout?: AssessmentLayout; passcodeRequired: boolean; createdBy: string; createdAt: string; updatedAt: string }
export interface ExamAttempt { id: string; examId: string; studentId: string; status: 'in_progress' | 'submitted' | 'expired' | 'graded'; startedAt: string; deadlineAt: string | null; submittedAt?: string; score?: number; releasedAt?: string; isPaused?: boolean; pausedAt?: string | null; remainingSecondsAtPause?: number | null; assessmentLayoutSnapshot?: AssessmentLayout; questionOrderByGroup?: Record<string, string[]> }
export interface QuestionBankEntry extends Omit<ExamQuestion, "id"> { bankId: string; schoolId: string; topic?: string; difficulty?: "easy" | "medium" | "hard"; createdBy: string; createdAt: string; updatedAt: string }
export interface PasscodeValidationRequest { examId: string; passcode: string }
export interface PasscodeValidationResponse { ok: boolean; attemptId?: string; message?: string }
