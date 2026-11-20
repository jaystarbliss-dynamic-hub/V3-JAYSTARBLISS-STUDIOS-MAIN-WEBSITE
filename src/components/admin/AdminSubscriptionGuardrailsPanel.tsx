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

interface AdminSubscriptionGuardrailsPanelProps {
  onBack: () => void;
  onRefreshParent?: () => void;
}

type SubTab = 'subscriptions' | 'reminders' | 'audit' | 'reset';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  DUE_SOON: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  GRACE_PERIOD: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  LOCKED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  PARTIALLY_PAID: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
  EXEMPT: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  SUSPENDED: 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700',
};

export const AdminSubscriptionGuardrailsPanel: React.FC<AdminSubscriptionGuardrailsPanelProps> = ({
  onBack,
  onRefreshParent,
}) => {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>('subscriptions');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
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
      setReminders(Array.isArray(data.reminders) ? data.reminders : []);
      setAuditLogs(Array.isArray(data.auditLogs) ? data.auditLogs : []);
      setIsSuperAdmin(Boolean(data.isSuperAdmin));
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            aria-label="Back to Billing Hub"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#B91C1C]">
              Subscription Guardrails &amp; Manual Payments
            </p>
            <h2 className="text-xl font-black text-[#14284B] dark:text-white tracking-tight">
              Seven-Day Grace Policy, Manual Settlements &amp; Overrides
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              All due dates and scheduled lockdown boundaries operate in Africa/Lagos (WAT).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openManualModalForSub()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-bold cursor-pointer"
          >
            <PlusCircle size={15} /> Record Manual Payment
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active</span>
            <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{summary.active}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Due in 7 Days</span>
            <p className="mt-1 text-2xl font-black text-sky-600 dark:text-sky-400 tabular-nums">{summary.dueSoon}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">7-Day Grace</span>
            <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400 tabular-nums">{summary.inGracePeriod}</p>
          </div>
          <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Locked Portals</span>
            <p className="mt-1 text-2xl font-black text-red-700 dark:text-red-400 tabular-nums">{summary.locked}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 col-span-2 md:col-span-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Overdue Balance</span>
            <p className="mt-1 text-lg font-black text-[#14284B] dark:text-white tabular-nums">
              {formatNaira(summary.totalOverdueBalance || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'subscriptions' as SubTab, label: 'Subscriptions & Overrides', icon: ShieldCheck },
          { id: 'reminders' as SubTab, label: `Reminder History (${reminders.length})`, icon: Bell },
          { id: 'audit' as SubTab, label: `Admin Audit Trail (${auditLogs.length})`, icon: History },
          ...(isSuperAdmin
            ? [{ id: 'reset' as SubTab, label: 'Test Financial Data Reset', icon: Database }]
            : []),
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              subTab === id
                ? 'bg-[#14284B] text-white dark:bg-white dark:text-[#14284B]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* TAB 1: SUBSCRIPTIONS */}
      {subTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search school, parent, student, programme, or email..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
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
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Account Types</option>
              <option value="SCHOOL">School</option>
              <option value="PARENT">Parent Account</option>
              <option value="PARENT_CHILD">Parent-Enrolled Child</option>
              <option value="INDIVIDUAL_STUDENT">Individual Student</option>
              <option value="STUDENT_SELF_FUNDED_PROGRAMME">Self-Funded Additional Programme</option>
            </select>
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="animate-spin" size={18} /> Loading subscriptions…
            </div>
          ) : filteredSubscriptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-xs text-slate-500">
              No subscriptions match your current filters.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Account &amp; Plan</th>
                    <th className="px-4 py-3">Payer</th>
                    <th className="px-4 py-3">Live Status</th>
                    <th className="px-4 py-3">Due / Grace (WAT)</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSubscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <p className="font-bold text-[#14284B] dark:text-white">
                          {sub.accountName || sub.studentName || sub.id}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {sub.programmeName || sub.planName || 'Subscription'} • {sub.durationWeeks || 4}w
                        </p>
                        {sub.hasActiveOverride && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 text-[10px] font-bold">
                            <Unlock size={10} /> Override active until {sub.overrideExpiresAt?.slice(0, 10)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {sub.billingResponsibility}
                        </span>
                        <span className="block text-[10px] text-slate-400">{sub.accountType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-wider ${
                            STATUS_BADGE[sub.liveStatus] || STATUS_BADGE.ACTIVE
                          }`}
                        >
                          {sub.liveStatus === 'LOCKED' && <Lock size={10} />}
                          {sub.liveStatus === 'GRACE_PERIOD' && <Clock size={10} />}
                          {String(sub.liveStatus || 'ACTIVE').replace(/_/g, ' ')}
                        </span>
                        {sub.billingConfigIncomplete && (
                          <span className="block text-[10px] text-amber-600 mt-0.5">
                            No due date configured (not auto-locked)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {sub.dueDateFormatted || 'Not scheduled'}
                        </p>
                        {sub.graceEndsAtFormatted && (
                          <p className="text-[11px] text-slate-500">
                            Grace ends: {sub.graceEndsAtFormatted}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <p className="font-black text-[#14284B] dark:text-white">
                          {formatNaira(sub.liveAmountDue ?? sub.remainingBalance ?? 0)}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Plan: {formatNaira(sub.amount || 0)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openManualModalForSub(sub)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#14284B] hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Record Payment
                          </button>
                          {sub.hasActiveOverride ? (
                            <button
                              type="button"
                              onClick={() => void handleRevokeOverride(sub)}
                              className="px-2.5 py-1.5 rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 text-[11px] font-bold cursor-pointer"
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
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
                            >
                              Temp Override
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setExemptTarget(sub);
                              setExemptReason('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
                          >
                            {sub.isExempt ? 'Remove Exempt' : 'Exempt'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REMINDER HISTORY */}
      {subTab === 'reminders' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          {reminders.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No scheduled renewal reminders have been logged yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Due Date (WAT)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Attempt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reminders.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-bold text-[#14284B] dark:text-white">
                      {r.accountName || r.subscriptionId}
                      {r.childName && <span className="block text-[11px] font-normal text-slate-500">Child: {r.childName}</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold">{r.reminderType}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.recipientEmail || '—'}</td>
                    <td className="px-4 py-3">{r.dueDateFormatted || r.dueDateIso?.slice(0, 10) || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          r.status === 'SENT'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {r.status} {r.retryCount ? `(retries: ${r.retryCount})` : ''}
                      </span>
                      {r.lastError && <p className="text-[10px] text-red-500 mt-0.5">{r.lastError}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{String(r.sentAt || r.lastAttemptAt || '').slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {subTab === 'audit' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          {auditLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No administrative billing or guardrail actions have been logged yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Administrator</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Details / Reason</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 font-extrabold text-[#14284B] dark:text-white">{log.action}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{log.actorName || log.actorEmail}</p>
                      <p className="text-[10px] text-slate-400">{log.actorEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {log.targetType}: {log.targetId}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {log.reason || log.notes || (log.amount ? `${formatNaira(log.amount)} (${log.reference || ''})` : '—')}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{String(log.createdAt || '').slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 4: CONTROLLED TEST FINANCIAL DATA RESET (SUPERADMIN ONLY) */}
      {subTab === 'reset' && isSuperAdmin && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldAlert size={22} className="text-[#B91C1C] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-[#991B1B] dark:text-red-300">
                  Controlled Test Financial Data Reset (Superadmin Two-Stage Safeguard)
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  Stage A inspects your active Firebase project and lists every financial transaction, derived wallet balance, and embedded payment history field without modifying Firestore. Stage B is strictly blocked unless the server verifies <code className="font-mono font-bold">EXPECTED_TEST_FIREBASE_PROJECT_ID</code> + <code className="font-mono font-bold">ALLOW_TEST_FINANCIAL_RESET=true</code>, saves a recoverable backup snapshot, and receives the exact confirmation phrase. Users, schools, students, programmes, schedules, assessments, and <code className="font-mono">payment_config/settings</code> are NEVER deleted.
                </p>
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={() => void handleRunDryRun()}
                disabled={resetLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#14284B] hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {resetLoading ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
                Run Stage A Dry Run (Read-Only Inventory)
              </button>
            </div>
          </div>

          {dryRunInventory && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs font-black text-[#14284B] dark:text-white">
                    Active Firebase Project: <span className="font-mono text-[#B91C1C]">{dryRunInventory.activeProjectId}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Environment: {dryRunInventory.environmentLabel} • Preview Signature: <code className="font-mono font-bold">{dryRunInventory.previewSignature}</code>
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                    dryRunInventory.guard?.allowed
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {dryRunInventory.guard?.allowed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {dryRunInventory.guard?.allowed ? 'Test Environment Verified' : 'Stage B Guard Locked (Fail-Closed)'}
                </span>
              </div>

              {!dryRunInventory.guard?.allowed && Array.isArray(dryRunInventory.guard?.reasons) && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <p className="font-bold">Safety Guard Reasons:</p>
                  {dryRunInventory.guard.reasons.map((reason: string, idx: number) => (
                    <p key={idx}>• {reason}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <span className="text-slate-500">Docs to Delete</span>
                  <p className="text-lg font-black text-[#B91C1C]">{dryRunInventory.totalFinancialDocumentsToDelete}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <span className="text-slate-500">Wallets to Zero</span>
                  <p className="text-lg font-black text-[#14284B] dark:text-white">{dryRunInventory.totalDerivedWalletDocsToZero}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <span className="text-slate-500">Embedded Fields Cleaned</span>
                  <p className="text-lg font-black text-[#14284B] dark:text-white">{dryRunInventory.totalEmbeddedRecordsToClean}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <span className="text-slate-500">Aggregate Test Volume</span>
                  <p className="text-lg font-black text-[#14284B] dark:text-white">{formatNaira(dryRunInventory.totalAggregateAmountNaira || 0)}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Collection</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Count</th>
                      <th className="px-3 py-2">Aggregate Amount</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(dryRunInventory.collections || []).map((col: any) => (
                      <tr key={`${col.collection}-${col.action}`}>
                        <td className="px-3 py-2 font-mono font-bold text-[#14284B] dark:text-white">{col.collection}</td>
                        <td className="px-3 py-2 text-[11px] font-semibold">{col.action}</td>
                        <td className="px-3 py-2 font-bold tabular-nums">{col.documentCount}</td>
                        <td className="px-3 py-2 tabular-nums">{formatNaira(col.aggregateAmountNaira || 0)}</td>
                        <td className="px-3 py-2 text-slate-500">{col.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Stage B Execution Box */}
              <div className="rounded-xl border border-red-200 dark:border-red-900/60 p-4 space-y-3 bg-red-50/30 dark:bg-red-950/10">
                <p className="text-xs font-extrabold text-[#991B1B] dark:text-red-300">
                  Stage B: Execute Controlled Test Financial Reset (Backup Created Automatically Before Deletion)
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={confirmationPhrase}
                    onChange={(e) => setConfirmationPhrase(e.target.value)}
                    placeholder={`Type "${RESET_CONFIRMATION_PHRASE}" exactly`}
                    disabled={!dryRunInventory.guard?.allowed}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={
                      executingReset ||
                      !dryRunInventory.guard?.allowed ||
                      confirmationPhrase.trim() !== RESET_CONFIRMATION_PHRASE
                    }
                    onClick={() => void handleExecuteReset()}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 cursor-pointer"
                  >
                    {executingReset ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Execute Reset
                  </button>
                </div>
              </div>

              {resetResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
                  <p className="font-bold">Reset Executed Successfully — Operation ID: {resetResult.operationId}</p>
                  <p className="mt-1">Backup Snapshot Document: {resetResult.backupDocId} • Zeroed Wallets: {resetResult.zeroedWallets}</p>
                </div>
              )}

              {resetLogs.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-[#14284B] dark:text-white">Permanent Financial Reset Audit Logs</p>
                  {resetLogs.map((log) => (
                    <div key={log.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] flex flex-wrap justify-between gap-2">
                      <span className="font-mono font-bold">{log.operationId}</span>
                      <span>By {log.executedByEmail} • Project: {log.activeProjectId} • Backup: {log.backupDocId}</span>
                      <span className="text-slate-500">{String(log.executedAt || '').slice(0, 19).replace('T', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: RECORD MANUAL PAYMENT */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-[#B91C1C]" />
                <h3 className="text-sm font-black text-[#14284B] dark:text-white">
                  Record Admin-Verified Manual Payment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleManualSubmit} className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Account Type</label>
                  <select
                    value={manualForm.targetType}
                    onChange={(e) => setManualForm((f) => ({ ...f, targetType: e.target.value as any }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="SCHOOL">School Institutional Account</option>
                    <option value="PARENT">Parent / Child Programme</option>
                    <option value="INDIVIDUAL_STUDENT">Individual Student Account</option>
                    <option value="PROGRAMME_ENROLLMENT">Self-Funded Additional Programme</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {manualForm.targetType === 'PARENT' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Child Student ID (Optional)</label>
                    <input
                      value={manualForm.childId}
                      onChange={(e) => setManualForm((f) => ({ ...f, childId: e.target.value }))}
                      placeholder="Leave empty for parent-level plan"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Child Name</label>
                    <input
                      value={manualForm.childName}
                      onChange={(e) => setManualForm((f) => ({ ...f, childName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Amount Received (₦)</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="0.01"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Plan Fee (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualForm.contractAmount}
                    onChange={(e) => setManualForm((f) => ({ ...f, contractAmount: e.target.value }))}
                    placeholder="For partial tracking"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Duration (Weeks)</label>
                  <input
                    type="number"
                    min="1"
                    value={manualForm.durationWeeks}
                    onChange={(e) => setManualForm((f) => ({ ...f, durationWeeks: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Method</label>
                  <select
                    value={manualForm.paymentMethod}
                    onChange={(e) => setManualForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="pos">POS Terminal</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other Offline Method</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Date</label>
                  <input
                    required
                    type="date"
                    value={manualForm.paymentDate}
                    onChange={(e) => setManualForm((f) => ({ ...f, paymentDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Unique Reference</label>
                  <input
                    required
                    value={manualForm.reference}
                    onChange={(e) => setManualForm((f) => ({ ...f, reference: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Receipt / Transfer Proof URL (Optional)</label>
                <input
                  type="url"
                  value={manualForm.proofUrl}
                  onChange={(e) => setManualForm((f) => ({ ...f, proofUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Verification Notes</label>
                <textarea
                  rows={2}
                  value={manualForm.notes}
                  onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Bank narration, depositor name, or finance verification note"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <p className="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl">
                Recorded with <code className="font-mono font-bold">paymentSource: MANUAL_ADMIN</code> and <code className="font-mono font-bold">verificationStatus: ADMIN_VERIFIED</code>. Duplicate references are blocked automatically.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white font-bold cursor-pointer disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveOverride}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4 text-xs"
          >
            <h3 className="text-sm font-black text-[#14284B] dark:text-white">
              Temporary Access Override — {overrideTarget.accountName || overrideTarget.id}
            </h3>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Override Expires At</label>
              <input
                required
                type="datetime-local"
                value={overrideExpiresAt}
                onChange={(e) => setOverrideExpiresAt(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Logged Reason (Required)</label>
              <textarea
                required
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g., Bank transfer awaiting interbank settlement clearing"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOverrideTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-bold cursor-pointer">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingOverride}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14284B] text-white font-bold cursor-pointer disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveExemption}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4 text-xs"
          >
            <h3 className="text-sm font-black text-[#14284B] dark:text-white">
              {exemptTarget.isExempt ? 'Remove Subscription Exemption' : 'Approve Subscription Exemption'} —{' '}
              {exemptTarget.accountName || exemptTarget.id}
            </h3>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Audit Reason</label>
              <textarea
                required={!exemptTarget.isExempt}
                rows={3}
                value={exemptReason}
                onChange={(e) => setExemptReason(e.target.value)}
                placeholder="e.g., Approved scholarship / complimentary partner trial"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setExemptTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-bold cursor-pointer">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingExempt}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14284B] text-white font-bold cursor-pointer disabled:opacity-60"
              >
                {submittingExempt && <Loader2 size={13} className="animate-spin" />}
                {exemptTarget.isExempt ? 'Remove Exemption' : 'Mark Exempt'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptionGuardrailsPanel;
