
import { createGenericStore, ColumnConfig } from '@/store/createGenericStore';
import { TABLE_COLUMN_PRESETS } from '@/lib/table-column-presets';
import { EmployeeFilters } from '../core/types';
import { txt } from '@/lib/text';

const P = TABLE_COLUMN_PRESETS;

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'ho_ten', label: txt('employee.store.nameCol'), visible: true, ...P.personName, order: 0 },
  { id: 'ten_dang_nhap', label: txt('employee.form.loginName'), visible: true, minWidth: 120, maxWidth: 160, order: 1 },
  { id: 'so_dien_thoai', label: txt('employee.store.phoneCol'), visible: true, ...P.phone, order: 2 },
  { id: 'ten_chuc_vu', label: txt('employee.store.positionCol'), visible: true, ...P.titleShort, order: 3 },
  { id: 'ten_phong_ban', label: txt('employee.store.departmentCol'), visible: true, ...P.branch, order: 4 },
  { id: 'ten_bo_phan', label: txt('employee.store.divisionCol'), visible: true, ...P.branch, order: 5 },
  { id: 'email', label: txt('employee.store.emailCol'), visible: true, ...P.email, order: 6 },
  { id: 'gioi_tinh', label: txt('employee.store.genderCol'), visible: true, ...P.enumBadgeShort, order: 7 },
  { id: 'trang_thai', label: txt('employee.store.statusCol'), visible: true, ...P.enumBadge, order: 8 },
  { id: 'tg_tao', label: txt('employee.store.createdCol'), visible: false, ...P.date, order: 9 },
  { id: 'tg_cap_nhat', label: 'Cập nhật', visible: false, ...P.date, order: 10 },
];

const initialFilters: EmployeeFilters = {
  columnSearch: {},
  trang_thai: [],
  phong_ban_id: [],
  gender: [],
  position: [],
};

export const useEmployeeStore = createGenericStore<EmployeeFilters>(
  initialFilters,
  DEFAULT_COLUMNS
);
