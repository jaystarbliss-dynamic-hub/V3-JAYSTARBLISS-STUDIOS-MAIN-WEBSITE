import type { Handler } from "@netlify/functions";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import { sendProgrammeAdmissionEmail } from "../../api/_lib/email";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const PRIVILEGED_ADMIN_ROLES = new Set([
  "ADMIN",
  "SUPER_ADMIN",
  "SUPERADMIN",
  "EDUCATION_ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SERVICES_ADMIN",
  "MARKETING_ADMIN",
  "SUPPORT_ADMIN",
  "OPERATIONS_ADMIN",
  "DIRECTOR",
  "PROPRIETOR",
]);

const KNOWN_PLATFORM_ADMIN_EMAILS = new Set([
  "johnrufai242@gmail.com",
  "admin@jaystarbliss.com",
  "admin@jaystarbliss-studios.name.ng",
  "admin@jaystar.com",
]);

export function isPlatformEnrollmentAdminRole(roleRaw: unknown, emailRaw?: unknown): boolean {
  const email = String(emailRaw || "").toLowerCase().trim();
  if (email && KNOWN_PLATFORM_ADMIN_EMAILS.has(email)) return true;
  const role = String(roleRaw || "").toUpperCase().trim();
  if (!role || role === "SCHOOL_ADMIN" || role === "SCHOOLADMIN" || role === "SCHOOL") {
    return false;
  }
  return PRIVILEGED_ADMIN_ROLES.has(role);
}

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!idToken) {
      return jsonResponse(401, { error: "Missing Authorization Bearer token." });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const callerEmail = String(decoded.email || "").toLowerCase().trim();

    // Verify caller has platform-admin privileges (explicitly excluding SCHOOL_ADMIN)
    let callerRole = String((decoded as any).role || "");
    let callerName = String(decoded.name || callerEmail || "Administrator");
    let authorized = isPlatformEnrollmentAdminRole(callerRole, callerEmail);
    if (!authorized) {
      const [userSnap, adminDocSnap] = await Promise.all([
        adminDb.collection("users").doc(callerUid).get(),
        adminDb.collection("admins").doc(callerUid).get(),
      ]);
      if (userSnap.exists) {
        const uData = userSnap.data() || {};
        callerRole = String(uData.role || "");
        callerName = String(uData.fullName || uData.name || callerName);
      }
      authorized = adminDocSnap.exists || isPlatformEnrollmentAdminRole(callerRole, callerEmail);
    }
    if (!authorized) {
      return jsonResponse(403, { error: "Platform administrator privileges are required for this action." });
    }

    const body = JSON.parse(event.body || "{}");
    const action = String(body.action || "").trim();
    const enrollmentId = String(body.enrollmentId || "").trim();

    if (!enrollmentId) {
      return jsonResponse(400, { error: "enrollmentId is required." });
    }

    const enrollRef = adminDb.collection("programme_enrollments").doc(enrollmentId);
    const enrollSnap = await enrollRef.get();
    if (!enrollSnap.exists) {
      return jsonResponse(404, { error: "Programme enrolment record not found." });
    }

    const current = enrollSnap.data() || {};

    // =========================================================================
    // ACTION 1: APPROVE PROGRAMME APPLICATION & SET AUTHORITATIVE FEE TERMS
    // =========================================================================
    if (action === "approve") {
      const approvedFee = Math.round(Number(body.approvedFee));
      if (!Number.isFinite(approvedFee) || approvedFee <= 0) {
        return jsonResponse(400, { error: "A valid positive approvedFee amount is required." });
      }

      const billingCycle = String(body.billingCycle || current.billingCycle || "Per Term / Cohort").trim();
      const durationWeeks = Number(body.durationWeeks || current.durationWeeks || 8) || 8;
      const allowDepositAccess = Boolean(body.allowDepositAccess);
      const depositAmount = allowDepositAccess ? Math.round(Number(body.depositAmount || 0)) : 0;
      const adminNotes = String(body.adminNotes || "").trim();
      const feeSource = String(body.feeSource || current.feeSource || "ADMIN_APPROVED").trim();

      if (allowDepositAccess && (depositAmount <= 0 || depositAmount >= approvedFee)) {
        return jsonResponse(400, {
          error: "Deposit amount must be greater than 0 and less than the total approved fee.",
        });
      }

      const alreadyPaid = Math.max(0, Number(current.amountPaid || 0));
      const remainingBalance = Math.max(0, approvedFee - alreadyPaid);
      const nextStatus =
        remainingBalance === 0
          ? "ACTIVE"
          : alreadyPaid > 0
          ? "PARTIALLY_PAID"
          : "APPROVED_AWAITING_PAYMENT";
      const nextPaymentStatus =
        remainingBalance === 0 ? "PAID" : alreadyPaid > 0 ? "PARTIALLY_PAID" : "UNPAID";

      const approvalUpdate = {
        approvedFee,
        remainingBalance,
        billingCycle,
        durationWeeks,
        allowDepositAccess,
        depositAmount,
        feeSource,
        adminNotes,
        enrollmentStatus: nextStatus,
        paymentStatus: nextPaymentStatus,
        billingResponsibility: "STUDENT_SELF_FUNDED",
        approvedBy: callerUid,
        approvedByName: callerName,
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await enrollRef.set(approvalUpdate, { merge: true });

      // Permanent audit trail for admission approval
      await adminDb.collection("adminAuditLogs").add({
        action: "PROGRAMME_ENROLLMENT_APPROVED",
        actorUid: callerUid,
        actorEmail: callerEmail,
        actorName: callerName,
        targetType: "PROGRAMME_ENROLLMENT",
        targetId: enrollmentId,
        metadata: {
          studentUid: current.studentUid || null,
          studentName: current.studentName || null,
          programId: current.programId || null,
          programTitle: current.programTitle || null,
          approvedFee,
          remainingBalance,
          billingCycle,
          durationWeeks,
          allowDepositAccess,
          depositAmount,
          previousStatus: current.enrollmentStatus || null,
          newStatus: nextStatus,
        },
        createdAt: new Date().toISOString(),
      }).catch(() => undefined);

      // Idempotent in-app notification using deterministic doc ID
      const notifId = `prog_adm_${enrollmentId}`;
      const recipientUid = String(current.studentUid || "").trim();
      const recipientDocId = String(current.studentDocId || "").trim();
      const paymentPath = `/portal/student/payments?enrollmentId=${encodeURIComponent(enrollmentId)}`;
      const notifPayloadBase = {
        title: `Admission Approved: ${current.programTitle || "Programme"}`,
        message: `Your application for ${current.programTitle || "your programme"} has been approved (Tuition Fee: ₦${approvedFee.toLocaleString()}). Click below to open your Billing section and complete payment to activate access.`,
        type: "billing",
        subType: "PROGRAMME_ADMISSION_APPROVED",
        priority: "high",
        enrollmentId,
        programId: current.programId || "",
        link: paymentPath,
        actionUrl: paymentPath,
        linkText: "Open Billing & Pay Now",
        actionText: "Open Billing & Pay Now",
        senderName: callerName || "Jaystarbliss Admissions",
        senderRole: "Admissions Office",
        read: false,
        readBy: [],
        timestamp: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      };
      if (recipientUid) {
        await adminDb
          .collection("notifications")
          .doc(notifId)
          .set(
            {
              ...notifPayloadBase,
              userId: recipientUid,
              recipientId: recipientUid,
              targetUid: recipientUid,
              recipientType: "specific_user",
            },
            { merge: true }
          );
      }
      if (recipientDocId && recipientDocId !== recipientUid) {
        await adminDb
          .collection("notifications")
          .doc(`${notifId}_doc`)
          .set(
            {
              ...notifPayloadBase,
              userId: recipientDocId,
              recipientId: recipientDocId,
              targetUid: recipientUid || recipientDocId,
              recipientType: "specific_user",
            },
            { merge: true }
          );
      }

      // Send branded admission email AFTER persisting approval (never roll back on email failure)
      const recipientEmail = String(current.studentEmail || "").trim();
      let emailDeliveryStatus: "SENT" | "FAILED" | "SKIPPED_NO_EMAIL" = "SKIPPED_NO_EMAIL";
      let emailDeliveryError: string | null = null;

      if (recipientEmail && recipientEmail.includes("@") && !recipientEmail.endsWith(".local")) {
        const emailResult = await sendProgrammeAdmissionEmail({
          to: recipientEmail,
          studentName: String(current.studentName || "Student"),
          programTitle: String(current.programTitle || "Programme"),
          enrollmentId,
          approvedFee,
          remainingBalance,
          billingCycle,
          allowDepositAccess,
          depositAmount,
          currency: String(current.currency || "NGN"),
          adminNotes,
        });

        if (emailResult.success) {
          emailDeliveryStatus = "SENT";
        } else {
          emailDeliveryStatus = "FAILED";
          emailDeliveryError = emailResult.error || "Email provider failed to send.";
        }
      }

      await enrollRef.set(
        {
          emailDeliveryStatus,
          emailDeliveryError,
          emailLastAttemptAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return jsonResponse(200, {
        success: true,
        enrollmentId,
        enrollmentStatus: nextStatus,
        approvedFee,
        remainingBalance,
        emailSent: emailDeliveryStatus === "SENT",
        emailError: emailDeliveryError,
        emailDeliveryStatus,
        emailDeliveryError,
      });
    }

    // =========================================================================
    // ACTION 2: REJECT PROGRAMME APPLICATION
    // =========================================================================
    if (action === "reject") {
      const reason = String(
        body.rejectionReason || body.reason || "Application not approved at this time."
      ).trim();
      const adminNotes = String(body.adminNotes || current.adminNotes || "").trim();

      await enrollRef.set(
        {
          enrollmentStatus: "REJECTED",
          rejectionReason: reason,
          adminNotes,
          reviewedBy: callerUid,
          reviewedByName: callerName,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await adminDb.collection("adminAuditLogs").add({
        action: "PROGRAMME_ENROLLMENT_REJECTED",
        actorUid: callerUid,
        actorEmail: callerEmail,
        actorName: callerName,
        targetType: "PROGRAMME_ENROLLMENT",
        targetId: enrollmentId,
        metadata: {
          studentUid: current.studentUid || null,
          studentName: current.studentName || null,
          programId: current.programId || null,
          programTitle: current.programTitle || null,
          rejectionReason: reason,
          previousStatus: current.enrollmentStatus || null,
        },
        createdAt: new Date().toISOString(),
      }).catch(() => undefined);

      const recipientUid = String(current.studentUid || "").trim();
      if (recipientUid) {
        await adminDb
          .collection("notifications")
          .doc(`prog_rej_${enrollmentId}`)
          .set(
            {
              userId: recipientUid,
              recipientId: recipientUid,
              title: `Programme Application Update: ${current.programTitle || "Programme"}`,
              message: reason,
              type: "PROGRAMME_APPLICATION_UPDATE",
              enrollmentId,
              read: false,
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }

      return jsonResponse(200, {
        success: true,
        enrollmentId,
        enrollmentStatus: "REJECTED",
      });
    }

    // =========================================================================
    // ACTION 3: RETRY ADMISSION EMAIL DELIVERY
    // =========================================================================
    if (action === "retry_email") {
      const recipientEmail = String(body.overrideEmail || current.studentEmail || "").trim();
      if (!recipientEmail || !recipientEmail.includes("@") || recipientEmail.endsWith(".local")) {
        return jsonResponse(400, {
          error: "Student does not have a valid email address on file for email delivery.",
        });
      }

      const approvedFee = Number(current.approvedFee || 0);
      const remainingBalance = Number(current.remainingBalance ?? approvedFee);

      const emailResult = await sendProgrammeAdmissionEmail({
        to: recipientEmail,
        studentName: String(current.studentName || "Student"),
        programTitle: String(current.programTitle || "Programme"),
        enrollmentId,
        approvedFee,
        remainingBalance,
        billingCycle: String(current.billingCycle || "Per Term / Cohort"),
        allowDepositAccess: Boolean(current.allowDepositAccess),
        depositAmount: Number(current.depositAmount || 0),
        currency: String(current.currency || "NGN"),
        adminNotes: String(current.adminNotes || ""),
      });

      const emailDeliveryStatus = emailResult.success ? "SENT" : "FAILED";
      const emailDeliveryError = emailResult.success
        ? null
        : emailResult.error || "Email delivery retry failed.";

      await enrollRef.set(
        {
          emailDeliveryStatus,
          emailDeliveryError,
          emailLastAttemptAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return jsonResponse(200, {
        success: emailResult.success,
        emailSent: emailDeliveryStatus === "SENT",
        emailError: emailDeliveryError,
        emailDeliveryStatus,
        emailDeliveryError,
      });
    }

    return jsonResponse(400, { error: `Unsupported action: ${action}` });
  } catch (err: any) {
    console.error("programme-enrollment-admin error:", err);
    return jsonResponse(500, {
      error: err?.message || "Internal server error processing programme enrolment.",
    });
  }
};
