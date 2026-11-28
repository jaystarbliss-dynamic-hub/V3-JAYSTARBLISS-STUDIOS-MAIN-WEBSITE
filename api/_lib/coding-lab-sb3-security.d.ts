export const SB3_LIMITS: {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxFileCount: number;
  maxProjectJsonBytes: number;
  firestoreSingleDocThresholdBytes: number;
  firestoreChunkSizeBytes: number;
  maxCustomImageBytes: number;
  maxCustomImagesPerProject: number;
  maxAggregateCustomImageBytes: number;
};

export const ALLOWED_IMAGE_EXTENSIONS: Set<string>;
export const AUDIO_EXTENSIONS: Set<string>;

export function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string>;
export function isSafeSb3EntryPath(entryPath: string): boolean;
export function sanitizeSvgContent(svgText: string): {
  sanitized: string;
  hadUnsafeContent: boolean;
};
export function validateScratchProjectJson(parsed: unknown): {
  valid: boolean;
  error?: string;
};
export function compressProjectJson(projectJson: string | Record<string, any>): Promise<{
  bytes: Uint8Array;
  compression: 'gzip' | 'none';
  hash: string;
  sizeBytes: number;
  rawSizeBytes: number;
}>;
export function decompressAndVerifyProjectJson(
  bytes: Uint8Array | ArrayBuffer,
  compression: 'gzip' | 'none',
  expectedHash?: string
): Promise<Record<string, any>>;
export function splitPayloadForFirestore(
  bytes: Uint8Array,
  singleDocThresholdBytes?: number,
  chunkSizeBytes?: number
): {
  storageMode: 'inline' | 'chunked';
  inlineBytes: Uint8Array | null;
  chunks: Array<{ index: number; bytes: Uint8Array; sizeBytes: number }>;
  chunkCount: number;
};
export function reassemblePayloadChunks(
  chunks: Array<{ index: number; bytes: Uint8Array }>
): Uint8Array;
export function diffPayloadChunks(
  chunks: Array<{ index: number; bytes: Uint8Array; sizeBytes: number }>,
  previousChunkHashes?: string[]
): Promise<{
  nextChunkHashes: string[];
  changedChunks: Array<{ index: number; bytes: Uint8Array; sizeBytes: number; chunkHash: string }>;
  obsoleteChunkIndices: number[];
}>;

