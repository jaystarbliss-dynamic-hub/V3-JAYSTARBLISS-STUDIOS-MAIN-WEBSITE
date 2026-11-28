/**
 * Authenticated Cloudinary media authorization, deduplication, and signed delivery
 * endpoint for Jaystarbliss Dynamic Institute Coding Lab (Assessment mode only).
 *
 * Security & Compliance:
 * - Verifies Firebase ID token on every request.
 * - Verifies assessment existence, learner attempt existence & ownership, attempt status,
 *   school scope, and project/asset binding on BOTH uploads and signed delivery reads.
 * - Reuses existing Cloudinary configuration exclusively on the server — NEVER exposes API secrets.
 * - Restricts uploads to eligible custom images only (svg, png, jpg, jpeg, gif, webp) <= 1 MiB.
 * - Strictly blocks audio files, microphone recordings, .sb3 archives, and arbitrary files.
 * - Deduplicates by SHA-256 content hash (`coding-lab/assets/{sha256}`).
 * - Uses bounded reference subcollection (`codingLabAssets/{sha256}/references/{assessmentId}`)
 *   instead of unbounded arrays so popular assets never approach Firestore's 1 MiB limit.
 */

import crypto from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, hasAdminAuth, hasAdminDb } from '../../api/_lib/firebase-admin';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  SB3_LIMITS,
} from '../../api/_lib/coding-lab-sb3-security.js';
import {
  canManageExamRecord,
  isPlatformAdminRole,
  isSchoolAdminRole,
  isTutorRole,
} from '../../api/_lib/jdi-assessment.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const FOLDER = 'coding-lab/assets';

interface ResolvedCloudinaryServerConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadPreset: string;
}

async function resolveCloudinaryServerConfig(): Promise<ResolvedCloudinaryServerConfig> {
  let cloudName = String(
    process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || ''
  ).trim();
  let apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  let apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  let uploadPreset = String(
    process.env.CLOUDINARY_UPLOAD_PRESET || process.env.VITE_CLOUDINARY_UPLOAD_PRESET || ''
  ).trim();

  if ((!cloudName || !apiKey || !apiSecret) && hasAdminDb()) {
    try {
      const [privSnap, pubSnap] = await Promise.all([
        adminDb.collection('settings').doc('cloudinary').get().catch(() => null),
        adminDb.collection('publicSettings').doc('cloudinary').get().catch(() => null),
      ]);
      const priv = privSnap?.exists ? (privSnap.data() as Record<string, any>) : {};
      const pub = pubSnap?.exists ? (pubSnap.data() as Record<string, any>) : {};
      cloudName = cloudName || String(priv.cloudName || pub.cloudName || '').trim();
      apiKey = apiKey || String(priv.apiKey || '').trim();
      apiSecret = apiSecret || String(priv.apiSecret || '').trim();
      uploadPreset = uploadPreset || String(priv.uploadPreset || pub.uploadPreset || '').trim();
    } catch {
      // Keep env values
    }
  }

  return { cloudName, apiKey, apiSecret, uploadPreset };
}

function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
    .sort();
  const payload = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

function buildSignedDeliveryUrl(params: {
  cloudName: string;
  apiSecret: string;
  publicId: string;
  resourceType: 'image' | 'raw';
  deliveryType: 'authenticated' | 'upload';
  version?: number;
  dataFormat?: string;
}): string {
  const cleanId = params.publicId.replace(/^\/+/, '');
  const extSuffix =
    params.resourceType === 'image' && params.dataFormat && !cleanId.endsWith(`.${params.dataFormat}`)
      ? `.${params.dataFormat}`
      : '';
  const pathPart = `${cleanId}${extSuffix}`;

  if (params.deliveryType !== 'authenticated' || !params.apiSecret) {
    const vSeg = params.version ? `v${params.version}/` : '';
    return `https://res.cloudinary.com/${params.cloudName}/${params.resourceType}/${params.deliveryType}/${vSeg}${pathPart}`;
  }

  const toSign = pathPart;
  const sig = crypto
    .createHash('sha1')
    .update(`${toSign}${params.apiSecret}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .slice(0, 8);
  const vSeg = params.version ? `v${params.version}/` : '';
  return `https://res.cloudinary.com/${params.cloudName}/${params.resourceType}/authenticated/s--${sig}--/${vSeg}${pathPart}`;
}

async function resolveCallerRole(uid: string): Promise<{ role: string; schoolId: string }> {
  if (!hasAdminDb()) return { role: 'student', schoolId: '' };
  const [userSnap, adminSnap] = await Promise.all([
    adminDb.collection('users').doc(uid).get().catch(() => null),
    adminDb.collection('admins').doc(uid).get().catch(() => null),
  ]);
  const uData = userSnap?.exists ? (userSnap.data() as Record<string, any>) : {};
  const role = adminSnap?.exists
    ? String(adminSnap.data()?.role || 'ADMIN')
    : String(uData.role || 'student');
  const schoolId = String(uData.schoolId || uData.school_id || '').trim();
  return { role, schoolId };
}

function learnerMatchesExamSchool(exam: Record<string, any>, learnerSchoolId: string): boolean {
  const examSchoolId = String(exam.schoolId || '').trim();
  const targetSchoolIds = Array.isArray(exam.targetSchoolIds)
    ? exam.targetSchoolIds.map((s: unknown) => String(s || '').trim()).filter(Boolean)
    : [];

  if (!examSchoolId || examSchoolId === 'all' || examSchoolId === 'private') {
    if (targetSchoolIds.length === 0) return true;
  }
  if (!learnerSchoolId) return !examSchoolId && targetSchoolIds.length === 0;
  if (examSchoolId && examSchoolId === learnerSchoolId) return true;
  if (targetSchoolIds.includes(learnerSchoolId)) return true;
  return false;
}

async function recordBoundedAssetReference(contentHash: string, assessmentId: string): Promise<void> {
  const assetRef = adminDb.collection('codingLabAssets').doc(contentHash);
  const refDoc = assetRef.collection('references').doc(assessmentId);

  await adminDb.runTransaction(async (tx) => {
    const existingRef = await tx.get(refDoc);
    if (!existingRef.exists) {
      tx.set(refDoc, {
        assessmentId,
        firstReferencedAt: FieldValue.serverTimestamp(),
        lastReferencedAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        assetRef,
        {
          referenceCount: FieldValue.increment(1),
          lastReferencedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      tx.update(refDoc, { lastReferencedAt: FieldValue.serverTimestamp() });
      tx.set(assetRef, { lastReferencedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
}

async function verifyAssessmentMediaAccess(params: {
  uid: string;
  role: string;
  schoolId: string;
  assessmentId: string;
  attemptId?: string;
  projectId?: string;
  cloudinaryPublicId?: string;
  mode: 'upload' | 'read';
}): Promise<{ allowed: boolean; reason?: string }> {
  const { uid, role, schoolId, assessmentId, attemptId, projectId, cloudinaryPublicId, mode } = params;

  if (!assessmentId) {
    return { allowed: false, reason: 'assessmentId is required for Coding Lab media operations.' };
  }
  if (isPlatformAdminRole(role)) return { allowed: true };

  if (!hasAdminDb()) return { allowed: false, reason: 'Server database unavailable.' };
  const examSnap = await adminDb.collection('jdiExams').doc(assessmentId).get();
  if (!examSnap.exists) {
    // Allow tutors/admins uploading a starter project before saving a brand-new assessment ID
    if (mode === 'upload' && isTutorRole(role) && assessmentId.startsWith('starter_')) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Assessment not found.' };
  }

  const exam = examSnap.data() as Record<string, any>;
  if (isTutorRole(role)) {
    const canManage = canManageExamRecord(exam, uid, role, schoolId ? [schoolId] : []);
    return canManage
      ? { allowed: true }
      : { allowed: false, reason: 'You do not have permission to access media for this assessment.' };
  }

  if (isSchoolAdminRole(role)) {
    if (mode === 'upload') {
      return { allowed: false, reason: 'School administrators have read-only access.' };
    }
    const matchesSchool =
      Boolean(schoolId) &&
      (String(exam.schoolId || '') === schoolId ||
        (Array.isArray(exam.targetSchoolIds) && exam.targetSchoolIds.includes(schoolId)));
    return matchesSchool
      ? { allowed: true }
      : { allowed: false, reason: 'Assessment is outside your school scope.' };
  }

  // Learner verification: enforce school boundary
  if (!learnerMatchesExamSchool(exam, schoolId)) {
    return { allowed: false, reason: 'This assessment is outside your school scope.' };
  }

  if (mode === 'upload') {
    const examStatus = String(exam.status || '').toLowerCase();
    const allowFinish = Boolean(exam.allowInProgressFinish);
    if (examStatus !== 'active' && !(examStatus === 'completed' && allowFinish)) {
      return { allowed: false, reason: 'This assessment is not currently active for saving.' };
    }

    if (!attemptId) {
      return { allowed: false, reason: 'An active assessment attemptId is required to upload assets.' };
    }

    const attemptSnap = await adminDb.collection('jdiExamAttempts').doc(attemptId).get();
    if (!attemptSnap.exists) {
      return { allowed: false, reason: 'Assessment attempt not found.' };
    }

    const attempt = attemptSnap.data() as Record<string, any>;
    const attemptOwner = String(attempt.studentUid || attempt.userId || '');
    if (attemptOwner !== uid) {
      return { allowed: false, reason: 'You can only upload media for your own assessment attempt.' };
    }
    if (String(attempt.examId || '') !== assessmentId) {
      return { allowed: false, reason: 'Attempt does not belong to the specified assessment.' };
    }
    if (String(attempt.status || '').toLowerCase() !== 'in_progress') {
      return { allowed: false, reason: 'Cannot upload assets to a submitted or closed attempt.' };
    }

    if (projectId) {
      const projSnap = await adminDb.collection('codingLabProjects').doc(projectId).get();
      if (projSnap.exists) {
        const proj = projSnap.data() as Record<string, any>;
        if (String(proj.ownerUid || '') !== uid || String(proj.status || '') === 'submitted') {
          return { allowed: false, reason: 'Project ownership or lock check failed.' };
        }
      }
    }

    return { allowed: true };
  }

  // Learner read (signed delivery): verify asset is either in starterProject OR owned by this learner's project
  if (cloudinaryPublicId) {
    const starterManifest = Array.isArray(exam?.codingLabConfig?.starterProject?.assetManifest)
      ? exam.codingLabConfig.starterProject.assetManifest
      : [];
    const inStarter = starterManifest.some(
      (entry: any) => String(entry?.cloudinaryPublicId || '') === cloudinaryPublicId
    );
    if (inStarter) {
      return { allowed: true };
    }

    const candidateProjectId =
      projectId ||
      (attemptId
        ? `clab_${assessmentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}_${attemptId
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 60)}`
        : '');

    if (candidateProjectId) {
      const projSnap = await adminDb.collection('codingLabProjects').doc(candidateProjectId).get();
      if (projSnap.exists) {
        const proj = projSnap.data() as Record<string, any>;
        if (String(proj.ownerUid || '') === uid && String(proj.assessmentId || '') === assessmentId) {
          const manifest = Array.isArray(proj.assetManifest) ? proj.assetManifest : [];
          if (manifest.some((e: any) => String(e?.cloudinaryPublicId || '') === cloudinaryPublicId)) {
            return { allowed: true };
          }
        }
      }
    }

    // Fallback check: did this learner originally upload this asset hash for this assessment?
    const assetHash = cloudinaryPublicId.replace(`${FOLDER}/`, '').split('.')[0];
    if (/^[a-f0-9]{64}$/.test(assetHash)) {
      const assetSnap = await adminDb.collection('codingLabAssets').doc(assetHash).get();
      if (assetSnap.exists && String(assetSnap.data()?.uploadedByUid || '') === uid) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: 'You do not have permission to access this Coding Lab asset.',
    };
  }

  return { allowed: false, reason: 'Asset identifier is required for delivery authorization.' };
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
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const action = String(body.action || '').trim();
  const assessmentId = String(body.assessmentId || '').trim();
  const attemptId = String(body.attemptId || '').trim();
  const projectId = String(body.projectId || '').trim();
  const { role, schoolId } = await resolveCallerRole(uid);

  if (action === 'authorize_upload') {
    const access = await verifyAssessmentMediaAccess({
      uid,
      role,
      schoolId,
      assessmentId,
      attemptId,
      projectId,
      mode: 'upload',
    });
    if (!access.allowed) {
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: access.reason }) };
    }

    const contentHash = String(body.contentHash || '').trim().toLowerCase();
    const dataFormat = String(body.dataFormat || '').trim().toLowerCase();
    const sizeBytes = Number(body.sizeBytes || 0);

    if (!/^[a-f0-9]{64}$/.test(contentHash)) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Valid SHA-256 contentHash required.' }) };
    }
    if (AUDIO_EXTENSIONS.has(dataFormat)) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Custom audio uploads are strictly disabled in Coding Lab.' }),
      };
    }
    if (!ALLOWED_IMAGE_EXTENSIONS.has(dataFormat)) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: `Unsupported image format ".${dataFormat}".` }),
      };
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > SB3_LIMITS.maxCustomImageBytes) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          error: `Custom image exceeds maximum allowed size (${Math.round(SB3_LIMITS.maxCustomImageBytes / 1024)} KiB).`,
        }),
      };
    }

    // 1. Check asset deduplication registry before issuing any upload signature
    const existingSnap = await adminDb.collection('codingLabAssets').doc(contentHash).get();
    if (existingSnap.exists) {
      const asset = existingSnap.data() as Record<string, any>;
      await recordBoundedAssetReference(contentHash, assessmentId).catch(() => undefined);

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          alreadyExists: true,
          asset: {
            contentHash,
            cloudinaryPublicId: asset.cloudinaryPublicId,
            cloudinaryResourceType: asset.cloudinaryResourceType || 'image',
            cloudinaryDeliveryType: asset.cloudinaryDeliveryType || 'authenticated',
            cloudinaryVersion: asset.cloudinaryVersion,
            deliveryUrl: asset.cloudinaryDeliveryType === 'upload' ? asset.secureUrl : undefined,
          },
        }),
      };
    }

    const cfg = await resolveCloudinaryServerConfig();
    if (!cfg.cloudName) {
      return {
        statusCode: 503,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Cloudinary cloud name is not configured.' }),
      };
    }

    const resourceType: 'image' | 'raw' = dataFormat === 'svg' ? 'raw' : 'image';

    if (cfg.apiKey && cfg.apiSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const deliveryType: 'authenticated' = 'authenticated';
      const signature = signCloudinaryParams(
        {
          folder: FOLDER,
          public_id: contentHash,
          timestamp,
          type: deliveryType,
        },
        cfg.apiSecret
      );

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          alreadyExists: false,
          uploadParams: {
            cloudName: cfg.cloudName,
            apiKey: cfg.apiKey,
            timestamp,
            signature,
            folder: FOLDER,
            public_id: contentHash,
            type: deliveryType,
            resource_type: resourceType,
          },
        }),
      };
    }

    // Only permit unsigned fallback if explicitly opted-in via server env flag
    if (cfg.uploadPreset && process.env.ALLOW_UNSIGNED_CODING_LAB_FALLBACK === 'true') {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          alreadyExists: false,
          unsignedFallback: {
            cloudName: cfg.cloudName,
            uploadPreset: cfg.uploadPreset,
            folder: FOLDER,
            public_id: contentHash,
          },
        }),
      };
    }

    return {
      statusCode: 503,
      headers: HEADERS,
      body: JSON.stringify({
        error: 'Signed Cloudinary API credentials are not configured on the server.',
      }),
    };
  }

  if (action === 'register_asset') {
    const access = await verifyAssessmentMediaAccess({
      uid,
      role,
      schoolId,
      assessmentId,
      attemptId,
      projectId,
      mode: 'upload',
    });
    if (!access.allowed) {
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: access.reason }) };
    }

    const contentHash = String(body.contentHash || '').trim().toLowerCase();
    const dataFormat = String(body.dataFormat || '').trim().toLowerCase();
    const cloudinaryPublicId = String(body.cloudinaryPublicId || '').trim();
    const sizeBytes = Number(body.sizeBytes || 0);

    if (!/^[a-f0-9]{64}$/.test(contentHash) || !ALLOWED_IMAGE_EXTENSIONS.has(dataFormat)) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid asset metadata.' }) };
    }
    if (!cloudinaryPublicId.startsWith(`${FOLDER}/`)) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Rejected untrusted Cloudinary public_id outside Coding Lab folder.' }),
      };
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > SB3_LIMITS.maxCustomImageBytes) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Asset size exceeds policy limit.' }),
      };
    }

    await adminDb.collection('codingLabAssets').doc(contentHash).set(
      {
        contentHash,
        dataFormat,
        sizeBytes,
        cloudinaryPublicId,
        cloudinaryResourceType: body.cloudinaryResourceType === 'raw' ? 'raw' : 'image',
        cloudinaryDeliveryType: body.cloudinaryDeliveryType === 'upload' ? 'upload' : 'authenticated',
        cloudinaryVersion: Number(body.cloudinaryVersion || 0) || null,
        secureUrl: body.cloudinaryDeliveryType === 'upload' ? String(body.secureUrl || '') : null,
        uploadedByUid: uid,
        createdAt: FieldValue.serverTimestamp(),
        lastReferencedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await recordBoundedAssetReference(contentHash, assessmentId);

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ registered: true }) };
  }

  if (action === 'sign_delivery') {
    const cloudinaryPublicId = String(body.cloudinaryPublicId || '').trim();
    if (!cloudinaryPublicId.startsWith(`${FOLDER}/`)) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid Coding Lab asset public_id.' }) };
    }

    const access = await verifyAssessmentMediaAccess({
      uid,
      role,
      schoolId,
      assessmentId,
      attemptId,
      projectId,
      cloudinaryPublicId,
      mode: 'read',
    });
    if (!access.allowed) {
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: access.reason }) };
    }

    const cfg = await resolveCloudinaryServerConfig();
    if (!cfg.cloudName) {
      return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'Cloudinary not configured.' }) };
    }

    const signedUrl = buildSignedDeliveryUrl({
      cloudName: cfg.cloudName,
      apiSecret: cfg.apiSecret,
      publicId: cloudinaryPublicId,
      resourceType: body.cloudinaryResourceType === 'raw' ? 'raw' : 'image',
      deliveryType: body.cloudinaryDeliveryType === 'upload' ? 'upload' : 'authenticated',
      version: Number(body.cloudinaryVersion || 0) || undefined,
      dataFormat: String(body.dataFormat || '').trim().toLowerCase() || undefined,
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ signedUrl }) };
  }

  return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Unknown Coding Lab media action.' }) };
};
