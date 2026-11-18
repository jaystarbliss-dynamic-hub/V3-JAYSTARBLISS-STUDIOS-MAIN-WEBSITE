import React, { useEffect, useId, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, LogOut, School, GraduationCap, User } from 'lucide-react';
import { getActiveImpersonation, stopImpersonation } from '../../utils/impersonation';

let activeBannerOwner: string | null = null;

export const AdminImpersonationBanner: React.FC = () => {
  const instanceId = useId();
  const [ownsBanner, setOwnsBanner] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [impersonation, setImpersonation] = useState<any>(null);

  useEffect(() => {
    // Only one instance may render globally; nested portal/admin shells can otherwise
    // mount the shared banner twice and create duplicate full-width bars.
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
    };

    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, [location.pathname]);

  if (!ownsBanner || !impersonation) {
    return null;
  }

  const target = impersonation.targetUser || {};
  const targetRole = String(impersonation.targetRole || 'STUDENT').toUpperCase();
  const targetName = target.name || target.fullName || target.email?.split('@')[0] || 'User';
  const targetSchool = target.schoolName || sessionStorage.getItem('studentSchoolName') || '';
  const targetClass = target.class || target.classLevel || sessionStorage.getItem('studentClass') || '';

  const handleExit = () => {
    stopImpersonation(navigate);
  };

  return (
    <div className="relative z-[9999] w-full bg-[#1E293B] text-white px-4 py-2 text-xs shadow-md border-b-2 border-[#B91C1C] flex flex-wrap items-center justify-between gap-3 font-sans">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
        <span className="inline-flex items-center gap-1.5 font-black uppercase text-[10px] tracking-wider shrink-0 text-red-400">
          <ShieldCheck size={13} className="text-red-400" />
          Admin Impersonation Active
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
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white font-black text-xs shadow-sm transition-colors cursor-pointer"
        >
          <LogOut size={13} />
          Exit &amp; Return to Admin
        </button>
      </div>
    </div>
  );
};

export default AdminImpersonationBanner;
