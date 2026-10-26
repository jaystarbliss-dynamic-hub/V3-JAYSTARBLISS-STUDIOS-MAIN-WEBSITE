import assert from "node:assert/strict";
import test from "node:test";

// Test Role Aliases and Canonical Mappings
const ROLE_ALIASES = {
  USER: "user",
  STUDENT: "student",
  PARENT: "parent",
  TUTOR: "staff",
  STAFF: "staff",
  INSTRUCTOR: "staff",
  FACULTY: "staff",
  SCHOOL: "school",
  SCHOOL_ADMIN: "school",
  CMS_ADMIN: "cms_admin",
  CONTENT_ADMIN: "cms_admin",
  ACADEMIC_ADMIN: "academic_admin",
  EDUCATION_ADMIN: "academic_admin",
  FINANCE_ADMIN: "finance_admin",
  SERVICES_ADMIN: "services_admin",
  SUPER_ADMIN: "super_admin",
  ADMIN: "super_admin"
};

const ADMIN_ROLES = new Set([
  "super_admin",
  "admin",
  "cms_admin",
  "academic_admin",
  "finance_admin",
  "content_admin",
  "education_admin",
  "services_admin"
]);

const PROTECTED_ACCOUNTS = new Set([
  "johnrufai242@gmail.com",
  "admin@jaystarbliss.com",
  "admin@jaystarbliss-studios.name.ng"
]);

// Helper simulating portal route decision
function resolveLoginDestination(userProfile, isApprovedTutor = false) {
  const role = String(userProfile.role || "").toUpperCase();

  if (role.includes("ADMIN")) return "/admin";
  if (role === "SCHOOL") return "/portal/school";
  if (["STAFF", "TUTOR", "INSTRUCTOR", "FACULTY"].includes(role) || isApprovedTutor) return "/portal/staff";
  if (role === "STUDENT") return "/portal/student";
  return "/portal/parent";
}

// Helper simulating authorization for role changes
function validateRoleChange(callerRole, callerUid, targetUserId, newRoleName) {
  const targetMappedRole = ROLE_ALIASES[newRoleName.toUpperCase()] || newRoleName.toLowerCase();
  
  if (!ADMIN_ROLES.has(callerRole.toLowerCase())) {
    return { ok: false, status: 403, error: "Administrator permissions are required." };
  }
  if (callerUid === targetUserId && targetMappedRole !== "super_admin") {
    return { ok: false, status: 400, error: "You cannot remove your own administrator role." };
  }
  if ((targetMappedRole === "super_admin" || ["cms_admin", "academic_admin", "finance_admin", "services_admin"].includes(targetMappedRole)) && callerRole !== "super_admin") {
    return { ok: false, status: 403, error: "Only a Super Admin can assign administrative roles." };
  }
  return { ok: true, role: targetMappedRole };
}

// Helper simulating permanent deletion validation
function validatePermanentDeletion(callerRole, callerUid, targetUserId, targetEmail, totalSuperAdmins = 2) {
  if (callerRole !== "super_admin") {
    return { ok: false, status: 403, error: "Only authorized Super Admins are permitted to permanently delete accounts." };
  }
  if (callerUid === targetUserId) {
    return { ok: false, status: 400, error: "You cannot delete your own active Super Admin account." };
  }
  if (PROTECTED_ACCOUNTS.has(targetEmail.toLowerCase())) {
    return { ok: false, status: 403, error: "This primary Super Admin account is system-protected and cannot be deleted." };
  }
  if (totalSuperAdmins <= 1) {
    return { ok: false, status: 400, error: "Cannot delete the only remaining Super Admin account in the institution." };
  }
  return { ok: true };
}

test("maps role aliases correctly to canonical database roles", () => {
  assert.equal(ROLE_ALIASES["TUTOR"], "staff");
  assert.equal(ROLE_ALIASES["STAFF"], "staff");
  assert.equal(ROLE_ALIASES["PARENT"], "parent");
  assert.equal(ROLE_ALIASES["STUDENT"], "student");
  assert.equal(ROLE_ALIASES["SCHOOL"], "school");
  assert.equal(ROLE_ALIASES["SCHOOL_ADMIN"], "school");
  assert.equal(ROLE_ALIASES["SUPER_ADMIN"], "super_admin");
  assert.equal(ROLE_ALIASES["ADMIN"], "super_admin");
});

test("redirects approved tutors to /portal/staff even if legacy profile had parent role", () => {
  const legacyParentProfile = { role: "parent", email: "tutor@example.com", name: "Jane Tutor" };
  // Without tutor verification, default would be parent
  assert.equal(resolveLoginDestination(legacyParentProfile, false), "/portal/parent");
  // With approved tutor verification, must route to staff portal
  assert.equal(resolveLoginDestination(legacyParentProfile, true), "/portal/staff");
});

test("rejects role change if caller is not an administrator", () => {
  const res = validateRoleChange("parent", "user-1", "user-2", "STAFF");
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test("prevents administrator from removing their own admin access", () => {
  const res = validateRoleChange("super_admin", "admin-1", "admin-1", "STUDENT");
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test("prevents non-super admins from assigning super_admin or admin roles", () => {
  const res = validateRoleChange("academic_admin", "admin-2", "user-3", "SUPER_ADMIN");
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test("allows super admin to assign any role", () => {
  const res = validateRoleChange("super_admin", "super-1", "user-3", "TUTOR");
  assert.equal(res.ok, true);
  assert.equal(res.role, "staff");
});

test("blocks permanent deletion if caller is not super admin", () => {
  const res = validatePermanentDeletion("academic_admin", "admin-1", "target-user", "user@example.com");
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test("prevents super admin from deleting themselves", () => {
  const res = validatePermanentDeletion("super_admin", "super-1", "super-1", "super1@example.com");
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test("prevents deleting protected super admin accounts", () => {
  const res = validatePermanentDeletion("super_admin", "super-1", "super-main", "johnrufai242@gmail.com");
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test("prevents deleting the last remaining super admin account", () => {
  const res = validatePermanentDeletion("super_admin", "super-1", "super-last", "lastadmin@example.com", 1);
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test("allows super admin to delete standard user when multiple super admins exist", () => {
  const res = validatePermanentDeletion("super_admin", "super-1", "regular-user", "learner@example.com", 2);
  assert.equal(res.ok, true);
});
