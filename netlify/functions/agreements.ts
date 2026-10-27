import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  AGREEMENT_CATEGORIES,
  AGREEMENT_STATUSES,
  createAgreementVersionSnapshot,
  canAccessAgreement,
  isPlatformAdminRole,
} from '../../api/_lib/jdi-assessment.js';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const bearer = (event: any) => {
  const h = event.headers?.authorization || event.headers?.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

const blocked = (v: unknown) =>
  ['DISABLED', 'SUSPENDED', 'BANNED'].includes(String(v || 'ACTIVE').toUpperCase());

async function resolveCaller(event: any) {
  const raw = bearer(event);
  if (!raw) throw new Error('AUTH');
  const decoded = await adminAuth.verifyIdToken(raw);
  const snap = await adminDb.collection('users').doc(decoded.uid).get();
  if (!snap.exists) throw new Error('PROFILE');
  const user = snap.data() || {};
  if (blocked(user.accountStatus || user.status)) throw new Error('INACTIVE');
  return {
    uid: decoded.uid,
    role: String(user.role || '').trim().toUpperCase(),
    schoolId: String(user.schoolId || '').trim(),
    name: String(user.fullName || user.name || user.displayName || decoded.email || 'User').trim(),
    user,
  };
}

export const handler: Handler = async event => {
  try {
    const actor = await resolveCaller(event);
    const method = event.httpMethod || 'GET';

    if (method === 'GET') {
      const snap = await adminDb.collection('agreements').limit(250).get();
      const allRecords = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const visible = allRecords
        .filter(item => canAccessAgreement(item, actor))
        .sort((a, b) =>
          String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
        );
      return json(200, { records: visible });
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const action = String(body.action || 'SAVE').toUpperCase();

      // Recipient acknowledgement or discussion note
      if (action === 'RECIPIENT_RESPONSE') {
        const agreementId = String(body.id || '').trim();
        if (!agreementId) return json(400, { error: 'Agreement ID is required.' });
        const ref = adminDb.collection('agreements').doc(agreementId);
        const existingSnap = await ref.get();
        if (!existingSnap.exists) return json(404, { error: 'Agreement not found.' });
        const existing = existingSnap.data() || {};

        if (!canAccessAgreement(existing, actor)) {
          return json(403, { error: 'You are not authorised to respond to this agreement.' });
        }

        const requestedStatus = String(body.status || '').toUpperCase();
        const allowedRecipientStatuses = ['UNDER_DISCUSSION', 'REVISION_REQUESTED', 'AGREED', 'SIGNED'];
        const nextStatus = allowedRecipientStatuses.includes(requestedStatus)
          ? requestedStatus
          : existing.status;

        const nowIso = new Date().toISOString();
        const note = String(body.note || '').trim().slice(0, 2000);
        const auditEntry = {
          action: `RECIPIENT_${nextStatus}`,
          actorId: actor.uid,
          actorName: actor.name,
          actorRole: actor.role,
          note,
          timestamp: nowIso,
        };

        const updatePayload: Record<string, any> = {
          status: nextStatus,
          recipientNotes: note || existing.recipientNotes || '',
          updatedAt: nowIso,
          auditLog: [...(Array.isArray(existing.auditLog) ? existing.auditLog : []), auditEntry],
        };

        if (nextStatus === 'AGREED' || nextStatus === 'SIGNED') {
          updatePayload.acknowledgedAt = nowIso;
          updatePayload.acknowledgedBy = actor.uid;
          updatePayload.acknowledgedByName = actor.name;
        }

        await ref.set(updatePayload, { merge: true });
        return json(200, { agreement: { id: ref.id, ...existing, ...updatePayload } });
      }

      // Admin authoring & publishing
      if (!isPlatformAdminRole(actor.role)) {
        return json(403, { error: 'Only platform administrators can author or modify agreements.' });
      }

      const title = String(body.title || '').trim();
      if (!title) return json(400, { error: 'Agreement title is required.' });

      const category = AGREEMENT_CATEGORIES.includes(String(body.category || '').toUpperCase())
        ? String(body.category).toUpperCase()
        : 'PROPOSAL';

      const status = AGREEMENT_STATUSES.includes(String(body.status || '').toUpperCase())
        ? String(body.status).toUpperCase()
        : 'DRAFT';

      const recipientType = ['SCHOOL', 'TUTOR', 'PARENT'].includes(String(body.recipientType || '').toUpperCase())
        ? String(body.recipientType).toUpperCase()
        : 'SCHOOL';

      const recipientId = String(body.recipientId || '').trim();
      const recipientSchoolId = String(body.recipientSchoolId || (recipientType === 'SCHOOL' ? recipientId : '')).trim();
      const recipientName = String(body.recipientName || '').trim();

      if (!recipientId && !recipientSchoolId) {
        return json(400, { error: 'Select a valid agreement recipient (school, tutor, or parent).' });
      }

      const ref = body.id
        ? adminDb.collection('agreements').doc(String(body.id))
        : adminDb.collection('agreements').doc();

      let existing: Record<string, any> = {};
      if (body.id) {
        const oldSnap = await ref.get();
        if (oldSnap.exists) existing = oldSnap.data() || {};
      }

      const nowIso = new Date().toISOString();
      const draftCandidate = {
        ...existing,
        title,
        category,
        status,
        recipientType,
        recipientId,
        recipientSchoolId,
        recipientName,
        contentHtml: String(body.contentHtml || body.content || '').trim(),
        effectiveDate: String(body.effectiveDate || '').trim(),
        expiryDate: String(body.expiryDate || '').trim(),
        attachmentUrl: String(body.attachmentUrl || '').trim(),
        versionSummary: String(body.versionSummary || '').trim(),
      };

      const existingVersions = Array.isArray(existing.versions) ? existing.versions : [];
      const shouldSnapshot =
        status !== 'DRAFT' || existingVersions.length === 0 || body.createNewVersion === true;

      const nextVersions = shouldSnapshot
        ? [...existingVersions, createAgreementVersionSnapshot(draftCandidate, actor)]
        : existingVersions;

      const auditEntry = {
        action: body.id ? `UPDATED_${status}` : `CREATED_${status}`,
        actorId: actor.uid,
        actorName: actor.name,
        actorRole: actor.role,
        note: String(body.versionSummary || '').trim(),
        timestamp: nowIso,
      };

      const payload = {
        title,
        category,
        status,
        recipientType,
        recipientId,
        recipientSchoolId,
        recipientName,
        contentHtml: draftCandidate.contentHtml,
        effectiveDate: draftCandidate.effectiveDate,
        expiryDate: draftCandidate.expiryDate,
        attachmentUrl: draftCandidate.attachmentUrl,
        versions: nextVersions,
        currentVersion: nextVersions.length,
        auditLog: [...(Array.isArray(existing.auditLog) ? existing.auditLog : []), auditEntry],
        createdBy: existing.createdBy || actor.uid,
        createdByName: existing.createdByName || actor.name,
        createdAt: existing.createdAt || nowIso,
        updatedBy: actor.uid,
        updatedByName: actor.name,
        updatedAt: nowIso,
      };

      await ref.set(payload, { merge: true });

      if (status !== 'DRAFT' && recipientId) {
        const linkPath =
          recipientType === 'SCHOOL'
            ? '/portal/school/agreements'
            : recipientType === 'PARENT'
            ? '/portal/parent/agreements'
            : '/portal/staff/agreements';

        await adminDb.collection('notifications').add({
          recipientId,
          type: 'agreement_published',
          title: `New ${category.toLowerCase()}: ${title}`,
          message: `An official ${category.toLowerCase()} has been shared with you in the Agreements Centre.`,
          link: linkPath,
          timestamp: FieldValue.serverTimestamp(),
          read: false,
        });
      }

      return json(200, { agreement: { id: ref.id, ...payload } });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e) {
    if (e instanceof Error && e.message === 'AUTH') return json(401, { error: 'Authentication required.' });
    if (e instanceof Error && e.message === 'PROFILE') return json(403, { error: 'Portal profile not found.' });
    if (e instanceof Error && e.message === 'INACTIVE') return json(403, { error: 'Your account is not active.' });
    console.warn('Agreements endpoint fallback notice:', e);
    return json(200, { records: [], fallback: true });
  }
};
