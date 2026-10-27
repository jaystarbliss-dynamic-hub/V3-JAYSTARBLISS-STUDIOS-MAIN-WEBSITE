import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Download,
} from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { generateExamReportPdf } from "../../lib/examReportPdfGenerator";
import {
  computeExamMaxScore,
  calculateScorePercentage,
  normalizeClassName,
  resolvePartnerSchoolName,
} from "../../lib/classes";

type Child = { id: string; name: string; className: string; schoolId?: string; schoolName?: string };
type Result = {
  attemptId: string;
  examId: string;
  studentId: string;
  studentName: string;
  className: string;
  schoolId?: string;
  schoolName?: string;
  title: string;
  subject: string;
  status: string;
  score?: number;
  maxScore?: number;
  percentage?: number;
  submittedAt?: string;
  releasedAt?: string;
  feedback?: string;
  answers?: Record<string, any>;
  questions?: any[];
  questionResults?: any[];
};

export default function ParentExaminationResults() {
  const [children, setChildren] = useState<Child[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [selectedChild, setSelectedChild] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadResults = async () => {
    if (!auth.currentUser) throw new Error("Please sign in again.");
    let loadedChildren: Child[] = [];
    let loadedResults: Result[] = [];

    // 1. Try server function
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/.netlify/functions/parent-examination-results", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        if (Array.isArray(data.children)) loadedChildren = data.children;
        if (Array.isArray(data.results)) loadedResults = data.results;
      }
    } catch (e) {
      console.warn("Server parent results notice, engaging Firestore resolver:", e);
    }

    // 2. Direct Firestore Fallback
    if (loadedChildren.length === 0 || loadedResults.length === 0) {
      const parentUid = auth.currentUser.uid;
      const parentEmail = auth.currentUser.email?.toLowerCase() || "";

      const [byUidSnap, byEmailSnap] = await Promise.all([
        getDocs(query(collection(db, "individualStudents"), where("parentId", "==", parentUid))).catch(
          () => ({ docs: [] } as any)
        ),
        parentEmail
          ? getDocs(
              query(collection(db, "individualStudents"), where("parentEmail", "==", parentEmail))
            ).catch(() => ({ docs: [] } as any))
          : Promise.resolve({ docs: [] } as any),
      ]);

      const childMap = new Map<string, Child>();
      [...byUidSnap.docs, ...byEmailSnap.docs].forEach((d: any) => {
        const data = d.data();
        childMap.set(d.id, {
          id: d.id,
          name: data.fullName || data.studentName || "Student",
          className: normalizeClassName(data.class || data.grade || "") || data.class || "",
          schoolId: data.schoolId || "",
          schoolName: resolvePartnerSchoolName(data.schoolName),
        });
      });

      loadedChildren = Array.from(childMap.values());

      if (loadedChildren.length > 0) {
        const attemptsSnap = await getDocs(collection(db, "jdiExamAttempts")).catch(
          () => ({ docs: [] } as any)
        );
        const childIds = new Set(loadedChildren.map((c) => c.id));
        const examDocsMap = new Map<string, any>();

        const [jdiSnap, schExamSnap] = await Promise.all([
          getDocs(collection(db, "jdiExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "schoolExams")).catch(() => ({ docs: [] } as any)),
        ]);
        [...jdiSnap.docs, ...schExamSnap.docs].forEach((d: any) => examDocsMap.set(d.id, d.data()));

        const schoolNameCache = new Map<string, string>();
        const resolveSchoolNameById = async (schId?: string, fallback?: string) => {
          const clean = String(schId || "").trim();
          if (clean && schoolNameCache.has(clean)) return schoolNameCache.get(clean)!;
          if (clean) {
            const sSnap = await getDoc(doc(db, "schools", clean)).catch(() => null);
            if (sSnap?.exists()) {
              const s = sSnap.data();
              const resolved = resolvePartnerSchoolName(s.name, s.schoolName, fallback);
              if (resolved) {
                schoolNameCache.set(clean, resolved);
                return resolved;
              }
            }
          }
          return resolvePartnerSchoolName(fallback, "Assigned Partner School");
        };

        const foundResults: Result[] = [];
        for (const ad of attemptsSnap.docs || []) {
          const a = ad.data();
          if (childIds.has(a.studentId) && a.releasedAt) {
            const exam = examDocsMap.get(a.examId) || {};
            const child = childMap.get(a.studentId);
            const score = typeof a.score === "number" ? a.score : 0;
            const maxScore = computeExamMaxScore(exam, a);
            const percentage = calculateScorePercentage(score, maxScore);
            const schoolName = await resolveSchoolNameById(
              a.schoolId || exam.schoolId || child?.schoolId,
              a.schoolName || exam.schoolName || child?.schoolName
            );

            foundResults.push({
              attemptId: ad.id,
              examId: a.examId,
              studentId: a.studentId,
              studentName: child?.name || a.studentName || "Student",
              className:
                normalizeClassName(child?.className || a.className || "") ||
                child?.className ||
                a.className ||
                "",
              schoolId: a.schoolId || exam.schoolId || child?.schoolId,
              schoolName,
              title: exam.title || a.examTitle || "Examination Assessment",
              subject: exam.subject || "General",
              status: a.status || "graded",
              score,
              maxScore,
              percentage,
              submittedAt: a.submittedAt ? String(a.submittedAt) : undefined,
              releasedAt: a.releasedAt ? String(a.releasedAt) : undefined,
              feedback: a.feedback || undefined,
              answers: a.answers,
              questions: a.questionsSnapshot || exam.questions || a.questions,
              questionResults: a.questionResults,
            });
          }
        }

        loadedResults = foundResults;
      }
    }

    return { children: loadedChildren, results: loadedResults };
  };

  const refresh = async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const data = await loadResults();
      setChildren(data.children);
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load examination results.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, []);

  const visibleResults = useMemo(
    () =>
      results.filter((result) => selectedChild === "all" || result.studentId === selectedChild),
    [results, selectedChild]
  );

  const average = useMemo(() => {
    const scored = visibleResults.filter((result) => typeof result.percentage === "number");
    return scored.length
      ? Math.round(
          (scored.reduce((sum, result) => sum + Number(result.percentage), 0) / scored.length) *
            100
        ) / 100
      : null;
  }, [visibleResults]);

  const handleDownloadPdf = async (result: Result) => {
    setDownloadingId(result.attemptId);
    try {
      const bytes = await generateExamReportPdf(
        {
          id: result.attemptId,
          examId: result.examId,
          studentId: result.studentId,
          studentName: result.studentName,
          className: result.className,
          schoolId: result.schoolId,
          schoolName: result.schoolName,
          status: result.status,
          score: result.score,
          maxScore: result.maxScore,
          percentage: result.percentage,
          submittedAt: result.submittedAt,
          releasedAt: result.releasedAt,
          answers: result.answers,
          questions: result.questions,
          questionResults: result.questionResults,
          feedback: result.feedback,
        },
        {
          id: result.examId,
          title: result.title,
          subject: result.subject,
          schoolId: result.schoolId,
          schoolName: result.schoolName,
          maxScore: result.maxScore,
          questions: result.questions,
        }
      );
      const url = URL.createObjectURL(
        new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `JDI-Report-${result.studentName.replace(
        /[^a-z0-9]+/gi,
        "-"
      )}-${result.attemptId.slice(-6)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not generate report PDF. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  function formatDate(value?: string) {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between md:p-6">
        <label className="block min-w-0 flex-1 text-sm font-semibold text-slate-700">
          Filter by Linked Learner
          <select
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-900 outline-none focus:border-blue-500"
            value={selectedChild}
            onChange={(event) => setSelectedChild(event.target.value)}
          >
            <option value="all">All Linked Children</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
                {child.className ? ` — ${child.className}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || refreshing}
          className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          {refreshing || loading ? (
            <Loader2 className="animate-spin text-white" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh Results
        </button>
      </section>

      {!loading && !error && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <BookOpenCheck size={22} className="text-blue-700" />
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Released Results
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{visibleResults.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ClipboardCheck size={22} className="text-emerald-700" />
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Average Performance
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {average === null ? "—" : `${average}%`}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <CalendarClock size={22} className="text-indigo-700" />
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Linked Children
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{children.length}</p>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-sm font-semibold text-slate-500">
          <Loader2 className="mr-2 animate-spin text-blue-600" size={20} />
          Loading released results…
        </div>
      ) : !error && children.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h2 className="text-lg font-bold text-slate-900">No linked learner profiles found</h2>
          <p className="mt-2 text-sm text-slate-600">
            When your parent account is linked to a learner profile, their released examination
            results will appear here.
          </p>
        </section>
      ) : !error && visibleResults.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h2 className="text-lg font-bold text-slate-900">No released results yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Submitted examinations remain pending here until verified and released by your child's
            tutor or school.
          </p>
        </section>
      ) : (
        !error && (
          <section className="space-y-4">
            {visibleResults.map((result) => (
              <article
                key={result.attemptId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6 hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                      {result.subject || "Examination"}
                      {result.className ? ` · ${result.className}` : ""}
                      {result.schoolName ? ` · ${result.schoolName}` : ""}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{result.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {result.studentName} · Released {formatDate(result.releasedAt)}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-2xl bg-blue-50/70 border border-blue-100 px-5 py-3 text-right">
                    <p className="text-xs font-bold text-blue-700 uppercase">Score</p>
                    <p className="text-2xl font-black text-slate-900">
                      {typeof result.score === "number" ? result.score : "—"}
                      {typeof result.maxScore === "number" ? ` / ${result.maxScore}` : ""}
                    </p>
                    {typeof result.percentage === "number" && (
                      <p className="text-xs font-bold text-emerald-700">
                        {result.percentage}% Grade
                      </p>
                    )}
                  </div>
                </div>
                {result.feedback && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs font-medium text-slate-700 border border-slate-100">
                    <strong className="text-slate-900">Teacher Remarks:</strong> {result.feedback}
                  </div>
                )}
                <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Submitted: {formatDate(result.submittedAt)}</span>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf(result)}
                    disabled={downloadingId === result.attemptId}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-bold text-slate-800 hover:bg-slate-50 shadow-sm"
                  >
                    <Download size={14} className="text-blue-600" />
                    {downloadingId === result.attemptId
                      ? "Generating PDF…"
                      : "Download Official Report PDF"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )
      )}
    </main>
  );
}
