import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { 
  CalendarDays, CheckCircle2, Clock3, Edit3, Loader2, Plus, 
  RefreshCw, School, Users, User, Trash2, XCircle, Search,
  Eye, Calendar, AlertTriangle, Check, Layers,
  Copy, ChevronDown, ChevronRight, Split, ChevronUp
} from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { db } from '../../lib/firebase';
import { 
  collection, getDocs, doc, updateDoc, deleteDoc, 
  query, where, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { resolveRealName, formatTutorDropdownLabel } from '../../utils/userNames';
import { CANONICAL_CLASSES, normalizeClassList, normalizeClassName } from '../../lib/classes';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';

const CLASS_OPTIONS: string[] = [...CANONICAL_CLASSES];

const DAYS_OF_WEEK = [
  { id: 'Monday', label: 'Mon', full: 'Monday', dayIndex: 1 },
  { id: 'Tuesday', label: 'Tue', full: 'Tuesday', dayIndex: 2 },
  { id: 'Wednesday', label: 'Wed', full: 'Wednesday', dayIndex: 3 },
  { id: 'Thursday', label: 'Thu', full: 'Thursday', dayIndex: 4 },
  { id: 'Friday', label: 'Fri', full: 'Friday', dayIndex: 5 },
  { id: 'Saturday', label: 'Sat', full: 'Saturday', dayIndex: 6 },
  { id: 'Sunday', label: 'Sun', full: 'Sunday', dayIndex: 0 },
];

const STATUS_OPTIONS = ['SCHEDULED', 'ONGOING', 'COMPLETED', 'ATTENDED', 'ABSENT', 'CANCELLED', 'RESCHEDULED'];

type TargetType = 'school' | 'parent' | 'individual';

// A single time slot which can combine multiple classes
export interface ClassSlotGroup {
  id: string;
  classes: string[]; // e.g. ['JSS 2', 'JSS 3']
  startTime: string; // '14:00'
  endTime: string;   // '15:00'
  label?: string;    // e.g. 'Senior Secondary Lab'
}

// Day schedule config with independent time window per day
export interface DayScheduleEntry {
  dayName: string; // 'Monday', 'Tuesday', ...
  startTime: string; // '08:00'
  endTime: string;   // '12:00'
  active: boolean;
}

interface SchoolItem {
  id: string;
  name: string;
  code?: string;
  programs?: Array<{ id: string; name: string; level?: string; assignedTutors?: Array<{ tutorId: string; tutorName: string }> }>;
}

interface ParentItem {
  id: string;
  name: string;
  email: string;
  children: Array<{ id: string; name: string }>;
}

interface IndividualItem {
  id: string;
  name: string;
  email: string;
  track?: string;
}

interface ScheduleOccurrence {
  id: string;
  scheduleGroupId: string;
  date: string; // 'YYYY-MM-DD'
  dayOfWeek?: string;
  startTime: string;
  endTime: string;
  daySessionStartTime?: string;
  daySessionEndTime?: string;
  title: string;
  programId?: string;
  programName?: string;
  tutorName?: string;
  tutorId?: string;
  status: string;
  targetType: TargetType;
  schoolId?: string;
  schoolName?: string;
  classLevel?: string;
  classLevels?: string[];
  combinedClasses?: string[];
  subClassStatuses?: Record<string, string>;
  slotLabel?: string;
  slotGroups?: ClassSlotGroup[];
  daySchedules?: DayScheduleEntry[];
  parentId?: string;
  parentName?: string;
  parentEmail?: string;
  studentId?: string;
  studentName?: string;
  studentEmail?: string;
  meetingLink?: string;
  occurrenceIndex?: number;
  occurrenceTotal?: number;
  createdAt?: string;
}

interface ScheduleGroup {
  scheduleGroupId: string;
  title: string;
  programId?: string;
  programName?: string;
  tutorName?: string;
  tutorId?: string;
  startTime: string;
  endTime: string;
  selectedDays?: string[];
  daySchedules?: DayScheduleEntry[];
  slotGroups?: ClassSlotGroup[];
  targetType: TargetType;
  schoolId?: string;
  schoolName?: string;
  classLevels?: string[];
  parentId?: string;
  parentName?: string;
  studentId?: string;
  studentName?: string;
  occurrences: ScheduleOccurrence[];
}

const inputClass = 'w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1220] text-slate-900 dark:text-white px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500';

// Helper: parse "HH:MM" into minutes
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Helper: format minutes into "HH:MM"
const minutesToTime = (mins: number): string => {
  const normalized = Math.max(0, Math.min(mins, 23 * 60 + 59));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Helper: format 24hr time to 12hr AM/PM
const format12Hour = (time24: string): string => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

// --- Timezone-neutral UTC date helpers ---
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Returns "24 Sep 2026"
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  return `${d} ${MONTH_NAMES_SHORT[m - 1] || ''} ${y}`;
};

// Returns exact day of week (e.g. "Thursday") timezone-neutrally
const getWeekdayFromDateStr = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  // Use UTC Noon to prevent any timezone boundary shift
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return WEEKDAY_NAMES[utcDate.getUTCDay()] || '';
};

// Formats full date with weekday: e.g. "Thursday, 24 September 2026"
const formatFullDateWithDay = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const weekday = getWeekdayFromDateStr(dateStr);
  return `${weekday}, ${d} ${MONTH_NAMES_LONG[m - 1] || ''} ${y}`;
};

// Formats full ordinal date with weekday: e.g. "Tuesday, 29th September 2026"
const formatOrdinalDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = WEEKDAY_NAMES[utcDate.getUTCDay()] || '';
  const month = MONTH_NAMES_LONG[m - 1] || '';
  const suffix = d % 10 === 1 && d % 100 !== 11 ? 'st' : d % 10 === 2 && d % 100 !== 12 ? 'nd' : d % 10 === 3 && d % 100 !== 13 ? 'rd' : 'th';
  return `${weekday}, ${d}${suffix} ${month} ${y}`;
};

// Add N days to date string YYYY-MM-DD timezone-neutrally
const addDaysToDateStr = (dateStr: string, daysToAdd: number): string => {
  const parts = dateStr.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const utcDate = new Date(Date.UTC(y, m - 1, d + daysToAdd, 12, 0, 0));
  const resY = utcDate.getUTCFullYear();
  const resM = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const resD = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
};

const AdminClassSchedules: React.FC = () => {
  const { toast } = useToast();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [parents, setParents] = useState<ParentItem[]>([]);
  const [individuals, setIndividuals] = useState<IndividualItem[]>([]);
  const [groups, setGroups] = useState<ScheduleGroup[]>([]);
  const [tutors, setTutors] = useState<Array<{ id: string; name: string; email: string; qualification?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSchool, setFilterSchool] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduleGroup | null>(null);

  // Accordion state: which timetable groups are expanded to show full table
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});

  // Sub-cohort expansion inside occurrence rows
  const [expandedOccIds, setExpandedOccIds] = useState<Record<string, boolean>>({});

  // Modals state
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<ScheduleGroup | null>(null);
  const [deleteConfirmOcc, setDeleteConfirmOcc] = useState<ScheduleOccurrence | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Single Occurrence Edit Modal
  const [editingOcc, setEditingOcc] = useState<ScheduleOccurrence | null>(null);
  const [occEditForm, setOccEditForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    meetingLink: '',
    tutorName: '',
    status: 'SCHEDULED'
  });

  // Class Range Breakdown Modal / Drawer
  const [viewingBreakdownGroup, setViewingBreakdownGroup] = useState<ScheduleGroup | null>(null);

  // Main Form State
  const [form, setForm] = useState<{
    targetType: TargetType;
    schoolId: string;
    programId: string;
    programName: string;
    scope: 'all' | 'range' | 'specific';
    rangeStart: string;
    rangeEnd: string;
    classLevels: string[];
    daySchedules: DayScheduleEntry[];
    slotGroups: ClassSlotGroup[];
    parentId: string;
    studentId: string;
    title: string;
    tutorId: string;
    tutorName: string;
    meetingLink: string;
    startDate: string;
    recurring: boolean;
    weeks: string;
  }>({
    targetType: 'school',
    schoolId: '',
    programId: '',
    programName: '',
    scope: 'range',
    rangeStart: 'Grade 7',
    rangeEnd: 'Grade 8',
    classLevels: ['Grade 7', 'Grade 8'],
    daySchedules: [
      { dayName: 'Thursday', startTime: '14:00', endTime: '15:00', active: true }
    ],
    slotGroups: [
      { id: 'slot-1', classes: ['Grade 7', 'Grade 8'], startTime: '14:00', endTime: '15:00', label: 'Grade 7 & Grade 8 Combined' }
    ],
    parentId: '',
    studentId: '',
    title: 'Digital Literacy & Coding Lab',
    tutorId: '',
    tutorName: '',
    meetingLink: '',
    startDate: new Date().toISOString().slice(0, 10),
    recurring: true,
    weeks: '12'
  });

  // Load all schedules and directory data directly from Firestore
  const load = useCallback(async () => {
    setLoading(true);
    try {
      void migrateAllFirestoreClasses().catch(() => undefined);
      const [
        schoolSnap, 
        usersSnap, 
        enrollSnap, 
        indivSnap, 
        studSnap, 
        schedSnap,
        tutorsSnap,
        staffSnap,
        appsSnap
      ] = await Promise.all([
        getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'users')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'enrollment_requests')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'students')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'classSchedules')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'tutors')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'staff')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'tutor_applications')).catch(() => ({ docs: [] } as any))
      ]);

      // 0. Process Registered Tutors & Instructors with Real Names
      const tutorMap = new Map<string, { id: string; name: string; email: string; qualification?: string }>();
      const emailToRealName = new Map<string, string>();

      appsSnap.docs.forEach((d: any) => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        const realName = resolveRealName(data, email);
        if (email && realName) emailToRealName.set(email, realName);
      });

      tutorsSnap.docs.forEach((d: any) => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        const realName = resolveRealName(data, email) || emailToRealName.get(email) || 'Faculty Mentor';
        tutorMap.set(d.id, {
          id: d.id,
          name: realName,
          email: data.email || '',
          qualification: data.qualification || ''
        });
      });

      staffSnap.docs.forEach((d: any) => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        const realName = resolveRealName(data, email) || emailToRealName.get(email) || 'Faculty Mentor';
        if (!tutorMap.has(d.id)) {
          tutorMap.set(d.id, {
            id: d.id,
            name: realName,
            email: data.email || '',
            qualification: data.qualification || data.role || ''
          });
        }
      });

      usersSnap.docs.forEach((d: any) => {
        const data = d.data();
        const role = String(data.role || '').toLowerCase();
        if (['tutor', 'instructor', 'staff', 'faculty', 'teacher'].includes(role)) {
          const email = (data.email || '').toLowerCase().trim();
          const realName = resolveRealName(data, email) || emailToRealName.get(email) || 'Faculty Mentor';
          if (!tutorMap.has(d.id)) {
            tutorMap.set(d.id, {
              id: d.id,
              name: realName,
              email: data.email || '',
              qualification: data.qualification || ''
            });
          }
        }
      });

      setTutors(Array.from(tutorMap.values()).sort((a, b) => a.name.localeCompare(b.name)));

      // 1. Process Schools
      const loadedSchools = schoolSnap.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || data.schoolName || data.institutionName || d.id),
          code: data.code || data.schoolCode,
          programs: Array.isArray(data.programs) ? data.programs : []
        };
      }).sort((a: SchoolItem, b: SchoolItem) => a.name.localeCompare(b.name));
      setSchools(loadedSchools);

      // 2. Process Parents and their Children
      const parentMap = new Map<string, ParentItem>();
      usersSnap.docs.forEach((d: any) => {
        const u = d.data();
        if (String(u.role || '').toLowerCase() === 'parent') {
          parentMap.set(d.id, {
            id: d.id,
            name: u.displayName || u.name || (u.email ? u.email.split('@')[0] : 'Parent'),
            email: u.email || '',
            children: []
          });
        }
      });

      const linkChildToParent = (parentId: string, parentEmail: string, childId: string, childName: string) => {
        let parent = parentMap.get(parentId);
        if (!parent && parentEmail) {
          parent = Array.from(parentMap.values()).find(p => p.email.toLowerCase() === parentEmail.toLowerCase());
        }
        if (parent) {
          if (!parent.children.some(c => c.id === childId)) {
            parent.children.push({ id: childId, name: childName });
          }
        } else if (parentEmail) {
          const newParent: ParentItem = {
            id: parentId || parentEmail,
            name: parentEmail.split('@')[0],
            email: parentEmail,
            children: [{ id: childId, name: childName }]
          };
          parentMap.set(newParent.id, newParent);
        }
      };

      indivSnap.docs.forEach((d: any) => {
        const s = d.data();
        if (s.parentId || s.parentEmail) {
          linkChildToParent(s.parentId, s.parentEmail, d.id, s.fullName || s.studentName || 'Child');
        }
      });
      enrollSnap.docs.forEach((d: any) => {
        const s = d.data();
        if (s.parentId || s.parentEmail || s.email) {
          linkChildToParent(s.parentId, s.parentEmail, d.id, s.studentName || s.childName || 'Child');
        }
      });
      studSnap.docs.forEach((d: any) => {
        const s = d.data();
        if (!s.schoolId && (s.parentId || s.parentEmail)) {
          linkChildToParent(s.parentId, s.parentEmail, d.id, s.fullName || s.name || 'Child');
        }
      });

      setParents(Array.from(parentMap.values()).sort((a, b) => a.name.localeCompare(b.name)));

      // 3. Process Independent Students
      const indivList: IndividualItem[] = [];
      indivSnap.docs.forEach((d: any) => {
        const s = d.data();
        if (!s.schoolId && !s.parentId && !s.parentEmail) {
          indivList.push({
            id: d.id,
            name: s.fullName || s.studentName || s.username || 'Scholar',
            email: s.email || '',
            track: s.track || s.plan || 'Independent Tech Track'
          });
        }
      });
      setIndividuals(indivList.sort((a, b) => a.name.localeCompare(b.name)));

      // 4. Process Class Schedules occurrences and group them (normalizing and deduplicating all class labels)
      const rawOccurrences: ScheduleOccurrence[] = schedSnap.docs.map((d: any) => {
        const data = d.data();
        const normClassLevel = data.classLevel ? normalizeClassList(data.classLevel).join(', ') || normalizeClassName(data.classLevel) : data.classLevel;
        const normClassLevels = Array.isArray(data.classLevels) ? normalizeClassList(data.classLevels) : (normClassLevel ? normalizeClassList(normClassLevel) : undefined);
        const normCombined = Array.isArray(data.combinedClasses) ? normalizeClassList(data.combinedClasses) : undefined;
        const normSlots = Array.isArray(data.slotGroups)
          ? data.slotGroups.map((sg: any) => ({
              ...sg,
              classes: normalizeClassList(sg.classes || []),
              label: normalizeClassList(sg.classes || []).length > 1
                ? `${normalizeClassList(sg.classes || []).join(' & ')} Combined`
                : normalizeClassList(sg.classes || [])[0] || sg.label
            }))
          : data.slotGroups;
        return {
          id: d.id,
          ...data,
          ...(normClassLevel ? { classLevel: normClassLevel } : {}),
          ...(normClassLevels ? { classLevels: normClassLevels } : {}),
          ...(normCombined ? { combinedClasses: normCombined } : {}),
          ...(normSlots ? { slotGroups: normSlots } : {}),
          // Calculate dayOfWeek timezone-neutrally from date if missing
          dayOfWeek: data.dayOfWeek || getWeekdayFromDateStr(data.date)
        };
      });

      // Deduplicate identical occurrences on same group, date, time slot, and combined classes if any legacy duplicates exist
      const groupMap = new Map<string, ScheduleGroup>();

      rawOccurrences.forEach(occ => {
        const groupId = occ.scheduleGroupId || occ.id;
        if (!groupMap.has(groupId)) {
          groupMap.set(groupId, {
            scheduleGroupId: groupId,
            title: occ.title || 'Coding Class',
            programId: occ.programId,
            programName: occ.programName,
            tutorName: occ.tutorName || '',
            tutorId: occ.tutorId,
            startTime: occ.daySessionStartTime || occ.startTime || '08:00',
            endTime: occ.daySessionEndTime || occ.endTime || '12:00',
            selectedDays: occ.dayOfWeek ? [occ.dayOfWeek] : [],
            daySchedules: occ.daySchedules || [],
            slotGroups: occ.slotGroups || [],
            targetType: occ.targetType || (occ.schoolId ? 'school' : occ.parentId ? 'parent' : 'individual'),
            schoolId: occ.schoolId,
            schoolName: occ.schoolName,
            classLevels: normalizeClassList(occ.classLevels || (occ.classLevel ? [occ.classLevel] : [])),
            parentId: occ.parentId,
            parentName: occ.parentName,
            studentId: occ.studentId,
            studentName: occ.studentName,
            occurrences: []
          });
        }
        
        const grp = groupMap.get(groupId)!;
        
        // Prevent duplicate rows in table if old DB had separate documents for combined classes on same date/time
        const existingOcc = grp.occurrences.find(o => 
          o.date === occ.date && 
          o.startTime === occ.startTime && 
          o.endTime === occ.endTime &&
          (o.slotLabel === occ.slotLabel || (o.combinedClasses?.length && occ.combinedClasses?.length))
        );

        if (!existingOcc) {
          grp.occurrences.push(occ);
        } else {
          // Merge classes into combined list if needed (deduplicated)
          if (occ.classLevel) {
            existingOcc.combinedClasses = normalizeClassList([...(existingOcc.combinedClasses || [existingOcc.classLevel || '']), occ.classLevel]);
          }
        }

        if (occ.dayOfWeek && !grp.selectedDays?.includes(occ.dayOfWeek)) {
          grp.selectedDays?.push(occ.dayOfWeek);
        }
        if (occ.slotGroups && occ.slotGroups.length > 0 && (!grp.slotGroups || grp.slotGroups.length === 0)) {
          grp.slotGroups = occ.slotGroups;
        }
        if (occ.daySchedules && occ.daySchedules.length > 0 && (!grp.daySchedules || grp.daySchedules.length === 0)) {
          grp.daySchedules = occ.daySchedules;
        }
      });

      // Sort occurrences in each group chronologically by date and start time
      const sortedGroups = Array.from(groupMap.values()).map(g => {
        g.occurrences.sort((a, b) => {
          const dateComp = (a.date || '').localeCompare(b.date || '');
          if (dateComp !== 0) return dateComp;
          return (a.startTime || '').localeCompare(b.startTime || '');
        });
        return g;
      });

      setGroups(sortedGroups);
    } catch (e) {
      console.error('Error loading class schedules:', e);
      toast.error(e instanceof Error ? e.message : 'Unable to load schedules.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Compute resolved classes based on scope
  const resolvedClasses = useMemo(() => {
    if (form.scope === 'all') return CLASS_OPTIONS;
    if (form.scope === 'range') {
      const a = CLASS_OPTIONS.indexOf(form.rangeStart);
      const b = CLASS_OPTIONS.indexOf(form.rangeEnd);
      const startIdx = Math.min(a, b);
      const endIdx = Math.max(a, b);
      return CLASS_OPTIONS.slice(startIdx, endIdx + 1);
    }
    return form.classLevels;
  }, [form.scope, form.rangeStart, form.rangeEnd, form.classLevels]);

  // Active days list from form.daySchedules
  const activeDays = useMemo(() => {
    return form.daySchedules.filter(d => d.active);
  }, [form.daySchedules]);

  // Live formatted Start Date weekday display (timezone-neutral)
  const startDateWeekday = useMemo(() => {
    return formatFullDateWithDay(form.startDate);
  }, [form.startDate]);

  // Auto-generate slot groups: 1 class per slot evenly partitioned
  const autoPartitionSlots = (classes: string[], startStr: string, endStr: string): ClassSlotGroup[] => {
    if (!classes || classes.length === 0) return [];
    const totalStartMins = timeToMinutes(startStr || '08:00');
    const totalEndMins = timeToMinutes(endStr || '12:00');
    const totalDurationMins = Math.max(15, totalEndMins - totalStartMins);
    const slotDuration = Math.max(10, Math.floor(totalDurationMins / classes.length));

    return classes.map((className, index) => {
      const slotStart = totalStartMins + (index * slotDuration);
      const isLast = index === classes.length - 1;
      const slotEnd = isLast ? totalEndMins : Math.min(totalEndMins, slotStart + slotDuration);
      return {
        id: `slot-${Date.now()}-${index}`,
        classes: [className],
        startTime: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        label: className
      };
    });
  };

  // Combine all classes into 1 single slot
  const combineAllIntoSingleSlot = (classes: string[], startStr: string, endStr: string): ClassSlotGroup[] => {
    return [{
      id: `slot-${Date.now()}-all`,
      classes: [...classes],
      startTime: startStr || '08:00',
      endTime: endStr || '12:00',
      label: classes.length > 1 ? `${classes.join(' & ')} Combined` : classes[0] || 'Combined Classes'
    }];
  };

  // Open Create Form
  const openCreate = () => {
    setEditing(null);
    const defaultSchool = filterSchool ? schools.find(s => s.id === filterSchool) : schools[0];
    const defaultProg = defaultSchool?.programs?.[0];
    const initialClasses = ['Grade 7', 'Grade 8'];
    
    const initialSlots: ClassSlotGroup[] = [
      { id: 'slot-1', classes: ['Grade 7', 'Grade 8'], startTime: '14:00', endTime: '15:00', label: 'Grade 7 & Grade 8 Combined' }
    ];

    setForm({
      targetType: 'school',
      schoolId: defaultSchool?.id || '',
      programId: defaultProg?.id || '',
      programName: defaultProg?.name || '',
      scope: 'range',
      rangeStart: 'Grade 7',
      rangeEnd: 'Grade 8',
      classLevels: initialClasses,
      daySchedules: [
        { dayName: 'Thursday', startTime: '14:00', endTime: '15:00', active: true }
      ],
      slotGroups: initialSlots,
      parentId: parents[0]?.id || '',
      studentId: '',
      title: defaultProg?.name || 'Robotics & Web Engineering Lab',
      tutorId: defaultProg?.assignedTutors?.[0]?.tutorId || '',
      tutorName: defaultProg?.assignedTutors?.[0]?.tutorName || '',
      meetingLink: '',
      startDate: new Date().toISOString().slice(0, 10),
      recurring: true,
      weeks: '12'
    });
    setShowForm(true);
  };

  // Open Edit Form for an entire Series
  const openEdit = (g: ScheduleGroup) => {
    setEditing(g);
    const firstOcc = g.occurrences[0];
    const levels = g.classLevels?.length ? normalizeClassList(g.classLevels) : ['Grade 1'];
    const distinctDates = Array.from(new Set(g.occurrences.map(o => o.date).filter(Boolean))).sort();
    
    // Extract unique days and their start/end times from occurrences or group
    const dayMap = new Map<string, { startTime: string; endTime: string }>();
    g.occurrences.forEach(occ => {
      if (occ.dayOfWeek && !dayMap.has(occ.dayOfWeek)) {
        dayMap.set(occ.dayOfWeek, {
          startTime: occ.daySessionStartTime || occ.startTime || '08:00',
          endTime: occ.daySessionEndTime || occ.endTime || '12:00'
        });
      }
    });

    const activeDaysList: DayScheduleEntry[] = Array.from(dayMap.entries()).map(([dayName, times]) => ({
      dayName,
      startTime: times.startTime,
      endTime: times.endTime,
      active: true
    }));

    if (activeDaysList.length === 0) {
      activeDaysList.push({ dayName: 'Thursday', startTime: g.startTime || '14:00', endTime: g.endTime || '15:00', active: true });
    }

    let calculatedWeeks = 12;
    if (distinctDates.length > 0) {
      const firstDate = distinctDates[0];
      const lastDate = distinctDates[distinctDates.length - 1];
      const [y1, m1, d1] = firstDate.split('-').map(Number);
      const [y2, m2, d2] = lastDate.split('-').map(Number);
      const t1 = Date.UTC(y1, m1 - 1, d1);
      const t2 = Date.UTC(y2, m2 - 1, d2);
      const diffDays = Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
      calculatedWeeks = Math.max(1, Math.round(diffDays / 7) + 1);
    }

    const currentSlots = g.slotGroups && g.slotGroups.length > 0
      ? g.slotGroups
      : autoPartitionSlots(levels, g.startTime || '08:00', g.endTime || '12:00');

    setForm({
      targetType: g.targetType || 'school',
      schoolId: g.schoolId || '',
      programId: g.programId || firstOcc?.programId || '',
      programName: g.programName || firstOcc?.programName || '',
      scope: levels.length === CLASS_OPTIONS.length ? 'all' : levels.length > 1 ? 'range' : 'specific',
      rangeStart: levels[0] || 'Grade 1',
      rangeEnd: levels[levels.length - 1] || 'Grade 5',
      classLevels: levels,
      daySchedules: activeDaysList,
      slotGroups: currentSlots,
      parentId: g.parentId || '',
      studentId: g.studentId || '',
      title: g.title || '',
      tutorId: g.tutorId || firstOcc?.tutorId || '',
      tutorName: g.tutorName || firstOcc?.tutorName || '',
      meetingLink: firstOcc?.meetingLink || '',
      startDate: distinctDates[0] || firstOcc?.date || new Date().toISOString().slice(0, 10),
      recurring: calculatedWeeks > 1 || distinctDates.length > 1,
      weeks: String(calculatedWeeks || 12)
    });
    setShowForm(true);
  };

  // Toggle Day active status
  const toggleDayActive = (dayName: string) => {
    setForm(prev => {
      const existing = prev.daySchedules.find(d => d.dayName === dayName);
      let updated: DayScheduleEntry[];
      if (existing) {
        if (existing.active && prev.daySchedules.filter(d => d.active).length === 1) {
          toast.info('At least one day must remain selected for class schedule.');
          return prev;
        }
        updated = prev.daySchedules.map(d => d.dayName === dayName ? { ...d, active: !d.active } : d);
      } else {
        updated = [...prev.daySchedules, { dayName, startTime: '08:00', endTime: '12:00', active: true }];
      }
      return { ...prev, daySchedules: updated };
    });
  };

  // Update specific day's start/end time
  const updateDayTime = (dayName: string, field: 'startTime' | 'endTime', value: string) => {
    setForm(prev => ({
      ...prev,
      daySchedules: prev.daySchedules.map(d => d.dayName === dayName ? { ...d, [field]: value } : d)
    }));
  };

  // Apply one day's times to all active days
  const copyTimeToAllDays = (sourceDay: DayScheduleEntry) => {
    setForm(prev => ({
      ...prev,
      daySchedules: prev.daySchedules.map(d => d.active ? { ...d, startTime: sourceDay.startTime, endTime: sourceDay.endTime } : d)
    }));
    toast.success(`Applied ${format12Hour(sourceDay.startTime)} – ${format12Hour(sourceDay.endTime)} to all active days.`);
  };

  // Slot management functions
  const addSlotGroup = () => {
    setForm(prev => ({
      ...prev,
      slotGroups: [
        ...prev.slotGroups,
        {
          id: `slot-${Date.now()}`,
          classes: [resolvedClasses[0] || 'Grade 1'],
          startTime: '08:00',
          endTime: '09:00',
          label: 'Class Cohort'
        }
      ]
    }));
  };

  const removeSlotGroup = (slotId: string) => {
    if (form.slotGroups.length <= 1) {
      return toast.error('You need at least one class time slot.');
    }
    setForm(prev => ({
      ...prev,
      slotGroups: prev.slotGroups.filter(s => s.id !== slotId)
    }));
  };

  const updateSlotField = (slotId: string, field: keyof ClassSlotGroup, value: any) => {
    setForm(prev => ({
      ...prev,
      slotGroups: prev.slotGroups.map(s => s.id === slotId ? { ...s, [field]: value } : s)
    }));
  };

  const toggleClassInSlot = (slotId: string, className: string) => {
    setForm(prev => ({
      ...prev,
      slotGroups: prev.slotGroups.map(s => {
        if (s.id === slotId) {
          const exists = s.classes.includes(className);
          const nextClasses = exists ? s.classes.filter(c => c !== className) : [...s.classes, className];
          return { ...s, classes: nextClasses };
        }
        return s;
      })
    }));
  };

  // Submit and generate occurrences directly in Firestore
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeDays.length === 0) {
      return toast.error('Please select at least one active day of the week.');
    }

    for (const d of activeDays) {
      if (d.endTime <= d.startTime) {
        return toast.error(`End time on ${d.dayName} must be later than start time.`);
      }
    }

    if (form.targetType === 'school' && !form.schoolId) {
      return toast.error('Please select a partner school.');
    }
    if (form.targetType === 'parent' && !form.parentId) {
      return toast.error('Please select a parent account.');
    }
    if (form.targetType === 'individual' && !form.studentId) {
      return toast.error('Please select an independent student.');
    }

    setSaving(true);
    try {
      const selectedSchool = schools.find(s => s.id === form.schoolId);
      const selectedParent = parents.find(p => p.id === form.parentId);
      const selectedIndiv = individuals.find(i => i.id === form.studentId);
      const selectedChild = selectedParent?.children.find(c => c.id === form.studentId);

      const numWeeks = form.recurring ? Math.max(1, Math.min(52, Number(form.weeks) || 12)) : 1;
      const scheduleGroupId = editing?.scheduleGroupId || `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const targetClasses = form.targetType === 'school' ? resolvedClasses : [];

      // 1. If editing, purge old occurrences
      if (editing) {
        try {
          const oldSnap = await getDocs(query(collection(db, 'classSchedules'), where('scheduleGroupId', '==', scheduleGroupId)));
          const idsToDelete = new Set<string>();
          oldSnap.docs.forEach(d => idsToDelete.add(d.id));
          editing.occurrences.forEach(occ => idsToDelete.add(occ.id));

          const delArray = Array.from(idsToDelete);
          for (let i = 0; i < delArray.length; i += 300) {
            const chunk = delArray.slice(i, i + 300);
            const batch = writeBatch(db);
            chunk.forEach(id => batch.delete(doc(db, 'classSchedules', id)));
            await batch.commit();
          }
        } catch (delErr) {
          console.warn('Error purging old occurrences prior to update:', delErr);
        }
      }

      // 2. Generate occurrences across selected days and weeks (TIMEZONE-NEUTRAL)
      const [startYear, startMonth, startDay] = form.startDate.split('-').map(Number);
      const baseUtc = new Date(Date.UTC(startYear, startMonth - 1, startDay, 12, 0, 0));
      const startDayOfWeek = baseUtc.getUTCDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat

      const dayNameToIndex: Record<string, number> = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
      };

      const newOccDocs: Array<{ id: string; data: ScheduleOccurrence }> = [];

      for (let w = 0; w < numWeeks; w++) {
        for (const dayEntry of activeDays) {
          const targetDayIdx = dayNameToIndex[dayEntry.dayName] ?? 1;
          
          let dayOffset = targetDayIdx - startDayOfWeek;
          if (dayOffset < 0) {
            dayOffset += 7;
          }
          
          const totalDaysFromBase = (w * 7) + dayOffset;
          const dateStr = addDaysToDateStr(form.startDate, totalDaysFromBase);

          if (form.targetType === 'school') {
            // For school: generate EXACTLY ONE occurrence document per slot group (combined classes)
            const slotsToUse = form.slotGroups.length > 0 
              ? form.slotGroups 
              : [{ id: 'default', classes: targetClasses, startTime: dayEntry.startTime, endTime: dayEntry.endTime, label: targetClasses.join(' & ') }];

            for (let sIdx = 0; sIdx < slotsToUse.length; sIdx++) {
              const slot = slotsToUse[sIdx];
              const slotClasses = slot.classes.length > 0 ? slot.classes : targetClasses;
              const slotClassLabel = slot.label || slotClasses.join(' & ');
              
              // ONE single document ID per slot on that date (NO duplicate rows!)
              const occId = `${scheduleGroupId}-w${w}-${dayEntry.dayName.slice(0, 3)}-slot${sIdx}`;

              newOccDocs.push({
                id: occId,
                data: {
                  id: occId,
                  scheduleGroupId,
                  title: form.title || form.programName || 'Robotics & Web Lab',
                  programId: form.programId || '',
                  programName: form.programName || form.title || '',
                  tutorId: form.tutorId || '',
                  tutorName: form.tutorName || '',
                  meetingLink: form.meetingLink || '',
                  date: dateStr,
                  dayOfWeek: dayEntry.dayName,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  daySessionStartTime: dayEntry.startTime,
                  daySessionEndTime: dayEntry.endTime,
                  status: 'SCHEDULED',
                  targetType: 'school',
                  schoolId: form.schoolId || '',
                  schoolName: selectedSchool?.name || 'Partner School',
                  classLevel: slotClasses.join(' & '), // Combined class label
                  classLevels: targetClasses,
                  combinedClasses: slotClasses,
                  slotLabel: slotClassLabel,
                  slotGroups: form.slotGroups,
                  daySchedules: form.daySchedules,
                  occurrenceIndex: w + 1,
                  occurrenceTotal: numWeeks,
                  createdAt: new Date().toISOString()
                }
              });
            }
          } else if (form.targetType === 'parent') {
            const occId = `${scheduleGroupId}-w${w}-${dayEntry.dayName.slice(0, 3)}`;
            newOccDocs.push({
              id: occId,
              data: {
                id: occId,
                scheduleGroupId,
                title: form.title || 'Cadet Coding Class',
                programId: form.programId || '',
                programName: form.programName || form.title || '',
                tutorId: form.tutorId || '',
                tutorName: form.tutorName || '',
                meetingLink: form.meetingLink || '',
                date: dateStr,
                dayOfWeek: dayEntry.dayName,
                startTime: dayEntry.startTime,
                endTime: dayEntry.endTime,
                daySessionStartTime: dayEntry.startTime,
                daySessionEndTime: dayEntry.endTime,
                status: 'SCHEDULED',
                targetType: 'parent',
                parentId: form.parentId || '',
                parentName: selectedParent?.name || 'Parent',
                parentEmail: selectedParent?.email || '',
                studentId: form.studentId || '',
                studentName: selectedChild?.name || 'Child',
                daySchedules: form.daySchedules,
                occurrenceIndex: w + 1,
                occurrenceTotal: numWeeks,
                createdAt: new Date().toISOString()
              }
            });
          } else {
            // Independent Scholar
            const occId = `${scheduleGroupId}-w${w}-${dayEntry.dayName.slice(0, 3)}`;
            newOccDocs.push({
              id: occId,
              data: {
                id: occId,
                scheduleGroupId,
                title: form.title || 'Independent Scholar Session',
                programId: form.programId || '',
                programName: form.programName || form.title || '',
                tutorId: form.tutorId || '',
                tutorName: form.tutorName || '',
                meetingLink: form.meetingLink || '',
                date: dateStr,
                dayOfWeek: dayEntry.dayName,
                startTime: dayEntry.startTime,
                endTime: dayEntry.endTime,
                daySessionStartTime: dayEntry.startTime,
                daySessionEndTime: dayEntry.endTime,
                status: 'SCHEDULED',
                targetType: 'individual',
                studentId: form.studentId || '',
                studentName: selectedIndiv?.name || 'Scholar',
                studentEmail: selectedIndiv?.email || '',
                daySchedules: form.daySchedules,
                occurrenceIndex: w + 1,
                occurrenceTotal: numWeeks,
                createdAt: new Date().toISOString()
              }
            });
          }
        }
      }

      // 3. Batch write all occurrences in safe chunks of 300
      for (let i = 0; i < newOccDocs.length; i += 300) {
        const chunk = newOccDocs.slice(i, i + 300);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const cleanData = Object.fromEntries(
            Object.entries(item.data).filter(([_, v]) => v !== undefined)
          );
          batch.set(doc(db, 'classSchedules', item.id), cleanData);
        });
        await batch.commit();
      }

      const activeDaysNames = activeDays.map(d => `${d.dayName} (${format12Hour(d.startTime)})`).join(', ');
      toast.success(
        editing 
          ? `Updated timetable series (${activeDaysNames} • ${numWeeks} weeks).` 
          : `Generated timetable with ${newOccDocs.length} total sessions across ${numWeeks} weeks.`
      );
      
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error('Save schedule error:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle timetable expansion for a group
  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroupIds(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Update status of single occurrence directly in Firestore
  const setStatus = async (occId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'classSchedules', occId), { 
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      setGroups(prev => prev.map(g => ({
        ...g,
        occurrences: g.occurrences.map(s => s.id === occId ? { ...s, status: newStatus } : s)
      })));
      toast.success(`Session status updated to ${newStatus}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to update session status.');
    }
  };

  // Update status of a specific sub-class within a combined cohort occurrence
  const updateSubClassStatus = async (occ: ScheduleOccurrence, className: string, newStatus: string) => {
    const currentSubStatuses = occ.subClassStatuses || {};
    const updatedSubStatuses = { ...currentSubStatuses, [className]: newStatus };
    
    // Compute if all sub-classes are completed
    const allClasses = occ.combinedClasses && occ.combinedClasses.length > 0 
      ? occ.combinedClasses 
      : occ.classLevels && occ.classLevels.length > 0 
      ? occ.classLevels 
      : [className];
      
    const allCompleted = allClasses.every(c => (updatedSubStatuses[c] || occ.status) === 'COMPLETED' || (updatedSubStatuses[c] || occ.status) === 'ATTENDED');
    const anyLive = allClasses.some(c => (updatedSubStatuses[c] || occ.status) === 'ONGOING');
    const nextOverall = allCompleted ? 'COMPLETED' : anyLive ? 'ONGOING' : newStatus;

    try {
      await updateDoc(doc(db, 'classSchedules', occ.id), {
        status: nextOverall,
        subClassStatuses: updatedSubStatuses,
        updatedAt: serverTimestamp()
      });
      setGroups(prev => prev.map(g => ({
        ...g,
        occurrences: g.occurrences.map(s => s.id === occ.id ? { ...s, status: nextOverall, subClassStatuses: updatedSubStatuses } : s)
      })));
      toast.success(`${className} status updated to ${newStatus}.`);
    } catch (err) {
      console.error('Failed to update subclass status:', err);
      toast.error('Unable to update class status.');
    }
  };

  // Open single occurrence edit modal
  const openSingleOccEdit = (occ: ScheduleOccurrence) => {
    setEditingOcc(occ);
    setOccEditForm({
      date: occ.date || '',
      startTime: occ.startTime || '08:00',
      endTime: occ.endTime || '09:00',
      meetingLink: occ.meetingLink || '',
      tutorName: occ.tutorName || '',
      status: occ.status || 'SCHEDULED'
    });
  };

  // Save single occurrence edit
  const saveSingleOccEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOcc) return;
    if (occEditForm.endTime <= occEditForm.startTime) {
      return toast.error('End time must be after start time.');
    }

    setSaving(true);
    try {
      const updateData: any = {
        date: occEditForm.date,
        dayOfWeek: getWeekdayFromDateStr(occEditForm.date),
        startTime: occEditForm.startTime,
        endTime: occEditForm.endTime,
        meetingLink: occEditForm.meetingLink,
        tutorName: occEditForm.tutorName,
        status: occEditForm.status,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'classSchedules', editingOcc.id), updateData);
      
      setGroups(prev => prev.map(g => ({
        ...g,
        occurrences: g.occurrences.map(s => s.id === editingOcc.id ? { ...s, ...updateData } : s)
      })));

      toast.success('Session date and time updated successfully.');
      setEditingOcc(null);
    } catch (err) {
      console.error('Save session error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update session.');
    } finally {
      setSaving(false);
    }
  };

  // Delete entire recurring series
  const executeDeleteGroup = async () => {
    if (!deleteConfirmGroup) return;
    setDeleting(true);
    try {
      const groupId = deleteConfirmGroup.scheduleGroupId;
      const snap = await getDocs(query(collection(db, 'classSchedules'), where('scheduleGroupId', '==', groupId)));
      const idsToDelete = new Set<string>();
      snap.docs.forEach(d => idsToDelete.add(d.id));
      deleteConfirmGroup.occurrences.forEach(occ => idsToDelete.add(occ.id));

      const delList = Array.from(idsToDelete);
      for (let i = 0; i < delList.length; i += 300) {
        const chunk = delList.slice(i, i + 300);
        const batch = writeBatch(db);
        chunk.forEach(id => batch.delete(doc(db, 'classSchedules', id)));
        await batch.commit();
      }

      setGroups(prev => prev.filter(g => g.scheduleGroupId !== groupId));
      toast.success(`Removed timetable series "${deleteConfirmGroup.title}".`);
      setDeleteConfirmGroup(null);
      await load();
    } catch (e) {
      console.error('Delete group error:', e);
      toast.error(e instanceof Error ? e.message : 'Unable to delete schedule.');
    } finally {
      setDeleting(false);
    }
  };

  // Delete single occurrence
  const executeDeleteOccurrence = async () => {
    if (!deleteConfirmOcc) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'classSchedules', deleteConfirmOcc.id));
      setGroups(prev => prev.map(g => ({
        ...g,
        occurrences: g.occurrences.filter(s => s.id !== deleteConfirmOcc.id)
      })).filter(g => g.occurrences.length > 0));

      toast.success('Session occurrence deleted.');
      setDeleteConfirmOcc(null);
    } catch (e) {
      console.error('Delete occurrence error:', e);
      toast.error(e instanceof Error ? e.message : 'Unable to delete session.');
    } finally {
      setDeleting(false);
    }
  };

  // Filter groups
  const filteredGroups = groups.filter(g => {
    if (filterType !== 'all' && g.targetType !== filterType) return false;
    if (filterSchool && g.schoolId !== filterSchool) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = g.title?.toLowerCase().includes(q);
      const matchSchool = g.schoolName?.toLowerCase().includes(q);
      const matchParent = g.parentName?.toLowerCase().includes(q);
      const matchStudent = g.studentName?.toLowerCase().includes(q);
      const matchTutor = g.tutorName?.toLowerCase().includes(q);
      return matchTitle || matchSchool || matchParent || matchStudent || matchTutor;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <SEO title="Class Schedules | Admin" description="Manage recurring class schedules, assigned tutors, and attendance across school and student portals." noindex={true} />

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1220] px-4 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="min-h-10 rounded-xl bg-brand-red hover:bg-red-700 text-white px-4 text-xs font-black inline-flex items-center gap-2 shadow-sm transition-all active:scale-95"
        >
          <Plus size={15} />
          <span>Create Timetable</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white dark:bg-[#0c1220] rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search schedules by topic, school, parent, tutor..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Audiences</option>
            <option value="school">Partner Schools</option>
            <option value="parent">Parents &amp; Children</option>
            <option value="individual">Independent Scholars</option>
          </select>

          {filterType === 'school' && (
            <select
              value={filterSchool}
              onChange={e => setFilterSchool(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="">All Schools</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* CREATE / EDIT TIMETABLE FORM MODAL */}
      {showForm && (
        <form onSubmit={submit} className="bg-white dark:bg-[#0c1220] rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-brand-red">
                  <CalendarDays size={18} />
                </span>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  {editing ? 'Edit Multi-Day Timetable Series' : 'Create Multi-Day Recurring Timetable'}
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Configure schedule audience, weekly days with independent times, and combine classes into custom time slots.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditing(null); }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <XCircle size={20} />
            </button>
          </div>

          {/* 1. Audience Selection Tabs */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              1. Select Target Audience
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, targetType: 'school' }))}
                className={`py-3 px-4 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                  form.targetType === 'school'
                    ? 'border-brand-red bg-red-50/50 text-brand-red dark:bg-red-950/30 ring-2 ring-brand-red/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <School size={16} />
                <span>Partner School</span>
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, targetType: 'parent' }))}
                className={`py-3 px-4 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                  form.targetType === 'parent'
                    ? 'border-sky-500 bg-sky-50/50 text-sky-600 dark:bg-sky-950/30 ring-2 ring-sky-500/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Users size={16} />
                <span>Parent &amp; Cadet</span>
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, targetType: 'individual' }))}
                className={`py-3 px-4 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                  form.targetType === 'individual'
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <User size={16} />
                <span>Independent Scholar</span>
              </button>
            </div>
          </div>

          {/* 2. Target Specific Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {form.targetType === 'school' && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Partner School
                  </label>
                  <select
                    value={form.schoolId}
                    onChange={e => {
                      const selSchool = schools.find(s => s.id === e.target.value);
                      const defaultProg = selSchool?.programs?.[0];
                      setForm({ 
                        ...form, 
                        schoolId: e.target.value,
                        programId: defaultProg?.id || '',
                        programName: defaultProg?.name || '',
                        title: defaultProg?.name || form.title,
                        tutorName: defaultProg?.assignedTutors?.[0]?.tutorName || form.tutorName
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">Select partner school...</option>
                    {schools.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    School Programme Track
                  </label>
                  <select
                    value={form.programId || ''}
                    onChange={e => {
                      const selSchool = schools.find(s => s.id === form.schoolId);
                      const selProg = selSchool?.programs?.find(p => p.id === e.target.value);
                      setForm({
                        ...form,
                        programId: e.target.value,
                        programName: selProg?.name || (e.target.value ? e.target.value : ''),
                        title: selProg?.name || form.title,
                        tutorName: selProg?.assignedTutors?.[0]?.tutorName || form.tutorName
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">-- General / Custom Schedule --</option>
                    {(schools.find(s => s.id === form.schoolId)?.programs || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.level ? `(${p.level})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Class Scope Mode
                  </label>
                  <select
                    value={form.scope}
                    onChange={e => setForm({ ...form, scope: e.target.value as any })}
                    className={inputClass}
                  >
                    <option value="all">All Classes in School (Early Years - SS 3)</option>
                    <option value="range">Class Range (e.g. JSS 2 to JSS 3)</option>
                    <option value="specific">Pick Specific Classes</option>
                  </select>
                </div>

                {form.scope === 'range' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">From</label>
                      <select
                        value={form.rangeStart}
                        onChange={e => setForm({ ...form, rangeStart: e.target.value })}
                        className={inputClass}
                      >
                        {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">To</label>
                      <select
                        value={form.rangeEnd}
                        onChange={e => setForm({ ...form, rangeEnd: e.target.value })}
                        className={inputClass}
                      >
                        {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {form.scope === 'specific' && (
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Pick Target Classes ({form.classLevels.length} selected)
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50 dark:bg-slate-900">
                      {CLASS_OPTIONS.map(c => (
                        <label key={c} className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.classLevels.includes(c)}
                            onChange={e => setForm(f => ({
                              ...f,
                              classLevels: e.target.checked
                                ? Array.from(new Set([...f.classLevels, c]))
                                : f.classLevels.filter(x => x !== c)
                            }))}
                            className="rounded border-slate-300 text-brand-red focus:ring-brand-red"
                          />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {form.targetType === 'parent' && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Select Parent Account
                  </label>
                  <select
                    value={form.parentId}
                    onChange={e => {
                      const p = parents.find(x => x.id === e.target.value);
                      setForm({
                        ...form,
                        parentId: e.target.value,
                        studentId: p?.children[0]?.id || ''
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">Select parent...</option>
                    {parents.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Select Child / Cadet
                  </label>
                  <select
                    value={form.studentId}
                    onChange={e => setForm({ ...form, studentId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">All children / General Family</option>
                    {(parents.find(p => p.id === form.parentId)?.children || []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {form.targetType === 'individual' && (
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Independent Scholar
                </label>
                <select
                  value={form.studentId}
                  onChange={e => setForm({ ...form, studentId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Select scholar...</option>
                  {individuals.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.email}) • {i.track}</option>
                  ))}
                </select>
              </div>
            )}

            {/* General Details */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Class / Lab Topic Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className={inputClass}
                placeholder="e.g. Python Web Engineering & AI"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Faculty Instructor / Mentor
              </label>
              {tutors.length > 0 ? (
                <div className="space-y-1.5">
                  <select
                    value={form.tutorId || (tutors.some(t => t.name === form.tutorName) ? tutors.find(t => t.name === form.tutorName)?.id : '')}
                    onChange={e => {
                      const selectedId = e.target.value;
                      if (selectedId === 'custom') {
                        setForm({ ...form, tutorId: '' });
                      } else {
                        const selectedT = tutors.find(t => t.id === selectedId);
                        setForm({
                          ...form,
                          tutorId: selectedId,
                          tutorName: selectedT?.name || form.tutorName
                        });
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="">Select registered faculty tutor...</option>
                    {tutors.map(t => (
                      <option key={t.id} value={t.id}>
                        {formatTutorDropdownLabel(t.name, t.email, t.qualification)}
                      </option>
                    ))}
                    <option value="custom">+ Custom / Other Instructor Name</option>
                  </select>
                  {(!form.tutorId || !tutors.some(t => t.id === form.tutorId)) && (
                    <input
                      type="text"
                      value={form.tutorName}
                      onChange={e => setForm({ ...form, tutorName: e.target.value })}
                      className={inputClass}
                      placeholder="Or enter instructor real name"
                    />
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={form.tutorName}
                  onChange={e => setForm({ ...form, tutorName: e.target.value })}
                  className={inputClass}
                  placeholder="Assigned instructor full name"
                />
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Virtual Room / Meeting Link (Optional)
              </label>
              <input
                type="url"
                value={form.meetingLink}
                onChange={e => setForm({ ...form, meetingLink: e.target.value })}
                className={inputClass}
                placeholder="https://meet.google.com/..."
              />
            </div>
          </div>

          {/* 3. MULTI-DAY SELECTOR & INDEPENDENT TIMES PER DAY */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Calendar size={14} className="text-brand-red" />
                  <span>2. Schedule Days &amp; Specific Time Windows</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Select which days the class occurs and set start &amp; end times for each day independently.
                </p>
              </div>

              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-red/10 text-brand-red self-start sm:self-auto">
                {activeDays.length} day{activeDays.length > 1 ? 's' : ''} configured
              </span>
            </div>

            {/* Day Selector Pills */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {DAYS_OF_WEEK.map(day => {
                const isActive = form.daySchedules.some(d => d.dayName === day.full && d.active);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDayActive(day.full)}
                    className={`py-2 px-1 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      isActive
                        ? 'bg-brand-red text-white shadow-xs scale-102 ring-2 ring-brand-red/30'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[11px] sm:text-xs">{day.label}</span>
                    <span className="text-[9px] font-normal opacity-85 hidden sm:inline">{day.full.slice(0, 3)}</span>
                  </button>
                );
              })}
            </div>

            {/* Individual Day Time Range Editors */}
            <div className="space-y-2.5 pt-2">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                Active Days &amp; Time Windows:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeDays.map(dayEntry => (
                  <div
                    key={dayEntry.dayName}
                    className="p-3.5 rounded-xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-brand-red" />
                        {dayEntry.dayName}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyTimeToAllDays(dayEntry)}
                        className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5"
                        title="Copy this time range to all active days"
                      >
                        <Copy size={10} />
                        <span>Apply to all</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Start Time</label>
                        <input
                          type="time"
                          value={dayEntry.startTime}
                          onChange={e => updateDayTime(dayEntry.dayName, 'startTime', e.target.value)}
                          className="w-full py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">End Time</label>
                        <input
                          type="time"
                          value={dayEntry.endTime}
                          onChange={e => updateDayTime(dayEntry.dayName, 'endTime', e.target.value)}
                          className="w-full py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono text-center">
                      {format12Hour(dayEntry.startTime)} – {format12Hour(dayEntry.endTime)} ({Math.max(0, timeToMinutes(dayEntry.endTime) - timeToMinutes(dayEntry.startTime))} mins)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Start Date & Weeks (With Timezone Neutral Date Display) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  First Class Start Date (Week 1 Anchor)
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                  className={inputClass}
                  required
                />
                {startDateWeekday && (
                  <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 block mt-1">
                    📅 {startDateWeekday}
                  </span>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Term Length (Weeks)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={form.weeks}
                    onChange={e => setForm({ ...form, weeks: e.target.value })}
                    className={inputClass}
                  />
                  <span className="text-xs text-slate-500 font-bold shrink-0">weeks</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. COMBINE CLASSES INTO CUSTOM TIME SLOTS (School audience) */}
          {form.targetType === 'school' && (
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Split size={14} className="text-brand-red" />
                    <span>3. Class Combining &amp; Time Slot Partitions</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Group or combine multiple classes into one single date session (e.g. JSS 2 &amp; JSS 3 combined into 1 slot).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const firstDay = activeDays[0] || { startTime: '08:00', endTime: '12:00' };
                      const combined = combineAllIntoSingleSlot(resolvedClasses, firstDay.startTime, firstDay.endTime);
                      setForm(f => ({ ...f, slotGroups: combined }));
                      toast.success('Combined all selected classes into 1 unified slot.');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-brand-red text-white text-[11px] font-black hover:bg-red-700 shadow-2xs"
                  >
                    Combine All Classes (1 Slot)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const firstDay = activeDays[0] || { startTime: '08:00', endTime: '12:00' };
                      const autoSlots = autoPartitionSlots(resolvedClasses, firstDay.startTime, firstDay.endTime);
                      setForm(f => ({ ...f, slotGroups: autoSlots }));
                      toast.success('Separated 1 distinct slot per class.');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    1 Class Per Slot
                  </button>

                  <button
                    type="button"
                    onClick={addSlotGroup}
                    className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Plus size={12} />
                    <span>Add Slot</span>
                  </button>
                </div>
              </div>

              {/* Slot Cards List */}
              <div className="space-y-3">
                {form.slotGroups.map((slot, sIdx) => {
                  const duration = Math.max(0, timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime));
                  return (
                    <div
                      key={slot.id}
                      className="p-4 rounded-2xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center text-xs font-black shrink-0">
                            {sIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={slot.label || ''}
                            onChange={e => updateSlotField(slot.id, 'label', e.target.value)}
                            placeholder={`Slot ${sIdx + 1} Label (e.g. Combined Tech Cohort)`}
                            className="text-xs font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-brand-red focus:outline-none px-1 py-0.5"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-slate-500">
                            {format12Hour(slot.startTime)} – {format12Hour(slot.endTime)} ({duration} mins)
                          </span>
                          {form.slotGroups.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSlotGroup(slot.id)}
                              className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title="Remove Slot"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Time Controls */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Slot Start Time</label>
                          <input
                            type="time"
                            value={slot.startTime}
                            onChange={e => updateSlotField(slot.id, 'startTime', e.target.value)}
                            className="w-full py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Slot End Time</label>
                          <input
                            type="time"
                            value={slot.endTime}
                            onChange={e => updateSlotField(slot.id, 'endTime', e.target.value)}
                            className="w-full py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      {/* Assigned / Combined Classes Checkboxes */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                          Classes Combined in This Slot (Will appear on 1 row per date):
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {resolvedClasses.map(c => {
                            const isIncluded = slot.classes.includes(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => toggleClassInSlot(slot.id, c)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                                  isIncluded
                                    ? 'bg-brand-red text-white border-brand-red shadow-2xs'
                                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                                }`}
                              >
                                {c} {isIncluded ? '✓' : '+'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditing(null); }}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-2xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
              <span>{saving ? 'Saving Timetable...' : editing ? 'Save Timetable Changes' : 'Generate Multi-Day Timetable'}</span>
            </button>
          </div>
        </form>
      )}

      {/* SCHEDULES GROUP CARDS LIST VIEW (COLLAPSED LIST BY DEFAULT) */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white dark:bg-[#0c1220] rounded-3xl p-12 text-center text-xs text-slate-400 border border-slate-200/80 dark:border-slate-800">
            <Loader2 className="animate-spin mx-auto mb-2 text-brand-red" size={24} />
            <span>Loading live timetable schedules...</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="bg-white dark:bg-[#0c1220] rounded-3xl p-12 text-center border border-slate-200/80 dark:border-slate-800 space-y-3">
            <CalendarDays className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
            <h3 className="font-black text-slate-900 dark:text-white text-base">No active class schedules found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Create a multi-day recurring timetable for partner schools, parents with enrolled children, or independent learners.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 rounded-xl bg-brand-red text-white text-xs font-black inline-flex items-center gap-1.5 active:scale-95"
            >
              <Plus size={14} /> Create First Timetable
            </button>
          </div>
        ) : (
          filteredGroups.map(g => {
            const firstOcc = g.occurrences[0];
            const isSchool = g.targetType === 'school';
            const isParent = g.targetType === 'parent';
            const isExpanded = Boolean(expandedGroupIds[g.scheduleGroupId]);
            const distinctDates = Array.from(new Set(g.occurrences.map(o => o.date).filter(Boolean))).sort();
            const daysList = g.selectedDays?.length ? g.selectedDays : ['Thursday'];

            return (
              <div
                key={g.scheduleGroupId}
                className="bg-white dark:bg-[#0c1220] rounded-3xl p-5 md:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-all"
              >
                {/* Collapsed Card Header Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isSchool && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-50 dark:bg-red-950/40 text-brand-red">
                          <School size={11} /> {g.schoolName || 'Partner School'}
                        </span>
                      )}
                      {isParent && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
                          <Users size={11} /> Parent: {g.parentName || 'Parent Account'} {g.studentName ? `• Child: ${g.studentName}` : ''}
                        </span>
                      )}
                      {!isSchool && !isParent && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                          <User size={11} /> Scholar: {g.studentName || 'Independent Cadet'}
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {daysList.join(' & ')}
                      </span>

                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                        {distinctDates.length} Session Dates ({g.occurrences.length} Total Rows)
                      </span>
                    </div>

                    <h3 className="text-base md:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                      {g.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span><strong>Instructor:</strong> {g.tutorName || 'Assigned Faculty Mentor'}</span>
                      {firstOcc?.meetingLink && (
                        <a
                          href={firstOcc.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-600 font-bold hover:underline"
                        >
                          Virtual Room Link
                        </a>
                      )}
                      {isSchool && g.classLevels && g.classLevels.length > 0 && (
                        <span><strong>Classes:</strong> {g.classLevels.join(', ')}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Expand Timetable Button */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpansion(g.scheduleGroupId)}
                      className={`min-h-9 px-4 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                        isExpanded
                          ? 'bg-slate-900 dark:bg-slate-800 text-white'
                          : 'bg-brand-red/10 text-brand-red hover:bg-brand-red hover:text-white dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-brand-red dark:hover:text-white border border-brand-red/20'
                      }`}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      <span>{isExpanded ? 'Hide Timetable' : `View Full Timetable (${g.occurrences.length})`}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEdit(g)}
                      className="min-h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1220] text-slate-700 dark:text-slate-300 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
                    >
                      <Edit3 size={13} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteConfirmGroup(g)}
                      className="min-h-9 px-3 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                      title="Delete Entire Series"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* EXPANDABLE FULL TIMETABLE (Grouped by Date & Cohort Breakdown) */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-6 animate-in fade-in duration-150">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <Calendar size={14} className="text-brand-red" />
                        <span>Daily Class Schedules &amp; Cohort Breakdown ({distinctDates.length} Session Dates):</span>
                      </h4>
                      <span className="text-[11px] text-slate-500 font-medium">
                        All classes on each date are consolidated into 1 card with expandable cohort controls
                      </span>
                    </div>

                    {/* Chronological List of Date Sessions */}
                    <div className="space-y-6">
                      {distinctDates.map(dateKey => {
                        const dayOccurrences = g.occurrences.filter(o => o.date === dateKey);
                        if (dayOccurrences.length === 0) return null;
                        
                        const primaryOcc = dayOccurrences[0];
                        const formattedDateHeader = formatOrdinalDate(dateKey);
                        const sessionKey = `${g.scheduleGroupId}_${dateKey}`;
                        const isCohortExpanded = Boolean(expandedOccIds[sessionKey]);

                        // Aggregate all classes for this date
                        const allDateClassesSet = new Set<string>();
                        dayOccurrences.forEach(occ => {
                          if (occ.combinedClasses && occ.combinedClasses.length > 0) {
                            occ.combinedClasses.forEach(c => allDateClassesSet.add(c));
                          } else if (occ.classLevel) {
                            allDateClassesSet.add(occ.classLevel);
                          } else if (occ.classLevels && occ.classLevels.length > 0) {
                            occ.classLevels.forEach(c => allDateClassesSet.add(c));
                          }
                        });
                        if (allDateClassesSet.size === 0 && g.classLevels && g.classLevels.length > 0) {
                          g.classLevels.forEach(c => allDateClassesSet.add(c));
                        }

                        const allDateClasses = Array.from(allDateClassesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                        const hasMultipleCohorts = allDateClasses.length > 1;

                        // Class range badge text e.g. "EARLY YEARS, YEAR 1, YEAR 2, YEAR 3, YEAR 4, YEAR 5 (6 CLASSES)"
                        const classRangeBadgeText = allDateClasses.length > 1
                          ? `${allDateClasses.join(', ')} (${allDateClasses.length} CLASSES)`.toUpperCase()
                          : (allDateClasses[0] || primaryOcc.classLevel || primaryOcc.studentName || 'CLASS').toUpperCase();

                        const programTrackName = primaryOcc.programName || primaryOcc.title || g.programName || g.title;
                        const tutorDisplay = primaryOcc.tutorName || g.tutorName || 'jaystarblissstudios@gmail.com';
                        const overallStatus = primaryOcc.status || 'SCHEDULED';

                        return (
                          <div key={dateKey} className="space-y-2.5">
                            {/* Date Header Pill (Dark Pill with Calendar Icon) */}
                            <div className="flex items-center gap-3">
                              <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-xs font-black tracking-tight inline-flex items-center gap-2 shadow-xs">
                                <Calendar size={13} className="text-brand-red" />
                                <span>{formattedDateHeader}</span>
                              </div>
                              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                            </div>

                            {/* Consolidated Session Card (Pixel-perfect matching screenshot) */}
                            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c1220] p-4 sm:p-5 shadow-xs transition-all">
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                                  {/* Left TIME Box */}
                                  <div className="p-2.5 sm:p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-mono text-xs font-bold shrink-0 text-center min-w-[110px]">
                                    <span className="block text-[10px] uppercase text-slate-400 font-sans font-bold tracking-wider mb-0.5">TIME</span>
                                    {format12Hour(primaryOcc.startTime)} – {format12Hour(primaryOcc.endTime)}
                                  </div>

                                  <div className="min-w-0 space-y-1.5">
                                    {/* Top Badges: Class Range Badge, Program Track, Status */}
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-red-50 dark:bg-red-950/40 text-brand-red border border-red-100 dark:border-red-900/30">
                                        {classRangeBadgeText}
                                      </span>

                                      {programTrackName && (
                                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                          {programTrackName}
                                        </span>
                                      )}

                                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                        overallStatus === 'COMPLETED' || overallStatus === 'ATTENDED'
                                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                          : overallStatus === 'ONGOING'
                                          ? 'bg-emerald-500 text-white animate-pulse'
                                          : overallStatus === 'CANCELLED' || overallStatus === 'ABSENT'
                                          ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800'
                                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                      }`}>
                                        <Clock3 size={10} />
                                        <span>{overallStatus}</span>
                                      </span>
                                    </div>

                                    {/* Title */}
                                    <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                      {programTrackName}
                                    </h4>

                                    {/* Tutor Assignment */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                      <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                                        <User size={13} className="text-emerald-500 shrink-0" />
                                        <span>Assigned Tutor:</span>
                                        <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono font-bold">
                                          {tutorDisplay}
                                        </span>
                                      </div>

                                      {primaryOcc.meetingLink && (
                                        <a
                                          href={primaryOcc.meetingLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-sky-600 font-bold hover:underline text-[11px]"
                                        >
                                          Virtual Classroom
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Right Action Buttons */}
                                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                                  {hasMultipleCohorts && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedOccIds(prev => ({ ...prev, [sessionKey]: !prev[sessionKey] }))}
                                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
                                    >
                                      <span>{isCohortExpanded ? 'Hide Cohort Breakdown' : `Expand Range (${allDateClasses.length})`}</span>
                                      {isCohortExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                  )}

                                  {/* Overall Status Selector */}
                                  <select
                                    value={overallStatus}
                                    onChange={e => {
                                      dayOccurrences.forEach(occ => void setStatus(occ.id, e.target.value));
                                    }}
                                    className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                                  >
                                    {STATUS_OPTIONS.map(st => (
                                      <option key={st} value={st}>{st}</option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => openSingleOccEdit(primaryOcc)}
                                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    title="Edit session date/time"
                                  >
                                    <Edit3 size={13} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmOcc(primaryOcc)}
                                    className="p-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                    title="Delete session"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Expandable Individual Class Cohort Breakdown Grid */}
                              {hasMultipleCohorts && isCohortExpanded && (
                                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                                  <div className="flex items-center justify-between text-[11px] font-black text-slate-400 uppercase tracking-wider">
                                    <span>INDIVIDUAL CLASS COHORT BREAKDOWN ({allDateClasses.length} CLASSES):</span>
                                    <span className="text-[10px] text-slate-400 font-normal">Click status dropdown to update specific class</span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {allDateClasses.map(className => {
                                      // Find matching occurrence or subClassStatus
                                      const specificOcc = dayOccurrences.find(o => o.classLevel === className || (o.combinedClasses && o.combinedClasses.includes(className))) || primaryOcc;
                                      const classStatus = specificOcc.subClassStatuses?.[className] || specificOcc.status || overallStatus;

                                      return (
                                        <div
                                          key={className}
                                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="px-2.5 py-1 rounded-md text-xs font-black bg-red-50 dark:bg-red-950/40 text-brand-red border border-red-100 dark:border-red-900/20 shrink-0">
                                              {className}
                                            </span>
                                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate uppercase">
                                              {programTrackName}
                                            </span>
                                          </div>

                                          <div className="shrink-0 flex items-center gap-1.5">
                                            <select
                                              value={classStatus}
                                              onChange={e => void updateSubClassStatus(specificOcc, className, e.target.value)}
                                              className="text-[11px] font-bold py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                                            >
                                              {STATUS_OPTIONS.map(st => (
                                                <option key={st} value={st}>{st}</option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: EDIT SINGLE OCCURRENCE */}
      {editingOcc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <form onSubmit={saveSingleOccEdit} className="bg-white dark:bg-[#0c1220] rounded-3xl p-5 sm:p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[85dvh] flex flex-col text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  Edit Single Class Session
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {editingOcc.title} • {editingOcc.classLevel || editingOcc.studentName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOcc(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Class Date
                </label>
                <input
                  type="date"
                  value={occEditForm.date}
                  onChange={e => setOccEditForm({ ...occEditForm, date: e.target.value })}
                  className={inputClass}
                  required
                />
                {occEditForm.date && (
                  <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 block mt-1">
                    📅 {formatFullDateWithDay(occEditForm.date)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={occEditForm.startTime}
                    onChange={e => setOccEditForm({ ...occEditForm, startTime: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={occEditForm.endTime}
                    onChange={e => setOccEditForm({ ...occEditForm, endTime: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Assigned Instructor
                </label>
                <input
                  type="text"
                  value={occEditForm.tutorName}
                  onChange={e => setOccEditForm({ ...occEditForm, tutorName: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Virtual Room Link
                </label>
                <input
                  type="url"
                  value={occEditForm.meetingLink}
                  onChange={e => setOccEditForm({ ...occEditForm, meetingLink: e.target.value })}
                  className={inputClass}
                  placeholder="https://meet.google.com/..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Status
                </label>
                <select
                  value={occEditForm.status}
                  onChange={e => setOccEditForm({ ...occEditForm, status: e.target.value })}
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setEditingOcc(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRMATION MODAL: DELETE GROUP */}
      {deleteConfirmGroup && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <div className="bg-white dark:bg-[#0c1220] rounded-3xl p-5 sm:p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[85dvh] flex flex-col text-slate-900 dark:text-white">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-2xl bg-red-50 dark:bg-red-950/40">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  Delete Timetable Series?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Permanently remove all recurring sessions in this series.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-red-50/50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-xs text-red-900 dark:text-red-200">
              <p className="font-bold">{deleteConfirmGroup.title}</p>
              <p className="text-[11px] mt-0.5 opacity-90">
                Audience: {deleteConfirmGroup.schoolName || deleteConfirmGroup.parentName || deleteConfirmGroup.studentName} • {deleteConfirmGroup.occurrences.length} scheduled sessions will be purged.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmGroup(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void executeDeleteGroup()}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>{deleting ? 'Deleting...' : 'Delete Entire Timetable'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: DELETE OCCURRENCE */}
      {deleteConfirmOcc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <div className="bg-white dark:bg-[#0c1220] rounded-3xl p-5 sm:p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[85dvh] flex flex-col text-slate-900 dark:text-white">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-2xl bg-red-50 dark:bg-red-950/40">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  Delete Single Session?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Remove this specific class date ({formatDisplayDate(deleteConfirmOcc.date)}) from the timetable.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <p className="font-bold">{deleteConfirmOcc.title}</p>
              <p className="text-[11px] mt-0.5 text-slate-500">
                Class: {deleteConfirmOcc.classLevel || deleteConfirmOcc.studentName} • Time: {format12Hour(deleteConfirmOcc.startTime)} – {format12Hour(deleteConfirmOcc.endTime)}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmOcc(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void executeDeleteOccurrence()}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>{deleting ? 'Deleting...' : 'Delete Session'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminClassSchedules;
