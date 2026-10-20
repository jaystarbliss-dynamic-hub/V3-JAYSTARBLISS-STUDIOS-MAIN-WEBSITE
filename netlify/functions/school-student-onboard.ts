import type { Handler } from '@netlify/functions';
import { createHash, randomBytes } from 'node:crypto';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const bearer = (event: any) => { const value = event.headers?.authorization || event.headers?.Authorization || ''; return value.startsWith('Bearer ') ? value.slice(7) : ''; };
const clean = (value: unknown, max = 160) => String(value ?? '').trim().slice(0, max);
const normalizeCode = (value: string) => value.trim().toUpperCase();
const hashAccessCode = (value: string) => createHash('sha256').update(normalizeCode(value)).digest('hex');
const makeCode = () => `JBS-${randomBytes(5).toString('hex').toUpperCase()}`;
const makePassword = () => randomBytes(12).toString('base64url');
const blocked = (value: unknown) => ['SUSPENDED', 'BANNED', 'DISABLED'].includes(String(value || 'ACTIVE').toUpperCase());

export const handler: Handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  let createdUid = '';
  try {
    const rawToken = bearer(event); if (!rawToken) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(rawToken);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get(); if (!callerSnap.exists) return json(403, { error: 'Portal profile not found.' });
    const caller = callerSnap.data() || {}; const role = String(caller.role || '').trim().toUpperCase();
    const adminRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'EDUCATION_ADMIN']);
    const schoolRoles = new Set(['SCHOOL', 'SCHOOL_ADMIN']);
    if ((!adminRoles.has(role) && !schoolRoles.has(role)) || blocked(caller.accountStatus || caller.status)) return json(403, { error: 'An active school administrator or authorised platform administrator is required.' });

    const body = JSON.parse(event.body || '{}');
    const requestedSchoolId = clean(body.schoolId || '');
    const callerSchoolId = clean(caller.schoolId || caller.school_id || '');
    if (schoolRoles.has(role) && requestedSchoolId && requestedSchoolId !== callerSchoolId) return json(403, { error: 'You can only onboard students into your own school.' });
    const schoolId = schoolRoles.has(role) ? callerSchoolId : (requestedSchoolId || callerSchoolId);
    if (!schoolId) return json(400, { error: 'Select the school before onboarding a student.' });
    const schoolSnap = await adminDb.collection('schools').doc(schoolId).get(); if (!schoolSnap.exists) return json(404, { error: 'School record not found.' });
    const school = schoolSnap.data() || {}; if (blocked(school.accountStatus || school.status)) return json(403, { error: 'This school account is currently disabled.' });

    const requestedProgramIds = Array.from(new Set((Array.isArray(body.programIds) ? body.programIds : [body.programId]).map((value: unknown) => clean(value, 160)).filter(Boolean))); const fullName = clean(body.fullName); const username = clean(body.username, 80).toLowerCase().replace(/\s+/g, ''); const email = clean(body.email, 160).toLowerCase(); const className = clean(body.class || body.grade || '', 80); const track = clean(body.track || '', 120); const parentId = clean(body.parentId || '', 160); const requestedCode = clean(body.accessCode || body.passcode || '', 40); const programId = requestedProgramIds[0] || ''; const programName = clean(body.programName || '', 500);
    if (!fullName || !username || !className) return json(400, { error: 'Student name, username and class are required.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid student email or leave it blank.' });
    if (parentId) { const parentSnap = await adminDb.collection('users').doc(parentId).get(); if (!parentSnap.exists || String(parentSnap.data()?.role || '').toLowerCase() !== 'parent' || blocked(parentSnap.data()?.accountStatus || parentSnap.data()?.status)) return json(400, { error: 'The supplied parent account is not a valid active parent profile.' }); }

    let resolvedProgram: any = null;
    let finalProgramId = programId;
    if (finalProgramId) {
      const programSnap = await adminDb.collection('programs').doc(finalProgramId).get();
      if (programSnap.exists) {
        resolvedProgram = { id: programSnap.id, ...programSnap.data() };
      }
    } else {
      // If not specified, look up school's configured programs and assign the general program
      const schPrograms: any[] = Array.isArray(school.programs) ? school.programs : [];
      if (schPrograms.length > 0) {
        const general = schPrograms.find(p => p.isGeneralProgram) || schPrograms[0];
        if (general) {
          resolvedProgram = general;
          finalProgramId = general.id || general.programId || '';
        }
      } else if (school.programId || school.defaultProgramId) {
        finalProgramId = school.programId || school.defaultProgramId;
        const programSnap = await adminDb.collection('programs').doc(finalProgramId).get();
        if (programSnap.exists) {
          resolvedProgram = { id: programSnap.id, ...programSnap.data() };
        }
      }
    }
    const configuredPrograms: any[] = Array.isArray(school.programs) ? school.programs : [];
    const configuredIds = new Set(configuredPrograms.flatMap((p: any) => [p?.id, p?.programId, p?.name, p?.title].filter(Boolean).map(String)));
    if (requestedProgramIds.length && configuredPrograms.length && requestedProgramIds.some((id: string) => !configuredIds.has(id))) {
      return json(403, { error: 'One or more selected programmes are not assigned to this school.' });
    }
    const selectedPrograms: any[] = [];
    if (requestedProgramIds.length) {
      for (const requestedId of requestedProgramIds) {
        const configured = configuredPrograms.find((p: any) => [p?.id, p?.programId, p?.name, p?.title].filter(Boolean).map(String).includes(requestedId));
        const programSnap = await adminDb.collection('programs').doc(requestedId).get();
        const resolved = programSnap.exists ? { id: programSnap.id, ...programSnap.data() } : configured ? { ...configured, id: configured.id || configured.programId || requestedId } : null;
        if (!resolved) return json(400, { error: 'A selected programme could not be found. Refresh the list and try again.' });
        selectedPrograms.push(resolved);
      }
    } else if (resolvedProgram) {
      selectedPrograms.push(resolvedProgram);
    }
    const finalProgramIds = selectedPrograms.map((p: any) => String(p.id || p.programId || '')).filter(Boolean);
    const finalProgramNames = selectedPrograms.map((p: any) => String(p.name || p.title || p.programName || p.id || 'Programme')).filter(Boolean);
    const finalProgramId = finalProgramIds[0] || '';
    const finalProgramName = finalProgramNames.join(', ') || programName || track || 'General School Programme';
    const duplicate = await adminDb.collection('individualStudents').where('username', '==', username).limit(1).get(); if (!duplicate.empty) return json(409, { error: 'That student username is already in use.' });
    const accessCode = normalizeCode(requestedCode || makeCode()); if (accessCode.length < 8 || accessCode.length > 40) return json(400, { error: 'Student access code must be between 8 and 40 characters.' });
    const accessCodeHash = hashAccessCode(accessCode); const codeDuplicate = await adminDb.collection('individualStudents').where('accessCodeHash', '==', accessCodeHash).limit(1).get(); if (!codeDuplicate.empty) return json(409, { error: 'That student access code is already in use.' });
    const legacyCodeDuplicate = await adminDb.collection('individualStudents').where('accessCode', '==', accessCode).limit(1).get(); if (!legacyCodeDuplicate.empty) return json(409, { error: 'That student access code is already in use.' });

    const syntheticEmail = `student-${randomBytes(10).toString('hex')}@jbs-portal.local`; const authUser = await adminAuth.createUser({ email: email || syntheticEmail, password: makePassword(), displayName: fullName, disabled: false }); createdUid = authUser.uid;
    const studentRef = adminDb.collection('individualStudents').doc(); const now = new Date();
    await studentRef.set({ fullName, studentName: fullName, username, accessCodeHash, schoolId, schoolName: school.name || school.schoolName || '', class: className, grade: className, track: finalProgramName, programId: finalProgramId || null, programIds: finalProgramIds, programName: finalProgramName || null, programNames: finalProgramNames, email: email || null, parentId: parentId || null, firebaseUid: authUser.uid, userId: authUser.uid, portalAccessEnabled: true, accountStatus: 'ACTIVE', source: 'school_onboarding', createdAt: now, updatedAt: now });
    await adminDb.collection('users').doc(authUser.uid).set({ email: authUser.email || null, name: fullName, role: 'student', studentDocId: studentRef.id, schoolId, schoolName: school.name || school.schoolName || '', parentId: parentId || null, portalAccessEnabled: true, accountStatus: 'ACTIVE', createdAt: now, updatedAt: now }, { merge: true });
    for (const [index, selectedProgram] of selectedPrograms.entries()) { const selectedProgramId = String(selectedProgram.id || selectedProgram.programId || '') || null; const selectedProgramName = String(selectedProgram.name || selectedProgram.title || selectedProgram.programName || selectedProgramId || 'Programme'); await adminDb.collection('enrollments').add({ studentId: studentRef.id, studentUid: authUser.uid, studentName: fullName, schoolId, programId: selectedProgramId, programName: selectedProgramName, learningTrackId: selectedProgram.learningTrackId || selectedProgram.learningTrack || selectedProgram.trackId || null, status: 'ACTIVE', source: 'school_onboarding', enrolledBy: decoded.uid, enrollmentOrder: index, enrolledAt: now, createdAt: now, updatedAt: now }); }
    await adminDb.collection('activityLogs').add({ actorId: decoded.uid, action: 'SCHOOL_STUDENT_ONBOARDED', targetId: studentRef.id, targetType: 'student', schoolId, timestamp: now, metadata: { username, class: className, parentId: parentId || null, programId: finalProgramId || null, programName: finalProgramName || null } });
    try {
      const adminUsers = await adminDb.collection('users').limit(1000).get();
      const globalAdminRoles = new Set(['admin', 'super_admin', 'superadmin']);
      const recipients = adminUsers.docs.filter(d => globalAdminRoles.has(String(d.data().role || '').trim().toLowerCase()));
      const batch = adminDb.batch();
      for (const admin of recipients) {
        const notification = adminDb.collection('notifications').doc('school-student-' + studentRef.id + '-' + admin.id);
        batch.set(notification, {
          recipientId: admin.id,
          recipientType: 'specific_user',
          type: 'registration',
          priority: 'normal',
          title: 'New school student enrolled',
          message: fullName + ' was enrolled by ' + String(school.name || school.schoolName || 'a partner school') + '.',
          registeredStudentId: studentRef.id,
          registeredStudentName: fullName,
          registeredSchoolName: String(school.name || school.schoolName || ''),
          registeredEmail: email || null,
          registeredBy: decoded.uid,
          readBy: [],
          read: false,
          timestamp: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          senderName: 'Jaystarbliss Central',
          senderRole: 'System'
        });
      }
      if (recipients.length) await batch.commit();
    } catch (notificationError) {
      console.warn('School student admin notification failed:', notificationError);
    }
    return json(201, { student: { id: studentRef.id, fullName, username, class: className, schoolId, programId: finalProgramId || null, programIds: finalProgramIds, programName: finalProgramName || null, programNames: finalProgramNames, portal: '/portal/student' }, credentials: { username, accessCode, portal: '/portal/student' } });
  } catch (error) { if (createdUid) await adminAuth.deleteUser(createdUid).catch(() => undefined); console.error('School student onboarding error:', error); return json(500, { error: 'Unable to onboard the student. No partial account should remain.' }); }
};
