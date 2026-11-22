import React, { useState } from 'react';
import portalAbstractBanner from '../../assets/images/portal_abstract_banner_1795284961979.jpg';

export type PortalBannerRole = 'student' | 'parent' | 'school' | 'staff';

/**
 * Scaled-down, responsive button class presets designed to sit cleanly
 * on top of the slim abstract PortalHeroBanner without crowding or overflow.
 */
export const PORTAL_BANNER_BTN_PRIMARY =
  'no-mobile-scale inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white border border-red-400/25 text-[11px] sm:text-xs font-semibold leading-tight shadow-xs transition-colors cursor-pointer whitespace-nowrap';

export const PORTAL_BANNER_BTN_LIGHT =
  'no-mobile-scale inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-[#0F172A] border border-white/80 text-[11px] sm:text-xs font-semibold leading-tight shadow-xs transition-colors cursor-pointer whitespace-nowrap';

export const PORTAL_BANNER_BTN_GLASS =
  'no-mobile-scale inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/12 hover:bg-white/22 text-white border border-white/25 backdrop-blur-xs text-[11px] sm:text-xs font-semibold leading-tight shadow-xs transition-colors cursor-pointer whitespace-nowrap';

interface PortalHeroBannerProps {
  title: string;
  role?: PortalBannerRole | string;
  actions?: React.ReactNode;
  className?: string;
}

export const PortalHeroBanner: React.FC<PortalHeroBannerProps> = ({
  title,
  role = 'portal',
  actions,
  className = '',
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <header
      aria-label={`${String(role)} portal header`}
      className={`relative w-full min-h-[82px] sm:min-h-[96px] rounded-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 bg-gradient-to-r from-[#071020] via-[#102344] to-[#16305A] shadow-xs ${className}`}
    >
      {/* Abstract Geometric Educational-Technology Artwork */}
      {!imageFailed && (
        <img
          src={portalAbstractBanner}
          alt=""
          aria-hidden="true"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
        />
      )}

      {/* Subtle architectural grid fallback if image fails to load */}
      {imageFailed && (
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      )}

      {/* Contrast scrim ensuring crisp white title and button legibility */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[#060D1A]/90 via-[#0C1D3B]/65 to-[#060D1A]/55 pointer-events-none"
      />

      {/* Foreground Row: Crisp White User/School Title + Scaled Action Buttons */}
      <div className="relative z-10 min-h-[82px] sm:min-h-[96px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 md:px-7 py-3.5 sm:py-4">
        <h1 className="text-base sm:text-xl md:text-[22px] font-bold tracking-tight text-white leading-snug drop-shadow-xs min-w-0 break-words">
          {title}
        </h1>

        {actions && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};

export default PortalHeroBanner;
