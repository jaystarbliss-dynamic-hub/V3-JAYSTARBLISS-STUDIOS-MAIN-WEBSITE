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
    const studentId = clean(body.studentId, 160);
    const programId = clean(body.programId, 160);
    const programSlug = clean(body.programSlug, 160);
    const programTitle = clean(body.programTitle, 200);
    const programBreadcrumb = clean(body.programBreadcrumb, 300);
    const notes = clean(body.notes, 1000);
    const parentEmailNorm = clean(parent.email || decoded.email || '', 160).toLowerCase();

    let studentName = clean(body.studentName);
    let studentAge = clean(body.studentAge, 40);
    let studentClass = clean(body.studentClass, 80);

    // If enrolling an existing linked child, STRICTLY verify parent-child relationship server-side
    if (studentId) {
      let verifiedChild: Record<string, any> | null = null;
      const [parentProfileSnap] = await Promise.all([
        adminDb.collection('parents').doc(decoded.uid).get().catch(() => null),
      ]);
      const explicitChildIds = new Set<string>();
      for (const source of [parent, parentProfileSnap?.exists ? parentProfileSnap.data() : null]) {
        if (!source) continue;
        const arr = [
          ...(Array.isArray(source.children) ? source.children : []),
          ...(Array.isArray(source.linkedStudentIds) ? source.linkedStudentIds : []),
          ...(Array.isArray(source.studentIds) ? source.studentIds : []),
        ];
        arr.forEach((item: any) => {
          const cid = String(item && typeof item === 'object' ? item.id || item.studentId : item || '').trim();
          if (cid) explicitChildIds.add(cid);
        });
      }

      for (const colName of ['individualStudents', 'students']) {
        const snap = await adminDb.collection(colName).doc(studentId).get().catch(() => null);
        if (!snap?.exists) continue;
        const sData = snap.data() || {};
        const sParentId = String(sData.parentId || sData.parentUid || sData.parentUserId || sData.guardianId || '').trim();
        const sParentEmail = String(sData.parentEmail || sData.guardianEmail || '').toLowerCase().trim();
        const isLinked =
          (Boolean(sParentId) && sParentId === decoded.uid) ||
          (Boolean(parentEmailNorm) && Boolean(sParentEmail) && sParentEmail === parentEmailNorm) ||
          explicitChildIds.has(studentId);
        if (!isLinked) {
          return json(403, {
            code: 'CHILD_NOT_LINKED_TO_PARENT',
            error: 'You can only submit programme enrolments for children verified as linked to your parent account.',
          });
        }
        verifiedChild = { id: snap.id, ...sData };
        break;
      }

      if (!verifiedChild) {
        return json(404, {
          code: 'LINKED_CHILD_NOT_FOUND',
          error: 'The selected child profile could not be found on your parent account.',
        });
      }

      studentName = clean(verifiedChild.fullName || verifiedChild.studentName || verifiedChild.name || studentName);
      studentClass = clean(verifiedChild.class || verifiedChild.grade || verifiedChild.classLevel || studentClass, 80);
      studentAge = clean(studentAge || verifiedChild.age || studentClass || 'Linked Learner', 40);
    }

    const selectedProgramIds = Array.isArray(body.selectedProgramIds)
      ? body.selectedProgramIds.map((id: unknown) => clean(id, 160)).filter(Boolean)
      : programId
      ? [programId]
      : [];
    const programPaths = Array.isArray(body.programPaths)
      ? body.programPaths.map((p: unknown) => clean(p, 240)).filter(Boolean)
      : programBreadcrumb
      ? [programBreadcrumb]
      : [];
    const deliveryType = clean(body.deliveryType || 'PUBLIC_GROUP', 60);
    const plan = clean(body.plan || programTitle || programPaths[0] || '', 180);
    const subjects = Array.isArray(body.subjects)
      ? body.subjects.map((subject: unknown) => clean(subject, 80)).filter(Boolean).slice(0, 12)
      : programPaths.slice(0, 12);

    if (!studentName || (!studentId && !studentAge) || (!plan && selectedProgramIds.length === 0)) {
      return json(400, { error: 'Student details and at least one selected programme or sub-programme are required.' });
    }

    // Prevent accidental duplicate active/pending requests for the same parent + child + programme
    if (studentId && (programId || selectedProgramIds.length === 1)) {
      const targetProgId = programId || selectedProgramIds[0];
      const existingSnap = await adminDb
        .collection('enrollment_requests')
        .where('parentId', '==', decoded.uid)
        .limit(100)
        .get()
        .catch(() => ({ docs: [] as any[] }));
      const duplicate = existingSnap.docs.find((d) => {
        const data = d.data() || {};
        const statusNorm = String(data.status || 'pending').toLowerCase();
        if (['rejected', 'cancelled', 'declined'].includes(statusNorm)) return false;
        const sameChild = String(data.studentId || '') === studentId;
        const sameProg =
          String(data.programId || '') === targetProgId ||
          (Array.isArray(data.selectedProgramIds) && data.selectedProgramIds.includes(targetProgId));
        return sameChild && sameProg;
      });
      if (duplicate) {
        return json(200, {
          alreadyExists: true,
          request: { id: duplicate.id, ...(duplicate.data() || {}) },
        });
      }
    }

    const now = new Date();
    const ref = adminDb.collection('enrollment_requests').doc();
    const record = {
      ...(studentId ? { studentId } : {}),
      studentName,
      studentAge: studentAge || studentClass || 'Linked Learner',
      ...(studentClass ? { studentClass } : {}),
      ...(programId ? { programId } : {}),
      ...(programSlug ? { programSlug } : {}),
      ...(programTitle ? { programTitle } : {}),
      ...(programBreadcrumb ? { programBreadcrumb } : {}),
      plan: plan || 'Pending Programme Confirmation',
      selectedProgramIds,
      assignedTrackIds: selectedProgramIds,
      programPaths,
      deliveryType,
      subjects,
      ...(notes ? { notes } : {}),
      parentId: decoded.uid,
      parentEmail: parentEmailNorm,
      parentName: clean(parent.name || parent.displayName || '', 160),
      billingResponsibility: 'PARENT_FUNDED',
      paymentStatus: 'UNPAID',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      source: clean(body.source || 'parent_portal', 60),
    };

    await ref.set(record);
    await adminDb.collection('activityLogs').add({
      actorId: decoded.uid,
      action: 'PARENT_ENROLLMENT_REQUEST_CREATED',
      targetId: ref.id,
      targetType: 'enrollment_request',
      timestamp: now,
      metadata: { studentId: studentId || null, studentName, plan, selectedProgramIds, subjects },
    });
    await notifyGlobalAdmins(ref.id, record);

    return json(201, { alreadyExists: false, request: { id: ref.id, ...record } });
  } catch (error) {
    console.error('Parent enrollment request error:', error);
    return json(500, { error: 'Unable to submit the enrollment request.' });
  }
};
