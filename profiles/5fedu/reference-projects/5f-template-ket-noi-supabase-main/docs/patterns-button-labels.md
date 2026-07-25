# Quy tắc nhãn nút (UI chung)

Mục tiêu: nhãn **ngắn**, **thống nhất** giữa toolbar, drawer form, drawer chi tiết — cùng style module **Nhân viên**.

## Nguồn chân lý

| Mục đích | Key `txt` | Nội dung tiếng Việt (mặc định) | Helper |
|----------|-----------|-------------------------------|--------|
| Thêm bản ghi (toolbar) | `common.add` / `common.addNew` | **Thêm** | `BTN_ADD()` |
| Gửi form **tạo mới** | `common.create` | **Thêm** | `BTN_CREATE()` |
| Gửi form **sửa** | `common.save` | **Lưu** | `BTN_SAVE()` |
| Hủy form | `common.cancel` | **Hủy** | `BTN_CANCEL()` |
| Đóng chi tiết | `common.close` | **Đóng** | `BTN_CLOSE()` |
| Sửa / Xóa (detail) | `common.edit` / `common.delete` | **Sửa** / **Xóa** | `BTN_EDIT()` / `BTN_DELETE()` |
| Lưu ở màn hình matrix / dạng đặc thù | `common.saveChanges` | **Lưu** | (dùng trực tiếp `txt('common.saveChanges')` nếu cần) |
| Hủy ở màn hình đặc thù | `common.cancelAction` | **Hủy** | `txt('common.cancelAction')` |

Định nghĩa chuỗi: `lib/text/ui.ts` → `common.*`.  
Helper tái sử dụng: `lib/button-labels.ts`.

## Form trong drawer

- Dùng `FormDrawerFooter` với **`compact`**; trên `GenericDrawer` bật **`footerCompact`** (padding footer gọn).
- **Không** truyền `saveLabel` / `createLabel` riêng từng module nếu chỉ muốn “Lưu” / “Thêm” — để mặc định từ `BTN_SAVE` / `BTN_CREATE`.
- Chỉ truyền `createIcon` khi cần icon khác mặc định (vd. Briefcase cho Chức vụ).

## Toolbar

- Nút chính thêm: `txt('common.addNew')` hoặc `BTN_ADD()` — cùng chuẩn **Thêm** (không dùng “Thêm mới” trên nút trừ khi product yêu cầu).

## Module mới

Khi thêm `features/.../text.ts`, tránh thêm key `form.save` / `form.create` trùng nghĩa với `common.*` trừ khi có copy đặc thù (vd. “Gửi duyệt”).

Xem thêm: [checklist-module.md](./checklist-module.md) (mục nhãn nút).
