import React, { useState, useEffect, useMemo } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, ExternalLink, Video, MapPin, AlertCircle } from 'lucide-react';
import { ScheduleTimelineSkeleton } from '../../components/ui/Skeleton';
import { Navigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, getDoc, getDocs, doc } from 'firebase/firestore';
import SEO from '../../components/ui/SEO';
import { isStudentClassMatch } from '../../utils/classMatching';

type Schedule = { id: string; date?: string; dayOfWeek?: string; startTime?: string; endTime?: string; title?: string; programName?: string; programmeName?: string; tutorName?: string; meetingLink?: string; studentId?: string; studentEmail?: string; schoolId?: string; schoolName?: string; programId?: string; programmeId?: string; classLevel?: string; classLevels?: string[]; status?: string; targetType?: string; deliveryMode?: string; locationRoom?: string; absenceReason?: string; cancellationReason?: string; rescheduleReason?: string; rescheduledToDate?: string; rescheduledToStartTime?: string; rescheduledToEndTime?: string; rescheduledFromId?: string; rescheduledFromDate?: string; };
const norm = (v: unknown) => String(v || '').trim().toLowerCase();
const mondayKey = (date: Date) => { const d = new Date(date), day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10); };
const formatDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' });
const formatWeek = (key: string) => { const start = new Date(`${key}T12:00:00`), end = new Date(start); end.setDate(end.getDate() + 6); return `${start.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`; };
const timeMinutes = (v = '') => { const m = v.match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
const statusLabel = (status?: string) => String(status || 'SCHEDULED').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const PortalCalendar: React.FC = () => {
  const role = norm(sessionStorage.getItem('userRole')).toUpperCase();
  const student = role === 'STUDENT';
  const [ctx, setCtx] = useState<any>({ id: sessionStorage.getItem('studentDocId') || '', email: sessionStorage.getItem('studentEmail') || '', schoolId: sessionStorage.getItem('studentSchoolId') || '', schoolName: sessionStorage.getItem('studentSchoolName') || '', className: sessionStorage.getItem('studentClass') || '', programId: sessionStorage.getItem('studentProgramId') || '', programName: sessionStorage.getItem('studentProgramName') || sessionStorage.getItem('studentPlan') || '', registrationSource: sessionStorage.getItem('studentRegistrationSource') || '', deliveryMode: sessionStorage.getItem('studentDeliveryMode') || '' });
  const [schedules, setSchedules] = useState<Schedule[]>([]), [loading, setLoading] = useState(true), [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({}), [openDays, setOpenDays] = useState<Record<string, boolean>>({}), [statusFilter, setStatusFilter] = useState('ALL'), [modeLoaded, setModeLoaded] = useState(!student);
  const parentEnrolled = student && (ctx.registrationSource === 'parent-enrollment-approved' || !!sessionStorage.getItem('parentId') || !!sessionStorage.getItem('studentParentId'));
  const onlineOnly = parentEnrolled && ctx.deliveryMode === 'online';

  useEffect(() => {
    if (!student) return;
    const id = sessionStorage.getItem('studentDocId') || '';
    if (!id) { setModeLoaded(true); return; }
    void getDoc(doc(db, 'students', id)).then(s => {
      if (!s.exists()) return;
      const d = s.data() as any;
      const mode = String(d.deliveryMode || d.classScheduleDetails?.deliveryMode || '').toLowerCase();
      const source = String(d.registrationSource || '').toLowerCase();
      setCtx({ id, email: d.email || '', schoolId: d.schoolId || '', schoolName: d.schoolName || d.school || '', className: d.class || d.grade || d.classLevel || d.year || '', programId: d.programId || d.assignedProgramId || d.programmeId || '', programName: d.programName || d.program || d.programmeName || d.plan || d.track || '', registrationSource: source, deliveryMode: mode });
      sessionStorage.setItem('studentDeliveryMode', mode); sessionStorage.setItem('studentRegistrationSource', source);
    }).catch(() => undefined).finally(() => setModeLoaded(true));
  }, [student]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (student && !ctx.id) { setLoading(false); return; }
      setLoading(true);
      try {
        const user = auth.currentUser; let rows: Schedule[] = [];
        if (user) {
          const token = await user.getIdToken();
          const response = await fetch(`/.netlify/functions/class-schedules?${student ? `studentId=${encodeURIComponent(ctx.id || '')}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) { const payload = await response.json(); rows = Array.isArray(payload.schedules) ? payload.schedules : []; }
        }
        if (!rows.length) { const snap = await getDocs(collection(db, 'classSchedules')); rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as Schedule)); }
        if (student) rows = rows.filter(s => {
          const direct = s.studentId === ctx.id || (s.studentEmail && norm(s.studentEmail) === norm(ctx.email));
          if (direct) return true;
          const schoolOk = !ctx.schoolId || s.schoolId === ctx.schoolId || norm(s.schoolName) === norm(ctx.schoolName); if (!schoolOk) return false;
          const pid = s.programId || s.programmeId, pname = s.programName || s.programmeName;
          const programOk = !pid && !pname ? true : (!!ctx.programId && !!pid && ctx.programId === pid) || (!!ctx.programName && norm(ctx.programName) === norm(pname));
          return programOk && isStudentClassMatch(ctx.className, s.classLevel, s.classLevels);
        });
        if (onlineOnly) rows = rows.filter(s => !!s.meetingLink && norm(s.deliveryMode || 'online') !== 'physical');
        if (statusFilter === 'ALL') rows = rows.filter(s => norm(s.status) !== 'rescheduled');
        rows = rows.filter(s => statusFilter === 'ALL' || norm(s.status) === norm(statusFilter));
        rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || timeMinutes(a.startTime) - timeMinutes(b.startTime));
        if (!cancelled) { setSchedules(rows); const weeks = Array.from(new Set(rows.map(s => mondayKey(new Date(`${s.date || ''}T12:00:00`)) ))); setOpenWeeks(Object.fromEntries(weeks.map((w, i) => [w, i === 0]))); setOpenDays(Object.fromEntries(rows.map(s => [s.date || '', false]))); }
      } catch (e) { console.warn('Calendar load failed:', e); if (!cancelled) setSchedules([]); } finally { if (!cancelled) setLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [ctx, student, statusFilter, onlineOnly]);

  const weeks = useMemo<[string, Map<string, Schedule[]>][]>(() => {
    const map = new Map<string, Map<string, Schedule[]>>();
    schedules.forEach((s: Schedule) => {
      const w = mondayKey(new Date(`${s.date || ''}T12:00:00`));
      if (!map.has(w)) map.set(w, new Map());
      const days = map.get(w)!;
      const date = s.date || '';
      if (!days.has(date)) days.set(date, []);
      days.get(date)!.push(s);
    });
    return Array.from(map.entries());
  }, [schedules]);

  if (onlineOnly && modeLoaded) return <Navigate to="/portal/student/live-classrooms" replace />;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      <SEO title="Class Schedules | Jaystarbliss Studios" description="Your weekly class schedule." noindex />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <span className="text-xs text-slate-500">
          {student ? `Showing ${ctx.className || 'assigned class'} sessions${ctx.programName ? ` • ${ctx.programName}` : ''}` : 'Grouped by teaching week and day'}
        </span>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
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
            <p className="text-sm font-black">No class schedules available</p>
            <p className="text-xs text-slate-500 mt-1">Your schedule will appear here once a session is assigned.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {weeks.map(([week, days]) => {
            const weekOpen = openWeeks[week] !== false;
            const total = Array.from(days.values()).reduce((n: number, x: Schedule[]) => n + x.length, 0);
            return (
              <section key={week} className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenWeeks(v => ({ ...v, [week]: !weekOpen }))}
                  className="w-full p-5 flex items-center justify-between text-left"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-black text-brand-red">Teaching week</p>
                    <h2 className="mt-1 text-base font-black text-slate-900 dark:text-white">{formatWeek(week)}</h2>
                    <p className="text-[11px] text-slate-500">{days.size} active day{days.size === 1 ? '' : 's'} · {total} session{total === 1 ? '' : 's'}</p>
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
                            onClick={() => setOpenDays(v => ({ ...v, [date]: !dayOpen }))}
                            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-950/40"
                          >
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white">{formatDay(date)}</p>
                              <p className="text-[11px] text-slate-500">{rows.length} session{rows.length === 1 ? '' : 's'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-bold text-slate-500">
                                {rows.map((r: Schedule) => r.startTime).filter(Boolean).join(' · ')}
                              </span>
                              {dayOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                          </button>
                          {dayOpen && (
                            <div className="px-5 pb-4 space-y-2">
                              {rows.map((session: Schedule) => {
                                const status = norm(session.status || 'scheduled');
                                return (
                                  <article key={session.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3">
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                      <div className="sm:w-36 shrink-0">
                                        <p className="text-sm font-black">{session.startTime || '—'} – {session.endTime || '—'}</p>
                                        <p className="text-[10px] text-slate-500 uppercase font-black">{statusLabel(status)}</p>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-black truncate">{session.title || session.programName || 'Class session'}</h3>
                                        <p className="text-xs text-slate-500 mt-1">{session.programName || session.programmeName || 'Programme'}{session.tutorName ? ` · ${session.tutorName}` : ''}</p>
                                        {session.deliveryMode === 'physical' && (
                                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1">
                                            <MapPin size={12} /> Physical class{session.locationRoom ? ` · ${session.locationRoom}` : ''}
                                          </p>
                                        )}
                                        {session.deliveryMode === 'online' && session.meetingLink && (
                                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1">
                                            <Video size={12} /> Online session
                                          </p>
                                        )}
                                      </div>
                                      {session.meetingLink && session.deliveryMode !== 'physical' && (
                                        <a href={session.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-red text-white px-3 py-2 text-[11px] font-black">
                                          <Video size={13} /> Join <ExternalLink size={11} />
                                        </a>
                                      )}
                                    </div>
                                    {status === 'absent' && session.absenceReason && (
                                      <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex gap-2">
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        <span><b>Why this class was marked absent:</b> {session.absenceReason}</span>
                                      </div>
                                    )}
                                    {status === 'cancelled' && session.cancellationReason && (
                                      <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                                        <b>Reason:</b> {session.cancellationReason}
                                      </div>
                                    )}
                                    {status === 'rescheduled' && (
                                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                                        <p><b>Why it was rescheduled:</b> {session.rescheduleReason || 'The tutor rescheduled this class.'}</p>
                                        {session.rescheduledToDate && (
                                          <p className="mt-1"><b>New session:</b> {formatDay(session.rescheduledToDate)} · {session.rescheduledToStartTime || '—'} – {session.rescheduledToEndTime || '—'}</p>
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
