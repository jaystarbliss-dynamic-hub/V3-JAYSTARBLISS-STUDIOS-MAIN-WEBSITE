export type CanonicalAdminScope =
  | 'SUPER_ADMIN'
  | 'ACADEMIC_ADMIN'
  | 'FINANCE_ADMIN'
  | 'CMS_ADMIN';

export const ADMIN_ROLE_LIST = [
  'SUPER_ADMIN',
  'ADMIN',
  'CMS_ADMIN',
  'ACADEMIC_ADMIN',
  'FINANCE_ADMIN',
  'CONTENT_ADMIN',
  'EDUCATION_ADMIN',
  'SERVICES_ADMIN',
  'MARKETING_ADMIN',
  'SUPPORT_ADMIN',
] as const;

export const SUPER_ADMIN_EMAILS = new Set([
  'johnrufai242@gmail.com',
  'admin@jaystarbliss.com',
  'admin@jaystarbliss-studios.name.ng',
]);

/**
 * Normalizes any raw role string into one of the 4 canonical admin scopes,
 * or returns null if the role is not an administrative role.
 */
export function resolveCanonicalAdminScope(rawRole?: string | null): CanonicalAdminScope | null {
  const norm = String(rawRole || '').trim().toUpperCase();
  if (!norm) return null;

  if (norm === 'SUPER_ADMIN' || norm === 'ADMIN') {
    return 'SUPER_ADMIN';
  }

  if (
    norm === 'ACADEMIC_ADMIN' ||
    norm === 'EDUCATION_ADMIN' ||
    norm === 'SUPPORT_ADMIN' ||
    norm === 'ACADEMIC_SUPPORT_ADMIN'
  ) {
    return 'ACADEMIC_ADMIN';
  }

  if (norm === 'FINANCE_ADMIN' || norm === 'BILLING_ADMIN') {
    return 'FINANCE_ADMIN';
  }

  if (
    norm === 'CMS_ADMIN' ||
    norm === 'CONTENT_ADMIN' ||
    norm === 'SERVICES_ADMIN' ||
    norm === 'MARKETING_ADMIN'
  ) {
    return 'CMS_ADMIN';
  }

  return null;
}

export function isAnyAdminRole(rawRole?: string | null): boolean {
  return resolveCanonicalAdminScope(rawRole) !== null;
}

export function getAdminRoleDisplayLabel(rawRole?: string | null): string {
  const norm = String(rawRole || '').trim().toUpperCase();
  if (norm === 'SUPPORT_ADMIN' || norm === 'ACADEMIC_SUPPORT_ADMIN') {
    return 'Academic Support Admin';
  }
  const scope = resolveCanonicalAdminScope(norm);
  switch (scope) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'ACADEMIC_ADMIN':
      return 'Academic Support Admin';
    case 'FINANCE_ADMIN':
      return 'Finance Admin';
    case 'CMS_ADMIN':
      return 'CMS Admin';
    default:
      return 'Admin';
  }
}

const ACADEMIC_ADMIN_ALLOWED_PATHS = [
  '/admin',
  '/admin/programs',
  '/admin/approvals',
  '/admin/students',
  '/admin/parents',
  '/admin/agreements',
  '/admin/staff',
  '/admin/tutor-subjects',
  '/admin/schools',
  '/admin/schedules',
  '/admin/resources',
  '/admin/examinations',
  '/admin/assessments',
  '/admin/examination-history',
  '/admin/notifications',
];

const FINANCE_ADMIN_ALLOWED_PATHS = [
  '/admin',
  '/admin/billing',
  '/admin/approvals',
  '/admin/agreements',
  '/admin/notifications',
];

const CMS_ADMIN_ALLOWED_PATHS = [
  '/admin',
  '/admin/inquiries',
  '/admin/pages',
  '/admin/programs',
  '/admin/services',
  '/admin/portfolio',
  '/admin/kids-projects',
  '/admin/blog',
  '/admin/notifications',
];

function matchesPathAllowlist(pathname: string, allowlist: string[]): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/admin';
  return allowlist.some(
    allowed => clean === allowed || (allowed !== '/admin' && clean.startsWith(`${allowed}/`))
  );
}

/**
 * Determines whether a specific admin role is permitted to access a given `/admin/*` pathname.
 */
export function isSubAdminAllowedForPath(rawRole: string, pathname: string): boolean {
  const scope = resolveCanonicalAdminScope(rawRole);
  if (!scope) return false;

  if (scope === 'SUPER_ADMIN') {
    return true;
  }

  if (scope === 'ACADEMIC_ADMIN') {
    return matchesPathAllowlist(pathname, ACADEMIC_ADMIN_ALLOWED_PATHS);
  }

  if (scope === 'FINANCE_ADMIN') {
    return matchesPathAllowlist(pathname, FINANCE_ADMIN_ALLOWED_PATHS);
  }

  if (scope === 'CMS_ADMIN') {
    return matchesPathAllowlist(pathname, CMS_ADMIN_ALLOWED_PATHS);
  }

  return false;
}

export interface AdminDashboardCapabilities {
  scope: CanonicalAdminScope;
  roleLabel: string;
  canExportAllUsers: boolean;
  canViewAcademicKpis: boolean;
  canViewFinanceKpis: boolean;
  canViewCmsKpis: boolean;
  canViewPendingEnrollments: boolean;
  canViewEdclubHub: boolean;
  canConfigureEdclubHub: boolean;
  canViewAcademicAnalytics: boolean;
  canViewLoginActivityAnalytics: boolean;
  canViewInquiriesChart: boolean;
  canViewRbacDistributionChart: boolean;
  canAccessGlobalSettings: boolean;
  canAccessSupportDesk: boolean;
  canImpersonateUsers: boolean;
}

export function getAdminDashboardCapabilities(rawRole?: string | null): AdminDashboardCapabilities {
  const scope = resolveCanonicalAdminScope(rawRole) || 'ACADEMIC_ADMIN';
  const roleLabel = getAdminRoleDisplayLabel(rawRole);

  if (scope === 'SUPER_ADMIN') {
    return {
      scope,
      roleLabel,
      canExportAllUsers: true,
      canViewAcademicKpis: true,
      canViewFinanceKpis: true,
      canViewCmsKpis: true,
      canViewPendingEnrollments: true,
      canViewEdclubHub: true,
      canConfigureEdclubHub: true,
      canViewAcademicAnalytics: true,
      canViewLoginActivityAnalytics: true,
      canViewInquiriesChart: true,
      canViewRbacDistributionChart: true,
      canAccessGlobalSettings: true,
      canAccessSupportDesk: true,
      canImpersonateUsers: true,
    };
  }

  if (scope === 'ACADEMIC_ADMIN') {
    return {
      scope,
      roleLabel,
      canExportAllUsers: false,
      canViewAcademicKpis: true,
      canViewFinanceKpis: false,
      canViewCmsKpis: false,
      canViewPendingEnrollments: true,
      canViewEdclubHub: true,
      canConfigureEdclubHub: false,
      canViewAcademicAnalytics: true,
      canViewLoginActivityAnalytics: false,
      canViewInquiriesChart: false,
      canViewRbacDistributionChart: false,
      canAccessGlobalSettings: false,
      canAccessSupportDesk: false,
      canImpersonateUsers: false,
    };
  }

  if (scope === 'FINANCE_ADMIN') {
    return {
      scope,
      roleLabel,
      canExportAllUsers: false,
      canViewAcademicKpis: false,
      canViewFinanceKpis: true,
      canViewCmsKpis: false,
      canViewPendingEnrollments: true,
      canViewEdclubHub: false,
      canConfigureEdclubHub: false,
      canViewAcademicAnalytics: false,
      canViewLoginActivityAnalytics: false,
      canViewInquiriesChart: false,
      canViewRbacDistributionChart: false,
      canAccessGlobalSettings: false,
      canAccessSupportDesk: false,
      canImpersonateUsers: false,
    };
  }

  // CMS_ADMIN
  return {
    scope,
    roleLabel,
    canExportAllUsers: false,
    canViewAcademicKpis: false,
    canViewFinanceKpis: false,
    canViewCmsKpis: true,
    canViewPendingEnrollments: false,
    canViewEdclubHub: false,
    canConfigureEdclubHub: false,
    canViewAcademicAnalytics: false,
    canViewLoginActivityAnalytics: false,
    canViewInquiriesChart: true,
    canViewRbacDistributionChart: false,
    canAccessGlobalSettings: false,
    canAccessSupportDesk: false,
    canImpersonateUsers: false,
  };
}
