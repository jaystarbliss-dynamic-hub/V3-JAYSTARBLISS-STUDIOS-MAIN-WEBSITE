import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface ActionableAlertInput {
  category:
    | 'inquiry'
    | 'tutor_application'
    | 'student_request'
    | 'enrollment_request'
    | 'programme_application'
    | 'support_ticket'
    | 'school_partnership'
    | 'exam_submitted'
    | 'exam_deadline_summary'
    | 'system';
  categoryLabel?: string;
  notificationType?: string;
  priority?: 'normal' | 'high' | 'urgent';
  title: string;
  message: string;
  actionPath: string;
  schoolActionPath?: string;
  actionText?: string;
  schoolId?: string | null;
  schoolName?: string | null;
  notifyPlatformAdmins?: boolean;
  recipientUids?: string[];
  details?: Array<{ label: string; value: string }>;
  senderName?: string;
  senderRole?: string;
  replyTo?: string;
  dedupeKey?: string;
}

/**
 * Persists in-app notifications in Firestore (for immediate visibility across Admin,
 * School Admin, and Tutor inboxes) and fires the Resend email alert endpoint in the
 * background so admins/school admins receive email alerts in production without
 * blocking UI actions in local preview.
 */
export async function dispatchActionableAlert(input: ActionableAlertInput): Promise<void> {
  const cleanKey = input.dedupeKey ? input.dedupeKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96) : '';
  const notifyAdmins = input.notifyPlatformAdmins !== false;
  const schoolId = String(input.schoolId || '').trim();
  const recipientUids = Array.from(
    new Set((input.recipientUids || []).map((u) => String(u || '').trim()).filter(Boolean))
  );

  const basePayload = {
    type: input.notificationType || input.category || 'system',
    priority: input.priority || 'high',
    title: input.title,
    message: input.message,
    link: input.actionPath,
    actionUrl: input.actionPath,
    linkText: input.actionText || 'Review in Portal',
    actionText: input.actionText || 'Review in Portal',
    schoolId: schoolId || null,
    schoolName: input.schoolName || null,
    read: false,
    readBy: [],
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
    senderName: input.senderName || 'Jaystarbliss Portal',
    senderRole: input.senderRole || 'System',
  };

  // 1. Write in-app notifications directly when authenticated (rules allow authenticated creates)
  if (auth.currentUser) {
    const writeOps: Promise<unknown>[] = [];

    if (notifyAdmins) {
      const payload = {
        ...basePayload,
        recipientId: 'all',
        recipientType: 'all',
        targetRole: 'admin',
      };
      writeOps.push(
        cleanKey
          ? setDoc(doc(db, 'notifications', `adm_${cleanKey}`), payload, { merge: true })
          : addDoc(collection(db, 'notifications'), payload)
      );
    }

    if (schoolId) {
      const schoolLink = input.schoolActionPath || input.actionPath;
      const payload = {
        ...basePayload,
        recipientId: `school_${schoolId}`,
        recipientType: 'school_admin',
        targetRole: 'school',
        link: schoolLink,
        actionUrl: schoolLink,
      };
      writeOps.push(
        cleanKey
          ? setDoc(doc(db, 'notifications', `sch_${schoolId}_${cleanKey}`), payload, { merge: true })
          : addDoc(collection(db, 'notifications'), payload)
      );
    }

    for (const uid of recipientUids) {
      const payload = {
        ...basePayload,
        recipientId: uid,
        recipientType: 'specific_user',
        targetUid: uid,
      };
      writeOps.push(
        cleanKey
          ? setDoc(doc(db, 'notifications', `usr_${uid}_${cleanKey}`), payload, { merge: true })
          : addDoc(collection(db, 'notifications'), payload)
      );
    }

    await Promise.allSettled(writeOps);
  }

  // 2. Dispatch Resend email alert via Netlify function (best-effort, non-blocking)
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken().catch(() => '');
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    await fetch('/.netlify/functions/send-client-email', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'admin_attention_alert',
        category: input.category,
        categoryLabel: input.categoryLabel || input.category,
        notificationType: input.notificationType || input.category,
        priority: input.priority || 'high',
        title: input.title,
        message: input.message,
        actionPath: input.actionPath,
        schoolActionPath: input.schoolActionPath,
        actionText: input.actionText || 'Review in Portal',
        schoolId: schoolId || null,
        notifyPlatformAdmins: notifyAdmins,
        recipientUids,
        details: input.details || [],
        senderName: input.senderName,
        senderRole: input.senderRole,
        replyTo: input.replyTo,
        dedupeKey: cleanKey || undefined,
        // If unauthenticated (e.g., public tutor/inquiry form), ask server to persist in-app too
        persistInApp: !auth.currentUser,
      }),
    });
  } catch {
    // Graceful no-op in local Vite preview where Netlify functions are not mounted
  }
}
