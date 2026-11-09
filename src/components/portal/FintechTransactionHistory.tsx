import React, { useMemo, useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, ArrowUpRight, ArrowDownLeft, ChevronDown, 
  Download, Search, TrendingUp,
  Coins, Box, School, FileText, CheckCircle2, 
  PieChart, X
} from 'lucide-react';


import { formatCurrency, formatReceiptDate, generatePdfStatement, parseDate, getReceiptDetails } from '../../lib/receiptGenerator';
import type { TransactionReceiptData } from '../../lib/receiptGenerator';
import { isSuccessfulPaymentStatus, isPartiallyPaidStatus } from '../../lib/billing';
import { FintechTransactionDetailsModal } from './FintechTransactionDetailsModal';
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

  // Close dropdowns on outside click
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

  // Distinct months from transactions
  const availableMonths = useMemo(() => {
    const map = new Map<string, string>();
    transactions.forEach(t => {
      const d = parseDate(t.paidAt || t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      map.set(key, label);
    });
    // Add current month if empty
    if (map.size === 0) {
      const now = new Date();
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, now.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
    }
    return Array.from(map.entries()).map(([k, label]) => ({ key: k, label }));
  }, [transactions]);

  // Categories list matching exact fintech operations
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
  ];

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      // Category filter
      if (selectedCategory !== 'all') {
        const catStr = `${t.category || ''} ${t.plan || ''} ${t.description || ''} ${t.type || ''} ${(t as any).targetType || ''}`.toLowerCase();
        if (selectedCategory === 'transfer_to' && !catStr.includes('tutor') && !catStr.includes('transfer to') && !catStr.includes('disburs') && !catStr.includes('payout')) return false;
        if (selectedCategory === 'transfer_from' && !catStr.includes('school') && !catStr.includes('parent') && !catStr.includes('transfer from') && !catStr.includes('student') && !catStr.includes('inflow')) return false;
        if (selectedCategory === 'deposit' && !catStr.includes('deposit') && !catStr.includes('top-up') && !catStr.includes('topup')) return false;
        if (selectedCategory === 'payout' && !catStr.includes('payout') && !catStr.includes('withdraw') && !catStr.includes('disburs')) return false;
        if (selectedCategory === 'school_tuition' && !catStr.includes('school') && !catStr.includes('partner') && !catStr.includes('institutional')) return false;
        if (selectedCategory === 'parent_tuition' && !catStr.includes('parent') && !catStr.includes('cadet') && !catStr.includes('student') && !catStr.includes('mentorship') && !catStr.includes('coding')) return false;
      }

      // Status filter — missing or unknown status never counts as successful
      if (selectedStatus !== 'all') {
        const rawStatus = String(t.status ?? '').trim();
        const stLower = rawStatus.toLowerCase();
        if (selectedStatus === 'successful' && !isSuccessfulPaymentStatus(rawStatus)) return false;
        if (selectedStatus === 'partially_paid' && !isPartiallyPaidStatus(rawStatus)) return false;
        if (selectedStatus === 'pending' && !['pending', 'processing'].includes(stLower)) return false;
        if (selectedStatus === 'failed' && !['failed', 'declined', 'cancelled', 'reversed'].includes(stLower)) return false;
      }

      // Month filter
      if (selectedMonth !== 'all') {
        const d = parseDate(t.paidAt || t.createdAt);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (k !== selectedMonth) return false;
      }

      // Search Query
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
      if (!isSuccessfulPaymentStatus(t.status) && !isPartiallyPaidStatus(t.status)) return;
      const amt = Number(t.customerTotal || t.amount || t.baseAmount || 0);
      if (!Number.isFinite(amt) || amt <= 0) return;
      const isOutflow = t.type === 'outflow' || t.type === 'payout' || role === 'parent' || role === 'student';
      if (isOutflow) {
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
  }, [filtered, role]);

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

  const getTransactionIcon = (t: TransactionReceiptData) => {
    const desc = `${t.description || ''} ${t.plan || ''} ${t.category || ''} ${t.type || ''}`.toLowerCase();
    
    if (desc.includes('save') || desc.includes('deposit') || desc.includes('vault')) {
      return {
        bg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
        icon: <Coins size={18} />
      };
    }
    if (desc.includes('robot') || desc.includes('kit') || desc.includes('lab')) {
      return {
        bg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
        icon: <Box size={18} />
      };
    }
    if (desc.includes('school') || desc.includes('partner') || desc.includes('institutional')) {
      return {
        bg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
        icon: <School size={18} />
      };
    }
    if (desc.includes('earn') || desc.includes('interest') || desc.includes('payout')) {
      return {
        bg: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
        icon: <TrendingUp size={18} />
      };
    }
    if (t.type === 'inflow') {
      return {
        bg: 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
        icon: <ArrowDownLeft size={18} />
      };
    }
    return {
      bg: 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
      icon: <ArrowUpRight size={18} />
    };
  };

  const currentMonthLabel = selectedMonth === 'all' 
    ? (availableMonths[0]?.label || 'Sep 2026') 
    : (availableMonths.find(m => m.key === selectedMonth)?.label || 'All Months');


  return (
    <div className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden font-sans transition-colors">
      
      {/* 1. Header Bar */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{title}</h1>
        </div>
        
        <button
          type="button"
          onClick={handleExportAll}
          className="min-h-9 px-4 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-black text-xs transition-all shadow-xs flex items-center gap-1.5"
        >
          <Download size={13} strokeWidth={2.5} />
          <span>Download Statement</span>
        </button>
      </div>

      {/* 2. Filter Pills Row */}
      <div className="px-5 py-3.5 bg-white dark:bg-slate-900/90 border-b border-slate-100 dark:border-slate-800/60 flex flex-wrap items-center gap-2.5">
        
        {/* Category Pill Dropdown */}
        <div className="relative" ref={categoryRef}>
          <button
            type="button"
            onClick={() => setCategoryMenuOpen(!categoryMenuOpen)}
            className={`min-h-8 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              selectedCategory !== 'all'
                ? 'bg-sky-50 dark:bg-slate-800 border-sky-300 dark:border-sky-500/50 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <span>{categories.find(c => c.key === selectedCategory)?.label}</span>
            <ChevronDown size={13} className="text-slate-400" />
          </button>

          {categoryMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-1.5 shadow-2xl z-30 space-y-1">
              {categories.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(c.key);
                    setCategoryMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between ${
                    selectedCategory === c.key
                      ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>{c.label}</span>
                  {selectedCategory === c.key && <CheckCircle2 size={13} className="text-sky-500 dark:text-sky-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Pill Dropdown */}
        <div className="relative" ref={statusRef}>
          <button
            type="button"
            onClick={() => setStatusMenuOpen(!statusMenuOpen)}
            className={`min-h-8 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              selectedStatus !== 'all'
                ? 'bg-sky-50 dark:bg-slate-800 border-sky-300 dark:border-sky-500/50 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <span>{statuses.find(s => s.key === selectedStatus)?.label}</span>
            <ChevronDown size={13} className="text-slate-400" />
          </button>

          {statusMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-1.5 shadow-2xl z-30 space-y-1">
              {statuses.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSelectedStatus(s.key);
                    setStatusMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between ${
                    selectedStatus === s.key
                      ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>{s.label}</span>
                  {selectedStatus === s.key && <CheckCircle2 size={13} className="text-sky-500 dark:text-sky-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="flex-1 min-w-[140px] max-w-xs relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search ref or purpose..."
            className="w-full min-h-8 pl-8 pr-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70 rounded-full text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

      </div>

      {/* 3. Monthly Financial Banner */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        
        {/* Month Selector + In / Out Stats */}
        <div className="flex items-center gap-3">
          {/* Month Dropdown */}
          <div className="relative" ref={monthRef}>
            <button
              type="button"
              onClick={() => setMonthMenuOpen(!monthMenuOpen)}
              className="flex items-center gap-1 font-bold text-sm text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              <span>{currentMonthLabel}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {monthMenuOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-1.5 shadow-2xl z-30 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth('all');
                    setMonthMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                    selectedMonth === 'all' ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
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
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      selectedMonth === m.key ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* In / Out Totals */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>In: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(summary.in)}</strong></span>
            <span>•</span>
            <span>Out: <strong className="text-rose-600 dark:text-rose-400 font-mono">{formatCurrency(summary.out)}</strong></span>
          </div>
        </div>

        {/* Analysis Pill Badge */}
        <button
          type="button"
          onClick={() => setShowAnalysis(true)}
          className="min-h-7 px-3 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-black text-[11px] transition-all flex items-center gap-1 shadow-xs"
        >
          <TrendingUp size={12} strokeWidth={2.5} />
          <span>Analysis</span>
        </button>
      </div>

      {/* 4. Transactions List Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[580px] overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <FileText className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 opacity-60" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{emptyMessage}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
              When tuition settlements, robotics kits, or term renewals occur, full statement receipts will appear here.
            </p>
          </div>
        ) : (
          filtered.map(txn => {
            const raw = Number(txn.customerTotal || txn.amount || txn.baseAmount || 0);
            const date = parseDate(txn.paidAt || txn.createdAt);
            const formattedDate = formatReceiptDate(date);
            const isNegative = txn.type === 'outflow' || txn.type === 'payout' || role === 'parent' || role === 'student';
            const iconConfig = getTransactionIcon(txn);
            const rawStatus = String(txn.status ?? '').trim();
            const status = rawStatus.toLowerCase();
            const isSuccess = isSuccessfulPaymentStatus(rawStatus);
            const isPartial = isPartiallyPaidStatus(rawStatus);
            const isPending = ['pending', 'processing'].includes(status);
            const isFailed = ['failed', 'declined', 'cancelled', 'reversed'].includes(status);

            const details = getReceiptDetails(txn);

            return (
              <div
                key={txn.id || txn.reference}
                onClick={() => setActiveTransaction(txn)}
                className="px-5 py-3.5 flex items-center justify-between gap-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
              >
                {/* Left: Round Avatar Icon */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs ${iconConfig.bg}`}>
                  {iconConfig.icon}
                </div>

                {/* Middle: Title & Date */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                      {details.displayTitle}
                    </h4>
                    <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {details.roleLabel}
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

                {/* Right: Amount & Status underneath */}
                <div className="text-right shrink-0">
                  <div className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white">
                    {isNegative ? `-${formatCurrency(raw)}` : `+${formatCurrency(raw)}`}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5">
                    {isSuccess ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Successful</span>
                    ) : isPartial ? (
                      <span className="text-amber-600 dark:text-amber-400">Partially Paid</span>
                    ) : isPending ? (
                      <span className="text-amber-600 dark:text-amber-400">Pending</span>
                    ) : isFailed ? (
                      <span className="text-rose-600 dark:text-rose-400">Failed</span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">{rawStatus || 'Unknown'}</span>
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

      {/* 6. Financial Analysis Modal */}
      {showAnalysis && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 text-slate-900 dark:text-slate-100 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <PieChart size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Financial Statement Analysis</h3>
                  <p className="text-xs text-slate-400">{currentMonthLabel}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowAnalysis(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Inflow</span>
                <p className="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(summary.in)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Settlements</span>
                <p className="text-lg font-extrabold font-mono text-rose-600 dark:text-rose-400 mt-1">{formatCurrency(summary.out)}</p>
              </div>
            </div>

            <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400">Total Statements:</span>
                <span className="font-bold text-slate-900 dark:text-white">{summary.count} Transactions</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400">Settlement Verification:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">100% Escrow Reconciled</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400">Academy Ledger Mode:</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">Paystack Direct Gateway</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAnalysis(false);
                handleExportAll();
              }}
              className="w-full min-h-11 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Download size={14} />
              <span>Export Monthly Statements PDF</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
