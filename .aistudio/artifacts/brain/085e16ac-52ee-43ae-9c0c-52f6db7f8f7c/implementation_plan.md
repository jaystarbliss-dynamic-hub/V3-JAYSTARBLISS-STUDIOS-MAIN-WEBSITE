# Jaystarbliss Portal-Wide Architectural Wireframes & 38-Page Redesign Blueprint

We audited every single route, sidebar tab, and sub-view across all **5 Portal Ecosystems** (Tutor/Staff, Scholar/Student, Parent, Partner School, and Super Admin) to eliminate vertical clutter, scrolling fatigue, and cramped tables.

> **Interactive Full-Screen Viewer Available:** You can also inspect and zoom into all 5 high-resolution wireframe boards directly inside the app at **`/wireframes`** (or click the **"Redesign Wireframes (5 Boards)"** button in the top bar of any portal or admin page).

---

## Board 01 — Complete Portal Information Architecture & 38-Page Tab Map
![Board 01: Complete Portal Information Architecture & 38-Page Tab Map](/assets/wireframes/01-portal-sitemap-architecture.svg)

### Why It Was Feeling Cluttered Before
- **38 pages across 5 roles** used inconsistent page headers, stacked cards, and duplicated sub-navigation.
- Tutors and Admins had to jump between separate pages or scroll down thousands of pixels to perform linked workflows (e.g., creating an assessment vs. checking who submitted it, or viewing a student roster vs. resetting their access code).

### What This Redesign Changes Across All 5 Portals
1. **Tutor / Staff Portal (13 Tabs Consolidated into 4 Focused Groups):**
   - **Overview:** `Dashboard` (`/portal/staff`)
   - **Teaching:** `My Students` (`/portal/staff/students`), `Student Access` (`/portal/staff/credentials`), `Subjects I Teach` (`/portal/staff/subjects`), `Live Classes` (`/portal/staff/classes`), `Class Schedules` (`/portal/staff/calendar`), `Resources` (`/portal/staff/resources`)
   - **Academic Tracking:** `Assignments` (`/portal/staff/assignments`), `Milestones` (`/portal/staff/milestones`), `Assessments Studio` (`/portal/staff/assessments`), `Assessment History` (`/portal/staff/exam-history`)
   - **Account:** `Agreements` (`/portal/staff/agreements`), `Earnings` (`/portal/staff/payments`), `Support` (`/portal/staff/support`), `Settings` (`/portal/staff/settings`)
2. **Scholar / Student Portal (11 Tabs):**
   - **Overview:** `Dashboard` (`/portal/student`)
   - **Learning:** `Learning & Tracks` (`/portal/student/courses`), `Ed Club` (`/portal/student/edge-club`), `Live Classrooms` (`/portal/student/live-classrooms`), `Class Schedules` (`/portal/student/schedules`), `Resources` (`/portal/student/resources`)
   - **Progress:** `Assignments` (`/portal/student/assignments`), `Milestones` (`/portal/student/milestones`), `Assessments` (`/portal/student/assessments`), `Achievements` (`/portal/student/achievements`)
   - **Account:** `Billing` (`/portal/student/payments`), `Support` (`/portal/student/support`), `Settings` (`/portal/student/settings`)
3. **Parent Portal (9 Tabs):**
   - **Overview:** `Dashboard` (`/portal/parent`) with a persistent **Top Child Switcher Bar** so parents with multiple children (e.g., Jayden & Shawn Torru, or Zoe & Joanna Udofia) switch children in 1 click without losing context.
   - **Child Progress:** `Assignments`, `Milestones`, `Assessment Results` (`/portal/parent/examinations`), `Class Schedules`, `Resources`
   - **Account:** `Agreements`, `Billing`, `Support`, `Settings`
4. **Partner School Portal (11 Tabs):**
   - **Overview:** `Dashboard` (`/portal/school`)
   - **Students:** `Learners Roster` (`/portal/school/roster`), `Student Access` (`/portal/school/credentials`), `Learner Progress` (`/portal/school/learner-progress`), `Assessment Overview` (`/portal/school/exams`), `Onboard Student` (`/portal/school/onboard-student`)
   - **Operations & Account:** `Class Schedules`, `Class Links`, `Resources`, `Agreements`, `Programme & Billing`, `Support`, `Settings`
5. **Super Admin Hub (22 Tabs Across 5 Collapsible Sections):**
   - Unified Master-Detail patterns across `Scholars & Students` (`/admin/students`), `Assessments` (`/admin/examinations`), `Users & RBAC` (`/admin/users`), `Affiliated Schools` (`/admin/schools`), `Faculty & Staff` (`/admin/staff`), `Approvals`, `Billings / Fees`, and CMS modules.

---

## Board 02 — Tutor & Admin Assessment Studio (`/portal/staff/assessments` & `/admin/examinations`)
![Board 02: Tutor & Admin Assessment Studio (Zero-Scroll Split Workspace)](/assets/wireframes/02-tutor-assessment-studio.svg)

### Why It Was "Choking" Before
- `TutorExaminations.tsx` is currently a **4,905-line single vertical page**.
- The **Existing Assessments & History list sits at line 4,450** at the very bottom of the page—below the metadata form, below the recipient targeting list, and below every single question card.
- To monitor student responses or switch to another exam, a tutor had to scroll all the way to the bottom, click an assessment or "Monitor Responses", and scroll all the way back to the top.

### How the New Split-Pane Assessment Studio Solves It
1. **Pinned Left Rail — Assessment Directory & History (`320px` Fixed Height, Independently Scrollable):**
   - Always visible on the left side of the screen.
   - Instant search + filter tabs (`All (14)`, `Published (8)`, `Drafts (3)`, `History (3)`).
   - Clicking any assessment card immediately loads it into the right workspace **with zero page scrolling**.
   - Each card shows live submission counts (`38/42 Submitted`) and a 1-click **`Monitor Live ->`** action.
2. **Right Workspace — 4-Tab Mode Switcher in a Sticky Top Bar:**
   - **Tab 1: `1. Setup & Recipients`** — Exam title, subject, duration, pass mark, schedule window, and the clean **Categorized Student Targeting List** (`All Available`, `School-Assigned`, `Private Learners` + Grade/Cohort pills) with search and 1-click "Select Filtered".
   - **Tab 2: `2. Question Builder`** — Horizontal **Question Navigator Strip** (`Q1` … `Q25` pills + `+ Add Question` + `Import CSV/Doc`) so tutors jump directly to Question 19 without scrolling past Questions 1–18, paired with a focused single-question or compact-list editor.
   - **Tab 3: `3. Live Monitor & Responses`** — Real-time submission counter (`Submitted`, `In Progress`, `Not Started`), per-student score breakdown, auto-grade / manual score override, and **1-Click "Release Selected Results"**.
   - **Tab 4: `4. Analytics & Export`** — Grade distribution, hardest questions, and 1-click PDF/CSV result sheet export.

---

## Board 03 — Scholars & Students Command Center (`/admin/students`, `/portal/staff/students`, `/portal/school/roster`, `/portal/staff/credentials`)
![Board 03: Scholars & Students Command Center (Master-Detail Table + 360° Inspector Drawer)](/assets/wireframes/03-scholars-students-directory.svg)

### Why It Was "Choking" Before
- In `AdminStudents.tsx` (2,370 lines), a massive "Dispatch Individual Learning Resource" form, partner school summary cards, filter controls, and a crowded table with 7+ action buttons per row were all stacked vertically.
- Tutors and Admins had to open separate modals or navigate away just to check a scholar's access code, parent linkage, assigned tutor, or exam submissions.

### How the New Master-Detail + 360° Inspector Drawer Solves It
1. **Compact 4-Card KPI Strip (`64px` height):**
   - `Total Active Scholars`, `School-Assigned Scholars`, `Private / Individual Learners`, and `Access Codes Active`.
2. **Single-Row Segmented Scope Bar:**
   - Segmented toggle: **`All Scholars`** | **`School-Assigned`** | **`Private / Individual`** | **`By Grade/Track`** + School dropdown + Instant Search (`Name, Access Code, Email, Parent`).
3. **Breathing 5-Column Master Table:**
   - Only essential columns in the table (`Scholar & ID`, `Enrollment Type`, `School / Parent Link`, `Grade & Track`, `Access Code & Status`) so no text is truncated or squished.
4. **Docked Right 360° Scholar Inspector Drawer (`400px` Slide-Over):**
   - Clicking any student row opens their complete profile on the right without leaving the list:
     - **Overview & Access Tab:** Instant copy/reset for `JDI-XXXX-XXXX` Access Code, Parent Account Link status (e.g., linked to Eno Torru / Aniebiet Udofia), Assigned Tutor selector, and feature toggles (`CBT Assessments`, `Ed Club`).
     - **Assessments Tab:** All exams taken, scores, and 1-click result release.
     - **Assignments & Milestones Tab:** Current projects and curriculum stage progress.
     - **Resources Tab:** Quick "Dispatch Resource to Scholar" form tucked neatly inside the drawer (or triggered via the top button) instead of pushing the entire student table down the page.

---

## Board 04 — Tutor Teaching Workspace (`Dashboard`, `Assignments`, `Milestones`, `Resources`, `Live Classes`, `Subjects`)
![Board 04: Tutor Teaching Workspace (Assignments Split Queue, Milestones & Resource Targeting)](/assets/wireframes/04-tutor-teaching-workspace.svg)

### Key Improvements Across All Other Tutor Tabs
1. **Tutor Home Dashboard (`/portal/staff`):**
   - Replaces long vertical lists with a 4-stat header (`Assigned Scholars`, `Pending Submissions to Grade`, `Active Assessments`, `Next Live Class`) + **Assigned Scholars Quick-Table** (with `All` / `School-Assigned` / `Private` filter pills) + **Needs Grading Queue**.
2. **Assignments Center (`/portal/staff/assignments`):**
   - **2-Pane Grading Queue:** Left pane lists assignments (`Needs Grading`, `Active`, `Graded`); right pane shows student submissions with inline score input (`/100`), feedback box, and `Save & Next Student` so tutors grade 20 students in seconds.
3. **Milestones Matrix (`/portal/staff/milestones`):**
   - Cohort progress matrix where tutors check off curriculum stages across their assigned scholars without opening 15 separate pages.
4. **Resources & Live Classes (`/portal/staff/resources`, `/portal/staff/classes`):**
   - Uses the exact same **Categorized Student Targeting List** (`All Available`, `School-Assigned`, `Private Learners`) so dispatching study materials or scheduling a live class is 100% consistent with the Assessment Studio.

---

## Board 05 — Scholar Portal, Parent Multi-Child Portal & Partner School Portal
![Board 05: Scholar Portal, Parent Multi-Child Switcher Portal & Partner School Portal](/assets/wireframes/05-student-parent-school-portals.svg)

### Key Improvements for Students, Parents, and Partner Schools
1. **Scholar / Student Portal (`/portal/student/*`):**
   - **Assessments Tab (`/portal/student/assessments`):** Clearly separated into **3 Scannable Sections**:
     1. **`Available Now — Ready to Start`** (Prominent green card with `Start Assessment Now ->` button—never falsely marked "Completed" before the student takes it).
     2. **`Submitted — Awaiting Result Release`** (Clear amber status badge so the student knows their submission is recorded and awaiting teacher release).
     3. **`Released Results & Certificates`** (Score badge + full question breakdown).
2. **Parent Portal (`/portal/parent/*`):**
   - **Persistent Top Child Switcher Bar:** Parents with multiple children (such as **Eno Torru** viewing **Jayden Torru** & **Shawn Torru**, or **Aniebiet Udofia** viewing **Zoe** & **Joanna**) see a prominent child selector pill bar at the top of every tab (`Dashboard`, `Assessment Results`, `Assignments`, `Milestones`, `Billing`) to switch between children in 1 click.
3. **Partner School Portal (`/portal/school/*`):**
   - Clean **Cohort & Grade Filter Bar** (`All Grades`, `Grade 7`, `Grade 8`, `Year 2`) across `Learners Roster`, `Student Access` (bulk printable credential cards), and `Assessment Overview` (school-wide score analytics and released result sheets).

---

## Summary of Implementation Phases (Once You Give the Go-Ahead)
1. **Phase 1 — Tutor & Admin Assessment Studio Refactor (`TutorExaminations.tsx`):** Convert the 4,905-line vertical stack into the zero-scroll Split-Pane Studio (Pinned Left Assessment Directory + 4-Mode Right Workspace: Setup & Recipients, Question Builder with Q1–Q25 Navigator Strip, Live Monitor & Responses, and Analytics).
2. **Phase 2 — Scholars & Students Master-Detail Directory (`AdminStudents.tsx`, `StaffStudentWorkspace.tsx`, `SchoolRoster.tsx`, `StudentCredentialCenter.tsx`):** Move stacked dispatch forms into drawers/modals, implement the 5-column Master Table with `All` / `School-Assigned` / `Private` segmented filters, and add the docked **360° Scholar Inspector Drawer**.
3. **Phase 3 — Tutor Teaching Tabs (`AssignmentCenter.tsx`, `MilestoneCenter.tsx`, `ResourceLibrary.tsx`):** Apply the 2-pane grading queue and unified categorized student selector.
4. **Phase 4 — Student, Parent & Partner School Portals (`StudentExaminations.tsx`, `ParentExaminationResults.tsx`, `SchoolExaminationOverview.tsx`):** Add the 3-state Student Exam cards, Parent Multi-Child Switcher Bar, and Partner School grade cohort filters.
