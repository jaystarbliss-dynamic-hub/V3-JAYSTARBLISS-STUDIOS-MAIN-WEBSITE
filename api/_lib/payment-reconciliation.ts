import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { calculateCustomerCharge, getFeePolicy, getPaymentConfig, normaliseRole } from "./billing";
import { createPortalNotification } from "./email";

const asString = (value: unknown) => String(value ?? "").trim();

export async function reconcileSuccessfulCharge(tx: any, verifiedUserId?: string) {
  const reference = asString(tx.reference);
  const metadata = tx.metadata || {};
  const userId = asString(metadata.userId);
  const requestedRole = asString(metadata.role).toLowerCase();
  const planId = asString(metadata.planId);
  const enrollmentRequestId = asString(metadata.enrollmentRequestId);
  if (!reference || !userId || !planId) throw new Error("PAYMENT_METADATA_INVALID");
  if (verifiedUserId && userId !== verifiedUserId) throw new Error("PAYMENT_OWNER_MISMATCH");

  const config = await getPaymentConfig();
  const userSnapForBilling = await adminDb.collection("users").doc(userId).get();
  const userForBilling = userSnapForBilling.exists ? userSnapForBilling.data() || {} : {};
  let assignedBilling = userForBilling.billing || null;
  if (requestedRole === "school") {
    const assignedSchoolId = asString(userForBilling.schoolId);
    if (assignedSchoolId) {
      const assignedSchoolSnap = await adminDb.collection("schools").doc(assignedSchoolId).get();
      if (assignedSchoolSnap.exists && assignedSchoolSnap.data()?.billing) {
        assignedBilling = assignedSchoolSnap.data()?.billing;
      }
    }
  }

  let plan = config.plans[planId];

  // Admin-assigned billing is authoritative at reconciliation too. This protects
  // against a generic frontend plan ID being paired with an admin-assigned fee.
  if (assignedBilling && Number(assignedBilling.baseAmount) > 0 && String(assignedBilling.status || "ACTIVE").toUpperCase() !== "DISABLED") {
    const cycle = asString(assignedBilling.cycle || "monthly").toLowerCase();
    plan = {
      id: asString(assignedBilling.planId || planId || "assigned_plan"),
      name: asString(assignedBilling.planName || metadata.planName || (requestedRole === "school" ? "Fees/Payments" : "Assigned Tuition Plan")),
      role: requestedRole === "school" ? "school" : "student",
      baseAmount: Number(assignedBilling.baseAmount),
      durationWeeks: cycle === "termly" ? 12 : 4,
      teachingModes: ["Standard Delivery", "Hybrid / Physical"],
      description: "Admin-assigned billing plan",
      active: true
    };
  }

  // Resolve admin-assigned or custom billing plan if not found in static config or marked inactive
  if (!plan || !plan.active) {
    const metadataBase = Number(metadata.baseAmount || 0);
    const txAmountBase = Number(tx.amount || 0) / 100;
    const baseAmount = metadataBase > 0 ? metadataBase : txAmountBase;
    if (baseAmount > 0) {
      plan = {
        id: planId || "assigned_plan",
        name: asString(metadata.planName || metadata.plan || (requestedRole === "school" ? "Institutional Partner Fee" : "Assigned Tuition Plan")),
        role: (requestedRole === "school" || (plan && plan.role === "school")) ? "school" : "student",
        baseAmount,
        durationWeeks: Number(metadata.durationWeeks || (requestedRole === "school" ? 4 : 4)),
        teachingModes: ["Standard Delivery", "Hybrid / Physical"],
        description: "Admin-assigned institutional / tuition plan",
        active: true
      };
    } else if (plan) {
      // If plan existed in config but had active:false, activate it for this assigned payment
      plan = { ...plan, active: true };
    } else {
      throw new Error("PAYMENT_PLAN_INVALID");
    }
  }

  const userSnap = await adminDb.collection("users").doc(userId).get();
  if (!userSnap.exists) throw new Error("PAYMENT_USER_NOT_FOUND");
  const userRecord = userSnap.data() || {};
  const authoritativeRole = normaliseRole(userRecord.role);
  if (requestedRole && requestedRole !== authoritativeRole) throw new Error("PAYMENT_ROLE_MISMATCH");
  const role = authoritativeRole;
  if (!["parent", "school", "student"].includes(role)) throw new Error("PAYMENT_ROLE_INVALID");
  if (role === "school" && plan.role !== "school") throw new Error("PAYMENT_PLAN_ROLE_MISMATCH");
  if (role !== "school" && plan.role !== "student") throw new Error("PAYMENT_PLAN_ROLE_MISMATCH");

  const feeRole = role === "school" ? "school" : "parent";
  const chargePreview = calculateCustomerCharge(plan.baseAmount, getFeePolicy(config, feeRole));
  const providerAmountMinor = Math.round(Number(tx.amount || 0));
  const providerAmount = providerAmountMinor / 100;
  const expectedBaseMinor = Math.round(plan.baseAmount * 100);
  const hasVerifiedGatewayFee = Number.isFinite(Number(tx.fees)) && Number(tx.fees) >= 0;
  const actualTransactionFeeMinor = hasVerifiedGatewayFee ? Math.round(Number(tx.fees)) : 0;
  const actualTransactionFee = hasVerifiedGatewayFee
    ? Number((actualTransactionFeeMinor / 100).toFixed(2))
    : chargePreview.transactionFee;

  // Paystack's verified transaction amount is the amount the customer actually paid.
  // When "pass fees to customers" is enabled, that amount includes the gateway fee.
  // When the merchant absorbs the fee, it equals the configured base fee and tx.fees
  // is deducted by Paystack from settlement. We therefore reconcile in this order:
  //   1. exact base fee (merchant absorbs gateway fee), or
  //   2. base fee + Paystack's own verified fee (customer bears gateway fee).
  // We deliberately do NOT calculate Paystack's fee ourselves for acceptance because
  // the gateway's verified fees value is the source of truth and can vary by channel,
  // account pricing, caps, or education-specific pricing.
  const amountMatchesBase = providerAmountMinor === expectedBaseMinor;
  const amountMatchesBasePlusVerifiedFee =
    hasVerifiedGatewayFee && providerAmountMinor === expectedBaseMinor + actualTransactionFeeMinor;

  if (
    String(tx.status || "").toLowerCase() !== "success" ||
    String(tx.currency || "").toUpperCase() !== "NGN" ||
    (!amountMatchesBase && !amountMatchesBasePlusVerifiedFee)
  ) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }

  // The verified gateway amount is the receipt total.
  const customerTotal = providerAmount;

  // Metadata is informational only at reconciliation. The admin-assigned billing
  // record above is authoritative, so stale frontend metadata must never cause a
  // valid Paystack payment to be rejected.

  const canonicalPaymentRef = adminDb.collection("payments").doc(reference);
  const enrollmentRef = enrollmentRequestId ? adminDb.collection("enrollment_requests").doc(enrollmentRequestId) : null;
  let created = false;
  let paymentData: Record<string, any> = {};

  await adminDb.runTransaction(async transaction => {
    const paymentSnap = await transaction.get(canonicalPaymentRef);
    if (paymentSnap.exists) return;
    const enrollmentSnap = enrollmentRef ? await transaction.get(enrollmentRef) : null;
    const enrollment = enrollmentSnap?.exists ? enrollmentSnap.data() || {} : {};

    if (enrollmentRequestId) {
      if (role !== "parent") throw new Error("PAYMENT_ENROLLMENT_ROLE_INVALID");
      if (!enrollmentSnap?.exists) throw new Error("ENROLLMENT_NOT_FOUND");
      if (asString(enrollment.parentId) !== userId) throw new Error("ENROLLMENT_OWNER_MISMATCH");
      if (asString(enrollment.planId) && asString(enrollment.planId) !== planId) throw new Error("ENROLLMENT_PLAN_MISMATCH");
      if (asString(enrollment.paymentStatus).toUpperCase() === "PAID") throw new Error("ENROLLMENT_ALREADY_PAID");
    }

    const studentId = asString(metadata.studentId || enrollment.studentId);
    const tutorId = asString(metadata.tutorId || enrollment.tutorId);
    const schoolId = asString(metadata.schoolId || enrollment.schoolId || userRecord.schoolId);
    const studentName = asString(metadata.studentName || enrollment.studentName || enrollment.enrollmentStudentName);
    const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();

    if (role === "student") {
      const ownStudentId = asString(userRecord.studentDocId);
      if (!ownStudentId || (studentId && studentId !== ownStudentId)) throw new Error("PAYMENT_STUDENT_OWNER_MISMATCH");
    }
    if (role === "school" && schoolId && asString(userRecord.schoolId) !== schoolId) throw new Error("PAYMENT_SCHOOL_OWNER_MISMATCH");
    if (role === "parent" && studentId) {
      let studentSnap = await transaction.get(adminDb.collection("individualStudents").doc(studentId));
      if (!studentSnap.exists) studentSnap = await transaction.get(adminDb.collection("students").doc(studentId));
      if (!studentSnap.exists || asString(studentSnap.data()?.parentId) !== userId) throw new Error("PAYMENT_STUDENT_OWNER_MISMATCH");
    }

    const durationWeeks = Number(metadata.durationWeeks || enrollment.durationWeeks || plan.durationWeeks || 4);
    const cycleDays = durationWeeks * 7;
    const paidThrough = new Date(paidAt.getTime() + cycleDays * 24 * 60 * 60 * 1000);
    const quarterNumber = Math.floor(paidAt.getMonth() / 3) + 1;
    const escrowQuarter = `Q${quarterNumber} ${paidAt.getFullYear()}`;
    const paymentSource = asString(metadata.paymentSource || "This Quarter's Escrow Account");

    paymentData = {
      userId,
      parentId: role === "parent" ? userId : null,
      schoolId: role === "school" ? schoolId || userId : schoolId || null,
      studentId: studentId || null,
      studentName: studentName || null,
      studentIds: Array.isArray(metadata.studentIds) ? metadata.studentIds : (studentId ? [studentId] : []),
      selectedItems: Array.isArray(metadata.selectedItems) ? metadata.selectedItems : null,
      tutorId: tutorId || null,
      tutorName: null,
      tutorEmail: null,
      enrollmentRequestId: enrollmentRequestId || null,
      enrollmentStudentName: studentName || null,
      planId,
      plan: plan.name,
      baseAmount: plan.baseAmount,
      transactionFee: actualTransactionFee,
      estimatedTransactionFee: chargePreview.transactionFee,
      amount: providerAmountMinor,
      providerAmount: providerAmountMinor,
      customerTotal,
      currency: "NGN",
      durationWeeks,
      cycleDays,
      teachingMode: asString(metadata.teachingMode || enrollment.teachingMode || enrollment.modeOfTeaching || plan.teachingModes[0]),
      paymentMethod: asString(tx.channel || metadata.paymentMethod || "paystack"),
      paymentSource,
      escrowQuarter,
      paidThrough: paidThrough.toISOString(),
      nextDueDate: paidThrough.toISOString(),
      status: "PAID",
      reference,
      email: asString(tx.customer?.email || userRecord.email),
      description: `${plan.name} • ${studentName || (role === "school" ? "School account" : "Student account")}`,
      providerTransactionId: tx.id || null,
      gatewayResponse: tx.gateway_response || null,
      gatewayFeeVerified: Number.isFinite(Number(tx.fees)),
      paidAt,
      createdAt: new Date(),
      verifiedAt: new Date(),
      verifiedBy: verifiedUserId ? "portal_return" : "paystack_webhook",
      walletCredited: Boolean(tutorId || (Array.isArray(metadata.selectedItems) && metadata.selectedItems.some((i: any) => i.tutorId)))
    };

    if (tutorId) {
      const tutorSnap = await transaction.get(adminDb.collection("users").doc(tutorId));
      const tutor = tutorSnap.exists ? tutorSnap.data() || {} : {};
      paymentData.tutorName = tutor.name || tutor.displayName || tutor.email || tutorId;
      paymentData.tutorEmail = tutor.email || null;
    }

    transaction.create(canonicalPaymentRef, paymentData);
    created = true;

    // Update school or user billing record with active paid status and 4-week renewal due date
    if (role === "school" && (schoolId || userId)) {
      const targetSchoolRef = adminDb.collection("schools").doc(schoolId || userId);
      transaction.set(targetSchoolRef, {
        billing: {
          status: "PAID",
          lastPaidAt: paidAt.toISOString(),
          paidThrough: paidThrough.toISOString(),
          nextDueDate: paidThrough.toISOString(),
          paymentSource,
          escrowQuarter,
          cycle: durationWeeks === 12 ? "termly" : "monthly",
          baseAmount: plan.baseAmount,
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });
    }

    if (role === "parent" || role === "student") {
      const targetUserRef = adminDb.collection("users").doc(userId);
      transaction.set(targetUserRef, {
        billing: {
          status: "PAID",
          lastPaidAt: paidAt.toISOString(),
          paidThrough: paidThrough.toISOString(),
          nextDueDate: paidThrough.toISOString(),
          paymentSource,
          escrowQuarter,
          cycle: "monthly",
          baseAmount: plan.baseAmount,
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });

      // Update student document(s) for linked children to reflect active paid status
      const targetStudentIds = Array.isArray(metadata.studentIds) ? metadata.studentIds : (studentId ? [studentId] : []);
      for (const targetSid of targetStudentIds) {
        if (!targetSid) continue;
        const indRef = adminDb.collection("individualStudents").doc(targetSid);
        const stdRef = adminDb.collection("students").doc(targetSid);
        transaction.set(indRef, {
          paymentStatus: "PAID",
          status: "ACTIVE",
          lastPaymentReference: reference,
          lastPaidAt: paidAt.toISOString(),
          paidThrough: paidThrough.toISOString(),
          nextDueDate: paidThrough.toISOString()
        }, { merge: true });
        transaction.set(stdRef, {
          paymentStatus: "PAID",
          status: "ACTIVE",
          lastPaymentReference: reference,
          lastPaidAt: paidAt.toISOString(),
          paidThrough: paidThrough.toISOString(),
          nextDueDate: paidThrough.toISOString()
        }, { merge: true });
      }
    }

    if (enrollmentRef) transaction.set(enrollmentRef, {
      paymentStatus: "PAID",
      paymentReference: reference,
      paymentPlanId: planId,
      paymentPlanName: plan.name,
      paymentBaseAmount: plan.baseAmount,
      paymentTransactionFee: actualTransactionFee,
      paymentEstimatedTransactionFee: chargePreview.transactionFee,
      paymentTotal: customerTotal,
      paymentProviderAmount: providerAmount,
      paymentFeeVerified: Number.isFinite(Number(tx.fees)),
      durationWeeks: paymentData.durationWeeks,
      teachingMode: paymentData.teachingMode,
      studentId: studentId || null,
      tutorId: tutorId || null,
      schoolId: schoolId || null,
      paidAt,
      updatedAt: new Date()
    }, { merge: true });

    if (Array.isArray(metadata.selectedItems) && metadata.selectedItems.length > 0) {
      // Credit each respective tutor according to their allocated program fees
      const tutorAmounts = new Map<string, number>();
      for (const item of metadata.selectedItems) {
        const itemTid = asString(item.tutorId);
        const itemAmt = Number(item.amount || 0);
        if (itemTid && itemTid !== "lead_tutor" && itemAmt > 0) {
          tutorAmounts.set(itemTid, (tutorAmounts.get(itemTid) || 0) + itemAmt);
        }
      }
      for (const [tid, totalForTutor] of tutorAmounts.entries()) {
        transaction.set(adminDb.collection("staffWallets").doc(tid), {
          availableBalance: FieldValue.increment(totalForTutor),
          lifetimeEarned: FieldValue.increment(totalForTutor),
          updatedAt: new Date()
        }, { merge: true });
      }
    } else if (tutorId) {
      transaction.set(adminDb.collection("staffWallets").doc(tutorId), { availableBalance: FieldValue.increment(plan.baseAmount), lifetimeEarned: FieldValue.increment(plan.baseAmount), updatedAt: new Date() }, { merge: true });
    }
  });

  if (!created) return { created: false, payment: null };
  // Financial notifications are targeted to each admin UID, never broadcast.
  const adminUsers = await adminDb.collection("users").limit(1000).get();
  const adminRoles = new Set(["super_admin", "superadmin", "admin"]);
  const paymentSummary = String(role === "school" ? "School" : role === "parent" ? "Parent" : "Student") + " payment received: " + String(paymentData.plan) + " — ₦" + Number(paymentData.customerTotal).toLocaleString() + " (reference " + reference + ").";
  await Promise.all(adminUsers.docs
    .filter(d => adminRoles.has(String(d.data().role || "").trim().toLowerCase()))
    .map(d => createPortalNotification({
      recipientId: d.id,
      title: "Payment received",
      message: paymentSummary,
      type: "PAYMENT_RECEIVED_ADMIN",
      data: { paymentId: reference, payerId: userId, payerRole: role, schoolId: paymentData.schoolId, studentId: paymentData.studentId, amount: paymentData.customerTotal, currency: "NGN" }
    })));
  await createPortalNotification({ recipientId: userId, email: paymentData.email, title: "Payment confirmed", message: `${paymentData.plan} payment for ${paymentData.studentName || "your account"} was verified. Tuition: ₦${paymentData.baseAmount.toLocaleString()}, Paystack fee: ₦${paymentData.transactionFee.toLocaleString()}, customer total: ₦${paymentData.customerTotal.toLocaleString()}. Your paid-through date is ${new Date(new Date(paymentData.paidAt).getTime() + paymentData.durationWeeks * 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-NG")}.`, type: "PAYMENT_CONFIRMED", data: { paymentId: reference, planId, studentId: paymentData.studentId, tutorId: paymentData.tutorId, baseAmount: paymentData.baseAmount, transactionFee: paymentData.transactionFee, customerTotal: paymentData.customerTotal } });
  if (paymentData.tutorId && paymentData.tutorEmail) await createPortalNotification({ recipientId: paymentData.tutorId, email: paymentData.tutorEmail, title: "Student payment received", message: `${paymentData.studentName || "An assigned student"} has paid ${paymentData.plan}. ₦${paymentData.baseAmount.toLocaleString()} has been credited to your staff wallet.`, type: "STUDENT_PAYMENT", data: { paymentId: reference, studentId: paymentData.studentId, amount: paymentData.baseAmount } });
  return { created: true, payment: paymentData };
}
