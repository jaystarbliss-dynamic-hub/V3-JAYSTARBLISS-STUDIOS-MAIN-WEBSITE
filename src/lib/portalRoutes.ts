/**
 * Shared canonical portal route constants and terminology helpers.
 * Prevents dead links such as `/portal/parent/billing` and ensures consistent
 * user-facing labels while preserving backward-compatible Firestore enums.
 */

export const PORTAL_BILLING_ROUTES = {
  parent: '/portal/parent/payments',
  school: '/portal/school/payments',
  student: '/portal/student/payments',
  staff: '/portal/staff/payments',
} as const;

export type PortalBillingRoleKey = keyof typeof PORTAL_BILLING_ROUTES;

export function getPortalBillingRoute(role?: string | null): string {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'parent' || normalized === 'guardian') {
    return PORTAL_BILLING_ROUTES.parent;
  }
  if (normalized === 'school' || normalized === 'school_admin' || normalized === 'partner_school' || normalized === 'institution') {
    return PORTAL_BILLING_ROUTES.school;
  }
  if (normalized === 'staff' || normalized === 'tutor' || normalized === 'instructor') {
    return PORTAL_BILLING_ROUTES.staff;
  }
  return PORTAL_BILLING_ROUTES.student;
}

/**
 * Formats an AgreementCategory enum into user-facing terminology.
 * Preserves the stored Firestore value `COMMUNICATION` while rendering
 * "Communiqué" / "Communiqués" across the UI and official PDFs.
 */
export function formatAgreementCategoryLabel(
  category: string | undefined | null,
  plural = false
): string {
  const norm = String(category || '').trim().toUpperCase();
  if (norm === 'COMMUNICATION' || norm === 'COMMUNIQUE') {
    return plural ? 'Communiqués' : 'Communiqué';
  }
  if (norm === 'PROPOSAL') {
    return plural ? 'Proposals' : 'Proposal';
  }
  if (norm === 'CONTRACT' || norm === 'AGREEMENT') {
    return plural ? 'Contracts / Agreements' : 'Contract / Agreement';
  }
  return plural ? 'Documents' : 'Document';
}
