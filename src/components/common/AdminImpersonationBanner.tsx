import React, { useEffect, useId, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, LogOut, School, GraduationCap, User, Clock } from 'lucide-react';
import {
  getActiveImpersonation,
  stopImpersonation,
  type ActiveImpersonationRecord,
} from '../../utils/impersonation';

let activeBannerOwner: string | null = null;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AdminImpersonationBanner: React.FC = () => {
  const instanceId = useId();
  const [ownsBanner, setOwnsBanner] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [impersonation, setImpersonation] = useState<ActiveImpersonationRecord | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!activeBannerOwner) {
      activeBannerOwner = instanceId;
      setOwnsBanner(true);
    }
    return () => {
      if (activeBannerOwner === instanceId) activeBannerOwner = null;
    };
  }, [instanceId]);

  useEffect(() => {
    const check = () => {
      const active = getActiveImpersonation();
      setImpersonation(active && active.isMasquerading ? active : null);
      if (active?.expiresAt) {
        const diff = new Date(active.expiresAt).getTime() - Date.now();
        setRemainingMs(Math.max(0, diff));
      } else {
        setRemainingMs(null);
      }
    };

    check();
    window.addEventListener('storage', check);
    const interval = window.setInterval(() => {
      const active = getActiveImpersonation();
      if (!active) {
        setImpersonation((prev) => {
          if (prev) {
            navigate('/admin');
          }
          return null;
        });
        setRemainingMs(null);
        return;
      }
      if (active.expiresAt) {
        const diff = new Date(active.expiresAt).getTime() - Date.now();
        if (diff <= 0) {
          stopImpersonation(navigate, 'EXPIRED');
          return;
        }
        setRemainingMs(diff);
      }
    }, 1000);

    return () => {
      window.removeEventListener('storage', check);
      window.clearInterval(interval);
    };
  }, [location.pathname, navigate]);

  if (!ownsBanner || !impersonation) {
    return null;
  }

  const target = impersonation.targetUser || ({} as any);
  const targetRole = String(impersonation.targetRole || 'STUDENT').toUpperCase();
  const targetName = target.name || target.fullName || target.email?.split('@')[0] || 'User';
  const targetSchool =
    targetRole === 'STUDENT' && target.schoolName ? String(target.schoolName) : '';
  const targetClass =
    targetRole === 'STUDENT' ? String(target.class || target.classLevel || '') : '';
  const isSchoolSupport = targetRole === 'SCHOOL' || impersonation.isAuditedSupportSession;

  const handleExit = () => {
    stopImpersonation(navigate, 'MANUAL_EXIT');
  };

  return (
    <div className="relative z-[9999] w-full bg-[#1E293B] text-white px-4 py-2 text-xs shadow-md border-b-2 border-[#B91C1C] flex flex-wrap items-center justify-between gap-3 font-sans">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
        <span className="inline-flex items-center gap-1.5 font-black uppercase text-[10px] tracking-wider shrink-0 text-red-400">
          <ShieldCheck size={13} className="text-red-400" />
          {isSchoolSupport ? 'Audited Admin Support Access' : 'Admin Impersonation Active'}
        </span>

        <span aria-hidden="true" className="hidden sm:inline text-slate-500">·</span>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-200 font-semibold truncate">
          <span className="inline-flex items-center gap-1">
            <User size={12} className="text-slate-400" />
            Viewing as: <strong className="text-white font-black">{targetName}</strong>
          </span>
          <span className="text-slate-400">({targetRole})</span>

          {targetSchool && (
            <span className="hidden md:inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="text-slate-500">·</span>
              <School size={12} className="text-slate-400" />
              <span>{targetSchool}</span>
            </span>
          )}

          {targetClass && (
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="text-slate-500">·</span>
              <GraduationCap size={12} className="text-slate-400" />
              <span>Class: <strong className="text-white">{targetClass}</strong></span>
            </span>
          )}

          {impersonation.reason && (
            <span className="hidden lg:inline-flex items-center gap-1.5 text-slate-300">
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="truncate max-w-[240px]">Reason: {impersonation.reason}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {remainingMs !== null && (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-amber-300 font-bold">
            <Clock size={12} />
            {formatRemaining(remainingMs)} left
          </span>
        )}
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white font-black text-xs shadow-sm transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut size={13} />
          End Support Session
        </button>
      </div>
    </div>
  );
};

export default AdminImpersonationBanner;
