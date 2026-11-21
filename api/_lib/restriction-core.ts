/**
 * Centralized Account Restriction, Lock Reason, Validation & Sanitization Core
 *
 * Shared isomorphic domain module imported by both backend functions and frontend UI.
 * Enforces:
 * - Mandatory structured lock reasons + custom explanation for OTHER
 * - Strict separation between `userFacingMessage` and private `internalAdminNote`
 * - Distinct lockdown types (Automated Payment vs Manual Administrative vs Suspension vs Programme vs Temporary vs Security/Review)
 * - Automatic expiry evaluation for time-limited restrictions
 * - Deterministic notification deduplication keys
 */

import { formatLagosDate, parseDateSafe } from "./subscription-core";

export type LockReasonCode =
  | "PAYMENT_OVERDUE"
  | "SCHOOL_SUBSCRIPTION_OVERDUE"
  | "PARENT_FEE_OVERDUE"
  | "PROGRAMME_RENEWAL_OVERDUE"
  | "ADMINISTRATIVE_RESTRICTION"
  | "TEMPORARY_ACCESS_RESTRICTION"
  | "ACCOUNT_UNDER_REVIEW"
  | "SECURITY_REVIEW"
  | "POLICY_OR_COMPLIANCE_REVIEW"
  | "OTHER";

export type RestrictionType =
  | "AUTOMATED_PAYMENT_LOCKDOWN"
  | "MANUAL_ADMINISTRATIVE_RESTRICTION"
  | "ADMINISTRATIVE_SUSPENSION"
  | "PROGRAMME_RESTRICTION"
  | "TEMPORARY_RESTRICTION"
  | "SECURITY_OR_REVIEW_RESTRICTION";

export type RestrictionStatus =
  | "ACTIVE"
  | "SCHEDULED"
  | "LIFTED"
  | "EXPIRED"
  | "RESOLVED_BY_PAYMENT";

export type RestrictedScope = "ACCOUNT" | "INSTITUTION" | "PROGRAMME";

export type RestrictionTargetAccountType =
  | "SCHOOL"
  | "SCHOOL_ADMIN"
  | "INDIVIDUAL_STUDENT"
  | "PARENT"
  | "PARENT_CHILD"
  | "STUDENT_SELF_FUNDED_PROGRAMME";

export interface LockReasonMetadata {
  code: LockReasonCode;
  label: string;
  isPaymentRelated: boolean;
  defaultRestrictionType: RestrictionType;
  requiresCustomExplanation?: boolean;
}

export const LOCK_REASON_DEFINITIONS: Record<LockReasonCode, LockReasonMetadata> = {
  PAYMENT_OVERDUE: {
    code: "PAYMENT_OVERDUE",
    label: "Payment Overdue",
    isPaymentRelated: true,
    defaultRestrictionType: "AUTOMATED_PAYMENT_LOCKDOWN",
  },
  SCHOOL_SUBSCRIPTION_OVERDUE: {
    code: "SCHOOL_SUBSCRIPTION_OVERDUE",
    label: "School Subscription Overdue",
    isPaymentRelated: true,
    defaultRestrictionType: "AUTOMATED_PAYMENT_LOCKDOWN",
  },
  PARENT_FEE_OVERDUE: {
    code: "PARENT_FEE_OVERDUE",
    label: "Parent Programme Fee Overdue",
    isPaymentRelated: true,
    defaultRestrictionType: "AUTOMATED_PAYMENT_LOCKDOWN",
  },
  PROGRAMME_RENEWAL_OVERDUE: {
    code: "PROGRAMME_RENEWAL_OVERDUE",
    label: "Programme Renewal Overdue",
    isPaymentRelated: true,
    defaultRestrictionType: "AUTOMATED_PAYMENT_LOCKDOWN",
  },
  ADMINISTRATIVE_RESTRICTION: {
    code: "ADMINISTRATIVE_RESTRICTION",
    label: "Administrative Restriction",
    isPaymentRelated: false,
    defaultRestrictionType: "MANUAL_ADMINISTRATIVE_RESTRICTION",
  },
  TEMPORARY_ACCESS_RESTRICTION: {
    code: "TEMPORARY_ACCESS_RESTRICTION",
    label: "Temporary Access Restriction",
    isPaymentRelated: false,
    defaultRestrictionType: "TEMPORARY_RESTRICTION",
  },
  ACCOUNT_UNDER_REVIEW: {
    code: "ACCOUNT_UNDER_REVIEW",
    label: "Account Under Review",
    isPaymentRelated: false,
    defaultRestrictionType: "SECURITY_OR_REVIEW_RESTRICTION",
  },
  SECURITY_REVIEW: {
    code: "SECURITY_REVIEW",
    label: "Security Review",
    isPaymentRelated: false,
    defaultRestrictionType: "SECURITY_OR_REVIEW_RESTRICTION",
  },
  POLICY_OR_COMPLIANCE_REVIEW: {
    code: "POLICY_OR_COMPLIANCE_REVIEW",
    label: "Policy or Compliance Review",
    isPaymentRelated: false,
    defaultRestrictionType: "ADMINISTRATIVE_SUSPENSION",
  },
  OTHER: {
    code: "OTHER",
    label: "Other (Custom Explanation Required)",
    isPaymentRelated: false,
    defaultRestrictionType: "MANUAL_ADMINISTRATIVE_RESTRICTION",
    requiresCustomExplanation: true,
  },
};

export const LOCK_REASON_LIST: LockReasonMetadata[] = Object.values(LOCK_REASON_DEFINITIONS);

export const RESTRICTION_TYPE_LABELS: Record<RestrictionType, string> = {
  AUTOMATED_PAYMENT_LOCKDOWN: "Automated Payment Lockdown",
  MANUAL_ADMINISTRATIVE_RESTRICTION: "Manual Administrative Restriction",
  ADMINISTRATIVE_SUSPENSION: "Administrative Suspension",
  PROGRAMME_RESTRICTION: "Programme-Specific Restriction",
  TEMPORARY_RESTRICTION: "Temporary Restriction",
  SECURITY_OR_REVIEW_RESTRICTION: "Security / Account Review Restriction",
};

export const UNLOCK_REASON_PRESETS: string[] = [
  "Administrative review completed",
  "Account verification completed",
  "Restriction applied in error",
  "Special temporary access approved",
  "Management authorization received",
];

export interface AccountRestrictionRecord {
  restrictionId: string;
  targetAccountId: string;
  targetAccountType: RestrictionTargetAccountType;
  accountName?: string | null;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  programmeEnrollmentId?: string | null;
  affectedStudentIds: string[];
  affectedProgrammeIds: string[];
  restrictionType: RestrictionType;
  reasonCode: LockReasonCode;
  customReason?: string | null;
  userFacingMessage: string;
  /** Strictly private to authorized platform administrators. NEVER returned in user-facing responses. */
  internalAdminNote?: string | null;
  restrictedScope: RestrictedScope;
  cascadesToLinkedLearners: boolean;
  appliedByUid: string;
  appliedByName: string;
  appliedAt: string;
  effectiveAt: string;
  expiresAt?: string | null;
  status: RestrictionStatus;
  liftedByUid?: string | null;
  liftedByName?: string | null;
  liftedAt?: string | null;
  unlockReason?: string | null;
  relatedSubscriptionId?: string | null;
  relatedPaymentReference?: string | null;
  notificationEventId?: string | null;
}

/**
 * Strictly sanitized summary safe for ordinary users.
 * Never includes `internalAdminNote`, actor UIDs, or private administrative metadata.
 */
export interface PublicRestrictionSummary {
  restrictionId: string;
  restrictionType: RestrictionType;
  restrictionTypeLabel: string;
  reasonCode: LockReasonCode;
  reasonLabel: string;
  userFacingMessage: string;
  restrictedScope: RestrictedScope;
  isPaymentRelated: boolean;
  effectiveAtIso: string | null;
  effectiveAtFormatted: string | null;
  expiresAtIso: string | null;
  expiresAtFormatted: string | null;
  affectedProgrammeIds: string[];
  cascadesToLinkedLearners: boolean;
}

export interface BulkLockTargetInput {
  subscriptionId?: string | null;
  accountType: RestrictionTargetAccountType;
  accountId: string;
  accountName?: string | null;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  programmeEnrollmentId?: string | null;
}

export interface BulkLockPreviewItem {
  targetKey: string;
  subscriptionId: string;
  accountType: RestrictionTargetAccountType;
  accountId: string;
  accountName: string;
  recipientEmail: string | null;
  linkedStudentCount: number;
  linkedStudentSampleNames: string[];
  affectedStudentIds: string[];
  affectedProgrammeIds: string[];
  affectedProgrammeNames: string[];
  cascadesToLinkedLearners: boolean;
  valid: boolean;
  validationError?: string | null;
}

export interface BulkLockPreviewResult {
  valid: boolean;
  selectedCount: number;
  validCount: number;
  invalidCount: number;
  totalLinkedStudentsAffected: number;
  totalProgrammesAffected: number;
  restrictionType: RestrictionType;
  reasonCode: LockReasonCode;
  reasonLabel: string;
  customReason: string | null;
  userFacingMessage: string;
  effectiveAtIso: string;
  effectiveAtFormatted: string | null;
  expiresAtIso: string | null;
  expiresAtFormatted: string | null;
  cascadesToLinkedLearners: boolean;
  items: BulkLockPreviewItem[];
  errors: string[];
}

export function isValidLockReasonCode(code: unknown): code is LockReasonCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(LOCK_REASON_DEFINITIONS, code);
}

export function isValidRestrictionType(value: unknown): value is RestrictionType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RESTRICTION_TYPE_LABELS, value);
}

export function isPaymentReasonCode(code: LockReasonCode | string | null | undefined): boolean {
  if (!code || !isValidLockReasonCode(code)) return false;
  return LOCK_REASON_DEFINITIONS[code].isPaymentRelated;
}

export function isPaymentRestrictionRecord(record: Pick<AccountRestrictionRecord, "restrictionType" | "reasonCode">): boolean {
  return record.restrictionType === "AUTOMATED_PAYMENT_LOCKDOWN" || isPaymentReasonCode(record.reasonCode);
}

export function getLockReasonLabel(code: LockReasonCode | string | null | undefined, customReason?: string | null): string {
  if (!code || !isValidLockReasonCode(code)) {
    return customReason ? String(customReason).trim() : "Portal Access Restricted";
  }
  if (code === "OTHER" && customReason && String(customReason).trim()) {
    return String(customReason).trim();
  }
  return LOCK_REASON_DEFINITIONS[code].label;
}

export function getAutomaticPaymentReasonCode(accountType?: string | null): LockReasonCode {
  const normalized = String(accountType || "").trim().toUpperCase();
  if (normalized === "SCHOOL" || normalized === "SCHOOL_ADMIN") return "SCHOOL_SUBSCRIPTION_OVERDUE";
  if (normalized === "PARENT" || normalized === "PARENT_CHILD") return "PARENT_FEE_OVERDUE";
  if (normalized === "INDIVIDUAL_STUDENT" || normalized === "STUDENT_SELF_FUNDED_PROGRAMME") {
    return "PROGRAMME_RENEWAL_OVERDUE";
  }
  return "PAYMENT_OVERDUE";
}

export function buildDefaultUserFacingMessage(
  reasonCode: LockReasonCode,
  accountType: RestrictionTargetAccountType | string = "SCHOOL",
  customReason?: string | null
): string {
  const normalized = String(accountType || "SCHOOL").toUpperCase();
  const custom = String(customReason || "").trim();

  if (reasonCode === "SCHOOL_SUBSCRIPTION_OVERDUE" || (reasonCode === "PAYMENT_OVERDUE" && normalized === "SCHOOL")) {
    return "Your school portal access has been temporarily restricted because your institutional subscription payment is overdue. Please open your Billing Center to review the outstanding payment and renew your subscription, or contact Jaystarbliss Studios Support for assistance.";
  }
  if (reasonCode === "PARENT_FEE_OVERDUE" || (reasonCode === "PAYMENT_OVERDUE" && (normalized === "PARENT" || normalized === "PARENT_CHILD"))) {
    return "Payment for your child's current programme is overdue. Please review the outstanding fee in your Billing Center to restore learning access, or contact Jaystarbliss Studios Support for assistance.";
  }
  if (reasonCode === "PROGRAMME_RENEWAL_OVERDUE" || reasonCode === "PAYMENT_OVERDUE") {
    return "Your programme subscription is overdue. Please visit your Billing Center to complete your renewal, or contact Jaystarbliss Studios Support for assistance.";
  }
  if (reasonCode === "SECURITY_REVIEW") {
    return "Your portal access has been temporarily restricted pending a routine security review. Please contact Jaystarbliss Studios Support so our team can assist with verifying your account.";
  }
  if (reasonCode === "ACCOUNT_UNDER_REVIEW") {
    return "Your account is currently under administrative review and portal access has been temporarily restricted. Please contact Jaystarbliss Studios Support for updates and next steps.";
  }
  if (reasonCode === "POLICY_OR_COMPLIANCE_REVIEW") {
    return "Your portal access has been suspended pending a policy and compliance review. Please reach out to Jaystarbliss Studios Support for guidance on restoring access.";
  }
  if (reasonCode === "TEMPORARY_ACCESS_RESTRICTION") {
    return "Your portal access has been placed under a temporary administrative restriction. Please contact Jaystarbliss Studios Support if you have questions regarding restoration timing.";
  }
  if (reasonCode === "OTHER" && custom) {
    return `Your portal access has been temporarily restricted (${custom}). Please contact Jaystarbliss Studios Support for assistance.`;
  }
  return "Your portal access has been temporarily restricted by administration. Please contact Jaystarbliss Studios Support for further information and assistance.";
}

export interface ManualLockValidationInput {
  reasonCode?: unknown;
  customReason?: unknown;
  userFacingMessage?: unknown;
  internalAdminNote?: unknown;
  restrictionType?: unknown;
  effectiveAt?: unknown;
  expiresAt?: unknown;
  now?: Date;
}

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
  sanitized?: {
    reasonCode: LockReasonCode;
    customReason: string | null;
    userFacingMessage: string;
    internalAdminNote: string | null;
    restrictionType: RestrictionType;
    effectiveAt: Date;
    expiresAt: Date | null;
  };
}

/**
 * Strictly validates manual lock/restriction payloads before writing.
 * Enforces mandatory reason code, custom reason for OTHER, meaningful user-facing explanation,
 * and valid effective/expiry timestamps.
 */
export function validateManualLockInput(input: ManualLockValidationInput): ValidationOutcome {
  const errors: string[] = [];
  const now = input.now || new Date();

  const rawReasonCode = String(input.reasonCode || "").trim().toUpperCase();
  if (!rawReasonCode || !isValidLockReasonCode(rawReasonCode)) {
    errors.push("A valid lock reason category is required.");
  }

  const reasonCode = isValidLockReasonCode(rawReasonCode) ? rawReasonCode : "ADMINISTRATIVE_RESTRICTION";
  const customReason = String(input.customReason || "").trim();
  if (reasonCode === "OTHER" && customReason.length < 3) {
    errors.push("A custom explanation is required when the reason category is OTHER.");
  }

  const userFacingMessage = String(input.userFacingMessage || "").trim();
  if (userFacingMessage.length < 10) {
    errors.push("A clear, meaningful user-facing explanation (at least 10 characters) is required.");
  }

  const internalAdminNote = String(input.internalAdminNote || "").trim() || null;

  const rawType = String(input.restrictionType || "").trim().toUpperCase();
  const restrictionType: RestrictionType = isValidRestrictionType(rawType)
    ? rawType
    : LOCK_REASON_DEFINITIONS[reasonCode].defaultRestrictionType;

  const effectiveAt = input.effectiveAt ? parseDateSafe(input.effectiveAt) : now;
  if (input.effectiveAt && !effectiveAt) {
    errors.push("Effective start date is invalid.");
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null && String(input.expiresAt).trim() !== "") {
    expiresAt = parseDateSafe(input.expiresAt);
    if (!expiresAt) {
      errors.push("Expiry date is invalid.");
    } else if (effectiveAt && expiresAt.getTime() <= effectiveAt.getTime()) {
      errors.push("Expiry date must be later than the effective start date.");
    } else if (expiresAt.getTime() <= now.getTime()) {
      errors.push("Expiry date must be in the future.");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      reasonCode,
      customReason: customReason || null,
      userFacingMessage,
      internalAdminNote,
      restrictionType,
      effectiveAt: effectiveAt || now,
      expiresAt,
    },
  };
}

export function validateManualUnlockInput(input: { unlockReason?: unknown }): {
  valid: boolean;
  errors: string[];
  unlockReason: string;
} {
  const unlockReason = String(input.unlockReason || "").trim();
  if (unlockReason.length < 3) {
    return {
      valid: false,
      errors: ["An unlock reason is required before restoring account access."],
      unlockReason: "",
    };
  }
  return { valid: true, errors: [], unlockReason };
}

/**
 * Evaluates whether an AccountRestrictionRecord is actively blocking access at `now`.
 * - Respects `status === 'ACTIVE' | 'SCHEDULED'`
 * - Respects `effectiveAt` (scheduled future restrictions do not block yet)
 * - Respects `expiresAt` (expired temporary restrictions automatically stop blocking)
 */
export function isRestrictionActiveAt(
  restriction: Partial<AccountRestrictionRecord> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!restriction) return false;
  const status = String(restriction.status || "").trim().toUpperCase();
  if (status !== "ACTIVE" && status !== "SCHEDULED") return false;

  const effectiveAt = parseDateSafe(restriction.effectiveAt);
  if (effectiveAt && effectiveAt.getTime() > now.getTime()) {
    return false;
  }

  const expiresAt = parseDateSafe(restriction.expiresAt);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return false;
  }

  return true;
}

export function isRestrictionExpiredAt(
  restriction: Partial<AccountRestrictionRecord> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!restriction) return false;
  const status = String(restriction.status || "").trim().toUpperCase();
  if (status !== "ACTIVE" && status !== "SCHEDULED") return false;
  const expiresAt = parseDateSafe(restriction.expiresAt);
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

/**
 * Converts a full AccountRestrictionRecord into a user-safe PublicRestrictionSummary.
 * - NEVER exposes `internalAdminNote` or admin actor UIDs.
 * - Masks institutional/parental billing details for SCHOOL_FUNDED and PARENT_FUNDED students.
 */
export function sanitizeRestrictionForUser(
  restriction: AccountRestrictionRecord,
  role: "school" | "student" | "parent" | "staff" | "admin",
  studentFundingCategory?: "SCHOOL_FUNDED" | "PARENT_FUNDED" | "INDIVIDUAL_SELF_FUNDED"
): PublicRestrictionSummary {
  const paymentRelated = isPaymentRestrictionRecord(restriction);
  const effectiveDate = parseDateSafe(restriction.effectiveAt);
  const expiryDate = parseDateSafe(restriction.expiresAt);

  let safeMessage = String(restriction.userFacingMessage || "").trim();
  let safeReasonLabel = getLockReasonLabel(restriction.reasonCode, restriction.customReason);

  // Protect institutional & parental privacy when rendered to dependent learners
  if (role === "student" && studentFundingCategory === "SCHOOL_FUNDED") {
    if (paymentRelated || restriction.targetAccountType === "SCHOOL") {
      safeMessage =
        "Your school portal access has been temporarily restricted. Please contact your school administrator for further information.";
      safeReasonLabel = paymentRelated ? "School Portal Access Restricted" : "Institutional Access Restriction";
    }
  } else if (role === "student" && studentFundingCategory === "PARENT_FUNDED") {
    if (paymentRelated || restriction.targetAccountType === "PARENT" || restriction.targetAccountType === "PARENT_CHILD") {
      safeMessage =
        "Please contact your parent or guardian for more information about your current programme access.";
      safeReasonLabel = paymentRelated ? "Programme Access Temporarily Restricted" : "Account Access Restricted";
    }
  }

  if (!safeMessage) {
    safeMessage = buildDefaultUserFacingMessage(
      restriction.reasonCode,
      restriction.targetAccountType,
      restriction.customReason
    );
  }

  return {
    restrictionId: restriction.restrictionId,
    restrictionType: restriction.restrictionType,
    restrictionTypeLabel: RESTRICTION_TYPE_LABELS[restriction.restrictionType] || "Access Restriction",
    reasonCode: restriction.reasonCode,
    reasonLabel: safeReasonLabel,
    userFacingMessage: safeMessage,
    restrictedScope: restriction.restrictedScope || "ACCOUNT",
    isPaymentRelated: paymentRelated,
    effectiveAtIso: effectiveDate ? effectiveDate.toISOString() : null,
    effectiveAtFormatted: formatLagosDate(effectiveDate),
    expiresAtIso: expiryDate ? expiryDate.toISOString() : null,
    expiresAtFormatted: formatLagosDate(expiryDate),
    affectedProgrammeIds: Array.isArray(restriction.affectedProgrammeIds) ? restriction.affectedProgrammeIds : [],
    cascadesToLinkedLearners: Boolean(restriction.cascadesToLinkedLearners),
  };
}

/**
 * Deterministic notification event document ID preventing duplicate restriction notifications
 * for the same restriction event and recipient.
 */
export function buildRestrictionNotificationId(restrictionId: string, recipientKey: string): string {
  const safeRes = String(restrictionId || "res").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const safeRec = String(recipientKey || "recipient").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `${safeRes}__${safeRec}`;
}
