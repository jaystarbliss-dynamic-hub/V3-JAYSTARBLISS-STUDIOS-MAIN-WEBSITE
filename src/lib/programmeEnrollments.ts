import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { billingPost } from './billing';

export type ProgrammeEnrollmentStatus =
  | 'PENDING_ADMIN_REVIEW'
  | 'APPROVED_AWAITING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'ACTIVE'
  | 'RENEWAL_DUE'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type ProgrammePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'RENEWAL_DUE';

export type BillingResponsibility =
  | 'STUDENT_SELF_FUNDED'
  | 'PARENT_FUNDED'
  | 'SCHOOL_FUNDED';

export type StudentRegistrationCategory = 'individual' | 'school' | 'parent';

export interface ProgrammeEnrollmentPaymentHistoryItem {
  reference: string;
  amount: number;
  baseAmount: number;
  transactionFee: number;
  paidAt: string;
  cycleNumber: number;
  method?: string;
}

export interface ProgrammeEnrollmentRecord {
  id: string;
  studentUid: string;
  studentDocId: string;
  studentName: string;
  studentEmail: string;
  studentRegistrationType: 'individual' | 'school';
  schoolId: string | null;
  schoolName: string | null;
  programId: string;
  programSlug: string;
  programTitle: string;
  parentProgramId: string | null;
  breadcrumbPath: string;
  deliveryOption: string;
  billingResponsibility: BillingResponsibility;
  enrollmentStatus: ProgrammeEnrollmentStatus;
  paymentStatus: ProgrammePaymentStatus;
  approvedFee: number;
  amountPaid: number;
  remainingBalance: number;
  billingCycle: 'monthly' | 'termly' | 'cohort' | 'one_time';
  durationWeeks: number;
  allowDepositAccess: boolean;
  depositAmount: number;
  paidThrough: string | null;
  nextDueDate: string | null;
  cycleNumber: number;
  adminNotes: string;
  rejectionReason: string | null;
  feeSource: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  emailDeliveryStatus: 'NOT_SENT' | 'SENT' | 'FAILED';
  emailDeliveryError: string | null;
  emailLastSentAt: string | null;
  paymentHistory: ProgrammeEnrollmentPaymentHistoryItem[];
  source: string;
  createdAt: any;
  updatedAt: any;
}

export const QUALIFYING_BILLING_STATUSES: ReadonlySet<ProgrammeEnrollmentStatus> = new Set([
  'APPROVED_AWAITING_PAYMENT',
  'PARTIALLY_PAID',
  'ACTIVE',
  'RENEWAL_DUE',
]);

export const PAYABLE_ENROLLMENT_STATUSES: ReadonlySet<ProgrammeEnrollmentStatus> = new Set([
  'APPROVED_AWAITING_PAYMENT',
  'PARTIALLY_PAID',
  'RENEWAL_DUE',
]);

export function normalizeEnrollmentStatus(raw: unknown): ProgrammeEnrollmentStatus {
  const s = String(raw || '').trim().toUpperCase();
  const allowed: ProgrammeEnrollmentStatus[] = [
    'PENDING_ADMIN_REVIEW',
    'APPROVED_AWAITING_PAYMENT',
    'PARTIALLY_PAID',
    'ACTIVE',
    'RENEWAL_DUE',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ];
  return allowed.includes(s as ProgrammeEnrollmentStatus)
    ? (s as ProgrammeEnrollmentStatus)
    : 'PENDING_ADMIN_REVIEW';
}

export function normalizePaymentStatus(raw: unknown): ProgrammePaymentStatus {
  const s = String(raw || '').trim().toUpperCase();
  if (s === 'PAID' || s === 'PARTIALLY_PAID' || s === 'RENEWAL_DUE' || s === 'UNPAID') {
    return s;
  }
  return 'UNPAID';
}

/**
 * Pure helper to determine a student account's true registration type and
 * whether they are permitted to self-discover and request self-funded programmes.
 *
 * CRITICAL POLICY:
 * - Individual students (`individual`) -> CAN self-discover and self-enrol.
 * - School students (`school`) -> CAN self-discover and request STUDENT_SELF_FUNDED programmes
 *   independently without affecting school-funded tracks or school billing.
 * - Parent-enrolled child accounts (`parent`) -> MUST NOT self-discover or self-enrol.
 */
export function resolveStudentPortalEligibility(input: {
  registrationType?: string | null;
  registrationSource?: string | null;
  parentId?: string | null;
  parentUid?: string | null;
  schoolId?: string | null;
  isIndependent?: boolean | null;
}): {
  registrationType: StudentRegistrationCategory;
  canSelfDiscoverAndEnroll: boolean;
  isParentManagedChild: boolean;
  isSchoolStudent: boolean;
} {
  const rawType = String(input.registrationType || '').trim().toLowerCase();
  const rawSource = String(input.registrationSource || '').trim().toLowerCase();
  const hasParentId = Boolean(String(input.parentId || input.parentUid || '').trim());
  const hasSchoolId = Boolean(String(input.schoolId || '').trim());

  const isParentSource =
    rawSource.includes('parent') || rawType === 'parent' || rawType === 'parent-enrolled';

  if (hasParentId || isParentSource) {
    return {
      registrationType: 'parent',
      canSelfDiscoverAndEnroll: false,
      isParentManagedChild: true,
      isSchoolStudent: false,
    };
  }

  if (
    hasSchoolId ||
    rawType === 'school' ||
    rawType === 'school-enrolled' ||
    rawSource.includes('school')
  ) {
    return {
      registrationType: 'school',
      canSelfDiscoverAndEnroll: true,
      isParentManagedChild: false,
      isSchoolStudent: true,
    };
  }

  return {
    registrationType: 'individual',
    canSelfDiscoverAndEnroll: true,
    isParentManagedChild: false,
    isSchoolStudent: false,
  };
}

/**
 * Determines whether a student's Payments & Fees tab should be unlocked.
 * - Never unlocked for parent-enrolled child accounts.
 * - Always unlocked for individual students.
 * - Unlocked for school students when they have at least one qualifying
 *   STUDENT_SELF_FUNDED programme enrolment record.
 */
export function shouldUnlockStudentBillingTab(params: {
  eligibility: ReturnType<typeof resolveStudentPortalEligibility>;
  selfFundedEnrollments: Array<Pick<ProgrammeEnrollmentRecord, 'enrollmentStatus' | 'billingResponsibility' | 'remainingBalance'>>;
}): boolean {
  if (params.eligibility.isParentManagedChild) return false;
  if (params.eligibility.registrationType === 'individual') return true;
  if (params.eligibility.isSchoolStudent) {
    return params.selfFundedEnrollments.some(
      (e) =>
        e.billingResponsibility === 'STUDENT_SELF_FUNDED' &&
        (QUALIFYING_BILLING_STATUSES.has(e.enrollmentStatus) || Number(e.remainingBalance || 0) > 0)
    );
  }
  return false;
}

export function normalizeProgrammeEnrollmentDoc(
  id: string,
  raw: Record<string, any>
): ProgrammeEnrollmentRecord {
  const approvedFee = Math.max(0, Number(raw.approvedFee || 0));
  const amountPaid = Math.max(0, Number(raw.amountPaid || 0));
  const remainingBalance =
    raw.remainingBalance !== undefined && raw.remainingBalance !== null
      ? Math.max(0, Number(raw.remainingBalance))
      : Math.max(0, approvedFee - amountPaid);

  return {
    id,
    studentUid: String(raw.studentUid || ''),
    studentDocId: String(raw.studentDocId || raw.studentUid || ''),
    studentName: String(raw.studentName || 'Student'),
    studentEmail: String(raw.studentEmail || ''),
    studentRegistrationType: raw.studentRegistrationType === 'school' ? 'school' : 'individual',
    schoolId: raw.schoolId ? String(raw.schoolId) : null,
    schoolName: raw.schoolName ? String(raw.schoolName) : null,
    programId: String(raw.programId || ''),
    programSlug: String(raw.programSlug || raw.programId || ''),
    programTitle: String(raw.programTitle || 'Programme'),
    parentProgramId: raw.parentProgramId ? String(raw.parentProgramId) : null,
    breadcrumbPath: String(raw.breadcrumbPath || raw.programTitle || ''),
    deliveryOption: String(raw.deliveryOption || 'Online / Hybrid'),
    billingResponsibility:
      raw.billingResponsibility === 'PARENT_FUNDED' || raw.billingResponsibility === 'SCHOOL_FUNDED'
        ? raw.billingResponsibility
        : 'STUDENT_SELF_FUNDED',
    enrollmentStatus: normalizeEnrollmentStatus(raw.enrollmentStatus),
    paymentStatus: normalizePaymentStatus(raw.paymentStatus),
    approvedFee,
    amountPaid,
    remainingBalance,
    billingCycle:
      raw.billingCycle === 'termly' ||
      raw.billingCycle === 'cohort' ||
      raw.billingCycle === 'one_time'
        ? raw.billingCycle
        : 'monthly',
    durationWeeks: Math.max(1, Number(raw.durationWeeks || (raw.billingCycle === 'termly' ? 12 : 4))),
    allowDepositAccess: raw.allowDepositAccess === true,
    depositAmount: Math.max(0, Number(raw.depositAmount || 0)),
    paidThrough: raw.paidThrough ? String(raw.paidThrough) : null,
    nextDueDate: raw.nextDueDate ? String(raw.nextDueDate) : null,
    cycleNumber: Math.max(1, Number(raw.cycleNumber || 1)),
    adminNotes: String(raw.adminNotes || ''),
    rejectionReason: raw.rejectionReason ? String(raw.rejectionReason) : null,
    feeSource: raw.feeSource ? String(raw.feeSource) : null,
    approvedBy: raw.approvedBy ? String(raw.approvedBy) : null,
    approvedByName: raw.approvedByName ? String(raw.approvedByName) : null,
    approvedAt: raw.approvedAt
      ? typeof raw.approvedAt?.toDate === 'function'
        ? raw.approvedAt.toDate().toISOString()
        : String(raw.approvedAt)
      : null,
    emailDeliveryStatus:
      raw.emailDeliveryStatus === 'SENT' || raw.emailDeliveryStatus === 'FAILED'
        ? raw.emailDeliveryStatus
        : 'NOT_SENT',
    emailDeliveryError: raw.emailDeliveryError ? String(raw.emailDeliveryError) : null,
    emailLastSentAt: raw.emailLastSentAt ? String(raw.emailLastSentAt) : null,
    paymentHistory: Array.isArray(raw.paymentHistory) ? raw.paymentHistory : [],
    source: String(raw.source || 'PORTAL_EXPLORE'),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

export async function fetchStudentProgrammeEnrollments(
  studentUid: string
): Promise<ProgrammeEnrollmentRecord[]> {
  if (!studentUid) return [];
  const q = query(
    collection(db, 'programme_enrollments'),
    where('studentUid', '==', studentUid)
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) =>
    normalizeProgrammeEnrollmentDoc(d.id, d.data() as Record<string, any>)
  );
  return items.sort((a, b) => {
    const aMs = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
    const bMs = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
    return bMs - aMs;
  });
}

export async function submitStudentProgrammeApplication(params: {
  studentUid: string;
  studentDocId: string;
  studentName: string;
  studentEmail: string;
  studentRegistrationType: 'individual' | 'school';
  schoolId?: string | null;
  schoolName?: string | null;
  programId: string;
  programSlug: string;
  programTitle: string;
  parentProgramId?: string | null;
  breadcrumbPath?: string;
  deliveryOption?: string;
  source?: string;
}): Promise<{ id: string; alreadyExists: boolean; existing?: ProgrammeEnrollmentRecord }> {
  const existingList = await fetchStudentProgrammeEnrollments(params.studentUid);
  const activeDuplicate = existingList.find(
    (item) =>
      item.programId === params.programId &&
      !['REJECTED', 'CANCELLED', 'EXPIRED'].includes(item.enrollmentStatus)
  );

  if (activeDuplicate) {
    return {
      id: activeDuplicate.id,
      alreadyExists: true,
      existing: activeDuplicate,
    };
  }

  const payload = {
    studentUid: params.studentUid,
    studentDocId: params.studentDocId || params.studentUid,
    studentName: params.studentName.trim() || 'Student',
    studentEmail: params.studentEmail.trim().toLowerCase(),
    studentRegistrationType: params.studentRegistrationType,
    schoolId: params.studentRegistrationType === 'school' ? params.schoolId || null : null,
    schoolName: params.studentRegistrationType === 'school' ? params.schoolName || null : null,
    programId: params.programId,
    programSlug: params.programSlug || params.programId,
    programTitle: params.programTitle,
    parentProgramId: params.parentProgramId || null,
    breadcrumbPath: params.breadcrumbPath || params.programTitle,
    deliveryOption: params.deliveryOption || 'Online / Hybrid',
    billingResponsibility: 'STUDENT_SELF_FUNDED' as BillingResponsibility,
    enrollmentStatus: 'PENDING_ADMIN_REVIEW' as ProgrammeEnrollmentStatus,
    paymentStatus: 'UNPAID' as ProgrammePaymentStatus,
    approvedFee: 0,
    amountPaid: 0,
    remainingBalance: 0,
    billingCycle: 'monthly',
    durationWeeks: 4,
    allowDepositAccess: false,
    depositAmount: 0,
    paidThrough: null,
    nextDueDate: null,
    cycleNumber: 1,
    adminNotes: '',
    rejectionReason: null,
    feeSource: null,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    emailDeliveryStatus: 'NOT_SENT',
    emailDeliveryError: null,
    emailLastSentAt: null,
    paymentHistory: [],
    source: params.source || 'PORTAL_EXPLORE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'programme_enrollments'), payload);
  return { id: docRef.id, alreadyExists: false };
}

export async function approveProgrammeEnrollmentAsAdmin(params: {
  enrollmentId: string;
  approvedFee: number;
  billingCycle: 'monthly' | 'termly' | 'cohort' | 'one_time';
  durationWeeks?: number;
  allowDepositAccess?: boolean;
  depositAmount?: number;
  feeSource?: string;
  adminNotes?: string;
}): Promise<{
  success: boolean;
  emailSent: boolean;
  emailError?: string | null;
  fallbackUsed?: boolean;
}> {
  try {
    const res = await billingPost<any>('programme-enrollment-admin', {
      action: 'approve',
      ...params,
    });
    return {
      success: true,
      emailSent: Boolean(res?.emailSent || res?.emailDeliveryStatus === 'SENT'),
      emailError: res?.emailError || res?.emailDeliveryError || null,
    };
  } catch (serverErr: any) {
    // Graceful Firestore fallback if local dev server does not run Netlify Functions
    const isNetworkOrMissingFn =
      String(serverErr?.message || '').toLowerCase().includes('404') ||
      String(serverErr?.message || '').toLowerCase().includes('not found') ||
      String(serverErr?.message || '').toLowerCase().includes('failed to fetch');
    if (!isNetworkOrMissingFn) {
      throw serverErr;
    }

    const adminUser = auth.currentUser;
    const fee = Math.max(0, Number(params.approvedFee) || 0);
    const deposit = params.allowDepositAccess ? Math.min(fee, Math.max(0, Number(params.depositAmount) || 0)) : 0;
    const weeks =
      params.durationWeeks ||
      (params.billingCycle === 'termly' ? 12 : params.billingCycle === 'cohort' ? 8 : 4);

    await updateDoc(doc(db, 'programme_enrollments', params.enrollmentId), {
      enrollmentStatus: 'APPROVED_AWAITING_PAYMENT',
      paymentStatus: 'UNPAID',
      approvedFee: fee,
      amountPaid: 0,
      remainingBalance: fee,
      billingCycle: params.billingCycle,
      durationWeeks: weeks,
      allowDepositAccess: Boolean(params.allowDepositAccess && deposit > 0),
      depositAmount: deposit,
      feeSource: params.feeSource || 'ADMIN_APPROVED',
      adminNotes: params.adminNotes || '',
      approvedBy: adminUser?.uid || 'admin',
      approvedByName: adminUser?.displayName || adminUser?.email || 'Administrator',
      approvedAt: new Date().toISOString(),
      emailDeliveryStatus: 'FAILED',
      emailDeliveryError: 'Admission email service unavailable in local preview; use Retry Email in production.',
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      emailSent: false,
      emailError: 'Admission saved. Email dispatch requires Netlify Functions + Resend.',
      fallbackUsed: true,
    };
  }
}

export async function rejectProgrammeEnrollmentAsAdmin(params: {
  enrollmentId: string;
  rejectionReason?: string;
  adminNotes?: string;
}): Promise<void> {
  try {
    await billingPost('programme-enrollment-admin', {
      action: 'reject',
      ...params,
    });
  } catch {
    const adminUser = auth.currentUser;
    await updateDoc(doc(db, 'programme_enrollments', params.enrollmentId), {
      enrollmentStatus: 'REJECTED',
      rejectionReason: params.rejectionReason || 'Application not approved at this time.',
      adminNotes: params.adminNotes || '',
      approvedBy: adminUser?.uid || 'admin',
      approvedByName: adminUser?.displayName || adminUser?.email || 'Administrator',
      updatedAt: serverTimestamp(),
    });
  }
}

export async function retryProgrammeAdmissionEmail(enrollmentId: string): Promise<{
  emailSent: boolean;
  emailError?: string | null;
}> {
  const res = await billingPost<any>('programme-enrollment-admin', {
    action: 'retry_email',
    enrollmentId,
  });
  return {
    emailSent: Boolean(res?.emailSent || res?.emailDeliveryStatus === 'SENT'),
    emailError: res?.emailError || res?.emailDeliveryError || null,
  };
}

export async function fetchAllProgrammeEnrollmentsForAdmin(): Promise<ProgrammeEnrollmentRecord[]> {
  const q = query(collection(db, 'programme_enrollments'), orderBy('createdAt', 'desc'));
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) =>
      normalizeProgrammeEnrollmentDoc(d.id, d.data() as Record<string, any>)
    );
  } catch {
    const snap = await getDocs(collection(db, 'programme_enrollments'));
    return snap.docs.map((d) =>
      normalizeProgrammeEnrollmentDoc(d.id, d.data() as Record<string, any>)
    );
  }
}
