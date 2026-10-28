import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AlertTriangle, X, Radio, ArrowRight, ShieldAlert, Info, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface BannerConfig {
  enabled: boolean;
  message: string;
  badgeText?: string;
  variant?: 'warning' | 'maintenance' | 'info' | 'emerald' | 'crimson';
  speed?: 'slow' | 'normal' | 'fast';
  linkUrl?: string;
  linkLabel?: string;
  showDismiss?: boolean;
}

const DEFAULT_BANNER: BannerConfig = {
  enabled: true,
  message: '⚡ Live System Notice: The website is currently undergoing active maintenance and progressive feature rollouts. Some modules, links, and resources may be dynamically updated in real-time. Thank you for learning and building with Jaystarbliss Studios!',
  badgeText: 'SYSTEM NOTICE',
  variant: 'maintenance',
  speed: 'normal',
  linkUrl: '/portal',
  linkLabel: 'Access Portal',
  showDismiss: true
};

export const MarqueeBanner: React.FC = () => {
  const [config, setConfig] = useState<BannerConfig>(DEFAULT_BANNER);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const CACHE_KEY = 'jaystar_banner_cache_v1';
    const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data && Date.now() - Number(parsed.ts || 0) < CACHE_TTL_MS) {
          setConfig(prev => ({ ...prev, ...parsed.data }));
          return;
        }
      }
    } catch {
      // Ignore storage parse issues
    }

    const bannerRef = doc(db, 'settings', 'banner');
    getDoc(bannerRef)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as BannerConfig;
          setConfig(prev => ({ ...prev, ...data }));
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
          } catch {
            // Ignore quota errors
          }
        }
      })
      .catch(() => {
        // Fallback silently to DEFAULT_BANNER when offline or when free read quota is reached
      });
  }, []);

  if (!config.enabled || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  const variantStyles = {
    warning: {
      bg: 'bg-amber-950/70 dark:bg-amber-950/80 text-amber-200 border-amber-400/30 shadow-[0_-10px_35px_rgba(245,158,11,0.15)]',
      icon: <AlertTriangle size={13} className="text-amber-400 shrink-0" />
    },
    maintenance: {
      bg: 'bg-slate-950/75 dark:bg-slate-950/85 text-slate-100 border-white/15 dark:border-white/10 shadow-[0_-10px_35px_rgba(0,0,0,0.4)]',
      icon: <Radio size={13} className="text-brand-red animate-pulse shrink-0" />
    },
    crimson: {
      bg: 'bg-red-950/75 dark:bg-red-950/85 text-red-100 border-red-500/30 shadow-[0_-10px_35px_rgba(220,38,38,0.2)]',
      icon: <ShieldAlert size={13} className="text-red-300 shrink-0" />
    },
    info: {
      bg: 'bg-slate-900/75 dark:bg-slate-950/85 text-sky-100 border-sky-400/25 shadow-[0_-10px_35px_rgba(14,165,233,0.15)]',
      icon: <Info size={13} className="text-sky-400 shrink-0" />
    },
    emerald: {
      bg: 'bg-emerald-950/75 dark:bg-emerald-950/85 text-emerald-100 border-emerald-400/25 shadow-[0_-10px_35px_rgba(16,185,129,0.15)]',
      icon: <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
    }
  };

  const currentVariant = variantStyles[config.variant || 'maintenance'] || variantStyles.maintenance;
  const speedDuration = config.speed === 'slow' ? '45s' : config.speed === 'fast' ? '20s' : '32s';

  return (
    <aside
      id="global-sticky-marquee-banner"
      aria-label="System Announcement Banner"
      className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t py-1.5 px-3 sm:px-4 flex items-center justify-between text-xs transition-all ${currentVariant.bg}`}
      style={{
        boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center gap-2.5 w-full overflow-hidden mr-2">
        <div className="relative flex-1 overflow-hidden h-5 flex items-center select-none">
          <div
            className="flex items-center whitespace-nowrap gap-12 font-medium text-[11px] sm:text-xs text-white/90 drop-shadow-xs"
            style={{
              animation: `marqueeScroll ${speedDuration} linear infinite`,
              animationPlayState: isPaused ? 'paused' : 'running',
              willChange: 'transform'
            }}
          >
            <span className="flex items-center gap-1.5">
              {currentVariant.icon}
              {config.message}
            </span>
            <span className="opacity-30 text-[9px]">• • •</span>
            <span className="flex items-center gap-1.5">
              {currentVariant.icon}
              {config.message}
            </span>
            <span className="opacity-30 text-[9px]">• • •</span>
            <span className="flex items-center gap-1.5">
              {currentVariant.icon}
              {config.message}
            </span>
          </div>
        </div>

        {config.linkUrl && (
          <Link
            to={config.linkUrl}
            className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all shrink-0 backdrop-blur-md shadow-xs"
          >
            <span>{config.linkLabel || 'Access'}</span>
            <ArrowRight size={11} />
          </Link>
        )}
      </div>

      {config.showDismiss !== false && (
        <button
          id="dismiss-marquee-banner-btn"
          onClick={handleDismiss}
          className="p-1 rounded-lg hover:bg-white/15 text-white/70 hover:text-white transition-colors shrink-0 ml-1"
          aria-label="Dismiss banner"
          title="Dismiss banner"
        >
          <X size={13} />
        </button>
      )}

      <style>{`
        @keyframes marqueeScroll {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </aside>
  );
};

export default MarqueeBanner;
