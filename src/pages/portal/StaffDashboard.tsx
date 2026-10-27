import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  doc,
  getDoc,
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
} from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { DashboardGreeting } from '../../components/portal/DashboardGreeting';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';
import { normalizeClassName, resolvePartnerSchoolName } from '../../lib/classes';

const StaffDashboard: React.FC = () => {
  const { toast } = useToast();
  const [resources, setResources] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [assignedSchools, setAssignedSchools] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedScope, setSelectedScope] = useState<string>('ALL');
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

      const staffUid = effective.effectiveUid || currentUser?.uid || '';

      // 1. Fetch Curriculum Resources Count
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

      // 2. Fetch Assigned Students
      const assignmentFields = [
        'tutorId',
        'staffId',
        'assignedTutorId',
        'assignedStaffId',
        'instructorId',
      ];
      const studentMap = new Map<string, any>();
      if (staffUid) {
        for (const field of assignmentFields) {
          for (const collectionName of ['individualStudents', 'students']) {
            try {
              const snap = await getDocs(
                query(collection(db, collectionName), where(field, '==', staffUid))
              );
              snap.forEach((d) => studentMap.set(d.id, { id: d.id, ...d.data() }));
            } catch (e) {
              console.warn(`Assigned ${collectionName} query failed for ${field}:`, e);
            }
          }
        }
      }

      // 3. Fetch assigned schools (including staffSchoolAccess + user profile + school records)
      try {
        const [schoolsSnap, accessSnap, userSnap] = await Promise.all([
          getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
          staffUid
            ? getDoc(doc(db, 'staffSchoolAccess', staffUid)).catch(() => null)
            : Promise.resolve(null),
          staffUid ? getDoc(doc(db, 'users', staffUid)).catch(() => null) : Promise.resolve(null),
        ]);

        const accessData = accessSnap?.exists() ? accessSnap.data() || {} : {};
        const userData = userSnap?.exists() ? userSnap.data() || {} : {};
        const directSchoolIds = new Set<string>(
          [
            accessData.schoolId,
            ...(Array.isArray(accessData.schoolIds) ? accessData.schoolIds : []),
            userData.schoolId,
            ...(Array.isArray(userData.schoolIds) ? userData.schoolIds : []),
          ]
            .filter(Boolean)
            .map(String)
        );

        const allSchools = schoolsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        const mySchools = allSchools
          .filter((sch: any) => {
            if (!staffUid) return false;
            if (directSchoolIds.has(sch.id)) return true;
            if (
              sch.tutorId === staffUid ||
              sch.assignedTutorId === staffUid ||
              sch.assignedStaffId === staffUid
            )
              return true;
            if (
              Array.isArray(sch.assignedTutors) &&
              sch.assignedTutors.some(
                (t: any) => String(t?.id || t?.tutorId || t || '') === staffUid
              )
            )
              return true;
            if (
              Array.isArray(sch.assignedStaff) &&
              sch.assignedStaff.some((t: any) => String(t?.id || t?.uid || t || '') === staffUid)
            )
              return true;
            if (
              Array.isArray(sch.tutors) &&
              sch.tutors.some((t: any) => t.id === staffUid || t.email === currentUser?.email)
            )
              return true;
            return false;
          })
          .map((sch: any) => ({
            ...sch,
            name:
              resolvePartnerSchoolName(sch.name, sch.schoolName, sch.institutionName) ||
              'Partner School',
          }));
        setAssignedSchools(mySchools);

        // Fetch school-scoped students
        const scopedStudents = new Map<string, any>(studentMap);
        const schoolIds = mySchools.map((school: any) => school.id).filter(Boolean);
        for (const schoolId of schoolIds) {
          for (const collectionName of ['students', 'individualStudents']) {
            try {
              const snap = await getDocs(
                query(collection(db, collectionName), where('schoolId', '==', schoolId))
              );
              snap.forEach((d) => scopedStudents.set(d.id, { id: d.id, ...d.data() }));
            } catch (e) {
              console.warn(`School-scoped ${collectionName} query failed:`, e);
            }
          }
        }
        setStudents(
          Array.from(scopedStudents.values()).filter((student: any) => {
            if (student.schoolId && schoolIds.includes(student.schoolId)) return true;
            return assignmentFields.some((field) => String(student[field] || '') === staffUid);
          })
        );
      } catch (e) {
        console.warn('Assigned schools fetch failed:', e);
        setStudents(Array.from(studentMap.values()));
      }

      // 4. Fetch Tutor Class Schedules (safely scoped by tutorId)
      try {
        let loadedSchedules: any[] = [];
        if (currentUser) {
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
        if (!loadedSchedules.length && staffUid) {
          const schedSnap = await getDocs(
            query(collection(db, 'classSchedules'), where('tutorId', '==', staffUid))
          ).catch(() => ({ docs: [] } as any));
          loadedSchedules = schedSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        }
        setSchedules(
          loadedSchedules.filter((s: any) => !staffUid || String(s.tutorId || '') === staffUid)
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
    fetchStaffData();
  }, []);

  // Scoped students and schedules according to the active Assigned-School Selector
  const scopedStudents = useMemo(() => {
    if (selectedScope === 'ALL') return students;
    if (selectedScope === 'PRIVATE') return students.filter((s) => !s.schoolId);
    return students.filter((s) => String(s.schoolId || '') === selectedScope);
  }, [students, selectedScope]);

  const scopedClasses = useMemo(() => {
    const set = new Set<string>();
    scopedStudents.forEach((s) => {
      const c = normalizeClassName(s.class || s.grade || s.className || '');
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [scopedStudents]);

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
        subtitle="Deliver interactive lessons, manage assigned learners, review teaching schedules, and access faculty tools."
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

      {/* ASSIGNED-SCHOOL & LEARNER SCOPE SELECTOR (Programs-page style clean horizontal tabs) */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              Authorised Teaching Scope
            </h2>
            <p className="text-xs text-slate-500">
              Switch between your assigned partner schools and private learners to filter rosters,
              classes, and upcoming reminders.
            </p>
          </div>
          <Link
            to="/portal/staff/assessments"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-bold self-start sm:self-auto"
          >
            <BookOpenCheck size={14} /> Open Assessments Workspace
          </Link>
        </div>

        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 touch-pan-x">
          <button
            type="button"
            onClick={() => setSelectedScope('ALL')}
            className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
              selectedScope === 'ALL'
                ? 'text-[#14284B] dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            All Assigned Scopes ({students.length})
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
                onClick={() => setSelectedScope(sch.id)}
                className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'text-[#14284B] dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <School size={14} className="text-blue-600 shrink-0" />
                <span>{sch.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
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
            onClick={() => setSelectedScope('PRIVATE')}
            className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedScope === 'PRIVATE'
                ? 'text-[#14284B] dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Users size={14} className="text-emerald-600 shrink-0" />
            <span>Private Learners ({students.filter((s) => !s.schoolId).length})</span>
            {selectedScope === 'PRIVATE' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
            )}
          </button>
        </div>

        {/* Active Scope Classes & Roster Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-white">
              {scopedStudents.length} Learner(s) in Active Scope
            </span>
            {scopedClasses.length > 0 && (
              <span className="text-slate-400">
                · Classes: {scopedClasses.slice(0, 6).join(', ')}
              </span>
            )}
          </div>
          <Link
            to="/portal/staff/students"
            className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            View Learner Roster <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* Quick Summary Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="pro-surface p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shadow-xs">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
            <Users size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              Scoped Learners
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {loading ? '...' : scopedStudents.length}
            </p>
          </div>
        </div>

        <div className="pro-surface p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shadow-xs">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shrink-0">
            <School size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              Partner Schools
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {loading ? '...' : assignedSchools.length}
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
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {loading ? '...' : resources.length}
            </p>
          </div>
        </div>
      </div>

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

        {/* Card 2: Faculty Billing & Payout Center */}
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
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">
              Post Live Class Link
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Broadcast a Google Meet, Zoom, or Scratch link directly to the student portal.
            </p>
            <form onSubmit={handlePostLink} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBroadcastTargetType('STUDENT')}
                  className={`min-h-10 rounded-xl border text-xs font-bold transition-colors ${
                    broadcastTargetType === 'STUDENT'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Private Student
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastTargetType('SCHOOL')}
                  className={`min-h-10 rounded-xl border text-xs font-bold transition-colors ${
                    broadcastTargetType === 'SCHOOL'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  School
                </button>
              </div>
              {broadcastTargetType === 'STUDENT' ? (
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Select Private Student
                  </label>
                  <select
                    required
                    value={targetStudentId}
                    onChange={(e) => setTargetStudentId(e.target.value)}
                    className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                  >
                    <option value="">-- Choose Student --</option>
                    {students
                      .filter((s) => !s.schoolId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName || s.studentName || s.username}
                        </option>
                      ))}
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
                  {submittingLink ? 'Publishing...' : 'Broadcast to Student'}
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
