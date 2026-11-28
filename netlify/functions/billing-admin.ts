import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb, hasAdminAuth, hasAdminDb } from "../../api/_lib/firebase-admin";
import {
  getPaymentConfig,
  getUserRecord,
  normaliseRole,
  isPrivilegedRole,
  isActiveRecord,
  isSuccessfulPaymentRecord,
  isPartiallyPaidStatus,
  extractPaymentBaseAmountNaira
} from "../../api/_lib/billing";
import { FieldValue } from "firebase-admin/firestore";
import { createPortalNotification } from "../../api/_lib/email";
import {
  type BillingSubscriptionRecord,
  evaluateSubscriptionState,
  formatLagosDate,
  parseDateSafe,
  resolvePlanDurationWeeks,
} from "../../api/_lib/subscription-core";
import {
  buildCanonicalSubscriptionWritePayload,
  normalizeSubscriptionFromSource,
  resolvePaymentRestrictionsOnPaymentSuccess,
} from "../../api/_lib/subscription-service";
import {
  applyManualRestrictionToTarget,
  buildBulkLockPreview,
  liftManualRestrictions,
} from "../../api/_lib/restriction-service";
import {
  type AccountRestrictionRecord,
  type BulkLockTargetInput,
  type RestrictionTargetAccountType,
  isRestrictionActiveAt,
} from "../../api/_lib/restriction-core";
import {
  computeManualPaymentRecordAndTransition,
  type ManualPaymentTargetType,
} from "../../api/_lib/manual-payment-core";
import { randomUUID } from "node:crypto";

const tokenFromEvent = (event: any) => {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

const response = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

export const handler: Handler = async event => {
  if (event.httpMethod !== "POST") return response(405, { error: "Method Not Allowed" });
  if (!hasAdminAuth() || !hasAdminDb()) {
    return response(200, { fallback: true, reason: "ADMIN_SDK_UNAVAILABLE" });
  }
  try {
    const token = tokenFromEvent(event);
    if (!token) return response(401, { error: "Authentication required." });
    const decoded = await adminAuth.verifyIdToken(token);
    const email = String(decoded.email || "").toLowerCase();
    const adminUser = await getUserRecord(decoded.uid, email);
    const adminRole = normaliseRole(adminUser.role);
    const isSuperAdmin = email === "johnrufai242@gmail.com" || adminRole === "superadmin";
    if (!isSuperAdmin && (!isPrivilegedRole(adminRole) || !isActiveRecord(adminUser))) {
      return response(403, { error: "Administrator privileges are required." });
    }

    const body = JSON.parse(event.body || "{}");
    const action = String(body.action || "").toLowerCase();
    const configRef = adminDb.collection("payment_config").doc("settings");

    if (action === "update_plan") {
      if (!isSuperAdmin) return response(403, { error: "Only the super admin can change payment fees or plans." });
      const planId = String(body.planId || "").trim();
      const baseAmount = Number(String(body.baseAmount ?? 0).replace(/[^0-9.]/g, ""));
      const durationWeeks = Number(body.durationWeeks);
      const name = String(body.name || "").trim();
      if (!planId || !Number.isFinite(baseAmount) || baseAmount < 0 || !Number.isFinite(durationWeeks) || durationWeeks < 1 || !name) {
        return response(400, { error: "Plan name, base amount and duration are required." });
      }
      const config = await getPaymentConfig();
      if (!config.plans[planId]) return response(404, { error: "Payment plan was not found." });
      await configRef.set({
        version: Number(config.version || 3),
        plans: {
          ...config.plans,
          [planId]: {
            ...config.plans[planId],
            name,
            baseAmount,
            durationWeeks,
            teachingModes: Array.isArray(body.teachingModes) ? body.teachingModes : config.plans[planId].teachingModes,
            active: body.active !== false
          }
        },
        updatedBy: decoded.uid,
        updatedAt: new Date()
      }, { merge: true });
      return response(200, { updated: true });
    }

    if (action === "update_fee_policy") {
      if (!isSuperAdmin) return response(403, { error: "Only the super admin can change transaction fee settings." });
      const role = String(body.role || "parent").toLowerCase();
      if (role !== "parent" && role !== "school") return response(400, { error: "Fee policy role must be parent or school." });
      const percentage = Number(body.percentage), flat = Number(body.flat), cap = Number(body.cap), waiveFlatBelow = Number(body.waiveFlatBelow);
      if (![percentage, flat, cap, waiveFlatBelow].every(Number.isFinite) || percentage < 0 || flat < 0 || cap < 0 || waiveFlatBelow < 0) {
        return response(400, { error: "Fee policy values must be valid non-negative numbers." });
      }
      const key = role === "school" ? "schoolFeePolicy" : "parentFeePolicy";
      await configRef.set({
        [key]: { percentage, flat, cap, waiveFlatBelow, enabled: body.enabled !== false },
        updatedBy: decoded.uid,
        updatedAt: new Date()
      }, { merge: true });
      return response(200, { updated: true });
    }

    if (action === "set_withdrawal_fee_policy") {
      if (!isSuperAdmin) return response(403, { error: "Only the super admin can change withdrawal fee settings." });
      const percentage = Number(body.percentage), flat = Number(body.flat), cap = Number(body.cap);
      if (![percentage, flat, cap].every(Number.isFinite) || percentage < 0 || flat < 0 || cap < 0) {
        return response(400, { error: "Withdrawal fee values must be valid non-negative numbers." });
      }
      await configRef.set({
        withdrawalFeePolicy: { percentage, flat, cap, enabled: body.enabled !== false },
        updatedBy: decoded.uid,
        updatedAt: new Date()
      }, { merge: true });
      return response(200, { updated: true });
    }

    if (action === "set_minimum_withdrawal") {
      if (!isSuperAdmin) return response(403, { error: "Only the super admin can change wallet withdrawal rules." });
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) return response(400, { error: "Invalid minimum withdrawal amount." });
      await configRef.set({ minimumWithdrawalAmount: amount, updatedBy: decoded.uid, updatedAt: new Date() }, { merge: true });
      return response(200, { updated: true });
    }

    // Set custom institutional billing for a partner school
    if (action === "set_school_billing") {
      const schoolId = String(body.schoolId || "").trim();
      if (!schoolId) return response(400, { error: "School ID is required." });
      const rawAmount = body.baseAmount ?? body.amount ?? 0;
      const baseAmount = Number(String(rawAmount).replace(/[^0-9.]/g, "")) || 0;
      const cycle = String(body.cycle || "termly").toLowerCase();
      const allowedModes = Array.isArray(body.allowedModes) && body.allowedModes.length > 0
        ? body.allowedModes
        : ["advance_monthly", "advance_termly", "post_monthly", "post_termly"];
      const mode = String(body.mode || allowedModes[0] || (cycle === "monthly" ? "advance_monthly" : "advance_termly"));
      const nextDueDate = body.nextDueDate ? String(body.nextDueDate) : "";
      const status = String(body.status || "ACTIVE").toUpperCase();
      const notes = String(body.notes || "").trim();

      const billingPayload = {
        baseAmount,
        cycle,
        allowedModes,
        mode,
        nextDueDate,
        status,
        notes,
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.uid
      };

      await adminDb.collection("schools").doc(schoolId).set({
        billing: billingPayload,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      try {
        const schoolAdminUsersSnap = await adminDb.collection("users").where("schoolId", "==", schoolId).get();
        if (!schoolAdminUsersSnap.empty) {
          for (const userDoc of schoolAdminUsersSnap.docs) {
            const uRole = normaliseRole(userDoc.data()?.role);
            if (uRole !== "school") continue;
            await userDoc.ref.set({
              billing: billingPayload,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        }
      } catch (syncErr) {
        console.warn("School admin billing user sync notice:", syncErr);
      }

      return response(200, { updated: true, billing: billingPayload });
    }

    // Update programs undergoing for a school
    if (action === "update_school_programs") {
      const schoolId = String(body.schoolId || "").trim();
      if (!schoolId) return response(400, { error: "School ID is required." });
      const programs = Array.isArray(body.programs) ? body.programs : [];

      await adminDb.collection("schools").doc(schoolId).set({
        programs,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return response(200, { updated: true, programs });
    }

    // Set custom billing for a Parent or direct Student
    if (action === "set_user_billing") {
      const userId = String(body.userId || "").trim();
      const targetRole = String(body.role || "").toLowerCase();
      if (!userId) return response(400, { error: "User ID is required." });

      const baseAmount = Number(body.baseAmount ?? 0);
      const cycle = String(body.cycle || (targetRole === "parent" ? "monthly" : "monthly")).toLowerCase();
      const mode = String(body.mode || (targetRole === "parent" ? "advance_monthly" : "advance_monthly"));
      const nextDueDate = body.nextDueDate ? String(body.nextDueDate) : "";
      const status = String(body.status || "ACTIVE").toUpperCase();
      const notes = String(body.notes || "").trim();

      const billingPayload = {
        baseAmount,
        cycle,
        mode,
        nextDueDate,
        status,
        notes,
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.uid
      };

      await adminDb.collection("users").doc(userId).set({
        billing: billingPayload,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return response(200, { updated: true, billing: billingPayload });
    }

    // Send a payment reminder notification
    if (action === "send_payment_reminder") {
      const recipientId = String(body.recipientId || "").trim();
      const email = body.email ? String(body.email).trim() : undefined;
      const title = String(body.title || "Tuition & Billing Reminder").trim();
      const dueLabel = body.nextDueDate ? `due on ${new Date(body.nextDueDate).toLocaleDateString("en-NG", { dateStyle: "long" })}` : "due for renewal";
      const amountLabel = body.amount ? `₦${Number(body.amount).toLocaleString("en-NG")}` : "your scheduled amount";
      const message = String(body.message || `This is a reminder that your tuition payment of ${amountLabel} is ${dueLabel}. Please log into your portal billing center to review and complete payment.`).trim();
      const targetType = String(body.targetType || "SCHOOL").toUpperCase();
      const targetId = String(body.targetId || recipientId).trim();

      if (!recipientId && !targetId) return response(400, { error: "Recipient / target ID is required." });

      const nowIso = new Date().toISOString();

      const billingPatch: Record<string, unknown> = {
        lastReminderSentAt: nowIso,
        ...(body.nextDueDate ? { nextDueDate: String(body.nextDueDate) } : {})
      };

      if (targetType === "SCHOOL") {
        await adminDb.collection("schools").doc(targetId).set({
          billing: billingPatch
        }, { merge: true });
      } else {
        await adminDb.collection("users").doc(targetId).set({
          billing: billingPatch
        }, { merge: true });
      }

      await createPortalNotification({
        recipientId: recipientId || targetId,
        email,
        title,
        message,
        type: "PAYMENT_REMINDER",
        data: {
          targetType,
          targetId,
          nextDueDate: body.nextDueDate || null,
          amount: body.amount || null,
          sentAt: nowIso
        }
      });

      return response(200, { sent: true, sentAt: nowIso });
    }

    // Assign or reassign a tutor to a payment & student with atomic wallet adjustment and duplicate protection
    if (action === "assign_tutor") {
      const tutorId = String(body.tutorId || "").trim(),
        enrollmentRequestId = String(body.enrollmentRequestId || "").trim(),
        paymentId = String(body.paymentId || "").trim();
      if (!tutorId || (!enrollmentRequestId && !paymentId)) {
        return response(400, { error: "Tutor and payment/enrollment context are required." });
      }
      const tutorSnap = await adminDb.collection("users").doc(tutorId).get();
      if (!tutorSnap.exists) return response(404, { error: "Selected tutor account was not found." });
      const tutor = tutorSnap.data() || {}, tutorRole = normaliseRole(tutor.role);
      if (!isActiveRecord(tutor) || !["tutor", "staff"].includes(tutorRole)) {
        return response(400, { error: "Only active tutor/staff accounts can be assigned." });
      }
      let resolvedPaymentId = paymentId, resolvedEnrollmentId = enrollmentRequestId, studentId = String(body.studentId || "").trim();
      if (!resolvedPaymentId && resolvedEnrollmentId) {
        const enrollment = await adminDb.collection("enrollment_requests").doc(resolvedEnrollmentId).get();
        if (!enrollment.exists) return response(404, { error: "Enrollment request was not found." });
        resolvedPaymentId = String(enrollment.data()?.paymentReference || "").trim();
        studentId = studentId || String(enrollment.data()?.studentId || "").trim();
      }
      if (!resolvedPaymentId) return response(400, { error: "The selected enrollment does not have a recorded payment yet." });

      const paymentRef = adminDb.collection("payments").doc(resolvedPaymentId);
      const enrollmentRef = resolvedEnrollmentId ? adminDb.collection("enrollment_requests").doc(resolvedEnrollmentId) : null;

      let alreadyAssigned = false;
      let reassignedFrom: string | null = null;
      let studentNameForNotification = "A student";

      await adminDb.runTransaction(async transaction => {
        const paymentSnap = await transaction.get(paymentRef);
        if (!paymentSnap.exists) throw new Error("PAYMENT_NOT_FOUND");
        const payment = paymentSnap.data() || {};
        studentId = studentId || String(payment.studentId || "").trim();
        studentNameForNotification = String(payment.enrollmentStudentName || payment.studentName || "A student");

        const existingTutorId = String(payment.tutorId || "").trim();
        const wasWalletCredited = Boolean(payment.walletCredited);
        const allocatedAmount = Number(payment.tutorPayoutRate || payment.walletCreditedAmount || extractPaymentBaseAmountNaira(payment));
        const isPaid = isSuccessfulPaymentRecord(payment);

        if (existingTutorId === tutorId && wasWalletCredited) {
          alreadyAssigned = true;
          return;
        }

        const studentTargets = studentId
          ? ["individualStudents", "students"].map(col => adminDb.collection(col).doc(studentId))
          : [];
        const targetSnaps = await Promise.all(studentTargets.map(ref => transaction.get(ref)));

        let previousWalletSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        if (existingTutorId && existingTutorId !== tutorId && wasWalletCredited && allocatedAmount > 0) {
          previousWalletSnap = await transaction.get(adminDb.collection("staffWallets").doc(existingTutorId));
        }

        // If reassigning from a previous tutor whose wallet was already credited, reverse their credit safely
        if (existingTutorId && existingTutorId !== tutorId && wasWalletCredited && allocatedAmount > 0 && previousWalletSnap) {
          const prevData = previousWalletSnap.exists ? previousWalletSnap.data() || {} : {};
          const prevAvail = Number(prevData.availableBalance || 0);
          if (prevAvail < allocatedAmount) {
            throw new Error("PREVIOUS_TUTOR_INSUFFICIENT_BALANCE_FOR_REASSIGNMENT");
          }
          reassignedFrom = existingTutorId;
          transaction.set(adminDb.collection("staffWallets").doc(existingTutorId), {
            availableBalance: Number((prevAvail - allocatedAmount).toFixed(2)),
            lifetimeEarned: Number(Math.max(0, Number(prevData.lifetimeEarned || 0) - allocatedAmount).toFixed(2)),
            updatedAt: new Date()
          }, { merge: true });
        }

        const willCreditNewTutor = isPaid && allocatedAmount > 0 && (!wasWalletCredited || existingTutorId !== tutorId);

        transaction.update(paymentRef, {
          tutorId,
          tutorName: tutor.name || tutor.displayName || tutor.email || tutorId,
          tutorEmail: tutor.email || "",
          previousTutorId: existingTutorId && existingTutorId !== tutorId ? existingTutorId : (payment.previousTutorId || null),
          tutorAssignedAt: new Date(),
          tutorAssignedBy: decoded.uid,
          walletCredited: willCreditNewTutor ? true : wasWalletCredited,
          walletCreditedAmount: willCreditNewTutor ? allocatedAmount : (payment.walletCreditedAmount || 0)
        });

        if (enrollmentRef) {
          transaction.set(enrollmentRef, {
            tutorId,
            tutorName: tutor.name || tutor.displayName || tutor.email || tutorId,
            tutorEmail: tutor.email || "",
            assignedAt: new Date(),
            assignedBy: decoded.uid
          }, { merge: true });
        }

        targetSnaps.forEach(snap => {
          if (snap.exists) {
            transaction.set(snap.ref, {
              tutorId,
              assignedTutorId: tutorId,
              assignedTutorName: tutor.name || tutor.displayName || tutor.email || tutorId,
              portalAccessEnabled: true,
              updatedAt: new Date()
            }, { merge: true });
          }
        });

        if (willCreditNewTutor) {
          transaction.set(adminDb.collection("staffWallets").doc(tutorId), {
            availableBalance: FieldValue.increment(allocatedAmount),
            lifetimeEarned: FieldValue.increment(allocatedAmount),
            updatedAt: new Date()
          }, { merge: true });
        }
      });

      if (alreadyAssigned) {
        return response(200, { assigned: true, alreadyAssigned: true, tutorId, studentId: studentId || null });
      }

      await createPortalNotification({
        recipientId: tutorId,
        email: tutor.email,
        title: reassignedFrom ? "Student reassigned to you" : "New student assignment",
        message: `${studentNameForNotification} has been assigned to you. Their paid plan and teaching details are available in your staff dashboard.`,
        type: "STUDENT_ASSIGNMENT",
        data: { studentId, paymentId: resolvedPaymentId, enrollmentRequestId: resolvedEnrollmentId || null, reassignedFrom }
      });
      return response(200, { assigned: true, tutorId, reassignedFrom, studentId: studentId || null });
    }

    // Idempotent server-side internal wallet transfer to a tutor
    if (action === "transfer_to_tutor") {
      const tutorId = String(body.tutorId || "").trim();
      const amount = Number(String(body.amount ?? 0).replace(/[^0-9.]/g, ""));
      const description = String(body.description || "Tutor Teaching Settlement & Allocation").trim();
      const studentId = body.studentId ? String(body.studentId).trim() : null;
      const studentName = body.studentName ? String(body.studentName).trim() : null;
      const reference = String(body.reference || `TRF-${Date.now()}`).trim();

      if (!tutorId || !Number.isFinite(amount) || amount <= 0) {
        return response(400, { error: "Valid tutor and positive transfer amount are required." });
      }

      const tutorSnap = await adminDb.collection("users").doc(tutorId).get();
      if (!tutorSnap.exists) return response(404, { error: "Selected tutor account was not found." });
      const tutor = tutorSnap.data() || {};
      const tutorRole = normaliseRole(tutor.role);
      if (!isActiveRecord(tutor) || !["tutor", "staff"].includes(tutorRole)) {
        return response(400, { error: "Transfers can only be made to active tutor or staff accounts." });
      }

      const paymentRef = adminDb.collection("payments").doc(reference);
      const walletRef = adminDb.collection("staffWallets").doc(tutorId);
      const nowIso = new Date().toISOString();
      const tutorDisplayName = String(tutor.name || tutor.fullName || tutor.displayName || tutor.email || tutorId);

      await adminDb.runTransaction(async transaction => {
        const existingSnap = await transaction.get(paymentRef);
        if (existingSnap.exists) {
          throw new Error("DUPLICATE_PAYMENT_REFERENCE");
        }
        transaction.create(paymentRef, {
          reference,
          type: "transfer_to",
          tutorId,
          staffId: tutorId,
          tutorName: tutorDisplayName,
          tutorEmail: tutor.email || "",
          studentId,
          studentName,
          plan: description,
          description,
          baseAmount: amount,
          customerTotal: amount,
          amount,
          amountInNaira: true,
          transactionFee: 0,
          status: "PAID",
          paymentMethod: "internal_wallet_transfer",
          paidAt: nowIso,
          createdAt: nowIso,
          recordedBy: decoded.uid,
          walletCredited: true,
          walletCreditedAmount: amount
        });
        transaction.set(walletRef, {
          staffId: tutorId,
          staffName: tutorDisplayName,
          availableBalance: FieldValue.increment(amount),
          lifetimeEarned: FieldValue.increment(amount),
          updatedAt: nowIso
        }, { merge: true });
      });

      return response(200, { transferred: true, reference, tutorId, amount });
    }

    // Non-overwriting offline payment recording with partial payment support
    if (action === "record_offline_payment") {
      const targetType = String(body.targetType || "SCHOOL").toUpperCase();
      const payAmount = Number(String(body.amount ?? 0).replace(/[^0-9.]/g, ""));
      const rawReference = String(body.reference || "").trim();
      const txRef = rawReference || `OFFLINE-${Date.now()}`;
      const paymentMethod = String(body.paymentMethod || "bank_transfer").trim();
      const paymentDateIso = body.paymentDate ? new Date(String(body.paymentDate)).toISOString() : new Date().toISOString();
      const notes = String(body.notes || "").trim();

      if (!Number.isFinite(payAmount) || payAmount <= 0) {
        return response(400, { error: "Enter a valid offline payment amount greater than 0." });
      }
      if (!txRef) {
        return response(400, { error: "A unique payment reference is required." });
      }

      const paymentRef = adminDb.collection("payments").doc(txRef);
      let resultingStatus = "PAID";
      let resultingRemainingBalance = 0;

      if (targetType === "SCHOOL") {
        const schoolId = String(body.schoolId || "").trim();
        if (!schoolId) return response(400, { error: "School ID is required for school offline payments." });
        const schoolRef = adminDb.collection("schools").doc(schoolId);

        await adminDb.runTransaction(async transaction => {
          const [existingPaymentSnap, schoolSnap] = await Promise.all([
            transaction.get(paymentRef),
            transaction.get(schoolRef)
          ]);
          if (existingPaymentSnap.exists) {
            throw new Error("DUPLICATE_PAYMENT_REFERENCE");
          }
          if (!schoolSnap.exists) {
            throw new Error("SCHOOL_NOT_FOUND");
          }
          const schoolData = schoolSnap.data() || {};
          const existingBilling = schoolData.billing || {};
          const cycle = String(body.cycle || existingBilling.cycle || "termly").toLowerCase();
          const durationWeeks = cycle === "termly" ? 12 : 4;
          const paidDateObj = new Date(paymentDateIso);
          const nextDueObj = new Date(paidDateObj.getTime() + durationWeeks * 7 * 24 * 60 * 60 * 1000);
          const nextDueDateIso = body.nextDueDate ? new Date(String(body.nextDueDate)).toISOString() : nextDueObj.toISOString();

          const contractBase = Number(existingBilling.baseAmount || body.contractAmount || payAmount);
          const wasPartial = isPartiallyPaidStatus(existingBilling.status);
          const prevPaid = wasPartial
            ? Math.max(0, Number(existingBilling.amountPaid || (contractBase - Number(existingBilling.remainingBalance || contractBase))))
            : 0;
          const cumulativePaid = Number((prevPaid + payAmount).toFixed(2));
          const remaining = contractBase > 0 ? Number(Math.max(0, contractBase - cumulativePaid).toFixed(2)) : 0;
          resultingRemainingBalance = remaining;
          resultingStatus = remaining > 0 ? "PARTIALLY_PAID" : "PAID";

          const schoolName = String(schoolData.name || schoolData.schoolName || body.schoolName || "Partner School");
          const paymentRecord = {
            id: txRef,
            reference: txRef,
            schoolId,
            schoolName,
            studentName: schoolName,
            email: schoolData.email || body.email || "",
            role: "school",
            planId: existingBilling.planId || "school_offline_settlement",
            plan: `Institutional Settlement (${cycle === "termly" ? "Termly" : "Monthly"})${remaining > 0 ? " - Partial" : ""}`,
            description: notes || `Offline ${paymentMethod.replace("_", " ")} settlement for ${schoolName}`,
            baseAmount: payAmount,
            fullContractAmount: contractBase,
            remainingBalance: remaining,
            transactionFee: 0,
            customerTotal: payAmount,
            amount: payAmount,
            amountInNaira: true,
            currency: "NGN",
            status: resultingStatus,
            paymentStatus: resultingStatus,
            paymentMethod,
            cycle,
            durationWeeks,
            paidAt: paymentDateIso,
            createdAt: new Date().toISOString(),
            paidThrough: nextDueDateIso,
            nextDueDate: nextDueDateIso,
            recordedBy: decoded.uid,
            recordedOffline: true,
            notes
          };

          transaction.create(paymentRef, paymentRecord);

          const updatedBilling = {
            ...existingBilling,
            baseAmount: contractBase > 0 ? contractBase : payAmount,
            amountPaid: cumulativePaid,
            remainingBalance: remaining,
            cycle,
            status: resultingStatus,
            lastPaidAt: paymentDateIso,
            paidThrough: nextDueDateIso,
            nextDueDate: nextDueDateIso,
            updatedAt: new Date().toISOString(),
            updatedBy: decoded.uid
          };

          transaction.set(schoolRef, {
            billing: updatedBilling,
            paymentStatus: resultingStatus,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        });

        return response(200, { recorded: true, reference: txRef, status: resultingStatus, remainingBalance: resultingRemainingBalance });
      } else {
        const studentId = String(body.studentId || "").trim();
        if (!studentId) return response(400, { error: "Student ID is required for student offline payments." });

        await adminDb.runTransaction(async transaction => {
          const indRef = adminDb.collection("individualStudents").doc(studentId);
          const stdRef = adminDb.collection("students").doc(studentId);
          const [existingPaymentSnap, indSnap, stdSnap] = await Promise.all([
            transaction.get(paymentRef),
            transaction.get(indRef),
            transaction.get(stdRef)
          ]);

          if (existingPaymentSnap.exists) {
            throw new Error("DUPLICATE_PAYMENT_REFERENCE");
          }
          const studentDoc = indSnap.exists ? indSnap.data() || {} : stdSnap.exists ? stdSnap.data() || {} : null;
          if (!studentDoc) {
            throw new Error("STUDENT_NOT_FOUND");
          }

          const contractFee = Number(studentDoc.tuitionFee ?? studentDoc.fee ?? studentDoc.amount ?? body.contractAmount ?? payAmount);
          const wasPartial = isPartiallyPaidStatus(studentDoc.paymentStatus ?? studentDoc.status);
          const prevPaid = wasPartial
            ? Math.max(0, Number(studentDoc.amountPaid || (contractFee - Number(studentDoc.remainingBalance || contractFee))))
            : 0;
          const cumulativePaid = Number((prevPaid + payAmount).toFixed(2));
          const remaining = contractFee > 0 ? Number(Math.max(0, contractFee - cumulativePaid).toFixed(2)) : 0;
          resultingRemainingBalance = remaining;
          resultingStatus = remaining > 0 ? "PARTIALLY_PAID" : "PAID";

          const cycle = String(body.cycle || studentDoc.cycle || "monthly").toLowerCase();
          const durationWeeks = cycle === "termly" ? 12 : cycle === "weekly" ? 1 : 4;
          const paidDateObj = new Date(paymentDateIso);
          const nextDueObj = new Date(paidDateObj.getTime() + durationWeeks * 7 * 24 * 60 * 60 * 1000);
          const nextDueDateIso = body.nextDueDate ? new Date(String(body.nextDueDate)).toISOString() : nextDueObj.toISOString();

          const resolvedTutorId = String(
            body.tutorId ||
            studentDoc.tutorId ||
            studentDoc.staffId ||
            studentDoc.assignedTutorId ||
            studentDoc.assignedStaffId ||
            studentDoc.instructorId ||
            ""
          ).trim();
          const resolvedTutorName = String(body.tutorName || studentDoc.tutorName || studentDoc.assignedTutorName || "").trim();
          const resolvedParentId = String(body.parentId || studentDoc.parentId || studentDoc.parentUid || "").trim();
          const studentName = String(studentDoc.fullName || studentDoc.studentName || studentDoc.name || body.studentName || "Student");
          const planName = String(body.planName || studentDoc.programName || studentDoc.plan || studentDoc.course || "Private Tuition");

          const paymentRecord = {
            id: txRef,
            reference: txRef,
            studentId,
            studentName,
            parentId: resolvedParentId || null,
            parentName: body.parentName || studentDoc.parentName || "",
            email: studentDoc.parentEmail || studentDoc.email || body.email || "",
            role: "parent",
            planId: studentDoc.programId || "private_tuition",
            plan: `${planName}${remaining > 0 ? " (Partial Payment)" : ""}`,
            description: notes || `Direct Bank Transfer (${cycle}) for ${studentName}`,
            baseAmount: payAmount,
            fullContractAmount: contractFee,
            remainingBalance: remaining,
            transactionFee: 0,
            customerTotal: payAmount,
            amount: payAmount,
            amountInNaira: true,
            currency: "NGN",
            status: resultingStatus,
            paymentStatus: resultingStatus,
            paymentMethod,
            cycle,
            durationWeeks,
            tutorId: resolvedTutorId || null,
            tutorName: resolvedTutorName || null,
            paidAt: paymentDateIso,
            createdAt: new Date().toISOString(),
            paidThrough: nextDueDateIso,
            nextDueDate: nextDueDateIso,
            recordedBy: decoded.uid,
            recordedOffline: true,
            walletCredited: Boolean(resolvedTutorId && payAmount > 0),
            walletCreditedAmount: resolvedTutorId ? payAmount : 0
          };

          transaction.create(paymentRef, paymentRecord);

          const studentUpdate = {
            tuitionFee: contractFee > 0 ? contractFee : payAmount,
            amount: contractFee > 0 ? contractFee : payAmount,
            amountPaid: cumulativePaid,
            remainingBalance: remaining,
            cycle,
            paymentStatus: resultingStatus,
            status: resultingStatus === "PAID" ? "ACTIVE" : "PARTIALLY_PAID",
            lastPaidAt: paymentDateIso,
            nextDueDate: nextDueDateIso,
            paidThrough: nextDueDateIso,
            lastPaymentReference: txRef,
            ...(resolvedTutorId ? { tutorId: resolvedTutorId, assignedTutorId: resolvedTutorId } : {}),
            ...(resolvedTutorName ? { tutorName: resolvedTutorName, assignedTutorName: resolvedTutorName } : {}),
            updatedAt: new Date().toISOString()
          };

          if (indSnap.exists) transaction.set(indRef, studentUpdate, { merge: true });
          if (stdSnap.exists) transaction.set(stdRef, studentUpdate, { merge: true });

          if (resolvedTutorId && payAmount > 0) {
            transaction.set(adminDb.collection("staffWallets").doc(resolvedTutorId), {
              availableBalance: FieldValue.increment(payAmount),
              lifetimeEarned: FieldValue.increment(payAmount),
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        });

        return response(200, { recorded: true, reference: txRef, status: resultingStatus, remainingBalance: resultingRemainingBalance });
      }
    }

    // =========================================================================
    // PART 6: RECORD MANUAL PAYMENT (Authoritative, Audited, Full/Partial)
    // =========================================================================
    if (action === "record_manual_payment") {
      const targetTypeRaw = String(body.targetType || "SCHOOL").trim().toUpperCase();
      const targetType = (
        ["SCHOOL", "PARENT", "INDIVIDUAL_STUDENT", "PROGRAMME_ENROLLMENT"].includes(targetTypeRaw)
          ? targetTypeRaw
          : "SCHOOL"
      ) as ManualPaymentTargetType;
      const targetId = String(
        body.targetId || body.schoolId || body.parentId || body.studentId || body.programmeEnrollmentId || ""
      ).trim();
      const payAmount = Number(String(body.amount ?? 0).replace(/[^0-9.]/g, ""));
      const rawRef = String(body.reference || "").trim();
      const reference = rawRef || `MAN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const paymentMethod = String(body.paymentMethod || "bank_transfer").trim();
      const paymentDateIso = body.paymentDate ? new Date(String(body.paymentDate)).toISOString() : new Date().toISOString();
      const notes = String(body.notes || "").trim();
      const proofUrl = body.proofUrl ? String(body.proofUrl).trim() : null;
      const childId = String(body.childId || body.studentId || "").trim();
      const feeItemId = body.feeItemId ? String(body.feeItemId).trim() : null;
      const billingCycleId = body.billingCycleId ? String(body.billingCycleId).trim() : null;
      const overrideEffectiveStartAt = body.overrideEffectiveStartAt ? String(body.overrideEffectiveStartAt) : null;

      if (!targetId) return response(400, { error: "Target account ID is required." });
      if (!Number.isFinite(payAmount) || payAmount <= 0) {
        return response(400, { error: "Enter a valid manual payment amount greater than 0." });
      }
      if (proofUrl && !/^https?:\/\//i.test(proofUrl)) {
        return response(400, { error: "Optional payment proof URL must start with http:// or https://." });
      }

      const actorName = String((adminUser as any)?.fullName || (adminUser as any)?.name || email || "Finance Administrator");
      const paymentRef = adminDb.collection("payments").doc(reference);

      let resultSummary: Record<string, any> = {};
      let notifyUid = "";
      let notifyEmail = "";
      let notifyTitle = "Manual Payment Confirmed";
      let notifyBody = "";

      await adminDb.runTransaction(async (transaction) => {
        const existingPaySnap = await transaction.get(paymentRef);
        if (existingPaySnap.exists) {
          throw new Error("DUPLICATE_PAYMENT_REFERENCE");
        }

        if (targetType === "SCHOOL") {
          const schoolRef = adminDb.collection("schools").doc(targetId);
          const subId = `school_${targetId}`;
          const subRef = adminDb.collection("billingSubscriptions").doc(subId);
          const [schoolSnap, subSnap] = await Promise.all([
            transaction.get(schoolRef),
            transaction.get(subRef),
          ]);
          if (!schoolSnap.exists) throw new Error("SCHOOL_NOT_FOUND");
          const sData = schoolSnap.data() || {};
          const existingBilling = sData.billing || {};
          const existingSub = subSnap.exists ? subSnap.data() || {} : null;

          const contractAmount = Number(
            body.contractAmount || existingSub?.amount || existingBilling.baseAmount || payAmount
          );
          const wasPartial =
            isPartiallyPaidStatus(existingSub?.status) || isPartiallyPaidStatus(existingBilling.status);
          const priorPaid = wasPartial
            ? Number(existingSub?.amountPaid ?? existingBilling.amountPaid ?? 0)
            : 0;
          const durationWeeks = resolvePlanDurationWeeks({
            durationWeeks: body.durationWeeks || existingSub?.durationWeeks || existingBilling.durationWeeks,
            cycle: body.cycle || existingSub?.billingCycle || existingBilling.cycle || "termly",
            fallbackWeeks: 12,
          });
          const schoolName = String(sData.schoolName || sData.name || "Partner School");
          const schoolEmail = String(sData.contactEmail || sData.email || body.email || "");

          const computed = computeManualPaymentRecordAndTransition({
            targetType: "SCHOOL",
            targetId,
            accountName: schoolName,
            recipientEmail: schoolEmail,
            schoolId: targetId,
            subscriptionId: subId,
            feeItemId,
            billingCycleId,
            billingResponsibility: "SCHOOL",
            accountType: "SCHOOL",
            planId: String(existingSub?.planId || existingBilling.planId || "school_subscription"),
            planName: String(body.planName || existingSub?.planName || existingBilling.planName || "School Institutional Subscription"),
            amount: payAmount,
            contractAmount,
            priorAmountPaid: priorPaid,
            paymentMethod,
            paymentDate: paymentDateIso,
            reference,
            notes,
            proofUrl,
            cycle: body.cycle || existingBilling.cycle || (durationWeeks >= 12 ? "termly" : "monthly"),
            durationWeeks,
            existingPeriodEndAt: existingSub?.currentPeriodEndAt || existingSub?.nextDueAt || existingBilling.nextDueDate || existingBilling.paidThrough,
            existingGraceEndsAt: existingSub?.graceEndsAt || null,
            overrideEffectiveStartAt,
            verifiedByUid: decoded.uid,
            verifiedByName: actorName,
            verifiedByEmail: email,
          });

          transaction.create(paymentRef, computed.paymentRecord);
          transaction.set(
            subRef,
            buildCanonicalSubscriptionWritePayload({
              id: subId,
              accountType: "SCHOOL",
              accountId: targetId,
              accountName: schoolName,
              recipientEmail: schoolEmail || null,
              schoolId: targetId,
              billingResponsibility: "SCHOOL",
              status: computed.subscriptionPatch.status,
              planId: String(existingSub?.planId || existingBilling.planId || "school_subscription"),
              planName: String(body.planName || existingSub?.planName || existingBilling.planName || "School Institutional Subscription"),
              amount: computed.subscriptionPatch.amount,
              amountPaid: computed.subscriptionPatch.amountPaid,
              remainingBalance: computed.subscriptionPatch.remainingBalance,
              currency: "NGN",
              billingCycle: durationWeeks >= 12 ? "termly" : "monthly",
              durationWeeks,
              currentPeriodStartAt: computed.subscriptionPatch.currentPeriodStartAt,
              currentPeriodEndAt: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueAt: computed.subscriptionPatch.nextDueAt,
              graceEndsAt: computed.subscriptionPatch.graceEndsAt,
              lastSuccessfulPaymentAt: computed.subscriptionPatch.lastSuccessfulPaymentAt,
              lastPaymentReference: reference,
            }),
            { merge: true }
          );
          transaction.set(
            schoolRef,
            {
              billing: {
                ...existingBilling,
                baseAmount: computed.subscriptionPatch.amount,
                amountPaid: computed.subscriptionPatch.amountPaid,
                remainingBalance: computed.subscriptionPatch.remainingBalance,
                status: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
                cycle: durationWeeks >= 12 ? "termly" : "monthly",
                durationWeeks,
                lastPaidAt: paymentDateIso,
                lastPaymentReference: reference,
                paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
                nextDueDate: computed.subscriptionPatch.nextDueAt,
                updatedAt: new Date().toISOString(),
                updatedBy: decoded.uid,
              },
              paymentStatus: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );

          notifyUid = String(sData.adminUid || sData.userId || targetId);
          notifyEmail = schoolEmail;
          notifyBody = `A manual payment of ₦${payAmount.toLocaleString()} (ref: ${reference}) for ${schoolName} has been verified.${computed.isPartial ? ` Remaining balance: ₦${computed.remainingBalance.toLocaleString()}.` : ` Paid through ${formatLagosDate(computed.subscriptionPatch.nextDueAt) || "next cycle"}.`}`;
          resultSummary = {
            reference,
            subscriptionId: subId,
            status: computed.subscriptionPatch.status,
            accessUnlocked: computed.accessUnlocked,
            remainingBalance: computed.remainingBalance,
            nextDueAt: computed.subscriptionPatch.nextDueAt,
          };
        } else if (targetType === "PROGRAMME_ENROLLMENT") {
          const enrollRef = adminDb.collection("programme_enrollments").doc(targetId);
          const subId = `prog_enr_${targetId}`;
          const subRef = adminDb.collection("billingSubscriptions").doc(subId);
          const [enrollSnap, subSnap] = await Promise.all([
            transaction.get(enrollRef),
            transaction.get(subRef),
          ]);
          if (!enrollSnap.exists) throw new Error("PROGRAMME_ENROLLMENT_NOT_FOUND");
          const eData = enrollSnap.data() || {};
          const existingSub = subSnap.exists ? subSnap.data() || {} : null;
          const studentUid = String(eData.studentUid || "");
          const studentDocId = String(eData.studentDocId || studentUid);
          const studentName = String(eData.studentName || "Student");
          const programId = String(eData.programId || "");
          const programTitle = String(eData.programTitle || "Programme");

          const indRef = studentDocId ? adminDb.collection("individualStudents").doc(studentDocId) : null;
          const stdRef = studentDocId ? adminDb.collection("students").doc(studentDocId) : null;
          const [indSnap, stdSnap] = await Promise.all([
            indRef ? transaction.get(indRef) : Promise.resolve(null),
            stdRef ? transaction.get(stdRef) : Promise.resolve(null),
          ]);

          const contractAmount = Number(body.contractAmount || eData.approvedFee || existingSub?.amount || payAmount);
          const priorPaid = Number(eData.amountPaid || existingSub?.amountPaid || 0);
          const durationWeeks = resolvePlanDurationWeeks({
            durationWeeks: body.durationWeeks || eData.durationWeeks || existingSub?.durationWeeks,
            cycle: eData.billingCycle,
            fallbackWeeks: 8,
          });

          const computed = computeManualPaymentRecordAndTransition({
            targetType: "PROGRAMME_ENROLLMENT",
            targetId: studentUid || targetId,
            accountName: studentName,
            recipientEmail: String(eData.studentEmail || body.email || ""),
            studentId: studentDocId,
            studentName,
            programmeEnrollmentId: targetId,
            programmeId: programId || null,
            programmeName: programTitle,
            subscriptionId: subId,
            feeItemId,
            billingCycleId,
            billingResponsibility: "STUDENT_SELF_FUNDED",
            accountType: "STUDENT_SELF_FUNDED_PROGRAMME",
            planId: `prog_enr_${programId || targetId}`,
            planName: programTitle,
            amount: payAmount,
            contractAmount,
            priorAmountPaid: priorPaid,
            allowDepositAccess: Boolean(eData.allowDepositAccess),
            depositAmount: Number(eData.depositAmount || 0),
            paymentMethod,
            paymentDate: paymentDateIso,
            reference,
            notes,
            proofUrl,
            cycle: eData.billingCycle || (durationWeeks >= 12 ? "termly" : "monthly"),
            durationWeeks,
            existingPeriodEndAt: existingSub?.currentPeriodEndAt || eData.paidThrough || eData.nextDueDate,
            existingGraceEndsAt: existingSub?.graceEndsAt || null,
            overrideEffectiveStartAt,
            verifiedByUid: decoded.uid,
            verifiedByName: actorName,
            verifiedByEmail: email,
          });

          transaction.create(paymentRef, computed.paymentRecord);
          transaction.set(
            enrollRef,
            {
              amountPaid: computed.cumulativePaid,
              remainingBalance: computed.remainingBalance,
              paymentStatus: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
              enrollmentStatus: computed.accessUnlocked ? "ACTIVE" : "APPROVED_AWAITING_PAYMENT",
              paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueDate: computed.subscriptionPatch.nextDueAt,
              lastPaymentReference: reference,
              lastPaidAt: paymentDateIso,
              paymentHistory: FieldValue.arrayUnion({
                reference,
                amount: payAmount,
                paymentSource: "MANUAL_ADMIN",
                verificationStatus: "ADMIN_VERIFIED",
                verifiedBy: decoded.uid,
                paidAt: paymentDateIso,
                channel: paymentMethod,
                status: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
              }),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          transaction.set(
            subRef,
            buildCanonicalSubscriptionWritePayload({
              id: subId,
              accountType: "STUDENT_SELF_FUNDED_PROGRAMME",
              accountId: studentUid || targetId,
              accountName: studentName,
              recipientEmail: String(eData.studentEmail || "") || null,
              studentId: studentDocId,
              studentName,
              programmeEnrollmentId: targetId,
              billingResponsibility: "STUDENT_SELF_FUNDED",
              status: computed.subscriptionPatch.status,
              planId: `prog_enr_${programId || targetId}`,
              planName: programTitle,
              programmeId: programId || null,
              programmeName: programTitle,
              amount: computed.subscriptionPatch.amount,
              amountPaid: computed.subscriptionPatch.amountPaid,
              remainingBalance: computed.subscriptionPatch.remainingBalance,
              allowDepositAccess: Boolean(eData.allowDepositAccess),
              depositAmount: Number(eData.depositAmount || 0),
              currency: "NGN",
              billingCycle: String(eData.billingCycle || (durationWeeks >= 12 ? "termly" : "monthly")),
              durationWeeks,
              currentPeriodStartAt: computed.subscriptionPatch.currentPeriodStartAt,
              currentPeriodEndAt: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueAt: computed.subscriptionPatch.nextDueAt,
              graceEndsAt: computed.subscriptionPatch.graceEndsAt,
              lastSuccessfulPaymentAt: computed.subscriptionPatch.lastSuccessfulPaymentAt,
              lastPaymentReference: reference,
            }),
            { merge: true }
          );

          if (computed.accessUnlocked && programId && studentUid) {
            const activationFields = {
              selectedProgramIds: FieldValue.arrayUnion(programId),
              assignedProgramIds: FieldValue.arrayUnion(programId),
              selfFundedProgramIds: FieldValue.arrayUnion(programId),
              enrolledPrograms: FieldValue.arrayUnion(programTitle),
              updatedAt: new Date().toISOString(),
            };
            transaction.set(adminDb.collection("users").doc(studentUid), activationFields, { merge: true });
            if (indRef && indSnap?.exists) transaction.set(indRef, activationFields, { merge: true });
            if (stdRef && stdSnap?.exists) transaction.set(stdRef, activationFields, { merge: true });
          }

          notifyUid = studentUid;
          notifyEmail = String(eData.studentEmail || "");
          notifyBody = `Your manual payment of ₦${payAmount.toLocaleString()} for ${programTitle} (ref: ${reference}) has been verified.`;
          resultSummary = {
            reference,
            subscriptionId: subId,
            status: computed.subscriptionPatch.status,
            accessUnlocked: computed.accessUnlocked,
            remainingBalance: computed.remainingBalance,
            nextDueAt: computed.subscriptionPatch.nextDueAt,
          };
        } else if (targetType === "PARENT") {
          const parentRef = adminDb.collection("users").doc(targetId);
          const effectiveSubId = childId ? `parent_${targetId}_child_${childId}` : `parent_${targetId}`;
          const subRef = adminDb.collection("billingSubscriptions").doc(effectiveSubId);
          const indRef = childId ? adminDb.collection("individualStudents").doc(childId) : null;
          const stdRef = childId ? adminDb.collection("students").doc(childId) : null;

          const [parentSnap, subSnap, indSnap, stdSnap] = await Promise.all([
            transaction.get(parentRef),
            transaction.get(subRef),
            indRef ? transaction.get(indRef) : Promise.resolve(null),
            stdRef ? transaction.get(stdRef) : Promise.resolve(null),
          ]);
          const parentData = parentSnap.exists ? parentSnap.data() || {} : {};
          const existingSub = subSnap.exists ? subSnap.data() || {} : null;
          const childData = indSnap?.exists ? indSnap.data() || {} : stdSnap?.exists ? stdSnap.data() || {} : null;

          const childName = String(
            body.childName || childData?.fullName || childData?.name || existingSub?.studentName || ""
          ).trim();
          const parentName = String(parentData.fullName || parentData.name || body.accountName || "Parent");
          const parentEmail = String(parentData.email || body.email || "");
          const planName = String(
            body.planName || childData?.programName || childData?.plan || existingSub?.planName || "Family Programme Tuition"
          );
          const contractAmount = Number(
            body.contractAmount ||
              existingSub?.amount ||
              childData?.tuitionFee ||
              childData?.fee ||
              parentData.billing?.baseAmount ||
              payAmount
          );
          const wasPartial =
            isPartiallyPaidStatus(existingSub?.status) ||
            isPartiallyPaidStatus(childData?.paymentStatus || parentData.billing?.status);
          const priorPaid = wasPartial
            ? Number(existingSub?.amountPaid ?? childData?.amountPaid ?? parentData.billing?.amountPaid ?? 0)
            : 0;
          const durationWeeks = resolvePlanDurationWeeks({
            durationWeeks: body.durationWeeks || existingSub?.durationWeeks || childData?.durationWeeks || parentData.billing?.durationWeeks,
            cycle: body.cycle || existingSub?.billingCycle || parentData.billing?.cycle || "monthly",
            fallbackWeeks: 4,
          });

          const computed = computeManualPaymentRecordAndTransition({
            targetType: "PARENT",
            targetId,
            accountName: childName || parentName,
            recipientEmail: parentEmail,
            parentId: targetId,
            studentId: childId || null,
            studentName: childName || null,
            programmeName: planName,
            planName,
            subscriptionId: effectiveSubId,
            feeItemId,
            billingCycleId,
            billingResponsibility: "PARENT",
            accountType: childId ? "PARENT_CHILD" : "PARENT",
            amount: payAmount,
            contractAmount,
            priorAmountPaid: priorPaid,
            paymentMethod,
            paymentDate: paymentDateIso,
            reference,
            notes,
            proofUrl,
            cycle: body.cycle || (durationWeeks >= 12 ? "termly" : "monthly"),
            durationWeeks,
            existingPeriodEndAt:
              existingSub?.currentPeriodEndAt ||
              existingSub?.nextDueAt ||
              childData?.nextDueDate ||
              childData?.paidThrough ||
              parentData.billing?.nextDueDate,
            existingGraceEndsAt: existingSub?.graceEndsAt || null,
            overrideEffectiveStartAt,
            verifiedByUid: decoded.uid,
            verifiedByName: actorName,
            verifiedByEmail: email,
          });

          transaction.create(paymentRef, computed.paymentRecord);
          transaction.set(
            subRef,
            buildCanonicalSubscriptionWritePayload({
              id: effectiveSubId,
              accountType: childId ? "PARENT_CHILD" : "PARENT",
              accountId: childId || targetId,
              accountName: childName || parentName,
              recipientEmail: parentEmail || null,
              parentId: targetId,
              studentId: childId || null,
              studentName: childName || null,
              billingResponsibility: "PARENT",
              status: computed.subscriptionPatch.status,
              planName,
              programmeName: planName,
              amount: computed.subscriptionPatch.amount,
              amountPaid: computed.subscriptionPatch.amountPaid,
              remainingBalance: computed.subscriptionPatch.remainingBalance,
              currency: "NGN",
              billingCycle: durationWeeks >= 12 ? "termly" : "monthly",
              durationWeeks,
              currentPeriodStartAt: computed.subscriptionPatch.currentPeriodStartAt,
              currentPeriodEndAt: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueAt: computed.subscriptionPatch.nextDueAt,
              graceEndsAt: computed.subscriptionPatch.graceEndsAt,
              lastSuccessfulPaymentAt: computed.subscriptionPatch.lastSuccessfulPaymentAt,
              lastPaymentReference: reference,
            }),
            { merge: true }
          );

          if (childId) {
            const childPatch = {
              amountPaid: computed.subscriptionPatch.amountPaid,
              remainingBalance: computed.subscriptionPatch.remainingBalance,
              paymentStatus: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
              status: computed.accessUnlocked ? "ACTIVE" : "PARTIALLY_PAID",
              lastPaidAt: paymentDateIso,
              lastPaymentReference: reference,
              paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueDate: computed.subscriptionPatch.nextDueAt,
              updatedAt: new Date().toISOString(),
            };
            if (indRef && indSnap?.exists) transaction.set(indRef, childPatch, { merge: true });
            if (stdRef && stdSnap?.exists) transaction.set(stdRef, childPatch, { merge: true });
          } else {
            transaction.set(
              parentRef,
              {
                billing: {
                  ...(parentData.billing || {}),
                  baseAmount: computed.subscriptionPatch.amount,
                  amountPaid: computed.subscriptionPatch.amountPaid,
                  remainingBalance: computed.subscriptionPatch.remainingBalance,
                  status: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
                  lastPaidAt: paymentDateIso,
                  lastPaymentReference: reference,
                  paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
                  nextDueDate: computed.subscriptionPatch.nextDueAt,
                  updatedAt: new Date().toISOString(),
                },
              },
              { merge: true }
            );
          }

          notifyUid = targetId;
          notifyEmail = parentEmail;
          notifyBody = `Manual payment of ₦${payAmount.toLocaleString()} for ${childName || "your family account"} (ref: ${reference}) has been verified.`;
          resultSummary = {
            reference,
            subscriptionId: effectiveSubId,
            status: computed.subscriptionPatch.status,
            accessUnlocked: computed.accessUnlocked,
            remainingBalance: computed.remainingBalance,
            nextDueAt: computed.subscriptionPatch.nextDueAt,
          };
        } else {
          // INDIVIDUAL_STUDENT
          const userRef = adminDb.collection("users").doc(targetId);
          const indRef = adminDb.collection("individualStudents").doc(childId || targetId);
          const stdRef = adminDb.collection("students").doc(childId || targetId);
          const subId = `student_${targetId}`;
          const subRef = adminDb.collection("billingSubscriptions").doc(subId);

          const [uSnap, indSnap, stdSnap, subSnap] = await Promise.all([
            transaction.get(userRef),
            transaction.get(indRef),
            transaction.get(stdRef),
            transaction.get(subRef),
          ]);
          const uData = uSnap.exists ? uSnap.data() || {} : {};
          const sData = indSnap.exists ? indSnap.data() || {} : stdSnap.exists ? stdSnap.data() || {} : {};
          const existingSub = subSnap.exists ? subSnap.data() || {} : null;

          const studentName = String(uData.fullName || uData.name || sData.fullName || sData.name || body.accountName || "Student");
          const studentEmail = String(uData.email || sData.email || body.email || "");
          const planName = String(body.planName || sData.programName || sData.plan || existingSub?.planName || "Individual Student Subscription");
          const contractAmount = Number(
            body.contractAmount || existingSub?.amount || uData.billing?.baseAmount || sData.tuitionFee || sData.fee || payAmount
          );
          const wasPartial =
            isPartiallyPaidStatus(existingSub?.status) || isPartiallyPaidStatus(uData.billing?.status || sData.paymentStatus);
          const priorPaid = wasPartial
            ? Number(existingSub?.amountPaid ?? uData.billing?.amountPaid ?? sData.amountPaid ?? 0)
            : 0;
          const durationWeeks = resolvePlanDurationWeeks({
            durationWeeks: body.durationWeeks || existingSub?.durationWeeks || uData.billing?.durationWeeks || sData.durationWeeks,
            cycle: body.cycle || existingSub?.billingCycle || uData.billing?.cycle || "monthly",
            fallbackWeeks: 4,
          });

          const computed = computeManualPaymentRecordAndTransition({
            targetType: "INDIVIDUAL_STUDENT",
            targetId,
            accountName: studentName,
            recipientEmail: studentEmail,
            studentId: childId || String(uData.studentDocId || targetId),
            studentName,
            planName,
            programmeName: planName,
            subscriptionId: subId,
            feeItemId,
            billingCycleId,
            billingResponsibility: "STUDENT",
            accountType: "INDIVIDUAL_STUDENT",
            amount: payAmount,
            contractAmount,
            priorAmountPaid: priorPaid,
            paymentMethod,
            paymentDate: paymentDateIso,
            reference,
            notes,
            proofUrl,
            cycle: body.cycle || (durationWeeks >= 12 ? "termly" : "monthly"),
            durationWeeks,
            existingPeriodEndAt:
              existingSub?.currentPeriodEndAt ||
              existingSub?.nextDueAt ||
              uData.billing?.nextDueDate ||
              sData.nextDueDate ||
              sData.paidThrough,
            existingGraceEndsAt: existingSub?.graceEndsAt || null,
            overrideEffectiveStartAt,
            verifiedByUid: decoded.uid,
            verifiedByName: actorName,
            verifiedByEmail: email,
          });

          transaction.create(paymentRef, computed.paymentRecord);
          transaction.set(
            subRef,
            buildCanonicalSubscriptionWritePayload({
              id: subId,
              accountType: "INDIVIDUAL_STUDENT",
              accountId: targetId,
              accountName: studentName,
              recipientEmail: studentEmail || null,
              studentId: childId || String(uData.studentDocId || targetId),
              studentName,
              billingResponsibility: "STUDENT",
              status: computed.subscriptionPatch.status,
              planName,
              programmeName: planName,
              amount: computed.subscriptionPatch.amount,
              amountPaid: computed.subscriptionPatch.amountPaid,
              remainingBalance: computed.subscriptionPatch.remainingBalance,
              currency: "NGN",
              billingCycle: durationWeeks >= 12 ? "termly" : "monthly",
              durationWeeks,
              currentPeriodStartAt: computed.subscriptionPatch.currentPeriodStartAt,
              currentPeriodEndAt: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueAt: computed.subscriptionPatch.nextDueAt,
              graceEndsAt: computed.subscriptionPatch.graceEndsAt,
              lastSuccessfulPaymentAt: computed.subscriptionPatch.lastSuccessfulPaymentAt,
              lastPaymentReference: reference,
            }),
            { merge: true }
          );

          const billingPatch = {
            ...(uData.billing || {}),
            baseAmount: computed.subscriptionPatch.amount,
            amountPaid: computed.subscriptionPatch.amountPaid,
            remainingBalance: computed.subscriptionPatch.remainingBalance,
            status: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
            lastPaidAt: paymentDateIso,
            lastPaymentReference: reference,
            paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
            nextDueDate: computed.subscriptionPatch.nextDueAt,
            updatedAt: new Date().toISOString(),
          };
          if (uSnap.exists) transaction.set(userRef, { billing: billingPatch, updatedAt: new Date().toISOString() }, { merge: true });
          const studentDocPatch = {
            amountPaid: computed.subscriptionPatch.amountPaid,
            remainingBalance: computed.subscriptionPatch.remainingBalance,
            paymentStatus: computed.isPartial ? "PARTIALLY_PAID" : "PAID",
            status: computed.accessUnlocked ? "ACTIVE" : "PARTIALLY_PAID",
            lastPaidAt: paymentDateIso,
            lastPaymentReference: reference,
            paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
            nextDueDate: computed.subscriptionPatch.nextDueAt,
            updatedAt: new Date().toISOString(),
          };
          if (indSnap.exists) transaction.set(indRef, studentDocPatch, { merge: true });
          if (stdSnap.exists) transaction.set(stdRef, studentDocPatch, { merge: true });

          notifyUid = targetId;
          notifyEmail = studentEmail;
          notifyBody = `Your manual payment of ₦${payAmount.toLocaleString()} for ${planName} (ref: ${reference}) has been verified.`;
          resultSummary = {
            reference,
            subscriptionId: subId,
            status: computed.subscriptionPatch.status,
            accessUnlocked: computed.accessUnlocked,
            remainingBalance: computed.remainingBalance,
            nextDueAt: computed.subscriptionPatch.nextDueAt,
          };
        }
      });

      // Immutable admin audit trail
      await adminDb.collection("adminAuditLogs").add({
        action: "RECORD_MANUAL_PAYMENT",
        actorUid: decoded.uid,
        actorEmail: email,
        actorName,
        targetType,
        targetId,
        reference,
        amount: payAmount,
        paymentMethod,
        notes,
        proofUrl,
        resultSummary,
        createdAt: new Date().toISOString(),
      });

      if (resultSummary?.accessUnlocked) {
        await resolvePaymentRestrictionsOnPaymentSuccess({
          targetAccountIds: [targetId, childId].filter(Boolean),
          subscriptionIds: resultSummary?.subscriptionId ? [String(resultSummary.subscriptionId)] : [],
          programmeEnrollmentId: targetType === "PROGRAMME_ENROLLMENT" ? targetId : null,
          paymentReference: reference,
          resolvedByUid: decoded.uid,
        }).catch(() => undefined);
      }

      if (notifyUid) {
        await createPortalNotification({
          recipientId: notifyUid,
          email: notifyEmail || undefined,
          title: notifyTitle,
          message: notifyBody,
          type: "MANUAL_PAYMENT_VERIFIED",
          data: resultSummary,
        }).catch(() => undefined);
      }

      return response(200, { recorded: true, ...resultSummary });
    }

    // =========================================================================
    // PART 9: SUBSCRIPTION GUARDRAILS & OVERRIDES MANAGEMENT
    // =========================================================================
    if (action === "list_subscriptions") {
      const now = new Date();
      const [
        canonicalSnap,
        schoolsSnap,
        usersSnap,
        enrollSnap,
        remindersSnap,
        auditSnap,
        restrictionsSnap,
        restrictionAuditSnap,
      ] = await Promise.all([
        adminDb.collection("billingSubscriptions").limit(1000).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("schools").limit(500).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("users").limit(1000).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("programme_enrollments").where("billingResponsibility", "==", "STUDENT_SELF_FUNDED").limit(500).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("subscriptionReminders").limit(150).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("adminAuditLogs").limit(150).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("accountRestrictions").limit(500).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("restrictionAuditLogs").limit(200).get().catch(() => ({ docs: [] } as any)),
      ]);

      const allRestrictions: AccountRestrictionRecord[] = (restrictionsSnap.docs || [])
        .map((d: any) => ({ restrictionId: d.id, ...(d.data() || {}) }) as AccountRestrictionRecord)
        .sort((a: AccountRestrictionRecord, b: AccountRestrictionRecord) =>
          String(b.appliedAt || "").localeCompare(String(a.appliedAt || ""))
        );

      const activeRestrictionsBySubOrAccount = (sub: BillingSubscriptionRecord): AccountRestrictionRecord[] => {
        return allRestrictions.filter((r) => {
          if (!isRestrictionActiveAt(r, now)) return false;
          if (r.relatedSubscriptionId && r.relatedSubscriptionId === sub.id) return true;
          if (r.targetAccountId && r.targetAccountId === sub.accountId && r.targetAccountType === sub.accountType) {
            return true;
          }
          if (sub.programmeEnrollmentId && r.programmeEnrollmentId === sub.programmeEnrollmentId) return true;
          return false;
        });
      };

      const byId = new Map<string, any>();

      const pushEntry = (sub: BillingSubscriptionRecord, source: "canonical" | "synthesized") => {
        const matchingActive = activeRestrictionsBySubOrAccount(sub);
        const evaluated = evaluateSubscriptionState({
          subscription: sub,
          activeRestrictions: matchingActive,
          now,
        });
        byId.set(sub.id, {
          ...sub,
          source,
          liveStatus: evaluated.status,
          isLocked: evaluated.isLocked,
          isManuallyLocked: evaluated.isManuallyLocked,
          manualLockReason: evaluated.manualLockReason,
          isManuallyUnlocked: evaluated.isManuallyUnlocked,
          restrictionType: evaluated.restrictionType,
          lockReasonCode: evaluated.lockReasonCode,
          lockReasonLabel: evaluated.lockReasonLabel,
          effectiveAtFormatted: evaluated.effectiveAtFormatted,
          expiresAtFormatted: evaluated.expiresAtFormatted,
          hasPaymentRestriction: evaluated.hasPaymentRestriction,
          hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
          activeRestrictions: matchingActive,
          inGracePeriod: evaluated.inGracePeriod,
          isDueSoon: evaluated.isDueSoon,
          isExempt: evaluated.isExempt,
          hasActiveOverride: evaluated.hasActiveOverride,
          overrideExpiresAt: evaluated.overrideExpiresAt,
          billingConfigIncomplete: evaluated.billingConfigIncomplete,
          liveAmountDue: evaluated.amountDue,
          dueDateFormatted: evaluated.dueDateFormatted,
          graceEndsAtFormatted: evaluated.graceEndsAtFormatted,
          daysUntilDue: evaluated.daysUntilDue,
          graceDaysRemaining: evaluated.graceDaysRemaining,
        });
      };

      for (const docSnap of canonicalSnap.docs) {
        const d = { id: docSnap.id, ...(docSnap.data() || {}) } as Record<string, any>;
        const sub = normalizeSubscriptionFromSource({
          id: docSnap.id,
          accountType: (String(d.accountType || "INDIVIDUAL_STUDENT").toUpperCase()) as BillingSubscriptionRecord["accountType"],
          accountId: String(d.accountId || docSnap.id),
          accountName: String(d.accountName || ""),
          recipientEmail: String(d.recipientEmail || ""),
          schoolId: d.schoolId || null,
          parentId: d.parentId || null,
          studentId: d.studentId || null,
          studentName: d.studentName || null,
          programmeEnrollmentId: d.programmeEnrollmentId || null,
          billingResponsibility: d.billingResponsibility || "STUDENT",
          canonicalDoc: d,
        });
        pushEntry(sub, "canonical");
      }

      for (const sDoc of schoolsSnap.docs) {
        const subId = `school_${sDoc.id}`;
        if (byId.has(subId)) continue;
        const s = sDoc.data() || {};
        const sub = normalizeSubscriptionFromSource({
          id: subId,
          accountType: "SCHOOL",
          accountId: sDoc.id,
          accountName: String(s.schoolName || s.name || "Partner School"),
          recipientEmail: String(s.contactEmail || s.email || ""),
          schoolId: sDoc.id,
          billingResponsibility: "SCHOOL",
          legacyBilling: s.billing || null,
          fallbackPlanName: String(s.plan || "School Institutional Partnership"),
        });
        pushEntry(sub, "synthesized");
      }

      for (const uDoc of usersSnap.docs) {
        const u = uDoc.data() || {};
        const r = normaliseRole(u.role);
        if (r === "school") {
          const adminSubId = `school_admin_${uDoc.id}`;
          if (!byId.has(adminSubId)) {
            const sub = normalizeSubscriptionFromSource({
              id: adminSubId,
              accountType: "SCHOOL_ADMIN",
              accountId: uDoc.id,
              accountName: String(u.fullName || u.name || u.email || "School Administrator"),
              recipientEmail: String(u.email || ""),
              schoolId: u.schoolId || null,
              billingResponsibility: "SCHOOL",
              legacyBilling: null,
              fallbackPlanName: String(u.schoolName || "School Administrator Account"),
            });
            pushEntry(sub, "synthesized");
          }
          continue;
        }
        if (!["parent", "student"].includes(r)) continue;
        if (r === "student" && (u.schoolId || u.parentId)) continue;
        const subId = r === "parent" ? `parent_${uDoc.id}` : `student_${uDoc.id}`;
        if (byId.has(subId)) continue;
        const sub = normalizeSubscriptionFromSource({
          id: subId,
          accountType: r === "parent" ? "PARENT" : "INDIVIDUAL_STUDENT",
          accountId: uDoc.id,
          accountName: String(u.fullName || u.name || u.email || "Account"),
          recipientEmail: String(u.email || ""),
          parentId: r === "parent" ? uDoc.id : null,
          studentId: r === "student" ? String(u.studentDocId || uDoc.id) : null,
          studentName: r === "student" ? String(u.fullName || u.name || "") : null,
          billingResponsibility: r === "parent" ? "PARENT" : "STUDENT",
          legacyBilling: u.billing || null,
          fallbackPlanName: r === "parent" ? "Family Plan" : "Student Plan",
        });
        pushEntry(sub, "synthesized");
      }

      for (const eDoc of enrollSnap.docs) {
        const subId = `prog_enr_${eDoc.id}`;
        if (byId.has(subId)) continue;
        const e = eDoc.data() || {};
        if (["REJECTED", "CANCELLED"].includes(String(e.enrollmentStatus || "").toUpperCase())) continue;
        const sub = normalizeSubscriptionFromSource({
          id: subId,
          accountType: "STUDENT_SELF_FUNDED_PROGRAMME",
          accountId: String(e.studentUid || eDoc.id),
          accountName: String(e.studentName || "Student"),
          recipientEmail: String(e.studentEmail || ""),
          studentId: String(e.studentDocId || e.studentUid || ""),
          studentName: String(e.studentName || ""),
          programmeEnrollmentId: eDoc.id,
          billingResponsibility: "STUDENT_SELF_FUNDED",
          legacyBilling: {
            baseAmount: Number(e.approvedFee || 0),
            amountPaid: Number(e.amountPaid || 0),
            remainingBalance: Number(e.remainingBalance ?? e.approvedFee ?? 0),
            status: e.paymentStatus || e.enrollmentStatus,
            nextDueDate: e.nextDueDate || e.paidThrough,
            paidThrough: e.paidThrough,
            durationWeeks: Number(e.durationWeeks || 8),
            planName: String(e.programTitle || "Programme"),
            allowDepositAccess: Boolean(e.allowDepositAccess),
            depositAmount: Number(e.depositAmount || 0),
          },
          fallbackPlanName: String(e.programTitle || "Programme"),
        });
        pushEntry(sub, "synthesized");
      }

      const subscriptions = Array.from(byId.values()).sort((a, b) => {
        const weight = (s: any) =>
          s.isLocked ? 0 : s.inGracePeriod ? 1 : s.isDueSoon ? 2 : s.liveStatus === "PARTIALLY_PAID" ? 3 : 4;
        return weight(a) - weight(b);
      });

      const summary = {
        total: subscriptions.length,
        active: subscriptions.filter((s) => s.liveStatus === "ACTIVE").length,
        dueSoon: subscriptions.filter((s) => s.isDueSoon).length,
        inGracePeriod: subscriptions.filter((s) => s.inGracePeriod).length,
        locked: subscriptions.filter((s) => s.isLocked).length,
        manuallyRestricted: subscriptions.filter((s) => s.isManuallyLocked).length,
        exempt: subscriptions.filter((s) => s.isExempt).length,
        partiallyPaid: subscriptions.filter((s) => s.liveStatus === "PARTIALLY_PAID").length,
        totalOverdueBalance: Number(
          subscriptions
            .filter((s) => s.isLocked || s.inGracePeriod || s.liveStatus === "PARTIALLY_PAID")
            .reduce((sum, s) => sum + Number(s.liveAmountDue || 0), 0)
            .toFixed(2)
        ),
      };

      const reminders = remindersSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a: any, b: any) => String(b.lastAttemptAt || b.sentAt || "").localeCompare(String(a.lastAttemptAt || a.sentAt || "")))
        .slice(0, 60);

      const auditLogs = auditSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 80);

      const restrictionAuditLogs = (restrictionAuditSnap.docs || [])
        .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 100);

      return response(200, {
        summary,
        subscriptions,
        reminders,
        auditLogs,
        restrictions: allRestrictions.slice(0, 200),
        restrictionAuditLogs,
        isSuperAdmin,
      });
    }

    if (action === "apply_subscription_override") {
      const subscriptionId = String(body.subscriptionId || "").trim();
      const reason = String(body.reason || "").trim();
      const active = body.active !== false;
      const startsAt = parseDateSafe(body.startsAt) || new Date();
      const expiresAt = parseDateSafe(body.expiresAt);

      if (!subscriptionId) return response(400, { error: "subscriptionId is required." });
      if (active && (!reason || !expiresAt || expiresAt.getTime() <= startsAt.getTime())) {
        return response(400, { error: "Temporary override requires a reason and a future expiry date." });
      }

      const actorName = String((adminUser as any)?.fullName || (adminUser as any)?.name || email);
      const nowIso = new Date().toISOString();
      const overridePayload = active
        ? {
            active: true,
            reason,
            grantedByUid: decoded.uid,
            grantedByName: actorName,
            grantedAt: nowIso,
            startsAt: startsAt.toISOString(),
            expiresAt: expiresAt!.toISOString(),
          }
        : null;

      await adminDb.collection("billingSubscriptions").doc(subscriptionId).set(
        {
          id: subscriptionId,
          ...(body.accountType ? { accountType: body.accountType } : {}),
          ...(body.accountId ? { accountId: body.accountId } : {}),
          ...(body.accountName ? { accountName: body.accountName } : {}),
          ...(body.billingResponsibility ? { billingResponsibility: body.billingResponsibility } : {}),
          override: overridePayload,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      await adminDb.collection("adminAuditLogs").add({
        action: active ? "SUBSCRIPTION_OVERRIDE_GRANTED" : "SUBSCRIPTION_OVERRIDE_REVOKED",
        actorUid: decoded.uid,
        actorEmail: email,
        actorName,
        targetType: "SUBSCRIPTION",
        targetId: subscriptionId,
        reason: reason || "Revoked override",
        startsAt: active ? startsAt.toISOString() : null,
        expiresAt: active && expiresAt ? expiresAt.toISOString() : null,
        createdAt: nowIso,
      });

      return response(200, { updated: true, subscriptionId, override: overridePayload });
    }

    if (action === "set_subscription_exemption") {
      const subscriptionId = String(body.subscriptionId || "").trim();
      const exempt = Boolean(body.exempt);
      const reason = String(body.reason || "").trim();
      if (!subscriptionId) return response(400, { error: "subscriptionId is required." });
      if (exempt && !reason) return response(400, { error: "An exemption reason is required." });

      const actorName = String((adminUser as any)?.fullName || (adminUser as any)?.name || email);
      const nowIso = new Date().toISOString();
      const exemptionPayload = exempt
        ? {
            exempt: true,
            reason,
            grantedByUid: decoded.uid,
            grantedByName: actorName,
            grantedAt: nowIso,
          }
        : null;

      await adminDb.collection("billingSubscriptions").doc(subscriptionId).set(
        {
          id: subscriptionId,
          ...(body.accountType ? { accountType: body.accountType } : {}),
          ...(body.accountId ? { accountId: body.accountId } : {}),
          ...(body.accountName ? { accountName: body.accountName } : {}),
          ...(body.billingResponsibility ? { billingResponsibility: body.billingResponsibility } : {}),
          exemption: exemptionPayload,
          status: exempt ? "EXEMPT" : "ACTIVE",
          updatedAt: nowIso,
        },
        { merge: true }
      );

      await adminDb.collection("adminAuditLogs").add({
        action: exempt ? "SUBSCRIPTION_EXEMPTION_GRANTED" : "SUBSCRIPTION_EXEMPTION_REMOVED",
        actorUid: decoded.uid,
        actorEmail: email,
        actorName,
        targetType: "SUBSCRIPTION",
        targetId: subscriptionId,
        reason: reason || "Exemption removed",
        createdAt: nowIso,
      });

      return response(200, { updated: true, subscriptionId, exemption: exemptionPayload });
    }

    if (action === "update_subscription_status") {
      const subscriptionId = String(body.subscriptionId || "").trim();
      const nextStatus = String(body.status || "").trim().toUpperCase();
      const reason = String(body.reason || "").trim();
      if (!subscriptionId || !["ACTIVE", "SUSPENDED", "CANCELLED"].includes(nextStatus)) {
        return response(400, { error: "Valid subscriptionId and status (ACTIVE, SUSPENDED, CANCELLED) are required." });
      }
      const actorName = String((adminUser as any)?.fullName || (adminUser as any)?.name || email);
      const nowIso = new Date().toISOString();

      await adminDb.collection("billingSubscriptions").doc(subscriptionId).set(
        {
          id: subscriptionId,
          status: nextStatus,
          ...(body.nextDueAt ? { nextDueAt: new Date(String(body.nextDueAt)).toISOString() } : {}),
          updatedAt: nowIso,
        },
        { merge: true }
      );

      await adminDb.collection("adminAuditLogs").add({
        action: `SUBSCRIPTION_STATUS_${nextStatus}`,
        actorUid: decoded.uid,
        actorEmail: email,
        actorName,
        targetType: "SUBSCRIPTION",
        targetId: subscriptionId,
        reason: reason || `Status updated to ${nextStatus}`,
        createdAt: nowIso,
      });

      return response(200, { updated: true, subscriptionId, status: nextStatus });
    }

    // =========================================================================
    // MANUAL & BULK ADMINISTRATIVE ACCOUNT LOCKING, PREVIEW, LIFTING & AUDIT HISTORY
    // =========================================================================
    if (action === "preview_bulk_lock") {
      const targets = (Array.isArray(body.targets) ? body.targets : []) as BulkLockTargetInput[];
      const preview = await buildBulkLockPreview({
        targets,
        reasonCode: body.reasonCode,
        customReason: body.customReason,
        userFacingMessage: body.userFacingMessage,
        internalAdminNote: body.internalAdminNote,
        restrictionType: body.restrictionType,
        effectiveAt: body.effectiveAt,
        expiresAt: body.expiresAt,
        cascadesToLinkedLearners: body.cascadesToLinkedLearners !== false,
      });

      return response(200, { preview });
    }

    if (action === "apply_bulk_lock") {
      const targets = (Array.isArray(body.targets) ? body.targets : []) as BulkLockTargetInput[];
      if (targets.length === 0) {
        return response(400, { error: "Select at least one account or programme entitlement to restrict." });
      }
      if (body.confirmed !== true) {
        return response(400, { error: "Explicit confirmation is required before applying bulk restrictions." });
      }

      const actorName = String((adminUser as any)?.fullName || (adminUser as any)?.name || email);
      const bulkBatchId = `bulk_${Date.now()}_${randomUUID().slice(0, 8)}`;

      const succeeded: Array<{
        restrictionId: string;
        targetAccountId: string;
        targetAccountType: RestrictionTargetAccountType;
        accountName: string;
        linkedStudentCount: number;
      }> = [];
      const failed: Array<{
        targetKey: string;
        accountName: string;
        error: string;
      }> = [];

      // Deduplicate explicitly selected targets so unselected accounts are never touched
      const seenKeys = new Set<string>();
      for (const rawTarget of targets) {
        const key = `${String(rawTarget.accountType || "").toUpperCase()}:${String(rawTarget.accountId || rawTarget.subscriptionId || "")}:${String(rawTarget.programmeEnrollmentId || "")}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const res = await applyManualRestrictionToTarget({
          target: rawTarget,
          reasonCode: body.reasonCode,
          customReason: body.customReason,
          userFacingMessage: body.userFacingMessage,
          internalAdminNote: body.internalAdminNote,
          restrictionType: body.restrictionType,
          effectiveAt: body.effectiveAt,
          expiresAt: body.expiresAt,
          cascadesToLinkedLearners: body.cascadesToLinkedLearners !== false,
          actorUid: decoded.uid,
          actorEmail: email,
          actorName,
          bulkBatchId,
        });

        if (res.ok) {
          succeeded.push({
            restrictionId: res.record.restrictionId,
            targetAccountId: res.record.targetAccountId,
            targetAccountType: res.record.targetAccountType,
            accountName: res.record.accountName || res.record.targetAccountId,
            linkedStudentCount: res.linkedStudentCount,
          });
        } else {
          failed.push({
            targetKey: res.targetKey,
            accountName: String(rawTarget.accountName || rawTarget.accountId || rawTarget.subscriptionId || "Account"),
            error: res.error,
          });
        }
      }

      // If every single item failed, return 400 with explicit failure list (never silently report success)
      if (succeeded.length === 0 && failed.length > 0) {
        return response(400, {
          error: failed[0].error || "Bulk restriction validation failed.",
          bulkBatchId,
          succeeded,
          failed,
          partialFailure: false,
        });
      }

      return response(200, {
        ok: failed.length === 0,
        partialFailure: failed.length > 0,
        bulkBatchId,
        appliedCount: succeeded.length,
        failedCount: failed.length,
        succeeded,
        failed,
      });
    }

    if (action === "manual_lock_account") {
      const rawAccountType = String(body.accountType || "SCHOOL").trim().toUpperCase();
      const validAccountTypes: RestrictionTargetAccountType[] = [
        "SCHOOL",
        "SCHOOL_ADMIN",
        "PARENT",
        "PARENT_CHILD",
        "INDIVIDUAL_STUDENT",
        "STUDENT_SELF_FUNDED_PROGRAMME",
      ];
      const accountType = (
        validAccountTypes.includes(rawAccountType as RestrictionTargetAccountType)
          ? rawAccountType
          : "SCHOOL"
      ) as RestrictionTargetAccountType;
      const accountId = String(
        body.accountId || body.schoolId || body.parentId || body.studentId || body.programmeEnrollmentId || ""
      ).trim();

      const actorName = String((adminUser as any)?.fullName || (adminUser as any)?.name || email);

      const res = await applyManualRestrictionToTarget({
        target: {
          subscriptionId: String(body.subscriptionId || "").trim() || null,
          accountType,
          accountId,
          accountName: String(body.accountName || "").trim() || null,
          schoolId: String(body.schoolId || "").trim() || null,
          parentId: String(body.parentId || "").trim() || null,
          studentId: String(body.studentId || "").trim() || null,
          programmeEnrollmentId: String(body.programmeEnrollmentId || "").trim() || null,
        },
        reasonCode: body.reasonCode,
        customReason: body.customReason,
        userFacingMessage: body.userFacingMessage,
        internalAdminNote: body.internalAdminNote,
        restrictionType: body.restrictionType,
        effectiveAt: body.effectiveAt,
        expiresAt: body.expiresAt,
        cascadesToLinkedLearners: body.cascadesToLinkedLearners !== false,
        actorUid: decoded.uid,
        actorEmail: email,
        actorName,
      });

      if (!res.ok) {
        return response(400, { error: res.error });
      }

      return response(200, {
        updated: true,
        restrictionId: res.record.restrictionId,
        subscriptionId: res.record.relatedSubscriptionId,
        accountType: res.record.targetAccountType,
        manuallyLocked: true,
        linkedStudentCount: res.linkedStudentCount,
        record: res.record,
      });
    }

    if (action === "manual_unlock_account" || action === "lift_restriction") {
      const rawAccountType = String(body.accountType || "SCHOOL").trim().toUpperCase();
      const validAccountTypes: RestrictionTargetAccountType[] = [
        "SCHOOL",
        "SCHOOL_ADMIN",
        "PARENT",
        "PARENT_CHILD",
        "INDIVIDUAL_STUDENT",
        "STUDENT_SELF_FUNDED_PROGRAMME",
      ];
      const accountType = (
        validAccountTypes.includes(rawAccountType as RestrictionTargetAccountType)
          ? rawAccountType
          : "SCHOOL"
      ) as RestrictionTargetAccountType;
      const accountId = String(
        body.accountId || body.schoolId || body.parentId || body.studentId || body.programmeEnrollmentId || ""
      ).trim();

      const rawMode = String(body.mode || (action === "lift_restriction" ? "LIFT_ONLY" : "AUTO")).trim().toUpperCase();
      const mode = rawMode === "OPEN" ? "OPEN" : rawMode === "AUTO" ? "AUTO" : "LIFT_ONLY";
      const actorName = String((adminUser as any)?.fullName || (adminUser as any)?.name || email);

      const res = await liftManualRestrictions({
        restrictionId: String(body.restrictionId || "").trim() || null,
        subscriptionId: String(body.subscriptionId || "").trim() || null,
        accountType,
        accountId: accountId || null,
        schoolId: String(body.schoolId || "").trim() || null,
        parentId: String(body.parentId || "").trim() || null,
        studentId: String(body.studentId || "").trim() || null,
        programmeEnrollmentId: String(body.programmeEnrollmentId || "").trim() || null,
        unlockReason: body.unlockReason ?? body.reason,
        mode,
        actorUid: decoded.uid,
        actorEmail: email,
        actorName,
      });

      if (!res.ok) {
        return response(400, { error: res.error });
      }

      return response(200, {
        updated: true,
        liftedIds: res.liftedIds,
        remainingActiveRestrictions: res.remainingActiveRestrictions,
        hasRemainingPaymentLock: res.hasRemainingPaymentLock,
        mode,
      });
    }

    if (action === "list_restriction_history") {
      const targetAccountId = String(body.targetAccountId || "").trim();
      const subscriptionId = String(body.subscriptionId || "").trim();

      let restrictionsQuery: any = adminDb.collection("accountRestrictions");
      if (targetAccountId) {
        restrictionsQuery = restrictionsQuery.where("targetAccountId", "==", targetAccountId);
      } else if (subscriptionId) {
        restrictionsQuery = restrictionsQuery.where("relatedSubscriptionId", "==", subscriptionId);
      }

      const [resSnap, logSnap] = await Promise.all([
        restrictionsQuery.limit(200).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection("restrictionAuditLogs").limit(200).get().catch(() => ({ docs: [] } as any)),
      ]);

      const restrictions = (resSnap.docs || [])
        .map((d: any) => ({ restrictionId: d.id, ...(d.data() || {}) }))
        .sort((a: any, b: any) => String(b.appliedAt || "").localeCompare(String(a.appliedAt || "")));

      let auditLogs = (logSnap.docs || [])
        .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

      if (targetAccountId) {
        auditLogs = auditLogs.filter((l: any) => l.targetAccountId === targetAccountId || l.targetId === subscriptionId);
      } else if (subscriptionId) {
        auditLogs = auditLogs.filter((l: any) => l.targetId === subscriptionId || l.relatedSubscriptionId === subscriptionId);
      }

      return response(200, {
        restrictions,
        auditLogs: auditLogs.slice(0, 120),
      });
    }

    return response(400, { error: "Unsupported billing administrator action." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "DUPLICATE_PAYMENT_REFERENCE") {
      return response(409, { error: "A transaction with this reference already exists. Existing transactions cannot be overwritten." });
    }
    if (code === "PAYMENT_NOT_FOUND") {
      return response(404, { error: "Payment record was not found." });
    }
    if (code === "SCHOOL_NOT_FOUND") {
      return response(404, { error: "Partner school record was not found." });
    }
    if (code === "STUDENT_NOT_FOUND") {
      return response(404, { error: "Student record was not found." });
    }
    if (code === "PROGRAMME_ENROLLMENT_NOT_FOUND") {
      return response(404, { error: "Programme enrolment record was not found." });
    }
    if (code === "PREVIOUS_TUTOR_INSUFFICIENT_BALANCE_FOR_REASSIGNMENT") {
      return response(409, { error: "Cannot reassign tutor wallet allocation because the previous tutor has already withdrawn those funds." });
    }
    console.error("Billing administrator action failed:", error);
    const errText = `${code} ${String((error as any)?.code || "")}`.toLowerCase();
    const isAdminInfrastructureFailure =
      errText.includes("firebase admin sdk is not initialized") ||
      errText.includes("could not load the default credentials") ||
      errText.includes("invalid_grant") ||
      errText.includes("decoder routines") ||
      errText.includes("app/no-app") ||
      errText.includes("auth/invalid-credential") ||
      errText.includes("unavailable") ||
      errText.includes("deadline_exceeded");
    if (isAdminInfrastructureFailure) {
      return response(200, { fallback: true, reason: "ADMIN_BACKEND_UNAVAILABLE" });
    }
    return response(500, { error: "Unable to complete this billing administration request." });
  }
};


