import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Video,
  MapPin,
  AlertCircle,
  Clock,
  UserCheck,
  School,
  User,
  Repeat,
  Link2,
} from 'lucide-react';
import { ScheduleTimelineSkeleton } from '../../components/ui/Skeleton';
import { auth, db } from '../../lib/firebase';
import { collection, getDoc, getDocs, doc, query, where } from 'firebase/firestore';
import SEO from '../../components/ui/SEO';
import { getEffectiveAuth } from '../../utils/impersonation';
import StaffClassSchedulesManager from '../../components/portal/StaffClassSchedulesManager';
import {
  type StudentEnrollmentContext,
  calculateDurationMinutes,
  doesScheduleMatchStudent,
  resolveFullStudentEnrollmentContext,
  validateMeetingLink,
} from '../../lib/scheduleEngine';

type Schedule = {
  id: string;
  date?: string;
  dayOfWeek?: string;
  selectedDays?: string[];
  recurring?: boolean;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  title?: string;
  programName?: string;
  programmeName?: string;
  tutorName?: string;
  meetingLink?: string;
  platform?: string;
  studentId?: string;
  studentName?: string;
  studentEmail?: string;
  parentId?: string;
  parentEmail?: string;
  schoolId?: string;
  schoolName?: string;
  programId?: string;
  programmeId?: string;
  classLevel?: string;
  classLevels?: string[];
  status?: string;
  targetType?: string;
  deliveryMode?: string;
  locationRoom?: string;
  absenceReason?: string;
  cancellationReason?: string;
  rescheduleReason?: string;
  rescheduledToDate?: string;
  rescheduledToStartTime?: string;
  rescheduledToEndTime?: string;
  rescheduledFromId?: string;
  rescheduledFromDate?: string;
  updatedByName?: string;
};

const norm = (v: unknown) => String(v || '').trim().toLowerCase();

const mondayKey = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

const formatWeek = (key: string) => {
  const start = new Date(`${key}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  })} – ${end.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
};

const timeMinutes = (v = '') => {
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

const format12Hour = (time24 = '') => {
  if (!time24) return '—';
  const m = time24.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time24;
  const h = Number(m[1]);
  const mins = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mins} ${period}`;
};

const statusLabel = (status?: string) =>
  String(status || 'SCHEDULED')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const PortalCalendar: React.FC = () => {
  const effective = getEffectiveAuth();
  const rawRole = norm(
    effective.effectiveRole || sessionStorage.getItem('userRole') || ''
  ).toUpperCase();

  const isTutorRole = ['STAFF', 'TUTOR', 'INSTRUCTOR', 'FACULTY'].includes(rawRole);
  const isStudentRole = rawRole === 'STUDENT' || (!rawRole && Boolean(sessionStorage.getItem('studentDocId')));
  const isParentRole = rawRole === 'PARENT';
  const isSchoolRole = ['SCHOOL', 'SCHOOL_ADMIN'].includes(rawRole);

  const [studentCtx, setStudentCtx] = useState<StudentEnrollmentContext | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    if (isTutorRole) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        const uid = effective.effectiveUid || sessionStorage.getItem('userId') || user?.uid || '';
        const email = norm(
          effective.effectiveEmail ||
            sessionStorage.getItem('userEmail') ||
            sessionStorage.getItem('studentEmail') ||
            user?.email ||
            ''
        );

        // Fetch all schedules from Firestore (authoritative real-time source) + Netlify API
        const [schedSnap, apiRows] = await Promise.all([
          getDocs(collection(db, 'classSchedules')).catch(() => ({ docs: [] } as any)),
          user
            ? user
                .getIdToken()
                .then((token) =>
                  fetch('/.netlify/functions/class-schedules', {
                    headers: { Authorization: `Bearer ${token}` },
                  })
                    .then((r) => (r.ok ? r.json() : { schedules: [] }))
                    .then((p) => (Array.isArray(p.schedules) ? p.schedules : []))
                    .catch(() => [])
                )
                .catch(() => [])
            : Promise.resolve([]),
        ]);

        const mergedMap = new Map<string, Schedule>();
        apiRows.forEach((r: Schedule) => {
          if (r && r.id) mergedMap.set(r.id, r);
        });
        schedSnap.docs.forEach((d: any) => {
          mergedMap.set(d.id, { id: d.id, ...d.data() } as Schedule);
        });

        let rows = Array.from(mergedMap.values());

        if (isStudentRole) {
          const resolvedCtx = await resolveFullStudentEnrollmentContext(uid);
          if (!cancelled) setStudentCtx(resolvedCtx);
          rows = rows.filter((s) => doesScheduleMatchStudent(s, resolvedCtx));
        } else if (isParentRole) {
          // Resolve all linked children for this Parent and strictly filter schedules
          const childContexts: StudentEnrollmentContext[] = [];
          const parentIds = new Set<string>([uid].filter(Boolean));
          const parentEmails = new Set<string>([email].filter(Boolean));

          const absorbChildDoc = (docId: string, d: Record<string, any>) => {
            if (!d) return;
            const cIds = new Set<string>([
              docId,
              String(d.id || ''),
              String(d.linkedStudentId || ''),
              String(d.studentDocId || ''),
              String(d.firebaseUid || ''),
            ].filter(Boolean));
            const cEmails = new Set<string>(
              [d.email, d.studentEmail].map(norm).filter(Boolean)
            );
            const cNames = new Set<string>(
              [d.fullName, d.studentName, d.name].map(norm).filter(Boolean)
            );
            const cSchoolId = String(d.schoolId || '').trim();
            const cSchoolName = String(d.schoolName || d.school || '').trim();
            const cProgIds = new Set<string>(
              [d.programId, d.assignedProgramId].map(norm).filter(Boolean)
            );
            const cProgNames = new Set<string>(
              [d.programName, d.program, d.plan, d.track, d.programTitle]
                .map(norm)
                .filter(Boolean)
            );
            if (Array.isArray(d.subjects)) {
              d.subjects.forEach((sub: any) => {
                if (typeof sub === 'string' && sub.trim()) cProgNames.add(norm(sub));
              });
            }

            childContexts.push({
              ids: cIds,
              emails: cEmails,
              names: cNames,
              isSchoolStudent: Boolean(cSchoolId || cSchoolName),
              schoolId: cSchoolId,
              schoolName: cSchoolName,
              className: String(d.class || d.grade || d.classLevel || 'Grade 1'),
              programIds: cProgIds,
              programNames: cProgNames,
              parentIds,
              parentEmails,
            });
          };

          if (uid) {
            const [iSnap, sSnap, pDoc, uDoc] = await Promise.all([
              getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', uid))).catch(() => ({ docs: [] } as any)),
              getDocs(query(collection(db, 'students'), where('parentId', '==', uid))).catch(() => ({ docs: [] } as any)),
              getDoc(doc(db, 'parents', uid)).catch(() => null),
              getDoc(doc(db, 'users', uid)).catch(() => null),
            ]);
            iSnap.docs.forEach((d: any) => absorbChildDoc(d.id, d.data()));
            sSnap.docs.forEach((d: any) => absorbChildDoc(d.id, d.data()));

            const extraChildIds = new Set<string>();
            if (pDoc?.exists() && Array.isArray(pDoc.data()?.children)) {
              pDoc.data()!.children.forEach((cid: any) => {
                if (cid) extraChildIds.add(String(cid).trim());
              });
            }
            if (uDoc?.exists() && Array.isArray(uDoc.data()?.children)) {
              uDoc.data()!.children.forEach((cid: any) => {
                if (cid) extraChildIds.add(String(cid).trim());
              });
            }
            for (const cid of Array.from(extraChildIds)) {
              const [cIndiv, cStud] = await Promise.all([
                getDoc(doc(db, 'individualStudents', cid)).catch(() => null),
                getDoc(doc(db, 'students', cid)).catch(() => null),
              ]);
              if (cIndiv?.exists()) absorbChildDoc(cIndiv.id, cIndiv.data());
              if (cStud?.exists()) absorbChildDoc(cStud.id, cStud.data());
            }
          }

          if (email) {
            const [iByEmail, sByEmail] = await Promise.all([
              getDocs(query(collection(db, 'individualStudents'), where('parentEmail', '==', email))).catch(() => ({ docs: [] } as any)),
              getDocs(query(collection(db, 'students'), where('parentEmail', '==', email))).catch(() => ({ docs: [] } as any)),
            ]);
            iByEmail.docs.forEach((d: any) => absorbChildDoc(d.id, d.data()));
            sByEmail.docs.forEach((d: any) => absorbChildDoc(d.id, d.data()));
          }

          rows = rows.filter((s) => {
            if (uid && String(s.parentId || '').trim() === uid) return true;
            if (email && norm(s.parentEmail) === email) return true;
            return childContexts.some((cCtx) => doesScheduleMatchStudent(s, cCtx));
          });
        } else if (isSchoolRole) {
          const cachedSchoolId = sessionStorage.getItem('schoolId') || uid;
          const cachedSchoolName = norm(
            sessionStorage.getItem('schoolName') || sessionStorage.getItem('institutionName') || ''
          );
          rows = rows.filter((s) => {
            const sId = String(s.schoolId || '').trim();
            const sName = norm(s.schoolName);
            return (
              (cachedSchoolId && sId === cachedSchoolId) ||
              (cachedSchoolName &&
                sName &&
                (sName === cachedSchoolName ||
                  sName.includes(cachedSchoolName) ||
                  cachedSchoolName.includes(sName)))
            );
          });
        }

        if (statusFilter === 'ALL') {
          rows = rows.filter((s) => norm(s.status) !== 'rescheduled');
        } else {
          rows = rows.filter((s) => norm(s.status || 'scheduled') === norm(statusFilter));
        }

        rows.sort(
          (a, b) =>
            String(a.date || '').localeCompare(String(b.date || '')) ||
            timeMinutes(a.startTime) - timeMinutes(b.startTime)
        );

        if (!cancelled) {
          setSchedules(rows);
          const weekKeys = Array.from(
            new Set(rows.map((s) => mondayKey(new Date(`${s.date || ''}T12:00:00`))))
          );
          setOpenWeeks(Object.fromEntries(weekKeys.map((w, i) => [w, i < 2])));
          // Open all days in the first active week by default so sessions are immediately visible
          const firstWeekKey = weekKeys[0];
          const dayMap: Record<string, boolean> = {};
          rows.forEach((s) => {
            if (!s.date) return;
            const wKey = mondayKey(new Date(`${s.date}T12:00:00`));
            dayMap[s.date] = wKey === firstWeekKey;
          });
          setOpenDays(dayMap);
        }
      } catch (e) {
        console.warn('Calendar load failed:', e);
        if (!cancelled) setSchedules([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    isTutorRole,
    isStudentRole,
    isParentRole,
    isSchoolRole,
    statusFilter,
    effective.effectiveUid,
    effective.effectiveEmail,
  ]);

  const weeks = useMemo<[string, Map<string, Schedule[]>][]>(() => {
    const map = new Map<string, Map<string, Schedule[]>>();
    schedules.forEach((s: Schedule) => {
      if (!s.date) return;
      const w = mondayKey(new Date(`${s.date}T12:00:00`));
      if (!map.has(w)) map.set(w, new Map());
      const days = map.get(w)!;
      const date = s.date;
      if (!days.has(date)) days.set(date, []);
      days.get(date)!.push(s);
    });
    return Array.from(map.entries());
  }, [schedules]);

  if (isTutorRole) {
    return (
      <div className="space-y-5 max-w-6xl mx-auto pb-12">
        <SEO
          title="Tutor Class Schedules | Jaystarbliss Studios"
          description="Create and manage class schedules for your assigned private students and school programs."
          noindex
        />
        <StaffClassSchedulesManager />
      </div>
    );
  }

  const enrolledProgramsDisplay = studentCtx
    ? Array.from(studentCtx.programNames)
        .map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()))
        .join(', ')
    : '';

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      <SEO
        title="Class Schedules | Jaystarbliss Studios"
        description="Your synchronized weekly class schedule and online classroom links."
        noindex
      />

      {/* Enrollment Context Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="space-y-1">
          {isStudentRole && studentCtx ? (
            <div className="flex flex-wrap items-center gap-2">
              {studentCtx.isSchoolStudent ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-[11px] font-black text-blue-700 dark:text-blue-300">
                  <School size={13} /> {studentCtx.schoolName || 'Partner School'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                  <User size={13} /> Private Student Schedule
                </span>
              )}
              {studentCtx.className && (
                <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {studentCtx.className}
                </span>
              )}
              {enrolledProgramsDisplay && (
                <span className="rounded-lg bg-brand-red/10 px-2.5 py-1 text-[11px] font-black text-brand-red">
                  {enrolledProgramsDisplay}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {isParentRole
                ? 'Showing class schedules assigned to your enrolled children'
                : 'Grouped by teaching week and day'}
            </span>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-bold"
        >
          <option value="ALL">All statuses</option>
          <option value="SCHEDULED">Upcoming</option>
          <option value="ONGOING">Ongoing</option>
          <option value="COMPLETED">Completed</option>
          <option value="ATTENDED">Attended</option>
          <option value="ABSENT">Absent</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="RESCHEDULED">Rescheduled</option>
        </select>
      </div>

      {loading ? (
        <ScheduleTimelineSkeleton count={2} />
      ) : !weeks.length ? (
        <div className="min-h-56 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 grid place-items-center text-center p-6">
          <div>
            <CalendarDays className="mx-auto text-slate-400 mb-3" />
            <p className="text-sm font-black text-slate-900 dark:text-white">
              No class schedules available
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Your schedule will appear here automatically once an administrator or assigned tutor configures your class timetable.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {weeks.map(([week, days]) => {
            const weekOpen = openWeeks[week] !== false;
            const total = Array.from(days.values()).reduce(
              (n: number, x: Schedule[]) => n + x.length,
              0
            );
            return (
              <section
                key={week}
                className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenWeeks((v) => ({ ...v, [week]: !weekOpen }))}
                  className="w-full p-5 flex items-center justify-between text-left cursor-pointer"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-black text-brand-red">
                      Teaching week
                    </p>
                    <h2 className="mt-1 text-base font-black text-slate-900 dark:text-white">
                      {formatWeek(week)}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {days.size} active day{days.size === 1 ? '' : 's'} · {total} session
                      {total === 1 ? '' : 's'}
                    </p>
                  </div>
                  {weekOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                {weekOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.from(days.entries()).map(([date, rows]: [string, Schedule[]]) => {
                      const dayOpen = openDays[date] === true;
                      return (
                        <div key={date}>
                          <button
                            type="button"
                            onClick={() => setOpenDays((v) => ({ ...v, [date]: !dayOpen }))}
                            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-950/40 cursor-pointer"
                          >
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white">
                                {formatDay(date)}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {rows.length} session{rows.length === 1 ? '' : 's'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-bold text-slate-500">
                                {rows
                                  .map((r: Schedule) => format12Hour(r.startTime))
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                              {dayOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                          </button>
                          {dayOpen && (
                            <div className="px-5 pb-4 space-y-2.5">
                              {rows.map((session: Schedule) => {
                                const status = norm(session.status || 'scheduled');
                                const linkCheck = validateMeetingLink(session.meetingLink);
                                const durationMins =
                                  session.durationMinutes ||
                                  calculateDurationMinutes(
                                    session.startTime || '',
                                    session.endTime || ''
                                  );
                                const programLabel =
                                  session.programName ||
                                  session.programmeName ||
                                  session.title ||
                                  'Academic Programme';

                                return (
                                  <article
                                    key={session.id}
                                    className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3 bg-slate-50/40 dark:bg-slate-950/30"
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                      <div className="sm:w-44 shrink-0">
                                        <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                          <Clock size={14} className="text-brand-red shrink-0" />
                                          <span>
                                            {format12Hour(session.startTime)} –{' '}
                                            {format12Hour(session.endTime)}
                                          </span>
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-[10px] text-slate-500 uppercase font-black">
                                            {statusLabel(status)}
                                          </span>
                                          {durationMins > 0 && (
                                            <span className="text-[10px] font-bold text-slate-400">
                                              • {durationMins} mins
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="inline-flex items-center rounded-md bg-brand-red/10 px-2 py-0.5 text-[10px] font-black uppercase text-brand-red">
                                            {programLabel}
                                          </span>
                                          {session.dayOfWeek && (
                                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                              <Repeat size={10} />
                                              {Array.isArray(session.selectedDays) &&
                                              session.selectedDays.length > 1
                                                ? session.selectedDays.join(', ')
                                                : session.dayOfWeek}
                                            </span>
                                          )}
                                          {session.studentName && isParentRole && (
                                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                                              <User size={10} /> {session.studentName}
                                            </span>
                                          )}
                                        </div>

                                        <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                          {session.title || programLabel}
                                        </h3>

                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                          {session.tutorName && (
                                            <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                              <UserCheck size={12} className="text-brand-red" />
                                              Tutor: <strong>{session.tutorName}</strong>
                                            </span>
                                          )}
                                          {session.deliveryMode === 'physical' ? (
                                            <span className="text-[11px] text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                                              <MapPin size={12} /> Physical class
                                              {session.locationRoom
                                                ? ` · ${session.locationRoom}`
                                                : ''}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                                              <Video size={12} /> {linkCheck.platform}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Join Class Button */}
                                      <div className="shrink-0">
                                        {linkCheck.valid && session.deliveryMode !== 'physical' ? (
                                          <a
                                            href={linkCheck.normalizedUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-red hover:bg-red-700 text-white px-4 py-2.5 text-xs font-black shadow-xs transition-all"
                                          >
                                            <Video size={14} /> Join Class <ExternalLink size={12} />
                                          </a>
                                        ) : session.deliveryMode !== 'physical' ? (
                                          <span
                                            title="Your instructor or administrator has not configured a joining link for this session yet."
                                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/70 text-slate-400 px-3.5 py-2 text-[11px] font-bold cursor-not-allowed"
                                          >
                                            <Link2 size={13} /> Link Not Configured
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>

                                    {status === 'absent' && session.absenceReason && (
                                      <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex gap-2">
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        <span>
                                          <b>Why this class was marked absent:</b>{' '}
                                          {session.absenceReason}
                                        </span>
                                      </div>
                                    )}
                                    {status === 'cancelled' && session.cancellationReason && (
                                      <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                                        <b>Reason:</b> {session.cancellationReason}
                                      </div>
                                    )}
                                    {status === 'rescheduled' && (
                                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                                        <p>
                                          <b>Why it was rescheduled:</b>{' '}
                                          {session.rescheduleReason ||
                                            'The tutor rescheduled this class.'}
                                        </p>
                                        {session.rescheduledToDate && (
                                          <p className="mt-1">
                                            <b>New session:</b>{' '}
                                            {formatDay(session.rescheduledToDate)} ·{' '}
                                            {format12Hour(session.rescheduledToStartTime)} –{' '}
                                            {format12Hour(session.rescheduledToEndTime)}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default PortalCalendar;
