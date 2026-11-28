/**
 * IndexedDB local working recovery store for Coding Lab.
 * Used in both Playground and Assessment modes so learners can recover unsaved
 * local work on the same browser/device after refresh or crash.
 *
 * Hygiene guarantees:
 * - Enforces draft age TTL, maximum draft count, and total byte quota.
 * - Never deletes active unsynchronized assessment drafts during routine pruning.
 * - Supports safe account-switch hygiene so learners on shared lab devices do not
 *   accumulate stale drafts from unrelated accounts.
 * - Never presented as cloud backup or cross-device sync.
 */

import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
import type { CodingLabMode } from '../../types/codingLab';

const DB_NAME = 'jaystar_coding_lab_recovery_v1';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

export interface LocalCodingLabDraft {
  key: string;
  mode: CodingLabMode;
  title: string;
  sb3Buffer: ArrayBuffer;
  projectHash: string;
  savedAt: string;
  sizeBytes?: number;
  syncedToCloud?: boolean;
  assessmentId?: string;
  attemptId?: string;
  ownerUid?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open local recovery database.'));
  });
}

export function buildLocalDraftKey(params: {
  mode: CodingLabMode;
  ownerUid?: string;
  assessmentId?: string;
  attemptId?: string;
}): string {
  if (params.mode === 'assessment' && params.assessmentId) {
    return `assessment:${params.ownerUid || 'anon'}:${params.assessmentId}:${params.attemptId || 'current'}`;
  }
  return `playground:${params.ownerUid || 'guest'}:active`;
}

async function listAllDrafts(db: IDBDatabase): Promise<LocalCodingLabDraft[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as LocalCodingLabDraft[]) || []);
    req.onerror = () => reject(req.error || new Error('Failed to list local recovery drafts.'));
  });
}

async function deleteDraftKeys(db: IDBDatabase, keys: string[]): Promise<void> {
  if (!keys.length) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const k of keys) {
      store.delete(k);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to prune local recovery drafts.'));
  });
}

/**
 * Prunes expired or over-quota IndexedDB drafts while strictly protecting
 * the active draft (`protectKey`) and unsynchronized active assessment work.
 */
export async function pruneLocalDrafts(options?: {
  protectKey?: string;
  activeOwnerUid?: string;
}): Promise<number> {
  try {
    const db = await openDb();
    try {
      const drafts = await listAllDrafts(db);
      if (drafts.length === 0) return 0;

      const now = Date.now();
      const maxAgeMs = CODING_LAB_CONFIG.maxLocalDraftAgeMs;
      const maxTotalBytes = CODING_LAB_CONFIG.maxLocalDraftTotalBytes;
      const maxCount = CODING_LAB_CONFIG.maxLocalDraftCount;

      const keysToDelete = new Set<string>();
      const remaining: Array<LocalCodingLabDraft & { _bytes: number; _ts: number; _protected: boolean }> = [];

      for (const draft of drafts) {
        const bytes = Number(draft.sizeBytes || draft.sb3Buffer?.byteLength || 0);
        const ts = Date.parse(draft.savedAt || '') || 0;
        const isCurrentKey = Boolean(options?.protectKey && draft.key === options.protectKey);
        const isUnsyncedActiveAssessment =
          draft.mode === 'assessment' &&
          draft.syncedToCloud !== true &&
          (!options?.activeOwnerUid || !draft.ownerUid || draft.ownerUid === options.activeOwnerUid);

        // Safe account-switch cleanup: remove ALREADY-SYNCED assessment drafts belonging to other accounts
        if (
          options?.activeOwnerUid &&
          draft.mode === 'assessment' &&
          draft.ownerUid &&
          draft.ownerUid !== options.activeOwnerUid &&
          draft.syncedToCloud === true
        ) {
          keysToDelete.add(draft.key);
          continue;
        }

        // Expired draft eviction (never evict active protected key or unsynced active assessment)
        if (!isCurrentKey && !isUnsyncedActiveAssessment && ts > 0 && now - ts > maxAgeMs) {
          keysToDelete.add(draft.key);
          continue;
        }

        remaining.push({
          ...draft,
          _bytes: bytes,
          _ts: ts,
          _protected: isCurrentKey || isUnsyncedActiveAssessment,
        });
      }

      // Enforce count & byte quotas, evicting oldest unprotected drafts first
      let totalBytes = remaining.reduce((sum, item) => sum + item._bytes, 0);
      let count = remaining.length;

      if (totalBytes > maxTotalBytes || count > maxCount) {
        const evictable = remaining
          .filter((item) => !item._protected)
          .sort((a, b) => a._ts - b._ts);

        for (const candidate of evictable) {
          if (totalBytes <= maxTotalBytes && count <= maxCount) break;
          keysToDelete.add(candidate.key);
          totalBytes -= candidate._bytes;
          count -= 1;
        }
      }

      const deleteList = Array.from(keysToDelete);
      if (deleteList.length > 0) {
        await deleteDraftKeys(db, deleteList);
      }
      return deleteList.length;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

export async function saveLocalDraft(draft: LocalCodingLabDraft): Promise<void> {
  const normalized: LocalCodingLabDraft = {
    ...draft,
    sizeBytes: draft.sb3Buffer?.byteLength || draft.sizeBytes || 0,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(normalized);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to write local recovery draft.'));
    };
  });

  // Best-effort background hygiene without blocking editor responsiveness
  void pruneLocalDrafts({
    protectKey: normalized.key,
    activeOwnerUid: normalized.ownerUid,
  });
}

export async function markLocalDraftSynced(key: string): Promise<void> {
  try {
    const existing = await loadLocalDraft(key);
    if (!existing || existing.syncedToCloud) return;
    await saveLocalDraft({ ...existing, syncedToCloud: true });
  } catch {
    // Best-effort sync marker
  }
}

export async function loadLocalDraft(key: string): Promise<LocalCodingLabDraft | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as LocalCodingLabDraft) || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('Failed to read local recovery draft.'));
      };
    });
  } catch {
    return null;
  }
}

export async function clearLocalDraft(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to clear local recovery draft.'));
      };
    });
  } catch {
    // Best-effort cleanup
  }
}
