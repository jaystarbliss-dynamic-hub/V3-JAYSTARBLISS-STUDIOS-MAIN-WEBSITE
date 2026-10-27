# Jaystarbliss Studios — Baseline & Verification QA Protocol

## 1. Environment & Verification Scope

- **Workspace Runtime**: Linux Node.js (`v22.23.3`), Vite `8.2.0`, TypeScript `~6.0.2`, `oxlint` `1.75.0`.
- **Database Configuration**: Firebase project `jaystarbliss-studios`, named Firestore database `ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c`.
- **Honest Verification Boundaries**:
  - Static analysis (`npm run lint`), TypeScript compilation (`tsc -b`, `npm run typecheck:functions`), production bundle build (`npm run build`), and automated Node unit/integration tests (`npm run test:assessment`, `npm run test:portal-login`, `npm run test:admin`) are executed directly in this workspace.
  - `tests/firestore.rules.test.mjs` requires `@firebase/rules-unit-testing` and a running local Firebase Firestore Emulator (`firebase emulators:exec`), which are not installed in `package.json` in this container environment.

---

## 2. Responsive & Accessibility QA Checklist

### A. Header & Navigation Shell (`PortalLayout` & `AdminLayout`)
- [x] Single sticky header (`48–56px` height) remains visible at the top of `.portal-main-content` and `.admin-main-content` while page content scrolls.
- [x] Header displays **only the route-aware page title** as visible text (e.g., `Dashboard`, `Examinations`, `Examination Overview`, `Examination History`, `Student Access`, `Settings`, `Billing`, `Create Program`, `Edit Blog Post`).
- [x] Redundant `"Jaystarbliss Dynamic Institute · JDI"`, `"Student Workspace"`, `"Tutor Workspace"`, greeting banners, and duplicate in-page `<h1>` title banners removed across all 60+ portal and admin routes.
- [x] Visible email-verification notification banner removed from authenticated layouts while preserving backend auth/security checks.
- [x] Mobile drawer supports button toggle, backdrop close, Escape key, automatic close on route change, and left-edge swipe-right (`<= 28px`) to open / swipe-left to close (`useEdgeSwipeDrawer.ts`).

### B. Examination Ecosystem QA
- [x] Clicking **Create Examination** opens the examination type selector modal (`External Link / Google Forms` vs `Native Jaystarbliss Examination`).
- [x] Selecting `External Link / Google Forms` shows only title, description, external URL, access code, school, class, and subject; hides `Questions`, `Responses`, duration, and native grading settings.
- [x] Selecting `Native Jaystarbliss Examination` enables full question authoring, point allocation, answer keys, duration, scheduling, script/CSV import modal, live proctoring, and response analytics.
- [x] Switching between examination types updates the UI in-place without losing work or creating duplicate exam records.
- [x] New examinations start with `questions = []` (zero hardcoded/demo questions).
- [x] School Portal `/portal/school/exams` (`SchoolExaminationOverview`) displays current & upcoming exams, schedules, classes, and passcodes, whereas `/portal/school/exam-history` (`ExaminationHistory`) displays completed/past exams, student attempts, scores, and PDF/XLSX/ZIP exports.

### C. Mobile & Narrow-Viewport Responsiveness (`320px–1440px`)
- [x] Global mobile CSS rules (`src/index.css`, `src/uiux-pro-max.css`) enforce `min-width: 0`, `overflow-x: clip`, `16px` form inputs on mobile, `44px` minimum touch targets, and wrapping flex toolbars.
- [x] Multi-column tables in `ExaminationHistory` and `StudentExamAttempt` provide dedicated mobile card views (`md:hidden`) alongside semantic desktop tables (`hidden md:block`).
- [x] Tabular numerals (`font-variant-numeric: tabular-nums`) applied to KPI counters, timers, scores, and financial tables.
