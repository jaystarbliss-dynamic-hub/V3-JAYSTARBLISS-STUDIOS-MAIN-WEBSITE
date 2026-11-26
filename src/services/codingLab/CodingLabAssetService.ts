/**
 * CodingLabAssetService — manages eligible learner-created custom image assets
 * in Assessment mode via the existing Cloudinary configuration and authenticated
 * Netlify Function (/.netlify/functions/coding-lab-media).
 *
 * Strict compliance guarantees:
 * - NEVER called in Playground / Project Showcase mode.
 * - NEVER uploads audio files, .sb3 archives, or project.json.
 * - NEVER exposes Cloudinary API secrets on the client.
 * - Deduplicates images by SHA-256 content hash using deterministic public IDs
 *   (`coding-lab/assets/{sha256}`).
 * - Preserves exact source image bytes (no destructive image transformations).
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

/**
 * Uploads only new/unknown custom learner-created image assets for an assessment project.
 * Already-known assets (in session cache, existing manifest, or Cloudinary asset registry)
 * are reused without re-uploading.
 */
export async function syncAssessmentCustomImages(params: {
  assessmentId: string;
  attemptId?: string;
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
  const results: CodingLabAssetManifestEntry[] = [];

  for (const img of params.customImages) {
    // Cache local bytes for instant round-trip reopen without extra network fetches
    resolvedAssetBytesCache.set(img.contentHash, img.bytes);

    // 1. Reuse if already uploaded and referenced
    const known = existingByHash.get(img.contentHash) || uploadedAssetCache.get(img.contentHash);
    if (known && known.cloudinaryPublicId) {
      results.push({
        ...known,
        scratchAssetId: img.scratchAssetId,
        md5ext: img.md5ext,
        dataFormat: img.dataFormat,
        assetCategory: 'custom_image',
        contentHash: img.contentHash,
        sizeBytes: img.sizeBytes,
      });
      continue;
    }

    // 2. Request backend signed upload authorization (verifies Firebase auth + assessment access + dedup)
    const signRes = await fetch('/.netlify/functions/coding-lab-media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        action: 'authorize_upload',
        assessmentId: params.assessmentId,
        attemptId: params.attemptId || '',
        contentHash: img.contentHash,
        dataFormat: img.dataFormat,
        sizeBytes: img.sizeBytes,
        scratchAssetId: img.scratchAssetId,
      }),
    });

    if (signRes.ok) {
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
        results.push(entry);
        continue;
      }

      if (signData.uploadParams) {
        const p = signData.uploadParams;
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(img.bytes)], { type: getMimeTypeForExtension(img.dataFormat) });
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
          throw new Error(`Cloudinary asset upload failed (${upRes.status}): ${errText.slice(0, 140)}`);
        }
        const upJson = await upRes.json();

        // Register uploaded asset reference server-side for deduplication & ref tracking
        await fetch('/.netlify/functions/coding-lab-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            action: 'register_asset',
            assessmentId: params.assessmentId,
            contentHash: img.contentHash,
            dataFormat: img.dataFormat,
            sizeBytes: img.sizeBytes,
            cloudinaryPublicId: upJson.public_id,
            cloudinaryResourceType: p.resource_type,
            cloudinaryDeliveryType: p.type,
            cloudinaryVersion: upJson.version,
            secureUrl: p.type === 'upload' ? upJson.secure_url : undefined,
          }),
        }).catch(() => undefined);

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
        results.push(entry);
        continue;
      }

      if (signData.unsignedFallback) {
        const u = signData.unsignedFallback;
        const entry = await uploadViaExistingUnsignedPreset(img, u.cloudName, u.uploadPreset);
        uploadedAssetCache.set(img.contentHash, entry);
        results.push(entry);
        continue;
      }
    }

    // 3. Fallback if Netlify Functions are unavailable in local Vite dev preview:
    // reuse existing app-configured Cloudinary preset without duplicating config
    const { cloudName, uploadPreset } = await getCloudinaryConfig();
    if (!cloudName || !uploadPreset) {
      throw new Error(
        'Cloudinary media upload is not configured. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET or Cloudinary settings in Admin.'
      );
    }
    const entry = await uploadViaExistingUnsignedPreset(img, cloudName, uploadPreset);
    uploadedAssetCache.set(img.contentHash, entry);
    results.push(entry);
  }

  return results;
}

async function uploadViaExistingUnsignedPreset(
  img: ExtractedCustomImageAsset,
  cloudName: string,
  uploadPreset: string
): Promise<CodingLabAssetManifestEntry> {
  const resourceType: 'image' | 'raw' = img.dataFormat === 'svg' ? 'raw' : 'image';
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(img.bytes)], { type: getMimeTypeForExtension(img.dataFormat) });
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
  assessmentId?: string
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
