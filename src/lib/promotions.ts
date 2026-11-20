import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  buildProgramCatalogueUrl,
  normalizeCanonicalRootKey,
  parseProgramTimestampMs,
  type CanonicalRootKey,
} from './programHierarchy';
import {
  evaluatePromotionVisibility,
  logBannerDiagnostic,
} from './bannerDiagnostics';

export type PromotionPlacement = 'HOME_CAROUSEL' | 'FIRST_VISIT_POPUP';
export type PromotionStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type PromotionCtaTargetType =
  | 'PROGRAM_CATALOG'
  | 'INDIVIDUAL_PROGRAM'
  | 'INTERNAL_PAGE'
  | 'EXTERNAL_URL';
export type PopupFrequency = 'ONCE_PER_BROWSER' | 'ONCE_PER_SESSION' | 'EVERY_N_DAYS';

export interface PromotionCampaign {
  id: string;
  title: string;
  subtitle?: string;
  placement: PromotionPlacement;
  status: PromotionStatus;
  desktopImageUrl: string;
  mobileImageUrl?: string;
  imageAlt: string;
  ctaLabel: string;
  ctaTargetType: PromotionCtaTargetType;
  programRootKey?: CanonicalRootKey | null;
  programId?: string | null;
  programSlug?: string | null;
  internalPath?: string | null;
  externalUrl?: string | null;
  sortOrder: number;
  startAt?: any;
  endAt?: any;
  popupFrequency?: PopupFrequency;
  popupIntervalDays?: number;
  popupDelayMs?: number;
  createdByUid?: string;
  updatedByUid?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ResolvedPromotionCta {
  href: string;
  isExternal: boolean;
}

export interface PopupStorageAdapter {
  getLocal: (key: string) => string | null;
  setLocal: (key: string, value: string) => void;
  getSession: (key: string) => string | null;
  setSession: (key: string, value: string) => void;
}

export const POPUP_BLOCKED_PREFIXES = [
  '/admin',
  '/portal',
  '/register',
  '/login',
  '/portal-preview',
];

export function isValidExternalHttpsUrl(raw?: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function isValidInternalPath(raw?: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return false;
  if (/[\r\n\0]/.test(trimmed)) return false;
  return true;
}

export function resolvePromotionCtaDestination(
  promo: Partial<PromotionCampaign>
): ResolvedPromotionCta | null {
  switch (promo.ctaTargetType) {
    case 'PROGRAM_CATALOG': {
      const rootKey = normalizeCanonicalRootKey(promo.programRootKey);
      return {
        href: buildProgramCatalogueUrl(rootKey),
        isExternal: false,
      };
    }
    case 'INDIVIDUAL_PROGRAM': {
      const slugOrId = String(promo.programSlug || promo.programId || '').trim();
      if (!slugOrId || slugOrId.includes('/') || slugOrId.includes('..')) {
        return null;
      }
      return {
        href: `/programs/${encodeURIComponent(slugOrId)}`,
        isExternal: false,
      };
    }
    case 'INTERNAL_PAGE': {
      const path = String(promo.internalPath || '').trim();
      if (!isValidInternalPath(path)) return null;
      return {
        href: path,
        isExternal: false,
      };
    }
    case 'EXTERNAL_URL': {
      const url = String(promo.externalUrl || '').trim();
      if (!isValidExternalHttpsUrl(url)) return null;
      return {
        href: url,
        isExternal: true,
      };
    }
    default:
      return null;
  }
}

export function isPromotionCurrentlyEligible(
  promo: Partial<PromotionCampaign>,
  nowMs: number = Date.now()
): boolean {
  if (!promo) return false;
  if (promo.status !== 'ACTIVE' && promo.status !== 'SCHEDULED') return false;
  const desktopImg = String(promo.desktopImageUrl || '').trim();
  const mobileImg = String(promo.mobileImageUrl || '').trim();
  if (!desktopImg && !mobileImg) return false;

  const startMs = parseProgramTimestampMs(promo.startAt);
  const endMs = parseProgramTimestampMs(promo.endAt);

  // SCHEDULED campaigns require a start time and go live automatically once startAt arrives.
  if (promo.status === 'SCHEDULED') {
    if (startMs === null || startMs <= 0 || nowMs < startMs) return false;
    if (endMs !== null && endMs > 0 && nowMs > endMs) return false;
    return true;
  }

  // ACTIVE campaigns publish immediately regardless of a future startAt date,
  // while still honoring endAt for automatic expiration.
  if (endMs !== null && endMs > 0 && nowMs > endMs) return false;
  return true;
}

export function selectPromotionImageUrl(
  promo: Partial<PromotionCampaign>,
  isMobileViewport: boolean
): string {
  const mobile = String(promo.mobileImageUrl || '').trim();
  const desktop = String(promo.desktopImageUrl || '').trim();
  if (isMobileViewport && mobile) return mobile;
  return desktop || mobile;
}

export function isPopupBlockedRoute(pathname: string): boolean {
  const normalized = String(pathname || '/').trim().toLowerCase();
  return POPUP_BLOCKED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

export function getPopupStorageKey(campaignId: string): string {
  return `jbs_promo_popup_${campaignId}`;
}

export function getBrowserPopupStorage(): PopupStorageAdapter {
  return {
    getLocal: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setLocal: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // ignore storage quota / privacy mode errors
      }
    },
    getSession: (key) => {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setSession: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
  };
}

export function shouldDisplayPopupCampaign(
  promo: PromotionCampaign,
  storage: PopupStorageAdapter,
  nowMs: number = Date.now()
): boolean {
  if (promo.placement !== 'FIRST_VISIT_POPUP') return false;
  if (!isPromotionCurrentlyEligible(promo, nowMs)) return false;

  const key = getPopupStorageKey(promo.id);
  const frequency: PopupFrequency = promo.popupFrequency || 'ONCE_PER_BROWSER';

  if (frequency === 'ONCE_PER_SESSION') {
    return !storage.getSession(key);
  }

  const rawStored = storage.getLocal(key);
  if (!rawStored) return true;

  if (frequency === 'ONCE_PER_BROWSER') {
    return false;
  }

  if (frequency === 'EVERY_N_DAYS') {
    const intervalDays = Math.max(1, Number(promo.popupIntervalDays) || 7);
    const lastSeenMs = Number(rawStored);
    if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return false;
    const elapsedMs = nowMs - lastSeenMs;
    return elapsedMs >= intervalDays * 24 * 60 * 60 * 1000;
  }

  return false;
}

export function recordPopupSeen(
  promo: PromotionCampaign,
  storage: PopupStorageAdapter,
  nowMs: number = Date.now()
): void {
  const key = getPopupStorageKey(promo.id);
  const frequency: PopupFrequency = promo.popupFrequency || 'ONCE_PER_BROWSER';
  if (frequency === 'ONCE_PER_SESSION') {
    storage.setSession(key, String(nowMs));
  } else {
    storage.setLocal(key, String(nowMs));
  }
}

export function normalizePromotionRecord(
  id: string,
  raw: Record<string, any>
): PromotionCampaign {
  const normalizedPlacement = String(raw.placement || '').trim().toUpperCase();
  const placement: PromotionPlacement =
    normalizedPlacement === 'FIRST_VISIT_POPUP' ? 'FIRST_VISIT_POPUP' : 'HOME_CAROUSEL';
  const validStatuses: PromotionStatus[] = [
    'DRAFT',
    'SCHEDULED',
    'ACTIVE',
    'PAUSED',
    'ARCHIVED',
  ];
  const normalizedStatus = String(raw.status || '').trim().toUpperCase() as PromotionStatus;
  const status: PromotionStatus = validStatuses.includes(normalizedStatus)
    ? normalizedStatus
    : 'DRAFT';

  const validTargets: PromotionCtaTargetType[] = [
    'PROGRAM_CATALOG',
    'INDIVIDUAL_PROGRAM',
    'INTERNAL_PAGE',
    'EXTERNAL_URL',
  ];
  const ctaTargetType: PromotionCtaTargetType = validTargets.includes(raw.ctaTargetType)
    ? raw.ctaTargetType
    : 'PROGRAM_CATALOG';

  const validFrequencies: PopupFrequency[] = [
    'ONCE_PER_BROWSER',
    'ONCE_PER_SESSION',
    'EVERY_N_DAYS',
  ];
  const popupFrequency: PopupFrequency = validFrequencies.includes(raw.popupFrequency)
    ? raw.popupFrequency
    : 'ONCE_PER_BROWSER';

  return {
    id,
    title: String(raw.title || '').trim(),
    subtitle: String(raw.subtitle || '').trim(),
    placement,
    status,
    desktopImageUrl: String(raw.desktopImageUrl || '').trim(),
    mobileImageUrl: String(raw.mobileImageUrl || '').trim(),
    imageAlt: String(raw.imageAlt || raw.title || 'Jaystarbliss Studios Promotion').trim(),
    ctaLabel: String(raw.ctaLabel || 'Learn More').trim(),
    ctaTargetType,
    programRootKey: normalizeCanonicalRootKey(raw.programRootKey),
    programId: raw.programId ? String(raw.programId).trim() : null,
    programSlug: raw.programSlug ? String(raw.programSlug).trim() : null,
    internalPath: raw.internalPath ? String(raw.internalPath).trim() : null,
    externalUrl: raw.externalUrl ? String(raw.externalUrl).trim() : null,
    sortOrder: typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
    startAt: raw.startAt ?? null,
    endAt: raw.endAt ?? null,
    popupFrequency,
    popupIntervalDays:
      typeof raw.popupIntervalDays === 'number' && raw.popupIntervalDays > 0
        ? raw.popupIntervalDays
        : 7,
    popupDelayMs:
      typeof raw.popupDelayMs === 'number' && raw.popupDelayMs >= 0
        ? raw.popupDelayMs
        : 2200,
    createdByUid: raw.createdByUid ? String(raw.createdByUid) : undefined,
    updatedByUid: raw.updatedByUid ? String(raw.updatedByUid) : undefined,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

export async function fetchAllPromotions(): Promise<PromotionCampaign[]> {
  const snap = await getDocs(collection(db, 'promotions'));
  return snap.docs
    .map((d) => normalizePromotionRecord(d.id, d.data() as Record<string, any>))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (parseProgramTimestampMs(b.createdAt) ?? 0) - (parseProgramTimestampMs(a.createdAt) ?? 0);
    });
}

function filterAndSortPublicPromotions(
  items: PromotionCampaign[],
  placement: PromotionPlacement,
  nowMs: number
): PromotionCampaign[] {
  const deduped = new Map<string, PromotionCampaign>();
  for (const item of items) {
    if (item.placement !== placement) continue;
    if (!isPromotionCurrentlyEligible(item, nowMs)) continue;
    deduped.set(item.id, item);
  }
  return Array.from(deduped.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return (parseProgramTimestampMs(b.createdAt) ?? 0) - (parseProgramTimestampMs(a.createdAt) ?? 0);
  });
}

export async function fetchActivePublicPromotions(
  placement: PromotionPlacement,
  nowMs: number = Date.now()
): Promise<PromotionCampaign[]> {
  // Use single-field status queries so no composite index is required on any Firestore edition
  // and Firestore public read security rules statically authorize every query.
  const qActive = query(collection(db, 'promotions'), where('status', '==', 'ACTIVE'));
  const qScheduled = query(collection(db, 'promotions'), where('status', '==', 'SCHEDULED'));
  const [activeRes, scheduledRes] = await Promise.allSettled([
    getDocs(qActive),
    getDocs(qScheduled),
  ]);

  const combined: PromotionCampaign[] = [];
  let activeCount = 0;
  let scheduledCount = 0;
  let activeError: string | null = null;
  let scheduledError: string | null = null;

  if (activeRes.status === 'fulfilled') {
    activeCount = activeRes.value.docs.length;
    activeRes.value.docs.forEach((d) =>
      combined.push(normalizePromotionRecord(d.id, d.data() as Record<string, any>))
    );
  } else {
    activeError = `${activeRes.reason?.code || 'error'}: ${activeRes.reason?.message || String(activeRes.reason)}`;
  }

  if (scheduledRes.status === 'fulfilled') {
    scheduledCount = scheduledRes.value.docs.length;
    scheduledRes.value.docs.forEach((d) =>
      combined.push(normalizePromotionRecord(d.id, d.data() as Record<string, any>))
    );
  } else {
    scheduledError = `${scheduledRes.reason?.code || 'error'}: ${scheduledRes.reason?.message || String(scheduledRes.reason)}`;
  }

  if (activeRes.status === 'rejected' && scheduledRes.status === 'rejected') {
    logBannerDiagnostic(
      'PromotionsSubscription',
      'fetch_error',
      { placement, activeError, scheduledError },
      'error'
    );
    throw activeRes.reason;
  }

  const eligible = filterAndSortPublicPromotions(combined, placement, nowMs);
  const evaluations = combined.map((item) =>
    evaluatePromotionVisibility(item, placement, nowMs)
  );
  logBannerDiagnostic(
    'PromotionsSubscription',
    'fetch_completed',
    {
      placement,
      rawActiveCount: activeCount,
      rawScheduledCount: scheduledCount,
      eligibleCount: eligible.length,
      eligibleIds: eligible.map((c) => c.id),
      activeError,
      scheduledError,
      evaluations,
    },
    eligible.length === 0 && combined.length > 0 ? 'warn' : 'info'
  );

  return eligible;
}

export function subscribeActivePublicPromotions(
  placement: PromotionPlacement,
  onUpdate: (campaigns: PromotionCampaign[]) => void,
  onError?: (err: unknown) => void
): () => void {
  let activeDocs: PromotionCampaign[] = [];
  let scheduledDocs: PromotionCampaign[] = [];
  let activeReady = false;
  let scheduledReady = false;
  let activeMeta: { size: number; fromCache: boolean; hasPendingWrites: boolean } | null = null;
  let scheduledMeta: { size: number; fromCache: boolean; hasPendingWrites: boolean } | null = null;

  logBannerDiagnostic('PromotionsSubscription', 'subscribed', {
    placement,
    collection: 'promotions',
    queries: ['status == ACTIVE', 'status == SCHEDULED'],
  });

  const emit = (source: 'ACTIVE' | 'SCHEDULED') => {
    const nowMs = Date.now();
    const combined = [...activeDocs, ...scheduledDocs];
    const eligible = filterAndSortPublicPromotions(combined, placement, nowMs);
    const evaluations = combined.map((item) =>
      evaluatePromotionVisibility(item, placement, nowMs)
    );

    logBannerDiagnostic(
      'PromotionsSubscription',
      'snapshot_received',
      {
        placement,
        source,
        activeReady,
        scheduledReady,
        rawActiveCount: activeDocs.length,
        rawScheduledCount: scheduledDocs.length,
        eligibleCount: eligible.length,
        eligibleIds: eligible.map((c) => c.id),
        metadata: { active: activeMeta, scheduled: scheduledMeta },
        evaluations,
      },
      eligible.length === 0 && combined.length > 0 ? 'warn' : 'info'
    );

    onUpdate(eligible);
  };

  const unsubActive = onSnapshot(
    query(collection(db, 'promotions'), where('status', '==', 'ACTIVE')),
    (snap) => {
      activeReady = true;
      activeMeta = {
        size: snap.size,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      };
      activeDocs = snap.docs.map((d) =>
        normalizePromotionRecord(d.id, d.data() as Record<string, any>)
      );
      emit('ACTIVE');
    },
    (err: any) => {
      logBannerDiagnostic(
        'PromotionsSubscription',
        'snapshot_error',
        {
          placement,
          source: 'ACTIVE',
          code: err?.code || 'unknown',
          message: err?.message || String(err),
        },
        'error'
      );
      onError?.(err);
      if (!activeReady && !scheduledReady) onUpdate([]);
    }
  );

  const unsubScheduled = onSnapshot(
    query(collection(db, 'promotions'), where('status', '==', 'SCHEDULED')),
    (snap) => {
      scheduledReady = true;
      scheduledMeta = {
        size: snap.size,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      };
      scheduledDocs = snap.docs.map((d) =>
        normalizePromotionRecord(d.id, d.data() as Record<string, any>)
      );
      emit('SCHEDULED');
    },
    (err: any) => {
      logBannerDiagnostic(
        'PromotionsSubscription',
        'snapshot_error',
        {
          placement,
          source: 'SCHEDULED',
          code: err?.code || 'unknown',
          message: err?.message || String(err),
        },
        'warn'
      );
    }
  );

  return () => {
    unsubActive();
    unsubScheduled();
  };
}

export async function savePromotionCampaign(
  campaign: Omit<PromotionCampaign, 'id'> & { id?: string },
  actorUid?: string
): Promise<string> {
  const targetId = campaign.id || doc(collection(db, 'promotions')).id;
  const nowIso = new Date().toISOString();
  const payload: Record<string, any> = {
    title: campaign.title.trim(),
    subtitle: (campaign.subtitle || '').trim(),
    placement: campaign.placement,
    status: campaign.status,
    desktopImageUrl: campaign.desktopImageUrl.trim(),
    mobileImageUrl: (campaign.mobileImageUrl || '').trim(),
    imageAlt: (campaign.imageAlt || campaign.title).trim(),
    ctaLabel: campaign.ctaLabel.trim() || 'Learn More',
    ctaTargetType: campaign.ctaTargetType,
    programRootKey:
      campaign.ctaTargetType === 'PROGRAM_CATALOG'
        ? normalizeCanonicalRootKey(campaign.programRootKey)
        : null,
    programId: campaign.ctaTargetType === 'INDIVIDUAL_PROGRAM' ? campaign.programId || null : null,
    programSlug:
      campaign.ctaTargetType === 'INDIVIDUAL_PROGRAM' ? campaign.programSlug || null : null,
    internalPath:
      campaign.ctaTargetType === 'INTERNAL_PAGE' ? (campaign.internalPath || '').trim() || null : null,
    externalUrl:
      campaign.ctaTargetType === 'EXTERNAL_URL' ? (campaign.externalUrl || '').trim() || null : null,
    sortOrder: Number.isFinite(campaign.sortOrder) ? Number(campaign.sortOrder) : 0,
    startAt: campaign.startAt || null,
    endAt: campaign.endAt || null,
    popupFrequency: campaign.popupFrequency || 'ONCE_PER_BROWSER',
    popupIntervalDays: Math.max(1, Number(campaign.popupIntervalDays) || 7),
    popupDelayMs: Math.max(0, Number(campaign.popupDelayMs) ?? 2200),
    updatedByUid: actorUid || '',
    updatedAt: serverTimestamp(),
  };

  if (!campaign.id) {
    payload.createdByUid = actorUid || '';
    payload.createdAt = nowIso;
  }

  await setDoc(doc(db, 'promotions', targetId), payload, { merge: true });
  logBannerDiagnostic('PromotionsSubscription', 'save_written', {
    id: targetId,
    title: payload.title,
    placement: payload.placement,
    status: payload.status,
    hasDesktopImage: Boolean(payload.desktopImageUrl),
    hasMobileImage: Boolean(payload.mobileImageUrl),
    startAt: payload.startAt,
    endAt: payload.endAt,
    ctaTargetType: payload.ctaTargetType,
  });
  return targetId;
}

export async function updatePromotionStatus(
  id: string,
  status: PromotionStatus,
  actorUid?: string
): Promise<void> {
  await updateDoc(doc(db, 'promotions', id), {
    status,
    updatedByUid: actorUid || '',
    updatedAt: serverTimestamp(),
  });
}

export async function reorderPromotions(orderedIds: string[], actorUid?: string): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, idx) => {
    batch.update(doc(db, 'promotions', id), {
      sortOrder: idx + 1,
      updatedByUid: actorUid || '',
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function deletePromotionCampaign(id: string): Promise<void> {
  await deleteDoc(doc(db, 'promotions', id));
}
