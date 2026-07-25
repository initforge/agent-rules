# UI delivery — navigation, interaction và proof

**Vai trò:** Chi tiết lazy-load sau `ui-delivery.md` và `module-mapping.md`. Inventory vẫn là source machine-readable cho từng surface; file này chỉ giữ các điều kiện liên surface và cách chứng minh.

## Navigation và route integrity

- **“Dùng ở đâu quay lại đó”:** sau form/drawer/detail, trả user về đúng list và filter/context đã vào; không dump về route mặc định.
- Route, sidebar, breadcrumb registry, route guard, permission matrix, module key và destination là một thay đổi liên kết. Đổi tên/vị trí module phải kiểm tất cả.
- Với mỗi route product mới, đăng ký exact route trong `getRouteConfig()` tại `src/components/shared/Breadcrumbs.tsx` với `label` tiếng Việt Unicode có dấu và `parentPath` phân hệ (ví dụ template `/he-thong/nhan-vien` có parent `/he-thong`). Sidebar không tạo breadcrumb thay registry; fallback từ slug là configuration defect, không phải nhãn product chấp nhận được.
- Search/filter phải dùng control đúng surface: filter chip trên toolbar; combobox/searchable combobox trong form. Notification chỉ reuse pattern template khi spec yêu cầu.

## Motion, accessibility và responsive

- Reuse motion primitive/timing của reference. Motion không là decoration được tự chế; mọi enter/exit, drawer/menu/card/tree transition phải tôn trọng `prefers-reduced-motion`.
- Drawer/modal phải giữ focus trap, Escape close, focus restore về opener, backdrop behavior, dialog semantics (`role="dialog"`, `aria-modal`, accessible title/label) và submit/loading/error state có thể nhận biết.
- Menu/action phải dùng keyboard/outside-click behavior của primitive; xóa/hành động nguy hiểm luôn có danger confirmation. Permission không chỉ ẩn nút mà còn bảo vệ action/state đúng reference.
- Kiểm tra desktop và mobile khi surface có responsive behavior: drawer/modal full-screen/safe-area footer, toolbar/action/filter usable, table/grid overflow đọc được, breadcrumb truncate không đổi Unicode label.

## Các reference sâu thường gặp

| Nhu cầu | Reference cần mở |
|---|---|
| CRUD/list/form/detail | Nhân viên; `GenericToolbar`, `GenericDrawer`, `FormDrawerFooter`, `DetailToolbar` khi inventory chỉ ra |
| Hierarchy/child grid | Phòng ban; `HierarchyListShell`, `HierarchyTable`, `EmbeddedChildDataGrid` khi inventory chỉ ra |
| Stats | Thống kê Nhân viên; `DashboardToolbar`, KPI/chart/grid đã mở từ template |
| Row overflow | `RowActionsOverflowMenu`: portal phải hoạt động desktop/mobile; action phụ mirror DetailToolbar; destructive action có separator/confirm |
| Export/PDF | Export dialog/helper reference; file thật phải dùng visible scope/columns và báo lỗi recoverable. PDF tiếng Việt dùng font Unicode đã verify, không font mặc định jsPDF |

Không import component có text/KPI hard-code từ module khác để “reuse”; giữ shell primitive nhưng viết variable content cho module, hoặc có deviation được duyệt.

## Layout và export quality gates

- Component/trang con nhúng không dùng `.h-page`; dùng `h-full min-h-0` để flex parent còn chỗ cho footer/pagination.
- Excel số liệu phải xuất kiểu Number (không string), có định dạng `#,##0`, căn phải cho số; ngày/trạng thái căn giữa, text căn trái. Header dùng layout/màu template và file mở được để tính `SUM`/`AVERAGE`.
- PDF tiếng Việt không dùng font mặc định jsPDF. Đăng ký font TrueType Unicode đã verify (qua VFS) và dùng font đó cho `text` lẫn `autoTable`.

## Verification và proof

1. **Static/local:** chạy lint/typecheck/build/tests phù hợp risk; kiểm runtime imports, props, hook và factory chứ không chỉ build pass.
2. **Interaction:** thực hiện add drawer, row-click detail, form popup/validation, filter/dropdown, permission action, mutation sync; export kiểm file thật. Kiểm responsive desktop/mobile khi áp dụng.
3. **Parity:** đối chiếu target với local template paths đã ghi trong packet cho shell, behavior, state, motion và responsive; xác nhận variable map có nguồn spec/schema.
4. **Production (opt-in):** chỉ khi owner yêu cầu deploy/production proof: sửa → push → chờ deploy → interaction verify; chụp screenshot bằng browser context mới hoặc bypass cache/PWA. DOM chỉ hỗ trợ debug.

Report kỹ thuật ghi `Template reference`, `Shell parity`, `Variable map`, `Pattern fidelity`, `Approved deviations` và `Verification`. Evidence cần nêu snapshot template, paths/surface đã đối chiếu, command hoặc interaction đã chạy, và giới hạn chưa chứng minh được.
