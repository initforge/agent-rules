# Pillar 2: Database, Auth and Verification Gates

Tai lieu nay chi giu rule song cho database/auth/permission/schema cua 5fedu.

## Core Baseline

- App table primary key mac dinh la `id int8` auto-increment.
- Foreign key toi app table cung dung `int8`.
- Login dung `ten_dang_nhap`.
- Admin mac dinh: `admin` / `5fedu.com`.
- Tai khoan thuong mac dinh: `123456`.
- Supabase service role chi duoc dung o server/admin path, khong nam o client.
- CRUD that khong duoc mock ao neu feature da duoc yeu cau that.

## Schema Source Of Truth

- Khong doan bang, cot, relation, trigger, RLS, credential hay permission.
- Truoc khi sua code lien quan DB, phai doi chieu schema that bang query, migration hoac source dang tin cay.
- Voi module clone tu template/pattern cu, phai quet lai `tableName`, `.select(...)`, alias foreign key relation, payload insert/update.
- Cam suy dien rang bang/cot `var_*`, `web_*`, `tc_*`, `kv_*` giua cac module la giong nhau.

## Runtime Schema Error Protocol

Neu gap loi kieu:

- `schema cache`
- `Could not find the table`
- `Could not find a relationship`
- `column ... does not exist`

thi xu ly theo thu tu:

1. xac minh schema that
2. sua code dang goi sai bang/cot/relation
3. neu UI/business da chot ma DB con thieu, them schema fix/migration idempotent
4. reload PostgREST schema cache

Khong va UI de che loi DB.

## Verification Gate

Khi task dung database, auth, permission, trigger, rollup, cascade hoac service ghi du lieu:

- query lai database sau CRUD de doi chieu record, field, audit column va FK
- kiem tra bang cha, bang con, bao cao va module lien quan neu co rollup/cascade
- test permission bang du account dai dien, khong chi admin
- test read/list/detail va hanh dong duoc phep/khong duoc phep trong scope
- neu external integration khong test that duoc, doc code/config/error path ky va ghi verification gap ro rang

## Cross-Module Discipline

- Khong isolated fix. Sua schema/API/type/service thi phai ra cac noi dung lien quan.
- Khi doi data contract, phai quet toan repo de cap nhat caller, query, map, export, dropdown, report.
- Sau mutation phai invalidate cache phu hop de UI va data source dong bo.
