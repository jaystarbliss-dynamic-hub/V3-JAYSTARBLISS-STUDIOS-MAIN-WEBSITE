import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { auth, db, getClientDatabases } from "../../lib/firebase";
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
  serverTimestamp,
} from "firebase/firestore";
import { parseExamScript } from "../../modules/examinations/parseExamScript";
import {
  CANONICAL_CLASSES,
  normalizeClassName,
  normalizeClassList,
  classesMatch,
  canAuthorOrMutateExam,
  canManageExamRecord,
  resolvePartnerSchoolName,
  computeExamMaxScore,
} from "../../lib/classes";
import {
  School,
  GraduationCap,
  ClipboardPaste,
  BookOpen,
  KeyRound,
  Check,
  ArrowRight,
  Eye,
  AlertCircle,
  Edit3,
  Trash2,
  PlusCircle,
  RefreshCw,
  Calendar,
  Filter,
} from "lucide-react";

type ExistingExamItem = {
  id: string;
  title: string;
  subject: string;
  status: string;
  schoolId?: string;
  schoolName?: string;
  targetClass?: string;
  className?: string;
  classIds?: string[];
  durationMinutes?: number;
  gradingMode?: "automatic" | "manual";
  passcode?: string;
  availableFrom?: string | null;
  availableUntil?: string | null;
  questions?: any[];
  questionCount?: number;
  maxScore?: number;
  createdBy?: string;
  tutorId?: string;
  updatedAt?: any;
};

function formatQuestionsToScript(questions: any[]): string {
  if (!Array.isArray(questions) || questions.length === 0) return "";
  const lines: string[] = [];
  const answerLines: string[] = [];

  questions.forEach((q, idx) => {
    const num = idx + 1;
    const pts = Number(q.points ?? 1) || 1;
    const marksSuffix = pts !== 1 ? ` [${pts} marks]` : "";
    lines.push(`${num}. ${q.prompt || ""}${marksSuffix}`);
    if (Array.isArray(q.options) && q.options.length > 0) {
      q.options.forEach((opt: any) => {
        lines.push(`${opt.id}. ${opt.text}`);
      });
    }
    lines.push("");

    if (Array.isArray(q.correctOptionIds) && q.correctOptionIds.length > 0) {
      answerLines.push(`${num}. ${q.correctOptionIds.join(", ")}`);
    } else if (Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 0) {
      answerLines.push(`${num}. ${q.acceptedAnswers.join(" | ")}`);
    }
  });

  if (answerLines.length > 0) {
    lines.push("ANSWER KEY");
    lines.push(...answerLines);
  }

  return lines.join("\n").trim();
}

export default function TutorExaminations() {
  const location = useLocation();
  const isAdminWorkspace = location.pathname.startsWith("/admin/");

  // User Role & Permission state
  const [userRole, setUserRole] = useState<string>("");
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean>(isAdminWorkspace);

  // Core metadata
  const [editingExamId, setEditingExamId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [learningVideoUrl, setLearningVideoUrl] = useState("");

  // School & Class Dropdown State
  const [assignedSchools, setAssignedSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [availableClasses, setAvailableClasses] = useState<string[]>([...CANONICAL_CLASSES]);
  const [selectedClass, setSelectedClass] = useState<string>(CANONICAL_CLASSES[1]); // Grade 1 default
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  // Exam parameters
  const [duration, setDuration] = useState(30);
  const [raw, setRaw] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [scriptWarnings, setScriptWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedExamId, setSavedExamId] = useState("");
  const [generatedPasscode, setGeneratedPasscode] = useState("");
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  const [status, setStatus] = useState<"draft" | "scheduled" | "active">("active");
  const [customPasscode, setCustomPasscode] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [gradingMode, setGradingMode] = useState<"automatic" | "manual">("automatic");
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Existing exams lifecycle & school filter state
  const creatorTopRef = useRef<HTMLElement | null>(null);
  const [existingExams, setExistingExams] = useState<ExistingExamItem[]>([]);
  const [existingBusy, setExistingBusy] = useState(false);
  const [lifecycleTab, setLifecycleTab] = useState<
    "all" | "draft" | "scheduled" | "active" | "completed" | "archived"
  >("all");
  const [managedSchoolFilter, setManagedSchoolFilter] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [itemActionBusy, setItemActionBusy] = useState<string | null>(null);

  // Total marks computed dynamically from question points
  const totalExamMarks = useMemo(
    () =>
      questions.reduce((sum, q) => {
        const pts = Number(q.points ?? 1);
        return sum + (Number.isFinite(pts) && pts > 0 ? pts : 1);
      }, 0),
    [questions]
  );

  // 1. Load Schools strictly assigned to this Tutor / Admin
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
          userData.role || sessionStorage.getItem("userRole") || (isAdminWorkspace ? "ADMIN" : "TUTOR")
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

        const allSchoolsSnap = await getDocs(collection(db, "schools")).catch(
          () => ({ docs: [] } as any)
        );
        const schoolsList: { id: string; name: string }[] = [];

        allSchoolsSnap.docs?.forEach((d: any) => {
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
                      typeof x === "string" ? x : x?.id || x?.uid || x?.staffId || x?.userId
                    )
                    .filter(Boolean)
                : [];

            const tutorsArr = extractIds(s.tutors);
            const assignedTutors = extractIds(s.assignedTutors);
            const assignedTutorIds = extractIds(s.assignedTutorIds);
            const assignedStaff = extractIds(s.assignedStaff);
            const staffIds = extractIds(s.staffIds);
            const tutorIds = extractIds(s.tutorIds);

            if (
              directSchoolIds.has(sId) ||
              (sCode && directSchoolIds.has(sCode)) ||
              tutorsArr.includes(currentUser.uid) ||
              assignedTutors.includes(currentUser.uid) ||
              assignedTutorIds.includes(currentUser.uid) ||
              assignedStaff.includes(currentUser.uid) ||
              staffIds.includes(currentUser.uid) ||
              tutorIds.includes(currentUser.uid) ||
              s.tutorId === currentUser.uid ||
              s.staffId === currentUser.uid
            ) {
              schoolsList.push({ id: sId, name: sName });
            }
          }
        });

        if (isMounted) {
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

  // 2. Load canonical classes for selected school
  useEffect(() => {
    const classSet = new Set<string>(CANONICAL_CLASSES);
    setAvailableClasses(Array.from(classSet));
    if (!selectedClass) {
      setSelectedClass(CANONICAL_CLASSES[1]);
    }
  }, [schoolId]);

  // 3. Load Tutor's Existing Examinations
  const loadExistingExams = async () => {
    setExistingBusy(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      let loaded: ExistingExamItem[] = [];
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch("/.netlify/functions/tutor-examinations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (Array.isArray(data.exams)) {
            loaded = data.exams;
          }
        }
      } catch (err) {
        console.warn("Server tutor-examinations notice, using Firestore fallback:", err);
      }

      if (loaded.length === 0) {
        const assignedIds = new Set(assignedSchools.map((s) => s.id));
        const schoolNameById = new Map(assignedSchools.map((s) => [s.id, s.name]));
        const [jdiSnap, schSnap] = await Promise.all([
          getDocs(collection(db, "jdiExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "schoolExams")).catch(() => ({ docs: [] } as any)),
        ]);

        const map = new Map<string, ExistingExamItem>();
        [...jdiSnap.docs, ...schSnap.docs].forEach((d: any) => {
          const data = d.data();
          const canManage = canManageExamRecord({
            uid: currentUser.uid,
            role: userRole || (isAdminWorkspace ? "ADMIN" : "TUTOR"),
            exam: data,
            assignedSchoolIds: Array.from(assignedIds),
          });
          if (!canManage) return;

          const sId = String(data.schoolId || "");
          const resolvedSchoolName = resolvePartnerSchoolName(
            schoolNameById.get(sId),
            data.schoolName,
            "Assigned Partner School"
          );
          const qList = Array.isArray(data.questions) ? data.questions : [];
          const maxScore = computeExamMaxScore(data);
          map.set(d.id, {
            id: d.id,
            title: data.title || "Untitled Examination",
            subject: data.subject || "General",
            status: data.status || "draft",
            schoolId: sId,
            schoolName: resolvedSchoolName,
            targetClass: normalizeClassName(data.targetClass || data.className || "") || data.targetClass || "all",
            className: normalizeClassName(data.className || data.targetClass || "") || data.className || "all",
            classIds: normalizeClassList(data.classIds || [data.targetClass || data.className || "all"]),
            durationMinutes: Number(data.durationMinutes) || 30,
            gradingMode: data.gradingMode || "automatic",
            passcode: data.passcode || "",
            availableFrom: data.availableFrom || null,
            availableUntil: data.availableUntil || null,
            questions: qList,
            questionCount: qList.length,
            maxScore,
            createdBy: data.createdBy,
            tutorId: data.tutorId,
            updatedAt: data.updatedAt || data.createdAt,
          });
        });

        loaded = Array.from(map.values());
      }

      setExistingExams(loaded);
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

  // Parse Exam Script
  const parseScript = () => {
    const parsed = parseExamScript(raw);
    const issues: string[] = [];
    const questionSection = raw.split(/^\s*(answer\s*key|answers)\s*(?::|-)?/im)[0];
    const numbers = Array.from(questionSection.matchAll(/^\s*(\d+)[.)]\s+/gm), (m) => Number(m[1]));

    if (!raw.trim()) issues.push("Paste the questions and answer key before parsing.");
    if (!numbers.length)
      issues.push("Start each question with a number, for example: 1. What is 2 + 2?");

    const seen = new Set<number>();
    numbers.forEach((n, index) => {
      if (seen.has(n)) issues.push(`Question number ${n} is repeated.`);
      seen.add(n);
      if (n !== index + 1)
        issues.push(
          `Use consecutive question numbers starting at 1; found ${n} at position ${index + 1}.`
        );
    });

    if (numbers.length && !/^\s*(answer\s*key|answers)\s*(?::|-)?/im.test(raw)) {
      issues.push("Add an ANSWER KEY section after all questions.");
    }

    parsed.forEach((q, i) => {
      if (!q.prompt.trim()) issues.push(`Question ${i + 1} needs question text.`);
      if (
        ["single_choice", "multiple_choice", "true_false"].includes(q.type) &&
        (!q.options || q.options.length < 2)
      ) {
        issues.push(`Question ${i + 1} needs at least two options.`);
      }
      if (
        ["single_choice", "multiple_choice", "true_false"].includes(q.type) &&
        !q.correctOptionIds?.length
      ) {
        issues.push(
          `Question ${i + 1} has no valid answer-key entry. Check option letter and question number.`
        );
      }
      if (q.type === "single_choice" && q.correctOptionIds && q.correctOptionIds.length !== 1) {
        issues.push(`Question ${i + 1} must have exactly one correct option.`);
      }
    });

    setQuestions(parsed);
    setScriptWarnings([...new Set(issues)]);
  };

  const updateQuestionPoints = (index: number, newPoints: number) => {
    const safePoints = Number.isFinite(newPoints) && newPoints >= 0.5 ? newPoints : 1;
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === index ? { ...q, points: safePoints } : q))
    );
  };

  const scriptTemplate = `1. What is the shortcut key to copy text on a computer? [1 mark]
A. Ctrl + C
B. Ctrl + V
C. Ctrl + P
D. Ctrl + X

2. Which of the following is an input device? [1 mark]
A. Monitor
B. Keyboard
C. Speaker
D. Printer

3. Hardware refers to the physical parts of a computer system. [1 mark]
A. True
B. False

ANSWER KEY
1. A
2. B
3. A`;

  // Compute SHA-256 for passcode
  const computeHash = async (val: string) => {
    try {
      const msgBuffer = new TextEncoder().encode(val.trim());
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      return val.toLowerCase();
    }
  };

  const scrollToCreatorTop = () => {
    const performScroll = () => {
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
    performScroll();
    setTimeout(performScroll, 60);
  };

  // Load an existing exam into the editor for idempotent update/republish
  const handleEditExam = (exam: ExistingExamItem) => {
    setEditingExamId(exam.id);
    setSavedExamId(exam.id);
    setTitle(exam.title || "");
    setSubject(exam.subject || "");
    if (exam.schoolId) setSchoolId(exam.schoolId);
    const normClass =
      exam.targetClass === "all" || exam.classIds?.includes("all")
        ? "all"
        : normalizeClassName(exam.targetClass || exam.className || exam.classIds?.[0] || "") ||
          CANONICAL_CLASSES[1];
    setSelectedClass(normClass);
    setDuration(Number(exam.durationMinutes) || 30);
    setGradingMode(exam.gradingMode || "automatic");
    setStatus(
      exam.status === "draft" || exam.status === "scheduled" || exam.status === "active"
        ? exam.status
        : "active"
    );
    setCustomPasscode(exam.passcode || "");
    setGeneratedPasscode(exam.passcode || "");
    setAvailableFrom(exam.availableFrom ? exam.availableFrom.slice(0, 16) : "");
    setAvailableUntil(exam.availableUntil ? exam.availableUntil.slice(0, 16) : "");
    const qList = Array.isArray(exam.questions) ? exam.questions : [];
    setQuestions(qList);
    setRaw(formatQuestionsToScript(qList));
    setScriptWarnings([]);
    setErrorMessage("");
    setMessage(`Editing "${exam.title}". Any changes will update this examination directly.`);
    scrollToCreatorTop();
  };

  const resetFormForNewExam = () => {
    setEditingExamId("");
    setSavedExamId("");
    setTitle("");
    setSubject("");
    setSeriesName("");
    setCourseName("");
    setLearningVideoUrl("");
    setDuration(30);
    setRaw("");
    setQuestions([]);
    setScriptWarnings([]);
    setCustomPasscode("");
    setGeneratedPasscode("");
    setAvailableFrom("");
    setAvailableUntil("");
    setStatus("active");
    setErrorMessage("");
    setMessage("");
  };

  // Delete an Existing Exam cleanly across server and client Firestore databases
  const handleDeleteOrArchiveExam = async (exam: ExistingExamItem) => {
    setItemActionBusy(exam.id);
    setConfirmDeleteId(null);
    setErrorMessage("");
    setMessage("");
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in again.");

      try {
        const token = await currentUser.getIdToken();
        const res = await fetch("/.netlify/functions/jdi-exam-management", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ examId: exam.id, action: "delete", forceDelete: true }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 403) {
            throw new Error(errData.error || "You do not have permission to delete this examination.");
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("permission")) throw e;
        console.warn("Server exam delete notice, using Firestore fallback:", e);
      }

      // Always ensure the examination document is removed from both jdiExams and schoolExams across client databases
      for (const dbInstance of getClientDatabases()) {
        await Promise.all([
          deleteDoc(doc(dbInstance, "jdiExams", exam.id)).catch(() => undefined),
          deleteDoc(doc(dbInstance, "schoolExams", exam.id)).catch(() => undefined),
        ]);
      }

      if (editingExamId === exam.id) {
        resetFormForNewExam();
      }
      setExistingExams((prev) => prev.filter((item) => item.id !== exam.id));
      setMessage(`"${exam.title}" was deleted permanently.`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Could not delete examination.");
    } finally {
      setItemActionBusy(null);
    }
  };

  // Save or Update Examination (Idempotent by editingExamId || savedExamId)
  const save = async (overrideStatus?: "draft" | "scheduled" | "active") => {
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      if (!auth.currentUser) throw new Error("Please sign in to your tutor account.");
      if (userRole && !canAuthorOrMutateExam(userRole)) {
        throw new Error("School administrators cannot create or modify examinations.");
      }
      if (!title.trim()) throw new Error("Please enter an examination title.");
      if (!subject.trim()) throw new Error("Please enter an examination subject.");
      if (!schoolId) throw new Error("Please select an assigned school.");
      if (!selectedClass) throw new Error("Please select a target class.");
      if (!questions.length)
        throw new Error("Please paste and parse the examination questions before saving.");

      const selectedSchoolObj = assignedSchools.find((s) => s.id === schoolId);
      const schoolName = resolvePartnerSchoolName(
        selectedSchoolObj?.name,
        "Assigned Partner School"
      );

      const effectiveStatus = overrideStatus || status;
      const finalPasscode =
        customPasscode.trim() ||
        generatedPasscode.trim() ||
        `JDI-${Math.floor(100000 + Math.random() * 900000)}`;
      const passcodeHash = await computeHash(finalPasscode);

      // IDEMPOTENT EXAM ID: reuse editingExamId or savedExamId if already created/loaded
      const targetExamId =
        editingExamId ||
        savedExamId ||
        `exam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const isUpdatingExisting = Boolean(editingExamId || savedExamId);

      const normalizedClass =
        selectedClass === "all" ? "all" : normalizeClassName(selectedClass) || selectedClass;
      const targetClassList = normalizedClass === "all" ? ["all"] : [normalizedClass];

      const sanitizedQuestions = questions.map((q, index) => ({
        ...q,
        id: q.id || `q_${index + 1}`,
        points: Math.max(0.5, Number(q.points ?? 1) || 1),
      }));
      const computedMaxScore = sanitizedQuestions.reduce(
        (sum, q) => sum + Math.max(0.5, Number(q.points ?? 1) || 1),
        0
      );

      const examPayload: Record<string, any> = {
        examId: targetExamId,
        id: targetExamId,
        title: title.trim(),
        subject: subject.trim(),
        seriesName: seriesName.trim() || null,
        courseName: courseName.trim() || null,
        learningVideoUrl: learningVideoUrl.trim() || null,
        schoolId,
        schoolName,
        targetClass: normalizedClass,
        className: normalizedClass,
        classIds: targetClassList,
        audienceType: "school",
        durationMinutes: Number(duration) || 30,
        questions: sanitizedQuestions,
        questionCount: sanitizedQuestions.length,
        maxScore: computedMaxScore,
        status: effectiveStatus,
        gradingMode,
        maxAttempts: Number(maxAttempts) || 1,
        shuffleQuestions,
        shuffleOptions,
        passcode: finalPasscode,
        passcodeHash,
        availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
        tutorId: auth.currentUser.uid,
        createdBy: auth.currentUser.uid,
        createdByName: auth.currentUser.displayName || "Tutor",
      };

      // 1. Try server endpoint (supports idempotent create & update by examId)
      let serverSaved = false;
      let returnedExamId = targetExamId;
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch("/.netlify/functions/tutor-examinations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(examPayload),
        });
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data.exam?.id) {
            serverSaved = true;
            returnedExamId = data.exam.id;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          if (response.status === 403) {
            throw new Error(errData.error || "Not authorised to save this examination.");
          }
        }
      } catch (apiErr) {
        if (apiErr instanceof Error && apiErr.message.includes("authorised")) throw apiErr;
        console.warn("Server tutor exam notice, writing to Firestore:", apiErr);
      }

      // 2. Direct Firestore Write Fallback
      if (!serverSaved) {
        // Snapshot-protect any existing attempts before updating questions
        if (isUpdatingExisting) {
          const existingSnap = await getDoc(doc(db, "jdiExams", targetExamId)).catch(() => null);
          const prevQuestions = existingSnap?.exists() ? existingSnap.data()?.questions : null;
          if (Array.isArray(prevQuestions) && prevQuestions.length > 0) {
            const prevMax = computeExamMaxScore({ questions: prevQuestions });
            const attSnap = await getDocs(
              query(collection(db, "jdiExamAttempts"), where("examId", "==", targetExamId))
            ).catch(() => ({ docs: [] } as any));
            await Promise.all(
              (attSnap.docs || []).map((ad: any) => {
                const aData = ad.data();
                if (!Array.isArray(aData.questionsSnapshot) || !aData.questionsSnapshot.length) {
                  return updateDoc(doc(db, "jdiExamAttempts", ad.id), {
                    questionsSnapshot: prevQuestions,
                    maxScore: aData.maxScore || prevMax,
                  }).catch(() => undefined);
                }
                return Promise.resolve();
              })
            );
          }
        }

        const firestoreDocData: Record<string, any> = {
          ...examPayload,
          updatedAt: serverTimestamp(),
        };
        if (!isUpdatingExisting) {
          firestoreDocData.createdAt = serverTimestamp();
        }

        await Promise.all([
          setDoc(doc(db, "jdiExams", targetExamId), firestoreDocData, { merge: true }),
          setDoc(doc(db, "schoolExams", targetExamId), firestoreDocData, { merge: true }),
        ]);

        // Send idempotent notifications to eligible students if active or scheduled
        if (effectiveStatus === "active" || effectiveStatus === "scheduled") {
          const [indSnap, stdSnap] = await Promise.all([
            getDocs(
              query(collection(db, "individualStudents"), where("schoolId", "==", schoolId))
            ).catch(() => ({ docs: [] } as any)),
            getDocs(query(collection(db, "students"), where("schoolId", "==", schoolId))).catch(
              () => ({ docs: [] } as any)
            ),
          ]);
          const notifiedUids = new Set<string>();
          const allStudentDocs = [...(indSnap.docs || []), ...(stdSnap.docs || [])];
          await Promise.all(
            allStudentDocs.map((sd: any) => {
              const s = sd.data();
              const sClass = s.class || s.grade || s.className || "";
              if (!classesMatch(sClass, targetClassList)) return Promise.resolve();
              const recipientUid = String(s.userId || s.uid || sd.id || "").trim();
              if (!recipientUid || notifiedUids.has(recipientUid)) return Promise.resolve();
              notifiedUids.add(recipientUid);
              const notifId = `exam_notice_${targetExamId}_${recipientUid}`.replace(
                /[^a-zA-Z0-9_-]/g,
                "_"
              );
              return setDoc(
                doc(db, "jdiNotifications", notifId),
                {
                  id: notifId,
                  userId: recipientUid,
                  studentId: sd.id,
                  schoolId,
                  examId: targetExamId,
                  type: "examination_published",
                  title:
                    effectiveStatus === "scheduled"
                      ? `Upcoming Examination: ${title.trim()}`
                      : `New Active Examination: ${title.trim()}`,
                  message: `${title.trim()} (${subject.trim()}) has been scheduled for ${normalizedClass}.`,
                  read: false,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch(() => undefined);
            })
          );
        }
      }

      setSavedExamId(returnedExamId);
      setEditingExamId(returnedExamId);
      setStatus(effectiveStatus);
      setGeneratedPasscode(finalPasscode);
      setCustomPasscode(finalPasscode);
      await loadExistingExams();

      setMessage(
        isUpdatingExisting
          ? `Examination "${title.trim()}" updated (${effectiveStatus.toUpperCase()}) for ${schoolName} (${normalizedClass}). Total Marks: ${computedMaxScore}.`
          : `Examination "${title.trim()}" saved (${effectiveStatus.toUpperCase()}) for ${schoolName} (${normalizedClass}). Total Marks: ${computedMaxScore}.`
      );
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Could not save examination.");
    } finally {
      setBusy(false);
    }
  };

  const copyToClipboard = (code?: string) => {
    const target = code || generatedPasscode;
    if (!target) return;
    navigator.clipboard.writeText(target);
    setCopiedPasscode(true);
    setTimeout(() => setCopiedPasscode(false), 2500);
  };

  const managedSchoolOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    assignedSchools.forEach((s) => {
      if (s.id) {
        map.set(s.id, { id: s.id, name: s.name, count: 0 });
      }
    });
    existingExams.forEach((ex) => {
      const key = String(ex.schoolId || ex.schoolName || "").trim();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          id: key,
          name: resolvePartnerSchoolName(ex.schoolName, "Assigned Partner School"),
          count: 1,
        });
      }
    });
    return Array.from(map.values());
  }, [assignedSchools, existingExams]);

  const filteredExistingExams = useMemo(
    () =>
      existingExams.filter((ex) => {
        const matchesStatus =
          lifecycleTab === "all" ? true : (ex.status || "draft") === lifecycleTab;
        if (!matchesStatus) return false;
        if (managedSchoolFilter === "all") return true;
        const exSchoolKey = String(ex.schoolId || ex.schoolName || "").trim();
        return (
          exSchoolKey === managedSchoolFilter ||
          String(ex.schoolName || "").trim().toLowerCase() ===
            managedSchoolFilter.trim().toLowerCase()
        );
      }),
    [existingExams, lifecycleTab, managedSchoolFilter]
  );

  if (userRole && !canAuthorOrMutateExam(userRole)) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Tutor & Administrator Access Only</h1>
          <p className="mt-2 text-sm">
            School administrators can monitor upcoming, active, and completed examinations and view
            student access codes in the Examination History & Reports section, but cannot create or
            modify examinations.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main ref={creatorTopRef} className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      {/* HEADER */}
      <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-blue-200">
              JAYSTARBLISS DYNAMIC INSTITUTE · JDI
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              {isPlatformAdmin ? "Examination Management Hub" : "Tutor Examination Creator & Manager"}
            </h1>
            <p className="mt-2 max-w-2xl text-slate-200">
              Create, schedule, edit, republish, and manage class-specific CBT examinations for your
              assigned partner schools.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {editingExamId && (
              <button
                type="button"
                onClick={resetFormForNewExam}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20"
              >
                <PlusCircle size={16} />
                New Examination
              </button>
            )}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <GraduationCap size={28} className="mx-auto text-blue-400" />
              <span className="mt-1 block text-xs font-semibold text-slate-300">
                Class-Specific CBT
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* EDITING MODE BANNER */}
      {editingExamId && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-300 bg-blue-50 px-5 py-4 text-blue-950">
          <div className="flex items-center gap-2.5">
            <Edit3 size={18} className="text-blue-700 shrink-0" />
            <div className="text-sm">
              <span className="font-bold">Editing Existing Examination:</span>{" "}
              <span className="font-semibold">{title || editingExamId}</span>
              <span className="ml-2 rounded bg-blue-200/70 px-2 py-0.5 font-mono text-xs">
                ID: {editingExamId}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={resetFormForNewExam}
            className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
          >
            Switch to New Blank Exam
          </button>
        </section>
      )}

      {/* SUCCESS PASSCODE BANNER */}
      {savedExamId && generatedPasscode && (
        <section className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-200/80 px-3 py-1 text-xs font-bold text-emerald-900">
                <Check size={14} /> Examination Saved ({status.toUpperCase()})
              </span>
              <h2 className="mt-2 text-xl font-black text-emerald-950">Student Access Passcode</h2>
              <p className="mt-1 text-sm text-emerald-800">
                Share this code with the school coordinator or students enrolled in{" "}
                <strong>{selectedClass}</strong> so they can unlock and begin the test.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 shadow-inner">
              <KeyRound size={20} className="text-emerald-700" />
              <span className="font-mono text-xl font-black tracking-widest text-slate-900">
                {generatedPasscode}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard()}
                className="ml-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors"
              >
                {copiedPasscode ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </section>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {errorMessage}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900"
        >
          {message}
        </div>
      )}

      {/* STEP 1: AUDIENCE & BASIC METADATA */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 border-b pb-4">
          <School className="text-blue-600" size={22} />
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              1. Assigned School, Standardised Class & Schedule
            </h2>
            <p className="text-xs text-slate-500">
              Pick from your assigned schools and select the canonical class level for this
              examination.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* School Dropdown */}
          <label className="block text-sm font-semibold text-slate-700">
            Assigned Partner School *
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              disabled={schoolsLoading}
            >
              {schoolsLoading ? (
                <option value="">Loading assigned schools…</option>
              ) : assignedSchools.length === 0 ? (
                <option value="">No schools currently assigned to your tutor account</option>
              ) : (
                assignedSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>

          {/* Standardised Canonical Class Dropdown */}
          <label className="block text-sm font-semibold text-slate-700">
            Target Class Level *
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {availableClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
              <option value="all">All Classes (Whole School)</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2 pt-2">
          <label className="block text-sm font-semibold text-slate-700">
            Examination Title *
            <input
              type="text"
              required
              placeholder="e.g. First Term CBT Assessment on Basic Computer Operations"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Subject / Area *
            <input
              type="text"
              required
              placeholder="e.g. Computer Studies & Coding, ICT, Robotics"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Duration (Minutes)
            <input
              type="number"
              min={5}
              max={240}
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Publication Status
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "scheduled" | "active")}
            >
              <option value="active">Active (Published & Unlockable Now)</option>
              <option value="scheduled">Scheduled (Visible in Student Upcoming Exams)</option>
              <option value="draft">Draft (Private to Tutor)</option>
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Available From (Optional Schedule Start)
            <input
              type="datetime-local"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Available Until (Optional Schedule Close)
            <input
              type="datetime-local"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={availableUntil}
              onChange={(e) => setAvailableUntil(e.target.value)}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Marking Mode
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={gradingMode}
              onChange={(e) => setGradingMode(e.target.value as any)}
            >
              <option value="automatic">Automatic Objective Grading (Instant Marks)</option>
              <option value="manual">Manual Marking by Tutor</option>
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Custom Access Passcode (Leave blank to auto-generate)
            <input
              type="text"
              placeholder="e.g. JDI-482910"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-mono text-slate-900 outline-none focus:border-blue-500"
              value={customPasscode}
              onChange={(e) => setCustomPasscode(e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* STEP 2: PASTE THE EXAM SCRIPT */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="text-blue-600" size={22} />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                2. Paste Examination Questions & Answer Key
              </h2>
              <p className="text-xs text-slate-500">
                Number each question, list options A-D, optionally specify{" "}
                <code>[2 marks]</code> per question, and end with <code>ANSWER KEY</code>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setRaw(scriptTemplate);
              setScriptWarnings([]);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
          >
            <ClipboardPaste size={14} />
            Insert Sample Template
          </button>
        </div>

        <textarea
          rows={12}
          className="w-full rounded-xl border border-slate-300 bg-slate-900 p-4 font-mono text-sm text-emerald-400 outline-none focus:border-blue-500"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setScriptWarnings([]);
          }}
          placeholder={
            "1. What is the shortcut key to copy text on a computer? [1 mark]\nA. Ctrl + C\nB. Ctrl + V\nC. Ctrl + P\nD. Ctrl + X\n\nANSWER KEY\n1. A"
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={parseScript}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            <BookOpen size={16} />
            Parse & Validate Questions ({questions.length})
          </button>
          {questions.length > 0 && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              ✓ {questions.length} question(s) · Total Marks: {totalExamMarks}
            </span>
          )}
        </div>

        {scriptWarnings.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle size={18} className="text-amber-700" />
              Please review the following formatting notices:
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
              {scriptWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* STEP 3: QUESTION CARDS & MARKS CONFIGURATION */}
      {questions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                3. Review Questions & Configure Marks ({questions.length} Questions ·{" "}
                {totalExamMarks} Total Marks)
              </h2>
              <p className="text-xs text-slate-500">
                Adjust the marks for any question below. The examination denominator ({totalExamMarks}
                ) is calculated automatically from the sum of question marks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Eye size={14} />
              {showPreview ? "Hide Student View" : "Student View Preview"}
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q, i) => (
              <div
                key={q.id || i}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">
                      {i + 1}. {q.prompt}
                    </p>
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {q.options.map((opt: any) => {
                          const isCorrect =
                            !showPreview &&
                            Array.isArray(q.correctOptionIds) &&
                            q.correctOptionIds.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`rounded-lg border px-3 py-2 ${
                                isCorrect
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                                  : "border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              <span className="font-bold mr-1.5">{opt.id}.</span> {opt.text}
                              {isCorrect && (
                                <span className="ml-1 text-[10px] text-emerald-700 uppercase font-black">
                                  (Correct)
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span>Marks:</span>
                      <input
                        type="number"
                        min={0.5}
                        max={100}
                        step={0.5}
                        value={Number(q.points ?? 1)}
                        onChange={(e) => updateQuestionPoints(i, Number(e.target.value))}
                        className="w-16 rounded border border-slate-300 px-2 py-0.5 text-center font-bold text-blue-900"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SAVE / PUBLISH ACTION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <a
          href={isPlatformAdmin ? "/admin/examination-history" : "/portal/staff/exam-history"}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View Examination History & Reports
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || questions.length === 0}
            onClick={() => void save("draft")}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Saving…" : editingExamId ? "Update as Draft" : "Save as Draft"}
          </button>
          <button
            type="button"
            disabled={busy || questions.length === 0}
            onClick={() => void save("scheduled")}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            <Calendar size={16} />
            {busy ? "Scheduling…" : editingExamId ? "Update as Scheduled" : "Schedule Exam"}
          </button>
          <button
            type="button"
            disabled={busy || questions.length === 0}
            onClick={() => void save("active")}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
          >
            {busy
              ? "Publishing…"
              : editingExamId
              ? "Update & Republish Exam"
              : "Publish Examination Now"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* STEP 4: MY EXAMINATIONS & LIFECYCLE MANAGER */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              My Managed Examinations ({existingExams.length})
            </h2>
            <p className="text-xs text-slate-500">
              View, edit, republish, copy access codes, or safely delete/archive your examinations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadExistingExams()}
            disabled={existingBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={14} className={existingBusy ? "animate-spin" : ""} />
            Refresh List
          </button>
        </div>

        {/* School Filter & Status Filter Controls */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Filter size={14} />
              </span>
              <span>Filter Examinations by Assigned School:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex items-center">
                <School
                  size={14}
                  className="pointer-events-none absolute left-3 text-slate-500"
                />
                <select
                  aria-label="Filter examinations by school"
                  value={managedSchoolFilter}
                  onChange={(e) => setManagedSchoolFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-8 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="all">All Assigned Schools ({existingExams.length})</option>
                  {managedSchoolOptions.map((sch) => (
                    <option key={sch.id} value={sch.id}>
                      {sch.name} ({sch.count})
                    </option>
                  ))}
                </select>
              </div>

              {(managedSchoolFilter !== "all" || lifecycleTab !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setManagedSchoolFilter("all");
                    setLifecycleTab("all");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Quick School Filter Pills */}
          {managedSchoolOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setManagedSchoolFilter("all")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  managedSchoolFilter === "all"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Filter size={12} />
                All Schools ({existingExams.length})
              </button>
              {managedSchoolOptions.map((sch) => (
                <button
                  key={sch.id}
                  type="button"
                  onClick={() => setManagedSchoolFilter(sch.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    managedSchoolFilter === sch.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <School size={12} />
                  <span>{sch.name}</span>
                  <span className="opacity-80">({sch.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "active", "scheduled", "draft", "completed", "archived"] as const).map(
                (tabKey) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setLifecycleTab(tabKey)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold capitalize transition-colors ${
                      lifecycleTab === tabKey
                        ? "bg-slate-900 text-white"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {tabKey}
                  </button>
                )
              )}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Showing {filteredExistingExams.length} of {existingExams.length} examination(s)
            </span>
          </div>
        </div>

        {filteredExistingExams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No examinations found matching the selected school and status filters.
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredExistingExams.map((ex) => (
              <article
                key={ex.id}
                className={`rounded-xl border p-4 transition-all ${
                  editingExamId === ex.id
                    ? "border-blue-500 bg-blue-50/40"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">{ex.title}</h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                          ex.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : ex.status === "scheduled"
                            ? "bg-blue-100 text-blue-800"
                            : ex.status === "archived"
                            ? "bg-slate-200 text-slate-600"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ex.status || "draft"}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-600">
                      {ex.subject} · <strong>{ex.schoolName || "Assigned School"}</strong> · Class:{" "}
                      <strong>{ex.targetClass || ex.classIds?.join(", ") || "All"}</strong> ·{" "}
                      {ex.questionCount ?? ex.questions?.length ?? 0} Questions ·{" "}
                      <strong>{ex.maxScore ?? computeExamMaxScore(ex)} Marks</strong>
                    </p>
                    {ex.passcode && (
                      <div className="inline-flex items-center gap-2 pt-1 text-xs">
                        <span className="text-slate-500 font-semibold">Access Passcode:</span>
                        <code className="rounded bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-900">
                          {ex.passcode}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(ex.passcode)}
                          className="text-blue-600 hover:underline font-semibold"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditExam(ex)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                    >
                      <Edit3 size={14} className="text-blue-600" />
                      Edit / Republish
                    </button>
                    {confirmDeleteId === ex.id ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1">
                        <span className="text-[11px] font-bold text-red-800">Delete exam?</span>
                        <button
                          type="button"
                          disabled={itemActionBusy === ex.id}
                          onClick={() => void handleDeleteOrArchiveExam(ex)}
                          className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {itemActionBusy === ex.id ? "Deleting…" : "Confirm Delete"}
                        </button>
                        <button
                          type="button"
                          disabled={itemActionBusy === ex.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={itemActionBusy === ex.id}
                        onClick={() => setConfirmDeleteId(ex.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {itemActionBusy === ex.id ? "Working…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
