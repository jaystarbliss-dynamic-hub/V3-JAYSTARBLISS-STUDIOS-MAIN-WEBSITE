import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
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

      if (targetType === "SCHOOL") {
        await adminDb.collection("schools").doc(targetId).set({
          "billing.lastReminderSentAt": nowIso,
          ...(body.nextDueDate ? { "billing.nextDueDate": String(body.nextDueDate) } : {})
        }, { merge: true });
      } else {
        await adminDb.collection("users").doc(targetId).set({
          "billing.lastReminderSentAt": nowIso,
          ...(body.nextDueDate ? { "billing.nextDueDate": String(body.nextDueDate) } : {})
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
    if (code === "PREVIOUS_TUTOR_INSUFFICIENT_BALANCE_FOR_REASSIGNMENT") {
      return response(409, { error: "Cannot reassign tutor wallet allocation because the previous tutor has already withdrawn those funds." });
    }
    console.error("Billing administrator action failed:", error);
    return response(500, { error: "Unable to complete this billing administration request." });
  }
};


