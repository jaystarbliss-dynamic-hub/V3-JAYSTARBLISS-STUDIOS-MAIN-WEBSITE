import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./firebase-admin" ||
      specifier.endsWith("/_lib/firebase-admin") ||
      specifier.endsWith("/firebase-admin")
    ) {
      return {
        url: "data:text/javascript,export const adminDb = {}; export const adminAuth = {}; export default {};",
        shortCircuit: true,
      };
    }
    if (specifier.startsWith(".") && !path.extname(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { isPlatformEnrollmentAdminRole } = await import(
  new URL("../netlify/functions/programme-enrollment-admin.ts", import.meta.url).href
);

const { shouldShowPortalTour, PORTAL_TOUR_VERSION } = await import(
  new URL("../src/lib/portalTour.ts", import.meta.url).href
);

const { JDI_CONTACTS } = await import(
  new URL("../src/lib/pdf/documentBranding.ts", import.meta.url).href
);

// =============================================================================
// AUDIT REPAIR 1: Platform Admin Role Check Rejects SCHOOL_ADMIN Escalation
// =============================================================================
test("Audit Repair 1: isPlatformEnrollmentAdminRole allows platform admins and strictly rejects SCHOOL_ADMIN / non-admins", () => {
  assert.equal(isPlatformEnrollmentAdminRole("SUPER_ADMIN", "john@example.com"), true);
  assert.equal(isPlatformEnrollmentAdminRole("ADMIN", "admin@example.com"), true);
  assert.equal(isPlatformEnrollmentAdminRole("EDUCATION_ADMIN", "edu@example.com"), true);
  assert.equal(isPlatformEnrollmentAdminRole("FINANCE_ADMIN", "fin@example.com"), true);
  assert.equal(isPlatformEnrollmentAdminRole("USER", "johnrufai242@gmail.com"), true);

  // Critical privilege escalation checks
  assert.equal(isPlatformEnrollmentAdminRole("SCHOOL_ADMIN", "principal@school.org"), false);
  assert.equal(isPlatformEnrollmentAdminRole("school_admin", "principal@school.org"), false);
  assert.equal(isPlatformEnrollmentAdminRole("SCHOOLADMIN", "principal@school.org"), false);
  assert.equal(isPlatformEnrollmentAdminRole("SCHOOL", "principal@school.org"), false);
  assert.equal(isPlatformEnrollmentAdminRole("PARENT", "parent@example.com"), false);
  assert.equal(isPlatformEnrollmentAdminRole("STUDENT", "student@example.com"), false);
  assert.equal(isPlatformEnrollmentAdminRole("TUTOR", "tutor@example.com"), false);
  assert.equal(isPlatformEnrollmentAdminRole("", "anon@example.com"), false);
});

// =============================================================================
// AUDIT REPAIR 2: Onboarding Tour Distinguishes New Users vs Existing Legacy Users
// =============================================================================
test("Audit Repair 2: shouldShowPortalTour triggers only for newly registered accounts and skips existing legacy accounts", () => {
  const now = Date.parse("2026-11-20T12:00:00.000Z");

  assert.equal(
    shouldShowPortalTour({
      userDoc: { onboardingTourEligible: true },
      localCompletedVersion: null,
      nowMs: now,
    }),
    true
  );

  assert.equal(
    shouldShowPortalTour({
      userDoc: { createdAt: { seconds: Math.floor((now - 2 * 86400_000) / 1000) } },
      localCompletedVersion: null,
      nowMs: now,
    }),
    true
  );

  // Legacy account (no flag, old createdAt or missing createdAt)
  assert.equal(
    shouldShowPortalTour({
      userDoc: { createdAt: { seconds: Math.floor((now - 30 * 86400_000) / 1000) } },
      localCompletedVersion: null,
      nowMs: now,
    }),
    false
  );
  assert.equal(
    shouldShowPortalTour({
      userDoc: { role: "student" },
      localCompletedVersion: null,
      nowMs: now,
    }),
    false
  );
  assert.equal(
    shouldShowPortalTour({
      userDoc: { onboardingTourEligible: true, portalTourVersion: PORTAL_TOUR_VERSION },
      localCompletedVersion: null,
      nowMs: now,
    }),
    false
  );
});

// =============================================================================
// AUDIT REPAIR 3: Canonical Domain Enforcement (jaystarblissstudios.com)
// =============================================================================
test("Audit Repair 3: User-facing branding & templates use canonical jaystarblissstudios.com domain", () => {
  assert.equal(JDI_CONTACTS.verifyUrl, "jaystarblissstudios.com/verify");
  assert.equal(JDI_CONTACTS.portalUrl, "jaystarblissstudios.com/portal");

  const checkedFiles = [
    "src/components/email/PasswordResetEmailTemplate.tsx",
    "src/pages/admin/AdminInquiries.tsx",
    "netlify/functions/admin-school-onboard.ts",
    "netlify/functions/paystack-initialize.ts",
  ];

  for (const rel of checkedFiles) {
    const src = readFileSync(path.join(rootDir, rel), "utf8");
    assert.ok(
      !src.includes("jaystarbliss-studios.name.ng"),
      `${rel} must not contain legacy jaystarbliss-studios.name.ng domain URLs`
    );
  }
});

// =============================================================================
// AUDIT REPAIR 4: Firestore Rules Static Security Assertions
// =============================================================================
test("Audit Repair 4: firestore.rules blocks privilege/billing tampering, public schoolLinks writes, and undefined helpers", () => {
  const rules = readFileSync(path.join(rootDir, "firestore.rules"), "utf8");

  // 1. No undefined isParentOf(...) helper call
  assert.ok(
    !rules.includes("isParentOf("),
    "firestore.rules must use isParentOfStudent(...), never undefined isParentOf(...)"
  );

  // 2. schoolLinks must not allow public create/update
  assert.ok(
    !/match\s+\/schoolLinks\/\{linkId\}\s*\{[\s\S]*?allow\s+create,\s*update:\s*if\s+true;/.test(rules),
    "schoolLinks must not permit unauthenticated create/update"
  );

  // 3. users self-update must protect schoolId, parentId, paidThrough, paymentStatus, enrolledPrograms
  for (const key of ["'schoolId'", "'parentId'", "'paidThrough'", "'paymentStatus'", "'enrolledPrograms'"]) {
    assert.ok(rules.includes(key), `firestore.rules must protect ${key}`);
  }

  // 4. Financial reset backups & audit logs remain server-only write & Superadmin read
  assert.ok(rules.includes("match /financialResetAuditLogs/{logId}"));
  assert.ok(rules.includes("match /financialResetBackups/{backupId}"));
  assert.ok(rules.includes("match /subscriptionReminders/{remId}"));
});

// =============================================================================
// AUDIT REPAIR 5: Backend Entitlement & Scoping Static Guard Assertions
// =============================================================================
test("Audit Repair 5: Backend endpoints enforce lockdown guardrails and reject untrusted schoolId overrides", () => {
  const billingData = readFileSync(path.join(rootDir, "netlify/functions/billing-data.ts"), "utf8");
  assert.ok(
    !billingData.includes("event.queryStringParameters?.schoolId"),
    "billing-data.ts must not allow school users to override schoolId via query parameter"
  );

  const studentCred = readFileSync(path.join(rootDir, "netlify/functions/student-credential-issue.ts"), "utf8");
  assert.ok(
    studentCred.includes("enforceEntitlementOrLock"),
    "student-credential-issue.ts must enforce subscription lockdown for school admins"
  );

  const jdiExam = readFileSync(path.join(rootDir, "netlify/functions/jdi-exam-management.ts"), "utf8");
  assert.ok(
    jdiExam.includes("enforceEntitlementOrLock"),
    "jdi-exam-management.ts must enforce subscription lockdown for school admins"
  );

  const emailLib = readFileSync(path.join(rootDir, "api/_lib/email.ts"), "utf8");
  assert.ok(
    emailLib.includes("SCHOOL_STUDENT_LOCKDOWN") && emailLib.includes("PARENT_CHILD_LOCKDOWN"),
    "api/_lib/email.ts must support non-payer lockdown templates without payment CTA"
  );

  const reminderCron = readFileSync(path.join(rootDir, "netlify/functions/payment-due-reminders.mts"), "utf8");
  assert.ok(
    reminderCron.includes("dispatchDependentStudentLockdownNotices"),
    "payment-due-reminders.mts must notify affected school students and parent children on lockdown"
  );
});
