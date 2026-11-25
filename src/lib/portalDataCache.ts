import { auth } from './firebase';
import { getActiveImpersonation } from '../utils/impersonation';

/**
 * User-isolated Stale-While-Revalidate (SWR) portal cache.
 * Strictly namespaces every cache entry by:
 *   - Authenticated Firebase UID
 *   - Effective Target UID & Role (accounting for Audited Admin Support / Impersonation Sessions)
 *   - School ID (when applicable)
 *
 * Automatically invalidates and purges caches on logout or impersonation state changes
 * so one user's data can never leak into another user's session.
 */

const PORTAL_CACHE_PREFIX = 'jaystar_portal_swr_v2::';
const inMemoryPortalCache = new Map<string, { timestamp: number; data: any }>();

export function buildActiveSessionScopeKey(roleHint?: string): string {
  const currentUser = auth.currentUser;
  const authUid = currentUser?.uid || sessionStorage.getItem('userId') || 'anon';
  const imp = getActiveImpersonation();

  if (imp && imp.isMasquerading) {
    const target = imp.targetUser || ({} as any);
    const targetUid = String(target.uid || target.id || 'target');
    const targetRole = String(roleHint || imp.targetRole || 'student').toLowerCase();
    const targetSchool = String(target.schoolId || '');
    const targetDocId = String(target.studentDocId || target.id || '');
    return `masq_${authUid}_${targetRole}_${targetUid}_${targetSchool}_${targetDocId}`;
  }

  const effectiveRole = String(
    roleHint || sessionStorage.getItem('userRole') || localStorage.getItem('jaystar_cached_user_role') || 'user'
  ).toLowerCase();
  const schoolId = sessionStorage.getItem('schoolId') || '';
  const studentDocId = sessionStorage.getItem('studentDocId') || localStorage.getItem('jaystar_cached_student_doc_id') || '';

  return `self_${authUid}_${effectiveRole}_${schoolId}_${studentDocId}`;
}

export interface PortalCacheHit<T> {
  data: T;
  timestamp: number;
  isFresh: boolean;
}

export function getPortalCache<T>(
  namespace: string,
  roleHint?: string,
  maxAgeMs = 30 * 60 * 1000
): PortalCacheHit<T> | null {
  try {
    const scopeKey = buildActiveSessionScopeKey(roleHint);
    const fullKey = `${PORTAL_CACHE_PREFIX}${scopeKey}::${namespace}`;

    const memEntry = inMemoryPortalCache.get(fullKey);
    if (memEntry && Date.now() - memEntry.timestamp <= maxAgeMs) {
      return {
        data: memEntry.data as T,
        timestamp: memEntry.timestamp,
        isFresh: true,
      };
    }

    if (typeof window === 'undefined') return null;

    const raw =
      sessionStorage.getItem(fullKey) ||
      localStorage.getItem(fullKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.timestamp !== 'number') {
      return null;
    }
    if (Date.now() - parsed.timestamp > maxAgeMs) {
      return null;
    }
    inMemoryPortalCache.set(fullKey, parsed);
    return {
      data: parsed.data as T,
      timestamp: parsed.timestamp,
      isFresh: true,
    };
  } catch {
    return null;
  }
}

export function setPortalCache<T>(
  namespace: string,
  data: T,
  options?: { roleHint?: string; sessionOnly?: boolean }
): void {
  try {
    const scopeKey = buildActiveSessionScopeKey(options?.roleHint);
    const fullKey = `${PORTAL_CACHE_PREFIX}${scopeKey}::${namespace}`;
    const entry = {
      timestamp: Date.now(),
      data,
    };

    inMemoryPortalCache.set(fullKey, entry);

    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(entry);
    try {
      sessionStorage.setItem(fullKey, serialized);
    } catch {
      // Ignore storage quota warnings
    }
    if (!options?.sessionOnly) {
      try {
        localStorage.setItem(fullKey, serialized);
      } catch {
        // Ignore storage quota warnings
      }
    }
  } catch {
    // Ignore serialization warnings
  }
}

export function clearAllPortalCaches(): void {
  inMemoryPortalCache.clear();
  if (typeof window === 'undefined') return;

  for (const storage of [sessionStorage, localStorage]) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (
          k &&
          (k.startsWith(PORTAL_CACHE_PREFIX) ||
            k.startsWith('jaystar_entitlement_v2_') ||
            k.startsWith('jaystar_auth_guard_v2_'))
        ) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore storage errors
    }
  }
}
