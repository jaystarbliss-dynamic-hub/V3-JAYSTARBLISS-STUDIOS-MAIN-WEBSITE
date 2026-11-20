/**
 * Authoritative Server-Side Subscription & Entitlement Resolver
 *
 * Reads trusted Firestore records via Firebase Admin SDK (`billingSubscriptions`,
 * `schools`, `users`, `individualStudents`, `students`, `programme_enrollments`, `parents`)
 * and enforces portal lockdown with HTTP 423 Locked (`PORTAL_LOCKED`).
 */

import { adminAuth, adminDb } from "./firebase-admin";
import { normaliseRole } from "./billing";
import {
  type BillingResponsibility,
  type BillingSubscriptionRecord,
  type ChildEntitlementSummary,
  type PortalEntitlementResult,
  type PortalRoleKey,
  type SelfFundedProgrammeEntitlement,
  type StudentFundingCategory,
  GRACE_PERIOD_DAYS,
  buildRoleLockdownCopy,
  computeLockdownAt,
  evaluateSubscriptionState,
  formatLagosDate,
  parseDateSafe,
  resolvePlanDurationWeeks,
} from "./subscription-core";

const asString = (v: unknown) => String(v ?? "").trim();
const asLower = (v: unknown) => asString(v).toLowerCase();

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "superadmin",
  "finance_admin",
  "education_admin",
  "content_admin",
  "cms_admin",
  "services_admin",
  "marketing_admin",
  "support_admin",
  "director",
]);

const STAFF_ROLES = new Set(["staff", "tutor", "instructor", "faculty", "teacher"]);

export function extractBearerToken(event: any): string {
  const header = event?.headers?.authorization || event?.headers?.Authorization || "";
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function mapLegacyStatus(rawStatus: unknown, isExemptFlag?: boolean): BillingSubscriptionRecord["status"] {
  if (isExemptFlag) return "EXEMPT";
  const norm = asString(rawStatus).toUpperCase();
  if (norm === "EXEMPT" || norm === "FREE" || norm === "COMPLIMENTARY" || norm === "WAIVED") return "EXEMPT";
  if (norm === "CANCELLED" || norm === "DISABLED" || norm === "INACTIVE") return "CANCELLED";
  if (norm === "SUSPENDED") return "SUSPENDED";
  if (norm === "LOCKED" || norm === "OVERDUE") return "LOCKED";
  if (norm === "PARTIALLY_PAID" || norm === "PARTIAL" || norm === "DEPOSIT_PAID") return "PARTIALLY_PAID";
  if (norm === "GRACE_PERIOD") return "GRACE_PERIOD";
  if (norm === "DUE_SOON") return "DUE_SOON";
  return "ACTIVE";
}

/**
 * Builds a canonical BillingSubscriptionRecord from a `billingSubscriptions` doc OR legacy billing fields.
 */
export function normalizeSubscriptionFromSource(params: {
  id: string;
  accountType: BillingSubscriptionRecord["accountType"];
  accountId: string;
  accountName?: string;
  recipientEmail?: string;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  programmeEnrollmentId?: string | null;
  billingResponsibility: BillingResponsibility;
  canonicalDoc?: Record<string, any> | null;
  legacyBilling?: Record<string, any> | null;
  fallbackPlanName?: string;
  fallbackAmount?: number;
}): BillingSubscriptionRecord {
  const canonical = params.canonicalDoc || null;
  const legacy = params.legacyBilling || {};

  const isExempt = Boolean(
    canonical?.exemption?.exempt ||
      canonical?.isComplimentary ||
      legacy?.exempt ||
      legacy?.isExempt ||
      legacy?.isComplimentary ||
      asString(canonical?.status || legacy?.status).toUpperCase() === "EXEMPT"
  );

  const amount = Number(
    canonical?.amount ??
      legacy?.baseAmount ??
      legacy?.approvedFee ??
      legacy?.tuitionFee ??
      legacy?.fee ??
      legacy?.amount ??
      params.fallbackAmount ??
      0
  );

  const amountPaid = Number(canonical?.amountPaid ?? legacy?.amountPaid ?? 0);
  const hasExplicitRemaining =
    canonical?.remainingBalance !== undefined && canonical?.remainingBalance !== null
      ? true
      : legacy?.remainingBalance !== undefined && legacy?.remainingBalance !== null;
  const remainingBalance = hasExplicitRemaining
    ? Math.max(0, Number(canonical?.remainingBalance ?? legacy?.remainingBalance ?? 0))
    : Math.max(0, amount - amountPaid);

  const nextDue = parseDateSafe(
    canonical?.nextDueAt ||
      canonical?.currentPeriodEndAt ||
      legacy?.nextDueDate ||
      legacy?.paidThrough ||
      legacy?.dueDate
  );

  const currentPeriodStart = parseDateSafe(
    canonical?.currentPeriodStartAt || legacy?.currentPeriodStartAt || legacy?.lastPaidAt
  );
  const currentPeriodEnd = parseDateSafe(
    canonical?.currentPeriodEndAt || legacy?.paidThrough || legacy?.nextDueDate
  );

  const gracePeriodDays =
    Number.isFinite(Number(canonical?.gracePeriodDays ?? legacy?.gracePeriodDays))
      ? Math.max(0, Math.floor(Number(canonical?.gracePeriodDays ?? legacy?.gracePeriodDays)))
      : GRACE_PERIOD_DAYS;

  const graceEnds =
    parseDateSafe(canonical?.graceEndsAt || legacy?.graceEndsAt) ||
    (nextDue ? computeLockdownAt(nextDue, gracePeriodDays) : null);

  const durationWeeks = resolvePlanDurationWeeks({
    durationWeeks: canonical?.durationWeeks ?? legacy?.durationWeeks,
    cycle: canonical?.billingCycle ?? legacy?.cycle ?? legacy?.billingCycle,
    fallbackWeeks: params.accountType === "SCHOOL" ? 12 : 4,
  });

  const status = mapLegacyStatus(canonical?.status || legacy?.status || legacy?.paymentStatus, isExempt);

  return {
    id: canonical?.id || params.id,
    accountType: params.accountType,
    accountId: params.accountId,
    schoolId: params.schoolId ?? canonical?.schoolId ?? null,
    parentId: params.parentId ?? canonical?.parentId ?? null,
    studentId: params.studentId ?? canonical?.studentId ?? null,
    studentName: params.studentName ?? canonical?.studentName ?? null,
    programmeEnrollmentId: params.programmeEnrollmentId ?? canonical?.programmeEnrollmentId ?? null,
    accountName: asString(canonical?.accountName || params.accountName) || null,
    recipientEmail: asString(canonical?.recipientEmail || params.recipientEmail) || null,
    billingResponsibility: isExempt ? "EXEMPT" : (canonical?.billingResponsibility || params.billingResponsibility),
    status,
    planId: asString(canonical?.planId || legacy?.planId) || null,
    planName: asString(canonical?.planName || legacy?.planName || params.fallbackPlanName) || null,
    programmeId: asString(canonical?.programmeId || legacy?.programId || legacy?.programmeId) || null,
    programmeName: asString(canonical?.programmeName || legacy?.programTitle || legacy?.programName) || null,
    amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    amountPaid: Number.isFinite(amountPaid) ? Math.max(0, amountPaid) : 0,
    remainingBalance: Number.isFinite(remainingBalance) ? Math.max(0, remainingBalance) : 0,
    allowDepositAccess: Boolean(canonical?.allowDepositAccess ?? legacy?.allowDepositAccess),
    depositAmount: Number(canonical?.depositAmount ?? legacy?.depositAmount ?? 0),
    currency: asString(canonical?.currency || legacy?.currency || "NGN") || "NGN",
    billingCycle: asString(canonical?.billingCycle || legacy?.cycle || legacy?.billingCycle || (durationWeeks >= 12 ? "termly" : "monthly")),
    durationWeeks,
    currentPeriodStartAt: currentPeriodStart ? currentPeriodStart.toISOString() : null,
    currentPeriodEndAt: currentPeriodEnd ? currentPeriodEnd.toISOString() : null,
    nextDueAt: nextDue ? nextDue.toISOString() : null,
    gracePeriodDays,
    graceEndsAt: graceEnds ? graceEnds.toISOString() : null,
    lastSuccessfulPaymentAt: parseDateSafe(canonical?.lastSuccessfulPaymentAt || legacy?.lastPaidAt)?.toISOString() || null,
    lastPaymentReference: asString(canonical?.lastPaymentReference || legacy?.lastPaymentReference) || null,
    lastReminderSentAt: parseDateSafe(canonical?.lastReminderSentAt || legacy?.lastReminderSentAt)?.toISOString() || null,
    lockdownActivatedAt: parseDateSafe(canonical?.lockdownActivatedAt)?.toISOString() || null,
    override: canonical?.override || legacy?.override || null,
    exemption: canonical?.exemption || (isExempt ? { exempt: true, reason: asString(legacy?.exemptReason || "Approved Exemption"), grantedByUid: "system", grantedAt: new Date().toISOString() } : null),
    isComplimentary: Boolean(canonical?.isComplimentary || legacy?.isComplimentary),
    billingConfigIncomplete: amount > 0 && !nextDue && !isExempt,
    createdAt: parseDateSafe(canonical?.createdAt)?.toISOString() || null,
    updatedAt: parseDateSafe(canonical?.updatedAt || legacy?.updatedAt)?.toISOString() || null,
  };
}

async function resolveSchoolRecord(uid: string, userRecord: Record<string, any>, email: string) {
  const directSchoolId = asString(userRecord.schoolId || userRecord.schoolDocId || userRecord.school_id);
  if (directSchoolId) {
    const snap = await adminDb.collection("schools").doc(directSchoolId).get().catch(() => null);
    if (snap?.exists) return { id: snap.id, ...(snap.data() || {}) };
  }
  const byUid = await adminDb.collection("schools").doc(uid).get().catch(() => null);
  if (byUid?.exists) return { id: byUid.id, ...(byUid.data() || {}) };

  const emailLower = asLower(email || userRecord.email);
  if (emailLower) {
    for (const field of ["contactEmail", "email"]) {
      const snap = await adminDb.collection("schools").where(field, "==", emailLower).limit(1).get().catch(() => null);
      if (snap && !snap.empty) {
        return { id: snap.docs[0].id, ...(snap.docs[0].data() || {}) };
      }
    }
  }
  return null;
}

async function loadSchoolSubscription(schoolId: string, schoolDoc: Record<string, any> | null, userRecord?: Record<string, any>): Promise<BillingSubscriptionRecord> {
  const canonicalId = `school_${schoolId}`;
  const canonicalSnap = await adminDb.collection("billingSubscriptions").doc(canonicalId).get().catch(() => null);
  const canonicalDoc = canonicalSnap?.exists ? { id: canonicalSnap.id, ...(canonicalSnap.data() || {}) } : null;

  const schoolName = asString(schoolDoc?.name || schoolDoc?.schoolName || schoolDoc?.institutionName || userRecord?.schoolName || "Partner School");
  const recipientEmail = asString(schoolDoc?.contactEmail || schoolDoc?.email || userRecord?.email);

  return normalizeSubscriptionFromSource({
    id: canonicalId,
    accountType: "SCHOOL",
    accountId: schoolId,
    accountName: schoolName,
    recipientEmail,
    schoolId,
    billingResponsibility: "SCHOOL",
    canonicalDoc,
    legacyBilling: (schoolDoc?.billing as Record<string, any>) || (userRecord?.billing as Record<string, any>) || null,
    fallbackPlanName: asString(schoolDoc?.plan || "School Institutional Subscription"),
  });
}

async function resolveLinkedChildrenForParent(parentUid: string, parentEmail: string, userRecord: Record<string, any>) {
  const childrenMap = new Map<string, Record<string, any>>();
  const emailLower = asLower(parentEmail || userRecord.email);

  const queries: Promise<any>[] = [
    adminDb.collection("individualStudents").where("parentId", "==", parentUid).limit(50).get().catch(() => null),
    adminDb.collection("students").where("parentId", "==", parentUid).limit(50).get().catch(() => null),
    adminDb.collection("parents").doc(parentUid).get().catch(() => null),
  ];
  if (emailLower) {
    queries.push(
      adminDb.collection("individualStudents").where("parentEmail", "==", emailLower).limit(50).get().catch(() => null),
      adminDb.collection("students").where("parentEmail", "==", emailLower).limit(50).get().catch(() => null)
    );
  }

  const results = await Promise.all(queries);
  const absorb = (docSnap: any) => {
    if (!docSnap?.exists) return;
    const data = docSnap.data() || {};
    const existing = childrenMap.get(docSnap.id) || {};
    childrenMap.set(docSnap.id, { ...existing, ...data, id: docSnap.id });
  };

  for (const res of results) {
    if (!res) continue;
    if (Array.isArray(res.docs)) {
      res.docs.forEach((d: any) => absorb(d));
    }
  }

  // Also check explicit children arrays on users/{parentUid} and parents/{parentUid}
  const parentDocSnap = results[2];
  const explicitIds = new Set<string>();
  const addIds = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const id = asString(typeof item === "object" && item ? item.id || item.studentId : item);
      if (id) explicitIds.add(id);
    }
  };
  addIds(userRecord.children);
  addIds(userRecord.linkedStudentIds);
  if (parentDocSnap?.exists) {
    addIds(parentDocSnap.data()?.children);
    addIds(parentDocSnap.data()?.linkedStudentIds);
  }

  for (const cid of explicitIds) {
    if (childrenMap.has(cid)) continue;
    const [indSnap, stdSnap] = await Promise.all([
      adminDb.collection("individualStudents").doc(cid).get().catch(() => null),
      adminDb.collection("students").doc(cid).get().catch(() => null),
    ]);
    if (indSnap?.exists) absorb(indSnap);
    else if (stdSnap?.exists) absorb(stdSnap);
  }

  return Array.from(childrenMap.values());
}

async function resolveStudentDocuments(uid: string, userRecord: Record<string, any>, email: string) {
  const directId = asString(userRecord.studentDocId || userRecord.individualStudentId || userRecord.studentRecordId);
  let merged: Record<string, any> = {};
  let resolvedDocId = directId;

  const absorb = (id: string, data: Record<string, any>) => {
    if (!resolvedDocId) resolvedDocId = id;
    merged = {
      ...merged,
      ...data,
      id: resolvedDocId,
      schoolId: asString(data.schoolId || merged.schoolId),
      parentId: asString(data.parentId || data.parentUid || merged.parentId),
      parentEmail: asString(data.parentEmail || data.guardianEmail || merged.parentEmail),
    };
  };

  if (directId) {
    const [indSnap, stdSnap] = await Promise.all([
      adminDb.collection("individualStudents").doc(directId).get().catch(() => null),
      adminDb.collection("students").doc(directId).get().catch(() => null),
    ]);
    if (indSnap?.exists) absorb(indSnap.id, indSnap.data() || {});
    if (stdSnap?.exists) absorb(stdSnap.id, stdSnap.data() || {});
  }

  if (!Object.keys(merged).length) {
    const [byUidInd, byUidStd] = await Promise.all([
      adminDb.collection("individualStudents").where("firebaseUid", "==", uid).limit(2).get().catch(() => null),
      adminDb.collection("students").where("firebaseUid", "==", uid).limit(2).get().catch(() => null),
    ]);
    byUidInd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
    byUidStd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
  }

  const emailLower = asLower(email || userRecord.email);
  if (!Object.keys(merged).length && emailLower) {
    const [byEmailInd, byEmailStd] = await Promise.all([
      adminDb.collection("individualStudents").where("email", "==", emailLower).limit(2).get().catch(() => null),
      adminDb.collection("students").where("email", "==", emailLower).limit(2).get().catch(() => null),
    ]);
    byEmailInd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
    byEmailStd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
  }

  return { studentDocId: resolvedDocId || uid, studentDoc: merged };
}

/**
 * Authoritative central entitlement resolver for any authenticated user.
 */
export async function resolveEntitlementForUser(params: {
  uid: string;
  email?: string;
  now?: Date;
}): Promise<PortalEntitlementResult> {
  const now = params.now || new Date();
  const userSnap = await adminDb.collection("users").doc(params.uid).get().catch(() => null);
  const userRecord = userSnap?.exists ? (userSnap.data() || {}) : {};
  const email = asString(params.email || userRecord.email);
  const rawRoleLower = asLower(userRecord.role);
  const normalized = normaliseRole(userRecord.role);
  const displayName = asString(userRecord.fullName || userRecord.name || userRecord.displayName || email || "Portal User");

  // 1. Platform Admins & Staff/Tutors are never locked by customer subscription lockdown
  if (ADMIN_ROLES.has(rawRoleLower) || normalized === "admin") {
    return {
      role: "admin",
      accountType: "ADMIN",
      accountId: params.uid,
      accountName: displayName,
      billingResponsibility: "EXEMPT",
      status: "EXEMPT",
      isLocked: false,
      inGracePeriod: false,
      isDueSoon: false,
      isExempt: true,
      hasActiveOverride: false,
      overrideExpiresAt: null,
      billingConfigIncomplete: false,
      canPay: false,
      payNowPath: null,
      amountDue: 0,
      currency: "NGN",
      dueDateIso: null,
      dueDateFormatted: null,
      graceEndsAtIso: null,
      graceEndsAtFormatted: null,
      daysUntilDue: null,
      graceDaysRemaining: 0,
      subscriptionId: null,
      schoolId: null,
      schoolName: null,
      headline: "",
      bannerText: "",
      message: "",
      restrictedClickMessage: "",
      affectedChildren: [],
      allChildrenLocked: false,
      lockedChildIds: [],
      selfFundedProgrammes: [],
      evaluatedAtIso: now.toISOString(),
    };
  }

  if (STAFF_ROLES.has(rawRoleLower) || normalized === "staff") {
    return {
      role: "staff",
      accountType: "STAFF",
      accountId: params.uid,
      accountName: displayName,
      billingResponsibility: "EXEMPT",
      status: "EXEMPT",
      isLocked: false,
      inGracePeriod: false,
      isDueSoon: false,
      isExempt: true,
      hasActiveOverride: false,
      overrideExpiresAt: null,
      billingConfigIncomplete: false,
      canPay: false,
      payNowPath: null,
      amountDue: 0,
      currency: "NGN",
      dueDateIso: null,
      dueDateFormatted: null,
      graceEndsAtIso: null,
      graceEndsAtFormatted: null,
      daysUntilDue: null,
      graceDaysRemaining: 0,
      subscriptionId: null,
      schoolId: null,
      schoolName: null,
      headline: "",
      bannerText: "",
      message: "",
      restrictedClickMessage: "",
      affectedChildren: [],
      allChildrenLocked: false,
      lockedChildIds: [],
      selfFundedProgrammes: [],
      evaluatedAtIso: now.toISOString(),
    };
  }

  // 2. SCHOOL ADMINISTRATOR
  if (normalized === "school") {
    const schoolDoc = await resolveSchoolRecord(params.uid, userRecord, email);
    const schoolId = asString(schoolDoc?.id || userRecord.schoolId || params.uid);
    const subscription = await loadSchoolSubscription(schoolId, schoolDoc, userRecord);
    const evaluated = evaluateSubscriptionState({ subscription, now });
    const copy = buildRoleLockdownCopy({ role: "school" });

    return {
      role: "school",
      accountType: "SCHOOL",
      accountId: schoolId,
      accountName: subscription.accountName || displayName,
      billingResponsibility: subscription.billingResponsibility,
      status: evaluated.status,
      isLocked: evaluated.isLocked,
      inGracePeriod: evaluated.inGracePeriod,
      isDueSoon: evaluated.isDueSoon,
      isExempt: evaluated.isExempt,
      hasActiveOverride: evaluated.hasActiveOverride,
      overrideExpiresAt: evaluated.overrideExpiresAt,
      billingConfigIncomplete: evaluated.billingConfigIncomplete,
      canPay: copy.canPay,
      payNowPath: copy.payNowPath,
      amountDue: evaluated.amountDue,
      currency: subscription.currency || "NGN",
      dueDateIso: evaluated.dueDateIso,
      dueDateFormatted: evaluated.dueDateFormatted,
      graceEndsAtIso: evaluated.graceEndsAtIso,
      graceEndsAtFormatted: evaluated.graceEndsAtFormatted,
      daysUntilDue: evaluated.daysUntilDue,
      graceDaysRemaining: evaluated.graceDaysRemaining,
      subscriptionId: subscription.id,
      schoolId,
      schoolName: subscription.accountName || displayName,
      headline: copy.headline,
      bannerText: copy.bannerText,
      message: copy.message,
      restrictedClickMessage: copy.restrictedClickMessage,
      affectedChildren: [],
      allChildrenLocked: false,
      lockedChildIds: [],
      selfFundedProgrammes: [],
      evaluatedAtIso: now.toISOString(),
    };
  }

  // 3. PARENT (Per-child scoping + account-level contract fallback)
  if (normalized === "parent") {
    const children = await resolveLinkedChildrenForParent(params.uid, email, userRecord);
    const parentSubSnap = await adminDb.collection("billingSubscriptions").doc(`parent_${params.uid}`).get().catch(() => null);
    const parentCanonical = parentSubSnap?.exists ? { id: parentSubSnap.id, ...(parentSubSnap.data() || {}) } : null;

    const childSummaries: ChildEntitlementSummary[] = [];

    for (const child of children) {
      const childSchoolId = asString(child.schoolId);
      const isSchoolFundedChild = Boolean(childSchoolId) && asLower(child.registrationSource) !== "parent-enrollment-approved" && !child.parentFunded;
      const childName = asString(child.fullName || child.studentName || child.name || "Enrolled Child");
      const programmeName = asString(child.programTitle || child.programName || child.plan || child.track || "Learning Programme");

      // Parent is NEVER billed for a school-funded child programme
      if (isSchoolFundedChild) {
        const schoolSnap = await adminDb.collection("schools").doc(childSchoolId).get().catch(() => null);
        const schoolSub = await loadSchoolSubscription(childSchoolId, schoolSnap?.exists ? { id: schoolSnap.id, ...(schoolSnap.data() || {}) } : null);
        const schoolEval = evaluateSubscriptionState({ subscription: schoolSub, now });
        childSummaries.push({
          childId: child.id,
          childName,
          programmeId: asString(child.programId || child.assignedProgramId) || null,
          programmeName,
          subscriptionId: schoolSub.id,
          billingResponsibility: "SCHOOL",
          status: schoolEval.status,
          isLocked: schoolEval.isLocked,
          inGracePeriod: schoolEval.inGracePeriod,
          amountDue: 0, // Parent does not owe school tuition
          dueDateIso: schoolEval.dueDateIso,
          dueDateFormatted: schoolEval.dueDateFormatted,
          graceEndsAtIso: schoolEval.graceEndsAtIso,
          graceDaysRemaining: schoolEval.graceDaysRemaining,
          daysUntilDue: schoolEval.daysUntilDue,
          feeItemId: null,
        });
        continue;
      }

      const childSubId = `parent_${params.uid}_child_${child.id}`;
      const childSubSnap = await adminDb.collection("billingSubscriptions").doc(childSubId).get().catch(() => null);
      const childCanonical = childSubSnap?.exists ? { id: childSubSnap.id, ...(childSubSnap.data() || {}) } : null;

      // Determine whether child has separate fee obligation or inherits parent contract
      const hasChildSpecificBilling = Boolean(
        childCanonical ||
          Number(child.tuitionFee || child.fee || child.remainingBalance || 0) > 0 ||
          child.nextDueDate ||
          child.paidThrough
      );

      const childSub = normalizeSubscriptionFromSource({
        id: childCanonical ? childSubId : (parentCanonical ? `parent_${params.uid}` : childSubId),
        accountType: "PARENT_CHILD",
        accountId: child.id,
        accountName: childName,
        recipientEmail: email,
        parentId: params.uid,
        studentId: child.id,
        studentName: childName,
        billingResponsibility: "PARENT",
        canonicalDoc: childCanonical || (!hasChildSpecificBilling ? parentCanonical : null),
        legacyBilling: hasChildSpecificBilling
          ? {
              baseAmount: Number(child.tuitionFee ?? child.fee ?? child.amount ?? 0),
              amountPaid: Number(child.amountPaid ?? 0),
              remainingBalance:
                child.remainingBalance !== undefined
                  ? Number(child.remainingBalance)
                  : asString(child.paymentStatus).toUpperCase() === "PAID"
                  ? 0
                  : Number(child.tuitionFee ?? child.fee ?? 0),
              status: child.paymentStatus || child.billingStatus || child.status,
              nextDueDate: child.nextDueDate || child.paidThrough || userRecord.billing?.nextDueDate || userRecord.billing?.paidThrough,
              paidThrough: child.paidThrough || userRecord.billing?.paidThrough,
              durationWeeks: child.durationWeeks || userRecord.billing?.durationWeeks || 4,
              planName: programmeName,
              exempt: child.exempt || child.isExempt || userRecord.billing?.exempt,
            }
          : (userRecord.billing || null),
        fallbackPlanName: programmeName,
      });

      const childEval = evaluateSubscriptionState({ subscription: childSub, now });
      childSummaries.push({
        childId: child.id,
        childName,
        programmeId: asString(child.programId || child.assignedProgramId) || null,
        programmeName,
        subscriptionId: childSub.id,
        billingResponsibility: childSub.billingResponsibility,
        status: childEval.status,
        isLocked: childEval.isLocked,
        inGracePeriod: childEval.inGracePeriod,
        amountDue: childEval.amountDue,
        dueDateIso: childEval.dueDateIso,
        dueDateFormatted: childEval.dueDateFormatted,
        graceEndsAtIso: childEval.graceEndsAtIso,
        graceDaysRemaining: childEval.graceDaysRemaining,
        daysUntilDue: childEval.daysUntilDue,
        feeItemId: `${child.id}_${asString(child.programId || "tuition")}`,
      });
    }

    // Account-level parent subscription fallback when no children exist yet or contract is account-level
    const parentAccountSub = normalizeSubscriptionFromSource({
      id: `parent_${params.uid}`,
      accountType: "PARENT",
      accountId: params.uid,
      accountName: displayName,
      recipientEmail: email,
      parentId: params.uid,
      billingResponsibility: "PARENT",
      canonicalDoc: parentCanonical,
      legacyBilling: (userRecord.billing as Record<string, any>) || null,
      fallbackPlanName: "Family Tuition Plan",
    });
    const parentAccountEval = evaluateSubscriptionState({ subscription: parentAccountSub, now });

    const parentFundedChildren = childSummaries.filter((c) => c.billingResponsibility === "PARENT");
    const lockedChildren = parentFundedChildren.filter((c) => c.isLocked);
    const graceChildren = parentFundedChildren.filter((c) => c.inGracePeriod);
    const dueSoonChildren = parentFundedChildren.filter((c) => c.status === "DUE_SOON");

    const hasLockedChild = lockedChildren.length > 0;
    const allChildrenLocked =
      parentFundedChildren.length > 0
        ? lockedChildren.length === parentFundedChildren.length
        : parentAccountEval.isLocked;
    const isLocked = hasLockedChild || (parentFundedChildren.length === 0 && parentAccountEval.isLocked);
    const inGracePeriod = !isLocked && (graceChildren.length > 0 || (parentFundedChildren.length === 0 && parentAccountEval.inGracePeriod));
    const isDueSoon = !isLocked && !inGracePeriod && (dueSoonChildren.length > 0 || parentAccountEval.isDueSoon);

    const totalAmountDue = parentFundedChildren.length > 0
      ? Number(
          parentFundedChildren
            .filter((c) => c.isLocked || c.inGracePeriod || c.status === "DUE_SOON" || c.status === "PARTIALLY_PAID")
            .reduce((sum, c) => sum + c.amountDue, 0)
            .toFixed(2)
        )
      : parentAccountEval.amountDue;

    const primaryUrgentChild = lockedChildren[0] || graceChildren[0] || dueSoonChildren[0] || null;
    const copy = buildRoleLockdownCopy({ role: "parent" });

    return {
      role: "parent",
      accountType: "PARENT",
      accountId: params.uid,
      accountName: displayName,
      billingResponsibility: "PARENT",
      status: isLocked
        ? "LOCKED"
        : inGracePeriod
        ? "GRACE_PERIOD"
        : isDueSoon
        ? "DUE_SOON"
        : parentAccountEval.status,
      isLocked,
      inGracePeriod,
      isDueSoon,
      isExempt: parentAccountEval.isExempt && !isLocked,
      hasActiveOverride: parentAccountEval.hasActiveOverride,
      overrideExpiresAt: parentAccountEval.overrideExpiresAt,
      billingConfigIncomplete: parentAccountEval.billingConfigIncomplete && parentFundedChildren.length === 0,
      canPay: copy.canPay,
      payNowPath: primaryUrgentChild?.feeItemId
        ? `/portal/parent/payments?childId=${encodeURIComponent(primaryUrgentChild.childId)}`
        : copy.payNowPath,
      amountDue: totalAmountDue,
      currency: "NGN",
      dueDateIso: primaryUrgentChild?.dueDateIso || parentAccountEval.dueDateIso,
      dueDateFormatted: primaryUrgentChild?.dueDateFormatted || parentAccountEval.dueDateFormatted,
      graceEndsAtIso: primaryUrgentChild?.graceEndsAtIso || parentAccountEval.graceEndsAtIso,
      graceEndsAtFormatted: formatLagosDate(primaryUrgentChild?.graceEndsAtIso || parentAccountEval.graceEndsAtIso),
      daysUntilDue: primaryUrgentChild?.daysUntilDue ?? parentAccountEval.daysUntilDue,
      graceDaysRemaining: primaryUrgentChild?.graceDaysRemaining ?? parentAccountEval.graceDaysRemaining,
      subscriptionId: primaryUrgentChild?.subscriptionId || parentAccountSub.id,
      schoolId: null,
      schoolName: null,
      headline: copy.headline,
      bannerText: copy.bannerText,
      message: copy.message,
      restrictedClickMessage: copy.restrictedClickMessage,
      affectedChildren: childSummaries,
      allChildrenLocked,
      lockedChildIds: lockedChildren.map((c) => c.childId),
      selfFundedProgrammes: [],
      evaluatedAtIso: now.toISOString(),
    };
  }

  // 4. STUDENT (School-Funded vs Parent-Funded vs Individually Enrolled + Self-Funded Additional Programmes)
  const { studentDocId, studentDoc } = await resolveStudentDocuments(params.uid, userRecord, email);
  const schoolId = asString(studentDoc.schoolId || userRecord.schoolId);
  const parentId = asString(studentDoc.parentId || studentDoc.parentUid || userRecord.parentId || userRecord.parentUid);
  const regSource = asLower(studentDoc.registrationSource || userRecord.registrationSource);
  const regType = asLower(userRecord.studentRegistrationType || studentDoc.registrationType);

  let fundingCategory: StudentFundingCategory = "INDIVIDUAL_SELF_FUNDED";
  if (schoolId && regType !== "individual" && regType !== "parent" && regSource !== "parent-enrollment-approved") {
    fundingCategory = "SCHOOL_FUNDED";
  } else if (parentId || regType === "parent" || regSource === "parent-enrollment-approved") {
    fundingCategory = "PARENT_FUNDED";
  }

  // Also load any independently purchased self-funded programmes (`programme_enrollments`)
  const selfFundedSnap = await adminDb
    .collection("programme_enrollments")
    .where("studentUid", "==", params.uid)
    .limit(30)
    .get()
    .catch(() => null);

  const selfFundedProgrammes: SelfFundedProgrammeEntitlement[] = [];
  selfFundedSnap?.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (asString(d.billingResponsibility) !== "STUDENT_SELF_FUNDED") return;
    const sub = normalizeSubscriptionFromSource({
      id: `prog_enr_${docSnap.id}`,
      accountType: "STUDENT_SELF_FUNDED_PROGRAMME",
      accountId: params.uid,
      accountName: displayName,
      recipientEmail: email,
      studentId: studentDocId,
      studentName: displayName,
      programmeEnrollmentId: docSnap.id,
      billingResponsibility: "STUDENT_SELF_FUNDED",
      legacyBilling: {
        baseAmount: Number(d.approvedFee || 0),
        amountPaid: Number(d.amountPaid || 0),
        remainingBalance: Number(d.remainingBalance ?? Math.max(0, Number(d.approvedFee || 0) - Number(d.amountPaid || 0))),
        allowDepositAccess: Boolean(d.allowDepositAccess),
        depositAmount: Number(d.depositAmount || 0),
        status: d.enrollmentStatus === "EXEMPT" ? "EXEMPT" : d.paymentStatus,
        nextDueDate: d.nextDueDate || d.paidThrough,
        paidThrough: d.paidThrough,
        durationWeeks: Number(d.durationWeeks || 8),
        programId: d.programId,
        programTitle: d.programTitle,
      },
    });
    const ev = evaluateSubscriptionState({ subscription: sub, now });
    selfFundedProgrammes.push({
      programmeEnrollmentId: docSnap.id,
      programmeId: asString(d.programId),
      programmeName: asString(d.programTitle || "Additional Programme"),
      status: ev.status,
      isLocked: ev.isLocked,
      amountDue: ev.amountDue,
      dueDateIso: ev.dueDateIso,
    });
  });

  // 4A. School-funded student inherits institutional school subscription
  if (fundingCategory === "SCHOOL_FUNDED" && schoolId) {
    const schoolSnap = await adminDb.collection("schools").doc(schoolId).get().catch(() => null);
    const schoolDoc = schoolSnap?.exists ? { id: schoolSnap.id, ...(schoolSnap.data() || {}) } : null;
    const schoolSub = await loadSchoolSubscription(schoolId, schoolDoc);
    const evaluated = evaluateSubscriptionState({ subscription: schoolSub, now });
    const copy = buildRoleLockdownCopy({ role: "student", studentFundingCategory: "SCHOOL_FUNDED" });

    return {
      role: "student",
      accountType: "SCHOOL",
      accountId: studentDocId,
      accountName: asString(studentDoc.fullName || studentDoc.name || displayName),
      billingResponsibility: "SCHOOL",
      studentFundingCategory: "SCHOOL_FUNDED",
      status: evaluated.status,
      isLocked: evaluated.isLocked,
      inGracePeriod: evaluated.inGracePeriod,
      isDueSoon: evaluated.isDueSoon,
      isExempt: evaluated.isExempt,
      hasActiveOverride: evaluated.hasActiveOverride,
      overrideExpiresAt: evaluated.overrideExpiresAt,
      billingConfigIncomplete: evaluated.billingConfigIncomplete,
      canPay: false, // School students NEVER pay school institutional fees
      payNowPath: null,
      amountDue: 0, // Do not bill school student for school's fee
      currency: schoolSub.currency || "NGN",
      dueDateIso: evaluated.dueDateIso,
      dueDateFormatted: evaluated.dueDateFormatted,
      graceEndsAtIso: evaluated.graceEndsAtIso,
      graceEndsAtFormatted: evaluated.graceEndsAtFormatted,
      daysUntilDue: evaluated.daysUntilDue,
      graceDaysRemaining: evaluated.graceDaysRemaining,
      subscriptionId: schoolSub.id,
      schoolId,
      schoolName: schoolSub.accountName || asString(studentDoc.schoolName || "Your School"),
      headline: copy.headline,
      bannerText: copy.bannerText,
      message: copy.message,
      restrictedClickMessage: copy.restrictedClickMessage,
      affectedChildren: [],
      allChildrenLocked: false,
      lockedChildIds: [],
      selfFundedProgrammes,
      evaluatedAtIso: now.toISOString(),
    };
  }

  // 4B. Parent-funded student inherits parent's child/account fee obligation
  if (fundingCategory === "PARENT_FUNDED") {
    const resolvedParentId = parentId || asString(studentDoc.parentUid);
    const childSubId = resolvedParentId ? `parent_${resolvedParentId}_child_${studentDocId}` : `student_${studentDocId}`;
    const [childSubSnap, parentSubSnap, parentUserSnap] = await Promise.all([
      adminDb.collection("billingSubscriptions").doc(childSubId).get().catch(() => null),
      resolvedParentId ? adminDb.collection("billingSubscriptions").doc(`parent_${resolvedParentId}`).get().catch(() => null) : Promise.resolve(null),
      resolvedParentId ? adminDb.collection("users").doc(resolvedParentId).get().catch(() => null) : Promise.resolve(null),
    ]);

    const childCanonical = childSubSnap?.exists ? { id: childSubSnap.id, ...(childSubSnap.data() || {}) } : null;
    const parentCanonical = parentSubSnap?.exists ? { id: parentSubSnap.id, ...(parentSubSnap.data() || {}) } : null;
    const parentUser = parentUserSnap?.exists ? (parentUserSnap.data() || {}) : {};

    const sub = normalizeSubscriptionFromSource({
      id: childCanonical ? childSubId : parentCanonical ? `parent_${resolvedParentId}` : childSubId,
      accountType: "PARENT_CHILD",
      accountId: studentDocId,
      accountName: asString(studentDoc.fullName || studentDoc.name || displayName),
      recipientEmail: asString(parentUser.email || studentDoc.parentEmail),
      parentId: resolvedParentId || null,
      studentId: studentDocId,
      studentName: asString(studentDoc.fullName || studentDoc.name || displayName),
      billingResponsibility: "PARENT",
      canonicalDoc: childCanonical || parentCanonical,
      legacyBilling: {
        baseAmount: Number(studentDoc.tuitionFee ?? studentDoc.fee ?? parentUser.billing?.baseAmount ?? 0),
        amountPaid: Number(studentDoc.amountPaid ?? parentUser.billing?.amountPaid ?? 0),
        remainingBalance:
          studentDoc.remainingBalance !== undefined
            ? Number(studentDoc.remainingBalance)
            : asString(studentDoc.paymentStatus).toUpperCase() === "PAID"
            ? 0
            : Number(studentDoc.tuitionFee ?? studentDoc.fee ?? parentUser.billing?.remainingBalance ?? 0),
        status: studentDoc.paymentStatus || parentUser.billing?.status || studentDoc.status,
        nextDueDate: studentDoc.nextDueDate || studentDoc.paidThrough || parentUser.billing?.nextDueDate || parentUser.billing?.paidThrough,
        paidThrough: studentDoc.paidThrough || parentUser.billing?.paidThrough,
        durationWeeks: studentDoc.durationWeeks || parentUser.billing?.durationWeeks || 4,
        exempt: studentDoc.exempt || studentDoc.isExempt || parentUser.billing?.exempt,
      },
    });

    const evaluated = evaluateSubscriptionState({ subscription: sub, now });
    const copy = buildRoleLockdownCopy({ role: "student", studentFundingCategory: "PARENT_FUNDED" });

    return {
      role: "student",
      accountType: "PARENT_CHILD",
      accountId: studentDocId,
      accountName: sub.accountName || displayName,
      billingResponsibility: "PARENT",
      studentFundingCategory: "PARENT_FUNDED",
      status: evaluated.status,
      isLocked: evaluated.isLocked,
      inGracePeriod: evaluated.inGracePeriod,
      isDueSoon: evaluated.isDueSoon,
      isExempt: evaluated.isExempt,
      hasActiveOverride: evaluated.hasActiveOverride,
      overrideExpiresAt: evaluated.overrideExpiresAt,
      billingConfigIncomplete: evaluated.billingConfigIncomplete,
      canPay: false, // Parent is the payer; never show Pay Now on child account
      payNowPath: null,
      amountDue: 0,
      currency: sub.currency || "NGN",
      dueDateIso: evaluated.dueDateIso,
      dueDateFormatted: evaluated.dueDateFormatted,
      graceEndsAtIso: evaluated.graceEndsAtIso,
      graceEndsAtFormatted: evaluated.graceEndsAtFormatted,
      daysUntilDue: evaluated.daysUntilDue,
      graceDaysRemaining: evaluated.graceDaysRemaining,
      subscriptionId: sub.id,
      schoolId: null,
      schoolName: null,
      headline: copy.headline,
      bannerText: copy.bannerText,
      message: copy.message,
      restrictedClickMessage: copy.restrictedClickMessage,
      affectedChildren: [],
      allChildrenLocked: false,
      lockedChildIds: [],
      selfFundedProgrammes,
      evaluatedAtIso: now.toISOString(),
    };
  }

  // 4C. Individually enrolled student
  const indSubId = `student_${params.uid}`;
  const indSubSnap = await adminDb.collection("billingSubscriptions").doc(indSubId).get().catch(() => null);
  const indCanonical = indSubSnap?.exists ? { id: indSubSnap.id, ...(indSubSnap.data() || {}) } : null;

  const indSub = normalizeSubscriptionFromSource({
    id: indSubId,
    accountType: "INDIVIDUAL_STUDENT",
    accountId: params.uid,
    accountName: asString(studentDoc.fullName || studentDoc.name || displayName),
    recipientEmail: email,
    studentId: studentDocId,
    studentName: asString(studentDoc.fullName || studentDoc.name || displayName),
    billingResponsibility: "STUDENT",
    canonicalDoc: indCanonical,
    legacyBilling: {
      ...(userRecord.billing || {}),
      baseAmount: Number(userRecord.billing?.baseAmount ?? studentDoc.tuitionFee ?? studentDoc.fee ?? 0),
      amountPaid: Number(userRecord.billing?.amountPaid ?? studentDoc.amountPaid ?? 0),
      remainingBalance:
        userRecord.billing?.remainingBalance !== undefined
          ? Number(userRecord.billing.remainingBalance)
          : studentDoc.remainingBalance !== undefined
          ? Number(studentDoc.remainingBalance)
          : asString(studentDoc.paymentStatus || userRecord.billing?.status).toUpperCase() === "PAID"
          ? 0
          : Number(userRecord.billing?.baseAmount ?? studentDoc.tuitionFee ?? studentDoc.fee ?? 0),
      status: userRecord.billing?.status || studentDoc.paymentStatus || studentDoc.status,
      nextDueDate: userRecord.billing?.nextDueDate || studentDoc.nextDueDate || userRecord.billing?.paidThrough || studentDoc.paidThrough,
      paidThrough: userRecord.billing?.paidThrough || studentDoc.paidThrough,
      durationWeeks: userRecord.billing?.durationWeeks || studentDoc.durationWeeks || 4,
      exempt: userRecord.billing?.exempt || studentDoc.exempt || studentDoc.isExempt,
    },
    fallbackPlanName: asString(studentDoc.programName || studentDoc.plan || "Individual Learning Programme"),
  });

  const evaluated = evaluateSubscriptionState({ subscription: indSub, now });
  const copy = buildRoleLockdownCopy({ role: "student", studentFundingCategory: "INDIVIDUAL_SELF_FUNDED" });

  return {
    role: "student",
    accountType: "INDIVIDUAL_STUDENT",
    accountId: params.uid,
    accountName: indSub.accountName || displayName,
    billingResponsibility: indSub.billingResponsibility,
    studentFundingCategory: "INDIVIDUAL_SELF_FUNDED",
    status: evaluated.status,
    isLocked: evaluated.isLocked,
    inGracePeriod: evaluated.inGracePeriod,
    isDueSoon: evaluated.isDueSoon,
    isExempt: evaluated.isExempt,
    hasActiveOverride: evaluated.hasActiveOverride,
    overrideExpiresAt: evaluated.overrideExpiresAt,
    billingConfigIncomplete: evaluated.billingConfigIncomplete,
    canPay: copy.canPay,
    payNowPath: copy.payNowPath,
    amountDue: evaluated.amountDue,
    currency: indSub.currency || "NGN",
    dueDateIso: evaluated.dueDateIso,
    dueDateFormatted: evaluated.dueDateFormatted,
    graceEndsAtIso: evaluated.graceEndsAtIso,
    graceEndsAtFormatted: evaluated.graceEndsAtFormatted,
    daysUntilDue: evaluated.daysUntilDue,
    graceDaysRemaining: evaluated.graceDaysRemaining,
    subscriptionId: indSub.id,
    schoolId: null,
    schoolName: null,
    headline: copy.headline,
    bannerText: copy.bannerText,
    message: copy.message,
    restrictedClickMessage: copy.restrictedClickMessage,
    affectedChildren: [],
    allChildrenLocked: false,
    lockedChildIds: [],
    selfFundedProgrammes,
    evaluatedAtIso: now.toISOString(),
  };
}

/**
 * Reusable server-side guard for protected Netlify Functions.
 * Verifies Firebase ID token, resolves entitlement, and returns HTTP 423 Locked
 * with structured `{ code: "PORTAL_LOCKED", entitlement }` whenever access is locked.
 *
 * For parents with multiple children, pass `targetChildId` so only a locked child's
 * data is blocked while another fully paid child remains accessible.
 */
export async function enforceEntitlementOrLock(
  event: any,
  options?: {
    targetChildId?: string | null;
    allowBillingOnly?: boolean;
  }
): Promise<
  | {
      ok: true;
      uid: string;
      email: string;
      decoded: any;
      entitlement: PortalEntitlementResult;
    }
  | {
      ok: false;
      response: { statusCode: number; headers: Record<string, string>; body: string };
    }
> {
  const token = extractBearerToken(event);
  if (!token) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ code: "AUTH_REQUIRED", error: "Authentication required." }),
      },
    };
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return {
      ok: false,
      response: {
        statusCode: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ code: "AUTH_INVALID", error: "Session expired. Please sign in again." }),
      },
    };
  }

  const entitlement = await resolveEntitlementForUser({
    uid: decoded.uid,
    email: decoded.email,
  });

  if (options?.allowBillingOnly) {
    return { ok: true, uid: decoded.uid, email: asString(decoded.email), decoded, entitlement };
  }

  // Parents: per-child isolation when a specific child is targeted
  if (entitlement.role === "parent" && options?.targetChildId) {
    const childLocked = entitlement.lockedChildIds.includes(options.targetChildId);
    if (!childLocked) {
      return { ok: true, uid: decoded.uid, email: asString(decoded.email), decoded, entitlement };
    }
  } else if (!entitlement.isLocked) {
    return { ok: true, uid: decoded.uid, email: asString(decoded.email), decoded, entitlement };
  }

  // For parents where only SOME children are locked and no targetChildId was specified,
  // allow the endpoint to continue and filter out `entitlement.lockedChildIds` unless ALL children are locked.
  if (entitlement.role === "parent" && !options?.targetChildId && !entitlement.allChildrenLocked) {
    return { ok: true, uid: decoded.uid, email: asString(decoded.email), decoded, entitlement };
  }

  return {
    ok: false,
    response: {
      statusCode: 423,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        code: "PORTAL_LOCKED",
        error: entitlement.message || "Portal access is currently locked due to an overdue subscription.",
        headline: entitlement.headline,
        entitlement,
      }),
    },
  };
}

/**
 * Writes/merges a canonical `billingSubscriptions` record inside or outside a Firestore transaction.
 */
export function buildCanonicalSubscriptionWritePayload(input: {
  id: string;
  accountType: BillingSubscriptionRecord["accountType"];
  accountId: string;
  accountName?: string | null;
  recipientEmail?: string | null;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  programmeEnrollmentId?: string | null;
  billingResponsibility: BillingResponsibility;
  status: BillingSubscriptionRecord["status"];
  planId?: string | null;
  planName?: string | null;
  programmeId?: string | null;
  programmeName?: string | null;
  amount: number;
  amountPaid?: number;
  remainingBalance?: number;
  allowDepositAccess?: boolean;
  depositAmount?: number;
  currency?: string;
  billingCycle?: string;
  durationWeeks: number;
  currentPeriodStartAt?: Date | string | null;
  currentPeriodEndAt?: Date | string | null;
  nextDueAt?: Date | string | null;
  gracePeriodDays?: number;
  graceEndsAt?: Date | string | null;
  lastSuccessfulPaymentAt?: Date | string | null;
  lastPaymentReference?: string | null;
}): Record<string, any> {
  const now = new Date();
  const nextDue = parseDateSafe(input.nextDueAt || input.currentPeriodEndAt);
  const graceDays =
    Number.isFinite(Number(input.gracePeriodDays)) && Number(input.gracePeriodDays) >= 0
      ? Math.floor(Number(input.gracePeriodDays))
      : GRACE_PERIOD_DAYS;
  const graceEnds = parseDateSafe(input.graceEndsAt) || (nextDue ? computeLockdownAt(nextDue, graceDays) : null);

  return {
    id: input.id,
    accountType: input.accountType,
    accountId: input.accountId,
    accountName: input.accountName ?? null,
    recipientEmail: input.recipientEmail ?? null,
    schoolId: input.schoolId ?? null,
    parentId: input.parentId ?? null,
    studentId: input.studentId ?? null,
    studentName: input.studentName ?? null,
    programmeEnrollmentId: input.programmeEnrollmentId ?? null,
    billingResponsibility: input.billingResponsibility,
    status: input.status,
    planId: input.planId ?? null,
    planName: input.planName ?? null,
    programmeId: input.programmeId ?? null,
    programmeName: input.programmeName ?? null,
    amount: Number(Number(input.amount || 0).toFixed(2)),
    amountPaid: Number(Number(input.amountPaid || 0).toFixed(2)),
    remainingBalance: Number(Math.max(0, Number(input.remainingBalance ?? 0)).toFixed(2)),
    allowDepositAccess: Boolean(input.allowDepositAccess),
    depositAmount: Number(Number(input.depositAmount || 0).toFixed(2)),
    currency: input.currency || "NGN",
    billingCycle: input.billingCycle || (input.durationWeeks >= 12 ? "termly" : "monthly"),
    durationWeeks: Math.max(1, Math.round(Number(input.durationWeeks || 4))),
    currentPeriodStartAt: parseDateSafe(input.currentPeriodStartAt)?.toISOString() || null,
    currentPeriodEndAt: parseDateSafe(input.currentPeriodEndAt)?.toISOString() || null,
    nextDueAt: nextDue ? nextDue.toISOString() : null,
    gracePeriodDays: graceDays,
    graceEndsAt: graceEnds ? graceEnds.toISOString() : null,
    lastSuccessfulPaymentAt: parseDateSafe(input.lastSuccessfulPaymentAt)?.toISOString() || null,
    lastPaymentReference: input.lastPaymentReference ?? null,
    updatedAt: now.toISOString(),
  };
}
