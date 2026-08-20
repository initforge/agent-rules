/**
 * Nhãn nút chuẩn – dùng thống nhất toàn app (ngắn gọn, một nguồn: `txt('common.*')` trong `lib/text/ui.ts`).
 *
 * **Quy ước (đồng bộ module Nhân viên / CRUD):**
 * - Toolbar thêm bản ghi: `BTN_ADD()` → **Thêm** (`common.add`); có thể dùng `common.addNew` (cùng nội dung **Thêm** cho chỗ hiển thị “Thêm mới” rút gọn).
 * - Footer form tạo mới: `BTN_CREATE()` → **Thêm** (`common.create`).
 * - Footer form sửa: `BTN_SAVE()` → **Lưu** (`common.save`).
 * - Hủy / đóng: `BTN_CANCEL()` → **Hủy**; `BTN_CLOSE()` → **Đóng**.
 * - Không nhân đôi nhãn dài trong `features/.../text.ts` (`Lưu thay đổi`, `Tạo mới`, …) trừ khi nghiệp vụ bắt buộc khác nghĩa — ưu tiên `FormDrawerFooter` mặc định + `compact` + `footerCompact` trên `GenericDrawer`.
 *
 * Chi tiết & checklist module: `docs/patterns-button-labels.md`, `docs/checklist-module.md` (mục nhãn nút).
 */
import { txt } from './text';

export const BTN_CANCEL = () => txt('common.cancel');
export const BTN_CLOSE = () => txt('common.close');
export const BTN_SAVE = () => txt('common.save');
export const BTN_CREATE = () => txt('common.create');
export const BTN_EDIT = () => txt('common.edit');
export const BTN_DELETE = () => txt('common.delete');
export const BTN_ADD = () => txt('common.add');

/** Confirm dialog */
export const CONFIRM_DELETE = () => txt('common.delete');
export const CONFIRM_DELETE_ALL = () => txt('common.deleteAll');
export const CONFIRM_YES = () => txt('common.confirm');

/**
 * Quy định footer drawer detail (áp dụng cho mọi module):
 * - Bên trái: nút Đóng (BTN_CLOSE).
 * - Bên phải: Sửa trước, Xóa sau (BTN_EDIT rồi BTN_DELETE).
 * Thứ tự: hành động chính (Sửa) trước, hành động nguy hiểm (Xóa) sau.
 */
export const DETAIL_FOOTER_ORDER = 'close_left_edit_then_delete_right' as const;
