import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  limit,
  setDoc,
  doc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  GraduationCap,
  PlusCircle,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Calendar,
  ExternalLink,
  Clock,
  User,
  Headphones,
  KeyRound,
  Copy,
  BarChart3,
  BookOpen,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Legend,
  Cell,
} from 'recharts';
import SEO from '../../components/ui/SEO';
import DashboardGreeting from '../../components/portal/DashboardGreeting';
import { useToast } from '../../contexts/ToastContext';
import { FintechTransactionDetailsModal } from '../../components/portal/FintechTransactionDetailsModal';
import type { TransactionReceiptData } from '../../lib/receiptGenerator';
import { getEffectiveAuth } from '../../utils/impersonation';
import { CANONICAL_CLASSES, formatNormalizedClassDisplay, normalizeClassName } from '../../lib/classes';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';
import {
  type StudentEnrollmentContext,
  doesScheduleMatchStudent,
  validateMeetingLink,
} from '../../lib/scheduleEngine';
import { ParentLearningTracks } from '../../components/portal/ParentLearningTracks';
import ProgramHierarchySelector from '../../components/admin/ProgramHierarchySelector';
import {
  type ProgramRecord,
  type ProgramDeliveryOption,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
} from '../../lib/programHierarchy';
import {
  type UnifiedAssessmentQuizRecord,
  type UnifiedAssignmentRecord,
  resolveParentLinkedChildren,
  fetchAssessmentsAndQuizzesForParent,
  fetchAssignmentsForParent,
} from '../../lib/academicSyncEngine';

interface ChildRecord {
  id: string;
  fullName?: string;
  name?: string;
  username?: string;
  email?: string;
  accessCode?: string;
  track?: string;
  subjects?: string[] | string;
  schedule?: string;
  grade?: string;
  class?: string;
  plan?: string;
  programTitle?: string;
  programName?: string;
  tuitionFee?: number;
  fee?: number;
  paymentStatus?: string;
  status?: string;
  tutorName?: string;
  tutorId?: string;
  mentorName?: string;
  meetingLink?: string;
}

interface ProgressRecord {
  completed: number;
  total: number;
}

const BRAND_NAVY = '#1E293B';
const BRAND_CRIMSON = '#B91C1C';
const BRAND_SLATE = '#64748B';
const BRAND_SLATE_MUTED = '#CBD5E1';

const parseTimestamp = (val: unknown): Date | null => {
  if (!val) return null;
  if (typeof (val as any)?.toDate === 'function') {
    try {
      const d = (val as any).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  const d = new Date(val as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateShort = (val: unknown): string => {
  const d = parseTimestamp(val);
  if (!d) return '—';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ParentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [childProgress, setChildProgress] = useState<Record<string, ProgressRecord>>({});
  const [schedules, setSchedules] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<UnifiedAssessmentQuizRecord[]>([]);
  const [assignments, setAssignments] = useState<UnifiedAssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const [analyticsChildId, setAnalyticsChildId] = useState<string>('all');

  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentAge, setStudentAge] = useState<string>('Grade 1');
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [deliveryType, setDeliveryType] = useState<ProgramDeliveryOption>('PUBLIC_GROUP');
  const [selectedPlan] = useState('');
  const [preferredSubjects, setPreferredSubjects] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [enrollSuccess, setEnrollSuccess] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [selectedTx, setSelectedTx] = useState<TransactionReceiptData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchParentData = async () => {
      setLoading(true);
      setEnrollError('');
      void migrateAllFirestoreClasses().catch(() => undefined);
      try {
        const effective = getEffectiveAuth();
        const user = auth.currentUser;
        if (!user && !effective.isMasquerading) return;
        const userEmail = (effective.effectiveEmail || user?.email || '').toLowerCase();
        const userUid = effective.effectiveUid || user?.uid || '';
        const allStudentsMap = new Map<string, ChildRecord>();
        const studentIdentityKey = (studentDoc: any, data: any) =>
          String(
            data.linkedStudentId ||
              data.studentDocId ||
              data.firebaseUid ||
              data.studentUid ||
              data.username ||
              data.accessCode ||
              data.email ||
              data.parentChildId ||
              studentDoc.id
          )
            .trim()
            .toLowerCase();

        const addStudentRecord = (docId: string, data: any) => {
          const targetId = String(data.linkedStudentId || data.studentDocId || docId).trim();
          const key = studentIdentityKey({ id: targetId }, data);
          const existing = allStudentsMap.get(key);
          if (
            !existing ||
            (String(data.status || '').toLowerCase() === 'active' &&
              String(existing.status || '').toLowerCase() !== 'active')
          ) {
            const normalizedClass = formatNormalizedClassDisplay(
              data.class || data.grade || data.studentAge,
              ''
            );
            allStudentsMap.set(key, {
              ...(existing || {}),
              id: targetId,
              ...data,
              ...(normalizedClass ? { class: normalizedClass, grade: normalizedClass } : {}),
            } as ChildRecord);
          }
        };

        const collectChildren = (snap: any) => {
          snap.forEach((studentDoc: any) => {
            const data = studentDoc.data();
            const matchesParent =
              data.parentId === userUid ||
              data.parentUid === userUid ||
              data.parentId === userEmail ||
              data.parentEmail?.toLowerCase() === userEmail;
            if (!matchesParent) return;
            addStudentRecord(studentDoc.id, data);
          });
        };

        if (userUid) {
          try {
            collectChildren(
              await getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', userUid)))
            );
          } catch (error) {
            console.warn('individualStudents parent lookup failed:', error);
          }
          try {
            collectChildren(
              await getDocs(query(collection(db, 'students'), where('parentId', '==', userUid)))
            );
          } catch (error) {
            console.warn('students parent lookup failed:', error);
          }

          try {
            const [pSnap, uSnap] = await Promise.all([
              getDoc(doc(db, 'parents', userUid)).catch(() => null),
              getDoc(doc(db, 'users', userUid)).catch(() => null),
            ]);
            const childIdSet = new Set<string>();
            if (pSnap?.exists() && Array.isArray(pSnap.data()?.children)) {
              pSnap.data()!.children.forEach((cid: any) => {
                if (cid) childIdSet.add(String(cid).trim());
              });
            }
            if (uSnap?.exists() && Array.isArray(uSnap.data()?.children)) {
              uSnap.data()!.children.forEach((cid: any) => {
                if (cid) childIdSet.add(String(cid).trim());
              });
            }
            for (const cid of Array.from(childIdSet)) {
              const indivDoc = await getDoc(doc(db, 'individualStudents', cid)).catch(() => null);
              if (indivDoc?.exists()) {
                addStudentRecord(indivDoc.id, indivDoc.data());
              } else {
                const studDoc = await getDoc(doc(db, 'students', cid)).catch(() => null);
                if (studDoc?.exists()) {
                  addStudentRecord(studDoc.id, studDoc.data());
                }
              }
            }
          } catch (err) {
            console.warn('Parent children array lookup notice:', err);
          }
        }

        if (userEmail) {
          try {
            collectChildren(
              await getDocs(query(collection(db, 'individualStudents'), where('parentEmail', '==', userEmail)))
            );
          } catch (error) {
            console.warn('individualStudents parent email lookup failed:', error);
          }
          try {
            collectChildren(
              await getDocs(query(collection(db, 'students'), where('parentEmail', '==', userEmail)))
            );
          } catch (error) {
            console.warn('students parent email lookup failed:', error);
          }
          try {
            collectChildren(
              await getDocs(
                query(collection(db, 'enrollment_requests'), where('parentEmail', '==', userEmail))
              )
            );
          } catch (error) {
            console.warn('enrollment_requests parent email lookup failed:', error);
          }
        }

        if (cancelled) return;
        const childList = Array.from(allStudentsMap.values());
        setChildren(childList);
        if (childList.length === 1) {
          setExpandedChildId(childList[0].id);
        }

        const [paymentResult, enrollmentResult, schedSnap, linkedProfiles] = await Promise.allSettled([
          getDocs(query(collection(db, 'payments'), where('parentId', '==', userUid), limit(50))),
          getDocs(query(collection(db, 'enrollment_requests'), where('parentId', '==', userUid), limit(25))),
          getDocs(collection(db, 'classSchedules')),
          resolveParentLinkedChildren(userUid, userEmail),
        ]);

        const fullProgMap = await fetchAllProgramsMap().catch(() => new Map<string, ProgramRecord>());
        if (!cancelled) setProgramsMap(fullProgMap);

        if (paymentResult.status === 'fulfilled') {
          setPayments(
            paymentResult.value.docs
              .map((paymentDoc) => ({ id: paymentDoc.id, ...paymentDoc.data() }))
              .filter(
                (payment: any) =>
                  payment.parentId === userUid ||
                  payment.parentId === userEmail ||
                  payment.parentEmail === userEmail
              )
          );
        } else {
          console.warn('Payment lookup failed:', paymentResult.reason);
          setPayments([]);
        }

        if (enrollmentResult.status === 'fulfilled') {
          setEnrollments(
            enrollmentResult.value.docs.map((enrollmentDoc) => ({
              id: enrollmentDoc.id,
              ...enrollmentDoc.data(),
            }))
          );
        } else {
          console.warn('Enrollment lookup failed:', enrollmentResult.reason);
          setEnrollments([]);
        }

        if (schedSnap.status === 'fulfilled') {
          const allScheds = schedSnap.value.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          const childContexts: StudentEnrollmentContext[] = childList.map((c) => {
            const cAny = c as any;
            const cSchoolId = String(cAny.schoolId || '').trim();
            const cSchoolName = String(cAny.schoolName || cAny.school || '').trim();
            const cProgNames = new Set<string>(
              [c.programName, c.programTitle, c.plan, c.track]
                .map((v) => String(v || '').trim().toLowerCase())
                .filter(Boolean)
            );
            if (Array.isArray(c.subjects)) {
              c.subjects.forEach((s) => {
                if (s) cProgNames.add(String(s).trim().toLowerCase());
              });
            }
            return {
              ids: new Set(
                [c.id, cAny.linkedStudentId, cAny.studentDocId, cAny.firebaseUid]
                  .filter(Boolean)
                  .map(String)
              ),
              emails: new Set([c.email].filter(Boolean).map((v) => String(v).trim().toLowerCase())),
              names: new Set([c.fullName, c.name].filter(Boolean).map((v) => String(v).trim().toLowerCase())),
              isSchoolStudent: Boolean(cSchoolId || cSchoolName),
              schoolId: cSchoolId,
              schoolName: cSchoolName,
              className: String(c.class || c.grade || 'Grade 1'),
              programIds: new Set([cAny.programId].filter(Boolean).map((v) => String(v).trim().toLowerCase())),
              programNames: cProgNames,
              parentIds: new Set([userUid].filter(Boolean)),
              parentEmails: new Set([userEmail].filter(Boolean)),
            };
          });
          const parentScheds = allScheds.filter((s: any) => {
            if (userUid && (s.parentId === userUid || s.parentId === userEmail)) return true;
            if (userEmail && s.parentEmail && s.parentEmail.toLowerCase() === userEmail) return true;
            return childContexts.some((ctx) => doesScheduleMatchStudent(s, ctx));
          });
          setSchedules(parentScheds);
        } else {
          setSchedules([]);
        }

        const progressResults = await Promise.allSettled(
          childList.map(async (child) => {
            const snap = await getDocs(
              query(collection(db, 'studentModules'), where('studentId', '==', child.id), limit(50))
            );
            let completed = 0;
            snap.forEach((moduleDoc) => {
              if (moduleDoc.data().completed) completed += 1;
            });
            return [child.id, { completed, total: snap.size }] as const;
          })
        );

        if (!cancelled) {
          const progressMap: Record<string, ProgressRecord> = {};
          progressResults.forEach((result) => {
            if (result.status === 'fulfilled') progressMap[result.value[0]] = result.value[1];
          });
          setChildProgress(progressMap);
        }

        if (linkedProfiles.status === 'fulfilled' && linkedProfiles.value.length > 0) {
          const [assessRes, assignRes] = await Promise.allSettled([
            fetchAssessmentsAndQuizzesForParent(linkedProfiles.value),
            fetchAssignmentsForParent(linkedProfiles.value),
          ]);
          if (!cancelled) {
            if (assessRes.status === 'fulfilled') setAssessments(assessRes.value);
            if (assignRes.status === 'fulfilled') setAssignments(assignRes.value);
          }
        }
      } catch (error) {
        console.error('Error loading parent dashboard:', error);
        if (!cancelled) setEnrollError('Some parent portal data could not be loaded. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchParentData();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingEnrollmentCount = useMemo(
    () => enrollments.filter((item) => String(item.status || '').toLowerCase() === 'pending').length,
    [enrollments]
  );

  // Module completion chart data (only real records, zero fabricated points)
  const moduleComparisonData = useMemo(() => {
    const filtered =
      analyticsChildId === 'all'
        ? children
        : children.filter((c) => c.id === analyticsChildId);
    return filtered
      .map((child) => {
        const prog = childProgress[child.id];
        if (!prog || prog.total === 0) return null;
        return {
          name: (child.fullName || child.name || 'Student').split(' ').slice(0, 2).join(' '),
          completed: prog.completed,
          remaining: Math.max(0, prog.total - prog.completed),
          total: prog.total,
          pct: Math.round((prog.completed / prog.total) * 100),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [children, childProgress, analyticsChildId]);

  // Released assessment trends (authorized & released only)
  const releasedAssessmentSeries = useMemo(() => {
    return assessments
      .filter((item) => {
        if (!item.resultReleased || typeof item.percentage !== 'number') return false;
        if (analyticsChildId === 'all') return true;
        return item.studentId === analyticsChildId;
      })
      .map((item) => ({
        dateMs: new Date(item.releasedAt || item.submittedAt || item.assignedDate || 0).getTime() || 0,
        label: item.title.length > 18 ? `${item.title.slice(0, 18)}…` : item.title,
        fullTitle: item.title,
        studentName: item.studentName,
        percentage: item.percentage as number,
        dateDisplay: formatDateShort(item.releasedAt || item.submittedAt),
      }))
      .sort((a, b) => a.dateMs - b.dateMs)
      .slice(-10);
  }, [assessments, analyticsChildId]);

  // Activity status summary from real unified assignments & assessments
  const activityStatusData = useMemo(() => {
    const filterByChild = (sid: string) => analyticsChildId === 'all' || sid === analyticsChildId;
    let completed = 0;
    let awaiting = 0;
    let pending = 0;

    assignments.forEach((a) => {
      if (!filterByChild(a.studentId)) return;
      if (a.displayStatus === 'COMPLETED' || a.displayStatus === 'GRADED') completed += 1;
      else if (a.displayStatus === 'SUBMITTED') awaiting += 1;
      else pending += 1;
    });

    assessments.forEach((q) => {
      if (!filterByChild(q.studentId)) return;
      if (q.lifecycleStatus === 'GRADED' || q.lifecycleStatus === 'COMPLETED') completed += 1;
      else if (q.lifecycleStatus === 'AWAITING_GRADING') awaiting += 1;
      else pending += 1;
    });

    const total = completed + awaiting + pending;
    if (total === 0) return [];
    return [
      { status: 'Completed / Graded', count: completed, fill: BRAND_NAVY },
      { status: 'Submitted / Review', count: awaiting, fill: BRAND_SLATE },
      { status: 'Upcoming / Pending', count: pending, fill: BRAND_CRIMSON },
    ];
  }, [assignments, assessments, analyticsChildId]);

  // Chronological agenda grouping for schedules
  const groupedSchedules = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);

    const active = schedules
      .filter((s) => String(s.status || '').toLowerCase() !== 'rescheduled')
      .sort(
        (a, b) =>
          String(a.date || '').localeCompare(String(b.date || '')) ||
          String(a.startTime || '').localeCompare(String(b.startTime || ''))
      );

    const groups: { key: string; label: string; items: any[] }[] = [
      { key: 'today', label: 'Today', items: [] },
      { key: 'tomorrow', label: 'Tomorrow', items: [] },
      { key: 'week', label: 'Upcoming This Week', items: [] },
      { key: 'later', label: 'Later & Weekly Sessions', items: [] },
    ];

    active.forEach((sched) => {
      const dateStr = String(sched.date || '').slice(0, 10);
      if (dateStr === todayKey) groups[0].items.push(sched);
      else if (dateStr === tomorrowKey) groups[1].items.push(sched);
      else if (dateStr && dateStr > tomorrowKey && dateStr <= weekEndKey) groups[2].items.push(sched);
      else groups[3].items.push(sched);
    });

    return groups.filter((g) => g.items.length > 0);
  }, [schedules]);

  const handleEnrollSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setEnrollSuccess('');
    setEnrollError('');
    const trimmedName = studentName.trim();
    const trimmedAge = normalizeClassName(studentAge.trim(), 'Grade 1');
    const subjects = preferredSubjects
      .split(',')
      .map((subject) => subject.trim())
      .filter(Boolean);
    const programPaths = selectedProgramIds.map((pid) => {
      const crumbs = getProgramBreadcrumbs(pid, programsMap);
      return crumbs.map((c) => c.title).join(' › ');
    });
    const effectivePlan =
      selectedPlan.trim() || (programPaths.length > 0 ? programPaths.join(', ') : '');
    const effectiveSubjects =
      subjects.length > 0
        ? subjects
        : selectedProgramIds.map((pid) => programsMap.get(pid)?.title || '').filter(Boolean);

    if (!trimmedName || !trimmedAge || (!effectivePlan && selectedProgramIds.length === 0)) {
      setEnrollError(
        'Please complete the student name, class/grade, and select at least one programme or sub-programme.'
      );
      setSubmitting(false);
      return;
    }
    try {
      const user = auth.currentUser;
      const effective = getEffectiveAuth();
      if (!user && !effective.isMasquerading) {
        throw new Error('Your parent session has expired. Please sign in again.');
      }

      const userUid = effective.effectiveUid || user?.uid || '';
      const userEmail = (effective.effectiveEmail || user?.email || '').toLowerCase();
      const parentName =
        sessionStorage.getItem('userName') ||
        user?.displayName ||
        userEmail.split('@')[0] ||
        'Parent';

      let requestCreated: any = null;

      if (user && !effective.isMasquerading) {
        const token = await user.getIdToken();
        const response = await fetch('/api/parent-enrollment-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            studentName: trimmedName,
            studentAge: trimmedAge,
            plan: effectivePlan,
            selectedProgramIds,
            programPaths,
            deliveryType,
            subjects: effectiveSubjects,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.request) {
          throw new Error(
            result.error || 'The enrollment service could not submit your request. Please try again.'
          );
        }
        requestCreated = result.request;
      }

      if (!requestCreated && effective.isMasquerading) {
        const reqRef = doc(collection(db, 'enrollment_requests'));
        const now = new Date();
        const docPayload = {
          studentName: trimmedName,
          studentAge: trimmedAge,
          studentClass: trimmedAge,
          class: trimmedAge,
          grade: trimmedAge,
          plan: effectivePlan,
          selectedProgramIds,
          assignedTrackIds: selectedProgramIds,
          programPaths,
          deliveryType,
          subjects: effectiveSubjects,
          parentId: userUid,
          parentEmail: userEmail,
          parentName,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: 'parent_portal',
        };

        await setDoc(reqRef, docPayload);
        requestCreated = { id: reqRef.id, ...docPayload, createdAt: now.toISOString() };

        await addDoc(collection(db, 'activityLogs'), {
          actorId: userUid,
          action: 'PARENT_ENROLLMENT_REQUEST_CREATED',
          targetId: reqRef.id,
          targetType: 'enrollment_request',
          timestamp: serverTimestamp(),
          metadata: { studentName: trimmedName, plan: selectedPlan, subjects, parentEmail: userEmail },
        }).catch(() => undefined);
      }

      setEnrollments((current) => [
        requestCreated,
        ...current.filter((e) => e.id !== requestCreated.id),
      ]);
      setEnrollSuccess(
        `Enrollment request submitted for ${trimmedName}. Admissions will review it, configure billing, assign a mentor, and schedule sessions.`
      );
      setStudentName('');
      setStudentAge('Grade 1');
      setPreferredSubjects('');
      setShowEnrollModal(false);
    } catch (error: any) {
      console.error('Enrollment request submission failed:', error);
      setEnrollError(error?.message || 'Could not submit the enrollment request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <SEO
        title="Parent Portal & Progress Dashboard"
        description="Monitor child progress, attendance, mentor assessments, and billing at Jaystarbliss Studios."
        noindex={true}
      />

      <DashboardGreeting role="Parent / Guardian" />

      {/* Compact Action Header Bar (replaces decorative hero banner) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Family Learning Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track linked learners, module milestones, upcoming classes, and enrollment requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowEnrollModal(true);
              setEnrollError('');
            }}
            className="min-h-10 px-4 py-2 rounded-lg bg-brand-red hover:bg-red-800 text-white text-xs font-bold transition-colors inline-flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red whitespace-nowrap"
          >
            <PlusCircle size={14} aria-hidden="true" />
            <span>Enroll New Child</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/portal/parent/support')}
            className="min-h-10 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Headphones size={14} aria-hidden="true" />
            <span>Support Desk</span>
          </button>
        </div>
      </div>

      {enrollSuccess && (
        <div
          className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-xs font-semibold text-slate-800 dark:text-slate-200"
          role="status"
        >
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-slate-900 dark:text-white" aria-hidden="true" />
          <span>{enrollSuccess}</span>
        </div>
      )}

      {enrollError && (
        <div
          className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 p-4 text-xs font-semibold text-brand-red dark:text-red-300"
          role="alert"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{enrollError}</span>
        </div>
      )}

      {/* Compact Institutional Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="p-4 sm:px-5">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Linked Children
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {children.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Verified learner profiles
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Pending Enrollments
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {pendingEnrollmentCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Awaiting admissions review
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Tuition Receipts
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {payments.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Confirmed payment records
          </p>
        </div>
      </div>

      {/* Expandable Enrolled Students Directory (Single-Expand Accordion) */}
      <section className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Enrolled Students
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select any student row to inspect access credentials, module completion, mentor, and tuition details.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowEnrollModal(true);
              setEnrollError('');
            }}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 px-3.5 text-xs font-bold text-white cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <PlusCircle size={14} aria-hidden="true" /> Add Student
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-28 items-center justify-center text-xs text-slate-500">
            Loading student records…
          </div>
        ) : children.length === 0 ? (
          <div className="p-5">
            <EmptyChildrenState onAdd={() => setShowEnrollModal(true)} />
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {children.map((child) => {
              const isExpanded = expandedChildId === child.id;
              const panelId = `parent-child-panel-${child.id}`;
              const progress = childProgress[child.id];
              const percentage = progress?.total
                ? Math.round((progress.completed / progress.total) * 100)
                : 0;
              const subjects = Array.isArray(child.subjects)
                ? child.subjects
                : String(child.subjects || child.track || 'Pending Programme Confirmation')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
              const feeAmount = Number(child.tuitionFee || child.fee || 0);
              const classDisplay =
                child.class || child.grade
                  ? formatNormalizedClassDisplay(child.class || child.grade, 'Grade 1')
                  : 'Unassigned Class';
              const programDisplay = child.plan || child.programTitle || subjects[0] || 'Programme Pending';
              const statusText = String(child.status || 'Active');
              const isInactive = ['inactive', 'suspended', 'disabled', 'rejected'].includes(
                statusText.toLowerCase()
              );

              return (
                <div key={child.id} className="transition-colors">
                  {/* Collapsed Institutional Row */}
                  <div className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-900/50">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      onClick={() => setExpandedChildId(isExpanded ? null : child.id)}
                      className="flex-1 min-w-0 text-left flex items-start sm:items-center gap-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-white rounded-md"
                    >
                      <span className="mt-0.5 sm:mt-0 text-slate-400 shrink-0" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-800 text-xs font-bold text-white">
                        {(child.fullName || child.name || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-4 items-center">
                        <div className="md:col-span-4 min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {child.fullName || child.name || 'Student'}
                          </p>
                          <p className="truncate text-xs font-mono text-slate-500 dark:text-slate-400">
                            {child.username ? `@${child.username}` : 'No username assigned'}
                          </p>
                        </div>
                        <div className="md:col-span-3 min-w-0 text-xs text-slate-700 dark:text-slate-300 truncate">
                          {classDisplay}
                        </div>
                        <div className="md:col-span-3 min-w-0 text-xs text-slate-600 dark:text-slate-400 truncate">
                          {programDisplay}
                        </div>
                        <div className="md:col-span-2 flex items-center gap-1.5 text-xs font-semibold">
                          {isInactive ? (
                            <AlertCircle size={13} className="text-brand-red shrink-0" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 size={13} className="text-slate-800 dark:text-slate-200 shrink-0" aria-hidden="true" />
                          )}
                          <span
                            className={
                              isInactive
                                ? 'text-brand-red dark:text-red-400'
                                : 'text-slate-800 dark:text-slate-200'
                            }
                          >
                            {statusText}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Quick Actions (stopPropagation prevents accidental expand/collapse) */}
                    <div
                      className="flex items-center gap-3 pl-7 sm:pl-0 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {child.accessCode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(child.accessCode || '');
                            toast.success(
                              `Copied access code for ${child.fullName || child.name}: ${child.accessCode}`
                            );
                          }}
                          className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title="Copy student access code"
                        >
                          <Copy size={12} aria-hidden="true" />
                          <span>Copy Code</span>
                        </button>
                      )}
                      {feeAmount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/portal/parent/billing');
                          }}
                          className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <CreditCard size={12} aria-hidden="true" />
                          <span>Pay</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/portal/parent/calendar');
                        }}
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                      >
                        <span>Timetable</span>
                        <ChevronRight size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Student Details Panel */}
                  {isExpanded && (
                    <div
                      id={panelId}
                      className="px-4 sm:px-5 pb-5 pt-2 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800/80"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2 text-xs">
                        {/* Column 1: Credentials & Identity */}
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Account &amp; Access Details
                          </p>
                          {child.accessCode ? (
                            <div className="p-3 rounded-lg bg-slate-900 text-white border border-slate-800 space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span className="inline-flex items-center gap-1 font-semibold">
                                  <KeyRound size={12} aria-hidden="true" /> Student Access Code
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(child.accessCode || '');
                                    toast.success(
                                      `Copied access code for ${child.fullName || child.name}: ${child.accessCode}`
                                    );
                                  }}
                                  className="text-red-300 hover:text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy size={11} aria-hidden="true" /> Copy
                                </button>
                              </div>
                              <p className="font-mono text-sm font-bold tracking-wider text-white">
                                {child.accessCode}
                              </p>
                              {child.username && (
                                <p className="font-mono text-[11px] text-slate-400">
                                  Username: {child.username}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-slate-500">Access code pending issuance.</p>
                          )}
                          <InfoRow label="Class / Grade" value={classDisplay} />
                          {(child.tutorName || child.mentorName) && (
                            <InfoRow
                              label="Assigned Mentor"
                              value={child.tutorName || child.mentorName || 'Faculty Instructor'}
                            />
                          )}
                        </div>

                        {/* Column 2: Programmes & Module Completion */}
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Programmes &amp; Module Progress
                          </p>
                          <div className="text-slate-800 dark:text-slate-200 font-medium">
                            {subjects.join(' · ')}
                          </div>
                          <div className="pt-1">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-slate-500 dark:text-slate-400">Module Completion</span>
                              <strong className="font-bold text-slate-900 dark:text-white tabular-nums">
                                {progress?.total ? `${percentage}%` : '—'}
                              </strong>
                            </div>
                            <div
                              className="h-1.5 overflow-hidden bg-slate-200 dark:bg-slate-800"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full bg-brand-red transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                              {progress && progress.total > 0
                                ? `${progress.completed} of ${progress.total} modules completed`
                                : 'No assigned modules recorded yet.'}
                            </p>
                          </div>
                        </div>

                        {/* Column 3: Schedule & Tuition */}
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Schedule &amp; Tuition
                          </p>
                          {child.schedule && <InfoRow label="Assigned Slot" value={child.schedule} />}
                          {child.plan && <InfoRow label="Programme Track" value={child.plan} />}
                          <InfoRow
                            label="Tuition Fee"
                            value={feeAmount > 0 ? `₦${feeAmount.toLocaleString()}` : 'Configured in Billing'}
                          />
                          <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => navigate('/portal/parent/billing')}
                              className="px-3 py-1.5 rounded-lg bg-brand-red hover:bg-red-800 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <CreditCard size={12} aria-hidden="true" />
                              {feeAmount > 0
                                ? `Settle Tuition (₦${feeAmount.toLocaleString()})`
                                : 'Open Billing Center'}
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate('/portal/parent/calendar')}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              Full Timetable <ChevronRight size={12} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Parent Learning Progress & Assessment Analytics (Recharts) */}
      {children.length > 0 && (
        <section className="bg-white dark:bg-[#111827] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <BarChart3 size={17} className="text-brand-red" aria-hidden="true" />
                <span>Learning Progress &amp; Assessment Insights</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real module progress and authorized released assessment scores for your linked learners.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="parent-analytics-child" className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Learner:
              </label>
              <select
                id="parent-analytics-child"
                value={analyticsChildId}
                onChange={(e) => setAnalyticsChildId(e.target.value)}
                className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="all">All Linked Children</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName || c.name || 'Student'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart A: Module Progress Comparison */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Module Completion by Child
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Completed vs. remaining assigned curriculum modules.
              </p>
              {moduleComparisonData.length === 0 ? (
                <EmptyChartNote text="No assigned curriculum modules recorded yet." />
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={moduleComparisonData}
                      layout="vertical"
                      margin={{ top: 6, right: 16, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: BRAND_SLATE }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={85}
                        tick={{ fontSize: 11, fill: BRAND_NAVY }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="completed" name="Completed" stackId="mod" fill={BRAND_CRIMSON} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="remaining" name="Remaining" stackId="mod" fill={BRAND_SLATE_MUTED} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart B: Released Assessment Score Progression */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Released Assessment Scores
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Chronological percentages from tutor-released assessments.
              </p>
              {releasedAssessmentSeries.length === 0 ? (
                <EmptyChartNote text="No released assessment scores available yet." />
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={releasedAssessmentSeries}
                      margin={{ top: 6, right: 12, left: -12, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="parentScoreFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={BRAND_CRIMSON} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={BRAND_CRIMSON} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="dateDisplay" tick={{ fontSize: 10, fill: BRAND_SLATE }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: BRAND_SLATE }} unit="%" />
                      <Tooltip
                        formatter={(val) => [`${val ?? 0}%`, 'Score']}
                        labelFormatter={(_label, payload) =>
                          payload?.[0]?.payload?.fullTitle
                            ? `${payload[0].payload.fullTitle} (${payload[0].payload.studentName})`
                            : ''
                        }
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="percentage"
                        stroke={BRAND_CRIMSON}
                        strokeWidth={2}
                        fill="url(#parentScoreFill)"
                        name="Score %"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart C: Assignment & Activity Status Overview */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Assignments &amp; Assessments Status
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Breakdown across completed, awaiting review, and pending work.
              </p>
              {activityStatusData.length === 0 ? (
                <EmptyChartNote text="No assigned coursework or assessment records yet." />
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activityStatusData}
                      margin={{ top: 6, right: 12, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="status" tick={{ fontSize: 10, fill: BRAND_SLATE }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: BRAND_SLATE }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" name="Records" radius={[4, 4, 0, 0]}>
                        {activityStatusData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Chronological Class Schedules Agenda */}
      <section className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Calendar size={17} className="text-brand-red" aria-hidden="true" />
              <span>Class Schedule Agenda</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chronological sessions assigned to your linked learners.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal/parent/calendar')}
            className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            Full Calendar <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>

        {groupedSchedules.length === 0 ? (
          <div className="p-5">
            <EmptyPanel text="No class schedules assigned to your learners yet." />
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {groupedSchedules.map((group) => (
              <div key={group.key} className="p-4 sm:px-5 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {group.label}
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800/80">
                  {group.items.slice(0, 8).map((sched: any) => {
                    const linkCheck = validateMeetingLink(sched.meetingLink);
                    const classDisplay =
                      sched.classLevel || sched.class
                        ? formatNormalizedClassDisplay(sched.classLevel || sched.class, 'Grade 1')
                        : sched.dayOfWeek || 'Scheduled';
                    const statusLabel = String(sched.status || 'Scheduled');

                    return (
                      <div
                        key={sched.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {sched.title || sched.programName || sched.subject || 'Coding Session'}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">·</span>
                            <span className="font-semibold text-brand-red">{classDisplay}</span>
                            {sched.studentName && (
                              <>
                                <span className="text-slate-400" aria-hidden="true">·</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {sched.studentName}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Clock size={12} aria-hidden="true" />
                              {sched.date || sched.dayOfWeek || sched.day || 'Weekly'} ·{' '}
                              {sched.startTime || sched.time || '10:00'} – {sched.endTime || '12:00'}
                            </span>
                            {sched.tutorName && (
                              <span className="inline-flex items-center gap-1">
                                <User size={12} aria-hidden="true" />
                                Mentor: <strong className="text-slate-700 dark:text-slate-300">{sched.tutorName}</strong>
                              </span>
                            )}
                            <span className="font-medium text-slate-600 dark:text-slate-300 capitalize">
                              {statusLabel.toLowerCase()}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {linkCheck.valid ? (
                            <a
                              href={linkCheck.normalizedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white hover:text-brand-red underline underline-offset-2"
                            >
                              <span>Join Class ({linkCheck.platform})</span>
                              <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="text-slate-400">Link pending</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recursive Programme Learning Pathways */}
      {children.length > 0 && (
        <section className="bg-white dark:bg-[#111827] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800">
          <ParentLearningTracks students={children} />
        </section>
      )}

      {/* Enrollment Requests List */}
      <section className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Enrollment Requests
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Admission requests submitted from this parent portal.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
            {enrollments.length} total
          </span>
        </div>

        {enrollments.length === 0 ? (
          <div className="p-5">
            <EmptyPanel text="No enrollment requests have been submitted." />
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {enrollments.slice(0, 8).map((request) => {
              const status = String(request.status || 'pending').toLowerCase();
              const dateDisplay = formatDateShort(request.createdAt);
              return (
                <div
                  key={request.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {request.studentName || 'Child enrollment'}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {request.plan || 'Learning plan'}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {formatNormalizedClassDisplay(
                          request.class || request.grade || request.studentClass || request.studentAge,
                          'Grade 1'
                        )}
                      </span>
                      {dateDisplay !== '—' && (
                        <>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="text-slate-500 tabular-nums">Submitted {dateDisplay}</span>
                        </>
                      )}
                    </div>
                    {status === 'approved' && request.accessCode && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                        <span>Access Code: <strong>{request.accessCode}</strong></span>
                        {request.username && <span>@{request.username}</span>}
                      </div>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-1.5 font-semibold shrink-0 capitalize">
                    {status === 'approved' ? (
                      <CheckCircle2 size={13} className="text-slate-900 dark:text-white" aria-hidden="true" />
                    ) : status === 'rejected' ? (
                      <AlertCircle size={13} className="text-brand-red" aria-hidden="true" />
                    ) : (
                      <Clock size={13} className="text-slate-500" aria-hidden="true" />
                    )}
                    <span
                      className={
                        status === 'rejected'
                          ? 'text-brand-red dark:text-red-400'
                          : 'text-slate-800 dark:text-slate-200'
                      }
                    >
                      {status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="parent-enroll-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="parent-enroll-title" className="text-sm font-bold text-slate-900 dark:text-white">
                  Enroll New Child
                </h2>
                <p className="text-xs text-slate-500">
                  Submit student details for administrative review, mentor assignment, and billing setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEnrollModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                aria-label="Close enrollment dialog"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-3">
              <Field label="Student Full Name" htmlFor="parent-student-name">
                <input
                  id="parent-student-name"
                  type="text"
                  required
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  placeholder="e.g. David Johnson"
                  className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  autoComplete="name"
                />
              </Field>
              <Field label="Class / Grade Level" htmlFor="parent-student-age">
                <select
                  id="parent-student-age"
                  required
                  value={normalizeClassName(studentAge, 'Grade 1')}
                  onChange={(event) => setStudentAge(event.target.value)}
                  className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {CANONICAL_CLASSES.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </Field>
              <ProgramHierarchySelector
                programsMap={programsMap}
                selectedProgramIds={selectedProgramIds}
                onChangeSelectedProgramIds={setSelectedProgramIds}
                deliveryType={deliveryType}
                onChangeDeliveryType={(deliv) => setDeliveryType(deliv)}
                compact={true}
                label="Select Programme or Nested Sub-Programmes"
              />
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="min-h-9 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-9 flex-1 rounded-lg bg-brand-red px-3 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Submitting…' : 'Submit Enrollment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTx && (
        <FintechTransactionDetailsModal
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-1.5 text-xs">
    <span className="text-slate-500 dark:text-slate-400">{label}</span>
    <span className="max-w-[65%] text-right font-semibold text-slate-800 dark:text-slate-200">
      {value}
    </span>
  </div>
);

const EmptyPanel: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-5 text-center">
    <p className="text-xs text-slate-500 dark:text-slate-400">{text}</p>
  </div>
);

const EmptyChartNote: React.FC<{ text: string }> = ({ text }) => (
  <div className="h-56 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col items-center justify-center p-4 text-center">
    <BookOpen size={20} className="text-slate-400 mb-2" aria-hidden="true" />
    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">{text}</p>
  </div>
);

const EmptyChildrenState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-8 text-center">
    <GraduationCap className="mx-auto text-slate-300 dark:text-slate-700" size={34} aria-hidden="true" />
    <h3 className="mt-3 text-xs font-bold text-slate-900 dark:text-white">No students linked yet</h3>
    <p className="mx-auto mt-1 max-w-sm text-[11px] leading-4 text-slate-500">
      A verified child record will appear here once admissions links it to this parent account.
    </p>
    <button
      type="button"
      onClick={onAdd}
      className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-red px-3.5 text-xs font-bold text-white hover:bg-red-800 cursor-pointer"
    >
      Request Child Enrollment <ArrowRight size={13} aria-hidden="true" />
    </button>
  </div>
);

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode }> = ({
  label,
  htmlFor,
  children,
}) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
      {label}
    </label>
    {children}
  </div>
);

export default ParentDashboard;
