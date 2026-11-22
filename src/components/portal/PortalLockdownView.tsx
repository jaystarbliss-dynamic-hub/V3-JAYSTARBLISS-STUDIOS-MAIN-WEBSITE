import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  Headphones,
  Home,
  Info,
  Lock,
  Mail,
  Users,
  Wallet,
} from 'lucide-react';
import type { PortalEntitlementResult } from '../../../api/_lib/subscription-core';
import { formatNaira } from '../../lib/billing';
import PortalHeroBanner from './PortalHeroBanner';

interface PortalLockdownViewProps {
  entitlement: PortalEntitlementResult;
  compact?: boolean;
  restrictedFeatureName?: string;
  showHeroBanner?: boolean;
}

/**
 * Top activation-style banner shown inside PortalLayout during Grace Period, Due Soon, or Lockdown.
 */
export const PortalSubscriptionBanner: React.FC<{
  entitlement: PortalEntitlementResult | null;
}> = ({ entitlement }) => {
  if (!entitlement) return null;
  if (entitlement.role === 'admin' || entitlement.role === 'staff') return null;

  // 1. LOCKDOWN BANNER — solid brand crimson with crisp white typography
  if (entitlement.isLocked) {
    const isPaymentBanner = Boolean(entitlement.canPay && entitlement.payNowPath);
    return (
      <div
        role="alert"
        className="w-full bg-[#B91C1C] dark:bg-[#991B1B] text-white border-b border-red-900/50 px-4 sm:px-6 py-3 shrink-0"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Lock size={16} className="text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-[13px] font-bold tracking-wide uppercase text-white">
                {entitlement.bannerText}
              </p>
              <p className="text-xs text-white/90 leading-snug mt-0.5">
                {entitlement.message}
                {isPaymentBanner && entitlement.amountDue > 0 && (
                  <>
                    {' '}
                    <span className="font-bold text-white tabular-nums">
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
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[#14284B] hover:bg-slate-100 text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
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
        className="w-full bg-[#14284B] text-white border-b border-slate-700/80 px-4 sm:px-6 py-2.5 shrink-0"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <AlertTriangle size={16} className="text-white shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs text-slate-100 leading-snug">
              <span className="font-bold uppercase tracking-wide text-white">
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
                  <span className="font-bold text-white tabular-nums">
                    Amount due: {formatNaira(entitlement.amountDue)}
                  </span>
                  .
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
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold uppercase tracking-wider shrink-0 transition-colors"
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
        className="w-full bg-slate-100 dark:bg-[#111114] text-[#14284B] dark:text-white border-b border-slate-200 dark:border-zinc-800 px-4 sm:px-6 py-2 shrink-0"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <Clock size={15} className="text-[#14284B] dark:text-white shrink-0" />
            <span>
              <strong className="font-bold">Renewal Approaching:</strong> Your subscription of{' '}
              <strong className="tabular-nums">{formatNaira(entitlement.amountDue)}</strong> is due{' '}
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14284B] hover:bg-slate-800 dark:bg-white dark:text-[#14284B] dark:hover:bg-slate-100 text-white text-xs font-bold shrink-0 transition-colors"
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
 * Clean, authoritative Portal Restriction View modeled on the reference layout:
 * Slim abstract portal banner followed by a single crisp surface with brand-red badge,
 * horizontally divided 4-column metadata strip, reassurance bar, and clear CTAs.
 */
export const PortalLockdownView: React.FC<PortalLockdownViewProps> = ({
  entitlement,
  compact = false,
  restrictedFeatureName,
  showHeroBanner = false,
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

  const reasonLabel =
    entitlement.lockReasonLabel ||
    (entitlement.isManuallyLocked ? 'Administrative Restriction' : 'Subscription Payment Overdue');

  const effectiveDateLabel = entitlement.effectiveAtFormatted
    ? 'Effective Date'
    : 'Payment Due Date';
  const effectiveDateValue =
    entitlement.effectiveAtFormatted || entitlement.dueDateFormatted || 'Active Now';

  const thirdColLabel = showPayNow
    ? 'Outstanding Balance'
    : isDependentStudent
      ? 'Account Contact'
      : 'Account Support';
  const thirdColValue = showPayNow
    ? entitlement.amountDue > 0
      ? formatNaira(entitlement.amountDue)
      : 'Renewal Required'
    : isDependentStudent
      ? entitlement.studentFundingCategory === 'SCHOOL_FUNDED'
        ? entitlement.schoolName || 'School Administrator'
        : 'Parent / Guardian'
      : 'Support Desk';

  const restorationValue =
    entitlement.expiresAtFormatted ||
    (showPayNow && !entitlement.hasNonPaymentRestriction
      ? 'Upon Payment Renewal'
      : isDependentStudent && !entitlement.hasNonPaymentRestriction
        ? 'Upon Payment Renewal'
        : 'Upon Admin Review');

  const bannerTitle =
    entitlement.schoolName ||
    sessionStorage.getItem('schoolName') ||
    sessionStorage.getItem('userName') ||
    sessionStorage.getItem('studentName') ||
    'Portal Access';

  return (
    <div className={compact ? 'w-full space-y-5' : 'max-w-5xl mx-auto space-y-5'}>
      {showHeroBanner && !compact && (
        <PortalHeroBanner role={entitlement.role} title={bannerTitle} />
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-xs overflow-hidden">
        {/* Top Header Row — crisp lock emblem, bold headline & rectangular brand-red badge */}
        <div className="px-6 sm:px-8 pt-7 pb-6 border-b border-slate-200/80 dark:border-zinc-800">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#B91C1C]/10 dark:bg-[#B91C1C] flex items-center justify-center shrink-0">
              <Lock size={24} className="text-[#B91C1C] dark:text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-[#14284B] dark:text-white tracking-tight leading-snug">
                {entitlement.headline || 'Portal Access Restricted'}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#B91C1C] text-white text-xs font-semibold tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  Access Temporarily Unavailable
                </span>
                {restrictedFeatureName && (
                  <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                    Restricted section:{' '}
                    <strong className="font-semibold text-[#14284B] dark:text-white">
                      {restrictedFeatureName}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Role-Aware Public Explanation */}
          <p className="text-sm sm:text-[15px] text-slate-700 dark:text-slate-100 leading-relaxed max-w-3xl">
            {entitlement.message}
          </p>

          {/* Unified 4-Column Horizontally Divided Metadata Strip (no separate floating cards) */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-[#F8FAFC] dark:bg-[#18181B] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-zinc-800">
            <div className="p-4 flex items-start gap-3">
              <Building2 size={17} className="text-[#14284B] dark:text-slate-200 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  Restriction Reason
                </span>
                <span className="mt-0.5 block text-xs sm:text-[13px] font-bold text-[#14284B] dark:text-white leading-snug">
                  {reasonLabel}
                </span>
              </div>
            </div>

            <div className="p-4 flex items-start gap-3">
              <Calendar size={17} className="text-[#14284B] dark:text-slate-200 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  {effectiveDateLabel}
                </span>
                <span className="mt-0.5 block text-xs sm:text-[13px] font-bold text-[#14284B] dark:text-white tabular-nums leading-snug">
                  {effectiveDateValue}
                </span>
              </div>
            </div>

            <div className="p-4 flex items-start gap-3">
              {showPayNow ? (
                <Wallet size={17} className="text-[#14284B] dark:text-slate-200 shrink-0 mt-0.5" />
              ) : (
                <Users size={17} className="text-[#14284B] dark:text-slate-200 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  {thirdColLabel}
                </span>
                <span className="mt-0.5 block text-xs sm:text-[13px] font-bold text-[#14284B] dark:text-white tabular-nums leading-snug">
                  {thirdColValue}
                </span>
              </div>
            </div>

            <div className="p-4 flex items-start gap-3">
              <Clock size={17} className="text-[#14284B] dark:text-slate-200 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  Expected Restoration
                </span>
                <span className="mt-0.5 block text-xs sm:text-[13px] font-bold text-[#14284B] dark:text-white leading-snug">
                  {restorationValue}
                </span>
              </div>
            </div>
          </div>

          {/* Multiple Active Restrictions Breakdown (flat hairline-divided list, brand palette only) */}
          {hasMultipleRestrictions && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-[#18181B] border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#14284B] dark:text-white">
                  Active Account Restrictions ({activeRestrictions.length})
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  All active restrictions must be resolved for full restoration.
                </span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-zinc-800 bg-white dark:bg-[#111114]">
                {activeRestrictions.map((r) => (
                  <div key={r.restrictionId} className="px-4 py-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#14284B] dark:text-white">{r.reasonLabel}</span>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-300">
                        {r.restrictionTypeLabel}
                        {r.expiresAtFormatted ? ` • Until ${r.expiresAtFormatted}` : ''}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-200 leading-relaxed">
                      {r.userFacingMessage}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parent-specific affected programmes (single hairline-divided table/list) */}
          {entitlement.role === 'parent' && lockedChildren.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-[#18181B] border-b border-slate-200 dark:border-zinc-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#14284B] dark:text-white">
                  Affected Programme{lockedChildren.length === 1 ? '' : 's'} ({lockedChildren.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-zinc-800 bg-white dark:bg-[#111114]">
                {lockedChildren.map((child) => (
                  <div
                    key={child.childId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#14284B] dark:text-white">{child.childName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">
                        {child.programmeName || 'Enrolled Programme'}
                        {child.dueDateFormatted ? ` • Due ${child.dueDateFormatted}` : ''}
                      </p>
                    </div>
                    {showPayNow && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-[#14284B] dark:text-white tabular-nums">
                          {formatNaira(child.amountDue)}
                        </span>
                        <Link
                          to={`/portal/parent/payments?childId=${encodeURIComponent(child.childId)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold transition-colors"
                        >
                          <CreditCard size={13} />
                          Pay Item
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reassurance Information Strip (calm matte black on dark, white text) */}
          <div className="rounded-xl bg-[#14284B]/[0.06] dark:bg-[#18181B] border border-[#14284B]/15 dark:border-zinc-800 px-4 py-3.5 flex items-start gap-3 text-xs sm:text-[13px] text-[#14284B] dark:text-zinc-100 leading-relaxed">
            <Info size={17} className="text-[#14284B] dark:text-white shrink-0 mt-0.5" />
            <div>
              {showPayNow && !entitlement.hasNonPaymentRestriction ? (
                <>
                  Your academic records and billing history remain safely preserved. Your Billing Center stays fully accessible, and access will be restored automatically once your renewal payment is verified.
                </>
              ) : showPayNow && entitlement.hasNonPaymentRestriction ? (
                <>
                  Your Billing Center remains open to settle any outstanding balance. Because an independent administrative restriction also applies, please contact Support Desk for assistance with full restoration.
                </>
              ) : isNonPaymentOnly ? (
                <>
                  Your academic records and progress remain safely preserved. This restriction is not a payment request — please contact Support Desk for guidance and review updates.
                </>
              ) : (
                <>
                  Your academic records and progress remain safely preserved. Access will be restored once{' '}
                  {entitlement.studentFundingCategory === 'SCHOOL_FUNDED'
                    ? 'your school subscription is renewed.'
                    : 'your parent or guardian renews your programme.'}
                </>
              )}
            </div>
          </div>

          {/* Primary & Secondary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {showPayNow && entitlement.payNowPath ? (
              <Link
                to={entitlement.payNowPath}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
              >
                <CreditCard size={16} />
                Pay Now — Open Billing Center
              </Link>
            ) : isDependentStudent ? (
              <Link
                to={supportPath}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
              >
                <Mail size={16} />
                {entitlement.studentFundingCategory === 'SCHOOL_FUNDED'
                  ? 'Contact School Administrator'
                  : 'Contact Support Desk'}
              </Link>
            ) : (
              <Link
                to={supportPath}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
              >
                <Headphones size={16} />
                Contact Support Desk
              </Link>
            )}

            <Link
              to={`/portal/${entitlement.role}`}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/10 text-[#14284B] dark:text-white text-xs sm:text-sm font-bold transition-colors"
            >
              <Home size={15} />
              Return to Dashboard
            </Link>

            {showPayNow && (
              <Link
                to={supportPath}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[#14284B] dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 text-xs sm:text-sm font-semibold transition-colors"
              >
                <Headphones size={15} />
                Support Desk
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalLockdownView;
