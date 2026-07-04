# Surface Taxonomy (Phân loại Surface 5fedu)

Bảng phân loại và đặc tả các bề mặt UI (surfaces) trong template ERP 5fedu.

| Surface | Reference | Component Anchors | Khác biệt |
|---|---|---|---|
| **ModuleListToolbar** | Nhân viên | `FilterChip`, export, search, column toggle | Khác với `DashboardToolbar` (không có các trường tính tổng hoặc biểu đồ lọc). |
| **StatsTabToolbar** | Nhân viên (tab Thống kê) | `DashboardToolbar` lọc theo khoảng thời gian/chi nhánh | Khác với list toolbar (thường chứa các nút KPI hoặc nút lọc nhanh). |
| **DetailDrawerFooter** | Nhân viên | Nút `Đóng / Sửa / Xóa` dưới chân drawer | Khác với form drawer footer (chỉ có `Hủy` và `Lưu`). |
| **DetailSectionToolbar** | Phòng ban | Thêm nút primary + EmbeddedChildDataGrid | Khác với module toolbar (chỉ tác động lên bảng con của một entity cha). |
| **WorkflowToolbar** | `business.md` §3,6 | Nút `Duyệt`, `In`, `Báo cáo` | Khác với CRUD toolbar (gắn với luồng trạng thái hóa đơn/chứng từ). |
| **HierarchyListview** | Phòng ban | Cấu trúc cây 2 cấp dạng list | Khác với flat CRUD (hiển thị danh sách phẳng, không lồng ghép). |
| **EntityInTree** | Chức vụ | Form cập nhật gắn trực tiếp trong trục Phòng ban | Khác với standalone module (không thể tồn tại độc lập ngoài cây cha). |
| **MasterDetailFormLines** | `business.md` §2 | Form nhập liệu chi tiết dạng dòng con | Khác với bảng hiển thị con (cho phép chỉnh sửa trực tiếp, validate realtime). |

## Chi tiết các Quy ước Giao diện

1. **Orphan node Chức vụ:** Chức vụ luôn là con của Phòng ban, khi hiển thị cây hoặc form của Chức vụ, Phòng ban cha bắt buộc phải được chọn hoặc truyền context qua.
2. **Tree indent / search preserve child:** Khi tìm kiếm trên cây danh mục (như Phòng ban), kết quả tìm kiếm phải giữ nguyên cấu trúc cha-con thụt lề, không làm bẹt phẳng dữ liệu (flat list) làm mất quan hệ phân cấp.
3. **Detail drawer state sync:** Khi thực hiện sửa hoặc xóa từ Detail Drawer, trạng thái ở bảng danh sách chính (lưới dữ liệu phía sau) phải được đồng bộ ngay lập tức mà không cần F5 trình duyệt.
4. **Nested row confirm (Bảng con):** Trước khi xóa một dòng trên bảng con (như Nhân viên trong Phòng ban), bắt buộc phải gọi popover hoặc dialog xác nhận xóa (`danger` variant).
5. **Dropdown đồng bộ cross-module:** Giá trị combobox Chức vụ trong form Nhân viên phải đồng bộ với danh sách Chức vụ đang sống trong trục Phòng ban tương ứng.
