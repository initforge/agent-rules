# Setup Supabase (một lần)

Hướng dẫn cho project **chưa chạy SQL nào** trên Supabase. Fresh DB: **chỉ chạy bootstrap**, không chạy `supabase/migrations/_archive/`.

## 1. Biến môi trường app

Copy `.env.example` → `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_preset
# Dev mock (production build defaults to supabase — omit on Vercel)
# VITE_DATA_SOURCE=mock
# Tuỳ chọn — mặc định @gmail.com (khớp edge function AUTH_EMAIL_SUFFIX)
# VITE_AUTH_EMAIL_SUFFIX=@gmail.com
```

Đăng nhập app dùng **tên đăng nhập** + hậu tố email giả cho Supabase Auth (vd. `admin` → `admin@gmail.com`). Chi tiết: [`lib/auth-email.ts`](../lib/auth-email.ts).

## 2. Chạy schema database (1 lần)

### Fresh DB (chưa có bảng)

Chạy **theo thứ tự** trong SQL Editor:

1. [`scripts/bootstrap-var-he-thong.sql`](../scripts/bootstrap-var-he-thong.sql) — tạo bảng, hàm, RLS
2. [`scripts/seed-var-he-thong.sql`](../scripts/seed-var-he-thong.sql) — dữ liệu nền (phòng ban, CEO, admin, công ty)

**Tuỳ chọn — dữ liệu demo:** xem [`scripts/README-seed.md`](../scripts/README-seed.md) (`seed-demo-*.sql`).

### DB đã có (bootstrap cũ / lỗi quyền nhiều dòng)

**Không chạy lại toàn bộ bootstrap** nếu bảng đã tồn tại. Chạy migration theo nhu cầu:

| File | Khi nào |
|------|---------|
| [`migrate-var-phan-quyen-csv.sql`](../scripts/migrate-var-phan-quyen-csv.sql) | Quyền còn nhiều dòng / chưa CSV |
| [`migrate-remove-auth-admin-bypass.sql`](../scripts/migrate-remove-auth-admin-bypass.sql) | RLS vẫn bypass `user_metadata.role = admin` |
| [`migrate-check-login-username.sql`](../scripts/migrate-check-login-username.sql) | Thiếu RPC `check_login_username` (thông báo đăng nhập tiếng Việt) |

Sau đó chạy lại [`scripts/seed-var-he-thong.sql`](../scripts/seed-var-he-thong.sql) (phần quyền CEO) hoặc [`scripts/seed-demo-phan-quyen.sql`](../scripts/seed-demo-phan-quyen.sql).

Kiểm tra **Table Editor**: `var_phong_ban`, `var_chuc_vu`, `var_nhan_vien`, `var_cong_ty`, `var_phan_quyen`

**Không chạy** file trong `supabase/migrations/_archive/`.

### Tuỳ chọn — terminal

```bash
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-....pooler.supabase.com:6543/postgres" \
  node scripts/apply-sql-migration.mjs scripts/bootstrap-var-he-thong.sql

DATABASE_URL="..." \
  node scripts/apply-sql-migration.mjs scripts/seed-var-he-thong.sql
```

## 3. Deploy Edge Function `employee-auth`

Function xử lý: tạo tài khoản Auth cho nhân viên, đổi mật khẩu, **đổi tên đăng nhập** (xóa user cũ + tạo mới).

```bash
npm i -g supabase

supabase login
supabase link --project-ref YOUR_PROJECT_REF   # ref từ URL: https://XXXX.supabase.co

supabase functions deploy employee-auth

# Tuỳ chọn — khớp app
supabase secrets set AUTH_EMAIL_SUFFIX=@gmail.com
```

[`supabase/config.toml`](../supabase/config.toml): `verify_jwt = true` — chỉ user có JWT hợp lệ mới gọi được. Quyền gọi function: `var_phan_quyen` module `nhan_vien` — `create` cần `them`, các action khác cần `sua`.

## 4. Tài khoản đầu tiên (bootstrap thủ công)

User Auth đầu tiên tạo qua Dashboard (chưa có ai có quyền `them` trên module nhân viên để gọi edge function):

### 4a. User Auth

**Authentication → Users → Add user**

| Trường | Giá trị ví dụ |
|--------|----------------|
| Email | `admin@gmail.com` ( = `admin` + `VITE_AUTH_EMAIL_SUFFIX`) |
| Password | Mật khẩu bạn chọn |
| Auto Confirm User | Bật |

**User metadata (JSON)** — lấy `id` chức vụ CEO từ Table Editor → `var_chuc_vu`:

```json
{
  "full_name": "Admin",
  "id_chuc_vu": ["<uuid-chuc-vu-CEO>"]
}
```

Không cần `role` trong metadata. Quyền app/RLS đến từ `var_phan_quyen` (seed bước 2) + `chuc_vu_id` trên `var_nhan_vien`.

### 4b. Dữ liệu nền

Nếu đã chạy [`scripts/seed-var-he-thong.sql`](../scripts/seed-var-he-thong.sql) ở bước 2 thì **bỏ qua** SQL dưới đây.

Nếu chưa seed, chạy trong SQL Editor (hoặc dùng file seed ở trên):

```sql
-- Chỉ cần khi CHƯA chạy scripts/seed-var-he-thong.sql
INSERT INTO var_phong_ban (ma_phong_ban, ten_phong_ban, cap_do, duong_dan, trang_thai, thu_tu)
VALUES ('PB-HD', 'Ban Giám đốc', 1, '/1', 'Đang hoạt động', 0);

INSERT INTO var_chuc_vu (ma_chuc_vu, ten_chuc_vu, phong_ban_id, trang_thai, thu_tu)
SELECT 'CEO', 'Giám đốc', id, 'Đang hoạt động', 0
FROM var_phong_ban WHERE ma_phong_ban = 'PB-HD' LIMIT 1;

INSERT INTO var_nhan_vien (
  ho_ten, email, ten_dang_nhap, phong_ban_id, chuc_vu_id,
  gioi_tinh, trang_thai, tai_khoan_dang_hoat_dong
)
SELECT
  'Admin', 'admin@company.vn', 'admin', pb.id, cv.id,
  'Nam', 'Đang làm việc', true
FROM var_phong_ban pb, var_chuc_vu cv
WHERE pb.ma_phong_ban = 'PB-HD' AND cv.ma_chuc_vu = 'CEO';
```

### 4c. Đăng nhập app

- Tên đăng nhập: `admin`
- Mật khẩu: như bước 4a

Sau đó tạo nhân viên khác qua UI (form có **Tên đăng nhập** + **Mật khẩu tạm**).

## 5. Smoke test

- [ ] Tạo NV + tên đăng nhập + mật khẩu → đăng nhập được bằng tên mới
- [ ] Sửa NV → đổi tên đăng nhập + mật khẩu mới → login cũ fail, login mới OK; user cũ mất trong Authentication → Users
- [ ] Phân quyền matrix → RLS module hoạt động
- [ ] Lưu **Thông tin công ty** → `var_cong_ty` id = 1

## Thứ tự tóm tắt

| Bước | Việc làm | File / lệnh |
|------|-----------|-------------|
| 1 | Cấu hình `.env` | `.env` |
| 2 | Schema DB | `scripts/bootstrap-var-he-thong.sql` rồi `scripts/seed-var-he-thong.sql` |
| 3 | Deploy function | `supabase functions deploy employee-auth` |
| 4 | User Auth đầu tiên | Dashboard §4a (seed §4b đã có trong bước 2) |
| 5 | Chạy app | `npm run dev` |
