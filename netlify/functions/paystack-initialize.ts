import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import {
  calculateCustomerCharge,
  computeStudentProgrammePayableAmount,
  getFeePolicy,
  getPaymentConfig,
  getUserRecord,
  normaliseRole,
  isActiveRecord,
  isPartiallyPaidStatus,
  resolveTrustedStudentFeeAndTutor,
  PaymentPlan
} from "../../api/_lib/billing";
import {
  assertAndBuildPaymentPolicyAudit,
  buildPaystackInitializePayload,
  PaymentPolicyAuditRecord
} from "../../api/_lib/paystack-policy";

const token = (event: any) => { const header = event.headers?.authorization || event.headers?.Authorization || ""; return header.startsWith("Bearer ") ? header.slice(7) : ""; };
const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const resolveSafeCallbackOrigin = (event: any): string => {
  const fallbackRoot = (process.env.PUBLIC_APP_URL || "https://jaystarblissstudios.com").replace(/\/$/, "");
  const rawOrigin = String(event.headers?.origin || event.headers?.Origin || "").trim();
  const rawReferer = String(event.headers?.referer || event.headers?.Referer || "").trim();
  const candidates = [rawOrigin];
  if (rawReferer) {
    try {
      candidates.push(new URL(rawReferer).origin);
    } catch {
      // ignore invalid referer
    }
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      const isAllowedProd =
        parsed.protocol === "https:" &&
        (host === "jaystarblissstudios.com" ||
          host === "www.jaystarblissstudios.com" ||
          host.endsWith(".jaystarblissstudios.com") ||
          host.endsWith(".netlify.app") ||
          host.endsWith(".run.app"));
      const isAllowedLocal =
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        (host === "localhost" || host === "127.0.0.1");
      if (isAllowedProd || isAllowedLocal) {
        return parsed.origin.replace(/\/$/, "");
      }
    } catch {
      // ignore invalid origin
    }
  }
  return fallbackRoot;
};
const findStudent = async (studentId: string, ownerId: string, ownerType: "parent" | "school", userEmail?: string) => {
  if (!studentId) return null;
  const parentEmailNorm = String(userEmail || "").toLowerCase().trim();
  for (const name of ["individualStudents", "students"]) {
    const snap = await adminDb.collection(name).doc(studentId).get();
    if (!snap.exists) continue;
    const student = snap.data() || {};
    let owned = false;
    if (ownerType === "parent") {
      const sParentId = String(student.parentId || student.parentUid || student.parentUserId || "");
      const sParentEmail = String(student.parentEmail || student.guardianEmail || "").toLowerCase().trim();
      owned = Boolean((sParentId && sParentId === ownerId) || (parentEmailNorm && sParentEmail === parentEmailNorm));
      if (!owned) {
        const [uSnap, pSnap] = await Promise.all([
          adminDb.collection("users").doc(ownerId).get().catch(() => null),
          adminDb.collection("parents").doc(ownerId).get().catch(() => null)
        ]);
        const checkChildren = (d: any) => {
          if (!d) return false;
          const list = [...(Array.isArray(d.children) ? d.children : []), ...(Array.isArray(d.linkedStudentIds) ? d.linkedStudentIds : [])];
          return list.some((it: any) => String(it && typeof it === "object" ? it.id || it.studentId : it) === studentId);
        };
        owned = checkChildren(uSnap?.exists ? uSnap.data() : null) || checkChildren(pSnap?.exists ? pSnap.data() : null);
      }
    } else {
      owned = String(student.schoolId || "") === ownerId;
    }
    if (!owned) throw new Error("STUDENT_OWNER_MISMATCH");
    return { id: snap.id, ...student };
  }
  throw new Error("STUDENT_NOT_FOUND");
};
const derivePlanId = (value: unknown) => { const text = String(value || "").toLowerCase(); if (text.includes("intensive") || text.includes("1-on-1") || text.includes("mentorship")) return "plan_mentorship"; if (text.includes("robotic") || text.includes("iot") || text.includes("hardware") || text.includes("ai")) return "plan_robotics"; if (text.includes("school") && text.includes("cbt")) return "school_cbt"; return "plan_weekend"; };

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const authToken = token(event); if (!authToken) return json(401, { error: "Authentication required." });
    const decoded = await adminAuth.verifyIdToken(authToken);
    const user = await getUserRecord(decoded.uid, decoded.email); if (!isActiveRecord(user) || !user.role) return json(403, { error: "An active portal profile is required before making a payment." });
    const actualRole = normaliseRole(user.role);
    const body = JSON.parse(event.body || "{}"); const requestedRole = String(body.role || actualRole).toLowerCase();
    if (requestedRole !== actualRole) return json(403, { error: "Payment role does not match your active portal role." });
    if (!["parent", "school", "student"].includes(actualRole)) return json(403, { error: "This account is not eligible to make tuition payments." });

    let policyAudit: PaymentPolicyAuditRecord;
    try {
      policyAudit = assertAndBuildPaymentPolicyAudit(body, decoded.uid);
    } catch {
      return json(400, { error: "You must read and agree to the Payment Policy before proceeding to Paystack." });
    }

    const config = await getPaymentConfig();
    let planId = String(body.planId || "").trim();
    const enrollmentRequestId = String(body.enrollmentRequestId || "").trim();
    let enrollment: Record<string, any> | null = null;
    let student: Record<string, any> | null = null;
    let studentId = String(body.studentId || "").trim();
    let assignedBilling = (user as any).billing || null;
    let plan: PaymentPlan | undefined;

    if (enrollmentRequestId) {
      if (actualRole !== "parent") return json(400, { error: "Enrollment-linked payments are available to parents only." });
      const snap = await adminDb.collection("enrollment_requests").doc(enrollmentRequestId).get();
      if (!snap.exists) return json(404, { error: "Enrollment request could not be found." });
      enrollment = snap.data() || {};
      if (String(enrollment.parentId || "") !== decoded.uid) return json(403, { error: "You are not authorized to pay for this enrollment." });
      if (String(enrollment.paymentStatus || "").toUpperCase() === "PAID") return json(409, { error: "This enrollment has already been paid." });
      planId = planId || String(enrollment.planId || "").trim() || derivePlanId(enrollment.plan);
      studentId = studentId || String(enrollment.studentId || "").trim();
    }

    // Multi-item hierarchical tuition checkout for parents: verify every student & resolve fees from DB
    const verifiedMultiItems: Array<{
      id: string;
      childId: string;
      childName: string;
      programId: string;
      programName: string;
      tutorId: string;
      tutorName: string;
      amount: number;
    }> = [];

    if (actualRole === "parent" && Array.isArray(body.selectedItems) && body.selectedItems.length > 0) {
      for (const rawItem of body.selectedItems) {
        const cId = String(rawItem?.childId || "").trim();
        if (!cId) return json(400, { error: "Each selected tuition item must reference a valid student." });
        const verifiedChild: Record<string, any> | null = await findStudent(cId, decoded.uid, "parent", decoded.email);
        if (!verifiedChild) return json(404, { error: "Selected student could not be found." });

        const resolved = await resolveTrustedStudentFeeAndTutor({
          student: verifiedChild,
          programId: String(rawItem?.programId || "").trim(),
          programName: String(rawItem?.programName || "").trim(),
          config,
          parentBilling: assignedBilling
        });

        if (resolved.amount <= 0) {
          return json(400, { error: `No approved tuition fee is configured for ${verifiedChild.fullName || verifiedChild.studentName || "the selected student"}.` });
        }

        verifiedMultiItems.push({
          id: String(rawItem?.id || `${cId}_${resolved.programId}`),
          childId: cId,
          childName: String(verifiedChild.fullName || verifiedChild.studentName || verifiedChild.name || rawItem?.childName || "Enrolled Child"),
          programId: resolved.programId,
          programName: resolved.programName,
          tutorId: resolved.tutorId,
          tutorName: resolved.tutorName || "Assigned Tutor",
          amount: resolved.amount
        });
      }

      const sumAmount = Number(verifiedMultiItems.reduce((acc, item) => acc + item.amount, 0).toFixed(2));
      const uniqueChildNames = Array.from(new Set(verifiedMultiItems.map(i => i.childName).filter(Boolean)));
      const compositeName = uniqueChildNames.length > 0
        ? `Tuition: ${uniqueChildNames.join(", ")} (${verifiedMultiItems.length} Program${verifiedMultiItems.length > 1 ? "s" : ""})`
        : `Tuition Settlement (${verifiedMultiItems.length} Items)`;

      plan = {
        id: "parent_multi_tuition",
        name: compositeName,
        baseAmount: sumAmount,
        durationWeeks: 4,
        teachingModes: ["Standard Delivery", "Hybrid / Physical"],
        description: "Verified multi-programme parent tuition settlement",
        role: "student",
        active: true
      };
      planId = plan.id;
    }

    // Resolve single student for parent or student role before resolving fees
    if (actualRole === "parent" && studentId && verifiedMultiItems.length === 0) {
      student = await findStudent(studentId, decoded.uid, "parent", decoded.email);
    }

    // =========================================================================
    // DEDICATED SELF-FUNDED STUDENT PROGRAMME ENROLMENT CHECKOUT
    // Supports individual students AND school students paying personally
    // (never parent-enrolled child accounts; never charges or bills schools).
    // =========================================================================
    const programmeEnrollmentId = String(body.programmeEnrollmentId || "").trim();
    if (actualRole === "student" && programmeEnrollmentId) {
      if (String((user as any).parentId || "").trim()) {
        return json(403, {
          error: "Billing for parent-managed student accounts is handled from the Parent Portal.",
        });
      }

      const progEnrollSnap = await adminDb
        .collection("programme_enrollments")
        .doc(programmeEnrollmentId)
        .get();
      if (!progEnrollSnap.exists) {
        return json(404, { error: "Approved programme enrolment record not found." });
      }
      const progEnroll = progEnrollSnap.data() || {};
      if (String(progEnroll.studentUid || "") !== decoded.uid) {
        return json(403, { error: "You are not authorized to pay for this programme enrolment." });
      }
      if (String(progEnroll.billingResponsibility || "") !== "STUDENT_SELF_FUNDED") {
        return json(403, { error: "This enrolment is not configured for student self-funded billing." });
      }

      const requestedOption = String(body.paymentOption || "").toLowerCase() as
        | "full"
        | "deposit"
        | "balance"
        | "renewal"
        | "";
      const payable = computeStudentProgrammePayableAmount({
        enrollment: progEnroll,
        paymentOption: requestedOption || undefined,
      });

      if (payable.payableAmount <= 0) {
        return json(400, {
          error: "This programme enrolment has no payable outstanding balance right now.",
        });
      }

      // Resolve student payment email — accept explicit payerEmail if school student has no real email; NEVER use school email
      const candidateEmails = [
        String(body.payerEmail || "").trim().toLowerCase(),
        String(progEnroll.studentEmail || "").trim().toLowerCase(),
        String(decoded.email || "").trim().toLowerCase(),
        String((user as any).email || "").trim().toLowerCase(),
      ].filter((e) => e.includes("@") && !e.endsWith(".local") && !e.endsWith(".invalid"));

      const paymentEmail = candidateEmails[0] || "";
      if (!paymentEmail) {
        return json(400, {
          error: "Please enter a valid personal email address to receive your Paystack receipt.",
          code: "STUDENT_PAYMENT_EMAIL_REQUIRED",
        });
      }

      const chargePreview = calculateCustomerCharge(
        payable.payableAmount,
        getFeePolicy(config, "student_self_funded")
      );
      if (!process.env.PAYSTACK_SECRET_KEY) {
        return json(503, { error: "Payment gateway is not configured." });
      }
      const callbackRoot = resolveSafeCallbackOrigin(event);
      const callbackUrl = `${callbackRoot}/portal/student/payments?enrollmentId=${encodeURIComponent(
        programmeEnrollmentId
      )}&paymentProvider=paystack`;

      const durationWeeks = Math.max(1, Number(progEnroll.durationWeeks || 8));
      const planLabel = String(progEnroll.programTitle || "Programme Tuition");
      const paystackPayload = buildPaystackInitializePayload({
        email: paymentEmail,
        amountMinor: Math.round(payable.payableAmount * 100),
        callbackUrl,
        metadata: {
          billingContext: "STUDENT_PROGRAMME_ENROLLMENT",
          billingResponsibility: "STUDENT_SELF_FUNDED",
          programmeEnrollmentId,
          programId: String(progEnroll.programId || ""),
          programSlug: String(progEnroll.programSlug || ""),
          programTitle: planLabel,
          paymentOption: payable.resolvedOption,
          isRenewal: payable.isRenewal,
          userId: decoded.uid,
          role: "student",
          planRole: "student",
          planId: `prog_enr_${String(progEnroll.programId || programmeEnrollmentId)}`,
          planName: planLabel,
          baseAmount: payable.payableAmount,
          estimatedTransactionFee: chargePreview.transactionFee,
          estimatedCustomerTotal: chargePreview.totalAmount,
          durationWeeks,
          teachingMode: String(progEnroll.deliveryOption || "PUBLIC_GROUP"),
          studentId: String(progEnroll.studentDocId || (user as any).studentDocId || decoded.uid),
          studentName: String(progEnroll.studentName || (user as any).name || "Student"),
          // Keep schoolId strictly null so self-funded student payments NEVER appear in school billing totals
          schoolId: null,
          affiliatedSchoolId: String(progEnroll.schoolId || "") || null,
          checkoutProvider: "paystack",
          paymentSource: "Student Self-Funded Programme Payment",
          ...policyAudit,
        },
      });

      const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paystackPayload),
      });
      const psData = await psRes.json();
      if (!psRes.ok || !psData.status || !psData.data?.authorization_url) {
        console.error("Paystack initialization failed (programme enrollment):", psData);
        return json(502, { error: "Unable to initialize Paystack checkout right now." });
      }

      // Persist last initiated payment email & reference on the enrollment record
      await adminDb
        .collection("programme_enrollments")
        .doc(programmeEnrollmentId)
        .set(
          {
            lastPaymentReference: psData.data.reference,
            studentEmail: progEnroll.studentEmail || paymentEmail,
            updatedAt: new Date(),
          },
          { merge: true }
        );

      return json(200, {
        authorizationUrl: psData.data.authorization_url,
        reference: psData.data.reference,
        programmeEnrollmentId,
        planName: planLabel,
        paymentOption: payable.resolvedOption,
        baseAmount: payable.payableAmount,
        transactionFee: chargePreview.transactionFee,
        totalAmount: chargePreview.totalAmount,
        feeIsEstimated: true,
        feeSource: "Paystack checkout",
        durationWeeks,
      });
    }

    if (actualRole === "student") {
      if (String((user as any).parentId || "").trim()) {
        return json(403, {
          error: "Billing for parent-managed student accounts is handled from the Parent Portal.",
        });
      }
      studentId = studentId || String((user as any).studentDocId || "").trim();
      if (!studentId || !String((user as any).studentDocId || "").trim()) {
        return json(403, { error: "Your student profile is not ready for billing." });
      }
      let studentLookup = await adminDb.collection("individualStudents").doc(studentId).get();
      if (!studentLookup.exists) {
        studentLookup = await adminDb.collection("students").doc(studentId).get();
      }
      if (!studentLookup.exists || String(studentLookup.data()?.firebaseUid || studentLookup.data()?.userId || "") !== decoded.uid) {
        return json(403, { error: "Your student profile could not be verified." });
      }
      const sDocData = studentLookup.data() || {};
      if (String(sDocData.parentId || sDocData.parentUid || "").trim()) {
        return json(403, {
          error: "Billing for parent-managed student accounts is handled from the Parent Portal.",
        });
      }
      if (String(sDocData.schoolId || (user as any).schoolId || "").trim()) {
        return json(403, {
          error: "School-sponsored programmes are billed to your school. Select an approved self-funded additional programme to pay personally.",
        });
      }
      student = { id: studentLookup.id, ...sDocData };
    }

    let schoolDocData: Record<string, any> | null = null;
    let fullSchoolContractAmount = 0;
    let appliedPaymentPercentage = 100;
    let calculatedRemainingBalance = 0;

    if (actualRole === "school") {
      const sId = String((user as any).schoolId || decoded.uid);
      const schoolSnap = await adminDb.collection("schools").doc(sId).get();
      if (schoolSnap.exists) {
        schoolDocData = schoolSnap.data() || {};
        if (schoolDocData.billing) assignedBilling = schoolDocData.billing;
      }
      if (studentId) student = await findStudent(studentId, sId, "school");
    }

    // Resolve authoritative single-student fee for parent or student
    if ((actualRole === "parent" || actualRole === "student") && student && verifiedMultiItems.length === 0) {
      const resolved = await resolveTrustedStudentFeeAndTutor({
        student,
        programId: planId,
        programName: String(body.planName || "").trim(),
        config,
        parentBilling: assignedBilling
      });
      if (resolved.amount > 0) {
        assignedBilling = {
          planId: resolved.programId,
          planName: resolved.programName,
          baseAmount: resolved.amount,
          cycle: String(student.cycle || "monthly"),
          status: "ACTIVE"
        };
        planId = assignedBilling.planId;
      }
    }

    // If parent is paying an enrollment request before the student record exists, use the request's database fee
    if (actualRole === "parent" && !student && enrollment && verifiedMultiItems.length === 0) {
      const enrollmentAmount = Number(enrollment.tuitionFee ?? enrollment.fee ?? enrollment.amount ?? enrollment.paymentBaseAmount ?? 0);
      if (enrollmentAmount > 0) {
        assignedBilling = {
          planId: String(enrollment.planId || planId || "assigned_enrollment_plan"),
          planName: String(enrollment.programName || enrollment.programTitle || enrollment.plan || "Assigned Tuition Plan"),
          baseAmount: enrollmentAmount,
          cycle: String(enrollment.cycle || "monthly"),
          status: "ACTIVE"
        };
        planId = assignedBilling.planId;
      }
    }

    // For school accounts, check school billing or school assigned programmes
    if (actualRole === "school" && schoolDocData) {
      let schoolBase = Number(assignedBilling?.baseAmount || 0);
      let schoolPlanName = String(assignedBilling?.planName || "School Learning Partnership");
      let schoolPlanId = String(assignedBilling?.planId || planId || "school_assigned_plan");

      if (schoolBase <= 0 && Array.isArray(schoolDocData.programs) && schoolDocData.programs.length > 0) {
        const targetProg = schoolDocData.programs.find((p: any) => p && typeof p === "object" && (p.id === planId || p.programId === planId || p.name === body.planName)) || schoolDocData.programs[0];
        if (targetProg && typeof targetProg === "object") {
          const pFee = Number(targetProg.price ?? targetProg.tuitionFee ?? targetProg.fee ?? targetProg.amount ?? 0);
          if (pFee > 0) {
            schoolBase = pFee;
            schoolPlanName = String(targetProg.title || targetProg.name || schoolPlanName);
            schoolPlanId = String(targetProg.id || targetProg.programId || schoolPlanId);
          }
        }
      }

      if (schoolBase <= 0 && config.plans[planId]?.role === "school") {
        schoolBase = Number(config.plans[planId].baseAmount);
        schoolPlanName = config.plans[planId].name;
        schoolPlanId = config.plans[planId].id;
      }

      if (schoolBase > 0) {
        fullSchoolContractAmount = schoolBase;
        const isPartial = isPartiallyPaidStatus(assignedBilling?.status);
        const existingRemaining = Number(assignedBilling?.remainingBalance || 0);
        const requestedPct = Number(body.paymentPercentage || 100);
        const validPct = [100, 70, 50].includes(requestedPct) ? requestedPct : 100;

        let payableNow = schoolBase;
        if (isPartial && existingRemaining > 0 && requestedPct === 100) {
          payableNow = existingRemaining;
          appliedPaymentPercentage = 100;
          calculatedRemainingBalance = 0;
        } else if (validPct < 100) {
          payableNow = Number(((schoolBase * validPct) / 100).toFixed(2));
          appliedPaymentPercentage = validPct;
          calculatedRemainingBalance = Number(Math.max(0, schoolBase - payableNow).toFixed(2));
        }

        assignedBilling = {
          ...(assignedBilling || {}),
          planId: schoolPlanId,
          planName: schoolPlanName,
          baseAmount: payableNow,
          fullContractAmount: schoolBase,
          cycle: String(assignedBilling?.cycle || body.cycle || "termly"),
          status: "ACTIVE"
        };
        planId = schoolPlanId;
      }
    }

    if (!plan && verifiedMultiItems.length === 0 && assignedBilling && Number(assignedBilling.baseAmount) > 0 && String(assignedBilling.status || "ACTIVE").toUpperCase() !== "DISABLED") {
      const cycle = String(assignedBilling.cycle || body.cycle || "monthly").toLowerCase();
      const isPartial = isPartiallyPaidStatus(assignedBilling.status);
      const existingRemaining = Number(assignedBilling.remainingBalance || 0);
      const authoritativeBase = actualRole !== "school" && isPartial && existingRemaining > 0
        ? existingRemaining
        : Number(assignedBilling.baseAmount);

      plan = {
        id: String(assignedBilling.planId || planId || "assigned_plan"),
        name: String(assignedBilling.planName || (actualRole === "school" ? "School Learning Partnership" : "Assigned Tuition Plan")),
        baseAmount: authoritativeBase,
        durationWeeks: cycle === "termly" ? 12 : 4,
        teachingModes: ["Standard Delivery", "Hybrid / Physical"],
        description: "Database-verified billing plan",
        role: actualRole === "school" ? "school" : "student",
        active: true
      };
      planId = plan.id;
    }

    if (!plan && planId && config.plans[planId]) {
      plan = config.plans[planId];
    }

    if (plan && !plan.active) plan = { ...plan, active: true };
    if (!plan || !(Number(plan.baseAmount) > 0)) {
      return json(400, { error: "No approved payment plan or tuition fee was found for this account." });
    }
    if (actualRole === "school" && plan.role !== "school") return json(400, { error: "Please select a valid school payment plan." });
    if (actualRole !== "school" && plan.role !== "student") return json(400, { error: "Please select a valid student/parent payment plan." });
    if (actualRole === "parent" && !studentId && !enrollmentRequestId && !assignedBilling && verifiedMultiItems.length === 0) {
      return json(400, { error: "Select the child or programme this parent payment is for." });
    }

    const teachingMode = String(body.teachingMode || enrollment?.teachingMode || enrollment?.modeOfTeaching || student?.teachingMode || plan.teachingModes[0] || "Standard delivery").trim();
    const durationWeeks = actualRole === "school" ? Math.max(1, Number(enrollment?.durationWeeks || plan.durationWeeks || 12)) : 4;
    const resolvedTutorId = String(
      enrollment?.tutorId ||
      student?.tutorId ||
      student?.staffId ||
      student?.assignedTutorId ||
      student?.assignedStaffId ||
      student?.instructorId ||
      (verifiedMultiItems.length > 0 ? verifiedMultiItems[0].tutorId : "")
    ).trim();
    const schoolId = actualRole === "school" ? String((user as any).schoolId || decoded.uid) : String(student?.schoolId || "").trim();
    const feeRole = actualRole === "school" ? "school" : "parent";

    const chargePreview = calculateCustomerCharge(plan.baseAmount, getFeePolicy(config, feeRole));
    if (!process.env.PAYSTACK_SECRET_KEY) return json(503, { error: "Payment gateway is not configured." });
    const callbackRoot = resolveSafeCallbackOrigin(event);
    const callbackPath = actualRole === "school" ? "/portal/school/payments" : actualRole === "parent" ? "/portal/parent/payments" : "/portal/student/payments";
    const callbackParams = new URLSearchParams({ paymentProvider: "paystack" });
    if (enrollmentRequestId) callbackParams.set("enrollmentId", enrollmentRequestId);

    const paystackPayload = buildPaystackInitializePayload({
      email: decoded.email,
      amountMinor: Math.round(plan.baseAmount * 100),
      callbackUrl: `${callbackRoot}${callbackPath}?${callbackParams.toString()}`,
      metadata: {
        userId: decoded.uid,
        role: actualRole,
        planRole: plan.role,
        planId,
        planName: plan.name,
        baseAmount: plan.baseAmount,
        fullContractAmount: fullSchoolContractAmount || plan.baseAmount,
        paymentPercentage: appliedPaymentPercentage,
        remainingBalance: calculatedRemainingBalance,
        estimatedTransactionFee: chargePreview.transactionFee,
        estimatedCustomerTotal: chargePreview.totalAmount,
        durationWeeks,
        teachingMode,
        studentId: studentId || (verifiedMultiItems.length > 0 ? verifiedMultiItems[0].childId : null),
        studentName: student?.fullName || student?.studentName || enrollment?.studentName || (verifiedMultiItems.length > 0 ? Array.from(new Set(verifiedMultiItems.map(i => i.childName))).join(", ") : null),
        tutorId: resolvedTutorId || null,
        selectedItems: verifiedMultiItems.length > 0 ? verifiedMultiItems : null,
        studentIds: verifiedMultiItems.length > 0 ? Array.from(new Set(verifiedMultiItems.map(i => i.childId))) : (studentId ? [studentId] : []),
        enrollmentRequestId: enrollmentRequestId || null,
        schoolId: schoolId || null,
        checkoutProvider: "paystack",
        paymentSource: String(body.paymentSource || (actualRole === "school" ? "School Institutional Settlement" : actualRole === "student" ? "Student Portal Settlement" : "Parent Account Settlement")),
        ...policyAudit
      }
    });

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(paystackPayload)
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data?.authorization_url) { console.error("Paystack initialization failed:", data); return json(502, { error: "Unable to initialize payment." }); }

    if (enrollmentRequestId) {
      await adminDb.collection("enrollment_requests").doc(enrollmentRequestId).set({
        planId,
        teachingMode,
        durationWeeks,
        paymentPlanName: plan.name,
        paymentBaseAmount: plan.baseAmount,
        paymentTransactionFee: chargePreview.transactionFee,
        paymentTotal: chargePreview.totalAmount,
        paymentFeeStatus: "PAYSTACK_CALCULATED_AT_CHECKOUT",
        studentId: studentId || null,
        tutorId: resolvedTutorId || null,
        schoolId: schoolId || null,
        paymentReference: data.data.reference,
        paymentStatus: "PENDING",
        ...policyAudit,
        updatedAt: new Date()
      }, { merge: true });
    }
    return json(200, {
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      planId,
      planName: plan.name,
      baseAmount: plan.baseAmount,
      transactionFee: chargePreview.transactionFee,
      totalAmount: chargePreview.totalAmount,
      feeIsEstimated: true,
      feeSource: "Paystack checkout",
      durationWeeks,
      teachingMode,
      studentId: studentId || null,
      tutorId: resolvedTutorId || null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "STUDENT_OWNER_MISMATCH") return json(403, { error: "That student is not linked to your account." });
    if (code === "STUDENT_NOT_FOUND") return json(404, { error: "The selected student could not be found." });
    console.error("Payment initialization error:", error); return json(500, { error: "Unable to authenticate or initialize this payment." });
  }
};

