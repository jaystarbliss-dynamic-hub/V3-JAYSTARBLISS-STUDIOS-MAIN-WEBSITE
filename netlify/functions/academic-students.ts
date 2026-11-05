import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import type { QuerySnapshot } from 'firebase-admin/firestore';

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const token = (event: any) => { const h = event.headers?.authorization || event.headers?.Authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
const roleOf = (v: unknown) => String(v || '').trim().toUpperCase();
const assignmentFields = ['tutorId', 'staffId', 'assignedTutorId', 'assignedStaffId', 'instructorId', 'assignedTo', 'assignedUserId'];
const assignmentCollections = ['tutorAssignments', 'staffAssignments', 'studentAssignments', 'learnerAssignments'];

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }
    const raw = token(event);
    if (!raw) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(raw);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) return json(403, { error: 'Portal profile not found.' });
    const user = userSnap.data() || {};
    const role = roleOf(user.role);

    if (event.httpMethod === 'POST') {
      const allowedWriter = [
        'ADMIN',
        'SUPER_ADMIN',
        'CONTENT_ADMIN',
        'EDUCATION_ADMIN',
        'SERVICES_ADMIN',
        'TUTOR',
        'STAFF',
        'INSTRUCTOR',
        'TEACHER',
      ].includes(role);
      if (!allowedWriter) {
        return json(403, { error: 'Only authorised tutors or administrators can update learning pathways.' });
      }
      const body = JSON.parse(event.body || '{}');
      const studentId = String(body.studentId || '').trim();
      if (!studentId) return json(400, { error: 'studentId is required.' });

      const now = new Date();
      if (body.action === 'update_student_tracks' || body.action === 'update_student_pathway') {
        const selectedProgramIds = Array.isArray(body.selectedProgramIds)
          ? body.selectedProgramIds
          : Array.isArray(body.assignedTrackIds)
          ? body.assignedTrackIds
          : [];
        const assignedProgramIds = Array.isArray(body.assignedProgramIds)
          ? body.assignedProgramIds
          : selectedProgramIds;
        const optionalProgramIds = Array.isArray(body.optionalProgramIds)
          ? body.optionalProgramIds
          : [];
        const currentFocusProgramIds = Array.isArray(body.currentFocusProgramIds)
          ? body.currentFocusProgramIds
          : [];
        const enrolledPrograms = Array.isArray(body.enrolledPrograms)
          ? body.enrolledPrograms
          : [];
        const pathwayStatus =
          selectedProgramIds.length > 0 ? 'CONFIGURED' : 'PENDING_PROGRAMME_CONFIRMATION';

        const updateData: Record<string, any> = {
          selectedProgramIds,
          assignedProgramIds,
          assignedTrackIds: selectedProgramIds,
          optionalProgramIds,
          currentFocusProgramIds,
          enrolledPrograms,
          pathwayStatus,
          updatedAt: now,
        };
        if (enrolledPrograms.length > 0) {
          updateData.track = enrolledPrograms.join(', ');
          updateData.programName = enrolledPrograms[0];
        }
        await Promise.all([
          adminDb.collection('individualStudents').doc(studentId).set(updateData, { merge: true }).catch(() => null),
          adminDb.collection('students').doc(studentId).set(updateData, { merge: true }).catch(() => null),
          adminDb.collection('users').doc(studentId).set(updateData, { merge: true }).catch(() => null),
        ]);

        if (body.courseProgress && typeof body.courseProgress === 'object') {
          for (const [progId, progVal] of Object.entries<any>(body.courseProgress)) {
            const docId = `${studentId}_${progId}`;
            await adminDb.collection('courseProgress').doc(docId).set(
              {
                studentId,
                programId: progId,
                courseId: progId,
                ...progVal,
                lastUpdatedByUid: decoded.uid,
                updatedAt: now,
              },
              { merge: true }
            );
          }
        }
        return json(200, { ok: true, studentId, pathwayStatus });
      }
      return json(400, { error: 'Unsupported action.' });
    }
    const docs = new Map<string, any>();
    const add = (snap: QuerySnapshot) => snap.forEach(d => docs.set(d.id, { id: d.id, ...d.data() }));
    const addStudentById = async (studentId: string) => {
      if (!studentId) return;
      for (const name of ['individualStudents', 'students']) {
        try {
          const snap = await adminDb.collection(name).doc(studentId).get();
          if (snap.exists) docs.set(snap.id, { id: snap.id, ...snap.data() });
        } catch (e) { console.warn(`Student lookup failed for ${name}/${studentId}`, e); }
      }
    };

    if (['TUTOR', 'STAFF', 'INSTRUCTOR', 'TEACHER'].includes(role)) {
      // 1. Resolve school(s) assigned to this tutor
      const staffAccessDoc = await adminDb.collection('staffSchoolAccess').doc(decoded.uid).get().catch(() => null);
      const accessData = staffAccessDoc?.exists ? staffAccessDoc.data() || {} : {};
      const tutorSchoolIds: string[] = [
        ...(Array.isArray(accessData.schoolIds) ? accessData.schoolIds.map(String) : []),
        ...(accessData.schoolId ? [String(accessData.schoolId)] : []),
        ...(user.schoolId ? [String(user.schoolId)] : [])
      ];

      // Also check schools where tutor is in assignedStaff or assignedTutors
      const schoolsSnap = await adminDb.collection('schools').limit(200).get().catch(() => ({ docs: [] } as any));
      schoolsSnap.docs.forEach((sDoc: any) => {
        const sd = sDoc.data() || {};
        const isAssigned = (Array.isArray(sd.assignedStaff) && sd.assignedStaff.some((st: any) => String(st?.id || st?.uid || '') === decoded.uid)) ||
          (Array.isArray(sd.assignedTutors) && sd.assignedTutors.some((st: any) => String(st?.tutorId || st?.id || st?.uid || '') === decoded.uid));
        if (isAssigned) tutorSchoolIds.push(sDoc.id);
      });

      const uniqueSchoolIds = Array.from(new Set(tutorSchoolIds.filter(Boolean)));

      // Load all students in the tutor's assigned schools
      for (const sid of uniqueSchoolIds) {
        for (const name of ['individualStudents', 'students']) {
          try {
            add(await adminDb.collection(name).where('schoolId', '==', sid).limit(500).get());
          } catch (e) {
            console.warn(`School student query failed for ${sid}`, e);
          }
        }
        const userStudents = await adminDb.collection('users').where('schoolId', '==', sid).limit(500).get().catch(() => ({ docs: [] } as any));
        userStudents.docs.forEach((x: any) => {
          const d = x.data() || {};
          if (['STUDENT', 'SCHOLAR', 'CADET'].includes(roleOf(d.role)) || d.studentDocId) {
            docs.set(String(d.studentDocId || x.id), { id: String(d.studentDocId || x.id), ...d, firebaseUid: x.id });
          }
        });
      }

      // 2. Load private students directly assigned to this tutor
      for (const field of assignmentFields) {
        for (const name of ['individualStudents', 'students']) {
          try {
            add(await adminDb.collection(name).where(field, '==', decoded.uid).limit(200).get());
          } catch (e) {
            console.warn(`Student roster query failed for ${name}.${field}`, e);
          }
        }
      }

      // 3. Dedicated assignment documents
      for (const collectionName of assignmentCollections) {
        for (const field of assignmentFields) {
          try {
            const snap = await adminDb.collection(collectionName).where(field, '==', decoded.uid).limit(200).get();
            for (const assignment of snap.docs) {
              const data = assignment.data() || {};
              const studentId = String(data.studentId || data.learnerId || data.cadetId || data.studentDocId || '').trim();
              await addStudentById(studentId);
            }
          } catch (e) {
            console.warn(`Tutor assignment compatibility query failed for ${collectionName}.${field}`, e);
          }
        }
      }
    } else if (role === 'PARENT') {
      add(await adminDb.collection('individualStudents').where('parentId', '==', decoded.uid).limit(100).get());
      add(await adminDb.collection('students').where('parentId', '==', decoded.uid).limit(100).get());
    } else if (role === 'SCHOOL') {
      let schoolId = String(user.schoolId || user.school_id || user.schoolDocId || '').trim();
      if (!schoolId) {
        const sd = await adminDb.collection('schools').doc(decoded.uid).get();
        if (sd.exists) schoolId = sd.id;
      }
      if (!schoolId && user.email) {
        const email = String(user.email).toLowerCase();
        const a = await adminDb.collection('schools').where('contactEmail', '==', email).limit(1).get();
        const b = a.empty ? await adminDb.collection('schools').where('email', '==', email).limit(1).get() : a;
        if (!b.empty) schoolId = b.docs[0].id;
      }
      const sid = schoolId || decoded.uid;
      add(await adminDb.collection('individualStudents').where('schoolId', '==', sid).limit(500).get());
      add(await adminDb.collection('students').where('schoolId', '==', sid).limit(500).get());
      const us = await adminDb.collection('users').where('schoolId', '==', sid).limit(500).get().catch(() => ({ docs: [] } as any));
      us.docs.forEach((x: any) => {
        const d = x.data() || {};
        if (['STUDENT', 'SCHOLAR', 'CADET'].includes(roleOf(d.role)) || d.studentDocId) {
          docs.set(String(d.studentDocId || x.id), { id: String(d.studentDocId || x.id), ...d, firebaseUid: x.id });
        }
      });
    } else if (role === 'STUDENT') {
      const studentDocId = String(user.studentDocId || '');
      if (studentDocId) await addStudentById(studentDocId);
      if (!docs.size) {
        add(await adminDb.collection('individualStudents').where('firebaseUid', '==', decoded.uid).limit(10).get());
        add(await adminDb.collection('students').where('firebaseUid', '==', decoded.uid).limit(10).get());
      }
    } else if (['ADMIN', 'SUPER_ADMIN', 'CONTENT_ADMIN', 'EDUCATION_ADMIN', 'SERVICES_ADMIN', 'MARKETING_ADMIN', 'SUPPORT_ADMIN'].includes(role)) {
      add(await adminDb.collection('individualStudents').limit(5000).get());
      add(await adminDb.collection('students').limit(5000).get());
      // Some historical accounts exist only in users/{uid}. Include those
      // student identities so every tutor-facing selector can resolve them.
      const userStudents = await adminDb.collection('users').limit(5000).get();
      userStudents.forEach(d => {
        const data = d.data() || {};
        const userRole = roleOf(data.role);
        if (['STUDENT','SCHOLAR','CADET'].includes(userRole) || data.studentDocId) {
          docs.set(d.id, { id: d.id, ...data, firebaseUid: d.id });
        }
      });
    } else {
      return json(403, { error: 'This account does not have access to student learning records.' });
    }

    const students = Array.from(docs.values()).map(s => ({
      id: s.id,
      fullName: s.fullName || s.studentName || s.name || 'Student',
      username: s.username || '',
      email: s.email || '',
      plan: s.plan || s.programName || s.program || '',
      track: s.track || s.programName || '',
      programId: s.programId || '',
      programName: s.programName || '',
      pathwayStatus: s.pathwayStatus || ((Array.isArray(s.selectedProgramIds) && s.selectedProgramIds.length > 0) || (Array.isArray(s.assignedTrackIds) && s.assignedTrackIds.length > 0) || s.programId ? 'CONFIGURED' : 'PENDING_PROGRAMME_CONFIRMATION'),
      selectedProgramIds: Array.isArray(s.selectedProgramIds) ? s.selectedProgramIds : Array.isArray(s.assignedTrackIds) ? s.assignedTrackIds : s.programId ? [s.programId] : [],
      assignedProgramIds: Array.isArray(s.assignedProgramIds) ? s.assignedProgramIds : Array.isArray(s.assignedTrackIds) ? s.assignedTrackIds : [],
      assignedTrackIds: Array.isArray(s.assignedTrackIds) ? s.assignedTrackIds : Array.isArray(s.selectedProgramIds) ? s.selectedProgramIds : [],
      optionalProgramIds: Array.isArray(s.optionalProgramIds) ? s.optionalProgramIds : [],
      excludedProgramIds: Array.isArray(s.excludedProgramIds) ? s.excludedProgramIds : [],
      currentFocusProgramIds: Array.isArray(s.currentFocusProgramIds) ? s.currentFocusProgramIds : [],
      enrolledRootProgramIds: Array.isArray(s.enrolledRootProgramIds) ? s.enrolledRootProgramIds : [],
      enrolledPrograms: Array.isArray(s.enrolledPrograms) ? s.enrolledPrograms : [],
      deliveryType: s.deliveryType || 'PUBLIC_GROUP',
      agreedFee: s.agreedFee ?? null,
      schoolId: s.schoolId || '',
      parentId: s.parentId || '',
      tutorId: s.tutorId || s.staffId || s.assignedTutorId || s.assignedStaffId || s.instructorId || '',
      firebaseUid: s.firebaseUid || s.userId || '',
    })).sort((a, b) => a.fullName.localeCompare(b.fullName));
    return json(200, { students });
  } catch (error) {
    console.warn('Academic students fallback notice:', error);
    return json(200, { students: [], fallback: true });
  }
};
