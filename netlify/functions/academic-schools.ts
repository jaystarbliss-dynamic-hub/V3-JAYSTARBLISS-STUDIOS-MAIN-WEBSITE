import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const token = (event: any) => { const h = event.headers?.authorization || event.headers?.Authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
const roleOf = (v: unknown) => String(v || '').trim().toUpperCase();
const blocked = (v: unknown) => ['DISABLED', 'SUSPENDED', 'BANNED'].includes(String(v || 'ACTIVE').toUpperCase());

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
    const raw = token(event); if (!raw) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(raw);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) return json(403, { error: 'Portal profile not found.' });
    const user = userSnap.data() || {}; if (blocked(user.accountStatus || user.status)) return json(403, { error: 'Your account is not active.' });
    const role = roleOf(user.role);
    const schools = new Map<string, any>();
    if (['ADMIN', 'SUPER_ADMIN', 'CONTENT_ADMIN', 'EDUCATION_ADMIN', 'SERVICES_ADMIN', 'MARKETING_ADMIN', 'SUPPORT_ADMIN'].includes(role)) {
      (await adminDb.collection('schools').limit(300).get()).forEach(d => schools.set(d.id, { id: d.id, ...d.data() }));
    } else if (['TUTOR', 'STAFF', 'INSTRUCTOR'].includes(role)) {
      const access = await adminDb.collection('staffSchoolAccess').doc(decoded.uid).get();
      if (access.exists) {
        const data = access.data() || {}; const ids = Array.from(new Set([data.schoolId, ...(Array.isArray(data.schoolIds) ? data.schoolIds : [])].filter(Boolean).map(String)));
        for (const id of ids) { const snap = await adminDb.collection('schools').doc(id).get(); if (snap.exists) schools.set(id, { id, ...snap.data() }); }
      }
    } else if (role === 'SCHOOL') {
      const id = String(user.schoolId || decoded.uid); const snap = await adminDb.collection('schools').doc(id).get(); if (snap.exists) schools.set(id, { id, ...snap.data() });
    }
    const result = Array.from(schools.values()).map(s => ({ id: s.id, name: s.name || s.schoolName || s.institutionName || 'School', code: s.code || s.schoolCode || '' })).sort((a, b) => a.name.localeCompare(b.name));
    return json(200, { schools: result });
  } catch (error) { console.warn('Academic schools fallback notice:', error); return json(200, { schools: [], fallback: true }); }
};
