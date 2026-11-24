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
} from './documentTemplates';

export interface TutorProgressReportRecord {
  id: string;
  title: string;
  documentType: 'PERFORMANCE_REPORT';
  status: 'DRAFT' | 'SENT';
  studentId: string;
  studentUid?: string;
  studentName: string;
  studentClass?: string;
  programmeName?: string;
  schoolId?: string;
  schoolName?: string;
  parentId?: string;
  parentUid?: string;
  parentEmail?: string;
  parentName?: string;
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
  studentId: string;
  studentUid?: string;
  studentName: string;
  studentClass?: string;
  programmeName?: string;
  schoolId?: string;
  schoolName?: string;
  parentId?: string;
  parentUid?: string;
  parentEmail?: string;
  parentName?: string;
  tutorUid: string;
  tutorName: string;
  reportingPeriod?: string;
  contentHtml: string;
  saveVersionSnapshot?: boolean;
  snapshotNote?: string;
}

const COLLECTION_NAME = 'tutorProgressReports';

export async function saveTutorProgressReportDraft(
  input: SaveTutorProgressDraftInput
): Promise<TutorProgressReportRecord> {
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
      studentId: input.studentId,
      studentUid: input.studentUid || '',
      studentName: input.studentName,
      studentClass: input.studentClass || '',
      programmeName: input.programmeName || '',
      schoolId: input.schoolId || '',
      schoolName: input.schoolName || '',
      parentId: input.parentId || '',
      parentUid: input.parentUid || '',
      parentEmail: (input.parentEmail || '').trim().toLowerCase(),
      parentName: input.parentName || '',
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
    studentId: input.studentId,
    studentUid: input.studentUid || '',
    studentName: input.studentName,
    studentClass: input.studentClass || '',
    programmeName: input.programmeName || '',
    schoolId: input.schoolId || '',
    schoolName: input.schoolName || '',
    parentId: input.parentId || '',
    parentUid: input.parentUid || '',
    parentEmail: (input.parentEmail || '').trim().toLowerCase(),
    parentName: input.parentName || '',
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
  const cleanHtml = sanitizeDocumentHtml(input.contentHtml);
  const plainText = extractPlainTextFromHtml(cleanHtml);
  const nowIso = new Date().toISOString();

  // First ensure the document exists
  const base = input.id
    ? await saveTutorProgressReportDraft({ ...input, saveVersionSnapshot: false })
    : await saveTutorProgressReportDraft(input);

  const wasAlreadySent = base.status === 'SENT';
  const nextVersion = wasAlreadySent ? Number(base.versionNumber || 1) + 1 : Number(base.versionNumber || 1);
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
        ? input.amendmentNote || 'Amended & re-sent to parent'
        : 'Sent to parent',
    },
  ];

  const updatePayload: Record<string, any> = {
    title: input.title.trim() || 'Student Progress Report',
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

  // Create in-portal notification for parent
  const targetParentUid = input.parentUid || input.parentId || '';
  if (targetParentUid) {
    await addDoc(collection(db, 'notifications'), {
      recipientId: targetParentUid,
      recipientUid: targetParentUid,
      recipientRole: 'parent',
      type: 'tutor_progress_report',
      priority: 'high',
      title: wasAlreadySent
        ? `Updated Progress Report: ${input.studentName}`
        : `New Progress Report for ${input.studentName}`,
      message: `${input.tutorName} ${wasAlreadySent ? 'updated' : 'shared'} "${
        input.title.trim() || 'Student Progress Report'
      }" for ${input.studentName}. View or download the official PDF from your Parent Portal.`,
      link: '/portal/parent',
      reportId: base.id,
      studentId: input.studentId,
      read: false,
      createdAt: serverTimestamp(),
      timestamp: serverTimestamp(),
    }).catch(() => undefined);
  }

  // Trigger optional email notification to parent if parentEmail is present
  const cleanParentEmail = (input.parentEmail || '').trim().toLowerCase();
  if (cleanParentEmail) {
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => '');
      await fetch('/.netlify/functions/send-client-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to: cleanParentEmail,
          subject: `${
            wasAlreadySent ? 'Updated ' : ''
          }Student Progress Report — ${input.studentName} | Jaystarbliss Dynamic Institute`,
          html: `<p>Dear ${input.parentName || 'Parent / Guardian'},</p>
            <p><strong>${input.tutorName}</strong> has ${
            wasAlreadySent ? 'issued an updated version of' : 'shared'
          } an official performance &amp; progress report for <strong>${
            input.studentName
          }</strong> titled <em>"${input.title.trim()}"</em>.</p>
            <p>Please sign in to your Jaystarbliss Parent Portal to review the complete report and download the official branded PDF.</p>`,
        }),
      }).catch(() => undefined);
    } catch {
      // Non-blocking email notification
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
  const cleanStudentIds = Array.from(new Set(linkedStudentIds.map((s) => String(s || '').trim()).filter(Boolean)));

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
