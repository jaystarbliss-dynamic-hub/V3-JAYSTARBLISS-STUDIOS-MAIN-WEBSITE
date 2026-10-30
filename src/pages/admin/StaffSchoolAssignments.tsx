import React, { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { resolveRealName } from '../../utils/userNames';
import { Check, ChevronDown, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

type StaffMember = { id: string; name?: string; email?: string; role?: string; accountStatus?: string };
type School = { id: string; name?: string; schoolCode?: string; schoolId?: string };

const StaffSchoolAssignments: React.FC = () => {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersSnap, parentsSnap, schoolsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'parents')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'schools'))
      ]);
      const parentIds = new Set<string>();
      const parentEmails = new Set<string>();
      parentsSnap.docs.forEach((pDoc: any) => {
        parentIds.add(pDoc.id);
        const pd = pDoc.data() || {};
        if (pd.uid) parentIds.add(String(pd.uid));
        if (pd.email) parentEmails.add(String(pd.email).toLowerCase().trim());
      });
      setStaff(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((u: any) => !u.isDuplicate && !u.isParent)
        .filter((u: any) => !parentIds.has(u.id) && !parentEmails.has(String(u.email || '').toLowerCase().trim()))
        .filter((u: any) => ['staff','tutor','instructor'].includes(String(u.role || '').toLowerCase()))
        .filter((u: any) => String(u.accountStatus || 'ACTIVE').toUpperCase() === 'ACTIVE'));
      setSchools(schoolsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error(error);
      toast.error('Unable to load staff and school assignments.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedStaffId) {
      setSelectedSchoolIds([]);
      return;
    }
    const loadAssignment = async () => {
      try {
        const snap = await getDoc(doc(db, 'staffSchoolAccess', selectedStaffId));
        const data = snap.exists() ? snap.data() : {};
        const ids = Array.isArray(data.schoolIds) ? data.schoolIds : data.schoolId ? [data.schoolId] : [];
        setSelectedSchoolIds(ids.map(String));
      } catch (error) {
        console.error(error);
        toast.error('Unable to load this staff member’s school access.');
      }
    };
    void loadAssignment();
  }, [selectedStaffId, toast]);

  const toggleSchool = (schoolId: string) => {
    setSelectedSchoolIds((current) => current.includes(schoolId) ? current.filter((id) => id !== schoolId) : [...current, schoolId]);
  };

  const save = async () => {
    if (!selectedStaffId) return;
    setSaving(true);
    try {
      if (!auth.currentUser) throw new Error('Your admin session has expired. Please sign in again.');
      await setDoc(doc(db, 'staffSchoolAccess', selectedStaffId), {
        schoolIds: selectedSchoolIds,
        updatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('Staff school access updated successfully.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to save school access.');
    } finally {
      setSaving(false);
    }
  };

  const selectedStaff = staff.find((member) => member.id === selectedStaffId);

  if (loading) return <div className="flex items-center gap-2 py-12 text-sm text-gray-500"><Loader2 className="animate-spin" size={18} /> Loading staff-school assignments…</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-gray-900 dark:text-white"><ShieldCheck size={20} className="text-brand-red" /> Staff School Access</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Assign each staff member only to the partner schools they are authorized to manage. These assignments are the security boundary used by school resources, exams, links and passcodes.</p>
          </div>
          <button type="button" onClick={() => void load()} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"><RefreshCw size={16} /> Refresh</button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]">
          <div>
            <label htmlFor="staff-access-member" className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Staff Member</label>
            <div className="relative">
              <select id="staff-access-member" value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="min-h-11 w-full appearance-none rounded-xl border border-gray-300 bg-white px-3 pr-10 text-sm font-semibold text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">Select a staff member…</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {resolveRealName(member, member.email, 'Faculty Member')} {member.email ? `(${member.email})` : ''} — {String(member.role || 'STAFF').toUpperCase()}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-gray-400" />
            </div>

            {selectedStaff && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <div className="font-bold text-gray-900 dark:text-white">
                  {resolveRealName(selectedStaff, selectedStaff.email, 'Staff Member')}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selectedStaff.email || 'No email on file'}</div>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">ACTIVE ACCOUNT</div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Authorized Schools</label><span className="text-xs font-bold text-gray-400">{selectedSchoolIds.length} selected</span></div>
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-slate-700">
              {schools.length === 0 ? <div className="p-6 text-center text-sm text-gray-500">No school records found.</div> : schools.map((school) => {
                const checked = selectedSchoolIds.includes(school.id);
                return <label key={school.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"><input type="checkbox" checked={checked} onChange={() => toggleSchool(school.id)} className="h-4 w-4" disabled={!selectedStaffId} /><span className="min-w-0"><span className="block truncate text-sm font-bold text-gray-900 dark:text-white">{school.name || 'Partner School'}</span><span className="block text-xs text-gray-500 dark:text-gray-400">{school.schoolCode || school.schoolId || school.id}</span></span>{checked && <Check size={16} className="ml-auto shrink-0 text-emerald-600" />}</label>;
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
          <p><strong>Security rule:</strong> staff can read only the schools explicitly assigned here. Admins retain full access.</p>
          <button type="button" onClick={() => void save()} disabled={!selectedStaffId || saving} className="min-h-11 shrink-0 rounded-xl bg-brand-red px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Access Assignment'}</button>
        </div>
      </div>
    </div>
  );
};

export default StaffSchoolAssignments;
