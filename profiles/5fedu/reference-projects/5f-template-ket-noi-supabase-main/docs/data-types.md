# Data types & field-meta

Companion cho [`view-types.md`](view-types.md). Mô tả **`DataTypeId`** — cách map trường form/bảng → widget & format read-only.

## Registry

- **Types:** `lib/data-types/types.ts` — `DataTypeId`, `DATA_TYPE_IDS`
- **Registry:** `lib/data-types/registry.ts` — `DATA_TYPE_REGISTRY`, `getDataTypeDefinition()`, `getTableColumnPresetForDataType()`
- **Format read-only:** `lib/data-types/format-value.ts` — `formatValueByDataType()`

## Field-meta per module

Mỗi module CRUD nên có `features/<domain>/<entity>/core/*-field-meta.ts`:

```ts
import type { DataTypeId } from '@/lib/data-types';
import type { XxxFormValues } from './schema';

export const XXX_FIELD_DATA_TYPE: Partial<Record<keyof XxxFormValues, DataTypeId>> = {
  ma_xxx: 'text',
  ten_xxx: 'name',
  // ...
};
```

**Reference modules:**

| Module | File |
|--------|------|
| Nhân viên | `features/he-thong/nhan-vien/core/employee-field-meta.ts` |
| Phòng ban | `features/he-thong/phong-ban/core/department-field-meta.ts` |
| Chức vụ | `features/he-thong/chuc-vu/core/position-field-meta.ts` |

## Form: RhfDataField

- Import từ `@/components/views`
- Truyền `dataType` từ field-meta (hoặc override khi UX đặc thù: RadioGroup, Combobox custom)
- Validation vẫn từ Zod schema; `required` prop chỉ hiển thị dấu `*`

## Detail: formatValueByDataType

Detail drawer dùng `formatValueByDataType(value, dataType, options)` thay vì format tay — đồng bộ với form/table.

## Table columns

Trong `DEFAULT_COLUMNS`, ưu tiên `minWidth` từ `getTableColumnPresetForDataType(dataType)` thay vì hardcode.

## DataTypeId phổ biến

| Id | Dùng cho |
|----|----------|
| `text` | Chuỗi ngắn, mã |
| `name` | Tên hiển thị |
| `long_text` | Mô tả, ghi chú |
| `email`, `phone`, `address` | Liên hệ |
| `date` | Ngày (dayjs) |
| `number` | Số |
| `enum` | Trạng thái, loại (options từ constants) |
| `ref` | FK — picker master data |
| `image` | Ảnh (`SingleImageInput`) |

Xem đầy đủ trong `DATA_TYPE_REGISTRY`.
