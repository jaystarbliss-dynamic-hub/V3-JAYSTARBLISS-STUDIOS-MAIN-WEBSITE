import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Resolve extensionless TypeScript relative imports & stub browser-only Firebase SDK init during Node unit tests
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./firebase" || specifier.endsWith("/lib/firebase")) {
      return { url: "data:text/javascript,export const db = {}; export const auth = {}; export const getAllClientDatabases = () => [];", shortCircuit: true };
    }
    if (specifier === "./firebase-admin" || specifier.endsWith("/_lib/firebase-admin")) {
      return { url: "data:text/javascript,export const adminDb = {}; export const adminAuth = {}; export default {};", shortCircuit: true };
    }
    if (specifier === "./billing" && context.parentURL?.includes("programmeEnrollments")) {
      return { url: "data:text/javascript,export const billingPost = async () => ({});", shortCircuit: true };
    }
    if (specifier.startsWith(".") && !path.extname(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  getTopLevelCatalogEntries,
  getPublishedDirectChildren,
  isProgramCatalogDiscoverable,
  normalizeProgramRecord,
} = await import(new URL("../src/lib/programHierarchy.ts", import.meta.url).href);

const {
  PRODUCTION_BASE_URL,
  buildCanonicalProgramUrl,
  buildCampaignShareUrl,
  validateSameOriginReturnPath,
  buildPortalProgramExplorePath,
  buildLoginReturnUrl,
  buildRegisterProgramUrl,
} = await import(new URL("../src/lib/sharing.ts", import.meta.url).href);

const {
  isSocialOrSearchCrawler,
  parseFirestoreRestFields,
  buildProgramSocialMeta,
  injectSocialMetaIntoHtml,
} = await import(new URL("../src/lib/socialMetaBuilder.ts", import.meta.url).href);

const {
  resolveStudentPortalEligibility,
  shouldUnlockStudentBillingTab,
} = await import(new URL("../src/lib/programmeEnrollments.ts", import.meta.url).href);

const {
  computeStudentProgrammePayableAmount,
  computeReconciledProgrammeEnrollmentState,
} = await import(new URL("../api/_lib/billing.ts", import.meta.url).href);

const {
  buildPortalTourSteps,
  shouldShowPortalTour,
  PORTAL_TOUR_VERSION,
} = await import(new URL("../src/lib/portalTour.ts", import.meta.url).href);

// =============================================================================
// SCENARIO A: Hierarchy-aware catalogue visibility & cycle safety
// =============================================================================
test("Scenario A: Hierarchy-aware catalogue hides nested children unless showAsStandalone is true and surfaces containers with descendants", () => {
  const rootTech = normalizeProgramRecord("root_tech", {
    title: "Technology",
    slug: "technology",
    categoryId: "technology",
    status: "PUBLISHED",
    nodeType: "CONTAINER",
    isPrimaryRoot: true,
    primaryRootKey: "technology",
    parentProgramId: null,
  });

  const subContainer = normalizeProgramRecord("smart_techies", {
    title: "Smart Techies",
    slug: "smart-techies",
    categoryId: "technology",
    status: "PUBLISHED",
    nodeType: "CONTAINER",
    parentProgramId: "root_tech",
  });

  const nestedPython = normalizeProgramRecord("prog_python", {
    title: "Python Programming",
    slug: "python-programming",
    categoryId: "technology",
    status: "PUBLISHED",
    nodeType: "ENROLLABLE",
    parentProgramId: "smart_techies",
    showAsStandalone: false,
  });

  const standaloneFeaturedChild = normalizeProgramRecord("prog_ai_bootcamp", {
    title: "AI Engineering Bootcamp",
    slug: "ai-engineering-bootcamp",
    categoryId: "technology",
    status: "PUBLISHED",
    nodeType: "ENROLLABLE",
    parentProgramId: "smart_techies",
    showAsStandalone: true,
  });

  const emptyContainer = normalizeProgramRecord("empty_music", {
    title: "Empty Container",
    slug: "empty-container",
    categoryId: "music",
    status: "PUBLISHED",
    nodeType: "CONTAINER",
    parentProgramId: null,
  });

  const draftChild = normalizeProgramRecord("draft_course", {
    title: "Draft Course",
    slug: "draft-course",
    categoryId: "music",
    status: "DRAFT",
    nodeType: "ENROLLABLE",
    parentProgramId: "empty_music",
  });

  // Cycle safety test: A -> B -> A
  const cycleA = normalizeProgramRecord("cycle_a", {
    title: "Cycle A",
    slug: "cycle-a",
    categoryId: "academics",
    status: "PUBLISHED",
    nodeType: "CONTAINER",
    parentProgramId: "cycle_b",
  });
  const cycleB = normalizeProgramRecord("cycle_b", {
    title: "Cycle B",
    slug: "cycle-b",
    categoryId: "academics",
    status: "PUBLISHED",
    nodeType: "CONTAINER",
    parentProgramId: "cycle_a",
  });

  const all = [
    rootTech,
    subContainer,
    nestedPython,
    standaloneFeaturedChild,
    emptyContainer,
    draftChild,
    cycleA,
    cycleB,
  ];
  const byId = new Map(all.map((p) => [p.id, p]));

  assert.equal(isProgramCatalogDiscoverable(rootTech, byId), true);
  assert.equal(isProgramCatalogDiscoverable(emptyContainer, byId), false);
  assert.equal(isProgramCatalogDiscoverable(cycleA, byId), false);

  const topLevel = getTopLevelCatalogEntries(byId, "ALL");
  const topIds = topLevel.map((entry) => entry.program.id);

  assert.ok(topIds.includes("root_tech"), "Root container with published descendants must appear");
  assert.ok(
    !topIds.includes("prog_python"),
    "Nested child without showAsStandalone must NOT appear at top level"
  );
  assert.ok(
    !topIds.includes("smart_techies"),
    "Sub-container with valid published parent must NOT appear at top level"
  );
  assert.ok(
    topIds.includes("prog_ai_bootcamp"),
    "Nested child with showAsStandalone: true MUST appear at top level"
  );
  assert.ok(!topIds.includes("empty_music"), "Container with no published descendants must be hidden");

  const directChildrenOfTech = getPublishedDirectChildren("root_tech", byId);
  assert.deepEqual(
    directChildrenOfTech.map((c) => c.id),
    ["smart_techies"]
  );
});

// =============================================================================
// SCENARIO B: Canonical sharing URLs & crawler dynamic social metadata
// =============================================================================
test("Scenario B: Canonical sharing URLs use jaystarblissstudios.com and crawler meta injection renders OG/Twitter tags", () => {
  assert.equal(PRODUCTION_BASE_URL, "https://jaystarblissstudios.com");
  assert.equal(
    buildCanonicalProgramUrl("python-programming"),
    "https://jaystarblissstudios.com/programs/python-programming"
  );
  assert.equal(
    buildCampaignShareUrl({ ctaTargetType: "INDIVIDUAL_PROGRAM", programSlug: "python-programming" }),
    "https://jaystarblissstudios.com/programs/python-programming"
  );
  assert.equal(
    buildCampaignShareUrl({ ctaTargetType: "PROGRAM_CATALOG" }),
    "https://jaystarblissstudios.com/programs?tab=catalog#catalog-section"
  );

  assert.equal(isSocialOrSearchCrawler("WhatsApp/2.23.20.0"), true);
  assert.equal(isSocialOrSearchCrawler("facebookexternalhit/1.1"), true);
  assert.equal(isSocialOrSearchCrawler("Twitterbot/1.0"), true);
  assert.equal(isSocialOrSearchCrawler("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"), false);

  const parsed = parseFirestoreRestFields({
    title: { stringValue: "Python Programming" },
    slug: { stringValue: "python-programming" },
    shortDescription: { stringValue: "Hands-on coding mastery for ambitious learners." },
    status: { stringValue: "PUBLISHED" },
    featuredImage: { stringValue: "https://jaystarblissstudios.com/uploads/python.jpg" },
  });

  const meta = buildProgramSocialMeta({
    slugOrId: "python-programming",
    program: parsed,
  });
  assert.equal(meta.noindex, false);
  assert.equal(meta.url, "https://jaystarblissstudios.com/programs/python-programming");
  assert.equal(meta.image, "https://jaystarblissstudios.com/uploads/python.jpg");

  // Draft programme must NOT leak metadata — returns safe noindex fallback
  const draftMeta = buildProgramSocialMeta({
    slugOrId: "python-programming",
    program: { ...parsed, status: "DRAFT" },
  });
  assert.equal(draftMeta.noindex, true);
  assert.equal(draftMeta.url, "https://jaystarblissstudios.com/programs");

  const shellHtml = `<!doctype html><html><head><title>Old</title><meta property="og:title" content="Old" /></head><body></body></html>`;
  const injected = injectSocialMetaIntoHtml(shellHtml, meta);
  assert.ok(injected.includes("Python Programming"));
  assert.ok(injected.includes('property="og:url" content="https://jaystarblissstudios.com/programs/python-programming"'));
  assert.ok(injected.includes('name="twitter:card" content="summary_large_image"'));
});

// =============================================================================
// SCENARIO C: Same-origin return path validation (open-redirect protection)
// =============================================================================
test("Scenario C: validateSameOriginReturnPath permits safe portal paths and blocks open redirects", () => {
  assert.equal(
    validateSameOriginReturnPath("/portal/student/courses?tab=explore&programSlug=python-programming"),
    "/portal/student/courses?tab=explore&programSlug=python-programming"
  );
  assert.equal(validateSameOriginReturnPath("https://evil.example.com/phish"), null);
  assert.equal(validateSameOriginReturnPath("//evil.example.com/phish"), null);
  assert.equal(validateSameOriginReturnPath("javascript:alert(1)"), null);
  assert.equal(validateSameOriginReturnPath("   "), null);

  const loginUrl = buildLoginReturnUrl({
    returnTo: "/portal/student/courses?tab=explore&programId=prog_1",
    programId: "prog_1",
  });
  assert.ok(loginUrl.startsWith("/portal?returnTo="));

  const regUrl = buildRegisterProgramUrl({ programId: "prog_1", programSlug: "python-programming" });
  assert.ok(regUrl.includes("programId=prog_1"));
  assert.ok(regUrl.includes("programSlug=python-programming"));
});

// =============================================================================
// SCENARIOS D & E (MANDATORY): Individual + School Student Self-Funded Eligibility,
// Parent-Child Strict Exclusion, Billing Unlock, Deposits, Balances & Renewals
// =============================================================================
test("Scenarios D & E: School student unlocks personal self-funded billing while parent-enrolled child is strictly excluded", () => {
  // 1. Individual student
  const indElig = resolveStudentPortalEligibility({
    registrationType: "individual",
    isIndependent: true,
  });
  assert.equal(indElig.registrationType, "individual");
  assert.equal(indElig.canSelfDiscoverAndEnroll, true);
  assert.equal(
    shouldUnlockStudentBillingTab({ eligibility: indElig, selfFundedEnrollments: [] }),
    true
  );

  // 2. School-enrolled student with NO self-funded enrolments yet
  const schoolElig = resolveStudentPortalEligibility({
    registrationType: "school",
    schoolId: "school_abc",
  });
  assert.equal(schoolElig.registrationType, "school");
  assert.equal(schoolElig.isSchoolStudent, true);
  assert.equal(schoolElig.canSelfDiscoverAndEnroll, true);
  assert.equal(
    shouldUnlockStudentBillingTab({ eligibility: schoolElig, selfFundedEnrollments: [] }),
    false,
    "School student without self-funded enrolments must keep Payments & Fees hidden"
  );

  // 3. School-enrolled student with an APPROVED self-funded programme
  const schoolApprovedEnrollment = {
    id: "enr_school_1",
    studentUid: "stu_school_1",
    studentDocId: "stu_doc_1",
    studentRegistrationType: "school",
    schoolId: "school_abc",
    programId: "prog_python",
    programSlug: "python-programming",
    programTitle: "Python Programming",
    billingResponsibility: "STUDENT_SELF_FUNDED",
    enrollmentStatus: "APPROVED_AWAITING_PAYMENT",
    paymentStatus: "UNPAID",
    approvedFee: 50000,
    amountPaid: 0,
    remainingBalance: 50000,
    billingCycle: "monthly",
    allowDepositAccess: true,
    depositAmount: 20000,
  };

  assert.equal(
    shouldUnlockStudentBillingTab({
      eligibility: schoolElig,
      selfFundedEnrollments: [schoolApprovedEnrollment],
    }),
    true,
    "School student with approved STUDENT_SELF_FUNDED enrolment MUST unlock Payments & Fees"
  );

  // 4. Parent-enrolled child MUST NEVER see Explore Programmes or Payments & Fees
  const parentChildElig = resolveStudentPortalEligibility({
    registrationType: "parent",
    parentId: "parent_xyz",
  });
  assert.equal(parentChildElig.registrationType, "parent");
  assert.equal(parentChildElig.isParentManagedChild, true);
  assert.equal(parentChildElig.canSelfDiscoverAndEnroll, false);
  assert.equal(
    shouldUnlockStudentBillingTab({
      eligibility: parentChildElig,
      selfFundedEnrollments: [schoolApprovedEnrollment],
    }),
    false,
    "Parent-enrolled child account MUST strictly remain excluded from student billing"
  );

  // 5. Server-authoritative payable amount & reconciliation lifecycle (Deposit -> Balance -> Active -> Renewal)
  const depositPayable = computeStudentProgrammePayableAmount({
    enrollment: schoolApprovedEnrollment,
    paymentOption: "deposit",
  });
  assert.equal(depositPayable.payableAmount, 20000);
  assert.equal(depositPayable.resolvedOption, "deposit");
  assert.equal(depositPayable.isRenewal, false);

  const paidAt1 = new Date("2026-11-20T10:00:00.000Z");
  const afterDeposit = computeReconciledProgrammeEnrollmentState({
    enrollment: schoolApprovedEnrollment,
    baseAmountPaidNow: 20000,
    isRenewal: false,
    paidAt: paidAt1,
  });
  assert.equal(afterDeposit.newAmountPaid, 20000);
  assert.equal(afterDeposit.newRemainingBalance, 30000);
  assert.equal(afterDeposit.newPaymentStatus, "PARTIALLY_PAID");
  assert.equal(afterDeposit.accessUnlocked, true, "Deposit meets threshold so access unlocks");

  // Balance payment
  const afterDepositRecord = {
    ...schoolApprovedEnrollment,
    amountPaid: afterDeposit.newAmountPaid,
    remainingBalance: afterDeposit.newRemainingBalance,
    paymentStatus: afterDeposit.newPaymentStatus,
    enrollmentStatus: afterDeposit.newEnrollmentStatus,
    paidThrough: afterDeposit.paidThroughIso,
  };
  const balancePayable = computeStudentProgrammePayableAmount({
    enrollment: afterDepositRecord,
  });
  assert.equal(balancePayable.payableAmount, 30000);
  assert.equal(balancePayable.resolvedOption, "balance");

  const afterBalance = computeReconciledProgrammeEnrollmentState({
    enrollment: afterDepositRecord,
    baseAmountPaidNow: 30000,
    isRenewal: false,
    paidAt: new Date("2026-11-25T10:00:00.000Z"),
  });
  assert.equal(afterBalance.newAmountPaid, 50000);
  assert.equal(afterBalance.newRemainingBalance, 0);
  assert.equal(afterBalance.newPaymentStatus, "PAID");
  assert.equal(afterBalance.newEnrollmentStatus, "ACTIVE");
  assert.ok(afterBalance.nextDueDateIso, "Recurring monthly cycle must set nextDueDateIso");

  // Renewal payment
  const activeRecord = {
    ...afterDepositRecord,
    amountPaid: afterBalance.newAmountPaid,
    remainingBalance: 0,
    paymentStatus: "PAID",
    enrollmentStatus: "ACTIVE",
    paidThrough: afterBalance.paidThroughIso,
  };
  const renewalPayable = computeStudentProgrammePayableAmount({
    enrollment: activeRecord,
    paymentOption: "renewal",
  });
  assert.equal(renewalPayable.payableAmount, 50000);
  assert.equal(renewalPayable.resolvedOption, "renewal");
  assert.equal(renewalPayable.isRenewal, true);
});

// =============================================================================
// SCENARIO F: Parent portal deep-linking for child enrolment
// =============================================================================
test("Scenario F: Parent deep-link routes to /portal/parent/learning-tracks with explore tab and programme focus", () => {
  const parentUrl = buildPortalProgramExplorePath({
    role: "parent",
    programId: "prog_python",
    programSlug: "python-programming",
  });
  assert.equal(
    parentUrl,
    "/portal/parent/learning-tracks?tab=explore&programId=prog_python&programSlug=python-programming"
  );
});

// =============================================================================
// SCENARIO G: Role-specific First-Login Portal Onboarding Tour
// =============================================================================
test("Scenario G: Portal onboarding tour builds role-specific steps and skips when completed or impersonating", () => {
  const schoolStudentStepsNoBilling = buildPortalTourSteps({
    role: "student",
    studentOriginType: "school",
    canAccessStudentBilling: false,
  });
  assert.ok(!schoolStudentStepsNoBilling.some((s) => s.id === "student-payments"));

  const schoolStudentStepsWithBilling = buildPortalTourSteps({
    role: "student",
    studentOriginType: "school",
    canAccessStudentBilling: true,
  });
  assert.ok(schoolStudentStepsWithBilling.some((s) => s.id === "student-payments"));

  const parentChildSteps = buildPortalTourSteps({
    role: "student",
    studentOriginType: "parent",
    canAccessStudentBilling: true,
  });
  assert.ok(
    !parentChildSteps.some((s) => s.id === "student-payments"),
    "Parent-enrolled child tour must never mention personal billing"
  );

  const parentSteps = buildPortalTourSteps({ role: "parent" });
  assert.ok(parentSteps.some((s) => s.targetId === "nav-learning-tracks"));

  const fixedNow = Date.parse("2026-11-20T12:00:00.000Z");

  // Newly registered user with onboardingTourEligible: true must see tour
  assert.equal(
    shouldShowPortalTour({
      userDoc: { onboardingTourEligible: true },
      localCompletedVersion: null,
      isImpersonating: false,
      nowMs: fixedNow,
    }),
    true
  );

  // Newly created user within 14-day window (via createdAt) must see tour
  assert.equal(
    shouldShowPortalTour({
      userDoc: { createdAt: "2026-11-18T10:00:00.000Z" },
      localCompletedVersion: null,
      isImpersonating: false,
      nowMs: fixedNow,
    }),
    true
  );

  // Existing/legacy user without onboardingTourEligible and missing/old createdAt must NOT be auto-prompted
  assert.equal(
    shouldShowPortalTour({
      userDoc: {},
      localCompletedVersion: null,
      isImpersonating: false,
      nowMs: fixedNow,
    }),
    false,
    "Legacy user without onboardingTourEligible or recent createdAt must not be auto-prompted"
  );
  assert.equal(
    shouldShowPortalTour({
      userDoc: { createdAt: "2025-05-01T10:00:00.000Z" },
      localCompletedVersion: null,
      isImpersonating: false,
      nowMs: fixedNow,
    }),
    false,
    "Existing user older than 14 days must not be auto-prompted"
  );

  assert.equal(
    shouldShowPortalTour({
      userDoc: { onboardingTourEligible: true, portalTourVersion: PORTAL_TOUR_VERSION },
      localCompletedVersion: null,
      isImpersonating: false,
      nowMs: fixedNow,
    }),
    false
  );
  assert.equal(
    shouldShowPortalTour({
      userDoc: { onboardingTourEligible: true },
      localCompletedVersion: null,
      isImpersonating: true,
      nowMs: fixedNow,
    }),
    false,
    "Tour must never trigger during Superadmin impersonation"
  );
});
