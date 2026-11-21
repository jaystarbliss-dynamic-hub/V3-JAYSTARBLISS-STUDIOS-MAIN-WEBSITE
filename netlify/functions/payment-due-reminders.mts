import type { Config } from '@netlify/functions';
import { adminDb } from '../../api/_lib/firebase-admin';
import {
  createPortalNotification,
  sendSubscriptionReminderEmail,
  type SubscriptionReminderAccountType,
} from '../../api/_lib/email';
import {
  type BillingSubscriptionRecord,
  buildReminderDocumentId,
  evaluateSubscriptionState,
  formatLagosDate,
  resolveScheduledReminderStage,
} from '../../api/_lib/subscription-core';
import { normalizeSubscriptionFromSource } from '../../api/_lib/subscription-service';
import {
  buildDefaultUserFacingMessage,
  getAutomaticPaymentReasonCode,
} from '../../api/_lib/restriction-core';

const asString = (v: unknown) => String(v ?? '').trim();
const MAX_RETRY_ATTEMPTS = 5;

interface ReminderCandidate {
  subscription: BillingSubscriptionRecord;
  recipientUid: string;
  recipientEmail: string;
  recipientName: string;
  emailAccountType: SubscriptionReminderAccountType;
  accountLabel: string;
  planOrProgrammeName: string;
  childName?: string;
  billingPath: string;
  hasCanonicalDoc: boolean;
}

function isRealEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return Boolean(e && e.includes('@') && !e.endsWith('.local') && !e.endsWith('.invalid'));
}

async function resolveMinorAwareEmail(params: {
  studentId?: string | null;
  accountId: string;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
}): Promise<{ email: string; name: string }> {
  const idsToCheck = [params.studentId, params.accountId].filter(Boolean) as string[];
  for (const id of idsToCheck) {
    for (const col of ['individualStudents', 'students', 'users']) {
      const snap = await adminDb.collection(col).doc(id).get().catch(() => null);
      if (!snap?.exists) continue;
      const d = snap.data() || {};
      const isMinor = Boolean(
        d.isMinor ||
          d.minor ||
          Number(d.age || 99) < 18 ||
          d.guardianEmail ||
          d.parentEmail
      );
      if (isMinor) {
        const guardianEmail = asString(d.guardianEmail || d.parentEmail || d.billingEmail);
        if (isRealEmail(guardianEmail)) {
          return {
            email: guardianEmail,
            name: asString(d.guardianName || d.parentName || params.fallbackName || 'Parent / Guardian'),
          };
        }
      }
      const ownEmail = asString(d.email);
      if (isRealEmail(ownEmail)) {
        return {
          email: ownEmail,
          name: asString(d.fullName || d.name || params.fallbackName || 'Learner'),
        };
      }
    }
  }
  return {
    email: asString(params.fallbackEmail),
    name: asString(params.fallbackName || 'Valued Member'),
  };
}

async function collectReminderCandidates(): Promise<ReminderCandidate[]> {
  const candidatesById = new Map<string, ReminderCandidate>();

  // 1. Canonical billingSubscriptions collection
  const canonicalSnap = await adminDb.collection('billingSubscriptions').limit(1000).get();
  for (const docSnap of canonicalSnap.docs) {
    const raw = { id: docSnap.id, ...(docSnap.data() || {}) } as Record<string, any>;
    const accountType = (asString(raw.accountType).toUpperCase() || 'INDIVIDUAL_STUDENT') as BillingSubscriptionRecord['accountType'];
    const sub = normalizeSubscriptionFromSource({
      id: docSnap.id,
      accountType,
      accountId: asString(raw.accountId || docSnap.id),
      accountName: asString(raw.accountName),
      recipientEmail: asString(raw.recipientEmail),
      schoolId: raw.schoolId || null,
      parentId: raw.parentId || null,
      studentId: raw.studentId || null,
      studentName: raw.studentName || null,
      programmeEnrollmentId: raw.programmeEnrollmentId || null,
      billingResponsibility: raw.billingResponsibility || 'STUDENT',
      canonicalDoc: raw,
    });

    if (accountType === 'SCHOOL') {
      const schoolId = asString(sub.schoolId || sub.accountId);
      const schoolSnap = schoolId ? await adminDb.collection('schools').doc(schoolId).get().catch(() => null) : null;
      const schoolData = schoolSnap?.exists ? schoolSnap.data() || {} : {};
      const recipientUid = asString(schoolData.adminUid || schoolData.userId || schoolId);
      const recipientEmail = asString(sub.recipientEmail || schoolData.contactEmail || schoolData.email);
      const schoolName = asString(sub.accountName || schoolData.schoolName || schoolData.name || 'Partner School');
      candidatesById.set(sub.id, {
        subscription: sub,
        recipientUid,
        recipientEmail,
        recipientName: asString(schoolData.coordinator || schoolName),
        emailAccountType: 'SCHOOL',
        accountLabel: schoolName,
        planOrProgrammeName: asString(sub.planName || sub.programmeName || 'Institutional Subscription'),
        billingPath: '/portal/school/payments',
        hasCanonicalDoc: true,
      });
    } else if (accountType === 'PARENT' || accountType === 'PARENT_CHILD') {
      const parentUid = asString(sub.parentId || sub.accountId);
      const parentSnap = parentUid ? await adminDb.collection('users').doc(parentUid).get().catch(() => null) : null;
      const parentData = parentSnap?.exists ? parentSnap.data() || {} : {};
      const recipientEmail = asString(sub.recipientEmail || parentData.email);
      const parentName = asString(parentData.fullName || parentData.name || sub.accountName || 'Parent / Guardian');
      candidatesById.set(sub.id, {
        subscription: sub,
        recipientUid: parentUid,
        recipientEmail,
        recipientName: parentName,
        emailAccountType: 'PARENT',
        accountLabel: parentName,
        planOrProgrammeName: asString(sub.programmeName || sub.planName || 'Enrolled Programme'),
        childName: asString(sub.studentName) || undefined,
        billingPath: sub.studentId
          ? `/portal/parent/payments?childId=${encodeURIComponent(sub.studentId)}`
          : '/portal/parent/payments',
        hasCanonicalDoc: true,
      });
    } else {
      // INDIVIDUAL_STUDENT or STUDENT_SELF_FUNDED_PROGRAMME
      const contact = await resolveMinorAwareEmail({
        studentId: sub.studentId,
        accountId: sub.accountId,
        fallbackEmail: sub.recipientEmail,
        fallbackName: sub.studentName || sub.accountName,
      });
      candidatesById.set(sub.id, {
        subscription: sub,
        recipientUid: sub.accountId,
        recipientEmail: contact.email,
        recipientName: contact.name,
        emailAccountType: 'INDIVIDUAL_STUDENT',
        accountLabel: asString(sub.studentName || sub.accountName || contact.name || 'Student'),
        planOrProgrammeName: asString(sub.programmeName || sub.planName || 'Jaystarbliss Programme'),
        billingPath: sub.programmeEnrollmentId
          ? `/portal/student/payments?enrollmentId=${encodeURIComponent(sub.programmeEnrollmentId)}`
          : '/portal/student/payments',
        hasCanonicalDoc: true,
      });
    }
  }

  // 2. Synthesize legacy Schools not yet in billingSubscriptions
  const schoolsSnap = await adminDb.collection('schools').limit(500).get();
  for (const sDoc of schoolsSnap.docs) {
    const subId = `school_${sDoc.id}`;
    if (candidatesById.has(subId)) continue;
    const s = sDoc.data() || {};
    if (!s.billing || !Number(s.billing.baseAmount || 0)) continue;
    const sub = normalizeSubscriptionFromSource({
      id: subId,
      accountType: 'SCHOOL',
      accountId: sDoc.id,
      accountName: asString(s.schoolName || s.name || 'Partner School'),
      recipientEmail: asString(s.contactEmail || s.email),
      schoolId: sDoc.id,
      billingResponsibility: 'SCHOOL',
      legacyBilling: s.billing,
      fallbackPlanName: asString(s.plan || 'Institutional Learning Partnership'),
    });
    candidatesById.set(subId, {
      subscription: sub,
      recipientUid: asString(s.adminUid || s.userId || sDoc.id),
      recipientEmail: asString(s.contactEmail || s.email),
      recipientName: asString(s.coordinator || s.schoolName || s.name || 'School Administrator'),
      emailAccountType: 'SCHOOL',
      accountLabel: asString(s.schoolName || s.name || 'Partner School'),
      planOrProgrammeName: asString(sub.planName || 'Institutional Learning Partnership'),
      billingPath: '/portal/school/payments',
      hasCanonicalDoc: false,
    });
  }

  // 3. Synthesize legacy Parent / Individual Student users with configured billing
  const usersSnap = await adminDb.collection('users').limit(1000).get();
  for (const uDoc of usersSnap.docs) {
    const u = uDoc.data() || {};
    const role = asString(u.role).toLowerCase();
    if (!['parent', 'student'].includes(role)) continue;
    if (!u.billing || !Number(u.billing.baseAmount || 0)) continue;
    if (role === 'student' && (u.schoolId || u.parentId)) continue; // School/parent-funded students are billed via school/parent

    const subId = role === 'parent' ? `parent_${uDoc.id}` : `student_${uDoc.id}`;
    if (candidatesById.has(subId)) continue;

    const sub = normalizeSubscriptionFromSource({
      id: subId,
      accountType: role === 'parent' ? 'PARENT' : 'INDIVIDUAL_STUDENT',
      accountId: uDoc.id,
      accountName: asString(u.fullName || u.name || u.email),
      recipientEmail: asString(u.email),
      parentId: role === 'parent' ? uDoc.id : null,
      studentId: role === 'student' ? asString(u.studentDocId || uDoc.id) : null,
      studentName: role === 'student' ? asString(u.fullName || u.name) : null,
      billingResponsibility: role === 'parent' ? 'PARENT' : 'STUDENT',
      legacyBilling: u.billing,
      fallbackPlanName: role === 'parent' ? 'Family Tuition Plan' : 'Student Learning Plan',
    });

    if (role === 'parent') {
      candidatesById.set(subId, {
        subscription: sub,
        recipientUid: uDoc.id,
        recipientEmail: asString(u.email),
        recipientName: asString(u.fullName || u.name || 'Parent / Guardian'),
        emailAccountType: 'PARENT',
        accountLabel: asString(u.fullName || u.name || 'Parent Account'),
        planOrProgrammeName: asString(sub.planName || 'Family Tuition Plan'),
        billingPath: '/portal/parent/payments',
        hasCanonicalDoc: false,
      });
    } else {
      const contact = await resolveMinorAwareEmail({
        studentId: asString(u.studentDocId || uDoc.id),
        accountId: uDoc.id,
        fallbackEmail: asString(u.email),
        fallbackName: asString(u.fullName || u.name),
      });
      candidatesById.set(subId, {
        subscription: sub,
        recipientUid: uDoc.id,
        recipientEmail: contact.email,
        recipientName: contact.name,
        emailAccountType: 'INDIVIDUAL_STUDENT',
        accountLabel: asString(u.fullName || u.name || contact.name),
        planOrProgrammeName: asString(sub.planName || 'Student Learning Plan'),
        billingPath: '/portal/student/payments',
        hasCanonicalDoc: false,
      });
    }
  }

  // 4. Synthesize self-funded programme_enrollments
  const enrollSnap = await adminDb
    .collection('programme_enrollments')
    .where('billingResponsibility', '==', 'STUDENT_SELF_FUNDED')
    .limit(500)
    .get();
  for (const eDoc of enrollSnap.docs) {
    const subId = `prog_enr_${eDoc.id}`;
    if (candidatesById.has(subId)) continue;
    const e = eDoc.data() || {};
    const statusNorm = asString(e.enrollmentStatus).toUpperCase();
    if (['REJECTED', 'CANCELLED', 'PENDING_ADMIN_REVIEW'].includes(statusNorm)) continue;
    const sub = normalizeSubscriptionFromSource({
      id: subId,
      accountType: 'STUDENT_SELF_FUNDED_PROGRAMME',
      accountId: asString(e.studentUid),
      accountName: asString(e.studentName),
      recipientEmail: asString(e.studentEmail),
      studentId: asString(e.studentDocId || e.studentUid),
      studentName: asString(e.studentName),
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
        planName: asString(e.programTitle || 'Programme'),
        allowDepositAccess: Boolean(e.allowDepositAccess),
        depositAmount: Number(e.depositAmount || 0),
      },
      fallbackPlanName: asString(e.programTitle || 'Programme'),
    });
    const contact = await resolveMinorAwareEmail({
      studentId: sub.studentId,
      accountId: sub.accountId,
      fallbackEmail: asString(e.studentEmail),
      fallbackName: asString(e.studentName),
    });
    candidatesById.set(subId, {
      subscription: sub,
      recipientUid: sub.accountId,
      recipientEmail: contact.email,
      recipientName: contact.name,
      emailAccountType: 'INDIVIDUAL_STUDENT',
      accountLabel: asString(e.studentName || contact.name),
      planOrProgrammeName: asString(e.programTitle || 'Programme'),
      billingPath: `/portal/student/payments?enrollmentId=${encodeURIComponent(eDoc.id)}`,
      hasCanonicalDoc: false,
    });
  }

  return Array.from(candidatesById.values());
}

async function dispatchDependentStudentLockdownNotices(params: {
  candidate: ReminderCandidate;
  dueDateIso: string;
  dueDateFormatted: string;
  graceEndsAtIso: string | null;
  graceEndsAtFormatted: string;
  nowIso: string;
}): Promise<number> {
  const { candidate, dueDateIso, dueDateFormatted, graceEndsAtIso, graceEndsAtFormatted, nowIso } = params;
  const sub = candidate.subscription;
  const dueDateKey = dueDateIso.slice(0, 10);
  let dispatched = 0;

  if (sub.accountType === 'SCHOOL') {
    const schoolId = asString(sub.schoolId || sub.accountId);
    if (!schoolId) return 0;

    const [indSnap, stuSnap] = await Promise.all([
      adminDb.collection('individualStudents').where('schoolId', '==', schoolId).limit(400).get().catch(() => null),
      adminDb.collection('students').where('schoolId', '==', schoolId).limit(400).get().catch(() => null),
    ]);

    const seenKeys = new Set<string>();
    const studentTargets: Array<{ key: string; uid: string; name: string; email: string }> = [];

    for (const snap of [indSnap, stuSnap]) {
      if (!snap) continue;
      for (const docSnap of snap.docs) {
        const d = docSnap.data() || {};
        const uid = asString(d.firebaseUid || d.userId || docSnap.id);
        const key = uid || docSnap.id;
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        studentTargets.push({
          key,
          uid,
          name: asString(d.fullName || d.studentName || d.name || 'Student'),
          email: asString(d.email),
        });
      }
    }

    for (const target of studentTargets) {
      const remId = `student_lock_${sub.id}_${dueDateKey}_${target.key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const remRef = adminDb.collection('subscriptionReminders').doc(remId);
      const existing = await remRef.get().catch(() => null);
      if (existing?.exists && asString(existing.data()?.status).toUpperCase() === 'SENT') continue;

      let emailError: string | null = null;
      let emailMessageId: string | null = null;

      try {
        if (target.uid) {
          await createPortalNotification({
            recipientId: target.uid,
            title: 'School Portal Access Temporarily Restricted',
            message: `Access to school-sponsored classes and assessments for ${candidate.accountLabel} is temporarily restricted. Please contact your school administrator to restore institutional access.`,
            type: 'SUBSCRIPTION_LOCKDOWN',
            data: {
              subscriptionId: sub.id,
              stage: 'LOCKDOWN_ACTIVATED',
              accountType: 'SCHOOL_STUDENT_LOCKDOWN',
              schoolId,
              dueDateIso,
              graceEndsAtIso,
            },
          });
        }

        if (isRealEmail(target.email)) {
          const emailRes = await sendSubscriptionReminderEmail({
            to: target.email,
            recipientName: target.name,
            accountType: 'SCHOOL_STUDENT_LOCKDOWN',
            stage: 'LOCKDOWN_ACTIVATED',
            accountLabel: candidate.accountLabel,
            planOrProgrammeName: candidate.planOrProgrammeName,
            amountDue: 0,
            currency: sub.currency || 'NGN',
            dueDateFormatted,
            graceEndsAtFormatted,
            billingPath: '',
          });
          if (!emailRes?.success && !emailRes?.id) {
            emailError = asString((emailRes as any)?.error || 'Student lockdown email delivery failed.');
          } else {
            emailMessageId = asString((emailRes as any)?.id || (emailRes as any)?.data?.id) || null;
          }
        }
      } catch (err: any) {
        emailError = err?.message || 'Unexpected school-student lockdown notice error.';
      }

      await remRef.set(
        {
          id: remId,
          subscriptionId: sub.id,
          accountType: 'SCHOOL_STUDENT_LOCKDOWN',
          accountId: target.key,
          accountName: target.name,
          schoolId,
          recipientUid: target.uid || null,
          recipientEmail: isRealEmail(target.email) ? target.email : null,
          reminderType: 'LOCKDOWN_ACTIVATED',
          dueDateIso,
          dueDateFormatted,
          graceEndsAtIso,
          graceEndsAtFormatted,
          status: emailError && isRealEmail(target.email) ? 'FAILED' : 'SENT',
          lastError: emailError,
          emailMessageId,
          sentAt: nowIso,
          lastAttemptAt: nowIso,
          timezone: 'Africa/Lagos',
        },
        { merge: true }
      );
      dispatched += 1;
    }
  } else if (sub.accountType === 'PARENT' || sub.accountType === 'PARENT_CHILD') {
    const parentUid = asString(sub.parentId || sub.accountId);
    const childTargets: Array<{ key: string; uid: string; name: string }> = [];
    const seenKeys = new Set<string>();

    const addChild = (docId: string, d: Record<string, any>) => {
      const uid = asString(d.firebaseUid || d.userId || docId);
      const key = uid || docId;
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      childTargets.push({
        key,
        uid,
        name: asString(d.fullName || d.studentName || d.name || candidate.childName || 'Learner'),
      });
    };

    if (sub.studentId) {
      for (const col of ['individualStudents', 'students']) {
        const snap = await adminDb.collection(col).doc(sub.studentId).get().catch(() => null);
        if (snap?.exists) {
          addChild(snap.id, snap.data() || {});
          break;
        }
      }
      if (childTargets.length === 0) {
        addChild(sub.studentId, { firebaseUid: sub.studentId, fullName: candidate.childName || 'Learner' });
      }
    } else if (parentUid) {
      const [indSnap, stuSnap] = await Promise.all([
        adminDb.collection('individualStudents').where('parentId', '==', parentUid).limit(50).get().catch(() => null),
        adminDb.collection('students').where('parentId', '==', parentUid).limit(50).get().catch(() => null),
      ]);
      for (const snap of [indSnap, stuSnap]) {
        if (!snap) continue;
        for (const docSnap of snap.docs) {
          addChild(docSnap.id, docSnap.data() || {});
        }
      }
    }

    for (const target of childTargets) {
      const remId = `child_lock_${sub.id}_${dueDateKey}_${target.key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const remRef = adminDb.collection('subscriptionReminders').doc(remId);
      const existing = await remRef.get().catch(() => null);
      if (existing?.exists && asString(existing.data()?.status).toUpperCase() === 'SENT') continue;

      if (target.uid) {
        await createPortalNotification({
          recipientId: target.uid,
          title: 'Programme Access Temporarily Restricted',
          message: `Access to ${candidate.planOrProgrammeName} is temporarily restricted. Please contact your parent or guardian so they can renew the programme subscription.`,
          type: 'SUBSCRIPTION_LOCKDOWN',
          data: {
            subscriptionId: sub.id,
            stage: 'LOCKDOWN_ACTIVATED',
            accountType: 'PARENT_CHILD_LOCKDOWN',
            parentId: parentUid || null,
            dueDateIso,
            graceEndsAtIso,
          },
        });
      }

      await remRef.set(
        {
          id: remId,
          subscriptionId: sub.id,
          accountType: 'PARENT_CHILD_LOCKDOWN',
          accountId: target.key,
          accountName: target.name,
          parentId: parentUid || null,
          recipientUid: target.uid || null,
          recipientEmail: null,
          reminderType: 'LOCKDOWN_ACTIVATED',
          dueDateIso,
          dueDateFormatted,
          graceEndsAtIso,
          graceEndsAtFormatted,
          status: 'SENT',
          lastError: null,
          emailMessageId: null,
          sentAt: nowIso,
          lastAttemptAt: nowIso,
          timezone: 'Africa/Lagos',
        },
        { merge: true }
      );
      dispatched += 1;
    }
  }

  return dispatched;
}

export default async () => {
  const now = new Date();
  const candidates = await collectReminderCandidates();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let dependentNotices = 0;

  for (const candidate of candidates) {
    const evalState = evaluateSubscriptionState({
      subscription: candidate.subscription,
      now,
    });

    // Skip exempt, cancelled, already-current, or incomplete billing accounts
    if (evalState.isExempt || evalState.status === 'CANCELLED' || evalState.billingConfigIncomplete) {
      skipped += 1;
      continue;
    }

    const stage = resolveScheduledReminderStage({
      subscription: candidate.subscription,
      now,
    });

    if (!stage || !evalState.dueDateIso) {
      skipped += 1;
      continue;
    }

    const reminderDocId = buildReminderDocumentId({
      subscriptionId: candidate.subscription.id,
      dueDateIso: evalState.dueDateIso,
      reminderType: stage,
    });

    const reminderRef = adminDb.collection('subscriptionReminders').doc(reminderDocId);
    const existingSnap = await reminderRef.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : null;

    // Idempotency: already successfully sent for this billing cycle + stage
    if (existing && asString(existing.status).toUpperCase() === 'SENT') {
      skipped += 1;
      continue;
    }

    // Retry cap for failed deliveries
    const priorRetries = Number(existing?.retryCount || 0);
    if (existing && priorRetries >= MAX_RETRY_ATTEMPTS) {
      skipped += 1;
      continue;
    }

    const dueDateFormatted = evalState.dueDateFormatted || formatLagosDate(evalState.dueDateIso) || 'Upcoming';
    const graceEndsAtFormatted =
      evalState.graceEndsAtFormatted || formatLagosDate(evalState.graceEndsAtIso) || '7 days after due date';

    let deliveryError: string | null = null;
    let emailMessageId: string | null = null;

    try {
      if (isRealEmail(candidate.recipientEmail)) {
        const res = await sendSubscriptionReminderEmail({
          to: candidate.recipientEmail,
          recipientName: candidate.recipientName,
          accountType: candidate.emailAccountType,
          stage,
          accountLabel: candidate.accountLabel,
          planOrProgrammeName: candidate.planOrProgrammeName,
          childName: candidate.childName,
          amountDue: evalState.amountDue,
          currency: candidate.subscription.currency || 'NGN',
          dueDateFormatted,
          graceEndsAtFormatted,
          billingPath: candidate.billingPath,
        });
        if (!res?.success && !res?.id) {
          deliveryError = asString((res as any)?.error || 'Email delivery returned unsuccessful status.');
        } else {
          emailMessageId = asString((res as any)?.id || (res as any)?.data?.id) || null;
        }
      } else {
        deliveryError = 'No valid deliverable recipient email configured.';
      }

      // Always post in-app portal notification for the account holder
      if (candidate.recipientUid) {
        const notifTitle =
          stage === 'PRE_DUE_7D'
            ? 'Subscription Renewal Due in 7 Days'
            : stage === 'DUE_TODAY'
            ? 'Subscription Payment Due Today — 7-Day Grace Period Active'
            : 'Portal Access Restricted — Subscription Overdue';
        const notifBody =
          stage === 'PRE_DUE_7D'
            ? `${candidate.planOrProgrammeName} (₦${evalState.amountDue.toLocaleString()}) is due on ${dueDateFormatted} (Africa/Lagos).`
            : stage === 'DUE_TODAY'
            ? `${candidate.planOrProgrammeName} (₦${evalState.amountDue.toLocaleString()}) is due today. Complete payment within the 7-day grace period (by ${graceEndsAtFormatted}) to prevent portal lockdown.`
            : `The 7-day grace period for ${candidate.planOrProgrammeName} has expired. Complete payment of ₦${evalState.amountDue.toLocaleString()} in your Billing Center to restore access immediately.`;

        await createPortalNotification({
          recipientId: candidate.recipientUid,
          title: notifTitle,
          message: notifBody,
          type:
            stage === 'LOCKDOWN_ACTIVATED'
              ? 'SUBSCRIPTION_LOCKDOWN'
              : 'PAYMENT_DUE_REMINDER',
          data: {
            subscriptionId: candidate.subscription.id,
            stage,
            dueDateIso: evalState.dueDateIso,
            graceEndsAtIso: evalState.graceEndsAtIso,
            amountDue: evalState.amountDue,
            billingPath: candidate.billingPath,
          },
        });
      }
    } catch (err: any) {
      deliveryError = err?.message || 'Unexpected reminder dispatch error.';
    }

    const nowIso = now.toISOString();
    const recordPayload: Record<string, any> = {
      id: reminderDocId,
      subscriptionId: candidate.subscription.id,
      accountType: candidate.subscription.accountType,
      accountId: candidate.subscription.accountId,
      accountName: candidate.accountLabel,
      childName: candidate.childName || null,
      planOrProgrammeName: candidate.planOrProgrammeName,
      recipientUid: candidate.recipientUid || null,
      recipientEmail: candidate.recipientEmail || null,
      reminderType: stage,
      dueDateIso: evalState.dueDateIso,
      dueDateFormatted,
      graceEndsAtIso: evalState.graceEndsAtIso,
      graceEndsAtFormatted,
      amountDue: evalState.amountDue,
      currency: candidate.subscription.currency || 'NGN',
      status: deliveryError ? 'FAILED' : 'SENT',
      retryCount: deliveryError ? priorRetries + 1 : priorRetries,
      lastError: deliveryError,
      emailMessageId,
      sentAt: deliveryError ? existing?.sentAt || null : nowIso,
      lastAttemptAt: nowIso,
      timezone: 'Africa/Lagos',
    };

    await reminderRef.set(recordPayload, { merge: true });

    if (stage === 'LOCKDOWN_ACTIVATED') {
      const autoReasonCode = getAutomaticPaymentReasonCode(candidate.subscription.accountType);
      const dueKey = String(evalState.dueDateIso || nowIso).slice(0, 10).replace(/[^0-9-]/g, '');
      const autoRestrictionId = `auto_pay_${candidate.subscription.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}_${dueKey}`;
      const autoRestrictionRef = adminDb.collection('accountRestrictions').doc(autoRestrictionId);
      const existingAuto = await autoRestrictionRef.get().catch(() => null);
      if (!existingAuto?.exists) {
        await autoRestrictionRef
          .set({
            restrictionId: autoRestrictionId,
            targetAccountId: candidate.subscription.accountId,
            targetAccountType: candidate.subscription.accountType,
            accountName: candidate.accountLabel,
            schoolId: candidate.subscription.schoolId || null,
            parentId: candidate.subscription.parentId || null,
            studentId: candidate.subscription.studentId || null,
            programmeEnrollmentId: candidate.subscription.programmeEnrollmentId || null,
            affectedStudentIds: candidate.subscription.studentId ? [candidate.subscription.studentId] : [],
            affectedProgrammeIds: candidate.subscription.programmeId ? [candidate.subscription.programmeId] : [],
            restrictionType: 'AUTOMATED_PAYMENT_LOCKDOWN',
            reasonCode: autoReasonCode,
            customReason: null,
            userFacingMessage: buildDefaultUserFacingMessage(autoReasonCode, candidate.subscription.accountType),
            internalAdminNote: `Automated 7-day post-grace lockdown activated for overdue subscription ${candidate.subscription.id}.`,
            restrictedScope:
              candidate.subscription.accountType === 'SCHOOL'
                ? 'INSTITUTION'
                : candidate.subscription.accountType === 'STUDENT_SELF_FUNDED_PROGRAMME'
                ? 'PROGRAMME'
                : 'ACCOUNT',
            cascadesToLinkedLearners:
              candidate.subscription.accountType === 'SCHOOL' || candidate.subscription.accountType === 'PARENT',
            appliedByUid: 'system_billing_guardrail',
            appliedByName: 'Automated Billing Guardrail',
            appliedAt: nowIso,
            effectiveAt: nowIso,
            expiresAt: null,
            status: 'ACTIVE',
            relatedSubscriptionId: candidate.subscription.id,
            notificationEventId: reminderDocId,
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          .catch(() => undefined);

        await adminDb
          .collection('restrictionAuditLogs')
          .add({
            action: 'AUTOMATED_PAYMENT_LOCKDOWN_ACTIVATED',
            restrictionId: autoRestrictionId,
            targetAccountId: candidate.subscription.accountId,
            targetAccountType: candidate.subscription.accountType,
            relatedSubscriptionId: candidate.subscription.id,
            reasonCode: autoReasonCode,
            restrictionType: 'AUTOMATED_PAYMENT_LOCKDOWN',
            actorUid: 'system_billing_guardrail',
            actorName: 'Automated Billing Guardrail',
            createdAt: nowIso,
          })
          .catch(() => undefined);
      }

      dependentNotices += await dispatchDependentStudentLockdownNotices({
        candidate,
        dueDateIso: evalState.dueDateIso,
        dueDateFormatted,
        graceEndsAtIso: evalState.graceEndsAtIso,
        graceEndsAtFormatted,
        nowIso,
      }).catch(() => 0);
    }

    if (!deliveryError) {
      sent += 1;
      if (candidate.hasCanonicalDoc) {
        const subPatch: Record<string, any> = {
          lastReminderSentAt: nowIso,
          updatedAt: nowIso,
        };
        if (stage === 'LOCKDOWN_ACTIVATED') {
          subPatch.lockdownActivatedAt = candidate.subscription.lockdownActivatedAt || nowIso;
          subPatch.lockReasonCode = getAutomaticPaymentReasonCode(candidate.subscription.accountType);
          subPatch.restrictionType = 'AUTOMATED_PAYMENT_LOCKDOWN';
          subPatch.status = 'LOCKED';
        } else if (stage === 'DUE_TODAY') {
          subPatch.status = 'GRACE_PERIOD';
        } else if (stage === 'PRE_DUE_7D') {
          subPatch.status = 'DUE_SOON';
        }
        await adminDb.collection('billingSubscriptions').doc(candidate.subscription.id).set(subPatch, { merge: true });
      }
    } else {
      failed += 1;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      checked: candidates.length,
      sent,
      skipped,
      failed,
      dependentNotices,
      executedAt: now.toISOString(),
      timezone: 'Africa/Lagos',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

// 07:00 UTC = 08:00 Africa/Lagos (WAT, UTC+1) daily
export const config: Config = { schedule: '0 7 * * *' };
