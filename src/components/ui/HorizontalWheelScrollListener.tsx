import React, { useEffect } from 'react';

function findHorizontalScrollContainer(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;

  let current: HTMLElement | null = target;
  while (current && current !== document.body && current !== document.documentElement) {
    if (current.hasAttribute('data-custom-wheel-carousel')) {
      return null;
    }

    const canScrollHorizontally = current.scrollWidth > current.clientWidth + 2;
    if (canScrollHorizontally) {
      const style = window.getComputedStyle(current);
      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      const isHorizontalScrollable =
        overflowX === 'auto' ||
        overflowX === 'scroll' ||
        current.classList.contains('no-scrollbar') ||
        current.classList.contains('snap-x') ||
        current.getAttribute('role') === 'tablist' ||
        current.getAttribute('role') === 'region';

      const isVerticalScrollContainer =
        (overflowY === 'auto' || overflowY === 'scroll') &&
        current.scrollHeight > current.clientHeight + 12;

      if (isHorizontalScrollable && !isVerticalScrollContainer) {
        return current;
      }
    }

    current = current.parentElement;
  }

  return null;
}

const HorizontalWheelScrollListener: React.FC = () => {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || Math.abs(e.deltaY) < 2) return;

      const container = findHorizontalScrollContainer(e.target);
      if (!container) return;

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 2) return;

      const canScrollLeft = container.scrollLeft > 1;
      const canScrollRight = container.scrollLeft < maxScrollLeft - 1;

      if ((e.deltaY < 0 && canScrollLeft) || (e.deltaY > 0 && canScrollRight)) {
        e.preventDefault();
        const deltaPx = e.deltaMode === 1 ? e.deltaY * 36 : e.deltaY;
        container.scrollLeft += deltaPx;
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return null;
};

export default HorizontalWheelScrollListener;
