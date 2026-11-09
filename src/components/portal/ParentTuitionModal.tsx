import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Save, BookOpen, Clock, UserCheck, CreditCard, Download,
  CheckCircle2, AlertCircle, ShieldCheck
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency, generatePdfReceipt } from '../../lib/receiptGenerator';
import { billingPost, isPartiallyPaidStatus } from '../../lib/billing';

export interface UnifiedParentStudent {
  id: string;
  source: 'individualStudents' | 'students' | 'enrollment_requests' | 'users';
  studentName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  plan: string;
  amount: number;
  cycle: 'monthly' | 'termly' | 'annual';
  teachingMode: string;
  tutorId?: string;
  tutorName?: string;
  tutorPayoutRate?: number;
  status: string;
  schoolName?: string;
  age?: string;
  grade?: string;
  username?: string;
  createdAt?: string;
}

export interface ParentProgramOption {
  id: string;
  name: string;
}

export interface ParentTuitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: UnifiedParentStudent | null;
  tutors: Array<{ id: string; name: string; email?: string }>;
  programs?: ParentProgramOption[];
  onSaved: () => Promise<void>;
}

export const ParentTuitionModal: React.FC<ParentTuitionModalProps> = ({
  isOpen,
  onClose,
  student,
  tutors,
  programs = [],
  onSaved
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'payment'>('config');
  const [provisionedPassword, setProvisionedPassword] = useState('');

  const [studentName, setStudentName] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [plan, setPlan] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'termly' | 'annual'>('monthly');
  const [teachingMode, setTeachingMode] = useState('Online 1-on-1');
  const [tutorId, setTutorId] = useState('');
  const [tutorPayoutRate, setTutorPayoutRate] = useState('');
  const [status, setStatus] = useState('PENDING');

  const [payAmount, setPayAmount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState('');

  useEffect(() => {
    if (!student) return;
    setProvisionedPassword('');
    setStudentName(student.studentName || '');
    setParentName(student.parentName || '');
    setParentEmail(student.parentEmail || '');
    setParentPhone(student.parentPhone || '');
    setPlan(student.plan || '');
    setAmount(student.amount ? String(student.amount) : '');
    setCycle(student.cycle || 'monthly');
    setTeachingMode(student.teachingMode || 'Online 1-on-1');
    setTutorId(student.tutorId || '');
    setTutorPayoutRate(student.tutorPayoutRate ? String(student.tutorPayoutRate) : '');
    setStatus(student.status || 'PENDING');
    setPayAmount(student.amount ? String(student.amount) : '');
    setPayReference(`TX-PARENT-${Date.now().toString().slice(-8)}`);
    setPayNotes('');
  }, [student]);

  const inputClass = 'w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500';
  const assignedTutor = useMemo(() => tutors.find(t => t.id === tutorId), [tutors, tutorId]);

  if (!isOpen || !student) return null;

  const provisionParentAndChild = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Your administrator session has expired. Please sign in again.');

    const token = await user.getIdToken();
    const response = await fetch('/.netlify/functions/admin-parent-family', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        parentName,
        parentEmail,
        parentPhone,
        children: [{
          id: student.id,
          username: student.username,
          fullName: studentName || student.studentName
        }]
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to create or link the parent account.');
    if (result.temporaryPassword) setProvisionedPassword(result.temporaryPassword);
    return result;
  };

  const handleSaveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) throw new Error('Enter a valid tuition fee.');
      if (!parentEmail.trim() || !parentEmail.includes('@')) throw new Error('Enter a valid parent email.');
      if (!plan.trim()) throw new Error('Select or enter the programme assigned to this student.');

      const parsedPayout = Number(tutorPayoutRate || 0);
      const effectivePlanName = plan.trim();
      const accountResult = await provisionParentAndChild();

      const updatePayload: Record<string, any> = {
        fullName: studentName.trim(),
        studentName: studentName.trim(),
        parentName: parentName.trim(),
        parentEmail: parentEmail.trim().toLowerCase(),
        parentPhone: parentPhone.trim(),
        phone: parentPhone.trim(),
        plan: effectivePlanName,
        track: effectivePlanName,
        courseName: effectivePlanName,
        amount: parsedAmount,
        tuitionFee: parsedAmount,
        cycle,
        teachingMode,
        mode: teachingMode,
        status,
        accountStatus: ['APPROVED', 'ACTIVE', 'PAID'].includes(status) ? 'ACTIVE' : status,
        updatedAt: serverTimestamp()
      };

      if (tutorId) {
        updatePayload.tutorId = tutorId;
        updatePayload.tutorName = assignedTutor?.name || '';
        updatePayload.tutorPayoutRate = Number.isFinite(parsedPayout) ? parsedPayout : 0;
      } else {
        updatePayload.tutorId = null;
        updatePayload.tutorName = null;
        updatePayload.tutorPayoutRate = 0;
      }

      // The admin endpoint establishes the parent/auth relationship. These writes only
      // persist the actual programme, fee and tutor configuration, and failures are surfaced.
      await Promise.all([
        setDoc(doc(db, 'individualStudents', student.id), updatePayload, { merge: true }),
        setDoc(doc(db, 'students', student.id), updatePayload, { merge: true }),
        setDoc(doc(db, 'enrollment_requests', student.id), updatePayload, { merge: true })
      ]);

      await onSaved();
      if (accountResult.temporaryPassword) {
        toast.success(`Parent account created. Temporary password: ${accountResult.temporaryPassword}`);
      } else {
        toast.success(`Programme, billing and tutor assignment saved for ${studentName || student.studentName}.`);
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save programme, billing and tutor settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordBankPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const numAmount = Number(payAmount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid tuition fee amount.');
      return;
    }

    setSaving(true);
    try {
      const txRef = payReference.trim() || `TX-PARENT-${Date.now()}`;
      const paidAt = payDate ? new Date(payDate).toISOString() : new Date().toISOString();
      const contractFee = Number(amount || student.amount || 0);

      let resultingStatus = 'PAID';
      let resultingRemainingBalance = 0;

      try {
        const res = await billingPost<{ recorded: boolean; status: string; remainingBalance: number }>('billing-admin', {
          action: 'record_offline_payment',
          targetType: 'STUDENT',
          studentId: student.id,
          amount: numAmount,
          contractAmount: contractFee,
          reference: txRef,
          paymentMethod: 'bank_transfer',
          paymentDate: paidAt,
          cycle,
          notes: payNotes,
          planName: plan || student.plan || 'Private Tuition',
          studentName: studentName || student.studentName,
          parentName: parentName || student.parentName,
          email: parentEmail,
          tutorId: tutorId || student.tutorId || '',
          tutorName: assignedTutor?.name || student.tutorName || ''
        });
        resultingStatus = res.status || 'PAID';
        resultingRemainingBalance = Number(res.remainingBalance || 0);
      } catch (apiErr) {
        const errMsg = apiErr instanceof Error ? apiErr.message : '';
        if (errMsg && !errMsg.includes('could not complete this request')) {
          throw apiErr;
        }
        // Safe non-overwriting fallback when serverless function is offline in local dev
        const existingTxSnap = await getDoc(doc(db, 'payments', txRef));
        if (existingTxSnap.exists()) {
          throw new Error('A transaction with this reference already exists. Existing transactions cannot be overwritten.');
        }

        const indSnap = await getDoc(doc(db, 'individualStudents', student.id)).catch(() => null);
        const sData = indSnap && indSnap.exists() ? indSnap.data() : {};
        const wasPartial = isPartiallyPaidStatus(sData?.paymentStatus ?? sData?.status ?? student.status);
        const prevPaid = wasPartial
          ? Math.max(0, Number(sData?.amountPaid || (contractFee - Number(sData?.remainingBalance || contractFee))))
          : 0;
        const cumulativePaid = Number((prevPaid + numAmount).toFixed(2));
        resultingRemainingBalance = contractFee > 0 ? Number(Math.max(0, contractFee - cumulativePaid).toFixed(2)) : 0;
        resultingStatus = resultingRemainingBalance > 0 ? 'PARTIALLY_PAID' : 'PAID';

        const paymentRecord = {
          reference: txRef,
          studentId: student.id,
          studentName: studentName || student.studentName,
          parentName: parentName || student.parentName,
          payerName: parentName || studentName || 'Parent',
          payerEmail: parentEmail || '',
          payerPhone: parentPhone || '',
          amount: numAmount,
          amountInNaira: true,
          customerTotal: numAmount,
          baseAmount: numAmount,
          fullContractAmount: contractFee || numAmount,
          remainingBalance: resultingRemainingBalance,
          transactionFee: 0,
          type: 'inflow',
          category: 'parent_tuition',
          status: resultingStatus,
          paymentStatus: resultingStatus,
          channel: 'bank_transfer',
          method: 'bank_transfer',
          plan: plan || student.plan || '',
          description: `Tuition Settlement (${plan || student.plan || 'Programme'}) - ${studentName || student.studentName}${resultingRemainingBalance > 0 ? ' (Partial)' : ''}`,
          teachingMode,
          cycle,
          notes: payNotes,
          paidAt,
          createdAt: serverTimestamp()
        };

        await setDoc(doc(db, 'payments', txRef), paymentRecord);

        const studentUpdate = {
          status: resultingStatus === 'PAID' ? 'ACTIVE' : 'PARTIALLY_PAID',
          paymentStatus: resultingStatus,
          accountStatus: 'ACTIVE',
          amountPaid: cumulativePaid,
          remainingBalance: resultingRemainingBalance,
          lastPaymentAmount: numAmount,
          lastPaymentDate: paidAt,
          lastPaymentReference: txRef,
          updatedAt: serverTimestamp()
        };

        await Promise.all([
          setDoc(doc(db, 'individualStudents', student.id), studentUpdate, { merge: true }),
          setDoc(doc(db, 'students', student.id), studentUpdate, { merge: true }),
          setDoc(doc(db, 'enrollment_requests', student.id), studentUpdate, { merge: true })
        ]);
      }

      generatePdfReceipt({
        id: txRef,
        reference: txRef,
        payerName: parentName || studentName,
        payerEmail: parentEmail,
        amount: numAmount,
        customerTotal: numAmount,
        baseAmount: numAmount,
        fullProgramFee: contractFee || numAmount,
        remainingBalance: resultingRemainingBalance,
        description: `Tuition Settlement (${plan || student.plan || 'Programme'}) - ${studentName || student.studentName}`,
        plan: plan || student.plan || '',
        category: 'parent_tuition',
        status: resultingStatus,
        paymentMethod: 'Bank Transfer',
        paidAt,
        studentName: studentName || student.studentName
      });

      await onSaved();
      toast.success(
        resultingStatus === 'PARTIALLY_PAID'
          ? `Partial payment of ${formatCurrency(numAmount)} recorded. Remaining balance: ${formatCurrency(resultingRemainingBalance)}.`
          : `Tuition payment of ${formatCurrency(numAmount)} recorded successfully.`
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record parent payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 my-8">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0"><BookOpen size={20} /></div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Manage Tuition &amp; Programme</h3>
              <p className="text-xs text-slate-500">Set the real programme, billing plan and tutor assignment for this student.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={18} /></button>
        </div>

        {provisionedPassword && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <ShieldCheck size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-black">Parent account created</p>
                <p className="mt-1">Temporary password: <strong className="font-mono">{provisionedPassword}</strong>. The parent should change it immediately after signing in.</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 overflow-x-auto">
          <button type="button" onClick={() => setActiveTab('config')} className={`px-4 py-2 rounded-2xl text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap ${activeTab === 'config' ? 'bg-brand-red text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}><BookOpen size={14} /> Tuition &amp; Programme</button>
          <button type="button" onClick={() => setActiveTab('payment')} className={`px-4 py-2 rounded-2xl text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap ${activeTab === 'payment' ? 'bg-brand-red text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}><CreditCard size={14} /> Record Payment</button>
        </div>

        {activeTab === 'config' && (
          <form onSubmit={handleSaveConfig} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-[11px] font-black uppercase text-slate-500">Student Name<input required value={studentName} onChange={e => setStudentName(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              <label className="block text-[11px] font-black uppercase text-slate-500">Parent / Guardian Name<input required value={parentName} onChange={e => setParentName(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              <label className="block text-[11px] font-black uppercase text-slate-500">Parent Email<input required type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              <label className="block text-[11px] font-black uppercase text-slate-500">Parent Phone<input value={parentPhone} onChange={e => setParentPhone(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-[11px] font-black uppercase text-slate-500">Programme
                  {programs.length > 0 ? (
                    <select value={programs.some(p => p.name === plan) ? plan : ''} onChange={e => setPlan(e.target.value)} className={`${inputClass} mt-1.5`}>
                      <option value="">-- Select Programme --</option>
                      {programs.map(program => <option key={program.id} value={program.name}>{program.name}</option>)}
                    </select>
                  ) : (
                    <input required value={plan} onChange={e => setPlan(e.target.value)} placeholder="Enter the actual programme name" className={`${inputClass} mt-1.5`} />
                  )}
                </label>
                <label className="block text-[11px] font-black uppercase text-slate-500">Tuition Fee (₦)<input required type="number" min={0} step={1000} value={amount} onChange={e => setAmount(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
                <label className="block text-[11px] font-black uppercase text-slate-500">Billing Cycle<select value={cycle} onChange={e => setCycle(e.target.value as 'monthly' | 'termly' | 'annual')} className={`${inputClass} mt-1.5`}><option value="monthly">Monthly</option><option value="termly">Termly</option><option value="annual">Annual</option></select></label>
                <label className="block text-[11px] font-black uppercase text-slate-500">Teaching Mode<select value={teachingMode} onChange={e => setTeachingMode(e.target.value)} className={`${inputClass} mt-1.5`}><option>Online 1-on-1</option><option>Physical Home Tutoring</option><option>Hybrid (Online + In-Studio)</option><option>Weekend Academy Group</option></select></label>
                <label className="block text-[11px] font-black uppercase text-slate-500">Enrollment Status<select value={status} onChange={e => setStatus(e.target.value)} className={`${inputClass} mt-1.5`}><option value="APPROVED">Approved</option><option value="PAID">Paid</option><option value="PENDING">Pending</option></select></label>
                <label className="block text-[11px] font-black uppercase text-slate-500">Tutor<select value={tutorId} onChange={e => setTutorId(e.target.value)} className={`${inputClass} mt-1.5`}><option value="">-- No Tutor Assigned --</option>{tutors.map(t => <option key={t.id} value={t.id}>{t.name}{t.email ? ` (${t.email})` : ''}</option>)}</select></label>
                <label className="block text-[11px] font-black uppercase text-slate-500 sm:col-span-2">Tutor Payout Rate (₦ / cycle)<input type="number" min={0} step={1000} value={tutorPayoutRate} onChange={e => setTutorPayoutRate(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold">Cancel</button>
              <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-2xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-2"><Save size={15} />{saving ? 'Saving…' : 'Save Programme, Billing & Tutor'}</button>
            </div>
          </form>
        )}

        {activeTab === 'payment' && (
          <form onSubmit={handleRecordBankPayment} className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200">
              <p className="font-bold">Direct Offline Bank Settlement</p>
              <p className="mt-1 text-[11px]">This records an actual payment against the selected student. No payment amount is invented.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-[11px] font-black uppercase text-slate-500">Payment Amount (₦)<input required type="number" min={1} value={payAmount} onChange={e => setPayAmount(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              <label className="block text-[11px] font-black uppercase text-slate-500">Reference / Bank Slip ID<input required value={payReference} onChange={e => setPayReference(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              <label className="block text-[11px] font-black uppercase text-slate-500">Settlement Date<input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              <label className="block text-[11px] font-black uppercase text-slate-500">Payment Notes / Bank Name<input value={payNotes} onChange={e => setPayNotes(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold">Cancel</button>
              <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black inline-flex items-center gap-2"><Download size={15} />{saving ? 'Recording…' : `Record Payment (${formatCurrency(Number(payAmount) || 0)})`}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
