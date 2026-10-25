import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { createZip } from "../../modules/examinations/zip";
import { createXlsx } from "../../modules/examinations/xlsx";
import { generateExamReportPdf } from "../../lib/examReportPdfGenerator";
import { School, BookOpenCheck, CheckCircle2, FileSpreadsheet, FileArchive, Download } from "lucide-react";

type Exam = {
  id: string;
  title: string;
  subject: string;
  status: string;
  durationMinutes: number;
  schoolId?: string;
  schoolName?: string;
  targetClass?: string;
  classIds?: string[];
  questions?: Question[];
};

type Question = {
  id: string;
  prompt: string;
  points: number;
  type: string;
  options?: { id: string; text: string }[];
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
};

type Attempt = {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  className: string;
  schoolId?: string;
  schoolName?: string;
  status: string;
  score?: number;
  maxScore?: number;
  submittedAt?: any;
  releasedAt?: any;
  autoGraded?: boolean;
  answers?: Record<string, string | string[]>;
  questions?: Question[];
  questionResults?: {
    questionId: string;
    answer?: string | string[];
    correct?: boolean;
    pointsAwarded?: number;
    maxPoints?: number;
  }[];
  manualMarks?: {
    questionId: string;
    pointsAwarded: number;
    maxPoints: number;
  }[];
  feedback?: string;
};

export default function ExaminationHistory() {
  const location = useLocation();
  const isSchoolPortal = location.pathname.startsWith("/portal/school");
  const [schoolId, setSchoolId] = useState<string>(() => sessionStorage.getItem("schoolId") || sessionStorage.getItem("schoolDocId") || "");
  const [availableSchools, setAvailableSchools] = useState<{ id: string; name: string }[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [gradingReasons, setGradingReasons] = useState<Record<string, string>>({});
  const [gradingFeedback, setGradingFeedback] = useState<Record<string, string>>({});
  const [correctionQuestion, setCorrectionQuestion] = useState("");
  const [correctionKey, setCorrectionKey] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Load schools available to the current user
  useEffect(() => {
    const loadSchools = async () => {
      try {
        const snap = await getDocs(collection(db, "schools"));
        const list: { id: string; name: string }[] = [];
        snap.forEach(d => {
          const data = d.data();
          list.push({ id: d.id, name: data.name || data.schoolName || d.id });
        });
        setAvailableSchools(list);
        if (!schoolId && list.length > 0) {
          setSchoolId(list[0].id);
        }
      } catch (e) {
        console.warn("Could not load schools:", e);
      }
    };
    void loadSchools();
  }, []);

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      let loadedExams: Exam[] = [];
      let loadedAttempts: Attempt[] = [];

      // 1. Try server function
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const url = "/.netlify/functions/jdi-exam-management?schoolId=" + encodeURIComponent(schoolId);
          const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
          if (r.ok) {
            const d = await r.json();
            if (Array.isArray(d.exams)) loadedExams = d.exams;
            if (Array.isArray(d.attempts)) loadedAttempts = d.attempts;
          }
        }
      } catch (err) {
        console.warn("Server exam history notice, falling back to Firestore:", err);
      }

      // 2. Direct Firestore fallback
      if (loadedExams.length === 0 || loadedAttempts.length === 0) {
        const examQueries = [
          getDocs(collection(db, "jdiExams")),
          getDocs(collection(db, "schoolExams"))
        ];
        const [jdiSnap, schSnap] = await Promise.all(examQueries.map(p => p.catch(() => ({ docs: [] } as any))));
        
        const examMap = new Map<string, Exam>();
        [...jdiSnap.docs, ...schSnap.docs].forEach((d: any) => {
          const data = d.data();
          if (!schoolId || data.schoolId === schoolId || !data.schoolId) {
            examMap.set(d.id, { id: d.id, ...data });
          }
        });
        if (loadedExams.length === 0) {
          loadedExams = Array.from(examMap.values());
        }

        // Load attempts
        const attemptSnap = await getDocs(collection(db, "jdiExamAttempts")).catch(() => ({ docs: [] } as any));
        const attList: Attempt[] = [];
        attemptSnap.docs?.forEach((d: any) => {
          const data = d.data();
          if (!schoolId || data.schoolId === schoolId || !data.schoolId) {
            attList.push({ id: d.id, ...data });
          }
        });
        if (loadedAttempts.length === 0) {
          loadedAttempts = attList;
        }
      }

      setExams(loadedExams);
      setAttempts(loadedAttempts);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId) void load();
  }, [schoolId]);

  const loadAudit = async () => {
    if (!selected) {
      setAuditEvents([]);
      return;
    }
    try {
      if (!auth.currentUser) return;
      const token = await auth.currentUser.getIdToken();
      const url = "/.netlify/functions/jdi-exam-management?schoolId=" + encodeURIComponent(schoolId) + "&examId=" + encodeURIComponent(selected);
      const r = await fetch(url, { headers: { Authorization: "Bearer " + token } }).catch(() => null);
      if (r && r.ok) {
        const d = await r.json().catch(() => ({}));
        setAuditEvents(Array.isArray(d.auditEvents) ? d.auditEvents : []);
      }
    } catch (error) {
      console.warn("Could not load exam audit history:", error);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, [selected, schoolId]);

  const markValue = (attemptId: string, questionId: string) => {
    try {
      const parsed = JSON.parse(marks[attemptId] || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed[questionId] ?? "") : "";
    } catch {
      return "";
    }
  };

  const updateQuestionMark = (attemptId: string, questionId: string, value: string) =>
    setMarks(previous => {
      let current: Record<string, any> = {};
      try {
        const parsed = JSON.parse(previous[attemptId] || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed;
      } catch {}
      if (value === "") delete current[questionId];
      else current[questionId] = Number(value);
      return { ...previous, [attemptId]: JSON.stringify(current) };
    });

  const manage = async (attempt: Attempt, action: "grade" | "release") => {
    setActionBusy(attempt.id + action);
    setMessage("");
    try {
      let serverSuccess = false;
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch("/.netlify/functions/jdi-exam-management", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({
              examId: attempt.examId,
              attemptId: attempt.id,
              action,
              marks: action === "grade" ? JSON.parse(marks[attempt.id] || "{}") : undefined,
              reason: action === "grade" ? gradingReasons[attempt.id] : "",
              feedback: action === "grade" ? gradingFeedback[attempt.id] : ""
            })
          });
          if (response.ok) serverSuccess = true;
        }
      } catch (netErr) {
        console.warn("Server action failed, using direct Firestore:", netErr);
      }

      // Direct Firestore fallback
      if (!serverSuccess) {
        const attemptRef = doc(db, "jdiExamAttempts", attempt.id);
        if (action === "release") {
          await updateDoc(attemptRef, {
            releasedAt: serverTimestamp(),
            status: "graded",
            updatedAt: serverTimestamp()
          });
        } else if (action === "grade") {
          const parsedMarks = JSON.parse(marks[attempt.id] || "{}");
          const totalPoints = Object.values(parsedMarks).reduce((a: any, b: any) => Number(a) + Number(b), 0);
          await updateDoc(attemptRef, {
            score: totalPoints,
            manualMarks: Object.entries(parsedMarks).map(([qid, pts]) => ({ questionId: qid, pointsAwarded: Number(pts), maxPoints: 10 })),
            feedback: gradingFeedback[attempt.id] || null,
            status: "graded",
            updatedAt: serverTimestamp()
          });
        }
      }

      await load();
      await loadAudit();
      setMessage(action === "grade" ? "Manual marks saved successfully." : "Result released to student portal!");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not complete action.");
    } finally {
      setActionBusy(null);
    }
  };

  const filtered = attempts.filter(a => (!selected || a.examId === selected) && (!selectedClass || a.className === selectedClass));
  const selectedExam = exams.find(e => e.id === selected);
  const selectedCorrectionQuestion = selectedExam?.questions?.find(q => q.id === correctionQuestion);

  const correctAnswerKey = async () => {
    if (!selected || !correctionQuestion || correctionReason.trim().length < 5) {
      setMessage("Choose a question and enter a correction reason of at least 5 characters.");
      return;
    }
    setCorrectionBusy(true);
    setMessage("");
    try {
      if (!auth.currentUser) throw new Error("Sign in again.");
      const token = await auth.currentUser.getIdToken();
      const isShort = selectedCorrectionQuestion?.type === "short_answer";
      const values = correctionKey.split(",").map(v => v.trim()).filter(Boolean);
      const response = await fetch("/.netlify/functions/jdi-exam-management", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          examId: selected,
          action: "correctAnswerKey",
          questionId: correctionQuestion,
          correctOptionIds: isShort ? undefined : values,
          acceptedAnswers: isShort ? values : undefined,
          reason: correctionReason.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not correct answer key.");
      setCorrectionKey("");
      setCorrectionReason("");
      await load();
      await loadAudit();
      setMessage("Answer key corrected successfully. " + (data.regradedAttempts || 0) + " attempt(s) regraded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not correct answer key.");
    } finally {
      setCorrectionBusy(false);
    }
  };

  const releasedScores = filtered.filter(a => a.releasedAt && typeof a.score === "number").map(a => Number(a.score));
  const averageReleasedScore = releasedScores.length ? releasedScores.reduce((sum, value) => sum + value, 0) / releasedScores.length : null;
  const submittedCount = filtered.filter(a => ["submitted", "expired", "graded"].includes(a.status)).length;
  const rankingRows = selected
    ? Array.from(
        filtered.reduce((map, a) => {
          if (!a.releasedAt || typeof a.score !== "number") return map;
          const previous = map.get(a.studentId);
          if (!previous || Number(a.score) > Number(previous.score)) map.set(a.studentId, a);
          return map;
        }, new Map<string, Attempt>()).values()
      ).sort((a, b) => Number(b.score) - Number(a.score))
    : [];

  const csv = () => {
    const rows: (string | number | null | undefined)[][] = [
      ["Student", "Class", "Examination", "Status", "Score", "Maximum score", "Percentage", "Submitted", "Released", "Teacher feedback"],
      ...filtered.map(a => [
        a.studentName,
        a.className,
        exams.find(e => e.id === a.examId)?.title || a.examId,
        a.status,
        a.score === undefined ? "Not graded" : a.score,
        a.maxScore ?? "",
        a.score !== undefined && a.maxScore ? Math.round((a.score / a.maxScore) * 100) + "%" : "",
        a.submittedAt?.toDate ? a.submittedAt.toDate().toISOString() : String(a.submittedAt || ""),
        String(a.releasedAt || ""),
        a.feedback || ""
      ])
    ];
    const file = createXlsx(rows, "JDI Exam Results");
    const url = URL.createObjectURL(new Blob([file.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "JDI-examination-history.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderPdfBytes = async (a: Attempt) => {
    const exam = exams.find(e => e.id === a.examId);
    return await generateExamReportPdf(a, exam ? { title: exam.title, subject: exam.subject, durationMinutes: exam.durationMinutes } : undefined);
  };

  const downloadPdf = async (a: Attempt) => {
    const bytes = await renderPdfBytes(a);
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `JDI-Report-${(a.studentName || "Student").replace(/[^a-z0-9]+/gi, "-")}-${a.id.slice(-6)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const bulkZip = async () => {
    const files = await Promise.all(
      filtered.map(async a => ({
        name: `JDI-${(a.studentName || "Student").replace(/[^a-z0-9]+/gi, "-")}-${a.id.slice(-6)}.pdf`,
        data: await renderPdfBytes(a)
      }))
    );
    if (!files.length) {
      setMessage("No reports are available to package.");
      return;
    }
    const zip = createZip(files);
    const url = URL.createObjectURL(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "JDI-examination-reports.zip";
    link.click();
    URL.revokeObjectURL(url);
  };

  const pdf = async (a: Attempt) => {
    try {
      await downloadPdf(a);
    } catch {
      setMessage("Could not generate this report. Please try again.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm md:p-8">
        <p className="text-sm font-semibold tracking-wide text-blue-200">JAYSTARBLISS DYNAMIC INSTITUTE · JDI</p>
        <h1 className="mt-2 text-3xl font-bold">Examination History & Performance Reports</h1>
        <p className="mt-2 text-slate-200">Review student CBT submissions, award manual marks, release verified results, and print institutional performance reports.</p>
      </header>

      {/* METRIC OVERVIEW */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Examinations</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{exams.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attempts in View</p>
          <p className="mt-2 text-3xl font-black text-blue-600">{filtered.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Submitted / Completed</p>
          <p className="mt-2 text-3xl font-black text-emerald-600">{submittedCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Average Released Score</p>
          <p className="mt-2 text-3xl font-black text-indigo-600">{averageReleasedScore === null ? "—" : `${averageReleasedScore.toFixed(1)}%`}</p>
          <p className="text-xs text-slate-400 mt-1">Based on released attempts</p>
        </article>
      </section>

      {/* FILTER & EXPORT CONTROLS */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            Select Partner School
            <select
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-800 outline-none focus:border-blue-500"
              value={schoolId}
              onChange={e => setSchoolId(e.target.value)}
            >
              <option value="">All Partner Schools</option>
              {availableSchools.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Select Examination
            <select
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-800 outline-none focus:border-blue-500"
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              <option value="">All Examinations</option>
              {exams.map(e => (
                <option key={e.id} value={e.id}>
                  {e.title} — {e.subject}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Filter by Class
            <select
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-800 outline-none focus:border-blue-500"
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
            >
              <option value="">All Classes</option>
              {Array.from(new Set(attempts.map(a => a.className).filter(Boolean)))
                .sort()
                .map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <button
            disabled={loading}
            onClick={load}
            className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh Records"}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!attempts.length}
              onClick={csv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              Download Excel (.xlsx)
            </button>
            <button
              disabled={!filtered.length}
              onClick={() => void bulkZip()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileArchive size={16} className="text-blue-600" />
              Download PDF ZIP ({filtered.length})
            </button>
          </div>
        </div>
      </section>

      {message && <p role="alert" className="rounded-xl bg-blue-50 p-4 text-sm font-medium text-blue-900 border border-blue-200">{message}</p>}

      {/* STUDENT ATTEMPTS TABLE */}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-5">
          <h2 className="text-lg font-bold text-slate-900">Student Examination Attempts & Official Reports</h2>
          <p className="text-xs text-slate-500 mt-0.5">{filtered.length} submissions found</p>
        </div>
        {!filtered.length ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpenCheck size={40} className="mx-auto mb-3 text-slate-400" />
            <p className="font-semibold text-slate-700">No examination attempts to show</p>
            <p className="text-xs text-slate-500 mt-1">Select a school or refresh records to load student test submissions.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-600 border-b">
              <tr>
                <th className="p-4">Student</th>
                <th className="p-4">Class</th>
                <th className="p-4">Examination</th>
                <th className="p-4">Status</th>
                <th className="p-4">Score</th>
                <th className="p-4 text-right">Official Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-4 font-semibold text-slate-900">{a.studentName}</td>
                  <td className="p-4 text-slate-600">{a.className || "—"}</td>
                  <td className="p-4 text-slate-700">{exams.find(e => e.id === a.examId)?.title || a.examId}</td>
                  <td className="p-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                      a.status === "graded" || a.releasedAt ? "bg-emerald-100 text-emerald-800" :
                      a.status === "submitted" ? "bg-blue-100 text-blue-800" :
                      "bg-amber-100 text-amber-800"
                    }`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-slate-900">
                    {a.score !== undefined ? `${a.score} marks` : "Pending Grading"}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => void pdf(a)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Download size={14} className="text-blue-600" />
                      Print Official PDF
                    </button>
                    {!isSchoolPortal && ["submitted", "expired", "graded"].includes(a.status) && (
                      <>
                        {!a.releasedAt && (
                          <button
                            disabled={actionBusy === a.id + "release"}
                            onClick={() => void manage(a, "release")}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            Release Result
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
