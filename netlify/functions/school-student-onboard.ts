import type { Handler } from '@netlify/functions';
import { createHash, randomBytes } from 'node:crypto';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  normalizeClassName,
  validateBulkStudentRows,
} from '../../api/_lib/jdi-assessment.js';

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
const normalizeCode = (value: string) => value.trim().toUpperCase();
const hashAccessCode = (value: string) =>
  createHash('sha256').update(normalizeCode(value)).digest('hex');
const makeCode = () => `JBS-${randomBytes(5).toString('hex').toUpperCase()}`;
const makePassword = () => randomBytes(12).toString('base64url');
const blocked = (value: unknown) =>
  ['SUSPENDED', 'BANNED', 'DISABLED'].includes(String(value || 'ACTIVE').toUpperCase());

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  let createdUid = '';
  try {
    const rawToken = bearer(event);
    if (!rawToken) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(rawToken);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!callerSnap.exists) return json(403, { error: 'Portal profile not found.' });
    const caller = callerSnap.data() || {};
    const role = String(caller.role || '').trim().toUpperCase();
    const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN'].includes(role);
    if ((role !== 'SCHOOL' && !isAdmin) || blocked(caller.accountStatus || caller.status)) {
      return json(403, { error: 'Only an active school or admin account can onboard students.' });
    }

    const body = JSON.parse(event.body || '{}');
    const schoolId = clean(isAdmin && body.schoolId ? body.schoolId : caller.schoolId || '');
    if (!schoolId) return json(403, { error: 'This account is not linked to a target school.' });
    const schoolSnap = await adminDb.collection('schools').doc(schoolId).get();
    if (!schoolSnap.exists) return json(404, { error: 'School record not found.' });
    const school = schoolSnap.data() || {};
    if (blocked(school.accountStatus || school.status)) {
      return json(403, { error: 'This school account is currently disabled.' });
    }

    // BULK STUDENT ONBOARDING MODE
    if (body.action === 'bulk' && Array.isArray(body.rows)) {
      const existingSnap = await adminDb
        .collection('individualStudents')
        .where('schoolId', '==', schoolId)
        .limit(500)
        .get();
      const existingUsernames = new Set<string>();
      existingSnap.docs.forEach((d) => {
        const u = String(d.data()?.username || '').trim().toLowerCase();
        if (u) existingUsernames.add(u);
      });

      const validation = validateBulkStudentRows(body.rows.slice(0, 100), {
        existingUsernames: Array.from(existingUsernames),
      });

      const results: Record<string, any>[] = [];
      const now = new Date();

      for (const row of validation.rows) {
        if (!row.valid) {
          results.push({
            rowNumber: row.rowNumber,
            fullName: row.fullName,
            username: row.username,
            className: row.className,
            programName: row.programName,
            status: existingUsernames.has(row.username) ? 'SKIPPED_DUPLICATE' : 'INVALID',
            errors: row.errors,
          });
          continue;
        }

        // Check global username uniqueness
        const dupGlobal = await adminDb
          .collection('individualStudents')
          .where('username', '==', row.username)
          .limit(1)
          .get();
        if (!dupGlobal.empty) {
          results.push({
            rowNumber: row.rowNumber,
            fullName: row.fullName,
            username: row.username,
            className: row.className,
            programName: row.programName,
            status: 'SKIPPED_DUPLICATE',
            errors: [`Username "${row.username}" already exists.`],
          });
          continue;
        }

        let rowUid = '';
        try {
          const suppliedCode = String((row as any).accessCode || '').trim().toUpperCase();
          const accessCode = suppliedCode || makeCode();
          const accessCodeHash = hashAccessCode(accessCode);
          const syntheticEmail = `student-${randomBytes(10).toString('hex')}@jbs-portal.local`;
          const authUser = await adminAuth.createUser({
            email: row.email || syntheticEmail,
            password: makePassword(),
            displayName: row.fullName,
            disabled: false,
          });
          rowUid = authUser.uid;
          const studentRef = adminDb.collection('individualStudents').doc();

          const studentRecord = {
            fullName: row.fullName,
            studentName: row.fullName,
            name: row.fullName,
            username: row.username,
            accessCode,
            passcode: accessCode,
            code: accessCode,
            accessCodeHash,
            schoolId,
            schoolName: school.name || school.schoolName || '',
            class: row.className,
            grade: row.className,
            track: row.programName,
            programName: row.programName,
            email: row.email || null,
            firebaseUid: authUser.uid,
            userId: authUser.uid,
            portalAccessEnabled: true,
            accountStatus: 'ACTIVE',
            status: 'ACTIVE',
            source: 'school_bulk_onboarding',
            createdAt: now,
            updatedAt: now,
          };

          await studentRef.set(studentRecord);
          await adminDb.collection('students').doc(studentRef.id).set(studentRecord, { merge: true });
          await adminDb
            .collection('users')
            .doc(authUser.uid)
            .set(
              {
                email: authUser.email || null,
                name: row.fullName,
                role: 'student',
                studentDocId: studentRef.id,
                schoolId,
                schoolName: school.name || school.schoolName || '',
                portalAccessEnabled: true,
                accountStatus: 'ACTIVE',
                createdAt: now,
                updatedAt: now,
              },
              { merge: true }
            );

          existingUsernames.add(row.username);
          results.push({
            rowNumber: row.rowNumber,
            studentId: studentRef.id,
            fullName: row.fullName,
            username: row.username,
            className: row.className,
            programName: row.programName,
            accessCode,
            portal: '/portal/student',
            status: 'CREATED',
            errors: [],
          });
        } catch (rowErr: any) {
          if (rowUid) await adminAuth.deleteUser(rowUid).catch(() => undefined);
          results.push({
            rowNumber: row.rowNumber,
            fullName: row.fullName,
            username: row.username,
            className: row.className,
            programName: row.programName,
            status: 'FAILED',
            errors: [rowErr?.message || 'Provisioning failed'],
          });
        }
      }

      await adminDb.collection('activityLogs').add({
        actorId: decoded.uid,
        action: 'SCHOOL_BULK_STUDENT_ONBOARDED',
        targetId: schoolId,
        targetType: 'school',
        schoolId,
        timestamp: now,
        metadata: {
          totalRows: results.length,
          createdCount: results.filter((r) => r.status === 'CREATED').length,
          skippedCount: results.filter((r) => r.status === 'SKIPPED_DUPLICATE').length,
        },
      });

      return json(200, {
        results,
        summary: {
          total: results.length,
          created: results.filter((r) => r.status === 'CREATED').length,
          skipped: results.filter((r) => r.status === 'SKIPPED_DUPLICATE').length,
          failed: results.filter((r) => ['FAILED', 'INVALID'].includes(r.status)).length,
        },
      });
    }

    // SINGLE STUDENT ONBOARDING MODE
    const fullName = clean(body.fullName);
    const username = clean(body.username, 80).toLowerCase().replace(/\s+/g, '');
    const email = clean(body.email, 160).toLowerCase();
    const rawClassName = clean(body.class || body.grade || '', 80);
    const className = normalizeClassName(rawClassName) || rawClassName;
    const track = clean(body.track || '', 120);
    const parentId = clean(body.parentId || '', 160);
    const requestedCode = clean(body.accessCode || body.passcode || '', 40);
    const programId = clean(body.programId || '', 160);
    const programName = clean(body.programName || '', 180);
    if (!fullName || !username || !className) {
      return json(400, { error: 'Student name, username and class are required.' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'Enter a valid student email or leave it blank.' });
    }
    if (parentId) {
      const parentSnap = await adminDb.collection('users').doc(parentId).get();
      if (
        !parentSnap.exists ||
        String(parentSnap.data()?.role || '').toLowerCase() !== 'parent' ||
        blocked(parentSnap.data()?.accountStatus || parentSnap.data()?.status)
      ) {
        return json(400, {
          error: 'The supplied parent account is not a valid active parent profile.',
        });
      }
    }

    let resolvedProgram: any = null;
    let finalProgramId = programId;
    if (finalProgramId) {
      const programSnap = await adminDb.collection('programs').doc(finalProgramId).get();
      if (programSnap.exists) {
        resolvedProgram = { id: programSnap.id, ...programSnap.data() };
      }
    } else {
      const schPrograms: any[] = Array.isArray(school.programs) ? school.programs : [];
      if (schPrograms.length > 0) {
        const general = schPrograms.find((p) => p.isGeneralProgram) || schPrograms[0];
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
    const finalProgramName =
      programName ||
      resolvedProgram?.name ||
      resolvedProgram?.title ||
      track ||
      'General School Programme';
    const duplicate = await adminDb
      .collection('individualStudents')
      .where('username', '==', username)
      .limit(1)
      .get();
    if (!duplicate.empty) return json(409, { error: 'That student username is already in use.' });
    const accessCode = normalizeCode(requestedCode || makeCode());
    if (accessCode.length < 8 || accessCode.length > 40) {
      return json(400, { error: 'Student access code must be between 8 and 40 characters.' });
    }
    const accessCodeHash = hashAccessCode(accessCode);
    const codeDuplicate = await adminDb
      .collection('individualStudents')
      .where('accessCodeHash', '==', accessCodeHash)
      .limit(1)
      .get();
    if (!codeDuplicate.empty) {
      return json(409, { error: 'That student access code is already in use.' });
    }
    const legacyCodeDuplicate = await adminDb
      .collection('individualStudents')
      .where('accessCode', '==', accessCode)
      .limit(1)
      .get();
    if (!legacyCodeDuplicate.empty) {
      return json(409, { error: 'That student access code is already in use.' });
    }

    const syntheticEmail = `student-${randomBytes(10).toString('hex')}@jbs-portal.local`;
    const authUser = await adminAuth.createUser({
      email: email || syntheticEmail,
      password: makePassword(),
      displayName: fullName,
      disabled: false,
    });
    createdUid = authUser.uid;
    const studentRef = adminDb.collection('individualStudents').doc();
    const now = new Date();
    await studentRef.set({
      fullName,
      studentName: fullName,
      username,
      accessCodeHash,
      schoolId,
      schoolName: school.name || school.schoolName || '',
      class: className,
      grade: className,
      track: finalProgramName,
      programId: finalProgramId || null,
      programName: finalProgramName || null,
      email: email || null,
      parentId: parentId || null,
      firebaseUid: authUser.uid,
      userId: authUser.uid,
      portalAccessEnabled: true,
      accountStatus: 'ACTIVE',
      source: 'school_onboarding',
      createdAt: now,
      updatedAt: now,
    });
    await adminDb
      .collection('users')
      .doc(authUser.uid)
      .set(
        {
          email: authUser.email || null,
          name: fullName,
          role: 'student',
          studentDocId: studentRef.id,
          schoolId,
          schoolName: school.name || school.schoolName || '',
          parentId: parentId || null,
          portalAccessEnabled: true,
          accountStatus: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    if (finalProgramId || finalProgramName) {
      await adminDb.collection('enrollments').add({
        studentId: studentRef.id,
        studentUid: authUser.uid,
        studentName: fullName,
        schoolId,
        programId: finalProgramId || null,
        programName: finalProgramName || null,
        status: 'ACTIVE',
        source: 'school_onboarding',
        enrolledBy: decoded.uid,
        enrolledAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    await adminDb.collection('activityLogs').add({
      actorId: decoded.uid,
      action: 'SCHOOL_STUDENT_ONBOARDED',
      targetId: studentRef.id,
      targetType: 'student',
      schoolId,
      timestamp: now,
      metadata: {
        username,
        class: className,
        parentId: parentId || null,
        programId: finalProgramId || null,
        programName: finalProgramName || null,
      },
    });
    try {
      const adminUsers = await adminDb.collection('users').limit(1000).get();
      const globalAdminRoles = new Set(['admin', 'super_admin', 'superadmin']);
      const recipients = adminUsers.docs.filter((d) =>
        globalAdminRoles.has(String(d.data().role || '').trim().toLowerCase())
      );
      const batch = adminDb.batch();
      for (const admin of recipients) {
        const notification = adminDb
          .collection('notifications')
          .doc('school-student-' + studentRef.id + '-' + admin.id);
        batch.set(notification, {
          recipientId: admin.id,
          recipientType: 'specific_user',
          type: 'registration',
          priority: 'normal',
          title: 'New school student enrolled',
          message:
            fullName +
            ' was enrolled by ' +
            String(school.name || school.schoolName || 'a partner school') +
            '.',
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
          senderRole: 'System',
        });
      }
      if (recipients.length) await batch.commit();
    } catch (notificationError) {
      console.warn('School student admin notification failed:', notificationError);
    }
    return json(201, {
      student: {
        id: studentRef.id,
        fullName,
        username,
        class: className,
        schoolId,
        programId: finalProgramId || null,
        programName: finalProgramName || null,
        portal: '/portal/student',
      },
      credentials: { username, accessCode, portal: '/portal/student' },
    });
  } catch (error) {
    if (createdUid) await adminAuth.deleteUser(createdUid).catch(() => undefined);
    console.error('School student onboarding error:', error);
    return json(500, {
      error: 'Unable to onboard the student. No partial account should remain.',
    });
  }
};
