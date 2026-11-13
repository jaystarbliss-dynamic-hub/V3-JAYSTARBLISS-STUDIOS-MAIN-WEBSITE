import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { auth, db, getClientDatabases, getAllClientDatabases } from "../../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { parseExamScript } from "../../modules/examinations/parseExamScript";
import {
  CANONICAL_CLASSES,
  normalizeClassName,
  normalizeClassList,
  canAuthorOrMutateExam,
  canManageExamRecord,
  resolveExamDeletionMode,
  resolvePartnerSchoolName,
  computeExamMaxScore,
  normalizeDeliveryMode,
  validateExternalExamUrl,
  type AcademicWorkType,
  WORK_TYPES,
  normalizeWorkType,
  validateWorkTypeTransition,
  normalizeRecipientTargets,
  classifyStudentEnrolment,
  isAttemptOverdueForExpiry,
  gradeAnswers,
  classesMatch,
} from "../../lib/classes";
import {
  KeyRound,
  Check,
  Eye,
  AlertCircle,
  Edit3,
  Trash2,
  PlusCircle,
  RefreshCw,
  Calendar,
  Filter,
  Users,
  Clock,
  CheckCircle2,
  FileText,
  BarChart3,
  Settings as SettingsIcon,
  Download,
  Upload,
  Copy,
  Plus,
  ArrowLeft,
  Activity,
  Search,
  ExternalLink,
  ChevronDown,
  Sparkles,
  X,
  Link2,
  Layers,
  LayoutTemplate,
  MessageSquare,
} from "lucide-react";
import { ExamListSkeleton } from "../../components/ui/Skeleton";
import {
  TUTOR_REMARK_PRESETS,
  getSuggestedTutorRemark,
} from "../../lib/documentHeaderTemplates";
import DocumentHeaderCustomizerModal from "../../components/portal/DocumentHeaderCustomizerModal";
import { EmbeddedLearningMedia } from "../../components/portal/EmbeddedLearningMedia";
import { getEffectiveAuth } from "../../utils/impersonation";
import {
  fetchAcademicStudentsFallback,
  fetchAcademicSchoolsFallback,
} from "../../lib/academicFallback";
import { AssessmentOverview, type AssessmentListItem } from "../../components/assessment/AssessmentOverview";
import { AssessmentEditor } from "../../components/assessment/AssessmentEditor";
import { AssessmentWizard } from "../../components/assessment/AssessmentWizard";
import {
  RecipientSelectorModal,
  type RecipientSelectionResult,
} from "../../components/assessment/RecipientSelectorModal";
import type { QuestionBankItem } from "../../components/assessment/ImportQuestionsModal";

type ExistingExamItem = {
  id: string;
  title: string;
  subject: string;
  subProgramName?: string;
  workType?: AcademicWorkType;
  isUngradedActivity?: boolean;
  submissionFormat?: "QUESTIONS" | "DELIVERABLE";
  taskSubmissionMethod?: "both" | "link" | "file" | "text" | "none";
  deliverables?: string;
  resourceTitle?: string;
  resourceUrl?: string;
  videoUrl?: string;
  learningResources?: Array<{
    id?: string;
    title: string;
    url: string;
    instructions?: string;
    type?: string;
  }>;
  dueDate?: string | null;
  recipientMode?: "SCHOOL_CLASS" | "PRIVATE_LEARNERS" | "MULTI_TARGET";
  targetSchoolIds?: string[];
  targetStudentIds?: string[];
  status: string;
  deliveryMode: "NATIVE" | "EXTERNAL_LINK";
  externalUrl?: string;
  programTitle?: string;
  programName?: string;
  programId?: string;
  programPath?: string;
  programBreadcrumbs?: string;
  primaryCategory?: string;
  schoolId?: string;
  schoolName?: string;
  targetClass?: string;
  className?: string;
  classIds?: string[];
  hasTimeLimit?: boolean;
  durationMinutes?: number | null;
  gradingMode?: "automatic" | "manual";
  hasPasscode?: boolean;
  passcode?: string;
  availableFrom?: string | null;
  availableUntil?: string | null;
  questions?: any[];
  questionCount?: number;
  maxScore?: number;
  description?: string;
  instructions?: string;
  makeQuiz?: boolean;
  releaseGradesPolicy?: "immediate" | "manual";
  showMissedQuestions?: boolean;
  showCorrectAnswers?: boolean;
  showPointValues?: boolean;
  defaultPointValue?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  limitOneAttempt?: boolean;
  confirmationMessage?: string;
  createdBy?: string;
  tutorId?: string;
  createdAt?: any;
  updatedAt?: any;
};

type ExamAttemptRecord = {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  studentUid?: string;
  className: string;
  schoolId?: string;
  schoolName?: string;
  status: "in_progress" | "submitted" | "completed" | "expired" | "graded";
  score?: number;
  maxScore?: number;
  percentage?: number;
  answers?: Record<string, any>;
  questionResults?: any[];
  isOnline?: boolean;
  lastHeartbeat?: any;
  startedAt?: any;
  submittedAt?: any;
  deadlineAt?: string;
  releasedAt?: any;
  resultReleased?: boolean;
  feedback?: string;
  tutorFeedback?: string;
};

type EnrolledStudent = {
  id: string;
  uid?: string;
  firebaseUid?: string;
  fullName: string;
  studentName?: string;
  email?: string;
  class?: string;
  className?: string;
  schoolId?: string;
  schoolName?: string;
  parentId?: string;
  parentName?: string;
  parentEmail?: string;
  plan?: string;
  track?: string;
  programId?: string;
  programName?: string;
  programs?: any[];
  enrolledPrograms?: any[];
  programIds?: string[];
  selectedProgramIds?: string[];
  assignedProgramIds?: string[];
  subjects?: any[];
  assignmentCategory?: "school" | "private";
  isPrivate?: boolean;
  privateSubType?: "parent" | "individual" | null;
  privateLabel?: string;
};

type EditorTab = "setup" | "questions" | "responses" | "settings" | "directory";
type ResponsesSubTab = "live" | "summary" | "question" | "individual";
type ImportSourceTab = "text" | "csv";

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "q-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);

const generateAccessCode = () => `JDI-${Math.floor(100000 + Math.random() * 900000)}`;

export default function TutorExaminations() {
  const location = useLocation();
  const isAdminWorkspace = location.pathname.startsWith("/admin/");

  // User Role & Permissions
  const [userRole, setUserRole] = useState<string>("");
  const [, setIsPlatformAdmin] = useState<boolean>(isAdminWorkspace);

  // Top-level Navigation & Workflow State: Defaults to 'overview' as initial landing page
  const [viewMode, setViewMode] = useState<"overview" | "create" | "edit" | "monitor">(() => {
    const params = new URLSearchParams(location.search);
    if (
      params.get("create") === "true" ||
      params.get("createForStudentId") ||
      params.get("studentId") ||
      location.pathname.includes("exam-authoring")
    ) {
      return "create";
    }
    return "overview";
  });
  const [editorTab, setEditorTab] = useState<EditorTab>("setup");
  const [responsesSubTab, setResponsesSubTab] = useState<ResponsesSubTab>("live");
  const [editingExamId, setEditingExamId] = useState<string>("");
  const [showCreateTypeModal, setShowCreateTypeModal] = useState<boolean>(false);
  const [showScheduleSection, setShowScheduleSection] = useState<boolean>(false);
  const [showLeftDirectoryRail, setShowLeftDirectoryRail] = useState<boolean>(true);
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState<number | "all">("all");
  const creatorTopRef = useRef<HTMLElement | null>(null);

  // Unified Academic Work Type & Recipient State
  const [workType, setWorkType] = useState<AcademicWorkType>(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("type");
    return t ? normalizeWorkType(t) : "EXAMINATION";
  });
  const [isUngradedActivity, setIsUngradedActivity] = useState<boolean>(false);
  const [submissionFormat, setSubmissionFormat] = useState<"QUESTIONS" | "DELIVERABLE">("QUESTIONS");
  const [taskSubmissionMethod, setTaskSubmissionMethod] = useState<"both" | "link" | "file" | "text" | "none">("both");
  const [taskMaxMarks, setTaskMaxMarks] = useState<number>(20);
  const [resourceUrl, setResourceUrl] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [recipientMode, setRecipientMode] = useState<"SCHOOL_CLASS" | "PRIVATE_LEARNERS" | "MULTI_TARGET">(() => {
    const params = new URLSearchParams(location.search);
    const sid = params.get("createForStudentId") || params.get("studentId");
    const schId = params.get("schoolId");
    if (sid && (!schId || schId === "private")) return "PRIVATE_LEARNERS";
    return "SCHOOL_CLASS";
  });
  const [privateLearners, setPrivateLearners] = useState<EnrolledStudent[]>([]);
  const [schoolStudentsList, setSchoolStudentsList] = useState<EnrolledStudent[]>([]);
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>(() => {
    const params = new URLSearchParams(location.search);
    const sid = params.get("createForStudentId") || params.get("studentId");
    return sid ? [sid] : [];
  });
  const [studentCategoryTab, setStudentCategoryTab] = useState<"all" | "school" | "private">("all");
  const [studentSearchFilter, setStudentSearchFilter] = useState<string>("");
  const [workTypeFilter, setWorkTypeFilter] = useState<"ALL" | AcademicWorkType>("ALL");

  // Core Metadata & Header Settings (Starts empty — no demo questions or fabricated titles)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState(30);
  const [deliveryMode, setDeliveryMode] = useState<"NATIVE" | "EXTERNAL_LINK">("NATIVE");
  const [externalUrl, setExternalUrl] = useState("");

  // School & Class State
  const [assignedSchools, setAssignedSchools] = useState<{ id: string; name: string; [key: string]: any }[]>([]);
  const [schoolId, setSchoolId] = useState(() => {
    const params = new URLSearchParams(location.search);
    const schId = params.get("schoolId") || "";
    return schId !== "private" ? schId : "";
  });
  const [availableClasses, setAvailableClasses] = useState<string[]>([...CANONICAL_CLASSES]);
  const [selectedClass, setSelectedClass] = useState<string>(() => {
    const params = new URLSearchParams(location.search);
    const cls = params.get("className");
    return (cls && normalizeClassName(cls)) || CANONICAL_CLASSES[1];
  }); // Grade 1
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  // Questions State — starts empty without hardcoded/seeded demo questions
  const [questions, setQuestions] = useState<any[]>([]);

  // Settings Tab State (for Native Assessments)
  const [makeQuiz, setMakeQuiz] = useState(true);
  const [releaseGradesPolicy, setReleaseGradesPolicy] = useState<"immediate" | "manual">("immediate");
  const [showMissedQuestions, setShowMissedQuestions] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [showPointValues, setShowPointValues] = useState(true);
  const [defaultPointValue, setDefaultPointValue] = useState(2);
  const [limitOneAttempt, setLimitOneAttempt] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState(
    "Your assessment has been recorded and submitted successfully."
  );

  // Access & Lifecycle State
  const [status, setStatus] = useState<"draft" | "scheduled" | "active">("active");
  const [customPasscode, setCustomPasscode] = useState("");
  const [generatedPasscode, setGeneratedPasscode] = useState(() => generateAccessCode());
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [gradingMode, setGradingMode] = useState<"automatic" | "manual">("automatic");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // Duplicate Assessment Workflow State (Part 6)
  const [duplicatingBusyId, setDuplicatingBusyId] = useState<string | null>(null);
  const [duplicateRecipientDraft, setDuplicateRecipientDraft] = useState<ExistingExamItem | null>(null);
  const [linkDuplicateReviewExam, setLinkDuplicateReviewExam] = useState<ExistingExamItem | null>(null);
  const [savingLinkDuplicate, setSavingLinkDuplicate] = useState<boolean>(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSourceTab, setImportSourceTab] = useState<ImportSourceTab>("text");
  const [rawScriptText, setRawScriptText] = useState("");
  const [parsedImportQuestions, setParsedImportQuestions] = useState<any[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // Real-Time Proctor & Responses State
  const [examAttempts, setExamAttempts] = useState<ExamAttemptRecord[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [, setLoadingAttempts] = useState(false);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [releasingResultId, setReleasingResultId] = useState<string | null>(null);
  const [bulkReleasingResults, setBulkReleasingResults] = useState(false);
  const [savingRemarkId, setSavingRemarkId] = useState<string | null>(null);
  const [savingGradeId, setSavingGradeId] = useState<string | null>(null);
  const [tutorRemarksByAttempt, setTutorRemarksByAttempt] = useState<Record<string, string>>({});
  const [manualScoresByAttempt, setManualScoresByAttempt] = useState<Record<string, Record<string, number>>>({});
  const [manualTotalScoreByAttempt, setManualTotalScoreByAttempt] = useState<Record<string, string>>({});
  const [showHeaderCustomizer, setShowHeaderCustomizer] = useState(false);

  // Existing Examinations List & Management State
  const [existingExams, setExistingExams] = useState<ExistingExamItem[]>([]);
  const [existingBusy, setExistingBusy] = useState(false);
  const [lifecycleTab, setLifecycleTab] = useState<
    "all" | "draft" | "scheduled" | "active" | "completed" | "archived"
  >("all");
  const [managedSchoolFilter, setManagedSchoolFilter] = useState<string>("all");
  const [examSearchQuery, setExamSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [itemActionBusy, setItemActionBusy] = useState<string | null>(null);

  // Computed total marks dynamically from native questions (or taskMaxMarks when in deliverable-only mode)
  const totalExamMarks = useMemo(() => {
    if (deliveryMode === "EXTERNAL_LINK" || (workType === "ACTIVITY" && isUngradedActivity)) return 0;
    if (questions.length === 0 && submissionFormat === "DELIVERABLE") {
      return taskSubmissionMethod === "none" ? 0 : Math.max(0, Number(taskMaxMarks) || 20);
    }
    return questions.reduce((sum, q) => {
      if (q.type === "learning_resource") return sum;
      const pts = Number(q.points ?? defaultPointValue);
      return sum + (Number.isFinite(pts) && pts >= 0 ? pts : 1);
    }, 0);
  }, [questions, defaultPointValue, deliveryMode, workType, isUngradedActivity, submissionFormat, taskSubmissionMethod, taskMaxMarks]);

  // Consolidated Question Bank items extracted from all loaded examinations
  const questionBankItems: QuestionBankItem[] = useMemo(() => {
    const list: QuestionBankItem[] = [];
    const seen = new Set<string>();

    existingExams.forEach((ex) => {
      if (Array.isArray(ex.questions)) {
        ex.questions.forEach((q: any) => {
          const text = String(q.prompt || q.title || "").trim();
          if (text && !seen.has(text.toLowerCase())) {
            seen.add(text.toLowerCase());
            list.push({
              id: q.id || `bank-${list.length + 1}`,
              prompt: text,
              type: q.type || "multiple_choice",
              options: Array.isArray(q.options) ? q.options : [],
              correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [],
              acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
              points: Number(q.points) || 2,
              subject: ex.subject || "General",
              programTitle: ex.programTitle || ex.programName || ex.schoolName || "Jaystarbliss Question Bank",
              programId: ex.programId || "",
              programPath: ex.programPath || ex.programBreadcrumbs || "",
              breadcrumbPath: ex.programPath || ex.programBreadcrumbs || "",
              primaryCategory: ex.primaryCategory || "",
            });
          }
        });
      }
    });

    return list;
  }, [existingExams]);

  // Smooth scroll to top of creator
  const scrollToCreatorTop = () => {
    const doScroll = () => {
      if (creatorTopRef.current) {
        creatorTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const containers = document.querySelectorAll(
        ".portal-main-content, .admin-main-content, main"
      );
      containers.forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (typeof htmlEl.scrollTo === "function") {
          htmlEl.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          htmlEl.scrollTop = 0;
        }
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    doScroll();
    setTimeout(doScroll, 80);
  };

  // Switch between External Link and Native Examination without losing work or duplicating IDs
  const handleSelectDeliveryMode = (nextMode: "NATIVE" | "EXTERNAL_LINK") => {
    setDeliveryMode(nextMode);
    setErrorMessage("");
    if (nextMode === "EXTERNAL_LINK") {
      setEditorTab("questions");
      setShowPreview(false);
    }
  };

  // Safely switch workType (Assignment, Activity, Test, Examination)
  const handleSelectWorkType = (nextType: AcademicWorkType) => {
    if (editingExamId) {
      const currentRecord = existingExams.find((e) => e.id === editingExamId);
      const check = validateWorkTypeTransition(currentRecord || { workType, status }, nextType, examAttempts.length);
      if (!check.allowed) {
        setErrorMessage(check.error || "Cannot convert an item with live student submissions.");
        return;
      }
    }
    setWorkType(nextType);
    setErrorMessage("");
    if (nextType === "ACTIVITY") {
      setDuration(15);
    } else if (nextType === "TEST") {
      setDuration(20);
      setIsUngradedActivity(false);
    } else if (nextType === "ASSIGNMENT") {
      setIsUngradedActivity(false);
    } else {
      setDuration(30);
      setIsUngradedActivity(false);
    }
  };

  // Start a brand-new assessment of the chosen type and delivery mode
  const handleStartNewExamination = (
    mode: "NATIVE" | "EXTERNAL_LINK",
    chosenWorkType: AcademicWorkType = workType
  ) => {
    const freshCode = generateAccessCode();
    setEditingExamId("");
    setWorkType(chosenWorkType);
    setIsUngradedActivity(chosenWorkType === "ACTIVITY");
    setSubmissionFormat(chosenWorkType === "ASSIGNMENT" ? "DELIVERABLE" : "QUESTIONS");
    setTaskSubmissionMethod("both");
    setTaskMaxMarks(20);
    setResourceUrl("");
    setDueDate("");
    setDeliveryMode(mode);
    setTitle("");
    setDescription("");
    setSubject("");
    setExternalUrl("");
    setDuration(chosenWorkType === "TEST" ? 20 : chosenWorkType === "ACTIVITY" ? 15 : 30);
    setQuestions([]);
    setCustomPasscode(freshCode);
    setGeneratedPasscode(freshCode);
    setAvailableFrom("");
    setAvailableUntil("");
    setShowScheduleSection(false);
    setStatus("active");
    setEditorTab("setup");
    setShowPreview(false);
    setShowCreateTypeModal(false);
    setErrorMessage("");
    setMessage(
      `New ${chosenWorkType.charAt(0) + chosenWorkType.slice(1).toLowerCase()} (${
        mode === "EXTERNAL_LINK" ? "External Link" : "Native Editor"
      }) ready.`
    );
    scrollToCreatorTop();
  };

  // 1. Fetch Assigned Schools strictly for this Tutor / Admin
  useEffect(() => {
    let isMounted = true;
    const fetchAssignedSchools = async () => {
      setSchoolsLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userDocSnap = await getDoc(doc(db, "users", currentUser.uid)).catch(() => null);
        const userData = userDocSnap?.exists() ? userDocSnap.data() : {};
        const resolvedRole = String(
          userData.role ||
            sessionStorage.getItem("userRole") ||
            (isAdminWorkspace ? "ADMIN" : "TUTOR")
        ).toUpperCase();
        const isAdmin =
          isAdminWorkspace || ["ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(resolvedRole);

        if (isMounted) {
          setUserRole(resolvedRole);
          setIsPlatformAdmin(isAdmin);
        }

        const staffAccessSnap = await getDoc(doc(db, "staffSchoolAccess", currentUser.uid)).catch(
          () => null
        );
        const staffAccessData = staffAccessSnap?.exists() ? staffAccessSnap.data() : {};

        const directSchoolIds = new Set<string>();
        const addId = (val: any) => {
          if (!val) return;
          if (typeof val === "string" && val.trim()) directSchoolIds.add(val.trim());
          else if (typeof val === "object") {
            const idCandidate = val.id || val.schoolId || val.code;
            if (idCandidate) directSchoolIds.add(String(idCandidate).trim());
          }
        };

        addId(userData.schoolId);
        if (Array.isArray(userData.schoolIds)) userData.schoolIds.forEach(addId);
        if (Array.isArray(userData.assignedSchools)) userData.assignedSchools.forEach(addId);
        if (Array.isArray(userData.assignedSchoolIds)) userData.assignedSchoolIds.forEach(addId);
        addId(staffAccessData.schoolId);
        if (Array.isArray(staffAccessData.schoolIds)) staffAccessData.schoolIds.forEach(addId);
        if (Array.isArray(staffAccessData.assignedSchools))
          staffAccessData.assignedSchools.forEach(addId);

        const schoolSnaps = await Promise.all(
          getAllClientDatabases().map((dbInstance) =>
            getDocs(collection(dbInstance, "schools")).catch(() => ({ docs: [] } as any))
          )
        );
        const schoolDocsMap = new Map<string, any>();
        schoolSnaps.forEach((snap) => {
          snap.docs?.forEach((d: any) => {
            if (!schoolDocsMap.has(d.id)) schoolDocsMap.set(d.id, d);
          });
        });
        const schoolsList: { id: string; name: string; [key: string]: any }[] = [];
        const currentEmailLower = String(
          currentUser.email || userData.email || sessionStorage.getItem("userEmail") || ""
        )
          .trim()
          .toLowerCase();

        Array.from(schoolDocsMap.values()).forEach((d: any) => {
          const s = d.data() || {};
          const sId = d.id;
          const sCode = String(s.schoolId || s.code || s.schoolCode || "").trim();
          const sName =
            resolvePartnerSchoolName(s.name, s.schoolName) || `Partner School (${sId})`;
          const schoolEntry = {
            ...s,
            id: sId,
            name: sName,
            code: sCode,
          };

          if (isAdmin) {
            schoolsList.push(schoolEntry);
          } else {
            const extractIds = (arr: any) =>
              Array.isArray(arr)
                ? arr
                    .map((x: any) =>
                      typeof x === "string"
                        ? x
                        : x?.tutorId || x?.id || x?.uid || x?.staffId || x?.userId
                    )
                    .filter(Boolean)
                : [];
            const extractEmails = (arr: any) =>
              Array.isArray(arr)
                ? arr
                    .map((x: any) =>
                      typeof x === "object" && x !== null
                        ? String(x?.tutorEmail || x?.email || "").trim().toLowerCase()
                        : ""
                    )
                    .filter(Boolean)
                : [];

            const tutorsArr = extractIds(s.tutors);
            const assignedTutors = extractIds(s.assignedTutors);
            const assignedTutorIds = extractIds(s.assignedTutorIds);
            const assignedStaff = extractIds(s.assignedStaff);
            const staffIds = extractIds(s.staffIds);
            const tutorIds = extractIds(s.tutorIds);

            const programTutorIds: string[] = [];
            const programTutorEmails: string[] = [];
            if (Array.isArray(s.programs)) {
              s.programs.forEach((prog: any) => {
                programTutorIds.push(...extractIds(prog?.assignedTutors));
                programTutorIds.push(...extractIds(prog?.tutors));
                programTutorEmails.push(...extractEmails(prog?.assignedTutors));
                programTutorEmails.push(...extractEmails(prog?.tutors));
              });
            }

            const topEmails = [
              ...extractEmails(s.tutors),
              ...extractEmails(s.assignedTutors),
              ...extractEmails(s.assignedStaff),
              ...programTutorEmails,
            ];

            if (
              directSchoolIds.has(sId) ||
              (sCode && directSchoolIds.has(sCode)) ||
              tutorsArr.includes(currentUser.uid) ||
              assignedTutors.includes(currentUser.uid) ||
              assignedTutorIds.includes(currentUser.uid) ||
              assignedStaff.includes(currentUser.uid) ||
              staffIds.includes(currentUser.uid) ||
              tutorIds.includes(currentUser.uid) ||
              programTutorIds.includes(currentUser.uid) ||
              (currentEmailLower && topEmails.includes(currentEmailLower)) ||
              s.tutorId === currentUser.uid ||
              s.staffId === currentUser.uid
            ) {
              schoolsList.push(schoolEntry);
            }
          }
        });
        // Load all assigned schools & students (both School-Assigned and Private Learners) via academicFallback
        const effectiveAuth = getEffectiveAuth();
        const [fallbackSchools, fallbackStudents] = await Promise.all([
          fetchAcademicSchoolsFallback().catch(() => []),
          fetchAcademicStudentsFallback({ scope: isAdmin ? "all" : "tutor" }).catch(() => []),
        ]);

        // Merge any fallback schools not already in schoolsList
        const existingSchoolIds = new Set(schoolsList.map((s) => s.id));
        fallbackSchools.forEach((fs: any) => {
          if (fs.id && !existingSchoolIds.has(fs.id)) {
            schoolsList.push({
              ...fs,
              id: fs.id,
              name: resolvePartnerSchoolName(fs.name, fs.schoolName) || `Partner School (${fs.id})`,
            });
            existingSchoolIds.add(fs.id);
          }
        });
        schoolsList.sort((a, b) => a.name.localeCompare(b.name));

        const privateMap = new Map<string, EnrolledStudent>();
        const schoolStudentMap = new Map<string, EnrolledStudent>();

        // Also check direct collections for parent accounts, individual students, and school students
        const [indStudentsSnap, stdStudentsSnap, parentsSnap] = await Promise.all([
          getDocs(collection(db, "individualStudents")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "students")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "parents")).catch(() => ({ docs: [] } as any)),
        ]);

        const knownParentIds = new Set<string>();
        const knownParentEmails = new Set<string>();
        const knownParentChildIds = new Set<string>();
        (parentsSnap.docs || []).forEach((pd: any) => {
          const p = pd.data() || {};
          knownParentIds.add(pd.id);
          if (p.uid) knownParentIds.add(String(p.uid).trim());
          if (p.email) knownParentEmails.add(String(p.email).trim().toLowerCase());
          if (Array.isArray(p.children)) {
            p.children.forEach((c: any) => {
              const cid = typeof c === "string" ? c.trim() : String(c?.id || "").trim();
              if (cid) knownParentChildIds.add(cid);
            });
          }
        });

        const registerCandidateStudent = (id: string, raw: Record<string, any>, docSource: string) => {
          if (!id || !raw) return;
          const fullName = String(raw.fullName || raw.name || raw.studentName || "").trim();
          if (!fullName) return;
          const stClass = normalizeClassName(raw.className || raw.grade || raw.class || "Grade 1") || "Grade 1";
          const classification = classifyStudentEnrolment(
            { ...raw, id, docSource },
            { knownParentIds, knownParentEmails, knownParentChildIds }
          );

          const entry: EnrolledStudent = {
            id,
            uid: String(raw.firebaseUid || raw.userId || raw.uid || "").trim(),
            firebaseUid: String(raw.firebaseUid || raw.userId || raw.uid || "").trim(),
            fullName,
            studentName: fullName,
            email: String(raw.email || raw.studentEmail || "").trim(),
            class: stClass,
            className: stClass,
            schoolId: classification.isSchool ? String(raw.schoolId || raw.school_id || "").trim() : "",
            schoolName: classification.isSchool ? String(raw.schoolName || raw.school || "").trim() : "",
            parentId: String(raw.parentId || raw.parentUid || "").trim(),
            parentName: String(raw.parentName || raw.guardianName || "").trim(),
            parentEmail: String(raw.parentEmail || raw.guardianEmail || "").trim(),
            plan: String(raw.plan || raw.programName || raw.track || "").trim(),
            track: String(raw.track || raw.learningTrack || raw.plan || "").trim(),
            programId: String(raw.programId || "").trim(),
            programName: String(raw.programName || raw.programTitle || raw.program || raw.plan || "").trim(),
            programs: Array.isArray(raw.programs) ? raw.programs : undefined,
            enrolledPrograms: Array.isArray(raw.enrolledPrograms) ? raw.enrolledPrograms : undefined,
            programIds: Array.isArray(raw.programIds) ? raw.programIds : undefined,
            selectedProgramIds: Array.isArray(raw.selectedProgramIds) ? raw.selectedProgramIds : undefined,
            assignedProgramIds: Array.isArray(raw.assignedProgramIds) ? raw.assignedProgramIds : undefined,
            subjects: Array.isArray(raw.subjects) ? raw.subjects : undefined,
            assignmentCategory: classification.isSchool ? "school" : "private",
            isPrivate: classification.isPrivate,
            privateSubType: classification.privateSubType,
            privateLabel: classification.privateLabel,
          };

          if (classification.isSchool) {
            schoolStudentMap.set(id, entry);
            privateMap.delete(id);
          } else if (classification.isPrivate) {
            if (!schoolStudentMap.has(id)) {
              privateMap.set(id, entry);
            }
          }
        };

        fallbackStudents.forEach((st: any) => {
          if (!st || !st.id) return;
          registerCandidateStudent(st.id, st, st.assignmentCategory === "school" ? "students" : "individualStudents");
        });

        const effectiveUid = effectiveAuth.effectiveUid || currentUser.uid;
        (stdStudentsSnap.docs || []).forEach((d: any) => {
          const st = d.data() || {};
          const tutorMatch =
            isAdmin ||
            [st.tutorId, st.staffId, st.assignedTutorId, st.assignedStaffId, st.instructorId]
              .map((v) => String(v || "").trim())
              .includes(effectiveUid) ||
            (st.schoolId && existingSchoolIds.has(String(st.schoolId).trim()));
          if (!tutorMatch) return;
          registerCandidateStudent(d.id, st, "students");
        });

        (indStudentsSnap.docs || []).forEach((d: any) => {
          const st = d.data() || {};
          const tutorMatch =
            isAdmin ||
            [st.tutorId, st.staffId, st.assignedTutorId, st.assignedStaffId, st.instructorId]
              .map((v) => String(v || "").trim())
              .includes(effectiveUid) ||
            (st.schoolId && existingSchoolIds.has(String(st.schoolId).trim()));
          if (!tutorMatch) return;
          registerCandidateStudent(d.id, st, "individualStudents");
        });

        if (isMounted) {
          setPrivateLearners(
            Array.from(privateMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
          );
          setSchoolStudentsList(
            Array.from(schoolStudentMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
          );
          setAssignedSchools(schoolsList);
          if (schoolsList.length > 0 && !schoolId) {
            setSchoolId(schoolsList[0].id);
          }
        }
      } catch (err) {
        console.warn("Could not load assigned schools:", err);
      } finally {
        if (isMounted) setSchoolsLoading(false);
      }
    };

    void fetchAssignedSchools();
    return () => {
      isMounted = false;
    };
  }, [isAdminWorkspace]);

  // 2. Canonical Classes for selected school
  useEffect(() => {
    setAvailableClasses([...CANONICAL_CLASSES]);
    if (!selectedClass) {
      setSelectedClass(CANONICAL_CLASSES[1]);
    }
  }, [schoolId]);

  // Helper: Send idempotent in-app notifications to eligible student recipients when an assessment becomes active (Parts 4 & 5)
  const notifyEligibleStudentsForExam = async (examRecord: Record<string, any>) => {
    try {
      if (!examRecord || !examRecord.id || examRecord.status !== "active") return;
      const wType = normalizeWorkType(examRecord.workType, examRecord);
      const isAssignment = wType === "ASSIGNMENT";
      const isActivity = wType === "ACTIVITY";
      const isTest = wType === "TEST";
      const notifTitle = isAssignment
        ? "New Assignment"
        : isActivity
        ? "New Activity"
        : isTest
        ? "New Test Available"
        : "New Examination Available";
      const notifMessage = isAssignment
        ? `You have received a new assignment from your tutor. Assignment: ${examRecord.title} (${examRecord.subject || "General"}). Open your assignments section to view the instructions and submission requirements.`
        : isActivity
        ? `A new learning activity has been assigned to you. Activity: ${examRecord.title} (${examRecord.subject || "General"}). Open your activities section to get started.`
        : `Your tutor has activated a new ${isTest ? "test" : "examination"}: ${examRecord.subject || "General"} — ${examRecord.title}. The ${isTest ? "test" : "examination"} is now available.${examRecord.passcode ? " Your access passcode is ready in your assessment section." : ""} Open your assessment dashboard to begin.`;
      const notifLink = isAssignment
        ? "/portal/student/assignments"
        : "/portal/student/assessments";

      const targetStuSet = new Set(
        (Array.isArray(examRecord.targetStudentIds) ? examRecord.targetStudentIds : [])
          .map((id: any) => String(id || "").trim())
          .filter(Boolean)
      );
      const targetSchoolSet = new Set(
        [
          examRecord.schoolId,
          ...(Array.isArray(examRecord.targetSchoolIds) ? examRecord.targetSchoolIds : []),
        ]
          .map((id: any) => String(id || "").trim())
          .filter((id) => id && id !== "private")
      );
      const targetClasses = Array.isArray(examRecord.classIds) && examRecord.classIds.length > 0
        ? examRecord.classIds
        : [examRecord.targetClass || examRecord.className || "all"];

      const allCandidateStudents = [...privateLearners, ...schoolStudentsList];
      const matchedStudents = allCandidateStudents.filter((st) => {
        if (targetStuSet.has(st.id) || (st.uid && targetStuSet.has(st.uid))) return true;
        if (examRecord.recipientMode === "PRIVATE_LEARNERS" && targetStuSet.size > 0) return false;
        if (targetStuSet.size > 0 && targetSchoolSet.size === 0) return false;
        if (st.schoolId && targetSchoolSet.has(st.schoolId)) {
          return classesMatch(st.className || st.class || "", targetClasses);
        }
        return false;
      });

      const allDbs = getAllClientDatabases();
      const writes: Promise<any>[] = [];
      matchedStudents.forEach((st) => {
        const recipientUid = String(st.firebaseUid || st.uid || st.id).trim();
        if (!recipientUid) return;
        const notifId = `notif-exam-${examRecord.id}-${recipientUid}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        const payload = {
          id: notifId,
          recipientId: recipientUid,
          userId: recipientUid,
          studentId: st.id,
          examId: examRecord.id,
          workType: wType,
          title: notifTitle,
          message: notifMessage,
          type: isAssignment ? "assignment" : isActivity ? "activity" : "examination",
          link: notifLink,
          read: false,
          createdAt: new Date().toISOString(),
          timestamp: serverTimestamp(),
        };
        allDbs.forEach((dbInstance) => {
          writes.push(
            setDoc(doc(dbInstance, "notifications", notifId), payload, { merge: true }).catch(() => null),
            setDoc(doc(dbInstance, "jdiNotifications", notifId), payload, { merge: true }).catch(() => null)
          );
        });
      });

      if (writes.length > 0) {
        await Promise.all(writes);
      }
    } catch (err) {
      console.warn("Could not dispatch student assessment notifications:", err);
    }
  };

  // 3. Load Existing Assessments & Examinations List
  const loadExistingExams = async () => {
    setExistingBusy(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const assignedIds = new Set(assignedSchools.map((s) => s.id));
      const schoolNameById = new Map(assignedSchools.map((s) => [s.id, s.name]));

      const allDbs = getAllClientDatabases();
      const [jdiSnaps, schSnaps] = await Promise.all([
        Promise.all(
          allDbs.map((dbInstance) =>
            getDocs(collection(dbInstance, "jdiExams")).catch(() => ({ docs: [] } as any))
          )
        ),
        Promise.all(
          allDbs.map((dbInstance) =>
            getDocs(collection(dbInstance, "schoolExams")).catch(() => ({ docs: [] } as any))
          )
        ),
      ]);

      const allExamDocs: any[] = [];
      schSnaps.forEach((s) => allExamDocs.push(...(s.docs || [])));
      jdiSnaps.forEach((s) => allExamDocs.push(...(s.docs || [])));

      const nowMs = Date.now();
      const scheduledPromotions: Array<Record<string, any>> = [];
      const map = new Map<string, ExistingExamItem>();

      allExamDocs.forEach((d: any) => {
        const data = d.data();
        const canManage = canManageExamRecord({
          uid: currentUser.uid,
          role: userRole || (isAdminWorkspace ? "ADMIN" : "TUTOR"),
          exam: data,
          assignedSchoolIds: Array.from(assignedIds),
        });
        if (!canManage) return;

        const sId = String(data.schoolId || "");
        const resolvedSchoolName =
          sId === "private"
            ? "Private Learner(s)"
            : resolvePartnerSchoolName(
                schoolNameById.get(sId),
                data.schoolName,
                "Assigned Partner School"
              );
        const qList = Array.isArray(data.questions) ? data.questions : [];
        const resolvedMode = normalizeDeliveryMode(data.deliveryMode, data);
        const resolvedWorkType = normalizeWorkType(data.workType, data);
        const isUngraded = resolvedWorkType === "ACTIVITY" && data.isUngradedActivity === true;
        const maxScore =
          resolvedMode === "EXTERNAL_LINK" || isUngraded ? 0 : computeExamMaxScore(data);

        // Auto-promote scheduled assessments whose activation time has arrived (Part 4)
        let effectiveStatus = String(data.status || "draft").toLowerCase();
        const fromMs = data.availableFrom ? new Date(data.availableFrom).getTime() : NaN;
        if (effectiveStatus === "scheduled" && Number.isFinite(fromMs) && nowMs >= fromMs) {
          effectiveStatus = "active";
          scheduledPromotions.push({ ...data, id: d.id, status: "active" });
        }

        // Respect optional time limit (Part 2): never force a 30-minute default when untimed
        const parsedDuration = Number(data.durationMinutes);
        const hasTimeLimit =
          typeof data.hasTimeLimit === "boolean"
            ? data.hasTimeLimit
            : Number.isFinite(parsedDuration) && parsedDuration > 0;
        const resolvedDurationMinutes =
          hasTimeLimit && Number.isFinite(parsedDuration) && parsedDuration > 0
            ? parsedDuration
            : null;

        const resolvedGradingMode: "automatic" | "manual" =
          data.gradingMode === "manual" ? "manual" : "automatic";
        const resolvedReleasePolicy: "immediate" | "manual" =
          data.releaseGradesPolicy === "immediate" || data.releaseGradesPolicy === "manual"
            ? data.releaseGradesPolicy
            : resolvedGradingMode === "automatic"
            ? "immediate"
            : "manual";

        map.set(d.id, {
          id: d.id,
          title: data.title || "Untitled Assessment",
          subject: data.subject || "General",
          subProgramName: data.subProgramName || data.subject || "",
          programId: data.programId || "",
          programTitle: data.programTitle || data.programName || "",
          programName: data.programName || data.programTitle || "",
          programPath: data.programPath || data.programBreadcrumbs || "",
          programBreadcrumbs: data.programBreadcrumbs || data.programPath || "",
          primaryCategory: data.primaryCategory || "",
          workType: resolvedWorkType,
          isUngradedActivity: isUngraded,
          submissionFormat: data.submissionFormat === "DELIVERABLE" ? "DELIVERABLE" : "QUESTIONS",
          taskSubmissionMethod: data.taskSubmissionMethod || "both",
          deliverables: data.deliverables || "",
          resourceTitle: data.resourceTitle || "",
          resourceUrl: data.resourceUrl || data.videoUrl || "",
          videoUrl: data.videoUrl || data.resourceUrl || "",
          learningResources: Array.isArray(data.learningResources) ? data.learningResources : [],
          dueDate: data.dueDate || null,
          recipientMode: data.recipientMode || "SCHOOL_CLASS",
          targetSchoolIds: Array.isArray(data.targetSchoolIds) ? data.targetSchoolIds : sId ? [sId] : [],
          targetStudentIds: Array.isArray(data.targetStudentIds) ? data.targetStudentIds : [],
          status: effectiveStatus,
          deliveryMode: resolvedMode,
          externalUrl: String(data.externalUrl || data.url || data.link || "").trim(),
          schoolId: sId,
          schoolName: resolvedSchoolName,
          targetClass:
            normalizeClassName(data.targetClass || data.className || "") ||
            data.targetClass ||
            "all",
          className:
            normalizeClassName(data.className || data.targetClass || "") ||
            data.className ||
            "all",
          classIds: normalizeClassList(
            data.classIds || [data.targetClass || data.className || "all"]
          ),
          hasTimeLimit,
          durationMinutes: resolvedDurationMinutes,
          gradingMode: resolvedGradingMode,
          hasPasscode:
            resolvedWorkType === "TEST" || resolvedWorkType === "EXAMINATION"
              ? true
              : Boolean(data.hasPasscode ?? data.passcode),
          passcode: data.passcode || "",
          availableFrom: data.availableFrom || null,
          availableUntil: data.availableUntil || null,
          questions: qList,
          questionCount: resolvedMode === "EXTERNAL_LINK" ? 0 : qList.length,
          maxScore,
          description: data.description || data.instructions || "",
          instructions: data.instructions || data.description || "",
          releaseGradesPolicy: resolvedReleasePolicy,
          showMissedQuestions: data.showMissedQuestions !== false,
          showCorrectAnswers: data.showCorrectAnswers !== false,
          showPointValues: data.showPointValues !== false,
          defaultPointValue: Number(data.defaultPointValue || 2),
          shuffleQuestions: data.shuffleQuestions === true,
          shuffleOptions: data.shuffleOptions === true,
          limitOneAttempt: data.limitOneAttempt !== false,
          confirmationMessage:
            data.confirmationMessage ||
            "Your assessment has been recorded and submitted successfully.",
          createdBy: data.createdBy,
          tutorId: data.tutorId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt || data.createdAt,
        });
      });

      setExistingExams(Array.from(map.values()));

      if (scheduledPromotions.length > 0) {
        scheduledPromotions.forEach((promoted) => {
          allDbs.forEach((dbInstance) => {
            updateDoc(doc(dbInstance, "jdiExams", promoted.id), {
              status: "active",
              activatedAt: new Date().toISOString(),
              updatedAt: serverTimestamp(),
            }).catch(() => undefined);
            updateDoc(doc(dbInstance, "schoolExams", promoted.id), {
              status: "active",
              activatedAt: new Date().toISOString(),
              updatedAt: serverTimestamp(),
            }).catch(() => undefined);
          });
          void notifyEligibleStudentsForExam(promoted);
        });
      }
    } catch (err) {
      console.warn("Could not load existing examinations:", err);
    } finally {
      setExistingBusy(false);
    }
  };

  useEffect(() => {
    if (!schoolsLoading) {
      void loadExistingExams();
    }
  }, [schoolsLoading, assignedSchools.length]);

  // 4. Real-time Subscription to Student Attempts & Roster for Active Native Examination
  useEffect(() => {
    const activeId = editingExamId;
    if (!activeId || deliveryMode === "EXTERNAL_LINK") {
      setExamAttempts([]);
      return;
    }

    setLoadingAttempts(true);
    const allDbs = getAllClientDatabases();
    const perDbAttempts = new Map<number, ExamAttemptRecord[]>();

    const rankAttemptStatus = (st?: string) => {
      if (st === "graded") return 4;
      if (st === "submitted" || st === "completed" || st === "expired") return 3;
      if (st === "in_progress") return 2;
      return 1;
    };

    const recomputeMergedAttempts = () => {
      const mergedMap = new Map<string, ExamAttemptRecord>();
      perDbAttempts.forEach((list) => {
        list.forEach((rec) => {
          const prev = mergedMap.get(rec.id);
          if (!prev) {
            mergedMap.set(rec.id, rec);
            return;
          }
          const pickNew =
            (rec.resultReleased && !prev.resultReleased) ||
            (rec.resultReleased === prev.resultReleased &&
              rankAttemptStatus(rec.status) >= rankAttemptStatus(prev.status));
          mergedMap.set(
            rec.id,
            pickNew
              ? {
                  ...prev,
                  ...rec,
                  resultReleased: Boolean(prev.resultReleased || rec.resultReleased),
                  releasedAt: rec.releasedAt || prev.releasedAt,
                  feedback: rec.feedback || prev.feedback || "",
                  tutorFeedback: rec.tutorFeedback || prev.tutorFeedback || "",
                }
              : {
                  ...rec,
                  ...prev,
                  resultReleased: Boolean(prev.resultReleased || rec.resultReleased),
                  releasedAt: prev.releasedAt || rec.releasedAt,
                  feedback: prev.feedback || rec.feedback || "",
                  tutorFeedback: prev.tutorFeedback || rec.tutorFeedback || "",
                }
          );
        });
      });

      const records = Array.from(mergedMap.values());
      setExamAttempts(records);
      setTutorRemarksByAttempt((prev) => {
        const next = { ...prev };
        records.forEach((rec) => {
          if (next[rec.id] === undefined && (rec.feedback || rec.tutorFeedback)) {
            next[rec.id] = rec.feedback || rec.tutorFeedback || "";
          }
        });
        return next;
      });
      setLoadingAttempts(false);
    };

    const unsubscribes = allDbs.map((dbInstance, dbIdx) => {
      const qAttempts = query(
        collection(dbInstance, "jdiExamAttempts"),
        where("examId", "==", activeId)
      );
      return onSnapshot(
        qAttempts,
        (snapshot) => {
          const activeExamObj = existingExams.find((e) => e.id === activeId);
          const nowMs = Date.now();
          const records: ExamAttemptRecord[] = snapshot.docs.map((d) => {
            const at = d.data();
            let resolvedStatus: ExamAttemptRecord["status"] = at.status || "in_progress";
            let resolvedScore = at.score;
            let resolvedMax = at.maxScore;
            let resolvedPct = at.percentage;
            let resolvedResults = at.questionResults || [];

            if (
              resolvedStatus === "in_progress" &&
              isAttemptOverdueForExpiry(at, activeExamObj, nowMs)
            ) {
              resolvedStatus = "expired";
              if (activeExamObj && Array.isArray(activeExamObj.questions) && activeExamObj.questions.length > 0) {
                const graded = gradeAnswers(
                  { gradingMode: activeExamObj.gradingMode, questions: activeExamObj.questions },
                  at.answers || {}
                );
                resolvedScore = graded.score;
                resolvedMax = graded.maxScore;
                resolvedPct = graded.percentage;
                resolvedResults = graded.questionResults;
              }
              updateDoc(doc(dbInstance, "jdiExamAttempts", d.id), {
                status: "expired",
                isOnline: false,
                ...(resolvedScore !== undefined ? { score: resolvedScore } : {}),
                ...(resolvedMax !== undefined ? { maxScore: resolvedMax } : {}),
                ...(resolvedPct !== undefined ? { percentage: resolvedPct } : {}),
                ...(resolvedResults.length > 0 ? { questionResults: resolvedResults } : {}),
                submittedAt: at.submittedAt || at.deadlineAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }).catch(() => undefined);
            }

            return {
              id: d.id,
              examId: at.examId,
              studentId: at.studentId || at.studentUid || d.id,
              studentName: at.studentName || "Student",
              studentUid: at.studentUid,
              className: at.className || "Grade 1",
              schoolId: at.schoolId,
              schoolName: at.schoolName,
              status: resolvedStatus,
              score: resolvedScore,
              maxScore: resolvedMax,
              percentage: resolvedPct,
              answers: at.answers || {},
              questionResults: resolvedResults,
              isOnline: resolvedStatus === "in_progress" && at.isOnline === true,
              lastHeartbeat: at.lastHeartbeat,
              startedAt: at.startedAt,
              submittedAt: at.submittedAt,
              deadlineAt: at.deadlineAt,
              releasedAt: at.releasedAt,
              resultReleased: Boolean(at.resultReleased || at.releasedAt || at.status === "released"),
              feedback: String(at.feedback || at.tutorFeedback || ""),
              tutorFeedback: String(at.tutorFeedback || at.feedback || ""),
            };
          });
          perDbAttempts.set(dbIdx, records);
          recomputeMergedAttempts();
        },
        (err) => {
          console.warn("Attempt listener notice:", err);
          setLoadingAttempts(false);
        }
      );
    });

    const fetchRoster = async () => {
      try {
        const snap = await getDocs(collection(db, "students"));
        const rosterList: EnrolledStudent[] = [];
        snap.docs.forEach((docSnap) => {
          const s = docSnap.data();
          const sSchool = String(s.schoolId || "").trim();
          const sClass = normalizeClassName(s.class || s.className || s.grade || "");
          if (
            (!schoolId || sSchool === schoolId) &&
            (!selectedClass || selectedClass === "all" || sClass === selectedClass)
          ) {
            rosterList.push({
              id: docSnap.id,
              fullName: s.fullName || s.name || s.studentName || "Learner",
              class: sClass,
              schoolId: sSchool,
            });
          }
        });
        setEnrolledStudents(rosterList);
      } catch (e) {
        console.warn("Could not fetch roster for proctoring:", e);
      }
    };
    void fetchRoster();

    return () => unsubscribes.forEach((u) => u());
  }, [editingExamId, schoolId, selectedClass, deliveryMode]);

  // Proctor Metrics Computation
  const proctorMetrics = useMemo(() => {
    const now = Date.now();
    let onlineActiveCount = 0;
    let offlineInProgressCount = 0;
    let submittedCompletedCount = 0;

    const studentAttemptMap = new Map<string, ExamAttemptRecord>();

    examAttempts.forEach((at) => {
      studentAttemptMap.set(at.studentId, at);

      if (at.status === "submitted" || at.status === "completed" || at.status === "graded") {
        submittedCompletedCount++;
      } else if (at.status === "in_progress") {
        let heartbeatTime = 0;
        if (at.lastHeartbeat?.toMillis) heartbeatTime = at.lastHeartbeat.toMillis();
        else if (typeof at.lastHeartbeat === "string")
          heartbeatTime = new Date(at.lastHeartbeat).getTime();

        const isHeartbeatFresh = heartbeatTime > 0 && now - heartbeatTime < 150000;
        if (at.isOnline !== false && isHeartbeatFresh) {
          onlineActiveCount++;
        } else {
          offlineInProgressCount++;
        }
      }
    });

    const notStartedCount = Math.max(0, enrolledStudents.length - studentAttemptMap.size);

    return {
      onlineActiveCount,
      offlineInProgressCount,
      submittedCompletedCount,
      notStartedCount,
      totalResponses: examAttempts.length,
      studentAttemptMap,
    };
  }, [examAttempts, enrolledStudents]);

  // Summary Insights Computation
  const summaryInsights = useMemo(() => {
    const scores = examAttempts
      .filter((at) => at.status === "submitted" || at.status === "completed" || at.status === "graded")
      .map((at) => Number(at.score ?? 0));

    if (!scores.length) {
      return {
        avgScore: 0,
        medianScore: 0,
        rangeMin: 0,
        rangeMax: 0,
        distribution: [] as { points: number; count: number }[],
        frequentlyMissed: [] as { prompt: string; correctRate: number }[],
      };
    }

    const sum = scores.reduce((a, b) => a + b, 0);
    const avgScore = Number((sum / scores.length).toFixed(1));

    const sorted = [...scores].sort((a, b) => a - b);
    const medianScore =
      sorted.length % 2 === 0
        ? Number(((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1))
        : sorted[Math.floor(sorted.length / 2)];

    const rangeMin = sorted[0];
    const rangeMax = sorted[sorted.length - 1];

    const distMap = new Map<number, number>();
    sorted.forEach((sc) => {
      const rounded = Math.round(sc);
      distMap.set(rounded, (distMap.get(rounded) || 0) + 1);
    });
    const distribution = Array.from(distMap.entries())
      .map(([points, count]) => ({ points, count }))
      .sort((a, b) => a.points - b.points);

    const freqMissed = questions
      .map((q, idx) => {
        let correctCount = 0;
        let totalAnswered = 0;
        examAttempts.forEach((at) => {
          const userAns = at.answers?.[q.id] || at.answers?.[String(idx + 1)];
          if (userAns !== undefined) {
            totalAnswered++;
            if (Array.isArray(q.correctOptionIds) && q.correctOptionIds.length) {
              const uArr = Array.isArray(userAns) ? userAns : [userAns];
              if (
                uArr.length === q.correctOptionIds.length &&
                uArr.every((opt: any) => q.correctOptionIds.includes(opt))
              ) {
                correctCount++;
              }
            }
          }
        });
        const correctRate =
          totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 100;
        return { prompt: q.prompt || `Question ${idx + 1}`, correctRate };
      })
      .filter((q) => q.correctRate < 70)
      .slice(0, 5);

    return {
      avgScore,
      medianScore,
      rangeMin,
      rangeMax,
      distribution,
      frequentlyMissed: freqMissed,
    };
  }, [examAttempts, questions]);

  // Question & Content Block Card Handlers
  const addQuestionCard = (type = "single_choice") => {
    const isTrueFalse = type === "true_false";
    const isChoice = ["single_choice", "multiple_choice", "true_false", "dropdown"].includes(type);
    const isResource = type === "learning_resource";
    const defaultSubmissionMethod =
      type === "link_submission"
        ? "link"
        : type === "file_submission"
        ? "file"
        : type === "practical_task"
        ? "both"
        : type === "learning_resource"
        ? "none"
        : "text";
    const newQ = {
      id: makeId(),
      prompt: "",
      type,
      options: isTrueFalse
        ? [
            { id: "A", text: "True" },
            { id: "B", text: "False" },
          ]
        : isChoice
        ? [
            { id: "A", text: "" },
            { id: "B", text: "" },
            { id: "C", text: "" },
            { id: "D", text: "" },
          ]
        : [],
      correctOptionIds: isChoice ? ["A"] : [],
      acceptedAnswers: [],
      points: isResource ? 0 : type === "practical_task" ? 10 : defaultPointValue || 2,
      required: !isResource,
      explanation: "",
      resourceUrl: "",
      videoUrl: "",
      submissionMethod: defaultSubmissionMethod,
      acceptedFileTypes: ".pdf,.png,.jpg,.jpeg,.zip,.sb3,.py,.html,.docx,.pptx",
      maxFileSizeMb: 10,
      deliverableInstructions: "",
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const updateQuestion = (index: number, patch: Partial<any>) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const next = { ...q, ...patch };
        if (patch.type === "true_false") {
          next.options = [
            { id: "A", text: "True" },
            { id: "B", text: "False" },
          ];
          if (!["A", "B"].includes(next.correctOptionIds?.[0])) {
            next.correctOptionIds = ["A"];
          } else {
            next.correctOptionIds = [next.correctOptionIds[0]];
          }
        } else if (
          patch.type &&
          ["single_choice", "multiple_choice", "dropdown"].includes(patch.type) &&
          (!Array.isArray(next.options) || next.options.length < 2)
        ) {
          next.options = [
            { id: "A", text: "" },
            { id: "B", text: "" },
            { id: "C", text: "" },
            { id: "D", text: "" },
          ];
          next.correctOptionIds = ["A"];
        } else if (patch.type === "learning_resource") {
          next.points = 0;
          next.required = false;
          next.submissionMethod = "none";
        } else if (patch.type === "link_submission") {
          next.submissionMethod = "link";
          if (!next.points || next.points <= 0) next.points = defaultPointValue || 5;
        } else if (patch.type === "file_submission") {
          next.submissionMethod = "file";
          if (!next.points || next.points <= 0) next.points = defaultPointValue || 5;
        } else if (patch.type === "practical_task") {
          next.submissionMethod = next.submissionMethod && next.submissionMethod !== "none" ? next.submissionMethod : "both";
          if (!next.points || next.points <= 0) next.points = 10;
        }
        return next;
      })
    );
  };

  const duplicateQuestion = (index: number) => {
    const source = questions[index];
    const clone = {
      ...source,
      id: makeId(),
      prompt: source.prompt ? `${source.prompt} (Copy)` : "",
      options: Array.isArray(source.options)
        ? source.options.map((o: any) => ({ ...o }))
        : [],
      correctOptionIds: Array.isArray(source.correctOptionIds)
        ? [...source.correctOptionIds]
        : [],
      acceptedAnswers: Array.isArray(source.acceptedAnswers)
        ? [...source.acceptedAnswers]
        : [],
    };
    setQuestions((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const deleteQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const addOptionToQuestion = (qIndex: number) => {
    const q = questions[qIndex];
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const nextLetter = letters[q.options.length] || `O${q.options.length + 1}`;
    const nextOptions = [...q.options, { id: nextLetter, text: "" }];
    updateQuestion(qIndex, { options: nextOptions });
  };

  const removeOptionFromQuestion = (qIndex: number, optId: string) => {
    const q = questions[qIndex];
    if (q.options.length <= 2) {
      setErrorMessage("Choice questions must have at least two options.");
      return;
    }
    const nextOptions = q.options.filter((o: any) => o.id !== optId);
    const nextCorrect = (q.correctOptionIds || []).filter((id: string) => id !== optId);
    updateQuestion(qIndex, {
      options: nextOptions,
      correctOptionIds: nextCorrect.length ? nextCorrect : [nextOptions[0].id],
    });
  };

  const toggleOptionCorrect = (qIndex: number, optId: string) => {
    const q = questions[qIndex];
    if (q.type === "multiple_choice") {
      const current = new Set(q.correctOptionIds || []);
      if (current.has(optId)) {
        if (current.size > 1) current.delete(optId);
      } else {
        current.add(optId);
      }
      updateQuestion(qIndex, { correctOptionIds: Array.from(current) });
    } else {
      updateQuestion(qIndex, { correctOptionIds: [optId] });
    }
  };

  // Import Parser Handlers
  const handleParseScriptText = () => {
    setImportWarnings([]);
    if (!rawScriptText.trim()) {
      setImportWarnings(["Please paste your questions and answer key first."]);
      return;
    }
    const parsed = parseExamScript(rawScriptText, defaultPointValue);
    if (!parsed.length) {
      setImportWarnings([
        "Could not identify questions. Please ensure each starts with a number e.g. '1. Question?'.",
      ]);
      return;
    }
    setParsedImportQuestions(parsed);
  };

  const handleAppendImportedQuestions = () => {
    if (!parsedImportQuestions.length) return;
    setQuestions((prev) => [...prev, ...parsedImportQuestions]);
    setShowImportModal(false);
    setRawScriptText("");
    setParsedImportQuestions([]);
    setMessage(
      `Successfully imported ${parsedImportQuestions.length} question(s) into your assessment.`
    );
  };

  const handleInsertSampleTemplate = () => {
    const sample = `1. What is the shortcut key to copy text on a computer? [2 marks]
A. Ctrl + C
B. Ctrl + V
C. Ctrl + P
D. Ctrl + X

2. Which of the following is an input device? [2 marks]
A. Monitor
B. Keyboard
C. Speaker
D. Projector

3. Hardware refers to the physical tangible components of a computer system. [1 mark]
A. True
B. False

ANSWER KEY
1. A
2. B
3. A`;
    setRawScriptText(sample);
  };

  // Validate native questions before publishing (or synthesize a Practical Deliverable block when submissionFormat === "DELIVERABLE")
  const prepareNativeQuestionsForSave = (
    rawList: any[],
    targetStatus: "draft" | "scheduled" | "active"
  ) => {
    if (rawList.length === 0) {
      if (submissionFormat === "DELIVERABLE") {
        const deliverableType =
          taskSubmissionMethod === "link"
            ? "link_submission"
            : taskSubmissionMethod === "file"
            ? "file_submission"
            : taskSubmissionMethod === "none"
            ? "learning_resource"
            : "practical_task";
        const marks =
          taskSubmissionMethod === "none" || (workType === "ACTIVITY" && isUngradedActivity)
            ? 0
            : Math.max(1, Number(taskMaxMarks) || 20);
        return [
          {
            id: "q_deliverable_1",
            type: deliverableType,
            prompt: description.trim() || title.trim() || "Practical Assignment Submission",
            options: [],
            correctOptionIds: [],
            acceptedAnswers: [],
            points: marks,
            required: deliverableType !== "learning_resource",
            submissionMethod: taskSubmissionMethod,
            resourceUrl: resourceUrl.trim(),
            videoUrl: resourceUrl.trim(),
            acceptedFileTypes: ".pdf,.png,.jpg,.jpeg,.zip,.sb3,.py,.html,.docx,.pptx",
            maxFileSizeMb: 10,
            deliverableInstructions: description.trim(),
          },
        ];
      }
      if (targetStatus === "draft" || workType === "ACTIVITY") {
        return [];
      }
      throw new Error(
        `Please add at least one question or switch to "Practical Task Only (No Question Fields)" before publishing.`
      );
    }

    return rawList.map((q, idx) => {
      const promptText = String(q.prompt || "").trim();
      if (!promptText && targetStatus !== "draft") {
        throw new Error(`Item ${idx + 1} is missing its prompt or title.`);
      }
      const isChoice = ["single_choice", "multiple_choice", "true_false", "dropdown"].includes(
        q.type
      );
      const isResource = q.type === "learning_resource";
      const cleanOpts = Array.isArray(q.options)
        ? q.options.map((o: any, oIdx: number) => {
            const optText = String(o.text || "").trim();
            if (isChoice && !optText && targetStatus !== "draft") {
              throw new Error(
                `Question ${idx + 1} has an empty option (${o.id || oIdx + 1}). Please fill in all options.`
              );
            }
            return {
              id: String(o.id || String.fromCharCode(65 + oIdx)),
              text: optText || `Option ${o.id || oIdx + 1}`,
            };
          })
        : [];

      const qResourceUrl = String(q.resourceUrl || q.videoUrl || "").trim();
      return {
        ...q,
        id: q.id || makeId(),
        prompt: promptText || `Untitled Item ${idx + 1}`,
        options: isChoice ? cleanOpts : [],
        points:
          isResource || (workType === "ACTIVITY" && isUngradedActivity)
            ? 0
            : Math.max(0.5, Number(q.points ?? defaultPointValue) || 1),
        required: isResource ? false : q.required !== false,
        ...(qResourceUrl ? { resourceUrl: qResourceUrl, videoUrl: qResourceUrl } : {}),
      };
    });
  };

  // Save / Publish / Update Assessment (Idempotent — never duplicates on type switch or re-save)
  const handleSaveOrPublish = async (overrideStatus?: "draft" | "scheduled" | "active") => {
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in to your tutor account.");
      if (userRole && !canAuthorOrMutateExam(userRole)) {
        throw new Error("School administrators cannot create or modify assessments.");
      }
      if (!title.trim()) throw new Error(`Please enter a ${workType.toLowerCase()} title.`);
      if (!subject.trim()) throw new Error(`Please enter a ${workType.toLowerCase()} subject.`);

      if (recipientMode === "PRIVATE_LEARNERS" && targetStudentIds.length === 0) {
        throw new Error("Please select at least one private learner for this assignment/assessment.");
      }
      if (recipientMode !== "PRIVATE_LEARNERS") {
        if (!schoolId) throw new Error("Please select an authorised school.");
        if (!selectedClass) throw new Error("Please select a target class/grade.");
      }

      const targetStatus = overrideStatus || status;

      if (availableFrom && availableUntil) {
        const fromMs = new Date(availableFrom).getTime();
        const untilMs = new Date(availableUntil).getTime();
        if (Number.isFinite(fromMs) && Number.isFinite(untilMs) && untilMs <= fromMs) {
          throw new Error(
            '"Available Until" must be later than "Available From". Please check AM/PM on your end time, or clear the optional schedule dates to make the assessment immediately available.'
          );
        }
      }
      if (targetStatus === "active" && availableUntil) {
        const untilMs = new Date(availableUntil).getTime();
        if (Number.isFinite(untilMs) && untilMs <= Date.now()) {
          throw new Error(
            '"Available Until" is set in the past, which will immediately mark this assessment as Completed for students. Please choose a future end time or clear the schedule.'
          );
        }
      }

      let validatedExternalUrl = "";
      let preparedQuestions: any[] = [];

      if (deliveryMode === "EXTERNAL_LINK") {
        const urlCheck = validateExternalExamUrl(externalUrl);
        if ("error" in urlCheck && urlCheck.error) {
          throw new Error(urlCheck.error);
        }
        validatedExternalUrl = (urlCheck as { url: string }).url;
      } else {
        preparedQuestions = prepareNativeQuestionsForSave(questions, targetStatus);
      }

      const normalizedTargets = normalizeRecipientTargets({
        recipientMode,
        schoolId: recipientMode === "PRIVATE_LEARNERS" ? "private" : schoolId,
        targetSchoolIds: recipientMode === "PRIVATE_LEARNERS" ? [] : [schoolId],
        classIds: [selectedClass],
        targetStudentIds: recipientMode === "SCHOOL_CLASS" ? [] : targetStudentIds,
      });

      const selectedSchoolObj = assignedSchools.find((s) => s.id === schoolId);
      const schoolName =
        recipientMode === "PRIVATE_LEARNERS"
          ? "Private Learner(s)"
          : resolvePartnerSchoolName(selectedSchoolObj?.name, "Assigned Partner School");

      const requiresPasscode = workType === "EXAMINATION" || workType === "TEST";
      const finalPasscode = (
        customPasscode.trim() ||
        generatedPasscode.trim() ||
        generateAccessCode()
      ).toUpperCase();

      if (requiresPasscode && finalPasscode.length < 6) {
        throw new Error("Access code must be at least 6 characters.");
      }

      const targetExamId =
        editingExamId ||
        `${workType.toLowerCase()}-${selectedClass.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`;

      const isUngraded = workType === "ACTIVITY" && isUngradedActivity;
      const computedMaxScore =
        deliveryMode === "NATIVE" && !isUngraded
          ? preparedQuestions.reduce((sum, q) => sum + (q.type === "learning_resource" ? 0 : Number(q.points) || 0), 0)
          : 0;

      const hasManualDeliverable = preparedQuestions.some((q) =>
        ["essay", "long_answer", "practical_task", "link_submission", "file_submission"].includes(q.type)
      );

      const examPayload: Record<string, any> = {
        id: targetExamId,
        title: title.trim(),
        description: description.trim(),
        instructions: description.trim(),
        resourceUrl: resourceUrl.trim(),
        videoUrl: resourceUrl.trim(),
        subject: subject.trim(),
        workType,
        isUngradedActivity: isUngraded,
        submissionFormat,
        taskSubmissionMethod,
        isTaskOnlyAssignment: submissionFormat === "DELIVERABLE",
        dueDate: dueDate || null,
        recipientMode: normalizedTargets.recipientMode,
        targetSchoolIds: normalizedTargets.targetSchoolIds,
        targetStudentIds: normalizedTargets.targetStudentIds,
        deliveryMode,
        externalUrl: deliveryMode === "EXTERNAL_LINK" ? validatedExternalUrl : "",
        url: deliveryMode === "EXTERNAL_LINK" ? validatedExternalUrl : "",
        schoolId: normalizedTargets.schoolId || schoolId,
        schoolName,
        targetClass: selectedClass,
        className: selectedClass,
        classIds: [selectedClass],
        durationMinutes:
          deliveryMode === "NATIVE" && (workType === "EXAMINATION" || workType === "TEST")
            ? Math.max(5, Number(duration) || 30)
            : null,
        gradingMode:
          deliveryMode === "NATIVE"
            ? hasManualDeliverable
              ? "manual"
              : gradingMode
            : "automatic",
        status: targetStatus,
        passcode: finalPasscode,
        availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
        questions: deliveryMode === "NATIVE" ? preparedQuestions : [],
        questionCount: deliveryMode === "NATIVE" ? preparedQuestions.length : 0,
        maxScore: computedMaxScore,
        makeQuiz: deliveryMode === "NATIVE" && !isUngraded ? makeQuiz : false,
        releaseGradesPolicy,
        showMissedQuestions,
        showCorrectAnswers,
        showPointValues,
        defaultPointValue,
        shuffleQuestions,
        shuffleOptions,
        limitOneAttempt,
        confirmationMessage,
        createdBy: currentUser.uid,
        tutorId: currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      // Try server endpoint first so passcode hash & notifications are persisted, with direct Firestore sync
      try {
        const token = await currentUser.getIdToken();
        await fetch("/.netlify/functions/tutor-examinations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...examPayload,
            examId: targetExamId,
          }),
        });
      } catch {
        // Direct client write below ensures persistence
      }

      for (const dbInstance of getAllClientDatabases()) {
        await setDoc(doc(dbInstance, "jdiExams", targetExamId), examPayload, { merge: true });
        await setDoc(doc(dbInstance, "schoolExams", targetExamId), examPayload, { merge: true });
        if ((workType === "ASSIGNMENT" || workType === "ACTIVITY") && targetStatus !== "draft") {
          const assignmentMirrorPayload: Record<string, any> = {
            id: targetExamId,
            title: title.trim(),
            instructions: description.trim(),
            description: description.trim(),
            subject: subject.trim(),
            activityType: workType,
            workType,
            targetMode: recipientMode === "SCHOOL_CLASS" ? "SCHOOL_GRADE" : "INDIVIDUAL",
            recipientMode: normalizedTargets.recipientMode,
            schoolId: normalizedTargets.schoolId || schoolId,
            schoolName,
            targetClass: selectedClass,
            className: selectedClass,
            classIds: [selectedClass],
            targetSchoolIds: normalizedTargets.targetSchoolIds,
            targetStudentIds: normalizedTargets.targetStudentIds,
            studentId:
              recipientMode !== "SCHOOL_CLASS" && normalizedTargets.targetStudentIds.length === 1
                ? normalizedTargets.targetStudentIds[0]
                : "",
            tutorId: currentUser.uid,
            tutorName: currentUser.displayName || currentUser.email?.split("@")[0] || "Assigned Tutor",
            dueDate: dueDate || availableUntil || null,
            maxMarks: computedMaxScore || Number(taskMaxMarks) || 100,
            resourceUrl: resourceUrl.trim() || null,
            status: "PUBLISHED",
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(dbInstance, "assignments", targetExamId), assignmentMirrorPayload, {
            merge: true,
          }).catch(() => undefined);
        }
      }

      setEditingExamId(targetExamId);
      setCustomPasscode(finalPasscode);
      setGeneratedPasscode(finalPasscode);
      setStatus(targetStatus);
      if (deliveryMode === "NATIVE" && preparedQuestions.length > 0 && submissionFormat !== "DELIVERABLE") {
        setQuestions(preparedQuestions);
      }

      const workLabel = workType.charAt(0) + workType.slice(1).toLowerCase();
      setMessage(
        targetStatus === "draft"
          ? `${workLabel} "${title.trim()}" saved as draft.`
          : `${workLabel} "${title.trim()}" published (${
              deliveryMode === "EXTERNAL_LINK" ? "External Link" : "Native Editor"
            })${requiresPasscode ? ` • Access Code: ${finalPasscode}` : ""}`
      );
      void loadExistingExams();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to save assessment.");
    } finally {
      setBusy(false);
    }
  };

  // Handles Saving or Publishing from the dedicated AssessmentEditor / AssessmentWizard
  const handleSaveWizardAssessment = async (payload: Record<string, any>) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Please sign in again to save the assessment.");

    let validatedExternalUrl = "";
    if (payload.deliveryMode === "EXTERNAL_LINK") {
      const urlCheck = validateExternalExamUrl(payload.externalUrl || "");
      if (!urlCheck.valid) {
        throw new Error(urlCheck.error);
      }
      validatedExternalUrl = (urlCheck as { url: string }).url;
    }

    const normalizedTargets = normalizeRecipientTargets({
      recipientMode: payload.recipientMode,
      schoolId:
        payload.targetSchoolIds?.[0] ||
        (payload.recipientMode === "PRIVATE_LEARNERS" ? "private" : ""),
      targetSchoolIds: payload.targetSchoolIds || [],
      classIds: payload.classIds || [payload.targetClass || "all"],
      targetStudentIds: payload.targetStudentIds || [],
    });

    const selectedSchoolObj = assignedSchools.find((s) =>
      (payload.targetSchoolIds || []).includes(s.id)
    );
    const schoolName =
      payload.recipientMode === "PRIVATE_LEARNERS"
        ? "Private Learner(s)"
        : (payload.targetSchoolIds || []).length > 1
        ? `Multi-Target (${payload.targetSchoolIds.length} Schools)`
        : resolvePartnerSchoolName(selectedSchoolObj?.name, "Assigned Partner School");

    const resolvedWorkType = normalizeWorkType(payload.workType, payload);
    const requiresPasscode = resolvedWorkType === "EXAMINATION" || resolvedWorkType === "TEST";
    const wantsPasscode = requiresPasscode || Boolean(payload.hasPasscode);
    const finalPasscode = wantsPasscode
      ? String(payload.passcode || "").trim().toUpperCase() || generateAccessCode()
      : "";

    if (requiresPasscode && finalPasscode.length < 4 && payload.status !== "draft") {
      throw new Error("A valid passcode is mandatory for Tests and Examinations.");
    }

    const targetExamId =
      payload.id ||
      editingExamId ||
      `${resolvedWorkType.toLowerCase()}-${String(payload.targetClass || "all")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`;

    const preparedQuestions = Array.isArray(payload.questions) ? payload.questions : [];
    const computedMaxScore =
      payload.deliveryMode === "NATIVE"
        ? preparedQuestions.reduce(
            (sum: number, q: any) =>
              sum + (q.type === "learning_resource" ? 0 : Number(q.points) || 0),
            0
          )
        : 0;

    const hasManualDeliverable = preparedQuestions.some((q: any) =>
      ["essay", "long_answer", "practical_task", "link_submission", "file_submission"].includes(
        q.type
      )
    );

    const resolvedGradingMode: "automatic" | "manual" =
      payload.gradingMode === "manual" || hasManualDeliverable ? "manual" : "automatic";
    const resolvedReleasePolicy: "immediate" | "manual" =
      resolvedGradingMode === "automatic"
        ? payload.releaseGradesPolicy === "manual"
          ? "manual"
          : "immediate"
        : "manual";

    const hasTimeLimit =
      typeof payload.hasTimeLimit === "boolean"
        ? payload.hasTimeLimit
        : Number(payload.durationMinutes) > 0;
    const resolvedDurationMinutes =
      hasTimeLimit && Number(payload.durationMinutes) > 0
        ? Number(payload.durationMinutes)
        : null;

    // Determine effective status ("draft" | "scheduled" | "active")
    let resolvedStatus: "draft" | "scheduled" | "active" =
      payload.status === "scheduled"
        ? "scheduled"
        : payload.status === "active"
        ? "active"
        : "draft";
    if (resolvedStatus === "scheduled" && payload.availableFrom) {
      const fromMs = new Date(payload.availableFrom).getTime();
      if (Number.isFinite(fromMs) && fromMs <= Date.now()) {
        resolvedStatus = "active";
      }
    }

    const cleanResources = Array.isArray(payload.learningResources)
      ? payload.learningResources.filter((r: any) => r && String(r.url || "").trim())
      : [];
    const primaryResource = cleanResources[0] || null;

    const examPayload: Record<string, any> = {
      id: targetExamId,
      title: String(payload.title || "Untitled Assessment").trim(),
      description: String(payload.description || payload.instructions || "").trim(),
      instructions: String(payload.instructions || payload.description || "").trim(),
      deliverables: String(payload.deliverables || "").trim(),
      resourceTitle: String(payload.resourceTitle || primaryResource?.title || "").trim(),
      resourceUrl: String(payload.resourceUrl || primaryResource?.url || "").trim(),
      videoUrl: String(payload.videoUrl || payload.resourceUrl || primaryResource?.url || "").trim(),
      learningResources: cleanResources,
      subject: String(payload.subject || "General").trim(),
      subProgramName: String(payload.subProgramName || payload.subject || "").trim(),
      programTitle: String(payload.programTitle || payload.programName || "Technology Programme").trim(),
      programName: String(payload.programName || payload.programTitle || "Technology Programme").trim(),
      programId: String(payload.programId || "").trim(),
      programPath: payload.programPath || payload.programBreadcrumbs || "",
      programBreadcrumbs: payload.programBreadcrumbs || payload.programPath || "",
      primaryCategory: payload.primaryCategory || "",
      workType: resolvedWorkType,
      isUngradedActivity:
        resolvedWorkType === "ACTIVITY" && Boolean(payload.isUngradedActivity),
      dueDate: payload.dueDate || payload.availableUntil || null,
      recipientMode: normalizedTargets.recipientMode,
      targetSchoolIds: normalizedTargets.targetSchoolIds,
      targetStudentIds: normalizedTargets.targetStudentIds,
      deliveryMode: payload.deliveryMode,
      externalUrl: payload.deliveryMode === "EXTERNAL_LINK" ? validatedExternalUrl : "",
      url: payload.deliveryMode === "EXTERNAL_LINK" ? validatedExternalUrl : "",
      schoolId: normalizedTargets.schoolId || payload.targetSchoolIds?.[0] || "",
      schoolName,
      targetClass: payload.targetClass || "all",
      className: payload.targetClass || "all",
      classIds:
        Array.isArray(payload.classIds) && payload.classIds.length > 0
          ? payload.classIds
          : [payload.targetClass || "all"],
      hasTimeLimit,
      durationMinutes: resolvedDurationMinutes,
      gradingMode: resolvedGradingMode,
      releaseGradesPolicy: resolvedReleasePolicy,
      makeQuiz: payload.makeQuiz !== false,
      showMissedQuestions: payload.showMissedQuestions !== false,
      showCorrectAnswers: payload.showCorrectAnswers !== false,
      showPointValues: payload.showPointValues !== false,
      defaultPointValue: Number(payload.defaultPointValue || 2),
      limitOneAttempt: payload.limitOneAttempt !== false,
      shuffleQuestions: Boolean(payload.shuffleQuestions),
      shuffleOptions: Boolean(payload.shuffleOptions),
      confirmationMessage:
        payload.confirmationMessage ||
        "Your assessment has been recorded and submitted successfully.",
      status: resolvedStatus,
      hasPasscode: wantsPasscode,
      passcode: finalPasscode,
      availableFrom: payload.availableFrom || null,
      availableUntil: payload.availableUntil || null,
      questions: payload.deliveryMode === "NATIVE" ? preparedQuestions : [],
      questionCount: payload.deliveryMode === "NATIVE" ? preparedQuestions.length : 0,
      maxScore: computedMaxScore,
      createdBy: currentUser.uid,
      tutorId: currentUser.uid,
      updatedAt: serverTimestamp(),
    };

    // Write to client Firestore databases
    for (const dbInstance of getAllClientDatabases()) {
      await setDoc(doc(dbInstance, "jdiExams", targetExamId), examPayload, { merge: true });
      await setDoc(doc(dbInstance, "schoolExams", targetExamId), examPayload, { merge: true });
      if (
        (resolvedWorkType === "ASSIGNMENT" || resolvedWorkType === "ACTIVITY") &&
        resolvedStatus === "active"
      ) {
        const assignmentMirrorPayload: Record<string, any> = {
          id: targetExamId,
          examId: targetExamId,
          title: examPayload.title,
          instructions: examPayload.instructions,
          description: examPayload.description,
          deliverables: examPayload.deliverables,
          subject: examPayload.subject,
          programName: examPayload.programTitle,
          programId: examPayload.programId,
          activityType: resolvedWorkType,
          workType: resolvedWorkType,
          targetMode:
            normalizedTargets.recipientMode === "SCHOOL_CLASS" ? "SCHOOL_GRADE" : "INDIVIDUAL",
          recipientMode: normalizedTargets.recipientMode,
          schoolId: examPayload.schoolId,
          schoolName,
          targetClass: examPayload.targetClass,
          className: examPayload.className,
          classIds: examPayload.classIds,
          targetSchoolIds: normalizedTargets.targetSchoolIds,
          targetStudentIds: normalizedTargets.targetStudentIds,
          studentId:
            normalizedTargets.recipientMode !== "SCHOOL_CLASS" &&
            normalizedTargets.targetStudentIds.length === 1
              ? normalizedTargets.targetStudentIds[0]
              : "",
          tutorId: currentUser.uid,
          tutorName:
            currentUser.displayName || currentUser.email?.split("@")[0] || "Assigned Tutor",
          dueDate: examPayload.dueDate,
          maxMarks: computedMaxScore || 100,
          resourceTitle: examPayload.resourceTitle || null,
          resourceUrl: examPayload.resourceUrl || null,
          learningResources: cleanResources,
          status: "PUBLISHED",
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(dbInstance, "assignments", targetExamId), assignmentMirrorPayload, {
          merge: true,
        }).catch(() => undefined);
      }
    }

    // Mirror to server endpoint
    try {
      const token = await currentUser.getIdToken();
      await fetch("/.netlify/functions/tutor-examinations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...examPayload,
          examId: targetExamId,
        }),
      });
    } catch {}

    if (resolvedStatus === "active") {
      await notifyEligibleStudentsForExam(examPayload);
    }

    setEditingExamId(targetExamId);
    await loadExistingExams();
    setMessage(
      resolvedStatus === "draft"
        ? `Assessment "${examPayload.title}" saved as draft.`
        : resolvedStatus === "scheduled"
        ? `Assessment "${examPayload.title}" scheduled for ${
            examPayload.availableFrom
              ? new Date(examPayload.availableFrom).toLocaleString()
              : "later activation"
          }.`
        : `Assessment "${examPayload.title}" published and activated successfully.`
    );
  };

  // Edit / Republish Assessment — populates exact saved fields without injecting demo questions
  const handleEditExam = (exam: ExistingExamItem, initialTab: EditorTab = "setup") => {
    const resolvedMode = normalizeDeliveryMode(exam.deliveryMode, exam);
    const resolvedWorkType = normalizeWorkType(exam.workType, exam);
    setEditingExamId(exam.id);
    setWorkType(resolvedWorkType);
    setIsUngradedActivity(Boolean(exam.isUngradedActivity));
    setSubmissionFormat(exam.submissionFormat === "DELIVERABLE" ? "DELIVERABLE" : "QUESTIONS");
    setTaskSubmissionMethod(exam.taskSubmissionMethod || "both");
    setTaskMaxMarks(Number(exam.maxScore) || 20);
    setResourceUrl(exam.resourceUrl || exam.videoUrl || "");
    setDueDate(exam.dueDate || "");
    setRecipientMode(exam.recipientMode || "SCHOOL_CLASS");
    setTargetStudentIds(Array.isArray(exam.targetStudentIds) ? exam.targetStudentIds : []);
    setTitle(exam.title || "");
    setDescription(exam.description || "");
    setSubject(exam.subject || "");
    if (exam.schoolId && exam.schoolId !== "private") setSchoolId(exam.schoolId);
    setSelectedClass(
      normalizeClassName(exam.targetClass || exam.className || "") || CANONICAL_CLASSES[1]
    );
    setDuration(Number(exam.durationMinutes) || 30);
    setDeliveryMode(resolvedMode);
    setExternalUrl(exam.externalUrl || "");
    setCustomPasscode(exam.passcode || "");
    setGeneratedPasscode(exam.passcode || generateAccessCode());
    setStatus(
      exam.status === "draft" || exam.status === "scheduled" || exam.status === "active"
        ? exam.status
        : "active"
    );
    setAvailableFrom(exam.availableFrom ? exam.availableFrom.slice(0, 16) : "");
    setAvailableUntil(exam.availableUntil ? exam.availableUntil.slice(0, 16) : "");
    setShowScheduleSection(Boolean(exam.availableFrom || exam.availableUntil));

    const savedQuestions = Array.isArray(exam.questions) ? exam.questions : [];
    setQuestions(savedQuestions);
    setMakeQuiz(exam.makeQuiz !== false);
    setReleaseGradesPolicy(
      exam.releaseGradesPolicy || (exam.gradingMode === "manual" ? "manual" : "immediate")
    );
    setShowMissedQuestions(exam.showMissedQuestions !== false);
    setShowCorrectAnswers(exam.showCorrectAnswers !== false);
    setShowPointValues(exam.showPointValues !== false);
    setDefaultPointValue(Number(exam.defaultPointValue || 2));
    setGradingMode(exam.gradingMode || "automatic");

    setEditorTab(initialTab);
    setErrorMessage("");
    setMessage(
      initialTab === "responses"
        ? `Monitoring responses & results for "${exam.title}".`
        : `Editing "${exam.title}". Changes will update this assessment directly.`
    );
    scrollToCreatorTop();
  };

  // Part 6: Duplicate an existing assessment into a new persisted draft and immediately open Recipient Selection
  const handleDuplicateExam = async (exam: ExistingExamItem) => {
    if (!exam || duplicatingBusyId === exam.id) return;
    setDuplicatingBusyId(exam.id);
    setErrorMessage("");
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in to duplicate this assessment.");

      const resolvedMode = normalizeDeliveryMode(exam.deliveryMode, exam);
      const resolvedWorkType = normalizeWorkType(exam.workType, exam);
      const requiresPasscode = resolvedWorkType === "EXAMINATION" || resolvedWorkType === "TEST";
      const wantsPasscode = requiresPasscode || Boolean(exam.hasPasscode ?? exam.passcode);
      const freshCode = wantsPasscode ? generateAccessCode() : "";
      const newExamId = `${resolvedWorkType.toLowerCase()}-copy-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      const clonedQuestions = Array.isArray(exam.questions)
        ? exam.questions.map((q: any) => ({
            ...q,
            id: makeId(),
            options: Array.isArray(q.options) ? q.options.map((o: any) => ({ ...o })) : [],
            correctOptionIds: Array.isArray(q.correctOptionIds) ? [...q.correctOptionIds] : [],
            acceptedAnswers: Array.isArray(q.acceptedAnswers) ? [...q.acceptedAnswers] : [],
          }))
        : [];

      const clonedResources = Array.isArray(exam.learningResources)
        ? exam.learningResources.map((r: any, idx: number) => ({
            ...r,
            id: r.id || `res_${idx + 1}_${Date.now().toString(36)}`,
          }))
        : [];

      const hasTimeLimit =
        typeof exam.hasTimeLimit === "boolean"
          ? exam.hasTimeLimit
          : Number(exam.durationMinutes) > 0;
      const durationMinutes =
        hasTimeLimit && Number(exam.durationMinutes) > 0 ? Number(exam.durationMinutes) : null;

      const draftRecord: ExistingExamItem = {
        ...exam,
        id: newExamId,
        title: `${exam.title || "Untitled Assessment"} (Copy)`,
        workType: resolvedWorkType,
        deliveryMode: resolvedMode,
        status: "draft",
        hasTimeLimit,
        durationMinutes,
        hasPasscode: wantsPasscode,
        passcode: freshCode,
        availableFrom: null,
        availableUntil: null,
        questions: resolvedMode === "NATIVE" ? clonedQuestions : [],
        questionCount: resolvedMode === "NATIVE" ? clonedQuestions.length : 0,
        learningResources: clonedResources,
        createdBy: currentUser.uid,
        tutorId: currentUser.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const firestorePayload: Record<string, any> = {
        ...draftRecord,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      for (const dbInstance of getAllClientDatabases()) {
        await setDoc(doc(dbInstance, "jdiExams", newExamId), firestorePayload, { merge: true });
        await setDoc(doc(dbInstance, "schoolExams", newExamId), firestorePayload, { merge: true });
      }

      setExistingExams((prev) => [draftRecord, ...prev.filter((item) => item.id !== newExamId)]);
      setDuplicateRecipientDraft(draftRecord);
      setMessage(
        `Created draft copy "${draftRecord.title}". Select the target recipients to continue.`
      );
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to duplicate assessment.");
    } finally {
      setDuplicatingBusyId(null);
    }
  };

  // Part 6 Step 2 -> Step 3: After selecting recipients for a duplicated draft
  const handleConfirmDuplicateRecipients = async (selection: RecipientSelectionResult) => {
    const draft = duplicateRecipientDraft;
    setDuplicateRecipientDraft(null);
    if (!draft) return;

    const chosenClass =
      selection.classScopeMode === "SELECTED" && selection.selectedClasses.length > 0
        ? selection.selectedClasses[0]
        : draft.targetClass || CANONICAL_CLASSES[1];
    const chosenClasses =
      selection.classScopeMode === "SELECTED" && selection.selectedClasses.length > 0
        ? selection.selectedClasses
        : [chosenClass];
    const primarySchoolId =
      selection.recipientMode === "PRIVATE_LEARNERS"
        ? "private"
        : selection.targetSchoolIds[0] || draft.schoolId || "";
    const matchedSchool = assignedSchools.find((s) => s.id === primarySchoolId);
    const resolvedSchoolName =
      selection.recipientMode === "PRIVATE_LEARNERS"
        ? "Private Learner(s)"
        : selection.targetSchoolIds.length > 1
        ? `Multi-Target (${selection.targetSchoolIds.length} Schools)`
        : resolvePartnerSchoolName(matchedSchool?.name, draft.schoolName, "Assigned Partner School");

    const updatedDraft: ExistingExamItem = {
      ...draft,
      recipientMode: selection.recipientMode,
      targetSchoolIds: selection.targetSchoolIds,
      targetStudentIds: selection.targetStudentIds,
      schoolId: primarySchoolId,
      schoolName: resolvedSchoolName,
      targetClass: chosenClass,
      className: chosenClass,
      classIds: chosenClasses,
      updatedAt: new Date().toISOString(),
    };

    try {
      for (const dbInstance of getAllClientDatabases()) {
        await setDoc(
          doc(dbInstance, "jdiExams", updatedDraft.id),
          {
            recipientMode: updatedDraft.recipientMode,
            targetSchoolIds: updatedDraft.targetSchoolIds,
            targetStudentIds: updatedDraft.targetStudentIds,
            schoolId: updatedDraft.schoolId,
            schoolName: updatedDraft.schoolName,
            targetClass: updatedDraft.targetClass,
            className: updatedDraft.className,
            classIds: updatedDraft.classIds,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await setDoc(
          doc(dbInstance, "schoolExams", updatedDraft.id),
          {
            recipientMode: updatedDraft.recipientMode,
            targetSchoolIds: updatedDraft.targetSchoolIds,
            targetStudentIds: updatedDraft.targetStudentIds,
            schoolId: updatedDraft.schoolId,
            schoolName: updatedDraft.schoolName,
            targetClass: updatedDraft.targetClass,
            className: updatedDraft.className,
            classIds: updatedDraft.classIds,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn("Could not persist recipient update on duplicate:", err);
    }

    setExistingExams((prev) =>
      prev.map((item) => (item.id === updatedDraft.id ? updatedDraft : item))
    );

    if (updatedDraft.deliveryMode === "EXTERNAL_LINK") {
      // Part 6.4: Link assessments skip the native question workspace and go directly to final review & publish
      setLinkDuplicateReviewExam(updatedDraft);
    } else {
      // Part 6.3: Native assessments open directly in the Native Assessment Workspace
      handleEditExam(updatedDraft, "questions");
      setViewMode("edit");
    }
  };

  // Part 6.4: Save or publish the duplicated Link Assessment from the Final Review modal
  const handleSaveOrPublishDuplicatedLinkExam = async (
    targetStatus: "draft" | "scheduled" | "active"
  ) => {
    if (!linkDuplicateReviewExam) return;
    setSavingLinkDuplicate(true);
    setErrorMessage("");
    try {
      if (
        targetStatus === "scheduled" &&
        (!linkDuplicateReviewExam.availableFrom ||
          new Date(linkDuplicateReviewExam.availableFrom).getTime() <= Date.now())
      ) {
        throw new Error("Please select a future date and time to schedule this link assessment.");
      }
      await handleSaveWizardAssessment({
        ...linkDuplicateReviewExam,
        status: targetStatus,
      });
      setLinkDuplicateReviewExam(null);
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : "Could not save duplicated link assessment."
      );
    } finally {
      setSavingLinkDuplicate(false);
    }
  };

  // Save manual per-question or overall grade for a student submission
  const handleSaveManualGrade = async (attempt: ExamAttemptRecord, releaseImmediately = false) => {
    setSavingGradeId(attempt.id);
    setErrorMessage("");
    try {
      const perQOverrides = manualScoresByAttempt[attempt.id] || {};
      const existingResults = Array.isArray(attempt.questionResults) ? attempt.questionResults : [];
      const updatedResults = questions.map((q, idx) => {
        const qId = String(q.id || `q${idx + 1}`);
        const prevRes = existingResults.find((r: any) => String(r?.questionId) === qId) || {};
        const maxPts = q.type === "learning_resource" ? 0 : Math.max(0, Number(q.points ?? defaultPointValue) || 1);
        const overrideVal = perQOverrides[qId];
        const awarded =
          overrideVal !== undefined && Number.isFinite(Number(overrideVal))
            ? Math.max(0, Math.min(maxPts, Number(overrideVal)))
            : Number(prevRes.pointsAwarded ?? 0);
        return {
          ...prevRes,
          questionId: qId,
          pointsAwarded: Number(awarded.toFixed(2)),
          maxPoints: maxPts,
          manualReview: false,
          gradedByTutor: true,
        };
      });

      const computedMax = Math.max(
        1,
        updatedResults.reduce((s, r) => s + Number(r.maxPoints || 0), 0) || Number(attempt.maxScore || totalExamMarks || 100)
      );
      const rawTotalOverride = manualTotalScoreByAttempt[attempt.id];
      const computedScore =
        rawTotalOverride !== undefined && rawTotalOverride.trim() !== "" && Number.isFinite(Number(rawTotalOverride))
          ? Math.max(0, Math.min(computedMax, Number(rawTotalOverride)))
          : updatedResults.reduce((s, r) => s + Number(r.pointsAwarded || 0), 0);
      const finalScore = Number(computedScore.toFixed(2));
      const finalPct = Number(((finalScore / computedMax) * 100).toFixed(2));
      const currentRemark = String(
        tutorRemarksByAttempt[attempt.id] ?? attempt.feedback ?? attempt.tutorFeedback ?? ""
      ).trim();

      const updatePayload: Record<string, any> = {
        score: finalScore,
        maxScore: computedMax,
        percentage: finalPct,
        questionResults: updatedResults,
        feedback: currentRemark,
        tutorFeedback: currentRemark,
        status: "graded",
        ...(releaseImmediately ? { resultReleased: true, releasedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      };

      await Promise.all(
        getAllClientDatabases().map((dbInstance) =>
          setDoc(doc(dbInstance, "jdiExamAttempts", attempt.id), updatePayload, { merge: true }).catch(
            () => undefined
          )
        )
      );

      setExamAttempts((prev) =>
        prev.map((at) =>
          at.id === attempt.id
            ? {
                ...at,
                score: finalScore,
                maxScore: computedMax,
                percentage: finalPct,
                questionResults: updatedResults,
                feedback: currentRemark,
                tutorFeedback: currentRemark,
                status: "graded",
                ...(releaseImmediately ? { resultReleased: true, releasedAt: new Date().toISOString() } : {}),
              }
            : at
        )
      );

      setMessage(
        releaseImmediately
          ? `Saved grade (${finalScore}/${computedMax} · ${finalPct}%) and released result for ${attempt.studentName}.`
          : `Saved manual grade (${finalScore}/${computedMax} · ${finalPct}%) for ${attempt.studentName}.`
      );
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to save manual grade.");
    } finally {
      setSavingGradeId(null);
    }
  };

  // Delete or Archive Examination Safely (Preserves legitimate student attempts)
  const handleDeleteExam = async (exam: ExistingExamItem) => {
    setItemActionBusy(exam.id);
    setConfirmDeleteId(null);
    setErrorMessage("");
    setMessage("");
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in again.");

      const attemptsSnap = await getDocs(
        query(collection(db, "jdiExamAttempts"), where("examId", "==", exam.id))
      ).catch(() => ({ size: 0, docs: [] } as any));

      const deletionMode = resolveExamDeletionMode(
        attemptsSnap.size ?? attemptsSnap.docs?.length ?? 0
      );

      if (deletionMode === "archive") {
        for (const dbInstance of getClientDatabases()) {
          await Promise.all([
            updateDoc(doc(dbInstance, "jdiExams", exam.id), {
              status: "archived",
              updatedAt: serverTimestamp(),
            }).catch(() => undefined),
            updateDoc(doc(dbInstance, "schoolExams", exam.id), {
              status: "archived",
              updatedAt: serverTimestamp(),
            }).catch(() => undefined),
          ]);
        }
        setExistingExams((prev) =>
          prev.map((item) => (item.id === exam.id ? { ...item, status: "archived" } : item))
        );
        setMessage(
          `"${exam.title}" has recorded student attempts and was safely archived to preserve historical records.`
        );
      } else {
        for (const dbInstance of getClientDatabases()) {
          await Promise.all([
            deleteDoc(doc(dbInstance, "jdiExams", exam.id)).catch(() => undefined),
            deleteDoc(doc(dbInstance, "schoolExams", exam.id)).catch(() => undefined),
          ]);
        }
        if (editingExamId === exam.id) {
          setEditingExamId("");
          setTitle("");
          setDescription("");
          setSubject("");
          setExternalUrl("");
          setQuestions([]);
        }
        setExistingExams((prev) => prev.filter((item) => item.id !== exam.id));
        setMessage(`"${exam.title}" was permanently deleted.`);
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Could not delete assessment.");
    } finally {
      setItemActionBusy(null);
    }
  };

  // Save Tutor Remark for individual student attempt
  const handleSaveTutorRemark = async (attempt: ExamAttemptRecord, remarkInput?: string) => {
    const trimmedRemark = String(
      remarkInput !== undefined
        ? remarkInput
        : tutorRemarksByAttempt[attempt.id] ?? attempt.feedback ?? attempt.tutorFeedback ?? ""
    ).trim();
    setSavingRemarkId(attempt.id);
    try {
      await Promise.all(
        getAllClientDatabases().map((dbInstance) =>
          setDoc(
            doc(dbInstance, "jdiExamAttempts", attempt.id),
            {
              feedback: trimmedRemark,
              tutorFeedback: trimmedRemark,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ).catch(() => undefined)
        )
      );
      setTutorRemarksByAttempt((prev) => ({ ...prev, [attempt.id]: trimmedRemark }));
      setExamAttempts((prev) =>
        prev.map((at) =>
          at.id === attempt.id
            ? { ...at, feedback: trimmedRemark, tutorFeedback: trimmedRemark }
            : at
        )
      );
      setMessage(`Saved tutor remark for ${attempt.studentName}.`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to save tutor remark.");
    } finally {
      setSavingRemarkId(null);
    }
  };

  // Release Result for individual student (saving selected/typed tutor remark with the release)
  const handleReleaseResult = async (attempt: ExamAttemptRecord) => {
    setReleasingResultId(attempt.id);
    try {
      const nextState = !attempt.resultReleased;
      const currentRemark = String(
        tutorRemarksByAttempt[attempt.id] ?? attempt.feedback ?? attempt.tutorFeedback ?? ""
      ).trim();

      if (nextState && auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          await fetch("/.netlify/functions/jdi-exam-management", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: "release",
              examId: attempt.examId || editingExamId,
              attemptId: attempt.id,
              feedback: currentRemark,
              tutorFeedback: currentRemark,
            }),
          });
        } catch {
          // Direct dual-DB sync below guarantees release
        }
      }

      const nextStatus = nextState ? "graded" : "submitted";
      await Promise.all(
        getAllClientDatabases().map((dbInstance) =>
          setDoc(
            doc(dbInstance, "jdiExamAttempts", attempt.id),
            {
              resultReleased: nextState,
              releasedAt: nextState ? serverTimestamp() : null,
              releasedBy: nextState ? auth.currentUser?.uid || "tutor" : null,
              status: nextStatus,
              ...(currentRemark
                ? { feedback: currentRemark, tutorFeedback: currentRemark }
                : {}),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ).catch(() => undefined)
        )
      );
      setExamAttempts((prev) =>
        prev.map((at) =>
          at.id === attempt.id
            ? {
                ...at,
                status: nextStatus,
                resultReleased: nextState,
                releasedAt: nextState ? new Date().toISOString() : null,
                ...(currentRemark
                  ? { feedback: currentRemark, tutorFeedback: currentRemark }
                  : {}),
              }
            : at
        )
      );
      setMessage(
        nextState
          ? `Released result${currentRemark ? " & tutor remark" : ""} to ${attempt.studentName}.`
          : `Result unreleased for ${attempt.studentName}.`
      );
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to toggle result release.");
    } finally {
      setReleasingResultId(null);
    }
  };

  // Bulk release all submitted / completed / expired attempts for this assessment
  const handleReleaseAllSubmitted = async () => {
    const pendingList = examAttempts.filter(
      (at) =>
        !at.resultReleased &&
        ["submitted", "completed", "graded", "expired"].includes(at.status)
    );
    if (!pendingList.length) return;
    setBulkReleasingResults(true);
    setErrorMessage("");
    try {
      const allDbs = getAllClientDatabases();
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => "") : "";
      for (const attempt of pendingList) {
        const currentRemark = String(
          tutorRemarksByAttempt[attempt.id] ?? attempt.feedback ?? attempt.tutorFeedback ?? ""
        ).trim();
        await Promise.all(
          allDbs.map((dbInstance) =>
            setDoc(
              doc(dbInstance, "jdiExamAttempts", attempt.id),
              {
                resultReleased: true,
                releasedAt: serverTimestamp(),
                releasedBy: auth.currentUser?.uid || "tutor",
                status: "graded",
                ...(currentRemark
                  ? { feedback: currentRemark, tutorFeedback: currentRemark }
                  : {}),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => undefined)
          )
        );
        if (token) {
          fetch("/.netlify/functions/jdi-exam-management", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: "release",
              examId: attempt.examId || editingExamId,
              attemptId: attempt.id,
              feedback: currentRemark,
              tutorFeedback: currentRemark,
            }),
          }).catch(() => undefined);
        }
      }
      const releasedIds = new Set(pendingList.map((p) => p.id));
      setExamAttempts((prev) =>
        prev.map((at) =>
          releasedIds.has(at.id)
            ? {
                ...at,
                status: "graded",
                resultReleased: true,
                releasedAt: new Date().toISOString(),
              }
            : at
        )
      );
      setMessage(`Successfully released ${pendingList.length} student result(s).`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to release all results.");
    } finally {
      setBulkReleasingResults(false);
    }
  };

  // Export Responses to CSV
  const exportResponsesCsv = () => {
    if (!examAttempts.length) return;
    const headers = [
      "Student Name",
      "Student ID",
      "Class",
      "Status",
      "Score",
      "Max Score",
      "Percentage",
      "Is Online",
      "Started At",
      "Submitted At",
    ];
    const rows = examAttempts.map((at) => [
      `"${at.studentName.replace(/"/g, '""')}"`,
      `"${at.studentId}"`,
      `"${at.className}"`,
      `"${at.status}"`,
      at.score ?? 0,
      at.maxScore ?? totalExamMarks,
      `${at.percentage ?? 0}%`,
      at.isOnline ? "ONLINE" : "OFFLINE",
      at.startedAt?.toDate ? at.startedAt.toDate().toISOString() : at.startedAt || "",
      at.submittedAt?.toDate ? at.submittedAt.toDate().toISOString() : at.submittedAt || "",
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "examination")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")}_responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered examinations list
  const filteredExistingExams = useMemo(() => {
    return existingExams.filter((ex) => {
      if (workTypeFilter !== "ALL" && normalizeWorkType(ex.workType, ex) !== workTypeFilter) {
        return false;
      }
      if (lifecycleTab !== "all" && ex.status !== lifecycleTab) return false;
      if (managedSchoolFilter !== "all" && ex.schoolId !== managedSchoolFilter) return false;
      if (examSearchQuery.trim()) {
        const q = examSearchQuery.toLowerCase();
        const matchesTitle = ex.title.toLowerCase().includes(q);
        const matchesSubject = ex.subject.toLowerCase().includes(q);
        const matchesSchool = (ex.schoolName || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubject && !matchesSchool) return false;
      }
      return true;
    });
  }, [existingExams, workTypeFilter, lifecycleTab, managedSchoolFilter, examSearchQuery]);

  const activePasscode = customPasscode || generatedPasscode;

  const formattedPrivateStudents = useMemo(() => {
    return privateLearners
      .filter((pl) => pl.isPrivate !== false && pl.assignmentCategory !== "school")
      .map((pl) => ({
        ...pl,
        id: pl.id,
        name: pl.fullName || pl.studentName || "Private Learner",
        fullName: pl.fullName || pl.studentName || "Private Learner",
        grade: pl.class || pl.className || "Grade 1",
        class: pl.class,
        className: pl.className,
        email: pl.email,
        schoolId: "",
        schoolName: "",
        parentId: pl.parentId,
        parentName: pl.parentName,
        parentEmail: pl.parentEmail,
        plan: pl.plan,
        privateSubType: pl.privateSubType,
        privateLabel: pl.privateLabel,
        assignmentCategory: "private",
      }));
  }, [privateLearners]);

  const formattedSchoolStudents = useMemo(() => {
    return schoolStudentsList.map((st) => ({
      ...st,
      id: st.id,
      name: st.fullName || st.studentName || "School Student",
      fullName: st.fullName || st.studentName || "School Student",
      grade: st.class || st.className || "Grade 1",
      class: st.class,
      className: st.className,
      email: st.email,
      schoolId: st.schoolId,
      schoolName: st.schoolName,
      assignmentCategory: "school",
    }));
  }, [schoolStudentsList]);

  const formattedSchools = useMemo(() => {
    return assignedSchools.map((s) => ({
      ...s,
      id: s.id,
      name: s.name,
    }));
  }, [assignedSchools]);

  const overviewAssessments = useMemo(() => {
    return existingExams.map((ex) => ({
      id: ex.id,
      title: ex.title,
      subject: ex.subject,
      workType: normalizeWorkType(ex.workType, ex),
      deliveryMode: (ex.deliveryMode === "EXTERNAL_LINK" ? "EXTERNAL_LINK" : "NATIVE") as "NATIVE" | "EXTERNAL_LINK",
      externalUrl: ex.externalUrl,
      status: ex.status,
      schoolId: ex.schoolId,
      schoolName: ex.schoolName,
      targetClass: ex.targetClass,
      className: ex.className,
      recipientMode: ex.recipientMode,
      targetSchoolIds: ex.targetSchoolIds,
      targetStudentIds: ex.targetStudentIds,
      questionCount: ex.questions?.length ?? 0,
      maxScore: ex.maxScore,
      durationMinutes: ex.durationMinutes,
      passcode: ex.passcode,
      availableFrom: ex.availableFrom,
      availableUntil: ex.availableUntil,
      createdAt: ex.createdAt,
      updatedAt: ex.updatedAt,
    }));
  }, [existingExams]);

  return (
    <main
      ref={creatorTopRef}
      className="dashboard-interface mx-auto w-full max-w-[1440px] space-y-4 px-2 sm:px-4 pb-16 text-slate-900 dark:text-slate-100 overflow-x-hidden"
    >
      {/* Toast Alert Message Banner */}
      {message && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 dark:border-emerald-800 p-3.5 sm:p-4 text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-start sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            <span className="break-words">{message}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage("")}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 p-1 shrink-0"
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/50 dark:border-red-800 p-3.5 sm:p-4 text-xs font-semibold text-red-900 dark:text-red-200 flex items-start sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5 sm:mt-0" />
            <span className="break-words">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage("")}
            className="text-red-700 dark:text-red-300 hover:text-red-900 p-1 shrink-0"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. ASSESSMENT OVERVIEW (PRIMARY INITIAL LANDING PAGE)          */}
      {/* ============================================================== */}
      {viewMode === "overview" && (
        <AssessmentOverview
          assessments={overviewAssessments}
          isLoading={existingBusy}
          onRefresh={() => {
            void loadExistingExams();
          }}
          onCreateAssessment={() => {
            setEditingExamId("");
            setTitle("");
            setSubject("General");
            setQuestions([]);
            setViewMode("create");
          }}
          onEditAssessment={(assessment) => {
            const match = existingExams.find((e) => e.id === assessment.id);
            if (match) {
              handleEditExam(match, "questions");
            } else {
              setEditingExamId(assessment.id);
            }
            setViewMode("edit");
          }}
          onMonitorAssessment={(assessment) => {
            const match = existingExams.find((e) => e.id === assessment.id);
            if (match) {
              handleEditExam(match, "responses");
            } else {
              setEditingExamId(assessment.id);
              setEditorTab("responses");
            }
            setViewMode("monitor");
          }}
          onPreviewAssessment={(assessment) => {
            const match = existingExams.find((e) => e.id === assessment.id);
            if (match) {
              handleEditExam(match, "questions");
              setShowPreview(true);
            }
          }}
          onDuplicateAssessment={(assessment) => {
            const match = existingExams.find((e) => e.id === assessment.id);
            if (match) {
              void handleDuplicateExam(match);
            }
          }}
          onDeleteAssessment={(assessmentId) => {
            const match = existingExams.find((e) => e.id === assessmentId);
            if (match) {
              void handleDeleteExam(match);
            }
          }}
          isTutor={!isAdminWorkspace}
        />
      )}

      {/* ============================================================== */}
      {/* 2. THREE-TAB ASSESSMENT EDITOR (QUESTIONS, RESPONSES, SETTINGS)*/}
      {/* ============================================================== */}
      {(viewMode === "create" || viewMode === "edit" || viewMode === "monitor") && (
        <AssessmentEditor
          initialExam={
            editingExamId
              ? existingExams.find((e) => e.id === editingExamId)
              : targetStudentIds.length > 0
              ? {
                  workType,
                  recipientMode,
                  targetStudentIds,
                  targetSchoolIds: schoolId && schoolId !== "private" ? [schoolId] : [],
                  schoolId: schoolId || "private",
                  targetClass: selectedClass,
                }
              : null
          }
          isCreatingNew={viewMode === "create"}
          initialTab={viewMode === "monitor" ? "responses" : "questions"}
          assignedSchools={formattedSchools}
          assignedPrivateStudents={formattedPrivateStudents}
          assignedSchoolStudents={formattedSchoolStudents}
          questionBankItems={questionBankItems}
          currentUserRole={userRole || (isAdminWorkspace ? "admin" : "tutor")}
          isTutor={!isAdminWorkspace}
          onBackToOverview={() => {
            setViewMode("overview");
            void loadExistingExams();
          }}
          onSaveAssessment={async (assessmentData) => {
            await handleSaveWizardAssessment(assessmentData);
            void loadExistingExams();
          }}
          examAttempts={examAttempts}
          onReleaseResult={async (attempt) => {
            await handleReleaseResult(attempt);
          }}
          onReleaseAllSubmitted={async () => {
            await handleReleaseAllSubmitted();
          }}
          onSaveManualGrade={async (attempt, andRelease, overrides) => {
            if (overrides?.totalOverride !== undefined) {
              setManualTotalScoreByAttempt((prev) => ({
                ...prev,
                [attempt.id]: overrides.totalOverride || "",
              }));
            }
            if (overrides?.itemScores) {
              setManualScoresByAttempt((prev) => ({
                ...prev,
                [attempt.id]: overrides.itemScores || {},
              }));
            }
            if (overrides?.remark !== undefined) {
              setTutorRemarksByAttempt((prev) => ({
                ...prev,
                [attempt.id]: overrides.remark || "",
              }));
            }
            await handleSaveManualGrade(attempt, andRelease);
          }}
          onSaveTutorRemark={async (attempt, remark) => {
            await handleSaveTutorRemark(attempt, remark);
          }}
          onExportCsv={exportResponsesCsv}
          onPreviewStudent={(examData) => {
            setTitle(examData.title || title);
            setQuestions(examData.questions || questions);
            setShowPreview(true);
          }}
        />
      )}

      {/* ============================================================== */}
      {/* DUPLICATE STEP 2: RECIPIENT SELECTION MODAL (PART 6)           */}
      {/* ============================================================== */}
      <RecipientSelectorModal
        isOpen={Boolean(duplicateRecipientDraft)}
        onClose={() => setDuplicateRecipientDraft(null)}
        schools={formattedSchools}
        privateStudents={formattedPrivateStudents}
        schoolStudents={formattedSchoolStudents}
        initialRecipientType={
          duplicateRecipientDraft?.recipientMode === "PRIVATE_LEARNERS"
            ? "PRIVATE"
            : duplicateRecipientDraft?.recipientMode === "MULTI_TARGET"
            ? "ALL"
            : "SCHOOL"
        }
        initialSchoolIds={duplicateRecipientDraft?.targetSchoolIds || []}
        initialStudentIds={duplicateRecipientDraft?.targetStudentIds || []}
        initialClassScopeMode={
          duplicateRecipientDraft?.targetClass && duplicateRecipientDraft.targetClass !== "all"
            ? "SELECTED"
            : "ALL"
        }
        initialSelectedClasses={
          duplicateRecipientDraft?.classIds && duplicateRecipientDraft.classIds.length > 0
            ? duplicateRecipientDraft.classIds.filter((c) => c !== "all")
            : duplicateRecipientDraft?.targetClass && duplicateRecipientDraft.targetClass !== "all"
            ? [duplicateRecipientDraft.targetClass]
            : []
        }
        isTutor={!isAdminWorkspace}
        onConfirm={(selection) => {
          void handleConfirmDuplicateRecipients(selection);
        }}
      />

      {/* ============================================================== */}
      {/* DUPLICATE STEP 3 (LINK ASSESSMENT): FINAL REVIEW & PUBLISH     */}
      {/* ============================================================== */}
      {linkDuplicateReviewExam && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  <Link2 size={12} /> Duplicated Link Assessment · Final Review
                </span>
                <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white mt-1">
                  Review &amp; Publish External Link Assessment
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Target:{" "}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {linkDuplicateReviewExam.schoolName || "Selected Recipients"}
                  </strong>{" "}
                  ({linkDuplicateReviewExam.targetClass || "All Classes"})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkDuplicateReviewExam(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Assessment Title
                  </label>
                  <input
                    type="text"
                    value={linkDuplicateReviewExam.title}
                    onChange={(e) =>
                      setLinkDuplicateReviewExam({
                        ...linkDuplicateReviewExam,
                        title: e.target.value,
                      })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Subject / Module
                  </label>
                  <input
                    type="text"
                    value={linkDuplicateReviewExam.subject}
                    onChange={(e) =>
                      setLinkDuplicateReviewExam({
                        ...linkDuplicateReviewExam,
                        subject: e.target.value,
                      })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  External Assessment URL (Google Forms / External Test Link)
                </label>
                <input
                  type="url"
                  value={linkDuplicateReviewExam.externalUrl || ""}
                  onChange={(e) =>
                    setLinkDuplicateReviewExam({
                      ...linkDuplicateReviewExam,
                      externalUrl: e.target.value,
                    })
                  }
                  placeholder="https://docs.google.com/forms/..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Instructions for Students
                </label>
                <textarea
                  rows={3}
                  value={linkDuplicateReviewExam.description || ""}
                  onChange={(e) =>
                    setLinkDuplicateReviewExam({
                      ...linkDuplicateReviewExam,
                      description: e.target.value,
                      instructions: e.target.value,
                    })
                  }
                  placeholder="Instructions students should read before launching the link..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Reference Resource URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={linkDuplicateReviewExam.resourceUrl || ""}
                    onChange={(e) =>
                      setLinkDuplicateReviewExam({
                        ...linkDuplicateReviewExam,
                        resourceUrl: e.target.value,
                      })
                    }
                    placeholder="https://..."
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Access Passcode{" "}
                    {(linkDuplicateReviewExam.workType === "TEST" ||
                      linkDuplicateReviewExam.workType === "EXAMINATION") && (
                      <span className="text-red-600">(Mandatory)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={linkDuplicateReviewExam.passcode || ""}
                    onChange={(e) =>
                      setLinkDuplicateReviewExam({
                        ...linkDuplicateReviewExam,
                        passcode: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/70 dark:bg-slate-950/50 space-y-2.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Schedule Activation Date &amp; Time (Optional — leave empty to Activate Now)
                </label>
                <input
                  type="datetime-local"
                  value={
                    linkDuplicateReviewExam.availableFrom
                      ? linkDuplicateReviewExam.availableFrom.slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    setLinkDuplicateReviewExam({
                      ...linkDuplicateReviewExam,
                      availableFrom: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                  className="w-full sm:w-72 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={savingLinkDuplicate}
                onClick={() => void handleSaveOrPublishDuplicatedLinkExam("draft")}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                Keep in Drafts
              </button>
              <div className="flex items-center gap-2">
                {linkDuplicateReviewExam.availableFrom && (
                  <button
                    type="button"
                    disabled={savingLinkDuplicate}
                    onClick={() => void handleSaveOrPublishDuplicatedLinkExam("scheduled")}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Schedule for Later
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingLinkDuplicate}
                  onClick={() => void handleSaveOrPublishDuplicatedLinkExam("active")}
                  className="px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-black cursor-pointer"
                >
                  {savingLinkDuplicate ? "Publishing..." : "Activate & Publish Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: CREATE NEW ASSESSMENT TYPE & WORKFLOW CHOOSER         */}
      {/* ============================================================== */}
      {showCreateTypeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <PlusCircle size={18} className="text-blue-600 shrink-0" />
                  Create New Assessment
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose whether you are creating an Assignment, Activity, Test, or Examination, and select the delivery mode.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateTypeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Step 1: Choose Work Type */}
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  1. Select Academic Work Type
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(
                    [
                      {
                        id: "ASSIGNMENT",
                        title: "Assignment",
                        desc: "Submission-based or question-based work with due dates, resources, and tutor review.",
                      },
                      {
                        id: "ACTIVITY",
                        title: "Activity",
                        desc: "Practice, guided learning, class exercise, or reflection (graded or ungraded).",
                      },
                      {
                        id: "TEST",
                        title: "Test",
                        desc: "Focused question-based quiz with point allocation and automatic/manual grading.",
                      },
                      {
                        id: "EXAMINATION",
                        title: "Examination",
                        desc: "Full scheduled examination with access codes, timing, proctoring, and official reports.",
                      },
                    ] as const
                  ).map((wtOption) => {
                    const selected = workType === wtOption.id;
                    return (
                      <button
                        key={wtOption.id}
                        type="button"
                        onClick={() => setWorkType(wtOption.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          selected
                            ? "border-[#B91C1C] bg-red-50/40 dark:bg-red-950/20"
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                            {wtOption.title}
                          </span>
                          {selected && <Check size={14} className="text-[#B91C1C]" />}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {wtOption.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Choose Delivery Mode */}
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  2. Select Delivery Mode &amp; Start Editor
                </span>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => handleStartNewExamination("NATIVE", workType)}
                    className="w-full p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 bg-white dark:bg-slate-900/60 text-left transition-all cursor-pointer flex items-start gap-3.5 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Layers size={18} />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                        Native Jaystarbliss Assessment Editor
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Question authoring, formatted text/CSV import, point allocation, recipient targeting (school class or private learners), and automatic/manual grading.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartNewExamination("EXTERNAL_LINK", workType)}
                    className="w-full p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 bg-white dark:bg-slate-900/60 text-left transition-all cursor-pointer flex items-start gap-3.5 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <ExternalLink size={18} />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                        External Link / Google Forms Assessment
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Configure an external assessment URL, recipient target, and portal access verification. Manual score entry and release remain supported.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-900/40">
              <button
                type="button"
                onClick={() => setShowCreateTypeModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: QUESTION PARSER & IMPORTER                            */}
      {/* ============================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Upload size={18} className="text-blue-600 shrink-0" /> Import Questions to Assessment
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Paste formatted questions and answer keys or upload a structured CSV file.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setImportSourceTab("text")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                    importSourceTab === "text"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  Paste Formatted Text
                </button>
                <button
                  type="button"
                  onClick={() => setImportSourceTab("csv")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                    importSourceTab === "csv"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  Excel / CSV Upload
                </button>
              </div>

              {importSourceTab === "text" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Paste Formatted Questions &amp; Answer Key
                    </span>
                    <button
                      type="button"
                      onClick={handleInsertSampleTemplate}
                      className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles size={13} /> Insert Format Example
                    </button>
                  </div>

                  <textarea
                    rows={8}
                    value={rawScriptText}
                    onChange={(e) => setRawScriptText(e.target.value)}
                    placeholder={
                      "1. What is 2 + 2? [2 marks]\nA. 3\nB. 4\nC. 5\n\nANSWER KEY\n1. B"
                    }
                    className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:border-blue-600"
                  />

                  <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleParseScriptText}
                      className="min-h-[38px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                    >
                      Parse &amp; Validate Script
                    </button>
                    {parsedImportQuestions.length > 0 && (
                      <span className="text-xs font-bold text-emerald-600">
                        {parsedImportQuestions.length} valid question(s) ready!
                      </span>
                    )}
                  </div>

                  {importWarnings.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                      {importWarnings.map((w, idx) => (
                        <p key={idx}>• {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {importSourceTab === "csv" && (
                <div className="space-y-4 py-3">
                  <div className="p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center space-y-3">
                    <Upload size={32} className="mx-auto text-blue-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-white">
                        Upload CSV Question File
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Columns: Question, Option A, Option B, Option C, Option D, Correct, Points
                      </p>
                    </div>
                    <label className="inline-flex px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer">
                      <span>Choose .CSV File</span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const text = event.target?.result as string;
                            if (text) {
                              const lines = text.split("\n").filter(Boolean);
                              const rows = lines.slice(1).map((line) => line.split(","));
                              const generated = rows.map((r, idx) => ({
                                id: makeId(),
                                prompt: (r[0] || `Imported Question ${idx + 1}`).replace(
                                  /^"|"$/g,
                                  ""
                                ),
                                type: "single_choice",
                                options: [
                                  { id: "A", text: (r[1] || "Option A").replace(/^"|"$/g, "") },
                                  { id: "B", text: (r[2] || "Option B").replace(/^"|"$/g, "") },
                                  { id: "C", text: (r[3] || "Option C").replace(/^"|"$/g, "") },
                                  { id: "D", text: (r[4] || "Option D").replace(/^"|"$/g, "") },
                                ],
                                correctOptionIds: [
                                  (r[5] || "A").trim().replace(/^"|"$/g, ""),
                                ],
                                points: Number(r[6]) || 2,
                                required: true,
                              }));
                              setParsedImportQuestions(generated);
                              setMessage(`Parsed ${generated.length} question(s) from CSV.`);
                            }
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-2 bg-slate-50 dark:bg-slate-900/40">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!parsedImportQuestions.length}
                onClick={handleAppendImportedQuestions}
                className="min-h-[40px] rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                Import {parsedImportQuestions.length} Question(s)
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentHeaderCustomizerModal
        isOpen={showHeaderCustomizer}
        onClose={() => setShowHeaderCustomizer(false)}
        scopeKey={schoolId || "default"}
        schoolId={schoolId}
        fallbackSchoolName={
          assignedSchools.find((s) => s.id === schoolId)?.name ||
          assignedSchools[0]?.name ||
          ""
        }
        userUid={auth.currentUser?.uid || ""}
        canUpdateSchoolProfile={isAdminWorkspace}
      />
    </main>
  );
}
