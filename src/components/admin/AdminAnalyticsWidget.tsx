import React, { useState, useMemo } from 'react';
import { 
  Users, BookOpen, Activity, 
  Award, 
  BarChart3, RefreshCw, CheckCircle2
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

interface AdminAnalyticsWidgetProps {
  studentsData?: any[];
  usersData?: any[];
  activityLogsData?: any[];
  resourcesData?: any[];
  examsData?: any[];
  onRefresh?: () => void;
  isLoading?: boolean;
  allowLoginActivityTab?: boolean;
  widgetTitle?: string;
}

const BRAND_PALETTE = {
  red: '#0284c7',
  slate: '#0f172a',
  blue: '#2563eb',
  emerald: '#10b981',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  cyan: '#06b6d4'
};

const PIE_COLORS = [
  '#0284c7', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'
];

export const AdminAnalyticsWidget: React.FC<AdminAnalyticsWidgetProps> = ({
  studentsData = [],
  usersData = [],
  activityLogsData = [],
  resourcesData = [],
  examsData = [],
  onRefresh,
  isLoading = false,
  allowLoginActivityTab = true,
  widgetTitle = 'Super Admin Telemetry & Analytics Matrix',
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [activeTab, setActiveTab] = useState<'growth' | 'logins' | 'resources' | 'cbt'>('growth');

  const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return !Number.isNaN(d.getTime()) ? d : null;
    }
    return null;
  };

  const studentGrowthData = useMemo(() => {
    const now = new Date();
    const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - rangeDays + 1);
    if (studentsData.length === 0) return [];

    const bucketCount = timeRange === '7d' ? 7 : timeRange === '30d' ? 6 : timeRange === '90d' ? 8 : 12;
    const bucketMs = rangeDays * 86400000 / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      start: new Date(startDate.getTime() + index * bucketMs),
      individual: 0,
      schoolCohort: 0,
      newSignups: 0
    }));

    studentsData.forEach(student => {
      const created = toDate(student.createdAt || student.enrolledAt || student.registrationDate);
      if (!created || created < startDate || created > now) return;
      const index = Math.min(bucketCount - 1, Math.floor((created.getTime() - startDate.getTime()) / bucketMs));
      buckets[index].newSignups += 1;
      if (student.schoolId) buckets[index].schoolCohort += 1;
      else buckets[index].individual += 1;
    });

    let cumulative = 0;
    return buckets.map(bucket => {
      cumulative += bucket.newSignups;
      return {
        name: bucket.start.toLocaleDateString(undefined, { month: 'short', day: timeRange === '1y' ? undefined : 'numeric' }),
        individual: bucket.individual,
        schoolCohort: bucket.schoolCohort,
        total: cumulative,
        newSignups: bucket.newSignups
      };
    });
  }, [studentsData, timeRange]);

  const loginFrequencyData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const loginsByDay: Record<string, { student: number; staff: number; parent: number; school: number }> = Object.fromEntries(
      days.map(day => [day, { student: 0, staff: 0, parent: 0, school: 0 }])
    );

    activityLogsData.forEach(log => {
      const type = String(log.type || '').toLowerCase();
      if (!type.includes('login')) return;
      const date = toDate(log.timestamp || log.createdAt);
      if (!date) return;
      const dayName = days[(date.getDay() + 6) % 7];
      const role = String(log.userType || log.role || 'student').toLowerCase();
      if (role.includes('staff') || role.includes('tutor') || role.includes('instructor')) loginsByDay[dayName].staff += 1;
      else if (role.includes('parent')) loginsByDay[dayName].parent += 1;
      else if (role.includes('school')) loginsByDay[dayName].school += 1;
      else loginsByDay[dayName].student += 1;
    });

    return days.map(day => ({
      day,
      ...loginsByDay[day],
      totalLogins: Object.values(loginsByDay[day]).reduce((sum, value) => sum + value, 0)
    }));
  }, [activityLogsData]);

  const resourceEngagementData = useMemo(() => {
    const counts = new Map<string, number>();
    resourcesData.forEach(resource => {
      const category = String(resource.category || resource.subject || resource.track || 'Uncategorized').trim() || 'Uncategorized';
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, resources]) => ({ category, resources }));
  }, [resourcesData]);

  const categoryDistributionData = useMemo(() => {
    return resourceEngagementData.map(item => ({ name: item.category, value: item.resources }));
  }, [resourceEngagementData]);

  const cbtAssessmentData = useMemo(() => {
    const grouped = new Map<string, { grade: string; registered: number; taken: number; passed: number; scoreTotal: number; scoredCount: number }>();
    examsData.forEach(exam => {
      const grade = String(exam.grade || exam.class || exam.targetClass || 'Unclassified');
      const existing = grouped.get(grade) || { grade, registered: 0, taken: 0, passed: 0, scoreTotal: 0, scoredCount: 0 };
      const registered = Number(exam.registered ?? exam.registeredCount ?? 0);
      const taken = Number(exam.taken ?? exam.completed ?? exam.completedCount ?? 0);
      const passed = Number(exam.passed ?? exam.passedCount ?? 0);
      const avgScore = Number(exam.avgScore ?? exam.averageScore);
      if (Number.isFinite(registered)) existing.registered += registered;
      if (Number.isFinite(taken)) existing.taken += taken;
      if (Number.isFinite(passed)) existing.passed += passed;
      if (Number.isFinite(avgScore)) {
        existing.scoreTotal += avgScore;
        existing.scoredCount += 1;
      }
      grouped.set(grade, existing);
    });
    return Array.from(grouped.values()).map(item => ({
      grade: item.grade,
      registered: item.registered,
      taken: item.taken,
      passed: item.passed,
      avgScore: item.scoredCount ? Math.round(item.scoreTotal / item.scoredCount) : 0
    }));
  }, [examsData]);

  const totalCadets = studentsData.length;
  const totalActiveUsers = usersData.length;
  const totalResCount = resourcesData.length;
  const totalExamsCount = examsData.length;
  const totalLogins = loginFrequencyData.reduce((sum, day) => sum + day.totalLogins, 0);
  const totalRegistered = cbtAssessmentData.reduce((sum, item) => sum + item.registered, 0);
  const totalPassed = cbtAssessmentData.reduce((sum, item) => sum + item.passed, 0);
  const overallPassRate = totalRegistered > 0 ? Math.round((totalPassed / totalRegistered) * 100) : null;
  const scoredExams = cbtAssessmentData.filter(item => item.avgScore > 0);
  const overallAvgScore = scoredExams.length > 0
    ? Math.round(scoredExams.reduce((sum, item) => sum + item.avgScore, 0) / scoredExams.length)
    : null;

  return (
    <div className="pro-surface rounded-3xl overflow-hidden transition-colors">
      <div className="p-6 md:p-8 border-b border-slate-200/70 dark:border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20" aria-hidden="true">
              <BarChart3 size={20} />
            </span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {widgetTitle}
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {allowLoginActivityTab
              ? 'Dashboard snapshot of student enrolment activity, portal login records, resource inventory, and assessment performance.'
              : 'Academic snapshot of student enrolment growth, curriculum resource inventory, and CBT assessment performance.'}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center bg-slate-200/50 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-300/40 dark:border-white/10" role="group" aria-label="Analytics time range">
            {(['7d', '30d', '90d', '1y'] as const).map(range => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                aria-pressed={timeRange === range}
                className={`min-h-10 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  timeRange === range
                    ? 'bg-white dark:bg-sky-600 text-sky-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : '1 Year'}
              </button>
            ))}
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="min-h-10 min-w-10 p-2 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh Firestore Metrics"
              aria-label={isLoading ? 'Refreshing Firestore metrics' : 'Refresh Firestore metrics'}
              aria-busy={isLoading}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 ${allowLoginActivityTab ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'} gap-4 p-6 md:px-8 border-b border-slate-200/60 dark:border-white/10 bg-slate-50/40 dark:bg-black/20`}>
        <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/60 border border-slate-200/80 dark:border-white/10 shadow-2xs backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold">Student Records</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">Current</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalCadets} <span className="text-xs font-medium text-slate-400">Cadets</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Persisted student records loaded
          </div>
        </div>

        {allowLoginActivityTab && (
          <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/60 border border-slate-200/80 dark:border-white/10 shadow-2xs backdrop-blur-md">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-semibold">Recorded Login Activity</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">From logs</span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {totalLogins} <span className="text-xs font-medium text-slate-400">Sessions</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {totalActiveUsers} user accounts active
            </div>
          </div>
        )}

        <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/60 border border-slate-200/80 dark:border-white/10 shadow-2xs backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold">Published Resources</span>
            <span className="text-sky-600 dark:text-sky-400 font-bold">Current</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalResCount} <span className="text-xs font-medium text-slate-400">Guides</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Curriculum guides &amp; lab files
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/60 border border-slate-200/80 dark:border-white/10 shadow-2xs backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold">CBT Exam Results</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              <CheckCircle2 size={13} className="mr-0.5 inline" aria-hidden="true" /> {overallPassRate === null ? 'No scored data' : `${overallPassRate}%`}
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalExamsCount} <span className="text-xs font-medium text-slate-400">Exams</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Average score: {overallAvgScore === null ? '—' : `${overallAvgScore}%`}
          </div>
        </div>
      </div>

      <div className="px-6 md:px-8 pt-4 border-b border-slate-200/60 dark:border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Admin analytics views">
        {[
          { key: 'growth', label: 'Student Growth Trend', icon: Users, visible: true },
          { key: 'logins', label: 'Portal Login Frequency', icon: Activity, visible: allowLoginActivityTab },
          { key: 'resources', label: 'Published Resource Inventory', icon: BookOpen, visible: true },
          { key: 'cbt', label: 'CBT Assessment Performance', icon: Award, visible: true },
        ].filter(t => t.visible).map(tab => {
          const Icon = tab.icon;
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.key as any)}
              className={`min-h-11 pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                selected
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-6 md:p-8">
        {activeTab === 'growth' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Student Registration Trend</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">New student records grouped by the selected period. No synthetic values are generated.</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold flex-wrap" aria-label="Growth chart legend">
                <span className="flex items-center gap-1.5 text-brand-red"><span className="w-3 h-3 rounded-full bg-brand-red inline-block" aria-hidden="true" /> Total Cadets</span>
                <span className="flex items-center gap-1.5 text-blue-500"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" aria-hidden="true" /> School-linked registrations</span>
              </div>
            </div>

            {studentGrowthData.length === 0 ? (
              <div className="h-[340px] flex items-center justify-center text-center text-sm text-gray-500 border border-dashed border-gray-200 dark:border-white/10 rounded-2xl px-6">
                No dated student registration records are available for the selected period.
              </div>
            ) : (
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={studentGrowthData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="totalGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND_PALETTE.red} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={BRAND_PALETTE.red} stopOpacity={0.0}/>
                      </linearGradient>
                      <linearGradient id="schoolCohortGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND_PALETTE.blue} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={BRAND_PALETTE.blue} stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: 'none', color: '#fff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.3)' }} />
                    <Area type="monotone" dataKey="total" name="Cumulative registrations" stroke={BRAND_PALETTE.red} strokeWidth={3} fillOpacity={1} fill="url(#totalGrowthGrad)" />
                    <Area type="monotone" dataKey="schoolCohort" name="School-linked registrations" stroke={BRAND_PALETTE.blue} strokeWidth={2} fillOpacity={1} fill="url(#schoolCohortGrad)" />
                    <Line type="monotone" dataKey="newSignups" name="New registrations" stroke={BRAND_PALETTE.emerald} strokeWidth={2} dot={{ r: 4, fill: BRAND_PALETTE.emerald }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logins' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Recorded Portal Login Activity by User Role</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Only login events recorded in the activity log are included.</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold flex-wrap" aria-label="Login chart legend">
                <span className="flex items-center gap-1 text-brand-red"><span className="w-2.5 h-2.5 rounded-sm bg-brand-red inline-block" aria-hidden="true" /> Students</span>
                <span className="flex items-center gap-1 text-blue-500"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" aria-hidden="true" /> Faculty</span>
                <span className="flex items-center gap-1 text-emerald-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" aria-hidden="true" /> Parents</span>
                <span className="flex items-center gap-1 text-amber-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" aria-hidden="true" /> Schools</span>
              </div>
            </div>

            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={loginFrequencyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: 'none', color: '#fff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.3)' }} />
                  <Bar dataKey="student" name="Students" stackId="a" fill={BRAND_PALETTE.red} />
                  <Bar dataKey="staff" name="Faculty/Tutors" stackId="a" fill={BRAND_PALETTE.blue} />
                  <Bar dataKey="parent" name="Parents" stackId="a" fill={BRAND_PALETTE.emerald} />
                  <Bar dataKey="school" name="School Admins" stackId="a" fill={BRAND_PALETTE.amber} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Published Resources by Subject / Track</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Inventory derived from persisted resource records currently available to the administrator.</p>
              </div>

              {resourceEngagementData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-center text-sm text-gray-500 border border-dashed border-gray-200 dark:border-white/10 rounded-2xl px-6">
                  No published resource records are available to classify yet.
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resourceEngagementData} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="#94a3b8" width={120} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: 'none', color: '#fff' }} />
                      <Bar dataKey="resources" name="Published resources" fill={BRAND_PALETTE.slate} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Subject Domain Share</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Distribution of published resources by persisted subject or category.</p>
              </div>

              {categoryDistributionData.length === 0 ? (
                <div className="h-[240px] flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-200 dark:border-white/10 rounded-2xl px-6 text-center">No categorized resources available.</div>
              ) : (
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryDistributionData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                        {categoryDistributionData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px]" aria-label="Resource subject legend">
                {categoryDistributionData.map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} aria-hidden="true" />
                    <span className="truncate text-gray-600 dark:text-slate-300">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cbt' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">CBT Assessment Completion &amp; Average Grade by Cohort</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Participation rate, pass ratio, and scoring averages across Primary and Secondary tiers.</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold flex-wrap" aria-label="CBT chart legend">
                <span className="flex items-center gap-1 text-slate-800 dark:text-slate-200"><span className="w-2.5 h-2.5 rounded-sm bg-slate-800 dark:bg-slate-200 inline-block" aria-hidden="true" /> Registered</span>
                <span className="flex items-center gap-1 text-emerald-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" aria-hidden="true" /> Passed</span>
                <span className="flex items-center gap-1 text-amber-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" aria-hidden="true" /> Avg Score %</span>
              </div>
            </div>

            {cbtAssessmentData.length === 0 ? (
              <div className="h-[340px] flex items-center justify-center text-center text-sm text-gray-500 border border-dashed border-gray-200 dark:border-white/10 rounded-2xl px-6">
                No persisted cohort-level assessment result data is available yet.
              </div>
            ) : (
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cbtAssessmentData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />
                    <XAxis dataKey="grade" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: 'none', color: '#fff' }} />
                    <Bar dataKey="registered" name="Registered" fill={BRAND_PALETTE.slate} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="taken" name="Completed" fill={BRAND_PALETTE.blue} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="passed" name="Passed" fill={BRAND_PALETTE.emerald} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAnalyticsWidget;
