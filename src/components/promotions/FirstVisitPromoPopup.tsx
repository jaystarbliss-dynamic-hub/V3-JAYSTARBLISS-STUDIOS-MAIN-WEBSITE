import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, ArrowRight, ExternalLink } from 'lucide-react';
import {
  subscribeActivePublicPromotions,
  getBrowserPopupStorage,
  isPopupBlockedRoute,
  recordPopupSeen,
  resolvePromotionCtaDestination,
  selectPromotionImageUrl,
  shouldDisplayPopupCampaign,
  type PromotionCampaign,
} from '../../lib/promotions';
import {
  evaluatePopupDisplayStatus,
  logBannerDiagnostic,
} from '../../lib/bannerDiagnostics';

export const FirstVisitPromoPopup: React.FC<{ disabled?: boolean }> = ({
  disabled = false,
}) => {
  const location = useLocation();
  const [campaign, setCampaign] = useState<PromotionCampaign | null>(null);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const scheduledCampaignIdRef = useRef<string | null>(null);

  const blockedRoute = disabled || isPopupBlockedRoute(location.pathname);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (blockedRoute) {
      logBannerDiagnostic('FirstVisitPromoPopup', 'route_blocked', {
        pathname: location.pathname,
        disabled,
      });
      setVisible(false);
      scheduledCampaignIdRef.current = null;
      return;
    }

    let cancelled = false;
    let delayTimer: number | null = null;
    const storage = getBrowserPopupStorage();

    logBannerDiagnostic('FirstVisitPromoPopup', 'subscribed', {
      pathname: location.pathname,
      placement: 'FIRST_VISIT_POPUP',
    });

    const unsubscribe = subscribeActivePublicPromotions(
      'FIRST_VISIT_POPUP',
      (list) => {
        if (cancelled) return;
        const nowMs = Date.now();
        const evaluations = list.map((item) =>
          evaluatePopupDisplayStatus(item, storage, nowMs)
        );
        const eligible = list.find((item) =>
          shouldDisplayPopupCampaign(item, storage, nowMs)
        );

        logBannerDiagnostic(
          'FirstVisitPromoPopup',
          eligible ? 'campaign_eligible' : 'no_eligible_popup',
          {
            pathname: location.pathname,
            receivedCount: list.length,
            selectedId: eligible?.id || null,
            evaluations,
          },
          eligible ? 'info' : 'warn'
        );

        if (!eligible) return;
        if (scheduledCampaignIdRef.current === eligible.id) return;

        scheduledCampaignIdRef.current = eligible.id;
        setCampaign(eligible);

        if (delayTimer !== null) {
          window.clearTimeout(delayTimer);
        }
        const delayMs = Math.max(0, Number(eligible.popupDelayMs) || 2200);
        logBannerDiagnostic('FirstVisitPromoPopup', 'timer_scheduled', {
          id: eligible.id,
          title: eligible.title,
          delayMs,
        });

        delayTimer = window.setTimeout(() => {
          if (cancelled) return;
          recordPopupSeen(eligible, storage, Date.now());
          setVisible(true);
          logBannerDiagnostic('FirstVisitPromoPopup', 'rendered', {
            id: eligible.id,
            title: eligible.title,
            frequency: eligible.popupFrequency || 'ONCE_PER_BROWSER',
          });
        }, delayMs);
      },
      (err: any) => {
        logBannerDiagnostic(
          'FirstVisitPromoPopup',
          'subscription_error',
          {
            pathname: location.pathname,
            code: err?.code || 'unknown',
            message: err?.message || String(err),
          },
          'error'
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
      if (delayTimer !== null) window.clearTimeout(delayTimer);
      scheduledCampaignIdRef.current = null;
    };
  }, [blockedRoute, disabled, location.pathname]);

  useEffect(() => {
    if (!visible) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const handleClose = () => {
    if (campaign) {
      recordPopupSeen(campaign, getBrowserPopupStorage(), Date.now());
    }
    setVisible(false);
  };

  if (!visible || !campaign || blockedRoute) {
    return null;
  }

  const imageSrc = selectPromotionImageUrl(campaign, isMobile);
  const destination = resolvePromotionCtaDestination(campaign);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-popup-title"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={handleClose}
          aria-label="Close announcement"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-slate-950/80 hover:bg-slate-900 text-white flex items-center justify-center border border-white/20 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {imageSrc && (
          <div className="w-full aspect-[3/2] bg-slate-900 overflow-hidden">
            <img
              src={imageSrc}
              alt={campaign.imageAlt || campaign.title}
              className="w-full h-full object-cover"
              onError={() => {
                logBannerDiagnostic(
                  'FirstVisitPromoPopup',
                  'image_error',
                  {
                    id: campaign.id,
                    title: campaign.title,
                    imageSrc,
                  },
                  'error'
                );
              }}
            />
          </div>
        )}

        <div className="p-5 sm:p-6 space-y-3">
          <h2
            id="promo-popup-title"
            className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight"
          >
            {campaign.title}
          </h2>
          {campaign.subtitle && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {campaign.subtitle}
            </p>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Dismiss
            </button>
            {destination &&
              (destination.isExternal ? (
                <a
                  href={destination.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleClose}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-bold transition-colors"
                >
                  <span>{campaign.ctaLabel || 'Learn More'}</span>
                  <ExternalLink size={13} />
                </a>
              ) : (
                <Link
                  to={destination.href}
                  onClick={handleClose}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-bold transition-colors"
                >
                  <span>{campaign.ctaLabel || 'Explore Now'}</span>
                  <ArrowRight size={13} />
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstVisitPromoPopup;
