import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, Search, Users, Clock3, ExternalLink, ChevronDown, ChevronUp, Mail, ShieldCheck } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { Link } from 'react-router-dom';
import SEO from '../../components/ui/SEO';
import { SUBJECT_TAXONOMY } from '../../data/subjectCatalog';
import { useToast } from '../../contexts/ToastContext';
import { resolveRealName } from '../../utils/userNames';

type AppRow = { id: string; tutorId: string; tutorEmail?: string; subjectId: string; subjectName: string; categoryId?: string; categoryName?: string; status: string; createdAt?: any };
type TutorProfile = { name: string; email: string; rank: string };
type PendingGroup = { tutorId: string; profile: TutorProfile; applications: AppRow[] };

const AdminTutorSubjects: React.FC = () => {
  const { toast } = useToast();
  const [applications, setApplications] = useState<AppRow[]>([]);
  const [approved, setApproved] = useState<AppRow[]>([]);
  const [tutorProfiles, setTutorProfiles] = useState<Record<string, TutorProfile>>({});
  const [tab, setTab] = useState<'pending' | 'approved'>('pending');
  const [subject, setSubject] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedTutor, setExpandedTutor] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingGroup | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pendingSnap, approvedSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'tutorSubjectApplications'), where('status', '==', 'pending'))),
        getDocs(collection(db, 'tutorSubjects')),
        getDocs(collection(db, 'users'))
      ]);
      const pendingRows = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppRow));
      const approvedRows = approvedSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppRow));
      const profiles: Record<string, TutorProfile> = {};
      usersSnap.docs.forEach(d => {
        const data = d.data();
        profiles[d.id] = {
          name: resolveRealName(data, data.email, 'Faculty Instructor'),
          email: String(data.email || ''),
          rank: String(data.rank || data.tutorRank || data.title || 'Faculty Lead')
        };
      });
      setApplications(pendingRows);
      setApproved(approvedRows);
      setTutorProfiles(profiles);
    } catch (error) {
      console.error(error);
      toast.error('Could not load tutor subject records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const pendingGroups = useMemo<PendingGroup[]>(() => {
    const map = new Map<string, PendingGroup>();
    applications.forEach(row => {
      const profile = tutorProfiles[row.tutorId] || { name: resolveRealName(null, row.tutorEmail, 'Faculty Instructor'), email: row.tutorEmail || '', rank: 'Faculty Lead' };
      const existing = map.get(row.tutorId);
      if (existing) existing.applications.push(row);
      else map.set(row.tutorId, { tutorId: row.tutorId, profile, applications: [row] });
    });
    const q = search.trim().toLowerCase();
    return Array.from(map.values()).filter(group => !q || group.profile.name.toLowerCase().includes(q) || group.profile.email.toLowerCase().includes(q) || group.tutorId.toLowerCase().includes(q) || group.applications.some(a => a.subjectName.toLowerCase().includes(q))).sort((a, b) => a.profile.name.localeCompare(b.profile.name));
  }, [applications, tutorProfiles, search]);

  const review = async (group: PendingGroup, action: 'approve' | 'reject', reason = '') => {
    if (action === 'reject' && !reason.trim()) { toast.error('Add a reason before rejecting the request.'); return; }
    const user = auth.currentUser;
    if (!user) { toast.error('Your admin session has expired. Please sign in again.'); return; }
    setReviewing(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/.netlify/functions/tutor-subject-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, applicationIds: group.applications.map(item => item.id), reason: reason.trim() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to review this request.');
      toast.success(action === 'approve' ? `${group.profile.name}'s subject request was approved.` : `${group.profile.name}'s subject request was rejected and the tutor was notified.`);
      setRejecting(null);
      setRejectionReason('');
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to review this request.');
    } finally {
      setReviewing(false);
    }
  };

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return approved.filter(row => {
      const profile = tutorProfiles[row.tutorId];
      return (!subject || row.subjectName === subject) && (!q || row.subjectName.toLowerCase().includes(q) || row.tutorId.toLowerCase().includes(q) || profile?.name?.toLowerCase().includes(q));
    });
  }, [approved, subject, search, tutorProfiles]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <SEO title="Tutor Subject Approvals | Jaystarbliss Studios" description="Review tutor subject applications and view approved tutors by subject." noindex />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs sm:text-sm text-slate-500">Review subject requests by tutor, approve them together, or reject them with clear feedback.</p>
        <div className="flex gap-2 shrink-0"><button type="button" onClick={() => setTab('pending')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab === 'pending' ? 'bg-brand-red text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>Pending ({applications.length})</button><button type="button" onClick={() => setTab('approved')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab === 'approved' ? 'bg-brand-red text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>Approved Tutors</button></div>
      </div>

      {loading ? <div className="py-12 text-center text-xs text-slate-500">Loading tutor subject records...</div> : tab === 'pending' ? (
        <div className="space-y-4">
          <div className="relative max-w-xl"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tutor name, email, ID or subject..." className="w-full pl-9 pr-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm outline-none focus:border-brand-red" /></div>
          {pendingGroups.map(group => {
            const open = expandedTutor === group.tutorId;
            return <div key={group.tutorId} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <button type="button" onClick={() => setExpandedTutor(open ? null : group.tutorId)} className="w-full text-left p-5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center gap-4"><div className="w-11 h-11 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0"><Users size={19} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-black text-slate-900 dark:text-white">{group.profile.name}</h2><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{group.profile.rank}</span></div><div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><Mail size={12} /> {group.profile.email || 'No email recorded'}</span><span>{group.applications.length} subject{group.applications.length === 1 ? '' : 's'} awaiting approval</span></div></div>{open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}</div>
              </button>
              {open && <div className="border-t border-slate-200 dark:border-slate-800"><div className="divide-y divide-slate-100 dark:divide-slate-800">{group.applications.map(row => <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-4"><div><p className="text-xs font-black text-slate-900 dark:text-white">{row.subjectName}</p><p className="text-[11px] text-slate-500 mt-0.5">{row.categoryName || 'Teaching subject'}</p></div><Clock3 size={15} className="text-amber-500 shrink-0" /></div>)}</div><div className="p-5 flex flex-col sm:flex-row gap-2 border-t border-slate-200 dark:border-slate-800"><button type="button" disabled={reviewing} onClick={() => void review(group, 'approve')} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50"><Check size={14} /> Approve All Subjects</button><button type="button" disabled={reviewing} onClick={() => { setRejecting(group); setRejectionReason(''); }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black disabled:opacity-50"><X size={14} /> Reject Request</button></div></div>}
            </div>;
          })}
          {pendingGroups.length === 0 && <div className="p-10 text-center text-xs text-slate-500 border border-dashed rounded-2xl">No pending subject applications.</div>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tutor name, ID or subject..." className="w-full pl-9 pr-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm outline-none" /></div><select value={subject} onChange={e => setSubject(e.target.value)} className="px-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"><option value="">All approved subjects</option>{SUBJECT_TAXONOMY.flatMap(c => c.subjects).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{matches.map(row => { const profile = tutorProfiles[row.tutorId] || { name: row.tutorEmail || 'Tutor', email: row.tutorEmail || '', rank: 'Tutor' }; return <div key={row.id} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black text-slate-900 dark:text-white">{row.subjectName}</h2><p className="text-xs text-slate-500 mt-1">{row.categoryName || 'Teaching subject'}</p></div><ShieldCheck size={18} className="text-emerald-500" /></div><p className="mt-4 text-sm font-black text-slate-900 dark:text-white">{profile.name}</p><p className="text-[11px] text-slate-500 mt-1">{profile.rank}</p><Link to={'/admin/staff?subject=' + encodeURIComponent(row.subjectName) + '&tutorId=' + encodeURIComponent(row.tutorId)} className="mt-4 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-brand-red text-white text-xs font-black"><ExternalLink size={14} /> Open Staff Management</Link></div>; })}</div>
          {matches.length === 0 && <div className="p-10 text-center text-xs text-slate-500 border border-dashed rounded-2xl">No approved tutors match this subject.</div>}
        </div>
      )}

      {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-wider font-black text-brand-red">Reject Subject Request</p><h2 className="text-lg font-black text-slate-900 dark:text-white mt-1">{rejecting.profile.name}</h2><p className="text-xs text-slate-500 mt-1">The tutor will receive this reason in the portal and by email.</p></div><button type="button" onClick={() => setRejecting(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X size={17} /></button></div><div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4"><p className="text-xs font-bold text-slate-700 dark:text-slate-200">Requested subjects</p><p className="text-xs text-slate-500 mt-1">{rejecting.applications.map(a => a.subjectName).join(', ')}</p></div><textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={5} autoFocus placeholder="Explain why the subject request is being rejected..." className="mt-4 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-4 text-sm outline-none focus:border-brand-red resize-none" /><div className="mt-4 flex gap-2"><button type="button" onClick={() => setRejecting(null)} className="flex-1 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black">Cancel</button><button type="button" disabled={reviewing || !rejectionReason.trim()} onClick={() => void review(rejecting, 'reject', rejectionReason)} className="flex-1 min-h-11 rounded-xl bg-brand-red text-white text-xs font-black disabled:opacity-50">{reviewing ? 'Rejecting...' : 'Reject & Notify Tutor'}</button></div></div></div>}
    </div>
  );
};

export default AdminTutorSubjects;
