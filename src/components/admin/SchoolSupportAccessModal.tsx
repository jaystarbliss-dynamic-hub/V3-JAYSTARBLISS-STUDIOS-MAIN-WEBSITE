import React, { useState, useEffect } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { ShieldAlert, X, Lock, Clock, CheckCircle2, Loader2, Eye, EyeOff, School } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { startImpersonation, type ImpersonationTarget } from '../../utils/impersonation';

interface SchoolSupportAccessModalProps {
  isOpen: boolean;
  target: ImpersonationTarget | null;
  onClose: () => void;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
];

// Master Super Admin Support Access Confirmation Key (SHA-256 of "@Jaystar1230")
const SUPER_ADMIN_MASTER_KEY_SHA256 =
  '0d315d23650080744bf2485118a4319874c31234e478610474d6104673f209c0';

async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const buf = new TextEncoder().encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}

export const SchoolSupportAccessModal: React.FC<SchoolSupportAccessModalProps> = ({
  isOpen,
  target,
  onClose,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setDurationMinutes(30);
      setPassword('');
      setShowPassword(false);
      setVerifying(false);
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen || !target) return null;

  const trimmedReason = reason.trim();

  const completeLaunch = () => {
    const verifiedAt = new Date().toISOString();
    toast.info(`Starting audited ${durationMinutes}-minute support session for ${target.name}...`);
    onClose();
    startImpersonation(target, navigate, {
      reason: trimmedReason,
      durationMinutes,
      reauthVerifiedAt: verifiedAt,
      isAuditedSupportSession: true,
    });
  };

  const handlePasswordVerifyAndEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (trimmedReason.length < 8) {
      setErrorMsg('Please enter a brief support reason (at least 8 characters) for the audit log.');
      return;
    }

    const enteredPassword = password.trim();
    if (!enteredPassword) {
      setErrorMsg('Enter your Super Admin password to confirm your identity.');
      return;
    }

    setVerifying(true);
    try {
      // 1. Check if the entered password matches the platform Super Admin Master Support Key (@Jaystar1230)
      const enteredHash = await sha256Hex(enteredPassword);
      const isMasterSuperAdminKey =
        enteredPassword === '@Jaystar1230' || enteredHash === SUPER_ADMIN_MASTER_KEY_SHA256;

      if (isMasterSuperAdminKey) {
        if (currentUser) {
          await currentUser.getIdToken().catch(() => undefined);
        }
        completeLaunch();
        return;
      }

      if (!currentUser || !currentUser.email) {
        setErrorMsg('Active Super Admin authentication is required. Please sign in again.');
        return;
      }

      // 2. Otherwise verify against Firebase Auth email/password credential
      const credential = EmailAuthProvider.credential(currentUser.email, enteredPassword);
      await reauthenticateWithCredential(currentUser, credential);
      completeLaunch();
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setErrorMsg('Incorrect Super Admin password. Enter your Super Admin password or master unlock key.');
      } else if (code.includes('too-many-requests')) {
        setErrorMsg('Too many verification attempts. Please wait a moment and try again.');
      } else {
        setErrorMsg(err?.message || 'Unable to verify your Super Admin credentials.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleGoogleVerifyAndEnter = async () => {
    setErrorMsg('');

    if (trimmedReason.length < 8) {
      setErrorMsg('Please enter a brief support reason (at least 8 characters) for the audit log.');
      return;
    }

    if (!currentUser) {
      setErrorMsg('Active Super Admin authentication is required. Please sign in again.');
      return;
    }

    setVerifying(true);
    try {
      const provider = new GoogleAuthProvider();
      if (currentUser.email) {
        provider.setCustomParameters({ login_hint: currentUser.email, prompt: 'select_account' });
      }
      try {
        await reauthenticateWithPopup(currentUser, provider, browserPopupRedirectResolver);
      } catch (popupErr: any) {
        const errCode = String(popupErr?.code || '');
        if (
          errCode.includes('invalid-argument') ||
          errCode.includes('operation-not-supported') ||
          errCode.includes('user-mismatch')
        ) {
          // Fallback to standard signInWithPopup with browserPopupRedirectResolver
          await signInWithPopup(auth, provider, browserPopupRedirectResolver);
        } else {
          throw popupErr;
        }
      }
      completeLaunch();
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
        setErrorMsg('Google verification was cancelled.');
      } else {
        setErrorMsg(err?.message || 'Unable to complete Google re-authentication.');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="school-support-access-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden text-slate-900 dark:text-zinc-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#991B1B] dark:text-red-400 flex items-center justify-center shrink-0">
              <ShieldAlert size={20} />
            </div>
            <div className="min-w-0">
              <h2
                id="school-support-access-title"
                className="text-base font-bold text-slate-900 dark:text-white truncate"
              >
                Audited School Support Access
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                Re-authentication &amp; audit reason required before entering school portal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close support access dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handlePasswordVerifyAndEnter} className="p-6 space-y-5">
          {/* Target School Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-700 dark:text-zinc-200 shrink-0">
              <School size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {target.schoolName || target.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                {target.email || 'School Admin Account'} · All actions logged to audit trail
              </p>
            </div>
          </div>

          {/* Support Reason */}
          <div>
            <label
              htmlFor="support-access-reason"
              className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5"
            >
              Support Reason <span className="text-[#991B1B] dark:text-red-400">*</span>
            </label>
            <textarea
              id="support-access-reason"
              rows={2}
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="e.g. Reviewing overdue invoice status with school bursar"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#991B1B]/30 focus:border-[#991B1B]"
            />
          </div>

          {/* Session Time Limit */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Time-Limited Session Duration
            </span>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDurationMinutes(opt.value)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors inline-flex items-center justify-center gap-1.5 tabular-nums ${
                    durationMinutes === opt.value
                      ? 'bg-[#991B1B] text-white border-[#991B1B]'
                      : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Clock size={12} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Re-authentication Section */}
          <div className="space-y-3 pt-1">
            <div>
              <label
                htmlFor="super-admin-reauth-password"
                className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5"
              >
                Confirm Super Admin Password or Master Support Key {currentUser?.email ? `(${currentUser.email})` : ''}
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="super-admin-reauth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Enter your Super Admin password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#991B1B]/30 focus:border-[#991B1B]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={verifying}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={verifying}
                onClick={handleGoogleVerifyAndEnter}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-xs font-bold text-slate-900 dark:text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {verifying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>Verify with Google &amp; Enter</span>
              </button>

              <button
                type="submit"
                disabled={verifying}
                className="px-4 py-2.5 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                <span>Verify &amp; Enter School Portal</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SchoolSupportAccessModal;
