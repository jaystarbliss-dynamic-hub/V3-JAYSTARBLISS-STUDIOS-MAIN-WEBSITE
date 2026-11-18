import React, { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Info,
  Loader2,
  ShieldCheck,
  X
} from 'lucide-react';
import { formatNaira } from '../../lib/billing';

export const NO_REFUND_POLICY_TITLE = 'PAYMENT POLICY — NO REFUNDS';
export const NO_REFUND_POLICY_TEXT =
  'No refund of fees paid to the other party will be made after payment has been successfully completed.';

export interface PaystackReviewContextRow {
  label: string;
  value?: string | null;
}

export interface PaystackReviewLineItem {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
  amount: number;
}

export interface PaystackReviewInstallment {
  fullAmount: number;
  percentage: number;
  payingNow: number;
  remainingBalance: number;
  note?: string;
}

export interface PaystackPaymentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviewKey: string;
  subtitle?: string;
  title?: string;
  description?: string;
  contextRows?: PaystackReviewContextRow[];
  lineItems?: PaystackReviewLineItem[];
  installment?: PaystackReviewInstallment | null;
  subtotal: number;
  estimatedFee: number;
  estimatedTotal: number;
  feeNote?: string;
  loading?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
  onConfirmPaystack: () => Promise<void> | void;
  children?: React.ReactNode;
}

export const PaystackPaymentReviewModal: React.FC<PaystackPaymentReviewModalProps> = ({
  isOpen,
  onClose,
  reviewKey,
  subtitle = 'Paystack Hosted Checkout',
  title = 'Review Your Payment',
  description = 'Please review the payment details below before proceeding to secure checkout.',
  contextRows = [],
  lineItems = [],
  installment = null,
  subtotal,
  estimatedFee,
  estimatedTotal,
  feeNote,
  loading = false,
  disabled = false,
  disabledMessage,
  onConfirmPaystack,
  children,
}) => {
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const checkboxId = useId();
  const titleId = useId();

  // Always start unchecked when opening or whenever the payment selection changes
  useEffect(() => {
    setPolicyAccepted(false);
    setValidationError(null);
  }, [isOpen, reviewKey]);

  if (!isOpen) return null;

  const visibleContextRows = contextRows.filter(
    (row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || loading) return;
    if (!policyAccepted) {
      setValidationError('Please read and accept the Payment Policy before proceeding to Paystack.');
      return;
    }
    setValidationError(null);
    await onConfirmPaystack();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* A. Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-brand-red">
              {subtitle}
            </p>
            <h2
              id={titleId}
              className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white"
            >
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close payment review"
            className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Optional Configuration Fields (e.g. learner selector / delivery mode for single checkout) */}
          {children}

          {/* B. Dynamic Payment Context Summary */}
          {visibleContextRows.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="mb-2.5 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Payment Details
              </p>
              <dl className="divide-y divide-slate-200/80 text-xs dark:divide-slate-800">
                {visibleContextRows.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
                    <dd className="text-right font-bold text-slate-900 dark:text-white">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* B2. Itemized Programme / Child Line Items */}
          {lineItems.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 bg-slate-100/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Selected Items ({lineItems.length})
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Item / Learner</th>
                      <th className="px-4 py-2.5">Programme &amp; Details</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lineItems.map((item) => (
                      <tr key={item.id} className="bg-white dark:bg-slate-900">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                          {item.primary}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          <span className="block font-semibold text-slate-800 dark:text-slate-200">
                            {item.secondary}
                          </span>
                          {item.meta && (
                            <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                              {item.meta}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatNaira(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* C. Itemized Financial Breakdown */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Financial Breakdown
            </p>
            <div className="space-y-2 text-xs">
              {installment && installment.fullAmount > 0 && installment.percentage < 100 && (
                <>
                  <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                    <span>Full Programme / Contract Fee</span>
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {formatNaira(installment.fullAmount)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                    <span>Current Installment ({installment.percentage}%)</span>
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {formatNaira(installment.payingNow)}
                    </strong>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                <span>Programme / Tuition Subtotal</span>
                <strong className="font-mono text-slate-900 dark:text-white">
                  {formatNaira(subtotal)}
                </strong>
              </div>

              {estimatedFee > 0 && (
                <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                  <span>Estimated Paystack Processing Fee</span>
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {formatNaira(estimatedFee)}
                  </strong>
                </div>
              )}

              {installment && installment.remainingBalance > 0 && (
                <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                  <span>Remaining Balance After Payment</span>
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {formatNaira(installment.remainingBalance)}
                  </strong>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <span className="text-sm font-black text-slate-900 dark:text-white">
                  Total Payable
                </span>
                <strong className="font-mono text-lg font-black text-brand-red">
                  {formatNaira(estimatedTotal)}
                </strong>
              </div>
            </div>

            {feeNote && (
              <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {feeNote}
              </p>
            )}
          </div>

          {/* D. Paystack Provider Explanation (No local channel selector) */}
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
            <Info size={16} className="mt-0.5 shrink-0 text-slate-700 dark:text-slate-300" />
            <p>
              Your payment will be processed securely through Paystack. You will be redirected to
              Paystack&apos;s hosted checkout, where you can select an available payment method.
            </p>
          </div>

          {/* E. Mandatory No-Refund Payment Policy Acceptance */}
          <div className="rounded-2xl border-2 border-brand-red/30 bg-red-50/40 p-4 dark:border-brand-red/40 dark:bg-red-950/20">
            <p className="text-xs font-black uppercase tracking-wider text-brand-red">
              {NO_REFUND_POLICY_TITLE}
            </p>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-800 dark:text-slate-200">
              {NO_REFUND_POLICY_TEXT}
            </p>

            <label
              htmlFor={checkboxId}
              className="mt-3.5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-brand-red/50 dark:border-slate-700 dark:bg-slate-900"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={policyAccepted}
                onChange={(e) => {
                  setPolicyAccepted(e.target.checked);
                  if (e.target.checked) setValidationError(null);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-red cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-900 dark:text-white select-none">
                I have read and agree to the Payment Policy.
              </span>
            </label>

            {!policyAccepted && !validationError && (
              <p className="mt-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Please accept the Payment Policy to enable payment.
              </p>
            )}

            {validationError && (
              <p
                role="alert"
                className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-brand-red"
              >
                <AlertCircle size={13} className="shrink-0" />
                <span>{validationError}</span>
              </p>
            )}
          </div>

          {disabled && disabledMessage && (
            <div className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {disabledMessage}
            </div>
          )}

          {/* F. Final Payment Actions */}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel / Go Back
            </button>
            <button
              type="submit"
              disabled={!policyAccepted || loading || disabled}
              className="min-h-12 flex-[2] rounded-xl bg-brand-red px-5 text-xs sm:text-sm font-black text-white shadow-sm transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>Initializing Paystack Checkout…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={17} />
                  <span>Pay through Paystack</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaystackPaymentReviewModal;
