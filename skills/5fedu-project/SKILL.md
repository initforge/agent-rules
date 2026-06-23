---
name: 5fedu-project
description: Scaffold or maintain project-local 5fedu context for Codex/Antigravity work. Use when the user asks to set up a 5fedu repo, create/refresh AGENTS.md, add or update .agents/5fedu/*.md and .codex/5fedu/*.md rules, update decision status/questions, record new 5fedu conventions, or preserve owner feedback gates for Supabase/auth/database/UI/transport modules.
---

# 5fedu Project Skill

## Skill activation (Turn-0)

ULTRA-SENSITIVE Turn-0:

```text
Skill scan: 5fedu-project
Skill activated: 5fedu-project
```

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
2. If the user wants setup, display a blank survey form requesting:
   - Link Google Sheets spec
   - Repository URL
   - Live/Deploy URL
   - Database/Supabase credentials
   Do not guess, mock, or reuse old project credentials. Fill in these slots based strictly on the user's input before running or adapting `scripts/install-5fedu-context.ps1`.
3. If the user wants to migrate/scaffold, automatically delete any legacy model-specific specs (like legacy files 11, 12, 13, 14 or any old transport-related files) to avoid context pollution.
4. Load `references/5fedu-context-map.md` when writing or updating project rules.
5. Ask for missing spec, credentials (including Supabase password if available), database rules, or module mapping before implementation. Never invent table names, fields, permissions, or screen mappings.
6. Google Sheets Access: Must use the `/browser` slash command/subagent to access Google Sheets, as they are often shared privately and require the user's active authentication. If the AI cannot view or access the sheet, IMMEDIATELY notify and remind the user to log in/authorize so the AI can read the sheet and completely capture the data model/specs before scaffolding.
7. For real implementation work, map every requested feature from spec -> domain -> module -> view/tab -> source path -> database table -> handler/service. Record uncertain mappings before coding.
8. Treat Supabase/auth/permission/database work as HIGH risk: create a locked plan, require credentials or mocks explicitly, verify behavior, and do not store secret values in docs.
9. Treat owner feedback about UI/business flows as reusable gates, not one-off fixes. For transport apps, record list/detail/form/action/totals/combobox/print/approve requirements in project context before coding.
10. When a template commit is provided, clone or update it under `.agents/template-source/` and record the exact commit in project context. Use it as the UI reference for list, detail, form, dashboard, toolbar, combobox, drawer, table, and mobile card patterns.
11. Before reporting done, check whether new feedback or a repeated mistake requires context updates. If yes, update local context first, then sync mirrors.

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
### E. Quy tắc thiết kế biểu mẫu nghiệp vụ có duyệt (Approval Workflows)
- **Tách biệt hai trục trạng thái**: Phân tách rõ ràng giữa Trạng thái thực hiện (ở mức phiếu chi tiết dòng con) và Trạng thái duyệt (ở mức phiếu cha). Không gộp chung hoặc lẫn lộn hai khái niệm này trên giao diện.
- **Cascade Duyệt**: Cấp trên duyệt phiếu cha thì trạng thái duyệt phải tự động cascade (đổ xuống) và khóa toàn bộ dữ liệu dòng con.
- **Khóa phê duyệt (Approval Lock)**: Cấm cho phép người dùng sửa đổi bất kỳ thông tin nào khi dữ liệu đã được duyệt (`Đã duyệt` hoặc `Không duyệt`).
- **Large Relation Dataset Selection**: Không sử dụng thẻ `<select>` mặc định của HTML cho các trường có danh sách dữ liệu liên kết lớn (nhân viên, địa điểm, hàng hóa). Bắt buộc sử dụng `Combobox` hoặc `AsyncCombobox` có hỗ trợ tìm kiếm.
- **Derived Fields Constraint**: Các trường tính toán hoặc trường dẫn xuất (tổng tiền, tổng số lượng, tổng công) phải là read-only, cấm cho phép nhập trực tiếp trên giao diện.
- **Clean Action Segregation**: Tách biệt rõ ràng các nút hành động (như Duyệt, In) ra ngoài form chính.

### F. Quy tắc kiểm thử E2E Production an toàn (Safety Gates)
- **Default Verify**: Thực hiện kiểm thử trên môi trường live/production sau khi code đã được deploy tự động thông qua CI/CD, không deploy thủ công.
- **Mutating Test Safety**: Mọi trường hợp test có thay đổi dữ liệu (mutating tests) bắt buộc phải chụp snapshot dữ liệu trước khi test và khôi phục (restore) nguyên trạng dữ liệu ngay khi test kết thúc (`afterAll` hoặc `afterEach`).
- **Anti-Fake PASS**: Log ra ma trận độ bao phủ kiểm thử thực tế để tránh báo cáo kết quả giả (No Fake PASS).
- **Database Safety Guard**: Kiểm tra biến môi trường DB credentials trước khi chạy các lệnh assert trực tiếp trên database để tránh crash bộ test.

### G. Context evolution (anti raw-dump)
- **Promote rule first** vào `02`/`03`/`00` — viết dưới dạng các gạch đầu dòng quy tắc bắt buộc, không đưa các đoạn trích dẫn chat thô của khách hàng vào tệp quy tắc.
- **`10` = archive index only** (≤1 line per topic). Không đồng bộ chúng về master source.
- **Master sync allowlist**: `00`, `02`, `03` + `SKILL.md` (Tuyệt đối không tự ý sync các tệp nghiệp vụ đặc thù 11, 12, 13, 14 cũ của dự án TAH sang các dự án mới).
- Run `scripts/sync-all-harness.sh` để đồng bộ các thay đổi quy tắc từ Master sang các thư mục mirror tương ứng.


### H. Google Sheets & Infrastructure Credentials Provisioning
- **Supabase Password**: Request the Supabase database password if available to allow direct database verification and schema inspection.
- **Google Sheets Authentication**: Always use the `/browser` subagent to view Google Sheets. If the URL is not accessible due to missing authorization, IMMEDIATELY alert the user to authorize or share the sheet. Do NOT proceed with code generation or structure guessing without successfully viewing the Google Sheets configuration first.

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
