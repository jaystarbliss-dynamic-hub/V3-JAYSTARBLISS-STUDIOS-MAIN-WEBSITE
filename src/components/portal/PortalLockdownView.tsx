import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  Clock,
  CreditCard,
  Headphones,
  Lock,
  ShieldAlert,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { PortalEntitlementResult } from '../../../api/_lib/subscription-core';
import { formatNaira } from '../../lib/billing';

interface PortalLockdownViewProps {
  entitlement: PortalEntitlementResult;
  compact?: boolean;
  restrictedFeatureName?: string;
}

/**
 * Top activation-style banner shown inside PortalLayout during Grace Period, Due Soon, or Lockdown.
 */
export const PortalSubscriptionBanner: React.FC<{
  entitlement: PortalEntitlementResult | null;
}> = ({ entitlement }) => {
  if (!entitlement) return null;
  if (entitlement.role === 'admin' || entitlement.role === 'staff') return null;

  // 1. LOCKDOWN BANNER (Microsoft Office Activation style — authoritative red/navy bar)
  if (entitlement.isLocked) {
    return (
      <div
        role="alert"
        className="w-full bg-[#991B1B] dark:bg-[#7F1D1D] text-white border-b border-red-900/60 px-4 sm:px-6 py-3 shrink-0"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Lock size={16} className="text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-[13px] font-black tracking-wide uppercase">
                {entitlement.bannerText}
              </p>
              <p className="text-xs text-red-100 leading-snug mt-0.5">
                {entitlement.message}
                {entitlement.canPay && entitlement.amountDue > 0 && (
                  <>
                    {' '}
                    <span className="font-bold text-white">
                      Outstanding: {formatNaira(entitlement.amountDue)}
                    </span>
                    {entitlement.dueDateFormatted ? ` • Due ${entitlement.dueDateFormatted}` : ''}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {entitlement.canPay && entitlement.payNowPath ? (
              <Link
                to={entitlement.payNowPath}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[#991B1B] hover:bg-red-50 text-xs font-black uppercase tracking-wider shadow-xs transition-colors"
              >
                <CreditCard size={14} />
                PAY NOW
              </Link>
            ) : (
              <Link
                to={`/portal/${entitlement.role}/support`}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors"
              >
                <Headphones size={14} />
                Contact Support
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. SEVEN-DAY GRACE PERIOD WARNING BANNER (Access stays active during days 1–7)
  if (entitlement.inGracePeriod) {
    const daysLeft = entitlement.graceDaysRemaining;
    return (
      <div
        role="status"
        className="w-full bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 border-b border-amber-300 dark:border-amber-800/70 px-4 sm:px-6 py-2.5 shrink-0"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <AlertTriangle size={17} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs leading-snug">
              <span className="font-extrabold uppercase tracking-wide">
                Subscription Payment Overdue — 7-Day Grace Period Active
              </span>
              {' • '}
              {daysLeft > 0
                ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining before portal lockdown`
                : 'Final day before portal lockdown'}
              {entitlement.graceEndsAtFormatted ? ` (${entitlement.graceEndsAtFormatted})` : ''}.
              {entitlement.canPay && entitlement.amountDue > 0 && (
                <>
                  {' '}
                  <span className="font-bold">Amount due: {formatNaira(entitlement.amountDue)}</span>.
                </>
              )}
              {!entitlement.canPay && entitlement.studentFundingCategory === 'SCHOOL_FUNDED' && (
                <> Please notify your school administrator to renew the institutional subscription.</>
              )}
              {!entitlement.canPay && entitlement.studentFundingCategory === 'PARENT_FUNDED' && (
                <> Please notify your parent or guardian to renew your programme.</>
              )}
            </p>
          </div>
          {entitlement.canPay && entitlement.payNowPath && (
            <Link
              to={entitlement.payNowPath}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold uppercase tracking-wider shrink-0 transition-colors"
            >
              <CreditCard size={13} />
              PAY NOW
            </Link>
          )}
        </div>
      </div>
    );
  }

  // 3. DUE SOON NOTICE (Within 7 days of due date — only shown to responsible payers)
  if (entitlement.isDueSoon && entitlement.canPay && entitlement.amountDue > 0) {
    return (
      <div
        role="status"
        className="w-full bg-sky-50 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100 border-b border-sky-200 dark:border-sky-800/60 px-4 sm:px-6 py-2 shrink-0"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <Clock size={15} className="text-sky-600 dark:text-sky-400 shrink-0" />
            <span>
              <strong className="font-bold">Renewal Approaching:</strong> Your subscription of{' '}
              <strong>{formatNaira(entitlement.amountDue)}</strong> is due{' '}
              {entitlement.dueDateFormatted ? `on ${entitlement.dueDateFormatted}` : 'soon'}
              {typeof entitlement.daysUntilDue === 'number' && entitlement.daysUntilDue > 0
                ? ` (${entitlement.daysUntilDue} day${entitlement.daysUntilDue === 1 ? '' : 's'} remaining)`
                : ''}
              .
            </span>
          </div>
          {entitlement.payNowPath && (
            <Link
              to={entitlement.payNowPath}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14284B] hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white text-xs font-bold shrink-0 transition-colors"
            >
              <Wallet size={13} />
              Renew Early
            </Link>
          )}
        </div>
      </div>
    );
  }

  return null;
};

/**
 * Full-screen / route-level Microsoft Office Activation-style Lockdown Panel.
 * Rendered directly when a locked user navigates to a restricted route or when a
 * school/parent-funded student accesses their locked portal.
 */
export const PortalLockdownView: React.FC<PortalLockdownViewProps> = ({
  entitlement,
  compact = false,
  restrictedFeatureName,
}) => {
  const lockedChildren = (entitlement.affectedChildren || []).filter((c) => c.isLocked);
  const supportPath = `/portal/${entitlement.role}/support`;

  return (
    <div className={compact ? 'w-full' : 'max-w-3xl mx-auto py-8 sm:py-12 px-2'}>
      <div className="rounded-3xl border border-red-200/90 dark:border-red-900/70 bg-white dark:bg-[#14284B] shadow-xl overflow-hidden">
        {/* Header Strip */}
        <div className="bg-gradient-to-r from-[#14284B] via-[#1E293B] to-[#991B1B] px-6 sm:px-8 py-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Lock size={24} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-red-200 mb-1">
                <ShieldAlert size={13} />
                Subscription Guardrail Active
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight leading-snug">
                {entitlement.headline}
              </h2>
              {restrictedFeatureName && (
                <p className="text-xs text-slate-200 mt-1">
                  Restricted section: <span className="font-bold text-white">{restrictedFeatureName}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
            {entitlement.message}
          </p>

          {/* Subscription Metrics Grid — shown to responsible payers & contextually to students */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {entitlement.canPay && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50 p-4">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Outstanding Amount
                </span>
                <span className="mt-1 block text-lg font-black text-[#B91C1C] dark:text-red-400">
                  {entitlement.amountDue > 0 ? formatNaira(entitlement.amountDue) : 'Renewal Required'}
                </span>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50 p-4">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Calendar size={12} /> Payment Due Date
              </span>
              <span className="mt-1 block text-sm font-extrabold text-[#14284B] dark:text-white">
                {entitlement.dueDateFormatted || 'Overdue'}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50 p-4">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Clock size={12} /> 7-Day Grace Period
              </span>
              <span className="mt-1 block text-sm font-extrabold text-[#B91C1C] dark:text-red-400">
                {entitlement.graceEndsAtFormatted ? `Ended ${entitlement.graceEndsAtFormatted}` : 'Expired'}
              </span>
            </div>

            {!entitlement.canPay && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50 p-4">
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <UserCheck size={12} /> Account Responsibility
                </span>
                <span className="mt-1 block text-sm font-extrabold text-[#14284B] dark:text-white">
                  {entitlement.studentFundingCategory === 'SCHOOL_FUNDED'
                    ? entitlement.schoolName || 'School Administrator'
                    : 'Parent / Guardian'}
                </span>
              </div>
            )}
          </div>

          {/* Parent-specific affected children list */}
          {entitlement.role === 'parent' && lockedChildren.length > 0 && (
            <div className="rounded-2xl border border-red-200/80 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#991B1B] dark:text-red-300">
                Affected Programme{lockedChildren.length === 1 ? '' : 's'}
              </h3>
              <div className="space-y-2">
                {lockedChildren.map((child) => (
                  <div
                    key={child.childId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-white dark:bg-slate-900/80 border border-red-100 dark:border-red-900/40 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#14284B] dark:text-white">{child.childName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {child.programmeName || 'Enrolled Programme'}
                        {child.dueDateFormatted ? ` • Due ${child.dueDateFormatted}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-[#B91C1C] dark:text-red-400">
                        {formatNaira(child.amountDue)}
                      </span>
                      <Link
                        to={`/portal/parent/payments?childId=${encodeURIComponent(child.childId)}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-bold transition-colors"
                      >
                        <CreditCard size={12} />
                        Pay Item
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Permitted vs Restricted Clarity */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60 p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {entitlement.canPay ? (
              <>
                <strong className="text-[#14284B] dark:text-white">Automatic Instant Restoration:</strong>{' '}
                Your Billing Center, payment history, and receipts remain fully accessible. As soon as your renewal payment is verified, all restricted features and student learning access restore automatically.
              </>
            ) : (
              <>
                <strong className="text-[#14284B] dark:text-white">Automatic Access Return:</strong>{' '}
                Your academic records remain safely preserved. Once{' '}
                {entitlement.studentFundingCategory === 'SCHOOL_FUNDED'
                  ? 'your school administrator completes the institutional renewal'
                  : 'your parent or guardian completes the programme renewal'}
                , your learning portal will unlock automatically.
              </>
            )}
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {entitlement.canPay && entitlement.payNowPath && (
              <Link
                to={entitlement.payNowPath}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-sm transition-colors"
              >
                <CreditCard size={16} />
                PAY NOW — Open Billing Center
              </Link>
            )}

            <Link
              to={`/portal/${entitlement.role}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#14284B] dark:text-white text-xs sm:text-sm font-bold transition-colors"
            >
              Return to Overview
            </Link>

            <Link
              to={supportPath}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs sm:text-sm font-semibold transition-colors"
            >
              <Headphones size={15} />
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalLockdownView;
