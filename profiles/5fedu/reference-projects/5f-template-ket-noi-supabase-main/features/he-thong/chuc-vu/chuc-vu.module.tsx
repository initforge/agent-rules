import { lazy } from 'react';
import { txt } from '@/lib/text';
import { getLanguage } from '@/lib/utils';
import { matchesSearchTerm } from '@/lib/searchUtils';
import { departmentsQueryOptions } from '@/features/he-thong/queries/master-data';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { createFlatListFeatureModule } from '@/lib/factories/create-flat-list-feature-module';
import { createTrangThaiLookupSheet } from '@/lib/import';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position, PositionFilters } from './core/types';
import { usePositionStore } from './store/usePositionStore';
import {
  usePositions,
  useDeletePosition,
  useUpdateStatusPosition,
  useImportPositions,
} from './hooks/use-chuc-vu';
import { usePositionFilterCounts } from './hooks/use-position-filter-counts';
import { POSITION_SEARCHABLE_KEYS } from './utils/search-keys';
import { positionMatchesColumnSearch } from './utils/column-search';
import {
  defaultPositionSort,
  getDepartmentSubtreeIds,
} from './utils/build-position-tree-rows';
import PositionToolbar from './components/chuc-vu-toolbar';
import PositionList from './components/chuc-vu-list';

const PositionForm = lazy(() => import('./components/chuc-vu-form'));
const PositionDetail = lazy(() => import('./components/chuc-vu-detail'));

type PositionListProps = React.ComponentProps<typeof PositionList>;

function getScopedDepartments(departments: Department[], filters: PositionFilters): Department[] {
  let visible = departments;
  if (filters.id_phong_goc.length > 0) {
    const subtreeIds = getDepartmentSubtreeIds(departments, filters.id_phong_goc);
    visible = visible.filter((d) => subtreeIds.has(d.id));
  }
  if (filters.phong_ban_id.length > 0) {
    const byId = new Map(visible.map((d) => [d.id, d] as const));
    const wanted = new Set<string>();
    for (const id of filters.phong_ban_id) {
      let cur = byId.get(id);
      while (cur) {
        wanted.add(cur.id);
        cur = cur.cha_id ? byId.get(cur.cha_id) : undefined;
      }
    }
    visible = visible.filter((d) => wanted.has(d.id));
  }
  return visible;
}

function usePositionFilterCountsFromStore() {
  const { data: positions = [] } = usePositions();
  const { data: departments = [] } = useDepartments();
  const { searchTerm, filters } = usePositionStore();
  return usePositionFilterCounts(positions, departments, searchTerm, filters);
}

const ChucVuPage = createFlatListFeatureModule<Position, PositionFilters, PositionListProps>({
  usePrimaryData: usePositions,
  useSecondaryData: useDepartments,
  prefetchOnMount: (queryClient) => {
    void queryClient.prefetchQuery(departmentsQueryOptions());
  },
  useStore: usePositionStore,
  keyExtractor: (p) => p.id,
  filterFn: (item, term, f, departments) => {
    const depts = departments as Department[];
    const matchesSearch = matchesSearchTerm(
      item as Record<string, unknown>,
      term,
      POSITION_SEARCHABLE_KEYS,
    );
    const statusKey = item.trang_thai === 'Đang hoạt động' ? 'Active' : 'Inactive';
    const matchesStatus = f.status.length === 0 || f.status.includes(statusKey);
    const matchesRoot =
      f.id_phong_goc.length === 0 ||
      (item.phong_ban_id != null &&
        getDepartmentSubtreeIds(depts, f.id_phong_goc).has(item.phong_ban_id));
    const matchesGroup =
      f.phong_ban_id.length === 0 ||
      (item.phong_ban_id != null && f.phong_ban_id.includes(item.phong_ban_id));
    const matchesLevel =
      f.cap_bac.length === 0 ||
      (item.cap_bac != null && f.cap_bac.includes(String(item.cap_bac)));
    const matchesCol = positionMatchesColumnSearch(item, f.columnSearch);
    return matchesSearch && matchesStatus && matchesRoot && matchesGroup && matchesLevel && matchesCol;
  },
  sortFn: (a, b, sort) => {
    const key = sort.column as keyof Position;
    const aVal = a[key] ?? '';
    const bVal = b[key] ?? '';
    return typeof aVal === 'number' && typeof bVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal), getLanguage());
  },
  defaultSortFn: defaultPositionSort,
  exportMapFn: (item) => ({
    ma_chuc_vu: item.ma_chuc_vu,
    ten_chuc_vu: item.ten_chuc_vu,
    mo_ta: item.mo_ta ?? '',
    trang_thai_text: item.trang_thai,
  }),
  importColumns: [
    { key: 'ma_chuc_vu', label: txt('position.form.code'), required: true },
    { key: 'ten_chuc_vu', label: txt('position.form.name'), required: true },
    { key: 'cap_bac', label: txt('position.form.level') },
    { key: 'ma_phong_ban', label: `${txt('position.form.department')} (mã)` },
    { key: 'mo_ta', label: txt('position.form.description') },
    { key: 'thu_tu', label: txt('position.store.orderCol') },
    { key: 'trang_thai', label: txt('common.status') },
  ],
  exportColumns: [
    { key: 'ma_chuc_vu', label: txt('position.exportCode') },
    { key: 'ten_chuc_vu', label: txt('position.exportName') },
    { key: 'mo_ta', label: txt('position.exportDesc') },
    { key: 'trang_thai_text', label: txt('position.exportStatus') },
  ],
  exportFileName: 'Danh_Sach_Chuc_Vu',
  importTemplateName: txt('position.importTemplateName'),
  noExportDataMessage: txt('position.noExportData'),
  importLookupSheets: ({ secondary }) => {
    const departments = secondary as Department[];
    return [
      {
        sheetName: 'Phong_ban',
        title: txt('position.form.department'),
        columns: [
          { key: 'ma_phong_ban', label: txt('department.code') },
          { key: 'ten_phong_ban', label: txt('department.name') },
        ],
        rows: departments.map((d) => ({
          ma_phong_ban: d.ma_phong_ban,
          ten_phong_ban: d.ten_phong_ban,
        })),
        mapsToImportKeys: ['ma_phong_ban'],
      },
      createTrangThaiLookupSheet(),
    ];
  },
  useImportMutation: useImportPositions,
  useDeleteMutation: useDeletePosition,
  useStatusMutation: useUpdateStatusPosition,
  getDeleteTitle: () => txt('position.deleteTitle'),
  getDeleteMessage: () => txt('position.deleteMessage'),
  getStatusChangeTitle: () => txt('position.statusChangeTitle'),
  getBulkDeleteMessage: (count) => txt('position.bulkDeleteMessage', { count }),
  getBulkStatusMessage: (count, status) =>
    `${txt('position.statusChangeMessage', { count })} ${status}?`,
  ToolbarComponent: PositionToolbar,
  useFilterCounts: usePositionFilterCountsFromStore,
  pruneFilters: (filters, departments, setFilter) => {
    const depts = departments as Department[];
    if (filters.phong_ban_id.length === 0) return;
    if (filters.id_phong_goc.length === 0) return;
    const subtreeIds = getDepartmentSubtreeIds(depts, filters.id_phong_goc);
    const pruned = filters.phong_ban_id.filter((id) => subtreeIds.has(id));
    if (pruned.length !== filters.phong_ban_id.length) {
      setFilter('phong_ban_id', pruned);
    }
  },
  syncViewingItem: (viewing, primary) => primary.find((p) => p.id === viewing.id) ?? viewing,
  buildToolbarProps: ({
    filterCounts,
    onAdd,
    onExport,
    onImport,
    onDeleteMany,
    onStatusChangeMany,
  }) => ({
    deptCounts: filterCounts.deptCounts as Record<string, number>,
    groupCounts: filterCounts.groupCounts as Record<string, number>,
    levelCounts: filterCounts.levelCounts as Record<string, number>,
    distinctLevels: (filterCounts.distinctLevels as number[] | undefined) ?? [],
    statusCounts: filterCounts.statusCounts as { Active: number; Inactive: number },
    onAdd,
    onExport,
    onImport,
    onDeleteMany,
    onStatusChangeMany,
  }),
  buildListProps: ({
    filtered,
    sortFn,
    isLoading,
    secondaryData,
    filterCounts,
    onEdit,
    onDelete,
    onStatusChange,
    onView,
    onAddWithContext,
  }) => {
    const departments = secondaryData as Department[];
    const { filters } = usePositionStore.getState();
    return {
      departments: getScopedDepartments(departments, filters),
      allDepartments: departments,
      positions: filtered,
      sortPositions: sortFn,
      isLoading,
      statusCounts: filterCounts.statusCounts as { Active: number; Inactive: number },
      rootDeptCounts: filterCounts.deptCounts as Record<string, number>,
      onEdit,
      onDelete,
      onStatusChange,
      onView,
      onAddForDepartment: (dept: Department) => onAddWithContext(dept.id),
    };
  },
  getFormExtraProps: (deptId) => (deptId ? { defaultPhongBanId: deptId } : {}),
  ListComponent: PositionList,
  FormComponent: PositionForm,
  DetailComponent: PositionDetail,
});

export default ChucVuPage;
