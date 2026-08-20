# Bản Đồ Hệ Thống

Repo này được tổ chức để người mới nhìn cây thư mục là biết ngay vai trò của từng lớp:

- `rules/`: global context luôn nạp cho mọi task.
- `skills/`: các `SKILL.md` được nạp lười theo trigger.
- `integrations/`: tool/integration cài sẵn hoặc khuyến nghị.
- `projects/`: context dự án mẫu.
- `profiles/`: optional organization profiles.
- `platforms/`: chỉ chứa delta riêng cho từng runtime.
- `automation/`: scripts build, cài, kiểm tra, sync guard.
- `generated/`: build preview/generated mirrors, không sửa tay.
- `.agent/`: plan ledger, progress, journal, research. **Có trong git** để giữ progress qua crash/máy mới; chỉ cache tái tạo được (`source-lock-cache/`, `runs/`, `artifacts/`, `tmp/`) là gitignored. Protocol: `.agent/README.md`.

## Global đang chạy như thế nào

1. `rules/` là nguồn chuẩn của global context.
2. `skills/` là nguồn chuẩn của skills.
3. `automation/01-build-runtime.ps1` build hai lớp này sang `generated/runtime-build/`.
4. `automation/02-install-runtime.ps1` copy build output vào runtime home của Codex, Grok, Antigravity và **Cursor** (`~/.cursor`). Grok: lean rules → `~/.grok/rules` **và** inject `~/.grok/.grok/rules` (archive legacy dual-tree).
5. `integrations/` cài thêm integrations theo policy:
   - `required`: phải có và verify pass
   - `recommended`: auto-check, thiếu thì auto-install
   - `optional`: không cài mặc định

## Người mới nên đọc theo thứ tự nào

1. File này.
2. `README-vi.md`.
3. `integrations/README.md`.
4. `06-platform-capability.md` — capability matrix (explicit depth/status per platform).
5. Nếu project chủ động dùng 5fedu: chọn `--domain-pack 5fedu`, đọc `profiles/5fedu/README.md` và dùng `agent-rules reference 5fedu <path>` để đọc source reference trung tâm; không copy/cài template vào project.

## Quy tắc đồng bộ

- Mặc định chỉ có một chiều: canonical -> build -> runtime/project.
- Reverse sync chỉ được phép qua `automation/07-import-reviewed-changes.ps1` (tombstone tại `.agent/tombstones/`).
- Sau install chạy `automation/09-doctor.ps1` để kiểm tra manifest parity và integration live.

## Documentation taxonomy

| Category | Contents | Owner | Auto-generated? |
|---|---|---|---|
| Stable concepts | architecture, concepts, ADRs, runbooks, contribution/maintenance | human maintainer | No |
| Generated reference | capability matrix, install paths, command reference, skill/rule index, integration registry, profile/schema index, deprecation list | machine (`generated/references/`) | Yes — run `python automation/generate-doc-references.py` |

**Rule:** Stable docs never duplicate volatile data from generated references. If you need integration details, link to `generated/references/integration-registry.md`, not a manually-maintained table.

## Ownership and scope

### Public core vs private/optional profiles

- **Core harness** (rules, skills, integrations, platforms, automation) is public — all agents and users load it.
- **Optional profiles/domain packs** (`profiles/5fedu/`, etc.) are inactive until explicitly selected. North-Star projects bind by profile/domain-pack id; the 5fedu reference snapshot stays inside the harness and is not copied into the target project. Legacy profile installers may remain for compatibility but are not the canonical North-Star activation path.

### Evidence, archive, project context

These concepts have been relocated under `profiles/5fedu/`:
- `profiles/5fedu/projects/evidence/` — archival immutable records
- `profiles/5fedu/projects/archive/` — historical project data
- `profiles/5fedu/projects/` — active project templates and context packs

Top-level `evidence/`, `archive/`, and `projects/` directories no longer exist.

### Generated output (`generated/`)

| Folder | Editable by hand | Regeneration | Description |
|---|---|---|---|
| `generated/` | Never | `01-build-runtime.ps1` / automation scripts | Build output, runtime mirrors, reference docs, context graphs |

### Native / emulated / unverified status

See [`06-platform-capability.md`](06-platform-capability.md) for full definitions:
- **native** — host provides first-class support
- **emulated** — capability provided through scripts/workarounds
- **unsupported** — capability not available
- **unverified** — built but lacks runtime attestation

## Migration guidance

### Deprecated file paths

Full list: [generated/references/deprecation-list.md](../../generated/references/deprecation-list.md).  
Key renames relevant to maintainers:

| Old | New | Reason |
|---|---|---|
| `00-index.md` (always-on rule) | `00-bootstrap.md` | Consistent numbered naming |
| `plans/` (top-level) | `.agent/plans/` | Move out of workspace root |
| Gemini CLI (product ref) | Antigravity (runtime binary is `gemini`) | Product identity clarification |
| `codebase_memory` (alias) | `codebase-memory-mcp` | Kebab-case convention |

### Old commands

| Old command | New command | Notes |
|---|---|---|
| `pwsh build.ps1` | `python automation/generate-doc-references.py` | Doc generation migrated to Python |
| `./automation/run.sh 03-validate-context` | `pwsh automation/03-validate-context.ps1` | Direct call preferred; `run.sh` still works as wrapper |


