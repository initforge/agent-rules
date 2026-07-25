
import React, { useMemo } from 'react';
import { txt } from '@/lib/text';
import { Download, Upload, Building2, Briefcase, Tag, Pencil, Check, Power, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { useResourcePermissions } from '@/hooks/use-resource-permissions';
import { useEmployeeStore } from '../store/useEmployeeStore';
import { useShallow } from 'zustand/react/shallow';
import GenericToolbar from '@/components/shared/GenericToolbar';
import FilterChipMultiSelect from '@/components/shared/FilterChipMultiSelect';
import ToolbarFilterChipGroup, {
  INLINE_CHIP_CLASS,
  MENU_CHIP_CLASS,
  type ToolbarFilterChipItem,
} from '@/components/shared/ToolbarFilterChipGroup';
import {
  ListToolbarAddButton,
  ListToolbarIconButton,
} from '@/components/shared/ListToolbarActions';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { usePositions } from '@/features/he-thong/chuc-vu/hooks/use-chuc-vu';
import { GENDER_OPTIONS, STATUS_OPTIONS, type TrangThaiNhanVien } from '../core/constants';
import { useFilterCounts } from '../hooks/use-filter-counts';
import type { Employee } from '../core/types';
import { countColumnSearchActive } from '../utils/column-search';

interface Props {
  /** Danh sách nhân viên người dùng được phép xem (sau phân quyền). Count trong filter chip đếm trên chính list này. */
  employees: Employee[];
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
  onDeleteMany: (ids: string[]) => void;
  onStatusChangeMany: (ids: string[], status: TrangThaiNhanVien) => void;
  onBulkEdit?: () => void;
}

const chipClass = (layout: 'inline' | 'menu', width?: string) =>
  layout === 'inline' ? (width ?? INLINE_CHIP_CLASS) : MENU_CHIP_CLASS;

const EmployeeToolbar: React.FC<Props> = ({ 
    employees, onAdd, onExport, onImport, onDeleteMany, onStatusChangeMany, onBulkEdit,
}) => {
  const { canCreate, canImport, canExport, canEdit, canDelete } = useResourcePermissions('employees');

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
  } = useEmployeeStore(
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
  const { data: positions = [] } = usePositions();

  const { deptCounts, posCounts, statusCounts, genderCounts } = useFilterCounts(employees, searchTerm, filters);

  const departmentOptions = useMemo(
    () => departments.map(d => ({ label: d.ten_phong_ban, value: d.id, count: deptCounts[d.id] || 0 })),
    [departments, deptCounts]
  );
  const positionOptions = useMemo(
    () => positions.map(p => ({ label: p.ten_chuc_vu, value: p.id, count: posCounts[p.id] || 0 })),
    [positions, posCounts]
  );
  const statusOptions = useMemo(
    () => STATUS_OPTIONS.map(s => ({ label: s.label, value: String(s.value), count: statusCounts[String(s.value)] || 0 })),
    [statusCounts]
  );
  const genderOptions = useMemo(
    () => GENDER_OPTIONS.map(g => ({ label: g.label, value: g.value, count: genderCounts[g.value] || 0 })),
    [genderCounts]
  );

  const activeFilterCount = useMemo(() => {
    const columnSearchN = countColumnSearchActive(filters.columnSearch);
    return (searchTerm ? 1 : 0)
      + columnSearchN
      + (filters.phong_ban_id.length > 0 ? 1 : 0)
      + (filters.position.length > 0 ? 1 : 0)
      + (filters.trang_thai.length > 0 ? 1 : 0)
      + (filters.gender.length > 0 ? 1 : 0);
  }, [searchTerm, filters]);

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setFilter('columnSearch', {});
    setFilter('phong_ban_id', []);
    setFilter('position', []);
    setFilter('trang_thai', []);
    setFilter('gender', []);
  };

  const filterGroups = useMemo(() => [
    {
      key: 'phong_ban_id',
      label: txt('employee.toolbar.department'),
      icon: Building2,
      options: departmentOptions,
      value: filters.phong_ban_id,
      onChange: (val: string[]) => setFilter('phong_ban_id', val),
    },
    {
      key: 'position',
      label: txt('employee.toolbar.position'),
      icon: Briefcase,
      options: positionOptions,
      value: filters.position,
      onChange: (val: string[]) => setFilter('position', val),
    },
    {
      key: 'trang_thai',
      label: txt('employee.toolbar.status'),
      icon: Tag,
      options: statusOptions,
      value: filters.trang_thai,
      onChange: (val: string[]) => setFilter('trang_thai', val),
    },
    {
      key: 'gender',
      label: txt('employee.toolbar.gender'),
      icon: Users,
      options: genderOptions,
      value: filters.gender,
      onChange: (val: string[]) => setFilter('gender', val),
    },
  ], [departmentOptions, positionOptions, statusOptions, genderOptions, filters, setFilter]);

  const bulkStatusActions = useMemo(
    () => (
      <>
        <button
          type="button"
          onClick={() => onStatusChangeMany(Array.from(selectedIds), 'Đang làm việc')}
          className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 h-8 w-8 sm:w-auto sm:px-3 flex items-center justify-center sm:gap-1.5 text-primary bg-primary/10 rounded-lg border border-primary/20 active:scale-95 sm:hover:bg-primary/15 sm:transition-all"
          aria-label={txt('employee.statusActiveShort')}
        >
          <Check size={14} className="stroke-[2.5px] shrink-0" />
          <span className="hidden sm:inline text-xs font-medium">{txt('employee.statusActiveShort')}</span>
        </button>
        <button
          type="button"
          onClick={() => onStatusChangeMany(Array.from(selectedIds), 'Nghỉ việc')}
          className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 h-8 w-8 sm:w-auto sm:px-3 flex items-center justify-center sm:gap-1.5 text-muted-foreground bg-muted/50 rounded-lg border border-border active:scale-95 sm:hover:bg-muted sm:transition-all"
          aria-label={txt('employee.statusInactiveShort')}
        >
          <Power size={14} className="stroke-[2.5px] shrink-0" />
          <span className="hidden sm:inline text-xs font-medium">{txt('employee.statusInactiveShort')}</span>
        </button>
      </>
    ),
    [onStatusChangeMany, selectedIds],
  );

  const mobileActions = useMemo(() => [
    ...(onBulkEdit && selectedIds.size > 0 && canEdit ? [{
      key: 'bulk-edit',
      label: txt('employee.toolbar.bulkEdit'),
      icon: Pencil,
      onClick: onBulkEdit,
      description: txt('employee.toolbar.bulkEditDesc', { count: selectedIds.size }),
    }] : []),
    ...(canImport ? [{
      key: 'import',
      label: txt('employee.toolbar.importData'),
      icon: Upload,
      onClick: onImport,
      description: txt('employee.toolbar.importDesc'),
    }] : []),
    ...(canExport ? [{
      key: 'export',
      label: txt('employee.toolbar.exportData'),
      icon: Download,
      onClick: onExport,
      description: txt('employee.toolbar.exportDesc'),
    }] : []),
  ], [onImport, onExport, onBulkEdit, selectedIds.size, canImport, canExport, canEdit]);

  const filterChipItems = useMemo<ToolbarFilterChipItem[]>(
    () => [
      {
        id: 'phong_ban_id',
        active: filters.phong_ban_id.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={departmentOptions}
            value={filters.phong_ban_id}
            onChange={(val) => setFilter('phong_ban_id', val)}
            placeholder={txt('employee.toolbar.department')}
            icon={Building2}
            className={chipClass(layout)}
          />
        ),
      },
      {
        id: 'position',
        active: filters.position.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={positionOptions}
            value={filters.position}
            onChange={(val) => setFilter('position', val)}
            placeholder={txt('employee.toolbar.position')}
            icon={Briefcase}
            className={chipClass(layout, 'w-[136px]')}
          />
        ),
      },
      {
        id: 'trang_thai',
        active: filters.trang_thai.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={statusOptions}
            value={filters.trang_thai}
            onChange={(val) => setFilter('trang_thai', val)}
            placeholder={txt('employee.toolbar.status')}
            icon={Tag}
            className={chipClass(layout, 'w-[132px]')}
          />
        ),
      },
      {
        id: 'gender',
        active: filters.gender.length > 0,
        renderChip: (layout) => (
          <FilterChipMultiSelect
            options={genderOptions}
            value={filters.gender}
            onChange={(val) => setFilter('gender', val)}
            placeholder={txt('employee.toolbar.gender')}
            icon={Users}
            className={chipClass(layout, 'w-[132px]')}
          />
        ),
      },
    ],
    [
      departmentOptions,
      positionOptions,
      statusOptions,
      genderOptions,
      filters.phong_ban_id,
      filters.position,
      filters.trang_thai,
      filters.gender,
      setFilter,
    ],
  );

  const renderFilters = useMemo(
    () => <ToolbarFilterChipGroup items={filterChipItems} maxVisible={3} />,
    [filterChipItems],
  );

  const renderActions = (
    <>
        {onBulkEdit && selectedIds.size > 0 && canEdit && (
          <Tooltip content={txt('employee.toolbar.bulkEdit')} placement="bottom">
            <Button variant="outline" size="sm" onClick={onBulkEdit} className="inline-flex h-8 px-2.5 items-center gap-1.5 border-primary/30 text-primary bg-primary/5 hover:bg-primary/10">
                <Pencil className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{txt('employee.toolbar.editCount', { count: selectedIds.size })}</span>
            </Button>
          </Tooltip>
        )}
        {canImport && (
          <ListToolbarIconButton
            icon={Upload}
            tooltip={txt('employee.toolbar.importData')}
            onClick={onImport}
          />
        )}
        {canExport && (
          <ListToolbarIconButton
            icon={Download}
            tooltip={txt('employee.toolbar.exportData')}
            onClick={onExport}
          />
        )}
        {canCreate && <ListToolbarAddButton onClick={onAdd} />}
    </>
  );

  return (
    <GenericToolbar
        selectedCount={selectedIds.size}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onClearSelection={clearSelection}
        actions={renderActions}
        filters={renderFilters}
        filterGroups={filterGroups}
        mobileActions={mobileActions}
        onAdd={canCreate ? onAdd : undefined}
        onDeleteMany={canDelete ? () => onDeleteMany(Array.from(selectedIds)) : undefined}
        bulkActions={canEdit ? bulkStatusActions : undefined}
        columns={columns}
        onToggleColumn={toggleColumn}
        onReorderColumns={reorderColumns}
        onResetColumns={resetColumns}
        showBack
        activeFilterCount={activeFilterCount}
        onClearAllFilters={handleClearAllFilters}
    />
  );
};

export default EmployeeToolbar;
