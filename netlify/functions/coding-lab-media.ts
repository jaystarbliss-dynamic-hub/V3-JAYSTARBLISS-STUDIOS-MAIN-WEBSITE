/**
 * Authenticated Cloudinary media authorization, deduplication, and signed delivery
 * endpoint for Jaystarbliss Dynamic Institute Coding Lab (Assessment mode only).
 *
 * Security & Compliance:
 * - Verifies Firebase ID token on every request.
 * - Reuses existing Cloudinary configuration (env vars or Firestore `settings/cloudinary`)
 *   exclusively on the server — NEVER exposes API secrets to the client.
 * - Restricts uploads to eligible custom images only (svg, png, jpg, jpeg, gif, webp) <= 1 MiB.
 * - Strictly blocks audio files, microphone recordings, .sb3 archives, and arbitrary files.
 * - Deduplicates by SHA-256 content hash (`coding-lab/assets/{sha256}`).
 * - Uses opaque asset/assessment identifiers with zero learner PII in Cloudinary metadata.
 * - Tracks references in `codingLabAssets/{sha256}` for reference-aware cleanup.
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

  // Cloudinary URL signature: first 8 bytes of SHA-1(toSign + apiSecret) in URL-safe base64
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
  const schoolId = String(uData.schoolId || '').trim();
  return { role, schoolId };
}

async function verifyAssessmentMediaAccess(
  uid: string,
  role: string,
  schoolId: string,
  assessmentId: string,
  mode: 'upload' | 'read'
): Promise<{ allowed: boolean; reason?: string }> {
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
    if (mode === 'upload') return { allowed: false, reason: 'School administrators have read-only access.' };
    const matchesSchool =
      Boolean(schoolId) &&
      (String(exam.schoolId || '') === schoolId ||
        (Array.isArray(exam.targetSchoolIds) && exam.targetSchoolIds.includes(schoolId)));
    return matchesSchool
      ? { allowed: true }
      : { allowed: false, reason: 'Assessment is outside your school scope.' };
  }

  // Learner access: for upload, assessment must be active
  if (mode === 'upload' && String(exam.status || '').toLowerCase() !== 'active') {
    return { allowed: false, reason: 'This assessment is not currently active for saving.' };
  }

  return { allowed: true };
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
  const { role, schoolId } = await resolveCallerRole(uid);

  if (action === 'authorize_upload') {
    const access = await verifyAssessmentMediaAccess(uid, role, schoolId, assessmentId, 'upload');
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
      // Record reference for reference-aware cleanup
      await adminDb
        .collection('codingLabAssets')
        .doc(contentHash)
        .set(
          {
            referencedByAssessmentIds: FieldValue.arrayUnion(assessmentId),
            lastReferencedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => undefined);

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

    if (cfg.uploadPreset) {
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
        error: 'Cloudinary API credentials or upload preset are not configured.',
      }),
    };
  }

  if (action === 'register_asset') {
    const access = await verifyAssessmentMediaAccess(uid, role, schoolId, assessmentId, 'upload');
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
        uploadedByUid: uid, // Opaque UID only — no personal names, emails, or phone numbers
        referencedByAssessmentIds: FieldValue.arrayUnion(assessmentId),
        createdAt: FieldValue.serverTimestamp(),
        lastReferencedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ registered: true }) };
  }

  if (action === 'sign_delivery') {
    const access = await verifyAssessmentMediaAccess(uid, role, schoolId, assessmentId, 'read');
    if (!access.allowed) {
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: access.reason }) };
    }

    const cloudinaryPublicId = String(body.cloudinaryPublicId || '').trim();
    if (!cloudinaryPublicId.startsWith(`${FOLDER}/`)) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid Coding Lab asset public_id.' }) };
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
