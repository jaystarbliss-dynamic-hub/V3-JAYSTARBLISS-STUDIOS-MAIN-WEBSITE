import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Activity, CheckCircle2, DollarSign, Loader2, Save, 
  TrendingUp, Users, Wallet, School, 
  Send, CreditCard, RefreshCw, ArrowLeft,
  Building2, Plus, Eye, EyeOff,
  Search, ChevronRight, FileText, Download, Calendar, Layers,
  Sliders, UserCheck, AlertCircle, ExternalLink,
  ChevronDown, ChevronUp, Settings, User, BookOpen
} from 'lucide-react';
import { billingGet, billingPost, dateLabel, formatNaira } from '../../lib/billing';
import SEO from '../../components/ui/SEO';
import { useToast } from '../../contexts/ToastContext';
import { collection, getDocs, doc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FintechTransactionHistory } from '../../components/portal/FintechTransactionHistory';
import { FintechWithdrawalModal } from '../../components/portal/FintechWithdrawalModal';
import { FintechAddMoneyModal } from '../../components/portal/FintechAddMoneyModal';
import { TransferToTutorModal } from '../../components/portal/TransferToTutorModal';
import { ParentTuitionModal } from '../../components/portal/ParentTuitionModal';
import type { UnifiedParentStudent } from '../../components/portal/ParentTuitionModal';
import { TutorAllocationModal } from '../../components/portal/TutorAllocationModal';
import { formatCurrency, generatePdfReceipt } from '../../lib/receiptGenerator';
import type { TransactionReceiptData } from '../../lib/receiptGenerator';

export interface ParentFamilyGroup {
  id: string;
  type: 'parent' | 'independent_student';
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  children: UnifiedParentStudent[];
  totalBilled: number;
}

type Plan = Record<string, any> & { id: string };
type Policy = { percentage: string; flat: string; cap: string; waiveFlatBelow?: string; enabled: boolean };
type ActiveView = 'hub' | 'transactions' | 'monthly' | 'schools' | 'tutors' | 'policies' | 'parents';

const money = (v: any) => formatNaira(Number(v || 0));
const monthKey = (v: any) => { 
  const d = new Date(v); 
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 7); 
};

const inputClass = 'w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500';

export interface AdminBillingProps {
  initialView?: ActiveView;
}

const AdminBilling: React.FC<AdminBillingProps> = ({ initialView = 'hub' }) => {
  const { toast } = useToast();
  const [data, setData] = useState<any>({
    config: { plans: {}, parentFeePolicy: {}, schoolFeePolicy: {}, withdrawalFeePolicy: {} },
    payments: [],
    enrollments: [],
    withdrawals: [],
    staff: []
  });
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>(initialView);
  const [saving, setSaving] = useState('');
  const [role, setRole] = useState('admin');
  const [showBalance, setShowBalance] = useState(true);
  
  // Plans & Policies State
  const [selectedPlan, setSelectedPlan] = useState('');
  const [planDraft, setPlanDraft] = useState({ name: '', baseAmount: '', durationWeeks: '', teachingModes: '' });
  const [parentPolicy, setParentPolicy] = useState<Policy>({ percentage: '', flat: '', cap: '', waiveFlatBelow: '', enabled: true });
  const [schoolPolicy, setSchoolPolicy] = useState<Policy>({ percentage: '', flat: '', cap: '', waiveFlatBelow: '', enabled: true });
  const [withdrawalPolicy, setWithdrawalPolicy] = useState<Policy>({ percentage: '', flat: '', cap: '', enabled: false });
  const [minimumWithdrawal, setMinimumWithdrawal] = useState('10000');

  // Quick school fee editor & Full School Workspace
  const [editingSchoolBilling, setEditingSchoolBilling] = useState<any | null>(null);
  const [selectedSchoolWorkspace, setSelectedSchoolWorkspace] = useState<any | null>(null);
  const [activeSchoolTab, setActiveSchoolTab] = useState<'config' | 'margin' | 'record_payment' | 'invoices'>('config');
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');
  const [schoolBillingConfig, setSchoolBillingConfig] = useState({
    baseAmount: 0,
    cycle: 'termly',
    mode: 'advance_termly',
    nextDueDate: '',
    allowedModes: ['advance_termly', 'advance_monthly', 'post_termly', 'post_monthly'],
    discountPercent: 0,
    notes: '',
    status: 'ACTIVE'
  });
  const [offlinePaymentDraft, setOfflinePaymentDraft] = useState({
    amount: '',
    reference: '',
    date: new Date().toISOString().slice(0, 10),
    payerName: '',
    description: 'Institutional Tuition Payment',
    notes: 'Direct Bank Settlement'
  });

  // Parent filter & expand state
  const [parentSearch, setParentSearch] = useState('');
  const [parentStatusFilter, setParentStatusFilter] = useState('ALL');
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const toggleParentExpand = (id: string) => {
    setExpandedParents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Fintech Modals
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawMode, setWithdrawMode] = useState<'bank' | 'opay'>('bank');
  const [isAddMoneyModalOpen, setIsAddMoneyModalOpen] = useState(false);
  const [isTransferToTutorOpen, setIsTransferToTutorOpen] = useState(false);

  // Parent & Tutor Modals
  const [isParentModalOpen, setIsParentModalOpen] = useState(false);
  const [selectedParentStudent, setSelectedParentStudent] = useState<UnifiedParentStudent | null>(null);
  const [isTutorAllocModalOpen, setIsTutorAllocModalOpen] = useState(false);
  const [defaultAllocTutorId, setDefaultAllocTutorId] = useState<string | undefined>(undefined);
  const [defaultAllocSchoolId, setDefaultAllocSchoolId] = useState<string | undefined>(undefined);

  // Load all billing data with direct Firestore fallback and sync
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch from Netlify backend
      const billingResult = await billingGet<any>('billing-data').catch(() => null);

      // 2. Fetch directly from Firestore collections to ensure 100% test transfers and direct payments appear
      const [schoolSnap, paymentsSnap, withdrawalsSnap, usersSnap, parentsSnap, enrollSnap, indivSnap, studSnap] = await Promise.all([
        getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'payments')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'walletWithdrawals')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'users')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'parents')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'enrollment_requests')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'students')).catch(() => ({ docs: [] } as any))
      ]);

      const loadedSchools = schoolSnap.docs.map((d: any) => {
        const item = d.data();
        const fallbackName = item.name || item.schoolName || item.institutionName || (item.contactEmail ? item.contactEmail.split('@')[0] : '') || (item.email ? item.email.split('@')[0] : '') || item.schoolCode || 'Partner Institution';
        return {
          id: d.id,
          ...item,
          name: fallbackName,
          code: item.code || item.schoolCode || d.id
        };
      });
      setSchools(loadedSchools);

      // Build parent lookup maps by ID, email, and child ID
      const parentById = new Map<string, { id: string; name: string; email: string; phone: string }>();
      const parentByEmail = new Map<string, { id: string; name: string; email: string; phone: string }>();
      const parentByChildId = new Map<string, { id: string; name: string; email: string; phone: string }>();

      const registerParentRecord = (docId: string, raw: any) => {
        const pId = String(raw.uid || raw.parentId || docId || '').trim();
        const pName = String(raw.fullName || raw.name || raw.displayName || '').trim();
        const pEmail = String(raw.email || raw.parentEmail || '').trim().toLowerCase();
        const pPhone = String(raw.phone || raw.phoneNumber || raw.whatsapp || raw.parentPhone || '').trim();
        if (!pName && !pEmail) return;
        const entry = {
          id: pId || docId,
          name: pName || (pEmail ? pEmail.split('@')[0] : 'Parent'),
          email: pEmail,
          phone: pPhone,
        };
        if (docId) parentById.set(docId, entry);
        if (pId) parentById.set(pId, entry);
        if (pEmail) parentByEmail.set(pEmail, entry);
        if (Array.isArray(raw.children)) {
          raw.children.forEach((cid: any) => {
            const cleanCid = String(cid || '').trim();
            if (cleanCid) parentByChildId.set(cleanCid, entry);
          });
        }
      };

      parentsSnap.docs.forEach((d: any) => registerParentRecord(d.id, d.data()));
      usersSnap.docs.forEach((d: any) => {
        const u = d.data();
        if (String(u.role || '').toLowerCase() === 'parent' || u.isParent) {
          registerParentRecord(d.id, u);
        }
      });

      const resolveParentForStudent = (docId: string, item: any) => {
        const pId = String(item.parentId || item.parentUid || item.parent_id || '').trim();
        const rawParentEmail = String(item.parentEmail || item.guardianEmail || '').trim().toLowerCase();
        const matched =
          (pId && parentById.get(pId)) ||
          (rawParentEmail && parentByEmail.get(rawParentEmail)) ||
          parentByChildId.get(docId) ||
          null;
        return {
          parentId: pId || matched?.id || '',
          parentName: item.parentName || item.guardianName || matched?.name || '',
          parentEmail: item.parentEmail || item.guardianEmail || matched?.email || '',
          parentPhone: item.parentPhone || item.guardianPhone || matched?.phone || item.phone || '',
        };
      };

      // Build Unified Parents & Students List from individualStudents, students, and enrollment_requests
      // Strictly ignore school-registered students (students with schoolId or studentType === 'school')
      const parentStudentsMap = new Map<string, UnifiedParentStudent>();

      // 1. From individualStudents
      indivSnap.docs.forEach((d: any) => {
        const item = d.data();
        if (item.schoolId || item.studentType === 'school') return;
        const resolvedParent = resolveParentForStudent(d.id, item);
        parentStudentsMap.set(d.id, {
          id: d.id,
          source: 'individualStudents',
          studentName: item.fullName || item.studentName || item.username || 'Scholar',
          parentName: resolvedParent.parentName,
          parentEmail: resolvedParent.parentEmail,
          parentPhone: resolvedParent.parentPhone,
          plan: item.track || item.plan || item.subjects || '',
          amount: Number(item.amount || item.tuitionFee || 0),
          cycle: item.cycle || 'monthly',
          teachingMode: item.teachingMode || item.mode || 'Online 1-on-1',
          tutorId: item.tutorId || item.assignedTutorId,
          tutorName: item.tutorName || item.assignedTutorName,
          tutorPayoutRate: Number(item.tutorPayoutRate || 0),
          status: String(item.accountStatus || item.status || 'ACTIVE').toUpperCase(),
          age: item.age,
          grade: item.grade || item.class,
          createdAt: item.createdAt?.toDate ? item.createdAt.toDate().toISOString() : (item.createdAt || new Date().toISOString())
        });
      });

      // 2. From students collection (personal/parent)
      studSnap.docs.forEach((d: any) => {
        const item = d.data();
        if (!parentStudentsMap.has(d.id) && item.studentType !== 'school' && !item.schoolId) {
          const resolvedParent = resolveParentForStudent(d.id, item);
          parentStudentsMap.set(d.id, {
            id: d.id,
            source: 'students',
            studentName: item.fullName || item.name || 'Scholar',
            parentName: resolvedParent.parentName,
            parentEmail: resolvedParent.parentEmail,
            parentPhone: resolvedParent.parentPhone,
            plan: item.track || item.plan || '',
            amount: Number(item.amount || item.tuitionFee || 0),
            cycle: item.cycle || 'monthly',
            teachingMode: item.teachingMode || 'Online 1-on-1',
            tutorId: item.tutorId || item.assignedTutorId,
            tutorName: item.tutorName || item.assignedTutorName,
            tutorPayoutRate: Number(item.tutorPayoutRate || 0),
            status: String(item.accountStatus || item.status || 'ACTIVE').toUpperCase(),
            grade: item.grade || item.class,
            createdAt: item.createdAt?.toDate ? item.createdAt.toDate().toISOString() : (item.createdAt || new Date().toISOString())
          });
        }
      });

      // 3. From enrollment_requests (skip if linkedStudentId / studentDocId is already in parentStudentsMap)
      enrollSnap.docs.forEach((d: any) => {
        const item = d.data();
        if (item.schoolId || item.studentType === 'school') return;
        const linkedId = String(item.linkedStudentId || item.studentDocId || '').trim();
        if (linkedId && parentStudentsMap.has(linkedId)) {
          const existing = parentStudentsMap.get(linkedId)!;
          if (!existing.amount && (item.amount || item.tuitionFee)) {
            existing.amount = Number(item.amount || item.tuitionFee || 0);
          }
          if (!existing.plan && (item.plan || item.courseName || item.program)) {
            existing.plan = item.plan || item.courseName || item.program || '';
          }
          if (!existing.tutorId && item.tutorId) {
            existing.tutorId = item.tutorId;
            existing.tutorName = item.tutorName;
          }
          return;
        }
        const resolvedParent = resolveParentForStudent(d.id, item);
        parentStudentsMap.set(d.id, {
          id: d.id,
          source: 'enrollment_requests',
          studentName: item.studentName || item.childName || 'Scholar',
          parentName: resolvedParent.parentName,
          parentEmail: resolvedParent.parentEmail,
          parentPhone: resolvedParent.parentPhone,
          plan: item.plan || item.courseName || item.program || '',
          amount: Number(item.amount || item.tuitionFee || 0),
          cycle: item.cycle || 'monthly',
          teachingMode: item.teachingMode || item.mode || 'Online 1-on-1',
          tutorId: item.tutorId,
          tutorName: item.tutorName,
          tutorPayoutRate: Number(item.tutorPayoutRate || 0),
          status: String(item.status || 'PENDING').toUpperCase(),
          age: item.age,
          grade: item.grade,
          createdAt: item.createdAt?.toDate ? item.createdAt.toDate().toISOString() : (item.createdAt || new Date().toISOString())
        });
      });

      // Parent/student records are database-driven. Do not seed families, programmes or fees in the UI.
      const unifiedParentsList = Array.from(parentStudentsMap.values());

      // Merge Payments from Firestore and API
      const directPayments = paymentsSnap.docs.map((d: any) => {
        const item = d.data();
        return {
          id: d.id,
          ...item,
          paidAt: item.paidAt || item.paymentDate || item.createdAt || new Date().toISOString()
        };
      });

      // Extract school billing payments
      const schoolBillingPayments: any[] = [];
      loadedSchools.forEach((sch: any) => {
        if (Array.isArray(sch.billing?.payments)) {
          sch.billing.payments.forEach((p: any, idx: number) => {
            schoolBillingPayments.push({
              id: p.id || `school-${sch.id}-${idx}`,
              schoolId: sch.id,
              schoolName: sch.name,
              payerName: sch.name,
              description: `Institutional Tuition - ${sch.name}`,
              plan: 'Partner School Term Subscription',
              category: 'school_tuition',
              type: 'inflow',
              amount: p.amount || sch.billing?.baseAmount || 0,
              customerTotal: p.amount || sch.billing?.baseAmount || 0,
              baseAmount: p.amount || sch.billing?.baseAmount || 0,
              transactionFee: Number(p.transactionFee || 0),
              status: p.status || 'PAID',
              paidAt: p.paidAt || p.date || sch.billing?.lastPaymentDate || new Date().toISOString()
            });
          });
        }
      });

      // Combine and deduplicate payments by ID/reference
      const paymentMap = new Map<string, any>();
      (billingResult?.payments || []).forEach((p: any) => {
        const key = p.reference || p.id;
        if (key) paymentMap.set(key, p);
      });
      directPayments.forEach((p: any) => {
        const key = p.reference || p.id;
        if (key) paymentMap.set(key, { ...(paymentMap.get(key) || {}), ...p });
      });
      schoolBillingPayments.forEach((p: any) => {
        const key = p.reference || p.id;
        if (key && !paymentMap.has(key)) paymentMap.set(key, p);
      });

      const allMergedPayments = Array.from(paymentMap.values());

      // Staff users list
      const staffList: any[] = [];
      usersSnap.docs.forEach((d: any) => {
        const u = d.data();
        const r = String(u.role || '').toLowerCase();
        if (['tutor', 'staff', 'instructor'].includes(r)) {
          staffList.push({
            id: d.id,
            name: u.name || u.displayName || u.email || 'Faculty Tutor',
            email: u.email || '',
            role: r,
            accountStatus: u.accountStatus || 'ACTIVE'
          });
        }
      });

      // Merge withdrawals
      const directWithdrawals = withdrawalsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const withdrawalMap = new Map<string, any>();
      (billingResult?.withdrawals || []).forEach((w: any) => withdrawalMap.set(w.id, w));
      directWithdrawals.forEach((w: any) => withdrawalMap.set(w.id, { ...(withdrawalMap.get(w.id) || {}), ...w }));

      const mergedData = {
        config: billingResult?.config || {
          plans: {},
          parentFeePolicy: { percentage: '1.5', flat: '100', cap: '2000', enabled: true },
          schoolFeePolicy: { percentage: '1.5', flat: '100', cap: '2500', enabled: true },
          withdrawalFeePolicy: { percentage: '1.0', flat: '50', cap: '1000', enabled: false },
          minimumWithdrawalAmount: 10000
        },
        payments: allMergedPayments,
        enrollments: unifiedParentsList,
        withdrawals: Array.from(withdrawalMap.values()),
        staff: staffList.length > 0 ? staffList : (billingResult?.staff || [])
      };

      setData(mergedData);
      setRole(String(sessionStorage.getItem('userRole') || billingResult?.role || 'admin').toLowerCase());
      setParentPolicy({ ...mergedData.config.parentFeePolicy });
      setSchoolPolicy({ ...mergedData.config.schoolFeePolicy });
      setWithdrawalPolicy({ ...mergedData.config.withdrawalFeePolicy });
      setMinimumWithdrawal(String(mergedData.config.minimumWithdrawalAmount || 10000));
    } catch (e) {
      console.warn('Billing load error:', e);
      toast.error(e instanceof Error ? e.message : 'Unable to load billing operations.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Calculations for Financial Metrics
  const plans = Object.values((data.config?.plans || {}) as Record<string, Plan>);
  
  // Normalized Paid Payments
  const paid = useMemo(() => {
    return (data.payments || []).filter((p: any) => {
      const st = String(p.status || p.paymentStatus || 'PAID').toUpperCase();
      return ['PAID', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'APPROVED', 'VERIFIED'].includes(st);
    });
  }, [data.payments]);

  // Normalized Paid Withdrawals & Disbursals
  const withdrawals = useMemo(() => data.withdrawals || [], [data.withdrawals]);
  const paidWithdrawals = useMemo(() => {
    return withdrawals.filter((w: any) => {
      const st = String(w.status || '').toUpperCase();
      return ['PAID', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(st);
    });
  }, [withdrawals]);

  // Total Inflow Collections (Tuitions, School fees, Parent payments - excluding internal transfers)
  const totalInflows = useMemo(() => {
    return paid.reduce((sum: number, p: any) => {
      const isOutflow = p.type === 'transfer_to' || p.type === 'outflow' || p.category === 'transfer_to';
      if (isOutflow) return sum;
      const raw = Number(p.customerTotal || p.amount || p.baseAmount || p.totalAmount || 0);
      const normalized = raw > 10000000 ? raw / 100 : raw; // Handle kobo format if stored as kobo
      return sum + normalized;
    }, 0);
  }, [paid]);

  // Total Transfers to Faculty/Tutors
  const totalTransfersToTutors = useMemo(() => {
    return paid.reduce((sum: number, p: any) => {
      const isTransfer = p.type === 'transfer_to' || p.category === 'transfer_to';
      if (!isTransfer) return sum;
      const raw = Number(p.amount || p.customerTotal || p.baseAmount || 0);
      const normalized = raw > 10000000 ? raw / 100 : raw;
      return sum + normalized;
    }, 0);
  }, [paid]);

  // Total Gross Collections
  const totalGross = totalInflows;

  // Paystack Gateway Fees
  const totalFees = useMemo(() => {
    return paid.reduce((sum: number, p: any) => sum + Number(p.transactionFee || 0), 0);
  }, [paid]);

  // Tutor Allocations
  const tutorAllocated = useMemo(() => {
    return paid.reduce((sum: number, p: any) => {
      if (p.tutorId || p.assignedTutorId || p.type === 'transfer_to' || p.category === 'transfer_to') {
        const raw = Number(p.baseAmount || p.customerTotal || p.amount || 0);
        return sum + (raw > 10000000 ? raw / 100 : raw);
      }
      return sum;
    }, 0);
  }, [paid]);

  // Withdrawal Service Fees
  const withdrawalFees = useMemo(() => {
    return paidWithdrawals.reduce((sum: number, w: any) => sum + Number(w.serviceFee || w.fee || 0), 0);
  }, [paidWithdrawals]);

  // Total Disbursed to Tutors / Banks
  const totalDisbursed = useMemo(() => {
    return paidWithdrawals.reduce((sum: number, w: any) => sum + Number(w.netAmount || w.amount || 0), 0);
  }, [paidWithdrawals]);

  // Live Calculated Dynamic Available Balance (Treasury Pool minus Withdrawals and Transfers to Tutors)
  const calculatedAvailableBalance = useMemo(() => {
    const netPool = totalInflows - totalDisbursed - totalTransfersToTutors;
    return netPool >= 0 ? netPool : 0;
  }, [totalInflows, totalDisbursed, totalTransfersToTutors]);

  // Platform Net Retained Revenue
  const platformNet = useMemo(() => {
    return totalFees + withdrawalFees;
  }, [totalFees, withdrawalFees]);

  // Monthly Financial Breakdown Matrix
  const monthly = useMemo(() => {
    const map: Record<string, any> = {};
    paid.forEach((p: any) => {
      const k = monthKey(p.paidAt || p.updatedAt || p.createdAt);
      if (!k) return;
      map[k] ??= { gross: 0, gatewayFees: 0, tutorAllocated: 0, withdrawals: 0, withdrawalFees: 0, transactions: 0 };
      const amt = Number(p.customerTotal || p.amount || p.baseAmount || 0);
      map[k].gross += amt > 10000000 ? amt / 100 : amt;
      map[k].gatewayFees += Number(p.transactionFee || 0);
      map[k].tutorAllocated += (p.tutorId || p.type === 'transfer_to') ? amt : 0;
      map[k].transactions++;
    });
    paidWithdrawals.forEach((w: any) => {
      const k = monthKey(w.paidAt || w.updatedAt || w.createdAt);
      if (!k) return;
      map[k] ??= { gross: 0, gatewayFees: 0, tutorAllocated: 0, withdrawals: 0, withdrawalFees: 0, transactions: 0 };
      map[k].withdrawals += Number(w.netAmount || w.amount || 0);
      map[k].withdrawalFees += Number(w.serviceFee || w.fee || 0);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([month, v]) => ({
      month,
      ...v,
      platformRevenue: v.gatewayFees + v.withdrawalFees
    }));
  }, [paid, paidWithdrawals]);

  // Format transactions for FintechTransactionHistory
  const formattedTransactions: TransactionReceiptData[] = useMemo(() => {
    return paid.map((p: any) => {
      const amt = Number(p.customerTotal || p.amount || p.baseAmount || 0);
      const isTransferToTutor = p.type === 'transfer_to' || p.category === 'transfer_to' || Boolean(p.tutorId);
      const isSchoolTuition = p.category === 'school_tuition' || Boolean(p.schoolId);

      return {
        ...p,
        id: p.id || p.reference || `TXN-${Math.random().toString(36).slice(2, 8)}`,
        reference: p.reference || p.id,
        amount: amt > 10000000 ? amt / 100 : amt,
        customerTotal: amt > 10000000 ? amt / 100 : amt,
        baseAmount: p.baseAmount || (amt > 10000000 ? amt / 100 : amt),
        transactionFee: Number(p.transactionFee || 0),
        status: p.status || 'PAID',
        paidAt: p.paidAt || p.createdAt,
        type: isTransferToTutor ? 'outflow' : (p.type || 'inflow'),
        category: isTransferToTutor ? 'transfer_to' : (isSchoolTuition ? 'school_tuition' : (p.category || 'parent_tuition')),
        description: p.description || p.plan || (isSchoolTuition ? `Partner School - ${p.schoolName || 'Tuition'}` : (p.studentName ? `Tuition - ${p.studentName}` : 'Tuition Settlement')),
        plan: p.plan || p.paymentPlanName || p.programName || 'Technology Curriculum',
        programName: p.programName || p.plan || p.paymentPlanName || '',
        payerName: p.payerName || p.customerName || p.schoolName || p.studentName || 'Guardian',
        payerEmail: p.payerEmail || p.customerEmail || '',
        payerRole: p.payerRole || (p.schoolId ? 'School' : (p.parentId ? 'Parent' : undefined)),
        studentName: p.studentName || p.metadata?.studentName || '',
        schoolName: p.schoolName || '',
        tutorName: p.tutorName || '',
        students: p.students || p.metadata?.students || [],
        metadata: p.metadata || {}
      };
    });
  }, [paid]);


  // Action: Transfer to Tutor Wallet
  const handleTransferToTutor = async (tutorId: string, tutorName: string, amount: number, notes: string) => {
    try {
      // 1. Update tutor's wallet in Firestore
      const walletRef = doc(db, 'staffWallets', tutorId);
      await setDoc(walletRef, {
        staffId: tutorId,
        staffName: tutorName,
        availableBalance: increment(amount),
        lifetimeEarned: increment(amount),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Record transfer transaction in payments collection
      const paymentRef = doc(collection(db, 'payments'));
      await setDoc(paymentRef, {
        type: 'transfer_to',
        category: 'transfer_to',
        source: 'treasury',
        destination: 'tutor_wallet',
        tutorId,
        tutorName,
        amount,
        customerTotal: amount,
        baseAmount: amount,
        status: 'PAID',
        description: notes || `Direct Transfer to Faculty Wallet (${tutorName})`,
        plan: 'Faculty Allocation',
        payerName: 'Platform Treasury',
        reference: `TRF-TUTOR-${Date.now()}`,
        paidAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // 3. Dispatch Notification to Tutor
      const notifRef = doc(collection(db, 'notifications'));
      await setDoc(notifRef, {
        recipientId: tutorId,
        title: 'Wallet Credit Received',
        message: `Platform Treasury credited ₦${amount.toLocaleString()} to your available wallet balance.`,
        type: 'WALLET_CREDIT',
        read: false,
        createdAt: serverTimestamp()
      });

      toast.success(`Successfully transferred ₦${amount.toLocaleString()} to ${tutorName}'s wallet.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer to tutor failed.');
      throw err;
    }
  };

  // Action: Disburse Bank Settlement
  const handleTreasuryDisbursal = async (payoutData: {
    destination: 'bank' | 'opay';
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    amount: number;
    fee: number;
    netAmount: number;
  }) => {
    try {
      await billingPost('wallet-withdraw', {
        action: 'admin_disburse',
        amount: payoutData.amount,
        bankCode: payoutData.bankCode,
        bankName: payoutData.bankName,
        accountNumber: payoutData.accountNumber,
        accountName: payoutData.accountName
      });
      toast.success(`Treasury disbursal of ₦${payoutData.amount.toLocaleString()} to ${payoutData.bankName} initiated!`);
      await load();
    } catch {
      // Fallback to Firestore record
      await setDoc(doc(collection(db, 'withdrawals')), {
        type: 'ADMIN_TREASURY_DISBURSAL',
        amount: payoutData.amount,
        fee: payoutData.fee,
        netAmount: payoutData.netAmount,
        bankCode: payoutData.bankCode,
        bankName: payoutData.bankName,
        accountNumber: payoutData.accountNumber,
        accountName: payoutData.accountName,
        status: 'completed',
        createdAt: serverTimestamp()
      });
      toast.success(`Disbursal recorded successfully in Platform Treasury.`);
      await load();
    }
  };

  // Action: Assign Tutor to Invoiced Payment
  const assignTutor = async (payment: any, tutorId: string) => {
    if (!tutorId) return;
    setSaving(payment.id);
    const tutor = (data.staff || []).find((s: any) => s.id === tutorId);
    const tutorName = tutor?.name || 'Assigned Tutor';

    try {
      // Update payment in Firestore
      if (payment.id) {
        await updateDoc(doc(db, 'payments', payment.id), {
          tutorId,
          tutorName,
          allocatedAt: serverTimestamp()
        }).catch(async () => {
          await setDoc(doc(db, 'payments', payment.id), {
            ...payment,
            tutorId,
            tutorName,
            allocatedAt: serverTimestamp()
          }, { merge: true });
        });
      }

      // Automatically credit tutor's wallet for this invoice
      const allocAmount = Number(payment.baseAmount || payment.customerTotal || payment.amount || 0);
      if (allocAmount > 0) {
        const walletRef = doc(db, 'staffWallets', tutorId);
        await setDoc(walletRef, {
          staffId: tutorId,
          staffName: tutorName,
          availableBalance: increment(allocAmount),
          lifetimeEarned: increment(allocAmount),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      toast.success(`Allocated invoice to ${tutorName} and credited faculty wallet.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to allocate tutor.');
    } finally {
      setSaving('');
    }
  };

  // Action: Open Comprehensive School Billing Workspace
  const openSchoolWorkspace = (school: any) => {
    setSelectedSchoolWorkspace(school);
    setActiveSchoolTab('config');
    setSchoolBillingConfig({
      baseAmount: school.billing?.baseAmount || 0,
      cycle: school.billing?.cycle || 'termly',
      mode: school.billing?.mode || 'advance_termly',
      nextDueDate: school.billing?.nextDueDate || '',
      allowedModes: Array.isArray(school.billing?.allowedModes) 
        ? school.billing.allowedModes 
        : ['advance_termly', 'advance_monthly', 'post_termly', 'post_monthly'],
      discountPercent: Number(school.billing?.discountPercent || 0),
      notes: school.billing?.notes || '',
      status: school.billing?.status || 'ACTIVE'
    });
    setOfflinePaymentDraft({
      amount: String(school.billing?.baseAmount || 0),
      reference: `TX-BANK-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().slice(0, 10),
      payerName: school.name || '',
      description: `Institutional workspace & Tuition Payment - ${school.name}`,
      notes: 'Direct Bank Settlement'
    });
  };

  // Action: Save Full School Billing Configuration
  const saveSchoolFullBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolWorkspace) return;
    setSaving('school-full');
    try {
      const schRef = doc(db, 'schools', selectedSchoolWorkspace.id);
      const cleanBaseAmount = Number(String(schoolBillingConfig.baseAmount || 0).replace(/[^0-9.]/g, '')) || 0;
      const updatedBilling = {
        ...(selectedSchoolWorkspace.billing || {}),
        baseAmount: cleanBaseAmount,
        cycle: schoolBillingConfig.cycle,
        mode: schoolBillingConfig.mode,
        nextDueDate: schoolBillingConfig.nextDueDate || '',
        allowedModes: schoolBillingConfig.allowedModes,
        discountPercent: Number(schoolBillingConfig.discountPercent || 0),
        notes: schoolBillingConfig.notes || '',
        status: schoolBillingConfig.status || 'ACTIVE',
        updatedAt: new Date().toISOString()
      };
      
      // 1. Update schools document with merge
      await setDoc(schRef, {
        billing: updatedBilling,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Sync to school user document if linked
      const adminUid = selectedSchoolWorkspace.adminUid || selectedSchoolWorkspace.firebaseUid;
      if (adminUid) {
        await setDoc(doc(db, 'users', adminUid), {
          schoolId: selectedSchoolWorkspace.id,
          billing: updatedBilling,
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(err => console.warn('School user billing sync notice:', err));
      }

      // 3. Post to backend endpoint to keep function data synchronized
      billingPost('billing-admin', {
        action: 'set_school_billing',
        schoolId: selectedSchoolWorkspace.id,
        baseAmount: cleanBaseAmount,
        cycle: schoolBillingConfig.cycle,
        allowedModes: schoolBillingConfig.allowedModes,
        mode: schoolBillingConfig.mode,
        nextDueDate: schoolBillingConfig.nextDueDate || '',
        status: schoolBillingConfig.status || 'ACTIVE',
        notes: schoolBillingConfig.notes || ''
      }).catch(pErr => console.debug('Background billing post notice:', pErr));

      toast.success(`Billing configuration updated for ${selectedSchoolWorkspace.name}.`);
      setSelectedSchoolWorkspace({
        ...selectedSchoolWorkspace,
        billing: updatedBilling
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save school billing.');
    } finally {
      setSaving('');
    }
  };

  // Action: Record Offline Bank Settlement for School
  const handleRecordSchoolOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolWorkspace) return;
    setSaving('record-offline');
    try {
      const payAmount = Number(offlinePaymentDraft.amount);
      if (!payAmount || payAmount <= 0) {
        toast.error('Please specify a valid payment amount.');
        return;
      }

      const txRef = offlinePaymentDraft.reference.trim() || `TX-OFFLINE-${Date.now()}`;
      const paymentRecord = {
        schoolId: selectedSchoolWorkspace.id,
        schoolName: selectedSchoolWorkspace.name,
        payerName: offlinePaymentDraft.payerName || selectedSchoolWorkspace.name,
        payerEmail: selectedSchoolWorkspace.contactEmail || selectedSchoolWorkspace.email || '',
        amount: payAmount,
        customerTotal: payAmount,
        baseAmount: payAmount,
        transactionFee: 0,
        type: 'inflow',
        category: 'school_tuition',
        status: 'PAID',
        method: 'bank_transfer',
        channel: 'bank_transfer',
        reference: txRef,
        description: offlinePaymentDraft.description || `Institutional Tuition - ${selectedSchoolWorkspace.name}`,
        notes: offlinePaymentDraft.notes,
        paidAt: offlinePaymentDraft.date ? new Date(offlinePaymentDraft.date).toISOString() : new Date().toISOString(),
        createdAt: serverTimestamp()
      };

      // Save to payments collection
      await setDoc(doc(db, 'payments', txRef), paymentRecord);

      // Also record in school doc
      const currentSchoolPayments = Array.isArray(selectedSchoolWorkspace.billing?.payments) 
        ? selectedSchoolWorkspace.billing.payments 
        : [];
      
      const updatedBilling = {
        ...(selectedSchoolWorkspace.billing || {}),
        lastPaymentDate: paymentRecord.paidAt,
        lastPaymentAmount: payAmount,
        status: 'PAID',
        payments: [paymentRecord, ...currentSchoolPayments]
      };

      await updateDoc(doc(db, 'schools', selectedSchoolWorkspace.id), {
        billing: updatedBilling,
        updatedAt: serverTimestamp()
      });

      toast.success(`Offline bank payment of ${formatNaira(payAmount)} successfully recorded for ${selectedSchoolWorkspace.name}!`);
      
      // Reset draft
      setOfflinePaymentDraft({
        amount: String(selectedSchoolWorkspace.billing?.baseAmount || 0),
        reference: `TX-BANK-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().slice(0, 10),
        payerName: selectedSchoolWorkspace.name,
        description: `Institutional workspace & Tuition Payment - ${selectedSchoolWorkspace.name}`,
        notes: 'Direct Bank Settlement'
      });

      setSelectedSchoolWorkspace({
        ...selectedSchoolWorkspace,
        billing: updatedBilling
      });

      await load();
    } catch (err: any) {
      toast.error('Failed to record bank settlement: ' + err.message);
    } finally {
      setSaving('');
    }
  };

  // Action: Save School Quick Billing
  const saveSchoolQuickBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchoolBilling) return;
    setSaving('school-quick');
    try {
      const schRef = doc(db, 'schools', editingSchoolBilling.id);
      const cleanBaseAmount = Number(String(editingSchoolBilling.billing?.baseAmount || 0).replace(/[^0-9.]/g, '')) || 0;
      const updatedBilling = {
        ...(editingSchoolBilling.billing || {}),
        baseAmount: cleanBaseAmount,
        updatedAt: new Date().toISOString()
      };
      await setDoc(schRef, {
        billing: updatedBilling,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const adminUid = editingSchoolBilling.adminUid || editingSchoolBilling.firebaseUid;
      if (adminUid) {
        await setDoc(doc(db, 'users', adminUid), {
          schoolId: editingSchoolBilling.id,
          billing: updatedBilling,
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(err => console.warn('School user billing sync notice:', err));
      }

      billingPost('billing-admin', {
        action: 'set_school_billing',
        schoolId: editingSchoolBilling.id,
        baseAmount: cleanBaseAmount,
        cycle: updatedBilling.cycle || 'termly',
        allowedModes: updatedBilling.allowedModes || ['advance_termly', 'advance_monthly'],
        mode: updatedBilling.mode || 'advance_termly',
        nextDueDate: updatedBilling.nextDueDate || '',
        status: updatedBilling.status || 'ACTIVE',
        notes: updatedBilling.notes || ''
      }).catch(pErr => console.debug('Background billing post notice:', pErr));

      toast.success(`Billing settings for ${editingSchoolBilling.name} saved.`);
      setEditingSchoolBilling(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update school billing.');
    } finally {
      setSaving('');
    }
  };

  // Action: Send School Payment Reminder
  const sendSchoolReminder = async (school: any) => {
    setSaving(`reminder-${school.id}`);
    try {
      await billingPost('billing-admin', {
        action: 'send_payment_reminder',
        targetType: 'SCHOOL',
        targetId: school.id,
        recipientId: school.adminUid || school.id,
        email: school.contactEmail || school.email,
        amount: school.billing?.baseAmount || 0,
        nextDueDate: school.billing?.nextDueDate,
        title: `Tuition & workspace Subscription Due - ${school.name}`
      });
      toast.success(`Payment reminder issued to ${school.name}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to dispatch payment reminder.');
    } finally {
      setSaving('');
    }
  };

  // Action: Edit & Save Standard Plan
  const editPlan = (p: Plan) => {
    setSelectedPlan(p.id);
    setPlanDraft({
      name: p.name || '',
      baseAmount: String(p.baseAmount ?? ''),
      durationWeeks: String(p.durationWeeks ?? ''),
      teachingModes: Array.isArray(p.teachingModes) ? p.teachingModes.join(', ') : ''
    });
  };

  const savePlan = async () => {
    if (!selectedPlan) return;
    setSaving('plan');
    try {
      await billingPost('billing-admin', {
        action: 'update_plan',
        planId: selectedPlan,
        name: planDraft.name,
        baseAmount: Number(planDraft.baseAmount),
        durationWeeks: Number(planDraft.durationWeeks),
        teachingModes: planDraft.teachingModes.split(',').map(s => s.trim()).filter(Boolean)
      });
      toast.success('Payment plan updated.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to save plan.');
    } finally {
      setSaving('');
    }
  };

  // Action: Save Fee Policy
  const saveFee = async (policyRole: 'parent' | 'school', policy: Policy) => {
    setSaving(policyRole);
    try {
      await billingPost('billing-admin', {
        action: 'update_fee_policy',
        role: policyRole,
        percentage: Number(policy.percentage),
        flat: Number(policy.flat),
        cap: Number(policy.cap),
        waiveFlatBelow: Number(policy.waiveFlatBelow),
        enabled: policy.enabled
      });
      toast.success('Transaction fee policy updated.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to save fee policy.');
    } finally {
      setSaving('');
    }
  };

  // Action: Save Withdrawal Policy & Minimum Threshold
  const saveWithdrawalFee = async () => {
    setSaving('withdrawal-fee');
    try {
      await billingPost('billing-admin', {
        action: 'set_withdrawal_fee_policy',
        percentage: Number(withdrawalPolicy.percentage),
        flat: Number(withdrawalPolicy.flat),
        cap: Number(withdrawalPolicy.cap),
        enabled: withdrawalPolicy.enabled
      });
      toast.success('Withdrawal fee policy updated.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to save withdrawal policy.');
    } finally {
      setSaving('');
    }
  };

  const saveMinimum = async () => {
    setSaving('minimum');
    try {
      await billingPost('billing-admin', {
        action: 'set_minimum_withdrawal',
        amount: Number(minimumWithdrawal)
      });
      toast.success('Minimum withdrawal threshold saved.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to save threshold.');
    } finally {
      setSaving('');
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col justify-center items-center text-xs text-slate-500 gap-3">
        <Loader2 className="animate-spin text-sky-600" size={24} />
        <span className="font-bold tracking-wide">Loading Financial Operations & Treasury...</span>
      </div>
    );
  }

  const renderViewContent = () => {
    // SUB-VIEW: Transaction History Page
    if (activeView === 'transactions') {
    return (
      <div className="space-y-6">
        <SEO title="Verified Transactions Ledger | Admin" description="Complete verified platform statement records." noindex={true} />
        
        {/* Back Navigation Banner */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setActiveView('hub')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
            <span>Back to Financial Operations</span>
          </button>
          
          <div className="text-xs text-slate-500 font-mono">
            Total Records: <strong className="text-slate-900 dark:text-white">{paid.length}</strong>
          </div>
        </div>

        <FintechTransactionHistory 
          transactions={formattedTransactions} 
          title="Verified Transactions & Platform Invoices"
          role="admin"
          showBack={true}
          onBack={() => setActiveView('hub')}
          emptyMessage="No verified student, parent, or partner school payments on file"
        />
      </div>
    );
  }

  // SUB-VIEW: Monthly Breakdown Page
  if (activeView === 'monthly') {
    return (
      <div className="space-y-6">
        <SEO title="Monthly Financial Breakdown | Admin" description="Platform gross, fees, tutor allocations and net yield." noindex={true} />
        
        {/* Back Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setActiveView('hub')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
            <span>Back to Financial Operations</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              if (formattedTransactions.length > 0) {
                generatePdfReceipt(formattedTransactions[0]);
                toast.success('Generated official financial statement PDF');
              }
            }}
            className="min-h-9 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs inline-flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Download size={14} /> Export Summary PDF
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Monthly Financial Breakdown</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Historical monthly gross volume, gateway deductions, faculty disbursements, and net revenue yield.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 text-xs font-mono font-bold">
              12-Month Window
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                  <th className="p-3.5 text-left">Month</th>
                  <th className="p-3.5 text-left">Transactions</th>
                  <th className="p-3.5 text-left">Gross Collections</th>
                  <th className="p-3.5 text-left">Gateway Fees</th>
                  <th className="p-3.5 text-left">Tutor Allocations</th>
                  <th className="p-3.5 text-left">Staff Payouts</th>
                  <th className="p-3.5 text-left">Platform Net Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {monthly.length ? (
                  monthly.map((m: any) => (
                    <tr key={m.month} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar size={14} className="text-sky-500" />
                        <span>{m.month}</span>
                      </td>
                      <td className="p-3.5 font-mono">{m.transactions} txns</td>
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">{money(m.gross)}</td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">{money(m.gatewayFees)}</td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">{money(m.tutorAllocated)}</td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">{money(m.withdrawals)}</td>
                      <td className="p-3.5 font-mono font-black text-emerald-600 dark:text-emerald-400">{money(m.platformRevenue)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400">No monthly financial records logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // SUB-VIEW: Partner School Billings Page
  if (activeView === 'schools') {
    // If a school is selected for full workspace management
    if (selectedSchoolWorkspace) {
      const sch = selectedSchoolWorkspace;
      const schoolDisplayName = sch.name || sch.schoolName || sch.institutionName || sch.contactEmail?.split('@')[0] || sch.email?.split('@')[0] || 'Partner Institution';
      const safeLower = schoolDisplayName.toLowerCase();
      const schoolPrograms = Array.isArray(sch.programs) ? sch.programs : [];
      
      // Calculate Faculty Payouts for this school's programs
      let totalFacultyPayout = 0;
      schoolPrograms.forEach((p: any) => {
        if (Array.isArray(p.tutorAssignments) && p.tutorAssignments.length > 0) {
          p.tutorAssignments.forEach((ta: any) => {
            totalFacultyPayout += Number(ta.payoutRate || 0);
          });
        } else if (p.tutorPayoutRate) {
          totalFacultyPayout += Number(p.tutorPayoutRate || 0);
        }
      });

      const invoicedFee = Number(schoolBillingConfig.baseAmount || sch.billing?.baseAmount || 0);
      const institutionalMargin = invoicedFee - totalFacultyPayout;

      // Filter payments specific to this school
      const schoolPayments = (data.payments || []).filter((p: any) => 
        p.schoolId === sch.id || 
        (p.description && String(p.description).toLowerCase().includes(safeLower)) ||
        (p.payerName && String(p.payerName).toLowerCase().includes(safeLower))
      );

      return (
        <div className="space-y-6">
          <SEO title={`Billing Workspace: ${schoolDisplayName} | Admin`} description="School custom billing, faculty margin allocations, and offline settlements." noindex={true} />

          {/* Top Bar: Back navigation & actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedSchoolWorkspace(null)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs self-start"
            >
              <ArrowLeft size={16} />
              <span>Back to All Partner Schools</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving === `reminder-${sch.id}`}
                onClick={() => void sendSchoolReminder(sch)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-black dark:hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-xs"
              >
                {saving === `reminder-${sch.id}` ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                <span>Send Payment Notice</span>
              </button>
            </div>
          </div>

          {/* School Banner Card */}
          <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 flex items-center justify-center font-black text-xl shadow-xs">
                <Building2 size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
                    {sch.name}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                    {sch.status || 'Active Partner'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span>Code: <strong className="font-mono text-slate-700 dark:text-slate-300">{sch.code || sch.id}</strong></span>
                  {sch.contactEmail && <span>• Email: {sch.contactEmail}</span>}
                  {sch.contactPhone && <span>• Phone: {sch.contactPhone}</span>}
                  <span>• Active Tracks: <strong className="text-slate-700 dark:text-slate-300">{schoolPrograms.length}</strong></span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-right min-w-[150px]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Current Invoiced Fee</div>
                <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-0.5">
                  {formatNaira(invoicedFee)}
                </div>
                <div className="text-[10px] text-slate-500 capitalize">{schoolBillingConfig.cycle} • {schoolBillingConfig.mode.replace('_', ' ')}</div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setActiveSchoolTab('config')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSchoolTab === 'config'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Sliders size={14} />
              <span>Billing &amp; Custom Fees</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSchoolTab('margin')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSchoolTab === 'margin'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <TrendingUp size={14} />
              <span>Programmes &amp; Faculty Margin</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSchoolTab('record_payment')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSchoolTab === 'record_payment'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Plus size={14} />
              <span>Record Bank Settlement</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSchoolTab('invoices')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSchoolTab === 'invoices'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <FileText size={14} />
              <span>Payment History &amp; Receipts ({schoolPayments.length})</span>
            </button>
          </div>

          {/* TAB 1: Billing & Custom Fees Configuration */}
          {activeSchoolTab === 'config' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders size={18} className="text-sky-500" />
                  <span>school fee &amp; Billing Cycle Settings</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Configure custom contract base fees, billing cadence, payment options, and termly discounts for {sch.name}.
                </p>
              </div>

              <form onSubmit={saveSchoolFullBilling} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Base Invoiced Fee (₦ NGN) <span className="text-brand-red">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={5000}
                      value={schoolBillingConfig.baseAmount}
                      onChange={e => setSchoolBillingConfig({ ...schoolBillingConfig, baseAmount: Number(e.target.value) })}
                      className={inputClass}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Contract base amount per billing cycle</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Billing Cycle Frequency
                    </label>
                    <select
                      value={schoolBillingConfig.cycle}
                      onChange={e => setSchoolBillingConfig({ ...schoolBillingConfig, cycle: e.target.value })}
                      className={inputClass}
                    >
                      <option value="termly">Termly (12 Weeks Academic Cycle)</option>
                      <option value="monthly">Monthly (4 Weeks Cycle)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Recurrence frequency for invoicing</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Default Payment Mode
                    </label>
                    <select
                      value={schoolBillingConfig.mode}
                      onChange={e => setSchoolBillingConfig({ ...schoolBillingConfig, mode: e.target.value })}
                      className={inputClass}
                    >
                      <option value="advance_termly">Advance Termly (Beginning of Term)</option>
                      <option value="advance_monthly">Advance Monthly (Beginning of Month)</option>
                      <option value="post_termly">Post Termly (End of Term)</option>
                      <option value="post_monthly">Post Monthly (End of Month)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Default payment timing structure</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Next Billing Due Date
                    </label>
                    <input
                      type="date"
                      value={schoolBillingConfig.nextDueDate}
                      onChange={e => setSchoolBillingConfig({ ...schoolBillingConfig, nextDueDate: e.target.value })}
                      className={inputClass}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Date when the next invoice must be settled</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Institutional Discount (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={schoolBillingConfig.discountPercent}
                      onChange={e => setSchoolBillingConfig({ ...schoolBillingConfig, discountPercent: Number(e.target.value) })}
                      className={inputClass}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Special concession or multi-campus discount</p>
                  </div>
                </div>

                {/* Allowed Payment Modes Selection */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                  <label className="block text-[11px] font-black uppercase text-slate-600 dark:text-slate-300">
                    Allowed Payment Options for School Administrator
                  </label>
                  <p className="text-xs text-slate-500">
                    Select which payment options are accessible on the School Administrator's portal checkout.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                    {[
                      { key: 'advance_termly', label: 'Advance Termly' },
                      { key: 'advance_monthly', label: 'Advance Monthly' },
                      { key: 'post_termly', label: 'Post Termly' },
                      { key: 'post_monthly', label: 'Post Monthly' }
                    ].map(opt => {
                      const isChecked = schoolBillingConfig.allowedModes.includes(opt.key);
                      return (
                        <label key={opt.key} className="flex items-center gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-sky-500 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSchoolBillingConfig({
                                  ...schoolBillingConfig,
                                  allowedModes: [...schoolBillingConfig.allowedModes, opt.key]
                                });
                              } else {
                                setSchoolBillingConfig({
                                  ...schoolBillingConfig,
                                  allowedModes: schoolBillingConfig.allowedModes.filter(m => m !== opt.key)
                                });
                              }
                            }}
                            className="rounded text-sky-600 focus:ring-sky-500"
                          />
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Billing Notes & Special Terms */}
                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                    Contract Terms &amp; Billing Notes
                  </label>
                  <textarea
                    rows={3}
                    value={schoolBillingConfig.notes}
                    onChange={e => setSchoolBillingConfig({ ...schoolBillingConfig, notes: e.target.value })}
                    placeholder="Enter contractual terms, workspace equipment provisioning terms, or renewal conditions..."
                    className={inputClass}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving === 'school-full'}
                    className="min-h-11 px-6 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black inline-flex items-center gap-2 shadow-md shadow-sky-600/20"
                  >
                    {saving === 'school-full' ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    <span>Save Institutional Billing Settings</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Programmes & Faculty Margin Breakdown */}
          {activeSchoolTab === 'margin' && (
            <div className="space-y-6">
              {/* 4 Financial Margin Metric Blocks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <DollarSign size={16} className="text-sky-500" />
                    <span>School Invoiced Fee</span>
                  </div>
                  <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
                    {formatNaira(invoicedFee)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Configured contract revenue</p>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <Users size={16} className="text-purple-500" />
                    <span>Total Faculty Payout</span>
                  </div>
                  <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mt-2">
                    {formatNaira(totalFacultyPayout)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Assigned tutor compensation</p>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <TrendingUp size={16} className="text-emerald-500" />
                    <span>Net Institutional Margin</span>
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                    {formatNaira(institutionalMargin)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {invoicedFee > 0 ? `${Math.round((institutionalMargin / invoicedFee) * 100)}% margin surplus` : '0% margin'}
                  </p>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <School size={16} className="text-brand-red" />
                    <span>Active Technology Tracks</span>
                  </div>
                  <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
                    {schoolPrograms.length}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Undergoing workspace programmes</p>
                </div>
              </div>

              {/* Active Programmes & Faculty Allocation Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Undergoing Programmes &amp; Assigned Instructors
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Review all Technology tracks deployed at {sch.name}, along with the faculty instructors and payout rates allocated.
                    </p>
                  </div>

                  <Link
                    to="/admin/schools"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span>Manage in School Directory</span>
                    <ExternalLink size={13} />
                  </Link>
                </div>

                {schoolPrograms.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-xs">
                    No active programmes currently registered for this school.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                          <th className="py-3 px-3">Programme Track</th>
                          <th className="py-3 px-3">Assigned Faculty Tutors</th>
                          <th className="py-3 px-3">Schedule / Delivery</th>
                          <th className="py-3 px-3 text-right">Faculty Payout</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {schoolPrograms.map((p: any, idx: number) => {
                          const tutorAssignments = Array.isArray(p.tutorAssignments) && p.tutorAssignments.length > 0
                            ? p.tutorAssignments
                            : p.tutorId ? [{ tutorId: p.tutorId, tutorName: p.tutorName || 'Primary Tutor', role: 'Lead Instructor', payoutRate: p.tutorPayoutRate || 0 }] : [];

                          const programPayout = tutorAssignments.reduce((acc: number, item: any) => acc + Number(item.payoutRate || 0), 0);

                          return (
                            <tr key={p.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-3">
                                <div className="font-bold text-slate-900 dark:text-white">{p.name || 'Technology Programme Track'}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{p.code || `PROG-${idx + 1}`}</div>
                              </td>
                              <td className="py-3.5 px-3">
                                {tutorAssignments.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {tutorAssignments.map((ta: any, tidx: number) => (
                                      <span key={tidx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold text-[10px]">
                                        <UserCheck size={10} />
                                        {ta.tutorName}
                                        <span className="text-[9px] text-purple-500 dark:text-purple-400 font-normal">({ta.role || 'Instructor'})</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="italic text-slate-400">No tutors assigned</span>
                                )}
                              </td>
                              <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 capitalize">
                                {p.schedule || p.mode || 'Weekly Physical workspace'}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                                {formatNaira(programPayout)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Record Direct / Offline Settlement */}
          {activeSchoolTab === 'record_payment' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard size={18} className="text-emerald-500" />
                  <span>Record Direct Bank Settlement / Offline Payment</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Log a manual institutional wire transfer, cash settlement, or cheque received from {sch.name}. This will update the school billing status and generate an official receipt.
                </p>
              </div>

              <form onSubmit={handleRecordSchoolOfflinePayment} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Amount Paid (₦ NGN) <span className="text-brand-red">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1000}
                      step={1000}
                      value={offlinePaymentDraft.amount}
                      onChange={e => setOfflinePaymentDraft({ ...offlinePaymentDraft, amount: e.target.value })}
                      className={inputClass}
                      placeholder="Enter amount"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Bank Transfer Reference / Cheque No. <span className="text-brand-red">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={offlinePaymentDraft.reference}
                      onChange={e => setOfflinePaymentDraft({ ...offlinePaymentDraft, reference: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. GTB-NIP-993821039"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={offlinePaymentDraft.date}
                      onChange={e => setOfflinePaymentDraft({ ...offlinePaymentDraft, date: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Payer / Depositor Name
                    </label>
                    <input
                      type="text"
                      value={offlinePaymentDraft.payerName}
                      onChange={e => setOfflinePaymentDraft({ ...offlinePaymentDraft, payerName: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. St. Gregory College Bursary"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      Payment Purpose / Description
                    </label>
                    <input
                      type="text"
                      value={offlinePaymentDraft.description}
                      onChange={e => setOfflinePaymentDraft({ ...offlinePaymentDraft, description: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. First Term 2026 Technology & Hardware & Electronics workspace Subscription"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                    Internal Verification Notes
                  </label>
                  <textarea
                    rows={2}
                    value={offlinePaymentDraft.notes}
                    onChange={e => setOfflinePaymentDraft({ ...offlinePaymentDraft, notes: e.target.value })}
                    placeholder="Verified with Zenith Bank statement / Bursar confirmation..."
                    className={inputClass}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving === 'record-offline'}
                    className="min-h-11 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black inline-flex items-center gap-2 shadow-md shadow-emerald-600/20"
                  >
                    {saving === 'record-offline' ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    <span>Record Payment &amp; Issue Receipt</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: Invoices & Payment History Ledger */}
          {activeSchoolTab === 'invoices' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Institutional Payments &amp; Invoices Ledger
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Complete verifiable record of all payments, online receipts, and bank settlements logged for {sch.name}.
                  </p>
                </div>
              </div>

              {schoolPayments.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs">
                  No payment records found for {sch.name}. You can record a payment in the "Record Bank Settlement" tab.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[750px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Reference</th>
                        <th className="py-3 px-3">Description</th>
                        <th className="py-3 px-3">Method</th>
                        <th className="py-3 px-3">Amount</th>
                        <th className="py-3 px-3 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {schoolPayments.map((p: any) => {
                        const receiptData: TransactionReceiptData = {
                          id: p.id || p.reference || 'TX-INST',
                          transactionNo: p.reference || p.id,
                          reference: p.reference || p.id,
                          type: 'inflow',
                          description: p.description || `Tuition Payment - ${sch.name}`,
                          category: 'school_tuition',
                          amount: Number(p.amount || p.customerTotal || 0),
                          customerTotal: Number(p.amount || p.customerTotal || 0),
                          baseAmount: Number(p.amount || p.baseAmount || 0),
                          status: p.status || 'PAID',
                          paymentMethod: p.method || 'bank_transfer',
                          payerName: p.payerName || sch.name,
                          payerEmail: p.payerEmail || sch.contactEmail,
                          schoolName: sch.name,
                          paidAt: p.paidAt || p.createdAt || new Date().toISOString()
                        };

                        return (
                          <tr key={p.id || p.reference} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                              {dateLabel(p.paidAt || p.date || p.createdAt)}
                            </td>
                            <td className="py-3.5 px-3 font-mono text-slate-700 dark:text-slate-300 font-bold">
                              {p.reference || p.id}
                            </td>
                            <td className="py-3.5 px-3 text-slate-800 dark:text-slate-200">
                              <div className="font-bold">{p.description || 'Institutional Tuition'}</div>
                              <div className="text-[10px] text-slate-400">{p.payerName || sch.name}</div>
                            </td>
                            <td className="py-3.5 px-3 uppercase text-[10px] font-black text-slate-500">
                              {p.method || p.channel || 'Bank Transfer'}
                            </td>
                            <td className="py-3.5 px-3 font-mono font-black text-emerald-600 dark:text-emerald-400">
                              {money(p.amount || p.customerTotal)}
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => generatePdfReceipt(receiptData)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-colors"
                              >
                                <Download size={12} />
                                <span>PDF Receipt</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // MAIN PARTNER SCHOOLS LIST (When no school is selected for deep workspace)
    const filteredSchools = schools.filter((sch: any) => {
      const q = schoolSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        (sch.name && sch.name.toLowerCase().includes(q)) ||
        (sch.code && sch.code.toLowerCase().includes(q)) ||
        (sch.contactEmail && sch.contactEmail.toLowerCase().includes(q)) ||
        (sch.email && sch.email.toLowerCase().includes(q))
      );
    });

    const totalSchoolInvoicedVolume = schools.reduce((acc: number, sch: any) => {
      return acc + Number(sch.billing?.baseAmount || 0);
    }, 0);

    return (
      <div className="space-y-6">
        <SEO title="Partner School Billings &amp; Custom Fees | Admin" description="Manage school institutional subscriptions, custom fees, and renewal schedules." noindex={true} />
        
        {/* Back Navigation & Summary Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveView('hub')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs self-start"
          >
            <ArrowLeft size={16} />
            <span>Back to Financial Operations</span>
          </button>
          
          <div className="text-xs text-slate-500">
            Total Partner Schools: <strong className="text-slate-900 dark:text-white">{schools.length}</strong>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <School size={16} className="text-brand-red" />
              <span>Partner Institutions</span>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
              {schools.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Active school subscriptions</p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <DollarSign size={16} className="text-emerald-500" />
              <span>Institutional Billing Volume</span>
            </div>
            <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-2">
              {formatNaira(totalSchoolInvoicedVolume)}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Total contracted revenue base</p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <Layers size={16} className="text-sky-500" />
              <span>Deployed Technology Tracks</span>
            </div>
            <div className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400 mt-2">
              {schools.reduce((acc: number, s: any) => acc + (s.programs?.length || 0), 0)}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Active curriculum programmes</p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <CheckCircle2 size={16} className="text-purple-500" />
              <span>Verified Billing Contracts</span>
            </div>
            <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mt-2">
              {schools.filter((s: any) => Number(s.billing?.baseAmount) > 0).length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Schools with custom fee profile</p>
          </div>
        </div>

        {/* Schools List & Workspace Hub */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Partner School Custom Billing Management</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage partner school custom fees, termly billing schedules, faculty margin allocations, and direct bank settlements.
              </p>
            </div>

            <div className="relative min-w-[240px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={schoolSearchQuery}
                onChange={(e) => setSchoolSearchQuery(e.target.value)}
                placeholder="Search school name, code, email..."
                className="w-full pl-9 pr-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[850px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                  <th className="py-3 px-3">School Name &amp; Code</th>
                  <th className="py-3 px-3">Active Programmes</th>
                  <th className="py-3 px-3">Configured Fee (₦)</th>
                  <th className="py-3 px-3">Cycle &amp; Mode</th>
                  <th className="py-3 px-3">Next Due Date</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredSchools.length > 0 ? (
                  filteredSchools.map(sch => {
                    const progCount = sch.programs?.length || 0;
                    const baseFee = Number(sch.billing?.baseAmount || 0);
                    const cycle = sch.billing?.cycle || 'termly';
                    const mode = sch.billing?.mode || 'advance_termly';
                    const nextDueDate = sch.billing?.nextDueDate;

                    return (
                      <tr key={sch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">{sch.name}</div>
                          <div className="text-[11px] text-slate-400">{sch.contactEmail || sch.email} {sch.code ? `• ${sch.code}` : ''}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-50 text-sky-600 dark:bg-sky-950/40">
                            {progCount} Tracks
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono font-black text-slate-900 dark:text-white">
                          {baseFee > 0 ? (
                            formatNaira(baseFee)
                          ) : (
                            <span className="text-slate-400 font-medium italic">Not Configured (₦0)</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 capitalize text-slate-600 dark:text-slate-400">
                          {cycle} • {mode.replace('_', ' ')}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 font-mono">
                          {nextDueDate ? new Date(nextDueDate).toLocaleDateString('en-NG') : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openSchoolWorkspace(sch)}
                              className="min-h-8 px-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                            >
                              <Settings size={13} />
                              <span>Manage Billing &amp; Fees</span>
                            </button>
                            <button
                              type="button"
                              disabled={saving === `reminder-${sch.id}`}
                              onClick={() => void sendSchoolReminder(sch)}
                              className="min-h-8 px-3 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-[11px] font-black inline-flex items-center gap-1 transition-colors"
                            >
                              {saving === `reminder-${sch.id}` ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
                              <span>Send Notice</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400">
                      No partner schools found matching the search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // SUB-VIEW: Tutor Allocations & Disbursals Page
  if (activeView === 'tutors') {
    const tutorsList = data.staff || [];

    return (
      <div className="space-y-6">
        <SEO title="Tutor Allocations & Wallet Disbursals | Admin" description="Assign invoices to faculty and manage teaching credits." noindex={true} />
        
        {/* Back Navigation & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveView('hub')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
            <span>Back to Financial Operations</span>
          </button>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDefaultAllocTutorId(undefined);
                setDefaultAllocSchoolId(undefined);
                setIsTutorAllocModalOpen(true);
              }}
              className="min-h-9 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-black dark:hover:bg-slate-700 text-white font-black text-xs inline-flex items-center gap-1.5 transition-all shadow-sm"
            >
              <School size={14} /> Allocate Tutor to Partner School &amp; Fee
            </button>
            <button
              type="button"
              onClick={() => setIsTransferToTutorOpen(true)}
              className="min-h-9 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs inline-flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Send size={14} /> Transfer to Tutor Wallet
            </button>
          </div>
        </div>

        {/* Faculty Tutors & School Allocation Matrix */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Users size={20} className="text-sky-500" />
                <span>Faculty Tutors &amp; Institutional Allocations</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign faculty mentors to specific partner schools, manage customized teaching stipends, and credit their wallets.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
              {tutorsList.length} Active Instructors
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[850px] w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                  <th className="p-3.5 text-left">Faculty Instructor</th>
                  <th className="p-3.5 text-left">Role / Designation</th>
                  <th className="p-3.5 text-left">Allocated Schools &amp; Tracks</th>
                  <th className="p-3.5 text-left">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {tutorsList.length ? (
                  tutorsList.map((tutor: any) => {
                    // Find all school programs where this tutor is assigned
                    const assignedPrograms: Array<{ schoolName: string; programName: string; payoutRate: number; payoutType: string }> = [];
                    schools.forEach(sch => {
                      if (Array.isArray(sch.programs)) {
                        sch.programs.forEach((prog: any) => {
                          if (prog.tutorId === tutor.id) {
                            assignedPrograms.push({
                              schoolName: sch.name,
                              programName: prog.name,
                              payoutRate: Number(prog.tutorPayoutRate || 0),
                              payoutType: prog.payoutType || 'per_term'
                            });
                          } else if (Array.isArray(prog.tutorAssignments)) {
                            prog.tutorAssignments.forEach((ta: any) => {
                              if (ta.tutorId === tutor.id) {
                                assignedPrograms.push({
                                  schoolName: sch.name,
                                  programName: ta.programName || prog.name,
                                  payoutRate: Number(ta.payoutRate || 0),
                                  payoutType: ta.payoutType || 'per_term'
                                });
                              }
                            });
                          }
                        });
                      }
                    });

                    return (
                      <tr key={tutor.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 dark:text-white">{tutor.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{tutor.email}</div>
                        </td>
                        <td className="p-3.5 capitalize font-semibold text-slate-600 dark:text-slate-300">
                          {tutor.role || 'Faculty Tutor'}
                        </td>
                        <td className="p-3.5">
                          {assignedPrograms.length > 0 ? (
                            <div className="space-y-1">
                              {assignedPrograms.map((ap, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{ap.schoolName}:</span>
                                  <span className="text-slate-500">{ap.programName}</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    ({formatCurrency(ap.payoutRate)})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No schools assigned yet</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                            {tutor.accountStatus || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setDefaultAllocTutorId(tutor.id);
                                setIsTutorAllocModalOpen(true);
                              }}
                              className="min-h-8 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 text-[11px] font-bold inline-flex items-center gap-1 border border-sky-200 dark:border-sky-800"
                            >
                              <School size={12} />
                              <span>Allocate School &amp; Fee</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsTransferToTutorOpen(true)}
                              className="min-h-8 px-3 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-[11px] font-black inline-flex items-center gap-1"
                            >
                              <Send size={12} />
                              <span>Send Funds</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">No active faculty instructors registered.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoice Allocation Ledger */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Tutor Allocation by Invoice</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assign verified student enrollments directly to active instructors and automatically credit their wallet balance.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[850px] w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                  <th className="p-3.5 text-left">Date</th>
                  <th className="p-3.5 text-left">Reference / Plan</th>
                  <th className="p-3.5 text-left">Student / Institution</th>
                  <th className="p-3.5 text-left">Amount</th>
                  <th className="p-3.5 text-left">Assigned Tutor</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paid.length ? (
                  paid.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 text-slate-500 whitespace-nowrap font-mono">{dateLabel(p.paidAt)}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{p.plan || p.paymentPlanName || 'Subscription'}</div>
                        <div className="text-[10px] font-mono text-slate-400">{p.reference || p.id}</div>
                      </td>
                      <td className="p-3.5 text-slate-700 dark:text-slate-300">
                        {p.studentName || p.enrollmentStudentName || p.schoolName || 'Institutional Account'}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(p.customerTotal || p.amount || 0)}
                      </td>
                      <td className="p-3.5 font-semibold">
                        {p.tutorName || (p.tutorId ? 'Assigned' : 'Unassigned')}
                      </td>
                      <td className="p-3.5 text-right">
                        {p.tutorId ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs">
                            <CheckCircle2 size={14} /> Credited
                          </span>
                        ) : (
                          <select 
                            defaultValue="" 
                            disabled={saving === p.id} 
                            onChange={e => void assignTutor(p, e.target.value)} 
                            className="min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                          >
                            <option value="">Assign &amp; Credit Tutor</option>
                            {(data.staff || []).map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">No verified payments on file to allocate.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // SUB-VIEW: Fee Policies & Standard Plans Page
  if (activeView === 'policies') {
    return (
      <div className="space-y-6">
        <SEO title="Fee Policies & Standard Plans | Admin" description="Platform transaction fees, withdrawal policies and pricing plans." noindex={true} />
        
        {/* Back Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setActiveView('hub')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
            <span>Back to Financial Operations</span>
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PolicyCard 
              title="Parent Transaction Fee Policy" 
              policy={parentPolicy} 
              setPolicy={setParentPolicy} 
              saving={saving === 'parent'} 
              onSave={() => void saveFee('parent', parentPolicy)} 
            />
            <PolicyCard 
              title="School Transaction Fee Policy" 
              policy={schoolPolicy} 
              setPolicy={setSchoolPolicy} 
              saving={saving === 'school'} 
              onSave={() => void saveFee('school', schoolPolicy)} 
            />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-base text-slate-900 dark:text-white">Staff Withdrawal Service Fee</h2>
            <p className="text-xs text-slate-500 mt-1">Deducted from tutor gross withdrawal before payout.</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
              <input type="number" step="0.01" value={withdrawalPolicy.percentage} onChange={e => setWithdrawalPolicy({ ...withdrawalPolicy, percentage: e.target.value })} placeholder="Percent %" className={inputClass} />
              <input type="number" value={withdrawalPolicy.flat} onChange={e => setWithdrawalPolicy({ ...withdrawalPolicy, flat: e.target.value })} placeholder="Flat fee (₦)" className={inputClass} />
              <input type="number" value={withdrawalPolicy.cap} onChange={e => setWithdrawalPolicy({ ...withdrawalPolicy, cap: e.target.value })} placeholder="Fee Cap (₦)" className={inputClass} />
              <label className="min-h-11 rounded-2xl border border-slate-200 dark:border-slate-800 px-3 flex items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={withdrawalPolicy.enabled} onChange={e => setWithdrawalPolicy({ ...withdrawalPolicy, enabled: e.target.checked })} />
                Enable Fee
              </label>
            </div>
            <button disabled={saving === 'withdrawal-fee'} onClick={() => void saveWithdrawalFee()} className="min-h-11 mt-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white px-5 text-xs font-black inline-flex items-center gap-2">
              <Save size={14} /> {saving === 'withdrawal-fee' ? 'Saving…' : 'Save Withdrawal Fee Policy'}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-base text-slate-900 dark:text-white">Minimum Staff Wallet Withdrawal Amount</h2>
            <p className="text-xs text-slate-500 mt-1">Enforced threshold when instructors submit payout requests.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-md">
              <input type="number" value={minimumWithdrawal} onChange={e => setMinimumWithdrawal(e.target.value)} placeholder="Minimum amount (₦)" className={inputClass} />
              <button disabled={saving === 'minimum'} onClick={() => void saveMinimum()} className="min-h-11 rounded-2xl bg-slate-900 hover:bg-black text-white px-5 text-xs font-black inline-flex items-center justify-center gap-2">
                <Save size={14} /> {saving === 'minimum' ? 'Saving…' : 'Save Minimum Threshold'}
              </button>
            </div>
          </div>

          {/* Standard Plans Editor */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-base text-slate-900 dark:text-white mb-4">Default Standard Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map(plan => (
                <div key={plan.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <h3 className="font-black text-sm">{plan.name}</h3>
                  <div className="text-xs text-slate-500 mt-1">{plan.role} • {plan.durationWeeks} weeks</div>
                  <div className="text-xl font-black font-mono mt-2">{money(plan.baseAmount)}</div>
                  <button type="button" onClick={() => editPlan(plan)} className="min-h-9 mt-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold">
                    Edit Plan
                  </button>
                </div>
              ))}
            </div>

            {selectedPlan && (
              <div className="mt-6 p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-black uppercase tracking-wider mb-3">Edit Plan: {selectedPlan}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={planDraft.name} onChange={e => setPlanDraft({ ...planDraft, name: e.target.value })} placeholder="Plan Name" className={inputClass} />
                  <input type="number" value={planDraft.baseAmount} onChange={e => setPlanDraft({ ...planDraft, baseAmount: e.target.value })} placeholder="Base Amount (₦)" className={inputClass} />
                  <input type="number" value={planDraft.durationWeeks} onChange={e => setPlanDraft({ ...planDraft, durationWeeks: e.target.value })} placeholder="Duration Weeks" className={inputClass} />
                  <input value={planDraft.teachingModes} onChange={e => setPlanDraft({ ...planDraft, teachingModes: e.target.value })} placeholder="Teaching Modes (comma separated)" className={inputClass} />
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button type="button" onClick={() => setSelectedPlan('')} className="min-h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">Close</button>
                  <button disabled={saving === 'plan'} onClick={() => void savePlan()} className="min-h-10 px-5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black inline-flex items-center gap-1">
                    <Save size={14} /> {saving === 'plan' ? 'Saving…' : 'Save Plan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // SUB-VIEW: Parent Enrollment & Tuition Billing Page
  if (activeView === 'parents') {
    const parentEnrollments: UnifiedParentStudent[] = data.enrollments || [];
    const pendingCount = parentEnrollments.filter((e: any) => String(e.status || '').toLowerCase() === 'pending').length;
    const approvedCount = parentEnrollments.filter((e: any) => String(e.status || '').toLowerCase() === 'approved').length;
    
    // Parent payments
    const parentPaymentsList = paid.filter((p: any) => !p.schoolId);
    const totalParentTuition = parentPaymentsList.reduce((acc: number, p: any) => acc + Number(p.customerTotal || p.amount || 0), 0);

    // Group enrollments strictly by parent family account and independent self-registered scholars
    const parentGroups: ParentFamilyGroup[] = [];
    const groupsMap = new Map<string, ParentFamilyGroup>();

    parentEnrollments.forEach((student: UnifiedParentStudent) => {
      const pEmail = (student.parentEmail || '').trim().toLowerCase();
      const pName = (student.parentName || '').trim();
      const parentKey = pEmail || pName.toLowerCase();
      const isParentAccount = Boolean(pEmail || (pName && pName.toLowerCase() !== 'scholar' && pName.toLowerCase() !== 'student'));

      if (isParentAccount && parentKey) {
        if (!groupsMap.has(parentKey)) {
          const group: ParentFamilyGroup = {
            id: `parent-${parentKey}`,
            type: 'parent',
            parentName: pName || (pEmail ? pEmail.split('@')[0] : 'Parent Family Account'),
            parentEmail: student.parentEmail || '',
            parentPhone: student.parentPhone || '',
            children: [],
            totalBilled: 0
          };
          groupsMap.set(parentKey, group);
          parentGroups.push(group);
        }
        const grp = groupsMap.get(parentKey)!;
        grp.children.push(student);
        grp.totalBilled += Number(student.amount || 0);
        if (!grp.parentPhone && student.parentPhone) grp.parentPhone = student.parentPhone;
        if ((!grp.parentName || grp.parentName === 'Parent') && pName) grp.parentName = pName;
      } else {
        // Self-registered individual scholar
        parentGroups.push({
          id: `indiv-${student.id}`,
          type: 'independent_student',
          parentName: student.studentName || 'Self-Registered Scholar',
          parentEmail: student.parentEmail || '',
          parentPhone: student.parentPhone || '',
          children: [student],
          totalBilled: Number(student.amount || 0)
        });
      }
    });

    const filteredParentGroups = parentGroups.filter(g => {
      const q = parentSearch.toLowerCase().trim();
      const matchesQuery = !q ||
        g.parentName.toLowerCase().includes(q) ||
        g.parentEmail.toLowerCase().includes(q) ||
        (g.parentPhone && g.parentPhone.includes(q)) ||
        g.children.some(c => 
          (c.studentName && c.studentName.toLowerCase().includes(q)) ||
          (c.plan && c.plan.toLowerCase().includes(q))
        );
      if (!matchesQuery) return false;
      if (parentStatusFilter === 'ALL') return true;
      return g.children.some(c => String(c.status || '').toUpperCase() === parentStatusFilter);
    });

    return (
      <div className="space-y-6">
        <SEO title="Parent Enrollments & Tuition Billing | Admin" description="Parent admissions, tuition billing, family plans and instructor allocations." noindex={true} />

        {/* Top Back & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveView('hub')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs self-start"
          >
            <ArrowLeft size={16} />
            <span>Back to Financial Operations</span>
          </button>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/approvals"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-brand-red text-white text-xs font-bold hover:bg-red-700 transition-all shadow-sm"
            >
              <UserCheck size={15} />
              <span>Enrollment Approvals ({pendingCount})</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <Users size={16} className="text-brand-red" />
              <span>Parent Accounts</span>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
              {parentGroups.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Active family &amp; scholar records</p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <AlertCircle size={16} className="text-amber-500" />
              <span>Pending Approvals</span>
            </div>
            <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-2">
              {pendingCount}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Awaiting plan configuration or tutor</p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <DollarSign size={16} className="text-emerald-500" />
              <span>Parent Tuition Volume</span>
            </div>
            <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-2">
              {money(totalParentTuition)}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Verified Paystack tuition gross</p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <CheckCircle2 size={16} className="text-sky-500" />
              <span>Approved &amp; Active</span>
            </div>
            <div className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400 mt-2">
              {approvedCount}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Enrolled with active instructor</p>
          </div>
        </div>

        {/* Enrollments & Billing Ledger Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                Parent Enrollment &amp; Tuition Billing
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage parent family accounts, inspect registered children, assign dynamic program plans, and set custom tuition rates.
              </p>
            </div>

            {/* Search & Filter Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={parentSearch}
                  onChange={(e) => setParentSearch(e.target.value)}
                  placeholder="Search parent name, email, child..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <select
                value={parentStatusFilter}
                onChange={(e) => setParentStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[850px] w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                  <th className="p-3.5 text-left">Parent / Scholar Account</th>
                  <th className="p-3.5 text-left">Contact Info</th>
                  <th className="p-3.5 text-left">Enrolled Children</th>
                  <th className="p-3.5 text-left">Total Configured Tuition</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredParentGroups.length ? (
                  filteredParentGroups.map((group) => {
                    const isExpanded = Boolean(expandedParents[group.id]);
                    const isSelfRegistered = group.type === 'independent_student';

                    return (
                      <React.Fragment key={group.id}>
                        <tr 
                          onClick={() => toggleParentExpand(group.id)}
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''
                          }`}
                        >
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-950/50 text-brand-red flex items-center justify-center font-bold text-xs shrink-0">
                                {isSelfRegistered ? <User size={14} /> : <Users size={14} />}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>{group.parentName}</span>
                                  {isSelfRegistered ? (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">
                                      Independent Scholar
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">
                                      Family Account
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 text-slate-600 dark:text-slate-300">
                            <div className="font-mono text-[11px]">{group.parentEmail || 'No email provided'}</div>
                            {group.parentPhone && (
                              <div className="text-[10px] text-slate-400">{group.parentPhone}</div>
                            )}
                          </td>

                          <td className="p-3.5">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {group.children.length} {group.children.length === 1 ? 'Child' : 'Children'}
                            </span>
                          </td>

                          <td className="p-3.5 font-mono font-black text-slate-900 dark:text-white">
                            {group.totalBilled > 0 ? (
                              formatNaira(group.totalBilled)
                            ) : (
                              <span className="text-slate-400 font-medium italic">Unset (₦0)</span>
                            )}
                          </td>

                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleParentExpand(group.id);
                                }}
                                className="min-h-8 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors"
                              >
                                <span>{isExpanded ? 'Hide Details' : 'View Children & Fees'}</span>
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Children & Plans Drawer */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                            <td colSpan={5} className="p-4 sm:p-5">
                              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-inner">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                                  <div className="flex items-center gap-2">
                                    <BookOpen size={16} className="text-brand-red" />
                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                      Registered Children &amp; Program Plans for {group.parentName}
                                    </h4>
                                  </div>
                                  <span className="text-[11px] text-slate-400">
                                    Select a child below to set custom tuition fees, curriculum track, and assign a tutor.
                                  </span>
                                </div>

                                <div className="space-y-3">
                                  {group.children.map((child) => {
                                    const st = String(child.status || 'pending').toUpperCase();
                                    const isApproved = st === 'APPROVED' || st === 'PAID';
                                    const childFee = Number(child.amount || 0);

                                    return (
                                      <div
                                        key={child.id}
                                        className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                                      >
                                        <div className="space-y-1 min-w-[200px]">
                                          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                            <span>{child.studentName}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase inline-flex items-center gap-1 ${
                                              isApproved 
                                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' 
                                                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                                            }`}>
                                              {isApproved ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                              {st}
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {child.age ? `Age: ${child.age}` : 'Age not provided'} {child.grade ? `• Grade/Class: ${child.grade}` : ''}
                                          </div>
                                        </div>

                                        <div className="space-y-0.5 min-w-[180px]">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">Assigned Program</span>
                                          <div>
                                            {child.plan ? (
                                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 inline-block">
                                                {child.plan}
                                              </span>
                                            ) : (
                                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 inline-block">
                                                No Current Plan
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-slate-400 capitalize">
                                            {child.teachingMode || 'Online 1-on-1'} • {child.cycle || 'Monthly'}
                                          </div>
                                        </div>

                                        <div className="space-y-0.5 min-w-[140px]">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">Configured Fee</span>
                                          <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                                            {childFee > 0 ? (
                                              formatNaira(childFee)
                                            ) : (
                                              <span className="text-slate-400 font-normal italic text-xs">Fee Not Set (₦0)</span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-slate-400">
                                            Faculty: <strong className="text-slate-600 dark:text-slate-300">{child.tutorName || 'Unassigned'}</strong>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedParentStudent(child);
                                              setIsParentModalOpen(true);
                                            }}
                                            className="min-h-8 px-3.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                                          >
                                            <Sliders size={12} />
                                            <span>Set Plan &amp; Billing</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedParentStudent(child);
                                              setIsParentModalOpen(true);
                                            }}
                                            className="min-h-8 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                                          >
                                            <UserCheck size={12} />
                                            <span>Allocate Tutor</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400">
                      No parent records or independent scholars found matching the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN FINTECH DASHBOARD VIEW ('hub')
  return (
    <div className="space-y-6">
      <SEO title="Billing, Invoicing & Treasury | Admin" description="Manage platform treasury, tuition billing and staff allocations." noindex={true} />

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0F172A] via-[#0B1528] to-[#1E293B] border border-slate-700/60 text-white p-5 sm:p-6">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-brand-red/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-300">Live figures from financial records</p>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-xs font-black hover:bg-white/15">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh ledger
          </button>
        </div>
        <div className="relative z-10 mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400 font-black">Available balance</p><p className="mt-1 text-xl font-black font-mono">{showBalance ? formatCurrency(calculatedAvailableBalance) : '₦••••••'}</p></div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400 font-black">Verified invoices</p><p className="mt-1 text-xl font-black">{paid.length}</p></div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400 font-black">Tutor allocations</p><p className="mt-1 text-xl font-black font-mono">{showBalance ? money(tutorAllocated) : '₦••••'}</p></div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400 font-black">Platform net</p><p className="mt-1 text-xl font-black font-mono">{showBalance ? money(platformNet) : '₦••••'}</p></div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          ['parents', 'Parent Enrollment & Billing', 'Set student plans, billing and tutor allocations for parent-linked students.'],
          ['transactions', 'Transaction History', 'Review verified financial transactions and receipts.'],
          ['monthly', 'Monthly Breakdown', 'Review financial activity by period.'],
          ['schools', 'Partner School Billings', 'Configure school billing, programmes and fee schedules.'],
          ['tutors', 'Tutor Allocations & Disbursals', 'Allocate approved payouts and manage tutor settlement operations.'],
          ['policies', 'Fee Policies & Plans', 'Configure platform billing rules and pricing plans.']
        ].map(([id, title, description]) => (
          <button key={id} type="button" onClick={() => setActiveView(id as any)} className="text-left rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-red/50 hover:shadow-sm transition-all">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-brand-red">Open module <ChevronRight size={13} /></span>
          </button>
        ))}
      </div>
    </div>
  );
  };

  return (
    <>
      {renderViewContent()}

      {/* Parent Tuition & Program Schedule Modal */}
      <ParentTuitionModal
        isOpen={isParentModalOpen}
        onClose={() => {
          setIsParentModalOpen(false);
          setSelectedParentStudent(null);
        }}
        student={selectedParentStudent}
        tutors={data.staff || []}
        onSaved={load}
      />

      {/* Tutor School & Program Allocation Modal */}
      <TutorAllocationModal
        isOpen={isTutorAllocModalOpen}
        onClose={() => {
          setIsTutorAllocModalOpen(false);
          setDefaultAllocTutorId(undefined);
          setDefaultAllocSchoolId(undefined);
        }}
        tutors={data.staff || []}
        schools={schools}
        onSaved={load}
        defaultTutorId={defaultAllocTutorId}
        defaultSchoolId={defaultAllocSchoolId}
      />

      {/* Transfer to Tutor Wallet Modal */}
      <TransferToTutorModal
        isOpen={isTransferToTutorOpen}
        onClose={() => setIsTransferToTutorOpen(false)}
        tutors={data.staff || []}
        availableTreasuryBalance={calculatedAvailableBalance}
        onTransfer={handleTransferToTutor}
      />

      {/* Fintech Treasury Disbursal Modal */}
      <FintechWithdrawalModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        availableBalance={calculatedAvailableBalance}
        initialMode="bank"
        onConfirmWithdrawal={handleTreasuryDisbursal}
      />

      {/* Fintech Treasury Top-Up Modal */}
      <FintechAddMoneyModal
        isOpen={isAddMoneyModalOpen}
        onClose={() => setIsAddMoneyModalOpen(false)}
        userName="Platform Treasury"
        userEmail="admin@jaystarbliss-studios.name.ng"
        onPaystackTopUp={async (amt) => {
          toast.success(`Platform Treasury direct deposit of ₦${amt.toLocaleString()} initiated via Paystack.`);
        }}
      />
    </>
  );
};

const PolicyCard = ({ title, policy, setPolicy, saving, onSave }: { title: string; policy: Policy; setPolicy: (p: Policy) => void; saving: boolean; onSave: () => void }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
    <h2 className="font-black text-base text-slate-900 dark:text-white">{title}</h2>
    <p className="text-xs text-slate-500 mt-0.5">Passed through to customer at Paystack checkout.</p>
    <div className="grid grid-cols-2 gap-3 mt-4">
      <input type="number" step="0.01" value={policy.percentage} onChange={e => setPolicy({ ...policy, percentage: e.target.value })} placeholder="Percent %" className={inputClass} />
      <input type="number" value={policy.flat} onChange={e => setPolicy({ ...policy, flat: e.target.value })} placeholder="Flat Fee (₦)" className={inputClass} />
      <input type="number" value={policy.cap} onChange={e => setPolicy({ ...policy, cap: e.target.value })} placeholder="Fee Cap (₦)" className={inputClass} />
      <input type="number" value={policy.waiveFlatBelow || ''} onChange={e => setPolicy({ ...policy, waiveFlatBelow: e.target.value })} placeholder="Waive Below (₦)" className={inputClass} />
    </div>
    <button disabled={saving} type="button" onClick={onSave} className="min-h-11 mt-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white px-5 text-xs font-black inline-flex items-center gap-2 shadow-sm">
      <Save size={14} /> {saving ? 'Saving…' : 'Save Fee Policy'}
    </button>
  </div>
);

export default AdminBilling;
