import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db, getAllClientDatabases } from "../../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  gradeAnswers,
  resolveAttemptQuestions,
  computeExamMaxScore,
  calculateScorePercentage,
  normalizeClassName,
  resolvePartnerSchoolName,
  normalizeDeliveryMode,
  normalizeWorkType,
  getWorkTypeLabels,
  isAttemptResultReleased,
  shouldAutoReleaseAttemptResult,
} from "../../lib/classes";
import {
  buildExamReportViewModel,
  generateExamReportPdf,
} from "../../lib/examReportPdfGenerator";
import EmbeddedLearningMedia from "../../components/portal/EmbeddedLearningMedia";
import {
  Clock,
  CheckCircle2,
  ArrowLeft,
  Download,
  Award,
  School,
  User,
  ExternalLink,
  Lock,
  Link2,
  Upload,
  FileText,
  Trash2,
  Video,
  Info,
  Check,
  AlertTriangle,
  ShieldCheck,
  Flame,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  CheckCircle,
} from "lucide-react";

type Q = {
  id: string;
  type: string;
  prompt: string;
  options?: { id: string; text: string }[];
  points: number;
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  explanation?: string;
  resourceUrl?: string;
  videoUrl?: string;
  submissionMethod?: "both" | "link" | "file" | "text" | "none";
  acceptedFileTypes?: string;
  maxFileSizeMb?: number;
  deliverableInstructions?: string;
};

type StructuredSubmission = {
  textResponse?: string;
  linkUrl?: string;
  fileDataUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
};

type D = {
  attempt: {
    id: string;
    examId: string;
    studentId: string;
    studentName: string;
    className?: string;
    schoolId?: string;
    schoolName?: string;
    status: string;
    deadlineAt?: string | null;
    score?: number;
    maxScore?: number;
    percentage?: number;
    submittedAt?: unknown;
    releasedAt?: unknown;
    resultReleased?: boolean;
    autoGraded?: boolean;
    answers?: Record<string, any>;
    feedback?: string;
    tutorFeedback?: string;
    questionsSnapshot?: Q[];
    questionResults?: {
      questionId: string;
      answer?: any;
      correct?: boolean;
      pointsAwarded?: number;
      maxPoints?: number;
      manualReview?: boolean;
    }[];
    manualMarks?: {
      questionId: string;
      pointsAwarded: number;
      maxPoints: number;
    }[];
  };
  exam: {
    id?: string;
    title: string;
    subject: string;
    workType?: string;
    deliveryMode?: "EXTERNAL_LINK" | "NATIVE";
    externalUrl?: string;
    resourceTitle?: string;
    resourceUrl?: string;
    videoUrl?: string;
    learningVideoUrl?: string;
    deliverables?: string;
    learningResources?: Array<{
      id: string;
      title: string;
      instructions?: string;
      url: string;
      youtubeUrl?: string;
    }>;
    submissionFormat?: string;
    isTaskOnlyAssignment?: boolean;
    schoolId?: string;
    schoolName?: string;
    maxScore?: number;
    instructions?: string;
    hasTimeLimit?: boolean;
    durationMinutes?: number | null;
    gradingMode?: string;
    releaseGradesPolicy?: string;
    questions?: Q[];
  };
  questions: Q[];
};

function parseStructuredAnswer(raw: any): StructuredSubmission {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as StructuredSubmission;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return JSON.parse(trimmed) as StructuredSubmission;
      } catch {
        // fall through
      }
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return { linkUrl: trimmed };
    }
    if (trimmed.startsWith("data:")) {
      return { fileDataUrl: trimmed, fileName: "uploaded-file" };
    }
    return { textResponse: raw };
  }
  return {};
}

interface LinkValidationResult {
  hasValue: boolean;
  isValid: boolean;
  isGoogleDrive: boolean;
  normalizedUrl: string;
  errorMessage?: string;
}

function validateSubmissionLink(rawUrl?: string): LinkValidationResult {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return {
      hasValue: false,
      isValid: true,
      isGoogleDrive: false,
      normalizedUrl: "",
    };
  }
  if (/\s/.test(trimmed)) {
    return {
      hasValue: true,
      isValid: false,
      isGoogleDrive: false,
      normalizedUrl: trimmed,
      errorMessage: "URL cannot contain spaces. Please enter a complete https:// link.",
    };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      hasValue: true,
      isValid: false,
      isGoogleDrive: false,
      normalizedUrl: trimmed,
      errorMessage: "URL must begin with https:// or http:// (for example, https://drive.google.com/...).",
    };
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const hasValidHost = host === "localhost" || (host.includes(".") && host.split(".").every((part) => part.length > 0));
    if (!hasValidHost) {
      return {
        hasValue: true,
        isValid: false,
        isGoogleDrive: false,
        normalizedUrl: trimmed,
        errorMessage: "Please enter a valid web address with a domain name (e.g. drive.google.com, scratch.mit.edu).",
      };
    }
    const isGoogleDrive =
      host === "drive.google.com" ||
      host.endsWith(".drive.google.com") ||
      host === "docs.google.com" ||
      host.endsWith(".docs.google.com");
    return {
      hasValue: true,
      isValid: true,
      isGoogleDrive,
      normalizedUrl: parsed.toString(),
    };
  } catch {
    return {
      hasValue: true,
      isValid: false,
      isGoogleDrive: false,
      normalizedUrl: trimmed,
      errorMessage: "Invalid URL format. Please paste a complete, valid web link starting with https://.",
    };
  }
}

export default function StudentExamAttempt() {
  const { attemptId = "" } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<D | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [timerInitialized, setTimerInitialized] = useState(false);
  const [autoExpiredBanner, setAutoExpiredBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploadingQId, setUploadingQId] = useState<string | null>(null);
  const [drivePermissionConfirmed, setDrivePermissionConfirmed] = useState<Record<string, boolean>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"focused" | "all">("focused");
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);

  // Load Exam Attempt Data (Server + Direct Firestore Fallback)
  const loadAttemptData = async () => {
    try {
      if (!auth.currentUser) throw new Error("Please sign in again.");

      let loadedData: D | null = null;

      // 1. Try server function
      try {
        const token = await auth.currentUser.getIdToken();
        const url = `/.netlify/functions/examination-attempt?attemptId=${encodeURIComponent(attemptId)}`;
        const res = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json().catch(() => null);
          if (d && d.attempt) loadedData = d;
        }
      } catch (err) {
        console.warn("Server exam attempt notice, engaging Firestore resolver:", err);
      }

      // 2. Direct Firestore Fallback across both client databases
      if (!loadedData) {
        const allDbs = getAllClientDatabases();
        let attemptSnap: any = null;
        for (const dbInst of allDbs) {
          const snap = await getDoc(doc(dbInst, "jdiExamAttempts", attemptId)).catch(() => null);
          if (snap?.exists()) {
            if (!attemptSnap || isAttemptResultReleased(snap.data())) {
              attemptSnap = snap;
            }
          }
        }
        if (!attemptSnap?.exists()) throw new Error("Assessment attempt record could not be found.");
        const attemptData: any = { id: attemptSnap.id, ...attemptSnap.data() };

        // Load exam document across both client databases
        let examSnap: any = null;
        for (const dbInst of allDbs) {
          const jdiCandidate = await getDoc(doc(dbInst, "jdiExams", attemptData.examId)).catch(
            () => null
          );
          if (jdiCandidate?.exists()) {
            examSnap = jdiCandidate;
            break;
          }
          const schCandidate = await getDoc(doc(dbInst, "schoolExams", attemptData.examId)).catch(
            () => null
          );
          if (schCandidate?.exists()) {
            examSnap = schCandidate;
            break;
          }
        }
        const examData: any = examSnap?.exists()
          ? examSnap.data()
          : { title: "Assessment", subject: "General" };

        // Resolve authoritative partner school name
        const effectiveSchoolId = String(attemptData.schoolId || examData.schoolId || "").trim();
        let schoolDocName = "";
        if (effectiveSchoolId && effectiveSchoolId !== "private") {
          const schSnap = await getDoc(doc(db, "schools", effectiveSchoolId)).catch(() => null);
          if (schSnap?.exists()) {
            const s = schSnap.data();
            schoolDocName = s.name || s.schoolName || "";
          }
        }
        const resolvedSchoolName =
          effectiveSchoolId === "private" || !effectiveSchoolId
            ? attemptData.schoolName || "Private Mentorship"
            : resolvePartnerSchoolName(
                schoolDocName,
                attemptData.schoolName,
                examData.schoolName,
                sessionStorage.getItem("schoolName") || ""
              );

        const rawQuestions: Q[] = resolveAttemptQuestions(examData, attemptData) as Q[];
        const isClosed = attemptData.status !== "in_progress";
        const isReleased = isAttemptResultReleased(attemptData, examData);

        const safeQuestions: Q[] = rawQuestions.map((q) => {
          if (!isClosed || !isReleased) {
            const { correctOptionIds, acceptedAnswers, explanation, ...rest } = q;
            return rest as Q;
          }
          return q;
        });

        const maxScore = computeExamMaxScore(examData, attemptData);
        const score = isReleased && typeof attemptData.score === "number" ? attemptData.score : undefined;
        const hasTimeLimit =
          examData.hasTimeLimit !== undefined
            ? Boolean(examData.hasTimeLimit)
            : examData.durationMinutes != null && Number(examData.durationMinutes) > 0;
        const configuredDurationMin = hasTimeLimit
          ? Math.max(1, Number(examData.durationMinutes) || 30)
          : null;

        loadedData = {
          attempt: {
            ...attemptData,
            score,
            percentage: score !== undefined ? calculateScorePercentage(score, maxScore) : undefined,
            questionResults: isReleased ? attemptData.questionResults : undefined,
            manualMarks: isReleased ? attemptData.manualMarks : undefined,
            feedback: isReleased ? attemptData.feedback || attemptData.tutorFeedback : undefined,
            releasedAt: isReleased
              ? attemptData.releasedAt || attemptData.updatedAt || attemptData.submittedAt || new Date().toISOString()
              : undefined,
            resultReleased: isReleased,
            studentName:
              attemptData.studentName ||
              sessionStorage.getItem("userName") ||
              auth.currentUser.displayName ||
              "Student",
            className:
              normalizeClassName(attemptData.className || sessionStorage.getItem("studentClass") || "") ||
              attemptData.className ||
              "",
            schoolId: effectiveSchoolId,
            schoolName: resolvedSchoolName,
            maxScore,
            deadlineAt: hasTimeLimit
              ? attemptData.deadlineAt ||
                new Date(Date.now() + (configuredDurationMin || 30) * 60000).toISOString()
              : null,
          },
          exam: {
            id: attemptData.examId,
            title: examData.title || "Assessment",
            subject: examData.subject || "General",
            workType: normalizeWorkType(examData.workType, examData),
            deliveryMode: normalizeDeliveryMode(examData),
            externalUrl: String(examData.externalUrl || "").trim(),
            resourceTitle: String(examData.resourceTitle || "").trim(),
            resourceUrl: String(examData.resourceUrl || examData.videoUrl || examData.learningVideoUrl || "").trim(),
            videoUrl: String(examData.videoUrl || examData.learningVideoUrl || "").trim(),
            deliverables: String(examData.deliverables || "").trim(),
            learningResources: Array.isArray(examData.learningResources) ? examData.learningResources : [],
            submissionFormat: examData.submissionFormat,
            isTaskOnlyAssignment: Boolean(examData.isTaskOnlyAssignment),
            schoolId: effectiveSchoolId,
            schoolName: resolvedSchoolName,
            maxScore,
            instructions: examData.instructions || examData.description || "",
            hasTimeLimit,
            durationMinutes: configuredDurationMin,
            gradingMode: examData.gradingMode || "automatic",
            releaseGradesPolicy: examData.releaseGradesPolicy,
            questions: isReleased ? rawQuestions : safeQuestions,
          },
          questions: safeQuestions,
        };
      } else {
        const effectiveSchoolId = String(
          loadedData.attempt.schoolId || loadedData.exam.schoolId || ""
        ).trim();
        let resolvedSchoolName =
          effectiveSchoolId === "private" || !effectiveSchoolId
            ? loadedData.attempt.schoolName || "Private Mentorship"
            : resolvePartnerSchoolName(
                loadedData.attempt.schoolName,
                loadedData.exam.schoolName
              );
        if (!resolvedSchoolName && effectiveSchoolId && effectiveSchoolId !== "private") {
          const schSnap = await getDoc(doc(db, "schools", effectiveSchoolId)).catch(() => null);
          if (schSnap?.exists()) {
            const s = schSnap.data();
            resolvedSchoolName = resolvePartnerSchoolName(s.name, s.schoolName);
          }
        }
        loadedData.attempt.schoolName = resolvedSchoolName;
        loadedData.exam.schoolName = resolvedSchoolName;
        loadedData.exam.deliveryMode = normalizeDeliveryMode(loadedData.exam);
      }

      setData(loadedData);
      setAnswers(loadedData.attempt.answers || {});
      const hasActiveDeadline =
        Boolean(loadedData.attempt.deadlineAt) &&
        loadedData.exam.hasTimeLimit !== false &&
        (loadedData.exam.hasTimeLimit === true ||
          (loadedData.exam.durationMinutes != null && Number(loadedData.exam.durationMinutes) > 0));
      if (hasActiveDeadline && loadedData.attempt.deadlineAt) {
        const remaining = Math.max(
          0,
          Math.ceil((new Date(loadedData.attempt.deadlineAt).getTime() - Date.now()) / 1000)
        );
        setSeconds(remaining);
        setTimerInitialized(true);
        if (remaining <= 0 && loadedData.attempt.status === "in_progress") {
          setAutoExpiredBanner(true);
        }
      } else {
        setSeconds(0);
        setTimerInitialized(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load assessment attempt.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setTimerInitialized(false);
    setAutoExpiredBanner(false);
    void loadAttemptData();
  }, [attemptId]);

  // Countdown timer (only runs when a time limit / deadline is configured)
  useEffect(() => {
    const hasDeadline =
      Boolean(data?.attempt.deadlineAt) &&
      data?.exam.hasTimeLimit !== false &&
      (data?.exam.hasTimeLimit === true ||
        (data?.exam.durationMinutes != null && Number(data?.exam.durationMinutes) > 0));
    if (!data || data.attempt.status !== "in_progress" || !hasDeadline || !data.attempt.deadlineAt) return;
    const deadlineIso = data.attempt.deadlineAt;
    const interval = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 1000)
      );
      setSeconds(remaining);
      if (remaining <= 0) {
        setAutoExpiredBanner(true);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [data?.attempt.deadlineAt, data?.attempt.status, data?.exam.hasTimeLimit, data?.exam.durationMinutes]);

  // Autosave answers with 2000ms debounce after answer changes
  useEffect(() => {
    if (!data || data.attempt.status !== "in_progress" || busy) return;
    const initialSerialized = JSON.stringify(data.attempt.answers || {});
    const currentSerialized = JSON.stringify(answers || {});
    if (currentSerialized === initialSerialized) {
      setSaveStatus("saved");
      return;
    }

    let live = true;
    const answersToSave = answers;
    setSaveStatus("pending");

    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      const queued = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          let serverOk = false;
          try {
            if (auth.currentUser) {
              const token = await auth.currentUser.getIdToken();
              const res = await fetch("/.netlify/functions/examination-attempt", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ attemptId, action: "save", answers: answersToSave }),
              });
              if (res.ok) serverOk = true;
            }
          } catch {}

          if (!serverOk) {
            await Promise.all(
              getAllClientDatabases().map((dbInst) =>
                setDoc(
                  doc(dbInst, "jdiExamAttempts", attemptId),
                  {
                    answers: answersToSave,
                    updatedAt: serverTimestamp(),
                    lastHeartbeat: serverTimestamp(),
                    isOnline: true,
                  },
                  { merge: true }
                ).catch(() => undefined)
              )
            );
          }
        });

      saveQueue.current = queued;
      queued
        .then(() => {
          if (live) setSaveStatus("saved");
        })
        .catch(() => {
          if (live) {
            setSaveStatus("error");
            setError("Auto-saving was delayed. Please use 'Save Answers' button.");
          }
        });
    }, 2000);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [answers, data?.attempt.status, busy]);

  // Live Proctor Heartbeat: writes isOnline: true and lastHeartbeat every 60 seconds while taking exam
  useEffect(() => {
    if (!data || data.attempt.status !== "in_progress" || busy || !attemptId) return;

    const ping = () => {
      const attemptRef = doc(db, "jdiExamAttempts", attemptId);
      updateDoc(attemptRef, {
        isOnline: true,
        lastHeartbeat: serverTimestamp(),
      }).catch(() => undefined);
    };

    ping();
    const interval = window.setInterval(ping, 60000);

    const handleBeforeUnload = () => {
      const attemptRef = doc(db, "jdiExamAttempts", attemptId);
      updateDoc(attemptRef, {
        isOnline: false,
        lastHeartbeat: serverTimestamp(),
      }).catch(() => undefined);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [attemptId, data?.attempt.status, busy]);

  // Update structured answer helper (for practical_task, link_submission, file_submission)
  const updateStructuredAnswer = (qId: string, patch: Partial<StructuredSubmission>) => {
    setAnswers((prev) => {
      const current = parseStructuredAnswer(prev[qId]);
      const next = { ...current, ...patch };
      return { ...prev, [qId]: JSON.stringify(next) };
    });
  };

  // Helper to determine if a question has been answered
  const isQuestionAnswered = (q: Q): boolean => {
    if (q.type === "learning_resource") return true;
    const val = answers[q.id];
    if (val === undefined || val === null) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith("{")) {
        const parsed = parseStructuredAnswer(trimmed);
        return Boolean(
          parsed.linkUrl?.trim() || parsed.fileDataUrl?.trim() || parsed.textResponse?.trim()
        );
      }
      return true;
    }
    if (typeof val === "object") {
      return Boolean(val.linkUrl?.trim() || val.fileDataUrl?.trim() || val.textResponse?.trim());
    }
    return true;
  };

  // Handle File Upload Selection
  const handleFileChange = (q: Q, file: File | null) => {
    if (!file) return;
    const maxMb = Number(q.maxFileSizeMb) || 10;
    if (file.size > maxMb * 1024 * 1024) {
      setError(`File "${file.name}" exceeds the ${maxMb}MB size limit.`);
      return;
    }
    setError("");
    setUploadingQId(q.id);

    // If file is <= 1.5MB, encode as Data URL so tutor can preview & download directly from Firestore
    if (file.size <= 1.5 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        updateStructuredAnswer(q.id, {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
          fileDataUrl: typeof reader.result === "string" ? reader.result : "",
        });
        setUploadingQId(null);
        setNotice(`File "${file.name}" attached and ready for submission.`);
      };
      reader.onerror = () => {
        setUploadingQId(null);
        setError("Could not read the selected file. Please try again.");
      };
      reader.readAsDataURL(file);
    } else {
      // For larger files (>1.5MB), store a lightweight downloadable summary Data URL so Firestore document stays within limits
      const summaryText = `Submitted File Deliverable\nFile Name: ${file.name}\nFile Size: ${(
        file.size / 1024
      ).toFixed(1)} KB\nMIME Type: ${file.type || "binary"}\nRecorded At: ${new Date().toISOString()}`;
      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(summaryText)}`;
      updateStructuredAnswer(q.id, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        fileDataUrl: dataUrl,
      });
      setUploadingQId(null);
      setNotice(`File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) attached.`);
    }
  };

  // Keyboard navigation for focused quiz player (Left/Right arrows when not in an input)
  useEffect(() => {
    if (!data || data.attempt.status !== "in_progress" || viewMode !== "focused") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const tag = (activeEl?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (activeEl?.getAttribute("contenteditable") === "true") return;

      if (e.key === "ArrowRight") {
        if (currentQuestionIndex < data.questions.length - 1) {
          e.preventDefault();
          setCurrentQuestionIndex((prev) => Math.min(data.questions.length - 1, prev + 1));
        }
      } else if (e.key === "ArrowLeft") {
        if (currentQuestionIndex > 0) {
          e.preventDefault();
          setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [data, viewMode, currentQuestionIndex]);

  // Validate all student link submissions before final submit
  const validateAllLinkSubmissions = (): { ok: boolean; errorMsg?: string } => {
    if (!data) return { ok: true };
    for (let idx = 0; idx < data.questions.length; idx++) {
      const q = data.questions[idx];
      const subMethod =
        q.submissionMethod ||
        (q.type === "link_submission" ? "link" : q.type === "file_submission" ? "file" : "both");
      const showLinkInput =
        q.type === "link_submission" ||
        (q.type === "practical_task" && ["both", "link"].includes(subMethod));
      if (!showLinkInput) continue;

      const structured = parseStructuredAnswer(answers[q.id]);
      const linkCheck = validateSubmissionLink(structured.linkUrl);

      if (q.type === "link_submission" && !linkCheck.hasValue) {
        return {
          ok: false,
          errorMsg: `Item ${idx + 1}: Please provide a valid project or deliverable link before submitting.`,
        };
      }

      if (linkCheck.hasValue && !linkCheck.isValid) {
        return {
          ok: false,
          errorMsg: `Item ${idx + 1}: ${linkCheck.errorMessage || "Please enter a valid https:// URL for your link submission."}`,
        };
      }

      if (linkCheck.hasValue && linkCheck.isGoogleDrive && !drivePermissionConfirmed[q.id]) {
        return {
          ok: false,
          errorMsg: `Item ${idx + 1}: You entered a Google Drive / Docs link. Please check the confirmation box verifying that sharing permissions are set to "Anyone with the link can view" before submitting.`,
        };
      }
    }
    return { ok: true };
  };

  const handleInitiateSubmit = () => {
    setError("");
    const check = validateAllLinkSubmissions();
    if (!check.ok) {
      setError(check.errorMsg || "Please review your link submissions before submitting.");
      return;
    }
    setConfirmingSubmit(true);
  };

  // Submit / Expire Examination
  const send = async (action: "save" | "submit" | "expire") => {
    if (busy || !data) return;
    if (action === "submit") {
      const check = validateAllLinkSubmissions();
      if (!check.ok) {
        setError(check.errorMsg || "Please review your link submissions before submitting.");
        setConfirmingSubmit(false);
        return;
      }
    }
    setBusy(true);
    setConfirmingSubmit(false);
    setError("");
    try {
      let serverOk = false;
      let resultData: any = null;

      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch("/.netlify/functions/examination-attempt", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ attemptId, action, answers }),
          });
          if (res.ok) {
            resultData = await res.json().catch(() => ({}));
            serverOk = true;
          }
        }
      } catch (e) {
        console.warn("Server action failed, engaging Firestore grading:", e);
      }

      if (!serverOk) {
        const allDbs = getAllClientDatabases();
        if (action === "save") {
          await Promise.all(
            allDbs.map((dbInst) =>
              setDoc(
                doc(dbInst, "jdiExamAttempts", attemptId),
                { answers, updatedAt: serverTimestamp() },
                { merge: true }
              ).catch(() => undefined)
            )
          );
          setNotice("Progress saved successfully.");
        } else {
          // Compute grade locally using assessment domain logic
          let fullExam: any = data.exam;
          for (const dbInst of allDbs) {
            const examDocSnap = await getDoc(doc(dbInst, "jdiExams", data.attempt.examId)).catch(
              () => null
            );
            if (examDocSnap?.exists()) {
              fullExam = examDocSnap.data();
              break;
            }
          }
          const attemptQuestions = resolveAttemptQuestions(fullExam, data.attempt);
          const grading = gradeAnswers({ ...fullExam, questions: attemptQuestions }, answers);
          const autoRelease = shouldAutoReleaseAttemptResult(fullExam, grading);
          const finalStatus = autoRelease
            ? "graded"
            : action === "expire"
            ? "expired"
            : "submitted";
          const attemptPatch: Record<string, any> = {
            answers,
            status: finalStatus,
            score: grading.score,
            maxScore: grading.maxScore,
            percentage: grading.percentage,
            autoGraded: grading.autoGraded,
            questionResults: grading.questionResults,
            isOnline: false,
            submittedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (autoRelease) {
            attemptPatch.resultReleased = true;
            attemptPatch.releasedAt = serverTimestamp();
          }

          await Promise.all(
            allDbs.map((dbInst) =>
              setDoc(
                doc(dbInst, "jdiExamAttempts", attemptId),
                attemptPatch,
                { merge: true }
              ).catch(() => undefined)
            )
          );

          setData((prev) => {
            if (!prev) return null;
            const released =
              autoRelease || isAttemptResultReleased(prev.attempt, fullExam || prev.exam);
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                answers,
                status: finalStatus,
                autoGraded: grading.autoGraded,
                resultReleased: released,
                releasedAt: released
                  ? prev.attempt.releasedAt || new Date().toISOString()
                  : undefined,
                score: released ? grading.score : undefined,
                maxScore: grading.maxScore,
                percentage: released ? grading.percentage : undefined,
                questionResults: released ? (grading.questionResults as any) : undefined,
              },
              exam: {
                ...prev.exam,
                questions: released ? (attemptQuestions as Q[]) : prev.exam.questions,
              },
              questions: released ? (attemptQuestions as Q[]) : prev.questions,
            };
          });

          const currentTypeLabels = getWorkTypeLabels(
            fullExam?.workType || data.exam.workType,
            fullExam || data.exam
          );
          setNotice(
            action === "expire"
              ? `Time expired! Your ${currentTypeLabels.lowerSingular} was automatically submitted.`
              : autoRelease
              ? `Your ${currentTypeLabels.lowerSingular} was submitted and automatically graded!`
              : `Your ${currentTypeLabels.lowerSingular} was submitted successfully!`
          );
        }
      } else {
        if (action === "save") {
          setNotice("Progress saved.");
        } else {
          const currentTypeLabels = getWorkTypeLabels(data.exam.workType, data.exam);
          setData((prev) => {
            if (!prev) return null;
            const released = Boolean(
              resultData?.resultReleased || isAttemptResultReleased(prev.attempt, prev.exam)
            );
            const resolvedQuestions =
              released && Array.isArray(resultData?.questions) && resultData.questions.length > 0
                ? (resultData.questions as Q[])
                : prev.exam.questions;
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                answers,
                status: released ? "graded" : action === "expire" ? "expired" : "submitted",
                resultReleased: released,
                releasedAt:
                  resultData?.releasedAt ||
                  (released ? prev.attempt.releasedAt || new Date().toISOString() : undefined),
                score: released ? (resultData?.score ?? prev.attempt.score) : undefined,
                maxScore: resultData?.maxScore ?? prev.attempt.maxScore,
                percentage: released
                  ? (resultData?.percentage ?? prev.attempt.percentage)
                  : undefined,
                questionResults: released
                  ? (resultData?.questionResults ?? prev.attempt.questionResults)
                  : undefined,
              },
              exam: {
                ...prev.exam,
                questions: resolvedQuestions,
              },
              questions: resolvedQuestions || prev.questions,
            };
          });
          setNotice(
            action === "expire"
              ? `Time expired. ${currentTypeLabels.singular} attempt closed.`
              : resultData?.resultReleased
              ? `Your ${currentTypeLabels.lowerSingular} was submitted and automatically graded!`
              : `Your ${currentTypeLabels.lowerSingular} was submitted.`
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-expire when timer hits 00:00 (only when a time limit / deadline is configured)
  useEffect(() => {
    const hasDeadline =
      Boolean(data?.attempt.deadlineAt) &&
      data?.exam.hasTimeLimit !== false &&
      (data?.exam.hasTimeLimit === true ||
        (data?.exam.durationMinutes != null && Number(data?.exam.durationMinutes) > 0));
    if (
      hasDeadline &&
      timerInitialized &&
      seconds <= 0 &&
      data?.attempt.status === "in_progress" &&
      !busy
    ) {
      setAutoExpiredBanner(true);
      void send("expire");
    }
  }, [
    seconds,
    timerInitialized,
    data?.attempt.status,
    data?.attempt.deadlineAt,
    data?.exam.hasTimeLimit,
    data?.exam.durationMinutes,
    busy,
  ]);

  // Download PDF Report
  const handleDownloadReport = async () => {
    if (!data) return;
    if (!isAttemptResultReleased(data.attempt, data.exam)) {
      setError(
        "Assessment results have not been released by your tutor yet. Printing is disabled until results are released."
      );
      return;
    }
    setDownloadingPdf(true);
    try {
      const bytes = await generateExamReportPdf(
        {
          ...data.attempt,
          answers: data.attempt.answers || answers,
          questions: data.exam.questions || data.questions,
        },
        {
          id: data.exam.id,
          title: data.exam.title,
          subject: data.exam.subject,
          schoolName: data.exam.schoolName || data.attempt.schoolName,
          maxScore: data.exam.maxScore || data.attempt.maxScore,
          durationMinutes: data.exam.durationMinutes,
          questions: data.exam.questions || data.questions,
        }
      );
      const url = URL.createObjectURL(new Blob([bytes as any], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `JDI-Result-${(data.attempt.studentName || "Student").replace(
        /[^a-z0-9]+/gi,
        "-"
      )}-${data.attempt.id.slice(-6)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not generate report PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!data) {
    return (
      <main className="mx-auto max-w-4xl p-6 sm:p-8 text-center">
        <p className="text-slate-600 dark:text-slate-300 font-semibold">
          {error || "Loading assessment session…"}
        </p>
      </main>
    );
  }

  const typeLabels = getWorkTypeLabels(data.exam.workType, data.exam);

  // Handle External Link Assessment if opened via attempt route
  if (data.exam.deliveryMode === "EXTERNAL_LINK" && data.exam.externalUrl) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <ExternalLink size={28} />
          </div>
          <span className="inline-block rounded-md bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            {typeLabels.singular}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {data.exam.title}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
            {data.exam.instructions ||
              `This ${typeLabels.lowerSingular} is hosted externally. Click the button below to launch your ${typeLabels.lowerSingular}.`}
          </p>
          {data.exam.resourceUrl && (
            <div className="text-left pt-2">
              <EmbeddedLearningMedia
                url={data.exam.resourceUrl}
                title={data.exam.resourceTitle || "Reference Learning Resource"}
                hideExternalLink={true}
              />
            </div>
          )}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={data.exam.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
            >
              Open {typeLabels.singular}
              <ExternalLink size={16} />
            </a>
            <button
              type="button"
              onClick={() => nav("/portal/student/exams")}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <ArrowLeft size={16} />
              Return to Assessments
            </button>
          </div>
        </section>
      </main>
    );
  }

  const hasTimeLimit =
    Boolean(data.attempt.deadlineAt) &&
    data.exam.hasTimeLimit !== false &&
    (data.exam.hasTimeLimit === true ||
      (data.exam.durationMinutes != null && Number(data.exam.durationMinutes) > 0));
  const isTimeUp = hasTimeLimit && timerInitialized && seconds <= 0;
  const isExpiredAttempt =
    hasTimeLimit &&
    (data.attempt.status === "expired" ||
      autoExpiredBanner ||
      (data.attempt.status === "in_progress" && isTimeUp));
  const closed = data.attempt.status !== "in_progress" || isTimeUp;
  const isReleased = isAttemptResultReleased(data.attempt, data.exam);
  const answerableQuestions = data.questions.filter((q) => q.type !== "learning_resource");
  const answeredCount = answerableQuestions.filter((q) => {
    const val = answers[q.id];
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "string" && val.trim().startsWith("{")) {
      const parsed = parseStructuredAnswer(val);
      return Boolean(
        parsed.linkUrl?.trim() || parsed.fileDataUrl?.trim() || parsed.textResponse?.trim()
      );
    }
    return val !== undefined && val !== null && String(val).trim() !== "";
  }).length;

  // Detect if this is a single Practical Task / Deliverable without conventional Q&A list
  const isSingleDeliverableTask =
    Boolean(data.exam.isTaskOnlyAssignment) ||
    (data.questions.length === 1 &&
      ["practical_task", "link_submission", "file_submission", "learning_resource"].includes(
        data.questions[0]?.type
      ));

  const isLowTime = hasTimeLimit && !closed && seconds > 0 && seconds <= 300;
  const safeSeconds = isExpiredAttempt || closed ? 0 : Math.max(0, seconds);
  const formattedTime = `${Math.floor(safeSeconds / 60).toString().padStart(2, "0")}:${String(
    safeSeconds % 60
  ).padStart(2, "0")}`;

  const reportVm = isReleased
    ? buildExamReportViewModel(
        {
          ...data.attempt,
          answers: data.attempt.answers || answers,
          questions: data.exam.questions || data.questions,
        },
        {
          id: data.exam.id,
          title: data.exam.title,
          subject: data.exam.subject,
          workType: data.exam.workType,
          schoolName: data.exam.schoolName || data.attempt.schoolName,
          maxScore: data.exam.maxScore || data.attempt.maxScore,
          durationMinutes: data.exam.durationMinutes,
          questions: data.exam.questions || data.questions,
        }
      )
    : null;

  const examResourceUrl =
    data.exam.resourceUrl || data.exam.videoUrl || data.exam.learningVideoUrl || "";
  const isPrivateStudentReport =
    !data.attempt.schoolId ||
    data.attempt.schoolId === "private" ||
    (reportVm?.schoolName || "").toLowerCase().includes("private");

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-3 sm:p-5 md:p-8">
      {/* STICKY ASSESSMENT INFO & COUNTDOWN TIMER BAR */}
      <section
        aria-label={`${typeLabels.singular} status and countdown timer`}
        className={`${
          closed ? "" : "sticky top-[52px] sm:top-[56px] z-30"
        } rounded-2xl bg-slate-900/95 backdrop-blur-md p-3.5 sm:p-5 text-white shadow-md border border-slate-800`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <span className="inline-flex items-center rounded-md bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-200">
                {typeLabels.singular}
              </span>
              <h2 className="text-base sm:text-xl font-bold text-white truncate sm:whitespace-normal sm:break-words">
                {data.exam.title}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-300 mt-0.5">
              <span>{data.exam.subject}</span>
              {!closed && answerableQuestions.length > 0 && !isSingleDeliverableTask && (
                <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                  {answeredCount} / {answerableQuestions.length} Answered
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
            {/* View Mode Toggle: Focused Quiz Player vs All Questions List */}
            {!closed && data.questions.length > 1 && !isSingleDeliverableTask && (
              <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("focused")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "focused"
                      ? "bg-red-600 text-white shadow-sm shadow-red-600/40"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Focused Quiz Player (single question step-by-step format)"
                >
                  <Flame size={13} className={viewMode === "focused" ? "text-amber-200" : ""} />
                  <span className="hidden xs:inline">Quiz Player</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "all"
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="View all questions in a scrolling list"
                >
                  <List size={13} />
                  <span className="hidden xs:inline">All Questions</span>
                </button>
              </div>
            )}

            {(hasTimeLimit || closed) && (
              <div
                role={hasTimeLimit ? "timer" : "status"}
                aria-live="off"
                aria-label={closed ? "Assessment status" : `Time remaining ${formattedTime}`}
                className={`rounded-xl border px-3.5 py-2 sm:px-5 sm:py-2.5 text-center shrink-0 transition-colors ${
                  isExpiredAttempt
                    ? "border-red-500/40 bg-red-950/60"
                    : closed
                    ? "border-white/10 bg-white/5"
                    : isLowTime
                    ? "border-red-400/50 bg-red-500/20 animate-pulse"
                    : "border-amber-400/30 bg-white/10"
                }`}
              >
                {isExpiredAttempt ? (
                  <div className="flex items-center gap-2">
                    <Clock className="text-red-400 shrink-0" size={18} />
                    <div className="text-left">
                      <span className="block text-[9px] uppercase tracking-wider font-bold text-red-300 leading-none mb-0.5">
                        Time Expired
                      </span>
                      <span className="font-mono text-base sm:text-xl font-black leading-none text-red-200">
                        00:00 · Closed
                      </span>
                    </div>
                  </div>
                ) : closed ? (
                  <span className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider">
                    {isReleased ? "Released" : data.attempt.status}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Clock
                      className={isLowTime ? "text-red-300 shrink-0" : "text-amber-400 shrink-0"}
                      size={18}
                    />
                    <div className="text-left">
                      <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-300 leading-none mb-0.5">
                        Time Left
                      </span>
                      <span
                        className={`font-mono text-lg sm:text-2xl font-black leading-none ${
                          isLowTime ? "text-red-200" : "text-amber-300"
                        }`}
                      >
                        {formattedTime}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {isExpiredAttempt && (
        <div
          role="alert"
          className="rounded-2xl bg-red-50 dark:bg-red-950/60 p-4 sm:p-5 text-xs sm:text-sm text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800 flex items-start gap-3 shadow-sm"
        >
          <AlertTriangle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-red-950 dark:text-white">
              Assessment Automatically Closed — Time Expired (00:00)
            </p>
            <p className="text-red-800 dark:text-red-200 leading-relaxed">
              Your allocated time for this {typeLabels.lowerSingular} reached{" "}
              <span className="font-mono font-bold">00:00</span>. Your attempt and all saved answers
              have been automatically submitted and locked for grading.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 dark:bg-red-950/50 p-4 text-xs sm:text-sm font-semibold text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-blue-50 dark:bg-blue-950/50 p-4 text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800"
        >
          {notice}
        </p>
      )}

      {/* CLOSED / SUBMITTED RESULT VIEW */}
      {closed ? (
        <section className="space-y-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 md:p-8 shadow-sm">
          {reportVm ? (
            <>
              {/* UNIFIED OFFICIAL REPORT HEADER */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-3 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 size={14} /> Official Released Performance Report
                  </span>
                  <h2 className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white break-words">
                    {reportVm.examTitle}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    {reportVm.examSubject} · Released {reportVm.releasedAtText}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <button
                    onClick={handleDownloadReport}
                    disabled={downloadingPdf}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Download size={16} />
                    {downloadingPdf ? "Generating PDF…" : "Download Official Result PDF"}
                  </button>
                  <button
                    onClick={() => nav("/portal/student/exams")}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <ArrowLeft size={16} />
                    Return to Assessments
                  </button>
                </div>
              </div>

              {/* CANDIDATE & PARTNER SCHOOL METADATA */}
              <div className="grid gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Candidate
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white break-words">
                      {reportVm.studentName}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Class: {reportVm.studentClass}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <School className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {isPrivateStudentReport ? "Enrolment Category" : "Partner School"}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white break-words">
                      {isPrivateStudentReport
                        ? "Private Mentorship (Jaystarbliss Studios)"
                        : reportVm.schoolName}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Submitted: {reportVm.submittedAtText}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Award className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Evaluation Mode
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {reportVm.evaluationMode}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Ref: {reportVm.attemptId.slice(-8)}
                    </p>
                  </div>
                </div>
              </div>

              {/* SCORE & GRADE SUMMARY CARDS */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-blue-200 dark:border-blue-800/70 bg-blue-50/60 dark:bg-blue-950/30 p-3.5 sm:p-4 text-center">
                  <span className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                    Score Obtained
                  </span>
                  <span className="mt-1 block text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {reportVm.rawScore} / {reportVm.maxScore}
                  </span>
                </div>
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 sm:p-4 text-center">
                  <span className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Percentage
                  </span>
                  <span className="mt-1 block text-xl sm:text-2xl font-black text-emerald-950 dark:text-emerald-200">
                    {reportVm.percentage}%
                  </span>
                </div>
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/60 dark:bg-indigo-950/30 p-3.5 sm:p-4 text-center col-span-2">
                  <span className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                    Assessment Grade &amp; Standing
                  </span>
                  <span className="mt-1 block text-lg sm:text-xl font-black text-indigo-950 dark:text-indigo-200">
                    {reportVm.grade}
                  </span>
                </div>
              </div>

              {/* EXAMINER FEEDBACK */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Examiner Remarks &amp; Academic Feedback
                </p>
                <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-200 break-words">
                  {reportVm.feedbackText}
                </p>
              </div>

              {/* QUESTION-BY-QUESTION BREAKDOWN */}
              {reportVm.questionRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Submission &amp; Question Review ({reportVm.questionRows.length})
                    </h3>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Total Marks: {reportVm.maxScore}
                    </span>
                  </div>

                  {/* MOBILE CARDS FOR QUESTION REVIEW */}
                  <div className="space-y-3 md:hidden">
                    {reportVm.questionRows.map((row) => (
                      <div
                        key={row.questionId}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            Q{row.index}. {row.prompt}
                          </span>
                          <span
                            className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              row.status === "PASS"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : row.status === "PART"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                            }`}
                          >
                            {row.pointsAwarded}/{row.maxPoints} ({row.status})
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                          <p>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              Your Submission:{" "}
                            </span>
                            <span
                              className={`font-semibold ${
                                row.isCorrect
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-slate-800 dark:text-slate-200"
                              }`}
                            >
                              {row.studentAnswerText}
                            </span>
                          </p>
                          <p>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              Official Key:{" "}
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {row.officialAnswerText}
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DESKTOP TABLE FOR QUESTION REVIEW */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-900 text-white text-xs uppercase">
                        <tr>
                          <th className="p-3 w-10 text-center">#</th>
                          <th className="p-3">Question / Task</th>
                          <th className="p-3">Your Submission</th>
                          <th className="p-3">Official Answer Key</th>
                          <th className="p-3 text-center">Marks</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {reportVm.questionRows.map((row) => (
                          <tr
                            key={row.questionId}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                              {row.index}
                            </td>
                            <td className="p-3 font-medium text-slate-900 dark:text-white">
                              {row.prompt}
                            </td>
                            <td
                              className={`p-3 font-semibold ${
                                row.isCorrect
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-slate-800 dark:text-slate-200"
                              }`}
                            >
                              {row.studentAnswerText}
                            </td>
                            <td className="p-3 text-slate-700 dark:text-slate-300">
                              {row.officialAnswerText}
                            </td>
                            <td className="p-3 text-center font-bold text-slate-900 dark:text-white">
                              {row.pointsAwarded} / {row.maxPoints}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                  row.status === "PASS"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    : row.status === "PART"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                    : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 space-y-4">
              {isExpiredAttempt ? (
                <Clock size={48} className="mx-auto text-red-600 dark:text-red-400" />
              ) : (
                <CheckCircle2 size={48} className="mx-auto text-emerald-600 dark:text-emerald-400" />
              )}
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {isExpiredAttempt
                    ? `${typeLabels.singular} Automatically Closed — Time Expired`
                    : `${typeLabels.singular} Submitted Successfully`}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {isExpiredAttempt
                    ? `Your allocated time reached 00:00. Your ${typeLabels.lowerSingular} attempt was automatically submitted and recorded in the central academic ledger.`
                    : `Your ${typeLabels.lowerSingular} submission has been securely recorded in the central academic ledger.`}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 p-4 max-w-md mx-auto text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center justify-center gap-1.5">
                  <Lock size={14} className="shrink-0" />
                  Awaiting Tutor Review &amp; Result Release
                </p>
                <p className="text-amber-800 dark:text-amber-300">
                  Official scores, tutor remarks, and your printable performance report remain locked
                  until your tutor reviews and releases the results.
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Printing is disabled until your tutor releases the result."
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-200 dark:bg-slate-800 px-5 py-3 text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 opacity-60 cursor-not-allowed"
                >
                  <Lock size={16} />
                  Print Official Result PDF (Awaiting Tutor Release)
                </button>
                <button
                  onClick={() => nav("/portal/student/exams")}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <ArrowLeft size={16} />
                  Return to Assessments
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          {viewMode === "focused" && !isSingleDeliverableTask && data.questions.length > 0 ? (
            /* FOCUSED QUIZ PLAYER (MATCHING REFERENCE DESIGN) */
            (() => {
              const safeCurrentIndex = Math.max(
                0,
                Math.min(data.questions.length - 1, currentQuestionIndex)
              );
              const currentQ = data.questions[safeCurrentIndex];
              const currentQMediaUrl = currentQ.resourceUrl || currentQ.videoUrl || "";
              const structured = parseStructuredAnswer(answers[currentQ.id]);
              const subMethod =
                currentQ.submissionMethod ||
                (currentQ.type === "link_submission"
                  ? "link"
                  : currentQ.type === "file_submission"
                  ? "file"
                  : "both");
              const showLinkInput =
                currentQ.type === "link_submission" ||
                (currentQ.type === "practical_task" && ["both", "link"].includes(subMethod));
              const showFileInput =
                currentQ.type === "file_submission" ||
                (currentQ.type === "practical_task" && ["both", "file"].includes(subMethod));
              const showTextInput =
                currentQ.type === "practical_task" &&
                ["both", "text", "link", "file"].includes(subMethod);

              return (
                <section className="space-y-6 pt-1 pb-6 max-w-3xl mx-auto">
                  {/* TOP TITLE & MOTTO WITH GLOWING FLAMES */}
                  <div className="text-center py-2 sm:py-4 space-y-2">
                    <div className="inline-flex items-center justify-center gap-2.5">
                      <Flame className="text-red-500 fill-red-500 animate-pulse" size={28} />
                      <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
                        Quiz Time
                      </h1>
                      <Flame className="text-red-500 fill-red-500 animate-pulse" size={28} />
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                      Answer the questions below to test what you've learned.
                    </p>
                  </div>

                  {/* INSTRUCTIONS, DELIVERABLES & REFERENCE LEARNING MATERIALS IN QUIZ PLAYER */}
                  {(data.exam.instructions ||
                    data.exam.deliverables ||
                    examResourceUrl ||
                    (Array.isArray(data.exam.learningResources) &&
                      data.exam.learningResources.length > 0)) && (
                    <div className="rounded-2xl border border-white/10 bg-[#131418] p-4 sm:p-5 space-y-3">
                      {data.exam.instructions && (
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-blue-400">
                            {typeLabels.singular} Instructions &amp; Brief
                          </p>
                          <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {data.exam.instructions}
                          </p>
                        </div>
                      )}
                      {data.exam.deliverables && (
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                            Deliverables &amp; Expectations
                          </p>
                          <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {data.exam.deliverables}
                          </p>
                        </div>
                      )}
                      {examResourceUrl && (
                        <EmbeddedLearningMedia
                          url={examResourceUrl}
                          title={
                            data.exam.resourceTitle ||
                            `${typeLabels.singular} Learning Video / Reference Material`
                          }
                          hideExternalLink={true}
                        />
                      )}
                      {Array.isArray(data.exam.learningResources) &&
                        data.exam.learningResources
                          .filter((r) => (r.url || r.youtubeUrl) && (r.url || r.youtubeUrl) !== examResourceUrl)
                          .map((resItem, rIdx) => (
                            <div key={resItem.id || rIdx} className="space-y-1.5">
                              {resItem.instructions && (
                                <p className="text-xs text-slate-300">{resItem.instructions}</p>
                              )}
                              <EmbeddedLearningMedia
                                url={resItem.url || resItem.youtubeUrl || ""}
                                title={resItem.title || `Learning Resource ${rIdx + 1}`}
                                hideExternalLink={true}
                              />
                            </div>
                          ))}
                    </div>
                  )}

                  {/* PROGRESS BAR & QUESTIONS COUNTERS */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-400">
                      <span>
                        Question {safeCurrentIndex + 1} of {data.questions.length}
                      </span>
                      <span className="text-slate-300">
                        {answeredCount} answered
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800/90 overflow-hidden">
                      <div
                        className="h-full bg-red-600 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(239,68,68,0.7)]"
                        style={{
                          width: `${Math.max(
                            4,
                            Math.min(100, ((safeCurrentIndex + 1) / data.questions.length) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* FOCUSED QUESTION CARD */}
                  <article className="rounded-2xl border border-white/10 bg-[#131418] p-5 sm:p-8 shadow-2xl space-y-6 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base sm:text-xl font-bold text-white leading-relaxed">
                        <span className="text-red-500 font-extrabold mr-2">
                          {safeCurrentIndex + 1}.
                        </span>
                        {currentQ.prompt}
                      </h2>
                      {currentQ.points > 0 && (
                        <span className="shrink-0 text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                          {currentQ.points} pt{currentQ.points > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Deliverable instructions if provided */}
                    {currentQ.deliverableInstructions && (
                      <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 text-xs sm:text-sm text-slate-300 whitespace-pre-wrap">
                        {currentQ.deliverableInstructions}
                      </div>
                    )}

                    {/* Question media if present */}
                    {currentQMediaUrl && currentQMediaUrl !== examResourceUrl && (
                      <div className="rounded-xl overflow-hidden border border-white/10">
                        <EmbeddedLearningMedia
                          url={currentQMediaUrl}
                          title={currentQ.prompt || "Question Media"}
                          hideExternalLink={true}
                        />
                      </div>
                    )}

                    {/* QUESTION OPTIONS */}
                    {currentQ.type === "learning_resource" ? (
                      <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/60 p-4 flex items-center gap-3 text-xs font-semibold text-emerald-200">
                        <Video size={18} className="text-emerald-400 shrink-0" />
                        <span>
                          Review the learning resource above carefully. No written answer is required for this step.
                        </span>
                      </div>
                    ) : ["single_choice", "true_false"].includes(currentQ.type) ? (
                      <div className="space-y-3">
                        {(currentQ.options || []).map((o) => {
                          const isSelected = answers[currentQ.id] === o.id;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                setAnswers((prev) => ({ ...prev, [currentQ.id]: o.id }));
                                if (error) setError("");
                              }}
                              className={`w-full text-left rounded-xl p-4 sm:p-5 transition-all text-sm sm:text-base font-semibold cursor-pointer select-none ${
                                isSelected
                                  ? "bg-[#1f2029] border-2 border-white text-white shadow-lg ring-1 ring-white/10"
                                  : "bg-[#17181e] border border-white/10 text-slate-300 hover:border-white/30 hover:bg-[#1f2029]"
                              }`}
                            >
                              {o.text}
                            </button>
                          );
                        })}
                      </div>
                    ) : currentQ.type === "multiple_choice" ? (
                      <div className="space-y-3">
                        {(currentQ.options || []).map((o) => {
                          const isSelected =
                            Array.isArray(answers[currentQ.id]) &&
                            (answers[currentQ.id] as string[]).includes(o.id);
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                const current = (answers[currentQ.id] as string[]) || [];
                                const next = isSelected
                                  ? current.filter((v) => v !== o.id)
                                  : [...current, o.id];
                                setAnswers((prev) => ({ ...prev, [currentQ.id]: next }));
                                if (error) setError("");
                              }}
                              className={`w-full text-left rounded-xl p-4 sm:p-5 transition-all text-sm sm:text-base font-semibold cursor-pointer select-none flex items-center justify-between ${
                                isSelected
                                  ? "bg-[#1f2029] border-2 border-white text-white shadow-lg ring-1 ring-white/10"
                                  : "bg-[#17181e] border border-white/10 text-slate-300 hover:border-white/30 hover:bg-[#1f2029]"
                              }`}
                            >
                              <span>{o.text}</span>
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                                  isSelected
                                    ? "bg-red-600 border-red-500 text-white"
                                    : "border-white/20 bg-white/5"
                                }`}
                              >
                                {isSelected && <Check size={13} className="stroke-[3]" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : currentQ.type === "dropdown" ? (
                      <select
                        value={String(answers[currentQ.id] || "")}
                        onChange={(e) => {
                          setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }));
                          if (error) setError("");
                        }}
                        className="w-full rounded-xl border border-white/15 bg-[#17181e] p-4 text-sm sm:text-base font-semibold text-white outline-none focus:border-red-500 transition-colors"
                      >
                        <option value="" className="bg-slate-900 text-slate-400">
                          Select an option…
                        </option>
                        {(currentQ.options || []).map((o) => (
                          <option key={o.id} value={o.id} className="bg-slate-900 text-white">
                            {o.text}
                          </option>
                        ))}
                      </select>
                    ) : ["essay", "long_answer", "short_answer"].includes(currentQ.type) ? (
                      <textarea
                        rows={currentQ.type === "short_answer" ? 3 : 6}
                        maxLength={10000}
                        className="w-full rounded-xl border border-white/15 bg-[#17181e] p-4 text-sm sm:text-base text-white placeholder-slate-500 outline-none focus:border-red-500 transition-colors"
                        value={String(answers[currentQ.id] || "")}
                        onChange={(e) => {
                          setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }));
                          if (error) setError("");
                        }}
                        placeholder={
                          currentQ.type === "short_answer"
                            ? "Type your short answer here…"
                            : "Type your detailed response here…"
                        }
                      />
                    ) : (
                      /* Deliverables & practical task */
                      <div className="space-y-4 pt-1">
                        {subMethod === "none" ? (
                          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 text-xs font-semibold text-slate-300">
                            Complete this practical activity as instructed. No online file or link
                            upload is required.
                          </div>
                        ) : (
                          <>
                            {showLinkInput && (() => {
                              const linkValidation = validateSubmissionLink(structured.linkUrl);
                              return (
                                <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-white">
                                      <Link2 size={15} className="text-red-400" />
                                      Submit Project or Shared Link (Google Drive, Scratch, GitHub, Canva, etc.)
                                    </label>
                                    {linkValidation.hasValue && (
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                          linkValidation.isValid
                                            ? "bg-emerald-950/60 border border-emerald-700 text-emerald-300"
                                            : "bg-red-950/60 border border-red-700 text-red-300"
                                        }`}
                                      >
                                        {linkValidation.isValid ? (
                                          <>
                                            <Check size={11} /> Valid Link Format
                                          </>
                                        ) : (
                                          <>
                                            <AlertTriangle size={11} /> Invalid URL
                                          </>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  <input
                                    type="url"
                                    value={structured.linkUrl || ""}
                                    onChange={(e) => {
                                      updateStructuredAnswer(currentQ.id, {
                                        linkUrl: e.target.value,
                                      });
                                      if (error) setError("");
                                    }}
                                    placeholder="https://drive.google.com/... or https://scratch.mit.edu/projects/..."
                                    className={`w-full rounded-xl border bg-[#17181e] px-3.5 py-2.5 text-sm text-white outline-none transition-colors ${
                                      linkValidation.hasValue && !linkValidation.isValid
                                        ? "border-red-500 focus:border-red-400"
                                        : linkValidation.hasValue && linkValidation.isValid
                                        ? "border-emerald-500 focus:border-emerald-400"
                                        : "border-white/15 focus:border-red-500"
                                    }`}
                                  />
                                  {linkValidation.hasValue && !linkValidation.isValid && (
                                    <p className="flex items-start gap-1.5 text-xs font-semibold text-red-300 bg-red-950/40 border border-red-800 rounded-lg p-2.5">
                                      <AlertTriangle
                                        size={14}
                                        className="mt-0.5 shrink-0 text-red-400"
                                      />
                                      <span>{linkValidation.errorMessage}</span>
                                    </p>
                                  )}
                                  {linkValidation.hasValue && linkValidation.isGoogleDrive && (
                                    <div className="rounded-xl border border-amber-800/80 bg-amber-950/40 p-3 space-y-2">
                                      <div className="flex items-start gap-2">
                                        <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                        <div className="text-xs text-amber-200 space-y-1">
                                          <p className="font-bold text-amber-300">
                                            Google Drive Sharing Permission Check
                                          </p>
                                          <p className="text-slate-300 leading-relaxed">
                                            Please ensure your file or folder is set to{" "}
                                            <strong className="text-white underline">
                                              "Anyone with the link can view"
                                            </strong>{" "}
                                            so your tutor can access and grade your work.
                                          </p>
                                        </div>
                                      </div>
                                      <label className="flex items-center gap-2.5 cursor-pointer pt-1 border-t border-amber-800/50">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(drivePermissionConfirmed[currentQ.id])}
                                          onChange={(e) => {
                                            setDrivePermissionConfirmed((prev) => ({
                                              ...prev,
                                              [currentQ.id]: e.target.checked,
                                            }));
                                            if (error) setError("");
                                          }}
                                          className="h-4 w-4 rounded border-amber-700 text-red-600 focus:ring-red-500"
                                        />
                                        <span className="text-xs font-bold text-amber-200">
                                          I confirm that this Google Drive link is set to "Anyone
                                          with the link can view"
                                        </span>
                                      </label>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {showFileInput && (
                              <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-2">
                                <label className="flex items-center gap-2 text-xs font-bold text-white">
                                  <Upload size={15} className="text-red-400" />
                                  Attach File Deliverable (PDF, Code, ZIP, Scratch .sb3, Screenshots)
                                </label>
                                {structured.fileName ? (
                                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-[#17181e] p-3 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText size={18} className="text-red-400 shrink-0" />
                                      <span className="font-bold text-white truncate">
                                        {structured.fileName}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateStructuredAnswer(currentQ.id, {
                                          fileName: "",
                                          fileDataUrl: "",
                                          fileSize: 0,
                                          fileType: "",
                                        })
                                      }
                                      className="text-red-400 hover:text-red-300 p-1"
                                      title="Remove file"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex flex-col items-center justify-center p-5 rounded-xl border border-dashed border-white/20 hover:border-red-500 bg-[#17181e]/60 cursor-pointer transition-colors text-center">
                                    <Upload size={22} className="text-slate-400 mb-2" />
                                    <p className="text-xs sm:text-sm font-bold text-white">
                                      {uploadingQId === currentQ.id
                                        ? "Attaching file…"
                                        : "Click to select a file from your device"}
                                    </p>
                                    <input
                                      type="file"
                                      accept={
                                        currentQ.acceptedFileTypes ||
                                        ".pdf,.png,.jpg,.jpeg,.zip,.sb3,.py,.html,.js,.doc,.docx"
                                      }
                                      className="hidden"
                                      onChange={(e) =>
                                        handleFileChange(currentQ, e.target.files?.[0] || null)
                                      }
                                    />
                                  </label>
                                )}
                              </div>
                            )}

                            {showTextInput && (
                              <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-300">
                                  {subMethod === "text"
                                    ? "Your Written Response"
                                    : "Additional Notes (Optional)"}
                                </label>
                                <textarea
                                  rows={subMethod === "text" ? 5 : 3}
                                  maxLength={10000}
                                  value={structured.textResponse || ""}
                                  onChange={(e) =>
                                    updateStructuredAnswer(currentQ.id, {
                                      textResponse: e.target.value,
                                    })
                                  }
                                  placeholder="Add any notes or written response here…"
                                  className="w-full rounded-xl border border-white/15 bg-[#17181e] p-3.5 text-sm text-white outline-none focus:border-red-500"
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>

                  {/* NAVIGATION CONTROLS */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      disabled={safeCurrentIndex === 0}
                      onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                      className="rounded-full px-7 py-2.5 text-sm font-bold border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                    >
                      Back
                    </button>

                    {safeCurrentIndex < data.questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentQuestionIndex((prev) =>
                            Math.min(data.questions.length - 1, prev + 1)
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold px-8 py-2.5 text-sm shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Next <ChevronRight size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowReviewModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold px-8 py-2.5 text-sm shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Review &amp; Finish <ChevronRight size={16} />
                      </button>
                    )}
                  </div>

                  {/* PAGINATION NUMBERS STRIP */}
                  <div className="pt-6">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {data.questions.map((q, idx) => {
                        const isCurrent = idx === safeCurrentIndex;
                        const isAns = isQuestionAnswered(q);
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => setCurrentQuestionIndex(idx)}
                            aria-label={`Question ${idx + 1} (${
                              isAns ? "Answered" : "Unanswered"
                            })`}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center transition-all ${
                              isCurrent
                                ? "bg-red-600 text-white ring-4 ring-red-500/20 scale-110 shadow-lg shadow-red-600/50 z-10 font-extrabold"
                                : isAns
                                ? "bg-red-950/70 border border-red-800/80 text-red-300 hover:bg-red-900/80"
                                : "bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })()
          ) : (
            /* ALL QUESTIONS LIST VIEW (CLASSIC LIST) */
            <>
              {(data.exam.instructions || data.exam.deliverables) && (
                <section className="rounded-2xl border border-blue-200 dark:border-blue-800/70 bg-blue-50/60 dark:bg-blue-950/30 p-4 sm:p-5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 space-y-3">
                  {data.exam.instructions && (
                    <div className="space-y-1">
                      <p className="font-bold text-blue-950 dark:text-blue-200">
                        {typeLabels.singular} Instructions &amp; Brief
                      </p>
                      <p className="leading-relaxed whitespace-pre-wrap break-words">
                        {data.exam.instructions}
                      </p>
                    </div>
                  )}
                  {data.exam.deliverables && (
                    <div className="pt-2 border-t border-blue-200/70 dark:border-blue-800/50 space-y-1">
                      <p className="font-bold text-emerald-900 dark:text-emerald-300">
                        Deliverables &amp; Expectations
                      </p>
                      <p className="leading-relaxed whitespace-pre-wrap break-words">
                        {data.exam.deliverables}
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* Exam-Level Embedded Learning Video / Resource */}
              {examResourceUrl && (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
                  <EmbeddedLearningMedia
                    url={examResourceUrl}
                    title={
                      data.exam.resourceTitle ||
                      `${typeLabels.singular} Learning Video / Reference Material`
                    }
                    hideExternalLink={true}
                  />
                </section>
              )}

              {/* Additional Structured Learning Resources */}
              {Array.isArray(data.exam.learningResources) &&
                data.exam.learningResources
                  .filter((r) => (r.url || r.youtubeUrl) && (r.url || r.youtubeUrl) !== examResourceUrl)
                  .map((resItem, rIdx) => (
                    <section
                      key={resItem.id || rIdx}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-2"
                    >
                      {resItem.instructions && (
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                          {resItem.instructions}
                        </p>
                      )}
                      <EmbeddedLearningMedia
                        url={resItem.url || resItem.youtubeUrl || ""}
                        title={resItem.title || `Learning Resource ${rIdx + 1}`}
                        hideExternalLink={true}
                      />
                    </section>
                  ))}

              <section className="space-y-4 sm:space-y-5">
                {data.questions.map((q, i) => {
              const qMediaUrl = q.resourceUrl || q.videoUrl || "";
              const structured = parseStructuredAnswer(answers[q.id]);
              const subMethod =
                q.submissionMethod ||
                (q.type === "link_submission"
                  ? "link"
                  : q.type === "file_submission"
                  ? "file"
                  : "both");
              const showLinkInput =
                q.type === "link_submission" ||
                (q.type === "practical_task" && ["both", "link"].includes(subMethod));
              const showFileInput =
                q.type === "file_submission" ||
                (q.type === "practical_task" && ["both", "file"].includes(subMethod));
              const showTextInput =
                q.type === "practical_task" && ["both", "text", "link", "file"].includes(subMethod);

              return (
                <article
                  key={q.id}
                  className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                    <div className="space-y-1 min-w-0">
                      {isSingleDeliverableTask ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                          Practical Deliverable Workspace
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Item {i + 1} • {q.type.replace(/_/g, " ")}
                        </span>
                      )}
                      <h2 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base whitespace-pre-wrap break-words">
                        {isSingleDeliverableTask ? q.prompt : `${i + 1}. ${q.prompt}`}
                      </h2>
                    </div>
                    {q.type === "learning_resource" ? (
                      <span className="self-start rounded-lg bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                        Learning Material (Ungraded)
                      </span>
                    ) : (
                      <span className="self-start rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 shrink-0">
                        {q.points} mark(s)
                      </span>
                    )}
                  </div>

                  {/* Deliverable Instructions if provided */}
                  {q.deliverableInstructions && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-3.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                      {q.deliverableInstructions}
                    </div>
                  )}

                  {/* Embedded Video / Learning Material inside Question Block */}
                  {qMediaUrl && qMediaUrl !== examResourceUrl && (
                    <EmbeddedLearningMedia
                      url={qMediaUrl}
                      title={q.prompt || "Learning Media"}
                      hideExternalLink={true}
                    />
                  )}

                  {/* Content/Question Type Specific Inputs */}
                  {q.type === "learning_resource" ? (
                    <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-800/60 p-3.5 flex items-center gap-2.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      <Video size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Review the learning resource above carefully before proceeding to the next
                        section. No written answer is required for this block.
                      </span>
                    </div>
                  ) : ["single_choice", "true_false"].includes(q.type) ? (
                    <div className="space-y-2">
                      {(q.options || []).map((o) => (
                        <label
                          key={o.id}
                          className={`flex items-start sm:items-center gap-3 rounded-xl border p-3.5 cursor-pointer text-xs sm:text-sm font-medium transition-all ${
                            answers[q.id] === o.id
                              ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 font-semibold"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            className="mt-0.5 sm:mt-0 h-4 w-4 shrink-0 text-blue-600 focus:ring-blue-500"
                            checked={answers[q.id] === o.id}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                          />
                          <span className="break-words min-w-0">
                            <strong className="mr-1">{o.id}.</strong> {o.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : q.type === "dropdown" ? (
                    <select
                      value={String(answers[q.id] || "")}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-blue-500"
                    >
                      <option value="">Select an option…</option>
                      {(q.options || []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.id}. {o.text}
                        </option>
                      ))}
                    </select>
                  ) : q.type === "multiple_choice" ? (
                    <div className="space-y-2">
                      {(q.options || []).map((o) => {
                        const isChecked =
                          Array.isArray(answers[q.id]) &&
                          (answers[q.id] as string[]).includes(o.id);
                        return (
                          <label
                            key={o.id}
                            className={`flex items-start sm:items-center gap-3 rounded-xl border p-3.5 cursor-pointer text-xs sm:text-sm font-medium transition-all ${
                              isChecked
                                ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 font-semibold"
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 sm:mt-0 h-4 w-4 shrink-0 rounded text-blue-600 focus:ring-blue-500"
                              checked={isChecked}
                              onChange={(e) =>
                                setAnswers((prev) => {
                                  const current = (prev[q.id] as string[]) || [];
                                  const next = e.target.checked
                                    ? [...current, o.id]
                                    : current.filter((v) => v !== o.id);
                                  return { ...prev, [q.id]: next };
                                })
                              }
                            />
                            <span className="break-words min-w-0">
                              <strong className="mr-1">{o.id}.</strong> {o.text}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : ["practical_task", "link_submission", "file_submission"].includes(q.type) ? (
                    <div className="space-y-4 pt-1">
                      {subMethod === "none" ? (
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Complete this practical activity as instructed. No online file or link
                          upload is required.
                        </div>
                      ) : (
                        <>
                          {/* Link Submission Field */}
                          {showLinkInput && (() => {
                            const linkValidation = validateSubmissionLink(structured.linkUrl);
                            return (
                              <div className="rounded-xl border border-blue-200/80 dark:border-blue-800/60 bg-blue-50/30 dark:bg-blue-950/20 p-4 space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <label className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                                    <Link2 size={15} className="text-blue-600 dark:text-blue-400" />
                                    Submit Project or Shared Link (Google Drive, Scratch, GitHub, Canva, etc.)
                                  </label>
                                  {linkValidation.hasValue && (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                        linkValidation.isValid
                                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                          : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                                      }`}
                                    >
                                      {linkValidation.isValid ? (
                                        <>
                                          <Check size={11} /> Valid Link Format
                                        </>
                                      ) : (
                                        <>
                                          <AlertTriangle size={11} /> Invalid URL
                                        </>
                                      )}
                                    </span>
                                  )}
                                </div>
                                <input
                                  type="url"
                                  value={structured.linkUrl || ""}
                                  onChange={(e) => {
                                    updateStructuredAnswer(q.id, { linkUrl: e.target.value });
                                    if (error) setError("");
                                  }}
                                  placeholder="https://drive.google.com/... or https://scratch.mit.edu/projects/..."
                                  className={`w-full rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none transition-colors ${
                                    linkValidation.hasValue && !linkValidation.isValid
                                      ? "border-red-400 dark:border-red-600 focus:border-red-500"
                                      : linkValidation.hasValue && linkValidation.isValid
                                      ? "border-emerald-400 dark:border-emerald-600 focus:border-emerald-500"
                                      : "border-slate-300 dark:border-slate-700 focus:border-blue-500"
                                  }`}
                                />

                                {/* Inline URL Format Validation Error */}
                                {linkValidation.hasValue && !linkValidation.isValid && (
                                  <p className="flex items-start gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-lg p-2.5">
                                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                                    <span>{linkValidation.errorMessage}</span>
                                  </p>
                                )}

                                {/* Google Drive Sharing Permissions Reminder Prompt */}
                                {linkValidation.hasValue && linkValidation.isValid && linkValidation.isGoogleDrive ? (
                                  <div className="rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/40 p-3.5 space-y-2.5">
                                    <div className="flex items-start gap-2 text-xs text-amber-950 dark:text-amber-200">
                                      <AlertTriangle size={15} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                      <div className="space-y-1">
                                        <p className="font-bold">
                                          Google Drive / Google Docs Link Detected — Check Sharing Permissions
                                        </p>
                                        <p className="text-[11px] text-amber-900 dark:text-amber-300 leading-relaxed">
                                          Before submitting, open your file in Google Drive, click <strong>Share</strong>, and set General Access to{" "}
                                          <strong>&ldquo;Anyone with the link can view&rdquo;</strong> so your tutor can open and grade your submission without requesting access.
                                        </p>
                                      </div>
                                    </div>
                                    <label className="flex items-center gap-2.5 pt-1 cursor-pointer text-xs font-bold text-amber-950 dark:text-amber-100 select-none">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(drivePermissionConfirmed[q.id])}
                                        onChange={(e) => {
                                          setDrivePermissionConfirmed((prev) => ({
                                            ...prev,
                                            [q.id]: e.target.checked,
                                          }));
                                          if (e.target.checked && error) setError("");
                                        }}
                                        className="h-4 w-4 rounded border-amber-400 text-blue-600 focus:ring-blue-500"
                                      />
                                      <span className="flex items-center gap-1.5">
                                        <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        I confirm that my Google Drive link is set to &ldquo;Anyone with the link can view&rdquo;
                                      </span>
                                    </label>
                                  </div>
                                ) : (
                                  <p className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                                    <Info size={13} className="mt-0.5 text-blue-600 shrink-0" />
                                    <span>
                                      Make sure your link sharing permission is set to{" "}
                                      <strong>&ldquo;Anyone with the link can view&rdquo;</strong> so your tutor can open and grade your work.
                                    </span>
                                  </p>
                                )}
                              </div>
                            );
                          })()}

                          {/* File Upload Submission Field */}
                          {showFileInput && (
                            <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                                  <Upload
                                    size={15}
                                    className="text-indigo-600 dark:text-indigo-400"
                                  />
                                  Upload Deliverable File
                                </label>
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                  Accepted:{" "}
                                  {q.acceptedFileTypes || ".pdf,.png,.jpg,.jpeg,.zip,.sb3,.doc,.docx"}{" "}
                                  (Max {q.maxFileSizeMb || 10}MB)
                                </span>
                              </div>

                              {structured.fileName ? (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-white dark:bg-slate-900 p-3.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                                      <Check size={18} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                        {structured.fileName}
                                      </p>
                                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                                        ✓ File attached{" "}
                                        {structured.fileSize
                                          ? `(${(structured.fileSize / 1024).toFixed(1)} KB)`
                                          : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateStructuredAnswer(q.id, {
                                        fileName: "",
                                        fileSize: 0,
                                        fileType: "",
                                        fileDataUrl: "",
                                      })
                                    }
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:bg-red-100 cursor-pointer shrink-0"
                                  >
                                    <Trash2 size={13} />
                                    Remove / Replace File
                                  </button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 text-center cursor-pointer hover:border-indigo-500 transition-colors">
                                  <FileText
                                    size={24}
                                    className="text-indigo-600 dark:text-indigo-400"
                                  />
                                  <div className="space-y-0.5">
                                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                      {uploadingQId === q.id
                                        ? "Attaching file…"
                                        : "Click to choose a file from your device"}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      Supports PDF, screenshots/images, ZIP archives, Scratch (.sb3),
                                      or documents
                                    </p>
                                  </div>
                                  <input
                                    type="file"
                                    accept={
                                      q.acceptedFileTypes ||
                                      ".pdf,.png,.jpg,.jpeg,.zip,.sb3,.py,.html,.js,.doc,.docx,.ppt,.pptx"
                                    }
                                    className="hidden"
                                    onChange={(e) =>
                                      handleFileChange(q, e.target.files?.[0] || null)
                                    }
                                  />
                                </label>
                              )}
                            </div>
                          )}

                          {/* Optional Written Notes / Explanation for Practical Task */}
                          {showTextInput && (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                {subMethod === "text"
                                  ? "Your Written Response / Deliverable"
                                  : "Additional Notes or Comments for Your Tutor (Optional)"}
                              </label>
                              <textarea
                                rows={subMethod === "text" ? 5 : 3}
                                maxLength={10000}
                                value={structured.textResponse || ""}
                                onChange={(e) =>
                                  updateStructuredAnswer(q.id, { textResponse: e.target.value })
                                }
                                placeholder="Add any notes, explanation of your project, or written response here…"
                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <textarea
                      rows={q.type === "essay" || q.type === "long_answer" ? 6 : 3}
                      maxLength={10000}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                      value={String(answers[q.id] || "")}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={
                        q.type === "short_answer"
                          ? "Type your short answer here…"
                          : "Type your detailed response here…"
                      }
                    />
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}

      {/* STICKY AUTOSAVE & SUBMIT FOOTER */}
      <footer className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 sm:p-4 shadow-lg space-y-3">
        {confirmingSubmit ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-200">
              Submit your {typeLabels.lowerSingular} now? Submissions are sent directly to your
              tutor for grading.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingSubmit(false)}
                className="flex-1 sm:flex-initial rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("submit")}
                className="flex-1 sm:flex-initial rounded-xl bg-red-600 px-5 py-2 text-xs sm:text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Submitting…" : `Confirm ${typeLabels.submitLabel}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-2.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {saveStatus === "pending"
                  ? "Pending autosave…"
                  : saveStatus === "saving"
                  ? "Saving progress…"
                  : saveStatus === "error"
                  ? "Autosave delayed"
                  : "✓ All progress saved"}
              </span>
              {hasTimeLimit && (
                <span
                  className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${
                    isLowTime
                      ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800"
                      : "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800"
                  }`}
                >
                  <Clock size={13} className="shrink-0" />
                  {formattedTime}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("save")}
                className="flex-1 sm:flex-initial rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save Progress"}
              </button>
              {viewMode === "focused" && (
                <button
                  type="button"
                  onClick={() => setShowReviewModal(true)}
                  className="flex-1 sm:flex-initial rounded-xl border border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/40 px-4 py-2.5 text-xs sm:text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
                >
                  Review Answers ({answeredCount}/{data.questions.length})
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={handleInitiateSubmit}
                className="flex-1 sm:flex-initial rounded-xl bg-red-600 px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-red-700 shadow-sm disabled:opacity-50"
              >
                {typeLabels.submitLabel}
              </button>
            </div>
          </div>
        )}
      </footer>

      {/* REVIEW & SUBMIT MODAL */}
      {showReviewModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="relative w-full max-w-xl rounded-2xl border border-white/15 bg-[#141418] p-6 shadow-2xl text-white space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Flame className="text-red-500 fill-red-500" size={24} />
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  Review Assessment Answers
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Answered</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">
                  {answeredCount} / {answerableQuestions.length}
                </p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Unanswered</p>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {Math.max(0, answerableQuestions.length - answeredCount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Question Quick-Jump
              </p>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-52 overflow-y-auto pr-1">
                {data.questions.map((q, idx) => {
                  const isAns = isQuestionAnswered(q);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setCurrentQuestionIndex(idx);
                        setShowReviewModal(false);
                      }}
                      title={`Go to Question ${idx + 1}`}
                      className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                        isAns
                          ? "bg-red-950/60 border-red-800 text-red-300 hover:bg-red-900/80"
                          : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      #{idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {Math.max(0, answerableQuestions.length - answeredCount) > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300">
                <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                <span>
                  You have {Math.max(0, answerableQuestions.length - answeredCount)} unanswered question(s). You can jump back to complete them or submit now.
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white font-semibold text-sm"
              >
                Back to Quiz
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowReviewModal(false);
                  handleInitiateSubmit();
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 disabled:opacity-50"
              >
                {busy ? "Submitting…" : `Submit ${typeLabels.singular}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )}
    </main>
  );
}
