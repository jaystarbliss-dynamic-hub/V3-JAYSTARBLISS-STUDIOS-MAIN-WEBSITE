import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  FileText,
  History,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Layers,
  Calendar,
  Headphones,
  Info,
  Monitor,
  Clock,
} from 'lucide-react';
import { formatNaira } from '../../lib/billing';
import billingLightHeroArt from '../../assets/images/billing_fees_editorial_3d_1795295812678.jpg';
import billingDarkHeroArt from '../../assets/images/billing_fees_obsidian_3d_1795350258348.jpg';
import {
  PaystackLogo,
  FlutterwaveLogo,
  StripeLogo,
} from '../billing/PaymentGatewayLogos';

export type BillingSubTab = 'overview' | 'structure' | 'history' | 'methods';

export interface BillingFeeLineSummary {
  id: string;
  title: string;
  subtitle?: string;
  amount: number;
  paidAmount?: number;
  remainingAmount?: number;
  durationLabel: string;
  statusLabel: string;
  statusTone: 'active' | 'due' | 'partial' | 'pending';
}

export interface BillingEditorialShellProps {
  role: 'school' | 'parent' | 'student';
  subtitle: string;
  sessionLabel?: string;
  totalFees: number;
  amountPaid: number;
  balanceDue: number;
  payableNowAmount?: number;
  dueDateLabel: string;
  activeTab: BillingSubTab;
  onTabChange: (tab: BillingSubTab) => void;
  onRefresh: () => void;
  onMakePayment: () => void;
  paymentDisabled?: boolean;
  feeSummaryItems?: BillingFeeLineSummary[];
  banners?: React.ReactNode;
  feeStructureSlot: React.ReactNode;
  paymentHistorySlot: React.ReactNode;
}

export const BillingEditorialShell: React.FC<BillingEditorialShellProps> = ({
  role,
  subtitle,
  sessionLabel = 'Current Session',
  totalFees,
  amountPaid,
  balanceDue,
  payableNowAmount,
  dueDateLabel,
  activeTab,
  onTabChange,
  onRefresh,
  onMakePayment,
  paymentDisabled = false,
  feeSummaryItems = [],
  banners,
  feeStructureSlot,
  paymentHistorySlot,
}) => {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const safeTotal = Math.max(0, Number(totalFees || 0));
  const safePaid = Math.max(0, Number(amountPaid || 0));
  const safeDue = Math.max(0, Number(balanceDue || 0));
  const denominator = safeTotal > 0 ? safeTotal : safePaid + safeDue;
  const pctPaid =
    denominator > 0
      ? Math.min(100, Math.round((safePaid / denominator) * 100))
      : safePaid > 0
      ? 100
      : 0;

  const effectivePayNow =
    typeof payableNowAmount === 'number' && payableNowAmount > 0
      ? payableNowAmount
      : safeDue > 0
      ? safeDue
      : denominator;

  const tabs: { id: BillingSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Fees Overview', icon: <LayoutGrid size={14} /> },
    { id: 'structure', label: 'Fee Structure', icon: <FileText size={14} /> },
    { id: 'history', label: 'Payment History', icon: <History size={14} /> },
    { id: 'methods', label: 'Payment Methods', icon: <CreditCard size={14} /> },
  ];

  const supportPath = `/portal/${role}/support`;

  // Circular SVG progress ring metrics
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - pctPaid / 100);

  const primaryProgram = feeSummaryItems[0] || {
    id: 'primary-account',
    title:
      role === 'school'
        ? 'Institutional Programme Partnership'
        : role === 'parent'
        ? 'Family Tuition Programme'
        : 'Technology Programme',
    subtitle:
      role === 'school'
        ? 'Active partner school curriculum tracks'
        : role === 'parent'
        ? 'Enrolled learners & active tracks'
        : 'Digital Literacy, Coding & Applied Tech',
    amount: denominator,
    paidAmount: safePaid,
    remainingAmount: safeDue,
    durationLabel: sessionLabel,
    statusLabel: safeDue > 0 ? 'Payment Due' : 'Active',
    statusTone: (safeDue > 0 ? 'due' : 'active') as 'active' | 'due',
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-10 sm:pb-12">
      {/* Editorial Hero Banner with Integrated Tab Bar */}
      <header className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] shadow-xs">
        {/* Background Artwork — Light & Matte Obsidian Dark */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          <img
            src={billingLightHeroArt}
            alt=""
            aria-hidden="true"
            className="block dark:hidden absolute right-0 top-0 h-full w-full md:w-[55%] object-cover object-center opacity-25 md:opacity-90"
          />
          <img
            src={billingDarkHeroArt}
            alt=""
            aria-hidden="true"
            className="hidden dark:block absolute right-0 top-0 h-full w-full md:w-[62%] object-cover object-center opacity-45 md:opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/15 dark:from-[#09090B] dark:via-[#09090B]/90 dark:to-[#09090B]/15" />
          <div className="hidden dark:block absolute -top-24 right-1/4 w-72 h-72 rounded-full bg-[#B91C1C]/12 blur-3xl" />
        </div>

        <div className="relative z-10 px-4 sm:px-7 pt-5 sm:pt-7 pb-4 sm:pb-5 space-y-4 sm:space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
            <div className="space-y-1.5 max-w-xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#14284B] dark:text-white leading-tight">
                Billing <span className="text-[#B91C1C]">&amp;</span> Fees
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed max-w-lg">
                {subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#14284B] hover:bg-[#1E3A6D] dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-transparent dark:border-zinc-800 text-white text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer self-start shrink-0"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Integrated Segmented Navigation Tabs */}
          <nav
            aria-label="Billing sections"
            className="inline-flex max-w-full items-center gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-[#141418]/90 border border-slate-200/80 dark:border-zinc-800 overflow-x-auto no-scrollbar backdrop-blur-xs"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    active
                      ? 'bg-[#B91C1C] text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-[#14284B] dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/70'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Optional Notices / Banners */}
      {banners}

      {/* ============================================================ */}
      {/* TAB 1: FEES OVERVIEW                                         */}
      {/* ============================================================ */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Full-Width Payment Progress & Outstanding Balance Strip */}
          <section
            aria-label="Payment progress"
            className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 shadow-2xs"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 lg:gap-6">
              {/* Left: Circular Progress Ring + Bar */}
              <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0">
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
                  <svg
                    viewBox="0 0 80 80"
                    className="w-full h-full -rotate-90"
                    aria-hidden="true"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r={ringRadius}
                      fill="none"
                      strokeWidth="7"
                      className="stroke-slate-100 dark:stroke-zinc-800"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r={ringRadius}
                      fill="none"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      className="stroke-[#B91C1C] transition-all duration-700 ease-out"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm sm:text-base font-extrabold text-[#14284B] dark:text-white tabular-nums">
                    {pctPaid}%
                  </span>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white">
                      Your Payment Progress
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                      You&apos;ve paid{' '}
                      <strong className="text-[#14284B] dark:text-white font-bold">
                        {pctPaid}%
                      </strong>{' '}
                      of your total fees · Due:{' '}
                      <span className="font-semibold text-slate-700 dark:text-zinc-300">
                        {dueDateLabel}
                      </span>
                    </p>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-zinc-800/90 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#991B1B] to-[#DC2626] transition-all duration-700"
                      style={{ width: `${pctPaid}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Vertical Divider */}
              <div className="hidden lg:block w-px h-14 bg-slate-200 dark:bg-zinc-800 shrink-0" />

              {/* Right: Outstanding Balance + View Details */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-zinc-800 shrink-0">
                <div>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    Outstanding Balance
                  </p>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[#14284B] dark:text-white tabular-nums tracking-tight mt-0.5">
                    {formatNaira(safeDue)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onTabChange('structure')}
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl border border-[#B91C1C]/40 hover:border-[#B91C1C] bg-red-50/50 dark:bg-[#B91C1C]/10 hover:bg-red-50 dark:hover:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-red-400 text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  <span>View Details</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </section>

          {/* 2-Column Main Workspace (8 cols Left | 4 cols Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* LEFT COLUMN: Programme Fees + Fee Structure Table */}
            <div className="lg:col-span-8 space-y-4 sm:space-y-5">
              {/* Programme Fees Card */}
              <section className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-[#B91C1C]" />
                    <h2 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white">
                      Programme Fees
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    <Calendar size={13} className="text-slate-400 dark:text-zinc-500" />
                    <span>{sessionLabel}</span>
                  </span>
                </div>

                {/* Primary Programme Highlight */}
                <div className="rounded-xl bg-slate-50/80 dark:bg-[#18181B] border border-slate-200/80 dark:border-zinc-800 p-4 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-red-50 dark:bg-[#B91C1C]/15 border border-red-100 dark:border-[#B91C1C]/25 text-[#B91C1C] dark:text-red-400 flex items-center justify-center shrink-0">
                        <Monitor size={19} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white truncate">
                          {feeSummaryItems.length > 1
                            ? `${primaryProgram.title} (+${feeSummaryItems.length - 1} more)`
                            : primaryProgram.title}
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                          {primaryProgram.subtitle || 'Active curriculum subscription'}
                        </p>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <p className="text-base sm:text-lg font-extrabold text-[#14284B] dark:text-white tabular-nums">
                        {formatNaira(denominator)}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        <span>{pctPaid}% Paid</span>
                        <CheckCircle2 size={12} />
                      </span>
                    </div>
                  </div>

                  {/* Thin Progress Bar */}
                  <div className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#991B1B] to-[#DC2626] transition-all duration-500"
                      style={{ width: `${pctPaid}%` }}
                    />
                  </div>

                  {/* Expandable Payment Breakdown */}
                  <div className="pt-2 border-t border-slate-200/70 dark:border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => setBreakdownOpen((prev) => !prev)}
                      className="w-full flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-300 hover:text-[#B91C1C] dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {breakdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>Payment Breakdown</span>
                      </span>
                      <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 tabular-nums">
                        {feeSummaryItems.length || 1} {feeSummaryItems.length === 1 ? 'item' : 'items'}
                      </span>
                    </button>

                    {breakdownOpen && (
                      <div className="mt-3 space-y-2">
                        {(feeSummaryItems.length > 0 ? feeSummaryItems : [primaryProgram]).map(
                          (item) => (
                            <div
                              key={item.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-3 py-2.5 rounded-lg bg-white dark:bg-[#111114] border border-slate-200/70 dark:border-zinc-800/80 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-[#14284B] dark:text-white truncate">
                                  {item.title}
                                </p>
                                {item.subtitle && (
                                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                                    {item.subtitle}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 tabular-nums">
                                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                                  {item.durationLabel}
                                </span>
                                <strong className="font-bold text-[#14284B] dark:text-white">
                                  {formatNaira(item.amount)}
                                </strong>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Fee Structure Preview Table Card */}
              <section className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-2xs">
                <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#B91C1C]" />
                    <h2 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white">
                      Fee Structure
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTabChange('structure')}
                    className="text-[11px] sm:text-xs font-bold text-[#B91C1C] dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Configure &amp; Pay</span>
                    <ArrowRight size={12} />
                  </button>
                </div>

                {/* Desktop / Tablet Structured Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-[#18181B] border-b border-slate-100 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        <th className="py-3 px-6">Programme</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-6 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70 text-xs">
                      {(feeSummaryItems.length > 0 ? feeSummaryItems : [primaryProgram]).map(
                        (item) => (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 transition-colors"
                          >
                            <td className="py-3.5 px-6">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-8 h-8 rounded-lg bg-red-50 dark:bg-[#B91C1C]/15 text-[#B91C1C] dark:text-red-400 flex items-center justify-center shrink-0">
                                  <Monitor size={14} />
                                </span>
                                <div className="min-w-0">
                                  <p className="font-bold text-[#14284B] dark:text-white truncate">
                                    {item.title}
                                  </p>
                                  {item.subtitle && (
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                                      {item.subtitle}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-[#14284B] dark:text-white tabular-nums whitespace-nowrap">
                              {formatNaira(item.amount)}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                              {item.durationLabel}
                            </td>
                            <td className="py-3.5 px-6 text-right whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-bold ${
                                  item.statusTone === 'active'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : item.statusTone === 'due'
                                    ? 'text-[#B91C1C] dark:text-red-400'
                                    : item.statusTone === 'partial'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-500 dark:text-zinc-400'
                                }`}
                              >
                                {item.statusTone === 'active' ? (
                                  <CheckCircle2 size={13} />
                                ) : (
                                  <Clock size={13} />
                                )}
                                <span>{item.statusLabel}</span>
                              </span>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Stacked List */}
                <div className="sm:hidden divide-y divide-slate-100 dark:divide-zinc-800/70">
                  {(feeSummaryItems.length > 0 ? feeSummaryItems : [primaryProgram]).map(
                    (item) => (
                      <div key={item.id} className="p-4 space-y-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-[#14284B] dark:text-white truncate">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                                {item.subtitle}
                              </p>
                            )}
                          </div>
                          <strong className="font-bold text-[#14284B] dark:text-white tabular-nums shrink-0">
                            {formatNaira(item.amount)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-zinc-400">
                            {item.durationLabel}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              item.statusTone === 'active'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : item.statusTone === 'due'
                                ? 'text-[#B91C1C] dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {item.statusTone === 'active' ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            <span>{item.statusLabel}</span>
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Payment Summary + Need Help */}
            <div className="lg:col-span-4 space-y-4 sm:space-y-5">
              {/* Payment Summary Card */}
              <section className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <Info size={16} className="text-[#B91C1C]" />
                  <h2 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white">
                    Payment Summary
                  </h2>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-xs sm:text-sm">
                  <div className="py-2.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-zinc-400">
                      Total Programme Fee
                    </span>
                    <span className="font-bold text-[#14284B] dark:text-white tabular-nums">
                      {formatNaira(denominator)}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-zinc-400">Amount Paid</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatNaira(safePaid)}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-zinc-400">
                      Outstanding Balance
                    </span>
                    <span className="font-extrabold text-[#B91C1C] dark:text-red-400 tabular-nums">
                      {formatNaira(safeDue)}
                    </span>
                  </div>
                </div>

                {/* Single Pay Now CTA — Direct to Paystack Hosted Checkout */}
                <button
                  type="button"
                  disabled={paymentDisabled}
                  onClick={onMakePayment}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all ${
                    paymentDisabled
                      ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#991B1B] to-[#B91C1C] hover:from-[#7F1D1D] hover:to-[#991B1B] text-white cursor-pointer'
                  }`}
                >
                  <CreditCard size={16} />
                  <span className="tabular-nums">
                    {effectivePayNow > 0
                      ? `Pay Now · ${formatNaira(effectivePayNow)}`
                      : 'Pay Now'}
                  </span>
                </button>

                <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center leading-relaxed">
                  Secured by Paystack — choose Card, Bank Transfer, or USSD at checkout.
                </p>
              </section>

              {/* Compact Need Help Card */}
              <section className="rounded-2xl bg-slate-50/90 dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 text-[#14284B] dark:text-zinc-200 flex items-center justify-center shrink-0">
                    <Headphones size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-[#14284B] dark:text-white">
                      Need Help?
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug mt-0.5">
                      Contact support for any payment inquiries.
                    </p>
                  </div>
                </div>

                <Link
                  to={supportPath}
                  className="px-3.5 py-2 rounded-xl border border-[#B91C1C]/40 hover:border-[#B91C1C] bg-white dark:bg-[#18181B] text-[#B91C1C] dark:text-red-400 text-xs font-bold transition-colors shrink-0"
                >
                  Contact Us
                </Link>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: FEE STRUCTURE                                         */}
      {/* ============================================================ */}
      {activeTab === 'structure' && (
        <div className="space-y-5">{feeStructureSlot}</div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: PAYMENT HISTORY                                       */}
      {/* ============================================================ */}
      {activeTab === 'history' && (
        <div className="space-y-5">{paymentHistorySlot}</div>
      )}

      {/* ============================================================ */}
      {/* TAB 4: PAYMENT METHODS (GATEWAYS: PAYSTACK, FLUTTERWAVE, STRIPE) */}
      {/* ============================================================ */}
      {activeTab === 'methods' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#B91C1C]">
                  Payment Gateways
                </span>
                <h2 className="text-base sm:text-lg font-bold text-[#14284B] dark:text-white mt-0.5">
                  Supported Payment Providers
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Paystack is currently active for instant Card, Bank Transfer, and USSD settlement. Additional international gateways are rolling out soon.
                </p>
              </div>
              <button
                type="button"
                disabled={paymentDisabled}
                onClick={onMakePayment}
                className="px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <CreditCard size={15} />
                <span className="tabular-nums">
                  {effectivePayNow > 0
                    ? `Pay Now · ${formatNaira(effectivePayNow)}`
                    : 'Pay Now'}
                </span>
              </button>
            </div>

            {/* 3 Gateway Cards: Paystack (Active), Flutterwave (Coming Soon), Stripe (Coming Soon) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. PAYSTACK — ACTIVE */}
              <div className="rounded-2xl border-2 border-[#B91C1C]/70 bg-white dark:bg-[#18181B] p-5 flex flex-col justify-between gap-4 shadow-xs">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <PaystackLogo className="h-6" />
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                    Primary checkout gateway. Supports Visa, Mastercard, Verve, instant Bank Transfer, and USSD directly inside Paystack Hosted Checkout.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    NGN · Instant Receipt
                  </span>
                  <button
                    type="button"
                    disabled={paymentDisabled}
                    onClick={onMakePayment}
                    className="text-xs font-bold text-[#B91C1C] dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <span>Pay Now</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>

              {/* 2. FLUTTERWAVE — COMING SOON (GREYED OUT) */}
              <div
                aria-disabled="true"
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#141418] p-5 flex flex-col justify-between gap-4 opacity-55 grayscale select-none cursor-not-allowed"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <FlutterwaveLogo className="h-6" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      Coming Soon
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Pan-African card, mobile money, and cross-border tuition settlements powered by Flutterwave.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/70 dark:border-zinc-800/70 flex items-center justify-between text-[11px] font-semibold text-slate-400 dark:text-zinc-500">
                  <span>Multi-Currency Africa</span>
                  <span>Unavailable</span>
                </div>
              </div>

              {/* 3. STRIPE — COMING SOON (GREYED OUT) */}
              <div
                aria-disabled="true"
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#141418] p-5 flex flex-col justify-between gap-4 opacity-55 grayscale select-none cursor-not-allowed"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <StripeLogo className="h-6" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      Coming Soon
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Global USD, GBP, and EUR card payments plus Apple Pay and Google Pay for international families.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/70 dark:border-zinc-800/70 flex items-center justify-between text-[11px] font-semibold text-slate-400 dark:text-zinc-500">
                  <span>Global Cards · USD/GBP/EUR</span>
                  <span>Unavailable</span>
                </div>
              </div>
            </div>

            {/* Verification Guarantee Strip */}
            <div className="rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-slate-700 dark:text-zinc-300">
                <ShieldCheck size={17} className="text-[#14284B] dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#14284B] dark:text-white">
                    Automatic Receipt Verification:
                  </strong>{' '}
                  Once Paystack confirms your payment, your portal balance updates immediately and an official PDF receipt is saved in Payment History.
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold shrink-0">
                <CheckCircle2 size={14} /> PCI-DSS Compliant
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingEditorialShell;
