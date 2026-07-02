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
| **Module thống kê standalone** | **Thống kê tồn kho** (`thong-ke-ton-kho`) | Route + sidebar riêng, không phải tab trong CRUD |

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

## Hành động bắt buộc khi báo lệch

1. Tra bảng → chọn module tham chiếu
2. Mở route/file template + route/file hiện tại
3. Đối chiếu bằng mắt (toolbar, drawer, filter, pagination, export)
4. Ghi `Template reference` trong plan trước khi sửa

Cập nhật bảng khi owner gửi ảnh/Sheet — không đoán hàng/cột thiếu.

Chi tiết surfaces: `ui-delivery.md`.
