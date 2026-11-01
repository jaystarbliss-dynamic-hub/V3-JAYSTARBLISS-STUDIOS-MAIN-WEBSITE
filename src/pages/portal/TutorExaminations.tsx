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

type ExistingExamItem = {
  id: string;
  title: string;
  subject: string;
  workType?: AcademicWorkType;
  isUngradedActivity?: boolean;
  submissionFormat?: "QUESTIONS" | "DELIVERABLE";
  taskSubmissionMethod?: "both" | "link" | "file" | "text" | "none";
  resourceUrl?: string;
  videoUrl?: string;
  dueDate?: string | null;
  recipientMode?: "SCHOOL_CLASS" | "PRIVATE_LEARNERS" | "MULTI_TARGET";
  targetSchoolIds?: string[];
  targetStudentIds?: string[];
  status: string;
  deliveryMode: "NATIVE" | "EXTERNAL_LINK";
  externalUrl?: string;
  schoolId?: string;
  schoolName?: string;
  targetClass?: string;
  className?: string;
  classIds?: string[];
  durationMinutes?: number | null;
  gradingMode?: "automatic" | "manual";
  passcode?: string;
  availableFrom?: string | null;
  availableUntil?: string | null;
  questions?: any[];
  questionCount?: number;
  maxScore?: number;
  description?: string;
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
  fullName: string;
  studentName?: string;
  class?: string;
  className?: string;
  schoolId?: string;
  schoolName?: string;
  parentName?: string;
  assignmentCategory?: "school" | "private";
  isPrivate?: boolean;
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

  // Top-level Navigation & Workflow State
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
  const [recipientMode, setRecipientMode] = useState<"SCHOOL_CLASS" | "PRIVATE_LEARNERS" | "MULTI_TARGET">("SCHOOL_CLASS");
  const [privateLearners, setPrivateLearners] = useState<EnrolledStudent[]>([]);
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
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
  const [assignedSchools, setAssignedSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [availableClasses, setAvailableClasses] = useState<string[]>([...CANONICAL_CLASSES]);
  const [selectedClass, setSelectedClass] = useState<string>(CANONICAL_CLASSES[1]); // Grade 1
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  // Questions State — starts empty without hardcoded/seeded demo questions
  const [questions, setQuestions] = useState<any[]>([]);

  // Settings Tab State (for Native Assessments)
  const [makeQuiz, setMakeQuiz] = useState(true);
  const [releaseGradesPolicy, setReleaseGradesPolicy] = useState<"immediate" | "manual">("manual");
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
        const schoolsList: { id: string; name: string }[] = [];
        const currentEmailLower = String(
          currentUser.email || userData.email || sessionStorage.getItem("userEmail") || ""
        )
          .trim()
          .toLowerCase();

        Array.from(schoolDocsMap.values()).forEach((d: any) => {
          const s = d.data();
          const sId = d.id;
          const sCode = String(s.schoolId || s.code || s.schoolCode || "").trim();
          const sName =
            resolvePartnerSchoolName(s.name, s.schoolName) || `Partner School (${sId})`;

          if (isAdmin) {
            schoolsList.push({ id: sId, name: sName });
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
              schoolsList.push({ id: sId, name: sName });
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
              id: fs.id,
              name: resolvePartnerSchoolName(fs.name, fs.schoolName) || `Partner School (${fs.id})`,
            });
            existingSchoolIds.add(fs.id);
          }
        });
        schoolsList.sort((a, b) => a.name.localeCompare(b.name));

        const privateMap = new Map<string, EnrolledStudent>();
        fallbackStudents.forEach((st: any) => {
          const stClass = normalizeClassName(st.className || st.grade || st.class || "Grade 1");
          const isPriv =
            st.assignmentCategory === "private" ||
            (!st.schoolId && st.assignmentCategory !== "school");
          privateMap.set(st.id, {
            id: st.id,
            fullName: String(st.fullName || st.name || st.studentName || "Learner").trim(),
            class: stClass,
            className: stClass,
            schoolId: String(st.schoolId || "").trim(),
            schoolName: String(st.schoolName || "").trim(),
            parentName: String(st.parentName || "").trim(),
            assignmentCategory: isPriv ? "private" : "school",
            isPrivate: isPriv,
          });
        });

        // Also check direct collections in case of impersonation or newly added learners
        const [indStudentsSnap, stdStudentsSnap] = await Promise.all([
          getDocs(collection(db, "individualStudents")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "students")).catch(() => ({ docs: [] } as any)),
        ]);
        const effectiveUid = effectiveAuth.effectiveUid || currentUser.uid;
        [...(indStudentsSnap.docs || []), ...(stdStudentsSnap.docs || [])].forEach((d: any) => {
          if (privateMap.has(d.id)) return;
          const st = d.data();
          const tutorMatch =
            isAdmin ||
            [st.tutorId, st.staffId, st.assignedTutorId, st.assignedStaffId, st.instructorId]
              .map((v) => String(v || "").trim())
              .includes(effectiveUid);
          if (!tutorMatch) return;
          const stClass = normalizeClassName(st.className || st.grade || st.class || "Grade 1");
          const isPriv = !st.schoolId || d.ref?.parent?.id === "individualStudents";
          privateMap.set(d.id, {
            id: d.id,
            fullName: String(st.fullName || st.name || st.studentName || "Private Learner").trim(),
            class: stClass,
            className: stClass,
            schoolId: String(st.schoolId || "").trim(),
            schoolName: String(st.schoolName || st.school || "").trim(),
            parentName: String(st.parentName || "").trim(),
            assignmentCategory: isPriv ? "private" : "school",
            isPrivate: isPriv,
          });
        });

        if (isMounted) {
          setPrivateLearners(
            Array.from(privateMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
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

        map.set(d.id, {
          id: d.id,
          title: data.title || "Untitled Assessment",
          subject: data.subject || "General",
          workType: resolvedWorkType,
          isUngradedActivity: isUngraded,
          submissionFormat: data.submissionFormat === "DELIVERABLE" ? "DELIVERABLE" : "QUESTIONS",
          dueDate: data.dueDate || null,
          recipientMode: data.recipientMode || "SCHOOL_CLASS",
          targetSchoolIds: Array.isArray(data.targetSchoolIds) ? data.targetSchoolIds : sId ? [sId] : [],
          targetStudentIds: Array.isArray(data.targetStudentIds) ? data.targetStudentIds : [],
          status: data.status || "draft",
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
          durationMinutes:
            resolvedMode === "EXTERNAL_LINK"
              ? data.durationMinutes
                ? Number(data.durationMinutes)
                : null
              : Number(data.durationMinutes) || 30,
          gradingMode: data.gradingMode || "automatic",
          passcode: data.passcode || "",
          availableFrom: data.availableFrom || null,
          availableUntil: data.availableUntil || null,
          questions: qList,
          questionCount: resolvedMode === "EXTERNAL_LINK" ? 0 : qList.length,
          maxScore,
          description: data.description || data.instructions || "",
          releaseGradesPolicy: data.releaseGradesPolicy || "manual",
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
          updatedAt: data.updatedAt || data.createdAt,
        });
      });

      setExistingExams(Array.from(map.values()));
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
          const records: ExamAttemptRecord[] = snapshot.docs.map((d) => {
            const at = d.data();
            return {
              id: d.id,
              examId: at.examId,
              studentId: at.studentId || at.studentUid || d.id,
              studentName: at.studentName || "Student",
              studentUid: at.studentUid,
              className: at.className || "Grade 1",
              schoolId: at.schoolId,
              schoolName: at.schoolName,
              status: at.status || "in_progress",
              score: at.score,
              maxScore: at.maxScore,
              percentage: at.percentage,
              answers: at.answers || {},
              questionResults: at.questionResults || [],
              isOnline: at.isOnline === true,
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
    setReleaseGradesPolicy(exam.releaseGradesPolicy || "manual");
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

  // Duplicate an existing assessment into a new draft
  const handleDuplicateExam = (exam: ExistingExamItem) => {
    const resolvedMode = normalizeDeliveryMode(exam.deliveryMode, exam);
    const resolvedWorkType = normalizeWorkType(exam.workType, exam);
    const freshCode = generateAccessCode();
    setEditingExamId("");
    setWorkType(resolvedWorkType);
    setIsUngradedActivity(Boolean(exam.isUngradedActivity));
    setSubmissionFormat(exam.submissionFormat === "DELIVERABLE" ? "DELIVERABLE" : "QUESTIONS");
    setTaskSubmissionMethod(exam.taskSubmissionMethod || "both");
    setTaskMaxMarks(Number(exam.maxScore) || 20);
    setResourceUrl(exam.resourceUrl || exam.videoUrl || "");
    setDueDate(exam.dueDate || "");
    setRecipientMode(exam.recipientMode || "SCHOOL_CLASS");
    setTargetStudentIds(Array.isArray(exam.targetStudentIds) ? exam.targetStudentIds : []);
    setTitle(`${exam.title || "Untitled Assessment"} (Copy)`);
    setDescription(exam.description || "");
    setSubject(exam.subject || "");
    if (exam.schoolId && exam.schoolId !== "private") setSchoolId(exam.schoolId);
    setSelectedClass(
      normalizeClassName(exam.targetClass || exam.className || "") || CANONICAL_CLASSES[1]
    );
    setDuration(Number(exam.durationMinutes) || 30);
    setDeliveryMode(resolvedMode);
    setExternalUrl(exam.externalUrl || "");
    setCustomPasscode(freshCode);
    setGeneratedPasscode(freshCode);
    setStatus("draft");
    setAvailableFrom("");
    setAvailableUntil("");
    setQuestions(
      Array.isArray(exam.questions)
        ? exam.questions.map((q: any) => ({ ...q, id: makeId() }))
        : []
    );
    setEditorTab("setup");
    setErrorMessage("");
    setMessage(`Duplicated "${exam.title}" into a new draft.`);
    scrollToCreatorTop();
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
      {/* ZERO-SCROLL SPLIT-PANE ASSESSMENT STUDIO                       */}
      {/* Left Rail: Pinned Assessment Directory & Quick Switcher        */}
      {/* Right Canvas: 4-Mode Studio (Setup, Questions, Live, Settings) */}
      {/* ============================================================== */}
      <div
        className={`grid grid-cols-1 ${
          showLeftDirectoryRail ? "xl:grid-cols-[320px_minmax(0,1fr)]" : "xl:grid-cols-1"
        } gap-5 items-start`}
      >
        {/* PINNED LEFT RAIL: ASSESSMENT DIRECTORY & HISTORY (ZERO-SCROLL SWITCHER) */}
        {showLeftDirectoryRail && (
          <aside className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#161B26] shadow-xs overflow-hidden xl:sticky xl:top-16 flex flex-col max-h-[520px] xl:max-h-[calc(100vh-5.5rem)]">
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                    Zero-Scroll Directory
                  </span>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                    Assessments ({filteredExistingExams.length})
                  </h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCreateTypeModal(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Create New Assessment"
                  >
                    <Plus size={13} /> New
                  </button>
                  <button
                    type="button"
                    disabled={existingBusy}
                    onClick={() => void loadExistingExams()}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                    title="Refresh Assessments"
                  >
                    <RefreshCw size={13} className={existingBusy ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* Quick Search inside Left Rail */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={examSearchQuery}
                  onChange={(e) => setExamSearchQuery(e.target.value)}
                  placeholder="Search exams, subject, school..."
                  className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Compact Status Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: "all", label: `All (${existingExams.length})` },
                    {
                      id: "active",
                      label: `Live (${existingExams.filter((e) => e.status === "active").length})`,
                    },
                    {
                      id: "draft",
                      label: `Drafts (${existingExams.filter((e) => e.status === "draft").length})`,
                    },
                    {
                      id: "scheduled",
                      label: `Sched (${existingExams.filter((e) => e.status === "scheduled").length})`,
                    },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setLifecycleTab(st.id)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      lifecycleTab === st.id
                        ? "bg-slate-900 text-white dark:bg-blue-600"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Assessment List inside Left Rail */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 p-2 space-y-1.5 custom-scrollbar">
              {existingBusy ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading assessments…</div>
              ) : filteredExistingExams.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No assessments match your filter. Click <strong>+ New</strong> above to create one.
                </div>
              ) : (
                filteredExistingExams.map((ex) => {
                  const isSelected = editingExamId === ex.id;
                  const isExternal = ex.deliveryMode === "EXTERNAL_LINK";
                  const itemWorkType = normalizeWorkType(ex.workType, ex);
                  return (
                    <div
                      key={ex.id}
                      className={`rounded-xl border p-2.5 transition-all ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 shadow-2xs"
                          : "border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-blue-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleEditExam(
                              ex,
                              editorTab === "responses" && !isExternal ? "responses" : "questions"
                            )
                          }
                          className="text-left min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="flex flex-wrap items-center gap-1 mb-1">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-red-50 text-[#B91C1C] dark:bg-red-950/60 dark:text-red-300">
                              {itemWorkType}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                ex.status === "active"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : ex.status === "scheduled"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              }`}
                            >
                              {ex.status}
                            </span>
                          </div>
                          <p className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 leading-snug">
                            {ex.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {ex.subject} ·{" "}
                            {ex.recipientMode === "PRIVATE_LEARNERS"
                              ? `Private (${(ex.targetStudentIds || []).length})`
                              : ex.targetClass || "All"}
                          </p>
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleEditExam(ex, "questions")}
                          className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold text-center transition-colors cursor-pointer ${
                            isSelected && editorTab === "questions"
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                          }`}
                        >
                          Edit ({ex.questionCount || 0}Q)
                        </button>
                        {!isExternal && (
                          <button
                            type="button"
                            onClick={() => handleEditExam(ex, "responses")}
                            className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold text-center transition-colors cursor-pointer inline-flex items-center justify-center gap-1 ${
                              isSelected && editorTab === "responses"
                                ? "bg-emerald-600 text-white"
                                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                            }`}
                          >
                            <Activity size={11} /> Monitor
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditorTab("directory")}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Open Full Directory Table →
              </button>
              <Link
                to={isAdminWorkspace ? "/admin/examination-history" : "/portal/staff/exam-history"}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                Full History
              </Link>
            </div>
          </aside>
        )}

        {/* RIGHT STUDIO WORKSPACE COLUMN */}
        <div className="min-w-0 space-y-4">
          {/* ============================================================== */}
          {/* TOP WORKSPACE BAR & 4-MODE STUDIO SWITCHER                     */}
          {/* ============================================================== */}
          <header className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Left: Workspace Title & Active Mode */}
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowLeftDirectoryRail((prev) => !prev)}
                  className="hidden xl:inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 shrink-0 cursor-pointer"
                  title={showLeftDirectoryRail ? "Hide Left Assessment Directory" : "Show Left Assessment Directory"}
                >
                  <LayoutTemplate size={16} />
                </button>
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  {deliveryMode === "EXTERNAL_LINK" ? <Link2 size={20} /> : <FileText size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-black text-base sm:text-lg text-slate-900 dark:text-white truncate">
                      {editingExamId
                        ? `${title || "Untitled Assessment"}`
                        : title || `New ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
                    </h2>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-red-50 text-[#B91C1C] dark:bg-red-950/60 dark:text-red-300 shrink-0">
                      {workType}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                        deliveryMode === "EXTERNAL_LINK"
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                      }`}
                    >
                      {deliveryMode === "EXTERNAL_LINK" ? "External Link" : "Native Studio"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {recipientMode === "PRIVATE_LEARNERS"
                      ? `Private Learners (${targetStudentIds.length} selected)`
                      : `${assignedSchools.find((s) => s.id === schoolId)?.name || "Select School"} · ${selectedClass}`}
                    {deliveryMode === "NATIVE"
                      ? isUngradedActivity && workType === "ACTIVITY"
                        ? ` · ${questions.length} Item(s) · Ungraded`
                        : ` · ${questions.length} Question(s) · ${totalExamMarks} Marks`
                      : " · Hosted Externally"}
                  </p>
                </div>
              </div>

              {/* Right: Primary Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTypeModal(true)}
                  className="min-h-[38px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 px-3.5 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle size={14} /> New Assessment
                </button>

                <button
                  type="button"
                  onClick={() => setShowHeaderCustomizer(true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                  title="Official Document Header Customizer"
                >
                  <LayoutTemplate size={14} />
                  <span className="hidden sm:inline">Header Branding</span>
                </button>

                {deliveryMode === "NATIVE" && (
                  <button
                    type="button"
                    onClick={() => setShowPreview((prev) => !prev)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                    title="Preview Assessment"
                  >
                    <Eye size={14} />
                    <span className="hidden sm:inline">{showPreview ? "Hide Preview" : "Preview"}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveOrPublish("draft")}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save Draft
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveOrPublish("active")}
                  className="min-h-[38px] rounded-xl bg-blue-600 px-4 py-1.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer text-xs"
                >
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  {editingExamId
                    ? "Update & Republish"
                    : `Publish ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
                </button>
              </div>
            </div>

            {/* 4-MODE STUDIO NAVIGATION BAR (Eliminates duplicate forms & vertical stacking) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <nav
                aria-label="Assessment Studio Modes"
                className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl w-full sm:w-auto"
              >
                <button
                  type="button"
                  onClick={() => setEditorTab("setup")}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                    editorTab === "setup"
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <Users size={13} />
                  <span>1. Details &amp; Recipients</span>
                  {targetStudentIds.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      {targetStudentIds.length}
                    </span>
                  )}
                </button>

                {deliveryMode === "NATIVE" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditorTab("questions")}
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        editorTab === "questions"
                          ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      <FileText size={13} />
                      <span>2. Content Builder</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {submissionFormat === "DELIVERABLE" && questions.length === 0 ? "Task" : questions.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditorTab("settings")}
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        editorTab === "settings"
                          ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      <SettingsIcon size={13} />
                      <span>3. Submission &amp; Grading Rules</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditorTab("responses")}
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        editorTab === "responses"
                          ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      <Activity size={13} />
                      <span>4. Submissions &amp; Grading</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                        {examAttempts.length}
                      </span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setEditorTab("directory")}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                    editorTab === "directory"
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <Calendar size={13} />
                  <span>All Assessments ({existingExams.length})</span>
                </button>
              </nav>

              {/* Compact Work Type Pill Switcher */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: "ASSIGNMENT", label: "Assignment" },
                    { id: "ACTIVITY", label: "Activity" },
                    { id: "TEST", label: "Test" },
                    { id: "EXAMINATION", label: "Examination" },
                  ] as const
                ).map((wt) => {
                  const active = workType === wt.id;
                  return (
                    <button
                      key={wt.id}
                      type="button"
                      onClick={() => handleSelectWorkType(wt.id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? "bg-[#14284B] text-white dark:bg-blue-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      {wt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </header>

      {/* ============================================================== */}
      {/* MODE A: EXTERNAL LINK / GOOGLE FORMS WORKSPACE                 */}
      {/* Hides Questions, Responses & Native Settings sections          */}
      {/* ============================================================== */}
      {deliveryMode === "EXTERNAL_LINK" && (
        <section className="rounded-2xl border-t-8 border-t-blue-600 border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ExternalLink size={18} className="text-blue-600 shrink-0" />
                External Link / Google Forms Assessment
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure the external assessment link and portal access code. Questions and responses are hosted externally.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSelectDeliveryMode("NATIVE")}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Switch to Native Studio
            </button>
          </div>

          <div className="space-y-4">
            {/* Title & Description */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                {workType.charAt(0) + workType.slice(1).toLowerCase()} Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. Grade 5 Digital Literacy ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Description / Student Instructions
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter instructions for students before they open the external assessment link..."
                rows={2}
                className="w-full text-xs text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-blue-600 resize-none bg-slate-50/50 dark:bg-slate-900/40"
              />
            </div>

            {/* External URL & Access Code */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  External Assessment / Google Forms URL *
                </label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://docs.google.com/forms/d/e/..."
                  className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Portal Access Code *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={activePasscode}
                    onChange={(e) => setCustomPasscode(e.target.value.toUpperCase())}
                    placeholder="JDI-XXXXXX"
                    className="h-11 flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-mono font-bold uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activePasscode);
                      setMessage("Access code copied to clipboard.");
                    }}
                    className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                    title="Copy Access Code"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* Authorised School, Target Class/Grade, Subject */}
            <div className={`grid grid-cols-1 ${recipientMode === "PRIVATE_LEARNERS" ? "sm:grid-cols-1 font-semibold" : "sm:grid-cols-3"} gap-4 pt-1`}>
              {recipientMode !== "PRIVATE_LEARNERS" && (
                <>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Authorised School *
                    </span>
                    <select
                      value={schoolId}
                      onChange={(e) => setSchoolId(e.target.value)}
                      className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                    >
                      {assignedSchools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Target Class / Grade *
                    </span>
                    <select
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                    >
                      {availableClasses.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Subject *
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Digital Literacy, Robotics, Coding"
                  className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                />
              </label>
            </div>

            {/* Optional Collapsible Availability Window */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowScheduleSection((prev) => !prev)}
                className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 inline-flex items-center gap-1.5 py-1 cursor-pointer"
              >
                <Calendar size={14} className="text-blue-600" />
                <span>
                  {showScheduleSection
                    ? "Hide Optional Availability Schedule"
                    : "Schedule Availability Window (Optional)"}
                </span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showScheduleSection ? "rotate-180" : ""}`}
                />
              </button>

              {showScheduleSection && (
                <div className="space-y-2.5 mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Available From (Optional)
                      </span>
                      <input
                        type="datetime-local"
                        value={availableFrom}
                        onChange={(e) => setAvailableFrom(e.target.value)}
                        className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Available Until (Optional)
                      </span>
                      <input
                        type="datetime-local"
                        value={availableUntil}
                        onChange={(e) => setAvailableUntil(e.target.value)}
                        className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                      />
                    </label>
                  </div>
                  {(availableFrom || availableUntil) && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-slate-500">
                        Leave both blank if you want the assessment to be immediately open while active.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAvailableFrom("");
                          setAvailableUntil("");
                        }}
                        className="text-xs font-bold text-red-600 hover:underline cursor-pointer shrink-0"
                      >
                        Clear Schedule Dates
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* External Link Action Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <KeyRound size={14} className="text-blue-600 shrink-0" />
                <span>
                  Eligible students in <strong>{selectedClass}</strong> will unlock and click{" "}
                  <strong>Open Assessment</strong> using code <strong>{activePasscode}</strong>.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {externalUrl.trim() && (
                  <a
                    href={externalUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[42px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={14} /> Test External Link
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveOrPublish("draft")}
                  className="min-h-[42px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveOrPublish("active")}
                  className="min-h-[42px] rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer text-xs"
                >
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  {editingExamId
                    ? "Update & Republish"
                    : `Publish ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================== */}
      {/* MODE B: NATIVE JAYSTARBLISS ASSESSMENT WORKSPACE               */}
      {/* ============================================================== */}
      {deliveryMode === "NATIVE" && (
        <>
          {/* LIVE INTERACTIVE STUDENT PREVIEW PANEL */}
          {showPreview && (
            <section className="rounded-2xl border-2 border-blue-500/40 bg-blue-50/30 dark:bg-slate-900/70 p-4 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 dark:border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    Interactive Student Preview Mode
                  </span>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {title || "Untitled Assessment"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {subject || "General"} · {selectedClass} · {duration} mins · {totalExamMarks} Marks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Close Preview
                </button>
              </div>

              {description && (
                <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    Student Instructions &amp; Overview
                  </p>
                  {description}
                </div>
              )}

              {resourceUrl.trim() && (
                <EmbeddedLearningMedia
                  url={resourceUrl}
                  title="Featured Lesson Video & Learning Resource"
                />
              )}

              {questions.length === 0 && submissionFormat === "DELIVERABLE" ? (
                <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-[#161B26] p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Practical Deliverable Submission
                      </span>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white mt-2">
                        {title || "Practical Project Task"}
                      </h3>
                    </div>
                    {taskSubmissionMethod !== "none" && (
                      <span className="text-xs font-black text-blue-700 dark:text-blue-300">
                        {taskMaxMarks} Marks
                      </span>
                    )}
                  </div>
                  {(taskSubmissionMethod === "link" || taskSubmissionMethod === "both") && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Project / Cloud Link (Google Drive, Scratch, GitHub, Figma, Canva)
                      </label>
                      <input
                        type="url"
                        disabled
                        placeholder="https://drive.google.com/... or https://scratch.mit.edu/projects/..."
                        className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-xs"
                      />
                    </div>
                  )}
                  {(taskSubmissionMethod === "file" || taskSubmissionMethod === "both") && (
                    <div className="p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 text-center text-xs text-slate-500">
                      Student File Upload Area (PDF, Image, ZIP, Scratch .sb3, Python, Document — up to 10 MB)
                    </div>
                  )}
                  {taskSubmissionMethod === "text" && (
                    <textarea
                      rows={3}
                      disabled
                      placeholder="Student written response area..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 text-xs"
                    />
                  )}
                  {taskSubmissionMethod === "none" && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                      No submission required — students mark this activity as completed after reviewing the instructions/video.
                    </p>
                  )}
                </div>
              ) : questions.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No content blocks added yet. Open tab 2 (Content Builder) to add questions, practical tasks, or embedded videos.
                </p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {q.type === "learning_resource" ? "Learning Resource:" : `${idx + 1}.`}{" "}
                          {q.prompt || "Untitled Item"}
                        </p>
                        <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 shrink-0">
                          {q.type === "learning_resource" ? "Resource (0 pts)" : `${q.points || defaultPointValue} pt(s)`}
                        </span>
                      </div>

                      {(q.resourceUrl || q.videoUrl) && (
                        <EmbeddedLearningMedia
                          url={q.resourceUrl || q.videoUrl}
                          title={q.prompt || "Attached Learning Resource"}
                          compact
                        />
                      )}

                      {Array.isArray(q.options) && q.options.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {q.options.map((opt: any) => (
                            <div
                              key={opt.id}
                              className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40"
                            >
                              <strong>{opt.id}.</strong> {opt.text || `Option ${opt.id}`}
                            </div>
                          ))}
                        </div>
                      )}

                      {(q.type === "link_submission" ||
                        (q.type === "practical_task" &&
                          (q.submissionMethod === "link" || q.submissionMethod === "both" || !q.submissionMethod))) && (
                        <input
                          type="url"
                          disabled
                          placeholder="Student pastes project link here (Google Drive, Scratch, GitHub, etc.)..."
                          className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-xs"
                        />
                      )}

                      {(q.type === "file_submission" ||
                        (q.type === "practical_task" &&
                          (q.submissionMethod === "file" || q.submissionMethod === "both" || !q.submissionMethod))) && (
                        <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-500 text-center">
                          Student File Upload Box ({q.acceptedFileTypes || "PDF, ZIP, Image, SB3, Code"} · Max{" "}
                          {q.maxFileSizeMb || 10}MB)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ============================================================== */}
          {/* TAB 1: ASSESSMENT DETAILS & RECIPIENTS (Single Source of Truth) */}
          {/* ============================================================== */}
          {editorTab === "setup" && (
            <section className="space-y-5">
              {/* Primary Assessment Details Card */}
              <div className="rounded-2xl border-t-8 border-t-blue-600 border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      Step 1: {workType.charAt(0) + workType.slice(1).toLowerCase()} Details &amp; Delivery Format
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Set the title, instructions, optional embedded learning video, and how students will complete this {workType.toLowerCase()}.
                    </p>
                  </div>

                  {/* Delivery Mode Switcher */}
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectDeliveryMode("NATIVE")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        deliveryMode === "NATIVE"
                          ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Native Portal Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectDeliveryMode("EXTERNAL_LINK")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        (deliveryMode as string) === "EXTERNAL_LINK"
                          ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      External Google Form
                    </button>
                  </div>
                </div>

                {/* Title & Subject */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      {workType.charAt(0) + workType.slice(1).toLowerCase()} Title *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`e.g. Grade 5 Robotics & Coding ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Subject / Course *
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Digital Literacy, Scratch, Python"
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Description / Instructions */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Instructions / Assignment Brief (Shown to Students)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Write clear instructions, project requirements, or guidance for students..."
                    rows={3}
                    className="w-full text-xs sm:text-sm text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-blue-600 bg-slate-50/50 dark:bg-slate-900/40"
                  />
                </div>

                {/* Featured Learning Resource / YouTube Video Embed URL */}
                <div className="space-y-3 p-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="block text-xs font-black text-slate-900 dark:text-white">
                        Embedded Learning Video or Reference Link (Optional)
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Paste a YouTube, Vimeo, Loom, or Google Drive video link so students can watch it directly inside the portal without leaving their assessment.
                      </p>
                    </div>
                  </div>
                  <input
                    type="url"
                    value={resourceUrl}
                    onChange={(e) => setResourceUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... or https://drive.google.com/..."
                    className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                  {resourceUrl.trim() && (
                    <EmbeddedLearningMedia
                      url={resourceUrl}
                      title="Live Embedded Video Preview (Students see this inside the portal)"
                      compact
                    />
                  )}
                </div>

                {/* Assessment Format Mode: Question-Based vs Practical Task Only (No Question Fields) */}
                <div className="space-y-3 pt-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Structure &amp; Student Response Format
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSubmissionFormat("QUESTIONS")}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                        submissionFormat === "QUESTIONS"
                          ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/30"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300"
                      }`}
                    >
                      <FileText
                        size={18}
                        className={submissionFormat === "QUESTIONS" ? "text-blue-600 shrink-0 mt-0.5" : "text-slate-400 shrink-0 mt-0.5"}
                      />
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">
                          Multi-Item Content Builder (Questions, Tasks &amp; Videos)
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Combine Multiple Choice, Short/Long Answer, Practical Tasks, Link/File Submissions, and Video blocks.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSubmissionFormat("DELIVERABLE")}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                        submissionFormat === "DELIVERABLE"
                          ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/30"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300"
                      }`}
                    >
                      <Link2
                        size={18}
                        className={submissionFormat === "DELIVERABLE" ? "text-blue-600 shrink-0 mt-0.5" : "text-slate-400 shrink-0 mt-0.5"}
                      />
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">
                          Practical Assignment Only (No Question-and-Answer Fields)
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Show only the assignment instructions/video and collect a Link, File Upload, or No Submission Required.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Deliverable-Only Configuration Bar */}
                  {submissionFormat === "DELIVERABLE" && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <label className="block sm:col-span-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Accepted Student Submission Method *
                        </span>
                        <select
                          value={taskSubmissionMethod}
                          onChange={(e) => setTaskSubmissionMethod(e.target.value as any)}
                          className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-900 dark:text-white"
                        >
                          <option value="both">Link Submission OR File Upload (Google Drive, Scratch, PDF, ZIP, Image)</option>
                          <option value="link">Link Submission Only (Google Drive, Scratch, GitHub, Figma, etc.)</option>
                          <option value="file">File Upload Only (PDF, Image, ZIP, Scratch .sb3, Code, Document)</option>
                          <option value="text">Written Text Response Only</option>
                          <option value="none">No Submission Required (Watch Video / Practical Class Activity)</option>
                        </select>
                      </label>

                      {taskSubmissionMethod !== "none" && (
                        <label className="block">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Total Assignment Marks *
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={taskMaxMarks}
                            onChange={(e) => setTaskMaxMarks(Math.max(1, Number(e.target.value) || 20))}
                            className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-900 dark:text-white"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* Duration, Due Date, and Access Code */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Duration (Minutes) *
                    </span>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={duration}
                      onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 30))}
                      className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Due Date (Optional)
                    </span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Portal Access Code *
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="text"
                        value={activePasscode}
                        onChange={(e) => setCustomPasscode(e.target.value.toUpperCase())}
                        className="w-full min-w-0 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-mono font-bold uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activePasscode);
                          setMessage("Access code copied to clipboard.");
                        }}
                        className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                        title="Copy Access Code"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </label>
                </div>

                {/* Optional Availability Window */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowScheduleSection((prev) => !prev)}
                    className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 inline-flex items-center gap-1.5 py-1 cursor-pointer"
                  >
                    <Calendar size={14} className="text-blue-600" />
                    <span>
                      {showScheduleSection
                        ? "Hide Optional Availability Schedule"
                        : "Schedule Availability Window (Optional)"}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showScheduleSection ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showScheduleSection && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                      <label className="block">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Available From (Optional)
                        </span>
                        <input
                          type="datetime-local"
                          value={availableFrom}
                          onChange={(e) => setAvailableFrom(e.target.value)}
                          className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Available Until (Optional)
                        </span>
                        <input
                          type="datetime-local"
                          value={availableUntil}
                          onChange={(e) => setAvailableUntil(e.target.value)}
                          className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2 inside Setup: Authorised Recipient Audience Selector */}
              <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      Target Recipients (School Class or Individual Learners)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Choose whether this {workType.toLowerCase()} is assigned to a Partner School class, Private Learners, or both.
                    </p>
                  </div>
                  <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                    {(
                      [
                        { id: "SCHOOL_CLASS", label: "School & Class/Grade" },
                        { id: "PRIVATE_LEARNERS", label: "Specific / Private Learner(s)" },
                        { id: "MULTI_TARGET", label: "School Class + Specific Learners" },
                      ] as const
                    ).map((rm) => (
                      <button
                        key={rm.id}
                        type="button"
                        onClick={() => setRecipientMode(rm.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          recipientMode === rm.id
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        {rm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {recipientMode !== "PRIVATE_LEARNERS" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Authorised Partner School *
                      </span>
                      <select
                        value={schoolId}
                        onChange={(e) => setSchoolId(e.target.value)}
                        className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                      >
                        {assignedSchools.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Target Class / Grade *
                      </span>
                      <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                      >
                        {availableClasses.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {/* Categorized Student Directory */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        Assigned Learner Directory ({targetStudentIds.length} individually selected)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Filter between School-Assigned Students and Private Learners. Click any student row to target them directly.
                      </p>
                    </div>
                    {privateLearners.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (recipientMode === "SCHOOL_CLASS") setRecipientMode("MULTI_TARGET");
                            const visibleIds = privateLearners
                              .filter((p) => {
                                if (studentCategoryTab === "school") return !p.isPrivate;
                                if (studentCategoryTab === "private") return Boolean(p.isPrivate);
                                return true;
                              })
                              .map((p) => p.id);
                            const allSelected = visibleIds.every((id) => targetStudentIds.includes(id));
                            if (allSelected) {
                              setTargetStudentIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                            } else {
                              setTargetStudentIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                        >
                          Select / Clear View
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorTab("questions")}
                          className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer transition-colors"
                        >
                          Next: Content Builder →
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Segmented Category Tabs + Search */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setStudentCategoryTab("all")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          studentCategoryTab === "all"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        All Available ({privateLearners.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentCategoryTab("school")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          studentCategoryTab === "school"
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        School-Assigned ({privateLearners.filter((p) => !p.isPrivate).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentCategoryTab("private")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          studentCategoryTab === "private"
                            ? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        Private Learners ({privateLearners.filter((p) => p.isPrivate).length})
                      </button>
                    </div>

                    <div className="relative sm:w-64">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={studentSearchFilter}
                        onChange={(e) => setStudentSearchFilter(e.target.value)}
                        placeholder="Filter learner by name or grade..."
                        className="w-full min-h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {privateLearners.length === 0 ? (
                    <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-center text-xs text-slate-500">
                      No assigned learners found for your tutor account.
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      {privateLearners
                        .filter((pl) => {
                          if (studentCategoryTab === "school" && pl.isPrivate) return false;
                          if (studentCategoryTab === "private" && !pl.isPrivate) return false;
                          if (studentSearchFilter.trim()) {
                            const q = studentSearchFilter.toLowerCase().trim();
                            const hay = `${pl.fullName} ${pl.class || ""} ${pl.schoolName || ""} ${pl.parentName || ""}`.toLowerCase();
                            if (!hay.includes(q)) return false;
                          }
                          return true;
                        })
                        .map((pl) => {
                          const selected = targetStudentIds.includes(pl.id);
                          return (
                            <button
                              key={pl.id}
                              type="button"
                              onClick={() => {
                                if (recipientMode === "SCHOOL_CLASS") setRecipientMode("MULTI_TARGET");
                                setTargetStudentIds((prev) =>
                                  prev.includes(pl.id)
                                    ? prev.filter((id) => id !== pl.id)
                                    : [...prev, pl.id]
                                );
                              }}
                              className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                                selected
                                  ? "bg-blue-50/80 dark:bg-blue-950/40"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                    selected
                                      ? "bg-blue-600 text-white"
                                      : pl.isPrivate
                                      ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                                  }`}
                                >
                                  {pl.fullName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                      {pl.fullName}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                        pl.isPrivate
                                          ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800"
                                          : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                                      }`}
                                    >
                                      {pl.isPrivate ? "Private Learner" : "School-Assigned"}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {pl.class || "General"}
                                    {pl.isPrivate && pl.parentName ? ` · Parent: ${pl.parentName}` : ""}
                                    {!pl.isPrivate && pl.schoolName ? ` · ${pl.schoolName}` : ""}
                                  </div>
                                </div>
                              </div>

                              <span
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 inline-flex items-center gap-1 ${
                                  selected
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                }`}
                              >
                                {selected ? (
                                  <>
                                    <Check size={12} /> Assigned
                                  </>
                                ) : (
                                  "Click to Select"
                                )}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ============================================================== */}
          {/* TAB 2: MULTI-TYPE CONTENT BUILDER (Progressive Disclosure)     */}
          {/* ============================================================== */}
          {editorTab === "questions" && (
            <section className="space-y-4">
              {/* Compact Summary Strip (Replaces duplicate metadata form) */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161B26] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {title || `Untitled ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      · {subject || "No Subject Set"} ·{" "}
                      {recipientMode === "PRIVATE_LEARNERS"
                        ? `${targetStudentIds.length} Private Learner(s)`
                        : `${assignedSchools.find((s) => s.id === schoolId)?.name || "School"} (${selectedClass})`}
                    </span>
                  </div>
                  {resourceUrl.trim() && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold truncate mt-0.5">
                      Embedded Video Attached: {resourceUrl}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorTab("setup")}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Edit Details &amp; Recipients
                  </button>
                </div>
              </div>

              {/* Add Content Block Palette + Horizontal Navigator */}
              <div className="p-3.5 sm:p-4 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Add Question, Practical Assignment, or Learning Resource Block:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { type: "single_choice", label: "+ Multiple Choice" },
                        { type: "true_false", label: "+ True / False" },
                        { type: "short_answer", label: "+ Short Answer" },
                        { type: "essay", label: "+ Long Answer" },
                        { type: "practical_task", label: "+ Practical Task" },
                        { type: "link_submission", label: "+ Link Submission" },
                        { type: "file_submission", label: "+ File Upload" },
                        { type: "learning_resource", label: "+ Video / Resource" },
                      ].map((btn) => (
                        <button
                          key={btn.type}
                          type="button"
                          onClick={() => {
                            if (submissionFormat === "DELIVERABLE") setSubmissionFormat("QUESTIONS");
                            addQuestionCard(btn.type);
                            if (focusedQuestionIndex !== "all") {
                              setFocusedQuestionIndex(questions.length);
                            }
                          }}
                          className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                            btn.type === "single_choice"
                              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                              : btn.type === "practical_task" || btn.type === "link_submission" || btn.type === "file_submission"
                              ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
                              : btn.type === "learning_resource"
                              ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setShowImportModal(true)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload size={13} className="text-blue-600" /> Import Script / CSV
                      </button>
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-500 lg:text-right shrink-0">
                    {submissionFormat === "DELIVERABLE" && questions.length === 0
                      ? "Practical Task Mode · "
                      : `${questions.length} Block(s) · `}
                    <strong className="text-slate-900 dark:text-white">
                      {totalExamMarks} Total Marks
                    </strong>
                  </div>
                </div>

                {questions.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                      Jump to:
                    </span>
                    <button
                      type="button"
                      onClick={() => setFocusedQuestionIndex("all")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors cursor-pointer ${
                        focusedQuestionIndex === "all"
                          ? "bg-slate-900 text-white dark:bg-blue-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      All ({questions.length})
                    </button>
                    {questions.map((qItem, idxPill) => {
                      const hasAnswer =
                        qItem.type === "learning_resource" ||
                        ["practical_task", "link_submission", "file_submission", "essay", "long_answer"].includes(qItem.type) ||
                        (Array.isArray(qItem.correctOptionIds) && qItem.correctOptionIds.length > 0) ||
                        (Array.isArray(qItem.acceptedAnswers) && qItem.acceptedAnswers.length > 0);
                      const isFocused = focusedQuestionIndex === idxPill;
                      return (
                        <button
                          key={qItem.id || idxPill}
                          type="button"
                          onClick={() => setFocusedQuestionIndex(idxPill)}
                          className={`min-w-[34px] h-7 px-2 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                            isFocused
                              ? "border-blue-600 bg-blue-600 text-white shadow-2xs"
                              : hasAnswer
                              ? "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                          }`}
                          title={qItem.prompt ? `#${idxPill + 1}: ${qItem.prompt}` : `Block ${idxPill + 1}`}
                        >
                          {qItem.type === "learning_resource" ? `V${idxPill + 1}` : `Q${idxPill + 1}`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Deliverable-Only Mode Card when no conventional questions are used */}
              {questions.length === 0 && submissionFormat === "DELIVERABLE" ? (
                <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-[#161B26] p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Practical Assignment Without Question Fields
                      </span>
                      <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white mt-2">
                        {title || "Untitled Practical Assignment"}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Students will NOT see a conventional question-and-answer test. They will read your instructions, watch any embedded video, and submit via{" "}
                        <strong>
                          {taskSubmissionMethod === "both"
                            ? "Link or File Upload"
                            : taskSubmissionMethod === "link"
                            ? "Link Submission Only"
                            : taskSubmissionMethod === "file"
                            ? "File Upload Only"
                            : taskSubmissionMethod === "text"
                            ? "Written Text Response"
                            : "No Submission Required"}
                        </strong>
                        .
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditorTab("setup")}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Configure Submission Method in Step 1
                    </button>
                  </div>
                </div>
              ) : questions.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] p-8 sm:p-10 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                    <FileText size={24} />
                  </div>
                  <div className="max-w-lg mx-auto space-y-1">
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      Build your assessment or practical assignment
                    </h3>
                    <p className="text-xs text-slate-500">
                      Add Multiple Choice, Short/Long Answer, Practical Project Tasks, Link/File Submission fields, or Embedded YouTube Videos—or switch to Practical Assignment Only if you don&apos;t need question fields.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => addQuestionCard("single_choice")}
                      className="min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Plus size={15} /> Add Multiple Choice
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestionCard("practical_task")}
                      className="min-h-[42px] rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Link2 size={14} /> Add Practical / Link / File Task
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestionCard("learning_resource")}
                      className="min-h-[42px] rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={14} /> Add Embedded Video / Resource
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubmissionFormat("DELIVERABLE")}
                      className="min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                    >
                      Use Practical Task Only (No Question Fields)
                    </button>
                  </div>
                </div>
              ) : (
                /* Content Block Cards List */
                <div className="space-y-4">
                  {focusedQuestionIndex !== "all" && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs">
                      <span className="font-bold text-blue-900 dark:text-blue-200">
                        Focused Mode: Viewing Block {Number(focusedQuestionIndex) + 1} of {questions.length}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={Number(focusedQuestionIndex) <= 0}
                          onClick={() =>
                            setFocusedQuestionIndex(Math.max(0, Number(focusedQuestionIndex) - 1))
                          }
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 cursor-pointer"
                        >
                          ← Prev
                        </button>
                        <button
                          type="button"
                          disabled={Number(focusedQuestionIndex) >= questions.length - 1}
                          onClick={() =>
                            setFocusedQuestionIndex(
                              Math.min(questions.length - 1, Number(focusedQuestionIndex) + 1)
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Next →
                        </button>
                        <button
                          type="button"
                          onClick={() => setFocusedQuestionIndex("all")}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold cursor-pointer"
                        >
                          Show All
                        </button>
                      </div>
                    </div>
                  )}
                  {questions.map((q, qIdx) => {
                    if (focusedQuestionIndex !== "all" && focusedQuestionIndex !== qIdx) {
                      return null;
                    }
                    const isChoice = ["single_choice", "multiple_choice", "true_false", "dropdown"].includes(q.type);
                    const isDeliverableBlock = ["practical_task", "link_submission", "file_submission"].includes(q.type);
                    const isResourceBlock = q.type === "learning_resource";

                    return (
                      <article
                        key={q.id || qIdx}
                        className="group relative rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#161B26] p-4 sm:p-6 shadow-xs hover:border-blue-400 dark:hover:border-blue-600 transition-all space-y-4"
                      >
                        {/* Top Row: Block Prompt/Title & Content Type Selector */}
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                          <div className="flex items-start sm:items-center gap-2 w-full sm:flex-1">
                            <span className="font-bold text-sm text-slate-400 w-7 shrink-0 pt-2 sm:pt-0">
                              {isResourceBlock ? `V${qIdx + 1}.` : `${qIdx + 1}.`}
                            </span>
                            <input
                              type="text"
                              value={q.prompt || ""}
                              onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
                              placeholder={
                                isResourceBlock
                                  ? "Enter video / learning resource title or instructions..."
                                  : isDeliverableBlock
                                  ? "Enter practical project task or submission prompt..."
                                  : `Enter question ${qIdx + 1} prompt...`
                              }
                              className="w-full text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-1.5 focus:outline-none focus:border-blue-600 bg-transparent"
                            />
                          </div>

                          {/* Expanded Content Type Selector */}
                          <select
                            value={q.type || "single_choice"}
                            onChange={(e) => updateQuestion(qIdx, { type: e.target.value })}
                            className="h-10 w-full sm:w-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0"
                          >
                            <option value="single_choice">Multiple Choice (Single)</option>
                            <option value="multiple_choice">Checkboxes (Multi-Select)</option>
                            <option value="true_false">True / False</option>
                            <option value="short_answer">Short Answer</option>
                            <option value="essay">Long Answer / Descriptive Essay</option>
                            <option value="practical_task">Practical Task / Project Assignment</option>
                            <option value="link_submission">Link Submission (Google Drive, Scratch, etc.)</option>
                            <option value="file_submission">File Upload Submission</option>
                            <option value="learning_resource">Embedded Video / Learning Resource (0 pts)</option>
                            <option value="dropdown">Dropdown Select</option>
                          </select>
                        </div>

                        {/* Progressive Disclosure 1: Choice Options (MCQ, Multi-Select, True/False, Dropdown) */}
                        {isChoice && (
                          <div className="space-y-2.5 pl-0 sm:pl-7">
                            <p className="text-[11px] text-slate-500">
                              Click the letter badge to mark the correct answer key:
                            </p>
                            {Array.isArray(q.options) &&
                              q.options.map((opt: any) => {
                                const isCorrect =
                                  Array.isArray(q.correctOptionIds) &&
                                  q.correctOptionIds.includes(opt.id);
                                return (
                                  <div key={opt.id} className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleOptionCorrect(qIdx, opt.id)}
                                      className={`w-8 h-8 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                        isCorrect
                                          ? "bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-200 dark:ring-emerald-900"
                                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                                      }`}
                                      title={
                                        isCorrect
                                          ? "Correct answer (Click to toggle)"
                                          : "Click to mark as correct answer"
                                      }
                                    >
                                      {opt.id}
                                    </button>
                                    <input
                                      type="text"
                                      value={opt.text}
                                      onChange={(e) => {
                                        const nextOpts = q.options.map((o: any) =>
                                          o.id === opt.id ? { ...o, text: e.target.value } : o
                                        );
                                        updateQuestion(qIdx, { options: nextOpts });
                                      }}
                                      placeholder={`Option ${opt.id}`}
                                      className="flex-1 min-w-0 h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs bg-slate-50/50 dark:bg-slate-900/40 focus:outline-none focus:border-blue-600"
                                    />
                                    {q.type !== "true_false" && q.options.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => removeOptionFromQuestion(qIdx, opt.id)}
                                        className="text-slate-400 hover:text-red-500 p-2 transition-colors shrink-0"
                                        title="Remove option"
                                      >
                                        <X size={15} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}

                            {q.type !== "true_false" && (
                              <button
                                type="button"
                                onClick={() => addOptionToQuestion(qIdx)}
                                className="text-xs font-bold text-blue-600 hover:text-blue-800 pt-1 flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={14} /> Add Option
                              </button>
                            )}
                          </div>
                        )}

                        {/* Progressive Disclosure 2: Short Answer Accepted Answers */}
                        {q.type === "short_answer" && (
                          <div className="pl-0 sm:pl-7 space-y-2">
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Accepted Answer(s) (comma-separated for auto-grading, or leave blank for manual grading)
                            </label>
                            <input
                              type="text"
                              value={
                                Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.join(", ") : ""
                              }
                              onChange={(e) =>
                                updateQuestion(qIdx, {
                                  acceptedAnswers: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                              placeholder="e.g. CPU, Central Processing Unit"
                              className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs bg-slate-50/50 dark:bg-slate-900/40"
                            />
                          </div>
                        )}

                        {/* Progressive Disclosure 3: Long Answer / Essay */}
                        {(q.type === "essay" || q.type === "long_answer") && (
                          <div className="pl-0 sm:pl-7 space-y-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/70 dark:border-slate-800">
                              Students receive a multi-line descriptive text editor for this question. Responses are held for manual tutor grading.
                            </p>
                          </div>
                        )}

                        {/* Progressive Disclosure 4: Practical Task / Link Submission / File Upload */}
                        {isDeliverableBlock && (
                          <div className="pl-0 sm:pl-7 space-y-3">
                            <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/50 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="block">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    Student Submission Method
                                  </span>
                                  <select
                                    value={
                                      q.type === "link_submission"
                                        ? "link"
                                        : q.type === "file_submission"
                                        ? "file"
                                        : q.submissionMethod || "both"
                                    }
                                    onChange={(e) =>
                                      updateQuestion(qIdx, { submissionMethod: e.target.value })
                                    }
                                    disabled={q.type === "link_submission" || q.type === "file_submission"}
                                    className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                                  >
                                    <option value="both">Link OR File Upload</option>
                                    <option value="link">Link Submission Only (Google Drive, Scratch, GitHub)</option>
                                    <option value="file">File Upload Only (PDF, ZIP, Image, SB3, Code)</option>
                                    <option value="text">Written Text Response</option>
                                    <option value="none">No Submission Required</option>
                                  </select>
                                </label>

                                <label className="block">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    Reference Video / Resource URL (Optional)
                                  </span>
                                  <input
                                    type="url"
                                    value={q.resourceUrl || q.videoUrl || ""}
                                    onChange={(e) =>
                                      updateQuestion(qIdx, {
                                        resourceUrl: e.target.value,
                                        videoUrl: e.target.value,
                                      })
                                    }
                                    placeholder="https://www.youtube.com/watch?v=... or project template link"
                                    className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                                  />
                                </label>
                              </div>

                              <label className="block">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Step-by-Step Deliverable Instructions / Sharing Guidance (Optional)
                                </span>
                                <textarea
                                  rows={2}
                                  value={q.deliverableInstructions || ""}
                                  onChange={(e) =>
                                    updateQuestion(qIdx, { deliverableInstructions: e.target.value })
                                  }
                                  placeholder="e.g. Make sure your Google Drive link is set to 'Anyone with the link can view' or upload your .sb3 Scratch project file..."
                                  className="w-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs"
                                />
                              </label>

                              {(q.resourceUrl || q.videoUrl) && (
                                <EmbeddedLearningMedia
                                  url={q.resourceUrl || q.videoUrl}
                                  title={q.prompt || "Task Reference Video"}
                                  compact
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {/* Progressive Disclosure 5: Embedded Video / Learning Resource Block */}
                        {isResourceBlock && (
                          <div className="pl-0 sm:pl-7 space-y-3">
                            <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50 space-y-3">
                              <label className="block">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                  YouTube Video or Learning Resource URL *
                                </span>
                                <input
                                  type="url"
                                  value={q.resourceUrl || q.videoUrl || ""}
                                  onChange={(e) =>
                                    updateQuestion(qIdx, {
                                      resourceUrl: e.target.value,
                                      videoUrl: e.target.value,
                                    })
                                  }
                                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                                  className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                                />
                              </label>
                              {(q.resourceUrl || q.videoUrl) ? (
                                <EmbeddedLearningMedia
                                  url={q.resourceUrl || q.videoUrl}
                                  title={q.prompt || "Embedded Video Lesson"}
                                  compact
                                />
                              ) : (
                                <p className="text-[11px] text-slate-500">
                                  Paste a YouTube link above to preview the embedded video player right here.
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Card Bottom Bar: Points, Key/Type Badge, Duplicate, Delete, Required */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <div className="flex flex-wrap items-center gap-2.5">
                            {isResourceBlock ? (
                              <span className="text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md">
                                Learning Resource (Ungraded · 0 pts)
                              </span>
                            ) : (
                              <>
                                <label className="inline-flex items-center gap-1.5">
                                  <span className="text-slate-500 font-semibold">Points:</span>
                                  <input
                                    type="number"
                                    min={0.5}
                                    max={100}
                                    step={0.5}
                                    value={q.points ?? defaultPointValue}
                                    onChange={(e) =>
                                      updateQuestion(qIdx, { points: Number(e.target.value) || 1 })
                                    }
                                    className="w-16 h-9 rounded-lg border border-slate-200 dark:border-slate-700 px-2 text-xs font-bold text-center bg-slate-50 dark:bg-slate-900"
                                  />
                                </label>
                                <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md">
                                  {isChoice &&
                                  Array.isArray(q.correctOptionIds) &&
                                  q.correctOptionIds.length
                                    ? `Key: ${q.correctOptionIds.join(", ")}`
                                    : q.type === "short_answer" &&
                                      Array.isArray(q.acceptedAnswers) &&
                                      q.acceptedAnswers.length
                                    ? `Key: ${q.acceptedAnswers.join(" | ")}`
                                    : isDeliverableBlock
                                    ? "Tutor Grading (Link / File Deliverable)"
                                    : "Manual Tutor Grading"}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => duplicateQuestion(qIdx)}
                              className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Duplicate Block"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteQuestion(qIdx)}
                              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete Block"
                            >
                              <Trash2 size={16} />
                            </button>
                            {!isResourceBlock && (
                              <>
                                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                                <label className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer py-1">
                                  <span>Required</span>
                                  <input
                                    type="checkbox"
                                    checked={q.required !== false}
                                    onChange={(e) =>
                                      updateQuestion(qIdx, { required: e.target.checked })
                                    }
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 2: RESPONSES & REAL-TIME PROCTOR */}
          {editorTab === "responses" && (
            <section className="space-y-5">
              {/* Header Bar */}
              <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {examAttempts.length} Response(s)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time tracking of active candidates, online status, submissions and scores.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <span>Accepting responses</span>
                    <input
                      type="checkbox"
                      checked={status === "active"}
                      onChange={(e) => setStatus(e.target.checked ? "active" : "draft")}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </label>

                  {examAttempts.some(
                    (at) =>
                      !at.resultReleased &&
                      ["submitted", "completed", "graded", "expired"].includes(at.status)
                  ) && (
                    <button
                      type="button"
                      disabled={bulkReleasingResults}
                      onClick={() => void handleReleaseAllSubmitted()}
                      className="min-h-[40px] rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <CheckCircle2 size={14} />
                      {bulkReleasingResults
                        ? "Releasing Results…"
                        : `Release All Pending (${
                            examAttempts.filter(
                              (at) =>
                                !at.resultReleased &&
                                ["submitted", "completed", "graded", "expired"].includes(at.status)
                            ).length
                          })`}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={exportResponsesCsv}
                    disabled={!examAttempts.length}
                    className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download size={14} className="text-emerald-600" /> Export to CSV
                  </button>
                </div>
              </div>

              {/* Responses Sub-Tabs (Responsive 2x2 grid on mobile, flex on desktop) */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => setResponsesSubTab("live")}
                  className={`min-h-[40px] px-3 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    responsesSubTab === "live"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="truncate">Live ({proctorMetrics.onlineActiveCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResponsesSubTab("summary")}
                  className={`min-h-[40px] px-3 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    responsesSubTab === "summary"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <BarChart3 size={14} className="shrink-0" />
                  <span className="truncate">Summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResponsesSubTab("question")}
                  className={`min-h-[40px] px-3 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    responsesSubTab === "question"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <FileText size={14} className="shrink-0" />
                  <span className="truncate">By Question</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResponsesSubTab("individual")}
                  className={`min-h-[40px] px-3 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    responsesSubTab === "individual"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <Users size={14} className="shrink-0" />
                  <span className="truncate">Individual</span>
                </button>
              </div>

              {/* 1. LIVE PROCTOR / MONITOR VIEW */}
              {responsesSubTab === "live" && (
                <div className="space-y-4">
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
                      <p className="text-[10px] text-slate-500 mt-0.5">Eligible class learners</p>
                    </div>
                  </div>

                  {/* Live Student Roster (Mobile Cards + Desktop Table) */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 overflow-hidden shadow-xs">
                    <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <Activity size={16} className="text-blue-600" /> Live Assessment Candidate Roster
                      </h3>
                      <span className="text-xs text-slate-500 font-semibold">
                        Class: <strong>{selectedClass}</strong>
                      </span>
                    </div>

                    {examAttempts.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No student has started this assessment yet. Share the access code{" "}
                        <strong>{activePasscode}</strong> with eligible candidates.
                      </div>
                    ) : (
                      <>
                        {/* Mobile Cards View */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                          {examAttempts.map((at) => {
                            const now = Date.now();
                            let heartbeatTime = 0;
                            if (at.lastHeartbeat?.toMillis)
                              heartbeatTime = at.lastHeartbeat.toMillis();
                            else if (typeof at.lastHeartbeat === "string")
                              heartbeatTime = new Date(at.lastHeartbeat).getTime();

                            const isHeartbeatFresh =
                              heartbeatTime > 0 && now - heartbeatTime < 150000;
                            const isLiveOnline =
                              at.status === "in_progress" &&
                              at.isOnline !== false &&
                              isHeartbeatFresh;
                            const isOffline =
                              at.status === "in_progress" &&
                              (!at.isOnline || !isHeartbeatFresh);
                            const isSubmitted =
                              at.status === "submitted" ||
                              at.status === "completed" ||
                              at.status === "graded" ||
                              at.status === "expired";
                            const answeredCount = Object.keys(at.answers || {}).length;

                            return (
                              <div key={at.id} className="p-4 space-y-2.5 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-bold text-slate-900 dark:text-white">
                                      {at.studentName}
                                    </p>
                                    <p className="text-slate-500">{at.className}</p>
                                  </div>
                                  {isLiveOnline && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      Online
                                    </span>
                                  )}
                                  {isOffline && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                      Offline
                                    </span>
                                  )}
                                  {isSubmitted && (
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        at.resultReleased
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-blue-100 text-blue-800"
                                      }`}
                                    >
                                      {at.resultReleased ? "Released" : "Submitted"}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                  <span>
                                    Progress: {answeredCount} / {questions.length}
                                  </span>
                                  <span className="font-bold">
                                    {isSubmitted
                                      ? `${at.score ?? 0} / ${at.maxScore ?? totalExamMarks} (${
                                          at.percentage ?? 0
                                        }%)`
                                      : "In Progress"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isSubmitted && (
                                    <button
                                      type="button"
                                      disabled={releasingResultId === at.id}
                                      onClick={() => void handleReleaseResult(at)}
                                      className={`flex-1 py-2 rounded-lg font-bold text-center transition-colors cursor-pointer ${
                                        at.resultReleased
                                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                          : "bg-blue-600 text-white hover:bg-blue-700"
                                      }`}
                                    >
                                      {releasingResultId === at.id
                                        ? "Updating…"
                                        : at.resultReleased
                                        ? "Result Released"
                                        : "Release Result"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedAttemptId(at.id);
                                      setResponsesSubTab("individual");
                                    }}
                                    className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-center hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    View Details
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="px-4 py-3">Student Name</th>
                                <th className="px-4 py-3">Class</th>
                                <th className="px-4 py-3">Live Status</th>
                                <th className="px-4 py-3">Progress</th>
                                <th className="px-4 py-3">Score</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {examAttempts.map((at) => {
                                const now = Date.now();
                                let heartbeatTime = 0;
                                if (at.lastHeartbeat?.toMillis)
                                  heartbeatTime = at.lastHeartbeat.toMillis();
                                else if (typeof at.lastHeartbeat === "string")
                                  heartbeatTime = new Date(at.lastHeartbeat).getTime();

                                const isHeartbeatFresh =
                                  heartbeatTime > 0 && now - heartbeatTime < 150000;
                                const isLiveOnline =
                                  at.status === "in_progress" &&
                                  at.isOnline !== false &&
                                  isHeartbeatFresh;
                                const isOffline =
                                  at.status === "in_progress" &&
                                  (!at.isOnline || !isHeartbeatFresh);
                                const isSubmitted =
                                  at.status === "submitted" ||
                                  at.status === "completed" ||
                                  at.status === "graded" ||
                                  at.status === "expired";
                                const answeredCount = Object.keys(at.answers || {}).length;

                                return (
                                  <tr
                                    key={at.id}
                                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                                  >
                                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                      {at.studentName}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">{at.className}</td>
                                    <td className="px-4 py-3">
                                      {isLiveOnline && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                          Online • In Progress
                                        </span>
                                      )}
                                      {isOffline && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                                          Offline • In Progress
                                        </span>
                                      )}
                                      {isSubmitted && (
                                        <span
                                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                            at.resultReleased
                                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                              : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                          }`}
                                        >
                                          <CheckCircle2 size={13} />
                                          {at.resultReleased ? "Released" : "Submitted"}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">
                                      {answeredCount} / {questions.length} answered
                                    </td>
                                    <td className="px-4 py-3 font-bold">
                                      {isSubmitted
                                        ? `${at.score ?? 0} / ${at.maxScore ?? totalExamMarks} (${
                                            at.percentage ?? 0
                                          }%)`
                                        : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="inline-flex items-center justify-end gap-2">
                                        {isSubmitted && (
                                          <button
                                            type="button"
                                            disabled={releasingResultId === at.id}
                                            onClick={() => void handleReleaseResult(at)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                              at.resultReleased
                                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200"
                                                : "bg-blue-600 text-white hover:bg-blue-700"
                                            }`}
                                          >
                                            {releasingResultId === at.id
                                              ? "Updating…"
                                              : at.resultReleased
                                              ? "Released"
                                              : "Release Result"}
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedAttemptId(at.id);
                                            setResponsesSubTab("individual");
                                          }}
                                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                        >
                                          View Details
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 2. SUMMARY & INSIGHTS VIEW */}
              {responsesSubTab === "summary" && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-6">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={18} className="text-blue-600" />
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        Performance Insights
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 text-center">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Average
                        </p>
                        <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
                          {summaryInsights.avgScore} / {totalExamMarks} pts
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 text-center">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Median
                        </p>
                        <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
                          {summaryInsights.medianScore} / {totalExamMarks} pts
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 text-center">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Range
                        </p>
                        <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
                          {summaryInsights.rangeMin} - {summaryInsights.rangeMax} pts
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                        Total points distribution
                      </h4>
                      {summaryInsights.distribution.length > 0 ? (
                        <div className="h-44 flex items-end gap-2 sm:gap-3 pt-6 px-2 sm:px-4 border-b border-l border-slate-200 dark:border-slate-700 overflow-x-auto">
                          {summaryInsights.distribution.map((bar) => {
                            const maxCount = Math.max(
                              ...summaryInsights.distribution.map((d) => d.count),
                              1
                            );
                            const heightPct = Math.round((bar.count / maxCount) * 100);
                            return (
                              <div
                                key={bar.points}
                                className="flex-1 min-w-[28px] flex flex-col items-center gap-1 group"
                              >
                                <span className="text-[10px] font-bold text-slate-500">
                                  {bar.count}
                                </span>
                                <div
                                  style={{ height: `${Math.max(12, heightPct)}%` }}
                                  className="w-full max-w-[40px] rounded-t-md bg-emerald-600/80 hover:bg-emerald-600 transition-all"
                                />
                                <span className="text-[10px] font-semibold text-slate-500 mt-1">
                                  {bar.points}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                          Distribution histogram will automatically render once candidates submit attempts.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Frequently Missed Questions */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={18} className="text-amber-600" />
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        Frequently Missed Questions
                      </h3>
                    </div>

                    {summaryInsights.frequentlyMissed.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {summaryInsights.frequentlyMissed.map((item, idx) => (
                          <div
                            key={idx}
                            className="py-3 flex items-center justify-between gap-4 text-xs"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200 flex-1 min-w-0 truncate">
                              {item.prompt}
                            </span>
                            <span className="font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full shrink-0">
                              {item.correctRate}% correct
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        No questions have an unusually high error rate yet.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 3. QUESTION-BY-QUESTION VIEW */}
              {responsesSubTab === "question" && (
                <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4">
                  {questions.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No questions in this assessment yet.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={selectedQuestionIndex <= 0}
                            onClick={() =>
                              setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))
                            }
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
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
                              setSelectedQuestionIndex((prev) =>
                                Math.min(questions.length - 1, prev + 1)
                              )
                            }
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                          >
                            <ChevronDown size={14} className="-rotate-90" />
                          </button>
                        </div>
                      </div>

                      {questions[selectedQuestionIndex] && (
                        <div className="space-y-4 pt-2">
                          <h3 className="font-black text-sm text-slate-900 dark:text-white">
                            {questions[selectedQuestionIndex].prompt || "Untitled Question"}
                          </h3>
                          <div className="space-y-2">
                            {Array.isArray(questions[selectedQuestionIndex].options) &&
                              questions[selectedQuestionIndex].options.map((opt: any) => {
                                const isCorrect =
                                  questions[selectedQuestionIndex].correctOptionIds?.includes(
                                    opt.id
                                  );
                                return (
                                  <div
                                    key={opt.id}
                                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold ${
                                      isCorrect
                                        ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200"
                                        : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40"
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
                    </>
                  )}
                </div>
              )}

              {/* 4. INDIVIDUAL STUDENT RESPONSES & GRADING WORKBENCH */}
              {responsesSubTab === "individual" && (
                <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Select Student Submission:
                      </label>
                      <select
                        value={selectedAttemptId || examAttempts[0]?.id || ""}
                        onChange={(e) => setSelectedAttemptId(e.target.value)}
                        className="h-10 w-full sm:w-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        {examAttempts.map((at, i) => (
                          <option key={at.id} value={at.id}>
                            {i + 1}. {at.studentName} ({at.score ?? 0}/
                            {at.maxScore ?? totalExamMarks} pts •{" "}
                            {at.resultReleased ? "Released" : at.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    {(() => {
                      const targetAttempt = examAttempts.find(
                        (a) => a.id === (selectedAttemptId || examAttempts[0]?.id)
                      );
                      if (!targetAttempt) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={savingGradeId === targetAttempt.id}
                            onClick={() => void handleSaveManualGrade(targetAttempt, false)}
                            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                          >
                            {savingGradeId === targetAttempt.id ? "Saving Grade…" : "Save Grade"}
                          </button>
                          <button
                            type="button"
                            disabled={
                              releasingResultId === targetAttempt.id ||
                              savingGradeId === targetAttempt.id
                            }
                            onClick={() =>
                              targetAttempt.resultReleased
                                ? void handleReleaseResult(targetAttempt)
                                : void handleSaveManualGrade(targetAttempt, true)
                            }
                            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50 ${
                              targetAttempt.resultReleased
                                ? "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                                : "bg-blue-600 hover:bg-blue-700 text-white"
                            }`}
                          >
                            {targetAttempt.resultReleased
                              ? "Unrelease Result"
                              : "Save Grade & Release Result"}
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {(() => {
                    const targetAttempt = examAttempts.find(
                      (a) => a.id === (selectedAttemptId || examAttempts[0]?.id)
                    );
                    if (!targetAttempt) {
                      return (
                        <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          No attempts available to display for this assessment.
                        </div>
                      );
                    }

                    const attemptMaxScore = Number(targetAttempt.maxScore ?? totalExamMarks) || 100;
                    const itemDrafts = manualScoresByAttempt[targetAttempt.id] || {};
                    const totalOverrideDraft = manualTotalScoreByAttempt[targetAttempt.id];

                    return (
                      <div className="space-y-5">
                        {/* Candidate Summary & Quick Overall Score Override Bar */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-sm text-slate-900 dark:text-white">
                                {targetAttempt.studentName}
                              </p>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  targetAttempt.resultReleased
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                }`}
                              >
                                {targetAttempt.resultReleased
                                  ? "Result Released"
                                  : `Status: ${targetAttempt.status || "submitted"}`}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 font-medium">
                              {targetAttempt.className} · {targetAttempt.schoolName || "Academy"}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                Total Score Override:
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={attemptMaxScore}
                                step="0.5"
                                placeholder={String(targetAttempt.score ?? 0)}
                                value={
                                  totalOverrideDraft !== undefined
                                    ? totalOverrideDraft
                                    : ""
                                }
                                onChange={(e) =>
                                  setManualTotalScoreByAttempt((prev) => ({
                                    ...prev,
                                    [targetAttempt.id]: e.target.value,
                                  }))
                                }
                                className="w-20 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-center text-xs font-black text-slate-900 dark:text-white"
                              />
                              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                / {attemptMaxScore} pts
                              </span>
                            </div>

                            <div className="text-right">
                              <p className="font-black text-lg text-blue-600 dark:text-blue-400">
                                {targetAttempt.score ?? 0} / {attemptMaxScore}
                              </p>
                              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                {targetAttempt.percentage ?? 0}% achieved
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Tutor Remark Selection & Custom Input Panel before/during Result Release */}
                        <div className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <MessageSquare size={15} className="text-blue-600 dark:text-blue-400" />
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                Official Tutor Feedback &amp; Remark
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const suggested = getSuggestedTutorRemark(
                                  Number(targetAttempt.percentage ?? 0)
                                );
                                setTutorRemarksByAttempt((prev) => ({
                                  ...prev,
                                  [targetAttempt.id]: suggested,
                                }));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/10 text-blue-700 dark:text-blue-300 text-[11px] font-bold hover:bg-blue-600/20 cursor-pointer"
                            >
                              <Sparkles size={12} />
                              Suggest Remark for {targetAttempt.percentage ?? 0}%
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {TUTOR_REMARK_PRESETS.map((preset) => {
                              const currentVal =
                                tutorRemarksByAttempt[targetAttempt.id] ??
                                targetAttempt.feedback ??
                                targetAttempt.tutorFeedback ??
                                "";
                              const isSelected = currentVal.trim() === preset.text.trim();
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() =>
                                    setTutorRemarksByAttempt((prev) => ({
                                      ...prev,
                                      [targetAttempt.id]: preset.text,
                                    }))
                                  }
                                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                                    isSelected
                                      ? "border-blue-600 bg-blue-600 text-white shadow-2xs"
                                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-400"
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>

                          <div className="space-y-2">
                            <textarea
                              rows={3}
                              value={
                                tutorRemarksByAttempt[targetAttempt.id] ??
                                targetAttempt.feedback ??
                                targetAttempt.tutorFeedback ??
                                ""
                              }
                              onChange={(e) =>
                                setTutorRemarksByAttempt((prev) => ({
                                  ...prev,
                                  [targetAttempt.id]: e.target.value,
                                }))
                              }
                              placeholder="Write constructive feedback on the student's work, project link, or uploaded file..."
                              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-600 dark:text-slate-400">
                                Included in the student&apos;s result portal and official PDF report.
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={savingRemarkId === targetAttempt.id}
                                  onClick={() => void handleSaveTutorRemark(targetAttempt)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                                >
                                  {savingRemarkId === targetAttempt.id
                                    ? "Saving Feedback..."
                                    : "Save Feedback Only"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Question & Deliverable Submissions Breakdown */}
                        <div className="space-y-3">
                          {questions.map((q, idx) => {
                            const rawAns =
                              targetAttempt.answers?.[q.id] ??
                              targetAttempt.answers?.[String(idx + 1)];

                            // Parse structured submission if JSON or object
                            let parsedObj: any = null;
                            if (rawAns && typeof rawAns === "object" && !Array.isArray(rawAns)) {
                              parsedObj = rawAns;
                            } else if (
                              typeof rawAns === "string" &&
                              rawAns.trim().startsWith("{") &&
                              rawAns.trim().endsWith("}")
                            ) {
                              try {
                                parsedObj = JSON.parse(rawAns);
                              } catch {
                                parsedObj = null;
                              }
                            }

                            const linkUrl =
                              parsedObj?.linkUrl ||
                              (typeof rawAns === "string" &&
                              /^https?:\/\//i.test(rawAns.trim())
                                ? rawAns.trim()
                                : "");
                            const fileDataUrl =
                              parsedObj?.fileDataUrl ||
                              parsedObj?.fileUrl ||
                              (typeof rawAns === "string" &&
                              rawAns.trim().startsWith("data:")
                                ? rawAns.trim()
                                : "");
                            const fileName =
                              parsedObj?.fileName ||
                              (fileDataUrl ? `student-submission-${idx + 1}` : "");
                            const fileSize = parsedObj?.fileSize
                              ? `${(Number(parsedObj.fileSize) / 1024).toFixed(1)} KB`
                              : "";
                            const textResponse =
                              parsedObj?.textResponse !== undefined
                                ? String(parsedObj.textResponse)
                                : !linkUrl && !fileDataUrl
                                ? Array.isArray(rawAns)
                                  ? rawAns.join(", ")
                                  : String(rawAns || "")
                                : "";

                            const existingQr = Array.isArray(targetAttempt.questionResults)
                              ? targetAttempt.questionResults.find(
                                  (r: any) => r.questionId === q.id
                                )
                              : null;
                            const currentAwarded =
                              itemDrafts[q.id] !== undefined
                                ? itemDrafts[q.id]
                                : existingQr?.pointsAwarded !== undefined
                                ? existingQr.pointsAwarded
                                : 0;

                            const isObjectiveCorrect =
                              Array.isArray(q.correctOptionIds) &&
                              q.correctOptionIds.length > 0 &&
                              (Array.isArray(rawAns) ? rawAns : [rawAns]).every((opt: any) =>
                                q.correctOptionIds.includes(opt)
                              );

                            const isLearningResource = q.type === "learning_resource";

                            return (
                              <div
                                key={q.id || idx}
                                className={`p-4 rounded-xl border text-xs space-y-3 ${
                                  isObjectiveCorrect
                                    ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/15"
                                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40"
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 shrink-0">
                                      {q.type.replace(/_/g, " ")}
                                    </span>
                                    <span className="font-bold text-slate-900 dark:text-white break-words">
                                      {idx + 1}. {q.prompt}
                                    </span>
                                  </div>

                                  {!isLearningResource && (
                                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                        Awarded Marks:
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={Number(q.points) || 100}
                                        step="0.5"
                                        value={currentAwarded}
                                        onChange={(e) => {
                                          const val = Number(e.target.value);
                                          setManualScoresByAttempt((prev) => ({
                                            ...prev,
                                            [targetAttempt.id]: {
                                              ...(prev[targetAttempt.id] || {}),
                                              [q.id]: Number.isFinite(val) ? val : 0,
                                            },
                                          }));
                                        }}
                                        className="w-16 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-center text-xs font-bold text-slate-900 dark:text-white"
                                      />
                                      <span className="font-bold text-slate-500 dark:text-slate-400">
                                        / {q.points ?? 1} pts
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Submitted Link Action Card */}
                                {linkUrl && (
                                  <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-800/70 bg-blue-50/50 dark:bg-blue-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="min-w-0 space-y-0.5">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                                        Submitted Project / Work Link
                                      </p>
                                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                        {linkUrl}
                                      </p>
                                    </div>
                                    <a
                                      href={linkUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 shadow-2xs"
                                    >
                                      <ExternalLink size={14} />
                                      Open Submitted Link
                                    </a>
                                  </div>
                                )}

                                {/* Uploaded File Action Card */}
                                {fileDataUrl && (
                                  <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/40 dark:bg-indigo-950/30 space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                      <div className="min-w-0 space-y-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                                          Uploaded Deliverable File
                                        </p>
                                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                          {fileName}{" "}
                                          {fileSize && (
                                            <span className="font-normal text-slate-500">
                                              ({fileSize})
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                      <a
                                        href={fileDataUrl}
                                        download={fileName || "student-submission"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 shadow-2xs"
                                      >
                                        <FileText size={14} />
                                        Download / View Uploaded File
                                      </a>
                                    </div>
                                    {fileDataUrl.startsWith("data:image/") && (
                                      <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 max-h-64 flex items-center justify-center p-2">
                                        <img
                                          src={fileDataUrl}
                                          alt={fileName || "Uploaded student work"}
                                          className="max-h-56 object-contain rounded"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Text / Option Response */}
                                {textResponse ? (
                                  <div className="text-slate-700 dark:text-slate-200 break-words bg-slate-50/80 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                                      Candidate Response:
                                    </span>
                                    <p className="font-semibold whitespace-pre-wrap">{textResponse}</p>
                                  </div>
                                ) : (
                                  !linkUrl &&
                                  !fileDataUrl &&
                                  !isLearningResource && (
                                    <p className="text-slate-400 dark:text-slate-500 italic">
                                      No response submitted for this item.
                                    </p>
                                  )
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </section>
          )}

          {/* TAB 3: NATIVE EXAMINATION SETTINGS */}
          {editorTab === "settings" && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      Quiz &amp; Grading Configuration
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure automatic or manual grading, point values, and result release rules.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={makeQuiz}
                    onChange={(e) => setMakeQuiz(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 shrink-0"
                  />
                </div>

                {/* GRADING MODE */}
                <div className="space-y-2.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Grading Mode
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-2.5 text-xs ${
                        gradingMode === "automatic"
                          ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/30"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="gradingMode"
                        checked={gradingMode === "automatic"}
                        onChange={() => setGradingMode("automatic")}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          Automatic Objective Grading
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Automatically score choice &amp; short-answer questions using the answer key.
                        </p>
                      </div>
                    </label>
                    <label
                      className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-2.5 text-xs ${
                        gradingMode === "manual"
                          ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/30"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="gradingMode"
                        checked={gradingMode === "manual"}
                        onChange={() => setGradingMode("manual")}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          Manual Tutor Review
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Hold all submissions for manual marking before scores are finalised.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* RELEASE GRADES */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Release Grades
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="releaseGrades"
                        checked={releaseGradesPolicy === "immediate"}
                        onChange={() => setReleaseGradesPolicy("immediate")}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Immediately after each submission</span>
                    </label>
                    <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="releaseGrades"
                        checked={releaseGradesPolicy === "manual"}
                        onChange={() => setReleaseGradesPolicy("manual")}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Later, after manual review (requires tutor release)</span>
                    </label>
                  </div>
                </div>

                {/* RESPONDENT SETTINGS */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Respondent Visibility
                  </h4>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      <div>
                        <p>Missed questions</p>
                        <p className="text-[11px] text-slate-500 font-normal">
                          Respondents can see which questions were answered incorrectly
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={showMissedQuestions}
                        onChange={(e) => setShowMissedQuestions(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded shrink-0"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      <div>
                        <p>Correct answers</p>
                        <p className="text-[11px] text-slate-500 font-normal">
                          Respondents can see correct answers after grades are released
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={showCorrectAnswers}
                        onChange={(e) => setShowCorrectAnswers(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded shrink-0"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      <div>
                        <p>Point values</p>
                        <p className="text-[11px] text-slate-500 font-normal">
                          Respondents can see total points and points received for each question
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={showPointValues}
                        onChange={(e) => setShowPointValues(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded shrink-0"
                      />
                    </label>
                  </div>
                </div>

                {/* GLOBAL QUIZ DEFAULTS */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Global Quiz Defaults
                  </h4>
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <div>
                      <p>Default question point value</p>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Point values for newly added questions
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={0.5}
                        max={100}
                        value={defaultPointValue}
                        onChange={(e) =>
                          setDefaultPointValue(Math.max(0.5, Number(e.target.value) || 2))
                        }
                        className="w-16 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-center font-bold bg-white dark:bg-slate-900"
                      />
                      <span>points</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Security, Schedule & Presentation */}
              <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Access Security, Schedule &amp; Presentation
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Access Passcode
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={activePasscode}
                        onChange={(e) => setCustomPasscode(e.target.value.toUpperCase())}
                        className="h-10 flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono font-bold uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activePasscode);
                          setMessage("Passcode copied to clipboard.");
                        }}
                        className="px-3 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Available From (Optional)
                    </span>
                    <input
                      type="datetime-local"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                      className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Available Until (Optional)
                    </span>
                    <input
                      type="datetime-local"
                      value={availableUntil}
                      onChange={(e) => setAvailableUntil(e.target.value)}
                      className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                    />
                  </label>
                </div>
                {(availableFrom || availableUntil) && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-500">
                      Note: Setting an &ldquo;Available Until&rdquo; time in the past (e.g. AM instead of PM) will show the assessment as Completed to students.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAvailableFrom("");
                        setAvailableUntil("");
                      }}
                      className="text-xs font-bold text-red-600 hover:underline cursor-pointer shrink-0"
                    >
                      Clear Schedule Dates
                    </button>
                  </div>
                )}

                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <div>
                      <p>Limit to 1 attempt</p>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Enforce single assessment attempt per student record
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={limitOneAttempt}
                      onChange={(e) => setLimitOneAttempt(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <span>Shuffle question order</span>
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <span>Shuffle answer option choices</span>
                    <input
                      type="checkbox"
                      checked={shuffleOptions}
                      onChange={(e) => setShuffleOptions(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded shrink-0"
                    />
                  </label>

                  <div className="pt-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Submission Confirmation Message
                    </span>
                    <input
                      type="text"
                      value={confirmationMessage}
                      onChange={(e) => setConfirmationMessage(e.target.value)}
                      className="w-full mt-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* SECTION: EXISTING EXAMINATIONS MANAGEMENT (FULL DIRECTORY TAB) */}
      {/* ============================================================== */}
      {(editorTab === "directory" || !showLeftDirectoryRail) && (
      <section className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Calendar size={18} className="text-blue-600 shrink-0" />
              Assessments Overview &amp; Active Schedule
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitor current and upcoming assignments, activities, tests, and assessments across your authorised schools and private learners.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={isAdminWorkspace ? "/admin/examination-history" : "/portal/staff/exam-history"}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer flex-1 sm:flex-initial"
            >
              <Clock size={14} /> Assessment History
            </Link>
            <button
              type="button"
              onClick={() => setShowCreateTypeModal(true)}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors cursor-pointer flex-1 sm:flex-initial"
            >
              <PlusCircle size={14} /> Create New Assessment
            </button>
            <button
              type="button"
              disabled={existingBusy}
              onClick={() => void loadExistingExams()}
              className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shadow-xs transition-colors cursor-pointer flex-1 sm:flex-initial"
            >
              <RefreshCw size={14} className={existingBusy ? "animate-spin" : ""} />
              Refresh List
            </button>
          </div>
        </div>

        {/* Clean Programs-style Work Type Category Tabs */}
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 touch-pan-x">
          {(
            [
              { id: "ALL", label: "All Assessments" },
              { id: "ASSIGNMENT", label: "Assignments" },
              { id: "ACTIVITY", label: "Activities" },
              { id: "TEST", label: "Tests" },
              { id: "EXAMINATION", label: "Examinations" },
            ] as const
          ).map((wtTab) => {
            const active = workTypeFilter === wtTab.id;
            const count =
              wtTab.id === "ALL"
                ? existingExams.length
                : existingExams.filter((e) => normalizeWorkType(e.workType, e) === wtTab.id).length;
            return (
              <button
                key={wtTab.id}
                type="button"
                onClick={() => setWorkTypeFilter(wtTab.id)}
                className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? "text-[#14284B] dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <span>{wtTab.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {count}
                </span>
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Summary Counters for Assessment Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Active Now
            </span>
            <span className="mt-1 block text-xl font-black text-emerald-600 dark:text-emerald-400">
              {existingExams.filter((e) => e.status === "active").length}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Upcoming / Scheduled
            </span>
            <span className="mt-1 block text-xl font-black text-blue-600 dark:text-blue-400">
              {existingExams.filter((e) => e.status === "scheduled").length}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Drafts
            </span>
            <span className="mt-1 block text-xl font-black text-amber-600 dark:text-amber-400">
              {existingExams.filter((e) => e.status === "draft").length}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Authorised Schools
            </span>
            <span className="mt-1 block text-xl font-black text-slate-900 dark:text-white">
              {assignedSchools.length}
            </span>
          </div>
        </div>

        {/* Filter Bar: Status Tabs, School Filter & Search */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 dark:bg-slate-900/40 dark:border-slate-800 p-3.5 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "active", "scheduled", "draft", "completed", "archived"] as const).map(
                (tabItem) => (
                  <button
                    key={tabItem}
                    type="button"
                    onClick={() => setLifecycleTab(tabItem)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-colors cursor-pointer ${
                      lifecycleTab === tabItem
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                    }`}
                  >
                    {tabItem}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Filter size={14} className="text-slate-500 shrink-0" />
              <select
                value={managedSchoolFilter}
                onChange={(e) => setManagedSchoolFilter(e.target.value)}
                className="h-9 w-full sm:w-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
              >
                <option value="all">All Authorised Schools</option>
                {assignedSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={examSearchQuery}
              onChange={(e) => setExamSearchQuery(e.target.value)}
              placeholder="Search by assessment title, subject, or partner school..."
              className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 pl-9 pr-3 text-xs bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        {/* Existing Assessments Cards List */}
        <div className="space-y-3">
          {existingBusy ? (
            <ExamListSkeleton count={4} />
          ) : (
            filteredExistingExams.map((ex) => {
            const isExternal = ex.deliveryMode === "EXTERNAL_LINK";
            const itemWorkType = normalizeWorkType(ex.workType, ex);
            return (
              <article
                key={ex.id}
                className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                  editingExamId === ex.id
                    ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] hover:border-slate-300"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-50 text-[#B91C1C] dark:bg-red-950/60 dark:text-red-300">
                        {itemWorkType}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white break-words">
                        {ex.title}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          ex.status === "active"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : ex.status === "scheduled"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {ex.status}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isExternal
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {isExternal ? "External Link / Google Forms" : "Native JDI"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 break-words">
                      {ex.subject} ·{" "}
                      {ex.recipientMode === "PRIVATE_LEARNERS" ? (
                        <strong>Private Learners ({(ex.targetStudentIds || []).length})</strong>
                      ) : (
                        <>
                          <strong>{ex.schoolName}</strong> · Class: <strong>{ex.targetClass}</strong>
                        </>
                      )}
                      {!isExternal && (
                        <>
                          {" "}
                          · {ex.questionCount || 0} Question(s) ·{" "}
                          <strong>
                            {ex.isUngradedActivity && itemWorkType === "ACTIVITY"
                              ? "Ungraded"
                              : `${ex.maxScore || 0} Marks`}
                          </strong>
                        </>
                      )}
                    </p>

                    {ex.passcode && itemWorkType !== "ACTIVITY" && (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                        <span className="text-slate-500">Access Code:</span>
                        <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-bold text-slate-900 dark:text-white">
                          {ex.passcode}
                        </code>
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isExternal ? (
                      ex.externalUrl && (
                        <a
                          href={ex.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-2 text-xs font-bold hover:bg-indigo-100 transition-colors"
                        >
                          <ExternalLink size={14} /> Open External Link
                        </a>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleEditExam(ex, "responses")}
                        className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-3 py-2 text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        <Activity size={14} /> Monitor Responses
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleEditExam(ex)}
                      className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Edit3 size={14} className="text-blue-600" /> Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicateExam(ex)}
                      className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Duplicate Assessment"
                    >
                      <Copy size={14} /> Duplicate
                    </button>

                    {confirmDeleteId === ex.id ? (
                      <div className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 p-1">
                        <span className="text-[11px] font-bold text-red-800 px-1">Delete?</span>
                        <button
                          type="button"
                          disabled={itemActionBusy === ex.id}
                          onClick={() => void handleDeleteExam(ex)}
                          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                        >
                          {itemActionBusy === ex.id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={itemActionBusy === ex.id}
                        onClick={() => setConfirmDeleteId(ex.id)}
                        className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}

        {!existingBusy && filteredExistingExams.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed rounded-2xl">
            No assessments found matching the selected filter.
          </div>
        )}
        </div>
      </section>
      )}
        </div>
      </div>

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
