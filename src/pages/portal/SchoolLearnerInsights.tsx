import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, BookOpenCheck, CalendarCheck, Download, FileBarChart2, GraduationCap, Loader2, RefreshCw, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db, getClientDatabases } from '../../lib/firebase';
import { getEffectiveAuth } from '../../utils/impersonation';
import { computeExamMaxScore, formatScoreSummary, normalizeClassName, resolvePartnerSchoolName } from '../../lib/classes';
import SEO from '../../components/ui/SEO';

type Learner = { id: string; fullName: string; username: string; email?: string; className: string; track?: string; accountStatus?: string; studentUid?: string };
type Assessment = { id: string; title: string; subject: string; assessmentType: string; score: number | null; feedback?: string; createdAt?: string | null; updatedAt?: string | null };
type ExamResult = { id: string; title: string; subject: string; status: string; score: number | null; maxScore: number; submittedAt?: string | null; releasedAt?: string | null; feedback?: string };
type Attendance = { id: string; date?: string | null; status: string; notes?: string; className?: string };
type ActivityRecord = { id: string; type: string; action: string; message: string; route?: string; createdAt?: string | null; actorRole?: string };
type Detail = { learner: Learner; assessments: Assessment[]; examinations: ExamResult[]; attendance: Attendance[]; activities: ActivityRecord[]; summary: { assessments: number; examinations: number; attendanceRecords: number; activities: number; averageAssessmentScore: number | null; attendanceRate: number | null } };

const asIso = (v: any) => v?.toDate ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null;

const clientFallbackApi = async (studentId?: string) => {
  const effective = getEffectiveAuth();
  const uid = effective.effectiveUid || auth.currentUser?.uid || '';
  if (!uid) throw new Error('Please sign in again.');

  const dbs = getClientDatabases();
  const validSchoolIds = new Set<string>();
  let schoolName = resolvePartnerSchoolName(sessionStorage.getItem('schoolName'));
  let schoolCode = '';
  let primarySchoolId = sessionStorage.getItem('schoolId') || '';

  if (primarySchoolId) validSchoolIds.add(primarySchoolId);

  for (const clientDb of dbs) {
    const uSnap = await getDoc(doc(clientDb, 'users', uid)).catch(() => null);
    let userEmailFromDoc = '';
    if (uSnap?.exists()) {
      const u = uSnap.data() || {};
      userEmailFromDoc = String(u.email || '').toLowerCase().trim();
      if (u.schoolId) { validSchoolIds.add(String(u.schoolId).trim()); if (!primarySchoolId) primarySchoolId = String(u.schoolId).trim(); }
      if (u.school_id) validSchoolIds.add(String(u.school_id).trim());
      if (u.schoolDocId) validSchoolIds.add(String(u.schoolDocId).trim());
      if (u.schoolName && !schoolName) schoolName = resolvePartnerSchoolName(u.schoolName);
      if (u.schoolCode && !schoolCode) schoolCode = String(u.schoolCode);
    }

    const email = (auth.currentUser?.email || userEmailFromDoc || '').toLowerCase().trim();
    const emailPrefix = email.includes('@') ? email.split('@')[0].replace(/[^a-z0-9_-]/gi, '') : '';
    const candidateDocIds = Array.from(new Set([uid, primarySchoolId, emailPrefix, ...Array.from(validSchoolIds)].filter(Boolean)));
    for (const cid of candidateDocIds) {
      const sDoc = await getDoc(doc(clientDb, 'schools', cid)).catch(() => null);
      if (sDoc?.exists()) {
        const s = sDoc.data() || {};
        validSchoolIds.add(sDoc.id);
        if (!primarySchoolId || primarySchoolId === uid) primarySchoolId = sDoc.id;
        if ((s.name || s.schoolName) && !schoolName) schoolName = resolvePartnerSchoolName(s.name, s.schoolName);
        if (s.schoolCode) { validSchoolIds.add(String(s.schoolCode).trim()); if (!schoolCode) schoolCode = String(s.schoolCode).trim(); }
        if (s.schoolId) validSchoolIds.add(String(s.schoolId).trim());
      }
    }
    if (email) {
      for (const f of ['email', 'contactEmail']) {
        const qSnap = await getDocs(query(collection(clientDb, 'schools'), where(f, '==', email), limit(5))).catch(() => null);
        qSnap?.docs.forEach(d => {
          const s = d.data() || {};
          validSchoolIds.add(d.id);
          if (!primarySchoolId || primarySchoolId === uid) primarySchoolId = d.id;
          if ((s.name || s.schoolName) && !schoolName) schoolName = resolvePartnerSchoolName(s.name, s.schoolName);
          if (s.schoolCode) { validSchoolIds.add(String(s.schoolCode).trim()); if (!schoolCode) schoolCode = String(s.schoolCode).trim(); }
          if (s.schoolId) validSchoolIds.add(String(s.schoolId).trim());
        });
      }
    }
  }

  validSchoolIds.add(uid);
  const schoolAliases = Array.from(validSchoolIds).filter(Boolean);
  const resolvedSchoolId = primarySchoolId || schoolAliases[0] || uid;

  const rosterMap = new Map<string, Learner>();
  const serialise = (id: string, d: any): Learner => {
    const rawClass = String(d.className || d.class || d.grade || d.classLevel || d.classId || '').trim();
    return {
      id,
      fullName: String(d.fullName || d.studentName || d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Learner').trim(),
      username: String(d.username || d.admissionNumber || id).trim(),
      email: d.email ? String(d.email).trim() : undefined,
      className: normalizeClassName(rawClass) || rawClass || 'Unassigned',
      track: String(d.track || d.programName || d.plan || '').trim(),
      accountStatus: String(d.accountStatus || d.status || 'ACTIVE').trim(),
      studentUid: String(d.firebaseUid || d.userId || d.uid || '').trim()
    };
  };

  for (const clientDb of dbs) {
    for (const sid of schoolAliases) {
      for (const collName of ['individualStudents', 'students']) {
        for (const field of ['schoolId', 'school_id', 'schoolDocId']) {
          const snap = await getDocs(query(collection(clientDb, collName), where(field, '==', sid), limit(500))).catch(() => null);
          snap?.docs.forEach(d => {
            const incoming = serialise(d.id, d.data());
            const existing = rosterMap.get(d.id);
            if (existing) {
              if (existing.fullName === 'Learner' && incoming.fullName !== 'Learner') existing.fullName = incoming.fullName;
              if (existing.className === 'Unassigned' && incoming.className !== 'Unassigned') existing.className = incoming.className;
              if (!existing.track && incoming.track) existing.track = incoming.track;
              if (!existing.studentUid && incoming.studentUid) existing.studentUid = incoming.studentUid;
            } else {
              rosterMap.set(d.id, incoming);
            }
          });
        }
      }
      for (const field of ['schoolId', 'school_id', 'schoolDocId']) {
        const uSnap = await getDocs(query(collection(clientDb, 'users'), where(field, '==', sid), limit(500))).catch(() => null);
        uSnap?.docs.forEach(d => {
          const data = d.data() || {};
          const r = String(data.role || '').toUpperCase().trim();
          const isExplicitStudent = ['STUDENT', 'SCHOLAR', 'CADET', 'INDIVIDUAL_STUDENT'].includes(r);
          const isOtherRole = ['SCHOOL', 'SCHOOL_ADMIN', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'TUTOR', 'INSTRUCTOR', 'TEACHER', 'PARENT'].includes(r);
          if (!isExplicitStudent && (isOtherRole || (!data.studentDocId && !data.isStudent))) return;
          const id = String(data.studentDocId || d.id).trim();
          const incoming = serialise(id, { ...data, firebaseUid: d.id });
          const existing = rosterMap.get(id);
          if (existing) {
            if (!existing.studentUid) existing.studentUid = d.id;
            if (existing.fullName === 'Learner' && incoming.fullName !== 'Learner') existing.fullName = incoming.fullName;
            if (existing.className === 'Unassigned' && incoming.className !== 'Unassigned') existing.className = incoming.className;
          } else {
            rosterMap.set(id, incoming);
          }
        });
      }
    }
  }

  const roster = Array.from(rosterMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const schoolObj = { id: resolvedSchoolId, schoolId: resolvedSchoolId, schoolCode: schoolCode || resolvedSchoolId, name: schoolName || 'School' };

  if (!studentId) {
    return {
      school: schoolObj,
      learners: roster,
      totals: { learners: roster.length, classes: new Set(roster.map(s => s.className).filter(v => v && v !== 'Unassigned')).size }
    };
  }

  const learner = rosterMap.get(studentId) || roster[0];
  if (!learner) throw new Error('That learner does not belong to your school.');

  const [assessmentSnap, attendanceSnap, examAttempts] = await Promise.all([
    getDocs(query(collection(db, 'academic_assessments'), where('studentId', '==', studentId), limit(200))).catch(() => null),
    getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId), limit(300))).catch(() => null),
    getDocs(query(collection(db, 'jdiExamAttempts'), where('studentId', '==', studentId), limit(300))).catch(() => null),
  ]);

  const assessments: Assessment[] = (assessmentSnap?.docs || []).map(d => {
    const a = d.data() || {};
    return { id: d.id, title: String(a.title || 'Assessment'), subject: String(a.subject || 'General'), assessmentType: String(a.assessmentType || 'OTHER'), score: typeof a.score === 'number' ? a.score : null, feedback: String(a.feedback || ''), createdAt: asIso(a.createdAt), updatedAt: asIso(a.updatedAt) };
  }).sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

  const attendance: Attendance[] = (attendanceSnap?.docs || []).map(d => {
    const a = d.data() || {};
    return { id: d.id, date: asIso(a.date || a.createdAt), status: String(a.status || 'UNKNOWN'), notes: String(a.notes || ''), className: String(a.className || a.class || learner.className) };
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const examDocCache = new Map<string, any>();
  for (const d of examAttempts?.docs || []) {
    const eid = String(d.data()?.examId || '').trim();
    if (eid && !examDocCache.has(eid)) {
      const eSnap = await getDoc(doc(db, 'jdiExams', eid)).catch(() => null);
      if (eSnap?.exists()) examDocCache.set(eid, eSnap.data() || {});
    }
  }

  const examinations: ExamResult[] = (examAttempts?.docs || []).map(d => {
    const a = d.data() || {};
    const examData = examDocCache.get(String(a.examId || '')) || {};
    return {
      id: d.id,
      title: String(examData.title || a.examTitle || a.title || 'Examination'),
      subject: String(examData.subject || a.subject || 'General'),
      status: String(a.status || 'submitted'),
      score: typeof a.score === 'number' ? a.score : null,
      maxScore: computeExamMaxScore(examData, a),
      submittedAt: asIso(a.submittedAt),
      releasedAt: asIso(a.releasedAt),
      feedback: String(a.feedback || '')
    };
  }).sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));

  const activities: ActivityRecord[] = [];
  return {
    school: schoolObj,
    learner,
    assessments,
    examinations,
    attendance,
    activities,
    summary: {
      assessments: assessments.length,
      examinations: examinations.length,
      attendanceRecords: attendance.length,
      activities: activities.length,
      averageAssessmentScore: assessments.filter(a => typeof a.score === 'number').length
        ? assessments.filter(a => typeof a.score === 'number').reduce((sum, a) => sum + Number(a.score), 0) / assessments.filter(a => typeof a.score === 'number').length
        : null,
      attendanceRate: attendance.length ? attendance.filter(a => ['PRESENT', 'LATE'].includes(a.status.toUpperCase())).length / attendance.length * 100 : null
    }
  };
};

const api = async (studentId?: string) => {
  if (!auth.currentUser) throw new Error('Please sign in again.');
  try {
    const token = await auth.currentUser.getIdToken();
    const q = studentId ? '?studentId=' + encodeURIComponent(studentId) : '';
    const response = await fetch('/.netlify/functions/school-learner-insights' + q, { headers: { Authorization: 'Bearer ' + token } });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const data = await response.json();
      if (data && (Array.isArray(data.learners) || data.learner)) return data;
    }
  } catch {
    // Fallback to client-side Firestore below
  }
  return clientFallbackApi(studentId);
};
const dateLabel = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const scoreLabel = (score: number | null | undefined, max?: number) =>
  typeof score === 'number'
    ? typeof max === 'number' && max > 0
      ? formatScoreSummary(score, max).summaryLabel
      : `${score}`
    : 'Pending';

const SchoolLearnerInsights: React.FC = () => {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [school, setSchool] = useState<{ name: string; schoolId: string; schoolCode: string } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<'overview' | 'assessments' | 'activity' | 'attendance'>('overview');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadRoster = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const data = await api();
      const rows = Array.isArray(data.learners) ? data.learners as Learner[] : [];
      setLearners(rows);
      setSchool(data.school || null);
      setSelectedId(current => rows.some(s => s.id === current) ? current : (rows[0]?.id || ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load school learners.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const classes = useMemo(() => Array.from(new Set(learners.map(s => s.className).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [learners]);
  const filteredLearners = useMemo(() => learners.filter(s => (selectedClass === 'all' || s.className === selectedClass) && (s.fullName + ' ' + s.username + ' ' + s.className).toLowerCase().includes(search.toLowerCase().trim())), [learners, selectedClass, search]);
  useEffect(() => {
    if (!filteredLearners.length) { setSelectedId(''); setDetail(null); return; }
    if (!filteredLearners.some(s => s.id === selectedId)) setSelectedId(filteredLearners[0].id);
  }, [filteredLearners, selectedId]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    api(selectedId).then(data => { if (!cancelled) setDetail(data as Detail); })
      .catch(e => { if (!cancelled) { setDetail(null); setError(e instanceof Error ? e.message : 'Unable to load this learner.'); } })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const exportReport = () => {
    if (!detail || !school) return;
    const doc = new jsPDF();
    let y = 18;
    const page = () => { if (y > 275) { doc.addPage(); y = 18; } };
    const line = (value: string, size = 10, bold = false) => {
      page();
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(value, 180);
      doc.text(lines, 15, y);
      y += lines.length * (size * 0.48) + 3;
    };
    line(school.name || 'School Learner Report', 17, true);
    line('School ID: ' + school.schoolId + (school.schoolCode ? '  •  School code: ' + school.schoolCode : ''), 9);
    line('LEARNER PROGRESS REPORT', 13, true);
    line('Learner: ' + detail.learner.fullName, 11, true);
    line('Class: ' + detail.learner.className + '  •  Learner ID: ' + detail.learner.id);
    line('Generated: ' + new Date().toLocaleString());
    line('SUMMARY', 12, true);
    line('Academic assessments: ' + detail.summary.assessments + '  •  Examinations: ' + detail.summary.examinations);
    line('Average assessment score: ' + (detail.summary.averageAssessmentScore === null ? 'No scored assessments' : detail.summary.averageAssessmentScore.toFixed(1) + '/100'));
    line('Attendance rate: ' + (detail.summary.attendanceRate === null ? 'No attendance recorded' : detail.summary.attendanceRate.toFixed(1) + '%'));
    line('ACADEMIC ASSESSMENT HISTORY', 12, true);
    if (!detail.assessments.length) line('No academic assessments recorded.');
    detail.assessments.forEach(a => line(dateLabel(a.updatedAt || a.createdAt) + ' | ' + a.title + ' | ' + a.subject + ' | ' + scoreLabel(a.score) + (a.feedback ? ' | Feedback: ' + a.feedback : '')));
    line('EXAMINATION HISTORY', 12, true);
    if (!detail.examinations.length) line('No examination attempts recorded.');
    detail.examinations.forEach(a => line(dateLabel(a.submittedAt) + ' | ' + a.title + ' | ' + a.subject + ' | ' + scoreLabel(a.score, a.maxScore) + ' | ' + a.status + (a.releasedAt ? ' | Released ' + dateLabel(a.releasedAt) : '')));
    line('ATTENDANCE HISTORY', 12, true);
    if (!detail.attendance.length) line('No attendance records recorded.');
    detail.attendance.forEach(a => line(dateLabel(a.date) + ' | ' + a.status + (a.notes ? ' | ' + a.notes : '')));
    line('LEARNER ACTIVITY', 12, true);
    if (!detail.activities.length) line('No learner activity logs recorded.');
    detail.activities.forEach(a => line(dateLabel(a.createdAt) + ' | ' + a.message + ' | ' + a.action + (a.route ? ' | ' + a.route : '')));
    line('This report contains records available to the school account at the time of generation.', 8);
    doc.save('learner-progress-' + detail.learner.id + '.pdf');
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileBarChart2 },
    { id: 'assessments', label: 'Assessment history', icon: BookOpenCheck },
    { id: 'activity', label: 'Activities', icon: Activity },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck }
  ] as const;

  return <div className="space-y-5">
    <SEO title="Learner Progress | School Portal" description="Review learner assessment history, activities, attendance and reports." noindex />
    <header className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-red"><ShieldCheck size={15}/> School reporting</div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">Learner Progress & Reports</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Choose a class or learner to review their assessments, examinations, attendance and learning activity. Schools have a reporting view, not a learner account.</p>
          {school && <p className="mt-3 text-xs text-slate-500">School ID: <span className="font-mono font-bold">{school.schoolId}</span>{school.schoolCode && school.schoolCode !== school.schoolId ? ' · School code: ' + school.schoolCode : ''}</p>}
        </div>
        <button type="button" onClick={() => void loadRoster(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''}/> Refresh</button>
      </div>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0"/><span>{error}</span></div>}

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><Users size={18} className="text-brand-red"/><p className="mt-2 text-xs text-slate-500">Learners in this school</p><p className="text-2xl font-black">{loading ? '—' : learners.length}</p></div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><GraduationCap size={18} className="text-brand-red"/><p className="mt-2 text-xs text-slate-500">Classes / groups</p><p className="text-2xl font-black">{loading ? '—' : classes.length}</p></div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><UserRound size={18} className="text-brand-red"/><p className="mt-2 text-xs text-slate-500">Learner selected</p><p className="mt-1 truncate text-base font-black">{detail?.learner.fullName || (loading ? 'Loading…' : 'None selected')}</p></div>
    </section>

    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Filter by class</span><select className="input w-full" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}><option value="all">All classes</option>{classes.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Find a learner</span><span className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="input w-full pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, learner ID or class"/></span></label>
      </div>
      {loading ? <div className="flex justify-center py-10 text-sm text-slate-500"><Loader2 size={18} className="mr-2 animate-spin"/>Loading school roster…</div> : <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
        <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 p-2">
          {filteredLearners.length ? filteredLearners.map(s => <button key={s.id} type="button" onClick={() => { setSelectedId(s.id); setTab('overview'); }} className={'w-full rounded-xl px-3 py-3 text-left transition-colors ' + (selectedId === s.id ? 'bg-brand-red/10 ring-1 ring-brand-red/30' : 'hover:bg-slate-50 dark:hover:bg-white/5')}><span className="block truncate text-sm font-bold">{s.fullName}</span><span className="mt-1 block truncate text-xs text-slate-500">{s.className} · ID {s.id}</span></button>) : <p className="px-3 py-8 text-center text-sm text-slate-500">No learners match these filters.</p>}
        </div>
        <div className="min-w-0">
          {!selectedId ? <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-8 text-center text-sm text-slate-500">Select a learner to view their record.</div> : <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><h2 className="truncate text-xl font-black">{detail?.learner.fullName || filteredLearners.find(s => s.id === selectedId)?.fullName || 'Learner record'}</h2><p className="mt-1 text-sm text-slate-500">{detail?.learner.className || filteredLearners.find(s => s.id === selectedId)?.className} · Learner ID: {selectedId}</p></div>
              <button type="button" onClick={exportReport} disabled={!detail || detailLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-red px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"><Download size={15}/> Download report (PDF)</button>
            </div>
            <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-1">{tabs.map(t => { const Icon = t.icon; return <button key={t.id} type="button" onClick={() => setTab(t.id)} className={'inline-flex shrink-0 items-center gap-2 rounded-t-xl px-3 py-2.5 text-xs font-bold ' + (tab === t.id ? 'border-b-2 border-brand-red text-brand-red' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}><Icon size={15}/>{t.label}</button>; })}</div>
            {detailLoading ? <div className="flex justify-center py-12 text-sm text-slate-500"><Loader2 size={18} className="mr-2 animate-spin"/>Loading learner record…</div> : detail ? <div className="pt-4">
              {tab === 'overview' && <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {[['Assessments', detail.summary.assessments], ['Examinations', detail.summary.examinations], ['Attendance rate', detail.summary.attendanceRate === null ? '—' : detail.summary.attendanceRate.toFixed(1) + '%'], ['Activity events', detail.summary.activities]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 dark:bg-white/5 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}
                </div>
                <h3 className="font-black">Latest assessments and exams</h3>
                {[...detail.assessments.map(a => ({ id: a.id, title: a.title, subject: a.subject, date: a.updatedAt || a.createdAt, score: scoreLabel(a.score), status: 'Assessment' })), ...detail.examinations.map(a => ({ id: a.id, title: a.title, subject: a.subject, date: a.submittedAt, score: scoreLabel(a.score, a.maxScore), status: a.status }))].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 8).map(a => <div key={a.status + a.id} className="flex flex-col gap-1 border-b border-slate-100 dark:border-slate-800 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{a.title}</p><p className="text-xs text-slate-500">{a.subject} · {dateLabel(a.date)} · {a.status}</p></div><span className="text-sm font-black text-brand-red">{a.score}</span></div>)}
                {!detail.assessments.length && !detail.examinations.length && <p className="py-6 text-sm text-slate-500">No assessment or examination results have been recorded for this learner yet.</p>}
              </div>}
              {tab === 'assessments' && <div className="space-y-6">
                <div><h3 className="mb-3 font-black">Academic assessments</h3>{detail.assessments.length ? <div className="space-y-2">{detail.assessments.map(a => <article key={a.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h4 className="font-bold">{a.title}</h4><p className="mt-1 text-xs text-slate-500">{a.subject} · {a.assessmentType} · {dateLabel(a.updatedAt || a.createdAt)}</p></div><span className="font-black text-brand-red">{scoreLabel(a.score)}</span></div>{a.feedback && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{a.feedback}</p>}</article>)}</div> : <p className="rounded-2xl bg-slate-50 dark:bg-white/5 p-6 text-sm text-slate-500">No academic assessments recorded.</p>}</div>
                <div><h3 className="mb-3 font-black">Examination history</h3>{detail.examinations.length ? <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[540px] text-left text-sm"><thead className="bg-slate-50 dark:bg-white/5 text-xs text-slate-500"><tr><th className="p-3">Examination</th><th className="p-3">Submitted</th><th className="p-3">Status</th><th className="p-3">Score</th></tr></thead><tbody>{detail.examinations.map(a => <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-3"><p className="font-bold">{a.title}</p><p className="text-xs text-slate-500">{a.subject}</p></td><td className="p-3">{dateLabel(a.submittedAt)}</td><td className="p-3 capitalize">{a.status.replace(/_/g, ' ')}</td><td className="p-3 font-bold">{scoreLabel(a.score, a.maxScore)}</td></tr>)}</tbody></table></div> : <p className="rounded-2xl bg-slate-50 dark:bg-white/5 p-6 text-sm text-slate-500">No examination attempts recorded.</p>}</div>
              </div>}
              {tab === 'activity' && <div><h3 className="mb-3 font-black">Learner activity timeline</h3>{detail.activities.length ? <div className="space-y-3">{detail.activities.map(a => <article key={a.id} className="relative rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><div className="flex items-start gap-3"><span className="mt-0.5 rounded-xl bg-brand-red/10 p-2 text-brand-red"><Activity size={16}/></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{a.message}</p><p className="mt-1 text-xs text-slate-500">{dateLabel(a.createdAt)} · {a.type} · {a.actorRole || 'Recorded activity'}</p>{a.route && <p className="mt-1 break-all text-xs text-slate-500">{a.route}</p>}</div></div></article>)}</div> : <p className="rounded-2xl bg-slate-50 dark:bg-white/5 p-6 text-sm text-slate-500">No activity logs are available for this learner yet. New tracked activity will appear here when recorded.</p>}</div>}
              {tab === 'attendance' && <div><h3 className="mb-3 font-black">Attendance history</h3>{detail.attendance.length ? <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[420px] text-left text-sm"><thead className="bg-slate-50 dark:bg-white/5 text-xs text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Class</th><th className="p-3">Status</th><th className="p-3">Notes</th></tr></thead><tbody>{detail.attendance.map(a => <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-3">{dateLabel(a.date)}</td><td className="p-3">{a.className || detail.learner.className}</td><td className="p-3">{a.status}</td><td className="p-3">{a.notes || '—'}</td></tr>)}</tbody></table></div> : <p className="rounded-2xl bg-slate-50 dark:bg-white/5 p-6 text-sm text-slate-500">No attendance records recorded.</p>}</div>}
            </div> : <p className="py-8 text-sm text-slate-500">Learner details are unavailable.</p>}
          </>}
        </div>
      </div>}
    </section>
  </div>;
};

export default SchoolLearnerInsights;
