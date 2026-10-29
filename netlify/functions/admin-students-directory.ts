import type { Handler } from '@netlify/functions';
import { createHash, randomBytes } from 'node:crypto';
import { adminAuth, adminDb, applyRequestDatabaseHeader } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

const roles = new Set([
  'ADMIN','SUPER_ADMIN','CONTENT_ADMIN','EDUCATION_ADMIN',
  'SERVICES_ADMIN','MARKETING_ADMIN','SUPPORT_ADMIN'
]);

const blocked = (data: any) => ['DISABLED','SUSPENDED','BANNED'].includes(String(data?.accountStatus || data?.status || 'ACTIVE').toUpperCase());
const roleOf = (value: unknown) => String(value || '').trim().toUpperCase();
const nameOf = (data: any) => String(data?.fullName || data?.studentName || data?.name || data?.displayName || data?.username || data?.email || 'Student').trim();

export const handler: Handler = async event => {
  applyRequestDatabaseHeader(event.headers as any);
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const raw = event.headers?.authorization || event.headers?.Authorization || '';
    if (!raw.startsWith('Bearer ')) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(raw.slice(7));
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const admin = adminSnap.data() || {};
    if (!roles.has(roleOf(admin.role)) || blocked(admin)) return json(403, { error: 'Only active administrators can view the complete student directory.' });

    if (event.httpMethod === 'POST') {
      const existingSnap = await adminDb.collection('individualStudents').limit(2000).get();
      const existingUids = new Set<string>();
      const existingUsernames = new Set<string>();
      existingSnap.forEach(d => {
        const data = d.data() || {};
        if (data.firebaseUid) existingUids.add(String(data.firebaseUid));
        if (data.userId) existingUids.add(String(data.userId));
        if (data.username) existingUsernames.add(String(data.username).toLowerCase());
      });

      const listResult = await adminAuth.listUsers(1000);
      let recoveredCount = 0;
      const now = new Date();

      for (const u of listResult.users) {
        const email = String(u.email || '').toLowerCase();
        const isSyntheticStudent =
          email.endsWith('@jbs-portal.local') ||
          email.endsWith('@jdh-portal.local') ||
          email.endsWith('@jdh-student.local');
        if (!isSyntheticStudent || existingUids.has(u.uid)) continue;

        const fullName = String(u.displayName || 'Student').trim();
        let baseUsername = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `student_${u.uid.slice(0, 6).toLowerCase()}`;
        if (email.startsWith('portal-') && email.includes('@')) {
          const fromEmail = email.split('@')[0].replace(/^portal-/, '').replace(/-/g, '_');
          if (fromEmail && fromEmail !== 'record') baseUsername = fromEmail;
        }
        let username = baseUsername;
        let suffix = 1;
        while (existingUsernames.has(username)) {
          suffix++;
          username = `${baseUsername}${suffix}`;
        }
        existingUsernames.add(username);
        existingUids.add(u.uid);

        const accessCode = `JBS-${randomBytes(4).toString('hex').toUpperCase()}`;
        const accessCodeHash = createHash('sha256').update(accessCode).digest('hex');
        const docId = `rec_${u.uid.slice(0, 12)}`;
        const record = {
          fullName,
          studentName: fullName,
          name: fullName,
          username,
          accessCode,
          passcode: accessCode,
          code: accessCode,
          accessCodeHash,
          firebaseUid: u.uid,
          userId: u.uid,
          portalAccessEnabled: true,
          accountStatus: 'ACTIVE',
          status: 'ACTIVE',
          source: 'auth_recovery',
          createdAt: now,
          updatedAt: now
        };
        await adminDb.collection('individualStudents').doc(docId).set(record, { merge: true });
        await adminDb.collection('students').doc(docId).set(record, { merge: true });
        recoveredCount++;
      }

      return json(200, { success: true, recoveredCount });
    }

    const [individualSnap, studentsSnap, usersSnap] = await Promise.all([
      adminDb.collection('individualStudents').limit(5000).get(),
      adminDb.collection('students').limit(5000).get(),
      adminDb.collection('users').limit(5000).get()
    ]);

    const records = new Map<string, any>();
    const aliases = new Map<string, string>();

    const keysFor = (id: string, data: any) => {
      const cleanName = String(data?.fullName || data?.studentName || data?.name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      const cleanSchool = String(data?.schoolId || 'individual').trim().toLowerCase();
      return [
        id,
        data?.firebaseUid ? `uid:${data.firebaseUid}` : '',
        data?.userId ? `uid:${data.userId}` : '',
        data?.studentDocId,
        data?.email ? `email:${String(data.email).toLowerCase()}` : '',
        data?.username ? `uname:${String(data.username).toLowerCase()}` : '',
        cleanName ? `name:${cleanName}|${cleanSchool}` : ''
      ].filter(Boolean).map(String);
    };

    const merge = (id: string, incoming: any, source: string) => {
      if (!incoming || (!incoming.fullName && !incoming.studentName && !incoming.name && !incoming.username)) return;
      const keys = keysFor(id, incoming);
      let existingKey = keys.map(k => aliases.get(k)).find(Boolean) || '';
      if (!existingKey) existingKey = incoming.studentDocId || id;

      const current = records.get(existingKey) || { id: existingKey };
      const merged = { ...current, ...incoming };

      merged.fullName = nameOf(merged);
      merged.email = merged.email || merged.studentEmail || merged.authEmail || '';
      merged.username = merged.username || merged.studentUsername || '';
      merged.firebaseUid = merged.firebaseUid || merged.userId || '';
      merged.schoolId = merged.schoolId || '';
      merged.parentId = merged.parentId || '';
      merged.tutorId = merged.tutorId || merged.staffId || merged.assignedTutorId || merged.assignedStaffId || merged.instructorId || '';
      merged.studentType = merged.schoolId ? 'school' : (merged.parentId || merged.parentEmail || merged.source === 'parent_enrollment' ? 'parent' : 'personal');
      merged.docSource = merged.docSource || source;
      merged.accountStatus = merged.accountStatus || merged.status || 'ACTIVE';
      merged.portalAccessEnabled = merged.portalAccessEnabled !== false;

      records.set(existingKey, merged);
      keys.forEach(k => aliases.set(k, existingKey));
    };

    individualSnap.forEach(d => merge(d.id, d.data(), 'individualStudents'));
    studentsSnap.forEach(d => merge(d.id, d.data(), 'students'));

    usersSnap.forEach(d => {
      const data = d.data();
      const role = roleOf(data.role);
      if (!['STUDENT','SCHOLAR','CADET'].includes(role) && !data.studentDocId) return;
      merge(d.id, { ...data, firebaseUid: d.id }, 'users');
    });

    const schoolIds = [...new Set(Array.from(records.values()).map(s => s.schoolId).filter(Boolean))];
    const parentIds = [...new Set(Array.from(records.values()).map(s => s.parentId).filter(Boolean))];
    const tutorIds = [...new Set(Array.from(records.values()).map(s => s.tutorId).filter(Boolean))];

    const [schoolDocs, parentDocs, tutorDocs] = await Promise.all([
      Promise.all(schoolIds.slice(0, 200).map(id => adminDb.collection('schools').doc(id).get())),
      Promise.all(parentIds.slice(0, 200).map(id => adminDb.collection('users').doc(id).get())),
      Promise.all(tutorIds.slice(0, 200).map(id => adminDb.collection('users').doc(id).get()))
    ]);

    const schools = new Map(schoolDocs.filter(d => d.exists).map(d => [d.id, d.data() || {}]));
    const parents = new Map(parentDocs.filter(d => d.exists).map(d => [d.id, d.data() || {}]));
    const tutors = new Map(tutorDocs.filter(d => d.exists).map(d => [d.id, d.data() || {}]));

    const students = Array.from(records.values()).map(s => {
      const parent = parents.get(s.parentId) || {};
      const tutor = tutors.get(s.tutorId) || {};
      const school = schools.get(s.schoolId) || {};
      return {
        id: s.id,
        docSource: s.docSource,
        fullName: s.fullName,
        username: s.username || '',
        email: s.email || '',
        class: s.class || s.grade || s.className || 'General',
        grade: s.grade || s.class || '',
        track: s.track || s.programName || s.plan || s.program || '',
        subjects: Array.isArray(s.subjects) ? s.subjects.join(', ') : (s.subjects || ''),
        schoolId: s.schoolId || '',
        schoolName: s.schoolName || school.name || school.schoolName || '',
        parentId: s.parentId || '',
        parentName: s.parentName || parent.name || parent.fullName || '',
        parentEmail: s.parentEmail || parent.email || '',
        parentPhone: s.parentPhone || parent.phone || parent.phoneNumber || '',
        tutorId: s.tutorId || '',
        tutorName: s.tutorName || tutor.name || tutor.fullName || '',
        tutorEmail: s.tutorEmail || tutor.email || '',
        accountStatus: s.accountStatus || 'ACTIVE',
        accessCode: s.accessCode || (s.accessCodeHash ? 'Protected Code' : ''),
        accessCodeHash: s.accessCodeHash || '',
        portalAccessEnabled: s.portalAccessEnabled !== false,
        studentType: s.studentType,
        createdAt: s.createdAt || s.timestamp || null,
        firebaseUid: s.firebaseUid || s.userId || ''
      };
    }).sort((a,b) => a.fullName.localeCompare(b.fullName));

    return json(200, { students, count: students.length, counts: {
      all: students.length,
      personal: students.filter(s => s.studentType === 'personal').length,
      parent: students.filter(s => s.studentType === 'parent').length,
      school: students.filter(s => s.studentType === 'school').length
    }});
  } catch (error) {
    console.error('Admin student directory error:', error);
    return json(500, { error: 'Unable to load the complete student directory.' });
  }
};
