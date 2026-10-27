# Jaystarbliss Studios — Workflow & API Contracts Inventory

## 1. Serverless API Endpoints (`netlify/functions/`)

All 55 Netlify Functions and their request/response contracts, authentication headers (`Authorization: Bearer <Firebase ID Token>`), and Firestore fallback paths are preserved without breaking changes:

### A. Authentication, Identity & Onboarding
- `portal-access-login.ts`: Validates student username/access-code login across current and legacy hash/plaintext formats (`tests/student-login-compat.test.mjs`).
- `admin-google-login.ts` & `admin-auth-sync.ts`: Synchronizes Firebase Auth claims and Firestore user documents.
- `auth-password-reset.ts` & `student-change-password.ts`: Handles password reset and student credential updates.
- `staff-register.ts`: Processes tutor/staff registration and approval status.
- `admin-onboard.ts`, `admin-student-onboard.ts`, `admin-school-onboard.ts`, `school-student-onboard.ts`: Provisions user accounts, student records, and partner schools.
- `student-credential-issue.ts` & `admin-school-access-code.ts`: Issues and rotates student/school access passcodes.

### B. RBAC, Approvals & Administration
- `admin-role-change.ts`: Enforces role-change permissions (`ADMIN` vs `SUPER_ADMIN`) and prevents self-demotion (`tests/admin-roles-and-deletion.test.mjs`).
- `admin-account-status.ts` & `school-student-status.ts`: Enables, suspends, or archives user and learner accounts.
- `admin-user-delete.ts`: Super-admin guarded permanent account deletion with last-super-admin protection (`tests/admin-roles-and-deletion.test.mjs`).
- `admin-approve-school-partnership.ts` & `school-partnership-submit.ts`: Manages partner school application and approval lifecycle.
- `parent-enrollment-request.ts` & `admin-parent-family.ts`: Handles parent child-enrollment requests and family linking.
- `tutor-subject-review.ts`: Approves or rejects tutor subject specializations.
- `audit-log.ts` & `admin-registration-notification.ts`: Persists administrative audit trails and dispatches notifications.

### C. Examination & Assessment Engine
- `tutor-examinations.ts` & `jdi-examinations.ts`: Creates, updates, and queries Native CBT and External Link (`EXTERNAL_LINK`) examinations.
- `jdi-question-bank.ts`: Manages reusable question bank items.
- `student-examinations.ts` & `examination-passcode.ts`: Verifies student eligibility, class scope, and examination access passcodes.
- `examination-attempt.ts`: Manages timed attempt state, autosave answers, objective grading (`gradeAnswers`), and expiry submission (`tests/jdi-assessment.test.mjs`).
- `jdi-exam-management.ts` & `jdi-expire-exams.ts`: Handles tutor/admin grading, result release (`resultReleased`, `releasedAt`), and expired attempt closure.
- `parent-examination-results.ts`: Securely resolves released examination attempts for a parent's linked children (`tests/jdi-assessment.test.mjs`).

### D. Academic Operations & Schedules
- `academic-assignments.ts`, `academic-milestones.ts`, `academic-assessments.ts`, `academic-attendance.ts`: CRUD and grading endpoints for coursework and attendance.
- `academic-schools.ts`, `academic-students.ts`, `admin-students-directory.ts`, `school-admin.ts`, `school-students.ts`, `school-learner-insights.ts`, `admin-school-admin-sync.ts`: Scoped directory and analytics queries.
- `class-schedules.ts` & `class-schedule-status.ts`: Manages recurring class timetables and live session statuses.

### E. Billing, Paystack & Tutor Wallet
- `billing-data.ts`, `billing-admin.ts`, `payment-config.ts`, `payment-due-reminders.mts`: Manages tuition invoices, school fee ledgers, and automated payment reminders.
- `paystack-initialize.ts`, `paystack-verify.ts`, `paystack-webhook.ts`: Handles Paystack checkout initialization, transaction verification, and webhook reconciliation.
- `paystack-banks.ts` & `wallet-withdraw.ts`: Resolves Nigerian bank accounts and processes tutor wallet withdrawal requests.
- `send-client-email.ts`: Dispatches transactional emails.

---

## 2. Core Domain Invariants (`src/lib/classes.ts` & `src/lib/examReportPdfGenerator.ts`)

1. **Authoritative Scoring (`computeExamMaxScore`, `calculateScorePercentage`, `gradeAnswers`)**:
   - Raw scores are never scaled to `/100` unless the examination's actual question points sum to `100`.
   - A 1-mark score on a 3-mark examination is always stored, displayed, and exported as `1 / 3` (`33.3%`).
2. **Partner-School Identity Resolution (`resolvePartnerSchoolName`)**:
   - Filters out generic system strings (`Jaystarbliss`, `Jaystarbliss Dynamic Institute`, `JDI`) when resolving a partner school's name so official reports and tables always display the actual partner school's name.
3. **Canonical Class Standardisation (`normalizeClassName`, `CANONICAL_CLASSES`)**:
   - Maps legacy Nigerian/British class labels (`JSS 1`, `SS 3`, `Year 7`, `Primary 4`, etc.) to `Early Years`, `Grade 1`–`Grade 12`, `University (Undergraduate)`, and `Graduate (BSc, HND, ND, etc.)`.
