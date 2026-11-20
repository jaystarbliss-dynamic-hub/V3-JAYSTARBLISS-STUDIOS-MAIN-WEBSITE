import test from "node:test";
import assert from "node:assert/strict";

import {
  GRACE_PERIOD_DAYS,
  PRE_DUE_REMINDER_DAYS,
  buildReminderDocumentId,
  buildRoleLockdownCopy,
  calculateRenewedPeriod,
  computeLockdownAt,
  evaluateSubscriptionState,
  getLagosDateKey,
  isPortalRouteAllowedDuringLockdown,
  lagosCalendarDayDiff,
  resolvePlanDurationWeeks,
  resolveScheduledReminderStage,
} from "../api/_lib/subscription-core.ts";

import {
  buildManualDuplicateFingerprint,
  computeManualPaymentRecordAndTransition,
  normalizeManualPaymentMethod,
} from "../api/_lib/manual-payment-core.ts";

import {
  isHistoricalOccurrence,
  planOccurrenceLinkUpdates,
  resolveOccurrenceMeetingLink,
  validateMeetingLinkUrl,
} from "../api/_lib/schedule-link-planner.ts";

import {
  PRESERVED_COLLECTIONS,
  PRESERVED_CONFIG_DOCS,
  RESET_CONFIRMATION_PHRASE,
  TARGET_FINANCIAL_COLLECTIONS,
  computePreviewSignature,
  stripTestPaymentFieldsFromBillingObject,
  stripTestPaymentFieldsFromProgrammeEnrollment,
  summarizeCollectionDocs,
  validateResetEnvironmentGuard,
  validateResetExecutionRequest,
} from "../api/_lib/financial-reset-core.ts";

// ============================================================================
// 1. SCHOOL SUBSCRIPTION LIFECYCLE
// ============================================================================
test("1. School subscription lifecycle: active -> 7d pre-due -> due -> 7d grace -> locked -> unlocked on renewal & exempt safe", () => {
  const dueAt = "2026-06-15T12:00:00+01:00";
  const baseSchoolSub = {
    id: "school_sch_01",
    accountType: "SCHOOL",
    accountId: "sch_01",
    schoolId: "sch_01",
    billingResponsibility: "SCHOOL",
    status: "ACTIVE",
    amount: 250000,
    remainingBalance: 250000,
    currency: "NGN",
    billingCycle: "Termly",
    durationWeeks: 12,
    nextDueAt: dueAt,
    gracePeriodDays: GRACE_PERIOD_DAYS,
  };

  // 14 days before due -> ACTIVE, no reminder
  const activeEval = evaluateSubscriptionState({
    subscription: baseSchoolSub,
    now: new Date("2026-06-01T10:00:00+01:00"),
  });
  assert.equal(activeEval.status, "ACTIVE");
  assert.equal(activeEval.isLocked, false);
  assert.equal(
    resolveScheduledReminderStage({ subscription: baseSchoolSub, now: new Date("2026-06-01T10:00:00+01:00") }),
    null
  );

  // Exactly 7 days before due -> DUE_SOON + PRE_DUE_7D reminder
  const preDueNow = new Date("2026-06-08T09:00:00+01:00");
  const preDueEval = evaluateSubscriptionState({ subscription: baseSchoolSub, now: preDueNow });
  assert.equal(preDueEval.status, "DUE_SOON");
  assert.equal(preDueEval.isLocked, false);
  assert.equal(preDueEval.daysUntilDue, PRE_DUE_REMINDER_DAYS);
  assert.equal(resolveScheduledReminderStage({ subscription: baseSchoolSub, now: preDueNow }), "PRE_DUE_7D");

  // Due date -> GRACE_PERIOD + DUE_TODAY reminder (portal still active)
  const dueDayNow = new Date("2026-06-15T12:05:00+01:00");
  const dueDayEval = evaluateSubscriptionState({ subscription: baseSchoolSub, now: dueDayNow });
  assert.equal(dueDayEval.status, "GRACE_PERIOD");
  assert.equal(dueDayEval.inGracePeriod, true);
  assert.equal(dueDayEval.isLocked, false);
  assert.equal(resolveScheduledReminderStage({ subscription: baseSchoolSub, now: dueDayNow }), "DUE_TODAY");

  // Day 6 of grace -> still GRACE_PERIOD, NOT locked
  const graceDay6 = evaluateSubscriptionState({
    subscription: baseSchoolSub,
    now: new Date("2026-06-21T18:00:00+01:00"),
  });
  assert.equal(graceDay6.status, "GRACE_PERIOD");
  assert.equal(graceDay6.isLocked, false);
  assert.ok(graceDay6.graceDaysRemaining >= 1);

  // After 7 full days of grace (lockdownAt = nextDueAt + 7 days) -> LOCKED + LOCKDOWN_ACTIVATED
  const postGraceNow = new Date("2026-06-22T12:01:00+01:00");
  const lockedEval = evaluateSubscriptionState({ subscription: baseSchoolSub, now: postGraceNow });
  assert.equal(lockedEval.status, "LOCKED");
  assert.equal(lockedEval.isLocked, true);
  assert.equal(resolveScheduledReminderStage({ subscription: baseSchoolSub, now: postGraceNow }), "LOCKDOWN_ACTIVATED");

  // School lockdown copy & direct URL route gating
  const schoolCopy = buildRoleLockdownCopy({ role: "school" });
  assert.equal(schoolCopy.headline, "PORTAL CURRENTLY ON LOCKDOWN — PAYMENT OVERDUE.");
  assert.equal(schoolCopy.canPay, true);
  assert.equal(schoolCopy.payNowPath, "/portal/school/payments");

  const lockedSchoolEntitlement = {
    role: "school",
    isLocked: true,
  };
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/school/payments", lockedSchoolEntitlement), true);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/school/support", lockedSchoolEntitlement), true);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/school/students", lockedSchoolEntitlement), false);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/school/calendar", lockedSchoolEntitlement), false);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/school/exams", lockedSchoolEntitlement), false);

  // Active time-limited admin override lifts lockdown temporarily
  const overriddenEval = evaluateSubscriptionState({
    subscription: {
      ...baseSchoolSub,
      override: {
        active: true,
        reason: "Bank transfer slip verified pending clearing",
        grantedByUid: "admin_1",
        grantedAt: "2026-06-22T12:30:00+01:00",
        startsAt: "2026-06-22T12:30:00+01:00",
        expiresAt: "2026-06-25T23:59:59+01:00",
      },
    },
    now: new Date("2026-06-23T10:00:00+01:00"),
  });
  assert.equal(overriddenEval.isLocked, false);
  assert.equal(overriddenEval.hasActiveOverride, true);

  // Exempt and unconfigured accounts NEVER auto-lock
  const exemptEval = evaluateSubscriptionState({
    subscription: { ...baseSchoolSub, exemption: { exempt: true, reason: "Partner scholarship", grantedByUid: "admin_1", grantedAt: "2026-01-01T00:00:00Z" } },
    now: postGraceNow,
  });
  assert.equal(exemptEval.status, "EXEMPT");
  assert.equal(exemptEval.isLocked, false);

  const missingDueEval = evaluateSubscriptionState({
    subscription: { ...baseSchoolSub, nextDueAt: null, currentPeriodEndAt: null },
    now: postGraceNow,
  });
  assert.equal(missingDueEval.isLocked, false);
  assert.equal(missingDueEval.billingConfigIncomplete, true);
});

// ============================================================================
// 2. SCHOOL STUDENT LIFECYCLE
// ============================================================================
test("2. School Student lifecycle: inherits school lock, NO Pay Now CTA, exact headline & restricted routes", () => {
  const copy = buildRoleLockdownCopy({ role: "student", studentFundingCategory: "SCHOOL_FUNDED" });
  assert.equal(copy.headline, "YOUR SCHOOL PORTAL IS CURRENTLY ON LOCKDOWN");
  assert.match(copy.message, /contact your school administrator/i);
  assert.equal(copy.canPay, false);
  assert.equal(copy.payNowPath, null);

  const lockedSchoolStudentEntitlement = {
    role: "student",
    studentFundingCategory: "SCHOOL_FUNDED",
    isLocked: true,
  };
  // Allowed: overview/support/settings only. Payments for school fee & all learning routes blocked.
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student", lockedSchoolStudentEntitlement), true);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/support", lockedSchoolStudentEntitlement), true);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/payments", lockedSchoolStudentEntitlement), false);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/courses", lockedSchoolStudentEntitlement), false);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/exams", lockedSchoolStudentEntitlement), false);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/calendar", lockedSchoolStudentEntitlement), false);
});

// ============================================================================
// 3. INDIVIDUAL STUDENT LIFECYCLE
// ============================================================================
test("3. Individual Student lifecycle: grace -> locked with Pay Now enabled and Billing route accessible", () => {
  const copy = buildRoleLockdownCopy({ role: "student", studentFundingCategory: "INDIVIDUAL_SELF_FUNDED" });
  assert.equal(copy.headline, "YOUR LEARNING PORTAL IS CURRENTLY ON LOCKDOWN");
  assert.match(copy.message, /complete your payment to continue learning/i);
  assert.equal(copy.canPay, true);
  assert.equal(copy.payNowPath, "/portal/student/payments");

  const lockedIndivEntitlement = {
    role: "student",
    studentFundingCategory: "INDIVIDUAL_SELF_FUNDED",
    isLocked: true,
  };
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/payments", lockedIndivEntitlement), true);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/courses", lockedIndivEntitlement), false);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/assignments", lockedIndivEntitlement), false);
  assert.equal(isPortalRouteAllowedDuringLockdown("/portal/student/exams", lockedIndivEntitlement), false);
});

// ============================================================================
// 4. PARENT & PARENT-ENROLLED CHILD LIFECYCLE
// ============================================================================
test("4. Parent & Parent-Enrolled Child lifecycle: per-child isolation, child sees parent-contact lock with NO Pay Now", () => {
  const parentCopy = buildRoleLockdownCopy({ role: "parent" });
  assert.equal(parentCopy.headline, "YOUR CHILD'S LEARNING ACCESS IS CURRENTLY ON LOCKDOWN");
  assert.equal(parentCopy.canPay, true);
  assert.equal(parentCopy.payNowPath, "/portal/parent/payments");

  const childCopy = buildRoleLockdownCopy({ role: "student", studentFundingCategory: "PARENT_FUNDED" });
  assert.equal(childCopy.headline, "YOUR LEARNING PORTAL IS CURRENTLY ON LOCKDOWN");
  assert.match(childCopy.message, /contact your parent or guardian/i);
  assert.equal(childCopy.canPay, false);
  assert.equal(childCopy.payNowPath, null);

  // Per-child isolation: Child A is overdue > 7d (LOCKED), Child B is paid ahead (ACTIVE)
  const now = new Date("2026-07-15T10:00:00+01:00");
  const childAEval = evaluateSubscriptionState({
    subscription: {
      id: "parent_p1_child_a",
      accountType: "PARENT_CHILD",
      accountId: "p1",
      parentId: "p1",
      studentId: "child_a",
      billingResponsibility: "PARENT",
      status: "ACTIVE",
      amount: 45000,
      remainingBalance: 45000,
      currency: "NGN",
      billingCycle: "Monthly",
      durationWeeks: 4,
      nextDueAt: "2026-07-01T12:00:00+01:00",
      gracePeriodDays: 7,
    },
    now,
  });
  const childBEval = evaluateSubscriptionState({
    subscription: {
      id: "parent_p1_child_b",
      accountType: "PARENT_CHILD",
      accountId: "p1",
      parentId: "p1",
      studentId: "child_b",
      billingResponsibility: "PARENT",
      status: "ACTIVE",
      amount: 45000,
      remainingBalance: 0,
      currency: "NGN",
      billingCycle: "Monthly",
      durationWeeks: 4,
      nextDueAt: "2026-08-10T12:00:00+01:00",
      gracePeriodDays: 7,
    },
    now,
  });

  assert.equal(childAEval.isLocked, true);
  assert.equal(childBEval.isLocked, false);
  assert.equal(childBEval.status, "ACTIVE");
});

// ============================================================================
// 5. ADMIN MANUAL PAYMENT RECORDING
// ============================================================================
test("5. Manual Payment recording: distinct MANUAL_ADMIN/ADMIN_VERIFIED metadata, full vs partial, duplicate fingerprint", () => {
  // Partial payment without deposit unlock keeps access locked and preserves existing due date
  const partialRes = computeManualPaymentRecordAndTransition({
    targetType: "SCHOOL",
    targetId: "sch_01",
    accountName: "Greenfield Academy",
    schoolId: "sch_01",
    subscriptionId: "school_sch_01",
    billingResponsibility: "SCHOOL",
    accountType: "SCHOOL",
    amount: 100000,
    contractAmount: 250000,
    priorAmountPaid: 0,
    paymentMethod: "Bank Transfer",
    paymentDate: "2026-06-23T11:00:00+01:00",
    reference: "MAN-BANK-001",
    notes: "First tranche via GTBank transfer",
    cycle: "Termly",
    durationWeeks: 12,
    existingPeriodEndAt: "2026-06-15T12:00:00+01:00",
    verifiedByUid: "admin_uid_1",
    verifiedByName: "Finance Director",
  });

  assert.equal(partialRes.isPartial, true);
  assert.equal(partialRes.accessUnlocked, false);
  assert.equal(partialRes.remainingBalance, 150000);
  assert.equal(partialRes.subscriptionPatch.status, "PARTIALLY_PAID");
  assert.equal(partialRes.paymentRecord.paymentSource, "MANUAL_ADMIN");
  assert.equal(partialRes.paymentRecord.verificationStatus, "ADMIN_VERIFIED");
  assert.equal(partialRes.paymentRecord.checkoutProvider, "manual_admin");
  assert.equal(partialRes.paymentRecord.paymentMethod, "bank_transfer");
  assert.equal(partialRes.paymentRecord.verifiedBy, "admin_uid_1");
  assert.equal(partialRes.paymentRecord.providerTransactionId, undefined);

  // Remaining balance payment completes settlement and unlocks for full 12 weeks (not hardcoded 4 weeks)
  const finalRes = computeManualPaymentRecordAndTransition({
    targetType: "SCHOOL",
    targetId: "sch_01",
    accountName: "Greenfield Academy",
    schoolId: "sch_01",
    subscriptionId: "school_sch_01",
    billingResponsibility: "SCHOOL",
    accountType: "SCHOOL",
    amount: 150000,
    contractAmount: 250000,
    priorAmountPaid: 100000,
    paymentMethod: "POS",
    paymentDate: "2026-06-24T14:00:00+01:00",
    reference: "MAN-POS-002",
    cycle: "Termly",
    durationWeeks: 12,
    existingPeriodEndAt: "2026-06-15T12:00:00+01:00",
    verifiedByUid: "admin_uid_1",
    verifiedByName: "Finance Director",
  });

  assert.equal(finalRes.isPartial, false);
  assert.equal(finalRes.accessUnlocked, true);
  assert.equal(finalRes.remainingBalance, 0);
  assert.equal(finalRes.subscriptionPatch.status, "ACTIVE");
  assert.equal(finalRes.subscriptionPatch.durationWeeks, 12);
  assert.equal(finalRes.paymentRecord.paymentMethod, "pos");
  assert.equal(normalizeManualPaymentMethod("Cash"), "cash");

  // Deterministic duplicate fingerprint detects identical manual payment resubmissions
  const fp1 = buildManualDuplicateFingerprint({
    subscriptionId: "school_sch_01",
    amount: 150000,
    paymentDate: "2026-06-24T14:00:00+01:00",
    reference: "MAN-POS-002",
  });
  const fp2 = buildManualDuplicateFingerprint({
    subscriptionId: "school_sch_01",
    amount: 150000,
    paymentDate: "2026-06-24T18:30:00+01:00",
    reference: "  man-pos-002 ",
  });
  assert.equal(fp1, fp2);
});

// ============================================================================
// 6. RENEWAL PERIOD CALCULATIONS & AFRICA/LAGOS REMINDER IDEMPOTENCY
// ============================================================================
test("6. Renewal period calculations (early, grace, post-grace, variable weeks) & deterministic reminder IDs", () => {
  const existingEnd = new Date("2026-06-15T12:00:00Z");

  // Early renewal (5 days before expiry) on 8-week plan -> extends from existingEnd by 8 weeks (56 days)
  const early = calculateRenewedPeriod({
    currentPeriodEndAt: existingEnd,
    paidAt: new Date("2026-06-10T10:00:00Z"),
    durationWeeks: 8,
  });
  assert.equal(early.renewalMode, "EARLY_EXTENSION");
  assert.equal(early.periodStartAt.toISOString(), existingEnd.toISOString());
  assert.equal(
    Math.round((early.periodEndAt.getTime() - existingEnd.getTime()) / (24 * 60 * 60 * 1000)),
    56
  );
  assert.equal(
    early.graceEndsAt.toISOString(),
    computeLockdownAt(early.periodEndAt, 7).toISOString()
  );

  // Grace-period renewal (day 4 of 7-day grace) -> preserves continuity from existingEnd
  const grace = calculateRenewedPeriod({
    currentPeriodEndAt: existingEnd,
    paidAt: new Date("2026-06-19T09:00:00Z"),
    durationWeeks: 12,
  });
  assert.equal(grace.renewalMode, "GRACE_EXTENSION");
  assert.equal(grace.periodStartAt.toISOString(), existingEnd.toISOString());
  assert.equal(
    Math.round((grace.periodEndAt.getTime() - existingEnd.getTime()) / (24 * 60 * 60 * 1000)),
    84
  );

  // Post-grace renewal (day 15 after expiry -> locked) -> starts fresh from verified paidAt
  const paidLate = new Date("2026-06-30T15:00:00Z");
  const postGrace = calculateRenewedPeriod({
    currentPeriodEndAt: existingEnd,
    paidAt: paidLate,
    durationWeeks: 4,
  });
  assert.equal(postGrace.renewalMode, "POST_GRACE_FRESH");
  assert.equal(postGrace.periodStartAt.toISOString(), paidLate.toISOString());
  assert.equal(
    Math.round((postGrace.periodEndAt.getTime() - paidLate.getTime()) / (24 * 60 * 60 * 1000)),
    28
  );

  // Variable plan durations never hardcoded to 4 weeks
  assert.equal(resolvePlanDurationWeeks({ durationWeeks: 8 }), 8);
  assert.equal(resolvePlanDurationWeeks({ cycle: "Termly" }), 12);
  assert.equal(resolvePlanDurationWeeks({ cycle: "Annual" }), 52);
  assert.equal(resolvePlanDurationWeeks({ cycle: "Monthly" }), 4);

  // Africa/Lagos timezone date key & deterministic reminder document IDs
  assert.equal(getLagosDateKey("2026-06-14T23:30:00Z"), "2026-06-15"); // UTC+1 crosses midnight in Lagos
  assert.equal(lagosCalendarDayDiff("2026-06-22T08:00:00+01:00", new Date("2026-06-15T08:00:00+01:00")), 7);

  const remIdA = buildReminderDocumentId({
    subscriptionId: "school_sch_01",
    dueDateIso: "2026-06-15T12:00:00+01:00",
    reminderType: "PRE_DUE_7D",
  });
  const remIdB = buildReminderDocumentId({
    subscriptionId: "school_sch_01",
    dueDateIso: "2026-06-15T20:00:00+01:00",
    reminderType: "PRE_DUE_7D",
  });
  assert.equal(remIdA, remIdB);
  assert.equal(remIdA, "school_sch_01__2026-06-15__PRE_DUE_7D");
});

// ============================================================================
// 7. TUTOR PER-SESSION CLASS MEETING LINKS
// ============================================================================
test("7. Tutor per-session meeting links: single override, selected future, future inherited default, historical protection & URL validation", () => {
  const defaultUrl = "https://teams.microsoft.com/l/meetup-join/default-series";
  const week2CustomUrl = "https://meet.google.com/abc-defg-hij";
  const newDefaultUrl = "https://zoom.us/j/9988776655";
  const todayLagos = "2026-06-15";

  const series = [
    {
      id: "occ_past_1",
      scheduleGroupId: "grp_1",
      date: "2026-06-08",
      status: "COMPLETED",
      meetingLink: defaultUrl,
      defaultMeetingLink: defaultUrl,
      linkSource: "INHERITED",
    },
    {
      id: "occ_wk2",
      scheduleGroupId: "grp_1",
      date: "2026-06-15",
      status: "SCHEDULED",
      meetingLink: defaultUrl,
      defaultMeetingLink: defaultUrl,
      linkSource: "INHERITED",
    },
    {
      id: "occ_wk3",
      scheduleGroupId: "grp_1",
      date: "2026-06-22",
      status: "SCHEDULED",
      meetingLink: defaultUrl,
      defaultMeetingLink: defaultUrl,
      linkSource: "INHERITED",
    },
    {
      id: "occ_wk4",
      scheduleGroupId: "grp_1",
      date: "2026-06-29",
      status: "SCHEDULED",
      meetingLink: defaultUrl,
      defaultMeetingLink: defaultUrl,
      linkSource: "INHERITED",
    },
  ];

  // URL validation rejects unsafe/non-HTTPS links and detects platforms
  assert.equal(validateMeetingLinkUrl("javascript:alert(1)").valid, false);
  assert.equal(validateMeetingLinkUrl("http://meet.google.com/insecure").valid, false);
  const validTeams = validateMeetingLinkUrl(defaultUrl);
  assert.equal(validTeams.valid, true);
  assert.equal(validTeams.platform, "Microsoft Teams");

  // Single occurrence override only modifies wk2, leaving past & wk3/wk4 untouched
  const singlePlan = planOccurrenceLinkUpdates({
    occurrences: series,
    targetOccurrenceId: "occ_wk2",
    scope: "SINGLE",
    newLink: week2CustomUrl,
    nowLagosDateKey: todayLagos,
  });
  assert.equal(singlePlan.patches.length, 1);
  assert.equal(singlePlan.patches[0].id, "occ_wk2");
  assert.equal(singlePlan.patches[0].linkSource, "CUSTOM");
  assert.equal(singlePlan.patches[0].meetingLink, week2CustomUrl);
  assert.equal(singlePlan.patches[0].platform, "Google Meet");

  // Apply wk2 custom override in memory and verify occurrence resolution
  const seriesAfterWk2 = series.map((occ) =>
    occ.id === "occ_wk2" ? { ...occ, ...singlePlan.patches[0] } : occ
  );
  assert.equal(resolveOccurrenceMeetingLink(seriesAfterWk2[1]).effectiveLink, week2CustomUrl);
  assert.equal(resolveOccurrenceMeetingLink(seriesAfterWk2[1]).linkSource, "CUSTOM");
  assert.equal(resolveOccurrenceMeetingLink(seriesAfterWk2[2]).effectiveLink, defaultUrl);
  assert.equal(resolveOccurrenceMeetingLink(seriesAfterWk2[2]).linkSource, "INHERITED");

  // Updating future default updates wk3 & wk4, preserves wk2 custom override, and NEVER touches occ_past_1
  const futureDefaultPlan = planOccurrenceLinkUpdates({
    occurrences: seriesAfterWk2,
    targetOccurrenceId: "occ_wk3",
    scope: "ALL_FUTURE_INHERITED",
    newLink: newDefaultUrl,
    nowLagosDateKey: todayLagos,
  });
  assert.equal(futureDefaultPlan.skippedHistoricalCount, 1);
  assert.equal(futureDefaultPlan.skippedCustomOverrideCount, 1);
  assert.equal(futureDefaultPlan.patches.some((p) => p.id === "occ_past_1"), false);

  const wk2Patch = futureDefaultPlan.patches.find((p) => p.id === "occ_wk2");
  assert.equal(wk2Patch.meetingLink, week2CustomUrl); // custom link preserved!
  assert.equal(wk2Patch.linkSource, "CUSTOM");
  assert.equal(wk2Patch.defaultMeetingLink, newDefaultUrl);

  const wk3Patch = futureDefaultPlan.patches.find((p) => p.id === "occ_wk3");
  const wk4Patch = futureDefaultPlan.patches.find((p) => p.id === "occ_wk4");
  assert.equal(wk3Patch.meetingLink, newDefaultUrl);
  assert.equal(wk3Patch.linkSource, "INHERITED");
  assert.equal(wk4Patch.meetingLink, newDefaultUrl);

  // Selected future occurrences only updates explicitly chosen future IDs (ignoring past IDs even if passed)
  const selectedPlan = planOccurrenceLinkUpdates({
    occurrences: series,
    selectedOccurrenceIds: ["occ_past_1", "occ_wk4"],
    scope: "SELECTED_FUTURE",
    newLink: "https://meet.google.com/only-wk4",
    nowLagosDateKey: todayLagos,
  });
  assert.equal(selectedPlan.skippedHistoricalCount, 1);
  assert.equal(selectedPlan.patches.length, 1);
  assert.equal(selectedPlan.patches[0].id, "occ_wk4");
  assert.equal(isHistoricalOccurrence(series[0], todayLagos), true);

  // Reset to default restores wk2 to defaultMeetingLink
  const resetPlan = planOccurrenceLinkUpdates({
    occurrences: seriesAfterWk2,
    targetOccurrenceId: "occ_wk2",
    scope: "RESET_TO_DEFAULT",
    newLink: "",
    nowLagosDateKey: todayLagos,
  });
  assert.equal(resetPlan.patches.length, 1);
  assert.equal(resetPlan.patches[0].meetingLink, defaultUrl);
  assert.equal(resetPlan.patches[0].linkSource, "INHERITED");
});

// ============================================================================
// 8. CONTROLLED TEST FINANCIAL DATA RESET SAFEGUARDS
// ============================================================================
test("8. Controlled Test Financial Data Reset: fail-closed env guards, preview signature, superadmin RBAC, non-financial preservation", () => {
  // Fail-closed when ALLOW_TEST_FINANCIAL_RESET is missing or false
  const blockedNoFlag = validateResetEnvironmentGuard({
    activeProjectId: "jaystarbliss-staging",
    expectedTestProjectId: "jaystarbliss-staging",
    allowResetFlag: "false",
    firebaseEnv: "staging",
  });
  assert.equal(blockedNoFlag.allowed, false);

  // Fail-closed on project ID mismatch
  const blockedMismatch = validateResetEnvironmentGuard({
    activeProjectId: "jaystarbliss-prod",
    expectedTestProjectId: "jaystarbliss-staging",
    allowResetFlag: "true",
    firebaseEnv: "staging",
  });
  assert.equal(blockedMismatch.allowed, false);

  // Fail-closed when firebaseEnv is production
  const blockedProdEnv = validateResetEnvironmentGuard({
    activeProjectId: "jaystarbliss-staging",
    expectedTestProjectId: "jaystarbliss-staging",
    allowResetFlag: "true",
    firebaseEnv: "production",
  });
  assert.equal(blockedProdEnv.allowed, false);

  // Allowed ONLY when all guards pass
  const allowedGuard = validateResetEnvironmentGuard({
    activeProjectId: "jaystarbliss-staging",
    expectedTestProjectId: "jaystarbliss-staging",
    allowResetFlag: "true",
    firebaseEnv: "staging",
  });
  assert.equal(allowedGuard.allowed, true);

  // Stage A inventory summary & deterministic preview signature
  const paymentsSummary = summarizeCollectionDocs({
    collection: "payments",
    action: "DELETE_DOCUMENTS",
    docs: [
      { status: "PAID", amount: 50000 },
      { status: "PENDING", amount: 25000 },
    ],
  });
  assert.equal(paymentsSummary.documentCount, 2);
  assert.equal(paymentsSummary.aggregateAmountNaira, 75000);
  assert.equal(paymentsSummary.statusBreakdown.PAID, 1);

  const sig = computePreviewSignature({
    activeProjectId: "jaystarbliss-staging",
    collections: [paymentsSummary],
  });

  // Non-superadmin rejected
  assert.equal(
    validateResetExecutionRequest({
      isSuperAdmin: false,
      confirmationPhrase: RESET_CONFIRMATION_PHRASE,
      providedPreviewSignature: sig,
      freshPreviewSignature: sig,
      guard: allowedGuard,
    }).ok,
    false
  );

  // Wrong confirmation phrase rejected
  assert.equal(
    validateResetExecutionRequest({
      isSuperAdmin: true,
      confirmationPhrase: "clear test financial data",
      providedPreviewSignature: sig,
      freshPreviewSignature: sig,
      guard: allowedGuard,
    }).ok,
    false
  );

  // Stale preview signature rejected
  assert.equal(
    validateResetExecutionRequest({
      isSuperAdmin: true,
      confirmationPhrase: RESET_CONFIRMATION_PHRASE,
      providedPreviewSignature: "RST-STALE-0000",
      freshPreviewSignature: sig,
      guard: allowedGuard,
    }).ok,
    false
  );

  // Exact match with superadmin + valid guard passes validation
  assert.equal(
    validateResetExecutionRequest({
      isSuperAdmin: true,
      confirmationPhrase: RESET_CONFIRMATION_PHRASE,
      providedPreviewSignature: sig,
      freshPreviewSignature: sig,
      guard: allowedGuard,
    }).ok,
    true
  );

  // Embedded billing strip preserves contract config while resetting test settlement history
  const cleanedBilling = stripTestPaymentFieldsFromBillingObject({
    planId: "school_termly_pro",
    planName: "Institutional Termly",
    baseAmount: 300000,
    cycle: "Termly",
    durationWeeks: 12,
    allowedModes: ["full", "installment"],
    notes: "Partner discount 10%",
    amountPaid: 300000,
    remainingBalance: 0,
    lastPaidAt: "2026-05-01T10:00:00Z",
    lastPaymentReference: "TEST_REF_123",
    paidThrough: "2026-08-01T10:00:00Z",
  });
  assert.equal(cleanedBilling.planId, "school_termly_pro");
  assert.equal(cleanedBilling.baseAmount, 300000);
  assert.equal(cleanedBilling.durationWeeks, 12);
  assert.equal(cleanedBilling.notes, "Partner discount 10%");
  assert.equal(cleanedBilling.amountPaid, 0);
  assert.equal(cleanedBilling.remainingBalance, 300000);
  assert.equal(cleanedBilling.lastPaymentReference, null);

  // Programme enrollment strip preserves approval/fee while resetting test payments
  const cleanedEnrollment = stripTestPaymentFieldsFromProgrammeEnrollment({
    approvedFee: 75000,
    enrollmentStatus: "ACTIVE",
    amountPaid: 75000,
    paymentStatus: "PAID",
    lastPaymentReference: "TEST_ENR_99",
  });
  assert.equal(cleanedEnrollment.amountPaid, 0);
  assert.equal(cleanedEnrollment.remainingBalance, 75000);
  assert.equal(cleanedEnrollment.paymentStatus, "UNPAID");
  assert.equal(cleanedEnrollment.enrollmentStatus, "APPROVED_AWAITING_PAYMENT");

  // Operational/academic collections & payment_config/settings are strictly excluded from deletion list
  for (const preserved of ["payment_config", "users", "schools", "students", "individualStudents", "parents", "programs", "classSchedules", "jdiExams", "jdiExamAttempts"]) {
    assert.ok(PRESERVED_COLLECTIONS.includes(preserved));
    assert.equal(TARGET_FINANCIAL_COLLECTIONS.includes(preserved), false);
  }
  assert.ok(PRESERVED_CONFIG_DOCS.includes("payment_config/settings"));
});
