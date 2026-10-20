import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

const classes = ['Early Years', 'Nursery 1', 'Nursery 2', 'Nursery 3', 'Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3', 'SS1', 'SS2', 'SS3'];
const statuses = ['SCHEDULED', 'ONGOING', 'COMPLETED', 'ATTENDED', 'ABSENT', 'CANCELLED', 'RESCHEDULED'];
const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'EDUCATION_ADMIN', 'CMS_ADMIN'];
const tutorRoles = ['TUTOR', 'STAFF', 'INSTRUCTOR', 'FACULTY'];

const tokenFrom = (event: any) => {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};

const requireUser = async (event: any) => {
  const token = tokenFrom(event);
  if (!token) throw new Error('AUTH_REQUIRED');
  const decoded = await adminAuth.verifyIdToken(token);
  const snap = await adminDb.collection('users').doc(decoded.uid).get();
  return { decoded, user: snap.exists ? (snap.data() || {}) : {}, uid: decoded.uid };
};

const isAdmin = (role: any) => adminRoles.includes(String(role || '').toUpperCase());
const isTutor = (role: any) => tutorRoles.includes(String(role || '').toUpperCase());

const normalizeClasses = (body: any) => {
  const raw = Array.isArray(body.classLevels) ? body.classLevels : body.classLevel ? [body.classLevel] : [];
  return Array.from(new Set(raw.map((v: any) => String(v).trim()).filter((v: string) => classes.includes(v))));
};

const dateFor = (startDate: string, index: number) => {
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + index * 7);
  return d.toISOString().slice(0, 10);
};

const normalize = (value: any) => String(value || '').trim().toLowerCase();

const resolveTutorIdentity = async (uid: string, user: any) => {
  const ids = new Set<string>([uid]);
  const names = new Set<string>();
  const emails = new Set<string>();

  [user.name, user.fullName, user.displayName].forEach(v => { if (v) names.add(normalize(v)); });
  if (user.email) emails.add(normalize(user.email));
  ['tutorId', 'staffId', 'facultyId', 'firebaseUid'].forEach(key => { if (user[key]) ids.add(String(user[key])); });

  const email = normalize(user.email);
  if (email) {
    const tutorSnap = await adminDb.collection('tutors').where('email', '==', user.email).limit(3).get().catch(() => null);
    tutorSnap?.docs.forEach(d => {
      ids.add(d.id);
      const data = d.data() || {};
      [data.tutorId, data.staffId, data.firebaseUid, data.uid].forEach(v => { if (v) ids.add(String(v)); });
      [data.name, data.fullName, data.displayName].forEach(v => { if (v) names.add(normalize(v)); });
      if (data.email) emails.add(normalize(data.email));
    });
  }

  return { ids, names, emails };
};

const canTutorAccessRecord = (record: any, identity: { ids: Set<string>; names: Set<string>; emails: Set<string> }) => {
  if (record.tutorId && identity.ids.has(String(record.tutorId))) return true;
  if (record.tutorName && identity.names.has(normalize(record.tutorName))) return true;
  if (record.tutorEmail && identity.emails.has(normalize(record.tutorEmail))) return true;
  return false;
};

const resolveTutorScope = async (uid: string, user: any, identity: { ids: Set<string>; names: Set<string>; emails: Set<string> }) => {
  const schoolIds = new Set<string>();
  const studentIds = new Set<string>();
  const add = (set: Set<string>, values: any[]) => values.filter(Boolean).forEach(v => set.add(String(v)));

  add(schoolIds, [user.schoolId, ...(Array.isArray(user.schoolIds) ? user.schoolIds : []), ...(Array.isArray(user.assignedSchoolIds) ? user.assignedSchoolIds : [])]);
  add(studentIds, [user.studentId, ...(Array.isArray(user.assignedStudentIds) ? user.assignedStudentIds : [])]);

  const assignmentFields = ['tutorId', 'staffId', 'assignedTutorId', 'assignedStaffId', 'instructorId'];
  for (const field of assignmentFields) {
    for (const collectionName of ['students', 'individualStudents']) {
      const snap = await adminDb.collection(collectionName).where(field, '==', uid).limit(500).get().catch(() => null);
      snap?.docs.forEach(d => {
        const data = d.data() || {};
        studentIds.add(d.id);
        if (data.schoolId) schoolIds.add(String(data.schoolId));
      });
    }
  }

  const schoolsSnap = await adminDb.collection('schools').limit(500).get().catch(() => null);
  schoolsSnap?.docs.forEach(d => {
    const data = d.data() || {};
    const direct = assignmentFields.some(field => String(data[field] || '') === uid);
    const assigned = [data.assignedTutors, data.tutors].some(list => Array.isArray(list) && list.some((t: any) => {
      if (typeof t === 'string') return t === uid;
      return String(t?.id || t?.uid || t?.tutorId || t?.staffId || '') === uid || normalize(t?.email) === normalize(user.email);
    }));
    if (direct || assigned) schoolIds.add(d.id);
  });

  return { schoolIds, studentIds };
};

const resolveStudentIdentity = async (uid: string, decoded: any, user: any) => {
  const ids = new Set<string>([uid]);
  const emails = new Set<string>();
  const schoolIds = new Set<string>();
  const classesForStudent = new Set<string>();

  const emailValues = [user.email, decoded?.email].filter(Boolean).map(normalize);
  emailValues.forEach(email => emails.add(email));
  ['studentId', 'studentDocId', 'individualStudentId', 'studentRecordId'].forEach(key => {
    if (user[key]) ids.add(String(user[key]));
  });

  const absorb = (doc: any) => {
    const data = doc.data() || {};
    ids.add(doc.id);
    [data.id, data.studentId, data.studentDocId, data.individualStudentId, data.firebaseUid, data.uid].forEach(v => {
      if (v) ids.add(String(v));
    });
    [data.email, data.parentEmail].forEach(v => {
      if (v) emails.add(normalize(v));
    });
    [data.schoolId].forEach(v => {
      if (v) schoolIds.add(String(v));
    });
    [data.class, data.grade, data.classLevel, data.year, data.level].forEach(v => {
      if (v) classesForStudent.add(normalize(v));
    });
  };

  const lookups: Promise<any>[] = [];
  lookups.push(adminDb.collection('students').where('firebaseUid', '==', uid).limit(5).get().catch(() => null));
  lookups.push(adminDb.collection('individualStudents').where('firebaseUid', '==', uid).limit(5).get().catch(() => null));
  for (const email of emailValues) {
    lookups.push(adminDb.collection('students').where('email', '==', email).limit(5).get().catch(() => null));
    lookups.push(adminDb.collection('individualStudents').where('email', '==', email).limit(5).get().catch(() => null));
  }

  const snapshots = await Promise.all(lookups);
  snapshots.forEach(snapshot => snapshot?.docs?.forEach((doc: any) => absorb(doc)));

  if (user.schoolId) schoolIds.add(String(user.schoolId));
  [user.class, user.grade, user.classLevel].forEach(v => { if (v) classesForStudent.add(normalize(v)); });

  return { ids, emails, schoolIds, classes: classesForStudent };
};

const loadRecords = async () => {
  const snap = await adminDb.collection('classSchedules').limit(4000).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const handler: Handler = async event => {
  try {
    const { decoded, user, uid } = await requireUser(event);
    const role = String(user.role || '').toUpperCase();
    const method = event.httpMethod || 'GET';
    const params = event.queryStringParameters || {};

    if (method === 'GET') {
      const requestedSchoolId = String(params.schoolId || '').trim();
      const requestedStudentId = String(params.studentId || '').trim();
      const requestedTutorId = String(params.tutorId || '').trim();
      let records = await loadRecords();

      if (['SCHOOL', 'SCHOOL_ADMIN'].includes(role)) {
        let schoolId = String(user.schoolId || '').trim();
        let schoolName = String(user.schoolName || user.name || '').trim();
        if (!schoolId) {
          const byUid = await adminDb.collection('schools').doc(uid).get();
          if (byUid.exists) { schoolId = byUid.id; schoolName = String(byUid.data()?.name || schoolName); }
          else if (user.email) {
            const byEmail = await adminDb.collection('schools').where('contactEmail', '==', user.email).limit(1).get();
            if (!byEmail.empty) { schoolId = byEmail.docs[0].id; schoolName = String(byEmail.docs[0].data()?.name || schoolName); }
          }
        }
        const sid = normalize(schoolId), sname = normalize(schoolName);
        records = records.filter((r: any) => {
          const rid = normalize(r.schoolId), rn = normalize(r.schoolName);
          return (sid && (rid === sid || rid === normalize(uid))) || (sname && rn && (rn === sname || rn.includes(sname) || sname.includes(rn))) || (requestedSchoolId && rid === normalize(requestedSchoolId));
        });
      } else if (role === 'STUDENT') {
        const identity = await resolveStudentIdentity(uid, decoded, user);
        records = records.filter((r: any) => {
          const recordStudentId = String(r.studentId || '').trim();
          const recordStudentEmail = normalize(r.studentEmail);
          const directStudentMatch = r.targetType === 'STUDENT' && (
            (recordStudentId && identity.ids.has(recordStudentId)) ||
            (recordStudentEmail && identity.emails.has(recordStudentEmail))
          );
          if (directStudentMatch) return true;

          const recordSchoolId = String(r.schoolId || '').trim();
          if (!recordSchoolId || !identity.schoolIds.has(recordSchoolId)) return false;

          const recordClasses = Array.isArray(r.classLevels)
            ? r.classLevels.map((value: any) => normalize(value))
            : r.classLevel ? [normalize(r.classLevel)] : [];

          // A school-wide schedule is visible to the student's school. A class-specific
          // schedule is visible only when the student's current class is included.
          if (!recordClasses.length) return true;
          return recordClasses.some((level: string) => identity.classes.has(level));
        });
      } else if (role === 'PARENT') {
        records = records.filter((r: any) => String(r.parentId || '') === uid || normalize(r.parentEmail) === normalize(user.email));
      } else if (isTutor(role)) {
        const identity = await resolveTutorIdentity(uid, user);
        const scope = await resolveTutorScope(uid, user, identity);
        records = records.filter((r: any) => {
          if (canTutorAccessRecord(r, identity)) return true;
          if (String(r.targetType || '').toUpperCase() === 'SCHOOL' && scope.schoolIds.has(String(r.schoolId || ''))) return true;
          if (String(r.targetType || '').toUpperCase() === 'STUDENT' && scope.studentIds.has(String(r.studentId || ''))) return true;
          return false;
        });
      } else if (isAdmin(role)) {
        if (requestedSchoolId) records = records.filter((r: any) => String(r.schoolId || '') === requestedSchoolId);
        if (requestedStudentId) records = records.filter((r: any) => String(r.studentId || '') === requestedStudentId);
        if (requestedTutorId) records = records.filter((r: any) => String(r.tutorId || '') === requestedTutorId);
      }

      records.sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.startTime || '').localeCompare(String(b.startTime || '')));
      const groups = new Map<string, any>();
      records.forEach((r: any) => {
        const gid = String(r.scheduleGroupId || r.id);
        if (!groups.has(gid)) {
          groups.set(gid, {
            scheduleGroupId: gid,
            targetType: r.targetType || 'SCHOOL', schoolId: r.schoolId, schoolName: r.schoolName,
            studentId: r.studentId, studentName: r.studentName, parentId: r.parentId,
            title: r.title, programId: r.programId, programName: r.programName,
            tutorId: r.tutorId, tutorName: r.tutorName, startDate: r.startDate || r.date,
            startTime: r.startTime, endTime: r.endTime, recurring: r.recurring !== false,
            weeks: r.occurrenceTotal || 1, classLevels: Array.isArray(r.classLevels) ? r.classLevels : r.classLevel ? [r.classLevel] : [], occurrences: []
          });
        }
        groups.get(gid).occurrences.push(r);
      });
      return json(200, { schedules: records, groups: Array.from(groups.values()), classes });
    }

    if (method === 'POST') {
      if (!isAdmin(role) && !isTutor(role)) return json(403, { error: 'Only authorised administrators and faculty can create class schedules.' });
      const body = JSON.parse(event.body || '{}');
      const targetType = String(body.targetType || 'SCHOOL').toUpperCase();
      const title = String(body.title || '').trim();
      const tutorId = String(body.tutorId || (isTutor(role) ? uid : '')).trim();
      const tutorName = String(body.tutorName || (isTutor(role) ? (user.name || user.displayName || 'Faculty') : '')).trim();
      const startDate = String(body.startDate || '').trim();
      const startTime = String(body.startTime || '').trim();
      const endTime = String(body.endTime || '').trim();
      const recurring = body.recurring !== false;
      const weeks = Math.min(52, Math.max(1, Number(body.weeks || 52)));
      if (!title || !startDate || !startTime || !endTime) return json(400, { error: 'Title, start date, start time, and end time are required.' });
      const groupId = adminDb.collection('classSchedules').doc().id;
      const count = recurring ? weeks : 1;
      let batch = adminDb.batch(); let writes = 0;
      const commitIfNeeded = async () => { if (writes >= 450) { await batch.commit(); batch = adminDb.batch(); writes = 0; } };

      if (targetType === 'STUDENT') {
        const studentId = String(body.studentId || '').trim();
        if (!studentId && !body.studentName) return json(400, { error: 'Private student name or student ID is required.' });
        for (let i = 0; i < count; i++) {
          const ref = adminDb.collection('classSchedules').doc();
          batch.set(ref, {
            scheduleGroupId: groupId, targetType: 'STUDENT', studentId, studentName: String(body.studentName || ''), parentId: String(body.parentId || ''), studentEmail: String(body.studentEmail || ''),
            title, programId: String(body.programId || ''), programName: String(body.programName || title), tutorId, tutorName,
            date: dateFor(startDate, i), startDate, startTime, endTime, status: 'SCHEDULED', recurring, recurrence: recurring ? 'WEEKLY' : 'ONCE', occurrenceNumber: i + 1, occurrenceTotal: count, createdBy: uid, createdAt: new Date(), updatedAt: new Date()
          }); writes++; await commitIfNeeded();
        }
      } else {
        const schoolId = String(body.schoolId || '').trim();
        const schoolName = String(body.schoolName || '').trim();
        const classLevels = normalizeClasses(body);
        if (!schoolId || !classLevels.length) return json(400, { error: 'School and at least one class level are required for school schedules.' });
        const schoolSnap = await adminDb.collection('schools').doc(schoolId).get();
        const resolvedSchoolName = schoolName || String(schoolSnap.data()?.name || 'School');
        for (let i = 0; i < count; i++) for (const classLevel of classLevels) {
          const ref = adminDb.collection('classSchedules').doc();
          batch.set(ref, {
            scheduleGroupId: groupId, targetType: 'SCHOOL', schoolId, schoolName: resolvedSchoolName, classLevel, classLevels,
            title, programId: String(body.programId || ''), programName: String(body.programName || title), tutorId, tutorName,
            meetingLink: String(body.meetingLink || ''), date: dateFor(startDate, i), startDate, startTime, endTime, status: 'SCHEDULED', recurring,
            recurrence: recurring ? 'WEEKLY' : 'ONCE', occurrenceNumber: i + 1, occurrenceTotal: count, createdBy: uid, createdAt: new Date(), updatedAt: new Date()
          }); writes++; await commitIfNeeded();
        }
      }
      if (writes) await batch.commit();
      return json(201, { created: true, scheduleGroupId: groupId, occurrences: count });
    }

    if (method === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      const scheduleId = String(body.scheduleId || '').trim();
      const scheduleGroupId = String(body.scheduleGroupId || '').trim();
      const status = String(body.status || '').toUpperCase();

      if (scheduleId) {
        const ref = adminDb.collection('classSchedules').doc(scheduleId);
        const snap = await ref.get();
        if (!snap.exists) return json(404, { error: 'Class schedule occurrence not found.' });
        const record = snap.data() || {};
        let authorised = isAdmin(role);
        if (isTutor(role)) authorised = canTutorAccessRecord(record, await resolveTutorIdentity(uid, user));
        if (!authorised) return json(403, { error: 'You are not authorised to edit this class schedule.' });

        if (status) {
          if (!statuses.includes(status)) return json(400, { error: 'A valid schedule status is required.' });
          const updateData: any = { status, updatedAt: new Date(), updatedBy: uid };
          if (status === 'ABSENT') updateData.absenceReason = String(body.absenceReason || body.reason || 'Absent').trim();
          if (status === 'RESCHEDULED') {
            updateData.rescheduleReason = String(body.rescheduleReason || body.reason || 'Rescheduled').trim();
            updateData.rescheduledDate = String(body.rescheduledDate || body.newDate || '').trim();
            updateData.rescheduledStartTime = String(body.rescheduledStartTime || body.newStartTime || '').trim();
            updateData.rescheduledEndTime = String(body.rescheduledEndTime || body.newEndTime || '').trim();
          }
          if (status === 'CANCELLED') updateData.cancellationReason = String(body.cancellationReason || body.reason || 'Cancelled').trim();
          await ref.set(updateData, { merge: true });
          return json(200, { updated: true, scheduleId, status });
        }

        const editable: any = {};
        ['title', 'programName', 'startTime', 'endTime', 'meetingLink', 'date', 'startDate'].forEach(key => {
          if (body[key] !== undefined) editable[key] = String(body[key]).trim();
        });
        if (isAdmin(role) && body.tutorId !== undefined) editable.tutorId = String(body.tutorId || '').trim();
        if (isAdmin(role) && body.tutorName !== undefined) editable.tutorName = String(body.tutorName || '').trim();
        if (!Object.keys(editable).length) return json(400, { error: 'No editable schedule fields were supplied.' });
        editable.updatedAt = new Date(); editable.updatedBy = uid;
        await ref.set(editable, { merge: true });
        return json(200, { updated: true, scheduleId });
      }

      if (!scheduleGroupId) return json(400, { error: 'A recurring schedule group is required.' });
      const groupSnap = await adminDb.collection('classSchedules').where('scheduleGroupId', '==', scheduleGroupId).get();
      if (groupSnap.empty) return json(404, { error: 'Recurring schedule not found.' });
      if (!isAdmin(role) && !isTutor(role)) return json(403, { error: 'Only administrators and assigned tutors can edit schedules.' });
      if (isTutor(role)) {
        const identity = await resolveTutorIdentity(uid, user);
        if (groupSnap.docs.some(d => !canTutorAccessRecord(d.data(), identity))) return json(403, { error: 'You are not authorised to edit this recurring schedule.' });
      }

      const first = groupSnap.docs[0].data() || {};
      const updateData: any = { updatedAt: new Date(), updatedBy: uid };
      ['title', 'programName', 'startTime', 'endTime', 'meetingLink'].forEach(key => { if (body[key] !== undefined) updateData[key] = String(body[key]).trim(); });
      if (body.weeks !== undefined) updateData.occurrenceTotal = Math.min(52, Math.max(1, Number(body.weeks || first.occurrenceTotal || 1)));
      if (isAdmin(role)) {
        if (body.tutorId !== undefined) updateData.tutorId = String(body.tutorId || '').trim();
        if (body.tutorName !== undefined) updateData.tutorName = String(body.tutorName || '').trim();
      }
      if (Object.keys(updateData).length <= 2) return json(400, { error: 'No recurring schedule changes were supplied.' });
      let batch = adminDb.batch(); let writes = 0; let changed = 0;
      for (const d of groupSnap.docs) {
        batch.set(d.ref, updateData, { merge: true }); writes++; changed++;
        if (writes >= 450) { await batch.commit(); batch = adminDb.batch(); writes = 0; }
      }
      if (writes) await batch.commit();
      return json(200, { updated: true, changed, scheduleGroupId });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'AUTH_REQUIRED' || code.includes('auth/')) return json(401, { error: 'Authentication required.' });
    console.error('Class schedules error:', error);
    return json(500, { error: 'Unable to process class schedules.' });
  }
};
