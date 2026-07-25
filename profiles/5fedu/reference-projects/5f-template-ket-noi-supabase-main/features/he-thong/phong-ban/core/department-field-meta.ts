import type { DataTypeId } from '@/lib/data-types';
import type { DepartmentFormValues } from './schema';

export const DEPARTMENT_FIELD_DATA_TYPE: Partial<
  Record<keyof DepartmentFormValues, DataTypeId>
> = {
  ma_phong_ban: 'text',
  ten_phong_ban: 'text',
  mo_ta: 'long_text',
  cha_id: 'ref',
  trang_thai: 'enum',
  thu_tu: 'number',
};

export function getDepartmentFieldDataType(
  field: keyof DepartmentFormValues
): DataTypeId | undefined {
  return DEPARTMENT_FIELD_DATA_TYPE[field];
}
