import { useEffect, useRef } from 'react';

interface SwipeState {
  startX: number;
  startY: number;
  tracking: boolean;
  mode: 'open' | 'close' | null;
}

function isInteractiveOrHorizontallyScrollable(target: EventTarget | null, mode: 'open' | 'close'): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe="true"]')) {
    return true;
  }

  // When drawer is closed, avoid hijacking horizontal carousels or overflowing tables
  if (mode === 'open') {
    let el: HTMLElement | null = target;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowX = style.overflowX;
      if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 4) {
        return true;
      }
      el = el.parentElement;
    }
  }

  return false;
}

/**
 * Supports natural mobile sidebar gestures:
 * - Swipe right from the left edge (<= 28px) to open the drawer.
 * - Swipe left anywhere while the drawer is open to close it.
 */
export function useEdgeSwipeDrawer(
  isOpen: boolean,
  setIsOpen: (open: boolean) => void,
  maxViewportWidth = 768
) {
  const swipeRef = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    tracking: false,
    mode: null,
  });

  useEffect(() => {
    const EDGE_THRESHOLD_PX = 28;
    const SWIPE_DISTANCE_PX = 52;
    const DIRECTION_RATIO = 1.35;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= maxViewportWidth || e.touches.length !== 1) {
        swipeRef.current.tracking = false;
        return;
      }

      const touch = e.touches[0];
      const mode: 'open' | 'close' = isOpen ? 'close' : 'open';

      if (mode === 'open' && touch.clientX > EDGE_THRESHOLD_PX) {
        swipeRef.current.tracking = false;
        return;
      }

      if (isInteractiveOrHorizontallyScrollable(e.target, mode)) {
        swipeRef.current.tracking = false;
        return;
      }

      swipeRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        tracking: true,
        mode,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!swipeRef.current.tracking || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - swipeRef.current.startX;
      const deltaY = touch.clientY - swipeRef.current.startY;

      // Cancel gesture immediately if vertical movement dominates
      if (Math.abs(deltaY) > 24 && Math.abs(deltaY) > Math.abs(deltaX)) {
        swipeRef.current.tracking = false;
        return;
      }

      if (
        swipeRef.current.mode === 'open' &&
        deltaX >= SWIPE_DISTANCE_PX &&
        Math.abs(deltaX) > Math.abs(deltaY) * DIRECTION_RATIO
      ) {
        swipeRef.current.tracking = false;
        setIsOpen(true);
      } else if (
        swipeRef.current.mode === 'close' &&
        deltaX <= -SWIPE_DISTANCE_PX &&
        Math.abs(deltaX) > Math.abs(deltaY) * DIRECTION_RATIO
      ) {
        swipeRef.current.tracking = false;
        setIsOpen(false);
      }
    };

    const handleTouchEnd = () => {
      swipeRef.current.tracking = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isOpen, setIsOpen, maxViewportWidth]);
}
export default useEdgeSwipeDrawer;
