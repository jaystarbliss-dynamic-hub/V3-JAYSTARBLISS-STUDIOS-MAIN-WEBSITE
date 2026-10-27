import React, { useState } from 'react';
import { collection, doc, setDoc, getDocs, query, where, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { Building2, CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

const AdminSchoolOnboarding: React.FC = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', address: '', state: '', schoolCode: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));

  const generateTempPassword = () => `JdH-${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026!`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('School name and administrator email are required.');
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Your administrator session has expired.');

      const name = form.name.trim();
      const contactName = form.contactName.trim() || 'School Administrator';
      const email = form.email.trim().toLowerCase();
      const requestedCode = form.schoolCode.trim().toUpperCase();
      const codePrefix = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'SCH';
      const generatedCode = requestedCode || `${codePrefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      // The school document ID is the canonical, unique school ID. A human-readable school code is separate.
      const schoolId = doc(collection(db, 'schools')).id;
      const tempPass = generateTempPassword();

      // 1. Check if school already exists
      const existingQuery = query(collection(db, 'schools'), where('name', '==', name), limit(1));
      const existingSnap = await getDocs(existingQuery).catch(() => null);
      if (existingSnap && !existingSnap.empty) {
        throw new Error('A school with this name already exists in the database.');
      }
      const codeQuery = query(collection(db, 'schools'), where('schoolCode', '==', generatedCode), limit(1));
      const codeSnap = await getDocs(codeQuery).catch(() => null);
      if (codeSnap && !codeSnap.empty) {
        throw new Error('That school code is already in use. Choose a unique school code.');
      }

      // 2. Create the school document
      const schoolRecord = {
        id: schoolId,
        schoolId,
        name,
        schoolCode: generatedCode,
        contactName,
        contactEmail: email,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        state: form.state.trim() || 'Lagos',
        notes: form.notes.trim() || null,
        status: 'ACTIVE',
        onboardingStatus: 'APPROVED',
        billing: {
          baseAmount: 350000,
          cycle: 'termly',
          allowedModes: ['advance_termly', 'advance_monthly'],
          mode: 'advance_termly',
          nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          status: 'ACTIVE',
          notes: 'Standard institutional curriculum and workspace partnership agreement.'
        },
        programs: [{
          id: `prog-${Date.now()}`,
          name: 'Kids Coding & AI Essentials',
          description: 'Comprehensive coding, robotics, and creative tech curriculum.',
          status: 'ACTIVE'
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
        createdByEmail: user.email || ''
      };

      await setDoc(doc(db, 'schools', schoolId), schoolRecord);

      // 3. Create administrator invitation record in Firestore
      await setDoc(doc(db, 'invites', email), {
        email,
        name: contactName,
        role: 'SCHOOL',
        schoolId,
        schoolName: name,
        schoolCode: generatedCode,
        tempPassword: tempPass,
        status: 'PENDING',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByEmail: user.email || ''
      }, { merge: true }).catch(() => {});

      // 4. If a user record with this email already exists, link it
      try {
        const userQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          await setDoc(doc(db, 'users', userDoc.id), {
            role: 'SCHOOL',
            schoolId,
            schoolName: name,
            schoolCode: generatedCode,
            accountStatus: 'ACTIVE',
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      } catch (err) {
        console.warn('User link error non-fatal:', err);
      }

      // 5. Activity log
      await addDoc(collection(db, 'activityLogs'), {
        type: 'school_onboarded',
        action: 'SCHOOL_ONBOARDED',
        message: `School ${name} was onboarded by ${user.email || 'Admin'}.`,
        actorId: user.uid,
        userEmail: email,
        userType: 'SCHOOL',
        schoolId,
        schoolName: name,
        createdAt: serverTimestamp(),
        timestamp: new Date().toISOString()
      }).catch(() => {});

      // 6. Notification
      await addDoc(collection(db, 'notifications'), {
        recipientId: 'all',
        type: 'school_onboarded',
        title: `New School Onboarded: ${name}`,
        message: `School ${name} (${generatedCode}) has been successfully created.`,
        schoolId,
        createdAt: serverTimestamp()
      }).catch(() => {});

      setResult({
        success: true,
        school: { id: schoolId, name, schoolCode: generatedCode, status: 'ACTIVE' },
        administrator: { uid: schoolId, name: contactName, email },
        temporaryPassword: tempPass
      });

      toast.success(`${name} has been onboarded successfully.`);
    } catch (error) {
      console.error('School onboarding error:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to onboard school.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  };

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <CheckCircle2 size={28} className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-black text-emerald-900 dark:text-emerald-200">School onboarded</h1>
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
              The school record, school administrator workspace and onboarding audit record have been created.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">School</span>
              <p className="mt-1 font-black text-slate-900 dark:text-white">{result.school.name}</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">School ID</span>
              <p className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">{result.school.id}</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">School Code</span>
              <p className="mt-1 font-mono font-bold text-brand-red">{result.school.schoolCode}</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Administrator</span>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{result.administrator.name} · {result.administrator.email}</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
              <KeyRound size={15} /> One-time temporary password
            </div>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={result.temporaryPassword}
                className="min-h-11 w-full rounded-xl border border-amber-200 bg-white px-3 font-mono text-sm font-bold text-slate-900 dark:border-amber-900/50 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => void copy(result.temporaryPassword, 'Temporary password')}
                className="min-h-11 min-w-11 rounded-xl border border-amber-200 bg-white text-slate-700 dark:border-amber-900/50 dark:bg-slate-900 dark:text-white"
                title="Copy temporary password"
              >
                <Copy size={17} className="mx-auto" />
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              Give this credential to the school administrator securely. They can sign in at /portal.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setForm({ name: '', contactName: '', email: '', phone: '', address: '', state: '', schoolCode: '', notes: '' });
          }}
          className="min-h-11 rounded-xl bg-brand-red px-5 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          Onboard another school
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <span>
          The school workspace is created directly, linked to the administrator email, and provisioned with standard institutional curriculum and billing modules.
        </span>
      </div>

      <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">School name *</span>
            <input
              required
              value={form.name}
              onChange={e => update('name', e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. Bright Future Academy"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Administrator name *</span>
            <input
              required
              value={form.contactName}
              onChange={e => update('contactName', e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="Principal / School Admin"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Administrator email *</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="admin@school.com"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Phone</span>
            <input
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="+234…"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">State</span>
            <input
              value={form.state}
              onChange={e => update('state', e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="Lagos"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Custom school code</span>
            <input
              value={form.schoolCode}
              onChange={e => update('schoolCode', e.target.value.toUpperCase())}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="Optional — generated if blank"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Address</span>
            <input
              value={form.address}
              onChange={e => update('address', e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="School address"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Internal notes</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="Partnership notes, package details, onboarding instructions…"
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            disabled={saving}
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-red px-6 text-sm font-black text-white disabled:opacity-50 transition-opacity hover:opacity-90 cursor-pointer"
          >
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Building2 size={17} />}
            {saving ? 'Creating school…' : 'Onboard School'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminSchoolOnboarding;

