import React from 'react';
import { Edit, Power, Trash2 } from 'lucide-react';
import { txt } from '@/lib/text';
import {
  DataTableRowActions,
  TableRowIconButton,
  type RowOverflowMenuItem,
} from '@/components/shared/row-actions';
import { useCanOnRecord } from '@/hooks/use-can-on-record';
import type { Position } from '../core/types';

export interface PositionTableRowActionsProps {
  item: Position;
  menuOpenId: string | null;
  onMenuOpenChange: (id: string | null) => void;
  onEdit: (item: Position) => void;
  onDelete: (id: string) => void;
  onStatusChange: (item: Position) => void;
  compact?: boolean;
}

export function PositionTableRowActions({
  item,
  menuOpenId,
  onMenuOpenChange,
  onEdit,
  onDelete,
  onStatusChange,
  compact = false,
}: PositionTableRowActionsProps) {
  const close = () => onMenuOpenChange(null);

  const recordCtx = { nguoi_tao: item.nguoi_tao };
  const canEdit = useCanOnRecord('edit', 'positions', recordCtx);
  const canDelete = useCanOnRecord('delete', 'positions', recordCtx);

  const toggleLabel =
    item.trang_thai === 'Đang hoạt động'
      ? txt('position.detail.deactivate')
      : txt('position.detail.activate');

  const overflowItems: RowOverflowMenuItem[] = [
    ...(canEdit
      ? [
          {
            key: 'toggle',
            label: toggleLabel,
            icon: <Power size={14} />,
            onClick: () => {
              onStatusChange(item);
              close();
            },
          } satisfies RowOverflowMenuItem,
        ]
      : []),
    ...(canDelete
      ? [
          {
            key: 'delete',
            label: txt('common.delete'),
            icon: <Trash2 size={14} />,
            variant: 'destructive' as const,
            onClick: () => {
              onDelete(item.id);
              close();
            },
          } satisfies RowOverflowMenuItem,
        ]
      : []),
  ];

  const hasMenuItems = overflowItems.length > 0;

  const primary = canEdit ? (
    <TableRowIconButton
      icon={Edit}
      label={txt('common.edit')}
      size={compact ? 'compact' : 'default'}
      variant="primary"
      onClick={() => onEdit(item)}
    />
  ) : undefined;

  if (!primary && !hasMenuItems) {
    return (
      <div
        role="group"
        className="flex items-center justify-center"
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <DataTableRowActions
      rowId={item.id}
      compact={compact}
      menuOpenId={menuOpenId}
      onMenuOpenChange={onMenuOpenChange}
      primary={primary}
      overflowItems={overflowItems}
      overflowTriggerLabel={txt('common.moreRowActions')}
    />
  );
}
