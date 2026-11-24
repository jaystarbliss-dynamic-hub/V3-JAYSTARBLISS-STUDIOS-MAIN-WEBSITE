import type { Handler } from "@netlify/functions";
import { adminAuth } from "../../api/_lib/firebase-admin";
import { reconcileSuccessfulCharge } from "../../api/_lib/payment-reconciliation";

const getToken = (event: any) => { const header = event.headers?.authorization || event.headers?.Authorization || ""; return header.startsWith("Bearer ") ? header.slice(7) : ""; };
const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const token = getToken(event); if (!token) return json(401, { error: "Authentication required." });
    const decoded = await adminAuth.verifyIdToken(token);
    const { reference } = JSON.parse(event.body || "{}");
    if (!reference || typeof reference !== "string" || reference.length > 200) return json(400, { error: "Payment reference is required." });
    if (!process.env.PAYSTACK_SECRET_KEY) return json(503, { error: "Payment gateway is not configured." });
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
    const data = await response.json();
    const gatewayStatus = String(data.data?.status || "").toLowerCase();
    if (!response.ok || !data.status) {
      return json(402, {
        verified: false,
        status: "failed",
        reference,
        error: data?.message || "Payment could not be verified with Paystack.",
      });
    }
    if (gatewayStatus === "pending" || gatewayStatus === "ongoing" || gatewayStatus === "queued") {
      return json(202, {
        verified: false,
        status: "pending",
        reference,
        message: "Paystack is still processing this transaction. You can retry verification shortly without paying again.",
      });
    }
    if (gatewayStatus === "abandoned") {
      return json(402, {
        verified: false,
        status: "cancelled",
        reference,
        error: "Checkout was closed or cancelled before payment completed.",
      });
    }
    if (gatewayStatus !== "success") {
      return json(402, {
        verified: false,
        status: "failed",
        reference,
        error: data.data?.gateway_response || "Payment was not completed successfully.",
      });
    }
    const result = await reconcileSuccessfulCharge(data.data, decoded.uid);
    return json(200, {
      verified: true,
      status: "success",
      reference,
      alreadyRecorded: !result.created,
      payment: result.payment
        ? {
            baseAmount: result.payment.baseAmount,
            transactionFee: result.payment.transactionFee,
            customerTotal: result.payment.customerTotal,
            paymentMethod: result.payment.paymentMethod,
            paidAt: result.payment.paidAt || data.data?.paid_at || new Date().toISOString(),
            planName: result.payment.planName || data.data?.metadata?.planName || "Tuition Settlement",
            studentName: result.payment.studentName || data.data?.metadata?.studentName || null,
          }
        : null,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const errors: Record<string, [number, string]> = {
      PAYMENT_METADATA_INVALID: [400, "Payment metadata could not be verified."],
      PAYMENT_OWNER_MISMATCH: [403, "Payment ownership could not be verified."],
      PAYMENT_USER_NOT_FOUND: [403, "The paying portal account could not be verified."],
      PAYMENT_ROLE_MISMATCH: [403, "Payment role does not match the portal account."],
      PAYMENT_ROLE_INVALID: [403, "This portal account cannot complete this payment."],
      PAYMENT_PLAN_INVALID: [400, "The payment plan is no longer active."],
      PAYMENT_PLAN_ROLE_MISMATCH: [400, "The selected payment plan is not valid for this portal."],
      PAYMENT_NOT_SUCCESSFUL: [402, "Payment transaction was not completed successfully."],
      PAYMENT_CURRENCY_MISMATCH: [400, "Payment currency must be NGN to reconcile this tuition charge."],
      PAYMENT_AMOUNT_MISMATCH: [400, "The verified Paystack amount does not reconcile with the configured base fee and gateway fee."],
      PAYMENT_METADATA_AMOUNT_MISMATCH: [400, "The payment metadata amount does not match the configured base fee."],
      PAYMENT_STUDENT_OWNER_MISMATCH: [403, "The selected student is not linked to this account."],
      PAYMENT_SCHOOL_OWNER_MISMATCH: [403, "The payment school could not be verified."],
      PAYMENT_RESPONSIBILITY_MISMATCH: [403, "This enrolment is not configured for student self-funded payment."],
      PROGRAMME_ENROLLMENT_NOT_FOUND: [404, "The linked programme enrolment could not be found."],
      STUDENT_NOT_FOUND: [404, "The linked student record could not be found."],
      PAYMENT_ENROLLMENT_ROLE_INVALID: [400, "Enrollment-linked payments must come from a parent portal."],
      ENROLLMENT_NOT_FOUND: [404, "Linked enrollment request could not be found."],
      ENROLLMENT_OWNER_MISMATCH: [403, "Payment is not authorized for this enrollment request."],
      ENROLLMENT_PLAN_MISMATCH: [400, "Payment plan does not match the linked enrollment request."],
      ENROLLMENT_ALREADY_PAID: [409, "This enrollment request has already been paid."]
    };
    if (errors[code]) return json(errors[code][0], { error: errors[code][1], code });
    console.error("Payment verification error:", error); return json(500, { error: "Unable to verify payment." });
  }
};
