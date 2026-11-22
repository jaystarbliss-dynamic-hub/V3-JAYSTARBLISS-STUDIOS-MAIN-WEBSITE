import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  FileCheck2,
  History,
  Loader2,
  Lock,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { billingPost, formatNaira } from '../../lib/billing';
import { useToast } from '../../contexts/ToastContext';
import { RESET_CONFIRMATION_PHRASE } from '../../../api/_lib/financial-reset-core';
import {
  RESTRICTION_TYPE_LABELS,
  type AccountRestrictionRecord,
} from '../../../api/_lib/restriction-core';
import {
  ApplyRestrictionModal,
  UnlockRestrictionsModal,
  type RestrictionModalTarget,
} from './AdminRestrictionModals';

interface AdminSubscriptionGuardrailsPanelProps {
  onBack: () => void;
  onRefreshParent?: () => void;
}

type SubTab = 'subscriptions' | 'restrictions' | 'reminders' | 'audit' | 'reset';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-slate-100 text-[#14284B] border-slate-300 dark:bg-white/15 dark:text-white dark:border-white/25',
  DUE_SOON: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-slate-600',
  GRACE_PERIOD: 'bg-[#14284B]/10 text-[#14284B] border-[#14284B]/25 dark:bg-white/15 dark:text-white dark:border-white/25',
  LOCKED: 'bg-[#B91C1C] text-white border-[#B91C1C]',
  PARTIALLY_PAID: 'bg-slate-100 text-[#14284B] border-slate-300 dark:bg-white/10 dark:text-white dark:border-slate-600',
  EXEMPT: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  SUSPENDED: 'bg-[#991B1B] text-white border-[#991B1B]',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const ACCOUNT_TYPE_SEGMENTS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'SCHOOL', label: 'Schools' },
  { value: 'SCHOOL_ADMIN', label: 'School Admins' },
  { value: 'PARENT', label: 'Parents' },
  { value: 'PARENT_CHILD', label: 'Children' },
  { value: 'INDIVIDUAL_STUDENT', label: 'Students' },
  { value: 'STUDENT_SELF_FUNDED_PROGRAMME', label: 'Programmes' },
];

export const AdminSubscriptionGuardrailsPanel: React.FC<AdminSubscriptionGuardrailsPanelProps> = ({
  onBack,
  onRefreshParent,
}) => {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>('subscriptions');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [restrictions, setRestrictions] = useState<AccountRestrictionRecord[]>([]);
  const [restrictionAuditLogs, setRestrictionAuditLogs] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual Payment Modal State
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    targetType: 'SCHOOL' as 'SCHOOL' | 'PARENT' | 'INDIVIDUAL_STUDENT' | 'PROGRAMME_ENROLLMENT',
    targetId: '',
    childId: '',
    childName: '',
    accountName: '',
    planName: '',
    amount: '',
    contractAmount: '',
    paymentMethod: 'bank_transfer',
    paymentDate: new Date().toISOString().slice(0, 10),
    reference: '',
    durationWeeks: '4',
    notes: '',
    proofUrl: '',
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  // Override / Exemption Modal State
  const [overrideTarget, setOverrideTarget] = useState<any | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideExpiresAt, setOverrideExpiresAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const [exemptTarget, setExemptTarget] = useState<any | null>(null);
  const [exemptReason, setExemptReason] = useState('');
  const [submittingExempt, setSubmittingExempt] = useState(false);

  // Bulk & Individual Restriction Modal State
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());
  const [applyRestrictionTargets, setApplyRestrictionTargets] = useState<RestrictionModalTarget[] | null>(null);
  const [unlockRestrictionTarget, setUnlockRestrictionTarget] = useState<RestrictionModalTarget | null>(null);

  // Controlled Test Financial Data Reset State (Superadmin only)
  const [resetLoading, setResetLoading] = useState(false);
  const [dryRunInventory, setDryRunInventory] = useState<any | null>(null);
  const [resetLogs, setResetLogs] = useState<any[]>([]);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [executingReset, setExecutingReset] = useState(false);
  const [resetResult, setResetResult] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await billingPost<any>('billing-admin', { action: 'list_subscriptions' });
      setSummary(data.summary || null);
      setSubscriptions(Array.isArray(data.subscriptions) ? data.subscriptions : []);
      setRestrictions(Array.isArray(data.restrictions) ? data.restrictions : []);
      setRestrictionAuditLogs(Array.isArray(data.restrictionAuditLogs) ? data.restrictionAuditLogs : []);
      setReminders(Array.isArray(data.reminders) ? data.reminders : []);
      setAuditLogs(Array.isArray(data.auditLogs) ? data.auditLogs : []);
      setIsSuperAdmin(Boolean(data.isSuperAdmin));
      setSelectedSubIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Unable to load subscription guardrails.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredSubscriptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subscriptions.filter((sub) => {
      if (statusFilter !== 'ALL' && sub.liveStatus !== statusFilter) return false;
      if (typeFilter !== 'ALL' && sub.accountType !== typeFilter) return false;
      if (!q) return true;
      return [
        sub.accountName,
        sub.studentName,
        sub.planName,
        sub.programmeName,
        sub.recipientEmail,
        sub.id,
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [subscriptions, statusFilter, typeFilter, searchQuery]);

  const openManualModalForSub = (sub?: any) => {
    if (!sub) {
      setManualForm({
        targetType: 'SCHOOL',
        targetId: '',
        childId: '',
        childName: '',
        accountName: '',
        planName: '',
        amount: '',
        contractAmount: '',
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString().slice(0, 10),
        reference: `MAN-${Date.now()}`,
        durationWeeks: '4',
        notes: '',
        proofUrl: '',
      });
      setManualModalOpen(true);
      return;
    }

    const mappedType: 'SCHOOL' | 'PARENT' | 'INDIVIDUAL_STUDENT' | 'PROGRAMME_ENROLLMENT' =
      sub.accountType === 'SCHOOL'
        ? 'SCHOOL'
        : sub.accountType === 'STUDENT_SELF_FUNDED_PROGRAMME'
        ? 'PROGRAMME_ENROLLMENT'
        : sub.accountType === 'PARENT' || sub.accountType === 'PARENT_CHILD'
        ? 'PARENT'
        : 'INDIVIDUAL_STUDENT';

    const resolvedTargetId =
      mappedType === 'SCHOOL'
        ? sub.schoolId || sub.accountId
        : mappedType === 'PROGRAMME_ENROLLMENT'
        ? sub.programmeEnrollmentId || sub.accountId
        : mappedType === 'PARENT'
        ? sub.parentId || sub.accountId
        : sub.accountId;

    setManualForm({
      targetType: mappedType,
      targetId: String(resolvedTargetId || ''),
      childId: sub.accountType === 'PARENT_CHILD' ? String(sub.studentId || sub.accountId || '') : '',
      childName: String(sub.studentName || ''),
      accountName: String(sub.accountName || ''),
      planName: String(sub.programmeName || sub.planName || ''),
      amount: String(sub.liveAmountDue > 0 ? sub.liveAmountDue : sub.amount || ''),
      contractAmount: String(sub.amount || ''),
      paymentMethod: 'bank_transfer',
      paymentDate: new Date().toISOString().slice(0, 10),
      reference: `MAN-${Date.now()}`,
      durationWeeks: String(sub.durationWeeks || (mappedType === 'SCHOOL' ? 12 : 4)),
      notes: '',
      proofUrl: '',
    });
    setManualModalOpen(true);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingManual(true);
    try {
      const res = await billingPost<any>('billing-admin', {
        action: 'record_manual_payment',
        targetType: manualForm.targetType,
        targetId: manualForm.targetId.trim(),
        childId: manualForm.childId.trim() || undefined,
        childName: manualForm.childName.trim() || undefined,
        accountName: manualForm.accountName.trim() || undefined,
        planName: manualForm.planName.trim() || undefined,
        amount: Number(manualForm.amount),
        contractAmount: manualForm.contractAmount ? Number(manualForm.contractAmount) : undefined,
        paymentMethod: manualForm.paymentMethod,
        paymentDate: manualForm.paymentDate,
        reference: manualForm.reference.trim(),
        durationWeeks: Number(manualForm.durationWeeks || 4),
        notes: manualForm.notes.trim(),
        proofUrl: manualForm.proofUrl.trim() || undefined,
      });
      toast.success(
        `Manual payment recorded (${res.reference}). ${
          res.accessUnlocked
            ? 'Subscription restored and unlocked.'
            : `Partial payment saved. Remaining balance: ${formatNaira(res.remainingBalance || 0)}.`
        }`
      );
      setManualModalOpen(false);
      await loadData();
      onRefreshParent?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record manual payment.');
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget) return;
    setSubmittingOverride(true);
    try {
      await billingPost('billing-admin', {
        action: 'apply_subscription_override',
        subscriptionId: overrideTarget.id,
        accountType: overrideTarget.accountType,
        accountId: overrideTarget.accountId,
        accountName: overrideTarget.accountName,
        billingResponsibility: overrideTarget.billingResponsibility,
        active: true,
        reason: overrideReason.trim(),
        startsAt: new Date().toISOString(),
        expiresAt: new Date(overrideExpiresAt).toISOString(),
      });
      toast.success('Temporary access override applied and logged.');
      setOverrideTarget(null);
      setOverrideReason('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to apply override.');
    } finally {
      setSubmittingOverride(false);
    }
  };

  const handleRevokeOverride = async (sub: any) => {
    try {
      await billingPost('billing-admin', {
        action: 'apply_subscription_override',
        subscriptionId: sub.id,
        active: false,
        reason: 'Manual revoke by administrator',
      });
      toast.success('Temporary override revoked.');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to revoke override.');
    }
  };

  const handleSaveExemption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exemptTarget) return;
    setSubmittingExempt(true);
    try {
      const nextExempt = !exemptTarget.isExempt;
      await billingPost('billing-admin', {
        action: 'set_subscription_exemption',
        subscriptionId: exemptTarget.id,
        accountType: exemptTarget.accountType,
        accountId: exemptTarget.accountId,
        accountName: exemptTarget.accountName,
        billingResponsibility: exemptTarget.billingResponsibility,
        exempt: nextExempt,
        reason: exemptReason.trim() || (nextExempt ? 'Approved scholarship/exemption' : 'Exemption lifted'),
      });
      toast.success(nextExempt ? 'Subscription marked exempt.' : 'Subscription exemption removed.');
      setExemptTarget(null);
      setExemptReason('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update exemption.');
    } finally {
      setSubmittingExempt(false);
    }
  };

  const toRestrictionTarget = (sub: any): RestrictionModalTarget => ({
    subscriptionId: sub.id,
    accountType: sub.accountType,
    accountId: sub.accountId,
    accountName: sub.accountName || sub.studentName || sub.id,
    schoolId: sub.schoolId || null,
    parentId: sub.parentId || null,
    studentId: sub.studentId || null,
    programmeEnrollmentId: sub.programmeEnrollmentId || null,
    liveStatus: sub.liveStatus,
    liveAmountDue: sub.liveAmountDue ?? sub.remainingBalance ?? 0,
    isManuallyLocked: Boolean(sub.isManuallyLocked),
    hasPaymentRestriction: Boolean(sub.hasPaymentRestriction),
    activeRestrictions: Array.isArray(sub.activeRestrictions) ? sub.activeRestrictions : [],
  });

  const toggleSelectSub = (subId: string) => {
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const allFilteredSelected =
    filteredSubscriptions.length > 0 &&
    filteredSubscriptions.every((sub) => selectedSubIds.has(sub.id));

  const toggleSelectAllFiltered = () => {
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredSubscriptions.forEach((sub) => next.delete(sub.id));
      } else {
        filteredSubscriptions.forEach((sub) => next.add(sub.id));
      }
      return next;
    });
  };

  const selectUnlockedFiltered = () => {
    const next = new Set<string>();
    filteredSubscriptions
      .filter((sub) => !sub.isLocked)
      .forEach((sub) => next.add(sub.id));
    setSelectedSubIds(next);
  };

  const selectedSubscriptionTargets = useMemo(
    () =>
      subscriptions
        .filter((sub) => selectedSubIds.has(sub.id))
        .map((sub) => toRestrictionTarget(sub)),
    [subscriptions, selectedSubIds]
  );

  const handleRunDryRun = async () => {
    setResetLoading(true);
    setResetResult(null);
    try {
      const [dryRes, logsRes] = await Promise.all([
        billingPost<any>('admin-financial-reset', { action: 'dry_run' }),
        billingPost<any>('admin-financial-reset', { action: 'list_audit_logs' }).catch(() => ({ logs: [] })),
      ]);
      setDryRunInventory(dryRes.inventory || null);
      setResetLogs(Array.isArray(logsRes.logs) ? logsRes.logs : []);
      toast.success('Stage A Dry Run completed — zero records were modified.');
    } catch (err: any) {
      toast.error(err?.message || 'Unable to run financial dry run.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleExecuteReset = async () => {
    if (!dryRunInventory?.previewSignature) {
      toast.error('Run Stage A Dry Run first.');
      return;
    }
    setExecutingReset(true);
    try {
      const res = await billingPost<any>('admin-financial-reset', {
        action: 'execute',
        confirmationPhrase,
        previewSignature: dryRunInventory.previewSignature,
      });
      setResetResult(res);
      setConfirmationPhrase('');
      toast.success(`Controlled reset completed (Operation ${res.operationId}). Backup saved.`);
      await handleRunDryRun();
      await loadData();
      onRefreshParent?.();
    } catch (err: any) {
      toast.error(err?.message || 'Reset execution blocked or failed.');
    } finally {
      setExecutingReset(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Row — clean flat section bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-white/10 text-[#14284B] dark:text-white cursor-pointer"
            aria-label="Back to Billing Hub"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#B91C1C] dark:text-slate-300">
              Portal Restrictions &amp; Subscription Guardrails
            </p>
            <h2 className="text-xl font-bold text-[#14284B] dark:text-white tracking-tight">
              Account Access Control, Grace Policy &amp; Manual Settlements
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
              All due dates and lockdown schedules operate in Africa/Lagos (WAT).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openManualModalForSub()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer transition-colors"
          >
            <PlusCircle size={15} /> Record Manual Payment
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-semibold text-[#14284B] dark:text-white cursor-pointer transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Unified Horizontal 5-Metric Summary Bar (replaces 5 separate boxes) */}
      {summary && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0F172A] grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
          <div className="px-5 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
              Active
            </span>
            <p className="mt-1 text-2xl font-bold text-[#14284B] dark:text-white tabular-nums">
              {summary.active}
            </p>
          </div>
          <div className="px-5 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
              Due in 7 Days
            </span>
            <p className="mt-1 text-2xl font-bold text-[#14284B] dark:text-white tabular-nums">
              {summary.dueSoon}
            </p>
          </div>
          <div className="px-5 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
              7-Day Grace
            </span>
            <p className="mt-1 text-2xl font-bold text-[#14284B] dark:text-white tabular-nums">
              {summary.inGracePeriod}
            </p>
          </div>
          <div className="px-5 py-4 bg-[#B91C1C]/[0.04] dark:bg-[#14284B]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#B91C1C] dark:text-white">
                Locked Portals
              </span>
              {Number(summary.locked || 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[#B91C1C] text-white text-[10px] font-bold uppercase">
                  Active
                </span>
              )}
            </div>
            <p className="mt-1 text-2xl font-bold text-[#B91C1C] dark:text-white tabular-nums">
              {summary.locked}
            </p>
          </div>
          <div className="px-5 py-4 col-span-2 lg:col-span-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
              Overdue Balance
            </span>
            <p className="mt-1 text-xl font-bold text-[#14284B] dark:text-white tabular-nums">
              {formatNaira(summary.totalOverdueBalance || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Single-Surface Workspace Container (Tabs + Grouped Filters + Bulk Bar + Table) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0F172A] overflow-hidden">
        {/* Top Navigation Tab Bar */}
        <div className="flex flex-wrap items-center gap-1 px-4 pt-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14284B]/50">
          {[
            { id: 'subscriptions' as SubTab, label: 'Accounts & Access Control', icon: ShieldCheck },
            { id: 'restrictions' as SubTab, label: `Restrictions & History (${restrictions.length})`, icon: Lock },
            { id: 'reminders' as SubTab, label: `Reminders (${reminders.length})`, icon: Bell },
            { id: 'audit' as SubTab, label: `Audit Trail (${auditLogs.length})`, icon: History },
            ...(isSuperAdmin
              ? [{ id: 'reset' as SubTab, label: 'Test Data Reset', icon: Database }]
              : []),
          ].map(({ id, label, icon: Icon }) => {
            const active = subTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSubTab(id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
                  active
                    ? 'border-[#B91C1C] text-[#14284B] dark:text-white dark:border-white'
                    : 'border-transparent text-slate-500 dark:text-slate-300 hover:text-[#14284B] dark:hover:text-white'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: ACCOUNTS & ACCESS CONTROL */}
        {subTab === 'subscriptions' && (
          <div>
            {/* Grouped Filter & Fast-Selection Toolbar */}
            <div className="px-4 sm:px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
              {/* Row 1: Segmented Account Type Selector + Quick Selection Helpers */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#14284B] border border-slate-200 dark:border-slate-700">
                  {ACCOUNT_TYPE_SEGMENTS.map((seg) => {
                    const active = typeFilter === seg.value;
                    return (
                      <button
                        key={seg.value}
                        type="button"
                        onClick={() => setTypeFilter(seg.value)}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#14284B] text-white dark:bg-white dark:text-[#14284B] shadow-2xs'
                            : 'text-slate-600 dark:text-slate-200 hover:text-[#14284B] dark:hover:text-white'
                        }`}
                      >
                        {seg.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500 dark:text-slate-300 font-medium mr-1">
                    Showing <strong className="text-[#14284B] dark:text-white tabular-nums">{filteredSubscriptions.length}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    disabled={filteredSubscriptions.length === 0}
                    className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-semibold hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                  >
                    {allFilteredSelected ? 'Deselect Shown' : 'Select All Shown'}
                  </button>
                  <button
                    type="button"
                    onClick={selectUnlockedFiltered}
                    disabled={filteredSubscriptions.length === 0}
                    className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-semibold hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                  >
                    Select Active Only
                  </button>
                </div>
              </div>

              {/* Row 2: Search + Status Filter */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search school, parent, student, programme, or email..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#14284B] dark:text-white sm:w-52"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="LOCKED">Locked</option>
                  <option value="GRACE_PERIOD">7-Day Grace Period</option>
                  <option value="DUE_SOON">Due Within 7 Days</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="ACTIVE">Active</option>
                  <option value="EXEMPT">Exempt</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>
            </div>

            {/* Docked Bulk Selection Action Bar (clean solid navy strip with crisp white text) */}
            {selectedSubIds.size > 0 && (
              <div className="bg-[#14284B] text-white px-5 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#B91C1C] text-white font-bold tabular-nums">
                    {selectedSubIds.size}
                  </span>
                  <span className="text-white">
                    <strong>{selectedSubIds.size}</strong> account{selectedSubIds.size > 1 ? 's' : ''} selected. Review linked learners and confirm before applying.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setApplyRestrictionTargets(selectedSubscriptionTargets)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    <Lock size={13} /> Restrict Selected ({selectedSubIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSubIds(new Set())}
                    className="px-3 py-2 rounded-lg border border-white/30 hover:bg-white/10 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            {/* Accounts Table */}
            {loading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                <Loader2 className="animate-spin" size={18} /> Loading accounts…
              </div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-300">
                No accounts match your current search or filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#14284B]/70 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          aria-label="Select all filtered accounts"
                          className="w-4 h-4 accent-[#B91C1C] cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-3">Account &amp; Plan</th>
                      <th className="px-4 py-3">Scope / Payer</th>
                      <th className="px-4 py-3">Status &amp; Active Locks</th>
                      <th className="px-4 py-3">Due / Grace (WAT)</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                    {filteredSubscriptions.map((sub) => {
                      const activeCount = Array.isArray(sub.activeRestrictions) ? sub.activeRestrictions.length : 0;
                      const isSelected = selectedSubIds.has(sub.id);
                      return (
                        <tr
                          key={sub.id}
                          className={`transition-colors hover:bg-slate-50/90 dark:hover:bg-white/[0.04] ${
                            isSelected ? 'bg-[#14284B]/[0.05] dark:bg-white/[0.08]' : ''
                          }`}
                        >
                          <td
                            className="px-4 py-3.5 align-top cursor-pointer"
                            onClick={() => toggleSelectSub(sub.id)}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectSub(sub.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Select ${sub.accountName || sub.id}`}
                              className="mt-0.5 w-4 h-4 accent-[#B91C1C] cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-bold text-[#14284B] dark:text-white">
                              {sub.accountName || sub.studentName || sub.id}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-300">
                              {sub.programmeName || sub.planName || 'Subscription'} • {sub.durationWeeks || 4}w
                            </p>
                            {sub.hasActiveOverride && (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-[#14284B]/10 dark:bg-white/15 text-[#14284B] dark:text-white text-[10px] font-bold">
                                <Unlock size={10} /> Override until {sub.overrideExpiresAt?.slice(0, 10)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-100">
                              {sub.billingResponsibility}
                            </span>
                            <span className="block text-[10px] text-slate-500 dark:text-slate-300">
                              {String(sub.accountType || '').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${
                                STATUS_BADGE[sub.liveStatus] || STATUS_BADGE.ACTIVE
                              }`}
                            >
                              {sub.liveStatus === 'LOCKED' && <Lock size={10} />}
                              {sub.liveStatus === 'GRACE_PERIOD' && <Clock size={10} />}
                              {sub.isManuallyLocked
                                ? 'RESTRICTED'
                                : String(sub.liveStatus || 'ACTIVE').replace(/_/g, ' ')}
                            </span>
                            {sub.lockReasonLabel && sub.isLocked && (
                              <span
                                className="block text-[11px] font-semibold text-[#14284B] dark:text-white mt-1 max-w-[220px] truncate"
                                title={sub.lockReasonLabel}
                              >
                                {sub.lockReasonLabel}
                              </span>
                            )}
                            {activeCount > 1 && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-[#B91C1C] text-white text-[10px] font-bold">
                                {activeCount} Active Restrictions
                              </span>
                            )}
                            {!sub.isManuallyLocked && sub.isManuallyUnlocked && (
                              <span className="block text-[10px] text-slate-600 dark:text-slate-200 mt-0.5 font-semibold">
                                Opened manually by admin
                              </span>
                            )}
                            {sub.billingConfigIncomplete && !sub.isManuallyLocked && sub.accountType !== 'SCHOOL_ADMIN' && (
                              <span className="block text-[10px] text-slate-500 dark:text-slate-300 mt-0.5">
                                No due date configured
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 tabular-nums">
                            <p className="font-semibold text-slate-800 dark:text-white">
                              {sub.dueDateFormatted || 'Not scheduled'}
                            </p>
                            {sub.graceEndsAtFormatted && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-300">
                                Grace ends: {sub.graceEndsAtFormatted}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 tabular-nums">
                            <p className="font-bold text-[#14284B] dark:text-white">
                              {formatNaira(sub.liveAmountDue ?? sub.remainingBalance ?? 0)}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-300">
                              Plan: {formatNaira(sub.amount || 0)}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setApplyRestrictionTargets([toRestrictionTarget(sub)])}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#B91C1C] hover:bg-[#991B1B] text-white text-[11px] font-bold cursor-pointer transition-colors"
                              >
                                <Lock size={12} /> {sub.isLocked ? 'Add Lock' : 'Lock'}
                              </button>
                              {(sub.isLocked || activeCount > 0 || sub.isManuallyUnlocked) && (
                                <button
                                  type="button"
                                  onClick={() => setUnlockRestrictionTarget(toRestrictionTarget(sub))}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#14284B] hover:bg-slate-800 dark:bg-white dark:text-[#14284B] dark:hover:bg-slate-100 text-white text-[11px] font-bold cursor-pointer transition-colors"
                                >
                                  <Unlock size={12} /> {activeCount > 0 || sub.isLocked ? 'Manage / Lift' : 'Settings'}
                                </button>
                              )}
                              {sub.accountType !== 'SCHOOL_ADMIN' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openManualModalForSub(sub)}
                                    className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 text-[#14284B] dark:text-white text-[11px] font-semibold cursor-pointer transition-colors"
                                  >
                                    Record Pay
                                  </button>
                                  {sub.hasActiveOverride ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleRevokeOverride(sub)}
                                      className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-[#14284B] dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 text-[11px] font-semibold cursor-pointer"
                                    >
                                      Revoke Override
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOverrideTarget(sub);
                                        setOverrideReason('');
                                      }}
                                      className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
                                    >
                                      Override
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExemptTarget(sub);
                                      setExemptReason('');
                                    }}
                                    className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
                                  >
                                    {sub.isExempt ? 'Unexempt' : 'Exempt'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 1B: RESTRICTIONS & IMMUTABLE AUDIT HISTORY */}
        {subTab === 'restrictions' && (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            <div className="overflow-x-auto">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#14284B] dark:text-white">
                    Account &amp; Programme Restrictions Ledger ({restrictions.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300">
                    Every automated payment lockdown and manual administrative restriction is preserved as an independent record.
                  </p>
                </div>
              </div>
              {restrictions.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-300">
                  No account restriction records have been created yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#14284B]/70 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-200">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Target Account</th>
                      <th className="px-4 py-3">Type &amp; Reason</th>
                      <th className="px-4 py-3">User Message &amp; Internal Note</th>
                      <th className="px-4 py-3">Audit Trail</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                    {restrictions.map((r) => (
                      <tr key={r.restrictionId} className="align-top">
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              r.status === 'ACTIVE'
                                ? 'bg-[#B91C1C] text-white'
                                : r.status === 'SCHEDULED'
                                ? 'bg-[#14284B] text-white dark:bg-white/20 dark:text-white'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {String(r.status).replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-[#14284B] dark:text-white">{r.accountName || r.targetAccountId}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-300">
                            {String(r.targetAccountType).replace(/_/g, ' ')}
                            {r.cascadesToLinkedLearners ? ` • Cascades (${r.affectedStudentIds?.length || 0} learners)` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-800 dark:text-white">{r.reasonCode}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-300">
                            {RESTRICTION_TYPE_LABELS[r.restrictionType] || r.restrictionType}
                          </p>
                          {r.expiresAt && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-200 mt-0.5 tabular-nums">
                              Expires: {String(r.expiresAt).slice(0, 16).replace('T', ' ')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 max-w-sm space-y-1.5">
                          <p className="text-slate-700 dark:text-slate-200">{r.userFacingMessage}</p>
                          {r.internalAdminNote && (
                            <p className="text-[11px] text-[#14284B] dark:text-slate-100 bg-slate-100 dark:bg-white/10 rounded-md px-2.5 py-1">
                              <strong>Internal Note (Private):</strong> {r.internalAdminNote}
                            </p>
                          )}
                          {r.unlockReason && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-200">
                              <strong className="text-[#14284B] dark:text-white">Unlock Reason:</strong> {r.unlockReason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[11px] text-slate-500 dark:text-slate-300 space-y-0.5 tabular-nums">
                          <p>
                            <strong className="text-[#14284B] dark:text-white">Applied:</strong> {r.appliedByName} ({String(r.appliedAt || '').slice(0, 16).replace('T', ' ')})
                          </p>
                          {r.liftedByName && (
                            <p>
                              <strong className="text-[#14284B] dark:text-white">Lifted:</strong> {r.liftedByName} ({String(r.liftedAt || '').slice(0, 16).replace('T', ' ')})
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {(r.status === 'ACTIVE' || r.status === 'SCHEDULED') &&
                            r.restrictionType !== 'AUTOMATED_PAYMENT_LOCKDOWN' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setUnlockRestrictionTarget({
                                    subscriptionId: r.relatedSubscriptionId || null,
                                    accountType: r.targetAccountType,
                                    accountId: r.targetAccountId,
                                    accountName: r.accountName || r.targetAccountId,
                                    schoolId: r.schoolId,
                                    parentId: r.parentId,
                                    studentId: r.studentId,
                                    programmeEnrollmentId: r.programmeEnrollmentId,
                                    activeRestrictions: [r],
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#14284B] hover:bg-slate-800 dark:bg-white dark:text-[#14284B] text-white text-[11px] font-bold cursor-pointer"
                              >
                                <Unlock size={12} /> Lift
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Immutable Restriction Audit Log */}
            <div className="overflow-x-auto">
              <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-[#14284B]/40 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#14284B] dark:text-white">
                  Immutable Restriction Audit Log ({restrictionAuditLogs.length})
                </h3>
              </div>
              {restrictionAuditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-300">
                  No restriction lifecycle events logged yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#14284B]/70 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Event</th>
                      <th className="px-4 py-2.5">Account</th>
                      <th className="px-4 py-2.5">Actor</th>
                      <th className="px-4 py-2.5">Reason / Details</th>
                      <th className="px-4 py-2.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                    {restrictionAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-2.5 font-bold text-[#14284B] dark:text-white">
                          {log.action}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-slate-800 dark:text-white">
                            {log.targetAccountName || log.targetAccountId}
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-300">
                            {log.targetAccountType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-800 dark:text-white">{log.actorName || log.actorEmail}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-300">{log.actorEmail}</p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-200">
                          {log.unlockReason || log.userFacingMessage || log.reasonCode || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300 tabular-nums">
                          {String(log.createdAt || '').slice(0, 19).replace('T', ' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: REMINDER HISTORY */}
        {subTab === 'reminders' && (
          <div className="overflow-x-auto">
            {reminders.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-300">
                No scheduled renewal reminders have been logged yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#14284B]/70 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-200">
                  <tr>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Due Date (WAT)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Attempt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                  {reminders.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-bold text-[#14284B] dark:text-white">
                        {r.accountName || r.subscriptionId}
                        {r.childName && (
                          <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-300">
                            Child: {r.childName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">{r.reminderType}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-200">{r.recipientEmail || '—'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular-nums">
                        {r.dueDateFormatted || r.dueDateIso?.slice(0, 10) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            r.status === 'SENT'
                              ? 'bg-slate-100 text-[#14284B] dark:bg-white/15 dark:text-white'
                              : 'bg-[#B91C1C] text-white'
                          }`}
                        >
                          {r.status} {r.retryCount ? `(retries: ${r.retryCount})` : ''}
                        </span>
                        {r.lastError && (
                          <p className="text-[10px] text-[#B91C1C] dark:text-slate-200 mt-0.5">{r.lastError}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-300 tabular-nums">
                        {String(r.sentAt || r.lastAttemptAt || '').slice(0, 19).replace('T', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: AUDIT TRAIL */}
        {subTab === 'audit' && (
          <div className="overflow-x-auto">
            {auditLogs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-300">
                No administrative billing or guardrail actions have been logged yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#14284B]/70 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-200">
                  <tr>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Administrator</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Details / Reason</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 font-bold text-[#14284B] dark:text-white">{log.action}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-white">{log.actorName || log.actorEmail}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-300">{log.actorEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-200">
                        {log.targetType}: {log.targetId}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-200">
                        {log.reason || log.notes || (log.amount ? `${formatNaira(log.amount)} (${log.reference || ''})` : '—')}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-300 tabular-nums">
                        {String(log.createdAt || '').slice(0, 19).replace('T', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 4: CONTROLLED TEST FINANCIAL DATA RESET (SUPERADMIN ONLY) */}
        {subTab === 'reset' && isSuperAdmin && (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            <div className="p-6 space-y-3 bg-slate-50/60 dark:bg-[#14284B]/40">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-[#B91C1C] text-white flex items-center justify-center shrink-0">
                  <ShieldAlert size={18} />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#14284B] dark:text-white">
                    Controlled Test Financial Data Reset (Superadmin Two-Stage Safeguard)
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-200 leading-relaxed">
                    Stage A inspects your active Firebase project and lists every financial transaction, derived wallet balance, and embedded payment history field without modifying Firestore. Stage B is strictly blocked unless the server verifies <code className="font-mono font-bold">EXPECTED_TEST_FIREBASE_PROJECT_ID</code> + <code className="font-mono font-bold">ALLOW_TEST_FINANCIAL_RESET=true</code>, saves a recoverable backup snapshot, and receives the exact confirmation phrase. Users, schools, students, programmes, schedules, assessments, and <code className="font-mono">payment_config/settings</code> are NEVER deleted.
                  </p>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => void handleRunDryRun()}
                  disabled={resetLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#14284B] hover:bg-slate-800 dark:bg-white dark:text-[#14284B] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {resetLoading ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
                  Run Stage A Dry Run (Read-Only Inventory)
                </button>
              </div>
            </div>

            {dryRunInventory && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#14284B] dark:text-white">
                      Active Firebase Project:{' '}
                      <span className="font-mono text-[#B91C1C] dark:text-white underline decoration-[#B91C1C] dark:decoration-white/50">
                        {dryRunInventory.activeProjectId}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-300">
                      Environment: {dryRunInventory.environmentLabel} • Preview Signature:{' '}
                      <code className="font-mono font-bold">{dryRunInventory.previewSignature}</code>
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold ${
                      dryRunInventory.guard?.allowed
                        ? 'bg-[#14284B] text-white dark:bg-white dark:text-[#14284B]'
                        : 'bg-[#B91C1C] text-white'
                    }`}
                  >
                    {dryRunInventory.guard?.allowed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {dryRunInventory.guard?.allowed ? 'Test Environment Verified' : 'Stage B Guard Locked (Fail-Closed)'}
                  </span>
                </div>

                {!dryRunInventory.guard?.allowed && Array.isArray(dryRunInventory.guard?.reasons) && (
                  <div className="px-6 py-3.5 bg-slate-50 dark:bg-[#14284B]/60 text-xs text-[#14284B] dark:text-white space-y-1">
                    <p className="font-bold">Safety Guard Reasons:</p>
                    {dryRunInventory.guard.reasons.map((reason: string, idx: number) => (
                      <p key={idx} className="text-slate-600 dark:text-slate-200">• {reason}</p>
                    ))}
                  </div>
                )}

                {/* Unified 4-Column Divided Inventory Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
                  <div className="p-4">
                    <span className="text-slate-500 dark:text-slate-300">Docs to Delete</span>
                    <p className="mt-1 text-lg font-bold text-[#B91C1C] dark:text-white tabular-nums">
                      {dryRunInventory.totalFinancialDocumentsToDelete}
                    </p>
                  </div>
                  <div className="p-4">
                    <span className="text-slate-500 dark:text-slate-300">Wallets to Zero</span>
                    <p className="mt-1 text-lg font-bold text-[#14284B] dark:text-white tabular-nums">
                      {dryRunInventory.totalDerivedWalletDocsToZero}
                    </p>
                  </div>
                  <div className="p-4">
                    <span className="text-slate-500 dark:text-slate-300">Embedded Fields Cleaned</span>
                    <p className="mt-1 text-lg font-bold text-[#14284B] dark:text-white tabular-nums">
                      {dryRunInventory.totalEmbeddedRecordsToClean}
                    </p>
                  </div>
                  <div className="p-4">
                    <span className="text-slate-500 dark:text-slate-300">Aggregate Test Volume</span>
                    <p className="mt-1 text-lg font-bold text-[#14284B] dark:text-white tabular-nums">
                      {formatNaira(dryRunInventory.totalAggregateAmountNaira || 0)}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-[#14284B]/70 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Collection</th>
                        <th className="px-4 py-2.5">Action</th>
                        <th className="px-4 py-2.5">Count</th>
                        <th className="px-4 py-2.5">Aggregate Amount</th>
                        <th className="px-4 py-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                      {(dryRunInventory.collections || []).map((col: any) => (
                        <tr key={`${col.collection}-${col.action}`}>
                          <td className="px-4 py-2.5 font-mono font-bold text-[#14284B] dark:text-white">{col.collection}</td>
                          <td className="px-4 py-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">{col.action}</td>
                          <td className="px-4 py-2.5 font-bold tabular-nums text-[#14284B] dark:text-white">{col.documentCount}</td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{formatNaira(col.aggregateAmountNaira || 0)}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300">{col.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Stage B Execution Section */}
                <div className="p-6 space-y-3 bg-slate-50/60 dark:bg-[#14284B]/40">
                  <p className="text-xs font-bold text-[#14284B] dark:text-white">
                    Stage B: Execute Controlled Test Financial Reset (Backup Created Automatically Before Deletion)
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={confirmationPhrase}
                      onChange={(e) => setConfirmationPhrase(e.target.value)}
                      placeholder={`Type "${RESET_CONFIRMATION_PHRASE}" exactly`}
                      disabled={!dryRunInventory.guard?.allowed}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={
                        executingReset ||
                        !dryRunInventory.guard?.allowed ||
                        confirmationPhrase.trim() !== RESET_CONFIRMATION_PHRASE
                      }
                      onClick={() => void handleExecuteReset()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer"
                    >
                      {executingReset ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Execute Reset
                    </button>
                  </div>
                </div>

                {resetResult && (
                  <div className="px-6 py-4 bg-[#14284B] text-white text-xs">
                    <p className="font-bold">Reset Executed Successfully — Operation ID: {resetResult.operationId}</p>
                    <p className="mt-1 text-slate-200">
                      Backup Snapshot Document: {resetResult.backupDocId} • Zeroed Wallets: {resetResult.zeroedWallets}
                    </p>
                  </div>
                )}

                {resetLogs.length > 0 && (
                  <div className="p-6 space-y-2">
                    <p className="text-xs font-bold text-[#14284B] dark:text-white">Permanent Financial Reset Audit Logs</p>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                      {resetLogs.map((log) => (
                        <div key={log.id} className="px-3.5 py-2.5 text-[11px] flex flex-wrap justify-between gap-2 text-slate-700 dark:text-slate-200">
                          <span className="font-mono font-bold text-[#14284B] dark:text-white">{log.operationId}</span>
                          <span>By {log.executedByEmail} • Project: {log.activeProjectId} • Backup: {log.backupDocId}</span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">{String(log.executedAt || '').slice(0, 19).replace('T', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: RECORD MANUAL PAYMENT */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#14284B]">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-[#B91C1C] text-white flex items-center justify-center shrink-0">
                  <CreditCard size={16} />
                </span>
                <h3 className="text-sm font-bold text-[#14284B] dark:text-white">
                  Record Admin-Verified Manual Payment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-500 dark:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleManualSubmit} className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">Account Type</label>
                  <select
                    value={manualForm.targetType}
                    onChange={(e) => setManualForm((f) => ({ ...f, targetType: e.target.value as any }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="SCHOOL">School Institutional Account</option>
                    <option value="PARENT">Parent / Child Programme</option>
                    <option value="INDIVIDUAL_STUDENT">Individual Student Account</option>
                    <option value="PROGRAMME_ENROLLMENT">Self-Funded Additional Programme</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">
                    {manualForm.targetType === 'SCHOOL'
                      ? 'School ID'
                      : manualForm.targetType === 'PARENT'
                      ? 'Parent User UID'
                      : manualForm.targetType === 'PROGRAMME_ENROLLMENT'
                      ? 'Programme Enrolment ID'
                      : 'Student User UID'}
                  </label>
                  <input
                    required
                    value={manualForm.targetId}
                    onChange={(e) => setManualForm((f) => ({ ...f, targetId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {manualForm.targetType === 'PARENT' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#14284B] dark:text-white mb-1">Child Student ID (Optional)</label>
                    <input
                      value={manualForm.childId}
                      onChange={(e) => setManualForm((f) => ({ ...f, childId: e.target.value }))}
                      placeholder="Leave empty for parent-level plan"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#14284B] dark:text-white mb-1">Child Name</label>
                    <input
                      value={manualForm.childName}
                      onChange={(e) => setManualForm((f) => ({ ...f, childName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">Amount Received (₦)</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="0.01"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">Full Plan Fee (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualForm.contractAmount}
                    onChange={(e) => setManualForm((f) => ({ ...f, contractAmount: e.target.value }))}
                    placeholder="For partial tracking"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">Duration (Weeks)</label>
                  <input
                    type="number"
                    min="1"
                    value={manualForm.durationWeeks}
                    onChange={(e) => setManualForm((f) => ({ ...f, durationWeeks: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">Method</label>
                  <select
                    value={manualForm.paymentMethod}
                    onChange={(e) => setManualForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="pos">POS Terminal</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other Offline Method</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">Payment Date</label>
                  <input
                    required
                    type="date"
                    value={manualForm.paymentDate}
                    onChange={(e) => setManualForm((f) => ({ ...f, paymentDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#14284B] dark:text-white mb-1">Unique Reference</label>
                  <input
                    required
                    value={manualForm.reference}
                    onChange={(e) => setManualForm((f) => ({ ...f, reference: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#14284B] dark:text-white mb-1">Receipt / Transfer Proof URL (Optional)</label>
                <input
                  type="url"
                  value={manualForm.proofUrl}
                  onChange={(e) => setManualForm((f) => ({ ...f, proofUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-[#14284B] dark:text-white mb-1">Verification Notes</label>
                <textarea
                  rows={2}
                  value={manualForm.notes}
                  onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Bank narration, depositor name, or finance verification note"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-200 bg-slate-50 dark:bg-[#14284B]/60 p-3 rounded-lg">
                Recorded with <code className="font-mono font-bold">paymentSource: MANUAL_ADMIN</code> and <code className="font-mono font-bold">verificationStatus: ADMIN_VERIFIED</code>. Duplicate references are blocked automatically.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold cursor-pointer disabled:opacity-60"
                >
                  {submittingManual && <Loader2 size={14} className="animate-spin" />}
                  Confirm &amp; Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TEMPORARY ACCESS OVERRIDE */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveOverride}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4 text-xs"
          >
            <h3 className="text-sm font-bold text-[#14284B] dark:text-white">
              Temporary Access Override — {overrideTarget.accountName || overrideTarget.id}
            </h3>
            <div>
              <label className="block font-bold text-[#14284B] dark:text-white mb-1">Override Expires At</label>
              <input
                required
                type="datetime-local"
                value={overrideExpiresAt}
                onChange={(e) => setOverrideExpiresAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-bold text-[#14284B] dark:text-white mb-1">Logged Reason (Required)</label>
              <textarea
                required
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g., Bank transfer awaiting interbank settlement clearing"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingOverride}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#14284B] dark:bg-white dark:text-[#14284B] text-white font-bold cursor-pointer disabled:opacity-60"
              >
                {submittingOverride && <Loader2 size={13} className="animate-spin" />}
                Apply Override
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EXEMPTION */}
      {exemptTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveExemption}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4 text-xs"
          >
            <h3 className="text-sm font-bold text-[#14284B] dark:text-white">
              {exemptTarget.isExempt ? 'Remove Subscription Exemption' : 'Approve Subscription Exemption'} —{' '}
              {exemptTarget.accountName || exemptTarget.id}
            </h3>
            <div>
              <label className="block font-bold text-[#14284B] dark:text-white mb-1">Audit Reason</label>
              <textarea
                required={!exemptTarget.isExempt}
                rows={3}
                value={exemptReason}
                onChange={(e) => setExemptReason(e.target.value)}
                placeholder="e.g., Approved scholarship / complimentary partner trial"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setExemptTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-[#14284B] dark:text-white font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingExempt}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#14284B] dark:bg-white dark:text-[#14284B] text-white font-bold cursor-pointer disabled:opacity-60"
              >
                {submittingExempt && <Loader2 size={13} className="animate-spin" />}
                {exemptTarget.isExempt ? 'Remove Exemption' : 'Mark Exempt'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: APPLY INDIVIDUAL OR BULK RESTRICTION (2-STEP PREVIEW + CONFIRM) */}
      <ApplyRestrictionModal
        open={Boolean(applyRestrictionTargets && applyRestrictionTargets.length > 0)}
        targets={applyRestrictionTargets || []}
        onClose={() => setApplyRestrictionTargets(null)}
        onSuccess={() => {
          void loadData();
          onRefreshParent?.();
        }}
      />

      {/* MODAL: MANAGE & LIFT RESTRICTIONS (MANDATORY UNLOCK REASON + AUDIT) */}
      <UnlockRestrictionsModal
        open={Boolean(unlockRestrictionTarget)}
        target={unlockRestrictionTarget}
        onClose={() => setUnlockRestrictionTarget(null)}
        onSuccess={() => {
          void loadData();
          onRefreshParent?.();
        }}
      />
    </div>
  );
};

export default AdminSubscriptionGuardrailsPanel;
