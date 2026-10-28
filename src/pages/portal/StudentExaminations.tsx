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
  ExternalLink,
  CheckCircle2,
  Lock,
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
  normalizeDeliveryMode,
  normalizeWorkType,
  getWorkTypeLabels,
  isStudentEligibleForWork,
  isAttemptResultReleased,
  type WorkType,
} from "../../lib/classes";
import { ExamListSkeleton } from "../../components/ui/Skeleton";
import { getFriendlyErrorMessage, logInternalDiagnostic } from "../../utils/friendlyErrors";

type ExamCard = {
  id: string;
  title: string;
  description?: string;
  subject: string;
  workType?: WorkType;
  dueDate?: string;
  isUngradedActivity?: boolean;
  deliveryMode?: "EXTERNAL_LINK" | "NATIVE";
  externalUrl?: string;
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
  resultReleased?: boolean;
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
  const [workTypeTab, setWorkTypeTab] = useState<"ALL" | WorkType>("ALL");
  const [exams, setExams] = useState<ExamCard[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [passcodes, setPasscodes] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [unlockedExternalUrls, setUnlockedExternalUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; error?: boolean } | null>(
    null
  );

  // Student Profile details
  const [studentInfo, setStudentInfo] = useState<{
    id: string;
    uid: string;
    schoolId: string;
    schoolAliases: string[];
    schoolName: string;
    class: string;
    name: string;
  }>({
    id: "",
    uid: "",
    schoolId: "",
    schoolAliases: [],
    schoolName: "",
    class: "",
    name: "",
  });

  // 1. Resolve Current Student Identity & School Aliases (across users, individualStudents, students, and schools)
  const resolveStudentContext = async () => {
    const user = auth.currentUser;
    const cachedSchId = sessionStorage.getItem("schoolId") || "";
    const cachedSchName = sessionStorage.getItem("schoolName") || "";
    const cachedClass = sessionStorage.getItem("studentClass") || "";
    const cachedDocId =
      sessionStorage.getItem("studentDocId") ||
      localStorage.getItem("jaystar_cached_student_doc_id") ||
      "";
    const cachedUsername =
      sessionStorage.getItem("studentUsername") ||
      localStorage.getItem("jaystar_cached_student_username") ||
      "";
    const cachedName =
      sessionStorage.getItem("userName") ||
      localStorage.getItem("jaystar_cached_user_name") ||
      "";

    const resolvedUid =
      user?.uid ||
      sessionStorage.getItem("userId") ||
      localStorage.getItem("jaystar_cached_user_id") ||
      "";
    let resolvedDocId = cachedDocId;
    let resolvedSchId = cachedSchId;
    let resolvedSchName = cachedSchName;
    let resolvedClass = cachedClass;
    let resolvedName = cachedName;
    const aliasSet = new Set<string>();
    const addAlias = (val: unknown) => {
      const s = String(val ?? "").trim();
      if (s && s !== "private" && s !== "none") aliasSet.add(s);
    };
    addAlias(cachedSchId);

    try {
      if (resolvedUid) {
        const userDocSnap = await getDoc(doc(db, "users", resolvedUid)).catch(() => null);
        if (userDocSnap?.exists()) {
          const udata = userDocSnap.data();
          if (udata.studentDocId) resolvedDocId = udata.studentDocId;
          if (udata.schoolId) {
            resolvedSchId = udata.schoolId;
            addAlias(udata.schoolId);
          }
          if (udata.schoolCode) addAlias(udata.schoolCode);
          if (udata.schoolName) resolvedSchName = udata.schoolName;
          if (udata.class || udata.grade || udata.className) {
            resolvedClass = udata.class || udata.grade || udata.className;
          }
          if (udata.name || udata.fullName) resolvedName = udata.name || udata.fullName;
        }
      }

      const populateFromStudentDoc = (sData: any, docId: string) => {
        if (!resolvedDocId) resolvedDocId = docId;
        if (sData.class || sData.grade || sData.className || sData.classLevel) {
          resolvedClass = sData.class || sData.grade || sData.className || sData.classLevel;
        }
        if (sData.schoolId || sData.schoolDocId || sData.school_id) {
          resolvedSchId = sData.schoolId || sData.schoolDocId || sData.school_id;
          addAlias(sData.schoolId);
          addAlias(sData.schoolDocId);
          addAlias(sData.school_id);
        }
        if (sData.schoolCode || sData.school) {
          addAlias(sData.schoolCode);
          addAlias(sData.school);
        }
        if (sData.schoolName) resolvedSchName = sData.schoolName;
        if (sData.fullName || sData.studentName || sData.name) {
          resolvedName = sData.fullName || sData.studentName || sData.name;
        }
      };

      if (resolvedDocId) {
        const [indSnap, stdSnap] = await Promise.all([
          getDoc(doc(db, "individualStudents", resolvedDocId)).catch(() => null),
          getDoc(doc(db, "students", resolvedDocId)).catch(() => null),
        ]);
        if (indSnap?.exists()) populateFromStudentDoc(indSnap.data(), indSnap.id);
        if (stdSnap?.exists()) populateFromStudentDoc(stdSnap.data(), stdSnap.id);
      }

      if ((!resolvedClass || !resolvedSchId) && resolvedUid) {
        const [indByUser, stdByUser, indByFb, stdByFb] = await Promise.all([
          getDocs(
            query(collection(db, "individualStudents"), where("userId", "==", resolvedUid))
          ).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, "students"), where("userId", "==", resolvedUid))).catch(
            () => ({ docs: [] } as any)
          ),
          getDocs(
            query(collection(db, "individualStudents"), where("firebaseUid", "==", resolvedUid))
          ).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, "students"), where("firebaseUid", "==", resolvedUid))).catch(
            () => ({ docs: [] } as any)
          ),
        ]);
        [
          ...(indByUser.docs || []),
          ...(stdByUser.docs || []),
          ...(indByFb.docs || []),
          ...(stdByFb.docs || []),
        ].forEach((d: any) => populateFromStudentDoc(d.data(), d.id));
      }

      if ((!resolvedClass || !resolvedSchId) && cachedUsername) {
        const cleanUser = cachedUsername.toLowerCase().replace(/^@/, "").trim();
        const [indByUname, stdByUname] = await Promise.all([
          getDocs(
            query(collection(db, "individualStudents"), where("username", "==", cleanUser))
          ).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, "students"), where("username", "==", cleanUser))).catch(
            () => ({ docs: [] } as any)
          ),
        ]);
        const matchedDoc = indByUname.docs?.[0] || stdByUname.docs?.[0];
        if (matchedDoc) {
          populateFromStudentDoc(matchedDoc.data(), matchedDoc.id);
        }
      }

      if (resolvedSchId) {
        addAlias(resolvedSchId);
        const schSnap = await getDoc(doc(db, "schools", resolvedSchId)).catch(() => null);
        if (schSnap?.exists()) {
          const s = schSnap.data();
          addAlias(schSnap.id);
          addAlias(s.schoolId);
          addAlias(s.code);
          addAlias(s.schoolCode);
          resolvedSchName = resolvePartnerSchoolName(s.name, s.schoolName, resolvedSchName);
        } else {
          const byCodeSnap = await getDocs(
            query(collection(db, "schools"), where("schoolId", "==", resolvedSchId))
          ).catch(() => ({ docs: [] } as any));
          if (byCodeSnap.docs?.length > 0) {
            const d = byCodeSnap.docs[0];
            const s = d.data();
            resolvedSchId = d.id;
            addAlias(d.id);
            addAlias(s.schoolId);
            addAlias(s.code);
            addAlias(s.schoolCode);
            resolvedSchName = resolvePartnerSchoolName(s.name, s.schoolName, resolvedSchName);
          }
        }
      }
    } catch (e) {
      console.warn("Could not load user profile doc:", e);
    }

    const canonicalClass = normalizeClassName(resolvedClass) || resolvedClass;
    const cleanSchoolName = resolvePartnerSchoolName(resolvedSchName);
    if (cleanSchoolName) addAlias(cleanSchoolName);

    if (resolvedSchId) sessionStorage.setItem("schoolId", resolvedSchId);
    if (cleanSchoolName) sessionStorage.setItem("schoolName", cleanSchoolName);
    if (canonicalClass) sessionStorage.setItem("studentClass", canonicalClass);
    if (resolvedDocId) sessionStorage.setItem("studentDocId", resolvedDocId);

    const ctx = {
      id: resolvedDocId || resolvedUid,
      uid: resolvedUid,
      schoolId: resolvedSchId,
      schoolAliases: Array.from(aliasSet),
      schoolName: cleanSchoolName,
      class: canonicalClass,
      name: resolvedName,
    };
    setStudentInfo(ctx);
    return ctx;
  };

  // 2. Load Examinations with Canonical Class Matching & Upcoming Notifications
  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const ctx = await resolveStudentContext();
      const examMap = new Map<string, ExamCard>();

      // 1. Try server endpoint (ignore fallback: true responses)
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch("/.netlify/functions/student-examinations", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            if (!data.fallback && Array.isArray(data.exams)) {
              data.exams.forEach((exam: any) => {
                examMap.set(String(exam.id), {
                  ...exam,
                  workType: normalizeWorkType(exam.workType, exam),
                  deliveryMode: normalizeDeliveryMode(exam),
                  externalUrl: String(exam.externalUrl || "").trim(),
                  description: String(exam.description || exam.instructions || "").trim(),
                });
              });
            }
          }
        }
      } catch (apiErr) {
        console.warn("Server student-examinations notice, engaging direct Firestore fallback:", apiErr);
      }

      // 2. Direct Firestore merge across jdiExams, schoolExams, and legacy exams
      const studentClass = ctx.class || sessionStorage.getItem("studentClass") || "";
      const currentSchId = ctx.schoolId || sessionStorage.getItem("schoolId") || "";
      const currentUid = auth.currentUser?.uid || ctx.uid || "";
      const currentStudentId = ctx.id || sessionStorage.getItem("studentDocId") || "";

      const rawDocsMap = new Map<string, any>();
      const [jdiSnap, schoolExamsSnap, legacyExamsSnap] = await Promise.all([
        getDocs(collection(db, "jdiExams")).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, "schoolExams")).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, "exams")).catch(() => ({ docs: [] } as any)),
      ]);

      [...jdiSnap.docs, ...schoolExamsSnap.docs, ...legacyExamsSnap.docs].forEach((d: any) => {
        rawDocsMap.set(d.id, { id: d.id, ...d.data() });
      });

      const allRawExams = Array.from(rawDocsMap.values());

      const classEligibleExams = allRawExams.filter((exam: any) =>
        isStudentEligibleForWork(
          {
            id: currentStudentId,
            uid: currentUid,
            schoolId: currentSchId,
            schoolAliases: ctx.schoolAliases,
            schoolName: ctx.schoolName,
            class: studentClass,
          },
          exam
        )
      );

      const attemptsSnap = await getDocs(collection(db, "jdiExamAttempts")).catch(
        () => ({ docs: [] } as any)
      );
      const attemptsByExam: Record<string, any> = {};

      attemptsSnap.docs?.forEach((ad: any) => {
        const a = ad.data();
        if (
          (currentUid && a.studentUid === currentUid) ||
          (currentStudentId && a.studentId === currentStudentId)
        ) {
          const isReleased = isAttemptResultReleased(a);
          attemptsByExam[String(a.examId)] = {
            attemptId: ad.id,
            attemptStatus: a.status,
            score: isReleased ? a.score : undefined,
            maxScore: a.maxScore,
            releasedAt: isReleased
              ? a.releasedAt || a.updatedAt || a.submittedAt || new Date().toISOString()
              : undefined,
            resultReleased: isReleased,
          };
        }
      });

      const now = Date.now();
      classEligibleExams.forEach((exam: any) => {
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
        const deliveryMode = normalizeDeliveryMode(exam);
        const maxScore = computeExamMaxScore(exam, att);
        const percentage =
          isAttemptResultReleased(att) && typeof att.score === "number"
            ? calculateScorePercentage(att.score, maxScore)
            : undefined;

        const existingServerItem = examMap.get(String(exam.id));
        examMap.set(String(exam.id), {
          id: exam.id,
          title: exam.title || "Assessment",
          description: String(exam.description || exam.instructions || "").trim(),
          subject: exam.subject || "Computer Technology",
          workType: normalizeWorkType(exam.workType, exam),
          dueDate: exam.dueDate || undefined,
          isUngradedActivity: Boolean(exam.isUngradedActivity),
          deliveryMode,
          externalUrl: String(exam.externalUrl || exam.url || exam.link || "").trim(),
          status: existingServerItem?.status || computedStatus,
          durationMinutes:
            deliveryMode === "EXTERNAL_LINK"
              ? Number(exam.durationMinutes) || 0
              : Number(exam.durationMinutes) || 30,
          maxScore,
          questionCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
          seriesName: exam.seriesName,
          courseName: exam.courseName,
          learningVideoUrl: exam.learningVideoUrl,
          availableFrom: exam.availableFrom,
          availableUntil: exam.availableUntil,
          schoolId: exam.schoolId,
          schoolName: resolvePartnerSchoolName(exam.schoolName, ctx.schoolName),
          targetClass: normalizeClassName(exam.targetClass || exam.className || ""),
          passcode: exam.passcode,
          passcodeHash: exam.passcodeHash,
          questions: exam.questions,
          ...att,
          ...(existingServerItem?.attemptId ? {
            attemptId: existingServerItem.attemptId,
            attemptStatus: existingServerItem.attemptStatus,
            score: existingServerItem.score,
            releasedAt: existingServerItem.releasedAt,
            percentage: existingServerItem.percentage ?? percentage,
          } : { percentage }),
        });
      });

      const loadedExams = Array.from(examMap.values());

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
            : "Assessments could not be loaded. Please refresh.",
        error: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      exams.filter((e) => {
        if (workTypeTab !== "ALL" && normalizeWorkType(e.workType, e) !== workTypeTab) {
          return false;
        }
        return e.status === tab;
      }),
    [exams, tab, workTypeTab]
  );
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

  // Validate Passcode & Begin Assessment or Unlock External Link
  const unlock = async (examId: string) => {
    const inputPasscode = (passcodes[examId] || "").trim();
    if (!inputPasscode) {
      setMessage({
        id: examId,
        text: "Please enter the assessment passcode provided by your tutor.",
        error: true,
      });
      return;
    }
    setBusy(examId);
    setMessage(null);

    try {
      const targetExam = exams.find((e) => e.id === examId);
      const isExternalExam = targetExam?.deliveryMode === "EXTERNAL_LINK";

      let attemptId = "";
      let unlockedExternalUrl = "";

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
            if (result.deliveryMode === "EXTERNAL_LINK" && result.externalUrl) {
              unlockedExternalUrl = String(result.externalUrl).trim();
            } else if (result.attemptId) {
              attemptId = result.attemptId;
            }
          }
        }
      } catch (err) {
        console.warn("Server passcode verification note, using direct client resolver:", err);
      }

      // 2. Direct Firestore fallback
      if (!attemptId && !unlockedExternalUrl) {
        if (!targetExam) throw new Error("Assessment details could not be found.");

        const cleanInput = inputPasscode.trim().toUpperCase();
        const inputHash = await computeHash(inputPasscode.trim());

        const storedPlain = String(targetExam.passcode || "").trim().toUpperCase();
        const storedHash = String(targetExam.passcodeHash || "").trim().toLowerCase();

        const isValid =
          (storedPlain && storedPlain === cleanInput) || (storedHash && storedHash === inputHash);
        if (!isValid) {
          throw new Error(
            "Invalid assessment passcode. Please contact your tutor or school coordinator."
          );
        }

        if (isExternalExam) {
          unlockedExternalUrl = String(targetExam.externalUrl || "").trim();
          if (!unlockedExternalUrl) {
            throw new Error("The external assessment link has not been configured by the tutor.");
          }
        } else {
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
      }

      if (unlockedExternalUrl) {
        setUnlockedExternalUrls((prev) => ({ ...prev, [examId]: unlockedExternalUrl }));
        setMessage({
          id: examId,
          text: "Access code verified. Click 'Open Assessment' below to launch your assessment.",
          error: false,
        });
        return;
      }

      window.location.assign(`/portal/student/exams/${encodeURIComponent(attemptId)}`);
    } catch (error) {
      logInternalDiagnostic('StudentExaminations::ValidatePasscode', error);
      setMessage({
        id: examId,
        text: getFriendlyErrorMessage(error),
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-3 sm:p-5 md:p-8 overflow-x-hidden">
      {/* UPCOMING / RECENT ASSESSMENT NOTIFICATIONS BANNER */}
      {notifications.length > 0 && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 text-blue-600 shrink-0" size={18} />
            <div className="space-y-1 text-xs sm:text-sm text-blue-950 min-w-0">
              <p className="font-bold">Class Assessment Notices</p>
              {notifications.map((n) => (
                <p key={n.id} className="text-blue-900 break-words">
                  • <strong>{n.title}:</strong> {n.message}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TABS & REFRESH */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        {/* Clean Work-Type Category Tabs */}
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 touch-pan-x">
          {(
            [
              { id: "ALL", label: "All Assessments" },
              { id: "ASSIGNMENT", label: "Assignments" },
              { id: "ACTIVITY", label: "Activities" },
              { id: "TEST", label: "Tests" },
              { id: "EXAMINATION", label: "Examinations" },
            ] as const
          ).map((wt) => {
            const active = workTypeTab === wt.id;
            const count =
              wt.id === "ALL"
                ? exams.length
                : exams.filter((e) => normalizeWorkType(e.workType, e) === wt.id).length;
            return (
              <button
                key={wt.id}
                type="button"
                onClick={() => setWorkTypeTab(wt.id)}
                className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active ? "text-[#14284B]" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>{wt.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                  {count}
                </span>
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {studentInfo.class && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                Class: <span className="text-blue-700">{studentInfo.class}</span>
              </span>
            )}
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
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
                  className={`rounded-xl px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-bold capitalize transition-colors text-center ${
                    tab === item
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item} ({count})
                </button>
              );
            })}
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="w-full sm:w-auto rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
          >
            {loading ? "Checking Work…" : "Refresh List"}
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
          <div className="py-12 sm:py-14 text-center px-3">
            <BookOpenCheck className="mx-auto mb-3 text-blue-600" size={44} />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              No Assessments Found For Your Class
            </h2>
            <p className="mt-1.5 max-w-md mx-auto text-xs sm:text-sm text-slate-600">
              Assessments are tailored strictly to your specific class level (
              {studentInfo.class || "enrolled class"}). When your tutor assigns an assessment to
              your class, it will appear here.
            </p>
            <button
              onClick={load}
              className="mt-5 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
            >
              Check Again
            </button>
          </div>
        )}

        {filtered.length === 0 && exams.length > 0 && (
          <p className="py-12 text-center text-sm font-medium text-slate-500">
            There are no <span className="font-bold capitalize">{tab}</span> assessments for your
            class right now.
          </p>
        )}

        {/* ASSESSMENT CARDS */}
        {loading ? (
          <ExamListSkeleton count={3} />
        ) : (
          <div className="grid gap-4">
            {filtered.map((exam) => {
            const isExternal = exam.deliveryMode === "EXTERNAL_LINK";
            const maxScore = computeExamMaxScore(exam);
            const isReleased = Boolean(exam.releasedAt || exam.resultReleased);
            const pct =
              isReleased && typeof exam.score === "number"
                ? calculateScorePercentage(exam.score, maxScore)
                : undefined;
            const unlockedUrl = unlockedExternalUrls[exam.id];
            const typeLabels = getWorkTypeLabels(exam.workType, exam);

            return (
              <article
                key={exam.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 shrink-0 self-start">
                    {isExternal ? <ExternalLink size={26} /> : <BookOpenCheck size={26} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B91C1C]">
                        {typeLabels.singular}
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 break-words">
                        {exam.title}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
                          exam.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : exam.status === "upcoming"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {exam.status}
                      </span>
                      {isExternal && (
                        <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                          External Link
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs sm:text-sm font-medium text-slate-600">
                      {exam.subject}
                      {!isExternal && maxScore > 0 ? ` · Total Marks: ${maxScore}` : ""}
                    </p>

                    {exam.description && (
                      <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed break-words">
                        {exam.description}
                      </p>
                    )}

                    {!isExternal && exam.attemptStatus && (
                      <div className="mt-2.5 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200">
                        <span>
                          Status:{" "}
                          <span className="capitalize font-bold text-slate-900">
                            {isReleased ? "Released" : exam.attemptStatus.replace("_", " ")}
                          </span>
                        </span>
                        {isReleased && exam.score !== undefined ? (
                          <span className="text-emerald-700 font-bold">
                            · Official Score: {exam.score} / {maxScore} ({pct}%)
                          </span>
                        ) : ["submitted", "expired", "graded"].includes(exam.attemptStatus) ? (
                          <span className="text-amber-700 font-semibold">
                            · Awaiting Tutor Release
                          </span>
                        ) : null}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-3 sm:gap-4 text-xs font-semibold text-slate-600">
                      {(!isExternal || exam.durationMinutes > 0) && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 size={15} className="text-slate-400 shrink-0" />
                          {exam.durationMinutes} minutes
                        </span>
                      )}
                      {exam.availableFrom && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={15} className="text-slate-400 shrink-0" />
                          Available: {new Date(exam.availableFrom).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ACTION BUTTONS FOR NATIVE ATTEMPTS */}
                {!isExternal &&
                  exam.status === "active" &&
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
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        {typeLabels.resumeLabel}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}

                {!isExternal &&
                  exam.attemptId &&
                  ["submitted", "expired", "graded"].includes(exam.attemptStatus || "") && (
                    <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          window.location.assign(
                            `/portal/student/exams/${encodeURIComponent(exam.attemptId!)}`
                          )
                        }
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 bg-white px-5 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
                      >
                        {isReleased
                          ? "View Official Report & Download PDF"
                          : "View Submission Status"}
                      </button>
                      {!isReleased && (
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Printing is disabled until your tutor releases the result."
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-400 opacity-60 cursor-not-allowed"
                        >
                          <Lock size={15} />
                          Print Official PDF (Awaiting Tutor Release)
                        </button>
                      )}
                    </div>
                  )}

                {/* EXTERNAL LINK UNLOCKED STATE */}
                {isExternal && exam.status === "active" && unlockedUrl && (
                  <div className="mt-4 rounded-2xl bg-emerald-50/80 p-4 sm:p-5 border border-emerald-200 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      Access Verified — Ready to Launch
                    </div>
                    <p className="text-xs text-emerald-800">
                      Your portal access code has been verified. Click the button below to open your{" "}
                      {typeLabels.lowerSingular} in a new tab.
                    </p>
                    <div className="pt-1">
                      <a
                        href={unlockedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700 shadow-sm transition-colors"
                      >
                        Open {typeLabels.singular}
                        <ExternalLink size={16} />
                      </a>
                    </div>
                  </div>
                )}

                {/* PASSCODE ENTRY UNLOCK */}
                {exam.status === "active" &&
                  !unlockedUrl &&
                  !["in_progress", "submitted", "expired", "graded"].includes(
                    exam.attemptStatus || ""
                  ) && (
                    <div className="mt-4 sm:mt-5 rounded-2xl bg-blue-50/70 p-4 sm:p-5 border border-blue-100">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <LockKeyhole size={18} className="text-blue-700 shrink-0" />
                        Enter {typeLabels.singular} Passcode
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Enter the passcode provided by your tutor or school coordinator to{" "}
                        {isExternal
                          ? `unlock the external ${typeLabels.lowerSingular} link.`
                          : `unlock and start this ${typeLabels.lowerSingular}.`}
                      </p>
                      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                        <div className="relative flex-1 min-w-0">
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
                            placeholder="Enter passcode (e.g. JDI-XXXXXX)"
                          />
                          <button
                            type="button"
                            aria-label={visible[exam.id] ? "Hide passcode" : "Show passcode"}
                            onClick={() =>
                              setVisible((prev) => ({ ...prev, [exam.id]: !prev[exam.id] }))
                            }
                            className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            {visible[exam.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={busy === exam.id}
                          onClick={() => unlock(exam.id)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm shrink-0"
                        >
                          <LockKeyhole size={17} />
                          {busy === exam.id
                            ? "Validating…"
                            : isExternal
                            ? "Verify Access Code"
                            : `Unlock & ${typeLabels.startLabel}`}
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
                          <span>{message.text}</span>
                        </p>
                      )}
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <ShieldCheck size={14} className="text-blue-600 shrink-0" />
                        Protected by Jaystarbliss Central CBT Assessment Security.
                      </p>
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      )}
      </section>
    </main>
  );
}
