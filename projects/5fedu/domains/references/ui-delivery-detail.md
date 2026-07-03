# UI delivery — chi tiết surfaces

**Vai trò:** Hard gates, verify, navigation — lazy-load khi implement UI.  
**Đọc trước:** `../ui-delivery.md` + `../module-mapping.md`.

## Navigation flow (Sheet)

- **"Dùng ở đâu quay lại đó"** — sau thao tác (form/drawer/detail), quay đúng list/context user vào, không dump về route mặc định.
- Sidebar + breadcrumb + route guard + permission matrix **đi cùng nhau** khi đổi tên/vị trí module.
- **Breadcrumb admin:** mỗi route `/admin/*` mới **bắt buộc** thêm entry vào `getRouteConfig()` trong `src/components/shared/Breadcrumbs.tsx` với `label` tiếng Việt **có dấu** + `parentPath` phân hệ (vd. `/admin/he-thong`). Sidebar **không** tự sinh breadcrumb — đây là nguồn duy nhất.
- Search liên kết: filter/search phải khớp module reference (toolbar chip vs form combobox — xem Surface Classification trong `ui-delivery.md`).
- Notification demo: nếu spec yêu cầu, reuse pattern notification đang sống trong template.
- Responsive: verify desktop + mobile khi module có mobile behavior.

## Canonical references

- CRUD list/form/detail: lấy **Nhân viên**
- Hierarchy 2 cấp: lấy **Phòng ban**
- Tổ chức trong hierarchy 2 cấp: lấy **Chức vụ** nhưng vẫn xem **Phòng ban** là trục cha
- Stats/report/tab-view: lấy tab **Thống kê** của **Nhân viên**
- Print/PDF/export: lấy toolbar in/xuất và helper export đang sống
- **Bảng con trong detail:** lấy **Phòng ban** — `DetailSection` + `EmbeddedChildDataGrid` + badge count (`{n} bản ghi`) + nút Thêm primary (`bg-primary text-white shadow-sm hover:bg-primary/90 h-8 px-3 text-xs`) + **cột Thao tác nhất quán với bảng chính** (nút Sửa hiển thị trực tiếp dạng `primary` + Dấu 3 chấm `RowActionsOverflowMenu` chứa nút Xóa và các hành động phụ). Không tự chế layout 2 icon trực tiếp hoặc ẩn hết vào menu 3 chấm nếu template mẫu có cấu trúc chuẩn.
- **Confirm xóa:** lấy **Nhân viên** — `useConfirmStore().confirm({ variant: 'danger' })` trước mọi xóa/hành động nguy hiểm.
- **Cột listview:** `TABLE_COLUMN_PRESETS` (`lib/table-column-presets.ts`) — `minWidth`/`maxWidth` + `truncate`.
- **Thao tác 3 chấm (RowActionsOverflowMenu):** Luôn luôn bật portal (`portalEnabled={true}`) để dropdown menu hoạt động ổn định trên cả mobile và desktop cho tất cả các bảng chính và bảng con. Cấm tắt portal hoặc dùng điều kiện `compact` để vô hiệu hóa portal dẫn đến lỗi ẩn/mất menu.

Quy tắc baseline:

- **Bắt buộc đối chiếu trực quan (Visual Parity Gate):** Khi sửa hoặc tạo mới giao diện (Table chính, Bảng con, Toolbar, Stats), bắt buộc phải mở trực tiếp file code mẫu của template Nhân viên/Phòng ban đang chạy để đối chiếu cấu trúc DOM và class Tailwind thực tế. Cấm suy đoán cảm tính hoặc tin tưởng mù quáng vào tài liệu markdown rules tĩnh nếu chúng mâu thuẫn với code đang chạy.
- **Cấm import chắp vá component Stats:** Tuyệt đối không import component cấu hình KPI (`StatsKpiConfigPopover`) của Nhân viên sang các phân hệ khác do nhãn checkbox bị hardcode. Phải viết component popover riêng biệt (hoặc inline) cho từng phân hệ, đồng bộ đầy đủ class checkbox của hệ thống và trạng thái active (`bg-muted`) của nút trigger khi popup mở.
- **Nhân viên** là module gốc và canonical reference cho mọi CRUD chuẩn hoặc biến thể CRUD trong nhóm quản trị nội bộ.
- **Phòng ban** chỉ dùng 2 cấp nếu spec/template/app chưa xác nhận cấu trúc sâu hơn.
- **Chức vụ** là lớp đối tượng gắn trong cây **Phòng ban**; không xử lý **Chức vụ** như module độc lập cắt rời khỏi trục tổ chức.
- **Module mới dạng "entity quản trị nội bộ"** → clone/adapt từ **Nhân viên**; chỉ đổi phần nghiệp vụ, không đổi layout/surface vô cớ.
- **Module có Thống kê (Tab Stats):** Bắt buộc kế thừa gần như toàn bộ (gần như 100%) kiến trúc, layout và các components từ tab **Thống kê của Nhân viên** (gồm DashboardToolbar lọc, StatsKpiGrid hiển thị KPI, StatsKpiConfigPopover cấu hình ẩn/hiện, hệ thống biểu đồ, StatsDataGrid hiển thị danh sách chi tiết ở chân trang, và dialog StatsDrillDownDialog). Cấm tự chế cấu trúc riêng hoặc lược bỏ các thành phần này.

Reference không khớp behavior → bỏ, không bám module quen tay.

## Hard gates

- Cấm tự chế tên module, button, tab, route, empty state, icon, tooltip, workflow nếu không có nguồn rõ từ spec/template/app.
- Cấm generic hóa lưới biếng; mỗi feature vẫn có file view/table/form/service riêng.
- CRUD/listview chuẩn: search, filter toolbar, column visibility, pagination footer, action đủ theo permission.
- Detail/form drawer: header/section/footer/action đúng pattern sống.
- Biến thể CRUD quản trị nội bộ: không lệch form/drawer/action khỏi **Nhân viên**.
- Export thật: `exportColumns` + `exportMapFn` khớp dữ liệu.
- Stats/report: không nhét mini-tab vào CRUD page nếu đã có surface stats riêng.
- Ảnh từ link ngoài (Google Drive share, thumbnail, richtext image) — không chỉ test URL trực tiếp.
- Đổi tên/vị trí module: sync sidebar, breadcrumb, route registry/guard, permission matrix, module key, label.

## Verification gate (UI)

Mọi thay đổi UI verify như hệ thống liên kết:

- Toolbar, filter, search, column toggle, pagination
- List/detail/form/drawer
- Action theo permission
- Responsive nếu module có mobile behavior
- Export file thật
- Cross-module sync nếu dữ liệu ảnh hưởng module khác
- Runtime imports/props/hook/factory — không chỉ build pass
- PASS task UI/module cần production proof đầy đủ khi user yêu cầu deploy
- Vòng lặp: sửa → push → đợi deploy → verify production; không dừng ở local pass
- Bằng chứng: screenshot production; DOM chỉ hỗ trợ debug
- Browser context mới hoặc bypass cache/PWA trước khi chụp
- Interaction check: add drawer, row-click detail, form popup, filter/dropdown — không chỉ mở route đọc text
- Desktop + mobile nếu module có responsive

## Pattern fidelity audit (trước PASS)

*Bổ sung cho Audit checklist trong `module-mapping.md`.*

- Reference đã chọn là gì?
- Đã mở template/current route và đối chiếu bằng mắt chưa?
- Đã map module → surface → reference → expected controls chưa?
- Toolbar, drawer detail/form, listview, row-click, export, stats đúng pattern chưa?
- Đã quét module cùng primitive nếu lỗi lặp chưa?
- Ảnh Google Drive render được chưa?
- Đổi tên module đã sync sidebar/breadcrumb/permission/registry chưa?
- Production verify interaction sau deploy thật chưa?

Report cuối: `Template checked` | `Pattern fidelity` | `Verification` | `Status`

## Plan và report contract

Format cố định cho task UI/module 5fedu:

1. `Mục tiêu`
2. `Khảo sát đã xác nhận`
3. `Implementation changes`
4. `Verification plan`
5. `Assumptions locked`
6. `Known-unknowns` — thứ chỉ xác nhận được lúc implement (call sites, gaps, orphaned, runtime-only); verify theo `implementation-discovery`

Luôn ghi `Template reference` + lý do, `Production verification path`, `Verify by image` khi cần. Không viết chung chung "sửa theo template" — phải nêu module baseline và surface reuse.

Chi tiết mapping module → template: `module-mapping.md`.

## Dự án Nostime

Quyết định retail/luxury, tồn kho, báo cáo NXT → `archive/nostime/` — không auto-load cho template chung.
