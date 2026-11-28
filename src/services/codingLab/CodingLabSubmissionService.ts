/**
 * CodingLabSubmissionService — coordinates authoritative immutable assessment submission,
 * tutor submission inspection, manual/hybrid grading with override audit logs,
 * and .sb3 download for tutors.
 *
 * Production security guarantees:
 * - Server endpoint `/.netlify/functions/coding-lab-assessment` is authoritative in production.
 * - Browser-side auto-grading / direct Firestore submission fallback is disabled in production
 *   and strictly gated behind `CODING_LAB_CONFIG.allowDevClientSubmissionFallback` for local dev.
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
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
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
 * 1. Saves latest project JSON & custom images to Firestore/Cloudinary (idempotent if already saved).
 * 2. Calls authoritative `/.netlify/functions/coding-lab-assessment` to verify ownership & integrity,
 *    compute structural rubric grade server-side, atomically freeze the project, and sync `jdiExamAttempts`.
 * 3. Only allows dev/emulator fallback when explicitly enabled via `VITE_CODING_LAB_ALLOW_DEV_CLIENT_SUBMISSION=true`.
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
  existingChunkHashes?: string[];
  lastSavedCompositeHash?: string | null;
  expiredAutoSubmit?: boolean;
  onStageChange?: (stage: 'uploading_assets' | 'saving_lms') => void;
}): Promise<CodingLabSubmissionRecord> {
  const projectId = buildAssessmentProjectId(params.assessmentId, params.attemptId);

  // Step 1: Ensure latest changes are durably saved to Firestore/Cloudinary first (idempotent if unchanged)
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
    existingChunkHashes: params.existingChunkHashes,
    lastSavedCompositeHash: params.lastSavedCompositeHash ?? null,
    onStageChange: params.onStageChange,
  });

  // Step 2: Submit via server-verified Netlify Function (authoritative in production)
  let submission: CodingLabSubmissionRecord | null = null;
  let networkOrNotFound = false;

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
        expectedPayloadHash: saveResult.payloadHash,
        expiredAutoSubmit: Boolean(params.expiredAutoSubmit),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.submission) {
        submission = data.submission as CodingLabSubmissionRecord;
      } else {
        throw new Error('Assessment server returned an incomplete submission confirmation.');
      }
    } else if (res.status === 404 && CODING_LAB_CONFIG.allowDevClientSubmissionFallback) {
      networkOrNotFound = true;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(
        errData.error ||
          `Submission could not be verified by the assessment server (${res.status}). Your project remains saved safely on this device—please retry.`
      );
    }
  } catch (err) {
    if (
      CODING_LAB_CONFIG.allowDevClientSubmissionFallback &&
      err instanceof TypeError
    ) {
      networkOrNotFound = true;
    } else {
      throw err instanceof Error
        ? err
        : new Error('Unable to reach the assessment server. Your work is saved locally—please retry.');
    }
  }

  // Step 3: Explicit local-dev-only fallback (NEVER runs in production builds)
  if (!submission && networkOrNotFound && CODING_LAB_CONFIG.allowDevClientSubmissionFallback) {
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

  if (!submission) {
    throw new Error(
      'Assessment submission could not be confirmed by the server. Your local backup is safe—please retry.'
    );
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
  let devFallback = false;

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
        percentage: Number(
          data.percentage ?? calculateScorePercentage(params.finalScore, params.maxScore)
        ),
        resultReleased: Boolean(data.resultReleased),
      };
    }
    if (res.status === 404 && CODING_LAB_CONFIG.allowDevClientSubmissionFallback) {
      devFallback = true;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to save Coding Lab grade (${res.status}).`);
    }
  } catch (err) {
    if (CODING_LAB_CONFIG.allowDevClientSubmissionFallback && err instanceof TypeError) {
      devFallback = true;
    } else {
      throw err instanceof Error ? err : new Error('Unable to save grade right now.');
    }
  }

  if (!devFallback) {
    throw new Error('Failed to save Coding Lab grade on server.');
  }

  // Explicit local dev fallback
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
