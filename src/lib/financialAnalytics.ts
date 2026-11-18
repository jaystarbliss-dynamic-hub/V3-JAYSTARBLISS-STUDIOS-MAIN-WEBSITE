import {
  extractPaymentAmountNaira,
  extractPaymentBaseAmountNaira,
  isPartiallyPaidStatus,
  isSuccessfulPaymentStatus
} from './billing';
import { getReceiptDetails, type TransactionReceiptData } from './receiptGenerator';

export type AnalyticsDateRange = 'all' | '12m' | 'year' | 'month';
export type AnalyticsStatusBucket =
  | 'all'
  | 'successful'
  | 'partially_paid'
  | 'pending'
  | 'failed'
  | 'reversed'
  | 'unknown';
export type AnalyticsDirection = 'all' | 'inflow' | 'outflow';

export interface NormalizedTransactionRecord {
  raw: TransactionReceiptData;
  id: string;
  reference: string;
  date: Date | null;
  monthKey: string;
  monthLabel: string;
  statusBucket: Exclude<AnalyticsStatusBucket, 'all'>;
  statusLabel: string;
  isVerifiedPaid: boolean;
  direction: Exclude<AnalyticsDirection, 'all'>;
  amountNaira: number;
  baseAmountNaira: number;
  feeNaira: number;
  feeIsVerified: boolean;
  remainingBalanceNaira: number;
  channelLabel: string;
  programmeName: string;
  payerName: string;
  beneficiaryName: string;
  learnerLabel: string;
  schoolName: string;
  roleLabel: string;
}

export interface MonthlyTrendPoint {
  monthKey: string;
  label: string;
  verifiedAmount: number;
  inflowAmount: number;
  outflowAmount: number;
  totalVolume: number;
  count: number;
  verifiedCount: number;
}

export interface DistributionSlice {
  key: string;
  label: string;
  amount: number;
  count: number;
  sharePercent: number;
}

export interface EntityBreakdownRow {
  name: string;
  sublabel: string;
  amount: number;
  count: number;
  sharePercent: number;
  verifiedCount: number;
}

export interface FinancialAnalyticsFilter {
  dateRange?: AnalyticsDateRange;
  monthKey?: string;
  status?: AnalyticsStatusBucket;
  programme?: string;
  direction?: AnalyticsDirection;
  entity?: string;
  search?: string;
  referenceDate?: Date;
}

export interface FinancialAnalyticsResult {
  rolePerspective: 'parent' | 'school' | 'student' | 'staff' | 'admin';
  records: NormalizedTransactionRecord[];
  allNormalizedCount: number;
  periodLabel: string;
  kpis: {
    totalRecords: number;
    totalVolume: number;
    verifiedPaidTotal: number;
    inflowTotal: number;
    outflowTotal: number;
    verifiedGatewayFeesTotal: number;
    estimatedFeesTotal: number;
    successfulCount: number;
    partiallyPaidCount: number;
    pendingCount: number;
    failedCount: number;
    reversedCount: number;
    unknownCount: number;
    outstandingPartialBalance: number;
    averageVerifiedTransaction: number;
    successRatePercent: number | null;
    verificationRatePercent: number | null;
  };
  statistics: {
    highestTransaction: { amount: number; reference: string; label: string } | null;
    lowestTransaction: { amount: number; reference: string; label: string } | null;
    averageTransaction: number;
    mostActivePeriod: { label: string; count: number; amount: number } | null;
    avgMonthlyCount: number;
  };
  monthlyTrends: MonthlyTrendPoint[];
  statusDistribution: DistributionSlice[];
  programmeBreakdown: DistributionSlice[];
  channelBreakdown: DistributionSlice[];
  entityBreakdown: EntityBreakdownRow[];
  entitySectionTitle: string;
  filterOptions: {
    months: Array<{ key: string; label: string }>;
    programmes: string[];
    entities: string[];
  };
}

export function normalizeAnalyticsRole(role: string | undefined): FinancialAnalyticsResult['rolePerspective'] {
  const r = String(role || '').toLowerCase();
  if (r.includes('admin')) return 'admin';
  if (r.includes('school')) return 'school';
  if (r.includes('parent') || r.includes('guardian')) return 'parent';
  if (r.includes('staff') || r.includes('tutor') || r.includes('instructor')) return 'staff';
  return 'student';
}

export function safeParseTransactionDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof (val as { toDate?: () => Date })?.toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    const secs = Number((val as { seconds: unknown }).seconds);
    if (Number.isFinite(secs)) {
      const d = new Date(secs * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function classifyStatusBucket(rawStatus: unknown): {
  bucket: Exclude<AnalyticsStatusBucket, 'all'>;
  label: string;
  isVerifiedPaid: boolean;
} {
  const norm = String(rawStatus ?? '').trim().toUpperCase();
  if (!norm) {
    return { bucket: 'unknown', label: 'Unknown', isVerifiedPaid: false };
  }
  if (isPartiallyPaidStatus(norm)) {
    return { bucket: 'partially_paid', label: 'Partially Paid', isVerifiedPaid: true };
  }
  if (isSuccessfulPaymentStatus(norm)) {
    return { bucket: 'successful', label: 'Successful', isVerifiedPaid: true };
  }
  if (['PENDING', 'PROCESSING', 'AWAITING', 'INITIALIZED', 'INITIATED', 'ABANDONED'].includes(norm)) {
    return { bucket: 'pending', label: norm === 'ABANDONED' ? 'Abandoned / Pending' : 'Pending', isVerifiedPaid: false };
  }
  if (['REVERSED', 'REFUNDED', 'CANCELLED', 'CANCELED'].includes(norm)) {
    return {
      bucket: 'reversed',
      label: norm === 'REFUNDED' ? 'Refunded' : norm === 'CANCELLED' || norm === 'CANCELED' ? 'Cancelled' : 'Reversed',
      isVerifiedPaid: false
    };
  }
  if (['FAILED', 'DECLINED', 'ERROR'].includes(norm)) {
    return { bucket: 'failed', label: 'Failed', isVerifiedPaid: false };
  }
  return { bucket: 'unknown', label: `Unknown (${norm})`, isVerifiedPaid: false };
}

export function resolveVerifiedChannelLabel(t: TransactionReceiptData): string {
  const rawChannel = String((t as any).channel || '').trim().toLowerCase();
  const rawMethod = String((t as any).paymentMethod || '').trim().toLowerCase();
  const candidate = rawChannel || rawMethod;

  if (!candidate || ['unknown', 'not recorded', 'paystack', 'n/a', 'none', 'paystack direct bank / card'].includes(candidate)) {
    return 'Unknown / Not Recorded';
  }
  if (candidate === 'card' || candidate === 'debit_card' || candidate === 'credit_card') return 'Card';
  if (candidate === 'bank' || candidate === 'bank_transfer' || candidate === 'bank transfer' || candidate === 'dedicated_nuban') {
    return 'Bank Transfer';
  }
  if (candidate === 'mobile_money' || candidate === 'mobile money') return 'Mobile Money';
  if (candidate === 'opay') return 'OPay';
  if (candidate === 'ussd') return 'USSD';
  if (candidate === 'qr') return 'QR';
  if (candidate === 'eft') return 'EFT';
  if (candidate === 'apple_pay') return 'Apple Pay';

  // Capitalize verified custom channel safely
  return candidate.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function determineTransactionDirection(
  t: TransactionReceiptData,
  perspective: FinancialAnalyticsResult['rolePerspective']
): Exclude<AnalyticsDirection, 'all'> {
  const rawType = String(t.type || '').trim().toLowerCase();
  const desc = `${t.description || ''} ${t.category || ''} ${t.plan || ''}`.toLowerCase();

  if (['outflow', 'payout', 'withdrawal', 'transfer_to', 'debit'].includes(rawType)) {
    return 'outflow';
  }
  if (['inflow', 'deposit', 'transfer_from', 'credit'].includes(rawType)) {
    return 'inflow';
  }
  if (perspective === 'parent' || perspective === 'student' || perspective === 'school') {
    // Tuition and institutional fee payments are expenses/outflows from the payer's perspective
    return 'outflow';
  }
  if (perspective === 'staff') {
    if (desc.includes('withdraw') || desc.includes('payout')) return 'outflow';
    return 'inflow';
  }
  // Admin platform view
  if (desc.includes('withdraw') || desc.includes('payout') || desc.includes('disburs')) {
    return 'outflow';
  }
  return 'inflow';
}

export function normalizeTransactionRecord(
  t: TransactionReceiptData,
  perspective: FinancialAnalyticsResult['rolePerspective']
): NormalizedTransactionRecord {
  const date = safeParseTransactionDate(t.paidAt || t.createdAt);
  const monthKey = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    : 'undated';
  const monthLabel = date
    ? date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
    : 'Undated';

  const statusInfo = classifyStatusBucket(t.status ?? (t as any).paymentStatus);
  const direction = determineTransactionDirection(t, perspective);
  const amountNaira = extractPaymentAmountNaira(t);
  const baseAmountNaira = extractPaymentBaseAmountNaira(t);
  const verifiedFeeField = Number((t as any).paystackFeeNaira ?? 0);
  const rawFeeField = Number(t.transactionFee ?? 0);
  const feeIsVerified = Boolean((t as any).gatewayFeeVerified) || (Number.isFinite(verifiedFeeField) && verifiedFeeField > 0);
  const feeNaira = feeIsVerified && Number.isFinite(verifiedFeeField) && verifiedFeeField > 0
    ? Number(verifiedFeeField.toFixed(2))
    : Number.isFinite(rawFeeField) && rawFeeField > 0
    ? Number(rawFeeField.toFixed(2))
    : 0;

  const remainingBalanceNaira = Math.max(0, Number(t.remainingBalance || 0) || 0);
  const details = getReceiptDetails(t);
  const learnerLabel = details.studentList.length > 0
    ? details.studentList.join(', ')
    : details.studentName || '';

  return {
    raw: t,
    id: String(t.id || t.reference || ''),
    reference: String(t.reference || t.id || 'N/A'),
    date,
    monthKey,
    monthLabel,
    statusBucket: statusInfo.bucket,
    statusLabel: statusInfo.label,
    isVerifiedPaid: statusInfo.isVerifiedPaid,
    direction,
    amountNaira,
    baseAmountNaira,
    feeNaira,
    feeIsVerified,
    remainingBalanceNaira,
    channelLabel: resolveVerifiedChannelLabel(t),
    programmeName: details.programName || 'Academy Programme',
    payerName: details.payerName || 'Customer',
    beneficiaryName: details.beneficiary || details.payerName || 'Jaystarbliss Studios',
    learnerLabel,
    schoolName: details.schoolName || '',
    roleLabel: details.roleLabel || 'Account'
  };
}

export function buildFinancialAnalytics(
  transactions: TransactionReceiptData[],
  role: string | undefined,
  filters: FinancialAnalyticsFilter = {}
): FinancialAnalyticsResult {
  const perspective = normalizeAnalyticsRole(role);
  const refDate = filters.referenceDate || new Date();
  const normalizedAll = (transactions || []).map((t) => normalizeTransactionRecord(t, perspective));

  // Build available filter options from all authorized records
  const monthMap = new Map<string, string>();
  const programmeSet = new Set<string>();
  const entitySet = new Set<string>();

  const getEntityKey = (rec: NormalizedTransactionRecord): { name: string; sublabel: string } => {
    if (perspective === 'parent') {
      return {
        name: rec.learnerLabel || rec.beneficiaryName || 'Linked Learner',
        sublabel: rec.programmeName
      };
    }
    if (perspective === 'school') {
      return {
        name: rec.programmeName || rec.schoolName || 'Institutional Track',
        sublabel: rec.schoolName || 'School Account'
      };
    }
    if (perspective === 'staff') {
      return {
        name: rec.direction === 'outflow' ? 'Wallet Payout / Withdrawal' : (rec.learnerLabel || rec.payerName || 'Teaching Settlement'),
        sublabel: rec.programmeName
      };
    }
    if (perspective === 'admin') {
      return {
        name: rec.schoolName || rec.learnerLabel || rec.payerName || 'Client Account',
        sublabel: rec.roleLabel
      };
    }
    return {
      name: rec.programmeName || 'Programme Tuition',
      sublabel: rec.roleLabel
    };
  };

  normalizedAll.forEach((rec) => {
    if (rec.monthKey !== 'undated') monthMap.set(rec.monthKey, rec.monthLabel);
    if (rec.programmeName) programmeSet.add(rec.programmeName);
    const entity = getEntityKey(rec);
    if (entity.name) entitySet.add(entity.name);
  });

  const sortedMonths = Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => ({ key, label }));

  const dateRange = filters.dateRange || 'all';
  const monthKeyFilter = filters.monthKey || 'all';
  const statusFilter = filters.status || 'all';
  const programmeFilter = filters.programme || 'all';
  const directionFilter = filters.direction || 'all';
  const entityFilter = filters.entity || 'all';
  const search = String(filters.search || '').trim().toLowerCase();

  const startOfLast12Months = new Date(refDate.getFullYear(), refDate.getMonth() - 11, 1);
  const currentYear = refDate.getFullYear();

  const filtered = normalizedAll.filter((rec) => {
    if (dateRange === '12m' && rec.date && rec.date < startOfLast12Months) return false;
    if (dateRange === 'year' && rec.date && rec.date.getFullYear() !== currentYear) return false;
    if (dateRange === 'month' && monthKeyFilter !== 'all' && rec.monthKey !== monthKeyFilter) return false;
    if (dateRange === 'all' && monthKeyFilter !== 'all' && rec.monthKey !== monthKeyFilter) return false;

    if (statusFilter !== 'all' && rec.statusBucket !== statusFilter) return false;
    if (programmeFilter !== 'all' && rec.programmeName !== programmeFilter) return false;
    if (directionFilter !== 'all' && rec.direction !== directionFilter) return false;

    if (entityFilter !== 'all') {
      const eName = getEntityKey(rec).name;
      if (eName !== entityFilter) return false;
    }

    if (search) {
      const hay = `${rec.reference} ${rec.payerName} ${rec.beneficiaryName} ${rec.learnerLabel} ${rec.schoolName} ${rec.programmeName} ${rec.channelLabel} ${rec.statusLabel}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    return true;
  });

  // Sort chronological descending for table display
  const sortedRecords = [...filtered].sort(
    (a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0)
  );

  // KPI computations (strictly separating verified paid vs pending/failed/reversed/unknown)
  let totalVolume = 0;
  let verifiedPaidTotal = 0;
  let inflowTotal = 0;
  let outflowTotal = 0;
  let verifiedGatewayFeesTotal = 0;
  let estimatedFeesTotal = 0;
  let successfulCount = 0;
  let partiallyPaidCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let reversedCount = 0;
  let unknownCount = 0;
  let outstandingPartialBalance = 0;

  let highestTransaction: FinancialAnalyticsResult['statistics']['highestTransaction'] = null;
  let lowestTransaction: FinancialAnalyticsResult['statistics']['lowestTransaction'] = null;

  const monthlyMap = new Map<string, MonthlyTrendPoint>();
  const statusMap = new Map<string, { label: string; amount: number; count: number }>();
  const programmeMap = new Map<string, { label: string; amount: number; count: number }>();
  const channelMap = new Map<string, { label: string; amount: number; count: number }>();
  const entityMap = new Map<string, { name: string; sublabel: string; amount: number; count: number; verifiedCount: number }>();

  sortedRecords.forEach((rec) => {
    totalVolume += rec.amountNaira;

    if (rec.statusBucket === 'successful') successfulCount += 1;
    else if (rec.statusBucket === 'partially_paid') partiallyPaidCount += 1;
    else if (rec.statusBucket === 'pending') pendingCount += 1;
    else if (rec.statusBucket === 'failed') failedCount += 1;
    else if (rec.statusBucket === 'reversed') reversedCount += 1;
    else unknownCount += 1;

    if (rec.isVerifiedPaid) {
      verifiedPaidTotal += rec.amountNaira;
      if (rec.direction === 'inflow') inflowTotal += rec.amountNaira;
      else outflowTotal += rec.amountNaira;

      if (rec.feeIsVerified) {
        verifiedGatewayFeesTotal += rec.feeNaira;
      } else if (rec.feeNaira > 0) {
        estimatedFeesTotal += rec.feeNaira;
      }

      if (rec.statusBucket === 'partially_paid' && rec.remainingBalanceNaira > 0) {
        outstandingPartialBalance += rec.remainingBalanceNaira;
      }
    }

    if (rec.amountNaira > 0) {
      if (!highestTransaction || rec.amountNaira > highestTransaction.amount) {
        highestTransaction = {
          amount: rec.amountNaira,
          reference: rec.reference,
          label: rec.programmeName
        };
      }
      if (!lowestTransaction || rec.amountNaira < lowestTransaction.amount) {
        lowestTransaction = {
          amount: rec.amountNaira,
          reference: rec.reference,
          label: rec.programmeName
        };
      }
    }

    // Monthly series (bucket every filtered record accurately by its transaction date)
    const mKey = rec.monthKey;
    const existingMonth = monthlyMap.get(mKey) || {
      monthKey: mKey,
      label: rec.monthLabel,
      verifiedAmount: 0,
      inflowAmount: 0,
      outflowAmount: 0,
      totalVolume: 0,
      count: 0,
      verifiedCount: 0
    };
    existingMonth.totalVolume += rec.amountNaira;
    existingMonth.count += 1;
    if (rec.isVerifiedPaid) {
      existingMonth.verifiedAmount += rec.amountNaira;
      existingMonth.verifiedCount += 1;
      if (rec.direction === 'inflow') existingMonth.inflowAmount += rec.amountNaira;
      else existingMonth.outflowAmount += rec.amountNaira;
    }
    monthlyMap.set(mKey, existingMonth);

    // Status distribution
    const stEntry = statusMap.get(rec.statusBucket) || {
      label: rec.statusLabel,
      amount: 0,
      count: 0
    };
    stEntry.amount += rec.amountNaira;
    stEntry.count += 1;
    statusMap.set(rec.statusBucket, stEntry);

    // Programme breakdown (use verified amount primarily, or record volume if filtering pending)
    const metricAmount = rec.isVerifiedPaid ? rec.amountNaira : 0;
    const pKey = rec.programmeName;
    const pEntry = programmeMap.get(pKey) || { label: pKey, amount: 0, count: 0 };
    pEntry.amount += metricAmount;
    pEntry.count += 1;
    programmeMap.set(pKey, pEntry);

    // Channel breakdown (real verified Paystack channels or Unknown / Not Recorded)
    const cKey = rec.channelLabel;
    const cEntry = channelMap.get(cKey) || { label: cKey, amount: 0, count: 0 };
    cEntry.amount += rec.isVerifiedPaid ? rec.amountNaira : 0;
    cEntry.count += 1;
    channelMap.set(cKey, cEntry);

    // Entity breakdown
    const entityInfo = getEntityKey(rec);
    const eEntry = entityMap.get(entityInfo.name) || {
      name: entityInfo.name,
      sublabel: entityInfo.sublabel,
      amount: 0,
      count: 0,
      verifiedCount: 0
    };
    eEntry.amount += rec.isVerifiedPaid ? rec.amountNaira : 0;
    eEntry.count += 1;
    if (rec.isVerifiedPaid) eEntry.verifiedCount += 1;
    entityMap.set(entityInfo.name, eEntry);
  });

  const verifiedCount = successfulCount + partiallyPaidCount;
  const averageVerifiedTransaction = verifiedCount > 0 ? Number((verifiedPaidTotal / verifiedCount).toFixed(2)) : 0;
  const averageTransaction = sortedRecords.length > 0 ? Number((totalVolume / sortedRecords.length).toFixed(2)) : 0;
  const successRatePercent = sortedRecords.length > 0
    ? Number(((verifiedCount / sortedRecords.length) * 100).toFixed(1))
    : null;
  const verificationRatePercent = totalVolume > 0
    ? Number(((verifiedPaidTotal / totalVolume) * 100).toFixed(1))
    : null;

  const monthlyTrends = Array.from(monthlyMap.values()).sort((a, b) => {
    if (a.monthKey === 'undated') return 1;
    if (b.monthKey === 'undated') return -1;
    return a.monthKey.localeCompare(b.monthKey);
  });

  let mostActivePeriod: FinancialAnalyticsResult['statistics']['mostActivePeriod'] = null;
  monthlyTrends.forEach((m) => {
    if (
      !mostActivePeriod ||
      m.verifiedAmount > mostActivePeriod.amount ||
      (m.verifiedAmount === mostActivePeriod.amount && m.count > mostActivePeriod.count)
    ) {
      mostActivePeriod = { label: m.label, count: m.count, amount: m.verifiedAmount };
    }
  });

  const avgMonthlyCount = monthlyTrends.length > 0
    ? Number((sortedRecords.length / monthlyTrends.length).toFixed(1))
    : 0;

  const toSlices = (
    map: Map<string, { label: string; amount: number; count: number }>,
    denom: number
  ): DistributionSlice[] => {
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        label: v.label,
        amount: Number(v.amount.toFixed(2)),
        count: v.count,
        sharePercent: denom > 0 ? Number(((v.amount / denom) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : b.count - a.count));
  };

  const totalStatusCount = sortedRecords.length || 1;
  const statusDistribution = Array.from(statusMap.entries())
    .map(([key, v]) => ({
      key,
      label: v.label,
      amount: Number(v.amount.toFixed(2)),
      count: v.count,
      sharePercent: sortedRecords.length > 0 ? Number(((v.count / totalStatusCount) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const entityDenominator = verifiedPaidTotal > 0 ? verifiedPaidTotal : 0;
  const entityBreakdown: EntityBreakdownRow[] = Array.from(entityMap.values())
    .map((e) => ({
      ...e,
      amount: Number(e.amount.toFixed(2)),
      sharePercent: entityDenominator > 0 ? Number(((e.amount / entityDenominator) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : b.count - a.count));

  const entitySectionTitle =
    perspective === 'parent'
      ? 'Payments by Learner'
      : perspective === 'school'
      ? 'Payments by Programme Track'
      : perspective === 'staff'
      ? 'Breakdown by Settlement & Payout'
      : perspective === 'admin'
      ? 'Payments by School, Learner & Account'
      : 'Payments by Programme';

  let periodLabel = 'All Available Records';
  if (monthKeyFilter !== 'all') {
    periodLabel = sortedMonths.find((m) => m.key === monthKeyFilter)?.label || monthKeyFilter;
  } else if (dateRange === '12m') {
    periodLabel = 'Last 12 Months';
  } else if (dateRange === 'year') {
    periodLabel = `${currentYear} Year to Date`;
  }

  return {
    rolePerspective: perspective,
    records: sortedRecords,
    allNormalizedCount: normalizedAll.length,
    periodLabel,
    kpis: {
      totalRecords: sortedRecords.length,
      totalVolume: Number(totalVolume.toFixed(2)),
      verifiedPaidTotal: Number(verifiedPaidTotal.toFixed(2)),
      inflowTotal: Number(inflowTotal.toFixed(2)),
      outflowTotal: Number(outflowTotal.toFixed(2)),
      verifiedGatewayFeesTotal: Number(verifiedGatewayFeesTotal.toFixed(2)),
      estimatedFeesTotal: Number(estimatedFeesTotal.toFixed(2)),
      successfulCount,
      partiallyPaidCount,
      pendingCount,
      failedCount,
      reversedCount,
      unknownCount,
      outstandingPartialBalance: Number(outstandingPartialBalance.toFixed(2)),
      averageVerifiedTransaction,
      successRatePercent,
      verificationRatePercent
    },
    statistics: {
      highestTransaction,
      lowestTransaction,
      averageTransaction,
      mostActivePeriod,
      avgMonthlyCount
    },
    monthlyTrends,
    statusDistribution,
    programmeBreakdown: toSlices(programmeMap, verifiedPaidTotal),
    channelBreakdown: toSlices(channelMap, verifiedPaidTotal),
    entityBreakdown,
    entitySectionTitle,
    filterOptions: {
      months: sortedMonths,
      programmes: Array.from(programmeSet).sort(),
      entities: Array.from(entitySet).sort()
    }
  };
}
