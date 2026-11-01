import { Suspense, lazy } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { SessionTimeoutProvider } from "./contexts/SessionTimeoutContext";
import { MetaTagsProvider } from "./contexts/MetaTagsContext";
import { SearchProvider } from "./contexts/SearchContext";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import PageLoader from "./components/ui/PageLoader";
import AuditActivityTracker from "./components/ui/AuditActivityTracker";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import PageTransition from "./components/ui/PageTransition";
import Home from "./pages/Home";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NotificationDrawer } from "./components/notifications/NotificationDrawer";
import ScrollToTop from "./components/ScrollToTop";
import GlassRippleListener from "./components/ui/GlassRippleListener";
import MarqueeBanner from "./components/ui/MarqueeBanner";
import AdminImpersonationBanner from "./components/common/AdminImpersonationBanner";
import { FloatingWhatsApp } from "./components/ui/FloatingWhatsApp";

const About = lazy(() => import("./pages/About"));
const Programs = lazy(() => import("./pages/Programs"));
const ProgramDetails = lazy(() => import("./pages/ProgramDetails"));
const Services = lazy(() => import("./pages/Services"));
const ServiceDetails = lazy(() => import("./pages/ServiceDetails"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Contact = lazy(() => import("./pages/Contact"));
const ProjectRequest = lazy(() => import("./pages/ProjectRequest"));
const SchoolPartnership = lazy(() => import("./pages/SchoolPartnershipV2"));
const TutorApplication = lazy(() => import("./pages/TutorApplication"));
const FAQ = lazy(() => import("./pages/FAQ"));
const FindTutor = lazy(() => import("./pages/FindTutor"));
const SecurePortalLogin = lazy(() => import("./pages/SecurePortalLogin"));
const Register = lazy(() => import("./pages/Register"));
const Resources = lazy(() => import("./pages/Resources"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPostDetails = lazy(() => import("./pages/BlogPostDetails"));

const MagicParticles = lazy(() => import("./pages/MagicParticles"));
const PortalLayout = lazy(() => import("./components/portal/PortalLayout"));
const PortalHomeWithBilling = lazy(() => import("./pages/portal/PortalHomeWithBilling"));
const BillingCenter = lazy(() => import("./pages/portal/BillingCenter"));
const AssignmentCenter = lazy(() => import("./pages/portal/AssignmentCenter"));
const MilestoneCenter = lazy(() => import("./pages/portal/MilestoneCenter"));
const AssessmentCenter = lazy(() => import("./pages/portal/AssessmentCenter"));
const ParentExaminationResults = lazy(() => import("./pages/portal/ParentExaminationResults"));
const StudentExaminations = lazy(() => import("./pages/portal/StudentExaminations"));
const ExaminationHistory = lazy(() => import("./pages/portal/ExaminationHistory"));
const SchoolExaminationOverview = lazy(() => import("./pages/portal/SchoolExaminationOverview"));
const TutorExaminations = lazy(() => import("./pages/portal/TutorExaminations"));
const StudentExamAttempt = lazy(() => import("./pages/portal/StudentExamAttempt"));
const ResourceLibrary = lazy(() => import("./pages/portal/ResourceLibrary"));
const PortalCourses = lazy(() => import("./pages/portal/PortalCourses"));
const PortalLiveClasses = lazy(() => import("./pages/portal/PortalLiveClasses"));
const PortalCalendar = lazy(() => import("./pages/portal/PortalCalendar"));
const PortalSettings = lazy(() => import("./pages/portal/PortalSettings"));
const StaffStudentWorkspace = lazy(() => import("./pages/portal/StaffStudentWorkspace"));
const StudentCredentialCenter = lazy(() => import("./pages/portal/StudentCredentialCenter"));
const SchoolDashboard = lazy(() => import("./pages/portal/SchoolDashboard"));
const SchoolLearnerInsights = lazy(() => import("./pages/portal/SchoolLearnerInsights"));
const StudentAchievements = lazy(() => import("./pages/portal/StudentAchievements"));
const StudentLiveClassrooms = lazy(() => import("./pages/portal/StudentLiveClassrooms"));
const SchoolRoster = lazy(() => import("./pages/portal/SchoolRoster"));
const SchoolStudentOnboarding = lazy(() => import("./pages/portal/SchoolStudentOnboardingV2"));
const TutorSubjects = lazy(() => import("./pages/portal/TutorSubjects"));
const PortalSupport = lazy(() => import("./pages/portal/PortalSupport"));
const AgreementsCenter = lazy(() => import("./pages/portal/AgreementsCenter"));

const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminClassSchedules = lazy(() => import("./pages/admin/AdminClassSchedules"));
const ProtectedRoute = lazy(() => import("./components/admin/ProtectedRoute"));
const AdminPages = lazy(() => import("./pages/admin/AdminPages"));
const AdminPageForm = lazy(() => import("./pages/admin/AdminPageForm"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminPrograms = lazy(() => import("./pages/admin/AdminPrograms"));
const AdminProgramForm = lazy(() => import("./pages/admin/AdminProgramForm"));
const AdminServices = lazy(() => import("./pages/admin/AdminServices"));
const AdminServiceForm = lazy(() => import("./pages/admin/AdminServiceForm"));
const AdminBlog = lazy(() => import("./pages/admin/AdminBlog"));
const AdminBlogForm = lazy(() => import("./pages/admin/AdminBlogForm"));
const AdminPortfolio = lazy(() => import("./pages/admin/AdminPortfolio"));
const AdminPortfolioForm = lazy(() => import("./pages/admin/AdminPortfolioForm"));
const AdminKidsProjects = lazy(() => import("./pages/admin/AdminKidsProjects"));
const AdminInquiries = lazy(() => import("./pages/admin/AdminInquiries"));
const AdminApprovals = lazy(() => import("./pages/admin/AdminApprovals"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminStudents = lazy(() => import("./pages/admin/AdminStudents"));
const AdminParents = lazy(() => import("./pages/admin/AdminParents"));
const AdminStaff = lazy(() => import("./pages/admin/AdminStaff"));
const AdminSchools = lazy(() => import("./pages/admin/AdminSchools"));
const AdminSchoolOnboarding = lazy(() => import("./pages/admin/AdminSchoolOnboarding"));
const AdminResources = lazy(() => import("./pages/admin/AdminResources"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminActivityLogs = lazy(() => import("./pages/admin/AdminActivityLogs"));
const AdminBilling = lazy(() => import("./pages/admin/AdminBilling"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminTutorSubjects = lazy(() => import("./pages/admin/AdminTutorSubjects"));
const StudentEdgeClub = lazy(() => import("./pages/portal/StudentEdgeClub"));
const PortalWireframesShowcase = lazy(() => import("./pages/PortalWireframesShowcase"));

const StudentBillingGate = () =>
  sessionStorage.getItem("studentRegistrationType") === "individual" ? (
    <BillingCenter role="student" />
  ) : (
    <Navigate to="/portal/student" replace />
  );

const LazyFallback = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center" role="status" aria-live="polite">
      <div className="w-9 h-9 rounded-full border-2 border-brand-red border-t-transparent animate-spin mb-3" />
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Loading workspace…</span>
    </div>
  );
};

function AnimatedRoutes() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <Routes>
        <Route path="/" element={<PageTransition><Home /></PageTransition>} />
        <Route path="/wireframes" element={<PortalWireframesShowcase />} />
        <Route path="/about" element={<PageTransition><About /></PageTransition>} />
        <Route path="/programs" element={<PageTransition><Programs /></PageTransition>} />
        <Route path="/programs/:slug" element={<PageTransition><ProgramDetails /></PageTransition>} />
        <Route path="/services" element={<PageTransition><Services /></PageTransition>} />
        <Route path="/services/:slug" element={<PageTransition><ServiceDetails /></PageTransition>} />
        <Route path="/portfolio" element={<PageTransition><Portfolio /></PageTransition>} />
        <Route path="/magic-particles" element={<MagicParticles />} />
        <Route path="/kids-zone/magic" element={<MagicParticles />} />
        <Route path="/contact" element={<PageTransition><Contact /></PageTransition>} />
        <Route path="/support" element={<PageTransition><PortalSupport /></PageTransition>} />
        <Route path="/resources" element={<PageTransition><Resources /></PageTransition>} />
        <Route path="/blog" element={<PageTransition><Blog /></PageTransition>} />
        <Route path="/blog/:slug" element={<PageTransition><BlogPostDetails /></PageTransition>} />
        <Route path="/project-request" element={<PageTransition><ProjectRequest /></PageTransition>} />
        <Route path="/school-partnership" element={<PageTransition><SchoolPartnership /></PageTransition>} />
        <Route path="/tutors" element={<PageTransition><FindTutor /></PageTransition>} />
        <Route path="/find-tutor" element={<PageTransition><FindTutor /></PageTransition>} />
        <Route path="/tutor-application" element={<PageTransition><TutorApplication /></PageTransition>} />
        <Route path="/faq" element={<PageTransition><FAQ /></PageTransition>} />
        <Route path="/portal" element={<PageTransition><SecurePortalLogin /></PageTransition>} />
        <Route path="/register" element={<PageTransition><Register /></PageTransition>} />

        <Route path="/portal/student" element={<ProtectedRoute allowedRoles={['STUDENT', 'INDIVIDUAL_STUDENT', 'INDIVIDUALSTUDENT']} redirectPath="/portal"><PortalLayout /></ProtectedRoute>}>
          <Route index element={<PortalHomeWithBilling role="student" />} />
          <Route path="resources" element={<ResourceLibrary role="student" />} />
          <Route path="achievements" element={<StudentAchievements />} />
          <Route path="live-classrooms" element={<StudentLiveClassrooms />} />
          <Route path="live-classes" element={<StudentLiveClassrooms />} />
          <Route path="calendar" element={<PortalCalendar />} />
          <Route path="schedules" element={<PortalCalendar />} />
          <Route path="courses" element={<PortalCourses />} />
          <Route path="edge-club" element={<StudentEdgeClub />} />
          <Route path="assignments" element={<AssignmentCenter role="student" />} />
          <Route path="milestones" element={<MilestoneCenter role="student" />} />
          <Route path="assessments" element={<StudentExaminations />} />
          <Route path="exams" element={<StudentExaminations />} />
          <Route path="exams/:attemptId" element={<StudentExamAttempt />} />
          <Route path="payments" element={<StudentBillingGate />} />
          <Route path="support" element={<PortalSupport />} />
          <Route path="settings" element={<PortalSettings />} />
        </Route>

        <Route path="/portal/staff" element={<ProtectedRoute allowedRoles={['TUTOR', 'STAFF', 'INSTRUCTOR']} redirectPath="/portal"><PortalLayout /></ProtectedRoute>}>
          <Route index element={<PortalHomeWithBilling role="staff" />} />
          <Route path="students" element={<PortalHomeWithBilling role="staff" />} />
          <Route path="resources" element={<ResourceLibrary role="staff" />} />
          <Route path="subjects" element={<TutorSubjects />} />
          <Route path="classes" element={<PortalLiveClasses />} />
          <Route path="students/:studentId" element={<StaffStudentWorkspace />} />
          <Route path="student/:studentId" element={<StaffStudentWorkspace />} />
          <Route path="credentials" element={<StudentCredentialCenter role="staff" />} />
          <Route path="assignments" element={<AssignmentCenter role="staff" />} />
          <Route path="milestones" element={<MilestoneCenter role="staff" />} />
          <Route path="assessments" element={<TutorExaminations />} />
          <Route path="exams" element={<TutorExaminations />} />
          <Route path="exam-history" element={<ExaminationHistory mode="history" />} />
          <Route path="exam-authoring" element={<TutorExaminations />} />
          <Route path="agreements" element={<AgreementsCenter role="staff" />} />
          <Route path="calendar" element={<PortalCalendar />} />
          <Route path="payments" element={<BillingCenter role="staff" />} />
          <Route path="support" element={<PortalSupport />} />
          <Route path="settings" element={<PortalSettings />} />
        </Route>

        <Route path="/portal/parent" element={<ProtectedRoute allowedRoles={['PARENT']} redirectPath="/portal"><PortalLayout /></ProtectedRoute>}>
          <Route index element={<PortalHomeWithBilling role="parent" />} />
          <Route path="resources" element={<ResourceLibrary role="parent" />} />
          <Route path="assignments" element={<AssignmentCenter role="parent" />} />
          <Route path="milestones" element={<MilestoneCenter role="parent" />} />
          <Route path="assessments" element={<AssessmentCenter role="parent" />} />
          <Route path="examinations" element={<ParentExaminationResults />} />
          <Route path="agreements" element={<AgreementsCenter role="parent" />} />
          <Route path="calendar" element={<PortalCalendar />} />
          <Route path="schedules" element={<PortalCalendar />} />
          <Route path="payments" element={<BillingCenter role="parent" />} />
          <Route path="support" element={<PortalSupport />} />
          <Route path="settings" element={<PortalSettings />} />
        </Route>

        <Route path="/portal/school" element={<ProtectedRoute allowedRoles={['SCHOOL', 'SCHOOL_ADMIN']} redirectPath="/portal"><PortalLayout /></ProtectedRoute>}>
          <Route index element={<PortalHomeWithBilling role="school" />} />
          <Route path="roster" element={<SchoolRoster />} />
          <Route path="learner-progress" element={<SchoolLearnerInsights />} />
          <Route path="onboard-student" element={<SchoolStudentOnboarding />} />
          <Route path="credentials" element={<StudentCredentialCenter role="school" />} />
          <Route path="exams" element={<SchoolExaminationOverview />} />
          <Route path="exam-history" element={<ExaminationHistory mode="history" />} />
          <Route path="agreements" element={<AgreementsCenter role="school" />} />
          <Route path="links" element={<SchoolDashboard initialTab="links" />} />
          <Route path="schedules" element={<SchoolDashboard initialTab="schedules" />} />
          <Route path="partnership" element={<SchoolDashboard initialTab="partnership" />} />
          <Route path="resources" element={<ResourceLibrary role="school" />} />
          <Route path="assignments" element={<Navigate to="/portal/school/learner-progress" replace />} />
          <Route path="milestones" element={<Navigate to="/portal/school/learner-progress" replace />} />
          <Route path="assessments" element={<SchoolLearnerInsights />} />
          <Route path="calendar" element={<PortalCalendar />} />
          <Route path="payments" element={<BillingCenter role="school" />} />
          <Route path="support" element={<PortalSupport />} />
          <Route path="settings" element={<PortalSettings />} />
        </Route>

        <Route path="/admin/login" element={<Navigate to="/portal" replace />} />
        <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="schedules" element={<AdminClassSchedules />} />
          <Route path="examinations" element={<TutorExaminations />} />
          <Route path="examination-history" element={<ExaminationHistory mode="history" />} />
          <Route path="agreements" element={<AgreementsCenter role="admin" />} />
          <Route path="billing" element={<AdminBilling />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="programs" element={<AdminPrograms />} />
          <Route path="programs/new" element={<AdminProgramForm />} />
          <Route path="programs/:id" element={<AdminProgramForm />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="services/new" element={<AdminServiceForm />} />
          <Route path="services/:id" element={<AdminServiceForm />} />
          <Route path="blog" element={<AdminBlog />} />
          <Route path="blog/new" element={<AdminBlogForm />} />
          <Route path="blog/:id" element={<AdminBlogForm />} />
          <Route path="portfolio" element={<AdminPortfolio />} />
          <Route path="portfolio/new" element={<AdminPortfolioForm />} />
          <Route path="portfolio/:id" element={<AdminPortfolioForm />} />
          <Route path="kids-projects" element={<AdminKidsProjects />} />
          <Route path="inquiries" element={<AdminInquiries />} />
          <Route path="approvals" element={<AdminApprovals />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="pages" element={<AdminPages />} />
          <Route path="pages/new" element={<AdminPageForm />} />
          <Route path="pages/:id" element={<AdminPageForm />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="parents" element={<AdminParents />} />
          <Route path="staff" element={<AdminStaff />} />
          <Route path="tutor-subjects" element={<AdminTutorSubjects />} />
          <Route path="schools" element={<AdminSchools />} />
          <Route path="schools/onboard" element={<AdminSchoolOnboarding />} />
          <Route path="resources" element={<AdminResources />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="activity" element={<AdminActivityLogs />} />
          <Route path="support" element={<PortalSupport />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <SessionTimeoutProvider>
            <Router>
              <NotificationProvider>
                <MetaTagsProvider>
                  <SearchProvider>
                    <AdminImpersonationBanner />
                    <PageLoader />
                    <ScrollToTop />
                    <GlassRippleListener />
                    <AuditActivityTracker />
                    <AnimatedRoutes />
                    <NotificationDrawer />
                    <MarqueeBanner />
                    <FloatingWhatsApp />
                  </SearchProvider>
                </MetaTagsProvider>
              </NotificationProvider>
            </Router>
          </SessionTimeoutProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
