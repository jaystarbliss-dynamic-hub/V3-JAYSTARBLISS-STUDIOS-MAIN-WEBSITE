import type { Handler } from "@netlify/functions";
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb } from "../../api/_lib/firebase-admin";
import { reconcileSuccessfulCharge } from "../../api/_lib/payment-reconciliation";
import { createPortalNotification } from "../../api/_lib/email";

const getHeader = (event: any, name: string) => event.headers?.[name] || event.headers?.[name.toLowerCase()] || event.headers?.[name.toUpperCase()] || "";
const json = (statusCode: number, body: string) => ({ statusCode, body });
const validSignature = (raw: string, signature: string, secret: string) => {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, "Method Not Allowed");
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  if (!validSignature(rawBody, getHeader(event, "x-paystack-signature"), secret)) return json(401, "Invalid signature");

  try {
    const payload = JSON.parse(rawBody || "{}");
    if (payload.event === "charge.success") {
      try {
        await reconcileSuccessfulCharge(payload.data || {});
        return json(200, "Charge reconciled");
      } catch (error) {
        console.error("Paystack charge reconciliation failed:", error);
        return json(200, "Event acknowledged");
      }
    }

    if (["transfer.success", "transfer.failed", "transfer.reversed"].includes(String(payload.event || ""))) {
      const transfer = payload.data || {};
      const reference = String(transfer.reference || "").trim();
      if (!reference) return json(200, "Event acknowledged");
      const withdrawalQuery = await adminDb.collection("walletWithdrawals").where("transferReference", "==", reference).limit(1).get();
      if (withdrawalQuery.empty) return json(200, "Event acknowledged");
      const withdrawalDoc = withdrawalQuery.docs[0];
      const outerWithdrawal = withdrawalDoc.data() || {};
      const staffId = String(outerWithdrawal.staffId || "");
      const amount = Number(outerWithdrawal.amount || 0);
      const walletRef = adminDb.collection("staffWallets").doc(staffId);
      const success = payload.event === "transfer.success";
      let updatedInTx = false;
      await adminDb.runTransaction(async transaction => {
        const [freshWithdrawalSnap, walletSnap] = await Promise.all([
          transaction.get(withdrawalDoc.ref),
          transaction.get(walletRef)
        ]);
        if (!freshWithdrawalSnap.exists) return;
        const freshWithdrawal = freshWithdrawalSnap.data() || {};
        if (String(freshWithdrawal.status || "").toUpperCase() !== "PROCESSING") return;
        const wallet = walletSnap.exists ? walletSnap.data() || {} : {};
        const txAmount = Number(freshWithdrawal.amount || amount || 0);
        transaction.set(walletRef, {
          availableBalance: success
            ? Number(wallet.availableBalance || 0)
            : Number((Number(wallet.availableBalance || 0) + txAmount).toFixed(2)),
          reservedBalance: Number(Math.max(0, Number(wallet.reservedBalance || 0) - txAmount).toFixed(2)),
          updatedAt: new Date()
        }, { merge: true });
        transaction.update(withdrawalDoc.ref, {
          status: success ? "PAID" : "FAILED",
          providerStatus: String(transfer.status || payload.event),
          providerTransferId: transfer.id || null,
          completedAt: new Date(),
          failureReason: success ? null : String(transfer.failure_reason || transfer.gateway_response || payload.event),
          updatedAt: new Date()
        });
        updatedInTx = true;
      });
      if (updatedInTx && staffId) {
        await createPortalNotification({
          recipientId: staffId,
          email: undefined,
          title: success ? "Wallet withdrawal paid" : "Wallet withdrawal failed",
          message: success ? `Your ₦${amount.toLocaleString()} staff wallet withdrawal has been paid to your verified bank account.` : `Your ₦${amount.toLocaleString()} staff wallet withdrawal could not be completed. The funds were returned to your available wallet balance.`,
          type: success ? "WALLET_WITHDRAWAL_PAID" : "WALLET_WITHDRAWAL_FAILED",
          data: { withdrawalId: withdrawalDoc.id, reference, amount }
        });
      }
      return json(200, "Transfer event reconciled");
    }

    return json(200, "Event acknowledged");
  } catch (error) {
    console.error("Paystack webhook processing error:", error);
    return json(500, "Webhook processing failed");
  }
};
