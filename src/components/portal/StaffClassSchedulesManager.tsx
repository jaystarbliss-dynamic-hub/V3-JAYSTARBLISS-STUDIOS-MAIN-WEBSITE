import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  FileText,
  Loader2,
  Save,
  School,
  Umbrella,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';
import {
  academicApiWithFallback,
  fetchAcademicSchoolsFallback,
  fetchAcademicStudentsFallback,
} from '../../lib/academicFallback';
import { classesMatch, normalizeClassName } from '../../lib/classes';

export type Schedule = {
  id: string;
  date: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  programName?: string;
  programId?: string;
  studentId?: string;
  studentName?: string;
  studentEmail?: string;
  parentId?: string;
  parentEmail?: string;
  parentName?: string;
  tutorId?: string;
  tutorName?: string;
  tutorEmail?: string;
  meetingLink?: string;
  schoolId?: string;
  schoolName?: string;
  classLevel?: string;
  classLevels?: string[];
  targetType?: string;
  status?: string;
  deliveryMode?: string;
  cancellationReason?: string;
  absenceReason?: string;
  rescheduleReason?: string;
  rescheduledToDate?: string;
  rescheduledToStartTime?: string;
  rescheduledToEndTime?: string;
  scheduleGroupId?: string;
};

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

type RosterAttendanceRow = {
  studentId: string;
  studentName: string;
  className: string;
  status: AttendanceStatus;
  notes: string;
};

const monday = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  const n = d.getDay();
  d.setDate(d.getDate() + (n === 0 ? -6 : 1 - n));
  return d.toISOString().slice(0, 10);
};

const label = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

const statusLabel = (status?: string) =>
  String(status || 'SCHEDULED')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const needsReason = (status: string) => ['ABSENT', 'RESCHEDULED', 'CANCELLED'].includes(status);

interface Props {
  tutorId?: string;
  tutorName?: string;
  assignedSchools?: any[];
  assignedStudents?: any[];
  initialSchoolFilter?: string;
}

export const StaffClassSchedulesManager: React.FC<Props> = ({
  tutorId,
  tutorName,
  assignedSchools: propSchools,
  assignedStudents: propStudents,
  initialSchoolFilter = 'ALL',
}) => {
  const { toast } = useToast();
  const effective = getEffectiveAuth();
  const [rows, setRows] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedSchoolTab, setSelectedSchoolTab] = useState<string>(initialSchoolFilter);

  const [editing, setEditing] = useState<Schedule | null>(null);
  const [statusEditing, setStatusEditing] = useState<Schedule | null>(null);
  const [statusForm, setStatusForm] = useState({
    status: 'SCHEDULED',
    reason: '',
    newDate: '',
    newStartTime: '',
    newEndTime: '',
  });
  const [form, setForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    title: '',
    meetingLink: '',
  });
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [holidayWeek, setHolidayWeek] = useState<string | null>(null);
  const [holidayReason, setHolidayReason] = useState('Tutor holiday / no classes this week');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Session Attendance Modal State
  const [attendanceSession, setAttendanceSession] = useState<Schedule | null>(null);
  const [attendanceRoster, setAttendanceRoster] = useState<RosterAttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : '';
      const uid = tutorId || effective.effectiveUid || user?.uid || '';
      const name = (tutorName || effective.effectiveName || user?.displayName || '').toLowerCase();

      // Load authorised schools and students for multi-school filtering & attendance
      const [loadedSchools, loadedStudents] = await Promise.all([
        propSchools && propSchools.length
          ? Promise.resolve(propSchools)
          : fetchAcademicSchoolsFallback().catch(() => []),
        propStudents && propStudents.length
          ? Promise.resolve(propStudents)
          : fetchAcademicStudentsFallback().catch(() => []),
      ]);
      setSchools(
        loadedSchools.map((s: any) => ({
          id: s.id,
          name: s.name || s.schoolName || 'Partner School',
        }))
      );
      setStudents(loadedStudents);

      let list: Schedule[] = [];
      try {
        const r = await fetch('/.netlify/functions/class-schedules', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data.schedules)) {
            list = data.schedules;
          }
        }
      } catch {
        // Safely scoped query fallback by tutorId
      }

      if (!list.length && uid) {
        const snap = await getDocs(
          query(collection(db, 'classSchedules'), where('tutorId', '==', uid))
        ).catch(() => ({ docs: [] } as any));
        list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Schedule));
      }

      setRows(
        list.filter(
          (s) =>
            (uid && s.tutorId === uid) ||
            (name && s.tutorName && s.tutorName.toLowerCase() === name)
        )
      );
    } catch (e) {
      console.warn('Tutor schedules failed:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tutorId, tutorName, effective.effectiveUid, effective.effectiveName]);

  const filteredRows = useMemo(() => {
    const sorted = rows
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime))
      );
    return sorted.filter((r) => {
      if (
        filterStatus !== 'ALL' &&
        String(r.status || 'SCHEDULED').toUpperCase() !== filterStatus
      ) {
        return false;
      }
      if (selectedSchoolTab === 'PRIVATE') {
        return !r.schoolId || String(r.targetType || '').toUpperCase() === 'INDIVIDUAL';
      }
      if (selectedSchoolTab !== 'ALL') {
        return String(r.schoolId || '') === selectedSchoolTab;
      }
      return true;
    });
  }, [rows, filterStatus, selectedSchoolTab]);

  const weeks = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    filteredRows.forEach((r) => {
      const w = monday(r.date);
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(r);
    });
    return Array.from(map.entries());
  }, [filteredRows]);

  const counts = useMemo(
    () =>
      rows.reduce((acc, r) => {
        const s = String(r.status || 'SCHEDULED').toUpperCase();
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    [rows]
  );

  const openEdit = (r: Schedule) => {
    setEditing(r);
    setForm({
      date: r.date,
      startTime: r.startTime || '',
      endTime: r.endTime || '',
      title: r.title || '',
      meetingLink: r.meetingLink || '',
    });
  };

  const openStatus = (r: Schedule) => {
    const status = String(r.status || 'SCHEDULED').toUpperCase();
    setStatusEditing(r);
    setStatusForm({
      status,
      reason:
        status === 'ABSENT'
          ? r.absenceReason || ''
          : status === 'RESCHEDULED'
          ? r.rescheduleReason || ''
          : r.cancellationReason || '',
      newDate: r.rescheduledToDate || '',
      newStartTime: r.rescheduledToStartTime || r.startTime || '',
      newEndTime: r.rescheduledToEndTime || r.endTime || '',
    });
  };

  const openTakeAttendance = async (r: Schedule) => {
    setAttendanceSession(r);
    setAttendanceLoading(true);
    try {
      // Determine eligible students for this scheduled session
      let eligibleStudents: any[] = [];
      if (r.studentId) {
        const found = students.find((s) => s.id === r.studentId);
        eligibleStudents = found
          ? [found]
          : [
              {
                id: r.studentId,
                fullName: r.studentName || 'Private Learner',
                class: r.classLevel || 'Private Lesson',
              },
            ];
      } else if (r.schoolId) {
        const targetClasses = [
          ...(Array.isArray(r.classLevels) ? r.classLevels : []),
          ...(r.classLevel ? [r.classLevel] : []),
        ].filter(Boolean);

        eligibleStudents = students.filter((s) => {
          if (String(s.schoolId || '') !== String(r.schoolId || '')) return false;
          if (!targetClasses.length) return true;
          const sClass = s.class || s.grade || s.className || '';
          return !sClass || classesMatch(sClass, targetClasses);
        });
      } else {
        eligibleStudents = students.filter((s) => !s.schoolId);
      }

      // Fetch any existing attendance recorded for this scheduleId
      const existingData = await academicApiWithFallback(
        `/.netlify/functions/academic-attendance?scheduleId=${encodeURIComponent(r.id)}`
      ).catch(() => ({ records: [] }));
      const existingMap = new Map<string, any>();
      (existingData?.records || []).forEach((rec: any) => {
        if (rec?.studentId) existingMap.set(String(rec.studentId), rec);
      });

      const initialRoster: RosterAttendanceRow[] = eligibleStudents.map((s) => {
        const existing = existingMap.get(String(s.id));
        const rawStatus = String(existing?.status || 'PRESENT').toUpperCase();
        const validStatus: AttendanceStatus = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(
          rawStatus
        )
          ? (rawStatus as AttendanceStatus)
          : 'PRESENT';
        return {
          studentId: String(s.id),
          studentName: s.fullName || s.studentName || s.name || 'Student',
          className:
            normalizeClassName(s.class || s.grade || s.className || r.classLevel || '') ||
            r.classLevel ||
            'General',
          status: validStatus,
          notes: String(existing?.notes || ''),
        };
      });

      setAttendanceRoster(initialRoster);
    } catch (err) {
      console.warn('Error loading attendance roster:', err);
      toast.error('Could not load session roster.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleMarkAllPresent = () => {
    setAttendanceRoster((prev) =>
      prev.map((row) => ({
        ...row,
        status: 'PRESENT',
      }))
    );
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceSession || !attendanceRoster.length) return;
    setAttendanceSaving(true);
    try {
      await academicApiWithFallback('/.netlify/functions/academic-attendance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'batch',
          scheduleId: attendanceSession.id,
          schoolId: attendanceSession.schoolId || null,
          date: attendanceSession.date,
          sessionTitle:
            attendanceSession.title || attendanceSession.programName || 'Class Session',
          entries: attendanceRoster,
        }),
      });
      toast.success(
        `Saved attendance for ${attendanceRoster.length} learner(s) in ${
          attendanceSession.title || attendanceSession.programName || 'session'
        }.`
      );
      setAttendanceSession(null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save attendance.');
    } finally {
      setAttendanceSaving(false);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      if (!form.date || !form.startTime || !form.endTime || form.endTime <= form.startTime) {
        throw new Error('Please provide a valid date and time range.');
      }
      await updateDoc(doc(db, 'classSchedules', editing.id), {
        date: form.date,
        dayOfWeek: new Date(`${form.date}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
        }),
        startTime: form.startTime,
        endTime: form.endTime,
        title: form.title.trim() || editing.title || 'Class session',
        meetingLink: form.meetingLink.trim(),
        updatedAt: serverTimestamp(),
        editedBy: effective.effectiveUid || auth.currentUser?.uid || null,
      });
      toast.success('Class session updated.');
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Unable to update class session.');
    } finally {
      setSaving(false);
    }
  };

  const saveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusEditing) return;
    const next = statusForm.status.toUpperCase();
    if (needsReason(next) && !statusForm.reason.trim()) {
      return toast.error(
        `Please enter the reason for marking this class ${statusLabel(next).toLowerCase()}.`
      );
    }
    if (
      next === 'RESCHEDULED' &&
      (!statusForm.newDate ||
        !statusForm.newStartTime ||
        !statusForm.newEndTime ||
        statusForm.newEndTime <= statusForm.newStartTime)
    ) {
      return toast.error(
        'Please set the new date and a valid new time range for the rescheduled class.'
      );
    }
    if (
      next === 'RESCHEDULED' &&
      statusForm.newDate === statusEditing.date &&
      statusForm.newStartTime === statusEditing.startTime
    ) {
      return toast.error('The rescheduled class must have a new date or time.');
    }
    setStatusSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Your session has expired. Please sign in again.');
      const token = await user.getIdToken();
      const response = await fetch('/.netlify/functions/class-schedule-status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: statusEditing.id,
          status: next,
          reason: statusForm.reason.trim(),
          newDate: statusForm.newDate,
          newStartTime: statusForm.newStartTime,
          newEndTime: statusForm.newEndTime,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update class status.');
      toast.success(
        next === 'RESCHEDULED'
          ? 'Class rescheduled. The new session has been added to the new date.'
          : `Class marked ${statusLabel(next).toLowerCase()}.`
      );
      setStatusEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Unable to update class status.');
    } finally {
      setStatusSaving(false);
    }
  };

  const markWeekHoliday = async () => {
    if (!holidayWeek) return;
    const ids = rows
      .filter(
        (r) =>
          monday(r.date) === holidayWeek &&
          !['COMPLETED', 'ABSENT', 'RESCHEDULED'].includes(String(r.status || '').toUpperCase())
      )
      .map((r) => r.id);
    if (!ids.length) {
      toast.info('There are no active sessions in that week.');
      setHolidayWeek(null);
      return;
    }
    try {
      const batch = writeBatch(db);
      ids.forEach((id) =>
        batch.update(doc(db, 'classSchedules', id), {
          status: 'CANCELLED',
          cancellationReason: holidayReason.trim() || 'Tutor holiday / no classes this week',
          holidayWeek: true,
          updatedAt: serverTimestamp(),
        })
      );
      await batch.commit();
      toast.success('The selected week has been marked as a holiday.');
      setHolidayWeek(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Unable to mark the week as a holiday.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Clean Horizontal Assigned-School Selector */}
      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 touch-pan-x">
        <button
          type="button"
          onClick={() => setSelectedSchoolTab('ALL')}
          className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
            selectedSchoolTab === 'ALL'
              ? 'text-[#14284B] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          All Authorised Schedules ({rows.length})
          {selectedSchoolTab === 'ALL' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
          )}
        </button>

        {schools.map((sch) => {
          const active = selectedSchoolTab === sch.id;
          const count = rows.filter((r) => String(r.schoolId || '') === sch.id).length;
          return (
            <button
              key={sch.id}
              type="button"
              onClick={() => setSelectedSchoolTab(sch.id)}
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
          onClick={() => setSelectedSchoolTab('PRIVATE')}
          className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedSchoolTab === 'PRIVATE'
              ? 'text-[#14284B] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Users size={14} className="text-emerald-600 shrink-0" />
          <span>Private Learners</span>
          {selectedSchoolTab === 'PRIVATE' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
          )}
        </button>
      </div>

      {/* Status Filter Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex flex-wrap gap-2">
        {[
          'ALL',
          'SCHEDULED',
          'ONGOING',
          'COMPLETED',
          'ATTENDED',
          'ABSENT',
          'CANCELLED',
          'RESCHEDULED',
        ].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilterStatus(status)}
            className={`rounded-xl px-3 py-2 text-[11px] font-black cursor-pointer ${
              filterStatus === status
                ? 'bg-brand-red text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {statusLabel(status)}{' '}
            <span className="opacity-70">
              ({status === 'ALL' ? rows.length : counts[status] || 0})
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="min-h-40 grid place-items-center text-sm text-slate-500">
          <Loader2 className="animate-spin mr-2 inline" size={18} /> Loading your classes…
        </div>
      ) : !weeks.length ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
          No classes match this filter.
        </div>
      ) : (
        weeks.map(([week, weekRows]) => (
          <section
            key={week}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-black text-brand-red">
                  Teaching week
                </p>
                <h3 className="text-sm font-black">Week of {label(week)}</h3>
                <p className="text-[11px] text-slate-500">
                  {weekRows.length} session{weekRows.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHolidayWeek(week)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 text-amber-700 px-3 py-2 text-[11px] font-black cursor-pointer"
              >
                <Umbrella size={13} /> Mark week as holiday
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {weekRows.map((r) => {
                const status = String(r.status || 'SCHEDULED').toUpperCase();
                return (
                  <div
                    key={r.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center gap-3"
                  >
                    <div className="lg:w-40 shrink-0">
                      <p className="text-xs font-black">{label(r.date)}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock size={12} /> {r.startTime || '—'} – {r.endTime || '—'}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">
                        {r.title || r.programName || 'Class session'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {r.schoolName ? `${r.schoolName} · ` : ''}
                        {r.classLevel
                          ? `${r.classLevel} · `
                          : r.studentName
                          ? `${r.studentName} · `
                          : ''}
                        {r.programName || 'Academic Programme'} · {statusLabel(status)}
                      </p>
                      {status === 'ABSENT' && r.absenceReason && (
                        <p className="text-[11px] text-rose-600 mt-1">
                          Reason: {r.absenceReason}
                        </p>
                      )}
                      {status === 'RESCHEDULED' && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          {r.rescheduleReason || 'Rescheduled'}
                          {r.rescheduledToDate
                            ? ` · New session: ${label(r.rescheduledToDate)} ${
                                r.rescheduledToStartTime || ''
                              }–${r.rescheduledToEndTime || ''}`
                            : ''}
                        </p>
                      )}
                      {status === 'CANCELLED' && r.cancellationReason && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Reason: {r.cancellationReason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void openTakeAttendance(r)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-[11px] font-black cursor-pointer"
                      >
                        <ClipboardCheck size={13} /> Take Attendance
                      </button>
                      <button
                        type="button"
                        onClick={() => openStatus(r)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11px] font-black cursor-pointer"
                      >
                        <FileText size={13} /> Status
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11px] font-black cursor-pointer"
                      >
                        <Edit3 size={13} /> Edit session
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* Take Session Attendance Modal */}
      {attendanceSession && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleSaveAttendance}
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
          >
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-black text-blue-600">
                  Scheduled Class Attendance
                </p>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {attendanceSession.title || attendanceSession.programName || 'Class Session'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {attendanceSession.schoolName || 'Private Lesson'} ·{' '}
                  {attendanceSession.classLevel ||
                    attendanceSession.studentName ||
                    'Assigned Roster'}{' '}
                  · {label(attendanceSession.date)} ({attendanceSession.startTime || '—'} –{' '}
                  {attendanceSession.endTime || '—'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAttendanceSession(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {attendanceRoster.length} learner(s) in session roster
                </span>
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
                >
                  <CheckCircle2 size={14} /> Mark All Present
                </button>
              </div>

              {attendanceLoading ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  <Loader2 size={18} className="animate-spin inline mr-2" />
                  Loading class roster…
                </div>
              ) : attendanceRoster.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 border border-dashed rounded-xl">
                  No students found in this class roster yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {attendanceRoster.map((row, idx) => (
                    <div
                      key={row.studentId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {row.studentName}
                        </p>
                        <p className="text-[11px] text-slate-500">{row.className}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((st) => {
                          const active = row.status === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() =>
                                setAttendanceRoster((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, status: st } : item
                                  )
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                                active
                                  ? st === 'PRESENT'
                                    ? 'bg-emerald-600 text-white'
                                    : st === 'ABSENT'
                                    ? 'bg-rose-600 text-white'
                                    : st === 'LATE'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-blue-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {st}
                            </button>
                          );
                        })}
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) =>
                            setAttendanceRoster((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, notes: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Optional note / reason"
                          className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs w-full sm:w-44"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-900/40">
              <button
                type="button"
                onClick={() => setAttendanceSession(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={attendanceSaving || !attendanceRoster.length}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {attendanceSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save Attendance Roster
              </button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={saveEdit}
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black">Edit class session</h3>
                <p className="text-xs text-slate-500">Changes apply to this session only.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Session title"
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="rounded-xl border px-3 py-2.5 text-sm"
              />
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="rounded-xl border px-3 py-2.5 text-sm"
              />
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="rounded-xl border px-3 py-2.5 text-sm"
              />
            </div>
            <input
              type="url"
              value={form.meetingLink}
              onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
              placeholder="Meeting link (online classes)"
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
            />
            <button
              disabled={saving}
              className="w-full rounded-xl bg-brand-red text-white py-2.5 text-xs font-black inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              changes
            </button>
          </form>
        </div>
      )}

      {statusEditing && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <form
            onSubmit={saveStatus}
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-black text-brand-red">
                  Class status
                </p>
                <h3 className="text-base font-black">
                  Update {statusEditing.title || statusEditing.programName || 'class session'}
                </h3>
                <p className="text-xs text-slate-500">
                  A reason is required for absent, cancelled or rescheduled sessions.
                </p>
              </div>
              <button type="button" onClick={() => setStatusEditing(null)}>
                <X size={18} />
              </button>
            </div>
            <select
              value={statusForm.status}
              onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
              className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold"
            >
              {[
                'SCHEDULED',
                'ONGOING',
                'COMPLETED',
                'ATTENDED',
                'ABSENT',
                'CANCELLED',
                'RESCHEDULED',
              ].map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            {needsReason(statusForm.status) && (
              <textarea
                required
                value={statusForm.reason}
                onChange={(e) => setStatusForm({ ...statusForm, reason: e.target.value })}
                rows={4}
                placeholder="Explain why this class was absent, cancelled or rescheduled..."
                className="w-full rounded-xl border p-3 text-sm"
              />
            )}
            {statusForm.status === 'RESCHEDULED' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <p className="text-xs font-black text-amber-900">New class date &amp; time</p>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="date"
                    required
                    value={statusForm.newDate}
                    onChange={(e) => setStatusForm({ ...statusForm, newDate: e.target.value })}
                    className="rounded-xl border px-3 py-2.5 text-sm"
                  />
                  <input
                    type="time"
                    required
                    value={statusForm.newStartTime}
                    onChange={(e) =>
                      setStatusForm({ ...statusForm, newStartTime: e.target.value })
                    }
                    className="rounded-xl border px-3 py-2.5 text-sm"
                  />
                  <input
                    type="time"
                    required
                    value={statusForm.newEndTime}
                    onChange={(e) => setStatusForm({ ...statusForm, newEndTime: e.target.value })}
                    className="rounded-xl border px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            )}
            <button
              disabled={statusSaving}
              className="w-full rounded-xl bg-brand-red text-white py-2.5 text-xs font-black inline-flex items-center justify-center gap-2"
            >
              {statusSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CalendarClock size={14} />
              )}{' '}
              Save status
            </button>
          </form>
        </div>
      )}

      {holidayWeek && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">Mark week as holiday</h3>
              <button onClick={() => setHolidayWeek(null)}>
                <XCircle size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              All active sessions in this teaching week will be marked cancelled with the holiday
              reason.
            </p>
            <textarea
              value={holidayReason}
              onChange={(e) => setHolidayReason(e.target.value)}
              className="w-full rounded-xl border p-3 text-sm"
              rows={3}
            />
            <button
              onClick={() => void markWeekHoliday()}
              className="w-full rounded-xl bg-slate-900 text-white py-2.5 text-xs font-black"
            >
              Confirm holiday week
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default StaffClassSchedulesManager;
