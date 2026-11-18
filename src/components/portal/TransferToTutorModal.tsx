import React, { useState } from 'react';
import { X, Send, UserCheck, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/receiptGenerator';

export interface TransferToTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tutors: Array<{ id: string; name: string; email?: string; role?: string }>;
  availableTreasuryBalance: number;
  onTransfer: (tutorId: string, tutorName: string, amount: number, notes: string) => Promise<void>;
}

export const TransferToTutorModal: React.FC<TransferToTutorModalProps> = ({
  isOpen,
  onClose,
  tutors,
  availableTreasuryBalance,
  onTransfer
}) => {
  const [selectedTutorId, setSelectedTutorId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const numericAmount = Number(amount) || 0;
  const selectedTutor = tutors.find(t => t.id === selectedTutorId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedTutorId || !selectedTutor) {
      setError('Please select a recipient tutor.');
      return;
    }

    if (numericAmount <= 0) {
      setError('Please enter a valid transfer amount.');
      return;
    }

    if (numericAmount > availableTreasuryBalance && availableTreasuryBalance > 0) {
      setError(`Transfer amount exceeds available platform treasury balance (${formatCurrency(availableTreasuryBalance)}).`);
      return;
    }

    setSubmitting(true);
    try {
      await onTransfer(selectedTutor.id, selectedTutor.name, numericAmount, notes || 'Direct Faculty Allocation');
      setSelectedTutorId('');
      setAmount('');
      setNotes('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-[#1E293B] dark:text-white flex items-center justify-center">
              <Send size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Transfer to Tutor Wallet
              </h3>
              <p className="text-xs text-slate-500">
                Disburse teaching allocations directly into instructor balance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Treasury Available Notice */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#1E293B] dark:text-slate-300" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Platform Treasury Available:
            </span>
          </div>
          <span className="font-mono tabular-nums font-black text-sm text-slate-900 dark:text-white">
            {formatCurrency(availableTreasuryBalance)}
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-[#B91C1C] dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Select Instructor / Tutor <span className="text-[#B91C1C]">*</span>
            </label>
            <select
              required
              value={selectedTutorId}
              onChange={e => setSelectedTutorId(e.target.value)}
              className="w-full min-h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1E293B] dark:focus:ring-slate-400"
            >
              <option value="">-- Choose Instructor --</option>
              {tutors.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.email || t.role || 'Faculty'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Transfer Amount (₦ NGN) <span className="text-[#B91C1C]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-xs text-slate-400">
                ₦
              </span>
              <input
                type="number"
                required
                min="100"
                step="100"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full min-h-11 pl-8 pr-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1E293B] dark:focus:ring-slate-400"
              />
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-2">
            {[10000, 25000, 50000, 100000, 150000].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(String(val))}
                className="px-2.5 py-1 rounded-lg text-[11px] font-mono tabular-nums font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-[#1E293B] hover:text-white dark:hover:bg-[#B91C1C] transition-colors"
              >
                +₦{val.toLocaleString()}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Disbursement Purpose / Note
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Term 1 Robotics lab instruction stipend"
              className="w-full min-h-11 px-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1E293B] dark:focus:ring-slate-400"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedTutorId || numericAmount <= 0}
              className="min-h-11 px-6 rounded-2xl bg-[#1E293B] hover:bg-[#0F172A] dark:bg-[#B91C1C] dark:hover:bg-[#991B1B] disabled:opacity-50 text-white text-xs font-black transition-all flex items-center gap-2 shadow-sm tabular-nums"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={15} />
                  <span>Processing Transfer...</span>
                </>
              ) : (
                <>
                  <UserCheck size={15} />
                  <span>Confirm Transfer ({formatCurrency(numericAmount)})</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
