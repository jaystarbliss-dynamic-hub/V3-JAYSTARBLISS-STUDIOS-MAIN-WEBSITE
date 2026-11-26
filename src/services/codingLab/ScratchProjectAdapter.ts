/**
 * ScratchProjectAdapter — parses, validates, sanitizes, extracts, and reconstructs
 * genuine Scratch 3 (.sb3) ZIP project archives.
 *
 * Enforces:
 * - ZIP bomb / uncompressed size / file count guards
 * - Path traversal protection
 * - SVG sanitization (strips <script>, event handlers, javascript: URIs)
 * - No custom audio uploads or microphone recordings in Assessment mode
 * - Built-in library asset separation vs custom learner-created image extraction
 * - Lossless .sb3 reconstruction preserving exact Scratch md5ext asset references
 */

import JSZip from 'jszip';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  isSafeSb3EntryPath,
  sanitizeSvgContent,
  sha256Hex,
  validateScratchProjectJson,
} from '../../../api/_lib/coding-lab-sb3-security.js';
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
import type { CodingLabAssetManifestEntry, CodingLabMode } from '../../types/codingLab';

export interface ExtractedCustomImageAsset {
  scratchAssetId: string;
  md5ext: string;
  dataFormat: string;
  bytes: Uint8Array;
  sizeBytes: number;
  contentHash: string;
}

export interface ParsedSb3Project {
  projectJson: Record<string, any>;
  projectJsonString: string;
  builtinImageAssets: CodingLabAssetManifestEntry[];
  builtinSoundAssets: CodingLabAssetManifestEntry[];
  customImageAssets: ExtractedCustomImageAsset[];
  warnings: string[];
  sanitizedSb3Buffer?: ArrayBuffer;
}

let cachedBuiltinAssetIds: Set<string> | null = null;

/**
 * Loads the catalog of self-hosted built-in static asset IDs shipped under
 * /coding-lab-editor/static/assets/manifest.json so unchanged library media
 * are never redundantly uploaded to Cloudinary.
 */
export async function getBuiltinAssetCatalog(): Promise<Set<string>> {
  if (cachedBuiltinAssetIds) return cachedBuiltinAssetIds;
  try {
    const res = await fetch(`${CODING_LAB_CONFIG.staticAssetsBaseUrl}/manifest.json`, {
      cache: 'force-cache',
    });
    if (res.ok) {
      const data = await res.json();
      const ids = Array.isArray(data?.assetIds) ? data.assetIds : [];
      cachedBuiltinAssetIds = new Set(ids.map((id: unknown) => String(id).toLowerCase()));
      return cachedBuiltinAssetIds;
    }
  } catch {
    // Fall back to empty set if manifest is not yet fetched
  }
  return new Set<string>();
}

function getFileExtension(filename: string): string {
  const parts = String(filename || '').split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getScratchAssetId(filename: string): string {
  return String(filename || '').split('.')[0].toLowerCase();
}

/**
 * Validates and parses an incoming .sb3 ArrayBuffer (used on both local file import
 * and assessment extraction before cloud persistence).
 */
export async function parseAndValidateSb3(
  sb3Buffer: ArrayBuffer | Uint8Array,
  options: {
    mode: CodingLabMode;
    rebuildSanitizedZip?: boolean;
  }
): Promise<ParsedSb3Project> {
  const rawBytes = sb3Buffer instanceof Uint8Array ? sb3Buffer : new Uint8Array(sb3Buffer);
  if (rawBytes.byteLength === 0) {
    throw new Error('The selected .sb3 file is empty.');
  }
  if (rawBytes.byteLength > CODING_LAB_CONFIG.maxSb3CompressedBytes) {
    throw new Error(
      `Project archive exceeds the ${Math.round(CODING_LAB_CONFIG.maxSb3CompressedBytes / (1024 * 1024))} MiB size limit.`
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(rawBytes);
  } catch {
    throw new Error('Invalid or corrupted .sb3 archive. Please select a valid Scratch 3 (.sb3) file.');
  }

  const entryNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  if (entryNames.length === 0) {
    throw new Error('The .sb3 archive contains no files.');
  }
  if (entryNames.length > CODING_LAB_CONFIG.maxSb3FileCount) {
    throw new Error(
      `Archive contains too many files (${entryNames.length}). Maximum allowed is ${CODING_LAB_CONFIG.maxSb3FileCount}.`
    );
  }

  for (const name of entryNames) {
    if (!isSafeSb3EntryPath(name)) {
      throw new Error(`Archive contains an unsupported or unsafe file entry: "${name}".`);
    }
  }

  const projectJsonEntry = zip.file('project.json');
  if (!projectJsonEntry) {
    throw new Error('Missing project.json inside the .sb3 archive.');
  }

  const projectJsonBytes = await projectJsonEntry.async('uint8array');
  if (projectJsonBytes.byteLength > CODING_LAB_CONFIG.maxProjectJsonBytes) {
    throw new Error('project.json exceeds the maximum allowed size.');
  }

  let projectJson: Record<string, any>;
  const projectJsonString = new TextDecoder().decode(projectJsonBytes);
  try {
    projectJson = JSON.parse(projectJsonString);
  } catch {
    throw new Error('Malformed project.json inside the .sb3 archive.');
  }

  const validation = validateScratchProjectJson(projectJson);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid Scratch 3 project structure.');
  }

  const builtinCatalog = await getBuiltinAssetCatalog();
  const warnings: string[] = [];
  const builtinImageAssets: CodingLabAssetManifestEntry[] = [];
  const builtinSoundAssets: CodingLabAssetManifestEntry[] = [];
  const customImageAssets: ExtractedCustomImageAsset[] = [];

  // Collect all asset md5ext referenced in project.json so unreferenced junk is ignored
  const referencedAssets = new Set<string>();
  for (const target of projectJson.targets || []) {
    for (const costume of target.costumes || []) {
      const md5ext = costume.md5ext || `${costume.assetId}.${costume.dataFormat}`;
      if (md5ext) referencedAssets.add(String(md5ext).toLowerCase());
    }
    for (const sound of target.sounds || []) {
      const md5ext = sound.md5ext || `${sound.assetId}.${sound.dataFormat}`;
      if (md5ext) referencedAssets.add(String(md5ext).toLowerCase());
    }
  }

  let totalUncompressedBytes = projectJsonBytes.byteLength;
  let totalCustomImageBytes = 0;
  const sanitizedZip = options.rebuildSanitizedZip ? new JSZip() : null;
  if (sanitizedZip) {
    sanitizedZip.file('project.json', projectJsonString);
  }

  for (const name of entryNames) {
    if (name.toLowerCase() === 'project.json') continue;
    const fileObj = zip.file(name);
    if (!fileObj) continue;

    let fileBytes = await fileObj.async('uint8array');
    totalUncompressedBytes += fileBytes.byteLength;
    if (totalUncompressedBytes > CODING_LAB_CONFIG.maxSb3UncompressedBytes) {
      throw new Error(
        `Archive uncompressed size exceeds safety limit (${Math.round(
          CODING_LAB_CONFIG.maxSb3UncompressedBytes / (1024 * 1024)
        )} MiB). Possible ZIP bomb rejected.`
      );
    }

    const ext = getFileExtension(name);
    const assetId = getScratchAssetId(name);
    const md5ext = `${assetId}.${ext}`;
    const isBuiltin = builtinCatalog.has(assetId) || builtinCatalog.has(md5ext);

    if (AUDIO_EXTENSIONS.has(ext)) {
      if (!isBuiltin) {
        if (options.mode === 'assessment') {
          throw new Error(
            `Custom audio file "${name}" is not allowed in Coding Lab assessments. Please use approved built-in sounds only.`
          );
        }
        warnings.push(`Audio asset "${name}" is not in the built-in sound library.`);
      } else {
        builtinSoundAssets.push({
          scratchAssetId: assetId,
          md5ext,
          dataFormat: ext,
          assetCategory: 'builtin_sound',
          sizeBytes: fileBytes.byteLength,
        });
      }
      if (sanitizedZip) sanitizedZip.file(name, fileBytes);
      continue;
    }

    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported file format ".${ext}" inside archive.`);
    }

    // Sanitize SVG content to strip scripts / inline event handlers
    if (ext === 'svg') {
      const svgText = new TextDecoder().decode(fileBytes);
      const { sanitized, hadUnsafeContent } = sanitizeSvgContent(svgText);
      if (hadUnsafeContent) {
        warnings.push(`Removed unsafe scripting markup from SVG asset "${name}".`);
        fileBytes = new TextEncoder().encode(sanitized);
      }
    }

    if (sanitizedZip) {
      sanitizedZip.file(name, fileBytes);
    }

    if (!referencedAssets.has(md5ext)) continue;

    if (isBuiltin) {
      builtinImageAssets.push({
        scratchAssetId: assetId,
        md5ext,
        dataFormat: ext,
        assetCategory: 'builtin_image',
        sizeBytes: fileBytes.byteLength,
      });
    } else {
      if (options.mode === 'assessment') {
        if (fileBytes.byteLength > CODING_LAB_CONFIG.maxCustomImageBytes) {
          throw new Error(
            `Custom image "${name}" (${Math.round(fileBytes.byteLength / 1024)} KiB) exceeds the ${Math.round(
              CODING_LAB_CONFIG.maxCustomImageBytes / 1024
            )} KiB per-image limit.`
          );
        }
        if (customImageAssets.length >= CODING_LAB_CONFIG.maxCustomImagesPerProject) {
          throw new Error(
            `Project exceeds the maximum of ${CODING_LAB_CONFIG.maxCustomImagesPerProject} custom image assets per assessment.`
          );
        }
        totalCustomImageBytes += fileBytes.byteLength;
        if (totalCustomImageBytes > CODING_LAB_CONFIG.maxAggregateCustomImageBytes) {
          throw new Error(
            `Total custom images exceed the ${Math.round(
              CODING_LAB_CONFIG.maxAggregateCustomImageBytes / (1024 * 1024)
            )} MiB per-project allowance.`
          );
        }
      }

      const contentHash = await sha256Hex(fileBytes);
      customImageAssets.push({
        scratchAssetId: assetId,
        md5ext,
        dataFormat: ext,
        bytes: fileBytes,
        sizeBytes: fileBytes.byteLength,
        contentHash,
      });
    }
  }

  let sanitizedSb3Buffer: ArrayBuffer | undefined;
  if (sanitizedZip) {
    sanitizedSb3Buffer = await sanitizedZip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  }

  return {
    projectJson,
    projectJsonString,
    builtinImageAssets,
    builtinSoundAssets,
    customImageAssets,
    warnings,
    sanitizedSb3Buffer,
  };
}

/**
 * Reconstructs a standard valid Scratch 3 .sb3 archive from:
 * - Stored structured project.json
 * - Self-hosted built-in library images & approved built-in sounds
 * - Resolved custom learner-created image bytes from Cloudinary
 */
export async function reconstructSb3Archive(params: {
  projectJson: Record<string, any>;
  assetManifest: CodingLabAssetManifestEntry[];
  resolveCustomAssetBytes: (entry: CodingLabAssetManifestEntry) => Promise<Uint8Array | null>;
}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(params.projectJson));

  const manifestByMd5Ext = new Map<string, CodingLabAssetManifestEntry>();
  for (const entry of params.assetManifest || []) {
    if (entry?.md5ext) {
      manifestByMd5Ext.set(entry.md5ext.toLowerCase(), entry);
    }
  }

  // Collect every costume and sound referenced in project.json
  const requiredAssets = new Map<string, { assetId: string; dataFormat: string; isSound: boolean }>();
  for (const target of params.projectJson?.targets || []) {
    for (const costume of target.costumes || []) {
      const assetId = String(costume.assetId || '').toLowerCase();
      const dataFormat = String(costume.dataFormat || 'svg').toLowerCase();
      const md5ext = String(costume.md5ext || `${assetId}.${dataFormat}`).toLowerCase();
      if (assetId) requiredAssets.set(md5ext, { assetId, dataFormat, isSound: false });
    }
    for (const sound of target.sounds || []) {
      const assetId = String(sound.assetId || '').toLowerCase();
      const dataFormat = String(sound.dataFormat || 'wav').toLowerCase();
      const md5ext = String(sound.md5ext || `${assetId}.${dataFormat}`).toLowerCase();
      if (assetId) requiredAssets.set(md5ext, { assetId, dataFormat, isSound: true });
    }
  }

  await Promise.all(
    Array.from(requiredAssets.entries()).map(async ([md5ext, _info]) => {
      const manifestEntry = manifestByMd5Ext.get(md5ext);

      // 1. Custom learner-created image -> resolve from Cloudinary / asset service
      if (manifestEntry && manifestEntry.assetCategory === 'custom_image') {
        const bytes = await params.resolveCustomAssetBytes(manifestEntry);
        if (bytes && bytes.byteLength > 0) {
          zip.file(md5ext, bytes);
          return;
        }
      }

      // 2. Built-in static asset -> fetch from self-hosted same-origin /coding-lab-editor/static/assets/
      try {
        const staticRes = await fetch(`${CODING_LAB_CONFIG.staticAssetsBaseUrl}/${md5ext}`, {
          cache: 'force-cache',
        });
        if (staticRes.ok) {
          const buf = await staticRes.arrayBuffer();
          zip.file(md5ext, new Uint8Array(buf));
          return;
        }
      } catch {
        // Ignore and try fallback below
      }

      // 3. Fallback: if manifest entry has deliveryUrl even if miscategorized
      if (manifestEntry) {
        const bytes = await params.resolveCustomAssetBytes(manifestEntry);
        if (bytes && bytes.byteLength > 0) {
          zip.file(md5ext, bytes);
        }
      }
    })
  );

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/**
 * Triggers a browser file download of a genuine .sb3 file.
 */
export function downloadSb3File(sb3Buffer: ArrayBuffer, projectTitle: string): void {
  const safeBase =
    String(projectTitle || 'coding-lab-project')
      .trim()
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'coding-lab-project';
  const fileName = safeBase.toLowerCase().endsWith('.sb3') ? safeBase : `${safeBase}.sb3`;
  const blob = new Blob([sb3Buffer], { type: 'application/x.scratch.sb3' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
