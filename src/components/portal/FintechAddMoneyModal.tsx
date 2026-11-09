import React, { useState } from 'react';
import { 
  Building2, CreditCard, Copy, Check, X, 
  ShieldCheck, Loader2
} from 'lucide-react';
import { formatCurrency } from '../../lib/receiptGenerator';
import { useToast } from '../../contexts/ToastContext';

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
  userName = 'Jaystarbliss User',
  onPaystackTopUp
}) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'transfer' | 'card'>('transfer');
  const [amount, setAmount] = useState<string>('10000');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // Virtual account dedicated to user
  const virtualAccount = {
    bankName: 'Wema Bank / ALAT',
    accountNumber: '8129304921',
    accountName: `JAYSTARBLISS / ${userName.toUpperCase()}`,
    expires: 'Permanent Dedicated Account'
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleCardPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num < 500) {
      toast.error('Minimum deposit amount is ₦500');
      return;
    }
    setLoading(true);
    try {
      if (!onPaystackTopUp) {
        throw new Error('Online card top-up is not configured for this account.');
      }
      await onPaystackTopUp(num);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to initiate top-up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div 
        className="w-full max-w-lg rounded-t-[32px] sm:rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Add Money to Wallet
              </h2>
              <p className="text-xs text-slate-500">
                Instant funding via Bank Transfer or Paystack Card
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 mt-5 rounded-2xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('transfer')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              tab === 'transfer'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 size={15} />
            <span>Bank Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('card')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              tab === 'card'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CreditCard size={15} />
            <span>Debit Card / USSD</span>
          </button>
        </div>

        {tab === 'transfer' ? (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <ShieldCheck size={16} className="text-emerald-600" />
                <span>Dedicated Virtual Account for Instant Top-up</span>
              </div>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-1">
                Transfer any amount from your bank app (GTB, Kuda, Zenith, OPay, etc.) to this account to fund your wallet automatically in &lt; 30 seconds.
              </p>
            </div>

            {/* Virtual Account Box */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
              <div>
                <span className="block text-[10px] font-black uppercase text-slate-400">Bank Name</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{virtualAccount.bankName}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="block text-[10px] font-black uppercase text-slate-400">Account Number</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono font-black text-xl text-slate-900 dark:text-white tracking-widest">
                    {virtualAccount.accountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(virtualAccount.accountNumber, 'Account number')}
                    className="min-h-8 px-3 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 transition-all"
                  >
                    {copiedField === 'Account number' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedField === 'Account number' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="block text-[10px] font-black uppercase text-slate-400">Account Name</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-300">{virtualAccount.accountName}</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[11px] text-slate-500 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
              <span>Automated NIBSS reconciliation powered by Paystack Virtual Accounts.</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCardPayment} className="mt-5 space-y-4">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                Top-Up Amount (₦ NGN)
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
                  onChange={e => setAmount(e.target.value)}
                  placeholder="10,000"
                  className="w-full min-h-12 pl-9 pr-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-base font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-red outline-hidden"
                />
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-2 mt-2">
                {[5000, 10000, 25000, 50000, 100000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(String(val))}
                    className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    ₦{val.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || Number(amount) < 500}
              className="w-full min-h-12 rounded-2xl bg-brand-red hover:bg-red-700 text-white font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Connecting to Paystack…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Pay {formatCurrency(Number(amount) || 0)} Securely</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
