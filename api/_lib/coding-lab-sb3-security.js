/**
 * Pure security, validation, SVG sanitization, chunking, and integrity hashing utilities
 * for Coding Lab .sb3 archives and Firestore hybrid payload storage.
 * Compatible with both modern browsers (Web Crypto + CompressionStream) and Node.js >=22.
 */

export const SB3_LIMITS = {
  maxCompressedBytes: 25 * 1024 * 1024, // 25 MiB
  maxUncompressedBytes: 50 * 1024 * 1024, // 50 MiB
  maxFileCount: 250,
  maxProjectJsonBytes: 5 * 1024 * 1024, // 5 MiB
  firestoreSingleDocThresholdBytes: 550 * 1024, // 550 KiB (safe headroom for metadata + assetManifest under 1 MiB)
  firestoreChunkSizeBytes: 350 * 1024, // 350 KiB
  maxCustomImageBytes: 1024 * 1024, // 1 MiB
  maxCustomImagesPerProject: 20,
  maxAggregateCustomImageBytes: 10 * 1024 * 1024, // 10 MiB
};

export const ALLOWED_IMAGE_EXTENSIONS = new Set(["svg", "png", "jpg", "jpeg", "gif", "webp"]);
export const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "ogg", "m4a", "flac", "webm", "aac"]);

/**
 * Computes lowercase hex SHA-256 hash using Web Crypto (works in Browser and Node >=20).
 */
export async function sha256Hex(bytes) {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", uint8);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates that an archive entry path does not attempt zip-slip / path traversal
 * and contains no nested dangerous directories or executable extensions.
 */
export function isSafeSb3EntryPath(entryPath) {
  const raw = String(entryPath || "");
  if (!raw || raw.length > 260) return false;
  if (raw.includes("..") || raw.startsWith("/") || raw.startsWith("\\") || raw.includes("\\")) {
    return false;
  }
  if (raw.includes("\0")) return false;
  const lower = raw.toLowerCase();
  if (lower === "project.json") return true;
  // Standard Scratch 3 asset filenames are {md5}.{ext} at the archive root
  return /^[a-f0-9]{32}\.(svg|png|jpg|jpeg|gif|webp|wav|mp3)$/i.test(raw);
}

/**
 * Sanitizes an SVG string by stripping script elements, foreignObject elements,
 * inline event handlers (on*="..."), and javascript:/vbscript:/data:text/html URIs.
 * Returns { sanitized, hadUnsafeContent }.
 */
export function sanitizeSvgContent(svgText) {
  const original = String(svgText || "");
  let clean = original;
  let hadUnsafeContent = false;

  const patterns = [
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    /<script\b[^>]*\/?>/gi,
    /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi,
    /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
    /<object\b[^>]*>[\s\S]*?<\/object>/gi,
    /<embed\b[^>]*\/?>/gi,
    /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    /\b(?:href|xlink:href)\s*=\s*(?:"\s*(?:javascript:|vbscript:|data:\s*text\/html)[^"]*"|'\s*(?:javascript:|vbscript:|data:\s*text\/html)[^']*')/gi,
  ];

  for (const regex of patterns) {
    const next = clean.replace(regex, "");
    if (next !== clean) {
      hadUnsafeContent = true;
      clean = next;
    }
  }

  return { sanitized: clean, hadUnsafeContent };
}

/**
 * Validates that a parsed Scratch 3 project.json conforms to core structural requirements
 * and does not declare untrusted third-party extension URLs.
 */
export function validateScratchProjectJson(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, error: "project.json must be a valid JSON object." };
  }
  if (!Array.isArray(parsed.targets) || parsed.targets.length === 0) {
    return { valid: false, error: "project.json must contain at least one target (stage)." };
  }
  const hasStage = parsed.targets.some(t => t && typeof t === "object" && t.isStage === true);
  if (!hasStage) {
    return { valid: false, error: "project.json is missing a stage target." };
  }
  if (parsed.targets.length > 200) {
    return { valid: false, error: "Project contains too many sprites/targets (maximum 200)." };
  }

  // Block untrusted external extension URLs (only allow standard built-in Scratch extensions)
  const ALLOWED_EXTENSIONS = new Set([
    "pen",
    "music",
    "text2speech",
    "translate",
    "videoSensing",
    "makeymakey",
    "microbit",
    "ev3",
    "boost",
    "wedo2",
    "gdxfor",
  ]);
  if (Array.isArray(parsed.extensions)) {
    for (const ext of parsed.extensions) {
      const extId = String(ext || "");
      if (extId.startsWith("http://") || extId.startsWith("https://") || extId.startsWith("data:")) {
        return {
          valid: false,
          error: `External custom Scratch extension URLs are not permitted (${extId}).`,
        };
      }
      if (extId && !ALLOWED_EXTENSIONS.has(extId)) {
        return {
          valid: false,
          error: `Unsupported or unapproved Scratch extension "${extId}".`,
        };
      }
    }
  }
  if (parsed.extensionURLs && typeof parsed.extensionURLs === "object" && Object.keys(parsed.extensionURLs).length > 0) {
    return {
      valid: false,
      error: "Custom remote extension URLs are blocked for security.",
    };
  }

  return { valid: true };
}

/**
 * Gzip-compresses a UTF-8 string into Uint8Array using native CompressionStream.
 * Falls back gracefully to uncompressed UTF-8 bytes if CompressionStream is unavailable.
 */
export async function compressProjectJson(projectJson) {
  const jsonString = typeof projectJson === "string" ? projectJson : JSON.stringify(projectJson);
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(jsonString);
  if (rawBytes.byteLength > SB3_LIMITS.maxProjectJsonBytes) {
    throw new Error(
      `Project JSON (${Math.round(rawBytes.byteLength / 1024)} KiB) exceeds maximum allowed size.`
    );
  }

  if (typeof globalThis.CompressionStream === "function") {
    const cs = new globalThis.CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    await writer.write(rawBytes);
    await writer.close();
    const compressedBuf = await new Response(cs.readable).arrayBuffer();
    const bytes = new Uint8Array(compressedBuf);
    const hash = await sha256Hex(bytes);
    return { bytes, compression: "gzip", hash, sizeBytes: bytes.byteLength, rawSizeBytes: rawBytes.byteLength };
  }

  const hash = await sha256Hex(rawBytes);
  return { bytes: rawBytes, compression: "none", hash, sizeBytes: rawBytes.byteLength, rawSizeBytes: rawBytes.byteLength };
}

/**
 * Verifies SHA-256 integrity hash and decompresses a stored project payload back to parsed JSON.
 */
export async function decompressAndVerifyProjectJson(bytes, compression, expectedHash) {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (expectedHash) {
    const actualHash = await sha256Hex(uint8);
    if (actualHash !== expectedHash) {
      throw new Error("Project payload integrity hash mismatch. The stored data may be corrupted.");
    }
  }

  let rawBytes = uint8;
  if (compression === "gzip") {
    if (typeof globalThis.DecompressionStream !== "function") {
      throw new Error("Browser/runtime does not support gzip decompression.");
    }
    const ds = new globalThis.DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    await writer.write(uint8);
    await writer.close();
    const decompressedBuf = await new Response(ds.readable).arrayBuffer();
    rawBytes = new Uint8Array(decompressedBuf);
  }

  const jsonString = new TextDecoder().decode(rawBytes);
  return JSON.parse(jsonString);
}

/**
 * Splits a compressed payload Uint8Array into hybrid inline vs chunked storage slices.
 */
export function splitPayloadForFirestore(
  bytes,
  singleDocThresholdBytes = SB3_LIMITS.firestoreSingleDocThresholdBytes,
  chunkSizeBytes = SB3_LIMITS.firestoreChunkSizeBytes
) {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (uint8.byteLength <= singleDocThresholdBytes) {
    return {
      storageMode: "inline",
      inlineBytes: uint8,
      chunks: [],
      chunkCount: 0,
    };
  }

  const chunks = [];
  for (let offset = 0, index = 0; offset < uint8.byteLength; offset += chunkSizeBytes, index += 1) {
    const slice = uint8.slice(offset, Math.min(offset + chunkSizeBytes, uint8.byteLength));
    chunks.push({ index, bytes: slice, sizeBytes: slice.byteLength });
  }

  return {
    storageMode: "chunked",
    inlineBytes: null,
    chunks,
    chunkCount: chunks.length,
  };
}

/**
 * Reassembles ordered chunk Uint8Arrays back into the exact original compressed payload.
 */
export function reassemblePayloadChunks(chunks) {
  const ordered = [...chunks].sort((a, b) => Number(a.index) - Number(b.index));
  const totalLength = ordered.reduce((sum, c) => sum + c.bytes.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of ordered) {
    combined.set(chunk.bytes, offset);
    offset += chunk.bytes.byteLength;
  }
  return combined;
}

/**
 * Computes per-chunk SHA-256 hashes and identifies only changed/added chunks
 * compared against previously persisted chunkHashes so unchanged chunks are never rewritten.
 */
export async function diffPayloadChunks(chunks, previousChunkHashes = []) {
  const prevList = Array.isArray(previousChunkHashes) ? previousChunkHashes : [];
  const nextChunkHashes = [];
  const changedChunks = [];

  for (const chunk of chunks) {
    const hash = await sha256Hex(chunk.bytes);
    nextChunkHashes.push(hash);
    if (prevList[chunk.index] !== hash) {
      changedChunks.push({ ...chunk, chunkHash: hash });
    }
  }

  const obsoleteChunkIndices = [];
  for (let i = chunks.length; i < prevList.length; i += 1) {
    obsoleteChunkIndices.push(i);
  }

  return {
    nextChunkHashes,
    changedChunks,
    obsoleteChunkIndices,
  };
}

