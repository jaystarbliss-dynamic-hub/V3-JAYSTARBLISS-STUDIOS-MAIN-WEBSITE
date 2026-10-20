import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../../lib/firebase';
import { AlertCircle, BookOpen, CheckCircle2, ClipboardList, ExternalLink, FileText, GraduationCap, Loader2, MessageSquare, Send, UserRound, X } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { DashboardGreeting } from '../../components/portal/DashboardGreeting';

export type AssignmentCenterRole = 'student' | 'staff' | 'parent' | 'school';
type Student = { id: string; fullName: string; username?: string; email?: string; plan?: string; schoolId?: string; parentId?: string; tutorId?: string; firebaseUid?: string };
type Assignment = { id: string; title: string; instructions: string; tutorName?: string; studentName?: string; dueDate?: string | null; status: string; grade?: number | null; feedback?: string | null; submissionText?: string | null; submissionUrl?: string | null; submittedAt?: string | null; reviewedAt?: string | null; reviewStatus?: string | null; resourceUrl?: string | null; resourceTitle?: string | null; createdAt?: string | null };
type Draft = { text: string; url: string; fileUrl: string; fileName: string };

const api = async (path: string, options: RequestInit = {}) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const token = await user.getIdToken();
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
};

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const statusLabel = (status: string) => status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const statusClass = (status: string) => status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status === 'SUBMITTED' || status === 'AWAITING_REVIEW' ? 'bg-blue-50 text-blue-700 border-blue-200' : status === 'RESUBMISSION_REQUIRED' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200';

const AssignmentCenter: React.FC<{ role: AssignmentCenterRole }> = ({ role }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [reviewing, setReviewing] = useState<Assignment | null>(null);
  const [submittingId, setSubmittingId] = useState('');
  const [uploadingId, setUploadingId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [form, setForm] = useState({ title: '', instructions: '', dueDate: '', resourceTitle: '', resourceUrl: '' });
  const [reviewForm, setReviewForm] = useState({ grade: '', feedback: '', reviewStatus: 'COMPLETED' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [assignmentData, studentData] = await Promise.all([
        api(`/api/academic-assignments?action=list${selectedStudentId ? `&studentId=${encodeURIComponent(selectedStudentId)}` : ''}`),
        api('/api/academic-students'),
      ]);
      setAssignments(assignmentData.assignments || []);
      setStudents(studentData.students || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load assignments.'); }
    finally { setLoading(false); }
  }, [selectedStudentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (role === 'parent' && students.length) {
      setSelectedStudentId(prev => prev || students[0].id);
    }
  }, [role, students.length]);

  const pendingReview = useMemo(() => assignments.filter(a => a.status === 'SUBMITTED').length, [assignments]);
  const completed = useMemo(() => assignments.filter(a => a.status === 'COMPLETED').length, [assignments]);
  const activeStudent = students.find(s => s.id === selectedStudentId);

  const createAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudentId) { setError('Select a student first.'); return; }
    setError('');
    try {
      await api('/api/academic-assignments', { method: 'POST', body: JSON.stringify({ action: 'create', studentId: selectedStudentId, ...form }) });
      setSuccess('Assignment published. The student and linked parent have been notified.');
      setForm({ title: '', instructions: '', dueDate: '', resourceTitle: '', resourceUrl: '' });
      setShowCreate(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not publish assignment.'); }
  };

  const updateDraft = (assignmentId: string, patch: Partial<Draft>) => setDrafts(current => ({ ...current, [assignmentId]: { text: current[assignmentId]?.text || '', url: current[assignmentId]?.url || '', fileUrl: current[assignmentId]?.fileUrl || '', fileName: current[assignmentId]?.fileName || '', ...patch } }));
  const submitAssignment = async (assignmentId: string) => {
    const draft = drafts[assignmentId] || { text: '', url: '', fileUrl: '', fileName: '' };
    setSubmittingId(assignmentId); setError('');
    try {
      await api('/api/academic-assignments', { method: 'POST', body: JSON.stringify({ action: 'submit', assignmentId, submissionText: draft.text, submissionUrl: draft.url, submissionFileUrl: draft.fileUrl, submissionFileName: draft.fileName }) });
      setSuccess('Your assignment has been submitted to your tutor.');
      setDrafts(current => ({ ...current, [assignmentId]: { text: '', url: '', fileUrl: '', fileName: '' } }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit assignment.'); }
    finally { setSubmittingId(''); }
  };

  const uploadSubmissionFile = async (assignmentId: string, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Please choose a file smaller than 10 MB.'); return; }
    const cloudName = localStorage.getItem('cloudinary_cloud_name') || 'jaystarbliss';
    const uploadPreset = localStorage.getItem('cloudinary_upload_preset') || 'jaystarbliss_cms';
    if (!cloudName || !uploadPreset) { setError('File uploads are not configured. Please paste a share link instead.'); return; }
    setUploadingId(assignmentId); setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);
      formData.append('folder', 'jdi/assignment-submissions/' + assignmentId);
      const response = await fetch('https://api.cloudinary.com/v1_1/' + encodeURIComponent(cloudName) + '/auto/upload', { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.secure_url) throw new Error(data.error?.message || 'Unable to upload this file. You can paste a share link instead.');
      updateDraft(assignmentId, { fileUrl: data.secure_url, fileName: file.name });
      setSuccess('File attached: ' + file.name);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to upload assignment file.'); }
    finally { setUploadingId(''); }
  };

  const reviewAssignment = async (event: React.FormEvent) => {
    event.preventDefault(); if (!reviewing) return;
    setError('');
    try {
      await api('/api/academic-assignments', { method: 'POST', body: JSON.stringify({ action: 'review', assignmentId: reviewing.id, grade: reviewForm.grade, feedback: reviewForm.feedback, reviewStatus: reviewForm.reviewStatus }) });
      setSuccess(reviewForm.reviewStatus === 'COMPLETED' ? 'Assignment reviewed and result sent to the learner.' : 'Resubmission request sent to the learner.');
      setReviewing(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the review.'); }
  };

  const title = role === 'staff' ? 'Assignments & Review' : role === 'student' ? 'My Assignments' : role === 'parent' ? 'Learning Assignments' : 'School Assignments';
  const subtitle = role === 'staff' ? 'Create, publish, review and give feedback on work from your assigned learners.' : role === 'student' ? 'See work from your tutor, submit your work, and track feedback in one place.' : role === 'parent' ? 'Follow each child’s assigned work, submission status and tutor feedback.' : 'Monitor assignment activity for learners connected to your school.';

  return <div className="dashboard-interface space-y-6">
    <SEO title={`${title} | Jaystarbliss Studios`} description={subtitle} noindex={true} />
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-red">
        <ClipboardList size={15} /> {role === 'staff' ? 'Teaching Workspace' : role === 'parent' ? 'Parent Learning View' : role === 'school' ? 'School Learning View' : 'Learner Workspace'}
      </div>
      <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{title}</h1>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </div>
    {success && <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} />{success}<button className="ml-auto" onClick={() => setSuccess('')} aria-label="Dismiss"><X size={16} /></button></div>}
    {error && <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={18} />{error}<button className="ml-auto" onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Stat icon={<ClipboardList size={21} />} label="Total assignments" value={assignments.length} />
      <Stat icon={<Send size={20} />} label="Awaiting review" value={pendingReview} />
      <Stat icon={<GraduationCap size={20} />} label="Completed" value={completed} />
    </div>

    {(role === 'staff' || role === 'parent') && <div className="pro-surface rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end gap-4">
      <div className="flex-1"><label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">{role === 'staff' ? 'Student' : 'Child'}</label><select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"><option value="">Select a student</option>{students.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.plan ? ` • ${s.plan}` : ''}</option>)}</select></div>
      {role === 'staff' && <button type="button" disabled={!selectedStudentId} onClick={() => setShowCreate(true)} className="min-h-11 px-5 rounded-xl bg-brand-red text-white text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"><ClipboardList size={17} /> Create Assignment</button>}
    </div>}

    {role === 'student' && <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 flex gap-3"><BookOpen size={19} className="shrink-0 mt-0.5" /><span>Your tutor’s assignments appear here automatically. Submit work before the due date so your tutor can review it.</span></div>}
    {role === 'parent' && activeStudent && <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-4 flex items-center gap-3"><UserRound size={18} className="text-brand-red" /><div><p className="font-bold text-sm text-slate-900 dark:text-white">{activeStudent.fullName}</p><p className="text-xs text-slate-500">{activeStudent.plan || 'Assigned learning track'}</p></div></div>}

    <div className="pro-surface rounded-3xl p-5 md:p-7">
      <div className="mb-5"><h2 className="text-xl font-black text-slate-900 dark:text-white">Assignment inbox</h2><p className="text-xs text-slate-500 mt-1">Each assignment follows a real publish → submit → review lifecycle.</p></div>
      {loading ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto animate-spin mb-2" size={22} />Loading assignments…</div> : assignments.length === 0 ? <div className="py-14 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl"><ClipboardList className="mx-auto text-slate-300 mb-3" size={38} /><p className="font-bold text-slate-900 dark:text-white">No assignments yet</p><p className="text-sm text-slate-500 mt-1">{role === 'staff' ? 'Choose an assigned student and create their first assignment.' : 'When a tutor publishes work for this learner, it will appear here.'}</p></div> : <div className="space-y-4">{assignments.map(a => <AssignmentCard key={a.id} assignment={a} role={role} draft={drafts[a.id] || { text: '', url: '', fileUrl: '', fileName: '' }} onDraftChange={patch => updateDraft(a.id, patch)} onSubmit={submitAssignment} submitting={submittingId === a.id} onReview={() => { setReviewing(a); setReviewForm({ grade: a.grade == null ? '' : String(a.grade), feedback: a.feedback || '', reviewStatus: a.status === 'RESUBMISSION_REQUIRED' ? 'RESUBMISSION_REQUIRED' : 'COMPLETED' }); }} />)}</div>}
    </div>

    {showCreate && <Modal title="Create assignment" onClose={() => setShowCreate(false)}><form onSubmit={createAssignment} className="space-y-4"><p className="text-xs text-slate-500">Publishing this assignment will notify the learner and linked parent when available.</p><Field label="Title"><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Build a Python calculator" className="input" /></Field><Field label="Instructions"><textarea required rows={6} value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="Explain exactly what the learner should do, what to submit and any requirements." className="input resize-y" /></Field><Field label="Due date"><input required type="datetime-local" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="input" /></Field><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Resource title (optional)"><input value={form.resourceTitle} onChange={e => setForm({ ...form, resourceTitle: e.target.value })} placeholder="Lesson guide" className="input" /></Field><Field label="Resource URL (optional)"><input type="url" value={form.resourceUrl} onChange={e => setForm({ ...form, resourceUrl: e.target.value })} placeholder="https://…" className="input" /></Field></div><div className="flex justify-end gap-3 pt-3"><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button type="submit" className="btn-primary"><Send size={16} /> Publish Assignment</button></div></form></Modal>}
    {reviewing && <Modal title="Review assignment" onClose={() => setReviewing(null)}><form onSubmit={reviewAssignment} className="space-y-4"><div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4"><p className="font-bold text-sm text-slate-900 dark:text-white">{reviewing.title}</p><p className="text-xs text-slate-500 mt-1">{reviewing.studentName} • submitted {formatDate(reviewing.submittedAt)}</p></div>{reviewing.submissionText && <div><p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Learner's submission</p><div className="whitespace-pre-wrap rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-700 dark:text-slate-200 max-h-52 overflow-y-auto">{reviewing.submissionText}</div></div>}{reviewing.submissionUrl && <a href={reviewing.submissionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-brand-red hover:underline"><ExternalLink size={15} /> Open submitted work</a>}<Field label="Score (0–100)"><input required min="0" max="100" type="number" value={reviewForm.grade} onChange={e => setReviewForm({ ...reviewForm, grade: e.target.value })} className="input" /></Field><Field label="Feedback"><textarea required rows={6} value={reviewForm.feedback} onChange={e => setReviewForm({ ...reviewForm, feedback: e.target.value })} placeholder="Tell the learner what was done well and what to improve." className="input resize-y" /></Field><Field label="Outcome"><select value={reviewForm.reviewStatus} onChange={e => setReviewForm({ ...reviewForm, reviewStatus: e.target.value })} className="input"><option value="COMPLETED">Complete assignment</option><option value="RESUBMISSION_REQUIRED">Request resubmission</option></select></Field><div className="flex justify-end gap-3 pt-3"><button type="button" onClick={() => setReviewing(null)} className="btn-secondary">Cancel</button><button type="submit" className="btn-primary"><CheckCircle2 size={16} /> Save Review</button></div></form></Modal>}
  </div>;
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => <div className="pro-surface rounded-2xl p-5 flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center">{icon}</div><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-black text-slate-900 dark:text-white">{value}</p></div></div>;
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>{children}</label>;
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-black text-slate-900 dark:text-white">{title}</h3><button onClick={onClose} type="button" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X size={18} /></button></div>{children}</div></div>;

const AssignmentCard: React.FC<{ assignment: Assignment; role: AssignmentCenterRole; draft: Draft; onDraftChange: (patch: Partial<Draft>) => void; onSubmit: (id: string) => void; submitting: boolean; onReview: () => void }> = ({ assignment: a, role, draft, onDraftChange, onSubmit, submitting, onReview }) => {
  const canSubmit = role === 'student' && ['PUBLISHED', 'RESUBMISSION_REQUIRED'].includes(a.status);
  return <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 p-5">
    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 mb-2"><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusClass(a.status)}`}>{statusLabel(a.status)}</span>{a.dueDate && <span className="text-xs text-slate-500">Due {formatDate(a.dueDate)}</span>}</div><h3 className="text-base font-black text-slate-900 dark:text-white">{a.title}</h3><p className="text-xs text-slate-500 mt-1">{role === 'staff' ? a.studentName : `Tutor: ${a.tutorName || 'Assigned tutor'}`}</p></div>{role === 'staff' && a.status === 'SUBMITTED' && <button type="button" onClick={onReview} className="min-h-10 px-4 rounded-xl bg-brand-red text-white text-xs font-bold inline-flex items-center justify-center gap-2"><MessageSquare size={15} /> Review Work</button>}{a.grade != null && <div className="text-right"><p className="text-2xl font-black text-slate-900 dark:text-white">{a.grade}<span className="text-sm text-slate-400">/100</span></p><p className="text-[11px] text-slate-500">Tutor score</p></div>}</div>
    <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{a.instructions}</div>
    {a.resourceUrl && <a href={a.resourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-brand-red hover:bg-slate-50 dark:hover:bg-slate-900"><FileText size={15} />{a.resourceTitle || 'Open attached resource'}<ExternalLink size={13} /></a>}
    {a.submissionText && <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Submitted work</p><p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 line-clamp-6">{a.submissionText}</p>{a.submissionUrl && <a href={a.submissionUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-brand-red hover:underline"><ExternalLink size={13} /> Open submission link</a>}</div>}
    {a.feedback && <div className="mt-4 rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-2">Tutor feedback</p><p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{a.feedback}</p></div>}
    {canSubmit && <div className="mt-5 border-t border-slate-100 dark:border-slate-800 pt-5 space-y-3"><p className="text-xs font-bold text-slate-700 dark:text-slate-300">Submit your work</p><textarea rows={5} value={draft.text} onChange={e => onDraftChange({ text: e.target.value })} placeholder="Paste your answer, explanation, code, or project notes here…" className="input resize-y" /><input type="url" value={draft.url} onChange={e => onDraftChange({ url: e.target.value })} placeholder="Optional project/file link (https://…)" className="input" /><button type="button" disabled={submitting || (!draft.text.trim() && !draft.url.trim())} onClick={() => onSubmit(a.id)} className="btn-primary disabled:opacity-40"><Send size={16} />{submitting ? 'Submitting…' : 'Submit Assignment'}</button></div>}
  </article>;
};

export default AssignmentCenter;
