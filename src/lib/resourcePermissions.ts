/**
 * Shared Resource Ownership & Deletion Permission Policy
 *
 * Rules:
 * - Administrators can manage and delete ANY resource regardless of who sent it.
 * - Tutors / Staff can manage and delete ONLY resources that they themselves created/sent
 *   (including general resources, school resources, and personal resources they sent).
 * - Tutors / Staff CANNOT delete resources sent by another tutor or by an administrator.
 * - School administrators can manage/delete resources scoped to their own school or created by them.
 * - Students and Parents cannot delete resources.
 */

const ADMIN_ROLE_SET = new Set([
  'admin',
  'super_admin',
  'superadmin',
  'director',
  'education_admin',
  'finance_admin',
  'content_admin',
  'cms_admin',
  'services_admin',
  'marketing_admin',
  'support_admin',
]);

const STAFF_ROLE_SET = new Set([
  'staff',
  'tutor',
  'instructor',
  'faculty',
  'teacher',
]);

const normalizeStr = (value: unknown): string => String(value ?? '').trim();
const normalizeLower = (value: unknown): string => normalizeStr(value).toLowerCase();

export function isAdminRole(role?: string | null): boolean {
  return ADMIN_ROLE_SET.has(normalizeLower(role));
}

export function isStaffRole(role?: string | null): boolean {
  return STAFF_ROLE_SET.has(normalizeLower(role));
}

export function buildResourceCreatorMetadata(params: {
  uid?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}): Record<string, string> {
  const uid = normalizeStr(params.uid);
  const email = normalizeLower(params.email);
  const name = normalizeStr(params.name) || email || 'Portal Educator';
  const role = isAdminRole(params.role)
    ? 'admin'
    : isStaffRole(params.role)
    ? 'staff'
    : normalizeLower(params.role) || 'staff';

  return {
    createdByUid: uid,
    uploadedByUid: uid,
    createdByEmail: email,
    uploadedByEmail: email,
    createdByName: name,
    createdByRole: role,
    author: name,
  };
}

export function isResourceOwnedByUser(params: {
  resource: Record<string, any> | null | undefined;
  currentUid?: string | null;
  currentEmail?: string | null;
}): boolean {
  const res = params.resource;
  if (!res) return false;

  const uid = normalizeStr(params.currentUid);
  const email = normalizeLower(params.currentEmail);

  const ownerUids = [
    res.createdByUid,
    res.uploadedByUid,
    res.tutorId,
    res.staffId,
    res.senderUid,
    res.authorUid,
    res.userId,
  ]
    .map(normalizeStr)
    .filter(Boolean);

  // If the document has explicit UID ownership metadata, match strictly against UID
  if (ownerUids.length > 0) {
    return Boolean(uid && ownerUids.includes(uid));
  }

  // Legacy fallback: documents written before UID stamping only recorded email/assignedBy.
  // Never grant a tutor ownership of a document explicitly tagged as created by an admin.
  if (isAdminRole(res.createdByRole)) {
    return false;
  }

  if (!email) return false;

  const ownerEmails = [
    res.createdByEmail,
    res.uploadedByEmail,
    res.assignedBy,
    res.senderEmail,
    res.tutorEmail,
  ]
    .map(normalizeLower)
    .filter(Boolean);

  return ownerEmails.includes(email);
}

export function canDeleteResource(params: {
  resource: Record<string, any> | null | undefined;
  currentUid?: string | null;
  currentEmail?: string | null;
  currentRole?: string | null;
  isAdmin?: boolean;
  currentSchoolId?: string | null;
}): boolean {
  if (!params.resource) return false;

  // 1. Admins can ALWAYS delete any resource regardless of sender
  if (params.isAdmin || isAdminRole(params.currentRole)) {
    return true;
  }

  // 2. Tutors / Staff can delete ONLY resources they sent/created themselves
  if (isStaffRole(params.currentRole)) {
    return isResourceOwnedByUser({
      resource: params.resource,
      currentUid: params.currentUid,
      currentEmail: params.currentEmail,
    });
  }

  // 3. School users can delete their own school's schoolResources or items they created
  if (normalizeLower(params.currentRole) === 'school') {
    if (
      isResourceOwnedByUser({
        resource: params.resource,
        currentUid: params.currentUid,
        currentEmail: params.currentEmail,
      })
    ) {
      return true;
    }
    const resSchoolId = normalizeStr(params.resource.schoolId);
    const currentSchoolId = normalizeStr(params.currentSchoolId);
    const col = normalizeStr(params.resource._collection);
    if (
      currentSchoolId &&
      resSchoolId === currentSchoolId &&
      (col === 'schoolResources' || col === 'schoolLinks')
    ) {
      return true;
    }
    return false;
  }

  // 4. Students, Parents, and unauthenticated users can never delete resources
  return false;
}
