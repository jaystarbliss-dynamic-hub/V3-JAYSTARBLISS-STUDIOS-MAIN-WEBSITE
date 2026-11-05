import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const bearer = (event: any) => {
  const value = event.headers?.authorization || event.headers?.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};

const clean = (value: unknown, max = 160) => String(value ?? '').trim().slice(0, max);
const blocked = (value: unknown) => ['SUSPENDED', 'BANNED', 'DISABLED'].includes(String(value || 'ACTIVE').toUpperCase());

export const handler: Handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const token = bearer(event);
    if (!token) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(token);
    const parentSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!parentSnap.exists) return json(403, { error: 'Portal profile not found.' });
    const parent = parentSnap.data() || {};
    const role = String(parent.role || '').trim().toLowerCase();
    if (role !== 'parent' || blocked(parent.accountStatus || parent.status)) return json(403, { error: 'Only an active parent account can submit an enrollment request.' });

    let body: any = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request payload.' }); }
    const notifyGlobalAdmins = async (requestId: string, record: any) => {
      try {
        const users = await adminDb.collection('users').limit(1000).get();
        const admins = users.docs.filter(d => ['admin','super_admin','superadmin'].includes(String(d.data().role || '').trim().toLowerCase()));
        const batch = adminDb.batch();
        for (const admin of admins) {
          const notification = adminDb.collection('notifications').doc('parent-enrollment-' + requestId + '-' + admin.id);
          batch.set(notification, {
            recipientId: admin.id,
            recipientType: 'specific_user',
            type: 'registration',
            priority: 'high',
            title: 'New parent enrollment request',
            message: String(record.parentName || 'A parent') + ' requested enrollment for ' + String(record.studentName || 'a student') + '.',
            enrollmentRequestId: requestId,
            studentName: String(record.studentName || ''),
            plan: String(record.plan || ''),
            parentId: decoded.uid,
            readBy: [],
            read: false,
            timestamp: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            senderName: 'Jaystarbliss Central',
            senderRole: 'System'
          });
        }
        if (admins.length) await batch.commit();
      } catch (notificationError) {
        console.warn('Admin enrollment notification failed:', notificationError);
      }
    };
    if (body.action === 'notify_only') {
      const requestId = clean(body.requestId, 160);
      if (!requestId) return json(400, { error: 'Enrollment request ID is required.' });
      const requestSnap = await adminDb.collection('enrollment_requests').doc(requestId).get();
      if (!requestSnap.exists || String(requestSnap.data()?.parentId || '') !== decoded.uid) return json(404, { error: 'Enrollment request not found.' });
      await notifyGlobalAdmins(requestId, requestSnap.data() || {});
      return json(200, { ok: true });
    }
    const studentName = clean(body.studentName);
    const studentAge = clean(body.studentAge, 40);
    const selectedProgramIds = Array.isArray(body.selectedProgramIds)
      ? body.selectedProgramIds.map((id: unknown) => clean(id, 160)).filter(Boolean)
      : [];
    const programPaths = Array.isArray(body.programPaths)
      ? body.programPaths.map((p: unknown) => clean(p, 240)).filter(Boolean)
      : [];
    const deliveryType = clean(body.deliveryType || 'PUBLIC_GROUP', 60);
    const plan = clean(body.plan || programPaths[0] || '', 180);
    const subjects = Array.isArray(body.subjects)
      ? body.subjects.map((subject: unknown) => clean(subject, 80)).filter(Boolean).slice(0, 12)
      : programPaths.slice(0, 12);

    if (!studentName || !studentAge || (!plan && selectedProgramIds.length === 0)) {
      return json(400, { error: 'Student name, age/grade, and at least one selected programme or sub-programme are required.' });
    }

    const now = new Date();
    const ref = adminDb.collection('enrollment_requests').doc();
    const record = {
      studentName,
      studentAge,
      plan: plan || 'Pending Programme Confirmation',
      selectedProgramIds,
      assignedTrackIds: selectedProgramIds,
      programPaths,
      deliveryType,
      subjects,
      parentId: decoded.uid,
      parentEmail: clean(parent.email || '', 160).toLowerCase(),
      parentName: clean(parent.name || parent.displayName || '', 160),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      source: 'parent_portal',
    };

    await ref.set(record);
    await adminDb.collection('activityLogs').add({
      actorId: decoded.uid,
      action: 'PARENT_ENROLLMENT_REQUEST_CREATED',
      targetId: ref.id,
      targetType: 'enrollment_request',
      timestamp: now,
      metadata: { studentName, plan, subjects },
    });
    await notifyGlobalAdmins(ref.id, record);

    return json(201, { request: { id: ref.id, ...record } });
  } catch (error) {
    console.error('Parent enrollment request error:', error);
    return json(500, { error: 'Unable to submit the enrollment request.' });
  }
};
