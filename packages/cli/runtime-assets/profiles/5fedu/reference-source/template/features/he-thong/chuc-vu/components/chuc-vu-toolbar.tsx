import React, { useMemo } from 'react';
import { txt } from '@/lib/text';
import { Download, Upload, Tag, Building2, FolderTree, BarChart3 } from 'lucide-react';
import {
  ListToolbarAddButton,
  ListToolbarIconButton,
} from '@/components/shared/ListToolbarActions';
import { useResourcePermissions } from '@/hooks/use-resource-permissions';
import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';
import { usePositionStore } from '../store/usePositionStore';
import { useShallow } from 'zustand/react/shallow';
import GenericToolbar from '@/components/shared/GenericToolbar';
import FilterChipMultiSelect from '@/components/shared/FilterChipMultiSelect';
import ToolbarFilterChipGroup, {
  INLINE_CHIP_CLASS,
  MENU_CHIP_CLASS,
  type ToolbarFilterChipItem,
} from '@/components/shared/ToolbarFilterChipGroup';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { useHierarchyRootFilter } from '@/hooks/use-hierarchy-root-filter';
import { countColumnSearchActive } from '../utils/column-search';
import { getDepartmentSubtreeIds } from '../utils/build-position-tree-rows';

interface Props {
  /** Count chức vụ theo phòng gốc — từ `usePositionFilterCounts`. */
  deptCounts: Record<string, number>;
  /** Count chức vụ theo phòng ban con (nhóm). */
  groupCounts: Record<string, number>;
  /** Count chức vụ theo cấp bậc (key = chuỗi số). */
  levelCounts: Record<string, number>;
  statusCounts: { Active: number; Inactive: number };
  /** Tập cấp bậc duy nhất xuất hiện trong dữ liệu (đã sort tăng dần). */
  distinctLevels: number[];
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
  onDeleteMany: (ids: string[]) => void;
  onStatusChangeMany: (ids: string[], status: TrangThaiHoatDong) => void;
}

const chipClass = (layout: 'inline' | 'menu', width?: string) =>
  layout === 'inline' ? (width ?? INLINE_CHIP_CLASS) : MENU_CHIP_CLASS;

const PositionToolbar: React.FC<Props> = ({
  deptCounts,
  groupCounts,
  levelCounts,
  statusCounts,
  distinctLevels,
  onAdd, onExport, onImport, onDeleteMany, onStatusChangeMany
}) => {
  const { canCreate, canImport, canExport, canDelete, canEdit } = useResourcePermissions('positions');

  const {
    searchTerm,
    setSearchTerm,
    filters,
    setFilter,
    columns,
    toggleColumn,
    reorderColumns,
    resetColumns,
    selectedIds,
    clearSelection,
  } = usePositionStore(
    useShallow((s) => ({
      searchTerm: s.searchTerm,
      setSearchTerm: s.setSearchTerm,
      filters: s.filters,
      setFilter: s.setFilter,
      columns: s.columns,
      toggleColumn: s.toggleColumn,
      reorderColumns: s.reorderColumns,
      resetColumns: s.resetColumns,
      selectedIds: s.selectedIds,
      clearSelection: s.clearSelection,
    })),
  );

  const { data: departments = [] } = useDepartments();

  const selectedCount = selectedIds.size;

  const phongOptionsWithCount = useHierarchyRootFilter({
    items: departments,
    getId: (d) => d.id,
    getParentId: (d) => d.cha_id,
    getOrder: (d) => d.thu_tu,
    getRootLabel: (d) => d.ten_phong_ban,
  });

  const departmentOptions = useMemo(
    () =>
      phongOptionsWithCount.map((o) => ({
        label: o.label,
        value: o.value,
        count: deptCounts[o.value] ?? 0,
      })),
    [phongOptionsWithCount, deptCounts],
  );

  /** Options cho chip Nhóm — phụ thuộc Phòng gốc. */
  const groupOptions = useMemo(() => {
    let scope = departments.filter((d) => d.cap_do != null && d.cap_do >= 2);
    if (filters.id_phong_goc.length > 0) {
      const subtreeIds = getDepartmentSubtreeIds(departments, filters.id_phong_goc);
      scope = scope.filter((d) => subtreeIds.has(d.id));
    }
    return scope
      .slice()
      .sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0))
      .map((d) => ({
        label: d.ten_phong_ban,
        value: d.id,
        count: groupCounts[d.id] ?? 0,
      }));
  }, [departments, filters.id_phong_goc, groupCounts]);

  const levelOptions = useMemo(
    () =>
      (distinctLevels ?? []).map((lv) => ({
        label: txt('position.toolbar.levelLabel', { value: String(lv) }),
        value: String(lv),
        count: levelCounts[String(lv)] ?? 0,
      })),
    [distinctLevels, levelCounts],
  );

  const activeFilterCount = useMemo(() => {
    const columnSearchN = countColumnSearchActive(filters.columnSearch);
    return (searchTerm ? 1 : 0)
      + columnSearchN
      + (filters.id_phong_goc.length > 0 ? 1 : 0)
      + (filters.phong_ban_id.length > 0 ? 1 : 0)
      + (filters.cap_bac.length > 0 ? 1 : 0)
      + (filters.status.length > 0 ? 1 : 0);
  }, [searchTerm, filters]);

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setFilter('columnSearch', {});
    setFilter('status', []);
    setFilter('id_phong_goc', []);
    setFilter('phong_ban_id', []);
    setFilter('cap_bac', []);
  };

  const statusOptions = useMemo(
    () => [
      { label: txt('common.activeStatus'), value: 'Active', count: statusCounts.Active },
      { label: txt('common.inactiveStatus'), value: 'Inactive', count: statusCounts.Inactive },
    ],
    [statusCounts],
  );

  const filterGroups = useMemo(
    () => [
      {
        key: 'id_phong_goc',
        label: txt('department.toolbar.department'),
        icon: Building2,
        options: departmentOptions,
        value: filters.id_phong_goc,
        onChange: (val: string[]) => setFilter('id_phong_goc', val),
      },
      {
        key: 'phong_ban_id',
        label: txt('position.toolbar.group'),
        icon: FolderTree,
        options: groupOptions,
        value: filters.phong_ban_id,
        onChange: (val: string[]) => setFilter('phong_ban_id', val),
      },
      {
        key: 'cap_bac',
        label: txt('position.toolbar.level'),
        icon: BarChart3,
        options: levelOptions,
        value: filters.cap_bac,
        onChange: (val: string[]) => setFilter('cap_bac', val),
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
    [
      filters.id_phong_goc,
      filters.phong_ban_id,
      filters.cap_bac,
      filters.status,
      setFilter,
      departmentOptions,
      groupOptions,
      levelOptions,
      statusOptions,
    ],
  );

  const filterChipItems = useMemo<ToolbarFilterChipItem[]>(
    () => [
      {
        id: 'id_phong_goc',
        active: filters.id_phong_goc.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={departmentOptions}
            value={filters.id_phong_goc}
            onChange={(val) => setFilter('id_phong_goc', val)}
            placeholder={txt('department.toolbar.department')}
            icon={Building2}
            className={chipClass(layout)}
          />
        ),
      },
      {
        id: 'phong_ban_id',
        active: filters.phong_ban_id.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={groupOptions}
            value={filters.phong_ban_id}
            onChange={(val) => setFilter('phong_ban_id', val)}
            placeholder={txt('position.toolbar.group')}
            icon={FolderTree}
            className={chipClass(layout)}
          />
        ),
      },
      {
        id: 'cap_bac',
        active: filters.cap_bac.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={levelOptions}
            value={filters.cap_bac}
            onChange={(val) => setFilter('cap_bac', val)}
            placeholder={txt('position.toolbar.level')}
            icon={BarChart3}
            className={chipClass(layout, 'w-[140px]')}
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
    [
      departmentOptions,
      groupOptions,
      levelOptions,
      statusOptions,
      filters.id_phong_goc,
      filters.phong_ban_id,
      filters.cap_bac,
      filters.status,
      setFilter,
    ],
  );

  const renderFilters = useMemo(
    () => <ToolbarFilterChipGroup items={filterChipItems} maxVisible={3} />,
    [filterChipItems],
  );

  const mobileActions = useMemo(
    () => [
      ...(canImport ? [{ key: 'import', label: txt('common.import'), icon: Upload, onClick: onImport, description: '' }] : []),
      ...(canExport ? [{ key: 'export', label: txt('common.export'), icon: Download, onClick: onExport, description: '' }] : []),
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
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onClearSelection={clearSelection}
        actions={renderActions}
        filters={renderFilters}
        filterGroups={filterGroups}
        mobileActions={mobileActions}
        onAdd={canCreate ? onAdd : undefined}
        searchPlaceholder={txt('common.searchPlaceholder')}
        activeFilterCount={activeFilterCount}
        onClearAllFilters={handleClearAllFilters}
        onDeleteMany={canDelete ? () => onDeleteMany(Array.from(selectedIds)) : undefined}
        onStatusChangeMany={canEdit ? (status) => onStatusChangeMany(Array.from(selectedIds), status) : undefined}
        columns={columns}
        onToggleColumn={toggleColumn}
        onReorderColumns={reorderColumns}
        onResetColumns={resetColumns}
        showBack
    />
  );
};

export default PositionToolbar;
