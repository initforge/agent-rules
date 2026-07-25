# 5fedu Organization Conventions

**Scope:** All projects built under the 5fedu organization.  
**Canonical source:** This file. Installer copies to project repos.  
**Not to be confused with:** Project-specific deviations in `projects/<name>/`.

## Project structure

Every 5fedu project inherits:
- `context/5fedu/` — installed template pack (managed by `08-install-5fedu-context.ps1`)
- `context/5fedu/project-local/` — NEVER overwritten by installer
- Template: `5f-template-ket-noi-supabase` (React/Vite/Supabase)

## Technology baseline

| Component | Default | Exception mechanism |
|---|---|---|
| Frontend | React (Vite) + TypeScript | `projects/<name>/tech-deviations.md` |
| UI | Tailwind + `components/ui` (shadcn-style) | Per-project |
| Data | TanStack Query + Zustand | Per-project |
| Forms | React Hook Form + Zod | Per-project |
| Backend | Supabase PostgreSQL | Per-project |
| Auth | Supabase Auth + fake-email mapping | Per-project |
| Media | Cloudinary (when declared) | Per-project |

## Context routing policy

- Organization conventions: never auto-load
- Domain patterns: auto-load when triggered
- Project facts: load only for matching project
- Evidence/archive: never auto-load
- Generated context: identifies source files + version

## Sync ownership

| Layer | Canonical | Sync direction | Installer overwrites |
|---|---|---|---|
| Organization | agent-rules | agent-rules → project repos | Yes (template) |
| Domains | agent-rules | agent-rules → project repos | Yes (template) |
| Project-local | project repo | Never synced to agent-rules | Never |
| Evidence | agent-rules | Static (no sync) | N/A |
| Archive | agent-rules | Static (no sync) | N/A |

## Unchanging org rules

- `id int8` auto-increment for PKs (no UUID in app tables)
- Fake-email auth (`ten_dang_nhap` → `<ten>@gmail.com`)
- 6 basic permissions: Xem, Thêm, Sửa, Xóa, Quản trị, Tất cả
- Audit columns: `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`
- `cap_bac` hierarchy: 1=full, 2=department, 3=group, 4=self
