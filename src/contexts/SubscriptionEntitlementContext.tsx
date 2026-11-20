import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { PortalEntitlementResult } from '../../api/_lib/subscription-core';
import { isPortalRouteAllowedDuringLockdown } from '../../api/_lib/subscription-core';

export const ENTITLEMENT_REFRESH_EVENT = 'jaystarbliss:entitlement-refresh';

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
  const isManagedRole = ['school', 'student', 'parent'].includes(role.toLowerCase());
  const [entitlement, setEntitlement] = useState<PortalEntitlementResult | null>(null);
  const [loading, setLoading] = useState<boolean>(isManagedRole);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/subscription-status', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.entitlement) {
        setEntitlement(payload.entitlement as PortalEntitlementResult);
        setError(null);
        return payload.entitlement as PortalEntitlementResult;
      }
      if (response.status === 423 && payload?.entitlement) {
        setEntitlement(payload.entitlement as PortalEntitlementResult);
        setError(null);
        return payload.entitlement as PortalEntitlementResult;
      }
      setError(payload?.error || null);
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify subscription status.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isManagedRole]);

  useEffect(() => {
    if (!isManagedRole) {
      setEntitlement(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (user) {
        void fetchEntitlement();
      } else {
        setEntitlement(null);
        setLoading(false);
      }
    });

    const handleManualRefresh = () => {
      void fetchEntitlement();
    };
    window.addEventListener(ENTITLEMENT_REFRESH_EVENT, handleManualRefresh);

    // Re-verify silently when tab regains focus so stale open tabs cannot bypass lockdown
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        void fetchEntitlement();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener(ENTITLEMENT_REFRESH_EVENT, handleManualRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isManagedRole, fetchEntitlement]);

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
