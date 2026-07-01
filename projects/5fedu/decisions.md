# Quyết định — template 5fedu chung

**Vai trò:** Ma trận quyết định owner cho mọi dự án dùng template `5f-template-ket-noi-supabase`.  
**Ý đồ:** Chỉ giữ quyết định generic; dự án riêng (vd Nostime) → `archive/nostime/decisions.md`.

## Quy ước trạng thái

- **`DA_CHOT`**: Owner xác nhận — được dùng làm cơ sở triển khai.
- **`CHUA_CHOT`**: Mặc định / chưa đủ — hỏi trước khi làm phần rủi ro.
- **`CAN_HOI_THEM`**: Thiếu dữ kiện — ghi `open-questions.md`.

## Ma trận (template chung)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Context 5fedu theo từng dự án | DA_CHOT | Cài `context/5fedu/` — không phình global |
| Clone/adapt `5f-template-ket-noi-supabase` | DA_CHOT | React/Vite + Supabase |
| Khóa chính app table `id int8` | DA_CHOT | Cấm uuid làm PK |
| Fake-email auth + sync Supabase Auth | DA_CHOT | Xem `domains/database.md` |
| Phân quyền cap_bac + 6 quyền | DA_CHOT | Xem `domains/permissions.md` |
| **Nhân viên** = canonical CRUD reference | DA_CHOT | List/form/detail + tab stats |
| **Phòng ban** = hierarchy 2 cấp | DA_CHOT | Cha-con tổ chức |
| **Chức vụ** trong trục Phòng ban | DA_CHOT | Không tách rời khỏi cây tổ chức |
| Đối tác / chi nhánh | DA_CHOT | Clone shell CRUD từ Chi nhánh template |
| Tài liệu nội bộ | DA_CHOT | 2 module + phân quyền theo chức vụ |
| Thu chi / phân bổ tài chính | DA_CHOT | Danh mục Thu/Chi theo tháng |
| Bảng lương trên Nhân viên | DA_CHOT | Điền tay + in phiếu (pattern) |
| Tech stack Supabase thật | DA_CHOT | Keys qua env, không paste docs |

## Câu hỏi mở (template)

- Service role cho admin auth? (env only)
- "Hàm index" = SQL index, RPC, hay mẫu riêng?
- Module nào exception permission?

## Dự án 5fedu thật

Chỉ **Tah-app** và **nostime** — quyết định riêng trong `context/5fedu/` mỗi repo sau cài. Template harness: `projects/known-5fedu-repos.md`.

Nostime retail → `archive/nostime/` (overlay khi cài profile `nostime`) — không auto-load cho tah-app.
