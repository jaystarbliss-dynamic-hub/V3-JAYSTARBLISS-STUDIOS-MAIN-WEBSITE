/**
 * Centralised User-Friendly Error Handling & Diagnostic Logging
 * 
 * Ensures users NEVER see raw technical errors (e.g., FirebaseError, HTTP 500,
 * auth/network-request-failed, net::ERR_NAME_NOT_RESOLVED, or unhandled stack traces).
 * Maps recognized system error codes and HTTP responses into calm, helpful,
 * actionable messages while logging sanitized technical diagnostics internally.
 */

export interface ErrorClassification {
  category: 
    | 'network'
    | 'authentication'
    | 'permission'
    | 'not_found'
    | 'conflict'
    | 'validation'
    | 'server'
    | 'rate_limit'
    | 'upload'
    | 'unknown';
  userMessage: string;
  code?: string;
  statusCode?: number;
  recoverable: boolean;
}

/**
 * Strips sensitive data (passwords, tokens, keys) before logging internally.
 */
function sanitizeContext(context: Record<string, any> = {}): Record<string, any> {
  const SENSITIVE_KEYS = [
    'password',
    'code',
    'passcode',
    'accesscode',
    'token',
    'customtoken',
    'idtoken',
    'secret',
    'key',
    'authorization',
  ];

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(context)) {
    if (SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk))) {
      sanitized[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      sanitized[k] = sanitizeContext(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Classifies an error and returns both a friendly user-facing message
 * and technical classification details.
 */
export function classifyError(error: unknown, fallbackMessage?: string): ErrorClassification {
  if (!error) {
    return {
      category: 'unknown',
      userMessage: fallbackMessage || 'An unexpected problem occurred. Please try again.',
      recoverable: true,
    };
  }

  let rawCode = String(
    (error as any)?.code || (error as any)?.statusCode || (error as any)?.status || ''
  ).toLowerCase().trim();

  const rawMessage = String(
    (error as any)?.message || (typeof error === 'string' ? error : '')
  ).toLowerCase();

  if (!rawCode) {
    const authMatch = rawMessage.match(/auth\/[a-z0-9-]+/);
    if (authMatch) {
      rawCode = authMatch[0];
    } else if (rawMessage.includes('permission-denied') || rawMessage.includes('permission_denied')) {
      rawCode = 'permission-denied';
    } else if (rawMessage.includes('unauthenticated')) {
      rawCode = 'unauthenticated';
    } else if (rawMessage.includes('not-found') || rawMessage.includes('not_found')) {
      rawCode = 'not-found';
    }
  }

  const name = String((error as any)?.name || '').toLowerCase();

  // 1. Internet & Connectivity Failures
  if (
    rawCode === 'auth/network-request-failed' ||
    rawCode === 'unavailable' ||
    rawMessage.includes('failed to fetch') ||
    rawMessage.includes('network error') ||
    rawMessage.includes('net::err_') ||
    rawMessage.includes('networkrequestfailed') ||
    rawMessage.includes('offline') ||
    rawMessage.includes('load resource') ||
    name.includes('network')
  ) {
    return {
      category: 'network',
      code: rawCode || 'NETWORK_ERROR',
      userMessage: 'Unable to connect. Please check your internet connection and try again.',
      recoverable: true,
    };
  }

  // 2. Authentication: Expired Sessions & Tokens
  if (
    rawCode === 'auth/id-token-expired' ||
    rawCode === 'auth/session-cookie-expired' ||
    rawCode === 'auth/user-token-expired' ||
    rawMessage.includes('session has expired') ||
    rawMessage.includes('token expired') ||
    rawMessage.includes('please sign in again') ||
    rawMessage.includes('jwt expired')
  ) {
    return {
      category: 'authentication',
      code: rawCode || 'SESSION_EXPIRED',
      userMessage: 'Your session has expired. Please sign in again to continue.',
      recoverable: true,
    };
  }

  // 3. Authentication: Credentials, Passwords & Access Codes
  if (
    rawCode === 'auth/invalid-credential' ||
    rawCode === 'auth/invalid-login-credentials' ||
    rawCode === 'auth/wrong-password' ||
    rawCode === 'auth/user-not-found' ||
    rawCode === 'auth/invalid-email' ||
    rawCode === 'auth/invalid-password' ||
    rawCode === 'auth/missing-password' ||
    rawMessage.includes('invalid-credential') ||
    rawMessage.includes('invalid-login-credentials') ||
    rawMessage.includes('invalid_login_credentials') ||
    rawMessage.includes('wrong password') ||
    rawMessage.includes('invalid credentials') ||
    rawMessage.includes('invalid access code') ||
    rawMessage.includes('incorrect access code') ||
    rawMessage.includes('no student record found') ||
    rawMessage.includes('enter your student username')
  ) {
    return {
      category: 'authentication',
      code: rawCode || 'INVALID_CREDENTIALS',
      userMessage: 'The username or password is incorrect. Check your details and try again.',
      recoverable: true,
    };
  }

  // 4. Authentication: Account Disabled or Blocked
  if (
    rawCode === 'auth/user-disabled' ||
    rawMessage.includes('account is suspended') ||
    rawMessage.includes('account is disabled') ||
    rawMessage.includes('account is not active') ||
    rawMessage.includes('suspended or disabled')
  ) {
    return {
      category: 'authentication',
      code: rawCode || 'ACCOUNT_DISABLED',
      userMessage: 'This account is currently disabled or suspended. Please contact your administrator.',
      recoverable: false,
    };
  }

  // 5. Authentication: Email in use
  if (
    rawCode === 'auth/email-already-in-use' ||
    rawMessage.includes('email already in use') ||
    rawMessage.includes('email-already-in-use')
  ) {
    return {
      category: 'conflict',
      code: rawCode || 'EMAIL_IN_USE',
      userMessage: 'An account with this email address already exists. Please sign in or use a different email.',
      recoverable: true,
    };
  }

  // 6. Rate Limiting
  if (
    rawCode === 'auth/too-many-requests' ||
    rawCode === 'resource-exhausted' ||
    rawCode === '429' ||
    rawMessage.includes('too-many-requests') ||
    rawMessage.includes('rate limit')
  ) {
    return {
      category: 'rate_limit',
      code: rawCode || 'RATE_LIMITED',
      userMessage: 'Too many requests. Please wait a moment before trying again.',
      recoverable: true,
    };
  }

  // 7a. Portal Role / Profile Registration Mismatch
  if (
    rawMessage.includes('not registered as an affiliated school administrator') ||
    rawMessage.includes('not registered as a school administrator') ||
    rawMessage.includes('not registered as staff') ||
    rawMessage.includes('no active portal profile was found')
  ) {
    const originalMsg = String((error as any)?.message || (typeof error === 'string' ? error : '')).trim();
    return {
      category: 'permission',
      code: rawCode || 'ROLE_MISMATCH',
      userMessage: originalMsg || 'This account is not registered for the selected portal role.',
      recoverable: false,
    };
  }

  // 7b. Permissions & Access Control
  if (
    rawCode === 'permission-denied' ||
    rawCode === 'unauthenticated' ||
    rawCode === 'auth/insufficient-permission' ||
    rawCode === '403' ||
    rawMessage.includes('permission') ||
    rawMessage.includes('missing or insufficient permissions') ||
    rawMessage.includes('not authorised') ||
    rawMessage.includes('not authorized') ||
    rawMessage.includes('forbidden')
  ) {
    return {
      category: 'permission',
      code: rawCode || 'PERMISSION_DENIED',
      userMessage: 'You do not have permission to perform this action. Contact your administrator if you believe this is a mistake.',
      recoverable: false,
    };
  }

  // 8. Record Conflict & Duplicates
  if (
    rawCode === 'already-exists' ||
    rawCode === '409' ||
    rawMessage.includes('already exists') ||
    rawMessage.includes('duplicate')
  ) {
    return {
      category: 'conflict',
      code: rawCode || 'ALREADY_EXISTS',
      userMessage: 'This record already exists. Review the existing entry before trying again.',
      recoverable: true,
    };
  }

  // 9. Not Found
  if (
    rawCode === 'not-found' ||
    rawCode === '404' ||
    rawMessage.includes('not found') ||
    rawMessage.includes('does not exist')
  ) {
    return {
      category: 'not_found',
      code: rawCode || 'NOT_FOUND',
      userMessage: 'The requested record could not be found or may have been removed.',
      recoverable: true,
    };
  }

  // 10. File & Media Upload Failures
  if (
    rawMessage.includes('upload') ||
    rawMessage.includes('cloudinary') ||
    rawMessage.includes('file size') ||
    rawMessage.includes('unsupported format')
  ) {
    return {
      category: 'upload',
      code: rawCode || 'UPLOAD_FAILED',
      userMessage: "We couldn't upload this file. Check your connection and file requirements, then try again.",
      recoverable: true,
    };
  }

  // 11. Form Validation Failures
  if (
    rawMessage.includes('validation') ||
    rawMessage.includes('required') ||
    rawMessage.includes('invalid format') ||
    rawMessage.includes('check highlighted fields')
  ) {
    return {
      category: 'validation',
      code: rawCode || 'VALIDATION_ERROR',
      userMessage: 'Please check the highlighted fields and correct the missing or invalid information.',
      recoverable: true,
    };
  }

  // 12. Server / Database Errors (500, Internal Error)
  if (
    rawCode === 'internal' ||
    rawCode === '500' ||
    rawCode === '502' ||
    rawCode === '503' ||
    rawMessage.includes('internal server error') ||
    rawMessage.includes('server error')
  ) {
    return {
      category: 'server',
      code: rawCode || 'SERVER_ERROR',
      userMessage: "We couldn't complete that request right now. Your data has not been confirmed as saved. Please try again shortly.",
      recoverable: true,
    };
  }

  // Safe Fallback: NEVER expose raw technical error objects or stack traces
  const cleanFallback = fallbackMessage || "We couldn't complete that request right now. Please try again shortly.";
  return {
    category: 'unknown',
    code: rawCode || 'UNKNOWN_ERROR',
    userMessage: cleanFallback,
    recoverable: true,
  };
}

/**
 * Returns a human-friendly string for any error.
 */
export function getFriendlyErrorMessage(error: unknown, fallbackMessage?: string): string {
  return classifyError(error, fallbackMessage).userMessage;
}

/**
 * Logs technical diagnostic details internally for developers/operations,
 * redacting any sensitive parameters, and never exposing details to the UI.
 */
export function logInternalDiagnostic(
  operation: string,
  error: unknown,
  context: Record<string, any> = {}
): void {
  const classification = classifyError(error);
  const timestamp = new Date().toISOString();
  const safeContext = sanitizeContext(context);

  console.error(`[Jaystarbliss::Diagnostic] ${timestamp} | Op: ${operation} | Category: ${classification.category}`, {
    operation,
    category: classification.category,
    code: classification.code,
    userMessage: classification.userMessage,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    context: safeContext,
  });
}
