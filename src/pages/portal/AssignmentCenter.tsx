import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  School,
  Send,
  ShieldAlert,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { academicApiWithFallback as api } from '../../lib/academicFallback';
import { CANONICAL_CLASSES, normalizeClassName, resolvePartnerSchoolName } from '../../lib/classes';
import { isStudentClassMatch } from '../../utils/classMatching';
import {
  type LinkedLearnerProfile,
  type UnifiedAssignmentRecord,
  type UnifiedAssignmentStatus,
  createUnifiedAssignmentOrActivity,
  fetchAssignmentsForLearner,
  fetchAssignmentsForParent,
  fetchAssignmentsForTutor,
  resolveParentLinkedChildren,
  resolveStudentLearnerProfile,
  reviewUnifiedAssignment,
  submitUnifiedAssignment,
} from '../../lib/academicSyncEngine';
import { EmbeddedLearningMedia } from '../../components/portal/EmbeddedLearningMedia';
import SEO from '../../components/ui/SEO';
import { ExamListSkeleton } from '../../components/ui/Skeleton';
import { getFriendlyErrorMessage, logInternalDiagnostic } from '../../utils/friendlyErrors';

export type AssignmentCenterRole = 'student' | 'staff' | 'parent' | 'school';

type Draft = {
  text: string;
  url: string;
  driveConfirmed?: boolean;
};

type SchoolOption = {
  id: string;
  name: string;
  programs: string[];
};

type TutorStudentOption = {
  id: string;
  uid?: string;
  fullName: string;
  username?: string;
  email?: string;
  className: string;
  schoolId?: string;
  schoolName?: string;
  programName?: string;
  parentId?: string;
  parentEmail?: string;
  isSchoolStudent: boolean;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'No deadline';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined,
  }).format(d);
};

const statusBadgeMeta = (
  status: UnifiedAssignmentStatus | string
): { label: string; className: string } => {
  const s = String(status || '').toUpperCase();
  switch (s) {
    case 'COMPLETED':
      return {
        label: 'Completed',
        className:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      };
    case 'GRADED':
      return {
        label: 'Graded',
        className:
          'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60',
      };
    case 'SUBMITTED':
    case 'AWAITING_REVIEW':
      return {
        label: 'Submitted • Awaiting Review',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
      };
    case 'RESUBMISSION_REQUIRED':
      return {
        label: 'Resubmission Required',
        className:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      };
    case 'OVERDUE':
      return {
        label: 'Overdue',
        className:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
      };
    default:
      return {
        label: 'Pending Submission',
        className:
          'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
  }
};

const validateSubmissionLink = (rawUrl: string): { valid: boolean; isGoogleLink: boolean; error?: string } => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { valid: true, isGoogleLink: false };
  if (/\s/.test(trimmed)) {
    return { valid: false, isGoogleLink: false, error: 'URL cannot contain spaces.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, isGoogleLink: false, error: 'URL must start with https:// or http://' };
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return { valid: false, isGoogleLink: false, error: 'Please enter a complete web address.' };
    }
    const host = parsed.hostname.toLowerCase();
    const isGoogleLink =
      host.includes('drive.google.com') ||
      host.includes('docs.google.com') ||
      host.includes('sheets.google.com') ||
      host.includes('slides.google.com');
    return { valid: true, isGoogleLink };
  } catch {
    return { valid: false, isGoogleLink: false, error: 'Please enter a valid URL starting with https://' };
  }
};

const AssignmentCenter: React.FC<{ role: AssignmentCenterRole }> = ({ role }) => {
  const [assignments, setAssignments] = useState<UnifiedAssignmentRecord[]>([]);
  const [linkedChildren, setLinkedChildren] = useState<LinkedLearnerProfile[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudentOption[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [studentProfile, setStudentProfile] = useState<LinkedLearnerProfile | null>(null);

  // Filters
  const [selectedChildId, setSelectedChildId] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Tutor Creation Modal State
  const [showCreate, setShowCreate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [targetMode, setTargetMode] = useState<'SCHOOL_GRADE' | 'INDIVIDUAL'>('SCHOOL_GRADE');
  const [studentCategoryFilter, setStudentCategoryFilter] = useState<'ALL' | 'PRIVATE' | 'SCHOOL'>('ALL');
  const [form, setForm] = useState({
    title: '',
    instructions: '',
    subject: 'Computer Technology',
    programName: '',
    activityType: 'ASSIGNMENT' as 'ASSIGNMENT' | 'ACTIVITY' | 'QUIZ' | 'TEST' | 'EXAMINATION',
    schoolId: '',
    targetClass: 'Grade 1',
    studentId: '',
    dueDate: '',
    maxMarks: '100',
    submissionFormat: 'BOTH' as 'TEXT' | 'LINK' | 'BOTH' | 'FILE' | 'NONE',
    resourceTitle: '',
    resourceUrl: '',
  });

  // Tutor Review Modal State
  const [reviewing, setReviewing] = useState<UnifiedAssignmentRecord | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    grade: '',
    feedback: '',
    reviewStatus: 'COMPLETED' as 'COMPLETED' | 'RESUBMISSION_REQUIRED',
  });

  // Student Submission State
  const [submittingId, setSubmittingId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      try {
        if (role === 'parent') {
          const children = await resolveParentLinkedChildren();
          const parentAssignments = await fetchAssignmentsForParent(children);
          setLinkedChildren(children);
          setAssignments(parentAssignments);
        } else if (role === 'student') {
          const profile = await resolveStudentLearnerProfile();
          setStudentProfile(profile);
          if (profile) {
            const list = await fetchAssignmentsForLearner(profile);
            setAssignments(list);
          } else {
            // Fallback API if profile not resolved directly
            const res = await api('/api/academic-assignments?action=list').catch(() => ({ assignments: [] }));
            setAssignments(res.assignments || []);
          }
        } else if (role === 'staff' || role === 'school') {
          const currentUser = auth.currentUser;
          const uid = currentUser?.uid || '';

          const [tutorAssList, schoolsSnap, indivSnap, studSnap, userDocSnap] = await Promise.all([
            fetchAssignmentsForTutor({}),
            getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
            getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] } as any)),
            getDocs(collection(db, 'students')).catch(() => ({ docs: [] } as any)),
            uid ? getDoc(doc(db, 'users', uid)).catch(() => null) : Promise.resolve(null),
          ]);

          setAssignments(tutorAssList);

          const schoolMap = new Map<string, SchoolOption>();
          schoolsSnap.docs?.forEach((d: any) => {
            const s = d.data() || {};
            const name = resolvePartnerSchoolName(s.name, s.schoolName, s.institutionName);
            if (!name) return;
            const progs = Array.isArray(s.programs)
              ? s.programs.map((p: any) => String(p?.name || p?.title || p || '').trim()).filter(Boolean)
              : [];
            schoolMap.set(d.id, { id: d.id, name, programs: progs });
          });

          const loadedSchools = Array.from(schoolMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setSchools(loadedSchools);

          const studentMap = new Map<string, TutorStudentOption>();
          const registerStudent = (docId: string, d: any, source: 'individualStudents' | 'students') => {
            const sId = String(d.schoolId || d.school_id || d.schoolDocId || '').trim();
            const sName =
              resolvePartnerSchoolName(d.schoolName, d.school, schoolMap.get(sId)?.name) || '';
            const rawClass = String(d.className || d.class || d.grade || d.studentAge || '').trim();
            const cName = normalizeClassName(rawClass) || rawClass || 'Grade 1';
            const fullName = String(
              d.fullName ||
                d.studentName ||
                d.name ||
                [d.firstName, d.lastName].filter(Boolean).join(' ') ||
                'Student'
            ).trim();
            if (!fullName) return;

            const existing = studentMap.get(docId);
            studentMap.set(docId, {
              id: docId,
              uid: String(d.firebaseUid || d.userId || d.uid || existing?.uid || '').trim(),
              fullName,
              username: String(d.username || existing?.username || '').trim(),
              email: String(d.email || existing?.email || '').trim(),
              className: cName,
              schoolId: sId || existing?.schoolId || '',
              schoolName: sName || existing?.schoolName || '',
              programName: String(
                d.programName || d.programTitle || d.plan || d.track || existing?.programName || ''
              ).trim(),
              parentId: String(d.parentId || d.parentUid || existing?.parentId || '').trim(),
              parentEmail: String(d.parentEmail || existing?.parentEmail || '').trim(),
              isSchoolStudent: Boolean(sId || sName || source === 'students'),
            });
          };

          indivSnap.docs?.forEach((d: any) => registerStudent(d.id, d.data(), 'individualStudents'));
          studSnap.docs?.forEach((d: any) => registerStudent(d.id, d.data(), 'students'));

          const allTutorStudents = Array.from(studentMap.values()).sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          );
          setTutorStudents(allTutorStudents);

          // Set default school selection for form if not set
          const uData = userDocSnap?.exists() ? userDocSnap.data() : {};
          const defaultSchoolId =
            uData?.schoolId || (loadedSchools.length > 0 ? loadedSchools[0].id : '');
          if (defaultSchoolId) {
            setForm((prev) => (prev.schoolId ? prev : { ...prev, schoolId: defaultSchoolId }));
          }
        }
      } catch (e) {
        logInternalDiagnostic('AssignmentCenter::Load', e);
        setError(getFriendlyErrorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [role]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Eligible students for the selected School + Grade in the Create Modal
  const eligibleSchoolGradeStudents = useMemo(() => {
    if (!form.schoolId || !form.targetClass) return [];
    const selectedSchool = schools.find((s) => s.id === form.schoolId);
    return tutorStudents.filter((s) => {
      const schoolMatch =
        s.schoolId === form.schoolId ||
        (selectedSchool &&
          s.schoolName &&
          s.schoolName.toLowerCase() === selectedSchool.name.toLowerCase());
      if (!schoolMatch) return false;
      return isStudentClassMatch(s.className, form.targetClass);
    });
  }, [tutorStudents, schools, form.schoolId, form.targetClass]);

  // Filtered students for Individual mode in the Create Modal
  const filteredIndividualStudents = useMemo(() => {
    return tutorStudents.filter((s) => {
      if (studentCategoryFilter === 'PRIVATE') return !s.isSchoolStudent;
      if (studentCategoryFilter === 'SCHOOL') return s.isSchoolStudent;
      return true;
    });
  }, [tutorStudents, studentCategoryFilter]);

  // Filtered assignments for display
  const visibleAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (role === 'parent' && selectedChildId !== 'all') {
        const child = linkedChildren.find((c) => c.id === selectedChildId);
        const childIds = child ? new Set(child.allIds) : new Set([selectedChildId]);
        if (!childIds.has(a.studentId)) return false;
      }
      if (role === 'staff') {
        if (selectedSchoolFilter !== 'ALL') {
          if (selectedSchoolFilter === 'PRIVATE') {
            if (a.targetMode === 'SCHOOL_GRADE' || (a.schoolId && a.schoolId !== 'private')) {
              return false;
            }
          } else if (a.schoolId !== selectedSchoolFilter) {
            return false;
          }
        }
        if (selectedClassFilter !== 'ALL') {
          if (!isStudentClassMatch(a.targetClass || a.className || '', selectedClassFilter)) {
            return false;
          }
        }
        if (selectedStudentFilter !== 'ALL') {
          if (a.studentId !== selectedStudentFilter && a.targetMode !== 'SCHOOL_GRADE') {
            return false;
          }
        }
      }
      if (selectedStatusFilter !== 'ALL') {
        if (selectedStatusFilter === 'PENDING') {
          return a.status === 'PENDING' || a.status === 'OVERDUE';
        }
        if (selectedStatusFilter === 'SUBMITTED') {
          return a.status === 'SUBMITTED' || a.status === 'RESUBMISSION_REQUIRED';
        }
        if (selectedStatusFilter === 'COMPLETED') {
          return a.status === 'COMPLETED' || a.status === 'GRADED';
        }
        return a.status === selectedStatusFilter;
      }
      return true;
    });
  }, [
    assignments,
    role,
    selectedChildId,
    linkedChildren,
    selectedSchoolFilter,
    selectedClassFilter,
    selectedStudentFilter,
    selectedStatusFilter,
  ]);

  // Summary Stats
  const stats = useMemo(() => {
    const total = visibleAssignments.length;
    const pending = visibleAssignments.filter(
      (a) => a.status === 'PENDING' || a.status === 'OVERDUE' || a.status === 'RESUBMISSION_REQUIRED'
    ).length;
    const awaitingReview = visibleAssignments.filter((a) => a.status === 'SUBMITTED').length;
    const completed = visibleAssignments.filter(
      (a) => a.status === 'COMPLETED' || a.status === 'GRADED'
    ).length;
    return { total, pending, awaitingReview, completed };
  }, [visibleAssignments]);

  const handleCreateAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.title.trim()) {
      setError('Please enter a title for this assignment or activity.');
      return;
    }
    if (!form.instructions.trim()) {
      setError('Please provide clear instructions or description.');
      return;
    }

    if (targetMode === 'SCHOOL_GRADE') {
      if (!form.schoolId) {
        setError('Please select a school.');
        return;
      }
      if (!form.targetClass) {
        setError('Please select a target grade/class.');
        return;
      }
    } else {
      if (!form.studentId) {
        setError('Please select a student.');
        return;
      }
    }

    setPublishing(true);
    try {
      const selectedSchool = schools.find((s) => s.id === form.schoolId);
      const selectedStudent = tutorStudents.find((s) => s.id === form.studentId);

      await createUnifiedAssignmentOrActivity({
        title: form.title.trim(),
        instructions: form.instructions.trim(),
        subject: form.subject.trim() || 'Computer Technology',
        programName:
          form.programName.trim() ||
          selectedStudent?.programName ||
          selectedSchool?.programs?.[0] ||
          'Technology Track',
        activityType: form.activityType,
        targetMode,
        schoolId:
          targetMode === 'SCHOOL_GRADE'
            ? form.schoolId
            : selectedStudent?.schoolId || 'private',
        schoolName:
          targetMode === 'SCHOOL_GRADE'
            ? selectedSchool?.name || ''
            : selectedStudent?.schoolName || 'Private Track',
        targetClass:
          targetMode === 'SCHOOL_GRADE'
            ? form.targetClass
            : selectedStudent?.className || '',
        studentId: targetMode === 'INDIVIDUAL' ? selectedStudent?.id : undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : '',
        maxMarks: Number(form.maxMarks) || 100,
        submissionRequirement:
          form.submissionFormat === 'LINK'
            ? 'link'
            : form.submissionFormat === 'TEXT'
            ? 'text'
            : form.submissionFormat === 'NONE'
            ? 'none'
            : 'both',
        resourceTitle: form.resourceTitle.trim() || undefined,
        resourceUrl: form.resourceUrl.trim() || undefined,
      });

      const targetSummary =
        targetMode === 'SCHOOL_GRADE'
          ? `${selectedSchool?.name || 'School'} • ${form.targetClass} (${eligibleSchoolGradeStudents.length} enrolled learner${eligibleSchoolGradeStudents.length === 1 ? '' : 's'})`
          : `${selectedStudent?.fullName || 'Learner'}`;

      setSuccess(
        `${form.activityType === 'ACTIVITY' ? 'Learning Activity' : 'Assignment'} published to ${targetSummary}. It is now synchronized across Student and Parent Dashboards.`
      );
      setForm((prev) => ({
        ...prev,
        title: '',
        instructions: '',
        dueDate: '',
        resourceTitle: '',
        resourceUrl: '',
      }));
      setShowCreate(false);
      await loadData(true);
    } catch (e) {
      logInternalDiagnostic('AssignmentCenter::Create', e);
      setError(e instanceof Error ? e.message : 'Could not publish assignment.');
    } finally {
      setPublishing(false);
    }
  };

  const updateDraft = (assignmentId: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [assignmentId]: {
        text: current[assignmentId]?.text || '',
        url: current[assignmentId]?.url || '',
        driveConfirmed: current[assignmentId]?.driveConfirmed || false,
        ...patch,
      },
    }));

  const handleSubmitAssignment = async (assignment: UnifiedAssignmentRecord) => {
    const draft = drafts[assignment.id] || { text: '', url: '', driveConfirmed: false };
    const linkCheck = validateSubmissionLink(draft.url);
    if (!linkCheck.valid) {
      setError(linkCheck.error || 'Please provide a valid submission URL.');
      return;
    }
    if (linkCheck.isGoogleLink && !draft.driveConfirmed) {
      setError(
        'Please confirm that your Google Drive / Docs link sharing permission is set to "Anyone with the link can view" before submitting.'
      );
      return;
    }

    setSubmittingId(assignment.id);
    setError('');
    setSuccess('');
    try {
      const resolvedLearner =
        studentProfile ||
        (await resolveStudentLearnerProfile()) || {
          id: auth.currentUser?.uid || 'student',
          allIds: [auth.currentUser?.uid || 'student'],
          studentUid: auth.currentUser?.uid || '',
          fullName: auth.currentUser?.displayName || 'Student',
          className: assignment.targetClass || 'Grade 1',
          schoolId: assignment.schoolId || '',
          schoolAliases: [],
          schoolName: assignment.schoolName || '',
          isSchoolStudent: Boolean(assignment.schoolId && assignment.schoolId !== 'private'),
          programName: assignment.programName || 'General',
        };
      await submitUnifiedAssignment({
        assignment,
        learner: resolvedLearner,
        submissionText: draft.text,
        submissionUrl: draft.url,
      });
      setSuccess('Your work has been submitted! Your tutor and parent dashboard have been updated.');
      setDrafts((current) => ({
        ...current,
        [assignment.id]: { text: '', url: '', driveConfirmed: false },
      }));
      await loadData(true);
    } catch (e) {
      logInternalDiagnostic('AssignmentCenter::Submit', e);
      setError(getFriendlyErrorMessage(e));
    } finally {
      setSubmittingId('');
    }
  };

  const handleReviewAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewing) return;
    setReviewSaving(true);
    setError('');
    setSuccess('');
    try {
      await reviewUnifiedAssignment({
        assignment: reviewing,
        grade: Number(reviewForm.grade) || 0,
        feedback: reviewForm.feedback,
        reviewStatus: reviewForm.reviewStatus,
      });
      setSuccess(
        reviewForm.reviewStatus === 'COMPLETED'
          ? 'Assignment graded and synchronized with the student and parent dashboards.'
          : 'Resubmission request sent to the learner.'
      );
      setReviewing(null);
      await loadData(true);
    } catch (e) {
      logInternalDiagnostic('AssignmentCenter::Review', e);
      setError(getFriendlyErrorMessage(e));
    } finally {
      setReviewSaving(false);
    }
  };

  const title =
    role === 'staff'
      ? 'Assignments & Cohort Activities'
      : role === 'student'
      ? 'My Assignments & Learning Activities'
      : role === 'parent'
      ? "Children's Assignments & Tasks"
      : 'School Assignments Overview';

  const subtitle =
    role === 'staff'
      ? 'Assign work to an entire School Grade/Class or an Individual Student, and review learner submissions.'
      : role === 'student'
      ? 'View assignments for your class and personal learning track, submit work, and read tutor feedback.'
      : role === 'parent'
      ? "Monitor your child's assigned tasks, due dates, submission status, grades, and tutor feedback in real time."
      : 'Track assignment delivery and learner submissions across your school grades.';

  return (
    <div className="dashboard-interface space-y-6">
      <SEO title={`${title} | Jaystarbliss Studios`} description={subtitle} noindex={true} />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-red/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-red">
              <ClipboardList size={12} /> Academic Sync
            </span>
            {role === 'student' && studentProfile && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {studentProfile.className}
                {studentProfile.schoolName ? ` • ${studentProfile.schoolName}` : ''}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1.5">
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
            className="min-h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          {role === 'staff' && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setShowCreate(true);
              }}
              className="min-h-10 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={16} /> Assign Work (School Grade or Individual)
            </button>
          )}
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800/60 p-4 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{success}</span>
          <button className="ml-auto" onClick={() => setSuccess('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800/60 p-4 text-sm text-red-800 dark:text-red-200">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
          <button className="ml-auto" onClick={() => setError('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 4-Card KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={<ClipboardList size={20} />}
          label="Total Assigned"
          value={stats.total}
          accent="text-brand-red bg-brand-red/10"
        />
        <Stat
          icon={<Clock size={20} />}
          label="Pending / Active"
          value={stats.pending}
          accent="text-amber-600 bg-amber-500/10"
        />
        <Stat
          icon={<Send size={20} />}
          label="Submitted / In Review"
          value={stats.awaitingReview}
          accent="text-blue-600 bg-blue-500/10"
        />
        <Stat
          icon={<GraduationCap size={20} />}
          label="Graded & Completed"
          value={stats.completed}
          accent="text-emerald-600 bg-emerald-500/10"
        />
      </div>

      {/* Parent Filter Bar */}
      {role === 'parent' && (
        <div className="pro-surface rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                Filter by Linked Child
              </label>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium text-slate-900 dark:text-white"
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

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                Submission Status
              </label>
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium text-slate-900 dark:text-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending / Overdue</option>
                <option value="SUBMITTED">Submitted (Awaiting Review)</option>
                <option value="COMPLETED">Graded & Completed</option>
              </select>
            </div>
          </div>

          {linkedChildren.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {linkedChildren.map((child) => {
                const isSelected = selectedChildId === child.id;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() =>
                      setSelectedChildId((prev) => (prev === child.id ? 'all' : child.id))
                    }
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <UserRound size={14} className="text-brand-red" />
                    <span>{child.fullName}</span>
                    <span className="rounded-md bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {child.className}
                    </span>
                    {child.schoolName && (
                      <span className="text-[10px] text-slate-400">• {child.schoolName}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tutor Filter Bar */}
      {role === 'staff' && (
        <div className="pro-surface rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              School / Track
            </label>
            <select
              value={selectedSchoolFilter}
              onChange={(e) => setSelectedSchoolFilter(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
            >
              <option value="ALL">All Schools & Private Learners</option>
              <option value="PRIVATE">Private Learners Only</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              Grade / Class
            </label>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
            >
              <option value="ALL">All Grades / Classes</option>
              {CANONICAL_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              Individual Learner
            </label>
            <select
              value={selectedStudentFilter}
              onChange={(e) => setSelectedStudentFilter(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
            >
              <option value="ALL">All Learners</option>
              {tutorStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.className}
                  {s.schoolName ? ` • ${s.schoolName}` : ' • Private'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              Status Filter
            </label>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending / Active</option>
              <option value="SUBMITTED">Submitted (Needs Review)</option>
              <option value="COMPLETED">Graded & Completed</option>
            </select>
          </div>
        </div>
      )}

      {/* Student Status Filter Bar */}
      {role === 'student' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 p-4 text-sm text-blue-900 dark:text-blue-200">
          <div className="flex items-center gap-2.5">
            <BookOpen size={18} className="shrink-0 text-blue-600" />
            <span>
              Assignments from your tutor for your personal learning track and your school grade appear here automatically.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(['ALL', 'PENDING', 'SUBMITTED', 'COMPLETED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedStatusFilter === st
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-white'
                }`}
              >
                {st === 'ALL'
                  ? 'All'
                  : st === 'PENDING'
                  ? 'To Do'
                  : st === 'SUBMITTED'
                  ? 'Submitted'
                  : 'Graded'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Assignments List */}
      <div className="pro-surface rounded-3xl p-5 md:p-7">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              {role === 'parent'
                ? 'Assigned Work & Feedback Log'
                : role === 'staff'
                ? 'Published Assignments & Learner Submissions'
                : 'My Assignment Inbox'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {visibleAssignments.length} assignment{visibleAssignments.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {loading ? (
          <ExamListSkeleton count={3} />
        ) : visibleAssignments.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl px-4">
            <ClipboardList className="mx-auto text-slate-300 mb-3" size={38} />
            <p className="font-bold text-slate-900 dark:text-white">
              {role === 'parent' && linkedChildren.length === 0
                ? 'No linked student profiles found for your parent account'
                : 'No matching assignments found'}
            </p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              {role === 'staff'
                ? 'Click "Assign Work (School Grade or Individual)" above to publish an assignment or activity to a school grade or private learner.'
                : role === 'parent'
                ? "When your child's tutor assigns an individual task or a class-wide school assignment for their grade, it will automatically appear here."
                : 'When your tutor publishes an assignment for you or your class grade, it will appear here immediately.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleAssignments.map((a) => (
              <AssignmentCard
                key={`${a.id}_${a.studentId || 'cohort'}_${a.submissionId || 'base'}`}
                assignment={a}
                role={role}
                draft={drafts[a.id] || { text: '', url: '', driveConfirmed: false }}
                onDraftChange={(patch) => updateDraft(a.id, patch)}
                onSubmit={() => void handleSubmitAssignment(a)}
                submitting={submittingId === a.id}
                onReview={() => {
                  setReviewing(a);
                  setReviewForm({
                    grade: a.grade == null ? '' : String(a.grade),
                    feedback: a.feedback || '',
                    reviewStatus:
                      a.status === 'RESUBMISSION_REQUIRED' ? 'RESUBMISSION_REQUIRED' : 'COMPLETED',
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Assignment / Activity Modal (Tutor) */}
      {showCreate && (
        <Modal
          title="Assign Work to School Grade or Individual Learner"
          onClose={() => setShowCreate(false)}
        >
          <form onSubmit={handleCreateAssignment} className="space-y-5">
            {/* Target Audience Selector */}
            <div>
              <span className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                1. Who is this assignment or activity for?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetMode('SCHOOL_GRADE')}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    targetMode === 'SCHOOL_GRADE'
                      ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10 ring-1 ring-brand-red'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-sm text-slate-900 dark:text-white">
                    <School size={17} className="text-brand-red" />
                    <span>School + Grade / Class Cohort</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Assign once to a School and Grade (e.g. Grade 1). Every student in that school and grade receives it automatically.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetMode('INDIVIDUAL')}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    targetMode === 'INDIVIDUAL'
                      ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10 ring-1 ring-brand-red'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-sm text-slate-900 dark:text-white">
                    <UserRound size={17} className="text-brand-red" />
                    <span>Individual Learner (1-on-1)</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Assign directly to a specific Private Student or a single School Student.
                  </p>
                </button>
              </div>
            </div>

            {targetMode === 'SCHOOL_GRADE' ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Select Partner School">
                    <select
                      required
                      value={form.schoolId}
                      onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
                      className="input"
                    >
                      <option value="">Choose a school…</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Select Target Grade / Class">
                    <select
                      required
                      value={form.targetClass}
                      onChange={(e) => setForm({ ...form, targetClass: e.target.value })}
                      className="input"
                    >
                      {CANONICAL_CLASSES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {/* Live Cohort Preview */}
                {form.schoolId && form.targetClass && (
                  <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/30 p-3 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
                    <Users size={16} className="shrink-0 mt-0.5 text-blue-600" />
                    <div>
                      <p className="font-bold">
                        {eligibleSchoolGradeStudents.length} enrolled student
                        {eligibleSchoolGradeStudents.length === 1 ? '' : 's'} matched in{' '}
                        {schools.find((s) => s.id === form.schoolId)?.name || 'this school'} •{' '}
                        {form.targetClass}
                      </p>
                      {eligibleSchoolGradeStudents.length > 0 ? (
                        <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                          Recipients:{' '}
                          {eligibleSchoolGradeStudents
                            .slice(0, 6)
                            .map((s) => s.fullName)
                            .join(', ')}
                          {eligibleSchoolGradeStudents.length > 6
                            ? ` +${eligibleSchoolGradeStudents.length - 6} more`
                            : ''}
                        </p>
                      ) : (
                        <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                          Any student enrolled in this school and grade will automatically see this work on their dashboard.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Filter Learner List
                  </span>
                  <div className="flex gap-1.5">
                    {(['ALL', 'PRIVATE', 'SCHOOL'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setStudentCategoryFilter(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                          studentCategoryFilter === cat
                            ? 'bg-brand-red text-white'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {cat === 'ALL' ? 'All' : cat === 'PRIVATE' ? 'Private' : 'School'}
                      </button>
                    ))}
                  </div>
                </div>

                <Field label="Select Student">
                  <select
                    required
                    value={form.studentId}
                    onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                    className="input"
                  >
                    <option value="">Choose a student…</option>
                    {filteredIndividualStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} • {s.className}
                        {s.schoolName ? ` (${s.schoolName})` : ' (Private Learner)'}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {/* Activity Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Activity Type">
                <select
                  value={form.activityType}
                  onChange={(e) =>
                    setForm({ ...form, activityType: e.target.value as any })
                  }
                  className="input"
                >
                  <option value="ASSIGNMENT">Assignment</option>
                  <option value="ACTIVITY">Learning Activity / Practical</option>
                  <option value="QUIZ">Quiz Task</option>
                  <option value="TEST">Class Test</option>
                </select>
              </Field>

              <Field label="Subject">
                <input
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="e.g. Coding & Robotics"
                  className="input"
                />
              </Field>

              <Field label="Program / Track">
                <input
                  value={form.programName}
                  onChange={(e) => setForm({ ...form, programName: e.target.value })}
                  placeholder="e.g. Coding for Kids"
                  className="input"
                />
              </Field>
            </div>

            <Field label="Assignment / Activity Title">
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Build an Interactive Scratch Story or Python Calculator"
                className="input"
              />
            </Field>

            <Field label="Detailed Instructions & Deliverables">
              <textarea
                required
                rows={5}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="Explain step-by-step what the students should build, complete, or submit…"
                className="input resize-y"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Due Date / Deadline">
                <input
                  required
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="input"
                />
              </Field>

              <Field label="Submission Requirement">
                <select
                  value={form.submissionFormat}
                  onChange={(e) =>
                    setForm({ ...form, submissionFormat: e.target.value as any })
                  }
                  className="input"
                >
                  <option value="BOTH">Text Response & Project Link</option>
                  <option value="LINK">Project / Google Drive Link</option>
                  <option value="TEXT">Written Text Response</option>
                  <option value="NONE">No Submission Required (Reading/Practice)</option>
                </select>
              </Field>

              <Field label="Max Marks">
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={form.maxMarks}
                  onChange={(e) => setForm({ ...form, maxMarks: e.target.value })}
                  className="input"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Reference Resource / Video Title (optional)">
                <input
                  value={form.resourceTitle}
                  onChange={(e) => setForm({ ...form, resourceTitle: e.target.value })}
                  placeholder="e.g. Starter Project Guide or YouTube Lesson"
                  className="input"
                />
              </Field>
              <Field label="Resource or YouTube URL (optional)">
                <input
                  type="url"
                  value={form.resourceUrl}
                  onChange={(e) => setForm({ ...form, resourceUrl: e.target.value })}
                  placeholder="https://…"
                  className="input"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={publishing} className="btn-primary">
                {publishing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Publishing…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Publish to{' '}
                    {targetMode === 'SCHOOL_GRADE' ? `${form.targetClass}` : 'Learner'}
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Review Assignment Modal (Tutor) */}
      {reviewing && (
        <Modal title="Review & Grade Learner Submission" onClose={() => setReviewing(null)}>
          <form onSubmit={handleReviewAssignment} className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4">
              <p className="font-bold text-sm text-slate-900 dark:text-white">{reviewing.title}</p>
              <p className="text-xs text-slate-500 mt-1">
                {reviewing.studentName} • {reviewing.className}
                {reviewing.schoolName ? ` (${reviewing.schoolName})` : ''} • Submitted{' '}
                {formatDate(reviewing.submittedAt)}
              </p>
            </div>

            {reviewing.submissionText && (
              <div>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                  Learner's Written Submission
                </p>
                <div className="whitespace-pre-wrap rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-700 dark:text-slate-200 max-h-52 overflow-y-auto">
                  {reviewing.submissionText}
                </div>
              </div>
            )}

            {reviewing.submissionUrl && (
              <div>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Submitted Project / Deliverable Link
                </p>
                <a
                  href={reviewing.submissionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-red/30 bg-brand-red/5 px-3.5 py-2 text-xs font-bold text-brand-red hover:underline"
                >
                  <ExternalLink size={15} /> {reviewing.submissionUrl}
                </a>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`Score (0 – ${reviewing.maxMarks || 100})`}>
                <input
                  required
                  min="0"
                  max={reviewing.maxMarks || 100}
                  type="number"
                  value={reviewForm.grade}
                  onChange={(e) => setReviewForm({ ...reviewForm, grade: e.target.value })}
                  className="input"
                />
              </Field>

              <Field label="Review Outcome">
                <select
                  value={reviewForm.reviewStatus}
                  onChange={(e) =>
                    setReviewForm({
                      ...reviewForm,
                      reviewStatus: e.target.value as 'COMPLETED' | 'RESUBMISSION_REQUIRED',
                    })
                  }
                  className="input"
                >
                  <option value="COMPLETED">Complete & Release Score</option>
                  <option value="RESUBMISSION_REQUIRED">Request Resubmission</option>
                </select>
              </Field>
            </div>

            <Field label="Tutor Feedback & Remarks">
              <textarea
                required
                rows={5}
                value={reviewForm.feedback}
                onChange={(e) => setReviewForm({ ...reviewForm, feedback: e.target.value })}
                placeholder="Share constructive feedback for both the student and their parent…"
                className="input resize-y"
              />
            </Field>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setReviewing(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={reviewSaving} className="btn-primary">
                {reviewSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Save & Sync Feedback
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: number; accent: string }> = ({
  icon,
  label,
  value,
  accent,
}) => (
  <div className="pro-surface rounded-2xl p-4 sm:p-5 flex items-center gap-3.5">
    <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${accent}`}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
      {label}
    </span>
    {children}
  </label>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  children,
}) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black text-slate-900 dark:text-white">{title}</h3>
        <button
          onClick={onClose}
          type="button"
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const AssignmentCard: React.FC<{
  assignment: UnifiedAssignmentRecord;
  role: AssignmentCenterRole;
  draft: Draft;
  onDraftChange: (patch: Partial<Draft>) => void;
  onSubmit: () => void;
  submitting: boolean;
  onReview: () => void;
}> = ({ assignment: a, role, draft, onDraftChange, onSubmit, submitting, onReview }) => {
  const badge = statusBadgeMeta(a.status);
  const canSubmit =
    role === 'student' &&
    a.submissionFormat !== 'NONE' &&
    ['PENDING', 'OVERDUE', 'RESUBMISSION_REQUIRED'].includes(a.status);

  const linkValidation = useMemo(() => validateSubmissionLink(draft.url), [draft.url]);
  const isYoutubeResource =
    a.resourceUrl &&
    (a.resourceUrl.includes('youtube.com') || a.resourceUrl.includes('youtu.be'));

  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/40 p-5 sm:p-6 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700">
      {/* Top Meta Row */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${badge.className}`}
            >
              {badge.label}
            </span>

            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {a.activityType === 'ACTIVITY' ? 'Learning Activity' : 'Assignment'}
            </span>

            {a.subject && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                {a.subject}
              </span>
            )}

            {a.programName && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                {a.programName}
              </span>
            )}

            {a.targetMode === 'SCHOOL_GRADE' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                <School size={12} /> {a.schoolName || 'School'} • {a.targetClass || a.className}
              </span>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
            {a.title}
          </h3>

          {/* Child / Learner / Tutor / Dates Row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {(role === 'parent' || role === 'staff' || role === 'school') && a.studentName && (
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <UserRound size={13} className="text-brand-red" />
                {a.studentName}
                {a.className ? ` (${a.className})` : ''}
              </span>
            )}

            <span>
              <strong>Tutor:</strong> {a.tutorName || 'Assigned Tutor'}
            </span>

            {a.assignedDate && (
              <span>
                <strong>Assigned:</strong> {formatDate(a.assignedDate)}
              </span>
            )}

            {a.dueDate && (
              <span
                className={
                  a.status === 'OVERDUE'
                    ? 'font-bold text-rose-600 dark:text-rose-400'
                    : 'font-semibold text-slate-700 dark:text-slate-300'
                }
              >
                <strong>Due:</strong> {formatDate(a.dueDate)}
              </span>
            )}
          </div>
        </div>

        {/* Right Action / Score Box */}
        <div className="flex items-center gap-3 shrink-0">
          {role === 'staff' &&
            (a.status === 'SUBMITTED' || a.submissionText || a.submissionUrl) && (
              <button
                type="button"
                onClick={onReview}
                className="min-h-10 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageSquare size={15} />
                {a.grade != null ? 'Update Review' : 'Review & Grade'}
              </button>
            )}

          {a.grade != null && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-2.5 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Score
              </p>
              <p className="text-xl font-black text-slate-900 dark:text-white">
                {a.grade}
                <span className="text-xs font-semibold text-slate-500">
                  /{a.maxMarks || 100}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      {a.instructions && (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300 rounded-xl bg-slate-50/70 dark:bg-slate-900/50 p-4 border border-slate-100 dark:border-slate-800/80">
          {a.instructions}
        </div>
      )}

      {/* Attached Resource or Video */}
      {a.resourceUrl && (
        <div className="mt-4">
          {isYoutubeResource ? (
            <EmbeddedLearningMedia url={a.resourceUrl} title={a.resourceTitle || a.title} compact />
          ) : (
            <a
              href={a.resourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-bold text-brand-red hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <FileText size={15} />
              {a.resourceTitle || 'Open Reference Material'}
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}

      {/* Submitted Work Display (Visible to Student, Parent, and Tutor) */}
      {(a.submissionText || a.submissionUrl || a.submittedAt) && (
        <div className="mt-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Learner Submission
            </p>
            {a.submittedAt && (
              <span className="text-[11px] text-slate-500">
                Submitted {formatDate(a.submittedAt)}
              </span>
            )}
          </div>
          {a.submissionText && (
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {a.submissionText}
            </p>
          )}
          {a.submissionUrl && (
            <a
              href={a.submissionUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs font-bold text-brand-red hover:underline"
            >
              <ExternalLink size={13} /> Open Submitted Project / Link
            </a>
          )}
        </div>
      )}

      {/* Tutor Feedback Display */}
      {a.feedback && (
        <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Tutor Feedback & Remarks
            </p>
            {a.reviewedAt && (
              <span className="text-[11px] text-slate-500">
                Reviewed {formatDate(a.reviewedAt)}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {a.feedback}
          </p>
        </div>
      )}

      {/* Student Submission Form */}
      {canSubmit && (
        <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-5 space-y-3">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {a.status === 'RESUBMISSION_REQUIRED'
              ? 'Update and Resubmit Your Work'
              : 'Submit Your Completed Assignment'}
          </p>

          {a.submissionFormat !== 'LINK' && (
            <textarea
              rows={4}
              value={draft.text}
              onChange={(e) => onDraftChange({ text: e.target.value })}
              placeholder="Write your answer, explanation, code, or project summary here…"
              className="input resize-y"
            />
          )}

          {a.submissionFormat !== 'TEXT' && (
            <div className="space-y-2">
              <input
                type="url"
                value={draft.url}
                onChange={(e) =>
                  onDraftChange({ url: e.target.value, driveConfirmed: false })
                }
                placeholder="Project / Google Drive / Scratch / GitHub link (https://…)"
                className="input"
              />
              {draft.url.trim() && !linkValidation.valid && (
                <p className="text-xs font-semibold text-rose-600">{linkValidation.error}</p>
              )}
              {linkValidation.valid && linkValidation.isGoogleLink && (
                <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.driveConfirmed)}
                    onChange={(e) => onDraftChange({ driveConfirmed: e.target.checked })}
                    className="mt-0.5 rounded border-amber-400"
                  />
                  <span>
                    <strong>Google Drive / Docs Sharing Check:</strong> I have set the link permission to{' '}
                    <span className="underline font-bold">"Anyone with the link can view"</span> so my tutor can open and grade my work.
                  </span>
                </label>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={
              submitting ||
              (!draft.text.trim() && !draft.url.trim()) ||
              !linkValidation.valid ||
              (linkValidation.isGoogleLink && !draft.driveConfirmed)
            }
            onClick={onSubmit}
            className="btn-primary disabled:opacity-40 cursor-pointer"
          >
            <Send size={16} />
            {submitting ? 'Submitting…' : 'Submit Assignment'}
          </button>
        </div>
      )}
    </article>
  );
};

export default AssignmentCenter;
