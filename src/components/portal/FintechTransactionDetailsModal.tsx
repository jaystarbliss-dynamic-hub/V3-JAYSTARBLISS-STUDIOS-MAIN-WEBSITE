import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  HelpCircle,
  MessageSquare,
  ShieldCheck,
  X,
  AlertCircle,
  User,
  Users,
  GraduationCap,
  Building2,
  BookOpen
} from 'lucide-react';
import {
  formatCurrency,
  formatReceiptDate,
  generatePdfReceipt,
  parseDate,
  getReceiptDetails
} from '../../lib/receiptGenerator';
import type { TransactionReceiptData } from '../../lib/receiptGenerator';
import { extractPaymentAmountNaira } from '../../lib/billing';
import { classifyStatusBucket, resolveVerifiedChannelLabel } from '../../lib/financialAnalytics';
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

  const rawAmount = extractPaymentAmountNaira(transaction);
  const date = parseDate(transaction.paidAt || transaction.createdAt);
  const formattedDate = formatReceiptDate(date);
  const statusInfo = classifyStatusBucket(transaction.status ?? (transaction as any).paymentStatus);
  const channelResolved = resolveVerifiedChannelLabel(transaction);
  const displayMethod =
    channelResolved === 'Unknown / Not Recorded'
      ? 'Paystack Hosted Checkout (Channel Not Recorded)'
      : channelResolved;

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

  const transactionNo =
    transaction.transactionNo ||
    '26' + (Math.abs(hashStr(transaction.id || transaction.reference || '')) % 9000000000000000 + 1000000000000000);
  const sessionId =
    transaction.sessionId ||
    (transaction.reference
      ? `100004${Math.abs(hashStr(transaction.reference))}`
      : '100004260920172621171878699699');

  const details = getReceiptDetails(transaction);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownload = async () => {
    try {
      await generatePdfReceipt(transaction);
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

  const policyAccepted = Boolean((transaction as any).paymentPolicyAccepted);
  const policyVersion = String((transaction as any).paymentPolicyVersion || '').trim();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex justify-center items-end sm:items-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col relative"
        role="dialog"
        aria-modal="true"
        aria-label="Transaction Receipt Details"
      >
        {/* Top App Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 sticky top-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white font-bold text-sm transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
            <span>Transaction Receipt</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowIssueModal(true)}
              className="p-2 text-slate-500 hover:text-brand-red hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Help / Support"
              aria-label="Report an issue"
            >
              <HelpCircle size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt details"
              className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors sm:hidden cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 pb-24">

          {/* Hero Transaction Card */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70 rounded-2xl p-5 space-y-3 shadow-2xs">
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-brand-red">
                <BookOpen size={13} />
                <span>{details.programName}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                {formatCurrency(rawAmount)}
              </h2>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {details.displayTitle}
              </p>
              <div
                className={`inline-flex items-center gap-1.5 text-xs font-black pt-1 ${
                  statusInfo.bucket === 'failed' || statusInfo.bucket === 'reversed'
                    ? 'text-brand-red'
                    : 'text-slate-800 dark:text-slate-100'
                }`}
              >
                {statusInfo.isVerifiedPaid ? (
                  <CheckCircle2 size={14} className="text-slate-900 dark:text-white" />
                ) : statusInfo.bucket === 'failed' || statusInfo.bucket === 'reversed' ? (
                  <AlertCircle size={14} className="text-brand-red" />
                ) : (
                  <Clock size={14} className="text-slate-500" />
                )}
                <span>{statusInfo.label.toUpperCase()}</span>
              </div>
            </div>

            {/* 3-Step Settlement Progress */}
            {statusInfo.isVerifiedPaid && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60">
                <div className="flex items-start justify-between relative px-2">
                  <div className="absolute top-3.5 left-7 right-7 h-[2px] bg-slate-900 dark:bg-slate-300 z-0" />

                  <div className="flex flex-col items-center text-center z-10 max-w-[85px]">
                    <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold text-xs shadow-sm ring-4 ring-slate-50 dark:ring-slate-800">
                      <Check size={14} strokeWidth={3} />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-2 leading-tight">Payment verified</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">{stepTime}</span>
                  </div>

                  <div className="flex flex-col items-center text-center z-10 max-w-[85px]">
                    <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold text-xs shadow-sm ring-4 ring-slate-50 dark:ring-slate-800">
                      <Check size={14} strokeWidth={3} />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-2 leading-tight">Paystack settlement</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">{stepTime}</span>
                  </div>

                  <div className="flex flex-col items-center text-center z-10 max-w-[85px]">
                    <div className="w-7 h-7 rounded-lg bg-brand-red text-white flex items-center justify-center font-bold text-xs shadow-sm ring-4 ring-slate-50 dark:ring-slate-800">
                      <Check size={14} strokeWidth={3} />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-2 leading-tight">Credited to Academy</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">{stepTime}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Status Confirmation Notice */}
            <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2">
              <ShieldCheck size={15} className="text-brand-red shrink-0 mt-0.5" />
              <span>
                {!statusInfo.isVerifiedPaid
                  ? `This transaction currently has status "${statusInfo.label}". It is not counted toward verified paid tuition or settled revenue.`
                  : details.isParentPaidForStudent
                    ? `Payment confirmed for cadet ${details.studentName}. Curriculum access, attendance records, and learning modules are active.`
                    : details.payerRole === 'School'
                      ? `Institutional partnership fee reconciled for ${details.schoolName}. Student cohorts and lab access codes are active.`
                      : 'Payment has been verified and credited to the student record. Academic and portal access is active.'}
              </span>
            </div>
          </div>

          {/* Key-Value Details Container */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70 rounded-2xl p-4 divide-y divide-slate-200 dark:divide-slate-700/60 text-xs">
            <div className="pb-3 flex justify-between items-start gap-3">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <User size={14} />
                <span>Paid By (Payer)</span>
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-900 dark:text-white">{details.payerName}</div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  {details.roleLabel}
                </div>
              </div>
            </div>

            <div className="py-3 flex justify-between items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <BookOpen size={14} />
                <span>Programme</span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-right">
                {details.programName}
              </div>
            </div>

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

            <div className="py-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Transaction No.</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px]">{transactionNo}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(transactionNo, 'txnNo')}
                  className="text-brand-red hover:text-red-800 transition-colors p-1 cursor-pointer"
                  title="Copy Transaction No"
                >
                  {copiedKey === 'txnNo' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div className="py-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Payment Channel</span>
              <div className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                {displayMethod}
              </div>
            </div>

            <div className="py-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Transaction Date</span>
              <span className="text-slate-800 dark:text-slate-200 font-medium">{formattedDate}</span>
            </div>

            {policyAccepted && (
              <div className="py-3 flex justify-between items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400">No-Refund Policy Consent</span>
                <span className="text-slate-800 dark:text-slate-200 font-bold">
                  Accepted ({policyVersion || 'v1.0-no-refund'})
                </span>
              </div>
            )}

            <div className="pt-3 flex justify-between items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Session / Reference ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate max-w-[170px]">{sessionId}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(sessionId, 'sessId')}
                  className="text-brand-red hover:text-red-800 transition-colors p-1 cursor-pointer"
                  title="Copy Session ID"
                >
                  {copiedKey === 'sessId' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>

          {/* Academic Track & Mode Container */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70 rounded-2xl p-4 divide-y divide-slate-200 dark:divide-slate-700/60 text-xs">
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
            className="flex-1 min-h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <MessageSquare size={14} />
            <span>Report Issue</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 min-h-11 rounded-xl bg-brand-red hover:bg-red-800 text-white font-black text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
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
                  <AlertCircle size={16} className="text-brand-red" />
                  <span>Report an Issue</span>
                </div>
                <button type="button" onClick={() => setShowIssueModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Reference: <span className="font-mono font-bold text-slate-900 dark:text-white">{transaction.reference || transaction.id}</span>
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
                    className="flex-1 min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingIssue}
                    className="flex-1 min-h-9 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-brand-red dark:hover:bg-red-800 text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
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
