---
alwaysApply: true
description: Engineering quality, mutation safety, and regression boundaries.
---

# Quality and safety

- Prefer cohesive, owned changes and one source of truth.
- Before shared/destructive/schema changes, find consumers via targeted search.
- Separate behavior from cleanup; never hide conflicts with force flags/placeholders.
- Treat auth, permissions, migration, security, production, and external providers as high risk; verify allow/deny paths.
- Preserve data integrity; handle mutation errors; never expose secrets.
- Keep source/decisions durable; generated artifacts are replaceable.
- Resolve destructive paths and keep them inside the authorized target.
- Preserve UTF-8; repair verified mojibake at canonical source.
- Fix safely in-scope technical debt introduced by the task before `PASS`.
- Manual UI/design/browser proof is foreground-visible; headless is CI-only; unavailable visibility is `BLOCKED`/`UNAVAILABLE`; human review remains final.
