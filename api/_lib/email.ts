import { adminDb } from "./firebase-admin";

export const RESEND_CONFIG = {
  apiKey: process.env.RESEND_API_KEY || "",
  defaultFrom: process.env.EMAIL_FROM || "Jaystarbliss Studios <onboarding@resend.dev>",
  supportEmail: "jaystarblissstudios@gmail.com",
  brandName: "Jaystarbliss Studios",
  portalUrl: "https://jaystarblissstudios.com/portal",
  websiteUrl: "https://jaystarblissstudios.com",
  logoUrl: "https://jaystarblissstudios.com/logo.png"
};

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
}

export interface PortalNotification {
  recipientId: string;
  email?: string | null;
  title: string;
  message: string;
  type?: string;
  data?: Record<string, unknown>;
  actionUrl?: string;
  actionText?: string;
}

/**
 * Generates an email HTML template styled for Jaystarbliss Studios.
 */
export function buildBrandedEmailHtml(options: {
  title: string;
  previewText?: string;
  greeting?: string;
  messageLines: string[];
  highlightBox?: {
    title?: string;
    items: Array<{ label: string; value: string }>;
  };
  cta?: {
    text: string;
    url: string;
  };
  footerNote?: string;
}): string {
  const { title, previewText, greeting, messageLines, highlightBox, cta, footerNote } = options;

  const messagesHtml = messageLines
    .map(line => `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">${line}</p>`)
    .join("");

  let highlightHtml = "";
  if (highlightBox && highlightBox.items.length > 0) {
    const itemsHtml = highlightBox.items
      .map(
        item => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #64748b; width: 40%;">${item.label}</td>
          <td style="padding: 10px 12px; font-size: 14px; font-weight: 700; color: #0f172a; text-align: right;">${item.value}</td>
        </tr>`
      )
      .join("");

    highlightHtml = `
      <div style="margin: 24px 0; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
        ${highlightBox.title ? `<div style="background-color: #0f172a; color: #ffffff; padding: 10px 16px; font-size: 12px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">${highlightBox.title}</div>` : ""}
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>`;
  }

  let ctaHtml = "";
  if (cta && cta.url) {
    ctaHtml = `
      <div style="margin: 32px 0 24px 0; text-align: center;">
        <a href="${cta.url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #e11d48 0%, #be123c 100%); color: #ffffff; font-weight: 800; font-size: 14px; padding: 14px 28px; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(225, 29, 72, 0.25);">
          ${cta.text} &rarr;
        </a>
      </div>`;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <title>${title}</title>
  ${previewText ? `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>` : ""}
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #090d16 0%, #161f30 100%); padding: 28px 32px; text-align: left; border-bottom: 3px solid #e11d48;">
              <table border="0" cellspacing="0" cellpadding="0" style="width: 100%;">
                <tr>
                  <td style="vertical-align: middle; width: 48px; padding-right: 14px;">
                    <img src="${RESEND_CONFIG.logoUrl}" alt="Jaystarbliss Studios Logo" width="44" height="44" style="display: block; width: 44px; height: 44px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2);" />
                  </td>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 900; letter-spacing: 0.15em; color: #fb7185; text-transform: uppercase; margin-bottom: 4px;">
                      JAYSTARBLISS STUDIOS & ACADEMY
                    </div>
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">
                      ${title}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              ${greeting ? `<p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a;">${greeting}</p>` : ""}
              
              ${messagesHtml}
              ${highlightHtml}
              ${ctaHtml}

              ${footerNote ? `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; line-height: 1.5;">${footerNote}</div>` : ""}
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #475569;">
                Jaystarbliss Studios • Tech Education & Creative Innovation
              </p>
              <p style="margin: 0 0 12px 0; font-size: 11px; color: #94a3b8;">
                Lagos, Nigeria • Direct Phone / WhatsApp: +234 913 651 8194
              </p>
              <div style="margin: 8px 0;">
                <a href="${RESEND_CONFIG.websiteUrl}" style="color: #e11d48; text-decoration: none; font-size: 11px; font-weight: 700; margin: 0 8px;">Official Website</a>
                <span style="color: #cbd5e1;">•</span>
                <a href="${RESEND_CONFIG.portalUrl}" style="color: #e11d48; text-decoration: none; font-size: 11px; font-weight: 700; margin: 0 8px;">Student & School Portal</a>
                <span style="color: #cbd5e1;">•</span>
                <a href="mailto:${RESEND_CONFIG.supportEmail}" style="color: #e11d48; text-decoration: none; font-size: 11px; font-weight: 700; margin: 0 8px;">Support</a>
              </div>
              <p style="margin: 12px 0 0 0; font-size: 10px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} Jaystarbliss Studios. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Sends an email via the Resend API with anti-spam and deliverability headers.
 */
export async function sendResendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = RESEND_CONFIG.apiKey;
  const from = options.from || RESEND_CONFIG.defaultFrom;
  const to = Array.isArray(options.to) ? options.to : [options.to];

  if (!apiKey) {
    console.warn("[Resend] Missing RESEND_API_KEY. Email skipped.");
    return { success: false, error: "Missing RESEND_API_KEY" };
  }

  if (!to || to.length === 0 || !to[0]) {
    return { success: false, error: "No recipient email provided" };
  }

  try {
    const rawText = options.text || (options.html ? options.html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

    const payload: Record<string, unknown> = {
      from,
      to,
      subject: options.subject,
      text: rawText,
      reply_to: options.replyTo || RESEND_CONFIG.supportEmail,
      headers: {
        "X-Entity-Ref-ID": `tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        "X-Auto-Response-Suppress": "OOF, AutoReply",
        ...(options.headers || {})
      }
    };

    if (options.html) payload.html = options.html;
    if (options.cc) payload.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
    if (options.bcc) payload.bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc];

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.warn("[Resend] Email delivery failed:", data);
      return { success: false, error: data.message || "Resend API error" };
    }

    return { success: true, id: data.id };
  } catch (error: any) {
    console.error("[Resend] Network / API error:", error);
    return { success: false, error: error.message || "Failed to dispatch email" };
  }
}

/**
 * Creates an in-app portal notification and simultaneously dispatches an email via Resend if email is provided.
 */
export async function createPortalNotification(input: PortalNotification) {
  if (!input.recipientId) return;
  const now = new Date();
  
  try {
    await adminDb.collection("notifications").add({
      recipientId: input.recipientId,
      title: input.title,
      message: input.message,
      type: input.type || "SYSTEM",
      data: input.data || {},
      ...(input.actionUrl ? { link: input.actionUrl, actionUrl: input.actionUrl } : {}),
      ...(input.actionText ? { linkText: input.actionText, actionText: input.actionText } : {}),
      read: false,
      createdAt: now,
      timestamp: now
    });
  } catch (dbErr) {
    console.warn("[Notification DB] Failed to save in-app notification:", dbErr);
  }

  if (!input.email) return;

  const html = buildBrandedEmailHtml({
    title: input.title,
    previewText: input.message.slice(0, 100),
    greeting: "Hello,",
    messageLines: [input.message],
    cta: input.actionUrl
      ? {
          text: input.actionText || "Open Jaystarbliss Portal",
          url: input.actionUrl
        }
      : {
          text: "Open Student / Staff Portal",
          url: RESEND_CONFIG.portalUrl
        },
    footerNote: "This is an automated notification regarding your Jaystarbliss account and portal activities."
  });

  await sendResendEmail({
    to: input.email,
    subject: `[Jaystarbliss] ${input.title}`,
    html,
    text: input.message
  });
}

/**
 * Send auto-response confirmation to a client who submits an inquiry / contact form.
 */
export async function sendClientInquiryConfirmation(params: {
  clientName: string;
  clientEmail: string;
  subject: string;
  message: string;
  inquiryType?: string;
}) {
  const html = buildBrandedEmailHtml({
    title: "We Received Your Message",
    previewText: `Thank you for reaching out to Jaystarbliss Studios, ${params.clientName}.`,
    greeting: `Dear ${params.clientName || "Valued Client"},`,
    messageLines: [
      "Thank you for contacting Jaystarbliss Studios! We have received your inquiry and our academic & technical admissions team has been notified.",
      "A specialist will review your details and reach out to you within 24 hours to guide you through the next steps.",
      "Here is a summary of the details you submitted:"
    ],
    highlightBox: {
      title: "Inquiry Details",
      items: [
        { label: "Category", value: params.inquiryType || "General Inquiry" },
        { label: "Subject", value: params.subject || "Academic / Studio Inquiry" },
        { label: "Submission Date", value: new Date().toLocaleDateString("en-NG", { dateStyle: "long" }) },
        { label: "Status", value: "Received / Under Review" }
      ]
    },
    cta: {
      text: "Explore Our Learning Programs",
      url: `${RESEND_CONFIG.websiteUrl}/programs`
    },
    footerNote: "Need immediate assistance? You can chat with our admissions desk on WhatsApp at +234 913 651 8194."
  });

  return sendResendEmail({
    to: params.clientEmail,
    subject: `Thank you for reaching out to Jaystarbliss Studios [Ref: #${Date.now().toString().slice(-6)}]`,
    html,
    text: `Dear ${params.clientName},\n\nThank you for reaching out to Jaystarbliss Studios. We have received your message regarding "${params.subject}". Our team will review your request and get back to you within 24 hours.\n\nBest regards,\nJaystarbliss Studios Team`
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isDeliverableEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.endsWith(".local") || normalized.endsWith("@student.jaystarbliss.local")) return false;
  return EMAIL_REGEX.test(normalized);
}

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALERT_ADMIN_ROLES = new Set([
  "SUPER_ADMIN",
  "SUPERADMIN",
  "ADMIN",
  "ACADEMIC_ADMIN",
  "ACADEMIC_SUPPORT_ADMIN",
  "EDUCATION_ADMIN",
  "SUPPORT_ADMIN",
  "FINANCE_ADMIN",
  "DIRECTOR",
]);

const ALERT_SCHOOL_ADMIN_ROLES = new Set([
  "SCHOOL",
  "SCHOOL_ADMIN",
  "SCHOOLADMIN",
  "PARTNER_SCHOOL",
  "INSTITUTION",
]);

export async function resolveAdminAlertEmails(): Promise<string[]> {
  const emails = new Set<string>();
  if (isDeliverableEmail(RESEND_CONFIG.supportEmail)) {
    emails.add(RESEND_CONFIG.supportEmail.toLowerCase());
  }
  try {
    const [usersSnap, adminsSnap] = await Promise.all([
      adminDb.collection("users").limit(1000).get().catch(() => null),
      adminDb.collection("admins").limit(200).get().catch(() => null),
    ]);
    usersSnap?.docs.forEach((d) => {
      const data = d.data() || {};
      const role = String(data.role || "").trim().toUpperCase();
      const status = String(data.accountStatus || data.status || "ACTIVE").trim().toUpperCase();
      if (["DISABLED", "SUSPENDED", "BANNED"].includes(status)) return;
      if (ALERT_ADMIN_ROLES.has(role) || data.isAdmin === true || data.admin === true) {
        const em = String(data.email || "").trim().toLowerCase();
        if (isDeliverableEmail(em)) emails.add(em);
      }
    });
    adminsSnap?.docs.forEach((d) => {
      const data = d.data() || {};
      const em = String(data.email || "").trim().toLowerCase();
      if (isDeliverableEmail(em)) emails.add(em);
    });
  } catch (err) {
    console.warn("[Email] Could not resolve admin alert emails:", err);
  }
  return Array.from(emails);
}

export async function resolveSchoolAdminAlertEmails(schoolId?: string | null): Promise<string[]> {
  const cleanSchoolId = String(schoolId || "").trim();
  if (!cleanSchoolId) return [];
  const emails = new Set<string>();
  try {
    const [schoolDoc, usersBySchool, usersByLegacy] = await Promise.all([
      adminDb.collection("schools").doc(cleanSchoolId).get().catch(() => null),
      adminDb.collection("users").where("schoolId", "==", cleanSchoolId).limit(100).get().catch(() => null),
      adminDb.collection("users").where("schoolDocId", "==", cleanSchoolId).limit(100).get().catch(() => null),
    ]);
    if (schoolDoc?.exists) {
      const sData = schoolDoc.data() || {};
      for (const candidate of [sData.email, sData.contactEmail, sData.adminEmail]) {
        if (isDeliverableEmail(candidate)) emails.add(candidate.trim().toLowerCase());
      }
      const adminUid = String(sData.adminUid || sData.firebaseUid || sData.userId || "").trim();
      if (adminUid) {
        const uSnap = await adminDb.collection("users").doc(adminUid).get().catch(() => null);
        const uEmail = uSnap?.exists ? uSnap.data()?.email : null;
        if (isDeliverableEmail(uEmail)) emails.add(uEmail.trim().toLowerCase());
      }
    }
    for (const snap of [usersBySchool, usersByLegacy]) {
      snap?.docs.forEach((d) => {
        const data = d.data() || {};
        const role = String(data.role || "").trim().toUpperCase();
        if (!ALERT_SCHOOL_ADMIN_ROLES.has(role)) return;
        const status = String(data.accountStatus || data.status || "ACTIVE").trim().toUpperCase();
        if (["DISABLED", "SUSPENDED", "BANNED"].includes(status)) return;
        const em = String(data.email || "").trim().toLowerCase();
        if (isDeliverableEmail(em)) emails.add(em);
      });
    }
  } catch (err) {
    console.warn("[Email] Could not resolve school admin alert emails:", err);
  }
  return Array.from(emails);
}

export async function resolveUserEmailsByUids(uids: string[]): Promise<string[]> {
  const uniqueUids = Array.from(new Set(uids.map((u) => String(u || "").trim()).filter(Boolean))).slice(0, 40);
  if (!uniqueUids.length) return [];
  const emails = new Set<string>();
  await Promise.all(
    uniqueUids.map(async (uid) => {
      try {
        const snap = await adminDb.collection("users").doc(uid).get();
        if (snap.exists) {
          const data = snap.data() || {};
          if (isDeliverableEmail(data.email)) {
            emails.add(data.email.trim().toLowerCase());
          }
        }
      } catch {
        // Ignore individual lookup errors
      }
    })
  );
  return Array.from(emails);
}

/**
 * Send a branded actionable alert email to platform admins, school admins, and/or specific recipient UIDs.
 */
export async function sendActionableNotificationEmail(params: {
  title: string;
  message: string;
  category?: string;
  priority?: "normal" | "high" | "urgent";
  details?: Array<{ label: string; value: string }>;
  actionPath?: string;
  actionText?: string;
  notifyPlatformAdmins?: boolean;
  schoolId?: string | null;
  recipientUids?: string[];
  replyTo?: string;
}): Promise<{ success: boolean; recipients: string[]; error?: string }> {
  const recipientSet = new Set<string>();

  if (params.notifyPlatformAdmins !== false) {
    const adminEmails = await resolveAdminAlertEmails();
    adminEmails.forEach((em) => recipientSet.add(em));
  }
  if (params.schoolId) {
    const schoolEmails = await resolveSchoolAdminAlertEmails(params.schoolId);
    schoolEmails.forEach((em) => recipientSet.add(em));
  }
  if (Array.isArray(params.recipientUids) && params.recipientUids.length > 0) {
    const directEmails = await resolveUserEmailsByUids(params.recipientUids);
    directEmails.forEach((em) => recipientSet.add(em));
  }

  const recipients = Array.from(recipientSet);
  if (recipients.length === 0) {
    return { success: false, recipients: [], error: "No deliverable recipient emails resolved." };
  }

  const baseUrl = (process.env.PUBLIC_APP_URL || RESEND_CONFIG.websiteUrl).replace(/\/+$/, "");
  const cleanPath = params.actionPath
    ? params.actionPath.startsWith("http")
      ? params.actionPath
      : `${baseUrl}${params.actionPath.startsWith("/") ? params.actionPath : `/${params.actionPath}`}`
    : `${baseUrl}/portal`;

  const safeTitle = escapeEmailHtml(params.title);
  const safeMessage = escapeEmailHtml(params.message);
  const safeDetails = (params.details || [])
    .filter((item) => item && item.label && item.value)
    .slice(0, 10)
    .map((item) => ({
      label: escapeEmailHtml(item.label),
      value: escapeEmailHtml(item.value),
    }));

  const html = buildBrandedEmailHtml({
    title: safeTitle,
    previewText: safeMessage.slice(0, 140),
    greeting: "Hello,",
    messageLines: [safeMessage],
    highlightBox: safeDetails.length
      ? {
          title: escapeEmailHtml(params.category || "Actionable Notification Details"),
          items: safeDetails,
        }
      : undefined,
    cta: {
      text: escapeEmailHtml(params.actionText || "Open in Jaystarbliss Portal"),
      url: cleanPath,
    },
    footerNote:
      "You are receiving this email alert because an event in your Jaystarbliss Studios portal requires your attention or review.",
  });

  const prefix = params.priority === "urgent" ? "[Action Required] " : "[Jaystarbliss Alert] ";
  const result = await sendResendEmail({
    to: recipients,
    subject: `${prefix}${params.title}`.slice(0, 180),
    html,
    text: `${params.title}\n\n${params.message}\n\nOpen in Portal: ${cleanPath}`,
    replyTo: isDeliverableEmail(params.replyTo) ? params.replyTo : undefined,
  });

  return {
    success: result.success,
    recipients,
    error: result.error,
  };
}

/**
 * Send an email notification to studio admins when a client submits an inquiry or project request.
 */
export async function sendAdminInquiryAlert(params: {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  subject: string;
  message: string;
  inquiryType?: string;
}) {
  const adminEmails = await resolveAdminAlertEmails();
  const recipients = adminEmails.length ? adminEmails : [RESEND_CONFIG.supportEmail];

  const html = buildBrandedEmailHtml({
    title: `New Client Lead: ${escapeEmailHtml(params.inquiryType || "Website Inquiry")}`,
    previewText: `New message from ${escapeEmailHtml(params.clientName)} (${escapeEmailHtml(params.clientEmail)})`,
    greeting: "Hello Jaystarbliss Admin Team,",
    messageLines: [
      `A new inquiry has been submitted on the Jaystarbliss website by <strong>${escapeEmailHtml(params.clientName)}</strong>.`,
      `<em>"${escapeEmailHtml(params.message)}"</em>`
    ],
    highlightBox: {
      title: "Contact Info & Lead Data",
      items: [
        { label: "Client Name", value: escapeEmailHtml(params.clientName || "—") },
        { label: "Client Email", value: escapeEmailHtml(params.clientEmail || "—") },
        { label: "Phone / WhatsApp", value: escapeEmailHtml(params.clientPhone || "Not provided") },
        { label: "Inquiry Type", value: escapeEmailHtml(params.inquiryType || "General") },
        { label: "Subject", value: escapeEmailHtml(params.subject || "—") }
      ]
    },
    cta: {
      text: "Open Admin Inquiries Dashboard",
      url: `${RESEND_CONFIG.websiteUrl}/admin/inquiries`
    }
  });

  return sendResendEmail({
    to: recipients,
    subject: `[New Client Lead] ${params.clientName} - ${params.subject || params.inquiryType}`,
    html,
    replyTo: params.clientEmail
  });
}

/**
 * Send direct custom email to a client from the Admin Portal.
 */
export async function sendDirectClientEmail(params: {
  to: string;
  recipientName?: string;
  subject: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}) {
  const html = buildBrandedEmailHtml({
    title: params.subject,
    previewText: params.message.slice(0, 100),
    greeting: params.recipientName ? `Dear ${params.recipientName},` : "Hello,",
    messageLines: params.message.split("\n\n").filter(Boolean),
    cta: params.actionUrl
      ? {
          text: params.actionText || "View in Portal",
          url: params.actionUrl
        }
      : undefined,
    footerNote: "You are receiving this communication because you are a registered student, parent, school administrator, or client of Jaystarbliss Studios."
  });

  return sendResendEmail({
    to: params.to,
    subject: `[Jaystarbliss] ${params.subject}`,
    html,
    text: params.message
  });
}

/**
 * Builds a dedicated, beautifully styled HTML email for password resets.
 */
export function buildPasswordResetEmailHtml(options: {
  to: string;
  recipientName?: string;
  resetLink: string;
}): string {
  const { to, recipientName, resetLink } = options;
  const name = recipientName || "Member";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <title>Reset Your Jaystarbliss Account Password</title>
  <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    Reset your Jaystarbliss account password securely. This request was generated from the official portal.
  </div>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner with Official Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #090d16 0%, #161f30 100%); padding: 28px 32px; text-align: left; border-bottom: 3px solid #e11d48;">
              <table border="0" cellspacing="0" cellpadding="0" style="width: 100%;">
                <tr>
                  <td style="vertical-align: middle; width: 48px; padding-right: 14px;">
                    <img src="${RESEND_CONFIG.logoUrl}" alt="Jaystarbliss Studios Logo" width="46" height="46" style="display: block; width: 46px; height: 46px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2);" />
                  </td>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 900; letter-spacing: 0.15em; color: #fb7185; text-transform: uppercase; margin-bottom: 4px;">
                      JAYSTARBLISS STUDIOS & ACADEMY
                    </div>
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">
                      Account Password Reset
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                Hello ${name},
              </p>
              
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                We received a request to reset the password for your Jaystarbliss account associated with <strong style="color: #0f172a;">${to}</strong>.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Click the secure button below to choose your new password. This reset link is valid for 1 hour and can only be used once:
              </p>

              <!-- Primary Reset Password Action Button -->
              <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 32px auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 12px; background-color: #e11d48; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35);">
                    <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #e11d48; background-image: linear-gradient(135deg, #e11d48 0%, #be123c 100%); padding: 16px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 800; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.02em; text-align: center;">
                      Reset Your Password &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Information Breakdown -->
              <div style="margin: 28px 0; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
                <div style="background-color: #0f172a; color: #ffffff; padding: 10px 16px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">
                  Security Details
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                  <tbody>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b; width: 35%;">Account</td>
                      <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">${to}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b;">Link Validity</td>
                      <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #e11d48; text-align: right;">1 Hour (Single Use)</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b;">Source</td>
                      <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">Jaystarbliss Portal Authentication</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Fallback Direct URL Box -->
              <div style="margin: 20px 0; padding: 14px 16px; background-color: #f1f5f9; border-radius: 10px; border: 1px dashed #cbd5e1;">
                <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #475569;">
                  Having trouble clicking the button? Copy and paste this link into your browser:
                </p>
                <div style="font-family: monospace; font-size: 10px; color: #64748b; word-break: break-all; line-height: 1.4;">
                  ${resetLink}
                </div>
              </div>

              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; line-height: 1.5;">
                <strong style="color: #334155;">Didn't request this change?</strong> You can safely ignore this email. Your password will not be changed and your account remains completely secure.
              </div>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #475569;">
                Jaystarbliss Studios • Tech Education & Creative Innovation
              </p>
              <p style="margin: 0 0 12px 0; font-size: 11px; color: #94a3b8;">
                Lagos, Nigeria • Direct Phone / WhatsApp: +234 913 651 8194
              </p>
              <div style="margin: 8px 0;">
                <a href="${RESEND_CONFIG.websiteUrl}" style="color: #e11d48; text-decoration: none; font-size: 11px; font-weight: 700; margin: 0 8px;">Official Website</a>
                <span style="color: #cbd5e1;">•</span>
                <a href="${RESEND_CONFIG.portalUrl}" style="color: #e11d48; text-decoration: none; font-size: 11px; font-weight: 700; margin: 0 8px;">Student & School Portal</a>
                <span style="color: #cbd5e1;">•</span>
                <a href="mailto:${RESEND_CONFIG.supportEmail}" style="color: #e11d48; text-decoration: none; font-size: 11px; font-weight: 700; margin: 0 8px;">Support</a>
              </div>
              <p style="margin: 12px 0 0 0; font-size: 10px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} Jaystarbliss Studios. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends a password reset email via Resend with high inbox deliverability.
 */
export async function sendPasswordResetEmailResend(params: {
  to: string;
  resetLink: string;
  recipientName?: string;
}) {
  const html = buildPasswordResetEmailHtml({
    to: params.to,
    recipientName: params.recipientName,
    resetLink: params.resetLink
  });

  return sendResendEmail({
    to: params.to,
    subject: "Reset your Jaystarbliss account password",
    html,
    text: `Hello ${params.recipientName || "Member"},\n\nA password reset request was received for your Jaystarbliss account (${params.to}).\n\nTo reset your password, click the link below (valid for 1 hour):\n${params.resetLink}\n\nIf you did not make this request, you can safely ignore this email.\n\nJaystarbliss Studios\n${RESEND_CONFIG.websiteUrl}`
  });
}

/**
 * Sends a branded Programme Admission & Payment Approval email via Resend.
 */
export async function sendProgrammeAdmissionEmail(params: {
  to: string;
  studentName: string;
  programTitle: string;
  enrollmentId: string;
  approvedFee: number;
  remainingBalance: number;
  billingCycle: string;
  allowDepositAccess?: boolean;
  depositAmount?: number;
  currency?: string;
  adminNotes?: string;
}) {
  const baseUrl = (process.env.PUBLIC_APP_URL || RESEND_CONFIG.websiteUrl).replace(/\/+$/, "");
  const paymentUrl = `${baseUrl}/portal/student/payments?enrollmentId=${encodeURIComponent(
    params.enrollmentId
  )}`;
  const currencySymbol = (params.currency || "NGN") === "NGN" ? "₦" : `${params.currency} `;
  const feeDisplay = `${currencySymbol}${Number(params.approvedFee || 0).toLocaleString()}`;
  const balanceDisplay = `${currencySymbol}${Number(params.remainingBalance || 0).toLocaleString()}`;

  const highlightItems: Array<{ label: string; value: string }> = [
    { label: "Programme", value: params.programTitle },
    { label: "Approved Tuition Fee", value: feeDisplay },
    { label: "Billing Cycle", value: params.billingCycle || "Per Term / Cohort" },
    { label: "Outstanding Amount", value: balanceDisplay },
    { label: "Billing Responsibility", value: "Student Self-Funded" },
  ];

  if (params.allowDepositAccess && Number(params.depositAmount || 0) > 0) {
    highlightItems.push({
      label: "Minimum Deposit to Start",
      value: `${currencySymbol}${Number(params.depositAmount).toLocaleString()}`,
    });
  }

  const messageLines: string[] = [
    `Congratulations! Your application for <strong>${params.programTitle}</strong> at Jaystarbliss Studios has been approved by our admissions team.`,
    `To activate your programme access, please review your approved tuition terms below and complete your payment in the Student Portal.`,
  ];

  if (params.adminNotes && params.adminNotes.trim()) {
    messageLines.push(`<strong>Admissions Note:</strong> ${params.adminNotes.trim()}`);
  }

  const html = buildBrandedEmailHtml({
    title: `Admission Approved — ${params.programTitle}`,
    previewText: `Your application for ${params.programTitle} has been approved. Complete payment to activate access.`,
    greeting: `Hello ${params.studentName || "Learner"},`,
    messageLines,
    highlightBox: {
      title: "Approved Enrolment Summary",
      items: highlightItems,
    },
    cta: {
      text: "Continue to Payment",
      url: paymentUrl,
    },
    footerNote:
      "Need help with your enrolment or tuition schedule? Reply directly to this email or contact Jaystarbliss Studios support.",
  });

  const text = [
    `Hello ${params.studentName || "Learner"},`,
    ``,
    `Congratulations! Your application for ${params.programTitle} at Jaystarbliss Studios has been approved.`,
    `Approved Fee: ${feeDisplay} (${params.billingCycle})`,
    `Outstanding Balance: ${balanceDisplay}`,
    params.allowDepositAccess && Number(params.depositAmount || 0) > 0
      ? `Deposit Option: ${currencySymbol}${Number(params.depositAmount).toLocaleString()}`
      : ``,
    ``,
    `Continue to payment in the Student Portal:`,
    paymentUrl,
    ``,
    `Jaystarbliss Studios`,
    `${RESEND_CONFIG.websiteUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendResendEmail({
    to: params.to,
    subject: `Admission Approved: ${params.programTitle} — Continue to Payment`,
    html,
    text,
  });
}

export type SubscriptionReminderEmailStage = 'PRE_DUE_7D' | 'DUE_TODAY' | 'LOCKDOWN_ACTIVATED';
export type SubscriptionReminderAccountType =
  | 'SCHOOL'
  | 'PARENT'
  | 'INDIVIDUAL_STUDENT'
  | 'SCHOOL_STUDENT_LOCKDOWN'
  | 'PARENT_CHILD_LOCKDOWN';

/**
 * Sends branded subscription renewal, grace-period start, and lockdown emails via Resend.
 * Follows Jaystarbliss Studios V3 exact subject lines and Africa/Lagos date formatting.
 * Non-payer student notices (SCHOOL_STUDENT_LOCKDOWN / PARENT_CHILD_LOCKDOWN) never include
 * payer billing links or institutional/parent fee figures.
 */
export async function sendSubscriptionReminderEmail(params: {
  to: string;
  recipientName: string;
  accountType: SubscriptionReminderAccountType;
  stage: SubscriptionReminderEmailStage;
  accountLabel: string;
  planOrProgrammeName: string;
  childName?: string;
  amountDue: number;
  currency?: string;
  dueDateFormatted: string;
  graceEndsAtFormatted: string;
  billingPath: string;
}) {
  const isNonPayerStudentNotice =
    params.accountType === "SCHOOL_STUDENT_LOCKDOWN" ||
    params.accountType === "PARENT_CHILD_LOCKDOWN";

  const baseUrl = (process.env.PUBLIC_APP_URL || RESEND_CONFIG.websiteUrl).replace(/\/+$/, "");
  const cleanPath = params.billingPath.startsWith("/") ? params.billingPath : `/${params.billingPath}`;
  const billingUrl = `${baseUrl}${cleanPath}`;
  const currencySymbol = (params.currency || "NGN") === "NGN" ? "₦" : `${params.currency} `;
  const amountDisplay = `${currencySymbol}${Number(params.amountDue || 0).toLocaleString()}`;

  let subject = "";
  let title = "";
  let previewText = "";
  let ctaText = "Pay Now";
  let messageLines: string[] = [];

  if (params.accountType === "SCHOOL_STUDENT_LOCKDOWN") {
    subject = "Portal Access Temporarily Restricted — Contact Your School Administrator";
    title = "School Portal Access Temporarily Restricted";
    previewText = `School-sponsored access for ${params.accountLabel} is currently restricted. Please contact your school administrator.`;
    messageLines = [
      `Access to school-sponsored classes, assessments, and learning resources for <strong>${params.accountLabel}</strong> is temporarily restricted because the school&rsquo;s institutional subscription requires renewal.`,
      `Please contact your <strong>school administrator</strong> so they can complete the institutional renewal and restore full school access automatically.`,
      `You do not need to make a school tuition payment from your student account.`,
    ];
  } else if (params.accountType === "PARENT_CHILD_LOCKDOWN") {
    subject = "Programme Access Temporarily Restricted — Contact Your Parent or Guardian";
    title = "Programme Access Temporarily Restricted";
    previewText = `Access to ${params.planOrProgrammeName} is currently restricted. Please contact your parent or guardian.`;
    messageLines = [
      `Access to <strong>${params.planOrProgrammeName}</strong> is temporarily restricted because the programme subscription requires renewal.`,
      `Please let your <strong>parent or guardian</strong> know so they can renew the subscription from the Parent Portal and restore your access immediately.`,
    ];
  } else if (params.stage === "PRE_DUE_7D") {
    if (params.accountType === "SCHOOL") {
      subject = "Your Jaystarbliss Studios School Subscription Is Due for Renewal";
      title = "School Subscription Renewal Reminder (7 Days Notice)";
      previewText = `Your institutional subscription for ${params.accountLabel} is due on ${params.dueDateFormatted}.`;
      messageLines = [
        `This is a courtesy reminder that the institutional subscription for <strong>${params.accountLabel}</strong> (${params.planOrProgrammeName}) is due for renewal in <strong>7 days</strong> on <strong>${params.dueDateFormatted}</strong> (Africa/Lagos).`,
        `Renewing on or before your due date ensures uninterrupted portal access for your school administration team and all enrolled students.`,
      ];
      ctaText = "Renew School Subscription";
    } else if (params.accountType === "PARENT") {
      subject = "Reminder — Your Child's Jaystarbliss Programme Is Due for Renewal";
      title = "Child Programme Renewal Reminder (7 Days Notice)";
      previewText = `Renewal for ${params.childName || "your child"}'s programme is due on ${params.dueDateFormatted}.`;
      messageLines = [
        `This is a friendly reminder that <strong>${params.childName || "your child"}</strong>&rsquo;s enrolled programme (<strong>${params.planOrProgrammeName}</strong>) is due for renewal in <strong>7 days</strong> on <strong>${params.dueDateFormatted}</strong> (Africa/Lagos).`,
        `Please complete your renewal via the Parent Billing Center to keep lessons, schedules, and learning progress active without interruption.`,
      ];
      ctaText = "Open Parent Billing Center";
    } else {
      subject = "Your Jaystarbliss Programme Is Due for Renewal";
      title = "Programme Renewal Reminder (7 Days Notice)";
      previewText = `Your ${params.planOrProgrammeName} subscription is due on ${params.dueDateFormatted}.`;
      messageLines = [
        `This is a reminder that your Jaystarbliss Studios subscription for <strong>${params.planOrProgrammeName}</strong> is due for renewal in <strong>7 days</strong> on <strong>${params.dueDateFormatted}</strong> (Africa/Lagos).`,
        `Complete your renewal early to keep your live classes, assessments, and learning resources uninterrupted.`,
      ];
      ctaText = "Renew Programme Now";
    }
  } else if (params.stage === "DUE_TODAY") {
    if (params.accountType === "SCHOOL") {
      subject = "Action Required — School Subscription Due Today (7-Day Grace Period Started)";
      title = "School Subscription Due Today — 7-Day Grace Period Active";
      previewText = `Payment for ${params.accountLabel} is due today (${params.dueDateFormatted}). A 7-day grace period is now active.`;
      messageLines = [
        `The Jaystarbliss Studios subscription for <strong>${params.accountLabel}</strong> is due today (<strong>${params.dueDateFormatted}</strong>).`,
        `Your account has entered a <strong>7-day grace period</strong> ending on <strong>${params.graceEndsAtFormatted}</strong>. School and student access remains active during the grace window, after which restricted portal lockdown will apply automatically until payment is confirmed.`,
      ];
    } else if (params.accountType === "PARENT") {
      subject = "Action Required — Child Programme Payment Due Today (7-Day Grace Period)";
      title = "Programme Payment Due Today — 7-Day Grace Period Active";
      previewText = `Payment for ${params.childName || "your child"}'s programme is due today. Complete renewal within 7 days.`;
      messageLines = [
        `Payment for <strong>${params.childName || "your child"}</strong>&rsquo;s programme (<strong>${params.planOrProgrammeName}</strong>) is due today (<strong>${params.dueDateFormatted}</strong>).`,
        `A <strong>7-day grace period</strong> is now active through <strong>${params.graceEndsAtFormatted}</strong>. Please renew before the grace period expires to prevent portal restrictions on this programme.`,
      ];
    } else {
      subject = "Action Required — Your Jaystarbliss Programme Payment Is Due Today";
      title = "Payment Due Today — 7-Day Grace Period Active";
      previewText = `Your ${params.planOrProgrammeName} payment is due today. Complete payment within 7 days to avoid portal lockdown.`;
      messageLines = [
        `Your subscription payment for <strong>${params.planOrProgrammeName}</strong> is due today (<strong>${params.dueDateFormatted}</strong>).`,
        `A <strong>7-day grace period</strong> is now active until <strong>${params.graceEndsAtFormatted}</strong>. Please complete payment in your Billing Center to prevent access lockdown.`,
      ];
    }
  } else {
    // LOCKDOWN_ACTIVATED
    if (params.accountType === "SCHOOL") {
      subject = "Portal Access Restricted — School Subscription Payment Overdue";
      title = "School Portal Access Temporarily Restricted";
      previewText = `The 7-day grace period for ${params.accountLabel} has expired. Renew now to restore full school and student access.`;
      messageLines = [
        `The 7-day grace period for <strong>${params.accountLabel}</strong> expired on <strong>${params.graceEndsAtFormatted}</strong>, and institutional portal features have been restricted.`,
        `Your Billing Center and payment receipts remain accessible. As soon as payment is confirmed, full school and student portal access will restore automatically.`,
      ];
    } else if (params.accountType === "PARENT") {
      subject = "Portal Access Restricted — Child Programme Subscription Overdue";
      title = "Programme Access Temporarily Restricted";
      previewText = `The 7-day grace period for ${params.childName || "your child"}'s programme has expired. Complete payment to unlock immediately.`;
      messageLines = [
        `The 7-day grace period for <strong>${params.childName || "your child"}</strong>&rsquo;s programme (<strong>${params.planOrProgrammeName}</strong>) expired on <strong>${params.graceEndsAtFormatted}</strong>.`,
        `Learning features for this programme are temporarily restricted while your Billing Center remains open. Complete payment below to restore access immediately.`,
      ];
    } else {
      subject = "Portal Access Restricted — Your Jaystarbliss Subscription Is Overdue";
      title = "Student Portal Access Temporarily Restricted";
      previewText = `Your 7-day grace period for ${params.planOrProgrammeName} has expired. Complete payment to unlock your learning portal.`;
      messageLines = [
        `The 7-day grace period for your <strong>${params.planOrProgrammeName}</strong> subscription expired on <strong>${params.graceEndsAtFormatted}</strong>, and learning features are currently restricted.`,
        `Your Billing Center remains open. Complete your renewal payment now to restore immediate access to classes, assessments, and resources.`,
      ];
    }
  }

  const highlightItems: Array<{ label: string; value: string }> = isNonPayerStudentNotice
    ? [
        {
          label: params.accountType === "SCHOOL_STUDENT_LOCKDOWN" ? "School" : "Programme",
          value:
            params.accountType === "SCHOOL_STUDENT_LOCKDOWN"
              ? params.accountLabel
              : params.planOrProgrammeName,
        },
        { label: "Access Status", value: "Temporarily Restricted" },
        {
          label: "Next Step",
          value:
            params.accountType === "SCHOOL_STUDENT_LOCKDOWN"
              ? "Contact Your School Administrator"
              : "Contact Your Parent / Guardian",
        },
      ]
    : [
        { label: "Account", value: params.accountLabel },
        { label: "Programme / Plan", value: params.planOrProgrammeName },
        ...(params.childName ? [{ label: "Child / Learner", value: params.childName }] : []),
        { label: "Amount Due", value: amountDisplay },
        { label: "Due Date (WAT)", value: params.dueDateFormatted },
        { label: "7-Day Grace Deadline (WAT)", value: params.graceEndsAtFormatted },
      ];

  const html = buildBrandedEmailHtml({
    title,
    previewText,
    greeting: `Hello ${params.recipientName || "Valued Member"},`,
    messageLines,
    highlightBox: {
      title: isNonPayerStudentNotice ? "Portal Access Notice" : "Subscription Renewal Summary",
      items: highlightItems,
    },
    cta: isNonPayerStudentNotice
      ? undefined
      : {
          text: ctaText,
          url: billingUrl,
        },
    footerNote: isNonPayerStudentNotice
      ? "Once your school administrator or parent/guardian confirms renewal, your portal access will be restored automatically."
      : "All subscription dates follow West Africa Time (Africa/Lagos). If you have already completed payment via bank transfer, please reply with your receipt or contact Jaystarbliss Studios Finance Support.",
  });

  const text = isNonPayerStudentNotice
    ? [
        `Hello ${params.recipientName || "Learner"},`,
        ``,
        title,
        params.accountType === "SCHOOL_STUDENT_LOCKDOWN"
          ? `School: ${params.accountLabel}`
          : `Programme: ${params.planOrProgrammeName}`,
        params.accountType === "SCHOOL_STUDENT_LOCKDOWN"
          ? `Your school-sponsored portal access is temporarily restricted. Please contact your school administrator to restore institutional access.`
          : `Access to ${params.planOrProgrammeName} is temporarily restricted. Please contact your parent or guardian to renew the programme subscription.`,
        ``,
        `Jaystarbliss Studios`,
        `${RESEND_CONFIG.websiteUrl}`,
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Hello ${params.recipientName || "Valued Member"},`,
        ``,
        title,
        `Account: ${params.accountLabel}`,
        params.childName ? `Child: ${params.childName}` : ``,
        `Programme / Plan: ${params.planOrProgrammeName}`,
        `Amount Due: ${amountDisplay}`,
        `Due Date (Africa/Lagos): ${params.dueDateFormatted}`,
        `7-Day Grace Deadline (Africa/Lagos): ${params.graceEndsAtFormatted}`,
        ``,
        `${ctaText}: ${billingUrl}`,
        ``,
        `Jaystarbliss Studios`,
        `${RESEND_CONFIG.websiteUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

  return sendResendEmail({
    to: params.to,
    subject,
    html,
    text,
  });
}




