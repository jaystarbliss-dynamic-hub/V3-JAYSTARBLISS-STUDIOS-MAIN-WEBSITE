import type { ProgramRecord } from './programHierarchy';
import { resolvePromotionCtaDestination, type PromotionCampaign } from './promotions';

/**
 * Canonical production base URL reconciled with netlify.toml.
 */
export const PRODUCTION_BASE_URL = 'https://jaystarblissstudios.com';

export function resolveProgramSlug(program: Pick<ProgramRecord, 'id' | 'slug'>): string {
  const rawSlug = String(program?.slug || '').trim();
  if (
    rawSlug &&
    !rawSlug.startsWith('http://') &&
    !rawSlug.startsWith('https://') &&
    !rawSlug.includes('/')
  ) {
    return rawSlug;
  }
  return String(program?.id || '').trim();
}

export function buildCanonicalProgramUrl(
  slugOrProgram: string | Pick<ProgramRecord, 'id' | 'slug'>,
  baseUrl: string = PRODUCTION_BASE_URL
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const slug =
    typeof slugOrProgram === 'string'
      ? slugOrProgram.trim().replace(/^\/+/, '')
      : resolveProgramSlug(slugOrProgram);
  if (!slug) return `${cleanBase}/programs`;
  return `${cleanBase}/programs/${encodeURIComponent(slug)}`;
}

export function buildCampaignShareUrl(
  campaign: Partial<PromotionCampaign>,
  baseUrl: string = PRODUCTION_BASE_URL
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');

  // If the campaign targets an individual programme, always share the canonical programme URL
  // with optional promo attribution query param so social crawlers and visitors land directly on the programme.
  if (campaign.ctaTargetType === 'INDIVIDUAL_PROGRAM') {
    const slug = String(campaign.programSlug || campaign.programId || '').trim();
    if (slug) {
      const target = `${cleanBase}/programs/${encodeURIComponent(slug)}`;
      return campaign.id ? `${target}?promo=${encodeURIComponent(campaign.id)}` : target;
    }
  }

  const dest = resolvePromotionCtaDestination(campaign);
  if (!dest) {
    return campaign.id
      ? `${cleanBase}/programs?promo=${encodeURIComponent(campaign.id)}`
      : `${cleanBase}/programs`;
  }

  if (dest.isExternal) {
    return dest.href;
  }

  // Internal destination
  const separator = dest.href.includes('?') ? '&' : '?';
  const hasHash = dest.href.includes('#');
  if (campaign.id) {
    if (hasHash) {
      const [beforeHash, hashPart] = dest.href.split('#');
      const sep = beforeHash.includes('?') ? '&' : '?';
      return `${cleanBase}${beforeHash}${sep}promo=${encodeURIComponent(campaign.id)}#${hashPart}`;
    }
    return `${cleanBase}${dest.href}${separator}promo=${encodeURIComponent(campaign.id)}`;
  }

  return `${cleanBase}${dest.href}`;
}

export interface SharePayload {
  title: string;
  text?: string;
  url: string;
}

export async function shareOrCopyLink(
  payload: SharePayload
): Promise<{ method: 'web-share' | 'clipboard' | 'cancelled' | 'failed' }> {
  const { title, text, url } = payload;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return { method: 'web-share' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { method: 'cancelled' };
      }
      // Fall through to clipboard copy
    }
  }

  const copied = await copyTextToClipboard(url);
  return { method: copied ? 'clipboard' : 'failed' };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Validates that a return path is strictly same-origin relative (starts with single `/`,
 * rejects protocol-relative `//`, absolute URLs, `javascript:`, newlines, etc.).
 */
export function validateSameOriginReturnPath(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\r\n\0]/.test(value)) return null;
  const lower = value.toLowerCase();
  if (lower.includes('javascript:') || lower.includes('data:') || lower.includes('vbscript:')) {
    return null;
  }
  try {
    const parsed = new URL(value, PRODUCTION_BASE_URL);
    if (parsed.origin !== PRODUCTION_BASE_URL) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function buildPortalProgramExplorePath(params: {
  role: 'student' | 'parent';
  programId?: string | null;
  programSlug?: string | null;
}): string {
  const basePath =
    params.role === 'parent' ? '/portal/parent/learning-tracks' : '/portal/student/courses';
  const query = new URLSearchParams();
  query.set('tab', 'explore');
  if (params.programId) query.set('programId', params.programId);
  if (params.programSlug) query.set('programSlug', params.programSlug);
  return `${basePath}?${query.toString()}`;
}

export function buildLoginReturnUrl(params: {
  returnTo?: string | null;
  programId?: string | null;
  programSlug?: string | null;
}): string {
  const query = new URLSearchParams();
  const safeReturn = validateSameOriginReturnPath(params.returnTo);
  if (safeReturn) query.set('returnTo', safeReturn);
  if (params.programId) query.set('programId', params.programId);
  if (params.programSlug) query.set('programSlug', params.programSlug);
  const qs = query.toString();
  return qs ? `/portal?${qs}` : '/portal';
}

export function buildRegisterProgramUrl(params: {
  programId?: string | null;
  programSlug?: string | null;
  mode?: 'student' | 'parent';
}): string {
  const query = new URLSearchParams();
  if (params.mode) query.set('mode', params.mode);
  if (params.programId) query.set('programId', params.programId);
  if (params.programSlug) query.set('programSlug', params.programSlug);
  const qs = query.toString();
  return qs ? `/register?${qs}` : '/register';
}
