import React, { useEffect, useId, useState } from 'react';
import {
  CreditCard,
  Info,
  Loader2,
  ShieldCheck,
  X
} from 'lucide-react';
import { formatCurrency } from '../../lib/receiptGenerator';
import { useToast } from '../../contexts/ToastContext';
import { NO_REFUND_POLICY_TEXT, NO_REFUND_POLICY_TITLE } from './PaystackPaymentReviewModal';

export interface FintechAddMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
  onPaystackTopUp?: (amount: number) => Promise<void>;
}

export const FintechAddMoneyModal: React.FC<FintechAddMoneyModalProps> = ({
  isOpen,
  onClose,
  userName = 'Jaystarbliss Account',
  userEmail,
  onPaystackTopUp
}) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('10000');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    if (isOpen) {
      setPolicyAccepted(false);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const numAmount = Number(amount) || 0;

  const handlePaystackFunding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount < 500) {
      toast.error('Minimum deposit amount is ₦500.');
      return;
    }
    if (!policyAccepted) {
      toast.error('Please read and accept the Payment Policy before proceeding.');
      return;
    }
    setLoading(true);
    try {
      if (!onPaystackTopUp) {
        throw new Error('Online Paystack funding is not configured for this account.');
      }
      await onPaystackTopUp(numAmount);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to initiate Paystack checkout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-0 sm:p-4">
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Review Your Payment"
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white dark:bg-slate-800 flex items-center justify-center shrink-0">
              <CreditCard size={18} className="text-brand-red" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-brand-red">
                Paystack Hosted Checkout
              </p>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Review Your Payment
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fund {userName}{userEmail ? ` (${userEmail})` : ''} via Paystack.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close modal"
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handlePaystackFunding} className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Amount (₦ NGN)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-black font-mono text-slate-400">
                ₦
              </span>
              <input
                type="number"
                min="500"
                required
                value={amount}
                onChange={e => {
                  setAmount(e.target.value);
                  setPolicyAccepted(false);
                }}
                placeholder="10,000"
                className="w-full min-h-12 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-base font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-red outline-hidden"
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {[5000, 10000, 25000, 50000, 100000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setAmount(String(val));
                    setPolicyAccepted(false);
                  }}
                  className={`px-3 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                    Number(amount) === val
                      ? 'border-brand-red bg-red-50/70 text-brand-red dark:bg-red-950/30'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  ₦{val.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Account Target</span>
              <strong className="text-slate-900 dark:text-white">{userName}</strong>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-black">
              <span className="text-slate-900 dark:text-white">Total Payable</span>
              <strong className="font-mono text-brand-red">{formatCurrency(numAmount)}</strong>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <Info size={15} className="shrink-0 mt-0.5 text-slate-700 dark:text-slate-300" />
            <span>
              Your payment will be processed securely through Paystack. You will be redirected to Paystack&apos;s hosted checkout, where you can select an available payment method.
            </span>
          </div>

          <div className="rounded-xl border-2 border-brand-red/30 bg-red-50/40 dark:bg-red-950/20 p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-brand-red">
              {NO_REFUND_POLICY_TITLE}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
              {NO_REFUND_POLICY_TEXT}
            </p>
            <label
              htmlFor={checkboxId}
              className="mt-3 flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 cursor-pointer"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={policyAccepted}
                onChange={e => setPolicyAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-red cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                I have read and agree to the Payment Policy.
              </span>
            </label>
            {!policyAccepted && (
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Please accept the Payment Policy to enable payment.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-h-11 flex-1 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || numAmount < 500 || !policyAccepted}
              className="min-h-11 flex-[2] rounded-xl bg-brand-red hover:bg-red-800 text-white font-black text-xs transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Connecting to Paystack…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Pay through Paystack</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FintechAddMoneyModal;
