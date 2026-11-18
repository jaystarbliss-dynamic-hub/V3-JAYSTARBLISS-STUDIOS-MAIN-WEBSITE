import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, BookOpen, Download, 
  RefreshCw, School, Award, ArrowUpRight,
  ShieldCheck, CheckCircle2, MessageSquare,
  Keyboard, ExternalLink, Copy, Check, Edit2, Save, X, Image as ImageIcon,
  Clock, AlertCircle, ChevronRight, UserCheck, XCircle, Mail, Phone,
  CreditCard, FileText, Layers, Briefcase, Bell
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, getDocs, query, orderBy, limit,
  doc, getDoc, setDoc, updateDoc, serverTimestamp, where 
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import AdminAnalyticsWidget from '../../components/admin/AdminAnalyticsWidget';
import PhotoUpload from '../../components/admin/PhotoUpload';
import { StudentEnrollmentApprovalModal } from '../../components/admin/StudentEnrollmentApprovalModal';
import {
  getAdminDashboardCapabilities,
  resolveCanonicalAdminScope,
  SUPER_ADMIN_EMAILS,
} from '../../utils/adminRbac';
import { getActiveImpersonation } from '../../utils/impersonation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const ROLE_COLORS = ['#1E293B', '#B91C1C', '#475569', '#64748B', '#334155', '#94A3B8'];

const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    const syncRole = async (uid?: string, email?: string | null) => {
      const imp = getActiveImpersonation();
      if (imp?.isMasquerading && imp.targetRole) {
        setActiveRole(String(imp.targetRole).toUpperCase());
        return;
      }

      const stored = (
        sessionStorage.getItem('userRole') ||
        localStorage.getItem('jaystar_cached_user_role') ||
        ''
      ).toUpperCase();
      if (stored && resolveCanonicalAdminScope(stored)) {
        setActiveRole(stored);
      }

      if (uid) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const dbRole = String(snap.data()?.role || '').trim().toUpperCase();
            if (resolveCanonicalAdminScope(dbRole)) {
              setActiveRole(dbRole);
              return;
            }
          }
        } catch {}
      }

      if (email && SUPER_ADMIN_EMAILS.has(email.toLowerCase())) {
        setActiveRole('SUPER_ADMIN');
      }
    };

    void syncRole(auth.currentUser?.uid, auth.currentUser?.email);
    const unsub = onAuthStateChanged(auth, user => {
      void syncRole(user?.uid, user?.email);
    });
    return () => unsub();
  }, []);

  const capabilities = useMemo(
    () => getAdminDashboardCapabilities(activeRole),
    [activeRole]
  );

  const [metrics, setMetrics] = useState({
    users: 0,
    students: 0,
    schools: 0,
    programs: 0,
    inquiries: 0,
    services: 0,
    resources: 0,
    exams: 0,
    pendingEnrollments: 0
  });

  const [inquiriesData, setInquiriesData] = useState<any[]>([]);
  const [usersData, setUsersData] = useState<any[]>([]);
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [activityLogsData, setActivityLogsData] = useState<any[]>([]);
  const [resourcesData, setResourcesData] = useState<any[]>([]);
  const [examsData, setExamsData] = useState<any[]>([]);
  const [pendingEnrollmentList, setPendingEnrollmentList] = useState<any[]>([]);
  
  // Student Approval Modal State
  const [selectedRequestForApproval, setSelectedRequestForApproval] = useState<any | null>(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);

  // Typing Masters Academy (EdClub Collaboration) State
  const [edclubUrl, setEdclubUrl] = useState('https://jaystarbliss-studios.edclub.com');
  const [edclubInput, setEdclubInput] = useState('https://jaystarbliss-studios.edclub.com');
  const [edclubBannerUrl, setEdclubBannerUrl] = useState('');
  const [edclubBannerInput, setEdclubBannerInput] = useState('');
  const [edclubTitle, setEdclubTitle] = useState('Keyboarding & Speed Typing Hub');
  const [edclubSubtitle, setEdclubSubtitle] = useState('Touch Typing Foundations • Home Row & Punctuation');
  const [isEditingEdclub, setIsEditingEdclub] = useState(false);
  const [savingEdclub, setSavingEdclub] = useState(false);
  const [copiedEdclub, setCopiedEdclub] = useState(false);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [
        usersSnap, 
        studentsSnap, 
        indStudentsSnap,
        schoolsSnap,
        programsSnap, 
        inquiriesSnap, 
        servicesSnap,
        resourcesSnap,
        schoolResourcesSnap,
        examsSnap,
        schoolExamsSnap,
        activitySnap,
        edclubSnap,
        pendingEnrollmentsSnap,
        pendingStudentReqsSnap
      ] = await Promise.all([
        getDocs(collection(db, 'users')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'students')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'individualStudents')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'schools')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'programs')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'inquiries')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'services')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'resources')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'schoolResources')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'exams')).catch(() => ({ size: 0, docs: [] })),
        getDocs(collection(db, 'schoolExams')).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDoc(doc(db, 'settings', 'edclub')).catch(() => null),
        getDocs(query(collection(db, 'enrollment_requests'), where('status', '==', 'pending'))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'student_requests'), where('status', '==', 'pending'))).catch(() => ({ size: 0, docs: [] }))
      ]);

      if (edclubSnap && edclubSnap.exists()) {
        const d = edclubSnap.data();
        if (d.portalUrl) {
          const cleanUrl = d.portalUrl === 'https://www.edclub.com' ? 'https://jaystarbliss-studios.edclub.com' : d.portalUrl;
          setEdclubUrl(cleanUrl);
          setEdclubInput(cleanUrl);
        }
        if (d.bannerUrl) {
          setEdclubBannerUrl(d.bannerUrl);
          setEdclubBannerInput(d.bannerUrl);
        }
        if (d.title) setEdclubTitle(d.title);
        if (d.subtitle) setEdclubSubtitle(d.subtitle);
      }

      const usersList = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Merge and deduplicate student records across students, individualStudents, and users
      const studentMap = new Map<string, any>();
      const uidOrUnameToKey = new Map<string, string>();
      const registerStudentDoc = (docId: string, data: any) => {
        if (!data || (!data.fullName && !data.studentName && !data.name && !data.username)) return;
        const sDocId = String(data.studentDocId || '').trim();
        const uid = String(data.firebaseUid || data.userId || '').trim();
        const uname = String(data.username || '').trim().toLowerCase();
        const nameKey = String(data.fullName || data.studentName || data.name || '').trim().toLowerCase().replace(/\s+/g, ' ');

        const existingKey =
          (studentMap.has(docId) ? docId : '') ||
          (sDocId && studentMap.has(sDocId) ? sDocId : '') ||
          (uid && uidOrUnameToKey.get(`uid:${uid}`)) ||
          (uname && uidOrUnameToKey.get(`uname:${uname}`)) ||
          (nameKey && uidOrUnameToKey.get(`name:${nameKey}`)) ||
          '';

        const targetKey = existingKey || sDocId || docId;
        const prev = studentMap.get(targetKey) || { id: targetKey };
        studentMap.set(targetKey, { ...prev, ...data, id: targetKey });

        if (uid) uidOrUnameToKey.set(`uid:${uid}`, targetKey);
        if (uname) uidOrUnameToKey.set(`uname:${uname}`, targetKey);
        if (nameKey) uidOrUnameToKey.set(`name:${nameKey}`, targetKey);
      };

      studentsSnap.docs.forEach(doc => registerStudentDoc(doc.id, doc.data()));
      indStudentsSnap.docs.forEach(doc => registerStudentDoc(doc.id, doc.data()));
      usersSnap.docs.forEach(doc => {
        const data = doc.data();
        const role = String(data.role || '').toUpperCase();
        if (role === 'STUDENT' || role === 'CADET' || data.isStudent) {
          registerStudentDoc(doc.id, { ...data, firebaseUid: doc.id });
        }
      });
      const studentsList = Array.from(studentMap.values());

      const inquiriesList = inquiriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const resourceMap = new Map<string, any>();
      resourcesSnap.docs.forEach(doc => resourceMap.set(doc.id, { id: doc.id, ...doc.data() }));
      schoolResourcesSnap.docs.forEach(doc => {
        if (!resourceMap.has(doc.id)) resourceMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      const resourcesList = Array.from(resourceMap.values());

      const examMap = new Map<string, any>();
      examsSnap.docs.forEach(doc => examMap.set(doc.id, { id: doc.id, ...doc.data() }));
      schoolExamsSnap.docs.forEach(doc => {
        if (!examMap.has(doc.id)) examMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      const examsList = Array.from(examMap.values());

      const activityList = activitySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Merge pending enrollment requests
      const pendingEnrollMap = new Map<string, any>();
      pendingEnrollmentsSnap.docs.forEach(doc => pendingEnrollMap.set(doc.id, { id: doc.id, ...doc.data(), reqType: 'enrollment' }));
      pendingStudentReqsSnap.docs.forEach(doc => {
        if (!pendingEnrollMap.has(doc.id)) {
          pendingEnrollMap.set(doc.id, { 
            id: doc.id, 
            studentName: doc.data().name || doc.data().studentName, 
            ...doc.data(), 
            reqType: 'student_request' 
          });
        }
      });
      const pendingList = Array.from(pendingEnrollMap.values());
      setPendingEnrollmentList(pendingList);

      setMetrics({
        users: usersSnap.size,
        students: studentsList.length,
        schools: schoolsSnap.size,
        programs: programsSnap.size,
        inquiries: inquiriesSnap.size,
        services: servicesSnap.size,
        resources: resourcesList.length,
        exams: examsList.length,
        pendingEnrollments: pendingList.length
      });

      setUsersData(usersList);
      setStudentsData(studentsList);
      setInquiriesData(inquiriesList);
      setResourcesData(resourcesList);
      setExamsData(examsList);
      setActivityLogsData(activityList);

      if (isManualRefresh) {
        toast.success('Telemetry and analytics updated successfully.');
      }
    } catch (error) {
      console.error("Error fetching dashboard telemetry:", error);
      toast.error('Could not refresh some telemetry collections.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.info(`No ${filename} records to export.`);
      return;
    }
    const headers = Object.keys(data[0]).filter(k => typeof data[0][k] !== 'object');
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${(row[header] !== undefined && row[header] !== null ? String(row[header]) : '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${data.length} records to ${filename}.csv`);
  };

  const handleCopyEdclubLink = async () => {
    try {
      await navigator.clipboard.writeText(edclubUrl);
      setCopiedEdclub(true);
      toast.success('EdClub collaboration link copied to clipboard!');
      setTimeout(() => setCopiedEdclub(false), 2500);
    } catch (e) {
      toast.error('Could not copy link to clipboard.');
    }
  };

  const handleSaveEdclub = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = edclubInput.trim();
    if (!clean) {
      toast.error('Please specify a valid EdClub collaboration link.');
      return;
    }
    setSavingEdclub(true);
    try {
      await setDoc(doc(db, 'settings', 'edclub'), {
        portalUrl: clean,
        bannerUrl: edclubBannerInput.trim(),
        title: edclubTitle.trim() || 'Keyboarding & Speed Typing Hub',
        subtitle: edclubSubtitle.trim() || 'Touch Typing Foundations • Home Row & Punctuation',
        name: 'Jaystarbliss Studios • Typing Masters Academy',
        updatedAt: serverTimestamp()
      }, { merge: true });
      setEdclubUrl(clean);
      setEdclubBannerUrl(edclubBannerInput.trim());
      setIsEditingEdclub(false);
      toast.success('EdClub collaboration settings & banner updated and live across student portals!');
    } catch (err) {
      console.error('Save EdClub link error:', err);
      toast.error('Failed to update EdClub collaboration settings.');
    } finally {
      setSavingEdclub(false);
    }
  };

  const stats = useMemo(() => {
    if (capabilities.scope === 'FINANCE_ADMIN') {
      return [
        {
          name: 'Billings & Ledger',
          value: 'Active',
          icon: CreditCard,
          iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
          href: '/admin/billing',
          badge: 'Tuition & Invoices',
          trend: 'Verified transactions',
        },
        {
          name: 'Pending Approvals',
          value: metrics.pendingEnrollments,
          icon: UserCheck,
          iconBg: 'bg-[#B91C1C]/10 text-[#B91C1C] dark:text-red-400 border border-[#B91C1C]/20',
          href: '/admin/approvals',
          badge: 'Fee & Access Queue',
          trend: 'Awaiting review',
        },
        {
          name: 'Agreements Centre',
          value: 'Contracts',
          icon: FileText,
          iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
          href: '/admin/agreements',
          badge: 'Institutional & Tutor',
          trend: 'Active agreements',
        },
        {
          name: 'Enrolled Students',
          value: metrics.students,
          icon: Users,
          iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
          href: '/admin/billing',
          badge: 'Billing Accounts',
          trend: 'Active billing profiles',
        },
      ];
    }

    if (capabilities.scope === 'CMS_ADMIN') {
      return [
        {
          name: 'Programs & Courses',
          value: metrics.programs,
          icon: BookOpen,
          iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
          href: '/admin/programs',
          badge: 'Curriculum Catalog',
          trend: 'Published tracks',
        },
        {
          name: 'Services Catalog',
          value: metrics.services,
          icon: Briefcase,
          iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
          href: '/admin/services',
          badge: 'Enterprise & Studio',
          trend: 'Live offerings',
        },
        {
          name: 'Public Inquiries',
          value: metrics.inquiries,
          icon: MessageSquare,
          iconBg: 'bg-[#B91C1C]/10 text-[#B91C1C] dark:text-red-400 border border-[#B91C1C]/20',
          href: '/admin/inquiries',
          badge: 'Leads & Contact',
          trend: 'Incoming requests',
        },
        {
          name: 'Pages & Section CMS',
          value: 'Live',
          icon: Layers,
          iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
          href: '/admin/pages',
          badge: 'Website Editor',
          trend: 'Realtime publishing',
        },
      ];
    }

    // SUPER_ADMIN & ACADEMIC_ADMIN
    return [
      { 
        name: 'Enrolled Students', 
        value: metrics.students, 
        icon: Users, 
        iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
        href: '/admin/students', 
        badge: 'Active Cohorts',
        trend: `${metrics.users} total portal accounts`
      },
      { 
        name: 'Partner Schools', 
        value: metrics.schools, 
        icon: School, 
        iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
        href: '/admin/schools', 
        badge: 'Montessori Portals',
        trend: 'Active school portals'
      },
      { 
        name: 'Curriculum Guides', 
        value: metrics.resources, 
        icon: BookOpen, 
        iconBg: 'bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 border border-slate-200 dark:border-slate-700',
        href: '/admin/resources', 
        badge: 'PDF & Labs',
        trend: 'Persisted resource library'
      },
      { 
        name: 'CBT Assessments', 
        value: metrics.exams, 
        icon: Award, 
        iconBg: 'bg-[#B91C1C]/10 text-[#B91C1C] dark:text-red-400 border border-[#B91C1C]/20',
        href: '/admin/examinations', 
        badge: 'Testing Windows',
        trend: 'Realtime grading'
      },
    ];
  }, [capabilities.scope, metrics]);

  const quickActions = useMemo(() => {
    if (capabilities.scope === 'ACADEMIC_ADMIN') {
      return [
        { label: 'Pending Approvals', href: '/admin/approvals', icon: ShieldCheck, badge: `${metrics.pendingEnrollments} Requests` },
        { label: 'Scholars & Students', href: '/admin/students', icon: Users, badge: 'Registry' },
        { label: 'Programs & Courses', href: '/admin/programs', icon: BookOpen, badge: 'Curriculum' },
        { label: 'CBT Assessments', href: '/admin/examinations', icon: Award, badge: 'Exams & Grading' },
      ];
    }

    if (capabilities.scope === 'FINANCE_ADMIN') {
      return [
        { label: 'Billings / Fees', href: '/admin/billing', icon: CreditCard, badge: 'Ledger & Invoices' },
        { label: 'Pending Approvals', href: '/admin/approvals', icon: ShieldCheck, badge: `${metrics.pendingEnrollments} Requests` },
        { label: 'Agreements Centre', href: '/admin/agreements', icon: FileText, badge: 'Contracts' },
        { label: 'Notifications', href: '/admin/notifications', icon: Bell, badge: 'Alerts' },
      ];
    }

    if (capabilities.scope === 'CMS_ADMIN') {
      return [
        { label: 'Pages & Section CMS', href: '/admin/pages', icon: Layers, badge: 'Website Sections' },
        { label: 'Programs & Courses', href: '/admin/programs', icon: BookOpen, badge: 'Curriculum' },
        { label: 'Services Catalog', href: '/admin/services', icon: Briefcase, badge: 'Offerings' },
        { label: 'Public Inquiries', href: '/admin/inquiries', icon: MessageSquare, badge: 'Admissions' },
      ];
    }

    // SUPER_ADMIN
    return [
      { label: 'Pending Approvals', href: '/admin/approvals', icon: ShieldCheck, badge: `${metrics.pendingEnrollments} Requests` },
      { label: 'Students', href: '/admin/students', icon: Users, badge: 'Registry' },
      { label: 'Curriculum & CBT', href: '/admin/resources', icon: BookOpen, badge: 'Library' },
      { label: 'Public Inquiries', href: '/admin/inquiries', icon: MessageSquare, badge: 'Admissions' },
    ];
  }, [capabilities.scope, metrics.pendingEnrollments]);

  const inquiriesByType = inquiriesData.reduce((acc, curr) => {
    const type = curr.type || 'GENERAL';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const chartDataInquiries = Object.keys(inquiriesByType).map(key => ({ name: key, value: inquiriesByType[key] }));

  const usersByRole = usersData.reduce((acc, curr) => {
    const role = curr.role || 'STUDENT';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  const chartDataUsers = Object.keys(usersByRole).map(key => ({ name: key, value: usersByRole[key] }));

  return (
    <div className="dashboard-interface space-y-6">
      {/* Compact Control Actions */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <div>
          {capabilities.scope !== 'SUPER_ADMIN' && (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E293B] dark:text-slate-200">
              <ShieldCheck size={14} className="text-[#B91C1C]" />
              <span>{capabilities.roleLabel} Workspace</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {(capabilities.scope === 'SUPER_ADMIN' || capabilities.scope === 'ACADEMIC_ADMIN') && (
            <button 
              type="button"
              onClick={() => exportToCSV(studentsData, 'students_cadets_registry')}
              className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-xs cursor-pointer"
            >
              <Download size={14} className="text-[#1E293B] dark:text-slate-200" />
              <span>Export Students CSV</span>
            </button>
          )}
          
          <button 
            type="button"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-[#1E293B] hover:bg-slate-800 dark:bg-[#B91C1C] dark:hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Sync Firestore'}</span>
          </button>
        </div>
      </div>
      
      {/* Unified Key Metric Overview Strip */}
      <div className="pro-surface rounded-2xl border border-slate-200/90 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800 overflow-hidden">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div 
              key={item.name} 
              className="p-5 flex flex-col justify-between hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {item.name}
                  </span>
                  <div className="text-3xl font-black text-slate-900 dark:text-white mt-1 tracking-tight tabular-nums">
                    {loading ? '—' : item.value}
                  </div>
                  <span className="inline-block mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                    {item.trend}
                  </span>
                </div>
                <div className={`rounded-xl p-2.5 shrink-0 ${item.iconBg}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                  {item.badge}
                </span>
                <Link to={item.href} className="font-bold text-[#1E293B] dark:text-slate-200 hover:text-[#B91C1C] dark:hover:text-red-400 transition-colors inline-flex items-center gap-1">
                  Manage <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Navigation Shortcuts Strip */}
      <div className="pro-surface rounded-2xl border border-slate-200/90 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200/80 dark:divide-slate-800 overflow-hidden">
        {quickActions.map((action, idx) => {
          const ActionIcon = action.icon;
          return (
            <Link
              key={idx}
              to={action.href}
              className="p-3.5 flex items-center justify-between group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 flex items-center justify-center shrink-0 group-hover:text-[#B91C1C] transition-colors">
                  <ActionIcon size={16} />
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{action.label}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">{action.badge}</div>
                </div>
              </div>
              <ArrowUpRight size={14} className="text-slate-400 group-hover:text-[#B91C1C] transition-colors shrink-0" />
            </Link>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* PENDING STUDENT ENROLLMENTS & ACCESS APPROVALS QUEUE */}
      {/* ========================================================================= */}
      {capabilities.canViewPendingEnrollments && pendingEnrollmentList.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-[#B91C1C]/30 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center font-black shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    Pending Student Enrollments &amp; Access Approvals
                  </h2>
                  <span className="text-xs font-black text-[#B91C1C] dark:text-red-400 tabular-nums">
                    · {pendingEnrollmentList.length} Action{pendingEnrollmentList.length > 1 ? 's' : ''} Needed
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Parents requested enrollment for these children. Review requested courses, configure fees, assign a mentor, and schedule class times to activate student access.
                </p>
              </div>
            </div>

            <Link
              to="/admin/approvals"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B91C1C] dark:text-red-400 hover:underline shrink-0"
            >
              <span>Full Approvals Center</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {pendingEnrollmentList.slice(0, 6).map((req) => {
              const reqStudentName = req.studentName || req.name || 'Student Candidate';
              const reqParentEmail = req.parentEmail || req.email || '';
              const reqParentName = req.parentName || 'Parent';
              const reqPlan = req.plan || (Array.isArray(req.subjects) ? req.subjects.join(', ') : req.subjects) || 'Technology Program';
              const reqAge = req.studentAge || req.studentClass || req.class || req.grade || 'Junior Cadet';

              return (
                <div
                  key={req.id}
                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60 p-4 flex flex-col justify-between hover:border-[#1E293B]/40 dark:hover:border-slate-700 transition-all space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Child / Student</span>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{reqStudentName}</h4>
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                        {reqAge}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400 font-medium">Programme:</span>
                        <span className="font-bold text-[#B91C1C] dark:text-red-400 truncate max-w-[150px]">{reqPlan}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400 font-medium">Parent:</span>
                        <span className="font-bold truncate max-w-[150px]">{reqParentName}</span>
                      </div>
                      {reqParentEmail && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                          <Mail size={10} className="shrink-0" />
                          <span className="truncate">{reqParentEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Reject enrollment request for ${reqStudentName}?`)) return;
                        try {
                          await updateDoc(doc(db, req.reqType === 'student_request' ? 'student_requests' : 'enrollment_requests', req.id), {
                            status: 'rejected',
                            rejectedAt: serverTimestamp()
                          });
                          toast.info(`Request for ${reqStudentName} rejected.`);
                          void fetchDashboardData();
                        } catch (err: any) {
                          toast.error('Error rejecting: ' + err.message);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRequestForApproval(req);
                        setIsApprovalModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#1E293B] hover:bg-slate-800 dark:bg-[#B91C1C] dark:hover:bg-red-700 text-white text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck size={13} />
                      <span>Approve &amp; Configure Access</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TYPING MASTERS ACADEMY • EDCLUB COLLABORATION HUB & BANNER DESIGN */}
      {/* ========================================================================= */}
      {capabilities.canViewEdclubHub && (
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-white shadow-sm transition-all bg-[#0F172A]">
        {/* Background Banner Image or Institutional Navy */}
        {edclubBannerUrl ? (
          <>
            <img 
              src={edclubBannerUrl} 
              alt="EdClub Banner" 
              className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
            />
            <div className="absolute inset-0 bg-[#0F172A]/85 pointer-events-none" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] pointer-events-none" />
        )}

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-bold">
              <span className="text-[#F87171] uppercase tracking-wider font-black">
                Typing Masters Academy
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300">
                In Collaboration with <strong className="text-white font-black">EdClub</strong>
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-200 font-semibold">
                Active Collab{edclubBannerUrl ? ' · Custom Banner Live' : ''}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
              <Keyboard className="w-6 h-6 text-[#B91C1C] shrink-0" />
              <span>{edclubTitle}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              {edclubSubtitle}
            </p>
            <p className="text-[11px] text-slate-400">
              Only students enrolled in programs with EdClub assigned will have this portal unlocked.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-300 font-mono text-xs">
              <span className="font-semibold text-white truncate max-w-[200px] sm:max-w-xs">{edclubUrl}</span>
              <button
                type="button"
                onClick={handleCopyEdclubLink}
                title="Copy Collab Link"
                aria-label="Copy Collab Link"
                className="p-1 hover:text-white text-slate-300 transition-colors ml-1 cursor-pointer"
              >
                {copiedEdclub ? <Check size={14} className="text-white" /> : <Copy size={14} />}
              </button>
            </div>

            {capabilities.canConfigureEdclubHub && (
              <button
                type="button"
                onClick={() => {
                  setEdclubInput(edclubUrl);
                  setEdclubBannerInput(edclubBannerUrl);
                  setIsEditingEdclub(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-100 hover:text-white border border-white/20 text-xs font-bold transition-all cursor-pointer"
                title="Edit EdClub Banner & Portal URL"
              >
                <ImageIcon size={15} />
                <span>Configure Banner &amp; Link</span>
              </button>
            )}

            <a
              href={edclubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-black transition-all shadow-sm"
            >
              <ExternalLink size={14} />
              <span>Launch EdClub</span>
              <ArrowUpRight size={13} className="opacity-80" />
            </a>
          </div>
        </div>

        {/* Modal / Editor for EdClub Banner & Collaboration Configuration */}
        {isEditingEdclub && capabilities.canConfigureEdclubHub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-xl bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl p-6 sm:p-8 space-y-5 text-white max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center">
                    <Keyboard size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Configure EdClub Portal &amp; Banner</h3>
                    <p className="text-xs text-slate-400">Upload background banner and set student portal launch link</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingEdclub(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEdclub} className="space-y-4">
                {/* Banner Photo Upload */}
                <div>
                  <PhotoUpload
                    label="EdClub Card Banner Image"
                    value={edclubBannerInput}
                    onChange={(url) => setEdclubBannerInput(url)}
                    helpText="Upload a vibrant landscape banner image to serve as the EdClub background."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    EdClub Collaboration Launch URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={edclubInput}
                    onChange={(e) => setEdclubInput(e.target.value)}
                    placeholder="https://jaystarbliss-studios.edclub.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Custom school or general Jaystarbliss EdClub subdomain URL.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Card Title
                    </label>
                    <input
                      type="text"
                      value={edclubTitle}
                      onChange={(e) => setEdclubTitle(e.target.value)}
                      placeholder="Keyboarding & Speed Typing Hub"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Card Subtitle / Weekly Target
                    </label>
                    <input
                      type="text"
                      value={edclubSubtitle}
                      onChange={(e) => setEdclubSubtitle(e.target.value)}
                      placeholder="Touch Typing Foundations • Home Row & Punctuation"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingEdclub(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdclub}
                    className="px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm cursor-pointer"
                  >
                    <Save size={14} />
                    <span>{savingEdclub ? 'Saving Changes...' : 'Save Banner & Settings'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ========================================================================= */}
      {/* ROLE-SCOPED INTERACTIVE RECHARTS ANALYTICS WIDGET */}
      {/* ========================================================================= */}
      {capabilities.canViewAcademicAnalytics && (
        <AdminAnalyticsWidget
          studentsData={studentsData}
          usersData={usersData}
          activityLogsData={activityLogsData}
          resourcesData={resourcesData}
          examsData={examsData}
          onRefresh={() => fetchDashboardData(true)}
          isLoading={refreshing}
          allowLoginActivityTab={capabilities.canViewLoginActivityAnalytics}
          widgetTitle={
            capabilities.scope === 'SUPER_ADMIN'
              ? 'Super Admin Telemetry & Analytics Matrix'
              : 'Academic Telemetry & Assessment Matrix'
          }
        />
      )}

      {/* Secondary Graphs: Inquiries & User Role Composition (Role-Scoped) */}
      {(capabilities.canViewInquiriesChart || capabilities.canViewRbacDistributionChart) && (
        <div className={`grid grid-cols-1 ${capabilities.canViewInquiriesChart && capabilities.canViewRbacDistributionChart ? 'lg:grid-cols-2' : ''} gap-6`}>
          {capabilities.canViewInquiriesChart && (
            <div className="pro-surface rounded-2xl p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Public Inquiries &amp; Admissions Influx
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Breakdown of incoming enrollment requests by program track.
                  </p>
                </div>
                <Link to="/admin/inquiries" className="text-xs font-bold text-[#1E293B] dark:text-slate-200 hover:text-[#B91C1C] dark:hover:text-red-400 transition-colors">
                  View All &rarr;
                </Link>
              </div>

              <div className="h-[280px] w-full mt-2">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">Loading inquiry metrics...</div>
                ) : chartDataInquiries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    No public inquiry records available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartDataInquiries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#64748b" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: '#0F172A', 
                          borderRadius: '12px', 
                          border: '1px solid #334155', 
                          color: '#fff'
                        }} 
                      />
                      <Bar dataKey="value" name="Inquiries" fill="#1E293B" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
          
          {capabilities.canViewRbacDistributionChart && (
            <div className="pro-surface rounded-2xl p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Platform Account Role Distribution
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Active accounts across Students, Staff, Parents, and School Representatives.
                  </p>
                </div>
                <Link to="/admin/users" className="text-xs font-bold text-[#1E293B] dark:text-slate-200 hover:text-[#B91C1C] dark:hover:text-red-400 transition-colors">
                  Manage RBAC &rarr;
                </Link>
              </div>

              <div className="h-[280px] w-full mt-2">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">Loading user roles...</div>
                ) : chartDataUsers.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    No account role records available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartDataUsers}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartDataUsers.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={ROLE_COLORS[index % ROLE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: '#0F172A', 
                          borderRadius: '12px', 
                          border: '1px solid #334155', 
                          color: '#fff'
                        }} 
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student Enrollment & Access Approval Modal */}
      {isApprovalModalOpen && selectedRequestForApproval && (
        <StudentEnrollmentApprovalModal
          request={selectedRequestForApproval}
          isOpen={isApprovalModalOpen}
          onClose={() => {
            setIsApprovalModalOpen(false);
            setSelectedRequestForApproval(null);
          }}
          onSuccess={() => {
            void fetchDashboardData();
          }}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
