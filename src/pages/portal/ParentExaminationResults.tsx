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
  isAttemptResultReleased,
  normalizeClassName,
  resolvePartnerSchoolName,
} from "../../lib/classes";
import { resolveParentLinkedChildren } from "../../lib/academicSyncEngine";
import { ReleasedOfficialReportsSection } from "../../components/academic-reporting/ReleasedOfficialReportsSection";

type Child = { id: string; name: string; className: string; schoolId?: string; schoolName?: string; allIds?: string[] };
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

    // 2. Direct Firestore Resolver (merges with server data so school-enrolled children and all ID aliases are always included)
    try {
      const resolvedProfiles = await resolveParentLinkedChildren(
        auth.currentUser.uid,
        auth.currentUser.email || ""
      );

      const childMap = new Map<string, Child>();
      const aliasToChildMap = new Map<string, Child>();

      loadedChildren.forEach((c) => {
        childMap.set(c.id, c);
        aliasToChildMap.set(c.id, c);
      });

      resolvedProfiles.forEach((p) => {
        const entry: Child = {
          id: p.id,
          name: p.fullName || "Student",
          className: normalizeClassName(p.className || "") || p.className || "",
          schoolId: p.schoolId || "",
          schoolName: resolvePartnerSchoolName(p.schoolName),
          allIds: p.allIds,
        };
        childMap.set(p.id, entry);
        p.allIds.forEach((aid) => aliasToChildMap.set(aid, entry));
      });

      loadedChildren = Array.from(childMap.values());

      if (loadedChildren.length > 0) {
        const attemptsSnap = await getDocs(collection(db, "jdiExamAttempts")).catch(
          () => ({ docs: [] } as any)
        );
        const examDocsMap = new Map<string, any>();

        const [jdiSnap, schExamSnap, legacyExamsSnap] = await Promise.all([
          getDocs(collection(db, "jdiExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "schoolExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "exams")).catch(() => ({ docs: [] } as any)),
        ]);
        [...legacyExamsSnap.docs, ...schExamSnap.docs, ...jdiSnap.docs].forEach((d: any) =>
          examDocsMap.set(d.id, d.data())
        );

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
          return resolvePartnerSchoolName(fallback, "");
        };

        const resultsById = new Map<string, Result>();
        loadedResults.forEach((r) => resultsById.set(r.attemptId, r));

        for (const ad of attemptsSnap.docs || []) {
          const a = ad.data();
          const matchedChild =
            aliasToChildMap.get(String(a.studentId || "")) ||
            aliasToChildMap.get(String(a.studentUid || ""));
          if (matchedChild && isAttemptResultReleased(a)) {
            const exam = examDocsMap.get(a.examId) || {};
            const score = typeof a.score === "number" ? a.score : 0;
            const maxScore = computeExamMaxScore(exam, a);
            const percentage = calculateScorePercentage(score, maxScore);
            const schoolName = await resolveSchoolNameById(
              a.schoolId || exam.schoolId || matchedChild.schoolId,
              a.schoolName || exam.schoolName || matchedChild.schoolName
            );

            resultsById.set(ad.id, {
              attemptId: ad.id,
              examId: a.examId,
              studentId: matchedChild.id,
              studentName: matchedChild.name || a.studentName || "Student",
              className:
                normalizeClassName(matchedChild.className || a.className || "") ||
                matchedChild.className ||
                a.className ||
                "",
              schoolId: a.schoolId || exam.schoolId || matchedChild.schoolId,
              schoolName,
              title: exam.title || a.examTitle || "Assessment",
              subject: exam.subject || "General",
              status: a.status || "graded",
              score,
              maxScore,
              percentage,
              submittedAt: a.submittedAt ? String(a.submittedAt) : undefined,
              releasedAt: a.releasedAt ? String(a.releasedAt) : undefined,
              feedback: a.feedback || a.tutorFeedback || undefined,
              answers: a.answers,
              questions: a.questionsSnapshot || exam.questions || a.questions,
              questionResults: a.questionResults,
            });
          }
        }

        loadedResults = Array.from(resultsById.values()).sort((a, b) =>
          String(b.releasedAt || b.submittedAt || "").localeCompare(
            String(a.releasedAt || a.submittedAt || "")
          )
        );
      }
    } catch (fallbackErr) {
      console.warn("Parent results Firestore merge notice:", fallbackErr);
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
      setError(e instanceof Error ? e.message : "Unable to load assessment results.");
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
      const isPrivChild =
        !result.schoolId ||
        String(result.schoolId).toLowerCase().includes("private");
      const bytes = await generateExamReportPdf(
        {
          id: result.attemptId,
          examId: result.examId,
          studentId: result.studentId,
          studentName: result.studentName,
          className: result.className,
          schoolId: isPrivChild ? "private_parent" : result.schoolId,
          schoolName: isPrivChild ? "" : result.schoolName,
          enrolmentType: isPrivChild ? "private" : "school",
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
          schoolId: isPrivChild ? "private_parent" : result.schoolId,
          schoolName: isPrivChild ? "" : result.schoolName,
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

      <ReleasedOfficialReportsSection
        viewerRole="PARENT"
        studentId={selectedChild !== "all" ? selectedChild : undefined}
      />

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:flex-row md:items-end md:justify-between md:p-5">
        <label className="block min-w-0 flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
          Filter by Linked Learner
          <select
            className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 font-normal text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-slate-400"
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
          className="rounded-lg bg-slate-900 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
        >
          {refreshing || loading ? (
            <Loader2 className="animate-spin text-white" size={15} />
          ) : (
            <RefreshCw size={15} />
          )}
          Refresh Results
        </button>
      </section>

      {!loading && !error && (
        <section className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="p-4 sm:px-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <BookOpenCheck size={16} className="text-brand-red" aria-hidden="true" />
              <span>Released Results</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{visibleResults.length}</p>
          </div>
          <div className="p-4 sm:px-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <ClipboardCheck size={16} className="text-slate-700 dark:text-slate-300" aria-hidden="true" />
              <span>Average Performance</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {average === null ? "—" : `${average}%`}
            </p>
          </div>
          <div className="p-4 sm:px-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <CalendarClock size={16} className="text-slate-700 dark:text-slate-300" aria-hidden="true" />
              <span>Linked Children</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{children.length}</p>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-sm font-semibold text-slate-500">
          <Loader2 className="mr-2 animate-spin text-brand-red" size={20} />
          Loading released results…
        </div>
      ) : !error && children.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">No linked learner profiles found</h2>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            When your parent account is linked to a learner profile, their released assessment
            results will appear here.
          </p>
        </section>
      ) : !error && visibleResults.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">No released results yet</h2>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Submitted assessments remain pending here until verified and released by your child's
            tutor.
          </p>
        </section>
      ) : (
        !error && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {visibleResults.map((result) => (
              <article
                key={result.attemptId}
                className="p-5 md:p-6 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-950/40"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-red">
                      {result.subject || "Assessment"}
                      {result.className ? ` · ${result.className}` : ""}
                      {result.schoolName ? ` · ${result.schoolName}` : ""}
                    </p>
                    <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{result.title}</h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {result.studentName} · Released {formatDate(result.releasedAt)}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-right">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Score</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {typeof result.score === "number" ? result.score : "—"}
                      {typeof result.maxScore === "number" ? ` / ${result.maxScore}` : ""}
                    </p>
                    {typeof result.percentage === "number" && (
                      <p className="text-xs font-bold text-brand-red tabular-nums">
                        {result.percentage}% Grade
                      </p>
                    )}
                  </div>
                </div>
                {result.feedback && (
                  <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-950 p-3.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white">Teacher Remarks:</strong> {result.feedback}
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Submitted: {formatDate(result.submittedAt)}</span>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf(result)}
                    disabled={downloadingId === result.attemptId}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 font-bold text-slate-800 dark:text-slate-200 hover:border-brand-red hover:text-brand-red cursor-pointer"
                  >
                    <Download size={14} className="text-brand-red" aria-hidden="true" />
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
