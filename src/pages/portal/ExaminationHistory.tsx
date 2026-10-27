import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
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
  normalizeDeliveryMode,
  normalizeWorkType,
  type WorkType,
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
  Search,
  RefreshCw,
  ExternalLink,
  Layers,
  History,
  FileText,
  AlertCircle,
} from "lucide-react";
import { TableSkeleton, MetricGridSkeleton } from "../../components/ui/Skeleton";

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
  workType?: WorkType;
  deliveryMode?: "NATIVE" | "EXTERNAL_LINK";
  externalUrl?: string;
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
  resultReleased?: boolean;
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

interface ExaminationHistoryProps {
  mode?: "overview" | "history";
}

export default function ExaminationHistory({ mode }: ExaminationHistoryProps = {}) {
  const location = useLocation();
  const isSchoolPortal = location.pathname.startsWith("/portal/school");
  const isAdminWorkspace = location.pathname.startsWith("/admin/");

  const effectiveMode: "overview" | "history" = useMemo(() => {
    if (mode) return mode;
    const clean = location.pathname.replace(/\/+$/, "");
    if (clean.endsWith("/exams")) return "overview";
    return "history";
  }, [mode, location.pathname]);

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
  const [attemptStateFilter, setAttemptStateFilter] = useState<
    "all" | "released" | "submitted" | "in_progress" | "expired"
  >("all");
  const [overviewStatusFilter, setOverviewStatusFilter] = useState<"all" | "active" | "upcoming">(
    "all"
  );
  const [workTypeTab, setWorkTypeTab] = useState<"ALL" | WorkType>("ALL");
  const [overviewSearch, setOverviewSearch] = useState("");
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
            deliveryMode: normalizeDeliveryMode(data),
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
        const examLookup = new Map<string, Exam>();
        loadedExams = loadedExams.map((ex) => {
          const sLabel = resolveSchoolLabel(ex.schoolId, ex.schoolName);
          const maxScore = computeExamMaxScore(ex);
          const enriched = {
            ...ex,
            deliveryMode: normalizeDeliveryMode(ex),
            schoolName: sLabel,
            maxScore,
          };
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
      setMessage(e instanceof Error ? e.message : "Unable to load examination records.");
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
          resultReleased: true,
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

  // Categorise exams into upcoming, active, and completed/past
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
      if (ex.status === "completed" || ex.status === "closed" || now >= until) {
        completed.push(ex);
      } else if (ex.status === "scheduled" || (from > 0 && now < from)) {
        upcoming.push(ex);
      } else {
        active.push(ex);
      }
    });

    return { upcoming, active, completed };
  }, [exams]);

  // Attempt counts per exam for Overview cards & History archive
  const attemptCountsByExam = useMemo(() => {
    const map: Record<string, { total: number; submitted: number; inProgress: number }> = {};
    attempts.forEach((a) => {
      if (!map[a.examId]) {
        map[a.examId] = { total: 0, submitted: 0, inProgress: 0 };
      }
      map[a.examId].total += 1;
      if (a.status === "in_progress") {
        map[a.examId].inProgress += 1;
      } else {
        map[a.examId].submitted += 1;
      }
    });
    return map;
  }, [attempts]);

  // Filtered attempts for Examination History
  const filtered = useMemo(() => {
    return attempts.filter((a) => {
      const exam = exams.find((e) => e.id === a.examId);
      if (workTypeTab !== "ALL" && normalizeWorkType(exam?.workType, exam) !== workTypeTab) {
        return false;
      }
      if (selected && a.examId !== selected) return false;
      if (selectedClass && a.className !== selectedClass) return false;
      const isReleased = Boolean(a.releasedAt || a.resultReleased);
      if (attemptStateFilter === "released" && !isReleased) return false;
      if (
        attemptStateFilter === "submitted" &&
        !["submitted", "graded", "completed"].includes(a.status)
      ) {
        return false;
      }
      if (attemptStateFilter === "in_progress" && a.status !== "in_progress") return false;
      if (attemptStateFilter === "expired" && a.status !== "expired") return false;
      return true;
    });
  }, [attempts, exams, workTypeTab, selected, selectedClass, attemptStateFilter]);

  // Filtered current & upcoming exams for Examination Overview
  const currentAndUpcomingExams = useMemo(() => {
    const combined = [
      ...categorizedExams.active.map((e) => ({ ...e, computedLifecycle: "active" as const })),
      ...categorizedExams.upcoming.map((e) => ({ ...e, computedLifecycle: "upcoming" as const })),
    ];
    return combined.filter((ex) => {
      if (workTypeTab !== "ALL" && normalizeWorkType(ex.workType, ex) !== workTypeTab) {
        return false;
      }
      if (overviewStatusFilter !== "all" && ex.computedLifecycle !== overviewStatusFilter) {
        return false;
      }
      const targetCls = normalizeClassName(ex.targetClass || ex.className || "");
      if (selectedClass && targetCls !== selectedClass && !ex.classIds?.includes(selectedClass)) {
        return false;
      }
      if (overviewSearch.trim()) {
        const q = overviewSearch.trim().toLowerCase();
        const matchTitle = (ex.title || "").toLowerCase().includes(q);
        const matchSub = (ex.subject || "").toLowerCase().includes(q);
        const matchCls = (ex.targetClass || ex.className || "").toLowerCase().includes(q);
        if (!matchTitle && !matchSub && !matchCls) return false;
      }
      return true;
    });
  }, [categorizedExams, workTypeTab, overviewStatusFilter, selectedClass, overviewSearch]);

  const overviewClasses = useMemo(() => {
    const set = new Set<string>();
    [...categorizedExams.active, ...categorizedExams.upcoming].forEach((ex) => {
      const cls = normalizeClassName(ex.targetClass || ex.className || "");
      if (cls) set.add(cls);
      ex.classIds?.forEach((c) => {
        const norm = normalizeClassName(c);
        if (norm) set.add(norm);
      });
    });
    return Array.from(set).sort();
  }, [categorizedExams]);

  // Average Released Score calculated from accurate percentages (score / maxScore * 100)
  const releasedPercentages = useMemo(() => {
    return filtered
      .filter((a) => (a.releasedAt || a.resultReleased) && typeof a.score === "number")
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
    ["submitted", "graded", "completed"].includes(a.status)
  ).length;
  const inProgressCount = filtered.filter((a) => a.status === "in_progress").length;
  const expiredCount = filtered.filter((a) => a.status === "expired").length;

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
          a.releasedAt || a.resultReleased ? "released" : a.status,
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

  // ============================================================================
  // VIEW A: EXAMINATION OVERVIEW (/portal/school/exams)
  // Focuses exclusively on current & upcoming examinations, classes, subjects,
  // schedules, statuses, access codes, and summary counts for the school.
  // ============================================================================
  if (effectiveMode === "overview") {
    return (
      <main className="mx-auto max-w-6xl space-y-6">
        {/* WORK TYPE CATEGORY TABS */}
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 touch-pan-x">
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
            return (
              <button
                key={wt.id}
                type="button"
                onClick={() => setWorkTypeTab(wt.id)}
                className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? "text-[#14284B] dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {wt.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* SUMMARY COUNTS */}
        {loading ? (
          <MetricGridSkeleton count={4} />
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Current &amp; Upcoming
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
                {categorizedExams.active.length + categorizedExams.upcoming.length}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Now
              </p>
              <p className="mt-2 text-3xl font-black text-emerald-600">
                {categorizedExams.active.length}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Scheduled / Upcoming
              </p>
              <p className="mt-2 text-3xl font-black text-blue-600">
                {categorizedExams.upcoming.length}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Classes Assigned
              </p>
              <p className="mt-2 text-3xl font-black text-indigo-600">{overviewClasses.length}</p>
            </article>
          </section>
        )}

        {/* FILTER & ACTION CONTROLS */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Partner School
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3 text-sm font-bold text-slate-900 dark:text-white normal-case tracking-normal">
                <School size={16} className="text-blue-600 shrink-0" />
                <span className="truncate">
                  {availableSchools[0]?.name || resolveSchoolLabel(schoolId)}
                </span>
              </div>
            </div>

            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Filter by Class
              <select
                className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">All Classes</option>
                {overviewClasses.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Search Examinations
              <div className="relative mt-1.5">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={overviewSearch}
                  onChange={(e) => setOverviewSearch(e.target.value)}
                  placeholder="Title, subject or class…"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-3 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
                />
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", "All Current & Upcoming"],
                  ["active", "Active Now"],
                  ["upcoming", "Upcoming / Scheduled"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOverviewStatusFilter(id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
                    overviewStatusFilter === id
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? "Refreshing…" : "Refresh"}
              </button>
              <Link
                to={
                  isSchoolPortal
                    ? "/portal/school/exam-history"
                    : isAdminWorkspace
                    ? "/admin/examination-history"
                    : "/portal/staff/exam-history"
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <History size={14} className="text-blue-600" />
                Examination History &amp; Reports
              </Link>
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

        {/* CURRENT & UPCOMING EXAMINATIONS CARDS */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Assigned School Examinations &amp; Access Codes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Share the examination access passcode with eligible students in the target class when their assessment window is active.
              </p>
            </div>
          </div>

          {currentAndUpcomingExams.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText size={38} className="mx-auto mb-3 text-slate-400" />
              <p className="font-bold text-slate-700 dark:text-slate-200">
                No current or upcoming examinations found
              </p>
              <p className="text-xs text-slate-500 mt-1">
                When an examination is scheduled or activated for your school, its schedule and student access code will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {currentAndUpcomingExams.map((ex) => {
                const isUpcoming = ex.computedLifecycle === "upcoming";
                const isExternal = ex.deliveryMode === "EXTERNAL_LINK";
                const stats = attemptCountsByExam[ex.id] || {
                  total: 0,
                  submitted: 0,
                  inProgress: 0,
                };
                return (
                  <article
                    key={ex.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                              isUpcoming
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            }`}
                          >
                            {isUpcoming ? "Upcoming / Scheduled" : "Active Now"}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              isExternal
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                                : "bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {isExternal ? <ExternalLink size={11} /> : <Layers size={11} />}
                            {isExternal ? "External Link" : "Native CBT"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Class: {ex.targetClass || ex.classIds?.join(", ") || "All"}
                        </span>
                      </div>

                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {ex.title}
                      </h3>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        <strong>{ex.subject}</strong>
                        {!isExternal && (
                          <>
                            {" "}
                            · {ex.durationMinutes || 30} mins ·{" "}
                            {ex.maxScore ?? computeExamMaxScore(ex)} Marks
                          </>
                        )}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 pt-1">
                        {ex.availableFrom && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={12} /> Opens:{" "}
                            {new Date(ex.availableFrom).toLocaleString()}
                          </span>
                        )}
                        {ex.availableUntil && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} /> Closes:{" "}
                            {new Date(ex.availableUntil).toLocaleString()}
                          </span>
                        )}
                        {!isExternal && (
                          <span>
                            Attempts: <strong>{stats.total}</strong> ({stats.submitted} submitted
                            {stats.inProgress > 0 ? `, ${stats.inProgress} in progress` : ""})
                          </span>
                        )}
                      </div>
                    </div>

                    {ex.passcode && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 px-3.5 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <KeyRound size={15} className="text-emerald-700 shrink-0" />
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Access Code:
                          </span>
                          <code className="font-mono text-sm font-black tracking-wider text-slate-900 dark:text-white truncate">
                            {ex.passcode}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyPasscode(ex.id, ex.passcode)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 shrink-0 cursor-pointer"
                        >
                          {copiedExamId === ex.id ? <Check size={13} /> : <Copy size={13} />}
                          {copiedExamId === ex.id ? "Copied" : "Copy Code"}
                        </button>
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

  // ============================================================================
  // VIEW B: EXAMINATION HISTORY (/portal/school/exam-history, /portal/staff/exam-history, /admin/examination-history)
  // Focuses on completed, closed or past examinations and actual student attempts,
  // scores, grading, result-release states, individual reports and bulk exports.
  // ============================================================================
  return (
    <main className="mx-auto max-w-6xl space-y-6">
      {/* WORK TYPE CATEGORY TABS */}
      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 touch-pan-x">
        {(
          [
            { id: "ALL", label: "All History" },
            { id: "ASSIGNMENT", label: "Assignments" },
            { id: "ACTIVITY", label: "Activities" },
            { id: "TEST", label: "Tests" },
            { id: "EXAMINATION", label: "Examinations" },
          ] as const
        ).map((wt) => {
          const active = workTypeTab === wt.id;
          return (
            <button
              key={wt.id}
              type="button"
              onClick={() => setWorkTypeTab(wt.id)}
              className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? "text-[#14284B] dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {wt.label}
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* METRIC OVERVIEW */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Past / Closed Exams
          </p>
          <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
            {categorizedExams.completed.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">{exams.length} total in scope</p>
        </article>
        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Attempts in View
          </p>
          <p className="mt-2 text-3xl font-black text-blue-600">{filtered.length}</p>
          {(inProgressCount > 0 || expiredCount > 0) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
              {inProgressCount > 0 ? `${inProgressCount} in progress` : ""}
              {inProgressCount > 0 && expiredCount > 0 ? " · " : ""}
              {expiredCount > 0 ? `${expiredCount} expired` : ""}
            </p>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Submitted &amp; Graded
          </p>
          <p className="mt-2 text-3xl font-black text-emerald-600">{submittedCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Average Released Score
          </p>
          <p className="mt-2 text-3xl font-black text-indigo-600">
            {averageReleasedScore === null ? "—" : `${averageReleasedScore.toFixed(1)}%`}
          </p>
          <p className="text-xs text-slate-400 mt-1">Based on released attempts</p>
        </article>
      </section>

      {/* FILTER & EXPORT CONTROLS */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isSchoolUser ? (
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Partner School Scope
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3 text-sm font-bold text-slate-900 dark:text-white normal-case tracking-normal">
                <School size={16} className="text-blue-600 shrink-0" />
                <span className="truncate">
                  {availableSchools[0]?.name || resolveSchoolLabel(schoolId)}
                </span>
              </div>
            </div>
          ) : (
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Partner School
              <select
                className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
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

          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Examination
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
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

          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Class
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
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

          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Attempt State
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
              value={attemptStateFilter}
              onChange={(e) => setAttemptStateFilter(e.target.value as any)}
            >
              <option value="all">All Attempt States</option>
              <option value="released">Released Results</option>
              <option value="submitted">Submitted / Graded</option>
              <option value="in_progress">In Progress</option>
              <option value="expired">Expired</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={loading}
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing…" : "Refresh Records"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!filtered.length}
              onClick={csv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              Download Excel (.xlsx)
            </button>
            <button
              disabled={!filtered.length || zipBusy}
              onClick={() => void bulkZip()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <FileArchive size={15} className="text-blue-300" />
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
      <section className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="border-b border-slate-100 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Student Examination Attempts &amp; Official Reports
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} attempt record(s) matching current filters
            </p>
          </div>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected("")}
              className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              Clear examination filter
            </button>
          )}
        </div>
        {loading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : !filtered.length ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpenCheck size={40} className="mx-auto mb-3 text-slate-400" />
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              No examination attempts to show
            </p>
            <p className="text-xs text-slate-500 mt-1">
              When students take an examination, their submissions, grading statuses and printable PDF reports appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Responsive Attempt Cards */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {filtered.map((a) => {
                const exam = exams.find((e) => e.id === a.examId);
                const maxScore = computeExamMaxScore(exam, a);
                const pct =
                  typeof a.score === "number" ? calculateScorePercentage(a.score, maxScore) : null;
                const schoolDisplay = resolveSchoolLabel(
                  a.schoolId || exam?.schoolId,
                  a.schoolName || exam?.schoolName
                );
                const isReleased = Boolean(a.releasedAt || a.resultReleased);
                const stateLabel = isReleased
                  ? "Released"
                  : a.status === "in_progress"
                  ? "In Progress"
                  : a.status === "expired"
                  ? "Expired"
                  : a.status === "graded"
                  ? "Graded"
                  : "Submitted";

                return (
                  <article key={a.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white break-words">
                          {a.studentName}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.className || "—"} · {schoolDisplay}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          isReleased || a.status === "graded"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : a.status === "submitted"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                            : a.status === "expired"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        }`}
                      >
                        {a.status === "expired" && !isReleased && <AlertCircle size={12} />}
                        {stateLabel}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                        {exam?.title || a.examId}
                      </span>
                      <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                        {typeof a.score === "number" ? (
                          <span>
                            {a.score} / {maxScore}{" "}
                            <span className="text-blue-700 dark:text-blue-400">({pct}%)</span>
                          </span>
                        ) : a.status === "in_progress" ? (
                          <span className="text-amber-600 dark:text-amber-400 font-sans">
                            In progress
                          </span>
                        ) : a.status === "expired" ? (
                          <span className="text-rose-600 dark:text-rose-400 font-sans">
                            Expired
                          </span>
                        ) : (
                          <span className="text-slate-400 font-sans font-normal">Pending</span>
                        )}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void pdf(a)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                      >
                        <Download size={14} className="text-blue-600" />
                        Print Official PDF
                      </button>
                      {!isSchoolUser &&
                        ["submitted", "expired", "graded"].includes(a.status) &&
                        !isReleased && (
                          <button
                            type="button"
                            disabled={actionBusy === a.id + "release"}
                            onClick={() => void manage(a, "release")}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 size={14} />
                            Release Result
                          </button>
                        )}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Desktop Semantic Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs uppercase font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="p-4">Student</th>
                    <th className="p-4">Class</th>
                    <th className="p-4">Partner School</th>
                    <th className="p-4">Examination</th>
                    <th className="p-4">State</th>
                    <th className="p-4">Score &amp; Percentage</th>
                    <th className="p-4 text-right">Official Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((a) => {
                    const exam = exams.find((e) => e.id === a.examId);
                    const maxScore = computeExamMaxScore(exam, a);
                    const pct =
                      typeof a.score === "number"
                        ? calculateScorePercentage(a.score, maxScore)
                        : null;
                    const schoolDisplay = resolveSchoolLabel(
                      a.schoolId || exam?.schoolId,
                      a.schoolName || exam?.schoolName
                    );
                    const isReleased = Boolean(a.releasedAt || a.resultReleased);
                    const stateLabel = isReleased
                      ? "Released"
                      : a.status === "in_progress"
                      ? "In Progress"
                      : a.status === "expired"
                      ? "Expired"
                      : a.status === "graded"
                      ? "Graded"
                      : "Submitted";

                    return (
                      <tr
                        key={a.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-4 font-semibold text-slate-900 dark:text-white">
                          {a.studentName}
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300">
                          {a.className || "—"}
                        </td>
                        <td className="p-4 text-slate-700 dark:text-slate-300 font-medium">
                          {schoolDisplay}
                        </td>
                        <td className="p-4 text-slate-700 dark:text-slate-200">
                          {exam?.title || a.examId}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              isReleased || a.status === "graded"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : a.status === "submitted"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                : a.status === "expired"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            }`}
                          >
                            {a.status === "expired" && !isReleased && <AlertCircle size={12} />}
                            {stateLabel}
                          </span>
                        </td>
                        <td className="p-4 font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {typeof a.score === "number" ? (
                            <span>
                              {a.score} / {maxScore}{" "}
                              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                                ({pct}%)
                              </span>
                            </span>
                          ) : a.status === "in_progress" ? (
                            <span className="text-amber-600 dark:text-amber-400 text-xs font-sans font-semibold">
                              Attempt in progress
                            </span>
                          ) : a.status === "expired" ? (
                            <span className="text-rose-600 dark:text-rose-400 text-xs font-sans font-semibold">
                              Time expired (ungraded)
                            </span>
                          ) : (
                            <span className="text-slate-400 font-sans font-normal">
                              Pending Grading
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void pdf(a)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            <Download size={14} className="text-blue-600" />
                            Print Official PDF
                          </button>
                          {!isSchoolUser &&
                            ["submitted", "expired", "graded"].includes(a.status) && (
                              <>
                                {!isReleased && (
                                  <button
                                    type="button"
                                    disabled={actionBusy === a.id + "release"}
                                    onClick={() => void manage(a, "release")}
                                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
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
            </div>
          </>
        )}
      </section>

      {/* COMPLETED / PAST EXAMINATIONS ARCHIVE */}
      {categorizedExams.completed.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Completed &amp; Past Examinations Archive
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any past examination below to filter the student attempts table above.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categorizedExams.completed.map((ex) => {
              const stats = attemptCountsByExam[ex.id] || {
                total: 0,
                submitted: 0,
                inProgress: 0,
              };
              const isSelected = selected === ex.id;
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => setSelected(isSelected ? "" : ex.id)}
                  className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:text-slate-200">
                      Completed
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {ex.targetClass || "All Classes"}
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold text-sm text-slate-900 dark:text-white truncate">
                    {ex.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {ex.subject} · {stats.total} attempt(s)
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

export function SchoolExaminationOverview() {
  return <ExaminationHistory mode="overview" />;
}

