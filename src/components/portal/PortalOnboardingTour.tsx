import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, X } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import {
  buildPortalTourSteps,
  getLocalTourStorageKey,
  PORTAL_TOUR_VERSION,
  type PortalTourRole,
  shouldShowPortalTour,
} from '../../lib/portalTour';

interface PortalOnboardingTourProps {
  role: PortalTourRole;
  studentOriginType?: 'individual' | 'school' | 'parent';
  canAccessStudentBilling?: boolean;
  isImpersonating?: boolean;
  forceOpenToken?: number;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PortalOnboardingTour: React.FC<PortalOnboardingTourProps> = ({
  role,
  studentOriginType = 'individual',
  canAccessStudentBilling = false,
  isImpersonating = false,
  forceOpenToken = 0,
}) => {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  const steps = useMemo(
    () =>
      buildPortalTourSteps({
        role,
        studentOriginType,
        canAccessStudentBilling,
      }),
    [role, studentOriginType, canAccessStudentBilling]
  );

  const activeStep = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', onMq);

    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => {
      mq.removeEventListener?.('change', onMq);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Determine first-login visibility from users/{uid} + localStorage fallback
  useEffect(() => {
    if (isImpersonating) {
      setOpen(false);
      return;
    }
    const uid = auth.currentUser?.uid || sessionStorage.getItem('userId') || '';
    if (!uid) return;

    let cancelled = false;
    const storageKey = getLocalTourStorageKey(uid, role);
    const localVer = (() => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    })();

    if (localVer === PORTAL_TOUR_VERSION) {
      return;
    }

    const checkUserDoc = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (cancelled) return;
        const userDoc = snap.exists() ? (snap.data() as Record<string, any>) : null;
        if (
          shouldShowPortalTour({
            userDoc,
            localCompletedVersion: localVer,
            isImpersonating,
          })
        ) {
          setStepIndex(0);
          setOpen(true);
        } else if (userDoc?.portalTourVersion === PORTAL_TOUR_VERSION) {
          try {
            localStorage.setItem(storageKey, PORTAL_TOUR_VERSION);
          } catch {
            // ignore storage errors
          }
        }
      } catch {
        // Silent fallback: don't block portal rendering on network hiccup
      }
    };

    const timer = window.setTimeout(() => {
      void checkUserDoc();
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [role, isImpersonating]);

  // Allow explicit replay from profile menu
  useEffect(() => {
    if (forceOpenToken > 0 && !isImpersonating) {
      setStepIndex(0);
      setOpen(true);
    }
  }, [forceOpenToken, isImpersonating]);

  const persistCompletion = useCallback(async () => {
    const uid = auth.currentUser?.uid || sessionStorage.getItem('userId') || '';
    if (!uid) return;
    const storageKey = getLocalTourStorageKey(uid, role);
    try {
      localStorage.setItem(storageKey, PORTAL_TOUR_VERSION);
    } catch {
      // ignore storage errors
    }
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          portalTourVersion: PORTAL_TOUR_VERSION,
          portalTourCompletedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // localStorage already recorded completion so user isn't re-prompted
    }
  }, [role]);

  const handleClose = useCallback(() => {
    setOpen(false);
    void persistCompletion();
  }, [persistCompletion]);

  const handleNext = useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      handleClose();
    } else {
      setStepIndex((prev) => prev + 1);
    }
  }, [stepIndex, steps.length, handleClose]);

  const handleBack = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Locate target anchor element for desktop popover positioning
  const updateTargetPosition = useCallback(() => {
    if (!open || !activeStep || isMobile) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour-id="${activeStep.targetId}"]`) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }
    el.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setTargetRect(null);
      return;
    }
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [open, activeStep, isMobile, reducedMotion]);

  useEffect(() => {
    updateTargetPosition();
    if (!open) return;
    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition, true);
    const raf = window.setTimeout(updateTargetPosition, 120);
    return () => {
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition, true);
      window.clearTimeout(raf);
    };
  }, [open, stepIndex, updateTargetPosition]);

  // Keyboard navigation + initial focus
  useEffect(() => {
    if (!open) return;
    primaryBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose, handleNext, handleBack]);

  if (!open || !activeStep) return null;

  const isLastStep = stepIndex === steps.length - 1;

  // Compute safe desktop card coordinates clamped within viewport
  const desktopCardStyle = (() => {
    if (isMobile || typeof window === 'undefined') return undefined;
    const cardW = 352;
    const cardH = 230;
    const pad = 16;
    if (!targetRect) {
      return {
        top: Math.max(pad, Math.round((window.innerHeight - cardH) / 2)),
        left: Math.max(pad, Math.round((window.innerWidth - cardW) / 2)),
      };
    }

    const preferRight = targetRect.left + targetRect.width + 18 + cardW <= window.innerWidth - pad;
    const left = preferRight
      ? targetRect.left + targetRect.width + 18
      : Math.max(pad, Math.min(window.innerWidth - cardW - pad, targetRect.left - cardW - 18));

    const top = Math.max(
      pad,
      Math.min(window.innerHeight - cardH - pad, targetRect.top - 8)
    );

    return { top, left };
  })();

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-tour-title"
      aria-describedby="portal-tour-body"
    >
      {/* Backdrop scrim */}
      <div
        className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      {/* Desktop spotlight highlight ring around target element */}
      {!isMobile && targetRect && (
        <div
          aria-hidden="true"
          className={`fixed pointer-events-none rounded-xl ring-2 ring-[#B91C1C] ring-offset-2 ring-offset-white dark:ring-offset-slate-900 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] ${
            reducedMotion ? '' : 'transition-all duration-200'
          }`}
          style={{
            top: Math.max(4, targetRect.top - 4),
            left: Math.max(4, targetRect.left - 4),
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Desktop anchored popover OR mobile pinned bottom sheet */}
      <div
        style={isMobile ? undefined : desktopCardStyle}
        className={
          isMobile
            ? 'fixed inset-x-3 bottom-3 z-[71] max-h-[82vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#14284B] border border-slate-200 dark:border-slate-700 shadow-2xl p-5'
            : `fixed z-[71] w-[352px] max-w-[calc(100vw-32px)] rounded-2xl bg-white dark:bg-[#14284B] border border-slate-200 dark:border-slate-700 shadow-2xl p-5 ${
                reducedMotion ? '' : 'transition-all duration-200'
              }`
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#B91C1C] dark:text-red-400">
            <Compass size={14} />
            <span>
              Portal Guide • {stepIndex + 1} of {steps.length}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Skip portal tutorial"
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <h2
          id="portal-tour-title"
          className="mt-2.5 text-base font-black text-[#14284B] dark:text-white tracking-tight"
        >
          {activeStep.title}
        </h2>
        <p
          id="portal-tour-body"
          className="mt-1.5 text-xs sm:text-[13px] leading-relaxed text-slate-600 dark:text-slate-300"
        >
          {activeStep.body}
        </p>

        {/* Progress segments */}
        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((s, idx) => (
            <span
              key={s.id}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                idx <= stepIndex
                  ? 'bg-[#B91C1C]'
                  : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Footer controls */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-2 py-1.5 rounded-lg cursor-pointer"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#14284B] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <ArrowLeft size={13} />
                Back
              </button>
            )}
            <button
              ref={primaryBtnRef}
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 size={14} />
                  Finish
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalOnboardingTour;
