import { parseProgramTimestampMs } from './programHierarchy';
import type {
  PopupFrequency,
  PopupStorageAdapter,
  PromotionCampaign,
  PromotionPlacement,
} from './promotions';

export type BannerDiagnosticLevel = 'info' | 'warn' | 'error';

export type BannerDiagnosticComponent =
  | 'MarqueeBanner'
  | 'HomePromotionsCarousel'
  | 'FirstVisitPromoPopup'
  | 'PromotionsSubscription'
  | 'AdminPromotions'
  | 'AdminSettings';

export interface BannerDiagnosticEntry {
  timestamp: string;
  component: BannerDiagnosticComponent;
  stage: string;
  level: BannerDiagnosticLevel;
  details: Record<string, unknown>;
}

export interface PromotionVisibilityReport {
  id: string;
  title: string;
  placement: string;
  expectedPlacement: PromotionPlacement;
  status: string;
  hasDesktopImage: boolean;
  hasMobileImage: boolean;
  startAtMs: number | null;
  endAtMs: number | null;
  eligible: boolean;
  reasons: string[];
}

export interface PopupDisplayDiagnostic {
  id: string;
  title: string;
  eligible: boolean;
  canDisplay: boolean;
  storageKey: string;
  frequency: PopupFrequency;
  storedValue: string | null;
  reasons: string[];
}

const MAX_DIAGNOSTIC_ENTRIES = 120;
const diagnosticEntries: BannerDiagnosticEntry[] = [];

declare global {
  interface Window {
    __JBS_BANNER_DIAGNOSTICS__?: {
      entries: BannerDiagnosticEntry[];
      getLatestByComponent: () => Record<string, BannerDiagnosticEntry>;
      clear: () => void;
    };
  }
}

function attachWindowDiagnosticsHandle(): void {
  if (typeof window === 'undefined') return;
  if (!window.__JBS_BANNER_DIAGNOSTICS__) {
    window.__JBS_BANNER_DIAGNOSTICS__ = {
      entries: diagnosticEntries,
      getLatestByComponent: () => {
        const latest: Record<string, BannerDiagnosticEntry> = {};
        for (const entry of diagnosticEntries) {
          latest[entry.component] = entry;
        }
        return latest;
      },
      clear: () => {
        diagnosticEntries.length = 0;
      },
    };
  }
}

export function logBannerDiagnostic(
  component: BannerDiagnosticComponent,
  stage: string,
  details: Record<string, unknown> = {},
  level: BannerDiagnosticLevel = 'info'
): BannerDiagnosticEntry {
  const entry: BannerDiagnosticEntry = {
    timestamp: new Date().toISOString(),
    component,
    stage,
    level,
    details,
  };

  diagnosticEntries.push(entry);
  if (diagnosticEntries.length > MAX_DIAGNOSTIC_ENTRIES) {
    diagnosticEntries.splice(0, diagnosticEntries.length - MAX_DIAGNOSTIC_ENTRIES);
  }
  attachWindowDiagnosticsHandle();

  const prefix = `[BannerDiagnostics][${component}][${stage}]`;
  if (level === 'error') {
    console.error(prefix, details);
  } else if (level === 'warn') {
    console.warn(prefix, details);
  } else {
    console.info(prefix, details);
  }

  return entry;
}

export function getBannerDiagnosticEntries(): BannerDiagnosticEntry[] {
  return [...diagnosticEntries];
}

export function evaluatePromotionVisibility(
  promo: Partial<PromotionCampaign>,
  expectedPlacement: PromotionPlacement,
  nowMs: number = Date.now()
): PromotionVisibilityReport {
  const reasons: string[] = [];
  const id = String(promo?.id || '(unknown)');
  const title = String(promo?.title || '(untitled)');
  const placement = String(promo?.placement || '(missing)');
  const status = String(promo?.status || '(missing)');
  const desktopImg = String(promo?.desktopImageUrl || '').trim();
  const mobileImg = String(promo?.mobileImageUrl || '').trim();
  const hasDesktopImage = Boolean(desktopImg);
  const hasMobileImage = Boolean(mobileImg);
  const startAtMs = parseProgramTimestampMs(promo?.startAt);
  const endAtMs = parseProgramTimestampMs(promo?.endAt);

  if (placement !== expectedPlacement) {
    reasons.push(`placement_mismatch (expected ${expectedPlacement}, got ${placement})`);
  }

  if (status !== 'ACTIVE' && status !== 'SCHEDULED') {
    reasons.push(`inactive_status (status=${status})`);
  }

  if (!hasDesktopImage && !hasMobileImage) {
    reasons.push('missing_image_url (both desktopImageUrl and mobileImageUrl are empty)');
  }

  if (status === 'SCHEDULED') {
    if (startAtMs === null || startAtMs <= 0) {
      reasons.push('scheduled_missing_start_date');
    } else if (nowMs < startAtMs) {
      reasons.push(`not_yet_started (starts ${new Date(startAtMs).toISOString()})`);
    }
  }

  if (endAtMs !== null && endAtMs > 0 && nowMs > endAtMs) {
    reasons.push(`expired (ended ${new Date(endAtMs).toISOString()})`);
  }

  return {
    id,
    title,
    placement,
    expectedPlacement,
    status,
    hasDesktopImage,
    hasMobileImage,
    startAtMs,
    endAtMs,
    eligible: reasons.length === 0,
    reasons,
  };
}

export function evaluatePopupDisplayStatus(
  promo: PromotionCampaign,
  storage: PopupStorageAdapter,
  nowMs: number = Date.now()
): PopupDisplayDiagnostic {
  const visibility = evaluatePromotionVisibility(promo, 'FIRST_VISIT_POPUP', nowMs);
  const storageKey = `jbs_promo_popup_${promo.id}`;
  const frequency: PopupFrequency = promo.popupFrequency || 'ONCE_PER_BROWSER';
  const storedValue =
    frequency === 'ONCE_PER_SESSION'
      ? storage.getSession(storageKey)
      : storage.getLocal(storageKey);

  const reasons = [...visibility.reasons];

  if (visibility.eligible) {
    if (frequency === 'ONCE_PER_SESSION' && storedValue) {
      reasons.push(`popup_already_seen_this_session (key=${storageKey}, value=${storedValue})`);
    } else if (frequency === 'ONCE_PER_BROWSER' && storedValue) {
      reasons.push(`popup_already_seen_in_browser (key=${storageKey}, value=${storedValue})`);
    } else if (frequency === 'EVERY_N_DAYS' && storedValue) {
      const intervalDays = Math.max(1, Number(promo.popupIntervalDays) || 7);
      const lastSeenMs = Number(storedValue);
      const requiredMs = intervalDays * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) {
        reasons.push(`popup_invalid_stored_timestamp (key=${storageKey}, value=${storedValue})`);
      } else if (nowMs - lastSeenMs < requiredMs) {
        const nextEligibleAt = new Date(lastSeenMs + requiredMs).toISOString();
        reasons.push(`popup_cooldown_active (nextEligibleAt=${nextEligibleAt})`);
      }
    }
  }

  return {
    id: promo.id,
    title: promo.title,
    eligible: visibility.eligible,
    canDisplay: reasons.length === 0,
    storageKey,
    frequency,
    storedValue,
    reasons,
  };
}
