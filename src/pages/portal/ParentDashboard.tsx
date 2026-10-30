import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, getDocs, getDoc, query, where, limit, setDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  GraduationCap, PlusCircle, CreditCard, Bell, CheckCircle2, AlertCircle, 
  ArrowRight, ChevronRight, Download, Receipt, Calendar, ExternalLink,
  Clock, User, BookOpen, Headphones, MessageCircle, KeyRound, Copy, Check,
  ShieldCheck
} from 'lucide-react';
import SEO from '../../components/ui/SEO';
import DashboardGreeting from '../../components/portal/DashboardGreeting';
import { useToast } from '../../contexts/ToastContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { FintechTransactionDetailsModal } from '../../components/portal/FintechTransactionDetailsModal';
import type { TransactionReceiptData } from '../../lib/receiptGenerator';
import { getEffectiveAuth } from '../../utils/impersonation';
import { formatNaira } from '../../lib/billing';
import { CANONICAL_CLASSES, formatNormalizedClassDisplay, normalizeClassName } from '../../lib/classes';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';

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
interface ProgressRecord { completed: number; total: number; }

const ParentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { notifications: parentNotifs, unreadCount, openDrawer, isNotificationRead } = useNotifications();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [childProgress, setChildProgress] = useState<Record<string, ProgressRecord>>({});
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentAge, setStudentAge] = useState<string>('Grade 1');
  const [availablePrograms, setAvailablePrograms] = useState<{ id: string; title: string }[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
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
        const studentIdentityKey = (studentDoc: any, data: any) => String(
          data.linkedStudentId || data.studentDocId || data.firebaseUid || data.studentUid || data.username || data.accessCode || data.email || data.parentChildId || studentDoc.id
        ).trim().toLowerCase();
        const addStudentRecord = (docId: string, data: any) => {
          const targetId = String(data.linkedStudentId || data.studentDocId || docId).trim();
          const key = studentIdentityKey({ id: targetId }, data);
          const existing = allStudentsMap.get(key);
          if (!existing || (String(data.status || '').toLowerCase() === 'active' && String(existing.status || '').toLowerCase() !== 'active')) {
            const normalizedClass = formatNormalizedClassDisplay(data.class || data.grade || data.studentAge, '');
            allStudentsMap.set(key, {
              ...(existing || {}),
              id: targetId,
              ...data,
              ...(normalizedClass ? { class: normalizedClass, grade: normalizedClass } : {})
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
          try { collectChildren(await getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', userUid)))); } catch (error) { console.warn('individualStudents parent lookup failed:', error); }
          try { collectChildren(await getDocs(query(collection(db, 'students'), where('parentId', '==', userUid)))); } catch (error) { console.warn('students parent lookup failed:', error); }

          // Also check parents/{userUid} and users/{userUid} for explicit children IDs
          try {
            const [pSnap, uSnap] = await Promise.all([
              getDoc(doc(db, 'parents', userUid)).catch(() => null),
              getDoc(doc(db, 'users', userUid)).catch(() => null),
            ]);
            const childIdSet = new Set<string>();
            if (pSnap?.exists() && Array.isArray(pSnap.data()?.children)) {
              pSnap.data()!.children.forEach((cid: any) => { if (cid) childIdSet.add(String(cid).trim()); });
            }
            if (uSnap?.exists() && Array.isArray(uSnap.data()?.children)) {
              uSnap.data()!.children.forEach((cid: any) => { if (cid) childIdSet.add(String(cid).trim()); });
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
          try { collectChildren(await getDocs(query(collection(db, 'individualStudents'), where('parentEmail', '==', userEmail)))); } catch (error) { console.warn('individualStudents parent email lookup failed:', error); }
          try { collectChildren(await getDocs(query(collection(db, 'students'), where('parentEmail', '==', userEmail)))); } catch (error) { console.warn('students parent email lookup failed:', error); }
          try { collectChildren(await getDocs(query(collection(db, 'enrollment_requests'), where('parentEmail', '==', userEmail)))); } catch (error) { console.warn('enrollment_requests parent email lookup failed:', error); }
        }

        if (cancelled) return;
        const childList = Array.from(allStudentsMap.values());
        setChildren(childList);
        const [paymentResult, enrollmentResult, programsSnap, schedSnap] = await Promise.allSettled([
          getDocs(query(collection(db, 'payments'), where('parentId', '==', userUid), limit(50))),
          getDocs(query(collection(db, 'enrollment_requests'), where('parentId', '==', userUid), limit(25))),
          getDocs(query(collection(db, 'programs'), where('status', '==', 'PUBLISHED'))).catch(() => getDocs(collection(db, 'programs'))),
          getDocs(collection(db, 'classSchedules'))
        ]);
        if (programsSnap.status === 'fulfilled') {
          const progs = programsSnap.value.docs.map(d => ({ id: d.id, title: (d.data().title || d.data().name || 'Technology Programme') as string }));
          setAvailablePrograms(progs);
          if (progs.length > 0 && !selectedPlan) {
            setSelectedPlan(progs[0].title);
          }
        }
        if (paymentResult.status === 'fulfilled') setPayments(paymentResult.value.docs.map(paymentDoc => ({ id: paymentDoc.id, ...paymentDoc.data() })).filter((payment: any) => payment.parentId === userUid || payment.parentId === userEmail || payment.parentEmail === userEmail));
        else { console.warn('Payment lookup failed:', paymentResult.reason); setPayments([]); }
        if (enrollmentResult.status === 'fulfilled') setEnrollments(enrollmentResult.value.docs.map(enrollmentDoc => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() })));
        else { console.warn('Enrollment lookup failed:', enrollmentResult.reason); setEnrollments([]); }
        if (schedSnap.status === 'fulfilled') {
          const allScheds = schedSnap.value.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          const childIds = childList.map(c => c.id);
          const childNames = childList.map(c => (c.name || '').toLowerCase());
          const childEmails = childList.map(c => (c.email || '').toLowerCase());
          const childSchoolIds = childList.map(c => (c as any).schoolId).filter(Boolean);
          const parentScheds = allScheds.filter((s: any) => {
            if (s.parentId === userUid || s.parentId === userEmail) return true;
            if (s.parentEmail && s.parentEmail.toLowerCase() === userEmail) return true;
            if (s.studentId && childIds.includes(s.studentId)) return true;
            if (s.studentName && childNames.includes(String(s.studentName).toLowerCase())) return true;
            if (s.studentEmail && childEmails.includes(String(s.studentEmail).toLowerCase())) return true;
            if (s.schoolId && childSchoolIds.includes(s.schoolId)) return true;
            return false;
          });
          setSchedules(parentScheds);
        } else {
          setSchedules([]);
        }
        const progressResults = await Promise.allSettled(childList.map(async child => {
          const snap = await getDocs(query(collection(db, 'studentModules'), where('studentId', '==', child.id), limit(50)));
          let completed = 0;
          snap.forEach(moduleDoc => { if (moduleDoc.data().completed) completed += 1; });
          return [child.id, { completed, total: snap.size }] as const;
        }));
        if (!cancelled) {
          const progressMap: Record<string, ProgressRecord> = {};
          progressResults.forEach(result => { if (result.status === 'fulfilled') progressMap[result.value[0]] = result.value[1]; });
          setChildProgress(progressMap);
        }
      } catch (error) {
        console.error('Error loading parent dashboard:', error);
        if (!cancelled) setEnrollError('Some parent portal data could not be loaded. Please try again.');
      } finally { if (!cancelled) setLoading(false); }
    };
    fetchParentData();
    return () => { cancelled = true; };
  }, []);

  const pendingEnrollmentCount = useMemo(() => enrollments.filter(item => String(item.status || '').toLowerCase() === 'pending').length, [enrollments]);

  const handleEnrollSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true); setEnrollSuccess(''); setEnrollError('');
    const trimmedName = studentName.trim();
    const trimmedAge = normalizeClassName(studentAge.trim(), 'Grade 1');
    const subjects = preferredSubjects.split(',').map(subject => subject.trim()).filter(Boolean);
    if (!trimmedName || !trimmedAge || subjects.length === 0) {
      setEnrollError('Please complete the student name, class/grade, and at least one subject.'); setSubmitting(false); return;
    }
    try {
      const user = auth.currentUser;
      const effective = getEffectiveAuth();
      if (!user && !effective.isMasquerading) throw new Error('Your parent session has expired. Please sign in again.');
      
      const userUid = effective.effectiveUid || user?.uid || '';
      const userEmail = (effective.effectiveEmail || user?.email || '').toLowerCase();
      const parentName = sessionStorage.getItem('userName') || user?.displayName || userEmail.split('@')[0] || 'Parent';

      let requestCreated: any = null;

      // 1. Use the authenticated server endpoint for real parent sessions.
      // Do not silently fall back to direct writes on API errors: doing so can
      // create duplicate requests or skip the private admin notification.
      if (user && !effective.isMasquerading) {
        const token = await user.getIdToken();
        const response = await fetch('/api/parent-enrollment-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ studentName: trimmedName, studentAge: trimmedAge, plan: selectedPlan, subjects }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.request) {
          throw new Error(result.error || 'The enrollment service could not submit your request. Please try again.');
        }
        requestCreated = result.request;
      }

      // 2. Keep direct Firestore writes only for the admin's impersonation mode.
      // Real parent sessions must always use the server endpoint above.
      if (!requestCreated && effective.isMasquerading) {
        const reqRef = doc(collection(db, 'enrollment_requests'));
        const now = new Date();
        const docPayload = {
          studentName: trimmedName,
          studentAge: trimmedAge,
          studentClass: trimmedAge,
          class: trimmedAge,
          grade: trimmedAge,
          plan: selectedPlan,
          subjects,
          parentId: userUid,
          parentEmail: userEmail,
          parentName: parentName,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: 'parent_portal'
        };

        await setDoc(reqRef, docPayload);
        requestCreated = { id: reqRef.id, ...docPayload, createdAt: now.toISOString() };

        // Write to activity logs
        await addDoc(collection(db, 'activityLogs'), {
          actorId: userUid,
          action: 'PARENT_ENROLLMENT_REQUEST_CREATED',
          targetId: reqRef.id,
          targetType: 'enrollment_request',
          timestamp: serverTimestamp(),
          metadata: { studentName: trimmedName, plan: selectedPlan, subjects, parentEmail: userEmail }
        }).catch(() => undefined);

      }

      setEnrollments(current => [requestCreated, ...current.filter(e => e.id !== requestCreated.id)]);
      setEnrollSuccess(`Enrollment request submitted for ${trimmedName}! The admissions team can now review it from Admin Approvals, configure billing, assign a mentor, and schedule class times.`);
      setStudentName(''); setStudentAge('Grade 1'); setPreferredSubjects('Scratch, Python, Web Development'); setShowEnrollModal(false);
    } catch (error: any) {
      console.error('Enrollment request submission failed:', error);
      setEnrollError(error?.message || 'Could not submit the enrollment request.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <SEO title="Parent Portal & Progress Dashboard" description="Monitor child progress, attendance, mentor assessments, and billing at Jaystarbliss Studios." noindex={true} />
      
      <DashboardGreeting
        role="Parent / Guardian"
        subtitle="Track your children, enrollment requests, learning progress, tuition records, and institute notices."
      />

      {enrollSuccess && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 p-4 text-xs font-semibold text-emerald-800 dark:text-emerald-300" role="status">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{enrollSuccess}</span>
        </div>
      )}

      {enrollError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 p-4 text-xs font-semibold text-red-800 dark:text-red-300" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{enrollError}</span>
        </div>
      )}

      {/* Top Banner / Program Status */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 sm:p-6 shadow-xs border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-brand-red text-white">
            Family Learning Workspace
          </span>
          <h2 className="text-lg sm:text-xl font-bold mt-2 tracking-tight">Parent & Guardian Hub</h2>
          <p className="text-xs text-slate-300 mt-1">
            Stay aligned with your student's coding journey, tech projects, mentor assignments, and tuition schedules.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => { setShowEnrollModal(true); setEnrollError(''); }}
            className="px-4 py-2.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-2"
          >
            <PlusCircle size={14} />
            <span>Enroll New Child</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/portal/parent/support')}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all border border-white/10 inline-flex items-center gap-2"
          >
            <Headphones size={14} />
            <span>Support Desk</span>
          </button>
        </div>
      </div>

      {/* Compact 3-Stat Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[#161B26] rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Linked Children</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{children.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Verified student accounts</p>
        </div>
        <div className="bg-white dark:bg-[#161B26] rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending Enrollments</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{pendingEnrollmentCount}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Awaiting admissions review</p>
        </div>
        <div className="bg-white dark:bg-[#161B26] rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tuition Receipts</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{payments.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Confirmed payment records</p>
        </div>
      </div>

      {/* Enrolled Students Section */}
      <section className="bg-white dark:bg-[#161B26] rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Enrolled Students</h2>
            <p className="text-xs text-slate-500">Only student records linked to your parent account are displayed.</p>
          </div>
          <button
            type="button"
            onClick={() => { setShowEnrollModal(true); setEnrollError(''); }}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-red px-3.5 text-xs font-bold text-white hover:bg-red-700"
          >
            <PlusCircle size={14} aria-hidden="true" /> Add Student
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-28 items-center justify-center text-xs text-slate-500">Loading student records…</div>
        ) : children.length === 0 ? (
          <EmptyChildrenState onAdd={() => setShowEnrollModal(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {children.map(child => {
              const progress = childProgress[child.id];
              const percentage = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;
              const subjects = Array.isArray(child.subjects) ? child.subjects : String(child.subjects || child.track || 'General Tech Track').split(',').map(subject => subject.trim()).filter(Boolean);
              const feeAmount = Number(child.tuitionFee || child.fee || 0);

              return (
                <article key={child.id} className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs hover:border-brand-red/40 transition-all space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-red text-xs font-black text-white shadow-xs">
                          {(child.fullName || child.name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">{child.fullName || child.name || 'Student'}</h3>
                          <p className="truncate text-xs font-mono font-bold text-slate-500 dark:text-slate-400">@{child.username || 'cadet'}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                        {child.status || 'Active'}
                      </span>
                    </div>

                    {/* Student Access Keys Box */}
                    {child.accessCode && (
                      <div className="mt-3 p-2.5 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-1.5 shadow-inner">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                          <span className="flex items-center gap-1">
                            <KeyRound size={11} className="text-emerald-400" /> Student Access Code
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(child.accessCode || '');
                              toast.success(`Copied access code for ${child.fullName || child.name}: ${child.accessCode}`);
                            }}
                            className="text-[10px] font-bold text-brand-red hover:text-red-400 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Copy size={11} /> Copy Code
                          </button>
                        </div>
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-xs font-black tracking-wider text-emerald-400">{child.accessCode}</span>
                          <span className="text-[10px] text-slate-400">User: {child.username}</span>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 space-y-2.5 text-xs">
                      <div>
                        <p className="mb-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">Enrolled Programme Track</p>
                        <div className="flex flex-wrap gap-1">
                          {subjects.map(subject => (
                            <span key={subject} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-[10px] font-bold text-slate-800 dark:text-slate-200">
                              {subject}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Module Progress</span>
                          <strong className="text-xs font-black text-slate-900 dark:text-white">{percentage}%</strong>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
                          <div className="h-full rounded-full bg-brand-red transition-all" style={{ width: `${percentage}%` }} />
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {progress ? `${progress.completed} of ${progress.total} modules completed` : 'Modules will be tracked as classes proceed'}
                        </p>
                      </div>

                      {(child.class || child.grade) && <InfoRow label="Class / Grade" value={formatNormalizedClassDisplay(child.class || child.grade, 'Grade 1')} />}
                      {child.schedule && <InfoRow label="Class Schedule" value={child.schedule} />}
                      {(child.tutorName || child.mentorName) && <InfoRow label="Assigned Mentor" value={child.tutorName || child.mentorName || 'Faculty Instructor'} />}
                      {child.plan && <InfoRow label="Programme Track" value={child.plan} />}
                      {feeAmount > 0 && <InfoRow label="Tuition Fee" value={`₦${feeAmount.toLocaleString()}`} />}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3 text-[11px]">
                    {feeAmount > 0 ? (
                      <button
                        type="button"
                        onClick={() => navigate('/portal/parent/billing')}
                        className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        <CreditCard size={12} /> Settle Tuition (₦{feeAmount.toLocaleString()})
                      </button>
                    ) : (
                      <span className="text-slate-500">Portal Ready</span>
                    )}

                    <button 
                      type="button" 
                      onClick={() => navigate('/portal/parent/calendar')}
                      className="font-black text-brand-red hover:underline inline-flex items-center gap-1"
                    >
                      Timetable <ChevronRight size={12} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Class Schedule & Timetable Section */}
      {schedules.length > 0 && (
        <section className="bg-white dark:bg-[#161B26] rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Calendar size={18} className="text-brand-red" />
                <span>Assigned Class Schedules & Times</span>
              </h2>
              <p className="text-xs text-slate-500">Weekly coding sessions and lab hours assigned to your learners.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/portal/parent/calendar')}
              className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1"
            >
              Full Calendar <ArrowRight size={13} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {schedules.slice(0, 6).map((sched: any) => (
              <div key={sched.id} className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{sched.title || sched.programName || sched.subject || 'Coding Lab'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-brand-red/10 text-brand-red">
                    {sched.classLevel || sched.class ? formatNormalizedClassDisplay(sched.classLevel || sched.class, 'Grade 1') : (sched.dayOfWeek || 'Scheduled')}
                  </span>
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} />
                    <span>{sched.dayOfWeek || sched.day || sched.date || 'Weekly'} • {sched.startTime || sched.time || '10:00 AM'} - {sched.endTime || '12:00 PM'}</span>
                  </div>
                  {sched.tutorName && (
                    <div className="flex items-center gap-1.5">
                      <User size={13} />
                      <span>Mentor: <strong>{sched.tutorName}</strong></span>
                    </div>
                  )}
                  {sched.meetingLink && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <ExternalLink size={12} className="text-sky-500 shrink-0" />
                      <a href={sched.meetingLink} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline truncate">
                        Join Virtual Lab
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Enrollment Requests Section */}
      <section className="bg-white dark:bg-[#161B26] rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Enrollment Requests</h2>
            <p className="text-xs text-slate-500">Track the status of child enrollment requests submitted from this portal.</p>
          </div>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {enrollments.length} Total
          </span>
        </div>

        <div className="space-y-2.5">
          {enrollments.length === 0 ? (
            <EmptyPanel text="No enrollment requests have been submitted." />
          ) : (
            enrollments.slice(0, 6).map(request => {
              const status = String(request.status || 'pending').toLowerCase();
              const tone = status === 'approved' ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300' : status === 'rejected' ? 'text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300' : 'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300';
              return (
                <div key={request.id} className="flex flex-col gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{request.studentName || 'Child enrollment'}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{request.plan || 'Learning plan'} • {formatNormalizedClassDisplay(request.class || request.grade || request.studentClass || request.studentAge, 'Grade 1')}</p>
                    {status === 'approved' && request.accessCode && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-mono font-bold">
                          Code: {request.accessCode}
                        </span>
                        {request.username && <span className="text-slate-500 font-mono">@{request.username}</span>}
                      </div>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 self-start rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${tone}`}>
                    {status === 'approved' ? <CheckCircle2 size={12} /> : status === 'rejected' ? <AlertCircle size={12} /> : <Clock size={12} />}
                    {status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="parent-enroll-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="parent-enroll-title" className="text-sm font-bold text-slate-900 dark:text-white">Enroll New Child</h2>
                <p className="text-xs text-slate-500">Submit student details for administrative review, mentor assignment, and billing setup.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEnrollModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                aria-label="Close enrollment dialog"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-3">
              <Field label="Student Full Name" htmlFor="parent-student-name">
                <input id="parent-student-name" type="text" required value={studentName} onChange={event => setStudentName(event.target.value)} placeholder="e.g. David Johnson" className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" autoComplete="name" />
              </Field>
              <Field label="Class / Grade Level" htmlFor="parent-student-age">
                <select id="parent-student-age" required value={normalizeClassName(studentAge, 'Grade 1')} onChange={event => setStudentAge(event.target.value)} className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {CANONICAL_CLASSES.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </Field>
              <Field label="Learning Track / Plan" htmlFor="parent-plan">
                <select id="parent-plan" value={selectedPlan} onChange={event => setSelectedPlan(event.target.value)} className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {availablePrograms.length > 0 ? (
                    availablePrograms.map(p => (
                      <option key={p.id} value={p.title}>{p.title}</option>
                    ))
                  ) : (
                    <option value="">No programme selected</option>
                  )}
                </select>
              </Field>
              <Field label="Preferred Subjects" htmlFor="parent-subjects">
                <input id="parent-subjects" type="text" value={preferredSubjects} onChange={event => setPreferredSubjects(event.target.value)} placeholder="e.g. Python, Scratch, Robotics" className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                <p className="mt-0.5 text-[10px] text-slate-500">Separate multiple subjects with commas.</p>
              </Field>
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowEnrollModal(false)} className="min-h-9 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="min-h-9 flex-1 rounded-xl bg-brand-red px-3 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                  {submitting ? 'Submitting…' : 'Submit Enrollment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
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
  <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className="max-w-[65%] text-right font-semibold text-slate-800 dark:text-slate-200">{value}</span>
  </div>
);

const EmptyPanel: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-5 text-center">
    <p className="text-xs text-slate-500">{text}</p>
  </div>
);

const EmptyChildrenState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-8 text-center">
    <GraduationCap className="mx-auto text-slate-300 dark:text-slate-700" size={36} aria-hidden="true" />
    <h3 className="mt-3 text-xs font-bold text-slate-900 dark:text-white">No students linked yet</h3>
    <p className="mx-auto mt-1 max-w-sm text-[11px] leading-4 text-slate-500">
      A verified child record will appear here once admissions links it to this parent account.
    </p>
    <button
      type="button"
      onClick={onAdd}
      className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-brand-red px-3.5 text-xs font-bold text-white hover:bg-red-700"
    >
      Request Child Enrollment <ArrowRight size={13} aria-hidden="true" />
    </button>
  </div>
);

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode }> = ({ label, htmlFor, children }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
    {children}
  </div>
);

export default ParentDashboard;
