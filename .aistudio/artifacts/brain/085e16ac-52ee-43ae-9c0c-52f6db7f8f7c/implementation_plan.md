# Tutor Portal Overhaul & Assessment Targeting Fix — Implementation Plan

## 1. Fix Target Recipients Switcher Bug (`RecipientSelectorModal` & `AssessmentEditor`)
- **Root Cause Identified**: In `src/components/assessment/RecipientSelectorModal.tsx`, `initialSelectedClasses = []` is defined as an inline default parameter in the component signature and included in the `useEffect` dependency array (`[isOpen, resolvedInitType, resolvedInitSchoolIds, resolvedInitStudentIds, initialClassScopeMode, initialSelectedClasses]`). Whenever a tutor clicks **Partner Schools** or **Private Students**, `setRecipientType` triggers a re-render, which allocates a new `[]` reference for `initialSelectedClasses`, causing the `useEffect` to immediately fire and reset `recipientType` back to `'ALL'`.
- **Fix**:
  - Track modal open transitions with a `prevOpenRef` (`useRef(false)`) so initialization only runs when `isOpen` transitions from `false` to `true`, and stabilize default array props outside the component signature.
  - Ensure switching between **All Students**, **Partner Schools**, and **Private Students** (as well as class and student checkboxes) works smoothly without resetting state.
  - Support pre-populating a specific learner when launching assessment creation from an assigned learner's profile (`/portal/staff/assessments?createForStudentId=...`).

## 2. Assigned Learner Profile — Inline Assessments & Direct Creation (`StaffStudentWorkspace.tsx`)
- **Rename "Assignments" to "Assessments"**:
  - Replace the `"Assignments"` link/button in the **Academic Tools** card, the bottom action bar of `src/pages/portal/StaffStudentWorkspace.tsx`, and the learner row action button in `src/pages/portal/StaffDashboard.tsx` with **"Assessments"**.
- **Inline Learner Assessments Section**:
  - Add an inline **Learner Assessments & Submissions** section directly inside `StaffStudentWorkspace.tsx` (`#assessments`).
  - Query and merge all assessments assigned to or attempted by the learner across `jdiExams`, `schoolExams`, `jdiExamAttempts`, and `assignments` (`TEST`, `ACTIVITY`, `ASSIGNMENT`, `EXAMINATION`).
  - Provide filter tabs (`All`, `Active / Pending`, `Completed / Graded`) displaying each item's work type badge (`Test`, `Activity`, `Assignment`, `Examination`), status (`Active`, `In Progress`, `Submitted`, `Graded / Released`), score/percentage, and submission date.
  - Include a primary **"+ Create Assessment for Learner"** button (`bg-blue-600` / `bg-brand-red`) that navigates to `/portal/staff/assessments?createForStudentId=${student.id}&studentName=${encodeURIComponent(student.fullName)}&schoolId=${encodeURIComponent(student.schoolId || '')}&className=${encodeURIComponent(student.class || '')}`, opening the Assessment Editor pre-targeted to that learner.

## 3. Tutor Dashboard Redesign & Recharts Analytics (`StaffDashboard.tsx`)
- **Decouple Learner Directory from Main Dashboard**:
  - On `/portal/staff` (main Tutor Dashboard), remove the `"Available & Assigned Learners Directory"` section so the dashboard stays focused on high-signal metrics, visual analytics, and upcoming classes.
  - Keep the `"Available & Assigned Learners Directory"` exclusively on the `/portal/staff/students` (**Assigned Learners**) route.
- **Recharts Analytics Workspace**:
  - Add two interactive **Recharts** visualizations on `/portal/staff`:
    1. **Lessons Completed & Session Status Trend (`ResponsiveContainer` + `BarChart`)**: Visualizes scheduled vs. completed/attended vs. missed/rescheduled lessons across teaching weeks/programmes.
    2. **Filterable Attendance Rate Analysis (`ResponsiveContainer` + `AreaChart` / `BarChart`)**: Displays attendance rate percentages over time and by cohort, paired with an interactive scope switcher to adjust average attendance rate across:
       - **Overall** (all assigned learners & sessions)
       - **Specific Partner School** (searchable/clean selector of assigned schools)
       - **Specific Private Learner** (selector of assigned private learners)
- **Modernize School / Cohort Selector UI**:
  - Replace the horizontal-scrolling tab strip (`overflow-x-auto`) in the **Authorised Teaching Scope** header with a clean, zero-scroll segmented control (**All Assigned Cohorts**, **Partner Schools**, **Private Learners**) paired with a structured school/learner selector pill bar and dropdown—eliminating manual horizontal scrolling.

## 4. Live Classes & Class Schedules Cleanup (`PortalLiveClasses.tsx` & `StaffClassSchedulesManager.tsx`)
- **Remove Redundant Workspace Header Copy**:
  - Remove the `"Tutor Schedule Workspace"`, `"6 Assigned Schools · 6 Assigned Private Students"`, and `"Create and manage class schedules & joining links for your assigned private students and school programs."` text block from `src/components/portal/StaffClassSchedulesManager.tsx`.
- **Reorganize Top Action Bar & School / Private Learner Filter**:
  - Combine the top schedule controls into a clean, single-row toolbar with organized **Scope Filter** (`All Schedules`, `Partner Schools` selector, `Private Learners`) and right-aligned action buttons (`Refresh`, `+ Private Student Schedule`, `+ School Program Schedule`, and `Broadcast Live Link` when in `PortalLiveClasses`).
  - Remove the horizontal-scrolling school tab strip (`overflow-x-auto`) in `StaffClassSchedulesManager.tsx`.
- **Enforce Red & Blue Button Palette (Remove Green Buttons)**:
  - Replace all green (`bg-emerald-600 hover:bg-emerald-700`) buttons in `StaffClassSchedulesManager.tsx` and `StaffDashboard.tsx` (such as `+ Private Student Schedule`, `Schedule Private Student`, and `Join Class`) with **Blue (`bg-blue-600 hover:bg-blue-700 text-white`)** or **Red (`bg-brand-red hover:bg-red-700 text-white`)** buttons.

## 5. Move "Subjects I Teach" into Tutor Profile Settings (`PortalLayout.tsx`, `PortalSettings.tsx`, `TutorSubjects.tsx`)
- **Sidebar Navigation Cleanup**:
  - Remove the standalone `"Subjects I Teach"` item from the `staff` sidebar navigation in `src/components/portal/PortalLayout.tsx`.
- **Tutor Profile Settings Integration**:
  - Embed the **Programmes & Subjects I Teach** configuration section directly inside `src/pages/portal/PortalSettings.tsx` when `role === 'staff'`.
  - Allow tutors to:
    1. Select one or more **Programmes** they teach under from the official programme hierarchy (e.g., *Technology Programme*, *Creative & Design*, *Music*, *Academics*).
    2. Select and configure the specific **Teaching Fields / Subjects / Sub-Programmes** under each selected programme and save active programme/field selections directly to their tutor profile (`users` & `tutorSubjectSelections` in Firestore).
    3. Submit new custom subject/course proposals for admin approval directly from the same Settings panel.
