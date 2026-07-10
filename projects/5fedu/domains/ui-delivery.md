# UI/UX parity và delivery gates

**Vai trò:** Pattern-format UI/workflow 5fedu — linh hoạt theo template, không rập khuôn cứng.  
**Ý đồ:** Parity với template trước khi sửa; audit toàn surface khi user báo lệch.

## Quick gate (đọc trước)

- **Tạo mới / sửa module:** đọc `references/pattern-inventory.yaml` (shell vs variable) rồi checklist tại `module-mapping.md` §Clone / §Audit — không lặp checklist ở đây.
- **User báo lệch/sai pattern:** audit **toàn surface** theo §Surface classification — **không** `frontend-architect`.
- PASS cần `Template reference` + **Shell parity** + **Variable map** + verification evidence.

## Core UI source of truth

- Template/current app là source of truth bắt buộc.
- Không tự chế pattern mới nếu đã có pattern sống trong template/app.
- **Cấm generic** monolith — file list theo `module-mapping.md` §Clone checklist.
- Không lấy module đang lỗi hoặc module clone sai làm chuẩn ngược lại.
- Trước khi code UI/module, phải xác định reference đúng theo surface/behavior — tra `module-mapping.md`.
- Agent phải mở và đối chiếu bằng mắt trước khi code task UI dài, không làm theo trí nhớ.

Thứ tự ưu tiên:

1. Template trực tiếp cùng behavior
2. Template cùng surface
3. Module sống trong app cùng behavior
4. Shared primitive/component/helper đã có

## Surface classification gate

Trước khi sửa UI/module, phân loại từng surface:

- **CRUD listview:** toolbar, search, filter chip, column visibility, export, pagination, row action, row-click detail.
- **Form drawer:** header, section layout, footer action, submit/cancel state.
- **Detail drawer:** header summary, section cards, footer `Đóng / Sửa / Xóa`, permission/action placement.
- **Stats/report tab-view:** tab shell factory/page, toolbar filter/report, cards/table/chart/export/print.
- **Hierarchy 2 cấp:** parent-child theo mẫu **Phòng ban**/**Chức vụ**, không flat list nếu source có quan hệ cấp.

Form thêm và detail drawer phải đi thành cặp reference. Không lấy form module A nhưng detail pattern rời module B nếu template gốc đã có cặp đúng.

Khi user nói "sai pattern", "thiếu nút", "drawer sai", "thanh lọc sai" → **audit** **tất cả** surface của module và các module cùng pattern trong batch.

Trong audit, tách control cùng tên nhưng khác **pattern**:

- Toolbar filter: filter chip (`FilterChip*`, `ToolbarFilterChipGroup`, count/reset) — không thay bằng combobox form.
- Form/drawer input: combobox/searchable combobox — không nhét filter chip vào form.
- Richtext/popup trong form: modal/popover design system — không `prompt/alert/confirm` native nếu app đã có pattern.

## Hybrid verification (local mandatory + production opt-in)

Mọi thay đổi UI verify như hệ thống liên kết (toolbar, filter, list/detail/form/drawer, permission actions, responsive, export thật, cross-module sync).

- **Local (mặc định bắt buộc):** lint/typecheck/build/tests phù hợp risk; interaction check (add drawer, row-click detail, form popup, filter/dropdown) — không chỉ mở route đọc text; desktop + mobile khi module có responsive.
- **Production (opt-in):** chỉ khi owner yêu cầu deploy/production proof → vòng lặp sửa → push → đợi deploy → verify production + screenshot. Mặc định tuân `rules/30-context-routing.md` (browser opt-in).
- Bằng chứng production: screenshot production; DOM chỉ hỗ trợ debug. Browser context mới hoặc bypass cache/PWA trước khi chụp.

## Chi tiết (lazy-load khi implement)

- Surface hard gates + verify + navigation: `references/ui-delivery-detail.md`
- Module → template + Clone/Audit checklist: `module-mapping.md`
