/**
 * CodingLabSubmissionService — coordinates immutable assessment submission,
 * tutor submission inspection, manual/hybrid grading with override audit logs,
 * and .sb3 download for tutors.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { calculateScorePercentage } from '../../lib/classes';
import { notifyOnClientAssessmentSubmit } from '../../lib/assessmentNotificationHelpers';
import { gradeScratchProject } from '../../../api/_lib/coding-lab-grader.js';
import type {
  CodingLabAssessmentConfig,
  CodingLabSubmissionRecord,
} from '../../types/codingLab';
import {
  buildAssessmentProjectId,
  loadAssessmentProjectFromFirestore,
  saveAssessmentProjectToFirestore,
} from './CodingLabProjectService';
import { clearLocalDraft, buildLocalDraftKey } from './CodingLabLocalStorage';
import { downloadSb3File } from './ScratchProjectAdapter';

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Submits a learner's Coding Lab assessment:
 * 1. Saves latest project JSON & custom images to Firestore/Cloudinary (fails submission if save fails!)
 * 2. Calls server-verified `/.netlify/functions/coding-lab-assessment` to freeze the snapshot,
 *    verify integrity, compute structural grade server-side, and link to `jdiExamAttempts`.
 * 3. Falls back cleanly in local dev preview if Netlify Functions are unreachable.
 * 4. Notifies the tutor via the existing notification helper.
 */
export async function submitCodingLabAssessment(params: {
  assessmentId: string;
  attemptId: string;
  ownerUid: string;
  learnerName: string;
  schoolId?: string;
  examTitle: string;
  examSubject?: string;
  tutorId?: string;
  title: string;
  sb3Buffer: ArrayBuffer;
  codingConfig?: CodingLabAssessmentConfig;
  maxScore?: number;
  releaseGradesPolicy?: string;
  existingRevision?: number;
  existingManifest?: any[];
  onStageChange?: (stage: 'uploading_assets' | 'saving_lms') => void;
}): Promise<CodingLabSubmissionRecord> {
  const projectId = buildAssessmentProjectId(params.assessmentId, params.attemptId);

  // Step 1: Ensure latest changes are durably saved to Firestore/Cloudinary first
  const saveResult = await saveAssessmentProjectToFirestore({
    projectId,
    ownerUid: params.ownerUid,
    assessmentId: params.assessmentId,
    attemptId: params.attemptId,
    schoolId: params.schoolId,
    title: params.title,
    sb3Buffer: params.sb3Buffer,
    existingRevision: params.existingRevision,
    existingManifest: params.existingManifest,
    lastSavedCompositeHash: null, // Force latest verification before freezing
    onStageChange: params.onStageChange,
  });

  // Step 2: Submit via server-verified Netlify Function
  let submission: CodingLabSubmissionRecord | null = null;
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/.netlify/functions/coding-lab-assessment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        action: 'submit_coding_assessment',
        assessmentId: params.assessmentId,
        attemptId: params.attemptId,
        projectId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.submission) {
        submission = data.submission as CodingLabSubmissionRecord;
      }
    } else if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 409) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Submission rejected by assessment server.');
    }
  } catch (err) {
    // Re-throw authoritative rejections; only fall back on network/404 when Functions aren't mounted locally
    if (err instanceof Error && !err.message.toLowerCase().includes('fetch')) {
      throw err;
    }
  }

  // Step 3: Local preview fallback when Netlify Functions are unavailable
  if (!submission) {
    const gradingMethod = params.codingConfig?.gradingMethod || 'automatic';
    const rubricCriteria = params.codingConfig?.rubricCriteria || [];
    const autoResult =
      gradingMethod === 'automatic' || gradingMethod === 'hybrid'
        ? gradeScratchProject(saveResult.projectJson, rubricCriteria)
        : null;
    const maxScore =
      Number(params.maxScore || 0) > 0
        ? Number(params.maxScore)
        : autoResult && autoResult.maxAutomaticScore > 0
        ? autoResult.maxAutomaticScore
        : 100;
    const isAutoOnly = gradingMethod === 'automatic' && rubricCriteria.length > 0;
    const finalScore = isAutoOnly ? autoResult!.automaticScore : null;
    const percentage = finalScore !== null ? calculateScorePercentage(finalScore, maxScore) : null;
    const releaseImmediately =
      isAutoOnly && String(params.releaseGradesPolicy || 'immediate').toLowerCase() !== 'manual';

    const submittedIso = new Date().toISOString();
    const submissionId = `clsub_${params.attemptId}`;
    const batch = writeBatch(db);

    batch.update(doc(db, 'codingLabProjects', projectId), {
      status: 'submitted',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    submission = {
      id: submissionId,
      projectId,
      assessmentId: params.assessmentId,
      learnerUid: params.ownerUid,
      learnerName: params.learnerName,
      schoolId: params.schoolId || '',
      attemptId: params.attemptId,
      projectRevision: saveResult.revision,
      submittedAt: submittedIso,
      submissionHash: saveResult.payloadHash,
      gradingMethod,
      gradingStatus: isAutoOnly ? 'auto_graded' : 'pending_manual_review',
      automaticScore: autoResult ? autoResult.automaticScore : null,
      maxAutomaticScore: autoResult?.maxAutomaticScore ?? 0,
      manualScore: null,
      finalScore,
      maxScore,
      percentage,
      criterionResults: autoResult?.criterionResults || [],
      summaryMetrics: autoResult?.summaryMetrics,
      tutorFeedback: '',
      gradeOverrides: [],
      resultReleased: releaseImmediately,
      releasedAt: releaseImmediately ? submittedIso : null,
      assetManifest: saveResult.assetManifest,
    };

    batch.set(doc(db, 'codingLabSubmissions', submissionId), {
      ...submission,
      createdAt: serverTimestamp(),
    });

    batch.set(
      doc(db, 'jdiExamAttempts', params.attemptId),
      {
        examId: params.assessmentId,
        studentUid: params.ownerUid,
        studentName: params.learnerName,
        schoolId: params.schoolId || '',
        deliveryMode: 'CODING_LAB',
        codingLabProjectId: projectId,
        codingLabSubmissionId: submissionId,
        codingLabSubmissionHash: saveResult.payloadHash,
        codingLabGradingMethod: gradingMethod,
        codingLabAutoScore: submission.automaticScore,
        codingLabCriterionResults: submission.criterionResults || [],
        status: releaseImmediately ? 'released' : isAutoOnly ? 'graded' : 'submitted',
        score: finalScore,
        maxScore,
        percentage,
        autoGraded: isAutoOnly,
        resultReleased: releaseImmediately,
        releasedAt: releaseImmediately ? serverTimestamp() : null,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
  }

  // Clear local recovery draft for this submitted attempt
  await clearLocalDraft(
    buildLocalDraftKey({
      mode: 'assessment',
      ownerUid: params.ownerUid,
      assessmentId: params.assessmentId,
      attemptId: params.attemptId,
    })
  );

  // Notify tutor using existing LMS notification helper (non-blocking)
  if (params.tutorId) {
    void notifyOnClientAssessmentSubmit({
      examId: params.assessmentId,
      examTitle: params.examTitle,
      attemptId: params.attemptId,
      studentName: params.learnerName,
      studentId: params.ownerUid,
      schoolId: params.schoolId,
      tutorId: params.tutorId,
    } as any).catch(() => undefined);
  }

  return submission;
}

/**
 * Loads a Coding Lab submission record + its reconstructed runnable .sb3 project for Tutor/Admin review.
 */
export async function loadCodingLabSubmissionForReview(params: {
  submissionId?: string;
  attemptId?: string;
  projectId?: string;
}): Promise<{
  submission: CodingLabSubmissionRecord | null;
  projectJson: Record<string, any> | null;
  sb3Buffer: ArrayBuffer | null;
}> {
  const subId = params.submissionId || (params.attemptId ? `clsub_${params.attemptId}` : '');
  let submission: CodingLabSubmissionRecord | null = null;
  if (subId) {
    const snap = await getDoc(doc(db, 'codingLabSubmissions', subId));
    if (snap.exists()) {
      submission = { id: snap.id, ...(snap.data() as any) } as CodingLabSubmissionRecord;
    }
  }

  const targetProjectId = params.projectId || submission?.projectId || '';
  if (!targetProjectId) {
    return { submission, projectJson: null, sb3Buffer: null };
  }

  const loaded = await loadAssessmentProjectFromFirestore(targetProjectId);
  return {
    submission,
    projectJson: loaded?.projectJson || null,
    sb3Buffer: loaded?.sb3Buffer || null,
  };
}

/**
 * Saves tutor manual marks, hybrid override (with audit trail), feedback, and optional result release.
 */
export async function saveCodingLabTutorGrade(params: {
  submissionId: string;
  assessmentId: string;
  attemptId?: string;
  manualScore: number;
  finalScore: number;
  maxScore: number;
  tutorFeedback: string;
  overrideReason?: string;
  releaseResult: boolean;
  actorName?: string;
  actorRole?: string;
}): Promise<{ finalScore: number; percentage: number; resultReleased: boolean }> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch('/.netlify/functions/coding-lab-assessment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        action: 'grade_coding_submission',
        submissionId: params.submissionId,
        assessmentId: params.assessmentId,
        manualScore: params.manualScore,
        finalScore: params.finalScore,
        tutorFeedback: params.tutorFeedback,
        overrideReason: params.overrideReason || '',
        releaseResult: params.releaseResult,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        finalScore: Number(data.finalScore ?? params.finalScore),
        percentage: Number(data.percentage ?? calculateScorePercentage(params.finalScore, params.maxScore)),
        resultReleased: Boolean(data.resultReleased),
      };
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to save Coding Lab grade.');
    }
  } catch (err) {
    if (err instanceof Error && !err.message.toLowerCase().includes('fetch')) {
      throw err;
    }
  }

  // Fallback for local dev preview when Netlify Functions are not mounted
  const pct = calculateScorePercentage(params.finalScore, params.maxScore);
  const subRef = doc(db, 'codingLabSubmissions', params.submissionId);
  const snap = await getDoc(subRef);
  const prev = snap.exists() ? (snap.data() as any) : {};
  const existingOverrides = Array.isArray(prev.gradeOverrides) ? prev.gradeOverrides : [];
  const nextOverrides = [
    ...existingOverrides,
    {
      actorUid: auth.currentUser?.uid || 'tutor',
      actorName: params.actorName || auth.currentUser?.displayName || 'Tutor',
      actorRole: params.actorRole || 'TUTOR',
      previousScore: prev.finalScore ?? prev.automaticScore ?? null,
      newScore: params.finalScore,
      reason: params.overrideReason || 'Tutor grading update',
      timestamp: new Date().toISOString(),
    },
  ];

  await updateDoc(subRef, {
    manualScore: params.manualScore,
    finalScore: params.finalScore,
    percentage: pct,
    gradingStatus: 'graded',
    tutorFeedback: params.tutorFeedback,
    gradeOverrides: nextOverrides,
    resultReleased: params.releaseResult || Boolean(prev.resultReleased),
    releasedAt: params.releaseResult ? new Date().toISOString() : prev.releasedAt || null,
  });

  if (params.attemptId) {
    await setDoc(
      doc(db, 'jdiExamAttempts', params.attemptId),
      {
        score: params.finalScore,
        maxScore: params.maxScore,
        percentage: pct,
        tutorFeedback: params.tutorFeedback,
        feedback: params.tutorFeedback,
        status: params.releaseResult ? 'released' : 'graded',
        resultReleased: params.releaseResult,
        ...(params.releaseResult ? { releasedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    finalScore: params.finalScore,
    percentage: pct,
    resultReleased: params.releaseResult,
  };
}

/**
 * Downloads a submitted Coding Lab project as a standard .sb3 archive for offline tutor inspection.
 */
export async function downloadSubmittedCodingLabSb3(params: {
  sb3Buffer: ArrayBuffer;
  learnerName?: string;
  assessmentTitle?: string;
}): Promise<void> {
  const filename = `${params.learnerName || 'learner'}-${params.assessmentTitle || 'coding-submission'}`;
  downloadSb3File(params.sb3Buffer, filename);
}
