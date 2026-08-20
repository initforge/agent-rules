import React, { useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { TableRowIconButton } from './TableRowIconButton';
import { RowActionsOverflowMenu } from './RowActionsOverflowMenu';
import type { RowOverflowMenuItem } from './types';

export interface DataTableRowActionsProps {
  rowId: string;
  /** Trùng Tailwind `md:` — chỉ một instance (bảng hoặc card) gắn portal menu */
  compact?: boolean;
  menuOpenId: string | null;
  onMenuOpenChange: (id: string | null) => void;
  /** Nút chính (vd. Sửa); có thể null nếu chỉ có overflow */
  primary?: React.ReactNode;
  overflowItems: RowOverflowMenuItem[];
  /** Nhãn nút ⋮ (title / aria) */
  overflowTriggerLabel: string;
  className?: string;
}

/**
 * Layout chuẩn cột thao tác: [primary?] + [⋮ menu].
 */
export function DataTableRowActions({
  rowId,
  compact = false,
  menuOpenId,
  onMenuOpenChange,
  primary,
  overflowItems,
  overflowTriggerLabel,
  className,
}: DataTableRowActionsProps) {
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const portalFromThisInstance = compact ? !isMdUp : isMdUp;
  const moreRef = useRef<HTMLButtonElement>(null);
  const isOpen = menuOpenId === rowId;
  const showOverflow = overflowItems.length > 0;

  if (!primary && !showOverflow) return null;

  return (
    <div
      role="group"
      className={cn('flex items-center justify-center', compact ? 'gap-0' : 'gap-0.5', className)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {primary}
      {showOverflow && (
        <>
          <TableRowIconButton
            ref={moreRef}
            icon={MoreVertical}
            label={overflowTriggerLabel}
            size={compact ? 'compact' : 'default'}
            variant="muted"
            aria-expanded={isOpen}
            aria-haspopup="menu"
            className={isOpen ? 'bg-muted text-foreground' : undefined}
            onClick={() => onMenuOpenChange(isOpen ? null : rowId)}
          />
          <RowActionsOverflowMenu
            open={isOpen}
            onClose={() => onMenuOpenChange(null)}
            anchorRef={moreRef}
            portalEnabled={portalFromThisInstance}
            items={overflowItems}
          />
        </>
      )}
    </div>
  );
}
