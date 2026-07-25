# Database, Auth và Schema — 5fedu

**Vai trò:** Pattern-format cho database/auth — linh hoạt theo dự án, không rập khuôn cứng.  
**Ý đồ:** Schema nhất quán, tránh uuid/lỗi cache; auth fake-email đồng bộ Supabase.

## Quy tắc đặt tên bảng

**Viết tắt submenu + tên module** (snake_case):

- Đúng: `var_nhan_su`, `hc_phieu_hanh_chinh`
- Sai: `nhan-su`, `1.nhan-su`, uuid làm PK app table

## Bộ cột chuẩn (pattern)

Mỗi bảng app nên có:

| Cột | Ghi chú |
|---|---|
| `id` | `int8` auto-increment — **cấm uuid** |
| cột label | tên hiển thị |
| cột phân loại | nhóm/danh mục nếu có |
| `id_*` | FK tới bảng liên kết |
| mô tả / ghi chú / trạng thái | theo nghiệp vụ |
| `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat` | audit |

## Checklist "bảng đầy đủ"

Trước khi báo PASS schema module:

1. Cấu trúc cột chuẩn (hoặc lý do ngoại lệ đã ghi)
2. RLS policy **authenticated** (chỉ user đã login)
3. Hàm index phù hợp
4. Trigger cập nhật `tg_cap_nhat`

Chi tiết phân quyền theo dòng → `permissions.md` (lọc app vs RLS nhạy cảm).

## Auth (fake email)

- Login bằng `ten_dang_nhap`; app tự hiểu `admin` → `admin@gmail.com`
- Tạo/đổi `ten_dang_nhap` → sync Supabase Auth user `<ten>@gmail.com`, mật khẩu mặc định `123456`
- **Bỏ tính năng đăng ký** (registration)
- Admin mặc định: `admin` / `5fedu.com`
- Service role chỉ server/admin path, không client

## Module Nhân viên — field whitelist

Chỉ giữ: `id`, `ho_va_ten`, `avatar`, `trang_thai`, `id_phong_ban`, `id_chuc_vu`, `so_dien_thoai`, `email`, `ten_dang_nhap`. Không tự thêm trường.

## Schema source of truth

- Không đoán bảng/cột/relation/trigger/RLS
- Trước khi sửa DB code: đối chiếu schema thật (query/migration)
- Lỗi schema cache → verify schema → sửa code → migration idempotent → reload cache

## Verification gate

Sau CRUD: query lại DB; test ≥2 loại account; verify FK/audit/rollup liên quan.
