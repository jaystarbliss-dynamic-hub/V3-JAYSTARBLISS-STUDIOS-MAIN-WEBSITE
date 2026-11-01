import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileBarChart2,
  GraduationCap,
  Layers,
  Loader2,
  RefreshCw,
  Save,
  School,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { academicApiWithFallback as api } from '../../lib/academicFallback';
import {
  type LinkedLearnerProfile,
  type UnifiedAssessmentQuizRecord,
  type UnifiedAssessmentLifecycleStatus,
  fetchAssessmentsAndQuizzesForLearner,
  fetchAssessmentsAndQuizzesForParent,
  resolveParentLinkedChildren,
  resolveStudentLearnerProfile,
} from '../../lib/academicSyncEngine';
import SEO from '../../components/ui/SEO';
import { ExamListSkeleton } from '../../components/ui/Skeleton';
import { getFriendlyErrorMessage, logInternalDiagnostic } from '../../utils/friendlyErrors';

export type AssessmentCenterRole = 'student' | 'parent' | 'staff' | 'school';

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined,
  }).format(d);
};

const lifecycleBadge = (
  status: UnifiedAssessmentLifecycleStatus
): { label: string; className: string; dotClass: string } => {
  switch (status) {
    case 'UPCOMING':
      return {
        label: 'Upcoming',
        className:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
        dotClass: 'bg-amber-500',
      };
    case 'ONGOING':
      return {
        label: 'Ongoing / Active',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
        dotClass: 'bg-blue-500',
      };
    case 'AWAITING_GRADING':
      return {
        label: 'Submitted • Awaiting Grading',
        className:
          'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60',
        dotClass: 'bg-purple-500',
      };
    case 'GRADED':
      return {
        label: 'Graded & Released',
        className:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
        dotClass: 'bg-emerald-500',
      };
    case 'COMPLETED':
    default:
      return {
        label: 'Completed',
        className:
          'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        dotClass: 'bg-slate-500',
      };
  }
};

const submissionBadge = (statusLabel?: string): string => {
  return statusLabel || 'Not Yet Submitted';
};

const workTypeBadge = (wt: string): string => {
  const clean = String(wt || '').toUpperCase();
  if (clean === 'QUIZ') return 'Quiz';
  if (clean === 'TEST') return 'Class Test';
  if (clean === 'EXAMINATION' || clean === 'EXAM') return 'Examination';
  if (clean === 'ASSIGNMENT') return 'Assignment';
  if (clean === 'ACTIVITY') return 'Learning Activity';
  return clean || 'Assessment';
};

const AssessmentCenter: React.FC<{ role: AssessmentCenterRole }> = ({ role }) => {
  const navigate = useNavigate();

  const [records, setRecords] = useState<UnifiedAssessmentQuizRecord[]>([]);
  const [linkedChildren, setLinkedChildren] = useState<LinkedLearnerProfile[]>([]);
  const [staffStudents, setStaffStudents] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('all');
  const [lifecycleFilter, setLifecycleFilter] = useState<
    'ALL' | UnifiedAssessmentLifecycleStatus
  >('ALL');
  const [workTypeFilter, setWorkTypeFilter] = useState<'ALL' | 'QUIZ_TEST' | 'EXAMINATION'>('ALL');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Staff manual quick-assessment record form (preserves legacy quick-score recording when used by staff)
  const [selectedStaffStudentId, setSelectedStaffStudentId] = useState('');
  const [form, setForm] = useState({
    title: '',
    subject: 'Computer Technology',
    assessmentType: 'QUIZ',
    score: '',
    feedback: '',
  });

  const loadAssessments = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      try {
        if (role === 'parent') {
          const children = await resolveParentLinkedChildren();
          const parentRecords = await fetchAssessmentsAndQuizzesForParent(children);
          setLinkedChildren(children);
          setRecords(parentRecords);
        } else if (role === 'student') {
          const profile = await resolveStudentLearnerProfile();
          if (profile) {
            const list = await fetchAssessmentsAndQuizzesForLearner(profile);
            setRecords(list);
          } else {
            const d = await api('/api/academic-students').catch(() => ({ students: [] }));
            const first = d.students?.[0];
            if (first?.id) {
              const r = await api(
                `/api/academic-assessments?studentId=${encodeURIComponent(first.id)}`
              ).catch(() => ({ records: [] }));
              setRecords(
                (r.records || []).map((rec: any) => ({
                  id: rec.id,
                  examId: rec.id,
                  title: rec.title || 'Assessment',
                  description: '',
                  subject: rec.subject || 'General',
                  programName: rec.subject || 'General',
                  workType: (rec.assessmentType || 'QUIZ') as any,
                  workTypeLabel: rec.assessmentType || 'Quiz',
                  deliveryMode: 'NATIVE' as const,
                  tutorName: rec.tutorName || 'Assigned Tutor',
                  studentId: first.id,
                  studentName: first.fullName || 'Learner',
                  className: first.class || 'Grade 1',
                  schoolId: first.schoolId || '',
                  schoolName: first.schoolName || '',
                  isSchoolStudent: Boolean(first.schoolId),
                  assignedDate: rec.createdAt || null,
                  availableFrom: rec.createdAt || null,
                  availableUntil: null,
                  dueDate: null,
                  submittedAt: rec.updatedAt || null,
                  releasedAt: typeof rec.score === 'number' ? rec.updatedAt || null : null,
                  durationMinutes: null,
                  lifecycleStatus: typeof rec.score === 'number' ? 'GRADED' : 'COMPLETED',
                  submissionStatusLabel:
                    typeof rec.score === 'number' ? 'Graded & Verified' : 'Submitted by Learner',
                  score: typeof rec.score === 'number' ? rec.score : null,
                  maxScore: 100,
                  percentage: typeof rec.score === 'number' ? rec.score : null,
                  gradeLetter: '—',
                  resultReleased: true,
                  isUngradedActivity: false,
                  feedback: rec.feedback || '',
                  questionCount: 0,
                  source: 'academic_assessments' as const,
                }))
              );
            }
          }
        } else {
          // Staff / School role
          const d = await api('/api/academic-students').catch(() => ({ students: [] }));
          const list = d.students || [];
          setStaffStudents(list);
          const targetId = selectedStaffStudentId || list[0]?.id || '';
          if (targetId && !selectedStaffStudentId) {
            setSelectedStaffStudentId(targetId);
          }
          if (targetId) {
            const studentObj = list.find((s: any) => s.id === targetId);
            const syntheticProfile: LinkedLearnerProfile = {
              id: targetId,
              studentUid: studentObj?.firebaseUid || studentObj?.uid || '',
              allIds: [targetId, studentObj?.firebaseUid, studentObj?.uid].filter(Boolean),
              fullName: studentObj?.fullName || 'Learner',
              className: studentObj?.class || studentObj?.grade || 'Grade 1',
              schoolId: studentObj?.schoolId || '',
              schoolAliases: [studentObj?.schoolId, studentObj?.schoolName].filter(Boolean),
              schoolName: studentObj?.schoolName || '',
              programName: studentObj?.plan || studentObj?.track || '',
              isSchoolStudent: Boolean(studentObj?.schoolId),
              source: 'individualStudents',
            };
            const synced = await fetchAssessmentsAndQuizzesForLearner(syntheticProfile);
            setRecords(synced);
          }
        }
      } catch (e) {
        logInternalDiagnostic('AssessmentCenter::Load', e);
        setError(getFriendlyErrorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [role, selectedStaffStudentId]
  );

  useEffect(() => {
    void loadAssessments();
  }, [loadAssessments]);

  const handleSaveManualAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffStudentId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api('/api/academic-assessments', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStaffStudentId,
          ...form,
          score: form.score,
        }),
      });
      setForm({
        title: '',
        subject: 'Computer Technology',
        assessmentType: 'QUIZ',
        score: '',
        feedback: '',
      });
      setSuccess('Assessment record saved and synced.');
      await loadAssessments(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save assessment.');
    } finally {
      setSaving(false);
    }
  };

  // Filtered records
  const visibleRecords = useMemo(() => {
    return records.filter((rec) => {
      if (role === 'parent' && selectedChildId !== 'all') {
        const child = linkedChildren.find((c) => c.id === selectedChildId);
        const childIds = child ? new Set(child.allIds) : new Set([selectedChildId]);
        if (!childIds.has(rec.studentId)) return false;
      }
      if (lifecycleFilter !== 'ALL' && rec.lifecycleStatus !== lifecycleFilter) {
        return false;
      }
      if (workTypeFilter === 'QUIZ_TEST') {
        return ['QUIZ', 'TEST', 'ACTIVITY'].includes(rec.workType);
      }
      if (workTypeFilter === 'EXAMINATION') {
        return ['EXAMINATION', 'EXAM'].includes(rec.workType);
      }
      return true;
    });
  }, [records, role, selectedChildId, linkedChildren, lifecycleFilter, workTypeFilter]);

  // Summary metrics
  const metrics = useMemo(() => {
    const total = visibleRecords.length;
    const upcomingOrOngoing = visibleRecords.filter(
      (r) => r.lifecycleStatus === 'UPCOMING' || r.lifecycleStatus === 'ONGOING'
    ).length;
    const awaitingGrading = visibleRecords.filter(
      (r) => r.lifecycleStatus === 'AWAITING_GRADING'
    ).length;
    const graded = visibleRecords.filter((r) => r.lifecycleStatus === 'GRADED').length;

    const scored = visibleRecords.filter(
      (r) => r.resultReleased && typeof r.percentage === 'number'
    );
    const averagePercentage = scored.length
      ? Math.round(scored.reduce((sum, r) => sum + Number(r.percentage), 0) / scored.length)
      : null;

    return { total, upcomingOrOngoing, awaitingGrading, graded, averagePercentage };
  }, [visibleRecords]);

  const bannerTitle =
    role === 'staff'
      ? 'Assessment Workspace'
      : role === 'student'
      ? 'My Assessments & Quizzes'
      : role === 'parent'
      ? 'Assessments & Quizzes'
      : 'School Assessments';

  const bannerSubtitle =
    role === 'parent'
      ? "Track your child's upcoming, ongoing, submitted, and graded quizzes, tests, and examinations in one unified view."
      : role === 'student'
      ? 'View your scheduled quizzes, active assessments, submitted attempts, and graded results.'
      : 'Manage and monitor learner assessments, quizzes, and academic performance.';

  return (
    <div className="dashboard-interface space-y-6">
      <SEO title={`${bannerTitle} | Jaystarbliss Studios`} description={bannerSubtitle} noindex />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-red/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-red">
            <ClipboardCheck size={12} /> Unified Assessment Feed
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1.5">
            {bannerTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {bannerSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadAssessments(true)}
            disabled={loading || refreshing}
            className="min-h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          {role === 'parent' && (
            <button
              type="button"
              onClick={() => navigate('/portal/parent/examinations')}
              className="min-h-10 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <FileBarChart2 size={15} /> Official Assessment Results & PDF Reports
            </button>
          )}

          {role === 'student' && (
            <button
              type="button"
              onClick={() => navigate('/portal/student/examinations')}
              className="min-h-10 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <BookOpenCheck size={15} /> Open Interactive Exam Portal
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-200 flex items-center gap-2">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
          <button className="ml-auto" onClick={() => setError('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{success}</span>
          <button className="ml-auto" onClick={() => setSuccess('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 4-Card KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<ClipboardCheck size={20} />}
          label="Total Assessments & Quizzes"
          value={String(metrics.total)}
          accent="text-brand-red bg-brand-red/10"
        />
        <MetricCard
          icon={<CalendarClock size={20} />}
          label="Upcoming & Ongoing"
          value={String(metrics.upcomingOrOngoing)}
          accent="text-blue-600 bg-blue-500/10"
        />
        <MetricCard
          icon={<Clock size={20} />}
          label="Submitted (Awaiting Grading)"
          value={String(metrics.awaitingGrading)}
          accent="text-purple-600 bg-purple-500/10"
        />
        <MetricCard
          icon={<Award size={20} />}
          label="Average Released Score"
          value={metrics.averagePercentage === null ? `${metrics.graded} Graded` : `${metrics.averagePercentage}%`}
          accent="text-emerald-600 bg-emerald-500/10"
        />
      </div>

      {/* Filters Section */}
      <div className="pro-surface rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {role === 'parent' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                Filter by Linked Child
              </label>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium"
              >
                <option value="all">All Linked Children ({linkedChildren.length})</option>
                {linkedChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.fullName} • {child.className}
                    {child.schoolName ? ` (${child.schoolName})` : ' (Private Track)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(role === 'staff' || role === 'school') && (
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                Select Learner Record
              </label>
              <select
                value={selectedStaffStudentId}
                onChange={(e) => setSelectedStaffStudentId(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium"
              >
                {staffStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} {s.class ? `• ${s.class}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              Assessment Status
            </label>
            <select
              value={lifecycleFilter}
              onChange={(e) => setLifecycleFilter(e.target.value as any)}
              className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="ONGOING">Ongoing / Active</option>
              <option value="AWAITING_GRADING">Submitted • Awaiting Grading</option>
              <option value="GRADED">Graded & Released</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              Assessment Category
            </label>
            <select
              value={workTypeFilter}
              onChange={(e) => setWorkTypeFilter(e.target.value as any)}
              className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium"
            >
              <option value="ALL">All Assessments & Quizzes</option>
              <option value="QUIZ_TEST">Quizzes & Class Tests</option>
              <option value="EXAMINATION">Term Examinations</option>
            </select>
          </div>
        </div>

        {/* Status Quick-Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: 'ONGOING', label: 'Ongoing' },
              { id: 'UPCOMING', label: 'Upcoming' },
              { id: 'AWAITING_GRADING', label: 'Submitted (Awaiting Grading)' },
              { id: 'GRADED', label: 'Graded' },
              { id: 'COMPLETED', label: 'Completed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLifecycleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                lifecycleFilter === tab.id
                  ? 'bg-brand-red text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {role === 'staff' && (
          <form
            onSubmit={handleSaveManualAssessment}
            className="pro-surface rounded-3xl p-6 space-y-4 lg:col-span-1 self-start"
          >
            <h2 className="font-black text-lg text-slate-900 dark:text-white">
              Record Quick Assessment Score
            </h2>
            <p className="text-xs text-slate-500">
              Log an offline or classroom quiz/practical score directly to the learner's profile.
            </p>
            <input
              required
              className="input"
              placeholder="Assessment title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <input
              className="input"
              placeholder="Subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
            <select
              className="input"
              value={form.assessmentType}
              onChange={(e) => setForm({ ...form, assessmentType: e.target.value })}
            >
              <option value="QUIZ">Quiz</option>
              <option value="TEST">Class Test</option>
              <option value="EXAM">Examination</option>
              <option value="PRACTICAL">Practical Evaluation</option>
              <option value="PROJECT">Project Defense</option>
            </select>
            <input
              required
              type="number"
              min="0"
              max="100"
              className="input"
              placeholder="Score / 100"
              value={form.score}
              onChange={(e) => setForm({ ...form, score: e.target.value })}
            />
            <textarea
              className="input"
              rows={4}
              placeholder="Tutor feedback & remarks for the learner and parent"
              value={form.feedback}
              onChange={(e) => setForm({ ...form, feedback: e.target.value })}
            />
            <button
              disabled={saving || !selectedStaffStudentId}
              className="btn-primary w-full justify-center"
            >
              <Save size={16} />
              {saving ? 'Saving…' : 'Save Assessment Score'}
            </button>
          </form>
        )}

        <section
          className={`pro-surface rounded-3xl p-5 md:p-7 ${
            role === 'staff' ? 'lg:col-span-2' : 'lg:col-span-3'
          }`}
        >
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-black text-lg sm:text-xl text-slate-900 dark:text-white">
                Synchronized Assessments & Quizzes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {visibleRecords.length} assessment record{visibleRecords.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {loading ? (
            <ExamListSkeleton count={3} />
          ) : visibleRecords.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl px-4">
              <ClipboardCheck className="mx-auto text-slate-300 mb-3" size={38} />
              <p className="font-bold text-slate-900 dark:text-white">
                {role === 'parent' && linkedChildren.length === 0
                  ? 'No linked learner profiles found'
                  : 'No assessments or quizzes match the current filter'}
              </p>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                {role === 'parent'
                  ? "Scheduled quizzes, ongoing tests, submitted attempts, and graded results for your linked child(ren) will automatically appear here."
                  : 'Scheduled and completed assessments will appear here as soon as they are published by your tutor.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleRecords.map((rec) => {
                const badge = lifecycleBadge(rec.lifecycleStatus);
                return (
                  <article
                    key={rec.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/40 p-5 sm:p-6 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${badge.className}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                            {badge.label}
                          </span>

                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {workTypeBadge(rec.workType)}
                          </span>

                          {rec.subject && (
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                              {rec.subject}
                            </span>
                          )}

                          {rec.programName && (
                            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                              {rec.programName}
                            </span>
                          )}

                          {rec.schoolName && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                              <School size={11} /> {rec.schoolName}
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                          {rec.title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          {rec.studentName && (
                            <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                              <UserRound size={13} className="text-brand-red" />
                              {rec.studentName}
                              {rec.className ? ` • ${rec.className}` : ''}
                            </span>
                          )}

                          <span>
                            <strong>Tutor:</strong> {rec.tutorName || 'Assigned Tutor'}
                          </span>

                          <span>
                            <strong>Completion Status:</strong> {submissionBadge(rec.submissionStatusLabel)}
                          </span>
                        </div>

                        {/* Dates Row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                          {rec.assignedDate && (
                            <span>
                              <strong>Published:</strong> {formatDate(rec.assignedDate)}
                            </span>
                          )}
                          {(rec.dueDate || rec.availableUntil) && (
                            <span>
                              <strong>Deadline / Window:</strong>{' '}
                              {formatDate(rec.dueDate || rec.availableUntil)}
                            </span>
                          )}
                          {rec.submittedAt && (
                            <span>
                              <strong>Submitted:</strong> {formatDate(rec.submittedAt)}
                            </span>
                          )}
                          {rec.releasedAt && (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              <strong>Graded:</strong> {formatDate(rec.releasedAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Score / Action Column */}
                      <div className="flex items-center gap-3 shrink-0">
                        {rec.resultReleased && typeof rec.score === 'number' ? (
                          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-2.5 text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                              Released Score
                            </p>
                            <p className="text-xl font-black text-slate-900 dark:text-white">
                              {rec.score}
                              {rec.maxScore > 0 ? (
                                <span className="text-xs font-semibold text-slate-500">
                                  /{rec.maxScore}
                                </span>
                              ) : null}
                            </p>
                            {typeof rec.percentage === 'number' && (
                              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                {rec.percentage}% Grade
                              </p>
                            )}
                          </div>
                        ) : rec.lifecycleStatus === 'AWAITING_GRADING' ? (
                          <div className="rounded-2xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/60 dark:bg-purple-950/30 px-4 py-2.5 text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                              Grading Status
                            </p>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                              Awaiting Tutor Verification
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {rec.description && (
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
                        {rec.description}
                      </p>
                    )}

                    {rec.feedback && (
                      <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">
                          Tutor Feedback & Remarks
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                          {rec.feedback}
                        </p>
                      </div>
                    )}

                    {role === 'parent' && rec.resultReleased && rec.attemptId && (
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                        <button
                          type="button"
                          onClick={() => navigate('/portal/parent/examinations')}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline cursor-pointer"
                        >
                          <FileBarChart2 size={14} /> View Official Result & Download PDF Report
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div className="pro-surface rounded-2xl p-4 sm:p-5 flex items-center gap-3.5">
    <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${accent}`}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  </div>
);

export default AssessmentCenter;
