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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950/60 text-[#B91C1C] dark:text-red-400 flex items-center justify-center shrink-0">
              <Lock size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-[#14284B] dark:text-white truncate">
                {targets.length === 1
                  ? `Apply Restriction — ${targets[0].accountName || targets[0].accountId}`
                  : `Bulk Account Restriction (${targets.length} Selected)`}
              </h3>
              <p className="text-[11px] text-slate-500">
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
            className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* STEP 1: CONFIGURE */}
        {step === 'CONFIGURE' && (
          <form onSubmit={handleRequestPreview} className="p-5 space-y-4 overflow-y-auto">
            {/* Selected summary pills */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
              <p className="font-bold text-[#14284B] dark:text-white mb-1.5">
                Selected Targets ({targets.length})
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {targets.map((t, idx) => (
                  <span
                    key={`${t.accountType}-${t.accountId}-${idx}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <span className="text-[10px] font-black text-[#B91C1C] uppercase">
                      {t.accountType.replace(/_/g, ' ')}
                    </span>
                    <span>• {t.accountName || t.accountId}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Restriction Action / Type <span className="text-[#B91C1C]">*</span>
                </label>
                <select
                  value={restrictionType}
                  onChange={(e) => setRestrictionType(e.target.value as RestrictionType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {MANUAL_RESTRICTION_TYPES.map((typeKey) => (
                    <option key={typeKey} value={typeKey}>
                      {RESTRICTION_TYPE_LABELS[typeKey]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mandatory Reason Category <span className="text-[#B91C1C]">*</span>
                </label>
                <select
                  required
                  value={reasonCode}
                  onChange={(e) => handleReasonChange(e.target.value as LockReasonCode)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Custom Reason Explanation <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Provide a clear reason for this restriction"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  User-Facing Explanation <span className="text-[#B91C1C]">*</span>
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  Shown on Portal &amp; Notification
                </span>
              </div>
              <textarea
                required
                rows={3}
                value={userFacingMessage}
                onChange={(e) => setUserFacingMessage(e.target.value)}
                placeholder="Clear, professional message displayed to the affected account explaining why access is restricted and what to do next."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Internal Administrative Note (Optional)
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Private — Never Shown to Users
                </span>
              </div>
              <textarea
                rows={2}
                value={internalAdminNote}
                onChange={(e) => setInternalAdminNote(e.target.value)}
                placeholder="Private staff context, ticket reference, or investigation detail (visible to authorized platform admins only)."
                className="w-full px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Effective Start Date (Optional — Immediate if blank)
                </label>
                <input
                  type="datetime-local"
                  value={effectiveAt}
                  onChange={(e) => setEffectiveAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Auto-Expiry / Restoration Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {hasCascadableTargets && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cascadesToLinkedLearners}
                  onChange={(e) => setCascadesToLinkedLearners(e.target.checked)}
                  className="mt-0.5 accent-[#B91C1C]"
                />
                <span>
                  <strong className="block text-slate-900 dark:text-white">
                    Cascade Restriction to Linked Dependent Learners
                  </strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    When locking a School or Parent account, linked school-funded or parent-funded student portals inherit this restriction automatically (with role-appropriate guidance and zero exposure of private notes).
                  </span>
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loadingPreview}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#14284B] hover:bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-60"
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
          <div className="p-5 space-y-4 overflow-y-auto">
            {preview.errors.length > 0 && (
              <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-red-900 dark:text-red-200 space-y-1">
                <p className="font-black flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Validation Issues Detected
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Selected Accounts</span>
                <span className="text-lg font-black text-[#14284B] dark:text-white">{preview.selectedCount}</span>
              </div>
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">Linked Students</span>
                <span className="text-lg font-black text-[#B91C1C] dark:text-red-400">{preview.totalLinkedStudentsAffected}</span>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Programmes Affected</span>
                <span className="text-lg font-black text-[#14284B] dark:text-white">{preview.totalProgrammesAffected}</span>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Cascades to Students</span>
                <span className="text-sm font-black text-[#14284B] dark:text-white mt-1 block">
                  {preview.cascadesToLinkedLearners ? 'Yes (Linked Learners)' : 'No (Direct Only)'}
                </span>
              </div>
            </div>

            {/* Reason & User Message Preview */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 bg-white dark:bg-slate-950/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-[#14284B] dark:text-white">
                  Reason: {preview.reasonLabel} ({RESTRICTION_TYPE_LABELS[preview.restrictionType]})
                </span>
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <Calendar size={12} />
                  Effective: {preview.effectiveAtFormatted || 'Immediately'}
                  {preview.expiresAtFormatted ? ` • Auto-Expires: ${preview.expiresAtFormatted}` : ' • No Auto-Expiry'}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-2.5 text-slate-700 dark:text-slate-200">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  Message Affected Users Will See
                </span>
                {preview.userFacingMessage}
              </div>
            </div>

            {/* Per-Account Impact Table */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-extrabold text-[#14284B] dark:text-white flex items-center gap-1.5">
                  <Users size={13} /> Affected Accounts Breakdown ({preview.items.length})
                </span>
                {preview.invalidCount > 0 && (
                  <span className="text-[11px] font-bold text-[#B91C1C]">
                    {preview.invalidCount} Failed Validation
                  </span>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {preview.items.map((item) => (
                  <div key={item.targetKey} className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-[#14284B] dark:text-white truncate">
                        {item.accountName}{' '}
                        <span className="text-[10px] font-black uppercase text-slate-400 ml-1">
                          {item.accountType.replace(/_/g, ' ')}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
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
                        <p className="text-[11px] font-bold text-[#B91C1C] mt-0.5">{item.validationError}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        item.valid
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {item.valid ? 'Ready' : 'Invalid'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Final Explicit Confirmation Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedCheck}
                onChange={(e) => setConfirmedCheck(e.target.checked)}
                className="mt-0.5 accent-[#B91C1C]"
              />
              <span className="text-red-950 dark:text-red-200">
                <strong>I confirm</strong> applying this restriction strictly to the{' '}
                <strong>{preview.validCount}</strong> validated account(s) listed above (impacting{' '}
                <strong>{preview.totalLinkedStudentsAffected}</strong> linked learner(s)) and dispatching notifications using the user-facing message shown.
              </span>
            </label>

            <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep('CONFIGURE')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
              >
                <ArrowLeft size={13} /> Back to Edit
              </button>
              <button
                type="button"
                disabled={submitting || !confirmedCheck || preview.validCount === 0 || preview.errors.length > 0}
                onClick={() => void handleConfirmApply()}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white font-black uppercase tracking-wider cursor-pointer disabled:opacity-40"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                Confirm &amp; Apply Restriction{preview.validCount > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PARTIAL FAILURE REPORT (if any target failed) */}
        {step === 'RESULT' && executionResult && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-amber-950 dark:text-amber-200">
              <p className="font-black">
                Partial Completion: {executionResult.appliedCount} applied, {executionResult.failedCount} failed.
              </p>
            </div>
            {executionResult.failed.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-extrabold text-[#B91C1C]">Failed Accounts</p>
                {executionResult.failed.map((f, idx) => (
                  <div key={idx} className="rounded-lg border border-red-200 bg-red-50/60 p-2.5">
                    <p className="font-bold text-red-900">{f.accountName}</p>
                    <p className="text-red-700">{f.error}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-[#14284B] text-white font-bold cursor-pointer"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col text-xs">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Unlock size={17} className="text-emerald-600" />
            <h3 className="text-sm font-black text-[#14284B] dark:text-white">
              Manage &amp; Lift Restrictions — {target.accountName || target.accountId}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleUnlockAccount} className="p-5 space-y-4 overflow-y-auto">
          {hasUnpaidBalance && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-amber-950 dark:text-amber-200 leading-relaxed">
              <strong>Financial Integrity Notice:</strong> This account has an outstanding balance of{' '}
              <strong>₦{Number(target.liveAmountDue || 0).toLocaleString()}</strong>. Lifting a manual restriction does{' '}
              <strong>not</strong> mark unpaid invoices as paid or erase payment history.
            </div>
          )}

          {/* Mandatory Unlock Reason */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Mandatory Unlock Reason <span className="text-[#B91C1C]">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {UNLOCK_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setUnlockReason(preset)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                    unlockReason === preset
                      ? 'bg-[#14284B] text-white border-[#14284B]'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
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
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Currently Active Restrictions List (with selective per-restriction Lift button) */}
          {activeRestrictions.length > 0 && (
            <div className="space-y-2">
              <p className="font-extrabold text-[#14284B] dark:text-white flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-[#B91C1C]" />
                Active Restrictions on This Account ({activeRestrictions.length})
              </p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {activeRestrictions.map((r) => {
                  const isAutoPay = r.restrictionType === 'AUTOMATED_PAYMENT_LOCKDOWN';
                  return (
                    <div
                      key={r.restrictionId}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/40 p-3 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-black text-[#14284B] dark:text-white">{r.reasonCode}</span>
                          <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/60 text-[#B91C1C] dark:text-red-300">
                            {RESTRICTION_TYPE_LABELS[r.restrictionType] || r.restrictionType}
                          </span>
                        </div>
                        {!isAutoPay && (
                          <button
                            type="button"
                            disabled={submittingId !== null || unlockReason.trim().length < 3}
                            onClick={() => void handleLiftSpecific(r.restrictionId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-40"
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
                      <p className="text-slate-600 dark:text-slate-300">
                        <strong>User Message:</strong> {r.userFacingMessage}
                      </p>
                      {r.internalAdminNote && (
                        <p className="text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-md">
                          <strong>Internal Admin Note (Private):</strong> {r.internalAdminNote}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400">
                        Applied by {r.appliedByName} on {String(r.appliedAt || '').slice(0, 16).replace('T', ' ')}
                        {r.expiresAt ? ` • Expires ${String(r.expiresAt).slice(0, 16).replace('T', ' ')}` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unlock Mode Choice */}
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="radio"
                name="unlockMode"
                checked={mode === 'LIFT_ONLY' || mode === 'AUTO'}
                onChange={() => setMode('AUTO')}
                className="mt-0.5 accent-[#14284B]"
              />
              <span>
                <strong className="block text-slate-900 dark:text-white">
                  Lift Manual Restriction(s) &amp; Keep Automatic Billing Rules (Recommended)
                </strong>
                <span className="text-slate-500">
                  Lifts manual administrative locks while keeping unpaid billing balance enforcement intact.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="radio"
                name="unlockMode"
                checked={mode === 'OPEN'}
                onChange={() => setMode('OPEN')}
                className="mt-0.5 accent-emerald-600"
              />
              <span>
                <strong className="block text-slate-900 dark:text-white">
                  Lift Manual Restriction(s) &amp; Temporarily Open Portal Access
                </strong>
                <span className="text-slate-500">
                  Reopens portal access immediately without clearing any unpaid financial balance (balance remains owed).
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingId !== null || unlockReason.trim().length < 3}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-40"
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
