import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Award, Building2, BookOpen, Calendar, ChevronDown, ChevronRight, Copy, CreditCard, ExternalLink, Eye, Key, Link2, Loader2, Search, Users, X, ArrowRight, CheckCircle2, AlertCircle, BarChart3, Clock } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import SEO from '../../components/ui/SEO';
import ResourceLibrary from './ResourceLibrary';
import SchoolClassScheduleTimeline from '../../components/portal/SchoolClassScheduleTimeline';
import { auth, db } from '../../lib/firebase';
import { formatNormalizedClassDisplay } from '../../lib/classes';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';

export type SchoolDashboardTab = 'overview' | 'roster' | 'exams' | 'passcodes' | 'resources' | 'links' | 'schedules' | 'partnership';
export interface SchoolDashboardProps { initialTab?: SchoolDashboardTab; }
type SchoolRecord = { 
  id: string; 
  name?: string; 
  plan?: string; 
  coordinator?: string; 
  labDays?: string; 
  email?: string; 
  status?: string; 
  billing?: { 
    baseAmount?: number; 
    cycle?: string; 
    mode?: string; 
    status?: string; 
    nextDueDate?: string; 
    notes?: string; 
    allowedModes?: string[]; 
    lastReminderSentAt?: string; 
  };
  programs?: any[];
};
type Passcode = { id: string; classLevel: string; subject?: string; examTitle: string; passcode: string; isActive: boolean; validUntil?: string; invigilatorName?: string; allocatedCadetsCount?: number; };
type Exam = { id: string; title: string; subject?: string; term?: string; duration?: string; link?: string; url?: string; fileUrl?: string; status?: string; date?: string; targetClass?: string; description?: string; passcodeProtected?: boolean; };
type SchoolLink = { id: string; title: string; url: string; description?: string; };
type ClassSchedule = { id:string; date:string; startTime:string; endTime:string; classLevel:string; title:string; tutorName?:string; status:string; };

const jsonFetch = async <T,>(url: string): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Your session has expired. Please sign in again.');
  const token = await user.getIdToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Unable to complete the request.');
  return result as T;
};

const getEmbeddableUrl = (url: string) => {
  if (!url) return '';
  const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  if (gdMatch) return `https://docs.google.com/viewer?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${gdMatch[1]}`)}&embedded=true`;
  const gdOpen = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (gdOpen) return `https://drive.google.com/file/d/${gdOpen[1]}/preview`;
  if (url.includes('dropbox.com') && !url.includes('dropboxusercontent.com')) return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
  if (url.includes('1drv.ms') || url.includes('onedrive.live.com')) return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  return url;
};

const SchoolDashboard: React.FC<SchoolDashboardProps> = ({ initialTab }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const effective = getEffectiveAuth();
  const [tab, setTab] = useState<SchoolDashboardTab>(initialTab || 'overview');
  const [school, setSchool] = useState<SchoolRecord | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [studentBreakdowns, setStudentBreakdowns] = useState<Array<{ className: string; tracks: string[]; active: boolean }>>([]);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [passcodes, setPasscodes] = useState<Passcode[]>([]);
  const [classSchedules, setClassSchedules] = useState<ClassSchedule[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [links, setLinks] = useState<SchoolLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reader, setReader] = useState<{ url: string; title: string } | null>(null);
  const [readerLoading, setReaderLoading] = useState(true);
  const [passcodeForm, setPasscodeForm] = useState<Partial<Passcode> | null>(null);

  const resolvedTab = useCallback((): SchoolDashboardTab => {
    if (initialTab) return initialTab === 'passcodes' ? 'overview' : initialTab;
    const path = location.pathname.toLowerCase();
    if (path.includes('/roster')) return 'roster';
    if (path.includes('/exams')) return 'exams';
    if (path.includes('/passcodes')) return 'overview';
    if (path.includes('/resources')) return 'resources';
    if (path.includes('/links')) return 'links';
    if (path.includes('/schedules')) return 'schedules';
    if (path.includes('/partnership')) return 'partnership';
    const requested = searchParams.get('tab') as SchoolDashboardTab;
    return ['overview','roster','exams','resources','links','schedules','partnership'].includes(requested) ? requested : 'overview';
  }, [initialTab, location.pathname, searchParams]);

  useEffect(() => {
    const nextTab = resolvedTab();
    setTab(prev => (prev !== nextTab ? nextTab : prev));
  }, [resolvedTab]);
  const changeTab = (next: SchoolDashboardTab) => { setTab(next); navigate(next === 'overview' ? '/portal/school' : `/portal/school/${next}`); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const effective = getEffectiveAuth();
      if (!auth.currentUser && !effective.isMasquerading) throw new Error('Authentication required.');

      let schoolId = effective.effectiveSchoolId || sessionStorage.getItem('schoolId') || '';
      let schoolRecordData: SchoolRecord | null = null;

      // 1. If we have a direct schoolId, check schools collection
      if (schoolId) {
        try {
          const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
          if (schoolSnap.exists()) {
            schoolRecordData = { ...(schoolSnap.data() as Omit<SchoolRecord, 'id'>), id: schoolSnap.id };
          }
        } catch (e) {
          console.warn('Direct school lookup error:', e);
        }
      }

      // 2. If not found, check by effective UID in users collection
      if (!schoolRecordData && effective.effectiveUid) {
        try {
          const userSnap = await getDoc(doc(db, 'users', effective.effectiveUid));
          if (userSnap.exists()) {
            const uData = userSnap.data();
            const sId = String(uData.schoolId || '').trim();
            if (sId) {
              schoolId = sId;
              const schoolSnap = await getDoc(doc(db, 'schools', sId));
              if (schoolSnap.exists()) {
                schoolRecordData = { ...(schoolSnap.data() as Omit<SchoolRecord, 'id'>), id: schoolSnap.id };
              }
            }
          }
        } catch (e) {
          console.warn('User profile school lookup error:', e);
        }
      }

      // 3. If still not found, find in schools collection by matching ID, schoolCode, email, contactEmail, adminUid, firebaseUid, userId, or email prefix
      if (!schoolRecordData) {
        try {
          const schoolsSnap = await getDocs(collection(db, 'schools'));
          const emailLower = String(effective.effectiveEmail || auth.currentUser?.email || '').toLowerCase().trim();
          const emailPrefix = emailLower.split('@')[0].replace(/student(s)?|explorer|lily/g, '').trim();
          const found = schoolsSnap.docs.find(d => {
            const sd = d.data();
            const docIdLower = d.id.toLowerCase();
            return (
              d.id === schoolId ||
              d.id === effective.effectiveUid ||
              String(sd.schoolId || '').trim() === schoolId ||
              String(sd.schoolCode || '').trim() === schoolId ||
              (emailLower && String(sd.email || '').toLowerCase().trim() === emailLower) ||
              (emailLower && String(sd.contactEmail || '').toLowerCase().trim() === emailLower) ||
              sd.firebaseUid === effective.effectiveUid ||
              sd.adminUid === effective.effectiveUid ||
              sd.userId === effective.effectiveUid ||
              (emailLower && emailLower.startsWith(docIdLower)) ||
              (emailPrefix.length >= 4 && docIdLower.includes(emailPrefix))
            );
          });
          if (found) {
            schoolId = found.id;
            schoolRecordData = { ...(found.data() as Omit<SchoolRecord, 'id'>), id: found.id };
          }
        } catch (e) {
          console.warn('Schools collection lookup error:', e);
        }
      }

      if (!schoolRecordData) {
        // Fallback default record if masquerading or previewing
        const cachedName = sessionStorage.getItem('schoolName') || localStorage.getItem('jaystar_cached_school_name');
        schoolRecordData = {
          id: schoolId || 'school-default',
          name: effective.effectiveName || cachedName || 'Partner School Institution',
          plan: 'Institutional Partner Plan',
          coordinator: 'School Administrator',
          labDays: 'Mon - Fri'
        };
      }

      if (schoolRecordData.name && !['School Portal', 'school-default', 'Partner School Institution'].includes(schoolRecordData.name)) {
        sessionStorage.setItem('schoolName', schoolRecordData.name);
        localStorage.setItem('jaystar_cached_school_name', schoolRecordData.name);
      }

      setSchool(schoolRecordData);
      const activeSchoolId = schoolRecordData.id;
      if (activeSchoolId && activeSchoolId !== 'school-default') {
        sessionStorage.setItem('schoolId', activeSchoolId);
        localStorage.setItem('jaystar_cached_school_id', activeSchoolId);
      }

      // Collect all verified school ID aliases and names for this institution
      const validSchoolIds = new Set<string>();
      if (activeSchoolId) validSchoolIds.add(activeSchoolId);
      if (schoolRecordData.id) validSchoolIds.add(schoolRecordData.id);
      if ((schoolRecordData as any).schoolId) validSchoolIds.add(String((schoolRecordData as any).schoolId).trim());
      if ((schoolRecordData as any).schoolCode) validSchoolIds.add(String((schoolRecordData as any).schoolCode).trim());
      if ((schoolRecordData as any).adminUid) validSchoolIds.add(String((schoolRecordData as any).adminUid).trim());
      if ((schoolRecordData as any).userId) validSchoolIds.add(String((schoolRecordData as any).userId).trim());
      if (effective.effectiveSchoolId) validSchoolIds.add(effective.effectiveSchoolId);
      const cachedSchoolId = sessionStorage.getItem('schoolId') || localStorage.getItem('jaystar_cached_school_id');
      if (cachedSchoolId) validSchoolIds.add(cachedSchoolId);

      let fetchedStudentCount = 0;
      const breakdownMap = new Map<string, { className: string; tracks: string[]; active: boolean }>();
      const breakdownSeenKeys = new Set<string>();

      const recordStudentBreakdown = (canonicalId: string, data: Record<string, any>) => {
        const uname = String(data.username || '').toLowerCase().trim();
        const email = String(data.email || '').toLowerCase().trim();
        const uid = String(data.firebaseUid || data.userId || '').trim();
        const name = String(data.fullName || data.studentName || data.name || '').toLowerCase().trim();

        if (
          (canonicalId && breakdownSeenKeys.has(`id:${canonicalId}`)) ||
          (uid && breakdownSeenKeys.has(`uid:${uid}`)) ||
          (uname && breakdownSeenKeys.has(`u:${uname}`)) ||
          (email && !email.endsWith('.local') && breakdownSeenKeys.has(`e:${email}`)) ||
          (name && name !== 'student' && breakdownSeenKeys.has(`name:${name}`))
        ) {
          return false;
        }
        if (canonicalId) breakdownSeenKeys.add(`id:${canonicalId}`);
        if (uid) breakdownSeenKeys.add(`uid:${uid}`);
        if (uname) breakdownSeenKeys.add(`u:${uname}`);
        if (email && !email.endsWith('.local')) breakdownSeenKeys.add(`e:${email}`);
        if (name && name !== 'student') breakdownSeenKeys.add(`name:${name}`);

        const className = formatNormalizedClassDisplay(data.class || data.grade || data.classLevel, 'Unassigned');
        const rawTracks = Array.isArray(data.enrolledPrograms) && data.enrolledPrograms.length > 0
          ? data.enrolledPrograms
          : Array.isArray(data.subjects) && data.subjects.length > 0
          ? data.subjects
          : data.track || data.programName || data.plan
          ? String(data.track || data.programName || data.plan).split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
        const tracks = rawTracks.map((t: any) => String(t || '').trim()).filter(Boolean);
        const active = data.portalAccessEnabled !== false && String(data.accountStatus || data.status || 'ACTIVE').toUpperCase() === 'ACTIVE';

        breakdownMap.set(canonicalId || `row-${breakdownMap.size}`, { className, tracks, active });
        return true;
      };

      // Try server-side scoped endpoint first
      try {
        if (!effective.isMasquerading) {
          const studentsResult = await jsonFetch<{ count: number; schoolName?: string; students?: any[] }>(
            '/.netlify/functions/school-students' + (activeSchoolId ? `?schoolId=${encodeURIComponent(activeSchoolId)}` : '')
          );
          fetchedStudentCount = Number(studentsResult.count || studentsResult.students?.length || 0);
          if (Array.isArray(studentsResult.students)) {
            studentsResult.students.forEach((s: any, idx: number) => {
              const cid = String(s.id || s.studentId || `srv-${idx}`).trim();
              recordStudentBreakdown(cid, s);
            });
          }
          if (studentsResult.schoolName && studentsResult.schoolName !== 'School Portal') {
            sessionStorage.setItem('schoolName', studentsResult.schoolName);
            setSchool(prev => prev ? { ...prev, name: studentsResult.schoolName } : prev);
          }
        }
      } catch (backendErr) {
        console.warn('Backend student count fetch notice:', backendErr);
      }

      // Always verify with direct Firestore query across multi-alias matching so count matches SchoolRoster
      try {
        const targetIdsList = Array.from(validSchoolIds).filter(Boolean);
        const queries: Promise<{ collName: string; docs: any[] }>[] = [];

        targetIdsList.forEach(sId => {
          queries.push(getDocs(query(collection(db, 'individualStudents'), where('schoolId', '==', sId))).then(s => ({ collName: 'individualStudents', docs: s.docs })).catch(() => ({ collName: 'individualStudents', docs: [] })));
          queries.push(getDocs(query(collection(db, 'students'), where('schoolId', '==', sId))).then(s => ({ collName: 'students', docs: s.docs })).catch(() => ({ collName: 'students', docs: [] })));
          queries.push(getDocs(query(collection(db, 'users'), where('schoolId', '==', sId))).then(s => ({ collName: 'users', docs: s.docs })).catch(() => ({ collName: 'users', docs: [] })));
        });

        const cleanSchoolName = String(schoolRecordData.name || '').trim();
        if (cleanSchoolName && !['School Portal', 'school-default', 'Partner School Institution'].includes(cleanSchoolName)) {
          queries.push(getDocs(query(collection(db, 'individualStudents'), where('schoolName', '==', cleanSchoolName))).then(s => ({ collName: 'individualStudents', docs: s.docs })).catch(() => ({ collName: 'individualStudents', docs: [] })));
          queries.push(getDocs(query(collection(db, 'students'), where('schoolName', '==', cleanSchoolName))).then(s => ({ collName: 'students', docs: s.docs })).catch(() => ({ collName: 'students', docs: [] })));
          queries.push(getDocs(query(collection(db, 'users'), where('schoolName', '==', cleanSchoolName))).then(s => ({ collName: 'users', docs: s.docs })).catch(() => ({ collName: 'users', docs: [] })));
        }

        const querySnapshots = await Promise.all(queries);

        querySnapshots.forEach(({ collName, docs }) => {
          docs.forEach((d: any) => {
            const data = d.data();
            const role = String(data.role || '').toUpperCase();
            if (['SCHOOL', 'SCHOOL_ADMIN', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'TUTOR', 'INSTRUCTOR', 'PARENT'].includes(role)) {
              return;
            }
            if (collName === 'users' && !['STUDENT', 'SCHOLAR', 'CADET', 'INDIVIDUAL_STUDENT'].includes(role) && !data.isStudent) {
              return;
            }
            const sId = String(data.schoolId || data.school_id || data.schoolDocId || '').trim();
            const sName = String(data.schoolName || data.school || '').trim().toLowerCase();
            const isMatch = (sId && validSchoolIds.has(sId)) || (cleanSchoolName && sName === cleanSchoolName.toLowerCase());
            if (!isMatch) return;

            const canonicalId = String((collName === 'users' && data.studentDocId) ? data.studentDocId : d.id).trim();
            recordStudentBreakdown(canonicalId, data);
          });
        });

        if (breakdownMap.size > fetchedStudentCount) {
          fetchedStudentCount = breakdownMap.size;
        }
      } catch (fsErr) {
        console.warn('Firestore fallback student count error:', fsErr);
      }
      setStudentBreakdowns(Array.from(breakdownMap.values()));

      try {
        const scheduleResult = await jsonFetch<{ schedules: ClassSchedule[] }>('/.netlify/functions/class-schedules');
        if (Array.isArray(scheduleResult.schedules) && scheduleResult.schedules.length > 0) {
          setClassSchedules(scheduleResult.schedules);
        } else {
          throw new Error('Empty from server, try Firestore query');
        }
      } catch {
        const [schedSnap, nameSnap] = await Promise.all([
          getDocs(query(collection(db, 'classSchedules'), where('schoolId', '==', activeSchoolId))).catch(() => ({ docs: [] })),
          schoolRecordData.name ? getDocs(query(collection(db, 'classSchedules'), where('schoolName', '==', schoolRecordData.name))).catch(() => ({ docs: [] })) : Promise.resolve({ docs: [] })
        ]);
        const schedMap = new Map<string, ClassSchedule>();
        schedSnap.docs.forEach(d => schedMap.set(d.id, { id: d.id, ...d.data() } as ClassSchedule));
        nameSnap.docs.forEach(d => {
          if (!schedMap.has(d.id)) schedMap.set(d.id, { id: d.id, ...d.data() } as ClassSchedule);
        });
        setClassSchedules(Array.from(schedMap.values()));
      }

      const [examSnap, linkSnap, passSnap] = await Promise.all([
        getDocs(query(collection(db, 'schoolExams'), where('schoolId', '==', activeSchoolId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'schoolLinks'), where('schoolId', '==', activeSchoolId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'schoolPasscodes'), where('schoolId', '==', activeSchoolId))).catch(() => ({ docs: [] })),
      ]);
      setStudentCount(fetchedStudentCount);
      setExams(examSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Exam,'id'>) })));
      setLinks(linkSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<SchoolLink,'id'>) })));
      setPasscodes(passSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Passcode,'id'>) })));
    } catch (error) {
      setSchool(null); setStudentCount(0); setStudentBreakdowns([]); setExams([]); setLinks([]); setPasscodes([]); setClassSchedules([]);
      toast.error(error instanceof Error ? error.message : 'Unable to load school operations.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const classDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    studentBreakdowns.forEach(s => {
      counts.set(s.className, (counts.get(s.className) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([className, learners]) => ({ className, learners }))
      .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));
  }, [studentBreakdowns]);

  const programmeDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    const activeProgs = (Array.isArray(school?.programs) ? school.programs : []).filter((p: any) => p.status !== 'COMPLETED' && p.status !== 'HISTORICAL');
    const fallbackProg = activeProgs[0]?.name || '';
    studentBreakdowns.forEach(s => {
      const list = s.tracks.length > 0 ? s.tracks : fallbackProg ? [fallbackProg] : [];
      list.forEach(track => {
        counts.set(track, (counts.get(track) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([programme, learners]) => ({ programme, learners }))
      .sort((a, b) => b.learners - a.learners)
      .slice(0, 8);
  }, [studentBreakdowns, school?.programs]);

  const upcomingSessionsPreview = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return classSchedules
      .filter(s => s.date >= todayStr && s.status !== 'CANCELLED' && s.status !== 'COMPLETED')
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
      .slice(0, 4);
  }, [classSchedules]);

  const activeProgramsCount = useMemo(() => {
    const programsList: any[] = Array.isArray(school?.programs) ? school.programs : [];
    return programsList.filter(p => p.status !== 'COMPLETED' && p.status !== 'HISTORICAL').length;
  }, [school?.programs]);

  const filteredExams = useMemo(() => { const q = search.trim().toLowerCase(); return q ? exams.filter(e => [e.title,e.subject,e.term,e.targetClass].some(v => String(v || '').toLowerCase().includes(q))) : exams; }, [exams, search]);
  const filteredLinks = useMemo(() => { const q = search.trim().toLowerCase(); return q ? links.filter(l => [l.title,l.description,l.url].some(v => String(v || '').toLowerCase().includes(q))) : links; }, [links, search]);
  const openReader = (url: string, title: string) => { if (!url) return toast.error('No preview URL is available.'); setReader({ url, title }); setReaderLoading(true); };
  const generatePasscode = () => { const bytes = new Uint32Array(2); crypto.getRandomValues(bytes); return `EXAM-${String(bytes[0] % 1000).padStart(3,'0')}-${String(bytes[1] % 1000).padStart(3,'0')}`; };

  const savePasscode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passcodeForm?.examTitle?.trim() || !passcodeForm.passcode?.trim() || !school?.id) { toast.error('Exam title and passcode are required.'); return; }
    const id = passcodeForm.id || `pc-${Date.now()}`;
    const payload = { classLevel: passcodeForm.classLevel || '', subject: passcodeForm.subject || '', examTitle: passcodeForm.examTitle.trim(), passcode: passcodeForm.passcode.trim().toUpperCase(), isActive: passcodeForm.isActive !== false, validUntil: passcodeForm.validUntil || '', invigilatorName: passcodeForm.invigilatorName || '', allocatedCadetsCount: passcodeForm.allocatedCadetsCount || studentCount, schoolId: school.id, updatedAt: serverTimestamp() };
    try {
      await setDoc(doc(db, 'schoolPasscodes', id), payload, { merge: true });
      const next = { id, ...payload } as Passcode;
      setPasscodes(prev => prev.some(p => p.id === id) ? prev.map(p => p.id === id ? next : p) : [next, ...prev]);
      setPasscodeForm(null); toast.success('Exam passcode saved.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save passcode.'); }
  };
  const togglePasscode = async (passcode: Passcode) => {
    try { await setDoc(doc(db, 'schoolPasscodes', passcode.id), { isActive: !passcode.isActive, updatedAt: serverTimestamp() }, { merge: true }); setPasscodes(prev => prev.map(p => p.id === passcode.id ? { ...p, isActive: !p.isActive } : p)); toast.success(passcode.isActive ? 'Passcode deactivated.' : 'Passcode activated.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update passcode.'); }
  };

  if (loading) return <div className="min-h-[360px] flex items-center justify-center gap-3 text-sm text-slate-500"><Loader2 className="animate-spin" size={22}/> Loading secure school operations…</div>;
  const schoolName = school?.name || 'School Portal';

  const billingStatusLabel = String(school?.billing?.status || 'ACTIVE PARTNERSHIP').replace(/_/g, ' ');
  const isBillingAttention = ['OVERDUE', 'DUE', 'UNPAID'].includes(String(school?.billing?.status || '').toUpperCase());

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <SEO title={`School Operations | ${schoolName}`} description="Secure school operations workspace." noindex />

      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Concise institutional heading & quick actions */}
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#B91C1C]">
                Partner Institution Portal
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-[#1E293B] dark:text-white tracking-tight mt-0.5">
                {schoolName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Coordinator: {school?.coordinator || 'School Administrator'} · Lab Days: {school?.labDays || 'Scheduled weekly'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/portal/school/roster')}
                className="min-h-9 px-3.5 rounded-lg bg-[#1E293B] hover:bg-[#14284B] dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Users size={14} /> Open Roster
              </button>
              <button
                type="button"
                onClick={() => changeTab('schedules')}
                className="min-h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#1E293B] dark:hover:border-slate-500 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Calendar size={14} className="text-[#B91C1C]" /> Class Timetable
              </button>
              <button
                type="button"
                onClick={() => changeTab('partnership')}
                className="min-h-9 px-3.5 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CreditCard size={14} /> Invoices &amp; Billing
              </button>
            </div>
          </header>

          {/* Compact divided metrics summary strip */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Onboarded Learners</p>
              <p className="mt-1 text-2xl font-bold text-[#1E293B] dark:text-white tabular-nums">{studentCount}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Verified for this school</p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Programmes</p>
              <p className="mt-1 text-2xl font-bold text-[#B91C1C] dark:text-red-400 tabular-nums">{activeProgramsCount}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Curriculum tracks running</p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Upcoming Sessions</p>
              <p className="mt-1 text-2xl font-bold text-[#1E293B] dark:text-white tabular-nums">{upcomingSessionsPreview.length}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Scheduled next slots</p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Account Billing</p>
              <p className={`mt-1 text-base font-bold inline-flex items-center gap-1.5 ${isBillingAttention ? 'text-[#B91C1C] dark:text-red-400' : 'text-[#1E293B] dark:text-white'}`}>
                {isBillingAttention ? <AlertCircle size={15} /> : <CheckCircle2 size={15} className="text-[#1E293B] dark:text-slate-300" />}
                <span>{billingStatusLabel}</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Institutional account</p>
            </div>
          </section>

          {/* School-scoped analytical visualizations */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                    <BarChart3 size={16} className="text-[#B91C1C]" />
                    <span>Learners per Class Cohort</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Distribution of your school&apos;s enrolled students across class levels.
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  {classDistribution.length} classes
                </span>
              </div>

              {classDistribution.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center px-4">
                  <Users size={22} className="text-slate-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No class breakdown available yet</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Class metrics appear automatically as students are onboarded into your roster.
                  </p>
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classDistribution} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" strokeOpacity={0.6} />
                      <XAxis dataKey="className" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', fontSize: '12px' }}
                        itemStyle={{ color: '#F8FAFC' }}
                        formatter={(val: any) => [`${val} learners`, 'Cohort Size']}
                      />
                      <Bar dataKey="learners" name="Learners" fill="#1E293B" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                    <BookOpen size={16} className="text-[#B91C1C]" />
                    <span>Programme Track Distribution</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Active learner participation by assigned curriculum track.
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  {programmeDistribution.length} tracks
                </span>
              </div>

              {programmeDistribution.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center px-4">
                  <BookOpen size={22} className="text-slate-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No programme allocations recorded yet</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Assign students to curriculum tracks in the roster to view programme distribution.
                  </p>
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={programmeDistribution} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" strokeOpacity={0.6} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} />
                      <YAxis type="category" dataKey="programme" width={130} tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', fontSize: '12px' }}
                        itemStyle={{ color: '#F8FAFC' }}
                        formatter={(val: any) => [`${val} learners`, 'Assigned']}
                      />
                      <Bar dataKey="learners" name="Learners" fill="#B91C1C" radius={[0, 4, 4, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>

          {/* Two-column operational workspace: Navigation directory + Next Scheduled Classes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                  <Building2 size={15} className="text-[#B91C1C]" />
                  <span>School Operations Directory</span>
                </h2>
                <span className="text-[11px] text-slate-500">Workspaces</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  { id: 'roster' as SchoolDashboardTab, title: 'Student Roster & Access', description: 'Manage enrolled learners, class assignments, and portal access codes.', Icon: Users },
                  { id: 'schedules' as SchoolDashboardTab, title: 'Class Schedules & Faculty', description: 'Inspect daily cohort timetables, assigned tutors, and session records.', Icon: Calendar },
                  { id: 'resources' as SchoolDashboardTab, title: 'School Learning Resources', description: 'Access curriculum workbooks, slides, and approved portals.', Icon: BookOpen },
                  { id: 'partnership' as SchoolDashboardTab, title: 'Programmes & Institutional Billing', description: 'Review subscribed tracks, fee calculations, and invoice settlements.', Icon: CreditCard }
                ].map(({ id, title, description, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => (id === 'roster' ? navigate('/portal/school/roster') : changeTab(id))}
                    className="w-full px-5 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Icon size={16} className="text-[#B91C1C] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#1E293B] dark:text-white">{title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
                      </div>
                    </div>
                    <ChevronRight size={15} className="text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </section>

            <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                  <Clock size={15} className="text-[#B91C1C]" />
                  <span>Next Scheduled Sessions</span>
                </h2>
                <button
                  type="button"
                  onClick={() => changeTab('schedules')}
                  className="text-xs font-semibold text-[#B91C1C] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  Full Timetable <ArrowRight size={12} />
                </button>
              </div>
              {upcomingSessionsPreview.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No upcoming class sessions currently scheduled for this school.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {upcomingSessionsPreview.map(sess => (
                    <div key={sess.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#1E293B] dark:text-white truncate">{sess.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {sess.classLevel || 'All Classes'} · {sess.tutorName || 'Assigned Faculty'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-[#B91C1C] tabular-nums">{sess.date}</p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">{sess.startTime} – {sess.endTime}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'roster' && (
        <div className="bg-white dark:bg-[#111827] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight">Student Roster</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Roster management and student credentials reside in the dedicated secure student operations workspace.</p>
          <button onClick={() => navigate('/portal/school/roster')} className="mt-4 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer">
            <Users size={14}/> Open Secure Roster <ChevronRight size={14}/>
          </button>
        </div>
      )}

      {tab === 'exams' && (
        <div className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
                <Award size={18} className="text-[#B91C1C]"/> CBT Assessments ({filteredExams.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Only assessments scoped to your institution are listed. Select any row to inspect details.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, subject, class..." className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 pl-9 pr-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"/>
            </div>
          </div>

          {filteredExams.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No school assessments found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExams.map(exam => {
                const url = exam.link || exam.url || exam.fileUrl || '';
                const isExpanded = expandedExamId === exam.id;
                const statusStr = String(exam.status || 'SCHEDULED').toUpperCase();
                return (
                  <div key={exam.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedExamId(isExpanded ? null : exam.id);
                        }
                      }}
                      className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]"
                    >
                      <div className="min-w-0 flex items-start gap-2.5">
                        <span className="mt-0.5 text-slate-400">
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            <h3 className="text-xs sm:text-sm font-bold text-[#1E293B] dark:text-white truncate">{exam.title}</h3>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${statusStr === 'ACTIVE' || statusStr === 'LIVE' ? 'text-[#B91C1C]' : 'text-[#1E293B] dark:text-slate-300'}`}>
                              <CheckCircle2 size={11} /> {statusStr}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Subject: {exam.subject || 'General'} · Class: {exam.targetClass || 'All eligible learners'} · Duration: <span className="tabular-nums">{exam.duration || 'Not set'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pl-6 lg:pl-0 shrink-0" onClick={e => e.stopPropagation()}>
                        {url && (
                          <button
                            type="button"
                            onClick={() => openReader(url, exam.title)}
                            className="min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Eye size={13}/> Preview
                          </button>
                        )}
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-8 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white px-3 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <ExternalLink size={13}/> Launch
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">No external link</span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 py-3.5 pl-11 bg-slate-50/70 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                        {exam.description && <p>{exam.description}</p>}
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>Term: <strong className="text-slate-800 dark:text-slate-200">{exam.term || 'Current Term'}</strong></span>
                          <span>Scheduled Date: <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{exam.date || 'Flexible'}</strong></span>
                          <span>Passcode Required: <strong className="text-slate-800 dark:text-slate-200">{exam.passcodeProtected ? 'Yes' : 'No'}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'passcodes' && (
        <div className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
                <Key size={18} className="text-[#B91C1C]"/> Assessment Passcodes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Assessment keys for CBT invigilation.</p>
            </div>
            <button onClick={() => setPasscodeForm({ classLevel: '', subject: '', examTitle: '', passcode: generatePasscode(), isActive: true, validUntil: '' })} className="min-h-9 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
              <Key size={14}/> New Passcode
            </button>
          </div>

          {passcodes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No assessment passcodes configured.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {passcodes.map(pc => (
                <div key={pc.id} className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 items-center text-xs">
                      <span className="font-bold text-[#B91C1C]">{pc.classLevel || 'All Classes'}</span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-semibold text-[#1E293B] dark:text-slate-200">{pc.subject || 'General'}</span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${pc.isActive ? 'text-[#1E293B] dark:text-slate-200' : 'text-slate-500'}`}>
                        {pc.isActive ? <CheckCircle2 size={12} className="text-[#1E293B] dark:text-slate-300" /> : <AlertCircle size={12} className="text-[#B91C1C]" />}
                        {pc.isActive ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-[#1E293B] dark:text-white mt-1">{pc.examTitle}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Valid: {pc.validUntil || 'Not configured'} · Invigilator: {pc.invigilatorName || 'School'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-mono font-bold text-xs text-[#1E293B] dark:text-white">{pc.passcode}</code>
                    <button onClick={() => { navigator.clipboard.writeText(pc.passcode); toast.success('Exam passcode copied.'); }} className="min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 cursor-pointer">
                      <Copy size={12}/> Copy
                    </button>
                    <button onClick={() => void togglePasscode(pc)} className="min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                      {pc.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'resources' && (
        <div id="school-resources-workspace" className="space-y-4">
          <ResourceLibrary role="school" />
        </div>
      )}

      {tab === 'links' && (
        <div id="school-links-section" className="bg-white dark:bg-[#111827] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
                <Link2 size={18} className="text-[#B91C1C]"/> School Links &amp; Educational Portals
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Quick access to institutional platforms, portals, and materials restricted to your school.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search links..." className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-800 pl-9 pr-3 text-xs bg-white dark:bg-slate-900"/>
            </div>
          </div>

          {filteredLinks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500">
              No school links found matching your search.
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/40">
              {filteredLinks.map(link => (
                <div key={link.id} className="p-3.5 sm:p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link2 size={16} className="text-[#B91C1C] shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-[#1E293B] dark:text-white truncate">{link.title}</h3>
                      <p className="text-[11px] text-slate-500 truncate max-w-xl">{link.description || link.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button onClick={() => openReader(link.url, link.title)} className="min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                      <Eye size={12}/> Preview
                    </button>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-h-8 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white px-3 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors">
                      <ExternalLink size={12}/> Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'schedules' && (
        <SchoolClassScheduleTimeline
          schoolId={school?.id || ''}
          schoolName={schoolName}
          programs={school?.programs || []}
          schedules={classSchedules as any}
          onRefresh={() => void load()}
          readOnly={false}
        />
      )}

      {tab === 'partnership' && (
        <div className="bg-white dark:bg-[#111827] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
                <CreditCard size={18} className="text-[#B91C1C]"/> Institutional Subscription &amp; Fees
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Admin-configured institutional curriculum billing and payment schedule.</p>
            </div>
            {effective.isMasquerading ? (
              <div className="px-3.5 py-2 rounded-lg bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-[#B91C1C] dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={14} />
                <span>Payment execution disabled during Impersonation Mode</span>
              </div>
            ) : (
              <button
                onClick={() => navigate('/portal/school/payments')}
                className="px-4 py-2 rounded-lg bg-[#1E293B] hover:bg-[#14284B] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CreditCard size={14}/> Complete Payment / Invoices
              </button>
            )}
          </div>

          {(() => {
            const activePrograms: any[] = (Array.isArray(school?.programs) ? school.programs : [])
              .filter((p: any) => p.status !== 'COMPLETED' && p.status !== 'HISTORICAL');

            const progsWithFee = activePrograms.map((p: any) => {
              let fee = 0;
              let calculationNote = '';
              if (p.billingModel === 'per_head') {
                const adj = Number(p.studentAdjustment || 0);
                const net = Math.max(0, studentCount + adj);
                const rate = Number(p.amountPerHead || 0);
                fee = net * rate;
                calculationNote = `${net} learners × ₦${rate.toLocaleString()}`;
              } else {
                fee = Number(p.baseFee ?? p.fee ?? p.amount ?? 0);
                calculationNote = 'Fixed Package';
              }
              return { ...p, computedFee: fee, calculationNote };
            });

            const totalInvoiceAmount = progsWithFee.reduce((sum: number, p: any) => sum + p.computedFee, 0) || Number(school?.billing?.baseAmount || 0);
            const earliestDue = progsWithFee.find((p: any) => p.nextBillingDueDate)?.nextBillingDueDate || school?.billing?.nextDueDate;

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="rounded-xl bg-[#1E293B] text-white p-5 sm:p-6 border border-slate-800 space-y-4 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-widest font-semibold text-slate-300">Active Curriculum Tracks</span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${
                      isBillingAttention ? 'text-red-300' : 'text-slate-200'
                    }`}>
                      {isBillingAttention ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                      {billingStatusLabel}
                    </span>
                  </div>

                  {progsWithFee.length === 0 ? (
                    <div>
                      <h3 className="text-base font-bold text-white">{school?.plan || 'General Technology Curriculum'}</h3>
                      <p className="text-xs text-slate-300 mt-1">Covers hands-on computer science lab instructions, STEM curriculum kits, and learner CBT assessment portals.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800 border-t border-b border-slate-800">
                      {progsWithFee.map((p: any, idx: number) => (
                        <div key={p.id || idx} className="py-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-bold text-white">{p.name}</span>
                              <span className="text-slate-500">·</span>
                              <span className="text-[11px] font-semibold uppercase text-red-300">
                                {p.billingModel === 'per_head' ? 'Per-Head' : 'Package'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                              {p.calculationNote} {p.level ? `· ${p.level}` : ''}
                            </p>
                          </div>
                          <span className="text-sm font-bold font-mono tabular-nums text-white shrink-0">
                            ₦{p.computedFee.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {school?.billing?.notes && (
                    <div className="text-[11px] text-slate-300 bg-slate-900/70 p-3 rounded-lg border border-slate-700">
                      <strong className="text-white">Administrative Note:</strong> {school.billing.notes}
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-[#F8FAFC] dark:bg-slate-900/60 p-5 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Total Invoiced Amount</span>
                    <div className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white font-mono tabular-nums mt-1">
                      ₦{totalInvoiceAmount.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 space-y-1.5 pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex justify-between">
                        <span>Billing Cycle:</span>
                        <span className="font-semibold text-[#1E293B] dark:text-slate-300 capitalize">{school?.billing?.cycle || 'Termly'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Default Mode:</span>
                        <span className="font-semibold text-[#1E293B] dark:text-slate-300 capitalize">
                          {(school?.billing?.mode || 'advance_termly').replace(/_/g, ' ')}
                        </span>
                      </div>
                      {earliestDue && (
                        <div className="flex justify-between">
                          <span>Next Due Date:</span>
                          <span className="font-semibold text-[#B91C1C] tabular-nums">
                            {new Date(earliestDue).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {!effective.isMasquerading && (
                    <button
                      onClick={() => navigate('/portal/school/payments')}
                      className="w-full min-h-10 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors mt-2 cursor-pointer"
                    >
                      <CreditCard size={14}/> Pay Tuition &amp; Invoices
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {passcodeForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <form onSubmit={savePasscode} className="w-full max-w-md rounded-2xl bg-white dark:bg-[#161B26] p-5 space-y-3.5 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Create Exam Passcode</h3>
              <button type="button" onClick={() => setPasscodeForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
            </div>
            <input required value={passcodeForm.examTitle||''} onChange={e=>setPasscodeForm(p=>({...p,examTitle:e.target.value}))} placeholder="Assessment title" className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900"/>
            <input required value={passcodeForm.passcode||''} onChange={e=>setPasscodeForm(p=>({...p,passcode:e.target.value.toUpperCase()}))} placeholder="EXAM-123-456" className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs font-mono bg-white dark:bg-slate-900"/>
            <div className="grid grid-cols-2 gap-2.5">
              <input value={passcodeForm.classLevel||''} onChange={e=>setPasscodeForm(p=>({...p,classLevel:e.target.value}))} placeholder="Class level" className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900"/>
              <input value={passcodeForm.subject||''} onChange={e=>setPasscodeForm(p=>({...p,subject:e.target.value}))} placeholder="Subject" className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900"/>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPasscodeForm(null)} className="min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300">Cancel</button>
              <button type="submit" className="min-h-9 rounded-xl bg-brand-red text-white px-4 text-xs font-bold">Save Passcode</button>
            </div>
          </form>
        </div>
      )}

      {reader && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-3 md:p-6 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setReader(null); }}>
          <div className="w-full max-w-5xl h-[88vh] rounded-2xl bg-white dark:bg-[#161B26] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900">
              <div className="min-w-0">
                <h3 className="font-bold text-xs text-slate-900 dark:text-white truncate">{reader.title}</h3>
                <p className="text-[10px] text-slate-500">Secure school document preview</p>
              </div>
              <div className="flex gap-2">
                <a href={reader.url} target="_blank" rel="noopener noreferrer" className="min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <ExternalLink size={12}/> Open
                </a>
                <button onClick={() => setReader(null)} className="min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-slate-600 dark:text-slate-300"><X size={14}/></button>
              </div>
            </div>
            <div className="relative flex-1 bg-slate-950">
              {readerLoading && <div className="absolute inset-0 z-10 flex items-center justify-center text-white text-xs"><Loader2 className="animate-spin mr-2" size={18}/> Loading document...</div>}
              <iframe src={getEmbeddableUrl(reader.url)} title={reader.title} className="w-full h-full border-0 bg-white" onLoad={() => setReaderLoading(false)}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SchoolDashboard;
