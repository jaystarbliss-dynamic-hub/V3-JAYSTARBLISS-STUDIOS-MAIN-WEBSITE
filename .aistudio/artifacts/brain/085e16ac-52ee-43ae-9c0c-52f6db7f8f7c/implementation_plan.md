# Student Portal Login, Self-Healing & Security Rules Overhaul

This plan resolves the persistent student login failures across both existing and newly onboarded student accounts while keeping all other portal roles (Admin, School, Staff, Parent) working seamlessly. It aligns database routing between the `(default)` and named Firestore databases, restores resilient server-first login with client fallback, adds automatic student profile self-healing in `ProtectedRoute`, and updates `firestore.rules` so first-time and returning students can link and access their portal sessions without permission denials.

## User Review & Critical Decisions

> [!IMPORTANT]
> All three architectural choices have been confirmed from your answers and are incorporated into this plan:

- **Confirmed Decision 1 (Database Routing)**: Query the `(default)` Firestore database first—where your active student and school records reside—with an automatic fallback to the named database (`ai-studio-jaystarblissdyna-...`) in server functions so no student record is ever missed across environments.
- **Confirmed Decision 2 (Login Execution Path)**: Attempt the server function (`/.netlify/functions/portal-access-login`) first, and automatically fall back to direct client-side Firestore lookup and Firebase Auth session establishment whenever the serverless endpoint is unreachable (such as in preview environments) or returns a server/lookup failure.
- **Confirmed Decision 3 (ProtectedRoute & Rules Self-Healing)**: Automatically resolve, link, and self-heal missing `users/{uid}` student profiles inside `ProtectedRoute` and permit safe student profile linking in `firestore.rules` instead of signing students out when `users/{uid}` is missing.

---

## 1. Overview & Core Concept

- **What It Does**: Enables every valid student—whether legacy, newly onboarded by an administrator or school, or re-issued a fresh access pack—to sign in using their username/email and access code, establish an authenticated session, pass `ProtectedRoute` verification, and load their student dashboard.
- **Target Audience / Persona**: Individual learners, school-affiliated students, and parent-enrolled students accessing `/portal` and `/portal/student`.
- **Key Value**: Eliminates false `"Invalid student credentials"` and `"No student record found"` errors caused by database mismatches, serverless function unavailability, case-sensitive queries, and post-login `ProtectedRoute` sign-outs.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Student Login (`/portal`)**: The student selects the **Student** tab, enters their Username (or Email / Access Code) and Access Code (case-insensitive, with or without hyphens/spaces), and submits.
  2. **Credential Verification & Session Creation**: The portal checks the server endpoint first; if unavailable or if the record lives in the `(default)` database, the client fallback verifies the access code/hash against `individualStudents`, `students`, and `users`, then signs in or provisions the student's dedicated Firebase Auth session.
  3. **Seamless Portal Entry (`/portal/student`)**: `ProtectedRoute` verifies the authenticated user. If `users/{uid}` does not exist yet or is missing `role: 'STUDENT'`, it automatically locates the matching student record in `individualStudents` or `students` (via `firebaseUid`, `studentDocId` in sessionStorage, or `username`), creates/repairs `users/{uid}`, and grants immediate access to the Student Dashboard.
- **Visual Identity & Theme**:
  - Preserves the existing Jaystarbliss Studios dark/light portal aesthetic (`--brand-red`, slate glassmorphism cards, responsive layout).
  - Clear, actionable error feedback distinguishing between an unknown username, an incorrect access code, or a suspended account.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Database Lookup in Admin SDK (`(default)` Primary + Named DB Fallback)**
  - *Chosen Approach*: Configure `api/_lib/firebase-admin.ts` to default to `(default)` while exposing a helper to also query the named database (`ai-studio-jaystarblissdyna-...`) as a fallback inside `portal-access-login`.
  - *Why*: Live inspection confirmed that student records (`individualStudents`) and `firestore.rules` are active on `(default)`, whereas pinning Admin SDK exclusively to the named database caused queries to miss records in `(default)`.
- **Decision 2: Server-First Student Login with Client Firestore Fallback**
  - *Chosen Approach*: In `SecurePortalLogin.tsx`, try `serverAccess()` first; if it fails (e.g., 404/500 in preview or uncommitted service account env vars), execute the comprehensive client-side lookup (supporting uppercase, lowercase, `@` prefix, stripped hyphens, SHA-256 hashes, and legacy code fields) and establish the Firebase Auth session.
  - *Why*: Other roles (`School`, `Staff`, `Admin`, `Parent`) work because they authenticate directly with Firebase in the browser. Restoring the client fallback for students gives them the same reliability across both preview and production.
- **Decision 3: Student Self-Healing in `ProtectedRoute` & `firestore.rules`**
  - *Chosen Approach*: Add student self-healing to `ProtectedRoute` (matching the existing self-healing already present for Super Admins and School Admins) and update `firestore.rules` so authenticated students can create/update their own `users/{uid}` student profile and link `firebaseUid` / `userId` on their `individualStudents` / `students` record.
  - *Why*: Previously, even after a student authenticated, `ProtectedRoute` checked `users/{uid}`, saw it was missing, and immediately called `signOut(auth)`.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Student Login (/portal)                          │
│               Input: Identifier (Username/Email) + Code                 │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Server Function Attempt (/.netlify/functions/portal-access-login)    │
│    • Queries (default) Firestore DB first, then named DB fallback       │
│    • Validates accessCode / passcode / code / SHA-256 accessCodeHash    │
│    • Returns customToken if Firebase Admin credentials are active       │
└─────────────────┬───────────────────────────────────┬───────────────────┘
                  │ Success                           │ Error / Unreachable
                  ▼                                   ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│  signInWithCustomToken(auth)      │ │ 2. Client Firestore & Auth Flow   │
└─────────────────┬─────────────────┘ │    • Case-insensitive lookup in   │
                  │                   │      individualStudents & students│
                  │                   │    • Verifies plain code or SHA256│
                  │                   │    • Signs in / creates student   │
                  │                   │      Auth session & links UID     │
                  └─────────┬─────────┴─────────────────┬─────────────────┘
                            │                           │
                            ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. ProtectedRoute Gate (/portal/student)                                │
│    • Checks users/{uid}                                                 │
│    • Self-Heal: If missing, resolves student from sessionStorage /      │
│      individualStudents / students, writes users/{uid} (role: STUDENT)  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Firestore Security Rules (firestore.rules)                           │
│    • Allows student lookup & first-time firebaseUid/userId linking      │
│    • Allows authenticated student to create/sync own users/{uid} doc    │
│    • Allows student read/write access to schedules, exams, assignments  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Firebase Admin & Server Login (`api/_lib/firebase-admin.ts` & `netlify/functions/portal-access-login.ts`)**:
   - Provide primary `(default)` Firestore instance and secondary named database fallback so `findStudent` checks `(default)` first and falls back to `ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c` if not found.
   - Normalize access codes by stripping optional hyphens/spaces in addition to exact and uppercase SHA-256 hash comparisons in `api/_lib/student-login-compat.mjs`.
2. **Client Student Login (`src/pages/SecurePortalLogin.tsx` & `src/pages/Portal.tsx`)**:
   - Execute `serverAccess()` first; on any error, run the multi-vector client lookup across `individualStudents`, `students`, and `users` (including uppercase, lowercase, `@username`, stripped-hyphen access codes, and SHA-256 hashes).
   - Sign in with or create the student's synthetic Firebase Auth account (`student_<username>_<docSuffix>@jaystarbliss-studios.firebaseapp.com`), persist session keys in `sessionStorage` and `localStorage`, and sync `users/{uid}` and `individualStudents/{docId}`.
3. **Portal Authorization Gate (`src/components/admin/ProtectedRoute.tsx`)**:
   - When `userSnap` (`users/{currentUser.uid}`) is missing or lacks a role on `/portal/student` (or when `sessionStorage.getItem('userRole') === 'student'`), look up the student's record in `individualStudents` and `students` by `studentDocId` (from `sessionStorage`), `firebaseUid == currentUser.uid`, `userId == currentUser.uid`, or `username`.
   - Automatically write and self-heal `users/{currentUser.uid}` with `role: 'STUDENT'`, `accountStatus: 'ACTIVE'`, `studentDocId`, `schoolId`, and `class`, preventing premature `signOut(auth)`.
4. **Firestore Security Rules (`firestore.rules`)**:
   - In `match /users/{userId}`: Allow authenticated users (`request.auth.uid == userId`) to create their profile with a student role and update their own profile fields (including self-healing `role: 'STUDENT'`, `studentDocId`, `schoolId`, `class`, `status: 'ACTIVE'` when transitioning from an uninitialized doc or maintaining their student role) while still strictly blocking privilege escalation to admin/staff/school roles.
   - In `match /individualStudents/{studentId}` and `match /students/{studentId}`: Allow an authenticated student to update/link `firebaseUid`, `userId`, `authEmail`, `portalAccessEnabled`, `lastLoginAt`, and `updatedAt` on their student record during login.
   - Consolidate duplicate `match /schoolExams/{examId}` blocks and deploy the updated rules to Firebase.
