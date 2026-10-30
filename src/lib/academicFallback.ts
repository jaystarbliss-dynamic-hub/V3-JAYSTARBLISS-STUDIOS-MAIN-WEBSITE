import {
  addDoc,
  collection,
  deleteDoc,
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
import { auth, db } from './firebase';
import { buildAttendanceRecordKey, formatNormalizedClassDisplay, resolvePartnerSchoolName } from './classes';
import { getEffectiveAuth } from '../utils/impersonation';

const assignmentFields = [
  'tutorId',
  'staffId',
  'assignedTutorId',
  'assignedStaffId',
  'instructorId',
  'assignedTo',
  'assignedUserId',
];

const toIso = (val: any): string | null => {
  if (!val) return null;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  return null;
};

const normLower = (val: unknown): string => String(val || '').trim().toLowerCase();

export interface AcademicStudentRecord {
  id: string;
  fullName: string;
  studentName: string;
  username: string;
  email: string;
  class: string;
  grade: string;
  plan: string;
  track: string;
  schoolId: string;
  schoolName: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  tutorId: string;
  tutorName: string;
  firebaseUid: string;
  accessCode?: string;
  portalAccessEnabled?: boolean;
  accountStatus?: string;
  assignmentCategory: 'school' | 'private';
  isPrivate: boolean;
}

export interface TutorAssignedContext {
  uid: string;
  email: string;
  name: string;
  role: string;
  isAdmin: boolean;
  aliasTutorIds: Set<string>;
  assignedSchools: Array<{ id: string; name: string; code: string }>;
  assignedSchoolIds: Set<string>;
  schoolNameMap: Map<string, string>;
}

/**
 * Resolves the effective tutor/staff identity (including Admin "Log In As" impersonation),
 * all legacy/alias tutor document IDs, and all assigned partner schools.
 */
export async function resolveTutorAssignedContext(): Promise<TutorAssignedContext> {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  const uid = String(effective.effectiveUid || currentUser?.uid || '').trim();
  const userSnap = uid ? await getDoc(doc(db, 'users', uid)).catch(() => null) : null;
  const userData: Record<string, any> = userSnap?.exists() ? userSnap.data() || {} : {};

  const email = normLower(
    effective.effectiveEmail ||
      userData.email ||
      currentUser?.email ||
      sessionStorage.getItem('userEmail') ||
      ''
  );
  const name = String(
    effective.effectiveName ||
      userData.fullName ||
      userData.name ||
      userData.displayName ||
      currentUser?.displayName ||
      sessionStorage.getItem('userName') ||
      ''
  ).trim();
  const nameLower = normLower(name);

  const role = String(
    effective.effectiveRole ||
      userData.role ||
      sessionStorage.getItem('userRole') ||
      localStorage.getItem('jaystar_cached_user_role') ||
      'TUTOR'
  )
    .trim()
    .toUpperCase();

  const isAdmin =
    !effective.isMasquerading &&
    ['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'ACADEMIC_ADMIN', 'EDUCATION_ADMIN'].some((r) =>
      role.includes(r)
    );

  const aliasTutorIds = new Set<string>();
  if (uid) aliasTutorIds.add(uid);
  if (Array.isArray(userData.aliasTutorIds)) {
    userData.aliasTutorIds.forEach((id: any) => {
      if (id) aliasTutorIds.add(String(id).trim());
    });
  }

  const directSchoolIds = new Set<string>();
  const addSchoolId = (val: any) => {
    if (!val) return;
    if (typeof val === 'string' && val.trim()) directSchoolIds.add(val.trim());
    else if (typeof val === 'object') {
      const candidate = val.id || val.schoolId || val.code;
      if (candidate) directSchoolIds.add(String(candidate).trim());
    }
  };

  addSchoolId(userData.schoolId);
  if (Array.isArray(userData.schoolIds)) userData.schoolIds.forEach(addSchoolId);
  if (Array.isArray(userData.assignedSchools)) userData.assignedSchools.forEach(addSchoolId);
  if (Array.isArray(userData.assignedSchoolIds)) userData.assignedSchoolIds.forEach(addSchoolId);

  // Discover alias tutor IDs and school bindings from `tutors`, `staff`, and `staffSchoolAccess`
  const [tutorsSnap, staffSnap, accessSnap, schoolsSnap] = await Promise.all([
    getDocs(collection(db, 'tutors')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'staff')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'staffSchoolAccess')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
  ]);

  const checkAndAddTutorDoc = (d: any) => {
    const data = d.data() || {};
    const docId = d.id;
    const docUid = String(data.uid || data.userId || data.canonicalUid || '').trim();
    const docEmail = normLower(data.email);
    const docName = normLower(data.fullName || data.name || data.displayName);

    const matches =
      aliasTutorIds.has(docId) ||
      (docUid && aliasTutorIds.has(docUid)) ||
      (email && docEmail && docEmail === email) ||
      (nameLower && docName && docName === nameLower);

    if (matches) {
      aliasTutorIds.add(docId);
      if (docUid) aliasTutorIds.add(docUid);
      if (Array.isArray(data.aliasIds)) {
        data.aliasIds.forEach((a: any) => {
          if (a) aliasTutorIds.add(String(a).trim());
        });
      }
      addSchoolId(data.schoolId);
      if (Array.isArray(data.schoolIds)) data.schoolIds.forEach(addSchoolId);
      if (Array.isArray(data.assignedSchools)) data.assignedSchools.forEach(addSchoolId);
    }
  };

  tutorsSnap.docs?.forEach(checkAndAddTutorDoc);
  staffSnap.docs?.forEach(checkAndAddTutorDoc);

  accessSnap.docs?.forEach((d: any) => {
    const data = d.data() || {};
    const docId = d.id;
    const staffId = String(data.staffId || data.tutorId || '').trim();
    const docEmail = normLower(data.email);
    const aliases = Array.isArray(data.aliasTutorIds) ? data.aliasTutorIds.map(String) : [];

    const matches =
      aliasTutorIds.has(docId) ||
      (staffId && aliasTutorIds.has(staffId)) ||
      aliases.some((a: string) => aliasTutorIds.has(a)) ||
      (email && docEmail && docEmail === email);

    if (matches) {
      aliasTutorIds.add(docId);
      if (staffId) aliasTutorIds.add(staffId);
      aliases.forEach((a: string) => {
        if (a) aliasTutorIds.add(a);
      });
      addSchoolId(data.schoolId);
      if (Array.isArray(data.schoolIds)) data.schoolIds.forEach(addSchoolId);
      if (Array.isArray(data.assignedSchools)) data.assignedSchools.forEach(addSchoolId);
    }
  });

  const assignedSchools: Array<{ id: string; name: string; code: string }> = [];
  const assignedSchoolIds = new Set<string>();
  const schoolNameMap = new Map<string, string>();

  const extractIds = (arr: any): string[] =>
    Array.isArray(arr)
      ? arr
          .map((x: any) =>
            typeof x === 'string'
              ? x.trim()
              : String(x?.tutorId || x?.id || x?.uid || x?.staffId || x?.userId || '').trim()
          )
          .filter(Boolean)
      : [];

  const extractEmails = (arr: any): string[] =>
    Array.isArray(arr)
      ? arr
          .map((x: any) =>
            typeof x === 'object' && x !== null ? normLower(x?.tutorEmail || x?.email) : ''
          )
          .filter(Boolean)
      : [];

  const extractNames = (arr: any): string[] =>
    Array.isArray(arr)
      ? arr
          .map((x: any) =>
            typeof x === 'object' && x !== null ? normLower(x?.tutorName || x?.name) : ''
          )
          .filter(Boolean)
      : [];

  schoolsSnap.docs?.forEach((d: any) => {
    const s = d.data() || {};
    const sId = d.id;
    const sCode = String(s.schoolId || s.code || s.schoolCode || '').trim();
    const sName =
      resolvePartnerSchoolName(s.name, s.schoolName, s.institutionName) || `Partner School (${sId})`;
    schoolNameMap.set(sId, sName);
    if (sCode) schoolNameMap.set(sCode, sName);

    if (isAdmin) {
      assignedSchoolIds.add(sId);
      assignedSchools.push({ id: sId, name: sName, code: sCode });
      return;
    }

    const schoolTutorIds = [
      ...extractIds(s.tutors),
      ...extractIds(s.assignedTutors),
      ...extractIds(s.assignedTutorIds),
      ...extractIds(s.assignedStaff),
      ...extractIds(s.staffIds),
      ...extractIds(s.tutorIds),
      ...(s.tutorId ? [String(s.tutorId).trim()] : []),
      ...(s.staffId ? [String(s.staffId).trim()] : []),
      ...(s.assignedTutorId ? [String(s.assignedTutorId).trim()] : []),
    ];

    const schoolTutorEmails = [
      ...extractEmails(s.tutors),
      ...extractEmails(s.assignedTutors),
      ...extractEmails(s.assignedStaff),
    ];

    const schoolTutorNames = [
      ...extractNames(s.tutors),
      ...extractNames(s.assignedTutors),
      ...extractNames(s.assignedStaff),
    ];

    if (Array.isArray(s.programs)) {
      s.programs.forEach((prog: any) => {
        schoolTutorIds.push(...extractIds(prog?.assignedTutors), ...extractIds(prog?.tutors));
        schoolTutorEmails.push(
          ...extractEmails(prog?.assignedTutors),
          ...extractEmails(prog?.tutors)
        );
        schoolTutorNames.push(...extractNames(prog?.assignedTutors), ...extractNames(prog?.tutors));
      });
    }

    const matched =
      directSchoolIds.has(sId) ||
      (sCode && directSchoolIds.has(sCode)) ||
      schoolTutorIds.some((id) => aliasTutorIds.has(id)) ||
      (email && schoolTutorEmails.includes(email)) ||
      (nameLower && schoolTutorNames.includes(nameLower));

    if (matched) {
      assignedSchoolIds.add(sId);
      assignedSchools.push({ id: sId, name: sName, code: sCode });
    }
  });

  assignedSchools.sort((a, b) => a.name.localeCompare(b.name));

  return {
    uid,
    email,
    name,
    role,
    isAdmin,
    aliasTutorIds,
    assignedSchools,
    assignedSchoolIds,
    schoolNameMap,
  };
}

export async function fetchAcademicStudentsFallback(options?: {
  scope?: string;
  schoolId?: string;
}): Promise<AcademicStudentRecord[]> {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  if (!currentUser && !effective.isMasquerading) return [];

  const uid = String(effective.effectiveUid || currentUser?.uid || '').trim();
  const userSnap = uid ? await getDoc(doc(db, 'users', uid)).catch(() => null) : null;
  const userData: Record<string, any> = userSnap?.exists() ? userSnap.data() || {} : {};
  const rawRole = String(
    effective.effectiveRole ||
      userData.role ||
      sessionStorage.getItem('userRole') ||
      localStorage.getItem('jaystar_cached_user_role') ||
      ''
  )
    .trim()
    .toUpperCase();
  const role =
    options?.scope === 'all'
      ? 'ADMIN'
      : options?.scope === 'school'
      ? 'SCHOOL'
      : options?.scope === 'tutor'
      ? 'TUTOR'
      : rawRole;

  const docs = new Map<string, any>();
  const addDocEntry = (id: string, data: any) => {
    if (!id) return;
    const prev = docs.get(id) || {};
    docs.set(id, { ...prev, ...data, id });
  };

  let schoolNameMap = new Map<string, string>();

  if (['TUTOR', 'STAFF', 'INSTRUCTOR', 'TEACHER', 'FACULTY'].includes(role)) {
    const ctx = await resolveTutorAssignedContext();
    schoolNameMap = ctx.schoolNameMap;
    const nameLower = normLower(ctx.name);

    const [indSnap, stdSnap, enrollSnap, schedSnap] = await Promise.all([
      getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] } as any)),
      getDocs(collection(db, 'students')).catch(() => ({ docs: [] } as any)),
      getDocs(collection(db, 'enrollment_requests')).catch(() => ({ docs: [] } as any)),
      getDocs(collection(db, 'classSchedules')).catch(() => ({ docs: [] } as any)),
    ]);

    // Identify any student IDs or schools linked via classSchedules for this tutor
    const scheduleStudentIds = new Set<string>();
    schedSnap.docs?.forEach((d: any) => {
      const sc = d.data() || {};
      const scTutorId = String(sc.tutorId || '').trim();
      const scTutorEmail = normLower(sc.tutorEmail);
      const scTutorName = normLower(sc.tutorName);
      const matchesTutor =
        (scTutorId && ctx.aliasTutorIds.has(scTutorId)) ||
        (ctx.email && scTutorEmail === ctx.email) ||
        (nameLower && scTutorName === nameLower);
      if (matchesTutor) {
        if (sc.schoolId) ctx.assignedSchoolIds.add(String(sc.schoolId).trim());
        if (sc.studentId) {
          const rawSid = String(sc.studentId).trim();
          scheduleStudentIds.add(rawSid);
          if (rawSid.startsWith('student_')) {
            scheduleStudentIds.add(rawSid.replace(/^student_/, ''));
          }
        }
      }
    });

    const isStudentAssignedToTutor = (docId: string, s: Record<string, any>): boolean => {
      if (ctx.isAdmin) return true;
      const sSchoolId = String(s.schoolId || s.school_id || '').trim();
      if (sSchoolId && ctx.assignedSchoolIds.has(sSchoolId)) return true;

      if (scheduleStudentIds.has(docId)) return true;
      if (s.enrollmentRequestId && scheduleStudentIds.has(String(s.enrollmentRequestId))) return true;

      for (const field of assignmentFields) {
        const val = String(s[field] || '').trim();
        if (val && ctx.aliasTutorIds.has(val)) return true;
      }

      if (ctx.email && normLower(s.tutorEmail) === ctx.email) return true;
      if (nameLower && normLower(s.tutorName || s.assignedTutorName) === nameLower) return true;

      if (Array.isArray(s.assignedTutors)) {
        const matchedInArray = s.assignedTutors.some((at: any) => {
          if (!at) return false;
          if (typeof at === 'string') return ctx.aliasTutorIds.has(at.trim());
          const atId = String(at.tutorId || at.id || at.uid || at.staffId || '').trim();
          const atEmail = normLower(at.tutorEmail || at.email);
          const atName = normLower(at.tutorName || at.name);
          return (
            (atId && ctx.aliasTutorIds.has(atId)) ||
            (ctx.email && atEmail === ctx.email) ||
            (nameLower && atName === nameLower)
          );
        });
        if (matchedInArray) return true;
      }

      return false;
    };

    stdSnap.docs?.forEach((d: any) => {
      const data = d.data() || {};
      if (isStudentAssignedToTutor(d.id, data)) {
        addDocEntry(d.id, data);
      }
    });

    indSnap.docs?.forEach((d: any) => {
      const data = d.data() || {};
      if (isStudentAssignedToTutor(d.id, data)) {
        addDocEntry(d.id, data);
      }
    });

    // Also check enrollment_requests for any private/parent learner assigned to this tutor
    enrollSnap.docs?.forEach((d: any) => {
      const data = d.data() || {};
      if (isStudentAssignedToTutor(d.id, data)) {
        const targetId = String(data.studentDocId || data.studentId || d.id).trim();
        // Check if already present by name
        const cName = normLower(data.studentName || data.childName || data.fullName);
        const alreadyExists = Array.from(docs.values()).some(
          (existing) =>
            existing.id === targetId ||
            (cName && normLower(existing.fullName || existing.studentName || existing.name) === cName)
        );
        if (!alreadyExists && cName) {
          addDocEntry(targetId, {
            fullName: data.studentName || data.childName || data.fullName || 'Private Learner',
            studentName: data.studentName || data.childName || data.fullName || 'Private Learner',
            class: data.class || data.grade || data.studentAge || 'Grade 1',
            plan: data.programName || data.track || data.learningTrack || 'Private Coaching',
            parentId: data.parentId || '',
            parentName: data.parentName || '',
            parentEmail: data.parentEmail || data.email || '',
            tutorId: data.tutorId || ctx.uid,
            tutorName: data.tutorName || ctx.name,
            studentType: 'parent',
          });
        }
      }
    });
  } else if (role === 'PARENT') {
    const parentEmail = normLower(
      effective.effectiveEmail || userData.email || currentUser?.email || ''
    );
    const [indSnap, stdSnap] = await Promise.all([
      getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', uid), limit(100))).catch(
        () => null
      ),
      getDocs(query(collection(db, 'students'), where('parentId', '==', uid), limit(100))).catch(
        () => null
      ),
    ]);
    indSnap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
    stdSnap?.docs.forEach((d) => addDocEntry(d.id, d.data()));

    if (parentEmail) {
      const [indEmailSnap, stdEmailSnap] = await Promise.all([
        getDocs(
          query(collection(db, 'individualStudents'), where('parentEmail', '==', parentEmail), limit(100))
        ).catch(() => null),
        getDocs(
          query(collection(db, 'students'), where('parentEmail', '==', parentEmail), limit(100))
        ).catch(() => null),
      ]);
      indEmailSnap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
      stdEmailSnap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
    }
  } else if (role.includes('SCHOOL')) {
    const sid = String(
      options?.schoolId ||
        effective.effectiveSchoolId ||
        userData.schoolId ||
        userData.schoolDocId ||
        sessionStorage.getItem('schoolId') ||
        sessionStorage.getItem('schoolDocId') ||
        localStorage.getItem('jaystar_cached_school_doc_id') ||
        uid
    );
    for (const colName of ['individualStudents', 'students'] as const) {
      const snap = await getDocs(
        query(collection(db, colName), where('schoolId', '==', sid), limit(400))
      ).catch(() => null);
      snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
    }
  } else if (role.includes('STUDENT')) {
    const candidateId = String(
      effective.effectiveStudentDocId ||
        userData.studentDocId ||
        sessionStorage.getItem('studentDocId') ||
        localStorage.getItem('jaystar_cached_student_doc_id') ||
        ''
    ).trim();
    if (candidateId) {
      for (const colName of ['individualStudents', 'students'] as const) {
        const snap = await getDoc(doc(db, colName, candidateId)).catch(() => null);
        if (snap?.exists()) addDocEntry(snap.id, snap.data());
      }
    }
    if (docs.size === 0 && uid) {
      for (const colName of ['individualStudents', 'students'] as const) {
        const snap = await getDocs(
          query(collection(db, colName), where('firebaseUid', '==', uid), limit(10))
        ).catch(() => null);
        snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
      }
    }
  } else if (role.includes('ADMIN')) {
    const [schoolsSnap, indSnap, stdSnap] = await Promise.all([
      getDocs(collection(db, 'schools')).catch(() => null),
      getDocs(query(collection(db, 'individualStudents'), limit(500))).catch(() => null),
      getDocs(query(collection(db, 'students'), limit(500))).catch(() => null),
    ]);
    schoolsSnap?.docs.forEach((d) => {
      const sd = d.data() || {};
      schoolNameMap.set(
        d.id,
        resolvePartnerSchoolName(sd.name, sd.schoolName, sd.institutionName) || d.id
      );
    });
    stdSnap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
    indSnap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
  }

  // Deduplicate by normalized name + schoolId/parentId if duplicate IDs exist across collections
  const deduplicated = new Map<string, AcademicStudentRecord>();
  Array.from(docs.values()).forEach((s) => {
    const fullName = String(s.fullName || s.studentName || s.name || '').trim();
    if (!fullName) return;
    const schoolId = String(s.schoolId || s.school_id || '').trim();
    const schoolName =
      String(s.schoolName || (schoolId ? schoolNameMap.get(schoolId) : '') || '').trim();
    const isSchoolStudent = Boolean(schoolId && schoolId !== 'private');
    const normalizedClass = formatNormalizedClassDisplay(
      s.class || s.className || s.grade || s.classLevel,
      'Grade 1'
    );
    const plan = String(
      s.plan || s.programName || s.program || s.track || s.learningTrack || 'Digital Literacy & Tech'
    ).trim();
    const existingCode = String(s.accessCode || s.passcode || s.code || '').trim();

    const record: AcademicStudentRecord = {
      id: s.id,
      fullName,
      studentName: fullName,
      username: String(s.username || s.studentUsername || s.id).trim(),
      email: String(s.email || s.studentEmail || s.parentEmail || '').trim(),
      class: normalizedClass,
      grade: normalizedClass,
      plan,
      track: plan,
      schoolId,
      schoolName: isSchoolStudent ? schoolName || 'Partner School' : '',
      parentId: String(s.parentId || '').trim(),
      parentName: String(s.parentName || s.guardianName || '').trim(),
      parentEmail: String(s.parentEmail || s.guardianEmail || '').trim(),
      tutorId: String(
        s.tutorId || s.staffId || s.assignedTutorId || s.assignedStaffId || s.instructorId || ''
      ).trim(),
      tutorName: String(s.tutorName || s.assignedTutorName || '').trim(),
      firebaseUid: String(s.firebaseUid || s.userId || '').trim(),
      accessCode: existingCode || undefined,
      portalAccessEnabled: s.portalAccessEnabled !== false,
      accountStatus: String(s.accountStatus || s.status || 'ACTIVE').toUpperCase(),
      assignmentCategory: isSchoolStudent ? 'school' : 'private',
      isPrivate: !isSchoolStudent,
    };

    deduplicated.set(s.id, record);
  });

  return Array.from(deduplicated.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function fetchAcademicSchoolsFallback() {
  const effective = getEffectiveAuth();
  const currentUser = auth.currentUser;
  if (!currentUser && !effective.isMasquerading) return [];

  const uid = String(effective.effectiveUid || currentUser?.uid || '').trim();
  const userSnap = uid ? await getDoc(doc(db, 'users', uid)).catch(() => null) : null;
  const userData: Record<string, any> = userSnap?.exists() ? userSnap.data() || {} : {};
  const role = String(
    effective.effectiveRole ||
      userData.role ||
      sessionStorage.getItem('userRole') ||
      localStorage.getItem('jaystar_cached_user_role') ||
      ''
  )
    .trim()
    .toUpperCase();

  if (['TUTOR', 'STAFF', 'INSTRUCTOR', 'TEACHER', 'FACULTY'].includes(role) || role.includes('ADMIN')) {
    const ctx = await resolveTutorAssignedContext();
    return ctx.assignedSchools;
  }

  const schools = new Map<string, any>();
  if (role.includes('SCHOOL')) {
    const sid = String(
      effective.effectiveSchoolId ||
        userData.schoolId ||
        userData.schoolDocId ||
        sessionStorage.getItem('schoolId') ||
        sessionStorage.getItem('schoolDocId') ||
        localStorage.getItem('jaystar_cached_school_doc_id') ||
        uid
    );
    const snap = await getDoc(doc(db, 'schools', sid)).catch(() => null);
    if (snap?.exists()) schools.set(snap.id, { id: snap.id, ...snap.data() });
  }

  return Array.from(schools.values())
    .map((s) => ({
      id: s.id,
      name: resolvePartnerSchoolName(s.name, s.schoolName, s.institutionName) || 'School',
      code: s.code || s.schoolCode || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function handleAssignmentsFallback(url: string, options: RequestInit = {}) {
  const effective = getEffectiveAuth();
  const user = auth.currentUser;
  const uid = effective.effectiveUid || user?.uid;
  if (!uid) throw new Error('Please sign in again.');

  const parsedUrl = new URL(url, window.location.origin);
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const studentId = parsedUrl.searchParams.get('studentId') || '';
    const snap = studentId
      ? await getDocs(
          query(collection(db, 'assignments'), where('studentId', '==', studentId), limit(150))
        ).catch(() => null)
      : await getDocs(query(collection(db, 'assignments'), limit(200))).catch(() => null);

    const rows = (snap?.docs || []).map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        dueDate: toIso(data.dueDate),
        createdAt: toIso(data.createdAt),
        submittedAt: toIso(data.submittedAt),
        reviewedAt: toIso(data.reviewedAt),
      };
    });
    return { assignments: rows };
  }

  const body = JSON.parse(String(options.body || '{}'));
  const action = String(body.action || '').trim();

  if (action === 'create') {
    const studentId = String(body.studentId || '').trim();
    let studentName = 'Student';
    for (const colName of ['individualStudents', 'students'] as const) {
      const sSnap = await getDoc(doc(db, colName, studentId)).catch(() => null);
      if (sSnap?.exists()) {
        const sd = sSnap.data() || {};
        studentName = sd.fullName || sd.studentName || sd.name || 'Student';
        break;
      }
    }
    const payload = {
      studentId,
      studentName,
      tutorId: uid,
      tutorName:
        effective.effectiveName ||
        user?.displayName ||
        sessionStorage.getItem('userName') ||
        'Tutor',
      title: String(body.title || '').trim(),
      instructions: String(body.instructions || '').trim(),
      dueDate: body.dueDate || null,
      resourceTitle: String(body.resourceTitle || '').trim() || null,
      resourceUrl: String(body.resourceUrl || '').trim() || null,
      status: 'PUBLISHED',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'assignments'), payload);
    return { assignment: { id: ref.id, ...payload } };
  }

  if (action === 'submit') {
    const assignmentId = String(body.assignmentId || '').trim();
    await updateDoc(doc(db, 'assignments', assignmentId), {
      submissionText: String(body.submissionText || '').trim(),
      submissionUrl: String(body.submissionUrl || '').trim() || null,
      status: 'SUBMITTED',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  }

  if (action === 'review') {
    const assignmentId = String(body.assignmentId || '').trim();
    const reviewStatus = String(body.reviewStatus || 'COMPLETED').toUpperCase();
    await updateDoc(doc(db, 'assignments', assignmentId), {
      grade: body.grade === '' || body.grade == null ? null : Number(body.grade),
      feedback: String(body.feedback || '').trim(),
      reviewStatus,
      status: reviewStatus,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  }

  return { ok: true };
}

export async function handleMilestonesFallback(url: string, options: RequestInit = {}) {
  const effective = getEffectiveAuth();
  const user = auth.currentUser;
  const uid = effective.effectiveUid || user?.uid;
  if (!uid) throw new Error('Please sign in again.');

  const parsedUrl = new URL(url, window.location.origin);
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const targetType = (parsedUrl.searchParams.get('targetType') || 'STUDENT').toUpperCase();
    const targetId = parsedUrl.searchParams.get('targetId') || '';
    if (!targetId) return { milestones: [] };
    const snap = await getDocs(
      query(collection(db, 'milestones'), where('targetId', '==', targetId), limit(200))
    ).catch(() => null);
    const milestones = (snap?.docs || [])
      .map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          ...data,
          targetType: data.targetType || targetType,
          dueDate: toIso(data.dueDate),
          completedAt: toIso(data.completedAt),
          createdAt: toIso(data.createdAt),
        };
      })
      .filter((m: any) => String(m.targetType || 'STUDENT').toUpperCase() === targetType)
      .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0));
    return { milestones };
  }

  const body = JSON.parse(String(options.body || '{}'));
  const action = String(body.action || '').trim();

  if (action === 'create') {
    const payload = {
      title: String(body.title || '').trim(),
      description: String(body.description || '').trim(),
      targetType: String(body.targetType || 'STUDENT').toUpperCase(),
      targetId: String(body.targetId || '').trim(),
      position: Number(body.position || 1),
      status: 'NOT_STARTED',
      dueDate: body.dueDate || null,
      ownerId: uid,
      ownerName:
        effective.effectiveName ||
        user?.displayName ||
        sessionStorage.getItem('userName') ||
        'Tutor',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'milestones'), payload);
    return { milestone: { id: ref.id, ...payload } };
  }

  if (action === 'complete' || action === 'status') {
    const milestoneId = String(body.milestoneId || '').trim();
    const status =
      action === 'complete' ? 'COMPLETED' : String(body.status || 'IN_PROGRESS').toUpperCase();
    await updateDoc(doc(db, 'milestones', milestoneId), {
      status,
      completedAt: status === 'COMPLETED' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  }

  if (action === 'delete') {
    const milestoneId = String(body.milestoneId || '').trim();
    await deleteDoc(doc(db, 'milestones', milestoneId));
    return { deleted: true };
  }

  return { ok: true };
}

export async function handleAssessmentsFallback(url: string, options: RequestInit = {}) {
  const effective = getEffectiveAuth();
  const user = auth.currentUser;
  const uid = effective.effectiveUid || user?.uid;
  if (!uid) throw new Error('Please sign in again.');

  const parsedUrl = new URL(url, window.location.origin);
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const studentId = parsedUrl.searchParams.get('studentId') || '';
    if (!studentId) return { records: [] };
    const snap = await getDocs(
      query(collection(db, 'academic_assessments'), where('studentId', '==', studentId), limit(100))
    ).catch(() => null);
    const records = (snap?.docs || []).map((d) => ({ id: d.id, ...d.data() }));
    return { records };
  }

  const body = JSON.parse(String(options.body || '{}'));
  const payload = {
    studentId: String(body.studentId || '').trim(),
    title: String(body.title || '').trim(),
    subject: String(body.subject || '').trim(),
    assessmentType: String(body.assessmentType || 'QUIZ').trim(),
    score: body.score === '' || body.score == null ? null : Number(body.score),
    feedback: String(body.feedback || '').trim(),
    assessedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'academic_assessments'), payload);
  return { assessment: { id: ref.id, ...payload } };
}

export async function handleAttendanceFallback(url: string, options: RequestInit = {}) {
  const effective = getEffectiveAuth();
  const user = auth.currentUser;
  const uid = effective.effectiveUid || user?.uid;
  if (!uid) throw new Error('Please sign in again.');

  const parsedUrl = new URL(url, window.location.origin);
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const studentId = parsedUrl.searchParams.get('studentId') || '';
    const scheduleId = parsedUrl.searchParams.get('scheduleId') || '';
    if (!studentId && !scheduleId) return { records: [] };
    const snap =
      scheduleId && !studentId
        ? await getDocs(
            query(collection(db, 'attendance'), where('scheduleId', '==', scheduleId), limit(250))
          ).catch(() => null)
        : await getDocs(
            query(collection(db, 'attendance'), where('studentId', '==', studentId), limit(200))
          ).catch(() => null);
    const records = (snap?.docs || [])
      .map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          ...data,
          date: toIso(data.date) || data.dateKey || null,
        };
      })
      .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return { records };
  }

  const body = JSON.parse(String(options.body || '{}'));

  if (body.action === 'batch' && Array.isArray(body.entries)) {
    const scheduleId = String(body.scheduleId || '').trim();
    const dateKey = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const sessionTitle = String(body.sessionTitle || '').trim();
    const schoolId = String(body.schoolId || '').trim() || null;
    const savedRecords: Record<string, any>[] = [];

    for (const entry of body.entries) {
      const studentId = String(entry?.studentId || '').trim();
      if (!studentId) continue;
      const docId = buildAttendanceRecordKey({ studentId, dateKey, scheduleId });
      const payload = {
        studentId,
        studentName: String(entry?.studentName || 'Student').trim(),
        tutorId: uid,
        schoolId,
        scheduleId: scheduleId || null,
        sessionTitle: sessionTitle || null,
        date: dateKey,
        dateKey,
        status: String(entry?.status || 'PRESENT').toUpperCase(),
        notes: String(entry?.notes || '').trim(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(
        doc(db, 'attendance', docId),
        { ...payload, createdAt: serverTimestamp() },
        { merge: true }
      );
      savedRecords.push({ id: docId, ...payload });
    }
    return { records: savedRecords, count: savedRecords.length };
  }

  const studentId = String(body.studentId || '').trim();
  const scheduleId = String(body.scheduleId || '').trim();
  const dateKey = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const docId = buildAttendanceRecordKey({ studentId, dateKey, scheduleId });
  const payload = {
    studentId,
    tutorId: uid,
    scheduleId: scheduleId || null,
    sessionTitle: String(body.sessionTitle || '').trim() || null,
    date: dateKey,
    dateKey,
    status: String(body.status || 'PRESENT').toUpperCase(),
    notes: String(body.notes || '').trim(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'attendance', docId), { ...payload, createdAt: serverTimestamp() }, { merge: true });
  return { record: { id: docId, ...payload } };
}

export async function academicApiWithFallback(path: string, options: RequestInit = {}) {
  const effective = getEffectiveAuth();
  const user = auth.currentUser;
  if (!user && !effective.isMasquerading) throw new Error('Please sign in again.');

  // Always use the unified client-side resolver for academic-students and academic-schools
  // so that tutor alias IDs, impersonation, and school/private categorization are 100% consistent.
  if (path.includes('academic-students')) {
    return { students: await fetchAcademicStudentsFallback(), fallback: true };
  }
  if (path.includes('academic-schools')) {
    return { schools: await fetchAcademicSchoolsFallback(), fallback: true };
  }

  if (user && !effective.isMasquerading) {
    try {
      const token = await user.getIdToken();
      const response = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && !data?.fallback) {
        return data;
      }
    } catch {
      // Fall through to client-side Firestore fallback
    }
  }

  if (path.includes('academic-assignments')) {
    return handleAssignmentsFallback(path, options);
  }
  if (path.includes('academic-milestones')) {
    return handleMilestonesFallback(path, options);
  }
  if (path.includes('academic-assessments')) {
    return handleAssessmentsFallback(path, options);
  }
  if (path.includes('academic-attendance')) {
    return handleAttendanceFallback(path, options);
  }
  return {};
}
