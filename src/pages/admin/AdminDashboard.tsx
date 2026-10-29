import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, BookOpen, Download, 
  RefreshCw, School, Award, ArrowUpRight,
  ShieldCheck, CheckCircle2, MessageSquare,
  Keyboard, ExternalLink, Copy, Check, Edit2, Save, X, Image as ImageIcon,
  Clock, AlertCircle, ChevronRight, UserCheck, XCircle, Mail, Phone
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  collection, getDocs, getCountFromServer, query, orderBy, limit,
  doc, getDoc, setDoc, updateDoc, serverTimestamp, where 
} from 'firebase/firestore';
import { auth, db, ACTIVE_DATABASE_ID, DEFAULT_DATABASE_ID } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import AdminAnalyticsWidget from '../../components/admin/AdminAnalyticsWidget';
import PhotoUpload from '../../components/admin/PhotoUpload';
import { StudentEnrollmentApprovalModal } from '../../components/admin/StudentEnrollmentApprovalModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const ROLE_COLORS = ['#0284c7', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [firestoreUsage, setFirestoreUsage] = useState<any>(null);
  const [firestoreUsageLoading, setFirestoreUsageLoading] = useState(false);
  const [firestoreUsageError, setFirestoreUsageError] = useState('');

  const fetchFirestoreUsage = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setFirestoreUsageError('Sign in again to view usage metrics.');
      return;
    }
    setFirestoreUsageLoading(true);
    setFirestoreUsageError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/.netlify/functions/firestore-usage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Usage metrics request failed.');
      setFirestoreUsage(payload);
      if (!payload.available) setFirestoreUsageError(payload.reason || 'Cloud Monitoring metrics are not configured.');
    } catch (error) {
      setFirestoreUsageError(error instanceof Error ? error.message : 'Could not load Firestore usage.');
    } finally {
      setFirestoreUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFirestoreUsage();
  }, [fetchFirestoreUsage]);

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
        pendingStudentReqsSnap,
        usersCountSnap,
        studentsCountSnap,
        individualStudentsCountSnap,
        schoolsCountSnap,
        programsCountSnap,
        inquiriesCountSnap,
        servicesCountSnap,
        resourcesCountSnap,
        schoolResourcesCountSnap,
        examsCountSnap,
        schoolExamsCountSnap
      ] = await Promise.all([
        getDocs(query(collection(db, 'users'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'students'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'individualStudents'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'schools'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'programs'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'inquiries'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'services'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'resources'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'schoolResources'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'exams'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'schoolExams'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDoc(doc(db, 'settings', 'edclub')).catch(() => null),
        getDocs(query(collection(db, 'enrollment_requests'), where('status', '==', 'pending'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getDocs(query(collection(db, 'student_requests'), where('status', '==', 'pending'), limit(100))).catch(() => ({ size: 0, docs: [] })),
        getCountFromServer(collection(db, 'users')).catch(() => null),
        getCountFromServer(collection(db, 'students')).catch(() => null),
        getCountFromServer(collection(db, 'individualStudents')).catch(() => null),
        getCountFromServer(collection(db, 'schools')).catch(() => null),
        getCountFromServer(collection(db, 'programs')).catch(() => null),
        getCountFromServer(collection(db, 'inquiries')).catch(() => null),
        getCountFromServer(collection(db, 'services')).catch(() => null),
        getCountFromServer(collection(db, 'resources')).catch(() => null),
        getCountFromServer(collection(db, 'schoolResources')).catch(() => null),
        getCountFromServer(collection(db, 'exams')).catch(() => null),
        getCountFromServer(collection(db, 'schoolExams')).catch(() => null)
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

      // Merge and deduplicate student records
      const studentMap = new Map<string, any>();
      studentsSnap.docs.forEach(doc => studentMap.set(doc.id, { id: doc.id, ...doc.data() }));
      indStudentsSnap.docs.forEach(doc => {
        if (!studentMap.has(doc.id)) studentMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      usersSnap.docs.forEach(doc => {
        const data = doc.data();
        const role = String(data.role || '').toUpperCase();
        if (role === 'STUDENT' || role === 'CADET' || data.isStudent) {
          if (!studentMap.has(doc.id)) studentMap.set(doc.id, { id: doc.id, ...data });
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
        users: usersCountSnap?.data().count ?? usersSnap.size,
        students: (studentsCountSnap?.data().count ?? studentsSnap.size) + (individualStudentsCountSnap?.data().count ?? indStudentsSnap.size),
        schools: schoolsCountSnap?.data().count ?? schoolsSnap.size,
        programs: programsCountSnap?.data().count ?? programsSnap.size,
        inquiries: inquiriesCountSnap?.data().count ?? inquiriesSnap.size,
        services: servicesCountSnap?.data().count ?? servicesSnap.size,
        resources: (resourcesCountSnap?.data().count ?? resourcesSnap.size) + (schoolResourcesCountSnap?.data().count ?? schoolResourcesSnap.size),
        exams: (examsCountSnap?.data().count ?? examsSnap.size) + (schoolExamsCountSnap?.data().count ?? schoolExamsSnap.size),
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

  const stats = [
    { 
      name: 'Student Records', 
      value: metrics.students, 
      icon: Users, 
      color: 'from-sky-500 to-blue-600', 
      iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20',
      href: '/admin/students', 
      badge: 'Active Cohorts',
      trend: '+14% this month'
    },
    { 
      name: 'Partner Schools', 
      value: metrics.schools, 
      icon: School, 
      color: 'from-blue-600 to-indigo-700', 
      iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
      href: '/admin/schools', 
      badge: 'Montessori Portals',
      trend: '100% operational'
    },
    { 
      name: 'Resource Records', 
      value: metrics.resources, 
      icon: BookOpen, 
      color: 'from-cyan-500 to-sky-600', 
      iconBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
      href: '/admin/resources', 
      badge: 'PDF & Labs',
      trend: 'Updated recently'
    },
    { 
      name: 'Assessment Records', 
      value: metrics.exams, 
      icon: Award, 
      color: 'from-emerald-500 to-teal-600', 
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
      href: '/admin/schools', 
      badge: 'Testing Windows',
      trend: 'Realtime grading'
    },
  ];

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
      <div className="flex items-center justify-end gap-2.5 flex-wrap">
        <button 
          type="button"
          onClick={() => exportToCSV(studentsData.length > 0 ? studentsData : usersData, 'students_cadets_registry')}
          className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-white/10 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-xs cursor-pointer"
        >
          <Download size={14} className="text-sky-600 dark:text-sky-400" />
          <span>Export CSV</span>
        </button>
        
        <button 
          type="button"
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Syncing...' : 'Sync Firestore'}</span>
        </button>
      </div>
      
      {/* Daily Firestore read usage: sourced from Cloud Monitoring, never guessed from browser activity. */}
      <section className="pro-surface rounded-2xl p-5 space-y-4" aria-label="Daily Firestore read usage">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Firestore daily read usage</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Google Cloud Monitoring · Free-tier reference: 50,000 reads/day per eligible database
            </p>
          </div>
          <button type="button" onClick={() => void fetchFirestoreUsage()} disabled={firestoreUsageLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2 text-xs font-semibold disabled:opacity-50">
            <RefreshCw size={13} className={firestoreUsageLoading ? 'animate-spin' : ''} />
            Refresh usage
          </button>
        </div>
        {firestoreUsageLoading && !firestoreUsage && <p className="text-sm text-slate-500">Loading authoritative usage metrics…</p>}
        {firestoreUsageError && <p role="status" className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">{firestoreUsageError}</p>}
        {firestoreUsage?.available && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(firestoreUsage.databases || []).map((item: any) => (
                <div key={item.databaseId} className="rounded-xl border border-slate-200 dark:border-white/10 p-4">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 break-all">{item.databaseId}</div>
                  <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{Number(item.reads || 0).toLocaleString()} <span className="text-xs font-medium text-slate-500">reads</span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${item.percentOfFreeAllowance >= 90 ? 'bg-red-500' : item.percentOfFreeAllowance >= 70 ? 'bg-amber-500' : 'bg-sky-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, Number(item.percentOfFreeAllowance || 0)))}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.percentOfFreeAllowance}% of the 50,000-read reference allowance</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{firestoreUsage.note}</p>
          </>
        )}
      </section>

      {/* Key Metric Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div 
              key={item.name} 
              className="pro-surface pro-interactive overflow-hidden rounded-2xl p-5 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {item.name}
                  </span>
                  <div className="text-3xl font-black text-slate-900 dark:text-white mt-1 tracking-tight">
                    {loading ? '...' : item.value}
                  </div>
                  <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.trend}
                  </span>
                </div>
                <div className={`rounded-xl p-3 ${item.iconBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                  {item.badge}
                </span>
                <Link to={item.href} className="font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors inline-flex items-center gap-1">
                  Manage <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Navigation Shortcuts Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pending Approvals', href: '/admin/approvals', icon: ShieldCheck, badge: `${metrics.pendingEnrollments} Requests` },
          { label: 'Students', href: '/admin/students', icon: Users, badge: 'Registry' },
          { label: 'Curriculum & CBT', href: '/admin/resources', icon: BookOpen, badge: 'Library' },
          { label: 'Public Inquiries', href: '/admin/inquiries', icon: MessageSquare, badge: 'Admissions' },
        ].map((action, idx) => {
          const ActionIcon = action.icon;
          return (
            <Link
              key={idx}
              to={action.href}
              className="pro-surface pro-interactive rounded-xl p-3 flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ActionIcon size={16} />
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{action.label}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{action.badge}</div>
                </div>
              </div>
              <ArrowUpRight size={14} className="text-slate-400 group-hover:text-sky-500 transition-colors shrink-0" />
            </Link>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 🚀 PENDING STUDENT ENROLLMENTS & ACCESS APPROVALS QUEUE */}
      {/* ========================================================================= */}
      {pendingEnrollmentList.length > 0 && (
        <div className="rounded-3xl bg-gradient-to-br from-white via-slate-50/50 to-white dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-900 border-2 border-brand-red/30 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center font-black animate-pulse">
                <AlertCircle size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    Pending Student Enrollments &amp; Access Approvals
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-red text-white text-[10px] font-black uppercase shadow-xs">
                    {pendingEnrollmentList.length} Action{pendingEnrollmentList.length > 1 ? 's' : ''} Needed
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Parents requested enrollment for these children. Review requested courses, configure fees, assign a mentor, and schedule class times to activate student access.
                </p>
              </div>
            </div>

            <Link
              to="/admin/approvals"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline shrink-0"
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
                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-950/70 p-4 flex flex-col justify-between shadow-xs hover:border-brand-red/50 hover:shadow-md transition-all space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Child / Student</span>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{reqStudentName}</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                        {reqAge}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400 font-medium">Programme:</span>
                        <span className="font-bold text-brand-red truncate max-w-[150px]">{reqPlan}</span>
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

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
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
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
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
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/30 p-6 sm:p-8 text-white shadow-2xl transition-all">
        {/* Background Banner Image or Gradient */}
        {edclubBannerUrl ? (
          <>
            <img 
              src={edclubBannerUrl} 
              alt="EdClub Banner" 
              className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-indigo-950/90 to-slate-950/80 pointer-events-none" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 pointer-events-none" />
        )}
        
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider shadow-sm">
                Typing Masters Academy
              </span>
              <span className="text-xs text-indigo-200 font-bold">
                In Collaboration with <strong className="text-white font-black">EdClub</strong>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase">
                Active Collab
              </span>
              {edclubBannerUrl && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-bold">
                  Custom Banner Live
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
              <Keyboard className="w-6 h-6 text-indigo-400 shrink-0" />
              <span>{edclubTitle}</span>
            </h2>
            <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed font-medium">
              {edclubSubtitle}
            </p>
            <p className="text-[11px] text-indigo-300/70">
              Only students enrolled in programs with EdClub assigned will have this portal unlocked.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-indigo-500/30 text-indigo-300 font-mono text-xs shadow-inner">
              <span className="font-semibold text-white truncate max-w-[200px] sm:max-w-xs">{edclubUrl}</span>
              <button
                type="button"
                onClick={handleCopyEdclubLink}
                title="Copy Collab Link"
                aria-label="Copy Collab Link"
                className="p-1 hover:text-white text-indigo-300 transition-colors ml-1"
              >
                {copiedEdclub ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setEdclubInput(edclubUrl);
                setEdclubBannerInput(edclubBannerUrl);
                setIsEditingEdclub(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-indigo-100 hover:text-white border border-white/20 text-xs font-bold transition-all shadow-sm"
              title="Edit EdClub Banner & Portal URL"
            >
              <ImageIcon size={15} />
              <span>Configure Banner &amp; Link</span>
            </button>

            <a
              href={edclubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-black transition-all shadow-lg shadow-indigo-600/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <ExternalLink size={14} />
              <span>Launch EdClub</span>
              <ArrowUpRight size={13} className="opacity-70" />
            </a>
          </div>
        </div>

        {/* Modal / Editor for EdClub Banner & Collaboration Configuration */}
        {isEditingEdclub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-xl bg-slate-900 rounded-3xl border border-indigo-500/40 shadow-2xl p-6 sm:p-8 space-y-5 text-white max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-indigo-900/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center">
                    <Keyboard size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Configure EdClub Portal &amp; Banner</h3>
                    <p className="text-xs text-indigo-300">Upload background banner and set student portal launch link</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingEdclub(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1.5">
                    EdClub Collaboration Launch URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={edclubInput}
                    onChange={(e) => setEdclubInput(e.target.value)}
                    placeholder="https://jaystarbliss-studios.edclub.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-900/80 bg-slate-950 text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Custom school or general Jaystarbliss EdClub subdomain URL.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1.5">
                      Card Title
                    </label>
                    <input
                      type="text"
                      value={edclubTitle}
                      onChange={(e) => setEdclubTitle(e.target.value)}
                      placeholder="Keyboarding & Speed Typing Hub"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-900/80 bg-slate-950 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1.5">
                      Card Subtitle / Weekly Target
                    </label>
                    <input
                      type="text"
                      value={edclubSubtitle}
                      onChange={(e) => setEdclubSubtitle(e.target.value)}
                      placeholder="Touch Typing Foundations • Home Row & Punctuation"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-900/80 bg-slate-950 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-indigo-900/60 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingEdclub(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdclub}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-indigo-600/30"
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

      {/* ========================================================================= */}
      {/* SUPER ADMIN INTERACTIVE RECHARTS ANALYTICS WIDGET */}
      {/* ========================================================================= */}
      <AdminAnalyticsWidget
        studentsData={studentsData}
        usersData={usersData}
        activityLogsData={activityLogsData}
        resourcesData={resourcesData}
        examsData={examsData}
        onRefresh={() => fetchDashboardData(true)}
        isLoading={refreshing}
      />

      {/* Secondary Graphs: Inquiries & User Role Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            <Link to="/admin/inquiries" className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline">
              View All &rarr;
            </Link>
          </div>

          <div className="h-[280px] w-full mt-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">Loading inquiry metrics...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataInquiries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                      borderRadius: '12px', 
                      border: '1px solid rgba(255, 255, 255, 0.1)', 
                      color: '#fff',
                      backdropFilter: 'blur(10px)'
                    }} 
                  />
                  <Bar dataKey="value" name="Inquiries" fill="#0284c7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        
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
            <Link to="/admin/users" className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline">
              Manage RBAC &rarr;
            </Link>
          </div>

          <div className="h-[280px] w-full mt-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">Loading user roles...</div>
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
                      backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                      borderRadius: '12px', 
                      border: '1px solid rgba(255, 255, 255, 0.1)', 
                      color: '#fff',
                      backdropFilter: 'blur(10px)'
                    }} 
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

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
