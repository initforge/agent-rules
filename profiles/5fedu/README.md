# 5fedu profile

Optional context for 5fedu ERP/Admin work. It is inactive by default and is
never a substitute for the active project's installed `context/5fedu/` pack.
Project facts, exceptions, decisions, source locks, parity packets, archive,
and evidence stay lazy and project-scoped.

## Load only the matching rule

| Intent | Rule | Non-negotiable outcome |
|---|---|---|
| ERP workflow, master-detail, approval, rollup, export, stats | `rules/business.md` | Model the linked workflow and verify it with real related data. |
| Schema, migration, Supabase, login, auth | `rules/data-auth.md` | Verify the real schema before changing it; do not guess. |
| Permission, `cap_bac`, data scope, sidebar, RLS | `rules/permissions.md` | Preserve both action rights and record scope across UI, service, and database. |

`README.md` is the sole always-loaded profile file (budget: at most 1,500
tokens). The three rules above are route-loaded; UI/module parity remains owned
by the existing 5fedu module-parity capability and module mapping.

## Semantic migration ledger — P1-LEAN-FOUNDATION

| Source claims retained for later cleanup | Target owner | Status |
|---|---|---|
| `domains/business/patterns.md` + `projects/domains/business.md`: entity roles, parent-child, approval, rollups, lookup, actions, reporting, organization, stats | `rules/business.md` | migrated |
| `domains/database/conventions.md` + `projects/domains/database.md` + organization conventions: naming, `int8`, audit, authenticated RLS, fake-email auth, schema verification | `rules/data-auth.md` | migrated |
| `domains/security/permissions.md` + `projects/domains/permissions.md` + organization conventions: six rights, sidebar taxonomy, stats, `cap_bac`, app/RLS split | `rules/permissions.md` | migrated |
| Project-specific Tah-app/Nostime decisions and reference/template sources | existing project-local, decision, parity, and module-mapping paths | retained; not promoted |

The old files are deliberately retained during this foundation slice. They are
reference inputs until a later, verified deletion/move slice reconciles every
claim.
