import React, { useMemo, useCallback, useState } from 'react';
import { txt } from '@/lib/text';
import { Briefcase, Building2, CornerDownRight, Plus, UserCircle } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import { BTN_ADD } from '@/lib/button-labels';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position } from '../core/types';
import HierarchyTable from '@/components/shared/HierarchyTable';
import type { ColumnConfig } from '@/store/createGenericStore';
import { getColumnCellStyle } from '@/store/createGenericStore';
import { useHierarchyRootFilter } from '@/hooks/use-hierarchy-root-filter';
import { usePositionStore } from '../store/usePositionStore';
import { PositionTableRowActions } from './position-table-row-actions';
import { TableRowIconButton } from '@/components/shared/row-actions';
import { useResourcePermissions } from '@/hooks/use-resource-permissions';
import { MobileListCard } from '@/components/shared/MobileListCard';
import { ColumnHeaderFilter } from '@/components/shared/column-header/ColumnHeaderFilter';
import { ColumnHeaderSortMenu } from '@/components/shared/column-header/ColumnHeaderSortMenu';
import { ColumnHeaderSearch } from '@/components/shared/column-header/ColumnHeaderSearch';
import {
  buildPositionTreeRows,
  isPositionTreeRowSelectable,
  type PositionTreeRow,
} from '../utils/build-position-tree-rows';
import HierarchyListShell from '@/components/shared/HierarchyListShell';

interface Props {
  departments: Department[];
  allDepartments: Department[];
  positions: Position[];
  sortPositions: (a: Position, b: Position) => number;
  isLoading: boolean;
  statusCounts: { Active: number; Inactive: number };
  rootDeptCounts: Record<string, number>;
  onEdit: (item: Position) => void;
  onDelete: (id: string) => void;
  onStatusChange: (item: Position) => void;
  onView?: (item: Position) => void;
  onAddForDepartment?: (dept: Department) => void;
}

const PositionList: React.FC<Props> = ({
  departments,
  allDepartments,
  positions,
  sortPositions,
  isLoading,
  statusCounts,
  rootDeptCounts,
  onEdit,
  onDelete,
  onStatusChange,
  onView,
  onAddForDepartment,
}) => {
  const { canCreate } = useResourcePermissions('positions');
  const {
    columns,
    selectedIds,
    toggleSelection,
    toggleAllSelection,
    pagination,
    setPage,
    setPageSize,
    filters,
    setFilter,
    sort,
    setSort,
  } = usePositionStore();

  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null);

  const phongOptionsWithCount = useHierarchyRootFilter({
    items: allDepartments,
    getId: (d) => d.id,
    getParentId: (d) => d.cha_id,
    getOrder: (d) => d.thu_tu,
    getRootLabel: (d) => d.ten_phong_ban,
  });

  const statusOptions = useMemo(
    () => [
      { label: txt('common.activeStatus'), value: 'Active', count: statusCounts.Active },
      { label: txt('common.inactiveStatus'), value: 'Inactive', count: statusCounts.Inactive },
    ],
    [statusCounts],
  );

  const renderColumnHeaderAccessory = useCallback(
    (col: ColumnConfig) => {
      const cs = filters.columnSearch;
      const colSearchActive = Boolean(cs[col.id]?.trim());
      const columnSearchEl = (
        <ColumnHeaderSearch
          variant="inDropdown"
          value={cs[col.id] ?? ''}
          onChange={(v) =>
            setFilter('columnSearch', {
              ...cs,
              [col.id]: v,
            })
          }
          ariaLabel={`${col.label} — ${txt('common.search')}`}
        />
      );

      switch (col.id) {
        case 'ten_chuc_vu':
          return (
            <ColumnHeaderFilter
              options={phongOptionsWithCount.map((o) => ({
                label: o.label,
                value: o.value,
                count: rootDeptCounts[o.value] ?? 0,
              }))}
              value={filters.id_phong_goc}
              onChange={(v) => setFilter('id_phong_goc', v)}
              ariaLabel={txt('department.toolbar.department')}
              sortColumnId="ten_chuc_vu"
              sort={sort}
              setSort={setSort}
            />
          );
        case 'trang_thai':
          return (
            <ColumnHeaderFilter
              options={statusOptions}
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              ariaLabel={txt('common.status')}
              sortColumnId="trang_thai"
              sort={sort}
              setSort={setSort}
            />
          );
        default:
          return (
            <ColumnHeaderSortMenu
              ariaLabel={col.label}
              sortColumnId={col.id}
              sort={sort}
              setSort={setSort}
              columnSearch={columnSearchEl}
              columnSearchActive={colSearchActive}
            />
          );
      }
    },
    [filters, setFilter, sort, setSort, phongOptionsWithCount, statusOptions, rootDeptCounts],
  );

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible).sort((a, b) => a.order - b.order),
    [columns],
  );

  const treeRows = useMemo(
    () => buildPositionTreeRows(departments, positions, sortPositions),
    [departments, positions, sortPositions],
  );

  const renderStatusBadge = useCallback(
    (status: string) =>
      status === 'Đang hoạt động' ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          {txt('position.active')}
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
          {txt('position.inactive')}
        </span>
      ),
    [],
  );

  const renderDepartmentAddButton = (dept: Department) => {
    if (!canCreate || !onAddForDepartment || dept.trang_thai !== 'Đang hoạt động') {
      return null;
    }
    return (
      <TableRowIconButton
        icon={Plus}
        label={BTN_ADD()}
        size="compact"
        iconSize={14}
        className="h-8 w-8 rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:border-primary/40 active:scale-95"
        onClick={() => onAddForDepartment(dept)}
      />
    );
  };

  const renderDepartmentBanner = (row: Extract<PositionTreeRow, { kind: 'department' }>) => {
    const dept = row.department;
    const isRoot = dept.cap_do === 1;
    const paddingLeft = (row.level - 1) * 24;
    return (
      <div
        className={`flex w-full min-w-0 items-center gap-3 px-4 py-2 ${
          isRoot ? 'border-l-[3px] border-primary' : 'border-l-[3px] border-transparent'
        }`}
        style={{ paddingLeft: `${16 + paddingLeft}px` }}
      >
        {isRoot ? (
          <div className="bg-primary/15 p-1.5 rounded-lg text-primary shadow-sm border border-primary/20 shrink-0">
            <Building2 size={15} />
          </div>
        ) : (
          <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
            <div className="absolute -left-[10px] top-1/2 w-[10px] h-px bg-border" />
            <CornerDownRight size={14} className="text-muted-foreground" />
          </div>
        )}
        <span className="truncate text-sm font-bold text-foreground">
          {dept.ten_phong_ban}
        </span>
        <span className="font-mono text-[11px] font-medium text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border tabular-nums shrink-0">
          {dept.ma_phong_ban}
        </span>
        <span
          className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border tabular-nums shrink-0 ${
            row.positionCount > 0
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted text-muted-foreground border-border'
          }`}
        >
          {txt('position.detail.positionCount', { count: row.positionCount })}
        </span>
      </div>
    );
  };

  const renderCell = useCallback((row: PositionTreeRow, col: ColumnConfig) => {
    if (row.kind === 'department') {
      return <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)} />;
    }

    const paddingLeft = (row.level - 1) * 24;
    const item = row.position;
    switch (col.id) {
      case 'thu_tu':
        return (
          <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)}>
            <span className="text-sm font-medium text-muted-foreground">{item.thu_tu}</span>
          </td>
        );
      case 'ma_chuc_vu':
        return (
          <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)}>
            <span className="font-mono text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border tabular-nums">
              {item.ma_chuc_vu}
            </span>
          </td>
        );
      case 'ten_chuc_vu':
        return (
          <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)}>
            <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${paddingLeft}px` }}>
              <Briefcase size={14} className="shrink-0 text-primary/70" aria-hidden />
              <span className="truncate font-semibold text-foreground text-sm">{item.ten_chuc_vu}</span>
            </div>
          </td>
        );
      case 'cap_bac':
        return (
          <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)}>
            {item.cap_bac != null ? (
              <span className="text-body-sm font-medium tabular-nums text-foreground">{item.cap_bac}</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </td>
        );
      case 'mo_ta':
        return (
          <td key={col.id} className="px-6 py-1.5 min-w-0" style={getColumnCellStyle(col)}>
            <div className="truncate max-w-[200px] text-body-sm text-muted-foreground italic" title={item.mo_ta || ''}>
              {item.mo_ta || <span className="text-muted-foreground">{txt('position.noDescFull')}</span>}
            </div>
          </td>
        );
      case 'trang_thai':
        return (
          <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)}>
            {renderStatusBadge(item.trang_thai)}
          </td>
        );
      case 'tg_cap_nhat':
        return (
          <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)}>
            <span className="text-xs text-muted-foreground">{formatDateShort(item.tg_cap_nhat)}</span>
          </td>
        );
      default:
        return <td key={col.id} className="px-6 py-1.5" style={getColumnCellStyle(col)} />;
    }
  }, [renderStatusBadge]);

  const handleView = useCallback(
    (row: PositionTreeRow) => {
      if (row.kind === 'position') (onView ?? onEdit)(row.position);
    },
    [onView, onEdit],
  );

  const renderMobilePositionCard = (item: Position, isSelected: boolean) => (
    <MobileListCard
      className="ml-4"
      selected={isSelected}
      onBodyClick={() => (onView ?? onEdit)(item)}
      onBodyKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (onView ?? onEdit)(item);
        }
      }}
      leading={(
        <div className="h-11 w-11 shrink-0 rounded-lg border border-primary/20 bg-primary/15 flex items-center justify-center text-primary">
          <Briefcase size={22} />
        </div>
      )}
      titleRow={(
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h4 className="truncate text-sm font-semibold text-foreground">{item.ten_chuc_vu}</h4>
          <div className="shrink-0 scale-90 origin-right">{renderStatusBadge(item.trang_thai)}</div>
        </div>
      )}
      metaLine={(
        <p className="font-mono text-xs text-muted-foreground">{item.ma_chuc_vu}</p>
      )}
      subheader={(
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 px-3 py-2 text-body-sm">
          <div>
            <p className="mb-0.5 text-muted-foreground">{txt('position.form.level')}</p>
            <p className="font-medium text-foreground tabular-nums">
              {item.cap_bac != null ? item.cap_bac : '—'}
            </p>
          </div>
          <div>
            <p className="mb-0.5 text-muted-foreground">{txt('common.status')}</p>
            {renderStatusBadge(item.trang_thai)}
          </div>
        </div>
      )}
      footerStart={(
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelection(item.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-3 w-3 cursor-pointer rounded border-border text-primary accent-primary"
              aria-label={txt('common.select')}
            />
          </label>
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <UserCircle size={12} />
            {txt('position.store.orderCol')}: {item.thu_tu}
          </span>
        </div>
      )}
      footerEnd={(
        <PositionTableRowActions
          compact
          item={item}
          menuOpenId={rowMenuOpenId}
          onMenuOpenChange={setRowMenuOpenId}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
        />
      )}
    />
  );

  return (
    <HierarchyListShell
      data={treeRows}
      isLoading={isLoading}
      tableColumns={visibleColumns.length}
      loadingText={txt('position.loading')}
      hasBaseData={allDepartments.length > 0}
      emptyTitle={txt('department.empty')}
      emptyDescription={txt('department.emptyHint')}
      hasFilteredData={departments.length > 0}
      noResultsTitle={txt('common.noResults')}
      noResultsDescription={txt('common.noData')}
      page={pagination.page}
      pageSize={pagination.pageSize}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      selectedCount={selectedIds.size}
      recordsLabel={txt('position.footerRecords')}
      mobileListClassName="space-y-2"
      renderDesktop={(paginatedData) => (
        <HierarchyTable<PositionTreeRow>
          data={paginatedData}
          columns={visibleColumns}
          selectedIds={selectedIds}
          getId={(row) => row.id}
          getLevel={(row) => row.level}
          renderCell={renderCell}
          onToggleSelection={toggleSelection}
          onToggleAllSelection={toggleAllSelection}
          onView={handleView}
          isRowSelectable={isPositionTreeRowSelectable}
          isFullSpanRow={(row) => row.kind === 'department'}
          renderFullSpanRow={(row) =>
            row.kind === 'department' ? renderDepartmentBanner(row) : null
          }
          renderActions={(row) => {
            if (row.kind === 'department') {
              return (
                <div className="flex items-center justify-center">
                  {renderDepartmentAddButton(row.department)}
                </div>
              );
            }
            return (
              <PositionTableRowActions
                item={row.position}
                menuOpenId={rowMenuOpenId}
                onMenuOpenChange={setRowMenuOpenId}
                onEdit={onEdit}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
              />
            );
          }}
          renderColumnHeaderAccessory={renderColumnHeaderAccessory}
        />
      )}
      renderMobile={(paginatedData) =>
        paginatedData.map((row) => {
          if (row.kind === 'department') {
            const dept = row.department;
            const isRoot = dept.cap_do === 1;
            const paddingLeft = (row.level - 1) * 16;
            return (
              <div
                key={row.id}
                className="flex items-center gap-2 py-2 px-2 rounded-lg bg-muted/40 border border-border"
                style={{ marginLeft: paddingLeft }}
              >
                <Building2
                  size={16}
                  className={`shrink-0 ${isRoot ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate font-bold text-foreground">
                    {dept.ten_phong_ban}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {txt('position.detail.positionCount', { count: row.positionCount })}
                  </p>
                </div>
                {renderDepartmentAddButton(dept)}
              </div>
            );
          }
          return (
            <div key={row.id}>
              {renderMobilePositionCard(row.position, selectedIds.has(row.id))}
            </div>
          );
        })
      }
    />
  );
};

export default PositionList;
