import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { buildAttendanceRecordKey } from '../../api/_lib/jdi-assessment';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const token = (event: any) => {
  const h = event.headers?.authorization || event.headers?.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

const roleOf = (v: unknown) => String(v || '').trim().toUpperCase();
const text = (v: unknown, max = 1000) => String(v || '').trim().slice(0, max);
const blocked = (v: unknown) =>
  ['DISABLED', 'SUSPENDED', 'BANNED'].includes(String(v || 'ACTIVE').toUpperCase());

const findStudent = async (id: string) => {
  for (const name of ['individualStudents', 'students']) {
    const snap = await adminDb.collection(name).doc(id).get();
    if (snap.exists) return { id: snap.id, ...snap.data() } as Record<string, any>;
  }
  return null;
};

const assignedToTutor = async (s: Record<string, any>, uid: string, profile: Record<string, any>) => {
  if (
    [s.tutorId, s.staffId, s.assignedTutorId, s.assignedStaffId, s.instructorId].some(
      (v) => String(v || '') === uid
    )
  ) {
    return true;
  }
  const studentSchoolId = String(s.schoolId || '').trim();
  if (!studentSchoolId) return false;

  const accessSnap = await adminDb.collection('staffSchoolAccess').doc(uid).get().catch(() => null);
  const accessData = accessSnap?.exists ? accessSnap.data() || {} : {};
  const allowedSchools = new Set<string>(
    [
      profile.schoolId,
      ...(Array.isArray(profile.schoolIds) ? profile.schoolIds : []),
      accessData.schoolId,
      ...(Array.isArray(accessData.schoolIds) ? accessData.schoolIds : []),
    ]
      .filter(Boolean)
      .map(String)
  );
  if (allowedSchools.has(studentSchoolId)) return true;

  const schoolSnap = await adminDb.collection('schools').doc(studentSchoolId).get().catch(() => null);
  if (schoolSnap?.exists) {
    const sd = schoolSnap.data() || {};
    if (
      sd.tutorId === uid ||
      sd.assignedTutorId === uid ||
      (Array.isArray(sd.assignedTutors) &&
        sd.assignedTutors.some((t: any) => String(t?.id || t?.tutorId || t || '') === uid)) ||
      (Array.isArray(sd.assignedStaff) &&
        sd.assignedStaff.some((t: any) => String(t?.id || t?.uid || t || '') === uid))
    ) {
      return true;
    }
  }
  return false;
};

const user = async (uid: string) => {
  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) throw new Error('PROFILE_NOT_FOUND');
  const data = snap.data() || {};
  if (blocked(data.accountStatus || data.status)) throw new Error('ACCOUNT_INACTIVE');
  return data;
};

export const handler: Handler = async (event) => {
  try {
    const raw = token(event);
    if (!raw) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(raw);
    const profile = await user(decoded.uid);
    const role = roleOf(profile.role);

    if (event.httpMethod === 'GET') {
      const studentId = text(event.queryStringParameters?.studentId, 200);
      const scheduleId = text(event.queryStringParameters?.scheduleId, 200);

      if (scheduleId && !studentId) {
        const snap = await adminDb
          .collection('attendance')
          .where('scheduleId', '==', scheduleId)
          .limit(300)
          .get();
        const records = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, any>;
            return {
              id: d.id,
              ...data,
              date: data.date?.toDate ? data.date.toDate().toISOString() : data.date || null,
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate().toISOString()
                : data.createdAt || null,
            };
          })
          .filter((r: any) => {
            if (role.includes('ADMIN')) return true;
            if (['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return r.tutorId === decoded.uid;
            if (role.includes('SCHOOL')) {
              return String(r.schoolId || '') === String(profile.schoolId || decoded.uid);
            }
            return false;
          });
        return json(200, { records });
      }

      if (!studentId) return json(400, { error: 'Student is required.' });
      const student = await findStudent(studentId);
      if (!student) return json(404, { error: 'Student not found.' });
      let allowed = false;
      if (
        [
          'ADMIN',
          'SUPER_ADMIN',
          'CONTENT_ADMIN',
          'EDUCATION_ADMIN',
          'SERVICES_ADMIN',
          'MARKETING_ADMIN',
          'SUPPORT_ADMIN',
        ].includes(role)
      ) {
        allowed = true;
      } else if (['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) {
        allowed = await assignedToTutor(student, decoded.uid, profile);
      } else if (role === 'PARENT') {
        allowed = String(student.parentId || '') === decoded.uid;
      } else if (role === 'STUDENT') {
        allowed =
          String(student.firebaseUid || student.userId || '') === decoded.uid ||
          String(profile.studentDocId || '') === studentId;
      } else if (role.includes('SCHOOL')) {
        allowed = String(student.schoolId || '') === String(profile.schoolId || decoded.uid);
      }
      if (!allowed) {
        return json(403, { error: 'You are not authorized to view this attendance record.' });
      }

      const snap = await adminDb
        .collection('attendance')
        .where('studentId', '==', studentId)
        .limit(200)
        .get();
      const records = snap.docs
        .map((d) => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...data,
            date: data.date?.toDate ? data.date.toDate().toISOString() : data.date || null,
            createdAt: data.createdAt?.toDate
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || null,
          };
        })
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return json(200, { records });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
    if (!['TUTOR', 'STAFF', 'INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return json(403, { error: 'Only teaching staff can record attendance.' });
    }

    const body = JSON.parse(event.body || '{}');

    // Batch session-aware attendance save
    if (body.action === 'batch' && Array.isArray(body.entries)) {
      const scheduleId = text(body.scheduleId, 200);
      const dateValue = new Date(String(body.date || new Date().toISOString()));
      if (Number.isNaN(dateValue.getTime())) {
        return json(400, { error: 'Choose a valid class date.' });
      }
      const dateKey = dateValue.toISOString().slice(0, 10);
      const sessionTitle = text(body.sessionTitle, 240);
      const savedRecords: Record<string, any>[] = [];

      for (const entry of body.entries.slice(0, 200)) {
        const studentId = text(entry?.studentId, 200);
        const status = String(entry?.status || 'PRESENT').toUpperCase();
        if (!studentId || !['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(status)) continue;

        const student = await findStudent(studentId);
        if (!student) continue;
        const canAccess =
          role.includes('ADMIN') || (await assignedToTutor(student, decoded.uid, profile));
        if (!canAccess) continue;

        const recordKey = buildAttendanceRecordKey({ studentId, dateKey, scheduleId });
        const payload = {
          studentId,
          studentName:
            student.fullName ||
            student.studentName ||
            student.name ||
            text(entry?.studentName, 200) ||
            'Student',
          tutorId: decoded.uid,
          schoolId: student.schoolId || text(body.schoolId, 200) || null,
          scheduleId: scheduleId || null,
          sessionTitle: sessionTitle || null,
          date: dateValue,
          dateKey,
          status,
          notes: text(entry?.notes, 1000),
          updatedAt: new Date(),
        };
        const ref = adminDb.collection('attendance').doc(recordKey);
        await ref.set({ ...payload, createdAt: new Date() }, { merge: true });
        savedRecords.push({ id: recordKey, ...payload });
      }

      return json(200, { records: savedRecords, count: savedRecords.length });
    }

    // Single student attendance save
    const studentId = text(body.studentId, 200);
    const scheduleId = text(body.scheduleId, 200);
    const student = await findStudent(studentId);
    if (
      !student ||
      (!role.includes('ADMIN') && !(await assignedToTutor(student, decoded.uid, profile)))
    ) {
      return json(403, { error: 'That student is not assigned to your teaching account.' });
    }

    const dateValue = new Date(String(body.date || ''));
    if (Number.isNaN(dateValue.getTime())) {
      return json(400, { error: 'Choose a valid class date.' });
    }
    const status = String(body.status || '').toUpperCase();
    if (!['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(status)) {
      return json(400, { error: 'Choose a valid attendance status.' });
    }
    const dateKey = dateValue.toISOString().slice(0, 10);
    const recordKey = buildAttendanceRecordKey({ studentId, dateKey, scheduleId });

    const payload = {
      studentId,
      studentName: student.fullName || student.studentName || student.name || 'Student',
      tutorId: decoded.uid,
      schoolId: student.schoolId || null,
      scheduleId: scheduleId || null,
      sessionTitle: text(body.sessionTitle, 240) || null,
      date: dateValue,
      dateKey,
      status,
      notes: text(body.notes, 1000),
      updatedAt: new Date(),
    };

    if (scheduleId) {
      const ref = adminDb.collection('attendance').doc(recordKey);
      await ref.set({ ...payload, createdAt: new Date() }, { merge: true });
      return json(200, { record: { id: ref.id, ...payload } });
    }

    const existing = await adminDb
      .collection('attendance')
      .where('studentId', '==', studentId)
      .where('dateKey', '==', dateKey)
      .limit(1)
      .get();
    if (existing.empty) {
      const ref = adminDb.collection('attendance').doc(recordKey);
      await ref.set({ ...payload, createdAt: new Date() });
      return json(201, { record: { id: ref.id, ...payload } });
    }
    const ref = existing.docs[0].ref;
    await ref.update(payload);
    return json(200, { record: { id: ref.id, ...payload } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROFILE_NOT_FOUND') {
      return json(403, { error: 'Your portal profile could not be verified.' });
    }
    if (code === 'ACCOUNT_INACTIVE') {
      return json(403, { error: 'Your account is not active.' });
    }
    console.warn('Academic attendance fallback notice:', error);
    return json(200, { records: [], fallback: true });
  }
};
