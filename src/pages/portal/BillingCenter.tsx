import React, { useEffect, useMemo, useState } from 'react';
import { 
  Banknote, CheckCircle2, CreditCard, Download, 
  Loader2, RefreshCw, ShieldCheck, Wallet, X, 
  Building2, BookOpen, 
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
import { triggerEntitlementRefresh } from '../../contexts/SubscriptionEntitlementContext';
import SEO from '../../components/ui/SEO';
import { MetricGridSkeleton, TableSkeleton } from '../../components/ui/Skeleton';
import { FintechTransactionHistory } from '../../components/portal/FintechTransactionHistory';
import { FintechWalletCard } from '../../components/portal/FintechWalletCard';
import { FintechWithdrawalModal } from '../../components/portal/FintechWithdrawalModal';
import { PaystackPaymentReviewModal } from '../../components/portal/PaystackPaymentReviewModal';
import {
  BillingEditorialShell,
  type BillingSubTab,
  type BillingFeeLineSummary,
} from '../../components/portal/BillingEditorialShell';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, getDoc, doc, query, where, limit } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { getEffectiveAuth, isMasqueradingActive } from '../../utils/impersonation';
import { resolveParentLinkedChildren } from '../../lib/academicSyncEngine';
import {
  fetchStudentProgrammeEnrollments,
  type ProgrammeEnrollmentRecord,
} from '../../lib/programmeEnrollments';

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
const dueDateFor = (payment?: PaymentRecord) => { 
  if (!payment?.paidAt) return null; 
  const date = new Date(payment.paidAt); 
  date.setDate(date.getDate() + Number(payment.durationWeeks || 4) * 7); 
  return date; 
};

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
  const [showCheckout, setShowCheckout] = useState(false); 
  const [paying, setPaying] = useState(false);

  // Parent hierarchical progressive payment states
  const [selectedFeeItemIds, setSelectedFeeItemIds] = useState<string[]>([]);
  const [expandedChildIds, setExpandedChildIds] = useState<string[]>([]);
  const [parentFeeFilter, setParentFeeFilter] = useState<'all' | 'due' | 'paid'>('all');
  const [showParentCheckoutModal, setShowParentCheckoutModal] = useState(false);

  const [searchParams] = useSearchParams();
  const focusEnrollmentId = searchParams.get('enrollmentId') || '';
  const [billingSubTab, setBillingSubTab] = useState<BillingSubTab>(() =>
    focusEnrollmentId ? 'structure' : 'overview'
  );

  // Self-funded student programme enrollment checkout states
  const [programmeEnrollments, setProgrammeEnrollments] = useState<ProgrammeEnrollmentRecord[]>([]);
  const [activeProgEnrollment, setActiveProgEnrollment] = useState<ProgrammeEnrollmentRecord | null>(null);
  const [progPaymentOption, setProgPaymentOption] = useState<'full' | 'deposit' | 'balance' | 'renewal'>('full');
  const [studentPayerEmail, setStudentPayerEmail] = useState<string>('');
  const [expandedProgHistoryIds, setExpandedProgHistoryIds] = useState<Record<string, boolean>>({});

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

      if (role === 'student') {
        const uid = currentUser?.uid || sessionStorage.getItem('userId') || '';
        const serverEnrollments = Array.isArray(result.programmeEnrollments)
          ? (result.programmeEnrollments as ProgrammeEnrollmentRecord[])
          : [];
        if (serverEnrollments.length > 0) {
          setProgrammeEnrollments(serverEnrollments);
        } else if (uid) {
          const directEnrollments = await fetchStudentProgrammeEnrollments(uid).catch(() => []);
          setProgrammeEnrollments(directEnrollments);
          if (directEnrollments.some((e) => e.billingResponsibility === 'STUDENT_SELF_FUNDED')) {
            if (!sessionStorage.getItem('parentId') && !sessionStorage.getItem('studentParentId')) {
              result.isExempt = false;
            }
          }
        }
        const defaultEmail = String(currentUser?.email || '').trim();
        if (
          defaultEmail &&
          defaultEmail.includes('@') &&
          !defaultEmail.endsWith('.local') &&
          !defaultEmail.endsWith('.invalid')
        ) {
          setStudentPayerEmail((prev) => prev || defaultEmail);
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
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref'); 
    if (!reference) return; 
    billingPost<any>('paystack-verify', { reference }).then(() => { 
      toast.success('Payment verified successfully. Portal access has been refreshed.'); 
      triggerEntitlementRefresh();
      const keepEnrollment = params.get('enrollmentId');
      const cleanUrl = keepEnrollment
        ? `${window.location.pathname}?enrollmentId=${encodeURIComponent(keepEnrollment)}`
        : window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl); 
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
  const schoolPrograms = useMemo(
    () => (Array.isArray(data.schoolPrograms) ? data.schoolPrograms : Array.isArray(data.schoolInfo?.programs) ? data.schoolInfo.programs : []),
    [data.schoolPrograms, data.schoolInfo?.programs]
  );
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

  const processParentMultiPayment = async () => {
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
        paymentPolicyAccepted: true,
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
    setShowCheckout(true);
  };

  const processPayment = async () => { 
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
        paymentPolicyAccepted: true,
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

  const openProgrammeEnrollmentCheckout = (
    enrollment: ProgrammeEnrollmentRecord,
    defaultOpt: 'full' | 'deposit' | 'balance' | 'renewal'
  ) => {
    if (isMasqueradingActive()) {
      toast.error('Payment checkout is disabled in Superadmin Impersonation Mode.');
      return;
    }
    setActiveProgEnrollment(enrollment);
    setProgPaymentOption(defaultOpt);
    if (!studentPayerEmail && enrollment.studentEmail && !enrollment.studentEmail.endsWith('.local')) {
      setStudentPayerEmail(enrollment.studentEmail);
    }
  };

  const processProgrammeEnrollmentPayment = async () => {
    if (!activeProgEnrollment) return;
    if (isMasqueradingActive()) {
      toast.error('Payment authorization is disabled in Superadmin Impersonation Mode.');
      return;
    }
    const cleanEmail = studentPayerEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.endsWith('.local') || cleanEmail.endsWith('.invalid')) {
      toast.error('Please enter a valid personal email address to receive your Paystack receipt.');
      return;
    }
    setPaying(true);
    try {
      const result = await billingPost<any>('paystack-initialize', {
        role: 'student',
        programmeEnrollmentId: activeProgEnrollment.id,
        paymentOption: progPaymentOption,
        payerEmail: cleanEmail,
        paymentPolicyAccepted: true,
      });
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
      toast.error(error instanceof Error ? error.message : 'Unable to initialize programme checkout.');
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

        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="min-w-12 min-h-12 rounded-xl bg-slate-900 text-white dark:bg-slate-800 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-brand-red" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                No Individual Billing Required
              </h2>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed max-w-3xl">
                Your account is linked to <strong className="text-slate-900 dark:text-white font-black">{data.managerName || (data.managedBy === 'school' ? 'your partner school' : 'your parent / guardian')}</strong>. 
                All program subscriptions, learning resources, and hands-on lab sessions are centrally administered. 
                Enjoy your learning journey!
              </p>

              <div className="mt-6 flex flex-wrap gap-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Curriculum Access:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Active &amp; Unlimited
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">CBT &amp; Practical Exams:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
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
    const selectedModeLabel = selectedMode === 'advance_termly'
      ? 'Advance Termly'
      : selectedMode === 'advance_monthly'
      ? 'Advance Monthly'
      : selectedMode === 'post_termly'
      ? 'Post Termly'
      : 'Post Monthly';

    const schoolVerifiedPaid = payments.reduce((acc: number, p: PaymentRecord) => acc + extractPaymentAmountNaira(p), 0);
    const schoolBalanceDue =
      schoolBilling?.remainingBalance !== undefined && schoolBilling?.remainingBalance !== null
        ? Math.max(0, Number(schoolBilling.remainingBalance))
        : Math.max(0, baseTotalForPrograms - schoolVerifiedPaid);
    const schoolTotalFees = Math.max(baseTotalForPrograms, schoolVerifiedPaid + schoolBalanceDue);
    const schoolDueDateLabel = schoolBilling?.nextDueDate
      ? new Date(schoolBilling.nextDueDate).toLocaleDateString('en-NG', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : schoolBalanceDue > 0
      ? 'Payment Due'
      : 'Active Access';

    const schoolBanners = (
      <>
        {hasReminder && (
          <div className="p-5 rounded-2xl bg-red-50/70 dark:bg-red-950/20 border border-brand-red/30 flex items-start gap-3 text-xs text-slate-800 dark:text-slate-200">
            <Bell className="text-brand-red mt-0.5 flex-shrink-0" size={18} />
            <div>
              <strong className="font-black text-sm block text-brand-red">Payment Renewal Notice</strong>
              <span className="mt-1 block leading-relaxed">
                Your institutional subscription is scheduled for renewal.
                {schoolBilling?.nextDueDate && ` Scheduled Due Date: ${new Date(schoolBilling.nextDueDate).toLocaleDateString('en-NG', { dateStyle: 'long' })}.`}
              </span>
            </div>
          </div>
        )}
        {isMasqueradingActive() && (
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={18} className="text-brand-red shrink-0" />
              <div>
                <strong className="block font-black">Superadmin Impersonation Mode Active</strong>
                <span>Payment authorization and Paystack checkouts are disabled while impersonating. Invoices, ledger breakdowns, and payment history are available in read-only mode.</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-50 dark:bg-red-950/50 text-brand-red shrink-0 border border-brand-red/20">
              Payments Disabled
            </span>
          </div>
        )}
      </>
    );

    const schoolFeeSummaryItems: BillingFeeLineSummary[] = activeProgramsList.map((prog: any) => {
      const statusNorm = String(prog.status || 'ACTIVE').toUpperCase();
      return {
        id: prog.id,
        title: prog.name,
        subtitle: prog.details || prog.description || 'Institutional Curriculum Track',
        amount: Number(prog.fee || 0),
        durationLabel:
          (prog.billingFrequency || schoolCycle) === 'monthly' ? '4 Weeks' : '12 Weeks',
        statusLabel:
          schoolBalanceDue > 0
            ? 'Payment Due'
            : statusNorm === 'ACTIVE'
            ? 'Active'
            : statusNorm,
        statusTone: schoolBalanceDue > 0 ? 'due' : 'active',
      };
    });

    return (
      <section aria-label="School billing center">
        <SEO title="Billing & Fees | Jaystarbliss Studios" description="Institutional subscription and billing portal." noindex={true} />

        <BillingEditorialShell
          role="school"
          subtitle="View your institutional fee details, settle programme invoices, and download verified receipts in one place."
          sessionLabel={schoolCycle === 'monthly' ? '4 Weeks Cycle' : '12 Weeks Term'}
          totalFees={schoolTotalFees}
          amountPaid={schoolVerifiedPaid}
          balanceDue={schoolBalanceDue}
          payableNowAmount={schoolFee > 0 ? schoolFee : schoolBalanceDue}
          dueDateLabel={schoolDueDateLabel}
          activeTab={billingSubTab}
          onTabChange={setBillingSubTab}
          onRefresh={() => void load()}
          paymentDisabled={isMasqueradingActive()}
          feeSummaryItems={schoolFeeSummaryItems}
          onMakePayment={() => {
            if (hasConfiguredSubscription && schoolFee > 0 && !isMasqueradingActive()) {
              startCheckout();
            } else {
              setBillingSubTab('structure');
            }
          }}
          banners={schoolBanners}
          paymentHistorySlot={
            <FintechTransactionHistory
              transactions={allTransactions.map(p => ({ ...p, amount: extractPaymentAmountNaira(p) }))}
              title="Institutional Transactions & Receipts"
              role="school"
              emptyMessage="No transaction records on file"
            />
          }
          feeStructureSlot={
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column (8 cols): Structured Programme Fee Table + Schedule Controls */}
              <div className="lg:col-span-8 space-y-5">
                {/* Active Programmes Table / Selector */}
                <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white">
                        Institutional Fee Structure &amp; Active Tracks
                      </h2>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Select the curriculum tracks to include in your next Paystack invoice settlement.
                      </p>
                    </div>
                    <BookOpen className="text-[#B91C1C] shrink-0" size={18} />
                  </div>

                  {activeProgramsList.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-sm font-bold text-[#14284B] dark:text-white">
                        No Institutional Subscription Configured
                      </p>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
                        No custom fee schedule has been assigned to {data.schoolInfo?.name || 'this school'} yet. Please contact the administration desk.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                      {activeProgramsList.map((prog: any) => {
                        const isSelected = selectedProgramIds.length === 0 || selectedProgramIds.includes(prog.id);
                        return (
                          <div
                            key={prog.id}
                            onClick={() => {
                              if (selectedProgramIds.length === 0) {
                                setSelectedProgramIds(activeProgramsList.filter((p: any) => p.id !== prog.id).map((p: any) => p.id));
                              } else if (selectedProgramIds.includes(prog.id)) {
                                const next = selectedProgramIds.filter((id: string) => id !== prog.id);
                                setSelectedProgramIds(next.length ? next : activeProgramsList.map((p: any) => p.id));
                              } else {
                                setSelectedProgramIds([...selectedProgramIds, prog.id]);
                              }
                            }}
                            className={`px-4 sm:px-6 py-4 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-red-50/30 dark:bg-[#B91C1C]/10'
                                : 'hover:bg-slate-50 dark:hover:bg-zinc-900/50 opacity-65'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="mt-0.5 text-[#B91C1C] shrink-0">
                                {isSelected ? <CheckSquare size={17} /> : <Square size={17} className="text-slate-400 dark:text-zinc-500" />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <h3 className="font-bold text-xs sm:text-sm text-[#14284B] dark:text-white">
                                    {prog.name}
                                  </h3>
                                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                                    · {prog.details || 'Fixed Package'}
                                  </span>
                                </div>
                                {prog.description && (
                                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                                    {prog.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4 pl-7 sm:pl-0 shrink-0 tabular-nums">
                              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                                {(prog.billingFrequency || schoolCycle) === 'monthly' ? '4 Weeks' : '12 Weeks'}
                              </span>
                              <strong className="text-sm font-extrabold text-[#14284B] dark:text-white">
                                {formatNaira(prog.fee)}
                              </strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Settlement Configuration Card (Upfront Percentage & Billing Mode) */}
                {hasConfiguredSubscription && baseTotalForPrograms > 0 && (
                  <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-5">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white">
                        Settlement Schedule Options
                      </h3>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Choose your approved upfront percentage and billing cycle before proceeding to Paystack.
                      </p>
                    </div>

                    {/* Upfront Percentage */}
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        Upfront Payment Percentage
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          { pct: 100, label: '100% Full Payment', desc: 'Settle total invoice in full' },
                          { pct: 70, label: '70% Upfront', desc: '30% deferred balance' },
                          { pct: 50, label: '50% Half Termly', desc: '50% deferred balance' }
                        ].map(opt => (
                          <button
                            key={opt.pct}
                            type="button"
                            onClick={() => setPaymentPercentage(opt.pct)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              paymentPercentage === opt.pct
                                ? 'border-[#B91C1C] bg-red-50/50 dark:bg-[#B91C1C]/12 text-[#14284B] dark:text-white'
                                : 'border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-[#18181B] hover:border-slate-300 dark:hover:border-zinc-700 text-slate-600 dark:text-zinc-300'
                            }`}
                          >
                            <div className="text-xs font-bold">{opt.label}</div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {paymentPercentage < 100 && (
                      <div className="p-3.5 rounded-xl bg-red-50/60 dark:bg-[#B91C1C]/10 border border-[#B91C1C]/30 text-xs text-slate-700 dark:text-zinc-300">
                        <strong className="text-[#B91C1C] dark:text-red-400">
                          Upfront Installment ({paymentPercentage}%):
                        </strong>{' '}
                        Paying <strong>{formatNaira(schoolFee)}</strong> now leaves a scheduled balance of{' '}
                        <strong className="text-[#B91C1C] dark:text-red-400">{formatNaira(remainingBalance)}</strong>.
                      </div>
                    )}

                    {/* Billing Mode */}
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        Billing Mode
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[
                          { id: 'advance_termly', label: 'Advance Termly', desc: 'Upfront for the 12-week term.' },
                          { id: 'advance_monthly', label: 'Advance Monthly', desc: 'Upfront for 4 weeks of access.' },
                          { id: 'post_termly', label: 'Post Termly', desc: 'Settle invoice at end of term.' },
                          { id: 'post_monthly', label: 'Post Monthly', desc: 'Settle invoice at end of month.' }
                        ]
                          .filter(m => allowedSchoolModes.includes(m.id))
                          .map(modeOpt => (
                            <button
                              key={modeOpt.id}
                              type="button"
                              onClick={() => setSelectedMode(modeOpt.id)}
                              className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                selectedMode === modeOpt.id
                                  ? 'border-[#B91C1C] bg-red-50/50 dark:bg-[#B91C1C]/12 text-[#14284B] dark:text-white'
                                  : 'border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-[#18181B] hover:border-slate-300 dark:hover:border-zinc-700 text-slate-600 dark:text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold text-xs">
                                <span>{modeOpt.label}</span>
                                {selectedMode === modeOpt.id && <Check size={14} className="text-[#B91C1C]" />}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{modeOpt.desc}</p>
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column (4 cols): Invoice Checkout Summary + School Account Status */}
              <div className="lg:col-span-4 space-y-5">
                <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4">
                  <h3 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white">
                    Invoice Checkout Summary
                  </h3>

                  <div className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-zinc-400">Selected Tracks</span>
                      <span className="font-bold text-[#14284B] dark:text-white tabular-nums">
                        {selectedPrograms.length}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-zinc-400">Payable Subtotal ({paymentPercentage}%)</span>
                      <span className="font-bold text-[#14284B] dark:text-white tabular-nums">
                        {formatNaira(schoolFee)}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-zinc-400">Est. Gateway Fee</span>
                      <span className="font-semibold text-slate-700 dark:text-zinc-300 tabular-nums">
                        {formatNaira(chargePreview.transactionFee)}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2 text-sm">
                      <span className="font-bold text-[#14284B] dark:text-white">Est. Total</span>
                      <strong className="font-extrabold text-[#B91C1C] dark:text-red-400 tabular-nums">
                        {formatNaira(chargePreview.totalAmount)}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isMasqueradingActive() || !hasConfiguredSubscription || schoolFee <= 0}
                    onClick={() => startCheckout()}
                    className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all ${
                      isMasqueradingActive() || !hasConfiguredSubscription || schoolFee <= 0
                        ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#991B1B] to-[#B91C1C] hover:from-[#7F1D1D] hover:to-[#991B1B] text-white cursor-pointer'
                    }`}
                  >
                    <CreditCard size={16} />
                    <span className="tabular-nums">
                      {isMasqueradingActive()
                        ? 'Disabled in Impersonation'
                        : `Pay Now · ${formatNaira(schoolFee)}`}
                    </span>
                  </button>

                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center">
                    Opens Paystack Hosted Checkout (Card, Bank Transfer, USSD).
                  </p>
                </div>

                <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 text-xs">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Institutional Account
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    <div className="py-2 flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-zinc-400">Institution</span>
                      <span className="font-bold text-[#14284B] dark:text-white text-right truncate max-w-[180px]">
                        {data.schoolInfo?.name || 'Partner School'}
                      </span>
                    </div>
                    <div className="py-2 flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-zinc-400">Latest Payment</span>
                      <span className="font-bold text-[#14284B] dark:text-white tabular-nums">
                        {payments[0] ? formatNaira(extractPaymentAmountNaira(payments[0])) : '—'}
                      </span>
                    </div>
                    <div className="py-2 flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-zinc-400">Next Due Date</span>
                      <span className="font-bold text-[#B91C1C] dark:text-red-400">
                        {schoolDueDateLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        />

        {/* School Paystack Review Modal */}
        <PaystackPaymentReviewModal
          isOpen={showCheckout}
          onClose={() => { if (!paying) setShowCheckout(false); }}
          reviewKey={`school:${selectedPrograms.map((p: any) => p.id).join(',')}:${paymentPercentage}:${selectedMode}:${schoolFee}`}
          subtitle="Institutional Subscription Settlement"
          title="Review Your Payment"
          description="Please confirm the institutional subscription tracks and payment policy below before proceeding to Paystack."
          contextRows={[
            { label: 'School / Institution', value: data.schoolInfo?.name || 'Partner School' },
            { label: 'Billing Cycle', value: schoolCycle === 'monthly' ? 'Monthly (4 Weeks)' : 'Termly (12 Weeks)' },
            { label: 'Payment Schedule', value: selectedModeLabel },
            { label: 'Invoice Percentage', value: `${paymentPercentage}% of full contract fee` }
          ]}
          lineItems={selectedPrograms.map((p: any) => ({
            id: p.id,
            primary: p.name,
            secondary: p.details || 'Institutional Track',
            meta: p.description || undefined,
            amount: Number(p.fee || 0)
          }))}
          installment={paymentPercentage < 100 ? {
            fullAmount: baseTotalForPrograms,
            percentage: paymentPercentage,
            payingNow: schoolFee,
            remainingBalance
          } : null}
          subtotal={schoolFee}
          estimatedFee={chargePreview.transactionFee}
          estimatedTotal={chargePreview.totalAmount}
          feeNote={`Estimated Paystack processing fee is shown for transparency. Paystack confirms the final fee dynamically at checkout against the ${formatNaira(schoolFee)} subtotal.`}
          loading={paying}
          disabled={isMasqueradingActive()}
          disabledMessage="Checkout is disabled in Admin Impersonation mode."
          onConfirmPaystack={processPayment}
        />
      </section>
    );
  }

  // 3. DEFAULT/PARENT/STAFF/INDEPENDENT STUDENT BILLING VIEW
  const verifiedPaidSum = payments.reduce(
    (acc: number, p: PaymentRecord) => acc + extractPaymentAmountNaira(p),
    0
  );

  const parentTotalTuition = childGroups.reduce(
    (acc, c) => acc + Math.max(0, Number(c.totalTuition || 0)),
    0
  );
  const parentBalanceDue = childGroups.reduce(
    (acc, c) => acc + Math.max(0, Number(c.totalDue || 0)),
    0
  );
  const parentAmountPaid =
    parentTotalTuition > 0
      ? Math.max(0, parentTotalTuition - parentBalanceDue)
      : verifiedPaidSum;

  const studentApprovedTotal = programmeEnrollments.reduce(
    (acc, e) => acc + Math.max(0, Number(e.approvedFee || 0)),
    0
  );
  const studentPaidTotal =
    programmeEnrollments.length > 0
      ? programmeEnrollments.reduce((acc, e) => acc + Math.max(0, Number(e.amountPaid || 0)), 0)
      : verifiedPaidSum;
  const studentBalanceDue =
    programmeEnrollments.length > 0
      ? programmeEnrollments.reduce(
          (acc, e) =>
            acc +
            Math.max(
              0,
              Number(e.remainingBalance ?? Math.max(0, Number(e.approvedFee || 0) - Number(e.amountPaid || 0)))
            ),
          0
        )
      : Math.max(0, Number(standardPlans[0]?.baseAmount || 0) - verifiedPaidSum);

  const studentNextDueIso = programmeEnrollments.find((e) => e.nextDueDate)?.nextDueDate;
  const roleTotalFees =
    role === 'parent'
      ? Math.max(parentTotalTuition, parentAmountPaid + parentBalanceDue)
      : Math.max(studentApprovedTotal, studentPaidTotal + studentBalanceDue);
  const roleAmountPaid = role === 'parent' ? parentAmountPaid : studentPaidTotal;
  const roleBalanceDue = role === 'parent' ? parentBalanceDue : studentBalanceDue;
  const roleDueDateLabel =
    role === 'student' && studentNextDueIso
      ? dateLabel(studentNextDueIso)
      : dueDate
      ? dueDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
      : roleBalanceDue > 0
      ? 'Payment Due'
      : 'Active Access';

  const impersonationBanner = isMasqueradingActive() ? (
    <div className="p-4 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={18} className="text-brand-red shrink-0" />
        <div>
          <strong className="block font-black">Superadmin Impersonation Mode Active</strong>
          <span>Payment processing and withdrawal requests are disabled while impersonating. All ledger histories and account details are available in read-only mode.</span>
        </div>
      </div>
      <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-50 dark:bg-red-950/50 text-brand-red shrink-0 border border-brand-red/20">
        Payments Disabled
      </span>
    </div>
  ) : null;

  const handleEditorialMakePayment = () => {
    if (role === 'parent') {
      if (selectedItems.length > 0 && !isMasqueradingActive()) {
        setShowParentCheckoutModal(true);
      } else {
        selectAllDue();
        setBillingSubTab('structure');
      }
      return;
    }
    if (role === 'student') {
      const payableEnr = programmeEnrollments.find((enr) => {
        const st = String(enr.enrollmentStatus || '').toUpperCase();
        const fee = Number(enr.approvedFee || 0);
        const rem = Number(enr.remainingBalance ?? Math.max(0, fee - Number(enr.amountPaid || 0)));
        return fee > 0 && (st === 'APPROVED_AWAITING_PAYMENT' || st === 'APPROVED_PENDING_PAYMENT' || st === 'PARTIALLY_PAID' || st === 'RENEWAL_DUE' || rem > 0);
      });
      if (payableEnr && !isMasqueradingActive()) {
        const paid = Number(payableEnr.amountPaid || 0);
        const rem = Number(payableEnr.remainingBalance ?? Math.max(0, Number(payableEnr.approvedFee || 0) - paid));
        openProgrammeEnrollmentCheckout(payableEnr, paid > 0 && rem > 0 ? 'balance' : 'full');
      } else {
        setBillingSubTab('structure');
      }
    }
  };

  if (role === 'staff') {
    return (
      <section className="space-y-6" aria-label="Billing center">
        <SEO title="Billing Center | Jaystarbliss Studios" description="Payments, plans, receipts and staff wallet." noindex={true} />

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw size={14} /> Refresh Records
          </button>
        </div>

        {impersonationBanner}

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
              <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-brand-red">Billing</p><h2 className="text-lg font-black text-slate-900 dark:text-white">Teaching Payouts &amp; Settlement History</h2></div>
                  <button type="button" onClick={() => setShowStaffTransactionHistory(false)} className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"><X size={16}/></button>
                </div>
                <FintechTransactionHistory transactions={allTransactions.map(p => ({ ...p, amount: extractPaymentAmountNaira(p) }))} title="Teaching Payouts & Settlement History" role="staff" emptyMessage="No teaching payout transactions are recorded yet." />
              </div>
            </div>
          )}
        </div>

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
      </section>
    );
  }

  const feeStructureNode = (
    <>
      {/* Parent Hierarchical Progressive Payment & Student Plan Section */}
      {role === 'parent' ? (
        <div className="space-y-5">
          {/* Section Header & Bulk Action Toolbar */}
          <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-[#B91C1C]/15 text-[#B91C1C] flex items-center justify-center shrink-0">
                    <UserCheck size={17} />
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-[#14284B] dark:text-white">
                    Family Fee Structure ({childGroups.length} {childGroups.length === 1 ? 'Learner' : 'Learners'})
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
                  Select individual programme tracks, specific instructors, or settle all due family tuition accounts at once via Paystack.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllDue}
                  className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-[#B91C1C] dark:bg-[#B91C1C]/15 dark:hover:bg-[#B91C1C]/25 dark:text-red-400 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock size={13} />
                  <span>Select All Due</span>
                </button>

                <button
                  type="button"
                  onClick={selectAllPrograms}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckSquare size={13} />
                  <span>Select All</span>
                </button>

                {selectedFeeItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
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
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <Layers size={13} />
                  <span>{expandedChildIds.length === childGroups.length ? 'Collapse All' : 'Expand All'}</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#18181B] border border-slate-200/70 dark:border-zinc-800 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setParentFeeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    parentFeeFilter === 'all'
                      ? 'bg-white dark:bg-zinc-800 text-[#14284B] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-[#14284B] dark:hover:text-white'
                  }`}
                >
                  All Items ({parentFeeItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setParentFeeFilter('due')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    parentFeeFilter === 'due'
                      ? 'bg-white dark:bg-zinc-800 text-[#B91C1C] dark:text-red-400 shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-[#B91C1C]'
                  }`}
                >
                  Payment Due ({parentFeeItems.filter(i => i.status === 'DUE' || i.status === 'PARTIALLY_PAID').length})
                </button>
                <button
                  type="button"
                  onClick={() => setParentFeeFilter('paid')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    parentFeeFilter === 'paid'
                      ? 'bg-white dark:bg-zinc-800 text-[#14284B] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-[#14284B] dark:hover:text-white'
                  }`}
                >
                  Paid &amp; Active ({parentFeeItems.filter(i => i.status === 'PAID').length})
                </button>
              </div>

              {selectedItems.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-2 tabular-nums">
                  <span className="font-bold text-[#14284B] dark:text-white">{selectedItems.length}</span> selected:
                  <strong className="font-extrabold text-[#B91C1C] dark:text-red-400">{formatNaira(selectedBaseTotal)}</strong>
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
                  if (parentFeeFilter === 'due') return prog.status === 'DUE' || prog.status === 'PARTIALLY_PAID';
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
                    className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xs transition-all hover:border-slate-300 dark:hover:border-zinc-700"
                  >
                    {/* LEVEL 1: Child Header */}
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-[#18181B] border-b border-slate-100 dark:border-zinc-800">
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
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {child.childClass || 'Standard Cohort'}
                            </span>
                            {child.allPaid ? (
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1">
                                <CheckCircle2 size={12} className="text-slate-800 dark:text-slate-200" /> All Paid
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-brand-red inline-flex items-center gap-1">
                                <Clock size={12} /> {formatNaira(child.totalDue)} Due
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            @{child.childUsername || 'student'} • {child.allPrograms.length} active learning track{child.allPrograms.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Right side: Amount & Expand button */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-zinc-800">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block tracking-wider">Tuition Fee</span>
                          <strong className="text-sm font-mono font-black text-[#14284B] dark:text-white tabular-nums">
                            {formatNaira(child.totalTuition)}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExpandChild(child.childId)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-600 dark:text-zinc-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Hide Details' : 'View Tutors & Programs'}</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* EXPANDABLE SECTION: Level 2 (Tutors) & Level 3 (Programs) */}
                    {isExpanded && (
                      <div className="p-4 sm:p-6 space-y-5 bg-white dark:bg-[#111114]">
                        {child.tutors.map(tutor => {
                          const tutorFilteredPrograms = tutor.programs.filter(prog => {
                            if (parentFeeFilter === 'due') return prog.status === 'DUE' || prog.status === 'PARTIALLY_PAID';
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
                              className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#18181B] p-4"
                            >
                              {/* LEVEL 2: Tutor Group Header */}
                              <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200/60 dark:border-zinc-800">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => toggleTutor(tutorFilteredPrograms)}
                                    className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-800 text-[#B91C1C] transition-colors shrink-0 cursor-pointer"
                                    title={tutorAllSelected ? "Deselect tutor's programs" : "Select all programs under this tutor"}
                                  >
                                    {tutorAllSelected ? (
                                      <CheckSquare size={17} className="text-[#B91C1C]" />
                                    ) : tutorSomeSelected ? (
                                      <MinusSquare size={17} className="text-[#B91C1C]" />
                                    ) : (
                                      <Square size={17} className="text-slate-400 dark:text-zinc-500" />
                                    )}
                                  </button>

                                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-zinc-800 text-[#14284B] dark:text-zinc-300 font-bold text-xs flex items-center justify-center shrink-0">
                                    <User size={14} />
                                  </div>

                                  <div className="min-w-0">
                                    <h4 className="font-bold text-xs sm:text-sm text-[#14284B] dark:text-zinc-100 truncate">
                                      Instructor: {tutor.tutorName}
                                    </h4>
                                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                                      {tutorFilteredPrograms.length} assigned program track{tutorFilteredPrograms.length > 1 ? 's' : ''}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block">Tutor Subtotal</span>
                                  <span className="text-xs font-mono font-bold text-[#14284B] dark:text-zinc-200 tabular-nums">
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
                                          ? 'border-[#B91C1C] bg-red-50/40 dark:bg-[#B91C1C]/10 shadow-xs'
                                          : 'border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-slate-300 dark:hover:border-zinc-700'
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[#B91C1C] shrink-0">
                                              {isSelected ? <CheckSquare size={16} /> : <Square size={16} className="text-slate-400 dark:text-zinc-500" />}
                                            </span>
                                            <h5 className="font-bold text-xs text-[#14284B] dark:text-white truncate">
                                              {prog.programName}
                                            </h5>
                                          </div>
                                          {isPaid ? (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 shrink-0">
                                              Settled
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#B91C1C] dark:text-red-400 shrink-0">
                                              {prog.status === 'PARTIALLY_PAID' ? 'Partial Due' : 'Due'}
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1">
                                          {prog.cycle || 'Monthly'} cycle · Mentor support included
                                        </p>
                                      </div>

                                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                                        <span className="text-slate-400 dark:text-zinc-500 text-[10px] uppercase font-bold">Payable</span>
                                        <strong className="font-mono font-black text-[#B91C1C] dark:text-red-400 tabular-nums">
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
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-8 text-center space-y-2 shadow-2xs">
              <CreditCard size={32} className="mx-auto text-slate-400 dark:text-zinc-500" />
              <h3 className="text-sm font-black text-[#14284B] dark:text-white">No active tuition accounts found</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
                Once your child's enrollment is registered and approved by the academy admissions desk, customized tuition and learning schedules will appear here.
              </p>
            </div>
          )}

          {/* Pending Enrollment Requests for Parents */}
          {data.enrollments && data.enrollments.length > 0 && (
            <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-2xs">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#14284B] dark:text-white">
                    Pending Enrollment Requests ({data.enrollments.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Settle tuition online via Paystack for children currently awaiting admissions review.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {data.enrollments.map((req: any) => {
                  const matchedPlan = standardPlans.find(p => p.name === req.plan) || standardPlans[0];
                  return (
                    <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-[#18181B]">
                      <div>
                        <p className="text-xs font-bold text-[#14284B] dark:text-white">{req.studentName || 'Child'}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{req.plan || 'Learning Track'} · {req.studentAge || 'Age not specified'}</p>
                      </div>
                      <button
                        type="button"
                        disabled={isMasqueradingActive()}
                        onClick={() => startCheckout({ 
                          plan: matchedPlan,
                          planName: req.plan 
                        })}
                        className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold transition-all shrink-0 cursor-pointer tabular-nums"
                      >
                        {matchedPlan?.baseAmount
                          ? `Pay Now · ${formatNaira(matchedPlan.baseAmount)}`
                          : `Pay Now`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LEVEL 4: STICKY FLOATING PAYMENT CHECKOUT DRAWER */}
          {selectedItems.length > 0 && (
            <div className="sticky bottom-3 sm:bottom-4 z-40 bg-white/95 dark:bg-[#111114]/95 backdrop-blur-md border-2 border-[#B91C1C]/50 rounded-2xl p-3.5 sm:p-5 shadow-2xl transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-bold text-[#B91C1C] dark:text-red-400">
                      {selectedItems.length} {selectedItems.length === 1 ? 'Program' : 'Programs'} Selected
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-700 dark:text-zinc-300">
                      {new Set(selectedItems.map(i => i.childName)).size} {new Set(selectedItems.map(i => i.childName)).size === 1 ? 'Learner' : 'Learners'}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 truncate max-w-xl">
                    {selectedItems.map(i => `${i.childName} (${i.programName})`).join(' · ')}
                  </p>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-zinc-800">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block tracking-wider">
                      Total Payable
                    </span>
                    <strong className="text-base sm:text-lg font-extrabold text-[#14284B] dark:text-white tabular-nums">
                      {formatNaira(selectedBaseTotal)}
                    </strong>
                  </div>

                  <button
                    type="button"
                    disabled={isMasqueradingActive() || paying}
                    onClick={() => setShowParentCheckoutModal(true)}
                    className="min-h-[42px] px-4 sm:px-6 rounded-xl bg-gradient-to-r from-[#991B1B] to-[#B91C1C] hover:from-[#7F1D1D] hover:to-[#991B1B] disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={15} />
                    <span className="tabular-nums">Pay Now · {formatNaira(selectedBaseTotal)}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : role === 'student' ? (
        /* Independent & Self-Funded School Student Billing View */
        <div className="space-y-6">
          {/* Approved & Self-Funded Programme Enrolments */}
          {programmeEnrollments.length > 0 && (
            <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#B91C1C]">
                    Personal Self-Funded Programmes
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-[#14284B] dark:text-white mt-0.5">
                    Approved Programme Tuition &amp; Renewals
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                    Settle approved fees directly via Paystack. Partial deposits, outstanding balances, and cycle renewals update automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="min-h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-[#14284B] hover:bg-[#1E3A6A] dark:bg-zinc-800 dark:hover:bg-zinc-700 px-4 py-2 text-xs font-semibold text-white shrink-0 cursor-pointer"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              {sessionStorage.getItem('studentRegistrationType') === 'school' && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-300 flex items-start gap-3">
                  <ShieldCheck size={18} className="text-[#B91C1C] shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold text-[#14284B] dark:text-white block">
                      Independent Personal Billing Only
                    </strong>
                    Only your personal self-funded programmes appear here. Your school-sponsored classes remain completely unaffected, and your school is never billed for these enrolments.
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {programmeEnrollments.map((enr) => {
                  const isFocused = focusEnrollmentId === enr.id;
                  const status = String(enr.enrollmentStatus || '').toUpperCase();
                  const approvedFee = Math.max(0, Number(enr.approvedFee || 0));
                  const amountPaid = Math.max(0, Number(enr.amountPaid || 0));
                  const remaining = Math.max(0, Number(enr.remainingBalance ?? Math.max(0, approvedFee - amountPaid)));
                  const cycleNorm = String(enr.billingCycle || 'one_time').toLowerCase();
                  const isRecurring = cycleNorm === 'monthly' || cycleNorm === 'termly';
                  const canDeposit = Boolean(enr.allowDepositAccess && Number(enr.depositAmount || 0) > 0 && Number(enr.depositAmount) < approvedFee && amountPaid === 0);
                  const isRenewalDue = status === 'RENEWAL_DUE' || (isRecurring && status === 'ACTIVE' && remaining === 0);
                  const isAwaitingPayment = status === 'APPROVED_AWAITING_PAYMENT' || status === 'APPROVED_PENDING_PAYMENT';
                  const canPay =
                    approvedFee > 0 &&
                    (isAwaitingPayment ||
                      status === 'PARTIALLY_PAID' ||
                      status === 'RENEWAL_DUE' ||
                      (status === 'ACTIVE' && (remaining > 0 || isRecurring)));

                  const primaryOption: 'full' | 'deposit' | 'balance' | 'renewal' =
                    status === 'RENEWAL_DUE' || (status === 'ACTIVE' && remaining === 0 && isRecurring)
                      ? 'renewal'
                      : amountPaid > 0 && remaining > 0
                      ? 'balance'
                      : 'full';

                  const payableForAction =
                    primaryOption === 'renewal'
                      ? approvedFee
                      : primaryOption === 'balance'
                      ? remaining
                      : remaining || approvedFee;

                  const primaryLabel = `Pay Now · ${formatNaira(payableForAction)}`;

                  const historyList = Array.isArray(enr.paymentHistory) ? enr.paymentHistory : [];
                  const isHistoryOpen = Boolean(expandedProgHistoryIds[enr.id]);

                  return (
                    <article
                      key={enr.id}
                      className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all ${
                        isFocused
                          ? 'border-[#B91C1C] ring-2 ring-[#B91C1C]/20 bg-red-50/20 dark:bg-[#B91C1C]/10'
                          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B]'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#B91C1C] dark:text-red-400">
                              Self-Funded · {cycleNorm.replace(/_/g, ' ')}
                            </span>
                            <h4 className="font-bold text-sm sm:text-base text-[#14284B] dark:text-white mt-0.5 leading-snug">
                              {enr.programTitle}
                            </h4>
                          </div>
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider shrink-0 ${
                              status === 'ACTIVE'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isAwaitingPayment || status === 'RENEWAL_DUE'
                                ? 'text-[#B91C1C] dark:text-red-400'
                                : status === 'PARTIALLY_PAID'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-zinc-400'
                            }`}
                          >
                            {status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 text-xs p-3 bg-slate-50 dark:bg-[#111114] border border-slate-100 dark:border-zinc-800 rounded-xl tabular-nums">
                          <div>
                            <span className="block text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase">Approved</span>
                            <strong className="font-mono text-[#14284B] dark:text-white">
                              {approvedFee > 0 ? formatNaira(approvedFee) : 'Pending'}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase">Paid</span>
                            <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                              {formatNaira(amountPaid)}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase">Balance</span>
                            <strong className="font-mono text-[#B91C1C] dark:text-red-400 font-black">
                              {formatNaira(remaining)}
                            </strong>
                          </div>
                        </div>

                        {(enr.paidThrough || enr.nextDueDate) && (
                          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-zinc-400">
                            {enr.paidThrough && (
                              <span>
                                Paid Through: <strong className="text-[#14284B] dark:text-zinc-200">{dateLabel(enr.paidThrough)}</strong>
                              </span>
                            )}
                            {enr.nextDueDate && (
                              <span>
                                Next Due: <strong className="text-[#14284B] dark:text-zinc-200">{dateLabel(enr.nextDueDate)}</strong>
                              </span>
                            )}
                          </div>
                        )}

                        {status === 'PENDING_ADMIN_REVIEW' && (
                          <p className="mt-3 text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                            Your application is under Admissions review. Once approved with your official tuition fee, Paystack payment will unlock here.
                          </p>
                        )}

                        {historyList.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedProgHistoryIds((prev) => ({ ...prev, [enr.id]: !prev[enr.id] }))
                              }
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-zinc-300 hover:text-[#B91C1C] cursor-pointer"
                            >
                              {isHistoryOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              Payment History ({historyList.length})
                            </button>
                            {isHistoryOpen && (
                              <div className="mt-2 space-y-1.5">
                                {historyList.map((h: any, idx: number) => (
                                  <div
                                    key={h.reference || idx}
                                    className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#111114] border border-slate-100 dark:border-zinc-800"
                                  >
                                    <span className="text-slate-600 dark:text-zinc-300 truncate">
                                      {dateLabel(h.paidAt)} · {h.paymentOption || 'payment'}
                                    </span>
                                    <strong className="font-mono text-[#14284B] dark:text-white shrink-0 tabular-nums">
                                      {formatNaira(Number(h.amount || 0))}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {canPay && (
                        <div className="mt-5 flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            disabled={isMasqueradingActive()}
                            onClick={() => openProgrammeEnrollmentCheckout(enr, primaryOption)}
                            className={`flex-1 min-h-[42px] rounded-xl px-4 text-xs font-bold shadow-sm transition-all tabular-nums ${
                              isMasqueradingActive()
                                ? 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed opacity-60'
                                : 'bg-gradient-to-r from-[#991B1B] to-[#B91C1C] hover:from-[#7F1D1D] hover:to-[#991B1B] text-white cursor-pointer'
                            }`}
                          >
                            {isMasqueradingActive() ? 'Disabled in Impersonation' : primaryLabel}
                          </button>

                          {canDeposit && !isRenewalDue && (
                            <button
                              type="button"
                              disabled={isMasqueradingActive()}
                              onClick={() => openProgrammeEnrollmentCheckout(enr, 'deposit')}
                              className="min-h-[42px] rounded-xl px-4 border border-[#B91C1C]/40 text-[#B91C1C] dark:text-red-400 hover:bg-red-50 dark:hover:bg-[#B91C1C]/10 text-xs font-bold transition-all cursor-pointer shrink-0 tabular-nums"
                            >
                              Pay Deposit · {formatNaira(Number(enr.depositAmount))}
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legacy Independent Student Standard Plans (only for individual students, never school students) */}
          {sessionStorage.getItem('studentRegistrationType') === 'individual' && standardPlans.length > 0 && (
            <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-2xs">
              <div className="mb-5">
                <h3 className="text-base sm:text-lg font-bold text-[#14284B] dark:text-white">
                  Available Learning Programs
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                  Select your enrolled curriculum track to pay tuition directly via Paystack.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {standardPlans.map(plan => {
                  const hasFee = plan.baseAmount > 0;
                  const fee = hasFee ? feeFromBase(plan.baseAmount, feePolicy) : null;
                  return (
                    <article key={plan.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-[#18181B] p-4 sm:p-5 flex flex-col justify-between hover:border-[#B91C1C]/50 transition-all">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-bold text-[#14284B] dark:text-white text-sm sm:text-base">{plan.name}</h4>
                            {plan.description && (
                              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">{plan.description}</p>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 shrink-0 tabular-nums">
                            {plan.durationWeeks} weeks
                          </span>
                        </div>

                        {hasFee && fee && (
                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs p-3 bg-white dark:bg-[#111114] border border-slate-100 dark:border-zinc-800 rounded-xl tabular-nums">
                            <div>
                              <span className="block text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase">Tuition</span>
                              <strong className="font-mono text-[#14284B] dark:text-white">{formatNaira(plan.baseAmount)}</strong>
                            </div>
                            <div>
                              <span className="block text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase">Est. Fee</span>
                              <strong className="font-mono text-slate-700 dark:text-zinc-300">{formatNaira(fee.transactionFee)}</strong>
                            </div>
                            <div>
                              <span className="block text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase">Total</span>
                              <strong className="font-mono text-[#B91C1C] dark:text-red-400 font-black">{formatNaira(fee.totalAmount)}</strong>
                            </div>
                          </div>
                        )}
                      </div>

                      <button 
                        type="button" 
                        disabled={isMasqueradingActive()}
                        onClick={() => startCheckout({ plan })} 
                        className={`mt-5 min-h-[42px] w-full rounded-xl px-4 text-xs font-bold shadow-sm transition-all tabular-nums ${
                          isMasqueradingActive()
                            ? 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed opacity-60'
                            : 'bg-gradient-to-r from-[#991B1B] to-[#B91C1C] hover:from-[#7F1D1D] hover:to-[#991B1B] text-white cursor-pointer'
                        }`}
                      >
                        {isMasqueradingActive()
                          ? 'Payment Disabled in Impersonation Mode'
                          : hasFee
                            ? `Pay Now · ${formatNaira(plan.baseAmount)}`
                            : 'Pay Now'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </>
  );

  const roleFeeSummaryItems: BillingFeeLineSummary[] =
    role === 'parent'
      ? parentFeeItems.map((fi) => ({
          id: fi.id,
          title: fi.programName || 'Learning Track',
          subtitle: `${fi.childName}${fi.tutorName ? ` · ${fi.tutorName}` : ''}`,
          amount: Number(fi.contractAmount || fi.amount || 0),
          paidAmount: fi.status === 'PAID' ? Number(fi.contractAmount || fi.amount || 0) : 0,
          remainingAmount: fi.status === 'PAID' ? 0 : Number(fi.amount || 0),
          durationLabel: fi.cycle === 'termly' ? '12 Weeks' : '4 Weeks',
          statusLabel:
            fi.status === 'PAID'
              ? 'Active'
              : fi.status === 'PARTIALLY_PAID'
              ? 'Partial Due'
              : 'Payment Due',
          statusTone:
            fi.status === 'PAID'
              ? 'active'
              : fi.status === 'PARTIALLY_PAID'
              ? 'partial'
              : 'due',
        }))
      : programmeEnrollments.length > 0
      ? programmeEnrollments.map((enr) => {
          const st = String(enr.enrollmentStatus || '').toUpperCase();
          const fee = Math.max(0, Number(enr.approvedFee || 0));
          const paid = Math.max(0, Number(enr.amountPaid || 0));
          const rem = Math.max(0, Number(enr.remainingBalance ?? Math.max(0, fee - paid)));
          const cycle = String(enr.billingCycle || 'one_time').toLowerCase();
          return {
            id: enr.id,
            title: enr.programTitle || 'Programme Track',
            subtitle: `Self-Funded · ${cycle.replace(/_/g, ' ')}`,
            amount: fee,
            paidAmount: paid,
            remainingAmount: rem,
            durationLabel:
              cycle === 'monthly' ? '4 Weeks' : cycle === 'termly' ? '12 Weeks' : 'Full Track',
            statusLabel:
              st === 'ACTIVE' && rem === 0
                ? 'Active'
                : st === 'PARTIALLY_PAID'
                ? 'Partially Paid'
                : st === 'PENDING_ADMIN_REVIEW'
                ? 'Pending Review'
                : 'Payment Due',
            statusTone:
              st === 'ACTIVE' && rem === 0
                ? 'active'
                : st === 'PARTIALLY_PAID'
                ? 'partial'
                : st === 'PENDING_ADMIN_REVIEW'
                ? 'pending'
                : 'due',
          };
        })
      : standardPlans.slice(0, 4).map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.description || 'Academy Learning Track',
          amount: Number(p.baseAmount || 0),
          durationLabel: `${p.durationWeeks || 4} Weeks`,
          statusLabel: roleBalanceDue > 0 ? 'Payment Due' : 'Active',
          statusTone: roleBalanceDue > 0 ? 'due' : 'active',
        }));

  const rolePayableNow =
    role === 'parent'
      ? selectedBaseTotal > 0
        ? selectedBaseTotal
        : roleBalanceDue
      : roleBalanceDue;

  return (
    <section aria-label="Billing center">
      <SEO title="Billing & Fees | Jaystarbliss Studios" description="View your fee details, track payments, and manage your billing information easily." noindex={true} />

      <BillingEditorialShell
        role={role}
        subtitle={
          role === 'parent'
            ? 'View family tuition details, track verified payments, and settle programme fees in one place.'
            : 'View your payment details, explore programmes, and manage your fees in one place.'
        }
        sessionLabel="Current Session"
        totalFees={roleTotalFees}
        amountPaid={roleAmountPaid}
        balanceDue={roleBalanceDue}
        payableNowAmount={rolePayableNow}
        dueDateLabel={roleDueDateLabel}
        activeTab={billingSubTab}
        onTabChange={setBillingSubTab}
        onRefresh={() => void load()}
        onMakePayment={handleEditorialMakePayment}
        paymentDisabled={isMasqueradingActive()}
        feeSummaryItems={roleFeeSummaryItems}
        banners={impersonationBanner}
        feeStructureSlot={feeStructureNode}
        paymentHistorySlot={
          <div id="fintech-tx-history">
            <FintechTransactionHistory
              transactions={allTransactions.map(p => ({ ...p, amount: extractPaymentAmountNaira(p) }))}
              title="Transactions & Invoices"
              role={role}
              emptyMessage="No transaction receipts on record yet"
            />
          </div>
        }
      />

      {/* PARENT ITEMIZED PAYSTACK REVIEW MODAL */}
      {role === 'parent' && (
        <PaystackPaymentReviewModal
          isOpen={showParentCheckoutModal}
          onClose={() => { if (!paying) setShowParentCheckoutModal(false); }}
          reviewKey={`parent-multi:${selectedItems.map(i => `${i.id}:${i.amount}`).join('|')}`}
          subtitle="Family Tuition Settlement"
          title="Review Your Payment"
          description="Please verify each selected learner, programme track, and our Payment Policy before proceeding to Paystack."
          contextRows={[
            {
              label: 'Learners Included',
              value: Array.from(new Set(selectedItems.map(i => i.childName))).join(', ')
            },
            {
              label: 'Selected Programmes',
              value: `${selectedItems.length} programme track${selectedItems.length === 1 ? '' : 's'}`
            },
            {
              label: 'Account Role',
              value: 'Parent / Guardian'
            }
          ]}
          lineItems={selectedItems.map(item => ({
            id: item.id,
            primary: item.childName,
            secondary: item.programName,
            meta: item.tutorName ? `Assigned Instructor: ${item.tutorName}` : undefined,
            amount: Number(item.amount || 0)
          }))}
          subtotal={selectedBaseTotal}
          estimatedFee={selectedChargePreview.transactionFee}
          estimatedTotal={selectedChargePreview.totalAmount}
          feeNote="Estimated Paystack fee is displayed for transparency. Only the exact verified base tuition items are settled, and Paystack confirms final gateway charges on checkout."
          loading={paying}
          disabled={isMasqueradingActive()}
          disabledMessage="Payment checkout is restricted in Superadmin Impersonation mode."
          onConfirmPaystack={processParentMultiPayment}
        />
      )}

      {/* Self-Funded Student Programme Paystack Review Modal */}
      {role === 'student' && activeProgEnrollment && (() => {
        const approvedFee = Math.max(0, Number(activeProgEnrollment.approvedFee || 0));
        const amountPaid = Math.max(0, Number(activeProgEnrollment.amountPaid || 0));
        const remaining = Math.max(0, Number(activeProgEnrollment.remainingBalance ?? Math.max(0, approvedFee - amountPaid)));
        const depositAmt = Math.max(0, Number(activeProgEnrollment.depositAmount || 0));
        const canDeposit = Boolean(activeProgEnrollment.allowDepositAccess && depositAmt > 0 && depositAmt < approvedFee && amountPaid === 0);

        const subtotal =
          progPaymentOption === 'renewal'
            ? approvedFee
            : progPaymentOption === 'deposit' && canDeposit
            ? depositAmt
            : remaining > 0
            ? remaining
            : approvedFee;

        const selfFundedPolicy = data.config?.studentSelfFundedFeePolicy || feePolicy;
        const preview = feeFromBase(subtotal, selfFundedPolicy);
        const emailValid =
          studentPayerEmail.trim().includes('@') &&
          !studentPayerEmail.trim().toLowerCase().endsWith('.local') &&
          !studentPayerEmail.trim().toLowerCase().endsWith('.invalid');

        return (
          <PaystackPaymentReviewModal
            isOpen={Boolean(activeProgEnrollment)}
            onClose={() => { if (!paying) setActiveProgEnrollment(null); }}
            reviewKey={`self-prog:${activeProgEnrollment.id}:${progPaymentOption}:${subtotal}`}
            subtitle="Student Self-Funded Programme"
            title="Review Programme Payment"
            description="Verify your approved fee, billing responsibility, and receipt email before proceeding to Paystack."
            contextRows={[
              { label: 'Programme', value: activeProgEnrollment.programTitle },
              { label: 'Billing Responsibility', value: 'Student Self-Funded (Personal)' },
              { label: 'Payment Option', value: progPaymentOption.toUpperCase() },
              { label: 'Billing Cycle', value: activeProgEnrollment.billingCycle || 'ONE_TIME' },
            ]}
            subtotal={subtotal}
            estimatedFee={preview.transactionFee}
            estimatedTotal={preview.totalAmount}
            feeNote="The final amount is computed authoritatively on our server from your approved tuition record."
            loading={paying}
            disabled={isMasqueradingActive() || !emailValid}
            disabledMessage={!emailValid ? 'Please provide a valid personal email address for your receipt.' : 'Disabled in Impersonation mode.'}
            onConfirmPaystack={processProgrammeEnrollmentPayment}
          >
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              {canDeposit && (
                <div>
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Choose Payment Amount
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setProgPaymentOption('full')}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                        progPaymentOption === 'full'
                          ? 'border-brand-red bg-red-50 text-brand-red dark:bg-red-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Full Tuition ({formatNaira(remaining || approvedFee)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setProgPaymentOption('deposit')}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                        progPaymentOption === 'deposit'
                          ? 'border-brand-red bg-red-50 text-brand-red dark:bg-red-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Min. Deposit ({formatNaira(depositAmt)})
                    </button>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Personal Receipt Email (Required by Paystack)
                </span>
                <input
                  type="email"
                  required
                  value={studentPayerEmail}
                  onChange={(e) => setStudentPayerEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs text-slate-900 dark:text-white"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Enter your personal email address for official Paystack receipts. Do not enter a school email.
                </span>
              </label>
            </div>
          </PaystackPaymentReviewModal>
        );
      })()}

      {/* Single Paystack Review Modal for Parents / Independent Students */}
      {(() => {
        const activeSinglePlan = standardPlans.find(p => p.id === selectedPlanId) || standardPlans[0];
        const activeStudentRecord = (data.students || []).find((s: any) => s.id === selectedStudentId);
        const singleSubtotal = Number(activeSinglePlan?.baseAmount || 0);
        const singleFeePreview = feeFromBase(singleSubtotal, feePolicy);
        const learnerNameDisplay = role === 'parent'
          ? (activeStudentRecord?.fullName || activeStudentRecord?.studentName || activeStudentRecord?.username || 'Select learner above')
          : (auth.currentUser?.displayName || 'Student Account');

        return (
          <PaystackPaymentReviewModal
            isOpen={showCheckout}
            onClose={() => { if (!paying) setShowCheckout(false); }}
            reviewKey={`single:${activeSinglePlan?.id || ''}:${selectedStudentId}:${teachingMode}:${role}`}
            subtitle="Tuition Settlement"
            title="Review Your Payment"
            description="Please review the learner, programme track, and our Payment Policy before proceeding to Paystack."
            contextRows={[
              { label: 'Learner', value: learnerNameDisplay },
              { label: 'Programme / Track', value: activeSinglePlan?.name || 'Academy Learning Track' },
              { label: 'Billing Cycle', value: `${activeSinglePlan?.durationWeeks || 4} Weeks` },
              { label: 'Delivery Mode', value: teachingMode || 'Standard Delivery' },
              { label: 'Tutor', value: activeStudentRecord?.tutorName || activeStudentRecord?.assignedTutorName || undefined }
            ]}
            subtotal={singleSubtotal}
            estimatedFee={singleFeePreview.transactionFee}
            estimatedTotal={singleFeePreview.totalAmount}
            feeNote="Estimated Paystack processing fee is shown for transparency. Paystack confirms the final charge dynamically at hosted checkout."
            loading={paying}
            disabled={isMasqueradingActive() || (role === 'parent' && !selectedStudentId)}
            disabledMessage={role === 'parent' && !selectedStudentId ? 'Please select the learner for this payment first.' : 'Payment checkout is restricted in Superadmin Impersonation mode.'}
            onConfirmPaystack={processPayment}
          >
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              {role === 'parent' && (
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Select Child / Student</span>
                  <select
                    required
                    value={selectedStudentId}
                    onChange={e => setSelectedStudentId(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs text-slate-900 dark:text-white"
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
                  className="min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs text-slate-900 dark:text-white"
                >
                  <option value="Physical Lab / In-Person">Physical Lab / In-Person</option>
                  <option value="Online 1-on-1 Mentorship">Online 1-on-1 Mentorship</option>
                  <option value="Hybrid (Lab + Virtual Sessions)">Hybrid (Lab + Virtual Sessions)</option>
                </select>
              </label>
            </div>
          </PaystackPaymentReviewModal>
        );
      })()}
    </section>
  );
};

export default BillingCenter;
