# 5fedu data and auth rules

Route for schema, migrations, Supabase, login, username, RLS, triggers,
foreign keys, indexes, or schema-cache failures.

1. Name app tables as `submenu_abbreviation_module_name` in snake_case. Use an
   `int8` auto-increment `id`, not UUID, unless a documented project exception
   exists. Include the display/classification fields required by the business,
   `id_*` foreign keys, relevant notes/status, and audit columns
   `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
2. A complete app table has documented column exceptions, authenticated-only
   RLS, suitable indexes, and a trigger that updates `tg_cap_nhat`.
3. Never infer tables, columns, relationships, triggers, or policies. Inspect
   the real schema/query or migration first. For schema-cache drift: verify
   schema, correct code, apply an idempotent migration, then reload the cache.
4. Login uses `ten_dang_nhap` with fake-email mapping (`admin` becomes
   `admin@gmail.com`). Creating or changing that username synchronises the
   matching Supabase Auth user with the source default password `123456`;
   registration is not a feature. The source bootstrap administrator is
   `admin` / `5fedu.com`: use it only for controlled bootstrap, reset/rotate it
   before a shared or production deployment, and never place either bootstrap
   or service-role credentials in client code.
5. After CRUD, query the database and verify foreign keys, audit fields, and
   affected rollups with at least two account types.

The Employee baseline field whitelist is `id`, `ho_va_ten`, `avatar`,
`trang_thai`, `id_phong_ban`, `id_chuc_vu`, `so_dien_thoai`, `email`, and
`ten_dang_nhap`; do not add fields without a verified project requirement.
Record project exceptions and deviations in the active project's local context.
