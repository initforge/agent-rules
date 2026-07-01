# Câu hỏi cần hỏi đúng lúc

**Vai trò:** Chỉ hỏi owner khi bị chặn thật — không thu hẹp scope dự án.  
**Ý đồ:** Tránh hỏi lại mục đã `DA_CHOT` trong `decisions.md`.

## Không hỏi lại

- Clone/adapt template `5f-template-ket-noi-supabase`: có (trừ khi owner đổi template).
- Backend Supabase thật khi dự án đã khai báo trong `decisions.md`.
- Quy ước `id int8`, fake-email auth, cap_bac phân quyền: xem `domains/database.md` + `permissions.md`.
- Task dài: agent tự cắt phase (`plan-and-handoff`), không hỏi "phase đầu".

## Chỉ hỏi khi chuẩn bị dùng thật

- Supabase URL / anon key (qua env, không paste docs).
- Service role nếu admin/auth flow cần.
- Cloudinary / Google Sheets credentials nếu flow hiện tại cần.
- Vercel project/token nếu deploy hoặc tối ưu Edge.

## Chỉ hỏi khi tạo schema/migration

- "Hàm index" là SQL index, RPC search, hay mẫu riêng owner?
- Prefix bảng mới ngoài convention đã thấy?
- Module nào exception permission so với 6 quyền cơ bản?

## Cách hỏi

Ngắn, đúng blocker; không hỏi lại `DA_CHOT`; không biến câu hỏi kỹ thuật thành thu hẹp scope.

## Dự án Nostime

Câu hỏi/decision riêng Nostime → `archive/nostime/` — không nhân bản ở đây.
