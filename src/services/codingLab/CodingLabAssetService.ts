/**
 * CodingLabAssetService — manages eligible learner-created custom image assets
 * in Assessment mode via the existing Cloudinary configuration and authenticated
 * Netlify Function (/.netlify/functions/coding-lab-media).
 *
 * Strict compliance & security guarantees:
 * - NEVER called in Playground / Project Showcase mode.
 * - NEVER uploads audio files, .sb3 archives, or project.json.
 * - NEVER exposes Cloudinary API secrets on the client.
 * - NEVER silently falls back to unsigned Cloudinary presets in production.
 * - Strictly verifies server-side `register_asset` success before accepting an upload.
 * - Deduplicates images by SHA-256 content hash (`coding-lab/assets/{sha256}`).
 * - Uses bounded concurrency with exponential backoff + jitter for transient failures only.
 */

import { auth } from '../../lib/firebase';
import { getCloudinaryConfig } from '../../lib/cloudinary';
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
import type { CodingLabAssetManifestEntry } from '../../types/codingLab';
import type { ExtractedCustomImageAsset } from './ScratchProjectAdapter';

// Session-level deduplication cache keyed by SHA-256 content hash
const uploadedAssetCache = new Map<string, CodingLabAssetManifestEntry>();
const resolvedAssetBytesCache = new Map<string, Uint8Array>();

interface SignedUploadAuthResponse {
  alreadyExists?: boolean;
  asset?: {
    contentHash: string;
    cloudinaryPublicId: string;
    cloudinaryResourceType: 'image' | 'raw';
    cloudinaryDeliveryType: 'authenticated' | 'upload';
    cloudinaryVersion?: number;
    deliveryUrl?: string;
  };
  uploadParams?: {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder: string;
    public_id: string;
    type: 'authenticated' | 'upload';
    resource_type: 'image' | 'raw';
  };
  unsignedFallback?: {
    cloudName: string;
    uploadPreset: string;
    folder: string;
    public_id: string;
  };
  error?: string;
}

class NonRetryableAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableAssetError';
  }
}

function getMimeTypeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function retryTransient<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof NonRetryableAssetError || attempt >= maxAttempts) {
        throw err;
      }
      const baseDelay = Math.min(4000, 400 * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Custom image sync failed.');
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Uploads only new/unknown custom learner-created image assets for an assessment project.
 * Already-known assets (in session cache, existing manifest, or Cloudinary asset registry)
 * are reused without re-uploading.
 */
export async function syncAssessmentCustomImages(params: {
  assessmentId: string;
  attemptId?: string;
  projectId?: string;
  customImages: ExtractedCustomImageAsset[];
  existingManifest?: CodingLabAssetManifestEntry[];
}): Promise<CodingLabAssetManifestEntry[]> {
  if (!params.customImages.length) return [];

  const existingByHash = new Map<string, CodingLabAssetManifestEntry>();
  for (const entry of params.existingManifest || []) {
    if (entry.contentHash && entry.cloudinaryPublicId) {
      existingByHash.set(entry.contentHash, entry);
      uploadedAssetCache.set(entry.contentHash, entry);
    }
  }

  const authHeaders = await getAuthHeader();

  return runWithConcurrency(
    params.customImages,
    CODING_LAB_CONFIG.assetUploadConcurrency,
    async (img): Promise<CodingLabAssetManifestEntry> => {
      // Cache local bytes for instant round-trip reopen without extra network fetches
      resolvedAssetBytesCache.set(img.contentHash, img.bytes);

      // 1. Reuse if already uploaded and referenced
      const known = existingByHash.get(img.contentHash) || uploadedAssetCache.get(img.contentHash);
      if (known && known.cloudinaryPublicId) {
        return {
          ...known,
          scratchAssetId: img.scratchAssetId,
          md5ext: img.md5ext,
          dataFormat: img.dataFormat,
          assetCategory: 'custom_image',
          contentHash: img.contentHash,
          sizeBytes: img.sizeBytes,
        };
      }

      // 2. Request backend signed upload authorization (strictly verified in production)
      return retryTransient(async () => {
        let signRes: Response;
        try {
          signRes = await fetch('/.netlify/functions/coding-lab-media', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            body: JSON.stringify({
              action: 'authorize_upload',
              assessmentId: params.assessmentId,
              attemptId: params.attemptId || '',
              projectId: params.projectId || '',
              contentHash: img.contentHash,
              dataFormat: img.dataFormat,
              sizeBytes: img.sizeBytes,
              scratchAssetId: img.scratchAssetId,
            }),
          });
        } catch (networkErr) {
          if (CODING_LAB_CONFIG.allowDevUnsignedCloudinaryFallback) {
            return await uploadViaDevUnsignedPreset(img);
          }
          throw networkErr;
        }

        if (!signRes.ok) {
          const errBody = await signRes.json().catch(() => ({}));
          const errMessage =
            errBody?.error ||
            `Media authorization failed (${signRes.status}). Your changes remain saved on this device.`;

          if (signRes.status === 404 && CODING_LAB_CONFIG.allowDevUnsignedCloudinaryFallback) {
            return await uploadViaDevUnsignedPreset(img);
          }

          if (signRes.status >= 400 && signRes.status < 500 && signRes.status !== 429) {
            throw new NonRetryableAssetError(errMessage);
          }
          throw new Error(errMessage);
        }

        const signData = (await signRes.json()) as SignedUploadAuthResponse;

        if (signData.alreadyExists && signData.asset) {
          const entry: CodingLabAssetManifestEntry = {
            scratchAssetId: img.scratchAssetId,
            md5ext: img.md5ext,
            dataFormat: img.dataFormat,
            assetCategory: 'custom_image',
            contentHash: img.contentHash,
            cloudinaryPublicId: signData.asset.cloudinaryPublicId,
            cloudinaryResourceType: signData.asset.cloudinaryResourceType,
            cloudinaryDeliveryType: signData.asset.cloudinaryDeliveryType,
            cloudinaryVersion: signData.asset.cloudinaryVersion,
            deliveryUrl: signData.asset.deliveryUrl,
            sizeBytes: img.sizeBytes,
          };
          uploadedAssetCache.set(img.contentHash, entry);
          return entry;
        }

        if (signData.uploadParams) {
          const p = signData.uploadParams;
          const formData = new FormData();
          const blob = new Blob([new Uint8Array(img.bytes)], {
            type: getMimeTypeForExtension(img.dataFormat),
          });
          formData.append('file', blob, img.md5ext);
          formData.append('api_key', p.apiKey);
          formData.append('timestamp', String(p.timestamp));
          formData.append('signature', p.signature);
          formData.append('folder', p.folder);
          formData.append('public_id', p.public_id);
          formData.append('type', p.type);

          const uploadUrl = `https://api.cloudinary.com/v1_1/${p.cloudName}/${p.resource_type}/upload`;
          const upRes = await fetch(uploadUrl, { method: 'POST', body: formData });
          if (!upRes.ok) {
            const errText = await upRes.text().catch(() => '');
            const msg = `Cloudinary asset upload failed (${upRes.status}): ${errText.slice(0, 140)}`;
            if (upRes.status >= 400 && upRes.status < 500 && upRes.status !== 429) {
              throw new NonRetryableAssetError(msg);
            }
            throw new Error(msg);
          }
          const upJson = await upRes.json();

          // Strictly verify server-side registration — NEVER swallow registration failures
          const regRes = await fetch('/.netlify/functions/coding-lab-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              action: 'register_asset',
              assessmentId: params.assessmentId,
              attemptId: params.attemptId || '',
              projectId: params.projectId || '',
              contentHash: img.contentHash,
              dataFormat: img.dataFormat,
              sizeBytes: img.sizeBytes,
              cloudinaryPublicId: upJson.public_id,
              cloudinaryResourceType: p.resource_type,
              cloudinaryDeliveryType: p.type,
              cloudinaryVersion: upJson.version,
              secureUrl: p.type === 'upload' ? upJson.secure_url : undefined,
            }),
          });

          if (!regRes.ok) {
            const regErr = await regRes.json().catch(() => ({}));
            const regMsg =
              regErr?.error ||
              `Failed to register uploaded asset (${regRes.status}). Please retry saving.`;
            if (regRes.status >= 400 && regRes.status < 500 && regRes.status !== 429) {
              throw new NonRetryableAssetError(regMsg);
            }
            throw new Error(regMsg);
          }

          const entry: CodingLabAssetManifestEntry = {
            scratchAssetId: img.scratchAssetId,
            md5ext: img.md5ext,
            dataFormat: img.dataFormat,
            assetCategory: 'custom_image',
            contentHash: img.contentHash,
            cloudinaryPublicId: upJson.public_id,
            cloudinaryResourceType: p.resource_type,
            cloudinaryDeliveryType: p.type,
            cloudinaryVersion: upJson.version,
            deliveryUrl: p.type === 'upload' ? upJson.secure_url : undefined,
            sizeBytes: img.sizeBytes,
          };
          uploadedAssetCache.set(img.contentHash, entry);
          return entry;
        }

        if (signData.unsignedFallback && CODING_LAB_CONFIG.allowDevUnsignedCloudinaryFallback) {
          const u = signData.unsignedFallback;
          const entry = await uploadViaExistingUnsignedPreset(img, u.cloudName, u.uploadPreset);
          uploadedAssetCache.set(img.contentHash, entry);
          return entry;
        }

        throw new NonRetryableAssetError(
          'Signed Cloudinary upload credentials are required on the server for Coding Lab assessments.'
        );
      });
    }
  );
}

async function uploadViaDevUnsignedPreset(
  img: ExtractedCustomImageAsset
): Promise<CodingLabAssetManifestEntry> {
  const { cloudName, uploadPreset } = await getCloudinaryConfig();
  if (!cloudName || !uploadPreset) {
    throw new NonRetryableAssetError(
      'Dev unsigned Cloudinary fallback enabled, but cloudName/uploadPreset are not configured.'
    );
  }
  const entry = await uploadViaExistingUnsignedPreset(img, cloudName, uploadPreset);
  uploadedAssetCache.set(img.contentHash, entry);
  return entry;
}

async function uploadViaExistingUnsignedPreset(
  img: ExtractedCustomImageAsset,
  cloudName: string,
  uploadPreset: string
): Promise<CodingLabAssetManifestEntry> {
  const resourceType: 'image' | 'raw' = img.dataFormat === 'svg' ? 'raw' : 'image';
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(img.bytes)], {
    type: getMimeTypeForExtension(img.dataFormat),
  });
  formData.append('file', blob, img.md5ext);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', CODING_LAB_CONFIG.cloudinaryFolder);

  const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!upRes.ok) {
    throw new Error(`Failed to upload custom image asset (${img.md5ext}) to Cloudinary.`);
  }
  const upJson = await upRes.json();
  return {
    scratchAssetId: img.scratchAssetId,
    md5ext: img.md5ext,
    dataFormat: img.dataFormat,
    assetCategory: 'custom_image',
    contentHash: img.contentHash,
    cloudinaryPublicId: upJson.public_id,
    cloudinaryResourceType: resourceType,
    cloudinaryDeliveryType: 'upload',
    cloudinaryVersion: upJson.version,
    deliveryUrl: upJson.secure_url,
    sizeBytes: img.sizeBytes,
  };
}

/**
 * Resolves original source image bytes for a custom asset manifest entry
 * when reopening a saved assessment project or tutor submission.
 */
export async function resolveCustomAssetBytes(
  entry: CodingLabAssetManifestEntry,
  assessmentId?: string,
  context?: { attemptId?: string; projectId?: string }
): Promise<Uint8Array | null> {
  if (entry.contentHash && resolvedAssetBytesCache.has(entry.contentHash)) {
    return resolvedAssetBytesCache.get(entry.contentHash) || null;
  }

  let fetchUrl = entry.deliveryUrl || '';

  // For authenticated Cloudinary assets (or when no direct URL is stored), obtain a short-lived signed URL
  if (!fetchUrl || entry.cloudinaryDeliveryType === 'authenticated') {
    try {
      const authHeaders = await getAuthHeader();
      const res = await fetch('/.netlify/functions/coding-lab-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'sign_delivery',
          assessmentId: assessmentId || '',
          attemptId: context?.attemptId || '',
          projectId: context?.projectId || '',
          contentHash: entry.contentHash || '',
          cloudinaryPublicId: entry.cloudinaryPublicId,
          cloudinaryResourceType: entry.cloudinaryResourceType || 'image',
          cloudinaryDeliveryType: entry.cloudinaryDeliveryType || 'authenticated',
          cloudinaryVersion: entry.cloudinaryVersion,
          dataFormat: entry.dataFormat,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.signedUrl) fetchUrl = data.signedUrl;
      }
    } catch {
      // Fall back to deliveryUrl if present
    }
  }

  if (!fetchUrl) return null;

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (entry.contentHash) {
      resolvedAssetBytesCache.set(entry.contentHash, bytes);
    }
    return bytes;
  } catch {
    return null;
  }
}
