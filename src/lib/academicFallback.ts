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
import { buildAttendanceRecordKey } from './classes';

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

export async function fetchAcademicStudentsFallback() {
  const user = auth.currentUser;
  if (!user) return [];

  const userSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
  const userData: Record<string, any> = userSnap?.exists() ? userSnap.data() || {} : {};
  const role = String(
    userData.role || sessionStorage.getItem('userRole') || localStorage.getItem('jaystar_cached_user_role') || ''
  )
    .trim()
    .toUpperCase();

  const docs = new Map<string, any>();
  const addDocEntry = (id: string, data: any) => {
    if (!id) return;
    docs.set(id, { id, ...data });
  };

  if (['TUTOR', 'STAFF', 'INSTRUCTOR', 'TEACHER', 'FACULTY'].includes(role)) {
    const accessSnap = await getDoc(doc(db, 'staffSchoolAccess', user.uid)).catch(() => null);
    const accessData: Record<string, any> = accessSnap?.exists() ? accessSnap.data() || {} : {};
    const schoolIds = new Set<string>([
      ...(Array.isArray(accessData.schoolIds) ? accessData.schoolIds.map(String) : []),
      ...(accessData.schoolId ? [String(accessData.schoolId)] : []),
      ...(userData.schoolId ? [String(userData.schoolId)] : []),
    ].filter(Boolean));

    const schoolsSnap = await getDocs(query(collection(db, 'schools'), limit(150))).catch(() => null);
    schoolsSnap?.docs.forEach((sDoc) => {
      const sd = sDoc.data() || {};
      const assigned =
        (Array.isArray(sd.assignedStaff) &&
          sd.assignedStaff.some((st: any) => String(st?.id || st?.uid || '') === user.uid)) ||
        (Array.isArray(sd.assignedTutors) &&
          sd.assignedTutors.some((st: any) => String(st?.tutorId || st?.id || st?.uid || '') === user.uid));
      if (assigned) schoolIds.add(sDoc.id);
    });

    for (const sid of Array.from(schoolIds)) {
      for (const colName of ['individualStudents', 'students'] as const) {
        const snap = await getDocs(query(collection(db, colName), where('schoolId', '==', sid), limit(250))).catch(
          () => null
        );
        snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
      }
    }

    for (const field of assignmentFields) {
      for (const colName of ['individualStudents', 'students'] as const) {
        const snap = await getDocs(query(collection(db, colName), where(field, '==', user.uid), limit(150))).catch(
          () => null
        );
        snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
      }
    }
  } else if (role === 'PARENT') {
    for (const colName of ['individualStudents', 'students'] as const) {
      const snap = await getDocs(query(collection(db, colName), where('parentId', '==', user.uid), limit(100))).catch(
        () => null
      );
      snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
    }
  } else if (role.includes('SCHOOL')) {
    const sid = String(
      userData.schoolId ||
        userData.schoolDocId ||
        sessionStorage.getItem('schoolDocId') ||
        localStorage.getItem('jaystar_cached_school_doc_id') ||
        user.uid
    );
    for (const colName of ['individualStudents', 'students'] as const) {
      const snap = await getDocs(query(collection(db, colName), where('schoolId', '==', sid), limit(300))).catch(
        () => null
      );
      snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
    }
  } else if (role.includes('STUDENT')) {
    const candidateId = String(
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
    if (docs.size === 0) {
      for (const colName of ['individualStudents', 'students'] as const) {
        const snap = await getDocs(
          query(collection(db, colName), where('firebaseUid', '==', user.uid), limit(10))
        ).catch(() => null);
        snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
      }
    }
  } else if (role.includes('ADMIN')) {
    for (const colName of ['individualStudents', 'students'] as const) {
      const snap = await getDocs(query(collection(db, colName), limit(500))).catch(() => null);
      snap?.docs.forEach((d) => addDocEntry(d.id, d.data()));
    }
  }

  return Array.from(docs.values())
    .map((s) => ({
      id: s.id,
      fullName: s.fullName || s.studentName || s.name || 'Student',
      username: s.username || '',
      email: s.email || '',
      plan: s.plan || s.programName || s.program || '',
      schoolId: s.schoolId || '',
      parentId: s.parentId || '',
      tutorId: s.tutorId || s.staffId || s.assignedTutorId || s.assignedStaffId || s.instructorId || '',
      firebaseUid: s.firebaseUid || s.userId || '',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function fetchAcademicSchoolsFallback() {
  const user = auth.currentUser;
  if (!user) return [];

  const userSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
  const userData: Record<string, any> = userSnap?.exists() ? userSnap.data() || {} : {};
  const role = String(
    userData.role || sessionStorage.getItem('userRole') || localStorage.getItem('jaystar_cached_user_role') || ''
  )
    .trim()
    .toUpperCase();

  const schools = new Map<string, any>();

  if (role.includes('ADMIN')) {
    const snap = await getDocs(query(collection(db, 'schools'), limit(200))).catch(() => null);
    snap?.docs.forEach((d) => schools.set(d.id, { id: d.id, ...d.data() }));
  } else if (['TUTOR', 'STAFF', 'INSTRUCTOR', 'TEACHER', 'FACULTY'].includes(role)) {
    const accessSnap = await getDoc(doc(db, 'staffSchoolAccess', user.uid)).catch(() => null);
    const accessData: Record<string, any> = accessSnap?.exists() ? accessSnap.data() || {} : {};
    const ids = Array.from(
      new Set(
        [
          accessData.schoolId,
          userData.schoolId,
          ...(Array.isArray(accessData.schoolIds) ? accessData.schoolIds : []),
        ]
          .filter(Boolean)
          .map(String)
      )
    );
    for (const id of ids) {
      const snap = await getDoc(doc(db, 'schools', id)).catch(() => null);
      if (snap?.exists()) schools.set(snap.id, { id: snap.id, ...snap.data() });
    }
    const allSchoolsSnap = await getDocs(query(collection(db, 'schools'), limit(150))).catch(() => null);
    allSchoolsSnap?.docs.forEach((sDoc) => {
      const sd = sDoc.data() || {};
      const assigned =
        (Array.isArray(sd.assignedStaff) &&
          sd.assignedStaff.some((st: any) => String(st?.id || st?.uid || '') === user.uid)) ||
        (Array.isArray(sd.assignedTutors) &&
          sd.assignedTutors.some((st: any) => String(st?.tutorId || st?.id || st?.uid || '') === user.uid));
      if (assigned) schools.set(sDoc.id, { id: sDoc.id, ...sd });
    });
  } else if (role.includes('SCHOOL')) {
    const sid = String(
      userData.schoolId ||
        userData.schoolDocId ||
        sessionStorage.getItem('schoolDocId') ||
        localStorage.getItem('jaystar_cached_school_doc_id') ||
        user.uid
    );
    const snap = await getDoc(doc(db, 'schools', sid)).catch(() => null);
    if (snap?.exists()) schools.set(snap.id, { id: snap.id, ...snap.data() });
  }

  return Array.from(schools.values())
    .map((s) => ({
      id: s.id,
      name: s.name || s.schoolName || s.institutionName || 'School',
      code: s.code || s.schoolCode || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function handleAssignmentsFallback(url: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

  const parsedUrl = new URL(url, window.location.origin);
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const studentId = parsedUrl.searchParams.get('studentId') || '';
    const snap = studentId
      ? await getDocs(query(collection(db, 'assignments'), where('studentId', '==', studentId), limit(150))).catch(
          () => null
        )
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
      tutorId: user.uid,
      tutorName: user.displayName || sessionStorage.getItem('userName') || 'Tutor',
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
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

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
      ownerId: user.uid,
      ownerName: user.displayName || sessionStorage.getItem('userName') || 'Tutor',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'milestones'), payload);
    return { milestone: { id: ref.id, ...payload } };
  }

  if (action === 'complete' || action === 'status') {
    const milestoneId = String(body.milestoneId || '').trim();
    const status = action === 'complete' ? 'COMPLETED' : String(body.status || 'IN_PROGRESS').toUpperCase();
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
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

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
    assessedBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'academic_assessments'), payload);
  return { assessment: { id: ref.id, ...payload } };
}

export async function handleAttendanceFallback(url: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

  const parsedUrl = new URL(url, window.location.origin);
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const studentId = parsedUrl.searchParams.get('studentId') || '';
    const scheduleId = parsedUrl.searchParams.get('scheduleId') || '';
    if (!studentId && !scheduleId) return { records: [] };
    const snap = scheduleId && !studentId
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
        tutorId: user.uid,
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
    tutorId: user.uid,
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
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

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

  if (path.includes('academic-students')) {
    return { students: await fetchAcademicStudentsFallback(), fallback: true };
  }
  if (path.includes('academic-schools')) {
    return { schools: await fetchAcademicSchoolsFallback(), fallback: true };
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
