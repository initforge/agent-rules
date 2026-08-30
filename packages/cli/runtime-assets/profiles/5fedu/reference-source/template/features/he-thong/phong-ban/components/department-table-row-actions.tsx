import React from 'react';
import { Edit, Power, Trash2 } from 'lucide-react';
import { txt } from '@/lib/text';
import {
  DataTableRowActions,
  TableRowIconButton,
  type RowOverflowMenuItem,
} from '@/components/shared/row-actions';
import { useCanOnRecord } from '@/hooks/use-can-on-record';
import type { Department } from '../core/types';

export interface DepartmentTableRowActionsProps {
  item: Department;
  menuOpenId: string | null;
  onMenuOpenChange: (id: string | null) => void;
  onEdit: (item: Department) => void;
  onDelete: (id: string) => void;
  onStatusChange?: (item: Department) => void;
  compact?: boolean;
}

export function DepartmentTableRowActions({
  item,
  menuOpenId,
  onMenuOpenChange,
  onEdit,
  onDelete,
  onStatusChange,
  compact = false,
}: DepartmentTableRowActionsProps) {
  const close = () => onMenuOpenChange(null);

  const recordCtx = { nguoi_tao: item.nguoi_tao };
  const canEdit = useCanOnRecord('edit', 'departments', recordCtx);
  const canDelete = useCanOnRecord('delete', 'departments', recordCtx);

  const toggleLabel =
    item.trang_thai === 'Đang hoạt động'
      ? txt('department.detail.deactivate')
      : txt('department.detail.activate');

  const overflowItems: RowOverflowMenuItem[] = [
    ...(onStatusChange && canEdit
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

  const showPrimary = canEdit;
  const showOverflow = overflowItems.length > 0;

  if (!showPrimary && !showOverflow) {
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
      primary={
        showPrimary ? (
          <TableRowIconButton
            icon={Edit}
            label={txt('common.edit')}
            size={compact ? 'compact' : 'default'}
            variant="primary"
            onClick={() => onEdit(item)}
          />
        ) : undefined
      }
      overflowItems={overflowItems}
      overflowTriggerLabel={txt('common.moreRowActions')}
    />
  );
}
