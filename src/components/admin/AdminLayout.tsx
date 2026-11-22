import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Settings, LogOut, LayoutDashboard, 
  CreditCard, UserCheck, School,
  Sun, Moon, Menu, X, ChevronDown, 
  MessageSquare, Layers, BookOpen, 
  Briefcase, FolderOpen, Gamepad2, FileText, 
  Bell, Activity, Search, ChevronsUpDown,
  ExternalLink, CalendarDays, Library, ShieldCheck,
  SlidersHorizontal, Trophy, Radio, GraduationCap, Award,
  HelpCircle, Headphones, PanelLeftClose, Megaphone, Pin, PinOff, Loader2
} from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { checkAndNotifyExpiredAssessments } from '../../lib/assessmentNotificationHelpers';
import { Tooltip } from '../ui/Tooltip';
import SearchModal from '../ui/SearchModal';
import ImpersonateUserModal from './ImpersonateUserModal';
import { JaystarblissIcon } from '../common/JaystarblissLogo';
import NotificationBell from '../common/NotificationBell';
import SEO from '../ui/SEO';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';
import { useEdgeSwipeDrawer } from '../../hooks/useEdgeSwipeDrawer';
import {
  getAdminDashboardCapabilities,
  resolveCanonicalAdminScope,
  SUPER_ADMIN_EMAILS,
} from '../../utils/adminRbac';
import { getActiveImpersonation } from '../../utils/impersonation';
import { getExternalMainWebsiteUrl, useStandalonePWA } from '../../utils/pwa';
import '../portal/portal-polish.css';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  desc: string;
  badge?: string;
}

interface NavGroup {
  sectionTitle: string;
  items: NavItem[];
}

function resolveAdminPageTitle(pathname: string, flatNavList: NavItem[]): string {
  const clean = pathname.replace(/\/+$/, '') || '/admin';
  if (clean === '/admin') return 'Dashboard';
  if (clean === '/admin/programs/new') return 'Create Program';
  if (clean.startsWith('/admin/programs/')) return 'Edit Program';
  if (clean === '/admin/services/new') return 'Create Service';
  if (clean.startsWith('/admin/services/')) return 'Edit Service';
  if (clean === '/admin/blog/new') return 'Create Blog Post';
  if (clean.startsWith('/admin/blog/')) return 'Edit Blog Post';
  if (clean === '/admin/portfolio/new') return 'Create Case Study';
  if (clean.startsWith('/admin/portfolio/')) return 'Edit Case Study';
  if (clean === '/admin/pages/new') return 'Create Page';
  if (clean.startsWith('/admin/pages/')) return 'Edit Page';
  if (clean === '/admin/promotions') return 'Promotions & Ads';
  if (clean === '/admin/schools/onboard') return 'Onboard School';
  if (clean === '/admin/parents') return 'Parents';
  if (clean === '/admin/reports') return 'Reports';
  if (clean === '/admin/tutor-subjects') return 'Tutor Subjects';
  if (clean === '/admin/agreements') return 'Agreements Centre';
  if (clean === '/admin/examinations') return 'Assessments';
  if (clean === '/admin/examination-history') return 'Assessment History';
  if (clean === '/admin/academic-reporting') return 'Academic Reporting';
  if (clean === '/admin/billing') return 'Billing';
  if (clean === '/admin/settings') return 'Settings';
  if (clean === '/admin/support') return 'Support';

  const exact = flatNavList.find(item => item.href === clean);
  if (exact) return exact.name;

  const prefix = flatNavList.find(
    item => item.href !== '/admin' && clean.startsWith(`${item.href}/`)
  );
  if (prefix) return prefix.name;

  return 'Dashboard';
}

const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [impersonateModalOpen, setImpersonateModalOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem('admin_sidebar_pinned') === 'true';
    } catch {
      return false;
    }
  });
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const isSidebarExpanded = sidebarPinned || isHoverExpanded;
  const isStandalone = useStandalonePWA();

  const toggleSidebarPin = () => {
    setSidebarPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('admin_sidebar_pinned', String(next));
      } catch {
        // Ignore storage write failure
      }
      if (!next) {
        setIsHoverExpanded(false);
      }
      return next;
    });
  };

  useEdgeSwipeDrawer(sidebarOpen, setSidebarOpen, 1024);

  useEffect(() => {
    void migrateAllFirestoreClasses().catch(() => null);
  }, []);

  // Collapsible Section Accordion State
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('admin_expanded_nav_sections');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading admin expanded nav sections:', e);
    }
    return {
      "Overview & Operations": true,
      "Website & Pages CMS": true,
      "Portals & Academic Hub": true,
      "CBT Assessment": true,
      "System & Management": true,
    };
  });

  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { unreadCount: unreadNotificationCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  // Live numeric counters for actionable admin sidebar sections
  const [pendingCounts, setPendingCounts] = useState<{
    tutorApps: number;
    studentReqs: number;
    enrollReqs: number;
    progApps: number;
    inquiries: number;
    tutorSubjects: number;
    supportTickets: number;
  }>({
    tutorApps: 0,
    studentReqs: 0,
    enrollReqs: 0,
    progApps: 0,
    inquiries: 0,
    tutorSubjects: 0,
    supportTickets: 0,
  });

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'tutor_applications'), where('status', '==', 'pending')),
        (snap) => setPendingCounts((prev) => ({ ...prev, tutorApps: snap.size })),
        () => undefined
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'student_requests'), where('status', '==', 'pending')),
        (snap) => setPendingCounts((prev) => ({ ...prev, studentReqs: snap.size })),
        () => undefined
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'enrollment_requests'), where('status', '==', 'pending')),
        (snap) => setPendingCounts((prev) => ({ ...prev, enrollReqs: snap.size })),
        () => undefined
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'programme_enrollments'), where('enrollmentStatus', '==', 'PENDING_ADMIN_REVIEW')),
        (snap) => setPendingCounts((prev) => ({ ...prev, progApps: snap.size })),
        () => undefined
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'tutor_subject_applications'), where('status', '==', 'pending')),
        (snap) => setPendingCounts((prev) => ({ ...prev, tutorSubjects: snap.size })),
        () => undefined
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'inquiries'),
        (snap) => {
          const count = snap.docs.filter((d) => {
            const st = String(d.data()?.status || 'NEW').toUpperCase();
            return st === 'NEW' || st === 'PENDING' || st === 'UNREAD';
          }).length;
          setPendingCounts((prev) => ({ ...prev, inquiries: count }));
        },
        () => undefined
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'supportTickets'),
        (snap) => {
          const count = snap.docs.filter((d) => {
            const data = d.data() || {};
            const st = String(data.status || 'OPEN').toUpperCase();
            return data.unreadByAdmin === true || st === 'OPEN';
          }).length;
          setPendingCounts((prev) => ({ ...prev, supportTickets: count }));
        },
        () => undefined
      )
    );

    if (auth.currentUser?.uid) {
      void checkAndNotifyExpiredAssessments({
        role: 'admin',
        uid: auth.currentUser.uid,
      });
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  const badgeCountByHref = useMemo<Record<string, number>>(() => {
    const approvalsTotal =
      pendingCounts.tutorApps +
      pendingCounts.studentReqs +
      pendingCounts.enrollReqs +
      pendingCounts.progApps;
    return {
      '/admin/approvals': approvalsTotal,
      '/admin/inquiries': pendingCounts.inquiries,
      '/admin/tutor-subjects': pendingCounts.tutorSubjects,
      '/admin/support': pendingCounts.supportTickets,
      '/admin/notifications': unreadNotificationCount,
    };
  }, [pendingCounts, unreadNotificationCount]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    sessionStorage.clear();
    localStorage.removeItem('jaystar_cached_user_role');
    localStorage.removeItem('jaystar_cached_user_id');
    toast.success('Admin session terminated');
    navigate('/portal');
  };

  const [activeRole, setActiveRole] = useState<string>(() => {
    const imp = getActiveImpersonation();
    if (imp?.isMasquerading && imp.targetRole) {
      return String(imp.targetRole).toUpperCase();
    }
    return (
      sessionStorage.getItem('userRole') ||
      localStorage.getItem('jaystar_cached_user_role') ||
      'SUPER_ADMIN'
    ).toUpperCase();
  });

  useEffect(() => {
    const syncRoleFromStorageAndAuth = async (uid?: string, email?: string | null) => {
      const imp = getActiveImpersonation();
      if (imp?.isMasquerading && imp.targetRole) {
        setActiveRole(String(imp.targetRole).toUpperCase());
        return;
      }

      const storedRole = (
        sessionStorage.getItem('userRole') ||
        localStorage.getItem('jaystar_cached_user_role') ||
        ''
      ).toUpperCase();

      if (storedRole && resolveCanonicalAdminScope(storedRole)) {
        setActiveRole(storedRole);
      }

      if (uid) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const dbRole = String(snap.data()?.role || '').trim().toUpperCase();
            if (resolveCanonicalAdminScope(dbRole)) {
              setActiveRole(dbRole);
              sessionStorage.setItem('userRole', dbRole.toLowerCase());
              return;
            }
          }
        } catch (err) {
          console.warn('AdminLayout role lookup warning:', err);
        }
      }

      if (email && SUPER_ADMIN_EMAILS.has(email.toLowerCase())) {
        setActiveRole('SUPER_ADMIN');
      }
    };

    void syncRoleFromStorageAndAuth(auth.currentUser?.uid, auth.currentUser?.email);

    const unsubscribe = onAuthStateChanged(auth, user => {
      void syncRoleFromStorageAndAuth(user?.uid, user?.email);
    });

    return () => unsubscribe();
  }, []);

  const isMasquerading = Boolean(getActiveImpersonation()?.isMasquerading);
  const currentScope = useMemo(() => {
    if (!isMasquerading && auth.currentUser?.email && SUPER_ADMIN_EMAILS.has(auth.currentUser.email.toLowerCase())) {
      const explicitScope = resolveCanonicalAdminScope(activeRole);
      return explicitScope || 'SUPER_ADMIN';
    }
    return resolveCanonicalAdminScope(activeRole) || 'ACADEMIC_ADMIN';
  }, [activeRole, isMasquerading]);

  const capabilities = useMemo(
    () => getAdminDashboardCapabilities(activeRole || currentScope),
    [activeRole, currentScope]
  );

  const allNavigationGroups: NavGroup[] = [
    {
      sectionTitle: "Overview & Operations",
      items: [
        { name: "Dashboard", href: "/admin", icon: LayoutDashboard, desc: "System KPIs, metrics & analytics" },
        { name: "Inquiries & Leads", href: "/admin/inquiries", icon: MessageSquare, desc: "Public inquiries & contact requests" },
        { name: "Activity Logs", href: "/admin/activity", icon: Activity, desc: "Real-time authentication & operation audit" },
      ]
    },
    {
      sectionTitle: "Website & Pages CMS",
      items: [
        { name: "Pages & Section CMS", href: "/admin/pages", icon: Layers, desc: "Live content & visual sections editor" },
        { name: "Promotions & Ads", href: "/admin/promotions", icon: Megaphone, desc: "Homepage banners & popup campaigns" },
        { name: "Programs & Courses", href: "/admin/programs", icon: BookOpen, desc: "Curriculum tracks, stages & syllabi" },
        { name: "Services Catalog", href: "/admin/services", icon: Briefcase, desc: "Custom software & institutional solutions" },
        { name: "Portfolio Showcase", href: "/admin/portfolio", icon: FolderOpen, desc: "Client deliverables & case studies" },
        { name: "Kids Zone Builds", href: "/admin/kids-projects", icon: Gamepad2, desc: "Scholars gaming & app showcase" },
        { name: "News Corner & Blog", href: "/admin/blog", icon: FileText, desc: "Articles, announcements & press" },
      ]
    },
    {
      sectionTitle: "Portals & Academic Hub",
      items: [
        { name: "Approvals & Requests", href: "/admin/approvals", icon: UserCheck, desc: "Student, tutor & enrollment approvals" },
        { name: "Scholars & Students", href: "/admin/students", icon: GraduationCap, desc: "Student credentials & individual dispatches" },
        { name: "Billings / Fees", href: "/admin/billing", icon: CreditCard, desc: "Tuition transactions, treasury & ledger" },
        { name: "Agreements Centre", href: "/admin/agreements", icon: FileText, desc: "Proposals, communications & institutional contracts" },
        { name: "Faculty & Staff", href: "/admin/staff", icon: Users, desc: "Staff invitations & faculty curriculum" },
        { name: "Tutor Subjects", href: "/admin/tutor-subjects", icon: Award, desc: "Approve subjects & find matching tutors" },
        { name: "Affiliated Schools", href: "/admin/schools", icon: School, desc: "Partner school portals & exams" },
        { name: "Class Schedules", href: "/admin/schedules", icon: CalendarDays, desc: "Recurring school classes & attendance history" },
        { name: "Learning Resources", href: "/admin/resources", icon: Library, desc: "General downloads, links & tests" },
      ]
    },
    {
      sectionTitle: "CBT Assessment",
      items: [
        { name: "Assessments", href: "/admin/examinations", icon: FileText, desc: "Create, schedule, secure and manage assessments" },
        { name: "Assessment History", href: "/admin/examination-history", icon: FileText, desc: "Review submissions, grading, results and export reports" },
        { name: "Academic Reporting", href: "/admin/academic-reporting", icon: Award, desc: "Grading profiles, reference lookup & official term/session/programme reports" },
      ]
    },
    {
      sectionTitle: "System & Management",
      items: [
        { name: "Support Center", href: "/admin/support", icon: Headphones, desc: "Support inquiries, chat & contacts" },
        { name: "Notifications", href: "/admin/notifications", icon: Bell, desc: "Push broadcasts & alerts" },
        { name: "Users & RBAC", href: "/admin/users", icon: ShieldCheck, desc: "User accounts & role permissions" },
        { name: "Settings & Cloud", href: "/admin/settings", icon: SlidersHorizontal, desc: "Cloudinary & system configuration" },
      ]
    }
  ];

  const navigationGroups: NavGroup[] = useMemo(() => {
    if (currentScope === 'SUPER_ADMIN') {
      return allNavigationGroups;
    }

    if (currentScope === 'ACADEMIC_ADMIN') {
      return [
        {
          sectionTitle: "Overview & Operations",
          items: [
            { name: "Dashboard", href: "/admin", icon: LayoutDashboard, desc: "Academic KPIs, metrics & analytics" },
          ]
        },
        {
          sectionTitle: "Portals & Academic Hub",
          items: [
            { name: "Programs & Courses", href: "/admin/programs", icon: BookOpen, desc: "Curriculum tracks, stages & syllabi" },
            { name: "Approvals & Requests", href: "/admin/approvals", icon: UserCheck, desc: "Student, tutor & enrollment approvals" },
            { name: "Scholars & Students", href: "/admin/students", icon: GraduationCap, desc: "Student credentials & individual dispatches" },
            { name: "Agreements Centre", href: "/admin/agreements", icon: FileText, desc: "Proposals, communications & institutional contracts" },
            { name: "Faculty & Staff", href: "/admin/staff", icon: Users, desc: "Staff invitations & faculty curriculum" },
            { name: "Tutor Subjects", href: "/admin/tutor-subjects", icon: Award, desc: "Approve subjects & find matching tutors" },
            { name: "Affiliated Schools", href: "/admin/schools", icon: School, desc: "Partner school portals & exams" },
            { name: "Class Schedules", href: "/admin/schedules", icon: CalendarDays, desc: "Recurring school classes & attendance history" },
            { name: "Learning Resources", href: "/admin/resources", icon: Library, desc: "General downloads, links & tests" },
          ]
        },
        {
          sectionTitle: "CBT Assessment",
          items: [
            { name: "Assessments", href: "/admin/examinations", icon: FileText, desc: "Create, schedule, secure and manage assessments" },
            { name: "Assessment History", href: "/admin/examination-history", icon: FileText, desc: "Review submissions, grading, results and export reports" },
            { name: "Academic Reporting", href: "/admin/academic-reporting", icon: Award, desc: "Grading profiles, reference lookup & official term/session/programme reports" },
          ]
        }
      ];
    }

    if (currentScope === 'FINANCE_ADMIN') {
      return [
        {
          sectionTitle: "Overview & Operations",
          items: [
            { name: "Dashboard", href: "/admin", icon: LayoutDashboard, desc: "Financial & enrollment summary" },
          ]
        },
        {
          sectionTitle: "Portals & Academic Hub",
          items: [
            { name: "Billings / Fees", href: "/admin/billing", icon: CreditCard, desc: "Tuition transactions, treasury & ledger" },
            { name: "Approvals & Requests", href: "/admin/approvals", icon: UserCheck, desc: "Enrollment & fee approvals" },
            { name: "Agreements Centre", href: "/admin/agreements", icon: FileText, desc: "Proposals, communications & institutional contracts" },
          ]
        },
        {
          sectionTitle: "System & Management",
          items: [
            { name: "Notifications", href: "/admin/notifications", icon: Bell, desc: "Push broadcasts & alerts" },
          ]
        }
      ];
    }

    // CMS_ADMIN / CONTENT_ADMIN
    return [
      {
        sectionTitle: "Overview & Operations",
        items: [
          { name: "Dashboard", href: "/admin", icon: LayoutDashboard, desc: "Content & inquiry summary" },
          { name: "Inquiries & Leads", href: "/admin/inquiries", icon: MessageSquare, desc: "Public inquiries & contact requests" },
        ]
      },
      {
        sectionTitle: "Website & Pages CMS",
        items: [
          { name: "Pages & Section CMS", href: "/admin/pages", icon: Layers, desc: "Live content & visual sections editor" },
          { name: "Promotions & Ads", href: "/admin/promotions", icon: Megaphone, desc: "Homepage banners & popup campaigns" },
          { name: "Programs & Courses", href: "/admin/programs", icon: BookOpen, desc: "Curriculum tracks, stages & syllabi" },
          { name: "Services Catalog", href: "/admin/services", icon: Briefcase, desc: "Custom software & institutional solutions" },
          { name: "Portfolio Showcase", href: "/admin/portfolio", icon: FolderOpen, desc: "Client deliverables & case studies" },
          { name: "Kids Zone Builds", href: "/admin/kids-projects", icon: Gamepad2, desc: "Scholars gaming & app showcase" },
          { name: "News Corner & Blog", href: "/admin/blog", icon: FileText, desc: "Articles, announcements & press" },
        ]
      },
      {
        sectionTitle: "System & Management",
        items: [
          { name: "Notifications", href: "/admin/notifications", icon: Bell, desc: "Push broadcasts & alerts" },
        ]
      }
    ];
  }, [currentScope]);

  const flatNavList = useMemo(() => {
    return navigationGroups.flatMap(g => g.items);
  }, [navigationGroups]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = { ...prev, [title]: !prev[title] };
      localStorage.setItem('admin_expanded_nav_sections', JSON.stringify(next));
      return next;
    });
  };

  const areAllSectionsExpanded = useMemo(() => {
    return navigationGroups.every(g => expandedSections[g.sectionTitle] !== false);
  }, [navigationGroups, expandedSections]);

  const toggleAllSections = () => {
    const nextState = !areAllSectionsExpanded;
    const updated: Record<string, boolean> = {};
    navigationGroups.forEach(g => {
      updated[g.sectionTitle] = nextState;
    });
    setExpandedSections(updated);
    localStorage.setItem('admin_expanded_nav_sections', JSON.stringify(updated));
  };

  const currentPageTitle = resolveAdminPageTitle(location.pathname, flatNavList);

  return (
    <div className="admin-shell h-screen w-full bg-[#f8fafc] dark:bg-[#09090B] text-slate-900 dark:text-zinc-100 flex overflow-hidden font-sans select-none">
      <SEO 
        title={`${currentPageTitle} | Admin Console | Jaystarbliss Studios`} 
        description="Command center for Jaystarbliss Studios administrative operations, portals, billing and educational ecosystem." 
        noindex={true} 
      />

      {/* Mobile Side Menu (Opens from LEFT, Occupies ~70% screen width, dim backdrop, tap outside to close) */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              transition={{ duration: 0.2 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            />

            {/* Side Drawer from Left */}
            <motion.div 
              initial={{ x: '-100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '-100%' }} 
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="fixed inset-y-0 left-0 w-[72vw] max-w-[290px] bg-white dark:bg-[#111114] text-slate-900 dark:text-white p-4 shadow-2xl border-r border-slate-200 dark:border-zinc-800 flex flex-col justify-between overflow-y-auto custom-scrollbar"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                  <button type="button" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 text-left cursor-pointer">
                    <JaystarblissIcon className="w-7 h-7 shrink-0" />
                    <span className="font-bold text-xs tracking-tight uppercase">JAYSTARBLISS ADMIN</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-white cursor-pointer"
                    aria-label="Close sidebar"
                  >
                    <PanelLeftClose size={18} />
                  </button>
                </div>

                {/* Impersonation Quick Button on Mobile (Super Admin or active Masquerade only) */}
                {(capabilities.canImpersonateUsers || isMasquerading) && (
                  <div className="my-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSidebarOpen(false);
                        setImpersonateModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-[#B91C1C] dark:text-red-300 text-xs font-bold"
                    >
                      <UserCheck size={14} />
                      <span>Log in as Scholar / School / Tutor</span>
                    </button>
                  </div>
                )}

                {/* Nav items */}
                <div className="space-y-4 pt-1">
                  {navigationGroups.map((group, idx) => (
                    <div key={idx} className="space-y-1">
                      <p className="text-[10px] font-mono font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase px-2">
                        {group.sectionTitle}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map(item => {
                          const isActive = location.pathname === item.href || (location.pathname.startsWith(item.href) && item.href !== '/admin');
                          const Icon = item.icon;
                          const count = badgeCountByHref[item.href] || 0;
                          return (
                            <Link
                              key={item.name}
                              to={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                isActive
                                  ? 'bg-[#1E293B] text-white dark:bg-white/10 border border-slate-700/60'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                              }`}
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <Icon size={15} className={`shrink-0 ${isActive ? 'text-white' : ''}`} />
                                <span className="truncate">{item.name}</span>
                              </span>
                              {count > 0 && (
                                <span
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums leading-none shrink-0 ${
                                    isActive
                                      ? 'bg-[#B91C1C] text-white'
                                      : 'bg-[#B91C1C] text-white'
                                  }`}
                                >
                                  {count > 99 ? '99+' : count}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logout button at bottom of drawer */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600/90 text-white text-xs font-bold shadow-xs hover:bg-red-600"
                >
                  <LogOut size={14} />
                  <span>Exit Session</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar (Default collapsed rail, expands smoothly on hover, stays open when pinned) */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarExpanded ? 276 : 78 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }}
        onMouseEnter={() => {
          if (!sidebarPinned) setIsHoverExpanded(true);
        }}
        onMouseLeave={() => {
          if (!sidebarPinned) setIsHoverExpanded(false);
        }}
        className="hidden lg:flex bg-white dark:bg-[#111114] text-slate-900 dark:text-zinc-100 flex-col h-full max-h-screen border-r border-slate-200 dark:border-zinc-800 shrink-0 select-none overflow-hidden relative z-30 shadow-xs"
      >
        {/* Header with Logo & Pin Toggle */}
        <div className="flex items-center justify-between gap-2 h-16 px-3.5 border-b border-slate-200 dark:border-zinc-800 shrink-0 overflow-hidden bg-white dark:bg-[#111114]">
          <Tooltip
            content={sidebarPinned ? "Unpin sidebar (auto-collapse)" : "Pin sidebar open"}
            placement="right"
            className="flex-1 min-w-0"
            fullWidth
          >
            <button
              type="button"
              onClick={toggleSidebarPin}
              className="flex items-center gap-3 group w-full min-w-0 text-left cursor-pointer"
              aria-label={sidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
            >
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <JaystarblissIcon className="w-8 h-8 group-hover:scale-105 transition-transform shrink-0 drop-shadow-xs" />
              </div>
              {isSidebarExpanded && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.16 }}
                  className="flex flex-col min-w-0 whitespace-nowrap"
                >
                  <span className="font-bold text-xs sm:text-sm tracking-tight text-slate-900 dark:text-white truncate">
                    JAYSTARBLISS
                  </span>
                  <span className="text-[10px] text-[#B91C1C] dark:text-red-400 font-mono font-semibold truncate">
                    Admin Console
                  </span>
                </motion.div>
              )}
            </button>
          </Tooltip>
          {isSidebarExpanded && (
            <Tooltip content={sidebarPinned ? "Unpin sidebar" : "Pin sidebar open"} placement="right">
              <button
                type="button"
                onClick={toggleSidebarPin}
                aria-label={sidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
                className={`p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                  sidebarPinned
                    ? 'bg-[#1E293B] text-white dark:bg-[#B91C1C] dark:text-white'
                    : 'text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                {sidebarPinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
            </Tooltip>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto overscroll-contain py-3 px-2.5 space-y-3 custom-scrollbar overflow-x-hidden bg-white dark:bg-[#111114]">
          {isSidebarExpanded && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.16 }}
              className="flex items-center justify-between px-2 pb-1"
            >
              <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-zinc-500">
                Navigation
              </span>
              <button
                type="button"
                onClick={toggleAllSections}
                className="text-[10px] font-mono text-[#1E293B] dark:text-zinc-300 hover:text-[#B91C1C] dark:hover:text-red-400 font-semibold transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <ChevronsUpDown size={11} />
                <span>{areAllSectionsExpanded ? 'Collapse All' : 'Expand All'}</span>
              </button>
            </motion.div>
          )}

          {navigationGroups.map((group, gIdx) => {
            const isExpanded = expandedSections[group.sectionTitle] !== false;
            const hasActiveItem = group.items.some(
              item => location.pathname === item.href || (location.pathname.startsWith(item.href) && item.href !== '/admin')
            );

            return (
              <div key={gIdx} className="space-y-1">
                {isSidebarExpanded ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(group.sectionTitle)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-mono font-bold tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white uppercase transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800/70 cursor-pointer select-none group"
                    aria-expanded={isExpanded}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className={`w-1.5 h-1.5 shrink-0 transition-colors ${hasActiveItem ? 'bg-[#B91C1C]' : 'bg-slate-300 dark:bg-zinc-600 group-hover:bg-slate-400'}`} />
                      <span className="truncate">{group.sectionTitle}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono font-semibold tabular-nums">
                        {group.items.length}
                      </span>
                      <ChevronDown 
                        size={13} 
                        className={`text-slate-400 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-white transition-transform duration-200 shrink-0 ${
                          isExpanded ? 'rotate-0' : '-rotate-90'
                        }`} 
                      />
                    </div>
                  </button>
                ) : (
                  <div className="h-px bg-slate-200 dark:bg-zinc-800 mx-2 my-2" />
                )}
                
                {/* Nav Items List */}
                <nav className={`space-y-0.5 ${isSidebarExpanded && !isExpanded ? 'hidden' : 'block'}`}>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href || (location.pathname.startsWith(item.href) && item.href !== '/admin');
                    const Icon = item.icon;
                    const count = badgeCountByHref[item.href] || 0;
                    return (
                      <Tooltip 
                        key={item.name} 
                        content={!isSidebarExpanded ? `${item.name}${count > 0 ? ` (${count})` : ''} • ${item.desc}` : item.desc} 
                        placement="right" 
                        delay={220}
                        fullWidth
                      >
                        <Link
                          to={item.href}
                          className={`relative group flex items-center w-full h-10 px-2.5 rounded-xl transition-colors ${
                            isActive 
                              ? 'bg-[#1E293B] text-white dark:bg-zinc-800 dark:text-white font-semibold shadow-2xs' 
                              : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/70 hover:text-slate-900 dark:hover:text-white font-medium'
                          }`}
                        >
                          {isActive && (
                            <span className="absolute left-1 w-1 h-5 rounded-sm bg-[#B91C1C]" />
                          )}
                          <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                            <Icon 
                              className={`h-4 w-4 transition-colors ${
                                isActive ? 'text-white' : 'text-slate-400 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-white'
                              }`} 
                            />
                            {!isSidebarExpanded && count > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#B91C1C] text-white text-[9px] font-black tabular-nums flex items-center justify-center leading-none shadow-xs">
                                {count > 99 ? '99+' : count}
                              </span>
                            )}
                          </div>
                          {isSidebarExpanded && (
                            <>
                              <span className="text-xs font-semibold truncate pl-2 whitespace-nowrap flex-1">
                                {item.name}
                              </span>
                              {count > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-md bg-[#B91C1C] text-white text-[10px] font-black tabular-nums leading-none shrink-0">
                                  {count > 99 ? '99+' : count}
                                </span>
                              )}
                            </>
                          )}
                        </Link>
                      </Tooltip>
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>

        {/* Desktop Sidebar Footer */}
        <div className="p-2.5 border-t border-slate-200 dark:border-zinc-800 shrink-0 overflow-hidden bg-slate-50/70 dark:bg-[#0C0C0E]">
          <Tooltip content="End administrative session" placement={!isSidebarExpanded ? "right" : "top"} fullWidth>
            <button 
              id="btn-admin-sidebar-logout"
              type="button"
              onClick={handleLogout}
              className="flex items-center h-10 w-full px-2.5 text-xs font-bold text-slate-500 dark:text-zinc-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-[#B91C1C] dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <LogOut className="h-4 w-4" />
              </div>
              {isSidebarExpanded && (
                <span className="truncate pl-2 whitespace-nowrap">
                  Exit Session
                </span>
              )}
            </button>
          </Tooltip>
        </div>
      </motion.aside>

      {/* Main content Area on Neutral SaaS Canvas */}
      <div className="flex-1 h-full max-h-screen flex flex-col min-w-0 overflow-hidden relative bg-[#F8FAFC] dark:bg-[#09090B]">
        {/* Standardised Compact Route-Aware Topbar (48-56px height, only current page title visible as text) */}
        <header className="relative z-20 flex-shrink-0 flex items-center justify-between h-13 sm:h-14 bg-white dark:bg-[#111114] border-b border-slate-200 dark:border-zinc-800 px-4 sm:px-6 lg:px-8 transition-colors shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <Tooltip content="Toggle navigation menu" placement="right">
              <button 
                type="button"
                className="lg:hidden flex items-center justify-center p-2 -ml-1.5 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer" 
                onClick={() => setSidebarOpen(prev => !prev)}
                aria-label="Toggle navigation sidebar"
              >
                <Menu size={19} />
              </button>
            </Tooltip>

            <h1 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight truncate">
              {currentPageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {currentScope !== 'SUPER_ADMIN' && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 text-[11px] font-semibold">
                <ShieldCheck size={13} className="text-[#B91C1C] dark:text-red-400" />
                <span>{capabilities.roleLabel}</span>
              </span>
            )}

            {/* Impersonate Icon Button */}
            {(capabilities.canImpersonateUsers || isMasquerading) && (
              <Tooltip content="Log in directly as student, school admin or tutor" placement="bottom">
                <button
                  type="button"
                  onClick={() => setImpersonateModalOpen(true)}
                  className="p-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-[#B91C1C] dark:text-red-400 transition-colors cursor-pointer shrink-0"
                  aria-label="Log in as user"
                >
                  <UserCheck size={17} />
                </button>
              </Tooltip>
            )}

            {/* Global Search Button */}
            <Tooltip content="Global search" placement="bottom">
              <button 
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
              >
                <Search size={17} />
              </button>
            </Tooltip>

            {/* Help & Support Button */}
            {capabilities.canAccessSupportDesk && (
              <Tooltip content="Help & Support Desk" placement="bottom">
                <Link
                  to="/admin/support"
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center"
                  aria-label="Support Desk"
                >
                  <HelpCircle size={17} />
                </Link>
              </Tooltip>
            )}

            {/* Theme Toggle */}
            <Tooltip content={theme === 'dark' ? 'Light Theme' : 'Dark Theme'} placement="bottom">
              <button 
                type="button"
                onClick={toggleTheme}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun size={17} className="text-slate-200" /> : <Moon size={17} />}
              </button>
            </Tooltip>

            {/* Notification Bell */}
            <NotificationBell role="admin" />

            {/* Profile Settings Avatar Link (only links to Global Settings for Super Admin) */}
            {capabilities.canAccessGlobalSettings ? (
              <Tooltip content="Global Settings" placement="bottom">
                <Link
                  to="/admin/settings"
                  aria-label="Global Settings"
                  className="p-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#1E293B] dark:bg-[#B91C1C] text-white flex items-center justify-center shadow-xs">
                    <ShieldCheck size={15} />
                  </div>
                </Link>
              </Tooltip>
            ) : (
              <Tooltip content={capabilities.roleLabel} placement="bottom">
                <div
                  aria-label={capabilities.roleLabel}
                  className="p-1 rounded-xl flex items-center justify-center"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#1E293B] dark:bg-[#B91C1C] text-white flex items-center justify-center shadow-xs">
                    <ShieldCheck size={15} />
                  </div>
                </div>
              </Tooltip>
            )}
          </div>
        </header>

        {/* Main Content Area (localized Suspense keeps sidebar & topbar mounted across tab switches) */}
        <main className="admin-main-content flex-1 relative z-10 overflow-y-auto overscroll-contain focus:outline-none custom-scrollbar">
          <div className="py-5 sm:py-6">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 md:px-8">
              <Suspense
                fallback={
                  <div className="min-h-[280px] flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    <Loader2 className="animate-spin text-[#B91C1C]" size={18} />
                    <span>Loading section…</span>
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </div>
          </div>
        </main>
      </div>

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <ImpersonateUserModal isOpen={impersonateModalOpen} onClose={() => setImpersonateModalOpen(false)} />
    </div>
  );
};

export default AdminLayout;
