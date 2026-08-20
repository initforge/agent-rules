import React, { lazy, useMemo } from 'react';
import { List, BarChart3 } from 'lucide-react';
import { txt } from '@/lib/text';
import { SERVER_GC_TIME_MS } from '@/lib/supabase/query-config';
import {
  departmentsQueryOptions,
  jobLevelsQueryOptions,
  activePositionsQueryOptions,
  positionsQueryOptions,
} from '@/features/he-thong/queries/master-data';
import { DRAWER_Z_CONTENT_BASE } from '@/lib/dialog-sizes';
import { createFeatureModule } from '@/lib/factories/create-feature-module';
import type { ImportLookupSheet } from '@/lib/import';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { useActivePositions } from '@/features/he-thong/chuc-vu/hooks/use-chuc-vu';
import { formatDate, getLanguage } from '@/lib/utils';
import { matchesSearchTerm } from '@/lib/searchUtils';
import { employeeMatchesColumnSearch } from './utils/column-search';
import type { Employee, EmployeeFilters } from './core/types';
import { TRANG_THAI_NHAN_VIEN } from './core/constants';
import { useEmployeeStore } from './store/useEmployeeStore';
import { useEmployees, useImportEmployees } from './hooks/use-nhan-vien';
import { useEmployeePageHandlers } from './hooks/use-employee-page-handlers';
import EmployeeToolbar from './components/nhan-vien-toolbar';
import EmployeeTable from './components/nhan-vien-table';
import EmployeeStats from './components/nhan-vien-stats';
import BulkEditSheet from './components/nhan-vien-bulk-edit';
import type { SortState } from '@/store/createGenericStore';

const EmployeeForm = lazy(() => import('./components/nhan-vien-form'));
const EmployeeDetail = lazy(() => import('./components/nhan-vien-detail'));

const DrawerLazyFallback: React.FC = () => (
  <div
    className="fixed inset-0 flex items-center justify-center bg-black/30 pointer-events-none"
    style={{ zIndex: DRAWER_Z_CONTENT_BASE }}
  >
    <div
      className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent"
      aria-hidden
    />
  </div>
);

const NHAN_VIEN_SEARCHABLE_KEYS: string[] = [
  'id',
  'ho_ten',
  'ten_dang_nhap',
  'ten_chuc_vu',
  'email',
  'so_dien_thoai',
  'tg_tao',
  'gioi_tinh',
  'trang_thai',
  'ten_phong_ban',
  'ten_bo_phan',
  'trang_thai_text',
  'tg_tao_text',
];

function employeeSortKey(columnId: string): keyof Employee {
  if (columnId === 'lien_he' || columnId === 'so_dien_thoai') return 'so_dien_thoai';
  return columnId as keyof Employee;
}

function clientSortEmployees(items: Employee[], sort: SortState): Employee[] {
  if (!sort.column || !sort.direction) return items;
  const sorted = [...items];
  sorted.sort((a, b) => {
    const key = employeeSortKey(sort.column!);
    const aVal = a[key] ?? '';
    const bVal = b[key] ?? '';
    const cmp =
      typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), getLanguage());
    return sort.direction === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

function useEmployeeImportLookupSheets(): ImportLookupSheet[] {
  const { data: departments = [] } = useDepartments();
  const { data: positions = [] } = useActivePositions();

  return useMemo(
    () => [
      {
        sheetName: 'Phong_ban',
        title: txt('employee.department'),
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
      {
        sheetName: 'Chuc_vu',
        title: txt('employee.position'),
        columns: [
          { key: 'ma_chuc_vu', label: txt('position.form.code') },
          { key: 'ten_chuc_vu', label: txt('position.form.name') },
        ],
        rows: positions.map((p) => ({
          ma_chuc_vu: p.ma_chuc_vu,
          ten_chuc_vu: p.ten_chuc_vu,
        })),
        mapsToImportKeys: ['ma_chuc_vu'],
      },
      {
        sheetName: 'Trang_thai_NV',
        title: txt('employee.status'),
        columns: [{ key: 'trang_thai', label: txt('employee.status') }],
        rows: TRANG_THAI_NHAN_VIEN.map((trang_thai) => ({ trang_thai })),
        mapsToImportKeys: ['trang_thai'],
      },
      {
        sheetName: 'Gioi_tinh',
        title: txt('employee.gender'),
        columns: [{ key: 'gioi_tinh', label: txt('employee.gender') }],
        rows: [{ gioi_tinh: 'Nam' }, { gioi_tinh: 'Nữ' }, { gioi_tinh: 'Khác' }],
        mapsToImportKeys: ['gioi_tinh'],
      },
    ],
    [departments, positions],
  );
}

const NhanVienPage = createFeatureModule<Employee, EmployeeFilters>({
  name: 'Nhân viên',

  tabs: [
    { id: 'list', label: txt('employee.tabList'), icon: List },
    { id: 'stats', label: txt('employee.tabStats'), icon: BarChart3 },
  ],

  urlTabs: { validTabs: ['list', 'stats'], defaultTab: 'list' },

  useData: (ctx) => {
    const result = useEmployees({ loadFullForStats: ctx?.activeTab === 'stats' });
    return {
      data: result.data,
      isLoading: result.isLoading,
      total: result.total,
      isServerPaginated: result.isServerPaginated,
      mode: result.mode,
    };
  },

  useStore: useEmployeeStore,
  keyExtractor: (e) => e.id,

  filterFn: (emp, term, f) => {
    const matchesSearch = matchesSearchTerm(
      emp as Record<string, unknown>,
      term,
      NHAN_VIEN_SEARCHABLE_KEYS,
    );
    const matchesStatus = f.trang_thai.length === 0 || f.trang_thai.includes(emp.trang_thai);
    const matchesDept =
      f.phong_ban_id.length === 0 ||
      (emp.phong_ban_id && f.phong_ban_id.includes(emp.phong_ban_id));
    const matchesPosition =
      f.position.length === 0 || (emp.chuc_vu_id && f.position.includes(emp.chuc_vu_id));
    const matchesGender = f.gender.length === 0 || f.gender.includes(emp.gioi_tinh);
    const matchesColumnText = employeeMatchesColumnSearch(emp, f.columnSearch);
    return (
      matchesSearch &&
      matchesStatus &&
      matchesDept &&
      matchesPosition &&
      matchesGender &&
      matchesColumnText
    );
  },

  skipClientSort: ({ isServerPaginated }) => isServerPaginated,
  clientSortFn: clientSortEmployees,
  enableServerPaginationEffects: true,

  useMount: (queryClient) => {
    const prefetchOpts = { staleTime: Infinity, gcTime: SERVER_GC_TIME_MS };
    const prefetchMaster = () => {
      void queryClient.prefetchQuery({ ...departmentsQueryOptions(), ...prefetchOpts });
      void queryClient.prefetchQuery({ ...positionsQueryOptions(), ...prefetchOpts });
      void queryClient.prefetchQuery({ ...activePositionsQueryOptions(), ...prefetchOpts });
      void queryClient.prefetchQuery({ ...jobLevelsQueryOptions(), ...prefetchOpts });
    };
    const idleId =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(prefetchMaster, { timeout: 3000 })
        : window.setTimeout(prefetchMaster, 500);
    return () => {
      if (typeof cancelIdleCallback !== 'undefined' && typeof idleId === 'number') {
        cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId as number);
      }
    };
  },

  getToolbarExtraProps: ({ rawData }) => ({ employees: rawData }),
  getTableExtraProps: ({ rawData }) => ({ employeesForFilterCounts: rawData }),

  buildStatsProps: ({ rawData, isLoading, onViewItem }) => ({
    employees: rawData,
    isLoading,
    onViewItem,
  }),

  TableComponent: EmployeeTable,
  ToolbarComponent: EmployeeToolbar,
  FormComponent: EmployeeForm,
  DetailComponent: EmployeeDetail,
  StatsComponent: EmployeeStats,
  BulkEditComponent: ({ selectedItems, onClose, onSuccess }) => (
    <BulkEditSheet
      selectedEmployees={selectedItems}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  ),

  lazyDrawers: DrawerLazyFallback,
  getFormKey: (editing) => editing?.id ?? 'new',
  trackFormOrigin: true,
  usePageHandlers: useEmployeePageHandlers,

  importColumns: [
    { key: 'ho_ten', label: txt('employee.name'), required: true },
    { key: 'email', label: txt('employee.form.workEmail'), required: true },
    { key: 'so_dien_thoai', label: txt('employee.phone'), required: true },
    { key: 'ma_chuc_vu', label: txt('position.form.code'), required: true },
    { key: 'ma_phong_ban', label: txt('department.code') },
    { key: 'gioi_tinh', label: txt('employee.gender') },
    { key: 'trang_thai', label: txt('employee.status') },
    { key: 'ten_dang_nhap', label: txt('employee.form.loginName') },
    { key: 'mat_khau_tam', label: txt('employee.form.tempPassword') },
  ],
  exportColumns: [
    { key: 'id', label: 'ID' },
    { key: 'ho_ten', label: txt('employee.name') },
    { key: 'ten_dang_nhap', label: txt('employee.form.loginName') },
    { key: 'gioi_tinh', label: txt('employee.gender') },
    { key: 'email', label: txt('employee.form.workEmail') },
    { key: 'so_dien_thoai', label: txt('employee.phone') },
    { key: 'ten_chuc_vu', label: txt('employee.position') },
    { key: 'ten_phong_ban', label: txt('employee.department') },
    { key: 'ten_bo_phan', label: txt('employee.division') },
    { key: 'trang_thai_text', label: txt('employee.status') },
    { key: 'tg_tao_text', label: txt('employee.store.createdCol') },
  ],
  exportMapFn: (emp) => ({
    id: emp.id,
    ho_ten: emp.ho_ten,
    ten_dang_nhap: emp.ten_dang_nhap ?? '',
    gioi_tinh: emp.gioi_tinh,
    email: emp.email,
    so_dien_thoai: emp.so_dien_thoai,
    ten_chuc_vu: emp.ten_chuc_vu,
    ten_phong_ban: emp.ten_phong_ban,
    ten_bo_phan: emp.ten_bo_phan ?? '',
    trang_thai_text: emp.trang_thai,
    tg_tao_text: emp.tg_tao ? formatDate(emp.tg_tao) : '',
  }),
  exportFileName: txt('employee.exportFileName'),
  importFileName: txt('employee.importTemplateName'),
  useImportLookupSheets: useEmployeeImportLookupSheets,
  useImportMutation: useImportEmployees,
});

export default NhanVienPage;
