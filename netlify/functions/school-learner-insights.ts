import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { computeExamMaxScore, isAttemptResultReleased, normalizeClassName, normalizeWorkType, resolvePartnerSchoolName } from '../../api/_lib/jdi-assessment.js';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});
const roleOf = (v: unknown) => String(v || '').trim().toUpperCase();
const text = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);
const asIso = (v: any) => v?.toDate ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null;
const blocked = (v: unknown) => ['DISABLED', 'SUSPENDED', 'BANNED'].includes(roleOf(v));

async function resolveSchool(uid: string, profile: Record<string, any>, email: string) {
  const candidates = new Set<string>();
  for (const key of ['schoolId', 'school_id', 'schoolDocId']) {
    const value = text(profile[key]);
    if (value) candidates.add(value);
  }
  const ownDoc = await adminDb.collection('schools').doc(uid).get();
  if (ownDoc.exists) candidates.add(ownDoc.id);

  const normalizedEmail = text(profile.email || email).toLowerCase();
  const queries = [
    normalizedEmail ? adminDb.collection('schools').where('contactEmail', '==', normalizedEmail).limit(5).get() : Promise.resolve({ docs: [] } as any),
    normalizedEmail ? adminDb.collection('schools').where('email', '==', normalizedEmail).limit(5).get() : Promise.resolve({ docs: [] } as any),
    adminDb.collection('schools').where('adminUid', '==', uid).limit(5).get(),
    adminDb.collection('schools').where('firebaseUid', '==', uid).limit(5).get(),
    adminDb.collection('schools').where('userId', '==', uid).limit(5).get()
  ];
  const matches = await Promise.all(queries);
  const schoolDocs = new Map<string, any>();
  matches.forEach(s => s.docs.forEach((d: any) => schoolDocs.set(d.id, d)));
  if (ownDoc.exists) schoolDocs.set(ownDoc.id, ownDoc);
  for (const id of candidates) {
    const snap = await adminDb.collection('schools').doc(id).get().catch(() => null);
    if (snap?.exists) schoolDocs.set(snap.id, snap);
  }
  if (!schoolDocs.size) return null;

  // Resolve identity in strict order. Ambiguous legacy email/code matches fail closed.
  const allDocs = Array.from(schoolDocs.values());
  const linkedByUid = allDocs.filter((d: any) => {
    const s = d.data() || {};
    return d.id === uid || s.adminUid === uid || s.firebaseUid === uid || s.userId === uid;
  });
  if (linkedByUid.length > 1) return null;
  const linkedByDocumentId = allDocs.filter((d: any) => candidates.has(d.id));
  if (!linkedByUid.length && linkedByDocumentId.length > 1) return null;
  const linkedByEmail = allDocs.filter((d: any) => {
    const s = d.data() || {};
    return normalizedEmail && (String(s.email || '').toLowerCase() === normalizedEmail ||
      String(s.contactEmail || '').toLowerCase() === normalizedEmail);
  });
  const doc = linkedByUid[0] ||
    (linkedByDocumentId.length === 1 ? linkedByDocumentId[0] : null) ||
    (linkedByEmail.length === 1 ? linkedByEmail[0] : null) ||
    (allDocs.length === 1 ? allDocs[0] : null);
  if (!doc) return null;
  const data = doc.data() || {};
  // Only use legacy schoolId/code aliases after proving they identify exactly this school.
  // A duplicate school code must never widen a tenant query.
  const aliases = new Set<string>([doc.id]);
  for (const [field, rawValue] of [['schoolId', data.schoolId], ['schoolCode', data.schoolCode]] as const) {
    const value = text(rawValue);
    if (!value || value === doc.id) continue;
    try {
      const aliasMatches = await adminDb.collection('schools').where(field, '==', value).limit(2).get();
      if (aliasMatches.size === 1 && aliasMatches.docs[0].id === doc.id) aliases.add(value);
    } catch (error) {
      console.warn('Could not validate legacy school alias', field, error);
    }
  }
  return {
    id: doc.id,
    name: resolvePartnerSchoolName(data.name, data.schoolName, profile.schoolName) || 'School',
    schoolCode: text(data.schoolCode || data.schoolId || doc.id),
    aliases: Array.from(aliases),
    data
  };
}

const serialiseStudent = (id: string, data: Record<string, any>, source: string, schoolId: string) => {
  const rawClass = text(data.className || data.class || data.grade || data.classLevel || data.classId || '');
  return {
    id,
    collection: source,
    fullName: text(data.fullName || data.studentName || data.name || [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Learner'),
    username: text(data.username || data.admissionNumber || id),
    email: text(data.email),
    className: normalizeClassName(rawClass) || rawClass || 'Unassigned',
    track: text(data.track || data.programName || data.plan),
    schoolId,
    accountStatus: text(data.accountStatus || data.status || 'ACTIVE'),
    studentUid: text(data.firebaseUid || data.userId || data.uid),
    parentId: text(data.parentId || data.guardianId)
  };
};

async function queryBySchoolAliases(collectionName: string, aliases: string[]) {
  const found = new Map<string, any>();
  for (const field of ['schoolId', 'school_id', 'schoolDocId']) {
    for (let offset = 0; offset < aliases.length; offset += 10) {
      const group = aliases.slice(offset, offset + 10);
      if (!group.length) continue;
      try {
        const snap = await adminDb.collection(collectionName).where(field, 'in', group).limit(1000).get();
        snap.docs.forEach(d => found.set(d.id, { id: d.id, data: d.data(), source: collectionName }));
      } catch (error) {
        // Older records may use a different school field; each compatible field is checked separately.
        console.warn('School-scoped learner query failed', collectionName, field, error);
      }
    }
  }
  return Array.from(found.values());
}

export const handler: Handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  try {
    const header = event.headers?.authorization || event.headers?.Authorization || '';
    if (!header.startsWith('Bearer ')) return json(401, { error: 'Authentication required.' });
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) return json(403, { error: 'School portal profile not found.' });
    const profile = userSnap.data() || {};
    if (blocked(profile.accountStatus || profile.status)) return json(403, { error: 'Your account is not active.' });
    if (!['SCHOOL', 'SCHOOL_ADMIN'].includes(roleOf(profile.role))) return json(403, { error: 'School administrator access is required.' });

    const school = await resolveSchool(decoded.uid, profile, decoded.email || '');
    if (!school) return json(403, { error: 'This school account is not linked to a school record. Contact the administrator to finish school setup.' });
    if (blocked(school.data.status) || roleOf(school.data.status) === 'ARCHIVED') return json(403, { error: 'This school account is not active.' });
    const requestedSchoolId = text(event.queryStringParameters?.schoolId);
    if (requestedSchoolId && !school.aliases.includes(requestedSchoolId)) return json(403, { error: 'You are not authorised to view this school.' });

    const [students, individuals, userRecords] = await Promise.all([
      queryBySchoolAliases('students', school.aliases),
      queryBySchoolAliases('individualStudents', school.aliases),
      queryBySchoolAliases('users', school.aliases)
    ]);
    const rosterMap = new Map<string, any>();
    for (const item of [...individuals, ...students]) {
      const learner = serialiseStudent(item.id, item.data, item.source, school.id);
      const existing = rosterMap.get(item.id);
      if (existing) {
        if (existing.fullName === 'Learner' && learner.fullName !== 'Learner') existing.fullName = learner.fullName;
        if (existing.className === 'Unassigned' && learner.className !== 'Unassigned') existing.className = learner.className;
        if (!existing.track && learner.track) existing.track = learner.track;
        if (!existing.studentUid && learner.studentUid) existing.studentUid = learner.studentUid;
      } else {
        rosterMap.set(item.id, learner);
      }
    }
    for (const item of userRecords) {
      const data = item.data || {};
      const r = roleOf(data.role);
      const isExplicitStudent = ['STUDENT', 'SCHOLAR', 'CADET', 'INDIVIDUAL_STUDENT'].includes(r);
      const isOtherRole = ['SCHOOL', 'SCHOOL_ADMIN', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'TUTOR', 'INSTRUCTOR', 'TEACHER', 'PARENT'].includes(r);
      if (!isExplicitStudent && (isOtherRole || (!data.studentDocId && !data.isStudent))) continue;
      const id = text(data.studentDocId || item.id);
      const learner = serialiseStudent(id, data, 'users', school.id);
      const existingLearner = rosterMap.get(id);
      if (existingLearner) {
        if (!existingLearner.studentUid) existingLearner.studentUid = item.id;
        if (existingLearner.fullName === 'Learner' && learner.fullName !== 'Learner') existingLearner.fullName = learner.fullName;
        if (existingLearner.className === 'Unassigned' && learner.className !== 'Unassigned') existingLearner.className = learner.className;
        if (!existingLearner.track && learner.track) existingLearner.track = learner.track;
        continue;
      }
      learner.studentUid = item.id;
      rosterMap.set(id, learner);
    }
    const roster = Array.from(rosterMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));

    const learnerId = text(event.queryStringParameters?.studentId);
    if (!learnerId) {
      // The school ID is always the stable school document ID, even for legacy school records.
      if (school.data.schoolId !== school.id) await adminDb.collection('schools').doc(school.id).update({ schoolId: school.id, updatedAt: new Date() }).catch(() => undefined);
      if (text(profile.schoolId) !== school.id || text(profile.schoolCode) !== school.schoolCode) await adminDb.collection('users').doc(decoded.uid).update({ schoolId: school.id, schoolCode: school.schoolCode, schoolName: school.name, updatedAt: new Date() }).catch(() => undefined);
      return json(200, {
        school: { id: school.id, schoolId: school.id, schoolCode: school.schoolCode, name: school.name },
        learners: roster.map(({ studentUid, parentId, ...learner }) => learner),
        totals: { learners: roster.length, classes: new Set(roster.map(s => s.className).filter(v => v && v !== 'Unassigned')).size }
      });
    }

    const learner = rosterMap.get(learnerId);
    if (!learner) return json(404, { error: 'That learner does not belong to your school.' });

    const [assessmentSnap, assignmentSnap, attendanceSnap, examAttempts, actorLogs, targetLogs] = await Promise.all([
      adminDb.collection('academic_assessments').where('studentId', '==', learnerId).limit(200).get().catch(() => null),
      adminDb.collection('assignments').where('studentId', '==', learnerId).limit(200).get().catch(() => null),
      adminDb.collection('attendance').where('studentId', '==', learnerId).limit(300).get().catch(() => null),
      adminDb.collection('jdiExamAttempts').where('studentId', '==', learnerId).limit(300).get().catch(() => null),
      learner.studentUid ? adminDb.collection('activityLogs').where('actorId', '==', learner.studentUid).limit(200).get().catch(() => null) : Promise.resolve(null),
      adminDb.collection('activityLogs').where('studentId', '==', learnerId).limit(200).get().catch(() => null)
    ]);

    const assessments = (assessmentSnap?.docs || []).map(d => {
      const a = d.data() || {};
      return { id: d.id, title: text(a.title || 'Assessment'), subject: text(a.subject || 'General'), assessmentType: text(a.assessmentType || 'OTHER'), score: typeof a.score === 'number' ? a.score : null, feedback: text(a.feedback, 1200), createdAt: asIso(a.createdAt), updatedAt: asIso(a.updatedAt), assessedBy: text(a.assessedBy) };
    }).sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    const assignments = (assignmentSnap?.docs || []).map(d => {
      const a = d.data() || {};
      return {
        id: d.id,
        title: text(a.title || 'Assignment'),
        subject: text(a.subject || a.track || 'General'),
        status: text(a.status || 'ASSIGNED'),
        grade: typeof a.grade === 'number' ? a.grade : typeof a.score === 'number' ? a.score : null,
        maxPoints: typeof a.maxPoints === 'number' ? a.maxPoints : 100,
        dueDate: asIso(a.dueDate),
        submittedAt: asIso(a.submittedAt || a.updatedAt),
        feedback: text(a.feedback, 1200)
      };
    }).sort((a, b) => String(b.submittedAt || b.dueDate || '').localeCompare(String(a.submittedAt || a.dueDate || '')));

    const attendance = (attendanceSnap?.docs || []).map(d => {
      const a = d.data() || {};
      return { id: d.id, date: asIso(a.date || a.createdAt), status: text(a.status || 'UNKNOWN'), notes: text(a.notes, 500), className: text(a.className || a.class || learner.className) };
    }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const attemptDocs = examAttempts?.docs || [];
    const examNames = new Map<string, string>();
    const exams = await Promise.all(Array.from(new Set(attemptDocs.map(d => text(d.data()?.examId)).filter(Boolean))).map(async id => {
      const snap = await adminDb.collection('jdiExams').doc(id).get().catch(() => null);
      if (snap?.exists && school.aliases.includes(text(snap.data()?.schoolId))) {
        examNames.set(id, text(snap.data()?.title || 'Assessment'));
        return { id, data: snap.data() || {} };
      }
      return null;
    }));
    const allowedExamIds = new Set(exams.filter(Boolean).map(e => e!.id));
    const examinations = attemptDocs.map(d => {
      const a = d.data() || {};
      const examId = text(a.examId);
      if (!allowedExamIds.has(examId)) return null;
      const exam = exams.find(e => e?.id === examId)?.data || {};
      const released = isAttemptResultReleased(a);
      return {
        id: d.id, examId, title: examNames.get(examId) || 'Assessment', subject: text(exam.subject || 'General'),
        workType: normalizeWorkType(exam.workType || a.workType),
        isUngradedActivity: Boolean(exam.isUngradedActivity || a.isUngradedActivity),
        status: text(a.status || 'unknown'), score: released ? (typeof a.score === 'number' ? a.score : null) : null,
        maxScore: computeExamMaxScore(exam, a),
        submittedAt: asIso(a.submittedAt), releasedAt: released ? asIso(a.releasedAt) : null, feedback: released ? text(a.feedback, 1200) : ''
      };
    }).filter(Boolean).sort((a: any, b: any) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));

    const logsMap = new Map<string, any>();
    for (const d of [...(actorLogs?.docs || []), ...(targetLogs?.docs || [])]) {
      const data = d.data() || {};
      const eventStudentId = text(data.studentId || data.entityId);
      const isLearnerActor = Boolean(learner.studentUid && text(data.actorId || data.userId) === learner.studentUid);
      if (eventStudentId !== learnerId && !isLearnerActor) continue;
      logsMap.set(d.id, {
        id: d.id, type: text(data.type || data.action || 'activity'), action: text(data.action || 'ACTIVITY'),
        message: text(data.message || data.action || 'Learner activity'), route: text(data.route),
        createdAt: asIso(data.createdAt || data.timestamp), actorRole: text(data.actorRole || (isLearnerActor ? 'LEARNER' : ''))
      });
    }
    const activities = Array.from(logsMap.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 300);

    return json(200, {
      school: { id: school.id, schoolId: school.id, schoolCode: school.schoolCode, name: school.name },
      learner: { ...learner, studentUid: undefined, parentId: undefined },
      assessments,
      assignments,
      examinations,
      attendance,
      activities,
      summary: {
        assessments: assessments.length,
        assignments: assignments.length,
        examinations: examinations.length,
        attendanceRecords: attendance.length,
        activities: activities.length,
        averageAssessmentScore: assessments.filter(a => typeof a.score === 'number').length
          ? assessments.filter(a => typeof a.score === 'number').reduce((sum, a) => sum + Number(a.score), 0) / assessments.filter(a => typeof a.score === 'number').length
          : null,
        attendanceRate: attendance.length ? attendance.filter(a => ['PRESENT', 'LATE'].includes(a.status.toUpperCase())).length / attendance.length * 100 : null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('auth/invalid') || message.includes('auth/id-token')) return json(401, { error: 'Your session has expired. Please sign in again.' });
    console.error('School learner insights error:', error);
    return json(500, { error: 'Unable to load school learner records right now.' });
  }
};
