# Catalog View Types (giao diện ERP)

Template này dùng **hai tầng** tách biệt:

| Tầng | Vai trò | Code |
|------|---------|------|
| **Kiểu trường dữ liệu** | Text, ngày, email, ref… → widget form / format cell | [`lib/data-types/`](../lib/data-types/) |
| **Kiểu view (giao diện)** | Bảng, chi tiết, form drawer, dashboard… → layout & luồng màn hình | [`lib/view-types/`](../lib/view-types/) |

`DataTypeId` **không** thay thế `ViewTypeId`: một màn **Table** vẫn hiển thị nhiều cột với nhiều `DataTypeId` khác nhau.

---

## Đăng ký tập trung

- **Constants:** `VIEW_TYPE_IDS`, type `ViewTypeId` — [`lib/view-types/types.ts`](../lib/view-types/types.ts)
- **Metadata:** `VIEW_TYPE_REGISTRY` — [`lib/view-types/registry.ts`](../lib/view-types/registry.ts)
- **Helpers:** `getViewTypeDefinition`, `listViewTypesByStatus`

Ví dụ:

```ts
import { getViewTypeDefinition, listViewTypesByStatus } from '@/lib/view-types';

const t = getViewTypeDefinition('table');
const planned = listViewTypesByStatus('planned');
```

---

## Trạng thái triển khai

| Status | Ý nghĩa |
|--------|---------|
| `ready` | Có primitive dùng lại rõ ràng trong repo |
| `partial` | Có một phần; cần bổ sung pattern hoặc module |
| `planned` | Đã định danh; chưa có shell/feature |

---

## Bảng view type → file / ghi chú

| ViewTypeId | Mô tả ngắn | Trạng thái |
|------------|-----------|------------|
| `table` | CRUD list: `GenericTable`, `createFeatureModule` | ready |
| `detail` | Drawer chi tiết: `DetailSection`, `DetailField` | ready |
| `form` | Form drawer, `FormGrid`, `RhfDataField`, `FormStepper` | ready |
| `dashboard` | `ModuleDashboardLayout`, `SubModuleCard` | ready |
| `chart_panel` | Recharts (vd. `nhan-vien-stats`) | ready |
| `card_list` | `MobileListCard`, Home cards | partial |
| `calendar` | Chỉ date picker; lịch sự kiện DnD chưa | planned |
| `gallery` | Lightbox trong `MultiImageInput` | partial |
| `map` | Deps có leaflet; chưa có màn | planned |
| `onboarding` | Tour / slider | planned |
| `navigation_shell` | `Layout`, `CommandPalette` (Cmd/Ctrl+K), `Breadcrumbs` | ready |
| `feedback_overlay` | Sonner, `ConfirmDialog`, `EmptyState` | ready |
| `data_utility` | Import/Export, filter theo module | partial |
| `security_ui` | Phân quyền, `PositionPermissionPicker`, `can()` / `<Can>` | partial |
| `master_detail` | `GenericSubTableSection` | ready |

---

## Import primitives (một chỗ)

[`components/views/index.ts`](../components/views/index.ts) re-export các component thường dùng theo nhóm view — **import có chủ đích** để bundler tree-shake tốt.

```ts
import { GenericTable, GenericDrawer, RhfDataField } from '@/components/views';
```

---

## Pattern khuyến nghị

1. **Module feature** (`features/...`): hooks, schema, service, `*-field-meta.ts` (field → `DataTypeId`).
2. **Trang**: chọn `createFeatureModule` (table + stats) hoặc tự ghép drawer form/detail.
3. **Master–detail**: parent id → query bảng con → `GenericSubTableSection` + API CRUD con.
4. **View type mới** (vd. calendar): thêm id vào `VIEW_TYPE_IDS` + entry trong `VIEW_TYPE_REGISTRY` + doc; triển khai shell rồi đổi `implementationStatus`.

---

## Việc nên làm tiếp (ưu tiên)

1. **Calendar / Map / Onboarding:** chỉ khi có user story; cập nhật registry khi merge shell.
2. **Command palette:** đã có (`CommandPalette`, Cmd/Ctrl+K, `lib/command-palette-entries.ts`) — bổ sung route mới khi thêm trang.
3. **Form nhiều bước:** dùng `FormStepper` trong form dài; tinh chỉnh UX theo từng module.
4. **Phân quyền:** `can()` + `<Can>` là lớp UX; đồng bộ policy với RLS/API khi có RBAC đầy đủ (thay `admin`/`user` stub).

---

## Liên quan

- [`lib/table-column-presets.ts`](../lib/table-column-presets.ts) — độ rộng cột bảng (gắn `DataTypeId`).
- [`lib/createFeatureModule.tsx`](../lib/createFeatureModule.tsx) — factory CRUD list/tab stats.
