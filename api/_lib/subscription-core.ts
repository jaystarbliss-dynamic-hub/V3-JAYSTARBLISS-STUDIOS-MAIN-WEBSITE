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

export const BUSINESS_TIMEZONE = "Africa/Lagos";
export const GRACE_PERIOD_DAYS = 7;
export const PRE_DUE_REMINDER_DAYS = 7;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SubscriptionAccountType =
  | "SCHOOL"
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
}

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
 * Authoritative state evaluator for any single subscription record.
 *
 * Critical safeguards:
 * 1. Explicit EXEMPT / complimentary accounts NEVER auto-lock.
 * 2. Accounts with no configured payment obligation (`amount <= 0` and no remainingBalance)
 *    or missing due date NEVER auto-lock; instead they return ACTIVE with `billingConfigIncomplete` where relevant.
 * 3. Active time-limited admin override lifts lockdown until `override.expiresAt`.
 * 4. Explicit SUSPENDED locks immediately until admin restores.
 * 5. Exact 7-day grace window: `now > lockdownAt` => LOCKED.
 */
export function evaluateSubscriptionState(input: {
  subscription: Partial<BillingSubscriptionRecord> | null | undefined;
  now?: Date;
}): EvaluatedSubscriptionResult {
  const now = input.now || new Date();
  const sub = input.subscription;

  const baseEmpty: EvaluatedSubscriptionResult = {
    status: "ACTIVE",
    isLocked: false,
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

  if (!sub) {
    return baseEmpty;
  }

  const rawStatus = String(sub.status || "").trim().toUpperCase();
  const billingResp = String(sub.billingResponsibility || "").trim().toUpperCase();

  // 1. Exempt or complimentary accounts NEVER auto-lock
  if (
    sub.isComplimentary === true ||
    sub.exemption?.exempt === true ||
    rawStatus === "EXEMPT" ||
    billingResp === "EXEMPT" ||
    billingResp === "COMPLIMENTARY"
  ) {
    return {
      ...baseEmpty,
      status: "EXEMPT",
      isExempt: true,
    };
  }

  // 2. Cancelled subscription
  if (rawStatus === "CANCELLED") {
    return {
      ...baseEmpty,
      status: "CANCELLED",
      isLocked: false,
    };
  }

  // 3. Time-limited administrative override check
  const overrideExpires = sub.override?.active ? parseDateSafe(sub.override.expiresAt) : null;
  const overrideStarts = sub.override?.active ? parseDateSafe(sub.override.startsAt) : null;
  const hasActiveOverride = Boolean(
    sub.override?.active &&
      overrideExpires &&
      overrideExpires.getTime() > now.getTime() &&
      (!overrideStarts || overrideStarts.getTime() <= now.getTime())
  );

  // 4. Admin explicit SUSPENDED (unless overridden)
  if (rawStatus === "SUSPENDED") {
    const dueDate = parseDateSafe(sub.nextDueAt || sub.currentPeriodEndAt);
    const amountDue = Math.max(0, Number(sub.remainingBalance ?? sub.amount ?? 0));
    return {
      ...baseEmpty,
      status: hasActiveOverride ? "ACTIVE" : "SUSPENDED",
      isLocked: !hasActiveOverride,
      hasActiveOverride,
      overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
      amountDue,
      dueDateIso: dueDate ? dueDate.toISOString() : null,
      dueDateFormatted: formatLagosDate(dueDate),
    };
  }

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

  // 5. No configured financial obligation -> never auto-lock
  if (configuredAmount <= 0 && remainingBalance <= 0) {
    return {
      ...baseEmpty,
      status: "ACTIVE",
      billingConfigIncomplete: Boolean(sub.billingConfigIncomplete),
    };
  }

  // 6. Missing due date -> flag incomplete billing config, do NOT auto-lock
  if (!dueDate) {
    return {
      ...baseEmpty,
      status: rawStatus === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "ACTIVE",
      billingConfigIncomplete: true,
      amountDue: remainingBalance > 0 ? remainingBalance : configuredAmount,
      hasActiveOverride,
      overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
    };
  }

  const graceEndsAt = parseDateSafe(sub.graceEndsAt) || computeLockdownAt(dueDate, graceDays);
  const daysUntilDue = lagosCalendarDayDiff(dueDate, now);
  const isPartiallyPaid =
    rawStatus === "PARTIALLY_PAID" ||
    (Number(sub.amountPaid || 0) > 0 && remainingBalance > 0 && remainingBalance < configuredAmount);

  // Check if deposit policy allows access while partially paid before due date
  const depositSatisfied = Boolean(
    sub.allowDepositAccess &&
      Number(sub.depositAmount || 0) > 0 &&
      Number(sub.amountPaid || 0) >= Number(sub.depositAmount || 0)
  );

  // If current timestamp is past lockdownAt (end of 7-day grace period)
  const pastGracePeriod = now.getTime() > graceEndsAt.getTime();
  const isDueOrOverdue = now.getTime() >= dueDate.getTime() || daysUntilDue <= 0;

  // Determine payable amount due for renewal or outstanding balance
  const amountDue = remainingBalance > 0 ? remainingBalance : configuredAmount;

  // If paid through a future date and no remaining unpaid obligation
  const isPaidCurrent =
    !isDueOrOverdue &&
    (remainingBalance === 0 || depositSatisfied || rawStatus === "PAID" || rawStatus === "ACTIVE");

  if (pastGracePeriod) {
    if (hasActiveOverride) {
      return {
        status: "ACTIVE",
        isLocked: false,
        inGracePeriod: false,
        isDueSoon: false,
        isExempt: false,
        hasActiveOverride: true,
        overrideExpiresAt: overrideExpires!.toISOString(),
        billingConfigIncomplete: false,
        amountDue,
        dueDateIso: dueDate.toISOString(),
        dueDateFormatted: formatLagosDate(dueDate),
        graceEndsAtIso: graceEndsAt.toISOString(),
        graceEndsAtFormatted: formatLagosDate(graceEndsAt),
        daysUntilDue,
        graceDaysRemaining: 0,
      };
    }

    return {
      status: "LOCKED",
      isLocked: true,
      inGracePeriod: false,
      isDueSoon: false,
      isExempt: false,
      hasActiveOverride: false,
      overrideExpiresAt: null,
      billingConfigIncomplete: false,
      amountDue,
      dueDateIso: dueDate.toISOString(),
      dueDateFormatted: formatLagosDate(dueDate),
      graceEndsAtIso: graceEndsAt.toISOString(),
      graceEndsAtFormatted: formatLagosDate(graceEndsAt),
      daysUntilDue,
      graceDaysRemaining: 0,
    };
  }

  if (isDueOrOverdue) {
    const graceDaysRemaining = Math.max(
      0,
      Math.ceil((graceEndsAt.getTime() - now.getTime()) / MS_PER_DAY)
    );
    return {
      status: "GRACE_PERIOD",
      isLocked: false,
      inGracePeriod: true,
      isDueSoon: false,
      isExempt: false,
      hasActiveOverride,
      overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
      billingConfigIncomplete: false,
      amountDue,
      dueDateIso: dueDate.toISOString(),
      dueDateFormatted: formatLagosDate(dueDate),
      graceEndsAtIso: graceEndsAt.toISOString(),
      graceEndsAtFormatted: formatLagosDate(graceEndsAt),
      daysUntilDue,
      graceDaysRemaining,
    };
  }

  // Due within 7 days (1..7 days before due date)
  if (daysUntilDue > 0 && daysUntilDue <= PRE_DUE_REMINDER_DAYS) {
    return {
      status: isPartiallyPaid && !depositSatisfied ? "PARTIALLY_PAID" : "DUE_SOON",
      isLocked: false,
      inGracePeriod: false,
      isDueSoon: true,
      isExempt: false,
      hasActiveOverride,
      overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
      billingConfigIncomplete: false,
      amountDue,
      dueDateIso: dueDate.toISOString(),
      dueDateFormatted: formatLagosDate(dueDate),
      graceEndsAtIso: graceEndsAt.toISOString(),
      graceEndsAtFormatted: formatLagosDate(graceEndsAt),
      daysUntilDue,
      graceDaysRemaining: graceDays,
    };
  }

  return {
    status: isPartiallyPaid && !isPaidCurrent ? "PARTIALLY_PAID" : "ACTIVE",
    isLocked: false,
    inGracePeriod: false,
    isDueSoon: false,
    isExempt: false,
    hasActiveOverride,
    overrideExpiresAt: hasActiveOverride && overrideExpires ? overrideExpires.toISOString() : null,
    billingConfigIncomplete: false,
    amountDue: isPartiallyPaid ? remainingBalance : 0,
    dueDateIso: dueDate.toISOString(),
    dueDateFormatted: formatLagosDate(dueDate),
    graceEndsAtIso: graceEndsAt.toISOString(),
    graceEndsAtFormatted: formatLagosDate(graceEndsAt),
    daysUntilDue,
    graceDaysRemaining: graceDays,
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
 * Returns the exact role-specific lockdown copy specified in Part 2.1 - 2.4.
 */
export function buildRoleLockdownCopy(params: {
  role: PortalRoleKey;
  studentFundingCategory?: StudentFundingCategory;
}): {
  headline: string;
  bannerText: string;
  message: string;
  restrictedClickMessage: string;
  canPay: boolean;
  payNowPath: string | null;
} {
  if (params.role === "school") {
    return {
      headline: "PORTAL CURRENTLY ON LOCKDOWN — PAYMENT OVERDUE.",
      bannerText: "PORTAL CURRENTLY ON LOCKDOWN — PAYMENT OVERDUE.",
      message:
        "Your school portal is currently on lockdown because the institutional subscription has not been renewed. Please complete your outstanding payment to restore access.",
      restrictedClickMessage:
        "Your school portal is currently on lockdown because the institutional subscription has not been renewed. Please complete your outstanding payment to restore access.",
      canPay: true,
      payNowPath: "/portal/school/payments",
    };
  }

  if (params.role === "parent") {
    return {
      headline: "YOUR CHILD'S LEARNING ACCESS IS CURRENTLY ON LOCKDOWN",
      bannerText: "YOUR CHILD'S LEARNING ACCESS IS CURRENTLY ON LOCKDOWN",
      message:
        "Payment for your child's current programme is overdue. Please complete the outstanding payment to restore learning access.",
      restrictedClickMessage:
        "Payment for your child's current programme is overdue. Please complete the outstanding payment to restore learning access.",
      canPay: true,
      payNowPath: "/portal/parent/payments",
    };
  }

  if (params.role === "student") {
    if (params.studentFundingCategory === "SCHOOL_FUNDED") {
      return {
        headline: "YOUR SCHOOL PORTAL IS CURRENTLY ON LOCKDOWN",
        bannerText: "YOUR SCHOOL PORTAL IS CURRENTLY ON LOCKDOWN",
        message:
          "Your school's institutional subscription has not been renewed. Please contact your school administrator for further information.",
        restrictedClickMessage:
          "Your school's institutional subscription has not been renewed. Please contact your school administrator for further information.",
        canPay: false,
        payNowPath: null,
      };
    }

    if (params.studentFundingCategory === "PARENT_FUNDED") {
      return {
        headline: "YOUR LEARNING PORTAL IS CURRENTLY ON LOCKDOWN",
        bannerText: "YOUR LEARNING PORTAL IS CURRENTLY ON LOCKDOWN",
        message:
          "Your learning access is temporarily unavailable because the payment for your programme has not been renewed. Please contact your parent or guardian for more information.",
        restrictedClickMessage:
          "Your learning access is temporarily unavailable because the payment for your programme has not been renewed. Please contact your parent or guardian for more information.",
        canPay: false,
        payNowPath: null,
      };
    }

    // Individually enrolled student
    return {
      headline: "YOUR LEARNING PORTAL IS CURRENTLY ON LOCKDOWN",
      bannerText: "YOUR LEARNING PORTAL IS CURRENTLY ON LOCKDOWN",
      message:
        "Your current programme subscription has expired and has not been renewed. Please complete your payment to continue learning.",
      restrictedClickMessage:
        "Your current programme subscription has expired and has not been renewed. Please complete your payment to continue learning.",
      canPay: true,
      payNowPath: "/portal/student/payments",
    };
  }

  return {
    headline: "",
    bannerText: "",
    message: "",
    restrictedClickMessage: "",
    canPay: false,
    payNowPath: null,
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
