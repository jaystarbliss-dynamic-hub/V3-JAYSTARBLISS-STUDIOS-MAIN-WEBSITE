import {
  SOCIAL_PRODUCTION_BASE_URL,
  buildProgramSocialMeta,
  injectSocialMetaIntoHtml,
  isSocialOrSearchCrawler,
  parseFirestoreRestFields,
  type SocialMetaProgram,
  type SocialMetaPromo,
} from '../../src/lib/socialMetaBuilder.ts';

const DEFAULT_FIREBASE_PROJECT_ID = 'jaystarbliss-studios';
const DEFAULT_FIREBASE_DATABASE_ID = '(default)';

async function fetchProgramViaFirestoreRest(
  slugOrId: string,
  projectId: string,
  databaseId: string
): Promise<SocialMetaProgram | null> {
  const baseEndpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents`;

  // 1. Try querying by exact slug
  try {
    const queryRes = await fetch(`${baseEndpoint}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'programs' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'slug' },
              op: 'EQUAL',
              value: { stringValue: slugOrId },
            },
          },
          limit: 1,
        },
      }),
    });
    if (queryRes.ok) {
      const rows = (await queryRes.json()) as Array<{ document?: { name?: string; fields?: Record<string, any> } }>;
      const firstDoc = rows.find((r) => r.document)?.document;
      if (firstDoc?.fields) {
        const parsed = parseFirestoreRestFields(firstDoc.fields);
        const docId = String(firstDoc.name || '').split('/').pop() || slugOrId;
        return {
          id: docId,
          title: String(parsed.title || parsed.name || 'Programme'),
          slug: parsed.slug,
          shortDescription: parsed.shortDescription,
          description: parsed.description,
          featuredImage: parsed.featuredImage,
          image: parsed.image,
          bannerUrl: parsed.bannerUrl,
          status: parsed.status,
          isPublished: parsed.isPublished,
          isArchived: parsed.isArchived,
        };
      }
    }
  } catch {
    // Fall through to direct ID lookup
  }

  // 2. Fallback: direct document lookup by ID
  try {
    const docRes = await fetch(`${baseEndpoint}/programs/${encodeURIComponent(slugOrId)}`);
    if (docRes.ok) {
      const docJson = (await docRes.json()) as { name?: string; fields?: Record<string, any> };
      if (docJson?.fields) {
        const parsed = parseFirestoreRestFields(docJson.fields);
        return {
          id: slugOrId,
          title: String(parsed.title || parsed.name || 'Programme'),
          slug: parsed.slug,
          shortDescription: parsed.shortDescription,
          description: parsed.description,
          featuredImage: parsed.featuredImage,
          image: parsed.image,
          bannerUrl: parsed.bannerUrl,
          status: parsed.status,
          isPublished: parsed.isPublished,
          isArchived: parsed.isArchived,
        };
      }
    }
  } catch {
    // Ignore network errors and fall back safely
  }

  return null;
}

async function fetchPromoViaFirestoreRest(
  promoId: string,
  projectId: string,
  databaseId: string
): Promise<SocialMetaPromo | null> {
  if (!promoId) return null;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents/promotions/${encodeURIComponent(promoId)}`;
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const json = (await res.json()) as { fields?: Record<string, any> };
    if (!json?.fields) return null;
    const parsed = parseFirestoreRestFields(json.fields);
    return {
      id: promoId,
      title: parsed.title,
      subtitle: parsed.subtitle,
      imageUrl: parsed.imageUrl,
      mobileImageUrl: parsed.mobileImageUrl,
      status: parsed.status,
      isActive: parsed.isActive,
    };
  } catch {
    return null;
  }
}

export default async function handler(request: Request, context: { next: () => Promise<Response> }) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/programs\/([^/]+)\/?$/i);
  if (!match) {
    return context.next();
  }

  const userAgent = request.headers.get('user-agent') || '';
  const forcePreview = url.searchParams.get('_meta') === '1';

  // Keep regular browser navigation zero-latency; inject dynamic tags for social/search crawlers (or ?_meta=1 verification)
  if (!isSocialOrSearchCrawler(userAgent) && !forcePreview) {
    return context.next();
  }

  const slugOrId = decodeURIComponent(match[1]);
  const promoId = url.searchParams.get('promo') || '';

  const envObj = (globalThis as any).Netlify?.env;
  const projectId =
    (typeof envObj?.get === 'function' ? envObj.get('FIREBASE_PROJECT_ID') : '') ||
    DEFAULT_FIREBASE_PROJECT_ID;
  const databaseId =
    (typeof envObj?.get === 'function' ? envObj.get('FIREBASE_DATABASE_ID') : '') ||
    DEFAULT_FIREBASE_DATABASE_ID;
  const publicBaseUrl =
    (typeof envObj?.get === 'function' ? envObj.get('PUBLIC_APP_URL') : '') ||
    SOCIAL_PRODUCTION_BASE_URL;

  const [program, promo] = await Promise.all([
    fetchProgramViaFirestoreRest(slugOrId, projectId, databaseId),
    promoId ? fetchPromoViaFirestoreRest(promoId, projectId, databaseId) : Promise.resolve(null),
  ]);

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const html = await response.text();
  const tags = buildProgramSocialMeta({
    slugOrId,
    program,
    promo,
    baseUrl: publicBaseUrl,
  });
  const transformedHtml = injectSocialMetaIntoHtml(html, tags);

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'public, max-age=120, s-maxage=300');

  return new Response(transformedHtml, {
    status: response.status,
    headers,
  });
}
