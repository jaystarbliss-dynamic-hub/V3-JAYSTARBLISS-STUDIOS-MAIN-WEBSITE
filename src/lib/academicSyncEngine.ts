import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, getAllClientDatabases } from './firebase';
import {
  CANONICAL_CLASSES,
  calculateGradeLetter,
  calculateScorePercentage,
  classesMatch,
  computeExamMaxScore,
  formatNormalizedClassDisplay,
  isAttemptResultReleased,
  isStudentEligibleForWork,
  normalizeClassList,
  normalizeClassName,
  normalizeDeliveryMode,
  normalizeWorkType,
  resolvePartnerSchoolName,
} from './classes';
import { getEffectiveAuth } from '../utils/impersonation';
import { fetchAcademicSchoolsFallback, fetchAcademicStudentsFallback } from './academicFallback';

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

export interface LinkedLearnerProfile {
  id: string;
  allIds: string[];
  studentUid: string;
  fullName: string;
  username?: string;
  email?: string;
  className: string;
  schoolId: string;
  schoolAliases: string[];
  schoolName: string;
  isSchoolStudent: boolean;
  programName: string;
  subjects?: string[];
  tutorId?: string;
  tutorName?: string;
  parentId?: string;
  parentEmail?: string;
  parentName?: string;
  source?: string;
}

export type UnifiedAssignmentDisplayStatus =
  | 'PENDING'
  | 'OVERDUE'
  | 'SUBMITTED'
  | 'RESUBMISSION_REQUIRED'
  | 'GRADED'
  | 'COMPLETED';

export type UnifiedAssignmentStatus = UnifiedAssignmentDisplayStatus;

export interface UnifiedAssignmentRecord {
  id: string;
  sourceCollection: 'assignments' | 'jdiExams';
  examId?: string;
  attemptId?: string;
  submissionDocId?: string;
  submissionId?: string;
  title: string;
  description: string;
  instructions: string;
  subject: string;
  programName: string;
  activityType: 'ASSIGNMENT' | 'ACTIVITY' | 'QUIZ' | 'TEST' | 'EXAMINATION';
  targetMode: 'INDIVIDUAL' | 'SCHOOL_GRADE';
  schoolId: string;
  schoolName: string;
  targetClass: string;
  className?: string;
  classIds: string[];
  studentId: string;
  studentName: string;
  tutorId: string;
  tutorName: string;
  assignedDate: string | null;
  dueDate: string | null;
  status: string;
  displayStatus: UnifiedAssignmentDisplayStatus;
  grade: number | null;
  maxMarks: number;
  percentage: number | null;
  isUngraded: boolean;
  submissionFormat?: string;
  feedback: string | null;
  submissionText: string | null;
  submissionUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewStatus: string | null;
  resourceTitle: string | null;
  resourceUrl: string | null;
  passcode?: string;
  deliveryMode?: 'NATIVE' | 'EXTERNAL_LINK';
  externalUrl?: string;
  eligibleStudentCount?: number;
  submissionCount?: number;
}

export type UnifiedAssessmentLifecycleStatus =
  | 'UPCOMING'
  | 'ONGOING'
  | 'AWAITING_GRADING'
  | 'GRADED'
  | 'COMPLETED';

export interface UnifiedAssessmentQuizRecord {
  id: string;
  examId: string;
  attemptId?: string;
  source: 'jdiExams' | 'academic_assessments';
  studentId: string;
  studentName: string;
  className: string;
  schoolId: string;
  schoolName: string;
  isSchoolStudent: boolean;
  title: string;
  description: string;
  subject: string;
  programName: string;
  tutorName: string;
  workType: 'ASSIGNMENT' | 'ACTIVITY' | 'TEST' | 'EXAMINATION' | 'QUIZ';
  workTypeLabel: string;
  deliveryMode: 'NATIVE' | 'EXTERNAL_LINK';
  externalUrl?: string;
  resourceUrl?: string;
  assignedDate: string | null;
  availableFrom: string | null;
  availableUntil: string | null;
  dueDate: string | null;
  submittedAt: string | null;
  releasedAt: string | null;
  durationMinutes: number | null;
  lifecycleStatus: UnifiedAssessmentLifecycleStatus;
  submissionStatusLabel: string;
  rawAttemptStatus?: string;
  resultReleased: boolean;
  isUngradedActivity: boolean;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  gradeLetter: string;
  feedback: string;
  questionCount: number;
}

/**
 * Loads a school lookup map so schoolId, schoolCode, and schoolName aliases can be resolved.
 */
async function loadSchoolDirectoryMap(): Promise<{
  byKey: Map<string, { id: string; name: string; aliases: string[] }>;
}> {
  const byKey = new Map<string, { id: string; name: string; aliases: string[] }>();
  const allDbs = getAllClientDatabases();
  const snaps = await Promise.all(
    allDbs.map((dbInst) =>
      getDocs(collection(dbInst, 'schools')).catch(() => ({ docs: [] } as any))
    )
  );

  snaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      const s = d.data() || {};
      const id = d.id;
      const name =
        resolvePartnerSchoolName(s.name, s.schoolName, s.institutionName) ||
        `Partner School (${id})`;
      const aliases = Array.from(
        new Set(
          [id, s.schoolId, s.code, s.schoolCode, name]
            .map((v) => norm(v))
            .filter(Boolean)
        )
      );
      const entry = { id, name, aliases };
      aliases.forEach((a) => {
        byKey.set(a, entry);
        byKey.set(a.toLowerCase(), entry);
      });
    });
  });

  return { byKey };
}

/**
 * Builds a normalized LinkedLearnerProfile from raw student document(s).
 */
function buildLearnerProfile(
  primaryId: string,
  raw: Record<string, any>,
  extraIds: string[],
  schoolMap: Map<string, { id: string; name: string; aliases: string[] }>
): LinkedLearnerProfile {
  const rawSchoolId = norm(raw.schoolId || raw.school_id || raw.schoolDocId || '');
  const rawSchoolName = resolvePartnerSchoolName(raw.schoolName, raw.school);
  const schoolEntry =
    (rawSchoolId && (schoolMap.get(rawSchoolId) || schoolMap.get(rawSchoolId.toLowerCase()))) ||
    (rawSchoolName && (schoolMap.get(rawSchoolName) || schoolMap.get(rawSchoolName.toLowerCase()))) ||
    null;

  const canonicalSchoolId = schoolEntry?.id || (rawSchoolId !== 'private' ? rawSchoolId : '');
  const canonicalSchoolName =
    schoolEntry?.name || rawSchoolName || (canonicalSchoolId ? 'Assigned Partner School' : '');
  const isSchoolStudent = Boolean(
    canonicalSchoolId && canonicalSchoolId !== 'private' && canonicalSchoolId !== 'none'
  );

  const schoolAliases = Array.from(
    new Set(
      [
        ...(schoolEntry?.aliases || []),
        canonicalSchoolId,
        rawSchoolId,
        raw.schoolCode,
        canonicalSchoolName,
      ]
        .map((v) => norm(v))
        .filter((v) => v && v !== 'private' && v !== 'none')
    )
  );

  const rawClass = norm(
    raw.className || raw.class || raw.grade || raw.classLevel || raw.studentAge || 'Grade 1'
  );
  const className = normalizeClassName(rawClass, 'Grade 1') || rawClass || 'Grade 1';

  const studentUid = norm(raw.firebaseUid || raw.userId || raw.studentUid || raw.uid || '');
  const allIds = Array.from(
    new Set(
      [
        primaryId,
        ...extraIds,
        raw.id,
        raw.studentDocId,
        raw.linkedStudentId,
        raw.studentId,
        studentUid,
        raw.enrollmentRequestId,
      ]
        .map((v) => norm(v))
        .filter(Boolean)
    )
  );

  const subjectsList: string[] = Array.isArray(raw.subjects)
    ? raw.subjects.map((s: any) => norm(s)).filter(Boolean)
    : typeof raw.subjects === 'string' && raw.subjects.trim()
    ? raw.subjects
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];

  const programName = norm(
    raw.programName ||
      raw.programTitle ||
      raw.program ||
      raw.plan ||
      raw.track ||
      raw.learningTrack ||
      subjectsList[0] ||
      'Digital Literacy & Tech'
  );

  const fullName = norm(
    raw.fullName ||
      raw.studentName ||
      raw.name ||
      raw.childName ||
      [raw.firstName, raw.lastName].filter(Boolean).join(' ') ||
      'Learner'
  );

  return {
    id: primaryId,
    allIds,
    studentUid,
    fullName,
    username: norm(raw.username || raw.studentUsername || primaryId),
    email: normLower(raw.email || raw.studentEmail || ''),
    className,
    schoolId: canonicalSchoolId,
    schoolAliases,
    schoolName: isSchoolStudent ? canonicalSchoolName : '',
    isSchoolStudent,
    programName,
    subjects: subjectsList,
    tutorId: norm(
      raw.tutorId ||
        raw.staffId ||
        raw.assignedTutorId ||
        raw.assignedStaffId ||
        raw.instructorId ||
        ''
    ),
    tutorName: norm(raw.tutorName || raw.assignedTutorName || raw.mentorName || ''),
    parentId: norm(raw.parentId || raw.parentUid || raw.parentUserId || raw.guardianId || ''),
    parentEmail: normLower(raw.parentEmail || raw.guardianEmail || ''),
    parentName: norm(raw.parentName || raw.guardianName || ''),
  };
}

/**
 * Resolves all children linked to a Parent account across both private (`individualStudents`)
 * and school-based (`students`) collections, plus `parents`, `users`, and `enrollment_requests`.
 */
export async function resolveParentLinkedChildren(
  overrideParentUid?: string,
  overrideParentEmail?: string
): Promise<LinkedLearnerProfile[]> {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  const parentUid = norm(
    overrideParentUid ||
      effective.effectiveUid ||
      currentUser?.uid ||
      sessionStorage.getItem('userId') ||
      ''
  );
  let parentEmail = normLower(
    overrideParentEmail ||
      effective.effectiveEmail ||
      currentUser?.email ||
      sessionStorage.getItem('userEmail') ||
      ''
  );

  const { byKey: schoolMap } = await loadSchoolDirectoryMap();

  const explicitChildIds = new Set<string>();
  if (parentUid) {
    const [uSnap, pSnap] = await Promise.all([
      getDoc(doc(db, 'users', parentUid)).catch(() => null),
      getDoc(doc(db, 'parents', parentUid)).catch(() => null),
    ]);
    if (uSnap?.exists()) {
      const uData = uSnap.data() || {};
      if (!parentEmail && uData.email) parentEmail = normLower(uData.email);
      const arr = [
        ...(Array.isArray(uData.children) ? uData.children : []),
        ...(Array.isArray(uData.linkedStudentIds) ? uData.linkedStudentIds : []),
        ...(Array.isArray(uData.studentIds) ? uData.studentIds : []),
      ];
      arr.forEach((cid: any) => {
        const clean = norm(cid && typeof cid === 'object' ? cid.id || cid.studentId : cid);
        if (clean) explicitChildIds.add(clean);
      });
    }
    if (pSnap?.exists()) {
      const pData = pSnap.data() || {};
      if (!parentEmail && pData.email) parentEmail = normLower(pData.email);
      const arr = [
        ...(Array.isArray(pData.children) ? pData.children : []),
        ...(Array.isArray(pData.linkedStudentIds) ? pData.linkedStudentIds : []),
        ...(Array.isArray(pData.studentIds) ? pData.studentIds : []),
      ];
      arr.forEach((cid: any) => {
        const clean = norm(cid && typeof cid === 'object' ? cid.id || cid.studentId : cid);
        if (clean) explicitChildIds.add(clean);
      });
    }
  }

  const rawRecordsByDocId = new Map<string, Record<string, any>>();
  const recordDocEntry = (docId: string, data: Record<string, any>) => {
    const cleanId = norm(docId);
    if (!cleanId) return;
    const prev = rawRecordsByDocId.get(cleanId) || {};
    rawRecordsByDocId.set(cleanId, { ...prev, ...data, id: cleanId });
  };

  const queryPromises: Promise<any>[] = [];
  if (parentUid) {
    for (const colName of ['individualStudents', 'students'] as const) {
      for (const field of ['parentId', 'parentUid', 'parentUserId', 'guardianId']) {
        queryPromises.push(
          getDocs(query(collection(db, colName), where(field, '==', parentUid), limit(100))).catch(
            () => null
          )
        );
      }
    }
    queryPromises.push(
      getDocs(
        query(collection(db, 'enrollment_requests'), where('parentId', '==', parentUid), limit(50))
      ).catch(() => null)
    );
  }

  if (parentEmail) {
    for (const colName of ['individualStudents', 'students'] as const) {
      for (const field of ['parentEmail', 'guardianEmail', 'parentId']) {
        queryPromises.push(
          getDocs(
            query(collection(db, colName), where(field, '==', parentEmail), limit(100))
          ).catch(() => null)
        );
      }
    }
    queryPromises.push(
      getDocs(
        query(
          collection(db, 'enrollment_requests'),
          where('parentEmail', '==', parentEmail),
          limit(50)
        )
      ).catch(() => null)
    );
  }

  const snaps = await Promise.all(queryPromises);
  const enrollmentDocs: Array<{ id: string; data: Record<string, any> }> = [];

  snaps.forEach((snap) => {
    snap?.docs?.forEach((d: any) => {
      const path = d.ref?.parent?.id || '';
      if (path === 'enrollment_requests') {
        enrollmentDocs.push({ id: d.id, data: d.data() || {} });
      } else {
        recordDocEntry(d.id, d.data() || {});
      }
    });
  });

  // Resolve any explicit child IDs from parents/users or enrollment_requests
  enrollmentDocs.forEach((er) => {
    const targetSid = norm(er.data.studentDocId || er.data.linkedStudentId || er.data.studentId);
    if (targetSid) explicitChildIds.add(targetSid);
  });

  if (explicitChildIds.size > 0) {
    const directLookups: Promise<void>[] = [];
    Array.from(explicitChildIds).forEach((cid) => {
      if (rawRecordsByDocId.has(cid)) return;
      directLookups.push(
        (async () => {
          const [indDoc, stdDoc] = await Promise.all([
            getDoc(doc(db, 'individualStudents', cid)).catch(() => null),
            getDoc(doc(db, 'students', cid)).catch(() => null),
          ]);
          if (indDoc?.exists()) recordDocEntry(indDoc.id, indDoc.data() || {});
          if (stdDoc?.exists()) recordDocEntry(stdDoc.id, stdDoc.data() || {});
        })()
      );
    });
    await Promise.all(directLookups);
  }

  // Also include approved/active enrollment_requests that represent a child
  enrollmentDocs.forEach((er) => {
    const d = er.data;
    const status = normLower(d.status);
    if (status === 'rejected' || status === 'cancelled') return;
    const targetSid = norm(
      d.studentDocId || d.linkedStudentId || d.studentId || er.id
    );
    if (!rawRecordsByDocId.has(targetSid)) {
      recordDocEntry(targetSid, {
        ...d,
        fullName: d.studentName || d.childName || d.fullName || 'Learner',
        class: d.class || d.studentClass || d.grade || d.studentAge || 'Grade 1',
        enrollmentRequestId: er.id,
      });
    }
  });

  // Deduplicate by identity (matching firebaseUid, studentDocId, or normalized fullName + className)
  const mergedByCanonicalKey = new Map<
    string,
    { primaryId: string; data: Record<string, any>; extraIds: Set<string> }
  >();

  Array.from(rawRecordsByDocId.entries()).forEach(([docId, data]) => {
    const fullNameNorm = normLower(
      data.fullName || data.studentName || data.name || data.childName
    ).replace(/\s+/g, ' ');
    if (!fullNameNorm) return;

    const linkedId = norm(data.studentDocId || data.linkedStudentId || '');
    const uidKey = norm(data.firebaseUid || data.userId || data.studentUid || '');
    const schoolKey = normLower(data.schoolId || 'private');

    // Find if an existing entry matches by ID, UID, or same child name in same school
    let matchedKey: string | null = null;
    for (const [k, existing] of mergedByCanonicalKey.entries()) {
      if (
        existing.extraIds.has(docId) ||
        (linkedId && existing.extraIds.has(linkedId)) ||
        (uidKey && existing.extraIds.has(uidKey))
      ) {
        matchedKey = k;
        break;
      }
      const existingName = normLower(
        existing.data.fullName || existing.data.studentName || existing.data.name
      ).replace(/\s+/g, ' ');
      const existingSchool = normLower(existing.data.schoolId || 'private');
      if (existingName === fullNameNorm && existingSchool === schoolKey) {
        matchedKey = k;
        break;
      }
    }

    if (matchedKey) {
      const entry = mergedByCanonicalKey.get(matchedKey)!;
      entry.extraIds.add(docId);
      if (linkedId) entry.extraIds.add(linkedId);
      if (uidKey) entry.extraIds.add(uidKey);
      // Prefer real student doc ID over enrollment_request ID
      const preferNewPrimary =
        linkedId === docId ||
        (!norm(entry.data.class) && norm(data.class)) ||
        (!norm(entry.data.schoolId) && norm(data.schoolId));
      if (preferNewPrimary) {
        entry.primaryId = docId;
      }
      entry.data = { ...entry.data, ...data };
    } else {
      const key = `${fullNameNorm}::${schoolKey}::${docId}`;
      const extraIds = new Set<string>([docId]);
      if (linkedId) extraIds.add(linkedId);
      if (uidKey) extraIds.add(uidKey);
      mergedByCanonicalKey.set(key, {
        primaryId: linkedId || docId,
        data,
        extraIds,
      });
    }
  });

  const profiles: LinkedLearnerProfile[] = [];
  mergedByCanonicalKey.forEach(({ primaryId, data, extraIds }) => {
    profiles.push(buildLearnerProfile(primaryId, data, Array.from(extraIds), schoolMap));
  });

  return profiles.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Resolves the complete LinkedLearnerProfile for a specific student ID or the currently signed-in student.
 */
export async function resolveStudentLearnerProfile(
  targetStudentId?: string
): Promise<LinkedLearnerProfile | null> {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  const uid = norm(
    effective.effectiveUid ||
      currentUser?.uid ||
      sessionStorage.getItem('userId') ||
      localStorage.getItem('jaystar_cached_user_id') ||
      ''
  );
  const cachedDocId = norm(
    targetStudentId ||
      effective.effectiveStudentDocId ||
      sessionStorage.getItem('studentDocId') ||
      localStorage.getItem('jaystar_cached_student_doc_id') ||
      ''
  );
  const cachedUsername = normLower(
    sessionStorage.getItem('studentUsername') ||
      localStorage.getItem('jaystar_cached_student_username') ||
      ''
  );

  const { byKey: schoolMap } = await loadSchoolDirectoryMap();
  const extraIds = new Set<string>();
  if (uid) extraIds.add(uid);
  if (cachedDocId) extraIds.add(cachedDocId);

  let mergedData: Record<string, any> = {};
  let primaryId = cachedDocId || uid;

  if (uid && !targetStudentId) {
    const uSnap = await getDoc(doc(db, 'users', uid)).catch(() => null);
    if (uSnap?.exists()) {
      const uData = uSnap.data() || {};
      mergedData = { ...mergedData, ...uData };
      if (uData.studentDocId) {
        primaryId = norm(uData.studentDocId);
        extraIds.add(primaryId);
      }
    }
  }

  const candidateIds = Array.from(new Set([cachedDocId, primaryId, uid].filter(Boolean)));
  for (const cid of candidateIds) {
    const [indSnap, stdSnap] = await Promise.all([
      getDoc(doc(db, 'individualStudents', cid)).catch(() => null),
      getDoc(doc(db, 'students', cid)).catch(() => null),
    ]);
    if (indSnap?.exists()) {
      mergedData = { ...mergedData, ...(indSnap.data() || {}) };
      primaryId = indSnap.id;
      extraIds.add(indSnap.id);
    }
    if (stdSnap?.exists()) {
      mergedData = { ...mergedData, ...(stdSnap.data() || {}) };
      primaryId = stdSnap.id;
      extraIds.add(stdSnap.id);
    }
  }

  if ((!mergedData.fullName && !mergedData.studentName && !mergedData.name) && uid && !targetStudentId) {
    const [indByUid, stdByUid, indByUser, stdByUser] = await Promise.all([
      getDocs(query(collection(db, 'individualStudents'), where('firebaseUid', '==', uid), limit(5))).catch(() => null),
      getDocs(query(collection(db, 'students'), where('firebaseUid', '==', uid), limit(5))).catch(() => null),
      getDocs(query(collection(db, 'individualStudents'), where('userId', '==', uid), limit(5))).catch(() => null),
      getDocs(query(collection(db, 'students'), where('userId', '==', uid), limit(5))).catch(() => null),
    ]);
    [
      ...(indByUid?.docs || []),
      ...(stdByUid?.docs || []),
      ...(indByUser?.docs || []),
      ...(stdByUser?.docs || []),
    ].forEach((d: any) => {
      mergedData = { ...mergedData, ...(d.data() || {}) };
      primaryId = d.id;
      extraIds.add(d.id);
    });
  }

  if ((!mergedData.fullName && !mergedData.studentName && !mergedData.name) && cachedUsername && !targetStudentId) {
    const cleanUser = cachedUsername.replace(/^@/, '');
    const [indByU, stdByU] = await Promise.all([
      getDocs(query(collection(db, 'individualStudents'), where('username', '==', cleanUser), limit(5))).catch(() => null),
      getDocs(query(collection(db, 'students'), where('username', '==', cleanUser), limit(5))).catch(() => null),
    ]);
    const matched = indByU?.docs?.[0] || stdByU?.docs?.[0];
    if (matched) {
      mergedData = { ...mergedData, ...(matched.data() || {}) };
      primaryId = matched.id;
      extraIds.add(matched.id);
    }
  }

  if (!mergedData.fullName && !mergedData.studentName && !mergedData.name) {
    const sessionName =
      sessionStorage.getItem('studentName') || sessionStorage.getItem('userName') || '';
    if (!sessionName && !primaryId) return null;
    mergedData = {
      ...mergedData,
      fullName: sessionName || 'Student',
      schoolId: mergedData.schoolId || sessionStorage.getItem('schoolId') || '',
      schoolName: mergedData.schoolName || sessionStorage.getItem('schoolName') || '',
      class: mergedData.class || sessionStorage.getItem('studentClass') || 'Grade 1',
      plan: mergedData.plan || sessionStorage.getItem('studentPlan') || '',
    };
  }

  return buildLearnerProfile(primaryId, mergedData, Array.from(extraIds), schoolMap);
}

/**
 * Computes the canonical display status for an assignment (PENDING, OVERDUE, SUBMITTED, RESUBMISSION_REQUIRED, GRADED, COMPLETED).
 */
export function computeAssignmentDisplayStatus(params: {
  rawStatus?: string | null;
  reviewStatus?: string | null;
  submittedAt?: string | null;
  submissionText?: string | null;
  submissionUrl?: string | null;
  grade?: number | null;
  dueDate?: string | null;
}): UnifiedAssignmentDisplayStatus {
  const status = norm(params.rawStatus).toUpperCase();
  const review = norm(params.reviewStatus).toUpperCase();

  if (status === 'RESUBMISSION_REQUIRED' || review === 'RESUBMISSION_REQUIRED') {
    return 'RESUBMISSION_REQUIRED';
  }
  if (
    status === 'GRADED' ||
    (typeof params.grade === 'number' && Number.isFinite(params.grade) && ['COMPLETED', 'GRADED', 'RELEASED'].includes(status))
  ) {
    return 'GRADED';
  }
  if (status === 'COMPLETED') {
    return typeof params.grade === 'number' && Number.isFinite(params.grade)
      ? 'GRADED'
      : 'COMPLETED';
  }
  if (
    status === 'SUBMITTED' ||
    status === 'AWAITING_REVIEW' ||
    review === 'AWAITING_REVIEW' ||
    Boolean(params.submittedAt || params.submissionText || params.submissionUrl)
  ) {
    return typeof params.grade === 'number' && Number.isFinite(params.grade)
      ? 'GRADED'
      : 'SUBMITTED';
  }

  if (params.dueDate) {
    const dueMs = new Date(params.dueDate).getTime();
    if (Number.isFinite(dueMs) && dueMs < Date.now()) {
      return 'OVERDUE';
    }
  }
  return 'PENDING';
}

/**
 * Checks whether an assignment document in `assignments` applies to a given learner
 * (either individually or via School + Grade targeting).
 */
export function doesAssignmentMatchLearner(
  assignment: Record<string, any>,
  learner: LinkedLearnerProfile
): boolean {
  const rawStatus = normLower(assignment.status);
  if (rawStatus === 'draft' || rawStatus === 'archived') return false;

  const learnerIdSet = new Set(learner.allIds.map((id) => id.trim()));
  const directIds = [
    assignment.studentId,
    assignment.studentUserId,
    assignment.userId,
    ...(Array.isArray(assignment.targetStudentIds) ? assignment.targetStudentIds : []),
    ...(Array.isArray(assignment.eligibleStudentIds) ? assignment.eligibleStudentIds : []),
  ]
    .map((v) => norm(v))
    .filter(Boolean);

  if (directIds.some((id) => learnerIdSet.has(id))) {
    return true;
  }

  // If this is strictly an individual assignment for a different student, do not match
  const targetMode = norm(assignment.targetMode || assignment.recipientMode).toUpperCase();
  if (
    (targetMode === 'INDIVIDUAL' || targetMode === 'PRIVATE_LEARNERS') &&
    directIds.length > 0
  ) {
    return false;
  }
  if (assignment.studentId && norm(assignment.studentId) !== 'all' && !assignment.targetClass && !assignment.classIds) {
    return false;
  }

  // School + Grade matching
  if (!learner.isSchoolStudent) return false;

  const learnerSchoolKeys = new Set(
    [learner.schoolId, ...learner.schoolAliases, learner.schoolName]
      .map((s) => normLower(s))
      .filter((s) => s && s !== 'private' && s !== 'none')
  );

  const assignmentSchoolKeys = [
    assignment.schoolId,
    ...(Array.isArray(assignment.targetSchoolIds) ? assignment.targetSchoolIds : []),
    resolvePartnerSchoolName(assignment.schoolName),
  ]
    .map((s) => normLower(s))
    .filter((s) => s && s !== 'private' && s !== 'none');

  if (assignmentSchoolKeys.length === 0) return false;
  const schoolMatches = assignmentSchoolKeys.some((k) => learnerSchoolKeys.has(k));
  if (!schoolMatches) return false;

  const targetClasses =
    Array.isArray(assignment.classIds) && assignment.classIds.length > 0
      ? assignment.classIds
      : assignment.targetClass || assignment.className || assignment.grade || [];

  return classesMatch(learner.className, targetClasses, { allowEmptyTarget: false });
}

/**
 * Retrieves all synchronized assignments for a single learner from:
 * 1. `assignments` (both individual and school+grade targeted)
 * 2. `assignmentSubmissions` (for per-student submissions on school+grade assignments)
 * 3. `jdiExams` / `schoolExams` where `workType === 'ASSIGNMENT'` + `jdiExamAttempts`
 */
export async function fetchAssignmentsForLearner(
  learner: LinkedLearnerProfile
): Promise<UnifiedAssignmentRecord[]> {
  const allDbs = getAllClientDatabases();

  const [assignmentsSnaps, subSnaps, jdiExamsSnaps, schoolExamsSnaps, attemptsSnaps] =
    await Promise.all([
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'assignments')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'assignmentSubmissions')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'jdiExams')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'schoolExams')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'jdiExamAttempts')).catch(() => ({ docs: [] } as any))
        )
      ),
    ]);

  const learnerIdSet = new Set(learner.allIds);

  // Map per-student submissions in `assignmentSubmissions` for this learner
  const submissionsByAssignmentId = new Map<string, Record<string, any>>();
  subSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      const sub = d.data() || {};
      const subStudentIds = [sub.studentId, sub.studentUid, sub.userId]
        .map((v) => norm(v))
        .filter(Boolean);
      if (subStudentIds.some((id) => learnerIdSet.has(id))) {
        const aId = norm(sub.assignmentId);
        if (aId) {
          submissionsByAssignmentId.set(aId, { id: d.id, ...sub });
        }
      }
    });
  });

  // Map attempts in `jdiExamAttempts` for this learner
  const attemptsByExamId = new Map<string, Record<string, any>>();
  attemptsSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      const att = d.data() || {};
      const attStudentIds = [att.studentId, att.studentUid, att.userId]
        .map((v) => norm(v))
        .filter(Boolean);
      if (attStudentIds.some((id) => learnerIdSet.has(id))) {
        const examId = norm(att.examId);
        if (!examId) return;
        const prev = attemptsByExamId.get(examId);
        if (!prev || isAttemptResultReleased(att) || !isAttemptResultReleased(prev)) {
          attemptsByExamId.set(examId, { id: d.id, ...att });
        }
      }
    });
  });

  const resultsMap = new Map<string, UnifiedAssignmentRecord>();
  const linkedExamIdsHandled = new Set<string>();

  // 1. Process `assignments` collection
  const rawAssignmentDocs = new Map<string, Record<string, any>>();
  assignmentsSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      rawAssignmentDocs.set(d.id, { id: d.id, ...d.data() });
    });
  });

  rawAssignmentDocs.forEach((a) => {
    if (!doesAssignmentMatchLearner(a, learner)) return;

    const isSchoolGrade =
      norm(a.targetMode || a.recipientMode).toUpperCase() === 'SCHOOL_GRADE' ||
      norm(a.targetMode || a.recipientMode).toUpperCase() === 'SCHOOL_CLASS' ||
      (!a.studentId && Boolean(a.schoolId));

    const perStudentSub =
      submissionsByAssignmentId.get(a.id) ||
      (a.submissionsByStudent && typeof a.submissionsByStudent === 'object'
        ? learner.allIds.map((id) => a.submissionsByStudent[id]).find(Boolean)
        : null);

    const linkedExamId = norm(a.examId || '');
    if (linkedExamId) linkedExamIdsHandled.add(linkedExamId);
    const linkedAttempt = linkedExamId ? attemptsByExamId.get(linkedExamId) : null;

    // Extract submission text/url from either direct assignment fields, perStudentSub, or linkedAttempt
    const submissionText =
      norm(
        perStudentSub?.submissionText ??
          (!isSchoolGrade ? a.submissionText : '') ??
          (linkedAttempt?.answers
            ? Object.values(linkedAttempt.answers)
                .map((v: any) => (typeof v === 'string' ? v : v?.text || v?.notes || ''))
                .filter(Boolean)
                .join('\n')
            : '')
      ) || null;

    const submissionUrl =
      norm(
        perStudentSub?.submissionUrl ??
          (!isSchoolGrade ? a.submissionUrl : '') ??
          (linkedAttempt?.answers
            ? Object.values(linkedAttempt.answers)
                .map((v: any) => (typeof v === 'object' && v !== null ? v?.url || v?.link || '' : ''))
                .filter(Boolean)[0] || ''
            : '')
      ) || null;

    const submittedAt =
      toIso(perStudentSub?.submittedAt) ||
      (!isSchoolGrade ? toIso(a.submittedAt) : null) ||
      toIso(linkedAttempt?.submittedAt);

    const reviewedAt =
      toIso(perStudentSub?.reviewedAt) ||
      (!isSchoolGrade ? toIso(a.reviewedAt) : null) ||
      toIso(linkedAttempt?.releasedAt);

    const rawGrade =
      perStudentSub?.grade !== undefined && perStudentSub?.grade !== null
        ? Number(perStudentSub.grade)
        : !isSchoolGrade && a.grade !== undefined && a.grade !== null
        ? Number(a.grade)
        : linkedAttempt && isAttemptResultReleased(linkedAttempt) && typeof linkedAttempt.score === 'number'
        ? Number(linkedAttempt.score)
        : null;

    const grade = rawGrade !== null && Number.isFinite(rawGrade) ? rawGrade : null;
    const maxMarks = Math.max(
      1,
      Number(a.maxMarks || a.maxPoints || a.maxScore || linkedAttempt?.maxScore || 100) || 100
    );
    const percentage =
      grade !== null && maxMarks > 0 ? calculateScorePercentage(grade, maxMarks) : null;

    const feedback =
      norm(
        perStudentSub?.feedback ??
          (!isSchoolGrade ? a.feedback : '') ??
          (linkedAttempt && isAttemptResultReleased(linkedAttempt)
            ? linkedAttempt.feedback || linkedAttempt.tutorFeedback
            : '')
      ) || null;

    const rawStatus =
      norm(perStudentSub?.status) ||
      (!isSchoolGrade ? norm(a.status) : '') ||
      (linkedAttempt ? norm(linkedAttempt.status) : '') ||
      norm(a.status) ||
      'PUBLISHED';

    const reviewStatus =
      norm(perStudentSub?.reviewStatus) ||
      (!isSchoolGrade ? norm(a.reviewStatus) : '') ||
      null;

    const dueDate = toIso(a.dueDate);
    const displayStatus = computeAssignmentDisplayStatus({
      rawStatus,
      reviewStatus,
      submittedAt,
      submissionText,
      submissionUrl,
      grade,
      dueDate,
    });

    const targetClass =
      normalizeClassName(a.targetClass || a.className || learner.className, learner.className) ||
      learner.className;

    resultsMap.set(a.id, {
      id: a.id,
      sourceCollection: 'assignments',
      examId: linkedExamId || undefined,
      attemptId: linkedAttempt?.id || undefined,
      submissionDocId: perStudentSub?.id || undefined,
      title: norm(a.title || 'Assignment'),
      description: norm(a.description || a.instructions || ''),
      instructions: norm(a.instructions || a.description || ''),
      subject: norm(a.subject || a.programName || learner.programName || 'General'),
      programName: norm(a.programName || a.subject || learner.programName || 'General'),
      activityType: (norm(a.activityType || 'ASSIGNMENT').toUpperCase() as any) || 'ASSIGNMENT',
      targetMode: isSchoolGrade ? 'SCHOOL_GRADE' : 'INDIVIDUAL',
      schoolId: norm(a.schoolId || learner.schoolId),
      schoolName:
        resolvePartnerSchoolName(a.schoolName, learner.schoolName) ||
        (learner.isSchoolStudent ? 'Assigned Partner School' : 'Private Coaching'),
      targetClass,
      classIds: normalizeClassList(a.classIds || [targetClass]),
      studentId: learner.id,
      studentName: learner.fullName,
      tutorId: norm(a.tutorId || a.staffId || learner.tutorId),
      tutorName: norm(a.tutorName || learner.tutorName || 'Assigned Tutor'),
      assignedDate: toIso(a.createdAt || a.updatedAt),
      dueDate,
      status: displayStatus === 'GRADED' ? 'COMPLETED' : displayStatus,
      displayStatus,
      grade,
      maxMarks,
      percentage,
      isUngraded: Boolean(a.isUngraded),
      feedback,
      submissionText,
      submissionUrl,
      submittedAt,
      reviewedAt,
      reviewStatus,
      resourceTitle: norm(a.resourceTitle) || null,
      resourceUrl: norm(a.resourceUrl) || null,
    });
  });

  // 2. Process `jdiExams` and `schoolExams` where workType === 'ASSIGNMENT'
  const examDocsMap = new Map<string, Record<string, any>>();
  schoolExamsSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => examDocsMap.set(d.id, { id: d.id, ...d.data() }));
  });
  jdiExamsSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => examDocsMap.set(d.id, { id: d.id, ...d.data() }));
  });

  examDocsMap.forEach((exam) => {
    if (linkedExamIdsHandled.has(exam.id) || resultsMap.has(exam.id)) return;
    const wType = normalizeWorkType(exam.workType, exam);
    if (wType !== 'ASSIGNMENT') return;

    const eligible = isStudentEligibleForWork(
      {
        id: learner.id,
        uid: learner.studentUid || learner.id,
        studentId: learner.id,
        studentUid: learner.studentUid,
        schoolId: learner.schoolId,
        schoolAliases: learner.schoolAliases,
        schoolName: learner.schoolName,
        className: learner.className,
        class: learner.className,
      },
      exam
    );
    const attempt = attemptsByExamId.get(exam.id);
    if (!eligible && !attempt) return;

    // Extract deliverable answers from attempt if present
    let submissionText: string | null = null;
    let submissionUrl: string | null = null;
    if (attempt?.answers && typeof attempt.answers === 'object') {
      const texts: string[] = [];
      for (const val of Object.values(attempt.answers)) {
        if (typeof val === 'string' && val.trim()) {
          if (/^https?:\/\//i.test(val.trim()) && !submissionUrl) {
            submissionUrl = val.trim();
          } else {
            texts.push(val.trim());
          }
        } else if (val && typeof val === 'object') {
          const vObj = val as any;
          if (vObj.url || vObj.link || vObj.submissionUrl) {
            submissionUrl = norm(vObj.url || vObj.link || vObj.submissionUrl);
          }
          if (vObj.text || vObj.notes || vObj.submissionText) {
            texts.push(norm(vObj.text || vObj.notes || vObj.submissionText));
          }
        }
      }
      if (texts.length > 0) submissionText = texts.join('\n\n');
    }

    const perStudentSub = submissionsByAssignmentId.get(exam.id);
    if (perStudentSub) {
      if (perStudentSub.submissionText) submissionText = norm(perStudentSub.submissionText);
      if (perStudentSub.submissionUrl) submissionUrl = norm(perStudentSub.submissionUrl);
    }

    const submittedAt = toIso(attempt?.submittedAt) || toIso(perStudentSub?.submittedAt);
    const released = attempt ? isAttemptResultReleased(attempt) : false;
    const rawGrade =
      released && typeof attempt?.score === 'number'
        ? Number(attempt.score)
        : typeof perStudentSub?.grade === 'number'
        ? Number(perStudentSub.grade)
        : null;
    const grade = rawGrade !== null && Number.isFinite(rawGrade) ? rawGrade : null;
    const maxMarks = Math.max(1, computeExamMaxScore(exam, attempt) || 20);
    const percentage =
      grade !== null && maxMarks > 0 ? calculateScorePercentage(grade, maxMarks) : null;
    const feedback =
      (released ? norm(attempt?.feedback || attempt?.tutorFeedback) : '') ||
      norm(perStudentSub?.feedback) ||
      null;

    const dueDate = toIso(exam.dueDate || exam.availableUntil);
    const rawAttemptStatus = norm(attempt?.status || perStudentSub?.status || '');
    const displayStatus = computeAssignmentDisplayStatus({
      rawStatus:
        released || rawAttemptStatus.toLowerCase() === 'graded'
          ? 'GRADED'
          : rawAttemptStatus.toLowerCase() === 'submitted' ||
            rawAttemptStatus.toLowerCase() === 'completed'
          ? 'SUBMITTED'
          : exam.status,
      reviewStatus: perStudentSub?.reviewStatus,
      submittedAt,
      submissionText,
      submissionUrl,
      grade,
      dueDate,
    });

    const isSchoolGrade =
      norm(exam.recipientMode).toUpperCase() !== 'PRIVATE_LEARNERS' &&
      norm(exam.schoolId) !== 'private';

    const targetClass =
      normalizeClassName(exam.targetClass || exam.className || learner.className, learner.className) ||
      learner.className;

    resultsMap.set(exam.id, {
      id: exam.id,
      sourceCollection: 'jdiExams',
      examId: exam.id,
      attemptId: attempt?.id,
      submissionDocId: perStudentSub?.id,
      title: norm(exam.title || 'Assignment'),
      description: norm(exam.description || exam.instructions || ''),
      instructions: norm(exam.instructions || exam.description || ''),
      subject: norm(exam.subject || learner.programName || 'General'),
      programName: norm(exam.courseName || exam.subject || learner.programName || 'General'),
      activityType: 'ASSIGNMENT',
      targetMode: isSchoolGrade ? 'SCHOOL_GRADE' : 'INDIVIDUAL',
      schoolId: norm(exam.schoolId || learner.schoolId),
      schoolName:
        resolvePartnerSchoolName(exam.schoolName, learner.schoolName) ||
        (isSchoolGrade ? 'Assigned Partner School' : 'Private Coaching'),
      targetClass,
      classIds: normalizeClassList(exam.classIds || [targetClass]),
      studentId: learner.id,
      studentName: learner.fullName,
      tutorId: norm(exam.tutorId || exam.createdBy || learner.tutorId),
      tutorName: norm(exam.tutorName || learner.tutorName || 'Assigned Tutor'),
      assignedDate: toIso(exam.createdAt || exam.availableFrom || exam.updatedAt),
      dueDate,
      status: displayStatus === 'GRADED' ? 'COMPLETED' : displayStatus,
      displayStatus,
      grade,
      maxMarks,
      percentage,
      isUngraded: Boolean(exam.isUngradedActivity),
      feedback,
      submissionText,
      submissionUrl,
      submittedAt,
      reviewedAt: toIso(attempt?.releasedAt || perStudentSub?.reviewedAt),
      reviewStatus: perStudentSub?.reviewStatus || null,
      resourceTitle: norm(exam.resourceTitle) || 'Attached Assignment Resource',
      resourceUrl: norm(exam.resourceUrl || exam.videoUrl || exam.learningVideoUrl) || null,
      passcode: norm(exam.passcode),
      deliveryMode: normalizeDeliveryMode(exam),
      externalUrl: norm(exam.externalUrl || exam.url),
    });
  });

  return Array.from(resultsMap.values()).sort((a, b) => {
    const da = a.assignedDate || a.dueDate || '';
    const dbDate = b.assignedDate || b.dueDate || '';
    return dbDate.localeCompare(da);
  });
}

/**
 * Fetches assignments across all (or a selected) child for a Parent account.
 */
export async function fetchAssignmentsForParent(
  children: LinkedLearnerProfile[],
  selectedChildId?: string
): Promise<UnifiedAssignmentRecord[]> {
  const targetChildren =
    selectedChildId && selectedChildId !== 'all'
      ? children.filter((c) => c.id === selectedChildId || c.allIds.includes(selectedChildId))
      : children;

  const perChildLists = await Promise.all(
    targetChildren.map((child) => fetchAssignmentsForLearner(child))
  );

  const combined: UnifiedAssignmentRecord[] = [];
  perChildLists.forEach((list) => {
    combined.push(...list);
  });

  return combined.sort((a, b) => {
    const da = a.assignedDate || a.dueDate || '';
    const dbDate = b.assignedDate || b.dueDate || '';
    return dbDate.localeCompare(da);
  });
}

/**
 * Fetches all assignments for a Tutor or Admin, expanding school+grade assignments with student submission tracking.
 */
export async function fetchAssignmentsForTutor(params: {
  selectedStudentId?: string;
  selectedSchoolId?: string;
  selectedClass?: string;
}): Promise<UnifiedAssignmentRecord[]> {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  const uid = norm(effective.effectiveUid || currentUser?.uid || '');

  const [students, schools] = await Promise.all([
    fetchAcademicStudentsFallback(),
    fetchAcademicSchoolsFallback(),
  ]);

  const studentById = new Map<string, any>();
  students.forEach((s) => {
    studentById.set(s.id, s);
    if (s.firebaseUid) studentById.set(s.firebaseUid, s);
  });

  const allowedSchoolIds = new Set(schools.map((s: any) => norm(s.id)));

  const allDbs = getAllClientDatabases();
  const [assignmentsSnaps, subSnaps, jdiExamsSnaps] = await Promise.all([
    Promise.all(
      allDbs.map((dbInst) =>
        getDocs(collection(dbInst, 'assignments')).catch(() => ({ docs: [] } as any))
      )
    ),
    Promise.all(
      allDbs.map((dbInst) =>
        getDocs(collection(dbInst, 'assignmentSubmissions')).catch(() => ({ docs: [] } as any))
      )
    ),
    Promise.all(
      allDbs.map((dbInst) =>
        getDocs(collection(dbInst, 'jdiExams')).catch(() => ({ docs: [] } as any))
      )
    ),
  ]);

  const subsByAssignment = new Map<string, Array<Record<string, any>>>();
  subSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      const sub = { id: d.id, ...d.data() };
      const aId = norm(sub.assignmentId);
      if (!aId) return;
      const list = subsByAssignment.get(aId) || [];
      if (!list.some((x) => x.id === sub.id)) list.push(sub);
      subsByAssignment.set(aId, list);
    });
  });

  const rawAssignments = new Map<string, Record<string, any>>();
  assignmentsSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => rawAssignments.set(d.id, { id: d.id, ...d.data() }));
  });

  const linkedExamIds = new Set<string>();
  const results: UnifiedAssignmentRecord[] = [];

  rawAssignments.forEach((a) => {
    const isTutorOwner = norm(a.tutorId || a.staffId) === uid;
    const isAssignedStudent = a.studentId && studentById.has(norm(a.studentId));
    const isAssignedSchool = a.schoolId && allowedSchoolIds.has(norm(a.schoolId));
    if (!isTutorOwner && !isAssignedStudent && !isAssignedSchool) return;

    if (a.examId) linkedExamIds.add(norm(a.examId));

    const isSchoolGrade =
      norm(a.targetMode || a.recipientMode).toUpperCase() === 'SCHOOL_GRADE' ||
      norm(a.targetMode || a.recipientMode).toUpperCase() === 'SCHOOL_CLASS' ||
      (!a.studentId && Boolean(a.schoolId));

    if (params.selectedSchoolId && params.selectedSchoolId !== 'all') {
      if (norm(a.schoolId) !== params.selectedSchoolId) return;
    }
    if (params.selectedClass && params.selectedClass !== 'all') {
      const targetCls = a.classIds || a.targetClass || a.className || '';
      if (targetCls && !classesMatch(params.selectedClass, targetCls)) return;
    }

    const subs = subsByAssignment.get(a.id) || [];

    if (params.selectedStudentId) {
      const targetStudent = studentById.get(params.selectedStudentId);
      if (isSchoolGrade && targetStudent) {
        const matchesSch = norm(targetStudent.schoolId) === norm(a.schoolId);
        const matchesCls = classesMatch(
          targetStudent.class || targetStudent.grade,
          a.classIds || a.targetClass || a.className
        );
        if (!matchesSch || !matchesCls) return;
      } else if (norm(a.studentId) !== params.selectedStudentId) {
        return;
      }
    }

    // If a school+grade assignment has individual student submissions, surface each submission so the tutor can review & grade it, plus the master school+grade assignment card
    const dueDate = toIso(a.dueDate);
    const maxMarks = Math.max(1, Number(a.maxMarks || a.maxPoints || 100) || 100);
    const targetClass = normalizeClassName(a.targetClass || a.className || '', 'Grade 1');

    if (isSchoolGrade && subs.length > 0 && !params.selectedStudentId) {
      subs.forEach((sub) => {
        const grade =
          sub.grade !== undefined && sub.grade !== null && Number.isFinite(Number(sub.grade))
            ? Number(sub.grade)
            : null;
        const displayStatus = computeAssignmentDisplayStatus({
          rawStatus: sub.status || 'SUBMITTED',
          reviewStatus: sub.reviewStatus,
          submittedAt: toIso(sub.submittedAt),
          submissionText: sub.submissionText,
          submissionUrl: sub.submissionUrl,
          grade,
          dueDate,
        });
        results.push({
          id: `${a.id}__${sub.studentId}`,
          sourceCollection: 'assignments',
          submissionDocId: sub.id,
          title: norm(a.title || 'Assignment'),
          description: norm(a.description || a.instructions || ''),
          instructions: norm(a.instructions || a.description || ''),
          subject: norm(a.subject || a.programName || 'General'),
          programName: norm(a.programName || a.subject || 'General'),
          activityType: (norm(a.activityType || 'ASSIGNMENT').toUpperCase() as any) || 'ASSIGNMENT',
          targetMode: 'SCHOOL_GRADE',
          schoolId: norm(a.schoolId),
          schoolName: resolvePartnerSchoolName(a.schoolName, 'Partner School'),
          targetClass,
          classIds: normalizeClassList(a.classIds || [targetClass]),
          studentId: norm(sub.studentId),
          studentName: `${norm(sub.studentName || 'School Student')} (${targetClass})`,
          tutorId: norm(a.tutorId || uid),
          tutorName: norm(a.tutorName || 'Tutor'),
          assignedDate: toIso(a.createdAt),
          dueDate,
          status: displayStatus === 'GRADED' ? 'COMPLETED' : displayStatus,
          displayStatus,
          grade,
          maxMarks,
          percentage: grade !== null ? calculateScorePercentage(grade, maxMarks) : null,
          isUngraded: Boolean(a.isUngraded),
          feedback: norm(sub.feedback) || null,
          submissionText: norm(sub.submissionText) || null,
          submissionUrl: norm(sub.submissionUrl) || null,
          submittedAt: toIso(sub.submittedAt),
          reviewedAt: toIso(sub.reviewedAt),
          reviewStatus: norm(sub.reviewStatus) || null,
          resourceTitle: norm(a.resourceTitle) || null,
          resourceUrl: norm(a.resourceUrl) || null,
        });
      });
    }

    const selectedSub = params.selectedStudentId
      ? subs.find((s) => norm(s.studentId) === params.selectedStudentId)
      : null;

    const grade =
      selectedSub?.grade !== undefined && selectedSub?.grade !== null
        ? Number(selectedSub.grade)
        : !isSchoolGrade && a.grade !== undefined && a.grade !== null
        ? Number(a.grade)
        : null;

    const submissionText = norm(selectedSub?.submissionText ?? (!isSchoolGrade ? a.submissionText : '')) || null;
    const submissionUrl = norm(selectedSub?.submissionUrl ?? (!isSchoolGrade ? a.submissionUrl : '')) || null;
    const submittedAt = toIso(selectedSub?.submittedAt ?? (!isSchoolGrade ? a.submittedAt : null));

    const displayStatus = computeAssignmentDisplayStatus({
      rawStatus: selectedSub?.status || (!isSchoolGrade ? a.status : 'PUBLISHED'),
      reviewStatus: selectedSub?.reviewStatus || (!isSchoolGrade ? a.reviewStatus : null),
      submittedAt,
      submissionText,
      submissionUrl,
      grade,
      dueDate,
    });

    const eligibleCount = isSchoolGrade
      ? students.filter(
          (s) =>
            norm(s.schoolId) === norm(a.schoolId) &&
            classesMatch(s.class || s.grade, a.classIds || a.targetClass || a.className)
        ).length
      : 1;

    results.push({
      id: a.id,
      sourceCollection: 'assignments',
      submissionDocId: selectedSub?.id,
      title: norm(a.title || 'Assignment'),
      description: norm(a.description || a.instructions || ''),
      instructions: norm(a.instructions || a.description || ''),
      subject: norm(a.subject || a.programName || 'General'),
      programName: norm(a.programName || a.subject || 'General'),
      activityType: (norm(a.activityType || 'ASSIGNMENT').toUpperCase() as any) || 'ASSIGNMENT',
      targetMode: isSchoolGrade ? 'SCHOOL_GRADE' : 'INDIVIDUAL',
      schoolId: norm(a.schoolId),
      schoolName: resolvePartnerSchoolName(a.schoolName, isSchoolGrade ? 'Partner School' : ''),
      targetClass,
      classIds: normalizeClassList(a.classIds || [targetClass]),
      studentId: norm(params.selectedStudentId || a.studentId || ''),
      studentName: isSchoolGrade
        ? `${resolvePartnerSchoolName(a.schoolName, 'Partner School')} • ${targetClass} (${eligibleCount} eligible learner${eligibleCount === 1 ? '' : 's'})`
        : norm(a.studentName || studentById.get(norm(a.studentId))?.fullName || 'Student'),
      tutorId: norm(a.tutorId || uid),
      tutorName: norm(a.tutorName || 'Tutor'),
      assignedDate: toIso(a.createdAt),
      dueDate,
      status: displayStatus === 'GRADED' ? 'COMPLETED' : displayStatus,
      displayStatus,
      grade,
      maxMarks,
      percentage: grade !== null ? calculateScorePercentage(grade, maxMarks) : null,
      isUngraded: Boolean(a.isUngraded),
      feedback: norm(selectedSub?.feedback ?? (!isSchoolGrade ? a.feedback : '')) || null,
      submissionText,
      submissionUrl,
      submittedAt,
      reviewedAt: toIso(selectedSub?.reviewedAt ?? (!isSchoolGrade ? a.reviewedAt : null)),
      reviewStatus: norm(selectedSub?.reviewStatus ?? (!isSchoolGrade ? a.reviewStatus : '')) || null,
      resourceTitle: norm(a.resourceTitle) || null,
      resourceUrl: norm(a.resourceUrl) || null,
      eligibleStudentCount: eligibleCount,
      submissionCount: subs.length,
    });
  });

  // Also include `jdiExams` where workType === 'ASSIGNMENT' created by this tutor or for their schools
  jdiExamsSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      const exam = { id: d.id, ...d.data() };
      if (linkedExamIds.has(exam.id) || rawAssignments.has(exam.id)) return;
      if (normalizeWorkType(exam.workType, exam) !== 'ASSIGNMENT') return;
      const isOwner = norm(exam.tutorId || exam.createdBy) === uid;
      const isAllowedSchool = exam.schoolId && allowedSchoolIds.has(norm(exam.schoolId));
      if (!isOwner && !isAllowedSchool) return;

      if (params.selectedSchoolId && params.selectedSchoolId !== 'all') {
        if (norm(exam.schoolId) !== params.selectedSchoolId) return;
      }
      const targetClass = normalizeClassName(exam.targetClass || exam.className || '', 'Grade 1');
      if (params.selectedClass && params.selectedClass !== 'all') {
        if (!classesMatch(params.selectedClass, exam.classIds || [targetClass])) return;
      }

      const isSchoolGrade =
        norm(exam.recipientMode).toUpperCase() !== 'PRIVATE_LEARNERS' &&
        norm(exam.schoolId) !== 'private';

      if (params.selectedStudentId) {
        const targetStudent = studentById.get(params.selectedStudentId);
        if (!targetStudent) return;
        const eligible = isStudentEligibleForWork(
          {
            id: targetStudent.id,
            uid: targetStudent.firebaseUid || targetStudent.id,
            schoolId: targetStudent.schoolId,
            schoolName: targetStudent.schoolName,
            className: targetStudent.class || targetStudent.grade,
          },
          exam
        );
        if (!eligible) return;
      }

      const dueDate = toIso(exam.dueDate || exam.availableUntil);
      const maxMarks = Math.max(1, computeExamMaxScore(exam) || 20);
      results.push({
        id: exam.id,
        sourceCollection: 'jdiExams',
        examId: exam.id,
        title: norm(exam.title || 'Assignment'),
        description: norm(exam.description || exam.instructions || ''),
        instructions: norm(exam.instructions || exam.description || ''),
        subject: norm(exam.subject || 'General'),
        programName: norm(exam.courseName || exam.subject || 'General'),
        activityType: 'ASSIGNMENT',
        targetMode: isSchoolGrade ? 'SCHOOL_GRADE' : 'INDIVIDUAL',
        schoolId: norm(exam.schoolId),
        schoolName: resolvePartnerSchoolName(exam.schoolName, isSchoolGrade ? 'Partner School' : 'Private Learner'),
        targetClass,
        classIds: normalizeClassList(exam.classIds || [targetClass]),
        studentId: norm(params.selectedStudentId || (exam.targetStudentIds?.[0] ?? '')),
        studentName: isSchoolGrade
          ? `${resolvePartnerSchoolName(exam.schoolName, 'Partner School')} • ${targetClass}`
          : 'Assigned Private Learner(s)',
        tutorId: norm(exam.tutorId || exam.createdBy || uid),
        tutorName: norm(exam.tutorName || 'Tutor'),
        assignedDate: toIso(exam.createdAt || exam.updatedAt),
        dueDate,
        status: 'PUBLISHED',
        displayStatus: computeAssignmentDisplayStatus({
          rawStatus: 'PUBLISHED',
          dueDate,
        }),
        grade: null,
        maxMarks,
        percentage: null,
        isUngraded: Boolean(exam.isUngradedActivity),
        feedback: null,
        submissionText: null,
        submissionUrl: null,
        submittedAt: null,
        reviewedAt: null,
        reviewStatus: null,
        resourceTitle: norm(exam.resourceTitle) || null,
        resourceUrl: norm(exam.resourceUrl || exam.videoUrl) || null,
      });
    });
  });

  return results.sort((a, b) => {
    const da = a.submittedAt || a.assignedDate || a.dueDate || '';
    const dbDate = b.submittedAt || b.assignedDate || b.dueDate || '';
    return dbDate.localeCompare(da);
  });
}

/**
 * Publishes a new Assignment, Learning Activity, Quiz, Test, or Examination from the Tutor Workspace,
 * supporting both School + Grade targeting and Individual Student targeting.
 * Automatically identifies all eligible students in the selected School + Grade and notifies both
 * the students and their linked parents.
 */
export async function createUnifiedAssignmentOrActivity(input: {
  targetMode: 'SCHOOL_GRADE' | 'INDIVIDUAL';
  schoolId?: string;
  schoolName?: string;
  targetClass?: string;
  studentId?: string;
  activityType: 'ASSIGNMENT' | 'ACTIVITY' | 'QUIZ' | 'TEST' | 'EXAMINATION';
  subject: string;
  programName?: string;
  title: string;
  instructions: string;
  dueDate: string;
  maxMarks?: number;
  isUngraded?: boolean;
  submissionRequirement?: 'both' | 'link' | 'text' | 'none';
  resourceTitle?: string;
  resourceUrl?: string;
  externalUrl?: string;
}): Promise<{ id: string; eligibleStudentsCount: number }> {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  const uid = norm(effective.effectiveUid || currentUser?.uid || '');
  if (!uid) throw new Error('Please sign in to your tutor account.');

  const tutorName = norm(
    effective.effectiveName ||
      currentUser?.displayName ||
      sessionStorage.getItem('userName') ||
      'Assigned Tutor'
  );
  const tutorEmail = normLower(
    effective.effectiveEmail || currentUser?.email || sessionStorage.getItem('userEmail') || ''
  );

  const title = norm(input.title);
  const instructions = norm(input.instructions);
  const subject = norm(input.subject || input.programName || 'General');
  const programName = norm(input.programName || input.subject || 'General');
  if (!title) throw new Error('Please provide a title for this activity.');
  if (!instructions) throw new Error('Please provide instructions or a description.');

  const activityType = input.activityType || 'ASSIGNMENT';
  const isUngraded = Boolean(input.isUngraded || (activityType === 'ACTIVITY' && input.maxMarks === 0));
  const maxMarks = isUngraded ? 0 : Math.max(1, Number(input.maxMarks || 100) || 100);
  const submissionRequirement = input.submissionRequirement || 'both';
  const dueDateIso = input.dueDate ? new Date(input.dueDate).toISOString() : null;

  // Discover all eligible students for notifications and metadata
  const allStudents = await fetchAcademicStudentsFallback();
  let eligibleStudents: any[] = [];
  let resolvedSchoolId = norm(input.schoolId);
  let resolvedSchoolName = resolvePartnerSchoolName(input.schoolName);
  let resolvedClass = normalizeClassName(input.targetClass || 'Grade 1', 'Grade 1');

  if (input.targetMode === 'SCHOOL_GRADE') {
    if (!resolvedSchoolId) throw new Error('Please select a target school.');
    if (!resolvedClass) throw new Error('Please select a target grade or class.');

    if (!resolvedSchoolName) {
      const sDoc = await getDoc(doc(db, 'schools', resolvedSchoolId)).catch(() => null);
      if (sDoc?.exists()) {
        const sData = sDoc.data() || {};
        resolvedSchoolName = resolvePartnerSchoolName(sData.name, sData.schoolName) || 'Partner School';
      } else {
        resolvedSchoolName = 'Partner School';
      }
    }

    eligibleStudents = allStudents.filter(
      (s) =>
        norm(s.schoolId) === resolvedSchoolId &&
        classesMatch(s.class || s.grade, [resolvedClass])
    );
  } else {
    const sid = norm(input.studentId);
    if (!sid) throw new Error('Please select a target student.');
    const found = allStudents.find((s) => s.id === sid || s.firebaseUid === sid);
    if (found) {
      eligibleStudents = [found];
      resolvedSchoolId = norm(found.schoolId);
      resolvedSchoolName = resolvePartnerSchoolName(found.schoolName);
      resolvedClass = normalizeClassName(found.class || found.grade || 'Grade 1', 'Grade 1');
    } else {
      const profile = await resolveStudentLearnerProfile(sid);
      if (profile) {
        eligibleStudents = [
          {
            id: profile.id,
            fullName: profile.fullName,
            firebaseUid: profile.studentUid,
            parentId: profile.parentId,
            schoolId: profile.schoolId,
            schoolName: profile.schoolName,
            class: profile.className,
          },
        ];
        resolvedSchoolId = profile.schoolId;
        resolvedSchoolName = profile.schoolName;
        resolvedClass = profile.className;
      }
    }
  }

  const eligibleStudentIds = Array.from(
    new Set(
      eligibleStudents
        .flatMap((s) => [s.id, s.firebaseUid])
        .map((v) => norm(v))
        .filter(Boolean)
    )
  );
  const eligibleParentIds = Array.from(
    new Set(eligibleStudents.map((s) => norm(s.parentId)).filter(Boolean))
  );

  const workId = `${activityType.toLowerCase()}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const mappedWorkType =
    activityType === 'QUIZ' || activityType === 'TEST'
      ? 'TEST'
      : activityType === 'EXAMINATION'
      ? 'EXAMINATION'
      : activityType === 'ACTIVITY'
      ? 'ACTIVITY'
      : 'ASSIGNMENT';

  const singleStudent = input.targetMode === 'INDIVIDUAL' ? eligibleStudents[0] : null;

  // 1. Always write to `assignments` if it is an ASSIGNMENT or ACTIVITY or targeted coursework
  if (activityType === 'ASSIGNMENT' || activityType === 'ACTIVITY') {
    const assignmentPayload: Record<string, any> = {
      id: workId,
      examId: workId,
      title,
      description: instructions,
      instructions,
      subject,
      programName,
      activityType,
      workType: mappedWorkType,
      targetMode: input.targetMode,
      recipientMode: input.targetMode === 'SCHOOL_GRADE' ? 'SCHOOL_CLASS' : 'PRIVATE_LEARNERS',
      schoolId: input.targetMode === 'SCHOOL_GRADE' ? resolvedSchoolId : resolvedSchoolId || null,
      schoolName: input.targetMode === 'SCHOOL_GRADE' ? resolvedSchoolName : resolvedSchoolName || null,
      targetClass: resolvedClass,
      className: resolvedClass,
      classIds: [resolvedClass],
      studentId: singleStudent ? singleStudent.id : null,
      studentUserId: singleStudent ? singleStudent.firebaseUid || null : null,
      studentName: singleStudent
        ? singleStudent.fullName
        : `${resolvedSchoolName} • ${resolvedClass}`,
      parentId: singleStudent ? singleStudent.parentId || null : null,
      eligibleStudentIds,
      eligibleParentIds,
      eligibleStudentCount: eligibleStudents.length,
      tutorId: uid,
      staffId: uid,
      tutorName,
      tutorEmail,
      dueDate: dueDateIso,
      maxMarks,
      maxPoints: maxMarks,
      isUngraded,
      submissionRequirement,
      resourceTitle: norm(input.resourceTitle) || null,
      resourceUrl: norm(input.resourceUrl) || null,
      status: 'PUBLISHED',
      grade: null,
      feedback: null,
      submissionText: null,
      submissionUrl: null,
      submittedAt: null,
      reviewedAt: null,
      reviewStatus: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    for (const dbInst of getAllClientDatabases()) {
      await setDoc(doc(dbInst, 'assignments', workId), assignmentPayload, { merge: true });
    }
  }

  // 2. Also write to `jdiExams` and `schoolExams` so the unified Assessment & Work engine
  // (`StudentExaminations`, `AssessmentCenter`, `TutorExaminations`, `SchoolLearnerInsights`) stays 100% synchronized
  const deliverableQuestionType =
    submissionRequirement === 'link'
      ? 'link_submission'
      : submissionRequirement === 'none'
      ? 'learning_resource'
      : 'practical_task';

  const passcode = `JDI-${Math.floor(100000 + Math.random() * 900000)}`;
  const examPayload: Record<string, any> = {
    id: workId,
    title,
    description: instructions,
    instructions,
    subject,
    courseName: programName,
    workType: mappedWorkType,
    assessmentType: activityType,
    isUngradedActivity: isUngraded,
    submissionFormat: 'DELIVERABLE',
    taskSubmissionMethod: submissionRequirement,
    isTaskOnlyAssignment: true,
    dueDate: dueDateIso,
    recipientMode: input.targetMode === 'SCHOOL_GRADE' ? 'SCHOOL_CLASS' : 'PRIVATE_LEARNERS',
    targetSchoolIds: input.targetMode === 'SCHOOL_GRADE' && resolvedSchoolId ? [resolvedSchoolId] : [],
    targetStudentIds:
      input.targetMode === 'INDIVIDUAL' && singleStudent
        ? Array.from(new Set([singleStudent.id, singleStudent.firebaseUid].filter(Boolean)))
        : eligibleStudentIds,
    schoolId:
      input.targetMode === 'SCHOOL_GRADE'
        ? resolvedSchoolId
        : resolvedSchoolId || 'private',
    schoolName:
      input.targetMode === 'SCHOOL_GRADE' ? resolvedSchoolName : 'Private Learner(s)',
    targetClass: resolvedClass,
    className: resolvedClass,
    classIds: [resolvedClass],
    deliveryMode: input.externalUrl ? 'EXTERNAL_LINK' : 'NATIVE',
    externalUrl: norm(input.externalUrl),
    resourceTitle: norm(input.resourceTitle) || null,
    resourceUrl: norm(input.resourceUrl) || '',
    videoUrl: norm(input.resourceUrl) || '',
    hasTimeLimit: mappedWorkType === 'EXAMINATION' || mappedWorkType === 'TEST',
    durationMinutes:
      mappedWorkType === 'EXAMINATION' ? 30 : mappedWorkType === 'TEST' ? 20 : null,
    gradingMode: 'manual',
    status: 'active',
    passcode,
    availableFrom: new Date().toISOString(),
    availableUntil: dueDateIso,
    questions: [
      {
        id: 'q_deliverable_1',
        type: deliverableQuestionType,
        prompt: instructions || title,
        options: [],
        correctOptionIds: [],
        acceptedAnswers: [],
        points: isUngraded ? 0 : maxMarks,
        required: !isUngraded,
        submissionMethod: submissionRequirement,
        resourceUrl: norm(input.resourceUrl),
        videoUrl: norm(input.resourceUrl),
        deliverableInstructions: instructions,
      },
    ],
    questionCount: 1,
    maxScore: isUngraded ? 0 : maxMarks,
    createdBy: uid,
    tutorId: uid,
    tutorName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  for (const dbInst of getAllClientDatabases()) {
    await setDoc(doc(dbInst, 'jdiExams', workId), examPayload, { merge: true });
    await setDoc(doc(dbInst, 'schoolExams', workId), examPayload, { merge: true });
  }

  // 3. Notify eligible students and their linked parents idempotently (Part 5)
  const isActivity = activityType === 'ACTIVITY';
  const studentNotifTitle = isActivity ? 'New Activity' : `New ${activityType === 'ASSIGNMENT' ? 'Assignment' : activityType.toLowerCase()}`;
  const studentNotifMessage = isActivity
    ? `A new learning activity has been assigned to you by ${tutorName}. Activity: ${title}${subject ? ` (${subject})` : ''}. Open your activities section to get started.`
    : `You have received a new ${activityType.toLowerCase()} from ${tutorName}. ${activityType === 'ASSIGNMENT' ? 'Assignment' : 'Assessment'}: ${title}${subject ? ` (${subject})` : ''}. Open your assignments section to view the instructions and submission requirements.`;
  const studentPortalLink =
    activityType === 'ASSIGNMENT'
      ? '/portal/student/assignments'
      : '/portal/student/assessments';

  const notifyPromises: Promise<any>[] = [];
  const notifiedStudentUids = new Set<string>();
  const notifiedParentIds = new Set<string>();

  eligibleStudents.forEach((st) => {
    const studentUid = norm(st.firebaseUid || st.id);
    if (studentUid && !notifiedStudentUids.has(studentUid)) {
      notifiedStudentUids.add(studentUid);
      const studentNotifId = `notif-assign-${workId}-${studentUid}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const studentPayload = {
        id: studentNotifId,
        recipientId: studentUid,
        userId: studentUid,
        studentId: st.id,
        title: studentNotifTitle,
        message: studentNotifMessage,
        type: 'assessment_published',
        category: activityType.toLowerCase(),
        read: false,
        priority: 'normal',
        assignmentId: workId,
        examId: workId,
        tutorId: uid,
        tutorName,
        link: studentPortalLink,
        actionUrl: studentPortalLink,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      for (const dbInst of getAllClientDatabases()) {
        notifyPromises.push(
          setDoc(doc(dbInst, 'notifications', studentNotifId), studentPayload, { merge: true }).catch(() => null),
          setDoc(doc(dbInst, 'jdiNotifications', studentNotifId), studentPayload, { merge: true }).catch(() => null)
        );
      }
    }
    const pId = norm(st.parentId);
    if (pId && !notifiedParentIds.has(pId)) {
      notifiedParentIds.add(pId);
      const parentNotifId = `notif-assign-parent-${workId}-${pId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const parentPortalLink =
        activityType === 'ASSIGNMENT'
          ? '/portal/parent/assignments'
          : '/portal/parent/assessments';
      const parentPayload = {
        id: parentNotifId,
        recipientId: pId,
        userId: pId,
        title: `New ${activityType.toLowerCase()} for ${st.fullName || 'your child'}`,
        message: `${st.fullName || 'Your child'} has received a new ${activityType.toLowerCase()} from ${tutorName} in ${subject}: "${title}".`,
        type: 'assessment_published',
        read: false,
        priority: 'normal',
        assignmentId: workId,
        examId: workId,
        studentId: st.id,
        tutorId: uid,
        tutorName,
        link: parentPortalLink,
        actionUrl: parentPortalLink,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      for (const dbInst of getAllClientDatabases()) {
        notifyPromises.push(
          setDoc(doc(dbInst, 'notifications', parentNotifId), parentPayload, { merge: true }).catch(() => null),
          setDoc(doc(dbInst, 'jdiNotifications', parentNotifId), parentPayload, { merge: true }).catch(() => null)
        );
      }
    }
  });
  await Promise.all(notifyPromises);

  return { id: workId, eligibleStudentsCount: eligibleStudents.length };
}

/**
 * Submits work for an assignment on behalf of the student, handling both individual assignments,
 * school+grade assignments (without overwriting other classmates' submissions), and `jdiExams` assignments.
 */
export async function submitUnifiedAssignment(params: {
  assignment: UnifiedAssignmentRecord;
  learner: LinkedLearnerProfile;
  submissionText: string;
  submissionUrl: string;
}): Promise<void> {
  const { assignment, learner } = params;
  const cleanText = norm(params.submissionText);
  const cleanUrl = norm(params.submissionUrl);
  if (!cleanText && !cleanUrl) {
    throw new Error('Please provide your answer text or a valid submission link before submitting.');
  }

  const realAssignmentId = assignment.id.includes('__')
    ? assignment.id.split('__')[0]
    : assignment.id;
  const subDocId = `${realAssignmentId}__${learner.id}`;

  const submissionPayload = {
    id: subDocId,
    assignmentId: realAssignmentId,
    examId: assignment.examId || realAssignmentId,
    studentId: learner.id,
    studentUid: learner.studentUid || learner.id,
    studentName: learner.fullName,
    className: learner.className,
    schoolId: learner.schoolId || null,
    schoolName: learner.schoolName || null,
    parentId: learner.parentId || null,
    submissionText: cleanText || null,
    submissionUrl: cleanUrl || null,
    status: 'SUBMITTED',
    reviewStatus: 'AWAITING_REVIEW',
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  for (const dbInst of getAllClientDatabases()) {
    // 1. Always write per-student submission record to `assignmentSubmissions`
    await setDoc(doc(dbInst, 'assignmentSubmissions', subDocId), submissionPayload, {
      merge: true,
    }).catch(() => null);

    // 2. If it's an individual assignment in `assignments`, also update the main document directly
    if (assignment.sourceCollection === 'assignments' && assignment.targetMode === 'INDIVIDUAL') {
      await updateDoc(doc(dbInst, 'assignments', realAssignmentId), {
        submissionText: cleanText || null,
        submissionUrl: cleanUrl || null,
        status: 'SUBMITTED',
        reviewStatus: 'AWAITING_REVIEW',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => null);
    }

    // 3. Also sync to `jdiExamAttempts` so the submission appears in Tutor Proctor / Assessment History / Learner Insights
    const examId = assignment.examId || realAssignmentId;
    const attemptId = assignment.attemptId || `attempt_${examId}_${learner.id}`;
    await setDoc(
      doc(dbInst, 'jdiExamAttempts', attemptId),
      {
        id: attemptId,
        examId,
        examTitle: assignment.title,
        subject: assignment.subject,
        workType: 'ASSIGNMENT',
        studentId: learner.id,
        studentUid: learner.studentUid || learner.id,
        studentName: learner.fullName,
        className: learner.className,
        schoolId: learner.schoolId || 'private',
        schoolName: learner.schoolName || 'Private Coaching',
        status: 'submitted',
        maxScore: assignment.maxMarks || 100,
        answers: {
          q_deliverable_1: {
            text: cleanText,
            url: cleanUrl,
          },
        },
        submittedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => null);
  }
}

/**
 * Reviews and grades an assignment submission from the Tutor workspace,
 * updating `assignmentSubmissions`, `assignments`, and `jdiExamAttempts` in lockstep.
 */
export async function reviewUnifiedAssignment(params: {
  assignment: UnifiedAssignmentRecord;
  grade: number | null;
  feedback: string;
  reviewStatus: 'COMPLETED' | 'RESUBMISSION_REQUIRED';
}): Promise<void> {
  const { assignment, grade, feedback, reviewStatus } = params;
  const realAssignmentId = assignment.id.includes('__')
    ? assignment.id.split('__')[0]
    : assignment.id;
  const studentId = assignment.id.includes('__')
    ? assignment.id.split('__')[1]
    : assignment.studentId;

  const finalStatus = reviewStatus === 'COMPLETED' ? 'COMPLETED' : 'RESUBMISSION_REQUIRED';
  const subDocId = assignment.submissionDocId || (studentId ? `${realAssignmentId}__${studentId}` : '');

  for (const dbInst of getAllClientDatabases()) {
    if (subDocId) {
      await setDoc(
        doc(dbInst, 'assignmentSubmissions', subDocId),
        {
          assignmentId: realAssignmentId,
          studentId,
          grade,
          feedback: norm(feedback),
          reviewStatus,
          status: finalStatus,
          reviewedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null);
    }

    if (assignment.sourceCollection === 'assignments' && assignment.targetMode === 'INDIVIDUAL') {
      await updateDoc(doc(dbInst, 'assignments', realAssignmentId), {
        grade,
        feedback: norm(feedback),
        reviewStatus,
        status: finalStatus,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => null);
    }

    const examId = assignment.examId || realAssignmentId;
    if (studentId) {
      const attemptId = assignment.attemptId || `attempt_${examId}_${studentId}`;
      const maxScore = assignment.maxMarks || 100;
      const pct = grade !== null ? calculateScorePercentage(grade, maxScore) : 0;
      await setDoc(
        doc(dbInst, 'jdiExamAttempts', attemptId),
        {
          examId,
          studentId,
          score: grade,
          maxScore,
          percentage: pct,
          feedback: norm(feedback),
          tutorFeedback: norm(feedback),
          status: reviewStatus === 'COMPLETED' ? 'graded' : 'in_progress',
          resultReleased: reviewStatus === 'COMPLETED',
          releasedAt: reviewStatus === 'COMPLETED' ? new Date().toISOString() : null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null);
    }
  }
}

/**
 * Retrieves all Assessments, Quizzes, Tests, and Learning Activities for a single learner,
 * combining assigned items (`jdiExams`, `schoolExams`, `exams`), participation attempts (`jdiExamAttempts`),
 * and recorded tutor assessments (`academic_assessments`).
 */
export async function fetchAssessmentsAndQuizzesForLearner(
  learner: LinkedLearnerProfile
): Promise<UnifiedAssessmentQuizRecord[]> {
  const allDbs = getAllClientDatabases();
  const [jdiSnaps, schoolExamsSnaps, legacyExamsSnaps, attemptsSnaps, acadAssessSnaps] =
    await Promise.all([
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'jdiExams')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'schoolExams')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'exams')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'jdiExamAttempts')).catch(() => ({ docs: [] } as any))
        )
      ),
      Promise.all(
        allDbs.map((dbInst) =>
          getDocs(collection(dbInst, 'academic_assessments')).catch(() => ({ docs: [] } as any))
        )
      ),
    ]);

  const examDocsMap = new Map<string, Record<string, any>>();
  legacyExamsSnaps.forEach((s) =>
    s.docs?.forEach((d: any) => examDocsMap.set(d.id, { id: d.id, ...d.data() }))
  );
  schoolExamsSnaps.forEach((s) =>
    s.docs?.forEach((d: any) => examDocsMap.set(d.id, { id: d.id, ...d.data() }))
  );
  jdiSnaps.forEach((s) =>
    s.docs?.forEach((d: any) => examDocsMap.set(d.id, { id: d.id, ...d.data() }))
  );

  const learnerIdSet = new Set(learner.allIds);
  const learnerNameLower = normLower(learner.fullName);

  // Collect all attempts belonging to this learner
  const attemptsByExamId = new Map<string, Record<string, any>>();
  attemptsSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      const a = d.data() || {};
      const aStudentIds = [a.studentId, a.studentUid, a.userId]
        .map((v) => norm(v))
        .filter(Boolean);
      const idMatches = aStudentIds.some((id) => learnerIdSet.has(id));
      const nameAndSchoolMatches =
        !idMatches &&
        learnerNameLower &&
        normLower(a.studentName) === learnerNameLower &&
        (!learner.schoolId ||
          !a.schoolId ||
          normLower(a.schoolId) === normLower(learner.schoolId) ||
          learner.schoolAliases.some((al) => normLower(al) === normLower(a.schoolId)));

      if (idMatches || nameAndSchoolMatches) {
        const examKey = norm(a.examId || d.id);
        const prev = attemptsByExamId.get(examKey);
        const isRel = isAttemptResultReleased(a);
        const prevRel = prev ? isAttemptResultReleased(prev) : false;
        if (!prev || isRel || !prevRel) {
          attemptsByExamId.set(examKey, { id: d.id, ...a });
        }
      }
    });
  });

  const recordsMap = new Map<string, UnifiedAssessmentQuizRecord>();
  const now = Date.now();

  const buildFromExamAndAttempt = (
    examId: string,
    exam: Record<string, any>,
    attempt?: Record<string, any>
  ) => {
    const rawWorkType = normalizeWorkType(exam.workType || attempt?.workType, exam);
    const isQuiz =
      norm(exam.assessmentType || exam.type).toUpperCase() === 'QUIZ' ||
      normLower(exam.title || attempt?.examTitle).includes('quiz');
    const workType: UnifiedAssessmentQuizRecord['workType'] = isQuiz
      ? 'QUIZ'
      : rawWorkType;

    const workTypeLabel =
      workType === 'QUIZ'
        ? 'Quiz'
        : workType === 'TEST'
        ? 'Test / Continuous Assessment'
        : workType === 'ACTIVITY'
        ? 'Learning Activity'
        : workType === 'ASSIGNMENT'
        ? 'Assignment'
        : 'Examination';

    const availableFrom = toIso(exam.availableFrom);
    const availableUntil = toIso(exam.availableUntil);
    const dueDate = toIso(exam.dueDate || exam.availableUntil);
    const assignedDate = toIso(exam.createdAt || exam.availableFrom || exam.updatedAt || attempt?.startedAt);
    const submittedAt = toIso(attempt?.submittedAt);
    const released = attempt ? isAttemptResultReleased(attempt) : false;
    const releasedAt = released
      ? toIso(attempt?.releasedAt || attempt?.updatedAt || attempt?.submittedAt)
      : null;

    const fromMs = availableFrom ? new Date(availableFrom).getTime() : 0;
    const untilMs = availableUntil
      ? new Date(availableUntil).getTime()
      : Number.MAX_SAFE_INTEGER;

    const rawAttemptStatus = normLower(attempt?.status);
    const isSubmittedAttempt = ['submitted', 'completed', 'graded', 'expired', 'released'].includes(
      rawAttemptStatus
    );
    const isUngraded = Boolean(exam.isUngradedActivity || attempt?.isUngradedActivity);

    let lifecycleStatus: UnifiedAssessmentLifecycleStatus = 'ONGOING';
    let submissionStatusLabel = 'Assigned • Ready to Start';

    if (released || rawAttemptStatus === 'graded') {
      lifecycleStatus = isUngraded ? 'COMPLETED' : 'GRADED';
      submissionStatusLabel = isUngraded
        ? 'Completed (Practice Activity)'
        : 'Graded & Released';
    } else if (isSubmittedAttempt) {
      if (isUngraded) {
        lifecycleStatus = 'COMPLETED';
        submissionStatusLabel = 'Completed (Practice Activity)';
      } else {
        lifecycleStatus = 'AWAITING_GRADING';
        submissionStatusLabel = 'Submitted • Awaiting Tutor Grading';
      }
    } else if (rawAttemptStatus === 'in_progress') {
      lifecycleStatus = 'ONGOING';
      submissionStatusLabel = 'In Progress';
    } else if (
      (fromMs > 0 && now < fromMs) ||
      normLower(exam.status) === 'scheduled'
    ) {
      lifecycleStatus = 'UPCOMING';
      submissionStatusLabel = 'Upcoming • Not Started';
    } else if (
      normLower(exam.status) === 'completed' ||
      (untilMs < Number.MAX_SAFE_INTEGER && now >= untilMs)
    ) {
      lifecycleStatus = 'COMPLETED';
      submissionStatusLabel = 'Assessment Window Closed';
    } else {
      lifecycleStatus = 'ONGOING';
      submissionStatusLabel = 'Active • Ready to Take';
    }

    const maxScore = computeExamMaxScore(exam, attempt);
    const rawScore =
      (released || rawAttemptStatus === 'graded') && typeof attempt?.score === 'number'
        ? Number(attempt.score)
        : null;
    const score = rawScore !== null && Number.isFinite(rawScore) ? rawScore : null;
    const percentage =
      score !== null && maxScore > 0 ? calculateScorePercentage(score, maxScore) : null;
    const gradeLetter =
      percentage !== null ? calculateGradeLetter(percentage) : '—';

    const deliveryMode = normalizeDeliveryMode(exam);
    const qCount = Array.isArray(exam.questions)
      ? exam.questions.length
      : Array.isArray(attempt?.questionsSnapshot)
      ? attempt.questionsSnapshot.length
      : Number(exam.questionCount || 0);

    recordsMap.set(`${learner.id}__${examId}`, {
      id: `${learner.id}__${examId}`,
      examId,
      attemptId: attempt?.id,
      source: 'jdiExams',
      studentId: learner.id,
      studentName: learner.fullName,
      className: learner.className,
      schoolId: learner.schoolId,
      schoolName:
        resolvePartnerSchoolName(exam.schoolName, attempt?.schoolName, learner.schoolName) ||
        (learner.isSchoolStudent ? 'Assigned Partner School' : 'Private Coaching'),
      isSchoolStudent: learner.isSchoolStudent,
      title: norm(exam.title || attempt?.examTitle || attempt?.title || 'Assessment'),
      description: norm(exam.description || exam.instructions || ''),
      subject: norm(exam.subject || attempt?.subject || learner.programName || 'General'),
      programName: norm(exam.courseName || exam.subject || learner.programName || 'General'),
      tutorName: norm(exam.tutorName || learner.tutorName || 'Assigned Tutor'),
      workType,
      workTypeLabel,
      deliveryMode,
      externalUrl: norm(exam.externalUrl || exam.url || ''),
      resourceUrl: norm(exam.resourceUrl || exam.videoUrl || exam.learningVideoUrl || ''),
      assignedDate,
      availableFrom,
      availableUntil,
      dueDate,
      submittedAt,
      releasedAt,
      durationMinutes: Number(exam.durationMinutes) || null,
      lifecycleStatus,
      submissionStatusLabel,
      rawAttemptStatus: attempt?.status,
      resultReleased: released,
      isUngradedActivity: isUngraded,
      score,
      maxScore,
      percentage,
      gradeLetter,
      feedback:
        released || rawAttemptStatus === 'graded'
          ? norm(attempt?.feedback || attempt?.tutorFeedback || '')
          : '',
      questionCount: qCount,
    });
  };

  // 1. Add all eligible exams from `jdiExams`, `schoolExams`, `exams`
  examDocsMap.forEach((exam, examId) => {
    const eligible = isStudentEligibleForWork(
      {
        id: learner.id,
        uid: learner.studentUid || learner.id,
        studentId: learner.id,
        studentUid: learner.studentUid,
        schoolId: learner.schoolId,
        schoolAliases: learner.schoolAliases,
        schoolName: learner.schoolName,
        className: learner.className,
        class: learner.className,
      },
      exam
    );
    const attempt = attemptsByExamId.get(examId);
    if (!eligible && !attempt) return;
    buildFromExamAndAttempt(examId, exam, attempt);
  });

  // 2. Add any attempt whose exam doc wasn't in `examDocsMap`
  attemptsByExamId.forEach((attempt, examId) => {
    if (recordsMap.has(`${learner.id}__${examId}`)) return;
    buildFromExamAndAttempt(examId, {}, attempt);
  });

  // 3. Add any tutor-recorded assessments from `academic_assessments`
  acadAssessSnaps.forEach((snap) => {
    snap.docs?.forEach((d: any) => {
      const a = d.data() || {};
      const sid = norm(a.studentId);
      if (!learnerIdSet.has(sid)) return;
      const key = `${learner.id}__acad_${d.id}`;
      if (recordsMap.has(key)) return;

      const hasScore = typeof a.score === 'number' && Number.isFinite(a.score);
      const score = hasScore ? Number(a.score) : null;
      const maxScore = Number(a.maxScore || 100) || 100;
      const percentage = score !== null ? calculateScorePercentage(score, maxScore) : null;
      const rawType = norm(a.assessmentType || 'QUIZ').toUpperCase();
      const workType: UnifiedAssessmentQuizRecord['workType'] =
        rawType === 'QUIZ'
          ? 'QUIZ'
          : rawType === 'EXAM' || rawType === 'EXAMINATION'
          ? 'EXAMINATION'
          : rawType === 'ASSIGNMENT' || rawType === 'PROJECT'
          ? 'ASSIGNMENT'
          : rawType === 'PRACTICAL' || rawType === 'ACTIVITY'
          ? 'ACTIVITY'
          : 'TEST';

      recordsMap.set(key, {
        id: key,
        examId: d.id,
        source: 'academic_assessments',
        studentId: learner.id,
        studentName: learner.fullName,
        className: learner.className,
        schoolId: learner.schoolId,
        schoolName:
          learner.schoolName ||
          (learner.isSchoolStudent ? 'Assigned Partner School' : 'Private Coaching'),
        isSchoolStudent: learner.isSchoolStudent,
        title: norm(a.title || 'Recorded Assessment'),
        description: '',
        subject: norm(a.subject || learner.programName || 'General'),
        programName: norm(a.subject || learner.programName || 'General'),
        tutorName: norm(a.tutorName || learner.tutorName || 'Assigned Tutor'),
        workType,
        workTypeLabel:
          workType === 'QUIZ'
            ? 'Quiz'
            : workType === 'EXAMINATION'
            ? 'Examination'
            : workType === 'ACTIVITY'
            ? 'Practical / Activity'
            : 'Assessment',
        deliveryMode: 'NATIVE',
        assignedDate: toIso(a.createdAt || a.updatedAt),
        availableFrom: toIso(a.createdAt),
        availableUntil: null,
        dueDate: null,
        submittedAt: toIso(a.updatedAt || a.createdAt),
        releasedAt: hasScore ? toIso(a.updatedAt || a.createdAt) : null,
        durationMinutes: null,
        lifecycleStatus: hasScore ? 'GRADED' : 'AWAITING_GRADING',
        submissionStatusLabel: hasScore ? 'Graded & Recorded' : 'Recorded • Pending Score',
        resultReleased: hasScore,
        isUngradedActivity: false,
        score,
        maxScore,
        percentage,
        gradeLetter: percentage !== null ? calculateGradeLetter(percentage) : '—',
        feedback: norm(a.feedback || ''),
        questionCount: 0,
      });
    });
  });

  return Array.from(recordsMap.values()).sort((a, b) => {
    const da = a.submittedAt || a.releasedAt || a.assignedDate || a.dueDate || '';
    const dbDate = b.submittedAt || b.releasedAt || b.assignedDate || b.dueDate || '';
    return dbDate.localeCompare(da);
  });
}

/**
 * Retrieves all Assessments, Quizzes, Tests, and Learning Activities across all (or a selected)
 * linked children for a Parent account.
 */
export async function fetchAssessmentsAndQuizzesForParent(
  children: LinkedLearnerProfile[],
  selectedChildId?: string
): Promise<UnifiedAssessmentQuizRecord[]> {
  const targetChildren =
    selectedChildId && selectedChildId !== 'all'
      ? children.filter((c) => c.id === selectedChildId || c.allIds.includes(selectedChildId))
      : children;

  const lists = await Promise.all(
    targetChildren.map((child) => fetchAssessmentsAndQuizzesForLearner(child))
  );

  const combined: UnifiedAssessmentQuizRecord[] = [];
  lists.forEach((l) => combined.push(...l));

  return combined.sort((a, b) => {
    const da = a.submittedAt || a.releasedAt || a.assignedDate || a.dueDate || '';
    const dbDate = b.submittedAt || b.releasedAt || b.assignedDate || b.dueDate || '';
    return dbDate.localeCompare(da);
  });
}

export { CANONICAL_CLASSES };

export const LinkedLearnerProfile = {};
export const UnifiedAssignmentDisplayStatus = {};
export const UnifiedAssignmentStatus = {};
export const UnifiedAssignmentRecord = {};
export const UnifiedAssessmentLifecycleStatus = {};
export const UnifiedAssessmentQuizRecord = {};

