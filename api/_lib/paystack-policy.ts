export const PAYMENT_POLICY_VERSION = "v1.0-no-refund";
export const PAYMENT_POLICY_TITLE = "PAYMENT POLICY — NO REFUNDS";
export const PAYMENT_POLICY_TEXT =
  "No refund of fees paid to the other party will be made after payment has been successfully completed.";

export interface PaymentPolicyAuditRecord {
  paymentPolicyAccepted: true;
  paymentPolicyVersion: string;
  paymentPolicyText: string;
  paymentPolicyAcceptedAt: string;
  paymentPolicyAcceptedBy: string;
}

export function assertAndBuildPaymentPolicyAudit(
  body: Record<string, unknown>,
  uid: string,
  acceptedAt: Date = new Date()
): PaymentPolicyAuditRecord {
  if (body?.paymentPolicyAccepted !== true) {
    throw new Error("PAYMENT_POLICY_NOT_ACCEPTED");
  }
  return {
    paymentPolicyAccepted: true,
    paymentPolicyVersion: PAYMENT_POLICY_VERSION,
    paymentPolicyText: PAYMENT_POLICY_TEXT,
    paymentPolicyAcceptedAt: acceptedAt.toISOString(),
    paymentPolicyAcceptedBy: String(uid || "").trim(),
  };
}

export function extractPolicyAuditFromMetadata(
  metadata: Record<string, any> | undefined | null,
  fallbackUid: string,
  fallbackDate: Date
) {
  const meta = metadata || {};
  const accepted =
    meta.paymentPolicyAccepted === true ||
    String(meta.paymentPolicyAccepted || "").toLowerCase() === "true";

  return {
    paymentPolicyAccepted: accepted,
    paymentPolicyVersion: String(meta.paymentPolicyVersion || PAYMENT_POLICY_VERSION).trim(),
    paymentPolicyText: String(meta.paymentPolicyText || PAYMENT_POLICY_TEXT).trim(),
    paymentPolicyAcceptedAt: meta.paymentPolicyAcceptedAt
      ? String(meta.paymentPolicyAcceptedAt).trim()
      : accepted
      ? fallbackDate.toISOString()
      : null,
    paymentPolicyAcceptedBy: String(meta.paymentPolicyAcceptedBy || fallbackUid || "").trim() || null,
  };
}

export function buildPaystackInitializePayload(params: {
  email: string | undefined;
  amountMinor: number;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  // Deliberately omit `channels` so Paystack dynamically presents all active checkout methods.
  return {
    email: params.email,
    amount: Math.round(params.amountMinor),
    currency: "NGN",
    callback_url: params.callbackUrl,
    metadata: params.metadata,
  };
}
