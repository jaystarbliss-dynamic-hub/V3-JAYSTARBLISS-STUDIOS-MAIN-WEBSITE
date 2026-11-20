/**
 * Pure Manual Payment Recording Engine (Part 6)
 *
 * Computes full/partial balances, distinct MANUAL_ADMIN / ADMIN_VERIFIED payment records,
 * and subscription renewal transitions using calculateRenewedPeriod (never mimicking Paystack).
 */

import {
  calculateRenewedPeriod,
  computeLockdownAt,
  parseDateSafe,
  resolvePlanDurationWeeks,
  type BillingResponsibility,
  type SubscriptionAccountType,
  type SubscriptionState,
} from "./subscription-core.ts";

export type ManualPaymentTargetType =
  | "SCHOOL"
  | "PARENT"
  | "INDIVIDUAL_STUDENT"
  | "PROGRAMME_ENROLLMENT";

export type ManualPaymentMethod =
  | "bank_transfer"
  | "cash"
  | "pos"
  | "cheque"
  | "other";

export const ALLOWED_MANUAL_PAYMENT_METHODS: readonly ManualPaymentMethod[] = [
  "bank_transfer",
  "cash",
  "pos",
  "cheque",
  "other",
];

export interface ManualPaymentInput {
  targetType: ManualPaymentTargetType;
  targetId: string;
  accountName: string;
  recipientEmail?: string | null;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  programmeEnrollmentId?: string | null;
  programmeId?: string | null;
  programmeName?: string | null;
  planId?: string | null;
  planName?: string | null;
  feeItemId?: string | null;
  billingCycleId?: string | null;
  subscriptionId: string;
  billingResponsibility: BillingResponsibility;
  accountType: SubscriptionAccountType;
  amount: number;
  contractAmount: number;
  priorAmountPaid: number;
  allowDepositAccess?: boolean;
  depositAmount?: number;
  currency?: string;
  paymentMethod: string;
  paymentDate: Date | string;
  reference: string;
  notes?: string;
  proofUrl?: string | null;
  cycle?: string;
  durationWeeks?: number;
  existingPeriodEndAt?: Date | string | null;
  existingGraceEndsAt?: Date | string | null;
  overrideEffectiveStartAt?: Date | string | null;
  verifiedByUid: string;
  verifiedByName: string;
  verifiedByEmail?: string | null;
}

export interface ManualPaymentComputationResult {
  paymentRecord: Record<string, any>;
  subscriptionPatch: {
    status: SubscriptionState;
    amount: number;
    amountPaid: number;
    remainingBalance: number;
    durationWeeks: number;
    currentPeriodStartAt: string | null;
    currentPeriodEndAt: string | null;
    nextDueAt: string | null;
    graceEndsAt: string | null;
    lastSuccessfulPaymentAt: string;
    lastPaymentReference: string;
  };
  accessUnlocked: boolean;
  isPartial: boolean;
  remainingBalance: number;
  cumulativePaid: number;
  duplicateFingerprint: string;
}

export function normalizeManualPaymentMethod(raw: unknown): ManualPaymentMethod {
  const norm = String(raw || "bank_transfer").trim().toLowerCase().replace(/\s+/g, "_");
  if (ALLOWED_MANUAL_PAYMENT_METHODS.includes(norm as ManualPaymentMethod)) {
    return norm as ManualPaymentMethod;
  }
  return "other";
}

export function buildManualDuplicateFingerprint(params: {
  subscriptionId: string;
  amount: number;
  paymentDate: Date | string;
  reference: string;
}): string {
  const dateObj = parseDateSafe(params.paymentDate) || new Date();
  const dayKey = dateObj.toISOString().slice(0, 10);
  const normRef = String(params.reference || "").trim().toLowerCase();
  return `${params.subscriptionId}|${Math.round(Number(params.amount || 0) * 100)}|${dayKey}|${normRef}`;
}

export function computeManualPaymentRecordAndTransition(
  input: ManualPaymentInput
): ManualPaymentComputationResult {
  const payAmount = Number(Number(input.amount || 0).toFixed(2));
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error("INVALID_MANUAL_PAYMENT_AMOUNT");
  }
  const reference = String(input.reference || "").trim();
  if (!reference) {
    throw new Error("MANUAL_PAYMENT_REFERENCE_REQUIRED");
  }
  const paidAt = parseDateSafe(input.paymentDate) || new Date();
  const verifiedAt = new Date();
  const method = normalizeManualPaymentMethod(input.paymentMethod);

  const contractAmount = Math.max(
    payAmount,
    Number(Number(input.contractAmount || 0).toFixed(2))
  );
  const priorPaid = Math.max(0, Number(Number(input.priorAmountPaid || 0).toFixed(2)));
  const cumulativePaid = Number((priorPaid + payAmount).toFixed(2));
  const remainingBalance = Number(Math.max(0, contractAmount - cumulativePaid).toFixed(2));
  const isPartial = remainingBalance > 0;

  const depositSatisfied = Boolean(
    input.allowDepositAccess &&
      Number(input.depositAmount || 0) > 0 &&
      cumulativePaid >= Number(input.depositAmount || 0)
  );
  const accessUnlocked = !isPartial || depositSatisfied;

  const durationWeeks = resolvePlanDurationWeeks({
    durationWeeks: input.durationWeeks,
    cycle: input.cycle,
    fallbackWeeks: 4,
  });

  // Only advance the subscription period when full obligation is settled (or deposit-access unlocks a fresh cycle)
  const renewed = accessUnlocked
    ? calculateRenewedPeriod({
        currentPeriodEndAt: input.existingPeriodEndAt || null,
        graceEndsAt: input.existingGraceEndsAt || null,
        paidAt,
        durationWeeks,
        overrideEffectiveStartAt: input.overrideEffectiveStartAt || null,
      })
    : null;

  const existingDue = parseDateSafe(input.existingPeriodEndAt);
  const nextDueAtIso = renewed
    ? renewed.nextDueAt.toISOString()
    : existingDue
    ? existingDue.toISOString()
    : null;
  const periodStartIso = renewed ? renewed.periodStartAt.toISOString() : null;
  const periodEndIso = renewed
    ? renewed.periodEndAt.toISOString()
    : existingDue
    ? existingDue.toISOString()
    : null;
  const graceEndsIso = renewed
    ? renewed.graceEndsAt.toISOString()
    : existingDue
    ? computeLockdownAt(existingDue).toISOString()
    : null;

  const subscriptionStatus: SubscriptionState = isPartial
    ? depositSatisfied
      ? "ACTIVE"
      : "PARTIALLY_PAID"
    : "ACTIVE";

  const paymentStatus = isPartial ? "PARTIALLY_PAID" : "PAID";
  const duplicateFingerprint = buildManualDuplicateFingerprint({
    subscriptionId: input.subscriptionId,
    amount: payAmount,
    paymentDate: paidAt,
    reference,
  });

  const billingCycleId =
    String(input.billingCycleId || "").trim() ||
    `${input.subscriptionId}_${(nextDueAtIso || paidAt.toISOString()).slice(0, 10)}`;

  // Distinct manual payment record — NEVER sets checkoutProvider: "paystack" or providerTransactionId
  const paymentRecord: Record<string, any> = {
    id: reference,
    reference,
    paymentSource: "MANUAL_ADMIN",
    verificationStatus: "ADMIN_VERIFIED",
    verifiedBy: input.verifiedByUid,
    verifiedByName: input.verifiedByName,
    verifiedByEmail: input.verifiedByEmail || null,
    verifiedAt: verifiedAt.toISOString(),
    recordedOffline: true,
    checkoutProvider: "manual_admin",
    subscriptionId: input.subscriptionId,
    feeItemId: input.feeItemId || null,
    billingCycleId,
    targetType: input.targetType,
    accountType: input.accountType,
    billingResponsibility: input.billingResponsibility,
    userId: input.parentId || input.studentId || input.targetId,
    schoolId: input.targetType === "SCHOOL" ? input.schoolId || input.targetId : null,
    parentId: input.targetType === "PARENT" ? input.parentId || input.targetId : null,
    studentId: input.studentId || null,
    studentName: input.studentName || input.accountName,
    programmeEnrollmentId: input.programmeEnrollmentId || null,
    programId: input.programmeId || null,
    programTitle: input.programmeName || input.planName || null,
    planId: input.planId || `manual_${input.targetType.toLowerCase()}`,
    plan: `${input.planName || input.programmeName || "Subscription Renewal"}${isPartial ? " (Partial)" : ""}`,
    email: input.recipientEmail || "",
    currency: input.currency || "NGN",
    baseAmount: payAmount,
    amount: payAmount,
    customerTotal: payAmount,
    amountInNaira: true,
    transactionFee: 0,
    fullContractAmount: contractAmount,
    cumulativeAmountPaid: cumulativePaid,
    remainingBalance,
    status: paymentStatus,
    paymentStatus,
    paymentMethod: method,
    durationWeeks,
    renewalMode: renewed?.renewalMode || null,
    paidAt: paidAt.toISOString(),
    paidThrough: periodEndIso,
    nextDueDate: nextDueAtIso,
    notes: String(input.notes || "").trim(),
    proofUrl: input.proofUrl ? String(input.proofUrl).trim() : null,
    duplicateFingerprint,
    createdAt: verifiedAt.toISOString(),
  };

  return {
    paymentRecord,
    subscriptionPatch: {
      status: subscriptionStatus,
      amount: contractAmount,
      amountPaid: isPartial ? cumulativePaid : contractAmount,
      remainingBalance,
      durationWeeks,
      currentPeriodStartAt: periodStartIso,
      currentPeriodEndAt: periodEndIso,
      nextDueAt: nextDueAtIso,
      graceEndsAt: graceEndsIso,
      lastSuccessfulPaymentAt: paidAt.toISOString(),
      lastPaymentReference: reference,
    },
    accessUnlocked,
    isPartial,
    remainingBalance,
    cumulativePaid,
    duplicateFingerprint,
  };
}
