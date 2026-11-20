import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PRIMARY_PROGRAM_ROOTS,
  normalizeProgramRecord,
  resolveProgramCanonicalRoot,
  sortProgramsNewestFirst,
  isProgramPubliclyEnrollable,
  computeProgramIndicators,
  buildProgramCatalogueUrl,
} from '../src/lib/programHierarchy.ts';

import {
  isValidExternalHttpsUrl,
  isValidInternalPath,
  resolvePromotionCtaDestination,
  isPromotionCurrentlyEligible,
  selectPromotionImageUrl,
  isPopupBlockedRoute,
  shouldDisplayPopupCampaign,
  recordPopupSeen,
  normalizePromotionRecord,
} from '../src/lib/promotions.ts';
import {
  evaluatePromotionVisibility,
  evaluatePopupDisplayStatus,
} from '../src/lib/bannerDiagnostics.ts';

import {
  isValidTutorPhotoUrl,
  isTutorEligibleForPublicDirectory,
  reconcilePublicTutors,
  buildCanonicalTutorApplicationPayload,
} from '../src/lib/tutorDirectory.ts';

import { auditSyntheticProgramRecords } from '../src/components/admin/programs-preview/hierarchyUtils.ts';
import { isSubAdminAllowedForPath } from '../src/utils/adminRbac.ts';

const ROOT_DIR = process.cwd();

function makeMemoryStorage() {
  const local = new Map();
  const session = new Map();
  return {
    getLocal: (k) => (local.has(k) ? local.get(k) : null),
    setLocal: (k, v) => {
      local.set(k, String(v));
    },
    getSession: (k) => (session.has(k) ? session.get(k) : null),
    setSession: (k, v) => {
      session.set(k, String(v));
    },
  };
}

function makeProgram(id, overrides = {}) {
  return normalizeProgramRecord(id, {
    title: overrides.title || `Programme ${id}`,
    slug: overrides.slug || `programme-${id}`,
    status: 'PUBLISHED',
    isPublished: true,
    isArchived: false,
    nodeType: 'ENROLLABLE',
    isEnrollable: true,
    ...overrides,
  });
}

// ============================================================================
// 1. PROGRAMME HIERARCHY, CANONICAL 4-ROOT FILTERING, SORTING & INDICATORS
// ============================================================================

test('Programme Hierarchy: direct & deeply nested sub-programmes resolve to canonical 4 roots', () => {
  const techRoot = makeProgram('root-technology-programme', {
    title: 'Technology Programme',
    isPrimaryRoot: true,
    primaryRootKey: 'technology',
    nodeType: 'CONTAINER',
    isEnrollable: false,
  });
  const musicRoot = makeProgram('root-music-programme', {
    title: 'Music Programme',
    isPrimaryRoot: true,
    primaryRootKey: 'music',
    nodeType: 'CONTAINER',
    isEnrollable: false,
  });
  const academicsRoot = makeProgram('root-academics-programme', {
    title: 'Academics Programme',
    isPrimaryRoot: true,
    primaryRootKey: 'academics',
    nodeType: 'CONTAINER',
    isEnrollable: false,
  });
  const designRoot = makeProgram('root-design-graphics-programme', {
    title: 'Design & Graphics Programme',
    isPrimaryRoot: true,
    primaryRootKey: 'design-graphics',
    nodeType: 'CONTAINER',
    isEnrollable: false,
  });

  // Direct and deeply nested children
  const smartTechies = makeProgram('smart-techies', {
    title: 'Smart Techies Programme',
    parentProgramId: techRoot.id,
    nodeType: 'HYBRID',
  });
  const webDev = makeProgram('web-dev', {
    title: 'Full-Stack Web Development',
    parentProgramId: smartTechies.id,
    categoryId: 'GENERAL', // intentionally non-tech category to verify parent chain wins
  });
  const reactTrack = makeProgram('react-track', {
    title: 'React Mastery Cohort',
    parentProgramId: webDev.id,
    categoryId: 'GENERAL',
  });
  const pianoTrack = makeProgram('piano', {
    title: 'Contemporary Piano',
    parentProgramId: musicRoot.id,
  });
  const waecTrack = makeProgram('waec-math', {
    title: 'WAEC Mathematics Intensive',
    parentProgramId: academicsRoot.id,
  });
  const brandDesign = makeProgram('brand-design', {
    title: 'Brand Identity Systems',
    parentProgramId: designRoot.id,
  });

  const map = new Map(
    [
      techRoot,
      musicRoot,
      academicsRoot,
      designRoot,
      smartTechies,
      webDev,
      reactTrack,
      pianoTrack,
      waecTrack,
      brandDesign,
    ].map((p) => [p.id, p])
  );

  assert.equal(resolveProgramCanonicalRoot(smartTechies, map).rootKey, 'technology');
  assert.equal(resolveProgramCanonicalRoot(reactTrack, map).rootKey, 'technology');
  assert.deepEqual(resolveProgramCanonicalRoot(reactTrack, map).ancestorIds, [
    techRoot.id,
    smartTechies.id,
    webDev.id,
  ]);
  assert.equal(resolveProgramCanonicalRoot(pianoTrack, map).rootKey, 'music');
  assert.equal(resolveProgramCanonicalRoot(waecTrack, map).rootKey, 'academics');
  assert.equal(resolveProgramCanonicalRoot(brandDesign, map).rootKey, 'design-graphics');
  assert.equal(PRIMARY_PROGRAM_ROOTS.length, 4);
});

test('Programme Hierarchy: invalid parent does not assign an arbitrary root and flags hasInvalidParent', () => {
  const orphan = makeProgram('orphan-1', {
    title: 'Detached Special Workshop',
    parentProgramId: 'non-existent-parent-999',
    categoryId: 'CUSTOM_UNKNOWN',
    primaryRootKey: null,
  });
  const map = new Map([[orphan.id, orphan]]);
  const res = resolveProgramCanonicalRoot(orphan, map);

  assert.equal(res.rootKey, null);
  assert.equal(res.hasInvalidParent, true);
  assert.equal(res.hasCycle, false);
});

test('Programme Hierarchy: circular parent chain terminates safely with hasCycle = true', () => {
  const nodeA = makeProgram('cycle-a', { parentProgramId: 'cycle-b', categoryId: 'UNKNOWN' });
  const nodeB = makeProgram('cycle-b', { parentProgramId: 'cycle-a', categoryId: 'UNKNOWN' });
  const map = new Map([
    [nodeA.id, nodeA],
    [nodeB.id, nodeB],
  ]);

  const res = resolveProgramCanonicalRoot(nodeA, map);
  assert.equal(res.hasCycle, true);
  assert.equal(res.rootKey, null);
});

test('Programme Hierarchy: CONTAINER, DRAFT, and ARCHIVED records are excluded from public enrollable list', () => {
  const container = makeProgram('c1', { nodeType: 'CONTAINER', isEnrollable: false });
  const draft = makeProgram('d1', { status: 'DRAFT', isPublished: false });
  const archived = makeProgram('a1', { status: 'ARCHIVED', isArchived: true });
  const enrollable = makeProgram('e1', { nodeType: 'ENROLLABLE', isEnrollable: true });
  const hybrid = makeProgram('h1', { nodeType: 'HYBRID', isEnrollable: true });

  assert.equal(isProgramPubliclyEnrollable(container), false);
  assert.equal(isProgramPubliclyEnrollable(draft), false);
  assert.equal(isProgramPubliclyEnrollable(archived), false);
  assert.equal(isProgramPubliclyEnrollable(enrollable), true);
  assert.equal(isProgramPubliclyEnrollable(hybrid), true);
});

test('Programme Hierarchy: newest-first sorting handles Firestore Timestamps and ISO strings', () => {
  const oldest = makeProgram('p-old', {
    title: 'Alpha Old',
    createdAt: '2025-01-10T00:00:00.000Z',
  });
  const middle = makeProgram('p-mid', {
    title: 'Beta Mid',
    publishedAt: { seconds: 1748000000, nanoseconds: 0 }, // May 2025
  });
  const newest = makeProgram('p-new', {
    title: 'Gamma New',
    publishedAt: { toMillis: () => Date.parse('2026-06-01T12:00:00.000Z') },
  });

  const sorted = sortProgramsNewestFirst([oldest, newest, middle]);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ['p-new', 'p-mid', 'p-old']
  );
});

test('Programme Hierarchy: direct catalogue URLs target canonical 4-root filters cleanly', () => {
  assert.equal(
    buildProgramCatalogueUrl('technology'),
    '/programs?tab=catalog&category=technology#catalog-section'
  );
  assert.equal(
    buildProgramCatalogueUrl('design-graphics'),
    '/programs?tab=catalog&category=design-graphics#catalog-section'
  );
  assert.equal(
    buildProgramCatalogueUrl('music'),
    '/programs?tab=catalog&category=music#catalog-section'
  );
  assert.equal(
    buildProgramCatalogueUrl('academics'),
    '/programs?tab=catalog&category=academics#catalog-section'
  );
  assert.equal(buildProgramCatalogueUrl(null), '/programs?tab=catalog#catalog-section');
});

test('Programme Hierarchy: managed indicators are explicit-only and never guessed from title/description', () => {
  const now = Date.parse('2026-05-15T12:00:00.000Z');
  const misleadingTextOnly = makeProgram('text-only', {
    title: 'HOT Limited Time In Session Bootcamp!',
    shortDescription: 'Hurry, hot cohort currently in session for a limited time!',
    isHot: false,
    isLimitedTime: false,
  });
  assert.deepEqual(computeProgramIndicators(misleadingTextOnly, now), []);

  const explicitlyMarked = makeProgram('explicit', {
    title: 'Python Engineering Track',
    isHot: true,
    sessionStartAt: '2026-05-01T00:00:00.000Z',
    sessionEndAt: '2026-06-01T00:00:00.000Z',
    enrolmentDeadline: '2026-05-20T00:00:00.000Z',
  });
  assert.deepEqual(computeProgramIndicators(explicitlyMarked, now), [
    'HOT',
    'IN SESSION',
    'LIMITED TIME',
  ]);

  const expiredWindow = makeProgram('expired', {
    sessionStartAt: '2026-01-01T00:00:00.000Z',
    sessionEndAt: '2026-02-01T00:00:00.000Z',
    enrolmentDeadline: '2026-03-01T00:00:00.000Z',
  });
  assert.deepEqual(computeProgramIndicators(expiredWindow, now), []);
});

// ============================================================================
// 2. PROMOTIONS & POPUP CAMPAIGN SYSTEM
// ============================================================================

test('Promotions: eligibility filters active, draft, future scheduled, and expired campaigns accurately', () => {
  const now = Date.parse('2026-06-15T10:00:00.000Z');
  const base = {
    desktopImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/banner.jpg',
    placement: 'HOME_CAROUSEL',
  };

  assert.equal(
    isPromotionCurrentlyEligible(
      { ...base, status: 'ACTIVE', startAt: '2026-06-01T00:00:00Z', endAt: '2026-06-30T00:00:00Z' },
      now
    ),
    true
  );
  assert.equal(isPromotionCurrentlyEligible({ ...base, status: 'DRAFT' }, now), false);
  assert.equal(isPromotionCurrentlyEligible({ ...base, status: 'PAUSED' }, now), false);
  assert.equal(
    isPromotionCurrentlyEligible(
      { ...base, status: 'ACTIVE', endAt: '2026-06-10T00:00:00Z' },
      now
    ),
    false
  );
  assert.equal(
    isPromotionCurrentlyEligible(
      { ...base, status: 'ACTIVE', startAt: '2026-07-01T00:00:00Z' },
      now
    ),
    true
  );
  assert.equal(
    isPromotionCurrentlyEligible(
      { ...base, status: 'SCHEDULED', startAt: '2026-07-01T00:00:00Z' },
      now
    ),
    false
  );
  assert.equal(
    isPromotionCurrentlyEligible(
      { ...base, status: 'SCHEDULED', startAt: '2026-06-01T00:00:00Z', endAt: '2026-06-30T00:00:00Z' },
      now
    ),
    true
  );
  assert.equal(
    isPromotionCurrentlyEligible({ status: 'ACTIVE', desktopImageUrl: '', mobileImageUrl: '' }, now),
    false
  );
});

test('Promotions: responsive image selector falls back to desktop when mobile artwork is absent', () => {
  const desktopOnly = {
    desktopImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/desktop.jpg',
    mobileImageUrl: '',
  };
  assert.equal(selectPromotionImageUrl(desktopOnly, true), desktopOnly.desktopImageUrl);
  assert.equal(selectPromotionImageUrl(desktopOnly, false), desktopOnly.desktopImageUrl);

  const both = {
    desktopImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/desktop.jpg',
    mobileImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/mobile.jpg',
  };
  assert.equal(selectPromotionImageUrl(both, true), both.mobileImageUrl);
  assert.equal(selectPromotionImageUrl(both, false), both.desktopImageUrl);
});

test('Promotions: CTA destination resolution validates all 4 target types and rejects unsafe URLs', () => {
  assert.deepEqual(
    resolvePromotionCtaDestination({
      ctaTargetType: 'PROGRAM_CATALOG',
      programRootKey: 'technology',
    }),
    { href: '/programs?tab=catalog&category=technology#catalog-section', isExternal: false }
  );

  assert.deepEqual(
    resolvePromotionCtaDestination({
      ctaTargetType: 'INDIVIDUAL_PROGRAM',
      programSlug: 'full-stack-web-development',
    }),
    { href: '/programs/full-stack-web-development', isExternal: false }
  );

  assert.deepEqual(
    resolvePromotionCtaDestination({
      ctaTargetType: 'INTERNAL_PAGE',
      internalPath: '/find-tutor',
    }),
    { href: '/find-tutor', isExternal: false }
  );
  assert.equal(
    resolvePromotionCtaDestination({
      ctaTargetType: 'INTERNAL_PAGE',
      internalPath: '//evil.example.com',
    }),
    null
  );
  assert.equal(isValidInternalPath('/register?mode=student'), true);
  assert.equal(isValidInternalPath('javascript:alert(1)'), false);

  assert.deepEqual(
    resolvePromotionCtaDestination({
      ctaTargetType: 'EXTERNAL_URL',
      externalUrl: 'https://jaystarbliss.com/summer-camp',
    }),
    { href: 'https://jaystarbliss.com/summer-camp', isExternal: true }
  );
  assert.equal(
    resolvePromotionCtaDestination({
      ctaTargetType: 'EXTERNAL_URL',
      externalUrl: 'javascript:alert(1)',
    }),
    null
  );
  assert.equal(
    resolvePromotionCtaDestination({
      ctaTargetType: 'EXTERNAL_URL',
      externalUrl: 'http://insecure.example.com',
    }),
    null
  );
  assert.equal(isValidExternalHttpsUrl('https://example.org/promo'), true);
  assert.equal(isValidExternalHttpsUrl('http://example.org/promo'), false);
});

test('Promotions: popup frequency rules (ONCE_PER_BROWSER, ONCE_PER_SESSION, EVERY_N_DAYS) and blocked routes', () => {
  const storage = makeMemoryStorage();
  const t0 = Date.parse('2026-06-01T08:00:00.000Z');

  const browserPromo = {
    id: 'popup-browser',
    title: 'Summer Admission',
    placement: 'FIRST_VISIT_POPUP',
    status: 'ACTIVE',
    desktopImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/popup.jpg',
    imageAlt: 'Summer Admission',
    ctaLabel: 'Explore',
    ctaTargetType: 'PROGRAM_CATALOG',
    sortOrder: 0,
    popupFrequency: 'ONCE_PER_BROWSER',
  };

  assert.equal(shouldDisplayPopupCampaign(browserPromo, storage, t0), true);
  recordPopupSeen(browserPromo, storage, t0);
  assert.equal(shouldDisplayPopupCampaign(browserPromo, storage, t0 + 999999999), false);

  const sessionPromo = { ...browserPromo, id: 'popup-session', popupFrequency: 'ONCE_PER_SESSION' };
  assert.equal(shouldDisplayPopupCampaign(sessionPromo, storage, t0), true);
  recordPopupSeen(sessionPromo, storage, t0);
  assert.equal(shouldDisplayPopupCampaign(sessionPromo, storage, t0 + 1000), false);

  const every3DaysPromo = {
    ...browserPromo,
    id: 'popup-3days',
    popupFrequency: 'EVERY_N_DAYS',
    popupIntervalDays: 3,
  };
  assert.equal(shouldDisplayPopupCampaign(every3DaysPromo, storage, t0), true);
  recordPopupSeen(every3DaysPromo, storage, t0);
  const twoDaysLater = t0 + 2 * 24 * 60 * 60 * 1000;
  const fourDaysLater = t0 + 4 * 24 * 60 * 60 * 1000;
  assert.equal(shouldDisplayPopupCampaign(every3DaysPromo, storage, twoDaysLater), false);
  assert.equal(shouldDisplayPopupCampaign(every3DaysPromo, storage, fourDaysLater), true);

  // Blocked routes
  assert.equal(isPopupBlockedRoute('/admin'), true);
  assert.equal(isPopupBlockedRoute('/admin/promotions'), true);
  assert.equal(isPopupBlockedRoute('/portal/student'), true);
  assert.equal(isPopupBlockedRoute('/register'), true);
  assert.equal(isPopupBlockedRoute('/login'), true);
  assert.equal(isPopupBlockedRoute('/'), false);
  assert.equal(isPopupBlockedRoute('/programs'), false);
});

test('Promotions RBAC: Super Admin & CMS/Marketing Admins allowed; Finance & Academic Admins denied', () => {
  assert.equal(isSubAdminAllowedForPath('SUPER_ADMIN', '/admin/promotions'), true);
  assert.equal(isSubAdminAllowedForPath('CMS_ADMIN', '/admin/promotions'), true);
  assert.equal(isSubAdminAllowedForPath('CONTENT_ADMIN', '/admin/promotions'), true);
  assert.equal(isSubAdminAllowedForPath('MARKETING_ADMIN', '/admin/promotions'), true);
  assert.equal(isSubAdminAllowedForPath('FINANCE_ADMIN', '/admin/promotions'), false);
  assert.equal(isSubAdminAllowedForPath('ACADEMIC_ADMIN', '/admin/promotions'), false);
});

test('Banner Diagnostics: evaluatePromotionVisibility reports exact exclusion reasons and case-insensitive normalization works', () => {
  const now = Date.parse('2026-06-15T10:00:00.000Z');

  // Case-insensitive status & placement normalization
  const normalized = normalizePromotionRecord('promo-ci-1', {
    title: 'Summer Tech Camp',
    status: 'active',
    placement: 'first_visit_popup',
    desktopImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/camp.jpg',
  });
  assert.equal(normalized.status, 'ACTIVE');
  assert.equal(normalized.placement, 'FIRST_VISIT_POPUP');

  // Eligible home carousel banner
  const okReport = evaluatePromotionVisibility(
    {
      id: 'p-ok',
      title: 'Open Admissions',
      placement: 'HOME_CAROUSEL',
      status: 'ACTIVE',
      desktopImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/admissions.jpg',
    },
    'HOME_CAROUSEL',
    now
  );
  assert.equal(okReport.eligible, true);
  assert.deepEqual(okReport.reasons, []);

  // Misconfigured draft with wrong placement, missing image, and expired endAt
  const badReport = evaluatePromotionVisibility(
    {
      id: 'p-bad',
      title: 'Broken Promo',
      placement: 'FIRST_VISIT_POPUP',
      status: 'DRAFT',
      desktopImageUrl: '',
      mobileImageUrl: '',
      endAt: '2026-06-01T00:00:00.000Z',
    },
    'HOME_CAROUSEL',
    now
  );
  assert.equal(badReport.eligible, false);
  assert.ok(badReport.reasons.some((r) => r.startsWith('placement_mismatch')));
  assert.ok(badReport.reasons.some((r) => r.startsWith('inactive_status')));
  assert.ok(badReport.reasons.some((r) => r.startsWith('missing_image_url')));
  assert.ok(badReport.reasons.some((r) => r.startsWith('expired')));
});

test('Banner Diagnostics: evaluatePopupDisplayStatus explains storage suppression and MarqueeBanner/FirstVisitPromoPopup use live Firestore listeners', () => {
  const storage = makeMemoryStorage();
  const now = Date.parse('2026-06-15T10:00:00.000Z');
  const popup = normalizePromotionRecord('popup-diag-1', {
    title: 'Welcome Offer',
    placement: 'FIRST_VISIT_POPUP',
    status: 'ACTIVE',
    desktopImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/welcome.jpg',
    popupFrequency: 'ONCE_PER_BROWSER',
  });

  const before = evaluatePopupDisplayStatus(popup, storage, now);
  assert.equal(before.canDisplay, true);
  assert.deepEqual(before.reasons, []);

  recordPopupSeen(popup, storage, now);
  const after = evaluatePopupDisplayStatus(popup, storage, now + 5000);
  assert.equal(after.canDisplay, false);
  assert.equal(after.storageKey, 'jbs_promo_popup_popup-diag-1');
  assert.ok(after.reasons.some((r) => r.startsWith('popup_already_seen_in_browser')));

  // Verify live Firestore listener wiring & cache invalidation in source
  const marqueeSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/components/ui/MarqueeBanner.tsx'),
    'utf8'
  );
  const popupSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/components/promotions/FirstVisitPromoPopup.tsx'),
    'utf8'
  );
  const adminSettingsSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/pages/admin/AdminSettings.tsx'),
    'utf8'
  );

  assert.equal(marqueeSrc.includes('onSnapshot'), true);
  assert.equal(marqueeSrc.includes('logBannerDiagnostic'), true);
  assert.equal(popupSrc.includes('subscribeActivePublicPromotions'), true);
  assert.equal(popupSrc.includes('logBannerDiagnostic'), true);
  assert.equal(adminSettingsSrc.includes('MARQUEE_BANNER_CACHE_KEY'), true);
});

// ============================================================================
// 3. DEMO-DATA REMOVAL & CANONICAL `programProposals` UNIFICATION
// ============================================================================

test('Demo-Data Removal: AdminPrograms, ProgramsCoursesPreviewPage, PortalSettings & App have zero demo fallbacks', () => {
  const adminProgramsSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/pages/admin/AdminPrograms.tsx'),
    'utf8'
  );
  const previewPageSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/pages/admin/ProgramsCoursesPreviewPage.tsx'),
    'utf8'
  );
  const portalSettingsSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/pages/portal/PortalSettings.tsx'),
    'utf8'
  );
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/App.tsx'), 'utf8');

  assert.equal(adminProgramsSrc.includes('INITIAL_DEMO_PROGRAMS'), false);
  assert.equal(adminProgramsSrc.includes('INITIAL_DEMO_PROPOSALS'), false);
  assert.equal(adminProgramsSrc.includes('tutor_program_proposals'), false);
  assert.equal(adminProgramsSrc.includes('programProposals'), true);

  assert.equal(previewPageSrc.includes('mockData'), false);
  assert.equal(previewPageSrc.includes('INITIAL_DEMO_PROGRAMS'), false);
  assert.equal(previewPageSrc.includes('handleResetDemoData'), false);

  const hierarchySrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/lib/programHierarchy.ts'),
    'utf8'
  );
  assert.equal(portalSettingsSrc.includes('DEFAULT_PROGRAMME_CATALOG'), false);
  assert.equal(portalSettingsSrc.includes('submitTutorProgramProposal'), true);
  assert.equal(hierarchySrc.includes("'programProposals'"), true);

  assert.match(appSrc, /path="\/portal-preview"[\s\S]*ProtectedRoute/);
});

test('Demo-Data Removal: report-only synthetic audit flags demo-like records without mutating inputs', () => {
  const realProg = makeProgram('prog-real-1', { title: 'Python Fundamentals' });
  const syntheticProg = makeProgram('prog-demo-1', {
    title: 'Sample Coding Course',
    isSampleData: true,
  });
  const syntheticProposal = {
    id: 'prop-demo-1',
    proposedTitle: 'Demo Music Track',
    proposedByName: 'Mr. Chidi Okonkwo',
  };

  const programs = [realProg, syntheticProg];
  const findings = auditSyntheticProgramRecords(programs, [syntheticProposal]);

  assert.equal(programs.length, 2); // non-destructive
  assert.ok(findings.some((f) => f.id === 'prog-demo-1' && f.collection === 'programs'));
  assert.ok(findings.some((f) => f.id === 'prop-demo-1' && f.collection === 'programProposals'));
  assert.equal(
    findings.some((f) => f.id === 'prog-real-1'),
    false
  );
});

// ============================================================================
// 4. MANDATORY TUTOR PHOTOGRAPHS & PUBLIC DIRECTORY INTEGRITY
// ============================================================================

test('Tutor Integrity: photo URL validator rejects empty, non-HTTPS, data URI, and placeholder URLs', () => {
  assert.equal(
    isValidTutorPhotoUrl('https://res.cloudinary.com/jaystarbliss/image/upload/v1/tutors/ada.jpg'),
    true
  );
  assert.equal(isValidTutorPhotoUrl(''), false);
  assert.equal(isValidTutorPhotoUrl(null), false);
  assert.equal(isValidTutorPhotoUrl('http://example.com/photo.jpg'), false);
  assert.equal(isValidTutorPhotoUrl('data:image/png;base64,iVBORw0KGgo='), false);
  assert.equal(isValidTutorPhotoUrl('https://ui-avatars.com/api/?name=Ada'), false);
  assert.equal(isValidTutorPhotoUrl('https://via.placeholder.com/300'), false);
});

test('Tutor Integrity: canonical application builder requires photoURL and enforces pending review status', () => {
  assert.throws(
    () =>
      buildCanonicalTutorApplicationPayload({
        name: 'Adaeze Nwosu',
        email: 'adaeze@example.com',
        phone: '+2348000000000',
        photoURL: '',
        subjects: ['Python'],
      }),
    /photograph is mandatory/i
  );

  const payload = buildCanonicalTutorApplicationPayload({
    uid: 'uid-ada-1',
    name: 'Adaeze Nwosu',
    email: 'Adaeze@Example.com',
    phone: '+2348000000000',
    photoURL: 'https://res.cloudinary.com/jaystarbliss/image/upload/v1/tutors/ada.jpg',
    subjects: ['Python', 'Python', 'Web Development'],
    source: 'TUTOR_APPLICATION_PAGE',
  });

  assert.equal(payload.email, 'adaeze@example.com');
  assert.equal(payload.status, 'pending');
  assert.equal(payload.publicProfileStatus, 'PENDING_REVIEW');
  assert.deepEqual(payload.subjects, ['Python', 'Web Development']);
});

test('Tutor Integrity: reconcilePublicTutors enforces eligibility, deduplication, and strips private contact fields', () => {
  const validPhoto = 'https://res.cloudinary.com/jaystarbliss/image/upload/v1/tutors/t1.jpg';
  const validPhoto2 = 'https://res.cloudinary.com/jaystarbliss/image/upload/v1/tutors/t2.jpg';

  const rawRecords = [
    // Eligible published tutor
    {
      id: 'doc-1',
      uid: 'uid-1',
      fullName: 'Chinedu Okafor',
      email: 'chinedu@example.com',
      phone: '+2348011111111',
      whatsapp: '+2348011111111',
      expectedSalary: '200000',
      cvUrl: 'https://drive.google.com/cv',
      photoURL: validPhoto,
      subjects: ['Python & Data Science'],
      qualification: 'B.Sc Computer Science',
      status: 'ACTIVE',
      approvalStatus: 'approved',
      publicProfileStatus: 'PUBLISHED',
    },
    // Duplicate by email with different doc id — should be deduped
    {
      id: 'doc-1-dup',
      uid: 'uid-1-alt',
      fullName: 'Chinedu Okafor',
      email: 'CHINEDU@example.com',
      photoURL: validPhoto,
      subjects: ['Python & Data Science'],
      status: 'ACTIVE',
      publicProfileStatus: 'PUBLISHED',
    },
    // Pending applicant — MUST be excluded
    {
      id: 'doc-pending',
      uid: 'uid-pending',
      fullName: 'Pending Instructor',
      email: 'pending@example.com',
      photoURL: validPhoto2,
      subjects: ['Piano'],
      status: 'PENDING',
      approvalStatus: 'pending',
      publicProfileStatus: 'PENDING_REVIEW',
    },
    // Approved but explicitly HIDDEN — MUST be excluded
    {
      id: 'doc-hidden',
      uid: 'uid-hidden',
      fullName: 'Hidden Instructor',
      email: 'hidden@example.com',
      photoURL: validPhoto2,
      subjects: ['Mathematics'],
      status: 'ACTIVE',
      publicProfileStatus: 'HIDDEN',
    },
    // Approved & PUBLISHED but missing photograph — MUST be excluded
    {
      id: 'doc-nophoto',
      uid: 'uid-nophoto',
      fullName: 'No Photo Instructor',
      email: 'nophoto@example.com',
      photoURL: '',
      subjects: ['Robotics'],
      status: 'ACTIVE',
      publicProfileStatus: 'PUBLISHED',
    },
    // Non-human placeholder name — MUST be excluded
    {
      id: 'doc-generic',
      uid: 'uid-generic',
      fullName: 'Test Tutor',
      email: 'test@example.com',
      photoURL: validPhoto2,
      subjects: ['Coding'],
      status: 'ACTIVE',
      publicProfileStatus: 'PUBLISHED',
    },
  ];

  assert.equal(isTutorEligibleForPublicDirectory(rawRecords[0]), true);
  assert.equal(isTutorEligibleForPublicDirectory(rawRecords[2]), false);
  assert.equal(isTutorEligibleForPublicDirectory(rawRecords[3]), false);
  assert.equal(isTutorEligibleForPublicDirectory(rawRecords[4]), false);
  assert.equal(isTutorEligibleForPublicDirectory(rawRecords[5]), false);

  const cards = reconcilePublicTutors(rawRecords);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].name, 'Chinedu Okafor');
  assert.equal(cards[0].photoURL, validPhoto);
  // Private contact fields must NOT leak onto public cards
  assert.equal('email' in cards[0], false);
  assert.equal('phone' in cards[0], false);
  assert.equal('whatsapp' in cards[0], false);
  assert.equal('expectedSalary' in cards[0], false);
  assert.equal('cvUrl' in cards[0], false);
});
