import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  BookOpen, 
  UserCheck, 
  Users, 
  ExternalLink, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  Radio, 
  AlertCircle, 
  RotateCcw, 
  XCircle, 
  Filter, 
  History, 
  Search, 
  GraduationCap,
  School,
  Video,
  PlayCircle
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';

export interface ClassScheduleItem {
  id: string;
  scheduleGroupId?: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  tutorName?: string;
  tutorId?: string;
  status: string;
  schoolId?: string;
  schoolName?: string;
  programId?: string;
  programName?: string;
  classLevel?: string;
  classLevels?: string[];
  meetingLink?: string;
  absenceReason?: string;
  rescheduleReason?: string;
  rescheduledDate?: string;
  cancellationReason?: string;
}

export interface SchoolProgramItem {
  id: string;
  name: string;
  description?: string;
  level?: string;
  schedule?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  durationMode?: 'fixed_dates' | 'admin_controlled';
  completedAt?: string;
  assignedTutors?: Array<{
    tutorId: string;
    tutorName: string;
    role?: string;
  }>;
  isGeneralProgram?: boolean;
  hasEdclub?: boolean;
  hasResources?: boolean;
}

export interface GroupedSession {
  sessionKey: string;
  scheduleGroupId?: string;
  date: string;
  formattedDate: string;
  dayName: string;
  startTime: string;
  endTime: string;
  title: string;
  programName: string;
  programId?: string;
  tutorName?: string;
  meetingLink?: string;
  overallStatus: string;
  classRangeBadge: string;
  classLevels: string[];
  occurrences: ClassScheduleItem[];
  isLiveNow: boolean;
  isAutoCompleted: boolean;
}

interface SchoolClassScheduleTimelineProps {
  schoolId: string;
  schoolName: string;
  programs: SchoolProgramItem[];
  schedules: ClassScheduleItem[];
  onRefresh?: () => void;
  readOnly?: boolean;
}

export const SchoolClassScheduleTimeline: React.FC<SchoolClassScheduleTimelineProps> = ({
  schoolId: _schoolId,
  schoolName,
  programs = [],
  schedules = [],
  onRefresh,
  readOnly = false
}) => {
  const { toast } = useToast();
  const effective = getEffectiveAuth();
  
  // Can current user update status? (Only Tutors, Staff, and Admins can update status. School Admin & Students are Read-Only)
  const canManageStatus = !readOnly && ['admin', 'tutor', 'staff', 'superadmin'].includes(effective.effectiveRole.toLowerCase());

  const [selectedProgramId, setSelectedProgramId] = useState<string>('ALL');
  const [viewTab, setViewTab] = useState<'UPCOMING' | 'HISTORY'>('UPCOMING');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [expandedSessionKeys, setExpandedSessionKeys] = useState<Record<string, boolean>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(value => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Status update handler for authorized Tutors and Admins
  const handleUpdateStatus = async (occurrenceIds: string[], newStatus: string) => {
    if (!canManageStatus) {
      toast.error('Only assigned tutors and platform administrators can update class session status.');
      return;
    }
    const targetId = occurrenceIds[0];
    setUpdatingId(targetId);
    try {
      await Promise.all(occurrenceIds.map(id => 
        updateDoc(doc(db, 'classSchedules', id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        })
      ));
      toast.success(`Class session status marked as ${newStatus}.`);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Update status error:', e);
      toast.error(e instanceof Error ? e.message : 'Unable to update session status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedSessionKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Separate active vs historical programs
  const activePrograms = useMemo(() => {
    return programs.filter(p => p.status !== 'COMPLETED' && p.status !== 'HISTORICAL');
  }, [programs]);

  // Aggregate and collapse individual class occurrences for each time slot on that day into ONE unified session entry
  const groupedDaySessions = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 1. First filter by selected programme and search query
    const filteredRaw = schedules.filter(item => {
      // Program filter
      if (selectedProgramId !== 'ALL') {
        const matchProgId = item.programId === selectedProgramId;
        const selectedProg = programs.find(p => p.id === selectedProgramId);
        const matchProgName = selectedProg?.name && item.programName && item.programName.toLowerCase() === selectedProg.name.toLowerCase();
        const matchTitle = selectedProg?.name && item.title && item.title.toLowerCase().includes(selectedProg.name.toLowerCase());
        if (!matchProgId && !matchProgName && !matchTitle) return false;
      }

      // Class filter
      if (selectedClassFilter !== 'ALL') {
        const itemClasses = item.classLevels?.length ? item.classLevels : [item.classLevel || ''];
        if (!itemClasses.some(c => c.toLowerCase() === selectedClassFilter.toLowerCase())) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchTutor = item.tutorName?.toLowerCase().includes(q);
        const matchClass = item.classLevel?.toLowerCase().includes(q) || (item.classLevels || []).some(c => c.toLowerCase().includes(q));
        const matchDate = item.date?.toLowerCase().includes(q);
        if (!matchTitle && !matchTutor && !matchClass && !matchDate) return false;
      }

      return true;
    });

    // 2. Group items on each date by timetable slot / scheduleGroupId
    const sessionMap = new Map<string, GroupedSession>();

    filteredRaw.forEach(item => {
      const itemDate = item.date || todayStr;
      const startTime = item.startTime || '09:00';
      const endTime = item.endTime || '10:00';
      const programName = item.programName || item.title || 'Curriculum Session';
      
      // Grouping key: Same date + (scheduleGroupId OR same program + time + tutor)
      const groupKey = `${itemDate}_${item.scheduleGroupId || `${programName}_${startTime}_${endTime}_${item.tutorName || ''}`}`;

      if (!sessionMap.has(groupKey)) {
        let formattedDate = itemDate;
        let dayName = '';
        try {
          const d = new Date(itemDate + 'T00:00:00');
          if (!isNaN(d.getTime())) {
            const day = d.getDate();
            const suffix = day % 10 === 1 && day % 100 !== 11 ? 'st' : day % 10 === 2 && day % 100 !== 12 ? 'nd' : day % 10 === 3 && day % 100 !== 13 ? 'rd' : 'th';
            dayName = d.toLocaleDateString('en-NG', { weekday: 'long' });
            formattedDate = `${dayName}, ${day}${suffix} ${d.toLocaleDateString('en-NG', { month: 'long' })} ${d.getFullYear()}`;
          }
        } catch {
          // fallback
        }

        sessionMap.set(groupKey, {
          sessionKey: groupKey,
          scheduleGroupId: item.scheduleGroupId,
          date: itemDate,
          formattedDate,
          dayName,
          startTime,
          endTime,
          title: item.title || programName,
          programName,
          programId: item.programId,
          tutorName: item.tutorName,
          meetingLink: item.meetingLink,
          overallStatus: item.status || 'SCHEDULED',
          classRangeBadge: item.classLevel || 'All Classes',
          classLevels: [],
          occurrences: [],
          isLiveNow: false,
          isAutoCompleted: false
        });
      }

      const session = sessionMap.get(groupKey)!;
      session.occurrences.push(item);
      // The header represents the overall timetable window; expanded rows retain each class's exact time.
      const times = session.occurrences.flatMap(o => [o.startTime, o.endTime]).filter(Boolean).sort();
      if (times.length) {
        session.startTime = times[0];
        session.endTime = times[times.length - 1];
      }

      // Collect all class levels
      if (item.classLevel && !session.classLevels.includes(item.classLevel)) {
        session.classLevels.push(item.classLevel);
      }
      if (Array.isArray(item.classLevels)) {
        item.classLevels.forEach(lvl => {
          if (lvl && !session.classLevels.includes(lvl)) {
            session.classLevels.push(lvl);
          }
        });
      }
    });

    // 3. Post-process sessions to compute accurate class range badge, live state, and auto-completion
    const sessionsList = Array.from(sessionMap.values()).map(sess => {
      // Natural sort class levels (Year 1, Year 2, ... Year 5, JSS 1, etc.)
      sess.classLevels.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // Format Class Range Badge (e.g. "Year 1 – Year 5" or "Year 1, Year 2" or "All Classes")
      if (sess.classLevels.length > 1) {
        const first = sess.classLevels[0];
        const last = sess.classLevels[sess.classLevels.length - 1];
        if (sess.classLevels.length >= 3 && first.startsWith('Year') && last.startsWith('Year')) {
          sess.classRangeBadge = `${first} – ${last} (${sess.classLevels.length} Classes)`;
        } else if (sess.classLevels.length >= 3 && first.startsWith('JSS') && last.startsWith('JSS')) {
          sess.classRangeBadge = `${first} – ${last} (${sess.classLevels.length} Classes)`;
        } else {
          sess.classRangeBadge = `${sess.classLevels.join(', ')} (${sess.classLevels.length} Classes)`;
        }
      } else if (sess.classLevels.length === 1) {
        sess.classRangeBadge = sess.classLevels[0];
      }

      // Check live status strictly based on today's calendar date and active time window
      const isToday = sess.date === todayStr;
      const isPastDate = sess.date < todayStr;
      const isPastTimeToday = isToday && sess.endTime < currentTimeStr;
      const isCurrentTimeSlot = isToday && sess.startTime <= currentTimeStr && currentTimeStr <= sess.endTime;

      const allExplicitCompleted = sess.occurrences.length > 0 && sess.occurrences.every(o => o.status === 'COMPLETED' || o.status === 'ATTENDED');
      const anyAbsent = sess.occurrences.some(o => o.status === 'ABSENT');
      const anyRescheduled = sess.occurrences.some(o => o.status === 'RESCHEDULED');
      const anyCancelled = sess.occurrences.some(o => o.status === 'CANCELLED');
      const tutorMarkedLiveToday = isToday && sess.occurrences.some(o => o.status === 'ONGOING') && currentTimeStr <= sess.endTime;

      sess.isLiveNow = false;
      sess.isAutoCompleted = false;

      if (anyCancelled) {
        sess.overallStatus = 'CANCELLED';
      } else if (anyRescheduled) {
        sess.overallStatus = 'RESCHEDULED';
      } else if (anyAbsent) {
        sess.overallStatus = 'ABSENT';
      } else if (allExplicitCompleted || isPastDate || isPastTimeToday) {
        sess.overallStatus = 'COMPLETED';
        sess.isAutoCompleted = isPastDate || isPastTimeToday;
      } else if (isToday && (isCurrentTimeSlot || tutorMarkedLiveToday)) {
        // ONLY mark as ONGOING/Live if the class is scheduled for TODAY and within its active time window!
        sess.overallStatus = 'ONGOING';
        sess.isLiveNow = true;
      } else {
        // Any future date OR today before start time is strictly SCHEDULED (Upcoming)
        sess.overallStatus = 'SCHEDULED';
        sess.isLiveNow = false;
      }

      return sess;
    });

    // 4. Separate Upcoming vs History according to tab
    const filteredByTab = sessionsList.filter(sess => {
      const isDone = sess.overallStatus === 'COMPLETED' || sess.overallStatus === 'ATTENDED';
      const isPast = sess.date < todayStr && sess.overallStatus !== 'ONGOING';

      if (viewTab === 'UPCOMING') {
        // Upcoming tab: show active sessions that are not past completed
        if (sess.overallStatus === 'ONGOING') return true;
        if (isDone || isPast) return false;
        return true;
      } else {
        // History tab: show completed, past, cancelled, absent sessions
        if (sess.overallStatus === 'ONGOING') return false;
        return isDone || isPast || sess.overallStatus === 'CANCELLED' || sess.overallStatus === 'ABSENT';
      }
    });

    // Sort: upcoming = earliest -> latest; history = latest -> earliest
    filteredByTab.sort((a, b) => {
      const dateA = `${a.date}T${a.startTime}`;
      const dateB = `${b.date}T${b.startTime}`;
      return viewTab === 'UPCOMING' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });

    // 5. Group by Date Header
    const dateGroups: Array<{ date: string; formattedDate: string; dayName: string; sessions: GroupedSession[] }> = [];

    filteredByTab.forEach(sess => {
      let group = dateGroups.find(g => g.date === sess.date);
      if (!group) {
        group = {
          date: sess.date,
          formattedDate: sess.formattedDate,
          dayName: sess.dayName,
          sessions: []
        };
        dateGroups.push(group);
      }
      group.sessions.push(sess);
    });

    return dateGroups;
  }, [schedules, selectedProgramId, programs, selectedClassFilter, searchQuery, viewTab]);

  // Find currently live session for prominent banner (ONLY if scheduled for today and is currently live)
  const liveSession = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const group of groupedDaySessions) {
      if (group.date !== todayStr) continue;
      const found = group.sessions.find(s => s.isLiveNow && s.overallStatus === 'ONGOING' && s.date === todayStr);
      if (found) return found;
    }
    return null;
  }, [groupedDaySessions]);

  // Find next upcoming session
  const nextSession = useMemo(() => {
    if (viewTab !== 'UPCOMING') return null;
    for (const group of groupedDaySessions) {
      const found = group.sessions.find(s => s.overallStatus === 'SCHEDULED' && !s.isLiveNow);
      if (found) return found;
    }
    return null;
  }, [groupedDaySessions, viewTab]);

  const renderStatusBadge = (status: string, isAutoCompleted = false) => {
    switch (status) {
      case 'ONGOING':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-[#B91C1C] dark:text-red-400">
            <Radio size={12} /> Live Now / In Session
          </span>
        );
      case 'COMPLETED':
      case 'ATTENDED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase text-[#1E293B] dark:text-slate-200">
            <CheckCircle2 size={12} /> {isAutoCompleted ? 'Completed (Ended)' : 'Completed'}
          </span>
        );
      case 'ABSENT':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase text-[#B91C1C] dark:text-red-400">
            <XCircle size={12} /> Absent
          </span>
        );
      case 'RESCHEDULED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase text-[#1E293B] dark:text-slate-300">
            <RotateCcw size={12} /> Rescheduled
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
            <AlertCircle size={12} /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-600 dark:text-slate-300">
            <Clock size={12} /> Scheduled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* LIVE / ONGOING CLASS BANNER */}
      {liveSession && (
        <section className="relative overflow-hidden rounded-xl bg-[#1E293B] text-white p-5 sm:p-6 border-l-4 border-[#B91C1C]">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                  <Radio size={13} /> LIVE CLASS IN SESSION
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300 font-medium">
                  {liveSession.formattedDate}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {liveSession.title}
              </h2>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                <span className="font-semibold text-white">
                  Cohort: {liveSession.classRangeBadge}
                </span>
                <span className="font-mono text-red-300 font-semibold tabular-nums">
                  {liveSession.startTime} – {liveSession.endTime}
                </span>
                {liveSession.tutorName && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                    <UserCheck size={14} className="text-red-300" /> Assigned Faculty: {liveSession.tutorName}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {liveSession.meetingLink && (
                <a
                  href={liveSession.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <Video size={15} />
                  <span>Join Live Classroom</span>
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* PROGRAMME SELECTION & TIMETABLE HEADER */}
      <div className="bg-white dark:bg-[#111827] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <Calendar size={18} className="text-[#B91C1C] shrink-0" />
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1E293B] dark:text-white tracking-tight">
                  Institutional Class Timetable &amp; Schedule
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Daily schedule, cohort ranges, assigned faculty, and session statuses for {schoolName}.
                </p>
              </div>
            </div>
          </div>

          {/* View Tab Switcher: Upcoming vs History */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setViewTab('UPCOMING')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewTab === 'UPCOMING'
                  ? 'bg-white dark:bg-slate-800 text-[#B91C1C] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock size={13} />
              <span>Upcoming &amp; Active</span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab('HISTORY')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewTab === 'HISTORY'
                  ? 'bg-white dark:bg-slate-800 text-[#B91C1C] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History size={13} />
              <span>Schedule History</span>
            </button>
          </div>
        </div>

        {/* Assigned Programmes Filter Selector Strip */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2.5">
            Filter by Assigned Programme Track
          </span>

          {activePrograms.length === 0 ? (
            <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/40">
              No active programmes currently configured for {schoolName}.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedProgramId('ALL')}
                className={`px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer ${
                  selectedProgramId === 'ALL'
                    ? 'border-[#1E293B] bg-[#1E293B] text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <span>All School Programmes</span>
                <span className={`font-mono text-[11px] tabular-nums ${selectedProgramId === 'ALL' ? 'text-slate-300' : 'text-slate-400'}`}>
                  ({schedules.length})
                </span>
              </button>

              {activePrograms.map(prog => {
                const isSelected = selectedProgramId === prog.id;
                const progSchedules = schedules.filter(s => 
                  s.programId === prog.id || 
                  (prog.name && s.programName && s.programName.toLowerCase() === prog.name.toLowerCase()) ||
                  (prog.name && s.title && s.title.toLowerCase().includes(prog.name.toLowerCase()))
                );
                const leadTutor = prog.assignedTutors?.[0]?.tutorName;

                return (
                  <button
                    key={prog.id}
                    type="button"
                    onClick={() => setSelectedProgramId(prog.id)}
                    className={`px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'border-[#B91C1C] bg-[#B91C1C] text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <span>{prog.name}</span>
                    {leadTutor && (
                      <span className={`hidden sm:inline text-[10px] ${isSelected ? 'text-red-100' : 'text-slate-400'}`}>
                        · {leadTutor}
                      </span>
                    )}
                    <span className={`font-mono text-[11px] tabular-nums ${isSelected ? 'text-red-100' : 'text-slate-400'}`}>
                      ({progSchedules.length})
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* UNIFIED CHRONOLOGICAL SCHEDULE LIST */}
      <div className="bg-white dark:bg-[#111827] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
              <GraduationCap size={16} className="text-[#B91C1C]" />
              <span>
                {selectedProgramId === 'ALL'
                  ? 'All Class Schedules'
                  : `Class Schedule for ${programs.find(p => p.id === selectedProgramId)?.name || 'Selected Programme'}`}
              </span>
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 tabular-nums">
                · {groupedDaySessions.reduce((acc, g) => acc + g.sessions.length, 0)} {viewTab === 'UPCOMING' ? 'upcoming' : 'historical'} sessions
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Consolidated daily schedule: expand a session row to inspect individual class cohorts.
            </p>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter by topic, tutor..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
            />
          </div>
        </div>

        {/* Chronological List of Date Groups */}
        {groupedDaySessions.length === 0 ? (
          <div className="text-center py-14 px-4 bg-slate-50/50 dark:bg-slate-900/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
            <Calendar size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
              {viewTab === 'UPCOMING' ? 'No upcoming class schedules found' : 'No past schedule history found'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {selectedProgramId === 'ALL'
                ? 'No timetable entries have been scheduled for this school.'
                : 'No sessions are currently scheduled for the selected programme track.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedDaySessions.map(group => (
              <div key={group.date} className="space-y-2.5">
                {/* Date Section Header */}
                <div className="flex items-center gap-3">
                  <div className="text-xs font-bold text-[#1E293B] dark:text-white inline-flex items-center gap-2">
                    <Calendar size={14} className="text-[#B91C1C]" />
                    <span>{group.formattedDate}</span>
                  </div>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>

                {/* Day's Consolidated Sessions List */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/40">
                  {group.sessions.map(session => {
                    const isExpanded = Boolean(expandedSessionKeys[session.sessionKey]);
                    const hasMultipleClasses = session.classLevels.length > 1;

                    return (
                      <div 
                        key={session.sessionKey} 
                        className={`p-4 transition-colors ${
                          session.overallStatus === 'ONGOING' 
                            ? 'bg-red-50/40 dark:bg-red-950/15 border-l-2 border-[#B91C1C]' 
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Time & Class Range & Programme Details */}
                          <div className="flex items-start sm:items-center gap-4 min-w-0">
                            <div className="text-slate-700 dark:text-slate-300 font-mono text-xs font-semibold shrink-0 min-w-[100px] tabular-nums">
                              <span className="block text-[10px] uppercase text-slate-400 font-sans">Time Slot</span>
                              {session.startTime} – {session.endTime}
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                                <span className="font-bold text-[#B91C1C] dark:text-red-400">
                                  {session.classRangeBadge}
                                </span>
                                {session.programName && (
                                  <>
                                    <span className="text-slate-300 dark:text-slate-700">·</span>
                                    <span className="font-medium text-slate-600 dark:text-slate-300">
                                      {session.programName}
                                    </span>
                                  </>
                                )}
                                <span className="text-slate-300 dark:text-slate-700">·</span>
                                {renderStatusBadge(session.overallStatus, session.isAutoCompleted)}
                              </div>

                              <h4 className="text-sm font-bold text-[#1E293B] dark:text-white mt-1 tracking-tight">
                                {session.title}
                              </h4>

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-300">
                                <span className="inline-flex items-center gap-1.5 font-medium">
                                  <UserCheck size={13} className="text-[#1E293B] dark:text-slate-400 shrink-0" />
                                  <span>Faculty:</span>
                                  <strong className="font-semibold text-[#1E293B] dark:text-white">
                                    {session.tutorName || 'Faculty Instructor Assigned'}
                                  </strong>
                                </span>

                                {session.meetingLink && (
                                  <a
                                    href={session.meetingLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[#B91C1C] dark:text-red-400 font-semibold hover:underline inline-flex items-center gap-1 text-[11px]"
                                  >
                                    <ExternalLink size={12} /> Virtual Room
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Actions: Expand Range Button & Status Controller */}
                          <div className="flex items-center gap-2.5 self-end lg:self-center shrink-0">
                            {hasMultipleClasses && (
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() => toggleExpand(session.sessionKey)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <span>{isExpanded ? 'Hide Cohort Breakdown' : `Cohorts (${session.classLevels.length})`}</span>
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            )}

                            {canManageStatus ? (
                              <select
                                disabled={Boolean(updatingId)}
                                value={session.overallStatus}
                                onChange={e => handleUpdateStatus(session.occurrences.map(o => o.id), e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                              >
                                <option value="SCHEDULED">Scheduled</option>
                                <option value="ONGOING">Live Now</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="ABSENT">Absent</option>
                                <option value="RESCHEDULED">Rescheduled</option>
                                <option value="CANCELLED">Cancelled</option>
                              </select>
                            ) : null}
                          </div>
                        </div>

                        {/* Expandable Breakdown: Concise divider-separated cohort rows (not a card grid) */}
                        {hasMultipleClasses && isExpanded && (
                          <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 rounded-lg px-3.5 py-2.5">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider pb-2">
                              <span>Class Cohort Breakdown ({session.classLevels.length} Classes)</span>
                              {canManageStatus && <span className="text-[10px] text-slate-400">Tutor Status Control Active</span>}
                            </div>

                            <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                              {session.classLevels.map((lvl) => {
                                const matchingOcc = session.occurrences.find(o => o.classLevel === lvl);
                                const occStatus = matchingOcc?.status || session.overallStatus;
                                const occTime = matchingOcc?.startTime && matchingOcc?.endTime ? `${matchingOcc.startTime} – ${matchingOcc.endTime}` : `${session.startTime} – ${session.endTime}`;

                                return (
                                  <div
                                    key={lvl}
                                    className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span className="font-bold text-[#B91C1C] dark:text-red-400 w-20 shrink-0">
                                        {lvl}
                                      </span>
                                      <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                                        {occTime}
                                      </span>
                                      <span className="text-slate-700 dark:text-slate-300 truncate">
                                        {session.title}
                                      </span>
                                    </div>

                                    <div className="shrink-0 flex items-center gap-2">
                                      {canManageStatus && matchingOcc ? (
                                        <select
                                          value={occStatus}
                                          onChange={e => handleUpdateStatus([matchingOcc.id], e.target.value)}
                                          className="text-[11px] font-semibold py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                        >
                                          <option value="SCHEDULED">Scheduled</option>
                                          <option value="ONGOING">Live</option>
                                          <option value="COMPLETED">Completed</option>
                                          <option value="ABSENT">Absent</option>
                                          <option value="RESCHEDULED">Rescheduled</option>
                                          <option value="CANCELLED">Cancelled</option>
                                        </select>
                                      ) : (
                                        renderStatusBadge(occStatus, session.isAutoCompleted)
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
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolClassScheduleTimeline;
