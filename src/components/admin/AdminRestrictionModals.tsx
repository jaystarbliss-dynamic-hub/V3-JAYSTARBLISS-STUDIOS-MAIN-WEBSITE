import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Eye,
  Lock,
  Loader2,
  ShieldAlert,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { billingPost } from '../../lib/billing';
import {
  LOCK_REASON_LIST,
  RESTRICTION_TYPE_LABELS,
  UNLOCK_REASON_PRESETS,
  buildDefaultUserFacingMessage,
  type AccountRestrictionRecord,
  type BulkLockPreviewResult,
  type BulkLockTargetInput,
  type LockReasonCode,
  type RestrictionType,
} from '../../../api/_lib/restriction-core';

export interface RestrictionModalTarget extends BulkLockTargetInput {
  liveStatus?: string;
  liveAmountDue?: number;
  isManuallyLocked?: boolean;
  hasPaymentRestriction?: boolean;
  activeRestrictions?: AccountRestrictionRecord[];
}

interface ApplyRestrictionModalProps {
  open: boolean;
  targets: RestrictionModalTarget[];
  onClose: () => void;
  onSuccess: () => void;
}

const MANUAL_RESTRICTION_TYPES: RestrictionType[] = [
  'MANUAL_ADMINISTRATIVE_RESTRICTION',
  'ADMINISTRATIVE_SUSPENSION',
  'TEMPORARY_RESTRICTION',
  'PROGRAMME_RESTRICTION',
  'SECURITY_OR_REVIEW_RESTRICTION',
];

export const ApplyRestrictionModal: React.FC<ApplyRestrictionModalProps> = ({
  open,
  targets,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState<'CONFIGURE' | 'PREVIEW' | 'RESULT'>('CONFIGURE');
  const [restrictionType, setRestrictionType] = useState<RestrictionType>('MANUAL_ADMINISTRATIVE_RESTRICTION');
  const [reasonCode, setReasonCode] = useState<LockReasonCode>('ADMINISTRATIVE_RESTRICTION');
  const [customReason, setCustomReason] = useState('');
  const [userFacingMessage, setUserFacingMessage] = useState('');
  const [internalAdminNote, setInternalAdminNote] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [cascadesToLinkedLearners, setCascadesToLinkedLearners] = useState(true);
  const [confirmedCheck, setConfirmedCheck] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<BulkLockPreviewResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    appliedCount: number;
    failedCount: number;
    succeeded: Array<{ restrictionId: string; accountName: string; linkedStudentCount: number }>;
    failed: Array<{ targetKey: string; accountName: string; error: string }>;
  } | null>(null);

  const primaryType = targets[0]?.accountType || 'SCHOOL';
  const hasCascadableTargets = targets.some((t) => t.accountType === 'SCHOOL' || t.accountType === 'PARENT');

  useEffect(() => {
    if (!open) return;
    setStep('CONFIGURE');
    setPreview(null);
    setExecutionResult(null);
    setConfirmedCheck(false);
    const defaultReason: LockReasonCode = 'ADMINISTRATIVE_RESTRICTION';
    setReasonCode(defaultReason);
    setRestrictionType(
      targets.length === 1 && primaryType === 'STUDENT_SELF_FUNDED_PROGRAMME'
        ? 'PROGRAMME_RESTRICTION'
        : 'MANUAL_ADMINISTRATIVE_RESTRICTION'
    );
    setCustomReason('');
    setUserFacingMessage(buildDefaultUserFacingMessage(defaultReason, primaryType));
    setInternalAdminNote('');
    setEffectiveAt('');
    setExpiresAt('');
    setCascadesToLinkedLearners(true);
  }, [open, primaryType, targets.length]);

  if (!open || targets.length === 0) return null;

  const handleReasonChange = (nextReason: LockReasonCode) => {
    setReasonCode(nextReason);
    setUserFacingMessage(buildDefaultUserFacingMessage(nextReason, primaryType, customReason));
  };

  const handleRequestPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reasonCode === 'OTHER' && customReason.trim().length < 3) {
      toast.error('Please enter a custom explanation when reason is OTHER.');
      return;
    }
    if (userFacingMessage.trim().length < 10) {
      toast.error('Please provide a clear user-facing explanation (at least 10 characters).');
      return;
    }
    setLoadingPreview(true);
    try {
      const payload = {
        action: 'preview_bulk_lock',
        targets: targets.map((t) => ({
          subscriptionId: t.subscriptionId || null,
          accountType: t.accountType,
          accountId: t.accountId,
          accountName: t.accountName || null,
          schoolId: t.schoolId || null,
          parentId: t.parentId || null,
          studentId: t.studentId || null,
          programmeEnrollmentId: t.programmeEnrollmentId || null,
        })),
        restrictionType,
        reasonCode,
        customReason: customReason.trim() || null,
        userFacingMessage: userFacingMessage.trim(),
        internalAdminNote: internalAdminNote.trim() || null,
        effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        cascadesToLinkedLearners,
      };
      const res = await billingPost<{ preview: BulkLockPreviewResult }>('billing-admin', payload);
      setPreview(res.preview);
      setConfirmedCheck(false);
      setStep('PREVIEW');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to build restriction preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmApply = async () => {
    if (!preview || !confirmedCheck) return;
    setSubmitting(true);
    try {
      const res = await billingPost<any>('billing-admin', {
        action: 'apply_bulk_lock',
        confirmed: true,
        targets: targets.map((t) => ({
          subscriptionId: t.subscriptionId || null,
          accountType: t.accountType,
          accountId: t.accountId,
          accountName: t.accountName || null,
          schoolId: t.schoolId || null,
          parentId: t.parentId || null,
          studentId: t.studentId || null,
          programmeEnrollmentId: t.programmeEnrollmentId || null,
        })),
        restrictionType,
        reasonCode,
        customReason: customReason.trim() || null,
        userFacingMessage: userFacingMessage.trim(),
        internalAdminNote: internalAdminNote.trim() || null,
        effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        cascadesToLinkedLearners,
      });

      const appliedCount = Number(res.appliedCount || 0);
      const failedCount = Number(res.failedCount || 0);
      setExecutionResult({
        appliedCount,
        failedCount,
        succeeded: res.succeeded || [],
        failed: res.failed || [],
      });

      if (failedCount === 0) {
        toast.success(
          appliedCount === 1
            ? 'Restriction applied and notification dispatched.'
            : `${appliedCount} restrictions applied successfully.`
        );
        onSuccess();
        onClose();
      } else {
        toast.error(
          `Applied ${appliedCount} restriction(s), but ${failedCount} account(s) failed validation. Review the report below.`
        );
        onSuccess();
        setStep('RESULT');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply restriction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#14284B]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-[#B91C1C] text-white flex items-center justify-center shrink-0">
              <Lock size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#14284B] dark:text-white truncate">
                {targets.length === 1
                  ? `Apply Restriction — ${targets[0].accountName || targets[0].accountId}`
                  : `Bulk Account Restriction (${targets.length} Selected)`}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-200">
                {step === 'CONFIGURE'
                  ? 'Step 1 of 2: Specify mandatory reason, user-facing explanation, and optional schedule'
                  : step === 'PREVIEW'
                  ? 'Step 2 of 2: Review affected accounts, linked learners, and confirm'
                  : 'Execution Report'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-500 dark:text-white cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* STEP 1: CONFIGURE */}
        {step === 'CONFIGURE' && (
          <form onSubmit={handleRequestPreview} className="divide-y divide-slate-200 dark:divide-slate-800 overflow-y-auto">
            {/* Selected targets inline strip */}
            <div className="px-6 py-3.5 bg-slate-50/70 dark:bg-[#14284B]/40">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-2">
                Selected Targets ({targets.length})
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {targets.map((t, idx) => (
                  <span
                    key={`${t.accountType}-${t.accountId}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white dark:bg-[#14284B] border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-[#14284B] dark:text-white"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-[#14284B] dark:bg-white/15 text-white text-[9px] font-bold uppercase tracking-wide">
                      {t.accountType.replace(/_/g, ' ')}
                    </span>
                    <span>{t.accountName || t.accountId}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Core Restriction Fields */}
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1.5">
                    Restriction Action / Type <span className="text-[#B91C1C] dark:text-white">*</span>
                  </label>
                  <select
                    value={restrictionType}
                    onChange={(e) => setRestrictionType(e.target.value as RestrictionType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    {MANUAL_RESTRICTION_TYPES.map((typeKey) => (
                      <option key={typeKey} value={typeKey}>
                        {RESTRICTION_TYPE_LABELS[typeKey]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1.5">
                    Mandatory Reason Category <span className="text-[#B91C1C] dark:text-white">*</span>
                  </label>
                  <select
                    required
                    value={reasonCode}
                    onChange={(e) => handleReasonChange(e.target.value as LockReasonCode)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    {LOCK_REASON_LIST.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {reasonCode === 'OTHER' && (
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1.5">
                    Custom Reason Explanation <span className="text-[#B91C1C] dark:text-white">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Provide a clear reason for this restriction"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-[#14284B] dark:text-white">
                    User-Facing Explanation <span className="text-[#B91C1C] dark:text-white">*</span>
                  </label>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    Shown on Portal &amp; Notification
                  </span>
                </div>
                <textarea
                  required
                  rows={3}
                  value={userFacingMessage}
                  onChange={(e) => setUserFacingMessage(e.target.value)}
                  placeholder="Clear, professional message displayed to the affected account explaining why access is restricted and what to do next."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-[#14284B] dark:text-white">
                    Internal Administrative Note (Optional)
                  </label>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    Private — Admins Only
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={internalAdminNote}
                  onChange={(e) => setInternalAdminNote(e.target.value)}
                  placeholder="Private staff context, ticket reference, or investigation detail (visible to authorized platform admins only)."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1.5">
                    Effective Start Date (Immediate if blank)
                  </label>
                  <input
                    type="datetime-local"
                    value={effectiveAt}
                    onChange={(e) => setEffectiveAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1.5">
                    Auto-Expiry / Restoration Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {hasCascadableTargets && (
                <label className="flex items-start gap-2.5 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cascadesToLinkedLearners}
                    onChange={(e) => setCascadesToLinkedLearners(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#B91C1C]"
                  />
                  <span>
                    <strong className="block text-[#14284B] dark:text-white">
                      Cascade Restriction to Linked Dependent Learners
                    </strong>
                    <span className="text-slate-500 dark:text-slate-300 leading-relaxed">
                      When locking a School or Parent account, linked school-funded or parent-funded student portals inherit this restriction automatically with role-appropriate guidance.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div className="px-6 py-4 flex justify-end gap-2 bg-slate-50/70 dark:bg-[#0B1120]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-bold hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loadingPreview}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#14284B] hover:bg-slate-800 dark:bg-white dark:text-[#14284B] dark:hover:bg-slate-100 text-white font-bold cursor-pointer disabled:opacity-60"
              >
                {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                Review Confirmation Preview
                <ArrowRight size={13} />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: SERVER-VALIDATED CONFIRMATION PREVIEW */}
        {step === 'PREVIEW' && preview && (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 overflow-y-auto">
            {preview.errors.length > 0 && (
              <div className="px-6 py-3.5 bg-[#B91C1C] text-white space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Validation Issues Detected
                </p>
                <ul className="list-disc pl-5 space-y-0.5 text-white/95">
                  {preview.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Unified 4-Column Horizontally Divided Preview Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-[#14284B]/50">
              <div className="p-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                  Selected Accounts
                </span>
                <span className="mt-1 block text-lg font-bold text-[#14284B] dark:text-white tabular-nums">
                  {preview.selectedCount}
                </span>
              </div>
              <div className="p-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                  Linked Students
                </span>
                <span className="mt-1 block text-lg font-bold text-[#B91C1C] dark:text-white tabular-nums">
                  {preview.totalLinkedStudentsAffected}
                </span>
              </div>
              <div className="p-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                  Programmes Affected
                </span>
                <span className="mt-1 block text-lg font-bold text-[#14284B] dark:text-white tabular-nums">
                  {preview.totalProgrammesAffected}
                </span>
              </div>
              <div className="p-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                  Cascade Scope
                </span>
                <span className="mt-1 block text-xs font-bold text-[#14284B] dark:text-white">
                  {preview.cascadesToLinkedLearners ? 'Linked Learners' : 'Direct Only'}
                </span>
              </div>
            </div>

            {/* Reason & User Message Preview */}
            <div className="px-6 py-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#14284B] dark:text-white">
                  Reason: {preview.reasonLabel} ({RESTRICTION_TYPE_LABELS[preview.restrictionType]})
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-300 flex items-center gap-1">
                  <Calendar size={12} />
                  Effective: {preview.effectiveAtFormatted || 'Immediately'}
                  {preview.expiresAtFormatted ? ` • Auto-Expires: ${preview.expiresAtFormatted}` : ' • No Auto-Expiry'}
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">
                  Message Affected Users Will See
                </span>
                {preview.userFacingMessage}
              </p>
            </div>

            {/* Per-Account Impact List */}
            <div>
              <div className="px-6 py-2.5 bg-slate-50 dark:bg-[#14284B]/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-[#14284B] dark:text-white flex items-center gap-1.5">
                  <Users size={13} /> Affected Accounts Breakdown ({preview.items.length})
                </span>
                {preview.invalidCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-[#B91C1C] text-white text-[10px] font-bold">
                    {preview.invalidCount} Failed Validation
                  </span>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                {preview.items.map((item) => (
                  <div key={item.targetKey} className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-[#14284B] dark:text-white truncate">
                        {item.accountName}{' '}
                        <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-300 ml-1">
                          {item.accountType.replace(/_/g, ' ')}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-300">
                        {item.linkedStudentCount > 0
                          ? `${item.linkedStudentCount} linked learner(s)${
                              item.linkedStudentSampleNames.length > 0
                                ? ` (${item.linkedStudentSampleNames.slice(0, 3).join(', ')}${
                                    item.linkedStudentCount > 3 ? '...' : ''
                                  })`
                                : ''
                            }`
                          : 'Direct account scope'}
                        {item.affectedProgrammeNames.length > 0
                          ? ` • ${item.affectedProgrammeNames.slice(0, 2).join(', ')}`
                          : ''}
                      </p>
                      {!item.valid && item.validationError && (
                        <p className="text-[11px] font-bold text-[#B91C1C] dark:text-white mt-0.5">
                          {item.validationError}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        item.valid
                          ? 'bg-slate-100 text-[#14284B] border border-slate-300 dark:bg-white/15 dark:text-white dark:border-white/20'
                          : 'bg-[#B91C1C] text-white'
                      }`}
                    >
                      {item.valid ? 'Ready' : 'Invalid'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Final Explicit Confirmation */}
            <div className="px-6 py-4 bg-slate-50/70 dark:bg-[#14284B]/50">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedCheck}
                  onChange={(e) => setConfirmedCheck(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#B91C1C]"
                />
                <span className="text-[#14284B] dark:text-white leading-relaxed">
                  <strong>I confirm</strong> applying this restriction strictly to the{' '}
                  <strong>{preview.validCount}</strong> validated account(s) listed above (impacting{' '}
                  <strong>{preview.totalLinkedStudentsAffected}</strong> linked learner(s)) and dispatching notifications using the user-facing message shown.
                </span>
              </label>
            </div>

            <div className="px-6 py-4 flex justify-between items-center gap-2 bg-white dark:bg-[#0B1120]">
              <button
                type="button"
                onClick={() => setStep('CONFIGURE')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-bold hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
              >
                <ArrowLeft size={13} /> Back to Edit
              </button>
              <button
                type="button"
                disabled={submitting || !confirmedCheck || preview.validCount === 0 || preview.errors.length > 0}
                onClick={() => void handleConfirmApply()}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                Confirm &amp; Apply Restriction{preview.validCount > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PARTIAL FAILURE REPORT (if any target failed) */}
        {step === 'RESULT' && executionResult && (
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="rounded-lg bg-[#14284B] text-white p-4">
              <p className="font-bold">
                Partial Completion: {executionResult.appliedCount} applied, {executionResult.failedCount} failed.
              </p>
            </div>
            {executionResult.failed.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-800">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#14284B]">
                  <p className="font-bold text-[#B91C1C] dark:text-white">Failed Accounts</p>
                </div>
                {executionResult.failed.map((f, idx) => (
                  <div key={idx} className="px-4 py-3">
                    <p className="font-bold text-[#14284B] dark:text-white">{f.accountName}</p>
                    <p className="text-slate-600 dark:text-slate-200 mt-0.5">{f.error}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-[#14284B] dark:bg-white dark:text-[#14284B] text-white font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface UnlockRestrictionsModalProps {
  open: boolean;
  target: RestrictionModalTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const UnlockRestrictionsModal: React.FC<UnlockRestrictionsModalProps> = ({
  open,
  target,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [unlockReason, setUnlockReason] = useState('');
  const [mode, setMode] = useState<'LIFT_ONLY' | 'OPEN' | 'AUTO'>('LIFT_ONLY');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [fetchedRestrictions, setFetchedRestrictions] = useState<AccountRestrictionRecord[] | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    setUnlockReason('');
    setMode('LIFT_ONLY');
    setSubmittingId(null);
    setFetchedRestrictions(null);

    if (target.activeRestrictions === undefined) {
      void billingPost<{ restrictions?: AccountRestrictionRecord[] }>('billing-admin', {
        action: 'list_restriction_history',
        targetAccountId: target.accountId,
      })
        .then((res) => {
          const active = (res.restrictions || []).filter(
            (r) => r.status === 'ACTIVE' || r.status === 'SCHEDULED'
          );
          setFetchedRestrictions(active);
        })
        .catch(() => {
          setFetchedRestrictions([]);
        });
    }
  }, [open, target?.subscriptionId, target?.accountId]);

  if (!open || !target) return null;

  const activeRestrictions = target.activeRestrictions ?? fetchedRestrictions ?? [];
  const manualRestrictions = activeRestrictions.filter(
    (r) => r.restrictionType !== 'AUTOMATED_PAYMENT_LOCKDOWN'
  );
  const hasUnpaidBalance = Number(target.liveAmountDue || 0) > 0;

  const handleLiftSpecific = async (restrictionId: string) => {
    if (unlockReason.trim().length < 3) {
      toast.error('Please enter a mandatory unlock reason before lifting this restriction.');
      return;
    }
    setSubmittingId(restrictionId);
    try {
      const res = await billingPost<any>('billing-admin', {
        action: 'lift_restriction',
        restrictionId,
        subscriptionId: target.subscriptionId || null,
        accountType: target.accountType,
        accountId: target.accountId,
        schoolId: target.schoolId || null,
        parentId: target.parentId || null,
        studentId: target.studentId || null,
        programmeEnrollmentId: target.programmeEnrollmentId || null,
        unlockReason: unlockReason.trim(),
        mode: 'LIFT_ONLY',
      });
      const remainingCount = Array.isArray(res.remainingActiveRestrictions)
        ? res.remainingActiveRestrictions.length
        : 0;
      toast.success(
        remainingCount > 0
          ? `Restriction lifted. Note: ${remainingCount} other restriction(s) remain active on this account.`
          : 'Restriction lifted and logged to immutable audit history.'
      );
      onSuccess();
      if (remainingCount === 0) onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to lift restriction.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleUnlockAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockReason.trim().length < 3) {
      toast.error('An unlock reason is required before restoring account access.');
      return;
    }
    setSubmittingId('ALL');
    try {
      const res = await billingPost<any>('billing-admin', {
        action: 'manual_unlock_account',
        subscriptionId: target.subscriptionId || null,
        accountType: target.accountType,
        accountId: target.accountId,
        schoolId: target.schoolId || null,
        parentId: target.parentId || null,
        studentId: target.studentId || null,
        programmeEnrollmentId: target.programmeEnrollmentId || null,
        unlockReason: unlockReason.trim(),
        mode,
      });
      const remainingCount = Array.isArray(res.remainingActiveRestrictions)
        ? res.remainingActiveRestrictions.length
        : 0;
      toast.success(
        remainingCount > 0
          ? `Manual restriction(s) lifted. ${remainingCount} payment restriction(s) still active — unpaid balances are never cleared by manual unlock.`
          : 'Account restrictions updated and recorded in audit history.'
      );
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to unlock account.');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col text-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#14284B]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-[#14284B] dark:bg-white/15 text-white flex items-center justify-center shrink-0">
              <Unlock size={16} />
            </span>
            <h3 className="text-sm font-bold text-[#14284B] dark:text-white truncate">
              Manage &amp; Lift Restrictions — {target.accountName || target.accountId}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-500 dark:text-white cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleUnlockAccount} className="divide-y divide-slate-200 dark:divide-slate-800 overflow-y-auto">
          {hasUnpaidBalance && (
            <div className="px-6 py-3.5 bg-[#14284B]/[0.06] dark:bg-[#14284B] text-[#14284B] dark:text-white leading-relaxed">
              <strong>Financial Integrity Notice:</strong> This account has an outstanding balance of{' '}
              <strong className="tabular-nums">₦{Number(target.liveAmountDue || 0).toLocaleString()}</strong>. Lifting a manual restriction does{' '}
              <strong>not</strong> mark unpaid invoices as paid or erase payment history.
            </div>
          )}

          {/* Mandatory Unlock Reason */}
          <div className="px-6 py-4 space-y-2.5">
            <label className="block font-bold text-[#14284B] dark:text-white">
              Mandatory Unlock Reason <span className="text-[#B91C1C] dark:text-white">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {UNLOCK_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setUnlockReason(preset)}
                  className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer ${
                    unlockReason === preset
                      ? 'bg-[#14284B] text-white border-[#14284B] dark:bg-white dark:text-[#14284B] dark:border-white'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              required
              rows={2}
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Explain why this restriction is being lifted (logged to immutable audit history)..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          {/* Currently Active Restrictions List — single hairline-divided section */}
          {activeRestrictions.length > 0 && (
            <div>
              <div className="px-6 py-2.5 bg-slate-50 dark:bg-[#14284B]/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-[#B91C1C] dark:text-white" />
                <p className="font-bold text-[#14284B] dark:text-white">
                  Active Restrictions on This Account ({activeRestrictions.length})
                </p>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                {activeRestrictions.map((r) => {
                  const isAutoPay = r.restrictionType === 'AUTOMATED_PAYMENT_LOCKDOWN';
                  return (
                    <div key={r.restrictionId} className="px-6 py-3.5 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[#14284B] dark:text-white">{r.reasonCode}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#B91C1C] text-white">
                            {RESTRICTION_TYPE_LABELS[r.restrictionType] || r.restrictionType}
                          </span>
                        </div>
                        {!isAutoPay && (
                          <button
                            type="button"
                            disabled={submittingId !== null || unlockReason.trim().length < 3}
                            onClick={() => void handleLiftSpecific(r.restrictionId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#14284B] hover:bg-slate-800 dark:bg-white dark:text-[#14284B] text-white text-[11px] font-bold cursor-pointer disabled:opacity-40"
                          >
                            {submittingId === r.restrictionId ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={11} />
                            )}
                            Lift This Restriction
                          </button>
                        )}
                      </div>
                      <p className="text-slate-600 dark:text-slate-200">
                        <strong className="text-[#14284B] dark:text-white">User Message:</strong> {r.userFacingMessage}
                      </p>
                      {r.internalAdminNote && (
                        <p className="text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10 px-2.5 py-1.5 rounded-md">
                          <strong>Internal Note (Private):</strong> {r.internalAdminNote}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Applied by {r.appliedByName} on {String(r.appliedAt || '').slice(0, 16).replace('T', ' ')}
                        {r.expiresAt ? ` • Expires ${String(r.expiresAt).slice(0, 16).replace('T', ' ')}` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unlock Mode Choice — single unified bordered radio group */}
          <div className="px-6 py-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              <label className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                <input
                  type="radio"
                  name="unlockMode"
                  checked={mode === 'LIFT_ONLY' || mode === 'AUTO'}
                  onChange={() => setMode('AUTO')}
                  className="mt-0.5 accent-[#14284B]"
                />
                <span>
                  <strong className="block text-[#14284B] dark:text-white">
                    Lift Manual Restriction(s) &amp; Keep Automatic Billing Rules (Recommended)
                  </strong>
                  <span className="text-slate-500 dark:text-slate-300">
                    Lifts manual administrative locks while keeping unpaid billing balance enforcement intact.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                <input
                  type="radio"
                  name="unlockMode"
                  checked={mode === 'OPEN'}
                  onChange={() => setMode('OPEN')}
                  className="mt-0.5 accent-[#14284B]"
                />
                <span>
                  <strong className="block text-[#14284B] dark:text-white">
                    Lift Manual Restriction(s) &amp; Temporarily Open Portal Access
                  </strong>
                  <span className="text-slate-500 dark:text-slate-300">
                    Reopens portal access immediately without clearing any unpaid financial balance (balance remains owed).
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="px-6 py-4 flex justify-end gap-2 bg-slate-50/70 dark:bg-[#0B1120]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-bold hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingId !== null || unlockReason.trim().length < 3}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#14284B] hover:bg-slate-800 dark:bg-white dark:text-[#14284B] dark:hover:bg-slate-100 text-white font-bold cursor-pointer disabled:opacity-40"
            >
              {submittingId === 'ALL' ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
              {manualRestrictions.length > 1
                ? `Lift All Manual Restrictions (${manualRestrictions.length})`
                : mode === 'OPEN'
                ? 'Confirm Lift & Open Portal'
                : 'Confirm Lift Restriction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
