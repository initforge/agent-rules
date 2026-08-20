# SQL scripts — Hệ thống (var_*)

## Fresh database (chưa có bảng)

Chạy **theo thứ tự** trong Supabase SQL Editor:

| # | File | Mục đích |
|---|------|----------|
| 1 | [`bootstrap-var-he-thong.sql`](bootstrap-var-he-thong.sql) | Schema, hàm, RLS |
| 2 | [`seed-var-he-thong.sql`](seed-var-he-thong.sql) | Tối thiểu: PB-HD, CEO, admin, công ty, quyền CEO |

Sau đó (tuỳ chọn) bổ sung dữ liệu demo — xem bảng dưới.

## Database đã có (bootstrap cũ / quyền nhiều dòng)

**Không chạy lại toàn bộ bootstrap** nếu bảng đã tồn tại và hay báo lỗi trùng object.

Chạy **một file**:

| File | Mục đích |
|------|----------|
| [`migrate-var-phan-quyen-csv.sql`](migrate-var-phan-quyen-csv.sql) | Gộp `var_phan_quyen` → 1 dòng/chức vụ+module, quyen CSV |
| [`migrate-remove-auth-admin-bypass.sql`](migrate-remove-auth-admin-bypass.sql) | RLS/`has_module_permission` chỉ qua `var_phan_quyen`, bỏ bypass JWT role |

Có thể chạy lại các file migration nhiều lần (idempotent).

## Dữ liệu demo (tuỳ chọn)

Chạy sau bước seed tối thiểu. Thứ tự quan trọng vì FK:

| # | File | Nội dung |
|---|------|----------|
| 1 | [`seed-demo-phong-ban.sql`](seed-demo-phong-ban.sql) | 7 phòng gốc + 14 nhóm con |
| 2 | [`seed-demo-chuc-vu.sql`](seed-demo-chuc-vu.sql) | ~63 chức vụ gắn phòng ban, **tên thủ công** (vd. Trưởng phòng Kế toán) — **bắt buộc trước seed NV** |
| 3 | [`seed-demo-nhan-vien.sql`](seed-demo-nhan-vien.sql) | ~18 nhân viên mẫu |
| 4 | [`seed-demo-phan-quyen.sql`](seed-demo-phan-quyen.sql) | Ma trận quyền TP/PP/TN/NV/PGD |
| 5 | [`seed-demo-cong-ty.sql`](seed-demo-cong-ty.sql) | Thông tin công ty đầy đủ hơn |

Tất cả file seed đều **idempotent** (chạy lại không nhân bản).

**DB đã seed tên chức vụ generic** (Trưởng phòng, Nhân viên, …): chạy lại [`seed-demo-chuc-vu.sql`](seed-demo-chuc-vu.sql) — block UPDATE cuối file ghi đè `ten_chuc_vu` từ bảng khai báo thủ công; không cần reseed nhân viên.

## Terminal (tuỳ chọn)

```bash
export DATABASE_URL="postgresql://postgres.[ref]:[password]@....pooler.supabase.com:6543/postgres"

node scripts/apply-sql-migration.mjs scripts/migrate-var-phan-quyen-csv.sql
node scripts/apply-sql-migration.mjs scripts/seed-var-he-thong.sql
node scripts/apply-sql-migration.mjs scripts/seed-demo-phong-ban.sql
# ... các file seed-demo-* tiếp theo
```

Chi tiết setup app + Auth: [`docs/supabase-setup.md`](../docs/supabase-setup.md)
