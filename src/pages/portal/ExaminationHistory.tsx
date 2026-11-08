import { useEffect, useState, useMemo, useRef } from "react";
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
  classifyStudentEnrolment,
  isAttemptOverdueForExpiry,
  gradeAnswers,
  resolveAttemptQuestions,
  type WorkType,
} from "../../lib/classes";
import { fetchAcademicStudentsFallback } from "../../lib/academicFallback";
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
  Eye,
  Link2,
  Users,
  User,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Award,
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
  explanation?: string;
  deliverableInstructions?: string;
  submissionMethod?: string;
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
  recipientMode?: string;
  targetStudentIds?: string[];
  targetClass?: string;
  className?: string;
  classIds?: string[];
  passcode?: string;
  dueDate?: string;
  availableFrom?: string;
  availableUntil?: string;
  maxScore?: number;
  questionCount?: number;
  questions?: Question[];
  createdBy?: string;
  tutorId?: string;
  updatedAt?: any;
  createdAt?: any;
};

type Attempt = {
  id: string;
  examId: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  className: string;
  schoolId?: string;
  schoolName?: string;
  status: string;
  deadlineAt?: string;
  score?: number;
  maxScore?: number;
  percentage?: number;
  submittedAt?: any;
  releasedAt?: any;
  resultReleased?: boolean;
  autoGraded?: boolean;
  answers?: Record<string, any>;
  submissionUrl?: string;
  deliverableUrl?: string;
  questions?: Question[];
  questionsSnapshot?: Question[];
  questionResults?: {
    questionId: string;
    answer?: any;
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

interface PrivateLearnerRecord {
  id: string;
  uid?: string;
  name: string;
  className: string;
  subType: "parent" | "individual";
}

interface SchoolLearnerRecord {
  id: string;
  uid?: string;
  name: string;
  schoolId: string;
  schoolName: string;
  className: string;
}

interface ParsedStructuredSubmission {
  textResponse?: string;
  linkUrl?: string;
  fileDataUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
}

function parseAnswerObject(raw: any): ParsedStructuredSubmission {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ParsedStructuredSubmission;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return JSON.parse(trimmed) as ParsedStructuredSubmission;
      } catch {
        // fall through
      }
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return { linkUrl: trimmed };
    }
    if (trimmed.startsWith("data:")) {
      return { fileDataUrl: trimmed, fileName: "submitted-file" };
    }
    const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
      return { textResponse: raw, linkUrl: urlMatch[0] };
    }
    return { textResponse: raw };
  }
  return {};
}

function extractAttemptSubmittedLinks(
  attempt: Attempt,
  exam?: Exam
): { label: string; url: string; questionId?: string }[] {
  const found: { label: string; url: string; questionId?: string }[] = [];
  const seen = new Set<string>();
  const addLink = (urlRaw: any, label: string, questionId?: string) => {
    const u = String(urlRaw || "").trim();
    if (!u || !/^https?:\/\//i.test(u)) return;
    if (seen.has(u)) return;
    seen.add(u);
    found.push({ label, url: u, questionId });
  };

  addLink(attempt.submissionUrl, "Submitted Deliverable Link");
  addLink(attempt.deliverableUrl, "Submitted Project Link");

  const questions = resolveAttemptQuestions(exam || {}, attempt) as Question[];
  const qMap = new Map<string, { index: number; prompt: string }>();
  questions.forEach((q, idx) => {
    if (q?.id) qMap.set(String(q.id), { index: idx + 1, prompt: q.prompt || `Item ${idx + 1}` });
  });

  if (attempt.answers && typeof attempt.answers === "object") {
    Object.entries(attempt.answers).forEach(([qId, rawVal]) => {
      const parsed = parseAnswerObject(rawVal);
      if (parsed.linkUrl) {
        const qInfo = qMap.get(qId);
        addLink(
          parsed.linkUrl,
          qInfo ? `Q${qInfo.index} Link` : "Submitted Link",
          qId
        );
      }
    });
  }

  return found;
}

function formatQuestionAnswerForTutor(q: Question, rawAnswer: any): {
  displayText: string;
  linkUrl?: string;
  fileDataUrl?: string;
  fileName?: string;
} {
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === "") {
    return { displayText: "No answer submitted" };
  }
  if (["single_choice", "true_false", "dropdown"].includes(q.type)) {
    const opt = (q.options || []).find((o) => String(o.id) === String(rawAnswer));
    return { displayText: opt ? `${opt.text} (${opt.id})` : String(rawAnswer) };
  }
  if (q.type === "multiple_choice") {
    const arr = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
    const labels = arr.map((id) => {
      const opt = (q.options || []).find((o) => String(o.id) === String(id));
      return opt ? opt.text : String(id);
    });
    return { displayText: labels.join(", ") || "No option selected" };
  }
  const parsed = parseAnswerObject(rawAnswer);
  const parts: string[] = [];
  if (parsed.textResponse?.trim()) parts.push(parsed.textResponse.trim());
  if (parsed.linkUrl?.trim() && !parts.includes(parsed.linkUrl.trim())) {
    parts.push(`Link: ${parsed.linkUrl.trim()}`);
  }
  if (parsed.fileName?.trim()) {
    parts.push(`Attached File: ${parsed.fileName.trim()}`);
  }
  return {
    displayText: parts.join("\n") || String(rawAnswer),
    linkUrl: parsed.linkUrl?.trim(),
    fileDataUrl: parsed.fileDataUrl?.trim(),
    fileName: parsed.fileName?.trim(),
  };
}

function formatExpectedKeyForTutor(q: Question): string {
  if (["single_choice", "true_false", "dropdown", "multiple_choice"].includes(q.type)) {
    const ids = Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [];
    if (!ids.length) return "Manual / Tutor Evaluation";
    return ids
      .map((id) => {
        const opt = (q.options || []).find((o) => String(o.id) === String(id));
        return opt ? opt.text : String(id);
      })
      .join(", ");
  }
  if (Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 0) {
    return q.acceptedAnswers.join(" | ");
  }
  return "Practical / Manual Tutor Review";
}

function formatTimestampShort(val: any): string {
  if (!val) return "—";
  try {
    if (typeof val?.toDate === "function") {
      return val.toDate().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    if (typeof val?.seconds === "number") {
      return new Date(val.seconds * 1000).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  } catch {
    // ignore
  }
  return String(val);
}

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
  const [privateLearners, setPrivateLearners] = useState<PrivateLearnerRecord[]>([]);
  const [schoolLearners, setSchoolLearners] = useState<SchoolLearnerRecord[]>([]);
  const [scopeReady, setScopeReady] = useState(false);

  // Recipient Category Filtering (All | Partner Schools | Private Students)
  const [recipientCategory, setRecipientCategory] = useState<
    "all" | "partner_schools" | "private_students"
  >("all");
  const [privateSubFilter, setPrivateSubFilter] = useState<"all" | "parent" | "individual">("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

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
  const [archiveSearch, setArchiveSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState("");
  const [copiedExamId, setCopiedExamId] = useState<string | null>(null);
  const [copiedUrlKey, setCopiedUrlKey] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [bulkReleaseBusy, setBulkReleaseBusy] = useState(false);
  const [showHeaderDesigner, setShowHeaderDesigner] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<DocumentHeaderConfig | null>(null);
  const [releaseModalAttempt, setReleaseModalAttempt] = useState<Attempt | null>(null);
  const [releaseRemarkInput, setReleaseRemarkInput] = useState<string>("");

  // Compact Actions Dropdown state
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  // Detailed Submission Review & Marking Modal state
  const [reviewModalAttempt, setReviewModalAttempt] = useState<Attempt | null>(null);
  const [reviewMarksMap, setReviewMarksMap] = useState<Record<string, number>>({});
  const [reviewTotalOverride, setReviewTotalOverride] = useState<string>("");
  const [reviewRemarkInput, setReviewRemarkInput] = useState<string>("");
  const [reviewSaving, setReviewSaving] = useState(false);

  // Detailed Archived Assessment Modal state
  const [archivedDetailExam, setArchivedDetailExam] = useState<Exam | null>(null);

  const isSchoolUser =
    isSchoolPortal || ["SCHOOL", "SCHOOL_ADMIN"].includes(userRole.toUpperCase());
  const isPlatformAdmin =
    isAdminWorkspace || ["ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(userRole.toUpperCase());

  // Close compact actions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Copy arbitrary link helper
  const handleCopySubmittedLink = (key: string, url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedUrlKey(key);
    setTimeout(() => setCopiedUrlKey(null), 2000);
  };

  // 1. Resolve User Scope, Authorised Partner Schools & Genuine Private Students
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
            setRecipientCategory("partner_schools");
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
        const knownSchoolIdSet = new Set<string>();

        schoolDocMap.forEach((s: any, sId: string) => {
          const sCode = String(s.schoolId || s.code || s.schoolCode || "").trim();
          const sName =
            resolvePartnerSchoolName(s.name, s.schoolName) || `Partner School (${sId})`;
          nameMap[sId] = sName;
          nameMap[sId.toLowerCase()] = sName;
          knownSchoolIdSet.add(sId);
          if (sCode) {
            nameMap[sCode] = sName;
            nameMap[sCode.toLowerCase()] = sName;
            knownSchoolIdSet.add(sCode);
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

        // Load genuine Private Students (parent-enrolled & individual) and Partner School Students
        const privateMap = new Map<string, PrivateLearnerRecord>();
        const schoolStdMap = new Map<string, SchoolLearnerRecord>();

        try {
          const fallbackStudents = await fetchAcademicStudentsFallback({
            scope: isPlatformAdmin ? "all" : "assigned",
          });
          fallbackStudents.forEach((st) => {
            if (st.isPrivate) {
              privateMap.set(st.id, {
                id: st.id,
                name: st.fullName || "Private Student",
                className: normalizeClassName(st.class || "") || st.class || "Private",
                subType: st.privateSubType === "parent" ? "parent" : "individual",
              });
            } else if (!st.isPrivate && st.schoolId) {
              schoolStdMap.set(st.id, {
                id: st.id,
                name: st.fullName || "School Student",
                schoolId: st.schoolId,
                schoolName: nameMap[st.schoolId] || st.schoolName || "Partner School",
                className: normalizeClassName(st.class || "") || st.class || "General",
              });
            }
          });
        } catch {
          // ignore fallback error
        }

        // Also scan individualStudents & students collections directly to ensure complete coverage
        try {
          const [indSnap, stdSnap] = await Promise.all([
            getDocs(collection(db, "individualStudents")).catch(() => ({ docs: [] } as any)),
            getDocs(collection(db, "students")).catch(() => ({ docs: [] } as any)),
          ]);
          const processDoc = (d: any, docSource: "individualStudents" | "students") => {
            const raw = { id: d.id, ...d.data(), docSource };
            const cls = classifyStudentEnrolment(raw);
            const fullName = String(
              raw.fullName || raw.studentName || raw.name || ""
            ).trim();
            if (!fullName) return;
            const normCls =
              normalizeClassName(raw.className || raw.class || raw.grade || "") ||
              raw.className ||
              raw.class ||
              "General";

            if (cls.isPrivate && !privateMap.has(d.id)) {
              privateMap.set(d.id, {
                id: d.id,
                uid: raw.userId || raw.firebaseUid || raw.uid || undefined,
                name: fullName,
                className: normCls,
                subType: cls.privateSubType === "parent" ? "parent" : "individual",
              });
            } else if (cls.isSchool && !schoolStdMap.has(d.id)) {
              const sId = String(raw.schoolId || raw.schoolCode || "").trim();
              schoolStdMap.set(d.id, {
                id: d.id,
                uid: raw.userId || raw.firebaseUid || raw.uid || undefined,
                name: fullName,
                schoolId: sId,
                schoolName: nameMap[sId] || raw.schoolName || "Partner School",
                className: normCls,
              });
            }
          };
          indSnap.docs?.forEach((d: any) => processDoc(d, "individualStudents"));
          stdSnap.docs?.forEach((d: any) => processDoc(d, "students"));
        } catch {
          // ignore
        }

        if (isMounted) {
          setSchoolNameMap(nameMap);
          setAvailableSchools(list);
          setPrivateLearners(
            Array.from(privateMap.values()).sort((a, b) => a.name.localeCompare(b.name))
          );
          setSchoolLearners(
            Array.from(schoolStdMap.values()).sort((a, b) => a.name.localeCompare(b.name))
          );
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

  const privateLearnerById = useMemo(() => {
    const map = new Map<string, PrivateLearnerRecord>();
    privateLearners.forEach((p) => {
      map.set(p.id, p);
      if (p.uid) map.set(p.uid, p);
    });
    return map;
  }, [privateLearners]);

  const isPrivateAttemptOrExam = (record: {
    schoolId?: string;
    schoolName?: string;
    studentId?: string;
    studentUid?: string;
    recipientMode?: string;
  }): boolean => {
    const sId = String(record.schoolId || "").trim().toLowerCase();
    const sName = String(record.schoolName || "").trim().toLowerCase();
    if (record.recipientMode === "PRIVATE_LEARNERS") return true;
    if (sId === "private" || sId === "private_parent" || sId === "private_individual") return true;
    if (sName.includes("private")) return true;
    if (record.studentId && privateLearnerById.has(record.studentId)) return true;
    if (record.studentUid && privateLearnerById.has(record.studentUid)) return true;
    if (!sId && record.studentId && !schoolLearners.some((s) => s.id === record.studentId)) {
      return true;
    }
    return false;
  };

  const resolveSchoolLabel = (
    id?: string,
    fallbackName?: string,
    studentId?: string,
    studentUid?: string
  ) => {
    const priv =
      (studentId && privateLearnerById.get(studentId)) ||
      (studentUid && privateLearnerById.get(studentUid));
    if (priv) {
      return priv.subType === "parent"
        ? "Private Learner (Parent-Enrolled)"
        : "Private Learner (Individual)";
    }
    const key = String(id || "").trim();
    if (
      key.toLowerCase() === "private" ||
      String(fallbackName || "").toLowerCase().includes("private")
    ) {
      return "Private Mentorship";
    }
    const mapped = key ? schoolNameMap[key] || schoolNameMap[key.toLowerCase()] : "";
    return resolvePartnerSchoolName(
      mapped,
      fallbackName,
      key ? "Assigned Partner School" : "Private Mentorship"
    );
  };

  // 2. Load Examinations & Attempts within Authorised Scope (Auto-Expiring Overdue Attempts)
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

      // 2. Direct Firestore merge across all client databases
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

      const matchesScope = (recordSchoolId: any, record?: any) => {
        const sKey = String(recordSchoolId || "").trim().toLowerCase();
        if (isSchoolUser) {
          return Boolean(sKey && allowedSchoolKeys.has(sKey));
        }
        if (schoolId) {
          return Boolean(sKey && allowedSchoolKeys.has(sKey));
        }
        if (isPlatformAdmin) return true;
        // For Tutors when schoolId === "": include their assigned schools AND private student assessments/attempts
        if (!sKey || sKey === "private" || record?.recipientMode === "PRIVATE_LEARNERS") {
          return true;
        }
        return Boolean(sKey && allowedSchoolKeys.has(sKey));
      };

      const examMap = new Map<string, Exam>();
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
            matchesScope(data.schoolId, data) ||
            canManageExamRecord({
              uid: currentUid,
              role: userRole || "TUTOR",
              exam: data,
              assignedSchoolIds: Array.from(allowedSchoolKeys),
            });
          if (!canSee) return;
        } else if (!matchesScope(data.schoolId, data)) {
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

      const nowMs = Date.now();
      const attList: Attempt[] = [];
      rawAttemptMap.forEach((data: any) => {
        const parentExam = examMap.get(data.examId);
        if (
          !matchesScope(data.schoolId, data) &&
          !matchesScope(parentExam?.schoolId, parentExam) &&
          !parentExam
        ) {
          return;
        }

        // Auto-expire overdue in_progress attempts (timer elapsed or dueDate/availableUntil passed on a previous date)
        if (
          data.status === "in_progress" &&
          isAttemptOverdueForExpiry(data, parentExam, nowMs)
        ) {
          const attemptQuestions = resolveAttemptQuestions(parentExam || {}, data);
          const grading = gradeAnswers(
            { ...(parentExam || {}), questions: attemptQuestions },
            data.answers || {}
          );
          data.status = "expired";
          data.score = grading.score;
          data.maxScore = grading.maxScore;
          data.percentage = grading.percentage;
          data.autoGraded = grading.autoGraded;
          data.questionResults = grading.questionResults;

          dbInstances.forEach((dbInst) => {
            setDoc(
              doc(dbInst, "jdiExamAttempts", data.id),
              {
                status: "expired",
                score: grading.score,
                maxScore: grading.maxScore,
                percentage: grading.percentage,
                autoGraded: grading.autoGraded,
                questionResults: grading.questionResults,
                isOnline: false,
                submittedAt: data.submittedAt || serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => undefined);
          });
        }

        const isReleased = isAttemptResultReleased(data);
        const canSeeScore = isReleased || !isSchoolUser;
        const maxScore = computeExamMaxScore(parentExam, data);
        const score = canSeeScore && typeof data.score === "number" ? data.score : undefined;
        const percentage =
          score !== undefined ? calculateScorePercentage(score, maxScore) : undefined;
        const sLabel = resolveSchoolLabel(
          data.schoolId || parentExam?.schoolId,
          data.schoolName || parentExam?.schoolName,
          data.studentId,
          data.studentUid
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

  // Open Detailed Submission Review & Marking Modal
  const openReviewSubmissionModal = (attempt: Attempt) => {
    const exam = exams.find((e) => e.id === attempt.examId);
    const questions = resolveAttemptQuestions(exam || {}, attempt) as Question[];
    const initialMarks: Record<string, number> = {};

    const resultsMap = new Map<string, any>();
    (attempt.questionResults || []).forEach((r) => {
      if (r?.questionId) resultsMap.set(String(r.questionId), r);
    });
    (attempt.manualMarks || []).forEach((m) => {
      if (m?.questionId) {
        resultsMap.set(String(m.questionId), {
          ...(resultsMap.get(String(m.questionId)) || {}),
          pointsAwarded: m.pointsAwarded,
          maxPoints: m.maxPoints,
        });
      }
    });

    questions.forEach((q) => {
      const r = resultsMap.get(q.id);
      if (r && typeof r.pointsAwarded === "number") {
        initialMarks[q.id] = r.pointsAwarded;
      } else {
        initialMarks[q.id] = 0;
      }
    });

    setReviewMarksMap(initialMarks);
    setReviewTotalOverride(typeof attempt.score === "number" ? String(attempt.score) : "");
    const existingRemark = String(attempt.feedback || attempt.tutorFeedback || "").trim();
    if (existingRemark) {
      setReviewRemarkInput(existingRemark);
    } else {
      const max = computeExamMaxScore(exam, attempt);
      const pct =
        typeof attempt.score === "number" ? calculateScorePercentage(attempt.score, max) : 0;
      setReviewRemarkInput(getSuggestedTutorRemark(pct));
    }
    setReviewModalAttempt(attempt);
  };

  // Save Marks & Feedback from Review Modal (with or without releasing result)
  const handleSaveReviewAndMarks = async (releaseNow: boolean) => {
    if (!reviewModalAttempt || isSchoolUser || reviewSaving) return;
    setReviewSaving(true);
    setMessage("");
    try {
      const exam = exams.find((e) => e.id === reviewModalAttempt.examId);
      const questions = resolveAttemptQuestions(exam || {}, reviewModalAttempt) as Question[];
      const maxScore = computeExamMaxScore(exam, reviewModalAttempt);

      let computedSum = 0;
      const manualMarksList: { questionId: string; pointsAwarded: number; maxPoints: number }[] = [];
      const updatedQuestionResults = questions.map((q) => {
        const maxPts = Number(q.points) || 1;
        const awarded = Math.max(0, Math.min(maxPts, Number(reviewMarksMap[q.id] ?? 0)));
        computedSum += awarded;
        manualMarksList.push({
          questionId: q.id,
          pointsAwarded: awarded,
          maxPoints: maxPts,
        });
        return {
          questionId: q.id,
          answer: reviewModalAttempt.answers?.[q.id],
          correct: awarded >= maxPts && maxPts > 0,
          pointsAwarded: awarded,
          maxPoints: maxPts,
        };
      });

      const finalScore =
        questions.length > 0
          ? computedSum
          : reviewTotalOverride.trim() !== ""
          ? Math.max(0, Number(reviewTotalOverride) || 0)
          : typeof reviewModalAttempt.score === "number"
          ? reviewModalAttempt.score
          : 0;

      const finalPercentage = calculateScorePercentage(finalScore, maxScore);
      const trimmedRemark = reviewRemarkInput.trim();
      const willBeReleased = releaseNow || isAttemptResultReleased(reviewModalAttempt);

      const patch: Record<string, any> = {
        score: finalScore,
        maxScore,
        percentage: finalPercentage,
        manualMarks: manualMarksList,
        questionResults: updatedQuestionResults,
        feedback: trimmedRemark,
        tutorFeedback: trimmedRemark,
        status: "graded",
        ...(willBeReleased
          ? {
              resultReleased: true,
              releasedAt: reviewModalAttempt.releasedAt || serverTimestamp(),
            }
          : {}),
        updatedAt: serverTimestamp(),
      };

      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          await fetch("/.netlify/functions/jdi-exam-management", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({
              examId: reviewModalAttempt.examId,
              attemptId: reviewModalAttempt.id,
              action: willBeReleased ? "release" : "grade",
              score: finalScore,
              maxScore,
              percentage: finalPercentage,
              manualMarks: manualMarksList,
              questionResults: updatedQuestionResults,
              feedback: trimmedRemark,
              tutorFeedback: trimmedRemark,
            }),
          });
        }
      } catch {
        // fallback to Firestore below
      }

      for (const dbInstance of getAllClientDatabases()) {
        await setDoc(doc(dbInstance, "jdiExamAttempts", reviewModalAttempt.id), patch, {
          merge: true,
        }).catch(() =>
          updateDoc(doc(dbInstance, "jdiExamAttempts", reviewModalAttempt.id), patch).catch(
            () => undefined
          )
        );
      }

      setReviewModalAttempt(null);
      await load();
      setMessage(
        releaseNow
          ? `Marks, feedback, and official result released for ${reviewModalAttempt.studentName}!`
          : `Marks and tutor feedback saved for ${reviewModalAttempt.studentName} (${finalScore}/${maxScore} · ${finalPercentage}%).`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save marks.");
    } finally {
      setReviewSaving(false);
    }
  };

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
      let dueDeadline = Number.MAX_SAFE_INTEGER;
      if (ex.dueDate) {
        const rawDue = String(ex.dueDate).trim();
        const parsed = /^\d{4}-\d{2}-\d{2}$/.test(rawDue)
          ? new Date(`${rawDue}T23:59:59.999`).getTime()
          : new Date(rawDue).getTime();
        if (Number.isFinite(parsed) && parsed > 0) dueDeadline = parsed;
      }

      if (
        ex.status === "completed" ||
        ex.status === "closed" ||
        now >= until ||
        now > dueDeadline
      ) {
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

  // Filtered Private Learners for selector dropdown
  const filteredPrivateLearnerOptions = useMemo(() => {
    return privateLearners.filter((p) => {
      if (privateSubFilter !== "all" && p.subType !== privateSubFilter) return false;
      return true;
    });
  }, [privateLearners, privateSubFilter]);

  // Filtered Partner School Learners for selector dropdown
  const filteredSchoolLearnerOptions = useMemo(() => {
    return schoolLearners.filter((s) => {
      if (schoolId && s.schoolId !== schoolId) return false;
      if (selectedClass && s.className !== selectedClass) return false;
      return true;
    });
  }, [schoolLearners, schoolId, selectedClass]);

  // Filtered attempts for Examination History
  const filtered = useMemo(() => {
    return attempts.filter((a) => {
      const exam = exams.find((e) => e.id === a.examId);
      if (workTypeTab !== "ALL" && normalizeWorkType(exam?.workType, exam) !== workTypeTab) {
        return false;
      }
      // Recipient Category Filter (Partner Schools vs Private Students)
      const isPriv = isPrivateAttemptOrExam({
        schoolId: a.schoolId || exam?.schoolId,
        schoolName: a.schoolName || exam?.schoolName,
        studentId: a.studentId,
        studentUid: a.studentUid,
        recipientMode: exam?.recipientMode,
      });

      if (recipientCategory === "partner_schools" && isPriv) return false;
      if (recipientCategory === "private_students") {
        if (!isPriv) return false;
        if (privateSubFilter !== "all") {
          const pRec =
            privateLearnerById.get(a.studentId) ||
            (a.studentUid ? privateLearnerById.get(a.studentUid) : undefined);
          if (pRec && pRec.subType !== privateSubFilter) return false;
        }
      }

      if (selectedStudentId) {
        const matchesStd =
          a.studentId === selectedStudentId ||
          a.studentUid === selectedStudentId ||
          privateLearnerById.get(selectedStudentId)?.uid === a.studentUid ||
          privateLearnerById.get(selectedStudentId)?.uid === a.studentId;
        if (!matchesStd) return false;
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
  }, [
    attempts,
    exams,
    workTypeTab,
    recipientCategory,
    privateSubFilter,
    selectedStudentId,
    selected,
    selectedClass,
    attemptStateFilter,
    privateLearnerById,
  ]);

  // Filtered Completed & Past Assessments Archive (respecting search & recipient filters)
  const filteredArchivedExams = useMemo(() => {
    // Include exams in categorizedExams.completed PLUS any exam that already has submitted attempts
    const archiveMap = new Map<string, Exam>();
    categorizedExams.completed.forEach((ex) => archiveMap.set(ex.id, ex));
    exams.forEach((ex) => {
      if (ex.status === "draft") return;
      const counts = attemptCountsByExam[ex.id];
      if (counts && counts.total > 0 && !archiveMap.has(ex.id)) {
        archiveMap.set(ex.id, ex);
      }
    });

    const list = Array.from(archiveMap.values());
    return list.filter((ex) => {
      if (workTypeTab !== "ALL" && normalizeWorkType(ex.workType, ex) !== workTypeTab) {
        return false;
      }
      const isPriv = isPrivateAttemptOrExam({
        schoolId: ex.schoolId,
        schoolName: ex.schoolName,
        recipientMode: ex.recipientMode,
      });
      if (recipientCategory === "partner_schools" && isPriv && ex.recipientMode !== "ALL") {
        return false;
      }
      if (recipientCategory === "private_students" && !isPriv && ex.recipientMode !== "ALL") {
        // Also allow if a private student has an attempt on this exam
        const hasPrivAttempt = attempts.some(
          (a) =>
            a.examId === ex.id &&
            isPrivateAttemptOrExam({
              schoolId: a.schoolId,
              schoolName: a.schoolName,
              studentId: a.studentId,
              studentUid: a.studentUid,
            })
        );
        if (!hasPrivAttempt) return false;
      }
      if (archiveSearch.trim()) {
        const q = archiveSearch.trim().toLowerCase();
        const schoolText = resolveSchoolLabel(ex.schoolId, ex.schoolName).toLowerCase();
        const clsText = (ex.targetClass || ex.className || "").toLowerCase();
        const typeText = getWorkTypeLabels(ex.workType, ex).singular.toLowerCase();
        const match =
          (ex.title || "").toLowerCase().includes(q) ||
          (ex.subject || "").toLowerCase().includes(q) ||
          schoolText.includes(q) ||
          clsText.includes(q) ||
          typeText.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    categorizedExams.completed,
    exams,
    attempts,
    attemptCountsByExam,
    workTypeTab,
    recipientCategory,
    archiveSearch,
  ]);

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
        "School / Enrolment",
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
          resolveSchoolLabel(
            a.schoolId || exam?.schoolId,
            a.schoolName || exam?.schoolName,
            a.studentId,
            a.studentUid
          ),
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
    if (isSchoolUser && !isAttemptResultReleased(a)) {
      throw new Error(
        "Assessment results have not been released by the tutor yet. Printing is disabled until results are released."
      );
    }
    const exam = exams.find((e) => e.id === a.examId);
    const authoritativeSchoolName = resolveSchoolLabel(
      a.schoolId || exam?.schoolId,
      a.schoolName || exam?.schoolName,
      a.studentId,
      a.studentUid
    );
    const maxScore = computeExamMaxScore(exam, a);

    return await generateExamReportPdf(
      {
        ...a,
        schoolName: authoritativeSchoolName,
        maxScore,
        questions: a.questionsSnapshot || a.questions || exam?.questions,
        callerRole: isSchoolUser ? "school" : "tutor",
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
    if (isSchoolUser && !isAttemptResultReleased(a)) {
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
  // ============================================================================
  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Assessment History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Review student assessment submissions, mark responses, manage result release, and print official performance reports.
          </p>
        </div>
      </header>

      {/* SECTION NAVIGATION + COMPACT RIGHT-SIDE ACTION TOOLBAR (Deliverable 10) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        {/* Left: Work-Type Category Tabs */}
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar touch-pan-x">
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
                className={`relative pb-2.5 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
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

        {/* Right: Compact Action Toolbar */}
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            title="Refresh assessment records"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-blue-600" : "text-blue-600"} />
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>

          {!isSchoolUser && unreleasedSubmittedFiltered.length > 0 && (
            <button
              type="button"
              disabled={bulkReleaseBusy}
              onClick={() => void releaseAllPendingInView(unreleasedSubmittedFiltered)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
            >
              <CheckCircle2 size={13} />
              <span>
                {bulkReleaseBusy
                  ? "Releasing…"
                  : `Release Pending (${unreleasedSubmittedFiltered.length})`}
              </span>
            </button>
          )}

          {/* Compact Dropdown for Exports & Document Header Customizer */}
          <div className="relative" ref={actionsMenuRef}>
            <button
              type="button"
              onClick={() => setShowActionsMenu((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-blue-700 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal size={13} />
              <span>Tools &amp; Exports</span>
              <ChevronDown size={13} />
            </button>

            {showActionsMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-40 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowActionsMenu(false);
                    setShowHeaderDesigner(true);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <LayoutTemplate size={14} className="text-blue-600 shrink-0" />
                  <span>Document Header Customizer</span>
                </button>

                {!isSchoolUser && unreleasedSubmittedFiltered.length > 0 && (
                  <button
                    type="button"
                    disabled={bulkReleaseBusy}
                    onClick={() => {
                      setShowActionsMenu(false);
                      void releaseAllPendingInView(unreleasedSubmittedFiltered);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                  >
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Release All Pending Results ({unreleasedSubmittedFiltered.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSchoolUser ? !releasedFiltered.length : !filtered.length}
                  onClick={() => {
                    setShowActionsMenu(false);
                    csv();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
                  <span>Download Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  disabled={!releasedFiltered.length || zipBusy}
                  onClick={() => {
                    setShowActionsMenu(false);
                    void bulkZip();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <FileArchive size={14} className="text-blue-600 shrink-0" />
                  <span>
                    {zipBusy
                      ? zipProgress || "Packaging ZIP…"
                      : `Download Released PDFs (ZIP) (${releasedFiltered.length})`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* METRIC OVERVIEW */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Past / Closed Assessments
          </p>
          <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
            {filteredArchivedExams.length}
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

      {/* RECIPIENT CATEGORY & FILTER CONTROLS (Deliverable 6) */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        {!isSchoolUser && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "All Recipients", icon: Layers },
                  { id: "partner_schools", label: "Partner Schools", icon: School },
                  { id: "private_students", label: "Private Students", icon: Users },
                ] as const
              ).map((cat) => {
                const Icon = cat.icon;
                const active = recipientCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setRecipientCategory(cat.id);
                      setSelectedStudentId("");
                      if (cat.id === "private_students") {
                        setSchoolId("");
                        setSelectedClass("");
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <Icon size={14} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {recipientCategory === "private_students" && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "all", label: "All Private" },
                    { id: "parent", label: "Parent-Enrolled" },
                    { id: "individual", label: "Individual Private" },
                  ] as const
                ).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setPrivateSubFilter(sub.id);
                      setSelectedStudentId("");
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                      privateSubFilter === sub.id
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {isSchoolUser ? (
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Partner School Scope
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-2.5 text-sm font-bold text-slate-900 dark:text-white normal-case tracking-normal">
                <School size={16} className="text-blue-600 shrink-0" />
                <span className="truncate">
                  {availableSchools[0]?.name || resolveSchoolLabel(schoolId)}
                </span>
              </div>
            </div>
          ) : recipientCategory === "private_students" ? (
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Private Student ({filteredPrivateLearnerOptions.length})
              <select
                className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
              >
                <option value="">All Genuine Private Students</option>
                {filteredPrivateLearnerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.subType === "parent" ? "Parent-Enrolled" : "Individual"})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Partner School
              <select
                className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
                value={schoolId}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  setSelectedStudentId("");
                }}
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
              className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
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

          {recipientCategory !== "private_students" ? (
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Class {recipientCategory === "partner_schools" ? "/ Narrow by Student" : ""}
              <div className="mt-1.5 flex gap-2 normal-case tracking-normal">
                <select
                  className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                  value={selectedClass}
                  onChange={(e) => {
                    setSelectedClass(e.target.value);
                    setSelectedStudentId("");
                  }}
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
                {!isSchoolUser && recipientCategory === "partner_schools" && (
                  <select
                    className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                  >
                    <option value="">All Students</option>
                    {filteredSchoolLearnerOptions.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          ) : (
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Class / Level
              <select
                className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">All Levels</option>
                {Array.from(new Set(attempts.map((a) => a.className).filter(Boolean)))
                  .sort()
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Attempt State
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm font-normal text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 normal-case tracking-normal"
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
      </section>

      {message && (
        <p
          role="alert"
          className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-4 text-sm font-medium text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800"
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
              {!isSchoolUser && " · Click any student submission to inspect answers, open submitted links, or mark responses."}
            </p>
          </div>
          {(selected || selectedStudentId || recipientCategory !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSelected("");
                setSelectedStudentId("");
                if (!isSchoolUser) setRecipientCategory("all");
              }}
              className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              Reset active filters
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
                  a.schoolName || exam?.schoolName,
                  a.studentId,
                  a.studentUid
                );
                const submittedLinks = extractAttemptSubmittedLinks(a, exam);
                const primaryLink = submittedLinks[0];
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

                    {/* Direct Link Open & Copy actions if student submitted a link */}
                    {primaryLink && !isSchoolUser && (
                      <div className="flex items-center gap-2 rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/60 dark:bg-indigo-950/30 p-2.5 text-xs">
                        <Link2 size={14} className="text-indigo-600 shrink-0" />
                        <span className="truncate flex-1 font-medium text-indigo-950 dark:text-indigo-200">
                          {primaryLink.url}
                        </span>
                        <a
                          href={primaryLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 shrink-0"
                        >
                          <ExternalLink size={11} />
                          Open Link
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopySubmittedLink(a.id, primaryLink.url)}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 shrink-0 cursor-pointer"
                        >
                          {copiedUrlKey === a.id ? <Check size={11} /> : <Copy size={11} />}
                          {copiedUrlKey === a.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {!isSchoolUser && (
                        <button
                          type="button"
                          onClick={() => openReviewSubmissionModal(a)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
                        >
                          <Eye size={14} />
                          Review / Mark
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isSchoolUser && !isReleased}
                        aria-disabled={isSchoolUser && !isReleased}
                        title={
                          !isSchoolUser || isReleased
                            ? "Download official assessment report PDF"
                            : "Printing is disabled until the tutor releases the assessment result."
                        }
                        onClick={() => void pdf(a)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          !isSchoolUser || isReleased
                            ? "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                            : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 opacity-60 cursor-not-allowed"
                        }`}
                      >
                        {!isSchoolUser || isReleased ? (
                          <Download size={14} className="text-blue-600" />
                        ) : (
                          <Lock size={14} className="text-slate-400" />
                        )}
                        {!isSchoolUser || isReleased ? "Print Official PDF" : "PDF Locked"}
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
                    <th className="p-4">School / Enrolment</th>
                    <th className="p-4">Assessment</th>
                    <th className="p-4">State</th>
                    <th className="p-4">Score &amp; Percentage</th>
                    <th className="p-4 text-right">Submission &amp; Official Report</th>
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
                      a.schoolName || exam?.schoolName,
                      a.studentId,
                      a.studentUid
                    );
                    const submittedLinks = extractAttemptSubmittedLinks(a, exam);
                    const primaryLink = submittedLinks[0];
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
                          {!isSchoolUser ? (
                            <button
                              type="button"
                              onClick={() => openReviewSubmissionModal(a)}
                              className="text-left hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                              title="Click to open and review student submission"
                            >
                              {a.studentName}
                            </button>
                          ) : (
                            a.studentName
                          )}
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
                          {primaryLink && !isSchoolUser && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <a
                                href={primaryLink.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
                              >
                                <ExternalLink size={11} />
                                Open Submitted Link
                              </a>
                              <button
                                type="button"
                                onClick={() => handleCopySubmittedLink(a.id, primaryLink.url)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                              >
                                {copiedUrlKey === a.id ? <Check size={11} /> : <Copy size={11} />}
                                {copiedUrlKey === a.id ? "Copied!" : "Copy Link"}
                              </button>
                            </div>
                          )}
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
                        <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                          {!isSchoolUser && (
                            <button
                              type="button"
                              onClick={() => openReviewSubmissionModal(a)}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 px-2.5 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
                            >
                              <Eye size={13} />
                              Review / Mark
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isSchoolUser && !isReleased}
                            aria-disabled={isSchoolUser && !isReleased}
                            title={
                              !isSchoolUser || isReleased
                                ? "Download official assessment report PDF"
                                : "Printing is disabled until the tutor releases the assessment result."
                            }
                            onClick={() => void pdf(a)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                              !isSchoolUser || isReleased
                                ? "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                                : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 opacity-60 cursor-not-allowed"
                            }`}
                          >
                            {!isSchoolUser || isReleased ? (
                              <Download size={13} className="text-blue-600" />
                            ) : (
                              <Lock size={13} className="text-slate-400" />
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
                                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                                  >
                                    <CheckCircle2 size={13} />
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

      {/* COMPLETED & PAST ASSESSMENTS ARCHIVE — LIST-BASED INTERFACE WITH SEARCH & CLICKABLE DETAIL MODAL (Deliverable 11) */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Completed &amp; Past Assessments Archive
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any archived assessment row to inspect full participation records, student submissions, and individual reports.
            </p>
          </div>
          {/* Small Search Bar beside the Completed & Past Assessments Archive heading */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              placeholder="Search title, subject, school or class…"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-8 pr-8 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900"
            />
            {archiveSearch && (
              <button
                type="button"
                onClick={() => setArchiveSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {filteredArchivedExams.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <History size={34} className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              No archived assessments match your search
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Completed, closed, and past-deadline assessments appear in this structured archive list.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 sm:p-4">Assessment Title</th>
                  <th className="p-3.5 sm:p-4">Category</th>
                  <th className="p-3.5 sm:p-4">Subject</th>
                  <th className="p-3.5 sm:p-4">Partner School / Cohort</th>
                  <th className="p-3.5 sm:p-4">Class</th>
                  <th className="p-3.5 sm:p-4 text-center">Participants</th>
                  <th className="p-3.5 sm:p-4">Closing / Completion Date</th>
                  <th className="p-3.5 sm:p-4 text-right">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredArchivedExams.map((ex) => {
                  const stats = attemptCountsByExam[ex.id] || {
                    total: 0,
                    submitted: 0,
                    inProgress: 0,
                  };
                  const typeLabels = getWorkTypeLabels(ex.workType, ex);
                  const isPriv = isPrivateAttemptOrExam({
                    schoolId: ex.schoolId,
                    schoolName: ex.schoolName,
                    recipientMode: ex.recipientMode,
                  });
                  const schoolDisplay = isPriv
                    ? "Private Students Cohort"
                    : resolveSchoolLabel(ex.schoolId, ex.schoolName);
                  const classDisplay =
                    ex.targetClass ||
                    ex.className ||
                    (Array.isArray(ex.classIds) && ex.classIds.length > 0
                      ? ex.classIds.join(", ")
                      : "All Eligible");
                  const closingDateDisplay = formatTimestampShort(
                    ex.dueDate || ex.availableUntil || ex.updatedAt || ex.createdAt
                  );

                  return (
                    <tr
                      key={ex.id}
                      onClick={() => setArchivedDetailExam(ex)}
                      className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                    >
                      <td className="p-3.5 sm:p-4 font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {ex.title}
                      </td>
                      <td className="p-3.5 sm:p-4">
                        <span className="inline-flex rounded-md bg-red-50 dark:bg-red-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B91C1C] dark:text-red-300">
                          {typeLabels.singular}
                        </span>
                      </td>
                      <td className="p-3.5 sm:p-4 text-slate-700 dark:text-slate-300 font-medium">
                        {ex.subject || "General"}
                      </td>
                      <td className="p-3.5 sm:p-4 text-slate-700 dark:text-slate-300">
                        {schoolDisplay}
                      </td>
                      <td className="p-3.5 sm:p-4 text-slate-600 dark:text-slate-400">
                        {classDisplay}
                      </td>
                      <td className="p-3.5 sm:p-4 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                          <Users size={12} />
                          {stats.total} student{stats.total === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="p-3.5 sm:p-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {closingDateDisplay}
                      </td>
                      <td className="p-3.5 sm:p-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">
                          View Records
                          <ChevronRight size={14} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* CLICKABLE ARCHIVE ROW DETAIL MODAL (Deliverable 11) */}
      {archivedDetailExam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`Archived Assessment Details: ${archivedDetailExam.title}`}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-red-50 dark:bg-red-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B91C1C] dark:text-red-300">
                    {getWorkTypeLabels(archivedDetailExam.workType, archivedDetailExam).singular}
                  </span>
                  <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                    Archived Record
                  </span>
                </div>
                <h3 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white break-words">
                  {archivedDetailExam.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Subject: <strong>{archivedDetailExam.subject}</strong> · Duration:{" "}
                  <strong>{archivedDetailExam.durationMinutes || 30} mins</strong> · Max Score:{" "}
                  <strong>{computeExamMaxScore(archivedDetailExam)} pts</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setArchivedDetailExam(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {(() => {
              const examAttempts = attempts.filter((a) => a.examId === archivedDetailExam.id);
              const isPriv = isPrivateAttemptOrExam({
                schoolId: archivedDetailExam.schoolId,
                schoolName: archivedDetailExam.schoolName,
                recipientMode: archivedDetailExam.recipientMode,
              });
              const schoolText = isPriv
                ? "Private Students Cohort"
                : resolveSchoolLabel(archivedDetailExam.schoolId, archivedDetailExam.schoolName);
              const classText =
                archivedDetailExam.targetClass ||
                archivedDetailExam.className ||
                (Array.isArray(archivedDetailExam.classIds) &&
                archivedDetailExam.classIds.length > 0
                  ? archivedDetailExam.classIds.join(", ")
                  : "All Classes");

              return (
                <div className="p-5 overflow-y-auto space-y-5 flex-1">
                  {/* Summary Cards */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        School / Cohort
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                        {schoolText}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Target Class
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                        {classText}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Student Participation
                      </p>
                      <p className="mt-1 text-sm font-bold text-blue-600 dark:text-blue-400">
                        {examAttempts.length} Participating Student{examAttempts.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  {/* Participating Students List */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Participating Students &amp; Individual Results ({examAttempts.length})
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(archivedDetailExam.id);
                          setArchivedDetailExam(null);
                        }}
                        className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                      >
                        Filter main table by this assessment
                      </button>
                    </div>

                    {examAttempts.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">
                        No student attempts were recorded for this assessment.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs sm:text-sm">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] uppercase font-bold text-slate-600 dark:text-slate-300">
                            <tr>
                              <th className="p-3">Student Name</th>
                              <th className="p-3">Class</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Score</th>
                              <th className="p-3 text-right">Submission &amp; Report</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {examAttempts.map((att) => {
                              const isRel = isAttemptResultReleased(att);
                              const canSee = isRel || !isSchoolUser;
                              const max = computeExamMaxScore(archivedDetailExam, att);
                              const pct =
                                canSee && typeof att.score === "number"
                                  ? calculateScorePercentage(att.score, max)
                                  : null;
                              const links = extractAttemptSubmittedLinks(att, archivedDetailExam);
                              return (
                                <tr
                                  key={att.id}
                                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                >
                                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                                    {att.studentName}
                                  </td>
                                  <td className="p-3 text-slate-600 dark:text-slate-300">
                                    {att.className || "—"}
                                  </td>
                                  <td className="p-3">
                                    <span className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold capitalize text-slate-700 dark:text-slate-300">
                                      {isRel ? "Released" : att.status}
                                    </span>
                                  </td>
                                  <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                                    {canSee && typeof att.score === "number"
                                      ? `${att.score}/${max} (${pct}%)`
                                      : "Pending"}
                                  </td>
                                  <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                                    {links[0] && !isSchoolUser && (
                                      <>
                                        <a
                                          href={links[0].url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300"
                                        >
                                          <ExternalLink size={11} />
                                          Open Link
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleCopySubmittedLink(`arch_${att.id}`, links[0].url)
                                          }
                                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                                        >
                                          {copiedUrlKey === `arch_${att.id}` ? (
                                            <Check size={11} />
                                          ) : (
                                            <Copy size={11} />
                                          )}
                                          {copiedUrlKey === `arch_${att.id}` ? "Copied" : "Copy"}
                                        </button>
                                      </>
                                    )}
                                    {!isSchoolUser && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setArchivedDetailExam(null);
                                          openReviewSubmissionModal(att);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
                                      >
                                        <Eye size={12} />
                                        Review / Mark
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={isSchoolUser && !isRel}
                                      onClick={() => void pdf(att)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                                    >
                                      <Download size={12} className="text-blue-600" />
                                      PDF Report
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setArchivedDetailExam(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                Close Archive View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED SUBMISSION REVIEW & MARKING MODAL (Deliverables 7, 8 & 9) */}
      {reviewModalAttempt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`Review and Mark Submission for ${reviewModalAttempt.studentName}`}
        >
          {(() => {
            const exam = exams.find((e) => e.id === reviewModalAttempt.examId);
            const questions = resolveAttemptQuestions(exam || {}, reviewModalAttempt) as Question[];
            const maxScore = computeExamMaxScore(exam, reviewModalAttempt);
            const submittedLinks = extractAttemptSubmittedLinks(reviewModalAttempt, exam);
            const isReleased = isAttemptResultReleased(reviewModalAttempt);
            const schoolDisplay = resolveSchoolLabel(
              reviewModalAttempt.schoolId || exam?.schoolId,
              reviewModalAttempt.schoolName || exam?.schoolName,
              reviewModalAttempt.studentId,
              reviewModalAttempt.studentUid
            );

            const currentCalculatedScore =
              questions.length > 0
                ? questions.reduce(
                    (sum, q) =>
                      sum +
                      Math.max(
                        0,
                        Math.min(Number(q.points) || 1, Number(reviewMarksMap[q.id] ?? 0))
                      ),
                    0
                  )
                : reviewTotalOverride.trim() !== ""
                ? Math.max(0, Number(reviewTotalOverride) || 0)
                : Number(reviewModalAttempt.score || 0);
            const currentPct = calculateScorePercentage(currentCalculatedScore, maxScore);

            return (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-indigo-100 dark:bg-indigo-950/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                        Submission Inspection &amp; Marking
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          isReleased
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        }`}
                      >
                        {isReleased ? "Result Released" : `Status: ${reviewModalAttempt.status}`}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white break-words">
                      {reviewModalAttempt.studentName} — {exam?.title || "Assessment"}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {reviewModalAttempt.className || "General"} · {schoolDisplay} · Submitted:{" "}
                      {formatTimestampShort(reviewModalAttempt.submittedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void pdf(reviewModalAttempt)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                    >
                      <Download size={14} className="text-blue-600" />
                      Print Official PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewModalAttempt(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-5 overflow-y-auto space-y-5 flex-1">
                  {/* Prominent Submitted Link Bar (Deliverable 8) */}
                  {submittedLinks.length > 0 && (
                    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 p-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                        <Link2 size={15} className="text-indigo-600" />
                        <span>Submitted Student Deliverable Link(s)</span>
                      </div>
                      <div className="space-y-2">
                        {submittedLinks.map((lnk, idx) => (
                          <div
                            key={lnk.url + idx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/60 p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                                {lnk.label}
                              </span>
                              <p className="text-xs sm:text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {lnk.url}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={lnk.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs"
                              >
                                <ExternalLink size={13} />
                                Open Submitted Link
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopySubmittedLink(`modal_${idx}`, lnk.url)
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                              >
                                {copiedUrlKey === `modal_${idx}` ? (
                                  <Check size={13} className="text-emerald-600" />
                                ) : (
                                  <Copy size={13} />
                                )}
                                {copiedUrlKey === `modal_${idx}` ? "Copied!" : "Copy Link"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Question-by-Question Responses & Marking */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Submitted Responses &amp; Question Marking ({questions.length})
                      </h4>
                      <div className="inline-flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-xs font-bold text-blue-900 dark:text-blue-200">
                        <Award size={14} className="text-blue-600" />
                        <span>
                          Total Score: {currentCalculatedScore} / {maxScore} ({currentPct}%)
                        </span>
                      </div>
                    </div>

                    {questions.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          No structured question items were snapshotted for this assessment. You can enter or adjust the total score directly below:
                        </p>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Total Score Awarded (out of {maxScore})
                          <input
                            type="number"
                            min={0}
                            max={maxScore}
                            value={reviewTotalOverride}
                            onChange={(e) => setReviewTotalOverride(e.target.value)}
                            className="mt-1.5 w-40 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {questions.map((q, idx) => {
                          const rawAns = reviewModalAttempt.answers?.[q.id];
                          const formatted = formatQuestionAnswerForTutor(q, rawAns);
                          const expectedKey = formatExpectedKeyForTutor(q);
                          const maxPts = Number(q.points) || 1;
                          const awarded = Number(reviewMarksMap[q.id] ?? 0);

                          return (
                            <div
                              key={q.id || idx}
                              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4 space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded bg-slate-900 text-white px-2 py-0.5 text-[11px] font-bold">
                                      Q{idx + 1}
                                    </span>
                                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                                      {String(q.type || "question").replace("_", " ")}
                                    </span>
                                  </div>
                                  <p className="text-sm font-bold text-slate-900 dark:text-white break-words">
                                    {q.prompt}
                                  </p>
                                </div>

                                {/* Marks Input per Question */}
                                <div className="flex items-center gap-2 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5">
                                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                    Marks:
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={maxPts}
                                    step="0.5"
                                    value={awarded}
                                    onChange={(e) => {
                                      const val = Math.max(
                                        0,
                                        Math.min(maxPts, Number(e.target.value) || 0)
                                      );
                                      setReviewMarksMap((prev) => ({ ...prev, [q.id]: val }));
                                    }}
                                    className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-center text-xs font-bold text-slate-900 dark:text-white"
                                  />
                                  <span className="text-xs font-bold text-slate-500">
                                    / {maxPts}
                                  </span>
                                </div>
                              </div>

                              <div className="grid gap-2.5 sm:grid-cols-2 text-xs pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                                <div className="rounded-lg bg-white dark:bg-slate-900 p-3 border border-slate-200/80 dark:border-slate-800 space-y-2">
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Student's Submitted Answer
                                  </span>
                                  <p className="font-semibold text-slate-900 dark:text-white whitespace-pre-wrap break-words">
                                    {formatted.displayText}
                                  </p>
                                  {formatted.linkUrl && (
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      <a
                                        href={formatted.linkUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                                      >
                                        <ExternalLink size={11} />
                                        Open Submitted Link
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleCopySubmittedLink(
                                            `q_${q.id}`,
                                            formatted.linkUrl!
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                      >
                                        {copiedUrlKey === `q_${q.id}` ? (
                                          <Check size={11} />
                                        ) : (
                                          <Copy size={11} />
                                        )}
                                        {copiedUrlKey === `q_${q.id}` ? "Copied!" : "Copy Link"}
                                      </button>
                                    </div>
                                  )}
                                  {formatted.fileDataUrl && (
                                    <div className="pt-1">
                                      <a
                                        href={formatted.fileDataUrl}
                                        download={formatted.fileName || "submitted-deliverable"}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                                      >
                                        <Download size={11} />
                                        Download File ({formatted.fileName || "Attachment"})
                                      </a>
                                    </div>
                                  )}
                                </div>

                                <div className="rounded-lg bg-white dark:bg-slate-900 p-3 border border-slate-200/80 dark:border-slate-800 space-y-1">
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Expected Answer / Marking Guide
                                  </span>
                                  <p className="font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                    {expectedKey}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Tutor Remark & Feedback Section */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Official Tutor Feedback &amp; Remark
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setReviewRemarkInput(getSuggestedTutorRemark(currentPct))
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600/10 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-600/20 cursor-pointer"
                      >
                        <Sparkles size={12} />
                        Suggest Remark for {currentPct}%
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={reviewRemarkInput}
                      onChange={(e) => setReviewRemarkInput(e.target.value)}
                      placeholder="Enter feedback or marking comments for this student…"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Modal Footer — Independent Marking vs Releasing */}
                <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewModalAttempt(null)}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                  >
                    Close
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={reviewSaving}
                      onClick={() => void handleSaveReviewAndMarks(false)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-600 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-50 disabled:opacity-50 cursor-pointer"
                    >
                      {reviewSaving ? "Saving…" : "Save Marks & Feedback"}
                    </button>
                    <button
                      type="button"
                      disabled={reviewSaving}
                      onClick={() => void handleSaveReviewAndMarks(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      <CheckCircle2 size={14} />
                      {reviewSaving
                        ? "Saving & Releasing…"
                        : isReleased
                        ? "Save & Update Released Report"
                        : "Save Marks & Release Result"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
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
