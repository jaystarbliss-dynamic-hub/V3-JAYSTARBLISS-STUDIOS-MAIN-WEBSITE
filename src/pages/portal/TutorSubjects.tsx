import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, XCircle, Send, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { SUBJECT_TAXONOMY } from '../../data/subjectCatalog';
import type { SubjectCategory } from '../../data/subjectCatalog';
import SEO from '../../components/ui/SEO';
import { useToast } from '../../contexts/ToastContext';

type Application = { id: string; subjectId: string; subjectName: string; category: string; status: 'pending' | 'approved' | 'rejected'; rejectionReason?: string };
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const TutorSubjects: React.FC = () => {
  const { toast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [openCategory, setOpenCategory] = useState<string | null>('school');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'tutorSubjectApplications'), where('tutorId', '==', uid)));
      setApplications(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Application, 'id'>) })));
    } catch (error) {
      console.error(error);
      toast.error('Could not load your subject applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const existing = useMemo(() => new Set(applications.map(a => a.subjectId)), [applications]);
  const categories = useMemo(() => SUBJECT_TAXONOMY.map(c => ({ ...c, subjects: c.subjects.filter(s => s.toLowerCase().includes(search.toLowerCase())) })).filter(c => c.subjects.length), [search]);
  const toggle = (subject: string) => {
    const id = slug(subject);
    if (existing.has(id)) return;
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  };

  const submit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !selected.length) return;
    setLoading(true);
    try {
      const rows = SUBJECT_TAXONOMY.flatMap(c => c.subjects.map(s => ({ subjectId: slug(s), subjectName: s, categoryId: c.id, categoryName: c.title }))).filter(x => selected.includes(x.subjectId));
      await Promise.all(rows.map(x => addDoc(collection(db, 'tutorSubjectApplications'), { tutorId: uid, tutorEmail: auth.currentUser?.email || '', ...x, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));
      setSelected([]);
      toast.success('Subject applications submitted for admin approval.');
      await load();
    } catch (error) {
      console.error(error);
      toast.error('Some applications could not be submitted.');
      setLoading(false);
    }
  };

  const statusIcon = (app: Application) => app.status === 'approved' ? <CheckCircle2 size={15} className="text-emerald-500" /> : app.status === 'rejected' ? <XCircle size={15} className="text-rose-500" /> : <Clock3 size={15} className="text-amber-500" />;
  const statusText = (app: Application) => app.status === 'approved' ? 'Approved' : app.status === 'rejected' ? 'Rejected' : 'Pending admin review';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <SEO title="Subjects I Teach | Jaystarbliss Studios" description="Choose the subjects and skills you are qualified to teach." noindex />
      <div className="pro-surface rounded-3xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">Select the subjects and skills you can teach. Each selection is reviewed before it becomes part of your tutor profile.</p>
          <div className="relative w-full md:w-72"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:border-brand-red" /></div>
        </div>

        <div className="mt-6 grid gap-3">{categories.map((category: SubjectCategory) => { const open = openCategory === category.id; return <div key={category.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"><button type="button" onClick={() => setOpenCategory(open ? null : category.id)} className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"><div><div className="font-black text-sm text-slate-900 dark:text-white">{category.title}</div><div className="text-xs text-slate-500 mt-0.5">{category.description}</div></div>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{open && <div className="p-4 pt-0 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{category.subjects.map(subject => { const id = slug(subject); const app = applications.find(a => a.subjectId === id); const chosen = selected.includes(id); return <button key={id} type="button" disabled={!!app} onClick={() => toggle(subject)} className={'text-left p-3 rounded-xl border transition-all ' + (app ? 'opacity-90 cursor-not-allowed border-slate-200 dark:border-slate-700' : chosen ? 'border-brand-red bg-brand-red/10' : 'border-slate-200 dark:border-slate-800 hover:border-brand-red/50 bg-white dark:bg-slate-950')}><div className="flex items-start justify-between gap-2"><span className="text-xs font-bold text-slate-900 dark:text-white">{subject}</span>{app && statusIcon(app)}</div><span className="text-[10px] text-slate-500 mt-1 block">{app ? statusText(app) : chosen ? 'Selected' : 'Click to select'}</span>{app?.status === 'rejected' && app.rejectionReason && <span className="text-[10px] text-rose-600 dark:text-rose-400 mt-1.5 block leading-relaxed">Reason: {app.rejectionReason}</span>}</button>; })}</div>}</div>; })}</div>

        {selected.length > 0 && <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"><div><div className="text-sm font-black text-slate-900 dark:text-white">{selected.length} subject{selected.length === 1 ? '' : 's'} selected</div><div className="text-xs text-slate-500">They will remain pending until reviewed.</div></div><button type="button" disabled={loading} onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-red text-white text-xs font-black disabled:opacity-60"><Send size={15} />{loading ? 'Submitting...' : 'Request Approval'}</button></div>}

        <div className="mt-6"><h2 className="text-sm font-black text-slate-900 dark:text-white mb-3">My Subject Applications</h2>{loading ? <p className="text-xs text-slate-500">Loading subject applications...</p> : <div className="space-y-2">{applications.length === 0 ? <p className="text-xs text-slate-500">No subject applications yet.</p> : applications.map(app => <div key={app.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-900 dark:text-white">{app.subjectName}</p><p className="text-[10px] text-slate-500 mt-1">{statusText(app)}</p>{app.status === 'rejected' && app.rejectionReason && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">{app.rejectionReason}</p>}</div>{statusIcon(app)}</div>)}</div>}</div>
      </div>
    </div>
  );
};

export default TutorSubjects;
