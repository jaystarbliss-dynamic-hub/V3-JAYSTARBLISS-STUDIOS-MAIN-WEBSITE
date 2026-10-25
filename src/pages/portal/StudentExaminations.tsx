import { useMemo, useState, useEffect } from "react";
import {
  BookOpenCheck,
  Clock3,
  LockKeyhole,
  ShieldCheck,
  Eye,
  EyeOff,
  CircleAlert,
  CalendarDays,
  ArrowRight,
  Bell,
} from "lucide-react";
import { auth, db } from "../../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  classesMatch,
  normalizeClassName,
  computeExamMaxScore,
  calculateScorePercentage,
  resolvePartnerSchoolName,
} from "../../lib/classes";

type ExamCard = {
  id: string;
  title: string;
  subject: string;
  status: "active" | "upcoming" | "completed";
  durationMinutes: number;
  maxScore?: number;
  questionCount?: number;
  seriesName?: string;
  courseName?: string;
  learningVideoUrl?: string;
  availableFrom?: string;
  availableUntil?: string;
  attemptId?: string;
  attemptStatus?: string;
  score?: number;
  percentage?: number;
  releasedAt?: unknown;
  schoolId?: string;
  schoolName?: string;
  classIds?: string[];
  targetClass?: string;
  className?: string;
  passcode?: string;
  passcodeHash?: string;
  questions?: any[];
};

export default function StudentExaminations() {
  const [tab, setTab] = useState<"active" | "upcoming" | "completed">("active");
  const [exams, setExams] = useState<ExamCard[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [passcodes, setPasscodes] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; error?: boolean } | null>(
    null
  );

  // Student Profile details
  const [studentInfo, setStudentInfo] = useState<{
    id: string;
    uid: string;
    schoolId: string;
    schoolName: string;
    class: string;
    name: string;
  }>({
    id: "",
    uid: "",
    schoolId: "",
    schoolName: "",
    class: "",
    name: "",
  });

  // 1. Resolve Current Student Identity (across users, individualStudents, and students)
  useEffect(() => {
    let isMounted = true;
    const resolveStudent = async () => {
      const user = auth.currentUser;
      const cachedSchId = sessionStorage.getItem("schoolId") || "";
      const cachedSchName = sessionStorage.getItem("schoolName") || "";
      const cachedClass = sessionStorage.getItem("studentClass") || "";
      const cachedDocId = sessionStorage.getItem("studentDocId") || "";
      const cachedName = sessionStorage.getItem("userName") || "";

      const resolvedUid = user?.uid || "";
      let resolvedDocId = cachedDocId;
      let resolvedSchId = cachedSchId;
      let resolvedSchName = cachedSchName;
      let resolvedClass = cachedClass;
      let resolvedName = cachedName;

      if (user) {
        try {
          const userDocSnap = await getDoc(doc(db, "users", user.uid)).catch(() => null);
          if (userDocSnap?.exists()) {
            const udata = userDocSnap.data();
            if (udata.studentDocId) resolvedDocId = udata.studentDocId;
            if (udata.schoolId) resolvedSchId = udata.schoolId;
            if (udata.schoolName) resolvedSchName = udata.schoolName;
            if (udata.class || udata.grade || udata.className) {
              resolvedClass = udata.class || udata.grade || udata.className;
            }
            if (udata.name || udata.fullName) resolvedName = udata.name || udata.fullName;
          }

          const populateFromStudentDoc = (sData: any, docId: string) => {
            if (!resolvedDocId) resolvedDocId = docId;
            if (sData.class || sData.grade || sData.className) {
              resolvedClass = sData.class || sData.grade || sData.className;
            }
            if (sData.schoolId) resolvedSchId = sData.schoolId;
            if (sData.schoolName) resolvedSchName = sData.schoolName;
            if (sData.fullName || sData.studentName || sData.name) {
              resolvedName = sData.fullName || sData.studentName || sData.name;
            }
          };

          if (!resolvedClass || !resolvedSchId) {
            if (resolvedDocId) {
              const [indSnap, stdSnap] = await Promise.all([
                getDoc(doc(db, "individualStudents", resolvedDocId)).catch(() => null),
                getDoc(doc(db, "students", resolvedDocId)).catch(() => null),
              ]);
              if (indSnap?.exists()) populateFromStudentDoc(indSnap.data(), indSnap.id);
              else if (stdSnap?.exists()) populateFromStudentDoc(stdSnap.data(), stdSnap.id);
            }

            if (!resolvedClass || !resolvedSchId) {
              const [indQ, stdQ] = await Promise.all([
                getDocs(
                  query(collection(db, "individualStudents"), where("userId", "==", user.uid))
                ).catch(() => ({ docs: [] } as any)),
                getDocs(query(collection(db, "students"), where("userId", "==", user.uid))).catch(
                  () => ({ docs: [] } as any)
                ),
              ]);
              if (indQ.docs?.length > 0) {
                populateFromStudentDoc(indQ.docs[0].data(), indQ.docs[0].id);
              } else if (stdQ.docs?.length > 0) {
                populateFromStudentDoc(stdQ.docs[0].data(), stdQ.docs[0].id);
              }
            }
          }

          if (resolvedSchId && !resolvePartnerSchoolName(resolvedSchName)) {
            const schSnap = await getDoc(doc(db, "schools", resolvedSchId)).catch(() => null);
            if (schSnap?.exists()) {
              const s = schSnap.data();
              resolvedSchName = resolvePartnerSchoolName(s.name, s.schoolName);
            }
          }
        } catch (e) {
          console.warn("Could not load user profile doc:", e);
        }
      }

      const canonicalClass = normalizeClassName(resolvedClass) || resolvedClass;
      if (isMounted) {
        setStudentInfo({
          id: resolvedDocId || resolvedUid,
          uid: resolvedUid,
          schoolId: resolvedSchId,
          schoolName: resolvePartnerSchoolName(resolvedSchName),
          class: canonicalClass,
          name: resolvedName,
        });
      }
    };

    void resolveStudent();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load Examinations with Canonical Class Matching & Upcoming Notifications
  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      let loadedExams: ExamCard[] = [];
      let serverResponded = false;

      // 1. Try server endpoint
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch("/.netlify/functions/student-examinations", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            if (Array.isArray(data.exams)) {
              loadedExams = data.exams;
              serverResponded = true;
            }
          }
        }
      } catch (apiErr) {
        console.warn("Server student-examinations notice, engaging direct Firestore fallback:", apiErr);
      }

      // 2. Direct Firestore fallback
      if (!serverResponded) {
        const studentClass = studentInfo.class || sessionStorage.getItem("studentClass") || "";
        const currentSchId = studentInfo.schoolId || sessionStorage.getItem("schoolId") || "";
        const currentUid = auth.currentUser?.uid || "";
        const currentStudentId = studentInfo.id || sessionStorage.getItem("studentDocId") || "";

        const examDocsMap = new Map<string, any>();
        const [jdiSnap, schoolExamsSnap, legacyExamsSnap] = await Promise.all([
          getDocs(collection(db, "jdiExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "schoolExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "exams")).catch(() => ({ docs: [] } as any)),
        ]);

        [...jdiSnap.docs, ...schoolExamsSnap.docs, ...legacyExamsSnap.docs].forEach((d: any) => {
          examDocsMap.set(d.id, { id: d.id, ...d.data() });
        });

        const allRawExams = Array.from(examDocsMap.values());

        const classEligibleExams = allRawExams.filter((exam: any) => {
          if (exam.status === "draft" || exam.status === "archived") return false;

          if (exam.audienceType === "individual") {
            const studentIds = Array.isArray(exam.studentIds) ? exam.studentIds.map(String) : [];
            const studentUids = Array.isArray(exam.studentUids) ? exam.studentUids.map(String) : [];
            return studentIds.includes(currentStudentId) || studentUids.includes(currentUid);
          }

          if (exam.schoolId) {
            if (
              !currentSchId ||
              exam.schoolId.toLowerCase().trim() !== currentSchId.toLowerCase().trim()
            ) {
              return false;
            }
          }

          const targetClasses =
            Array.isArray(exam.classIds) && exam.classIds.length > 0
              ? exam.classIds
              : exam.targetClass
              ? [exam.targetClass]
              : exam.className
              ? [exam.className]
              : [];

          return classesMatch(studentClass, targetClasses);
        });

        const attemptsSnap = await getDocs(collection(db, "jdiExamAttempts")).catch(
          () => ({ docs: [] } as any)
        );
        const attemptsByExam: Record<string, any> = {};

        attemptsSnap.docs?.forEach((ad: any) => {
          const a = ad.data();
          if (a.studentUid === currentUid || a.studentId === currentStudentId) {
            attemptsByExam[String(a.examId)] = {
              attemptId: ad.id,
              attemptStatus: a.status,
              score: a.releasedAt ? a.score : undefined,
              maxScore: a.maxScore,
              releasedAt: a.releasedAt || undefined,
            };
          }
        });

        const now = Date.now();
        loadedExams = classEligibleExams.map((exam: any) => {
          const from = exam.availableFrom ? new Date(exam.availableFrom).getTime() : 0;
          const until = exam.availableUntil
            ? new Date(exam.availableUntil).getTime()
            : Number.MAX_SAFE_INTEGER;
          const computedStatus: "active" | "upcoming" | "completed" =
            exam.status === "completed" || now >= until
              ? "completed"
              : now < from || exam.status === "scheduled"
              ? "upcoming"
              : "active";

          const att = attemptsByExam[exam.id] || {};
          const maxScore = computeExamMaxScore(exam, att);
          const percentage =
            att.releasedAt && typeof att.score === "number"
              ? calculateScorePercentage(att.score, maxScore)
              : undefined;

          return {
            id: exam.id,
            title: exam.title || "Examination Assessment",
            subject: exam.subject || "Computer Technology",
            status: computedStatus,
            durationMinutes: Number(exam.durationMinutes) || 30,
            maxScore,
            questionCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
            seriesName: exam.seriesName,
            courseName: exam.courseName,
            learningVideoUrl: exam.learningVideoUrl,
            availableFrom: exam.availableFrom,
            availableUntil: exam.availableUntil,
            schoolId: exam.schoolId,
            schoolName: resolvePartnerSchoolName(exam.schoolName, studentInfo.schoolName),
            targetClass: normalizeClassName(exam.targetClass || exam.className || ""),
            passcode: exam.passcode,
            passcodeHash: exam.passcodeHash,
            questions: exam.questions,
            ...att,
            percentage,
          };
        });
      }

      // Load student's examination notifications
      if (auth.currentUser) {
        const notifSnap = await getDocs(
          query(collection(db, "jdiNotifications"), where("userId", "==", auth.currentUser.uid))
        ).catch(() => ({ docs: [] } as any));
        const notifs = (notifSnap.docs || [])
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .filter((n: any) => n.type === "examination_published")
          .slice(0, 5);
        setNotifications(notifs);
      }

      setExams(loadedExams);
    } catch (error) {
      setMessage({
        id: "list",
        text:
          error instanceof Error
            ? error.message
            : "Examinations could not be loaded. Please refresh.",
        error: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [studentInfo.schoolId, studentInfo.class]);

  const filtered = useMemo(() => exams.filter((e) => e.status === tab), [exams, tab]);
  const upcomingCount = useMemo(
    () => exams.filter((e) => e.status === "upcoming").length,
    [exams]
  );
  const activeCount = useMemo(() => exams.filter((e) => e.status === "active").length, [exams]);

  // Compute SHA-256 for passcode check
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

  // Validate Passcode & Begin Test
  const unlock = async (examId: string) => {
    const inputPasscode = (passcodes[examId] || "").trim();
    if (!inputPasscode) {
      setMessage({
        id: examId,
        text: "Please enter the examination passcode provided by your tutor.",
        error: true,
      });
      return;
    }
    setBusy(examId);
    setMessage(null);

    try {
      let attemptId = "";

      // 1. Try server function
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch("/.netlify/functions/examination-passcode", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ examId, passcode: inputPasscode }),
          });
          if (response.ok) {
            const result = await response.json().catch(() => ({}));
            if (result.attemptId) {
              attemptId = result.attemptId;
            }
          }
        }
      } catch (err) {
        console.warn("Server passcode verification note, using direct client resolver:", err);
      }

      // 2. Direct Firestore fallback
      if (!attemptId) {
        const targetExam = exams.find((e) => e.id === examId);
        if (!targetExam) throw new Error("Examination details could not be found.");

        const cleanInput = inputPasscode.trim().toUpperCase();
        const inputHash = await computeHash(inputPasscode.trim());

        const storedPlain = String(targetExam.passcode || "").trim().toUpperCase();
        const storedHash = String(targetExam.passcodeHash || "").trim().toLowerCase();

        const isValid =
          (storedPlain && storedPlain === cleanInput) || (storedHash && storedHash === inputHash);
        if (!isValid) {
          throw new Error(
            "Invalid examination passcode. Please contact your tutor or school coordinator."
          );
        }

        const newAttemptId = `att_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const durationMin = Number(targetExam.durationMinutes) || 30;
        const deadlineAt = new Date(Date.now() + durationMin * 60 * 1000).toISOString();
        const maxScore = computeExamMaxScore(targetExam);
        const schoolName = resolvePartnerSchoolName(
          targetExam.schoolName,
          studentInfo.schoolName,
          sessionStorage.getItem("schoolName") || ""
        );

        await setDoc(doc(db, "jdiExamAttempts", newAttemptId), {
          id: newAttemptId,
          examId,
          examTitle: targetExam.title,
          studentUid: auth.currentUser?.uid || studentInfo.uid,
          studentId: studentInfo.id || auth.currentUser?.uid || "student",
          studentName: studentInfo.name || "Student",
          className: normalizeClassName(studentInfo.class) || studentInfo.class || "General",
          schoolId: studentInfo.schoolId || targetExam.schoolId || null,
          schoolName,
          maxScore,
          questionsSnapshot: Array.isArray(targetExam.questions) ? targetExam.questions : [],
          status: "in_progress",
          answers: {},
          startedAt: serverTimestamp(),
          deadlineAt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        attemptId = newAttemptId;
      }

      window.location.assign(`/portal/student/exams/${encodeURIComponent(attemptId)}`);
    } catch (error) {
      setMessage({
        id: examId,
        text: error instanceof Error ? error.message : "Passcode could not be validated.",
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      {/* HEADER */}
      <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-blue-200">
              JAYSTARBLISS DYNAMIC INSTITUTE · JDI
            </p>
            <h1 className="mt-2 text-3xl font-bold">My Class Examinations</h1>
            <p className="mt-2 max-w-2xl text-slate-200">
              Assigned tests and upcoming assessments for your class
              {studentInfo.class ? ` (${studentInfo.class})` : ""}. An authorized school passcode is
              required to start an active test.
            </p>
          </div>
          {studentInfo.class && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <span className="block text-xs uppercase tracking-wider text-slate-400">
                Enrolled Class
              </span>
              <span className="text-sm font-bold text-white">{studentInfo.class}</span>
            </div>
          )}
        </div>
      </header>

      {/* UPCOMING / RECENT EXAM NOTIFICATIONS BANNER */}
      {notifications.length > 0 && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 text-blue-600 shrink-0" size={18} />
            <div className="space-y-1 text-xs sm:text-sm text-blue-950">
              <p className="font-bold">Class Examination Notices</p>
              {notifications.map((n) => (
                <p key={n.id} className="text-blue-900">
                  • <strong>{n.title}:</strong> {n.message}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TABS & REFRESH */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex flex-wrap gap-2">
            {(["active", "upcoming", "completed"] as const).map((item) => {
              const count =
                item === "active"
                  ? activeCount
                  : item === "upcoming"
                  ? upcomingCount
                  : exams.length - activeCount - upcomingCount;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition-colors ${
                    tab === item
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item} Tests ({count})
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Checking Tests…" : "Refresh List"}
          </button>
        </div>

        {message?.id === "list" && (
          <div
            role="alert"
            className="rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-900 border border-amber-200"
          >
            {message.text}
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && exams.length === 0 && !message && (
          <div className="py-14 text-center">
            <BookOpenCheck className="mx-auto mb-3 text-blue-600" size={44} />
            <h2 className="text-xl font-bold text-slate-900">No Tests Found For Your Class</h2>
            <p className="mt-1.5 max-w-md mx-auto text-sm text-slate-600">
              Examinations are tailored strictly to your specific class level (
              {studentInfo.class || "enrolled class"}). When your tutor assigns an assessment to
              your class, it will appear here.
            </p>
            <button
              onClick={load}
              className="mt-5 rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white hover:bg-blue-700 transition-colors"
            >
              Check Again
            </button>
          </div>
        )}

        {filtered.length === 0 && exams.length > 0 && (
          <p className="py-12 text-center text-sm font-medium text-slate-500">
            There are no <span className="font-bold capitalize">{tab}</span> examinations for your
            class right now.
          </p>
        )}

        {/* EXAM CARDS */}
        <div className="grid gap-4">
          {filtered.map((exam) => {
            const maxScore = computeExamMaxScore(exam);
            const pct =
              exam.releasedAt && typeof exam.score === "number"
                ? calculateScorePercentage(exam.score, maxScore)
                : undefined;

            return (
              <article
                key={exam.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="rounded-2xl bg-blue-50 p-3.5 text-blue-700 shrink-0">
                    <BookOpenCheck size={30} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{exam.title}</h2>
                      <span
                        className={`rounded-full px-3 py-0.5 text-xs font-bold capitalize ${
                          exam.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : exam.status === "upcoming"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {exam.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {exam.subject} · Total Marks: {maxScore}
                    </p>

                    {exam.attemptStatus && (
                      <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200">
                        <span>
                          Status:{" "}
                          <span className="capitalize font-bold text-slate-900">
                            {exam.releasedAt ? "Released" : exam.attemptStatus.replace("_", " ")}
                          </span>
                        </span>
                        {Boolean(exam.releasedAt) && exam.score !== undefined && (
                          <span className="text-emerald-700 font-bold ml-1">
                            · Official Score: {exam.score} / {maxScore} ({pct}%)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={15} className="text-slate-400" />
                        {exam.durationMinutes} minutes
                      </span>
                      {exam.availableFrom && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={15} className="text-slate-400" />
                          Available: {new Date(exam.availableFrom).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                {exam.status === "active" &&
                  exam.attemptStatus === "in_progress" &&
                  exam.attemptId && (
                    <div className="mt-4 pt-4 border-t">
                      <button
                        type="button"
                        onClick={() =>
                          window.location.assign(
                            `/portal/student/exams/${encodeURIComponent(exam.attemptId!)}`
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-700"
                      >
                        Resume Examination
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}

                {exam.attemptId &&
                  ["submitted", "expired", "graded"].includes(exam.attemptStatus || "") && (
                    <div className="mt-4 pt-4 border-t">
                      <button
                        type="button"
                        onClick={() =>
                          window.location.assign(
                            `/portal/student/exams/${encodeURIComponent(exam.attemptId!)}`
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-600 bg-white px-5 py-2.5 font-bold text-blue-700 hover:bg-blue-50"
                      >
                        {exam.releasedAt ? "View Official Report & Download PDF" : "View Submission Status"}
                      </button>
                    </div>
                  )}

                {/* PASSCODE ENTRY UNLOCK */}
                {exam.status === "active" &&
                  !["in_progress", "submitted", "expired", "graded"].includes(
                    exam.attemptStatus || ""
                  ) && (
                    <div className="mt-5 rounded-2xl bg-blue-50/70 p-5 border border-blue-100">
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <LockKeyhole size={18} className="text-blue-700" />
                        Enter Examination Passcode
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Enter the passcode provided by your tutor or school coordinator to unlock
                        and start this test.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                          <input
                            aria-label={`Passcode for ${exam.title}`}
                            autoComplete="off"
                            value={passcodes[exam.id] || ""}
                            onChange={(e) =>
                              setPasscodes((prev) => ({ ...prev, [exam.id]: e.target.value }))
                            }
                            type={visible[exam.id] ? "text" : "password"}
                            maxLength={128}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-semibold tracking-wider"
                            placeholder="Enter 6-digit passcode (e.g. JDI-XXXXXX)"
                          />
                          <button
                            type="button"
                            aria-label={visible[exam.id] ? "Hide passcode" : "Show passcode"}
                            onClick={() =>
                              setVisible((prev) => ({ ...prev, [exam.id]: !prev[exam.id] }))
                            }
                            className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                          >
                            {visible[exam.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={busy === exam.id}
                          onClick={() => unlock(exam.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                        >
                          <LockKeyhole size={17} />
                          {busy === exam.id ? "Validating…" : "Unlock & Begin Test"}
                        </button>
                      </div>
                      {message?.id === exam.id && (
                        <p
                          role="alert"
                          className={`mt-3 flex items-start gap-2 text-xs font-semibold ${
                            message.error ? "text-red-700" : "text-emerald-700"
                          }`}
                        >
                          <CircleAlert size={16} className="mt-0.5 shrink-0" />
                          {message.text}
                        </p>
                      )}
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <ShieldCheck size={14} className="text-blue-600" />
                        Protected by Jaystarbliss Central CBT Examination Security.
                      </p>
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
