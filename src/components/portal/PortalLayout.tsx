import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, LogOut, LayoutDashboard, CreditCard, Moon, Sun, Radio, Trophy,
  GraduationCap, ClipboardCheck, CalendarDays, KeyRound, Users, FileCheck2,
  Library, SlidersHorizontal, WalletCards, ExternalLink, Award, Headphones,
  HelpCircle, Keyboard, ChevronDown, PanelLeftClose, FileText, History,
  ChartNoAxesColumn, UserRoundCog, Wallet, Headset, Settings, Menu
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useTheme } from '../../contexts/ThemeContext';
import { Tooltip } from '../ui/Tooltip';
import { JaystarblissIcon } from '../common/JaystarblissLogo';
import ChangePasswordModal from './ChangePasswordModal';
import NotificationBell from '../common/NotificationBell';
import SEO from '../ui/SEO';
import { getActiveImpersonation } from '../../utils/impersonation';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';
import { resolvePartnerSchoolName } from '../../lib/classes';
import { useEdgeSwipeDrawer } from '../../hooks/useEdgeSwipeDrawer';
import './portal-polish.css';

type NavItem = {
  name: string;
  path: string;
  icon: React.ReactNode;
  desc: string;
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
  if (clean.endsWith('/courses')) return 'Learning & Tracks';
  if (clean.endsWith('/achievements')) return 'Achievements';
  if (clean.endsWith('/edge-club')) return 'Ed Club';
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

const PortalLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const role = location.pathname.split('/')[2] || 'student';

  const [displayName, setDisplayName] = useState('Portal User');
  const [roleSubtitle, setRoleSubtitle] = useState(() => resolveRoleSubtitle(role));
  const [userEmail, setUserEmail] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [collapsedNavGroups] = useState<Record<string, boolean>>({});
  const [impersonation, setImpersonation] = useState<any>(() => getActiveImpersonation());
  const [studentFeatures, setStudentFeatures] = useState<StudentPortalFeatures>({});
  const profileRef = useRef<HTMLDivElement>(null);

  useEdgeSwipeDrawer(mobileMenuOpen, setMobileMenuOpen, 768);

  useEffect(() => {
    void migrateAllFirestoreClasses().catch(() => null);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    const activeImp = getActiveImpersonation();
    setImpersonation(activeImp);
    setUserEmail(activeImp?.email || user?.email || '');
    setPhotoURL(user?.photoURL || null);
    setRoleSubtitle(resolveRoleSubtitle(role));

    const cachedSchoolName = resolvePartnerSchoolName(
      sessionStorage.getItem('schoolName'),
      sessionStorage.getItem('institutionName')
    );
    const cachedUserName =
      activeImp?.name ||
      sessionStorage.getItem('userName') ||
      sessionStorage.getItem('studentName') ||
      user?.displayName ||
      '';

    if (role === 'school' && cachedSchoolName) {
      setDisplayName(cachedSchoolName);
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

    // Resolve authoritative name from Firestore profile or school document
    const targetUid = activeImp?.uid || sessionStorage.getItem('userId') || user?.uid || '';
    const schoolId = sessionStorage.getItem('schoolId') || '';

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
            } else if (targetUid) {
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
              });
            }
          })
          .catch(() => undefined);
      }
    } else if (targetUid) {
      void getDoc(doc(db, 'users', targetUid))
        .then(snap => {
          if (!snap.exists()) return;
          const data = snap.data() as any;
          const realName = String(data.fullName || data.name || data.displayName || '').trim();
          if (realName) {
            setDisplayName(realName);
            sessionStorage.setItem('userName', realName);
          }
          if (data.photoURL || data.avatarUrl) {
            setPhotoURL(data.photoURL || data.avatarUrl);
          }
        })
        .catch(() => undefined);
    }
  }, [location.pathname, role]);

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
    const studentDocId = sessionStorage.getItem('studentDocId') || '';
    if (!studentDocId) return;
    void getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const realStudentName = String(data.fullName || data.name || '').trim();
      if (realStudentName) {
        setDisplayName(realStudentName);
        sessionStorage.setItem('userName', realStudentName);
      }
      const featureAccess = data.featureAccess || {};
      const deliveryMode = normalizeMode(data.deliveryMode || data.classScheduleDetails?.deliveryMode);
      const registrationSource = normalizeMode(data.registrationSource);
      const next = {
        assessments: featureAccess.assessments === true,
        edClub: featureAccess.edClub === true || data.edClubEnabled === true,
        deliveryMode,
        registrationSource
      };
      setStudentFeatures(next);
      sessionStorage.setItem('studentEdClubEnabled', String(next.edClub));
      sessionStorage.setItem('studentDeliveryMode', deliveryMode);
      sessionStorage.setItem('studentRegistrationSource', registrationSource);
    }).catch(() => undefined);
  }, [role, location.pathname]);

  const parentEnrolledStudent = role === 'student' && (
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
            { name: 'Dashboard', path: '/portal/school', icon: <LayoutDashboard size={19} />, desc: 'School administration overview' },
            { name: 'Class Schedules', path: '/portal/school/schedules', icon: <CalendarDays size={19} />, desc: 'Programme timetables & sessions' }
          ]
        },
        {
          label: 'Academics',
          items: [
            { name: 'Assessment Overview', path: '/portal/school/exams', icon: <FileText size={19} />, desc: 'School assessment management' },
            { name: 'Assessment History', path: '/portal/school/exam-history', icon: <History size={19} />, desc: 'Submissions & past assessment records' },
            { name: 'Learner Progress', path: '/portal/school/learner-progress', icon: <ChartNoAxesColumn size={19} />, desc: 'Assignments, activities, tests, assessments & attendance' }
          ]
        },
        {
          label: 'People',
          items: [
            { name: 'Learners Roster', path: '/portal/school/roster', icon: <Users size={19} />, desc: 'Student directory and class assignments' },
            { name: 'Student Access', path: '/portal/school/credentials', icon: <UserRoundCog size={19} />, desc: 'Access credentials & passcodes' }
          ]
        },
        {
          label: 'Finance & Agreements',
          items: [
            { name: 'Fees & Payments', path: '/portal/school/payments', icon: <Wallet size={19} />, desc: 'Institutional fees & payments' },
            { name: 'Agreements', path: '/portal/school/agreements', icon: <FileCheck2 size={19} />, desc: 'Proposals, communications & school contracts' }
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
            { name: 'Help & Support', path: '/portal/school/support', icon: <Headset size={19} />, desc: 'Institutional support & help desk' },
            { name: 'Settings', path: '/portal/school/settings', icon: <Settings size={19} />, desc: 'School preferences & configuration' }
          ]
        }
      ];
    }

    if (role === 'student') {
      const academicItems: NavItem[] = [
        { name: 'Learning & Tracks', path: '/portal/student/courses', icon: <GraduationCap size={19} />, desc: 'Curriculum & Series' },
        { name: 'Assessments & Work', path: '/portal/student/assessments', icon: <ClipboardCheck size={19} />, desc: 'Assignments, activities, tests & exams' }
      ];
      if (studentFeatures.edClub) {
        academicItems.push({ name: 'Ed Club', path: '/portal/student/edge-club', icon: <Keyboard size={19} />, desc: 'Keyboarding & speed typing portal' });
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
          items: [{ name: 'Dashboard', path: '/portal/student', icon: <LayoutDashboard size={19} />, desc: 'Student portal overview' }]
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
          { name: 'Lesson Resources', path: '/portal/student/resources', icon: <BookOpen size={19} />, desc: 'Lesson notes & materials' }
        ]
      });

      if (sessionStorage.getItem('studentRegistrationType') === 'individual') {
        groups.push({
          label: 'Finance',
          items: [{ name: 'Payments & Fees', path: '/portal/student/payments', icon: <CreditCard size={19} />, desc: 'Personal billing & statements' }]
        });
      }

      groups.push({
        label: 'Administration',
        items: [
          { name: 'Help & Support', path: '/portal/student/support', icon: <Headset size={19} />, desc: 'Help desk & live support chat' },
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
            { name: 'Dashboard', path: '/portal/staff', icon: <LayoutDashboard size={19} />, desc: 'Assigned schools, schedules & reminders' },
            { name: 'Assigned Learners', path: '/portal/staff/students', icon: <Users size={19} />, desc: 'School-assigned & private learners roster' }
          ]
        },
        {
          label: 'Teaching & Schedule',
          items: [
            { name: 'Live Classes', path: '/portal/staff/classes', icon: <Radio size={19} />, desc: 'Teaching roster, schedules & attendance' },
            { name: 'Calendar', path: '/portal/staff/calendar', icon: <CalendarDays size={19} />, desc: 'Teaching timetable' },
            { name: 'Subjects I Teach', path: '/portal/staff/subjects', icon: <Award size={19} />, desc: 'Teaching subjects & approvals' }
          ]
        },
        {
          label: 'Academics & Assessments',
          items: [
            { name: 'Assessments', path: '/portal/staff/assessments', icon: <ClipboardCheck size={19} />, desc: 'Create & manage assignments, activities, tests & assessments' },
            { name: 'Assessment History', path: '/portal/staff/exam-history', icon: <History size={19} />, desc: 'Review history across assignments, activities, tests & assessments' },
            { name: 'Assignments & Review', path: '/portal/staff/assignments', icon: <FileText size={19} />, desc: 'Assign & grade individual student coursework' },
            { name: 'Milestone Roadmap', path: '/portal/staff/milestones', icon: <GraduationCap size={19} />, desc: 'Track learner & school curriculum milestones' }
          ]
        },
        {
          label: 'People & Resources',
          items: [
            { name: 'Student Access', path: '/portal/staff/credentials', icon: <KeyRound size={19} />, desc: 'Issue & manage learner access codes' },
            { name: 'Lesson Resources', path: '/portal/staff/resources', icon: <BookOpen size={19} />, desc: 'Distribute documents, images, videos & links' }
          ]
        },
        {
          label: 'Finance & Agreements',
          items: [
            { name: 'Billing / Fees', path: '/portal/staff/payments', icon: <WalletCards size={19} />, desc: 'Tutor ledger & payouts' },
            { name: 'Agreements', path: '/portal/staff/agreements', icon: <FileCheck2 size={19} />, desc: 'Proposals, communications & tutor contracts' }
          ]
        },
        {
          label: 'Administration',
          items: [
            { name: 'Help & Support', path: '/portal/staff/support', icon: <Headset size={19} />, desc: 'Help desk & live support chat' },
            { name: 'Settings', path: '/portal/staff/settings', icon: <Settings size={19} />, desc: 'Account preferences' }
          ]
        }
      ];
    }

    if (role === 'parent') {
      return [
        {
          label: 'Overview',
          items: [{ name: 'Dashboard', path: '/portal/parent', icon: <LayoutDashboard size={19} />, desc: 'Parent dashboard' }]
        },
        {
          label: 'Learning & Schedules',
          items: [
            { name: 'Class Schedules', path: '/portal/parent/schedules', icon: <CalendarDays size={19} />, desc: 'Class timetable and session status' },
            { name: 'Resources', path: '/portal/parent/resources', icon: <BookOpen size={19} />, desc: 'Learning materials' }
          ]
        },
        {
          label: 'Academics & Performance',
          items: [
            { name: 'Assignments', path: '/portal/parent/assignments', icon: <ClipboardCheck size={19} />, desc: 'Track assigned work' },
            { name: 'Assessments & Quizzes', path: '/portal/parent/assessments', icon: <ClipboardCheck size={19} />, desc: 'View learning assessments' },
            { name: 'Assessment Results', path: '/portal/parent/examinations', icon: <FileCheck2 size={19} />, desc: 'View released results for linked children' }
          ]
        },
        {
          label: 'Finance & Agreements',
          items: [
            { name: 'Payments & Fees', path: '/portal/parent/payments', icon: <CreditCard size={19} />, desc: 'Invoices & statements' },
            { name: 'Agreements', path: '/portal/parent/agreements', icon: <FileCheck2 size={19} />, desc: 'Proposals, communications & family agreements' }
          ]
        },
        {
          label: 'Administration',
          items: [
            { name: 'Help & Support', path: '/portal/parent/support', icon: <Headset size={19} />, desc: 'Help desk & live support chat' },
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

    if (!mobile && !sidebarExpanded) {
      // Collapsed rail mode: icon-only with tooltip
      return (
        <Tooltip content={`${item.name} • ${item.desc}`} placement="right" delay={150}>
          <Link
            to={item.path}
            aria-label={item.name}
            className={`relative flex items-center justify-center w-11 h-11 mx-auto my-0.5 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 ${
              active
                ? 'bg-[#E8F0FF] dark:bg-blue-950/50 text-[#2563EB] dark:text-blue-400 font-semibold shadow-xs'
                : 'text-[#64748B] dark:text-slate-400 hover:bg-[#F0F5FF] dark:hover:bg-white/5 hover:text-[#2563EB] dark:hover:text-blue-400'
            }`}
          >
            {active && (
              <span className="absolute left-1 w-1 h-5 rounded-full bg-[#2563EB] dark:bg-blue-400" />
            )}
            <span className="shrink-0 flex items-center justify-center">{item.icon}</span>
          </Link>
        </Tooltip>
      );
    }

    // Expanded / Mobile mode: full row with deliberate spacing, active indicator and typography
    return (
      <Tooltip content={!mobile ? item.desc : undefined} placement="right" delay={300}>
        <Link
          to={item.path}
          onClick={() => { if (mobile) setMobileMenuOpen(false); }}
          className={`relative group flex items-center h-11 min-h-[44px] px-3 my-0.5 rounded-xl text-xs transition-colors overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 ${
            active
              ? 'bg-[#E8F0FF] dark:bg-blue-950/50 text-[#2563EB] dark:text-blue-400 font-semibold shadow-xs'
              : 'text-[#14284B] dark:text-slate-200 hover:bg-[#F0F5FF] dark:hover:bg-white/5 hover:text-[#2563EB] dark:hover:text-blue-400 font-medium'
          }`}
        >
          {active && (
            <span className="absolute left-1.5 w-1 h-5 rounded-full bg-[#2563EB] dark:bg-blue-400" />
          )}
          <span className={`w-8 h-8 flex items-center justify-center shrink-0 ml-1 transition-colors ${
            active ? 'text-[#2563EB] dark:text-blue-400' : 'text-[#64748B] dark:text-slate-400 group-hover:text-[#2563EB] dark:group-hover:text-blue-400'
          }`}>
            {item.icon}
          </span>
          <span className="min-w-0 truncate pl-2.5 text-[13px]">{item.name}</span>
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
    <div className="portal-shell h-screen w-full bg-[#F7F9FC] dark:bg-[#1A2436] text-[#14284B] dark:text-slate-100 flex flex-col md:flex-row overflow-hidden font-sans">
      <SEO title={`${currentPageTitle} | ${roleTitle} | Jaystarbliss Studios`} description={`Jaystarbliss Studios ${roleTitle} portal.`} noindex />

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <motion.button
              aria-label="Close menu"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
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
              className="absolute inset-y-0 left-0 w-[80vw] max-w-[280px] bg-white dark:bg-[#14284B] text-[#14284B] dark:text-white border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between min-h-14 pb-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                >
                  {photoURL ? (
                    <img src={photoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-[#2563EB]/40 shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {displayName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="block text-xs font-bold tracking-tight text-[#14284B] dark:text-white leading-snug line-clamp-2">
                      {displayName}
                    </span>
                    <span className="block text-[11px] text-[#64748B] dark:text-slate-400 font-medium truncate">
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

              {/* Drawer footer utilities */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
                <Link
                  to="/"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:text-[#2563EB] hover:bg-[#F0F5FF] dark:hover:bg-white/5 transition-colors"
                >
                  <ExternalLink size={16} /> Main Website
                </Link>
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

      {/* Desktop Responsive Sidebar (Expanded: 268px, Collapsed: 72px) */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarExpanded ? 268 : 72 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }}
        className="hidden md:flex bg-white dark:bg-[#14284B] text-[#14284B] dark:text-white flex-col h-full border-r border-[#E2E8F0] dark:border-slate-800 shrink-0 select-none overflow-hidden shadow-xs"
      >
        {/* Top Header: Profile Identity + Collapse Toggle */}
        <div className="min-h-16 px-4 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 overflow-hidden">
          <Tooltip
            content={`${displayName} • ${roleSubtitle}${sidebarExpanded ? ' (Click to collapse)' : ' (Click to expand)'}`}
            placement="right"
          >
            <button
              type="button"
              onClick={() => setSidebarExpanded(prev => !prev)}
              className="flex items-center min-w-0 flex-1 h-full overflow-hidden text-left cursor-pointer group"
              aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <span className="w-10 h-10 flex items-center justify-center shrink-0">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt={displayName}
                    className="w-9 h-9 rounded-full object-cover border border-[#2563EB]/40"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shadow-xs group-hover:scale-105 transition-transform">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              {sidebarExpanded && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0 pl-2.5 overflow-hidden"
                >
                  <span className="block text-xs font-bold tracking-tight text-[#14284B] dark:text-white leading-snug line-clamp-2">
                    {displayName}
                  </span>
                  <span className="block text-[11px] text-[#64748B] dark:text-slate-400 font-medium truncate">
                    {impersonation ? `Viewing as ${roleSubtitle}` : roleSubtitle}
                  </span>
                </motion.span>
              )}
            </button>
          </Tooltip>

          {sidebarExpanded && (
            <Tooltip content="Collapse sidebar" placement="right">
              <button
                type="button"
                onClick={() => setSidebarExpanded(false)}
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#14284B] dark:hover:text-white hover:bg-[#F0F5FF] dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <PanelLeftClose size={18} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Scrollable Navigation Groups */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-1">
          {renderNavGroups(false)}
        </nav>

        {/* External & Account actions utility area */}
        <div className="p-3 border-t border-[#E2E8F0] dark:border-slate-800 shrink-0 flex flex-col gap-1 bg-[#FAFCFF] dark:bg-[#12223F]">
          <Tooltip content="Return to Main Website" placement="right">
            <Link
              to="/"
              className={`w-full flex items-center h-10 shrink-0 px-3 rounded-xl hover:bg-[#F0F5FF] dark:hover:bg-white/10 text-[#64748B] dark:text-slate-300 hover:text-[#2563EB] dark:hover:text-blue-400 text-xs font-semibold overflow-hidden transition-colors ${
                !sidebarExpanded ? 'justify-center px-0' : ''
              }`}
            >
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                <ExternalLink size={17} />
              </span>
              {sidebarExpanded && <span className="pl-2 whitespace-nowrap truncate">Main Website</span>}
            </Link>
          </Tooltip>

          <Tooltip content="Appearance" placement="right">
            <button
              type="button"
              onClick={toggleTheme}
              className={`w-full flex items-center h-10 shrink-0 px-3 rounded-xl hover:bg-[#F0F5FF] dark:hover:bg-white/10 text-[#64748B] dark:text-slate-300 hover:text-[#2563EB] dark:hover:text-blue-400 text-xs font-semibold overflow-hidden transition-colors cursor-pointer ${
                !sidebarExpanded ? 'justify-center px-0' : ''
              }`}
            >
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
              </span>
              {sidebarExpanded && <span className="pl-2 whitespace-nowrap truncate">Appearance</span>}
            </button>
          </Tooltip>

          <Tooltip content="Log Out" placement="right">
            <button
              type="button"
              onClick={logout}
              className={`w-full flex items-center h-10 shrink-0 px-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-[#64748B] hover:text-red-600 dark:hover:text-red-400 text-xs font-semibold overflow-hidden transition-colors cursor-pointer ${
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
      <main className="portal-main-content flex-1 h-full min-w-0 flex flex-col overflow-y-auto custom-scrollbar bg-[#F7F9FC] dark:bg-[#1A2436]">
        {/* Standardised Compact Route-Aware Dashboard Header (48-56px height, only current page title visible as text) */}
        <header className="flex items-center justify-between h-13 sm:h-14 px-4 sm:px-6 bg-white/90 dark:bg-[#14284B]/90 backdrop-blur-md border-b border-[#E2E8F0] dark:border-slate-800 sticky top-0 z-20 shrink-0">
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
                className="p-2 rounded-xl text-[#64748B] hover:text-[#2563EB] dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                aria-label="Customer Support"
              >
                <HelpCircle size={18} />
              </Link>
            </Tooltip>

            <Tooltip content={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} placement="bottom">
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-xl text-[#64748B] hover:text-[#2563EB] dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
              </button>
            </Tooltip>

            <NotificationBell role={role} />

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
                    <img src={photoURL} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-[#2563EB]/40" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-xs">
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
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 text-xs font-semibold"
                  >
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
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
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 text-left font-bold cursor-pointer"
                    >
                      <LogOut size={14} /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Main Routed Page Content */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      <ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </div>
  );
};

export default PortalLayout;
