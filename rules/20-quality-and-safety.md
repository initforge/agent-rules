---
alwaysApply: true
description: Engineering quality, mutation safety, and regression boundaries.
---

# Quality and safety

- Prefer small cohesive changes, explicit ownership, and one source of truth.
- Before shared, destructive, or schema changes, find consumers with code intelligence or targeted search.
- Separate behavior change from cleanup; do not hide conflicts with force flags or placeholders.
- Treat auth, permissions, data loss/migration, security, production, and external providers as high risk; verify real allowed and denied paths.
- Preserve data integrity, normalize optional values, handle mutation-boundary errors, and never expose secrets.
- Treat canonical source and project decisions as durable; generated artifacts are replaceable.
- Resolve destructive paths and keep them inside the authorized target.
- Preserve UTF-8; repair verified mojibake at canonical source.
- Fix safely in-scope technical debt introduced by the task before `PASS`.
