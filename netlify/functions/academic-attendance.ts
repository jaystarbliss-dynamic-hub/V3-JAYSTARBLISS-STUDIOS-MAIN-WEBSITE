import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const token = (event: any) => { const h = event.headers?.authorization || event.headers?.Authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
const roleOf = (v: unknown) => String(v || '').trim().toUpperCase();
const text = (v: unknown, max = 1000) => String(v || '').trim().slice(0, max);
const blocked = (v: unknown) => ['DISABLED', 'SUSPENDED', 'BANNED'].includes(String(v || 'ACTIVE').toUpperCase());
const findStudent = async (id: string) => { for (const name of ['individualStudents', 'students']) { const snap = await adminDb.collection(name).doc(id).get(); if (snap.exists) return { id: snap.id, ...snap.data() } as Record<string, any>; } return null; };
const assigned = (s: Record<string, any>, uid: string) => [s.tutorId, s.staffId, s.assignedTutorId, s.assignedStaffId, s.instructorId].some(v => String(v || '') === uid);
const user = async (uid: string) => { const snap = await adminDb.collection('users').doc(uid).get(); if (!snap.exists) throw new Error('PROFILE_NOT_FOUND'); const data = snap.data() || {}; if (blocked(data.accountStatus || data.status)) throw new Error('ACCOUNT_INACTIVE'); return data; };

export const handler: Handler = async event => {
  try {
    const raw = token(event); if (!raw) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(raw); const profile = await user(decoded.uid); const role = roleOf(profile.role);
    if (event.httpMethod === 'GET') {
      const studentId = text(event.queryStringParameters?.studentId, 200); if (!studentId) return json(400, { error: 'Student is required.' });
      const student = await findStudent(studentId); if (!student) return json(404, { error: 'Student not found.' });
      let allowed = false;
      if (['ADMIN', 'SUPER_ADMIN', 'CONTENT_ADMIN', 'EDUCATION_ADMIN', 'SERVICES_ADMIN', 'MARKETING_ADMIN', 'SUPPORT_ADMIN'].includes(role)) allowed = true;
      else if (['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) allowed = assigned(student, decoded.uid);
      else if (role === 'PARENT') allowed = String(student.parentId || '') === decoded.uid;
      else if (role === 'STUDENT') allowed = String(student.firebaseUid || student.userId || '') === decoded.uid || String(profile.studentDocId || '') === studentId;
      else if (role === 'SCHOOL') allowed = String(student.schoolId || '') === String(profile.schoolId || decoded.uid);
      if (!allowed) return json(403, { error: 'You are not authorized to view this attendance record.' });
      const snap = await adminDb.collection('attendance').where('studentId', '==', studentId).limit(200).get();
      const records = snap.docs.map(d => { const data = d.data() as Record<string, any>; return { id: d.id, ...data, date: data.date?.toDate ? data.date.toDate().toISOString() : data.date || null, createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null }; }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return json(200, { records });
    }
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
    if (!['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return json(403, { error: 'Only teaching staff can record attendance.' });
    const body = JSON.parse(event.body || '{}'); const studentId = text(body.studentId, 200); const student = await findStudent(studentId);
    if (!student || !assigned(student, decoded.uid)) return json(403, { error: 'That student is not assigned to your teaching account.' });
    const dateValue = new Date(String(body.date || '')); if (Number.isNaN(dateValue.getTime())) return json(400, { error: 'Choose a valid class date.' });
    const status = String(body.status || '').toUpperCase(); if (!['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(status)) return json(400, { error: 'Choose a valid attendance status.' });
    const existing = await adminDb.collection('attendance').where('studentId', '==', studentId).where('dateKey', '==', dateValue.toISOString().slice(0, 10)).limit(1).get();
    const payload = { studentId, studentName: student.fullName || student.studentName || student.name || 'Student', tutorId: decoded.uid, schoolId: student.schoolId || null, date: dateValue, dateKey: dateValue.toISOString().slice(0, 10), status, notes: text(body.notes, 1000), updatedAt: new Date() };
    if (existing.empty) { const ref = adminDb.collection('attendance').doc(); await ref.set({ ...payload, createdAt: new Date() }); return json(201, { record: { id: ref.id, ...payload } }); }
    const ref = existing.docs[0].ref; await ref.update(payload); return json(200, { record: { id: ref.id, ...payload } });
  } catch (error) { const code = error instanceof Error ? error.message : ''; if (code === 'PROFILE_NOT_FOUND') return json(403, { error: 'Your portal profile could not be verified.' }); if (code === 'ACCOUNT_INACTIVE') return json(403, { error: 'Your account is not active.' }); console.warn('Academic attendance fallback notice:', error); return json(200, { records: [], fallback: true }); }
};
