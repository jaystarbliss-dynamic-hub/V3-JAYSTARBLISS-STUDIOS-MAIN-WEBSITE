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
    const isPaymentBanner = Boolean(entitlement.canPay && entitlement.payNowPath);
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
                {isPaymentBanner && entitlement.amountDue > 0 && (
                  <>
                    {' '}
                    <span className="font-bold text-white">
                      Outstanding: {formatNaira(entitlement.amountDue)}
                    </span>
                    {entitlement.dueDateFormatted ? ` • Due ${entitlement.dueDateFormatted}` : ''}
                  </>
                )}
                {entitlement.expiresAtFormatted && (
                  <>
                    {' '}
                    <span className="font-bold text-white">
                      • Scheduled Restoration: {entitlement.expiresAtFormatted}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isPaymentBanner && entitlement.payNowPath ? (
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
 * Full-screen / route-level Lockdown Panel.
 * Displays the actual saved restriction reason, effective date, expected restoration date (if set),
 * all active public-safe restrictions, and the appropriate next action (Pay Now ONLY for payment restrictions).
 */
export const PortalLockdownView: React.FC<PortalLockdownViewProps> = ({
  entitlement,
  compact = false,
  restrictedFeatureName,
}) => {
  const lockedChildren = (entitlement.affectedChildren || []).filter((c) => c.isLocked);
  const supportPath = `/portal/${entitlement.role}/support`;
  const activeRestrictions = entitlement.activeRestrictions || [];
  const isDependentStudent =
    entitlement.role === 'student' &&
    (entitlement.studentFundingCategory === 'SCHOOL_FUNDED' ||
      entitlement.studentFundingCategory === 'PARENT_FUNDED');
  const showPayNow = Boolean(entitlement.canPay && entitlement.payNowPath);
  const hasMultipleRestrictions = !isDependentStudent && activeRestrictions.length > 1;
  const isNonPaymentOnly = !showPayNow && !isDependentStudent;

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
                {entitlement.lockReasonLabel ||
                  (entitlement.isManuallyLocked ? 'Administrative Restriction Active' : 'Access Restriction Active')}
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

          {/* Metrics Grid — tailored to restriction type and account role */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {showPayNow && (
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
                <ShieldAlert size={12} /> Restriction Reason
              </span>
              <span className="mt-1 block text-sm font-extrabold text-[#14284B] dark:text-white">
                {entitlement.lockReasonLabel ||
                  (entitlement.isManuallyLocked ? 'Administrative Restriction' : 'Subscription Payment Overdue')}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50 p-4">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Calendar size={12} /> {entitlement.effectiveAtFormatted ? 'Effective Date' : 'Payment Due Date'}
              </span>
              <span className="mt-1 block text-sm font-extrabold text-[#14284B] dark:text-white">
                {entitlement.effectiveAtFormatted || entitlement.dueDateFormatted || 'Active Now'}
              </span>
            </div>

            {entitlement.expiresAtFormatted && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  <Clock size={12} /> Expected Restoration
                </span>
                <span className="mt-1 block text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
                  {entitlement.expiresAtFormatted}
                </span>
              </div>
            )}

            {isDependentStudent && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50 p-4">
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <UserCheck size={12} /> Account Contact
                </span>
                <span className="mt-1 block text-sm font-extrabold text-[#14284B] dark:text-white">
                  {entitlement.studentFundingCategory === 'SCHOOL_FUNDED'
                    ? entitlement.schoolName || 'School Administrator'
                    : 'Parent / Guardian'}
                </span>
              </div>
            )}
          </div>

          {/* Multiple Active Restrictions Breakdown (when both payment & administrative restrictions apply) */}
          {hasMultipleRestrictions && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                Active Account Restrictions ({activeRestrictions.length})
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                More than one restriction currently applies to this account. Resolving a payment restriction alone will not lift an independent administrative restriction.
              </p>
              <div className="space-y-2">
                {activeRestrictions.map((r) => (
                  <div
                    key={r.restrictionId}
                    className="rounded-xl bg-white dark:bg-slate-900/80 border border-amber-200/70 dark:border-amber-900/40 px-4 py-3 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold text-[#14284B] dark:text-white">{r.reasonLabel}</span>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {r.restrictionTypeLabel}
                        {r.expiresAtFormatted ? ` • Until ${r.expiresAtFormatted}` : ''}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{r.userFacingMessage}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    {showPayNow && (
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
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Restoration & Next Steps Clarity */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60 p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {showPayNow && !entitlement.hasNonPaymentRestriction ? (
              <>
                <strong className="text-[#14284B] dark:text-white">Automatic Instant Restoration:</strong>{' '}
                Your Billing Center, payment history, and receipts remain fully accessible. As soon as your renewal payment is verified, all restricted features and learning access restore automatically.
              </>
            ) : showPayNow && entitlement.hasNonPaymentRestriction ? (
              <>
                <strong className="text-[#14284B] dark:text-white">Next Steps:</strong>{' '}
                Your Billing Center remains open to settle any outstanding balance. Because an independent administrative restriction also applies, please contact Jaystarbliss Studios Support Desk so our team can assist with full restoration.
              </>
            ) : isNonPaymentOnly ? (
              <>
                <strong className="text-[#14284B] dark:text-white">How to Restore Access:</strong>{' '}
                Your academic records remain safely preserved. This restriction is not a billing payment request — please contact the Jaystarbliss Studios Support Desk for guidance and review updates.
              </>
            ) : (
              <>
                <strong className="text-[#14284B] dark:text-white">Your Records Remain Safe:</strong>{' '}
                Your academic records and progress remain safely preserved. Please contact{' '}
                {entitlement.studentFundingCategory === 'SCHOOL_FUNDED'
                  ? 'your school administrator'
                  : 'your parent or guardian'}{' '}
                for further information about restoring access.
              </>
            )}
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {showPayNow && entitlement.payNowPath && (
              <Link
                to={entitlement.payNowPath}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-sm transition-colors"
              >
                <CreditCard size={16} />
                PAY NOW — Open Billing Center
              </Link>
            )}

            {isNonPaymentOnly && (
              <Link
                to={supportPath}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#14284B] hover:bg-slate-800 text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-sm transition-colors"
              >
                <Headphones size={16} />
                Contact Support Desk
              </Link>
            )}

            <Link
              to={`/portal/${entitlement.role}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#14284B] dark:text-white text-xs sm:text-sm font-bold transition-colors"
            >
              Return to Overview
            </Link>

            {!isNonPaymentOnly && (
              <Link
                to={supportPath}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs sm:text-sm font-semibold transition-colors"
              >
                <Headphones size={15} />
                Contact Support
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalLockdownView;
