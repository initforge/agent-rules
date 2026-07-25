import type { DataTypeId } from './types';
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatMonthYear,
  formatCurrency,
} from '@/lib/utils';

export type FormatValueOption = { label: string; value: string | number };

export interface FormatValueByDataTypeOptions {
  /** Dùng cho enum / ref / enum_list: resolve value → label */
  options?: FormatValueOption[];
}

/**
 * Định dạng giá trị read-only theo `DataTypeId` — đồng bộ với [`DataField`](../components/data-types/DataField.tsx).
 */
export function formatValueByDataType(
  dataType: DataTypeId,
  value: unknown,
  opts?: FormatValueByDataTypeOptions
): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && value.trim() === '') return '';

  const opt = opts?.options;

  switch (dataType) {
    case 'date':
      return formatDate(String(value));
    case 'time':
      return formatTime(String(value));
    case 'datetime':
      return formatDateTime(String(value));
    case 'month_year':
      return formatMonthYear(String(value));
    case 'number':
    case 'decimal':
      return typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : String(value);
    case 'currency': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? formatCurrency(n) : '';
    }
    case 'percent': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? `${n}%` : '';
    }
    case 'enum':
    case 'ref': {
      const v = String(value);
      const hit = opt?.find((o) => String(o.value) === v);
      return hit?.label ?? v;
    }
    case 'enum_list': {
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      if (!arr.length) return '';
      if (opt) {
        return arr
          .map((raw) => {
            const v = String(raw);
            return opt.find((o) => String(o.value) === v)?.label ?? v;
          })
          .join(', ');
      }
      return arr.map(String).join(', ');
    }
    case 'yes_no':
      return value ? 'Có' : 'Không';
    case 'email':
    case 'phone':
    case 'url':
    case 'text':
    case 'name':
    case 'long_text':
    case 'address':
    case 'duration':
    case 'progress':
    case 'lat_long':
    case 'video':
    case 'color':
      return String(value);
    case 'file':
      if (Array.isArray(value)) return `${value.length} file`;
      return String(value);
    case 'image':
    case 'signature':
      return String(value);
    case 'multi_image':
      return Array.isArray(value) ? `${value.length} ảnh` : '';
    case 'date_range':
    case 'show':
    case 'app_link':
    case 'change_counter':
    case 'change_timestamp':
    case 'change_location':
      return String(value);
    default: {
      const _exhaustive: never = dataType;
      return String(_exhaustive);
    }
  }
}
