import React, { useState, useEffect, useMemo } from 'react';
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
  HelpCircle, Headphones, PanelLeftClose
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Tooltip } from '../ui/Tooltip';
import SearchModal from '../ui/SearchModal';
import ImpersonateUserModal from './ImpersonateUserModal';
import { JaystarblissIcon } from '../common/JaystarblissLogo';
import NotificationBell from '../common/NotificationBell';
import SEO from '../ui/SEO';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';
import { useEdgeSwipeDrawer } from '../../hooks/useEdgeSwipeDrawer';

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
  if (clean === '/admin/schools/onboard') return 'Onboard School';
  if (clean === '/admin/parents') return 'Parents';
  if (clean === '/admin/reports') return 'Reports';
  if (clean === '/admin/tutor-subjects') return 'Tutor Subjects';
  if (clean === '/admin/agreements') return 'Agreements Centre';
  if (clean === '/admin/examinations') return 'Assessments';
  if (clean === '/admin/examination-history') return 'Assessment History';
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
  const [isHovered, setIsHovered] = useState(false);

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
  const navigate = useNavigate();
  const location = useLocation();

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

  const currentRole = (sessionStorage.getItem('userRole') || 'super_admin').toUpperCase();

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
    if (currentRole === 'SUPER_ADMIN' || currentRole === 'ADMIN' || auth.currentUser?.email === 'johnrufai242@gmail.com') {
      return allNavigationGroups;
    }

    if (currentRole === 'CMS_ADMIN' || currentRole === 'CONTENT_ADMIN') {
      return [
        {
          sectionTitle: "Overview & Operations",
          items: [
            { name: "Dashboard", href: "/admin", icon: LayoutDashboard, desc: "System KPIs, metrics & analytics" },
            { name: "Inquiries & Leads", href: "/admin/inquiries", icon: MessageSquare, desc: "Public inquiries & contact requests" },
          ]
        },
        {
          sectionTitle: "Website & Pages CMS",
          items: [
            { name: "Pages & Section CMS", href: "/admin/pages", icon: Layers, desc: "Live content & visual sections editor" },
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
    }

    return allNavigationGroups;
  }, [currentRole]);

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
    <div className="admin-shell h-screen w-full bg-[#f8fafc] dark:bg-[#070b14] text-slate-900 dark:text-slate-100 flex overflow-hidden font-sans select-none">
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
              className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            />

            {/* Side Drawer from Left */}
            <motion.div 
              initial={{ x: '-100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '-100%' }} 
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="fixed inset-y-0 left-0 w-[72vw] max-w-[290px] bg-white dark:bg-[#0c1220] text-slate-900 dark:text-white p-4 shadow-2xl border-r border-slate-200 dark:border-white/10 flex flex-col justify-between overflow-y-auto custom-scrollbar"
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

                {/* Impersonation Quick Button on Mobile */}
                <div className="my-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSidebarOpen(false);
                      setImpersonateModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold"
                  >
                    <UserCheck size={14} />
                    <span>Log in as Scholar / School / Tutor</span>
                  </button>
                </div>

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
                          return (
                            <Link
                              key={item.name}
                              to={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                isActive
                                  ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/30'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                              }`}
                            >
                              <Icon size={15} className="shrink-0" />
                              <span className="truncate">{item.name}</span>
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

      {/* Desktop Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isHovered ? 280 : 80 }}
        transition={{ type: 'spring', stiffness: 350, damping: 32, mass: 0.8 }}
        className="hidden lg:flex bg-white/95 dark:bg-[#0c1220]/95 backdrop-blur-2xl text-slate-900 dark:text-white flex-col h-full max-h-screen border-r border-slate-200/80 dark:border-white/10 shrink-0 select-none overflow-hidden relative z-30 shadow-lg"
      >
        {/* Header with Logo Toggle */}
        <div className="flex items-center justify-between gap-2 h-16 px-4 border-b border-slate-200/60 dark:border-white/10 shrink-0 overflow-hidden">
          <Tooltip content={isHovered ? "Sidebar Open" : "Click logo to open sidebar"} placement="right">
            <button
              type="button"
              onClick={() => setIsHovered(prev => !prev)}
              className="flex items-center gap-3 group flex-1 min-w-0 text-left cursor-pointer"
              aria-label={isHovered ? "Toggle sidebar" : "Open sidebar"}
            >
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <JaystarblissIcon className="w-8 h-8 group-hover:scale-105 transition-transform shrink-0 drop-shadow-sm" />
              </div>
              {isHovered && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col min-w-0 whitespace-nowrap"
                >
                  <span className="font-bold text-xs sm:text-sm tracking-tight text-gray-900 dark:text-white truncate">
                    JAYSTARBLISS
                  </span>
                  <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono font-semibold truncate">Admin Console</span>
                </motion.div>
              )}
            </button>
          </Tooltip>
          {isHovered && (
            <Tooltip content="Close sidebar" placement="right">
              <button
                type="button"
                onClick={() => setIsHovered(false)}
                aria-label="Close sidebar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <PanelLeftClose size={18} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto overscroll-contain py-3 px-2 space-y-3 custom-scrollbar overflow-x-hidden">
          {isHovered && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between px-2 pb-1"
            >
              <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-slate-500">
                Navigation
              </span>
              <button
                type="button"
                onClick={toggleAllSections}
                className="text-[10px] font-mono text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-semibold transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-sky-500/10"
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
                {isHovered ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(group.sectionTitle)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-mono font-bold tracking-widest text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white uppercase transition-colors rounded-lg hover:bg-slate-900/5 dark:hover:bg-white/5 cursor-pointer select-none group"
                    aria-expanded={isExpanded}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${hasActiveItem ? 'bg-sky-500 shadow-xs shadow-sky-500/50' : 'bg-slate-300 dark:bg-slate-600 group-hover:bg-slate-400'}`} />
                      <span className="truncate">{group.sectionTitle}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-200/70 dark:bg-white/10 text-slate-500 dark:text-slate-400 font-mono font-semibold">
                        {group.items.length}
                      </span>
                      <ChevronDown 
                        size={13} 
                        className={`text-gray-400 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white transition-transform duration-200 shrink-0 ${
                          isExpanded ? 'rotate-0' : '-rotate-90'
                        }`} 
                      />
                    </div>
                  </button>
                ) : (
                  <div className="h-px bg-gray-200 dark:bg-white/10 mx-2 my-2" />
                )}
                
                {/* Nav Items List */}
                <nav className={`space-y-0.5 ${isHovered && !isExpanded ? 'hidden' : 'block'}`}>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href || (location.pathname.startsWith(item.href) && item.href !== '/admin');
                    const Icon = item.icon;
                    return (
                      <Tooltip 
                        key={item.name} 
                        content={!isHovered ? `${item.name} • ${item.desc}` : item.desc} 
                        placement="right" 
                        delay={200}
                      >
                        <Link
                          to={item.href}
                          className={`group flex items-center h-10 px-2 rounded-xl transition-colors ${
                            isActive 
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/30 dark:border-sky-500/30 shadow-xs' 
                              : 'text-gray-600 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          <div className="w-8 h-8 flex items-center justify-center shrink-0">
                            <Icon 
                              className={`h-4 w-4 transition-colors ${
                                isActive ? 'text-sky-600 dark:text-sky-400' : 'text-gray-400 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white'
                              }`} 
                            />
                          </div>
                          <motion.span 
                            animate={{ opacity: isHovered ? 1 : 0 }}
                            transition={{ duration: 0.15 }}
                            className={`text-xs font-bold truncate pl-2 whitespace-nowrap ${
                              isHovered ? 'pointer-events-auto' : 'pointer-events-none'
                            }`}
                          >
                            {item.name}
                          </motion.span>
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
        <div className="p-3 border-t border-slate-200/60 dark:border-white/10 shrink-0 overflow-hidden">
          <Tooltip content="End administrative session" placement={!isHovered ? "right" : "top"}>
            <button 
              id="btn-admin-sidebar-logout"
              type="button"
              onClick={handleLogout}
              className="flex items-center h-10 w-full px-2 text-xs font-bold text-gray-500 dark:text-slate-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <LogOut className="h-4 w-4 text-gray-400 dark:text-slate-500" />
              </div>
              <motion.span 
                animate={{ opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.15 }}
                className={`truncate pl-2 whitespace-nowrap ${
                  isHovered ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                Exit Session
              </motion.span>
            </button>
          </Tooltip>
        </div>
      </motion.aside>

      {/* Main content Area on Neutral SaaS Canvas */}
      <div className="flex-1 h-full max-h-screen flex flex-col min-w-0 overflow-hidden relative bg-[#F8FAFC] dark:bg-[#0B1120]">
        {/* Standardised Compact Route-Aware Topbar (48-56px height, only current page title visible as text) */}
        <header className="relative z-20 flex-shrink-0 flex items-center justify-between h-13 sm:h-14 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 transition-colors shadow-2xs">
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
            <Link
              to="/wireframes"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold transition-colors"
            >
              <Layers size={14} />
              <span className="hidden sm:inline">Redesign Wireframes (5 Boards)</span>
              <span className="sm:hidden">Wireframes</span>
            </Link>
            {/* Impersonate Icon Button */}
            <Tooltip content="Log in directly as student, school admin or tutor" placement="bottom">
              <button
                type="button"
                onClick={() => setImpersonateModalOpen(true)}
                className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 transition-colors cursor-pointer shrink-0"
                aria-label="Log in as user"
              >
                <UserCheck size={17} />
              </button>
            </Tooltip>

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
            <Tooltip content="Help & Support Desk" placement="bottom">
              <Link
                to="/admin/support"
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center"
                aria-label="Support Desk"
              >
                <HelpCircle size={17} />
              </Link>
            </Tooltip>

            {/* Theme Toggle */}
            <Tooltip content={theme === 'dark' ? 'Light Theme' : 'Dark Theme'} placement="bottom">
              <button 
                type="button"
                onClick={toggleTheme}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
              </button>
            </Tooltip>

            {/* Notification Bell */}
            <NotificationBell role="admin" />

            {/* Profile Settings Avatar Link (Icon/Avatar only — no extra visible text in header) */}
            <Tooltip content="Global Settings" placement="bottom">
              <Link
                to="/admin/settings"
                aria-label="Global Settings"
                className="p-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-600 to-blue-600 text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck size={15} />
                </div>
              </Link>
            </Tooltip>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="admin-main-content flex-1 relative z-10 overflow-y-auto overscroll-contain focus:outline-none custom-scrollbar">
          <div className="py-5 sm:py-6">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 md:px-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
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
