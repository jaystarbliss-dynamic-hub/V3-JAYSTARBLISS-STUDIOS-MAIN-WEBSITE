import React from 'react';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';

export interface StepItem {
  id: string | number;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

export interface ProgressStepperProps {
  steps: StepItem[];
  currentStep: number; // 0-based index
  onStepClick?: (stepIndex: number) => void;
  allowStepClick?: boolean;
  className?: string;
}

export const ProgressStepper: React.FC<ProgressStepperProps> = ({
  steps,
  currentStep,
  onStepClick,
  allowStepClick = false,
  className = '',
}) => {
  const progressPercent = Math.round((currentStep / Math.max(1, steps.length - 1)) * 100);

  return (
    <nav aria-label="Progress" className={`w-full ${className}`}>
      {/* Mobile Compact Progress Bar */}
      <div className="md:hidden mb-6">
        <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">
          <span className="uppercase tracking-wider text-[#B91C1C] dark:text-red-400 font-black tabular-nums">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-slate-900 dark:text-white font-extrabold truncate max-w-[200px]">
            {steps[currentStep]?.title}
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
          <motion.div
            className="bg-[#B91C1C] h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Desktop & Tablet Full Progress Stepper */}
      <ol className="hidden md:flex items-center justify-between w-full relative">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isClickable = allowStepClick && (isCompleted || onStepClick !== undefined);
          const Icon = step.icon;

          return (
            <li
              key={step.id}
              className={`relative flex-1 ${idx === steps.length - 1 ? 'flex-none' : ''}`}
            >
              <div className="flex items-center group">
                {/* Step Circle Button */}
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick?.(idx)}
                  className={`relative flex items-center justify-center w-11 h-11 rounded-2xl font-bold text-sm transition-all duration-300 z-10 select-none tabular-nums ${
                    isClickable ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#B91C1C] focus:ring-offset-2' : 'cursor-default'
                  } ${
                    isCompleted
                      ? 'bg-[#1E293B] dark:bg-white text-white dark:text-[#1E293B] shadow-md hover:bg-[#0F172A]'
                      : isCurrent
                      ? 'bg-[#B91C1C] text-white ring-4 ring-[#B91C1C]/20 shadow-lg'
                      : 'bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                  }`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check size={18} className="stroke-[3]" />
                  ) : Icon ? (
                    <Icon size={18} />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </button>

                {/* Connecting Line between steps */}
                {idx < steps.length - 1 && (
                  <div className="flex-1 mx-3 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden relative">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-[#1E293B] dark:bg-white h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: isCompleted ? '100%' : '0%' }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}
              </div>

              {/* Step Title and Subtitle */}
              <div className="mt-3 text-left max-w-[140px]">
                <div
                  className={`text-xs font-black uppercase tracking-wider transition-colors tabular-nums ${
                    isCurrent
                      ? 'text-[#B91C1C] dark:text-red-400'
                      : isCompleted
                      ? 'text-[#1E293B] dark:text-white'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  Step {idx + 1}
                </div>
                <div
                  className={`text-sm font-bold truncate leading-tight mt-0.5 ${
                    isCurrent
                      ? 'text-slate-900 dark:text-white font-extrabold'
                      : isCompleted
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                  title={step.title}
                >
                  {step.title}
                </div>
                {step.subtitle && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {step.subtitle}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default ProgressStepper;
