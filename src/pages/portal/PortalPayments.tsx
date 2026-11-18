import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, ShieldCheck, CheckCircle2, ArrowRight
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, getDoc, doc, query, where, limit } from 'firebase/firestore';
import { getClientPaymentConfig, feeFromBase, type PaymentConfig } from '../../lib/billing';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { FintechTransactionHistory } from '../../components/portal/FintechTransactionHistory';
import { PaystackPaymentReviewModal } from '../../components/portal/PaystackPaymentReviewModal';
import { getEffectiveAuth, isMasqueradingActive } from '../../utils/impersonation';

interface PaymentRecord {
  id: string;
  amount?: number | string;
  reference?: string;
  plan?: string;
  description?: string;
  paymentMethod?: string;
  status?: string;
  createdAt?: { toDate?: () => Date } | Date | string | null;
}

interface RenewalPlanItem {
  id: string;
  name: string;
  baseAmount: number;
  price: string;
  period: string;
  durationWeeks: number;
  popular: boolean;
  features: string[];
  description?: string;
}

export const PortalPayments: React.FC = () => {
  const { toast } = useToast();
  const [role, setRole] = useState('student');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [renewalSuccess, setRenewalSuccess] = useState(false);
  const [enrollmentRequestId, setEnrollmentRequestId] = useState('');
  const [enrollmentContext, setEnrollmentContext] = useState<{ studentName: string; planId: string } | null>(null);

  useEffect(() => {
    const effective = getEffectiveAuth();
    const userRole = effective.effectiveRole;
    setRole(userRole);

    const requestId = new URLSearchParams(window.location.search).get('enrollmentRequestId') || '';
    setEnrollmentRequestId(requestId);

    const fetchPaymentHistory = async () => {
      try {
        const userUid = effective.effectiveUid || auth.currentUser?.uid;
        const schoolId = effective.effectiveSchoolId || sessionStorage.getItem('schoolId') || '';
        const userEmail = effective.effectiveEmail || auth.currentUser?.email || '';

        const ownedQueries = [];
        if (userUid) {
          ownedQueries.push(query(collection(db, 'payments'), where('userId', '==', userUid), limit(50)));
          ownedQueries.push(query(collection(db, 'payments'), where('parentId', '==', userUid), limit(50)));
          ownedQueries.push(query(collection(db, 'payments'), where('schoolId', '==', userUid), limit(50)));
        }
        if (schoolId && schoolId !== userUid) {
          ownedQueries.push(query(collection(db, 'payments'), where('schoolId', '==', schoolId), limit(50)));
        }
        if (userEmail) {
          ownedQueries.push(query(collection(db, 'payments'), where('email', '==', userEmail), limit(50)));
          ownedQueries.push(query(collection(db, 'payments'), where('parentEmail', '==', userEmail), limit(50)));
        }

        const snapshots = await Promise.all(ownedQueries.map(q => getDocs(q).catch(() => ({ forEach: () => {} } as any))));
        const list: PaymentRecord[] = [];
        const seen = new Set<string>();
        snapshots.forEach((snap: any) => snap.forEach((d: any) => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            list.push({ id: d.id, ...d.data() });
          }
        }));
        list.sort((a, b) => {
          const timestamp = (value: PaymentRecord['createdAt']): number => {
            if (!value) return 0;
            if (typeof value === 'string') return new Date(value).getTime() || 0;
            if (value instanceof Date) return value.getTime();
            if (typeof value.toDate === 'function') return value.toDate().getTime();
            return 0;
          };
          return timestamp(b.createdAt) - timestamp(a.createdAt);
        });

        setPayments(list);
      } catch (err) {
        console.warn('Payments load error:', err);
      }
    };

    fetchPaymentHistory();
  }, []);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference');
    const verifyReturnedPayment = async () => {
      const user = auth.currentUser;
      if (!reference || !user) return;
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/.netlify/functions/paystack-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ reference })
        });
        const data = await response.json();
        if (!response.ok || !data.verified) throw new Error(data.error || 'Payment verification failed.');
        setRenewalSuccess(true);
        toast.success('Payment verified successfully. Your receipt is now recorded.');
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => setRenewalSuccess(false), 3000);
      } catch (err) {
        console.error('Returned payment verification error:', err);
        toast.error(err instanceof Error ? err.message : 'We could not verify this payment yet.');
      }
    };
    verifyReturnedPayment();
  }, [toast]);

  const isSchool = role.includes('school');

  const [plans, setPlans] = useState<RenewalPlanItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadDynamicPlans = async () => {
      try {
        const config = await getClientPaymentConfig();
        if (!cancelled) setPaymentConfig(config);
        const roleKey = isSchool ? 'school' : 'student';
        let fetchedPlans: RenewalPlanItem[] = Object.values(config.plans || {})
          .filter((p: any) => p.role === roleKey && p.active !== false)
          .map((p: any) => {
            const baseAmount = Number(p.baseAmount || 0);
            return {
              id: p.id,
              name: p.name,
              baseAmount,
              price: `₦${baseAmount.toLocaleString()}`,
              period: '/ Term',
              durationWeeks: Number(p.durationWeeks || (isSchool ? 12 : 4)),
              popular: p.id.includes('mentorship') || p.id.includes('cbt') || p.id.includes('ai'),
              features: p.teachingModes?.length ? p.teachingModes : [p.description || 'Institutional technology track'],
              description: p.description || ''
            };
          });

        if (fetchedPlans.length === 0) {
          const programsSnap = await getDocs(query(collection(db, 'programs'), where('status', '==', 'PUBLISHED'))).catch(() => getDocs(collection(db, 'programs')));
          fetchedPlans = programsSnap.docs.map((docSnap: any) => {
            const p = docSnap.data();
            const baseAmount = Number(p.price || p.tuition || p.baseAmount || 25000);
            return {
              id: docSnap.id,
              name: p.title || p.name || 'Academy Tech Program',
              baseAmount,
              price: `₦${baseAmount.toLocaleString()}`,
              period: '/ Term',
              durationWeeks: Number(p.durationWeeks || 4),
              popular: !!p.popular,
              features: Array.isArray(p.teachingModes) && p.teachingModes.length > 0
                ? p.teachingModes
                : [p.description || p.category || 'Hands-on practical curriculum & live labs'],
              description: p.description || p.category || ''
            };
          });
        }

        if (!cancelled) {
          setPlans(fetchedPlans);
        }
      } catch (err) {
        console.warn('Error loading dynamic plans:', err);
      }
    };
    void loadDynamicPlans();
    return () => { cancelled = true; };
  }, [isSchool]);

  useEffect(() => {
    if (!enrollmentRequestId || role !== 'parent') return;
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'enrollment_requests', enrollmentRequestId)).then((snap) => {
      if (!snap.exists()) return;
      const request = snap.data();
      if (request.parentId !== user.uid) return;
      const planName = String(request.plan || '').toLowerCase();
      const planId = planName.includes('intensive') ? 'plan_mentorship' : planName.includes('robotics') || planName.includes('ai') ? 'plan_robotics' : 'plan_weekend';
      const matched = plans.find((plan) => plan.id === planId);
      if (matched) setSelectedPlan(matched.name);
      setEnrollmentContext({ studentName: String(request.studentName || 'Child'), planId });
    }).catch(() => undefined);
  }, [enrollmentRequestId, role, plans]);

  const activePlan = useMemo(
    () => plans.find((p) => p.name === selectedPlan) || null,
    [plans, selectedPlan]
  );

  const feePolicy = isSchool ? paymentConfig?.schoolFeePolicy : paymentConfig?.parentFeePolicy;
  const activeChargePreview = useMemo(() => {
    return feeFromBase(activePlan?.baseAmount || 0, feePolicy);
  }, [activePlan, feePolicy]);

  const handleInitiateRenewal = (planName: string) => {
    if (isMasqueradingActive()) {
      toast.error('Payment checkout is restricted in Admin Impersonation mode. Payments must be processed directly by the client or school.');
      return;
    }
    setSelectedPlan(planName);
    setShowCheckoutModal(true);
  };

  const handleProcessPayment = async () => {
    if (isMasqueradingActive()) {
      toast.error('Payment checkout is restricted in Admin Impersonation mode.');
      return;
    }
    const user = auth.currentUser;
    if (!user || !selectedPlan) {
      toast.error('Please sign in before starting payment.');
      return;
    }

    setRenewing(true);
    try {
      const plan = plans.find(p => p.name === selectedPlan);
      if (!plan) throw new Error('The selected payment plan is no longer available.');

      const idToken = await user.getIdToken();
      const response = await fetch('/.netlify/functions/paystack-initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          planId: plan.id,
          role,
          paymentPolicyAccepted: true,
          ...(enrollmentRequestId ? { enrollmentRequestId } : {})
        })
      });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) {
        throw new Error(data.error || 'Unable to initialize payment.');
      }
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      console.error('Error initializing payment:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to start payment.');
      setRenewing(false);
    }
  };

  return (
    <div className="space-y-8">
      <SEO title="Tuition Renewal & Billing Statements | Jaystarbliss Studios" description="Renew academic terms, manage institutional partnerships, and download tuition invoices." noindex={true} />

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand-red font-bold text-xs uppercase tracking-wider mb-1"><CreditCard size={14} /> Financial Desk &amp; Tuition</div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">{isSchool ? 'Institutional Licensing & Term Renewal' : 'Tuition & Membership Renewal'}</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">{isSchool ? 'Manage school lab subscriptions, student seat allocations, and verified invoices.' : 'Secure term renewals, review receipts, and maintain active access codes.'}</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70">
          <ShieldCheck size={16} className="text-brand-red shrink-0" />
          <span>256-Bit SSL Encrypted</span>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">{isSchool ? 'School Partnership & Renewal Packages' : 'Choose Your Term Renewal Track'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.id} className={`rounded-2xl p-6 border transition-all flex flex-col justify-between relative ${plan.popular ? 'border-brand-red bg-white dark:bg-slate-900 shadow-md ring-1 ring-brand-red/25' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs'}`}>
              {plan.popular && (
                <span className="absolute -top-2.5 right-5 px-2.5 py-0.5 bg-brand-red text-white text-[10px] font-black uppercase rounded-md tracking-wider shadow-xs">
                  Recommended
                </span>
              )}
              <div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 my-3"><span className="text-3xl font-black text-slate-900 dark:text-white font-mono">{plan.price}</span><span className="text-xs text-slate-500 font-medium">{plan.period}</span></div>
                <div className="space-y-2.5 my-5 text-xs text-slate-600 dark:text-slate-300">
                  {plan.features.map((feature: string) => (
                    <div key={feature} className="flex items-center gap-2.5">
                      <CheckCircle2 size={15} className="text-slate-700 dark:text-slate-300 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleInitiateRenewal(plan.name)}
                className={`min-h-11 w-full py-3 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${plan.popular ? 'bg-brand-red hover:bg-red-800 text-white shadow-sm' : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white'}`}
              >
                <span>Review &amp; Pay</span><ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <FintechTransactionHistory
          transactions={payments}
          title="Payment Receipts & Invoices"
          role={role}
          emptyMessage="No transaction records on file"
        />
      </div>

      {renewalSuccess && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-slate-300 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg dark:border-slate-700">
          <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-brand-red" /> Payment verified successfully.</div>
        </div>
      )}

      <PaystackPaymentReviewModal
        isOpen={showCheckoutModal && Boolean(activePlan)}
        onClose={() => { if (!renewing) setShowCheckoutModal(false); }}
        reviewKey={`renewal:${activePlan?.id || ''}:${role}:${enrollmentRequestId}`}
        subtitle={isSchool ? 'Institutional Licensing & Renewal' : 'Tuition & Membership Renewal'}
        title="Review Your Payment"
        description="Please review the selected renewal plan details and confirm our Payment Policy before proceeding to Paystack."
        contextRows={[
          { label: 'Programme / Plan', value: activePlan?.name },
          { label: 'Learner', value: enrollmentContext?.studentName },
          { label: 'Account Type', value: isSchool ? 'Partner School' : role === 'parent' ? 'Parent / Guardian' : 'Student' },
          { label: 'Billing Cycle', value: activePlan ? `${activePlan.durationWeeks} Weeks` : undefined },
          { label: 'Summary', value: activePlan?.description || activePlan?.features.join(', ') }
        ]}
        subtotal={activeChargePreview.baseAmount}
        estimatedFee={activeChargePreview.transactionFee}
        estimatedTotal={activeChargePreview.totalAmount}
        feeNote="Estimated gateway fee is shown for transparency. Paystack confirms the final charge dynamically at hosted checkout."
        loading={renewing}
        onConfirmPaystack={handleProcessPayment}
      />
    </div>
  );
};

export default PortalPayments;

