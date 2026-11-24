import type { Handler } from '@netlify/functions';
import crypto from 'node:crypto';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { createPortalNotification } from '../../api/_lib/email';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const tokenFromEvent = (event: any) => {
  const value = event.headers?.authorization || event.headers?.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const adminRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'EDUCATION_ADMIN']);
const generateUniqueTemporaryPassword = () =>
  `JdH-${crypto.randomBytes(8).toString('base64url')}-26!`;

/**
 * Securely issues a unique, cryptographically random, single-use temporary password
 * for an individual partner school administrator (72h expiry, forced reset on login).
 * Never reuses a shared password and never stores plaintext passwords in Firestore.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const rawToken = tokenFromEvent(event);
    if (!rawToken) return json(401, { error: 'Authentication required.' });

    const decoded = await adminAuth.verifyIdToken(rawToken);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const caller = callerSnap.data() || {};
    const callerRole = String(caller.role || '').toUpperCase();
    const callerEmail = String(decoded.email || caller.email || '').trim().toLowerCase();
    const superAdminEmails = new Set([
      'johnrufai242@gmail.com',
      'admin@jaystarbliss.com',
      'admin@jaystarbliss-studios.name.ng',
    ]);
    if (!adminRoles.has(callerRole) && !superAdminEmails.has(callerEmail)) {
      return json(403, { error: 'Only authorized administrators can issue school administrator temporary credentials.' });
    }

    const body = JSON.parse(event.body || '{}');
    const schoolId = clean(body.schoolId, 160);
    const requestedEmail = clean(body.adminEmail || body.email, 160).toLowerCase();
    const requestedSchoolName = clean(body.schoolName, 160);
    const requestedContactName = clean(body.contactName, 120);
    const reason = clean(body.reason, 400) || 'Administrator-initiated credential reset';

    if (!schoolId && !requestedEmail) {
      return json(400, { error: 'Provide either a schoolId or school administrator email.' });
    }

    let schoolDoc: { id: string; data: Record<string, any> } | null = null;
    if (schoolId) {
      const sSnap = await adminDb.collection('schools').doc(schoolId).get();
      if (sSnap.exists) {
        schoolDoc = { id: sSnap.id, data: sSnap.data() || {} };
      } else if (requestedEmail) {
        schoolDoc = {
          id: schoolId,
          data: {
            id: schoolId,
            name: requestedSchoolName || 'Partner School',
            contactEmail: requestedEmail,
            contactName: requestedContactName || 'School Administrator',
          },
        };
      }
    } else if (requestedEmail) {
      const sQuery = await adminDb
        .collection('schools')
        .where('contactEmail', '==', requestedEmail)
        .limit(1)
        .get();
      if (!sQuery.empty) {
        schoolDoc = { id: sQuery.docs[0].id, data: sQuery.docs[0].data() || {} };
      }
    }

    if (!schoolDoc) {
      return json(404, { error: 'Partner school record was not found.' });
    }

    const targetEmail = clean(
      requestedEmail || schoolDoc.data.contactEmail || schoolDoc.data.email || '',
      160
    ).toLowerCase();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return json(400, { error: 'School record does not have a valid administrator email address.' });
    }

    const schoolName = clean(requestedSchoolName || schoolDoc.data.name || 'Partner School', 160);
    const contactName = clean(
      requestedContactName || schoolDoc.data.contactName || `${schoolName} Administrator`,
      120
    );
    const tempPassword = generateUniqueTemporaryPassword();
    const tempPasswordHash = crypto.createHash('sha256').update(tempPassword).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    let authUser;
    try {
      authUser = await adminAuth.getUserByEmail(targetEmail);
      await adminAuth.updateUser(authUser.uid, {
        password: tempPassword,
        displayName: authUser.displayName || contactName,
      });
      await adminAuth.revokeRefreshTokens(authUser.uid).catch(() => undefined);
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        authUser = await adminAuth.createUser({
          email: targetEmail,
          password: tempPassword,
          displayName: contactName,
          emailVerified: false,
        });
      } else {
        throw err;
      }
    }

    await adminDb.collection('users').doc(authUser.uid).set(
      {
        uid: authUser.uid,
        name: contactName,
        fullName: contactName,
        email: targetEmail,
        role: 'SCHOOL',
        schoolId: schoolDoc.id,
        schoolName,
        schoolCode: schoolDoc.data.schoolCode || null,
        accountStatus: 'ACTIVE',
        forcePasswordReset: true,
        tempPasswordSingleUse: true,
        tempPasswordHash,
        tempPasswordIssuedAt: now,
        tempPasswordExpiresAt: expiresAt.toISOString(),
        tempPasswordIssuedBy: decoded.uid,
        updatedAt: now,
      },
      { merge: true }
    );

    await adminDb.collection('schools').doc(schoolDoc.id).set(
      {
        adminUid: authUser.uid,
        contactEmail: targetEmail,
        tempPasswordHash,
        forcePasswordReset: true,
        tempPasswordSingleUse: true,
        tempPasswordIssuedAt: now.toISOString(),
        tempPasswordExpiresAt: expiresAt.toISOString(),
        updatedAt: now,
      },
      { merge: true }
    );

    await adminDb.collection('invites').doc(targetEmail).set(
      {
        email: targetEmail,
        name: contactName,
        role: 'SCHOOL',
        schoolId: schoolDoc.id,
        schoolName,
        tempPasswordHash,
        forcePasswordReset: true,
        tempPasswordSingleUse: true,
        tempPasswordIssuedAt: now.toISOString(),
        tempPasswordExpiresAt: expiresAt.toISOString(),
        status: 'ACTIVE',
        updatedAt: now,
      },
      { merge: true }
    );

    await adminDb.collection('adminAuditLogs').add({
      action: 'SCHOOL_ADMIN_TEMP_PASSWORD_ISSUED',
      actorUid: decoded.uid,
      actorEmail: callerEmail,
      actorRole: callerRole || 'SUPER_ADMIN',
      targetUid: authUser.uid,
      targetEmail,
      schoolId: schoolDoc.id,
      schoolName,
      reason,
      expiresAt: expiresAt.toISOString(),
      timestamp: now,
    });

    await createPortalNotification({
      recipientId: authUser.uid,
      email: targetEmail,
      type: 'SCHOOL_TEMP_PASSWORD_ISSUED',
      title: `Temporary Portal Credential Issued — ${schoolName}`,
      message: `A unique one-time temporary password has been issued for your ${schoolName} administrator account (${targetEmail}): ${tempPassword}. Sign in at ${process.env.PUBLIC_APP_URL || process.env.URL || 'https://jaystarblissstudios.com'}/portal within 72 hours and set a new personal password immediately. Your institutional school code is separate and is not your login password.`,
      data: {
        schoolId: schoolDoc.id,
        tempPasswordExpiresAt: expiresAt.toISOString(),
      },
    }).catch(() => undefined);

    return json(200, {
      success: true,
      schoolId: schoolDoc.id,
      schoolName,
      administrator: { uid: authUser.uid, email: targetEmail, name: contactName },
      temporaryPassword: tempPassword,
      expiresAt: expiresAt.toISOString(),
      tempPasswordExpiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('School admin temp password issuance error:', error);
    return json(500, { error: 'Unable to issue a temporary password right now.' });
  }
};
