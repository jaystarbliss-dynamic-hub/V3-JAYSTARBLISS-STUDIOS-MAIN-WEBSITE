import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  KeyRound,
  Loader2,
  Plus,
  Save,
  School,
  UserRound,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, getAllClientDatabases } from '../../lib/firebase';
import { academicApiWithFallback as api } from '../../lib/academicFallback';
import {
  formatNormalizedClassDisplay,
  normalizeClassName,
  normalizeWorkType,
  type AcademicWorkType,
} from '../../lib/classes';
import SEO from '../../components/ui/SEO';
import { DashboardGreeting } from '../../components/portal/DashboardGreeting';
import TutorLearningTracksManager from '../../components/portal/TutorLearningTracksManager';

type Student = {
  id: string;
  fullName: string;
  plan?: string;
  email?: string;
  username?: string;
  class?: string;
  schoolId?: string;
  schoolName?: string;
  parentName?: string;
  assignmentCategory?: 'school' | 'private';
};

type Attendance = { id: string; date?: string; status: string; notes?: string };

type LearnerAssessmentItem = {
  id: string;
  examId: string;
  title: string;
  subject: string;
  workType: AcademicWorkType;
  lifecycleState: 'active' | 'completed';
  attemptStatus: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'expired';
  score?: number;
  maxScore?: number;
  percentage?: number;
  resultReleased?: boolean;
  submittedAt?: string;
  dueDate?: string;
  feedback?: string;
};

const toIsoDateString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return '';
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return '';
};

const StaffStudentWorkspace: React.FC = () => {
  const { studentId = '' } = useParams();
  const location = useLocation();
  const assessmentsSectionRef = useRef<HTMLElement | null>(null);

  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [assessments, setAssessments] = useState<LearnerAssessmentItem[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentLifecycleFilter, setAssessmentLifecycleFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [assessmentTypeFilter, setAssessmentTypeFilter] = useState<'ALL' | AcademicWorkType>('ALL');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    status: 'PRESENT',
    notes: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const cleanId = studentId.replace(/^student_/, '');
        const [studentsData, attendanceData] = await Promise.all([
          api('/api/academic-students'),
          api(`/api/academic-attendance?studentId=${encodeURIComponent(studentId)}`),
        ]);
        let found: Student | undefined = (studentsData.students || []).find(
          (s: Student) => s.id === studentId || s.id === cleanId
        );

        // Fallback: direct Firestore lookup if studentId was navigated to directly
        if (!found && studentId) {
          for (const candidateId of [studentId, cleanId]) {
            for (const colName of ['individualStudents', 'students'] as const) {
              const snap = await getDoc(doc(db, colName, candidateId)).catch(() => null);
              if (snap?.exists()) {
                const d = snap.data() || {};
                const sId = String(d.schoolId || d.school_id || '').trim();
                found = {
                  id: snap.id,
                  fullName: d.fullName || d.studentName || d.name || 'Student',
                  username: d.username || snap.id,
                  email: d.email || d.parentEmail || '',
                  plan: d.plan || d.programName || d.track || 'Digital Literacy & Coding',
                  class: formatNormalizedClassDisplay(d.class || d.grade || d.className, 'Grade 1'),
                  schoolId: sId,
                  schoolName: d.schoolName || (sId ? 'Partner School' : ''),
                  parentName: d.parentName || '',
                  assignmentCategory: sId && sId !== 'private' ? 'school' : 'private',
                };
                break;
              }
            }
            if (found) break;
          }
        }

        if (!found) {
          throw new Error('Student profile could not be found.');
        }
        setStudent(found);
        setAttendance(attendanceData.records || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load student workspace.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [studentId]);

  // Load all assessments (Tests, Activities, Assignments, Examinations) assigned to or taken by this learner
  useEffect(() => {
    if (!student) return;
    let cancelled = false;

    const loadLearnerAssessments = async () => {
      setAssessmentsLoading(true);
      try {
        const cleanId = student.id.replace(/^student_/, '');
        const candidateStudentIds = new Set(
          [student.id, cleanId, `student_${cleanId}`, student.username]
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        );
        const studentNameLower = String(student.fullName || '').trim().toLowerCase();
        const studentSchoolId = String(student.schoolId || '').trim();
        const isPrivateLearner =
          student.assignmentCategory === 'private' || !studentSchoolId || studentSchoolId === 'private';
        const studentClassNorm = normalizeClassName(student.class || '');

        const dbs = getAllClientDatabases();
        const examMap = new Map<string, Record<string, any>>();
        const attemptByExamId = new Map<string, Record<string, any>>();

        for (const dbInstance of dbs) {
          const [jdiSnap, schoolExamsSnap, assignmentsSnap, attemptsSnap, submissionsSnap] =
            await Promise.all([
              getDocs(collection(dbInstance, 'jdiExams')).catch(() => ({ docs: [] } as any)),
              getDocs(collection(dbInstance, 'schoolExams')).catch(() => ({ docs: [] } as any)),
              getDocs(collection(dbInstance, 'assignments')).catch(() => ({ docs: [] } as any)),
              getDocs(collection(dbInstance, 'jdiExamAttempts')).catch(() => ({ docs: [] } as any)),
              getDocs(
                query(
                  collection(dbInstance, 'assignmentSubmissions'),
                  where('studentId', '==', student.id)
                )
              ).catch(() => ({ docs: [] } as any)),
            ]);

          [...schoolExamsSnap.docs, ...jdiSnap.docs].forEach((d: any) => {
            const data = d.data() || {};
            if (String(data.status || '').toLowerCase() === 'archived') return;
            examMap.set(d.id, { id: d.id, ...data });
          });

          assignmentsSnap.docs.forEach((d: any) => {
            if (examMap.has(d.id)) return;
            const data = d.data() || {};
            examMap.set(d.id, {
              id: d.id,
              title: data.title || 'Coursework Assignment',
              subject: data.subject || data.programName || 'Technology & Digital Skills',
              workType: data.workType || data.activityType || 'ASSIGNMENT',
              status: String(data.status || 'active').toLowerCase() === 'draft' ? 'draft' : 'active',
              schoolId: data.schoolId || '',
              targetClass: data.targetClass || data.className || '',
              targetSchoolIds: Array.isArray(data.targetSchoolIds) ? data.targetSchoolIds : [],
              targetStudentIds: Array.isArray(data.targetStudentIds)
                ? data.targetStudentIds
                : data.studentId
                ? [data.studentId]
                : [],
              recipientMode: data.recipientMode || (data.studentId ? 'PRIVATE_LEARNERS' : 'SCHOOL_CLASS'),
              maxScore: Number(data.maxMarks || data.maxScore || 100),
              dueDate: data.dueDate || null,
              createdAt: data.createdAt,
            });
          });

          attemptsSnap.docs.forEach((d: any) => {
            const at = d.data() || {};
            const atStudentId = String(at.studentId || at.studentUid || '').trim();
            const atStudentName = String(at.studentName || '').trim().toLowerCase();
            const matchesId = atStudentId && candidateStudentIds.has(atStudentId);
            const matchesNameAndSchool =
              !matchesId &&
              studentNameLower &&
              atStudentName === studentNameLower &&
              (!studentSchoolId || !at.schoolId || String(at.schoolId).trim() === studentSchoolId);

            if (!matchesId && !matchesNameAndSchool) return;
            const exId = String(at.examId || d.id).trim();
            const prev = attemptByExamId.get(exId);
            if (!prev || ['graded', 'submitted', 'completed'].includes(String(at.status || ''))) {
              attemptByExamId.set(exId, { id: d.id, ...at, examId: exId });
            }
          });

          submissionsSnap.docs.forEach((d: any) => {
            const sub = d.data() || {};
            const exId = String(sub.assignmentId || sub.examId || '').trim();
            if (!exId || attemptByExamId.has(exId)) return;
            attemptByExamId.set(exId, {
              id: d.id,
              examId: exId,
              studentId: student.id,
              status: sub.score !== undefined ? 'graded' : 'submitted',
              score: sub.score,
              maxScore: sub.maxMarks || 100,
              percentage:
                sub.score !== undefined && sub.maxMarks
                  ? Math.round((Number(sub.score) / Number(sub.maxMarks)) * 100)
                  : undefined,
              submittedAt: sub.submittedAt || sub.updatedAt || sub.createdAt,
              feedback: sub.feedback || '',
            });
          });
        }

        const results: LearnerAssessmentItem[] = [];
        const processedExamIds = new Set<string>();

        // 1. Evaluate all known exams/assignments to see if targeted to this learner OR attempted by this learner
        for (const [examId, ex] of examMap.entries()) {
          if (String(ex.status || '').toLowerCase() === 'draft') continue;

          const attempt = attemptByExamId.get(examId);
          const targetStudents: string[] = Array.isArray(ex.targetStudentIds)
            ? ex.targetStudentIds.map((x: any) => String(x).trim())
            : [];
          const targetSchools: string[] = Array.isArray(ex.targetSchoolIds)
            ? ex.targetSchoolIds.map((x: any) => String(x).trim())
            : ex.schoolId && ex.schoolId !== 'private'
            ? [String(ex.schoolId).trim()]
            : [];

          const explicitlyTargetedToStudent = targetStudents.some((id) => candidateStudentIds.has(id));
          let targetedByCohort = false;

          if (!explicitlyTargetedToStudent) {
            if (isPrivateLearner) {
              if (
                ex.recipientMode === 'PRIVATE_LEARNERS' &&
                targetStudents.length === 0
              ) {
                targetedByCohort = true;
              }
            } else if (studentSchoolId) {
              const schoolMatches =
                targetSchools.includes(studentSchoolId) ||
                String(ex.schoolId || '').trim() === studentSchoolId;
              if (schoolMatches && targetStudents.length === 0) {
                const exClass = normalizeClassName(ex.targetClass || ex.className || '');
                const exClasses = Array.isArray(ex.classIds)
                  ? ex.classIds.map((c: any) => normalizeClassName(String(c)))
                  : [];
                if (
                  !exClass ||
                  exClass.toLowerCase() === 'all' ||
                  !studentClassNorm ||
                  exClass === studentClassNorm ||
                  exClasses.includes(studentClassNorm)
                ) {
                  targetedByCohort = true;
                }
              }
            }
          }

          if (!attempt && !explicitlyTargetedToStudent && !targetedByCohort) {
            continue;
          }

          processedExamIds.add(examId);
          const rawAttemptStatus = String(attempt?.status || '').toLowerCase();
          const attemptStatus: LearnerAssessmentItem['attemptStatus'] = !attempt
            ? 'not_started'
            : rawAttemptStatus === 'graded' || attempt.resultReleased
            ? 'graded'
            : rawAttemptStatus === 'submitted' || rawAttemptStatus === 'completed'
            ? 'submitted'
            : rawAttemptStatus === 'expired'
            ? 'expired'
            : 'in_progress';

          const untilStr = toIsoDateString(ex.availableUntil || ex.dueDate);
          const isPastDeadline =
            Boolean(untilStr) &&
            Number.isFinite(new Date(untilStr).getTime()) &&
            new Date(untilStr).getTime() < Date.now();

          const lifecycleState: 'active' | 'completed' =
            ['submitted', 'graded', 'expired'].includes(attemptStatus) ||
            String(ex.status || '').toLowerCase() === 'completed' ||
            isPastDeadline
              ? 'completed'
              : 'active';

          results.push({
            id: attempt?.id || examId,
            examId,
            title: String(ex.title || 'Untitled Assessment'),
            subject: String(ex.subject || ex.programTitle || 'General'),
            workType: normalizeWorkType(ex.workType, ex),
            lifecycleState,
            attemptStatus,
            score: attempt?.score !== undefined ? Number(attempt.score) : undefined,
            maxScore:
              attempt?.maxScore !== undefined
                ? Number(attempt.maxScore)
                : ex.maxScore !== undefined
                ? Number(ex.maxScore)
                : undefined,
            percentage:
              attempt?.percentage !== undefined ? Number(attempt.percentage) : undefined,
            resultReleased: Boolean(attempt?.resultReleased),
            submittedAt: toIsoDateString(attempt?.submittedAt || attempt?.updatedAt || ex.updatedAt),
            dueDate: untilStr,
            feedback: String(attempt?.feedback || attempt?.tutorFeedback || ''),
          });
        }

        // 2. Include any historical attempts whose exam definition wasn't in examMap
        for (const [examId, attempt] of attemptByExamId.entries()) {
          if (processedExamIds.has(examId)) continue;
          const rawAttemptStatus = String(attempt.status || 'submitted').toLowerCase();
          const attemptStatus: LearnerAssessmentItem['attemptStatus'] =
            rawAttemptStatus === 'graded' || attempt.resultReleased
              ? 'graded'
              : rawAttemptStatus === 'in_progress'
              ? 'in_progress'
              : rawAttemptStatus === 'expired'
              ? 'expired'
              : 'submitted';

          results.push({
            id: attempt.id || examId,
            examId,
            title: String(attempt.examTitle || attempt.title || 'Completed Assessment'),
            subject: String(attempt.subject || 'Digital Literacy'),
            workType: normalizeWorkType(attempt.workType, attempt),
            lifecycleState: attemptStatus === 'in_progress' ? 'active' : 'completed',
            attemptStatus,
            score: attempt.score !== undefined ? Number(attempt.score) : undefined,
            maxScore: attempt.maxScore !== undefined ? Number(attempt.maxScore) : undefined,
            percentage: attempt.percentage !== undefined ? Number(attempt.percentage) : undefined,
            resultReleased: Boolean(attempt.resultReleased),
            submittedAt: toIsoDateString(attempt.submittedAt || attempt.startedAt),
            feedback: String(attempt.feedback || attempt.tutorFeedback || ''),
          });
        }

        results.sort((a, b) => {
          if (a.lifecycleState !== b.lifecycleState) {
            return a.lifecycleState === 'active' ? -1 : 1;
          }
          return String(b.submittedAt || b.dueDate || '').localeCompare(
            String(a.submittedAt || a.dueDate || '')
          );
        });

        if (!cancelled) {
          setAssessments(results);
        }
      } catch (err) {
        console.warn('Error loading learner assessments:', err);
      } finally {
        if (!cancelled) {
          setAssessmentsLoading(false);
        }
      }
    };

    void loadLearnerAssessments();
    return () => {
      cancelled = true;
    };
  }, [student]);

  useEffect(() => {
    if (
      !loading &&
      (location.hash === '#assessments' ||
        new URLSearchParams(location.search).get('tab') === 'assessments')
    ) {
      assessmentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, location.hash, location.search]);

  const rate = useMemo(() => {
    if (!attendance.length) return null;
    const attended = attendance.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).length;
    return Math.round((attended / attendance.length) * 100);
  }, [attendance]);

  const filteredAssessments = useMemo(() => {
    return assessments.filter((item) => {
      if (assessmentLifecycleFilter === 'ACTIVE' && item.lifecycleState !== 'active') return false;
      if (assessmentLifecycleFilter === 'COMPLETED' && item.lifecycleState !== 'completed')
        return false;
      if (assessmentTypeFilter !== 'ALL' && item.workType !== assessmentTypeFilter) return false;
      return true;
    });
  }, [assessments, assessmentLifecycleFilter, assessmentTypeFilter]);

  const activeAssessmentsCount = useMemo(
    () => assessments.filter((a) => a.lifecycleState === 'active').length,
    [assessments]
  );
  const completedAssessmentsCount = useMemo(
    () => assessments.filter((a) => a.lifecycleState === 'completed').length,
    [assessments]
  );

  const saveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const targetId = student?.id || studentId;
      await api('/api/academic-attendance', {
        method: 'POST',
        body: JSON.stringify({ studentId: targetId, ...form }),
      });
      setSuccess('Attendance saved.');
      const data = await api(`/api/academic-attendance?studentId=${encodeURIComponent(targetId)}`);
      setAttendance(data.records || []);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="py-12 flex justify-center text-sm text-slate-500">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading student workspace…
      </div>
    );
  if (!student)
    return (
      <div className="py-12 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-3" size={32} />
        <p className="font-bold">{error || 'Student not found.'}</p>
        <Link to="/portal/staff/students" className="text-sm text-brand-red font-bold mt-3 inline-block">
          Return to Assigned Learners Roster
        </Link>
      </div>
    );

  const isSchoolAssigned =
    student.assignmentCategory === 'school' ||
    Boolean(student.schoolId && student.schoolId !== 'private');

  const createAssessmentForLearnerUrl = `/portal/staff/assessments?create=true&createForStudentId=${encodeURIComponent(
    student.id
  )}&studentName=${encodeURIComponent(student.fullName)}&schoolId=${encodeURIComponent(
    isSchoolAssigned ? student.schoolId || '' : 'private'
  )}&className=${encodeURIComponent(student.class || 'Grade 1')}`;

  return (
    <div className="space-y-6">
      <SEO
        title={`${student.fullName} | Tutor Workspace`}
        description="Assigned student learning workspace."
        noindex={true}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/portal/staff/students"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-brand-red"
        >
          <ArrowLeft size={15} /> Back to Assigned Learners Roster
        </Link>
        {isSchoolAssigned ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <School size={13} />
            <span>School-Assigned Student · {student.schoolName || 'Partner School'}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <UserRound size={13} />
            <span>
              Private Learner{student.parentName ? ` · Parent: ${student.parentName}` : ''}
            </span>
          </span>
        )}
      </div>

      <DashboardGreeting
        name={student.fullName}
        role="Assigned Student Workspace"
        subtitle={`${student.class ? `${student.class} • ` : ''}${
          student.plan || 'Learning track'
        } • Manage academic activity, assessments, attendance and learning progress.`}
      />

      {success && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 flex items-center gap-3">
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-3">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="pro-surface rounded-2xl p-5">
          <UserRound size={18} />
          <p className="text-xs text-slate-500 mt-3">Learner Profile</p>
          <p className="font-black text-slate-900 dark:text-white mt-1">{student.fullName}</p>
          <p className="text-xs text-slate-500">
            @{student.username || 'student'} {student.class ? `• ${student.class}` : ''}
          </p>
        </div>
        <div className="pro-surface rounded-2xl p-5">
          <CalendarCheck size={18} />
          <p className="text-xs text-slate-500 mt-3">Attendance Rate</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {rate == null ? '—' : `${rate}%`}
          </p>
        </div>
        <div className="pro-surface rounded-2xl p-5">
          <ClipboardList size={18} />
          <p className="text-xs text-slate-500 mt-3">Academic Tools</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() =>
                assessmentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="text-xs font-bold text-brand-red hover:underline cursor-pointer"
            >
              Assessments ({assessments.length})
            </button>
            <span className="text-slate-300">•</span>
            <Link
              to={`/portal/staff/milestones?studentId=${student.id}`}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Milestones
            </Link>
            <span className="text-slate-300">•</span>
            <Link
              to="/portal/staff/credentials"
              className="text-xs font-bold text-slate-700 dark:text-slate-300 hover:underline"
            >
              Access Pass
            </Link>
          </div>
        </div>
      </div>

      {/* INLINE LEARNER ASSESSMENTS SECTION */}
      <section
        ref={assessmentsSectionRef}
        id="learner-assessments-section"
        className="pro-surface rounded-3xl p-5 sm:p-6 space-y-5 border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Learner Assessments &amp; Coursework
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                All active and completed tests, examinations, activities, and assignments for{' '}
                <strong className="text-slate-700 dark:text-slate-200">{student.fullName}</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              to={createAssessmentForLearnerUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-red hover:bg-red-700 text-white px-4 py-2.5 text-xs font-black shadow-xs transition-colors"
            >
              <Plus size={15} />
              <span>Create Assessment for {student.fullName.split(' ')[0]}</span>
            </Link>
          </div>
        </div>

        {/* Filter Bar: Lifecycle (All / Active / Completed) + Work Type */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setAssessmentLifecycleFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                assessmentLifecycleFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All ({assessments.length})
            </button>
            <button
              type="button"
              onClick={() => setAssessmentLifecycleFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                assessmentLifecycleFilter === 'ACTIVE'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Active ({activeAssessmentsCount})
            </button>
            <button
              type="button"
              onClick={() => setAssessmentLifecycleFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                assessmentLifecycleFilter === 'COMPLETED'
                  ? 'bg-brand-red text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Completed ({completedAssessmentsCount})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['ALL', 'All Types'],
                ['TEST', 'Tests'],
                ['EXAMINATION', 'Exams'],
                ['ACTIVITY', 'Activities'],
                ['ASSIGNMENT', 'Assignments'],
              ] as const
            ).map(([typeKey, labelText]) => (
              <button
                key={typeKey}
                type="button"
                onClick={() => setAssessmentTypeFilter(typeKey)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  assessmentTypeFilter === typeKey
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {labelText}
              </button>
            ))}
          </div>
        </div>

        {/* Assessments List */}
        {assessmentsLoading ? (
          <div className="py-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            <span>Loading assessments for {student.fullName}…</span>
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
            <FileText size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                No assessments match this filter for {student.fullName}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Create a test, activity, assignment, or examination targeted directly to this learner.
              </p>
            </div>
            <Link
              to={createAssessmentForLearnerUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold shadow-xs"
            >
              <Plus size={14} />
              <span>Create Assessment for Learner</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredAssessments.map((item) => {
              const isCompleted = item.lifecycleState === 'completed';
              const hasScore = item.score !== undefined && item.maxScore !== undefined && item.maxScore > 0;
              return (
                <div
                  key={`${item.examId}-${item.id}`}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-red/10 text-brand-red">
                        {item.workType}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          isCompleted
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {item.attemptStatus === 'graded'
                          ? 'Completed · Graded'
                          : item.attemptStatus === 'submitted'
                          ? 'Completed · Submitted'
                          : item.attemptStatus === 'in_progress'
                          ? 'Active · In Progress'
                          : item.lifecycleState === 'completed'
                          ? 'Completed'
                          : 'Active · Assigned'}
                      </span>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {item.title}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{item.subject}</span>
                      {item.submittedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(item.submittedAt).toLocaleDateString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                      {item.feedback && (
                        <span className="text-slate-600 dark:text-slate-300 italic truncate max-w-xs">
                          &ldquo;{item.feedback}&rdquo;
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {hasScore ? (
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900 dark:text-white font-mono tabular-nums">
                          {item.score}/{item.maxScore}
                          {item.percentage !== undefined ? ` (${Math.round(item.percentage)}%)` : ''}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          {item.resultReleased ? 'Result Released' : 'Recorded Score'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        {item.attemptStatus === 'not_started' ? 'Awaiting Attempt' : 'Pending Grade'}
                      </span>
                    )}

                    <Link
                      to="/portal/staff/assessments"
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-blue-600 hover:text-blue-600 transition-colors"
                    >
                      <span>Open</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <TutorLearningTracksManager studentId={student.id} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="pro-surface rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center">
              <CalendarCheck size={19} />
            </div>
            <div>
              <h2 className="font-black">Record attendance</h2>
              <p className="text-xs text-slate-500">One attendance record per learner per date.</p>
            </div>
          </div>
          <form onSubmit={saveAttendance} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-bold mb-1.5">Class date</span>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold mb-1.5">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="input"
              >
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="ABSENT">Absent</option>
                <option value="EXCUSED">Excused</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-bold mb-1.5">Notes (optional)</span>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional attendance note"
                className="input resize-y"
              />
            </label>
            <button disabled={saving} className="btn-primary">
              <Save size={16} />
              {saving ? 'Saving…' : 'Save attendance'}
            </button>
          </form>
        </section>
        <section className="pro-surface rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <BookOpen size={19} />
            </div>
            <div>
              <h2 className="font-black">Recent attendance</h2>
              <p className="text-xs text-slate-500">
                The learner and parent can view this attendance history.
              </p>
            </div>
          </div>
          {attendance.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No attendance records yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {attendance.slice(0, 20).map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {a.date ? new Date(a.date).toLocaleDateString('en-NG') : '—'}
                    </p>
                    {a.notes && <p className="text-xs text-slate-500 mt-1">{a.notes}</p>}
                  </div>
                  <span className="text-[10px] font-black uppercase rounded-full border px-2 py-1">
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="pro-surface rounded-2xl p-5 flex flex-wrap gap-3">
        <Link
          to={createAssessmentForLearnerUrl}
          className="min-h-11 rounded-xl bg-brand-red hover:bg-red-700 text-white px-4 inline-flex items-center gap-2 text-xs font-bold"
        >
          <Plus size={15} /> Create Assessment for Learner
        </Link>
        <button
          type="button"
          onClick={() =>
            assessmentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          className="min-h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 inline-flex items-center gap-2 text-xs font-bold cursor-pointer"
        >
          <ClipboardList size={15} /> Assessments ({assessments.length})
        </button>
        <Link
          to={`/portal/staff/milestones?studentId=${student.id}`}
          className="min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-4 inline-flex items-center gap-2 text-xs font-bold"
        >
          <Flag size={15} /> Manage milestones
        </Link>
        <Link
          to="/portal/staff/credentials"
          className="min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-4 inline-flex items-center gap-2 text-xs font-bold"
        >
          <KeyRound size={15} /> Student Access Code
        </Link>
      </div>
    </div>
  );
};

export default StaffStudentWorkspace;
