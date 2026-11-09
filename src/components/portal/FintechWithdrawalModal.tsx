import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine, X, CheckCircle2, ArrowRight, Loader2, Search, ShieldCheck
} from 'lucide-react';
import { formatCurrency } from '../../lib/receiptGenerator';
import { useToast } from '../../contexts/ToastContext';
import { billingGet, billingPost, type PaymentConfig } from '../../lib/billing';
import { auth } from '../../lib/firebase';

export interface BankOption {
  code: string;
  name: string;
}

export interface FintechWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  initialMode?: 'bank';
  savedBankCode?: string;
  savedAccountNumber?: string;
  savedAccountLast4?: string;
  savedAccountName?: string;
  banksList?: BankOption[];
  withdrawalFeePolicy?: { percentage: number; flat: number; cap: number; enabled: boolean };
  minimumWithdrawalAmount?: number;
  onConfirmWithdrawal: (data: {
    destination: 'bank';
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    amount: number;
    fee: number;
    netAmount: number;
  }) => Promise<void>;
}

type Step = 'saved-choice' | 'form' | 'confirm';

export const FintechWithdrawalModal: React.FC<FintechWithdrawalModalProps> = ({
  isOpen,
  onClose,
  availableBalance = 0,
  savedBankCode = '',
  savedAccountNumber = '',
  savedAccountLast4 = '',
  savedAccountName = '',
  banksList = [],
  withdrawalFeePolicy,
  minimumWithdrawalAmount,
  onConfirmWithdrawal
}) => {
  const { toast } = useToast();
  const hasSavedAccount = Boolean(savedBankCode && (savedAccountLast4 || savedAccountNumber) && savedAccountName);
  const [step, setStep] = useState<Step>('form');
  const [bankCode, setBankCode] = useState(savedBankCode);
  const [bankSearch, setBankSearch] = useState('');
  const [accountNumber, setAccountNumber] = useState(savedAccountNumber);
  const [accountName, setAccountName] = useState(savedAccountName);
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [accountVerified, setAccountVerified] = useState(hasSavedAccount);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [directoryBanks, setDirectoryBanks] = useState<BankOption[]>(banksList || []);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [loadedConfig, setLoadedConfig] = useState<PaymentConfig | null>(null);

  useEffect(() => {
    setDirectoryBanks(banksList || []);
  }, [banksList]);

  useEffect(() => {
    if (!isOpen || (withdrawalFeePolicy && minimumWithdrawalAmount !== undefined)) return;
    let cancelled = false;
    billingGet<PaymentConfig>('payment-config')
      .then(cfg => {
        if (!cancelled && cfg) setLoadedConfig(cfg);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, withdrawalFeePolicy, minimumWithdrawalAmount]);

  useEffect(() => {
    if (!isOpen || directoryBanks.length > 0) return;
    let cancelled = false;
    const loadDirectory = async () => {
      setDirectoryLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const response = await fetch('/.netlify/functions/paystack-banks', { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to load supported banks.');
        if (!cancelled) setDirectoryBanks(Array.isArray(result.banks) ? result.banks : []);
      } catch (error) {
        console.warn('Nigerian bank directory lookup failed:', error);
      } finally {
        if (!cancelled) setDirectoryLoading(false);
      }
    };
    void loadDirectory();
    return () => { cancelled = true; };
  }, [isOpen, directoryBanks.length]);

  useEffect(() => {
    if (!isOpen) return;
    const saved = Boolean(savedBankCode && (savedAccountLast4 || savedAccountNumber) && savedAccountName);
    setStep(saved ? 'saved-choice' : 'form');
    setBankCode(savedBankCode || '');
    setAccountNumber(savedAccountNumber || '');
    setAccountName(savedAccountName || '');
    setAccountVerified(saved);
    setBankSearch('');
    setAmount('');
    setSubmitting(false);
  }, [isOpen, savedBankCode, savedAccountNumber, savedAccountLast4, savedAccountName]);

  const availableBanks = useMemo(
    () => [...directoryBanks].sort((a, b) => a.name.localeCompare(b.name)),
    [directoryBanks]
  );

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return availableBanks;
    return availableBanks.filter(bank =>
      bank.name.toLowerCase().includes(q) || bank.code.toLowerCase().includes(q)
    );
  }, [availableBanks, bankSearch]);

  const selectedBank = availableBanks.find(bank => bank.code === bankCode);
  const numAmount = Number(amount) || 0;
  const effectivePolicy = withdrawalFeePolicy || loadedConfig?.withdrawalFeePolicy || { percentage: 0, flat: 0, cap: 0, enabled: false };
  const effectiveMinimum = Number(minimumWithdrawalAmount ?? loadedConfig?.minimumWithdrawalAmount ?? 10000);
  const fee = useMemo(() => {
    if (!effectivePolicy.enabled || numAmount <= 0) return 0;
    const pct = numAmount * (Math.max(0, Number(effectivePolicy.percentage) || 0) / 100);
    const flat = Math.max(0, Number(effectivePolicy.flat) || 0);
    const uncapped = pct + flat;
    const cap = Number(effectivePolicy.cap) > 0 ? Number(effectivePolicy.cap) : Number.POSITIVE_INFINITY;
    return Number(Math.min(uncapped, cap).toFixed(2));
  }, [effectivePolicy, numAmount]);
  const netAmount = Number(Math.max(0, numAmount - fee).toFixed(2));

  const resetToAnotherAccount = () => {
    setStep('form');
    setBankCode('');
    setBankSearch('');
    setAccountNumber('');
    setAccountName('');
    setAccountVerified(false);
    setAmount('');
  };

  const verifyAndSaveAccount = async () => {
    if (!bankCode) {
      toast.error('Select your destination bank first.');
      return;
    }
    if (!/^\d{10}$/.test(accountNumber)) {
      toast.error('Enter a valid 10-digit account number.');
      return;
    }

    setVerifyingAccount(true);
    try {
      const result = await billingPost<{ saved: boolean; accountName: string; last4: string }>('wallet-withdraw', {
        action: 'save_bank',
        bankCode,
        accountNumber
      });
      const verifiedName = String(result.accountName || '').trim();
      if (!verifiedName) throw new Error('The bank did not return a verified account name.');
      setAccountName(verifiedName);
      setAccountVerified(true);
      toast.success('Bank account verified and saved.');
    } catch (error) {
      setAccountName('');
      setAccountVerified(false);
      toast.error(error instanceof Error ? error.message : 'The bank account could not be verified.');
    } finally {
      setVerifyingAccount(false);
    }
  };

  const handleContinue = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBank) {
      toast.error('Select a destination bank.');
      return;
    }
    if (!accountVerified || !accountName) {
      toast.error('Verify the account number with the bank before continuing.');
      return;
    }
    if (numAmount < 1) {
      toast.error('Enter a withdrawal amount.');
      return;
    }
    if (effectiveMinimum > 0 && numAmount < effectiveMinimum) {
      toast.error(`Minimum withdrawal amount is ${formatCurrency(effectiveMinimum)}.`);
      return;
    }
    if (numAmount > availableBalance) {
      toast.error('Withdrawal amount exceeds your available balance.');
      return;
    }
    if (netAmount <= 0) {
      toast.error('Withdrawal amount must exceed the service fee.');
      return;
    }
    setStep('confirm');
  };

  const handleFinalSubmit = async () => {
    if (!selectedBank || !accountVerified || !accountName) return;
    setSubmitting(true);
    try {
      await onConfirmWithdrawal({
        destination: 'bank',
        bankCode: selectedBank.code,
        bankName: selectedBank.name,
        accountNumber,
        accountName,
        amount: numAmount,
        fee,
        netAmount
      });
      toast.success('Withdrawal of ' + formatCurrency(numAmount) + ' initiated successfully.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to complete payout.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-lg rounded-t-[32px] sm:rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center">
              <ArrowDownToLine size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {step === 'confirm' ? 'Confirm Payout' : 'Withdraw Payout'}
              </h2>
              <p className="text-xs text-slate-500">
                Available Balance:{' '}
                <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-black">
                  {formatCurrency(availableBalance)}
                </strong>
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {step === 'saved-choice' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20 p-5">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 mb-2">
                <CheckCircle2 size={18} />
                <span className="text-sm font-black">Previous account available</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">Withdraw to the verified account saved on your profile?</p>
              <div className="mt-4 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-emerald-100 dark:border-emerald-900/50 p-3">
                <p className="text-xs font-black text-slate-900 dark:text-white">{savedAccountName}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {(availableBanks.find(bank => bank.code === savedBankCode)?.name || 'Verified Nigerian bank') + ' •••• ' + (savedAccountLast4 || savedAccountNumber.slice(-4))}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" onClick={() => setStep('form')} className="min-h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2">
                Yes, use this account <ArrowRight size={15} />
              </button>
              <button type="button" onClick={resetToAnotherAccount} className="min-h-12 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black hover:bg-slate-50 dark:hover:bg-slate-800">
                Withdraw to another account
              </button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleContinue} className="mt-5 space-y-4">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Select Destination Bank</label>
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={bankSearch}
                  onChange={event => setBankSearch(event.target.value)}
                  placeholder="Search Nigerian banks, mobile banks or microfinance banks"
                  className="w-full min-h-11 pl-10 pr-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white outline-hidden"
                />
              </div>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {filteredBanks.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500">No supported bank found. Try another search.</div>
                ) : (
                  filteredBanks.map(bank => (
                    <button
                      key={bank.code}
                      type="button"
                      onClick={() => {
                        setBankCode(bank.code);
                        setAccountNumber('');
                        setAccountName('');
                        setAccountVerified(false);
                      }}
                      className={'w-full text-left px-3.5 py-3 border-b last:border-b-0 border-slate-100 dark:border-slate-700/70 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs ' + (bank.code === bankCode ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-black' : 'text-slate-700 dark:text-slate-200 font-semibold')}
                    >
                      {bank.name}
                    </button>
                  ))
                )}
              </div>
              {selectedBank && (
                <p className="mt-1.5 text-[11px] text-slate-500">Selected: <span className="font-bold text-slate-800 dark:text-slate-200">{selectedBank.name}</span></p>
              )}
              {directoryLoading && <p className="mt-2 text-[11px] text-slate-500">Loading the live Nigerian bank directory…</p>}
              {!directoryLoading && availableBanks.length === 0 && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">The bank directory could not be loaded. Close this window and try again.</p>}
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Account Number</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  value={accountNumber}
                  onChange={event => {
                    setAccountNumber(event.target.value.replace(/\D/g, ''));
                    setAccountName('');
                    setAccountVerified(false);
                  }}
                  placeholder="Enter account number"
                  className="flex-1 min-h-12 px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-black text-slate-900 dark:text-white tracking-widest outline-hidden"
                />
                <button
                  type="button"
                  disabled={verifyingAccount || !selectedBank || !/^\d{10}$/.test(accountNumber)}
                  onClick={verifyAndSaveAccount}
                  className="min-h-12 px-4 rounded-2xl bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-black disabled:opacity-40 flex items-center gap-2"
                >
                  {verifyingAccount ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Verify
                </button>
              </div>
              {accountVerified && accountName && (
                <div className="mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                  <span className="font-bold truncate">Verified Name: {accountName}</span>
                </div>
              )}
              <p className="mt-1.5 text-[10px] text-slate-400">The account name is returned by the bank/payment network; nothing is hardcoded.</p>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Withdrawal Amount (₦ NGN)</label>
              <input
                type="number"
                min="1"
                max={availableBalance}
                required
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder="0.00"
                className="w-full min-h-12 px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-base font-black text-slate-900 dark:text-white outline-hidden"
              />
            </div>

            {numAmount > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Withdrawal Amount</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(numAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Service Fee</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(fee)}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold">
                  <span className="text-slate-900 dark:text-white font-black">Net Payout</span>
                  <span className="font-mono text-sm font-black text-brand-red">{formatCurrency(netAmount)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedBank || !accountVerified || !accountName || numAmount <= 0 || numAmount > availableBalance}
              className="w-full min-h-12 rounded-2xl bg-brand-red hover:bg-red-700 text-white font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              Review Payout <ArrowRight size={15} />
            </button>
          </form>
        )}

        {step === 'confirm' && selectedBank && (
          <div className="mt-5 space-y-5">
            <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-center">
              <span className="text-xs text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wider">Payout Amount</span>
              <p className="text-3xl font-black font-mono text-emerald-700 dark:text-emerald-300 mt-1">{formatCurrency(netAmount)}</p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">To {selectedBank.name}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              <div className="p-3 flex justify-between gap-4"><span className="text-slate-500">Destination Bank</span><strong className="text-right text-slate-900 dark:text-white">{selectedBank.name}</strong></div>
              <div className="p-3 flex justify-between gap-4"><span className="text-slate-500">Account Number</span><strong className="font-mono text-slate-900 dark:text-white">{accountNumber || ('••••••' + (savedAccountLast4 || ''))}</strong></div>
              <div className="p-3 flex justify-between gap-4"><span className="text-slate-500">Beneficiary Name</span><strong className="text-right text-slate-900 dark:text-white">{accountName}</strong></div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setStep('form')} className="flex-1 min-h-12 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Back</button>
              <button type="button" disabled={submitting} onClick={handleFinalSubmit} className="flex-1 min-h-12 rounded-2xl bg-brand-red hover:bg-red-700 text-white text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                {submitting ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><ShieldCheck size={16} /> Withdraw Now</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
