# Surface taxonomy — ngôn ngữ UI 5fedu

**Vai trò:** Bảng từ vựng cho người đọc. Trước khi code, xác nhận surface cụ thể và load entry tương ứng trong `references/pattern-inventory.yaml`; file inventory là nơi giữ invariant chi tiết.

| Surface | Composition người dùng thấy | Baseline thường dùng | Không nhầm với |
|---|---|---|---|
| **Home dashboard** | Card điểm đến theo quyền | Home + `MainCard` | Landing/hero tự chế hoặc dashboard đếm module chung chung |
| **Subsystem dashboard/navigation** | Sidebar, group module, card destination, quyền và route | sidebar + System Dashboard | CRUD toolbar hoặc registry chỉ có route |
| **CRUD list** | Back, search/filter chip/reset, table, pagination, action hàng | Nhân viên | Form combobox đặt trên toolbar; nút “Xem chi tiết” thay row-click |
| **Row actions** | Sửa primary nhìn thấy, overflow cho action phụ/phá huỷ | Nhân viên | Dồn toàn bộ action vào menu hoặc duplicate action drawer |
| **Form drawer** | Header, section/grid field, footer Hủy/Lưu | Nhân viên + `GenericDrawer` | Form một section sơ sài hoặc modal native |
| **Detail drawer** | Summary, section detail, toolbar, footer Đóng/Sửa/Xóa | Nhân viên | Detail page rời khi reference dùng drawer |
| **Stats/report** | Toolbar thời gian/filter, KPI, chart, stats grid, export/drill-down | Thống kê Nhân viên | Mini-tab/dashboard tự chế trong CRUD |
| **Export dialog** | Format, scope/count, column selection, result/error | `ExportDialog` | Export chỉ tải dữ liệu mock hay bỏ trạng thái lỗi |
| **Hierarchy list** | Cây cha–con, expand, search còn ancestry | Phòng ban | Flat list làm mất quan hệ thật |
| **Entity in tree** | Entity phụ thuộc parent/context | Chức vụ trong trục Phòng ban | CRUD độc lập mất parent axis |
| **Embedded child grid** | `DetailSection`, count, Add, grid con scoped parent | Detail Phòng ban | Một bảng con phẳng không context parent |
| **Split master-detail tabs** | Hai list liên quan, context parent explicit, detail có relation | Nhân viên + Phòng ban | Hai list độc lập làm lộ dữ liệu con không scope |
| **Permission matrix** | Điều hướng module + ma trận quyền desktop/mobile | Phân quyền | Một nhóm checkbox không registry/quyền thật |
| **Single-record settings** | Header Back, card section, form một bản ghi | Thông tin công ty | CRUD list cho singleton |
| **Route breadcrumb** | Nhãn/cha của route đã đăng ký | `Breadcrumbs` + sidebar | Tạo label từ slug/capitalization fallback |

## Quy ước composition

- Một module có thể ghép nhiều surface: CRUD list → row-click detail drawer → form drawer; hierarchy có thể thêm embedded child grid. Mỗi surface giữ shell riêng nhưng chia sẻ route, quyền, state và mutation sync theo reference.
- **Shell** là phần chung phải giữ; **variable slot** là dữ liệu nghiệp vụ được map từ spec/schema. Định nghĩa đầy đủ ở `ui-delivery.md`; field-level contract ở inventory.
- Quan hệ thật phải hiển thị đúng composition: Chức vụ cần parent Phòng ban; tìm cây vẫn giữ ancestor; child mutation phải refresh parent/list context; xóa có danger confirmation.
- Toolbar control và form input có ngữ cảnh khác nhau. Filter chip dùng để lọc danh sách; combobox/searchable combobox dùng để nhập hoặc chọn dữ liệu của form.
