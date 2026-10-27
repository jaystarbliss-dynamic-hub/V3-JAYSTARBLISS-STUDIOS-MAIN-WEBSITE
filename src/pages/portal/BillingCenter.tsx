import React, { useEffect, useMemo, useState } from 'react';
import { 
  Banknote, CheckCircle2, CreditCard, Download, 
  Loader2, RefreshCw, ShieldCheck, Wallet, X, 
  Building2, Smartphone, BookOpen, 
  School, Check, Bell, UserCheck
} from 'lucide-react';
import { billingGet, billingPost, dateLabel, feeFromBase, formatNaira } from '../../lib/billing';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { MetricGridSkeleton, TableSkeleton } from '../../components/ui/Skeleton';
import { FintechTransactionHistory } from '../../components/portal/FintechTransactionHistory';
import { FintechWalletCard } from '../../components/portal/FintechWalletCard';
import { FintechWithdrawalModal } from '../../components/portal/FintechWithdrawalModal';
import { auth, db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, getDoc, doc, query, where, limit } from 'firebase/firestore';
import { getEffectiveAuth, isMasqueradingActive } from '../../utils/impersonation';

export type BillingCenterRole = 'student' | 'parent' | 'staff' | 'school';
type PaymentRecord = Record<string, any> & { id: string };
type Plan = { 
  id: string; 
  name: string; 
  baseAmount: number; 
  durationWeeks: number; 
  teachingModes: string[]; 
  description: string; 
  active: boolean; 
  role: string 
};
type PaymentMethod = 'card' | 'bank_transfer' | 'opay';

const dueDateFor = (payment?: PaymentRecord) => { 
  if (!payment?.paidAt) return null; 
  const date = new Date(payment.paidAt); 
  date.setDate(date.getDate() + Number(payment.durationWeeks || 4) * 7); 
  return date; 
};

const methodLabel = (method: PaymentMethod) => 
  method === 'card' ? 'Card' : method === 'bank_transfer' ? 'Bank Transfer' : 'OPay / Mobile Money';

const BillingCenter: React.FC<{ role: BillingCenterRole }> = ({ role }) => {
  const { toast } = useToast();
  const [data, setData] = useState<any>({ 
    payments: [], 
    students: [], 
    withdrawals: [], 
    wallet: {}, 
    config: { plans: {}, parentFeePolicy: {}, schoolFeePolicy: {} },
    isExempt: false,
    managedBy: null,
    managerName: null,
    schoolPrograms: [],
    schoolBilling: null,
    schoolInfo: null
  });
  const [loading, setLoading] = useState(true); 
  const [selectedStudentId, setSelectedStudentId] = useState(''); 
  const [selectedPlanId, setSelectedPlanId] = useState(''); 
  const [selectedMode, setSelectedMode] = useState('advance_termly');
  const [paymentPercentage, setPaymentPercentage] = useState<number>(100);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [teachingMode, setTeachingMode] = useState(''); 
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card'); 
  const [showCheckout, setShowCheckout] = useState(false); 
  const [paying, setPaying] = useState(false);

  // Staff wallet & Fintech modals
  const [withdrawalAmount, setWithdrawalAmount] = useState(''); 
  const [bankCode, setBankCode] = useState(''); 
  const [accountNumber, setAccountNumber] = useState(''); 
  const [banks, setBanks] = useState<any[]>([]); 
  const [savingBank, setSavingBank] = useState(false); 
  const [withdrawing, setWithdrawing] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawMode, setWithdrawMode] = useState<'bank' | 'opay'>('bank');
  const [showStaffTransactionHistory, setShowStaffTransactionHistory] = useState(false);

  const handleConfirmWithdrawal = async (payoutData: {
    destination: 'bank' | 'opay';
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    amount: number;
    fee: number;
    netAmount: number;
  }) => {
    if (isMasqueradingActive()) {
      toast.error('Payout withdrawals are disabled in Superadmin Impersonation Mode.');
      return;
    }
    try {
      await billingPost('wallet-withdraw', { 
        action: 'withdraw', 
        amount: payoutData.amount,
        bankCode: payoutData.bankCode,
        bankName: payoutData.bankName,
        accountNumber: payoutData.accountNumber,
        accountName: payoutData.accountName
      }); 
      toast.success('Withdrawal request submitted successfully.');
      await load();
    } catch (err) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        await addDoc(collection(db, 'withdrawals'), {
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          userName: data.wallet?.userName || currentUser.displayName || 'Faculty Member',
          amount: payoutData.amount,
          fee: payoutData.fee,
          netAmount: payoutData.netAmount,
          bankCode: payoutData.bankCode,
          bankName: payoutData.bankName,
          accountNumber: payoutData.accountNumber,
          accountName: payoutData.accountName,
          status: 'pending',
          createdAt: serverTimestamp()
        });
        toast.success('Withdrawal queued for instant settlement.');
        await load();
      } else {
        throw err;
      }
    }
  };

  const load = async () => { 
    setLoading(true); 
    try { 
      const schoolParam = sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || localStorage.getItem('jaystar_cached_school_id') || '';
      const endpoint = 'billing-data' + (schoolParam ? `?schoolId=${encodeURIComponent(schoolParam)}` : '');
      const result = await billingGet<any>(endpoint);
      const currentUser = auth.currentUser;

      // Always fetch live academy programs from Firestore
      try {
        const progsSnap = await getDocs(collection(db, 'programs')).catch(() => ({ docs: [] } as any));
        const liveProgs = (progsSnap.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
        if (liveProgs.length > 0) {
          result.programs = liveProgs;
        }
      } catch (pErr) {
        console.warn('Live programs lookup notice:', pErr);
      }

      // Direct Firestore School Fallback if role is school to guarantee live, fresh custom fees
      if (role === 'school') {
        let directSchoolDoc: any = null;
        const targetId = schoolParam || sessionStorage.getItem('schoolDocId') || currentUser?.uid || '';
        if (targetId) {
          const sSnap = await getDoc(doc(db, 'schools', targetId)).catch(() => null);
          if (sSnap && sSnap.exists()) {
            directSchoolDoc = { id: sSnap.id, ...sSnap.data() };
          }
        }
        if (!directSchoolDoc && currentUser) {
          const uEmail = (currentUser.email || '').toLowerCase();
          const schoolsSnap = await getDocs(query(collection(db, 'schools'), limit(100))).catch(() => ({ docs: [] } as any));
          for (const d of schoolsSnap.docs) {
            const data = d.data();
            const contactEmail = String(data.contactEmail || data.email || '').toLowerCase();
            const adminUid = String(data.adminUid || data.firebaseUid || '');
            if (
              d.id === targetId ||
              d.id === currentUser.uid ||
              (uEmail && contactEmail === uEmail) ||
              adminUid === currentUser.uid
            ) {
              directSchoolDoc = { id: d.id, ...data };
              break;
            }
          }
        }
        if (directSchoolDoc) {
          result.schoolDoc = directSchoolDoc;
          result.schoolBilling = directSchoolDoc.billing || result.schoolBilling || null;
          result.schoolPrograms = (directSchoolDoc.programs && directSchoolDoc.programs.length > 0) 
            ? directSchoolDoc.programs 
            : (result.schoolPrograms || []);
          result.schoolInfo = {
            id: directSchoolDoc.id,
            name: directSchoolDoc.name || result.schoolInfo?.name || 'Partner School',
            schoolCode: directSchoolDoc.schoolCode || result.schoolInfo?.schoolCode || '',
            contactEmail: directSchoolDoc.contactEmail || directSchoolDoc.email || result.schoolInfo?.contactEmail || '',
            address: directSchoolDoc.address || '',
            phone: directSchoolDoc.phone || '',
            ...(result.schoolInfo || {})
          };
        }
      }
      
      // Fallback query if payments is empty
      let mergedPayments = Array.isArray(result.payments) ? [...result.payments] : [];
      if (currentUser && mergedPayments.length === 0) {
        try {
          const effectiveSchoolId = schoolParam || result.schoolInfo?.id || currentUser.uid;
          const [snap1, snap2, snap3] = await Promise.all([
            getDocs(query(collection(db, 'payments'), where('schoolId', '==', effectiveSchoolId))),
            getDocs(query(collection(db, 'payments'), where('userId', '==', currentUser.uid))),
            currentUser.email ? getDocs(query(collection(db, 'payments'), where('email', '==', currentUser.email))) : Promise.resolve(null)
          ]);
          const map = new Map<string, any>();
          [snap1, snap2, snap3].forEach(snap => {
            if (!snap) return;
            snap.docs.forEach(d => {
              if (!map.has(d.id)) {
                const docData = d.data();
                map.set(d.id, {
                  id: d.id,
                  ...docData,
                  paidAt: docData.paidAt?.toDate ? docData.paidAt.toDate().toISOString() : docData.paidAt || docData.createdAt
                });
              }
            });
          });
          if (map.size > 0) {
            mergedPayments = Array.from(map.values());
          }
        } catch (fsErr) {
          console.warn('Direct Firestore payment fallback in BillingCenter:', fsErr);
        }
      }

      // If parent and students list is empty, lookup children from Firestore
      if (role === 'parent' && currentUser) {
        const pEmail = (currentUser.email || '').toLowerCase();
        const pUid = currentUser.uid;
        try {
          const [indivSnap, studSnap] = await Promise.all([
            getDocs(query(collection(db, 'individualStudents'), limit(150))).catch(() => ({ docs: [] } as any)),
            getDocs(query(collection(db, 'students'), limit(150))).catch(() => ({ docs: [] } as any))
          ]);
          const childMap = new Map<string, any>();
          (result.students || []).forEach((s: any) => childMap.set(s.id, s));
          [...indivSnap.docs, ...studSnap.docs].forEach(d => {
            const data = d.data();
            const matches = data.parentId === pUid || data.userId === pUid || (pEmail && String(data.parentEmail || '').toLowerCase() === pEmail);
            if (matches && !childMap.has(d.id)) {
              childMap.set(d.id, { id: d.id, ...data });
            }
          });
          result.students = Array.from(childMap.values());
        } catch (cErr) {
          console.warn('Parent children lookup fallback notice:', cErr);
        }
      }

      setData({ ...result, payments: mergedPayments });
      if (result.schoolBilling?.mode) {
        setSelectedMode(result.schoolBilling.mode);
      }
    } catch (error) { 
      toast.error(error instanceof Error ? error.message : 'Unable to load billing data.'); 
    } finally { 
      setLoading(false); 
    } 
  };

  useEffect(() => { 
    void load(); 
  }, []);

  useEffect(() => { 
    if (role === 'staff') {
      billingGet<any>('paystack-banks').then(result => setBanks(result.banks || [])).catch(() => undefined);
    }
  }, [role]);

  useEffect(() => { 
    const reference = new URLSearchParams(window.location.search).get('reference'); 
    if (!reference) return; 
    billingPost<any>('paystack-verify', { reference }).then(() => { 
      toast.success('Payment verified successfully.'); 
      window.history.replaceState({}, document.title, window.location.pathname); 
      void load(); 
    }).catch(error => toast.error(error instanceof Error ? error.message : 'Payment verification failed.')); 
  }, []);

  // Filter plans dynamically based on database programs and configured fee policies
  const standardPlans = useMemo(() => {
    const customConfigPlans = Object.values((data.config?.plans || {}) as Record<string, Plan>)
      .filter(p => p?.active && ((role === 'school' && p.role === 'school') || (role !== 'school' && p.role !== 'school')));
    
    if (customConfigPlans.length > 0) return customConfigPlans;

    const livePrograms: any[] = data.programs || [];
    return livePrograms
      .filter((p: any) => p.status !== 'DRAFT' && p.status !== 'ARCHIVED')
      .map((p: any) => ({
        id: p.id,
        name: p.title || p.name || 'Academy Course Track',
        baseAmount: Number(p.fee || p.price || p.baseAmount || p.tuition || 0),
        durationWeeks: Number(p.durationWeeks || (String(p.duration || '').toLowerCase().includes('month') ? 4 : 4)),
        teachingModes: Array.isArray(p.teachingModes) && p.teachingModes.length ? p.teachingModes : ['Interactive Live Session', 'Personalized Mentorship'],
        description: p.description || p.subtitle || p.curriculumSummary || (p.seriesName ? `Series: ${p.seriesName} • Stage ${p.stageNumber || 1}` : 'Curriculum Track'),
        active: true,
        role: 'student',
        category: p.categoryId || p.category || 'Technology',
        seriesName: p.seriesName,
        stageName: p.stageName,
        stageNumber: p.stageNumber
      }));
  }, [data.config, data.programs, role]);

  const feePolicy = role === 'school' ? data.config?.schoolFeePolicy : data.config?.parentFeePolicy;

  // Active School custom billing
  const schoolBilling = data.schoolBilling;
  const schoolPrograms = data.schoolPrograms || data.schoolInfo?.programs || [];
  const configuredFee = Number(schoolBilling?.baseAmount || 0);
  const schoolCycle = schoolBilling?.cycle || 'termly';
  const allowedSchoolModes = schoolBilling?.allowedModes || ['advance_termly', 'advance_monthly', 'post_termly', 'post_monthly'];

  const hasConfiguredSubscription = configuredFee > 0 || (schoolPrograms.length > 0 && schoolPrograms.some((p: any) => Number(p.fee || p.amount || 0) > 0));

  // Calculate fee based on selected programs or default fee
  const activeProgramsList = useMemo(() => {
    const rawStudentCount = Number(data.students?.length || 0);

    if (!schoolPrograms.length) {
      if (configuredFee > 0) {
        return [{ id: 'core_prog', name: 'Institutional Technology Partnership', fee: configuredFee, billingModel: 'package', status: 'ACTIVE' }];
      }
      return [];
    }
    return schoolPrograms
      .filter((p: any) => p.status !== 'COMPLETED' && p.status !== 'HISTORICAL')
      .map((p: any, idx: number) => {
        let fee = 0;
        let details = '';
        if (p.billingModel === 'per_head') {
          const adj = Number(p.studentAdjustment || 0);
          const netStudents = Math.max(0, rawStudentCount + adj);
          const rate = Number(p.amountPerHead || 0);
          fee = netStudents * rate;
          details = `${netStudents} learners × ₦${rate.toLocaleString()}`;
        } else {
          fee = Number(p.baseFee ?? p.fee ?? p.amount ?? 0);
          details = 'Fixed Package Fee';
        }

        return {
          id: p.id || `prog_${idx}`,
          name: p.name || `Program Track ${idx + 1}`,
          fee,
          details,
          billingModel: p.billingModel || 'package',
          amountPerHead: p.amountPerHead,
          classRange: p.classRange,
          studentAdjustment: p.studentAdjustment,
          billingFrequency: p.billingFrequency || schoolCycle,
          defaultPaymentMode: p.defaultPaymentMode || 'advance_termly',
          nextBillingDueDate: p.nextBillingDueDate || schoolBilling?.nextDueDate,
          status: p.status || 'ACTIVE',
          description: p.description || ''
        };
      });
  }, [schoolPrograms, configuredFee, data.students, schoolCycle, schoolBilling]);

  const selectedPrograms = useMemo(() => {
    if (!selectedProgramIds.length) return activeProgramsList;
    return activeProgramsList.filter((p: any) => selectedProgramIds.includes(p.id));
  }, [activeProgramsList, selectedProgramIds]);

  const baseTotalForPrograms = useMemo(() => {
    if (!selectedPrograms.length) return configuredFee;
    return selectedPrograms.reduce((acc: number, p: any) => acc + (p.fee || 0), 0);
  }, [selectedPrograms, configuredFee]);

  const schoolFee = Math.round(baseTotalForPrograms * (paymentPercentage / 100));
  const remainingBalance = baseTotalForPrograms - schoolFee;

  // Payments
  const payments = useMemo(() => {
    return (data.payments || [])
      .filter((p: PaymentRecord) => {
        const st = String(p.status || p.paymentStatus || '').toUpperCase();
        return !st || ['PAID', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'APPROVED', 'CONFIRMED', 'VERIFIED'].includes(st);
      })
      .sort((a: PaymentRecord, b: PaymentRecord) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime());
  }, [data.payments]);

  const dueDate = dueDateFor(payments[0]);

  // Start checkout handler
  const startCheckout = (opts?: { plan?: Plan; studentId?: string; planName?: string }) => {
    if (isMasqueradingActive()) {
      toast.error('Payment checkout is disabled in Impersonation Mode. You are viewing records in read-only mode.');
      return;
    }
    if (role === 'school') {
      setSelectedPlanId('custom_school_billing');
      setTeachingMode('Standard Institutional Curriculum Delivery');
    } else {
      const targetPlan = opts?.plan || standardPlans[0];
      if (!targetPlan) return;
      setSelectedPlanId(targetPlan.id);
      setSelectedStudentId(opts?.studentId || selectedStudentId || data.students?.[0]?.id || '');
      setTeachingMode(targetPlan.teachingModes?.[0] || 'Standard Delivery');
    }
    setPaymentMethod('card');
    setShowCheckout(true);
  };

  const processPayment = async (event: React.FormEvent) => { 
    event.preventDefault(); 
    if (isMasqueradingActive()) {
      toast.error('Payment authorization is disabled in Superadmin Impersonation Mode.');
      return;
    }
    if (role === 'parent' && !selectedStudentId) { 
      toast.error('Please select the child this payment is for.'); 
      return; 
    } 
    setPaying(true); 
    try { 
      const checkoutPayload: Record<string, any> = {
        role,
        paymentMethod,
        teachingMode: teachingMode || 'Standard Delivery'
      };

      if (role === 'school') {
        const progNames = selectedPrograms.map((p: any) => p.name).join(', ');
        checkoutPayload.amount = schoolFee;
        checkoutPayload.baseAmount = schoolFee;
        checkoutPayload.fullProgramFee = baseTotalForPrograms;
        checkoutPayload.paymentPercentage = paymentPercentage;
        checkoutPayload.remainingBalance = remainingBalance;
        checkoutPayload.selectedPrograms = progNames;
        checkoutPayload.planId = 'school_custom_fee';
        checkoutPayload.planName = `Institutional Subscription (${paymentPercentage}% Paid - ${progNames})`;
        checkoutPayload.cycle = schoolCycle;
        checkoutPayload.paymentMode = selectedMode;
        checkoutPayload.durationWeeks = schoolCycle === 'monthly' ? 4 : 12;
      } else {
        const plan = standardPlans.find(p => p.id === selectedPlanId) || standardPlans[0];
        checkoutPayload.planId = plan ? plan.id : 'parent_tuition';
        checkoutPayload.studentId = selectedStudentId || undefined;
        checkoutPayload.durationWeeks = 4;
      }

      const result = await billingPost<any>('paystack-initialize', checkoutPayload); 
      if (result?.authorizationUrl) {
        if (result.authorizationUrl.startsWith('http://') || result.authorizationUrl.startsWith('https://')) {
          window.location.assign(result.authorizationUrl);
        } else {
          window.location.href = result.authorizationUrl;
        }
      } else {
        toast.success('Payment recorded successfully.');
        await load();
        setShowCheckout(false);
      } 
    } catch (error) { 
      toast.error(error instanceof Error ? error.message : 'Unable to start checkout.'); 
    } finally { 
      setPaying(false); 
    } 
  };

  const saveBank = async (event: React.FormEvent) => { 
    event.preventDefault(); 
    setSavingBank(true); 
    try { 
      await billingPost('wallet-withdraw', { action: 'save_bank', bankCode, accountNumber }); 
      toast.success('Verified bank account saved.'); 
      await load(); 
    } catch (error) { 
      toast.error(error instanceof Error ? error.message : 'Unable to verify bank account.'); 
    } finally { 
      setSavingBank(false); 
    } 
  };

  const withdraw = async (event: React.FormEvent) => { 
    event.preventDefault(); 
    setWithdrawing(true); 
    try { 
      await billingPost('wallet-withdraw', { action: 'withdraw', amount: Number(withdrawalAmount) }); 
      toast.success('Withdrawal submitted.'); 
      setWithdrawalAmount(''); 
      await load(); 
    } catch (error) { 
      toast.error(error instanceof Error ? error.message : 'Unable to submit withdrawal.'); 
    } finally { 
      setWithdrawing(false); 
    } 
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-150" aria-label="Loading billing workspace">
        <SEO title="Billing Workspace | Jaystarbliss Studios" description="Loading billing records" noindex={true} />
        <MetricGridSkeleton count={4} />
        <TableSkeleton rows={5} columns={5} />
      </div>
    );
  }

  // 1. CONDITIONAL VIEW: Student registered by School or Parent (EXEMPT)
  if (role === 'student' && data.isExempt) {
    return (
      <section className="space-y-6" aria-label="Billing center">
        <SEO title="Student Billing & Curriculum Status | Jaystarbliss Studios" description="Sponsored student status" noindex={true} />

        <div className="bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 dark:from-emerald-950/20 dark:via-slate-900 dark:to-teal-950/10 border border-emerald-200/80 dark:border-emerald-800/60 rounded-3xl p-6 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="min-w-12 min-h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                No Individual Billing Required
              </h2>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed max-w-3xl">
                Your account is linked to <strong className="text-emerald-700 dark:text-emerald-400 font-black">{data.managerName || (data.managedBy === 'school' ? 'your partner school' : 'your parent / guardian')}</strong>. 
                All program subscriptions, learning resources, and hands-on lab sessions are centrally administered. 
                Enjoy your learning journey!
              </p>

              <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-emerald-100 dark:border-emerald-900/40 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Curriculum Access:</span>
                  <span className="font-bold text-emerald-600 bg-emerald-100/60 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full">
                    Active & Unlimited
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">CBT & Practical Exams:</span>
                  <span className="font-bold text-emerald-600 bg-emerald-100/60 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full">
                    Passcode Enabled
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // 2. SCHOOL PORTAL: Admin-Controlled Dynamic Billing
  if (role === 'school') {
    const chargePreview = feeFromBase(schoolFee, feePolicy);
    const hasReminder = Boolean(schoolBilling?.lastReminderSentAt || schoolBilling?.status === 'DUE');

    return (
      <section className="space-y-6" aria-label="School billing center">
        <SEO title="Institutional Subscription | Jaystarbliss Studios" description="Institutional subscription and billing portal." noindex={true} />

        <div className="flex items-center justify-end">
          <button 
            type="button" 
            onClick={() => void load()} 
            className="min-h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw size={14} /> Refresh Records
          </button>
        </div>

        {/* Due date notice if applicable */}
        {hasReminder && (
          <div className="p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
            <Bell className="text-amber-600 mt-0.5 flex-shrink-0" size={18} />
            <div>
              <strong className="font-black text-sm block">Payment Renewal Notice</strong>
              <span className="mt-1 block leading-relaxed">
                Your institutional subscription is scheduled for renewal. 
                {schoolBilling?.nextDueDate && ` Scheduled Due Date: ${new Date(schoolBilling.nextDueDate).toLocaleDateString('en-NG', { dateStyle: 'long' })}.`}
              </span>
            </div>
          </div>
        )}

        {/* Impersonation Notice */}
        {isMasqueradingActive() && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={18} className="text-amber-600 shrink-0" />
              <div>
                <strong className="block font-black">Superadmin Impersonation Mode Active</strong>
                <span>Payment authorization and Paystack checkouts are disabled while impersonating. Invoices, ledger breakdowns, and payment history are available in read-only mode.</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-100 shrink-0">
              Payments Disabled
            </span>
          </div>
        )}

        {/* Undergoing Programmes Card with multi-select */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Undergoing Programmes &amp; Tracks
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Active curriculum and practical tracks. Select programs to include in this invoice settlement.
              </p>
            </div>
            <BookOpen className="text-brand-red" size={20} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeProgramsList.map((prog: any) => {
              const isSelected = selectedProgramIds.length === 0 || selectedProgramIds.includes(prog.id);
              return (
                <div 
                  key={prog.id} 
                  onClick={() => {
                    if (selectedProgramIds.length === 0) {
                      // Currently all selected, switch to just this one unselected
                      setSelectedProgramIds(activeProgramsList.filter((p: any) => p.id !== prog.id).map((p: any) => p.id));
                    } else if (selectedProgramIds.includes(prog.id)) {
                      const next = selectedProgramIds.filter((id: string) => id !== prog.id);
                      setSelectedProgramIds(next.length ? next : activeProgramsList.map((p: any) => p.id));
                    } else {
                      setSelectedProgramIds([...selectedProgramIds, prog.id]);
                    }
                  }}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected 
                      ? 'border-brand-red bg-red-50/40 dark:bg-red-950/20 shadow-xs' 
                      : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 opacity-70'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-brand-red dark:bg-red-950/40">
                        {prog.status || 'ACTIVE'}
                      </span>
                      <span className="text-xs font-mono font-black text-slate-900 dark:text-white">
                        {formatNaira(prog.fee)}
                      </span>
                    </div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white mt-2">
                      {prog.name}
                    </h3>
                    {prog.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                        {prog.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Click to toggle invoice selection</span>
                    <span className={`font-bold ${isSelected ? 'text-brand-red' : 'text-slate-400'}`}>
                      {isSelected ? '✓ Included' : '+ Excluded'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic School Billing Fee Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {!hasConfiguredSubscription || baseTotalForPrograms === 0 ? (
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 rounded-3xl p-8 shadow-sm text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-xs">
                <Bell size={28} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  No Institutional Subscription Configured
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  No institutional curriculum subscription or custom fee has been configured for {data.schoolInfo?.name || 'this school'} yet. Please contact the Jaystarbliss administration to set up your institution's custom fee schedule.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                Institutional Subscription: Not Configured (₦0)
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-brand-red">
                    Admin-Configured Institutional Fee
                  </span>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {formatNaira(schoolFee)} <span className="text-xs text-slate-400 font-normal">({paymentPercentage}% of {formatNaira(baseTotalForPrograms)} full fee) / {schoolCycle === 'monthly' ? 'Month (4 Weeks)' : 'Term (12 Weeks)'}</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Active programs in this invoice: <strong className="text-slate-700 dark:text-slate-300">{selectedPrograms.map((p: any) => p.name).join(', ')}</strong>
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {schoolCycle === 'monthly' ? '4 Weeks Cycle' : '12 Weeks Term'}
                </span>
              </div>

              {/* Percentage Payment Selector */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                  Select Upfront Payment Percentage
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { pct: 100, label: '100% Full Payment', desc: 'Pay total fee in full' },
                    { pct: 70, label: '70% Termly Upfront', desc: '30% deferred balance' },
                    { pct: 50, label: '50% Half Termly', desc: '50% deferred balance' }
                  ].map(opt => (
                    <button
                      key={opt.pct}
                      type="button"
                      onClick={() => setPaymentPercentage(opt.pct)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        paymentPercentage === opt.pct
                          ? 'border-brand-red bg-red-50/50 dark:bg-red-950/20 text-slate-900 dark:text-white font-black'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Partial Payment Notice */}
              {paymentPercentage < 100 && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
                  <div className="font-bold flex items-center gap-1.5">
                    <Bell size={14} className="text-amber-600" />
                    <span>Upfront Installment Mode Active ({paymentPercentage}%)</span>
                  </div>
                  <p className="mt-1 leading-relaxed">
                    You are paying <strong>{formatNaira(schoolFee)}</strong> now. A remaining balance of <strong className="font-black text-brand-red">{formatNaira(remainingBalance)}</strong> will be scheduled to be settled before the end of the term.
                  </p>
                </div>
              )}

              {/* Mode of Payment Selector */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                  Select Mode of Payment
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'advance_termly', label: 'Advance Termly', desc: 'Pay upfront for the entire 12-week term.' },
                    { id: 'advance_monthly', label: 'Advance Monthly', desc: 'Pay upfront for 4 weeks of curriculum access.' },
                    { id: 'post_termly', label: 'Post Termly', desc: 'Settle institutional invoice at end of term.' },
                    { id: 'post_monthly', label: 'Post Monthly', desc: 'Settle institutional invoice at end of month.' }
                  ]
                    .filter(m => allowedSchoolModes.includes(m.id))
                    .map(modeOpt => (
                      <div
                        key={modeOpt.id}
                        onClick={() => setSelectedMode(modeOpt.id)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          selectedMode === modeOpt.id
                            ? 'border-brand-red bg-red-50/50 dark:bg-red-950/20 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span>{modeOpt.label}</span>
                          {selectedMode === modeOpt.id && <Check size={14} className="text-brand-red" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{modeOpt.desc}</p>
                      </div>
                    ))}
                </div>
              </div>

              {/* Price breakdown */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="block text-slate-400 text-[10px] uppercase font-bold">Payable Base</span>
                  <strong className="text-slate-900 dark:text-white font-mono">{formatNaira(schoolFee)}</strong>
                </div>
                <div>
                  <span className="block text-slate-400 text-[10px] uppercase font-bold">Est. Gateway Fee</span>
                  <strong className="text-slate-900 dark:text-white font-mono">{formatNaira(chargePreview.transactionFee)}</strong>
                </div>
                <div>
                  <span className="block text-slate-400 text-[10px] uppercase font-bold">Est. Total</span>
                  <strong className="text-brand-red font-mono font-black">{formatNaira(chargePreview.totalAmount)}</strong>
                </div>
              </div>

              <button
                type="button"
                disabled={isMasqueradingActive()}
                onClick={() => startCheckout()}
                className={`w-full min-h-12 rounded-2xl font-black text-xs md:text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all ${
                  isMasqueradingActive()
                    ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                    : 'bg-brand-red hover:bg-red-700 text-white cursor-pointer'
                }`}
              >
                <CreditCard size={17} /> 
                {isMasqueradingActive() 
                  ? `Checkout Disabled in Impersonation Mode (${formatNaira(schoolFee)})` 
                  : `Proceed to Paystack Checkout (${formatNaira(schoolFee)})`}
              </button>
            </div>
          )}

          {/* Quick Metrics */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Institutional Status</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">School:</span>
                  <span className="font-bold">{data.schoolInfo?.name || 'Partner School'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Latest Verified Payment:</span>
                  <span className="font-bold">{payments[0] ? formatNaira(payments[0].customerTotal || payments[0].baseAmount) : '—'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Next Due Date:</span>
                  <span className="font-black text-brand-red">
                    {schoolBilling?.nextDueDate ? new Date(schoolBilling.nextDueDate).toLocaleDateString('en-NG') : 'Active'}
                  </span>
                </div>
              </div>
            </div>

            {/* Institutional Payment & Receipt Instructions */}
            <div className="bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 text-xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-xs uppercase tracking-wider">
                <Building2 size={16} className="text-brand-red" />
                <span>Payment & Remittance Guide</span>
              </div>
              <ul className="space-y-2 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-brand-red font-black">•</span>
                  <span><strong>Instant Settlement:</strong> Click <em>Proceed to Paystack Checkout</em> to pay securely using Card, Bank Transfer, or USSD with instant automated reconciliation.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-red font-black">•</span>
                  <span><strong>Automatic Receipts:</strong> Every verified transaction generates an official stamped PDF receipt with breakdown of student access allocations.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-red font-black">•</span>
                  <span><strong>Installment Options:</strong> Select 50%, 70%, or 100% upfront depending on your school board's approved billing schedule.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Payment History & Receipts */}
        <div className="mt-8">
          <FintechTransactionHistory 
            transactions={payments} 
            title="Institutional Transactions & Receipts"
            role="school"
            emptyMessage="No verified school payments on record"
          />
        </div>

        {/* Paystack Checkout Modal */}
        {showCheckout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-brand-red">Paystack Checkout Review</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                    {data.schoolInfo?.name || 'Partner School'} - Lab Subscription
                  </h2>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowCheckout(false)} 
                  className="min-h-9 min-w-9 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={processPayment} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Base Institutional Fee</span>
                    <strong className="font-mono">{formatNaira(schoolFee)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Estimated Paystack Transaction Fee</span>
                    <strong className="font-mono">{formatNaira(chargePreview.transactionFee)}</strong>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-sm font-black">
                    <span>Estimated Total Paid</span>
                    <strong className="text-brand-red font-mono">{formatNaira(chargePreview.totalAmount)}</strong>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200 leading-relaxed">
                  <strong>Important:</strong> The transaction fee is estimated for transparency. Only <strong>{formatNaira(schoolFee)}</strong> is forwarded as the base amount to Paystack so the fee is never charged twice.
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Select Checkout Channel</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['card', 'bank_transfer', 'opay'] as PaymentMethod[]).map(method => (
                      <button 
                        key={method} 
                        type="button" 
                        onClick={() => setPaymentMethod(method)} 
                        className={`min-h-14 rounded-xl border p-2 text-xs font-bold transition-all ${
                          paymentMethod === method 
                            ? 'border-brand-red bg-red-50 text-brand-red dark:bg-red-950/20' 
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {method === 'card' ? <CreditCard className="mx-auto mb-1" size={16} /> : method === 'bank_transfer' ? <Building2 className="mx-auto mb-1" size={16} /> : <Smartphone className="mx-auto mb-1" size={16} />}
                        {methodLabel(method)}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  disabled={paying} 
                  type="submit" 
                  className="min-h-12 w-full rounded-xl bg-brand-red hover:bg-red-700 px-5 text-xs md:text-sm font-black text-white disabled:opacity-50 transition-all shadow-sm"
                >
                  {paying ? <Loader2 className="animate-spin mx-auto" size={18} /> : `Authorize ${methodLabel(paymentMethod)} Checkout`}
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    );
  }

  // 3. DEFAULT/PARENT/STAFF/INDEPENDENT STUDENT BILLING VIEW
  return (
    <section className="space-y-6" aria-label="Billing center">
      <SEO title="Billing Center | Jaystarbliss Studios" description="Payments, plans, receipts and staff wallet." noindex={true} />

      <div className="flex items-center justify-end">
        <button 
          type="button" 
          onClick={() => void load()} 
          className="min-h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw size={14} /> Refresh Records
        </button>
      </div>

      {/* Impersonation Notice */}
      {isMasqueradingActive() && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={18} className="text-amber-600 shrink-0" />
            <div>
              <strong className="block font-black">Superadmin Impersonation Mode Active</strong>
              <span>Payment processing and withdrawal requests are disabled while impersonating. All ledger histories and account details are available in read-only mode.</span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-100 shrink-0">
            Payments Disabled
          </span>
        </div>
      )}

      {role !== 'staff' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-slate-500">Latest Payment</p>
            <p className="mt-1 text-xl font-black font-mono text-slate-900 dark:text-white">
              {payments[0] ? formatNaira(payments[0].customerTotal || Number(payments[0].amount || 0) / 100) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {payments[0] ? dateLabel(payments[0].paidAt) : 'No verified payment yet'}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-slate-500">Paid Through / Access Due</p>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
              {dueDate ? dueDate.toLocaleDateString('en-NG') : 'Active Access'}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-slate-500">Verified Transactions</p>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
              {payments.length} Records
            </p>
          </div>
        </div>
      )}

      {/* Parent / Student Plan & Child Tuition Settlement Section */}
      {role !== 'staff' && (
        <div className="space-y-6">
          {/* Linked Children Tuition Cards for Parents */}
          {role === 'parent' && data.students && data.students.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck className="text-brand-red" size={20} />
                    <span>Linked Children &amp; Tuition Accounts ({data.students.length})</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Settle tuition directly for your linked students or fund their ongoing learning cycles.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.students.map((child: any) => {
                  const childName = child.fullName || child.studentName || child.name || 'Student';
                  const childPlan = child.plan || child.track || child.programName || 'Academy Track';
                  const childClass = child.class || child.grade || 'Standard Track';
                  const matchedPlan = standardPlans.find(p => 
                    p.name.toLowerCase() === childPlan.toLowerCase() || 
                    childPlan.toLowerCase().includes(p.name.toLowerCase())
                  ) || standardPlans[0];
                  const childFee = Number(child.tuitionFee || child.fee || matchedPlan?.baseAmount || 35000);
                  const effectivePlan = matchedPlan ? { ...matchedPlan, baseAmount: childFee } : { id: 'parent_custom_tuition', name: childPlan, baseAmount: childFee, durationWeeks: 4, teachingModes: ['Standard Delivery'], description: 'Assigned Academy Tuition', active: true, role: 'parent' };

                  return (
                    <article key={child.id} className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-5 flex flex-col justify-between hover:border-brand-red/40 transition-all shadow-xs">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-brand-red text-white font-black text-xs flex items-center justify-center shrink-0">
                              {childName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">{childName}</h3>
                              <p className="text-[11px] text-slate-500 truncate">@{child.username || 'student'}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                            {child.status || 'Active'}
                          </span>
                        </div>

                        <div className="mt-3.5 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Track:</span>
                            <strong className="text-slate-800 dark:text-slate-200 font-bold truncate max-w-[150px]">{childPlan}</strong>
                          </div>
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Cohort:</span>
                            <strong className="text-slate-800 dark:text-slate-200">{childClass}</strong>
                          </div>
                          {child.tutorName && (
                            <div className="flex items-center justify-between text-slate-500">
                              <span>Mentor:</span>
                              <strong className="text-slate-800 dark:text-slate-200 truncate max-w-[150px]">{child.tutorName}</strong>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                            <span>Tuition Fee:</span>
                            <strong className="text-brand-red font-mono font-black">{formatNaira(childFee)}</strong>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isMasqueradingActive()}
                        onClick={() => startCheckout({ 
                          studentId: child.id, 
                          plan: effectivePlan,
                          planName: childPlan 
                        })}
                        className={`mt-4 min-h-10 w-full rounded-xl px-4 text-xs font-black shadow-xs transition-all inline-flex items-center justify-center gap-1.5 ${
                          isMasqueradingActive()
                            ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                            : 'bg-brand-red hover:bg-red-700 text-white cursor-pointer'
                        }`}
                      >
                        <CreditCard size={13} />
                        <span>{isMasqueradingActive() ? 'Disabled in Impersonation' : `Settle Tuition (${formatNaira(childFee)})`}</span>
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending Enrollment Requests for Parents */}
          {role === 'parent' && data.enrollments && data.enrollments.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    Pending Enrollment Requests ({data.enrollments.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Settle tuition online for children currently awaiting admissions review.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {data.enrollments.map((req: any) => (
                  <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{req.studentName || 'Child'}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{req.plan || 'Learning Track'} • {req.studentAge || 'Age not specified'}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isMasqueradingActive()}
                      onClick={() => startCheckout({ 
                        plan: standardPlans.find(p => p.name === req.plan) || standardPlans[0],
                        planName: req.plan 
                      })}
                      className="px-4 py-2 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold transition-all shrink-0"
                    >
                      Pay for {req.studentName ? req.studentName.split(' ')[0] : 'Child'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Academy Learning Tracks from Database */}
          {standardPlans.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="mb-5">
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  {role === 'parent' ? 'Published Academy Learning Tracks & Programs' : 'Available Learning Programs'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {role === 'parent'
                    ? 'Active curriculum tracks and technology programs configured directly in the academy database.'
                    : 'Select your enrolled curriculum track to proceed with tuition settlement.'}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {standardPlans.map(plan => {
                  const hasFee = plan.baseAmount > 0;
                  const fee = hasFee ? feeFromBase(plan.baseAmount, feePolicy) : null;
                  return (
                    <article key={plan.id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 flex flex-col justify-between hover:border-brand-red/40 transition-all">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-slate-900 dark:text-white text-base">{plan.name}</h3>
                            </div>
                            {plan.description && (
                              <p className="mt-1 text-xs leading-5 text-slate-500">{plan.description}</p>
                            )}
                          </div>
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-black text-slate-700 dark:text-slate-300 shrink-0">
                            {plan.durationWeeks} weeks
                          </span>
                        </div>

                        {hasFee && fee && (
                          <div className="mt-5 grid grid-cols-3 gap-2 text-xs p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl">
                            <div>
                              <span className="block text-slate-400 text-[10px] font-bold uppercase">Base</span>
                              <strong className="font-mono text-slate-900 dark:text-white">{formatNaira(plan.baseAmount)}</strong>
                            </div>
                            <div>
                              <span className="block text-slate-400 text-[10px] font-bold uppercase">Est. fee</span>
                              <strong className="font-mono text-slate-900 dark:text-white">{formatNaira(fee.transactionFee)}</strong>
                            </div>
                            <div>
                              <span className="block text-slate-400 text-[10px] font-bold uppercase">Est. total</span>
                              <strong className="font-mono text-brand-red font-black">{formatNaira(fee.totalAmount)}</strong>
                            </div>
                          </div>
                        )}
                      </div>

                      <button 
                        type="button" 
                        disabled={isMasqueradingActive()}
                        onClick={() => startCheckout({ plan })} 
                        className={`mt-5 min-h-11 w-full rounded-xl px-4 text-xs font-black shadow-sm transition-all ${
                          isMasqueradingActive()
                            ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                            : 'bg-brand-red hover:bg-red-700 text-white cursor-pointer'
                        }`}
                      >
                        {isMasqueradingActive()
                          ? `Payment Disabled in Impersonation Mode`
                          : hasFee
                            ? `Continue to Payment (${formatNaira(plan.baseAmount)})`
                            : `Select & Proceed to Checkout`}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            role === 'parent' && (!data.students || data.students.length === 0) && (
              <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2 shadow-xs">
                <CreditCard size={32} className="mx-auto text-slate-400" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">No active tuition plans or linked children</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Once your child's enrollment is registered and approved by the admissions desk, customized tuition and payment schedules will appear here.
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* Staff Wallet View */}
      {role === 'staff' && (
        <div className="space-y-6">
          <FintechWalletCard
            userName={data.wallet?.userName || auth.currentUser?.displayName || 'Faculty Instructor'}
            userRole="staff"
            balance={Number(data.wallet?.availableBalance || 0)}
            subTitleText="Teaching Roster"
            subTitleValue={`${data.students?.length || 0} Learners`}
            latestTransaction={payments[0] || null}
            onRefresh={load}
            onViewTransactionHistory={() => setShowStaffTransactionHistory(true)}
            onWithdraw={() => {
              setWithdrawMode('bank');
              setIsWithdrawModalOpen(true);
            }}
            onVaultClick={() => {
              setWithdrawMode('bank');
              setIsWithdrawModalOpen(true);
            }}
          />

          {showStaffTransactionHistory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Teaching settlement history">
              <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-brand-red">Billing</p><h2 className="text-lg font-black text-slate-900 dark:text-white">Teaching Payouts &amp; Settlement History</h2></div>
                  <button type="button" onClick={() => setShowStaffTransactionHistory(false)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={16}/></button>
                </div>
                <FintechTransactionHistory transactions={payments} title="Teaching Payouts & Settlement History" role="staff" emptyMessage="No teaching payout transactions are recorded yet." />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment History for Student and Parent */}
      {role !== 'staff' && (
        <div id="fintech-tx-history" className="mt-8">
          <FintechTransactionHistory 
            transactions={payments} 
            title="Transactions & Invoices"
            role={role}
            emptyMessage="No transaction receipts on record yet"
          />
        </div>
      )}

      {/* Fintech Withdrawal Modal */}
      <FintechWithdrawalModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        availableBalance={Number(data.wallet?.availableBalance || 0)}
        initialMode="bank"
        savedBankCode={data.wallet?.bankAccount?.bankCode || bankCode}
        savedAccountNumber={data.wallet?.bankAccount?.accountNumber || accountNumber}
        savedAccountName={data.wallet?.bankAccount?.accountName || ''}
        banksList={banks}
        onConfirmWithdrawal={handleConfirmWithdrawal}
      />

      {/* Checkout Modal for Parents / Independent Students */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-brand-red">Paystack Checkout</p>
                <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Payment Review</h2>
              </div>
              <button 
                type="button" 
                onClick={() => setShowCheckout(false)} 
                className="min-h-9 min-w-9 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={processPayment} className="mt-6 space-y-4">
              {role === 'parent' && (
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Select Child / Student</span>
                  <select 
                    required 
                    value={selectedStudentId} 
                    onChange={e => setSelectedStudentId(e.target.value)} 
                    className="min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs"
                  >
                    <option value="">Select Child</option>
                    {(data.students || []).map((student: any) => (
                      <option key={student.id} value={student.id}>
                        {student.fullName || student.studentName || student.username}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Teaching Delivery Mode</span>
                <select 
                  value={teachingMode} 
                  onChange={e => setTeachingMode(e.target.value)} 
                  className="min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs"
                >
                  <option value="Physical Lab / In-Person">Physical Lab / In-Person</option>
                  <option value="Online 1-on-1 Mentorship">Online 1-on-1 Mentorship</option>
                  <option value="Hybrid (Lab + Virtual Sessions)">Hybrid (Lab + Virtual Sessions)</option>
                </select>
              </label>

              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Payment Method</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['card', 'bank_transfer', 'opay'] as PaymentMethod[]).map(method => (
                    <button 
                      key={method} 
                      type="button" 
                      onClick={() => setPaymentMethod(method)} 
                      className={`min-h-14 rounded-xl border p-2 text-xs font-bold transition-all ${
                        paymentMethod === method 
                          ? 'border-brand-red bg-red-50 text-brand-red dark:bg-red-950/20' 
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {method === 'card' ? <CreditCard className="mx-auto mb-1" size={16} /> : method === 'bank_transfer' ? <Building2 className="mx-auto mb-1" size={16} /> : <Smartphone className="mx-auto mb-1" size={16} />}
                      {methodLabel(method)}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                disabled={paying} 
                type="submit" 
                className="min-h-12 w-full rounded-xl bg-brand-red hover:bg-red-700 px-5 text-xs md:text-sm font-black text-white disabled:opacity-50 transition-all shadow-sm"
              >
                {paying ? <Loader2 className="animate-spin mx-auto" size={18} /> : `Proceed with ${methodLabel(paymentMethod)}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default BillingCenter;
