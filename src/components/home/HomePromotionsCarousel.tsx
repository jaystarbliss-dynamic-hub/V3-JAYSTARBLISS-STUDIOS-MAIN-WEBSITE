import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import {
  subscribeActivePublicPromotions,
  resolvePromotionCtaDestination,
  selectPromotionImageUrl,
  type PromotionCampaign,
} from '../../lib/promotions';
import { logBannerDiagnostic } from '../../lib/bannerDiagnostics';

const AUTO_ROTATE_INTERVAL_MS = 6000;

export const HomePromotionsCarousel: React.FC = () => {
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    logBannerDiagnostic('HomePromotionsCarousel', 'mounted', {
      placement: 'HOME_CAROUSEL',
    });
    const unsubscribe = subscribeActivePublicPromotions(
      'HOME_CAROUSEL',
      (list) => {
        setCampaigns(list);
        setActiveIndex((prev) => (list.length > 0 ? prev % list.length : 0));
        setLoading(false);
        logBannerDiagnostic(
          'HomePromotionsCarousel',
          list.length > 0 ? 'campaigns_received' : 'not_rendering_empty',
          {
            count: list.length,
            campaigns: list.map((c) => ({
              id: c.id,
              title: c.title,
              status: c.status,
              desktopImageUrl: c.desktopImageUrl,
              mobileImageUrl: c.mobileImageUrl,
            })),
          },
          list.length > 0 ? 'info' : 'warn'
        );
      },
      (err: any) => {
        logBannerDiagnostic(
          'HomePromotionsCarousel',
          'subscription_error',
          {
            code: err?.code || 'unknown',
            message: err?.message || String(err),
          },
          'error'
        );
        setLoading(false);
      }
    );
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mqViewport = window.matchMedia('(max-width: 767px)');
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncViewport = () => setIsMobile(mqViewport.matches);
    const syncMotion = () => setPrefersReducedMotion(mqMotion.matches);
    syncViewport();
    syncMotion();
    mqViewport.addEventListener?.('change', syncViewport);
    mqMotion.addEventListener?.('change', syncMotion);
    return () => {
      mqViewport.removeEventListener?.('change', syncViewport);
      mqMotion.removeEventListener?.('change', syncMotion);
    };
  }, []);

  useEffect(() => {
    if (campaigns.length <= 1 || isPaused || prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % campaigns.length);
    }, AUTO_ROTATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [campaigns.length, isPaused, prefersReducedMotion]);

  if (loading) {
    return (
      <section aria-label="Featured announcements" className="py-6 sm:py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="h-44 sm:h-56 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
        </div>
      </section>
    );
  }

  if (campaigns.length === 0) {
    return null;
  }

  const safeIndex = activeIndex % campaigns.length;
  const activeCampaign = campaigns[safeIndex];
  const imageSrc = selectPromotionImageUrl(activeCampaign, isMobile);
  const destination = resolvePromotionCtaDestination(activeCampaign);

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + campaigns.length) % campaigns.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % campaigns.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || campaigns.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) handlePrev();
    else handleNext();
  };

  return (
    <section
      aria-label="Promotions and Announcements"
      className="py-6 sm:py-10"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-slate-950 shadow-lg"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Responsive Campaign Banner Artwork */}
          <div className="relative w-full aspect-[3/2] md:aspect-[8/3] max-h-[420px] bg-slate-950 overflow-hidden">
            <img
              src={imageSrc}
              alt={activeCampaign.imageAlt || activeCampaign.title}
              className="w-full h-full object-cover object-center transition-opacity duration-500"
              onLoad={() => {
                logBannerDiagnostic('HomePromotionsCarousel', 'image_loaded', {
                  id: activeCampaign.id,
                  title: activeCampaign.title,
                  imageSrc,
                });
              }}
              onError={() => {
                logBannerDiagnostic(
                  'HomePromotionsCarousel',
                  'image_error',
                  {
                    id: activeCampaign.id,
                    title: activeCampaign.title,
                    imageSrc,
                  },
                  'error'
                );
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent md:bg-gradient-to-r md:from-slate-950/85 md:via-slate-950/40 md:to-transparent" />

            {/* Content & Independent CTA Overlay */}
            <div className="absolute inset-0 flex flex-col justify-end md:justify-center p-5 sm:p-8 lg:p-10">
              <div className="max-w-xl space-y-2 sm:space-y-3">
                <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight drop-shadow-xs">
                  {activeCampaign.title}
                </h2>
                {activeCampaign.subtitle && (
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed line-clamp-2">
                    {activeCampaign.subtitle}
                  </p>
                )}

                {destination && (
                  <div className="pt-1.5">
                    {destination.isExternal ? (
                      <a
                        href={destination.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs sm:text-sm font-bold shadow-md transition-colors"
                      >
                        <span>{activeCampaign.ctaLabel || 'Learn More'}</span>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <Link
                        to={destination.href}
                        className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs sm:text-sm font-bold shadow-md transition-colors"
                      >
                        <span>{activeCampaign.ctaLabel || 'Explore Now'}</span>
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Manual Controls & Slide Indicators (Only when > 1 slide) */}
          {campaigns.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous promotion"
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-slate-950/70 hover:bg-slate-900 text-white border border-white/15 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next promotion"
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-slate-950/70 hover:bg-slate-900 text-white border border-white/15 absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>

              <div
                className="absolute bottom-3 right-4 flex items-center gap-1.5"
                role="tablist"
                aria-label="Select promotion slide"
              >
                {campaigns.map((item, idx) => {
                  const selected = idx === safeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-label={`Slide ${idx + 1}: ${item.title}`}
                      onClick={() => setActiveIndex(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        selected
                          ? 'w-6 bg-[#ef4444]'
                          : 'w-2 bg-white/45 hover:bg-white/75'
                      }`}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default HomePromotionsCarousel;
