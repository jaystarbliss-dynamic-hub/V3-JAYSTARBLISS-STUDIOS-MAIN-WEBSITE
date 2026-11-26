import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  PlusCircle,
  Users,
  School,
  User,
  Activity,
  Edit3,
  Copy,
  Trash2,
  Eye,
  RefreshCw,
  BookOpen,
  Tag,
  Lock,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { resolveCanonicalExamStatus, type AcademicWorkType } from '../../lib/classes';
import {
  FloatingActionMenu,
  RowActionMenuButton,
  type RowActionItem,
  useRowActionMenu,
} from '../ui/RowActionMenu';

export interface AssessmentListItem {
  id: string;
  title: string;
  subject: string;
  workType?: AcademicWorkType;
  deliveryMode: 'NATIVE' | 'EXTERNAL_LINK' | 'CODING_LAB';
  externalUrl?: string;
  status: string; // 'active' | 'draft' | 'scheduled' | 'completed' | 'archived'
  schoolId?: string;
  schoolName?: string;
  targetClass?: string;
  className?: string;
  programTitle?: string;
  programId?: string;
  programPath?: string;
  programBreadcrumbs?: string;
  primaryCategory?: string;
  recipientMode?: 'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET';
  targetSchoolIds?: string[];
  targetStudentIds?: string[];
  questionCount?: number;
  maxScore?: number;
  durationMinutes?: number | null;
  passcode?: string;
  availableFrom?: string | null;
  availableUntil?: string | null;
  dueDate?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

interface AssessmentOverviewProps {
  assessments: AssessmentListItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateAssessment: () => void;
  onEditAssessment: (assessment: AssessmentListItem) => void;
  onMonitorAssessment: (assessment: AssessmentListItem) => void;
  onPreviewAssessment: (assessment: AssessmentListItem) => void;
  onDuplicateAssessment: (assessment: AssessmentListItem) => void;
  onDeleteAssessment: (assessmentId: string) => void;
  onChangeAssessmentStatus?: (assessment: AssessmentListItem, nextStatus: 'active' | 'completed') => Promise<void>;
  canManageAssessment?: (assessment: AssessmentListItem) => boolean;
  isTutor?: boolean;
}

export const AssessmentOverview: React.FC<AssessmentOverviewProps> = ({
  assessments,
  isLoading,
  onRefresh,
  onCreateAssessment,
  onEditAssessment,
  onMonitorAssessment,
  onPreviewAssessment,
  onDuplicateAssessment,
  onDeleteAssessment,
  onChangeAssessmentStatus,
  canManageAssessment,
  isTutor = false,
}) => {
  // 1. Primary Filter Tab: All | School | Private
  const [recipientFilter, setRecipientFilter] = useState<'ALL' | 'SCHOOL' | 'PRIVATE'>('ALL');

  // Secondary Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [workTypeFilter, setWorkTypeFilter] = useState<string>('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [pendingStatusAction, setPendingStatusAction] = useState<{
    assessment: AssessmentListItem;
    nextStatus: 'active' | 'completed';
    mode: 'open' | 'close' | 'reopen';
  } | null>(null);
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Shared floating menu state for both three-dot button clicks and right-click context menu
  const rowContextMenu = useRowActionMenu<AssessmentListItem>();

  const buildRowActions = (exam: AssessmentListItem): RowActionItem[] => {
    const st = resolveCanonicalExamStatus(exam);
    const canManage = canManageAssessment ? canManageAssessment(exam) : true;
    const statusActions: RowActionItem[] = [];
    if (onChangeAssessmentStatus && canManage) {
      if (st === 'active') {
        statusActions.push({
          id: 'close-now',
          label: 'Close Assessment',
          icon: <Lock size={14} />,
          onClick: () =>
            setPendingStatusAction({ assessment: exam, nextStatus: 'completed', mode: 'close' }),
          dividerBefore: true,
        });
      } else if (st === 'completed') {
        statusActions.push({
          id: 'reopen-now',
          label: 'Reopen Assessment',
          icon: <RotateCcw size={14} />,
          onClick: () =>
            setPendingStatusAction({ assessment: exam, nextStatus: 'active', mode: 'reopen' }),
          dividerBefore: true,
        });
      } else if (st === 'scheduled') {
        statusActions.push({
          id: 'activate-now',
          label: 'Activate Assessment',
          icon: <Play size={14} />,
          onClick: () =>
            setPendingStatusAction({ assessment: exam, nextStatus: 'active', mode: 'open' }),
          dividerBefore: true,
        });
      }
    }

    return [
      {
        id: 'edit',
        label: 'Edit Assessment',
        icon: <Edit3 size={14} />,
        onClick: () => onEditAssessment(exam),
        hidden: !canManage,
      },
      {
        id: 'monitor',
        label: 'Monitor Responses',
        icon: <Activity size={14} />,
        onClick: () => onMonitorAssessment(exam),
      },
      {
        id: 'preview',
        label: 'Preview Student View',
        icon: <Eye size={14} />,
        onClick: () => onPreviewAssessment(exam),
      },
      ...statusActions,
      {
        id: 'duplicate',
        label: 'Duplicate Assessment',
        icon: <Copy size={14} />,
        onClick: () => onDuplicateAssessment(exam),
      },
      {
        id: 'delete',
        label: 'Delete Assessment',
        icon: <Trash2 size={14} />,
        onClick: () => onDeleteAssessment(exam.id),
        danger: true,
        confirmDanger: true,
        confirmLabel: 'Delete this assessment?',
        dividerBefore: true,
        hidden: !canManage,
      },
    ];
  };

  // Compute counts for the 3 primary tabs
  const tabCounts = useMemo(() => {
    let all = assessments.length;
    let school = 0;
    let privateLearner = 0;

    assessments.forEach((item) => {
      const mode = item.recipientMode || (item.schoolId === 'private' ? 'PRIVATE_LEARNERS' : 'SCHOOL_CLASS');
      if (mode === 'PRIVATE_LEARNERS' || (Array.isArray(item.targetStudentIds) && item.targetStudentIds.length > 0 && (!item.targetSchoolIds || item.targetSchoolIds.length === 0))) {
        privateLearner += 1;
      } else {
        school += 1;
      }
    });

    return { all, school, private: privateLearner };
  }, [assessments]);

  // Filtered Assessments List
  const filteredAssessments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return assessments.filter((item) => {
      // 1. Primary Tab Filter
      const isPrivate =
        item.recipientMode === 'PRIVATE_LEARNERS' ||
        item.schoolId === 'private' ||
        (Array.isArray(item.targetStudentIds) &&
          item.targetStudentIds.length > 0 &&
          (!item.targetSchoolIds || item.targetSchoolIds.length === 0));

      if (recipientFilter === 'SCHOOL' && isPrivate) return false;
      if (recipientFilter === 'PRIVATE' && !isPrivate) return false;

      // 2. Category Filter
      if (categoryFilter !== 'ALL') {
        const cat = (item.primaryCategory || '').toLowerCase();
        const title = (item.programTitle || '').toLowerCase();
        const path = (item.programPath || item.programBreadcrumbs || '').toLowerCase();
        if (!cat.includes(categoryFilter.toLowerCase()) && !title.includes(categoryFilter.toLowerCase()) && !path.includes(categoryFilter.toLowerCase())) {
          return false;
        }
      }

      // 3. Status Filter
      if (statusFilter !== 'ALL') {
        const normalizedItemStatus = resolveCanonicalExamStatus(item);
        const filterNorm = statusFilter.toLowerCase() === 'closed' ? 'completed' : statusFilter.toLowerCase();
        if (filterNorm !== normalizedItemStatus) return false;
      }

      // 4. Work Type Filter
      if (workTypeFilter !== 'ALL') {
        if (item.workType !== workTypeFilter) return false;
      }

      // 5. Delivery Format Filter
      if (deliveryFilter !== 'ALL') {
        if (item.deliveryMode !== deliveryFilter) return false;
      }

      // 6. Search Query (Title, Subject, School Name, Class, Programme)
      if (q) {
        const matchTitle = (item.title || '').toLowerCase().includes(q);
        const matchSubject = (item.subject || '').toLowerCase().includes(q);
        const matchSchool = (item.schoolName || '').toLowerCase().includes(q);
        const matchClass = (item.targetClass || item.className || '').toLowerCase().includes(q);
        const matchProgram = (item.programTitle || item.programBreadcrumbs || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSubject && !matchSchool && !matchClass && !matchProgram) return false;
      }

      return true;
    });
  }, [assessments, recipientFilter, categoryFilter, statusFilter, workTypeFilter, deliveryFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* 1. TOP HEADER WITH CREATE BUTTON                               */}
      {/* ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Assessment Overview
            </h1>
            <span className="text-xs font-black uppercase tracking-wider text-[#B91C1C] dark:text-red-400 tabular-nums">
              · {assessments.length} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isTutor
              ? 'Manage, monitor, and author assessments for your assigned schools and private learners.'
              : 'Complete repository of school and private assessments across all programmes.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh assessments list"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={onCreateAssessment}
            className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <PlusCircle size={17} />
            <span>Create Assessment</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. RECIPIENT FILTER TABS (All | School | Private)               */}
      {/* ============================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* 3 Main Tabs */}
        <div className="inline-flex items-center p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setRecipientFilter('ALL')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              recipientFilter === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Assessments ({tabCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setRecipientFilter('SCHOOL')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              recipientFilter === 'SCHOOL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <School size={15} /> School Assessments ({tabCounts.school})
          </button>
          <button
            type="button"
            onClick={() => setRecipientFilter('PRIVATE')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              recipientFilter === 'PRIVATE'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User size={15} /> Private Student Assessments ({tabCounts.private})
          </button>
        </div>

        {/* Search bar */}
        <div className="relative w-full md:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, subject, school..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E293B]/20 focus:border-[#1E293B]"
          />
        </div>
      </div>

      {/* Secondary filter chips (Status, Type, Format) */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
          <Filter size={12} /> Filters:
        </span>

        {/* Programme Category Dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-[#1E293B] cursor-pointer"
        >
          <option value="ALL">All Programme Categories</option>
          <option value="technology">Technology</option>
          <option value="design-graphics">Design & Graphics</option>
          <option value="music">Music</option>
          <option value="academics">Academics</option>
        </select>

        {/* Status Dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-[#1E293B] cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="active">Active (Open)</option>
          <option value="draft">Drafts</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Closed / Completed</option>
          <option value="archived">Archived</option>
        </select>

        {/* Work Type Dropdown */}
        <select
          value={workTypeFilter}
          onChange={(e) => setWorkTypeFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-[#1E293B] cursor-pointer"
        >
          <option value="ALL">All Assessment Types</option>
          <option value="ASSIGNMENT">Assignment</option>
          <option value="TEST">Test</option>
          <option value="ACTIVITY">Activity</option>
          <option value="EXAMINATION">Exam</option>
        </select>

        {/* Delivery Format */}
        <select
          value={deliveryFilter}
          onChange={(e) => setDeliveryFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-[#1E293B] cursor-pointer"
        >
          <option value="ALL">All Formats</option>
          <option value="NATIVE">Native Studio</option>
          <option value="EXTERNAL_LINK">External Third-Party Link</option>
        </select>

        {(categoryFilter !== 'ALL' || statusFilter !== 'ALL' || workTypeFilter !== 'ALL' || deliveryFilter !== 'ALL' || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('ALL');
              setStatusFilter('ALL');
              setWorkTypeFilter('ALL');
              setDeliveryFilter('ALL');
              setSearchQuery('');
            }}
            className="text-xs font-bold text-[#B91C1C] dark:text-red-400 hover:underline cursor-pointer ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3. ASSESSMENTS TABLE / LIST PRESENTATION                       */}
      {/* ============================================================== */}
      {isLoading ? (
        <div className="p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] space-y-3">
          <RefreshCw size={24} className="mx-auto text-[#1E293B] dark:text-slate-300 animate-spin" />
          <p className="text-xs font-bold text-slate-500">Loading authorized assessments...</p>
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-slate-200 flex items-center justify-center mx-auto">
            <BookOpen size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">
              No assessments found
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'ALL' || workTypeFilter !== 'ALL'
                ? 'No assessments match your active filter criteria. Try adjusting your filters or search terms.'
                : 'Get started by creating your first assessment for partner schools or private learners.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateAssessment}
            className="px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white font-bold text-xs shadow-xs cursor-pointer inline-flex items-center gap-2"
          >
            <PlusCircle size={15} /> Create Assessment
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#18181B] text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-400">
                  <th className="py-3.5 px-4 sm:px-6">Assessment &amp; Type</th>
                  <th className="py-3.5 px-4">Subject &amp; Target</th>
                  <th className="py-3.5 px-4">Recipients</th>
                  <th className="py-3.5 px-4">Structure</th>
                  <th className="py-3.5 px-4">Status &amp; Availability</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70 text-xs">
                {filteredAssessments.map((exam) => {
                  const isExternal = exam.deliveryMode === 'EXTERNAL_LINK';
                  const wt = exam.workType || 'EXAMINATION';
                  const isPriv =
                    exam.recipientMode === 'PRIVATE_LEARNERS' ||
                    exam.schoolId === 'private' ||
                    (Array.isArray(exam.targetStudentIds) &&
                      exam.targetStudentIds.length > 0 &&
                      (!exam.targetSchoolIds || exam.targetSchoolIds.length === 0));

                  const isMultiTarget =
                    exam.recipientMode === 'MULTI_TARGET' ||
                    ((exam.targetSchoolIds?.length || 0) > 1) ||
                    ((exam.targetSchoolIds?.length || 0) > 0 && (exam.targetStudentIds?.length || 0) > 0);

                  const statusLower = resolveCanonicalExamStatus(exam);

                  return (
                    <tr
                      key={exam.id}
                      onContextMenu={(e) => {
                        rowContextMenu.openFromContextMenu(e, exam);
                      }}
                      {...rowContextMenu.getTouchHandlers(exam)}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors group"
                    >
                      {/* 1. Assessment Title & Format */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="space-y-1 min-w-[180px]">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                            <span className={wt === 'EXAMINATION' ? 'text-[#B91C1C] dark:text-red-400' : 'text-[#1E293B] dark:text-zinc-200'}>
                              {wt}
                            </span>
                            <span className="mx-1.5 text-slate-300 dark:text-zinc-700">·</span>
                            <span>{isExternal ? 'External Link' : 'Native Studio'}</span>
                          </p>
                          <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm group-hover:text-[#B91C1C] dark:group-hover:text-red-400 transition-colors">
                            {exam.title || 'Untitled Assessment'}
                          </p>
                        </div>
                      </td>

                      {/* 2. Subject & Target Class */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <p className="font-bold text-slate-800 dark:text-zinc-200">
                            {exam.subject || 'General Studies'}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                            {(exam as any).gradeRange?.from && (exam as any).gradeRange?.to
                              ? `${(exam as any).gradeRange.from} – ${(exam as any).gradeRange.to}`
                              : exam.targetClass || exam.className || 'All Grades'}
                          </p>
                          {(exam.programTitle || exam.programBreadcrumbs || (Array.isArray((exam as any).targetProgramTitles) && (exam as any).targetProgramTitles.length > 0)) && (
                            <p
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1E293B] dark:text-zinc-300 max-w-[220px] truncate"
                              title={
                                Array.isArray((exam as any).targetProgramTitles) && (exam as any).targetProgramTitles.length > 0
                                  ? (exam as any).targetProgramTitles.join(', ')
                                  : exam.programBreadcrumbs || exam.programTitle
                              }
                            >
                              <Tag size={9} className="shrink-0 text-[#B91C1C] dark:text-red-400" />
                              <span className="truncate">
                                {Array.isArray((exam as any).targetProgramTitles) && (exam as any).targetProgramTitles.length > 1
                                  ? `${(exam as any).targetProgramTitles[0]} +${(exam as any).targetProgramTitles.length - 1} more`
                                  : exam.programBreadcrumbs || exam.programTitle || (exam as any).targetProgramTitles?.[0]}
                              </span>
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 3. Recipients */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          {isMultiTarget ? (
                            <div className="flex items-center gap-1.5 text-[#1E293B] dark:text-zinc-200 font-bold tabular-nums">
                              <Users size={13} className="text-[#B91C1C] dark:text-red-400" />
                              <span>Multi-Target ({exam.targetSchoolIds?.length || 0} Schools, {exam.targetStudentIds?.length || 0} Private)</span>
                            </div>
                          ) : isPriv ? (
                            <div className="flex items-center gap-1.5 text-[#1E293B] dark:text-zinc-200 font-bold tabular-nums">
                              <User size={13} className="text-slate-500 dark:text-zinc-400" />
                              <span>Private Learners ({exam.targetStudentIds?.length || 1})</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300 font-medium">
                              <School size={13} className="text-slate-400 dark:text-zinc-500" />
                              <span className="truncate max-w-[150px]">{exam.schoolName || 'Partner School'}</span>
                            </div>
                          )}
                          {Array.isArray((exam as any).excludedStudentIds) && (exam as any).excludedStudentIds.length > 0 && (
                            <p className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 tabular-nums">
                              {(exam as any).excludedStudentIds.length} excluded
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 4. Questions & Marks */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="space-y-0.5 text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                          {isExternal ? (
                            <span className="font-semibold text-slate-400 dark:text-zinc-500">External Form</span>
                          ) : (
                            <>
                              <p className="font-bold text-slate-800 dark:text-zinc-200">
                                {exam.questionCount || 0} Question(s)
                              </p>
                              <p className="text-slate-400 dark:text-zinc-500">
                                {exam.maxScore || 0} Marks · {exam.durationMinutes ? `${exam.durationMinutes}m` : 'Untimed'}
                              </p>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 5. Status & Availability */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <span
                            className={`text-[11px] font-black uppercase tracking-wider ${
                              statusLower === 'active'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : statusLower === 'scheduled'
                                ? 'text-[#1E293B] dark:text-zinc-200'
                                : statusLower === 'completed'
                                ? 'text-[#B91C1C] dark:text-red-400'
                                : 'text-slate-500 dark:text-zinc-400'
                            }`}
                          >
                            {statusLower === 'active'
                              ? 'Active'
                              : statusLower === 'scheduled'
                              ? 'Scheduled'
                              : statusLower === 'completed'
                              ? 'Closed'
                              : statusLower === 'archived'
                              ? 'Archived'
                              : 'Draft'}
                          </span>
                          {exam.passcode && (
                            <p className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 tabular-nums">
                              Passcode: <strong>{exam.passcode}</strong>
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 6. More Actions (Three-Dot Menu & Right-Click Supported) */}
                      <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end">
                          <RowActionMenuButton
                            onClick={(e) => {
                              if (rowContextMenu.state?.data?.id === exam.id) {
                                rowContextMenu.close();
                              } else {
                                rowContextMenu.openFromButton(e, exam);
                              }
                            }}
                            ariaLabel={`Actions for ${exam.title || 'assessment'}`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rowContextMenu.state && (
        <FloatingActionMenu
          coords={rowContextMenu.coords}
          items={buildRowActions(rowContextMenu.state.data)}
          onClose={rowContextMenu.close}
          title={rowContextMenu.state.data.title || 'Assessment Actions'}
        />
      )}

      {pendingStatusAction && onChangeAssessmentStatus && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {pendingStatusAction.mode === 'close'
                    ? 'Close Assessment?'
                    : pendingStatusAction.mode === 'reopen'
                    ? 'Reopen Assessment?'
                    : 'Activate Assessment?'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                  {pendingStatusAction.assessment.title}
                </p>
              </div>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={() => setPendingStatusAction(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              {pendingStatusAction.mode === 'close'
                ? 'Learners will no longer be able to start or submit responses while this assessment is closed. All existing learner submissions, scores, attempts, and assessment history will remain intact and accessible.'
                : pendingStatusAction.mode === 'reopen'
                ? 'This assessment will become active and available again to eligible learners according to its target school, class, programme, or learner settings. Existing learner submissions, scores, and attempt limits will be preserved.'
                : 'This assessment will become active and available to eligible learners according to its target school, class, programme, or learner settings.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={() => setPendingStatusAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={async () => {
                  setStatusSubmitting(true);
                  try {
                    await onChangeAssessmentStatus(
                      pendingStatusAction.assessment,
                      pendingStatusAction.nextStatus
                    );
                    setPendingStatusAction(null);
                  } catch {
                    // Keep modal state or let caller display the error notification without falsely closing as succeeded
                  } finally {
                    setStatusSubmitting(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-60 ${
                  pendingStatusAction.mode === 'close'
                    ? 'bg-[#991B1B] hover:bg-[#7F1D1D]'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {statusSubmitting
                  ? 'Updating...'
                  : pendingStatusAction.mode === 'close'
                  ? 'Close Assessment'
                  : pendingStatusAction.mode === 'reopen'
                  ? 'Reopen Assessment'
                  : 'Activate Assessment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
