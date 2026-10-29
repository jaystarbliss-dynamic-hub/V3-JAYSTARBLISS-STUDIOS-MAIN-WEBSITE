import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb, hasAdminAuth, hasAdminDb, applyRequestDatabaseHeader } from '../../api/_lib/firebase-admin';
import { normalizeClassName } from '../../api/_lib/jdi-assessment.js';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

const bearer = (e: any) => {
  const h = e.headers?.authorization || e.headers?.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

const blocked = (v: unknown) => ['SUSPENDED', 'BANNED', 'DISABLED'].includes(String(v || 'ACTIVE').toUpperCase());
const adminRoles = ['admin', 'super_admin', 'content_admin', 'education_admin', 'services_admin', 'marketing_admin', 'support_admin'];
const staffRoles = ['staff', 'tutor', 'instructor', 'teacher'];

const serialise = (id: string, d: any, source: string) => {
  const rawClass = (d.class || d.grade || d.classLevel || '').trim() || '';
  return {
    id,
    studentId: id,
    collection: source,
    fullName: d.fullName || d.studentName || d.name || 'Student',
    username: d.username || id,
    email: d.email || null,
    class: normalizeClassName(rawClass) || rawClass,
  track: d.track || d.programName || d.plan || '',
  enrolledPrograms: Array.isArray(d.enrolledPrograms) ? d.enrolledPrograms : [],
  subjects: Array.isArray(d.subjects) ? d.subjects : [],
  schoolId: d.schoolId || null,
  schoolName: d.schoolName || d.school || '',
  parentId: d.parentId || null,
    tutorId: d.tutorId || d.assignedTutorId || d.instructorId || null,
    staffId: d.staffId || d.assignedStaffId || null,
    accessCode: d.accessCode || d.passcode || d.code || null,
    portalAccessEnabled: d.portalAccessEnabled !== false,
    accountStatus: d.accountStatus || d.status || 'ACTIVE'
  };
};

export const handler: Handler = async event => {
  applyRequestDatabaseHeader(event.headers as any);
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  try {
    if (!hasAdminAuth() || !hasAdminDb()) {
      return json(200, { schoolIds: [], count: 0, students: [], fallback: true });
    }
    const token = bearer(event);
    if (!token) return json(401, { error: 'Authentication required.' });

    const decoded = await adminAuth.verifyIdToken(token);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!callerSnap.exists) return json(403, { error: 'Portal profile not found.' });

    const caller = callerSnap.data() || {};
    const role = String(caller.role || '').toLowerCase();
    if (blocked(caller.accountStatus || caller.status)) return json(403, { error: 'Your account is not active.' });

    const isAdmin = adminRoles.includes(role);
    const isSchool = ['school', 'school_admin', 'schooladmin', 'partner_school', 'institution'].includes(role);
    const isStaff = staffRoles.includes(role);
    if (!isAdmin && !isSchool && !isStaff) return json(403, { error: 'Not authorised.' });

    const requested = String(event.queryStringParameters?.schoolId || '').trim();
    let schoolIds: string[] = [];

    if (isAdmin) {
      if (requested) {
        schoolIds = [requested];
      } else {
        const schSnap = await adminDb.collection('schools').limit(500).get();
        schoolIds = schSnap.docs.map(d => d.id);
      }
    } else if (isSchool) {
      const validSids = new Set<string>();
      let primarySchoolName = caller.schoolName || '';

      // 1. Direct schoolId on caller
      if (caller.schoolId) validSids.add(String(caller.schoolId).trim());
      if (caller.school_id) validSids.add(String(caller.school_id).trim());
      if (caller.schoolDocId) validSids.add(String(caller.schoolDocId).trim());

      // 2. School doc where id == decoded.uid
      const sd = await adminDb.collection('schools').doc(decoded.uid).get();
      if (sd.exists) {
        validSids.add(sd.id);
        const data = sd.data() || {};
        if (data.name) primarySchoolName = data.name;
        if (data.schoolCode) validSids.add(String(data.schoolCode).trim());
        if (data.schoolId) validSids.add(String(data.schoolId).trim());
      }

      // 3. School doc where contactEmail / email / adminEmail == caller.email or adminUid / userId / firebaseUid == decoded.uid
      const email = String(caller.email || decoded.email || '').toLowerCase();
      const queries = [
        email ? adminDb.collection('schools').where('contactEmail', '==', email).limit(5).get() : Promise.resolve({ docs: [] }),
        email ? adminDb.collection('schools').where('email', '==', email).limit(5).get() : Promise.resolve({ docs: [] }),
        email ? adminDb.collection('schools').where('adminEmail', '==', email).limit(5).get() : Promise.resolve({ docs: [] }),
        adminDb.collection('schools').where('adminUid', '==', decoded.uid).limit(5).get(),
        adminDb.collection('schools').where('userId', '==', decoded.uid).limit(5).get(),
        adminDb.collection('schools').where('firebaseUid', '==', decoded.uid).limit(5).get()
      ];
      const results = await Promise.all(queries.map(q => q.catch(() => ({ docs: [] }))));
      results.forEach((snap: any) => {
        snap.docs.forEach((d: any) => {
          validSids.add(d.id);
          const data = d.data() || {};
          if (data.name && !primarySchoolName) primarySchoolName = data.name;
          if (data.schoolCode) validSids.add(String(data.schoolCode).trim());
          if (data.schoolId) validSids.add(String(data.schoolId).trim());
        });
      });

      // A school account may only request a school already proven to be linked
      // to its authenticated profile. Never trust a client-supplied schoolId.
      schoolIds = Array.from(validSids).filter(Boolean);
      if (requested && !schoolIds.includes(requested)) {
        return json(403, { error: 'You are not authorised to view students for this school.' });
      }
      if (requested) schoolIds = [requested];
      if (schoolIds.length === 0) return json(403, { error: 'School account is not linked to a school.' });
    } else {
      // Staff / Tutor
      const a = await adminDb.collection('staffSchoolAccess').doc(decoded.uid).get();
      const d = a.exists ? a.data() || {} : {};
      schoolIds = [
        ...(Array.isArray(d.schoolIds) ? d.schoolIds.map(String) : []),
        ...(d.schoolId ? [String(d.schoolId)] : []),
        ...(caller.schoolId ? [String(caller.schoolId)] : [])
      ];
      schoolIds = [...new Set(schoolIds.filter(Boolean))];
      if (requested) {
        if (!schoolIds.includes(requested)) return json(403, { error: 'You are not assigned to this school.' });
        schoolIds = [requested];
      }
    }

    const studentsMap = new Map<string, any>();
    const canonicalIdByIdentity = new Map<string, string>();

    const getIdentities = (d: any, id: string): string[] => {
      const uname = String(d.username || '').toLowerCase().trim();
      const email = String(d.email || '').toLowerCase().trim();
      const uid = String(d.firebaseUid || d.userId || '').trim();
      const docId = String(d.studentDocId || id).trim();
      const name = String(d.fullName || d.studentName || d.name || '').toLowerCase().trim();
      const sId = String(d.schoolId || '').trim();

      const keys: string[] = [];
      if (id) keys.push(`id:${id}`);
      if (docId) keys.push(`docId:${docId}`);
      if (uid) keys.push(`uid:${uid}`);
      if (uname) keys.push(`u:${uname}`);
      if (email && !email.endsWith('.local')) keys.push(`e:${email}`);
      if (name && name !== 'student' && sId) keys.push(`name:${sId}:${name}`);
      return keys;
    };

    const mergeSerialised = (existing: any, incoming: any) => ({
      ...incoming,
      ...existing,
      id: existing.id || incoming.id,
      studentId: existing.studentId || incoming.studentId,
      fullName: (existing.fullName && existing.fullName !== 'Student') ? existing.fullName : (incoming.fullName || existing.fullName || 'Student'),
      username: (existing.username && existing.username !== existing.id) ? existing.username : (incoming.username || existing.username),
      email: existing.email || incoming.email || null,
      class: existing.class || incoming.class || '',
      track: existing.track || incoming.track || '',
      enrolledPrograms: existing.enrolledPrograms?.length ? existing.enrolledPrograms : (incoming.enrolledPrograms || []),
      subjects: existing.subjects?.length ? existing.subjects : (incoming.subjects || []),
      schoolId: existing.schoolId || incoming.schoolId || null,
      schoolName: existing.schoolName || incoming.schoolName || '',
      parentId: existing.parentId || incoming.parentId || null,
      tutorId: existing.tutorId || incoming.tutorId || null,
      staffId: existing.staffId || incoming.staffId || null,
    });

    const addStudent = (id: string, d: any, source: string) => {
      const keys = getIdentities(d, id);
      let existingCanonicalId: string | undefined;
      for (const k of keys) {
        const found = canonicalIdByIdentity.get(k);
        if (found && studentsMap.has(found)) {
          existingCanonicalId = found;
          break;
        }
      }
      const serialised = serialise(existingCanonicalId || id, d, source);
      const targetId = existingCanonicalId || id;
      if (existingCanonicalId && studentsMap.has(existingCanonicalId)) {
        studentsMap.set(existingCanonicalId, mergeSerialised(studentsMap.get(existingCanonicalId), serialised));
      } else {
        studentsMap.set(targetId, serialised);
      }
      for (const k of keys) {
        if (!canonicalIdByIdentity.has(k)) canonicalIdByIdentity.set(k, targetId);
      }
    };

    for (const sid of schoolIds) {
      // 1. Primary school student tables (prioritise individualStudents where full onboarding data lives)
      for (const coll of ['individualStudents', 'students']) {
        for (const field of ['schoolId', 'school_id', 'schoolDocId']) {
          const snap = await adminDb.collection(coll).where(field, '==', sid).limit(500).get().catch(() => ({ docs: [] as any[] }));
          snap.docs.forEach(x => addStudent(x.id, x.data(), coll));
        }
      }

      // 2. User accounts table (merge or add if student profile only exists in users)
      for (const field of ['schoolId', 'school_id', 'schoolDocId']) {
        const uSnap = await adminDb.collection('users').where(field, '==', sid).limit(500).get().catch(() => ({ docs: [] as any[] }));
        uSnap.docs.forEach(x => {
          const d = x.data() || {};
          const r = String(d.role || '').toUpperCase().trim();
          const isExplicitStudent = ['STUDENT', 'SCHOLAR', 'CADET', 'INDIVIDUAL_STUDENT'].includes(r);
          const isOtherRole = ['SCHOOL', 'SCHOOL_ADMIN', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'TUTOR', 'INSTRUCTOR', 'TEACHER', 'PARENT'].includes(r);
          if (isExplicitStudent || (!isOtherRole && (d.studentDocId || d.isStudent))) {
            const primaryId = String(d.studentDocId || x.id);
            addStudent(primaryId, { ...d, firebaseUid: x.id }, 'users');
          }
        });
      }
    }

    if (isStaff) {
      // Resolve linked tutor/staff profile IDs as older student records may not store the Firebase UID.
      const staffIds = Array.from(new Set([decoded.uid, caller.uid, caller.userId, caller.staffId, caller.tutorId, caller.profileId, caller.staffProfileId, caller.tutorProfileId].filter((value: any) => typeof value === 'string' && value.trim()).map((value: string) => value.trim())));
      for (const coll of ['individualStudents', 'students']) {
        for (const field of ['tutorId', 'staffId', 'assignedTutorId', 'assignedStaffId', 'instructorId']) {
          for (const staffId of staffIds) {
            const snap = await adminDb.collection(coll).where(field, '==', staffId).limit(500).get().catch(() => ({ docs: [] as any[] }));
            snap.docs.forEach(x => addStudent(x.id, x.data(), coll));
          }
        }
      }
    }

    const studentList = [...studentsMap.values()]
      .filter(x => !blocked(x.accountStatus))
      .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));

    return json(200, {
      schoolIds,
      count: studentList.length,
      students: studentList
    });
  } catch (e) {
    console.warn('school-students fallback engaged:', e);
    return json(200, { schoolIds: [], count: 0, students: [], fallback: true });
  }
};
