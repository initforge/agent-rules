import { lazy } from 'react';
import { txt } from '@/lib/text';
import { createHierarchyFeatureModule } from '@/lib/factories/create-hierarchy-feature-module';
import { parseTrangThaiHoatDongImport } from '@/lib/constants/trang-thai';
import type { DepartmentFormValues } from './core/schema';
import type { Department } from './core/types';
import { useDepartmentStore, type DepartmentFilters } from './store/useDepartmentStore';
import {
  useDepartments,
  useDeleteDepartment,
  useUpdateStatusDepartment,
  useImportDepartments,
} from './hooks/use-phong-ban';
import { departmentMatchesColumnSearch } from './utils/column-search';
import { compareDepartments } from './utils/department-sort';
import { matchesSearchTerm } from '@/lib/searchUtils';
import { DEPARTMENT_SEARCHABLE_KEYS } from './utils/search-keys';
import { createTrangThaiLookupSheet } from '@/lib/import';
import PhongBanToolbar from './components/phong-ban-toolbar';
import DepartmentList from './components/phong-ban-list';

const DepartmentForm = lazy(() => import('./components/phong-ban-form'));
const DepartmentDetail = lazy(() => import('./components/phong-ban-detail'));

const PhongBanPage = createHierarchyFeatureModule<Department, DepartmentFilters, DepartmentFormValues>({
  useData: useDepartments,
  useStore: useDepartmentStore,
  keyExtractor: (d) => d.id,
  filterFn: (item, term, f, departments) => {
    const parentName = item.cha_id
      ? departments.find((p) => p.id === item.cha_id)?.ten_phong_ban ?? ''
      : '';
    const matchesSearch = matchesSearchTerm(
      { ...(item as Record<string, unknown>), ten_phong_cha: parentName },
      term,
      DEPARTMENT_SEARCHABLE_KEYS,
    );
    const matchesCol = departmentMatchesColumnSearch(item, f.columnSearch, parentName);
    const statusKey = item.trang_thai === 'Đang hoạt động' ? 'Active' : 'Inactive';
    const matchesStatus = f.status.length === 0 || f.status.includes(statusKey);
    const matchesPhong =
      f.id_phong_goc.length === 0 ||
      (() => {
        const visibleIds = new Set<string>();
        let current = new Set<string>(f.id_phong_goc);
        while (current.size > 0) {
          current.forEach((id) => visibleIds.add(id));
          const next = new Set<string>();
          departments.forEach((d) => {
            if (d.cha_id && current.has(d.cha_id)) next.add(d.id);
          });
          current = next;
        }
        return visibleIds.has(item.id);
      })();
    return matchesSearch && matchesCol && matchesStatus && matchesPhong;
  },
  sortItems: (items, sort, departments) => {
    const { column, direction } = sort;
    if (!column || !direction) return items;
    const mul = direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => mul * compareDepartments(a, b, column, departments));
  },
  exportMapFn: (item) => ({
    ma_phong_ban: item.ma_phong_ban,
    ten_phong_ban: item.ten_phong_ban,
    mo_ta: item.mo_ta ?? '',
    cap_do: item.cap_do,
    thu_tu: item.thu_tu,
    trang_thai_text:
      item.trang_thai === 'Đang hoạt động' ? txt('department.active') : txt('department.inactive'),
  }),
  importColumns: [
    { key: 'ma_phong_ban', label: txt('department.code'), required: true },
    { key: 'ten_phong_ban', label: txt('department.name'), required: true },
    { key: 'mo_ta', label: txt('department.store.descCol') },
    { key: 'cha_id', label: txt('department.form.parent') },
    { key: 'thu_tu', label: txt('department.detail.order') },
    { key: 'trang_thai', label: txt('common.status') },
  ],
  exportColumns: [
    { key: 'ma_phong_ban', label: txt('department.exportCode') },
    { key: 'ten_phong_ban', label: txt('department.exportName') },
    { key: 'mo_ta', label: txt('department.store.descCol') },
    { key: 'cap_do', label: txt('department.exportLevel') },
    { key: 'thu_tu', label: txt('department.exportOrder') },
    { key: 'trang_thai_text', label: txt('department.exportStatus') },
  ],
  exportFileName: 'Danh_Sach_Phong_Ban',
  importTemplateName: txt('department.importTemplateName'),
  noExportDataMessage: txt('department.noExportData'),
  importLookupSheets: ({ primary }) => [
    {
      sheetName: 'Phong_ban',
      title: txt('department.form.parent'),
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'ma_phong_ban', label: txt('department.code') },
        { key: 'ten_phong_ban', label: txt('department.name') },
      ],
      rows: primary.map((d) => ({
        id: d.id,
        ma_phong_ban: d.ma_phong_ban,
        ten_phong_ban: d.ten_phong_ban,
      })),
      mapsToImportKeys: ['cha_id'],
    },
    createTrangThaiLookupSheet(),
  ],
  mapImportRows: (data) =>
    data.map((row) => ({
      ma_phong_ban: String(row.ma_phong_ban ?? '').trim().toUpperCase(),
      ten_phong_ban: String(row.ten_phong_ban ?? '').trim(),
      mo_ta: row.mo_ta != null ? String(row.mo_ta).trim() : undefined,
      cha_id: row.cha_id != null && String(row.cha_id).trim() !== '' ? String(row.cha_id).trim() : '',
      thu_tu: Number(row.thu_tu) || 1,
      trang_thai: parseTrangThaiHoatDongImport(row.trang_thai),
    })),
  useDeleteMutation: useDeleteDepartment,
  useStatusMutation: useUpdateStatusDepartment,
  useImportMutation: useImportDepartments,
  getStatusToggle: (item) => ({
    next: item.trang_thai === 'Đang hoạt động' ? 'Ngừng hoạt động' : 'Đang hoạt động',
    label:
      item.trang_thai === 'Đang hoạt động' ? txt('department.active') : txt('department.inactive'),
  }),
  getDeleteTitle: () => txt('department.deleteTitle'),
  getDeleteMessage: () => txt('department.deleteMessage'),
  getStatusChangeTitle: () => txt('department.statusChangeTitle'),
  getStatusChangeMessage: (item, statusLabel) =>
    txt('department.statusChangeMessage', { name: item.ten_phong_ban, status: statusLabel }),
  ToolbarComponent: PhongBanToolbar,
  ListComponent: DepartmentList,
  FormComponent: DepartmentForm,
  DetailComponent: DepartmentDetail,
  canViewChild: (parent, child) => child.cha_id === parent.id,
  syncDetailOnFormClose: (wasEditing, formOrigin, detailRoot, allItems) => {
    if (formOrigin !== 'detail' || !wasEditing || !detailRoot || detailRoot.id !== wasEditing.id) {
      return null;
    }
    return allItems.find((d) => d.id === wasEditing.id) ?? undefined;
  },
});

export default PhongBanPage;
