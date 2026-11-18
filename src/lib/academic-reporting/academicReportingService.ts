import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, getAllClientDatabases } from '../firebase';
import { getEffectiveAuth } from '../../utils/impersonation';
import {
  classesMatch,
  computeExamMaxScore,
  formatNormalizedClassDisplay,
  isAttemptResultReleased,
  isStudentEligibleForWork,
  normalizeClassName,
  resolvePartnerSchoolName,
} from '../classes';
import { fetchAcademicSchoolsFallback, fetchAcademicStudentsFallback } from '../academicFallback';
import { formatDocumentRefNo } from '../pdf/documentBranding';
import {
  allocateReportReferenceNumber,
  calculatePeriodAcademicPerformance,
  calculateSessionThreeTermPerformance,
  classifyAcademicWorkSourceType,
  createStarterGradingProfiles,
  isDateWithinPeriod,
  normalizeReferenceCode,
  normalizeScoreToPercentage,
  resolveGradeFromBoundaries,
  resolveTermForDate,
  validateCategoryWeights,
  validateGradeBoundaries,
} from './gradingEngine';
import type {
  AcademicAuditActionType,
  AcademicAuditLogEntry,
  AcademicEnrolmentCategory,
  AcademicEvidenceItem,
  AcademicGradingProfile,
  AcademicPerformanceReportSnapshot,
  AcademicPeriodRecord,
  AcademicReferenceLookupItem,
  AcademicReportType,
  AcademicTermConfig,
  AcademicTermKey,
  AttendancePeriodSummary,
  AttendanceRecordItem,
  MilestonePeriodSummary,
  MilestoneRecordItem,
  ReportAuthorityContext,
  ReportContentInclusionOptions,
  TutorReportRemarks,
} from './types';

const SUPER_ADMIN_EMAILS = new Set([
  'jaystarblissstudios@gmail.com',
  'admin@jaystarblissstudios.com',
  'superadmin@jaystarbliss.com',
]);

const toIso = (val: any): string | null => {
  if (!val) return null;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString();
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return new Date(val).toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? val.trim() : parsed.toISOString();
  }
  return null;
};

const norm = (val: unknown): string => String(val ?? '').trim();
const normLower = (val: unknown): string => norm(val).toLowerCase();

async function queryDocsAcrossDbs(collectionName: string): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const dbs = getAllClientDatabases();
  const seen = new Map<string, { id: string; data: Record<string, any> }>();
  for (const targetDb of dbs) {
    try {
      const snap = await getDocs(collection(targetDb, collectionName));
      snap.docs.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.set(d.id, { id: d.id, data: d.data() });
        }
      });
    } catch {
      // ignore missing/permission-restricted secondary collections
    }
  }
  return Array.from(seen.values());
}

/**
 * Resolves the authoritative RBAC context for the current user.
 * Enforces Part 2:
 * - Only Platform Administrators and Authorized Tutors have `canConfigureGradingAndIssueReports = true`.
 * - School Administrators (`SCHOOL`, `SCHOOL_ADMIN`) are strictly read-only viewers for their school's issued reports.
 * - Parents and Students are strictly read-only viewers for their own / linked learner's issued reports.
 */
export async function resolveReportAuthorityContext(overrideRoleHint?: string): Promise<ReportAuthorityContext> {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  const uid = norm(effective?.effectiveUid || currentUser?.uid || sessionStorage.getItem('user_uid') || '');
  const email = normLower(
    effective?.effectiveEmail || currentUser?.email || sessionStorage.getItem('user_email') || ''
  );
  const storedRole = norm(
    overrideRoleHint ||
      effective?.effectiveRole ||
      sessionStorage.getItem('admin_role') ||
      sessionStorage.getItem('portal_role') ||
      sessionStorage.getItem('user_role') ||
      ''
  ).toUpperCase();
  const displayName = norm(
    effective?.effectiveName ||
      currentUser?.displayName ||
      sessionStorage.getItem('user_name') ||
      email ||
      'Authorized User'
  );

  let resolvedRole = storedRole;
  let userDocData: Record<string, any> | null = null;

  if (uid) {
    try {
      const uSnap = await getDoc(doc(db, 'users', uid));
      if (uSnap.exists()) {
        userDocData = uSnap.data();
        if (!resolvedRole && userDocData?.role) {
          resolvedRole = norm(userDocData.role).toUpperCase();
        }
      }
    } catch {
      // continue
    }
  }

  const isSuperEmail = Boolean(email && SUPER_ADMIN_EMAILS.has(email));
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  const isStaffPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal/staff');
  const isSchoolPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal/school');
  const isParentPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal/parent');
  const isStudentPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal/student');

  const isPlatformAdmin =
    isSuperEmail ||
    ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'ADMIN', 'OPERATIONS_ADMIN'].includes(resolvedRole) ||
    (isAdminPath && !['SCHOOL', 'SCHOOL_ADMIN', 'PARENT', 'STUDENT'].includes(resolvedRole));

  const isSchoolAdmin =
    !isPlatformAdmin &&
    (['SCHOOL', 'SCHOOL_ADMIN', 'PARTNER_SCHOOL'].includes(resolvedRole) || isSchoolPath);

  const isParent =
    !isPlatformAdmin &&
    !isSchoolAdmin &&
    (['PARENT', 'CLIENT'].includes(resolvedRole) || isParentPath);

  const isStudent =
    !isPlatformAdmin &&
    !isSchoolAdmin &&
    !isParent &&
    (['STUDENT', 'INDIVIDUAL_STUDENT', 'LEARNER'].includes(resolvedRole) || isStudentPath);

  const isAuthorizedTutor =
    !isPlatformAdmin &&
    !isSchoolAdmin &&
    !isParent &&
    !isStudent &&
    (['TUTOR', 'STAFF', 'INSTRUCTOR', 'FACILITATOR'].includes(resolvedRole) || isStaffPath);

  const authorizedSchoolIds = new Set<string>();
  const authorizedSchoolNames = new Set<string>();
  const authorizedStudentIds = new Set<string>();
  const authorizedClassesBySchool = new Map<string, Set<string>>();
  const parentLinkedStudentIds = new Set<string>();
  const ownStudentIds = new Set<string>();

  const registerSchoolRef = (rawSchoolId?: unknown, rawSchoolName?: unknown) => {
    const sId = norm(rawSchoolId);
    const sName = norm(rawSchoolName);
    if (sId) authorizedSchoolIds.add(sId);
    if (sName) authorizedSchoolNames.add(sName.toLowerCase());
    const canonical = resolvePartnerSchoolName(sName || sId);
    if (canonical) authorizedSchoolNames.add(canonical.toLowerCase());
  };

  if (userDocData) {
    registerSchoolRef(userDocData.schoolId, userDocData.schoolName);
    if (Array.isArray(userDocData.schoolIds)) {
      userDocData.schoolIds.forEach((id: any) => registerSchoolRef(id, id));
    }
    if (Array.isArray(userDocData.assignedSchools)) {
      userDocData.assignedSchools.forEach((s: any) =>
        registerSchoolRef(typeof s === 'object' ? s?.id || s?.schoolId : s, typeof s === 'object' ? s?.name || s?.schoolName : s)
      );
    }
  }

  // If Tutor, inspect tutors, staff, class_schedules, and assigned students
  if (isAuthorizedTutor && (uid || email)) {
    const [tutorDocs, staffDocs, scheduleDocs] = await Promise.all([
      queryDocsAcrossDbs('tutors'),
      queryDocsAcrossDbs('staff'),
      queryDocsAcrossDbs('class_schedules'),
    ]);

    const matchesCurrentTutor = (d: Record<string, any>, docId: string) =>
      docId === uid ||
      norm(d.uid || d.userId || d.tutorId || d.staffId) === uid ||
      (email && normLower(d.email) === email);

    [...tutorDocs, ...staffDocs].forEach(({ id, data }) => {
      if (matchesCurrentTutor(data, id)) {
        registerSchoolRef(data.schoolId, data.schoolName);
        if (Array.isArray(data.schoolIds)) data.schoolIds.forEach((s: any) => registerSchoolRef(s, s));
        if (Array.isArray(data.assignedSchools)) {
          data.assignedSchools.forEach((s: any) =>
            registerSchoolRef(typeof s === 'object' ? s?.id : s, typeof s === 'object' ? s?.name : s)
          );
        }
        if (Array.isArray(data.assignedStudents)) {
          data.assignedStudents.forEach((st: any) => {
            const stId = norm(typeof st === 'object' ? st?.id || st?.studentId : st);
            if (stId) authorizedStudentIds.add(stId);
          });
        }
      }
    });

    scheduleDocs.forEach(({ data }) => {
      if (
        norm(data.tutorId || data.staffId || data.instructorId) === uid ||
        (email && normLower(data.tutorEmail) === email)
      ) {
        registerSchoolRef(data.schoolId, data.schoolName);
        const sKey = norm(data.schoolId || data.schoolName);
        const cName = normalizeClassName(data.className || data.grade || data.targetClass || '');
        if (sKey && cName) {
          const set = authorizedClassesBySchool.get(sKey) || new Set<string>();
          set.add(cName);
          authorizedClassesBySchool.set(sKey, set);
        }
      }
    });
  }

  // If School Admin, bind to their school
  if (isSchoolAdmin) {
    const sessSchoolId = norm(sessionStorage.getItem('school_id') || sessionStorage.getItem('schoolId') || uid);
    const sessSchoolName = norm(sessionStorage.getItem('school_name') || sessionStorage.getItem('schoolName') || '');
    registerSchoolRef(sessSchoolId, sessSchoolName);
    const schoolDocs = await queryDocsAcrossDbs('schools');
    schoolDocs.forEach(({ id, data }) => {
      if (
        id === uid ||
        id === sessSchoolId ||
        norm(data.uid || data.userId || data.schoolId) === uid ||
        (email && normLower(data.email || data.contactEmail) === email)
      ) {
        registerSchoolRef(id, data.name || data.schoolName);
      }
    });
  }

  // Inspect students & individualStudents for Tutor / Parent / Student bindings
  const [studentsList, indivList, fallbackStudents] = await Promise.all([
    queryDocsAcrossDbs('students'),
    queryDocsAcrossDbs('individualStudents'),
    fetchAcademicStudentsFallback().catch(() => []),
  ]);

  const allStudentRows: Array<{ id: string; data: Record<string, any> }> = [
    ...studentsList,
    ...indivList,
    ...(Array.isArray(fallbackStudents)
      ? fallbackStudents.map((s: any) => ({ id: norm(s.id || s.uid), data: s }))
      : []),
  ];

  allStudentRows.forEach(({ id, data }) => {
    const allIds = [id, norm(data.id), norm(data.uid), norm(data.studentId), norm(data.studentUid)].filter(Boolean);

    if (isAuthorizedTutor) {
      const assignedTutorMatch =
        norm(data.tutorId || data.assignedTutorId || data.staffId || data.instructorId) === uid ||
        (email && normLower(data.tutorEmail) === email);
      const schoolMatch =
        (data.schoolId && authorizedSchoolIds.has(norm(data.schoolId))) ||
        (data.schoolName && authorizedSchoolNames.has(normLower(data.schoolName))) ||
        (data.schoolName &&
          authorizedSchoolNames.has(normLower(resolvePartnerSchoolName(data.schoolName))));

      if (assignedTutorMatch || schoolMatch) {
        allIds.forEach((sid) => authorizedStudentIds.add(sid));
      }
    }

    if (isParent) {
      const parentMatch =
        norm(data.parentId || data.parentUid || data.clientId) === uid ||
        (email && normLower(data.parentEmail || data.guardianEmail || data.email) === email);
      if (parentMatch) {
        allIds.forEach((sid) => parentLinkedStudentIds.add(sid));
      }
    }

    if (isStudent) {
      const selfMatch =
        allIds.includes(uid) ||
        (email && normLower(data.email || data.studentEmail) === email);
      if (selfMatch) {
        allIds.forEach((sid) => ownStudentIds.add(sid));
      }
    }
  });

  if (isStudent && uid) {
    ownStudentIds.add(uid);
  }

  // If a tutor has no explicit school/student restrictions assigned yet in dev/staging, allow access to all schools/students
  // they interact with while keeping strict block on school admins, parents, and students.
  if (isAuthorizedTutor && authorizedSchoolIds.size === 0 && authorizedSchoolNames.size === 0 && authorizedStudentIds.size === 0) {
    allStudentRows.forEach(({ id, data }) => {
      if (id) authorizedStudentIds.add(id);
      registerSchoolRef(data.schoolId, data.schoolName);
    });
  }

  return {
    uid: uid || 'system',
    email,
    name: displayName,
    role: isPlatformAdmin
      ? resolvedRole || 'SUPER_ADMIN'
      : isAuthorizedTutor
      ? 'TUTOR'
      : isSchoolAdmin
      ? 'SCHOOL_ADMIN'
      : isParent
      ? 'PARENT'
      : isStudent
      ? 'STUDENT'
      : resolvedRole || 'USER',
    isPlatformAdmin,
    isAuthorizedTutor,
    isSchoolAdmin,
    isParent,
    isStudent,
    canConfigureGradingAndIssueReports: isPlatformAdmin || isAuthorizedTutor,
    authorizedSchoolIds,
    authorizedSchoolNames,
    authorizedStudentIds,
    authorizedClassesBySchool,
    parentLinkedStudentIds,
    ownStudentIds,
  };
}

/**
 * Throws a clear permission error if a School Admin, Parent, Student, or unauthorized user
 * attempts to configure grading profiles, configure academic periods, or generate/issue reports.
 */
export function assertGradingAndReportingAuthority(
  authority: ReportAuthorityContext,
  targetScope?: { schoolId?: string; schoolName?: string; studentId?: string }
): void {
  if (authority.isSchoolAdmin) {
    throw new Error(
      'Access Denied: School Administrators have read-only access to released reports and cannot configure grading schemes or generate official reports.'
    );
  }
  if (authority.isParent || authority.isStudent || !authority.canConfigureGradingAndIssueReports) {
    throw new Error(
      'Access Denied: Only Jaystarbliss Platform Administrators and Authorized Tutors can configure grading or issue official reports.'
    );
  }
  if (authority.isPlatformAdmin) {
    return;
  }
  if (targetScope) {
    if (!canTutorManageTarget(authority, targetScope)) {
      throw new Error(
        'Access Denied: You are only authorized to configure grading or generate reports for your assigned schools, classes, or private learners.'
      );
    }
  }
}

export function canTutorManageTarget(
  authority: ReportAuthorityContext,
  target: { schoolId?: string; schoolName?: string; studentId?: string }
): boolean {
  if (authority.isPlatformAdmin) return true;
  if (!authority.isAuthorizedTutor) return false;

  const sId = norm(target.schoolId);
  const sName = normLower(target.schoolName);
  const canonicalSchool = normLower(resolvePartnerSchoolName(target.schoolName || target.schoolId || ''));
  const stId = norm(target.studentId);

  if (stId && authority.authorizedStudentIds.has(stId)) {
    return true;
  }
  if (sId && authority.authorizedSchoolIds.has(sId)) {
    return true;
  }
  if (sName && authority.authorizedSchoolNames.has(sName)) {
    return true;
  }
  if (canonicalSchool && authority.authorizedSchoolNames.has(canonicalSchool)) {
    return true;
  }
  if (!sId && !sName && !stId) {
    return true;
  }
  return false;
}

/**
 * Verifies whether a viewer (Admin, Tutor, School Admin, Parent, or Student) can view a specific report snapshot.
 */
export function canUserViewReportSnapshot(
  authority: ReportAuthorityContext,
  report: AcademicPerformanceReportSnapshot
): boolean {
  if (authority.isPlatformAdmin) return true;

  if (authority.isAuthorizedTutor) {
    return canTutorManageTarget(authority, {
      schoolId: report.schoolId,
      schoolName: report.schoolName,
      studentId: report.studentId,
    });
  }

  // Non-admin/tutor roles can ONLY view officially ISSUED reports
  if (report.status !== 'ISSUED') {
    return false;
  }

  if (authority.isSchoolAdmin) {
    if (report.enrolmentCategory !== 'school') return false;
    const sId = norm(report.schoolId);
    const sName = normLower(report.schoolName);
    const canonical = normLower(resolvePartnerSchoolName(report.schoolName || report.schoolId || ''));
    return (
      (Boolean(sId) && authority.authorizedSchoolIds.has(sId)) ||
      (Boolean(sName) && authority.authorizedSchoolNames.has(sName)) ||
      (Boolean(canonical) && authority.authorizedSchoolNames.has(canonical))
    );
  }

  if (authority.isParent) {
    return (
      authority.parentLinkedStudentIds.has(norm(report.studentId)) ||
      (Boolean(report.parentId) && norm(report.parentId) === authority.uid)
    );
  }

  if (authority.isStudent) {
    return (
      authority.ownStudentIds.has(norm(report.studentId)) ||
      norm(report.studentId) === authority.uid ||
      (Boolean(authority.email) && normLower(report.studentEmail) === authority.email)
    );
  }

  return false;
}

export interface ReportingSchoolDirectoryItem {
  id: string;
  name: string;
  classes: string[];
}

export interface ReportingLearnerDirectoryItem {
  id: string;
  allIds: string[];
  fullName: string;
  studentCode: string;
  email: string;
  enrolmentCategory: AcademicEnrolmentCategory;
  enrolmentLabel: string;
  schoolId: string;
  schoolName: string;
  className: string;
  programId: string;
  programName: string;
  programStartDate?: string;
  programCompletionDate?: string;
  assignedTutorId?: string;
  assignedTutorName?: string;
  parentId?: string;
  parentName?: string;
}

/**
 * Loads all learners and partner schools accessible to the current authority context.
 */
export async function fetchReportingLearnersAndSchools(
  authority?: ReportAuthorityContext
): Promise<{
  authority: ReportAuthorityContext;
  schools: ReportingSchoolDirectoryItem[];
  learners: ReportingLearnerDirectoryItem[];
  programmes: string[];
}> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  const [schoolDocs, fallbackSchools, studentDocs, indivDocs, fallbackStudents] = await Promise.all([
    queryDocsAcrossDbs('schools'),
    fetchAcademicSchoolsFallback().catch(() => []),
    queryDocsAcrossDbs('students'),
    queryDocsAcrossDbs('individualStudents'),
    fetchAcademicStudentsFallback().catch(() => []),
  ]);

  const schoolMap = new Map<string, ReportingSchoolDirectoryItem>();
  const registerSchool = (id: string, name: string, className?: string) => {
    const cleanName = resolvePartnerSchoolName(name || id) || norm(name || id);
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    const existing = schoolMap.get(key) || {
      id: norm(id) || cleanName,
      name: cleanName,
      classes: [],
    };
    if (className) {
      const formattedClass = formatNormalizedClassDisplay(className) || norm(className);
      if (formattedClass && !existing.classes.includes(formattedClass)) {
        existing.classes.push(formattedClass);
      }
    }
    schoolMap.set(key, existing);
  };

  schoolDocs.forEach(({ id, data }) => {
    registerSchool(id, data.name || data.schoolName || id);
  });
  if (Array.isArray(fallbackSchools)) {
    fallbackSchools.forEach((s: any) => {
      registerSchool(norm(s.id || s.schoolId), norm(s.name || s.schoolName));
    });
  }

  const learnerMap = new Map<string, ReportingLearnerDirectoryItem>();
  const programmeSet = new Set<string>();

  const processLearnerRow = (id: string, data: Record<string, any>, sourceCol: string) => {
    const fullName = norm(
      data.fullName ||
        data.name ||
        data.studentName ||
        `${norm(data.firstName)} ${norm(data.lastName)}`.trim()
    );
    if (!fullName) return;

    const rawSchoolId = norm(data.schoolId || data.partnerSchoolId || '');
    const rawSchoolName = norm(data.schoolName || data.school || '');
    const resolvedSchool = resolvePartnerSchoolName(rawSchoolName || rawSchoolId);
    const isSchoolLearner =
      sourceCol !== 'individualStudents' &&
      Boolean(
        data.isSchoolStudent === true ||
          normLower(data.studentType || data.accountType || data.category).includes('school') ||
          resolvedSchool ||
          (rawSchoolName && !['individual', 'private', 'none', 'jaystarbliss'].includes(rawSchoolName.toLowerCase()))
      );

    const hasParentLink = Boolean(
      norm(data.parentId || data.parentUid || data.parentEmail || data.parentName || data.guardianName)
    );

    const enrolmentCategory: AcademicEnrolmentCategory = isSchoolLearner
      ? 'school'
      : hasParentLink
      ? 'private_parent'
      : 'private_individual';

    const enrolmentLabel =
      enrolmentCategory === 'school'
        ? 'School Enrolment'
        : enrolmentCategory === 'private_parent'
        ? 'Private Enrolment (Parent-Enrolled)'
        : 'Private Enrolment (Individual)';

    const schoolName = isSchoolLearner ? resolvedSchool || rawSchoolName || 'Partner School' : '';
    const schoolId = isSchoolLearner ? rawSchoolId || schoolName : '';
    const className =
      formatNormalizedClassDisplay(data.className || data.grade || data.class || data.level || '') ||
      norm(data.className || data.grade || data.level || (isSchoolLearner ? 'Grade 1' : 'Private Track'));

    const programName = norm(
      data.programName ||
        data.program ||
        data.course ||
        data.track ||
        (Array.isArray(data.programs) && data.programs[0]?.name) ||
        'Robotics & Coding'
    );
    if (programName) programmeSet.add(programName);

    if (isSchoolLearner && schoolName) {
      registerSchool(schoolId, schoolName, className);
    }

    const canonicalId = norm(id || data.id || data.uid || data.studentId);
    if (!canonicalId) return;

    const allIds = Array.from(
      new Set([canonicalId, norm(data.id), norm(data.uid), norm(data.studentId), norm(data.studentUid)].filter(Boolean))
    );

    const item: ReportingLearnerDirectoryItem = {
      id: canonicalId,
      allIds,
      fullName,
      studentCode: norm(data.studentCode || data.admissionNumber || data.regNo || canonicalId.slice(0, 8).toUpperCase()),
      email: norm(data.email || data.studentEmail || ''),
      enrolmentCategory,
      enrolmentLabel,
      schoolId,
      schoolName,
      className,
      programId: programName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      programName,
      programStartDate: toIso(data.startDate || data.enrollmentDate || data.createdAt)?.slice(0, 10) || undefined,
      programCompletionDate: toIso(data.completionDate || data.endDate)?.slice(0, 10) || undefined,
      assignedTutorId: norm(data.tutorId || data.assignedTutorId || data.staffId || '') || undefined,
      assignedTutorName: norm(data.tutorName || data.assignedTutorName || data.instructorName || '') || undefined,
      parentId: norm(data.parentId || data.parentUid || '') || undefined,
      parentName: norm(data.parentName || data.guardianName || '') || undefined,
    };

    if (!learnerMap.has(canonicalId)) {
      learnerMap.set(canonicalId, item);
    }
  };

  studentDocs.forEach(({ id, data }) => processLearnerRow(id, data, 'students'));
  indivDocs.forEach(({ id, data }) => processLearnerRow(id, data, 'individualStudents'));
  if (Array.isArray(fallbackStudents)) {
    fallbackStudents.forEach((s: any) => processLearnerRow(norm(s.id || s.uid), s, 'students'));
  }

  const allSchools = Array.from(schoolMap.values()).filter((s) =>
    authCtx.isPlatformAdmin
      ? true
      : canTutorManageTarget(authCtx, { schoolId: s.id, schoolName: s.name })
  );

  const allLearners = Array.from(learnerMap.values()).filter((l) =>
    authCtx.isPlatformAdmin
      ? true
      : canTutorManageTarget(authCtx, {
          schoolId: l.schoolId,
          schoolName: l.schoolName,
          studentId: l.id,
        })
  );

  return {
    authority: authCtx,
    schools: allSchools.sort((a, b) => a.name.localeCompare(b.name)),
    learners: allLearners.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    programmes: Array.from(programmeSet).sort(),
  };
}

/**
 * Consolidates and deduplicates all academic evidence (assessments, attempts, assignments,
 * submissions, attendance, and milestones) for a learner.
 */
export async function consolidateLearnerAcademicData(
  learner: ReportingLearnerDirectoryItem,
  periodTerms?: AcademicTermConfig[]
): Promise<{
  evidenceItems: AcademicEvidenceItem[];
  overallAttendance: AttendancePeriodSummary;
  attendanceByTerm: Record<AcademicTermKey, AttendancePeriodSummary>;
  milestoneSummary: MilestonePeriodSummary;
}> {
  const [
    jdiExamsDocs,
    schoolExamsDocs,
    attemptsDocs,
    assignmentsDocs,
    submissionsDocs,
    academicAssessmentsDocs,
    attendanceDocs,
    milestonesDocs,
  ] = await Promise.all([
    queryDocsAcrossDbs('jdiExams'),
    queryDocsAcrossDbs('schoolExams'),
    queryDocsAcrossDbs('jdiExamAttempts'),
    queryDocsAcrossDbs('assignments'),
    queryDocsAcrossDbs('assignmentSubmissions'),
    queryDocsAcrossDbs('academic_assessments'),
    queryDocsAcrossDbs('attendance'),
    queryDocsAcrossDbs('milestones'),
  ]);

  const learnerIdSet = new Set(learner.allIds.map((i) => i.toLowerCase()));
  const learnerNameLower = learner.fullName.toLowerCase();

  const matchesLearner = (record: Record<string, any>): boolean => {
    const candidateIds = [
      record.studentId,
      record.studentUid,
      record.learnerId,
      record.userId,
      record.uid,
    ]
      .map((v) => normLower(v))
      .filter(Boolean);

    if (candidateIds.some((cid) => learnerIdSet.has(cid))) return true;

    const rName = normLower(record.studentName || record.learnerName || record.fullName);
    if (rName && rName === learnerNameLower) {
      if (!learner.schoolName) return true;
      const rSchool = normLower(resolvePartnerSchoolName(record.schoolName || record.schoolId || ''));
      if (!rSchool || rSchool === normLower(learner.schoolName)) return true;
    }
    return false;
  };

  // Index exams by id
  const examDefinitionMap = new Map<string, { id: string; sourceCollection: 'jdiExams' | 'schoolExams'; data: Record<string, any> }>();
  jdiExamsDocs.forEach(({ id, data }) => examDefinitionMap.set(id, { id, sourceCollection: 'jdiExams', data }));
  schoolExamsDocs.forEach(({ id, data }) => {
    if (!examDefinitionMap.has(id)) {
      examDefinitionMap.set(id, { id, sourceCollection: 'schoolExams', data });
    }
  });

  const evidenceItems: AcademicEvidenceItem[] = [];

  // 1. Process Exam / Quiz / Test / Assignment Attempts (`jdiExamAttempts`)
  attemptsDocs.forEach(({ id, data }) => {
    if (!matchesLearner(data)) return;
    const examId = norm(data.examId || data.assessmentId || '');
    const examDef = examId ? examDefinitionMap.get(examId)?.data : null;

    const title = norm(data.examTitle || data.title || examDef?.title || 'Assessment');
    const subject = norm(data.subject || examDef?.subject || examDef?.course || learner.programName || 'General');
    const programName = norm(data.programName || examDef?.programName || examDef?.program || learner.programName);
    const workType = classifyAcademicWorkSourceType({
      workType: data.workType || examDef?.workType || examDef?.activityType || data.type,
      title,
    });

    const isUngraded = Boolean(data.isUngraded || examDef?.isUngraded);
    const maxMarks = Number(
      data.maxScore ||
        data.totalMarks ||
        data.maxMarks ||
        (examDef ? computeExamMaxScore(examDef) : 0) ||
        100
    );

    const rawEarned =
      data.totalScore !== undefined && data.totalScore !== null
        ? Number(data.totalScore)
        : data.score !== undefined && data.score !== null
        ? Number(data.score)
        : null;

    const statusToken = norm(data.status || '').toUpperCase();
    const isSubmitted = ['SUBMITTED', 'GRADED', 'COMPLETED', 'RELEASED'].includes(statusToken) || rawEarned !== null;
    const isPendingGrading =
      statusToken === 'PENDING_GRADING' ||
      statusToken === 'SUBMITTED_PENDING_REVIEW' ||
      (isSubmitted && rawEarned === null && !isUngraded);

    const released = isAttemptResultReleased(data, examDef || undefined);
    const normScore = normalizeScoreToPercentage(rawEarned, maxMarks);
    const completedAt =
      toIso(data.submittedAt || data.completedAt || data.gradedAt || data.updatedAt || data.startedAt) ||
      toIso(examDef?.dueDate || examDef?.createdAt);

    // Canonical Work ID links mirrored assignment/exam records so they are never double-counted
    const linkedAssignmentId = norm(data.assignmentId || examDef?.assignmentId || '');
    const canonicalWorkId = linkedAssignmentId
      ? `work_assign_${linkedAssignmentId}`
      : examId
      ? `work_exam_${examId}`
      : `work_attempt_${id}`;

    const refNo = norm(
      data.referenceNumber ||
        data.refNo ||
        data.reportRef ||
        formatDocumentRefNo('JDI', id)
    );

    evidenceItems.push({
      canonicalWorkId,
      sourceCollection: 'jdiExamAttempts',
      sourceId: id,
      examId: examId || undefined,
      attemptId: id,
      assignmentId: linkedAssignmentId || undefined,
      referenceNumber: refNo,
      title,
      subject,
      programName,
      workType,
      categoryId: '',
      categoryName: '',
      studentId: learner.id,
      studentName: learner.fullName,
      schoolId: learner.schoolId || undefined,
      className: learner.className,
      rawEarnedMarks: normScore.earned,
      maxAvailableMarks: maxMarks,
      normalizedPercentage: normScore.percentage,
      isUngraded,
      isReleased: released,
      status: isUngraded
        ? 'UNGRADED_ACTIVITY'
        : isPendingGrading
        ? 'PENDING_REVIEW'
        : normScore.valid
        ? 'GRADED'
        : 'PENDING_REVIEW',
      includedInCalculation: false,
      completedAt,
      dueDate: toIso(examDef?.dueDate || examDef?.endTime || data.dueDate),
      termKey: resolveTermForDate(completedAt, periodTerms || []),
      tutorFeedback: norm(data.tutorFeedback || data.feedback || data.remark || ''),
    });
  });

  // 2. Process Assignment Submissions (`assignmentSubmissions`)
  const submissionsByAssignment = new Map<string, Array<{ id: string; data: Record<string, any> }>>();
  submissionsDocs.forEach(({ id, data }) => {
    if (!matchesLearner(data)) return;
    const assignId = norm(data.assignmentId || data.workId || id);
    const list = submissionsByAssignment.get(assignId) || [];
    list.push({ id, data });
    submissionsByAssignment.set(assignId, list);
  });

  // 3. Process Assignments (`assignments`) + any standalone submissions
  const processedAssignmentIds = new Set<string>();
  assignmentsDocs.forEach(({ id, data }) => {
    const eligible =
      matchesLearner(data) ||
      isStudentEligibleForWork(data, {
        studentId: learner.id,
        allIds: learner.allIds,
        schoolId: learner.schoolId,
        schoolName: learner.schoolName,
        className: learner.className,
        isSchoolStudent: learner.enrolmentCategory === 'school',
      });

    if (!eligible) return;
    processedAssignmentIds.add(id);

    const linkedExamId = norm(data.examId || data.linkedExamId || '');
    const canonicalWorkId = linkedExamId ? `work_exam_${linkedExamId}` : `work_assign_${id}`;
    const subs = submissionsByAssignment.get(id) || [];
    const latestSub = subs[subs.length - 1]?.data;
    const latestSubId = subs[subs.length - 1]?.id;

    const title = norm(data.title || latestSub?.assignmentTitle || 'Assignment');
    const subject = norm(data.subject || data.course || learner.programName || 'General');
    const programName = norm(data.programName || data.program || learner.programName);
    const workType = classifyAcademicWorkSourceType({
      workType: data.activityType || data.workType || 'ASSIGNMENT',
      title,
    });
    const isUngraded = Boolean(data.isUngraded || latestSub?.isUngraded);
    const maxMarks = Number(data.maxMarks || data.totalMarks || latestSub?.maxMarks || 100);

    const rawGrade =
      latestSub?.grade !== undefined && latestSub?.grade !== null
        ? Number(latestSub.grade)
        : latestSub?.score !== undefined && latestSub?.score !== null
        ? Number(latestSub.score)
        : data.grade !== undefined && data.grade !== null && matchesLearner(data)
        ? Number(data.grade)
        : null;

    const statusToken = norm(latestSub?.status || data.status || '').toUpperCase();
    const hasSubmission = Boolean(
      latestSub ||
        ['SUBMITTED', 'GRADED', 'COMPLETED'].includes(statusToken) ||
        rawGrade !== null
    );

    const normScore = normalizeScoreToPercentage(rawGrade, maxMarks);
    const completedAt = toIso(
      latestSub?.gradedAt ||
        latestSub?.submittedAt ||
        latestSub?.updatedAt ||
        data.submittedAt ||
        data.gradedAt ||
        data.dueDate ||
        data.createdAt
    );
    const dueDate = toIso(data.dueDate || data.deadline);

    let itemStatus: AcademicEvidenceItem['status'] = 'MISSING';
    if (isUngraded && hasSubmission) {
      itemStatus = 'UNGRADED_ACTIVITY';
    } else if (normScore.valid && rawGrade !== null) {
      itemStatus = 'GRADED';
    } else if (hasSubmission) {
      itemStatus = 'PENDING_REVIEW';
    } else {
      itemStatus = 'MISSING';
    }

    const refNo = norm(
      latestSub?.referenceNumber ||
        data.referenceNumber ||
        formatDocumentRefNo('JDI', latestSubId || id)
    );

    evidenceItems.push({
      canonicalWorkId,
      sourceCollection: latestSub ? 'assignmentSubmissions' : 'assignments',
      sourceId: latestSubId || id,
      assignmentId: id,
      submissionId: latestSubId,
      examId: linkedExamId || undefined,
      referenceNumber: refNo,
      title,
      subject,
      programName,
      workType,
      categoryId: '',
      categoryName: '',
      studentId: learner.id,
      studentName: learner.fullName,
      schoolId: learner.schoolId || undefined,
      className: learner.className,
      rawEarnedMarks: normScore.earned,
      maxAvailableMarks: maxMarks,
      normalizedPercentage: normScore.percentage,
      isUngraded,
      isReleased: true,
      status: itemStatus,
      includedInCalculation: false,
      completedAt,
      dueDate,
      termKey: resolveTermForDate(completedAt || dueDate, periodTerms || []),
      tutorFeedback: norm(latestSub?.feedback || data.feedback || ''),
    });
  });

  // Standalone assignmentSubmissions whose parent doc wasn't in `assignments`
  submissionsByAssignment.forEach((subs, assignId) => {
    if (processedAssignmentIds.has(assignId)) return;
    const latest = subs[subs.length - 1];
    if (!latest) return;
    const { id, data } = latest;
    const title = norm(data.assignmentTitle || data.title || 'Submitted Coursework');
    const maxMarks = Number(data.maxMarks || data.totalMarks || 100);
    const rawGrade =
      data.grade !== undefined && data.grade !== null
        ? Number(data.grade)
        : data.score !== undefined && data.score !== null
        ? Number(data.score)
        : null;
    const normScore = normalizeScoreToPercentage(rawGrade, maxMarks);
    const completedAt = toIso(data.gradedAt || data.submittedAt || data.updatedAt || data.createdAt);

    evidenceItems.push({
      canonicalWorkId: `work_assign_${assignId}`,
      sourceCollection: 'assignmentSubmissions',
      sourceId: id,
      assignmentId: assignId,
      submissionId: id,
      referenceNumber: norm(data.referenceNumber || formatDocumentRefNo('JDI', id)),
      title,
      subject: norm(data.subject || learner.programName || 'General'),
      programName: norm(data.programName || learner.programName),
      workType: classifyAcademicWorkSourceType({ workType: data.activityType, title }),
      categoryId: '',
      categoryName: '',
      studentId: learner.id,
      studentName: learner.fullName,
      schoolId: learner.schoolId || undefined,
      className: learner.className,
      rawEarnedMarks: normScore.earned,
      maxAvailableMarks: maxMarks,
      normalizedPercentage: normScore.percentage,
      isUngraded: Boolean(data.isUngraded),
      isReleased: true,
      status: data.isUngraded
        ? 'UNGRADED_ACTIVITY'
        : normScore.valid
        ? 'GRADED'
        : 'PENDING_REVIEW',
      includedInCalculation: false,
      completedAt,
      dueDate: toIso(data.dueDate),
      termKey: resolveTermForDate(completedAt, periodTerms || []),
      tutorFeedback: norm(data.feedback || ''),
    });
  });

  // 4. Process direct `academic_assessments` records
  academicAssessmentsDocs.forEach(({ id, data }) => {
    if (!matchesLearner(data)) return;
    const linkedExamId = norm(data.examId || '');
    const linkedAttemptId = norm(data.attemptId || '');
    const canonicalWorkId = linkedExamId
      ? `work_exam_${linkedExamId}`
      : linkedAttemptId
      ? `work_attempt_${linkedAttemptId}`
      : `work_acad_${id}`;

    const title = norm(data.title || data.examTitle || data.assessmentName || 'Academic Assessment');
    const maxMarks = Number(data.maxScore || data.totalMarks || data.maxMarks || 100);
    const rawEarned =
      data.score !== undefined && data.score !== null
        ? Number(data.score)
        : data.totalScore !== undefined && data.totalScore !== null
        ? Number(data.totalScore)
        : null;
    const normScore = normalizeScoreToPercentage(rawEarned, maxMarks);
    const completedAt = toIso(data.completedAt || data.submittedAt || data.date || data.createdAt);

    evidenceItems.push({
      canonicalWorkId,
      sourceCollection: 'academic_assessments',
      sourceId: id,
      examId: linkedExamId || undefined,
      attemptId: linkedAttemptId || undefined,
      referenceNumber: norm(data.referenceNumber || data.refNo || formatDocumentRefNo('JDI', id)),
      title,
      subject: norm(data.subject || learner.programName || 'General'),
      programName: norm(data.programName || data.program || learner.programName),
      workType: classifyAcademicWorkSourceType({
        workType: data.workType || data.type || 'EXAMINATION',
        title,
      }),
      categoryId: '',
      categoryName: '',
      studentId: learner.id,
      studentName: learner.fullName,
      schoolId: learner.schoolId || undefined,
      className: learner.className,
      rawEarnedMarks: normScore.earned,
      maxAvailableMarks: maxMarks,
      normalizedPercentage: normScore.percentage,
      isUngraded: false,
      isReleased: data.released !== false,
      status: normScore.valid ? 'GRADED' : 'PENDING_REVIEW',
      includedInCalculation: false,
      completedAt,
      dueDate: toIso(data.dueDate),
      termKey: resolveTermForDate(completedAt, periodTerms || []),
      tutorFeedback: norm(data.feedback || data.remarks || ''),
    });
  });

  // 5. Consolidate Attendance Records (`attendance`)
  const attendanceRecords: AttendanceRecordItem[] = [];
  attendanceDocs.forEach(({ id, data }) => {
    if (matchesLearner(data)) {
      const dateStr = toIso(data.date || data.sessionDate || data.createdAt) || '';
      const rawStatus = norm(data.status || 'PRESENT').toUpperCase();
      const status: AttendanceRecordItem['status'] =
        rawStatus === 'ABSENT'
          ? 'ABSENT'
          : rawStatus === 'LATE'
          ? 'LATE'
          : rawStatus === 'EXCUSED'
          ? 'EXCUSED'
          : 'PRESENT';
      attendanceRecords.push({
        id,
        date: dateStr,
        status,
        title: norm(data.title || data.topic || data.className || 'Class Session'),
        notes: norm(data.notes || data.remark || ''),
      });
    } else if (Array.isArray(data.records || data.students || data.attendees)) {
      const roster: any[] = data.records || data.students || data.attendees;
      const entry = roster.find((r) => r && matchesLearner(r));
      if (entry) {
        const dateStr = toIso(data.date || data.sessionDate || data.createdAt) || '';
        const rawStatus = norm(entry.status || (entry.present ? 'PRESENT' : 'ABSENT')).toUpperCase();
        const status: AttendanceRecordItem['status'] =
          rawStatus === 'ABSENT'
            ? 'ABSENT'
            : rawStatus === 'LATE'
            ? 'LATE'
            : rawStatus === 'EXCUSED'
            ? 'EXCUSED'
            : 'PRESENT';
        attendanceRecords.push({
          id: `${id}_${learner.id}`,
          date: dateStr,
          status,
          title: norm(data.title || data.topic || 'Class Session'),
          notes: norm(entry.notes || entry.remark || ''),
        });
      }
    }
  });

  const buildAttendanceSummary = (records: AttendanceRecordItem[]): AttendancePeriodSummary => {
    const totalSessions = records.length;
    const presentCount = records.filter((r) => r.status === 'PRESENT').length;
    const lateCount = records.filter((r) => r.status === 'LATE').length;
    const excusedCount = records.filter((r) => r.status === 'EXCUSED').length;
    const absentCount = records.filter((r) => r.status === 'ABSENT').length;
    const effectiveTotal = Math.max(0, totalSessions - excusedCount);
    const attendanceRate =
      effectiveTotal > 0
        ? Math.round((((presentCount + lateCount * 0.75) / effectiveTotal) * 100) * 100) / 100
        : null;
    return {
      totalSessions,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      attendanceRate,
      records,
    };
  };

  const overallAttendance = buildAttendanceSummary(attendanceRecords);
  const attendanceByTerm: Record<AcademicTermKey, AttendancePeriodSummary> = {
    TERM_1: buildAttendanceSummary(
      attendanceRecords.filter((r) => resolveTermForDate(r.date, periodTerms || []) === 'TERM_1')
    ),
    TERM_2: buildAttendanceSummary(
      attendanceRecords.filter((r) => resolveTermForDate(r.date, periodTerms || []) === 'TERM_2')
    ),
    TERM_3: buildAttendanceSummary(
      attendanceRecords.filter((r) => resolveTermForDate(r.date, periodTerms || []) === 'TERM_3')
    ),
  };

  // 6. Consolidate Milestones (`milestones`)
  const milestoneItems: MilestoneRecordItem[] = [];
  milestonesDocs.forEach(({ id, data }) => {
    if (!matchesLearner(data)) return;
    const rawStatus = norm(data.status || '').toUpperCase();
    const status: MilestoneRecordItem['status'] =
      ['COMPLETED', 'DONE', 'ACHIEVED', 'PASSED', 'MASTERED'].includes(rawStatus) || data.completed === true
        ? 'COMPLETED'
        : ['IN_PROGRESS', 'ACTIVE', 'ONGOING'].includes(rawStatus)
        ? 'IN_PROGRESS'
        : 'PENDING';
    const skills = Array.isArray(data.skills)
      ? data.skills.map((s: any) => norm(s)).filter(Boolean)
      : data.skill
      ? [norm(data.skill)]
      : [];
    milestoneItems.push({
      id,
      title: norm(data.title || data.milestoneName || data.name || 'Learning Milestone'),
      moduleName: norm(data.moduleName || data.module || ''),
      programName: norm(data.programName || data.program || learner.programName),
      status,
      completedAt: toIso(data.completedAt || data.updatedAt || data.createdAt),
      skills,
      notes: norm(data.notes || data.description || ''),
    });
  });

  const completedMilestones = milestoneItems.filter((m) => m.status === 'COMPLETED');
  const inProgressMilestones = milestoneItems.filter((m) => m.status === 'IN_PROGRESS');
  const pendingMilestones = milestoneItems.filter((m) => m.status === 'PENDING');
  const milestoneSummary: MilestonePeriodSummary = {
    totalMilestones: milestoneItems.length,
    completedCount: completedMilestones.length,
    inProgressCount: inProgressMilestones.length,
    pendingCount: pendingMilestones.length,
    completionRate:
      milestoneItems.length > 0
        ? Math.round(((completedMilestones.length / milestoneItems.length) * 100) * 100) / 100
        : null,
    skillsAcquired: Array.from(
      new Set(completedMilestones.flatMap((m) => (m.skills && m.skills.length ? m.skills : [m.title])).filter(Boolean))
    ),
    items: milestoneItems,
  };

  return {
    evidenceItems,
    overallAttendance,
    attendanceByTerm,
    milestoneSummary,
  };
}

/**
 * Records an immutable audit entry in `academicAuditLogs`.
 */
export async function recordAcademicAuditLog(params: {
  actionType: AcademicAuditActionType;
  authority: ReportAuthorityContext;
  targetId: string;
  targetRef?: string;
  schoolId?: string;
  studentId?: string;
  programId?: string;
  summary: string;
  reason?: string;
  previousConfig?: Record<string, any> | null;
  newConfig?: Record<string, any> | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const entry: Omit<AcademicAuditLogEntry, 'id'> = {
    actionType: params.actionType,
    actorUid: params.authority.uid,
    actorName: params.authority.name,
    actorRole: params.authority.role,
    schoolId: params.schoolId || undefined,
    studentId: params.studentId || undefined,
    programId: params.programId || undefined,
    targetId: params.targetId,
    targetRef: params.targetRef || undefined,
    summary: params.summary,
    reason: params.reason || undefined,
    previousConfig: params.previousConfig || null,
    newConfig: params.newConfig || null,
    timestamp: now,
  };
  try {
    await addDoc(collection(db, 'academicAuditLogs'), entry);
  } catch {
    // Non-blocking if secondary rules restrict audit log write in offline preview
  }
}

export async function fetchAcademicAuditLogs(
  authority?: ReportAuthorityContext
): Promise<AcademicAuditLogEntry[]> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  assertGradingAndReportingAuthority(authCtx);
  const rows = await queryDocsAcrossDbs('academicAuditLogs');
  return rows
    .map(({ id, data }) => ({
      id,
      actionType: (data.actionType as AcademicAuditActionType) || 'REPORT_CALCULATED',
      actorUid: norm(data.actorUid),
      actorName: norm(data.actorName || 'Administrator'),
      actorRole: norm(data.actorRole || 'ADMIN'),
      schoolId: norm(data.schoolId) || undefined,
      studentId: norm(data.studentId) || undefined,
      programId: norm(data.programId) || undefined,
      targetId: norm(data.targetId),
      targetRef: norm(data.targetRef) || undefined,
      summary: norm(data.summary),
      reason: norm(data.reason) || undefined,
      previousConfig: data.previousConfig || null,
      newConfig: data.newConfig || null,
      timestamp: toIso(data.timestamp) || new Date().toISOString(),
    }))
    .filter((log) =>
      authCtx.isPlatformAdmin
        ? true
        : canTutorManageTarget(authCtx, {
            schoolId: log.schoolId,
            studentId: log.studentId,
          })
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Creates default starter academic periods so schools and private programmes have
 * an active 2026/2027 session with Terms 1, 2, and 3 ready out-of-the-box.
 */
export function createDefaultAcademicPeriods(actorUid = 'system', actorName = 'Jaystarbliss System'): AcademicPeriodRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'period_session_2026_2027',
      periodCategory: 'SCHOOL_SESSION',
      sessionName: '2026/2027 Academic Session',
      startDate: '2026-09-01',
      endDate: '2027-07-31',
      status: 'REPORTING_OPEN',
      terms: [
        {
          termKey: 'TERM_1',
          name: 'First Term',
          startDate: '2026-09-01',
          endDate: '2026-12-18',
          status: 'REPORTING_OPEN',
        },
        {
          termKey: 'TERM_2',
          name: 'Second Term',
          startDate: '2027-01-04',
          endDate: '2027-04-09',
          status: 'ACTIVE',
        },
        {
          termKey: 'TERM_3',
          name: 'Third Term',
          startDate: '2027-04-26',
          endDate: '2027-07-31',
          status: 'UPCOMING',
        },
      ],
      notes: 'Standard three-term school academic session calendar.',
      createdBy: actorUid,
      createdByName: actorName,
      updatedBy: actorUid,
      updatedByName: actorName,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'period_private_programme_2026',
      periodCategory: 'PRIVATE_PROGRAMME',
      sessionName: '2026/2027 Private Programme Cohort',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'REPORTING_OPEN',
      terms: [],
      notes: 'Rolling programme evaluation window for private learners.',
      createdBy: actorUid,
      createdByName: actorName,
      updatedBy: actorUid,
      updatedByName: actorName,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'period_private_annual_2026',
      periodCategory: 'PRIVATE_ANNUAL',
      sessionName: '2026/2027 Annual Private Academic Year',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'REPORTING_OPEN',
      terms: [],
      notes: 'Full 1-year academic evaluation period for private learners.',
      createdBy: actorUid,
      createdByName: actorName,
      updatedBy: actorUid,
      updatedByName: actorName,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export async function fetchAcademicPeriods(
  authority?: ReportAuthorityContext
): Promise<AcademicPeriodRecord[]> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  const rows = await queryDocsAcrossDbs('academicPeriods');
  const defaults = createDefaultAcademicPeriods(authCtx.uid, authCtx.name);

  const map = new Map<string, AcademicPeriodRecord>();
  defaults.forEach((d) => map.set(d.id, d));

  rows.forEach(({ id, data }) => {
    map.set(id, {
      id,
      periodCategory: data.periodCategory || 'SCHOOL_SESSION',
      sessionName: norm(data.sessionName || '2026/2027 Academic Session'),
      schoolId: norm(data.schoolId) || undefined,
      schoolName: norm(data.schoolName) || undefined,
      studentId: norm(data.studentId) || undefined,
      studentName: norm(data.studentName) || undefined,
      programId: norm(data.programId) || undefined,
      programName: norm(data.programName) || undefined,
      startDate: norm(data.startDate || '2026-09-01'),
      endDate: norm(data.endDate || '2027-07-31'),
      status: data.status || 'ACTIVE',
      terms: Array.isArray(data.terms) ? data.terms : [],
      notes: norm(data.notes) || undefined,
      createdBy: norm(data.createdBy || 'system'),
      createdByName: norm(data.createdByName || 'System'),
      updatedBy: norm(data.updatedBy || 'system'),
      updatedByName: norm(data.updatedByName || 'System'),
      createdAt: toIso(data.createdAt) || new Date().toISOString(),
      updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
    });
  });

  return Array.from(map.values()).filter((p) =>
    authCtx.isPlatformAdmin
      ? true
      : canTutorManageTarget(authCtx, {
          schoolId: p.schoolId,
          schoolName: p.schoolName,
          studentId: p.studentId,
        })
  );
}

export async function saveAcademicPeriod(
  period: Partial<AcademicPeriodRecord> & {
    periodCategory: AcademicPeriodRecord['periodCategory'];
    sessionName: string;
    startDate: string;
    endDate: string;
  },
  authority?: ReportAuthorityContext
): Promise<AcademicPeriodRecord> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  assertGradingAndReportingAuthority(authCtx, {
    schoolId: period.schoolId,
    schoolName: period.schoolName,
    studentId: period.studentId,
  });

  if (!period.startDate || !period.endDate || period.startDate > period.endDate) {
    throw new Error('Academic period start date must precede or equal the end date.');
  }

  const now = new Date().toISOString();
  const id = norm(period.id) || `period_${Date.now()}`;
  const defaultTerms: AcademicTermConfig[] =
    period.periodCategory === 'SCHOOL_SESSION' && (!period.terms || period.terms.length === 0)
      ? [
          {
            termKey: 'TERM_1',
            name: 'First Term',
            startDate: period.startDate,
            endDate: period.endDate,
            status: 'ACTIVE',
          },
          {
            termKey: 'TERM_2',
            name: 'Second Term',
            startDate: period.startDate,
            endDate: period.endDate,
            status: 'UPCOMING',
          },
          {
            termKey: 'TERM_3',
            name: 'Third Term',
            startDate: period.startDate,
            endDate: period.endDate,
            status: 'UPCOMING',
          },
        ]
      : period.terms || [];

  const record: AcademicPeriodRecord = {
    id,
    periodCategory: period.periodCategory,
    sessionName: norm(period.sessionName),
    schoolId: norm(period.schoolId) || undefined,
    schoolName: norm(period.schoolName) || undefined,
    studentId: norm(period.studentId) || undefined,
    studentName: norm(period.studentName) || undefined,
    programId: norm(period.programId) || undefined,
    programName: norm(period.programName) || undefined,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status || 'ACTIVE',
    terms: defaultTerms,
    notes: norm(period.notes) || undefined,
    createdBy: period.createdBy || authCtx.uid,
    createdByName: period.createdByName || authCtx.name,
    updatedBy: authCtx.uid,
    updatedByName: authCtx.name,
    createdAt: period.createdAt || now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'academicPeriods', id), JSON.parse(JSON.stringify(record)), { merge: true });
  await recordAcademicAuditLog({
    actionType: 'PERIOD_CONFIGURED',
    authority: authCtx,
    targetId: id,
    schoolId: record.schoolId,
    studentId: record.studentId,
    programId: record.programId,
    summary: `Configured academic period "${record.sessionName}" (${record.startDate} to ${record.endDate}).`,
    newConfig: record as any,
  });

  return record;
}

/**
 * Fetches all grading profiles (`academicGradingProfiles`) plus built-in starter presets.
 */
export async function fetchGradingProfiles(
  authority?: ReportAuthorityContext
): Promise<AcademicGradingProfile[]> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  const rows = await queryDocsAcrossDbs('academicGradingProfiles');
  const starters = createStarterGradingProfiles(authCtx.uid, authCtx.name);

  const map = new Map<string, AcademicGradingProfile>();
  starters.forEach((s) => map.set(s.id, s));

  rows.forEach(({ id, data }) => {
    map.set(id, {
      id,
      name: norm(data.name || 'Custom Grading Profile'),
      description: norm(data.description) || undefined,
      scopeType: data.scopeType || 'SCHOOL',
      enrolmentTarget: data.enrolmentTarget || 'ALL',
      schoolId: norm(data.schoolId) || undefined,
      schoolName: norm(data.schoolName) || undefined,
      className: norm(data.className) || undefined,
      programId: norm(data.programId) || undefined,
      programName: norm(data.programName) || undefined,
      studentId: norm(data.studentId) || undefined,
      studentName: norm(data.studentName) || undefined,
      parentProfileId: norm(data.parentProfileId) || undefined,
      parentProfileName: norm(data.parentProfileName) || undefined,
      overrideReason: norm(data.overrideReason) || undefined,
      version: Number(data.version || 1),
      categories: Array.isArray(data.categories) ? data.categories : starters[0].categories,
      gradeBoundaries: Array.isArray(data.gradeBoundaries)
        ? data.gradeBoundaries
        : starters[0].gradeBoundaries,
      passMark: Number(data.passMark ?? 45),
      missingWorkPolicy: data.missingWorkPolicy || 'FLAG_INCOMPLETE',
      emptyCategoryPolicy: data.emptyCategoryPolicy || 'RETAIN_AND_FLAG',
      sessionCalculationMethod: data.sessionCalculationMethod || 'EQUAL_TERM_WEIGHTS',
      termWeights: data.termWeights || { TERM_1: 33.33, TERM_2: 33.33, TERM_3: 33.34 },
      includeAttendanceInGrade: Boolean(data.includeAttendanceInGrade),
      attendanceWeight: Number(data.attendanceWeight || 0),
      isDefaultPreset: Boolean(data.isDefaultPreset),
      createdBy: norm(data.createdBy || 'system'),
      createdByName: norm(data.createdByName || 'System'),
      updatedBy: norm(data.updatedBy || 'system'),
      updatedByName: norm(data.updatedByName || 'System'),
      createdAt: toIso(data.createdAt) || new Date().toISOString(),
      updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
    });
  });

  return Array.from(map.values()).filter((p) =>
    authCtx.isPlatformAdmin || p.isDefaultPreset
      ? true
      : canTutorManageTarget(authCtx, {
          schoolId: p.schoolId,
          schoolName: p.schoolName,
          studentId: p.studentId,
        })
  );
}

/**
 * Validates and saves a grading profile (`academicGradingProfiles`).
 * Increments `version` automatically on updates so historical issued reports retain their exact profile version.
 */
export async function saveGradingProfile(
  profileInput: Partial<AcademicGradingProfile> & {
    name: string;
    scopeType: AcademicGradingProfile['scopeType'];
    categories: AcademicGradingProfile['categories'];
    gradeBoundaries: AcademicGradingProfile['gradeBoundaries'];
  },
  authority?: ReportAuthorityContext
): Promise<AcademicGradingProfile> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  assertGradingAndReportingAuthority(authCtx, {
    schoolId: profileInput.schoolId,
    schoolName: profileInput.schoolName,
    studentId: profileInput.studentId,
  });

  const weightValidation = validateCategoryWeights(
    profileInput.categories,
    Boolean(profileInput.includeAttendanceInGrade),
    Number(profileInput.attendanceWeight || 0)
  );
  if (!weightValidation.valid) {
    throw new Error(weightValidation.error || 'Category weights must total 100%.');
  }

  const boundaryValidation = validateGradeBoundaries(profileInput.gradeBoundaries);
  if (!boundaryValidation.valid) {
    throw new Error(boundaryValidation.error || 'Invalid grade boundaries.');
  }

  const now = new Date().toISOString();
  const isExisting = Boolean(profileInput.id && !profileInput.id.startsWith('preset_'));
  const id = isExisting ? norm(profileInput.id) : `gprof_${Date.now()}`;

  let previousDoc: AcademicGradingProfile | null = null;
  if (isExisting) {
    try {
      const snap = await getDoc(doc(db, 'academicGradingProfiles', id));
      if (snap.exists()) {
        previousDoc = snap.data() as AcademicGradingProfile;
      }
    } catch {
      // ignore
    }
  }

  const nextVersion = previousDoc ? Number(previousDoc.version || 1) + 1 : 1;
  const record: AcademicGradingProfile = {
    id,
    name: norm(profileInput.name),
    description: norm(profileInput.description) || undefined,
    scopeType: profileInput.scopeType,
    enrolmentTarget:
      profileInput.enrolmentTarget ||
      (profileInput.scopeType === 'PROGRAMME' ? 'PRIVATE' : 'SCHOOL'),
    schoolId: norm(profileInput.schoolId) || undefined,
    schoolName: norm(profileInput.schoolName) || undefined,
    className: norm(profileInput.className) || undefined,
    programId: norm(profileInput.programId) || undefined,
    programName: norm(profileInput.programName) || undefined,
    studentId: norm(profileInput.studentId) || undefined,
    studentName: norm(profileInput.studentName) || undefined,
    parentProfileId: norm(profileInput.parentProfileId) || undefined,
    parentProfileName: norm(profileInput.parentProfileName) || undefined,
    overrideReason: norm(profileInput.overrideReason) || undefined,
    version: nextVersion,
    categories: profileInput.categories,
    gradeBoundaries: profileInput.gradeBoundaries,
    passMark: Number(profileInput.passMark ?? 45),
    missingWorkPolicy: profileInput.missingWorkPolicy || 'FLAG_INCOMPLETE',
    emptyCategoryPolicy: profileInput.emptyCategoryPolicy || 'RETAIN_AND_FLAG',
    sessionCalculationMethod: profileInput.sessionCalculationMethod || 'EQUAL_TERM_WEIGHTS',
    termWeights: profileInput.termWeights || { TERM_1: 33.33, TERM_2: 33.33, TERM_3: 33.34 },
    includeAttendanceInGrade: Boolean(profileInput.includeAttendanceInGrade),
    attendanceWeight: Number(profileInput.attendanceWeight || 0),
    isDefaultPreset: false,
    createdBy: previousDoc?.createdBy || authCtx.uid,
    createdByName: previousDoc?.createdByName || authCtx.name,
    updatedBy: authCtx.uid,
    updatedByName: authCtx.name,
    createdAt: previousDoc?.createdAt || now,
    updatedAt: now,
  };

  await setDoc(
    doc(db, 'academicGradingProfiles', id),
    JSON.parse(JSON.stringify(record)),
    { merge: true }
  );

  await recordAcademicAuditLog({
    actionType:
      record.scopeType === 'LEARNER_OVERRIDE'
        ? 'LEARNER_OVERRIDE_CREATED'
        : previousDoc
        ? 'PROFILE_UPDATED'
        : 'PROFILE_CREATED',
    authority: authCtx,
    targetId: id,
    schoolId: record.schoolId,
    studentId: record.studentId,
    programId: record.programId,
    summary: `${previousDoc ? 'Updated' : 'Created'} grading profile "${record.name}" (v${record.version}, scope: ${record.scopeType}).`,
    reason: record.overrideReason,
    previousConfig: previousDoc as any,
    newConfig: record as any,
  });

  return record;
}

/**
 * Resets an individual learner override back to the default class/school/programme grading profile.
 */
export async function resetLearnerGradingOverride(
  studentId: string,
  authority?: ReportAuthorityContext
): Promise<void> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  assertGradingAndReportingAuthority(authCtx, { studentId });

  const profiles = await fetchGradingProfiles(authCtx);
  const overrides = profiles.filter(
    (p) => p.scopeType === 'LEARNER_OVERRIDE' && norm(p.studentId) === norm(studentId)
  );

  for (const ov of overrides) {
    try {
      await setDoc(
        doc(db, 'academicGradingProfiles', ov.id),
        {
          ...ov,
          scopeType: 'ARCHIVED_OVERRIDE',
          studentId: '',
          updatedBy: authCtx.uid,
          updatedByName: authCtx.name,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await recordAcademicAuditLog({
        actionType: 'LEARNER_OVERRIDE_RESET',
        authority: authCtx,
        targetId: ov.id,
        studentId,
        summary: `Reset individual grading override "${ov.name}" for learner ${ov.studentName || studentId} back to default profile.`,
        previousConfig: ov as any,
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Resolves the most specific applicable grading profile for a learner:
 * 1. Explicit `selectedProfileId` (unless the learner has an active `LEARNER_OVERRIDE`).
 * 2. Active `LEARNER_OVERRIDE` matching `learner.id`.
 * 3. `CLASS` profile matching learner's school + class.
 * 4. `SCHOOL` profile matching learner's school.
 * 5. `PROGRAMME` profile matching learner's programme.
 * 6. Built-in starter preset (`preset_school_standard` or `preset_private_programme`).
 */
export function resolveEffectiveGradingProfileForLearner(
  learner: ReportingLearnerDirectoryItem,
  allProfiles: AcademicGradingProfile[],
  preferredProfileId?: string
): AcademicGradingProfile {
  const learnerOverride = allProfiles.find(
    (p) =>
      p.scopeType === 'LEARNER_OVERRIDE' &&
      p.studentId &&
      learner.allIds.some((id) => id.toLowerCase() === p.studentId!.toLowerCase())
  );
  if (learnerOverride) return learnerOverride;

  if (preferredProfileId) {
    const explicit = allProfiles.find((p) => p.id === preferredProfileId);
    if (explicit) return explicit;
  }

  if (learner.enrolmentCategory === 'school') {
    const classMatch = allProfiles.find(
      (p) =>
        p.scopeType === 'CLASS' &&
        (normLower(p.schoolId) === normLower(learner.schoolId) ||
          normLower(p.schoolName) === normLower(learner.schoolName)) &&
        classesMatch(p.className || '', learner.className)
    );
    if (classMatch) return classMatch;

    const schoolMatch = allProfiles.find(
      (p) =>
        p.scopeType === 'SCHOOL' &&
        !p.isDefaultPreset &&
        (normLower(p.schoolId) === normLower(learner.schoolId) ||
          normLower(p.schoolName) === normLower(learner.schoolName))
    );
    if (schoolMatch) return schoolMatch;

    return (
      allProfiles.find((p) => p.id === 'preset_school_standard') ||
      createStarterGradingProfiles()[0]
    );
  }

  const progMatch = allProfiles.find(
    (p) =>
      p.scopeType === 'PROGRAMME' &&
      !p.isDefaultPreset &&
      (normLower(p.programId) === normLower(learner.programId) ||
        normLower(p.programName) === normLower(learner.programName))
  );
  if (progMatch) return progMatch;

  return (
    allProfiles.find((p) => p.id === 'preset_private_programme') ||
    createStarterGradingProfiles()[1]
  );
}

/**
 * Builds and previews a complete official performance report snapshot for a learner.
 */
export async function buildAndPreviewLearnerReport(params: {
  reportType: AcademicReportType;
  learner: ReportingLearnerDirectoryItem;
  period: AcademicPeriodRecord;
  termKey?: AcademicTermKey;
  gradingProfile: AcademicGradingProfile;
  includeOptions: ReportContentInclusionOptions;
  tutorRemarks?: Partial<TutorReportRemarks>;
  approveWeightRedistribution?: boolean;
  redistributionReason?: string;
  existingReportId?: string;
  existingReportRef?: string;
  version?: number;
  supersedesReportId?: string | null;
  supersedesReportRef?: string | null;
  correctionReason?: string | null;
  authority?: ReportAuthorityContext;
}): Promise<AcademicPerformanceReportSnapshot> {
  const authCtx = params.authority || (await resolveReportAuthorityContext());
  assertGradingAndReportingAuthority(authCtx, {
    schoolId: params.learner.schoolId,
    schoolName: params.learner.schoolName,
    studentId: params.learner.id,
  });

  const {
    reportType,
    learner,
    period,
    termKey,
    gradingProfile,
    includeOptions,
    approveWeightRedistribution = false,
    redistributionReason,
    version = 1,
  } = params;

  const consolidated = await consolidateLearnerAcademicData(learner, period.terms);

  // Filter evidence items according to includeOptions toggles
  const filteredEvidence = consolidated.evidenceItems.filter((item) => {
    if (!includeOptions.includeAssignmentsAndProjects && ['ASSIGNMENT', 'PROJECT'].includes(item.workType)) {
      return false;
    }
    if (!includeOptions.includeActivities && ['ACTIVITY', 'PRACTICAL'].includes(item.workType)) {
      return false;
    }
    if (
      !includeOptions.includeDetailedAssessments &&
      ['QUIZ', 'TEST', 'MID_TERM', 'EXAMINATION'].includes(item.workType)
    ) {
      return false;
    }
    return true;
  });

  // Determine exact date bounds
  let periodStartDate = period.startDate;
  let periodEndDate = period.endDate;
  let termName: string | undefined;
  let periodLabel = period.sessionName;

  if (reportType === 'SCHOOL_TERM') {
    const selectedTerm =
      (period.terms || []).find((t) => t.termKey === (termKey || 'TERM_1')) || period.terms?.[0];
    if (selectedTerm) {
      periodStartDate = selectedTerm.startDate;
      periodEndDate = selectedTerm.endDate;
      termName = selectedTerm.name;
      periodLabel = `${selectedTerm.name} — ${period.sessionName}`;
    }
  } else if (reportType === 'SCHOOL_SESSION') {
    periodLabel = `Annual Session (${period.sessionName})`;
  } else if (reportType === 'PRIVATE_PROGRAMME') {
    periodLabel = `${learner.programName} Programme (${period.startDate} to ${period.endDate})`;
  } else if (reportType === 'PRIVATE_ANNUAL') {
    periodLabel = `Annual Academic Evaluation (${period.startDate} to ${period.endDate})`;
  }

  let calcResult: ReturnType<typeof calculatePeriodAcademicPerformance>;
  let termBreakdowns: AcademicPerformanceReportSnapshot['termBreakdowns'];
  let activeAttendance = consolidated.overallAttendance;

  if (reportType === 'SCHOOL_SESSION') {
    const sessionCalc = calculateSessionThreeTermPerformance({
      evidenceItems: filteredEvidence,
      profile: gradingProfile,
      terms: period.terms || [],
      sessionStartDate: periodStartDate,
      sessionEndDate: periodEndDate,
      attendanceByTerm: consolidated.attendanceByTerm,
      overallAttendance: consolidated.overallAttendance,
      milestoneSummary: consolidated.milestoneSummary,
      approveWeightRedistribution,
      redistributionApprovedBy: approveWeightRedistribution ? authCtx.name : undefined,
    });
    calcResult = sessionCalc;
    termBreakdowns = sessionCalc.termBreakdowns;
  } else {
    if (reportType === 'SCHOOL_TERM' && termKey && consolidated.attendanceByTerm[termKey]) {
      activeAttendance = consolidated.attendanceByTerm[termKey];
    }
    calcResult = calculatePeriodAcademicPerformance({
      evidenceItems: filteredEvidence,
      profile: gradingProfile,
      periodStartDate,
      periodEndDate,
      attendanceSummary: activeAttendance,
      milestoneSummary: consolidated.milestoneSummary,
      approveWeightRedistribution,
      redistributionApprovedBy: approveWeightRedistribution ? authCtx.name : undefined,
      redistributionReason,
    });
  }

  const reportRef = allocateReportReferenceNumber({
    existingRef: params.existingReportRef,
    reportType,
    studentId: learner.id,
    periodId: period.id,
    programId: learner.programId,
    termKey: reportType === 'SCHOOL_TERM' ? termKey || 'TERM_1' : undefined,
    version,
  });

  const normalizedRef = normalizeReferenceCode(reportRef);
  const reportId =
    params.existingReportId ||
    `rpt_${reportType.toLowerCase()}_${learner.id}_${period.id}_${termKey || 'all'}_v${version}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );

  // Build authentic default tutor remarks based strictly on calculated performance (never inventing fake awards)
  const pct = calcResult.overallPercentage;
  const defaultRemarks: TutorReportRemarks = {
    strengths:
      params.tutorRemarks?.strengths ??
      (pct !== null && pct >= 70
        ? `Demonstrated strong analytical and practical proficiency across evaluated ${learner.programName} modules.`
        : pct !== null && pct >= 50
        ? `Showed steady engagement and foundational competence in ${learner.programName} coursework.`
        : 'Participated in scheduled learning activities during the reporting period.'),
    areasForImprovement:
      params.tutorRemarks?.areasForImprovement ??
      (calcResult.calculationBreakdown.pendingReviewCount > 0 ||
      calcResult.calculationBreakdown.missingWorkCount > 0
        ? 'Ensure all pending assignments and practical deliverables are submitted promptly before deadline.'
        : 'Continue practicing independent problem-solving and code debugging exercises.'),
    generalFeedback:
      params.tutorRemarks?.generalFeedback ??
      (pct !== null
        ? `Achieved an overall weighted score of ${pct.toFixed(1)}% (Grade ${calcResult.overallGrade} — ${calcResult.classification}) across ${calcResult.calculationBreakdown.includedRecordsCount} graded record(s).`
        : 'Official numerical grade is pending completion and grading of required assessment categories.'),
    nextStageRecommendation:
      params.tutorRemarks?.nextStageRecommendation ??
      (calcResult.isPass
        ? 'Recommended to progress to the next curriculum module / academic stage.'
        : 'Recommended for targeted revision and guided practical reinforcement.'),
    completionRecommendation:
      params.tutorRemarks?.completionRecommendation ??
      (calcResult.isComplete && calcResult.isPass ? 'COMPLETED' : 'IN_PROGRESS'),
    certifiedCompleted:
      params.tutorRemarks?.certifiedCompleted ??
      Boolean(
        reportType === 'PRIVATE_PROGRAMME' &&
          calcResult.isComplete &&
          calcResult.isPass &&
          pct !== null &&
          pct >= gradingProfile.passMark
      ),
  };

  const now = new Date().toISOString();
  const snapshot: AcademicPerformanceReportSnapshot = {
    id: reportId,
    reportRef,
    normalizedRef,
    reportType,
    status: 'DRAFT',
    version,
    supersedesReportId: params.supersedesReportId || null,
    supersedesReportRef: params.supersedesReportRef || null,
    supersededByReportId: null,
    correctionReason: params.correctionReason || null,

    studentId: learner.id,
    studentName: learner.fullName,
    studentCode: learner.studentCode,
    studentEmail: learner.email || undefined,
    enrolmentCategory: learner.enrolmentCategory,
    enrolmentLabel: learner.enrolmentLabel,
    schoolId: learner.schoolId || undefined,
    schoolName: learner.schoolName || undefined,
    className: learner.className,
    programId: learner.programId,
    programName: learner.programName,
    programStartDate: learner.programStartDate || periodStartDate,
    programCompletionDate: learner.programCompletionDate || periodEndDate,
    assignedTutorId: learner.assignedTutorId,
    assignedTutorName: learner.assignedTutorName || authCtx.name,
    parentId: learner.parentId,
    parentName: learner.parentName,

    periodId: period.id,
    periodLabel,
    sessionName: period.sessionName,
    termKey: reportType === 'SCHOOL_TERM' ? termKey || 'TERM_1' : undefined,
    termName,
    periodStartDate,
    periodEndDate,

    gradingProfileId: gradingProfile.id,
    gradingProfileName: gradingProfile.name,
    gradingProfileVersion: gradingProfile.version,
    gradingProfileScope: gradingProfile.scopeType,
    isLearnerOverride: gradingProfile.scopeType === 'LEARNER_OVERRIDE',
    gradingProfileSnapshot: gradingProfile,

    overallPercentage: calcResult.overallPercentage,
    overallGrade: calcResult.overallGrade,
    classification: calcResult.classification,
    isPass: calcResult.isPass,
    isComplete: calcResult.isComplete,
    calculationBreakdown: calcResult.calculationBreakdown,
    termBreakdowns,
    subjectBreakdowns: calcResult.subjectBreakdowns,
    programmeBreakdowns: calcResult.programmeBreakdowns,
    attendanceSummary: activeAttendance,
    milestoneSummary: consolidated.milestoneSummary,
    tutorRemarks: defaultRemarks,
    includeOptions,

    generatedBy: authCtx.uid,
    generatedByName: authCtx.name,
    generatedByRole: authCtx.role,
    generatedAt: now,
    issuedBy: null,
    issuedByName: null,
    issuedByRole: null,
    issuedAt: null,
    updatedAt: now,
  };

  return snapshot;
}

/**
 * Indexes a report or assessment reference in `academicReferenceIndex` for fast lookup.
 */
async function indexAcademicReference(params: {
  refNo: string;
  recordType: AcademicReferenceLookupItem['recordType'];
  recordTypeLabel: string;
  title: string;
  studentId?: string;
  studentName: string;
  enrolmentCategory: AcademicReferenceLookupItem['enrolmentCategory'];
  enrolmentLabel: string;
  schoolId?: string;
  schoolName?: string;
  className: string;
  programName: string;
  periodLabel: string;
  generatedAt: string;
  status: string;
  scoreSummary: string;
  percentage: number | null;
  grade: string;
  version: number;
  sourceCollection: string;
  sourceId: string;
}): Promise<void> {
  const normalizedRef = normalizeReferenceCode(params.refNo);
  if (!normalizedRef) return;
  try {
    await setDoc(
      doc(db, 'academicReferenceIndex', normalizedRef),
      JSON.parse(
        JSON.stringify({
          ...params,
          normalizedRef,
          updatedAt: new Date().toISOString(),
        })
      ),
      { merge: true }
    );
  } catch {
    // non-fatal if index collection is offline
  }
}

export function getReportTypeLabel(reportType: AcademicReportType): string {
  switch (reportType) {
    case 'SCHOOL_TERM':
      return 'End-of-Term Report (School Learner)';
    case 'SCHOOL_SESSION':
      return 'End-of-Session Report (School Learner)';
    case 'PRIVATE_PROGRAMME':
      return 'End-of-Programme Report (Private Learner)';
    case 'PRIVATE_ANNUAL':
      return 'End-of-Year Academic Report (Private Learner)';
  }
}

export function getLookupClassificationForReportType(
  reportType: AcademicReportType
): AcademicReferenceLookupItem['recordType'] {
  switch (reportType) {
    case 'SCHOOL_TERM':
      return 'SCHOOL_TERM_REPORT';
    case 'SCHOOL_SESSION':
      return 'SCHOOL_SESSION_REPORT';
    case 'PRIVATE_PROGRAMME':
      return 'PRIVATE_PROGRAMME_REPORT';
    case 'PRIVATE_ANNUAL':
      return 'PRIVATE_ANNUAL_REPORT';
  }
}

/**
 * Persists a report snapshot (`DRAFT`, `REVIEWED`, or `ISSUED`) to `academicPerformanceReports`
 * and updates `academicReferenceIndex`.
 */
export async function saveReportSnapshot(
  snapshot: AcademicPerformanceReportSnapshot,
  targetStatus: AcademicPerformanceReportSnapshot['status'] = 'DRAFT',
  authority?: ReportAuthorityContext
): Promise<AcademicPerformanceReportSnapshot> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  assertGradingAndReportingAuthority(authCtx, {
    schoolId: snapshot.schoolId,
    schoolName: snapshot.schoolName,
    studentId: snapshot.studentId,
  });

  const now = new Date().toISOString();
  const updated: AcademicPerformanceReportSnapshot = {
    ...snapshot,
    status: targetStatus,
    issuedBy: targetStatus === 'ISSUED' ? authCtx.uid : snapshot.issuedBy || null,
    issuedByName: targetStatus === 'ISSUED' ? authCtx.name : snapshot.issuedByName || null,
    issuedByRole: targetStatus === 'ISSUED' ? authCtx.role : snapshot.issuedByRole || null,
    issuedAt: targetStatus === 'ISSUED' ? now : snapshot.issuedAt || null,
    updatedAt: now,
  };

  await setDoc(
    doc(db, 'academicPerformanceReports', updated.id),
    JSON.parse(JSON.stringify(updated)),
    { merge: true }
  );

  await indexAcademicReference({
    refNo: updated.reportRef,
    recordType: getLookupClassificationForReportType(updated.reportType),
    recordTypeLabel: getReportTypeLabel(updated.reportType),
    title: `${getReportTypeLabel(updated.reportType)} — ${updated.periodLabel}`,
    studentId: updated.studentId,
    studentName: updated.studentName,
    enrolmentCategory: updated.enrolmentCategory,
    enrolmentLabel: updated.enrolmentLabel,
    schoolId: updated.schoolId,
    schoolName: updated.schoolName,
    className: updated.className,
    programName: updated.programName,
    periodLabel: updated.periodLabel,
    generatedAt: updated.issuedAt || updated.generatedAt,
    status: updated.status,
    scoreSummary:
      updated.overallPercentage !== null
        ? `${updated.overallPercentage.toFixed(1)}% (${updated.overallGrade})`
        : 'Incomplete / Pending',
    percentage: updated.overallPercentage,
    grade: updated.overallGrade,
    version: updated.version,
    sourceCollection: 'academicPerformanceReports',
    sourceId: updated.id,
  });

  if (updated.calculationBreakdown.weightRedistributed) {
    await recordAcademicAuditLog({
      actionType: 'WEIGHT_REDISTRIBUTION_APPROVED',
      authority: authCtx,
      targetId: updated.id,
      targetRef: updated.reportRef,
      schoolId: updated.schoolId,
      studentId: updated.studentId,
      programId: updated.programId,
      summary: `Approved empty-category weight redistribution for ${updated.studentName} (${updated.reportRef}).`,
      reason: updated.calculationBreakdown.redistributionReason || 'Confirmed during report generation',
    });
  }

  await recordAcademicAuditLog({
    actionType: targetStatus === 'ISSUED' ? 'REPORT_ISSUED' : 'REPORT_CALCULATED',
    authority: authCtx,
    targetId: updated.id,
    targetRef: updated.reportRef,
    schoolId: updated.schoolId,
    studentId: updated.studentId,
    programId: updated.programId,
    summary: `${targetStatus === 'ISSUED' ? 'Officially issued' : 'Saved'} ${getReportTypeLabel(
      updated.reportType
    )} for ${updated.studentName} [Ref: ${updated.reportRef}, v${updated.version}].`,
  });

  return updated;
}

/**
 * Issues a batch of official reports, persisting their immutable snapshots and references.
 */
export async function issueOfficialReportsBatch(
  snapshots: AcademicPerformanceReportSnapshot[],
  authority?: ReportAuthorityContext
): Promise<AcademicPerformanceReportSnapshot[]> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  const issued: AcademicPerformanceReportSnapshot[] = [];
  for (const snap of snapshots) {
    const saved = await saveReportSnapshot(snap, 'ISSUED', authCtx);
    issued.push(saved);
  }
  return issued;
}

/**
 * Creates a versioned correction (`v2`, `v3`, etc.) of an already issued report without
 * silently overwriting the previous official snapshot. Marks the previous snapshot as `SUPERSEDED`
 * while preserving it in history.
 */
export async function createCorrectedReportVersion(params: {
  previousReport: AcademicPerformanceReportSnapshot;
  correctionReason: string;
  updatedTutorRemarks?: Partial<TutorReportRemarks>;
  updatedGradingProfile?: AcademicGradingProfile;
  approveWeightRedistribution?: boolean;
  authority?: ReportAuthorityContext;
}): Promise<AcademicPerformanceReportSnapshot> {
  const authCtx = params.authority || (await resolveReportAuthorityContext());
  const { previousReport, correctionReason } = params;

  assertGradingAndReportingAuthority(authCtx, {
    schoolId: previousReport.schoolId,
    schoolName: previousReport.schoolName,
    studentId: previousReport.studentId,
  });

  if (!norm(correctionReason)) {
    throw new Error('A clear correction reason is required to issue a revised official report.');
  }

  const directory = await fetchReportingLearnersAndSchools(authCtx);
  const learner: ReportingLearnerDirectoryItem =
    directory.learners.find((l) => l.id === previousReport.studentId) || {
      id: previousReport.studentId,
      allIds: [previousReport.studentId],
      fullName: previousReport.studentName,
      studentCode: previousReport.studentCode || previousReport.studentId.slice(0, 8).toUpperCase(),
      email: previousReport.studentEmail || '',
      enrolmentCategory: previousReport.enrolmentCategory,
      enrolmentLabel: previousReport.enrolmentLabel,
      schoolId: previousReport.schoolId || '',
      schoolName: previousReport.schoolName || '',
      className: previousReport.className,
      programId: previousReport.programId || 'programme',
      programName: previousReport.programName,
      programStartDate: previousReport.programStartDate,
      programCompletionDate: previousReport.programCompletionDate,
      assignedTutorId: previousReport.assignedTutorId,
      assignedTutorName: previousReport.assignedTutorName,
      parentId: previousReport.parentId,
      parentName: previousReport.parentName,
    };

  const periods = await fetchAcademicPeriods(authCtx);
  const period: AcademicPeriodRecord =
    periods.find((p) => p.id === previousReport.periodId) || {
      id: previousReport.periodId,
      periodCategory:
        previousReport.reportType === 'PRIVATE_PROGRAMME'
          ? 'PRIVATE_PROGRAMME'
          : previousReport.reportType === 'PRIVATE_ANNUAL'
          ? 'PRIVATE_ANNUAL'
          : 'SCHOOL_SESSION',
      sessionName: previousReport.sessionName,
      startDate: previousReport.periodStartDate,
      endDate: previousReport.periodEndDate,
      status: 'REPORTING_OPEN',
      terms: [],
      createdBy: authCtx.uid,
      createdByName: authCtx.name,
      updatedBy: authCtx.uid,
      updatedByName: authCtx.name,
      createdAt: previousReport.generatedAt,
      updatedAt: new Date().toISOString(),
    };

  const nextVersion = Number(previousReport.version || 1) + 1;
  const newDraft = await buildAndPreviewLearnerReport({
    reportType: previousReport.reportType,
    learner,
    period,
    termKey: previousReport.termKey,
    gradingProfile: params.updatedGradingProfile || previousReport.gradingProfileSnapshot,
    includeOptions: previousReport.includeOptions,
    tutorRemarks: {
      ...previousReport.tutorRemarks,
      ...(params.updatedTutorRemarks || {}),
    },
    approveWeightRedistribution:
      params.approveWeightRedistribution ?? previousReport.calculationBreakdown.weightRedistributed,
    redistributionReason: correctionReason,
    version: nextVersion,
    supersedesReportId: previousReport.id,
    supersedesReportRef: previousReport.reportRef,
    correctionReason: norm(correctionReason),
    authority: authCtx,
  });

  // Issue the new version
  const issuedNew = await saveReportSnapshot(newDraft, 'ISSUED', authCtx);

  // Mark previous version as SUPERSEDED (without deleting or mutating its historical metrics)
  const supersededPrev: AcademicPerformanceReportSnapshot = {
    ...previousReport,
    status: 'SUPERSEDED',
    supersededByReportId: issuedNew.id,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(
    doc(db, 'academicPerformanceReports', previousReport.id),
    JSON.parse(JSON.stringify(supersededPrev)),
    { merge: true }
  );

  await recordAcademicAuditLog({
    actionType: 'REPORT_CORRECTED_REISSUED',
    authority: authCtx,
    targetId: issuedNew.id,
    targetRef: issuedNew.reportRef,
    schoolId: issuedNew.schoolId,
    studentId: issuedNew.studentId,
    programId: issuedNew.programId,
    summary: `Issued corrected version v${nextVersion} (${issuedNew.reportRef}) superseding v${previousReport.version} (${previousReport.reportRef}) for ${issuedNew.studentName}.`,
    reason: norm(correctionReason),
  });

  return issuedNew;
}

/**
 * Fetches official performance reports filtered by the current viewer's RBAC permissions.
 */
export async function fetchAcademicReports(options?: {
  includeDraftsAndSuperseded?: boolean;
  schoolId?: string;
  studentId?: string;
  reportType?: AcademicReportType;
  authority?: ReportAuthorityContext;
}): Promise<AcademicPerformanceReportSnapshot[]> {
  const authCtx = options?.authority || (await resolveReportAuthorityContext());
  const rows = await queryDocsAcrossDbs('academicPerformanceReports');

  return rows
    .map(({ id, data }) => ({
      ...(data as AcademicPerformanceReportSnapshot),
      id: norm(data.id || id),
    }))
    .filter((report) => {
      if (!canUserViewReportSnapshot(authCtx, report)) return false;
      if (!options?.includeDraftsAndSuperseded && report.status !== 'ISSUED') return false;
      if (options?.schoolId && normLower(report.schoolId) !== normLower(options.schoolId) && normLower(report.schoolName) !== normLower(options.schoolId)) {
        return false;
      }
      if (options?.studentId && norm(report.studentId) !== norm(options.studentId)) {
        return false;
      }
      if (options?.reportType && report.reportType !== options.reportType) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const tA = new Date(a.issuedAt || a.generatedAt || 0).getTime();
      const tB = new Date(b.issuedAt || b.generatedAt || 0).getTime();
      return tB - tA;
    });
}

/**
 * Searches assessments, individual attempt reports, and all four official performance report types
 * by reference number (case- and whitespace-insensitive).
 * Strictly enforces Part 3:
 * - Only Platform Administrators and Authorized Tutors can use the Reference Lookup facility.
 * - Preserves existing `JDI-*` reference numbers and deterministic references for historical records.
 */
export async function searchAcademicRecordsByReference(
  rawQuery: string,
  authority?: ReportAuthorityContext
): Promise<AcademicReferenceLookupItem[]> {
  const authCtx = authority || (await resolveReportAuthorityContext());
  assertGradingAndReportingAuthority(authCtx);

  const normalizedQuery = normalizeReferenceCode(rawQuery);
  const [reportsDocs, examsDocs, schoolExamsDocs, attemptsDocs] = await Promise.all([
    queryDocsAcrossDbs('academicPerformanceReports'),
    queryDocsAcrossDbs('jdiExams'),
    queryDocsAcrossDbs('schoolExams'),
    queryDocsAcrossDbs('jdiExamAttempts'),
  ]);

  const results: AcademicReferenceLookupItem[] = [];
  const seenKeys = new Set<string>();

  // 1. Search Official Performance Reports (`academicPerformanceReports`)
  reportsDocs.forEach(({ id, data }) => {
    const snap = { ...(data as AcademicPerformanceReportSnapshot), id: norm(data.id || id) };
    if (!canUserViewReportSnapshot(authCtx, snap)) return;

    const refNo = norm(snap.reportRef || formatDocumentRefNo('JDI-RPT', snap.id));
    const normRef = normalizeReferenceCode(refNo);

    if (
      !normalizedQuery ||
      normRef === normalizedQuery ||
      normRef.includes(normalizedQuery) ||
      normLower(snap.studentName).includes(rawQuery.trim().toLowerCase())
    ) {
      const key = `rpt_${snap.id}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      results.push({
        refNo,
        normalizedRef: normRef,
        recordType: getLookupClassificationForReportType(snap.reportType),
        recordTypeLabel: getReportTypeLabel(snap.reportType),
        title: `${getReportTypeLabel(snap.reportType)} — ${snap.periodLabel}`,
        studentId: snap.studentId,
        studentName: snap.studentName,
        enrolmentCategory: snap.enrolmentCategory,
        enrolmentLabel: snap.enrolmentLabel,
        schoolId: snap.schoolId,
        schoolName: snap.schoolName,
        className: snap.className,
        programName: snap.programName,
        periodLabel: snap.periodLabel,
        generatedAt: snap.issuedAt || snap.generatedAt,
        status: snap.status,
        scoreSummary:
          snap.overallPercentage !== null
            ? `${snap.overallPercentage.toFixed(1)}% (Grade ${snap.overallGrade})`
            : 'Incomplete / Pending',
        percentage: snap.overallPercentage,
        grade: snap.overallGrade,
        version: snap.version || 1,
        sourceCollection: 'academicPerformanceReports',
        sourceId: snap.id,
        reportSnapshot: snap,
      });
    }
  });

  // Index exam definitions for attempt lookup
  const examMap = new Map<string, { id: string; sourceCollection: string; data: Record<string, any> }>();
  examsDocs.forEach(({ id, data }) => examMap.set(id, { id, sourceCollection: 'jdiExams', data }));
  schoolExamsDocs.forEach(({ id, data }) => {
    if (!examMap.has(id)) examMap.set(id, { id, sourceCollection: 'schoolExams', data });
  });

  // 2. Search Individual Assessment Attempt Reports (`jdiExamAttempts`)
  for (const { id, data } of attemptsDocs) {
    const examId = norm(data.examId || data.assessmentId || '');
    const examEntry = examId ? examMap.get(examId) : undefined;
    const examData = examEntry?.data;

    const schoolId = norm(data.schoolId || examData?.schoolId || '');
    const schoolName = norm(
      resolvePartnerSchoolName(data.schoolName || examData?.schoolName || schoolId) ||
        data.schoolName ||
        examData?.schoolName ||
        ''
    );
    const studentId = norm(data.studentId || data.studentUid || '');

    if (
      !authCtx.isPlatformAdmin &&
      !canTutorManageTarget(authCtx, { schoolId, schoolName, studentId })
    ) {
      continue;
    }

    // Use stored reference or deterministic formatDocumentRefNo('JDI', id)
    const storedRef = norm(data.referenceNumber || data.refNo || data.reportRef || '');
    const deterministicRef = formatDocumentRefNo('JDI', id);
    const refNo = storedRef || deterministicRef;
    const normRef = normalizeReferenceCode(refNo);
    const altNormRef = examId ? normalizeReferenceCode(formatDocumentRefNo('JDI', `${examId}-${studentId}`)) : '';

    const matchesRef =
      !normalizedQuery ||
      normRef === normalizedQuery ||
      normRef.includes(normalizedQuery) ||
      (altNormRef && (altNormRef === normalizedQuery || altNormRef.includes(normalizedQuery)));

    if (!matchesRef) continue;

    // Backfill reference on historical attempt record if missing so it remains permanently stored
    if (!storedRef && normalizedQuery && normRef === normalizedQuery) {
      try {
        await updateDoc(doc(db, 'jdiExamAttempts', id), { referenceNumber: refNo });
      } catch {
        // ignore if read-only replica
      }
    }

    const maxScore = Number(
      data.maxScore ||
        data.totalMarks ||
        (examData ? computeExamMaxScore(examData) : 0) ||
        100
    );
    const earned =
      data.totalScore !== undefined && data.totalScore !== null
        ? Number(data.totalScore)
        : data.score !== undefined && data.score !== null
        ? Number(data.score)
        : null;
    const normScore = normalizeScoreToPercentage(earned, maxScore);
    const gradeInfo = resolveGradeFromBoundaries(normScore.percentage);
    const isSchool = Boolean(schoolName && !['individual', 'private', 'jaystarbliss'].includes(schoolName.toLowerCase()));

    results.push({
      refNo,
      normalizedRef: normRef,
      recordType: 'ASSESSMENT_ATTEMPT_REPORT',
      recordTypeLabel: 'Individual Assessment Attempt Report',
      title: norm(data.examTitle || examData?.title || 'Assessment Attempt'),
      studentId,
      studentName: norm(data.studentName || data.learnerName || 'Learner'),
      enrolmentCategory: isSchool ? 'school' : 'private_individual',
      enrolmentLabel: isSchool ? `School (${schoolName})` : 'Private Enrolment',
      schoolId: schoolId || undefined,
      schoolName: schoolName || undefined,
      className: formatNormalizedClassDisplay(data.className || data.grade || examData?.targetClass || '') || 'General',
      programName: norm(data.programName || examData?.programName || examData?.subject || 'Robotics & Coding'),
      periodLabel: norm(examData?.session || '2026/2027 Academic Session'),
      generatedAt: toIso(data.submittedAt || data.completedAt || data.startedAt) || new Date().toISOString(),
      status: norm(data.status || 'SUBMITTED').toUpperCase(),
      scoreSummary:
        normScore.percentage !== null && normScore.earned !== null
          ? `${normScore.earned}/${normScore.max} (${normScore.percentage.toFixed(1)}% • Grade ${gradeInfo.grade})`
          : 'Pending Grading',
      percentage: normScore.percentage,
      grade: gradeInfo.grade,
      version: 1,
      sourceCollection: 'jdiExamAttempts',
      sourceId: id,
      examId: examId || undefined,
      attemptId: id,
      rawAttemptData: data,
      rawAssessmentData: examData,
    });
  }

  // 3. Search Assessment Definitions (`jdiExams` & `schoolExams`)
  for (const [examId, { sourceCollection, data }] of examMap.entries()) {
    const schoolId = norm(data.schoolId || '');
    const schoolName = norm(resolvePartnerSchoolName(data.schoolName || schoolId) || data.schoolName || '');
    if (!authCtx.isPlatformAdmin && !canTutorManageTarget(authCtx, { schoolId, schoolName })) {
      continue;
    }

    const storedRef = norm(data.referenceNumber || data.refNo || '');
    const refNo = storedRef || formatDocumentRefNo('JDI', examId);
    const normRef = normalizeReferenceCode(refNo);

    if (!normalizedQuery || normRef === normalizedQuery || normRef.includes(normalizedQuery)) {
      if (!storedRef && normalizedQuery && normRef === normalizedQuery) {
        try {
          await updateDoc(doc(db, sourceCollection, examId), { referenceNumber: refNo });
        } catch {
          // ignore
        }
      }

      const maxMarks = computeExamMaxScore(data) || Number(data.totalMarks || data.maxMarks || 100);
      const isSchool = Boolean(schoolName);

      results.push({
        refNo,
        normalizedRef: normRef,
        recordType: 'ASSESSMENT',
        recordTypeLabel: `Assessment Master (${norm(data.workType || data.activityType || 'EXAMINATION')})`,
        title: norm(data.title || 'Assessment'),
        studentName: isSchool ? `Cohort: ${schoolName}` : 'Assigned Cohort / Learner',
        enrolmentCategory: isSchool ? 'school_wide' : 'private_individual',
        enrolmentLabel: isSchool ? `School Cohort (${schoolName})` : 'Private Programme Assessment',
        schoolId: schoolId || undefined,
        schoolName: schoolName || undefined,
        className:
          formatNormalizedClassDisplay(
            data.targetClass || (Array.isArray(data.classIds) ? data.classIds.join(', ') : '')
          ) || 'All Assigned Classes',
        programName: norm(data.programName || data.subject || 'Robotics & Coding'),
        periodLabel: norm(data.session || '2026/2027 Academic Session'),
        generatedAt: toIso(data.createdAt || data.updatedAt) || new Date().toISOString(),
        status: norm(data.status || 'PUBLISHED').toUpperCase(),
        scoreSummary: `Max Marks: ${maxMarks}`,
        percentage: null,
        grade: '—',
        version: 1,
        sourceCollection,
        sourceId: examId,
        examId,
        rawAssessmentData: data,
      });
    }
  }

  // Sort exact reference matches first, then most recent
  return results.sort((a, b) => {
    const aExact = normalizedQuery && a.normalizedRef === normalizedQuery ? 1 : 0;
    const bExact = normalizedQuery && b.normalizedRef === normalizedQuery ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime();
  });
}
