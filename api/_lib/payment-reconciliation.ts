import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  calculateCustomerCharge,
  computeReconciledProgrammeEnrollmentState,
  computeStudentProgrammePayableAmount,
  getFeePolicy,
  getPaymentConfig,
  normaliseRole,
  isPartiallyPaidStatus,
  resolveTrustedStudentFeeAndTutor,
  PaymentPlan
} from "./billing";
import { createPortalNotification } from "./email";
import { extractPolicyAuditFromMetadata } from "./paystack-policy";
import {
  calculateRenewedPeriod,
  computeLockdownAt,
  formatLagosDate,
  parseDateSafe,
  resolvePlanDurationWeeks,
} from "./subscription-core";
import { buildCanonicalSubscriptionWritePayload } from "./subscription-service";

const asString = (value: unknown) => String(value ?? "").trim();

async function verifyAndLoadStudent(studentId: string, ownerId: string, ownerRole: "parent" | "school" | "student", ownerEmail?: string) {
  if (!studentId) return null;
  const emailNorm = asString(ownerEmail).toLowerCase();
  for (const colName of ["individualStudents", "students"]) {
    const snap = await adminDb.collection(colName).doc(studentId).get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    let owned = false;
    if (ownerRole === "student") {
      owned = asString(data.firebaseUid || data.userId) === ownerId;
    } else if (ownerRole === "school") {
      owned = asString(data.schoolId) === ownerId;
    } else {
      const sParentId = asString(data.parentId || data.parentUid || data.parentUserId);
      const sParentEmail = asString(data.parentEmail || data.guardianEmail).toLowerCase();
      owned = (Boolean(sParentId) && sParentId === ownerId) || (Boolean(emailNorm) && sParentEmail === emailNorm);
      if (!owned) {
        const [uSnap, pSnap] = await Promise.all([
          adminDb.collection("users").doc(ownerId).get().catch(() => null),
          adminDb.collection("parents").doc(ownerId).get().catch(() => null)
        ]);
        const hasChild = (docData: any) => {
          if (!docData) return false;
          const list = [...(Array.isArray(docData.children) ? docData.children : []), ...(Array.isArray(docData.linkedStudentIds) ? docData.linkedStudentIds : [])];
          return list.some((it: any) => asString(it && typeof it === "object" ? it.id || it.studentId : it) === studentId);
        };
        owned = hasChild(uSnap?.exists ? uSnap.data() : null) || hasChild(pSnap?.exists ? pSnap.data() : null);
      }
    }
    if (!owned) throw new Error("PAYMENT_STUDENT_OWNER_MISMATCH");
    return { id: snap.id, ...data };
  }
  throw new Error("STUDENT_NOT_FOUND");
}

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
  const userSnap = await adminDb.collection("users").doc(userId).get();
  if (!userSnap.exists) throw new Error("PAYMENT_USER_NOT_FOUND");
  const userRecord = userSnap.data() || {};
  const authoritativeRole = normaliseRole(userRecord.role);
  if (requestedRole && requestedRole !== authoritativeRole) throw new Error("PAYMENT_ROLE_MISMATCH");
  const role = authoritativeRole;
  if (!["parent", "school", "student"].includes(role)) throw new Error("PAYMENT_ROLE_INVALID");

  // =========================================================================
  // DEDICATED SELF-FUNDED STUDENT PROGRAMME ENROLMENT RECONCILIATION
  // =========================================================================
  const programmeEnrollmentId = asString(metadata.programmeEnrollmentId);
  if (
    role === "student" &&
    asString(metadata.billingContext) === "STUDENT_PROGRAMME_ENROLLMENT" &&
    programmeEnrollmentId
  ) {
    const enrollRef = adminDb.collection("programme_enrollments").doc(programmeEnrollmentId);
    const enrollSnapPre = await enrollRef.get();
    if (!enrollSnapPre.exists) throw new Error("PROGRAMME_ENROLLMENT_NOT_FOUND");
    const enrollPre = enrollSnapPre.data() || {};
    if (asString(enrollPre.studentUid) !== userId) throw new Error("PAYMENT_OWNER_MISMATCH");
    if (asString(enrollPre.billingResponsibility) !== "STUDENT_SELF_FUNDED") {
      throw new Error("PAYMENT_RESPONSIBILITY_MISMATCH");
    }

    const paymentOption = asString(metadata.paymentOption) as
      | "full"
      | "deposit"
      | "balance"
      | "renewal"
      | "";
    const payable = computeStudentProgrammePayableAmount({
      enrollment: enrollPre,
      paymentOption: paymentOption || undefined,
    });
    const expectedBaseAmount =
      payable.payableAmount > 0 ? payable.payableAmount : Number(metadata.baseAmount || 0);
    if (!(expectedBaseAmount > 0)) throw new Error("PAYMENT_AMOUNT_MISMATCH");

    const chargePreview = calculateCustomerCharge(
      expectedBaseAmount,
      getFeePolicy(config, "student_self_funded")
    );
    const providerAmountMinor = Math.round(Number(tx.amount || 0));
    const providerAmount = providerAmountMinor / 100;
    const expectedBaseMinor = Math.round(expectedBaseAmount * 100);
    const hasVerifiedGatewayFee = Number.isFinite(Number(tx.fees)) && Number(tx.fees) >= 0;
    const actualTransactionFeeMinor = hasVerifiedGatewayFee ? Math.round(Number(tx.fees)) : 0;
    const actualTransactionFee = hasVerifiedGatewayFee
      ? Number((actualTransactionFeeMinor / 100).toFixed(2))
      : chargePreview.transactionFee;

    const amountMatchesBase = providerAmountMinor === expectedBaseMinor;
    const amountMatchesBasePlusVerifiedFee =
      hasVerifiedGatewayFee && providerAmountMinor === expectedBaseMinor + actualTransactionFeeMinor;

    if (String(tx.status || "").toLowerCase() !== "success") {
      throw new Error("PAYMENT_NOT_SUCCESSFUL");
    }
    if (String(tx.currency || "").toUpperCase() !== "NGN") {
      throw new Error("PAYMENT_CURRENCY_MISMATCH");
    }
    if (!amountMatchesBase && !amountMatchesBasePlusVerifiedFee) {
      throw new Error("PAYMENT_AMOUNT_MISMATCH");
    }

    const canonicalPaymentRef = adminDb.collection("payments").doc(reference);
    let created = false;
    let paymentData: Record<string, any> = {};
    let reconciledStatus = "";

    await adminDb.runTransaction(async (transaction) => {
      const existingPaySnap = await transaction.get(canonicalPaymentRef);
      if (existingPaySnap.exists) return;

      const latestEnrollSnap = await transaction.get(enrollRef);
      if (!latestEnrollSnap.exists) throw new Error("PROGRAMME_ENROLLMENT_NOT_FOUND");
      const latestEnroll = latestEnrollSnap.data() || {};

      const subId = `prog_enr_${programmeEnrollmentId}`;
      const subRef = adminDb.collection("billingSubscriptions").doc(subId);
      const existingSubSnap = await transaction.get(subRef);
      const existingSub = existingSubSnap.exists ? existingSubSnap.data() || {} : null;

      const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();
      const transition = computeReconciledProgrammeEnrollmentState({
        enrollment: latestEnroll,
        baseAmountPaidNow: expectedBaseAmount,
        isRenewal: payable.isRenewal || Boolean(metadata.isRenewal),
        paidAt,
      });
      reconciledStatus = transition.newEnrollmentStatus;

      const durationWeeks = resolvePlanDurationWeeks({
        durationWeeks: latestEnroll.durationWeeks,
        cycle: latestEnroll.billingCycle,
        fallbackWeeks: 8,
      });
      const isRenewalOrSettled = transition.newRemainingBalance === 0 || transition.accessUnlocked;
      const renewedPeriod = isRenewalOrSettled
        ? calculateRenewedPeriod({
            currentPeriodEndAt:
              existingSub?.currentPeriodEndAt ||
              existingSub?.nextDueAt ||
              latestEnroll.paidThrough ||
              latestEnroll.nextDueDate ||
              null,
            graceEndsAt: existingSub?.graceEndsAt || null,
            paidAt,
            durationWeeks,
          })
        : null;
      const finalPaidThroughIso = renewedPeriod
        ? renewedPeriod.periodEndAt.toISOString()
        : transition.paidThroughIso;
      const finalNextDueIso = renewedPeriod
        ? renewedPeriod.nextDueAt.toISOString()
        : transition.nextDueDateIso;

      const programId = asString(latestEnroll.programId || metadata.programId);
      const programTitle = asString(latestEnroll.programTitle || metadata.programTitle || "Programme");
      const studentDocId = asString(latestEnroll.studentDocId || userRecord.studentDocId || userId);
      const studentName = asString(latestEnroll.studentName || userRecord.name || "Student");
      const verifiedChannel = asString(tx.channel) || null;
      const policyAudit = extractPolicyAuditFromMetadata(metadata, userId, paidAt);

      // Perform any student doc reads BEFORE writes (Firestore transaction requirement)
      let indSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let stdSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      const indRef = studentDocId ? adminDb.collection("individualStudents").doc(studentDocId) : null;
      const stdRef = studentDocId ? adminDb.collection("students").doc(studentDocId) : null;
      if (transition.accessUnlocked && programId && indRef && stdRef) {
        [indSnap, stdSnap] = await Promise.all([
          transaction.get(indRef),
          transaction.get(stdRef),
        ]);
      }

      // CRITICAL: schoolId is ALWAYS null so student self-funded payments NEVER mix with school invoices
      paymentData = {
        userId,
        parentId: null,
        schoolId: null,
        affiliatedSchoolId: asString(latestEnroll.schoolId) || null,
        billingContext: "STUDENT_PROGRAMME_ENROLLMENT",
        billingResponsibility: "STUDENT_SELF_FUNDED",
        programmeEnrollmentId,
        subscriptionId: subId,
        programId,
        programTitle,
        studentId: studentDocId,
        studentName,
        planId: `prog_enr_${programId || programmeEnrollmentId}`,
        plan: programTitle,
        baseAmount: expectedBaseAmount,
        fullContractAmount: Number(latestEnroll.approvedFee || expectedBaseAmount),
        remainingBalance: transition.newRemainingBalance,
        transactionFee: actualTransactionFee,
        estimatedTransactionFee: chargePreview.transactionFee,
        amount: providerAmount,
        amountInNaira: true,
        amountMinor: providerAmountMinor,
        providerAmount: providerAmountMinor,
        customerTotal: providerAmount,
        currency: "NGN",
        durationWeeks,
        teachingMode: asString(latestEnroll.deliveryOption || "PUBLIC_GROUP"),
        channel: verifiedChannel,
        paymentMethod: verifiedChannel || "paystack",
        checkoutProvider: "paystack",
        paymentSource: "Student Self-Funded Programme Payment",
        paidThrough: finalPaidThroughIso,
        nextDueDate: finalNextDueIso,
        renewalMode: renewedPeriod?.renewalMode || null,
        status: "PAID",
        reference,
        email: asString(tx.customer?.email || latestEnroll.studentEmail || userRecord.email),
        description: `${programTitle} (${payable.resolvedOption}) • ${studentName}`,
        providerTransactionId: tx.id || null,
        gatewayResponse: tx.gateway_response || null,
        gatewayFeeVerified: hasVerifiedGatewayFee,
        paidAt,
        createdAt: new Date(),
        verifiedAt: new Date(),
        verifiedBy: verifiedUserId ? "portal_return" : "paystack_webhook",
        ...policyAudit,
      };

      const historyEntry = {
        reference,
        amount: expectedBaseAmount,
        customerTotal: providerAmount,
        transactionFee: actualTransactionFee,
        paymentOption: payable.resolvedOption,
        paidAt: paidAt.toISOString(),
        channel: verifiedChannel || "paystack",
        status: "PAID",
      };

      transaction.set(canonicalPaymentRef, paymentData);
      transaction.set(
        enrollRef,
        {
          amountPaid: transition.newAmountPaid,
          remainingBalance: transition.newRemainingBalance,
          paymentStatus: transition.newPaymentStatus,
          enrollmentStatus: transition.newEnrollmentStatus,
          paidThrough: finalPaidThroughIso,
          nextDueDate: finalNextDueIso,
          lastPaymentReference: reference,
          lastPaidAt: paidAt,
          paymentHistory: FieldValue.arrayUnion(historyEntry),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // Atomically upsert canonical billingSubscriptions record for this self-funded programme
      transaction.set(
        subRef,
        buildCanonicalSubscriptionWritePayload({
          id: subId,
          accountType: "STUDENT_SELF_FUNDED_PROGRAMME",
          accountId: userId,
          accountName: studentName,
          recipientEmail: asString(tx.customer?.email || latestEnroll.studentEmail || userRecord.email) || null,
          studentId: studentDocId,
          studentName,
          programmeEnrollmentId,
          billingResponsibility: "STUDENT_SELF_FUNDED",
          status: transition.newRemainingBalance > 0 && !transition.accessUnlocked ? "PARTIALLY_PAID" : "ACTIVE",
          planId: `prog_enr_${programId || programmeEnrollmentId}`,
          planName: programTitle,
          programmeId: programId || null,
          programmeName: programTitle,
          amount: Number(latestEnroll.approvedFee || expectedBaseAmount),
          amountPaid: transition.newAmountPaid,
          remainingBalance: transition.newRemainingBalance,
          allowDepositAccess: Boolean(latestEnroll.allowDepositAccess),
          depositAmount: Number(latestEnroll.depositAmount || 0),
          currency: "NGN",
          billingCycle: asString(latestEnroll.billingCycle || (durationWeeks >= 12 ? "termly" : "monthly")),
          durationWeeks,
          currentPeriodStartAt: renewedPeriod ? renewedPeriod.periodStartAt : paidAt,
          currentPeriodEndAt: finalPaidThroughIso,
          nextDueAt: finalNextDueIso,
          graceEndsAt: renewedPeriod ? renewedPeriod.graceEndsAt : (finalNextDueIso ? computeLockdownAt(finalNextDueIso) : null),
          lastSuccessfulPaymentAt: paidAt,
          lastPaymentReference: reference,
        }),
        { merge: true }
      );

      // Activate the self-funded programme in student profile WITHOUT touching school-funded tracks or schools/{schoolId}
      if (transition.accessUnlocked && programId) {
        const activationFields = {
          selectedProgramIds: FieldValue.arrayUnion(programId),
          assignedProgramIds: FieldValue.arrayUnion(programId),
          selfFundedProgramIds: FieldValue.arrayUnion(programId),
          enrolledPrograms: FieldValue.arrayUnion(programTitle),
          updatedAt: new Date(),
        };

        const userRef = adminDb.collection("users").doc(userId);
        transaction.set(userRef, activationFields, { merge: true });

        if (indRef && indSnap?.exists) {
          transaction.set(indRef, activationFields, { merge: true });
        }
        if (stdRef && stdSnap?.exists) {
          transaction.set(stdRef, activationFields, { merge: true });
        }
      }

      created = true;
    });

    if (created) {
      await adminDb
        .collection("notifications")
        .doc(`prog_active_${reference}`)
        .set(
          {
            userId,
            recipientId: userId,
            title:
              reconciledStatus === "ACTIVE"
                ? `Programme Activated: ${paymentData.programTitle}`
                : `Deposit Recorded: ${paymentData.programTitle}`,
            message:
              reconciledStatus === "ACTIVE"
                ? `Payment of ₦${Number(paymentData.baseAmount || 0).toLocaleString()} confirmed. ${paymentData.programTitle} is now active in My Learning Tracks.`
                : `Deposit of ₦${Number(paymentData.baseAmount || 0).toLocaleString()} confirmed. Outstanding balance: ₦${Number(paymentData.remainingBalance || 0).toLocaleString()}.`,
            type: "PROGRAMME_PAYMENT_CONFIRMED",
            reference,
            programmeEnrollmentId,
            actionUrl: "/portal/student/courses",
            actionText: "Open My Learning Tracks",
            read: false,
            createdAt: new Date(),
          },
          { merge: true }
        )
        .catch(() => undefined);
    }

    return { created, payment: paymentData, reference };
  }

  let assignedBilling: Record<string, any> | null = userRecord.billing || null;
  let schoolDocData: Record<string, any> | null = null;
  const resolvedSchoolId = role === "school" ? asString(userRecord.schoolId || metadata.schoolId || userId) : asString(metadata.schoolId);

  if (role === "school" && resolvedSchoolId) {
    const assignedSchoolSnap = await adminDb.collection("schools").doc(resolvedSchoolId).get();
    if (assignedSchoolSnap.exists) {
      schoolDocData = assignedSchoolSnap.data() || {};
      if (schoolDocData.billing) {
        assignedBilling = schoolDocData.billing;
      }
    }
  }

  let plan: PaymentPlan | undefined = config.plans[planId];
  let verifiedSelectedItems: Array<{
    id: string;
    childId: string;
    childName: string;
    programId: string;
    programName: string;
    tutorId: string;
    tutorName: string;
    amount: number;
  }> = [];
  let verifiedPrimaryTutorId = "";
  let fullSchoolContractAmount = 0;
  let remainingSchoolBalance = 0;

  // 1. Authoritative resolution for parent multi-item tuition checkout
  if (role === "parent" && Array.isArray(metadata.selectedItems) && metadata.selectedItems.length > 0) {
    for (const rawItem of metadata.selectedItems) {
      const cId = asString(rawItem?.childId);
      if (!cId) throw new Error("PAYMENT_METADATA_INVALID");
      const studentDoc: Record<string, any> | null = await verifyAndLoadStudent(cId, userId, "parent", userRecord.email);
      if (!studentDoc) throw new Error("STUDENT_NOT_FOUND");
      const resolved = await resolveTrustedStudentFeeAndTutor({
        student: studentDoc,
        programId: asString(rawItem?.programId),
        programName: asString(rawItem?.programName),
        config,
        parentBilling: assignedBilling
      });
      if (resolved.amount <= 0) throw new Error("PAYMENT_PLAN_INVALID");
      verifiedSelectedItems.push({
        id: asString(rawItem?.id || `${cId}_${resolved.programId}`),
        childId: cId,
        childName: asString(studentDoc.fullName || studentDoc.studentName || studentDoc.name || rawItem?.childName || "Enrolled Child"),
        programId: resolved.programId,
        programName: resolved.programName,
        tutorId: resolved.tutorId,
        tutorName: resolved.tutorName || "Assigned Tutor",
        amount: resolved.amount
      });
    }
    const totalVerifiedBase = Number(verifiedSelectedItems.reduce((acc, it) => acc + it.amount, 0).toFixed(2));
    verifiedPrimaryTutorId = verifiedSelectedItems[0]?.tutorId || "";
    const uniqueNames = Array.from(new Set(verifiedSelectedItems.map(i => i.childName).filter(Boolean)));
    plan = {
      id: "parent_multi_tuition",
      name: asString(metadata.planName || (uniqueNames.length > 0 ? `Tuition: ${uniqueNames.join(", ")}` : "Tuition Settlement")),
      role: "student",
      baseAmount: totalVerifiedBase,
      durationWeeks: 4,
      teachingModes: ["Standard Delivery", "Hybrid / Physical"],
      description: "Verified multi-programme parent tuition settlement",
      active: true
    };
  }

  // 2. Authoritative resolution for single student / parent payment
  if ((role === "parent" || role === "student") && verifiedSelectedItems.length === 0) {
    const targetSid = role === "student"
      ? asString(userRecord.studentDocId || metadata.studentId)
      : asString(metadata.studentId);

    if (targetSid) {
      const studentDoc: Record<string, any> | null = await verifyAndLoadStudent(targetSid, userId, role, userRecord.email);
      if (studentDoc) {
        const resolved = await resolveTrustedStudentFeeAndTutor({
          student: studentDoc,
          programId: planId,
          programName: asString(metadata.planName),
          config,
          parentBilling: assignedBilling
        });
        verifiedPrimaryTutorId = resolved.tutorId;
        if (resolved.amount > 0) {
          plan = {
            id: resolved.programId || planId || "assigned_student_plan",
            name: resolved.programName || asString(metadata.planName || "Assigned Tuition Plan"),
            role: "student",
            baseAmount: resolved.amount,
            durationWeeks: 4,
            teachingModes: ["Standard Delivery", "Hybrid / Physical"],
            description: "Database-verified student tuition plan",
            active: true
          };
        }
      }
    }

    if (!plan && enrollmentRequestId) {
      const enrSnap = await adminDb.collection("enrollment_requests").doc(enrollmentRequestId).get();
      if (enrSnap.exists) {
        const enrData = enrSnap.data() || {};
        const enrAmount = Number(enrData.tuitionFee ?? enrData.fee ?? enrData.amount ?? enrData.paymentBaseAmount ?? 0);
        verifiedPrimaryTutorId = verifiedPrimaryTutorId || asString(enrData.tutorId);
        if (enrAmount > 0) {
          plan = {
            id: asString(enrData.planId || planId || "assigned_enrollment_plan"),
            name: asString(enrData.paymentPlanName || enrData.programName || enrData.plan || metadata.planName || "Assigned Tuition Plan"),
            role: "student",
            baseAmount: enrAmount,
            durationWeeks: Number(enrData.durationWeeks || 4),
            teachingModes: ["Standard Delivery", "Hybrid / Physical"],
            description: "Database-verified enrollment plan",
            active: true
          };
        }
      }
    }
  }

  // 3. Authoritative resolution for school payment (including valid 100% / 70% / 50% installments)
  if (role === "school") {
    let schoolBase = Number(assignedBilling?.baseAmount || 0);
    let schoolPlanName = asString(assignedBilling?.planName || metadata.planName || "School Learning Partnership");
    if (schoolBase <= 0 && schoolDocData && Array.isArray(schoolDocData.programs)) {
      const matchedProg = schoolDocData.programs.find((p: any) => p && typeof p === "object" && (p.id === planId || p.programId === planId)) || schoolDocData.programs[0];
      if (matchedProg && typeof matchedProg === "object") {
        schoolBase = Number(matchedProg.price ?? matchedProg.tuitionFee ?? matchedProg.fee ?? matchedProg.amount ?? 0);
        schoolPlanName = asString(matchedProg.title || matchedProg.name || schoolPlanName);
      }
    }
    if (schoolBase <= 0 && config.plans[planId]?.role === "school") {
      schoolBase = Number(config.plans[planId].baseAmount);
      schoolPlanName = config.plans[planId].name;
    }

    if (schoolBase > 0) {
      fullSchoolContractAmount = schoolBase;
      const isPartial = isPartiallyPaidStatus(assignedBilling?.status);
      const existingRemaining = Number(assignedBilling?.remainingBalance || 0);
      const metaPct = Number(metadata.paymentPercentage || 100);
      const validPct = [100, 70, 50].includes(metaPct) ? metaPct : 100;

      let expectedPayable = schoolBase;
      if (isPartial && existingRemaining > 0 && validPct === 100) {
        expectedPayable = existingRemaining;
        remainingSchoolBalance = 0;
      } else if (validPct < 100) {
        expectedPayable = Number(((schoolBase * validPct) / 100).toFixed(2));
        remainingSchoolBalance = Number(Math.max(0, schoolBase - expectedPayable).toFixed(2));
      }

      const cycle = asString(assignedBilling?.cycle || "termly").toLowerCase();
      plan = {
        id: asString(assignedBilling?.planId || planId || "school_assigned_plan"),
        name: schoolPlanName,
        role: "school",
        baseAmount: expectedPayable,
        durationWeeks: cycle === "termly" ? 12 : 4,
        teachingModes: ["Standard Delivery", "Hybrid / Physical"],
        description: "Admin-assigned school billing plan",
        active: true
      };
    }
  }

  // 4. Fallback to admin-assigned billing on user record if not yet resolved
  if (!plan && assignedBilling && Number(assignedBilling.baseAmount) > 0 && asString(assignedBilling.status || "ACTIVE").toUpperCase() !== "DISABLED") {
    const cycle = asString(assignedBilling.cycle || "monthly").toLowerCase();
    const isPartial = isPartiallyPaidStatus(assignedBilling.status);
    const existingRemaining = Number(assignedBilling.remainingBalance || 0);
    const expectedBase = isPartial && existingRemaining > 0 ? existingRemaining : Number(assignedBilling.baseAmount);
    plan = {
      id: asString(assignedBilling.planId || planId || "assigned_plan"),
      name: asString(assignedBilling.planName || metadata.planName || (role === "school" ? "School Learning Partnership" : "Assigned Tuition Plan")),
      role: role === "school" ? "school" : "student",
      baseAmount: expectedBase,
      durationWeeks: cycle === "termly" ? 12 : 4,
      teachingModes: ["Standard Delivery", "Hybrid / Physical"],
      description: "Admin-assigned billing plan",
      active: true
    };
  }

  if (plan && !plan.active) {
    plan = { ...plan, active: true };
  }
  if (!plan || !(Number(plan.baseAmount) > 0)) {
    throw new Error("PAYMENT_PLAN_INVALID");
  }

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

  const amountMatchesBase = providerAmountMinor === expectedBaseMinor;
  const amountMatchesBasePlusVerifiedFee =
    hasVerifiedGatewayFee && providerAmountMinor === expectedBaseMinor + actualTransactionFeeMinor;

  if (String(tx.status || "").toLowerCase() !== "success") {
    throw new Error("PAYMENT_NOT_SUCCESSFUL");
  }
  if (String(tx.currency || "").toUpperCase() !== "NGN") {
    throw new Error("PAYMENT_CURRENCY_MISMATCH");
  }
  if (!amountMatchesBase && !amountMatchesBasePlusVerifiedFee) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }

  const customerTotal = providerAmount;

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

    const studentId = asString(metadata.studentId || enrollment.studentId || (role === "student" ? userRecord.studentDocId : ""));
    const tutorId = asString(verifiedPrimaryTutorId || enrollment.tutorId);
    const schoolId = asString(resolvedSchoolId || enrollment.schoolId);
    const studentName = asString(metadata.studentName || enrollment.studentName || enrollment.enrollmentStudentName);
    const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();

    if (role === "student") {
      const ownStudentId = asString(userRecord.studentDocId);
      if (!ownStudentId || (studentId && studentId !== ownStudentId)) throw new Error("PAYMENT_STUDENT_OWNER_MISMATCH");
    }
    if (role === "school" && schoolId && asString(userRecord.schoolId || userId) !== schoolId) {
      throw new Error("PAYMENT_SCHOOL_OWNER_MISMATCH");
    }
    if (role === "parent" && studentId && verifiedSelectedItems.length === 0) {
      let studentSnap = await transaction.get(adminDb.collection("individualStudents").doc(studentId));
      if (!studentSnap.exists) studentSnap = await transaction.get(adminDb.collection("students").doc(studentId));
      const sData = studentSnap.data() || {};
      const parentEmailNorm = asString(userRecord.email).toLowerCase();
      const sParentEmail = asString(sData.parentEmail || sData.guardianEmail).toLowerCase();
      const sParentId = asString(sData.parentId || sData.parentUid || sData.parentUserId);
      const ownedDirect = (Boolean(sParentId) && sParentId === userId) || (Boolean(parentEmailNorm) && sParentEmail === parentEmailNorm);
      if (!studentSnap.exists || !ownedDirect) {
        const list = [...(Array.isArray(userRecord.children) ? userRecord.children : []), ...(Array.isArray(userRecord.linkedStudentIds) ? userRecord.linkedStudentIds : [])];
        const inChildrenList = list.some((it: any) => asString(it && typeof it === "object" ? it.id || it.studentId : it) === studentId);
        if (!studentSnap.exists || !inChildrenList) throw new Error("PAYMENT_STUDENT_OWNER_MISMATCH");
      }
    }

    const durationWeeks = resolvePlanDurationWeeks({
      durationWeeks: metadata.durationWeeks || enrollment.durationWeeks || plan.durationWeeks,
      cycle: assignedBilling?.cycle || (plan.durationWeeks >= 12 ? "termly" : "monthly"),
      fallbackWeeks: 4,
    });
    const cycleDays = durationWeeks * 7;

    // Read existing canonical subscription(s) BEFORE any transaction writes
    const targetSchoolDocId = role === "school" ? schoolId || userId : "";
    const primarySubId =
      role === "school"
        ? `school_${targetSchoolDocId}`
        : role === "parent"
        ? `parent_${userId}`
        : `student_${userId}`;
    const primarySubRef = adminDb.collection("billingSubscriptions").doc(primarySubId);
    const primarySubSnap = await transaction.get(primarySubRef);
    const existingPrimarySub = primarySubSnap.exists ? primarySubSnap.data() || {} : null;

    const targetSchoolSnapForRenewal =
      role === "school" && targetSchoolDocId
        ? await transaction.get(adminDb.collection("schools").doc(targetSchoolDocId))
        : null;
    const existingSchoolBilling = targetSchoolSnapForRenewal?.exists
      ? targetSchoolSnapForRenewal.data()?.billing || {}
      : {};

    const targetStudentIds =
      role === "parent" || role === "student"
        ? verifiedSelectedItems.length > 0
          ? Array.from(new Set(verifiedSelectedItems.map((i) => i.childId)))
          : studentId
          ? [studentId]
          : []
        : [];

    const existingChildSubMap = new Map<string, Record<string, any> | null>();
    if (role === "parent" && targetStudentIds.length > 0) {
      for (const cid of targetStudentIds) {
        const cSubSnap = await transaction.get(
          adminDb.collection("billingSubscriptions").doc(`parent_${userId}_child_${cid}`)
        );
        existingChildSubMap.set(cid, cSubSnap.exists ? cSubSnap.data() || {} : null);
      }
    }

    const priorPeriodEnd =
      existingPrimarySub?.currentPeriodEndAt ||
      existingPrimarySub?.nextDueAt ||
      (role === "school"
        ? existingSchoolBilling?.paidThrough || existingSchoolBilling?.nextDueDate
        : userRecord.billing?.paidThrough || userRecord.billing?.nextDueDate) ||
      null;
    const priorGraceEndsAt = existingPrimarySub?.graceEndsAt || null;

    const isSchoolPartial = role === "school" && remainingSchoolBalance > 0;
    const renewedPeriod = !isSchoolPartial
      ? calculateRenewedPeriod({
          currentPeriodEndAt: priorPeriodEnd,
          graceEndsAt: priorGraceEndsAt,
          paidAt,
          durationWeeks,
        })
      : null;

    const paidThrough = renewedPeriod
      ? renewedPeriod.periodEndAt
      : parseDateSafe(priorPeriodEnd) || new Date(paidAt.getTime() + cycleDays * 24 * 60 * 60 * 1000);
    const quarterNumber = Math.floor(paidAt.getMonth() / 3) + 1;
    const escrowQuarter = `Q${quarterNumber} ${paidAt.getFullYear()}`;
    const paymentSource = asString(metadata.paymentSource || "This Quarter's Escrow Account");

    let tutorName: string | null = null;
    let tutorEmail: string | null = null;
    if (tutorId) {
      const tutorSnap = await transaction.get(adminDb.collection("users").doc(tutorId));
      const tutor = tutorSnap.exists ? tutorSnap.data() || {} : {};
      tutorName = tutor.name || tutor.displayName || tutor.email || tutorId;
      tutorEmail = tutor.email || null;
    }

    const hasVerifiedTutorAllocation = Boolean(
      tutorId ||
      (verifiedSelectedItems.length > 0 && verifiedSelectedItems.some(i => Boolean(i.tutorId) && i.tutorId !== "lead_tutor"))
    );
    const verifiedChannel = asString(tx.channel) || null;
    const policyAudit = extractPolicyAuditFromMetadata(metadata, userId, paidAt);

    paymentData = {
      userId,
      parentId: role === "parent" ? userId : null,
      schoolId: role === "school" ? schoolId || userId : schoolId || null,
      studentId: studentId || null,
      studentName: studentName || null,
      studentIds: verifiedSelectedItems.length > 0 ? Array.from(new Set(verifiedSelectedItems.map(i => i.childId))) : (studentId ? [studentId] : []),
      selectedItems: verifiedSelectedItems.length > 0 ? verifiedSelectedItems : null,
      tutorId: tutorId || null,
      tutorName,
      tutorEmail,
      enrollmentRequestId: enrollmentRequestId || null,
      enrollmentStudentName: studentName || null,
      subscriptionId: primarySubId,
      planId,
      plan: plan.name,
      baseAmount: plan.baseAmount,
      fullContractAmount: fullSchoolContractAmount || plan.baseAmount,
      remainingBalance: role === "school" ? remainingSchoolBalance : 0,
      transactionFee: actualTransactionFee,
      estimatedTransactionFee: chargePreview.transactionFee,
      amount: customerTotal,
      amountInNaira: true,
      amountMinor: providerAmountMinor,
      providerAmount: providerAmountMinor,
      customerTotal,
      currency: "NGN",
      durationWeeks,
      cycleDays,
      renewalMode: renewedPeriod?.renewalMode || null,
      teachingMode: asString(metadata.teachingMode || enrollment.teachingMode || enrollment.modeOfTeaching || plan.teachingModes[0]),
      channel: verifiedChannel,
      paymentMethod: verifiedChannel || asString(metadata.paymentMethod) || "paystack",
      checkoutProvider: "paystack",
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
      walletCredited: hasVerifiedTutorAllocation,
      ...policyAudit
    };

    transaction.create(canonicalPaymentRef, paymentData);
    created = true;

    // Update school billing record & canonical subscription (supports full and partial installment settlements)
    if (role === "school" && (schoolId || userId)) {
      const targetSchoolRef = adminDb.collection("schools").doc(schoolId || userId);
      const contractTotal = fullSchoolContractAmount > 0 ? fullSchoolContractAmount : plan.baseAmount;
      const amountPaidTotal = Number((contractTotal - remainingSchoolBalance).toFixed(2));
      const schoolBillingCycle = durationWeeks >= 12 ? "termly" : "monthly";
      const schoolNextDueIso = isSchoolPartial
        ? asString(existingSchoolBilling?.nextDueDate || existingPrimarySub?.nextDueAt || paidThrough.toISOString())
        : paidThrough.toISOString();

      transaction.set(targetSchoolRef, {
        billing: {
          status: isSchoolPartial ? "PARTIALLY_PAID" : "PAID",
          lastPaidAt: paidAt.toISOString(),
          paidThrough: schoolNextDueIso,
          nextDueDate: schoolNextDueIso,
          paymentSource,
          escrowQuarter,
          cycle: schoolBillingCycle,
          durationWeeks,
          baseAmount: contractTotal,
          amountPaid: amountPaidTotal,
          remainingBalance: remainingSchoolBalance,
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });

      transaction.set(
        primarySubRef,
        buildCanonicalSubscriptionWritePayload({
          id: primarySubId,
          accountType: "SCHOOL",
          accountId: targetSchoolDocId,
          accountName: asString(targetSchoolSnapForRenewal?.data()?.schoolName || targetSchoolSnapForRenewal?.data()?.name || userRecord.name || "School"),
          recipientEmail: asString(tx.customer?.email || userRecord.email) || null,
          schoolId: targetSchoolDocId,
          billingResponsibility: "SCHOOL",
          status: isSchoolPartial ? "PARTIALLY_PAID" : "ACTIVE",
          planId,
          planName: plan.name,
          amount: contractTotal,
          amountPaid: amountPaidTotal,
          remainingBalance: remainingSchoolBalance,
          currency: "NGN",
          billingCycle: schoolBillingCycle,
          durationWeeks,
          currentPeriodStartAt: renewedPeriod ? renewedPeriod.periodStartAt : (existingPrimarySub?.currentPeriodStartAt || paidAt),
          currentPeriodEndAt: schoolNextDueIso,
          nextDueAt: schoolNextDueIso,
          graceEndsAt: renewedPeriod ? renewedPeriod.graceEndsAt : computeLockdownAt(schoolNextDueIso),
          lastSuccessfulPaymentAt: paidAt,
          lastPaymentReference: reference,
        }),
        { merge: true }
      );
    }

    if (role === "parent" || role === "student") {
      const targetUserRef = adminDb.collection("users").doc(userId);
      const userBillingCycle = durationWeeks >= 12 ? "termly" : "monthly";
      transaction.set(targetUserRef, {
        billing: {
          status: "PAID",
          lastPaidAt: paidAt.toISOString(),
          paidThrough: paidThrough.toISOString(),
          nextDueDate: paidThrough.toISOString(),
          paymentSource,
          escrowQuarter,
          cycle: userBillingCycle,
          durationWeeks,
          baseAmount: plan.baseAmount,
          amountPaid: plan.baseAmount,
          remainingBalance: 0,
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });

      transaction.set(
        primarySubRef,
        buildCanonicalSubscriptionWritePayload({
          id: primarySubId,
          accountType: role === "parent" ? "PARENT" : "INDIVIDUAL_STUDENT",
          accountId: userId,
          accountName: asString(userRecord.fullName || userRecord.name || userRecord.email),
          recipientEmail: asString(tx.customer?.email || userRecord.email) || null,
          parentId: role === "parent" ? userId : null,
          studentId: role === "student" ? studentId || userId : null,
          studentName: role === "student" ? studentName || asString(userRecord.fullName || userRecord.name) : null,
          billingResponsibility: role === "parent" ? "PARENT" : "STUDENT",
          status: "ACTIVE",
          planId,
          planName: plan.name,
          amount: plan.baseAmount,
          amountPaid: plan.baseAmount,
          remainingBalance: 0,
          currency: "NGN",
          billingCycle: userBillingCycle,
          durationWeeks,
          currentPeriodStartAt: renewedPeriod ? renewedPeriod.periodStartAt : paidAt,
          currentPeriodEndAt: paidThrough,
          nextDueAt: paidThrough,
          graceEndsAt: renewedPeriod ? renewedPeriod.graceEndsAt : computeLockdownAt(paidThrough),
          lastSuccessfulPaymentAt: paidAt,
          lastPaymentReference: reference,
        }),
        { merge: true }
      );

      for (const targetSid of targetStudentIds) {
        if (!targetSid) continue;
        const itemForChild = verifiedSelectedItems.find((i) => i.childId === targetSid);
        const childPriorSub = existingChildSubMap.get(targetSid) || null;
        const childDurationWeeks = resolvePlanDurationWeeks({
          durationWeeks: (itemForChild as any)?.durationWeeks || durationWeeks,
          fallbackWeeks: durationWeeks,
        });
        const childRenewed = calculateRenewedPeriod({
          currentPeriodEndAt: childPriorSub?.currentPeriodEndAt || childPriorSub?.nextDueAt || null,
          graceEndsAt: childPriorSub?.graceEndsAt || null,
          paidAt,
          durationWeeks: childDurationWeeks,
        });
        const childPaidThroughIso = childRenewed.periodEndAt.toISOString();

        const indRef = adminDb.collection("individualStudents").doc(targetSid);
        const stdRef = adminDb.collection("students").doc(targetSid);
        const studentPaidPayload = {
          paymentStatus: "PAID",
          status: "ACTIVE",
          remainingBalance: 0,
          lastPaymentReference: reference,
          lastPaidAt: paidAt.toISOString(),
          paidThrough: childPaidThroughIso,
          nextDueDate: childPaidThroughIso
        };
        transaction.set(indRef, studentPaidPayload, { merge: true });
        transaction.set(stdRef, studentPaidPayload, { merge: true });

        if (role === "parent") {
          const childSubId = `parent_${userId}_child_${targetSid}`;
          const childAmt = Number(itemForChild?.amount || plan.baseAmount);
          transaction.set(
            adminDb.collection("billingSubscriptions").doc(childSubId),
            buildCanonicalSubscriptionWritePayload({
              id: childSubId,
              accountType: "PARENT_CHILD",
              accountId: targetSid,
              accountName: asString(itemForChild?.childName || studentName || "Child Learner"),
              recipientEmail: asString(tx.customer?.email || userRecord.email) || null,
              parentId: userId,
              studentId: targetSid,
              studentName: asString(itemForChild?.childName || studentName || "Child Learner"),
              billingResponsibility: "PARENT",
              status: "ACTIVE",
              planId,
              planName: asString(itemForChild?.programName || plan.name),
              programmeName: asString(itemForChild?.programName || plan.name),
              amount: childAmt,
              amountPaid: childAmt,
              remainingBalance: 0,
              currency: "NGN",
              billingCycle: childDurationWeeks >= 12 ? "termly" : "monthly",
              durationWeeks: childDurationWeeks,
              currentPeriodStartAt: childRenewed.periodStartAt,
              currentPeriodEndAt: childRenewed.periodEndAt,
              nextDueAt: childRenewed.nextDueAt,
              graceEndsAt: childRenewed.graceEndsAt,
              lastSuccessfulPaymentAt: paidAt,
              lastPaymentReference: reference,
            }),
            { merge: true }
          );
        }
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
      ...policyAudit,
      paidAt,
      updatedAt: new Date()
    }, { merge: true });

    if (verifiedSelectedItems.length > 0) {
      const tutorAmounts = new Map<string, number>();
      for (const item of verifiedSelectedItems) {
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
      transaction.set(adminDb.collection("staffWallets").doc(tutorId), {
        availableBalance: FieldValue.increment(plan.baseAmount),
        lifetimeEarned: FieldValue.increment(plan.baseAmount),
        updatedAt: new Date()
      }, { merge: true });
    }
  });

  if (!created) return { created: false, payment: null };
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
  await createPortalNotification({ recipientId: userId, email: paymentData.email, title: "Payment confirmed", message: `${paymentData.plan} payment for ${paymentData.studentName || "your account"} was verified. Tuition: ₦${paymentData.baseAmount.toLocaleString()}, Paystack fee: ₦${paymentData.transactionFee.toLocaleString()}, customer total: ₦${paymentData.customerTotal.toLocaleString()}. Your paid-through date is ${formatLagosDate(paymentData.paidThrough) || new Date(paymentData.paidThrough).toLocaleDateString("en-NG")}.`, type: "PAYMENT_CONFIRMED", data: { paymentId: reference, planId, studentId: paymentData.studentId, tutorId: paymentData.tutorId, baseAmount: paymentData.baseAmount, transactionFee: paymentData.transactionFee, customerTotal: paymentData.customerTotal } });
  if (paymentData.tutorId && paymentData.tutorEmail) await createPortalNotification({ recipientId: paymentData.tutorId, email: paymentData.tutorEmail, title: "Student payment received", message: `${paymentData.studentName || "An assigned student"} has paid ${paymentData.plan}. ₦${paymentData.baseAmount.toLocaleString()} has been credited to your staff wallet.`, type: "STUDENT_PAYMENT", data: { paymentId: reference, studentId: paymentData.studentId, amount: paymentData.baseAmount } });
  return { created: true, payment: paymentData };
}

