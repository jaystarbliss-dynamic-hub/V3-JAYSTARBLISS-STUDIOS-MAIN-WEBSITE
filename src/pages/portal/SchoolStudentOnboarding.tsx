import React, { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, UserPlus, Printer, ShieldCheck, Check, Copy } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, doc, getDoc, query, limit } from 'firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';

const SchoolStudentOnboarding: React.FC = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({ fullName: '', username: '', email: '', class: 'JSS 1', track: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; accessCode: string; portal: string } | null>(null);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [programIds, setProgramIds] = useState<string[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<{ id: string; name: string }>({ id: '', name: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchSchoolPrograms = async () => {
      try {
        const effective = getEffectiveAuth();
        const schoolId = effective.effectiveSchoolId || sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || localStorage.getItem('jaystar_cached_school_id') || auth.currentUser?.uid || '';
        let list: { id: string; name: string }[] = [];
        let detectedSchoolName = sessionStorage.getItem('schoolName') || '';

        if (schoolId) {
          const schSnap = await getDoc(doc(db, 'schools', schoolId)).catch(() => null);
          if (schSnap && schSnap.exists()) {
            const sd = schSnap.data();
            detectedSchoolName = sd.name || sd.schoolName || detectedSchoolName;
            const rawProgs = sd.programs || sd.undergoingPrograms || sd.assignedPrograms || [];
            if (Array.isArray(rawProgs) && rawProgs.length > 0) {
              list = rawProgs.map((p: any) => ({
                id: p.id || p.name || p.title,
                name: p.name || p.title || p.programName || 'Program Track'
              }));
            }
          }
        }

        if (list.length === 0 && auth.currentUser) {
          const schSnap = await getDocs(query(collection(db, 'schools'), limit(50))).catch(() => ({ docs: [] } as any));
          for (const d of schSnap.docs) {
            const sd = d.data();
            if (d.id === schoolId || sd.adminUid === auth.currentUser?.uid || sd.email === auth.currentUser?.email || sd.firebaseUid === auth.currentUser?.uid) {
              detectedSchoolName = sd.name || sd.schoolName || detectedSchoolName;
              const rawProgs = sd.programs || sd.undergoingPrograms || sd.assignedPrograms || [];
              if (Array.isArray(rawProgs) && rawProgs.length > 0) {
                list = rawProgs.map((p: any) => ({
                  id: p.id || p.name || p.title,
                  name: p.name || p.title || p.programName || 'Program Track'
                }));
                break;
              }
            }
          }
        }

        setSchoolInfo({ id: schoolId, name: detectedSchoolName || 'Partner School' });
        setPrograms(list);
      } catch (err) {
        console.warn('Error fetching school programs:', err);
        setPrograms([]);
      }
    };

    fetchSchoolPrograms();
  }, []);

  const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const onboard = async (event: React.FormEvent) => {
    event.preventDefault();
    const effective = getEffectiveAuth();
    if (!auth.currentUser && !effective.isMasquerading) {
      return toast.error('Your school session has expired. Please sign in again.');
    }
    
    const trimmedName = form.fullName.trim();
    const cleanUsername = form.username.toLowerCase().replace(/\s+/g, '').trim();
    if (!trimmedName || !cleanUsername || !form.class) {
      return toast.error('Student name, username and class are required.');
    }

    setSaving(true);
    try {
      const selectedPrograms = programs.filter(p => programIds.includes(String(p.id)));
      const programName = selectedPrograms.map(p => p.name).filter(Boolean).join(', ') || form.track.trim() || 'General School Programme';
      let issuedCredentials: { username: string; accessCode: string; portal: string } | null = null;

      // 1. Attempt backend Netlify function safely
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch('/.netlify/functions/school-student-onboard', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, schoolId: schoolInfo.id || effective.effectiveSchoolId || sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || '', fullName: trimmedName, username: cleanUsername, programId: programIds[0] || '', programIds, programName }),
          });
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'The server could not create the student login. No student record was created.');
            if (!result.credentials) throw new Error('The server did not return login credentials. Please retry; no local-only account was created.');
            issuedCredentials = result.credentials;
          }
        } catch (apiErr) {
          throw apiErr;
        }
      }

      // Only the server can create both the Firebase Authentication identity and its student record.
      if (!issuedCredentials) throw new Error('Student login was not created. Please retry or contact the platform administrator.');

      setCredentials(issuedCredentials);
      setForm({ fullName: '', username: '', email: '', class: 'JSS 1', track: '', parentId: '' });
      setProgramIds([]);
      toast.success(`Student account created successfully for ${trimmedName}!`);
    } catch (error: any) {
      console.error('School onboarding error:', error);
      toast.error(error?.message || 'Unable to onboard student. Please verify the input.');
    } finally {
      setSaving(false);
    }
  };

  const copyCredentials = () => {
    if (!credentials) return;
    const text = `Username: ${credentials.username}\nAccess Code: ${credentials.accessCode}\nStudent Portal: ${window.location.origin}${credentials.portal}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Credentials copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const credentialText = credentials ? `JAYSTARBLISS STUDIOS — STUDENT ACCESS\n\nUsername: ${credentials.username}\nAccess Code: ${credentials.accessCode}\nStudent Portal: ${window.location.origin}${credentials.portal}\n\nKeep these credentials private and provide them only to the student or authorised parent.` : '';

  const downloadText = () => {
    if (!credentialText) return;
    const blob = new Blob([credentialText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${credentials?.username}-student-access.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);

  const printCredentials = () => {
    if (!credentials) return;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return toast.error('Allow pop-ups to print the credential card.');
    const safeUsername = escapeHtml(credentials.username);
    const safeAccessCode = escapeHtml(credentials.accessCode);
    const safePortal = escapeHtml(`${window.location.origin}${credentials.portal}`);
    win.document.write(`<html><head><title>Student Access</title><style>body{font-family:Arial,sans-serif;padding:48px;color:#1e293b}.card{max-width:560px;border:2px solid #b91c1c;border-radius:20px;padding:32px}.label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}.value{font-size:22px;font-weight:800;margin:6px 0 20px}h1{font-size:26px;margin-top:0}</style></head><body><div class="card"><div class="label">Jaystarbliss Studios</div><h1>Student Portal Access</h1><div class="label">Username</div><div class="value">${safeUsername}</div><div class="label">Access Code</div><div class="value">${safeAccessCode}</div><div class="label">Portal</div><div class="value">${safePortal}</div></div><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  const downloadImage = () => {
    if (!credentials) return;
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 700; const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, canvas.width, 110); ctx.fillStyle = '#fff'; ctx.font = 'bold 34px Arial'; ctx.fillText('JAYSTARBLISS STUDIOS', 60, 70); ctx.fillStyle = '#1e293b'; ctx.font = 'bold 46px Arial'; ctx.fillText('Student Portal Access', 60, 190); ctx.font = '22px Arial'; ctx.fillStyle = '#64748b'; ctx.fillText('Username', 60, 260); ctx.fillStyle = '#1e293b'; ctx.font = 'bold 34px Arial'; ctx.fillText(credentials.username, 60, 305); ctx.fillStyle = '#64748b'; ctx.font = '22px Arial'; ctx.fillText('Access Code', 60, 375); ctx.fillStyle = '#b91c1c'; ctx.font = 'bold 38px Arial'; ctx.fillText(credentials.accessCode, 60, 425); ctx.fillStyle = '#64748b'; ctx.font = '20px Arial'; ctx.fillText(`Portal: ${window.location.origin}${credentials.portal}`, 60, 500); ctx.font = '18px Arial'; ctx.fillText('Keep these credentials private.', 60, 590); const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `${credentials.username}-student-access.png`; a.click();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <SEO title="Onboard School Student | Jaystarbliss Studios" description="Create secure student portal access for a school learner." noindex />
      <div className="pro-surface rounded-3xl p-6 md:p-8 bg-white dark:bg-[#161B26] border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-brand-red/10 p-3 text-brand-red">
            <UserPlus size={22} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest font-black text-brand-red">School Operations</div>
            <h1 className="text-2xl md:text-3xl font-black mt-1 text-slate-900 dark:text-white">Onboard a student</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-2xl">
              Create the learner's account instantly. They sign in to the Student Portal with their username and access code, automatically connected to your school's classes and timetable.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onboard} className="pro-surface rounded-2xl p-6 bg-white dark:bg-[#161B26] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Student full name" value={form.fullName} onChange={v => update('fullName', v)} required placeholder="e.g. Samuel Adeyemi" />
          <Field label="Username" value={form.username} onChange={v => update('username', v)} required placeholder="e.g. samuel_adeyemi" />
          <Field label="Email (optional)" value={form.email} onChange={v => update('email', v)} type="email" placeholder="student@school.edu.ng" />
          
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Class Level
            <select
              value={form.class}
              onChange={e => update('class', e.target.value)}
              className="mt-1.5 w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
            >
              <option>Early Years</option>
              <option>Nursery 1</option>
              <option>Nursery 2</option>
              <option>Nursery 3</option>
              <option>Reception</option>
              <option>Year 1</option>
              <option>Year 2</option>
              <option>Year 3</option>
              <option>Year 4</option>
              <option>Year 5</option>
              <option>Year 6</option>
              <option>Primary 1</option>
              <option>Primary 2</option>
              <option>Primary 3</option>
              <option>Primary 4</option>
              <option>Primary 5</option>
              <option>Primary 6</option>
              <option>JSS 1</option>
              <option>JSS 2</option>
              <option>JSS 3</option>
              <option>SS 1</option>
              <option>SS 2</option>
              <option>SS 3</option>
            </select>
          </label>

          <Field label="Learning track / notes (optional)" value={form.track} onChange={v => update('track', v)} placeholder="e.g. Robotics & IoT Track" />
          
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Programme Assignments
            <select
              multiple
              value={programIds}
              onChange={e => setProgramIds(Array.from(e.currentTarget.selectedOptions, option => option.value))}
              className="mt-1.5 w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
            >
              {programs.map(program => (
                <option key={program.id} value={program.id}>{program.name}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Select every programme for this learner. Hold Ctrl (Windows) or Cmd (Mac) to choose multiple; each selected programme creates its own enrollment.</span>
          </label>

          <Field label="Parent account ID (optional)" value={form.parentId} onChange={v => update('parentId', v)} placeholder="Parent UID or email" />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-11 mt-3 rounded-xl bg-brand-red hover:bg-red-700 text-white px-5 text-xs font-bold inline-flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
        >
          <ShieldCheck size={16} />
          {saving ? <><Loader2 size={16} className="animate-spin" /> Creating Student Access…</> : 'Create Student Portal Access'}
        </button>
      </form>

      {credentials && (
        <div className="pro-surface rounded-2xl p-6 border-2 border-brand-red/30 bg-white dark:bg-[#161B26] shadow-lg space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-brand-red/10 p-3 text-brand-red">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-900 dark:text-white">Credentials Created Successfully</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribute these credentials to the student or parent. The student signs in via the standard Student Portal.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Credential label="Student Username" value={credentials.username} />
            <Credential label="Access Code" value={credentials.accessCode} />
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <button
              type="button"
              onClick={copyCredentials}
              className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy Info'}</span>
            </button>
            <button
              type="button"
              onClick={downloadText}
              className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100"
            >
              <FileText size={14} /> TXT File
            </button>
            <button
              type="button"
              onClick={printCredentials}
              className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100"
            >
              <Printer size={14} /> Print / PDF
            </button>
            <button
              type="button"
              onClick={downloadImage}
              className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100"
            >
              <ImageIcon size={14} /> PNG Card
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text', required = false, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) => (
  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
    {label}
    <input
      required={required}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="mt-1.5 w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
    />
  </label>
);

const Credential = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 p-4">
    <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-black">{label}</div>
    <div className="text-lg font-black mt-1 text-slate-900 dark:text-white font-mono break-all">{value}</div>
  </div>
);

export default SchoolStudentOnboarding;
