import type { DataTypeDefinition, DataTypeId } from './types';
import type { TableColumnPresetKey } from '@/lib/table-column-presets';

/**
 * Đăng ký metadata cho từng DataType — dùng cho codegen, preset cột, tài liệu.
 * Không import React tại đây để tránh vòng phụ thuộc.
 */
export const DATA_TYPE_REGISTRY: Record<DataTypeId, DataTypeDefinition> = {
  text: {
    id: 'text',
    labelVi: 'Văn bản một dòng',
    tableColumnPreset: 'titleShort',
    formComponent: 'Input',
  },
  long_text: {
    id: 'long_text',
    labelVi: 'Văn bản nhiều dòng',
    tableColumnPreset: 'addressLine',
    formComponent: 'Textarea',
  },
  name: {
    id: 'name',
    labelVi: 'Tên (người / địa danh)',
    tableColumnPreset: 'personName',
    formComponent: 'Input',
  },
  number: {
    id: 'number',
    labelVi: 'Số nguyên',
    tableColumnPreset: 'code',
    formComponent: 'NumericFormatInput',
  },
  decimal: {
    id: 'decimal',
    labelVi: 'Số thập phân',
    tableColumnPreset: 'code',
    formComponent: 'NumericFormatInput',
  },
  percent: {
    id: 'percent',
    labelVi: 'Phần trăm',
    tableColumnPreset: 'percent',
    formComponent: 'PercentInput',
  },
  currency: {
    id: 'currency',
    labelVi: 'Tiền tệ',
    tableColumnPreset: 'code',
    formComponent: 'CurrencyInput',
  },
  date: {
    id: 'date',
    labelVi: 'Ngày',
    tableColumnPreset: 'date',
    formComponent: 'DatePicker',
  },
  time: {
    id: 'time',
    labelVi: 'Giờ',
    tableColumnPreset: 'time',
    formComponent: 'TimeInput',
  },
  datetime: {
    id: 'datetime',
    labelVi: 'Ngày giờ',
    tableColumnPreset: 'datetime',
    formComponent: 'DateTimeInput',
  },
  date_range: {
    id: 'date_range',
    labelVi: 'Khoảng ngày',
    tableColumnPreset: 'date',
    formComponent: 'DateRangePicker',
  },
  month_year: {
    id: 'month_year',
    labelVi: 'Tháng / năm',
    tableColumnPreset: 'date',
    formComponent: 'MonthYearPicker',
  },
  duration: {
    id: 'duration',
    labelVi: 'Khoảng thời gian',
    tableColumnPreset: 'titleShort',
    formComponent: 'Input',
  },
  enum: {
    id: 'enum',
    labelVi: 'Danh mục (một)',
    tableColumnPreset: 'enumBadge',
    formComponent: 'Combobox',
  },
  enum_list: {
    id: 'enum_list',
    labelVi: 'Danh mục (nhiều)',
    tableColumnPreset: 'enumBadge',
    formComponent: 'MultiSelect',
  },
  ref: {
    id: 'ref',
    labelVi: 'Tham chiếu bảng',
    tableColumnPreset: 'titleShort',
    formComponent: 'Combobox',
  },
  yes_no: {
    id: 'yes_no',
    labelVi: 'Có / Không',
    tableColumnPreset: 'enumBadgeShort',
    formComponent: 'ToggleSwitch',
  },
  color: {
    id: 'color',
    labelVi: 'Màu',
    tableColumnPreset: 'enumBadgeShort',
    formComponent: 'ColorPickerInput',
  },
  progress: {
    id: 'progress',
    labelVi: 'Tiến độ',
    tableColumnPreset: 'enumBadgeMedium',
    formComponent: 'Input',
  },
  email: {
    id: 'email',
    labelVi: 'Email',
    tableColumnPreset: 'email',
    formComponent: 'EmailInput',
  },
  phone: {
    id: 'phone',
    labelVi: 'Điện thoại',
    tableColumnPreset: 'phone',
    formComponent: 'PhoneInput',
  },
  url: {
    id: 'url',
    labelVi: 'URL',
    tableColumnPreset: 'email',
    formComponent: 'UrlInput',
  },
  image: {
    id: 'image',
    labelVi: 'Ảnh',
    tableColumnPreset: 'enumBadgeShort',
    formComponent: 'SingleImageInput',
  },
  multi_image: {
    id: 'multi_image',
    labelVi: 'Nhiều ảnh',
    tableColumnPreset: 'titleShort',
    formComponent: 'MultiImageInput',
  },
  file: {
    id: 'file',
    labelVi: 'Tệp (PDF, …)',
    tableColumnPreset: 'titleShort',
    formComponent: 'FileInput',
  },
  signature: {
    id: 'signature',
    labelVi: 'Chữ ký',
    tableColumnPreset: 'enumBadgeShort',
    formComponent: 'SingleImageInput',
  },
  video: {
    id: 'video',
    labelVi: 'Video (URL)',
    tableColumnPreset: 'email',
    formComponent: 'UrlInput',
  },
  address: {
    id: 'address',
    labelVi: 'Địa chỉ',
    tableColumnPreset: 'addressLine',
    formComponent: 'Textarea',
  },
  lat_long: {
    id: 'lat_long',
    labelVi: 'Tọa độ (lat, lng)',
    tableColumnPreset: 'branch',
    formComponent: 'Input',
  },
  show: {
    id: 'show',
    labelVi: 'Khối hiển thị (không lưu)',
    formComponent: 'FormSection',
  },
  app_link: {
    id: 'app_link',
    labelVi: 'Điều hướng app',
    formComponent: 'Button',
  },
  change_counter: {
    id: 'change_counter',
    labelVi: 'Số lần chỉnh sửa (audit)',
    tableColumnPreset: 'code',
  },
  change_timestamp: {
    id: 'change_timestamp',
    labelVi: 'Thời điểm sửa (audit)',
    tableColumnPreset: 'date',
  },
  change_location: {
    id: 'change_location',
    labelVi: 'Vị trí khi sửa (audit)',
    tableColumnPreset: 'branch',
  },
};

export function getDataTypeDefinition(id: DataTypeId): DataTypeDefinition {
  return DATA_TYPE_REGISTRY[id];
}

/** Preset cột bảng gợi ý theo kiểu (fallback: titleShort) */
export function getTableColumnPresetForDataType(id: DataTypeId): TableColumnPresetKey {
  return DATA_TYPE_REGISTRY[id].tableColumnPreset ?? 'titleShort';
}
