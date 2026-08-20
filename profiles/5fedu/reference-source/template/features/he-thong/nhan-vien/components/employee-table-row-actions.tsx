import React from 'react';
import { toast } from 'sonner';
import { Edit, RefreshCw, Printer, Mail, Phone, Trash2 } from 'lucide-react';
import { txt } from '@/lib/text';
import {
  DataTableRowActions,
  TableRowIconButton,
  type RowOverflowMenuItem,
} from '@/components/shared/row-actions';
import { openEmployeeProfilePreviewTab } from '../utils/open-employee-profile-preview';
import type { Employee } from '../core/types';
import { useCanOnRecord } from '@/hooks/use-can-on-record';

export interface EmployeeTableRowActionsProps {
  item: Employee;
  menuOpenId: string | null;
  onMenuOpenChange: (id: string | null) => void;
  onEdit: (item: Employee) => void;
  onDelete: (id: string) => void;
  onStatusChange: (item: Employee) => void;
  /** Hàng thao tác trên card mobile (mobile list): nút gọn, cùng hàng với checkbox */
  compact?: boolean;
}

export function EmployeeTableRowActions({
  item,
  menuOpenId,
  onMenuOpenChange,
  onEdit,
  onDelete,
  onStatusChange,
  compact = false,
}: EmployeeTableRowActionsProps) {
  const close = () => onMenuOpenChange(null);

  const recordCtx = { nguoi_tao: item.nguoi_tao };
  const canEdit = useCanOnRecord('edit', 'employees', recordCtx);
  const canDelete = useCanOnRecord('delete', 'employees', recordCtx);
  const canViewRow = useCanOnRecord('view', 'employees', recordCtx);

  const overflowItems: RowOverflowMenuItem[] = [
    ...(canEdit
      ? [
          {
            key: 'status',
            label: txt('employee.detail.changeStatus'),
            icon: <RefreshCw size={14} />,
            onClick: () => {
              onStatusChange(item);
              close();
            },
          },
        ]
      : []),
    ...(canViewRow
      ? [
          {
            key: 'print',
            label: txt('employee.detail.print'),
            icon: <Printer size={14} />,
            onClick: () => {
              openEmployeeProfilePreviewTab(item.id);
              close();
            },
          },
          {
            key: 'email',
            label: txt('employee.detail.sendEmail'),
            icon: <Mail size={14} />,
            onClick: () => {
              window.location.href = `mailto:${item.email}`;
              close();
            },
          },
          {
            key: 'phone',
            label: txt('employee.detail.callPhone'),
            icon: <Phone size={14} />,
            onClick: () => {
              if (item.so_dien_thoai) {
                window.location.href = `tel:${item.so_dien_thoai}`;
              } else {
                toast.warning(txt('employee.rowActions.noPhone'));
              }
              close();
            },
          },
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
          },
        ]
      : []),
  ];

  const hasMenuItems = overflowItems.length > 0;

  const primary =
    canEdit ? (
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
      overflowTriggerLabel={txt('employee.rowActions.more')}
    />
  );
}
