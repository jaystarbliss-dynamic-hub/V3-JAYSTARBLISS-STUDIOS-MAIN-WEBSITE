import type { Handler } from '@netlify/functions';
import { createHash, randomBytes } from 'node:crypto';
import { adminAuth, adminDb, hasAdminAuth, hasAdminDb } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const bearer = (event: any) => { const value = event.headers?.authorization || event.headers?.Authorization || ''; return value.startsWith('Bearer ') ? value.slice(7) : ''; };
const blocked = (value: unknown) => ['SUSPENDED', 'BANNED', 'DISABLED'].includes(String(value || 'ACTIVE').toUpperCase());
const hashCode = (value: string) => createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
const makeCode = () => `JBS-${randomBytes(5).toString('hex').toUpperCase()}`;
const roleOf = (value: unknown) => String(value || '').trim().toLowerCase();
const isAssigned = (student: any, uid: string) => [student.tutorId, student.staffId, student.assignedTutorId, student.assignedStaffId, student.instructorId].some(value => String(value || '') === uid) || (Array.isArray(student.assignedTutors) && student.assignedTutors.some((t:any)=>String(t?.tutorId||'')===uid||String(t?.staffId||'')===uid));
const hasSchoolAccess = async (uid:string, schoolId:string) => { if(!schoolId) return false; const snap=await adminDb.collection('staffSchoolAccess').doc(uid).get(); if(!snap.exists) return false; const d=snap.data()||{}; const ids=Array.isArray(d.schoolIds)?d.schoolIds.map(String):[]; if(d.schoolId) ids.push(String(d.schoolId)); return ids.includes(String(schoolId)); };

export const handler: Handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    if (!hasAdminAuth() || !hasAdminDb()) {
      return json(200, { fallback: true });
    }
    const token = bearer(event);
    if (!token) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(token);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!callerSnap.exists) return json(403, { error: 'Portal profile not found.' });
    const caller = callerSnap.data() || {};
    const callerRole = roleOf(caller.role);
    if (blocked(caller.accountStatus || caller.status)) return json(403, { error: 'Your account is not active.' });
    const isAdmin = ['admin', 'super_admin', 'content_admin', 'education_admin', 'services_admin', 'marketing_admin', 'support_admin'].includes(callerRole);
    const isTeachingStaff = ['staff', 'tutor', 'instructor'].includes(callerRole);
    const isSchool = ['school', 'school_admin', 'schooladmin', 'partner_school', 'institution'].includes(callerRole);
    if (!isAdmin && !isTeachingStaff && !isSchool) return json(403, { error: 'You are not authorized to issue student credentials.' });

    const body = JSON.parse(event.body || '{}');
    const studentId = String(body.studentId || '').trim();
    if (!studentId) return json(400, { error: 'A student record is required.' });

    let studentRef: any = null;
    let student: any = null;
    for (const collectionName of ['individualStudents', 'students']) {
      const ref = adminDb.collection(collectionName).doc(studentId);
      const snap = await ref.get();
      if (snap.exists) { studentRef = ref; student = snap.data() || {}; break; }
    }
    if (!studentRef || !student) return json(404, { error: 'Student record not found.' });
    if (blocked(student.accountStatus || student.status)) return json(403, { error: 'This student account is not active.' });
    if (isTeachingStaff && !isAssigned(student, decoded.uid) && !(await hasSchoolAccess(decoded.uid, String(student.schoolId || '').trim()))) return json(403, { error: 'You can only issue credentials for students in your assigned school(s) or students assigned to you.' });
    if (isSchool) {
      let schoolId = String(caller.schoolId || '').trim();
      if (!schoolId) {
        const sDoc = await adminDb.collection('schools').doc(decoded.uid).get();
        if (sDoc.exists) {
          schoolId = sDoc.id;
        } else {
          const userEmail = (caller.email || decoded.email || '').toLowerCase();
          if (userEmail) {
            const byEmail = await adminDb.collection('schools').where('contactEmail', '==', userEmail).limit(1).get();
            if (!byEmail.empty) schoolId = byEmail.docs[0].id;
            else {
              const byEmail2 = await adminDb.collection('schools').where('email', '==', userEmail).limit(1).get();
              if (!byEmail2.empty) schoolId = byEmail2.docs[0].id;
              else {
                const byAdminEmail = await adminDb.collection('schools').where('adminEmail', '==', userEmail).limit(1).get();
                if (!byAdminEmail.empty) schoolId = byAdminEmail.docs[0].id;
              }
            }
          }
          if (!schoolId) {
            const byAdminUid = await adminDb.collection('schools').where('adminUid', '==', decoded.uid).limit(1).get();
            if (!byAdminUid.empty) schoolId = byAdminUid.docs[0].id;
          }
        }
      }
      if (!schoolId || (String(student.schoolId || '').trim().toLowerCase() !== schoolId.toLowerCase() && String(student.schoolId || '') !== decoded.uid)) {
        return json(403, { error: 'You can only issue credentials for students in your school.' });
      }
    }

    let username = String(student.username || '').trim().toLowerCase();
    if (!username) {
      const baseName = String(student.fullName || student.studentName || 'student').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'student';
      username = `${baseName}${Math.floor(100 + Math.random() * 900)}`;
      await studentRef.update({ username });
    }
    const accessCode = makeCode();
    const accessCodeHash = hashCode(accessCode);
    const duplicate = await adminDb.collection('individualStudents').where('accessCodeHash', '==', accessCodeHash).limit(1).get();
    if (!duplicate.empty) return json(409, { error: 'A credential collision occurred. Please try again.' });

    const now = new Date();
    const credentialPayload = { 
      username,
      accessCode,
      passcode: accessCode,
      code: accessCode,
      accessCodeHash, 
      portalAccessEnabled: true, 
      accountStatus: 'ACTIVE', 
      status: 'ACTIVE',
      credentialIssuedAt: now, 
      credentialIssuedBy: decoded.uid, 
      updatedAt: now 
    };
    await studentRef.set(credentialPayload, { merge: true });
    for (const mirrorColl of ['individualStudents', 'students']) {
      await adminDb.collection(mirrorColl).doc(studentRef.id).set(credentialPayload, { merge: true }).catch(() => null);
    }
    if (student.firebaseUid || student.userId) {
      const uid = String(student.firebaseUid || student.userId);
      const authUser = await adminAuth.getUser(uid).catch(() => null);
      if (authUser && authUser.disabled) await adminAuth.updateUser(uid, { disabled: false }).catch(() => null);
      await adminDb.collection('users').doc(uid).set({ 
        username,
        accessCode,
        passcode: accessCode,
        code: accessCode,
        accessCodeHash,
        portalAccessEnabled: true, 
        accountStatus: 'ACTIVE', 
        updatedAt: now 
      }, { merge: true }).catch(() => null);
    }
    await adminDb.collection('activityLogs').add({ actorId: decoded.uid, action: 'STUDENT_CREDENTIAL_ISSUED', targetId: studentRef.id, targetType: 'student', schoolId: student.schoolId || null, timestamp: now, metadata: { username, issuedRole: callerRole } }).catch(() => null);
    return json(200, { student: { id: studentRef.id, fullName: student.fullName || student.studentName || 'Student', username, portal: '/portal' }, credentials: { username, accessCode, portal: '/portal' } });
  } catch (error) {
    console.warn('Student credential issuance fallback engaged:', error);
    return json(200, { fallback: true });
  }
};
