import type { TableColumnPresetKey } from '@/lib/table-column-presets';

/**
 * Kiểu dữ liệu trường — đăng ký tập trung cho form / detail / bảng.
 * Đặt tên gần AppSheet / ERP; map sang component trong `registry.ts`.
 */
export const DATA_TYPE_IDS = [
  // Text
  'text',
  'long_text',
  'name',
  // Numeric
  'number',
  'decimal',
  'percent',
  'currency',
  // Temporal
  'date',
  'time',
  'datetime',
  'date_range',
  'month_year',
  'duration',
  // Selection
  'enum',
  'enum_list',
  'ref',
  'yes_no',
  'color',
  'progress',
  // Communication & links
  'email',
  'phone',
  'url',
  // Media & files
  'image',
  'multi_image',
  'file',
  'signature',
  'video',
  // Map / location
  'address',
  'lat_long',
  // Meta / layout
  'show',
  'app_link',
  // Audit (thường do DB/trigger)
  'change_counter',
  'change_timestamp',
  'change_location',
] as const;

export type DataTypeId = (typeof DATA_TYPE_IDS)[number];

export interface DataTypeDefinition {
  /** Khóa trong DATA_TYPE_IDS */
  id: DataTypeId;
  /** Nhãn hiển thị (vi) */
  labelVi: string;
  /** Gợi ý preset độ rộng cột bảng (nếu có) */
  tableColumnPreset?: TableColumnPresetKey;
  /** Tên export component form chính (documentation / codegen) */
  formComponent?: string;
  /** Tên component hiển thị read-only (nếu khác) */
  displayComponent?: string;
}
