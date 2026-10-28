import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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
} from "../../lib/classes";
import {
  buildExamReportViewModel,
  generateExamReportPdf,
} from "../../lib/examReportPdfGenerator";
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
    deadlineAt: string;
    score?: number;
    maxScore?: number;
    percentage?: number;
    submittedAt?: unknown;
    releasedAt?: unknown;
    resultReleased?: boolean;
    autoGraded?: boolean;
    answers?: Record<string, string | string[]>;
    feedback?: string;
    questionsSnapshot?: Q[];
    questionResults?: {
      questionId: string;
      answer?: string | string[];
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
    schoolId?: string;
    schoolName?: string;
    maxScore?: number;
    instructions?: string;
    durationMinutes?: number;
    gradingMode?: string;
    questions?: Q[];
  };
  questions: Q[];
};

export default function StudentExamAttempt() {
  const { attemptId = "" } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<D | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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

      // Keep assessment reads behind the authenticated server endpoint. Direct
      // client fallback reads amplify Firestore usage and can bypass server-side
      // access controls if client rules are accidentally broad.
      if (!loadedData) {
        throw new Error("The assessment service is temporarily unavailable. Please try again shortly.");
      }      } else {
        // Ensure partner school name is resolved if missing or placeholder
        const effectiveSchoolId = String(
          loadedData.attempt.schoolId || loadedData.exam.schoolId || ""
        ).trim();
        let resolvedSchoolName = resolvePartnerSchoolName(
          loadedData.attempt.schoolName,
          loadedData.exam.schoolName
        );
        if (!resolvedSchoolName && effectiveSchoolId) {
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
      const remaining = Math.max(
        0,
        Math.ceil((new Date(loadedData.attempt.deadlineAt).getTime() - Date.now()) / 1000)
      );
      setSeconds(remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load assessment attempt.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadAttemptData();
  }, [attemptId]);

  // Countdown timer
  useEffect(() => {
    if (!data || data.attempt.status !== "in_progress") return;
    const interval = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(data.attempt.deadlineAt).getTime() - Date.now()) / 1000)
      );
      setSeconds(remaining);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [data?.attempt.deadlineAt, data?.attempt.status]);

  // Debounced autosave: wait 2 seconds after the latest answer change
  useEffect(() => {
    if (!data || data.attempt.status !== "in_progress" || busy) return;
    let live = true;
    const answersToSave = answers;
    setSaveStatus("pending");

    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      const queued = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!auth.currentUser) throw new Error("Please sign in again.");
          const token = await auth.currentUser.getIdToken();
          const res = await fetch("/.netlify/functions/examination-attempt", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ attemptId, action: "save", answers: answersToSave }),
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || "The assessment service could not save your answers.");
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
            setError("Auto-save failed. Keep this page open and try Save Answers again. Your latest changes may not be saved yet.");
          }
        });
    }, 2000);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [answers, data?.attempt.status, busy]);

  // Live Proctor Heartbeat: writes isOnline: true and lastHeartbeat every 20 seconds while taking exam
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
    const interval = window.setInterval(ping, 20000);

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

  // Submit / Expire Examination
  const send = async (action: "save" | "submit" | "expire") => {
    if (busy || !data) return;
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
        const attemptRef = doc(db, "jdiExamAttempts", attemptId);
        if (action === "save") {
          throw new Error("The assessment saving service is unavailable. Please try again; your answers have not been confirmed as saved.");
        } else {
          // Compute grade locally using assessment domain logic
          const examDocSnap = await getDoc(doc(db, "jdiExams", data.attempt.examId)).catch(() => null);
          const fullExam = examDocSnap?.exists() ? examDocSnap.data() : data.exam;
          const attemptQuestions = resolveAttemptQuestions(fullExam, data.attempt);
          const grading = gradeAnswers({ ...fullExam, questions: attemptQuestions }, answers);

          const finalStatus = action === "expire" ? "expired" : "submitted";
          await updateDoc(attemptRef, {
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
          });

          setData((prev) => {
            if (!prev) return null;
            const released = isAttemptResultReleased(prev.attempt);
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                status: finalStatus,
                score: released ? grading.score : undefined,
                maxScore: grading.maxScore,
                percentage: released ? grading.percentage : undefined,
                questionResults: released ? (grading.questionResults as any) : undefined,
              },
            };
          });

          const currentTypeLabels = getWorkTypeLabels(fullExam?.workType || data.exam.workType, fullExam || data.exam);
          setNotice(
            action === "expire"
              ? `Time expired! Your ${currentTypeLabels.lowerSingular} was automatically submitted.`
              : `Your ${currentTypeLabels.lowerSingular} was submitted successfully!`
          );
        }
      } else {
        if (action === "save") {
          setNotice("Answers saved.");
        } else {
          const currentTypeLabels = getWorkTypeLabels(data.exam.workType, data.exam);
          setData((prev) => {
            if (!prev) return null;
            const released = Boolean(resultData?.resultReleased || isAttemptResultReleased(prev.attempt));
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                status: action === "expire" ? "expired" : "submitted",
                score: released ? (resultData?.score ?? prev.attempt.score) : undefined,
                maxScore: resultData?.maxScore ?? prev.attempt.maxScore,
                percentage: released ? (resultData?.percentage ?? prev.attempt.percentage) : undefined,
              },
            };
          });
          setNotice(
            action === "expire"
              ? `Time expired. ${currentTypeLabels.singular} attempt closed.`
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

  // Auto-expire when timer hits 0
  useEffect(() => {
    if (seconds === 0 && data?.attempt.status === "in_progress" && !busy) {
      void send("expire");
    }
  }, [seconds]);

  // Download PDF Report
  const handleDownloadReport = async () => {
    if (!data) return;
    if (!isAttemptResultReleased(data.attempt)) {
      setError("Assessment results have not been released by your tutor yet. Printing is disabled until results are released.");
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
        <p className="text-slate-600 font-semibold">{error || "Loading assessment session…"}</p>
      </main>
    );
  }

  const typeLabels = getWorkTypeLabels(data.exam.workType, data.exam);

  // Handle External Link Assessment if opened via attempt route
  if (data.exam.deliveryMode === "EXTERNAL_LINK" && data.exam.externalUrl) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <ExternalLink size={28} />
          </div>
          <span className="inline-block rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-700">
            {typeLabels.singular}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{data.exam.title}</h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            {data.exam.instructions ||
              `This ${typeLabels.lowerSingular} is hosted externally. Click the button below to launch your ${typeLabels.lowerSingular}.`}
          </p>
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
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Return to Assessments
            </button>
          </div>
        </section>
      </main>
    );
  }

  const closed = data.attempt.status !== "in_progress";
  const isReleased = isAttemptResultReleased(data.attempt);
  const answeredCount = data.questions.filter((q) => {
    const val = answers[q.id];
    if (Array.isArray(val)) return val.length > 0;
    return val !== undefined && val !== null && String(val).trim() !== "";
  }).length;
  const isLowTime = !closed && seconds > 0 && seconds <= 300;
  const formattedTime = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${String(
    seconds % 60
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

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-3 sm:p-5 md:p-8">
      {/* STICKY ASSESSMENT INFO & COUNTDOWN TIMER BAR */}
      <section
        aria-label={`${typeLabels.singular} status and countdown timer`}
        className={`${
          closed ? "" : "sticky top-[52px] sm:top-[56px] z-30"
        } rounded-2xl bg-slate-900/95 backdrop-blur-md p-3.5 sm:p-5 text-white shadow-md border border-slate-800`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <span className="inline-flex items-center rounded-md bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-200">
                {typeLabels.singular}
              </span>
              <h2 className="text-base sm:text-xl font-bold truncate sm:whitespace-normal sm:break-words">
                {data.exam.title}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-300 mt-0.5">
              <span>{data.exam.subject}</span>
              {!closed && data.questions.length > 0 && (
                <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                  {answeredCount} / {data.questions.length} Answered
                </span>
              )}
            </div>
          </div>
          <div
            role="timer"
            aria-live="off"
            aria-label={closed ? "Assessment status" : `Time remaining ${formattedTime}`}
            className={`rounded-xl border px-3.5 py-2 sm:px-5 sm:py-2.5 text-center shrink-0 transition-colors ${
              closed
                ? "border-white/10 bg-white/5"
                : isLowTime
                ? "border-red-400/50 bg-red-500/20 animate-pulse"
                : "border-amber-400/30 bg-white/10"
            }`}
          >
            {closed ? (
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
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-xs sm:text-sm font-semibold text-red-800 border border-red-200"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-blue-50 p-4 text-xs sm:text-sm font-semibold text-blue-900 border border-blue-200"
        >
          {notice}
        </p>
      )}

      {/* CLOSED / SUBMITTED RESULT VIEW */}
      {closed ? (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:p-8 shadow-sm">
          {reportVm ? (
            <>
              {/* UNIFIED OFFICIAL REPORT HEADER */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    <CheckCircle2 size={14} /> Official Released Performance Report
                  </span>
                  <h2 className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 break-words">
                    {reportVm.examTitle}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600">
                    {reportVm.examSubject} · Released {reportVm.releasedAtText}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <button
                    onClick={handleDownloadReport}
                    disabled={downloadingPdf}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Download size={16} />
                    {downloadingPdf ? "Generating PDF…" : "Download Official Result PDF"}
                  </button>
                  <button
                    onClick={() => nav("/portal/student/exams")}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft size={16} />
                    Return to Assessments
                  </button>
                </div>
              </div>

              {/* CANDIDATE & PARTNER SCHOOL METADATA */}
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 text-blue-600 shrink-0" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Candidate
                    </p>
                    <p className="text-sm font-bold text-slate-900 break-words">
                      {reportVm.studentName}
                    </p>
                    <p className="text-xs text-slate-600">Class: {reportVm.studentClass}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <School className="mt-0.5 text-blue-600 shrink-0" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Partner School
                    </p>
                    <p className="text-sm font-bold text-slate-900 break-words">
                      {reportVm.schoolName}
                    </p>
                    <p className="text-xs text-slate-600">Submitted: {reportVm.submittedAtText}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Award className="mt-0.5 text-blue-600 shrink-0" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Evaluation Mode
                    </p>
                    <p className="text-sm font-bold text-slate-900">{reportVm.evaluationMode}</p>
                    <p className="text-xs text-slate-600">Ref: {reportVm.attemptId.slice(-8)}</p>
                  </div>
                </div>
              </div>

              {/* SCORE & GRADE SUMMARY CARDS */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5 sm:p-4 text-center">
                  <span className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-blue-800">
                    Score Obtained
                  </span>
                  <span className="mt-1 block text-xl sm:text-2xl font-black text-slate-900">
                    {reportVm.rawScore} / {reportVm.maxScore}
                  </span>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 sm:p-4 text-center">
                  <span className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-800">
                    Percentage
                  </span>
                  <span className="mt-1 block text-xl sm:text-2xl font-black text-emerald-950">
                    {reportVm.percentage}%
                  </span>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3.5 sm:p-4 text-center col-span-2">
                  <span className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-800">
                    Assessment Grade & Standing
                  </span>
                  <span className="mt-1 block text-lg sm:text-xl font-black text-indigo-950">
                    {reportVm.grade}
                  </span>
                </div>
              </div>

              {/* EXAMINER FEEDBACK */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Examiner Remarks & Academic Feedback
                </p>
                <p className="mt-1.5 text-sm text-slate-800 break-words">{reportVm.feedbackText}</p>
              </div>

              {/* QUESTION-BY-QUESTION BREAKDOWN */}
              {reportVm.questionRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                      Question-by-Question Review ({reportVm.questionRows.length})
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">
                      Total Marks: {reportVm.maxScore}
                    </span>
                  </div>

                  {/* MOBILE CARDS FOR QUESTION REVIEW */}
                  <div className="space-y-3 md:hidden">
                    {reportVm.questionRows.map((row) => (
                      <div
                        key={row.questionId}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            Q{row.index}. {row.prompt}
                          </span>
                          <span
                            className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              row.status === "PASS"
                                ? "bg-emerald-100 text-emerald-800"
                                : row.status === "PART"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {row.pointsAwarded}/{row.maxPoints} ({row.status})
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1 pt-1 border-t border-slate-200/70">
                          <p>
                            <span className="font-semibold text-slate-500">Your Answer: </span>
                            <span
                              className={`font-semibold ${
                                row.isCorrect ? "text-emerald-700" : "text-red-700"
                              }`}
                            >
                              {row.studentAnswerText}
                            </span>
                          </p>
                          <p>
                            <span className="font-semibold text-slate-500">Official Key: </span>
                            <span className="font-medium text-slate-800">
                              {row.officialAnswerText}
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DESKTOP TABLE FOR QUESTION REVIEW */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-900 text-white text-xs uppercase">
                        <tr>
                          <th className="p-3 w-10 text-center">#</th>
                          <th className="p-3">Question</th>
                          <th className="p-3">Your Answer</th>
                          <th className="p-3">Official Answer Key</th>
                          <th className="p-3 text-center">Marks</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reportVm.questionRows.map((row) => (
                          <tr key={row.questionId} className="hover:bg-slate-50/80">
                            <td className="p-3 text-center font-bold text-slate-700">
                              {row.index}
                            </td>
                            <td className="p-3 font-medium text-slate-900">{row.prompt}</td>
                            <td
                              className={`p-3 font-semibold ${
                                row.isCorrect ? "text-emerald-700" : "text-red-700"
                              }`}
                            >
                              {row.studentAnswerText}
                            </td>
                            <td className="p-3 text-slate-700">{row.officialAnswerText}</td>
                            <td className="p-3 text-center font-bold text-slate-900">
                              {row.pointsAwarded} / {row.maxPoints}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                  row.status === "PASS"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : row.status === "PART"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-red-100 text-red-800"
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
              <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {typeLabels.singular} Submitted Successfully
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-600">
                  Your {typeLabels.lowerSingular} answers have been securely recorded in the central academic
                  ledger.
                </p>
              </div>
              <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-4 max-w-md mx-auto text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center justify-center gap-1.5">
                  <Lock size={14} className="shrink-0" />
                  Awaiting Tutor Result Release
                </p>
                <p className="text-amber-800">
                  Official results and your printable {typeLabels.lowerSingular} performance report remain locked until your tutor reviews and releases the results.
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Printing is disabled until your tutor releases the result."
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-200 px-5 py-3 text-xs sm:text-sm font-bold text-slate-500 opacity-60 cursor-not-allowed"
                >
                  <Lock size={16} />
                  Print Official Result PDF (Awaiting Tutor Release)
                </button>
                <button
                  onClick={() => nav("/portal/student/exams")}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft size={16} />
                  Return to Assessments
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        /* ACTIVE ASSESSMENT QUESTIONS */
        <>
          {data.exam.instructions && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs sm:text-sm text-slate-800">
              <p className="font-bold text-blue-950 mb-1">{typeLabels.singular} Instructions</p>
              <p className="leading-relaxed break-words">{data.exam.instructions}</p>
            </section>
          )}

          <section className="space-y-4 sm:space-y-5">
            {data.questions.map((q, i) => (
              <article
                key={q.id}
                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                  <h2 className="font-bold text-slate-900 text-sm sm:text-base break-words">
                    {i + 1}. {q.prompt}
                  </h2>
                  <span className="self-start rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 shrink-0">
                    {q.points} mark(s)
                  </span>
                </div>

                {/* Question Options */}
                {["single_choice", "true_false"].includes(q.type) ? (
                  <div className="space-y-2">
                    {(q.options || []).map((o) => (
                      <label
                        key={o.id}
                        className={`flex items-start sm:items-center gap-3 rounded-xl border p-3.5 cursor-pointer text-xs sm:text-sm font-medium transition-all ${
                          answers[q.id] === o.id
                            ? "border-blue-600 bg-blue-50/60 text-blue-900 font-semibold"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                    className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500"
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
                        Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(o.id);
                      return (
                        <label
                          key={o.id}
                          className={`flex items-start sm:items-center gap-3 rounded-xl border p-3.5 cursor-pointer text-xs sm:text-sm font-medium transition-all ${
                            isChecked
                              ? "border-blue-600 bg-blue-50/60 text-blue-900 font-semibold"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                ) : (
                  <textarea
                    rows={q.type === "essay" ? 6 : 3}
                    maxLength={10000}
                    className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 outline-none focus:border-blue-500"
                    value={String(answers[q.id] || "")}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Type your response here…"
                  />
                )}
              </article>
            ))}
          </section>

          {/* STICKY AUTOSAVE & SUBMIT FOOTER */}
          <footer className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md p-3.5 sm:p-4 shadow-lg space-y-3">
            {confirmingSubmit ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs sm:text-sm font-semibold text-amber-950">
                  Submit your {typeLabels.lowerSingular} now? Answers cannot be changed once submitted.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingSubmit(false)}
                    className="flex-1 sm:flex-initial rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send("submit")}
                    className="flex-1 sm:flex-initial rounded-xl bg-blue-600 px-5 py-2 text-xs sm:text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy ? "Submitting…" : `Confirm ${typeLabels.submitLabel}`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center justify-between sm:justify-start gap-2.5">
                  <span className="text-xs font-semibold text-slate-600">
                    {saveStatus === "pending"
                      ? "Pending autosave…"
                      : saveStatus === "saving"
                      ? "Saving answers…"
                      : saveStatus === "error"
                      ? "Autosave delayed"
                      : "✓ All answers saved"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${
                      isLowTime
                        ? "text-red-700 bg-red-50 border-red-200"
                        : "text-amber-800 bg-amber-50 border-amber-200"
                    }`}
                  >
                    <Clock size={13} className="shrink-0" />
                    {formattedTime}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send("save")}
                    className="flex-1 sm:flex-initial rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save Answers"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingSubmit(true)}
                    className="flex-1 sm:flex-initial rounded-xl bg-blue-600 px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-blue-700 shadow-sm disabled:opacity-50"
                  >
                    {typeLabels.submitLabel}
                  </button>
                </div>
              </div>
            )}
          </footer>
        </>
      )}
    </main>
  );
}
