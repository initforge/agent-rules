# 5fedu Context Router

**Vai trò:** Bảng định tuyến domain — agent chỉ nạp file đúng domain khi trigger khớp.  
**Ý đồ:** Giảm context window bằng lazy-load; trigger phải đúng ý đồ (precision) nhưng cover đủ cách nói thật (recall).

## Cách dùng

1. Đọc `AGENTS.md` trước.
2. Nếu có `project-local/00-index.md` → đọc router dự án (sheets, Supabase, decisions).
3. Khớp keyword/câu user với bảng dưới → mở **đúng file domain**.
4. Mỗi domain có **hành động bắt buộc** — không chỉ đọc rồi bỏ qua.

| Domain | Trigger (phrase bank) | File | Hành động bắt buộc |
|---|---|---|---|
| UI / giao diện | **làm module mới**, **thêm module**, **sửa module**, **refactor module**, **clone module**, **thêm chức năng**, lệch, sai pattern, thiếu nút, drawer sai, thanh lọc sai, khác template, nhập hàng lệch, form sai, listview sai, responsive, parity, đối chiếu template, tạo màn hình, chỉnh giao diện module | `domains/ui-delivery.md` + `domains/module-mapping.md` + skill `5fedu-module-parity` | Tra mapping → chọn Nhân viên/Phòng ban → mở route template + route hiện tại → đối chiếu **trước** khi sửa/tạo. **Cấm** `frontend-architect` làm nguồn chính. |
| Database / schema | bảng, cột, migration, RLS, trigger, int8, uuid, schema cache, foreign key, index | `domains/database.md` + `project-local/database-and-auth.md` nếu có | Đối chiếu schema thật trước khi sửa code; không đoán |
| Auth / đăng nhập | đăng nhập, ten_dang_nhap, fake email, admin, mật khẩu, đăng ký | `domains/database.md` (mục Auth) | Áp fake-email + sync Supabase Auth |
| Phân quyền | phân quyền, cap_bac, quyền xem/sửa/xóa, quản trị, phong_id, nhom_id | `domains/permissions.md` | Đọc chuẩn cap_bac; không suy diễn từ quyền sửa thường |
| Nghiệp vụ ERP | master-detail, duyệt, rollup, export, báo cáo, thống kê | `domains/business.md` | Chọn pattern đúng; verify cross-module |
| Template / stack | template, vite, supabase, tech stack, clone module | `domains/tech-stack.md` + `domains/module-mapping.md` | Source of truth: `5f-template-ket-noi-supabase` + React/Vite |
| Quyết định owner | đã chốt, DA_CHOT, CAN_HOI_THEM | `project-local/decisions.md` hoặc `decisions.md` | Không hỏi lại mục DA_CHOT; Nostime → `project-local/` hoặc overlay |
| Thiếu dữ kiện | chưa rõ, thiếu spec | `project-local/open-questions.md` hoặc `open-questions.md` | Ghi câu hỏi, không tự bịa |

## Skill exclusion (UI parity)

- UI parity ERP (tạo/sửa/refactor module): **`5fedu-module-parity`** + **`ui-delivery` + `module-mapping`** — không `frontend-architect`, không `master-image-generation` làm source chính.
- `frontend-architect`: chỉ branding/landing/redesign ngoài shell module ERP.

## Không auto-load

- `evidence/` — feedback thô, audit
- `legacy/` — tham chiếu cũ
- `archive/nostime/` — overlay template nostime, không phải project-local
- `project-local/evidence/` — log dự án
