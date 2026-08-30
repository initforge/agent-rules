import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { List } from 'lucide-react';
import AppDialog from '@/components/shared/AppDialog';
import Button from '@/components/ui/Button';
import StatsDataGrid from '@/components/shared/stats/StatsDataGrid';
import type { StatsDataGridColumn } from '@/components/shared/stats/types';
import type { DialogSizeKey } from '@/lib/dialog-sizes';
import { txt } from '@/lib/text';

export type StatsDrillDownDialogSize = 'XL' | 'WIDE';

export interface StatsDrillDownDialogProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  size?: StatsDrillDownDialogSize;
  rows: T[];
  columns: StatsDataGridColumn<T>[];
  getRowKey: (row: T) => string;
  renderCell: (colId: string, row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  recordsLabel?: string;
  tableMinWidth?: string;
}

function StatsDrillDownDialog<T>({
  open,
  onClose,
  title,
  subtitle,
  icon = List,
  size = 'XL',
  rows,
  columns,
  getRowKey,
  renderCell,
  onRowClick,
  isLoading = false,
  recordsLabel,
  tableMinWidth,
}: StatsDrillDownDialogProps<T>) {
  const dialogSize: DialogSizeKey = size;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      size={dialogSize}
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          {txt('common.close')}
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <StatsDataGrid
          embedded
          title={title}
          rows={rows}
          columns={columns}
          getRowKey={getRowKey}
          renderCell={renderCell}
          onRowClick={onRowClick}
          isLoading={isLoading}
          recordsLabel={recordsLabel ?? txt('stats.footerRecords')}
          tableMinWidth={tableMinWidth}
          className="min-h-0 flex-1 border border-border rounded-xl"
        />
      </div>
    </AppDialog>
  );
}

export default StatsDrillDownDialog;
