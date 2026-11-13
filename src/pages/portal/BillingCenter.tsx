import React, { useEffect, useMemo, useState } from 'react';
import { 
  Banknote, CheckCircle2, CreditCard, Download, 
  Loader2, RefreshCw, ShieldCheck, Wallet, X, 
  Building2, Smartphone, BookOpen, 
  School, Check, Bell, UserCheck,
  ChevronDown, ChevronRight, ChevronUp,
  CheckSquare, Square, MinusSquare, User, Users, Sparkles,
  Filter, Layers, ArrowRight, Clock, AlertCircle
} from 'lucide-react';
import {
  billingGet,
  billingPost,
  dateLabel,
  feeFromBase,
  formatNaira,
  isSuccessfulPaymentRecord,
  isPartiallyPaidStatus,
  extractPaymentAmountNaira
} from '../../lib/billing';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { MetricGridSkeleton, TableSkeleton } from '../../components/ui/Skeleton';
import { FintechTransactionHistory } from '../../components/portal/FintechTransactionHistory';
import { FintechWalletCard } from '../../components/portal/FintechWalletCard';
import { FintechWithdrawalModal } from '../../components/portal/FintechWithdrawalModal';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, getDoc, doc, query, where, limit } from 'firebase/firestore';
import { getEffectiveAuth, isMasqueradingActive } from '../../utils/impersonation';
import { resolveParentLinkedChildren } from '../../lib/academicSyncEngine';

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

  // Parent hierarchical progressive payment states
  const [selectedFeeItemIds, setSelectedFeeItemIds] = useState<string[]>([]);
  const [expandedChildIds, setExpandedChildIds] = useState<string[]>([]);
  const [parentFeeFilter, setParentFeeFilter] = useState<'all' | 'due' | 'paid'>('all');
  const [showParentCheckoutModal, setShowParentCheckoutModal] = useState(false);

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
  };

  const load = async () => { 
    setLoading(true); 
    try { 
      // Strictly prevent passing schoolParam when role is parent or student
      const rawSchoolParam = sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || localStorage.getItem('jaystar_cached_school_id') || '';
      const schoolParam = (role === 'school' || role === 'staff') ? rawSchoolParam : '';
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
          const paymentQueries: Promise<any>[] = [
            getDocs(query(collection(db, 'payments'), where('userId', '==', currentUser.uid)))
          ];
          if (role === 'school' && (schoolParam || result.schoolInfo?.id)) {
            paymentQueries.push(getDocs(query(collection(db, 'payments'), where('schoolId', '==', schoolParam || result.schoolInfo?.id))));
          }
          if (role === 'parent') {
            paymentQueries.push(getDocs(query(collection(db, 'payments'), where('parentId', '==', currentUser.uid))));
          }
          if (currentUser.email) {
            paymentQueries.push(getDocs(query(collection(db, 'payments'), where('email', '==', currentUser.email))));
          }
          const snaps = await Promise.all(paymentQueries);
          const map = new Map<string, any>();
          snaps.forEach(snap => {
            if (!snap) return;
            snap.docs.forEach((d: any) => {
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

      // STRICT DATA ISOLATION FOR PARENT ROLE
      // Strictly resolve parent-child relationships and completely filter out any unrelated students
      if (role === 'parent' && currentUser) {
        const pEmail = (currentUser.email || '').toLowerCase().trim();
        const pUid = currentUser.uid;
        try {
          const linkedLearners = await resolveParentLinkedChildren(pUid, pEmail || undefined);
          const verifiedIdSet = new Set<string>();
          linkedLearners.forEach(l => {
            verifiedIdSet.add(l.id);
            l.allIds.forEach(id => verifiedIdSet.add(id));
          });

          // Strictly filter students from server response
          const sanitizedStudents = (result.students || []).filter((s: any) => {
            const matchesParentId = s.parentId === pUid || s.parentUid === pUid;
            const matchesParentEmail = pEmail && String(s.parentEmail || '').toLowerCase().trim() === pEmail;
            const matchesVerifiedId = verifiedIdSet.has(s.id);
            return matchesParentId || matchesParentEmail || matchesVerifiedId;
          });

          // Add any linked learners missing from result.students
          const existingIds = new Set(sanitizedStudents.map((s: any) => s.id));
          linkedLearners.forEach(learner => {
            if (!existingIds.has(learner.id)) {
              sanitizedStudents.push({
                id: learner.id,
                fullName: learner.fullName,
                studentName: learner.fullName,
                username: learner.username,
                class: learner.className,
                programName: learner.programName,
                track: learner.programName,
                subjects: learner.subjects,
                tutorId: learner.tutorId,
                tutorName: learner.tutorName,
                parentId: pUid,
                parentEmail: pEmail
              });
              existingIds.add(learner.id);
            }
          });

          result.students = sanitizedStudents;
          const allowedStudentIds = new Set(sanitizedStudents.map((s: any) => s.id));

          // Strictly filter payments to only this parent and their linked children
          mergedPayments = mergedPayments.filter((p: any) => {
            const isUser = p.userId === pUid || p.parentId === pUid;
            const isEmail = pEmail && (String(p.email || '').toLowerCase() === pEmail || String(p.payerEmail || '').toLowerCase() === pEmail);
            const isChild = p.studentId && allowedStudentIds.has(p.studentId);
            return isUser || isEmail || isChild;
          });

          // Filter fee items if returned from backend
          if (Array.isArray(result.feeItems)) {
            result.feeItems = result.feeItems.filter((fi: any) => allowedStudentIds.has(fi.childId));
          }

          // Expand all children cards by default
          setExpandedChildIds(sanitizedStudents.map((s: any) => s.id));
        } catch (cErr) {
          console.warn('Parent verified children sync notice:', cErr);
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

  // All user transactions sorted chronologically (preserving pending/failed/partial statuses for history filtering)
  const allTransactions = useMemo(() => {
    return [...(data.payments || [])].sort(
      (a: PaymentRecord, b: PaymentRecord) =>
        new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime()
    );
  }, [data.payments]);

  // Verified Successful Payments only (missing or unknown status is never treated as paid)
  const payments = useMemo(() => {
    return allTransactions.filter((p: PaymentRecord) => isSuccessfulPaymentRecord(p));
  }, [allTransactions]);

  const dueDate = dueDateFor(payments[0]);

  // -------------------------------------------------------------
  // PARENT HIERARCHICAL BILLING LOGIC & DATA DERIVATION
  // -------------------------------------------------------------
  const parentFeeItems = useMemo<any[]>(() => {
    if (role !== 'parent') return [];
    if (Array.isArray(data.feeItems) && data.feeItems.length > 0) {
      const validStudentIds = new Set((data.students || []).map((s: any) => s.id));
      return data.feeItems.filter((fi: any) => validStudentIds.has(fi.childId));
    }
    const items: any[] = [];
    const nowMs = Date.now();
    const fourWeeksMs = 28 * 24 * 60 * 60 * 1000;
    (data.students || []).forEach((child: any) => {
      const childName = child.fullName || child.studentName || child.name || 'Student';
      const childPlan = child.plan || child.track || child.programName || 'Academy Track';
      const childFee = Number(child.tuitionFee ?? child.fee ?? child.amount ?? 0);
      const childBillingStatus = String(child.billingStatus || '').toUpperCase();
      const childRemainingBalance = Number(child.remainingBalance || 0);
      const tutorId = String(child.tutorId || child.staffId || child.assignedTutorId || child.assignedStaffId || 'unassigned');
      const tutorName = String(child.tutorName || child.assignedTutorName || child.mentorName || 'Unassigned Tutor');

      const hasRecentPaid = (progId?: string, progName?: string) =>
        (payments || []).some((p: any) => {
          if (!isSuccessfulPaymentRecord(p) || isPartiallyPaidStatus(p.status ?? p.paymentStatus)) return false;
          const matchChild = p.studentId === child.id;
          const isRecent = nowMs - new Date(p.paidAt || p.createdAt || 0).getTime() < fourWeeksMs;
          if (!matchChild || !isRecent) return false;
          if (Array.isArray(p.selectedItems) && p.selectedItems.length > 0 && (progId || progName)) {
            return p.selectedItems.some(
              (si: any) =>
                si.childId === child.id &&
                (si.programId === progId ||
                  String(si.programName || '').toLowerCase() === String(progName || '').toLowerCase())
            );
          }
          return true;
        });

      const resolveItemStatus = (progId?: string, progName?: string): 'PAID' | 'PARTIALLY_PAID' | 'DUE' => {
        if (childBillingStatus === 'PAID' || hasRecentPaid(progId, progName)) return 'PAID';
        if (childBillingStatus === 'PARTIALLY_PAID' && childRemainingBalance > 0) return 'PARTIALLY_PAID';
        return 'DUE';
      };

      if (Array.isArray(child.enrolledPrograms) && child.enrolledPrograms.length > 0) {
        child.enrolledPrograms.forEach((ep: any, idx: number) => {
          const progId = String(ep.id || ep.programId || `prog_${idx}`);
          const progName = String(ep.name || ep.programName || ep.title || childPlan);
          const progAmt = Number(
            ep.fee ?? ep.amount ?? ep.tuitionFee ?? (childFee > 0 ? Math.round(childFee / child.enrolledPrograms.length) : 0)
          );
          const progTutorId = String(ep.tutorId || tutorId);
          const progTutorName = String(ep.tutorName || tutorName);
          const itemStatus = resolveItemStatus(progId, progName);
          items.push({
            id: `${child.id}::${progTutorId}::${progId}`,
            childId: child.id,
            childName,
            childUsername: child.username,
            childClass: child.class || child.grade || 'Standard Track',
            tutorId: progTutorId,
            tutorName: progTutorName,
            programId: progId,
            programName: progName,
            amount: itemStatus === 'PARTIALLY_PAID' && childRemainingBalance > 0 ? childRemainingBalance : Math.max(0, progAmt),
            contractAmount: Math.max(0, progAmt),
            status: itemStatus,
            cycle: 'monthly'
          });
        });
      } else if (Array.isArray(child.subjects) && child.subjects.length > 1) {
        const perSubj = childFee > 0 ? Math.round(childFee / child.subjects.length) : 0;
        child.subjects.forEach((subj: string, idx: number) => {
          const progId = `subj_${idx}_${subj.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const itemStatus = resolveItemStatus(progId, subj);
          items.push({
            id: `${child.id}::${tutorId}::${progId}`,
            childId: child.id,
            childName,
            childUsername: child.username,
            childClass: child.class || child.grade || 'Standard Track',
            tutorId,
            tutorName,
            programId: progId,
            programName: subj,
            amount: Math.max(0, perSubj),
            contractAmount: Math.max(0, perSubj),
            status: itemStatus,
            cycle: 'monthly'
          });
        });
      } else {
        const itemStatus = resolveItemStatus('core_program', childPlan);
        const effectiveAmt =
          itemStatus === 'PARTIALLY_PAID' && childRemainingBalance > 0 ? childRemainingBalance : Math.max(0, childFee);
        items.push({
          id: `${child.id}::${tutorId}::core_program`,
          childId: child.id,
          childName,
          childUsername: child.username,
          childClass: child.class || child.grade || 'Standard Track',
          tutorId,
          tutorName,
          programId: 'core_program',
          programName: childPlan,
          amount: effectiveAmt,
          contractAmount: Math.max(0, childFee),
          status: itemStatus,
          cycle: 'monthly'
        });
      }
    });
    return items;
  }, [role, data.feeItems, data.students, payments]);

  // Hierarchical grouping: Child -> Tutor -> Programs
  const childGroups = useMemo(() => {
    const map = new Map<string, {
      childId: string;
      childName: string;
      childUsername?: string;
      childClass?: string;
      tutors: Map<string, { tutorId: string; tutorName: string; programs: any[] }>;
    }>();

    parentFeeItems.forEach(item => {
      if (!map.has(item.childId)) {
        map.set(item.childId, {
          childId: item.childId,
          childName: item.childName,
          childUsername: item.childUsername,
          childClass: item.childClass,
          tutors: new Map()
        });
      }
      const cEntry = map.get(item.childId)!;
      if (!cEntry.tutors.has(item.tutorId)) {
        cEntry.tutors.set(item.tutorId, {
          tutorId: item.tutorId,
          tutorName: item.tutorName,
          programs: []
        });
      }
      cEntry.tutors.get(item.tutorId)!.programs.push(item);
    });

    return Array.from(map.values()).map(c => {
      const tutors = Array.from(c.tutors.values()).map(t => ({
        tutorId: t.tutorId,
        tutorName: t.tutorName,
        programs: t.programs,
        totalAmount: t.programs.reduce((acc, p) => acc + p.amount, 0),
        dueAmount: t.programs.filter(p => p.status === 'DUE' || p.status === 'PARTIALLY_PAID').reduce((acc, p) => acc + p.amount, 0)
      }));
      const allPrograms = tutors.flatMap(t => t.programs);
      return {
        childId: c.childId,
        childName: c.childName,
        childUsername: c.childUsername,
        childClass: c.childClass,
        tutors,
        allPrograms,
        totalTuition: allPrograms.reduce((acc, p) => acc + p.amount, 0),
        totalDue: allPrograms.filter(p => p.status === 'DUE' || p.status === 'PARTIALLY_PAID').reduce((acc, p) => acc + p.amount, 0),
        allPaid: allPrograms.every(p => p.status === 'PAID')
      };
    });
  }, [parentFeeItems]);

  const selectedItems = useMemo(() => {
    return parentFeeItems.filter(item => selectedFeeItemIds.includes(item.id));
  }, [parentFeeItems, selectedFeeItemIds]);

  const selectedBaseTotal = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + item.amount, 0);
  }, [selectedItems]);

  const selectedChargePreview = useMemo(() => {
    return feeFromBase(selectedBaseTotal, feePolicy);
  }, [selectedBaseTotal, feePolicy]);

  const toggleProgram = (progId: string) => {
    setSelectedFeeItemIds(prev => 
      prev.includes(progId) ? prev.filter(id => id !== progId) : [...prev, progId]
    );
  };

  const toggleTutor = (programs: any[]) => {
    const progIds = programs.map(p => p.id);
    const allSelected = progIds.every(id => selectedFeeItemIds.includes(id));
    if (allSelected) {
      setSelectedFeeItemIds(prev => prev.filter(id => !progIds.includes(id)));
    } else {
      setSelectedFeeItemIds(prev => Array.from(new Set([...prev, ...progIds])));
    }
  };

  const toggleChild = (programs: any[]) => {
    const progIds = programs.map(p => p.id);
    const allSelected = progIds.every(id => selectedFeeItemIds.includes(id));
    if (allSelected) {
      setSelectedFeeItemIds(prev => prev.filter(id => !progIds.includes(id)));
    } else {
      setSelectedFeeItemIds(prev => Array.from(new Set([...prev, ...progIds])));
    }
  };

  const selectAllDue = () => {
    const dueIds = parentFeeItems.filter(i => i.status === 'DUE' || i.status === 'PARTIALLY_PAID').map(i => i.id);
    setSelectedFeeItemIds(dueIds);
  };

  const selectAllPrograms = () => {
    setSelectedFeeItemIds(parentFeeItems.map(i => i.id));
  };

  const clearSelection = () => {
    setSelectedFeeItemIds([]);
  };

  const toggleExpandChild = (childId: string) => {
    setExpandedChildIds(prev => 
      prev.includes(childId) ? prev.filter(id => id !== childId) : [...prev, childId]
    );
  };

  const processParentMultiPayment = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (isMasqueradingActive()) {
      toast.error('Payment authorization is disabled in Superadmin Impersonation Mode.');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Please select at least one program or tuition item to pay.');
      return;
    }
    setPaying(true);
    try {
      const payload = {
        role: 'parent',
        paymentMethod,
        teachingMode: teachingMode || 'Multi-Program Curriculum Delivery',
        selectedItems: selectedItems.map(i => ({
          id: i.id,
          childId: i.childId,
          childName: i.childName,
          tutorId: i.tutorId,
          tutorName: i.tutorName,
          programId: i.programId,
          programName: i.programName,
          amount: i.amount
        })),
        amount: selectedBaseTotal,
        planName: `Tuition Settlement: ${new Set(selectedItems.map(i => i.childName)).size} Learners (${selectedItems.length} Programs)`
      };

      const result = await billingPost<any>('paystack-initialize', payload);
      if (result?.authorizationUrl) {
        if (result.authorizationUrl.startsWith('http://') || result.authorizationUrl.startsWith('https://')) {
          window.location.assign(result.authorizationUrl);
        } else {
          window.location.href = result.authorizationUrl;
        }
      } else {
        throw new Error('Paystack checkout URL was not returned by the payment server.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to initialize checkout.');
    } finally {
      setPaying(false);
    }
  };

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
        throw new Error('Paystack checkout URL was not returned by the payment server.');
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

      {/* Parent Hierarchical Progressive Payment & Student Plan Section */}
      {role === 'parent' ? (
        <div className="space-y-6">
          {/* Section Header & Bulk Action Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center">
                    <UserCheck size={18} />
                  </span>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">
                    Parent Tuition &amp; Flexible Billing ({childGroups.length} {childGroups.length === 1 ? 'Learner' : 'Learners'})
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
                  Select and pay tuition at any level: individual program tracks, specific instructors, or settle all child tuition accounts simultaneously.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                <button
                  type="button"
                  onClick={selectAllDue}
                  className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 dark:text-amber-200 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock size={13} />
                  <span>Select All Due</span>
                </button>

                <button
                  type="button"
                  onClick={selectAllPrograms}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckSquare size={13} />
                  <span>Select All</span>
                </button>

                {selectedFeeItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <X size={13} />
                    <span>Clear ({selectedFeeItemIds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (expandedChildIds.length === childGroups.length) {
                      setExpandedChildIds([]);
                    } else {
                      setExpandedChildIds(childGroups.map(c => c.childId));
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <Layers size={13} />
                  <span>{expandedChildIds.length === childGroups.length ? 'Collapse All' : 'Expand All'}</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => setParentFeeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    parentFeeFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All Items ({parentFeeItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setParentFeeFilter('due')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    parentFeeFilter === 'due'
                      ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
                  }`}
                >
                  Payment Due ({parentFeeItems.filter(i => i.status === 'DUE').length})
                </button>
                <button
                  type="button"
                  onClick={() => setParentFeeFilter('paid')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    parentFeeFilter === 'paid'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
                  }`}
                >
                  Paid &amp; Active ({parentFeeItems.filter(i => i.status === 'PAID').length})
                </button>
              </div>

              {selectedItems.length > 0 && (
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">{selectedItems.length}</span> program{selectedItems.length > 1 ? 's' : ''} selected across <span className="font-bold text-slate-900 dark:text-white">{new Set(selectedItems.map(i => i.childName)).size}</span> child(ren):
                  <strong className="font-mono font-black text-brand-red">{formatNaira(selectedBaseTotal)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* LEVEL 1: Child Cards & Hierarchy */}
          {childGroups.length > 0 ? (
            <div className="space-y-4">
              {childGroups.map(child => {
                const isExpanded = expandedChildIds.includes(child.childId);
                const filteredPrograms = child.allPrograms.filter(prog => {
                  if (parentFeeFilter === 'due') return prog.status === 'DUE';
                  if (parentFeeFilter === 'paid') return prog.status === 'PAID';
                  return true;
                });

                if (filteredPrograms.length === 0 && parentFeeFilter !== 'all') {
                  return null;
                }

                const childProgIds = filteredPrograms.map(p => p.id);
                const allSelected = childProgIds.length > 0 && childProgIds.every(id => selectedFeeItemIds.includes(id));
                const someSelected = childProgIds.some(id => selectedFeeItemIds.includes(id)) && !allSelected;

                return (
                  <div 
                    key={child.childId} 
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    {/* LEVEL 1: Child Header */}
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Child Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleChild(filteredPrograms)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-red transition-colors shrink-0 cursor-pointer"
                          title={allSelected ? "Deselect child's programs" : "Select all child's programs"}
                          aria-label={`Toggle all programs for ${child.childName}`}
                        >
                          {allSelected ? (
                            <CheckSquare size={20} className="text-brand-red" />
                          ) : someSelected ? (
                            <MinusSquare size={20} className="text-brand-red" />
                          ) : (
                            <Square size={20} className="text-slate-400 dark:text-slate-500" />
                          )}
                        </button>

                        {/* Child Avatar */}
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-red to-red-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                          {child.childName.charAt(0).toUpperCase()}
                        </div>

                        {/* Child Identity */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                              {child.childName}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {child.childClass || 'Standard Cohort'}
                            </span>
                            {child.allPaid ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 inline-flex items-center gap-1">
                                <CheckCircle2 size={11} /> All Paid
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 inline-flex items-center gap-1">
                                <Clock size={11} /> {formatNaira(child.totalDue)} Due
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            @{child.childUsername || 'student'} • {child.allPrograms.length} active learning track{child.allPrograms.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Right side: Amount & Expand button */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Tuition Fee</span>
                          <strong className="text-sm font-mono font-black text-slate-900 dark:text-white">
                            {formatNaira(child.totalTuition)}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExpandChild(child.childId)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Hide Details' : 'View Tutors & Programs'}</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* EXPANDABLE SECTION: Level 2 (Tutors) & Level 3 (Programs) */}
                    {isExpanded && (
                      <div className="p-4 sm:p-6 space-y-5 bg-white dark:bg-slate-900">
                        {child.tutors.map(tutor => {
                          const tutorFilteredPrograms = tutor.programs.filter(prog => {
                            if (parentFeeFilter === 'due') return prog.status === 'DUE';
                            if (parentFeeFilter === 'paid') return prog.status === 'PAID';
                            return true;
                          });

                          if (tutorFilteredPrograms.length === 0 && parentFeeFilter !== 'all') {
                            return null;
                          }

                          const tutorProgIds = tutorFilteredPrograms.map(p => p.id);
                          const tutorAllSelected = tutorProgIds.length > 0 && tutorProgIds.every(id => selectedFeeItemIds.includes(id));
                          const tutorSomeSelected = tutorProgIds.some(id => selectedFeeItemIds.includes(id)) && !tutorAllSelected;

                          return (
                            <div 
                              key={tutor.tutorId} 
                              className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/20 p-4"
                            >
                              {/* LEVEL 2: Tutor Group Header */}
                              <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200/60 dark:border-slate-800">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => toggleTutor(tutorFilteredPrograms)}
                                    className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-red transition-colors shrink-0 cursor-pointer"
                                    title={tutorAllSelected ? "Deselect tutor's programs" : "Select all programs under this tutor"}
                                  >
                                    {tutorAllSelected ? (
                                      <CheckSquare size={17} className="text-brand-red" />
                                    ) : tutorSomeSelected ? (
                                      <MinusSquare size={17} className="text-brand-red" />
                                    ) : (
                                      <Square size={17} className="text-slate-400 dark:text-slate-500" />
                                    )}
                                  </button>

                                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                                    <User size={14} />
                                  </div>

                                  <div className="min-w-0">
                                    <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 truncate">
                                      Instructor: {tutor.tutorName}
                                    </h4>
                                    <span className="text-[11px] text-slate-500">
                                      {tutorFilteredPrograms.length} assigned program track{tutorFilteredPrograms.length > 1 ? 's' : ''}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Tutor Subtotal</span>
                                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                                    {formatNaira(tutor.totalAmount)}
                                  </span>
                                </div>
                              </div>

                              {/* LEVEL 3: Programs under this Tutor */}
                              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                                {tutorFilteredPrograms.map(prog => {
                                  const isSelected = selectedFeeItemIds.includes(prog.id);
                                  const isPaid = prog.status === 'PAID';

                                  return (
                                    <div
                                      key={prog.id}
                                      onClick={() => toggleProgram(prog.id)}
                                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                                        isSelected
                                          ? 'border-brand-red bg-red-50/40 dark:bg-red-950/20 shadow-xs'
                                          : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-brand-red shrink-0">
                                              {isSelected ? <CheckSquare size={16} /> : <Square size={16} className="text-slate-400" />}
                                            </span>
                                            <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                              {prog.programName}
                                            </h5>
                                          </div>
                                          {isPaid ? (
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shrink-0">
                                              Settled
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 shrink-0">
                                              Due
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                          {prog.cycle || 'Monthly'} cycle • Mentor support included
                                        </p>
                                      </div>

                                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                                        <span className="text-slate-400 text-[10px] uppercase font-bold">Payable</span>
                                        <strong className="font-mono font-black text-brand-red">
                                          {formatNaira(prog.amount)}
                                        </strong>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2 shadow-xs">
              <CreditCard size={32} className="mx-auto text-slate-400" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">No active tuition accounts found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Once your child's enrollment is registered and approved by the academy admissions desk, customized tuition and learning schedules will appear here.
              </p>
            </div>
          )}

          {/* Pending Enrollment Requests for Parents */}
          {data.enrollments && data.enrollments.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Pending Enrollment Requests ({data.enrollments.length})
                  </h3>
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
                      className="px-4 py-2 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold transition-all shrink-0 cursor-pointer"
                    >
                      Pay for {req.studentName ? req.studentName.split(' ')[0] : 'Child'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 4: STICKY FLOATING PAYMENT CHECKOUT DRAWER */}
          {selectedItems.length > 0 && (
            <div className="sticky bottom-4 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-2 border-brand-red/40 rounded-3xl p-4 sm:p-5 shadow-2xl transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-brand-red text-white">
                      {selectedItems.length} {selectedItems.length === 1 ? 'Program' : 'Programs'} Selected
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      across {new Set(selectedItems.map(i => i.childName)).size} {new Set(selectedItems.map(i => i.childName)).size === 1 ? 'Child' : 'Children'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate max-w-xl">
                    {selectedItems.map(i => `${i.childName} (${i.programName})`).join(' • ')}
                  </p>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Selected Total
                    </span>
                    <strong className="text-lg font-mono font-black text-brand-red">
                      {formatNaira(selectedBaseTotal)}
                    </strong>
                  </div>

                  <button
                    type="button"
                    disabled={isMasqueradingActive() || paying}
                    onClick={() => setShowParentCheckoutModal(true)}
                    className="min-h-12 px-6 rounded-2xl bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white font-black text-xs md:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={16} />
                    <span>Review &amp; Pay ({formatNaira(selectedBaseTotal)})</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PARENT ITEMIZED CHECKOUT MODAL */}
          {showParentCheckoutModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
              <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-brand-red">Direct Paystack Settlement</p>
                    <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Review Selected Tuition Items</h3>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowParentCheckoutModal(false)} 
                    className="min-h-9 min-w-9 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  {/* Itemized Table */}
                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Learner</th>
                          <th className="p-3">Program &amp; Instructor</th>
                          <th className="p-3 text-right">Fee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedItems.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="p-3 font-bold text-slate-900 dark:text-white">
                              {item.childName}
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-300">
                              <span className="font-semibold">{item.programName}</span>
                              <span className="block text-[11px] text-slate-400">Mentor: {item.tutorName}</span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                              {formatNaira(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>Base Tuition Subtotal:</span>
                      <strong className="font-mono text-slate-900 dark:text-white">{formatNaira(selectedBaseTotal)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>Est. Paystack Processing Fee:</span>
                      <strong className="font-mono text-slate-900 dark:text-white">{formatNaira(selectedChargePreview.transactionFee)}</strong>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm">
                      <span className="font-black text-slate-900 dark:text-white">Grand Total Payable:</span>
                      <strong className="font-mono font-black text-brand-red text-base">{formatNaira(selectedChargePreview.totalAmount)}</strong>
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Payment Method</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['card', 'bank_transfer', 'opay'] as PaymentMethod[]).map(method => (
                        <button 
                          key={method} 
                          type="button" 
                          onClick={() => setPaymentMethod(method)} 
                          className={`min-h-14 rounded-xl border p-2 text-xs font-bold transition-all cursor-pointer ${
                            paymentMethod === method 
                              ? 'border-brand-red bg-red-50 text-brand-red dark:bg-red-950/20' 
                              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                          }`}
                        >
                          {method === 'card' ? <CreditCard className="mx-auto mb-1" size={16} /> : method === 'bank_transfer' ? <Building2 className="mx-auto mb-1" size={16} /> : <Smartphone className="mx-auto mb-1" size={16} />}
                          {methodLabel(method)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Checkout Button */}
                  <button 
                    disabled={paying || isMasqueradingActive()} 
                    type="button" 
                    onClick={() => void processParentMultiPayment()}
                    className="min-h-12 w-full rounded-2xl bg-brand-red hover:bg-red-700 disabled:opacity-50 px-5 text-xs md:text-sm font-black text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {paying ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        <span>Initializing Paystack Checkout...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={18} />
                        <span>Pay {formatNaira(selectedChargePreview.totalAmount)} with {methodLabel(paymentMethod)}</span>
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-center text-slate-400">
                    Secured by 256-bit encryption. Payment will update only the exact selected program records.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : role === 'student' ? (
        /* Independent Student View */
        <div className="space-y-6">
          {standardPlans.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="mb-5">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  Available Learning Programs
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Select your enrolled curriculum track to proceed with tuition settlement.
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
                              <h4 className="font-black text-slate-900 dark:text-white text-base">{plan.name}</h4>
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
          )}
        </div>
      ) : null}

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
                <FintechTransactionHistory transactions={allTransactions.map(p => ({ ...p, amount: extractPaymentAmountNaira(p) }))} title="Teaching Payouts & Settlement History" role="staff" emptyMessage="No teaching payout transactions are recorded yet." />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment History for Student and Parent */}
      {role !== 'staff' && (
        <div id="fintech-tx-history" className="mt-8">
          <FintechTransactionHistory 
            transactions={allTransactions.map(p => ({ ...p, amount: extractPaymentAmountNaira(p) }))} 
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
