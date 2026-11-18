import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  Clock,
  Filter,
  Layers,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

const BRAND_NAVY = '#1E293B';
const BRAND_CRIMSON = '#B91C1C';
const BRAND_SLATE = '#64748B';
const BRAND_SLATE_MUTED = '#94A3B8';

export interface LearningProgressItem {
  subject: string;
  progress: number;
  modulesDone: number;
  modulesTotal: number;
  hours?: number;
}

export interface StudentAssignmentRecord {
  id: string;
  title: string;
  subject?: string;
  status?: string;
  reviewStatus?: string;
  dueDate?: string;
  submittedAt?: string;
  grade?: number;
}

export interface StudentGradeRecord {
  id: string;
  date: string;
  assessment: string;
  subject: string;
  grade: number;
  score?: number;
  maxScore?: number;
  tier?: string;
  workType?: string;
}

export interface StudentMilestoneRecord {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  completedAt?: string;
}

export interface StudentAnalyticsProps {
  studentName?: string;
  studentClass?: string;
  enrolledSubjects?: string[];
  completedModulesCount?: number;
  totalModulesCount?: number;
  className?: string;
  learningTracks?: LearningProgressItem[];
  assignments?: StudentAssignmentRecord[];
  gradeRecords?: StudentGradeRecord[];
  milestones?: StudentMilestoneRecord[];
}

interface AssignmentWeeklyItem {
  weekKey: string;
  week: string;
  completed: number;
  inProgress: number;
  pending: number;
}

interface AssignmentStatusItem {
  name: string;
  value: number;
  color: string;
}

const parseValidDate = (raw?: string): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatShortDate = (raw?: string): string => {
  const d = parseValidDate(raw);
  if (!d) return raw || 'Recorded';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
};

const resolveGradeBand = (pct: number): string => {
  if (pct >= 85) return 'Distinction';
  if (pct >= 70) return 'Merit';
  if (pct >= 50) return 'Pass';
  return 'Needs Review';
};

export const StudentAnalyticsVisualizer: React.FC<StudentAnalyticsProps> = ({
  studentName = 'Student',
  studentClass = 'Not recorded',
  enrolledSubjects = [],
  completedModulesCount = 0,
  totalModulesCount = 0,
  className = '',
  learningTracks = [],
  assignments = [],
  gradeRecords = [],
  milestones = [],
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'progress' | 'assignments' | 'grades'>(
    'overview'
  );
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [timeRange, setTimeRange] = useState<'30days' | 'term' | 'all'>('all');

  const filterSubjectList = useMemo(() => {
    const combined = new Set<string>(enrolledSubjects.filter(Boolean));
    gradeRecords.forEach((g) => {
      if (g.subject) combined.add(g.subject);
    });
    return ['ALL', ...Array.from(combined)];
  }, [enrolledSubjects, gradeRecords]);

  // 1. Learning Progress across real tracks / modules / milestones
  const learningProgressData = useMemo<LearningProgressItem[]>(() => {
    return (learningTracks || []).map((track) => ({
      ...track,
      hours: track.hours ?? 0,
    }));
  }, [learningTracks]);

  // 2. Assignment Status Distribution (strictly from real assignment records)
  const assignmentBreakdown = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let pending = 0;

    (assignments || []).forEach((a) => {
      const s = String(a.status || a.reviewStatus || '').toUpperCase();
      if (s === 'COMPLETED' || s === 'REVIEWED' || s === 'GRADED') {
        completed++;
      } else if (
        ['SUBMITTED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'RESUBMISSION_REQUIRED'].includes(s)
      ) {
        inProgress++;
      } else {
        pending++;
      }
    });

    const pieData: AssignmentStatusItem[] = [
      { name: 'Completed', value: completed, color: BRAND_NAVY },
      { name: 'In Review / Progress', value: inProgress, color: BRAND_CRIMSON },
      { name: 'Pending', value: pending, color: BRAND_SLATE_MUTED },
    ].filter((item) => item.value > 0);

    return {
      completed,
      inProgress,
      pending,
      total: assignments.length,
      pieData,
    };
  }, [assignments]);

  // 3. Weekly Assignment Velocity (strictly from dated assignments)
  const assignmentWeeklyData = useMemo<AssignmentWeeklyItem[]>(() => {
    const bucketMap = new Map<string, AssignmentWeeklyItem>();

    (assignments || []).forEach((a) => {
      const dt = parseValidDate(a.submittedAt || a.dueDate);
      if (!dt) return;

      const monday = new Date(dt);
      const day = monday.getDay();
      monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
      const weekKey = monday.toISOString().slice(0, 10);
      const label = monday.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

      if (!bucketMap.has(weekKey)) {
        bucketMap.set(weekKey, {
          weekKey,
          week: label,
          completed: 0,
          inProgress: 0,
          pending: 0,
        });
      }
      const bucket = bucketMap.get(weekKey)!;
      const s = String(a.status || a.reviewStatus || '').toUpperCase();
      if (s === 'COMPLETED' || s === 'REVIEWED' || s === 'GRADED') {
        bucket.completed += 1;
      } else if (
        ['SUBMITTED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'RESUBMISSION_REQUIRED'].includes(s)
      ) {
        bucket.inProgress += 1;
      } else {
        bucket.pending += 1;
      }
    });

    return Array.from(bucketMap.values())
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
      .slice(-8);
  }, [assignments]);

  // 4. Real Released Grade Trends
  const sortedGradeRecords = useMemo(() => {
    return [...(gradeRecords || [])]
      .filter((g) => Number.isFinite(g.grade))
      .sort((a, b) => {
        const da = parseValidDate(a.date)?.getTime() || 0;
        const dbTime = parseValidDate(b.date)?.getTime() || 0;
        return da - dbTime;
      })
      .map((g) => ({
        ...g,
        dateLabel: formatShortDate(g.date),
        tierLabel: g.tier || resolveGradeBand(g.grade),
      }));
  }, [gradeRecords]);

  const filteredGradeTrends = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      timeRange === '30days'
        ? now - 30 * 24 * 60 * 60 * 1000
        : timeRange === 'term'
        ? now - 120 * 24 * 60 * 60 * 1000
        : 0;

    return sortedGradeRecords.filter((item) => {
      if (
        selectedSubject !== 'ALL' &&
        item.subject.toLowerCase().trim() !== selectedSubject.toLowerCase().trim()
      ) {
        return false;
      }
      if (cutoffMs > 0) {
        const dt = parseValidDate(item.date)?.getTime();
        if (dt && dt < cutoffMs) return false;
      }
      return true;
    });
  }, [sortedGradeRecords, selectedSubject, timeRange]);

  // 5. Real Subject Average Breakdown (for Learning Progress view)
  const subjectPerformanceData = useMemo(() => {
    const map = new Map<string, { subject: string; total: number; count: number }>();
    sortedGradeRecords.forEach((g) => {
      const key = g.subject || 'General';
      const entry = map.get(key) || { subject: key, total: 0, count: 0 };
      entry.total += g.grade;
      entry.count += 1;
      map.set(key, entry);
    });
    return Array.from(map.values()).map((entry) => ({
      subject: entry.subject,
      averageGrade: Math.round(entry.total / Math.max(entry.count, 1)),
      assessmentsCount: entry.count,
    }));
  }, [sortedGradeRecords]);

  // Overall Computed Stats (100% real)
  const stats = useMemo(() => {
    const completionRate =
      assignmentBreakdown.total > 0
        ? Math.round((assignmentBreakdown.completed / assignmentBreakdown.total) * 100)
        : 0;

    const avgGrade = sortedGradeRecords.length
      ? Math.round(
          sortedGradeRecords.reduce((acc, curr) => acc + curr.grade, 0) / sortedGradeRecords.length
        )
      : 0;

    const latestGrade = sortedGradeRecords[sortedGradeRecords.length - 1]?.grade ?? 0;
    const previousGrade =
      sortedGradeRecords.length >= 2
        ? sortedGradeRecords[sortedGradeRecords.length - 2].grade
        : latestGrade;
    const gradeDelta = sortedGradeRecords.length >= 2 ? latestGrade - previousGrade : 0;

    const completedMilestones = milestones.filter(
      (m) => String(m.status || '').toUpperCase() === 'COMPLETED'
    ).length;

    const overallSyllabusProgress =
      learningProgressData.length > 0
        ? Math.round(
            learningProgressData.reduce((acc, curr) => acc + curr.progress, 0) /
              learningProgressData.length
          )
        : milestones.length > 0
        ? Math.round((completedMilestones / milestones.length) * 100)
        : totalModulesCount > 0
        ? Math.round((completedModulesCount / totalModulesCount) * 100)
        : 0;

    return {
      completionRate,
      totalAssignments: assignmentBreakdown.total,
      completedAssignments: assignmentBreakdown.completed,
      inProgressAssignments: assignmentBreakdown.inProgress,
      pendingAssignments: assignmentBreakdown.pending,
      avgGrade,
      gradeDelta,
      overallSyllabusProgress,
      completedMilestones,
      totalMilestones: milestones.length,
      hasGradeData: sortedGradeRecords.length > 0,
      hasAssignmentData: assignmentBreakdown.total > 0,
      hasLearningData:
        learningProgressData.length > 0 || milestones.length > 0 || totalModulesCount > 0,
    };
  }, [
    assignmentBreakdown,
    sortedGradeRecords,
    learningProgressData,
    milestones,
    completedModulesCount,
    totalModulesCount,
  ]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1E293B] border border-slate-700 rounded-lg p-3 shadow-lg text-xs text-white z-50">
          <p className="font-bold text-white mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div
              key={`item-${index}`}
              className="flex items-center justify-between gap-4 text-slate-200 py-0.5"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs inline-block shrink-0"
                  style={{ backgroundColor: entry.color || entry.fill || entry.stroke }}
                />
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold text-white font-mono tabular-nums">
                {entry.value}
                {String(entry.dataKey || '')
                  .toLowerCase()
                  .match(/grade|progress|average/)
                  ? '%'
                  : ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <section
      className={`bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 ${className}`}
    >
      {/* Header & Section Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 mb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
            <BarChart3 size={18} className="text-[#B91C1C]" aria-hidden="true" />
            <span>Academic Analytics &amp; Progress</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {studentName} · {studentClass || 'Standard Track'} · {sortedGradeRecords.length} released
            score{sortedGradeRecords.length === 1 ? '' : 's'} · {stats.totalAssignments} deliverable
            {stats.totalAssignments === 1 ? '' : 's'}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 self-start lg:self-auto">
          {(
            [
              { id: 'overview', label: 'Overview', icon: Layers },
              { id: 'progress', label: 'Curriculum Progress', icon: BookOpen },
              { id: 'assignments', label: 'Completion Rates', icon: CheckSquare },
              { id: 'grades', label: 'Grade Trends', icon: LineChartIcon },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#1E293B] dark:bg-[#B91C1C] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#1E293B] dark:hover:text-white'
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Institutional 4-Column Divided Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 mb-6">
        <div className="p-4">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Award size={13} className="text-[#B91C1C]" aria-hidden="true" />
            <span>Average Released Grade</span>
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-[#1E293B] dark:text-white tabular-nums">
              {stats.hasGradeData ? `${stats.avgGrade}%` : '—'}
            </span>
            {sortedGradeRecords.length >= 2 && (
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                {stats.gradeDelta >= 0 ? `+${stats.gradeDelta}%` : `${stats.gradeDelta}%`} vs prev
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {stats.hasGradeData
              ? `Across ${sortedGradeRecords.length} released assessment${
                  sortedGradeRecords.length === 1 ? '' : 's'
                }`
              : 'No released assessments yet'}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-[#1E293B] dark:text-slate-300" aria-hidden="true" />
            <span>Assignment Completion</span>
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-[#1E293B] dark:text-white tabular-nums">
              {stats.hasAssignmentData ? `${stats.completionRate}%` : '—'}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              {stats.hasAssignmentData
                ? `${stats.completedAssignments}/${stats.totalAssignments}`
                : '0 tasks'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {stats.hasAssignmentData
              ? `${stats.inProgressAssignments} in review · ${stats.pendingAssignments} pending`
              : 'No assignments issued yet'}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <BookOpen size={13} className="text-[#B91C1C]" aria-hidden="true" />
            <span>Syllabus &amp; Modules</span>
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-[#1E293B] dark:text-white tabular-nums">
              {stats.hasLearningData ? `${stats.overallSyllabusProgress}%` : '—'}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              {totalModulesCount > 0
                ? `${completedModulesCount}/${totalModulesCount} modules`
                : `${stats.completedMilestones}/${stats.totalMilestones} milestones`}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {stats.hasLearningData ? 'Verified curriculum progression' : 'Awaiting module records'}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Clock size={13} className="text-[#1E293B] dark:text-slate-300" aria-hidden="true" />
            <span>Milestones Completed</span>
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-[#1E293B] dark:text-white tabular-nums">
              {stats.totalMilestones > 0 ? stats.completedMilestones : '—'}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              {stats.totalMilestones > 0 ? `of ${stats.totalMilestones}` : 'None set'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {stats.totalMilestones > 0
              ? 'Tutor-verified term milestones'
              : 'No milestones published yet'}
          </p>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Recent Grade Trajectory Area Chart */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                    <LineChartIcon size={16} className="text-[#B91C1C]" aria-hidden="true" />
                    <span>Released Grade Trajectory</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Chronological scores across released tests and examinations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('grades')}
                  className="text-xs font-semibold text-[#B91C1C] hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  Details <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              </div>

              {sortedGradeRecords.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
                  <LineChartIcon size={24} className="text-slate-400 mb-2" aria-hidden="true" />
                  <p className="text-xs font-bold text-[#1E293B] dark:text-white">
                    No released assessment grades yet
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                    Your grade trajectory chart will populate once completed assessments are graded and
                    released by your tutor.
                  </p>
                </div>
              ) : (
                <>
                  <div className="h-56 w-full pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={sortedGradeRecords}
                        margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="jdiStudentGradeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={BRAND_CRIMSON} stopOpacity={0.28} />
                            <stop offset="95%" stopColor={BRAND_CRIMSON} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="rgba(148, 163, 184, 0.2)"
                        />
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                          axisLine={{ stroke: 'rgba(148, 163, 184, 0.25)' }}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="grade"
                          name="Released Score"
                          stroke={BRAND_CRIMSON}
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#jdiStudentGradeGrad)"
                          activeDot={{ r: 5, fill: BRAND_CRIMSON, stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-5 pt-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="w-3 h-0.5 bg-[#B91C1C] inline-block" /> Released Score (%)
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Assignment Status Breakdown Donut */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                    <PieChartIcon size={16} className="text-[#1E293B] dark:text-slate-300" aria-hidden="true" />
                    <span>Deliverables Status</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {stats.totalAssignments} assigned deliverable
                    {stats.totalAssignments === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('assignments')}
                  className="text-xs font-semibold text-[#B91C1C] hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  Breakdown <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              </div>

              {assignmentBreakdown.pieData.length === 0 ? (
                <div className="h-52 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-5 text-center">
                  <CheckSquare size={24} className="text-slate-400 mb-2" aria-hidden="true" />
                  <p className="text-xs font-bold text-[#1E293B] dark:text-white">
                    No deliverables recorded yet
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Assigned coursework and completion statuses will appear here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="h-48 w-full relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={assignmentBreakdown.pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={74}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {assignmentBreakdown.pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xl font-bold text-[#1E293B] dark:text-white tabular-nums leading-none">
                        {stats.completionRate}%
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mt-1">
                        Completed
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-2 text-xs">
                    {assignmentBreakdown.pieData.map((item) => (
                      <div
                        key={item.name}
                        className="py-1.5 flex items-center justify-between text-slate-700 dark:text-slate-300"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span>{item.name}</span>
                        </span>
                        <span className="font-bold text-[#1E293B] dark:text-white font-mono tabular-nums">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Syllabus Progression Rows */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                  <BookOpen size={16} className="text-[#B91C1C]" aria-hidden="true" />
                  <span>Curriculum Track Progression</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verified module completion across your enrolled tracks
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('progress')}
                className="text-xs font-semibold text-[#B91C1C] hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                Track View <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            </div>

            {learningProgressData.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No module progress tracks recorded yet. Completed modules verified by your tutor will appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {learningProgressData.map((item) => (
                  <div key={item.subject} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold text-[#1E293B] dark:text-white">
                        {item.subject}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {item.modulesDone}/{item.modulesTotal} units ·{' '}
                        <strong className="text-[#B91C1C]">{item.progress}%</strong>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#B91C1C] transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CURRICULUM PROGRESS */}
      {activeTab === 'progress' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B] dark:text-white">
                  Track Completion Percentage
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Percentage of assigned modules or milestones completed per track
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {learningProgressData.length} Track{learningProgressData.length === 1 ? '' : 's'}
              </span>
            </div>

            {learningProgressData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
                <BookOpen size={24} className="text-slate-400 mb-2" aria-hidden="true" />
                <p className="text-xs font-bold text-[#1E293B] dark:text-white">
                  No track progress data recorded yet
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Once modules or milestones are assigned, track completion percentages appear here.
                </p>
              </div>
            ) : (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={learningProgressData}
                    margin={{ top: 10, right: 12, left: -18, bottom: 16 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(148, 163, 184, 0.2)"
                    />
                    <XAxis
                      dataKey="subject"
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(148, 163, 184, 0.25)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="progress"
                      name="Completion %"
                      fill={BRAND_NAVY}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-[#1E293B] dark:text-white">
                Average Score by Subject
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Computed strictly from released test and exam results
              </p>
            </div>

            {subjectPerformanceData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
                <Award size={24} className="text-slate-400 mb-2" aria-hidden="true" />
                <p className="text-xs font-bold text-[#1E293B] dark:text-white">
                  No subject averages yet
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Subject averages unlock after at least one released assessment result.
                </p>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={subjectPerformanceData}
                    layout="vertical"
                    margin={{ top: 5, right: 16, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="rgba(148, 163, 184, 0.2)"
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="subject"
                      width={110}
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="averageGrade"
                      name="Average Score %"
                      fill={BRAND_CRIMSON}
                      radius={[0, 4, 4, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ASSIGNMENT COMPLETION RATES */}
      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B] dark:text-white">
                  Weekly Deliverable Activity
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Assignments grouped by submission or due week
                </p>
              </div>
              <span className="text-xs font-semibold text-[#1E293B] dark:text-slate-200 tabular-nums">
                {stats.hasAssignmentData
                  ? `${stats.completionRate}% Completion Rate`
                  : 'No assignment history'}
              </span>
            </div>

            {assignmentWeeklyData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
                <CheckSquare size={24} className="text-slate-400 mb-2" aria-hidden="true" />
                <p className="text-xs font-bold text-[#1E293B] dark:text-white">
                  No dated assignments to chart yet
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Weekly activity appears once assignments have a due date or submission date.
                </p>
              </div>
            ) : (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={assignmentWeeklyData}
                    margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(148, 163, 184, 0.2)"
                    />
                    <XAxis
                      dataKey="week"
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(148, 163, 184, 0.25)' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="completed" name="Completed" fill={BRAND_NAVY} stackId="a" />
                    <Bar
                      dataKey="inProgress"
                      name="Submitted / In Review"
                      fill={BRAND_CRIMSON}
                      stackId="a"
                    />
                    <Bar
                      dataKey="pending"
                      name="Pending"
                      fill={BRAND_SLATE_MUTED}
                      stackId="a"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#1E293B] dark:text-white">
                Deliverable Summary
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Breakdown across assigned tasks
              </p>
            </div>

            <div className="my-5 py-4 border-y border-slate-100 dark:border-slate-800 text-center">
              <span className="text-3xl font-bold text-[#1E293B] dark:text-white tabular-nums">
                {stats.hasAssignmentData ? `${stats.completionRate}%` : '—'}
              </span>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                {stats.hasAssignmentData
                  ? `${stats.completedAssignments} of ${stats.totalAssignments} Verified Complete`
                  : 'No assignments assigned'}
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">Verified Complete</span>
                <span className="font-bold text-[#1E293B] dark:text-white font-mono tabular-nums">
                  {stats.completedAssignments}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">Submitted / Under Review</span>
                <span className="font-bold text-[#B91C1C] font-mono tabular-nums">
                  {stats.inProgressAssignments}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">Awaiting Submission</span>
                <span className="font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {stats.pendingAssignments}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GRADE TRENDS */}
      {activeTab === 'grades' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                <LineChartIcon size={16} className="text-[#B91C1C]" aria-hidden="true" />
                <span>Assessment Score Progression</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Filter released results by subject track or timeframe
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
                <Filter size={12} aria-hidden="true" /> Subject:
              </span>
              {filterSubjectList.map((subj) => (
                <button
                  key={subj}
                  type="button"
                  onClick={() => setSelectedSubject(subj)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    selectedSubject === subj
                      ? 'bg-[#1E293B] dark:bg-[#B91C1C] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#1E293B] dark:hover:text-white'
                  }`}
                >
                  {subj === 'ALL' ? 'All Subjects' : subj}
                </button>
              ))}

              <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                {(['30days', 'term', 'all'] as const).map((rng) => (
                  <button
                    key={rng}
                    type="button"
                    onClick={() => setTimeRange(rng)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      timeRange === rng
                        ? 'bg-[#1E293B] dark:bg-[#B91C1C] text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-[#1E293B] dark:hover:text-white'
                    }`}
                  >
                    {rng === '30days' ? '30D' : rng === 'term' ? 'Term' : 'All'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredGradeTrends.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
              <Award size={24} className="text-slate-400 mb-2" aria-hidden="true" />
              <p className="text-xs font-bold text-[#1E293B] dark:text-white">
                No released scores match this filter
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Only released assessment scores appear in this history.
              </p>
            </div>
          ) : (
            <>
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={filteredGradeTrends}
                    margin={{ top: 10, right: 16, left: -18, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="jdiStudentGradeDetailGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND_CRIMSON} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={BRAND_CRIMSON} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(148, 163, 184, 0.2)"
                    />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(148, 163, 184, 0.25)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: BRAND_SLATE, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="grade"
                      name="Score %"
                      stroke={BRAND_CRIMSON}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#jdiStudentGradeDetailGrad)"
                      dot={{ r: 4, fill: BRAND_CRIMSON, stroke: '#fff', strokeWidth: 1.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Released Assessment Log ({filteredGradeTrends.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="pb-2 font-semibold">Date</th>
                        <th className="pb-2 font-semibold">Assessment Title</th>
                        <th className="pb-2 font-semibold">Subject</th>
                        <th className="pb-2 font-semibold text-right">Raw Score</th>
                        <th className="pb-2 font-semibold text-right">Percentage · Standing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredGradeTrends.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap pr-3">
                            {row.dateLabel}
                          </td>
                          <td className="py-2.5 font-semibold text-[#1E293B] dark:text-white pr-3">
                            {row.assessment}
                          </td>
                          <td className="py-2.5 text-slate-600 dark:text-slate-300 pr-3">
                            {row.subject}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 pr-3">
                            {row.score !== undefined && row.maxScore
                              ? `${row.score}/${row.maxScore}`
                              : '—'}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-[#B91C1C]">{row.grade}%</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-600 dark:text-slate-300 font-sans font-semibold">
                              {row.tierLabel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default StudentAnalyticsVisualizer;
