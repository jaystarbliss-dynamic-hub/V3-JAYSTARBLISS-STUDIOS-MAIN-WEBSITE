/**
 * Server-verified Coding Lab assessment submission, structural auto-grading,
 * and tutor manual/hybrid grading + override audit trail endpoint.
 *
 * Security guarantees:
 * - Verifies Firebase ID token on every request.
 * - Verifies assessment is active before accepting learner submission.
 * - Reads compressed project JSON directly from Firestore (`codingLabProjects/{projectId}` + chunks),
 *   verifies SHA-256 hash, decompresses server-side, and computes automatic structural grade
 *   exclusively on the server (NEVER trusts client-supplied scores).
 * - Freezes the submitted project revision (`status: 'submitted'`) and creates an immutable
 *   `codingLabSubmissions/{submissionId}` record linked to `jdiExamAttempts/{attemptId}`.
 * - Enforces tutor/admin authorization via `canManageExamRecord` before recording manual grades
 *   or overrides, logging full override history.
 */

import zlib from 'node:zlib';
import crypto from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, hasAdminAuth, hasAdminDb } from '../../api/_lib/firebase-admin';
import { gradeScratchProject } from '../../api/_lib/coding-lab-grader.js';
import {
  calculateScorePercentage,
  canManageExamRecord,
  isPlatformAdminRole,
  isTutorRole,
} from '../../api/_lib/jdi-assessment.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function toBuffer(val: any): Buffer | null {
  if (!val) return null;
  if (Buffer.isBuffer(val)) return val;
  if (val instanceof Uint8Array) return Buffer.from(val);
  if (typeof val.toUint8Array === 'function') return Buffer.from(val.toUint8Array());
  if (typeof val === 'string') return Buffer.from(val, 'base64');
  return null;
}

async function loadAndVerifyProjectJsonServer(projectId: string) {
  const projectRef = adminDb.collection('codingLabProjects').doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    throw new Error('Saved Coding Lab project not found. Please save your progress before submitting.');
  }

  const data = projectSnap.data() as Record<string, any>;
  let compressedBuf: Buffer | null = null;

  if (data.payloadStorageMode === 'chunked' || (!data.payloadBytes && Number(data.chunkCount || 0) > 0)) {
    const chunksSnap = await projectRef.collection('payloadChunks').get();
    const ordered = chunksSnap.docs
      .map((d) => ({
        index: Number(d.data().chunkIndex ?? d.id),
        buf: toBuffer(d.data().payloadBytes),
      }))
      .filter((c): c is { index: number; buf: Buffer } => c.buf !== null)
      .sort((a, b) => a.index - b.index);

    if (ordered.length !== Number(data.chunkCount || ordered.length)) {
      throw new Error('Project payload chunks are incomplete. Please retry saving before submitting.');
    }
    compressedBuf = Buffer.concat(ordered.map((c) => c.buf));
  } else {
    compressedBuf = toBuffer(data.payloadBytes);
  }

  if (!compressedBuf || compressedBuf.byteLength === 0) {
    throw new Error('Stored Coding Lab project payload is empty.');
  }

  const actualHash = crypto.createHash('sha256').update(compressedBuf).digest('hex');
  if (data.payloadHash && actualHash !== data.payloadHash) {
    throw new Error('Project payload integrity hash verification failed.');
  }

  const rawJsonBuf =
    data.payloadCompression === 'gzip' ? zlib.gunzipSync(compressedBuf) : compressedBuf;
  const projectJson = JSON.parse(rawJsonBuf.toString('utf8'));

  return {
    projectRef,
    projectData: data,
    projectJson,
    verifiedHash: actualHash,
  };
}

async function resolveCallerProfile(uid: string) {
  const [userSnap, adminSnap] = await Promise.all([
    adminDb.collection('users').doc(uid).get().catch(() => null),
    adminDb.collection('admins').doc(uid).get().catch(() => null),
  ]);
  const uData = userSnap?.exists ? (userSnap.data() as Record<string, any>) : {};
  const role = adminSnap?.exists
    ? String(adminSnap.data()?.role || 'ADMIN')
    : String(uData.role || 'student');
  const name = String(uData.fullName || uData.name || uData.displayName || 'User');
  const schoolId = String(uData.schoolId || '').trim();
  return { role, name, schoolId };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  if (!hasAdminAuth() || !hasAdminDb()) {
    return {
      statusCode: 503,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Firebase Admin SDK is not configured on this server.' }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Authentication required.' }) };
  }

  let uid = '';
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Invalid or expired auth token.' }) };
  }

  let body: Record<string, any> = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON request body.' }) };
  }

  const action = String(body.action || '').trim();
  const caller = await resolveCallerProfile(uid);

  // =========================================================================
  // ACTION 1: LEARNER SUBMITS CODING LAB ASSESSMENT (IMMUTABLE SNAPSHOT)
  // =========================================================================
  if (action === 'submit_coding_assessment') {
    const assessmentId = String(body.assessmentId || '').trim();
    const attemptId = String(body.attemptId || '').trim();
    const projectId = String(body.projectId || '').trim();

    if (!assessmentId || !attemptId || !projectId) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: 'assessmentId, attemptId, and projectId are required.' }),
      };
    }

    const [examSnap, attemptSnap] = await Promise.all([
      adminDb.collection('jdiExams').doc(assessmentId).get(),
      adminDb.collection('jdiExamAttempts').doc(attemptId).get(),
    ]);

    if (!examSnap.exists) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Assessment not found.' }) };
    }
    const exam = examSnap.data() as Record<string, any>;

    // Server-side verification that assessment is open/active
    const examStatus = String(exam.status || '').toLowerCase();
    const allowFinish = Boolean(exam.allowInProgressFinish);
    if (examStatus !== 'active' && !(examStatus === 'completed' && allowFinish && attemptSnap.exists)) {
      return {
        statusCode: 403,
        headers: HEADERS,
        body: JSON.stringify({
          error: 'This assessment is currently closed and cannot accept new submissions.',
        }),
      };
    }

    const attemptData = attemptSnap.exists ? (attemptSnap.data() as Record<string, any>) : null;
    if (attemptData) {
      const attemptOwner = String(attemptData.studentUid || attemptData.userId || '');
      if (attemptOwner && attemptOwner !== uid) {
        return {
          statusCode: 403,
          headers: HEADERS,
          body: JSON.stringify({ error: 'You cannot submit another learner’s attempt.' }),
        };
      }
      if (['submitted', 'graded', 'released'].includes(String(attemptData.status || '').toLowerCase())) {
        return {
          statusCode: 409,
          headers: HEADERS,
          body: JSON.stringify({ error: 'This attempt has already been submitted.' }),
        };
      }
    }

    let loaded;
    try {
      loaded = await loadAndVerifyProjectJsonServer(projectId);
    } catch (err) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      };
    }

    if (String(loaded.projectData.ownerUid || '') !== uid) {
      return {
        statusCode: 403,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Project ownership verification failed.' }),
      };
    }
    if (String(loaded.projectData.status || '') === 'submitted') {
      return {
        statusCode: 409,
        headers: HEADERS,
        body: JSON.stringify({ error: 'This coding project revision has already been submitted.' }),
      };
    }

    const codingConfig = exam.codingLabConfig || {};
    const gradingMethod: 'automatic' | 'manual' | 'hybrid' =
      codingConfig.gradingMethod === 'manual'
        ? 'manual'
        : codingConfig.gradingMethod === 'hybrid'
        ? 'hybrid'
        : 'automatic';

    const rubricCriteria = Array.isArray(codingConfig.rubricCriteria) ? codingConfig.rubricCriteria : [];
    const autoResult =
      gradingMethod === 'automatic' || gradingMethod === 'hybrid'
        ? gradeScratchProject(loaded.projectJson, rubricCriteria)
        : null;

    const configuredMaxScore = Number(exam.maxScore || 0);
    const maxScore =
      configuredMaxScore > 0
        ? configuredMaxScore
        : autoResult && autoResult.maxAutomaticScore > 0
        ? autoResult.maxAutomaticScore
        : 100;

    const automaticScore = autoResult ? autoResult.automaticScore : null;
    const isAutoOnly = gradingMethod === 'automatic' && rubricCriteria.length > 0;
    const finalScore = isAutoOnly ? automaticScore : null;
    const percentage = finalScore !== null ? calculateScorePercentage(finalScore, maxScore) : null;
    const releaseImmediately =
      isAutoOnly && String(exam.releaseGradesPolicy || 'immediate').toLowerCase() !== 'manual';

    const submittedIso = new Date().toISOString();
    const submissionId = `clsub_${attemptId}`;

    const batch = adminDb.batch();

    // 1. Freeze the project snapshot as immutable submitted revision
    batch.update(loaded.projectRef, {
      status: 'submitted',
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 2. Write immutable submission record
    const submissionDoc = {
      id: submissionId,
      projectId,
      assessmentId,
      learnerUid: uid,
      learnerName: String(attemptData?.studentName || caller.name || 'Learner'),
      schoolId: String(attemptData?.schoolId || exam.schoolId || caller.schoolId || ''),
      attemptId,
      attemptNumber: Number(attemptData?.attemptNumber || 1),
      projectRevision: Number(loaded.projectData.revision || 1),
      submittedAt: submittedIso,
      submissionHash: loaded.verifiedHash,
      gradingMethod,
      gradingStatus: isAutoOnly ? 'auto_graded' : 'pending_manual_review',
      automaticScore,
      maxAutomaticScore: autoResult?.maxAutomaticScore ?? 0,
      manualScore: null,
      finalScore,
      maxScore,
      percentage,
      criterionResults: autoResult?.criterionResults || [],
      summaryMetrics: autoResult?.summaryMetrics || null,
      tutorFeedback: '',
      gradeOverrides: [],
      resultReleased: releaseImmediately,
      releasedAt: releaseImmediately ? submittedIso : null,
      assetManifest: Array.isArray(loaded.projectData.assetManifest) ? loaded.projectData.assetManifest : [],
      createdAt: FieldValue.serverTimestamp(),
    };
    batch.set(adminDb.collection('codingLabSubmissions').doc(submissionId), submissionDoc);

    // 3. Synchronize with existing jdiExamAttempts record so Tutor/School/Parent views stay unified
    const attemptStatus = releaseImmediately ? 'released' : isAutoOnly ? 'graded' : 'submitted';
    batch.set(
      adminDb.collection('jdiExamAttempts').doc(attemptId),
      {
        examId: assessmentId,
        studentUid: uid,
        studentName: String(attemptData?.studentName || caller.name || 'Learner'),
        schoolId: String(attemptData?.schoolId || exam.schoolId || caller.schoolId || ''),
        deliveryMode: 'CODING_LAB',
        codingLabProjectId: projectId,
        codingLabSubmissionId: submissionId,
        codingLabSubmissionHash: loaded.verifiedHash,
        codingLabGradingMethod: gradingMethod,
        codingLabAutoScore: automaticScore,
        codingLabCriterionResults: autoResult?.criterionResults || [],
        status: attemptStatus,
        score: finalScore,
        maxScore,
        percentage,
        autoGraded: isAutoOnly,
        resultReleased: releaseImmediately,
        releasedAt: releaseImmediately ? FieldValue.serverTimestamp() : null,
        submittedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        ok: true,
        submission: submissionDoc,
      }),
    };
  }

  // =========================================================================
  // ACTION 2: TUTOR / ADMIN GRADES OR OVERRIDES A CODING LAB SUBMISSION
  // =========================================================================
  if (action === 'grade_coding_submission') {
    if (!isTutorRole(caller.role) && !isPlatformAdminRole(caller.role)) {
      return {
        statusCode: 403,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Only authorized tutors or administrators can grade submissions.' }),
      };
    }

    const submissionId = String(body.submissionId || '').trim();
    const assessmentId = String(body.assessmentId || '').trim();
    if (!submissionId || !assessmentId) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: 'submissionId and assessmentId are required.' }),
      };
    }

    const [examSnap, subSnap] = await Promise.all([
      adminDb.collection('jdiExams').doc(assessmentId).get(),
      adminDb.collection('codingLabSubmissions').doc(submissionId).get(),
    ]);

    if (!examSnap.exists || !subSnap.exists) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Assessment or submission not found.' }) };
    }

    const exam = examSnap.data() as Record<string, any>;
    if (!canManageExamRecord(exam, uid, caller.role, caller.schoolId ? [caller.schoolId] : [])) {
      return {
        statusCode: 403,
        headers: HEADERS,
        body: JSON.stringify({ error: 'You are not authorized to grade submissions for this assessment.' }),
      };
    }

    const existingSub = subSnap.data() as Record<string, any>;
    const maxScore = Math.max(1, Number(existingSub.maxScore || exam.maxScore || 100));
    const manualScore =
      body.manualScore !== undefined && body.manualScore !== null && body.manualScore !== ''
        ? Math.max(0, Math.min(maxScore, Number(body.manualScore)))
        : existingSub.manualScore;
    const requestedFinal =
      body.finalScore !== undefined && body.finalScore !== null && body.finalScore !== ''
        ? Math.max(0, Math.min(maxScore, Number(body.finalScore)))
        : manualScore !== null && manualScore !== undefined
        ? Number(manualScore)
        : Number(existingSub.automaticScore ?? 0);

    if (!Number.isFinite(requestedFinal)) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Provide a valid numeric score.' }) };
    }

    const finalScore = Number(requestedFinal.toFixed(2));
    const percentage = calculateScorePercentage(finalScore, maxScore);
    const tutorFeedback = String(body.tutorFeedback ?? existingSub.tutorFeedback ?? '').trim().slice(0, 4000);
    const overrideReason = String(body.overrideReason || '').trim().slice(0, 600);
    const releaseResult = Boolean(body.releaseResult);

    const existingOverrides = Array.isArray(existingSub.gradeOverrides) ? existingSub.gradeOverrides : [];
    const previousScore =
      existingSub.finalScore !== null && existingSub.finalScore !== undefined
        ? Number(existingSub.finalScore)
        : existingSub.automaticScore !== null && existingSub.automaticScore !== undefined
        ? Number(existingSub.automaticScore)
        : null;

    const nextOverrides = [...existingOverrides];
    if (previousScore !== finalScore || overrideReason) {
      nextOverrides.push({
        actorUid: uid,
        actorName: caller.name,
        actorRole: caller.role,
        previousScore,
        newScore: finalScore,
        reason: overrideReason || 'Tutor grading update',
        timestamp: new Date().toISOString(),
      });
    }

    const releasedAtIso = releaseResult
      ? new Date().toISOString()
      : existingSub.releasedAt || null;

    const batch = adminDb.batch();
    batch.update(adminDb.collection('codingLabSubmissions').doc(submissionId), {
      manualScore: manualScore !== undefined ? manualScore : null,
      finalScore,
      percentage,
      gradingStatus: 'graded',
      tutorFeedback,
      gradeOverrides: nextOverrides,
      resultReleased: releaseResult || Boolean(existingSub.resultReleased),
      releasedAt: releasedAtIso,
      gradedByUid: uid,
      gradedByName: caller.name,
      gradedAt: FieldValue.serverTimestamp(),
    });

    if (existingSub.attemptId) {
      batch.set(
        adminDb.collection('jdiExamAttempts').doc(String(existingSub.attemptId)),
        {
          score: finalScore,
          maxScore,
          percentage,
          tutorFeedback,
          feedback: tutorFeedback,
          status: releaseResult || existingSub.resultReleased ? 'released' : 'graded',
          resultReleased: releaseResult || Boolean(existingSub.resultReleased),
          releasedAt: releaseResult ? FieldValue.serverTimestamp() : undefined,
          gradedByUid: uid,
          gradedByName: caller.name,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        ok: true,
        finalScore,
        percentage,
        resultReleased: releaseResult || Boolean(existingSub.resultReleased),
        gradeOverrides: nextOverrides,
      }),
    };
  }

  return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Unknown Coding Lab assessment action.' }) };
};
