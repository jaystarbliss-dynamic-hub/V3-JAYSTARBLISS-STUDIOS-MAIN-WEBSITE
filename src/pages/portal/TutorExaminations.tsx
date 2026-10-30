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

type ExistingExamItem = {
  id: string;
  title: string;
  subject: string;
  workType?: AcademicWorkType;
  isUngradedActivity?: boolean;
  submissionFormat?: "QUESTIONS" | "DELIVERABLE";
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
  isPrivate?: boolean;
};

type EditorTab = "questions" | "responses" | "settings";
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
  const [editorTab, setEditorTab] = useState<EditorTab>("questions");
  const [responsesSubTab, setResponsesSubTab] = useState<ResponsesSubTab>("live");
  const [editingExamId, setEditingExamId] = useState<string>("");
  const [showCreateTypeModal, setShowCreateTypeModal] = useState<boolean>(false);
  const [showScheduleSection, setShowScheduleSection] = useState<boolean>(false);
  const creatorTopRef = useRef<HTMLElement | null>(null);

  // Unified Academic Work Type & Recipient State
  const [workType, setWorkType] = useState<AcademicWorkType>(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("type");
    return t ? normalizeWorkType(t) : "EXAMINATION";
  });
  const [isUngradedActivity, setIsUngradedActivity] = useState<boolean>(false);
  const [submissionFormat, setSubmissionFormat] = useState<"QUESTIONS" | "DELIVERABLE">("QUESTIONS");
  const [dueDate, setDueDate] = useState<string>("");
  const [recipientMode, setRecipientMode] = useState<"SCHOOL_CLASS" | "PRIVATE_LEARNERS" | "MULTI_TARGET">("SCHOOL_CLASS");
  const [privateLearners, setPrivateLearners] = useState<EnrolledStudent[]>([]);
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
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
  const [tutorRemarksByAttempt, setTutorRemarksByAttempt] = useState<Record<string, string>>({});
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

  // Computed total marks dynamically from native questions
  const totalExamMarks = useMemo(() => {
    if (deliveryMode === "EXTERNAL_LINK" || (workType === "ACTIVITY" && isUngradedActivity)) return 0;
    return questions.reduce((sum, q) => {
      const pts = Number(q.points ?? defaultPointValue);
      return sum + (Number.isFinite(pts) && pts > 0 ? pts : 1);
    }, 0);
  }, [questions, defaultPointValue, deliveryMode, workType, isUngradedActivity]);

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
    setSubmissionFormat("QUESTIONS");
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
    setEditorTab("questions");
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
        schoolsList.sort((a, b) => a.name.localeCompare(b.name));

        // Load assigned private learners for Private Learner / Multi-target recipient modes
        const [indStudentsSnap, stdStudentsSnap] = await Promise.all([
          getDocs(collection(db, "individualStudents")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "students")).catch(() => ({ docs: [] } as any)),
        ]);
        const privateMap = new Map<string, EnrolledStudent>();
        [...(indStudentsSnap.docs || []), ...(stdStudentsSnap.docs || [])].forEach((d: any) => {
          const st = d.data();
          const tutorMatch =
            isAdmin ||
            [st.tutorId, st.staffId, st.assignedTutorId, st.assignedStaffId, st.instructorId]
              .map((v) => String(v || "").trim())
              .includes(currentUser.uid);
          if (!tutorMatch) return;
          const stClass = normalizeClassName(st.className || st.grade || st.class || "Grade 1");
          privateMap.set(d.id, {
            id: d.id,
            fullName: String(st.fullName || st.name || st.studentName || "Private Learner").trim(),
            class: stClass,
            className: stClass,
            schoolId: String(st.schoolId || "").trim(),
            isPrivate: !st.schoolId || d.ref?.parent?.id === "individualStudents",
          });
        });

        if (isMounted) {
          setPrivateLearners(Array.from(privateMap.values()));
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

  // Question Card Handlers
  const addQuestionCard = (type = "single_choice") => {
    const isTrueFalse = type === "true_false";
    const isChoice = ["single_choice", "multiple_choice", "true_false", "dropdown"].includes(type);
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
      points: defaultPointValue || 2,
      required: true,
      explanation: "",
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

  // Validate native questions before publishing
  const prepareNativeQuestionsForSave = (
    rawList: any[],
    targetStatus: "draft" | "scheduled" | "active"
  ) => {
    if (rawList.length === 0) {
      if (
        targetStatus === "draft" ||
        (workType === "ASSIGNMENT" && submissionFormat === "DELIVERABLE") ||
        workType === "ACTIVITY"
      ) {
        return [];
      }
      throw new Error(
        `Please add or import at least one question before publishing a native ${workType.toLowerCase()}.`
      );
    }

    return rawList.map((q, idx) => {
      const promptText = String(q.prompt || "").trim();
      if (!promptText && targetStatus !== "draft") {
        throw new Error(`Question ${idx + 1} is missing its question prompt.`);
      }
      const isChoice = ["single_choice", "multiple_choice", "true_false", "dropdown"].includes(
        q.type
      );
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

      return {
        ...q,
        id: q.id || makeId(),
        prompt: promptText || `Untitled Question ${idx + 1}`,
        options: isChoice ? cleanOpts : [],
        points:
          workType === "ACTIVITY" && isUngradedActivity
            ? 0
            : Math.max(0.5, Number(q.points ?? defaultPointValue) || 1),
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
          ? preparedQuestions.reduce((sum, q) => sum + (Number(q.points) || 1), 0)
          : 0;

      const examPayload: Record<string, any> = {
        id: targetExamId,
        title: title.trim(),
        description: description.trim(),
        instructions: description.trim(),
        subject: subject.trim(),
        workType,
        isUngradedActivity: isUngraded,
        submissionFormat: workType === "ASSIGNMENT" ? submissionFormat : "QUESTIONS",
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
        gradingMode: deliveryMode === "NATIVE" ? gradingMode : "automatic",
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
      }

      setEditingExamId(targetExamId);
      setCustomPasscode(finalPasscode);
      setGeneratedPasscode(finalPasscode);
      setStatus(targetStatus);
      if (deliveryMode === "NATIVE" && preparedQuestions.length > 0) {
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
  const handleEditExam = (exam: ExistingExamItem, initialTab: EditorTab = "questions") => {
    const resolvedMode = normalizeDeliveryMode(exam.deliveryMode, exam);
    const resolvedWorkType = normalizeWorkType(exam.workType, exam);
    setEditingExamId(exam.id);
    setWorkType(resolvedWorkType);
    setIsUngradedActivity(Boolean(exam.isUngradedActivity));
    setSubmissionFormat(exam.submissionFormat === "DELIVERABLE" ? "DELIVERABLE" : "QUESTIONS");
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
    setEditorTab("questions");
    setErrorMessage("");
    setMessage(`Duplicated "${exam.title}" into a new draft.`);
    scrollToCreatorTop();
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
      className="dashboard-interface mx-auto w-full max-w-6xl space-y-5 px-3 sm:px-5 pb-20 text-slate-900 dark:text-slate-100 overflow-x-hidden"
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
      {/* TOP WORKSPACE BAR & CREATE NEW ASSESSMENT BUTTON               */}
      {/* ============================================================== */}
      <header className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Workspace Title & Active Mode */}
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              {deliveryMode === "EXTERNAL_LINK" ? <Link2 size={20} /> : <FileText size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-black text-base sm:text-lg text-slate-900 dark:text-white truncate">
                  {editingExamId
                    ? `Editing ${workType.toLowerCase()}: ${title || "Untitled"}`
                    : title || `Create New ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
                </h2>
                <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-md bg-red-50 text-[#B91C1C] dark:bg-red-950/60 dark:text-red-300 shrink-0">
                  {workType}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-md shrink-0 ${
                    deliveryMode === "EXTERNAL_LINK"
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                      : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                  }`}
                >
                  {deliveryMode === "EXTERNAL_LINK"
                    ? "External Link / Google Forms"
                    : "Native Jaystarbliss Editor"}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {recipientMode === "PRIVATE_LEARNERS"
                  ? `Private Learners (${targetStudentIds.length} selected)`
                  : `${assignedSchools.find((s) => s.id === schoolId)?.name || "Select School"} · ${selectedClass}`}
                {deliveryMode === "NATIVE"
                  ? isUngradedActivity && workType === "ACTIVITY"
                    ? ` · ${questions.length} Item(s) · Ungraded Activity`
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
              className="min-h-[42px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 px-4 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
            >
              <PlusCircle size={15} /> Create New Assessment
            </button>

            <Link
              to={isAdminWorkspace ? "/admin/examination-history" : "/portal/staff/exam-history"}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Clock size={15} />
              <span>History</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowHeaderCustomizer(true)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
              title="Official Document Header Customizer"
            >
              <LayoutTemplate size={15} />
              <span className="hidden sm:inline">Document Header Customizer</span>
            </button>

            {deliveryMode === "NATIVE" && (
              <button
                type="button"
                onClick={() => setShowPreview((prev) => !prev)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                title="Preview Assessment"
              >
                <Eye size={15} />
                <span className="hidden sm:inline">{showPreview ? "Hide Preview" : "Preview"}</span>
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveOrPublish("draft")}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 flex-1 sm:flex-initial"
            >
              Save Draft
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveOrPublish("active")}
              className="min-h-[42px] rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer text-xs w-full sm:w-auto"
            >
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {editingExamId
                ? "Update & Republish"
                : `Publish ${workType.charAt(0) + workType.slice(1).toLowerCase()}`}
            </button>
          </div>
        </div>

        {/* Clean Work Type Selector (Assignment, Activity, Test, Examination) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-5 overflow-x-auto no-scrollbar touch-pan-x">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
              Work Type:
            </span>
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
                  className={`relative pb-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? "text-[#14284B] dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {wt.label}
                  {active && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Work-type specific quick toggles */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {workType === "ACTIVITY" && (
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isUngradedActivity}
                  onChange={(e) => setIsUngradedActivity(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Ungraded formative activity (no formal score)</span>
              </label>
            )}
            {workType === "ASSIGNMENT" && deliveryMode === "NATIVE" && (
              <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSubmissionFormat("QUESTIONS")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    submissionFormat === "QUESTIONS"
                      ? "bg-white dark:bg-slate-900 text-blue-600 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Question-Based
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionFormat("DELIVERABLE")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    submissionFormat === "DELIVERABLE"
                      ? "bg-white dark:bg-slate-900 text-blue-600 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Deliverable / Submission
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Authorised Recipient Audience Mode Selector */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Authorised Audience / Recipient Selection:
            </span>
            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              {(
                [
                  { id: "SCHOOL_CLASS", label: "School & Class/Grade" },
                  { id: "PRIVATE_LEARNERS", label: "Private Learner(s)" },
                  { id: "MULTI_TARGET", label: "School Class + Private Learners" },
                ] as const
              ).map((rm) => (
                <button
                  key={rm.id}
                  type="button"
                  onClick={() => setRecipientMode(rm.id)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
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

          {(recipientMode === "PRIVATE_LEARNERS" || recipientMode === "MULTI_TARGET") && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Select Authorised Private Learners ({targetStudentIds.length} selected)
                </span>
                {privateLearners.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setTargetStudentIds(
                        targetStudentIds.length === privateLearners.length
                          ? []
                          : privateLearners.map((p) => p.id)
                      )
                    }
                    className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    {targetStudentIds.length === privateLearners.length ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>
              {privateLearners.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No individually assigned learners found for your tutor account.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {privateLearners.map((pl) => {
                    const checked = targetStudentIds.includes(pl.id);
                    return (
                      <label
                        key={pl.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${
                          checked
                            ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200 font-semibold"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setTargetStudentIds((prev) =>
                              prev.includes(pl.id)
                                ? prev.filter((id) => id !== pl.id)
                                : [...prev, pl.id]
                            )
                          }
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>{pl.fullName}</span>
                        <span className="text-[10px] text-slate-400">({pl.class})</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Examination Type Switcher (Preserves work & editingExamId when switching) */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full lg:max-w-2xl">
            <button
              type="button"
              onClick={() => handleSelectDeliveryMode("EXTERNAL_LINK")}
              className={`min-h-[52px] p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                deliveryMode === "EXTERNAL_LINK"
                  ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-2xs"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-slate-50/40 dark:bg-slate-900/30"
              }`}
            >
              <ExternalLink
                size={18}
                className={
                  deliveryMode === "EXTERNAL_LINK" ? "text-blue-600 shrink-0 mt-0.5" : "text-slate-400 shrink-0 mt-0.5"
                }
              />
              <div className="min-w-0">
                <p className="font-bold text-xs">External Link / Google Forms</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  Direct students via access code to an external form URL
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectDeliveryMode("NATIVE")}
              className={`min-h-[52px] p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                deliveryMode === "NATIVE"
                  ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-2xs"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-slate-50/40 dark:bg-slate-900/30"
              }`}
            >
              <Layers
                size={18}
                className={
                  deliveryMode === "NATIVE" ? "text-blue-600 shrink-0 mt-0.5" : "text-slate-400 shrink-0 mt-0.5"
                }
              />
              <div className="min-w-0">
                <p className="font-bold text-xs">Native Jaystarbliss Assessment</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  Full question builder, grading, timer &amp; live proctor
                </p>
              </div>
            </button>
          </div>

          {/* Center Tabs: Shown ONLY for Native Jaystarbliss Assessment */}
          {deliveryMode === "NATIVE" && (
            <nav
              aria-label="Native assessment sections"
              className="grid grid-cols-3 sm:inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-full sm:w-auto shrink-0"
            >
              <button
                type="button"
                onClick={() => setEditorTab("questions")}
                className={`min-h-[38px] px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  editorTab === "questions"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <FileText size={14} className="shrink-0" />
                <span>Questions</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("responses")}
                className={`min-h-[38px] px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  editorTab === "responses"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <Users size={14} className="shrink-0" />
                <span>Responses</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  {examAttempts.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("settings")}
                className={`min-h-[38px] px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  editorTab === "settings"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <SettingsIcon size={14} className="shrink-0" />
                <span>Settings</span>
              </button>
            </nav>
          )}
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
          {/* STUDENT PREVIEW PANEL */}
          {showPreview && (
            <section className="rounded-2xl border-2 border-blue-500/40 bg-blue-50/30 dark:bg-slate-900/70 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-blue-200 dark:border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    Student Preview Mode
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
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold bg-white dark:bg-slate-800"
                >
                  Close Preview
                </button>
              </div>

              {questions.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No questions added yet. Add or import questions below to preview them.
                </p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {idx + 1}. {q.prompt || "Untitled Question"}
                        </p>
                        <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 shrink-0">
                          {q.points || defaultPointValue} pt(s)
                        </span>
                      </div>
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
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* TAB 1: QUESTIONS AUTHORING CANVAS */}
          {editorTab === "questions" && (
            <section className="space-y-4">
              {/* Main Examination Metadata Card */}
              <div className="rounded-2xl border-t-8 border-t-blue-600 border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      {workType.charAt(0) + workType.slice(1).toLowerCase()} Title *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`Enter ${workType.toLowerCase()} title (e.g. Grade 4 Coding & Robotics ${workType.charAt(0) + workType.slice(1).toLowerCase()})`}
                      className="w-full text-base sm:text-xl font-black text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 focus:outline-none focus:border-blue-600 bg-transparent"
                    />
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={`${workType.charAt(0) + workType.slice(1).toLowerCase()} description or student instructions (optional)`}
                    rows={2}
                    className="w-full text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:border-blue-600 resize-none bg-slate-50/50 dark:bg-slate-900/40"
                  />
                </div>

                {/* Core assignment controls */}
                <div className={`grid grid-cols-1 ${recipientMode === "PRIVATE_LEARNERS" ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-5"} gap-3 pt-1`}>
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
                      placeholder="e.g. Digital Literacy"
                      className="w-full mt-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                    />
                  </label>

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
                      Access Code *
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
                        className="h-11 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                        title="Copy Access Code"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              {/* Quick Action Toolbar (Add question, Import questions) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addQuestionCard("single_choice")}
                    className="min-h-[42px] flex-1 sm:flex-initial rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus size={15} /> Add Question
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="min-h-[42px] flex-1 sm:flex-initial rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 text-xs font-bold hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload size={14} className="text-blue-600" /> Import Questions
                  </button>
                </div>
                <div className="text-xs font-semibold text-slate-500 text-center sm:text-right">
                  {questions.length} Question(s) ·{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {totalExamMarks} Total Marks
                  </strong>
                </div>
              </div>

              {/* Empty State when no questions have been added yet */}
              {questions.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] p-8 sm:p-10 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                    <FileText size={24} />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      This assessment has no questions yet
                    </h3>
                    <p className="text-xs text-slate-500">
                      Start building your native assessment by adding questions one by one or importing formatted questions from text or CSV.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-1 max-w-md mx-auto">
                    <button
                      type="button"
                      onClick={() => addQuestionCard("single_choice")}
                      className="min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Plus size={15} /> Add First Question
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowImportModal(true)}
                      className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-5 py-2.5 text-xs font-bold hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={14} className="text-blue-600" /> Import Questions
                    </button>
                  </div>
                </div>
              ) : (
                /* Question Cards List */
                <div className="space-y-4">
                  {questions.map((q, qIdx) => (
                    <article
                      key={q.id || qIdx}
                      className="group relative rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#161B26] p-4 sm:p-6 shadow-xs hover:border-blue-400 dark:hover:border-blue-600 transition-all space-y-4"
                    >
                      {/* Question Top Row: Prompt Input & Question Type */}
                      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                        <div className="flex items-start sm:items-center gap-2 w-full sm:flex-1">
                          <span className="font-bold text-sm text-slate-400 w-6 shrink-0 pt-2 sm:pt-0">
                            {qIdx + 1}.
                          </span>
                          <input
                            type="text"
                            value={q.prompt || ""}
                            onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
                            placeholder={`Enter question ${qIdx + 1} prompt...`}
                            className="w-full text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-1.5 focus:outline-none focus:border-blue-600 bg-transparent"
                          />
                        </div>

                        {/* Question Type Selector */}
                        <select
                          value={q.type || "single_choice"}
                          onChange={(e) => updateQuestion(qIdx, { type: e.target.value })}
                          className="h-10 w-full sm:w-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0"
                        >
                          <option value="single_choice">Multiple Choice</option>
                          <option value="multiple_choice">Checkboxes (Multi-Select)</option>
                          <option value="true_false">True / False</option>
                          <option value="short_answer">Short Answer</option>
                          <option value="essay">Paragraph / Long Answer</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                      </div>

                      {/* Options List (for Multiple Choice / Checkbox / True-False / Dropdown) */}
                      {["single_choice", "multiple_choice", "true_false", "dropdown"].includes(
                        q.type
                      ) && (
                        <div className="space-y-2.5 pl-0 sm:pl-6">
                          <p className="text-[11px] text-slate-500">
                            Tap the letter badge to mark the correct answer key:
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

                      {/* Short Answer Accepted Answers */}
                      {q.type === "short_answer" && (
                        <div className="pl-0 sm:pl-6 space-y-2">
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

                      {/* Paragraph / Essay notice */}
                      {q.type === "essay" && (
                        <div className="pl-0 sm:pl-6 py-1">
                          <p className="text-xs italic text-slate-400 border-b border-dashed border-slate-300 dark:border-slate-700 pb-1">
                            Long paragraph response text area provided to student (graded manually).
                          </p>
                        </div>
                      )}

                      {/* Card Bottom Bar: Points, Answer key badge, Duplicate, Delete, Required */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div className="flex flex-wrap items-center gap-2.5">
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
                            Key:{" "}
                            {["single_choice", "multiple_choice", "true_false", "dropdown"].includes(
                              q.type
                            ) &&
                            Array.isArray(q.correctOptionIds) &&
                            q.correctOptionIds.length
                              ? q.correctOptionIds.join(", ")
                              : q.type === "short_answer" &&
                                Array.isArray(q.acceptedAnswers) &&
                                q.acceptedAnswers.length
                              ? q.acceptedAnswers.join(" | ")
                              : "Manual"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => duplicateQuestion(qIdx)}
                            className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Duplicate Question"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteQuestion(qIdx)}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Delete Question"
                          >
                            <Trash2 size={16} />
                          </button>
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
                        </div>
                      </div>
                    </article>
                  ))}
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

              {/* 4. INDIVIDUAL STUDENT RESPONSES VIEW */}
              {responsesSubTab === "individual" && (
                <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-[#161B26] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-full sm:w-auto">
                      <select
                        value={selectedAttemptId || examAttempts[0]?.id || ""}
                        onChange={(e) => setSelectedAttemptId(e.target.value)}
                        className="h-10 w-full sm:w-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                      >
                        {examAttempts.map((at, i) => (
                          <option key={at.id} value={at.id}>
                            {i + 1}. {at.studentName} ({at.score ?? 0}/
                            {at.maxScore ?? totalExamMarks})
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
                        <button
                          type="button"
                          disabled={releasingResultId === targetAttempt.id}
                          onClick={() => void handleReleaseResult(targetAttempt)}
                          className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors shadow-xs cursor-pointer ${
                            targetAttempt.resultReleased
                              ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                        >
                          {targetAttempt.resultReleased
                            ? "Unrelease Result"
                            : "Release Result to Student & Parent"}
                        </button>
                      );
                    })()}
                  </div>

                  {(() => {
                    const targetAttempt = examAttempts.find(
                      (a) => a.id === (selectedAttemptId || examAttempts[0]?.id)
                    );
                    if (!targetAttempt) {
                      return (
                        <div className="py-8 text-center text-xs text-slate-500">
                          No attempts available to display for this assessment.
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4 text-xs">
                          <div>
                            <p className="font-bold text-sm text-slate-900 dark:text-white">
                              {targetAttempt.studentName}
                            </p>
                            <p className="text-slate-500">
                              {targetAttempt.className} · {targetAttempt.schoolName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg text-blue-600 dark:text-blue-400">
                              {targetAttempt.score ?? 0} /{" "}
                              {targetAttempt.maxScore ?? totalExamMarks}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {targetAttempt.percentage ?? 0}% achieved
                            </p>
                          </div>
                        </div>

                        {/* Tutor Remark Selection & Custom Input Panel before/during Result Release */}
                        <div className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <MessageSquare size={15} className="text-blue-600 dark:text-blue-400" />
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                Official Tutor Remark (Select a Preset or Write Your Own Remark)
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
                              placeholder="Select a preset remark above or type your personalized tutor remark to go out with the student's result..."
                              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-500">
                                This remark is included in the student&apos;s result portal and official PDF transcript.
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={savingRemarkId === targetAttempt.id}
                                  onClick={() => void handleSaveTutorRemark(targetAttempt)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                                >
                                  {savingRemarkId === targetAttempt.id
                                    ? "Saving Remark..."
                                    : "Save Remark Only"}
                                </button>
                                {!targetAttempt.resultReleased && (
                                  <button
                                    type="button"
                                    disabled={releasingResultId === targetAttempt.id}
                                    onClick={() => void handleReleaseResult(targetAttempt)}
                                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                                  >
                                    {releasingResultId === targetAttempt.id
                                      ? "Releasing..."
                                      : "Release Result with Remark"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {questions.map((q, idx) => {
                            const userAns =
                              targetAttempt.answers?.[q.id] ||
                              targetAttempt.answers?.[String(idx + 1)];
                            const isCorrect =
                              Array.isArray(q.correctOptionIds) &&
                              q.correctOptionIds.length &&
                              (Array.isArray(userAns) ? userAns : [userAns]).every((opt: any) =>
                                q.correctOptionIds.includes(opt)
                              );

                            return (
                              <div
                                key={q.id || idx}
                                className={`p-4 rounded-xl border text-xs space-y-2 ${
                                  isCorrect
                                    ? "border-emerald-200 bg-emerald-50/20"
                                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {idx + 1}. {q.prompt}
                                  </span>
                                  <span className="font-bold text-slate-500 shrink-0">
                                    {q.points || 1} pts
                                  </span>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 break-words">
                                  Candidate Response:{" "}
                                  <strong>
                                    {Array.isArray(userAns)
                                      ? userAns.join(", ")
                                      : String(userAns || "No response")}
                                  </strong>
                                </p>
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
      {/* SECTION: EXISTING EXAMINATIONS MANAGEMENT (LIFECYCLE & ROSTER) */}
      {/* ============================================================== */}
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
