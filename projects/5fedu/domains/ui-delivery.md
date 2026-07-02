# UI/UX parity và delivery gates

**Vai trò:** Pattern-format UI/workflow 5fedu — linh hoạt theo template, không rập khuôn cứng.  
**Ý đồ:** Parity với template trước khi sửa; audit toàn surface khi user báo lệch.

## Navigation flow (Sheet)

- **"Dùng ở đâu quay lại đó"** — sau thao tác (form/drawer/detail), quay đúng list/context user vào, không dump về route mặc định.
- Sidebar + breadcrumb + route guard + permission matrix **đi cùng nhau** khi đổi tên/vị trí module.
- Search liên kết: filter/search phải khớp module reference (toolbar chip vs form combobox — xem Surface Classification).
- Notification demo: nếu spec yêu cầu, reuse pattern notification đang sống trong template.
- Responsive: verify desktop + mobile khi module có mobile behavior.

## Core UI source of truth

- Template/current app là source of truth bắt buộc.
- Không tự chế pattern mới nếu đã có pattern sống trong template/app.
- Không lấy module đang lỗi hoặc module clone sai làm chuẩn ngược lại.
- Trước khi code UI/module, phải xác định reference đúng theo surface/behavior.
- 5fedu thường có template/ref routes sẵn; agent phải mở và đối chiếu bằng mắt trước khi code task UI dài, không làm theo trí nhớ.

Thứ tự ưu tiên:

1. Template trực tiếp cùng behavior
2. Template cùng surface
3. Module sống trong app cùng behavior
4. Shared primitive/component/helper đã có

## Canonical references

- CRUD list/form/detail: lấy **Nhân viên**
- Hierarchy 2 cấp: lấy **Phòng ban**
- Tổ chức trong hierarchy 2 cấp: lấy **Chức vụ** nhưng vẫn xem **Phòng ban** là trục cha
- Stats/report/tab-view: lấy tab **Thống kê** của **Nhân viên**
- Print/PDF/export: lấy toolbar in/xuất và helper export đang sống

Quy tắc baseline:

- **Nhân viên** là module gốc và canonical reference cho mọi CRUD chuẩn hoặc biến thể CRUD trong nhóm quản trị nội bộ.
- **Phòng ban** chỉ dùng 2 cấp nếu spec/template/app chưa xác nhận cấu trúc sâu hơn.
- **Chức vụ** là lớp đối tượng gắn trong cây **Phòng ban**; không xử lý **Chức vụ** như module độc lập cắt rời khỏi trục tổ chức.
- Module mới dạng "entity quản trị nội bộ" → clone/adapt từ **Nhân viên**; chỉ đổi phần nghiệp vụ, không đổi layout/surface vô cớ.
- Module có **Thống kê** → reuse shell stats của **Nhân viên**: tab stats, toolbar lọc, KPI, chart, grid, export/report, drilldown.

Reference không khớp behavior → bỏ, không bám module quen tay.

## Surface classification gate

Trước khi sửa UI/module, phân loại từng surface:

- **CRUD listview:** toolbar, search, filter chip, column visibility, export, pagination, row action, row-click detail.
- **Form drawer:** header, section layout, footer action, submit/cancel state.
- **Detail drawer:** header summary, section cards, footer `Đóng / Sửa / Xóa`, permission/action placement.
- **Stats/report tab-view:** tab shell factory/page, toolbar filter/report, cards/table/chart/export/print.
- **Hierarchy 2 cấp:** parent-child theo mẫu **Phòng ban**/**Chức vụ**, không flat list nếu source có quan hệ cấp.

Form thêm và detail drawer phải đi thành cặp reference. Không lấy form module A nhưng detail pattern rời module B nếu template gốc đã có cặp đúng.

Khi user nói "sai pattern", "thiếu nút", "drawer sai", "thanh lọc sai" → audit **tất cả** surface của module và các module cùng pattern trong batch.

Trong audit, tách control cùng tên nhưng khác pattern:

- Toolbar filter: filter chip (`FilterChip*`, `ToolbarFilterChipGroup`, count/reset) — không thay bằng combobox form.
- Form/drawer input: combobox/searchable combobox — không nhét filter chip vào form.
- Richtext/popup trong form: modal/popover design system — không `prompt/alert/confirm` native nếu app đã có pattern.

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

## Dự án Nostime

Quyết định retail/luxury, tồn kho, báo cáo NXT → `archive/nostime/` — không auto-load cho template chung.

## Pattern fidelity audit (trước PASS)

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
