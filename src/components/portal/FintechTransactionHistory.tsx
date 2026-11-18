import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  Download,
  Search,
  TrendingUp,
  Coins,
  Box,
  School,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import {
  formatCurrency,
  formatReceiptDate,
  generatePdfStatement,
  parseDate,
  getReceiptDetails
} from '../../lib/receiptGenerator';
import type { TransactionReceiptData } from '../../lib/receiptGenerator';
import {
  extractPaymentAmountNaira,
  isSuccessfulPaymentStatus,
  isPartiallyPaidStatus
} from '../../lib/billing';
import {
  classifyStatusBucket,
  determineTransactionDirection,
  normalizeAnalyticsRole
} from '../../lib/financialAnalytics';
import { FintechTransactionDetailsModal } from './FintechTransactionDetailsModal';
import { FinancialAnalysisWorkspace } from './FinancialAnalysisWorkspace';
import { useToast } from '../../contexts/ToastContext';

export interface FintechTransactionHistoryProps {
  transactions: TransactionReceiptData[];
  title?: string;
  onBack?: () => void;
  showBack?: boolean;
  role?: string;
  emptyMessage?: string;
}

export const FintechTransactionHistory: React.FC<FintechTransactionHistoryProps> = ({
  transactions,
  title = 'Transactions',
  onBack,
  showBack = false,
  role = 'student',
  emptyMessage = 'No transactions recorded yet'
}) => {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown menus
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Active transaction for detail modal
  const [activeTransaction, setActiveTransaction] = useState<TransactionReceiptData | null>(null);

  const categoryRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);

  const perspective = normalizeAnalyticsRole(role);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setCategoryMenuOpen(false);
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) {
        setMonthMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableMonths = useMemo(() => {
    const map = new Map<string, string>();
    transactions.forEach(t => {
      const d = parseDate(t.paidAt || t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      map.set(key, label);
    });
    if (map.size === 0) {
      const now = new Date();
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, now.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
    }
    return Array.from(map.entries()).map(([k, label]) => ({ key: k, label }));
  }, [transactions]);

  const categories = [
    { key: 'all', label: 'All Transactions' },
    { key: 'transfer_to', label: 'Transfer To (Tutor / Beneficiary)' },
    { key: 'transfer_from', label: 'Transfer From (School / Parent)' },
    { key: 'deposit', label: 'Direct Deposits & Top-ups' },
    { key: 'payout', label: 'Withdrawals & Settlements' },
    { key: 'school_tuition', label: 'Partner School Invoices' },
    { key: 'parent_tuition', label: 'Parent / Cadet Tuition' },
  ];

  const statuses = [
    { key: 'all', label: 'All Status' },
    { key: 'successful', label: 'Successful' },
    { key: 'partially_paid', label: 'Partially Paid' },
    { key: 'pending', label: 'Pending' },
    { key: 'failed', label: 'Failed' },
    { key: 'reversed', label: 'Reversed / Cancelled' },
  ];

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (selectedCategory !== 'all') {
        const catStr = `${t.category || ''} ${t.plan || ''} ${t.description || ''} ${t.type || ''} ${(t as any).targetType || ''}`.toLowerCase();
        if (selectedCategory === 'transfer_to' && !catStr.includes('tutor') && !catStr.includes('transfer to') && !catStr.includes('disburs') && !catStr.includes('payout')) return false;
        if (selectedCategory === 'transfer_from' && !catStr.includes('school') && !catStr.includes('parent') && !catStr.includes('transfer from') && !catStr.includes('student') && !catStr.includes('inflow')) return false;
        if (selectedCategory === 'deposit' && !catStr.includes('deposit') && !catStr.includes('top-up') && !catStr.includes('topup')) return false;
        if (selectedCategory === 'payout' && !catStr.includes('payout') && !catStr.includes('withdraw') && !catStr.includes('disburs')) return false;
        if (selectedCategory === 'school_tuition' && !catStr.includes('school') && !catStr.includes('partner') && !catStr.includes('institutional')) return false;
        if (selectedCategory === 'parent_tuition' && !catStr.includes('parent') && !catStr.includes('cadet') && !catStr.includes('student') && !catStr.includes('mentorship') && !catStr.includes('coding')) return false;
      }

      if (selectedStatus !== 'all') {
        const rawStatus = String(t.status ?? (t as any).paymentStatus ?? '').trim();
        const stLower = rawStatus.toLowerCase();
        if (selectedStatus === 'successful' && (!isSuccessfulPaymentStatus(rawStatus) || isPartiallyPaidStatus(rawStatus))) return false;
        if (selectedStatus === 'partially_paid' && !isPartiallyPaidStatus(rawStatus)) return false;
        if (selectedStatus === 'pending' && !['pending', 'processing', 'awaiting', 'initialized', 'abandoned'].includes(stLower)) return false;
        if (selectedStatus === 'failed' && !['failed', 'declined', 'error'].includes(stLower)) return false;
        if (selectedStatus === 'reversed' && !['reversed', 'refunded', 'cancelled', 'canceled'].includes(stLower)) return false;
      }

      if (selectedMonth !== 'all') {
        const d = parseDate(t.paidAt || t.createdAt);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (k !== selectedMonth) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const details = getReceiptDetails(t);
        const searchPool = `${t.reference || ''} ${t.id || ''} ${t.description || ''} ${t.plan || ''} ${details.displayTitle} ${details.programName} ${details.payerName} ${details.roleLabel} ${details.beneficiary} ${details.studentName} ${details.studentList.join(' ')} ${details.schoolName}`.toLowerCase();
        if (!searchPool.includes(q)) return false;
      }

      return true;
    });
  }, [transactions, selectedCategory, selectedStatus, selectedMonth, searchQuery]);

  // Financial Summary (In / Out) — only count verified successful / partially paid settlements
  const summary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;

    filtered.forEach(t => {
      const rawStatus = t.status ?? (t as any).paymentStatus;
      if (!isSuccessfulPaymentStatus(rawStatus) && !isPartiallyPaidStatus(rawStatus)) return;
      const amt = extractPaymentAmountNaira(t);
      if (!Number.isFinite(amt) || amt <= 0) return;
      const dir = determineTransactionDirection(t, perspective);
      if (dir === 'outflow') {
        totalOut += amt;
      } else {
        totalIn += amt;
      }
    });

    return {
      in: totalIn,
      out: totalOut,
      count: filtered.length
    };
  }, [filtered, perspective]);

  const handleExportAll = () => {
    if (filtered.length === 0) {
      toast.error('No transactions to download');
      return;
    }
    const periodText = selectedMonth === 'all' ? 'All Months' : (availableMonths.find(m => m.key === selectedMonth)?.label || selectedMonth);
    generatePdfStatement(filtered, {
      title: `${title || 'Official Account Statement'} (${filtered.length} Record${filtered.length === 1 ? '' : 's'})`,
      periodLabel: periodText,
      accountLabel: role
    });
    toast.success(`Exported official statement containing all ${filtered.length} selected record${filtered.length === 1 ? '' : 's'}.`);
  };

  const getTransactionIcon = (t: TransactionReceiptData, isNegative: boolean) => {
    const desc = `${t.description || ''} ${t.plan || ''} ${t.category || ''} ${t.type || ''}`.toLowerCase();

    if (desc.includes('save') || desc.includes('deposit') || desc.includes('vault')) {
      return {
        bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
        icon: <Coins size={17} />
      };
    }
    if (desc.includes('robot') || desc.includes('kit') || desc.includes('lab')) {
      return {
        bg: 'bg-red-50 text-brand-red border border-brand-red/20 dark:bg-red-950/30 dark:text-red-300 dark:border-brand-red/30',
        icon: <Box size={17} />
      };
    }
    if (desc.includes('school') || desc.includes('partner') || desc.includes('institutional')) {
      return {
        bg: 'bg-slate-900 text-white border border-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
        icon: <School size={17} />
      };
    }
    if (desc.includes('earn') || desc.includes('interest') || desc.includes('payout')) {
      return {
        bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
        icon: <TrendingUp size={17} />
      };
    }
    if (!isNegative) {
      return {
        bg: 'bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
        icon: <ArrowDownLeft size={17} />
      };
    }
    return {
      bg: 'bg-red-50 text-brand-red border border-brand-red/20 dark:bg-red-950/30 dark:text-red-300 dark:border-brand-red/30',
      icon: <ArrowUpRight size={17} />
    };
  };

  const currentMonthLabel = selectedMonth === 'all'
    ? 'All Months'
    : (availableMonths.find(m => m.key === selectedMonth)?.label || 'All Months');

  return (
    <div className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden font-sans transition-colors">

      {/* 1. Header Bar */}
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Go back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {title}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {filtered.length} recorded entr{filtered.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportAll}
          className="min-h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-brand-red dark:hover:bg-red-800 text-white font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Download size={13} strokeWidth={2.5} />
          <span>Download Statement</span>
        </button>
      </div>

      {/* 2. Filters Row */}
      <div className="px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center gap-2.5">

        {/* Category Dropdown */}
        <div className="relative" ref={categoryRef}>
          <button
            type="button"
            onClick={() => setCategoryMenuOpen(!categoryMenuOpen)}
            className={`min-h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
              selectedCategory !== 'all'
                ? 'bg-red-50/70 dark:bg-red-950/30 border-brand-red/40 text-brand-red'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <span>{categories.find(c => c.key === selectedCategory)?.label}</span>
            <ChevronDown size={13} className="opacity-70" />
          </button>

          {categoryMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 shadow-2xl z-30 space-y-1">
              {categories.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(c.key);
                    setCategoryMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                    selectedCategory === c.key
                      ? 'bg-slate-900 text-white dark:bg-brand-red'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>{c.label}</span>
                  {selectedCategory === c.key && <CheckCircle2 size={13} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Dropdown */}
        <div className="relative" ref={statusRef}>
          <button
            type="button"
            onClick={() => setStatusMenuOpen(!statusMenuOpen)}
            className={`min-h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
              selectedStatus !== 'all'
                ? 'bg-red-50/70 dark:bg-red-950/30 border-brand-red/40 text-brand-red'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <span>{statuses.find(s => s.key === selectedStatus)?.label}</span>
            <ChevronDown size={13} className="opacity-70" />
          </button>

          {statusMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 shadow-2xl z-30 space-y-1">
              {statuses.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSelectedStatus(s.key);
                    setStatusMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                    selectedStatus === s.key
                      ? 'bg-slate-900 text-white dark:bg-brand-red'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>{s.label}</span>
                  {selectedStatus === s.key && <CheckCircle2 size={13} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="flex-1 min-w-[160px] max-w-xs relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search reference or programme..."
            className="w-full min-h-9 pl-8 pr-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:border-brand-red"
          />
        </div>

      </div>

      {/* 3. Monthly Financial Summary Banner */}
      <div className="px-5 py-3 bg-slate-50/80 dark:bg-slate-950/70 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative" ref={monthRef}>
            <button
              type="button"
              onClick={() => setMonthMenuOpen(!monthMenuOpen)}
              className="flex items-center gap-1.5 font-black text-xs sm:text-sm text-slate-900 dark:text-white hover:text-brand-red transition-colors cursor-pointer"
            >
              <span>{currentMonthLabel}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {monthMenuOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 shadow-2xl z-30 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth('all');
                    setMonthMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    selectedMonth === 'all' ? 'bg-slate-900 text-white dark:bg-brand-red' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  All Months
                </button>
                {availableMonths.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setSelectedMonth(m.key);
                      setMonthMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedMonth === m.key ? 'bg-slate-900 text-white dark:bg-brand-red' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
            {summary.in > 0 && (
              <span>
                Inflow: <strong className="text-slate-900 dark:text-white font-mono">{formatCurrency(summary.in)}</strong>
              </span>
            )}
            {summary.in > 0 && summary.out > 0 && <span>•</span>}
            {(summary.out > 0 || summary.in === 0) && (
              <span>
                {perspective === 'parent' || perspective === 'student' || perspective === 'school' ? 'Settled Outflow:' : 'Outflow:'}{' '}
                <strong className="text-brand-red font-mono">{formatCurrency(summary.out)}</strong>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAnalysis(true)}
          className="min-h-8 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-red hover:text-brand-red text-slate-800 dark:text-slate-100 font-black text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
        >
          <BarChart3 size={13} className="text-brand-red" />
          <span>Analysis</span>
        </button>
      </div>

      {/* 4. Transactions List Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[580px] overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-2.5">
            <FileText className="w-11 h-11 mx-auto text-slate-400 dark:text-slate-600 opacity-70" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{emptyMessage}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              When tuition settlements, programme fees, or term renewals occur, verified receipts will appear here.
            </p>
          </div>
        ) : (
          filtered.map(txn => {
            const normalizedAmount = extractPaymentAmountNaira(txn);
            const date = parseDate(txn.paidAt || txn.createdAt);
            const formattedDate = formatReceiptDate(date);
            const direction = determineTransactionDirection(txn, perspective);
            const isNegative = direction === 'outflow';
            const iconConfig = getTransactionIcon(txn, isNegative);
            const statusInfo = classifyStatusBucket(txn.status ?? (txn as any).paymentStatus);
            const details = getReceiptDetails(txn);

            return (
              <div
                key={txn.id || txn.reference}
                onClick={() => setActiveTransaction(txn)}
                className="px-5 py-3.5 flex items-center justify-between gap-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
              >
                {/* Left: Institutional Icon Box */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconConfig.bg}`}>
                  {iconConfig.icon}
                </div>

                {/* Middle: Title, Role & Date */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-brand-red transition-colors truncate">
                      {details.displayTitle}
                    </h4>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      • {details.roleLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    <span className="font-mono">{formattedDate}</span>
                    <span>•</span>
                    <span className="truncate text-slate-600 dark:text-slate-300">
                      {details.beneficiary}
                    </span>
                  </div>
                </div>

                {/* Right: Amount & Explicit Accessible Status */}
                <div className="text-right shrink-0">
                  <div className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white">
                    {isNegative ? `-${formatCurrency(normalizedAmount)}` : `+${formatCurrency(normalizedAmount)}`}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5 inline-flex items-center justify-end gap-1">
                    {statusInfo.bucket === 'successful' ? (
                      <span className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200">
                        <CheckCircle2 size={11} /> {statusInfo.label}
                      </span>
                    ) : statusInfo.bucket === 'partially_paid' ? (
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <Clock size={11} /> {statusInfo.label}
                      </span>
                    ) : statusInfo.bucket === 'pending' ? (
                      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <Clock size={11} /> {statusInfo.label}
                      </span>
                    ) : statusInfo.bucket === 'failed' || statusInfo.bucket === 'reversed' ? (
                      <span className="inline-flex items-center gap-1 text-brand-red">
                        <AlertCircle size={11} /> {statusInfo.label}
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">{statusInfo.label}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Detail View & Receipt Modal */}
      {activeTransaction && (
        <FintechTransactionDetailsModal
          transaction={activeTransaction}
          onClose={() => setActiveTransaction(null)}
        />
      )}

      {/* 6. Comprehensive Financial Analysis Workspace */}
      <FinancialAnalysisWorkspace
        isOpen={showAnalysis}
        onClose={() => setShowAnalysis(false)}
        transactions={transactions}
        role={role}
        title={title}
        initialMonthKey={selectedMonth}
        onSelectTransaction={(txn) => {
          setShowAnalysis(false);
          setActiveTransaction(txn);
        }}
      />
    </div>
  );
};
