import type { DataTypeId } from '@/lib/data-types';
import type { EmployeeFormValues } from './schema';

export const EMPLOYEE_FIELD_DATA_TYPE: Partial<Record<keyof EmployeeFormValues, DataTypeId>> = {
  ho_ten: 'name',
  email: 'email',
  so_dien_thoai: 'phone',
  chuc_vu_id: 'ref',
  phong_ban_id: 'ref',
  gioi_tinh: 'enum',
  trang_thai: 'enum',
  anh_dai_dien: 'image',
};

export function getEmployeeFieldDataType(
  field: keyof EmployeeFormValues
): DataTypeId | undefined {
  return EMPLOYEE_FIELD_DATA_TYPE[field];
}
