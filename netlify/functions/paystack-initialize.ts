import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import { calculateCustomerCharge, getFeePolicy, getPaymentConfig, getUserRecord, normaliseRole, isActiveRecord } from "../../api/_lib/billing";

const token = (event: any) => { const header = event.headers?.authorization || event.headers?.Authorization || ""; return header.startsWith("Bearer ") ? header.slice(7) : ""; };
const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
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
      owned = (sParentId && sParentId === ownerId) || (parentEmailNorm && sParentEmail === parentEmailNorm);
      if (!owned) {
        // Also check parent doc in users / parents collections
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
    const user = await getUserRecord(decoded.uid); if (!isActiveRecord(user) || !user.role) return json(403, { error: "An active portal profile is required before making a payment." });
    const actualRole = normaliseRole(user.role);
    const body = JSON.parse(event.body || "{}"); const requestedRole = String(body.role || actualRole).toLowerCase();
    if (requestedRole !== actualRole) return json(403, { error: "Payment role does not match your active portal role." });
    if (!["parent", "school", "student"].includes(actualRole)) return json(403, { error: "This account is not eligible to make tuition payments." });

    const config = await getPaymentConfig();
    let planId = String(body.planId || "").trim();
    const enrollmentRequestId = String(body.enrollmentRequestId || "").trim();
    let enrollment: Record<string, any> | null = null;
    let student: Record<string, any> | null = null;
    let studentId = String(body.studentId || "").trim();

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

    // Multi-item hierarchical tuition checkout for parents
    let multiItems: any[] = [];
    if (actualRole === "parent" && Array.isArray(body.selectedItems) && body.selectedItems.length > 0) {
      multiItems = body.selectedItems;
      for (const item of multiItems) {
        const cId = String(item.childId || "").trim();
        if (cId) {
          await findStudent(cId, decoded.uid, "parent", decoded.email);
        }
      }
      const sumAmount = multiItems.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      const uniqueChildNames = Array.from(new Set(multiItems.map((i: any) => i.childName).filter(Boolean)));
      const compositeName = body.planName || (uniqueChildNames.length > 0 
        ? `Tuition: ${uniqueChildNames.join(", ")} (${multiItems.length} Program${multiItems.length > 1 ? 's' : ''})`
        : `Tuition Settlement (${multiItems.length} Items)`);
      
      plan = {
        id: "parent_multi_tuition",
        name: compositeName,
        baseAmount: sumAmount,
        durationWeeks: 4,
        teachingModes: ["Standard Delivery", "Hybrid / Physical"],
        role: "student",
        active: true
      };
      planId = plan.id;
    }

    // Resolve the selected child before applying any parent billing configuration.
    // For parent payments, the approved child's tuitionFee/fee is the authoritative
    // amount whenever it exists. This prevents a stale parent-level billing record
    // (for example ₦45,000) from replacing an approved child fee (for example ₦35,000).
    if (actualRole === "parent" && studentId && multiItems.length === 0) {
      student = await findStudent(studentId, decoded.uid, "parent", decoded.email);
    }

    const customAmount = Number(body.amount || body.customAmount || 0);
    if (!plan) plan = config.plans[planId];

    let assignedBilling = (user as any).billing || null;
    let schoolDocData: any = null;
    if (actualRole === "school") {
      const sId = String((user as any).schoolId || decoded.uid);
      const schoolSnap = await adminDb.collection("schools").doc(sId).get();
      if (schoolSnap.exists) {
        schoolDocData = schoolSnap.data() || {};
        if (schoolDocData.billing) assignedBilling = schoolDocData.billing;
      }
    }

    // Parent billing is child-specific when the selected student has an approved fee.
    if (actualRole === "parent" && student && multiItems.length === 0) {
      const childAmount = Number(student.tuitionFee ?? student.fee ?? student.amount ?? 0);
      if (childAmount > 0) {
        assignedBilling = {
          planId: String(student.programId || planId || "assigned_student_plan"),
          planName: String(student.programName || student.programTitle || student.plan || student.track || body.planName || "Assigned Tuition Plan"),
          baseAmount: childAmount,
          cycle: String(student.cycle || "monthly"),
          status: "ACTIVE"
        };
        planId = assignedBilling.planId;
      }
    }

    // If the parent is paying an enrollment request before the student record exists,
    // use the amount recorded on the request when available.
    if (actualRole === "parent" && !student && enrollment && multiItems.length === 0) {
      const enrollmentAmount = Number(enrollment.tuitionFee ?? enrollment.fee ?? enrollment.amount ?? 0);
      if (enrollmentAmount > 0) {
        assignedBilling = {
          planId: String(enrollment.planId || planId || "assigned_enrollment_plan"),
          planName: String(enrollment.programName || enrollment.programTitle || enrollment.plan || body.planName || "Assigned Tuition Plan"),
          baseAmount: enrollmentAmount,
          cycle: String(enrollment.cycle || "monthly"),
          status: "ACTIVE"
        };
        planId = assignedBilling.planId;
      }
    }

    // Admin-assigned billing remains authoritative for records without a child-specific
    // approved fee. Client custom amounts are accepted only when explicitly permitted.
    if (!multiItems.length && assignedBilling && Number(assignedBilling.baseAmount) > 0 && assignedBilling.status !== "DISABLED") {
      const cycle = String(assignedBilling.cycle || body.cycle || "monthly").toLowerCase();
      const baseAmt = customAmount > 0 && Boolean(body.allowCustomAmount) ? customAmount : Number(assignedBilling.baseAmount);
      plan = {
        id: String(assignedBilling.planId || planId || "assigned_plan"),
        name: String(assignedBilling.planName || body.planName || (actualRole === "school" ? "Fees/Payments" : "Assigned Tuition Plan")),
        baseAmount: baseAmt,
        durationWeeks: cycle === "termly" ? 12 : 4,
        teachingModes: ["Standard Delivery", "Hybrid / Physical"],
        role: actualRole === "school" ? "school" : "student",
        active: true
      };
      planId = plan.id;
    }

    if (!plan && customAmount > 0) {
      plan = {
        id: planId || "custom_plan",
        name: String(body.planName || (actualRole === "school" ? "Institutional Partner Fee" : actualRole === "parent" ? "Parent Tuition Fee" : "Course Tuition Fee")),
        baseAmount: customAmount,
        durationWeeks: actualRole === "school" ? (String(body.cycle || "").toLowerCase() === "termly" ? 12 : 4) : 4,
        teachingModes: ["Standard Delivery", "Hybrid / Physical"],
        role: actualRole === "school" ? "school" : "student",
        active: true
      };
      planId = plan.id;
    }

    if (plan && !plan.active) plan = { ...plan, active: true };
    if (!plan) return json(400, { error: "The selected payment plan or fee is unavailable." });
    if (actualRole === "school" && plan.role !== "school" && !customAmount && !assignedBilling) return json(400, { error: "Please select a school payment plan." });
    if (actualRole !== "school" && plan.role !== "student" && !customAmount && !assignedBilling) return json(400, { error: "Please select a parent/student payment plan." });
    if (actualRole === "parent" && !studentId && !enrollmentRequestId && !customAmount && !assignedBilling && multiItems.length === 0) return json(400, { error: "Select the child or program this parent payment is for." });

    if (actualRole === "school") {
      const schoolId = String((user as any).schoolId || decoded.uid);
      if (studentId) student = await findStudent(studentId, schoolId, "school");
    }
    if (actualRole === "student") {
      studentId = studentId || String((user as any).studentDocId || "");
      if (!studentId || !String((user as any).studentDocId || "")) return json(403, { error: "Your student profile is not ready for billing." });
      const studentLookup = await adminDb.collection("individualStudents").doc(studentId).get();
      if (!studentLookup.exists || String(studentLookup.data()?.firebaseUid || studentLookup.data()?.userId || "") !== decoded.uid) return json(403, { error: "Your student profile could not be verified." });
      student = { id: studentLookup.id, ...studentLookup.data() };
    }

    const teachingMode = String(body.teachingMode || enrollment?.teachingMode || enrollment?.modeOfTeaching || student?.teachingMode || plan.teachingModes[0] || "Standard delivery").trim();
    const durationWeeks = actualRole === "school" ? Math.max(1, Number(body.durationWeeks || enrollment?.durationWeeks || plan.durationWeeks)) : 4;
    const tutorId = String(enrollment?.tutorId || student?.tutorId || student?.staffId || student?.assignedTutorId || student?.assignedStaffId || student?.instructorId || "").trim();
    const schoolId = actualRole === "school" ? String((user as any).schoolId || decoded.uid) : String(student?.schoolId || "").trim();
    const feeRole = actualRole === "school" ? "school" : "parent";

    // Paystack is configured to pass transaction fees to the customer. Only the base
    // tuition amount is sent to Paystack. The estimated gateway fee is metadata/UI data.
    const chargePreview = calculateCustomerCharge(plan.baseAmount, getFeePolicy(config, feeRole));
    const paymentMethod = String(body.paymentMethod || "card").toLowerCase();
    const channelMap: Record<string, string> = { card: "card", bank_transfer: "bank_transfer", opay: "mobile_money" };
    const channel = channelMap[paymentMethod];
    if (!channel) return json(400, { error: "Unsupported payment method." });
    if (!process.env.PAYSTACK_SECRET_KEY) return json(503, { error: "Payment gateway is not configured." });
    const callbackRoot = process.env.PUBLIC_APP_URL; if (!callbackRoot) return json(500, { error: "Payment callback is not configured." });
    const callbackPath = actualRole === "school" ? "/portal/school/payments" : actualRole === "parent" ? "/portal/parent/payments" : "/portal/student/payments";

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: decoded.email,
        amount: Math.round(plan.baseAmount * 100),
        currency: "NGN",
        callback_url: `${callbackRoot.replace(/\/$/, "")}${callbackPath}`,
        channels: [channel],
        metadata: {
          userId: decoded.uid,
          role: actualRole,
          planRole: plan.role,
          planId,
          planName: plan.name,
          baseAmount: plan.baseAmount,
          estimatedTransactionFee: chargePreview.transactionFee,
          estimatedCustomerTotal: chargePreview.totalAmount,
          durationWeeks,
          teachingMode,
          studentId: studentId || (multiItems.length > 0 ? multiItems[0].childId : null),
          studentName: student?.fullName || student?.studentName || enrollment?.studentName || (multiItems.length > 0 ? Array.from(new Set(multiItems.map(i => i.childName))).join(", ") : null),
          tutorId: tutorId || (multiItems.length > 0 ? multiItems[0].tutorId : null),
          selectedItems: multiItems.length > 0 ? multiItems : null,
          studentIds: multiItems.length > 0 ? Array.from(new Set(multiItems.map(i => i.childId))) : (studentId ? [studentId] : []),
          enrollmentRequestId: enrollmentRequestId || null,
          schoolId: schoolId || null,
          paymentMethod,
          paymentSource: String(body.paymentSource || "Parent Account Settlement")
        }
      })
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data?.authorization_url) { console.error("Paystack initialization failed:", data); return json(502, { error: "Unable to initialize payment." }); }

    if (enrollmentRequestId) await adminDb.collection("enrollment_requests").doc(enrollmentRequestId).set({ planId, teachingMode, durationWeeks, paymentPlanName: plan.name, paymentBaseAmount: plan.baseAmount, paymentTransactionFee: chargePreview.transactionFee, paymentTotal: chargePreview.totalAmount, paymentFeeStatus: "PAYSTACK_CALCULATED_AT_CHECKOUT", studentId: studentId || null, tutorId: tutorId || null, schoolId: schoolId || null, paymentReference: data.data.reference, paymentStatus: "PENDING", updatedAt: new Date() }, { merge: true });
    return json(200, { authorizationUrl: data.data.authorization_url, reference: data.data.reference, planId, planName: plan.name, baseAmount: plan.baseAmount, transactionFee: chargePreview.transactionFee, totalAmount: chargePreview.totalAmount, feeIsEstimated: true, feeSource: "Paystack checkout", durationWeeks, teachingMode, studentId: studentId || null, tutorId: tutorId || null });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "STUDENT_OWNER_MISMATCH") return json(403, { error: "That student is not linked to your account." });
    if (code === "STUDENT_NOT_FOUND") return json(404, { error: "The selected student could not be found." });
    console.error("Payment initialization error:", error); return json(500, { error: "Unable to authenticate or initialize this payment." });
  }
};
