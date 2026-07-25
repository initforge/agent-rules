import { Folder } from 'lucide-react';
import React, { useMemo } from 'react';
import { txt } from '@/lib/text';
import EmptyState from '@/components/shared/EmptyState';
import ListPageSkeleton from '@/components/shared/ListPageSkeleton';
import TablePaginationFooter from '@/components/shared/TablePaginationFooter';

interface HierarchyListShellProps<T> {
  data: T[];
  isLoading: boolean;
  tableColumns: number;
  loadingText: string;
  hasBaseData: boolean;
  emptyTitle: string;
  emptyDescription: string;
  hasFilteredData: boolean;
  noResultsTitle: string;
  noResultsDescription: string;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  selectedCount: number;
  recordsLabel: string;
  mobileListClassName?: string;
  renderDesktop: (paginatedData: T[]) => React.ReactNode;
  renderMobile: (paginatedData: T[]) => React.ReactNode;
}

export default function HierarchyListShell<T>({
  data,
  isLoading,
  tableColumns,
  loadingText,
  hasBaseData,
  emptyTitle,
  emptyDescription,
  hasFilteredData,
  noResultsTitle,
  noResultsDescription,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedCount,
  recordsLabel,
  mobileListClassName = 'space-y-3',
  renderDesktop,
  renderMobile,
}: HierarchyListShellProps<T>) {
  const totalRecords = data.length;
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  if (isLoading) {
    return (
      <ListPageSkeleton
        loadingText={loadingText}
        tableColumns={tableColumns}
        tableRowCount={5}
        tableColumnWithSubline={0}
        cardCount={3}
      />
    );
  }

  if (!hasBaseData) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={<Folder className="w-10 h-10 text-muted-foreground" />}
        />
      </div>
    );
  }

  if (!hasFilteredData) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        <EmptyState
          title={noResultsTitle}
          description={noResultsDescription}
          icon={<Folder className="w-10 h-10 text-muted-foreground" />}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-card overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="hidden md:flex flex-1 min-h-0 flex-col overflow-hidden">
          {renderDesktop(paginatedData)}
        </div>

        <div className="md:hidden flex-1 min-h-0 overflow-y-auto pb-3 px-3 pt-1 custom-scrollbar">
          <div className={mobileListClassName}>{renderMobile(paginatedData)}</div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-muted/30">
        <TablePaginationFooter
          totalRecords={totalRecords}
          page={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          selectedCount={selectedCount}
          recordsLabel={recordsLabel || txt('common.records')}
        />
      </div>
    </div>
  );
}
