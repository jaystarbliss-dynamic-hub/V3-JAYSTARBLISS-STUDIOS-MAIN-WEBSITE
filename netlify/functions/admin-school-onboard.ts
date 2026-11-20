import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import crypto from 'node:crypto';
import { createPortalNotification } from '../../api/_lib/email';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const token = (event: any) => { const value = event.headers?.authorization || event.headers?.Authorization || ''; return value.startsWith('Bearer ') ? value.slice(7) : ''; };
const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const adminRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'EDUCATION_ADMIN']);
const temporaryPassword = () => `JdH-${crypto.randomBytes(7).toString('base64url')}-2026!`;
const schoolCode = (name: string) => `${name.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase() || 'SCHOOL'}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const raw = token(event); if (!raw) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(raw);
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const admin = adminSnap.data() || {};
    if (!adminRoles.has(String(admin.role || '').toUpperCase())) return json(403, { error: 'Only authorized education administrators can onboard schools.' });

    const body = JSON.parse(event.body || '{}');
    const name = clean(body.name, 160); const contactName = clean(body.contactName, 120); const email = clean(body.email, 160).toLowerCase(); const phone = clean(body.phone, 40); const address = clean(body.address, 300); const state = clean(body.state, 80); const notes = clean(body.notes, 1000); const requestedCode = clean(body.schoolCode, 50).toUpperCase();
    if (!name || !contactName || !email) return json(400, { error: 'School name, administrator name, and administrator email are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid school administrator email.' });
    const existingSchool = await adminDb.collection('schools').where('name', '==', name).limit(1).get();
    if (!existingSchool.empty) return json(409, { error: 'A school with this name is already onboarded.' });

    const password = temporaryPassword(); let authUser;
    try { authUser = await adminAuth.createUser({ email, password, displayName: contactName, emailVerified: false }); }
    catch (error: any) { if (error?.code === 'auth/email-already-exists') return json(409, { error: 'That administrator email already belongs to a Firebase account.' }); throw error; }

    const schoolRef = adminDb.collection('schools').doc(); const code = requestedCode || schoolCode(name); const now = new Date();
    try {
      await adminDb.runTransaction(async transaction => {
        transaction.set(schoolRef, { name, schoolCode: code, contactName, contactEmail: email, phone: phone || null, address: address || null, state: state || null, notes: notes || null, status: 'ACTIVE', onboardingStatus: 'APPROVED', createdBy: decoded.uid, createdAt: now, updatedAt: now });
        transaction.set(adminDb.collection('users').doc(authUser.uid), { uid: authUser.uid, name: contactName, fullName: contactName, email, role: 'SCHOOL', schoolId: schoolRef.id, schoolCode: code, accountStatus: 'ACTIVE', forcePasswordReset: true, onboardingStatus: 'APPROVED', onboardingTourEligible: true, createdBy: decoded.uid, createdAt: now, updatedAt: now });
        transaction.set(adminDb.collection('schoolOnboarding').doc(schoolRef.id), { schoolId: schoolRef.id, schoolName: name, administratorId: authUser.uid, administratorEmail: email, status: 'APPROVED', approvedBy: decoded.uid, createdBy: decoded.uid, createdAt: now, updatedAt: now });
        transaction.set(adminDb.collection('activityLogs').doc(), { type: 'school_onboarded', action: 'SCHOOL_ONBOARDED', message: `School ${name} was onboarded by an administrator.`, actorId: decoded.uid, userId: authUser.uid, userEmail: email, userType: 'SCHOOL', schoolId: schoolRef.id, schoolName: name, timestamp: now, details: { schoolCode: code, contactName, phone, address, state, status: 'ACTIVE' } });
      });
    } catch (error) { await adminAuth.deleteUser(authUser.uid).catch(() => undefined); throw error; }
    await createPortalNotification({
      recipientId: authUser.uid,
      email,
      type: 'SCHOOL_ONBOARDING_APPROVED',
      title: 'Your Jaystarbliss Studios school portal is ready',
      message: `Your school account for ${name} has been created. Sign in at ${process.env.PUBLIC_APP_URL || process.env.URL || 'https://jaystarblissstudios.com'}/portal using your administrator email (${email}) and temporary password: ${password}. Please change your password immediately after signing in. Your school code ${code} is for institutional exam/operations purposes and is not your login password.`,
      data: { schoolId: schoolRef.id, schoolCode: code }
    });
    return json(200, { success: true, school: { id: schoolRef.id, name, schoolCode: code, status: 'ACTIVE' }, administrator: { uid: authUser.uid, name: contactName, email }, temporaryPassword: password });
  } catch (error) { console.error('School onboarding error:', error); return json(500, { error: 'Unable to onboard this school right now.' }); }
};
