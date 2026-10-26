import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, LogOut, LayoutDashboard, CreditCard, Moon, Sun, Radio, Trophy,
  GraduationCap, ClipboardCheck, CalendarDays, KeyRound, Users, FileCheck2,
  Library, SlidersHorizontal, WalletCards, ExternalLink, Award, Headphones,
  HelpCircle, Keyboard, ChevronDown, PanelLeftClose, FileText, History,
  ChartNoAxesColumn, UserRoundCog, Wallet, Headset, Settings
} from 'lucide-react';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Tooltip } from '../ui/Tooltip';
import { JaystarblissIcon } from '../common/JaystarblissLogo';
import ChangePasswordModal from './ChangePasswordModal';
import NotificationBell from '../common/NotificationBell';
import SEO from '../ui/SEO';
import { getActiveImpersonation } from '../../utils/impersonation';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';
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

const PortalLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const role = location.pathname.split('/')[2] || 'student';

  const [displayName, setDisplayName] = useState('Portal User');
  const [userEmail, setUserEmail] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<Record<string, boolean>>({});
  const [impersonation, setImpersonation] = useState<any>(() => getActiveImpersonation());
  const [studentFeatures, setStudentFeatures] = useState<StudentPortalFeatures>({});
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void migrateAllFirestoreClasses().catch(() => null);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    setUserEmail(user?.email || '');
    setIsEmailVerified(user?.emailVerified ?? true);
    setPhotoURL(user?.photoURL || null);
    setDisplayName(sessionStorage.getItem('userName') || user?.displayName || user?.email?.split('@')[0] || 'Portal User');
    setImpersonation(getActiveImpersonation());
  }, [location.pathname]);

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

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setResendingVerification(true);
    try {
      await sendEmailVerification(user);
      toast.success(`Verification link sent to ${user.email}.`);
    } catch (error: any) {
      toast.error(error?.code === 'auth/too-many-requests' ? 'Please wait before requesting another link.' : 'Unable to send verification email.');
    } finally {
      setResendingVerification(false);
    }
  };

  useEffect(() => {
    if (role !== 'student') return;
    const studentDocId = sessionStorage.getItem('studentDocId') || '';
    if (!studentDocId) return;
    void getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
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
            { name: 'Dashboard', path: '/portal/school', icon: <LayoutDashboard size={19} />, desc: 'School administration workspace overview' },
            { name: 'Class Schedules', path: '/portal/school/schedules', icon: <CalendarDays size={19} />, desc: 'Programme timetables & sessions' }
          ]
        },
        {
          label: 'Academics',
          items: [
            { name: 'Examination Overview', path: '/portal/school/exams', icon: <FileText size={19} />, desc: 'School examination management' },
            { name: 'Examination History', path: '/portal/school/exam-history', icon: <History size={19} />, desc: 'Submissions & past examination records' },
            { name: 'Learner Progress', path: '/portal/school/learner-progress', icon: <ChartNoAxesColumn size={19} />, desc: 'Assessment reports & progress tracking' }
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
          label: 'Finance',
          items: [
            { name: 'Fees & Payments', path: '/portal/school/payments', icon: <Wallet size={19} />, desc: 'Institutional fees & payments' }
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
        { name: 'Learning & Tracks', path: '/portal/student/courses', icon: <GraduationCap size={19} />, desc: 'Curriculum & Series' }
      ];
      if (studentFeatures.assessments) {
        academicItems.push({ name: 'Assessments & Quizzes', path: '/portal/student/assessments', icon: <ClipboardCheck size={19} />, desc: 'Assessments, quizzes and coursework' });
      }
      academicItems.push(
        { name: 'Assignments', path: '/portal/student/assignments', icon: <ClipboardCheck size={19} />, desc: 'View and submit assigned work' },
        { name: 'Examinations', path: '/portal/student/exams', icon: <FileCheck2 size={19} />, desc: 'Scheduled tests, attempts and results' }
      );
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
          items: [{ name: 'Dashboard', path: '/portal/staff', icon: <LayoutDashboard size={19} />, desc: 'Tutor workspace overview' }]
        },
        {
          label: 'Teaching & Schedule',
          items: [
            { name: 'Live Classes', path: '/portal/staff/classes', icon: <Radio size={19} />, desc: 'Teaching roster & sessions' },
            { name: 'Calendar', path: '/portal/staff/calendar', icon: <CalendarDays size={19} />, desc: 'Teaching timetable' },
            { name: 'Subjects I Teach', path: '/portal/staff/subjects', icon: <Award size={19} />, desc: 'Teaching subjects & approvals' }
          ]
        },
        {
          label: 'Academics & Tests',
          items: [
            { name: 'Assignments', path: '/portal/staff/assignments', icon: <ClipboardCheck size={19} />, desc: 'Create and review assigned work' },
            { name: 'Assessments & Quizzes', path: '/portal/staff/assessments', icon: <ClipboardCheck size={19} />, desc: 'Manage learning assessments and quizzes' },
            { name: 'Examinations', path: '/portal/staff/exams', icon: <FileCheck2 size={19} />, desc: 'Create and manage student tests' },
            { name: 'Examination History', path: '/portal/staff/exam-history', icon: <History size={19} />, desc: 'Review submissions and results' }
          ]
        },
        {
          label: 'People & Resources',
          items: [
            { name: 'Student Access', path: '/portal/staff/credentials', icon: <KeyRound size={19} />, desc: 'Access credentials' },
            { name: 'Lesson Resources', path: '/portal/staff/resources', icon: <BookOpen size={19} />, desc: 'Lesson materials' }
          ]
        },
        {
          label: 'Finance',
          items: [{ name: 'Billing / Fees', path: '/portal/staff/payments', icon: <WalletCards size={19} />, desc: 'Tutor ledger & payouts' }]
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
            { name: 'Examination Results', path: '/portal/parent/examinations', icon: <FileCheck2 size={19} />, desc: 'View released results for linked children' }
          ]
        },
        {
          label: 'Finance',
          items: [{ name: 'Payments & Fees', path: '/portal/parent/payments', icon: <CreditCard size={19} />, desc: 'Invoices & statements' }]
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

  const roleTitle = role === 'school' ? 'School Administration' : role.charAt(0).toUpperCase() + role.slice(1);
  const accessCodeOnly = !userEmail && Boolean(sessionStorage.getItem('studentDocId'));

  const isItemActive = (path: string) => {
    if (location.pathname === path) return true;
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
      const hasActive = group.items.some(item => isItemActive(item.path));
      const isOpen = collapsedNavGroups[group.label] !== undefined ? collapsedNavGroups[group.label] : true;

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
      <SEO title={`${roleTitle} | Jaystarbliss Studios`} description={`Jaystarbliss Studios ${roleTitle} portal.`} noindex />

      {/* Mobile Top Navigation */}
      <div className="md:hidden bg-white dark:bg-[#14284B] text-[#14284B] dark:text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
          aria-label="Toggle navigation sidebar"
        >
          <JaystarblissIcon className="w-7 h-7 shrink-0 text-[#2563EB]" />
          <span className="font-bold text-xs uppercase tracking-tight text-[#14284B] dark:text-white whitespace-nowrap">JDI</span>
          <span className="text-[10px] uppercase font-bold bg-[#E8F0FF] text-[#2563EB] px-2 py-0.5 rounded-md">
            {role}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/portal/${role}/support`}
            className="p-2 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-[#2563EB]"
            aria-label="Support & Help"
          >
            <HelpCircle size={16} />
          </Link>
          <NotificationBell role={role} />
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-[#2563EB]"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
          </button>
        </div>
      </div>

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
              <div className="flex items-center justify-between h-12 pb-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <JaystarblissIcon className="w-6 h-6 text-[#2563EB]" />
                  <span className="text-xs font-bold tracking-tight text-[#14284B] dark:text-white">JDI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#14284B] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close sidebar"
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>

              {/* User badge */}
              <div className="px-3 py-2.5 my-3 bg-[#F7F9FC] dark:bg-white/5 rounded-2xl flex items-center gap-3 shrink-0 border border-slate-200/60 dark:border-white/5">
                {photoURL ? (
                  <img src={photoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-[#2563EB]/40" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold">
                    {displayName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#14284B] dark:text-white truncate">{displayName}</p>
                  <p className="text-[10px] text-[#64748B] dark:text-slate-400 truncate">{userEmail || `${role} workspace`}</p>
                </div>
              </div>

              {/* Navigation links */}
              <nav className="flex-1 space-y-2">{renderNavGroups(true)}</nav>

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
        {/* Top Header: Logo + Toggle */}
        <div className="h-16 px-4 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 overflow-hidden">
          <Tooltip content={sidebarExpanded ? 'Click logo to collapse sidebar' : 'Click logo to expand sidebar'} placement="right">
            <button
              type="button"
              onClick={() => setSidebarExpanded(prev => !prev)}
              className="flex items-center min-w-0 flex-1 h-full overflow-hidden text-left cursor-pointer group"
              aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <span className="w-10 h-10 flex items-center justify-center shrink-0">
                <JaystarblissIcon className="w-8 h-8 text-[#2563EB] group-hover:scale-105 transition-transform" />
              </span>
              {sidebarExpanded && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0 pl-2.5 whitespace-nowrap overflow-hidden"
                >
                  <span className="block text-xs font-bold tracking-tight text-[#14284B] dark:text-white truncate">
                    JDI
                  </span>
                  <span className="block text-[10px] text-[#2563EB] dark:text-blue-400 font-semibold uppercase tracking-wider truncate">
                    {role === 'school' ? 'School Workspace' : `${role} Workspace`}
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
        {!isEmailVerified && !accessCodeOnly && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2 shrink-0">
            <span className="truncate">Your email address ({userEmail}) is unverified.</span>
            <button
              type="button"
              onClick={resendVerification}
              disabled={resendingVerification}
              className="underline font-bold shrink-0 cursor-pointer"
            >
              {resendingVerification ? 'Sending…' : 'Resend Link'}
            </button>
          </div>
        )}

        {/* Topbar Header */}
        <header className="hidden md:flex items-center justify-between px-6 py-3.5 bg-white/90 dark:bg-[#14284B]/90 backdrop-blur-md border-b border-[#E2E8F0] dark:border-slate-800 sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[#14284B] dark:text-white uppercase tracking-wider">
              {roleTitle} Workspace
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <Tooltip content="Customer Support & Help Desk" placement="bottom">
              <Link
                to={`/portal/${role}/support`}
                className="p-2 rounded-xl text-[#64748B] hover:text-[#2563EB] dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                aria-label="Customer Support"
              >
                <HelpCircle size={18} />
                <span className="hidden lg:inline text-xs font-bold text-[#14284B] dark:text-slate-300">Support</span>
              </Link>
            </Tooltip>

            <NotificationBell role={role} />

            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu(v => !v)}
                className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="User profile menu"
              >
                {photoURL ? (
                  <img src={photoURL} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-[#2563EB]/40" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-xs">
                    {displayName.charAt(0)}
                  </div>
                )}
                <span className="text-xs font-bold text-[#14284B] dark:text-slate-200">{displayName}</span>
              </button>

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
