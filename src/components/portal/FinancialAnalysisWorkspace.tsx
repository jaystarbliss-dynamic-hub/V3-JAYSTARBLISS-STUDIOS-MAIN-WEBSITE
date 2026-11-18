import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  Download,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  RotateCcw,
  Search,
  TrendingUp,
  X
} from 'lucide-react';
import {
  buildFinancialAnalytics,
  type AnalyticsDateRange,
  type AnalyticsDirection,
  type AnalyticsStatusBucket
} from '../../lib/financialAnalytics';
import { formatCurrency, formatReceiptDate, generatePdfStatement, type TransactionReceiptData } from '../../lib/receiptGenerator';
import { useToast } from '../../contexts/ToastContext';

const BRAND_CHART_COLORS = [
  '#1E293B', // Jaystarbliss Navy
  '#B91C1C', // Jaystarbliss Crimson
  '#475569', // Slate 600
  '#DC2626', // Crimson 600
  '#64748B', // Slate 500
  '#94A3B8', // Slate 400
];

const STATUS_CHART_COLORS: Record<string, string> = {
  successful: '#1E293B',
  partially_paid: '#475569',
  pending: '#94A3B8',
  failed: '#B91C1C',
  reversed: '#7F1D1D',
  unknown: '#CBD5E1',
};

export interface FinancialAnalysisWorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: TransactionReceiptData[];
  role?: string;
  title?: string;
  initialMonthKey?: string;
  onSelectTransaction?: (transaction: TransactionReceiptData) => void;
}

export const FinancialAnalysisWorkspace: React.FC<FinancialAnalysisWorkspaceProps> = ({
  isOpen,
  onClose,
  transactions,
  role = 'student',
  title = 'Financial Statement Analysis',
  initialMonthKey = 'all',
  onSelectTransaction
}) => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(
    initialMonthKey && initialMonthKey !== 'all' ? 'month' : 'all'
  );
  const [monthKey, setMonthKey] = useState<string>(initialMonthKey || 'all');
  const [status, setStatus] = useState<AnalyticsStatusBucket>('all');
  const [programme, setProgramme] = useState<string>('all');
  const [direction, setDirection] = useState<AnalyticsDirection>('all');
  const [entity, setEntity] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const analytics = useMemo(
    () =>
      buildFinancialAnalytics(transactions, role, {
        dateRange,
        monthKey: dateRange === 'month' || monthKey !== 'all' ? monthKey : 'all',
        status,
        programme,
        direction,
        entity,
        search
      }),
    [transactions, role, dateRange, monthKey, status, programme, direction, entity, search]
  );

  if (!isOpen) return null;

  const hasActiveFilters =
    dateRange !== 'all' ||
    monthKey !== 'all' ||
    status !== 'all' ||
    programme !== 'all' ||
    direction !== 'all' ||
    entity !== 'all' ||
    search.trim() !== '';

  const resetFilters = () => {
    setDateRange('all');
    setMonthKey('all');
    setStatus('all');
    setProgramme('all');
    setDirection('all');
    setEntity('all');
    setSearch('');
  };

  const handleExportPdf = () => {
    if (analytics.records.length === 0) {
      toast.error('No matching transactions available to export.');
      return;
    }
    generatePdfStatement(
      analytics.records.map((r) => r.raw),
      {
        title: `${title} (${analytics.records.length} Record${analytics.records.length === 1 ? '' : 's'})`,
        periodLabel: analytics.periodLabel,
        accountLabel: analytics.rolePerspective
      }
    );
    toast.success(`Exported official statement for ${analytics.records.length} record${analytics.records.length === 1 ? '' : 's'}.`);
  };

  const perspectiveVerifiedLabel =
    analytics.rolePerspective === 'parent'
      ? 'Verified Tuition Paid'
      : analytics.rolePerspective === 'school'
      ? 'Verified Institutional Spend'
      : analytics.rolePerspective === 'student'
      ? 'Verified Tuition Paid'
      : analytics.rolePerspective === 'staff'
      ? 'Verified Credits & Payouts'
      : 'Verified Settled Volume';

  const statusBadgeClass = (bucket: string) => {
    if (bucket === 'successful') {
      return 'border-slate-300 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-800';
    }
    if (bucket === 'partially_paid') {
      return 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100';
    }
    if (bucket === 'failed' || bucket === 'reversed') {
      return 'border-brand-red/30 bg-red-50 text-brand-red dark:border-brand-red/40 dark:bg-red-950/30';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex h-full sm:h-auto sm:max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden sm:rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
        {/* Top Bar */}
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-brand-red">
              <BarChart3 size={14} />
              <span>Financial Analytics Workspace</span>
            </div>
            <h2 className="mt-0.5 truncate text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Period: <strong className="text-slate-800 dark:text-slate-200">{analytics.periodLabel}</strong>
              {' • '}
              Showing <strong className="font-mono text-slate-800 dark:text-slate-200">{analytics.kpis.totalRecords}</strong> of{' '}
              <strong className="font-mono text-slate-800 dark:text-slate-200">{analytics.allNormalizedCount}</strong> records
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={analytics.records.length === 0}
              className="min-h-9 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:opacity-40 dark:bg-brand-red dark:hover:bg-red-800 cursor-pointer"
            >
              <Download size={14} />
              <span>Export PDF Statement</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close analysis workspace"
              className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          {/* Controls & Filters */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <Filter size={13} className="text-brand-red" />
                <span>Analysis Filters</span>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-red hover:underline cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
              <select
                value={dateRange}
                onChange={(e) => {
                  const val = e.target.value as AnalyticsDateRange;
                  setDateRange(val);
                  if (val !== 'month') setMonthKey('all');
                }}
                aria-label="Filter by date range"
                className="min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Time</option>
                <option value="12m">Last 12 Months</option>
                <option value="year">Current Year ({new Date().getFullYear()})</option>
                <option value="month">Specific Month</option>
              </select>

              <select
                value={monthKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setMonthKey(val);
                  if (val !== 'all') setDateRange('month');
                }}
                aria-label="Filter by month"
                className="min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Months</option>
                {analytics.filterOptions.months.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AnalyticsStatusBucket)}
                aria-label="Filter by status"
                className="min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="successful">Successful</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="reversed">Reversed / Cancelled</option>
                <option value="unknown">Unknown</option>
              </select>

              <select
                value={programme}
                onChange={(e) => setProgramme(e.target.value)}
                aria-label="Filter by programme"
                className="min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Programmes</option>
                {analytics.filterOptions.programmes.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                aria-label="Filter by learner or account"
                className="min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Accounts / Learners</option>
                {analytics.filterOptions.entities.map((ent) => (
                  <option key={ent} value={ent}>{ent}</option>
                ))}
              </select>

              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Reference, payer, channel..."
                  className="min-h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-red focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {(analytics.rolePerspective === 'admin' || analytics.rolePerspective === 'staff') && (
              <div className="mt-2.5 flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-500">Direction:</span>
                {(['all', 'inflow', 'outflow'] as AnalyticsDirection[]).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setDirection(dir)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize transition-colors cursor-pointer ${
                      direction === dir
                        ? 'bg-slate-900 text-white dark:bg-brand-red'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {dir === 'all' ? 'All Directions' : dir}
                  </button>
                ))}
              </div>
            )}
          </section>

          {analytics.records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <FileText size={36} className="mx-auto text-slate-400" />
              <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white">
                No Matching Financial Records Found
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                {analytics.allNormalizedCount === 0
                  ? 'No transactions have been recorded for this account yet. Verified Paystack settlements and receipts will populate analytics automatically.'
                  : 'Try adjusting or resetting your active filters to view available financial records.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-brand-red cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* KPI Overview Strip */}
              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {perspectiveVerifiedLabel}
                  </p>
                  <p className="mt-1.5 font-mono text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    {formatCurrency(analytics.kpis.verifiedPaidTotal)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {analytics.kpis.successfulCount + analytics.kpis.partiallyPaidCount} verified settlement
                    {analytics.kpis.successfulCount + analytics.kpis.partiallyPaidCount === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {analytics.kpis.inflowTotal > 0 && analytics.kpis.outflowTotal > 0
                      ? 'Inflow / Outflow'
                      : analytics.kpis.inflowTotal > 0
                      ? 'Verified Inflow'
                      : 'Verified Outflow'}
                  </p>
                  {analytics.kpis.inflowTotal > 0 && analytics.kpis.outflowTotal > 0 ? (
                    <div className="mt-1.5 space-y-0.5 font-mono text-xs sm:text-sm font-black">
                      <p className="text-slate-900 dark:text-white">+{formatCurrency(analytics.kpis.inflowTotal)}</p>
                      <p className="text-brand-red">-{formatCurrency(analytics.kpis.outflowTotal)}</p>
                    </div>
                  ) : (
                    <p className={`mt-1.5 font-mono text-lg sm:text-xl font-black ${analytics.kpis.outflowTotal > 0 ? 'text-brand-red' : 'text-slate-900 dark:text-white'}`}>
                      {formatCurrency(analytics.kpis.inflowTotal > 0 ? analytics.kpis.inflowTotal : analytics.kpis.outflowTotal)}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Total recorded volume: {formatCurrency(analytics.kpis.totalVolume)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Average Verified Payment
                  </p>
                  <p className="mt-1.5 font-mono text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    {formatCurrency(analytics.kpis.averageVerifiedTransaction)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {analytics.kpis.successRatePercent !== null
                      ? `${analytics.kpis.successRatePercent}% settlement success rate`
                      : 'No completed records'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {analytics.kpis.outstandingPartialBalance > 0
                      ? 'Remaining Balance'
                      : analytics.kpis.verifiedGatewayFeesTotal > 0
                      ? 'Verified Gateway Fees'
                      : 'Pending / Failed Count'}
                  </p>
                  {analytics.kpis.outstandingPartialBalance > 0 ? (
                    <>
                      <p className="mt-1.5 font-mono text-lg sm:text-xl font-black text-brand-red">
                        {formatCurrency(analytics.kpis.outstandingPartialBalance)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        From {analytics.kpis.partiallyPaidCount} partial installment(s)
                      </p>
                    </>
                  ) : analytics.kpis.verifiedGatewayFeesTotal > 0 ? (
                    <>
                      <p className="mt-1.5 font-mono text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                        {formatCurrency(analytics.kpis.verifiedGatewayFeesTotal)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Paystack confirmed fees
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1.5 font-mono text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                        {analytics.kpis.pendingCount + analytics.kpis.failedCount + analytics.kpis.reversedCount}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {analytics.kpis.pendingCount} pending • {analytics.kpis.failedCount + analytics.kpis.reversedCount} failed/reversed
                      </p>
                    </>
                  )}
                </div>
              </section>

              {/* Charts Row 1: Monthly Trends + Status Distribution */}
              <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <TrendingUp size={15} className="text-brand-red" />
                        <span>Monthly Payment Trends</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Verified settlement amounts grouped by transaction month
                      </p>
                    </div>
                  </div>
                  <div className="h-64 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.monthlyTrends} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="jbNavyArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1E293B" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="#1E293B" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => (v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`)}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const pt = payload[0].payload;
                            return (
                              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                <p className="font-black text-slate-900 dark:text-white">{pt.label}</p>
                                <p className="mt-1 text-slate-600 dark:text-slate-300">
                                  Verified: <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(pt.verifiedAmount)}</strong>
                                </p>
                                <p className="text-slate-500 dark:text-slate-400">
                                  Total Volume: <strong className="font-mono">{formatCurrency(pt.totalVolume)}</strong>
                                </p>
                                <p className="text-slate-500 dark:text-slate-400">
                                  Transactions: <strong>{pt.count}</strong> ({pt.verifiedCount} verified)
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="verifiedAmount"
                          name="Verified Amount"
                          stroke="#1E293B"
                          strokeWidth={2.5}
                          fill="url(#jbNavyArea)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Status Distribution Donut */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Status Distribution
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                    Counts exclude failed or pending records from verified totals
                  </p>
                  <div className="h-48 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.statusDistribution}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={45}
                          outerRadius={72}
                          paddingAngle={2}
                        >
                          {analytics.statusDistribution.map((entry) => (
                            <Cell
                              key={entry.key}
                              fill={STATUS_CHART_COLORS[entry.key] || '#64748B'}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: unknown, _name: unknown, props: any) => [
                            `${value} record(s) (${formatCurrency(props?.payload?.amount || 0)})`,
                            props?.payload?.label || 'Status'
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    {analytics.statusDistribution.map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-xs"
                            style={{ backgroundColor: STATUS_CHART_COLORS[s.key] || '#64748B' }}
                          />
                          <span className="truncate font-semibold text-slate-700 dark:text-slate-300">
                            {s.label}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono font-bold text-slate-900 dark:text-white">
                          {s.count} ({s.sharePercent}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Charts Row 2: Programme Breakdown + Verified Channel Analysis */}
              <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Breakdown by Programme &amp; Service
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                    Verified payment distribution across programmes
                  </p>
                  <div className="h-60 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analytics.programmeBreakdown.slice(0, 6)}
                        layout="vertical"
                        margin={{ top: 0, right: 18, left: 10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => (v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`)}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={125}
                          tick={{ fontSize: 11, fill: '#334155' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(val: unknown, _n: unknown, props: any) => [
                            `${formatCurrency(Number(val || 0))} (${props?.payload?.count || 0} txns)`,
                            props?.payload?.label || 'Programme'
                          ]}
                        />
                        <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                          {analytics.programmeBreakdown.slice(0, 6).map((_, idx) => (
                            <Cell key={idx} fill={idx === 0 ? '#B91C1C' : '#1E293B'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Verified Paystack Channel Analysis */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Paystack Channel Distribution
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                    Actual Paystack checkout channels recorded on verified transactions
                  </p>
                  <div className="h-44 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analytics.channelBreakdown}
                        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => (v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`)}
                        />
                        <Tooltip
                          formatter={(val: unknown, _n: unknown, props: any) => [
                            `${formatCurrency(Number(val || 0))} (${props?.payload?.count || 0} records)`,
                            props?.payload?.label || 'Channel'
                          ]}
                        />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                          {analytics.channelBreakdown.map((ch, idx) => (
                            <Cell
                              key={ch.key}
                              fill={ch.label === 'Unknown / Not Recorded' ? '#94A3B8' : BRAND_CHART_COLORS[idx % BRAND_CHART_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    {analytics.channelBreakdown.map((ch) => (
                      <div key={ch.key} className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{ch.label}</span>
                        <span className="font-mono text-slate-900 dark:text-white font-bold">
                          {formatCurrency(ch.amount)} • {ch.count} txn{ch.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Row 3: Ranked Learner/Account Breakdown + Transaction Statistics */}
              <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Ranked Entity Breakdown */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        {analytics.entitySectionTitle}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Ranked contribution across authorized records
                      </p>
                    </div>
                    <Layers size={16} className="text-slate-400" />
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {analytics.entityBreakdown.slice(0, 8).map((row, index) => (
                      <div key={row.name} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-5 text-xs font-black font-mono text-brand-red shrink-0">
                            {index + 1}.
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
                            {analytics.rolePerspective === 'school' ? <Building2 size={15} /> : <GraduationCap size={15} />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                              {row.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {row.sublabel} • {row.count} record{row.count === 1 ? '' : 's'} ({row.sharePercent}%)
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                            {formatCurrency(row.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Transaction Statistics */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Transaction Statistics
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                    Computed strictly from verified &amp; recorded entries
                  </p>
                  <dl className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    <div className="flex items-center justify-between gap-2 py-2.5">
                      <dt className="text-slate-500 dark:text-slate-400">Highest Transaction</dt>
                      <dd className="text-right font-mono font-bold text-slate-900 dark:text-white">
                        {analytics.statistics.highestTransaction ? formatCurrency(analytics.statistics.highestTransaction.amount) : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-2.5">
                      <dt className="text-slate-500 dark:text-slate-400">Lowest Transaction</dt>
                      <dd className="text-right font-mono font-bold text-slate-900 dark:text-white">
                        {analytics.statistics.lowestTransaction ? formatCurrency(analytics.statistics.lowestTransaction.amount) : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-2.5">
                      <dt className="text-slate-500 dark:text-slate-400">Average (All Records)</dt>
                      <dd className="text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(analytics.statistics.averageTransaction)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-2.5">
                      <dt className="text-slate-500 dark:text-slate-400">Most Active Month</dt>
                      <dd className="text-right font-bold text-slate-900 dark:text-white">
                        {analytics.statistics.mostActivePeriod
                          ? `${analytics.statistics.mostActivePeriod.label} (${analytics.statistics.mostActivePeriod.count})`
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-2.5">
                      <dt className="text-slate-500 dark:text-slate-400">Avg. Records / Month</dt>
                      <dd className="text-right font-mono font-bold text-slate-900 dark:text-white">
                        {analytics.statistics.avgMonthlyCount}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-2.5">
                      <dt className="text-slate-500 dark:text-slate-400">Verified Gateway Fees</dt>
                      <dd className="text-right font-mono font-bold text-slate-900 dark:text-white">
                        {analytics.kpis.verifiedGatewayFeesTotal > 0
                          ? formatCurrency(analytics.kpis.verifiedGatewayFeesTotal)
                          : 'Not Verified'}
                      </dd>
                    </div>
                    {analytics.kpis.estimatedFeesTotal > 0 && (
                      <div className="flex items-center justify-between gap-2 py-2.5">
                        <dt className="text-slate-500 dark:text-slate-400">Estimated Fees (Unverified)</dt>
                        <dd className="text-right font-mono font-bold text-slate-600 dark:text-slate-300">
                          {formatCurrency(analytics.kpis.estimatedFeesTotal)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </section>

              {/* Detailed Transaction Table */}
              <section className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      Detailed Transaction Analysis ({analytics.records.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Select any record to inspect its official receipt and Paystack audit metadata
                    </p>
                  </div>
                </div>

                {/* Desktop & Tablet Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Payer</th>
                        <th className="px-4 py-3">Beneficiary</th>
                        <th className="px-4 py-3">Programme</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Channel</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {analytics.records.map((rec) => (
                        <tr
                          key={rec.id || rec.reference}
                          onClick={() => onSelectTransaction?.(rec.raw)}
                          className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {rec.date ? formatReceiptDate(rec.date) : 'Undated'}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-800 dark:text-slate-200 max-w-[140px] truncate">
                            {rec.reference}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white max-w-[140px] truncate">
                            {rec.payerName}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[170px] truncate">
                            {rec.beneficiaryName}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200 max-w-[160px] truncate">
                            {rec.programmeName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${statusBadgeClass(rec.statusBucket)}`}>
                              {rec.statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {rec.channelLabel}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-black text-slate-900 dark:text-white whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              {rec.direction === 'outflow' ? (
                                <ArrowUpRight size={12} className="text-brand-red" />
                              ) : (
                                <ArrowDownLeft size={12} className="text-slate-700 dark:text-slate-300" />
                              )}
                              {rec.direction === 'outflow' ? '-' : '+'}
                              {formatCurrency(rec.amountNaira)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Stacked List */}
                <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                  {analytics.records.map((rec) => (
                    <button
                      key={rec.id || rec.reference}
                      type="button"
                      onClick={() => onSelectTransaction?.(rec.raw)}
                      className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                            {rec.programmeName}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {rec.beneficiaryName}
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-xs font-black text-slate-900 dark:text-white">
                          {rec.direction === 'outflow' ? '-' : '+'}
                          {formatCurrency(rec.amountNaira)}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {rec.date ? formatReceiptDate(rec.date) : 'Undated'} • {rec.channelLabel}
                        </span>
                        <span className={`rounded-md border px-2 py-0.5 font-black uppercase ${statusBadgeClass(rec.statusBucket)}`}>
                          {rec.statusLabel}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinancialAnalysisWorkspace;
