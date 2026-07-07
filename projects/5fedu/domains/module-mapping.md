# Module mapping — UI → template

**Vai trò:** Bảng tra module UI ↔ template; bắt buộc mở khi user báo lệch/sai pattern.  
**Ý đồ:** Agent vào đúng module tham chiếu trước khi sửa.

Template: `https://github.com/admin5fedu/5f-template-ket-noi-supabase` (React/Vite).

## Module tham chiếu (reference)

| Loại surface | Module tham chiếu | Khi nào dùng |
|---|---|---|
| CRUD list/form/detail | **Nhân viên** | Entity quản trị nội bộ |
| Hierarchy 2 cấp | **Phòng ban** | Cây cha-con |
| Entity trong hierarchy | **Chức vụ** (cha: Phòng ban) | Form/lọc theo phòng |
| Tab Thống kê / báo cáo | Tab stats **Nhân viên** | Module có stats |
| Toolbar in/xuất | Module export đang sống | Export thật |
| Phân quyền ma trận | Pattern **Phân quyền** template | Xem `permissions.md` |
| Chi nhánh / đối tác | **Chi nhánh** (nếu có) hoặc **Nhân viên** shell | CRUD đối tác |
| **Bảng con trong detail drawer** | **Phòng ban** (`EmbeddedChildDataGrid`) | Khi user nói "bảng con" — kể cả module không có listview 2 cấp |
| **Popup xác nhận xóa/hành động nguy hiểm** | **Nhân viên** (`useConfirmStore` + `ConfirmDialog`) | Xóa đơn, xóa nhiều, toggle ảnh hưởng site |
| **Độ rộng cột listview** | **Nhân viên** + `TABLE_COLUMN_PRESETS` | `minWidth`/`maxWidth` + `truncate` theo nội dung thực tế |
| **In hồ sơ / preview PDF** | **Nhân viên** (`openEmployeeProfilePreviewTab` → `/ho-so-nhan-vien/:id`) | jsPDF + `window.print()`; letterhead từ `useUIStore.companyInfo` |
| **Cấu hình 1 dòng (settings)** | **Thông tin công ty** | Logo, MST, địa chỉ — nguồn letterhead in hồ sơ; service read phải fallback mock khi thiếu bảng DB |
| **Module thống kê standalone** | Tab stats **Nhân viên** (route riêng) | Route + sidebar riêng, không tab CRUD |
| **Row actions list (master-detail / phiếu)** | **Nhân viên** (`employee-table-row-actions.tsx`) | Primary **Sửa** + ⋮ thao tác phụ (in, liên hệ, xóa). **Không** nút *Xem chi tiết* — mở detail bằng click hàng. Overflow mirror **DetailToolbar** (prominent), không duplicate nút chỉ có ở drawer footer |

## Bảng mapping — template ERP chuẩn (5f-template)

| Module (tiếng Việt) | Submenu gợi ý | Module tham chiếu | Ghi chú |
|---|---|---|---|
| Nhân viên | Hệ thống | Nhân viên (self) | Root CRUD |
| Phòng ban | Hệ thống | Phòng ban | Hierarchy |
| Chức vụ | Hệ thống | Chức vụ | Trong trục Phòng ban |
| Phân quyền | Hệ thống | Phân quyền template | + `permissions.md` |
| Thông tin công ty | Hệ thống | Thông tin công ty (template) | `var_cong_ty` → `useUIStore.companyInfo`; read fallback mock nếu bảng chưa migrate |
| Chi nhánh | Hệ thống / Kinh doanh | Chi nhánh hoặc Nhân viên | Đối tác clone Chi nhánh |
| Danh mục (2 cấp) | Tùy nghiệp vụ | Phòng ban | Cây danh mục |
| Phiếu hành chính | Hành chính | Nhân viên | CRUD + workflow |
| Nhập hàng | Mua hàng / Kho | **Nhân viên** | "nhập hàng lệch" → so Nhân viên trước |
| Mua hàng | Mua hàng | Nhân viên | Master-detail nếu spec yêu cầu |
| Xuất kho / Phiếu xuất | Kho | Nhân viên hoặc module phiếu tương đương | |
| Tồn kho (list thực tế) | Kho | Nhân viên listview | Không CRUD giả |
| Báo cáo NXT / thống kê kho | Kho | Tab stats Nhân viên | Surface stats, không CRUD |
| Thu chi | Tài chính | Nhân viên | Danh mục + phân bổ tháng |
| Danh mục thu/chi | Tài chính | Phòng ban (2 cấp) | Cha-con |
| Tài liệu | Hành chính | Nhân viên | 2 module: danh sách + thiết lập |
| Đơn hàng | Kinh doanh | Nhân viên + master-detail | Auto-fill tài khoản mặc định |
| Sản phẩm / hàng hóa | Kinh doanh / Kho | Nhân viên | URL ảnh nếu spec retail |
| Báo cáo P&L / tài chính | Tài chính | Tab stats Nhân viên | So sánh cột kỳ |

*Dòng có nghiệp vụ đặc thù dự án (vd Nostime luxury retail) → bổ sung từ spec riêng, không đoán.*

## Taxonomy admin — phân hệ / group / module

| Cấp | Ý nghĩa | Nguồn |
|-----|---------|-------|
| **Phân hệ** | Tab dashboard | `sidebar-menu.tsx` → Website, Hành chính, Kinh doanh, Tài chính, Hệ thống |
| **Group module** | Nhóm card | `groups[].groupTitle` (vd. *Quản lý bán hàng*, *Tồn kho & Kho vận*) |
| **Module** | Card / route | `groups[].items[]` |

Ma trận phân quyền mirror cùng cấu trúc — xem `permissions.md`. Folder `src/features/kho-van/` **không** phải phân hệ UI.

## Mapping Nostime (riêng dự án)

Retail/luxury routes (`/san-pham`, Journal, kho serial…) → **[archive/nostime/architecture-and-specs.md](../archive/nostime/architecture-and-specs.md)** — không dùng làm default template.

## Quy ước tên

- Submenu: **tiếng Việt**
- View: hybrid `nhan-vien-form`
- Module key Supabase: slug không dấu (`nhan-vien`)

## Chain mapping (trước khi code)

```text
spec → submenu → module → view → tab → route → Breadcrumbs.tsx getRouteConfig → table → service
```

**Checklist route admin mới:** `App.tsx` route + `sidebar-menu.tsx` + `admin-module-registry.ts` + **`Breadcrumbs.tsx` getRouteConfig** (label có dấu + parentPath).

## Clone checklist (module mới)

- Tra bảng mapping → chọn module tham chiếu (thường **Nhân viên**)
- Mở **toàn bộ** file module gốc — không chỉ 1 file
- Route admin: `App.tsx` + `sidebar-menu.tsx` + `admin-module-registry.ts` + `Breadcrumbs` getRouteConfig
- Shell: `*-module.module.tsx` (`createFeatureModule`; tabs nếu spec có stats)
- List: `*-table.tsx`, `*-toolbar.tsx`
- Form drawer: `*-form.tsx` (lazy)
- Detail drawer: `*-detail.tsx`
- Row/bulk actions nếu reference có
- Stats tab (nếu có): kế thừa ~100% từ tab Thống kê Nhân viên
- `core/`: types, schema, constants (+ supabase-select nếu cần)
- `hooks/`: page handlers, list hook, data hook
- `services/`: `*-service.ts`
- `store/` + `utils/` theo reference
- **Cấm generic monolith** — 1 config page cho nhiều module

## Audit checklist (sửa module cũ)

- Tra mapping → module tham chiếu
- Mở route template + route hiện tại — đối chiếu bằng mắt, audit **mọi surface**
- Toolbar, filter chip, search, column toggle, pagination, export
- Form drawer + detail drawer (cặp reference)
- Confirm xóa (`useConfirmStore`)
- Bảng con detail (`EmbeddedChildDataGrid`) nếu có
- Stats tab surfaces nếu có
- Permission-gated actions
- Sync sidebar/breadcrumb/registry nếu đổi route
- Ghi `Template reference` trong plan trước khi sửa

## Hành động khi báo lệch

Chạy **Audit checklist** (trên) + §Surface classification tại `ui-delivery.md` — không redesign tự do.

Cập nhật bảng mapping khi owner gửi ảnh/Sheet — không đoán hàng/cột thiếu.
