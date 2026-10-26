import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, BookOpen, CalendarCheck, CheckCircle2, ClipboardList, Flag, Loader2, Save, UserRound } from 'lucide-react';
import { academicApiWithFallback as api } from '../../lib/academicFallback';
import SEO from '../../components/ui/SEO';
import { DashboardGreeting } from '../../components/portal/DashboardGreeting';
import TutorLearningTracksManager from '../../components/portal/TutorLearningTracksManager';

type Student = { id: string; fullName: string; plan?: string; email?: string; username?: string };
type Attendance = { id: string; date?: string; status: string; notes?: string };

const StaffStudentWorkspace: React.FC = () => {
  const { studentId = '' } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), status: 'PRESENT', notes: '' });

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('');
      try {
        const [students, attendanceData] = await Promise.all([
          api('/api/academic-students'),
          api(`/api/academic-attendance?studentId=${encodeURIComponent(studentId)}`)
        ]);
        const found = (students.students || []).find((s: Student) => s.id === studentId);
        if (!found) throw new Error('This student is not assigned to your workspace.');
        setStudent(found);
        setAttendance(attendanceData.records || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load student workspace.');
      } finally { setLoading(false); }
    };
    void load();
  }, [studentId]);

  const rate = useMemo(() => {
    if (!attendance.length) return null;
    const attended = attendance.filter(a => ['PRESENT', 'LATE'].includes(a.status)).length;
    return Math.round(attended / attendance.length * 100);
  }, [attendance]);

  const saveAttendance = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api('/api/academic-attendance', { method: 'POST', body: JSON.stringify({ studentId, ...form }) });
      setSuccess('Attendance saved.');
      const data = await api(`/api/academic-attendance?studentId=${encodeURIComponent(studentId)}`);
      setAttendance(data.records || []);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not save attendance.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-12 flex justify-center text-sm text-slate-500"><Loader2 className="animate-spin mr-2" size={18}/>Loading student workspace…</div>;
  if (!student) return <div className="py-12 text-center"><AlertCircle className="mx-auto text-red-500 mb-3" size={32}/><p className="font-bold">{error || 'Student not found.'}</p><Link to="/portal/staff" className="text-sm text-brand-red font-bold mt-3 inline-block">Return to dashboard</Link></div>;

  return (
    <div className="space-y-6">
      <SEO title={`${student.fullName} | Tutor Workspace`} description="Assigned student learning workspace." noindex={true}/>
      <div><Link to="/portal/staff" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-brand-red"><ArrowLeft size={15}/> Back to staff dashboard</Link></div>
      <DashboardGreeting name={student.fullName} role="Assigned Student Workspace" subtitle={`${student.plan || 'Learning track'} • Manage academic activity, assignments, attendance and learning progress.`}/>
      {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-3"><CheckCircle2 size={18}/>{success}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-3"><AlertCircle size={18}/>{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="pro-surface rounded-2xl p-5"><UserRound size={18}/><p className="text-xs text-slate-500 mt-3">Learner</p><p className="font-black text-slate-900 dark:text-white mt-1">{student.fullName}</p><p className="text-xs text-slate-500">@{student.username || 'student'}</p></div>
        <div className="pro-surface rounded-2xl p-5"><CalendarCheck size={18}/><p className="text-xs text-slate-500 mt-3">Attendance</p><p className="text-2xl font-black text-slate-900 dark:text-white">{rate == null ? '—' : `${rate}%`}</p></div>
        <div className="pro-surface rounded-2xl p-5"><ClipboardList size={18}/><p className="text-xs text-slate-500 mt-3">Academic tools</p><div className="flex flex-wrap gap-2 mt-2"><Link to={`/portal/staff/assignments?studentId=${student.id}`} className="text-xs font-bold text-brand-red">Assignments</Link><span className="text-slate-300">•</span><Link to={`/portal/staff/milestones?studentId=${student.id}`} className="text-xs font-bold text-brand-red">Milestones</Link></div></div>
      </div>

      <TutorLearningTracksManager studentId={student.id} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="pro-surface rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-5"><div className="h-10 w-10 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center"><CalendarCheck size={19}/></div><div><h2 className="font-black">Record attendance</h2><p className="text-xs text-slate-500">One attendance record per learner per date.</p></div></div>
          <form onSubmit={saveAttendance} className="space-y-4">
            <label className="block"><span className="block text-xs font-bold mb-1.5">Class date</span><input required type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="input"/></label>
            <label className="block"><span className="block text-xs font-bold mb-1.5">Status</span><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input"><option value="PRESENT">Present</option><option value="LATE">Late</option><option value="ABSENT">Absent</option><option value="EXCUSED">Excused</option></select></label>
            <label className="block"><span className="block text-xs font-bold mb-1.5">Notes (optional)</span><textarea rows={4} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional attendance note" className="input resize-y"/></label>
            <button disabled={saving} className="btn-primary"><Save size={16}/>{saving ? 'Saving…' : 'Save attendance'}</button>
          </form>
        </section>
        <section className="pro-surface rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-5"><div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><BookOpen size={19}/></div><div><h2 className="font-black">Recent attendance</h2><p className="text-xs text-slate-500">The learner and parent can use the same record.</p></div></div>
          {attendance.length === 0 ? <div className="py-10 text-center text-sm text-slate-500">No attendance records yet.</div> : <div className="space-y-2 max-h-80 overflow-y-auto">{attendance.slice(0, 20).map(a => <div key={a.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900 dark:text-white">{a.date ? new Date(a.date).toLocaleDateString('en-NG') : '—'}</p>{a.notes && <p className="text-xs text-slate-500 mt-1">{a.notes}</p>}</div><span className="text-[10px] font-black uppercase rounded-full border px-2 py-1">{a.status}</span></div>)}</div>}
        </section>
      </div>

      <div className="pro-surface rounded-2xl p-5 flex flex-wrap gap-3"><Link to={`/portal/staff/assignments?studentId=${student.id}`} className="min-h-11 rounded-xl bg-brand-red text-white px-4 inline-flex items-center gap-2 text-xs font-bold"><ClipboardList size={15}/> Manage assignments</Link><Link to={`/portal/staff/milestones?studentId=${student.id}`} className="min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-4 inline-flex items-center gap-2 text-xs font-bold"><Flag size={15}/> Manage milestones</Link></div>
    </div>
  );
};

export default StaffStudentWorkspace;
