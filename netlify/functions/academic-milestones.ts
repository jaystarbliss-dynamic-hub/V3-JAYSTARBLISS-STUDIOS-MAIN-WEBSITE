import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const token = (event: any) => { const h = event.headers?.authorization || event.headers?.Authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
const roleOf = (v: unknown) => String(v || '').trim().toUpperCase();
const text = (v: unknown, max = 5000) => String(v || '').trim().slice(0, max);
const now = () => new Date();

const userRecord = async (uid: string) => {
  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) throw new Error('PROFILE_NOT_FOUND');
  const data = snap.data() || {};
  if (['DISABLED', 'SUSPENDED', 'BANNED'].includes(roleOf(data.accountStatus))) throw new Error('ACCOUNT_INACTIVE');
  return { id: uid, ...data } as Record<string, any>;
};

const findStudent = async (studentId: string) => {
  for (const name of ['individualStudents', 'students']) {
    const snap = await adminDb.collection(name).doc(studentId).get();
    if (snap.exists) return { id: snap.id, ...snap.data() } as Record<string, any>;
  }
  return null;
};
const assignedTo = (s: Record<string, any>, uid: string) => [s.tutorId, s.staffId, s.assignedTutorId, s.assignedStaffId, s.instructorId].some(v => String(v || '') === uid);
const adminRole = (role: string) => ['ADMIN', 'SUPER_ADMIN', 'CONTENT_ADMIN', 'EDUCATION_ADMIN', 'SERVICES_ADMIN', 'MARKETING_ADMIN', 'SUPPORT_ADMIN'].includes(role);

const serialise = (id: string, data: Record<string, any>) => ({ id, ...data,
  targetType: data.targetType || 'STUDENT',
  createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
  updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null,
  dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate || null,
  completedAt: data.completedAt?.toDate ? data.completedAt.toDate().toISOString() : data.completedAt || null,
});

const notify = async (recipientId: string, title: string, message: string, link?: string) => {
  if (!recipientId) return;
  await adminDb.collection('notifications').add({ recipientId, title, message, type: 'broadcast', priority: 'normal', read: false, link, timestamp: now(), createdAt: now() });
};

const canManageStudent = async (uid: string, studentId: string, role: string) => {
  if (adminRole(role)) return true;
  if (!['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return false;
  const student = await findStudent(studentId);
  return !!student && assignedTo(student, uid);
};

const canManageSchool = async (uid: string, schoolId: string, role: string) => {
  if (adminRole(role)) return true;
  if (!['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return false;
  const access = await adminDb.collection('staffSchoolAccess').doc(uid).get();
  if (!access.exists) return false;
  const data = access.data() || {};
  return String(data.schoolId || '') === schoolId || (Array.isArray(data.schoolIds) && data.schoolIds.map(String).includes(schoolId));
};

const list = async (uid: string, role: string, targetType: string, targetId: string) => {
  if (targetId) {
    const ref = adminDb.collection('milestones').where('targetType', '==', targetType).where('targetId', '==', targetId).limit(200);
    const snap = await ref.get();
    const rows: Record<string, any>[] = [];
    snap.forEach(d => rows.push(serialise(d.id, d.data() as Record<string, any>)));
    const allowed = await Promise.all(rows.map(async row => {
      if (adminRole(role)) return true;
      if (role === 'STUDENT') {
        const profile = await userRecord(uid);
        return targetType === 'STUDENT' && (String(profile.studentDocId || '') === targetId || String(row.studentUserId || '') === uid);
      }
      if (role === 'PARENT') {
        const student = targetType === 'STUDENT' ? await findStudent(targetId) : null;
        return !!student && [student.parentId, student.parentUserId].map(String).includes(uid);
      }
      if (role === 'SCHOOL') return targetType === 'SCHOOL' && String((await userRecord(uid)).schoolId || '') === targetId;
      if (['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return targetType === 'STUDENT' ? await canManageStudent(uid, targetId, role) : await canManageSchool(uid, targetId, role);
      return false;
    }));
    return rows.filter((_, i) => allowed[i]).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  }
  if (adminRole(role)) {
    const snap = await adminDb.collection('milestones').limit(300).get();
    return snap.docs.map(d => serialise(d.id, d.data() as Record<string, any>)).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  }
  return [];
};

export const handler: Handler = async (event) => {
  try {
    const raw = token(event); if (!raw) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(raw); const user = await userRecord(decoded.uid); const role = roleOf(user.role);
    if (event.httpMethod === 'GET') {
      const targetType = String(event.queryStringParameters?.targetType || 'STUDENT').toUpperCase();
      const targetId = String(event.queryStringParameters?.targetId || '');
      if (!['STUDENT', 'SCHOOL'].includes(targetType)) return json(400, { error: 'Invalid milestone target.' });
      return json(200, { milestones: await list(decoded.uid, role, targetType, targetId) });
    }
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
    const body = JSON.parse(event.body || '{}'); const action = String(body.action || '').trim();
    const targetType = String(body.targetType || 'STUDENT').toUpperCase(); const targetId = text(body.targetId, 200);
    if (!['STUDENT', 'SCHOOL'].includes(targetType) || !targetId) return json(400, { error: 'Choose a valid milestone target.' });

    if (action === 'create') {
      const allowed = targetType === 'STUDENT' ? await canManageStudent(decoded.uid, targetId, role) : await canManageSchool(decoded.uid, targetId, role);
      if (!allowed) return json(403, { error: 'You can only build milestones for learners or schools assigned to you.' });
      const title = text(body.title, 180); const description = text(body.description, 5000);
      if (!title) return json(400, { error: 'Milestone title is required.' });
      const dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) return json(400, { error: 'Choose a valid due date.' });
      let student: Record<string, any> | null = null;
      if (targetType === 'STUDENT') student = await findStudent(targetId);
      const ref = adminDb.collection('milestones').doc();
      const payload = { title, description, targetType, targetId, studentId: targetType === 'STUDENT' ? targetId : null, schoolId: targetType === 'SCHOOL' ? targetId : student?.schoolId || null, studentUserId: student?.firebaseUid || student?.userId || null, parentId: student?.parentId || null, ownerId: decoded.uid, ownerName: String(user.name || user.displayName || decoded.name || 'Tutor'), position: Number(body.position || 0), status: 'NOT_STARTED', dueDate, completedAt: null, createdAt: now(), updatedAt: now() };
      await ref.set(payload);
      const path = targetType === 'STUDENT' ? '/portal/student/milestones' : '/portal/school/milestones';
      await notify(String(payload.studentUserId || ''), 'New learning milestone', `${title} has been added to your learning plan.`, path);
      await notify(String(payload.parentId || ''), 'New milestone for your child', `${title} has been added to ${student?.fullName || student?.studentName || 'your child'}’s learning plan.`, '/portal/parent/milestones');
      return json(201, { milestone: serialise(ref.id, payload) });
    }

    const milestoneId = text(body.milestoneId, 200); if (!milestoneId) return json(400, { error: 'Milestone is required.' });
    const ref = adminDb.collection('milestones').doc(milestoneId); const snap = await ref.get(); if (!snap.exists) return json(404, { error: 'Milestone not found.' });
    const milestone = snap.data() || {};
    const allowed = milestone.targetType === 'STUDENT' ? await canManageStudent(decoded.uid, String(milestone.targetId || ''), role) : await canManageSchool(decoded.uid, String(milestone.targetId || ''), role);
    if (!allowed) return json(403, { error: 'You are not authorized to manage this milestone.' });

    if (action === 'complete' || action === 'status') {
      const status = action === 'complete' ? 'COMPLETED' : String(body.status || '').toUpperCase();
      if (!['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'].includes(status)) return json(400, { error: 'Invalid milestone status.' });
      const completedAt = status === 'COMPLETED' ? now() : null;
      await ref.update({ status, completedAt, updatedAt: now() });
      if (status === 'COMPLETED') {
        const studentUserId = String(milestone.studentUserId || ''); const parentId = String(milestone.parentId || '');
        await notify(studentUserId, 'Milestone completed', `${milestone.title} has been marked complete by your tutor.`, '/portal/student/milestones');
        await notify(parentId, 'Learning milestone completed', `${milestone.title} has been completed.`, '/portal/parent/milestones');
      }
      return json(200, { milestone: serialise(milestoneId, { ...milestone, status, completedAt, updatedAt: now() }) });
    }
    if (action === 'update') {
      const patch: Record<string, unknown> = { updatedAt: now() };
      if (body.title !== undefined) patch.title = text(body.title, 180);
      if (body.description !== undefined) patch.description = text(body.description, 5000);
      if (body.position !== undefined) patch.position = Math.max(0, Number(body.position) || 0);
      if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
      await ref.update(patch);
      return json(200, { milestone: serialise(milestoneId, { ...milestone, ...patch }) });
    }
    if (action === 'delete') { await ref.delete(); return json(200, { deleted: true }); }
    return json(400, { error: 'Unsupported milestone action.' });
  } catch (error) {
    const code = error instanceof Error ? error.message : ''; if (code === 'PROFILE_NOT_FOUND') return json(403, { error: 'Your portal profile could not be verified.' }); if (code === 'ACCOUNT_INACTIVE') return json(403, { error: 'Your account is not active.' }); console.warn('Academic milestones fallback notice:', error); return json(200, { milestones: [], fallback: true });
  }
};
