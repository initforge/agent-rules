import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Placement = 'top' | 'bottom' | 'left' | 'right';

const TOOLTIP_Z_INDEX = 9999;

interface TooltipProps {
  /** Nội dung tooltip */
  content: React.ReactNode;
  /** Vị trí hiển thị. Mặc định: 'top' */
  placement?: Placement;
  /** Delay trước khi hiện (ms). Mặc định: 150 */
  delay?: number;
  /** Ẩn tooltip (dùng khi component cha tự quản lý). Mặc định: false */
  disabled?: boolean;
  children: React.ReactElement;
  className?: string;
}

/**
 * Tooltip component thống nhất.
 * Render qua Portal vào document.body với z-index cao (9999) để không bị che bởi tab group, overflow-hidden, v.v.
 * Style: nền sáng (card), viền nhẹ, shadow mềm.
 * Tự động flip nếu tràn viewport.
 */
const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  delay = 150,
  disabled = false,
  children,
  className,
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; placement: Placement } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    let final = placement;
    if (placement === 'top' && rect.top < 40) final = 'bottom';
    if (placement === 'bottom' && rect.bottom > window.innerHeight - 40) final = 'top';
    if (placement === 'left' && rect.left < 80) final = 'right';
    if (placement === 'right' && rect.right > window.innerWidth - 80) final = 'left';

    const gap = 6;
    let left = 0;
    let top = 0;
    const w = rect.width;
    const h = rect.height;
    const cx = rect.left + w / 2;
    const cy = rect.top + h / 2;

    switch (final) {
      case 'top':
        top = rect.top - gap;
        left = cx;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = cx;
        break;
      case 'left':
        left = rect.left - gap;
        top = cy;
        break;
      case 'right':
        left = rect.right + gap;
        top = cy;
        break;
    }
    setCoords({ left, top, placement: final });
  }, [placement]);

  const show = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      if (wrapperRef.current) {
        updatePosition();
        setVisible(true);
      }
    }, delay);
  }, [disabled, delay, updatePosition]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setVisible(false);
    setCoords(null);
  }, []);

  useEffect(() => {
    if (visible && wrapperRef.current) queueMicrotask(() => updatePosition());
  }, [visible, updatePosition]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (disabled || !content) return children;

  const portalContent =
    visible && coords ? (
      <div
        role="tooltip"
        className={cn(
          'fixed px-2.5 py-1 rounded-lg pointer-events-none',
          'bg-popover text-popover-foreground text-xs font-medium whitespace-nowrap',
          'shadow-md border border-border/60',
          'transition-all duration-150 ease-out',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          coords.placement === 'top' && '-translate-y-full -translate-x-1/2',
          coords.placement === 'bottom' && '-translate-x-1/2',
          coords.placement === 'left' && '-translate-x-full -translate-y-1/2',
          coords.placement === 'right' && '-translate-y-1/2',
          className,
        )}
        style={{
          zIndex: TOOLTIP_Z_INDEX,
          left: coords.left,
          top: coords.top,
        }}
      >
        {content}
      </div>
    ) : null;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- hover/focus wrapper for tooltip target */}
      <div
        ref={wrapperRef}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {typeof document !== 'undefined' && portalContent
        ? createPortal(portalContent, document.body)
        : null}
    </>
  );
};

export default Tooltip;
