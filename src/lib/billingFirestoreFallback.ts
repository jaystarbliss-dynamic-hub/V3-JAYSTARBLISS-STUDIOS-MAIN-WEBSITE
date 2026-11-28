import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  GRACE_PERIOD_DAYS,
  computeLockdownAt,
  evaluateSubscriptionState,
  formatLagosDate,
  parseDateSafe,
  resolvePlanDurationWeeks,
  type BillingResponsibility,
  type BillingSubscriptionRecord,
} from '../../api/_lib/subscription-core';
import {
  getLockReasonLabel,
  isPaymentRestrictionRecord,
  isRestrictionActiveAt,
  validateManualLockInput,
  validateManualUnlockInput,
  type AccountRestrictionRecord,
  type BulkLockPreviewItem,
  type BulkLockPreviewResult,
  type BulkLockTargetInput,
  type RestrictionTargetAccountType,
} from '../../api/_lib/restriction-core';
import {
  computeManualPaymentRecordAndTransition,
  type ManualPaymentTargetType,
} from '../../api/_lib/manual-payment-core';
import {
  DERIVED_BALANCE_COLLECTIONS,
  PRESERVED_COLLECTIONS,
  PRESERVED_CONFIG_DOCS,
  TARGET_FINANCIAL_COLLECTIONS,
  computePreviewSignature,
  stripTestPaymentFieldsFromBillingObject,
  stripTestPaymentFieldsFromProgrammeEnrollment,
  summarizeCollectionDocs,
  validateResetEnvironmentGuard,
  validateResetExecutionRequest,
  type CollectionInventorySummary,
  type FinancialResetInventory,
} from '../../api/_lib/financial-reset-core';
import { SUPER_ADMIN_EMAILS, resolveCanonicalAdminScope } from '../utils/adminRbac';

function asStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normaliseRole(raw?: unknown): string {
  const r = String(raw || '').trim().toLowerCase();
  if (['super_admin', 'superadmin'].includes(r)) return 'superadmin';
  if (resolveCanonicalAdminScope(r) !== null) return 'admin';
  if (['school', 'school_admin', 'partner_school', 'institution'].includes(r)) return 'school';
  if (['parent', 'guardian'].includes(r)) return 'parent';
  if (['staff', 'tutor', 'instructor', 'teacher'].includes(r)) return 'staff';
  return 'student';
}

function mapLegacyStatus(
  rawStatus: unknown,
  isExempt: boolean
): BillingSubscriptionRecord['status'] {
  if (isExempt) return 'EXEMPT';
  const s = String(rawStatus || '').trim().toUpperCase();
  if (['LOCKED', 'OVERDUE', 'SUSPENDED'].includes(s)) return s as BillingSubscriptionRecord['status'];
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'GRACE_PERIOD') return 'GRACE_PERIOD';
  if (s === 'DUE_SOON') return 'DUE_SOON';
  if (['PARTIAL', 'PARTIALLY_PAID'].includes(s)) return 'PARTIALLY_PAID';
  if (['PENDING', 'UNPAID', 'APPROVED_AWAITING_PAYMENT'].includes(s)) return 'DUE_SOON';
  return 'ACTIVE';
}

function isPartialStatus(status: unknown): boolean {
  const s = String(status || '').trim().toUpperCase();
  return s === 'PARTIAL' || s === 'PARTIALLY_PAID';
}

function isPaidStatus(status: unknown): boolean {
  const s = String(status || '').trim().toUpperCase();
  return ['SUCCESS', 'SUCCESSFUL', 'PAID', 'COMPLETED', 'APPROVED', 'CONFIRMED', 'VERIFIED'].includes(s);
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
      asStr(canonical?.status || legacy?.status).toUpperCase() === 'EXEMPT'
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
    accountName: asStr(canonical?.accountName || params.accountName) || null,
    recipientEmail: asStr(canonical?.recipientEmail || params.recipientEmail) || null,
    billingResponsibility: isExempt ? 'EXEMPT' : canonical?.billingResponsibility || params.billingResponsibility,
    status,
    planId: canonical?.planId ?? legacy?.planId ?? null,
    planName: asStr(canonical?.planName || legacy?.planName || params.fallbackPlanName) || null,
    programmeId: canonical?.programmeId ?? legacy?.programmeId ?? null,
    programmeName: asStr(canonical?.programmeName || legacy?.programmeName || params.fallbackPlanName) || null,
    amount: Number.isFinite(amount) ? amount : 0,
    amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
    remainingBalance: Number.isFinite(remainingBalance) ? remainingBalance : 0,
    allowDepositAccess: Boolean(canonical?.allowDepositAccess ?? legacy?.allowDepositAccess),
    depositAmount: Number(canonical?.depositAmount ?? legacy?.depositAmount ?? 0) || 0,
    currency: canonical?.currency || 'NGN',
    billingCycle: canonical?.billingCycle || legacy?.cycle || (durationWeeks >= 12 ? 'termly' : 'monthly'),
    durationWeeks,
    currentPeriodStartAt: currentPeriodStart ? currentPeriodStart.toISOString() : null,
    currentPeriodEndAt: currentPeriodEnd ? currentPeriodEnd.toISOString() : null,
    nextDueAt: nextDue ? nextDue.toISOString() : null,
    gracePeriodDays,
    graceEndsAt: graceEnds ? graceEnds.toISOString() : null,
    lastSuccessfulPaymentAt: canonical?.lastSuccessfulPaymentAt ?? legacy?.lastPaidAt ?? null,
    lastPaymentReference: canonical?.lastPaymentReference ?? legacy?.lastPaymentReference ?? null,
    lastReminderSentAt: canonical?.lastReminderSentAt ?? legacy?.lastReminderSentAt ?? null,
    lockdownActivatedAt: canonical?.lockdownActivatedAt ?? null,
    override: canonical?.override ?? null,
    exemption: canonical?.exemption ?? (isExempt ? { exempt: true, reason: 'Exempt account' } : null),
    isComplimentary: Boolean(canonical?.isComplimentary ?? legacy?.isComplimentary),
    manuallyLocked: Boolean(canonical?.manuallyLocked),
    manualLockReason: canonical?.manualLockReason ?? null,
    manualLockedByUid: canonical?.manualLockedByUid ?? null,
    manualLockedByName: canonical?.manualLockedByName ?? null,
    manualLockedAt: canonical?.manualLockedAt ?? null,
    manuallyUnlocked: Boolean(canonical?.manuallyUnlocked),
    manualUnlockReason: canonical?.manualUnlockReason ?? null,
    manualUnlockedByUid: canonical?.manualUnlockedByUid ?? null,
    manualUnlockedByName: canonical?.manualUnlockedByName ?? null,
    manualUnlockedAt: canonical?.manualUnlockedAt ?? null,
    updatedAt: canonical?.updatedAt ?? legacy?.updatedAt ?? null,
  };
}

function buildCanonicalSubPayload(input: {
  id: string;
  accountType: BillingSubscriptionRecord['accountType'];
  accountId: string;
  accountName?: string | null;
  recipientEmail?: string | null;
  schoolId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  programmeEnrollmentId?: string | null;
  billingResponsibility: BillingResponsibility;
  status: BillingSubscriptionRecord['status'];
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
    currency: input.currency || 'NGN',
    billingCycle: input.billingCycle || (input.durationWeeks >= 12 ? 'termly' : 'monthly'),
    durationWeeks: input.durationWeeks,
    currentPeriodStartAt: parseDateSafe(input.currentPeriodStartAt)?.toISOString() ?? null,
    currentPeriodEndAt: parseDateSafe(input.currentPeriodEndAt)?.toISOString() ?? null,
    nextDueAt: nextDue ? nextDue.toISOString() : null,
    gracePeriodDays: graceDays,
    graceEndsAt: graceEnds ? graceEnds.toISOString() : null,
    lastSuccessfulPaymentAt: parseDateSafe(input.lastSuccessfulPaymentAt)?.toISOString() ?? null,
    lastPaymentReference: input.lastPaymentReference ?? null,
    updatedAt: now.toISOString(),
  };
}

async function resolveCurrentAdminActor(): Promise<{
  uid: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const email = String(user.email || '').toLowerCase();
  const uSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
  const uData = uSnap && uSnap.exists() ? uSnap.data() : {};
  const role = normaliseRole(uData?.role || sessionStorage.getItem('userRole'));
  const isSuperAdmin =
    SUPER_ADMIN_EMAILS.has(email) ||
    role === 'superadmin' ||
    String(uData?.role || '').toUpperCase() === 'SUPER_ADMIN';
  if (!isSuperAdmin && role !== 'admin') {
    throw new Error('Administrator privileges are required.');
  }
  const name = String(uData?.fullName || uData?.name || user.displayName || email || 'Administrator');
  return { uid: user.uid, email, name, isSuperAdmin };
}

function buildSubscriptionIdForTarget(target: BulkLockTargetInput): string {
  if (target.subscriptionId) return target.subscriptionId;
  if (target.accountType === 'SCHOOL') return `school_${target.schoolId || target.accountId}`;
  if (target.accountType === 'SCHOOL_ADMIN') return `school_admin_${target.accountId}`;
  if (target.accountType === 'PARENT') return `parent_${target.parentId || target.accountId}`;
  if (target.accountType === 'PARENT_CHILD') {
    return target.parentId && target.studentId
      ? `parent_${target.parentId}_child_${target.studentId}`
      : `parent_${target.accountId}`;
  }
  if (target.accountType === 'STUDENT_SELF_FUNDED_PROGRAMME') {
    return `prog_enr_${target.programmeEnrollmentId || target.accountId}`;
  }
  return `student_${target.accountId}`;
}

async function resolveLinkedStudentsForTarget(
  target: BulkLockTargetInput,
  cascades: boolean
): Promise<{ ids: string[]; names: string[]; email: string | null; programmeIds: string[]; programmeNames: string[] }> {
  const ids = new Set<string>();
  const names: string[] = [];
  let email: string | null = null;
  const programmeIds = new Set<string>();
  const programmeNames = new Set<string>();

  if (target.accountType === 'SCHOOL' || target.accountType === 'SCHOOL_ADMIN') {
    const schoolId = target.schoolId || target.accountId;
    if (schoolId) {
      const sSnap = await getDoc(doc(db, 'schools', schoolId)).catch(() => null);
      if (sSnap && sSnap.exists()) {
        email = asStr(sSnap.data()?.contactEmail || sSnap.data()?.email) || null;
      }
      if (cascades) {
        const [stSnap, indSnap] = await Promise.all([
          getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId), limit(300))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'individualStudents'), where('schoolId', '==', schoolId), limit(300))).catch(() => ({ docs: [] } as any)),
        ]);
        for (const d of [...stSnap.docs, ...indSnap.docs]) {
          const data = d.data() || {};
          if (!ids.has(d.id)) {
            ids.add(d.id);
            const nm = asStr(data.fullName || data.studentName || data.name);
            if (nm && names.length < 8) names.push(nm);
          }
        }
      }
    }
  } else if (target.accountType === 'PARENT') {
    const parentId = target.parentId || target.accountId;
    const pSnap = await getDoc(doc(db, 'users', parentId)).catch(() => null);
    if (pSnap && pSnap.exists()) {
      email = asStr(pSnap.data()?.email) || null;
    }
    if (cascades && parentId) {
      const [stSnap, indSnap] = await Promise.all([
        getDocs(query(collection(db, 'students'), where('parentId', '==', parentId), limit(100))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', parentId), limit(100))).catch(() => ({ docs: [] } as any)),
      ]);
      for (const d of [...stSnap.docs, ...indSnap.docs]) {
        const data = d.data() || {};
        if (!ids.has(d.id)) {
          ids.add(d.id);
          const nm = asStr(data.fullName || data.studentName || data.name);
          if (nm && names.length < 8) names.push(nm);
        }
      }
    }
  } else if (target.accountType === 'STUDENT_SELF_FUNDED_PROGRAMME' && target.programmeEnrollmentId) {
    const eSnap = await getDoc(doc(db, 'programme_enrollments', target.programmeEnrollmentId)).catch(() => null);
    if (eSnap && eSnap.exists()) {
      const ed = eSnap.data() || {};
      email = asStr(ed.studentEmail) || null;
      if (ed.studentDocId || ed.studentUid) ids.add(String(ed.studentDocId || ed.studentUid));
      if (ed.studentName) names.push(String(ed.studentName));
      if (ed.programId) programmeIds.add(String(ed.programId));
      if (ed.programTitle) programmeNames.add(String(ed.programTitle));
    }
  } else {
    const uid = target.studentId || target.accountId;
    if (uid) {
      ids.add(uid);
      const uSnap = await getDoc(doc(db, 'users', uid)).catch(() => null);
      if (uSnap && uSnap.exists()) {
        email = asStr(uSnap.data()?.email) || null;
      }
    }
  }

  return {
    ids: Array.from(ids),
    names,
    email,
    programmeIds: Array.from(programmeIds),
    programmeNames: Array.from(programmeNames),
  };
}

async function resolvePaymentRestrictionsOnClientSuccess(params: {
  targetAccountIds: string[];
  subscriptionIds: string[];
  programmeEnrollmentId?: string | null;
  paymentReference: string;
  resolvedByUid: string;
}): Promise<void> {
  const snap = await getDocs(query(collection(db, 'accountRestrictions'), limit(300))).catch(() => ({ docs: [] } as any));
  const nowIso = new Date().toISOString();
  const idSet = new Set(params.targetAccountIds.filter(Boolean));
  const subSet = new Set(params.subscriptionIds.filter(Boolean));

  for (const d of snap.docs) {
    const r = d.data() as AccountRestrictionRecord;
    if (r.status !== 'ACTIVE' && r.status !== 'SCHEDULED') continue;
    if (!isPaymentRestrictionRecord(r)) continue;
    const matches =
      (r.relatedSubscriptionId && subSet.has(r.relatedSubscriptionId)) ||
      (r.targetAccountId && idSet.has(r.targetAccountId)) ||
      (params.programmeEnrollmentId && r.programmeEnrollmentId === params.programmeEnrollmentId);
    if (!matches) continue;
    await setDoc(
      doc(db, 'accountRestrictions', d.id),
      {
        status: 'RESOLVED_BY_PAYMENT',
        liftedByUid: params.resolvedByUid,
        liftedByName: 'Payment Verified',
        liftedAt: nowIso,
        relatedPaymentReference: params.paymentReference,
        unlockReason: `Payment verified (${params.paymentReference})`,
      },
      { merge: true }
    ).catch(() => undefined);
  }
}

export async function handleBillingAdminFirestoreFallback<T>(
  action: string,
  body: Record<string, unknown>
): Promise<T | null> {
  const actor = await resolveCurrentAdminActor();

  // 1. LIST SUBSCRIPTIONS & GUARDRAILS
  if (action === 'list_subscriptions') {
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
      getDocs(query(collection(db, 'billingSubscriptions'), limit(500))).catch(() => ({ docs: [] } as any)),
      getDocs(query(collection(db, 'schools'), limit(300))).catch(() => ({ docs: [] } as any)),
      getDocs(query(collection(db, 'users'), limit(500))).catch(() => ({ docs: [] } as any)),
      getDocs(
        query(
          collection(db, 'programme_enrollments'),
          where('billingResponsibility', '==', 'STUDENT_SELF_FUNDED'),
          limit(300)
        )
      ).catch(() => ({ docs: [] } as any)),
      getDocs(query(collection(db, 'subscriptionReminders'), limit(150))).catch(() => ({ docs: [] } as any)),
      getDocs(query(collection(db, 'adminAuditLogs'), limit(150))).catch(() => ({ docs: [] } as any)),
      getDocs(query(collection(db, 'accountRestrictions'), limit(300))).catch(() => ({ docs: [] } as any)),
      getDocs(query(collection(db, 'restrictionAuditLogs'), limit(200))).catch(() => ({ docs: [] } as any)),
    ]);

    const allRestrictions: AccountRestrictionRecord[] = (restrictionsSnap.docs || [])
      .map((d: any) => ({ restrictionId: d.id, ...(d.data() || {}) }) as AccountRestrictionRecord)
      .sort((a: AccountRestrictionRecord, b: AccountRestrictionRecord) =>
        String(b.appliedAt || '').localeCompare(String(a.appliedAt || ''))
      );

    const activeRestrictionsBySubOrAccount = (sub: BillingSubscriptionRecord): AccountRestrictionRecord[] =>
      allRestrictions.filter((r) => {
        if (!isRestrictionActiveAt(r, now)) return false;
        if (r.relatedSubscriptionId && r.relatedSubscriptionId === sub.id) return true;
        if (r.targetAccountId && r.targetAccountId === sub.accountId && r.targetAccountType === sub.accountType) {
          return true;
        }
        if (sub.programmeEnrollmentId && r.programmeEnrollmentId === sub.programmeEnrollmentId) return true;
        return false;
      });

    const byId = new Map<string, any>();

    const pushEntry = (sub: BillingSubscriptionRecord, source: 'canonical' | 'synthesized') => {
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
      const sub = normalizeSubscriptionFromClientSource({
        id: docSnap.id,
        accountType: String(d.accountType || 'INDIVIDUAL_STUDENT').toUpperCase() as BillingSubscriptionRecord['accountType'],
        accountId: String(d.accountId || docSnap.id),
        accountName: String(d.accountName || ''),
        recipientEmail: String(d.recipientEmail || ''),
        schoolId: d.schoolId || null,
        parentId: d.parentId || null,
        studentId: d.studentId || null,
        studentName: d.studentName || null,
        programmeEnrollmentId: d.programmeEnrollmentId || null,
        billingResponsibility: d.billingResponsibility || 'STUDENT',
        canonicalDoc: d,
      });
      pushEntry(sub, 'canonical');
    }

    for (const sDoc of schoolsSnap.docs) {
      const subId = `school_${sDoc.id}`;
      if (byId.has(subId)) continue;
      const s = sDoc.data() || {};
      const sub = normalizeSubscriptionFromClientSource({
        id: subId,
        accountType: 'SCHOOL',
        accountId: sDoc.id,
        accountName: String(s.schoolName || s.name || 'Partner School'),
        recipientEmail: String(s.contactEmail || s.email || ''),
        schoolId: sDoc.id,
        billingResponsibility: 'SCHOOL',
        legacyBilling: s.billing || null,
        fallbackPlanName: String(s.plan || 'School Institutional Partnership'),
      });
      pushEntry(sub, 'synthesized');
    }

    for (const uDoc of usersSnap.docs) {
      const u = uDoc.data() || {};
      const r = normaliseRole(u.role);
      if (r === 'school') {
        const adminSubId = `school_admin_${uDoc.id}`;
        if (!byId.has(adminSubId)) {
          const sub = normalizeSubscriptionFromClientSource({
            id: adminSubId,
            accountType: 'SCHOOL_ADMIN',
            accountId: uDoc.id,
            accountName: String(u.fullName || u.name || u.email || 'School Administrator'),
            recipientEmail: String(u.email || ''),
            schoolId: u.schoolId || null,
            billingResponsibility: 'SCHOOL',
            legacyBilling: null,
            fallbackPlanName: String(u.schoolName || 'School Administrator Account'),
          });
          pushEntry(sub, 'synthesized');
        }
        continue;
      }
      if (!['parent', 'student'].includes(r)) continue;
      if (r === 'student' && (u.schoolId || u.parentId)) continue;
      const subId = r === 'parent' ? `parent_${uDoc.id}` : `student_${uDoc.id}`;
      if (byId.has(subId)) continue;
      const sub = normalizeSubscriptionFromClientSource({
        id: subId,
        accountType: r === 'parent' ? 'PARENT' : 'INDIVIDUAL_STUDENT',
        accountId: uDoc.id,
        accountName: String(u.fullName || u.name || u.email || 'Account'),
        recipientEmail: String(u.email || ''),
        parentId: r === 'parent' ? uDoc.id : null,
        studentId: r === 'student' ? String(u.studentDocId || uDoc.id) : null,
        studentName: r === 'student' ? String(u.fullName || u.name || '') : null,
        billingResponsibility: r === 'parent' ? 'PARENT' : 'STUDENT',
        legacyBilling: u.billing || null,
        fallbackPlanName: r === 'parent' ? 'Family Plan' : 'Student Plan',
      });
      pushEntry(sub, 'synthesized');
    }

    for (const eDoc of enrollSnap.docs) {
      const subId = `prog_enr_${eDoc.id}`;
      if (byId.has(subId)) continue;
      const e = eDoc.data() || {};
      if (['REJECTED', 'CANCELLED'].includes(String(e.enrollmentStatus || '').toUpperCase())) continue;
      const sub = normalizeSubscriptionFromClientSource({
        id: subId,
        accountType: 'STUDENT_SELF_FUNDED_PROGRAMME',
        accountId: String(e.studentUid || eDoc.id),
        accountName: String(e.studentName || 'Student'),
        recipientEmail: String(e.studentEmail || ''),
        studentId: String(e.studentDocId || e.studentUid || ''),
        studentName: String(e.studentName || ''),
        programmeEnrollmentId: eDoc.id,
        billingResponsibility: 'STUDENT_SELF_FUNDED',
        legacyBilling: {
          baseAmount: Number(e.approvedFee || 0),
          amountPaid: Number(e.amountPaid || 0),
          remainingBalance: Number(e.remainingBalance ?? e.approvedFee ?? 0),
          status: e.paymentStatus || e.enrollmentStatus,
          nextDueDate: e.nextDueDate || e.paidThrough,
          paidThrough: e.paidThrough,
          durationWeeks: Number(e.durationWeeks || 8),
          planName: String(e.programTitle || 'Programme'),
          allowDepositAccess: Boolean(e.allowDepositAccess),
          depositAmount: Number(e.depositAmount || 0),
        },
        fallbackPlanName: String(e.programTitle || 'Programme'),
      });
      pushEntry(sub, 'synthesized');
    }

    const subscriptions = Array.from(byId.values()).sort((a, b) => {
      const weight = (s: any) =>
        s.isLocked ? 0 : s.inGracePeriod ? 1 : s.isDueSoon ? 2 : s.liveStatus === 'PARTIALLY_PAID' ? 3 : 4;
      return weight(a) - weight(b);
    });

    const summary = {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.liveStatus === 'ACTIVE').length,
      dueSoon: subscriptions.filter((s) => s.isDueSoon).length,
      inGracePeriod: subscriptions.filter((s) => s.inGracePeriod).length,
      locked: subscriptions.filter((s) => s.isLocked).length,
      manuallyRestricted: subscriptions.filter((s) => s.isManuallyLocked).length,
      exempt: subscriptions.filter((s) => s.isExempt).length,
      partiallyPaid: subscriptions.filter((s) => s.liveStatus === 'PARTIALLY_PAID').length,
      totalOverdueBalance: Number(
        subscriptions
          .filter((s) => s.isLocked || s.inGracePeriod || s.liveStatus === 'PARTIALLY_PAID')
          .reduce((sum, s) => sum + Number(s.liveAmountDue || 0), 0)
          .toFixed(2)
      ),
    };

    const reminders = remindersSnap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a: any, b: any) => String(b.lastAttemptAt || b.sentAt || '').localeCompare(String(a.lastAttemptAt || a.sentAt || '')))
      .slice(0, 60);

    const auditLogs = auditSnap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 80);

    const restrictionAuditLogs = (restrictionAuditSnap.docs || [])
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 100);

    return {
      summary,
      subscriptions,
      reminders,
      auditLogs,
      restrictions: allRestrictions.slice(0, 200),
      restrictionAuditLogs,
      isSuperAdmin: actor.isSuperAdmin,
    } as unknown as T;
  }

  // 2. RECORD MANUAL / OFFLINE PAYMENT
  if (action === 'record_manual_payment' || action === 'record_offline_payment') {
    const rawTarget = asStr(body.targetType || 'SCHOOL').toUpperCase();
    const targetType: ManualPaymentTargetType =
      rawTarget === 'STUDENT'
        ? 'INDIVIDUAL_STUDENT'
        : (['SCHOOL', 'PARENT', 'INDIVIDUAL_STUDENT', 'PROGRAMME_ENROLLMENT'].includes(rawTarget)
            ? rawTarget
            : 'SCHOOL') as ManualPaymentTargetType;
    const targetId = asStr(
      body.targetId || body.schoolId || body.parentId || body.studentId || body.programmeEnrollmentId
    );
    const payAmount = Number(String(body.amount ?? 0).replace(/[^0-9.]/g, ''));
    const rawRef = asStr(body.reference);
    const reference = rawRef || `MAN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const paymentMethod = asStr(body.paymentMethod || 'bank_transfer');
    const paymentDateIso = body.paymentDate ? new Date(String(body.paymentDate)).toISOString() : new Date().toISOString();
    const notes = asStr(body.notes);
    const proofUrl = body.proofUrl ? asStr(body.proofUrl) : null;
    const childId = asStr(body.childId || body.studentId);

    if (!targetId) throw new Error('Target account ID is required.');
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      throw new Error('Enter a valid manual payment amount greater than 0.');
    }
    if (proofUrl && !/^https?:\/\//i.test(proofUrl)) {
      throw new Error('Optional payment proof URL must start with http:// or https://.');
    }

    const paymentRef = doc(db, 'payments', reference);
    const existingPay = await getDoc(paymentRef);
    if (existingPay.exists()) {
      throw new Error('A transaction with this reference already exists. Existing transactions cannot be overwritten.');
    }

    const nowIso = new Date().toISOString();
    let resultSummary: Record<string, any> = {};
    let notifyUid = '';
    let notifyBody = '';

    if (targetType === 'SCHOOL') {
      const schoolRef = doc(db, 'schools', targetId);
      const subId = `school_${targetId}`;
      const subRef = doc(db, 'billingSubscriptions', subId);
      const [schoolSnap, subSnap] = await Promise.all([getDoc(schoolRef), getDoc(subRef)]);
      if (!schoolSnap.exists()) throw new Error('Partner school record was not found.');
      const sData = schoolSnap.data() || {};
      const existingBilling = sData.billing || {};
      const existingSub = subSnap.exists() ? subSnap.data() : null;
      const contractAmount = Number(body.contractAmount || existingSub?.amount || existingBilling.baseAmount || payAmount);
      const wasPartial = isPartialStatus(existingSub?.status) || isPartialStatus(existingBilling.status);
      const priorPaid = wasPartial ? Number(existingSub?.amountPaid ?? existingBilling.amountPaid ?? 0) : 0;
      const durationWeeks = resolvePlanDurationWeeks({
        durationWeeks: body.durationWeeks || existingSub?.durationWeeks || existingBilling.durationWeeks,
        cycle: body.cycle || existingSub?.billingCycle || existingBilling.cycle || 'termly',
        fallbackWeeks: 12,
      });
      const schoolName = String(sData.schoolName || sData.name || body.schoolName || 'Partner School');
      const schoolEmail = String(sData.contactEmail || sData.email || body.payerEmail || body.email || '');

      const computed = computeManualPaymentRecordAndTransition({
        targetType: 'SCHOOL',
        targetId,
        accountName: schoolName,
        recipientEmail: schoolEmail,
        schoolId: targetId,
        subscriptionId: subId,
        billingResponsibility: 'SCHOOL',
        accountType: 'SCHOOL',
        planId: String(existingSub?.planId || existingBilling.planId || 'school_subscription'),
        planName: String(body.planName || existingSub?.planName || existingBilling.planName || 'School Institutional Subscription'),
        amount: payAmount,
        contractAmount,
        priorAmountPaid: priorPaid,
        paymentMethod,
        paymentDate: paymentDateIso,
        reference,
        notes,
        proofUrl,
        cycle: String(body.cycle || existingBilling.cycle || (durationWeeks >= 12 ? 'termly' : 'monthly')),
        durationWeeks,
        existingPeriodEndAt: existingSub?.currentPeriodEndAt || existingSub?.nextDueAt || existingBilling.nextDueDate || existingBilling.paidThrough,
        existingGraceEndsAt: existingSub?.graceEndsAt || null,
        verifiedByUid: actor.uid,
        verifiedByName: actor.name,
        verifiedByEmail: actor.email,
      });

      await setDoc(paymentRef, { ...computed.paymentRecord, createdAt: serverTimestamp() });
      await setDoc(
        subRef,
        buildCanonicalSubPayload({
          id: subId,
          accountType: 'SCHOOL',
          accountId: targetId,
          accountName: schoolName,
          recipientEmail: schoolEmail || null,
          schoolId: targetId,
          billingResponsibility: 'SCHOOL',
          status: computed.subscriptionPatch.status,
          planId: String(existingSub?.planId || existingBilling.planId || 'school_subscription'),
          planName: String(body.planName || existingSub?.planName || existingBilling.planName || 'School Institutional Subscription'),
          amount: computed.subscriptionPatch.amount,
          amountPaid: computed.subscriptionPatch.amountPaid,
          remainingBalance: computed.subscriptionPatch.remainingBalance,
          currency: 'NGN',
          billingCycle: durationWeeks >= 12 ? 'termly' : 'monthly',
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
      await setDoc(
        schoolRef,
        {
          billing: {
            ...existingBilling,
            baseAmount: computed.subscriptionPatch.amount,
            amountPaid: computed.subscriptionPatch.amountPaid,
            remainingBalance: computed.subscriptionPatch.remainingBalance,
            status: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
            cycle: durationWeeks >= 12 ? 'termly' : 'monthly',
            durationWeeks,
            lastPaidAt: paymentDateIso,
            lastPaymentReference: reference,
            paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
            nextDueDate: computed.subscriptionPatch.nextDueAt,
            updatedAt: nowIso,
            updatedBy: actor.uid,
          },
          paymentStatus: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      notifyUid = String(sData.adminUid || sData.userId || targetId);
      notifyBody = `A manual payment of ₦${payAmount.toLocaleString()} (ref: ${reference}) for ${schoolName} has been verified.${computed.isPartial ? ` Remaining balance: ₦${computed.remainingBalance.toLocaleString()}.` : ` Paid through ${formatLagosDate(computed.subscriptionPatch.nextDueAt) || 'next cycle'}.`}`;
      resultSummary = {
        reference,
        subscriptionId: subId,
        status: computed.subscriptionPatch.status,
        accessUnlocked: computed.accessUnlocked,
        remainingBalance: computed.remainingBalance,
        nextDueAt: computed.subscriptionPatch.nextDueAt,
      };
    } else if (targetType === 'PROGRAMME_ENROLLMENT') {
      const enrollRef = doc(db, 'programme_enrollments', targetId);
      const subId = `prog_enr_${targetId}`;
      const subRef = doc(db, 'billingSubscriptions', subId);
      const [enrollSnap, subSnap] = await Promise.all([getDoc(enrollRef), getDoc(subRef)]);
      if (!enrollSnap.exists()) throw new Error('Programme enrolment record was not found.');
      const eData = enrollSnap.data() || {};
      const existingSub = subSnap.exists() ? subSnap.data() : null;
      const studentUid = String(eData.studentUid || '');
      const studentDocId = String(eData.studentDocId || studentUid);
      const studentName = String(eData.studentName || 'Student');
      const programId = String(eData.programId || '');
      const programTitle = String(eData.programTitle || 'Programme');
      const contractAmount = Number(body.contractAmount || eData.approvedFee || existingSub?.amount || payAmount);
      const priorPaid = Number(eData.amountPaid || existingSub?.amountPaid || 0);
      const durationWeeks = resolvePlanDurationWeeks({
        durationWeeks: body.durationWeeks || eData.durationWeeks || existingSub?.durationWeeks,
        cycle: eData.billingCycle,
        fallbackWeeks: 8,
      });

      const computed = computeManualPaymentRecordAndTransition({
        targetType: 'PROGRAMME_ENROLLMENT',
        targetId: studentUid || targetId,
        accountName: studentName,
        recipientEmail: String(eData.studentEmail || body.email || ''),
        studentId: studentDocId,
        studentName,
        programmeEnrollmentId: targetId,
        programmeId: programId || null,
        programmeName: programTitle,
        subscriptionId: subId,
        billingResponsibility: 'STUDENT_SELF_FUNDED',
        accountType: 'STUDENT_SELF_FUNDED_PROGRAMME',
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
        cycle: eData.billingCycle || (durationWeeks >= 12 ? 'termly' : 'monthly'),
        durationWeeks,
        existingPeriodEndAt: existingSub?.currentPeriodEndAt || eData.paidThrough || eData.nextDueDate,
        existingGraceEndsAt: existingSub?.graceEndsAt || null,
        verifiedByUid: actor.uid,
        verifiedByName: actor.name,
        verifiedByEmail: actor.email,
      });

      await setDoc(paymentRef, { ...computed.paymentRecord, createdAt: serverTimestamp() });
      await setDoc(
        enrollRef,
        {
          amountPaid: computed.cumulativePaid,
          remainingBalance: computed.remainingBalance,
          paymentStatus: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
          enrollmentStatus: computed.accessUnlocked ? 'ACTIVE' : 'APPROVED_AWAITING_PAYMENT',
          paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
          nextDueDate: computed.subscriptionPatch.nextDueAt,
          lastPaymentReference: reference,
          lastPaidAt: paymentDateIso,
          paymentHistory: arrayUnion({
            reference,
            amount: payAmount,
            paymentSource: 'MANUAL_ADMIN',
            verificationStatus: 'ADMIN_VERIFIED',
            verifiedBy: actor.uid,
            paidAt: paymentDateIso,
            channel: paymentMethod,
            status: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
          }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await setDoc(
        subRef,
        buildCanonicalSubPayload({
          id: subId,
          accountType: 'STUDENT_SELF_FUNDED_PROGRAMME',
          accountId: studentUid || targetId,
          accountName: studentName,
          recipientEmail: String(eData.studentEmail || '') || null,
          studentId: studentDocId,
          studentName,
          programmeEnrollmentId: targetId,
          billingResponsibility: 'STUDENT_SELF_FUNDED',
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
          currency: 'NGN',
          billingCycle: String(eData.billingCycle || (durationWeeks >= 12 ? 'termly' : 'monthly')),
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
          selectedProgramIds: arrayUnion(programId),
          assignedProgramIds: arrayUnion(programId),
          selfFundedProgramIds: arrayUnion(programId),
          enrolledPrograms: arrayUnion(programTitle),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', studentUid), activationFields, { merge: true }).catch(() => undefined);
        if (studentDocId) {
          await setDoc(doc(db, 'individualStudents', studentDocId), activationFields, { merge: true }).catch(() => undefined);
          await setDoc(doc(db, 'students', studentDocId), activationFields, { merge: true }).catch(() => undefined);
        }
      }

      notifyUid = studentUid;
      notifyBody = `Your manual payment of ₦${payAmount.toLocaleString()} for ${programTitle} (ref: ${reference}) has been verified.`;
      resultSummary = {
        reference,
        subscriptionId: subId,
        status: computed.subscriptionPatch.status,
        accessUnlocked: computed.accessUnlocked,
        remainingBalance: computed.remainingBalance,
        nextDueAt: computed.subscriptionPatch.nextDueAt,
      };
    } else if (targetType === 'PARENT') {
      const parentRef = doc(db, 'users', targetId);
      const effectiveSubId = childId ? `parent_${targetId}_child_${childId}` : `parent_${targetId}`;
      const subRef = doc(db, 'billingSubscriptions', effectiveSubId);
      const [parentSnap, subSnap, indSnap, stdSnap] = await Promise.all([
        getDoc(parentRef).catch(() => null),
        getDoc(subRef).catch(() => null),
        childId ? getDoc(doc(db, 'individualStudents', childId)).catch(() => null) : Promise.resolve(null),
        childId ? getDoc(doc(db, 'students', childId)).catch(() => null) : Promise.resolve(null),
      ]);
      const parentData = parentSnap?.exists() ? parentSnap.data() : {};
      const existingSub = subSnap?.exists() ? subSnap.data() : null;
      const childData = indSnap?.exists() ? indSnap.data() : stdSnap?.exists() ? stdSnap.data() : null;

      const childName = String(body.childName || childData?.fullName || childData?.name || existingSub?.studentName || '').trim();
      const parentName = String(parentData.fullName || parentData.name || body.accountName || 'Parent');
      const parentEmail = String(parentData.email || body.email || '');
      const planName = String(body.planName || childData?.programName || childData?.plan || existingSub?.planName || 'Family Programme Tuition');
      const contractAmount = Number(
        body.contractAmount || existingSub?.amount || childData?.tuitionFee || childData?.fee || parentData.billing?.baseAmount || payAmount
      );
      const wasPartial = isPartialStatus(existingSub?.status) || isPartialStatus(childData?.paymentStatus || parentData.billing?.status);
      const priorPaid = wasPartial ? Number(existingSub?.amountPaid ?? childData?.amountPaid ?? parentData.billing?.amountPaid ?? 0) : 0;
      const durationWeeks = resolvePlanDurationWeeks({
        durationWeeks: body.durationWeeks || existingSub?.durationWeeks || childData?.durationWeeks || parentData.billing?.durationWeeks,
        cycle: body.cycle || existingSub?.billingCycle || parentData.billing?.cycle || 'monthly',
        fallbackWeeks: 4,
      });

      const computed = computeManualPaymentRecordAndTransition({
        targetType: 'PARENT',
        targetId,
        accountName: childName || parentName,
        recipientEmail: parentEmail,
        parentId: targetId,
        studentId: childId || null,
        studentName: childName || null,
        programmeName: planName,
        planName,
        subscriptionId: effectiveSubId,
        billingResponsibility: 'PARENT',
        accountType: childId ? 'PARENT_CHILD' : 'PARENT',
        amount: payAmount,
        contractAmount,
        priorAmountPaid: priorPaid,
        paymentMethod,
        paymentDate: paymentDateIso,
        reference,
        notes,
        proofUrl,
        cycle: String(body.cycle || (durationWeeks >= 12 ? 'termly' : 'monthly')),
        durationWeeks,
        existingPeriodEndAt: existingSub?.currentPeriodEndAt || existingSub?.nextDueAt || childData?.nextDueDate || childData?.paidThrough || parentData.billing?.nextDueDate,
        existingGraceEndsAt: existingSub?.graceEndsAt || null,
        verifiedByUid: actor.uid,
        verifiedByName: actor.name,
        verifiedByEmail: actor.email,
      });

      await setDoc(paymentRef, { ...computed.paymentRecord, createdAt: serverTimestamp() });
      await setDoc(
        subRef,
        buildCanonicalSubPayload({
          id: effectiveSubId,
          accountType: childId ? 'PARENT_CHILD' : 'PARENT',
          accountId: childId || targetId,
          accountName: childName || parentName,
          recipientEmail: parentEmail || null,
          parentId: targetId,
          studentId: childId || null,
          studentName: childName || null,
          billingResponsibility: 'PARENT',
          status: computed.subscriptionPatch.status,
          planName,
          programmeName: planName,
          amount: computed.subscriptionPatch.amount,
          amountPaid: computed.subscriptionPatch.amountPaid,
          remainingBalance: computed.subscriptionPatch.remainingBalance,
          currency: 'NGN',
          billingCycle: durationWeeks >= 12 ? 'termly' : 'monthly',
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
          paymentStatus: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
          status: computed.accessUnlocked ? 'ACTIVE' : 'PARTIALLY_PAID',
          lastPaidAt: paymentDateIso,
          lastPaymentReference: reference,
          paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
          nextDueDate: computed.subscriptionPatch.nextDueAt,
          updatedAt: serverTimestamp(),
        };
        if (indSnap?.exists()) await setDoc(doc(db, 'individualStudents', childId), childPatch, { merge: true });
        if (stdSnap?.exists()) await setDoc(doc(db, 'students', childId), childPatch, { merge: true });
      } else {
        await setDoc(
          parentRef,
          {
            billing: {
              ...(parentData.billing || {}),
              baseAmount: computed.subscriptionPatch.amount,
              amountPaid: computed.subscriptionPatch.amountPaid,
              remainingBalance: computed.subscriptionPatch.remainingBalance,
              status: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
              lastPaidAt: paymentDateIso,
              lastPaymentReference: reference,
              paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueDate: computed.subscriptionPatch.nextDueAt,
              updatedAt: nowIso,
            },
          },
          { merge: true }
        );
      }

      notifyUid = targetId;
      notifyBody = `Manual payment of ₦${payAmount.toLocaleString()} for ${childName || 'your family account'} (ref: ${reference}) has been verified.`;
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
      const userRef = doc(db, 'users', targetId);
      const studentDocKey = childId || targetId;
      const indRef = doc(db, 'individualStudents', studentDocKey);
      const stdRef = doc(db, 'students', studentDocKey);
      const subId = `student_${targetId}`;
      const subRef = doc(db, 'billingSubscriptions', subId);

      const [uSnap, indSnap, stdSnap, subSnap] = await Promise.all([
        getDoc(userRef).catch(() => null),
        getDoc(indRef).catch(() => null),
        getDoc(stdRef).catch(() => null),
        getDoc(subRef).catch(() => null),
      ]);
      const uData = uSnap?.exists() ? uSnap.data() : {};
      const sData = indSnap?.exists() ? indSnap.data() : stdSnap?.exists() ? stdSnap.data() : {};
      const existingSub = subSnap?.exists() ? subSnap.data() : null;

      const studentName = String(body.studentName || uData.fullName || uData.name || sData.fullName || sData.name || body.accountName || 'Student');
      const studentEmail = String(body.email || uData.email || sData.email || '');
      const planName = String(body.planName || sData.programName || sData.plan || existingSub?.planName || 'Individual Student Subscription');
      const contractAmount = Number(
        body.contractAmount || existingSub?.amount || uData.billing?.baseAmount || sData.tuitionFee || sData.fee || payAmount
      );
      const wasPartial = isPartialStatus(existingSub?.status) || isPartialStatus(uData.billing?.status || sData.paymentStatus);
      const priorPaid = wasPartial ? Number(existingSub?.amountPaid ?? uData.billing?.amountPaid ?? sData.amountPaid ?? 0) : 0;
      const durationWeeks = resolvePlanDurationWeeks({
        durationWeeks: body.durationWeeks || existingSub?.durationWeeks || uData.billing?.durationWeeks || sData.durationWeeks,
        cycle: body.cycle || existingSub?.billingCycle || uData.billing?.cycle || 'monthly',
        fallbackWeeks: 4,
      });

      const computed = computeManualPaymentRecordAndTransition({
        targetType: 'INDIVIDUAL_STUDENT',
        targetId,
        accountName: studentName,
        recipientEmail: studentEmail,
        studentId: studentDocKey,
        studentName,
        planName,
        programmeName: planName,
        subscriptionId: subId,
        billingResponsibility: 'STUDENT',
        accountType: 'INDIVIDUAL_STUDENT',
        amount: payAmount,
        contractAmount,
        priorAmountPaid: priorPaid,
        paymentMethod,
        paymentDate: paymentDateIso,
        reference,
        notes,
        proofUrl,
        cycle: String(body.cycle || (durationWeeks >= 12 ? 'termly' : 'monthly')),
        durationWeeks,
        existingPeriodEndAt: existingSub?.currentPeriodEndAt || existingSub?.nextDueAt || uData.billing?.nextDueDate || sData.nextDueDate || sData.paidThrough,
        existingGraceEndsAt: existingSub?.graceEndsAt || null,
        verifiedByUid: actor.uid,
        verifiedByName: actor.name,
        verifiedByEmail: actor.email,
      });

      await setDoc(paymentRef, { ...computed.paymentRecord, createdAt: serverTimestamp() });
      await setDoc(
        subRef,
        buildCanonicalSubPayload({
          id: subId,
          accountType: 'INDIVIDUAL_STUDENT',
          accountId: targetId,
          accountName: studentName,
          recipientEmail: studentEmail || null,
          studentId: studentDocKey,
          studentName,
          billingResponsibility: 'STUDENT',
          status: computed.subscriptionPatch.status,
          planName,
          programmeName: planName,
          amount: computed.subscriptionPatch.amount,
          amountPaid: computed.subscriptionPatch.amountPaid,
          remainingBalance: computed.subscriptionPatch.remainingBalance,
          currency: 'NGN',
          billingCycle: durationWeeks >= 12 ? 'termly' : 'monthly',
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

      if (uSnap?.exists()) {
        await setDoc(
          userRef,
          {
            billing: {
              ...(uData.billing || {}),
              baseAmount: computed.subscriptionPatch.amount,
              amountPaid: computed.subscriptionPatch.amountPaid,
              remainingBalance: computed.subscriptionPatch.remainingBalance,
              status: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
              lastPaidAt: paymentDateIso,
              lastPaymentReference: reference,
              paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
              nextDueDate: computed.subscriptionPatch.nextDueAt,
              updatedAt: nowIso,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const studentDocPatch = {
        amountPaid: computed.subscriptionPatch.amountPaid,
        remainingBalance: computed.subscriptionPatch.remainingBalance,
        paymentStatus: computed.isPartial ? 'PARTIALLY_PAID' : 'PAID',
        status: computed.accessUnlocked ? 'ACTIVE' : 'PARTIALLY_PAID',
        lastPaidAt: paymentDateIso,
        lastPaymentReference: reference,
        paidThrough: computed.subscriptionPatch.currentPeriodEndAt,
        nextDueDate: computed.subscriptionPatch.nextDueAt,
        updatedAt: serverTimestamp(),
      };
      if (indSnap?.exists()) await setDoc(indRef, studentDocPatch, { merge: true });
      if (stdSnap?.exists()) await setDoc(stdRef, studentDocPatch, { merge: true });

      notifyUid = targetId;
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

    await addDoc(collection(db, 'adminAuditLogs'), {
      action: 'RECORD_MANUAL_PAYMENT',
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      targetType,
      targetId,
      reference,
      amount: payAmount,
      paymentMethod,
      notes,
      proofUrl,
      resultSummary,
      createdAt: nowIso,
    }).catch(() => undefined);

    if (resultSummary?.accessUnlocked) {
      await resolvePaymentRestrictionsOnClientSuccess({
        targetAccountIds: [targetId, childId].filter(Boolean),
        subscriptionIds: resultSummary?.subscriptionId ? [String(resultSummary.subscriptionId)] : [],
        programmeEnrollmentId: targetType === 'PROGRAMME_ENROLLMENT' ? targetId : null,
        paymentReference: reference,
        resolvedByUid: actor.uid,
      }).catch(() => undefined);
    }

    if (notifyUid) {
      await addDoc(collection(db, 'notifications'), {
        recipientId: notifyUid,
        title: 'Manual Payment Confirmed',
        message: notifyBody,
        type: 'MANUAL_PAYMENT_VERIFIED',
        read: false,
        readBy: [],
        createdAt: serverTimestamp(),
      }).catch(() => undefined);
    }

    return { recorded: true, ...resultSummary } as unknown as T;
  }

  // 3. APPLY / REVOKE SUBSCRIPTION OVERRIDE
  if (action === 'apply_subscription_override') {
    const subscriptionId = asStr(body.subscriptionId);
    const reason = asStr(body.reason);
    const active = body.active !== false;
    const startsAt = parseDateSafe(body.startsAt) || new Date();
    const expiresAt = parseDateSafe(body.expiresAt);
    if (!subscriptionId) throw new Error('subscriptionId is required.');
    if (active && (!reason || !expiresAt || expiresAt.getTime() <= startsAt.getTime())) {
      throw new Error('Temporary override requires a reason and a future expiry date.');
    }

    const nowIso = new Date().toISOString();
    const overridePayload = active
      ? {
          active: true,
          reason,
          grantedByUid: actor.uid,
          grantedByName: actor.name,
          grantedAt: nowIso,
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt!.toISOString(),
        }
      : null;

    await setDoc(
      doc(db, 'billingSubscriptions', subscriptionId),
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

    await addDoc(collection(db, 'adminAuditLogs'), {
      action: active ? 'SUBSCRIPTION_OVERRIDE_GRANTED' : 'SUBSCRIPTION_OVERRIDE_REVOKED',
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      targetType: 'SUBSCRIPTION',
      targetId: subscriptionId,
      reason: reason || 'Revoked override',
      startsAt: active ? startsAt.toISOString() : null,
      expiresAt: active && expiresAt ? expiresAt.toISOString() : null,
      createdAt: nowIso,
    }).catch(() => undefined);

    return { updated: true, subscriptionId, override: overridePayload } as unknown as T;
  }

  // 4. SET SUBSCRIPTION EXEMPTION
  if (action === 'set_subscription_exemption') {
    const subscriptionId = asStr(body.subscriptionId);
    const exempt = Boolean(body.exempt);
    const reason = asStr(body.reason);
    if (!subscriptionId) throw new Error('subscriptionId is required.');
    if (exempt && !reason) throw new Error('An exemption reason is required.');

    const nowIso = new Date().toISOString();
    const exemptionPayload = exempt
      ? {
          exempt: true,
          reason,
          grantedByUid: actor.uid,
          grantedByName: actor.name,
          grantedAt: nowIso,
        }
      : null;

    await setDoc(
      doc(db, 'billingSubscriptions', subscriptionId),
      {
        id: subscriptionId,
        ...(body.accountType ? { accountType: body.accountType } : {}),
        ...(body.accountId ? { accountId: body.accountId } : {}),
        ...(body.accountName ? { accountName: body.accountName } : {}),
        ...(body.billingResponsibility ? { billingResponsibility: body.billingResponsibility } : {}),
        exemption: exemptionPayload,
        status: exempt ? 'EXEMPT' : 'ACTIVE',
        updatedAt: nowIso,
      },
      { merge: true }
    );

    await addDoc(collection(db, 'adminAuditLogs'), {
      action: exempt ? 'SUBSCRIPTION_EXEMPTION_GRANTED' : 'SUBSCRIPTION_EXEMPTION_REMOVED',
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      targetType: 'SUBSCRIPTION',
      targetId: subscriptionId,
      reason: reason || 'Exemption removed',
      createdAt: nowIso,
    }).catch(() => undefined);

    return { updated: true, subscriptionId, exemption: exemptionPayload } as unknown as T;
  }

  // 5. UPDATE SUBSCRIPTION STATUS
  if (action === 'update_subscription_status') {
    const subscriptionId = asStr(body.subscriptionId);
    const nextStatus = asStr(body.status).toUpperCase();
    const reason = asStr(body.reason);
    if (!subscriptionId || !['ACTIVE', 'SUSPENDED', 'CANCELLED'].includes(nextStatus)) {
      throw new Error('Valid subscriptionId and status (ACTIVE, SUSPENDED, CANCELLED) are required.');
    }
    const nowIso = new Date().toISOString();

    await setDoc(
      doc(db, 'billingSubscriptions', subscriptionId),
      {
        id: subscriptionId,
        status: nextStatus,
        ...(body.nextDueAt ? { nextDueAt: new Date(String(body.nextDueAt)).toISOString() } : {}),
        updatedAt: nowIso,
      },
      { merge: true }
    );

    await addDoc(collection(db, 'adminAuditLogs'), {
      action: `SUBSCRIPTION_STATUS_${nextStatus}`,
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      targetType: 'SUBSCRIPTION',
      targetId: subscriptionId,
      reason: reason || `Status updated to ${nextStatus}`,
      createdAt: nowIso,
    }).catch(() => undefined);

    return { updated: true, subscriptionId, status: nextStatus } as unknown as T;
  }

  // 6. SET USER BILLING
  if (action === 'set_user_billing') {
    const targetUserId = asStr(body.userId || body.targetId);
    if (!targetUserId) throw new Error('User ID is required.');
    const baseAmount = Number(String(body.baseAmount ?? body.amount ?? 0).replace(/[^0-9.]/g, '')) || 0;
    const nowIso = new Date().toISOString();
    const billingPayload = {
      baseAmount,
      cycle: asStr(body.cycle || 'monthly').toLowerCase(),
      nextDueDate: asStr(body.nextDueDate),
      status: asStr(body.status || 'ACTIVE').toUpperCase(),
      notes: asStr(body.notes),
      updatedAt: nowIso,
    };
    await setDoc(doc(db, 'users', targetUserId), { billing: billingPayload, updatedAt: serverTimestamp() }, { merge: true });
    return { updated: true, billing: billingPayload } as unknown as T;
  }

  // 7. PREVIEW BULK LOCK
  if (action === 'preview_bulk_lock') {
    const targets = (Array.isArray(body.targets) ? body.targets : []) as BulkLockTargetInput[];
    const cascades = body.cascadesToLinkedLearners !== false;
    const validation = validateManualLockInput({
      reasonCode: body.reasonCode,
      customReason: body.customReason,
      userFacingMessage: body.userFacingMessage,
      internalAdminNote: body.internalAdminNote,
      restrictionType: body.restrictionType,
      effectiveAt: body.effectiveAt,
      expiresAt: body.expiresAt,
    });

    if (!validation.valid || !validation.sanitized) {
      throw new Error(validation.errors[0] || 'Invalid restriction parameters.');
    }

    const sanitized = validation.sanitized;
    const effectiveAtIso = sanitized.effectiveAt.toISOString();
    const expiresAtIso = sanitized.expiresAt ? sanitized.expiresAt.toISOString() : null;

    const items: BulkLockPreviewItem[] = [];
    const errors: string[] = [];
    const totalStudentIds = new Set<string>();
    const totalProgIds = new Set<string>();

    for (const t of targets) {
      const targetKey = `${t.accountType}:${t.accountId || t.subscriptionId || ''}:${t.programmeEnrollmentId || ''}`;
      const subId = buildSubscriptionIdForTarget(t);
      const resolved = await resolveLinkedStudentsForTarget(t, cascades);
      resolved.ids.forEach((id) => totalStudentIds.add(id));
      resolved.programmeIds.forEach((id) => totalProgIds.add(id));
      const valid = Boolean(t.accountId || t.subscriptionId);
      if (!valid) errors.push(`Missing target account ID for ${t.accountName || targetKey}`);
      items.push({
        targetKey,
        subscriptionId: subId,
        accountType: t.accountType,
        accountId: t.accountId,
        accountName: String(t.accountName || t.accountId || 'Account'),
        recipientEmail: resolved.email,
        linkedStudentCount: resolved.ids.length,
        linkedStudentSampleNames: resolved.names,
        affectedStudentIds: resolved.ids,
        affectedProgrammeIds: resolved.programmeIds,
        affectedProgrammeNames: resolved.programmeNames,
        cascadesToLinkedLearners: cascades,
        valid,
        validationError: valid ? null : 'Account identifier is missing.',
      });
    }

    const preview: BulkLockPreviewResult = {
      valid: errors.length === 0 && items.length > 0,
      selectedCount: items.length,
      validCount: items.filter((i) => i.valid).length,
      invalidCount: items.filter((i) => !i.valid).length,
      totalLinkedStudentsAffected: totalStudentIds.size,
      totalProgrammesAffected: totalProgIds.size,
      restrictionType: sanitized.restrictionType,
      reasonCode: sanitized.reasonCode,
      reasonLabel: getLockReasonLabel(sanitized.reasonCode, sanitized.customReason),
      customReason: sanitized.customReason,
      userFacingMessage: sanitized.userFacingMessage,
      effectiveAtIso,
      effectiveAtFormatted: formatLagosDate(effectiveAtIso),
      expiresAtIso,
      expiresAtFormatted: formatLagosDate(expiresAtIso),
      cascadesToLinkedLearners: cascades,
      items,
      errors,
    };

    return { preview } as unknown as T;
  }

  // 8. APPLY BULK LOCK & MANUAL LOCK ACCOUNT
  if (action === 'apply_bulk_lock' || action === 'manual_lock_account') {
    const rawTargets: BulkLockTargetInput[] =
      action === 'apply_bulk_lock'
        ? (Array.isArray(body.targets) ? (body.targets as BulkLockTargetInput[]) : [])
        : [
            {
              subscriptionId: asStr(body.subscriptionId) || null,
              accountType: (asStr(body.accountType || 'SCHOOL').toUpperCase() || 'SCHOOL') as RestrictionTargetAccountType,
              accountId: asStr(body.accountId || body.schoolId || body.parentId || body.studentId || body.programmeEnrollmentId),
              accountName: asStr(body.accountName) || null,
              schoolId: asStr(body.schoolId) || null,
              parentId: asStr(body.parentId) || null,
              studentId: asStr(body.studentId) || null,
              programmeEnrollmentId: asStr(body.programmeEnrollmentId) || null,
            },
          ];

    if (rawTargets.length === 0) {
      throw new Error('Select at least one account or programme entitlement to restrict.');
    }
    if (action === 'apply_bulk_lock' && body.confirmed !== true) {
      throw new Error('Explicit confirmation is required before applying bulk restrictions.');
    }

    const cascades = body.cascadesToLinkedLearners !== false;
    const bulkBatchId = action === 'apply_bulk_lock' ? `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : null;
    const now = new Date();
    const nowIso = now.toISOString();

    const succeeded: Array<{
      restrictionId: string;
      targetAccountId: string;
      targetAccountType: RestrictionTargetAccountType;
      accountName: string;
      linkedStudentCount: number;
    }> = [];
    const failed: Array<{ targetKey: string; accountName: string; error: string }> = [];
    let lastRecord: AccountRestrictionRecord | null = null;

    const seenKeys = new Set<string>();
    for (const t of rawTargets) {
      const targetKey = `${t.accountType}:${t.accountId || t.subscriptionId || ''}:${t.programmeEnrollmentId || ''}`;
      if (seenKeys.has(targetKey)) continue;
      seenKeys.add(targetKey);

      const validation = validateManualLockInput({
        reasonCode: body.reasonCode,
        customReason: body.customReason,
        userFacingMessage: body.userFacingMessage,
        internalAdminNote: body.internalAdminNote,
        restrictionType: body.restrictionType,
        effectiveAt: body.effectiveAt,
        expiresAt: body.expiresAt,
      });

      if (!validation.valid || !validation.sanitized) {
        failed.push({
          targetKey,
          accountName: String(t.accountName || t.accountId || 'Account'),
          error: validation.errors[0] || 'Invalid restriction parameters.',
        });
        continue;
      }

      const norm = validation.sanitized;
      const effectiveAtIso = norm.effectiveAt.toISOString();
      const expiresAtIso = norm.expiresAt ? norm.expiresAt.toISOString() : null;
      const subId = buildSubscriptionIdForTarget(t);
      const resolved = await resolveLinkedStudentsForTarget(t, cascades);
      const restrictionId = `restr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const isFuture = norm.effectiveAt.getTime() > now.getTime() + 60_000;
      const record: AccountRestrictionRecord = {
        restrictionId,
        targetAccountId: t.accountId,
        targetAccountType: t.accountType,
        accountName: t.accountName || t.accountId,
        schoolId: t.schoolId || (t.accountType === 'SCHOOL' ? t.accountId : null),
        parentId: t.parentId || (t.accountType === 'PARENT' ? t.accountId : null),
        studentId: t.studentId || null,
        programmeEnrollmentId: t.programmeEnrollmentId || null,
        affectedStudentIds: resolved.ids,
        affectedProgrammeIds: resolved.programmeIds,
        restrictionType: norm.restrictionType,
        reasonCode: norm.reasonCode,
        customReason: norm.customReason,
        userFacingMessage: norm.userFacingMessage,
        internalAdminNote: norm.internalAdminNote,
        restrictedScope:
          t.accountType === 'SCHOOL'
            ? 'INSTITUTION'
            : t.accountType === 'STUDENT_SELF_FUNDED_PROGRAMME'
            ? 'PROGRAMME'
            : 'ACCOUNT',
        cascadesToLinkedLearners: cascades,
        appliedByUid: actor.uid,
        appliedByName: actor.name,
        appliedAt: nowIso,
        effectiveAt: effectiveAtIso,
        expiresAt: expiresAtIso,
        status: isFuture ? 'SCHEDULED' : 'ACTIVE',
        relatedSubscriptionId: subId,
      };

      await setDoc(doc(db, 'accountRestrictions', restrictionId), record);
      await setDoc(
        doc(db, 'billingSubscriptions', subId),
        {
          id: subId,
          accountType: t.accountType,
          accountId: t.accountId,
          accountName: t.accountName || t.accountId,
          schoolId: record.schoolId,
          parentId: record.parentId,
          studentId: record.studentId,
          programmeEnrollmentId: record.programmeEnrollmentId,
          status: norm.restrictionType === 'ADMINISTRATIVE_SUSPENSION' ? 'SUSPENDED' : 'LOCKED',
          manuallyLocked: !isFuture,
          manualLockReason: norm.userFacingMessage,
          lockReasonCode: norm.reasonCode,
          restrictionType: norm.restrictionType,
          manualLockedByUid: actor.uid,
          manualLockedByName: actor.name,
          manualLockedAt: nowIso,
          manuallyUnlocked: false,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      // Mirror lock metadata onto legacy account document so legacy views stay aligned
      if (!isFuture) {
        const legacyLockPatch = {
          manuallyLocked: true,
          manualLockReason: norm.userFacingMessage,
          manuallyUnlocked: false,
          manualLockedAt: nowIso,
          updatedAt: nowIso,
          updatedBy: actor.uid,
        };
        if (t.accountType === 'SCHOOL' && record.schoolId) {
          const schRef = doc(db, 'schools', record.schoolId);
          const schSnap = await getDoc(schRef).catch(() => null);
          if (schSnap?.exists()) {
            await setDoc(
              schRef,
              { billing: { ...(schSnap.data()?.billing || {}), ...legacyLockPatch }, updatedAt: nowIso },
              { merge: true }
            ).catch(() => undefined);
          }
        } else if ((t.accountType === 'PARENT' || t.accountType === 'INDIVIDUAL_STUDENT') && t.accountId) {
          const uRef = doc(db, 'users', t.accountId);
          const uSnap = await getDoc(uRef).catch(() => null);
          if (uSnap?.exists()) {
            await setDoc(
              uRef,
              { billing: { ...(uSnap.data()?.billing || {}), ...legacyLockPatch }, updatedAt: nowIso },
              { merge: true }
            ).catch(() => undefined);
          }
        } else if (t.accountType === 'STUDENT_SELF_FUNDED_PROGRAMME' && record.programmeEnrollmentId) {
          await setDoc(
            doc(db, 'programme_enrollments', record.programmeEnrollmentId),
            {
              manuallyLocked: true,
              manualLockReason: norm.userFacingMessage,
              manuallyUnlocked: false,
              updatedAt: nowIso,
            },
            { merge: true }
          ).catch(() => undefined);
        }
      }

      const auditEntry = {
        action: 'ADMIN_APPLY_RESTRICTION',
        restrictionId,
        bulkBatchId,
        targetAccountId: t.accountId,
        targetAccountType: t.accountType,
        targetType: t.accountType,
        targetId: subId,
        relatedSubscriptionId: subId,
        accountName: record.accountName,
        schoolId: record.schoolId,
        parentId: record.parentId,
        studentId: record.studentId,
        programmeEnrollmentId: record.programmeEnrollmentId,
        affectedStudentCount: resolved.ids.length,
        reasonCode: norm.reasonCode,
        reason: getLockReasonLabel(norm.reasonCode, norm.customReason),
        restrictionType: norm.restrictionType,
        userFacingMessage: norm.userFacingMessage,
        internalAdminNote: norm.internalAdminNote,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorName: actor.name,
        createdAt: nowIso,
      };
      await Promise.all([
        addDoc(collection(db, 'restrictionAuditLogs'), auditEntry).catch(() => undefined),
        addDoc(collection(db, 'adminAuditLogs'), auditEntry).catch(() => undefined),
      ]);

      await addDoc(collection(db, 'notifications'), {
        recipientId: t.accountId,
        title: 'Account Access Notice',
        message: norm.userFacingMessage,
        type: 'ACCOUNT_RESTRICTION',
        read: false,
        readBy: [],
        createdAt: serverTimestamp(),
      }).catch(() => undefined);

      lastRecord = record;
      succeeded.push({
        restrictionId,
        targetAccountId: record.targetAccountId,
        targetAccountType: record.targetAccountType,
        accountName: record.accountName || record.targetAccountId,
        linkedStudentCount: resolved.ids.length,
      });
    }

    if (succeeded.length === 0 && failed.length > 0) {
      throw new Error(failed[0].error || 'Restriction validation failed.');
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jaystarbliss:entitlement-refresh'));
    }

    if (action === 'manual_lock_account' && lastRecord) {
      return {
        updated: true,
        restrictionId: lastRecord.restrictionId,
        subscriptionId: lastRecord.relatedSubscriptionId,
        accountType: lastRecord.targetAccountType,
        manuallyLocked: true,
        linkedStudentCount: lastRecord.affectedStudentIds.length,
        record: lastRecord,
      } as unknown as T;
    }

    return {
      ok: failed.length === 0,
      partialFailure: failed.length > 0,
      bulkBatchId,
      appliedCount: succeeded.length,
      failedCount: failed.length,
      succeeded,
      failed,
    } as unknown as T;
  }

  // 9. MANUAL UNLOCK ACCOUNT / LIFT RESTRICTION
  if (action === 'manual_unlock_account' || action === 'lift_restriction') {
    const unlockCheck = validateManualUnlockInput({ unlockReason: body.unlockReason ?? body.reason });
    if (!unlockCheck.valid) {
      throw new Error(unlockCheck.errors[0] || 'A valid unlock reason is required.');
    }

    const restrictionId = asStr(body.restrictionId);
    let subscriptionId = asStr(body.subscriptionId);
    let targetAccountType = (asStr(body.accountType || 'SCHOOL').toUpperCase() || 'SCHOOL') as RestrictionTargetAccountType;
    let schoolId = asStr(body.schoolId) || null;
    let programmeEnrollmentId = asStr(body.programmeEnrollmentId) || null;
    let accountId = asStr(body.accountId || body.schoolId || body.parentId || body.studentId || body.programmeEnrollmentId);
    const rawMode = asStr(body.mode || (action === 'lift_restriction' ? 'LIFT_ONLY' : 'AUTO')).toUpperCase();
    const mode = rawMode === 'OPEN' ? 'OPEN' : rawMode === 'AUTO' ? 'AUTO' : 'LIFT_ONLY';
    const now = new Date();
    const nowIso = now.toISOString();

    const snap = await getDocs(query(collection(db, 'accountRestrictions'), limit(300)));
    const liftedIds: string[] = [];
    const remainingActive: AccountRestrictionRecord[] = [];
    const matchedAll: AccountRestrictionRecord[] = [];

    for (const d of snap.docs) {
      const r = { restrictionId: d.id, ...(d.data() || {}) } as AccountRestrictionRecord;
      if (r.status !== 'ACTIVE' && r.status !== 'SCHEDULED') continue;

      const belongsByTarget =
        (subscriptionId && r.relatedSubscriptionId === subscriptionId) ||
        (accountId && r.targetAccountId === accountId) ||
        (schoolId && r.schoolId === schoolId && (r.targetAccountType === 'SCHOOL' || r.targetAccountType === 'SCHOOL_ADMIN')) ||
        (targetAccountType === 'SCHOOL' && accountId && r.schoolId === accountId && (r.targetAccountType === 'SCHOOL' || r.targetAccountType === 'SCHOOL_ADMIN')) ||
        (programmeEnrollmentId && r.programmeEnrollmentId === programmeEnrollmentId);

      const isExplicitTarget = restrictionId ? d.id === restrictionId : false;
      if (!isExplicitTarget && !belongsByTarget) continue;

      matchedAll.push(r);
      if (isExplicitTarget) {
        accountId = accountId || r.targetAccountId;
        targetAccountType = r.targetAccountType || targetAccountType;
        subscriptionId = subscriptionId || asStr(r.relatedSubscriptionId);
        schoolId = schoolId || r.schoolId || null;
        programmeEnrollmentId = programmeEnrollmentId || r.programmeEnrollmentId || null;
      }

      // Lift any manual restriction (including manual locks that used a payment-related reason code);
      // only keep automated payment lockdowns intact unless mode === 'OPEN' or explicitly lifted by ID.
      const isAutomatedPaymentLock = r.restrictionType === 'AUTOMATED_PAYMENT_LOCKDOWN';
      const shouldLift = restrictionId ? isExplicitTarget : !isAutomatedPaymentLock || mode === 'OPEN';

      if (shouldLift) {
        await setDoc(
          doc(db, 'accountRestrictions', d.id),
          {
            status: 'LIFTED',
            liftedByUid: actor.uid,
            liftedByName: actor.name,
            liftedAt: nowIso,
            unlockReason: unlockCheck.unlockReason,
            updatedAt: nowIso,
          },
          { merge: true }
        );
        liftedIds.push(d.id);
      } else if (isRestrictionActiveAt(r, now)) {
        remainingActive.push(r);
      }
    }

    const firstMatched = matchedAll[0] || null;
    const effectiveSubId =
      subscriptionId ||
      asStr(firstMatched?.relatedSubscriptionId) ||
      buildSubscriptionIdForTarget({
        accountType: targetAccountType,
        accountId,
        schoolId,
        parentId: asStr(body.parentId) || null,
        studentId: asStr(body.studentId) || null,
        programmeEnrollmentId,
      });

    const remainingManual = remainingActive.filter((r) => r.restrictionType !== 'AUTOMATED_PAYMENT_LOCKDOWN');
    const stillManuallyLocked = remainingManual.length > 0;
    const nextPrimary = remainingManual[0] || null;

    if (effectiveSubId) {
      const subRef = doc(db, 'billingSubscriptions', effectiveSubId);
      const subSnap = await getDoc(subRef).catch(() => null);
      const existingSub = subSnap?.exists() ? (subSnap.data() || {}) : {};
      const patch: Record<string, any> = {
        id: effectiveSubId,
        manuallyLocked: stillManuallyLocked,
        manualLockReason: stillManuallyLocked ? nextPrimary?.userFacingMessage || null : null,
        lockReasonCode: stillManuallyLocked ? nextPrimary?.reasonCode || null : null,
        restrictionType: stillManuallyLocked ? nextPrimary?.restrictionType || null : null,
        manualUnlockReason: unlockCheck.unlockReason,
        manualUnlockedByUid: actor.uid,
        manualUnlockedByName: actor.name,
        manualUnlockedAt: nowIso,
        updatedAt: nowIso,
      };
      if (!stillManuallyLocked) {
        if (mode === 'OPEN') {
          patch.manuallyUnlocked = true;
        } else if (mode === 'AUTO') {
          patch.manuallyUnlocked = false;
        }
        const unpaidBalance = Number(existingSub.remainingBalance ?? 0);
        const dueDate = parseDateSafe(existingSub.nextDueAt || existingSub.currentPeriodEndAt);
        const isOverdueBalance = unpaidBalance > 0 && dueDate && dueDate.getTime() < now.getTime();
        if (mode === 'OPEN' || !isOverdueBalance) {
          patch.status = 'ACTIVE';
        } else if (existingSub.status === 'SUSPENDED' || existingSub.status === 'LOCKED') {
          patch.status = 'LOCKED';
        }
      }
      await setDoc(subRef, patch, { merge: true }).catch(() => undefined);

      // Mirror unlock flags onto legacy account doc (never altering amounts or payment status)
      if (!stillManuallyLocked) {
        const legacyPatch = {
          manuallyLocked: false,
          manualLockReason: null,
          manuallyUnlocked: mode === 'OPEN',
          manualUnlockedAt: nowIso,
          ...(mode === 'OPEN' ? { status: 'ACTIVE' } : {}),
          updatedAt: nowIso,
          updatedBy: actor.uid,
        };
        const resolvedSchoolId = schoolId || (targetAccountType === 'SCHOOL' ? accountId : null);
        if (targetAccountType === 'SCHOOL' && resolvedSchoolId) {
          const schRef = doc(db, 'schools', resolvedSchoolId);
          const schSnap = await getDoc(schRef).catch(() => null);
          if (schSnap?.exists()) {
            await setDoc(
              schRef,
              { billing: { ...(schSnap.data()?.billing || {}), ...legacyPatch }, updatedAt: nowIso },
              { merge: true }
            ).catch(() => undefined);
          }
        } else if ((targetAccountType === 'PARENT' || targetAccountType === 'INDIVIDUAL_STUDENT') && accountId) {
          const uRef = doc(db, 'users', accountId);
          const uSnap = await getDoc(uRef).catch(() => null);
          if (uSnap?.exists()) {
            await setDoc(
              uRef,
              { billing: { ...(uSnap.data()?.billing || {}), ...legacyPatch }, updatedAt: nowIso },
              { merge: true }
            ).catch(() => undefined);
          }
        } else if (targetAccountType === 'STUDENT_SELF_FUNDED_PROGRAMME' && programmeEnrollmentId) {
          await setDoc(
            doc(db, 'programme_enrollments', programmeEnrollmentId),
            {
              manuallyLocked: false,
              manualLockReason: null,
              manuallyUnlocked: mode === 'OPEN',
              updatedAt: nowIso,
            },
            { merge: true }
          ).catch(() => undefined);
        }
      }
    }

    const auditEntry = {
      action: action === 'lift_restriction' ? 'ADMIN_LIFT_RESTRICTION' : 'ADMIN_MANUAL_UNLOCK_ACCOUNT',
      restrictionId: restrictionId || null,
      targetType: targetAccountType,
      targetAccountType,
      targetId: effectiveSubId || accountId || null,
      targetAccountId: accountId || null,
      relatedSubscriptionId: effectiveSubId || null,
      liftedIds,
      unlockReason: unlockCheck.unlockReason,
      reason: unlockCheck.unlockReason,
      mode,
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      createdAt: nowIso,
    };
    await Promise.all([
      addDoc(collection(db, 'restrictionAuditLogs'), auditEntry).catch(() => undefined),
      addDoc(collection(db, 'adminAuditLogs'), auditEntry).catch(() => undefined),
    ]);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jaystarbliss:entitlement-refresh'));
    }

    return {
      updated: true,
      liftedIds,
      remainingActiveRestrictions: remainingActive,
      hasRemainingPaymentLock: remainingActive.some((r) => r.restrictionType === 'AUTOMATED_PAYMENT_LOCKDOWN'),
      mode,
    } as unknown as T;
  }

  // 10. LIST RESTRICTION HISTORY
  if (action === 'list_restriction_history') {
    const targetAccountId = asStr(body.targetAccountId);
    const subscriptionId = asStr(body.subscriptionId);

    const [resSnap, logSnap] = await Promise.all([
      getDocs(query(collection(db, 'accountRestrictions'), limit(250))).catch(() => ({ docs: [] } as any)),
      getDocs(query(collection(db, 'restrictionAuditLogs'), limit(200))).catch(() => ({ docs: [] } as any)),
    ]);

    let restrictions = (resSnap.docs || [])
      .map((d: any) => ({ restrictionId: d.id, ...(d.data() || {}) }))
      .sort((a: any, b: any) => String(b.appliedAt || '').localeCompare(String(a.appliedAt || '')));

    if (targetAccountId) {
      restrictions = restrictions.filter((r: any) => r.targetAccountId === targetAccountId);
    } else if (subscriptionId) {
      restrictions = restrictions.filter((r: any) => r.relatedSubscriptionId === subscriptionId);
    }

    let auditLogs = (logSnap.docs || [])
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    if (targetAccountId) {
      auditLogs = auditLogs.filter((l: any) => l.targetAccountId === targetAccountId || l.targetId === subscriptionId);
    } else if (subscriptionId) {
      auditLogs = auditLogs.filter((l: any) => l.targetId === subscriptionId || l.relatedSubscriptionId === subscriptionId);
    }

    return {
      restrictions,
      auditLogs: auditLogs.slice(0, 120),
    } as unknown as T;
  }

  // 11. TRANSFER TO TUTOR WALLET
  if (action === 'transfer_to_tutor') {
    const tutorId = asStr(body.tutorId);
    const amount = Number(body.amount || 0);
    const description = asStr(body.description || 'Direct Transfer to Faculty Wallet');
    const reference = asStr(body.reference) || `TRF-TUTOR-${tutorId.slice(0, 6)}-${Date.now()}`;
    if (!tutorId) throw new Error('Tutor ID is required.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid transfer amount.');

    const existingTx = await getDoc(doc(db, 'payments', reference));
    if (existingTx.exists()) throw new Error('This transfer reference has already been processed.');

    const tutorSnap = await getDoc(doc(db, 'users', tutorId)).catch(() => null);
    const tutorName = String(tutorSnap?.data()?.fullName || tutorSnap?.data()?.name || 'Tutor');

    await setDoc(
      doc(db, 'staffWallets', tutorId),
      {
        staffId: tutorId,
        staffName: tutorName,
        availableBalance: increment(amount),
        lifetimeEarned: increment(amount),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(doc(db, 'payments', reference), {
      type: 'transfer_to',
      category: 'transfer_to',
      source: 'treasury',
      destination: 'tutor_wallet',
      tutorId,
      tutorName,
      amount,
      amountInNaira: true,
      customerTotal: amount,
      baseAmount: amount,
      status: 'PAID',
      description,
      plan: 'Faculty Allocation',
      payerName: 'Platform Treasury',
      reference,
      paidAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    return { transferred: true, reference, tutorId, amount } as unknown as T;
  }

  // 12. ASSIGN TUTOR TO PAYMENT
  if (action === 'assign_tutor') {
    const paymentId = asStr(body.paymentId);
    const tutorId = asStr(body.tutorId);
    if (!paymentId || !tutorId) throw new Error('Payment ID and tutor ID are required.');

    const payRef = doc(db, 'payments', paymentId);
    const paySnap = await getDoc(payRef);
    if (!paySnap.exists()) throw new Error('Payment record was not found.');
    const payData = paySnap.data() || {};
    if (!isPaidStatus(payData.status ?? payData.paymentStatus) && !isPartialStatus(payData.status ?? payData.paymentStatus)) {
      throw new Error('Tutor can only be assigned to a verified paid or partially paid invoice.');
    }

    const tutorSnap = await getDoc(doc(db, 'users', tutorId)).catch(() => null);
    const tutorName = String(tutorSnap?.data()?.fullName || tutorSnap?.data()?.name || 'Assigned Tutor');
    const prevTutorId = asStr(payData.tutorId);
    const creditAmount = Number(payData.baseAmount || payData.amount || 0);

    if (prevTutorId !== tutorId) {
      if (prevTutorId && payData.walletCredited && creditAmount > 0) {
        await setDoc(
          doc(db, 'staffWallets', prevTutorId),
          {
            availableBalance: increment(-creditAmount),
            lifetimeEarned: increment(-creditAmount),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => undefined);
      }
      if (creditAmount > 0) {
        await setDoc(
          doc(db, 'staffWallets', tutorId),
          {
            staffId: tutorId,
            staffName: tutorName,
            availableBalance: increment(creditAmount),
            lifetimeEarned: increment(creditAmount),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await updateDoc(payRef, {
        tutorId,
        tutorName,
        walletCredited: true,
        walletCreditedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
    }

    return { assigned: true, paymentId, tutorId, tutorName } as unknown as T;
  }

  return null;
}

// =========================================================================
// CONTROLLED TEST FINANCIAL DATA RESET FALLBACK (SUPERADMIN ONLY)
// =========================================================================
function serializeValueForBackup(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  if (Array.isArray(value)) return value.map(serializeValueForBackup);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeValueForBackup(v)]));
  }
  return value;
}

async function scanClientFinancialInventory(): Promise<{
  inventory: FinancialResetInventory;
  rawDocsByCollection: Record<string, Array<{ id: string; data: Record<string, any> }>>;
}> {
  const activeProjectId = String((db.app.options as any)?.projectId || '').trim();
  const guard = validateResetEnvironmentGuard({
    activeProjectId,
    expectedTestProjectId: activeProjectId,
    allowResetFlag: 'true',
    firebaseEnv: 'development',
    nodeEnv: 'development',
  });

  const collections: CollectionInventorySummary[] = [];
  const rawDocsByCollection: Record<string, Array<{ id: string; data: Record<string, any> }>> = {};

  for (const colName of TARGET_FINANCIAL_COLLECTIONS) {
    const snap = await getDocs(collection(db, colName)).catch(() => ({ docs: [] } as any));
    const entries = snap.docs.map((d: any) => ({ id: d.id, data: d.data() || {} }));
    rawDocsByCollection[colName] = entries;
    collections.push(
      summarizeCollectionDocs({
        collection: colName,
        action: 'DELETE_DOCUMENTS',
        docs: entries.map((e: any) => e.data),
        notes: 'Test transaction / payout / reminder history documents',
      })
    );
  }

  for (const colName of DERIVED_BALANCE_COLLECTIONS) {
    const snap = await getDocs(collection(db, colName)).catch(() => ({ docs: [] } as any));
    const affected = snap.docs
      .map((d: any) => ({ id: d.id, data: d.data() || {} }))
      .filter(
        (e: any) =>
          Number(e.data.availableBalance || 0) !== 0 ||
          Number(e.data.reservedBalance || 0) !== 0 ||
          Number(e.data.lifetimeEarned || 0) !== 0
      );
    rawDocsByCollection[colName] = affected;
    collections.push(
      summarizeCollectionDocs({
        collection: colName,
        action: 'RESET_DERIVED_BALANCES',
        docs: affected.map((e: any) => e.data),
        notes: 'Zeroes availableBalance, reservedBalance, lifetimeEarned while preserving tutor payout profile',
      })
    );
  }

  const embeddedChecks: Array<{ collection: string; predicate: (d: Record<string, any>) => boolean; notes: string }> = [
    {
      collection: 'schools',
      predicate: (d) =>
        Boolean(d.billing && (d.billing.lastPaidAt || d.billing.lastPaymentReference || Number(d.billing.amountPaid || 0) > 0 || d.billing.paidThrough)),
      notes: 'Resets schools.billing settlement history while preserving school record & baseAmount/cycle/plan config',
    },
    {
      collection: 'users',
      predicate: (d) =>
        Boolean(d.billing && (d.billing.lastPaidAt || d.billing.lastPaymentReference || Number(d.billing.amountPaid || 0) > 0 || d.billing.paidThrough)),
      notes: 'Resets users.billing settlement history while preserving user accounts & billing configuration',
    },
    {
      collection: 'individualStudents',
      predicate: (d) => Boolean(d.lastPaidAt || d.lastPaymentReference || Number(d.amountPaid || 0) > 0 || d.paidThrough),
      notes: 'Clears test payment timestamps/references while preserving student accounts & classes',
    },
    {
      collection: 'students',
      predicate: (d) => Boolean(d.lastPaidAt || d.lastPaymentReference || Number(d.amountPaid || 0) > 0 || d.paidThrough),
      notes: 'Clears test payment timestamps/references while preserving student accounts & classes',
    },
    {
      collection: 'programme_enrollments',
      predicate: (d) =>
        Boolean(d.lastPaidAt || d.lastPaymentReference || Number(d.amountPaid || 0) > 0 || (Array.isArray(d.paymentHistory) && d.paymentHistory.length > 0)),
      notes: 'Clears test paymentHistory & amountPaid while preserving enrolment & approvedFee',
    },
    {
      collection: 'enrollment_requests',
      predicate: (d) => Boolean(d.paymentReference || d.paymentStatus === 'PAID'),
      notes: 'Clears test paymentReference/paymentStatus while preserving enrolment request records',
    },
    {
      collection: 'billingSubscriptions',
      predicate: (d) => Boolean(d.lastSuccessfulPaymentAt || d.lastPaymentReference || Number(d.amountPaid || 0) > 0),
      notes: 'Resets test payment settlement history on subscriptions while preserving plan/amount config',
    },
  ];

  for (const check of embeddedChecks) {
    const snap = await getDocs(collection(db, check.collection)).catch(() => ({ docs: [] } as any));
    const affected = snap.docs
      .map((d: any) => ({ id: d.id, data: d.data() || {} }))
      .filter((e: any) => check.predicate(e.data));
    rawDocsByCollection[`embedded:${check.collection}`] = affected;
    collections.push(
      summarizeCollectionDocs({
        collection: check.collection,
        action: 'RESET_EMBEDDED_PAYMENT_FIELDS',
        docs: affected.map((e: any) => e.data),
        notes: check.notes,
      })
    );
  }

  const totalFinancialDocumentsToDelete = collections
    .filter((c) => c.action === 'DELETE_DOCUMENTS')
    .reduce((sum, c) => sum + c.documentCount, 0);
  const totalDerivedWalletDocsToZero = collections
    .filter((c) => c.action === 'RESET_DERIVED_BALANCES')
    .reduce((sum, c) => sum + c.documentCount, 0);
  const totalEmbeddedRecordsToClean = collections
    .filter((c) => c.action === 'RESET_EMBEDDED_PAYMENT_FIELDS')
    .reduce((sum, c) => sum + c.documentCount, 0);
  const totalAggregateAmountNaira = Number(
    collections
      .filter((c) => c.action === 'DELETE_DOCUMENTS')
      .reduce((sum, c) => sum + c.aggregateAmountNaira, 0)
      .toFixed(2)
  );

  const previewSignature = computePreviewSignature({
    activeProjectId: guard.activeProjectId,
    collections,
  });

  return {
    inventory: {
      activeProjectId: guard.activeProjectId,
      environmentLabel: guard.environmentLabel,
      guard,
      collections,
      totalFinancialDocumentsToDelete,
      totalDerivedWalletDocsToZero,
      totalEmbeddedRecordsToClean,
      totalAggregateAmountNaira,
      preservedCollections: PRESERVED_COLLECTIONS,
      preservedConfigDocs: PRESERVED_CONFIG_DOCS,
      previewSignature,
      generatedAt: new Date().toISOString(),
    },
    rawDocsByCollection,
  };
}

export async function handleFinancialResetFirestoreFallback<T>(
  action: string,
  body: Record<string, unknown>
): Promise<T> {
  const actor = await resolveCurrentAdminActor();
  if (!actor.isSuperAdmin) {
    throw new Error('Superadmin authorization is strictly required for Controlled Test Financial Data Reset.');
  }

  if (action === 'dry_run') {
    const { inventory } = await scanClientFinancialInventory();
    return {
      stage: 'DRY_RUN',
      modifiedFirestore: false,
      inventory,
    } as unknown as T;
  }

  if (action === 'list_audit_logs') {
    const snap = await getDocs(query(collection(db, 'financialResetAuditLogs'), limit(25))).catch(() => ({ docs: [] } as any));
    const logs = snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a: any, b: any) => String(b.executedAt || '').localeCompare(String(a.executedAt || '')));
    return { logs } as unknown as T;
  }

  if (action === 'execute') {
    const { inventory, rawDocsByCollection } = await scanClientFinancialInventory();
    const validation = validateResetExecutionRequest({
      isSuperAdmin: actor.isSuperAdmin,
      confirmationPhrase: String(body.confirmationPhrase || ''),
      providedPreviewSignature: String(body.previewSignature || ''),
      freshPreviewSignature: inventory.previewSignature,
      guard: inventory.guard,
    });
    if (!validation.ok) {
      throw new Error(validation.error || 'Reset execution validation failed.');
    }

    const operationId = `finreset_${Date.now()}_${actor.uid.slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    await setDoc(doc(db, 'financialResetBackups', operationId), {
      operationId,
      activeProjectId: inventory.activeProjectId,
      environmentLabel: inventory.environmentLabel,
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      previewSignature: inventory.previewSignature,
      summary: {
        totalFinancialDocumentsToDelete: inventory.totalFinancialDocumentsToDelete,
        totalDerivedWalletDocsToZero: inventory.totalDerivedWalletDocsToZero,
        totalEmbeddedRecordsToClean: inventory.totalEmbeddedRecordsToClean,
        totalAggregateAmountNaira: inventory.totalAggregateAmountNaira,
      },
      createdAt: nowIso,
    });

    let chunkIndex = 0;
    for (const [key, docs] of Object.entries(rawDocsByCollection)) {
      for (let i = 0; i < docs.length; i += 50) {
        const slice = docs.slice(i, i + 50).map((entry) => ({
          id: entry.id,
          data: serializeValueForBackup(entry.data),
        }));
        await setDoc(
          doc(db, 'financialResetBackups', operationId, 'chunks', `chunk_${String(chunkIndex).padStart(4, '0')}`),
          { sourceKey: key, chunkIndex, count: slice.length, documents: slice }
        );
        chunkIndex += 1;
      }
    }

    const deletedCounts: Record<string, number> = {};
    for (const colName of TARGET_FINANCIAL_COLLECTIONS) {
      const docs = rawDocsByCollection[colName] || [];
      let deleted = 0;
      for (let i = 0; i < docs.length; i += 250) {
        const batch = writeBatch(db);
        const slice = docs.slice(i, i + 250);
        for (const item of slice) batch.delete(doc(db, colName, item.id));
        await batch.commit();
        deleted += slice.length;
      }
      deletedCounts[colName] = deleted;
    }

    let zeroedWallets = 0;
    for (const item of rawDocsByCollection.staffWallets || []) {
      await setDoc(
        doc(db, 'staffWallets', item.id),
        { availableBalance: 0, reservedBalance: 0, lifetimeEarned: 0, lastResetOperationId: operationId, updatedAt: nowIso },
        { merge: true }
      );
      zeroedWallets += 1;
    }

    const cleanedEmbeddedCounts: Record<string, number> = {};
    for (const colName of ['schools', 'users'] as const) {
      const docs = rawDocsByCollection[`embedded:${colName}`] || [];
      for (const item of docs) {
        const cleanedBilling = stripTestPaymentFieldsFromBillingObject(item.data.billing);
        if (cleanedBilling) {
          await setDoc(doc(db, colName, item.id), { billing: cleanedBilling, updatedAt: nowIso }, { merge: true });
        }
      }
      cleanedEmbeddedCounts[colName] = docs.length;
    }

    for (const colName of ['individualStudents', 'students'] as const) {
      const docs = rawDocsByCollection[`embedded:${colName}`] || [];
      for (const item of docs) {
        await setDoc(
          doc(db, colName, item.id),
          {
            amountPaid: 0,
            remainingBalance: Number(item.data.tuitionFee ?? item.data.fee ?? 0),
            lastPaidAt: null,
            lastPaymentReference: null,
            paidThrough: null,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }
      cleanedEmbeddedCounts[colName] = docs.length;
    }

    const enrollDocs = rawDocsByCollection['embedded:programme_enrollments'] || [];
    for (const item of enrollDocs) {
      await setDoc(
        doc(db, 'programme_enrollments', item.id),
        { ...stripTestPaymentFieldsFromProgrammeEnrollment(item.data), updatedAt: nowIso },
        { merge: true }
      );
    }
    cleanedEmbeddedCounts.programme_enrollments = enrollDocs.length;

    const reqDocs = rawDocsByCollection['embedded:enrollment_requests'] || [];
    for (const item of reqDocs) {
      await setDoc(
        doc(db, 'enrollment_requests', item.id),
        { paymentReference: null, paymentStatus: 'UNPAID', paidAt: null, updatedAt: nowIso },
        { merge: true }
      );
    }
    cleanedEmbeddedCounts.enrollment_requests = reqDocs.length;

    const subDocs = rawDocsByCollection['embedded:billingSubscriptions'] || [];
    for (const item of subDocs) {
      const amt = Number(item.data.amount || 0);
      await setDoc(
        doc(db, 'billingSubscriptions', item.id),
        {
          amountPaid: 0,
          remainingBalance: amt,
          lastSuccessfulPaymentAt: null,
          lastPaymentReference: null,
          lastReminderSentAt: null,
          lockdownActivatedAt: null,
          status: item.data.exemption?.exempt ? 'EXEMPT' : 'ACTIVE',
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }
    cleanedEmbeddedCounts.billingSubscriptions = subDocs.length;

    const verification: Record<string, number> = {};
    for (const colName of TARGET_FINANCIAL_COLLECTIONS) {
      const afterSnap = await getDocs(query(collection(db, colName), limit(5))).catch(() => ({ size: 0 } as any));
      verification[colName] = afterSnap.size || 0;
    }

    const auditRecord = {
      operationId,
      action: 'CONTROLLED_TEST_FINANCIAL_DATA_RESET',
      activeProjectId: inventory.activeProjectId,
      environmentLabel: inventory.environmentLabel,
      executedByUid: actor.uid,
      executedByEmail: actor.email,
      executedByName: actor.name,
      previewSignature: inventory.previewSignature,
      backupDocId: operationId,
      backupChunkCount: chunkIndex,
      deletedCounts,
      zeroedWallets,
      cleanedEmbeddedCounts,
      postResetRemainingCounts: verification,
      preservedCollections: PRESERVED_COLLECTIONS,
      preservedConfigDocs: PRESERVED_CONFIG_DOCS,
      executedAt: nowIso,
    };

    await setDoc(doc(db, 'financialResetAuditLogs', operationId), auditRecord);
    await addDoc(collection(db, 'adminAuditLogs'), {
      action: 'CONTROLLED_TEST_FINANCIAL_DATA_RESET',
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      targetType: 'FINANCIAL_TEST_DATA',
      targetId: operationId,
      metadata: { activeProjectId: inventory.activeProjectId, deletedCounts, zeroedWallets, backupDocId: operationId },
      createdAt: nowIso,
    }).catch(() => undefined);

    return {
      stage: 'EXECUTED',
      operationId,
      backupDocId: operationId,
      deletedCounts,
      zeroedWallets,
      cleanedEmbeddedCounts,
      postResetRemainingCounts: verification,
      executedAt: nowIso,
    } as unknown as T;
  }

  throw new Error('Unsupported financial reset action.');
}
