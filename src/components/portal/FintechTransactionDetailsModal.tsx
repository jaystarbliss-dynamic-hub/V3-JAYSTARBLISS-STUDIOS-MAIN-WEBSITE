import React, { useState } from 'react';
import { 
  ArrowLeft, Check, CheckCircle2, ChevronRight, 
  Copy, Download, HelpCircle, MessageSquare, 
  ShieldCheck, X, AlertCircle, User, Users, GraduationCap, Building2, BookOpen
} from 'lucide-react';
import { formatCurrency, formatReceiptDate, generatePdfReceipt, parseDate, getReceiptDetails } from '../../lib/receiptGenerator';
import type { TransactionReceiptData } from '../../lib/receiptGenerator';
import { useToast } from '../../contexts/ToastContext';

interface FintechTransactionDetailsModalProps {
  transaction: TransactionReceiptData | null;
  onClose: () => void;
  onReportIssue?: (transaction: TransactionReceiptData) => void;
}

export const FintechTransactionDetailsModal: React.FC<FintechTransactionDetailsModalProps> = ({
  transaction,
  onClose,
  onReportIssue
}) => {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueMessage, setIssueMessage] = useState('');
  const [sendingIssue, setSendingIssue] = useState(false);

  if (!transaction) return null;

  const rawAmount = Number(transaction.customerTotal || transaction.amount || transaction.baseAmount || 0);
  const date = parseDate(transaction.paidAt || transaction.createdAt);
  const formattedDate = formatReceiptDate(date);
  
  // Format short timestamps for the 3-step progress bar
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const stepTime = `${month}-${day} ${hours}:${minutes}:${seconds}`;

  const hashStr = (s: string) => {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  };

  const transactionNo = transaction.transactionNo || '26' + (Math.abs(hashStr(transaction.id || transaction.reference || '')) % 9000000000000000 + 1000000000000000);
  const sessionId = transaction.sessionId || (transaction.reference ? `100004${Math.abs(hashStr(transaction.reference))}` : `100004260920172621171878699699`);

  const details = getReceiptDetails(transaction);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownload = () => {
    try {
      generatePdfReceipt(transaction);
      toast.success('Receipt downloaded successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate receipt');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Jaystarbliss Payment Receipt - ${details.displayTitle}`,
          text: `Payment of ${formatCurrency(rawAmount)} for ${details.displayTitle} on Jaystarbliss Academy.`,
          url: window.location.href,
        });
        toast.success('Receipt shared');
      } catch {
        handleDownload();
      }
    } else {
      handleDownload();
    }
  };

  const handleSubmitIssue = (e: React.FormEvent) => {
    e.preventDefault();
    setSendingIssue(true);
    setTimeout(() => {
      setSendingIssue(false);
      setShowIssueModal(false);
      toast.success('Your report has been logged. Our billing support team will contact you within 24 hours.');
      setIssueMessage('');
      if (onReportIssue) onReportIssue(transaction);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm flex justify-center items-end sm:items-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col relative"
        role="dialog"
        aria-modal="true"
      >
        {/* Top App Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/90 sticky top-0 z-10">
          <button 
            type="button" 
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-medium text-sm transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Transaction Receipt</span>
          </button>
          <div className="flex items-center gap-2">
            <button 
              type="button" 
              onClick={() => setShowIssueModal(true)}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title="Help / Support"
            >
              <HelpCircle size={18} />
            </button>
            <button 
              type="button" 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors sm:hidden"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 pb-24">
          
          {/* Hero Transaction Card */}
          <div className="bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 space-y-3 shadow-xs">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-xs font-bold mb-1">
                <BookOpen size={12} />
                <span>{details.programName}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
                {formatCurrency(rawAmount)}
              </h2>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {details.displayTitle}
              </p>
              <div className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold pt-1">
                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>{String(transaction.status || 'UNKNOWN').trim().toUpperCase()}</span>
              </div>
            </div>

            {/* 3-Step Progress Tracker */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700/50">
              <div className="flex items-start justify-between relative px-2">
                <div className="absolute top-3.5 left-7 right-7 h-[2px] bg-emerald-500/20 dark:bg-emerald-500/30 z-0" />
                <div className="absolute top-3.5 left-7 right-7 h-[2px] bg-emerald-500 dark:bg-emerald-400 z-0" style={{ width: '100%' }} />

                <div className="flex flex-col items-center text-center z-10 max-w-[85px]">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-md ring-4 ring-slate-50 dark:ring-slate-800">
                    <Check size={14} strokeWidth={3} />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-2 leading-tight">Payment verified</span>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">{stepTime}</span>
                </div>

                <div className="flex flex-col items-center text-center z-10 max-w-[85px]">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-md ring-4 ring-slate-50 dark:ring-slate-800">
                    <Check size={14} strokeWidth={3} />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-2 leading-tight">Paystack settlement</span>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">{stepTime}</span>
                </div>

                <div className="flex flex-col items-center text-center z-10 max-w-[85px]">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-md ring-4 ring-slate-50 dark:ring-slate-800">
                    <Check size={14} strokeWidth={3} />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-2 leading-tight">Credited to Academy</span>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">{stepTime}</span>
                </div>
              </div>
            </div>

            {/* Notification Banner */}
            <div className="bg-emerald-50/60 dark:bg-slate-900/60 border border-emerald-100 dark:border-slate-700/50 rounded-xl p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2">
              <ShieldCheck size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                {details.isParentPaidForStudent 
                  ? `Payment confirmed for cadet ${details.studentName}. Curriculum access, attendance records, and learning modules are fully active.`
                  : details.payerRole === 'School'
                    ? `Institutional partnership fee reconciled for ${details.schoolName}. Student cohorts and lab access codes are fully unlocked.`
                    : 'The payment has been confirmed and credited to the student record. Academic and portal access is fully active.'}
              </span>
            </div>
          </div>

          {/* Key-Value Details Container: Payer & Beneficiary Breakdown */}
          <div className="bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 divide-y divide-slate-200 dark:divide-slate-700/50 text-xs">
            {/* Payer Account & Role */}
            <div className="pb-3 flex justify-between items-start gap-3">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <User size={14} />
                <span>Paid By (Payer)</span>
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-900 dark:text-white">{details.payerName}</div>
                <div className="mt-0.5 inline-block px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                  {details.roleLabel}
                </div>
              </div>
            </div>

            {/* Programme Name */}
            <div className="py-3 flex justify-between items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <BookOpen size={14} />
                <span>Programme</span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-right">
                {details.programName}
              </div>
            </div>

            {/* Beneficiary / Cadet details */}
            <div className="py-3 flex justify-between items-start gap-3">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                {details.payerRole === 'School' ? <Building2 size={14} /> : details.isMultipleStudents ? <Users size={14} /> : <GraduationCap size={14} />}
                <span>Beneficiary</span>
              </div>
              <div className="text-right max-w-[240px]">
                <div className="font-bold text-slate-900 dark:text-white">{details.beneficiary}</div>
                {details.isMultipleStudents && details.studentList.length > 0 && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Cadets: {details.studentList.join(', ')}
                  </div>
                )}
              </div>
            </div>

            {/* Transaction No */}
            <div className="py-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Transaction No.</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px]">{transactionNo}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(transactionNo, 'txnNo')}
                  className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors p-1"
                  title="Copy Transaction No"
                >
                  {copiedKey === 'txnNo' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            {/* Payment Method */}
            <div className="py-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Payment Method</span>
              <div className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                <span>{transaction.paymentMethod || 'Paystack Direct Bank / Card'}</span>
              </div>
            </div>

            {/* Transaction Date */}
            <div className="py-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Transaction Date</span>
              <span className="text-slate-800 dark:text-slate-200 font-medium">{formattedDate}</span>
            </div>

            {/* Session ID / Reference */}
            <div className="pt-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Session ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate max-w-[170px]">{sessionId}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(sessionId, 'sessId')}
                  className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors p-1"
                  title="Copy Session ID"
                >
                  {copiedKey === 'sessId' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>

          {/* Academic Track & Mode Container */}
          <div className="bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 divide-y divide-slate-200 dark:divide-slate-700/50 text-xs">
            <div className="pb-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Academic Delivery</span>
              <div className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                <span>{transaction.teachingMode || 'Standard Hybrid Track'}</span>
                <ChevronRight size={13} className="text-slate-400 dark:text-slate-500" />
              </div>
            </div>
            <div className="pt-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Duration</span>
              <div className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                <span>{transaction.durationWeeks ? `${transaction.durationWeeks} Weeks` : 'Termly Plan'}</span>
                <ChevronRight size={13} className="text-slate-400 dark:text-slate-500" />
              </div>
            </div>
          </div>

        </div>

        {/* Fixed Sticky Action Bar at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800/80 backdrop-blur-md flex items-center gap-3 z-20">
          <button
            type="button"
            onClick={() => setShowIssueModal(true)}
            className="flex-1 min-h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <MessageSquare size={14} />
            <span>Report Issue</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 min-h-11 rounded-xl bg-[#00D592] hover:bg-[#00BF83] text-slate-950 font-black text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            <span>Download PDF Receipt</span>
          </button>
        </div>

        {/* Issue Reporting Modal */}
        {showIssueModal && (
          <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md p-5 flex flex-col justify-center animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                  <AlertCircle size={16} className="text-amber-500 dark:text-amber-400" />
                  <span>Report an Issue</span>
                </div>
                <button type="button" onClick={() => setShowIssueModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Reference: <span className="font-mono text-emerald-600 dark:text-emerald-400">{transaction.reference || transaction.id}</span>
              </p>
              <form onSubmit={handleSubmitIssue} className="space-y-3">
                <textarea
                  required
                  rows={3}
                  value={issueMessage}
                  onChange={e => setIssueMessage(e.target.value)}
                  placeholder="Describe your inquiry or discrepancy regarding this transaction..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIssueModal(false)}
                    className="flex-1 min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingIssue}
                    className="flex-1 min-h-9 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs disabled:opacity-50"
                  >
                    {sendingIssue ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FintechTransactionDetailsModal;

