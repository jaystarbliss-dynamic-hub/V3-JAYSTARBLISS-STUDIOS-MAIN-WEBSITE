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
} from "../../lib/classes";
import {
  buildExamReportViewModel,
  generateExamReportPdf,
} from "../../lib/examReportPdfGenerator";
import { Clock, CheckCircle2, ArrowLeft, Download, Award, School, User } from "lucide-react";

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

      // 2. Direct Firestore Fallback
      if (!loadedData) {
        const attemptRef = doc(db, "jdiExamAttempts", attemptId);
        const attemptSnap = await getDoc(attemptRef);
        if (!attemptSnap.exists()) throw new Error("Examination attempt record could not be found.");
        const attemptData: any = { id: attemptSnap.id, ...attemptSnap.data() };

        // Load exam document
        const examRef = doc(db, "jdiExams", attemptData.examId);
        let examSnap = await getDoc(examRef);
        if (!examSnap.exists()) {
          const fallbackRef = doc(db, "schoolExams", attemptData.examId);
          examSnap = await getDoc(fallbackRef);
        }
        const examData: any = examSnap.exists()
          ? examSnap.data()
          : { title: "Examination", subject: "General" };

        // Resolve authoritative partner school name
        const effectiveSchoolId = String(attemptData.schoolId || examData.schoolId || "").trim();
        let schoolDocName = "";
        if (effectiveSchoolId) {
          const schSnap = await getDoc(doc(db, "schools", effectiveSchoolId)).catch(() => null);
          if (schSnap?.exists()) {
            const s = schSnap.data();
            schoolDocName = s.name || s.schoolName || "";
          }
        }
        const resolvedSchoolName = resolvePartnerSchoolName(
          schoolDocName,
          attemptData.schoolName,
          examData.schoolName,
          sessionStorage.getItem("schoolName") || ""
        );

        const rawQuestions: Q[] = resolveAttemptQuestions(examData, attemptData) as Q[];
        const isClosed = attemptData.status !== "in_progress";
        const isReleased = Boolean(attemptData.releasedAt);

        const safeQuestions: Q[] = rawQuestions.map((q) => {
          if (!isClosed || !isReleased) {
            const { correctOptionIds, acceptedAnswers, explanation, ...rest } = q;
            return rest as Q;
          }
          return q;
        });

        const maxScore = computeExamMaxScore(examData, attemptData);
        const score = typeof attemptData.score === "number" ? attemptData.score : undefined;

        loadedData = {
          attempt: {
            ...attemptData,
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
            percentage: score !== undefined ? calculateScorePercentage(score, maxScore) : undefined,
            deadlineAt: attemptData.deadlineAt || new Date(Date.now() + 30 * 60000).toISOString(),
          },
          exam: {
            id: attemptData.examId,
            title: examData.title || "Examination",
            subject: examData.subject || "General",
            schoolId: effectiveSchoolId,
            schoolName: resolvedSchoolName,
            maxScore,
            instructions: examData.instructions || "",
            durationMinutes: examData.durationMinutes || 30,
            gradingMode: examData.gradingMode || "automatic",
            questions: isReleased ? rawQuestions : safeQuestions,
          },
          questions: safeQuestions,
        };
      } else {
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
      }

      setData(loadedData);
      setAnswers(loadedData.attempt.answers || {});
      const remaining = Math.max(
        0,
        Math.ceil((new Date(loadedData.attempt.deadlineAt).getTime() - Date.now()) / 1000)
      );
      setSeconds(remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load examination attempt.");
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

  // Autosave answers every 1000ms
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
            const attemptRef = doc(db, "jdiExamAttempts", attemptId);
            await updateDoc(attemptRef, {
              answers: answersToSave,
              updatedAt: serverTimestamp(),
            });
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
    }, 1000);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [answers, data?.attempt.status, busy]);

  // Submit / Expire Examination
  const send = async (action: "save" | "submit" | "expire") => {
    if (busy || !data) return;
    setBusy(true);
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
          await updateDoc(attemptRef, { answers, updatedAt: serverTimestamp() });
          setNotice("Answers saved successfully.");
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
            submittedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          setData((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                status: finalStatus,
                score: grading.score,
                maxScore: grading.maxScore,
                percentage: grading.percentage,
                questionResults: grading.questionResults as any,
              },
            };
          });

          setNotice(
            action === "expire"
              ? "Time expired! Your examination was automatically submitted."
              : "Your examination was submitted successfully!"
          );
        }
      } else {
        if (action === "save") {
          setNotice("Answers saved.");
        } else {
          setData((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                status: action === "expire" ? "expired" : "submitted",
                score: resultData?.score ?? prev.attempt.score,
                maxScore: resultData?.maxScore ?? prev.attempt.maxScore,
                percentage: resultData?.percentage ?? prev.attempt.percentage,
              },
            };
          });
          setNotice(
            action === "expire" ? "Time expired. Attempt closed." : "Your examination was submitted."
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
      <main className="mx-auto max-w-4xl p-8 text-center">
        <p className="text-slate-600 font-semibold">{error || "Loading examination session…"}</p>
      </main>
    );
  }

  const closed = data.attempt.status !== "in_progress";
  const isReleased = Boolean(data.attempt.releasedAt);
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
          schoolName: data.exam.schoolName || data.attempt.schoolName,
          maxScore: data.exam.maxScore || data.attempt.maxScore,
          durationMinutes: data.exam.durationMinutes,
          questions: data.exam.questions || data.questions,
        }
      )
    : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      {/* HEADER */}
      <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-blue-200">
              JAYSTARBLISS DYNAMIC INSTITUTE · JDI
            </p>
            <h1 className="mt-2 text-2xl font-bold">{data.exam.title}</h1>
            <p className="text-sm text-slate-300">{data.exam.subject}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-center">
            {closed ? (
              <span className="font-bold text-emerald-400 uppercase tracking-wider">
                {isReleased ? "Released" : data.attempt.status}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="text-amber-400" size={18} />
                <span className="font-mono text-2xl font-black text-amber-300">
                  {Math.floor(seconds / 60).toString().padStart(2, "0")}:
                  {String(seconds % 60).padStart(2, "0")}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800 border border-red-200"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-900 border border-blue-200"
        >
          {notice}
        </p>
      )}

      {/* CLOSED / SUBMITTED RESULT VIEW */}
      {closed ? (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          {reportVm ? (
            <>
              {/* UNIFIED OFFICIAL REPORT HEADER */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    <CheckCircle2 size={14} /> Official Released Performance Report
                  </span>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">{reportVm.examTitle}</h2>
                  <p className="text-sm text-slate-600">
                    {reportVm.examSubject} · Released {reportVm.releasedAtText}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleDownloadReport}
                    disabled={downloadingPdf}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Download size={16} />
                    {downloadingPdf ? "Generating PDF…" : "Download Official Result PDF"}
                  </button>
                  <button
                    onClick={() => nav("/portal/student/exams")}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft size={16} />
                    Return to Tests
                  </button>
                </div>
              </div>

              {/* CANDIDATE & PARTNER SCHOOL METADATA */}
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 text-blue-600 shrink-0" size={18} />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Candidate
                    </p>
                    <p className="text-sm font-bold text-slate-900">{reportVm.studentName}</p>
                    <p className="text-xs text-slate-600">Class: {reportVm.studentClass}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <School className="mt-0.5 text-blue-600 shrink-0" size={18} />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Partner School
                    </p>
                    <p className="text-sm font-bold text-slate-900">{reportVm.schoolName}</p>
                    <p className="text-xs text-slate-600">Submitted: {reportVm.submittedAtText}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Award className="mt-0.5 text-blue-600 shrink-0" size={18} />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Evaluation Mode
                    </p>
                    <p className="text-sm font-bold text-slate-900">{reportVm.evaluationMode}</p>
                    <p className="text-xs text-slate-600">Ref: {reportVm.attemptId.slice(-8)}</p>
                  </div>
                </div>
              </div>

              {/* SCORE & GRADE SUMMARY CARDS */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-center">
                  <span className="block text-xs font-bold uppercase tracking-wider text-blue-800">
                    Score Obtained
                  </span>
                  <span className="mt-1 block text-2xl font-black text-slate-900">
                    {reportVm.rawScore} / {reportVm.maxScore}
                  </span>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
                  <span className="block text-xs font-bold uppercase tracking-wider text-emerald-800">
                    Percentage
                  </span>
                  <span className="mt-1 block text-2xl font-black text-emerald-950">
                    {reportVm.percentage}%
                  </span>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-center col-span-2">
                  <span className="block text-xs font-bold uppercase tracking-wider text-indigo-800">
                    Assessment Grade & Standing
                  </span>
                  <span className="mt-1 block text-xl font-black text-indigo-950">
                    {reportVm.grade}
                  </span>
                </div>
              </div>

              {/* EXAMINER FEEDBACK */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Examiner Remarks & Academic Feedback
                </p>
                <p className="mt-1.5 text-sm text-slate-800">{reportVm.feedbackText}</p>
              </div>

              {/* QUESTION-BY-QUESTION BREAKDOWN */}
              {reportVm.questionRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">
                      Question-by-Question Review ({reportVm.questionRows.length})
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">
                      Total Marks: {reportVm.maxScore}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                <h2 className="text-2xl font-bold text-slate-900">
                  Examination Submitted Successfully
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Your examination answers have been securely recorded in the central academic
                  ledger.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 max-w-md mx-auto text-xs text-slate-600">
                Official results and your downloadable performance transcript will appear here once
                verified and released by your tutor.
              </div>
              <div className="pt-2">
                <button
                  onClick={() => nav("/portal/student/exams")}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft size={16} />
                  Return to Tests
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        /* ACTIVE TEST QUESTIONS */
        <>
          <section className="space-y-5">
            {data.questions.map((q, i) => (
              <article
                key={q.id}
                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex justify-between items-start gap-4">
                  <h2 className="font-bold text-slate-900 text-base">
                    {i + 1}. {q.prompt}
                  </h2>
                  <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 shrink-0">
                    {q.points} mark(s)
                  </span>
                </div>

                {/* Question Options */}
                {["single_choice", "true_false"].includes(q.type) ? (
                  <div className="space-y-2">
                    {(q.options || []).map((o) => (
                      <label
                        key={o.id}
                        className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer text-sm font-medium transition-all ${
                          answers[q.id] === o.id
                            ? "border-blue-600 bg-blue-50/60 text-blue-900 font-semibold"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          checked={answers[q.id] === o.id}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                        />
                        <span>
                          <strong className="mr-1">{o.id}.</strong> {o.text}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : q.type === "multiple_choice" ? (
                  <div className="space-y-2">
                    {(q.options || []).map((o) => {
                      const isChecked =
                        Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(o.id);
                      return (
                        <label
                          key={o.id}
                          className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer text-sm font-medium transition-all ${
                            isChecked
                              ? "border-blue-600 bg-blue-50/60 text-blue-900 font-semibold"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
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
                          <span>
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

          {/* STICKY AUTOSAVE FOOTER */}
          <footer className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">
                {saveStatus === "pending"
                  ? "Pending autosave…"
                  : saveStatus === "saving"
                  ? "Saving answers…"
                  : saveStatus === "error"
                  ? "Autosave failed"
                  : "✓ All answers saved"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("save")}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save Answers"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Submit your examination now? Answers cannot be changed once submitted."
                    )
                  ) {
                    void send("submit");
                  }
                }}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 shadow-sm disabled:opacity-50"
              >
                Submit Examination
              </button>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
