/**
 * Pure, runtime-agnostic OpenGraph / Twitter social metadata builder used by the
 * Netlify Edge Function for `/programs/*` (and tested directly in unit tests).
 */

export const SOCIAL_PRODUCTION_BASE_URL = 'https://jaystarblissstudios.com';
export const SOCIAL_BRAND_NAME = 'Jaystarbliss Studios';
export const SOCIAL_DEFAULT_IMAGE = `${SOCIAL_PRODUCTION_BASE_URL}/favicon.png`;
export const SOCIAL_DEFAULT_DESCRIPTION =
  'Explore technology, design & graphics, music, and academic learning programmes at Jaystarbliss Studios.';

export interface SocialMetaProgram {
  id: string;
  title: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  featuredImage?: string;
  image?: string;
  bannerUrl?: string;
  status?: string;
  isPublished?: boolean;
  isArchived?: boolean;
}

export interface SocialMetaPromo {
  id: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  status?: string;
  isActive?: boolean;
}

export interface SocialMetaTags {
  title: string;
  description: string;
  image: string;
  url: string;
  type: 'website' | 'article';
  noindex: boolean;
}

const CRAWLER_USER_AGENT_REGEX =
  /(whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|pinterest|applebot|googlebot|bingbot|embedly|quora link preview|vkshare|w3c_validator|skypeuripreview|redditbot|iframely)/i;

export function isSocialOrSearchCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return CRAWLER_USER_AGENT_REGEX.test(userAgent);
}

export function escapeHtmlAttribute(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function normalizeAbsoluteMediaUrl(
  rawUrl: string | null | undefined,
  baseUrl: string = SOCIAL_PRODUCTION_BASE_URL
): string {
  const cleaned = String(rawUrl || '').trim();
  if (!cleaned) return `${baseUrl.replace(/\/+$/, '')}/favicon.png`;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith('/')) return `${baseUrl.replace(/\/+$/, '')}${cleaned}`;
  return `${baseUrl.replace(/\/+$/, '')}/${cleaned}`;
}

export function isProgramPubliclyShareable(program: SocialMetaProgram | null | undefined): boolean {
  if (!program) return false;
  if (program.isArchived === true) return false;
  if (program.isPublished === false) return false;
  const status = String(program.status || 'PUBLISHED').toUpperCase();
  return status === 'PUBLISHED';
}

/**
 * Computes safe OpenGraph / Twitter metadata for a programme route.
 * Never exposes draft, archived, or private programmes.
 */
export function buildProgramSocialMeta(params: {
  slugOrId: string;
  program: SocialMetaProgram | null;
  promo?: SocialMetaPromo | null;
  baseUrl?: string;
}): SocialMetaTags {
  const base = (params.baseUrl || SOCIAL_PRODUCTION_BASE_URL).replace(/\/+$/, '');
  const slugSegment = encodeURIComponent(String(params.slugOrId || '').trim());

  if (!params.program || !isProgramPubliclyShareable(params.program)) {
    return {
      title: `Programmes | ${SOCIAL_BRAND_NAME}`,
      description: SOCIAL_DEFAULT_DESCRIPTION,
      image: SOCIAL_DEFAULT_IMAGE,
      url: `${base}/programs`,
      type: 'website',
      noindex: true,
    };
  }

  const canonicalSlug =
    params.program.slug &&
    !params.program.slug.includes('/') &&
    !/^https?:\/\//i.test(params.program.slug)
      ? encodeURIComponent(params.program.slug)
      : encodeURIComponent(params.program.id || slugSegment);

  const activePromo =
    params.promo &&
    params.promo.isActive !== false &&
    String(params.promo.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
      ? params.promo
      : null;

  const titleCore = activePromo?.title
    ? `${activePromo.title} — ${params.program.title}`
    : params.program.title;

  const descriptionCore =
    activePromo?.subtitle ||
    params.program.shortDescription ||
    params.program.description ||
    `Explore ${params.program.title} at ${SOCIAL_BRAND_NAME}.`;

  const rawImage =
    activePromo?.imageUrl ||
    activePromo?.mobileImageUrl ||
    params.program.featuredImage ||
    params.program.image ||
    params.program.bannerUrl ||
    '';

  const canonicalUrl = activePromo
    ? `${base}/programs/${canonicalSlug}?promo=${encodeURIComponent(activePromo.id)}`
    : `${base}/programs/${canonicalSlug}`;

  return {
    title: `${titleCore} | ${SOCIAL_BRAND_NAME}`,
    description: String(descriptionCore).replace(/\s+/g, ' ').trim().slice(0, 260),
    image: normalizeAbsoluteMediaUrl(rawImage, base),
    url: canonicalUrl,
    type: 'website',
    noindex: false,
  };
}

/**
 * Parses a Firestore REST API document object (`fields: { key: { stringValue... } }`)
 * into a flat JavaScript object.
 */
export function parseFirestoreRestFields(
  fields: Record<string, any> | undefined | null
): Record<string, any> {
  if (!fields || typeof fields !== 'object') return {};
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (!val || typeof val !== 'object') continue;
    if ('stringValue' in val) result[key] = val.stringValue;
    else if ('booleanValue' in val) result[key] = Boolean(val.booleanValue);
    else if ('integerValue' in val) result[key] = Number(val.integerValue);
    else if ('doubleValue' in val) result[key] = Number(val.doubleValue);
    else if ('timestampValue' in val) result[key] = val.timestampValue;
    else if ('nullValue' in val) result[key] = null;
    else if ('arrayValue' in val && Array.isArray(val.arrayValue?.values)) {
      result[key] = val.arrayValue.values.map((item: any) => {
        if ('stringValue' in item) return item.stringValue;
        if ('integerValue' in item) return Number(item.integerValue);
        if ('booleanValue' in item) return Boolean(item.booleanValue);
        return null;
      });
    } else if ('mapValue' in val && val.mapValue?.fields) {
      result[key] = parseFirestoreRestFields(val.mapValue.fields);
    }
  }
  return result;
}

/**
 * Injects dynamic OpenGraph, Twitter Card, canonical, and title tags into an HTML document
 * before `</head>` while stripping duplicate existing og:/twitter:/canonical tags.
 */
export function injectSocialMetaIntoHtml(html: string, tags: SocialMetaTags): string {
  const safeTitle = escapeHtmlAttribute(tags.title);
  const safeDesc = escapeHtmlAttribute(tags.description);
  const safeImage = escapeHtmlAttribute(tags.image);
  const safeUrl = escapeHtmlAttribute(tags.url);

  let cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

  const metaBlock = [
    `<title>${safeTitle}</title>`,
    `<meta name="description" content="${safeDesc}" />`,
    tags.noindex ? `<meta name="robots" content="noindex, nofollow" />` : '',
    `<link rel="canonical" href="${safeUrl}" />`,
    `<meta property="og:site_name" content="${escapeHtmlAttribute(SOCIAL_BRAND_NAME)}" />`,
    `<meta property="og:type" content="${tags.type}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:image" content="${safeImage}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeImage}" />`,
  ]
    .filter(Boolean)
    .join('\n    ');

  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, `    ${metaBlock}\n  </head>`);
  }
  return `${metaBlock}\n${cleaned}`;
}
