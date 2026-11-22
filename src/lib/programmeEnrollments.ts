import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { billingPost } from './billing';
import { dispatchActionableAlert } from './adminAlertDispatcher';

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

  // Notify platform admins (and school admin if school student) in-app + via email
  void dispatchActionableAlert({
    category: 'programme_application',
    categoryLabel: 'Student Programme Application',
    notificationType: 'registration',
    priority: 'high',
    title: `New Programme Application: ${params.programTitle}`,
    message: `${payload.studentName}${
      payload.schoolName ? ` (${payload.schoolName})` : ''
    } registered for ${params.programTitle} (${payload.deliveryOption}) and is awaiting admin approval.`,
    actionPath: '/admin/approvals?tab=programme_apps',
    schoolActionPath: '/portal/school',
    actionText: 'Review Application',
    schoolId: payload.schoolId,
    schoolName: payload.schoolName,
    notifyPlatformAdmins: true,
    details: [
      { label: 'Student', value: payload.studentName },
      { label: 'Programme', value: params.programTitle },
      { label: 'Account Type', value: params.studentRegistrationType === 'school' ? 'School Student (Self-Funded)' : 'Individual Student' },
      ...(payload.schoolName ? [{ label: 'School', value: payload.schoolName }] : []),
      { label: 'Delivery Mode', value: payload.deliveryOption },
    ],
    senderName: payload.studentName,
    senderRole: 'Student Application',
    replyTo: payload.studentEmail || undefined,
    dedupeKey: `prog_app_${docRef.id}`,
  });

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
  studentContext?: {
    studentUid?: string;
    studentDocId?: string;
    studentName?: string;
    studentEmail?: string;
    programId?: string;
    programTitle?: string;
    schoolId?: string | null;
    schoolName?: string | null;
  };
}): Promise<{
  success: boolean;
  emailSent: boolean;
  emailError?: string | null;
  fallbackUsed?: boolean;
}> {
  const { studentContext, ...apiPayload } = params;
  const fee = Math.max(0, Number(params.approvedFee) || 0);
  if (fee <= 0) {
    throw new Error('Please enter a valid tuition fee greater than ₦0 before approving.');
  }

  try {
    const res = await billingPost<any>('programme-enrollment-admin', {
      action: 'approve',
      ...apiPayload,
    });
    return {
      success: true,
      emailSent: Boolean(res?.emailSent || res?.emailDeliveryStatus === 'SENT'),
      emailError: res?.emailError || res?.emailDeliveryError || null,
    };
  } catch (serverErr: any) {
    // Only rethrow explicit client/permission validation failures from a live server
    const msg = String(serverErr?.message || '').toLowerCase();
    const isExplicitValidationOrAuth =
      msg.includes('permission') ||
      msg.includes('forbidden') ||
      msg.includes('unauthorized') ||
      msg.includes('not authorized') ||
      msg.includes('must be greater than') ||
      msg.includes('already active') ||
      msg.includes('valid fee');
    if (isExplicitValidationOrAuth) {
      throw serverErr;
    }

    // Resilient direct Firestore approval + student inbox notification + optional email fallback
    const adminUser = auth.currentUser;
    const deposit = params.allowDepositAccess
      ? Math.min(fee, Math.max(0, Number(params.depositAmount) || 0))
      : 0;
    const weeks =
      params.durationWeeks ||
      (params.billingCycle === 'termly' ? 12 : params.billingCycle === 'cohort' ? 8 : 4);

    let recordData: Record<string, any> = studentContext ? { ...studentContext } : {};
    if (!recordData.studentUid || !recordData.programTitle) {
      const snap = await getDoc(doc(db, 'programme_enrollments', params.enrollmentId)).catch(
        () => null
      );
      if (snap?.exists()) {
        recordData = { ...(snap.data() as Record<string, any>), ...recordData };
      }
    }

    const existingPaid = Math.max(0, Number(recordData.amountPaid) || 0);
    const remainingBalance = Math.max(0, fee - existingPaid);
    const nextStatus: ProgrammeEnrollmentStatus =
      remainingBalance <= 0 && existingPaid > 0
        ? 'ACTIVE'
        : existingPaid > 0
        ? 'PARTIALLY_PAID'
        : 'APPROVED_AWAITING_PAYMENT';

    await updateDoc(doc(db, 'programme_enrollments', params.enrollmentId), {
      enrollmentStatus: nextStatus,
      paymentStatus:
        remainingBalance <= 0 && existingPaid > 0
          ? 'PAID'
          : existingPaid > 0
          ? 'PARTIALLY_PAID'
          : 'UNPAID',
      approvedFee: fee,
      amountPaid: existingPaid,
      remainingBalance,
      billingCycle: params.billingCycle,
      durationWeeks: weeks,
      allowDepositAccess: Boolean(params.allowDepositAccess && deposit > 0),
      depositAmount: deposit,
      feeSource: params.feeSource || 'ADMIN_APPROVED',
      adminNotes: params.adminNotes || '',
      approvedBy: adminUser?.uid || 'admin',
      approvedByName: adminUser?.displayName || adminUser?.email || 'Administrator',
      approvedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });

    // Write deterministic in-app notification to student's inbox directing straight to Billing
    const studentUid = String(recordData.studentUid || '').trim();
    const studentDocId = String(recordData.studentDocId || '').trim();
    const programTitle = String(recordData.programTitle || 'your programme').trim();
    const billingLink = `/portal/student/payments?enrollmentId=${encodeURIComponent(
      params.enrollmentId
    )}`;
    const notifBody = {
      title: `Admission Approved: ${programTitle}`,
      message: `Your application for ${programTitle} has been approved (Tuition Fee: ₦${fee.toLocaleString()}). Click below to open your Billing section and complete payment to activate access.`,
      type: 'billing',
      subType: 'PROGRAMME_ADMISSION_APPROVED',
      priority: 'high',
      enrollmentId: params.enrollmentId,
      programId: String(recordData.programId || ''),
      link: billingLink,
      actionUrl: billingLink,
      linkText: 'Open Billing & Pay Now',
      actionText: 'Open Billing & Pay Now',
      senderName: adminUser?.displayName || 'Jaystarbliss Admissions',
      senderRole: 'Admissions Office',
      read: false,
      readBy: [],
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const notifWrites: Promise<unknown>[] = [];
    if (studentUid) {
      notifWrites.push(
        setDoc(
          doc(db, 'notifications', `prog_adm_${params.enrollmentId}`),
          {
            ...notifBody,
            userId: studentUid,
            recipientId: studentUid,
            targetUid: studentUid,
            recipientType: 'specific_user',
          },
          { merge: true }
        )
      );
    }
    if (studentDocId && studentDocId !== studentUid) {
      notifWrites.push(
        setDoc(
          doc(db, 'notifications', `prog_adm_${params.enrollmentId}_doc`),
          {
            ...notifBody,
            userId: studentDocId,
            recipientId: studentDocId,
            targetUid: studentUid || studentDocId,
            recipientType: 'specific_user',
          },
          { merge: true }
        )
      );
    }
    await Promise.allSettled(notifWrites);

    // Best-effort email dispatch if send-client-email is available and student has a deliverable email
    const studentEmail = String(recordData.studentEmail || '').trim().toLowerCase();
    const hasDeliverableEmail =
      Boolean(studentEmail) &&
      studentEmail.includes('@') &&
      !studentEmail.endsWith('.local');
    let emailSent = false;
    let emailError: string | null = hasDeliverableEmail
      ? 'Admission approved & student inbox notified. Email delivery runs when Resend backend is active.'
      : 'Admission approved & student inbox notified (student account has no external email address).';

    if (hasDeliverableEmail && adminUser) {
      try {
        const token = await adminUser.getIdToken();
        const emailRes = await fetch('/.netlify/functions/send-client-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'direct_email',
            to: studentEmail,
            recipientName: String(recordData.studentName || 'Student'),
            subject: `Admission Approved: ${programTitle} — Continue to Payment`,
            message: `Congratulations! Your application for ${programTitle} has been approved.\n\nApproved Tuition Fee: ₦${fee.toLocaleString()} (${params.billingCycle})\nOutstanding Balance: ₦${remainingBalance.toLocaleString()}${
              params.adminNotes ? `\n\nAdmissions Note: ${params.adminNotes}` : ''
            }\n\nOpen your Student Portal Billing & Fees section to complete payment and activate access immediately.`,
            actionUrl: `${window.location.origin}${billingLink}`,
            actionText: 'Open Billing & Pay Now',
          }),
        });
        const contentType = emailRes.headers.get('content-type') || '';
        if (emailRes.ok && contentType.includes('application/json')) {
          const emailJson = await emailRes.json().catch(() => null);
          if (emailJson?.success) {
            emailSent = true;
            emailError = null;
          }
        }
      } catch {
        // Silent in preview without Netlify functions
      }
    }

    await updateDoc(doc(db, 'programme_enrollments', params.enrollmentId), {
      emailDeliveryStatus: emailSent
        ? 'SENT'
        : hasDeliverableEmail
        ? 'FAILED'
        : 'SKIPPED_NO_EMAIL',
      emailDeliveryError: emailError,
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);

    return {
      success: true,
      emailSent,
      emailError,
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
  try {
    const res = await billingPost<any>('programme-enrollment-admin', {
      action: 'retry_email',
      enrollmentId,
    });
    return {
      emailSent: Boolean(res?.emailSent || res?.emailDeliveryStatus === 'SENT'),
      emailError: res?.emailError || res?.emailDeliveryError || null,
    };
  } catch (err: any) {
    const snap = await getDoc(doc(db, 'programme_enrollments', enrollmentId)).catch(() => null);
    if (!snap || !snap.exists()) {
      throw err;
    }
    const existing = snap.data() as Record<string, any>;
    const recipientEmail = String(existing.studentEmail || '').trim().toLowerCase();
    const hasDeliverableEmail =
      Boolean(recipientEmail) &&
      recipientEmail.includes('@') &&
      !recipientEmail.endsWith('.local') &&
      !recipientEmail.endsWith('.invalid');

    let emailSent = false;
    let emailError: string | null = hasDeliverableEmail
      ? null
      : 'Student does not have a personal email address on file.';

    if (hasDeliverableEmail) {
      try {
        const portalBillingUrl = `${window.location.origin}/portal/student/billing`;
        const emailRes = await fetch('/.netlify/functions/send-client-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipientEmail,
            subject: `Admission Approved: ${existing.programTitle || 'Programme'} — Jaystarbliss Studios`,
            title: `Congratulations! Your ${existing.programTitle || 'Programme'} Application is Approved`,
            recipientName: existing.studentName || 'Student',
            message: `Your application for ${existing.programTitle || 'your selected programme'} has been approved.\n\nApproved Tuition Fee: ₦${Number(existing.approvedFee || 0).toLocaleString()}\n\nPlease log in to your Student Portal Billing section to complete payment and unlock access: ${portalBillingUrl}`,
          }),
        });
        const emailPayload = await emailRes.json().catch(() => ({}));
        if (emailRes.ok && emailPayload?.sent !== false && !emailPayload?.fallback) {
          emailSent = true;
        } else {
          emailError =
            emailPayload?.error ||
            'Email delivery service is not active in this environment. The student still has their in-app notification.';
        }
      } catch (e: any) {
        emailError = e?.message || 'Unable to reach email service right now.';
      }
    }

    await updateDoc(doc(db, 'programme_enrollments', enrollmentId), {
      emailDeliveryStatus: emailSent
        ? 'SENT'
        : hasDeliverableEmail
        ? 'FAILED'
        : 'SKIPPED_NO_EMAIL',
      emailDeliveryError: emailError,
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);

    return { emailSent, emailError };
  }
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
