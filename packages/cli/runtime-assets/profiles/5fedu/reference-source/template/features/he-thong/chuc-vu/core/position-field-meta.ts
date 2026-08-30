import type { DataTypeId } from '@/lib/data-types';
import type { PositionFormValues } from './schema';

export const POSITION_FIELD_DATA_TYPE: Partial<
  Record<keyof PositionFormValues, DataTypeId>
> = {
  ma_chuc_vu: 'text',
  ten_chuc_vu: 'text',
  cap_bac: 'number',
  phong_ban_id: 'ref',
  mo_ta: 'long_text',
  thu_tu: 'number',
  trang_thai: 'enum',
};

export function getPositionFieldDataType(
  field: keyof PositionFormValues
): DataTypeId | undefined {
  return POSITION_FIELD_DATA_TYPE[field];
}
