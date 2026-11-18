import React, { useState } from 'react';
import { X, Save, School, BookOpen, DollarSign, UserCheck, ShieldCheck } from 'lucide-react';
import { doc, updateDoc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency } from '../../lib/receiptGenerator';

export interface TutorAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tutors: Array<{ id: string; name: string; email?: string; role?: string }>;
  schools: Array<{ id: string; name: string; code?: string; programs?: any[] }>;
  onSaved: () => Promise<void>;
  defaultTutorId?: string;
  defaultSchoolId?: string;
}

export const TutorAllocationModal: React.FC<TutorAllocationModalProps> = ({
  isOpen,
  onClose,
  tutors,
  schools,
  onSaved,
  defaultTutorId,
  defaultSchoolId
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [tutorId, setTutorId] = useState(defaultTutorId || (tutors[0]?.id || ''));
  const [schoolId, setSchoolId] = useState(defaultSchoolId || (schools[0]?.id || ''));
  const [programName, setProgramName] = useState('Coding & Robotics Engineering');
  const [payoutRate, setPayoutRate] = useState('50000');
  const [payoutType, setPayoutType] = useState<'per_term' | 'per_month' | 'per_student' | 'fixed_stipend'>('per_term');
  const [notes, setNotes] = useState('Lead Technology Instructor Allocation');

  React.useEffect(() => {
    if (defaultTutorId) setTutorId(defaultTutorId);
    if (defaultSchoolId) setSchoolId(defaultSchoolId);
  }, [defaultTutorId, defaultSchoolId]);

  if (!isOpen) return null;

  const selectedTutor = tutors.find(t => t.id === tutorId);
  const selectedSchool = schools.find(s => s.id === schoolId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorId || !schoolId) {
      toast.error('Please select both a tutor and a partner school.');
      return;
    }

    setSaving(true);
    try {
      const numRate = Number(payoutRate) || 0;
      const tutorName = selectedTutor?.name || 'Faculty Tutor';
      const tutorEmail = selectedTutor?.email || '';
      const schoolName = selectedSchool?.name || 'Partner School';

      // 1. Update the school doc with the program assignment
      const schRef = doc(db, 'schools', schoolId);
      const assignmentObj = {
        tutorId,
        tutorName,
        tutorEmail,
        programName,
        payoutRate: numRate,
        payoutType,
        assignedAt: new Date().toISOString()
      };

      // Add to school's program allocations
      const currentPrograms = Array.isArray(selectedSchool?.programs) ? [...selectedSchool.programs] : [];
      const existingProgIdx = currentPrograms.findIndex((p: any) => 
        (p.name && p.name.toLowerCase() === programName.toLowerCase()) || (p.id === programName)
      );

      if (existingProgIdx >= 0) {
        const prog = currentPrograms[existingProgIdx];
        const existingAssignments = Array.isArray(prog.tutorAssignments) ? [...prog.tutorAssignments] : [];
        const filteredAssignments = existingAssignments.filter((a: any) => a.tutorId !== tutorId);
        filteredAssignments.push(assignmentObj);
        currentPrograms[existingProgIdx] = {
          ...prog,
          tutorAssignments: filteredAssignments,
          tutorId,
          tutorName,
          tutorPayoutRate: numRate
        };
      } else {
        currentPrograms.push({
          id: `prog_${Date.now()}`,
          name: programName,
          fee: numRate * 2, // estimated base
          tutorId,
          tutorName,
          tutorPayoutRate: numRate,
          tutorAssignments: [assignmentObj]
        });
      }

      await updateDoc(schRef, {
        programs: currentPrograms,
        updatedAt: serverTimestamp()
      }).catch(async () => {
        await setDoc(schRef, { programs: currentPrograms }, { merge: true });
      });

      // 2. Also register in user's assignedSchools list
      const userRef = doc(db, 'users', tutorId);
      await updateDoc(userRef, {
        assignedSchools: arrayUnion({
          schoolId,
          schoolName,
          programName,
          payoutRate: numRate,
          payoutType,
          assignedAt: new Date().toISOString()
        }),
        updatedAt: serverTimestamp()
      }).catch(() => {});

      // 3. Dispatch Notification to Tutor
      const notifRef = doc(db, 'notifications', `notif_${Date.now()}`);
      await setDoc(notifRef, {
        recipientId: tutorId,
        title: 'New Institutional School Allocation',
        message: `You have been allocated to ${schoolName} for ${programName} with a rate of ${formatCurrency(numRate)} (${payoutType.replace('_', ' ')}).`,
        type: 'SCHOOL_ALLOCATION',
        read: false,
        createdAt: serverTimestamp()
      });

      toast.success(`Allocated ${tutorName} to ${schoolName} successfully!`);
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to allocate tutor to school.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1E293B] dark:focus:ring-slate-400';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-white flex items-center justify-center">
              <School size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Allocate Tutor to Partner School
              </h3>
              <p className="text-xs text-slate-500">
                Assign faculty mentors to institutions and define their payout fees
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1.5">
                Select Faculty Tutor
              </label>
              <select
                value={tutorId}
                onChange={e => setTutorId(e.target.value)}
                required
                className={inputClass}
              >
                {tutors.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.email || 'Faculty'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1.5">
                Select Partner School
              </label>
              <select
                value={schoolId}
                onChange={e => setSchoolId(e.target.value)}
                required
                className={inputClass}
              >
                {schools.map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1.5">
              Curriculum Track / Program Name
            </label>
            <input
              type="text"
              required
              value={programName}
              onChange={e => setProgramName(e.target.value)}
              placeholder="e.g. Coding & Robotics Engineering"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1.5">
                Tutor Payout Rate (₦ NGN)
              </label>
              <input
                type="number"
                required
                min={0}
                step={1000}
                value={payoutRate}
                onChange={e => setPayoutRate(e.target.value)}
                placeholder="50000"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1.5">
                Payout Frequency / Model
              </label>
              <select
                value={payoutType}
                onChange={e => setPayoutType(e.target.value as any)}
                className={inputClass}
              >
                <option value="per_term">Per Term (12 Weeks Academic Term)</option>
                <option value="per_month">Per Month (4 Weeks Cycle)</option>
                <option value="per_student">Per Student Enrolled</option>
                <option value="fixed_stipend">Fixed Project Stipend</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1.5">
              Internal Allocation Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Primary Friday Robotics Facilitator"
              className={inputClass}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-2xl bg-[#1E293B] hover:bg-[#0F172A] dark:bg-[#B91C1C] dark:hover:bg-[#991B1B] text-white text-xs font-black inline-flex items-center gap-2 shadow-sm transition-all"
            >
              <Save size={15} />
              <span>{saving ? 'Allocating...' : 'Save School Allocation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
