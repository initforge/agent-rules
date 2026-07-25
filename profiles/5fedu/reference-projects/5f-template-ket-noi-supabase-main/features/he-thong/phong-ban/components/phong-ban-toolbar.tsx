import React, { useMemo } from 'react';
import { txt } from '@/lib/text';
import { Download, Upload, Tag, Building2 } from 'lucide-react';
import {
  ListToolbarAddButton,
  ListToolbarIconButton,
} from '@/components/shared/ListToolbarActions';
import { useResourcePermissions } from '@/hooks/use-resource-permissions';
import { useDepartmentStore } from '../store/useDepartmentStore';
import { useShallow } from 'zustand/react/shallow';
import GenericToolbar from '@/components/shared/GenericToolbar';
import FilterChipMultiSelect from '@/components/shared/FilterChipMultiSelect';
import ToolbarFilterChipGroup, {
  INLINE_CHIP_CLASS,
  MENU_CHIP_CLASS,
  type ToolbarFilterChipItem,
} from '@/components/shared/ToolbarFilterChipGroup';
import { getRootItems } from '@/lib/tree-utils';
import type { Department } from '../core/types';
import { countDepartmentColumnSearchActive } from '../utils/column-search';
import { useDepartmentFilterCounts } from '../hooks/use-department-filter-counts';

interface Props {
  departments: Department[];
  selectedCount: number;
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
  onDeleteMany: () => void;
  onStatusChangeMany: (status: import('@/lib/constants/trang-thai').TrangThaiHoatDong) => void;
}

const chipClass = (layout: 'inline' | 'menu', width?: string) =>
  layout === 'inline' ? (width ?? INLINE_CHIP_CLASS) : MENU_CHIP_CLASS;

const PhongBanToolbar: React.FC<Props> = ({
  departments,
  selectedCount,
  onAdd,
  onExport,
  onImport,
  onDeleteMany,
  onStatusChangeMany,
}) => {
  const { canCreate, canImport, canExport, canDelete, canEdit } = useResourcePermissions('departments');

  const {
    searchTerm,
    setSearchTerm,
    filters,
    setFilter,
    setSort,
    clearSelection,
    columns,
    toggleColumn,
    reorderColumns,
    resetColumns,
  } = useDepartmentStore(
    useShallow((s) => ({
      searchTerm: s.searchTerm,
      setSearchTerm: s.setSearchTerm,
      filters: s.filters,
      setFilter: s.setFilter,
      setSort: s.setSort,
      clearSelection: s.clearSelection,
      columns: s.columns,
      toggleColumn: s.toggleColumn,
      reorderColumns: s.reorderColumns,
      resetColumns: s.resetColumns,
    })),
  );

  const { rootCounts, statusCounts } = useDepartmentFilterCounts(departments, searchTerm, filters);

  const phongOptionsWithCount = useMemo(() => {
    const roots = getRootItems(departments, {
      getParentId: (d) => d.cha_id,
      getOrder: (d) => d.thu_tu,
    });
    return roots.map((item) => ({
      label: item.ten_phong_ban,
      value: item.id,
      count: rootCounts[item.id] || 0,
    }));
  }, [departments, rootCounts]);

  const statusOptions = useMemo(
    () => [
      { label: txt('common.activeStatus'), value: 'Active', count: statusCounts.Active },
      { label: txt('common.inactiveStatus'), value: 'Inactive', count: statusCounts.Inactive },
    ],
    [statusCounts],
  );

  const activeFilterCount = useMemo(() => {
    const colN = countDepartmentColumnSearchActive(filters.columnSearch);
    const statusOn = filters.status.length > 0 ? 1 : 0;
    const rootOn = filters.id_phong_goc.length > 0 ? 1 : 0;
    return colN + statusOn + rootOn + (searchTerm.trim() ? 1 : 0);
  }, [filters.columnSearch, filters.status.length, filters.id_phong_goc.length, searchTerm]);

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setFilter('columnSearch', {});
    setFilter('status', []);
    setFilter('id_phong_goc', []);
    setSort(null, null);
  };

  const filterGroups = useMemo(
    () => [
      {
        key: 'id_phong_goc',
        label: txt('department.toolbar.department'),
        icon: Building2,
        options: phongOptionsWithCount,
        value: filters.id_phong_goc,
        onChange: (val: string[]) => setFilter('id_phong_goc', val),
      },
      {
        key: 'status',
        label: txt('common.status'),
        icon: Tag,
        options: statusOptions,
        value: filters.status,
        onChange: (val: string[]) => setFilter('status', val),
      },
    ],
    [filters.id_phong_goc, filters.status, setFilter, phongOptionsWithCount, statusOptions],
  );

  const filterChipItems = useMemo<ToolbarFilterChipItem[]>(
    () => [
      {
        id: 'id_phong_goc',
        active: filters.id_phong_goc.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={phongOptionsWithCount}
            value={filters.id_phong_goc}
            onChange={(val) => setFilter('id_phong_goc', val)}
            placeholder={txt('department.toolbar.department')}
            icon={Building2}
            className={chipClass(layout, 'w-[136px]')}
          />
        ),
      },
      {
        id: 'status',
        active: filters.status.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={statusOptions}
            value={filters.status}
            onChange={(val) => setFilter('status', val)}
            placeholder={txt('common.status')}
            icon={Tag}
            className={chipClass(layout, 'w-[132px]')}
          />
        ),
      },
    ],
    [phongOptionsWithCount, statusOptions, filters.id_phong_goc, filters.status, setFilter],
  );

  const renderFilters = useMemo(
    () => <ToolbarFilterChipGroup items={filterChipItems} maxVisible={3} />,
    [filterChipItems],
  );

  const mobileActions = useMemo(
    () => [
      ...(canImport
        ? [
            {
              key: 'import',
              label: txt('common.import'),
              icon: Upload,
              onClick: onImport,
              description: txt('department.importDeveloping'),
            },
          ]
        : []),
      ...(canExport
        ? [
            {
              key: 'export',
              label: txt('common.export'),
              icon: Download,
              onClick: onExport,
              description: '',
            },
          ]
        : []),
    ],
    [onImport, onExport, canImport, canExport],
  );

  const renderActions = (
    <>
      <div className="hidden sm:flex items-center gap-2">
        {canImport && (
          <ListToolbarIconButton
            icon={Upload}
            tooltip={txt('common.import')}
            onClick={onImport}
          />
        )}
        {canExport && (
          <ListToolbarIconButton
            icon={Download}
            tooltip={txt('common.export')}
            onClick={onExport}
          />
        )}
      </div>
      {canCreate && <ListToolbarAddButton onClick={onAdd} />}
    </>
  );

  return (
    <GenericToolbar
      selectedCount={selectedCount}
      onDeleteMany={canDelete ? onDeleteMany : undefined}
      onStatusChangeMany={canEdit ? onStatusChangeMany : undefined}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      onClearSelection={clearSelection}
      actions={renderActions}
      filters={renderFilters}
      filterGroups={filterGroups}
      mobileActions={mobileActions}
      onAdd={canCreate ? onAdd : undefined}
      showBack
      activeFilterCount={activeFilterCount}
      onClearAllFilters={handleClearAllFilters}
      columns={columns}
      onToggleColumn={toggleColumn}
      onReorderColumns={reorderColumns}
      onResetColumns={resetColumns}
    />
  );
};

export default PhongBanToolbar;
