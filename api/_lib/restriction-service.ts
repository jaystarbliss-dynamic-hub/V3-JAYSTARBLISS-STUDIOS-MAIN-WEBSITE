/**
 * Server-Side Account Restriction, Bulk Locking, Audit History & Deduplicated Notification Service
 *
 * Uses Firebase Admin SDK strictly on trusted server routes.
 * Guarantees:
 * - Every manual lock / suspension creates a separate traceable `accountRestrictions/{restrictionId}` record
 * - Mandatory lock reason + custom explanation for OTHER + separate private internal note vs user-facing message
 * - Bulk confirmation preview with exact linked students & programmes affected before execution
 * - Per-account validation & execution reporting (never silently reports partial failure as full success)
 * - Append-only audit logs in `restrictionAuditLogs` and `adminAuditLogs`
 * - Deduplicated notifications via `restrictionNotificationLogs/{restrictionId}__{recipientKey}`
 * - Never disables Firebase Auth accounts during portal lockdown
 * - Never clears unpaid balances or marks invoices paid on manual unlock
 */

import { randomUUID } from "node:crypto";
import { adminDb } from "./firebase-admin";
import { normaliseRole } from "./billing";
import { buildBrandedEmailHtml, createPortalNotification, RESEND_CONFIG, sendResendEmail } from "./email";
import { formatLagosDate, parseDateSafe } from "./subscription-core";
import { loadActiveRestrictionsForScope } from "./subscription-service";
import {
  type AccountRestrictionRecord,
  type BulkLockPreviewItem,
  type BulkLockPreviewResult,
  type BulkLockTargetInput,
  type LockReasonCode,
  type RestrictedScope,
  type RestrictionTargetAccountType,
  type RestrictionType,
  buildRestrictionNotificationId,
  getLockReasonLabel,
  isPaymentReasonCode,
  isRestrictionActiveAt,
  validateManualLockInput,
  validateManualUnlockInput,
} from "./restriction-core";

const asString = (v: unknown) => String(v ?? "").trim();

function isRealEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return Boolean(e && e.includes("@") && !e.endsWith(".local") && !e.endsWith(".invalid"));
}

export function resolveSubscriptionIdForTarget(target: BulkLockTargetInput): string {
  const explicit = asString(target.subscriptionId);
  if (explicit) return explicit;
  const accountId = asString(
    target.accountId || target.schoolId || target.parentId || target.studentId || target.programmeEnrollmentId
  );
  if (!accountId) return "";
  switch (target.accountType) {
    case "SCHOOL":
      return `school_${accountId}`;
    case "SCHOOL_ADMIN":
      return `school_admin_${accountId}`;
    case "PARENT":
      return `parent_${accountId}`;
    case "PARENT_CHILD":
      return target.parentId && target.studentId
        ? `parent_${asString(target.parentId)}_child_${asString(target.studentId)}`
        : `student_${accountId}`;
    case "STUDENT_SELF_FUNDED_PROGRAMME":
      return `prog_enr_${asString(target.programmeEnrollmentId || accountId)}`;
    case "INDIVIDUAL_STUDENT":
    default:
      return `student_${accountId}`;
  }
}

export interface ResolvedTargetContext {
  targetKey: string;
  subscriptionId: string;
  accountType: RestrictionTargetAccountType;
  accountId: string;
  accountName: string;
  schoolId: string | null;
  parentId: string | null;
  studentId: string | null;
  programmeEnrollmentId: string | null;
  recipientUid: string | null;
  recipientEmail: string | null;
  recipientRole: "school" | "parent" | "student";
  affectedStudentIds: string[];
  linkedStudentSampleNames: string[];
  affectedProgrammeIds: string[];
  affectedProgrammeNames: string[];
  restrictedScope: RestrictedScope;
  valid: boolean;
  validationError: string | null;
}

/**
 * Resolves and validates a single target account along with its linked dependent learners and programmes.
 */
export async function resolveRestrictionTargetContext(
  target: BulkLockTargetInput,
  cascadesToLinkedLearners: boolean
): Promise<ResolvedTargetContext> {
  const accountType = (asString(target.accountType).toUpperCase() || "SCHOOL") as RestrictionTargetAccountType;
  const accountId = asString(
    target.accountId || target.schoolId || target.parentId || target.studentId || target.programmeEnrollmentId
  );
  const subscriptionId = resolveSubscriptionIdForTarget(target);
  const targetKey = `${accountType}:${accountId || subscriptionId}:${asString(target.programmeEnrollmentId)}`;

  const baseInvalid = (validationError: string): ResolvedTargetContext => ({
    targetKey,
    subscriptionId,
    accountType,
    accountId,
    accountName: asString(target.accountName) || accountId || "Unknown Account",
    schoolId: asString(target.schoolId) || null,
    parentId: asString(target.parentId) || null,
    studentId: asString(target.studentId) || null,
    programmeEnrollmentId: asString(target.programmeEnrollmentId) || null,
    recipientUid: null,
    recipientEmail: null,
    recipientRole: accountType === "SCHOOL" || accountType === "SCHOOL_ADMIN" ? "school" : accountType === "PARENT" || accountType === "PARENT_CHILD" ? "parent" : "student",
    affectedStudentIds: [],
    linkedStudentSampleNames: [],
    affectedProgrammeIds: [],
    affectedProgrammeNames: [],
    restrictedScope: accountType === "SCHOOL" ? "INSTITUTION" : accountType === "STUDENT_SELF_FUNDED_PROGRAMME" ? "PROGRAMME" : "ACCOUNT",
    valid: false,
    validationError,
  });

  if (!accountId && !subscriptionId) {
    return baseInvalid("Missing accountId or subscriptionId.");
  }

  // 1. SCHOOL
  if (accountType === "SCHOOL") {
    const schoolId = asString(target.schoolId || accountId);
    const schoolSnap = await adminDb.collection("schools").doc(schoolId).get().catch(() => null);
    const subSnap = subscriptionId
      ? await adminDb.collection("billingSubscriptions").doc(subscriptionId).get().catch(() => null)
      : null;

    if (!schoolSnap?.exists && !subSnap?.exists) {
      return baseInvalid(`School account "${schoolId}" was not found.`);
    }

    const sData = schoolSnap?.exists ? (schoolSnap.data() || {}) : {};
    const subData = subSnap?.exists ? (subSnap.data() || {}) : {};
    const schoolName = asString(sData.schoolName || sData.name || subData.accountName || target.accountName || "Partner School");
    const contactEmail = asString(sData.contactEmail || sData.email || subData.recipientEmail);

    // Find school admin user UID & linked school students
    const [schoolUsersSnap, studentsSnap, indStudentsSnap] = await Promise.all([
      adminDb.collection("users").where("schoolId", "==", schoolId).limit(300).get().catch(() => null),
      adminDb.collection("students").where("schoolId", "==", schoolId).limit(500).get().catch(() => null),
      adminDb.collection("individualStudents").where("schoolId", "==", schoolId).limit(500).get().catch(() => null),
    ]);

    let schoolAdminUid: string | null = asString(sData.adminUid || sData.ownerUid) || null;
    let schoolAdminEmail: string = contactEmail;
    const studentMap = new Map<string, string>();

    schoolUsersSnap?.docs.forEach((docSnap) => {
      const u = docSnap.data() || {};
      const r = normaliseRole(u.role);
      if (r === "school") {
        if (!schoolAdminUid) schoolAdminUid = docSnap.id;
        if (!schoolAdminEmail && u.email) schoolAdminEmail = asString(u.email);
      } else if (r === "student" && cascadesToLinkedLearners) {
        const sid = asString(u.studentDocId || docSnap.id);
        studentMap.set(sid, asString(u.fullName || u.name || u.email || sid));
      }
    });

    if (cascadesToLinkedLearners) {
      for (const snap of [studentsSnap, indStudentsSnap]) {
        snap?.docs.forEach((docSnap) => {
          const st = docSnap.data() || {};
          if (asString(st.registrationSource).toLowerCase() === "parent-enrollment-approved") return;
          studentMap.set(docSnap.id, asString(st.fullName || st.studentName || st.name || docSnap.id));
        });
      }
    }

    const progIds = Array.isArray(sData.selectedProgramIds)
      ? sData.selectedProgramIds.map(asString).filter(Boolean)
      : Array.isArray(sData.assignedProgramIds)
      ? sData.assignedProgramIds.map(asString).filter(Boolean)
      : [];
    const progNames = Array.isArray(sData.enrolledPrograms)
      ? sData.enrolledPrograms.map(asString).filter(Boolean)
      : subData.planName
      ? [asString(subData.planName)]
      : [asString(sData.plan || "Institutional Programme")];

    return {
      targetKey,
      subscriptionId: subscriptionId || `school_${schoolId}`,
      accountType: "SCHOOL",
      accountId: schoolId,
      accountName: schoolName,
      schoolId,
      parentId: null,
      studentId: null,
      programmeEnrollmentId: null,
      recipientUid: schoolAdminUid,
      recipientEmail: schoolAdminEmail || null,
      recipientRole: "school",
      affectedStudentIds: Array.from(studentMap.keys()),
      linkedStudentSampleNames: Array.from(studentMap.values()).slice(0, 6),
      affectedProgrammeIds: progIds,
      affectedProgrammeNames: progNames,
      restrictedScope: "INSTITUTION",
      valid: true,
      validationError: null,
    };
  }

  // 2. SCHOOL_ADMIN (specific school administrator account)
  if (accountType === "SCHOOL_ADMIN") {
    const userSnap = await adminDb.collection("users").doc(accountId).get().catch(() => null);
    if (!userSnap?.exists) {
      return baseInvalid(`School administrator "${accountId}" was not found.`);
    }
    const u = userSnap.data() || {};
    if (normaliseRole(u.role) !== "school") {
      return baseInvalid(`User "${accountId}" is not a school administrator account.`);
    }
    return {
      targetKey,
      subscriptionId: subscriptionId || `school_admin_${accountId}`,
      accountType: "SCHOOL_ADMIN",
      accountId,
      accountName: asString(u.fullName || u.name || u.email || "School Administrator"),
      schoolId: asString(u.schoolId || target.schoolId) || null,
      parentId: null,
      studentId: null,
      programmeEnrollmentId: null,
      recipientUid: accountId,
      recipientEmail: asString(u.email) || null,
      recipientRole: "school",
      affectedStudentIds: [],
      linkedStudentSampleNames: [],
      affectedProgrammeIds: [],
      affectedProgrammeNames: ["School Administration Access"],
      restrictedScope: "ACCOUNT",
      valid: true,
      validationError: null,
    };
  }

  // 3. PARENT
  if (accountType === "PARENT") {
    const parentId = asString(target.parentId || accountId);
    const [userSnap, subSnap] = await Promise.all([
      adminDb.collection("users").doc(parentId).get().catch(() => null),
      subscriptionId ? adminDb.collection("billingSubscriptions").doc(subscriptionId).get().catch(() => null) : Promise.resolve(null),
    ]);
    if (!userSnap?.exists && !subSnap?.exists) {
      return baseInvalid(`Parent account "${parentId}" was not found.`);
    }
    const u = userSnap?.exists ? (userSnap.data() || {}) : {};
    const subData = subSnap?.exists ? (subSnap.data() || {}) : {};
    const parentName = asString(u.fullName || u.name || subData.accountName || target.accountName || "Parent Account");
    const parentEmail = asString(u.email || subData.recipientEmail);

    const childMap = new Map<string, string>();
    const progIds = new Set<string>();
    const progNames = new Set<string>();

    if (cascadesToLinkedLearners) {
      const [indSnap, stdSnap] = await Promise.all([
        adminDb.collection("individualStudents").where("parentId", "==", parentId).limit(100).get().catch(() => null),
        adminDb.collection("students").where("parentId", "==", parentId).limit(100).get().catch(() => null),
      ]);
      for (const snap of [indSnap, stdSnap]) {
        snap?.docs.forEach((docSnap) => {
          const c = docSnap.data() || {};
          childMap.set(docSnap.id, asString(c.fullName || c.studentName || c.name || docSnap.id));
          if (c.programId) progIds.add(asString(c.programId));
          if (c.programTitle || c.programName) progNames.add(asString(c.programTitle || c.programName));
        });
      }
    }

    return {
      targetKey,
      subscriptionId: subscriptionId || `parent_${parentId}`,
      accountType: "PARENT",
      accountId: parentId,
      accountName: parentName,
      schoolId: null,
      parentId,
      studentId: null,
      programmeEnrollmentId: null,
      recipientUid: parentId,
      recipientEmail: parentEmail || null,
      recipientRole: "parent",
      affectedStudentIds: Array.from(childMap.keys()),
      linkedStudentSampleNames: Array.from(childMap.values()).slice(0, 6),
      affectedProgrammeIds: Array.from(progIds),
      affectedProgrammeNames: progNames.size > 0 ? Array.from(progNames) : ["Parent Family Programme"],
      restrictedScope: "ACCOUNT",
      valid: true,
      validationError: null,
    };
  }

  // 4. PARENT_CHILD
  if (accountType === "PARENT_CHILD") {
    const childId = asString(target.studentId || accountId);
    const parentId = asString(target.parentId);
    const [indSnap, stdSnap, subSnap, parentSnap] = await Promise.all([
      adminDb.collection("individualStudents").doc(childId).get().catch(() => null),
      adminDb.collection("students").doc(childId).get().catch(() => null),
      subscriptionId ? adminDb.collection("billingSubscriptions").doc(subscriptionId).get().catch(() => null) : Promise.resolve(null),
      parentId ? adminDb.collection("users").doc(parentId).get().catch(() => null) : Promise.resolve(null),
    ]);
    const cData = indSnap?.exists ? (indSnap.data() || {}) : stdSnap?.exists ? (stdSnap.data() || {}) : null;
    const subData = subSnap?.exists ? (subSnap.data() || {}) : null;
    if (!cData && !subData) {
      return baseInvalid(`Parent-enrolled child "${childId}" was not found.`);
    }
    const resolvedParentId = parentId || asString(cData?.parentId || cData?.parentUid || subData?.parentId);
    const pData = parentSnap?.exists
      ? (parentSnap.data() || {})
      : resolvedParentId
      ? ((await adminDb.collection("users").doc(resolvedParentId).get().catch(() => null))?.data() || {})
      : {};
    const childName = asString(cData?.fullName || cData?.name || subData?.studentName || target.accountName || "Enrolled Child");
    const progName = asString(cData?.programTitle || cData?.programName || subData?.programmeName || "Child Learning Programme");

    return {
      targetKey,
      subscriptionId: subscriptionId || (resolvedParentId ? `parent_${resolvedParentId}_child_${childId}` : `student_${childId}`),
      accountType: "PARENT_CHILD",
      accountId: childId,
      accountName: childName,
      schoolId: null,
      parentId: resolvedParentId || null,
      studentId: childId,
      programmeEnrollmentId: null,
      recipientUid: resolvedParentId || null,
      recipientEmail: asString(pData?.email || cData?.parentEmail || subData?.recipientEmail) || null,
      recipientRole: "parent",
      affectedStudentIds: [childId],
      linkedStudentSampleNames: [childName],
      affectedProgrammeIds: cData?.programId ? [asString(cData.programId)] : [],
      affectedProgrammeNames: [progName],
      restrictedScope: "PROGRAMME",
      valid: true,
      validationError: null,
    };
  }

  // 5. STUDENT_SELF_FUNDED_PROGRAMME (programme-level entitlement restriction)
  if (accountType === "STUDENT_SELF_FUNDED_PROGRAMME") {
    const enrollId = asString(target.programmeEnrollmentId || accountId.replace(/^prog_enr_/, ""));
    const [enrollSnap, subSnap] = await Promise.all([
      adminDb.collection("programme_enrollments").doc(enrollId).get().catch(() => null),
      subscriptionId ? adminDb.collection("billingSubscriptions").doc(subscriptionId).get().catch(() => null) : Promise.resolve(null),
    ]);
    if (!enrollSnap?.exists && !subSnap?.exists) {
      return baseInvalid(`Programme entitlement "${enrollId}" was not found.`);
    }
    const eData = enrollSnap?.exists ? (enrollSnap.data() || {}) : {};
    const subData = subSnap?.exists ? (subSnap.data() || {}) : {};
    const studentUid = asString(eData.studentUid || subData.accountId || target.accountId);
    const studentDocId = asString(eData.studentDocId || subData.studentId || studentUid);
    const studentName = asString(eData.studentName || subData.accountName || target.accountName || "Student");
    const progId = asString(eData.programId || subData.programmeId);
    const progName = asString(eData.programTitle || subData.programmeName || subData.planName || "Self-Funded Programme");

    return {
      targetKey,
      subscriptionId: subscriptionId || `prog_enr_${enrollId}`,
      accountType: "STUDENT_SELF_FUNDED_PROGRAMME",
      accountId: enrollId,
      accountName: `${studentName} — ${progName}`,
      schoolId: null,
      parentId: null,
      studentId: studentDocId || null,
      programmeEnrollmentId: enrollId,
      recipientUid: studentUid || null,
      recipientEmail: asString(eData.studentEmail || subData.recipientEmail) || null,
      recipientRole: "student",
      affectedStudentIds: studentDocId ? [studentDocId] : [],
      linkedStudentSampleNames: [studentName],
      affectedProgrammeIds: progId ? [progId] : [enrollId],
      affectedProgrammeNames: [progName],
      restrictedScope: "PROGRAMME",
      valid: true,
      validationError: null,
    };
  }

  // 6. INDIVIDUAL_STUDENT
  const [userSnap, indSnap, stdSnap, subSnap] = await Promise.all([
    adminDb.collection("users").doc(accountId).get().catch(() => null),
    adminDb.collection("individualStudents").doc(accountId).get().catch(() => null),
    adminDb.collection("students").doc(accountId).get().catch(() => null),
    subscriptionId ? adminDb.collection("billingSubscriptions").doc(subscriptionId).get().catch(() => null) : Promise.resolve(null),
  ]);
  const uData = userSnap?.exists ? (userSnap.data() || {}) : null;
  const sData = indSnap?.exists ? (indSnap.data() || {}) : stdSnap?.exists ? (stdSnap.data() || {}) : null;
  const subData = subSnap?.exists ? (subSnap.data() || {}) : null;

  if (!uData && !sData && !subData) {
    return baseInvalid(`Individual student account "${accountId}" was not found.`);
  }

  const studentName = asString(
    uData?.fullName || uData?.name || sData?.fullName || sData?.name || subData?.accountName || target.accountName || "Student"
  );
  const studentEmail = asString(uData?.email || sData?.email || subData?.recipientEmail);
  const studentDocId = asString(uData?.studentDocId || sData?.id || accountId);
  const progName = asString(sData?.programName || sData?.plan || subData?.planName || "Individual Learning Programme");

  return {
    targetKey,
    subscriptionId: subscriptionId || `student_${accountId}`,
    accountType: "INDIVIDUAL_STUDENT",
    accountId,
    accountName: studentName,
    schoolId: null,
    parentId: null,
    studentId: studentDocId,
    programmeEnrollmentId: null,
    recipientUid: userSnap?.exists ? accountId : asString(sData?.userId || sData?.authUid) || null,
    recipientEmail: studentEmail || null,
    recipientRole: "student",
    affectedStudentIds: [studentDocId],
    linkedStudentSampleNames: [studentName],
    affectedProgrammeIds: sData?.programId ? [asString(sData.programId)] : [],
    affectedProgrammeNames: [progName],
    restrictedScope: "ACCOUNT",
    valid: true,
    validationError: null,
  };
}

/**
 * Generates a server-validated dry-run confirmation preview before applying single or bulk restrictions.
 */
export async function buildBulkLockPreview(input: {
  targets: BulkLockTargetInput[];
  reasonCode: unknown;
  customReason?: unknown;
  userFacingMessage: unknown;
  internalAdminNote?: unknown;
  restrictionType?: unknown;
  effectiveAt?: unknown;
  expiresAt?: unknown;
  cascadesToLinkedLearners?: boolean;
}): Promise<BulkLockPreviewResult> {
  const now = new Date();
  const validation = validateManualLockInput({
    reasonCode: input.reasonCode,
    customReason: input.customReason,
    userFacingMessage: input.userFacingMessage,
    internalAdminNote: input.internalAdminNote,
    restrictionType: input.restrictionType,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    now,
  });

  const cascades = input.cascadesToLinkedLearners !== false;
  const rawTargets = Array.isArray(input.targets) ? input.targets : [];

  // Deduplicate explicitly selected targets
  const seenKeys = new Set<string>();
  const uniqueTargets: BulkLockTargetInput[] = [];
  for (const t of rawTargets) {
    const key = `${asString(t.accountType).toUpperCase()}:${asString(t.accountId || t.subscriptionId)}:${asString(t.programmeEnrollmentId)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueTargets.push(t);
    }
  }

  const errors: string[] = [...validation.errors];
  if (uniqueTargets.length === 0) {
    errors.push("Select at least one account or programme entitlement.");
  }

  const resolvedContexts = await Promise.all(
    uniqueTargets.map((t) => resolveRestrictionTargetContext(t, cascades))
  );

  const items: BulkLockPreviewItem[] = resolvedContexts.map((ctx) => ({
    targetKey: ctx.targetKey,
    subscriptionId: ctx.subscriptionId,
    accountType: ctx.accountType,
    accountId: ctx.accountId,
    accountName: ctx.accountName,
    recipientEmail: ctx.recipientEmail,
    linkedStudentCount: ctx.affectedStudentIds.length,
    linkedStudentSampleNames: ctx.linkedStudentSampleNames,
    affectedStudentIds: ctx.affectedStudentIds,
    affectedProgrammeIds: ctx.affectedProgrammeIds,
    affectedProgrammeNames: ctx.affectedProgrammeNames,
    cascadesToLinkedLearners:
      cascades && (ctx.accountType === "SCHOOL" || ctx.accountType === "PARENT"),
    valid: ctx.valid,
    validationError: ctx.validationError,
  }));

  const validItems = items.filter((i) => i.valid);
  const invalidItems = items.filter((i) => !i.valid);
  const totalLinkedStudentsAffected = validItems.reduce((sum, i) => sum + i.linkedStudentCount, 0);
  const totalProgrammesAffected = validItems.reduce(
    (sum, i) => sum + Math.max(i.affectedProgrammeIds.length, i.affectedProgrammeNames.length),
    0
  );

  const sanitized = validation.sanitized;
  const reasonCode: LockReasonCode = sanitized?.reasonCode || "ADMINISTRATIVE_RESTRICTION";
  const restrictionType: RestrictionType = sanitized?.restrictionType || "MANUAL_ADMINISTRATIVE_RESTRICTION";
  const effectiveAt = sanitized?.effectiveAt || now;
  const expiresAt = sanitized?.expiresAt || null;

  return {
    valid: errors.length === 0 && invalidItems.length === 0 && validItems.length > 0,
    selectedCount: items.length,
    validCount: validItems.length,
    invalidCount: invalidItems.length,
    totalLinkedStudentsAffected,
    totalProgrammesAffected,
    restrictionType,
    reasonCode,
    reasonLabel: getLockReasonLabel(reasonCode, sanitized?.customReason),
    customReason: sanitized?.customReason || null,
    userFacingMessage: sanitized?.userFacingMessage || String(input.userFacingMessage || "").trim(),
    effectiveAtIso: effectiveAt.toISOString(),
    effectiveAtFormatted: formatLagosDate(effectiveAt),
    expiresAtIso: expiresAt ? expiresAt.toISOString() : null,
    expiresAtFormatted: formatLagosDate(expiresAt),
    cascadesToLinkedLearners: cascades,
    items,
    errors,
  };
}

/**
 * Sends a deduplicated in-app + email notification for a manual account restriction.
 * NEVER includes `internalAdminNote`!
 */
async function dispatchRestrictionNotification(params: {
  record: AccountRestrictionRecord;
  ctx: ResolvedTargetContext;
}): Promise<string | null> {
  const { record, ctx } = params;
  const recipientKey = ctx.recipientUid || ctx.recipientEmail || ctx.accountId;
  if (!recipientKey) return null;

  const notificationEventId = buildRestrictionNotificationId(record.restrictionId, recipientKey);
  const logRef = adminDb.collection("restrictionNotificationLogs").doc(notificationEventId);
  const nowIso = new Date().toISOString();

  // Atomic idempotency guard: if this notification event already exists, do not send a duplicate
  try {
    await logRef.create({
      notificationEventId,
      restrictionId: record.restrictionId,
      targetAccountId: record.targetAccountId,
      targetAccountType: record.targetAccountType,
      recipientUid: ctx.recipientUid || null,
      recipientEmail: ctx.recipientEmail || null,
      reasonCode: record.reasonCode,
      status: "DISPATCHING",
      createdAt: nowIso,
    });
  } catch (err: any) {
    if (err?.code === 6 || String(err?.message || "").includes("ALREADY_EXISTS")) {
      return notificationEventId;
    }
  }

  const isPayment = isPaymentReasonCode(record.reasonCode);
  const reasonLabel = getLockReasonLabel(record.reasonCode, record.customReason);
  const effectiveLabel = formatLagosDate(record.effectiveAt) || "Immediate";
  const expiryLabel = formatLagosDate(record.expiresAt);
  const supportPath = `/portal/${ctx.recipientRole}/support`;
  const billingPath = `/portal/${ctx.recipientRole}/payments`;
  const actionUrl = `${RESEND_CONFIG.websiteUrl}${isPayment ? billingPath : supportPath}`;
  const actionText = isPayment ? "Open Billing Center" : "Contact Support Desk";

  const title = `Portal Access Restricted — ${reasonLabel}`;
  const messageBody = [
    record.userFacingMessage,
    `Effective Date: ${effectiveLabel}.`,
    expiryLabel ? `Expected Restoration / Expiry: ${expiryLabel}.` : null,
    isPayment
      ? "Next Step: Visit your Billing Center to review and settle the balance, or reach our Support Desk if you need assistance."
      : "Next Step: Contact Jaystarbliss Studios Support Desk for guidance and assistance.",
  ]
    .filter(Boolean)
    .join(" ");

  if (ctx.recipientUid) {
    await createPortalNotification({
      recipientId: ctx.recipientUid,
      email: undefined, // Sent separately below with full structured highlightBox
      title,
      message: messageBody,
      type: "ACCOUNT_RESTRICTION_APPLIED",
      actionUrl: isPayment ? billingPath : supportPath,
      actionText,
      data: {
        restrictionId: record.restrictionId,
        restrictionType: record.restrictionType,
        reasonCode: record.reasonCode,
        reasonLabel,
        effectiveAt: record.effectiveAt,
        expiresAt: record.expiresAt || null,
        isPaymentRelated: isPayment,
      },
    }).catch(() => undefined);
  }

  let emailDelivered = false;
  if (ctx.recipientEmail && isRealEmail(ctx.recipientEmail)) {
    const highlightItems: Array<{ label: string; value: string }> = [
      { label: "Account", value: ctx.accountName },
      { label: "Restriction Reason", value: reasonLabel },
      { label: "Effective Date", value: effectiveLabel },
    ];
    if (expiryLabel) {
      highlightItems.push({ label: "Expected Restoration", value: expiryLabel });
    }
    highlightItems.push({
      label: "Support Contact",
      value: `${RESEND_CONFIG.supportEmail} • WhatsApp +234 913 651 8194`,
    });

    const html = buildBrandedEmailHtml({
      title: "Portal Access Restriction Notice",
      previewText: `${reasonLabel} — ${record.userFacingMessage.slice(0, 90)}`,
      greeting: `Dear ${ctx.accountName},`,
      messageLines: [
        record.userFacingMessage,
        isPayment
          ? "You can still sign in to your portal to view your Billing Center, download receipts, or complete your renewal."
          : "You can still sign in to your portal to review this notice and reach our Support Desk for assistance.",
      ],
      highlightBox: {
        title: "Restriction Summary",
        items: highlightItems,
      },
      cta: {
        text: actionText,
        url: actionUrl,
      },
      footerNote:
        "If you believe this restriction was applied in error or need assistance, please contact Jaystarbliss Studios Support Desk.",
    });

    const emailRes = await sendResendEmail({
      to: ctx.recipientEmail,
      subject: `[Jaystarbliss Studios] ${title}`,
      html,
      text: `${title}\n\n${messageBody}\n\nSupport: ${RESEND_CONFIG.supportEmail}`,
    }).catch(() => ({ success: false }));
    emailDelivered = Boolean(emailRes?.success);
  }

  await logRef
    .set(
      {
        status: "SENT",
        inAppSent: Boolean(ctx.recipientUid),
        emailSent: emailDelivered,
        sentAt: new Date().toISOString(),
      },
      { merge: true }
    )
    .catch(() => undefined);

  return notificationEventId;
}

/**
 * Applies a traceable manual restriction to a single resolved target.
 * Never overwrites prior restrictions, never disables Firebase Auth, and preserves financial balances.
 */
export async function applyManualRestrictionToTarget(input: {
  target: BulkLockTargetInput;
  reasonCode: unknown;
  customReason?: unknown;
  userFacingMessage: unknown;
  internalAdminNote?: unknown;
  restrictionType?: unknown;
  effectiveAt?: unknown;
  expiresAt?: unknown;
  cascadesToLinkedLearners?: boolean;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  bulkBatchId?: string | null;
}): Promise<
  | { ok: true; record: AccountRestrictionRecord; linkedStudentCount: number }
  | { ok: false; error: string; targetKey: string }
> {
  const now = new Date();
  const validation = validateManualLockInput({
    reasonCode: input.reasonCode,
    customReason: input.customReason,
    userFacingMessage: input.userFacingMessage,
    internalAdminNote: input.internalAdminNote,
    restrictionType: input.restrictionType,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    now,
  });

  if (!validation.valid || !validation.sanitized) {
    return {
      ok: false,
      error: validation.errors.join(" "),
      targetKey: `${asString(input.target.accountType)}:${asString(input.target.accountId || input.target.subscriptionId)}`,
    };
  }

  const cascades = input.cascadesToLinkedLearners !== false;
  const ctx = await resolveRestrictionTargetContext(input.target, cascades);
  if (!ctx.valid) {
    return {
      ok: false,
      error: ctx.validationError || "Target account could not be validated.",
      targetKey: ctx.targetKey,
    };
  }

  const s = validation.sanitized;
  const nowIso = now.toISOString();
  const restrictionId = `res_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const isScheduled = s.effectiveAt.getTime() > now.getTime();
  const effectiveCascades =
    cascades && (ctx.accountType === "SCHOOL" || ctx.accountType === "PARENT");

  const record: AccountRestrictionRecord = {
    restrictionId,
    targetAccountId: ctx.accountId,
    targetAccountType: ctx.accountType,
    accountName: ctx.accountName,
    schoolId: ctx.schoolId,
    parentId: ctx.parentId,
    studentId: ctx.studentId,
    programmeEnrollmentId: ctx.programmeEnrollmentId,
    affectedStudentIds: ctx.affectedStudentIds,
    affectedProgrammeIds: ctx.affectedProgrammeIds,
    restrictionType: s.restrictionType,
    reasonCode: s.reasonCode,
    customReason: s.customReason,
    userFacingMessage: s.userFacingMessage,
    internalAdminNote: s.internalAdminNote,
    restrictedScope: ctx.restrictedScope,
    cascadesToLinkedLearners: effectiveCascades,
    appliedByUid: input.actorUid,
    appliedByName: input.actorName,
    appliedAt: nowIso,
    effectiveAt: s.effectiveAt.toISOString(),
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    status: isScheduled ? "SCHEDULED" : "ACTIVE",
    liftedByUid: null,
    liftedByName: null,
    liftedAt: null,
    unlockReason: null,
    relatedSubscriptionId: ctx.subscriptionId || null,
    relatedPaymentReference: null,
    notificationEventId: null,
  };

  // 1. Write new standalone traceable restriction record (never overwrites prior records)
  await adminDb.collection("accountRestrictions").doc(restrictionId).set({
    ...record,
    bulkBatchId: input.bulkBatchId || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // 2. Sync summary cache on `billingSubscriptions` & legacy mirrors ONLY if immediately active
  // (Never alters amount, amountPaid, remainingBalance, or paymentHistory!)
  if (!isScheduled && ctx.subscriptionId) {
    const billingResp =
      ctx.accountType === "SCHOOL" || ctx.accountType === "SCHOOL_ADMIN"
        ? "SCHOOL"
        : ctx.accountType === "PARENT" || ctx.accountType === "PARENT_CHILD"
        ? "PARENT"
        : ctx.accountType === "STUDENT_SELF_FUNDED_PROGRAMME"
        ? "STUDENT_SELF_FUNDED"
        : "STUDENT";

    await adminDb
      .collection("billingSubscriptions")
      .doc(ctx.subscriptionId)
      .set(
        {
          id: ctx.subscriptionId,
          accountType: ctx.accountType,
          accountId: ctx.accountId,
          accountName: ctx.accountName,
          ...(ctx.schoolId ? { schoolId: ctx.schoolId } : {}),
          ...(ctx.parentId ? { parentId: ctx.parentId } : {}),
          ...(ctx.studentId ? { studentId: ctx.studentId } : {}),
          ...(ctx.programmeEnrollmentId ? { programmeEnrollmentId: ctx.programmeEnrollmentId } : {}),
          billingResponsibility: billingResp,
          manuallyLocked: true,
          manualLockReason: s.userFacingMessage,
          lockReasonCode: s.reasonCode,
          restrictionType: s.restrictionType,
          manualLockedAt: nowIso,
          manualLockedByUid: input.actorUid,
          manualLockedByName: input.actorName,
          manuallyUnlocked: false,
          status: s.restrictionType === "ADMINISTRATIVE_SUSPENSION" ? "SUSPENDED" : "LOCKED",
          updatedAt: nowIso,
        },
        { merge: true }
      )
      .catch(() => undefined);

    // Legacy mirror sync (strictly scoped — never touches financial amounts)
    const legacyPatch = {
      manuallyLocked: true,
      manualLockReason: s.userFacingMessage,
      lockReasonCode: s.reasonCode,
      manualLockedAt: nowIso,
      manuallyUnlocked: false,
      status: s.restrictionType === "ADMINISTRATIVE_SUSPENSION" ? "SUSPENDED" : "LOCKED",
      updatedAt: nowIso,
      updatedBy: input.actorUid,
    };

    if (ctx.accountType === "SCHOOL" && ctx.schoolId) {
      const schRef = adminDb.collection("schools").doc(ctx.schoolId);
      const schSnap = await schRef.get().catch(() => null);
      if (schSnap?.exists) {
        await schRef
          .set({ billing: { ...(schSnap.data()?.billing || {}), ...legacyPatch }, updatedAt: nowIso }, { merge: true })
          .catch(() => undefined);
      }
    } else if ((ctx.accountType === "PARENT" || ctx.accountType === "INDIVIDUAL_STUDENT") && ctx.accountId) {
      const uRef = adminDb.collection("users").doc(ctx.accountId);
      const uSnap = await uRef.get().catch(() => null);
      if (uSnap?.exists) {
        await uRef
          .set({ billing: { ...(uSnap.data()?.billing || {}), ...legacyPatch }, updatedAt: nowIso }, { merge: true })
          .catch(() => undefined);
      }
    } else if (ctx.accountType === "STUDENT_SELF_FUNDED_PROGRAMME" && ctx.programmeEnrollmentId) {
      await adminDb
        .collection("programme_enrollments")
        .doc(ctx.programmeEnrollmentId)
        .set(
          {
            manuallyLocked: true,
            manualLockReason: s.userFacingMessage,
            lockReasonCode: s.reasonCode,
            manuallyUnlocked: false,
            updatedAt: nowIso,
          },
          { merge: true }
        )
        .catch(() => undefined);
    }
  }

  // 3. Append-only immutable audit trail
  const auditEntry = {
    action: input.bulkBatchId ? "ADMIN_BULK_LOCK_ACCOUNT" : "ADMIN_MANUAL_LOCK_ACCOUNT",
    restrictionId,
    bulkBatchId: input.bulkBatchId || null,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    actorName: input.actorName,
    targetType: ctx.accountType,
    targetAccountType: ctx.accountType,
    targetId: ctx.subscriptionId || ctx.accountId,
    targetAccountId: ctx.accountId,
    accountName: ctx.accountName,
    schoolId: ctx.schoolId,
    parentId: ctx.parentId,
    studentId: ctx.studentId,
    programmeEnrollmentId: ctx.programmeEnrollmentId,
    affectedStudentCount: ctx.affectedStudentIds.length,
    restrictionType: s.restrictionType,
    reasonCode: s.reasonCode,
    reason: getLockReasonLabel(s.reasonCode, s.customReason),
    customReason: s.customReason,
    userFacingMessage: s.userFacingMessage,
    internalAdminNote: s.internalAdminNote,
    effectiveAt: s.effectiveAt.toISOString(),
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    cascadesToLinkedLearners: effectiveCascades,
    createdAt: nowIso,
  };

  await Promise.all([
    adminDb.collection("restrictionAuditLogs").add(auditEntry),
    adminDb.collection("adminAuditLogs").add(auditEntry),
  ]);

  // 4. Dispatch deduplicated user notification (userFacingMessage ONLY — never internalAdminNote)
  const notificationEventId = await dispatchRestrictionNotification({ record, ctx }).catch(() => null);
  if (notificationEventId) {
    record.notificationEventId = notificationEventId;
    await adminDb
      .collection("accountRestrictions")
      .doc(restrictionId)
      .set({ notificationEventId }, { merge: true })
      .catch(() => undefined);
  }

  return { ok: true, record, linkedStudentCount: ctx.affectedStudentIds.length };
}

/**
 * Lifts a specific manual restriction (by `restrictionId`) or all active manual restrictions
 * on an account/subscription.
 * - Requires a mandatory `unlockReason`
 * - NEVER clears unpaid financial balances or marks subscriptions as paid
 * - Returns any remaining active restrictions so admins see if another restriction still blocks access
 */
export async function liftManualRestrictions(input: {
  restrictionId?: string | null;
  subscriptionId?: string | null;
  accountType?: RestrictionTargetAccountType;
  accountId?: string | null;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  programmeEnrollmentId?: string | null;
  unlockReason: unknown;
  mode?: "LIFT_ONLY" | "OPEN" | "AUTO";
  actorUid: string;
  actorEmail: string;
  actorName: string;
}): Promise<
  | {
      ok: true;
      liftedIds: string[];
      remainingActiveRestrictions: AccountRestrictionRecord[];
      hasRemainingPaymentLock: boolean;
    }
  | { ok: false; error: string }
> {
  const unlockValidation = validateManualUnlockInput({ unlockReason: input.unlockReason });
  if (!unlockValidation.valid) {
    return { ok: false, error: unlockValidation.errors.join(" ") };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const liftedIds: string[] = [];
  const mode = input.mode || "LIFT_ONLY";

  let targetAccountId = asString(input.accountId || input.schoolId || input.parentId || input.studentId || input.programmeEnrollmentId);
  let targetAccountType = input.accountType || "SCHOOL";
  let subscriptionId = asString(input.subscriptionId);
  let schoolId = asString(input.schoolId) || null;
  let programmeEnrollmentId = asString(input.programmeEnrollmentId) || null;

  if (input.restrictionId) {
    const docRef = adminDb.collection("accountRestrictions").doc(asString(input.restrictionId));
    const snap = await docRef.get();
    if (!snap.exists) {
      return { ok: false, error: "Restriction record was not found." };
    }
    const rec = { restrictionId: snap.id, ...(snap.data() || {}) } as AccountRestrictionRecord;
    targetAccountId = targetAccountId || rec.targetAccountId;
    targetAccountType = rec.targetAccountType || targetAccountType;
    subscriptionId = subscriptionId || asString(rec.relatedSubscriptionId);
    schoolId = schoolId || rec.schoolId || null;
    programmeEnrollmentId = programmeEnrollmentId || rec.programmeEnrollmentId || null;

    if (rec.status === "ACTIVE" || rec.status === "SCHEDULED") {
      await docRef.set(
        {
          status: "LIFTED",
          liftedByUid: input.actorUid,
          liftedByName: input.actorName,
          liftedAt: nowIso,
          unlockReason: unlockValidation.unlockReason,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      liftedIds.push(rec.restrictionId);

      const auditEntry = {
        action: "ADMIN_LIFT_RESTRICTION",
        restrictionId: rec.restrictionId,
        actorUid: input.actorUid,
        actorEmail: input.actorEmail,
        actorName: input.actorName,
        targetType: rec.targetAccountType,
        targetAccountType: rec.targetAccountType,
        targetId: rec.relatedSubscriptionId || rec.targetAccountId,
        targetAccountId: rec.targetAccountId,
        accountName: rec.accountName || null,
        reasonCode: rec.reasonCode,
        restrictionType: rec.restrictionType,
        unlockReason: unlockValidation.unlockReason,
        reason: unlockValidation.unlockReason,
        createdAt: nowIso,
      };
      await Promise.all([
        adminDb.collection("restrictionAuditLogs").add(auditEntry),
        adminDb.collection("adminAuditLogs").add(auditEntry),
      ]);
    }
  } else {
    // Lift all active MANUAL (non-automated-payment) restrictions on this target
    const active = await loadActiveRestrictionsForScope({
      targetAccountIds: targetAccountId ? [targetAccountId] : [],
      subscriptionIds: subscriptionId ? [subscriptionId] : [],
      programmeEnrollmentId,
      now,
    });

    for (const rec of active) {
      if (rec.restrictionType === "AUTOMATED_PAYMENT_LOCKDOWN") continue;
      await adminDb
        .collection("accountRestrictions")
        .doc(rec.restrictionId)
        .set(
          {
            status: "LIFTED",
            liftedByUid: input.actorUid,
            liftedByName: input.actorName,
            liftedAt: nowIso,
            unlockReason: unlockValidation.unlockReason,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      liftedIds.push(rec.restrictionId);

      const auditEntry = {
        action: "ADMIN_LIFT_RESTRICTION",
        restrictionId: rec.restrictionId,
        actorUid: input.actorUid,
        actorEmail: input.actorEmail,
        actorName: input.actorName,
        targetType: rec.targetAccountType,
        targetAccountType: rec.targetAccountType,
        targetId: rec.relatedSubscriptionId || rec.targetAccountId,
        targetAccountId: rec.targetAccountId,
        accountName: rec.accountName || null,
        reasonCode: rec.reasonCode,
        restrictionType: rec.restrictionType,
        unlockReason: unlockValidation.unlockReason,
        reason: unlockValidation.unlockReason,
        createdAt: nowIso,
      };
      await Promise.all([
        adminDb.collection("restrictionAuditLogs").add(auditEntry),
        adminDb.collection("adminAuditLogs").add(auditEntry),
      ]);
    }
  }

  // Re-check remaining active restrictions for this target
  const remainingAll = await loadActiveRestrictionsForScope({
    targetAccountIds: targetAccountId ? [targetAccountId] : [],
    subscriptionIds: subscriptionId ? [subscriptionId] : [],
    programmeEnrollmentId,
    now,
  });
  const remainingManual = remainingAll.filter((r) => r.restrictionType !== "AUTOMATED_PAYMENT_LOCKDOWN");
  const hasRemainingPaymentLock = remainingAll.some((r) => r.restrictionType === "AUTOMATED_PAYMENT_LOCKDOWN");

  // Update subscription cache flags ONLY — NEVER overwrite financial balance / amountPaid / paymentHistory
  if (subscriptionId) {
    const subRef = adminDb.collection("billingSubscriptions").doc(subscriptionId);
    const subSnap = await subRef.get().catch(() => null);
    const existingSub = subSnap?.exists ? (subSnap.data() || {}) : {};
    const stillManuallyLocked = remainingManual.length > 0;
    const nextPrimary = remainingManual[0] || null;

    const patch: Record<string, any> = {
      id: subscriptionId,
      manuallyLocked: stillManuallyLocked,
      manualLockReason: stillManuallyLocked ? nextPrimary?.userFacingMessage || null : null,
      lockReasonCode: stillManuallyLocked ? nextPrimary?.reasonCode || null : null,
      restrictionType: stillManuallyLocked ? nextPrimary?.restrictionType || null : null,
      manualUnlockReason: unlockValidation.unlockReason,
      manualUnlockedAt: nowIso,
      manualUnlockedByUid: input.actorUid,
      manualUnlockedByName: input.actorName,
      updatedAt: nowIso,
    };

    if (!stillManuallyLocked) {
      if (mode === "OPEN") {
        patch.manuallyUnlocked = true;
      } else if (mode === "AUTO") {
        patch.manuallyUnlocked = false;
      }
      // Preserve financial status if unpaid balance exists and mode is LIFT_ONLY/AUTO
      const unpaidBalance = Number(existingSub.remainingBalance ?? 0);
      const dueDate = parseDateSafe(existingSub.nextDueAt || existingSub.currentPeriodEndAt);
      const isOverdueBalance = unpaidBalance > 0 && dueDate && dueDate.getTime() < now.getTime();
      if (mode === "OPEN" || !isOverdueBalance) {
        patch.status = "ACTIVE";
      } else if (existingSub.status === "SUSPENDED" || existingSub.status === "LOCKED") {
        patch.status = "LOCKED";
      }
    }

    await subRef.set(patch, { merge: true }).catch(() => undefined);

    // Sync legacy mirror flags (never altering amounts or payment status)
    if (!stillManuallyLocked) {
      const legacyPatch = {
        manuallyLocked: false,
        manualLockReason: null,
        manuallyUnlocked: mode === "OPEN",
        manualUnlockedAt: nowIso,
        ...(mode === "OPEN" ? { status: "ACTIVE" } : {}),
        updatedAt: nowIso,
        updatedBy: input.actorUid,
      };
      if (targetAccountType === "SCHOOL" && schoolId) {
        const schRef = adminDb.collection("schools").doc(schoolId);
        const schSnap = await schRef.get().catch(() => null);
        if (schSnap?.exists) {
          await schRef
            .set({ billing: { ...(schSnap.data()?.billing || {}), ...legacyPatch }, updatedAt: nowIso }, { merge: true })
            .catch(() => undefined);
        }
      } else if ((targetAccountType === "PARENT" || targetAccountType === "INDIVIDUAL_STUDENT") && targetAccountId) {
        const uRef = adminDb.collection("users").doc(targetAccountId);
        const uSnap = await uRef.get().catch(() => null);
        if (uSnap?.exists) {
          await uRef
            .set({ billing: { ...(uSnap.data()?.billing || {}), ...legacyPatch }, updatedAt: nowIso }, { merge: true })
            .catch(() => undefined);
        }
      } else if (targetAccountType === "STUDENT_SELF_FUNDED_PROGRAMME" && programmeEnrollmentId) {
        await adminDb
          .collection("programme_enrollments")
          .doc(programmeEnrollmentId)
          .set(
            {
              manuallyLocked: false,
              manualLockReason: null,
              manuallyUnlocked: mode === "OPEN",
              updatedAt: nowIso,
            },
            { merge: true }
          )
          .catch(() => undefined);
      }
    }
  }

  // Always log an audit record even if unlocking a legacy flag with zero `accountRestrictions` docs
  if (liftedIds.length === 0) {
    const auditEntry = {
      action: mode === "AUTO" ? "ADMIN_RESTORE_AUTO_BILLING" : "ADMIN_MANUAL_UNLOCK_ACCOUNT",
      actorUid: input.actorUid,
      actorEmail: input.actorEmail,
      actorName: input.actorName,
      targetType: targetAccountType,
      targetAccountType,
      targetId: subscriptionId || targetAccountId,
      targetAccountId,
      unlockReason: unlockValidation.unlockReason,
      reason: unlockValidation.unlockReason,
      createdAt: nowIso,
    };
    await Promise.all([
      adminDb.collection("restrictionAuditLogs").add(auditEntry),
      adminDb.collection("adminAuditLogs").add(auditEntry),
    ]);
  }

  return {
    ok: true,
    liftedIds,
    remainingActiveRestrictions: remainingAll.filter((r) => isRestrictionActiveAt(r, now)),
    hasRemainingPaymentLock,
  };
}
