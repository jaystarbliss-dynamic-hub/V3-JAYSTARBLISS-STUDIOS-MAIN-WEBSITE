import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, AlertTriangle } from 'lucide-react';

export interface RowActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  confirmDanger?: boolean;
  confirmLabel?: string;
  disabled?: boolean;
  hidden?: boolean;
  dividerBefore?: boolean;
}

interface MenuCoords {
  x: number;
  y: number;
  alignRight?: boolean;
}

export interface RowContextMenuPayload<T = any> extends MenuCoords {
  data: T;
}

export interface RowContextMenuState<T = any> {
  isOpen: boolean;
  coords: MenuCoords | null;
  state: RowContextMenuPayload<T> | null;
  openFromEvent: (e: React.MouseEvent, data?: T) => void;
  openFromElement: (el: HTMLElement, data?: T) => void;
  openFromContextMenu: (e: React.MouseEvent, data: T) => void;
  openFromButton: (e: React.MouseEvent<HTMLElement>, data: T) => void;
  getTouchHandlers: (data: T) => {
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => void;
    onTouchMove: () => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
  close: () => void;
}

export function useRowActionMenu<T = any>(): RowContextMenuState<T> {
  const [payload, setPayload] = useState<RowContextMenuPayload<T> | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearLongPress();
  }, [clearLongPress]);

  const openFromEvent = useCallback((e: React.MouseEvent, data?: T) => {
    e.preventDefault();
    e.stopPropagation();
    setPayload({ x: e.clientX, y: e.clientY, alignRight: false, data: data as T });
  }, []);

  const openFromElement = useCallback((el: HTMLElement, data?: T) => {
    const rect = el.getBoundingClientRect();
    setPayload({ x: rect.right, y: rect.bottom + 6, alignRight: true, data: data as T });
  }, []);

  const openFromContextMenu = useCallback((e: React.MouseEvent, data: T) => {
    e.preventDefault();
    e.stopPropagation();
    setPayload({ x: e.clientX, y: e.clientY, alignRight: false, data });
  }, []);

  const openFromButton = useCallback((e: React.MouseEvent<HTMLElement>, data: T) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPayload({ x: rect.right, y: rect.bottom + 6, alignRight: true, data });
  }, []);

  const getTouchHandlers = useCallback(
    (data: T) => ({
      onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
        clearLongPress();
        const touch = e.touches?.[0];
        if (!touch) return;
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        longPressTimerRef.current = window.setTimeout(() => {
          setPayload({ x: clientX, y: clientY, alignRight: false, data });
          longPressTimerRef.current = null;
        }, 480);
      },
      onTouchMove: () => {
        clearLongPress();
      },
      onTouchEnd: () => {
        clearLongPress();
      },
      onTouchCancel: () => {
        clearLongPress();
      },
    }),
    [clearLongPress]
  );

  const close = useCallback(() => {
    clearLongPress();
    setPayload(null);
  }, [clearLongPress]);

  const coords: MenuCoords | null = payload
    ? { x: payload.x, y: payload.y, alignRight: payload.alignRight }
    : null;

  return {
    isOpen: payload !== null,
    coords,
    state: payload,
    openFromEvent,
    openFromElement,
    openFromContextMenu,
    openFromButton,
    getTouchHandlers,
    close,
  };
}

interface FloatingActionMenuProps {
  coords?: MenuCoords | null;
  open?: boolean;
  x?: number;
  y?: number;
  alignRight?: boolean;
  items: RowActionItem[];
  onClose: () => void;
  title?: string;
}

export const FloatingActionMenu: React.FC<FloatingActionMenuProps> = ({
  coords,
  open,
  x,
  y,
  alignRight,
  items,
  onClose,
  title,
}) => {
  const resolvedCoords: MenuCoords | null =
    coords ??
    (open && typeof x === 'number' && typeof y === 'number'
      ? { x, y, alignRight: alignRight ?? false }
      : null);

  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>(() => {
    if (!resolvedCoords) return { left: -9999, top: -9999 };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const estW = 220;
    const estH = 220;
    let left = resolvedCoords.alignRight ? resolvedCoords.x - estW : resolvedCoords.x;
    let top = resolvedCoords.y;
    if (left + estW + 10 > vw) left = Math.max(10, vw - estW - 10);
    if (left < 10) left = 10;
    if (top + estH + 10 > vh) top = Math.max(10, resolvedCoords.y - estH - 8);
    if (top < 10) top = 10;
    return { left, top };
  });

  const visibleItems = items.filter((item) => !item.hidden);
  const isVisible = Boolean(resolvedCoords) && visibleItems.length > 0;
  const coordX = resolvedCoords?.x;
  const coordY = resolvedCoords?.y;
  const coordAlignRight = resolvedCoords?.alignRight;

  useEffect(() => {
    if (!isVisible || typeof coordX !== 'number' || typeof coordY !== 'number') {
      setConfirmingId(null);
      return;
    }

    const openedAt = Date.now();

    const computePosition = () => {
      const menuEl = menuRef.current;
      const menuW = menuEl ? menuEl.offsetWidth : 220;
      const menuH = menuEl ? menuEl.offsetHeight : Math.max(120, visibleItems.length * 38 + 24);
      const pad = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = coordAlignRight ? coordX - menuW : coordX;
      let top = coordY;

      if (left + menuW + pad > vw) {
        left = Math.max(pad, vw - menuW - pad);
      }
      if (left < pad) {
        left = pad;
      }
      if (top + menuH + pad > vh) {
        top = Math.max(pad, coordY - menuH - 8);
      }
      if (top < pad) {
        top = pad;
      }
      setPosition({ left, top });
    };

    computePosition();
    const raf = requestAnimationFrame(computePosition);

    const handleOutside = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      // Allow trigger button to toggle cleanly without reopen-race
      if ((target as Element)?.closest?.('[data-row-action-trigger="true"]')) {
        return;
      }
      onCloseRef.current();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    const handleResize = () => {
      onCloseRef.current();
    };

    const handleWheel = (e: WheelEvent) => {
      // Only dismiss on intentional scroll outside the menu after it has settled
      if (Date.now() - openedAt < 180) return;
      if (Math.abs(e.deltaY) < 12 && Math.abs(e.deltaX) < 12) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      onCloseRef.current();
    };

    document.addEventListener('pointerdown', handleOutside, true);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleResize);
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', handleOutside, true);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isVisible, coordX, coordY, coordAlignRight, visibleItems.length]);

  if (!isVisible) return null;

  const executeItem = (item: RowActionItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.disabled) return;
    if (item.danger && (item.confirmDanger || item.confirmLabel)) {
      setConfirmingId(item.id);
      return;
    }
    const action = item.onClick;
    onCloseRef.current();
    action();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      className="fixed z-[9999] min-w-[212px] max-w-[268px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] shadow-2xl py-1.5 text-left"
    >
      {title && (
        <div className="px-3 py-1.5 border-b border-slate-100 dark:border-zinc-800/80 mb-1">
          <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 truncate">
            {title}
          </p>
        </div>
      )}

      {visibleItems.map((item, idx) => {
        const isConfirming = confirmingId === item.id;
        return (
          <React.Fragment key={item.id}>
            {item.dividerBefore && idx > 0 && (
              <div className="my-1 border-t border-slate-100 dark:border-zinc-800" />
            )}

            {isConfirming ? (
              <div className="px-2.5 py-2 space-y-2 bg-red-50/70 dark:bg-red-950/25 mx-1 rounded-lg">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#B91C1C] dark:text-red-400">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>{item.confirmLabel || 'Confirm deletion?'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const action = item.onClick;
                      onCloseRef.current();
                      action();
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-[#B91C1C] hover:bg-red-800 text-white text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmingId(null);
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#111114] text-slate-700 dark:text-zinc-300 text-[11px] font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => executeItem(item, e)}
                className={`w-full px-3 py-2 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  item.danger
                    ? 'text-[#B91C1C] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                    : 'text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80'
                }`}
              >
                {item.icon && <span className="shrink-0 opacity-85">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>,
    document.body
  );
};

interface RowActionMenuButtonProps {
  items?: RowActionItem[];
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  ariaLabel?: string;
  externalMenu?: RowContextMenuState;
  className?: string;
}

export const RowActionMenuButton: React.FC<RowActionMenuButtonProps> = ({
  items,
  onClick,
  title,
  ariaLabel = 'More actions',
  externalMenu,
  className = '',
}) => {
  const internalMenu = useRowActionMenu();
  const menu = externalMenu || internalMenu;
  const triggerRef = useRef<HTMLButtonElement>(null);

  const visibleItems = (items || []).filter((item) => !item.hidden);
  if (!onClick && visibleItems.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-row-action-trigger="true"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={onClick ? undefined : menu.isOpen}
        title={ariaLabel}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onClick) {
            onClick(e);
            return;
          }
          if (menu.isOpen) {
            menu.close();
          } else if (triggerRef.current) {
            menu.openFromElement(triggerRef.current);
          }
        }}
        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer ${className}`}
      >
        <MoreHorizontal size={16} />
      </button>

      {!onClick && !externalMenu && (
        <FloatingActionMenu
          coords={menu.coords}
          items={visibleItems}
          onClose={menu.close}
          title={title}
        />
      )}
    </>
  );
};

export default RowActionMenuButton;
