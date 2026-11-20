/**
 * Controlled Test Financial Data Reset — Pure Safety & Inventory Engine
 *
 * Implements Part 7 safeguards:
 * - Fail-closed Firebase project & environment guard (never runs on production or unconfigured env)
 * - Explicit allowlist of financial transaction collections vs strictly preserved operational/academic collections
 * - Selective embedded billing field cleanup preserving contract configuration (`baseAmount`, `cycle`, `planId`, `planName`, `allowedModes`, `notes`)
 * - Deterministic preview signature tying Stage A dry run to Stage B execution
 */

export const RESET_CONFIRMATION_PHRASE = "CLEAR TEST FINANCIAL DATA";

export const TARGET_FINANCIAL_COLLECTIONS = [
  "payments",
  "walletWithdrawals",
  "withdrawals",
  "tutorSettlements",
  "treasuryLogs",
  "subscriptionReminders",
] as const;

export const DERIVED_BALANCE_COLLECTIONS = ["staffWallets"] as const;

export const EMBEDDED_FIELD_RESET_COLLECTIONS = [
  "schools",
  "users",
  "individualStudents",
  "students",
  "programme_enrollments",
  "enrollment_requests",
  "billingSubscriptions",
] as const;

/**
 * Collections & documents that MUST NEVER be deleted during a test financial reset.
 */
export const PRESERVED_COLLECTIONS = [
  "payment_config",
  "users",
  "students",
  "individualStudents",
  "schools",
  "parents",
  "programs",
  "programme_enrollments",
  "enrollment_requests",
  "classSchedules",
  "jdiExams",
  "schoolExams",
  "jdiExamAttempts",
  "assignments",
  "academic_assessments",
  "attendance",
  "milestones",
  "resources",
  "tutors",
  "staff",
  "adminAuditLogs",
  "financialResetAuditLogs",
  "financialResetBackups",
] as const;

export const PRESERVED_CONFIG_DOCS = ["payment_config/settings"] as const;

export interface ResetEnvironmentGuardInput {
  activeProjectId: string;
  expectedTestProjectId?: string;
  allowResetFlag?: string;
  firebaseEnv?: string;
  nodeEnv?: string;
}

export interface ResetEnvironmentGuardResult {
  allowed: boolean;
  activeProjectId: string;
  expectedTestProjectId: string;
  environmentLabel: string;
  reasons: string[];
}

/**
 * Fail-closed project & environment guard.
 * Destructive execution is ONLY permitted when:
 * 1. `activeProjectId` is known and non-empty
 * 2. `expectedTestProjectId` is explicitly configured via `EXPECTED_TEST_FIREBASE_PROJECT_ID`
 * 3. `activeProjectId === expectedTestProjectId`
 * 4. `allowResetFlag === "true"` (`ALLOW_TEST_FINANCIAL_RESET=true`)
 * 5. `firebaseEnv` is NOT `"production"` / `"prod"` / `"live"`
 */
export function validateResetEnvironmentGuard(
  input: ResetEnvironmentGuardInput
): ResetEnvironmentGuardResult {
  const activeProjectId = String(input.activeProjectId || "").trim();
  const expectedTestProjectId = String(input.expectedTestProjectId || "").trim();
  const allowResetFlag = String(input.allowResetFlag || "").trim().toLowerCase();
  const firebaseEnv = String(input.firebaseEnv || "").trim().toLowerCase();
  const nodeEnv = String(input.nodeEnv || "").trim().toLowerCase();
  const reasons: string[] = [];

  if (!activeProjectId) {
    reasons.push("Active Firebase project ID could not be verified.");
  }
  if (!expectedTestProjectId) {
    reasons.push(
      "EXPECTED_TEST_FIREBASE_PROJECT_ID environment variable is not configured (fail-closed)."
    );
  }
  if (activeProjectId && expectedTestProjectId && activeProjectId !== expectedTestProjectId) {
    reasons.push(
      `Project ID mismatch: active project "${activeProjectId}" does not match EXPECTED_TEST_FIREBASE_PROJECT_ID "${expectedTestProjectId}".`
    );
  }
  if (["production", "prod", "live"].includes(firebaseEnv)) {
    reasons.push(`Environment "${firebaseEnv}" is flagged as production and blocked from financial reset.`);
  }
  if (allowResetFlag !== "true") {
    reasons.push("ALLOW_TEST_FINANCIAL_RESET must be explicitly set to \"true\" in test/staging server env.");
  }

  return {
    allowed: reasons.length === 0,
    activeProjectId: activeProjectId || "unknown",
    expectedTestProjectId: expectedTestProjectId || "(not configured)",
    environmentLabel: firebaseEnv || nodeEnv || "unknown",
    reasons,
  };
}

export interface CollectionInventorySummary {
  collection: string;
  action: "DELETE_DOCUMENTS" | "RESET_DERIVED_BALANCES" | "RESET_EMBEDDED_PAYMENT_FIELDS";
  documentCount: number;
  statusBreakdown: Record<string, number>;
  aggregateAmountNaira: number;
  notes?: string;
}

export interface FinancialResetInventory {
  activeProjectId: string;
  environmentLabel: string;
  guard: ResetEnvironmentGuardResult;
  collections: CollectionInventorySummary[];
  totalFinancialDocumentsToDelete: number;
  totalDerivedWalletDocsToZero: number;
  totalEmbeddedRecordsToClean: number;
  totalAggregateAmountNaira: number;
  preservedCollections: readonly string[];
  preservedConfigDocs: readonly string[];
  previewSignature: string;
  generatedAt: string;
}

/**
 * Computes a deterministic signature for a dry-run inventory so Stage B verifies
 * that counts/project have not unexpectedly drifted before executing.
 */
export function computePreviewSignature(params: {
  activeProjectId: string;
  collections: Array<{ collection: string; documentCount: number; aggregateAmountNaira: number }>;
}): string {
  const canonical = [
    params.activeProjectId,
    ...params.collections
      .slice()
      .sort((a, b) => a.collection.localeCompare(b.collection))
      .map((c) => `${c.collection}:${c.documentCount}:${Math.round(c.aggregateAmountNaira)}`),
  ].join("|");

  // Deterministic non-cryptographic FNV-1a 64-bit-like hex digest (pure JS, no Node crypto needed)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i += 1) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `RST-${h1.toString(16).padStart(8, "0")}-${h2.toString(16).padStart(8, "0")}`.toUpperCase();
}

/**
 * Extracts a safe Naira amount from a financial document for dry-run reporting.
 */
export function extractFinancialDocAmount(doc: Record<string, any>): number {
  const candidates = [
    doc.customerTotal,
    doc.amount,
    doc.baseAmount,
    doc.availableBalance,
    doc.lifetimeEarned,
    doc.requestedAmount,
    doc.netAmount,
  ];
  for (const val of candidates) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) return Number(num.toFixed(2));
  }
  return 0;
}

/**
 * Summarizes an array of documents in a single financial collection.
 */
export function summarizeCollectionDocs(params: {
  collection: string;
  action: CollectionInventorySummary["action"];
  docs: Array<Record<string, any>>;
  notes?: string;
}): CollectionInventorySummary {
  const statusBreakdown: Record<string, number> = {};
  let aggregateAmountNaira = 0;

  for (const d of params.docs) {
    const statusKey = String(d.status || d.paymentStatus || d.verificationStatus || "UNSPECIFIED")
      .trim()
      .toUpperCase();
    statusBreakdown[statusKey] = (statusBreakdown[statusKey] || 0) + 1;
    aggregateAmountNaira += extractFinancialDocAmount(d);
  }

  return {
    collection: params.collection,
    action: params.action,
    documentCount: params.docs.length,
    statusBreakdown,
    aggregateAmountNaira: Number(aggregateAmountNaira.toFixed(2)),
    notes: params.notes,
  };
}

/**
 * Strips test payment history fields from an embedded `billing` object (e.g., on `schools` or `users`)
 * while STRICTLY preserving configured contract pricing, cycles, plans, modes, and notes.
 */
export function stripTestPaymentFieldsFromBillingObject(
  billing: Record<string, any> | null | undefined
): Record<string, any> | null {
  if (!billing || typeof billing !== "object") return null;
  const baseAmount = Number(billing.baseAmount || 0);
  return {
    // Preserved contract & pricing configuration
    ...(billing.planId !== undefined ? { planId: billing.planId } : {}),
    ...(billing.planName !== undefined ? { planName: billing.planName } : {}),
    ...(billing.baseAmount !== undefined ? { baseAmount } : {}),
    ...(billing.cycle !== undefined ? { cycle: billing.cycle } : {}),
    ...(billing.durationWeeks !== undefined ? { durationWeeks: billing.durationWeeks } : {}),
    ...(billing.allowedModes !== undefined ? { allowedModes: billing.allowedModes } : {}),
    ...(billing.mode !== undefined ? { mode: billing.mode } : {}),
    ...(billing.notes !== undefined ? { notes: billing.notes } : {}),
    ...(billing.exempt !== undefined ? { exempt: billing.exempt } : {}),
    // Reset test payment settlement history fields
    amountPaid: 0,
    remainingBalance: baseAmount > 0 ? baseAmount : 0,
    status: billing.exempt ? "EXEMPT" : "ACTIVE",
    lastPaidAt: null,
    lastPaymentReference: null,
    paidThrough: null,
    lastReminderSentAt: null,
    escrowQuarter: null,
  };
}

/**
 * Strips test payment history fields from a `programme_enrollments` document
 * while strictly preserving the enrolment record, approval, and approvedFee.
 */
export function stripTestPaymentFieldsFromProgrammeEnrollment(
  enrollment: Record<string, any>
): Record<string, any> {
  const approvedFee = Number(enrollment.approvedFee || 0);
  const currentStatus = String(enrollment.enrollmentStatus || "").toUpperCase();
  const resetStatus =
    ["PENDING_ADMIN_REVIEW", "REJECTED", "CANCELLED"].includes(currentStatus)
      ? currentStatus
      : "APPROVED_AWAITING_PAYMENT";

  return {
    amountPaid: 0,
    remainingBalance: approvedFee > 0 ? approvedFee : 0,
    paymentStatus: "UNPAID",
    enrollmentStatus: resetStatus,
    paidThrough: null,
    nextDueDate: null,
    lastPaymentReference: null,
    lastPaidAt: null,
    paymentHistory: [],
  };
}

/**
 * Validates Stage B confirmation inputs before any destructive batch runs.
 */
export function validateResetExecutionRequest(params: {
  isSuperAdmin: boolean;
  confirmationPhrase: string;
  providedPreviewSignature: string;
  freshPreviewSignature: string;
  guard: ResetEnvironmentGuardResult;
}): { ok: boolean; error?: string } {
  if (!params.isSuperAdmin) {
    return { ok: false, error: "Only an authorized Superadmin may execute a test financial data reset." };
  }
  if (!params.guard.allowed) {
    return {
      ok: false,
      error: `Environment safety guard blocked execution: ${params.guard.reasons.join(" ")}`,
    };
  }
  if (String(params.confirmationPhrase || "").trim() !== RESET_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      error: `Confirmation phrase mismatch. Type "${RESET_CONFIRMATION_PHRASE}" exactly to proceed.`,
    };
  }
  if (
    !params.providedPreviewSignature ||
    String(params.providedPreviewSignature).trim() !== params.freshPreviewSignature
  ) {
    return {
      ok: false,
      error:
        "Financial inventory changed since your dry run. Re-run Stage A Dry Run to verify current counts before executing.",
    };
  }
  return { ok: true };
}
