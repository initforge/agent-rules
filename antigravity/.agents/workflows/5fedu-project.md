---
description: Scaffold or update project-local 5fedu context using the Codex 5fedu skill contract.
---

# 5fedu Project

1. Read `C:\Users\DELL\.codex\skills\5fedu-project\SKILL.md`.
2. Inspect the target repo first. Read existing `AGENTS.md` and `.codex/5fedu/` if present.
3. If setup is requested, adapt or run `C:\Users\DELL\.codex\skills\5fedu-project\scripts\install-5fedu-context.ps1`.
4. Load `C:\Users\DELL\.codex\skills\5fedu-project\references\5fedu-context-map.md` before writing or updating project rules.
5. Preserve the intended project-local layout:

```text
AGENTS.md
.codex/5fedu/
|- 00-index.md
|- 01-tech-stack-and-template.md
|- 02-frontend-mapping.md
|- 03-database-supabase.md
|- 04-auth-permissions-and-flows.md
|- 05-delivery-quality.md
|- 06-decision-status.md
|- 07-working-format.md
|- 08-source-examples.md
|- 09-coverage-audit.md
|- 10-owner-feedback-lessons.md
|- 11-current-sheets-source-map.md
|- 12-owner-feedback-transport-ui.md
`- questions.md
```

6. Treat Supabase/auth/permission/database work as HIGH risk. Ask for missing schema, credentials, permissions or module mapping instead of inventing values.
7. Before implementation, read `06-decision-status.md`; do not implement areas marked `CHUA_CHOT` or `CAN_HOI_THEM`.
8. Before transport/UI/report/payroll/derived-total work, read `12-owner-feedback-transport-ui.md`.
9. End with files changed, verification run, unknowns, and final status `PASS`, `PARTIAL`, or `BLOCKED`.
