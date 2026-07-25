# Permission System

**Scope:** All 5fedu projects. Project-specific deviations → `projects/<name>/`.

## 6 basic permissions

`Xem` | `Thêm` | `Sửa` | `Xóa` | `Quản trị` | `Tất cả`

Module key in Supabase: **no-diacritics slug** (e.g., `nhan_vien`, `don_hang`).  
App ↔ DB mapping: `src/lib/permission-db-keys.ts`.

## Taxonomy: subsystem / group / module

**Navigation authority:** `src/lib/sidebar-menu.tsx` (NOT `src/features/` folder structure).

| Level | Meaning | Example |
|---|---|---|
| **Subsystem** | Dashboard tab | Website · Administration · Operations · Finance · System |
| **Group** | Card group in subsystem | *Sales Management* · *Inventory* · *Services* |
| **Module** | Single card/route | Orders · Receiving · Inventory |

Permission matrix config must mirror the same subsystem → group → module structure as sidebar. Do not group by bounded-context code if cards display under different subsystems.

### Stats/report modules

| Pattern | Matrix permission | Actual UI |
|---|---|---|
| Stats tab inside CRUD | Same parent module | View + export only |
| Standalone stats, own permission | Separate row — prefer only **Xem** | No CRUD |
| Standalone stats, borrowing parent permission | No separate row | Accessible if user has parent module permission |

## `cap_bac` hierarchy

| Level | View scope | Edit scope |
|---|---|---|
| `cap_bac=1` or `quyen_quan_tri` | All | All |
| `cap_bac=2` | By `phong_id` (department) | Only unlocked records in department |
| `cap_bac=3` | By `nhom_id` (group) | Same within group |
| Others | Own records (`id_nhan_vien` / `nguoi_tao`) | Own records only |

## RLS vs app-level filtering

- **Default:** permission filtering at **app/service layer** (better agent control).
- **RLS authenticated:** every app table must have "logged-in user only" policy.
- **Row-level RLS:** only for sensitive data (e.g., payroll) — owner must confirm.

## Do NOT

- Infer approval permission from regular edit permission.
- Test permission with admin account only.
