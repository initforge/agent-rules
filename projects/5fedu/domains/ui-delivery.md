# UI/UX parity và delivery gates

**Vai trò:** Pattern-format UI/workflow 5fedu — linh hoạt theo template, không rập khuôn cứng.  
**Ý đồ:** Parity với template trước khi sửa; audit toàn surface khi user báo lệch.

## Quick gate (đọc trước)

- Task **sửa module** cũ hoặc **tạo mới** module ERP → đọc Clone/Audit checklist trong `module-mapping.md` trước khi code.
- User báo lệch/sai **pattern** → **không** dùng `frontend-architect`; audit **parity** toàn surface.
- Tra `module-mapping.md` → chọn Nhân viên / Phòng ban / Chức vụ.
- Mở route template + route hiện tại → đối chiếu bằng mắt → mới sửa.
- Audit **tất cả** surface module (toolbar, **drawer**, filter chip, pagination, detail footer).
- **Cấm generic** hóa module — mỗi feature có file view/table/form/service riêng.
- PASS cần `Template reference` + verification evidence trong report.

## Core UI source of truth

- Template/current app là source of truth bắt buộc.
- Không tự chế pattern mới nếu đã có pattern sống trong template/app.
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

## Chi tiết (lazy-load khi implement)

- Surface hard gates + verify + navigation: `references/ui-delivery-detail.md`
- Module → template + Clone/Audit checklist: `module-mapping.md`
