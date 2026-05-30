---
name: 5fedu-project
description: Scaffold or maintain project-local 5fedu context for Codex work. Use when the user asks to set up a 5fedu repo, create/refresh AGENTS.md, add or update .codex/5fedu/*.md rules, update decision status/questions, or record new 5fedu conventions for future work. Do not use as a required context-loading ritual for ordinary implementation; normal work should read the repo's AGENTS.md and relevant project-local context automatically.
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
`- questions.md
```

`AGENTS.md` should be a lightweight pointer/loading policy, not an `@` include list for every file. Put detailed rules under `.codex/5fedu/`.
Treat `06-decision-status.md` as the source of truth for what is confirmed, unconfirmed, blocked, or paused.
Treat `07-working-format.md` as the source of truth for default 5fedu format/how-to when concrete app-specific values are not yet confirmed.
Treat `08-source-examples.md` as concrete examples extracted from the original prompt/images; use it to infer style, not to replace app-specific confirmation.
Use `09-coverage-audit.md` to verify whether the current context covers the original 5fedu prompt and to avoid losing requirements during future updates.

## Implementation Discipline

- Prefer adding/adapting modules from `https://github.com/tahdieuphoi-ctrl/TAH_app`; avoid deleting or broadly rewriting template code unless approved.
- Keep Vietnamese names for submenu/module folders and labels where the source app convention uses Vietnamese.
- Keep route/view keys predictable, usually lowercase kebab Vietnamese without accents for route/module keys.
- Use real Supabase/frontend integration once credentials are provided; avoid dead buttons, placeholder-only flows, or missing handlers.
- Search must cover direct table fields and linked display fields.
- On mobile use card view; on desktop use list view unless the project spec says otherwise.
- End delivery with verification evidence and a Supabase Egress + Vercel Edge Function optimization reminder/plan when the app is near completion.
- Before implementation, read `06-decision-status.md`; do not implement any area marked `CHUA_CHOT` or `CAN_HOI_THEM` until the user confirms it.
- If a concrete value is unconfirmed, still follow the format/how-to in `07-working-format.md`; ask only for the missing value.
