/**
 * Central Subscription & Access-Control Pure Domain Engine
 *
 * Single source of truth for:
 * - Subscription states & seven-day grace period policy (lockdownAt = nextDueAt + 7 days)
 * - Africa/Lagos timezone date boundary & display formatting
 * - Early, grace-period, and post-grace renewal period calculation using actual plan durationWeeks
 * - Role-specific Microsoft-Office-style portal lockdown metadata & exact copy
 * - Funding-responsibility precedence (School vs Parent vs Individual Student vs Self-Funded Additional Programme)
 */

import {
  buildDefaultUserFacingMessage,
  getAutomaticPaymentReasonCode,
  getLockReasonLabel,
  isPaymentReasonCode,
  isPaymentRestrictionRecord,
  isRestrictionActiveAt,
  type AccountRestrictionRecord,
  type LockReasonCode,
  type PublicRestrictionSummary,
  type RestrictionType,
} from "./restriction-core";

export const BUSINESS_TIMEZONE = "Africa/Lagos";
export const GRACE_PERIOD_DAYS = 7;
export const PRE_DUE_REMINDER_DAYS = 7;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SubscriptionAccountType =
  | "SCHOOL"
  | "SCHOOL_ADMIN"
  | "INDIVIDUAL_STUDENT"
  | "PARENT"
  | "PARENT_CHILD"
  | "STUDENT_SELF_FUNDED_PROGRAMME";

export type BillingResponsibility =
  | "SCHOOL"
  | "PARENT"
  | "STUDENT"
  | "STUDENT_SELF_FUNDED"
  | "COMPLIMENTARY"
  | "EXEMPT";

export type SubscriptionState =
  | "ACTIVE"
  | "DUE_SOON"
  | "GRACE_PERIOD"
  | "LOCKED"
  | "PARTIALLY_PAID"
  | "EXEMPT"
  | "SUSPENDED"
  | "CANCELLED";

export type PortalRoleKey = "school" | "student" | "parent" | "staff" | "admin";

export type StudentFundingCategory =
  | "SCHOOL_FUNDED"
  | "PARENT_FUNDED"
  | "INDIVIDUAL_SELF_FUNDED";

export interface SubscriptionOverride {
  active: boolean;
  reason: string;
  grantedByUid: string;
  grantedByName?: string;
  grantedAt: string;
  startsAt: string;
  expiresAt: string;
}

export interface SubscriptionExemption {
  exempt: boolean;
  reason: string;
  grantedByUid: string;
  grantedByName?: string;
  grantedAt: string;
}

export interface BillingSubscriptionRecord {
  id: string;
  accountType: SubscriptionAccountType;
  accountId: string;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  programmeEnrollmentId?: string | null;
  accountName?: string | null;
  recipientEmail?: string | null;
  billingResponsibility: BillingResponsibility;
  status: SubscriptionState;
  planId?: string | null;
  planName?: string | null;
  programmeId?: string | null;
  programmeName?: string | null;
  amount: number;
  amountPaid?: number;
  remainingBalance?: number;
  allowDepositAccess?: boolean;
  depositAmount?: number;
  currency: string;
  billingCycle: string;
  durationWeeks: number;
  currentPeriodStartAt?: string | null;
  currentPeriodEndAt?: string | null;
  nextDueAt?: string | null;
  gracePeriodDays: number;
  graceEndsAt?: string | null;
  lastSuccessfulPaymentAt?: string | null;
  lastPaymentReference?: string | null;
  lastReminderSentAt?: string | null;
  lockdownActivatedAt?: string | null;
  override?: SubscriptionOverride | null;
  exemption?: SubscriptionExemption | null;
  manuallyLocked?: boolean;
  manualLockReason?: string | null;
  manualLockedAt?: string | null;
  manualLockedByUid?: string | null;
  manualLockedByName?: string | null;
  manuallyUnlocked?: boolean;
  manualUnlockReason?: string | null;
  manualUnlockedAt?: string | null;
  manualUnlockedByUid?: string | null;
  manualUnlockedByName?: string | null;
  isComplimentary?: boolean;
  billingConfigIncomplete?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ChildEntitlementSummary {
  childId: string;
  childName: string;
  programmeId?: string | null;
  programmeName?: string | null;
  subscriptionId?: string | null;
  billingResponsibility: BillingResponsibility;
  status: SubscriptionState;
  isLocked: boolean;
  inGracePeriod: boolean;
  amountDue: number;
  dueDateIso: string | null;
  dueDateFormatted: string | null;
  graceEndsAtIso: string | null;
  graceDaysRemaining: number;
  daysUntilDue: number | null;
  feeItemId?: string | null;
}

export interface SelfFundedProgrammeEntitlement {
  programmeEnrollmentId: string;
  programmeId: string;
  programmeName: string;
  status: SubscriptionState;
  isLocked: boolean;
  amountDue: number;
  dueDateIso: string | null;
  restrictionType?: RestrictionType | null;
  lockReasonCode?: LockReasonCode | null;
  lockReasonLabel?: string | null;
  userFacingMessage?: string | null;
  canPay?: boolean;
}

export type PortalNextActionType =
  | "PAY_NOW"
  | "CONTACT_SUPPORT"
  | "CONTACT_SCHOOL"
  | "CONTACT_PARENT"
  | "NONE";

export interface PortalEntitlementResult {
  role: PortalRoleKey;
  accountType: SubscriptionAccountType | "STAFF" | "ADMIN";
  accountId: string;
  accountName: string;
  billingResponsibility: BillingResponsibility;
  studentFundingCategory?: StudentFundingCategory;
  status: SubscriptionState;
  isLocked: boolean;
  inGracePeriod: boolean;
  isDueSoon: boolean;
  isExempt: boolean;
  isManuallyLocked?: boolean;
  manualLockReason?: string | null;
  isManuallyUnlocked?: boolean;
  restrictionType?: RestrictionType | null;
  lockReasonCode?: LockReasonCode | null;
  lockReasonLabel?: string | null;
  effectiveAtIso?: string | null;
  effectiveAtFormatted?: string | null;
  expiresAtIso?: string | null;
  expiresAtFormatted?: string | null;
  activeRestrictions?: PublicRestrictionSummary[];
  hasPaymentRestriction?: boolean;
  hasNonPaymentRestriction?: boolean;
  nextActionType?: PortalNextActionType;
  hasActiveOverride: boolean;
  overrideExpiresAt: string | null;
  billingConfigIncomplete: boolean;
  canPay: boolean;
  payNowPath: string | null;
  amountDue: number;
  currency: string;
  dueDateIso: string | null;
  dueDateFormatted: string | null;
  graceEndsAtIso: string | null;
  graceEndsAtFormatted: string | null;
  daysUntilDue: number | null;
  graceDaysRemaining: number;
  subscriptionId: string | null;
  schoolId: string | null;
  schoolName: string | null;
  headline: string;
  bannerText: string;
  message: string;
  restrictedClickMessage: string;
  affectedChildren: ChildEntitlementSummary[];
  allChildrenLocked: boolean;
  lockedChildIds: string[];
  selfFundedProgrammes: SelfFundedProgrammeEntitlement[];
  evaluatedAtIso: string;
}

export function parseDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof (value as any)?.toDate === "function") {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof (value as any)?.seconds === "number") {
    const d = new Date((value as any).seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string" || typeof value === "number") {
    const trimmed = typeof value === "string" ? value.trim() : value;
    if (trimmed === "") return null;
    // Interpret bare YYYY-MM-DD dates in Africa/Lagos (+01:00) end-of-day boundary for fairness
    if (typeof trimmed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T23:59:59+01:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Returns YYYY-MM-DD in Africa/Lagos timezone.
 */
export function getLagosDateKey(dateInput: Date | string | number): string {
  const date = parseDateSafe(dateInput) || new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

/**
 * Returns whole calendar day difference between two timestamps using Africa/Lagos calendar dates.
 * Positive = targetDate is in the future relative to referenceDate.
 * Zero = same Lagos calendar day.
 * Negative = targetDate is in the past (days overdue = Math.abs(diff)).
 */
export function lagosCalendarDayDiff(targetInput: Date | string | number, referenceInput: Date = new Date()): number {
  const targetKey = getLagosDateKey(targetInput);
  const refKey = getLagosDateKey(referenceInput);
  const targetMidnightUtc = Date.parse(`${targetKey}T00:00:00Z`);
  const refMidnightUtc = Date.parse(`${refKey}T00:00:00Z`);
  return Math.round((targetMidnightUtc - refMidnightUtc) / MS_PER_DAY);
}

export function formatLagosDate(dateInput: Date | string | number | null | undefined): string | null {
  const date = parseDateSafe(dateInput);
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat("en-NG", {
      timeZone: BUSINESS_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Policy: lockdownAt = subscriptionDueAt + gracePeriodDays (default 7 days).
 */
export function computeLockdownAt(dueAtInput: Date | string | number, graceDays = GRACE_PERIOD_DAYS): Date {
  const dueAt = parseDateSafe(dueAtInput) || new Date();
  const safeGrace = Number.isFinite(graceDays) && graceDays >= 0 ? Math.floor(graceDays) : GRACE_PERIOD_DAYS;
  return new Date(dueAt.getTime() + safeGrace * MS_PER_DAY);
}

/**
 * Resolves the authoritative duration in weeks from plan/cycle metadata.
 * Never assumes every programme lasts 4 weeks when an explicit duration or cycle exists.
 */
export function resolvePlanDurationWeeks(input: {
  durationWeeks?: unknown;
  cycle?: unknown;
  billingCycle?: unknown;
  fallbackWeeks?: number;
}): number {
  const explicit = Number(input.durationWeeks);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.round(explicit);
  }
  const cycleRaw = String(input.cycle || input.billingCycle || "").trim().toLowerCase();
  if (cycleRaw.includes("annual") || cycleRaw.includes("year")) return 52;
  if (cycleRaw.includes("term")) return 12;
  if (cycleRaw.includes("quarter")) return 12;
  if (cycleRaw.includes("bi-month") || cycleRaw.includes("bimonth") || cycleRaw.includes("8")) return 8;
  if (cycleRaw.includes("month")) return 4;
  if (cycleRaw.includes("week")) {
    const match = cycleRaw.match(/(\d+)/);
    if (match) return Math.max(1, Number(match[1]));
  }
  return Math.max(1, Number(input.fallbackWeeks || 4));
}

export interface EvaluatedSubscriptionResult {
  status: SubscriptionState;
  isLocked: boolean;
  isManuallyLocked: boolean;
  manualLockReason: string | null;
  isManuallyUnlocked: boolean;
  restrictionType: RestrictionType | null;
  lockReasonCode: LockReasonCode | null;
  lockReasonLabel: string | null;
  userFacingMessage: string | null;
  effectiveAtIso: string | null;
  effectiveAtFormatted: string | null;
  expiresAtIso: string | null;
  expiresAtFormatted: string | null;
  hasPaymentRestriction: boolean;
  hasNonPaymentRestriction: boolean;
  activeRestrictionRecords: AccountRestrictionRecord[];
  inGracePeriod: boolean;
  isDueSoon: boolean;
  isExempt: boolean;
  hasActiveOverride: boolean;
  overrideExpiresAt: string | null;
  billingConfigIncomplete: boolean;
  amountDue: number;
  dueDateIso: string | null;
  dueDateFormatted: string | null;
  graceEndsAtIso: string | null;
  graceEndsAtFormatted: string | null;
  daysUntilDue: number | null;
  graceDaysRemaining: number;
}

/**
 * Authoritative state evaluator for any single subscription record combined with
 * independent `accountRestrictions` records.
 *
 * Critical safeguards:
 * 1. Payment-cycle lockdown and independent manual/administrative restrictions are evaluated SEPARATELY.
 *    - Paying an overdue balance clears ONLY the payment restriction; any active manual restriction stays active.
 *    - Lifting a manual restriction does NOT clear an unpaid balance or mark an invoice as paid.
 * 2. Temporary restrictions (`expiresAt`) and temporary payment overrides automatically expire at `expiresAt`.
 * 3. Explicit EXEMPT / complimentary accounts NEVER auto-lock for payment, but still respect explicit manual restrictions.
 * 4. Accounts with no configured payment obligation or missing due date NEVER auto-lock for payment.
 * 5. Exact 7-day grace window: `now > lockdownAt` => AUTOMATED_PAYMENT_LOCKDOWN with structured reason code.
 */
export function evaluateSubscriptionState(input: {
  subscription: Partial<BillingSubscriptionRecord> | null | undefined;
  activeRestrictions?: AccountRestrictionRecord[];
  now?: Date;
}): EvaluatedSubscriptionResult {
  const now = input.now || new Date();
  const sub = input.subscription;

  const baseEmpty: EvaluatedSubscriptionResult = {
    status: "ACTIVE",
    isLocked: false,
    isManuallyLocked: false,
    manualLockReason: null,
    isManuallyUnlocked: false,
    restrictionType: null,
    lockReasonCode: null,
    lockReasonLabel: null,
    userFacingMessage: null,
    effectiveAtIso: null,
    effectiveAtFormatted: null,
    expiresAtIso: null,
    expiresAtFormatted: null,
    hasPaymentRestriction: false,
    hasNonPaymentRestriction: false,
    activeRestrictionRecords: [],
    inGracePeriod: false,
    isDueSoon: false,
    isExempt: false,
    hasActiveOverride: false,
    overrideExpiresAt: null,
    billingConfigIncomplete: false,
    amountDue: 0,
    dueDateIso: null,
    dueDateFormatted: null,
    graceEndsAtIso: null,
    graceEndsAtFormatted: null,
    daysUntilDue: null,
    graceDaysRemaining: 0,
  };

  // Filter explicit restriction records that are currently active (not expired, not future-scheduled, not lifted)
  const explicitActiveRecords: AccountRestrictionRecord[] = (input.activeRestrictions || []).filter((r) =>
    isRestrictionActiveAt(r, now)
  );

  // Backward-compatible legacy `manuallyLocked` boolean on subscription doc (when no explicit manual restriction record exists)
  const legacyManualLockReason = sub?.manualLockReason ? String(sub.manualLockReason).trim() : null;
  const hasExplicitManualRecord = explicitActiveRecords.some(
    (r) => r.restrictionType !== "AUTOMATED_PAYMENT_LOCKDOWN"
  );
  if (sub?.manuallyLocked === true && !hasExplicitManualRecord) {
    const legacyEffectiveIso = parseDateSafe(sub.manualLockedAt)?.toISOString() || now.toISOString();
    explicitActiveRecords.push({
      restrictionId: `legacy_manual_${sub.id || "account"}`,
      targetAccountId: String(sub.accountId || sub.id || ""),
      targetAccountType: (sub.accountType || "SCHOOL") as AccountRestrictionRecord["targetAccountType"],
      accountName: sub.accountName || null,
      schoolId: sub.schoolId || null,
      parentId: sub.parentId || null,
      studentId: sub.studentId || null,
      programmeEnrollmentId: sub.programmeEnrollmentId || null,
      affectedStudentIds: [],
      affectedProgrammeIds: sub.programmeId ? [String(sub.programmeId)] : [],
      restrictionType: "MANUAL_ADMINISTRATIVE_RESTRICTION",
      reasonCode: "ADMINISTRATIVE_RESTRICTION",
      customReason: legacyManualLockReason,
      userFacingMessage:
        legacyManualLockReason ||
        buildDefaultUserFacingMessage("ADMINISTRATIVE_RESTRICTION", sub.accountType || "SCHOOL"),
      internalAdminNote: null,
      restrictedScope: sub.accountType === "SCHOOL" ? "INSTITUTION" : sub.accountType === "STUDENT_SELF_FUNDED_PROGRAMME" ? "PROGRAMME" : "ACCOUNT",
      cascadesToLinkedLearners: sub.accountType === "SCHOOL" || sub.accountType === "PARENT",
      appliedByUid: String(sub.manualLockedByUid || "admin"),
      appliedByName: String(sub.manualLockedByName || "Administrator"),
      appliedAt: legacyEffectiveIso,
      effectiveAt: legacyEffectiveIso,
      expiresAt: null,
      status: "ACTIVE",
      relatedSubscriptionId: sub.id || null,
    });
  }

  // Evaluate payment-cycle status independently of manual restrictions
  let paymentResult: EvaluatedSubscriptionResult = { ...baseEmpty };

  if (sub) {
    const rawStatus = String(sub.status || "").trim().toUpperCase();
    const billingResp = String(sub.billingResponsibility || "").trim().toUpperCase();
    const isManuallyUnlocked = sub.manuallyUnlocked === true && sub.manuallyLocked !== true;

    const overrideExpires = sub.override?.active ? parseDateSafe(sub.override.expiresAt) : null;
    const overrideStarts = sub.override?.active ? parseDateSafe(sub.override.startsAt) : null;
    const hasActiveOverride = Boolean(
      sub.override?.active &&
        overrideExpires &&
        overrideExpires.getTime() > now.getTime() &&
        (!overrideStarts || overrideStarts.getTime() <= now.getTime())
    );

    const configuredAmount = Math.max(0, Number(sub.amount || 0));
    const remainingBalance =
      sub.remainingBalance !== undefined && sub.remainingBalance !== null
        ? Math.max(0, Number(sub.remainingBalance))
        : configuredAmount;
    const dueDate = parseDateSafe(sub.nextDueAt || sub.currentPeriodEndAt);
    const graceDays =
      Number.isFinite(Number(sub.gracePeriodDays)) && Number(sub.gracePeriodDays) >= 0
        ? Math.floor(Number(sub.gracePeriodDays))
        : GRACE_PERIOD_DAYS;
    const graceEndsAt = dueDate ? parseDateSafe(sub.graceEndsAt) || computeLockdownAt(dueDate, graceDays) : null;
    const daysUntilDue = dueDate ? lagosCalendarDayDiff(dueDate, now) : null;
    const amountDue = remainingBalance > 0 ? remainingBalance : configuredAmount;

    if (
      sub.isComplimentary === true ||
      sub.exemption?.exempt === true ||
      rawStatus === "EXEMPT" ||
      billingResp === "EXEMPT" ||
      billingResp === "COMPLIMENTARY"
    ) {
      paymentResult = {
        ...baseEmpty,
        status: "EXEMPT",
        isExempt: true,
        isManuallyUnlocked,
      };
    } else if (rawStatus === "CANCELLED") {
      paymentResult = {
        ...baseEmpty,
        status: "CANCELLED",
        isLocked: false,
      };
    } else if (rawStatus === "SUSPENDED" && !hasExplicitManualRecord && sub.manuallyLocked !== true) {
      const lifted = hasActiveOverride || isManuallyUnlocked;
      paymentResult = {
        ...baseEmpty,
        status: lifted ? "ACTIVE" : "SUSPENDED",
        isLocked: !lifted,
        isManuallyLocked: !lifted,
        manualLockReason: !lifted ? legacyManualLockReason : null,
        restrictionType: !lifted ? "ADMINISTRATIVE_SUSPENSION" : null,
        lockReasonCode: !lifted ? "ADMINISTRATIVE_RESTRICTION" : null,
        lockReasonLabel: !lifted ? getLockReasonLabel("ADMINISTRATIVE_RESTRICTION", legacyManualLockReason) : null,
        userFacingMessage: !lifted ? legacyManualLockReason : null,
        hasNonPaymentRestriction: !lifted,
        isManuallyUnlocked,
        hasActiveOverride,
        overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
        amountDue,
        dueDateIso: dueDate ? dueDate.toISOString() : null,
        dueDateFormatted: formatLagosDate(dueDate),
      };
    } else if (configuredAmount <= 0 && remainingBalance <= 0) {
      paymentResult = {
        ...baseEmpty,
        status: "ACTIVE",
        isManuallyUnlocked,
        billingConfigIncomplete: Boolean(sub.billingConfigIncomplete),
      };
    } else if (!dueDate) {
      paymentResult = {
        ...baseEmpty,
        status: rawStatus === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "ACTIVE",
        isManuallyUnlocked,
        billingConfigIncomplete: true,
        amountDue,
        hasActiveOverride,
        overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
      };
    } else {
      const isPartiallyPaid =
        rawStatus === "PARTIALLY_PAID" ||
        (Number(sub.amountPaid || 0) > 0 && remainingBalance > 0 && remainingBalance < configuredAmount);
      const depositSatisfied = Boolean(
        sub.allowDepositAccess &&
          Number(sub.depositAmount || 0) > 0 &&
          Number(sub.amountPaid || 0) >= Number(sub.depositAmount || 0)
      );
      const pastGracePeriod = Boolean(graceEndsAt && now.getTime() > graceEndsAt.getTime());
      const isDueOrOverdue = now.getTime() >= dueDate.getTime() || (daysUntilDue !== null && daysUntilDue <= 0);
      const isPaidCurrent =
        !isDueOrOverdue &&
        (remainingBalance === 0 || depositSatisfied || rawStatus === "PAID" || rawStatus === "ACTIVE");

      if (pastGracePeriod) {
        if (hasActiveOverride || isManuallyUnlocked) {
          paymentResult = {
            ...baseEmpty,
            status: "ACTIVE",
            isLocked: false,
            isManuallyUnlocked,
            hasActiveOverride,
            overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
            amountDue,
            dueDateIso: dueDate.toISOString(),
            dueDateFormatted: formatLagosDate(dueDate),
            graceEndsAtIso: graceEndsAt ? graceEndsAt.toISOString() : null,
            graceEndsAtFormatted: formatLagosDate(graceEndsAt),
            daysUntilDue,
            graceDaysRemaining: 0,
          };
        } else {
          const autoReasonCode = getAutomaticPaymentReasonCode(sub.accountType);
          const autoEffectiveIso = parseDateSafe(sub.lockdownActivatedAt)?.toISOString() || (graceEndsAt ? graceEndsAt.toISOString() : now.toISOString());
          const autoPaymentRecord: AccountRestrictionRecord = {
            restrictionId: `auto_payment_${sub.id || "sub"}`,
            targetAccountId: String(sub.accountId || sub.id || ""),
            targetAccountType: (sub.accountType || "SCHOOL") as AccountRestrictionRecord["targetAccountType"],
            accountName: sub.accountName || null,
            schoolId: sub.schoolId || null,
            parentId: sub.parentId || null,
            studentId: sub.studentId || null,
            programmeEnrollmentId: sub.programmeEnrollmentId || null,
            affectedStudentIds: [],
            affectedProgrammeIds: sub.programmeId ? [String(sub.programmeId)] : [],
            restrictionType: "AUTOMATED_PAYMENT_LOCKDOWN",
            reasonCode: autoReasonCode,
            customReason: null,
            userFacingMessage: buildDefaultUserFacingMessage(autoReasonCode, sub.accountType || "SCHOOL"),
            internalAdminNote: null,
            restrictedScope: sub.accountType === "SCHOOL" ? "INSTITUTION" : sub.accountType === "STUDENT_SELF_FUNDED_PROGRAMME" ? "PROGRAMME" : "ACCOUNT",
            cascadesToLinkedLearners: sub.accountType === "SCHOOL" || sub.accountType === "PARENT",
            appliedByUid: "system_billing_guardrail",
            appliedByName: "Automated Billing Guardrail",
            appliedAt: autoEffectiveIso,
            effectiveAt: autoEffectiveIso,
            expiresAt: null,
            status: "ACTIVE",
            relatedSubscriptionId: sub.id || null,
          };
          paymentResult = {
            ...baseEmpty,
            status: "LOCKED",
            isLocked: true,
            restrictionType: "AUTOMATED_PAYMENT_LOCKDOWN",
            lockReasonCode: autoReasonCode,
            lockReasonLabel: getLockReasonLabel(autoReasonCode),
            userFacingMessage: autoPaymentRecord.userFacingMessage,
            effectiveAtIso: autoEffectiveIso,
            effectiveAtFormatted: formatLagosDate(autoEffectiveIso),
            hasPaymentRestriction: true,
            activeRestrictionRecords: [autoPaymentRecord],
            amountDue,
            dueDateIso: dueDate.toISOString(),
            dueDateFormatted: formatLagosDate(dueDate),
            graceEndsAtIso: graceEndsAt ? graceEndsAt.toISOString() : null,
            graceEndsAtFormatted: formatLagosDate(graceEndsAt),
            daysUntilDue,
            graceDaysRemaining: 0,
          };
        }
      } else if (isDueOrOverdue) {
        const graceDaysRemaining = graceEndsAt
          ? Math.max(0, Math.ceil((graceEndsAt.getTime() - now.getTime()) / MS_PER_DAY))
          : 0;
        paymentResult = {
          ...baseEmpty,
          status: "GRACE_PERIOD",
          isLocked: false,
          isManuallyUnlocked,
          inGracePeriod: true,
          hasActiveOverride,
          overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
          amountDue,
          dueDateIso: dueDate.toISOString(),
          dueDateFormatted: formatLagosDate(dueDate),
          graceEndsAtIso: graceEndsAt ? graceEndsAt.toISOString() : null,
          graceEndsAtFormatted: formatLagosDate(graceEndsAt),
          daysUntilDue,
          graceDaysRemaining,
        };
      } else if (daysUntilDue !== null && daysUntilDue > 0 && daysUntilDue <= PRE_DUE_REMINDER_DAYS) {
        paymentResult = {
          ...baseEmpty,
          status: isPartiallyPaid && !depositSatisfied ? "PARTIALLY_PAID" : "DUE_SOON",
          isLocked: false,
          isManuallyUnlocked,
          isDueSoon: true,
          hasActiveOverride,
          overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
          amountDue,
          dueDateIso: dueDate.toISOString(),
          dueDateFormatted: formatLagosDate(dueDate),
          graceEndsAtIso: graceEndsAt ? graceEndsAt.toISOString() : null,
          graceEndsAtFormatted: formatLagosDate(graceEndsAt),
          daysUntilDue,
          graceDaysRemaining: graceDays,
        };
      } else {
        paymentResult = {
          ...baseEmpty,
          status: isPartiallyPaid && !isPaidCurrent ? "PARTIALLY_PAID" : "ACTIVE",
          isLocked: false,
          isManuallyUnlocked,
          hasActiveOverride,
          overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
          amountDue: isPartiallyPaid ? remainingBalance : 0,
          dueDateIso: dueDate.toISOString(),
          dueDateFormatted: formatLagosDate(dueDate),
          graceEndsAtIso: graceEndsAt ? graceEndsAt.toISOString() : null,
          graceEndsAtFormatted: formatLagosDate(graceEndsAt),
          daysUntilDue,
          graceDaysRemaining: graceDays,
        };
      }
    }
  }

  // Merge independent explicit active restrictions with payment-cycle lockdown records
  if (explicitActiveRecords.length === 0) {
    return paymentResult;
  }

  const combinedRecords: AccountRestrictionRecord[] = [
    ...explicitActiveRecords,
    ...paymentResult.activeRestrictionRecords,
  ];

  // Deduplicate by restrictionId while preserving order (explicit manual restrictions first)
  const seenIds = new Set<string>();
  const uniqueRecords = combinedRecords.filter((r) => {
    if (seenIds.has(r.restrictionId)) return false;
    seenIds.add(r.restrictionId);
    return true;
  });

  const hasPaymentRestriction = uniqueRecords.some((r) => isPaymentRestrictionRecord(r));
  const hasNonPaymentRestriction = uniqueRecords.some((r) => !isPaymentRestrictionRecord(r));
  const manualRecords = uniqueRecords.filter((r) => r.restrictionType !== "AUTOMATED_PAYMENT_LOCKDOWN");
  const primaryRecord = manualRecords[0] || uniqueRecords[0];

  const primaryEffective = parseDateSafe(primaryRecord.effectiveAt);
  const primaryExpiry = parseDateSafe(primaryRecord.expiresAt);
  const isSuspendedType = primaryRecord.restrictionType === "ADMINISTRATIVE_SUSPENSION";

  return {
    ...paymentResult,
    status: isSuspendedType ? "SUSPENDED" : "LOCKED",
    isLocked: true,
    isManuallyLocked: manualRecords.length > 0,
    manualLockReason: primaryRecord.userFacingMessage || legacyManualLockReason,
    isManuallyUnlocked: false,
    restrictionType: primaryRecord.restrictionType,
    lockReasonCode: primaryRecord.reasonCode,
    lockReasonLabel: getLockReasonLabel(primaryRecord.reasonCode, primaryRecord.customReason),
    userFacingMessage: primaryRecord.userFacingMessage,
    effectiveAtIso: primaryEffective ? primaryEffective.toISOString() : null,
    effectiveAtFormatted: formatLagosDate(primaryEffective),
    expiresAtIso: primaryExpiry ? primaryExpiry.toISOString() : null,
    expiresAtFormatted: formatLagosDate(primaryExpiry),
    hasPaymentRestriction,
    hasNonPaymentRestriction,
    activeRestrictionRecords: uniqueRecords,
  };
}

export interface RenewedPeriodCalculation {
  periodStartAt: Date;
  periodEndAt: Date;
  nextDueAt: Date;
  graceEndsAt: Date;
  durationWeeks: number;
  renewalMode: "EARLY_EXTENSION" | "GRACE_EXTENSION" | "POST_GRACE_FRESH" | "ADMIN_OVERRIDE_DATE";
}

/**
 * Calculates the next subscription period following Part 5.2 rules:
 * - Early renewal (paidAt <= currentPeriodEndAt): extends from existing currentPeriodEndAt.
 * - Grace renewal (currentPeriodEndAt < paidAt <= graceEndsAt): extends from existing currentPeriodEndAt
 *   so the existing subscription timeline is preserved without losing days.
 * - Post-grace renewal (paidAt > graceEndsAt or no prior period): starts from verified paidAt
 *   (unless an administrator explicitly supplies overrideEffectiveStartAt).
 */
export function calculateRenewedPeriod(input: {
  currentPeriodEndAt?: Date | string | number | null;
  graceEndsAt?: Date | string | number | null;
  gracePeriodDays?: number;
  paidAt: Date | string | number;
  durationWeeks: number;
  overrideEffectiveStartAt?: Date | string | number | null;
}): RenewedPeriodCalculation {
  const paidAt = parseDateSafe(input.paidAt) || new Date();
  const durationWeeks = Math.max(1, Math.round(Number(input.durationWeeks || 4)));
  const graceDays =
    Number.isFinite(Number(input.gracePeriodDays)) && Number(input.gracePeriodDays) >= 0
      ? Math.floor(Number(input.gracePeriodDays))
      : GRACE_PERIOD_DAYS;
  const durationMs = durationWeeks * 7 * MS_PER_DAY;

  const overrideStart = parseDateSafe(input.overrideEffectiveStartAt);
  if (overrideStart) {
    const periodEndAt = new Date(overrideStart.getTime() + durationMs);
    return {
      periodStartAt: overrideStart,
      periodEndAt,
      nextDueAt: periodEndAt,
      graceEndsAt: computeLockdownAt(periodEndAt, graceDays),
      durationWeeks,
      renewalMode: "ADMIN_OVERRIDE_DATE",
    };
  }

  const existingEnd = parseDateSafe(input.currentPeriodEndAt);
  if (existingEnd) {
    const existingGraceEnd = parseDateSafe(input.graceEndsAt) || computeLockdownAt(existingEnd, graceDays);

    // 1. Early renewal: paid on or before existing paid-through date
    if (paidAt.getTime() <= existingEnd.getTime()) {
      const periodEndAt = new Date(existingEnd.getTime() + durationMs);
      return {
        periodStartAt: existingEnd,
        periodEndAt,
        nextDueAt: periodEndAt,
        graceEndsAt: computeLockdownAt(periodEndAt, graceDays),
        durationWeeks,
        renewalMode: "EARLY_EXTENSION",
      };
    }

    // 2. Grace-period renewal: paid within the 7-day grace window
    if (paidAt.getTime() <= existingGraceEnd.getTime()) {
      const periodEndAt = new Date(existingEnd.getTime() + durationMs);
      return {
        periodStartAt: existingEnd,
        periodEndAt,
        nextDueAt: periodEndAt,
        graceEndsAt: computeLockdownAt(periodEndAt, graceDays),
        durationWeeks,
        renewalMode: "GRACE_EXTENSION",
      };
    }
  }

  // 3. Post-grace (fully expired/locked) or first payment: start fresh from verified payment date
  const periodEndAt = new Date(paidAt.getTime() + durationMs);
  return {
    periodStartAt: paidAt,
    periodEndAt,
    nextDueAt: periodEndAt,
    graceEndsAt: computeLockdownAt(periodEndAt, graceDays),
    durationWeeks,
    renewalMode: "POST_GRACE_FRESH",
  };
}

/**
 * Returns role-aware, reason-aware lockdown copy & next-action metadata.
 * Strictly separates payment-related restrictions (`canPay: true` for responsible payers)
 * from non-payment administrative/review restrictions (`canPay: false` — directs to Support Desk).
 * Never exposes institutional or parental billing/admin details to dependent learners.
 */
export function buildRoleLockdownCopy(params: {
  role: PortalRoleKey;
  studentFundingCategory?: StudentFundingCategory;
  isManuallyLocked?: boolean;
  manualLockReason?: string | null;
  restrictionType?: RestrictionType | null;
  lockReasonCode?: LockReasonCode | null;
  lockReasonLabel?: string | null;
  userFacingMessage?: string | null;
  hasPaymentRestriction?: boolean;
  hasNonPaymentRestriction?: boolean;
}): {
  headline: string;
  bannerText: string;
  message: string;
  restrictedClickMessage: string;
  canPay: boolean;
  payNowPath: string | null;
  nextActionType: PortalNextActionType;
} {
  const configuredMessage = String(params.userFacingMessage || params.manualLockReason || "").trim();
  const isPaymentRelated =
    params.hasPaymentRestriction !== undefined
      ? params.hasPaymentRestriction
      : params.lockReasonCode
      ? isPaymentReasonCode(params.lockReasonCode)
      : !params.isManuallyLocked;

  if (params.role === "school") {
    if (isPaymentRelated) {
      const msg =
        configuredMessage && params.isManuallyLocked
          ? configuredMessage
          : "Your school portal access has been temporarily restricted. Reason: Your institutional subscription payment is overdue. Please open your Billing Center to review the outstanding payment and renew your subscription, or contact Jaystarbliss Studios Support for assistance.";
      return {
        headline: "PORTAL ACCESS RESTRICTED",
        bannerText: "PORTAL ACCESS RESTRICTED — INSTITUTIONAL SUBSCRIPTION OVERDUE",
        message: msg,
        restrictedClickMessage: msg,
        canPay: true,
        payNowPath: "/portal/school/payments",
        nextActionType: "PAY_NOW",
      };
    }

    const msg =
      configuredMessage ||
      "Your school portal access has been temporarily restricted by administration. Please contact Jaystarbliss Studios Support for further information and assistance.";
    return {
      headline: "PORTAL ACCESS RESTRICTED",
      bannerText: `PORTAL ACCESS RESTRICTED — ${(params.lockReasonLabel || "ADMINISTRATIVE RESTRICTION").toUpperCase()}`,
      message: msg,
      restrictedClickMessage: msg,
      canPay: false,
      payNowPath: null,
      nextActionType: "CONTACT_SUPPORT",
    };
  }

  if (params.role === "parent") {
    if (isPaymentRelated) {
      const msg =
        configuredMessage && params.isManuallyLocked
          ? configuredMessage
          : "Payment for your child's current programme is overdue. Please review the outstanding fee in your Billing Center to restore learning access.";
      return {
        headline: "YOUR PARENT PORTAL HAS RESTRICTED ACCESS",
        bannerText: "YOUR PARENT PORTAL HAS RESTRICTED ACCESS — PAYMENT OVERDUE",
        message: msg,
        restrictedClickMessage: msg,
        canPay: true,
        payNowPath: "/portal/parent/payments",
        nextActionType: "PAY_NOW",
      };
    }

    const msg =
      configuredMessage ||
      "Your parent portal access has been temporarily restricted by administration. Please contact Jaystarbliss Studios Support for assistance.";
    return {
      headline: "YOUR PARENT PORTAL HAS RESTRICTED ACCESS",
      bannerText: `YOUR PARENT PORTAL HAS RESTRICTED ACCESS — ${(params.lockReasonLabel || "ADMINISTRATIVE RESTRICTION").toUpperCase()}`,
      message: msg,
      restrictedClickMessage: msg,
      canPay: false,
      payNowPath: null,
      nextActionType: "CONTACT_SUPPORT",
    };
  }

  if (params.role === "student") {
    // School-funded student: NEVER show institutional Pay Now or private billing/admin notes
    if (params.studentFundingCategory === "SCHOOL_FUNDED") {
      const msg =
        "Your school portal access has been temporarily restricted. Please contact your school administrator for further information.";
      return {
        headline: "YOUR SCHOOL PORTAL IS CURRENTLY UNAVAILABLE",
        bannerText: "YOUR SCHOOL PORTAL IS CURRENTLY UNAVAILABLE",
        message: msg,
        restrictedClickMessage: msg,
        canPay: false,
        payNowPath: null,
        nextActionType: "CONTACT_SCHOOL",
      };
    }

    // Parent-funded student: NEVER expose private parental billing or internal notes
    if (params.studentFundingCategory === "PARENT_FUNDED") {
      const msg =
        "Please contact your parent or guardian for more information about your current programme access.";
      return {
        headline: "YOUR LEARNING ACCESS IS TEMPORARILY RESTRICTED",
        bannerText: "YOUR LEARNING ACCESS IS TEMPORARILY RESTRICTED",
        message: msg,
        restrictedClickMessage: msg,
        canPay: false,
        payNowPath: null,
        nextActionType: "CONTACT_PARENT",
      };
    }

    // Individually enrolled student
    if (isPaymentRelated) {
      const msg =
        configuredMessage && params.isManuallyLocked
          ? configuredMessage
          : "Your programme subscription is overdue. Please visit your Billing Center to complete your renewal.";
      return {
        headline: "YOUR LEARNING PORTAL IS CURRENTLY RESTRICTED",
        bannerText: "YOUR LEARNING PORTAL IS CURRENTLY RESTRICTED — SUBSCRIPTION OVERDUE",
        message: msg,
        restrictedClickMessage: msg,
        canPay: true,
        payNowPath: "/portal/student/payments",
        nextActionType: "PAY_NOW",
      };
    }

    const msg =
      configuredMessage ||
      "Your learning portal access has been temporarily restricted by administration. Please contact Jaystarbliss Studios Support for assistance.";
    return {
      headline: "YOUR LEARNING PORTAL IS CURRENTLY RESTRICTED",
      bannerText: `YOUR LEARNING PORTAL IS CURRENTLY RESTRICTED — ${(params.lockReasonLabel || "ADMINISTRATIVE RESTRICTION").toUpperCase()}`,
      message: msg,
      restrictedClickMessage: msg,
      canPay: false,
      payNowPath: null,
      nextActionType: "CONTACT_SUPPORT",
    };
  }

  return {
    headline: "",
    bannerText: "",
    message: "",
    restrictedClickMessage: "",
    canPay: false,
    payNowPath: null,
    nextActionType: "NONE",
  };
}

/**
 * Determines which portal routes remain accessible during lockdown for each role.
 * Everything not explicitly permitted is locked at both nav and direct URL levels.
 */
export function isPortalRouteAllowedDuringLockdown(pathname: string, entitlement: PortalEntitlementResult): boolean {
  if (!entitlement.isLocked) return true;
  if (entitlement.role === "admin" || entitlement.role === "staff") return true;

  const clean = pathname.replace(/\/+$/, "").toLowerCase();

  if (entitlement.role === "school") {
    return (
      clean === "/portal/school" ||
      clean === "/portal/school/payments" ||
      clean === "/portal/school/support" ||
      clean === "/portal/school/settings" ||
      clean === "/portal/school/partnership"
    );
  }

  if (entitlement.role === "parent") {
    return (
      clean === "/portal/parent" ||
      clean === "/portal/parent/payments" ||
      clean === "/portal/parent/support" ||
      clean === "/portal/parent/settings"
    );
  }

  if (entitlement.role === "student") {
    if (entitlement.studentFundingCategory === "INDIVIDUAL_SELF_FUNDED") {
      return (
        clean === "/portal/student" ||
        clean === "/portal/student/payments" ||
        clean === "/portal/student/support" ||
        clean === "/portal/student/settings"
      );
    }
    // School-funded or parent-funded students: no Pay Now for school/parent fees
    return (
      clean === "/portal/student" ||
      clean === "/portal/student/support" ||
      clean === "/portal/student/settings"
    );
  }

  return false;
}

/**
 * Deterministic reminder document ID so duplicate reminders are impossible
 * for the same subscription, billing cycle due date, and reminder stage.
 */
export function buildReminderDocumentId(params: {
  subscriptionId: string;
  dueDateIso: string;
  reminderType: "PRE_DUE_7D" | "DUE_TODAY" | "LOCKDOWN_ACTIVATED";
}): string {
  const safeSubId = String(params.subscriptionId || "sub").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const dueKey = getLagosDateKey(params.dueDateIso);
  return `${safeSubId}__${dueKey}__${params.reminderType}`;
}

/**
 * Determines which reminder stage (if any) applies for a subscription on the given reference date
 * using Africa/Lagos calendar date boundaries.
 */
export function resolveScheduledReminderStage(input: {
  subscription: Partial<BillingSubscriptionRecord>;
  now?: Date;
}): "PRE_DUE_7D" | "DUE_TODAY" | "LOCKDOWN_ACTIVATED" | null {
  const now = input.now || new Date();
  const evalResult = evaluateSubscriptionState({ subscription: input.subscription, now });

  if (evalResult.isExempt || evalResult.status === "CANCELLED" || evalResult.billingConfigIncomplete) {
    return null;
  }
  if (!evalResult.dueDateIso || evalResult.amountDue <= 0) {
    return null;
  }

  // If currently locked (past 7-day grace), trigger LOCKDOWN_ACTIVATED (idempotent per cycle)
  if (evalResult.status === "LOCKED" && evalResult.isLocked) {
    return "LOCKDOWN_ACTIVATED";
  }

  const daysUntilDue = evalResult.daysUntilDue;
  if (daysUntilDue === null) return null;

  // Due today (or missed exact day 0 execution while still in day 0..1)
  if (daysUntilDue === 0) {
    return "DUE_TODAY";
  }

  // Seven days before due date (also catch 6..7 in case a scheduled run slipped by a few hours, idempotency prevents duplicates)
  if (daysUntilDue === PRE_DUE_REMINDER_DAYS) {
    return "PRE_DUE_7D";
  }

  return null;
}
