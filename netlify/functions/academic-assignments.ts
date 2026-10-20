import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const getBearer = (event: any) => { const header = event.headers?.authorization || event.headers?.Authorization || ''; return header.startsWith('Bearer ') ? header.slice(7) : ''; };
const normaliseRole = (role: unknown) => String(role || '').trim().toUpperCase();
const now = () => new Date();

const userRecord = async (uid: string) => {
  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) throw new Error('PROFILE_NOT_FOUND');
  const data = snap.data() || {};
  if (['DISABLED', 'SUSPENDED', 'BANNED'].includes(normaliseRole(data.accountStatus))) throw new Error('ACCOUNT_INACTIVE');
  return { id: uid, ...data } as Record<string, any>;
};
const findStudent = async (studentId: string) => { for (const name of ['individualStudents', 'students']) { const snap = await adminDb.collection(name).doc(studentId).get(); if (snap.exists) return { id: snap.id, collection: name, ...snap.data() } as Record<string, any>; } return null; };
const assignedTo = (student: Record<string, any>, uid: string) => [student.tutorId, student.staffId, student.assignedTutorId, student.assignedStaffId, student.instructorId].some(value => String(value || '') === uid);
const parentOwns = (student: Record<string, any>, uid: string) => [student.parentId, student.parentUserId].some(value => String(value || '') === uid);
const schoolOwns = (student: Record<string, any>, schoolId: string) => String(student.schoolId || '') === schoolId;
const safeText = (value: unknown, max = 4000) => String(value || '').trim().slice(0, max);

const notify = async (recipientId: string, title: string, message: string, data: Record<string, unknown> = {}) => {
  if (!recipientId) return;
  await adminDb.collection('notifications').add({ recipientId, recipientUid: recipientId, recipientIds: [recipientId], title, message, type: 'private', visibility: 'private', read: false, priority: 'normal', assignmentId: data.assignmentId || null, studentId: data.studentId || null, link: data.assignmentId ? '/portal/student/assignments' : undefined, timestamp: now(), createdAt: now() });
};

const serialise = (id: string, data: Record<string, any>) => ({ id, ...data, createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null, updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null, dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate || null, submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : data.submittedAt || null, reviewedAt: data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : data.reviewedAt || null });

const canAccessAssignment = async (assignment: Record<string, any>, uid: string, role: string) => {
  if (['ADMIN', 'SUPER_ADMIN', 'CONTENT_ADMIN', 'EDUCATION_ADMIN', 'SERVICES_ADMIN', 'MARKETING_ADMIN', 'SUPPORT_ADMIN'].includes(role)) return true;
  if (['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return String(assignment.tutorId || assignment.staffId || '') === uid;
  const student = await findStudent(String(assignment.studentId || '')); if (!student) return false;
  if (role === 'STUDENT') { const profile = await userRecord(uid); return String(student.firebaseUid || student.userId || '') === uid || String(assignment.studentUserId || '') === uid || String(profile.studentDocId || '') === String(assignment.studentId || ''); }
  if (role === 'PARENT') return parentOwns(student, uid) || String(assignment.parentId || '') === uid;
  if (role === 'SCHOOL') return schoolOwns(student, String((await userRecord(uid)).schoolId || ''));
  return false;
};

const listAssignments = async (uid: string, role: string, queryParams: URLSearchParams) => {
  const requestedStudentId = queryParams.get('studentId') || ''; const requestedStatus = queryParams.get('status') || ''; const studentIds: string[] = [];
  if (['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) {
    for (const field of ['tutorId', 'staffId', 'assignedTutorId', 'assignedStaffId', 'instructorId']) for (const name of ['individualStudents', 'students']) { try { (await adminDb.collection(name).where(field, '==', uid).limit(100).get()).forEach(d => studentIds.push(d.id)); } catch (e) { console.warn(`Assigned student query failed for ${name}.${field}`, e); } }
  } else if (role === 'STUDENT') {
    const profile = await userRecord(uid); if (profile.studentDocId) studentIds.push(String(profile.studentDocId));
    const [individual, students] = await Promise.all([adminDb.collection('individualStudents').where('firebaseUid', '==', uid).limit(10).get(), adminDb.collection('students').where('firebaseUid', '==', uid).limit(10).get()]); individual.forEach(d => studentIds.push(d.id)); students.forEach(d => studentIds.push(d.id));
  } else if (role === 'PARENT') {
    const [individual, students] = await Promise.all([adminDb.collection('individualStudents').where('parentId', '==', uid).limit(100).get(), adminDb.collection('students').where('parentId', '==', uid).limit(100).get()]); individual.forEach(d => studentIds.push(d.id)); students.forEach(d => studentIds.push(d.id));
  } else if (role === 'SCHOOL') {
    const user = await userRecord(uid); const schoolId = String(user.schoolId || uid);
    const [individual, students] = await Promise.all([adminDb.collection('individualStudents').where('schoolId', '==', schoolId).limit(200).get(), adminDb.collection('students').where('schoolId', '==', schoolId).limit(200).get()]); individual.forEach(d => studentIds.push(d.id)); students.forEach(d => studentIds.push(d.id));
  }
  const uniqueStudentIds = Array.from(new Set(studentIds)).filter(id => !requestedStudentId || id === requestedStudentId); if (requestedStudentId && !uniqueStudentIds.includes(requestedStudentId)) return []; if (!uniqueStudentIds.length) return [];
  const chunks: string[][] = []; for (let i = 0; i < uniqueStudentIds.length; i += 10) chunks.push(uniqueStudentIds.slice(i, i + 10));
  const results: Record<string, any>[] = [];
  for (const chunk of chunks) { const snap = await adminDb.collection('assignments').where('studentId', 'in', chunk).limit(200).get(); snap.forEach(d => { const item = serialise(d.id, d.data() as Record<string, any>); if (!requestedStatus || String(item.status || '') === requestedStatus) results.push(item); }); }
  return results.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
};

export const handler: Handler = async (event) => {
  try {
    const authToken = getBearer(event); if (!authToken) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(authToken); const user = await userRecord(decoded.uid); const role = normaliseRole(user.role);
    if (event.httpMethod === 'GET') { const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return json(200, { assignments: await listAssignments(decoded.uid, role, params) }); }
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
    const body = JSON.parse(event.body || '{}'); const action = String(body.action || '').trim();

    if (action === 'create') {
      if (!['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return json(403, { error: 'Only assigned teaching staff can create assignments.' });
      const studentId = safeText(body.studentId, 200); const student = await findStudent(studentId); if (!student || !assignedTo(student, decoded.uid)) return json(403, { error: 'That student is not assigned to your teaching account.' });
      const title = safeText(body.title, 160); const instructions = safeText(body.instructions, 8000); if (!title || !instructions) return json(400, { error: 'Assignment title and instructions are required.' });
      const dueDate = new Date(String(body.dueDate || '')); if (Number.isNaN(dueDate.getTime())) return json(400, { error: 'Choose a valid due date.' }); if (dueDate.getTime() < Date.now() - 60000) return json(400, { error: 'Due date cannot be in the past.' });
      const assignmentRef = adminDb.collection('assignments').doc();
      const payload = { title, instructions, tutorId: decoded.uid, staffId: decoded.uid, tutorName: String(user.name || user.displayName || decoded.name || decoded.email || 'Tutor'), tutorEmail: decoded.email || user.email || '', studentId, studentUserId: student.firebaseUid || student.userId || null, studentName: student.fullName || student.studentName || student.name || 'Student', parentId: student.parentId || null, schoolId: student.schoolId || null, programId: safeText(body.programId, 200) || student.programId || null, moduleId: safeText(body.moduleId, 200) || null, resourceUrl: safeText(body.resourceUrl, 2000) || null, resourceTitle: safeText(body.resourceTitle, 200) || null, dueDate, status: 'PUBLISHED', grade: null, feedback: null, submissionText: null, submissionUrl: null, submittedAt: null, reviewedAt: null, reviewStatus: null, createdAt: now(), updatedAt: now() };
      await assignmentRef.set(payload); await notify(String(payload.studentUserId || ''), 'New assignment from your tutor', `${title} is ready. Due ${dueDate.toLocaleDateString('en-NG')}.`, { assignmentId: assignmentRef.id, studentId }); await notify(String(payload.parentId || ''), 'New assignment for your child', `${payload.studentName} has a new assignment: ${title}.`, { assignmentId: assignmentRef.id, studentId });
      return json(201, { assignment: serialise(assignmentRef.id, payload) });
    }

    const assignmentId = safeText(body.assignmentId, 200); if (!assignmentId) return json(400, { error: 'Assignment is required.' });
    const ref = adminDb.collection('assignments').doc(assignmentId); const snap = await ref.get(); if (!snap.exists) return json(404, { error: 'Assignment not found.' });
    const assignment = snap.data() || {}; if (!(await canAccessAssignment(assignment, decoded.uid, role))) return json(403, { error: 'You are not authorized to access this assignment.' });

    if (action === 'submit') {
      if (role !== 'STUDENT') return json(403, { error: 'Only the assigned student can submit this assignment.' });
      if (['COMPLETED'].includes(String(assignment.status || ''))) return json(409, { error: 'This assignment has already been completed.' });
      const submissionText = safeText(body.submissionText, 12000);
      const submissionUrl = safeText(body.submissionUrl, 4000);
      const submissionFileUrl = safeText(body.submissionFileUrl, 4000);
      const submissionFileName = safeText(body.submissionFileName, 240);
      const finalSubmissionUrl = submissionUrl || submissionFileUrl;
      if (!submissionText && !finalSubmissionUrl) return json(400, { error: 'Add written work, a project link, or upload a file before submitting.' });
      const submittedAt = now();
      const patch = { submissionText: submissionText || null, submissionUrl: finalSubmissionUrl || null, submissionFileName: submissionFileUrl ? (submissionFileName || 'Uploaded file') : null, submittedAt, status: 'SUBMITTED', reviewStatus: 'AWAITING_REVIEW', updatedAt: now() };
      await ref.update(patch);
      await notify(String(assignment.tutorId || assignment.staffId || ''), 'Assignment submitted', String(assignment.studentName || 'A student') + ' submitted ' + String(assignment.title || 'an assignment') + '.', { assignmentId, studentId: assignment.studentId });
      return json(200, { assignment: serialise(assignmentId, { ...assignment, ...patch }) });
    }
    if (action === 'review') {
      if (!['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) return json(403, { error: 'Only the assigned tutor/staff member can review this assignment.' });
      const grade = Number(body.grade); if (!Number.isFinite(grade) || grade < 0 || grade > 100) return json(400, { error: 'Grade must be between 0 and 100.' }); const feedback = safeText(body.feedback, 12000); if (!feedback) return json(400, { error: 'Feedback is required when reviewing an assignment.' });
      const reviewStatus = String(body.reviewStatus || 'COMPLETED').toUpperCase(); if (!['COMPLETED', 'RESUBMISSION_REQUIRED'].includes(reviewStatus)) return json(400, { error: 'Choose completed or resubmission required.' }); const status = reviewStatus === 'COMPLETED' ? 'COMPLETED' : 'RESUBMISSION_REQUIRED';
      await ref.update({ grade, feedback, reviewStatus, status, reviewedAt: now(), updatedAt: now() });
      await notify(String(assignment.studentUserId || ''), reviewStatus === 'COMPLETED' ? 'Assignment reviewed' : 'Assignment needs another submission', reviewStatus === 'COMPLETED' ? `${assignment.title} was reviewed. Score: ${grade}/100.` : `${assignment.title} needs another submission. Open the assignment to read your tutor's feedback.`, { assignmentId, studentId: assignment.studentId });
      await notify(String(assignment.parentId || ''), reviewStatus === 'COMPLETED' ? 'Assignment result available' : 'Assignment needs attention', reviewStatus === 'COMPLETED' ? `${assignment.studentName || 'Your child'} scored ${grade}/100 on ${assignment.title}.` : `${assignment.studentName || 'Your child'} has an assignment that needs another submission.`, { assignmentId, studentId: assignment.studentId });
      return json(200, { assignment: serialise(assignmentId, { ...assignment, grade, feedback, reviewStatus, status, reviewedAt: now(), updatedAt: now() }) });
    }
    return json(400, { error: 'Unsupported assignment action.' });
  } catch (error) {
    const code = error instanceof Error ? error.message : ''; if (code === 'PROFILE_NOT_FOUND') return json(403, { error: 'Your portal profile could not be verified.' }); if (code === 'ACCOUNT_INACTIVE') return json(403, { error: 'Your account is not active.' }); console.error('Academic assignments error:', error); return json(500, { error: 'Unable to complete the assignment request.' });
  }
};
