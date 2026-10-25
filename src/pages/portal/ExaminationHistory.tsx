import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { createZip } from "../../modules/examinations/zip";
import { createXlsx } from "../../modules/examinations/xlsx";
import { generateExamReportPdf } from "../../lib/examReportPdfGenerator";
import {
  computeExamMaxScore,
  calculateScorePercentage,
  normalizeClassName,
  resolvePartnerSchoolName,
  canManageExamRecord,
} from "../../lib/classes";
import {
  School,
  BookOpenCheck,
  CheckCircle2,
  FileSpreadsheet,
  FileArchive,
  Download,
  KeyRound,
  Copy,
  Check,
  Clock,
  Calendar,
} from "lucide-react";

type Question = {
  id: string;
  prompt: string;
  points: number;
  type: string;
  options?: { id: string; text: string }[];
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
};

type Exam = {
  id: string;
  title: string;
  subject: string;
  status: string;
  durationMinutes: number;
  schoolId?: string;
  schoolName?: string;
  targetClass?: string;
  className?: string;
  classIds?: string[];
  passcode?: string;
  availableFrom?: string;
  availableUntil?: string;
  maxScore?: number;
  questionCount?: number;
  questions?: Question[];
  createdBy?: string;
  tutorId?: string;
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
  percentage?: number;
  submittedAt?: any;
  releasedAt?: any;
  autoGraded?: boolean;
  answers?: Record<string, string | string[]>;
  questions?: Question[];
  questionsSnapshot?: Question[];
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
  const isAdminWorkspace = location.pathname.startsWith("/admin/");

  const [userRole, setUserRole] = useState<string>(isSchoolPortal ? "SCHOOL" : "");
  const [schoolId, setSchoolId] = useState<string>(
    () => sessionStorage.getItem("schoolId") || sessionStorage.getItem("schoolDocId") || ""
  );
  const [schoolAliases, setSchoolAliases] = useState<string[]>([]);
  const [availableSchools, setAvailableSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolNameMap, setSchoolNameMap] = useState<Record<string, string>>({});
  const [scopeReady, setScopeReady] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState("");
  const [copiedExamId, setCopiedExamId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const isSchoolUser =
    isSchoolPortal || ["SCHOOL", "SCHOOL_ADMIN"].includes(userRole.toUpperCase());
  const isPlatformAdmin =
    isAdminWorkspace || ["ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(userRole.toUpperCase());

  // 1. Resolve User Scope & Authorised Schools (Strict Isolation for School Portal & Tutors)
  useEffect(() => {
    let isMounted = true;
    const resolveScope = async () => {
      try {
        const currentUser = auth.currentUser;
        const cachedSchId =
          sessionStorage.getItem("schoolId") || sessionStorage.getItem("schoolDocId") || "";
        const cachedSchName = sessionStorage.getItem("schoolName") || "";

        if (!currentUser) {
          if (isMounted) setScopeReady(true);
          return;
        }

        const userSnap = await getDoc(doc(db, "users", currentUser.uid)).catch(() => null);
        const userData = userSnap?.exists() ? userSnap.data() : {};
        const detectedRole = String(
          userData.role ||
            sessionStorage.getItem("userRole") ||
            (isSchoolPortal ? "SCHOOL" : isAdminWorkspace ? "ADMIN" : "TUTOR")
        ).toUpperCase();

        if (isMounted) setUserRole(detectedRole);

        // CASE A: School Administrator — strictly locked to their own school ONLY
        if (isSchoolPortal || ["SCHOOL", "SCHOOL_ADMIN"].includes(detectedRole)) {
          const aliases = new Set<string>();
          const addAlias = (v: any) => {
            if (typeof v === "string" && v.trim()) aliases.add(v.trim());
          };
          addAlias(cachedSchId);
          addAlias(sessionStorage.getItem("schoolDocId"));
          addAlias(userData.schoolId);
          addAlias(userData.schoolCode);

          let canonicalId = cachedSchId || String(userData.schoolId || "").trim();
          let resolvedName = resolvePartnerSchoolName(cachedSchName, userData.schoolName);

          // Check schools collection for the school's own record (by doc ID, adminUid, or email)
          if (canonicalId) {
            const directSchSnap = await getDoc(doc(db, "schools", canonicalId)).catch(() => null);
            if (directSchSnap?.exists()) {
              const s = directSchSnap.data();
              canonicalId = directSchSnap.id;
              addAlias(directSchSnap.id);
              addAlias(s.schoolId);
              addAlias(s.code);
              addAlias(s.schoolCode);
              resolvedName = resolvePartnerSchoolName(s.name, s.schoolName, resolvedName);
            }
          }

          if (!resolvedName || aliases.size === 0) {
            const byAdminSnap = await getDocs(
              query(collection(db, "schools"), where("adminUid", "==", currentUser.uid))
            ).catch(() => ({ docs: [] } as any));
            byAdminSnap.docs?.forEach((d: any) => {
              const s = d.data();
              if (!canonicalId) canonicalId = d.id;
              addAlias(d.id);
              addAlias(s.schoolId);
              addAlias(s.code);
              addAlias(s.schoolCode);
              resolvedName = resolvePartnerSchoolName(s.name, s.schoolName, resolvedName);
            });
          }

          const finalName = resolvedName || "Assigned Partner School";
          const aliasList = Array.from(aliases);
          if (isMounted) {
            setSchoolAliases(aliasList);
            setSchoolId(canonicalId || aliasList[0] || "");
            const singleSchoolList = canonicalId
              ? [{ id: canonicalId, name: finalName }]
              : [];
            setAvailableSchools(singleSchoolList);
            const nameMap: Record<string, string> = {};
            aliasList.forEach((a) => {
              nameMap[a] = finalName;
              nameMap[a.toLowerCase()] = finalName;
            });
            setSchoolNameMap(nameMap);
            setScopeReady(true);
          }
          return;
        }

        // CASE B: Tutor or Platform Admin
        const staffAccessSnap = await getDoc(doc(db, "staffSchoolAccess", currentUser.uid)).catch(
          () => null
        );
        const staffAccessData = staffAccessSnap?.exists() ? staffAccessSnap.data() : {};
        const directSchoolIds = new Set<string>();
        const addId = (val: any) => {
          if (!val) return;
          if (typeof val === "string" && val.trim()) directSchoolIds.add(val.trim());
          else if (typeof val === "object") {
            const c = val.id || val.schoolId || val.code;
            if (c) directSchoolIds.add(String(c).trim());
          }
        };
        addId(userData.schoolId);
        if (Array.isArray(userData.schoolIds)) userData.schoolIds.forEach(addId);
        if (Array.isArray(userData.assignedSchools)) userData.assignedSchools.forEach(addId);
        addId(staffAccessData.schoolId);
        if (Array.isArray(staffAccessData.schoolIds)) staffAccessData.schoolIds.forEach(addId);

        const snap = await getDocs(collection(db, "schools")).catch(() => ({ docs: [] } as any));
        const list: { id: string; name: string }[] = [];
        const nameMap: Record<string, string> = {};

        snap.docs?.forEach((d: any) => {
          const s = d.data();
          const sId = d.id;
          const sCode = String(s.schoolId || s.code || s.schoolCode || "").trim();
          const sName =
            resolvePartnerSchoolName(s.name, s.schoolName) || `Partner School (${sId})`;
          nameMap[sId] = sName;
          nameMap[sId.toLowerCase()] = sName;
          if (sCode) {
            nameMap[sCode] = sName;
            nameMap[sCode.toLowerCase()] = sName;
          }

          const isAdmin =
            isAdminWorkspace || ["ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(detectedRole);
          if (isAdmin) {
            list.push({ id: sId, name: sName });
          } else {
            const extractIds = (arr: any) =>
              Array.isArray(arr)
                ? arr
                    .map((x: any) =>
                      typeof x === "string" ? x : x?.id || x?.uid || x?.staffId || x?.userId
                    )
                    .filter(Boolean)
                : [];
            const assigned = [
              ...extractIds(s.tutors),
              ...extractIds(s.assignedTutors),
              ...extractIds(s.assignedTutorIds),
              ...extractIds(s.assignedStaff),
              ...extractIds(s.staffIds),
              ...extractIds(s.tutorIds),
            ];
            if (
              directSchoolIds.has(sId) ||
              (sCode && directSchoolIds.has(sCode)) ||
              assigned.includes(currentUser.uid) ||
              s.tutorId === currentUser.uid ||
              s.staffId === currentUser.uid
            ) {
              list.push({ id: sId, name: sName });
            }
          }
        });

        if (isMounted) {
          setSchoolNameMap(nameMap);
          setAvailableSchools(list);
          if (!schoolId && list.length > 0) {
            setSchoolId(list[0].id);
          }
          setScopeReady(true);
        }
      } catch (e) {
        console.warn("Could not resolve school scope:", e);
        if (isMounted) setScopeReady(true);
      }
    };

    void resolveScope();
    return () => {
      isMounted = false;
    };
  }, [isSchoolPortal, isAdminWorkspace]);

  const resolveSchoolLabel = (id?: string, fallbackName?: string) => {
    const key = String(id || "").trim();
    const mapped = key ? schoolNameMap[key] || schoolNameMap[key.toLowerCase()] : "";
    return resolvePartnerSchoolName(mapped, fallbackName, "Assigned Partner School");
  };

  // 2. Load Examinations & Attempts within Authorised Scope
  const load = async () => {
    if (!scopeReady) return;
    setLoading(true);
    setMessage("");
    try {
      let loadedExams: Exam[] = [];
      let loadedAttempts: Attempt[] = [];
      let serverResponded = false;

      // 1. Try server function
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const url =
            "/.netlify/functions/jdi-exam-management?schoolId=" +
            encodeURIComponent(schoolId || "");
          const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
          if (r.ok) {
            const d = await r.json();
            if (Array.isArray(d.exams)) loadedExams = d.exams;
            if (Array.isArray(d.attempts)) loadedAttempts = d.attempts;
            serverResponded = true;
          }
        }
      } catch (err) {
        console.warn("Server exam history notice, falling back to Firestore:", err);
      }

      // 2. Direct Firestore fallback (enforcing strict school/tutor isolation)
      if (!serverResponded) {
        const currentUid = auth.currentUser?.uid || "";
        const allowedSchoolKeys = new Set<string>();
        if (isSchoolUser) {
          schoolAliases.forEach((a) => allowedSchoolKeys.add(a.toLowerCase()));
          if (schoolId) allowedSchoolKeys.add(schoolId.toLowerCase());
        } else if (schoolId) {
          allowedSchoolKeys.add(schoolId.toLowerCase());
        } else {
          availableSchools.forEach((s) => allowedSchoolKeys.add(s.id.toLowerCase()));
        }

        const matchesScope = (recordSchoolId: any) => {
          const sKey = String(recordSchoolId || "").trim().toLowerCase();
          if (isSchoolUser) {
            return Boolean(sKey && allowedSchoolKeys.has(sKey));
          }
          if (schoolId) {
            return Boolean(sKey && allowedSchoolKeys.has(sKey));
          }
          if (isPlatformAdmin) return true;
          return Boolean(sKey && allowedSchoolKeys.has(sKey));
        };

        const [jdiSnap, schSnap] = await Promise.all([
          getDocs(collection(db, "jdiExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, "schoolExams")).catch(() => ({ docs: [] } as any)),
        ]);

        const examMap = new Map<string, Exam>();
        [...jdiSnap.docs, ...schSnap.docs].forEach((d: any) => {
          const data = d.data();
          if (data.status === "archived" && isSchoolUser) return;
          if (!isSchoolUser && !isPlatformAdmin) {
            const canSee =
              matchesScope(data.schoolId) ||
              canManageExamRecord({
                uid: currentUid,
                role: userRole || "TUTOR",
                exam: data,
                assignedSchoolIds: Array.from(allowedSchoolKeys),
              });
            if (!canSee) return;
          } else if (!matchesScope(data.schoolId)) {
            return;
          }
          if (isSchoolUser && data.status === "draft") return;

          const sLabel = resolveSchoolLabel(data.schoolId, data.schoolName);
          const maxScore = computeExamMaxScore(data);
          examMap.set(d.id, {
            id: d.id,
            ...data,
            schoolName: sLabel,
            maxScore,
            questionCount: Array.isArray(data.questions) ? data.questions.length : 0,
          });
        });

        loadedExams = Array.from(examMap.values());

        const attemptSnap = await getDocs(collection(db, "jdiExamAttempts")).catch(
          () => ({ docs: [] } as any)
        );
        const attList: Attempt[] = [];
        attemptSnap.docs?.forEach((d: any) => {
          const data = d.data();
          const parentExam = examMap.get(data.examId);
          if (!matchesScope(data.schoolId) && !parentExam) return;

          const maxScore = computeExamMaxScore(parentExam, data);
          const score = typeof data.score === "number" ? data.score : undefined;
          const percentage =
            score !== undefined ? calculateScorePercentage(score, maxScore) : undefined;
          const sLabel = resolveSchoolLabel(
            data.schoolId || parentExam?.schoolId,
            data.schoolName || parentExam?.schoolName
          );

          attList.push({
            id: d.id,
            ...data,
            className: normalizeClassName(data.className || "") || data.className || "—",
            schoolName: sLabel,
            maxScore,
            percentage,
          });
        });
        loadedAttempts = attList;
      } else {
        // Normalize schoolName & maxScore on server-returned records
        const examLookup = new Map<string, Exam>();
        loadedExams = loadedExams.map((ex) => {
          const sLabel = resolveSchoolLabel(ex.schoolId, ex.schoolName);
          const maxScore = computeExamMaxScore(ex);
          const enriched = { ...ex, schoolName: sLabel, maxScore };
          examLookup.set(ex.id, enriched);
          return enriched;
        });
        loadedAttempts = loadedAttempts.map((att) => {
          const ex = examLookup.get(att.examId);
          const maxScore = computeExamMaxScore(ex, att);
          const score = typeof att.score === "number" ? att.score : undefined;
          const percentage =
            score !== undefined ? calculateScorePercentage(score, maxScore) : undefined;
          const sLabel = resolveSchoolLabel(
            att.schoolId || ex?.schoolId,
            att.schoolName || ex?.schoolName
          );
          return {
            ...att,
            className: normalizeClassName(att.className || "") || att.className || "—",
            schoolName: sLabel,
            maxScore,
            percentage,
          };
        });
      }

      setExams(loadedExams);
      setAttempts(loadedAttempts);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load examination history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (scopeReady) {
      void load();
    }
  }, [scopeReady, schoolId]);

  const manage = async (attempt: Attempt, action: "release") => {
    if (isSchoolUser) return;
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
            }),
          });
          if (response.ok) serverSuccess = true;
        }
      } catch (netErr) {
        console.warn("Server action failed, using direct Firestore:", netErr);
      }

      if (!serverSuccess) {
        const attemptRef = doc(db, "jdiExamAttempts", attempt.id);
        await updateDoc(attemptRef, {
          releasedAt: serverTimestamp(),
          status: "graded",
          updatedAt: serverTimestamp(),
        });
      }

      await load();
      setMessage("Result released to student and school portals!");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not complete action.");
    } finally {
      setActionBusy(null);
    }
  };

  const filtered = useMemo(
    () =>
      attempts.filter(
        (a) =>
          (!selected || a.examId === selected) &&
          (!selectedClass || a.className === selectedClass)
      ),
    [attempts, selected, selectedClass]
  );

  // Categorise school exams for visibility (Upcoming, Active with Passcodes, Completed)
  const categorizedExams = useMemo(() => {
    const now = Date.now();
    const upcoming: Exam[] = [];
    const active: Exam[] = [];
    const completed: Exam[] = [];

    exams.forEach((ex) => {
      if (ex.status === "draft" || ex.status === "archived") return;
      const from = ex.availableFrom ? new Date(ex.availableFrom).getTime() : 0;
      const until = ex.availableUntil
        ? new Date(ex.availableUntil).getTime()
        : Number.MAX_SAFE_INTEGER;
      if (ex.status === "completed" || now >= until) {
        completed.push(ex);
      } else if (ex.status === "scheduled" || (from > 0 && now < from)) {
        upcoming.push(ex);
      } else {
        active.push(ex);
      }
    });

    return { upcoming, active, completed };
  }, [exams]);

  // Average Released Score calculated from accurate percentages (score / maxScore * 100)
  const releasedPercentages = useMemo(() => {
    return filtered
      .filter((a) => a.releasedAt && typeof a.score === "number")
      .map((a) => {
        const exam = exams.find((e) => e.id === a.examId);
        const maxScore = computeExamMaxScore(exam, a);
        return calculateScorePercentage(a.score, maxScore);
      });
  }, [filtered, exams]);

  const averageReleasedScore =
    releasedPercentages.length > 0
      ? releasedPercentages.reduce((sum, val) => sum + val, 0) / releasedPercentages.length
      : null;

  const submittedCount = filtered.filter((a) =>
    ["submitted", "expired", "graded"].includes(a.status)
  ).length;

  const copyPasscode = (examId: string, code?: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedExamId(examId);
    setTimeout(() => setCopiedExamId(null), 2000);
  };

  const csv = () => {
    const rows: (string | number | null | undefined)[][] = [
      [
        "Student",
        "Class",
        "Partner School",
        "Examination",
        "Status",
        "Score",
        "Maximum Score",
        "Percentage",
        "Submitted",
        "Released",
        "Teacher Feedback",
      ],
      ...filtered.map((a) => {
        const exam = exams.find((e) => e.id === a.examId);
        const maxScore = computeExamMaxScore(exam, a);
        const pct =
          typeof a.score === "number" ? calculateScorePercentage(a.score, maxScore) : null;
        return [
          a.studentName,
          a.className,
          resolveSchoolLabel(a.schoolId || exam?.schoolId, a.schoolName || exam?.schoolName),
          exam?.title || a.examId,
          a.status,
          a.score === undefined ? "Not graded" : a.score,
          maxScore,
          pct !== null ? `${pct}%` : "",
          a.submittedAt?.toDate ? a.submittedAt.toDate().toISOString() : String(a.submittedAt || ""),
          String(a.releasedAt || ""),
          a.feedback || "",
        ];
      }),
    ];
    const file = createXlsx(rows, "JDI Exam Results");
    const url = URL.createObjectURL(
      new Blob([file.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "JDI-examination-history.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderPdfBytes = async (a: Attempt) => {
    const exam = exams.find((e) => e.id === a.examId);
    const authoritativeSchoolName = resolveSchoolLabel(
      a.schoolId || exam?.schoolId,
      a.schoolName || exam?.schoolName
    );
    const maxScore = computeExamMaxScore(exam, a);

    return await generateExamReportPdf(
      {
        ...a,
        schoolName: authoritativeSchoolName,
        maxScore,
        questions: a.questionsSnapshot || a.questions || exam?.questions,
      },
      exam
        ? {
            id: exam.id,
            title: exam.title,
            subject: exam.subject,
            schoolId: exam.schoolId,
            schoolName: authoritativeSchoolName,
            maxScore,
            durationMinutes: exam.durationMinutes,
            questions: exam.questions,
          }
        : {
            title: "Examination Assessment",
            subject: "General",
            schoolName: authoritativeSchoolName,
            maxScore,
          }
    );
  };

  const downloadPdf = async (a: Attempt) => {
    const bytes = await renderPdfBytes(a);
    const url = URL.createObjectURL(
      new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `JDI-Report-${(a.studentName || "Student").replace(
      /[^a-z0-9]+/gi,
      "-"
    )}-${a.id.slice(-6)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const bulkZip = async () => {
    if (!filtered.length) {
      setMessage("No student reports are available in the current view to package.");
      return;
    }
    setZipBusy(true);
    setZipProgress(`Preparing 0 / ${filtered.length} PDF reports…`);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      const batchSize = 5;
      for (let i = 0; i < filtered.length; i += batchSize) {
        const chunk = filtered.slice(i, i + batchSize);
        const generatedChunk = await Promise.all(
          chunk.map(async (a) => ({
            name: `${(a.className || "Class").replace(/[^a-z0-9]+/gi, "-")}_${(
              a.studentName || "Student"
            ).replace(/[^a-z0-9]+/gi, "-")}_${a.id.slice(-6)}.pdf`,
            data: await renderPdfBytes(a),
          }))
        );
        files.push(...generatedChunk);
        setZipProgress(
          `Generating ${Math.min(filtered.length, i + batchSize)} / ${filtered.length} PDF reports…`
        );
      }

      const zip = createZip(files);
      const selectedExamObj = exams.find((e) => e.id === selected);
      const schoolSlug = resolveSchoolLabel(schoolId, availableSchools[0]?.name)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
      const examSlug = (selectedExamObj?.title || "all-examinations")
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();

      const url = URL.createObjectURL(
        new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${schoolSlug}-${examSlug}-reports.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Successfully packaged ${files.length} PDF report(s) into a ZIP archive.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not generate bulk PDF ZIP.");
    } finally {
      setZipBusy(false);
      setZipProgress("");
    }
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
        <p className="text-sm font-semibold tracking-wide text-blue-200">
          JAYSTARBLISS DYNAMIC INSTITUTE · JDI
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {isSchoolUser
            ? "School Examinations, Access Codes & Student Reports"
            : "Examination History & Performance Reports"}
        </h1>
        <p className="mt-2 text-slate-200">
          {isSchoolUser
            ? "Monitor upcoming and active CBT examinations assigned to your school, copy student access passcodes for active tests, and download official individual or bulk student PDF reports."
            : "Review student CBT submissions, release verified results, and download individual or bulk institutional performance reports."}
        </p>
      </header>

      {/* METRIC OVERVIEW */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Examinations
          </p>
          <p className="mt-2 text-3xl font-black text-slate-900">{exams.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Attempts in View
          </p>
          <p className="mt-2 text-3xl font-black text-blue-600">{filtered.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Submitted / Completed
          </p>
          <p className="mt-2 text-3xl font-black text-emerald-600">{submittedCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Average Released Score
          </p>
          <p className="mt-2 text-3xl font-black text-indigo-600">
            {averageReleasedScore === null ? "—" : `${averageReleasedScore.toFixed(1)}%`}
          </p>
          <p className="text-xs text-slate-400 mt-1">Based on released attempts</p>
        </article>
      </section>

      {/* ACTIVE & UPCOMING EXAMINATIONS + ACCESS PASSCODES FOR SCHOOL & TUTORS */}
      {(categorizedExams.active.length > 0 || categorizedExams.upcoming.length > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Active & Upcoming School Examinations
              </h2>
              <p className="text-xs text-slate-500">
                Distribute the examination access passcode below to students in the target class so
                they can unlock and begin their test.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[...categorizedExams.active, ...categorizedExams.upcoming].map((ex) => {
              const isUpcoming = categorizedExams.upcoming.some((u) => u.id === ex.id);
              return (
                <div
                  key={ex.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                          isUpcoming
                            ? "bg-blue-100 text-blue-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isUpcoming ? "Upcoming / Scheduled" : "Active Now"}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Class: {ex.targetClass || ex.classIds?.join(", ") || "All"}
                      </span>
                    </div>
                    <h3 className="mt-2 font-bold text-slate-900">{ex.title}</h3>
                    <p className="text-xs text-slate-600">
                      {ex.subject} · {ex.durationMinutes || 30} mins · {ex.maxScore ?? computeExamMaxScore(ex)} Marks
                    </p>
                    {ex.availableFrom && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Calendar size={12} /> Starts: {new Date(ex.availableFrom).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {ex.passcode && (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <KeyRound size={15} className="text-emerald-700" />
                        <span className="text-xs font-semibold text-slate-600">Passcode:</span>
                        <code className="font-mono text-sm font-black tracking-wider text-slate-900">
                          {ex.passcode}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyPasscode(ex.id, ex.passcode)}
                        className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
                      >
                        {copiedExamId === ex.id ? <Check size={12} /> : <Copy size={12} />}
                        {copiedExamId === ex.id ? "Copied" : "Copy Code"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FILTER & EXPORT CONTROLS */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {isSchoolUser ? (
            <div className="text-sm font-semibold text-slate-700">
              Partner School Scope
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-900">
                <School size={16} className="text-blue-600 shrink-0" />
                <span className="truncate">
                  {availableSchools[0]?.name || resolveSchoolLabel(schoolId)}
                </span>
              </div>
            </div>
          ) : (
            <label className="text-sm font-semibold text-slate-700">
              Select Partner School
              <select
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-800 outline-none focus:border-blue-500"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
              >
                {isPlatformAdmin && <option value="">All Partner Schools</option>}
                {availableSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-sm font-semibold text-slate-700">
            Select Examination
            <select
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-800 outline-none focus:border-blue-500"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">All Examinations</option>
              {exams.map((e) => (
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
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="">All Classes</option>
              {Array.from(new Set(attempts.map((a) => a.className).filter(Boolean)))
                .sort()
                .map((name) => (
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
            onClick={() => void load()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh Records"}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!filtered.length}
              onClick={csv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              Download Excel (.xlsx)
            </button>
            <button
              disabled={!filtered.length || zipBusy}
              onClick={() => void bulkZip()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <FileArchive size={16} className="text-blue-400" />
              {zipBusy
                ? zipProgress || "Packaging ZIP…"
                : `Download All PDF Reports (ZIP) (${filtered.length})`}
            </button>
          </div>
        </div>
      </section>

      {message && (
        <p
          role="alert"
          className="rounded-xl bg-blue-50 p-4 text-sm font-medium text-blue-900 border border-blue-200"
        >
          {message}
        </p>
      )}

      {/* STUDENT ATTEMPTS TABLE */}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-5">
          <h2 className="text-lg font-bold text-slate-900">
            Student Examination Attempts & Official Reports
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{filtered.length} submissions found</p>
        </div>
        {!filtered.length ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpenCheck size={40} className="mx-auto mb-3 text-slate-400" />
            <p className="font-semibold text-slate-700">No examination attempts to show</p>
            <p className="text-xs text-slate-500 mt-1">
              When students in this school take an assigned test, their submissions and printable
              PDF reports will appear here.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-600 border-b">
              <tr>
                <th className="p-4">Student</th>
                <th className="p-4">Class</th>
                <th className="p-4">Partner School</th>
                <th className="p-4">Examination</th>
                <th className="p-4">Status</th>
                <th className="p-4">Score & Percentage</th>
                <th className="p-4 text-right">Official Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((a) => {
                const exam = exams.find((e) => e.id === a.examId);
                const maxScore = computeExamMaxScore(exam, a);
                const pct =
                  typeof a.score === "number" ? calculateScorePercentage(a.score, maxScore) : null;
                const schoolDisplay = resolveSchoolLabel(
                  a.schoolId || exam?.schoolId,
                  a.schoolName || exam?.schoolName
                );

                return (
                  <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-semibold text-slate-900">{a.studentName}</td>
                    <td className="p-4 text-slate-600">{a.className || "—"}</td>
                    <td className="p-4 text-slate-700 font-medium">{schoolDisplay}</td>
                    <td className="p-4 text-slate-700">{exam?.title || a.examId}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          a.status === "graded" || a.releasedAt
                            ? "bg-emerald-100 text-emerald-800"
                            : a.status === "submitted"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {a.releasedAt ? "released" : a.status}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-900">
                      {typeof a.score === "number" ? (
                        <span>
                          {a.score} / {maxScore}{" "}
                          <span className="text-xs font-semibold text-blue-700">({pct}%)</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">Pending Grading</span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => void pdf(a)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Download size={14} className="text-blue-600" />
                        Print Official PDF
                      </button>
                      {!isSchoolUser && ["submitted", "expired", "graded"].includes(a.status) && (
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
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
