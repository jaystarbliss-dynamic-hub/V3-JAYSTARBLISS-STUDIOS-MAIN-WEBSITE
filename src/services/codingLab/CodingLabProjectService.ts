/**
 * CodingLabProjectService — handles controlled Firestore persistence for
 * Coding Lab Assessment projects (and Tutor starter projects).
 *
 * Strict Firestore Spark-plan protection & data-integrity guarantees:
 * - Compresses project.json with gzip before writing.
 * - Uses native Firestore `Bytes.fromUint8Array(...)` (no Base64 bloat).
 * - Stores inline when compressed payload <= 550 KiB AND total estimated document size
 *   stays safely below 880 KiB (protecting Firestore's 1 MiB limit with metadata headroom).
 * - Splits larger payloads into 350 KiB chunks and diffs per-chunk SHA-256 hashes so ONLY
 *   changed chunks are written and obsolete trailing chunks are cleaned up.
 * - Persists `compositeHash` and `chunkHashes` in Firestore metadata and restores them on load
 *   so reopening/refreshing or clicking Save Progress on unchanged work causes ZERO writes.
 * - Uses a serialized latest-state save queue per project so edits arriving while a save is
 *   in flight are NEVER silently dropped.
 * - Enforces optimistic revision concurrency checks so concurrent tabs cannot silently clobber work.
 * - NEVER stores image binaries, audio files, or complete .sb3 archives in Firestore.
 */

import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  compressProjectJson,
  decompressAndVerifyProjectJson,
  diffPayloadChunks,
  reassemblePayloadChunks,
  sha256Hex,
  splitPayloadForFirestore,
} from '../../../api/_lib/coding-lab-sb3-security.js';
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
import type {
  CodingLabAssetManifestEntry,
  CodingLabProjectRecord,
} from '../../types/codingLab';
import { parseAndValidateSb3, reconstructSb3Archive } from './ScratchProjectAdapter';
import { resolveCustomAssetBytes, syncAssessmentCustomImages } from './CodingLabAssetService';

export interface SaveCodingLabProjectInput {
  projectId: string;
  ownerUid: string;
  assessmentId: string;
  attemptId: string;
  schoolId?: string;
  title: string;
  sb3Buffer: ArrayBuffer;
  existingRevision?: number;
  lastSavedCompositeHash?: string | null;
  existingManifest?: CodingLabAssetManifestEntry[];
  existingChunkHashes?: string[];
  onStageChange?: (stage: 'uploading_assets' | 'saving_lms') => void;
}

export interface SaveCodingLabProjectResult {
  skipped: boolean;
  projectId: string;
  revision: number;
  payloadHash: string;
  compositeHash: string;
  chunkHashes: string[];
  payloadSize: number;
  storageMode: 'inline' | 'chunked';
  chunkCount: number;
  chunksWritten: number;
  chunksDeleted: number;
  assetManifest: CodingLabAssetManifestEntry[];
  projectJson: Record<string, any>;
}

const MAX_SAFE_INLINE_DOC_BYTES = 880 * 1024; // Safety headroom under Firestore's 1 MiB document limit

interface ProjectSaveQueueState {
  running: boolean;
  pendingInput: SaveCodingLabProjectInput | null;
  pendingWaiters: Array<{
    resolve: (res: SaveCodingLabProjectResult) => void;
    reject: (err: Error) => void;
  }>;
  lastResult: SaveCodingLabProjectResult | null;
}

const projectSaveQueues = new Map<string, ProjectSaveQueueState>();

export function buildAssessmentProjectId(assessmentId: string, attemptId: string): string {
  const safeExam = String(assessmentId || 'exam').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const safeAttempt = String(attemptId || 'attempt').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `clab_${safeExam}_${safeAttempt}`;
}

async function computeProjectCompositeHash(params: {
  payloadHash: string;
  customHashes: string;
  title: string;
}): Promise<string> {
  return sha256Hex(
    new TextEncoder().encode(`${params.payloadHash}::${params.customHashes}::${params.title.trim()}`)
  );
}

async function executeSingleSave(
  input: SaveCodingLabProjectInput,
  latestKnown?: SaveCodingLabProjectResult | null
): Promise<SaveCodingLabProjectResult> {
  const effectiveLastCompositeHash =
    input.lastSavedCompositeHash ?? latestKnown?.compositeHash ?? null;
  const effectiveRevision = Math.max(
    Number(input.existingRevision || 0),
    Number(latestKnown?.revision || 0)
  );
  const effectiveManifest =
    input.existingManifest && input.existingManifest.length > 0
      ? input.existingManifest
      : latestKnown?.assetManifest || [];
  const effectiveChunkHashes =
    input.existingChunkHashes && input.existingChunkHashes.length > 0
      ? input.existingChunkHashes
      : latestKnown?.chunkHashes || [];

  const parsed = await parseAndValidateSb3(input.sb3Buffer, { mode: 'assessment' });
  const compressed = await compressProjectJson(parsed.projectJson);

  // Compute deterministic composite hash of compressed JSON + custom images + title
  const customHashes = parsed.customImageAssets
    .map((a) => `${a.md5ext}:${a.contentHash}`)
    .sort()
    .join('|');
  const compositeHash = await computeProjectCompositeHash({
    payloadHash: compressed.hash,
    customHashes,
    title: input.title,
  });

  // Zero-write skip when content is identical to last verified cloud save
  if (effectiveLastCompositeHash && effectiveLastCompositeHash === compositeHash) {
    return {
      skipped: true,
      projectId: input.projectId,
      revision: effectiveRevision || 1,
      payloadHash: compressed.hash,
      compositeHash,
      chunkHashes: effectiveChunkHashes,
      payloadSize: compressed.sizeBytes,
      storageMode:
        compressed.sizeBytes <= CODING_LAB_CONFIG.firestoreSingleDocPayloadThresholdBytes
          ? 'inline'
          : 'chunked',
      chunkCount: effectiveChunkHashes.length,
      chunksWritten: 0,
      chunksDeleted: 0,
      assetManifest: effectiveManifest,
      projectJson: parsed.projectJson,
    };
  }

  // Upload only new custom learner images to Cloudinary (deduplicated + server-authorized)
  let customManifest: CodingLabAssetManifestEntry[] = [];
  if (parsed.customImageAssets.length > 0) {
    input.onStageChange?.('uploading_assets');
    customManifest = await syncAssessmentCustomImages({
      assessmentId: input.assessmentId,
      attemptId: input.attemptId,
      projectId: input.projectId,
      customImages: parsed.customImageAssets,
      existingManifest: effectiveManifest,
    });
  }

  const assetManifest: CodingLabAssetManifestEntry[] = [
    ...parsed.builtinImageAssets,
    ...parsed.builtinSoundAssets,
    ...customManifest,
  ];

  input.onStageChange?.('saving_lms');

  // Account for metadata + assetManifest overhead so inline documents stay safely below 1 MiB
  const manifestEstimateBytes = new TextEncoder().encode(JSON.stringify(assetManifest)).byteLength;
  const metadataOverheadBytes = manifestEstimateBytes + 16 * 1024;
  const inlineThresholdBytes = Math.min(
    CODING_LAB_CONFIG.firestoreSingleDocPayloadThresholdBytes,
    Math.max(128 * 1024, MAX_SAFE_INLINE_DOC_BYTES - metadataOverheadBytes)
  );

  const split = splitPayloadForFirestore(
    compressed.bytes,
    inlineThresholdBytes,
    CODING_LAB_CONFIG.firestoreChunkSizeBytes
  );

  const projectRef = doc(db, 'codingLabProjects', input.projectId);
  const existingSnap = await getDoc(projectRef);
  const existingData = existingSnap.exists() ? (existingSnap.data() as Record<string, any>) : null;

  if (existingData && existingData.status === 'submitted') {
    throw new Error('This coding project has already been submitted and is locked against edits.');
  }

  const remoteRevision = Number(existingData?.revision || 0);
  const remoteCompositeHash = String(existingData?.compositeHash || '');
  const remoteChunkHashes = Array.isArray(existingData?.chunkHashes)
    ? (existingData.chunkHashes as string[])
    : effectiveChunkHashes;

  // Idempotent server-state check: if Firestore already holds this exact compositeHash, do ZERO writes!
  if (existingData && remoteCompositeHash && remoteCompositeHash === compositeHash) {
    return {
      skipped: true,
      projectId: input.projectId,
      revision: remoteRevision || 1,
      payloadHash: compressed.hash,
      compositeHash,
      chunkHashes: remoteChunkHashes,
      payloadSize: compressed.sizeBytes,
      storageMode: existingData.payloadStorageMode === 'chunked' ? 'chunked' : 'inline',
      chunkCount: Number(existingData.chunkCount || 0),
      chunksWritten: 0,
      chunksDeleted: 0,
      assetManifest: Array.isArray(existingData.assetManifest)
        ? existingData.assetManifest
        : assetManifest,
      projectJson: parsed.projectJson,
    };
  }

  // Optimistic revision concurrency guard (prevents silent cross-tab overwrites)
  if (effectiveRevision > 0 && remoteRevision > effectiveRevision) {
    throw new Error(
      `This project was updated in another session (revision ${remoteRevision} vs local revision ${effectiveRevision}). Reload the workspace before saving to avoid overwriting newer work.`
    );
  }

  const nextRevision = remoteRevision + 1;
  const prevChunkCount = Number(existingData?.chunkCount || 0);

  let nextChunkHashes: string[] = [];
  let chunksWritten = 0;
  let chunksDeleted = 0;

  const batch = writeBatch(db);

  if (split.storageMode === 'chunked') {
    const diff = await diffPayloadChunks(split.chunks, remoteChunkHashes);
    nextChunkHashes = diff.nextChunkHashes;

    for (const chunk of diff.changedChunks) {
      const chunkRef = doc(
        db,
        'codingLabProjects',
        input.projectId,
        'payloadChunks',
        String(chunk.index)
      );
      batch.set(chunkRef, {
        chunkIndex: chunk.index,
        payloadBytes: Bytes.fromUint8Array(chunk.bytes),
        sizeBytes: chunk.sizeBytes,
        chunkHash: chunk.chunkHash,
        payloadHash: compressed.hash,
        updatedAt: serverTimestamp(),
      });
      chunksWritten += 1;
    }

    const obsoleteSet = new Set<number>(diff.obsoleteChunkIndices);
    for (let i = split.chunkCount; i < prevChunkCount; i += 1) {
      obsoleteSet.add(i);
    }
    for (const idx of obsoleteSet) {
      batch.delete(doc(db, 'codingLabProjects', input.projectId, 'payloadChunks', String(idx)));
      chunksDeleted += 1;
    }
  } else if (prevChunkCount > 0) {
    // Transitioned from chunked back to inline: delete obsolete chunks
    for (let i = 0; i < prevChunkCount; i += 1) {
      batch.delete(doc(db, 'codingLabProjects', input.projectId, 'payloadChunks', String(i)));
      chunksDeleted += 1;
    }
  }

  const docPayload: Record<string, any> = {
    ownerUid: input.ownerUid,
    assessmentId: input.assessmentId,
    attemptId: input.attemptId,
    schoolId: input.schoolId || '',
    mode: 'assessment',
    title: String(input.title || 'Coding Lab Project').trim().slice(0, 160),
    revision: nextRevision,
    payloadFormat: 'scratch-sb3-json-v3',
    payloadCompression: compressed.compression,
    payloadStorageMode: split.storageMode,
    payloadHash: compressed.hash,
    compositeHash,
    chunkHashes: nextChunkHashes,
    payloadSize: compressed.sizeBytes,
    chunkCount: split.chunkCount,
    assetManifest,
    status: 'draft',
    updatedAt: serverTimestamp(),
    ...(existingSnap.exists() ? {} : { createdAt: serverTimestamp() }),
  };

  if (split.storageMode === 'inline' && split.inlineBytes) {
    docPayload.payloadBytes = Bytes.fromUint8Array(split.inlineBytes);
  } else {
    docPayload.payloadBytes = null;
  }

  batch.set(projectRef, docPayload, { merge: true });
  await batch.commit();

  return {
    skipped: false,
    projectId: input.projectId,
    revision: nextRevision,
    payloadHash: compressed.hash,
    compositeHash,
    chunkHashes: nextChunkHashes,
    payloadSize: compressed.sizeBytes,
    storageMode: split.storageMode,
    chunkCount: split.chunkCount,
    chunksWritten,
    chunksDeleted,
    assetManifest,
    projectJson: parsed.projectJson,
  };
}

/**
 * Serialized latest-state save queue per projectId:
 * - Never runs concurrent writes against the same project document.
 * - If newer edits arrive during an active save, coalesces them into ONE trailing save
 *   that executes immediately after the current save finishes so NO edits are silently dropped.
 */
export async function saveAssessmentProjectToFirestore(
  input: SaveCodingLabProjectInput
): Promise<SaveCodingLabProjectResult> {
  let state = projectSaveQueues.get(input.projectId);
  if (!state) {
    state = {
      running: false,
      pendingInput: null,
      pendingWaiters: [],
      lastResult: null,
    };
    projectSaveQueues.set(input.projectId, state);
  }

  return new Promise<SaveCodingLabProjectResult>((resolve, reject) => {
    state!.pendingInput = input;
    state!.pendingWaiters.push({ resolve, reject });

    if (state!.running) {
      return;
    }

    const drain = async () => {
      state!.running = true;
      try {
        while (state!.pendingInput) {
          const nextInput = state!.pendingInput;
          const waiters = state!.pendingWaiters;
          state!.pendingInput = null;
          state!.pendingWaiters = [];

          try {
            const res = await executeSingleSave(nextInput, state!.lastResult);
            state!.lastResult = res;
            for (const w of waiters) w.resolve(res);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            for (const w of waiters) w.reject(error);
          }
        }
      } finally {
        state!.running = false;
        if (!state!.pendingInput && state!.pendingWaiters.length === 0) {
          projectSaveQueues.delete(input.projectId);
        }
      }
    };

    void drain();
  });
}

function firestoreBytesToUint8Array(val: any): Uint8Array | null {
  if (!val) return null;
  if (val instanceof Uint8Array) return val;
  if (typeof val.toUint8Array === 'function') return val.toUint8Array();
  if (typeof val === 'string') {
    const bin = atob(val);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  return null;
}

/**
 * Loads a Coding Lab project from Firestore (single-doc or chunked), verifies SHA-256 integrity,
 * decompresses project.json, restores persisted compositeHash/chunkHashes, and reconstructs
 * a full runnable .sb3 ArrayBuffer using self-hosted built-in assets + authenticated custom images.
 */
export async function loadAssessmentProjectFromFirestore(projectId: string): Promise<{
  record: CodingLabProjectRecord;
  projectJson: Record<string, any>;
  sb3Buffer: ArrayBuffer;
} | null> {
  const projectRef = doc(db, 'codingLabProjects', projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, any>;
  let compressedBytes: Uint8Array | null = null;

  if (data.payloadStorageMode === 'chunked' || (!data.payloadBytes && Number(data.chunkCount || 0) > 0)) {
    const chunksSnap = await getDocs(collection(db, 'codingLabProjects', projectId, 'payloadChunks'));
    const chunks: Array<{ index: number; bytes: Uint8Array }> = [];
    chunksSnap.docs.forEach((d) => {
      const cData = d.data();
      const bytes = firestoreBytesToUint8Array(cData.payloadBytes);
      if (bytes) {
        chunks.push({ index: Number(cData.chunkIndex ?? d.id), bytes });
      }
    });
    if (chunks.length !== Number(data.chunkCount || chunks.length)) {
      throw new Error('Incomplete project payload chunks in Firestore.');
    }
    compressedBytes = reassemblePayloadChunks(chunks);
  } else {
    compressedBytes = firestoreBytesToUint8Array(data.payloadBytes);
  }

  if (!compressedBytes) {
    throw new Error('Stored Coding Lab project is missing its programming payload.');
  }

  const projectJson = await decompressAndVerifyProjectJson(
    compressedBytes,
    data.payloadCompression === 'none' ? 'none' : 'gzip',
    data.payloadHash
  );

  const assetManifest: CodingLabAssetManifestEntry[] = Array.isArray(data.assetManifest)
    ? data.assetManifest
    : [];

  const sb3Buffer = await reconstructSb3Archive({
    projectJson,
    assetManifest,
    resolveCustomAssetBytes: (entry) =>
      resolveCustomAssetBytes(entry, data.assessmentId, {
        attemptId: data.attemptId,
        projectId: snap.id,
      }),
  });

  // Restore persisted compositeHash (or derive it for older pre-upgrade records)
  let restoredCompositeHash = String(data.compositeHash || '');
  if (!restoredCompositeHash && data.payloadHash) {
    const customHashes = assetManifest
      .filter((a) => a.assetCategory === 'custom_image' && a.contentHash)
      .map((a) => `${a.md5ext}:${a.contentHash}`)
      .sort()
      .join('|');
    restoredCompositeHash = await computeProjectCompositeHash({
      payloadHash: String(data.payloadHash),
      customHashes,
      title: String(data.title || 'Coding Lab Project'),
    });
  }

  const record: CodingLabProjectRecord = {
    id: snap.id,
    ownerUid: String(data.ownerUid || ''),
    assessmentId: String(data.assessmentId || ''),
    attemptId: String(data.attemptId || ''),
    schoolId: String(data.schoolId || ''),
    title: String(data.title || 'Coding Lab Project'),
    revision: Number(data.revision || 1),
    payloadFormat: 'scratch-sb3-json-v3',
    payloadCompression: data.payloadCompression === 'none' ? 'none' : 'gzip',
    payloadStorageMode: data.payloadStorageMode === 'chunked' ? 'chunked' : 'inline',
    payloadHash: String(data.payloadHash || ''),
    compositeHash: restoredCompositeHash || undefined,
    chunkHashes: Array.isArray(data.chunkHashes) ? (data.chunkHashes as string[]) : [],
    payloadSize: Number(data.payloadSize || compressedBytes.byteLength),
    chunkCount: Number(data.chunkCount || 0),
    assetManifest,
    status: data.status === 'submitted' ? 'submitted' : 'draft',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    submittedAt: data.submittedAt,
  };

  return { record, projectJson, sb3Buffer };
}

/**
 * Loads a tutor-configured starter project into an .sb3 ArrayBuffer (never mutating the starter).
 */
export async function loadStarterProjectBuffer(
  starter: {
    projectId?: string;
    inlinePayloadBase64?: string;
    payloadCompression?: 'gzip' | 'none';
    payloadHash?: string;
    assetManifest?: CodingLabAssetManifestEntry[];
  },
  assessmentId?: string
): Promise<ArrayBuffer | null> {
  if (starter.projectId) {
    const loaded = await loadAssessmentProjectFromFirestore(starter.projectId);
    if (loaded) return loaded.sb3Buffer;
  }

  if (starter.inlinePayloadBase64) {
    const bytes = firestoreBytesToUint8Array(starter.inlinePayloadBase64);
    if (!bytes) return null;
    const projectJson = await decompressAndVerifyProjectJson(
      bytes,
      starter.payloadCompression === 'none' ? 'none' : 'gzip',
      starter.payloadHash
    );
    return reconstructSb3Archive({
      projectJson,
      assetManifest: starter.assetManifest || [],
      resolveCustomAssetBytes: (entry) => resolveCustomAssetBytes(entry, assessmentId),
    });
  }

  return null;
}
