/**
 * IndexedDB local working recovery store for Coding Lab.
 * Used in both Playground and Assessment modes so learners can recover unsaved
 * local work on the same browser/device after refresh or crash.
 * Never presented as cloud backup or cross-device sync.
 */

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

export async function saveLocalDraft(draft: LocalCodingLabDraft): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(draft);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to write local recovery draft.'));
    };
  });
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
