# 5fedu Context Router

**Vai trò:** Bảng định tuyến domain — agent chỉ nạp file đúng domain khi trigger khớp.  
**Ý đồ:** Giảm context window bằng lazy-load; trigger phải đúng ý đồ (precision) nhưng cover đủ cách nói thật (recall).

## Cách dùng

1. Đọc `AGENTS.md` trước.
2. Khớp keyword/câu user với bảng dưới → mở **đúng file domain**.
3. Mỗi domain có **hành động bắt buộc** — không chỉ đọc rồi bỏ qua.

| Domain | Trigger (phrase bank) | File | Hành động bắt buộc |
|---|---|---|---|
| UI / giao diện | lệch, sai pattern, thiếu nút, drawer sai, thanh lọc sai, khác template, nhập hàng lệch, form sai, listview sai, responsive | `domains/ui-delivery.md` + `domains/module-mapping.md` | Mở module đã map → mở route template + route hiện tại → đối chiếu bằng mắt với module tham chiếu (Nhân viên/Phòng ban/Chức vụ) trước khi sửa |
| Database / schema | bảng, cột, migration, RLS, trigger, int8, uuid, schema cache, foreign key, index | `domains/database.md` | Đối chiếu schema thật trước khi sửa code; không đoán |
| Auth / đăng nhập | đăng nhập, ten_dang_nhap, fake email, admin, mật khẩu, đăng ký | `domains/database.md` (mục Auth) | Áp fake-email + sync Supabase Auth |
| Phân quyền | phân quyền, cap_bac, quyền xem/sửa/xóa, quản trị, phong_id, nhom_id | `domains/permissions.md` | Đọc chuẩn cap_bac; không suy diễn từ quyền sửa thường |
| Nghiệp vụ ERP | master-detail, duyệt, rollup, export, báo cáo, thống kê | `domains/business.md` | Chọn pattern đúng; verify cross-module |
| Template / stack | template, vite, supabase, tech stack, clone module | `domains/tech-stack.md` + `domains/module-mapping.md` | Source of truth: `5f-template-ket-noi-supabase` + React/Vite |
| Quyết định owner | đã chốt, DA_CHOT, CAN_HOI_THEM | `decisions.md` | Không hỏi lại mục DA_CHOT; Nostime → `archive/nostime/decisions.md` |
| Thiếu dữ kiện | chưa rõ, thiếu spec | `open-questions.md` | Ghi câu hỏi, không tự bịa |

## Không auto-load

- `evidence/` — feedback thô, audit
- `legacy/` — tham chiếu cũ
- `archive/nostime/` — dự án Nostime tách riêng, không phải template 5fedu chung
