/**
 * CodingLabProjectService — handles controlled Firestore persistence for
 * Coding Lab Assessment projects (and Tutor starter projects).
 *
 * Strict Firestore Spark-plan protection:
 * - Compresses project.json with gzip before writing.
 * - Uses native Firestore `Bytes.fromUint8Array(...)` (no Base64 bloat).
 * - Stores inline when compressed payload <= 700 KiB; splits into 350 KiB chunks
 *   in `codingLabProjects/{projectId}/payloadChunks/{chunkIndex}` when larger.
 * - Verifies SHA-256 integrity hash on every load.
 * - Skips writes completely when payloadHash + assetManifest hash are unchanged.
 * - Coalesces concurrent save requests so rapid edits never stampede Firestore.
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
  onStageChange?: (stage: 'uploading_assets' | 'saving_lms') => void;
}

export interface SaveCodingLabProjectResult {
  skipped: boolean;
  projectId: string;
  revision: number;
  payloadHash: string;
  compositeHash: string;
  payloadSize: number;
  storageMode: 'inline' | 'chunked';
  chunkCount: number;
  assetManifest: CodingLabAssetManifestEntry[];
  projectJson: Record<string, any>;
}

const inFlightSaves = new Map<string, Promise<SaveCodingLabProjectResult>>();

export function buildAssessmentProjectId(assessmentId: string, attemptId: string): string {
  const safeExam = String(assessmentId || 'exam').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const safeAttempt = String(attemptId || 'attempt').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `clab_${safeExam}_${safeAttempt}`;
}

export async function saveAssessmentProjectToFirestore(
  input: SaveCodingLabProjectInput
): Promise<SaveCodingLabProjectResult> {
  // Coalesce simultaneous save calls for the same project
  const existingFlight = inFlightSaves.get(input.projectId);
  if (existingFlight) {
    return existingFlight;
  }

  const run = (async (): Promise<SaveCodingLabProjectResult> => {
    const parsed = await parseAndValidateSb3(input.sb3Buffer, { mode: 'assessment' });
    const compressed = await compressProjectJson(parsed.projectJson);

    // Compute composite hash of compressed JSON + custom image hashes so unchanged saves are skipped
    const customHashes = parsed.customImageAssets
      .map((a) => `${a.md5ext}:${a.contentHash}`)
      .sort()
      .join('|');
    const compositeHash = await sha256Hex(
      new TextEncoder().encode(`${compressed.hash}::${customHashes}::${input.title.trim()}`)
    );

    if (input.lastSavedCompositeHash && input.lastSavedCompositeHash === compositeHash) {
      return {
        skipped: true,
        projectId: input.projectId,
        revision: input.existingRevision || 1,
        payloadHash: compressed.hash,
        compositeHash,
        payloadSize: compressed.sizeBytes,
        storageMode:
          compressed.sizeBytes <= CODING_LAB_CONFIG.firestoreSingleDocPayloadThresholdBytes
            ? 'inline'
            : 'chunked',
        chunkCount: 0,
        assetManifest: input.existingManifest || [],
        projectJson: parsed.projectJson,
      };
    }

    // Upload only new custom learner images to Cloudinary (deduplicated)
    let customManifest: CodingLabAssetManifestEntry[] = [];
    if (parsed.customImageAssets.length > 0) {
      input.onStageChange?.('uploading_assets');
      customManifest = await syncAssessmentCustomImages({
        assessmentId: input.assessmentId,
        attemptId: input.attemptId,
        customImages: parsed.customImageAssets,
        existingManifest: input.existingManifest,
      });
    }

    const assetManifest: CodingLabAssetManifestEntry[] = [
      ...parsed.builtinImageAssets,
      ...parsed.builtinSoundAssets,
      ...customManifest,
    ];

    input.onStageChange?.('saving_lms');

    const split = splitPayloadForFirestore(
      compressed.bytes,
      CODING_LAB_CONFIG.firestoreSingleDocPayloadThresholdBytes,
      CODING_LAB_CONFIG.firestoreChunkSizeBytes
    );

    const projectRef = doc(db, 'codingLabProjects', input.projectId);
    const existingSnap = await getDoc(projectRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as Record<string, any>) : null;

    if (existingData && existingData.status === 'submitted') {
      throw new Error('This coding project has already been submitted and is locked against edits.');
    }

    const nextRevision = Number(existingData?.revision || input.existingRevision || 0) + 1;
    const prevChunkCount = Number(existingData?.chunkCount || 0);

    const batch = writeBatch(db);
    const docPayload: Record<string, any> = {
      ownerUid: input.ownerUid,
      assessmentId: input.assessmentId,
      attemptId: input.attemptId,
      schoolId: input.schoolId || '',
      title: String(input.title || 'Coding Lab Project').trim().slice(0, 160),
      revision: nextRevision,
      payloadFormat: 'scratch-sb3-json-v3',
      payloadCompression: compressed.compression,
      payloadStorageMode: split.storageMode,
      payloadHash: compressed.hash,
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

    // Write chunks if chunked
    if (split.storageMode === 'chunked') {
      for (const chunk of split.chunks) {
        const chunkRef = doc(db, 'codingLabProjects', input.projectId, 'payloadChunks', String(chunk.index));
        batch.set(chunkRef, {
          chunkIndex: chunk.index,
          payloadBytes: Bytes.fromUint8Array(chunk.bytes),
          sizeBytes: chunk.sizeBytes,
          payloadHash: compressed.hash,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Clean up obsolete trailing chunks if payload shrank
    if (prevChunkCount > split.chunkCount) {
      for (let i = split.chunkCount; i < prevChunkCount; i += 1) {
        batch.delete(doc(db, 'codingLabProjects', input.projectId, 'payloadChunks', String(i)));
      }
    }

    await batch.commit();

    return {
      skipped: false,
      projectId: input.projectId,
      revision: nextRevision,
      payloadHash: compressed.hash,
      compositeHash,
      payloadSize: compressed.sizeBytes,
      storageMode: split.storageMode,
      chunkCount: split.chunkCount,
      assetManifest,
      projectJson: parsed.projectJson,
    };
  })();

  inFlightSaves.set(input.projectId, run);
  try {
    return await run;
  } finally {
    inFlightSaves.delete(input.projectId);
  }
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
 * decompresses project.json, and reconstructs a full runnable .sb3 ArrayBuffer using
 * self-hosted built-in library assets + authenticated Cloudinary custom images.
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
    resolveCustomAssetBytes: (entry) => resolveCustomAssetBytes(entry, data.assessmentId),
  });

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
export async function loadStarterProjectBuffer(starter: {
  projectId?: string;
  inlinePayloadBase64?: string;
  payloadCompression?: 'gzip' | 'none';
  payloadHash?: string;
  assetManifest?: CodingLabAssetManifestEntry[];
}, assessmentId?: string): Promise<ArrayBuffer | null> {
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
