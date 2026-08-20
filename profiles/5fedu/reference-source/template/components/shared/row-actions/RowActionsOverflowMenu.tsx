import React, { useRef, useLayoutEffect, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Z_INDEX_CONTEXT_MENU_CLASS } from '@/lib/dialog-sizes';
import type { RowOverflowMenuItem } from './types';

const DEFAULT_MIN_WIDTH = 200;

export interface RowActionsOverflowMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  portalEnabled: boolean;
  items: RowOverflowMenuItem[];
  minWidth?: number;
}

/**
 * Menu dropdown cố định (portal) cho cột thao tác bảng — đóng khi click ngoài / Escape.
 */
export function RowActionsOverflowMenu({
  open,
  onClose,
  anchorRef,
  portalEnabled,
  items,
  minWidth = DEFAULT_MIN_WIDTH,
}: RowActionsOverflowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(rect.right - minWidth, window.innerWidth - minWidth - 8);
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [anchorRef, minWidth]);

  useLayoutEffect(() => {
    if (!open || !portalEnabled) return;
    updatePosition();
  }, [open, portalEnabled, updatePosition]);

  useEffect(() => {
    if (!open || !portalEnabled) return;
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, portalEnabled, updatePosition]);

  useEffect(() => {
    if (!open || !portalEnabled) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, portalEnabled, onClose, anchorRef]);

  if (!open || !portalEnabled || items.length === 0) return null;

  const nodes: React.ReactNode[] = [];

  items.forEach((row, i) => {
    const isDestructive = row.variant === 'destructive';
    const prev = items[i - 1];
    if (isDestructive && prev && prev.variant !== 'destructive') {
      nodes.push(
        <div key={`sep-${row.key}`} className="my-1 h-px bg-border" role="separator" />,
      );
    }

    const base =
      'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors';
    const cls = isDestructive
      ? `${base} text-destructive hover:bg-destructive/10`
      : `${base} text-foreground hover:bg-muted`;

    nodes.push(
      <button
        key={row.key}
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation();
          row.onClick();
        }}
        className={cls}
      >
        <span className={isDestructive ? 'shrink-0 text-destructive' : 'text-muted-foreground shrink-0'}>
          {row.icon}
        </span>
        {row.label}
      </button>,
    );
  });

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        'fixed rounded-lg border border-border bg-popover text-popover-foreground py-1 shadow-lg',
        Z_INDEX_CONTEXT_MENU_CLASS,
      )}
      style={{ top: pos.top, left: pos.left, minWidth }}
    >
      {nodes}
    </div>,
    document.body,
  );
}
