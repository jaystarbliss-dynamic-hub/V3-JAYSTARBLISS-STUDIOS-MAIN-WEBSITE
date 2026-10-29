import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { auth, db, getAllClientDatabases } from "../../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
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
  getWorkTypeLabels,
  isAttemptResultReleased,
  type WorkType,
} from "../../lib/classes";
import {
  type DocumentHeaderConfig,
  loadSavedDocumentHeaderConfig,
  TUTOR_REMARK_PRESETS,
  getSuggestedTutorRemark,
} from "../../lib/documentHeaderTemplates";
import DocumentHeaderCustomizerModal from "../../components/portal/DocumentHeaderCustomizerModal";
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
  Lock,
  LayoutTemplate,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";
import { TableSkeleton, MetricGridSkeleton } from "../../components/ui/Skeleton";

function attemptStatusRank(status?: string): number {
  const s = String(status || "").toLowerCase();
  if (s === "graded") return 4;
  if (s === "submitted" || s === "completed") return 3;
  if (s === "expired") return 2;
  if (s === "in_progress") return 1;
  return 0;
}

function isTutorAssignedToSchoolData(
  s: Record<string, any>,
  uid: string,
  emailLower: string
): boolean {
  const matchesEntry = (entry: any): boolean => {
    if (!entry) return false;
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      return trimmed === uid || (Boolean(emailLower) && trimmed.toLowerCase() === emailLower);
    }
    if (typeof entry === "object") {
      const ids = [entry.id, entry.uid, entry.tutorId, entry.staffId, entry.userId]
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      if (ids.includes(uid)) return true;
      if (emailLower) {
        const emails = [entry.email, entry.tutorEmail, entry.staffEmail]
          .map((x) => String(x || "").trim().toLowerCase())
          .filter(Boolean);
        if (emails.includes(emailLower)) return true;
      }
    }
    return false;
  };

  if (
    [s.tutorId, s.staffId, s.assignedTutorId, s.assignedStaffId]
      .map((x) => String(x || "").trim())
      .includes(uid)
  ) {
    return true;
  }

  const topArrays = [
    s.tutors,
    s.assignedTutors,
    s.assignedTutorIds,
    s.assignedStaff,
    s.staffIds,
    s.tutorIds,
  ];
  for (const arr of topArrays) {
    if (Array.isArray(arr) && arr.some(matchesEntry)) return true;
  }

  if (Array.isArray(s.programs)) {
    for (const p of s.programs) {
      if (!p || typeof p !== "object") continue;
      if (matchesEntry(p.tutorId) || matchesEntry(p.staffId)) return true;
      if (Array.isArray(p.assignedTutors) && p.assignedTutors.some(matchesEntry)) return true;
      if (Array.isArray(p.tutors) && p.tutors.some(matchesEntry)) return true;
      if (Array.isArray(p.assignedStaff) && p.assignedStaff.some(matchesEntry)) return true;
    }
  }

  return false;
}

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
  tutorFeedback?: string;
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
  const [schoolId, setSchoolId] = useState<string>(() =>
    isSchoolPortal
      ? sessionStorage.getItem("schoolId") || sessionStorage.getItem("schoolDocId") || ""
      : ""
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
  const [bulkReleaseBusy, setBulkReleaseBusy] = useState(false);
  const [showHeaderDesigner, setShowHeaderDesigner] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<DocumentHeaderConfig | null>(null);
  const [releaseModalAttempt, setReleaseModalAttempt] = useState<Attempt | null>(null);
  const [releaseRemarkInput, setReleaseRemarkInput] = useState<string>("");

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

        const emailLower = String(
          currentUser.email || userData.email || sessionStorage.getItem("userEmail") || ""
        )
          .trim()
          .toLowerCase();

        const schoolDocMap = new Map<string, any>();
        for (const dbInstance of getAllClientDatabases()) {
          const snap = await getDocs(collection(dbInstance, "schools")).catch(
            () => ({ docs: [] } as any)
          );
          snap.docs?.forEach((d: any) => {
            if (!schoolDocMap.has(d.id)) {
              schoolDocMap.set(d.id, d.data());
            }
          });
        }

        const list: { id: string; name: string }[] = [];
        const nameMap: Record<string, string> = {};

        schoolDocMap.forEach((s: any, sId: string) => {
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
          } else if (
            directSchoolIds.has(sId) ||
            (sCode && directSchoolIds.has(sCode)) ||
            isTutorAssignedToSchoolData(s, currentUser.uid, emailLower)
          ) {
            list.push({ id: sId, name: sName });
          }
        });

        if (isMounted) {
          setSchoolNameMap(nameMap);
          setAvailableSchools(list);
          // For Platform Admins & Tutors, default to "" (All Partner/Assigned Schools)
          // so all completed assessments across their authorised schools are immediately visible
          if (schoolId && !list.some((item) => item.id === schoolId)) {
            setSchoolId("");
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

  // 2. Load Examinations & Attempts within Authorised Scope (Merging across both DBs + Server)
  const load = async () => {
    if (!scopeReady) return;
    setLoading(true);
    setMessage("");
    try {
      const serverExams: Exam[] = [];
      const serverAttempts: Attempt[] = [];

      // 1. Try server function
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          const url =
            "/.netlify/functions/jdi-exam-management?schoolId=" +
            encodeURIComponent(schoolId || "");
          const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
          if (r.ok) {
            const d = await r.json().catch(() => ({}));
            if (!d.fallback && Array.isArray(d.exams)) {
              serverExams.push(...d.exams);
              if (Array.isArray(d.attempts)) serverAttempts.push(...d.attempts);
            }
          }
        }
      } catch (err) {
        console.warn("Server exam history notice, merging with Firestore:", err);
      }

      // 2. Direct Firestore merge across all client databases (Default + AI Shared Quota)
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

      const examMap = new Map<string, Exam>();
      // Seed from server exams first
      serverExams.forEach((ex) => {
        const sLabel = resolveSchoolLabel(ex.schoolId, ex.schoolName);
        const maxScore = computeExamMaxScore(ex);
        examMap.set(ex.id, {
          ...ex,
          deliveryMode: normalizeDeliveryMode(ex),
          schoolName: sLabel,
          maxScore,
        });
      });

      const dbInstances = getAllClientDatabases();
      const examSnaps = await Promise.all(
        dbInstances.flatMap((dbInst) => [
          getDocs(collection(dbInst, "jdiExams")).catch(() => ({ docs: [] } as any)),
          getDocs(collection(dbInst, "schoolExams")).catch(() => ({ docs: [] } as any)),
        ])
      );

      examSnaps.flatMap((s) => s.docs || []).forEach((d: any) => {
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
        const existing = examMap.get(d.id);
        examMap.set(d.id, {
          ...(existing || {}),
          id: d.id,
          ...data,
          deliveryMode: normalizeDeliveryMode(data),
          schoolName: sLabel,
          maxScore,
          questionCount: Array.isArray(data.questions)
            ? data.questions.length
            : existing?.questionCount || 0,
        });
      });

      const loadedExams = Array.from(examMap.values());

      // Merge attempts from server + all client databases
      const rawAttemptMap = new Map<string, any>();
      serverAttempts.forEach((att) => {
        if (att && att.id) rawAttemptMap.set(att.id, att);
      });

      const attemptSnaps = await Promise.all(
        dbInstances.map((dbInst) =>
          getDocs(collection(dbInst, "jdiExamAttempts")).catch(() => ({ docs: [] } as any))
        )
      );

      attemptSnaps.flatMap((s) => s.docs || []).forEach((d: any) => {
        const incoming = { id: d.id, ...d.data() };
        const existing = rawAttemptMap.get(d.id);
        if (!existing) {
          rawAttemptMap.set(d.id, incoming);
          return;
        }
        const exRel = isAttemptResultReleased(existing);
        const inRel = isAttemptResultReleased(incoming);
        if (inRel && !exRel) {
          rawAttemptMap.set(d.id, { ...existing, ...incoming });
        } else if (exRel && !inRel) {
          rawAttemptMap.set(d.id, { ...incoming, ...existing });
        } else if (attemptStatusRank(incoming.status) >= attemptStatusRank(existing.status)) {
          rawAttemptMap.set(d.id, { ...existing, ...incoming });
        }
      });

      const attList: Attempt[] = [];
      rawAttemptMap.forEach((data: any) => {
        const parentExam = examMap.get(data.examId);
        if (!matchesScope(data.schoolId) && !matchesScope(parentExam?.schoolId) && !parentExam) {
          return;
        }

        const isReleased = isAttemptResultReleased(data);
        const canSeeScore = isReleased || !isSchoolUser;
        const maxScore = computeExamMaxScore(parentExam, data);
        const score = canSeeScore && typeof data.score === "number" ? data.score : undefined;
        const percentage =
          score !== undefined ? calculateScorePercentage(score, maxScore) : undefined;
        const sLabel = resolveSchoolLabel(
          data.schoolId || parentExam?.schoolId,
          data.schoolName || parentExam?.schoolName
        );

        attList.push({
          ...data,
          id: data.id,
          score,
          percentage,
          resultReleased: isReleased,
          releasedAt: isReleased
            ? data.releasedAt || data.updatedAt || data.submittedAt || new Date().toISOString()
            : undefined,
          feedback: canSeeScore ? data.feedback || data.tutorFeedback : undefined,
          tutorFeedback: canSeeScore ? data.tutorFeedback || data.feedback : undefined,
          questionResults: canSeeScore ? data.questionResults : undefined,
          manualMarks: canSeeScore ? data.manualMarks : undefined,
          answers: canSeeScore ? data.answers : undefined,
          className: normalizeClassName(data.className || "") || data.className || "—",
          schoolName: sLabel,
          maxScore,
        });
      });

      setExams(loadedExams);
      setAttempts(attList);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load assessment records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (scopeReady) {
      void load();
      const fallbackSchoolName =
        availableSchools.find((s) => s.id === schoolId)?.name ||
        availableSchools[0]?.name ||
        resolveSchoolLabel(schoolId);
      void loadSavedDocumentHeaderConfig({
        scopeKey: schoolId || "default",
        schoolId,
        fallbackSchoolName,
      }).then((cfg) => setHeaderConfig(cfg));
    }
  }, [scopeReady, schoolId]);

  const openReleaseRemarkModal = (attempt: Attempt) => {
    if (isSchoolUser) return;
    const existingRemark = String(attempt.feedback || attempt.tutorFeedback || "").trim();
    if (existingRemark) {
      setReleaseRemarkInput(existingRemark);
    } else {
      const ex = exams.find((e) => e.id === attempt.examId);
      const max = computeExamMaxScore(ex, attempt);
      const pct =
        typeof attempt.score === "number" ? calculateScorePercentage(attempt.score, max) : 0;
      setReleaseRemarkInput(getSuggestedTutorRemark(pct));
    }
    setReleaseModalAttempt(attempt);
  };

  const manage = async (attempt: Attempt, action: "release", customRemark?: string) => {
    if (isSchoolUser) return;
    const trimmedRemark = String(
      customRemark !== undefined
        ? customRemark
        : attempt.feedback || attempt.tutorFeedback || ""
    ).trim();
    setActionBusy(attempt.id + action);
    setMessage("");
    try {
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          await fetch("/.netlify/functions/jdi-exam-management", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({
              examId: attempt.examId,
              attemptId: attempt.id,
              action,
              feedback: trimmedRemark,
              tutorFeedback: trimmedRemark,
            }),
          });
        }
      } catch (netErr) {
        console.warn("Server action notice, mirroring to Firestore:", netErr);
      }

      const releasePatch: Record<string, any> = {
        resultReleased: true,
        releasedAt: serverTimestamp(),
        status: "graded",
        ...(trimmedRemark
          ? { feedback: trimmedRemark, tutorFeedback: trimmedRemark }
          : {}),
        updatedAt: serverTimestamp(),
      };

      for (const dbInstance of getAllClientDatabases()) {
        await setDoc(doc(dbInstance, "jdiExamAttempts", attempt.id), releasePatch, {
          merge: true,
        }).catch(() =>
          updateDoc(doc(dbInstance, "jdiExamAttempts", attempt.id), releasePatch).catch(
            () => undefined
          )
        );
      }

      setReleaseModalAttempt(null);
      await load();
      setMessage(
        trimmedRemark
          ? `Result and official tutor remark released for ${attempt.studentName}!`
          : `Result released for ${attempt.studentName}!`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not complete action.");
    } finally {
      setActionBusy(null);
    }
  };

  const releaseAllPendingInView = async (pendingList: Attempt[]) => {
    if (isSchoolUser || !pendingList.length || bulkReleaseBusy) return;
    setBulkReleaseBusy(true);
    setMessage("");
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => "") : "";
      const dbInstances = getAllClientDatabases();
      let releasedCount = 0;

      for (const attempt of pendingList) {
        const ex = exams.find((e) => e.id === attempt.examId);
        const max = computeExamMaxScore(ex, attempt);
        const pct =
          typeof attempt.score === "number" ? calculateScorePercentage(attempt.score, max) : 0;
        const remark =
          String(attempt.feedback || attempt.tutorFeedback || "").trim() ||
          getSuggestedTutorRemark(pct);

        if (token) {
          fetch("/.netlify/functions/jdi-exam-management", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({
              examId: attempt.examId,
              attemptId: attempt.id,
              action: "release",
              feedback: remark,
              tutorFeedback: remark,
            }),
          }).catch(() => undefined);
        }

        const releasePatch: Record<string, any> = {
          resultReleased: true,
          releasedAt: serverTimestamp(),
          status: "graded",
          feedback: remark,
          tutorFeedback: remark,
          updatedAt: serverTimestamp(),
        };

        await Promise.all(
          dbInstances.map((dbInstance) =>
            setDoc(doc(dbInstance, "jdiExamAttempts", attempt.id), releasePatch, {
              merge: true,
            }).catch(() =>
              updateDoc(doc(dbInstance, "jdiExamAttempts", attempt.id), releasePatch).catch(
                () => undefined
              )
            )
          )
        );
        releasedCount++;
      }

      await load();
      setMessage(
        `Successfully released ${releasedCount} assessment result(s) with official tutor remarks to Student and School portals!`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not complete bulk release.");
    } finally {
      setBulkReleaseBusy(false);
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

  const releasedFiltered = useMemo(
    () => filtered.filter((a) => isAttemptResultReleased(a)),
    [filtered]
  );

  const unreleasedSubmittedFiltered = useMemo(
    () =>
      filtered.filter(
        (a) =>
          !isAttemptResultReleased(a) &&
          ["submitted", "expired", "graded", "completed"].includes(a.status)
      ),
    [filtered]
  );

  const csv = () => {
    const exportSource = isSchoolUser ? releasedFiltered : filtered;
    if (!exportSource.length) {
      setMessage(
        isSchoolUser
          ? "No released assessment results are available to export yet. Results must be released by the tutor first."
          : "No assessment records are available in the current view to export."
      );
      return;
    }
    const rows: (string | number | null | undefined)[][] = [
      [
        "Student",
        "Class",
        "Partner School",
        "Assessment",
        "Status",
        "Score",
        "Maximum Score",
        "Percentage",
        "Submitted",
        "Released",
        "Teacher Feedback",
      ],
      ...exportSource.map((a) => {
        const exam = exams.find((e) => e.id === a.examId);
        const isReleased = isAttemptResultReleased(a);
        const canSeeScore = isReleased || !isSchoolUser;
        const maxScore = computeExamMaxScore(exam, a);
        const pct =
          canSeeScore && typeof a.score === "number"
            ? calculateScorePercentage(a.score, maxScore)
            : null;
        return [
          a.studentName,
          a.className,
          resolveSchoolLabel(a.schoolId || exam?.schoolId, a.schoolName || exam?.schoolName),
          exam?.title || a.examId,
          isReleased ? "released" : a.status,
          !canSeeScore
            ? "Awaiting Tutor Release"
            : a.score === undefined
            ? "Not graded"
            : a.score,
          maxScore,
          pct !== null ? `${pct}%` : "",
          a.submittedAt?.toDate ? a.submittedAt.toDate().toISOString() : String(a.submittedAt || ""),
          String(a.releasedAt || (isReleased ? "Released" : "")),
          canSeeScore ? a.feedback || "" : "",
        ];
      }),
    ];
    const file = createXlsx(rows, "JDI Assessment Results");
    const url = URL.createObjectURL(
      new Blob([file.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "JDI-assessment-history.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderPdfBytes = async (a: Attempt) => {
    if (!isAttemptResultReleased(a)) {
      throw new Error(
        "Assessment results have not been released by the tutor yet. Printing is disabled until results are released."
      );
    }
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
            workType: exam.workType,
            schoolId: exam.schoolId,
            schoolName: authoritativeSchoolName,
            maxScore,
            durationMinutes: exam.durationMinutes,
            questions: exam.questions,
          }
        : {
            title: "Assessment",
            subject: "General",
            schoolName: authoritativeSchoolName,
            maxScore,
          },
      {
        headerConfig: headerConfig || undefined,
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
    if (!releasedFiltered.length) {
      setMessage(
        "No released student reports are available in the current view to package. Results must be released by the tutor before printing."
      );
      return;
    }
    setZipBusy(true);
    setZipProgress(`Preparing 0 / ${releasedFiltered.length} PDF reports…`);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      const batchSize = 5;
      for (let i = 0; i < releasedFiltered.length; i += batchSize) {
        const chunk = releasedFiltered.slice(i, i + batchSize);
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
          `Generating ${Math.min(releasedFiltered.length, i + batchSize)} / ${releasedFiltered.length} PDF reports…`
        );
      }

      const zip = createZip(files);
      const selectedExamObj = exams.find((e) => e.id === selected);
      const schoolSlug = resolveSchoolLabel(schoolId, availableSchools[0]?.name)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
      const examSlug = (selectedExamObj?.title || "all-assessments")
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
      setMessage(`Successfully packaged ${files.length} released PDF report(s) into a ZIP archive.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not generate bulk PDF ZIP.");
    } finally {
      setZipBusy(false);
      setZipProgress("");
    }
  };

  const pdf = async (a: Attempt) => {
    if (!isAttemptResultReleased(a)) {
      setMessage(
        "Assessment results have not been released by the tutor yet. Printing is disabled until results are released."
      );
      return;
    }
    try {
      await downloadPdf(a);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not generate this report. Please try again."
      );
    }
  };

  // ============================================================================
  // VIEW A: ASSESSMENT OVERVIEW (/portal/school/exams)
  // Focuses exclusively on current & upcoming assessments, classes, subjects,
  // schedules, statuses, access codes, and summary counts for the school.
  // ============================================================================
  if (effectiveMode === "overview") {
    return (
      <main className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Assessment Overview
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Monitor active and upcoming assessments, class assignments, schedules, and student access codes.
            </p>
          </div>
        </header>

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
            {isSchoolUser ? (
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Partner School
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
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                >
                  <option value="">
                    {isPlatformAdmin ? "All Partner Schools" : "All Assigned Schools"}
                  </option>
                  {availableSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

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
              Search Assessments
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
                Assessment History &amp; Reports
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

        {/* CURRENT & UPCOMING ASSESSMENTS CARDS */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Assigned School Assessments &amp; Access Codes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Share the assessment access passcode with eligible students in the target class when their assessment window is active.
              </p>
            </div>
          </div>

          {currentAndUpcomingExams.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText size={38} className="mx-auto mb-3 text-slate-400" />
              <p className="font-bold text-slate-700 dark:text-slate-200">
                No current or upcoming assessments found
              </p>
              <p className="text-xs text-slate-500 mt-1">
                When an assessment is scheduled or activated for your school, its schedule and student access code will appear here.
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
                          <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B91C1C]">
                            {getWorkTypeLabels(ex.workType, ex).singular}
                          </span>
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
  // VIEW B: ASSESSMENT HISTORY (/portal/school/exam-history, /portal/staff/exam-history, /admin/examination-history)
  // Focuses on completed, closed or past assessments and actual student attempts,
  // scores, grading, result-release states, individual reports and bulk exports.
  // ============================================================================
  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Assessment History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Review student assessment submissions, tutor release status, and official printable performance reports.
          </p>
        </div>
      </header>

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

      {/* METRIC OVERVIEW */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Past / Closed Assessments
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
                <option value="">
                  {isPlatformAdmin ? "All Partner Schools" : "All Assigned Schools"}
                </option>
                {availableSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Assessment
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">All Assessments</option>
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
            <button
              type="button"
              onClick={() => setShowHeaderDesigner(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 px-4 py-2.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 cursor-pointer"
            >
              <LayoutTemplate size={15} />
              Document Header Customizer
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isSchoolUser && unreleasedSubmittedFiltered.length > 0 && (
              <button
                type="button"
                disabled={bulkReleaseBusy}
                onClick={() => void releaseAllPendingInView(unreleasedSubmittedFiltered)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <CheckCircle2 size={15} />
                {bulkReleaseBusy
                  ? "Releasing Results…"
                  : `Release All Pending Results (${unreleasedSubmittedFiltered.length})`}
              </button>
            )}
            <button
              disabled={isSchoolUser ? !releasedFiltered.length : !filtered.length}
              title={
                isSchoolUser && !releasedFiltered.length
                  ? "Export is disabled until the tutor releases assessment results."
                  : undefined
              }
              onClick={csv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              Download Excel (.xlsx)
            </button>
            <button
              disabled={!releasedFiltered.length || zipBusy}
              title={
                !releasedFiltered.length
                  ? "Bulk PDF download is disabled until the tutor releases assessment results."
                  : undefined
              }
              onClick={() => void bulkZip()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <FileArchive size={15} className="text-blue-300" />
              {zipBusy
                ? zipProgress || "Packaging ZIP…"
                : `Download Released PDF Reports (ZIP) (${releasedFiltered.length})`}
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
              Student Assessment Attempts &amp; Official Reports
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
              Clear assessment filter
            </button>
          )}
        </div>
        {loading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : !filtered.length ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpenCheck size={40} className="mx-auto mb-3 text-slate-400" />
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              No assessment attempts to show
            </p>
            <p className="text-xs text-slate-500 mt-1">
              When students take an assessment, their submissions, grading statuses and printable PDF reports appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Responsive Attempt Cards */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {filtered.map((a) => {
                const exam = exams.find((e) => e.id === a.examId);
                const isReleased = isAttemptResultReleased(a);
                const canSeeScore = isReleased || !isSchoolUser;
                const maxScore = computeExamMaxScore(exam, a);
                const pct =
                  canSeeScore && typeof a.score === "number"
                    ? calculateScorePercentage(a.score, maxScore)
                    : null;
                const schoolDisplay = resolveSchoolLabel(
                  a.schoolId || exam?.schoolId,
                  a.schoolName || exam?.schoolName
                );
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
                        {canSeeScore && typeof a.score === "number" ? (
                          <span>
                            {a.score} / {maxScore}{" "}
                            <span className="text-blue-700 dark:text-blue-400">({pct}%)</span>
                          </span>
                        ) : a.status === "in_progress" ? (
                          <span className="text-amber-600 dark:text-amber-400 font-sans">
                            In progress
                          </span>
                        ) : !isReleased && isSchoolUser ? (
                          <span className="text-amber-700 dark:text-amber-400 font-sans">
                            Awaiting Tutor Release
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
                        disabled={!isReleased}
                        aria-disabled={!isReleased}
                        title={
                          isReleased
                            ? "Download official assessment report PDF"
                            : "Printing is disabled until the tutor releases the assessment result."
                        }
                        onClick={() => void pdf(a)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          isReleased
                            ? "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                            : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 opacity-60 cursor-not-allowed"
                        }`}
                      >
                        {isReleased ? (
                          <Download size={14} className="text-blue-600" />
                        ) : (
                          <Lock size={14} className="text-slate-400" />
                        )}
                        {isReleased ? "Print Official PDF" : "Print Official PDF (Locked)"}
                      </button>
                      {!isSchoolUser &&
                        ["submitted", "expired", "graded"].includes(a.status) &&
                        !isReleased && (
                          <button
                            type="button"
                            disabled={actionBusy === a.id + "release"}
                            onClick={() => openReleaseRemarkModal(a)}
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
                    <th className="p-4">Assessment</th>
                    <th className="p-4">State</th>
                    <th className="p-4">Score &amp; Percentage</th>
                    <th className="p-4 text-right">Official Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((a) => {
                    const exam = exams.find((e) => e.id === a.examId);
                    const isReleased = isAttemptResultReleased(a);
                    const canSeeScore = isReleased || !isSchoolUser;
                    const maxScore = computeExamMaxScore(exam, a);
                    const pct =
                      canSeeScore && typeof a.score === "number"
                        ? calculateScorePercentage(a.score, maxScore)
                        : null;
                    const schoolDisplay = resolveSchoolLabel(
                      a.schoolId || exam?.schoolId,
                      a.schoolName || exam?.schoolName
                    );
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-red-50 dark:bg-red-950/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#B91C1C] dark:text-red-300">
                              {getWorkTypeLabels(exam?.workType, exam).singular}
                            </span>
                            <span>{exam?.title || a.examId}</span>
                          </div>
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
                          {canSeeScore && typeof a.score === "number" ? (
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
                          ) : !isReleased && isSchoolUser ? (
                            <span className="text-amber-700 dark:text-amber-400 text-xs font-sans font-semibold">
                              Awaiting Tutor Release
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
                            disabled={!isReleased}
                            aria-disabled={!isReleased}
                            title={
                              isReleased
                                ? "Download official assessment report PDF"
                                : "Printing is disabled until the tutor releases the assessment result."
                            }
                            onClick={() => void pdf(a)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              isReleased
                                ? "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                                : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 opacity-60 cursor-not-allowed"
                            }`}
                          >
                            {isReleased ? (
                              <Download size={14} className="text-blue-600" />
                            ) : (
                              <Lock size={14} className="text-slate-400" />
                            )}
                            Print Official PDF
                          </button>
                          {!isSchoolUser &&
                            ["submitted", "expired", "graded"].includes(a.status) && (
                              <>
                                {!isReleased ? (
                                  <button
                                    type="button"
                                    disabled={actionBusy === a.id + "release"}
                                    onClick={() => openReleaseRemarkModal(a)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                                  >
                                    <CheckCircle2 size={14} />
                                    Release Result
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={actionBusy === a.id + "release"}
                                    onClick={() => openReleaseRemarkModal(a)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 cursor-pointer"
                                  >
                                    <MessageSquare size={13} />
                                    Remark
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

      {/* COMPLETED / PAST ASSESSMENTS ARCHIVE */}
      {categorizedExams.completed.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Completed &amp; Past Assessments Archive
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any past assessment below to filter the student attempts table above.
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

      {/* Tutor Remark Selection & Custom Input Modal when Releasing Results */}
      {releaseModalAttempt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Select or Write Tutor Remark Before Releasing Result"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isAttemptResultReleased(releaseModalAttempt)
                      ? "Update Official Tutor Remark"
                      : "Release Result with Official Tutor Remark"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Candidate: <strong>{releaseModalAttempt.studentName}</strong> ({releaseModalAttempt.className})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReleaseModalAttempt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  1. Quick-Select a Preset Remark (Optional)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const ex = exams.find((e) => e.id === releaseModalAttempt.examId);
                    const max = computeExamMaxScore(ex, releaseModalAttempt);
                    const pct =
                      typeof releaseModalAttempt.score === "number"
                        ? calculateScorePercentage(releaseModalAttempt.score, max)
                        : 0;
                    setReleaseRemarkInput(getSuggestedTutorRemark(pct));
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/10 text-blue-700 dark:text-blue-300 text-[11px] font-bold hover:bg-blue-600/20 cursor-pointer"
                >
                  <Sparkles size={12} />
                  Suggest Remark for Score
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {TUTOR_REMARK_PRESETS.map((preset) => {
                  const selectedPreset = releaseRemarkInput.trim() === preset.text.trim();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setReleaseRemarkInput(preset.text)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                        selectedPreset
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  2. Or Type / Customize Your Personal Tutor Remark
                </label>
                <textarea
                  rows={4}
                  value={releaseRemarkInput}
                  onChange={(e) => setReleaseRemarkInput(e.target.value)}
                  placeholder="Write a custom tutor remark or edit a selected preset above. This remark will accompany the student's released result and PDF report..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-900 dark:text-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReleaseModalAttempt(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy === releaseModalAttempt.id + "release"}
                onClick={() =>
                  void manage(releaseModalAttempt, "release", releaseRemarkInput)
                }
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <CheckCircle2 size={14} />
                {actionBusy === releaseModalAttempt.id + "release"
                  ? "Saving & Releasing..."
                  : isAttemptResultReleased(releaseModalAttempt)
                  ? "Save Tutor Remark"
                  : "Release Result & Remark"}
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentHeaderCustomizerModal
        isOpen={showHeaderDesigner}
        onClose={() => setShowHeaderDesigner(false)}
        scopeKey={schoolId || "default"}
        schoolId={schoolId}
        fallbackSchoolName={
          availableSchools.find((s) => s.id === schoolId)?.name ||
          availableSchools[0]?.name ||
          resolveSchoolLabel(schoolId)
        }
        userUid={auth.currentUser?.uid || ""}
        canUpdateSchoolProfile={isSchoolUser || isPlatformAdmin}
        onSaved={(savedCfg) => setHeaderConfig(savedCfg)}
      />
    </main>
  );
}

export function SchoolExaminationOverview() {
  return <ExaminationHistory mode="overview" />;
}

