# Jaystarbliss Studios — Repository & UI Surface Inventory

## 1. Executive Summary & Workspace Recount

This audit documents the actual repository surface for **Jaystarbliss Studios / Jaystarbliss Dynamic Institute (`jaystarbliss-studios-react`)** prior to and during the Master Portal Redesign.

| Category | Count | Location / Scope |
| --- | --- | --- |
| Public & Shared Page Modules | 21 | `src/pages/*.tsx` |
| Authenticated Portal Page Modules | 32 | `src/pages/portal/*.tsx` (including `SchoolExaminationOverview.tsx`) |
| Administrator / CMS Page Modules | 29 | `src/pages/admin/*.tsx` |
| Shared Component Modules | 68 | `src/components/**/*.{tsx,ts,css}` |
| Netlify Serverless Functions | 55 | `netlify/functions/*.{ts,mts}` |
| Core Library & Domain Modules | 13 | `src/lib/*.ts` |
| Automated Node Test Suites | 4 | `tests/*.test.mjs` |
| Declared Route Entries in `src/App.tsx` | 86 | Public, Student, Staff/Tutor, Parent, School, Admin |

---

## 2. Public & Shared Application Pages (`src/pages/`)

All public marketing pages and shared entry points are preserved with their original art direction, CMS bindings, and interactive animations (including the protected Homepage Orb Hero / Galaxy Orbit animation):

1. `Home.tsx` — Public homepage with protected `Hero.tsx`, `GalaxyOrbit.tsx`, `CorePillars.tsx`, `FeaturedPrograms.tsx`, `FeaturedServices.tsx`, `FeaturedPortfolio.tsx`, `AudiencePathways.tsx`, `LearningMethod.tsx`, and `FinalCTA.tsx`.
2. `About.tsx` — Institutional story, mission, leadership, and vision.
3. `Programs.tsx` — Interactive 3D-style program showcase slider, flowing 5-stage learning architecture pathway, roadmap, and pathfinder.
4. `ProgramDetails.tsx` — Individual program curriculum, stages, syllabus download, and enrollment CTA.
5. `Services.tsx` — Software engineering and institutional consulting catalog.
6. `ServiceDetails.tsx` — Detailed service breakdown and project request CTA.
7. `Portfolio.tsx` — Client case studies and Kids Corner / Scholar builds showcase.
8. `Contact.tsx` — Public inquiry form with Firestore + email notification dispatch.
9. `ProjectRequest.tsx` — Custom software/project request intake workflow.
10. `SchoolPartnershipV2.tsx` (`SchoolPartnership.tsx` legacy) — Partner school onboarding application workflow.
11. `TutorApplication.tsx` — Tutor/instructor application and credential submission workflow.
12. `FAQ.tsx` — Frequently asked questions and knowledge base.
13. `FindTutor.tsx` — Approved tutor directory and subject matching request workflow.
14. `Resources.tsx` — Public learning resources and downloads.
15. `Blog.tsx` & `BlogPostDetails.tsx` — News Corner bulletins and technical blog articles.
16. `Register.tsx` — Student, parent, and tutor registration entry flow.
17. `SecurePortalLogin.tsx` (`Portal.tsx` legacy) — Unified multi-role authentication gateway supporting email/password, Google OAuth, and student username/access-code login compatibility.
18. `MagicParticles.tsx` — Interactive 3D WebGL particle experience (`/magic-particles`, `/kids-zone/magic`).

---

## 3. Authenticated Portal Pages (`src/pages/portal/`)

1. `PortalHomeWithBilling.tsx` — Role router dispatching to `StudentDashboard`, `StaffDashboard`, `ParentDashboard`, or `SchoolDashboard`.
2. `StudentDashboard.tsx` — Student learning home, active track progress, upcoming examinations, assignments, live classes, and certificates.
3. `StaffDashboard.tsx` — Tutor workspace overview, assigned schools, student roster, teaching schedules, and quick actions.
4. `ParentDashboard.tsx` — Family learning overview, linked-child selector, child enrollment request modal, tuition status, and academic progress.
5. `SchoolDashboard.tsx` — Partner school command overview, active learner counts, class links, schedules, and partnership summary.
6. `TutorExaminations.tsx` — Unified examination workspace supporting **External Link / Google Forms** and **Native Jaystarbliss CBT** creation, question authoring, script/CSV import, live proctoring, response analytics, grading, and result release.
7. `SchoolExaminationOverview.tsx` — Dedicated School Administrator Examination Overview (`/portal/school/exams`) displaying current & upcoming examinations, schedules, classes, subjects, and student access passcodes.
8. `ExaminationHistory.tsx` — Historical examination archive (`/portal/school/exam-history`, `/portal/staff/exam-history`, `/admin/examination-history`) with attempt filtering, authoritative score/percentage calculation, individual official PDF report generation, bulk Excel (`.xlsx`) export, and bulk PDF ZIP archive download.
9. `StudentExaminations.tsx` — Student examination center for passcode verification, starting native timed attempts, launching external-link exams, and viewing released results.
10. `StudentExamAttempt.tsx` — Timed CBT examination runner with autosave queue, offline resilience, automatic expiry submission, and official released performance report view.
11. `ParentExaminationResults.tsx` — Parent view for linked children's released examination scores, feedback, and official PDF report downloads.
12. `PortalCourses.tsx` — Curriculum learning tracks, stage progression, and syllabus downloads.
13. `ResourceLibrary.tsx` — Role-scoped curriculum resource library (read/write for staff/admin, read/download for students/parents/schools).
14. `AssignmentCenter.tsx` — Multi-role assignment authoring, submission, grading, and feedback center.
15. `MilestoneCenter.tsx` — Academic milestone tracking and verification across student, staff, and parent roles.
16. `AssessmentCenter.tsx` — Continuous assessments, quizzes, and coursework records.
17. `PortalCalendar.tsx` — Unified class schedule and academic timetable view.
18. `PortalLiveClasses.tsx` — Tutor live classroom session manager and attendance tracker.
19. `StudentLiveClassrooms.tsx` — Student live classroom join links and timetable.
20. `BillingCenter.tsx` (`PortalPayments.tsx`) — Multi-role billing, Paystack tuition checkout, tutor wallet payouts, bank account resolution, and ledger history.
21. `PortalSettings.tsx` — Account profile, password management, theme/high-contrast toggles, and notification preferences.
22. `PortalSupport.tsx` — Help desk ticket submission, FAQ, and support contact channels.
23. `StudentAchievements.tsx` — Badges, mastery milestones, and downloadable PDF certificates.
24. `StudentEdgeClub.tsx` — Ed Club typing and digital fluency launch center.
25. `StudentCredentialCenter.tsx` — School and tutor student access code and username directory with printable/exportable credential slips.
26. `TutorSubjects.tsx` — Tutor subject specialization selection and admin approval status tracker.
27. `SchoolRoster.tsx` — Partner school student roster, class filtering, and learner status management.
28. `SchoolLearnerInsights.tsx` — School-scoped learner academic insights, assessment analytics, and progress reports.
29. `SchoolStudentOnboardingV2.tsx` (`SchoolStudentOnboarding.tsx`) — Single and bulk CSV student onboarding with automatic credential generation.
30. `StaffStudentWorkspace.tsx` — Tutor deep-dive workspace for an individual student's assignments, milestones, assessments, and attendance.

---

## 4. Administrator & CMS Pages (`src/pages/admin/`)

1. `AdminDashboard.tsx` — Executive operational KPIs, revenue summary, user growth, pending approvals, and quick administrative actions.
2. `AdminApprovals.tsx` — Central approval queue for school partnerships, parent child-enrollment requests, tutor applications, and student accounts.
3. `AdminInquiries.tsx` — CRM pipeline for public inquiries, project requests, follow-up notes, and stage progression.
4. `AdminStudents.tsx` — Platform-wide scholar directory, individual/school filtering, credential management, tutor allocation, and direct onboarding.
5. `AdminParents.tsx` — Parent account directory, family linking, and tuition status management.
6. `AdminStaff.tsx` — Faculty & staff directory, staff invitations, school assignment (`StaffSchoolAssignments.tsx`), and status controls.
7. `AdminTutorSubjects.tsx` — Review and approve/reject tutor subject applications and match tutor requests.
8. `AdminSchools.tsx` — Partner school registry, access code management, tutor assignments, and school portal synchronization.
9. `AdminSchoolOnboarding.tsx` — Direct partner school provisioning and school administrator credential issuance.
10. `AdminClassSchedules.tsx` — Platform-wide recurring class schedules, live classroom links, and attendance logs.
11. `AdminBilling.tsx` — Financial ledger, Paystack transaction reconciliation, tutor wallet withdrawal approvals, and fee reminders.
12. `AdminReports.tsx` — Executive analytical reports and CSV/PDF exports.
13. `AdminResources.tsx` — Platform-wide curriculum resource upload and distribution manager.
14. `AdminUsers.tsx` — RBAC user management, role reassignment, account enable/suspend, and super-admin guarded permanent deletion.
15. `AdminSettings.tsx` — System configuration, Cloudinary media settings, and platform defaults.
16. `AdminNotifications.tsx` — Broadcast push/in-app notification composer and delivery history.
17. `AdminActivityLogs.tsx` — Real-time security and operational audit log viewer.
18. `AdminPages.tsx` & `AdminPageForm.tsx` — Section-based visual CMS for public website pages.
19. `AdminPrograms.tsx` & `AdminProgramForm.tsx` — Curriculum program and learning track CMS.
20. `AdminServices.tsx` & `AdminServiceForm.tsx` — Services catalog CMS.
21. `AdminPortfolio.tsx` & `AdminPortfolioForm.tsx` — Client case studies and student game showcase CMS.
22. `AdminKidsProjects.tsx` — Kids Zone student project moderation and showcase manager.
23. `AdminBlog.tsx` & `AdminBlogForm.tsx` — News Corner bulletins and blog article CMS.
