import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { gradeAnswers } from "../../../api/_lib/jdi-assessment.js";
import { generateExamReportPdf } from "../../lib/examReportPdfGenerator";
import { Clock, ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft, Download, FileText } from "lucide-react";

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
    releasedAt?: unknown;
    answers?: Record<string, string | string[]>;
    feedback?: string;
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
    title: string;
    subject: string;
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
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
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
        const examData = examSnap.exists() ? examSnap.data() : { title: "Examination", subject: "General" };

        const rawQuestions: Q[] = Array.isArray(examData.questions) ? examData.questions : [];
        const isClosed = attemptData.status !== "in_progress";

        // Student-safe questions: strip correct answers unless attempt is already closed & released
        const safeQuestions: Q[] = rawQuestions.map(q => {
          if (!isClosed) {
            const { correctOptionIds, acceptedAnswers, explanation, ...rest } = q;
            return rest as Q;
          }
          return q;
        });

        loadedData = {
          attempt: {
            ...attemptData,
            deadlineAt: attemptData.deadlineAt || new Date(Date.now() + 30 * 60000).toISOString()
          },
          exam: {
            title: examData.title || "Examination",
            subject: examData.subject || "General",
            instructions: examData.instructions || "",
            durationMinutes: examData.durationMinutes || 30,
            gradingMode: examData.gradingMode || "automatic",
            questions: rawQuestions
          },
          questions: safeQuestions
        };
      }

      setData(loadedData);
      setAnswers(loadedData.attempt.answers || {});
      const remaining = Math.max(0, Math.ceil((new Date(loadedData.attempt.deadlineAt).getTime() - Date.now()) / 1000));
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
      const remaining = Math.max(0, Math.ceil((new Date(data.attempt.deadlineAt).getTime() - Date.now()) / 1000));
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
                body: JSON.stringify({ attemptId, action: "save", answers: answersToSave })
              });
              if (res.ok) serverOk = true;
            }
          } catch {}

          if (!serverOk) {
            // Firestore write
            const attemptRef = doc(db, "jdiExamAttempts", attemptId);
            await updateDoc(attemptRef, {
              answers: answersToSave,
              updatedAt: serverTimestamp()
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
            body: JSON.stringify({ attemptId, action, answers })
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
          const grading = gradeAnswers(fullExam, answers);

          const finalStatus = action === "expire" ? "expired" : "submitted";
          await updateDoc(attemptRef, {
            answers,
            status: finalStatus,
            score: grading.score,
            autoGraded: grading.autoGraded,
            questionResults: grading.questionResults,
            submittedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          setData(prev => {
            if (!prev) return null;
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                status: finalStatus,
                score: grading.score,
                questionResults: grading.questionResults as any
              }
            };
          });

          setNotice(action === "expire" ? "Time expired! Your examination was automatically submitted." : "Your examination was submitted successfully!");
        }
      } else {
        if (action === "save") {
          setNotice("Answers saved.");
        } else {
          setData(prev => {
            if (!prev) return null;
            return {
              ...prev,
              attempt: {
                ...prev.attempt,
                status: action === "expire" ? "expired" : "submitted",
                score: resultData?.score
              }
            };
          });
          setNotice(action === "expire" ? "Time expired. Attempt closed." : "Your examination was submitted.");
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
          questions: data.exam.questions || data.questions
        },
        {
          title: data.exam.title,
          subject: data.exam.subject,
          durationMinutes: data.exam.durationMinutes
        }
      );
      const url = URL.createObjectURL(new Blob([bytes as any], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `JDI-Result-${data.attempt.studentName.replace(/[^a-z0-9]+/gi, "-")}-${data.attempt.id.slice(-6)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
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
  const resultByQuestion = new Map((data.attempt.questionResults || []).map(result => [result.questionId, result]));
  const maxResultScore = data.questions.reduce((sum, q) => sum + Math.max(0, Number(q.points) || 0), 0);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      {/* HEADER */}
      <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-blue-200">JAYSTARBLISS DYNAMIC INSTITUTE · JDI</p>
            <h1 className="mt-2 text-2xl font-bold">{data.exam.title}</h1>
            <p className="text-sm text-slate-300">{data.exam.subject}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-center">
            {closed ? (
              <span className="font-bold text-emerald-400 uppercase tracking-wider">{data.attempt.status}</span>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="text-amber-400" size={18} />
                <span className="font-mono text-2xl font-black text-amber-300">
                  {Math.floor(seconds / 60).toString().padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800 border border-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-900 border border-blue-200">{notice}</p>}

      {/* CLOSED / SUBMITTED RESULT VIEW */}
      {closed ? (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="text-center py-4">
            <CheckCircle2 size={48} className="mx-auto text-emerald-600 mb-3" />
            <h2 className="text-2xl font-bold text-slate-900">Examination Submitted Successfully</h2>
            <p className="mt-1 text-sm text-slate-600">Your examination answers have been securely recorded in the central academic ledger.</p>
            
            {data.attempt.releasedAt && data.attempt.score !== undefined ? (
              <div className="mt-5 inline-block rounded-2xl bg-emerald-50 border border-emerald-200 px-8 py-4">
                <span className="block text-xs uppercase font-bold text-emerald-800 tracking-wider">Official Released Score</span>
                <span className="text-4xl font-black text-emerald-950">{data.attempt.score} / {maxResultScore}</span>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4 max-w-md mx-auto text-xs text-slate-600">
                Official results will appear here once verified and released by your tutor.
              </div>
            )}
          </div>

          {/* DOWNLOAD REPORT BUTTON */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t">
            <button
              onClick={handleDownloadReport}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Download size={16} />
              {downloadingPdf ? "Generating PDF…" : "Download Official Result PDF"}
            </button>
            <button
              onClick={() => nav("/portal/student/exams")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Return to Tests
            </button>
          </div>
        </section>
      ) : (
        /* ACTIVE TEST QUESTIONS */
        <>
          <section className="space-y-5">
            {data.questions.map((q, i) => (
              <article key={q.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                    {(q.options || []).map(o => (
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
                          onChange={() => setAnswers(prev => ({ ...prev, [q.id]: o.id }))}
                        />
                        <span>
                          <strong className="mr-1">{o.id}.</strong> {o.text}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : q.type === "multiple_choice" ? (
                  <div className="space-y-2">
                    {(q.options || []).map(o => {
                      const isChecked = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(o.id);
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
                            onChange={e =>
                              setAnswers(prev => {
                                const current = (prev[q.id] as string[]) || [];
                                const next = e.target.checked ? [...current, o.id] : current.filter(v => v !== o.id);
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
                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
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
                  if (window.confirm("Submit your examination now? Answers cannot be changed once submitted.")) {
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
