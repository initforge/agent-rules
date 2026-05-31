---
name: 5fedu-project
description: Scaffold or maintain project-local 5fedu context for Codex work. Use when the user asks to set up a 5fedu repo, create/refresh AGENTS.md, add or update .codex/5fedu/*.md rules, update decision status/questions, record new 5fedu conventions, or preserve owner feedback gates for Supabase/auth/database/UI/transport modules. Do not use as a required context-loading ritual for ordinary implementation; normal work should read the repo's AGENTS.md and relevant project-local context automatically.
---

# 5fedu Project

## Core Rule

Keep 5fedu rules project-local by default. Do not expand the global `AGENTS.md` with long customer-specific rules. Use this skill as the reusable setup entry and write concise project context into the target repo.

`/5fedu` is for setup and context maintenance only. Once a repo has `AGENTS.md` and `.codex/5fedu/`, ordinary coding work should rely on those project-local files without the user needing to call `/5fedu` again.

## Workflow

1. Inspect the target repo first. If `AGENTS.md` or `.codex/5fedu/` already exists, read it before changing anything.
2. If the user wants setup, run or adapt `scripts/install-5fedu-context.ps1` to scaffold the project-local context files.
3. Load `references/5fedu-context-map.md` when writing or updating project rules.
4. Ask for missing spec, credentials, database rules, or module mapping before implementation. Never invent table names, fields, permissions, or screen mappings.
5. For real implementation work, map every requested feature from spec -> domain -> module -> view/tab -> source path -> database table -> handler/service. Record uncertain mappings before coding.
6. Treat Supabase/auth/permission/database work as HIGH risk: create a locked plan, require credentials or mocks explicitly, verify behavior, and do not store secret values in docs.
7. Treat owner feedback about UI/business flows as reusable gates, not one-off fixes. For transport apps, record list/detail/form/action/totals/combobox/print/approve requirements in project context before coding.
8. When a template commit is provided, clone or update it under `.codex/template-source/` and record the exact commit in project context. Use it as the UI reference for list, detail, form, dashboard, toolbar, combobox, drawer, table, and mobile card patterns.

## Project Files

Recommended target layout:

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

`AGENTS.md` should be a lightweight pointer/loading policy, not an `@` include list for every file. Put detailed rules under `.codex/5fedu/`.
Treat `06-decision-status.md` as the source of truth for what is confirmed, unconfirmed, blocked, or paused.
Treat `07-working-format.md` as the source of truth for default 5fedu format/how-to when concrete app-specific values are not yet confirmed.
Treat `08-source-examples.md` as concrete examples extracted from the original prompt/images; use it to infer style, not to replace app-specific confirmation.
Use `09-coverage-audit.md` to verify whether the current context covers the original 5fedu prompt and to avoid losing requirements during future updates.
Use `10-owner-feedback-lessons.md` as a hard gate for repeated owner feedback: database ids must be `int8` auto-increment, employee tables must stay lean, login must use `ten_dang_nhap`, and username create/update/delete must sync Supabase Auth through a server/admin path.
Use `11-current-sheets-source-map.md` as the source map for current Google Sheets/spec exports.
Use `12-owner-feedback-transport-ui.md` as a hard gate for repeated transport/UI feedback: homepage order, real employee email vs fake auth email, external drivers, proper list/detail/form, combobox relation fields, derived totals, print/approve actions, and report UI quality.

## Implementation Discipline

- Prefer adding/adapting modules from `https://github.com/tahdieuphoi-ctrl/TAH_app`; avoid deleting or broadly rewriting template code unless approved.
- Keep Vietnamese names for submenu/module folders and labels where the source app convention uses Vietnamese.
- Keep route/view keys predictable, usually lowercase kebab Vietnamese without accents for route/module keys.
- Use real Supabase/frontend integration once credentials are provided; avoid dead buttons, placeholder-only flows, or missing handlers.
- Search must cover direct table fields and linked display fields.
- On mobile use card view; on desktop use list view unless the project spec says otherwise.
- Do not treat a business module as complete merely because generic CRUD exists. Verify list/detail/form/action/history/report behavior against the template and source spec.
- For transport/payroll/trip modules, do not allow manual entry for totals that should be derived from child rows or real trip data.
- Use Combobox/AsyncCombobox for relation fields with many options, especially drivers, locations, vehicles, trips, employees.
- Keep approval/print/export as explicit actions in the correct surface; approval must not be embedded as a form submit button unless the owner explicitly says so.
- End delivery with verification evidence and a Supabase Egress + Vercel Edge Function optimization reminder/plan when the app is near completion.
- Before implementation, read `06-decision-status.md`; do not implement any area marked `CHUA_CHOT` or `CAN_HOI_THEM` until the user confirms it.
- If a concrete value is unconfirmed, still follow the format/how-to in `07-working-format.md`; ask only for the missing value.
- Before database/auth/employee/migration/seed work, read `10-owner-feedback-lessons.md`; stop if the code/schema uses text/uuid ids, HR-style extra employee fields, `ma_nhan_vien` login, or frontend-only service role auth.
- Before homepage, transport modules, list/detail/form/action, combobox, report, payroll, or derived-total work, read `12-owner-feedback-transport-ui.md`; stop if the code only renders generic fields, uses select for large relations, lets users type derived totals, misses history sections, or puts approval inside a form.
