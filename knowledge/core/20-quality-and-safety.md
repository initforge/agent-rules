---
alwaysApply: true
description: Engineering quality, mutation safety and regression boundaries.
---

# Quality and safety

- Prefer small cohesive changes, explicit ownership and one source of truth.
- Before delete/rename/refactor/shared API or schema changes, find call sites with Codebase MCP when available; fallback to `rg`, targeted reads and native symbol navigation.
- Separate behavior change from cleanup. Do not hide conflicts with force flags or placeholders.
- Database/auth/permission/production work is high risk: verify real interfaces and test allowed/denied paths, not admin-only happy paths.
- Preserve data integrity, normalize optional values correctly, handle errors at mutation boundaries and never expose secrets.
- Generated runtime/build artifacts are replaceable; canonical source and project decisions are not.
- Destructive filesystem operations require resolved-path checks and must stay inside the named target.
- Preserve Unicode as UTF-8. If Vietnamese text shows mojibake from double-decoded UTF-8, treat it as corruption, repair the canonical source instead of normalizing around it, and verify no matching corruption remains in active context files.
- New technical debt created by the task must be fixed before `PASS` when it is safely in scope.
