import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { academicApiWithFallback as api } from '../../lib/academicFallback';
import { AlertCircle, ArrowDown, CheckCircle2, Flag, Loader2, Plus, School, Trash2, UserRound, X } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { DashboardGreeting } from '../../components/portal/DashboardGreeting';
export type MilestoneCenterRole = 'student' | 'staff' | 'parent' | 'school';
type Target = { id: string; name: string; plan?: string };
type Milestone = { id: string; title: string; description?: string; targetType: 'STUDENT' | 'SCHOOL'; targetId: string; status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED'; position: number; dueDate?: string | null; completedAt?: string | null; ownerName?: string };
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)) : 'No date set';
const statusText = (s: string) => s.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const MilestoneCenter: React.FC<{ role: MilestoneCenterRole }> = ({ role }) => {
  const [students, setStudents] = useState<Target[]>([]); const [schools, setSchools] = useState<Target[]>([]);
  const [targetType, setTargetType] = useState<'STUDENT' | 'SCHOOL'>(() => role === 'school' ? 'SCHOOL' : 'STUDENT');
  const [targetId, setTargetId] = useState(() => role === 'school' ? sessionStorage.getItem('schoolDocId') || '' : '');
  const [milestones, setMilestones] = useState<Milestone[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [showBuilder, setShowBuilder] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '' });
  const loadTargets = useCallback(async () => {
    try {
      const [studentData, schoolData] = await Promise.all([api('/api/academic-students'), api('/api/academic-schools')]);
      const stList = (studentData.students || []).map((s: any) => ({ id: s.id, name: s.fullName, plan: s.plan }));
      const scList = (schoolData.schools || []).map((s: any) => ({ id: s.id, name: s.name }));
      setStudents(stList);
      setSchools(scList);
      if (role === 'school' && schoolData.schools?.[0]?.id) {
        setTargetId(prev => prev || schoolData.schools[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load targets.');
    }
  }, [role]);

  const loadMilestones = useCallback(async () => {
    if (!targetId) {
      setMilestones([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/academic-milestones?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`);
      setMilestones(data.milestones || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load milestones.');
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  useEffect(() => {
    if (role === 'staff' && targetType === 'STUDENT' && students.length) {
      setTargetId(prev => prev || students[0].id);
    }
    if (role === 'staff' && targetType === 'SCHOOL' && schools.length) {
      setTargetId(prev => prev || schools[0].id);
    }
  }, [role, targetType, students.length, schools.length]);

  useEffect(() => {
    loadMilestones();
  }, [loadMilestones]);
  const activeTarget = useMemo(() => (targetType === 'STUDENT' ? students : schools).find(t => t.id === targetId), [targetType, students, schools, targetId]); const completed = milestones.filter(m => m.status === 'COMPLETED').length;
  const create = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setError(''); try { await api('/api/academic-milestones', { method: 'POST', body: JSON.stringify({ action: 'create', targetType, targetId, title: form.title, description: form.description, dueDate: form.dueDate || null, position: milestones.length + 1 }) }); setSuccess('Milestone added to the learning plan.'); setForm({ title: '', description: '', dueDate: '' }); setShowBuilder(false); await loadMilestones(); } catch (x) { setError(x instanceof Error ? x.message : 'Could not create milestone.'); } finally { setSaving(false); } };
  const changeStatus = async (m: Milestone, status: string) => { setError(''); try { await api('/api/academic-milestones', { method: 'POST', body: JSON.stringify({ action: status === 'COMPLETED' ? 'complete' : 'status', milestoneId: m.id, status }) }); setSuccess(status === 'COMPLETED' ? 'Milestone completed and the connected portals were notified.' : 'Milestone status updated.'); await loadMilestones(); } catch (x) { setError(x instanceof Error ? x.message : 'Could not update milestone.'); } };
  const remove = async (m: Milestone) => { if (!window.confirm(`Remove “${m.title}” from this learning plan?`)) return; try { await api('/api/academic-milestones', { method: 'POST', body: JSON.stringify({ action: 'delete', milestoneId: m.id, targetType: m.targetType, targetId: m.targetId }) }); setSuccess('Milestone removed.'); await loadMilestones(); } catch (x) { setError(x instanceof Error ? x.message : 'Could not remove milestone.'); } };
  const canBuild = role === 'staff'; const title = role === 'staff' ? 'Milestone Builder' : role === 'student' ? 'My Learning Plan' : role === 'parent' ? 'Learning Milestones' : 'School Milestones';
  const subtitleText = role === 'staff' ? 'Build a clear roadmap for each assigned learner or school and update progress as work is completed.' : 'See the roadmap created for this learner or school and follow completed milestones.';
  return <div className="dashboard-interface space-y-6">
    <SEO title={`${title} | Jaystarbliss Studios`} description={subtitleText} noindex={true} />
    {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-3"><CheckCircle2 size={18} />{success}<button className="ml-auto" onClick={() => setSuccess('')} aria-label="Dismiss"><X size={16} /></button></div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-3"><AlertCircle size={18} />{error}<button className="ml-auto" onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
    {canBuild && <div className="pro-surface rounded-2xl p-5 flex flex-col lg:flex-row gap-4 lg:items-end"><div className="flex-1"><label className="block text-xs font-bold mb-2 text-slate-600 dark:text-slate-300">Build plan for</label><div className="flex gap-2 mb-3"><button type="button" onClick={() => { setTargetType('STUDENT'); setTargetId(''); }} className={`min-h-10 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 ${targetType === 'STUDENT' ? 'bg-brand-red text-white' : 'border border-slate-200 dark:border-slate-700'}`}><UserRound size={15}/> Student</button><button type="button" onClick={() => { setTargetType('SCHOOL'); setTargetId(''); }} className={`min-h-10 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 ${targetType === 'SCHOOL' ? 'bg-brand-red text-white' : 'border border-slate-200 dark:border-slate-700'}`}><School size={15}/> School</button></div><select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"><option value="">Select {targetType === 'STUDENT' ? 'student' : 'school'}</option>{(targetType === 'STUDENT' ? students : schools).map(t => <option key={t.id} value={t.id}>{t.name}{t.plan ? ` • ${t.plan}` : ''}</option>)}</select></div><button type="button" disabled={!targetId} onClick={() => setShowBuilder(true)} className="min-h-11 px-5 rounded-xl bg-brand-red text-white text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"><Plus size={17}/> Add Milestone</button></div>}
    {role === 'parent' && students.length > 0 && <div className="pro-surface rounded-2xl p-5"><label className="block text-xs font-bold mb-2 text-slate-600 dark:text-slate-300">Child</label><select value={targetId || students[0]?.id} onChange={e => setTargetId(e.target.value)} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm">{students.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
    {role === 'student' && students.length > 1 && <div className="pro-surface rounded-2xl p-5"><label className="block text-xs font-bold mb-2 text-slate-600 dark:text-slate-300">Learner</label><select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm">{students.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
    {activeTarget && <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-white/60 dark:bg-slate-900/40"><div><p className="font-black text-slate-900 dark:text-white">{activeTarget.name}</p><p className="text-xs text-slate-500">{targetType === 'STUDENT' ? activeTarget.plan || 'Assigned learning track' : 'Institutional roadmap'}</p></div><p className="text-sm font-bold text-slate-700 dark:text-slate-300">{completed}/{milestones.length} completed</p></div>}
    <div className="pro-surface rounded-3xl p-5 md:p-7"><div className="mb-5"><h2 className="text-xl font-black text-slate-900 dark:text-white">Roadmap</h2><p className="text-xs text-slate-500 mt-1">Completion is reflected in the connected learner, parent or school view.</p></div>{loading ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto animate-spin mb-2" size={22}/>Loading roadmap…</div> : milestones.length === 0 ? <div className="py-14 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl"><Flag className="mx-auto text-slate-300 mb-3" size={38}/><p className="font-bold text-slate-900 dark:text-white">No milestones yet</p><p className="text-sm text-slate-500 mt-1">{canBuild ? 'Add the first milestone to start the roadmap.' : 'Your tutor has not published a milestone plan yet.'}</p></div> : <div className="space-y-3">{milestones.map((m, index) => <div key={m.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><div className="flex items-start gap-3"><div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${m.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{m.status === 'COMPLETED' ? <CheckCircle2 size={18}/> : <span className="text-xs font-black">{index + 1}</span>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center"><h3 className="font-black text-sm text-slate-900 dark:text-white">{m.title}</h3><span className="text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200 text-slate-600">{statusText(m.status)}</span></div>{m.description && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">{m.description}</p>}<p className="text-xs text-slate-500 mt-2">{m.dueDate ? `Target date: ${date(m.dueDate)}` : 'No target date'}</p></div>{canBuild && <div className="flex items-center gap-1"><button type="button" onClick={() => changeStatus(m, m.status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title={m.status === 'COMPLETED' ? 'Reopen milestone' : 'Mark complete'}>{m.status === 'COMPLETED' ? <ArrowDown size={15}/> : <CheckCircle2 size={15}/>}</button><button type="button" onClick={() => remove(m)} className="p-2 rounded-lg hover:bg-red-50 text-red-600" title="Remove milestone"><Trash2 size={15}/></button></div>}</div></div>)}</div>}</div>
    {showBuilder && <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6"><div className="flex items-center justify-between mb-5"><div><h3 className="text-lg font-black text-slate-900 dark:text-white">Add milestone</h3><p className="text-xs text-slate-500 mt-1">{activeTarget?.name || 'Selected target'}</p></div><button type="button" onClick={() => setShowBuilder(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X size={18}/></button></div><form onSubmit={create} className="space-y-4"><label className="block"><span className="block text-xs font-bold mb-1.5">Milestone title</span><input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Complete Python Functions" className="input"/></label><label className="block"><span className="block text-xs font-bold mb-1.5">Description</span><textarea rows={5} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="What does success look like?" className="input resize-y"/></label><label className="block"><span className="block text-xs font-bold mb-1.5">Target date (optional)</span><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="input"/></label><div className="flex justify-end gap-3 pt-3"><button type="button" onClick={() => setShowBuilder(false)} className="min-h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold">Cancel</button><button type="submit" disabled={saving} className="min-h-11 px-5 rounded-xl bg-brand-red text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">{saving && <Loader2 size={15} className="animate-spin"/>}Save milestone</button></div></form></div></div>}
  </div>;
};
export default MilestoneCenter;
