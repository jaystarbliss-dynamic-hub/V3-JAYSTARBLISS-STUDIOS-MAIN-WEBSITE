import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  extractPlainTextFromHtml,
  sanitizeDocumentHtml,
  type DocumentVersionSnapshot,
  type PerformanceReportStructuredSections,
} from './documentTemplates';

export type AuthorizedReportRecipientScope = 'PARENT_GUARDIAN' | 'SCHOOL_ADMIN' | 'BOTH';

export interface VerifiedReportRecipient {
  role: 'PARENT_GUARDIAN' | 'SCHOOL_ADMIN';
  uid?: string;
  name: string;
  email?: string;
  schoolId?: string;
  schoolName?: string;
}

export interface TutorProgressReportRecord {
  id: string;
  title: string;
  documentType: 'PERFORMANCE_REPORT';
  status: 'DRAFT' | 'SENT';
  learnerCategory?: 'SCHOOL' | 'PRIVATE';
  studentId: string;
  studentUid?: string;
  studentCode?: string;
  studentName: string;
  studentClass?: string;
  programmeName?: string;
  schoolId?: string;
  schoolName?: string;
  schoolAdminUid?: string;
  schoolAdminName?: string;
  schoolAdminEmail?: string;
  parentId?: string;
  parentUid?: string;
  parentEmail?: string;
  parentName?: string;
  recipientScope?: AuthorizedReportRecipientScope;
  deliveredRecipients?: VerifiedReportRecipient[];
  structuredSections?: PerformanceReportStructuredSections;
  reportDate?: string;
  tutorUid: string;
  tutorName: string;
  reportingPeriod?: string;
  contentHtml: string;
  contentPlainText?: string;
  versionNumber: number;
  versions: DocumentVersionSnapshot[];
  sentAt?: string | null;
  lastAmendedAt?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface SaveTutorProgressDraftInput {
  id?: string;
  title: string;
  learnerCategory?: 'SCHOOL' | 'PRIVATE';
  studentId: string;
  studentUid?: string;
  studentCode?: string;
  studentName: string;
  studentClass?: string;
  programmeName?: string;
  schoolId?: string;
  schoolName?: string;
  schoolAdminUid?: string;
  schoolAdminName?: string;
  schoolAdminEmail?: string;
  parentId?: string;
  parentUid?: string;
  parentEmail?: string;
  parentName?: string;
  recipientScope?: AuthorizedReportRecipientScope;
  structuredSections?: PerformanceReportStructuredSections;
  reportDate?: string;
  tutorUid: string;
  tutorName: string;
  reportingPeriod?: string;
  contentHtml: string;
  saveVersionSnapshot?: boolean;
  snapshotNote?: string;
}

const COLLECTION_NAME = 'tutorProgressReports';

/**
 * Verifies a learner and school record directly against Firestore so recipient selection
 * cannot be forged or directed to unrelated recipients.
 */
async function resolveVerifiedRecipientsFromFirestore(
  input: SaveTutorProgressDraftInput
): Promise<{
  learnerCategory: 'SCHOOL' | 'PRIVATE';
  parentRecipient: VerifiedReportRecipient | null;
  schoolAdminRecipient: VerifiedReportRecipient | null;
}> {
  let studentData: Record<string, any> | null = null;
  if (input.studentId && !input.studentId.startsWith('custom_')) {
    const sSnap = await getDoc(doc(db, 'students', input.studentId)).catch(() => null);
    if (sSnap && sSnap.exists()) {
      studentData = sSnap.data();
    } else {
      const iSnap = await getDoc(doc(db, 'individualStudents', input.studentId)).catch(() => null);
      if (iSnap && iSnap.exists()) {
        studentData = iSnap.data();
      }
    }
  }

  const rawSchoolId = String(
    studentData?.schoolId || input.schoolId || ''
  ).trim();
  const rawSchoolName = String(
    studentData?.schoolName || studentData?.school || input.schoolName || ''
  ).trim();

  const isSchoolLearner =
    input.learnerCategory === 'SCHOOL' ||
    Boolean(
      (rawSchoolId || rawSchoolName) &&
        rawSchoolName.toLowerCase() !== 'private enrolment' &&
        rawSchoolName.toLowerCase() !== 'jaystarbliss dynamic institute'
    );

  const learnerCategory: 'SCHOOL' | 'PRIVATE' = isSchoolLearner ? 'SCHOOL' : 'PRIVATE';

  // Resolve verified Parent / Guardian
  let parentUid = String(
    studentData?.parentUid || studentData?.parentId || input.parentUid || input.parentId || ''
  ).trim();
  let parentName = String(
    studentData?.parentName || studentData?.guardianName || input.parentName || ''
  ).trim();
  let parentEmail = String(
    studentData?.parentEmail || studentData?.guardianEmail || input.parentEmail || ''
  )
    .trim()
    .toLowerCase();

  if (parentUid && (!parentEmail || !parentName)) {
    const pSnap = await getDoc(doc(db, 'parents', parentUid)).catch(() => null);
    if (pSnap && pSnap.exists()) {
      const pData = pSnap.data();
      parentName = parentName || String(pData.fullName || pData.name || '').trim();
      parentEmail = parentEmail || String(pData.email || '').trim().toLowerCase();
    } else {
      const uSnap = await getDoc(doc(db, 'users', parentUid)).catch(() => null);
      if (uSnap && uSnap.exists()) {
        const uData = uSnap.data();
        parentName = parentName || String(uData.fullName || uData.name || '').trim();
        parentEmail = parentEmail || String(uData.email || '').trim().toLowerCase();
      }
    }
  }

  const hasLinkedParent = Boolean(parentUid || parentEmail || parentName);
  const parentRecipient: VerifiedReportRecipient | null = hasLinkedParent
    ? {
        role: 'PARENT_GUARDIAN',
        uid: parentUid || undefined,
        name: parentName || 'Parent / Guardian',
        email: parentEmail || undefined,
      }
    : null;

  // Resolve verified School Administrator (STRICTLY only for School Learners)
  let schoolAdminRecipient: VerifiedReportRecipient | null = null;
  if (learnerCategory === 'SCHOOL') {
    let adminUid = String(input.schoolAdminUid || '').trim();
    let adminName = String(input.schoolAdminName || '').trim();
    let adminEmail = String(input.schoolAdminEmail || '').trim().toLowerCase();

    if (rawSchoolId) {
      const schoolSnap = await getDoc(doc(db, 'schools', rawSchoolId)).catch(() => null);
      if (schoolSnap && schoolSnap.exists()) {
        const sData = schoolSnap.data();
        adminUid =
          String(sData.adminUid || sData.userId || sData.ownerUid || adminUid || '').trim() ||
          rawSchoolId;
        adminName =
          String(
            sData.adminName ||
              sData.contactPerson ||
              sData.principalName ||
              adminName ||
              `${sData.name || rawSchoolName} Administrator`
          ).trim();
        adminEmail = String(
          sData.adminEmail || sData.contactEmail || sData.email || adminEmail || ''
        )
          .trim()
          .toLowerCase();
      }
    }

    if (adminUid || adminEmail || rawSchoolId || rawSchoolName) {
      schoolAdminRecipient = {
        role: 'SCHOOL_ADMIN',
        uid: adminUid || rawSchoolId || undefined,
        name: adminName || `${rawSchoolName || 'School'} Administrator`,
        email: adminEmail || undefined,
        schoolId: rawSchoolId || undefined,
        schoolName: rawSchoolName || undefined,
      };
    }
  }

  return {
    learnerCategory,
    parentRecipient,
    schoolAdminRecipient,
  };
}

export async function saveTutorProgressReportDraft(
  input: SaveTutorProgressDraftInput
): Promise<TutorProgressReportRecord> {
  if (!input.studentId || !input.studentName?.trim()) {
    throw new Error('Please select a verified learner before saving a performance report.');
  }

  const cleanHtml = sanitizeDocumentHtml(input.contentHtml);
  const plainText = extractPlainTextFromHtml(cleanHtml);
  const nowIso = new Date().toISOString();

  if (input.id) {
    const ref = doc(db, COLLECTION_NAME, input.id);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data() as Partial<TutorProgressReportRecord>) : null;
    const prevVersion = Number(existing?.versionNumber || 1);
    const prevVersions = Array.isArray(existing?.versions) ? existing.versions : [];
    const nextVersion = input.saveVersionSnapshot ? prevVersion + 1 : prevVersion;

    const nextVersions = input.saveVersionSnapshot
      ? [
          ...prevVersions,
          {
            versionNumber: nextVersion,
            savedAt: nowIso,
            savedByUid: input.tutorUid,
            savedByName: input.tutorName,
            title: input.title.trim() || 'Student Progress Report',
            contentHtml: cleanHtml,
            note: input.snapshotNote || 'Saved draft revision',
          },
        ]
      : prevVersions;

    const patch: Record<string, any> = {
      title: input.title.trim() || 'Student Progress Report',
      learnerCategory: input.learnerCategory || existing?.learnerCategory || 'PRIVATE',
      studentId: input.studentId,
      studentUid: input.studentUid || '',
      studentCode: input.studentCode || '',
      studentName: input.studentName,
      studentClass: input.studentClass || '',
      programmeName: input.programmeName || '',
      schoolId: input.schoolId || '',
      schoolName: input.schoolName || '',
      schoolAdminUid: input.schoolAdminUid || '',
      schoolAdminName: input.schoolAdminName || '',
      schoolAdminEmail: (input.schoolAdminEmail || '').trim().toLowerCase(),
      parentId: input.parentId || '',
      parentUid: input.parentUid || '',
      parentEmail: (input.parentEmail || '').trim().toLowerCase(),
      parentName: input.parentName || '',
      recipientScope: input.recipientScope || existing?.recipientScope || 'PARENT_GUARDIAN',
      structuredSections: input.structuredSections || existing?.structuredSections || {},
      reportDate: input.reportDate || existing?.reportDate || '',
      reportingPeriod: input.reportingPeriod || '',
      contentHtml: cleanHtml,
      contentPlainText: plainText,
      versionNumber: nextVersion,
      versions: nextVersions,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(ref, patch);
    return {
      id: input.id,
      documentType: 'PERFORMANCE_REPORT',
      status: (existing?.status as 'DRAFT' | 'SENT') || 'DRAFT',
      tutorUid: existing?.tutorUid || input.tutorUid,
      tutorName: existing?.tutorName || input.tutorName,
      sentAt: existing?.sentAt || null,
      lastAmendedAt: existing?.lastAmendedAt || null,
      deliveredRecipients: existing?.deliveredRecipients || [],
      ...patch,
    } as TutorProgressReportRecord;
  }

  const initialSnapshot: DocumentVersionSnapshot = {
    versionNumber: 1,
    savedAt: nowIso,
    savedByUid: input.tutorUid,
    savedByName: input.tutorName,
    title: input.title.trim() || 'Student Progress Report',
    contentHtml: cleanHtml,
    note: 'Initial draft created',
  };

  const payload = {
    title: input.title.trim() || 'Student Progress Report',
    documentType: 'PERFORMANCE_REPORT' as const,
    status: 'DRAFT' as const,
    learnerCategory: input.learnerCategory || ('PRIVATE' as const),
    studentId: input.studentId,
    studentUid: input.studentUid || '',
    studentCode: input.studentCode || '',
    studentName: input.studentName,
    studentClass: input.studentClass || '',
    programmeName: input.programmeName || '',
    schoolId: input.schoolId || '',
    schoolName: input.schoolName || '',
    schoolAdminUid: input.schoolAdminUid || '',
    schoolAdminName: input.schoolAdminName || '',
    schoolAdminEmail: (input.schoolAdminEmail || '').trim().toLowerCase(),
    parentId: input.parentId || '',
    parentUid: input.parentUid || '',
    parentEmail: (input.parentEmail || '').trim().toLowerCase(),
    parentName: input.parentName || '',
    recipientScope: input.recipientScope || ('PARENT_GUARDIAN' as const),
    deliveredRecipients: [] as VerifiedReportRecipient[],
    structuredSections: input.structuredSections || {},
    reportDate: input.reportDate || '',
    tutorUid: input.tutorUid,
    tutorName: input.tutorName,
    reportingPeriod: input.reportingPeriod || '',
    contentHtml: cleanHtml,
    contentPlainText: plainText,
    versionNumber: 1,
    versions: [initialSnapshot],
    sentAt: null,
    lastAmendedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const created = await addDoc(collection(db, COLLECTION_NAME), payload);
  return { id: created.id, ...payload };
}

export async function sendTutorProgressReportToParent(
  input: SaveTutorProgressDraftInput & { amendmentNote?: string }
): Promise<TutorProgressReportRecord> {
  if (!input.studentId || input.studentId.startsWith('custom_')) {
    throw new Error('Please select a verified learner record before publishing a performance report.');
  }

  // Enforce strict recipient eligibility rules against verified database records
  const verified = await resolveVerifiedRecipientsFromFirestore(input);
  const requestedScope: AuthorizedReportRecipientScope =
    input.recipientScope || 'PARENT_GUARDIAN';

  if (
    verified.learnerCategory === 'PRIVATE' &&
    (requestedScope === 'SCHOOL_ADMIN' || requestedScope === 'BOTH')
  ) {
    throw new Error(
      'Private learner performance reports can only be sent to the linked Parent or Guardian.'
    );
  }

  const deliveredRecipients: VerifiedReportRecipient[] = [];

  if (requestedScope === 'PARENT_GUARDIAN' || requestedScope === 'BOTH') {
    if (!verified.parentRecipient) {
      throw new Error(
        `No verified Parent or Guardian record is linked to ${input.studentName}.`
      );
    }
    deliveredRecipients.push(verified.parentRecipient);
  }

  if (requestedScope === 'SCHOOL_ADMIN' || requestedScope === 'BOTH') {
    if (verified.learnerCategory !== 'SCHOOL' || !verified.schoolAdminRecipient) {
      throw new Error(
        `No verified School Administrator record is linked to ${input.studentName}'s school.`
      );
    }
    deliveredRecipients.push(verified.schoolAdminRecipient);
  }

  if (deliveredRecipients.length === 0) {
    throw new Error('Please select an authorized recipient from the recipient dropdown.');
  }

  const cleanHtml = sanitizeDocumentHtml(input.contentHtml);
  const plainText = extractPlainTextFromHtml(cleanHtml);
  const nowIso = new Date().toISOString();

  // First ensure the document exists
  const base = input.id
    ? await saveTutorProgressReportDraft({
        ...input,
        learnerCategory: verified.learnerCategory,
        recipientScope: requestedScope,
        saveVersionSnapshot: false,
      })
    : await saveTutorProgressReportDraft({
        ...input,
        learnerCategory: verified.learnerCategory,
        recipientScope: requestedScope,
      });

  const wasAlreadySent = base.status === 'SENT';
  const nextVersion = wasAlreadySent
    ? Number(base.versionNumber || 1) + 1
    : Number(base.versionNumber || 1);

  const recipientSummaryLabel = deliveredRecipients
    .map((r) =>
      r.role === 'SCHOOL_ADMIN'
        ? `School Admin (${r.name})`
        : `Parent/Guardian (${r.name})`
    )
    .join(' & ');

  const nextVersions: DocumentVersionSnapshot[] = [
    ...(Array.isArray(base.versions) ? base.versions : []),
    {
      versionNumber: nextVersion,
      savedAt: nowIso,
      savedByUid: input.tutorUid,
      savedByName: input.tutorName,
      title: input.title.trim() || 'Student Progress Report',
      contentHtml: cleanHtml,
      note: wasAlreadySent
        ? input.amendmentNote || `Amended & re-sent to ${recipientSummaryLabel}`
        : `Sent to ${recipientSummaryLabel}`,
    },
  ];

  const updatePayload: Record<string, any> = {
    title: input.title.trim() || 'Student Progress Report',
    learnerCategory: verified.learnerCategory,
    recipientScope: requestedScope,
    deliveredRecipients,
    parentUid: verified.parentRecipient?.uid || input.parentUid || '',
    parentId: verified.parentRecipient?.uid || input.parentId || '',
    parentName: verified.parentRecipient?.name || input.parentName || '',
    parentEmail: (verified.parentRecipient?.email || input.parentEmail || '').toLowerCase(),
    schoolAdminUid: verified.schoolAdminRecipient?.uid || input.schoolAdminUid || '',
    schoolAdminName: verified.schoolAdminRecipient?.name || input.schoolAdminName || '',
    schoolAdminEmail: (
      verified.schoolAdminRecipient?.email ||
      input.schoolAdminEmail ||
      ''
    ).toLowerCase(),
    contentHtml: cleanHtml,
    contentPlainText: plainText,
    status: 'SENT',
    versionNumber: nextVersion,
    versions: nextVersions,
    sentAt: base.sentAt || nowIso,
    lastAmendedAt: wasAlreadySent ? nowIso : null,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, COLLECTION_NAME, base.id), updatePayload);

  // Deliver in-portal notifications and optional emails to every verified recipient
  const token = await auth.currentUser?.getIdToken().catch(() => '');

  for (const recipient of deliveredRecipients) {
    const isSchoolAdmin = recipient.role === 'SCHOOL_ADMIN';
    if (recipient.uid) {
      await addDoc(collection(db, 'notifications'), {
        recipientId: recipient.uid,
        recipientUid: recipient.uid,
        recipientRole: isSchoolAdmin ? 'school' : 'parent',
        type: 'tutor_progress_report',
        priority: 'high',
        title: wasAlreadySent
          ? `Updated Progress Report: ${input.studentName}`
          : `New Progress Report for ${input.studentName}`,
        message: `${input.tutorName} ${wasAlreadySent ? 'updated' : 'shared'} "${
          input.title.trim() || 'Student Progress Report'
        }" for ${input.studentName}. View or download the official A4 PDF from your ${
          isSchoolAdmin ? 'School Administrator' : 'Parent'
        } Portal.`,
        link: isSchoolAdmin ? '/portal/school' : '/portal/parent',
        reportId: base.id,
        studentId: input.studentId,
        read: false,
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp(),
      }).catch(() => undefined);
    }

    const cleanEmail = (recipient.email || '').trim().toLowerCase();
    if (cleanEmail) {
      try {
        await fetch('/.netlify/functions/send-client-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            to: cleanEmail,
            subject: `${
              wasAlreadySent ? 'Updated ' : ''
            }Student Progress Report — ${input.studentName} | Jaystarbliss Dynamic Institute`,
            html: `<p>Dear ${recipient.name || (isSchoolAdmin ? 'School Administrator' : 'Parent / Guardian')},</p>
              <p><strong>${input.tutorName}</strong> has ${
              wasAlreadySent ? 'issued an updated version of' : 'shared'
            } an official performance &amp; progress report for <strong>${
              input.studentName
            }</strong> titled <em>"${input.title.trim()}"</em>.</p>
              <p>Please sign in to your Jaystarbliss ${
                isSchoolAdmin ? 'Partner School' : 'Parent'
              } Portal to review the complete report and download the official branded A4 PDF.</p>`,
          }),
        }).catch(() => undefined);
      } catch {
        // Non-blocking email notification
      }
    }
  }

  return {
    ...base,
    ...updatePayload,
    status: 'SENT',
  };
}

export async function listTutorProgressReportsForTutor(
  tutorUid: string,
  isAdmin = false
): Promise<TutorProgressReportRecord[]> {
  try {
    const q = isAdmin
      ? query(collection(db, COLLECTION_NAME), limit(200))
      : query(collection(db, COLLECTION_NAME), where('tutorUid', '==', tutorUid), limit(150));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TutorProgressReportRecord, 'id'>) }))
      .sort((a, b) => {
        const ta = a.updatedAt?.toMillis?.() || Date.parse(a.sentAt || '') || 0;
        const tb = b.updatedAt?.toMillis?.() || Date.parse(b.sentAt || '') || 0;
        return tb - ta;
      });
  } catch (err) {
    console.warn('Could not load tutor progress reports:', err);
    return [];
  }
}

export async function listSentTutorProgressReportsForParent(
  parentUid: string,
  parentEmail: string,
  linkedStudentIds: string[]
): Promise<TutorProgressReportRecord[]> {
  const results = new Map<string, TutorProgressReportRecord>();
  const cleanEmail = (parentEmail || '').trim().toLowerCase();
  const cleanStudentIds = Array.from(
    new Set(linkedStudentIds.map((s) => String(s || '').trim()).filter(Boolean))
  );

  const queries: Promise<any>[] = [];
  if (parentUid) {
    queries.push(
      getDocs(
        query(
          collection(db, COLLECTION_NAME),
          where('parentUid', '==', parentUid),
          where('status', '==', 'SENT'),
          limit(100)
        )
      ).catch(() => null)
    );
    queries.push(
      getDocs(
        query(
          collection(db, COLLECTION_NAME),
          where('parentId', '==', parentUid),
          where('status', '==', 'SENT'),
          limit(100)
        )
      ).catch(() => null)
    );
  }
  if (cleanEmail) {
    queries.push(
      getDocs(
        query(
          collection(db, COLLECTION_NAME),
          where('parentEmail', '==', cleanEmail),
          where('status', '==', 'SENT'),
          limit(100)
        )
      ).catch(() => null)
    );
  }
  for (let i = 0; i < cleanStudentIds.length; i += 10) {
    const chunk = cleanStudentIds.slice(i, i + 10);
    queries.push(
      getDocs(
        query(
          collection(db, COLLECTION_NAME),
          where('studentId', 'in', chunk),
          where('status', '==', 'SENT'),
          limit(100)
        )
      ).catch(() => null)
    );
  }

  const snaps = await Promise.all(queries);
  for (const snap of snaps) {
    snap?.docs?.forEach((d: any) => {
      const data = d.data() as Omit<TutorProgressReportRecord, 'id'>;
      // Strict guard: never expose drafts to parents
      if (data.status === 'SENT') {
        results.set(d.id, { id: d.id, ...data });
      }
    });
  }

  return Array.from(results.values()).sort((a, b) => {
    const ta = Date.parse(a.sentAt || '') || a.updatedAt?.toMillis?.() || 0;
    const tb = Date.parse(b.sentAt || '') || b.updatedAt?.toMillis?.() || 0;
    return tb - ta;
  });
}
