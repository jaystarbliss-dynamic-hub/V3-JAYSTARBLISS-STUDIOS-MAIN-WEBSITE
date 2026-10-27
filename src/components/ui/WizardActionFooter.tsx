import React from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';

export interface WizardActionFooterProps {
  currentStep?: number;
  totalSteps?: number;
  stepLabel?: string;
  isFirstStep?: boolean;
  isLastStep?: boolean;
  canProceed?: boolean;
  disabledReason?: string;
  isSubmitting?: boolean;
  primaryLabel?: string;
  secondaryLabel?: string;
  cancelLabel?: string;
  primaryIcon?: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onCancel?: () => void;
  className?: string;
  stickyMobile?: boolean;
}

export const WizardActionFooter: React.FC<WizardActionFooterProps> = ({
  currentStep,
  totalSteps,
  stepLabel,
  isFirstStep = false,
  isLastStep = false,
  canProceed = true,
  disabledReason,
  isSubmitting = false,
  primaryLabel,
  secondaryLabel = 'Back',
  cancelLabel,
  primaryIcon,
  onNext,
  onBack,
  onCancel,
  className = '',
  stickyMobile = false,
}) => {
  const resolvedPrimaryLabel =
    primaryLabel || (isLastStep ? 'Complete & Save' : 'Continue');

  const resolvedPrimaryIcon =
    primaryIcon !== undefined ? (
      primaryIcon
    ) : isLastStep ? (
      <Check size={16} />
    ) : (
      <ArrowRight size={16} />
    );

  const containerClasses = [
    'mt-8 border-t border-slate-200/80 dark:border-slate-800 pt-5',
    'flex flex-col-reverse sm:flex-row items-center justify-between gap-3',
    stickyMobile
      ? 'sticky bottom-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-safe p-3 sm:p-0 sm:bg-transparent sm:dark:bg-transparent shadow-lg sm:shadow-none'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses}>
      {/* Left Area: Back & Cancel Actions */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
        {!isFirstStep && onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>{secondaryLabel}</span>
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <X size={14} />
            <span>{cancelLabel || 'Cancel'}</span>
          </button>
        )}
      </div>

      {/* Center Area: Step Indicator (when provided) */}
      {totalSteps && totalSteps > 1 && (
        <div className="text-center sm:text-left order-first sm:order-none py-1">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {stepLabel ? `${stepLabel} · ` : ''}Step{' '}
            <span className="text-slate-900 dark:text-white font-black">
              {currentStep || 1}
            </span>{' '}
            of {totalSteps}
          </p>
        </div>
      )}

      {/* Right Area: Primary Action with disabled explanation & duplicate prevention */}
      <div className="relative w-full sm:w-auto flex flex-col items-stretch sm:items-end">
        <button
          type={onNext ? 'button' : 'submit'}
          onClick={onNext}
          disabled={!canProceed || isSubmitting}
          title={!canProceed && disabledReason ? disabledReason : undefined}
          aria-disabled={!canProceed || isSubmitting}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-red px-6 py-2.5 text-sm font-black text-white hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin shrink-0" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <span>{resolvedPrimaryLabel}</span>
              {resolvedPrimaryIcon}
            </>
          )}
        </button>

        {!canProceed && disabledReason && (
          <span className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 text-center sm:text-right">
            {disabledReason}
          </span>
        )}
      </div>
    </div>
  );
};

export default WizardActionFooter;
