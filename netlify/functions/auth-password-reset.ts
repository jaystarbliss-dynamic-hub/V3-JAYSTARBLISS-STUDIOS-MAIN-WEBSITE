import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb, hasAdminAuth, hasAdminDb } from '../../api/_lib/firebase-admin';
import { sendPasswordResetEmailResend, RESEND_CONFIG } from '../../api/_lib/email';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...corsHeaders
  },
  body: JSON.stringify(body)
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const rawEmail = String(body.email || body.identifier || '').trim().toLowerCase();

    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return json(400, { error: 'Please provide a valid email address.' });
    }

    if (!hasAdminAuth()) {
      return json(200, { fallback: true });
    }

    let userRecord: any = null;
    try {
      userRecord = await adminAuth.getUserByEmail(rawEmail);
    } catch (authErr: any) {
      if (authErr?.code === 'auth/user-not-found') {
        console.warn(`[Password Reset] User not found for email: ${rawEmail}`);
        // Return success message to prevent user enumeration
        return json(200, {
          success: true,
          message: 'If an account exists with this email address, a password reset link has been dispatched to your inbox.'
        });
      }
      console.warn('[Password Reset] Firebase Auth lookup error:', authErr);
    }

    // Try to get recipient display name
    let recipientName = userRecord?.displayName || '';
    if (!recipientName && userRecord?.uid) {
      try {
        const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
        if (userDoc.exists) {
          const data = userDoc.data() || {};
          recipientName = data.name || data.fullName || data.contactName || '';
        }
      } catch (dbErr) {
        console.warn('[Password Reset] Firestore profile lookup error:', dbErr);
      }
    }

    // Generate Firebase Password Reset Link
    const actionCodeSettings = {
      url: `${RESEND_CONFIG.portalUrl}`,
      handleCodeInApp: false
    };

    let resetLink = '';
    try {
      resetLink = await adminAuth.generatePasswordResetLink(rawEmail, actionCodeSettings);
    } catch (linkErr: any) {
      console.error('[Password Reset] Failed to generate password reset link:', linkErr);
      return json(500, {
        error: linkErr?.message || 'Unable to generate password recovery link at this time.'
      });
    }

    // Send the link through Resend using the branded template
    const emailResult = await sendPasswordResetEmailResend({
      to: rawEmail,
      resetLink,
      recipientName: recipientName || undefined
    });

    if (!emailResult.success) {
      console.warn('[Password Reset] Resend delivery returned false:', emailResult.error);
      return json(502, {
        error: emailResult.error || 'Failed to dispatch email via Resend email service.',
        linkGenerated: true
      });
    }

    return json(200, {
      success: true,
      message: 'Password reset link successfully sent to your email address via Resend.',
      deliveryId: emailResult.id
    });
  } catch (error: any) {
    console.error('[Password Reset] Unexpected error:', error);
    return json(500, {
      error: error?.message || 'Internal server error while processing password reset.'
    });
  }
};
