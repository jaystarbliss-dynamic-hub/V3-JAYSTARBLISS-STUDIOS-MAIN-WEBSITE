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
} from 'lucide-react';
import type { AcademicWorkType } from '../../lib/classes';

export interface AssessmentListItem {
  id: string;
  title: string;
  subject: string;
  workType?: AcademicWorkType;
  deliveryMode: 'NATIVE' | 'EXTERNAL_LINK';
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

  // Delete Confirmation State
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        const itemStatus = String(item.status || 'draft').toLowerCase();
        if (statusFilter.toLowerCase() !== itemStatus) return false;
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
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Assessment Overview
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {assessments.length} Total
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
            className="min-h-[42px] px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
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
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
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
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="active">Active (Published)</option>
          <option value="draft">Drafts</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>

        {/* Work Type Dropdown */}
        <select
          value={workTypeFilter}
          onChange={(e) => setWorkTypeFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
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
          className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
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
            className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3. ASSESSMENTS TABLE / LIST PRESENTATION                       */}
      {/* ============================================================== */}
      {isLoading ? (
        <div className="p-12 text-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] space-y-3">
          <RefreshCw size={24} className="mx-auto text-blue-600 animate-spin" />
          <p className="text-xs font-bold text-slate-500">Loading authorized assessments...</p>
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
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
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer inline-flex items-center gap-2"
          >
            <PlusCircle size={15} /> Create Assessment
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161B26] rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4 sm:px-6">Assessment &amp; Type</th>
                  <th className="py-3.5 px-4">Subject &amp; Target</th>
                  <th className="py-3.5 px-4">Recipients</th>
                  <th className="py-3.5 px-4">Structure</th>
                  <th className="py-3.5 px-4">Status &amp; Availability</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
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

                  const statusLower = String(exam.status || 'draft').toLowerCase();

                  return (
                    <tr
                      key={exam.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors group"
                    >
                      {/* 1. Assessment Title & Format */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="space-y-1.5 min-w-[180px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                wt === 'ASSIGNMENT'
                                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                                  : wt === 'TEST'
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                  : wt === 'ACTIVITY'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                              }`}
                            >
                              {wt}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                isExternal
                                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                              }`}
                            >
                              {isExternal ? 'External Link' : 'Native'}
                            </span>
                          </div>
                          <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {exam.title || 'Untitled Assessment'}
                          </p>
                        </div>
                      </td>

                      {/* 2. Subject & Target Class */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <p className="font-bold text-slate-800 dark:text-slate-200">
                            {exam.subject || 'General Studies'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {exam.targetClass || exam.className || 'All Grades'}
                          </p>
                          {(exam.programTitle || exam.programBreadcrumbs) && (
                            <div className="pt-0.5">
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10px] font-bold max-w-[200px] truncate"
                                title={exam.programBreadcrumbs || exam.programTitle}
                              >
                                <Tag size={9} className="shrink-0 text-blue-500" />
                                <span className="truncate">{exam.programBreadcrumbs || exam.programTitle}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. Recipients */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          {isMultiTarget ? (
                            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold">
                              <Users size={13} />
                              <span>Multi-Target ({exam.targetSchoolIds?.length || 0} Schools, {exam.targetStudentIds?.length || 0} Private)</span>
                            </div>
                          ) : isPriv ? (
                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                              <User size={13} />
                              <span>Private Learners ({exam.targetStudentIds?.length || 1})</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                              <School size={13} className="text-slate-400" />
                              <span className="truncate max-w-[150px]">{exam.schoolName || 'Partner School'}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 4. Questions & Marks */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="space-y-0.5 text-[11px] text-slate-500">
                          {isExternal ? (
                            <span className="font-semibold text-slate-400">External Form</span>
                          ) : (
                            <>
                              <p className="font-bold text-slate-800 dark:text-slate-200">
                                {exam.questionCount || 0} Question(s)
                              </p>
                              <p className="text-slate-400">
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
                            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                              statusLower === 'active'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : statusLower === 'scheduled'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                statusLower === 'active'
                                  ? 'bg-emerald-500'
                                  : statusLower === 'scheduled'
                                  ? 'bg-blue-500'
                                  : 'bg-slate-400'
                              }`}
                            />
                            {statusLower === 'active' ? 'Active' : statusLower === 'scheduled' ? 'Scheduled' : 'Draft'}
                          </span>
                          {exam.passcode && (
                            <p className="text-[10px] font-mono text-slate-400">
                              Passcode: <strong>{exam.passcode}</strong>
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 6. Action Buttons */}
                      <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditAssessment(exam)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Edit Assessment"
                          >
                            <Edit3 size={14} />
                          </button>

                          {!isExternal && (
                            <button
                              type="button"
                              onClick={() => onMonitorAssessment(exam)}
                              className="p-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
                              title="Monitor Responses & Submissions"
                            >
                              <Activity size={14} />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onPreviewAssessment(exam)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Preview Student View"
                          >
                            <Eye size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDuplicateAssessment(exam)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Duplicate as New Draft"
                          >
                            <Copy size={14} />
                          </button>

                          {deletingId === exam.id ? (
                            <div className="inline-flex items-center gap-1 animate-in fade-in">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteAssessment(exam.id);
                                  setDeletingId(null);
                                }}
                                className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded-lg hover:bg-red-700 cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletingId(exam.id)}
                              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                              title="Delete Assessment"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
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
    </div>
  );
};
