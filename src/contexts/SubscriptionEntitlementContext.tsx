import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { PortalEntitlementResult } from '../../api/_lib/subscription-core';
import { isPortalRouteAllowedDuringLockdown } from '../../api/_lib/subscription-core';
import { evaluatePortalEntitlementFromFirestore } from '../lib/subscriptionEntitlementFallback';
import { isMasqueradingActive } from '../utils/impersonation';
import { getPortalCache, setPortalCache } from '../lib/portalDataCache';

export const ENTITLEMENT_REFRESH_EVENT = 'jaystarbliss:entitlement-refresh';
const ENTITLEMENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours per login session

export function triggerEntitlementRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ENTITLEMENT_REFRESH_EVENT));
  }
}

interface SubscriptionEntitlementContextValue {
  entitlement: PortalEntitlementResult | null;
  loading: boolean;
  error: string | null;
  refreshEntitlement: () => Promise<PortalEntitlementResult | null>;
  isRouteAllowed: (pathname: string) => boolean;
  isNavPathLocked: (path: string) => boolean;
  isChildLocked: (childId: string) => boolean;
}

const SubscriptionEntitlementContext = createContext<SubscriptionEntitlementContextValue>({
  entitlement: null,
  loading: false,
  error: null,
  refreshEntitlement: async () => null,
  isRouteAllowed: () => true,
  isNavPathLocked: () => false,
  isChildLocked: () => false,
});

export const SubscriptionEntitlementProvider: React.FC<{
  role: string;
  children: React.ReactNode;
}> = ({ role, children }) => {
  const normalizedRole = role.toLowerCase();
  const isManagedRole = ['school', 'student', 'parent'].includes(normalizedRole);
  const initialCached = isManagedRole
    ? getPortalCache<PortalEntitlementResult>('entitlement', normalizedRole, ENTITLEMENT_SESSION_TTL_MS)
    : null;
  const [entitlement, setEntitlement] = useState<PortalEntitlementResult | null>(() => initialCached?.data ?? null);
  const [loading, setLoading] = useState<boolean>(() => isManagedRole && !initialCached?.data);
  const [error, setError] = useState<string | null>(null);

  const persistEntitlement = useCallback(
    (result: PortalEntitlementResult | null) => {
      setEntitlement(result);
      if (result && isManagedRole) {
        setPortalCache('entitlement', result, { roleHint: normalizedRole, sessionOnly: true });
      }
    },
    [isManagedRole, normalizedRole]
  );

  const fetchEntitlement = useCallback(async (): Promise<PortalEntitlementResult | null> => {
    if (!isManagedRole) {
      setEntitlement(null);
      setLoading(false);
      return null;
    }

    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return null;
    }

    const resolveViaFirestore = async (): Promise<PortalEntitlementResult | null> => {
      try {
        const clientResult = await evaluatePortalEntitlementFromFirestore(normalizedRole);
        if (clientResult) {
          persistEntitlement(clientResult);
          setError(null);
          return clientResult;
        }
      } catch (fallbackErr) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : 'Unable to verify subscription status.');
      }
      return null;
    };

    try {
      // When a platform administrator is impersonating/viewing a school, parent, or student account,
      // evaluate the target account's actual entitlement from Firestore so restricted states are faithfully shown.
      if (isMasqueradingActive()) {
        return await resolveViaFirestore();
      }

      const token = await user.getIdToken();
      const response = await fetch('/api/subscription-status', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {};

      if ((response.ok || response.status === 423) && payload?.entitlement) {
        const resolved = payload.entitlement as PortalEntitlementResult;
        persistEntitlement(resolved);
        setError(null);
        return resolved;
      }

      // Preview / Vite dev fallback (`{ ok: true, fallback: true }`) or unavailable serverless function
      return await resolveViaFirestore();
    } catch {
      return await resolveViaFirestore();
    } finally {
      setLoading(false);
    }
  }, [isManagedRole, normalizedRole, persistEntitlement]);

  useEffect(() => {
    if (!isManagedRole) {
      setEntitlement(null);
      setLoading(false);
      return;
    }

    let active = true;
    const existingCache = getPortalCache<PortalEntitlementResult>(
      'entitlement',
      normalizedRole,
      ENTITLEMENT_SESSION_TTL_MS
    );
    if (existingCache?.data) {
      setEntitlement(existingCache.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (user) {
        const sessionCached = getPortalCache<PortalEntitlementResult>(
          'entitlement',
          normalizedRole,
          ENTITLEMENT_SESSION_TTL_MS
        );
        if (sessionCached?.data) {
          setEntitlement(sessionCached.data);
          setLoading(false);
        } else {
          void fetchEntitlement();
        }
      } else {
        setEntitlement(null);
        setLoading(false);
      }
    });

    const handleManualRefresh = () => {
      void fetchEntitlement();
    };
    window.addEventListener(ENTITLEMENT_REFRESH_EVENT, handleManualRefresh);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener(ENTITLEMENT_REFRESH_EVENT, handleManualRefresh);
    };
  }, [isManagedRole, normalizedRole, fetchEntitlement]);

  // Live Firestore listener on the active subscription document so admin lock/unlock or payment changes
  // take effect immediately on open school, parent, and student portals without polling on every tab switch.
  const activeSubscriptionId = entitlement?.subscriptionId || null;
  useEffect(() => {
    if (!isManagedRole || !activeSubscriptionId || !auth.currentUser) return;
    let firstSnapshot = true;
    const unsub = onSnapshot(
      doc(db, 'billingSubscriptions', activeSubscriptionId),
      () => {
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        void fetchEntitlement();
      },
      () => undefined
    );
    return () => unsub();
  }, [isManagedRole, activeSubscriptionId, fetchEntitlement]);

  // Live Firestore listener on accountRestrictions for the resolved account so manual admin locks/unlocks
  // take effect immediately even if subscriptionId hasn't changed.
  const activeAccountId = entitlement?.accountId || null;
  useEffect(() => {
    if (!isManagedRole || !activeAccountId || !auth.currentUser) return;
    let firstSnapshot = true;
    const unsub = onSnapshot(
      query(collection(db, 'accountRestrictions'), where('targetAccountId', '==', activeAccountId)),
      () => {
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        void fetchEntitlement();
      },
      () => undefined
    );
    return () => unsub();
  }, [isManagedRole, activeAccountId, fetchEntitlement]);

  const isRouteAllowed = useCallback(
    (pathname: string) => {
      if (!entitlement || !entitlement.isLocked) return true;
      // For parents with multiple children where at least one child is still active,
      // allow navigation so the paid child's views remain usable (while locked child data is filtered server-side)
      if (entitlement.role === 'parent' && !entitlement.allChildrenLocked) {
        return true;
      }
      return isPortalRouteAllowedDuringLockdown(pathname, entitlement);
    },
    [entitlement]
  );

  const isNavPathLocked = useCallback(
    (path: string) => {
      if (!entitlement || !entitlement.isLocked) return false;
      if (entitlement.role === 'parent' && !entitlement.allChildrenLocked) {
        return false;
      }
      return !isPortalRouteAllowedDuringLockdown(path, entitlement);
    },
    [entitlement]
  );

  const isChildLocked = useCallback(
    (childId: string) => {
      if (!entitlement || !childId) return false;
      return (entitlement.lockedChildIds || []).includes(childId);
    },
    [entitlement]
  );

  const value = useMemo(
    () => ({
      entitlement,
      loading,
      error,
      refreshEntitlement: fetchEntitlement,
      isRouteAllowed,
      isNavPathLocked,
      isChildLocked,
    }),
    [entitlement, loading, error, fetchEntitlement, isRouteAllowed, isNavPathLocked, isChildLocked]
  );

  return (
    <SubscriptionEntitlementContext.Provider value={value}>
      {children}
    </SubscriptionEntitlementContext.Provider>
  );
};

export function useSubscriptionEntitlement(): SubscriptionEntitlementContextValue {
  return useContext(SubscriptionEntitlementContext);
}
