import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  School,
  Sparkles,
  Umbrella,
  User,
  Users,
  Video,
  X,
  XCircle,
  AlertCircle,
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
import { CANONICAL_CLASSES, classesMatch, normalizeClassList, normalizeClassName } from '../../lib/classes';
import {
  type AuthorizedSchoolOption,
  type PrivateStudentOption,
  SCHEDULE_DAYS_OF_WEEK,
  type TutorSchedulingScope,
  addMinutesToTime,
  calculateDurationMinutes,
  canTutorManageSchedule,
  loadSchedulingDirectory,
  updateScheduleMeetingLink,
  validateMeetingLink,
} from '../../lib/scheduleEngine';

export type Schedule = {
  id: string;
  date: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
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
  platform?: string;
  schoolId?: string;
  schoolName?: string;
  classLevel?: string;
  classLevels?: string[];
  combinedClasses?: string[];
  targetType?: string;
  status?: string;
  deliveryMode?: string;
  recurring?: boolean;
  selectedDays?: string[];
  cancellationReason?: string;
  absenceReason?: string;
  rescheduleReason?: string;
  rescheduledToDate?: string;
  rescheduledToStartTime?: string;
  rescheduledToEndTime?: string;
  scheduleGroupId?: string;
  createdByUid?: string;
  createdByName?: string;
  createdByRole?: string;
  updatedByName?: string;
  updatedByRole?: string;
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

const addDaysToDateStr = (dateStr: string, daysToAdd: number): string => {
  const parts = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, (parts[2] || 1) + daysToAdd, 12, 0, 0));
  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}-${String(utcDate.getUTCDate()).padStart(2, '0')}`;
};

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
  const [schools, setSchools] = useState<AuthorizedSchoolOption[]>([]);
  const [privateStudents, setPrivateStudents] = useState<PrivateStudentOption[]>([]);
  const [studioPrograms, setStudioPrograms] = useState<string[]>([]);
  const [tutorScope, setTutorScope] = useState<TutorSchedulingScope | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedSchoolTab, setSelectedSchoolTab] = useState<string>(initialSchoolFilter);

  // Single Session Edit Modal
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    title: '',
    meetingLink: '',
    applyLinkToSeries: true,
  });

  // Quick Meeting Link Modal
  const [linkModalSchedule, setLinkModalSchedule] = useState<Schedule | null>(null);
  const [linkModalUrl, setLinkModalUrl] = useState('');
  const [linkModalApplySeries, setLinkModalApplySeries] = useState(true);
  const [linkSaving, setLinkSaving] = useState(false);

  // Create Schedule / Timetable Modal (School & Program OR Private Student)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{
    scheduleLevel: 'school' | 'private';
    schoolId: string;
    programId: string;
    programName: string;
    classScope: 'all' | 'range' | 'specific';
    rangeStart: string;
    rangeEnd: string;
    classLevels: string[];
    studentId: string;
    title: string;
    startDate: string;
    startTime: string;
    durationMinutes: number;
    endTime: string;
    recurring: boolean;
    selectedDays: string[];
    weeks: number;
    meetingLink: string;
  }>({
    scheduleLevel: 'private',
    schoolId: '',
    programId: '',
    programName: 'Coding for Kids',
    classScope: 'all',
    rangeStart: 'Grade 1',
    rangeEnd: 'Grade 6',
    classLevels: ['Grade 1', 'Grade 2', 'Grade 3'],
    studentId: '',
    title: '',
    startDate: new Date().toISOString().slice(0, 10),
    startTime: '16:00',
    durationMinutes: 60,
    endTime: '17:00',
    recurring: true,
    selectedDays: ['Monday', 'Wednesday'],
    weeks: 8,
    meetingLink: '',
  });
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // Status / Reschedule Modal
  const [statusEditing, setStatusEditing] = useState<Schedule | null>(null);
  const [statusForm, setStatusForm] = useState({
    status: 'SCHEDULED',
    reason: '',
    newDate: '',
    newStartTime: '',
    newEndTime: '',
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
      const uid = tutorId || effective.effectiveUid || sessionStorage.getItem('userId') || user?.uid || '';
      const rawName = tutorName || effective.effectiveName || sessionStorage.getItem('userName') || user?.displayName || '';
      const email = effective.effectiveEmail || sessionStorage.getItem('userEmail') || user?.email || '';

      const [dirData, fallbackSchools, fallbackStudents, allSchedSnap] = await Promise.all([
        loadSchedulingDirectory({
          role: 'tutor',
          uid,
          name: rawName,
          email,
        }),
        propSchools && propSchools.length
          ? Promise.resolve(propSchools)
          : fetchAcademicSchoolsFallback().catch(() => []),
        propStudents && propStudents.length
          ? Promise.resolve(propStudents)
          : fetchAcademicStudentsFallback().catch(() => []),
        getDocs(collection(db, 'classSchedules')).catch(() => ({ docs: [] } as any)),
      ]);

      // Merge any prop/fallback schools into authorized schools list
      const schoolMap = new Map<string, AuthorizedSchoolOption>();
      dirData.schools.forEach((s) => schoolMap.set(s.id, s));
      fallbackSchools.forEach((fs: any) => {
        if (fs?.id && !schoolMap.has(fs.id)) {
          const rawProgs = Array.isArray(fs.programs) ? fs.programs : [];
          schoolMap.set(fs.id, {
            id: fs.id,
            name: fs.name || fs.schoolName || 'Partner School',
            programs:
              rawProgs.length > 0
                ? rawProgs.map((p: any, i: number) =>
                    typeof p === 'string'
                      ? { id: `prog-${i}`, name: p }
                      : { id: p.id || `prog-${i}`, name: p.name || p.title || 'Coding for Kids' }
                  )
                : [
                    { id: 'prog-coding', name: 'Coding for Kids' },
                    { id: 'prog-ai', name: 'AI Responsibility & Digital Literacy' },
                    { id: 'prog-robotics', name: 'Robotics & Embedded IoT' },
                  ],
          });
        }
      });

      const resolvedSchools = Array.from(schoolMap.values());
      setSchools(resolvedSchools);
      setPrivateStudents(dirData.privateStudents);
      setStudioPrograms(dirData.studioPrograms);
      setTutorScope({
        ...dirData.tutorScope,
        authorizedSchools: resolvedSchools,
      });
      setStudents(fallbackStudents);

      // Combine API schedules and direct Firestore schedules scoped to Tutor
      let apiList: Schedule[] = [];
      try {
        const r = await fetch('/.netlify/functions/class-schedules', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data.schedules)) {
            apiList = data.schedules;
          }
        }
      } catch {
        // Fallback to direct Firestore
      }

      const firestoreList: Schedule[] = allSchedSnap.docs.map(
        (d: any) => ({ id: d.id, ...d.data() } as Schedule)
      );

      const mergedMap = new Map<string, Schedule>();
      [...apiList, ...firestoreList].forEach((s) => {
        if (s && s.id) mergedMap.set(s.id, s);
      });

      const enhancedScope: TutorSchedulingScope = {
        ...dirData.tutorScope,
        authorizedSchools: resolvedSchools,
      };

      const nameLower = rawName.toLowerCase().trim();
      const authorizedRows = Array.from(mergedMap.values()).filter((s) => {
        if (uid && (s.tutorId === uid || s.createdByUid === uid)) return true;
        if (nameLower && s.tutorName && s.tutorName.toLowerCase().trim() === nameLower) return true;
        return canTutorManageSchedule(s, enhancedScope);
      });

      setRows(authorizedRows);
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
          String(a.date || '').localeCompare(String(b.date || '')) ||
          String(a.startTime || '').localeCompare(String(b.startTime || ''))
      );
    return sorted.filter((r) => {
      if (
        filterStatus !== 'ALL' &&
        String(r.status || 'SCHEDULED').toUpperCase() !== filterStatus
      ) {
        return false;
      }
      if (selectedSchoolTab === 'PRIVATE') {
        return (
          !r.schoolId ||
          ['INDIVIDUAL', 'PRIVATE', 'STUDENT', 'PARENT'].includes(
            String(r.targetType || '').toUpperCase()
          )
        );
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
      if (!r.date) return;
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

  // Resolved class levels for School Schedule creation
  const resolvedCreateClasses = useMemo(() => {
    if (createForm.classScope === 'all') return [...CANONICAL_CLASSES];
    if (createForm.classScope === 'range') {
      const a = CANONICAL_CLASSES.indexOf(createForm.rangeStart as any);
      const b = CANONICAL_CLASSES.indexOf(createForm.rangeEnd as any);
      const startIdx = Math.max(0, Math.min(a, b));
      const endIdx = Math.max(a, b);
      return CANONICAL_CLASSES.slice(startIdx, endIdx + 1);
    }
    return createForm.classLevels;
  }, [createForm.classScope, createForm.rangeStart, createForm.rangeEnd, createForm.classLevels]);

  const openCreateScheduleModal = (defaultLevel?: 'school' | 'private') => {
    const level =
      defaultLevel ||
      (selectedSchoolTab === 'PRIVATE'
        ? 'private'
        : schools.length > 0
        ? 'school'
        : 'private');

    const defaultSchool =
      selectedSchoolTab !== 'ALL' && selectedSchoolTab !== 'PRIVATE'
        ? schools.find((s) => s.id === selectedSchoolTab) || schools[0]
        : schools[0];
    const defaultSchoolProg = defaultSchool?.programs?.[0];
    const defaultPrivStudent = privateStudents[0];

    setCreateForm({
      scheduleLevel: level,
      schoolId: defaultSchool?.id || '',
      programId: level === 'school' ? defaultSchoolProg?.id || '' : '',
      programName:
        level === 'school'
          ? defaultSchoolProg?.name || 'Coding for Kids'
          : defaultPrivStudent?.primaryProgram || 'Coding for Kids',
      classScope: 'all',
      rangeStart: 'Grade 1',
      rangeEnd: 'Grade 6',
      classLevels: ['Grade 1', 'Grade 2', 'Grade 3'],
      studentId: defaultPrivStudent?.id || '',
      title:
        level === 'school'
          ? defaultSchoolProg?.name || 'Coding for Kids'
          : defaultPrivStudent
          ? `${defaultPrivStudent.primaryProgram} – ${defaultPrivStudent.name}`
          : 'Private Coding Session',
      startDate: new Date().toISOString().slice(0, 10),
      startTime: '16:00',
      durationMinutes: 60,
      endTime: '17:00',
      recurring: true,
      selectedDays: ['Monday', 'Wednesday'],
      weeks: 8,
      meetingLink: '',
    });
    setShowCreateModal(true);
  };

  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.startDate || !createForm.startTime || !createForm.endTime) {
      return toast.error('Please configure the class start date and time window.');
    }
    if (createForm.endTime <= createForm.startTime) {
      return toast.error('Class end time must be after the start time.');
    }

    if (createForm.meetingLink.trim()) {
      const linkCheck = validateMeetingLink(createForm.meetingLink);
      if (!linkCheck.valid) {
        return toast.error(linkCheck.error || 'Please enter a valid meeting URL.');
      }
    }

    if (createForm.scheduleLevel === 'school' && !createForm.schoolId) {
      return toast.error('Please select an assigned partner school.');
    }
    if (createForm.scheduleLevel === 'school' && !createForm.programName.trim()) {
      return toast.error('Please select the program for this school schedule.');
    }
    if (createForm.scheduleLevel === 'private' && !createForm.studentId) {
      return toast.error('Please select an assigned private student.');
    }

    const activeDays = createForm.recurring
      ? createForm.selectedDays.length > 0
        ? createForm.selectedDays
        : [
            new Date(`${createForm.startDate}T12:00:00`).toLocaleDateString('en-US', {
              weekday: 'long',
            }),
          ]
      : [
          new Date(`${createForm.startDate}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'long',
          }),
        ];

    setCreatingSchedule(true);
    try {
      const user = auth.currentUser;
      const actorUid = tutorId || effective.effectiveUid || sessionStorage.getItem('userId') || user?.uid || '';
      const actorName =
        tutorName ||
        effective.effectiveName ||
        sessionStorage.getItem('userName') ||
        user?.displayName ||
        tutorScope?.tutorName ||
        'Assigned Tutor';
      const actorEmail =
        effective.effectiveEmail || sessionStorage.getItem('userEmail') || user?.email || '';

      const linkValidation = validateMeetingLink(createForm.meetingLink);
      const normalizedLink = createForm.meetingLink.trim() ? linkValidation.normalizedUrl : '';
      const platform = linkValidation.platform;
      const durationMinutes = calculateDurationMinutes(createForm.startTime, createForm.endTime);

      const numWeeks = createForm.recurring ? Math.max(1, Math.min(52, Number(createForm.weeks) || 8)) : 1;
      const scheduleGroupId = `grp-tutor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const [startYear, startMonth, startDay] = createForm.startDate.split('-').map(Number);
      const baseUtc = new Date(Date.UTC(startYear, (startMonth || 1) - 1, startDay || 1, 12, 0, 0));
      const startDayOfWeek = baseUtc.getUTCDay();
      const dayNameToIndex: Record<string, number> = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
      };

      const selectedSchool = schools.find((s) => s.id === createForm.schoolId);
      const selectedStudent = privateStudents.find((s) => s.id === createForm.studentId);

      const docsToWrite: Array<{ id: string; data: Record<string, any> }> = [];

      for (let w = 0; w < numWeeks; w++) {
        for (const dayName of activeDays) {
          let dayOffset = (dayNameToIndex[dayName] ?? startDayOfWeek) - startDayOfWeek;
          if (dayOffset < 0) dayOffset += 7;
          const dateStr = createForm.recurring
            ? addDaysToDateStr(createForm.startDate, w * 7 + dayOffset)
            : createForm.startDate;

          const occId = `${scheduleGroupId}-w${w}-${dayName.slice(0, 3)}`;

          if (createForm.scheduleLevel === 'school') {
            const targetClasses = normalizeClassList(resolvedCreateClasses);
            const progTitle = createForm.programName.trim() || 'Coding for Kids';
            const sessionTitle = createForm.title.trim() || progTitle;

            docsToWrite.push({
              id: occId,
              data: {
                id: occId,
                scheduleGroupId,
                targetType: 'school',
                schoolId: selectedSchool?.id || createForm.schoolId,
                schoolName: selectedSchool?.name || 'Partner School',
                programId: createForm.programId || `prog-${progTitle.toLowerCase().replace(/\s+/g, '-')}`,
                programName: progTitle,
                title: sessionTitle,
                classLevel:
                  targetClasses.length === CANONICAL_CLASSES.length
                    ? 'All Classes'
                    : targetClasses.join(' & '),
                classLevels: targetClasses,
                combinedClasses: targetClasses,
                date: dateStr,
                dayOfWeek: dayName,
                selectedDays: activeDays,
                startTime: createForm.startTime,
                endTime: createForm.endTime,
                durationMinutes,
                recurring: createForm.recurring,
                occurrenceIndex: w + 1,
                occurrenceTotal: numWeeks,
                meetingLink: normalizedLink,
                platform,
                deliveryMode: normalizedLink ? 'online' : 'physical',
                tutorId: actorUid,
                tutorName: actorName,
                tutorEmail: actorEmail,
                status: 'SCHEDULED',
                createdByUid: actorUid,
                createdByName: actorName,
                createdByRole: 'TUTOR',
                createdAt: new Date().toISOString(),
              },
            });
          } else {
            const progTitle =
              createForm.programName.trim() ||
              selectedStudent?.primaryProgram ||
              'Coding for Kids';
            const sessionTitle =
              createForm.title.trim() ||
              `${progTitle} – ${selectedStudent?.name || 'Private Student'}`;

            docsToWrite.push({
              id: occId,
              data: {
                id: occId,
                scheduleGroupId,
                targetType: 'individual',
                studentId: selectedStudent?.id || createForm.studentId,
                studentName: selectedStudent?.name || 'Private Student',
                studentEmail: selectedStudent?.email || '',
                parentId: selectedStudent?.parentId || '',
                parentName: selectedStudent?.parentName || '',
                parentEmail: selectedStudent?.parentEmail || '',
                classLevel: selectedStudent?.className || 'Grade 1',
                programId: `prog-${progTitle.toLowerCase().replace(/\s+/g, '-')}`,
                programName: progTitle,
                title: sessionTitle,
                date: dateStr,
                dayOfWeek: dayName,
                selectedDays: activeDays,
                startTime: createForm.startTime,
                endTime: createForm.endTime,
                durationMinutes,
                recurring: createForm.recurring,
                occurrenceIndex: w + 1,
                occurrenceTotal: numWeeks,
                meetingLink: normalizedLink,
                platform,
                deliveryMode: 'online',
                tutorId: actorUid,
                tutorName: actorName,
                tutorEmail: actorEmail,
                status: 'SCHEDULED',
                createdByUid: actorUid,
                createdByName: actorName,
                createdByRole: 'TUTOR',
                createdAt: new Date().toISOString(),
              },
            });
          }
        }
      }

      for (let i = 0; i < docsToWrite.length; i += 300) {
        const chunk = docsToWrite.slice(i, i + 300);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          batch.set(doc(db, 'classSchedules', item.id), item.data);
        });
        await batch.commit();
      }

      toast.success(
        createForm.scheduleLevel === 'school'
          ? `Published ${createForm.programName} schedule for ${selectedSchool?.name} (${docsToWrite.length} session${docsToWrite.length === 1 ? '' : 's'}). Automatically synced to enrolled student portals.`
          : `Scheduled ${docsToWrite.length} session${docsToWrite.length === 1 ? '' : 's'} for ${selectedStudent?.name} (${createForm.programName}).`
      );
      setShowCreateModal(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to create class schedule.');
    } finally {
      setCreatingSchedule(false);
    }
  };

  const openQuickLinkModal = (r: Schedule) => {
    setLinkModalSchedule(r);
    setLinkModalUrl(r.meetingLink || '');
    setLinkModalApplySeries(Boolean(r.scheduleGroupId));
  };

  const handleSaveMeetingLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkModalSchedule) return;
    setLinkSaving(true);
    try {
      const user = auth.currentUser;
      const actorUid = tutorId || effective.effectiveUid || sessionStorage.getItem('userId') || user?.uid || '';
      const actorName =
        tutorName ||
        effective.effectiveName ||
        sessionStorage.getItem('userName') ||
        user?.displayName ||
        'Assigned Tutor';

      const updatedCount = await updateScheduleMeetingLink({
        scheduleId: linkModalSchedule.id,
        scheduleGroupId: linkModalSchedule.scheduleGroupId,
        meetingLink: linkModalUrl,
        applyToSeries: linkModalApplySeries && Boolean(linkModalSchedule.scheduleGroupId),
        actorUid,
        actorName,
        actorRole: 'TUTOR',
      });

      toast.success(
        updatedCount > 1
          ? `Meeting link updated across ${updatedCount} sessions in this series.`
          : 'Class meeting link updated.'
      );
      setLinkModalSchedule(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update meeting link.');
    } finally {
      setLinkSaving(false);
    }
  };

  const openEdit = (r: Schedule) => {
    setEditing(r);
    setForm({
      date: r.date,
      startTime: r.startTime || '',
      endTime: r.endTime || '',
      title: r.title || '',
      meetingLink: r.meetingLink || '',
      applyLinkToSeries: Boolean(r.scheduleGroupId),
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
          ...(r.classLevel && r.classLevel !== 'All Classes' ? [r.classLevel] : []),
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
      const linkCheck = validateMeetingLink(form.meetingLink);
      if (form.meetingLink.trim() && !linkCheck.valid) {
        throw new Error(linkCheck.error || 'Please enter a valid meeting link URL.');
      }
      const cleanUrl = form.meetingLink.trim() ? linkCheck.normalizedUrl : '';
      const actorUid = effective.effectiveUid || auth.currentUser?.uid || null;
      const actorName =
        tutorName ||
        effective.effectiveName ||
        sessionStorage.getItem('userName') ||
        auth.currentUser?.displayName ||
        'Assigned Tutor';

      await updateDoc(doc(db, 'classSchedules', editing.id), {
        date: form.date,
        dayOfWeek: new Date(`${form.date}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
        }),
        startTime: form.startTime,
        endTime: form.endTime,
        durationMinutes: calculateDurationMinutes(form.startTime, form.endTime),
        title: form.title.trim() || editing.title || 'Class session',
        meetingLink: cleanUrl,
        platform: linkCheck.platform,
        updatedAt: serverTimestamp(),
        editedBy: actorUid,
        updatedByUid: actorUid,
        updatedByName: actorName,
        updatedByRole: 'TUTOR',
      });

      if (form.applyLinkToSeries && editing.scheduleGroupId) {
        await updateScheduleMeetingLink({
          scheduleId: editing.id,
          scheduleGroupId: editing.scheduleGroupId,
          meetingLink: cleanUrl,
          applyToSeries: true,
          actorUid: actorUid || undefined,
          actorName,
          actorRole: 'TUTOR',
        });
      }

      toast.success('Class session updated and synced to student portals.');
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
      const actorUid = effective.effectiveUid || user?.uid || null;
      const actorName =
        tutorName ||
        effective.effectiveName ||
        sessionStorage.getItem('userName') ||
        user?.displayName ||
        'Assigned Tutor';

      let handledByApi = false;
      if (user) {
        try {
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
          if (response.ok) {
            handledByApi = true;
          }
        } catch {
          // Fall back to direct Firestore update below
        }
      }

      if (!handledByApi) {
        const updatePayload: Record<string, any> = {
          status: next,
          updatedAt: serverTimestamp(),
          updatedByUid: actorUid,
          updatedByName: actorName,
          updatedByRole: 'TUTOR',
        };
        if (next === 'ABSENT') updatePayload.absenceReason = statusForm.reason.trim();
        if (next === 'CANCELLED') updatePayload.cancellationReason = statusForm.reason.trim();
        if (next === 'RESCHEDULED') {
          updatePayload.rescheduleReason = statusForm.reason.trim();
          updatePayload.rescheduledToDate = statusForm.newDate;
          updatePayload.rescheduledToStartTime = statusForm.newStartTime;
          updatePayload.rescheduledToEndTime = statusForm.newEndTime;
        }
        await updateDoc(doc(db, 'classSchedules', statusEditing.id), updatePayload);
      }

      toast.success(
        next === 'RESCHEDULED'
          ? 'Class rescheduled and reflected in student portals.'
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

  const toggleCreateDay = (dayFull: string) => {
    setCreateForm((prev) => {
      const exists = prev.selectedDays.includes(dayFull);
      if (exists && prev.selectedDays.length === 1) {
        return prev;
      }
      const nextDays = exists
        ? prev.selectedDays.filter((d) => d !== dayFull)
        : [...prev.selectedDays, dayFull];
      return { ...prev, selectedDays: nextDays };
    });
  };

  const createLinkValidation = useMemo(
    () => validateMeetingLink(createForm.meetingLink),
    [createForm.meetingLink]
  );

  const quickLinkValidation = useMemo(
    () => validateMeetingLink(linkModalUrl),
    [linkModalUrl]
  );

  return (
    <div className="space-y-4">
      {/* Top Action Header Bar for Tutor Schedule Creation */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-brand-red/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-brand-red">
              <Sparkles size={11} /> Tutor Schedule Workspace
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              {schools.length} Assigned School{schools.length === 1 ? '' : 's'} ·{' '}
              {privateStudents.length} Assigned Private Student{privateStudents.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            Create and manage class schedules &amp; joining links for your assigned private students and school programs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => openCreateScheduleModal('private')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-black shadow-xs cursor-pointer"
          >
            <User size={13} />
            <span>+ Private Student Schedule</span>
          </button>

          <button
            type="button"
            onClick={() => openCreateScheduleModal('school')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-red hover:bg-red-700 text-white px-3.5 py-2 text-xs font-black shadow-xs cursor-pointer"
          >
            <CalendarPlus size={14} />
            <span>+ School Program Schedule</span>
          </button>
        </div>
      </div>

      {/* Clean Horizontal Assigned-School & Private Student Selector */}
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
          <span>
            Private Learners (
            {
              rows.filter(
                (r) =>
                  !r.schoolId ||
                  ['INDIVIDUAL', 'PRIVATE', 'STUDENT', 'PARENT'].includes(
                    String(r.targetType || '').toUpperCase()
                  )
              ).length
            }
            )
          </span>
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
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
          <CalendarClock className="mx-auto text-slate-400" size={32} />
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              No scheduled classes match this view
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Create a schedule for an assigned private student or school program to synchronize their portal timetable.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => openCreateScheduleModal('private')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-black cursor-pointer"
            >
              <Plus size={14} /> Schedule Private Student
            </button>
            <button
              type="button"
              onClick={() => openCreateScheduleModal('school')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-red hover:bg-red-700 text-white px-4 py-2 text-xs font-black cursor-pointer"
            >
              <Plus size={14} /> Schedule School Program
            </button>
          </div>
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
                const linkCheck = validateMeetingLink(r.meetingLink);
                const isSchoolRow = Boolean(r.schoolId) || String(r.targetType || '').toLowerCase() === 'school';
                const durationMins =
                  r.durationMinutes || calculateDurationMinutes(r.startTime || '', r.endTime || '');

                return (
                  <div
                    key={r.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center gap-3"
                  >
                    <div className="lg:w-44 shrink-0">
                      <p className="text-xs font-black text-slate-900 dark:text-white">
                        {label(r.date)}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock size={12} /> {r.startTime || '—'} – {r.endTime || '—'}
                        {durationMins > 0 ? ` (${durationMins}m)` : ''}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isSchoolRow ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700 dark:text-blue-300">
                            <School size={11} /> {r.schoolName || 'Partner School'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                            <User size={11} /> Private: {r.studentName || 'Private Learner'}
                          </span>
                        )}

                        <span className="inline-flex items-center rounded-md bg-brand-red/10 px-2 py-0.5 text-[10px] font-black uppercase text-brand-red">
                          {r.programName || r.title || 'Academic Programme'}
                        </span>

                        {r.classLevel && (
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            {r.classLevel}
                          </span>
                        )}

                        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-black text-slate-700 dark:text-slate-300">
                          {statusLabel(status)}
                        </span>
                      </div>

                      <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {r.title || r.programName || 'Class session'}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        {linkCheck.valid ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                            <Video size={12} /> {linkCheck.platform} Link Active
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1">
                            <Link2 size={12} /> Meeting link not set
                          </span>
                        )}
                        {r.updatedByName && (
                          <span>
                            Last updated by <strong>{r.updatedByName}</strong>
                          </span>
                        )}
                      </div>

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
                      {linkCheck.valid && (
                        <a
                          href={linkCheck.normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-[11px] font-black shadow-2xs"
                        >
                          <Video size={13} /> Join Class <ExternalLink size={11} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openQuickLinkModal(r)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 px-3 py-2 text-[11px] font-black cursor-pointer hover:bg-sky-100"
                      >
                        <Link2 size={13} /> {linkCheck.valid ? 'Update Link' : 'Set Class Link'}
                      </button>
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
                        <Edit3 size={13} /> Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* TUTOR CREATE SCHEDULE MODAL (School-Program Level OR Individual Private-Student Level) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateScheduleSubmit}
            className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-black text-brand-red">
                  Tutor Class Scheduling
                </p>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Create Synchronized Class Schedule
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Schedules automatically synchronize to the relevant student and parent portals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* 1. Schedule Level Toggle */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  1. Select Scheduling Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const priv = privateStudents[0];
                      setCreateForm((prev) => ({
                        ...prev,
                        scheduleLevel: 'private',
                        studentId: prev.studentId || priv?.id || '',
                        programName: priv?.primaryProgram || prev.programName || 'Coding for Kids',
                        title: priv
                          ? `${priv.primaryProgram} – ${priv.name}`
                          : prev.title,
                      }));
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      createForm.scheduleLevel === 'private'
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
                      <User size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 dark:text-white">
                        Assigned Private Student
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Appears strictly in the selected private student&apos;s portal.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const sch = schools[0];
                      const prog = sch?.programs?.[0];
                      setCreateForm((prev) => ({
                        ...prev,
                        scheduleLevel: 'school',
                        schoolId: prev.schoolId || sch?.id || '',
                        programId: prog?.id || '',
                        programName: prog?.name || prev.programName || 'Coding for Kids',
                        title: prog?.name || prev.title || 'Coding for Kids',
                      }));
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      createForm.scheduleLevel === 'school'
                        ? 'border-brand-red bg-red-50/60 dark:bg-red-950/30 ring-2 ring-brand-red/20'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-brand-red text-white shrink-0">
                      <School size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 dark:text-white">
                        School &amp; Program Cohort
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Shared automatically with all students in that school &amp; program.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Target Selection: Private Student vs School + Program */}
              {createForm.scheduleLevel === 'private' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Select Assigned Private Student
                    </label>
                    <select
                      required
                      value={createForm.studentId}
                      onChange={(e) => {
                        const st = privateStudents.find((s) => s.id === e.target.value);
                        setCreateForm((prev) => ({
                          ...prev,
                          studentId: e.target.value,
                          programName: st?.primaryProgram || prev.programName,
                          title: st
                            ? `${st.primaryProgram} – ${st.name}`
                            : prev.title,
                        }));
                      }}
                      className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                    >
                      <option value="">Select private student…</option>
                      {privateStudents.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.className} •{' '}
                          {st.studentType === 'parent_enrolled'
                            ? `Parent: ${st.parentName || 'Family'}`
                            : 'Independent'}
                          )
                        </option>
                      ))}
                    </select>
                    {privateStudents.length === 0 && (
                      <p className="text-[11px] text-amber-600 mt-1">
                        No private students are currently assigned to your tutor profile.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Student&apos;s Enrolled Program
                    </label>
                    {(() => {
                      const selectedSt = privateStudents.find(
                        (s) => s.id === createForm.studentId
                      );
                      const programChoices = Array.from(
                        new Set([
                          ...(selectedSt?.enrolledPrograms || []),
                          ...studioPrograms,
                        ])
                      );
                      return (
                        <select
                          required
                          value={createForm.programName}
                          onChange={(e) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              programName: e.target.value,
                              title: selectedSt
                                ? `${e.target.value} – ${selectedSt.name}`
                                : e.target.value,
                            }))
                          }
                          className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                        >
                          {programChoices.map((prog) => (
                            <option key={prog} value={prog}>
                              {prog}
                              {selectedSt?.enrolledPrograms.includes(prog)
                                ? ' (Enrolled)'
                                : ''}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Select Assigned Partner School
                      </label>
                      <select
                        required
                        value={createForm.schoolId}
                        onChange={(e) => {
                          const sch = schools.find((s) => s.id === e.target.value);
                          const firstProg = sch?.programs?.[0];
                          setCreateForm((prev) => ({
                            ...prev,
                            schoolId: e.target.value,
                            programId: firstProg?.id || '',
                            programName: firstProg?.name || prev.programName,
                            title: firstProg?.name || prev.title,
                          }));
                        }}
                        className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                      >
                        <option value="">Select partner school…</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        School Program
                      </label>
                      {(() => {
                        const sch = schools.find((s) => s.id === createForm.schoolId);
                        const schoolProgs = sch?.programs || [];
                        return (
                          <select
                            required
                            value={createForm.programName}
                            onChange={(e) => {
                              const found = schoolProgs.find((p) => p.name === e.target.value);
                              setCreateForm((prev) => ({
                                ...prev,
                                programId: found?.id || '',
                                programName: e.target.value,
                                title: e.target.value,
                              }));
                            }}
                            className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                          >
                            {schoolProgs.map((p) => (
                              <option key={p.id} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                            {studioPrograms
                              .filter((sp) => !schoolProgs.some((p) => p.name === sp))
                              .map((sp) => (
                                <option key={sp} value={sp}>
                                  {sp}
                                </option>
                              ))}
                          </select>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Class Level Scope for School */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Class Level Scope
                      </label>
                      <select
                        value={createForm.classScope}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            classScope: e.target.value as any,
                          }))
                        }
                        className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                      >
                        <option value="all">All Classes Enrolled in Program</option>
                        <option value="range">Class Range (e.g. Grade 1 – Grade 6)</option>
                        <option value="specific">Specific Classes</option>
                      </select>
                    </div>

                    {createForm.classScope === 'range' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            From Class
                          </label>
                          <select
                            value={createForm.rangeStart}
                            onChange={(e) =>
                              setCreateForm((prev) => ({ ...prev, rangeStart: e.target.value }))
                            }
                            className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                          >
                            {CANONICAL_CLASSES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            To Class
                          </label>
                          <select
                            value={createForm.rangeEnd}
                            onChange={(e) =>
                              setCreateForm((prev) => ({ ...prev, rangeEnd: e.target.value }))
                            }
                            className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                          >
                            {CANONICAL_CLASSES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  {createForm.classScope === 'specific' && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {CANONICAL_CLASSES.map((c) => {
                        const active = createForm.classLevels.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              setCreateForm((prev) => ({
                                ...prev,
                                classLevels: active
                                  ? prev.classLevels.filter((x) => x !== c)
                                  : [...prev.classLevels, c],
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                              active
                                ? 'bg-brand-red text-white border-brand-red'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Date, Time, Duration & Recurrence */}
              <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Repeat size={14} className="text-brand-red" />
                    <span>2. Class Date, Time, Duration &amp; Recurrence</span>
                  </label>
                  <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                    <button
                      type="button"
                      onClick={() => setCreateForm((prev) => ({ ...prev, recurring: true }))}
                      className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                        createForm.recurring
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Recurring Weekly
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateForm((prev) => ({ ...prev, recurring: false }))}
                      className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                        !createForm.recurring
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Single Session
                    </button>
                  </div>
                </div>

                {createForm.recurring && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">
                      Recurring Class Days
                    </label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {SCHEDULE_DAYS_OF_WEEK.map((d) => {
                        const active = createForm.selectedDays.includes(d.full);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => toggleCreateDay(d.full)}
                            className={`py-2 rounded-xl text-xs font-black border cursor-pointer transition-all ${
                              active
                                ? 'bg-brand-red text-white border-brand-red shadow-2xs'
                                : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      {createForm.recurring ? 'Start Date' : 'Class Date'}
                    </label>
                    <input
                      type="date"
                      required
                      value={createForm.startDate}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                      className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      required
                      value={createForm.startTime}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        const nextEnd = addMinutesToTime(nextStart, createForm.durationMinutes);
                        setCreateForm((prev) => ({
                          ...prev,
                          startTime: nextStart,
                          endTime: nextEnd,
                        }));
                      }}
                      className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Duration
                    </label>
                    <select
                      value={createForm.durationMinutes}
                      onChange={(e) => {
                        const mins = Number(e.target.value) || 60;
                        const nextEnd = addMinutesToTime(createForm.startTime, mins);
                        setCreateForm((prev) => ({
                          ...prev,
                          durationMinutes: mins,
                          endTime: nextEnd,
                        }));
                      }}
                      className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                    >
                      <option value={30}>30 Minutes</option>
                      <option value={45}>45 Minutes</option>
                      <option value={60}>1 Hour (60m)</option>
                      <option value={90}>1.5 Hours (90m)</option>
                      <option value={120}>2 Hours (120m)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      required
                      value={createForm.endTime}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          endTime: e.target.value,
                          durationMinutes: calculateDurationMinutes(
                            prev.startTime,
                            e.target.value
                          ),
                        }))
                      }
                      className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
                    />
                  </div>
                </div>

                {createForm.recurring && (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      Number of Recurring Weeks:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={createForm.weeks}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          weeks: Math.max(1, Math.min(52, Number(e.target.value) || 8)),
                        }))
                      }
                      className="w-28 min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-center"
                    />
                  </div>
                )}
              </div>

              {/* 4. Online Classroom / Meeting Link */}
              <div className="space-y-2 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Video size={14} className="text-brand-red" />
                  <span>3. Online Classroom / Meeting Link</span>
                </label>
                <input
                  type="text"
                  value={createForm.meetingLink}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, meetingLink: e.target.value }))
                  }
                  placeholder="https://meet.google.com/... or https://zoom.us/j/..."
                  className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium"
                />
                {createForm.meetingLink.trim() ? (
                  createLinkValidation.valid ? (
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Valid {createLinkValidation.platform} link — Join Class button will be active for students.
                    </p>
                  ) : (
                    <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {createLinkValidation.error}
                    </p>
                  )
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Optional now — you can also add or update the joining link later at any time.
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-950/50">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingSchedule}
                className="px-5 py-2.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {creatingSchedule ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                <span>Save &amp; Sync Schedule</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QUICK MEETING LINK CONFIGURATION MODAL */}
      {linkModalSchedule && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMeetingLink}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-black text-sky-600">
                  Online Classroom Link
                </p>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Configure Joining Link
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {linkModalSchedule.programName || linkModalSchedule.title} ·{' '}
                  {linkModalSchedule.schoolName || linkModalSchedule.studentName}
                </p>
              </div>
              <button type="button" onClick={() => setLinkModalSchedule(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Meeting URL (Google Meet, Zoom, Microsoft Teams, etc.)
              </label>
              <input
                type="text"
                value={linkModalUrl}
                onChange={(e) => setLinkModalUrl(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm"
              />
              {linkModalUrl.trim() && (
                quickLinkValidation.valid ? (
                  <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Valid {quickLinkValidation.platform} link
                  </p>
                ) : (
                  <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle size={12} /> {quickLinkValidation.error}
                  </p>
                )
              )}
            </div>

            {linkModalSchedule.scheduleGroupId && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkModalApplySeries}
                  onChange={(e) => setLinkModalApplySeries(e.target.checked)}
                  className="rounded border-slate-300 text-brand-red"
                />
                <span>Apply this meeting link to all recurring sessions in this schedule</span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLinkModalSchedule(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={linkSaving}
                className="px-5 py-2 rounded-xl bg-brand-red text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
              >
                {linkSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>Save Meeting Link</span>
              </button>
            </div>
          </form>
        </div>
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
                <p className="text-xs text-slate-500">
                  Update session time, title, or online classroom link.
                </p>
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
              type="text"
              value={form.meetingLink}
              onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
              placeholder="Meeting link (https://meet.google.com/...)"
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
            />
            {editing.scheduleGroupId && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.applyLinkToSeries}
                  onChange={(e) => setForm({ ...form, applyLinkToSeries: e.target.checked })}
                  className="rounded border-slate-300 text-brand-red"
                />
                <span>Sync meeting link across all recurring sessions in this series</span>
              </label>
            )}
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
