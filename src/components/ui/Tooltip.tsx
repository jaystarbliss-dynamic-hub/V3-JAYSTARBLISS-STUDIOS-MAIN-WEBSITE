import React, { useState, useRef, useId, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: TooltipPlacement;
  delay?: number;
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  placement = 'top',
  delay = 180,
  disabled = false,
  className = '',
  fullWidth = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowPlacement: TooltipPlacement }>({
    top: 0,
    left: 0,
    arrowPlacement: placement
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const updateCoordinates = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    let top = 0;
    let left = 0;
    let computedPlacement = placement;

    // Safety offset distance
    const gap = 8;

    switch (placement) {
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + gap;
        // Overflow check right screen edge
        if (left + 220 > window.innerWidth) {
          computedPlacement = 'left';
          left = rect.left - gap;
        }
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - gap;
        if (left - 200 < 0) {
          computedPlacement = 'right';
          left = rect.right + gap;
        }
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2;
        break;
      case 'top':
      default:
        top = rect.top - gap;
        left = rect.left + rect.width / 2;
        break;
    }

    setCoords({
      top: top,
      left: left,
      arrowPlacement: computedPlacement
    });
  }, [placement]);

  const showTooltip = () => {
    if (disabled || !content) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    updateCoordinates();
    timeoutRef.current = setTimeout(() => {
      updateCoordinates();
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Clone child to inject event handlers and accessibility attributes
  const child = React.isValidElement(children) ? children : <span>{children}</span>;
  const trigger = React.cloneElement(child, {
    'aria-describedby': isVisible && !disabled ? tooltipId : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      child.props.onMouseEnter?.(e);
      showTooltip();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      child.props.onMouseLeave?.(e);
      hideTooltip();
    },
    onFocus: (e: React.FocusEvent) => {
      child.props.onFocus?.(e);
      showTooltip();
    },
    onBlur: (e: React.FocusEvent) => {
      child.props.onBlur?.(e);
      hideTooltip();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      child.props.onKeyDown?.(e);
      if (e.key === 'Escape') hideTooltip();
    },
  });

  const getTransformClass = () => {
    switch (coords.arrowPlacement) {
      case 'right':
        return '-translate-y-1/2';
      case 'left':
        return '-translate-x-full -translate-y-1/2';
      case 'bottom':
        return '-translate-x-1/2';
      case 'top':
      default:
        return '-translate-x-1/2 -translate-y-full';
    }
  };

  const getArrowClasses = () => {
    switch (coords.arrowPlacement) {
      case 'bottom':
        return '-top-1 left-1/2 -translate-x-1/2 border-b-slate-900 dark:border-b-slate-800 border-l-transparent border-r-transparent border-t-transparent';
      case 'left':
        return '-right-1 top-1/2 -translate-y-1/2 border-l-slate-900 dark:border-l-slate-800 border-t-transparent border-b-transparent border-r-transparent';
      case 'right':
        return '-left-1 top-1/2 -translate-y-1/2 border-r-slate-900 dark:border-r-slate-800 border-t-transparent border-b-transparent border-l-transparent';
      case 'top':
      default:
        return '-bottom-1 left-1/2 -translate-x-1/2 border-t-slate-900 dark:border-t-slate-800 border-l-transparent border-r-transparent border-b-transparent';
    }
  };

  return (
    <div ref={containerRef} className={`relative ${fullWidth ? 'flex w-full' : 'inline-flex'} items-center ${className}`}>
      {trigger}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isVisible && !disabled && content && (
            <motion.div
              id={tooltipId}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                zIndex: 999999,
              }}
              className={`px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-950 dark:bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl shadow-black/40 whitespace-nowrap pointer-events-none ${getTransformClass()}`}
            >
              {content}
              <div className={`absolute w-0 h-0 border-4 ${getArrowClasses()}`} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default Tooltip;
