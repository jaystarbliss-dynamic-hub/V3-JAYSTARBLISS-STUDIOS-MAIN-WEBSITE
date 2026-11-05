import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Link2,
  Layers,
  Sparkles,
  School,
  User,
  Users,
  Clock,
  KeyRound,
  ShieldAlert,
  Save,
  Send,
  Plus,
  BookOpen,
  Upload,
  AlertCircle,
  Eye,
  Check,
  Calendar,
} from 'lucide-react';
import type { AcademicWorkType } from '../../lib/classes';
import { RecipientSelectorModal, type RecipientSchool, type RecipientPrivateStudent } from './RecipientSelectorModal';
import { ImportQuestionsModal, type QuestionBankItem } from './ImportQuestionsModal';
import { NativeQuestionCard, type NativeQuestionData } from './NativeQuestionCard';
import { CANONICAL_CLASSES } from '../../lib/classes';

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'question-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

const generateAccessCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
};

interface AssessmentWizardProps {
  onCancel: () => void;
  onSave: (payload: {
    workType: AcademicWorkType;
    deliveryMode: 'NATIVE' | 'EXTERNAL_LINK';
    title: string;
    description: string;
    subject: string;
    externalUrl?: string;
    targetSchoolIds: string[];
    targetStudentIds: string[];
    recipientMode: 'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET';
    targetClass: string;
    durationMinutes: number | null;
    passcode: string;
    status: 'draft' | 'active';
    questions: any[];
    availableFrom?: string | null;
    availableUntil?: string | null;
  }) => Promise<void>;
  availableSchools: RecipientSchool[];
  availablePrivateStudents: RecipientPrivateStudent[];
  questionBankItems?: QuestionBankItem[];
  isTutor?: boolean;
  editingAssessment?: any;
}

export const AssessmentWizard: React.FC<AssessmentWizardProps> = ({
  onCancel,
  onSave,
  availableSchools,
  availablePrivateStudents,
  questionBankItems = [],
  isTutor = false,
  editingAssessment,
}) => {
  // Step 1: Type | Step 2: Format | Step 3: Recipients (or External Setup) | Step 4: Content Builder | Step 5: Review
  const [currentStep, setCurrentStep] = useState<number>(editingAssessment ? 4 : 1);

  // Form State
  const [workType, setWorkType] = useState<AcademicWorkType>(
    editingAssessment?.workType || 'ASSIGNMENT'
  );
  const [deliveryMode, setDeliveryMode] = useState<'NATIVE' | 'EXTERNAL_LINK'>(
    editingAssessment?.deliveryMode || 'NATIVE'
  );

  // Metadata
  const [title, setTitle] = useState(editingAssessment?.title || '');
  const [description, setDescription] = useState(
    editingAssessment?.description || editingAssessment?.instructions || ''
  );
  const [subject, setSubject] = useState(editingAssessment?.subject || '');
  const [programTitle, setProgramTitle] = useState(editingAssessment?.programTitle || 'Smart Techies Programme');
  const [externalUrl, setExternalUrl] = useState(editingAssessment?.externalUrl || '');
  const [targetClass, setTargetClass] = useState(
    editingAssessment?.targetClass || editingAssessment?.className || CANONICAL_CLASSES[1]
  );
  const [duration, setDuration] = useState<number>(
    editingAssessment?.durationMinutes || (workType === 'TEST' ? 20 : workType === 'ACTIVITY' ? 15 : 30)
  );
  const [passcode, setPasscode] = useState(editingAssessment?.passcode || generateAccessCode());

  // Recipients
  const [recipientMode, setRecipientMode] = useState<
    'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET'
  >(editingAssessment?.recipientMode || 'SCHOOL_CLASS');
  const [targetSchoolIds, setTargetSchoolIds] = useState<string[]>(
    editingAssessment?.targetSchoolIds || (editingAssessment?.schoolId && editingAssessment.schoolId !== 'private' ? [editingAssessment.schoolId] : [])
  );
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>(
    editingAssessment?.targetStudentIds || []
  );

  // Native Questions State
  const [questions, setQuestions] = useState<NativeQuestionData[]>(
    Array.isArray(editingAssessment?.questions) && editingAssessment.questions.length > 0
      ? editingAssessment.questions
      : [
          {
            id: makeId(),
            prompt: 'Untitled Question',
            type: 'multiple_choice',
            points: 2,
            required: true,
            options: [
              { id: 'A', text: 'Option 1' },
              { id: 'B', text: 'Option 2' },
              { id: 'C', text: 'Option 3' },
              { id: 'D', text: 'Option 4' },
            ],
            correctOptionIds: ['A'],
          },
        ]
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string>(questions[0]?.id || '');

  // Modals
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute total marks
  const totalMarks = useMemo(() => {
    if (deliveryMode === 'EXTERNAL_LINK') return 0;
    return questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);
  }, [questions, deliveryMode]);

  // Recipient names summary
  const recipientSummary = useMemo(() => {
    const schoolNames = targetSchoolIds
      .map((id) => availableSchools.find((s) => s.id === id)?.name || id)
      .filter(Boolean);
    const studentNames = targetStudentIds
      .map((id) => availablePrivateStudents.find((st) => st.id === id)?.fullName || id)
      .filter(Boolean);
    return {
      schools: schoolNames,
      students: studentNames,
      totalCount: schoolNames.length + studentNames.length,
    };
  }, [targetSchoolIds, targetStudentIds, availableSchools, availablePrivateStudents]);

  // Question manipulation helpers
  const handleUpdateQuestion = (updated: NativeQuestionData) => {
    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  };

  const handleDuplicateQuestion = (idx: number) => {
    const target = questions[idx];
    if (!target) return;
    const duplicated: NativeQuestionData = {
      ...JSON.parse(JSON.stringify(target)),
      id: makeId(),
      prompt: `${target.prompt} (Copy)`,
    };
    const next = [...questions];
    next.splice(idx + 1, 0, duplicated);
    setQuestions(next);
    setActiveQuestionId(duplicated.id);
  };

  const handleDeleteQuestion = (idx: number) => {
    if (questions.length <= 1) {
      setValidationError('An assessment must have at least one question.');
      return;
    }
    const next = questions.filter((_, i) => i !== idx);
    setQuestions(next);
    setActiveQuestionId(next[Math.max(0, idx - 1)]?.id || '');
  };

  const handleAddQuestion = (atIndex?: number) => {
    const newQ: NativeQuestionData = {
      id: makeId(),
      prompt: '',
      type: 'multiple_choice',
      points: 2,
      required: true,
      options: [
        { id: 'A', text: 'Option 1' },
        { id: 'B', text: 'Option 2' },
        { id: 'C', text: 'Option 3' },
        { id: 'D', text: 'Option 4' },
      ],
      correctOptionIds: ['A'],
    };
    const next = [...questions];
    if (typeof atIndex === 'number') {
      next.splice(atIndex, 0, newQ);
    } else {
      next.push(newQ);
    }
    setQuestions(next);
    setActiveQuestionId(newQ.id);
  };

  const handleMoveQuestion = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= questions.length) return;
    const next = [...questions];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setQuestions(next);
  };

  const handleImportQuestions = (imported: any[]) => {
    const prepared: NativeQuestionData[] = imported.map((imp) => ({
      id: imp.id || makeId(),
      prompt: imp.prompt || 'Imported Question',
      type: imp.type || 'multiple_choice',
      points: Number(imp.points) || 2,
      required: imp.required !== false,
      options: Array.isArray(imp.options) ? imp.options : [],
      correctOptionIds: Array.isArray(imp.correctOptionIds) ? imp.correctOptionIds : [],
      acceptedAnswers: Array.isArray(imp.acceptedAnswers) ? imp.acceptedAnswers : [],
      deliverableInstructions: imp.deliverableInstructions || '',
      acceptedFileTypes: imp.acceptedFileTypes || '',
    }));
    setQuestions((prev) => [...prev, ...prepared]);
  };

  // Step Validation & Navigation
  const handleProceedFromStep1 = () => {
    setCurrentStep(2);
  };

  const handleProceedFromStep2 = () => {
    setCurrentStep(3);
  };

  const handleProceedFromStep3 = () => {
    setValidationError('');
    if (deliveryMode === 'EXTERNAL_LINK') {
      if (!title.trim()) {
        setValidationError('Please provide an assessment title.');
        return;
      }
      if (!externalUrl.trim()) {
        setValidationError('Please provide a valid external assessment link.');
        return;
      }
      if (recipientSummary.totalCount === 0) {
        setValidationError('Please select at least one recipient school or private student.');
        return;
      }
      setCurrentStep(5); // Jump straight to review for external
    } else {
      // Native workflow
      if (recipientSummary.totalCount === 0) {
        setValidationError('Please select at least one target school or private student.');
        return;
      }
      setCurrentStep(4); // Proceed to Native Content Builder
    }
  };

  const handleProceedFromStep4 = () => {
    setValidationError('');
    if (!title.trim()) {
      setValidationError('Please provide an assessment title in the details section.');
      return;
    }
    if (!subject.trim()) {
      setValidationError('Please specify a subject for this assessment.');
      return;
    }
    if (questions.length === 0) {
      setValidationError('Please add at least one question.');
      return;
    }
    setCurrentStep(5); // Review & Publish
  };

  const handleExecuteSave = async (status: 'draft' | 'active') => {
    setValidationError('');
    setIsSubmitting(true);
    try {
      await onSave({
        workType,
        deliveryMode,
        title: title.trim() || `New ${workType}`,
        description: description.trim(),
        subject: subject.trim() || 'General',
        externalUrl: deliveryMode === 'EXTERNAL_LINK' ? externalUrl.trim() : undefined,
        targetSchoolIds,
        targetStudentIds,
        recipientMode,
        targetClass,
        durationMinutes: duration ? Number(duration) : null,
        passcode: passcode.trim(),
        status,
        questions: deliveryMode === 'NATIVE' ? questions : [],
      });
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save assessment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Top Header & Wizard Navigation Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
            title="Cancel & Return to Overview"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {editingAssessment ? 'Edit Assessment' : 'Create New Assessment'}
            </h1>
            <p className="text-xs text-slate-500">
              Step {currentStep} of {deliveryMode === 'EXTERNAL_LINK' ? 4 : 5}:{' '}
              {currentStep === 1
                ? 'Choose Assessment Type'
                : currentStep === 2
                ? 'Choose Assessment Format'
                : currentStep === 3
                ? deliveryMode === 'EXTERNAL_LINK'
                  ? 'External Link & Target Recipients'
                  : 'Target Recipients'
                : currentStep === 4
                ? 'Content Builder & Questions'
                : 'Review & Publish'}
            </p>
          </div>
        </div>

        {/* Progress Bar Indicator */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {[1, 2, 3, 4, 5]
            .filter((s) => (deliveryMode === 'EXTERNAL_LINK' ? s !== 4 : true))
            .map((stepNum) => (
              <div
                key={stepNum}
                className={`h-2 rounded-full transition-all ${
                  currentStep >= stepNum
                    ? 'w-7 sm:w-10 bg-blue-600'
                    : 'w-4 sm:w-6 bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-start gap-3 animate-in fade-in">
          <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm font-bold text-red-800 dark:text-red-200 flex-1">
            {validationError}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 1: CHOOSE ASSESSMENT TYPE (MCQ-STYLE SELECTION LIST)        */}
      {/* ============================================================== */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              What type of assessment are you creating?
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Select one assessment category to establish suitable grading methods, time restrictions, and submission handling.
            </p>
          </div>

          {/* Interactive MCQ Quiz-Style Selection List */}
          <div className="space-y-3">
            {[
              {
                id: 'ASSIGNMENT',
                letter: 'A',
                title: 'Assignment',
                description:
                  'Homework, individual project tasks, or deliverables with flexible submission deadlines and tutor rubric evaluations.',
                badge: 'Flexible Timing · Project Deliverables',
              },
              {
                id: 'TEST',
                letter: 'B',
                title: 'Test',
                description:
                  'Periodic evaluations, mid-term quizzes, and topic checks with standard time limits and automated scoring.',
                badge: 'Timed · Graded Knowledge Check',
              },
              {
                id: 'ACTIVITY',
                letter: 'C',
                title: 'Activity',
                description:
                  'Hands-on practicals, in-class exercises, and formative interactive practice without high-stakes grading.',
                badge: 'Practical · Formative Learning',
              },
              {
                id: 'EXAMINATION',
                letter: 'D',
                title: 'Exam',
                description:
                  'Formal summative examinations, end-of-term evaluations, and certified milestone assessments with secured access.',
                badge: 'Summative · Secure Assessment',
              },
            ].map((option) => {
              const isSelected = workType === option.id;
              return (
                <div
                  key={option.id}
                  onClick={() => setWorkType(option.id as AcademicWorkType)}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                    isSelected
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#161B26] hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* MCQ Option Letter Badge */}
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {option.letter}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                          {option.title}
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {option.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
                        {option.description}
                      </p>
                    </div>
                  </div>

                  {/* Radio Indicator */}
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Step 1 Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleProceedFromStep1}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <span>Continue to Format</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 2: CHOOSE ASSESSMENT FORMAT (NATIVE VS EXTERNAL LINK)     */}
      {/* ============================================================== */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              How would you like to create this assessment?
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Decide whether to compose questions inside Jaystarbliss Studios or provide an external form URL.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Option A: Native Assessment */}
            <div
              onClick={() => setDeliveryMode('NATIVE')}
              className={`p-6 rounded-3xl border transition-all cursor-pointer space-y-4 ${
                deliveryMode === 'NATIVE'
                  ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/20'
                  : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#161B26] hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${
                    deliveryMode === 'NATIVE'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  }`}
                >
                  <FileText size={24} />
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    deliveryMode === 'NATIVE'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {deliveryMode === 'NATIVE' && <Check size={14} strokeWidth={3} />}
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Option A: Native Assessment
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  The assessment will be authored directly inside the Jaystarbliss Studios portal using our full-featured question builder, automated MCQ scoring, and live monitoring.
                </p>
              </div>

              <div className="pt-2 text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Includes 5 question types, CSV/Text import &amp; Question Bank
              </div>
            </div>

            {/* Option B: External Third-Party Link */}
            <div
              onClick={() => setDeliveryMode('EXTERNAL_LINK')}
              className={`p-6 rounded-3xl border transition-all cursor-pointer space-y-4 ${
                deliveryMode === 'EXTERNAL_LINK'
                  ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 shadow-md ring-2 ring-indigo-500/20'
                  : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#161B26] hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${
                    deliveryMode === 'EXTERNAL_LINK'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  <Link2 size={24} />
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    deliveryMode === 'EXTERNAL_LINK'
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {deliveryMode === 'EXTERNAL_LINK' && <Check size={14} strokeWidth={3} />}
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Option B: External Third-Party Link
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Hosted on an external service (e.g. Google Forms, Microsoft Forms, Quizizz) and made accessible to selected recipients through a verified link.
                </p>
              </div>

              <div className="pt-2 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Fast setup without composing questions internally
              </div>
            </div>
          </div>

          {/* Step 2 Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              type="button"
              onClick={handleProceedFromStep2}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <span>Continue</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 3A: EXTERNAL THIRD-PARTY ASSESSMENT WORKFLOW               */}
      {/* ============================================================== */}
      {currentStep === 3 && deliveryMode === 'EXTERNAL_LINK' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Configure External Assessment Link &amp; Recipients
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Provide the assessment link and choose which schools or private learners will receive it.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-[#161B26] border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-5">
            {/* Assessment Name */}
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1.5">
                Assessment Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Mid-Term Web Engineering Quiz (Google Forms)"
                className="w-full text-sm font-bold p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* External URL */}
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1.5">
                External Assessment Link URL <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Link2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://docs.google.com/forms/d/e/... or https://forms.office.com/..."
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Enter the shareable link from Google Forms, Microsoft Forms, Quizizz, or any web platform.
              </p>
            </div>

            {/* Subject & Class */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Digital Literacy, Coding"
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1.5">
                  Target Grade / Class
                </label>
                <select
                  value={targetClass}
                  onChange={(e) => setTargetClass(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {CANONICAL_CLASSES.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Recipients Picker Area */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Target Recipients ({recipientSummary.totalCount} Selected) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowRecipientModal(true)}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Manage Recipients →
                </button>
              </div>

              {recipientSummary.totalCount === 0 ? (
                <div
                  onClick={() => setShowRecipientModal(true)}
                  className="p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/20 transition-all space-y-1.5"
                >
                  <Users size={24} className="mx-auto text-slate-400" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    No recipients selected yet
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Click to choose partner schools, private learners, or both.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {recipientSummary.schools.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200"
                      >
                        <School size={12} /> {name}
                      </span>
                    ))}
                    {recipientSummary.students.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                      >
                        <User size={12} /> {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Duration / Availability Options */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Estimated Duration (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 30)}
                  className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Access Passcode (Optional)
                </label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                  className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Step 3A Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              type="button"
              onClick={handleProceedFromStep3}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <span>Review External Assessment</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 3B: NATIVE WORKFLOW — CHOOSE TARGET RECIPIENTS             */}
      {/* ============================================================== */}
      {currentStep === 3 && deliveryMode === 'NATIVE' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Choose Target Recipients
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Select which partner schools or private learners will be assigned this {workType.toLowerCase()}.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-[#161B26] border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">
                  Audience Scope
                </h3>
                <p className="text-xs text-slate-400">
                  Multiple schools and private students can be assigned simultaneously.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowRecipientModal(true)}
                className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Users size={14} /> Open Recipient Picker
              </button>
            </div>

            {recipientSummary.totalCount === 0 ? (
              <div
                onClick={() => setShowRecipientModal(true)}
                className="p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/20 transition-all space-y-2"
              >
                <Users size={32} className="mx-auto text-slate-400" />
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  No recipients selected
                </p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Click here to choose which partner schools or individual private learners will take this assessment.
                </p>
                <button
                  type="button"
                  className="mt-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  Select Recipients
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                    {recipientSummary.schools.length} School(s) and {recipientSummary.students.length} Private Learner(s) Assigned
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRecipientModal(true)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Change Selection
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Selected Recipients
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {recipientSummary.schools.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                      >
                        <School size={13} className="text-blue-600" />
                        {name}
                      </span>
                    ))}
                    {recipientSummary.students.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                      >
                        <User size={13} className="text-emerald-600" />
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3B Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              type="button"
              disabled={recipientSummary.totalCount === 0}
              onClick={handleProceedFromStep3}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <span>Continue to Question Builder</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 4: NATIVE CONTENT BUILDER & QUESTIONS WORKSPACE           */}
      {/* ============================================================== */}
      {currentStep === 4 && deliveryMode === 'NATIVE' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Bar with Import Questions button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#161B26] p-4 sm:p-5 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Assessment Content Builder
              </h2>
              <p className="text-xs text-slate-500">
                {questions.length} Question(s) · {totalMarks} Total Marks
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Upload size={14} /> Import Questions
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Question
              </button>
            </div>
          </div>

          {/* Assessment Details Card (distinct from question builder) */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#161B26] border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
              Assessment Details &amp; Metadata
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Assessment Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. End-of-Term Web Design & HTML Assessment"
                  className="w-full text-sm font-bold p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Software Engineering, Graphic Design"
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Learning Pathway / Programme
                </label>
                <select
                  value={programTitle}
                  onChange={(e) => setProgramTitle(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="Smart Techies Programme">Smart Techies Programme</option>
                  <option value="Digital Literacy Programme">Digital Literacy Programme</option>
                  <option value="Graphic Design Programme">Graphic Design Programme</option>
                  <option value="Music Programme">Music Programme</option>
                  <option value="General Computing Track">General Computing Track</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Instructions for Students
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Answer all questions carefully. Choose the single best option for multiple choice items."
                  className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Question Cards List */}
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <NativeQuestionCard
                key={q.id}
                question={q}
                index={idx}
                totalQuestions={questions.length}
                isActive={activeQuestionId === q.id}
                onFocus={() => setActiveQuestionId(q.id)}
                onChange={handleUpdateQuestion}
                onDuplicate={() => handleDuplicateQuestion(idx)}
                onDelete={() => handleDeleteQuestion(idx)}
                onAddAbove={() => handleAddQuestion(idx)}
                onAddBelow={() => handleAddQuestion(idx + 1)}
                onMoveUp={() => handleMoveQuestion(idx, idx - 1)}
                onMoveDown={() => handleMoveQuestion(idx, idx + 1)}
              />
            ))}
          </div>

          {/* Bottom Add Question Button */}
          <button
            type="button"
            onClick={() => handleAddQuestion()}
            className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/20 text-slate-600 dark:text-slate-400 hover:text-blue-600 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Plus size={16} /> Add Another Question
          </button>

          {/* Step 4 Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              type="button"
              onClick={handleProceedFromStep4}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <span>Review &amp; Publish</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 5: FINAL REVIEW & PUBLISH STEP                             */}
      {/* ============================================================== */}
      {currentStep === 5 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Review &amp; Publish Assessment
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Verify your assessment configuration, recipients, and questions before saving or publishing.
            </p>
          </div>

          {/* Summary Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#161B26] border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-6">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    {workType}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {deliveryMode === 'EXTERNAL_LINK' ? 'External Link' : 'Native Studio'}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {title || 'Untitled Assessment'}
                </h3>
              </div>

              <div className="text-right">
                <p className="text-xs font-bold text-slate-500">Total Marks</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {deliveryMode === 'EXTERNAL_LINK' ? 'External' : `${totalMarks} Marks`}
                </p>
              </div>
            </div>

            {/* Grid Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Subject</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{subject || 'General'}</p>
                <p className="text-[11px] text-slate-400">{programTitle}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Audience</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {recipientSummary.totalCount} Selected
                </p>
                <p className="text-[11px] text-slate-400">
                  {recipientSummary.schools.length} Schools · {recipientSummary.students.length} Private
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Access &amp; Timing</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {duration ? `${duration} Minutes` : 'Untimed'}
                </p>
                <p className="text-[11px] font-mono text-slate-400">
                  Passcode: <strong>{passcode}</strong>
                </p>
              </div>
            </div>

            {/* Questions preview (if Native) */}
            {deliveryMode === 'NATIVE' && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Questions Outline ({questions.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Edit Questions →
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {questions.map((q, i) => (
                    <div
                      key={q.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="truncate flex-1 text-slate-800 dark:text-slate-200">
                        <strong>Q{i + 1}:</strong> {q.prompt || 'Untitled Question'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-500 shrink-0">
                        {q.points} pt(s)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Final Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(deliveryMode === 'EXTERNAL_LINK' ? 3 : 4)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft size={15} /> Back to Edit
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleExecuteSave('draft')}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <Save size={15} /> Save as Draft
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleExecuteSave('active')}
                className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <Send size={15} /> Publish Assessment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipient Selector Modal */}
      <RecipientSelectorModal
        isOpen={showRecipientModal}
        onClose={() => setShowRecipientModal(false)}
        availableSchools={availableSchools}
        availablePrivateStudents={availablePrivateStudents}
        initialSelectedSchoolIds={targetSchoolIds}
        initialSelectedStudentIds={targetStudentIds}
        isTutor={isTutor}
        onConfirm={({ targetSchoolIds: nextSchools, targetStudentIds: nextStudents, recipientMode: nextMode }) => {
          setTargetSchoolIds(nextSchools);
          setTargetStudentIds(nextStudents);
          setRecipientMode(nextMode);
        }}
      />

      {/* Import Questions Modal */}
      <ImportQuestionsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportQuestions={handleImportQuestions}
        questionBankItems={questionBankItems}
      />
    </div>
  );
};
