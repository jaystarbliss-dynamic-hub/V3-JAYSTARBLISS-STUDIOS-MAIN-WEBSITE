import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, LogOut, LayoutDashboard, CreditCard, Moon, Sun, Radio, Trophy,
  GraduationCap, ClipboardCheck, CalendarDays, KeyRound, Users, FileCheck2,
  Library, SlidersHorizontal, WalletCards, Award, Headphones,
  HelpCircle, Keyboard, ChevronDown, PanelLeftClose, FileText, History,
  ChartNoAxesColumn, UserRoundCog, Wallet, Headset, Settings, Menu, Lock, Loader2,
  Pin, PinOff, Code2
} from 'lucide-react';
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import {
  SubscriptionEntitlementProvider,
  useSubscriptionEntitlement,
} from '../../contexts/SubscriptionEntitlementContext';
import { PortalSubscriptionBanner, PortalLockdownView } from './PortalLockdownView';
import { Tooltip } from '../ui/Tooltip';
import { JaystarblissIcon } from '../common/JaystarblissLogo';
import ChangePasswordModal from './ChangePasswordModal';
import NotificationBell from '../common/NotificationBell';
import SEO from '../ui/SEO';
import { getActiveImpersonation } from '../../utils/impersonation';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';
import { resolvePartnerSchoolName } from '../../lib/classes';
import { useEdgeSwipeDrawer } from '../../hooks/useEdgeSwipeDrawer';
import {
  fetchStudentProgrammeEnrollments,
  normalizeProgrammeEnrollmentDoc,
  resolveStudentPortalEligibility,
  shouldUnlockStudentBillingTab,
} from '../../lib/programmeEnrollments';
import { checkAndNotifyExpiredAssessments } from '../../lib/assessmentNotificationHelpers';
import PortalOnboardingTour from './PortalOnboardingTour';
import type { PortalTourRole } from '../../lib/portalTour';
import './portal-polish.css';

type NavItem = {
  name: string;
  path: string;
  icon: React.ReactNode;
  desc: string;
  tourId?: string;
  badgeCount?: number;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type StudentPortalFeatures = {
  assessments?: boolean;
  edClub?: boolean;
  deliveryMode?: string;
  registrationSource?: string;
};

const normalizeMode = (value: unknown) => String(value || '').trim().toLowerCase();

function resolveRoleSubtitle(role: string): string {
  if (role === 'staff') return 'Tutor';
  if (role === 'school') return 'School Administrator';
  if (role === 'parent') return 'Parent';
  if (role === 'student') return 'Student';
  return 'Member';
}

function resolvePortalPageTitle(pathname: string, role: string, navGroups: NavGroup[]): string {
  const clean = pathname.replace(/\/+$/, '') || `/portal/${role}`;
  if (clean === `/portal/${role}`) return 'Dashboard';
  if (clean.startsWith('/portal/student/exams/')) return 'Assessment Attempt';
  if (clean.startsWith('/portal/staff/students/')) return 'Student Details';
  if (clean.endsWith('/onboard-student')) return 'Onboard Student';
  if (clean.endsWith('/agreements')) return 'Agreements';
  if (clean.endsWith('/exam-history')) return 'Assessment History';
  if (clean.endsWith('/academic-reporting')) return 'Academic Reporting';
  if (clean.endsWith('/exam-authoring') || clean.endsWith('/exams')) {
    if (role === 'school') return 'Assessment Overview';
    if (role === 'staff') return 'Assessments';
    return 'Assessments';
  }
  if (clean.endsWith('/examinations')) return 'Assessment Results';
  if (clean.endsWith('/credentials')) return 'Student Access';
  if (clean.endsWith('/payments')) return 'Billing';
  if (clean.endsWith('/settings')) return 'Settings';
  if (clean.endsWith('/support')) return 'Support';
  if (clean.endsWith('/milestones')) return 'Milestones';
  if (clean.endsWith('/assignments')) return 'Assignments';
  if (clean.endsWith('/assessments')) return 'Assessments';
  if (clean.endsWith('/resources')) return 'Resources';
  if (clean.endsWith('/schedules') || clean.endsWith('/calendar')) return 'Class Schedules';
  if (clean.endsWith('/live-classrooms') || clean.endsWith('/live-classes')) return 'Live Classrooms';
  if (clean.endsWith('/classes')) return 'Live Classes';
  if (clean.endsWith('/subjects')) return 'Subjects I Teach';
  if (clean.endsWith('/courses') || clean.endsWith('/learning-tracks')) return 'Learning & Tracks';
  if (clean.endsWith('/achievements')) return 'Achievements';
  if (clean.endsWith('/edge-club')) return 'Ed Club';
  if (clean.endsWith('/coding-lab')) return 'Coding Lab';
  if (clean.endsWith('/roster')) return 'Learners Roster';
  if (clean.endsWith('/learner-progress')) return 'Learner Progress';
  if (clean.endsWith('/links')) return 'Class Links';
  if (clean.endsWith('/partnership')) return 'Programme & Billing';

  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.path === clean) return item.name;
    }
  }
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.path !== `/portal/${role}` && clean.startsWith(`${item.path}/`)) {
        return item.name;
      }
    }
  }
  return 'Dashboard';
}

const isAlwaysPermittedRoute = (pathname: string): boolean => {
  const clean = pathname.replace(/\/+$/, '').toLowerCase();
  return (
    clean.endsWith('/payments') ||
    clean.includes('/payments/') ||
    clean.endsWith('/support') ||
    clean.includes('/support/') ||
    clean.endsWith('/settings') ||
    clean.includes('/settings/')
  );
};

const PortalLayoutInner: React.FC<{ role: string }> = ({ role }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const {
    entitlement,
    loading: entitlementLoading,
    isRouteAllowed,
    isNavPathLocked,
  } = useSubscriptionEntitlement();

  const [displayName, setDisplayName] = useState('Portal User');
  const [roleSubtitle, setRoleSubtitle] = useState(() => resolveRoleSubtitle(role));
  const [userEmail, setUserEmail] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('portal_sidebar_pinned') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const sidebarExpanded = sidebarPinned || isHoverExpanded;
  const toggleSidebarPin = () => {
    setSidebarPinned(prev => {
      const next = !prev;
      try {
        localStorage.setItem('portal_sidebar_pinned', String(next));
      } catch {
        // ignore storage restrictions
      }
      if (!next) setIsHoverExpanded(false);
      return next;
    });
  };
  const [collapsedNavGroups] = useState<Record<string, boolean>>({});
  const [impersonation, setImpersonation] = useState<any>(() => getActiveImpersonation());
  const [studentFeatures, setStudentFeatures] = useState<StudentPortalFeatures>({});
  const [studentBillingUnlocked, setStudentBillingUnlocked] = useState<boolean>(
    () => sessionStorage.getItem('studentRegistrationType') === 'individual'
  );
  const [studentOriginType, setStudentOriginType] = useState<'individual' | 'school' | 'parent'>(() => {
    const raw = sessionStorage.getItem('studentRegistrationType');
    if (raw === 'parent') return 'parent';
    if (raw === 'school') return 'school';
    return 'individual';
  });
  const [tourReplayToken, setTourReplayToken] = useState(0);
  const [sidebarBadgeCounts, setSidebarBadgeCounts] = useState<Record<string, number>>({});
  const profileRef = useRef<HTMLDivElement>(null);

  useEdgeSwipeDrawer(mobileMenuOpen, setMobileMenuOpen, 768);

  useEffect(() => {
    void migrateAllFirestoreClasses().catch(() => null);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    const activeImp = getActiveImpersonation();
    const isMasquerading = Boolean(activeImp?.isMasquerading);
    setImpersonation(activeImp);
    setUserEmail(
      isMasquerading
        ? activeImp?.targetUser?.email || ''
        : user?.email || sessionStorage.getItem('userEmail') || ''
    );
    setPhotoURL(isMasquerading || role === 'student' ? null : user?.photoURL || null);
    setRoleSubtitle(resolveRoleSubtitle(role));

    const cachedSchoolName = resolvePartnerSchoolName(
      activeImp?.targetUser?.schoolName,
      !isMasquerading ? sessionStorage.getItem('schoolName') : '',
      !isMasquerading ? sessionStorage.getItem('institutionName') : ''
    );
    const cachedUserName = isMasquerading
      ? activeImp?.targetUser?.name || activeImp?.targetUser?.fullName || ''
      : sessionStorage.getItem('userName') ||
        sessionStorage.getItem('studentName') ||
        user?.displayName ||
        '';

    if (role === 'school' && (cachedSchoolName || cachedUserName)) {
      setDisplayName(cachedSchoolName || cachedUserName);
    } else if (cachedUserName) {
      setDisplayName(cachedUserName);
    } else {
      setDisplayName(
        role === 'school'
          ? 'Partner School'
          : role === 'staff'
          ? 'Tutor'
          : role === 'parent'
          ? 'Parent'
          : 'Student'
      );
    }

    // Resolve authoritative name and profile avatar from Firestore profile or role document
    const targetUid = isMasquerading
      ? activeImp?.targetUser?.uid || activeImp?.targetUser?.id || ''
      : sessionStorage.getItem('userId') || user?.uid || '';
    const schoolId = isMasquerading
      ? activeImp?.targetUser?.schoolId || (role === 'school' ? targetUid : '')
      : sessionStorage.getItem('schoolId') || '';

    if (role === 'school') {
      const lookupSchoolId = schoolId || targetUid;
      if (lookupSchoolId) {
        void getDoc(doc(db, 'schools', lookupSchoolId))
          .then(snap => {
            if (snap.exists()) {
              const sData = snap.data() as any;
              const resolvedSchool = resolvePartnerSchoolName(
                sData.schoolName,
                sData.name,
                sData.institutionName,
                cachedSchoolName
              );
              if (resolvedSchool) {
                setDisplayName(resolvedSchool);
                sessionStorage.setItem('schoolName', resolvedSchool);
              }
              if (sData.logoUrl || sData.photoURL || sData.avatarUrl) {
                setPhotoURL(String(sData.logoUrl || sData.photoURL || sData.avatarUrl));
              }
            } else if (targetUid && (!isMasquerading || targetUid !== user?.uid)) {
              return getDoc(doc(db, 'users', targetUid)).then(uSnap => {
                if (!uSnap.exists()) return;
                const uData = uSnap.data() as any;
                const resolvedSchool = resolvePartnerSchoolName(
                  uData.schoolName,
                  uData.institutionName,
                  uData.organizationName,
                  uData.fullName,
                  uData.name
                );
                if (resolvedSchool) {
                  setDisplayName(resolvedSchool);
                  sessionStorage.setItem('schoolName', resolvedSchool);
                }
                if (uData.photoURL || uData.avatarUrl) {
                  setPhotoURL(String(uData.photoURL || uData.avatarUrl));
                }
              });
            }
          })
          .catch(() => undefined);
      }
    } else if (targetUid) {
      if (!isMasquerading || targetUid !== user?.uid) {
        void getDoc(doc(db, 'users', targetUid))
          .then(snap => {
            if (!snap.exists()) return;
            const data = snap.data() as any;
            const realName = String(data.fullName || data.name || data.displayName || '').trim();
            if (realName) {
              setDisplayName(realName);
              sessionStorage.setItem('userName', realName);
            }
            if (role !== 'student' && (data.photoURL || data.avatarUrl)) {
              setPhotoURL(data.photoURL || data.avatarUrl);
            }
          })
          .catch(() => undefined);
      }
      if (role === 'staff') {
        void getDoc(doc(db, 'tutors', targetUid))
          .then(tSnap => {
            if (!tSnap.exists()) return;
            const tData = tSnap.data() as any;
            const realName = String(tData.fullName || tData.name || '').trim();
            if (realName) {
              setDisplayName(realName);
              sessionStorage.setItem('userName', realName);
            }
            if (tData.photoURL || tData.avatarUrl) {
              setPhotoURL(String(tData.photoURL || tData.avatarUrl));
            }
          })
          .catch(() => undefined);
      }
    }
  }, [role, location.pathname]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const logout = async () => {
    await signOut(auth).catch(() => undefined);
    sessionStorage.clear();
    navigate('/portal');
  };

  useEffect(() => {
    if (role !== 'student') return;
    let active = true;
    const activeImpStudent = getActiveImpersonation();
    const isMasqueradingStudent = Boolean(activeImpStudent?.isMasquerading);
    const uid =
      activeImpStudent?.targetUser?.uid ||
      activeImpStudent?.targetUser?.id ||
      sessionStorage.getItem('userId') ||
      auth.currentUser?.uid ||
      '';
    const studentDocId = isMasqueradingStudent
      ? activeImpStudent?.targetUser?.studentDocId || activeImpStudent?.targetUser?.id || uid
      : sessionStorage.getItem('studentDocId') || uid;
    let resolvedEligibility: ReturnType<typeof resolveStudentPortalEligibility> | null = null;

    const hydrateStudentState = async () => {
      try {
        const [studentSnap, indStudentSnap, userSnap, enrollments] = await Promise.all([
          studentDocId ? getDoc(doc(db, 'students', studentDocId)).catch(() => null) : Promise.resolve(null),
          studentDocId ? getDoc(doc(db, 'individualStudents', studentDocId)).catch(() => null) : Promise.resolve(null),
          uid && (!isMasqueradingStudent || uid !== auth.currentUser?.uid)
            ? getDoc(doc(db, 'users', uid)).catch(() => null)
            : Promise.resolve(null),
          uid ? fetchStudentProgrammeEnrollments(uid).catch(() => []) : Promise.resolve([]),
        ]);

        if (!active) return;

        const studentData = studentSnap?.exists()
          ? (studentSnap.data() as any)
          : indStudentSnap?.exists()
          ? (indStudentSnap.data() as any)
          : null;
        const userData = userSnap?.exists() ? (userSnap.data() as any) : null;

        if (studentData) {
          const realStudentName = String(studentData.fullName || studentData.name || '').trim();
          if (realStudentName) {
            setDisplayName(realStudentName);
            sessionStorage.setItem('userName', realStudentName);
          }
          const featureAccess = studentData.featureAccess || {};
          const deliveryMode = normalizeMode(studentData.deliveryMode || studentData.classScheduleDetails?.deliveryMode);
          const registrationSource = normalizeMode(studentData.registrationSource);
          const next = {
            assessments: featureAccess.assessments === true,
            edClub: featureAccess.edClub === true || studentData.edClubEnabled === true,
            deliveryMode,
            registrationSource
          };
          setStudentFeatures(next);
          sessionStorage.setItem('studentEdClubEnabled', String(next.edClub));
          sessionStorage.setItem('studentDeliveryMode', deliveryMode);
          sessionStorage.setItem('studentRegistrationSource', registrationSource);
        }

        const resolvedStudentSchoolId = String(
          studentData?.schoolId ||
            userData?.schoolId ||
            activeImpStudent?.targetUser?.schoolId ||
            (!isMasqueradingStudent ? sessionStorage.getItem('schoolId') : '') ||
            ''
        ).trim();

        const eligibility = resolveStudentPortalEligibility({
          registrationType:
            userData?.studentRegistrationType ||
            studentData?.registrationType ||
            (!isMasqueradingStudent ? sessionStorage.getItem('studentRegistrationType') : undefined),
          registrationSource:
            studentData?.registrationSource ||
            userData?.registrationSource ||
            (!isMasqueradingStudent ? sessionStorage.getItem('studentRegistrationSource') : undefined),
          parentId:
            studentData?.parentId ||
            userData?.parentId ||
            (!isMasqueradingStudent
              ? sessionStorage.getItem('parentId') || sessionStorage.getItem('studentParentId')
              : undefined),
          parentUid: studentData?.parentUid || userData?.parentUid,
          schoolId: resolvedStudentSchoolId,
          isIndependent: userData?.isIndependent ?? studentData?.isIndependent,
        });

        resolvedEligibility = eligibility;
        setStudentOriginType(eligibility.registrationType);

        const isSchoolStudent =
          eligibility.registrationType === 'school' ||
          (Boolean(resolvedStudentSchoolId) &&
            resolvedStudentSchoolId.toLowerCase() !== 'private');

        if (isSchoolStudent) {
          // School-onboarded students inherit their school's profile image if set, else default to name initial (photoURL = null)
          if (resolvedStudentSchoolId && resolvedStudentSchoolId.toLowerCase() !== 'private') {
            const schoolSnap = await getDoc(doc(db, 'schools', resolvedStudentSchoolId)).catch(() => null);
            if (!active) return;
            if (schoolSnap?.exists()) {
              const sData = schoolSnap.data() as any;
              const schoolImg = String(sData.logoUrl || sData.photoURL || sData.avatarUrl || '').trim();
              setPhotoURL(schoolImg || null);
            } else {
              setPhotoURL(null);
            }
          } else {
            setPhotoURL(null);
          }
        } else {
          // Individual / Parent-onboarded student can use their own photo if set, else name initial
          const personalImg = String(
            studentData?.photoURL ||
              studentData?.avatarUrl ||
              userData?.photoURL ||
              userData?.avatarUrl ||
              (!isMasqueradingStudent ? auth.currentUser?.photoURL || '' : '') ||
              ''
          ).trim();
          setPhotoURL(personalImg || null);
        }

        setStudentBillingUnlocked(
          shouldUnlockStudentBillingTab({
            eligibility,
            selfFundedEnrollments: enrollments,
          })
        );

        const awaitingPaymentCount = enrollments.filter(
          (en) =>
            en.enrollmentStatus === 'APPROVED_AWAITING_PAYMENT' ||
            en.enrollmentStatus === 'PARTIALLY_PAID' ||
            en.enrollmentStatus === 'RENEWAL_DUE'
        ).length;
        setSidebarBadgeCounts((prev) => ({
          ...prev,
          '/portal/student/payments': awaitingPaymentCount,
        }));
      } catch {
        // Keep safe defaults
      }
    };

    void hydrateStudentState();

    // Live listener so approving a school student's programme immediately unlocks Payments & Fees without page reload
    let unsubEnrollments: (() => void) | undefined;
    if (uid) {
      unsubEnrollments = onSnapshot(
        query(collection(db, 'programme_enrollments'), where('studentUid', '==', uid)),
        (snap) => {
          if (!active) return;
          const liveEnrollments = snap.docs.map((d) =>
            normalizeProgrammeEnrollmentDoc(d.id, d.data() as Record<string, any>)
          );
          const elig =
            resolvedEligibility ||
            resolveStudentPortalEligibility({
              registrationType: sessionStorage.getItem('studentRegistrationType'),
              registrationSource: sessionStorage.getItem('studentRegistrationSource'),
              parentId: sessionStorage.getItem('parentId') || sessionStorage.getItem('studentParentId'),
              schoolId: sessionStorage.getItem('schoolId'),
            });
          setStudentBillingUnlocked(
            shouldUnlockStudentBillingTab({
              eligibility: elig,
              selfFundedEnrollments: liveEnrollments,
            })
          );
          const awaitingPaymentCount = liveEnrollments.filter(
            (en) =>
              en.enrollmentStatus === 'APPROVED_AWAITING_PAYMENT' ||
              en.enrollmentStatus === 'PARTIALLY_PAID' ||
              en.enrollmentStatus === 'RENEWAL_DUE'
          ).length;
          setSidebarBadgeCounts((prev) => ({
            ...prev,
            '/portal/student/payments': awaitingPaymentCount,
          }));
        },
        () => undefined
      );
    }

    return () => {
      active = false;
      unsubEnrollments?.();
    };
  }, [role]);

  // Live actionable sidebar counters & expired-assessment summary check for Tutor, School Admin, and Parent portals
  useEffect(() => {
    const activeImpSidebar = getActiveImpersonation();
    const uid =
      activeImpSidebar?.targetUser?.uid ||
      activeImpSidebar?.targetUser?.id ||
      sessionStorage.getItem('userId') ||
      auth.currentUser?.uid ||
      '';
    if (!uid) return;
    const activeSchoolId =
      sessionStorage.getItem('schoolId') ||
      sessionStorage.getItem('schoolDocId') ||
      localStorage.getItem('jaystar_cached_school_id') ||
      '';
    const unsubs: Array<() => void> = [];

    // Support replies waiting for user across all portals
    const supportPath = `/portal/${role}/support`;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'supportTickets'), where('userId', '==', uid)),
        (snap) => {
          const unreadReplies = snap.docs.filter((d) => d.data()?.unreadByUser === true).length;
          setSidebarBadgeCounts((prev) => ({ ...prev, [supportPath]: unreadReplies }));
        },
        () => undefined
      )
    );

    if (role === 'staff') {
      // Pending prior-learning / recognition requests for tutors
      unsubs.push(
        onSnapshot(
          query(collection(db, 'priorLearningRecognitions'), where('status', '==', 'PENDING')),
          (snap) => {
            setSidebarBadgeCounts((prev) => ({
              ...prev,
              '/portal/staff/milestones': snap.size,
            }));
          },
          () => undefined
        )
      );

      // Pending coursework assignment submissions awaiting tutor grading
      unsubs.push(
        onSnapshot(
          query(collection(db, 'assignmentSubmissions'), where('status', '==', 'submitted'), limit(100)),
          (snap) => {
            setSidebarBadgeCounts((prev) => ({
              ...prev,
              '/portal/staff/assignments': snap.size,
            }));
          },
          () => undefined
        )
      );

      // Unread assessment submission notifications + ungraded attempts for tutor's exams
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'jdiNotifications'),
            where('recipientUid', '==', uid),
            where('isRead', '==', false)
          ),
          (snap) => {
            const examAlertCount = snap.docs.filter((d) => {
              const t = String(d.data()?.type || '').toLowerCase();
              return t === 'exam_submitted' || t === 'exam_deadline_summary' || t === 'exam_expired';
            }).length;
            setSidebarBadgeCounts((prev) => ({
              ...prev,
              '/portal/staff/exam-history': examAlertCount,
            }));
          },
          () => undefined
        )
      );

      void checkAndNotifyExpiredAssessments({ role: 'staff', uid });
    } else if (role === 'school' && activeSchoolId) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'jdiNotifications'),
            where('recipientUid', '==', uid),
            where('isRead', '==', false)
          ),
          (snap) => {
            const examAlertCount = snap.docs.filter((d) => {
              const t = String(d.data()?.type || '').toLowerCase();
              return t === 'exam_submitted' || t === 'exam_deadline_summary' || t === 'exam_expired';
            }).length;
            setSidebarBadgeCounts((prev) => ({
              ...prev,
              '/portal/school/exam-history': examAlertCount,
            }));
          },
          () => undefined
        )
      );

      // Also check active school assessments needing attention
      void getDocs(
        query(collection(db, 'jdiExams'), where('schoolId', '==', activeSchoolId), where('status', '==', 'active'), limit(30))
      )
        .then((snap) => {
          setSidebarBadgeCounts((prev) => ({
            ...prev,
            '/portal/school/exams': snap.size,
          }));
        })
        .catch(() => undefined);

      void checkAndNotifyExpiredAssessments({ role: 'school', uid, schoolId: activeSchoolId });
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [role]);

  const parentEnrolledStudent = role === 'student' && (
    studentOriginType === 'parent' ||
    studentFeatures.registrationSource === 'parent-enrollment-approved' ||
    !!sessionStorage.getItem('parentId') ||
    !!sessionStorage.getItem('studentParentId')
  );
  const onlineStudent = parentEnrolledStudent && studentFeatures.deliveryMode === 'online';
  const physicalStudent = parentEnrolledStudent && studentFeatures.deliveryMode === 'physical';

  // Navigation Groups structured by task
  const navGroups: NavGroup[] = (() => {
    if (role === 'school') {
      return [
        {
          label: 'Overview',
          items: [
            { name: 'Dashboard', path: '/portal/school', icon: <LayoutDashboard size={19} />, desc: 'School administration overview', tourId: 'nav-dashboard' },
            { name: 'Class Schedules', path: '/portal/school/schedules', icon: <CalendarDays size={19} />, desc: 'Programme timetables & sessions' }
          ]
        },
        {
          label: 'Academics',
          items: [
            { name: 'Assessment Overview', path: '/portal/school/exams', icon: <FileText size={19} />, desc: 'School assessment management', tourId: 'nav-exams' },
            { name: 'Assessment History', path: '/portal/school/exam-history', icon: <History size={19} />, desc: 'Submissions & past assessment records' },
            { name: 'Learner Progress', path: '/portal/school/learner-progress', icon: <ChartNoAxesColumn size={19} />, desc: 'Assignments, activities, tests, assessments & attendance' }
          ]
        },
        {
          label: 'People',
          items: [
            { name: 'Learners Roster', path: '/portal/school/roster', icon: <Users size={19} />, desc: 'Student directory and class assignments', tourId: 'nav-roster' },
            { name: 'Student Access', path: '/portal/school/credentials', icon: <UserRoundCog size={19} />, desc: 'Access credentials & passcodes' }
          ]
        },
        {
          label: 'Finance & Agreements',
          items: [
            { name: 'Fees & Payments', path: '/portal/school/payments', icon: <Wallet size={19} />, desc: 'Institutional fees & payments', tourId: 'nav-payments' },
            { name: 'Agreements', path: '/portal/school/agreements', icon: <FileCheck2 size={19} />, desc: 'Proposals, communiqués & school contracts' }
          ]
        },
        {
          label: 'Institutional Resources',
          items: [
            { name: 'Institutional Resources', path: '/portal/school/resources', icon: <Library size={19} />, desc: 'Learning resources & curriculum material' }
          ]
        },
        {
          label: 'Administration',
          items: [
            { name: 'Help & Support', path: '/portal/school/support', icon: <Headset size={19} />, desc: 'Institutional support & help desk', tourId: 'nav-support' },
            { name: 'Settings', path: '/portal/school/settings', icon: <Settings size={19} />, desc: 'School preferences & configuration' }
          ]
        }
      ];
    }

    if (role === 'student') {
      const academicItems: NavItem[] = [
        { name: 'Learning & Tracks', path: '/portal/student/courses', icon: <GraduationCap size={19} />, desc: 'Curriculum, tracks & discovery', tourId: 'nav-courses' },
        { name: 'Assessments & Work', path: '/portal/student/assessments', icon: <ClipboardCheck size={19} />, desc: 'Assignments, activities, tests & exams', tourId: 'nav-assessments' }
      ];
      if (studentFeatures.edClub) {
        academicItems.push({ name: 'Ed Club', path: '/portal/student/edge-club', icon: <Keyboard size={19} />, desc: 'Keyboarding & speed typing portal' });
      }
      if (CODING_LAB_CONFIG.enabled) {
        academicItems.push({ name: 'Coding Lab', path: '/coding-lab', icon: <Code2 size={19} />, desc: 'Visual block coding sandbox' });
      }

      const scheduleItems: NavItem[] = [];
      if (!onlineStudent) {
        scheduleItems.push({ name: 'Class Schedules', path: '/portal/student/schedules', icon: <CalendarDays size={19} />, desc: 'Programme timetable & class status' });
      }
      if (!physicalStudent) {
        scheduleItems.push({ name: 'Live Classrooms', path: '/portal/student/live-classrooms', icon: <Radio size={19} />, desc: 'Live online lessons & sessions' });
      }

      const groups: NavGroup[] = [
        {
          label: 'Overview',
          items: [{ name: 'Dashboard', path: '/portal/student', icon: <LayoutDashboard size={19} />, desc: 'Student portal overview', tourId: 'nav-dashboard' }]
        },
        {
          label: 'Academics',
          items: academicItems
        }
      ];

      if (scheduleItems.length > 0) {
        groups.push({ label: 'Classes & Sessions', items: scheduleItems });
      }

      groups.push({
        label: 'Progress & Materials',
        items: [
          { name: 'Achievements & Badges', path: '/portal/student/achievements', icon: <Trophy size={19} />, desc: 'Mastery, badges & certificates' },
          { name: 'Lesson Resources', path: '/portal/student/resources', icon: <BookOpen size={19} />, desc: 'Lesson notes & materials', tourId: 'nav-resources' }
        ]
      });

      if (studentBillingUnlocked && !parentEnrolledStudent) {
        groups.push({
          label: 'Finance',
          items: [{ name: 'Payments & Fees', path: '/portal/student/payments', icon: <CreditCard size={19} />, desc: 'Personal billing & self-funded programmes', tourId: 'nav-payments' }]
        });
      }

      groups.push({
        label: 'Administration',
        items: [
          { name: 'Help & Support', path: '/portal/student/support', icon: <Headset size={19} />, desc: 'Help desk & live support chat', tourId: 'nav-support' },
          { name: 'Settings', path: '/portal/student/settings', icon: <Settings size={19} />, desc: 'Account preferences' }
        ]
      });

      return groups;
    }

    if (role === 'staff') {
      return [
        {
          label: 'Overview',
          items: [
            { name: 'Dashboard', path: '/portal/staff', icon: <LayoutDashboard size={19} />, desc: 'Assigned schools, schedules & reminders', tourId: 'nav-dashboard' },
            { name: 'Assigned Learners', path: '/portal/staff/students', icon: <Users size={19} />, desc: 'School-assigned & private learners roster' }
          ]
        },
        {
          label: 'Teaching & Schedule',
          items: [
            { name: 'Live Classes', path: '/portal/staff/classes', icon: <Radio size={19} />, desc: 'Teaching roster, schedules & attendance' },
            { name: 'Calendar', path: '/portal/staff/calendar', icon: <CalendarDays size={19} />, desc: 'Teaching timetable' }
          ]
        },
        {
          label: 'Academics & Assessments',
          items: [
            { name: 'Assessments', path: '/portal/staff/assessments', icon: <ClipboardCheck size={19} />, desc: 'Create & manage assignments, activities, tests & assessments', tourId: 'nav-assessments' },
            { name: 'Assessment History', path: '/portal/staff/exam-history', icon: <History size={19} />, desc: 'Review history across assignments, activities, tests & assessments' },
            { name: 'Academic Reporting', path: '/portal/staff/academic-reporting', icon: <FileText size={19} />, desc: 'Grading profiles, reference lookup & official performance reports' },
            { name: 'Assignments & Review', path: '/portal/staff/assignments', icon: <FileText size={19} />, desc: 'Assign & grade individual student coursework' },
            { name: 'Milestone Roadmap', path: '/portal/staff/milestones', icon: <GraduationCap size={19} />, desc: 'Track learner & school curriculum milestones' }
          ]
        },
        {
          label: 'People & Resources',
          items: [
            { name: 'Student Access', path: '/portal/staff/credentials', icon: <KeyRound size={19} />, desc: 'Issue & manage learner access codes' },
            { name: 'Lesson Resources', path: '/portal/staff/resources', icon: <BookOpen size={19} />, desc: 'Distribute documents, images, videos & links', tourId: 'nav-resources' }
          ]
        },
        {
          label: 'Finance & Agreements',
          items: [
            { name: 'Billing / Fees', path: '/portal/staff/payments', icon: <WalletCards size={19} />, desc: 'Tutor ledger & payouts', tourId: 'nav-payments' },
            { name: 'Agreements', path: '/portal/staff/agreements', icon: <FileCheck2 size={19} />, desc: 'Proposals, communiqués & tutor contracts' }
          ]
        },
        {
          label: 'Administration',
          items: [
            { name: 'Help & Support', path: '/portal/staff/support', icon: <Headset size={19} />, desc: 'Help desk & live support chat', tourId: 'nav-support' },
            { name: 'Settings', path: '/portal/staff/settings', icon: <Settings size={19} />, desc: 'Account preferences' }
          ]
        }
      ];
    }

    if (role === 'parent') {
      return [
        {
          label: 'Overview',
          items: [{ name: 'Dashboard', path: '/portal/parent', icon: <LayoutDashboard size={19} />, desc: 'Parent dashboard', tourId: 'nav-dashboard' }]
        },
        {
          label: 'Learning & Schedules',
          items: [
            { name: 'Learning & Tracks', path: '/portal/parent/learning-tracks', icon: <GraduationCap size={19} />, desc: 'Linked children tracks & programme enrolment', tourId: 'nav-learning-tracks' },
            { name: 'Class Schedules', path: '/portal/parent/schedules', icon: <CalendarDays size={19} />, desc: 'Class timetable and session status' },
            { name: 'Resources', path: '/portal/parent/resources', icon: <BookOpen size={19} />, desc: 'Learning materials' }
          ]
        },
        {
          label: 'Academics & Performance',
          items: [
            { name: 'Assignments', path: '/portal/parent/assignments', icon: <ClipboardCheck size={19} />, desc: 'Track assigned work' },
            { name: 'Assessments & Quizzes', path: '/portal/parent/assessments', icon: <ClipboardCheck size={19} />, desc: 'View learning assessments' },
            { name: 'Assessment Results', path: '/portal/parent/examinations', icon: <FileCheck2 size={19} />, desc: 'View released results for linked children', tourId: 'nav-examinations' }
          ]
        },
        {
          label: 'Finance & Agreements',
          items: [
            { name: 'Payments & Fees', path: '/portal/parent/payments', icon: <CreditCard size={19} />, desc: 'Invoices & statements', tourId: 'nav-payments' },
            { name: 'Agreements', path: '/portal/parent/agreements', icon: <FileCheck2 size={19} />, desc: 'Proposals, communiqués & family agreements' }
          ]
        },
        {
          label: 'Administration',
          items: [
            { name: 'Help & Support', path: '/portal/parent/support', icon: <Headset size={19} />, desc: 'Help desk & live support chat', tourId: 'nav-support' },
            { name: 'Settings', path: '/portal/parent/settings', icon: <Settings size={19} />, desc: 'Account preferences' }
          ]
        }
      ];
    }

    return [];
  })();

  const roleTitle = roleSubtitle;
  const currentPageTitle = resolvePortalPageTitle(location.pathname, role, navGroups);

  const isItemActive = (path: string) => {
    if (location.pathname === path) return true;
    // Highlight Assessments in tutor sidebar when on /portal/staff/exams, /portal/staff/assignments, or /portal/staff/exam-authoring
    if (
      role === 'staff' &&
      path === '/portal/staff/assessments' &&
      (['/portal/staff/exams', '/portal/staff/assignments', '/portal/staff/exam-authoring'].includes(location.pathname))
    ) {
      return true;
    }
    if (path !== `/portal/${role}` && location.pathname.startsWith(path + '/')) return true;
    return false;
  };

  const NavLinkComponent = ({ item, mobile = false }: { item: NavItem; mobile?: boolean }) => {
    const active = isItemActive(item.path);
    const locked = isNavPathLocked(item.path);
    const count = item.badgeCount ?? sidebarBadgeCounts[item.path] ?? 0;

    const handleLockedClick = () => {
      toast.error(
        entitlement?.restrictedClickMessage ||
          'This section is locked until subscription payment is completed.'
      );
      if (mobile) setMobileMenuOpen(false);
    };

    if (!mobile && !sidebarExpanded) {
      if (locked) {
        return (
          <Tooltip content={`${item.name} • Locked until subscription is renewed`} placement="right" delay={150}>
            <button
              type="button"
              onClick={handleLockedClick}
              aria-disabled="true"
              aria-label={`${item.name} (Locked)`}
              className="relative flex items-center justify-center w-11 h-11 mx-auto my-0.5 rounded-xl text-slate-400 dark:text-slate-500 opacity-55 cursor-not-allowed hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-all"
            >
              <span className="shrink-0 flex items-center justify-center">{item.icon}</span>
              <Lock size={10} className="absolute bottom-1.5 right-1.5 text-red-500" />
            </button>
          </Tooltip>
        );
      }

      // Collapsed rail mode: icon-only with tooltip + compact numeric badge
      return (
        <Tooltip content={`${item.name}${count > 0 ? ` (${count})` : ''} • ${item.desc}`} placement="right" delay={150}>
          <Link
            to={item.path}
            data-tour-id={item.tourId}
            aria-label={item.name}
            className={`relative flex items-center justify-center w-11 h-11 mx-auto my-0.5 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-1 ${
              active
                ? 'bg-[#1E293B] dark:bg-white/10 text-white font-semibold shadow-xs'
                : 'text-[#64748B] dark:text-slate-400 hover:bg-[#F1F5F9] dark:hover:bg-white/5 hover:text-[#1E293B] dark:hover:text-white'
            }`}
          >
            {active && (
              <span className="absolute left-1 w-1 h-5 rounded-sm bg-[#B91C1C]" />
            )}
            <span className="shrink-0 flex items-center justify-center">{item.icon}</span>
            {count > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#B91C1C] text-white text-[9px] font-black tabular-nums flex items-center justify-center leading-none shadow-xs">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        </Tooltip>
      );
    }

    if (locked) {
      return (
        <Tooltip content={!mobile ? 'Locked until subscription payment is completed' : undefined} placement="right" delay={200} fullWidth>
          <button
            type="button"
            onClick={handleLockedClick}
            aria-disabled="true"
            className="w-full relative group flex items-center justify-between h-11 min-h-[44px] px-3 my-0.5 rounded-xl text-xs text-slate-400 dark:text-zinc-500 opacity-60 cursor-not-allowed hover:bg-red-50/40 dark:hover:bg-red-950/20 transition-colors overflow-hidden text-left"
          >
            <span className="flex items-center min-w-0">
              <span className="w-8 h-8 flex items-center justify-center shrink-0 ml-1 text-slate-400 dark:text-zinc-500">
                {item.icon}
              </span>
              <span className="min-w-0 truncate pl-2.5 text-[13px] font-medium">{item.name}</span>
            </span>
            <Lock size={13} className="shrink-0 text-red-500/80 ml-2" aria-hidden="true" />
          </button>
        </Tooltip>
      );
    }

    // Expanded / Mobile mode: full row with uniform full-width highlight, active indicator and numeric count badge
    return (
      <Tooltip content={!mobile ? item.desc : undefined} placement="right" delay={300} fullWidth>
        <Link
          to={item.path}
          data-tour-id={!mobile ? item.tourId : undefined}
          onClick={() => { if (mobile) setMobileMenuOpen(false); }}
          className={`w-full relative group flex items-center justify-between h-11 min-h-[44px] px-3 my-0.5 rounded-xl text-xs transition-colors overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-1 ${
            active
              ? 'bg-[#1E293B] dark:bg-white/10 text-white font-semibold shadow-xs'
              : 'text-[#14284B] dark:text-zinc-200 hover:bg-[#F1F5F9] dark:hover:bg-white/10 hover:text-[#1E293B] dark:hover:text-white font-medium'
          }`}
        >
          {active && (
            <span className="absolute left-1.5 w-1 h-5 rounded-sm bg-[#B91C1C]" />
          )}
          <span className="flex items-center min-w-0 flex-1">
            <span className={`w-8 h-8 flex items-center justify-center shrink-0 ml-1 transition-colors ${
              active ? 'text-white' : 'text-[#64748B] dark:text-zinc-400 group-hover:text-[#1E293B] dark:group-hover:text-white'
            }`}>
              {item.icon}
            </span>
            <span className="min-w-0 truncate pl-2.5 text-[13px]">{item.name}</span>
          </span>
          {count > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-md bg-[#B91C1C] text-white text-[10px] font-black tabular-nums leading-none shrink-0">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Link>
      </Tooltip>
    );
  };

  const renderNavGroups = (mobile = false) => {
    return navGroups.map(group => {
      return (
        <div key={group.label} className="mt-4 first:mt-1 space-y-1">
          {(mobile || sidebarExpanded) && (
            <div className="flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-slate-400 select-none">
              <span>{group.label}</span>
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map(item => (
              <NavLinkComponent key={item.name} item={item} mobile={mobile} />
            ))}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="portal-shell h-screen w-full bg-[#F7F9FC] dark:bg-[#09090B] text-[#14284B] dark:text-zinc-100 flex flex-col md:flex-row overflow-hidden font-sans">
      <SEO title={`${currentPageTitle} | ${roleTitle} | Jaystarbliss Studios`} description={`Jaystarbliss Studios ${roleTitle} portal.`} noindex />

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <motion.button
              aria-label="Close menu"
              className="absolute inset-0 bg-black/75 backdrop-blur-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute inset-y-0 left-0 w-[80vw] max-w-[280px] bg-white dark:bg-[#111114] text-[#14284B] dark:text-white border-r border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between min-h-14 pb-2.5 border-b border-slate-200 dark:border-zinc-800 shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                >
                  <JaystarblissIcon className="w-8 h-8 shrink-0 drop-shadow-xs" />
                  <div className="min-w-0">
                    <span className="block text-xs font-extrabold tracking-tight text-[#14284B] dark:text-white leading-tight truncate">
                      Jaystarbliss Studios
                    </span>
                    <span className="block text-[11px] font-semibold text-[#1E293B] dark:text-zinc-200 leading-tight truncate mt-0.5">
                      {displayName}
                    </span>
                    <span className="block text-[10px] text-[#64748B] dark:text-slate-400 font-medium leading-tight truncate">
                      {impersonation ? `Viewing as ${roleSubtitle}` : roleSubtitle}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#14284B] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  aria-label="Close sidebar"
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>

              {/* Navigation links */}
              <nav className="flex-1 space-y-2 pt-2">{renderNavGroups(true)}</nav>

              {/* Drawer footer: Log Out only */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <LogOut size={14} /> Log Out
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Responsive Sidebar (Collapsed rail: 72px, expands on hover or manual pin: 268px) */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarExpanded ? 268 : 72 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }}
        onMouseEnter={() => setIsHoverExpanded(true)}
        onMouseLeave={() => setIsHoverExpanded(false)}
        className="hidden md:flex bg-white dark:bg-[#111114] text-[#14284B] dark:text-white flex-col h-full border-r border-[#E2E8F0] dark:border-zinc-800 shrink-0 select-none overflow-hidden shadow-xs"
      >
        {/* Top Header: Organization Logo + Jaystarbliss Studios + User Identity & Role + Pin Toggle */}
        <div className="min-h-16 px-4 py-2 border-b border-[#E2E8F0] dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 overflow-hidden">
          <Tooltip
            content={`Jaystarbliss Studios • ${displayName} (${roleSubtitle})${sidebarPinned ? ' — Click to unpin sidebar' : ' — Click to pin sidebar open'}`}
            placement="right"
            fullWidth
          >
            <button
              type="button"
              onClick={toggleSidebarPin}
              className="flex items-center min-w-0 flex-1 h-full overflow-hidden text-left cursor-pointer group"
              aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            >
              <span className="w-10 h-10 flex items-center justify-center shrink-0">
                <JaystarblissIcon className="w-8 h-8 shrink-0 group-hover:scale-105 transition-transform drop-shadow-xs" />
              </span>
              {sidebarExpanded && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0 pl-2.5 overflow-hidden"
                >
                  <span className="block text-xs sm:text-[13px] font-extrabold tracking-tight text-[#14284B] dark:text-white leading-tight truncate">
                    Jaystarbliss Studios
                  </span>
                  <span className="block text-[11px] font-semibold text-[#1E293B] dark:text-zinc-200 leading-tight truncate mt-0.5">
                    {displayName}
                  </span>
                  <span className="block text-[10px] text-[#64748B] dark:text-zinc-400 font-medium leading-tight truncate">
                    {impersonation ? `Viewing as ${roleSubtitle}` : roleSubtitle}
                  </span>
                </motion.span>
              )}
            </button>
          </Tooltip>

          {sidebarExpanded && (
            <Tooltip content={sidebarPinned ? 'Unpin sidebar (auto-hide on leave)' : 'Pin sidebar open'} placement="right">
              <button
                type="button"
                onClick={toggleSidebarPin}
                aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                className={`p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                  sidebarPinned
                    ? 'text-[#B91C1C] bg-red-50 dark:bg-[#B91C1C]/20 dark:text-red-400'
                    : 'text-[#64748B] dark:text-zinc-400 hover:text-[#14284B] dark:hover:text-white hover:bg-[#F1F5F9] dark:hover:bg-white/10'
                }`}
              >
                {sidebarPinned ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
            </Tooltip>
          )}
        </div>

        {/* Scrollable Navigation Groups */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-1">
          {renderNavGroups(false)}
        </nav>

        {/* Account footer: Log Out only */}
        <div className="p-3 border-t border-[#E2E8F0] dark:border-zinc-800 shrink-0 flex flex-col bg-[#F8FAFC] dark:bg-[#0C0C0E]">
          <Tooltip content="Log Out" placement="right" fullWidth>
            <button
              type="button"
              onClick={logout}
              className={`w-full flex items-center h-10 shrink-0 px-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-[#64748B] dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 text-xs font-semibold overflow-hidden transition-colors cursor-pointer ${
                !sidebarExpanded ? 'justify-center px-0' : ''
              }`}
            >
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                <LogOut size={17} />
              </span>
              {sidebarExpanded && <span className="pl-2 whitespace-nowrap truncate">Log Out</span>}
            </button>
          </Tooltip>
        </div>
      </motion.aside>

      {/* Main Content Workspace */}
      <main className="portal-main-content flex-1 h-full min-w-0 flex flex-col overflow-y-auto custom-scrollbar bg-[#F7F9FC] dark:bg-[#09090B]">
        {/* Standardised Compact Route-Aware Dashboard Header (48-56px height, only current page title visible as text) */}
        <header className="flex items-center justify-between h-13 sm:h-14 px-4 sm:px-6 bg-white/95 dark:bg-[#111114]/95 backdrop-blur-md border-b border-[#E2E8F0] dark:border-zinc-800 sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="md:hidden p-2 -ml-1.5 rounded-xl text-[#14284B] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              <Menu size={19} />
            </button>
            <h1 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white tracking-tight truncate">
              {currentPageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Tooltip content="Customer Support & Help Desk" placement="bottom">
              <Link
                to={`/portal/${role}/support`}
                className="p-2 rounded-xl text-[#64748B] hover:text-[#1E293B] dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                aria-label="Customer Support"
              >
                <HelpCircle size={18} />
              </Link>
            </Tooltip>

            <Tooltip content={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} placement="bottom">
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-xl text-[#64748B] hover:text-[#1E293B] dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={18} className="text-slate-200" /> : <Moon size={18} />}
              </button>
            </Tooltip>

            <div data-tour-id="header-notifications" className="flex items-center">
              <NotificationBell role={role} />
            </div>

            {/* Profile Dropdown (Avatar icon button only in header; full text inside menu) */}
            <div className="relative" ref={profileRef}>
              <Tooltip content={displayName} placement="bottom">
                <button
                  type="button"
                  onClick={() => setShowProfileMenu(v => !v)}
                  className="flex items-center justify-center p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="User profile menu"
                >
                  {photoURL ? (
                    <img src={photoURL} alt={displayName} className="w-8 h-8 rounded-lg object-cover border border-slate-300 dark:border-slate-700" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-[#1E293B] dark:bg-[#B91C1C] text-white flex items-center justify-center font-bold text-xs">
                      {displayName.charAt(0)}
                    </div>
                  )}
                </button>
              </Tooltip>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#111114] rounded-2xl shadow-xl border border-slate-200 dark:border-zinc-800 py-2 z-50 text-xs font-semibold"
                  >
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-800">
                      <p className="font-bold text-[#14284B] dark:text-white truncate">{displayName}</p>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">{userEmail || `${role} account`}</p>
                    </div>
                    <Link
                      to={`/portal/${role}/settings`}
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-[#14284B] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <SlidersHorizontal size={14} /> Account Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setTourReplayToken((n) => n + 1);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-[#14284B] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <HelpCircle size={14} /> Portal Guide
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowPasswordModal(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-[#14284B] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <KeyRound size={14} /> Change Password
                    </button>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-red-50 dark:hover:bg-white/10 text-[#B91C1C] dark:text-white text-left font-bold cursor-pointer"
                    >
                      <LogOut size={14} /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Persistent Subscription Status / Grace Period / Lockdown Bar */}
        <PortalSubscriptionBanner entitlement={entitlement} />

        {/* Main Routed Page Content */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {entitlementLoading && ['school', 'student', 'parent'].includes(role) && !isAlwaysPermittedRoute(location.pathname) ? (
            <div className="min-h-[320px] flex flex-col items-center justify-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Loader2 className="animate-spin text-[#14284B] dark:text-slate-200" size={22} />
              <span>Verifying subscription access…</span>
            </div>
          ) : entitlement?.isLocked && !isRouteAllowed(location.pathname) ? (
            <PortalLockdownView
              entitlement={entitlement}
              restrictedFeatureName={currentPageTitle}
              showHeroBanner
            />
          ) : (
            <Suspense
              fallback={
                <div className="min-h-[280px] flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                  <Loader2 className="animate-spin text-[#B91C1C]" size={18} />
                  <span>Loading view…</span>
                </div>
              }
            >
              <Outlet />
            </Suspense>
          )}
        </div>
      </main>

      <ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
      {(['student', 'parent', 'school', 'staff'].includes(role)) && !entitlement?.isLocked && (
        <PortalOnboardingTour
          role={role as PortalTourRole}
          studentOriginType={studentOriginType}
          canAccessStudentBilling={studentBillingUnlocked && !parentEnrolledStudent}
          isImpersonating={Boolean(impersonation)}
          forceOpenToken={tourReplayToken}
        />
      )}
    </div>
  );
};

const PortalLayout: React.FC = () => {
  const location = useLocation();
  const role = location.pathname.split('/')[2] || 'student';
  return (
    <SubscriptionEntitlementProvider role={role}>
      <PortalLayoutInner role={role} />
    </SubscriptionEntitlementProvider>
  );
};

export default PortalLayout;
