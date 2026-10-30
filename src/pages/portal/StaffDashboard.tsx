import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Users,
  FileText,
  Video,
  Clock,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  School,
  CreditCard,
  Calendar,
  ClipboardCheck,
  ExternalLink,
  BookOpenCheck,
  Search,
  GraduationCap,
  KeyRound,
  Flag,
  ClipboardList,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { DashboardGreeting } from '../../components/portal/DashboardGreeting';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';
import { normalizeClassName } from '../../lib/classes';
import {
  fetchAcademicStudentsFallback,
  fetchAcademicSchoolsFallback,
  resolveTutorAssignedContext,
  type AcademicStudentRecord,
} from '../../lib/academicFallback';

const StaffDashboard: React.FC = () => {
  const { toast } = useToast();
  const location = useLocation();
  const rosterSectionRef = useRef<HTMLElement | null>(null);

  const [resources, setResources] = useState<any[]>([]);
  const [students, setStudents] = useState<AcademicStudentRecord[]>([]);
  const [assignedSchools, setAssignedSchools] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedScope, setSelectedScope] = useState<string>('ALL');
  const [rosterCategory, setRosterCategory] = useState<'ALL' | 'SCHOOL' | 'PRIVATE'>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState('');
  const [broadcastTargetType, setBroadcastTargetType] = useState<'STUDENT' | 'SCHOOL'>('STUDENT');
  const [targetSchoolId, setTargetSchoolId] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPlatform, setLinkPlatform] = useState('Google Meet');
  const [meetingTime, setMeetingTime] = useState('');
  const [submittingLink, setSubmittingLink] = useState(false);
  const [successMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchStaffData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const effective = getEffectiveAuth();
      const currentUser = auth.currentUser;
      if (!currentUser && !effective.isMasquerading) return;

      // 1. Fetch Assigned Students, Assigned Schools & Tutor Alias Context concurrently
      const [loadedStudents, loadedSchools, tutorCtx] = await Promise.all([
        fetchAcademicStudentsFallback().catch(() => []),
        fetchAcademicSchoolsFallback().catch(() => []),
        resolveTutorAssignedContext().catch(() => null),
      ]);

      setStudents(loadedStudents);
      setAssignedSchools(loadedSchools);

      // 2. Fetch Curriculum Resources Count
      try {
        const [staffResSnap, generalResSnap, schoolResSnap] = await Promise.all([
          getDocs(collection(db, 'staffGeneralResources')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'resources')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'schoolResources')).catch(() => ({ docs: [] })),
        ]);
        const combined = [
          ...staffResSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...generalResSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...schoolResSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ];
        const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
        setResources(unique);
      } catch (e) {
        console.warn('staffGeneralResources error:', e);
      }

      // 3. Fetch Tutor Class Schedules (matching any aliasTutorId, email, or name)
      try {
        let loadedSchedules: any[] = [];
        if (currentUser && !effective.isMasquerading) {
          const token = await currentUser.getIdToken();
          const res = await fetch('/.netlify/functions/class-schedules', {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null);
          if (res?.ok) {
            const data = await res.json().catch(() => ({}));
            if (Array.isArray(data.schedules)) {
              loadedSchedules = data.schedules;
            }
          }
        }
        if (!loadedSchedules.length) {
          const schedSnap = await getDocs(collection(db, 'classSchedules')).catch(
            () => ({ docs: [] } as any)
          );
          loadedSchedules = schedSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        }

        const aliasIds = tutorCtx?.aliasTutorIds || new Set([effective.effectiveUid || currentUser?.uid || '']);
        const tutorEmailLower = (tutorCtx?.email || '').toLowerCase();
        const tutorNameLower = (tutorCtx?.name || '').toLowerCase();

        setSchedules(
          loadedSchedules.filter((s: any) => {
            if (tutorCtx?.isAdmin) return true;
            const sTutorId = String(s.tutorId || '').trim();
            const sTutorEmail = String(s.tutorEmail || '').trim().toLowerCase();
            const sTutorName = String(s.tutorName || '').trim().toLowerCase();
            return (
              (sTutorId && aliasIds.has(sTutorId)) ||
              (tutorEmailLower && sTutorEmail === tutorEmailLower) ||
              (tutorNameLower && sTutorName === tutorNameLower)
            );
          })
        );
      } catch (e) {
        console.warn('Tutor schedules fetch failed:', e);
      }
    } catch (err) {
      console.error('Error loading staff dashboard:', err);
      setErrorMsg('Some workspace data could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStaffData();
  }, []);

  useEffect(() => {
    if (location.pathname.endsWith('/students') && rosterSectionRef.current) {
      rosterSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.pathname, loading]);

  const schoolAssignedStudents = useMemo(
    () => students.filter((s) => s.assignmentCategory === 'school'),
    [students]
  );

  const privateAssignedStudents = useMemo(
    () => students.filter((s) => s.assignmentCategory === 'private'),
    [students]
  );

  // Scoped students and schedules according to the active Assigned-School Selector
  const scopedStudents = useMemo(() => {
    if (selectedScope === 'ALL') return students;
    if (selectedScope === 'PRIVATE') return privateAssignedStudents;
    return students.filter((s) => String(s.schoolId || '') === selectedScope);
  }, [students, privateAssignedStudents, selectedScope]);

  const scopedClasses = useMemo(() => {
    const set = new Set<string>();
    scopedStudents.forEach((s) => {
      const c = normalizeClassName(s.class || s.grade || '');
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [scopedStudents]);

  // Filtered students for the Available & Assigned Learners Directory
  const filteredRosterStudents = useMemo(() => {
    return scopedStudents.filter((s) => {
      if (rosterCategory === 'SCHOOL' && s.assignmentCategory !== 'school') return false;
      if (rosterCategory === 'PRIVATE' && s.assignmentCategory !== 'private') return false;

      if (selectedClassFilter !== 'ALL') {
        const sClass = normalizeClassName(s.class || s.grade || '');
        if (sClass !== selectedClassFilter) return false;
      }

      if (rosterSearch.trim()) {
        const q = rosterSearch.toLowerCase().trim();
        const hay = [
          s.fullName,
          s.username,
          s.class,
          s.plan,
          s.schoolName,
          s.parentName,
          s.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedStudents, rosterCategory, selectedClassFilter, rosterSearch]);

  // Upcoming class reminders sorted by actual session date & startTime
  const upcomingReminders = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return schedules
      .filter((s) => {
        if (!s.date) return false;
        const st = String(s.status || 'SCHEDULED').toUpperCase();
        if (['CANCELLED', 'ABSENT'].includes(st)) return false;
        if (selectedScope === 'PRIVATE' && s.schoolId) return false;
        if (
          selectedScope !== 'ALL' &&
          selectedScope !== 'PRIVATE' &&
          String(s.schoolId || '') !== selectedScope
        ) {
          return false;
        }
        return s.date >= todayStr;
      })
      .sort(
        (a, b) =>
          String(a.date || '').localeCompare(String(b.date || '')) ||
          String(a.startTime || '').localeCompare(String(b.startTime || ''))
      )
      .slice(0, 6);
  }, [schedules, selectedScope]);

  const handlePostLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      (!targetStudentId && broadcastTargetType === 'STUDENT') ||
      (!targetSchoolId && broadcastTargetType === 'SCHOOL') ||
      !linkUrl
    ) {
      toast.error(
        `Please select a ${
          broadcastTargetType === 'SCHOOL' ? 'school' : 'student'
        } and provide a valid URL.`
      );
      return;
    }
    setSubmittingLink(true);
    try {
      const user = auth.currentUser;
      const effective = getEffectiveAuth();
      const staffUid = effective.effectiveUid || user?.uid;
      const targetStudent = students.find((s) => s.id === targetStudentId);
      const targetSchool = assignedSchools.find((s) => s.id === targetSchoolId);

      await addDoc(collection(db, 'personalLinks'), {
        title: linkTitle || `${linkPlatform} Class Session`,
        url: linkUrl,
        platform: linkPlatform,
        meetingTime:
          meetingTime ||
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        targetType: broadcastTargetType,
        studentId: broadcastTargetType === 'STUDENT' ? targetStudentId : '',
        studentName:
          broadcastTargetType === 'STUDENT'
            ? targetStudent?.fullName || targetStudent?.studentName || 'Student'
            : '',
        schoolId: broadcastTargetType === 'SCHOOL' ? targetSchoolId : '',
        schoolName: broadcastTargetType === 'SCHOOL' ? targetSchool?.name || 'School' : '',
        tutorId: staffUid,
        tutorName: effective.effectiveName || user?.displayName || 'Faculty Member',
        createdAt: serverTimestamp(),
      });

      toast.success('Live class link broadcast to student portal!');
      setShowLinkModal(false);
      setLinkTitle('');
      setLinkUrl('');
      setMeetingTime('');
      setTargetStudentId('');
      setTargetSchoolId('');
      setBroadcastTargetType('STUDENT');
    } catch (err) {
      console.error('Post link error:', err);
      toast.error('Failed to post live class link.');
    } finally {
      setSubmittingLink(false);
    }
  };

  return (
    <div className="dashboard-interface space-y-6">
      <SEO
        title="Faculty Workspace Overview | Jaystarbliss Studios"
        description="Access assigned students, teaching schedules, curriculum materials, and ledger payouts."
        noindex={true}
      />

      <DashboardGreeting
        role="Faculty Mentor"
        subtitle="Deliver interactive lessons, manage school-assigned and private learners, review teaching schedules, and access faculty tools."
      />

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 text-red-700 dark:text-red-300 text-xs flex items-center gap-3 animate-fadeIn">
          <ShieldCheck size={18} className="text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ASSIGNED-SCHOOL & LEARNER SCOPE SELECTOR */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              Authorised Teaching Scope
            </h2>
            <p className="text-xs text-slate-500">
              Switch between your assigned partner schools and private learners to filter rosters,
              classes, and upcoming sessions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchStaffData()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <Link
              to="/portal/staff/assessments"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-bold whitespace-nowrap"
            >
              <BookOpenCheck size={14} /> Open Assessments Workspace
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 touch-pan-x">
          <button
            type="button"
            onClick={() => {
              setSelectedScope('ALL');
              setRosterCategory('ALL');
            }}
            className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
              selectedScope === 'ALL'
                ? 'text-[#14284B] dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            All Assigned Learners ({students.length})
            {selectedScope === 'ALL' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
            )}
          </button>

          {assignedSchools.map((sch) => {
            const active = selectedScope === sch.id;
            const count = students.filter((s) => String(s.schoolId || '') === sch.id).length;
            return (
              <button
                key={sch.id}
                type="button"
                onClick={() => {
                  setSelectedScope(sch.id);
                  setRosterCategory('SCHOOL');
                }}
                className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'text-[#14284B] dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <School size={14} className="text-blue-600 shrink-0" />
                <span>{sch.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 tabular-nums">
                  {count}
                </span>
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setSelectedScope('PRIVATE');
              setRosterCategory('PRIVATE');
            }}
            className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedScope === 'PRIVATE'
                ? 'text-[#14284B] dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Users size={14} className="text-emerald-600 shrink-0" />
            <span>Private / Parent Learners ({privateAssignedStudents.length})</span>
            {selectedScope === 'PRIVATE' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
            )}
          </button>
        </div>

        {/* Active Scope Classes & Roster Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-white tabular-nums">
              {scopedStudents.length} Learner(s) in Active Scope
            </span>
            <span className="text-slate-400">
              ({schoolAssignedStudents.length} School-Assigned · {privateAssignedStudents.length} Private)
            </span>
            {scopedClasses.length > 0 && (
              <span className="text-slate-400">
                · Classes: {scopedClasses.slice(0, 6).join(', ')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => rosterSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            Jump to Learner Directory <ArrowRight size={13} />
          </button>
        </div>
      </section>

      {/* Quick Summary Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="pro-surface p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shadow-xs">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
            <Users size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              Total Assigned Learners
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
              {loading ? '...' : students.length}
            </p>
          </div>
        </div>

        <div className="pro-surface p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shadow-xs">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shrink-0">
            <School size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              School-Assigned
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
              {loading ? '...' : schoolAssignedStudents.length}
            </p>
          </div>
        </div>

        <div className="pro-surface p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shadow-xs">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shrink-0">
            <UserRound size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              Private Learners
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
              {loading ? '...' : privateAssignedStudents.length}
            </p>
          </div>
        </div>

        <div className="pro-surface p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shadow-xs">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
            <FileText size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              Curriculum Library
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
              {loading ? '...' : resources.length}
            </p>
          </div>
        </div>
      </div>

      {/* AVAILABLE & ASSIGNED LEARNERS DIRECTORY (Accessible Categorized List) */}
      <section
        ref={rosterSectionRef}
        id="assigned-learners-roster"
        className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap size={20} className="text-brand-red shrink-0" />
              <span>Available &amp; Assigned Learners Directory</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Switch between School-Assigned Students and Private / Parent-Enrolled Learners to open individual workspaces, record attendance, or manage assignments.
            </p>
          </div>

          {/* Open Segmented Filter Tabs: All vs School-Assigned vs Private */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-xl">
            <button
              type="button"
              onClick={() => setRosterCategory('ALL')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                rosterCategory === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Available ({scopedStudents.length})
            </button>
            <button
              type="button"
              onClick={() => setRosterCategory('SCHOOL')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                rosterCategory === 'SCHOOL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <School size={13} />
              <span>
                School-Assigned (
                {scopedStudents.filter((s) => s.assignmentCategory === 'school').length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRosterCategory('PRIVATE')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                rosterCategory === 'PRIVATE'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserRound size={13} />
              <span>
                Private Learners (
                {scopedStudents.filter((s) => s.assignmentCategory === 'private').length})
              </span>
            </button>
          </div>
        </div>

        {/* Search & Class Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search learner by name, @username, class, school, or parent..."
              className="w-full min-h-10 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </div>

          {scopedClasses.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedClassFilter('ALL')}
                className={`min-h-9 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  selectedClassFilter === 'ALL'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                All Classes
              </button>
              {scopedClasses.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setSelectedClassFilter(cls)}
                  className={`min-h-9 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    selectedClassFilter === cls
                      ? 'bg-brand-red text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Structured Learner List */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Loading assigned learners and school rosters…
          </div>
        ) : filteredRosterStudents.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
            <Users size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No learners match the current filter
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Try switching between &ldquo;All Available&rdquo;, &ldquo;School-Assigned&rdquo;, and &ldquo;Private Learners&rdquo; above or clearing your search query.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRosterStudents.map((student) => {
              const isSchool = student.assignmentCategory === 'school';
              return (
                <div
                  key={student.id}
                  className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                        isSchool
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800'
                      }`}
                    >
                      {(student.fullName || 'S').charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/portal/staff/students/${student.id}`}
                          className="font-black text-sm text-slate-900 dark:text-white hover:text-brand-red transition-colors truncate"
                        >
                          {student.fullName}
                        </Link>

                        {/* Explicit Category Badge: School-Assigned vs Private Learner */}
                        {isSchool ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/70">
                            <School size={11} />
                            <span>School-Assigned · {student.schoolName || 'Partner School'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/70">
                            <UserRound size={11} />
                            <span>
                              Private Learner
                              {student.parentName ? ` · Parent: ${student.parentName}` : ''}
                            </span>
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {student.class || 'Grade 1'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono">@{student.username || student.id}</span>
                        {student.plan && <span>· Track: {student.plan}</span>}
                        {student.accessCode && (
                          <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                            · Code: {student.accessCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direct Tutor Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                      to={`/portal/staff/students/${student.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-colors"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight size={13} />
                    </Link>
                    <Link
                      to={`/portal/staff/assignments?studentId=${encodeURIComponent(student.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand-red/50 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors"
                    >
                      <ClipboardList size={13} className="text-brand-red" />
                      <span>Assignments</span>
                    </Link>
                    <Link
                      to={`/portal/staff/milestones?studentId=${encodeURIComponent(student.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500/50 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors"
                    >
                      <Flag size={13} className="text-blue-600" />
                      <span>Milestones</span>
                    </Link>
                    <Link
                      to="/portal/staff/credentials"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors"
                      title="Manage Student Access Passcode"
                    >
                      <KeyRound size={13} className="text-amber-600" />
                      <span>Access</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* UPCOMING CLASS REMINDERS SECTION */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar size={18} className="text-brand-red shrink-0" />
              Upcoming Class Reminders
            </h3>
            <p className="text-xs text-slate-500">
              Next scheduled sessions across your authorised schools and private learners.
            </p>
          </div>
          <Link
            to="/portal/staff/classes"
            className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            Open Full Timetable &amp; Attendance <ArrowRight size={13} />
          </Link>
        </div>

        {upcomingReminders.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed rounded-xl">
            No upcoming scheduled sessions found for the selected scope.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingReminders.map((rem) => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isToday = rem.date === todayStr;
              const delivery = String(
                rem.deliveryMode || (rem.meetingLink ? 'ONLINE' : 'PHYSICAL')
              ).toUpperCase();
              const schoolLabel =
                rem.schoolName ||
                assignedSchools.find((s) => s.id === rem.schoolId)?.name ||
                (rem.studentName ? `Private Learner: ${rem.studentName}` : 'Partner School');
              return (
                <div
                  key={rem.id}
                  className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          isToday
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        }`}
                      >
                        {isToday ? 'Happening Today' : rem.status || 'Scheduled'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {delivery}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {rem.title || rem.programName || 'Class Session'}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500">
                      <strong>{schoolLabel}</strong> ·{' '}
                      {rem.programName || 'Academic Programme'}
                      {rem.classLevel ? ` · ${rem.classLevel}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Clock size={12} className="text-slate-400" />
                      <span>
                        {rem.date} · {rem.startTime || '—'} – {rem.endTime || '—'}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {rem.meetingLink && (
                      <a
                        href={rem.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300"
                      >
                        <ExternalLink size={13} /> Join Room
                      </a>
                    )}
                    <Link
                      to="/portal/staff/classes"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-bold"
                    >
                      <ClipboardCheck size={13} /> Take Attendance
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Faculty Command Center Hub Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Class Schedules & Live Classrooms */}
        <div className="pro-surface rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-brand-red/40 transition-all">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center">
              <Video size={22} />
            </div>
            <h3 className="font-black text-slate-900 dark:text-white text-base">
              Class Schedules &amp; Teaching Roster
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Access your combined daily class schedules, take session attendance with Mark All
              Present, and broadcast live virtual meeting rooms.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <Link
              to="/portal/staff/classes"
              className="inline-flex items-center gap-2 text-xs font-black text-brand-red hover:underline"
            >
              <span>Open Class Schedules</span>
              <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Video size={13} className="text-brand-red" />
              <span>Broadcast Link</span>
            </button>
          </div>
        </div>

        {/* Card 2: Assessments, Assignments & Milestones */}
        <div className="pro-surface rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-blue-500/40 transition-all">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ClipboardCheck size={22} />
            </div>
            <h3 className="font-black text-slate-900 dark:text-white text-base">
              Assessments, Assignments &amp; Milestones
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Author native examinations, grade student assignments, release assessment results, and update learner milestone roadmaps.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <Link
              to="/portal/staff/assessments"
              className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 dark:text-blue-400 hover:underline"
            >
              <span>Assessments</span>
              <ArrowRight size={13} />
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              to="/portal/staff/assignments"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-brand-red"
            >
              <span>Assignments</span>
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              to="/portal/staff/milestones"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-brand-red"
            >
              <span>Milestones</span>
            </Link>
          </div>
        </div>

        {/* Card 3: Faculty Billing & Payout Center */}
        <div className="pro-surface rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-emerald-500/40 transition-all">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CreditCard size={22} />
            </div>
            <h3 className="font-black text-slate-900 dark:text-white text-base">
              Billing Center &amp; Payouts
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Manage your fintech account wallet, submit withdrawal requests, and view detailed
              teaching settlement history.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Link
              to="/portal/staff/payments"
              className="inline-flex items-center gap-2 text-xs font-black text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <span>Open Billing Center</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Broadcast Live Class Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">
              Post Live Class Link
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Broadcast a Google Meet, Zoom, or Scratch link directly to the student or school portal.
            </p>
            <form onSubmit={handlePostLink} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBroadcastTargetType('STUDENT')}
                  className={`min-h-10 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    broadcastTargetType === 'STUDENT'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Individual Learner
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastTargetType('SCHOOL')}
                  className={`min-h-10 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    broadcastTargetType === 'SCHOOL'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Partner School
                </button>
              </div>
              {broadcastTargetType === 'STUDENT' ? (
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Select Assigned Learner
                  </label>
                  <select
                    required
                    value={targetStudentId}
                    onChange={(e) => setTargetStudentId(e.target.value)}
                    className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                  >
                    <option value="">-- Choose Learner --</option>
                    {privateAssignedStudents.length > 0 && (
                      <optgroup label="Private / Parent Learners">
                        {privateAssignedStudents.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullName} ({s.class || 'Private'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {schoolAssignedStudents.length > 0 && (
                      <optgroup label="School-Assigned Students">
                        {schoolAssignedStudents.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullName} ({s.schoolName} · {s.class})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Select Assigned School
                  </label>
                  <select
                    required
                    value={targetSchoolId}
                    onChange={(e) => setTargetSchoolId(e.target.value)}
                    className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                  >
                    <option value="">-- Choose School --</option>
                    {assignedSchools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Session Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Python Loops & Conditionals Lab"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Platform
                  </label>
                  <select
                    value={linkPlatform}
                    onChange={(e) => setLinkPlatform(e.target.value)}
                    className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                  >
                    <option value="Google Meet">Google Meet</option>
                    <option value="Zoom">Zoom</option>
                    <option value="Microsoft Teams">MS Teams</option>
                    <option value="Scratch Classroom">Scratch Studio</option>
                    <option value="Code.org">Code.org</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Scheduled Time
                  </label>
                  <input
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Meeting / Classroom URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://meet.google.com/xyz-abcd-efg"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="min-h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLink}
                  className="min-h-11 px-5 rounded-xl bg-brand-red hover:bg-red-700 font-bold text-white flex items-center gap-2 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingLink ? 'Publishing...' : 'Broadcast to Portal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDashboard;
