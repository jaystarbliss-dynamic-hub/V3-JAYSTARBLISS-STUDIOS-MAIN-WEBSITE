import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { 
  sendResendEmail, 
  buildBrandedEmailHtml, 
  sendClientInquiryConfirmation, 
  sendAdminInquiryAlert,
  sendDirectClientEmail,
  sendPasswordResetEmailResend,
  sendActionableNotificationEmail,
  RESEND_CONFIG 
} from '../../api/_lib/email';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

const getBearer = (event: any) => {
  const value = event.headers?.authorization || event.headers?.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};

const clean = (val: unknown, max = 2000) => String(val ?? '').trim().slice(0, max);
const adminRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'FINANCE_ADMIN', 'EDUCATION_ADMIN']);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = clean(body.action || 'inquiry_confirmation', 60);

    // 1. PUBLIC ACTION: INQUIRY AUTO-RESPONDER & ADMIN ALERT
    if (action === 'inquiry_confirmation' || action === 'contact_form') {
      const clientName = clean(body.name || body.clientName, 120);
      const clientEmail = clean(body.email || body.clientEmail, 160).toLowerCase();
      const clientPhone = clean(body.phone || body.clientPhone, 40);
      const subject = clean(body.subject || body.inquirySubject || 'General Inquiry', 200);
      const message = clean(body.message, 2500);
      const inquiryType = clean(body.type || body.inquiryType || 'General Inquiry', 100);

      if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        return json(400, { error: 'A valid client email address is required.' });
      }

      // Send client auto-responder acknowledgement
      const clientResult = await sendClientInquiryConfirmation({
        clientName: clientName || 'Valued Client',
        clientEmail,
        subject,
        message,
        inquiryType
      });

      // Send admin team alert
      const adminResult = await sendAdminInquiryAlert({
        clientName: clientName || 'Anonymous Visitor',
        clientEmail,
        clientPhone: clientPhone || undefined,
        subject,
        message,
        inquiryType
      });

      // In-app lead alerts are targeted to administrator UIDs, never broadcast.
      try {
        const userSnap = await adminDb.collection('users').limit(1000).get();
        const adminSet = new Set(['admin', 'super_admin', 'superadmin']);
        const admins = userSnap.docs.filter(d => adminSet.has(String(d.data().role || '').trim().toLowerCase()));
        const batch = adminDb.batch();
        for (const admin of admins) {
          const ref = adminDb.collection('notifications').doc();
          batch.set(ref, {
            recipientId: admin.id,
            recipientType: 'specific_user',
            type: 'client_inquiry',
            priority: 'normal',
            title: 'New client inquiry',
            message: (clientName || 'A new client') + ' submitted a ' + inquiryType + ' inquiry.',
            targetName: clientName || 'Anonymous Visitor',
            clientEmail,
            link: '/admin/inquiries',
            actionUrl: '/admin/inquiries',
            linkText: 'Open Inquiries & Leads',
            actionText: 'Open Inquiries & Leads',
            data: { subject, phone: clientPhone || null, messagePreview: message.slice(0, 240) },
            readBy: [],
            read: false,
            timestamp: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            senderName: 'Jaystarbliss Central',
            senderRole: 'System'
          });
        }
        if (admins.length) await batch.commit();
      } catch (notificationError) {
        console.warn('Admin inquiry notification could not be saved:', notificationError);
      }

      return json(200, {
        success: true,
        clientEmailDelivered: clientResult.success,
        adminAlertDelivered: adminResult.success,
        clientId: clientResult.id || null
      });
    }

    // 1B. ACTIONABLE NOTIFICATION EMAIL DISPATCH (ADMINS, SCHOOL ADMINS, TUTORS)
    if (action === 'admin_attention_alert') {
      const PUBLIC_ALLOWED_CATEGORIES = new Set([
        'inquiry',
        'tutor_application',
        'student_request',
        'school_partnership',
      ]);
      const category = clean(body.category || 'system', 60).toLowerCase();
      const bearer = getBearer(event);
      let decoded: any = null;
      if (bearer) {
        decoded = await adminAuth.verifyIdToken(bearer).catch(() => null);
      }

      // Unauthenticated requests may only trigger bounded public intake alerts to admins
      if (!decoded && !PUBLIC_ALLOWED_CATEGORIES.has(category)) {
        return json(401, { error: 'Authentication required for this notification dispatch.' });
      }

      const title = clean(body.title, 180);
      const message = clean(body.message, 1500);
      if (!title || !message) {
        return json(400, { error: 'Notification title and message are required.' });
      }

      const priorityRaw = clean(body.priority || 'high', 20).toLowerCase();
      const priority: 'normal' | 'high' | 'urgent' =
        priorityRaw === 'urgent' ? 'urgent' : priorityRaw === 'normal' ? 'normal' : 'high';
      const actionPath = clean(body.actionPath || '/admin/approvals', 300);
      const actionText = clean(body.actionText || 'Review in Portal', 80);
      const schoolId = decoded ? clean(body.schoolId, 120) : '';
      const notifyPlatformAdmins = body.notifyPlatformAdmins !== false;
      const recipientUids =
        decoded && Array.isArray(body.recipientUids)
          ? body.recipientUids.map((u: unknown) => clean(u, 128)).filter(Boolean).slice(0, 25)
          : [];
      const details = Array.isArray(body.details)
        ? body.details
            .slice(0, 8)
            .map((item: any) => ({
              label: clean(item?.label, 80),
              value: clean(item?.value, 240),
            }))
            .filter((item: { label: string; value: string }) => item.label && item.value)
        : [];
      const replyTo = clean(body.replyTo || decoded?.email || '', 160);

      // Persist school-admin & direct in-app notifications server-side if requested
      if (body.persistInApp !== false) {
        try {
          const batch = adminDb.batch();
          const now = FieldValue.serverTimestamp();
          const baseNotif = {
            type: clean(body.notificationType || category || 'system', 60),
            priority,
            title,
            message,
            link: actionPath,
            actionUrl: actionPath,
            linkText: actionText,
            actionText,
            schoolId: schoolId || null,
            readBy: [],
            read: false,
            timestamp: now,
            createdAt: now,
            senderName: clean(body.senderName || 'Jaystarbliss Portal', 100),
            senderRole: clean(body.senderRole || 'System', 60),
          };

          const dedupeKey = clean(body.dedupeKey, 120).replace(/[^a-zA-Z0-9_-]/g, '');
          let writes = 0;

          if (notifyPlatformAdmins) {
            const adminRef = dedupeKey
              ? adminDb.collection('notifications').doc(`adm_${dedupeKey}`)
              : adminDb.collection('notifications').doc();
            batch.set(
              adminRef,
              {
                ...baseNotif,
                recipientId: 'all',
                recipientType: 'all',
                targetRole: 'admin',
              },
              { merge: true }
            );
            writes++;
          }

          if (schoolId) {
            const schoolRef = dedupeKey
              ? adminDb.collection('notifications').doc(`sch_${schoolId}_${dedupeKey}`)
              : adminDb.collection('notifications').doc();
            batch.set(
              schoolRef,
              {
                ...baseNotif,
                recipientId: `school_${schoolId}`,
                recipientType: 'school_admin',
                targetRole: 'school',
                link: clean(body.schoolActionPath || actionPath, 300),
                actionUrl: clean(body.schoolActionPath || actionPath, 300),
              },
              { merge: true }
            );
            writes++;
          }

          for (const uid of recipientUids) {
            const uRef = dedupeKey
              ? adminDb.collection('notifications').doc(`usr_${uid}_${dedupeKey}`)
              : adminDb.collection('notifications').doc();
            batch.set(
              uRef,
              {
                ...baseNotif,
                recipientId: uid,
                recipientType: 'specific_user',
                targetUid: uid,
              },
              { merge: true }
            );
            writes++;
          }

          if (writes > 0) await batch.commit();
        } catch (dbErr) {
          console.warn('In-app notification persistence warning:', dbErr);
        }
      }

      const emailResult = await sendActionableNotificationEmail({
        title,
        message,
        category: clean(body.categoryLabel || category, 80),
        priority,
        details,
        actionPath,
        actionText,
        notifyPlatformAdmins,
        schoolId: schoolId || null,
        recipientUids,
        replyTo: replyTo || undefined,
      });

      return json(200, {
        success: true,
        emailDelivered: emailResult.success,
        recipientCount: emailResult.recipients.length,
        emailError: emailResult.error || null,
      });
    }

    // 2. PUBLIC / PORTAL ACTION: PASSWORD RESET VIA RESEND
    if (action === 'password_reset') {
      const email = clean(body.email || body.to || body.identifier, 160).toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(400, { error: 'A valid email address is required for password recovery.' });
      }

      let userRecord: any = null;
      try {
        userRecord = await adminAuth.getUserByEmail(email);
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          return json(200, {
            success: true,
            message: 'If an account exists with this email address, a password reset link has been dispatched.'
          });
        }
      }

      let recipientName = userRecord?.displayName || clean(body.recipientName || body.name, 120);
      if (!recipientName && userRecord?.uid) {
        try {
          const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
          if (userDoc.exists) {
            const data = userDoc.data() || {};
            recipientName = data.name || data.fullName || data.contactName || '';
          }
        } catch {}
      }

      const actionCodeSettings = {
        url: `${RESEND_CONFIG.portalUrl}`,
        handleCodeInApp: false
      };

      const resetLink = await adminAuth.generatePasswordResetLink(email, actionCodeSettings);
      const emailResult = await sendPasswordResetEmailResend({
        to: email,
        resetLink,
        recipientName: recipientName || undefined
      });

      if (!emailResult.success) {
        return json(502, { error: emailResult.error || 'Failed to deliver password reset email via Resend.' });
      }

      return json(200, {
        success: true,
        message: `Password reset link successfully sent to ${email} via Resend.`,
        id: emailResult.id
      });
    }

    // 3. AUTHENTICATED ADMIN ACTIONS (TEST EMAIL & DIRECT CLIENT EMAIL)
    const bearer = getBearer(event);
    if (!bearer) {
      return json(401, { error: 'Authentication required for administrative email operations.' });
    }

    const decoded = await adminAuth.verifyIdToken(bearer);
    const actorDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const actorRole = String(actorDoc.data()?.role || '').toUpperCase();

    if (!adminRoles.has(actorRole)) {
      return json(403, { error: 'Only administrative personnel can dispatch direct emails or tests.' });
    }

    // Action: Test Email Dispatch
    if (action === 'test_email') {
      const targetEmail = clean(body.to || decoded.email, 160).toLowerCase();
      if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
        return json(400, { error: 'Please provide a valid recipient email address for testing.' });
      }

      const html = buildBrandedEmailHtml({
        title: 'Resend Email Service Test Successful',
        previewText: 'Your Jaystarbliss Studios Resend email integration is working perfectly.',
        greeting: `Hello ${actorDoc.data()?.name || decoded.email || 'Admin'},`,
        messageLines: [
          'Congratulations! Your Resend email integration with Jaystarbliss Studios has been verified and is fully operational.',
          'All future transactional emails, including admission confirmations, payment receipts, tuition reminders, and inquiry responses, will be automatically delivered through this high-deliverability channel.'
        ],
        highlightBox: {
          title: 'Resend Configuration Diagnostics',
          items: [
            { label: 'Sender Identity', value: RESEND_CONFIG.defaultFrom },
            { label: 'Test Recipient', value: targetEmail },
            { label: 'Timestamp', value: new Date().toLocaleString('en-NG') },
            { label: 'API Status', value: 'Active & Verified' }
          ]
        },
        cta: {
          text: 'Open Admin Management Portal',
          url: `${RESEND_CONFIG.portalUrl}/admin`
        },
        footerNote: 'This test was triggered by an authenticated administrator from the Jaystarbliss Admin Settings panel.'
      });

      const result = await sendResendEmail({
        to: targetEmail,
        subject: '✅ [Jaystarbliss] Resend Email Integration Verified',
        html,
        text: 'Your Jaystarbliss Studios Resend email integration is functioning properly.'
      });

      if (!result.success) {
        return json(502, { error: result.error || 'Failed to deliver test email via Resend.' });
      }

      return json(200, {
        success: true,
        message: `Test email successfully dispatched to ${targetEmail}. Check your inbox or spam folder!`,
        id: result.id
      });
    }

    // Action: Direct Email to Client / Parent / Tutor / School
    if (action === 'direct_email') {
      const to = clean(body.to, 160).toLowerCase();
      const recipientName = clean(body.recipientName || body.name, 120);
      const subject = clean(body.subject, 200);
      const message = clean(body.message, 5000);
      const actionUrl = clean(body.actionUrl, 300);
      const actionText = clean(body.actionText, 80);

      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return json(400, { error: 'A valid recipient email is required.' });
      }

      if (!subject || !message) {
        return json(400, { error: 'Subject and message body are required.' });
      }

      const result = await sendDirectClientEmail({
        to,
        recipientName: recipientName || undefined,
        subject,
        message,
        actionUrl: actionUrl || undefined,
        actionText: actionText || undefined
      });

      if (!result.success) {
        return json(502, { error: result.error || 'Failed to dispatch direct email.' });
      }

      // Log communication in activityLogs
      await adminDb.collection('activityLogs').add({
        type: 'email_dispatched',
        action: 'DIRECT_CLIENT_EMAIL',
        actorId: decoded.uid,
        actorEmail: decoded.email,
        recipientEmail: to,
        subject,
        timestamp: new Date(),
        resendMessageId: result.id || null
      });

      return json(200, {
        success: true,
        message: `Email successfully sent to ${to}`,
        id: result.id
      });
    }

    return json(400, { error: `Unsupported action: ${action}` });
  } catch (error: any) {
    console.error('send-client-email handler error:', error);
    return json(500, { error: error?.message || 'Internal server error while processing email request.' });
  }
};
