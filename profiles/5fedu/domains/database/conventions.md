# Database, Auth, and Schema Conventions

**Scope:** All 5fedu projects. Project-specific deviations → `projects/<name>/`.

## Table naming

**Submenu abbreviation + module name** (snake_case):
- Correct: `var_nhan_su`, `hc_phieu_hanh_chinh`
- Incorrect: `nhan-su`, `1.nhan-su`, UUID as PK for app tables

## Standard column set

Every app table should have:

| Column | Notes |
|---|---|
| `id` | `int8` auto-increment — NO uuid |
| label column | Display name |
| classification column | Group/category |
| `id_*` | FK to related table |
| description / notes / status | Per business |
| `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat` | Audit |

## Complete table checklist

Before PASS for a module schema:
1. Standard column structure (or documented exception)
2. RLS policy `authenticated` (only logged-in users)
3. Appropriate indexes
4. Trigger for `tg_cap_nhat` auto-update

Row-level permission → `domains/security/permissions.md`.

## Auth (fake email)

- Login by `ten_dang_nhap`; app maps `admin` → `admin@gmail.com`
- Create/change `ten_dang_nhap` → sync Supabase Auth user `<ten>@gmail.com`, default password `123456`
- **No registration feature**
- Default admin: `admin` / `5fedu.com`
- Service role: server/admin path only, not client

## Schema source of truth

- Never guess tables/columns/relations/triggers/RLS
- Before editing DB code: verify against real schema (query/migration)
- Schema cache errors → verify schema → fix code → idempotent migration → reload cache

## Verification gate

After CRUD: query DB; test ≥2 account types; verify FK/audit/rollup.
