/**
 * CodingLabAssessmentService — manages tutor starter-project preparation
 * and learner assessment workspace hydration without mutating starter projects.
 */

import { compressProjectJson } from '../../../api/_lib/coding-lab-sb3-security.js';
import type { CodingLabStarterProjectConfig } from '../../types/codingLab';
import { parseAndValidateSb3 } from './ScratchProjectAdapter';
import { syncAssessmentCustomImages } from './CodingLabAssetService';

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Validates and prepares a tutor-uploaded starter `.sb3` project for attachment
 * to a Coding Lab assessment configuration.
 * Custom images inside the starter project are deduplicated and persisted via Cloudinary;
 * compressed structured JSON is stored safely as starter project metadata (kept strictly
 * separate from learner attempts).
 */
export async function prepareStarterProjectFromSb3(params: {
  file: File;
  assessmentId?: string;
}): Promise<CodingLabStarterProjectConfig> {
  const buffer = await params.file.arrayBuffer();
  const parsed = await parseAndValidateSb3(buffer, { mode: 'assessment' });
  const compressed = await compressProjectJson(parsed.projectJson);

  if (compressed.sizeBytes > 350 * 1024) {
    throw new Error(
      'Starter project JSON is too large to embed directly (>350 KiB compressed). Simplify the starter project and try again.'
    );
  }

  let customManifest: any[] = [];
  if (parsed.customImageAssets.length > 0) {
    customManifest = await syncAssessmentCustomImages({
      assessmentId: params.assessmentId || `starter_${Date.now()}`,
      customImages: parsed.customImageAssets,
    });
  }

  const assetManifest = [
    ...parsed.builtinImageAssets,
    ...parsed.builtinSoundAssets,
    ...customManifest,
  ];

  return {
    title: params.file.name.replace(/\.sb3$/i, '') || 'Starter Project',
    fileName: params.file.name,
    payloadHash: compressed.hash,
    payloadSize: compressed.sizeBytes,
    payloadCompression: compressed.compression,
    inlinePayloadBase64: uint8ToBase64(compressed.bytes),
    assetManifest,
    uploadedAt: new Date().toISOString(),
  };
}
