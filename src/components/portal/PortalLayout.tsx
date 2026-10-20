import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, LogOut, LayoutDashboard, CreditCard, Moon, Sun, Menu, X, Radio, Trophy, GraduationCap, ClipboardCheck, CalendarDays, KeyRound, Users, FileCheck2, Library, SlidersHorizontal, WalletCards, ExternalLink, Award, Headphones, HelpCircle, Keyboard, ChevronDown } from 'lucide-react';
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
import './portal-polish.css';

type NavItem = { name: string; path: string; icon: React.ReactNode; desc: string };
type StudentPortalFeatures = { assessments?: boolean; edClub?: boolean; deliveryMode?: string; registrationSource?: string };

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
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarExpanded = sidebarPinned || sidebarHovered;
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<Record<string, boolean>>({});
  const [collapsedGroupOpen, setCollapsedGroupOpen] = useState<string | null>(null);
  const [collapsedGroupTop, setCollapsedGroupTop] = useState(112);
  const [impersonation, setImpersonation] = useState<any>(() => getActiveImpersonation());
  const [studentFeatures, setStudentFeatures] = useState<StudentPortalFeatures>({});
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const user = auth.currentUser;
    setUserEmail(user?.email || '');
    setIsEmailVerified(user?.emailVerified ?? true);
    setPhotoURL(user?.photoURL || null);
    setDisplayName(sessionStorage.getItem('userName') || user?.displayName || user?.email?.split('@')[0] || 'Portal User');
    setImpersonation(getActiveImpersonation());
  }, [location.pathname]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowProfileMenu(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => { setMobileMenuOpen(false); setCollapsedGroupOpen(null); }, [location.pathname]);

  const logout = async () => { await signOut(auth).catch(() => undefined); sessionStorage.clear(); navigate('/portal'); };
  const resendVerification = async () => {
    const user = auth.currentUser; if (!user) return; setResendingVerification(true);
    try { await sendEmailVerification(user); toast.success(`Verification link sent to ${user.email}.`); }
    catch (error: any) { toast.error(error?.code === 'auth/too-many-requests' ? 'Please wait before requesting another link.' : 'Unable to send verification email.'); }
    finally { setResendingVerification(false); }
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
      const next = { assessments: featureAccess.assessments === true, edClub: featureAccess.edClub === true || data.edClubEnabled === true, deliveryMode, registrationSource };
      setStudentFeatures(next);
      sessionStorage.setItem('studentEdClubEnabled', String(next.edClub));
      sessionStorage.setItem('studentDeliveryMode', deliveryMode);
      sessionStorage.setItem('studentRegistrationSource', registrationSource);
    }).catch(() => undefined);
  }, [role, location.pathname]);

  const parentEnrolledStudent = role === 'student' && (studentFeatures.registrationSource === 'parent-enrollment-approved' || !!sessionStorage.getItem('parentId') || !!sessionStorage.getItem('studentParentId'));
  const onlineStudent = parentEnrolledStudent && studentFeatures.deliveryMode === 'online';
  const physicalStudent = parentEnrolledStudent && studentFeatures.deliveryMode === 'physical';

  const navLinks: NavItem[] = (() => {
    const items: NavItem[] = [{ name: 'Dashboard', path: `/portal/${role}`, icon: <LayoutDashboard size={18} />, desc: 'Portal Overview' }];
    if (role === 'student') {
      items.push({ name: 'Learning & Tracks', path: '/portal/student/courses', icon: <GraduationCap size={18} />, desc: 'Curriculum & Series' });
      if (!onlineStudent) items.push({ name: 'Class Schedules', path: '/portal/student/schedules', icon: <CalendarDays size={18} />, desc: 'Programme timetable & class status' });
      if (!physicalStudent) items.push({ name: 'Live Classrooms', path: '/portal/student/live-classrooms', icon: <Radio size={18} />, desc: 'Live online lessons & sessions' });
      items.push({ name: 'Achievements & Badges', path: '/portal/student/achievements', icon: <Trophy size={18} />, desc: 'Mastery, badges & certificates' }, { name: 'Lesson Resources', path: '/portal/student/resources', icon: <BookOpen size={18} />, desc: 'Lesson notes & materials' });
      items.push({ name: 'Assignments', path: '/portal/student/assignments', icon: <ClipboardCheck size={18} />, desc: 'View and submit assigned work' });
      if (studentFeatures.assessments) items.push({ name: 'Assessments & Quizzes', path: '/portal/student/assessments', icon: <ClipboardCheck size={18} />, desc: 'Assessments, quizzes and coursework' });
      items.push({ name: 'Examinations', path: '/portal/student/exams', icon: <FileCheck2 size={18} />, desc: 'Scheduled tests, attempts and results' });
      if (studentFeatures.edClub) items.push({ name: 'Ed Club', path: '/portal/student/edge-club', icon: <Keyboard size={18} />, desc: 'Keyboarding & speed typing portal' });
      if (sessionStorage.getItem('studentRegistrationType') === 'individual') items.push({ name: 'Payments & Fees', path: '/portal/student/payments', icon: <CreditCard size={18} />, desc: 'Personal billing & statements' });
    } else if (role === 'staff') {
      items.push({ name: 'Live Classes', path: '/portal/staff/classes', icon: <Radio size={18} />, desc: 'Teaching roster' }, { name: 'Student Access', path: '/portal/staff/credentials', icon: <KeyRound size={18} />, desc: 'Access credentials' }, { name: 'Lesson Resources', path: '/portal/staff/resources', icon: <BookOpen size={18} />, desc: 'Lesson materials' }, { name: 'Subjects I Teach', path: '/portal/staff/subjects', icon: <Award size={18} />, desc: 'Teaching subjects & approvals' }, { name: 'Calendar', path: '/portal/staff/calendar', icon: <CalendarDays size={18} />, desc: 'Teaching timetable' }, { name: 'Billing / Fees', path: '/portal/staff/payments', icon: <WalletCards size={18} />, desc: 'Tutor ledger & payouts' });
      items.push({ name: 'Assignments', path: '/portal/staff/assignments', icon: <ClipboardCheck size={18} />, desc: 'Create and review assigned work' }, { name: 'Assessments & Quizzes', path: '/portal/staff/assessments', icon: <ClipboardCheck size={18} />, desc: 'Manage learning assessments and quizzes' }, { name: 'Examinations', path: '/portal/staff/exams', icon: <FileCheck2 size={18} />, desc: 'Create and manage student tests' }, { name: 'Examination History', path: '/portal/staff/exam-history', icon: <ClipboardCheck size={18} />, desc: 'Review submissions and results' });
    } else if (role === 'parent') {
      items.push({ name: 'Class Schedules', path: '/portal/parent/schedules', icon: <CalendarDays size={18} />, desc: 'Class timetable and session status' }, { name: 'Resources', path: '/portal/parent/resources', icon: <BookOpen size={18} />, desc: 'Learning materials' }, { name: 'Assignments', path: '/portal/parent/assignments', icon: <ClipboardCheck size={18} />, desc: 'Track assigned work' }, { name: 'Assessments & Quizzes', path: '/portal/parent/assessments', icon: <ClipboardCheck size={18} />, desc: 'View learning assessments' }, { name: 'Examination Results', path: '/portal/parent/examinations', icon: <FileCheck2 size={18} />, desc: 'View released results for linked children' }, { name: 'Payments & Fees', path: '/portal/parent/payments', icon: <CreditCard size={18} />, desc: 'Invoices & statements' });
    } else if (role === 'school') {
      items.push({ name: 'Learners Roster', path: '/portal/school/roster', icon: <Users size={18} />, desc: 'Student records and class lists' }, { name: 'Student Access', path: '/portal/school/credentials', icon: <KeyRound size={18} />, desc: 'Student access packs' }, { name: 'Class Schedules', path: '/portal/school/schedules', icon: <CalendarDays size={18} />, desc: 'Classes & attendance' }, { name: 'Learner Progress & Reports', path: '/portal/school/learner-progress', icon: <ClipboardCheck size={18} />, desc: 'Assessment history, activities, attendance and individual reports' }, { name: 'Examination Overview', path: '/portal/school/exams', icon: <FileCheck2 size={18} />, desc: 'View school examination status' }, { name: 'Examination History', path: '/portal/school/exam-history', icon: <ClipboardCheck size={18} />, desc: 'View released results and history' }, { name: 'Institutional Resources', path: '/portal/school/resources', icon: <Library size={18} />, desc: 'School learning materials' }, { name: 'Fees & Payments', path: '/portal/school/payments', icon: <CreditCard size={18} />, desc: 'School fees & payments' });
    }
    items.push({ name: 'Help & Support', path: `/portal/${role}/support`, icon: <Headphones size={18} />, desc: 'Help desk & live support chat' }, { name: 'Settings', path: `/portal/${role}/settings`, icon: <SlidersHorizontal size={18} />, desc: 'Account preferences' });
    return items;
  })();

  const navGroups = (() => {
    const groups: Record<string, NavItem[]> = {
      Overview: [], Learning: [], Classes: [], Assessment: [], "People & Access": [], Finance: [], More: [], Account: []
    };
    const groupFor = (item: NavItem) => {
      if (item.name === "Dashboard") return "Overview";
      if (["Learning & Tracks", "Live Classrooms", "Achievements & Badges", "Lesson Resources", "Ed Club"].includes(item.name)) return "Learning";
      if (["Class Schedules", "Calendar", "Live Classes"].includes(item.name)) return "Classes";
      if (["Assignments", "Assessments & Quizzes", "CBT Assessment", "Examinations", "Examination Overview", "Examination History"].includes(item.name)) return "Assessment";
      if (["Learners Roster", "Student Access", "Subjects I Teach"].includes(item.name)) return "People & Access";
      if (["Billing / Fees", "Payments & Fees", "Fees & Payments"].includes(item.name)) return "Finance";
      if (["Help & Support", "Settings"].includes(item.name)) return "Account";
      return "More";
    };
    navLinks.forEach(item => groups[groupFor(item)].push(item));
    return Object.entries(groups).filter(([, items]) => items.length).map(([label, items]) => ({ label, items }));
  })();
  const groupIcons: Record<string, React.ReactNode> = {
    Overview: <LayoutDashboard size={18}/>,
    Learning: <GraduationCap size={18}/>,
    Classes: <CalendarDays size={18}/>,
    Assessment: <ClipboardCheck size={18}/>,
    "People & Access": <Users size={18}/>,
    Finance: <CreditCard size={18}/>,
    Account: <SlidersHorizontal size={18}/>,
    More: <BookOpen size={18}/>
  };
  const renderNavGroups = (mobile = false) => navGroups.map(group => {
    const hasActive = group.items.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + "/"));
    const isOpen = collapsedNavGroups[group.label] !== undefined ? collapsedNavGroups[group.label] : hasActive;
    if (!mobile && !sidebarExpanded) {
      const flyoutOpen = collapsedGroupOpen === group.label;
      return <div key={group.label} className="relative flex justify-center py-0.5">
        <Tooltip content={group.label} placement="right" delay={150}>
          <button type="button" aria-label={group.label} aria-expanded={flyoutOpen} onClick={event => { if (collapsedGroupOpen === group.label) { setCollapsedGroupOpen(null); return; } const rect = event.currentTarget.getBoundingClientRect(); setCollapsedGroupTop(Math.max(12, Math.min(rect.top, window.innerHeight - 360))); setCollapsedGroupOpen(group.label); }} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${hasActive || flyoutOpen ? "bg-brand-red text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
            {groupIcons[group.label]}
          </button>
        </Tooltip>
        {flyoutOpen && <div className="fixed left-[76px] z-[100] w-56 max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#182335] p-2 shadow-2xl space-y-1" style={{ top: collapsedGroupTop }} role="menu" aria-label={group.label}>
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</div>
          {group.items.map(item => <NavLink key={item.name} item={item} flyout />)}
        </div>}
      </div>;
    }
    const showItems = mobile ? isOpen : isOpen;
    return <div key={group.label} className="space-y-1">
      <button type="button" aria-expanded={isOpen} onClick={() => setCollapsedNavGroups(prev => ({ ...prev, [group.label]: !isOpen }))} className="w-full flex items-center justify-between gap-2 px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white">
        <span>{group.label}</span><ChevronDown size={13} className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}/>
      </button>
      {showItems && <div className="space-y-1">{group.items.map(item => <NavLink key={item.name} item={item} mobile={mobile}/>)}</div>}
    </div>;
  });
  const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
  const accessCodeOnly = !userEmail && Boolean(sessionStorage.getItem('studentDocId'));
  const NavLink = ({ item, mobile = false, flyout = false }: { item: NavItem; mobile?: boolean; flyout?: boolean }) => {
    const active = location.pathname === item.path;
    return <Tooltip content={!mobile && !sidebarExpanded ? `${item.name} • ${item.desc}` : item.desc} placement="right" delay={200}><Link to={item.path} onClick={() => { if (mobile) setMobileMenuOpen(false); if (flyout) setCollapsedGroupOpen(null); }} className={`group w-full box-border grid grid-cols-[32px_minmax(0,1fr)] items-center min-h-10 h-10 flex-none px-2.5 rounded-xl transition-colors text-xs font-semibold whitespace-nowrap overflow-hidden ${active ? 'bg-brand-red text-white shadow-sm font-bold' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><span className="w-8 h-8 flex items-center justify-center shrink-0">{item.icon}</span><span className={`min-w-0 overflow-hidden text-ellipsis pl-2 ${mobile || flyout || sidebarExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>{item.name}</span></Link></Tooltip>;
  };

  return <div className="portal-shell h-screen w-full bg-[#F8FAFC] dark:bg-[#243246] text-slate-900 dark:text-slate-100 flex flex-col md:flex-row overflow-hidden font-sans">
    <SEO title={`${roleTitle} Portal | Jaystarbliss Studios`} description={`Jaystarbliss Studios ${roleTitle} portal.`} noindex />
    <div className="md:hidden bg-[#182335] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 border-b border-white/10 shrink-0"><Link to="/" className="flex items-center gap-2 min-w-0"><JaystarblissIcon className="w-7 h-7 shrink-0"/><span className="font-bold text-xs uppercase whitespace-nowrap">JAYSTARBLISS</span><span className="text-[10px] uppercase font-bold bg-brand-red px-2 py-0.5 rounded text-white">{role}</span></Link><div className="flex items-center gap-2 shrink-0"><Link to={`/portal/${role}/support`} className="p-2 rounded-xl bg-white/10 text-slate-300 hover:text-white" aria-label="Support & Help"><HelpCircle size={16}/></Link><NotificationBell role={role}/><button type="button" onClick={toggleTheme} className="p-2 rounded-xl bg-white/10 text-slate-300" aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} className="text-amber-400"/> : <Moon size={16}/>}</button><button type="button" onClick={() => setMobileMenuOpen(true)} className="p-2 rounded-xl bg-white/10 text-white" aria-label="Open menu"><Menu size={20}/></button></div></div>
    <AnimatePresence>{mobileMenuOpen && <div className="md:hidden fixed inset-0 z-50"><motion.button aria-label="Close menu" className="absolute inset-0 bg-black/65" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileMenuOpen(false)}/><motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} className="absolute inset-y-0 left-0 w-[72vw] max-w-[280px] bg-[#182335] text-white border-r border-white/10 shadow-2xl flex flex-col p-3 overflow-y-auto"><div className="flex items-center justify-between h-12 px-1 border-b border-white/10 shrink-0"><Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2"><JaystarblissIcon className="w-6 h-6"/><span className="text-xs font-bold">JAYSTARBLISS</span></Link><button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg bg-white/10"><X size={18}/></button></div><div className="px-3 py-2.5 my-3 bg-white/5 rounded-2xl flex items-center gap-3 shrink-0">{photoURL ? <img src={photoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-brand-red/40" referrerPolicy="no-referrer"/> : <div className="w-8 h-8 rounded-full bg-brand-red flex items-center justify-center text-xs font-bold">{displayName.charAt(0)}</div>}<div className="min-w-0"><p className="text-xs font-bold truncate">{displayName}</p><p className="text-[10px] text-slate-400 truncate">{userEmail || `${role} portal`}</p></div></div><nav className="space-y-1">{renderNavGroups(true)}</nav><button type="button" onClick={logout} className="mt-auto pt-3 border-t border-white/10 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600/80 text-white text-xs font-bold"><LogOut size={14}/> Log Out</button></motion.aside></div>}</AnimatePresence>
    <motion.aside onMouseEnter={() => setSidebarHovered(true)} onMouseLeave={() => { setSidebarHovered(false); setCollapsedGroupOpen(null); }} initial={false} animate={{ width: sidebarExpanded ? 184 : 68 }} transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }} className="hidden md:flex bg-[#182335] text-white flex-col h-full border-r border-slate-800/80 shrink-0 select-none overflow-hidden"><div className="h-16 px-3 border-b border-slate-800/80 flex items-center shrink-0 overflow-hidden"><Tooltip content="Return to Main Website" placement="right"><Link to="/" className="grid grid-cols-[40px_minmax(0,1fr)] items-center w-full h-full overflow-hidden"><span className="w-10 h-10 flex items-center justify-center shrink-0"><JaystarblissIcon className="w-8 h-8"/></span><motion.span animate={{ opacity: sidebarExpanded ? 1 : 0 }} transition={{ duration: 0.15 }} className="min-w-0 pl-2 whitespace-nowrap overflow-hidden"><span className="block text-sm font-bold">JAYSTARBLISS <ExternalLink size={11} className="inline opacity-50"/></span><span className="block text-[10px] text-brand-red font-mono uppercase font-bold">{role} Workspace</span></motion.span></Link></Tooltip></div><nav className="flex-1 px-2.5 py-3 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-1"><button type="button" onClick={() => { setSidebarPinned(prev => !prev); setCollapsedGroupOpen(null); }} aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"} className="w-full h-9 mb-2 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">{sidebarPinned ? <><X size={15}/><span className="text-[10px] font-bold">Unpin sidebar</span></> : <Menu size={17}/>}</button>{renderNavGroups(false)}</nav><div className="p-2.5 border-t border-slate-800/80 shrink-0 flex flex-col gap-1"><Tooltip content="Toggle Theme" placement="right"><button type="button" onClick={toggleTheme} className="w-full grid grid-cols-[32px_minmax(0,1fr)] items-center h-10 shrink-0 px-2.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold overflow-hidden"><span className="w-8 h-8 flex items-center justify-center shrink-0">{theme === 'dark' ? <Sun size={15} className="text-amber-400"/> : <Moon size={15}/>}</span><span className={`pl-2 whitespace-nowrap ${sidebarExpanded ? 'opacity-100' : 'opacity-0'}`}>Appearance</span></button></Tooltip><Tooltip content="Sign Out" placement="right"><button type="button" onClick={logout} className="w-full grid grid-cols-[32px_minmax(0,1fr)] items-center h-10 shrink-0 px-2.5 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 text-xs font-semibold overflow-hidden"><span className="w-8 h-8 flex items-center justify-center shrink-0"><LogOut size={15}/></span><span className={`pl-2 whitespace-nowrap ${sidebarExpanded ? 'opacity-100' : 'opacity-0'}`}>Log Out</span></button></Tooltip></div></motion.aside>
    <main className="portal-main-content flex-1 h-full min-w-0 flex flex-col overflow-y-auto custom-scrollbar pb-16 md:pb-0 bg-[#F8FAFC] dark:bg-[#243246]">{!isEmailVerified && !accessCodeOnly && <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2 shrink-0"><span className="truncate">Your email address ({userEmail}) is unverified.</span><button type="button" onClick={resendVerification} disabled={resendingVerification} className="underline font-bold shrink-0">{resendingVerification ? 'Sending…' : 'Resend Link'}</button></div>}<header className="hidden md:flex items-center justify-between px-6 py-3.5 bg-white/85 dark:bg-[#2B394D]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-20 shrink-0"><h2 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{roleTitle} Workspace</h2><div className="flex items-center gap-3"><Tooltip content="Customer Support & Help Desk" placement="bottom"><Link to={`/portal/${role}/support`} className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold" aria-label="Customer Support"><HelpCircle size={18}/><span className="hidden lg:inline text-xs font-bold text-slate-600 dark:text-slate-300">Support</span></Link></Tooltip><NotificationBell role={role}/><div className="relative" ref={profileRef}><button type="button" onClick={() => setShowProfileMenu(v => !v)} className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="User profile menu">{photoURL ? <img src={photoURL} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-brand-red/50" referrerPolicy="no-referrer"/> : <div className="w-8 h-8 rounded-full bg-brand-red text-white flex items-center justify-center font-bold text-xs">{displayName.charAt(0)}</div>}<span className="text-xs font-bold text-slate-700 dark:text-slate-200">{displayName}</span></button><AnimatePresence>{showProfileMenu && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 text-xs font-semibold"><div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800"><p className="font-bold truncate">{displayName}</p><p className="text-[11px] text-slate-500 truncate">{userEmail || `${role} account`}</p></div><Link to={`/portal/${role}/settings`} onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><SlidersHorizontal size={14}/> Account Settings</Link><button type="button" onClick={() => { setShowProfileMenu(false); setShowPasswordModal(true); }} className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"><KeyRound size={14}/> Change Password</button><div className="my-1 border-t border-slate-100 dark:border-slate-800"/><button type="button" onClick={logout} className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-brand-red text-left font-bold"><LogOut size={14}/> Sign Out</button></motion.div>}</AnimatePresence></div></div></header><div className="flex-1 p-4 sm:p-6 lg:p-8"><Outlet/></div></main>
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#0F1117]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-2 py-1.5 flex items-center overflow-x-auto no-scrollbar gap-1 z-30 shadow-lg">{navLinks.filter(item => ["Dashboard", "Learning & Tracks", "Class Schedules", "Examinations", "Examination Overview", "Examination Results", "Live Classes", "Resources"].includes(item.name)).slice(0, 4).map(item => { const active = location.pathname === item.path; return <Link key={item.name} to={item.path} className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl shrink-0 min-w-[62px] ${active ? 'text-brand-red font-bold' : 'text-slate-500 dark:text-slate-400'}`}>{item.icon}<span className="text-[9px] mt-0.5 truncate max-w-[65px]">{item.name}</span></Link>; })}</div>
    <ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)}/>
  </div>;
};
export default PortalLayout;
