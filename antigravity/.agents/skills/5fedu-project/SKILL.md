---
name: 5fedu-project
description: Scaffold or maintain project-local 5fedu context for Codex/Antigravity work. Use when the user asks to set up a 5fedu repo, create/refresh AGENTS.md, add or update .agents/5fedu/*.md and .codex/5fedu/*.md rules, update decision status/questions, record new 5fedu conventions, or preserve owner feedback gates for Supabase/auth/database/UI/transport modules.
---

# 5fedu Project Skill

## 1. Core Rule

Keep 5fedu rules project-local by default. Do not expand the global `AGENTS.md` with long customer-specific rules. Use this skill as the reusable setup entry and write concise project context into the target repo.

`/5fedu` is for setup and context maintenance only. Once a repo has `AGENTS.md`, `.agents/5fedu/`, and `.codex/5fedu/`, ordinary coding work should rely on those project-local files without the user needing to call `/5fedu` again.

Default loading policy:
- Always read only the project entry/index first: `AGENTS.md`, `00-index.md`, decision/status file, `questions.md`, and source/spec map when available.
- Read detailed context only when the task touches that domain.
- Treat `10-owner-feedback-lessons.md` and `12-owner-feedback-transport-ui.md` as raw or semi-raw logs. Do not rely on them as the final rule layer if the lesson can be promoted.
- When feedback creates a reusable rule, immediately promote it into the correct living rule file and sync both `.agents/5fedu` and `.codex/5fedu`.
- Push is not automatic. For 5fedu, production verification normally requires code to be pushed and deployed, but push still requires a clear user request in the current session.

## 2. Workflow

1. Inspect the target repo first. If `AGENTS.md`, `.agents/5fedu/`, or `.codex/5fedu/` already exists, read it before changing anything.
2. If the user wants setup, run or adapt `scripts/install-5fedu-context.ps1` to scaffold the project-local context files.
3. Load `references/5fedu-context-map.md` when writing or updating project rules.
4. Ask for missing spec, credentials, database rules, or module mapping before implementation. Never invent table names, fields, permissions, or screen mappings.
5. For real implementation work, map every requested feature from spec -> domain -> module -> view/tab -> source path -> database table -> handler/service. Record uncertain mappings before coding.
6. Treat Supabase/auth/permission/database work as HIGH risk: create a locked plan, require credentials or mocks explicitly, verify behavior, and do not store secret values in docs.
7. Treat owner feedback about UI/business flows as reusable gates, not one-off fixes. For transport apps, record list/detail/form/action/totals/combobox/print/approve requirements in project context before coding.
8. When a template commit is provided, clone or update it under `.agents/template-source/` and record the exact commit in project context. Use it as the UI reference for list, detail, form, dashboard, toolbar, combobox, drawer, table, and mobile card patterns.
9. Before reporting done, check whether new feedback or a repeated mistake requires context updates. If yes, update local context first, then sync mirrors.

## 3. Project Files Layout

### Platform Target Paths (Do Not Confuse)
A repository can contain both configuration folders, but they belong to independent platforms and must be treated as completely separate:
* **Codex Platform (CLI runtime)**: Target path is `.codex/5fedu/`.
* **Antigravity Platform (Agent runtime)**: Target path is `.agents/5fedu/`.

Recommended target layout:

```text
AGENTS.md
.agents/5fedu/ and .codex/5fedu/
|- 00-index.md
|- 01-architecture-and-specs.md
|- 02-database-and-auth-rules.md
|- 03-ui-ux-and-delivery-standards.md
|- 04-decision-status-and-backlog.md
`- 05-source-specs-and-coverage.md
```

Legacy expanded context files may also exist and should be preserved when present:

```text
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

- `AGENTS.md` should be a lightweight pointer/loading policy, not an `@` include list for every file. Put detailed rules under the respective platform folder.
- Treat `00-index.md` as the entry point and the source of truth for the **Strict Execution Contract** (Compile Check, Browser Click-through check, Anti-Lỏ code policies).
- Treat `04-decision-status-and-backlog.md` or legacy `06-decision-status.md` as the source of truth for what is confirmed, unconfirmed, blocked, or paused, open questions, and the temporary raw owner feedback logs.
- Treat `02-database-and-auth-rules.md` and `03-ui-ux-and-delivery-standards.md` as the active system rules.
  * **CRITICAL RULES EVOLUTION**: All resolved bugs or universal architectural lessons (e.g., `id int8` primary keys, `ten_dang_nhap` logins, pagination footer, Excel cell type `'n'`, PDF Unicode base64 fonts, TDZ hoisting prevention) MUST be promoted/moved to the respective Pillar 2 or Pillar 3 rule files. Do not keep them raw in the feedback backlog file to prevent context confusion.
- Use `05-source-specs-and-coverage.md` to map Google Sheets columns and verify whether the current context covers the original 5fedu prompt/images.

Living rule files:
- `00-index.md`: execution contract, loading policy, production/local test policy.
- `02-database-and-auth-rules.md`: database, schema, auth, permission, RLS, triggers, rollups.
- `03-ui-ux-and-delivery-standards.md`: UI, UX, list/detail/form, toolbar, filter, export, responsive behavior.
- `04-decision-status-and-backlog.md` and legacy `06-decision-status.md`: confirmed/unconfirmed/blockers.
- `05-source-specs-and-coverage.md`: spec/source coverage.
- `10` and `12`: logs only unless a project intentionally keeps archived evidence there.

## 4. Developer Lessons Learned (Anti-Patterns & Hard Gates)

Before writing database, auth, staff tables, migration, or UI components, the AI MUST strictly apply these parsed owner feedback lessons:

### A. Database & Schema Design
- **Primary Key Constraint**: Every table's primary key `id` MUST be `int8` (bigint) auto-incrementing (`id int8 generated by default as identity primary key`). Using `uuid` or `text` is strictly BANNED unless explicitly required by sheets/spec.
- **Foreign Key Constraint**: Any foreign key column linking to an `id int8` table must also be typed `int8` (e.g., `id_tai_xe int8`, `id_chuc_vu int8`).
- **Lean Staff Bounded Context**: The staff table `var_nhan_vien` must remain strictly lean. Banned HR fields include: `ngay_sinh`, `ngay_vao_lam`, `gioi_tinh`, `dia_chi`, `cccd`, `ngan_hang`, `so_tai_khoan`, `muc_luong`, `loai_hop_dong` etc., unless explicitly written in the latest sheet/spec.

### B. Login, Authentication & Supabase Sync
- **Credentials Stack**: Default credentials are `admin` / `5fedu.com` using the username login `ten_dang_nhap` = `admin` (mapping internally to a fake email `admin@gmail.com`).
- **Sync Username to Supabase Auth**: When creating/updating/deleting a staff account with a `ten_dang_nhap`, the corresponding fake email `<ten_dang_nhap>@gmail.com` must be synchronized in Supabase Auth.
- **Service Role Restriction**: The Supabase service role key must NEVER be exposed to the client. Auth admin actions must exclusively run on server/admin paths (e.g. Edge Functions, API).

### C. CI/CD Auto-Deployment & Live Dashboards
- **Vercel Auto-Deployment**: AI must understand that pushing to GitHub automatically triggers a Vercel build and deploy. Never attempt manual/terminal deployment unless requested.
- **Remote Status Auditing**: Proactively use `browser_subagent` to check the GitHub Commits status or Vercel dashboard to verify build outcomes.
- **Database Verification**: Proactively view Supabase Dashboard or logs to inspect the real production database schema, RLS policies, and queries rather than guessing.

### D. Regression Prevention & Query Protection
- **Dependency Checking**: Before modifying any database column, API endpoint, or TypeScript type, the AI MUST run `rg`, GitNexus, or the available code-search tool across the codebase to identify and update all files referencing them. Do not depend on a specific search tool name if that tool is not available in the current session.
- **Query Cache Invalidation**: When modifying data, always invalidate the relevant React Query / SWR cache keys (e.g., calling `queryClient.invalidateQueries(['transport'])`) to prevent UI/query synchronization failures.
- **Local E2E Verification**: Run a quick local build (`npm run build`) or visual E2E check after modifications to guarantee no query regression.

### E. Transport UI & Derived Fields
- **Derived Fields Constraint**: Fields like `so_chuyen`, `tong_tien_luong`, `tong_phi`, `tong_luong_chuyen` must NEVER be editable by users on the UI. They must be read-only and automatically calculated from child rows or database syncs.
- **Large Dataset Selection**: Do NOT use native `<select>` dropdowns for fields with large relation lists (like driver, vehicle, location, trip). Use `Combobox` or `AsyncCombobox` searchable pickers.
- **Clean Action Segregation**: Banned placing "Duyệt" (Approval) or "In" (Print) buttons inside the main form. Approval and Print actions must be separate buttons outside the form context.
- **Detail Sections History**: Detail pages for entities like vehicle, location, or driver should include dynamic sections displaying their related historical logs (e.g., historical trips).
- **Trip execution vs approval (R1–R7)**: Two independent axes on CT — `trang_thai` (execution) and `phe_duyet` (approval). Driver reports per CT; parent approval cascades; payroll requires both approved and executed. Living rules: `13-trip-execution-vs-approval-spec.md`, `02-database-and-auth-rules.md`, `03-ui-ux-and-delivery-standards.md`.

### F. Production E2E Harness (TAH)
- **Canonical doc**: `14-production-e2e-harness.md` in `.agents/5fedu/` and `.codex/5fedu/`.
- **Default verify**: production after push + CI deploy; no manual `vercel --prod`.
- **Playwright**: `output/playwright/helpers/production-e2e.ts`, project `production-e2e`; trip regression `production-trip-execution.spec.ts`.
- **Mutating tests**: `snapshotPendingDriverTrip` / `restorePendingDriverTrip` (trip `52`).
- **R4 UI**: `expectTripParentApprovalDialog` only — no per-CT approval UI.
- **R6 payroll fixture**: `payrollEligibleCtCount` / `countApprovedPayrollTrips` (both axes).
- **DB assert**: `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL`; else `PARTIAL`.

### G. Context evolution (anti raw-dump)
- **Promote rule first** into `02`/`03`/`00`/`14` — imperative bullets, no owner quotes in logs.
- **`10`/`12` = archive index only** (≤1 line per topic). Never sync them to master.
- **Master sync allowlist**: `00`, `02`, `03`, `13`, `14` + `SKILL.md` §4/§6/§F. Not `06`, `questions`, `10`, `12`.
- Run `scripts/sync-5fedu-rules-to-master.sh` after promoting rules.

## 5. Implementation Discipline

- Prefer adding/adapting modules from `P:\agent-rules\antigravity\.agents\template-source/` (or similar templates); avoid deleting or broadly rewriting template code unless approved.
- Keep Vietnamese names for submenu/module folders and labels where the source app convention uses Vietnamese.
- Keep route/view keys predictable, usually lowercase kebab Vietnamese without accents for route/module keys.
- Use real Supabase/frontend integration once credentials are provided; avoid dead buttons, placeholder-only flows, or missing handlers.
- Search must cover direct table fields and linked display fields.
- On mobile use card view; on desktop use list view unless the project spec says otherwise.
- Before implementation, read `04-decision-status-and-backlog.md` and legacy `06-decision-status.md` when present; do not implement any area marked `CHUA_CHOT` or `CAN_HOI_THEM` until the user confirms it.
- If a concrete value is unconfirmed, still follow the format/how-to in `07-working-format.md`; ask only for the missing value.

## 6. Feedback Evolution & Learning Loop Workflow

Whenever the user provides correction, design guidance, or owner feedback during active workspace sessions:

### A. Local Learning (Workspace — promote first)
1. Write imperative rule into living file (`02`/`03`/`00`/`13`/`14`).
2. Update `06-decision-status.md` only for `DA_CHOT` / `CAN_HOI_THEM` — not essay.
3. Optional: one index line in `10` or `12` — **never** paste raw chat paragraphs.
4. Mirror `.agents/5fedu` ↔ `.codex/5fedu`. Conflict → stop, report.

### B. Global Learning (Master `agent-rules` / `~/.grok/skills/5fedu-project`)
- Sync **only** allowlist in `14` §11: `00`, `02`, `03`, `13`, `14` + this `SKILL.md` (§4/§6/§F).
- **Never** sync `10`, `12`, `06`, `questions` to master.
- Update `SKILL.md` §4 when rule applies to all 5fedu repos.
- Run `scripts/sync-5fedu-rules-to-master.sh` from the project repo.
- Do not commit/push master unless user requests.

### C. Universal Learning

If feedback applies across tech stacks, promote it to the Codex global runtime rules under `P:\agent-rules\codex\rules\`, not into 5fedu-only files. Examples:
- verification depth;
- permission E2E discipline;
- cleanup/gitignore policy;
- root-cause evidence rules;
- no secret values in docs.

Keep 5fedu-only conventions in 5fedu context, such as admin password, Supabase fake-email login mapping, table naming conventions, TAH template parity, production-first verification, and transport module behavior.
