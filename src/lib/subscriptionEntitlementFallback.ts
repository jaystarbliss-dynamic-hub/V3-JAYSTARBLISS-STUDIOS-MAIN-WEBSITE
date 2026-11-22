import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getEffectiveAuth } from '../utils/impersonation';
import {
  GRACE_PERIOD_DAYS,
  buildRoleLockdownCopy,
  computeLockdownAt,
  evaluateSubscriptionState,
  formatLagosDate,
  parseDateSafe,
  resolvePlanDurationWeeks,
  type BillingResponsibility,
  type BillingSubscriptionRecord,
  type ChildEntitlementSummary,
  type PortalEntitlementResult,
  type SelfFundedProgrammeEntitlement,
  type StudentFundingCategory,
} from '../../api/_lib/subscription-core';
import {
  isRestrictionActiveAt,
  isRestrictionExpiredAt,
  sanitizeRestrictionForUser,
  type AccountRestrictionRecord,
} from '../../api/_lib/restriction-core';

const asString = (v: unknown) => String(v ?? '').trim();
const asLower = (v: unknown) => asString(v).toLowerCase();

const ADMIN_ROLES = new Set([
  'admin',
  'super_admin',
  'superadmin',
  'finance_admin',
  'education_admin',
  'content_admin',
  'cms_admin',
  'services_admin',
  'marketing_admin',
  'support_admin',
  'director',
]);

const STAFF_ROLES = new Set(['staff', 'tutor', 'instructor', 'faculty', 'teacher']);

function normalizePortalRole(rawRole: unknown): 'admin' | 'staff' | 'school' | 'parent' | 'student' {
  const lower = asLower(rawRole);
  if (ADMIN_ROLES.has(lower)) return 'admin';
  if (STAFF_ROLES.has(lower)) return 'staff';
  if (['school', 'school_admin', 'schooladmin', 'institution'].includes(lower)) return 'school';
  if (['parent', 'guardian'].includes(lower)) return 'parent';
  return 'student';
}

function mapLegacyStatus(rawStatus: unknown, isExemptFlag?: boolean): BillingSubscriptionRecord['status'] {
  if (isExemptFlag) return 'EXEMPT';
  const norm = asString(rawStatus).toUpperCase();
  if (norm === 'EXEMPT' || norm === 'FREE' || norm === 'COMPLIMENTARY' || norm === 'WAIVED') return 'EXEMPT';
  if (norm === 'CANCELLED' || norm === 'DISABLED' || norm === 'INACTIVE') return 'CANCELLED';
  if (norm === 'SUSPENDED') return 'SUSPENDED';
  if (norm === 'LOCKED' || norm === 'OVERDUE') return 'LOCKED';
  if (norm === 'PARTIALLY_PAID' || norm === 'PARTIAL' || norm === 'DEPOSIT_PAID') return 'PARTIALLY_PAID';
  if (norm === 'GRACE_PERIOD') return 'GRACE_PERIOD';
  if (norm === 'DUE_SOON') return 'DUE_SOON';
  return 'ACTIVE';
}

function normalizeSubscriptionFromClientSource(params: {
  id: string;
  accountType: BillingSubscriptionRecord['accountType'];
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
      asString(canonical?.status || legacy?.status).toUpperCase() === 'EXEMPT'
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

  const gracePeriodDays = Number.isFinite(Number(canonical?.gracePeriodDays ?? legacy?.gracePeriodDays))
    ? Math.max(0, Math.floor(Number(canonical?.gracePeriodDays ?? legacy?.gracePeriodDays)))
    : GRACE_PERIOD_DAYS;

  const graceEnds =
    parseDateSafe(canonical?.graceEndsAt || legacy?.graceEndsAt) ||
    (nextDue ? computeLockdownAt(nextDue, gracePeriodDays) : null);

  const durationWeeks = resolvePlanDurationWeeks({
    durationWeeks: canonical?.durationWeeks ?? legacy?.durationWeeks,
    cycle: canonical?.billingCycle ?? legacy?.cycle ?? legacy?.billingCycle,
    fallbackWeeks: params.accountType === 'SCHOOL' ? 12 : 4,
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
    billingResponsibility: isExempt ? 'EXEMPT' : canonical?.billingResponsibility || params.billingResponsibility,
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
    currency: asString(canonical?.currency || legacy?.currency || 'NGN') || 'NGN',
    billingCycle: asString(
      canonical?.billingCycle || legacy?.cycle || legacy?.billingCycle || (durationWeeks >= 12 ? 'termly' : 'monthly')
    ),
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
    exemption:
      canonical?.exemption ||
      (isExempt
        ? {
            exempt: true,
            reason: asString(legacy?.exemptReason || 'Approved Exemption'),
            grantedByUid: 'system',
            grantedAt: new Date().toISOString(),
          }
        : null),
    manuallyLocked: Boolean(canonical?.manuallyLocked ?? legacy?.manuallyLocked),
    manualLockReason: asString(canonical?.manualLockReason || legacy?.manualLockReason) || null,
    manualLockedAt: parseDateSafe(canonical?.manualLockedAt || legacy?.manualLockedAt)?.toISOString() || null,
    manualLockedByUid: asString(canonical?.manualLockedByUid || legacy?.manualLockedByUid) || null,
    manualLockedByName: asString(canonical?.manualLockedByName || legacy?.manualLockedByName) || null,
    manuallyUnlocked: Boolean(canonical?.manuallyUnlocked ?? legacy?.manuallyUnlocked),
    manualUnlockReason: asString(canonical?.manualUnlockReason || legacy?.manualUnlockReason) || null,
    manualUnlockedAt: parseDateSafe(canonical?.manualUnlockedAt || legacy?.manualUnlockedAt)?.toISOString() || null,
    manualUnlockedByUid: asString(canonical?.manualUnlockedByUid || legacy?.manualUnlockedByUid) || null,
    manualUnlockedByName: asString(canonical?.manualUnlockedByName || legacy?.manualUnlockedByName) || null,
    isComplimentary: Boolean(canonical?.isComplimentary || legacy?.isComplimentary),
    billingConfigIncomplete: amount > 0 && !nextDue && !isExempt,
    createdAt: parseDateSafe(canonical?.createdAt)?.toISOString() || null,
    updatedAt: parseDateSafe(canonical?.updatedAt || legacy?.updatedAt)?.toISOString() || null,
  };
}

/**
 * Queries active `accountRestrictions` scoped strictly to the target user/school/parent/student
 * so Firestore security rules always allow the read without leaking other users' records.
 */
async function loadActiveRestrictionsClient(params: {
  targetAccountIds?: string[];
  subscriptionIds?: string[];
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  programmeEnrollmentId?: string | null;
  includeCascadingFromSchool?: boolean;
  includeCascadingFromParent?: boolean;
  now?: Date;
}): Promise<AccountRestrictionRecord[]> {
  const now = params.now || new Date();
  const matched = new Map<string, AccountRestrictionRecord>();
  const queries: Promise<any>[] = [];

  const uniqueTargetIds = Array.from(new Set((params.targetAccountIds || []).map(asString).filter(Boolean))).slice(0, 10);
  for (const tid of uniqueTargetIds) {
    queries.push(
      getDocs(query(collection(db, 'accountRestrictions'), where('targetAccountId', '==', tid), limit(50))).catch(
        () => null
      )
    );
  }

  const uniqueSubIds = Array.from(new Set((params.subscriptionIds || []).map(asString).filter(Boolean))).slice(0, 10);
  for (const sid of uniqueSubIds) {
    queries.push(
      getDocs(query(collection(db, 'accountRestrictions'), where('relatedSubscriptionId', '==', sid), limit(50))).catch(
        () => null
      )
    );
  }

  if (params.schoolId && params.includeCascadingFromSchool) {
    queries.push(
      getDocs(
        query(collection(db, 'accountRestrictions'), where('schoolId', '==', asString(params.schoolId)), limit(50))
      ).catch(() => null)
    );
  }

  if (params.parentId && params.includeCascadingFromParent) {
    queries.push(
      getDocs(
        query(collection(db, 'accountRestrictions'), where('parentId', '==', asString(params.parentId)), limit(50))
      ).catch(() => null)
    );
  }

  if (params.studentId) {
    queries.push(
      getDocs(
        query(
          collection(db, 'accountRestrictions'),
          where('affectedStudentIds', 'array-contains', asString(params.studentId)),
          limit(30)
        )
      ).catch(() => null)
    );
  }

  if (params.programmeEnrollmentId) {
    queries.push(
      getDocs(
        query(
          collection(db, 'accountRestrictions'),
          where('programmeEnrollmentId', '==', asString(params.programmeEnrollmentId)),
          limit(30)
        )
      ).catch(() => null)
    );
  }

  if (queries.length === 0) return [];

  const snapshots = await Promise.all(queries);

  for (const snap of snapshots) {
    if (!snap?.docs) continue;
    for (const docSnap of snap.docs) {
      const data = {
        restrictionId: docSnap.id,
        ...(docSnap.data() || {}),
      } as AccountRestrictionRecord;

      if (
        params.includeCascadingFromSchool &&
        params.studentId &&
        (data.targetAccountType === 'SCHOOL' || data.targetAccountType === 'SCHOOL_ADMIN') &&
        data.cascadesToLinkedLearners === false &&
        !(Array.isArray(data.affectedStudentIds) && data.affectedStudentIds.includes(params.studentId))
      ) {
        continue;
      }

      if (
        params.includeCascadingFromParent &&
        params.studentId &&
        data.targetAccountType === 'PARENT' &&
        data.cascadesToLinkedLearners === false &&
        !(Array.isArray(data.affectedStudentIds) && data.affectedStudentIds.includes(params.studentId))
      ) {
        continue;
      }

      if (
        data.restrictedScope === 'PROGRAMME' &&
        data.programmeEnrollmentId &&
        params.programmeEnrollmentId !== data.programmeEnrollmentId &&
        !uniqueSubIds.includes(String(data.relatedSubscriptionId || ''))
      ) {
        continue;
      }

      if (isRestrictionExpiredAt(data, now)) {
        continue;
      }

      if (isRestrictionActiveAt(data, now)) {
        matched.set(docSnap.id, data);
      }
    }
  }

  return Array.from(matched.values()).sort((a, b) =>
    String(b.appliedAt || '').localeCompare(String(a.appliedAt || ''))
  );
}

async function resolveSchoolRecordClient(
  uid: string,
  userRecord: Record<string, any>,
  email: string,
  preferredSchoolId?: string
): Promise<Record<string, any> | null> {
  const candidates = Array.from(
    new Set(
      [
        preferredSchoolId,
        userRecord.schoolId,
        userRecord.schoolDocId,
        userRecord.school_id,
        uid,
      ]
        .map(asString)
        .filter(Boolean)
    )
  );

  for (const id of candidates) {
    const snap = await getDoc(doc(db, 'schools', id)).catch(() => null);
    if (snap?.exists()) {
      return { id: snap.id, ...(snap.data() || {}) };
    }
  }

  for (const field of ['adminUid', 'firebaseUid', 'userId']) {
    if (!uid) continue;
    const snap = await getDocs(query(collection(db, 'schools'), where(field, '==', uid), limit(1))).catch(() => null);
    if (snap && !snap.empty) {
      return { id: snap.docs[0].id, ...(snap.docs[0].data() || {}) };
    }
  }

  const emailCandidates = Array.from(new Set([email, userRecord.email].map(asString).filter(Boolean)));
  for (const em of emailCandidates) {
    for (const field of ['contactEmail', 'email']) {
      const exactSnap = await getDocs(query(collection(db, 'schools'), where(field, '==', em), limit(1))).catch(
        () => null
      );
      if (exactSnap && !exactSnap.empty) {
        return { id: exactSnap.docs[0].id, ...(exactSnap.docs[0].data() || {}) };
      }
      const lower = em.toLowerCase();
      if (lower !== em) {
        const lowerSnap = await getDocs(query(collection(db, 'schools'), where(field, '==', lower), limit(1))).catch(
          () => null
        );
        if (lowerSnap && !lowerSnap.empty) {
          return { id: lowerSnap.docs[0].id, ...(lowerSnap.docs[0].data() || {}) };
        }
      }
    }
  }

  return null;
}

async function loadSchoolSubscriptionClient(
  schoolId: string,
  schoolDoc: Record<string, any> | null,
  userRecord?: Record<string, any>,
  adminUid?: string
): Promise<BillingSubscriptionRecord> {
  const canonicalId = `school_${schoolId}`;
  const [canonicalSnap, adminSubSnap] = await Promise.all([
    getDoc(doc(db, 'billingSubscriptions', canonicalId)).catch(() => null),
    adminUid ? getDoc(doc(db, 'billingSubscriptions', `school_admin_${adminUid}`)).catch(() => null) : Promise.resolve(null),
  ]);

  const canonicalDoc: Record<string, any> | null = canonicalSnap?.exists()
    ? { id: canonicalSnap.id, ...(canonicalSnap.data() || {}) }
    : adminSubSnap?.exists()
    ? { id: adminSubSnap.id, ...(adminSubSnap.data() || {}) }
    : null;

  // Merge manual lock flag if school_admin sub is locked even when school sub exists
  if (canonicalSnap?.exists() && adminSubSnap?.exists()) {
    const adminSubData = (adminSubSnap.data() || {}) as Record<string, any>;
    if (adminSubData.manuallyLocked === true && canonicalDoc && !canonicalDoc.manuallyLocked) {
      canonicalDoc.manuallyLocked = true;
      canonicalDoc.manualLockReason = adminSubData.manualLockReason || canonicalDoc.manualLockReason;
      canonicalDoc.manualLockedAt = adminSubData.manualLockedAt || canonicalDoc.manualLockedAt;
    }
  }

  const schoolName = asString(
    schoolDoc?.name || schoolDoc?.schoolName || schoolDoc?.institutionName || userRecord?.schoolName || 'Partner School'
  );
  const recipientEmail = asString(schoolDoc?.contactEmail || schoolDoc?.email || userRecord?.email);

  return normalizeSubscriptionFromClientSource({
    id: canonicalId,
    accountType: 'SCHOOL',
    accountId: schoolId,
    accountName: schoolName,
    recipientEmail,
    schoolId,
    billingResponsibility: 'SCHOOL',
    canonicalDoc,
    legacyBilling: (schoolDoc?.billing as Record<string, any>) || (userRecord?.billing as Record<string, any>) || null,
    fallbackPlanName: asString(schoolDoc?.plan || 'School Institutional Subscription'),
  });
}

async function resolveLinkedChildrenForParentClient(
  parentUid: string,
  parentEmail: string,
  userRecord: Record<string, any>
) {
  const childrenMap = new Map<string, Record<string, any>>();
  const emailLower = asLower(parentEmail || userRecord.email);

  const queries: Promise<any>[] = [
    getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', parentUid), limit(50))).catch(() => null),
    getDocs(query(collection(db, 'students'), where('parentId', '==', parentUid), limit(50))).catch(() => null),
    getDoc(doc(db, 'parents', parentUid)).catch(() => null),
  ];
  if (emailLower) {
    queries.push(
      getDocs(query(collection(db, 'individualStudents'), where('parentEmail', '==', emailLower), limit(50))).catch(
        () => null
      ),
      getDocs(query(collection(db, 'students'), where('parentEmail', '==', emailLower), limit(50))).catch(() => null)
    );
  }

  const results = await Promise.all(queries);
  const absorb = (docSnap: any) => {
    if (!docSnap?.exists?.() && !docSnap?.data) return;
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

  const parentDocSnap = results[2];
  const explicitIds = new Set<string>();
  const addIds = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const id = asString(typeof item === 'object' && item ? item.id || item.studentId : item);
      if (id) explicitIds.add(id);
    }
  };
  addIds(userRecord.children);
  addIds(userRecord.linkedStudentIds);
  if (parentDocSnap?.exists?.()) {
    addIds(parentDocSnap.data()?.children);
    addIds(parentDocSnap.data()?.linkedStudentIds);
  }

  for (const cid of explicitIds) {
    if (childrenMap.has(cid)) continue;
    const [indSnap, stdSnap] = await Promise.all([
      getDoc(doc(db, 'individualStudents', cid)).catch(() => null),
      getDoc(doc(db, 'students', cid)).catch(() => null),
    ]);
    if (indSnap?.exists()) absorb(indSnap);
    else if (stdSnap?.exists()) absorb(stdSnap);
  }

  return Array.from(childrenMap.values());
}

async function resolveStudentDocumentsClient(
  uid: string,
  userRecord: Record<string, any>,
  email: string,
  preferredStudentDocId?: string
) {
  const directId = asString(
    preferredStudentDocId || userRecord.studentDocId || userRecord.individualStudentId || userRecord.studentRecordId
  );
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
      getDoc(doc(db, 'individualStudents', directId)).catch(() => null),
      getDoc(doc(db, 'students', directId)).catch(() => null),
    ]);
    if (indSnap?.exists()) absorb(indSnap.id, indSnap.data() || {});
    if (stdSnap?.exists()) absorb(stdSnap.id, stdSnap.data() || {});
  }

  if (!Object.keys(merged).length && uid) {
    const [byUidInd, byUidStd] = await Promise.all([
      getDocs(query(collection(db, 'individualStudents'), where('firebaseUid', '==', uid), limit(2))).catch(() => null),
      getDocs(query(collection(db, 'students'), where('firebaseUid', '==', uid), limit(2))).catch(() => null),
    ]);
    byUidInd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
    byUidStd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
  }

  const emailLower = asLower(email || userRecord.email);
  if (!Object.keys(merged).length && emailLower) {
    const [byEmailInd, byEmailStd] = await Promise.all([
      getDocs(query(collection(db, 'individualStudents'), where('email', '==', emailLower), limit(2))).catch(() => null),
      getDocs(query(collection(db, 'students'), where('email', '==', emailLower), limit(2))).catch(() => null),
    ]);
    byEmailInd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
    byEmailStd?.docs.forEach((d) => absorb(d.id, d.data() || {}));
  }

  return { studentDocId: resolvedDocId || uid, studentDoc: merged };
}

function buildExemptResult(
  role: 'admin' | 'staff',
  uid: string,
  displayName: string,
  now: Date
): PortalEntitlementResult {
  return {
    role,
    accountType: role === 'admin' ? 'ADMIN' : 'STAFF',
    accountId: uid,
    accountName: displayName,
    billingResponsibility: 'EXEMPT',
    status: 'EXEMPT',
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
    currency: 'NGN',
    dueDateIso: null,
    dueDateFormatted: null,
    graceEndsAtIso: null,
    graceEndsAtFormatted: null,
    daysUntilDue: null,
    graceDaysRemaining: 0,
    subscriptionId: null,
    schoolId: null,
    schoolName: null,
    headline: '',
    bannerText: '',
    message: '',
    restrictedClickMessage: '',
    affectedChildren: [],
    allChildrenLocked: false,
    lockedChildIds: [],
    selfFundedProgrammes: [],
    evaluatedAtIso: now.toISOString(),
  };
}

/**
 * Client-side authoritative Firestore entitlement resolver.
 * Mirrors `api/_lib/subscription-service.ts` for:
 * - Vite preview / fallback environments where `/api/subscription-status` returns `{ fallback: true }`
 * - Admin impersonation / masquerade mode (so admins viewing a restricted school/parent/student see the exact locked experience)
 */
export async function evaluatePortalEntitlementFromFirestore(
  portalRoleHint?: string
): Promise<PortalEntitlementResult | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const effective = getEffectiveAuth();
  const now = new Date();

  const targetUid = effective.isMasquerading
    ? effective.effectiveUid || currentUser.uid
    : currentUser.uid;
  const userSnap = targetUid ? await getDoc(doc(db, 'users', targetUid)).catch(() => null) : null;
  const userRecord = userSnap?.exists() ? (userSnap.data() || {}) : {};
  const email = asString(
    effective.isMasquerading
      ? effective.effectiveEmail || userRecord.email
      : currentUser.email || userRecord.email
  );
  const displayName = asString(
    effective.isMasquerading
      ? effective.effectiveName || userRecord.fullName || userRecord.name || email || 'Portal User'
      : userRecord.fullName || userRecord.name || userRecord.displayName || currentUser.displayName || email || 'Portal User'
  );

  // Determine the role to evaluate:
  // - During admin masquerade, evaluate the impersonated target's role (e.g., school/parent/student)
  // - Otherwise evaluate the user's real role from Firestore (with portalRouteHint fallback only for non-admin/non-staff)
  const realUserRole = normalizePortalRole(userRecord.role);
  const effectiveRole = effective.isMasquerading
    ? normalizePortalRole(portalRoleHint || effective.effectiveRole)
    : realUserRole === 'admin' || realUserRole === 'staff'
    ? realUserRole
    : portalRoleHint && ['school', 'parent', 'student'].includes(portalRoleHint)
    ? (portalRoleHint as 'school' | 'parent' | 'student')
    : realUserRole;

  if (effectiveRole === 'admin' || effectiveRole === 'staff') {
    return buildExemptResult(effectiveRole, targetUid, displayName, now);
  }

  // 1. SCHOOL ADMINISTRATOR
  if (effectiveRole === 'school') {
    const preferredSchoolId = effective.isMasquerading
      ? effective.effectiveSchoolId
      : sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || '';

    const schoolDoc = await resolveSchoolRecordClient(targetUid, userRecord, email, preferredSchoolId);
    const schoolId = asString(schoolDoc?.id || preferredSchoolId || userRecord.schoolId || targetUid);
    const subscription = await loadSchoolSubscriptionClient(schoolId, schoolDoc, userRecord, targetUid);

    const activeRestrictions = await loadActiveRestrictionsClient({
      targetAccountIds: [schoolId, targetUid],
      subscriptionIds: [subscription.id, `school_${schoolId}`, `school_admin_${targetUid}`],
      schoolId,
      includeCascadingFromSchool: true,
      now,
    });

    const evaluated = evaluateSubscriptionState({ subscription, activeRestrictions, now });
    const publicRestrictions = evaluated.activeRestrictionRecords.map((r) =>
      sanitizeRestrictionForUser(r, 'school')
    );
    const copy = buildRoleLockdownCopy({
      role: 'school',
      isManuallyLocked: evaluated.isManuallyLocked,
      manualLockReason: evaluated.manualLockReason,
      restrictionType: evaluated.restrictionType,
      lockReasonCode: evaluated.lockReasonCode,
      lockReasonLabel: evaluated.lockReasonLabel,
      userFacingMessage: evaluated.userFacingMessage,
      hasPaymentRestriction: evaluated.hasPaymentRestriction,
      hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
    });

    return {
      role: 'school',
      accountType: 'SCHOOL',
      accountId: schoolId,
      accountName: subscription.accountName || displayName,
      billingResponsibility: subscription.billingResponsibility,
      status: evaluated.status,
      isLocked: evaluated.isLocked,
      isManuallyLocked: evaluated.isManuallyLocked,
      manualLockReason: evaluated.manualLockReason,
      isManuallyUnlocked: evaluated.isManuallyUnlocked,
      restrictionType: evaluated.restrictionType,
      lockReasonCode: evaluated.lockReasonCode,
      lockReasonLabel: evaluated.lockReasonLabel,
      effectiveAtIso: evaluated.effectiveAtIso,
      effectiveAtFormatted: evaluated.effectiveAtFormatted,
      expiresAtIso: evaluated.expiresAtIso,
      expiresAtFormatted: evaluated.expiresAtFormatted,
      activeRestrictions: publicRestrictions,
      hasPaymentRestriction: evaluated.hasPaymentRestriction,
      hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
      nextActionType: copy.nextActionType,
      inGracePeriod: evaluated.inGracePeriod,
      isDueSoon: evaluated.isDueSoon,
      isExempt: evaluated.isExempt,
      hasActiveOverride: evaluated.hasActiveOverride,
      overrideExpiresAt: evaluated.overrideExpiresAt,
      billingConfigIncomplete: evaluated.billingConfigIncomplete,
      canPay: copy.canPay,
      payNowPath: copy.payNowPath,
      amountDue: evaluated.amountDue,
      currency: subscription.currency || 'NGN',
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

  // 2. PARENT
  if (effectiveRole === 'parent') {
    const children = await resolveLinkedChildrenForParentClient(targetUid, email, userRecord);
    const parentSubSnap = await getDoc(doc(db, 'billingSubscriptions', `parent_${targetUid}`)).catch(() => null);
    const parentCanonical = parentSubSnap?.exists() ? { id: parentSubSnap.id, ...(parentSubSnap.data() || {}) } : null;

    const parentAccountRestrictions = await loadActiveRestrictionsClient({
      targetAccountIds: [targetUid],
      subscriptionIds: [`parent_${targetUid}`],
      parentId: targetUid,
      includeCascadingFromParent: true,
      now,
    });

    const childSummaries: ChildEntitlementSummary[] = [];
    const childActiveRestrictions: AccountRestrictionRecord[] = [];

    for (const child of children) {
      const childSchoolId = asString(child.schoolId);
      const isSchoolFundedChild =
        Boolean(childSchoolId) &&
        asLower(child.registrationSource) !== 'parent-enrollment-approved' &&
        !child.parentFunded;
      const childName = asString(child.fullName || child.studentName || child.name || 'Enrolled Child');
      const programmeName = asString(
        child.programTitle || child.programName || child.plan || child.track || 'Learning Programme'
      );

      if (isSchoolFundedChild) {
        const schoolSnap = await getDoc(doc(db, 'schools', childSchoolId)).catch(() => null);
        const schoolSub = await loadSchoolSubscriptionClient(
          childSchoolId,
          schoolSnap?.exists() ? { id: schoolSnap.id, ...(schoolSnap.data() || {}) } : null
        );
        const schoolRestrictions = await loadActiveRestrictionsClient({
          targetAccountIds: [childSchoolId],
          subscriptionIds: [schoolSub.id],
          schoolId: childSchoolId,
          includeCascadingFromSchool: true,
          now,
        });
        const schoolEval = evaluateSubscriptionState({
          subscription: schoolSub,
          activeRestrictions: schoolRestrictions,
          now,
        });
        childSummaries.push({
          childId: child.id,
          childName,
          programmeId: asString(child.programId || child.assignedProgramId) || null,
          programmeName,
          subscriptionId: schoolSub.id,
          billingResponsibility: 'SCHOOL',
          status: schoolEval.status,
          isLocked: schoolEval.isLocked,
          inGracePeriod: schoolEval.inGracePeriod,
          amountDue: 0,
          dueDateIso: schoolEval.dueDateIso,
          dueDateFormatted: schoolEval.dueDateFormatted,
          graceEndsAtIso: schoolEval.graceEndsAtIso,
          graceDaysRemaining: schoolEval.graceDaysRemaining,
          daysUntilDue: schoolEval.daysUntilDue,
          feeItemId: null,
        });
        continue;
      }

      const childSubId = `parent_${targetUid}_child_${child.id}`;
      const childSubSnap = await getDoc(doc(db, 'billingSubscriptions', childSubId)).catch(() => null);
      const childCanonical = childSubSnap?.exists() ? { id: childSubSnap.id, ...(childSubSnap.data() || {}) } : null;

      const hasChildSpecificBilling = Boolean(
        childCanonical ||
          Number(child.tuitionFee || child.fee || child.remainingBalance || 0) > 0 ||
          child.nextDueDate ||
          child.paidThrough
      );

      const childSub = normalizeSubscriptionFromClientSource({
        id: childCanonical ? childSubId : parentCanonical ? `parent_${targetUid}` : childSubId,
        accountType: 'PARENT_CHILD',
        accountId: child.id,
        accountName: childName,
        recipientEmail: email,
        parentId: targetUid,
        studentId: child.id,
        studentName: childName,
        billingResponsibility: 'PARENT',
        canonicalDoc: childCanonical || (!hasChildSpecificBilling ? parentCanonical : null),
        legacyBilling: hasChildSpecificBilling
          ? {
              baseAmount: Number(child.tuitionFee ?? child.fee ?? child.amount ?? 0),
              amountPaid: Number(child.amountPaid ?? 0),
              remainingBalance:
                child.remainingBalance !== undefined
                  ? Number(child.remainingBalance)
                  : asString(child.paymentStatus).toUpperCase() === 'PAID'
                  ? 0
                  : Number(child.tuitionFee ?? child.fee ?? 0),
              status: child.paymentStatus || child.billingStatus || child.status,
              nextDueDate:
                child.nextDueDate || child.paidThrough || userRecord.billing?.nextDueDate || userRecord.billing?.paidThrough,
              paidThrough: child.paidThrough || userRecord.billing?.paidThrough,
              durationWeeks: child.durationWeeks || userRecord.billing?.durationWeeks || 4,
              planName: programmeName,
              exempt: child.exempt || child.isExempt || userRecord.billing?.exempt,
            }
          : userRecord.billing || null,
        fallbackPlanName: programmeName,
      });

      const specificChildRestrictions = await loadActiveRestrictionsClient({
        targetAccountIds: [child.id],
        subscriptionIds: [childSubId],
        studentId: child.id,
        now,
      });
      const childEval = evaluateSubscriptionState({
        subscription: childSub,
        activeRestrictions: [...parentAccountRestrictions, ...specificChildRestrictions],
        now,
      });
      if (childEval.isLocked) {
        childActiveRestrictions.push(...childEval.activeRestrictionRecords);
      }
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
        feeItemId: `${child.id}_${asString(child.programId || 'tuition')}`,
      });
    }

    const parentAccountSub = normalizeSubscriptionFromClientSource({
      id: `parent_${targetUid}`,
      accountType: 'PARENT',
      accountId: targetUid,
      accountName: displayName,
      recipientEmail: email,
      parentId: targetUid,
      billingResponsibility: 'PARENT',
      canonicalDoc: parentCanonical,
      legacyBilling: (userRecord.billing as Record<string, any>) || null,
      fallbackPlanName: 'Family Tuition Plan',
    });
    const parentAccountEval = evaluateSubscriptionState({
      subscription: parentAccountSub,
      activeRestrictions: parentAccountRestrictions,
      now,
    });

    const parentFundedChildren = childSummaries.filter((c) => c.billingResponsibility === 'PARENT');
    const lockedChildren = parentFundedChildren.filter((c) => c.isLocked);
    const graceChildren = parentFundedChildren.filter((c) => c.inGracePeriod);
    const dueSoonChildren = parentFundedChildren.filter((c) => c.status === 'DUE_SOON');

    const hasLockedChild = lockedChildren.length > 0;
    const allChildrenLocked =
      parentFundedChildren.length > 0
        ? lockedChildren.length === parentFundedChildren.length
        : parentAccountEval.isLocked;
    const isLocked =
      parentAccountEval.isManuallyLocked ||
      parentAccountEval.hasNonPaymentRestriction ||
      hasLockedChild ||
      (parentFundedChildren.length === 0 && parentAccountEval.isLocked);
    const inGracePeriod =
      !isLocked && (graceChildren.length > 0 || (parentFundedChildren.length === 0 && parentAccountEval.inGracePeriod));
    const isDueSoon = !isLocked && !inGracePeriod && (dueSoonChildren.length > 0 || parentAccountEval.isDueSoon);

    const mergedParentRestrictionMap = new Map<string, AccountRestrictionRecord>();
    for (const r of [...parentAccountEval.activeRestrictionRecords, ...childActiveRestrictions]) {
      mergedParentRestrictionMap.set(r.restrictionId, r);
    }
    const publicParentRestrictions = Array.from(mergedParentRestrictionMap.values()).map((r) =>
      sanitizeRestrictionForUser(r, 'parent')
    );
    const hasPaymentRestriction =
      publicParentRestrictions.some((r) => r.isPaymentRelated) ||
      (!parentAccountEval.hasNonPaymentRestriction && hasLockedChild);
    const hasNonPaymentRestriction = publicParentRestrictions.some((r) => !r.isPaymentRelated);
    const primaryPublic = publicParentRestrictions[0] || null;

    const totalAmountDue =
      parentFundedChildren.length > 0
        ? Number(
            parentFundedChildren
              .filter((c) => c.isLocked || c.inGracePeriod || c.status === 'DUE_SOON' || c.status === 'PARTIALLY_PAID')
              .reduce((sum, c) => sum + c.amountDue, 0)
              .toFixed(2)
          )
        : parentAccountEval.amountDue;

    const primaryUrgentChild = lockedChildren[0] || graceChildren[0] || dueSoonChildren[0] || null;
    const copy = buildRoleLockdownCopy({
      role: 'parent',
      isManuallyLocked: parentAccountEval.isManuallyLocked || hasNonPaymentRestriction,
      manualLockReason: primaryPublic?.userFacingMessage || parentAccountEval.manualLockReason,
      restrictionType: primaryPublic?.restrictionType || parentAccountEval.restrictionType,
      lockReasonCode: primaryPublic?.reasonCode || parentAccountEval.lockReasonCode,
      lockReasonLabel: primaryPublic?.reasonLabel || parentAccountEval.lockReasonLabel,
      userFacingMessage: primaryPublic?.userFacingMessage || parentAccountEval.userFacingMessage,
      hasPaymentRestriction,
      hasNonPaymentRestriction,
    });

    return {
      role: 'parent',
      accountType: 'PARENT',
      accountId: targetUid,
      accountName: displayName,
      billingResponsibility: 'PARENT',
      status: isLocked
        ? parentAccountEval.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : 'LOCKED'
        : inGracePeriod
        ? 'GRACE_PERIOD'
        : isDueSoon
        ? 'DUE_SOON'
        : parentAccountEval.status,
      isLocked,
      isManuallyLocked: parentAccountEval.isManuallyLocked || hasNonPaymentRestriction,
      manualLockReason: primaryPublic?.userFacingMessage || parentAccountEval.manualLockReason,
      isManuallyUnlocked: parentAccountEval.isManuallyUnlocked,
      restrictionType: primaryPublic?.restrictionType || parentAccountEval.restrictionType,
      lockReasonCode: primaryPublic?.reasonCode || parentAccountEval.lockReasonCode,
      lockReasonLabel: primaryPublic?.reasonLabel || parentAccountEval.lockReasonLabel,
      effectiveAtIso: primaryPublic?.effectiveAtIso || parentAccountEval.effectiveAtIso,
      effectiveAtFormatted: primaryPublic?.effectiveAtFormatted || parentAccountEval.effectiveAtFormatted,
      expiresAtIso: primaryPublic?.expiresAtIso || parentAccountEval.expiresAtIso,
      expiresAtFormatted: primaryPublic?.expiresAtFormatted || parentAccountEval.expiresAtFormatted,
      activeRestrictions: publicParentRestrictions,
      hasPaymentRestriction,
      hasNonPaymentRestriction,
      nextActionType: copy.nextActionType,
      inGracePeriod,
      isDueSoon,
      isExempt: parentAccountEval.isExempt && !isLocked,
      hasActiveOverride: parentAccountEval.hasActiveOverride,
      overrideExpiresAt: parentAccountEval.overrideExpiresAt,
      billingConfigIncomplete: parentAccountEval.billingConfigIncomplete && parentFundedChildren.length === 0,
      canPay: copy.canPay,
      payNowPath:
        copy.canPay && primaryUrgentChild?.feeItemId
          ? `/portal/parent/payments?childId=${encodeURIComponent(primaryUrgentChild.childId)}`
          : copy.payNowPath,
      amountDue: totalAmountDue,
      currency: 'NGN',
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

  // 3. STUDENT
  const { studentDocId, studentDoc } = await resolveStudentDocumentsClient(
    targetUid,
    userRecord,
    email,
    effective.isMasquerading ? effective.effectiveStudentDocId : sessionStorage.getItem('studentDocId') || ''
  );
  const schoolId = asString(
    studentDoc.schoolId ||
      userRecord.schoolId ||
      (effective.isMasquerading ? effective.effectiveSchoolId : sessionStorage.getItem('schoolId'))
  );
  const parentId = asString(
    studentDoc.parentId ||
      studentDoc.parentUid ||
      userRecord.parentId ||
      userRecord.parentUid ||
      sessionStorage.getItem('parentId') ||
      sessionStorage.getItem('studentParentId')
  );
  const regSource = asLower(studentDoc.registrationSource || userRecord.registrationSource);
  const regType = asLower(userRecord.studentRegistrationType || studentDoc.registrationType);

  let fundingCategory: StudentFundingCategory = 'INDIVIDUAL_SELF_FUNDED';
  if (schoolId && regType !== 'individual' && regType !== 'parent' && regSource !== 'parent-enrollment-approved') {
    fundingCategory = 'SCHOOL_FUNDED';
  } else if (parentId || regType === 'parent' || regSource === 'parent-enrollment-approved') {
    fundingCategory = 'PARENT_FUNDED';
  }

  const selfFundedSnap = await getDocs(
    query(collection(db, 'programme_enrollments'), where('studentUid', '==', targetUid), limit(30))
  ).catch(() => null);

  const selfFundedProgrammes: SelfFundedProgrammeEntitlement[] = [];
  if (selfFundedSnap?.docs) {
    for (const docSnap of selfFundedSnap.docs) {
      const d = docSnap.data() || {};
      if (asString(d.billingResponsibility) !== 'STUDENT_SELF_FUNDED') continue;
      const progSubId = `prog_enr_${docSnap.id}`;
      const [progSubSnap, progRestrictions] = await Promise.all([
        getDoc(doc(db, 'billingSubscriptions', progSubId)).catch(() => null),
        loadActiveRestrictionsClient({
          targetAccountIds: [docSnap.id],
          subscriptionIds: [progSubId],
          programmeEnrollmentId: docSnap.id,
          now,
        }),
      ]);
      const progCanonical = progSubSnap?.exists() ? { id: progSubSnap.id, ...(progSubSnap.data() || {}) } : null;
      const sub = normalizeSubscriptionFromClientSource({
        id: progSubId,
        accountType: 'STUDENT_SELF_FUNDED_PROGRAMME',
        accountId: targetUid,
        accountName: displayName,
        recipientEmail: email,
        studentId: studentDocId,
        studentName: displayName,
        programmeEnrollmentId: docSnap.id,
        billingResponsibility: 'STUDENT_SELF_FUNDED',
        canonicalDoc: progCanonical,
        legacyBilling: {
          baseAmount: Number(d.approvedFee || 0),
          amountPaid: Number(d.amountPaid || 0),
          remainingBalance: Number(
            d.remainingBalance ?? Math.max(0, Number(d.approvedFee || 0) - Number(d.amountPaid || 0))
          ),
          allowDepositAccess: Boolean(d.allowDepositAccess),
          depositAmount: Number(d.depositAmount || 0),
          status: d.enrollmentStatus === 'EXEMPT' ? 'EXEMPT' : d.paymentStatus,
          nextDueDate: d.nextDueDate || d.paidThrough,
          paidThrough: d.paidThrough,
          durationWeeks: Number(d.durationWeeks || 8),
          programId: d.programId,
          programTitle: d.programTitle,
          manuallyLocked: Boolean(d.manuallyLocked),
          manualLockReason: d.manualLockReason || null,
          manuallyUnlocked: Boolean(d.manuallyUnlocked),
        },
      });
      const ev = evaluateSubscriptionState({ subscription: sub, activeRestrictions: progRestrictions, now });
      selfFundedProgrammes.push({
        programmeEnrollmentId: docSnap.id,
        programmeId: asString(d.programId),
        programmeName: asString(d.programTitle || 'Additional Programme'),
        status: ev.status,
        isLocked: ev.isLocked,
        amountDue: ev.amountDue,
        dueDateIso: ev.dueDateIso,
        restrictionType: ev.restrictionType,
        lockReasonCode: ev.lockReasonCode,
        lockReasonLabel: ev.lockReasonLabel,
        userFacingMessage: ev.userFacingMessage,
        canPay: ev.hasPaymentRestriction,
      });
    }
  }

  // 3A. School-funded student
  if (fundingCategory === 'SCHOOL_FUNDED' && schoolId) {
    const schoolSnap = await getDoc(doc(db, 'schools', schoolId)).catch(() => null);
    const schoolDoc = schoolSnap?.exists() ? { id: schoolSnap.id, ...(schoolSnap.data() || {}) } : null;
    const schoolSub = await loadSchoolSubscriptionClient(schoolId, schoolDoc);
    const activeRestrictions = await loadActiveRestrictionsClient({
      targetAccountIds: [schoolId, targetUid, studentDocId],
      subscriptionIds: [schoolSub.id, `student_${targetUid}`],
      schoolId,
      studentId: studentDocId,
      includeCascadingFromSchool: true,
      now,
    });
    const evaluated = evaluateSubscriptionState({ subscription: schoolSub, activeRestrictions, now });
    const publicRestrictions = evaluated.activeRestrictionRecords.map((r) =>
      sanitizeRestrictionForUser(r, 'student', 'SCHOOL_FUNDED')
    );
    const copy = buildRoleLockdownCopy({
      role: 'student',
      studentFundingCategory: 'SCHOOL_FUNDED',
      isManuallyLocked: evaluated.isManuallyLocked,
      manualLockReason: evaluated.manualLockReason,
      restrictionType: evaluated.restrictionType,
      lockReasonCode: evaluated.lockReasonCode,
      lockReasonLabel: evaluated.lockReasonLabel,
      hasPaymentRestriction: evaluated.hasPaymentRestriction,
      hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
    });

    return {
      role: 'student',
      accountType: 'SCHOOL',
      accountId: studentDocId,
      accountName: asString(studentDoc.fullName || studentDoc.name || displayName),
      billingResponsibility: 'SCHOOL',
      studentFundingCategory: 'SCHOOL_FUNDED',
      status: evaluated.status,
      isLocked: evaluated.isLocked,
      isManuallyLocked: evaluated.isManuallyLocked,
      manualLockReason: null,
      isManuallyUnlocked: evaluated.isManuallyUnlocked,
      restrictionType: evaluated.restrictionType,
      lockReasonCode: evaluated.lockReasonCode,
      lockReasonLabel: publicRestrictions[0]?.reasonLabel || 'School Portal Access Restricted',
      effectiveAtIso: evaluated.effectiveAtIso,
      effectiveAtFormatted: evaluated.effectiveAtFormatted,
      expiresAtIso: evaluated.expiresAtIso,
      expiresAtFormatted: evaluated.expiresAtFormatted,
      activeRestrictions: publicRestrictions,
      hasPaymentRestriction: false,
      hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
      nextActionType: copy.nextActionType,
      inGracePeriod: evaluated.inGracePeriod,
      isDueSoon: evaluated.isDueSoon,
      isExempt: evaluated.isExempt,
      hasActiveOverride: evaluated.hasActiveOverride,
      overrideExpiresAt: evaluated.overrideExpiresAt,
      billingConfigIncomplete: evaluated.billingConfigIncomplete,
      canPay: false,
      payNowPath: null,
      amountDue: 0,
      currency: schoolSub.currency || 'NGN',
      dueDateIso: evaluated.dueDateIso,
      dueDateFormatted: evaluated.dueDateFormatted,
      graceEndsAtIso: evaluated.graceEndsAtIso,
      graceEndsAtFormatted: evaluated.graceEndsAtFormatted,
      daysUntilDue: evaluated.daysUntilDue,
      graceDaysRemaining: evaluated.graceDaysRemaining,
      subscriptionId: schoolSub.id,
      schoolId,
      schoolName: schoolSub.accountName || asString(studentDoc.schoolName || 'Your School'),
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

  // 3B. Parent-funded student
  if (fundingCategory === 'PARENT_FUNDED') {
    const resolvedParentId = parentId || asString(studentDoc.parentUid);
    const childSubId = resolvedParentId ? `parent_${resolvedParentId}_child_${studentDocId}` : `student_${studentDocId}`;
    const [childSubSnap, parentSubSnap, parentUserSnap, activeRestrictions] = await Promise.all([
      getDoc(doc(db, 'billingSubscriptions', childSubId)).catch(() => null),
      resolvedParentId ? getDoc(doc(db, 'billingSubscriptions', `parent_${resolvedParentId}`)).catch(() => null) : Promise.resolve(null),
      resolvedParentId ? getDoc(doc(db, 'users', resolvedParentId)).catch(() => null) : Promise.resolve(null),
      loadActiveRestrictionsClient({
        targetAccountIds: [resolvedParentId, studentDocId, targetUid].filter(Boolean),
        subscriptionIds: [childSubId, resolvedParentId ? `parent_${resolvedParentId}` : '', `student_${targetUid}`].filter(Boolean),
        parentId: resolvedParentId || null,
        studentId: studentDocId,
        includeCascadingFromParent: true,
        now,
      }),
    ]);

    const childCanonical = childSubSnap?.exists() ? { id: childSubSnap.id, ...(childSubSnap.data() || {}) } : null;
    const parentCanonical = parentSubSnap?.exists() ? { id: parentSubSnap.id, ...(parentSubSnap.data() || {}) } : null;
    const parentUser = parentUserSnap?.exists() ? (parentUserSnap.data() || {}) : {};

    const sub = normalizeSubscriptionFromClientSource({
      id: childCanonical ? childSubId : parentCanonical ? `parent_${resolvedParentId}` : childSubId,
      accountType: 'PARENT_CHILD',
      accountId: studentDocId,
      accountName: asString(studentDoc.fullName || studentDoc.name || displayName),
      recipientEmail: asString(parentUser.email || studentDoc.parentEmail),
      parentId: resolvedParentId || null,
      studentId: studentDocId,
      studentName: asString(studentDoc.fullName || studentDoc.name || displayName),
      billingResponsibility: 'PARENT',
      canonicalDoc: childCanonical || parentCanonical,
      legacyBilling: {
        baseAmount: Number(studentDoc.tuitionFee ?? studentDoc.fee ?? parentUser.billing?.baseAmount ?? 0),
        amountPaid: Number(studentDoc.amountPaid ?? parentUser.billing?.amountPaid ?? 0),
        remainingBalance:
          studentDoc.remainingBalance !== undefined
            ? Number(studentDoc.remainingBalance)
            : asString(studentDoc.paymentStatus).toUpperCase() === 'PAID'
            ? 0
            : Number(studentDoc.tuitionFee ?? studentDoc.fee ?? parentUser.billing?.remainingBalance ?? 0),
        status: studentDoc.paymentStatus || parentUser.billing?.status || studentDoc.status,
        nextDueDate:
          studentDoc.nextDueDate || studentDoc.paidThrough || parentUser.billing?.nextDueDate || parentUser.billing?.paidThrough,
        paidThrough: studentDoc.paidThrough || parentUser.billing?.paidThrough,
        durationWeeks: studentDoc.durationWeeks || parentUser.billing?.durationWeeks || 4,
        exempt: studentDoc.exempt || studentDoc.isExempt || parentUser.billing?.exempt,
      },
    });

    const evaluated = evaluateSubscriptionState({ subscription: sub, activeRestrictions, now });
    const publicRestrictions = evaluated.activeRestrictionRecords.map((r) =>
      sanitizeRestrictionForUser(r, 'student', 'PARENT_FUNDED')
    );
    const copy = buildRoleLockdownCopy({
      role: 'student',
      studentFundingCategory: 'PARENT_FUNDED',
      isManuallyLocked: evaluated.isManuallyLocked,
      manualLockReason: null,
      restrictionType: evaluated.restrictionType,
      lockReasonCode: evaluated.lockReasonCode,
      lockReasonLabel: evaluated.lockReasonLabel,
      hasPaymentRestriction: evaluated.hasPaymentRestriction,
      hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
    });

    return {
      role: 'student',
      accountType: 'PARENT_CHILD',
      accountId: studentDocId,
      accountName: sub.accountName || displayName,
      billingResponsibility: 'PARENT',
      studentFundingCategory: 'PARENT_FUNDED',
      status: evaluated.status,
      isLocked: evaluated.isLocked,
      isManuallyLocked: evaluated.isManuallyLocked,
      manualLockReason: null,
      isManuallyUnlocked: evaluated.isManuallyUnlocked,
      restrictionType: evaluated.restrictionType,
      lockReasonCode: evaluated.lockReasonCode,
      lockReasonLabel: publicRestrictions[0]?.reasonLabel || 'Programme Access Restricted',
      effectiveAtIso: evaluated.effectiveAtIso,
      effectiveAtFormatted: evaluated.effectiveAtFormatted,
      expiresAtIso: evaluated.expiresAtIso,
      expiresAtFormatted: evaluated.expiresAtFormatted,
      activeRestrictions: publicRestrictions,
      hasPaymentRestriction: false,
      hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
      nextActionType: copy.nextActionType,
      inGracePeriod: evaluated.inGracePeriod,
      isDueSoon: evaluated.isDueSoon,
      isExempt: evaluated.isExempt,
      hasActiveOverride: evaluated.hasActiveOverride,
      overrideExpiresAt: evaluated.overrideExpiresAt,
      billingConfigIncomplete: evaluated.billingConfigIncomplete,
      canPay: false,
      payNowPath: null,
      amountDue: 0,
      currency: sub.currency || 'NGN',
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

  // 3C. Individually enrolled student
  const indSubId = `student_${targetUid}`;
  const [indSubSnap, activeRestrictions] = await Promise.all([
    getDoc(doc(db, 'billingSubscriptions', indSubId)).catch(() => null),
    loadActiveRestrictionsClient({
      targetAccountIds: [targetUid, studentDocId].filter(Boolean),
      subscriptionIds: [indSubId],
      studentId: studentDocId,
      now,
    }),
  ]);
  const indCanonical = indSubSnap?.exists() ? { id: indSubSnap.id, ...(indSubSnap.data() || {}) } : null;

  const indSub = normalizeSubscriptionFromClientSource({
    id: indSubId,
    accountType: 'INDIVIDUAL_STUDENT',
    accountId: targetUid,
    accountName: asString(studentDoc.fullName || studentDoc.name || displayName),
    recipientEmail: email,
    studentId: studentDocId,
    studentName: asString(studentDoc.fullName || studentDoc.name || displayName),
    billingResponsibility: 'STUDENT',
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
          : asString(studentDoc.paymentStatus || userRecord.billing?.status).toUpperCase() === 'PAID'
          ? 0
          : Number(userRecord.billing?.baseAmount ?? studentDoc.tuitionFee ?? studentDoc.fee ?? 0),
      status: userRecord.billing?.status || studentDoc.paymentStatus || studentDoc.status,
      nextDueDate:
        userRecord.billing?.nextDueDate || studentDoc.nextDueDate || userRecord.billing?.paidThrough || studentDoc.paidThrough,
      paidThrough: userRecord.billing?.paidThrough || studentDoc.paidThrough,
      durationWeeks: userRecord.billing?.durationWeeks || studentDoc.durationWeeks || 4,
      exempt: userRecord.billing?.exempt || studentDoc.exempt || studentDoc.isExempt,
    },
    fallbackPlanName: asString(studentDoc.programName || studentDoc.plan || 'Individual Learning Programme'),
  });

  const evaluated = evaluateSubscriptionState({ subscription: indSub, activeRestrictions, now });
  const publicRestrictions = evaluated.activeRestrictionRecords.map((r) =>
    sanitizeRestrictionForUser(r, 'student', 'INDIVIDUAL_SELF_FUNDED')
  );
  const copy = buildRoleLockdownCopy({
    role: 'student',
    studentFundingCategory: 'INDIVIDUAL_SELF_FUNDED',
    isManuallyLocked: evaluated.isManuallyLocked,
    manualLockReason: evaluated.manualLockReason,
    restrictionType: evaluated.restrictionType,
    lockReasonCode: evaluated.lockReasonCode,
    lockReasonLabel: evaluated.lockReasonLabel,
    userFacingMessage: evaluated.userFacingMessage,
    hasPaymentRestriction: evaluated.hasPaymentRestriction,
    hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
  });

  return {
    role: 'student',
    accountType: 'INDIVIDUAL_STUDENT',
    accountId: targetUid,
    accountName: indSub.accountName || displayName,
    billingResponsibility: indSub.billingResponsibility,
    studentFundingCategory: 'INDIVIDUAL_SELF_FUNDED',
    status: evaluated.status,
    isLocked: evaluated.isLocked,
    isManuallyLocked: evaluated.isManuallyLocked,
    manualLockReason: evaluated.manualLockReason,
    isManuallyUnlocked: evaluated.isManuallyUnlocked,
    restrictionType: evaluated.restrictionType,
    lockReasonCode: evaluated.lockReasonCode,
    lockReasonLabel: evaluated.lockReasonLabel,
    effectiveAtIso: evaluated.effectiveAtIso,
    effectiveAtFormatted: evaluated.effectiveAtFormatted,
    expiresAtIso: evaluated.expiresAtIso,
    expiresAtFormatted: evaluated.expiresAtFormatted,
    activeRestrictions: publicRestrictions,
    hasPaymentRestriction: evaluated.hasPaymentRestriction,
    hasNonPaymentRestriction: evaluated.hasNonPaymentRestriction,
    nextActionType: copy.nextActionType,
    inGracePeriod: evaluated.inGracePeriod,
    isDueSoon: evaluated.isDueSoon,
    isExempt: evaluated.isExempt,
    hasActiveOverride: evaluated.hasActiveOverride,
    overrideExpiresAt: evaluated.overrideExpiresAt,
    billingConfigIncomplete: evaluated.billingConfigIncomplete,
    canPay: copy.canPay,
    payNowPath: copy.payNowPath,
    amountDue: evaluated.amountDue,
    currency: indSub.currency || 'NGN',
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
