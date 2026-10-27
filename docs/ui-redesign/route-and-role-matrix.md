# Jaystarbliss Studios — Route, Role & Header Title Matrix

## 1. Shared Shell & Route-Aware Header Architecture

All authenticated routes render inside one of two standardized shells:
- **`PortalLayout` (`src/components/portal/PortalLayout.tsx`)**: Used by `STUDENT`, `STAFF` / `TUTOR`, `PARENT`, and `SCHOOL` / `SCHOOL_ADMIN`.
- **`AdminLayout` (`src/components/admin/AdminLayout.tsx`)**: Used by `SUPER_ADMIN`, `ADMIN`, `CMS_ADMIN`, and `CONTENT_ADMIN`.

Both shells enforce:
- A single sticky header (`48–56px` height, `h-13 sm:h-14`) within the active scroll container.
- The **current route-aware page title** as the sole visible text in the topbar.
- Compact icon/avatar controls with accessible `aria-label` and `Tooltip` descriptions for navigation drawer toggle, notifications, support desk, theme toggle, impersonation (Admin), search (Admin), and profile menu.
- Edge-swipe drawer support (`useEdgeSwipeDrawer`) on mobile/tablet viewports.
- No visible unverified-email notification banner in any authenticated shell.

---

## 2. Route & Role Matrix (`src/App.tsx`)

### A. Public & Authentication Routes

| Route Pattern | Component | Allowed Roles | Shell |
| --- | --- | --- | --- |
| `/` | `Home` | Public | `MainLayout` |
| `/about` | `About` | Public | `MainLayout` |
| `/programs`, `/programs/:slug` | `Programs`, `ProgramDetails` | Public | `MainLayout` |
| `/services`, `/services/:slug` | `Services`, `ServiceDetails` | Public | `MainLayout` |
| `/portfolio` | `Portfolio` | Public | `MainLayout` |
| `/magic-particles`, `/kids-zone/magic` | `MagicParticles` | Public | Standalone 3D |
| `/contact`, `/project-request` | `Contact`, `ProjectRequest` | Public | `MainLayout` |
| `/school-partnership` | `SchoolPartnershipV2` | Public | `MainLayout` |
| `/tutors`, `/find-tutor`, `/tutor-application` | `FindTutor`, `TutorApplication` | Public | `MainLayout` |
| `/faq`, `/resources`, `/blog`, `/blog/:slug` | `FAQ`, `Resources`, `Blog`, `BlogPostDetails` | Public | `MainLayout` |
| `/portal`, `/admin/login` | `SecurePortalLogin` | Public / Auth | Standalone Auth |
| `/register` | `Register` | Public | Standalone Auth |

### B. Student Portal Routes (`/portal/student/*`)

Allowed Roles: `STUDENT`, `INDIVIDUAL_STUDENT`, `INDIVIDUALSTUDENT`

| Route Pattern | Component | Sticky Header Title | Key Workflows Preserved |
| --- | --- | --- | --- |
| `/portal/student` | `PortalHomeWithBilling` -> `StudentDashboard` | `Dashboard` | Active courses, upcoming exams, assignments, certificates |
| `/portal/student/courses` | `PortalCourses` | `Learning & Tracks` | Track progression, stage modules, syllabus PDF |
| `/portal/student/assessments` | `AssessmentCenter` | `Assessments` | Quizzes and continuous assessment scores |
| `/portal/student/assignments` | `AssignmentCenter` | `Assignments` | Assignment instructions, submission, tutor feedback |
| `/portal/student/milestones` | `MilestoneCenter` | `Milestones` | Learning milestone checklist and verification |
| `/portal/student/exams` | `StudentExaminations` | `Examinations` | Passcode entry, start native exam, open external-link exam |
| `/portal/student/exams/:attemptId` | `StudentExamAttempt` | `Examination Attempt` | Timed CBT runner, autosave, submit, released PDF report |
| `/portal/student/edge-club` | `StudentEdgeClub` | `Ed Club` | Typing & digital fluency portal |
| `/portal/student/schedules`, `/portal/student/calendar` | `PortalCalendar` | `Class Schedules` | Programme timetable & session status |
| `/portal/student/live-classrooms`, `/portal/student/live-classes` | `StudentLiveClassrooms` | `Live Classrooms` | Join authorised live online classes |
| `/portal/student/achievements` | `StudentAchievements` | `Achievements` | Mastery badges & downloadable certificates |
| `/portal/student/resources` | `ResourceLibrary` | `Resources` | Curriculum downloads & lesson materials |
| `/portal/student/payments` | `StudentBillingGate` -> `BillingCenter` | `Billing` | Individual student tuition & payment receipts |
| `/portal/student/support` | `PortalSupport` | `Support` | Support tickets & help desk |
| `/portal/student/settings` | `PortalSettings` | `Settings` | Profile, password change, appearance |

### C. Tutor / Staff Portal Routes (`/portal/staff/*`)

Allowed Roles: `TUTOR`, `STAFF`, `INSTRUCTOR`

| Route Pattern | Component | Sticky Header Title | Key Workflows Preserved |
| --- | --- | --- | --- |
| `/portal/staff` | `PortalHomeWithBilling` -> `StaffDashboard` | `Dashboard` | Assigned schools, learners, teaching schedule, payouts |
| `/portal/staff/classes` | `PortalLiveClasses` | `Live Classes` | Manage class links, session status, attendance |
| `/portal/staff/calendar` | `PortalCalendar` | `Class Schedules` | Teaching timetable |
| `/portal/staff/subjects` | `TutorSubjects` | `Subjects I Teach` | Submit subjects for approval, view status |
| `/portal/staff/students/:studentId` | `StaffStudentWorkspace` | `Student Details` | Individual learner academic workspace |
| `/portal/staff/credentials` | `StudentCredentialCenter` | `Student Access` | View/copy student usernames & access codes |
| `/portal/staff/assignments` | `AssignmentCenter` | `Assignments` | Create, grade, and return assignments |
| `/portal/staff/milestones` | `MilestoneCenter` | `Milestones` | Update learner milestones |
| `/portal/staff/assessments` | `AssessmentCenter` | `Assessments` | Record and publish continuous assessments |
| `/portal/staff/exams`, `/portal/staff/exam-authoring` | `TutorExaminations` | `Examinations` | Create/edit External Link or Native CBT exams, import, proctor |
| `/portal/staff/exam-history` | `ExaminationHistory` (`mode="history"`) | `Examination History` | Completed exams, attempts, release results, PDF/XLSX/ZIP export |
| `/portal/staff/resources` | `ResourceLibrary` | `Resources` | Publish and manage lesson resources |
| `/portal/staff/payments` | `BillingCenter` | `Billing` | Tutor wallet, earnings ledger, bank withdrawal |
| `/portal/staff/support` | `PortalSupport` | `Support` | Support tickets |
| `/portal/staff/settings` | `PortalSettings` | `Settings` | Tutor profile & security settings |

### D. Parent Portal Routes (`/portal/parent/*`)

Allowed Roles: `PARENT`

| Route Pattern | Component | Sticky Header Title | Key Workflows Preserved |
| --- | --- | --- | --- |
| `/portal/parent` | `PortalHomeWithBilling` -> `ParentDashboard` | `Dashboard` | Linked children switcher, child enrollment modal, tuition |
| `/portal/parent/schedules`, `/portal/parent/calendar` | `PortalCalendar` | `Class Schedules` | Linked child's class schedule |
| `/portal/parent/resources` | `ResourceLibrary` | `Resources` | Linked child's learning resources |
| `/portal/parent/assignments` | `AssignmentCenter` | `Assignments` | Linked child's assignments & grades |
| `/portal/parent/milestones` | `MilestoneCenter` | `Milestones` | Linked child's milestone progress |
| `/portal/parent/assessments` | `AssessmentCenter` | `Assessments` | Linked child's continuous assessment records |
| `/portal/parent/examinations` | `ParentExaminationResults` | `Examination Results` | Linked child's released CBT exam results & official PDF report |
| `/portal/parent/payments` | `BillingCenter` | `Billing` | Family tuition invoices, Paystack checkout, receipts |
| `/portal/parent/support` | `PortalSupport` | `Support` | Parent help desk |
| `/portal/parent/settings` | `PortalSettings` | `Settings` | Parent account settings |

### E. School Administrator Portal Routes (`/portal/school/*`)

Allowed Roles: `SCHOOL`, `SCHOOL_ADMIN`

| Route Pattern | Component | Sticky Header Title | Key Workflows Preserved |
| --- | --- | --- | --- |
| `/portal/school` | `PortalHomeWithBilling` -> `SchoolDashboard` | `Dashboard` | School KPIs, active classes, quick actions |
| `/portal/school/schedules`, `/portal/school/calendar` | `SchoolDashboard` / `PortalCalendar` | `Class Schedules` | School class timetable & session status |
| `/portal/school/exams` | `SchoolExaminationOverview` | `Examination Overview` | Current & upcoming school exams, classes, access passcodes |
| `/portal/school/exam-history` | `ExaminationHistory` (`mode="history"`) | `Examination History` | Past/completed exams, student attempts, scores, bulk PDF/XLSX/ZIP |
| `/portal/school/learner-progress`, `/portal/school/assessments` | `SchoolLearnerInsights` | `Learner Progress` | School-scoped learner analytics & assessment reports |
| `/portal/school/roster` | `SchoolRoster` | `Learners Roster` | School student directory, class filter, status toggle |
| `/portal/school/onboard-student` | `SchoolStudentOnboardingV2` | `Onboard Student` | Single & bulk CSV student onboarding |
| `/portal/school/credentials` | `StudentCredentialCenter` | `Student Access` | School student usernames, access codes & printable slips |
| `/portal/school/links` | `SchoolDashboard` (`initialTab="links"`) | `Class Links` | Live classroom links for school classes |
| `/portal/school/partnership` | `SchoolDashboard` (`initialTab="partnership"`) | `Programme & Billing` | School partnership details |
| `/portal/school/payments` | `BillingCenter` | `Billing` | Institutional billing, fee ledger, Paystack payments |
| `/portal/school/resources` | `ResourceLibrary` | `Resources` | Institutional curriculum resources |
| `/portal/school/support` | `PortalSupport` | `Support` | Institutional support desk |
| `/portal/school/settings` | `PortalSettings` | `Settings` | School administrator profile & password settings |

### F. Administrator & CMS Console Routes (`/admin/*`)

Allowed Roles: `SUPER_ADMIN`, `ADMIN`, `CMS_ADMIN`, `CONTENT_ADMIN`

| Route Pattern | Component | Sticky Header Title | Key Workflows Preserved |
| --- | --- | --- | --- |
| `/admin` | `AdminDashboard` | `Dashboard` | System KPIs, revenue, user growth, quick actions |
| `/admin/inquiries` | `AdminInquiries` | `Inquiries & Leads` | Inquiry CRM stages, follow-ups, notes |
| `/admin/activity` | `AdminActivityLogs` | `Activity Logs` | Authentication & administrative audit trail |
| `/admin/pages`, `/admin/pages/new`, `/admin/pages/:id` | `AdminPages`, `AdminPageForm` | `Pages & Section CMS` / `Create Page` / `Edit Page` | Public website visual section editor |
| `/admin/programs`, `/admin/programs/new`, `/admin/programs/:id` | `AdminPrograms`, `AdminProgramForm` | `Programs & Courses` / `Create Program` / `Edit Program` | Curriculum tracks & stages CMS |
| `/admin/services`, `/admin/services/new`, `/admin/services/:id` | `AdminServices`, `AdminServiceForm` | `Services Catalog` / `Create Service` / `Edit Service` | Services CMS |
| `/admin/portfolio`, `/admin/portfolio/new`, `/admin/portfolio/:id` | `AdminPortfolio`, `AdminPortfolioForm` | `Portfolio Showcase` / `Create Case Study` / `Edit Case Study` | Portfolio & Kids Corner games CMS |
| `/admin/kids-projects` | `AdminKidsProjects` | `Kids Zone Builds` | Student project moderation |
| `/admin/blog`, `/admin/blog/new`, `/admin/blog/:id` | `AdminBlog`, `AdminBlogForm` | `News Corner & Blog` / `Create Blog Post` / `Edit Blog Post` | News Corner & Blog CMS |
| `/admin/approvals` | `AdminApprovals` | `Approvals & Requests` | School, parent, tutor & student approvals |
| `/admin/students` | `AdminStudents` | `Scholars & Students` | Student directory, onboarding, credentials |
| `/admin/parents` | `AdminParents` | `Parents` | Parent directory & family links |
| `/admin/billing` | `AdminBilling` | `Billing` | Tuition ledger, Paystack verification, payouts |
| `/admin/reports` | `AdminReports` | `Reports` | Financial & academic analytics exports |
| `/admin/staff` | `AdminStaff` | `Faculty & Staff` | Staff directory, school assignments, invitations |
| `/admin/tutor-subjects` | `AdminTutorSubjects` | `Tutor Subjects` | Tutor subject approvals & client tutor matching |
| `/admin/schools`, `/admin/schools/onboard` | `AdminSchools`, `AdminSchoolOnboarding` | `Affiliated Schools` / `Onboard School` | Partner school management & provisioning |
| `/admin/schedules` | `AdminClassSchedules` | `Class Schedules` | Recurring class schedules & attendance |
| `/admin/resources` | `AdminResources` | `Learning Resources` | Curriculum resource management |
| `/admin/examinations` | `TutorExaminations` | `Examinations` | Platform-wide CBT & external exam authoring |
| `/admin/examination-history` | `ExaminationHistory` (`mode="history"`) | `Examination History` | Platform-wide submissions, grading & reports |
| `/admin/support` | `PortalSupport` | `Support` | Support ticket management |
| `/admin/notifications` | `AdminNotifications` | `Notifications` | Broadcast notifications |
| `/admin/users` | `AdminUsers` | `Users & RBAC` | Role changes, account status, super-admin deletion |
| `/admin/settings` | `AdminSettings` | `Settings` | Cloudinary & global system settings |
