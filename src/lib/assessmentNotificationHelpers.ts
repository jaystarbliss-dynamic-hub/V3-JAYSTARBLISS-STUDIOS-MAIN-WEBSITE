import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { dispatchActionableAlert } from './adminAlertDispatcher';

const SUBMITTED_STATUSES = new Set(['submitted', 'graded', 'expired', 'completed']);

function normalizeIdList(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return Array.from(new Set(val.map((v) => String(v || '').trim()).filter(Boolean)));
}

function resolveExamClosingMs(exam: Record<string, any>): number | null {
  for (const candidate of [exam.availableUntil, exam.closesAt, exam.dueDate, exam.endAt, exam.deadline]) {
    if (!candidate) continue;
    if (typeof candidate?.toMillis === 'function') return candidate.toMillis();
    if (typeof candidate?.seconds === 'number') return candidate.seconds * 1000;
    const parsed = Date.parse(String(candidate));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function computeExamSubmissionTallies(
  examId: string,
  exam: Record<string, any>,
  justSubmittedStudentKey?: string
): Promise<{
  submittedCount: number;
  totalExpected: number;
  isSchoolAssessment: boolean;
  schoolId: string;
  schoolName: string;
}> {
  const schoolId = String(exam.schoolId || '').trim();
  const schoolName = String(exam.schoolName || '').trim();
  const targetStudentUids = normalizeIdList(exam.studentUids || exam.targetStudentIds);
  const audienceType = String(exam.audienceType || '').toLowerCase();
  const isSchoolAssessment =
    Boolean(schoolId) && audienceType !== 'individual' && targetStudentUids.length === 0;

  // Count unique students who submitted
  const attemptsSnap = await getDocs(
    query(collection(db, 'jdiExamAttempts'), where('examId', '==', examId), limit(500))
  ).catch(() => null);

  const submittedStudents = new Set<string>();
  attemptsSnap?.docs.forEach((d) => {
    const data = d.data() || {};
    const status = String(data.status || '').toLowerCase();
    if (SUBMITTED_STATUSES.has(status)) {
      const key = String(data.studentUid || data.studentId || d.id).trim();
      if (key) submittedStudents.add(key);
    }
  });
  if (justSubmittedStudentKey) {
    submittedStudents.add(justSubmittedStudentKey);
  }

  let totalExpected = targetStudentUids.length;
  if (isSchoolAssessment && schoolId) {
    const classFilter = normalizeIdList(exam.classIds).map((c) => c.toLowerCase());
    const filterByClass =
      classFilter.length > 0 && !classFilter.includes('all') && !classFilter.includes('all classes');

    const [schSnap, indSnap] = await Promise.all([
      getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId), limit(500))).catch(
        () => null
      ),
      getDocs(
        query(collection(db, 'individualStudents'), where('schoolId', '==', schoolId), limit(500))
      ).catch(() => null),
    ]);

    const eligibleKeys = new Set<string>();
    for (const snap of [schSnap, indSnap]) {
      snap?.docs.forEach((d) => {
        const s = d.data() || {};
        if (filterByClass) {
          const sClass = String(
            s.classId || s.classLevel || s.className || s.class || s.grade || ''
          )
            .trim()
            .toLowerCase();
          if (!sClass || !classFilter.includes(sClass)) return;
        }
        const key = String(s.firebaseUid || s.userId || s.uid || d.id).trim();
        if (key) eligibleKeys.add(key);
      });
    }
    totalExpected = Math.max(eligibleKeys.size, submittedStudents.size);
  } else if (totalExpected === 0) {
    totalExpected = Math.max(submittedStudents.size, 1);
  }

  return {
    submittedCount: submittedStudents.size,
    totalExpected,
    isSchoolAssessment,
    schoolId,
    schoolName,
  };
}

/**
 * Dispatches detailed assessment submission notifications when a student submits
 * via client-side Firestore fallback (and complements server-side notifications).
 */
export async function notifyOnClientAssessmentSubmit(params: {
  examId: string;
  attemptId: string;
  exam: Record<string, any>;
  studentUid: string;
  studentId?: string;
  studentName: string;
  parentId?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  wasExpired?: boolean;
}): Promise<void> {
  try {
    const examTitle = String(params.exam?.title || 'Assessment').trim();
    const studentName = String(params.studentName || 'A student').trim();
    const studentKey = String(params.studentUid || params.studentId || '').trim();
    const examWithSchool = {
      ...params.exam,
      schoolId: params.schoolId || params.exam?.schoolId || '',
      schoolName: params.schoolName || params.exam?.schoolName || '',
    };

    const { submittedCount, totalExpected, isSchoolAssessment, schoolId, schoolName } =
      await computeExamSubmissionTallies(params.examId, examWithSchool, studentKey);

    const progressText =
      totalExpected > 1
        ? ` (${submittedCount} of ${totalExpected} assigned students have submitted so far)`
        : '';
    const schoolSuffix = isSchoolAssessment && schoolName ? ` — ${schoolName}` : '';
    const verb = params.wasExpired ? 'timed out and auto-submitted' : 'submitted';
    const message = `${studentName} ${verb} "${examTitle}"${schoolSuffix}${progressText}.`;

    const recipientUids: string[] = [];
    const creatorUid = String(params.exam?.createdBy || params.exam?.tutorId || '').trim();
    if (creatorUid && creatorUid !== params.studentUid) {
      recipientUids.push(creatorUid);
    }
    const parentId = String(params.parentId || '').trim();
    if (parentId && parentId !== params.studentUid && !isSchoolAssessment) {
      recipientUids.push(parentId);
    }

    const staffLink = `/portal/staff/exam-history?examId=${encodeURIComponent(params.examId)}`;
    const schoolLink = `/portal/school/exam-history?examId=${encodeURIComponent(params.examId)}`;
    const adminLink = `/admin/examination-history?examId=${encodeURIComponent(params.examId)}`;

    // Write tutor/parent notification directly to jdiNotifications + notifications
    await dispatchActionableAlert({
      category: 'exam_submitted',
      categoryLabel: isSchoolAssessment
        ? 'School Assessment Submission'
        : 'Assessment Attempt Submitted',
      notificationType: 'exam_submitted',
      priority: 'high',
      title: 'Assessment attempt submitted',
      message,
      actionPath: creatorUid ? staffLink : adminLink,
      schoolActionPath: schoolLink,
      actionText: 'View Submissions',
      schoolId: isSchoolAssessment ? schoolId : null,
      schoolName: isSchoolAssessment ? schoolName : null,
      notifyPlatformAdmins: true,
      recipientUids,
      details: [
        { label: 'Student', value: studentName },
        { label: 'Assessment', value: examTitle },
        {
          label: 'Submission Progress',
          value: `${submittedCount} of ${totalExpected} submitted`,
        },
        ...(schoolName ? [{ label: 'School', value: schoolName }] : []),
      ],
      senderName: studentName,
      senderRole: 'Student Submission',
      dedupeKey: `exam_sub_${params.attemptId}`,
    });

    // Also update a deterministic jdiNotification for the creator if present
    if (creatorUid && creatorUid !== params.studentUid) {
      await setDoc(
        doc(db, 'jdiNotifications', `sub_${params.attemptId}_${creatorUid}`),
        {
          recipientUid: creatorUid,
          isRead: false,
          type: 'exam_submitted',
          title: 'Assessment attempt submitted',
          message,
          link: staffLink,
          linkText: 'View Submissions',
          examId: params.examId,
          attemptId: params.attemptId,
          studentName,
          submittedCount,
          totalExpected,
          schoolId: schoolId || null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => undefined);
    }
  } catch (err) {
    console.warn('Client assessment submit notification warning:', err);
  }
}

/**
 * Checks for assessments whose deadline has passed and creates an idempotent
 * post-deadline submission summary notification (e.g., "18 of 25 students submitted...")
 * for tutors, school admins, and admins. Throttled per browser session.
 */
export async function checkAndNotifyExpiredAssessments(params: {
  role: 'admin' | 'staff' | 'school';
  uid: string;
  schoolId?: string | null;
}): Promise<void> {
  if (!params.uid) return;
  const throttleKey = `jdi_deadline_summary_chk_${params.role}_${params.uid}`;
  try {
    const lastRun = Number(sessionStorage.getItem(throttleKey) || 0);
    if (Date.now() - lastRun < 5 * 60 * 1000) return;
    sessionStorage.setItem(throttleKey, String(Date.now()));
  } catch {
    // ignore storage errors
  }

  try {
    let examQuery;
    if (params.role === 'school' && params.schoolId) {
      examQuery = query(
        collection(db, 'jdiExams'),
        where('schoolId', '==', params.schoolId),
        limit(40)
      );
    } else if (params.role === 'staff') {
      examQuery = query(
        collection(db, 'jdiExams'),
        where('createdBy', '==', params.uid),
        limit(40)
      );
    } else {
      examQuery = query(collection(db, 'jdiExams'), limit(50));
    }

    const snap = await getDocs(examQuery).catch(() => null);
    if (!snap || snap.empty) return;

    const nowMs = Date.now();
    // Only consider exams whose deadline passed within the last 30 days and not yet summarized
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const examDoc of snap.docs) {
      const exam = examDoc.data() || {};
      if (exam.deadlineSummaryNotified === true) continue;
      const status = String(exam.status || '').toLowerCase();
      if (status === 'draft' || status === 'archived') continue;

      const closingMs = resolveExamClosingMs(exam);
      if (!closingMs || closingMs > nowMs) continue;
      if (nowMs - closingMs > thirtyDaysMs) continue;

      const { submittedCount, totalExpected, isSchoolAssessment, schoolId, schoolName } =
        await computeExamSubmissionTallies(examDoc.id, exam);

      const examTitle = String(exam.title || 'Assessment').trim();
      const missingCount = Math.max(0, totalExpected - submittedCount);
      const summaryMessage = `${submittedCount} of ${totalExpected} students submitted "${examTitle}"${
        schoolName ? ` (${schoolName})` : ''
      }. ${
        missingCount > 0
          ? `${missingCount} student${missingCount === 1 ? '' : 's'} did not submit before the deadline.`
          : 'All assigned students submitted.'
      }`;

      const creatorUid = String(exam.createdBy || exam.tutorId || '').trim();
      const recipientUids = creatorUid ? [creatorUid] : [];
      const staffLink = `/portal/staff/exam-history?examId=${encodeURIComponent(examDoc.id)}`;
      const schoolLink = `/portal/school/exam-history?examId=${encodeURIComponent(examDoc.id)}`;
      const adminLink = `/admin/examination-history?examId=${encodeURIComponent(examDoc.id)}`;

      await dispatchActionableAlert({
        category: 'exam_deadline_summary',
        categoryLabel: isSchoolAssessment
          ? 'School Assessment Submission Summary'
          : 'Assessment Submission Summary',
        notificationType: 'exam_deadline_summary',
        priority: 'high',
        title: `Assessment Closed: ${submittedCount}/${totalExpected} Submitted`,
        message: summaryMessage,
        actionPath: params.role === 'staff' ? staffLink : adminLink,
        schoolActionPath: schoolLink,
        actionText: 'Review Submission Report',
        schoolId: schoolId || null,
        schoolName: schoolName || null,
        notifyPlatformAdmins: true,
        recipientUids,
        details: [
          { label: 'Assessment', value: examTitle },
          ...(schoolName ? [{ label: 'School', value: schoolName }] : []),
          { label: 'Submitted', value: `${submittedCount} of ${totalExpected} students` },
          { label: 'Missing Submissions', value: String(missingCount) },
        ],
        senderName: 'Jaystarbliss Assessments',
        senderRole: 'Assessment Monitor',
        dedupeKey: `exam_summary_${examDoc.id}`,
      });

      // Mark summarized on jdiExams doc when caller has update permission (admin/staff)
      if (params.role === 'admin' || params.role === 'staff') {
        await updateDoc(doc(db, 'jdiExams', examDoc.id), {
          deadlineSummaryNotified: true,
          deadlineSummaryNotifiedAt: serverTimestamp(),
          lastSubmissionSummary: {
            submittedCount,
            totalExpected,
            missingCount,
          },
        }).catch(() => undefined);
      }
    }
  } catch (err) {
    console.warn('Expired assessment summary check warning:', err);
  }
}
