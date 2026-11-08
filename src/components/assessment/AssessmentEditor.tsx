import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Eye,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  KeyRound,
  Calendar,
  Settings as SettingsIcon,
  Users,
  FileText,
  BarChart3,
  Activity,
  Plus,
  Copy,
  Trash2,
  Download,
  Upload,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Link2,
  Lock,
  Layers,
  School,
  User,
  Check,
  X,
  MessageSquare,
  HelpCircle,
  Shuffle,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import {
  type AcademicWorkType,
  WORK_TYPES,
  normalizeWorkType,
  validateExternalExamUrl,
  CANONICAL_CLASSES,
} from '../../lib/classes';
import {
  RecipientSelectorModal,
  type RecipientSchool,
  type RecipientPrivateStudent,
} from './RecipientSelectorModal';
import { NativeQuestionCard, type NativeQuestionData, type QuestionTypeChoice } from './NativeQuestionCard';
import { ImportQuestionsModal, type QuestionBankItem } from './ImportQuestionsModal';
import { AssessmentProgramPicker, type SelectedProgramPathway } from './AssessmentProgramPicker';

const generateAccessCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

const TUTOR_REMARK_PRESETS = [
  { id: '1', label: 'Distinction', text: 'Exceptional work. Demonstrated outstanding mastery of all concepts.' },
  { id: '2', label: 'Very Good', text: 'Very impressive performance with strong conceptual understanding.' },
  { id: '3', label: 'Good Effort', text: 'Good effort demonstrated. Keep practicing the practical applications.' },
  { id: '4', label: 'Fair Progress', text: 'Fair submission. Review the lesson materials and attempt revision tasks.' },
  { id: '5', label: 'Needs Improvement', text: 'Needs more dedicated attention and tutor-guided practice.' },
];

export interface AssessmentEditorProps {
  initialExam?: any;
  isCreatingNew?: boolean;
  assignedSchools: Array<{ id: string; name: string }>;
  assignedPrivateStudents: RecipientPrivateStudent[];
  assignedSchoolStudents?: RecipientPrivateStudent[];
  questionBankItems: QuestionBankItem[];
  currentUserRole: string;
  isTutor?: boolean;
  onBackToOverview: () => void;
  onSaveAssessment: (payload: any) => Promise<void>;
  // Response management props
  examAttempts?: any[];
  onReleaseResult?: (attempt: any) => Promise<void>;
  onReleaseAllSubmitted?: () => Promise<void>;
  onSaveManualGrade?: (
    attempt: any,
    andRelease?: boolean,
    overrides?: { totalOverride?: string; itemScores?: Record<string, number>; remark?: string }
  ) => Promise<void>;
  onSaveTutorRemark?: (attempt: any, remark: string) => Promise<void>;
  onExportCsv?: () => void;
  onPreviewStudent?: (exam: any) => void;
  initialTab?: 'questions' | 'responses' | 'settings';
}

export const AssessmentEditor: React.FC<AssessmentEditorProps> = ({
  initialExam,
  isCreatingNew = false,
  assignedSchools,
  assignedPrivateStudents,
  assignedSchoolStudents = [],
  questionBankItems = [],
  isTutor = false,
  onBackToOverview,
  onSaveAssessment,
  examAttempts = [],
  onReleaseResult,
  onReleaseAllSubmitted,
  onSaveManualGrade,
  onSaveTutorRemark,
  onExportCsv,
  onPreviewStudent,
  initialTab = 'questions',
}) => {
  // Whether initial 3-stage setup modal is open (only when creating brand new)
  const [showInitialSetupModal, setShowInitialSetupModal] = useState<boolean>(isCreatingNew);
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);

  // Active Workspace Tab (Questions | Responses | Settings)
  const [activeTab, setActiveTab] = useState<'questions' | 'responses' | 'settings'>(initialTab);

  // Unsaved changes tracking
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveBannerMessage, setSaveBannerMessage] = useState<string>('');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string>('');

  // -------------------------------------------------------------
  // Assessment Core State
  // -------------------------------------------------------------
  const [workType, setWorkType] = useState<AcademicWorkType>(
    initialExam ? normalizeWorkType(initialExam.workType, initialExam) : 'ASSIGNMENT'
  );
  const [deliveryMode, setDeliveryMode] = useState<'NATIVE' | 'EXTERNAL_LINK'>(
    initialExam?.deliveryMode === 'EXTERNAL_LINK' ? 'EXTERNAL_LINK' : 'NATIVE'
  );
  const [title, setTitle] = useState<string>(initialExam?.title || '');
  const [description, setDescription] = useState<string>(
    initialExam?.description || initialExam?.instructions || ''
  );
  const [subject, setSubject] = useState<string>(initialExam?.subject || 'Technology & Digital Skills');
  const [programTitle, setProgramTitle] = useState<string>(
    initialExam?.programTitle || initialExam?.programName || 'Technology Programme'
  );
  const [programId, setProgramId] = useState<string>(
    initialExam?.programId || 'root-technology-programme'
  );
  const [programBreadcrumbs, setProgramBreadcrumbs] = useState<string>(
    initialExam?.programPath || initialExam?.programBreadcrumbs || 'Technology Programme'
  );
  const [primaryCategory, setPrimaryCategory] = useState<string>(
    initialExam?.primaryCategory || initialExam?.category || 'Technology Programme'
  );
  const [targetClass, setTargetClass] = useState<string>(
    initialExam?.targetClass || initialExam?.className || CANONICAL_CLASSES[1] || 'Primary 4'
  );
  const [externalUrl, setExternalUrl] = useState<string>(initialExam?.externalUrl || '');
  const [status, setStatus] = useState<'draft' | 'active' | 'scheduled'>(
    initialExam?.status || 'draft'
  );

  // -------------------------------------------------------------
  // Recipients State
  // -------------------------------------------------------------
  const [recipientMode, setRecipientMode] = useState<'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET'>(
    initialExam?.recipientMode || 'SCHOOL_CLASS'
  );
  const [targetSchoolIds, setTargetSchoolIds] = useState<string[]>(
    initialExam?.targetSchoolIds ||
      (initialExam?.schoolId && initialExam.schoolId !== 'private' ? [initialExam.schoolId] : [])
  );
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>(
    initialExam?.targetStudentIds || []
  );
  const [showRecipientModal, setShowRecipientModal] = useState<boolean>(false);

  // -------------------------------------------------------------
  // Questions State
  // -------------------------------------------------------------
  const [questions, setQuestions] = useState<NativeQuestionData[]>(() => {
    if (initialExam?.questions && Array.isArray(initialExam.questions) && initialExam.questions.length > 0) {
      return initialExam.questions.map((q: any) => ({
        id: q.id || makeId(),
        prompt: q.prompt || '',
        type: q.type || 'multiple_choice',
        points: Number(q.points ?? 2),
        required: q.required !== false,
        options: q.options || [
          { id: 'A', text: 'Option 1' },
          { id: 'B', text: 'Option 2' },
          { id: 'C', text: 'Option 3' },
          { id: 'D', text: 'Option 4' },
        ],
        correctOptionIds: q.correctOptionIds || ['A'],
        acceptedAnswers: q.acceptedAnswers || [],
        deliverableInstructions: q.deliverableInstructions || '',
      }));
    }
    return [
      {
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
      },
    ];
  });
  const [activeQuestionId, setActiveQuestionId] = useState<string>(questions[0]?.id || '');
  const [showImportModal, setShowImportModal] = useState<boolean>(false);

  // -------------------------------------------------------------
  // Settings State
  // -------------------------------------------------------------
  const [makeQuiz, setMakeQuiz] = useState<boolean>(initialExam?.makeQuiz !== false);
  const [gradingMode, setGradingMode] = useState<'automatic' | 'manual'>(
    initialExam?.gradingMode || 'automatic'
  );
  const [releaseGradesPolicy, setReleaseGradesPolicy] = useState<'immediate' | 'manual'>(
    initialExam?.releaseGradesPolicy || 'immediate'
  );
  const [showMissedQuestions, setShowMissedQuestions] = useState<boolean>(
    initialExam?.showMissedQuestions !== false
  );
  const [showCorrectAnswers, setShowCorrectAnswers] = useState<boolean>(
    initialExam?.showCorrectAnswers !== false
  );
  const [showPointValues, setShowPointValues] = useState<boolean>(
    initialExam?.showPointValues !== false
  );
  const [defaultPointValue, setDefaultPointValue] = useState<number>(
    Number(initialExam?.defaultPointValue || 2)
  );
  const [hasPasscode, setHasPasscode] = useState<boolean>(Boolean(initialExam?.passcode));
  const [passcode, setPasscode] = useState<string>(
    initialExam?.passcode || generateAccessCode()
  );
  const [hasTimeLimit, setHasTimeLimit] = useState<boolean>(
    initialExam?.durationMinutes !== null && initialExam?.durationMinutes !== undefined
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    initialExam?.durationMinutes || (workType === 'TEST' ? 20 : workType === 'ACTIVITY' ? 15 : 30)
  );
  const [availableFrom, setAvailableFrom] = useState<string>(initialExam?.availableFrom || '');
  const [availableUntil, setAvailableUntil] = useState<string>(initialExam?.availableUntil || '');
  const [dueDate, setDueDate] = useState<string>(initialExam?.dueDate || '');
  const [limitOneAttempt, setLimitOneAttempt] = useState<boolean>(
    initialExam?.limitOneAttempt !== false
  );
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(
    Boolean(initialExam?.shuffleQuestions)
  );
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(
    Boolean(initialExam?.shuffleOptions)
  );
  const [confirmationMessage, setConfirmationMessage] = useState<string>(
    initialExam?.confirmationMessage || 'Your response has been recorded. Good job!'
  );

  // -------------------------------------------------------------
  // Responses Tab State
  // -------------------------------------------------------------
  const [responsesSubTab, setResponsesSubTab] = useState<'live' | 'summary' | 'question' | 'individual'>('live');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string>('');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number>(0);
  const [manualScoresByAttempt, setManualScoresByAttempt] = useState<Record<string, Record<string, number>>>({});
  const [manualTotalScoreByAttempt, setManualTotalScoreByAttempt] = useState<Record<string, string>>({});
  const [tutorRemarksByAttempt, setTutorRemarksByAttempt] = useState<Record<string, string>>({});
  const [releasingResultId, setReleasingResultId] = useState<string | null>(null);
  const [bulkReleasingResults, setBulkReleasingResults] = useState<boolean>(false);
  const [savingGradeId, setSavingGradeId] = useState<string | null>(null);

  // Mark form as dirty when edits occur
  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Total possible score computed from questions
  const totalMarks = useMemo(() => {
    if (deliveryMode === 'EXTERNAL_LINK') return initialExam?.maxScore || 100;
    return questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);
  }, [questions, deliveryMode, initialExam]);

  // Recipient names summary
  const recipientSummary = useMemo(() => {
    const schoolNames = assignedSchools
      .filter((s) => targetSchoolIds.includes(s.id))
      .map((s) => s.name);
    const studentNames = assignedPrivateStudents
      .filter((st) => targetStudentIds.includes(st.id))
      .map((st) => st.fullName);

    return {
      schools: schoolNames,
      students: studentNames,
      totalCount: schoolNames.length + studentNames.length,
      label:
        schoolNames.length > 0 && studentNames.length > 0
          ? `${schoolNames.length} School(s) & ${studentNames.length} Private Student(s)`
          : schoolNames.length > 0
          ? `${schoolNames.length} School(s)`
          : studentNames.length > 0
          ? `${studentNames.length} Private Student(s)`
          : 'None Selected',
    };
  }, [assignedSchools, assignedPrivateStudents, targetSchoolIds, targetStudentIds]);

  // Proctor Metrics for Responses Tab
  const proctorMetrics = useMemo(() => {
    const now = Date.now();
    let onlineActiveCount = 0;
    let offlineInProgressCount = 0;
    let submittedCompletedCount = 0;

    examAttempts.forEach((at) => {
      let heartbeatTime = 0;
      if (at.lastHeartbeat?.toMillis) heartbeatTime = at.lastHeartbeat.toMillis();
      else if (typeof at.lastHeartbeat === 'string') heartbeatTime = new Date(at.lastHeartbeat).getTime();

      const isHeartbeatFresh = heartbeatTime > 0 && now - heartbeatTime < 150000;
      if (at.status === 'in_progress') {
        if (at.isOnline !== false && isHeartbeatFresh) {
          onlineActiveCount++;
        } else {
          offlineInProgressCount++;
        }
      } else if (['submitted', 'completed', 'graded', 'expired'].includes(at.status)) {
        submittedCompletedCount++;
      }
    });

    const totalEligible = Math.max(
      examAttempts.length,
      recipientSummary.students.length || (targetSchoolIds.length > 0 ? 25 : 0)
    );
    const notStartedCount = Math.max(0, totalEligible - (onlineActiveCount + offlineInProgressCount + submittedCompletedCount));

    return {
      onlineActiveCount,
      offlineInProgressCount,
      submittedCompletedCount,
      notStartedCount,
      totalEligible,
    };
  }, [examAttempts, recipientSummary, targetSchoolIds]);

  // Summary Insights for Responses Tab
  const summaryInsights = useMemo(() => {
    const scoredAttempts = examAttempts.filter(
      (at) => ['submitted', 'completed', 'graded', 'expired'].includes(at.status) && at.score !== undefined
    );
    if (!scoredAttempts.length) {
      return {
        avgScore: 0,
        medianScore: 0,
        rangeMin: 0,
        rangeMax: 0,
        distribution: [] as Array<{ points: number; count: number }>,
        frequentlyMissed: [] as Array<{ prompt: string; correctRate: number }>,
      };
    }

    const scores = scoredAttempts.map((at) => Number(at.score || 0)).sort((a, b) => a - b);
    const sum = scores.reduce((acc, s) => acc + s, 0);
    const avgScore = Number((sum / scores.length).toFixed(1));
    const medianScore = scores[Math.floor(scores.length / 2)] || 0;
    const rangeMin = scores[0];
    const rangeMax = scores[scores.length - 1];

    // Distribution
    const distMap: Record<number, number> = {};
    scores.forEach((sc) => {
      const rounded = Math.round(sc);
      distMap[rounded] = (distMap[rounded] || 0) + 1;
    });
    const distribution = Object.entries(distMap).map(([pts, count]) => ({
      points: Number(pts),
      count,
    }));

    // Frequently Missed Questions
    const missedList: Array<{ prompt: string; correctRate: number }> = [];
    questions.forEach((q) => {
      if (q.type === 'multiple_choice' && q.correctOptionIds && q.correctOptionIds.length > 0) {
        let correctCount = 0;
        let attemptCount = 0;
        scoredAttempts.forEach((at) => {
          const ans = at.answers?.[q.id];
          if (ans !== undefined) {
            attemptCount++;
            if (Array.isArray(ans) ? ans.some((a) => q.correctOptionIds?.includes(a)) : (q.correctOptionIds ? q.correctOptionIds.includes(ans) : false)) {
              correctCount++;
            }
          }
        });
        if (attemptCount > 0) {
          const rate = Math.round((correctCount / attemptCount) * 100);
          if (rate < 60) {
            missedList.push({ prompt: q.prompt || 'Untitled Question', correctRate: rate });
          }
        }
      }
    });

    return {
      avgScore,
      medianScore,
      rangeMin,
      rangeMax,
      distribution,
      frequentlyMissed: missedList,
    };
  }, [examAttempts, questions]);

  // Question Management Callbacks
  const handleAddQuestion = (index?: number) => {
    markDirty();
    const newQ: NativeQuestionData = {
      id: makeId(),
      prompt: '',
      type: 'multiple_choice',
      points: defaultPointValue,
      required: true,
      options: [
        { id: 'A', text: 'Option 1' },
        { id: 'B', text: 'Option 2' },
        { id: 'C', text: 'Option 3' },
        { id: 'D', text: 'Option 4' },
      ],
      correctOptionIds: ['A'],
    };

    if (index !== undefined && index >= 0) {
      const updated = [...questions];
      updated.splice(index + 1, 0, newQ);
      setQuestions(updated);
      setActiveQuestionId(newQ.id);
    } else {
      setQuestions((prev) => [...prev, newQ]);
      setActiveQuestionId(newQ.id);
    }
  };

  const handleUpdateQuestion = (index: number, updatedQ: NativeQuestionData) => {
    markDirty();
    setQuestions((prev) => {
      const copy = [...prev];
      copy[index] = updatedQ;
      return copy;
    });
  };

  const handleDuplicateQuestion = (index: number) => {
    markDirty();
    const source = questions[index];
    const duplicated: NativeQuestionData = {
      ...source,
      id: makeId(),
      prompt: source.prompt ? `${source.prompt} (Copy)` : 'Copy of Question',
      options: source.options ? source.options.map((opt) => ({ ...opt, id: opt.id })) : undefined,
    };
    const updated = [...questions];
    updated.splice(index + 1, 0, duplicated);
    setQuestions(updated);
    setActiveQuestionId(duplicated.id);
  };

  const handleDeleteQuestion = (index: number) => {
    markDirty();
    if (questions.length <= 1) {
      alert('An assessment must have at least one question.');
      return;
    }
    const updated = questions.filter((_, idx) => idx !== index);
    setQuestions(updated);
    if (activeQuestionId === questions[index]?.id) {
      setActiveQuestionId(updated[Math.max(0, index - 1)]?.id || '');
    }
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;
    markDirty();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...questions];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setQuestions(updated);
  };

  const handleImportBatchQuestions = (importedList: any[]) => {
    markDirty();
    const formatted: NativeQuestionData[] = importedList.map((item) => ({
      id: item.id || makeId(),
      prompt: item.prompt || '',
      type: item.type || 'multiple_choice',
      points: Number(item.points || defaultPointValue),
      required: item.required !== false,
      options: item.options || [
        { id: 'A', text: 'Option A' },
        { id: 'B', text: 'Option B' },
      ],
      correctOptionIds: item.correctOptionIds || ['A'],
      acceptedAnswers: item.acceptedAnswers || [],
      deliverableInstructions: item.deliverableInstructions || '',
    }));

    setQuestions((prev) => [...prev, ...formatted]);
    setShowImportModal(false);
    setSaveBannerMessage(`Imported ${formatted.length} question(s) successfully.`);
    setTimeout(() => setSaveBannerMessage(''), 4000);
  };

  // Save / Publish Pipeline
  const handleSaveWorkspace = async (targetStatus?: 'draft' | 'active') => {
    setSaveErrorMessage('');
    if (!title.trim()) {
      setSaveErrorMessage('Please enter an assessment title before saving.');
      setActiveTab('questions');
      return;
    }

    if (deliveryMode === 'EXTERNAL_LINK') {
      const urlCheck = validateExternalExamUrl(externalUrl);
      if (!urlCheck.valid) {
        setSaveErrorMessage(urlCheck.error || 'Please enter a valid external assessment link.');
        setActiveTab('questions');
        return;
      }
    }

    if (targetSchoolIds.length === 0 && targetStudentIds.length === 0) {
      setSaveErrorMessage('Please assign at least one recipient school or private learner.');
      setShowRecipientModal(true);
      return;
    }

    setIsSaving(true);
    try {
      const resolvedStatus = targetStatus || status;
      const payload = {
        title: title.trim(),
        description: description.trim(),
        subject: subject.trim(),
        programTitle: programTitle.trim(),
        programId: programId.trim(),
        programPath: programBreadcrumbs.trim(),
        programBreadcrumbs: programBreadcrumbs.trim(),
        primaryCategory: primaryCategory.trim(),
        workType,
        deliveryMode,
        externalUrl: deliveryMode === 'EXTERNAL_LINK' ? externalUrl.trim() : '',
        status: resolvedStatus,
        targetClass,
        recipientMode,
        targetSchoolIds,
        targetStudentIds,
        questions: deliveryMode === 'NATIVE' ? questions : [],
        // Settings
        makeQuiz,
        gradingMode,
        releaseGradesPolicy,
        showMissedQuestions,
        showCorrectAnswers,
        showPointValues,
        defaultPointValue,
        passcode: hasPasscode ? passcode.trim().toUpperCase() : '',
        durationMinutes: hasTimeLimit ? durationMinutes : null,
        availableFrom: availableFrom || null,
        availableUntil: availableUntil || null,
        dueDate: dueDate || null,
        limitOneAttempt,
        shuffleQuestions,
        shuffleOptions,
        confirmationMessage: confirmationMessage.trim(),
        maxScore: totalMarks,
      };

      await onSaveAssessment(payload);
      setStatus(resolvedStatus);
      setIsDirty(false);
      setSaveBannerMessage(
        resolvedStatus === 'active'
          ? 'Assessment published and active for students!'
          : 'Assessment draft saved successfully.'
      );
      setTimeout(() => setSaveBannerMessage(''), 5000);
    } catch (err) {
      setSaveErrorMessage(err instanceof Error ? err.message : 'Failed to save assessment.');
    } finally {
      setIsSaving(false);
    }
  };

  // Warn before leaving if dirty
  const handleBackSafe = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved changes in this assessment. Return to Overview anyway?')) {
        onBackToOverview();
      }
    } else {
      onBackToOverview();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* ============================================================== */}
      {/* STAGE 1-3 INITIAL SETUP MODAL (Only when creating brand new)   */}
      {/* ============================================================== */}
      {showInitialSetupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#121620] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Step {setupStep} of 3
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {setupStep === 1
                    ? 'What type of assessment are you creating?'
                    : setupStep === 2
                    ? 'How would you like to create this assessment?'
                    : 'Who is this assessment for?'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onBackToOverview}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              {/* STAGE 1: Assessment Type Selection */}
              {setupStep === 1 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 mb-2">
                    Select the assessment classification. This controls student portal display and weighting:
                  </p>
                  {(
                    [
                      {
                        type: 'ASSIGNMENT' as const,
                        label: 'Assignment',
                        desc: 'Homework, practical tasks, or project work with a submission deadline.',
                      },
                      {
                        type: 'TEST' as const,
                        label: 'Test',
                        desc: 'Timed periodic test evaluating topic or module retention.',
                      },
                      {
                        type: 'ACTIVITY' as const,
                        label: 'Activity',
                        desc: 'In-class practice, coding challenge, or collaborative deliverable.',
                      },
                      {
                        type: 'EXAMINATION' as const,
                        label: 'Examination',
                        desc: 'Formal end-of-term assessment with passcodes and strict proctoring.',
                      },
                    ] satisfies Array<{ type: AcademicWorkType; label: string; desc: string }>
                  ).map((item) => (
                    <label
                      key={item.type}
                      onClick={() => setWorkType(item.type)}
                      className={`p-4 rounded-2xl border flex items-start gap-3.5 cursor-pointer transition-all ${
                        workType === item.type
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-600/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="initWorkType"
                        checked={workType === item.type}
                        onChange={() => setWorkType(item.type)}
                        className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-sm text-slate-900 dark:text-white block">
                          {item.label}
                        </span>
                        <span className="text-xs text-slate-500 mt-0.5 block leading-relaxed">
                          {item.desc}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* STAGE 2: Assessment Format Selection */}
              {setupStep === 2 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 mb-2">
                    Choose how students will complete this assessment:
                  </p>
                  <label
                    onClick={() => setDeliveryMode('NATIVE')}
                    className={`p-4 rounded-2xl border flex items-start gap-3.5 cursor-pointer transition-all ${
                      deliveryMode === 'NATIVE'
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-600/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="initFormat"
                      checked={deliveryMode === 'NATIVE'}
                      onChange={() => setDeliveryMode('NATIVE')}
                      className="mt-1 w-4 h-4 text-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-blue-600" />
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          Option A: Native Assessment (Recommended)
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block leading-relaxed">
                        Create questions directly in Jaystarbliss Studios with Google Forms-inspired authoring,
                        automatic scoring, live candidate proctoring, and question bank importing.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setDeliveryMode('EXTERNAL_LINK')}
                    className={`p-4 rounded-2xl border flex items-start gap-3.5 cursor-pointer transition-all ${
                      deliveryMode === 'EXTERNAL_LINK'
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-600/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="initFormat"
                      checked={deliveryMode === 'EXTERNAL_LINK'}
                      onChange={() => setDeliveryMode('EXTERNAL_LINK')}
                      className="mt-1 w-4 h-4 text-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ExternalLink size={16} className="text-indigo-600" />
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          Option B: External Third-Party Link
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block leading-relaxed">
                        Link out to Google Forms, Microsoft Forms, Kahoot, or an external portal. Students will be redirected with their session preserved.
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* STAGE 3: Target Recipients Selection */}
              {setupStep === 3 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Select the schools or private learners who will receive this assessment:
                  </p>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Selected Cohorts ({recipientSummary.totalCount})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRecipientModal(true)}
                        className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Users size={13} /> {recipientSummary.totalCount > 0 ? 'Edit Recipients' : '+ Choose Recipients'}
                      </button>
                    </div>

                    {recipientSummary.totalCount === 0 ? (
                      <div className="p-6 text-center border border-dashed rounded-xl border-slate-300 dark:border-slate-700">
                        <Users size={28} className="mx-auto text-slate-400 mb-2" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          No recipients chosen yet
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Click below to select school classes or private students.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowRecipientModal(true)}
                          className="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                        >
                          Select Target Recipients
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {recipientSummary.schools.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-blue-700 dark:text-blue-300"
                          >
                            <School size={11} /> {name}
                          </span>
                        ))}
                        {recipientSummary.students.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
                          >
                            <User size={11} /> {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              {setupStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setSetupStep((prev) => (prev - 1) as 1 | 2 | 3)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ← Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBackToOverview}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              )}

              {setupStep < 3 ? (
                <button
                  type="button"
                  onClick={() => setSetupStep((prev) => (prev + 1) as 1 | 2 | 3)}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowInitialSetupModal(false);
                    setActiveTab('questions');
                  }}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5"
                >
                  Launch Assessment Workspace →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* GOOGLE FORMS-INSPIRED TOP HEADER BAR (3 TABS: Qs, Responses, Settings) */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#121620]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-1.5 sm:px-4 lg:px-6">
          <div className="h-12 sm:h-14 md:h-16 flex items-center justify-between gap-1 sm:gap-3">
            {/* Left: Back Arrow, Title Input, Badges */}
            <div className="flex items-center gap-1 sm:gap-2 min-w-0 max-w-[26%] sm:max-w-[30%] md:max-w-md shrink">
              <button
                type="button"
                onClick={handleBackSafe}
                className="p-1 sm:p-2 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Return to Assessment Overview"
              >
                <ArrowLeft size={13} className="sm:w-4 sm:h-4" />
              </button>

              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    markDirty();
                  }}
                  placeholder="Untitled Assessment"
                  className="font-black text-[11px] sm:text-xs md:text-sm text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-600 focus:outline-none transition-colors truncate w-full py-0.5"
                />
                <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200/60 dark:border-red-900/40 whitespace-nowrap shrink-0">
                  {workType}
                </span>
                {isDirty && (
                  <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 font-bold whitespace-nowrap shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="hidden sm:inline">Unsaved</span>
                  </span>
                )}
              </div>
            </div>

            {/* Center: Google Forms 3 Tabs (Questions | Responses | Settings) */}
            <nav className="flex items-center justify-center gap-0.5 sm:gap-1.5 md:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('questions')}
                className={`relative px-1.5 sm:px-3 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'questions'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Questions
                {activeTab === 'questions' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-0.75 bg-blue-600 rounded-t-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('responses')}
                className={`relative px-1.5 sm:px-3 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm font-bold transition-colors inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'responses'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Responses
                {examAttempts.length > 0 && (
                  <span className="px-1 py-0.2 rounded-full text-[8px] sm:text-[10px] font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {examAttempts.length}
                  </span>
                )}
                {activeTab === 'responses' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-0.75 bg-blue-600 rounded-t-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`relative px-1.5 sm:px-3 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm font-bold transition-colors inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'settings'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <SettingsIcon size={12} className="hidden sm:inline shrink-0" />
                <span>Settings</span>
                {activeTab === 'settings' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-0.75 bg-blue-600 rounded-t-full" />
                )}
              </button>
            </nav>

            {/* Right: Actions (Recipients, Preview, Save Draft, Publish) */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowRecipientModal(true)}
                className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                title="Target Cohort Configuration"
              >
                <Users size={12} className="text-blue-600 shrink-0" />
                <span>{recipientSummary.totalCount} Cohorts</span>
              </button>

              {onPreviewStudent && (
                <button
                  type="button"
                  onClick={() => onPreviewStudent({ title, questions, passcode, workType })}
                  className="p-1 sm:px-2 sm:py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] sm:text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="Interactive Student Preview"
                >
                  <Eye size={12} className="shrink-0" />
                  <span className="hidden sm:inline">Preview</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveWorkspace('draft')}
                className="p-1 sm:px-2.5 sm:py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                title="Save as Draft"
              >
                <Save size={11} className="shrink-0" />
                <span className="hidden sm:inline">Save</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveWorkspace('active')}
                className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] sm:text-xs font-bold inline-flex items-center gap-1 shadow-xs disabled:opacity-50 whitespace-nowrap shrink-0"
                title={status === 'active' ? 'Update Assessment' : 'Publish Assessment'}
              >
                <CheckCircle2 size={12} className="shrink-0" />
                <span className="whitespace-nowrap">{status === 'active' ? 'Update' : 'Publish'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Banner Notifications */}
      {saveBannerMessage && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold text-center flex items-center justify-center gap-2">
          <CheckCircle2 size={15} /> {saveBannerMessage}
        </div>
      )}
      {saveErrorMessage && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs font-bold text-center flex items-center justify-center gap-2">
          <AlertCircle size={15} /> {saveErrorMessage}
        </div>
      )}

      {/* ============================================================== */}
      {/* WORKSPACE CONTENT BODY (DYNAMICALLY SWITCHES TABS)             */}
      {/* ============================================================== */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-6 pb-20 space-y-5">
        {/* ============================================================== */}
        {/* TAB 1: QUESTIONS                                               */}
        {/* ============================================================== */}
        {activeTab === 'questions' && (
          <div className="space-y-4">
            {/* Assessment Details Top Header Card */}
            <div className="rounded-2xl border-t-8 border-t-blue-600 border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] p-5 sm:p-7 shadow-xs space-y-4">
              <div className="space-y-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    markDirty();
                  }}
                  placeholder="Assessment Title (e.g. Term 1 Web Development Exam)"
                  className="w-full text-xl sm:text-2xl font-black text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-600 focus:outline-none py-1"
                />
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    markDirty();
                  }}
                  placeholder="Form description / General instructions for students..."
                  className="w-full text-xs text-slate-600 dark:text-slate-400 bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-600 focus:outline-none resize-none py-1"
                />
              </div>

              {/* Subject, Programme, Target Class Metadata Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Subject / Topic
                  </span>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      markDirty();
                    }}
                    placeholder="e.g. Robotics, Python, Web Dev"
                    className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900 px-3 text-xs font-semibold"
                  />
                </label>

                <div className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Learning Pathway / Programme (4 Primary Roots &amp; Deep Nested Tracks)
                  </span>
                  <AssessmentProgramPicker
                    selectedProgramId={programId}
                    selectedProgramTitle={programTitle}
                    selectedBreadcrumbPath={programBreadcrumbs}
                    onSelectProgram={(pathway) => {
                      setProgramId(pathway.programId);
                      setProgramTitle(pathway.programTitle);
                      setProgramBreadcrumbs(pathway.breadcrumbPath);
                      setPrimaryCategory(pathway.primaryCategory);
                      markDirty();
                    }}
                  />
                </div>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Target Class / Level
                  </span>
                  <select
                    value={targetClass}
                    onChange={(e) => {
                      setTargetClass(e.target.value);
                      markDirty();
                    }}
                    className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900 px-3 text-xs font-semibold"
                  >
                    {CANONICAL_CLASSES.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* External Link Setup Banner (If External Link delivery mode) */}
              {deliveryMode === 'EXTERNAL_LINK' && (
                <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                    <ExternalLink size={13} /> External Third-Party Assessment URL
                  </span>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => {
                      setExternalUrl(e.target.value);
                      markDirty();
                    }}
                    placeholder="https://docs.google.com/forms/d/e/... or https://forms.office.com/..."
                    className="w-full h-10 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                  />
                  <p className="text-[11px] text-slate-500">
                    Students will click to launch this external test. Their participation will be marked when they submit.
                  </p>
                </div>
              )}
            </div>

            {/* Native Question Builder List (Only if Native delivery mode) */}
            {deliveryMode === 'NATIVE' ? (
              <div className="space-y-4">
                {/* Floating/Top Controls: Add Question & Import Questions */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-[#121620] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">
                      {questions.length} Question(s)
                    </span>
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md">
                      {totalMarks} Total Marks
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowImportModal(true)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5"
                    >
                      <Sparkles size={13} className="text-blue-600" />
                      <span>Import Questions</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddQuestion()}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
                    >
                      <Plus size={14} />
                      <span>Add Question</span>
                    </button>
                  </div>
                </div>

                {/* Question Cards */}
                {questions.map((q, idx) => (
                  <NativeQuestionCard
                    key={q.id}
                    question={q}
                    index={idx}
                    totalQuestions={questions.length}
                    isActive={activeQuestionId === q.id}
                    onFocus={() => setActiveQuestionId(q.id)}
                    onChange={(updated) => handleUpdateQuestion(idx, updated)}
                    onDuplicate={() => handleDuplicateQuestion(idx)}
                    onDelete={() => handleDeleteQuestion(idx)}
                    onMoveUp={() => handleMoveQuestion(idx, 'up')}
                    onMoveDown={() => handleMoveQuestion(idx, 'down')}
                    onAddAbove={() => handleAddQuestion(idx - 1)}
                    onAddBelow={() => handleAddQuestion(idx)}
                  />
                ))}

                {/* Bottom Add Bar */}
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleAddQuestion()}
                    className="px-5 py-2.5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors inline-flex items-center gap-2"
                  >
                    <Plus size={15} /> Add Another Question
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed rounded-2xl border-slate-300 dark:border-slate-700 text-xs text-slate-500">
                Native question builder is disabled because this assessment uses an <strong>External Link</strong>.
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: RESPONSES                                              */}
        {/* ============================================================== */}
        {activeTab === 'responses' && (
          <div className="space-y-5">
            {/* Responses Top Action Bar */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {examAttempts.length} Response(s)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time participant activity, automatic grading, submissions, and marks release.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <span>Accepting responses</span>
                  <input
                    type="checkbox"
                    checked={status === 'active'}
                    onChange={(e) => {
                      setStatus(e.target.checked ? 'active' : 'draft');
                      markDirty();
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                {examAttempts.some(
                  (at) =>
                    !at.resultReleased &&
                    ['submitted', 'completed', 'graded', 'expired'].includes(at.status)
                ) &&
                  onReleaseAllSubmitted && (
                    <button
                      type="button"
                      disabled={bulkReleasingResults}
                      onClick={async () => {
                        setBulkReleasingResults(true);
                        try {
                          await onReleaseAllSubmitted();
                          setSaveBannerMessage('Released all pending student results.');
                        } finally {
                          setBulkReleasingResults(false);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                    >
                      <CheckCircle2 size={14} />
                      <span>
                        {bulkReleasingResults
                          ? 'Releasing…'
                          : `Release All Pending (${
                              examAttempts.filter(
                                (at) =>
                                  !at.resultReleased &&
                                  ['submitted', 'completed', 'graded', 'expired'].includes(at.status)
                              ).length
                            })`}
                      </span>
                    </button>
                  )}

                {onExportCsv && (
                  <button
                    type="button"
                    onClick={onExportCsv}
                    disabled={!examAttempts.length}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Download size={14} className="text-emerald-600" /> Export CSV
                  </button>
                )}
              </div>
            </div>

            {/* 4 Summary Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Taking Exam
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <p className="text-2xl font-black text-emerald-900 dark:text-white mt-1">
                  {proctorMetrics.onlineActiveCount}
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Online &amp; Active
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 sm:p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Offline / Stalled
                </span>
                <p className="text-2xl font-black text-amber-900 dark:text-white mt-1">
                  {proctorMetrics.offlineInProgressCount}
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                  Disconnected &gt; 2m
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 dark:bg-blue-950/30 p-3.5 sm:p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                  Completed
                </span>
                <p className="text-2xl font-black text-blue-900 dark:text-white mt-1">
                  {proctorMetrics.submittedCompletedCount}
                </p>
                <p className="text-[10px] text-blue-700 dark:text-blue-400 mt-0.5">
                  Submitted final answers
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-900/40 p-3.5 sm:p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Not Started
                </span>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {proctorMetrics.notStartedCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Eligible candidates</p>
              </div>
            </div>

            {/* Responses Sub-Tabs Bar */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              {(
                [
                  { id: 'live', label: `Live Roster (${proctorMetrics.onlineActiveCount})`, icon: Activity },
                  { id: 'summary', label: 'Summary Insights', icon: BarChart3 },
                  { id: 'question', label: 'By Question', icon: FileText },
                  { id: 'individual', label: 'Individual Review', icon: Users },
                ] as const
              ).map((sub) => {
                const Icon = sub.icon;
                const isCur = responsesSubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setResponsesSubTab(sub.id)}
                    className={`px-3 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 ${
                      isCur
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={13} />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Sub-Tab 1: Live Roster Table */}
            {responsesSubTab === 'live' && (
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] overflow-hidden shadow-xs">
                {examAttempts.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No student has started this assessment yet. Share the access code{' '}
                    <strong>{passcode}</strong> with eligible learners.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-3">Student Name</th>
                          <th className="px-4 py-3">Class / School</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Progress</th>
                          <th className="px-4 py-3">Score</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {examAttempts.map((at) => {
                          const isSubmitted = ['submitted', 'completed', 'graded', 'expired'].includes(at.status);
                          const answeredCount = Object.keys(at.answers || {}).length;

                          return (
                            <tr
                              key={at.id}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                {at.studentName}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {at.className || at.schoolName || 'Enrolled Student'}
                              </td>
                              <td className="px-4 py-3">
                                {isSubmitted ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      at.resultReleased
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                    }`}
                                  >
                                    <CheckCircle2 size={11} />
                                    {at.resultReleased ? 'Released' : 'Submitted'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                    <Activity size={11} /> In Progress
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">
                                {answeredCount} / {questions.length} answered
                              </td>
                              <td className="px-4 py-3 font-bold">
                                {isSubmitted
                                  ? `${at.score ?? 0} / ${at.maxScore ?? totalMarks} (${at.percentage ?? 0}%)`
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  {isSubmitted && onReleaseResult && (
                                    <button
                                      type="button"
                                      disabled={releasingResultId === at.id}
                                      onClick={async () => {
                                        setReleasingResultId(at.id);
                                        try {
                                          await onReleaseResult(at);
                                        } finally {
                                          setReleasingResultId(null);
                                        }
                                      }}
                                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                                        at.resultReleased
                                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                          : 'bg-blue-600 text-white hover:bg-blue-700'
                                      }`}
                                    >
                                      {at.resultReleased ? 'Released' : 'Release Result'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedAttemptId(at.id);
                                      setResponsesSubTab('individual');
                                    }}
                                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    View
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 2: Summary Insights */}
            {responsesSubTab === 'summary' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] p-5 shadow-xs space-y-4">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 size={16} className="text-blue-600" /> Performance Insights
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Average
                      </span>
                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                        {summaryInsights.avgScore} / {totalMarks} pts
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Median
                      </span>
                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                        {summaryInsights.medianScore} / {totalMarks} pts
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Score Range
                      </span>
                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                        {summaryInsights.rangeMin} - {summaryInsights.rangeMax} pts
                      </p>
                    </div>
                  </div>

                  {/* Frequently Missed Questions */}
                  {summaryInsights.frequentlyMissed.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        Frequently Missed Questions (&lt; 60% accuracy)
                      </span>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {summaryInsights.frequentlyMissed.map((item, idx) => (
                          <div key={idx} className="py-2 flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.prompt}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">
                              {item.correctRate}% correct
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-Tab 3: By Question */}
            {responsesSubTab === 'question' && (
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={selectedQuestionIndex <= 0}
                      onClick={() => setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Question {selectedQuestionIndex + 1} of {questions.length}
                    </span>
                    <button
                      type="button"
                      disabled={selectedQuestionIndex >= questions.length - 1}
                      onClick={() =>
                        setSelectedQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))
                      }
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 rotate-180"
                    >
                      <ArrowLeft size={14} />
                    </button>
                  </div>
                </div>

                {questions[selectedQuestionIndex] && (
                  <div className="space-y-3 pt-2">
                    <h4 className="font-black text-sm text-slate-900 dark:text-white">
                      {questions[selectedQuestionIndex].prompt || 'Untitled Question'}
                    </h4>
                    <div className="space-y-2">
                      {questions[selectedQuestionIndex].options?.map((opt) => {
                        const isCorrect = questions[selectedQuestionIndex].correctOptionIds?.includes(opt.id);
                        return (
                          <div
                            key={opt.id}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold ${
                              isCorrect
                                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40'
                            }`}
                          >
                            <span>
                              {opt.id}. {opt.text}
                            </span>
                            {isCorrect && (
                              <span className="text-[10px] uppercase font-bold text-emerald-700 shrink-0">
                                Correct Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 4: Individual Review & Grading Workbench */}
            {responsesSubTab === 'individual' && (
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] p-5 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Student:</span>
                    <select
                      value={selectedAttemptId || examAttempts[0]?.id || ''}
                      onChange={(e) => setSelectedAttemptId(e.target.value)}
                      className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                    >
                      {examAttempts.map((at, i) => (
                        <option key={at.id} value={at.id}>
                          {i + 1}. {at.studentName} ({at.score ?? 0}/{at.maxScore ?? totalMarks} pts)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(() => {
                  const targetAttempt = examAttempts.find(
                    (a) => a.id === (selectedAttemptId || examAttempts[0]?.id)
                  );
                  if (!targetAttempt) {
                    return (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No attempt selected or available.
                      </div>
                    );
                  }

                  const attemptMax = Number(targetAttempt.maxScore ?? totalMarks) || 100;
                  const itemScores = manualScoresByAttempt[targetAttempt.id] || {};
                  const currentRemark =
                    tutorRemarksByAttempt[targetAttempt.id] ??
                    targetAttempt.feedback ??
                    targetAttempt.tutorFeedback ??
                    '';

                  return (
                    <div className="space-y-4">
                      {/* Overall Score Override Bar */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-sm text-slate-900 dark:text-white">
                            {targetAttempt.studentName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {targetAttempt.className || 'Enrolled Student'} · Status: {targetAttempt.status}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            Total Score:
                          </span>
                          <span className="font-black text-base text-blue-600 dark:text-blue-400">
                            {targetAttempt.score ?? 0} / {attemptMax} pts ({targetAttempt.percentage ?? 0}%)
                          </span>
                        </div>
                      </div>

                      {/* Tutor Feedback Panel */}
                      <div className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <MessageSquare size={14} className="text-blue-600" /> Tutor Feedback &amp; Remarks
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {TUTOR_REMARK_PRESETS.map((pre) => (
                            <button
                              key={pre.id}
                              type="button"
                              onClick={() => {
                                setTutorRemarksByAttempt((prev) => ({
                                  ...prev,
                                  [targetAttempt.id]: pre.text,
                                }));
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold hover:border-blue-500"
                            >
                              {pre.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          value={currentRemark}
                          onChange={(e) => {
                            setTutorRemarksByAttempt((prev) => ({
                              ...prev,
                              [targetAttempt.id]: e.target.value,
                            }));
                          }}
                          placeholder="Constructive feedback for this student's result..."
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs"
                        />
                        {onSaveTutorRemark && (
                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => void onSaveTutorRemark(targetAttempt, currentRemark)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                            >
                              Save Feedback Only
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Question Breakdown and Student Answers */}
                      <div className="space-y-3">
                        {questions.map((q, idx) => {
                          const rawAns = targetAttempt.answers?.[q.id] ?? targetAttempt.answers?.[String(idx + 1)];
                          const existingQr = Array.isArray(targetAttempt.questionResults)
                            ? targetAttempt.questionResults.find((r: any) => r.questionId === q.id)
                            : null;
                          const currentScore =
                            itemScores[q.id] !== undefined
                              ? itemScores[q.id]
                              : existingQr?.pointsAwarded !== undefined
                              ? existingQr.pointsAwarded
                              : 0;

                          return (
                            <div
                              key={q.id || idx}
                              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 text-xs space-y-2.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {idx + 1}. {q.prompt}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-500">Marks:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={q.points}
                                    step={0.5}
                                    value={currentScore}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setManualScoresByAttempt((prev) => ({
                                        ...prev,
                                        [targetAttempt.id]: {
                                          ...(prev[targetAttempt.id] || {}),
                                          [q.id]: val,
                                        },
                                      }));
                                    }}
                                    className="w-16 h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2 text-center font-bold"
                                  />
                                  <span>/ {q.points} pts</span>
                                </div>
                              </div>

                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Student Response:
                                </span>
                                {(() => {
                                  if (rawAns === undefined || rawAns === null || rawAns === '') {
                                    return (
                                      <p className="italic text-slate-400">No response provided</p>
                                    );
                                  }
                                  let displayText = '';
                                  let linkUrl = '';
                                  let fileDataUrl = '';
                                  let fileName = '';

                                  if (typeof rawAns === 'string') {
                                    const trimmed = rawAns.trim();
                                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                                      try {
                                        const parsed = JSON.parse(trimmed);
                                        displayText = String(parsed.textResponse || '').trim();
                                        linkUrl = String(parsed.linkUrl || '').trim();
                                        fileDataUrl = String(parsed.fileDataUrl || '').trim();
                                        fileName = String(parsed.fileName || '').trim();
                                      } catch {
                                        displayText = trimmed;
                                      }
                                    } else if (/^https?:\/\//i.test(trimmed)) {
                                      linkUrl = trimmed;
                                      displayText = trimmed;
                                    } else {
                                      displayText = trimmed;
                                      const match = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
                                      if (match) linkUrl = match[0];
                                    }
                                  } else if (Array.isArray(rawAns)) {
                                    displayText = rawAns
                                      .map((id) => {
                                        const opt = q.options?.find((o) => String(o.id) === String(id));
                                        return opt ? `${opt.id}. ${opt.text}` : String(id);
                                      })
                                      .join(', ');
                                  } else if (typeof rawAns === 'object') {
                                    displayText = String((rawAns as any).textResponse || '').trim();
                                    linkUrl = String((rawAns as any).linkUrl || '').trim();
                                    fileDataUrl = String((rawAns as any).fileDataUrl || '').trim();
                                    fileName = String((rawAns as any).fileName || '').trim();
                                  } else {
                                    displayText = String(rawAns);
                                  }

                                  if (
                                    !linkUrl &&
                                    !fileDataUrl &&
                                    ['single_choice', 'true_false', 'dropdown'].includes(q.type)
                                  ) {
                                    const opt = q.options?.find(
                                      (o) => String(o.id) === String(rawAns)
                                    );
                                    if (opt) displayText = `${opt.id}. ${opt.text}`;
                                  }

                                  return (
                                    <div className="space-y-2">
                                      {displayText && (
                                        <p className="font-semibold whitespace-pre-wrap break-words text-slate-900 dark:text-white">
                                          {displayText}
                                        </p>
                                      )}
                                      {linkUrl && (
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                          <a
                                            href={linkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700"
                                          >
                                            <ExternalLink size={12} />
                                            Open Submitted Link
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              navigator.clipboard?.writeText(linkUrl);
                                              setSaveBannerMessage('Submitted link copied to clipboard!');
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                                          >
                                            <Copy size={12} />
                                            Copy Link
                                          </button>
                                        </div>
                                      )}
                                      {fileDataUrl && (
                                        <div className="pt-1">
                                          <a
                                            href={fileDataUrl}
                                            download={fileName || 'submitted-file'}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                                          >
                                            <Download size={12} />
                                            Download Attached File ({fileName || 'Deliverable'})
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Grade Save Action Footer */}
                      {onSaveManualGrade && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={savingGradeId === targetAttempt.id}
                            onClick={async () => {
                              setSavingGradeId(targetAttempt.id);
                              try {
                                await onSaveManualGrade(targetAttempt, false, {
                                  itemScores,
                                  remark: currentRemark,
                                });
                                setSaveBannerMessage(`Saved grade for ${targetAttempt.studentName}.`);
                              } finally {
                                setSavingGradeId(null);
                              }
                            }}
                            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-50"
                          >
                            Save Grade
                          </button>
                          <button
                            type="button"
                            disabled={savingGradeId === targetAttempt.id}
                            onClick={async () => {
                              setSavingGradeId(targetAttempt.id);
                              try {
                                await onSaveManualGrade(targetAttempt, true, {
                                  itemScores,
                                  remark: currentRemark,
                                });
                                setSaveBannerMessage(`Saved and released result to ${targetAttempt.studentName}.`);
                              } finally {
                                setSavingGradeId(null);
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                          >
                            Save Grade &amp; Release Result
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: SETTINGS                                                */}
        {/* ============================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            {/* SECTION A: Quiz & Grading Configuration */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] p-5 sm:p-7 shadow-xs space-y-6">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-base text-slate-900 dark:text-white">
                    Quiz &amp; Grading Configuration
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign points, enable automatic objective scoring, and set grade release rules.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={makeQuiz}
                  onChange={(e) => {
                    setMakeQuiz(e.target.checked);
                    markDirty();
                  }}
                  className="w-5 h-5 text-blue-600 rounded"
                />
              </div>

              {/* Grading Mode: Automatic vs Manual */}
              <div className="space-y-3">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  Grading Mode
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    onClick={() => {
                      setGradingMode('automatic');
                      markDirty();
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                      gradingMode === 'automatic'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-600/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="settingsGradingMode"
                      checked={gradingMode === 'automatic'}
                      onChange={() => setGradingMode('automatic')}
                      className="mt-1 text-blue-600"
                    />
                    <div>
                      <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        Automatic Objective Grading
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Immediately score multiple-choice and short-answer questions using the answer key.
                      </p>
                    </div>
                  </label>

                  <label
                    onClick={() => {
                      setGradingMode('manual');
                      markDirty();
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                      gradingMode === 'manual'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-600/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="settingsGradingMode"
                      checked={gradingMode === 'manual'}
                      onChange={() => setGradingMode('manual')}
                      className="mt-1 text-blue-600"
                    />
                    <div>
                      <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        Manual Tutor Review
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Hold all submissions for tutor marking before scores and remarks are finalised.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Release Grades Policy */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  Release Grades Policy
                </span>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2.5 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="releasePolicy"
                      checked={releaseGradesPolicy === 'immediate'}
                      onChange={() => {
                        setReleaseGradesPolicy('immediate');
                        markDirty();
                      }}
                      className="text-blue-600"
                    />
                    <span>Immediately after each student submission</span>
                  </label>
                  <label className="flex items-center gap-2.5 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="releasePolicy"
                      checked={releaseGradesPolicy === 'manual'}
                      onChange={() => {
                        setReleaseGradesPolicy('manual');
                        markDirty();
                      }}
                      className="text-blue-600"
                    />
                    <span>Later, after manual review (requires explicit tutor result release)</span>
                  </label>
                </div>
              </div>

              {/* Respondent Visibility Options */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  Respondent Visibility
                </span>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <div>
                      <p>Missed questions</p>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Candidates can see which questions were answered incorrectly.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={showMissedQuestions}
                      onChange={(e) => {
                        setShowMissedQuestions(e.target.checked);
                        markDirty();
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <div>
                      <p>Correct answers</p>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Candidates can view correct answer keys after grades are released.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={showCorrectAnswers}
                      onChange={(e) => {
                        setShowCorrectAnswers(e.target.checked);
                        markDirty();
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <div>
                      <p>Point values</p>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Candidates can view total points and points received for each question.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={showPointValues}
                      onChange={(e) => {
                        setShowPointValues(e.target.checked);
                        markDirty();
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>
                </div>
              </div>

              {/* Default Points */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs font-semibold">
                <div>
                  <p>Default question point value</p>
                  <p className="text-[11px] text-slate-500 font-normal">
                    Initial point value allocated to newly added questions.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={0.5}
                    max={100}
                    value={defaultPointValue}
                    onChange={(e) => {
                      setDefaultPointValue(Math.max(0.5, Number(e.target.value) || 2));
                      markDirty();
                    }}
                    className="w-16 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-center font-bold bg-white dark:bg-slate-900"
                  />
                  <span>points</span>
                </div>
              </div>
            </div>

            {/* SECTION B: Access Security, Attempts & Schedule */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] p-5 sm:p-7 shadow-xs space-y-6">
              <h4 className="font-bold text-base text-slate-900 dark:text-white">
                Access Security, Attempts &amp; Timing
              </h4>

              {/* Passcode Protection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Passcode Protection
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Require students to enter an access code before beginning the assessment.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={hasPasscode}
                    onChange={(e) => {
                      setHasPasscode(e.target.checked);
                      markDirty();
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </div>

                {hasPasscode && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={passcode}
                      onChange={(e) => {
                        setPasscode(e.target.value.toUpperCase());
                        markDirty();
                      }}
                      className="h-10 flex-1 max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPasscode(generateAccessCode());
                        markDirty();
                      }}
                      className="px-3 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Generate New
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(passcode);
                        setSaveBannerMessage('Passcode copied to clipboard.');
                        setTimeout(() => setSaveBannerMessage(''), 3000);
                      }}
                      className="px-3 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>

              {/* Time Limit */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Time Limit
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Enforce automatic countdown and submission after duration expires.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={hasTimeLimit}
                    onChange={(e) => {
                      setHasTimeLimit(e.target.checked);
                      markDirty();
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </div>

                {hasTimeLimit && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={525600}
                      value={durationMinutes}
                      onChange={(e) => {
                        setDurationMinutes(Math.max(1, Number(e.target.value) || 30));
                        markDirty();
                      }}
                      className="w-28 h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-center bg-white dark:bg-slate-900"
                    />
                    <span className="text-xs font-semibold text-slate-500">minutes</span>
                  </div>
                )}
              </div>

              {/* Schedule Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Available From (Optional)
                  </span>
                  <input
                    type="datetime-local"
                    value={availableFrom}
                    onChange={(e) => {
                      setAvailableFrom(e.target.value);
                      markDirty();
                    }}
                    className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Available Until / Deadline (Optional)
                  </span>
                  <input
                    type="datetime-local"
                    value={availableUntil}
                    onChange={(e) => {
                      setAvailableUntil(e.target.value);
                      markDirty();
                    }}
                    className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                  />
                </label>
              </div>

              {/* Attempt Limits & Shuffle */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <label className="flex items-center justify-between gap-3 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <div>
                    <p>Limit to 1 attempt</p>
                    <p className="text-[11px] text-slate-500 font-normal">
                      Students can only submit once per student record.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={limitOneAttempt}
                    onChange={(e) => {
                      setLimitOneAttempt(e.target.checked);
                      markDirty();
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <span>Shuffle question order for each candidate</span>
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => {
                      setShuffleQuestions(e.target.checked);
                      markDirty();
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <span>Shuffle option choices for multiple choice questions</span>
                  <input
                    type="checkbox"
                    checked={shuffleOptions}
                    onChange={(e) => {
                      setShuffleOptions(e.target.checked);
                      markDirty();
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                <div className="pt-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Submission Confirmation Message
                  </span>
                  <input
                    type="text"
                    value={confirmationMessage}
                    onChange={(e) => {
                      setConfirmationMessage(e.target.value);
                      markDirty();
                    }}
                    placeholder="e.g. Your response has been recorded. Good job!"
                    className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Recipient Selector Modal */}
      <RecipientSelectorModal
        isOpen={showRecipientModal}
        onClose={() => setShowRecipientModal(false)}
        availableSchools={assignedSchools}
        availablePrivateStudents={assignedPrivateStudents}
        schoolStudents={assignedSchoolStudents}
        initialSelectedSchoolIds={targetSchoolIds}
        initialSelectedStudentIds={targetStudentIds}
        isTutor={isTutor}
        onConfirm={(res) => {
          setTargetSchoolIds(res.targetSchoolIds);
          setTargetStudentIds(res.targetStudentIds);
          setRecipientMode(res.recipientMode);
          if (res.selectedClasses && res.selectedClasses.length > 0) {
            setTargetClass(res.selectedClasses[0]);
          }
          markDirty();
          setShowRecipientModal(false);
        }}
      />

      {/* Import Questions Modal (Text, CSV, Bank) */}
      <ImportQuestionsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportQuestions={handleImportBatchQuestions}
        questionBankItems={questionBankItems}
        defaultPointValue={defaultPointValue}
      />
    </div>
  );
};
