# Agent Rules repository

Canonical architecture (real tree — no `workflows/` or `shared/` top-level):

- `guides/`: docs dẫn đường cho maintainer và người mới.
- `rules/`: global context luôn nạp (lean numbering).
- `skills/`: kỹ năng lazy-load theo trigger.
- `integrations/`: integrations và policy cài sẵn.
- `projects/`: context cấp dự án và template mẫu.
- `organization/`: 5fedu org-wide conventions (never auto-load).
- `domains/`: reusable domain patterns: `ui/`, `database/`, `business/`, `security/`, `delivery/`.
- `evidence/`: archival evidence (never auto-load).
- `archive/`: historical project data (never auto-load).
- `schemas/`: context package schemas.
- `generated/`: machine-generated context (never hand-edited).
- `profiles/`: optional organization profiles (e.g., 5fedu).
- `platforms/`: delta riêng cho Codex, Grok, Antigravity, Cursor.
- `automation/`: build, cài, kiểm tra, sync guard.
- `05-generated/`: generated output, không sửa tay.
- `.agent/`: advisory trace/research/tombstones (gitignored).

**Clone → work (Linux/Windows, pwsh):**

```bash
./automation/run.sh 03-validate-context
./automation/run.sh 01-build-runtime
./automation/run.sh 02-install-runtime   # all 4 platforms; Grok inject + doctor
```

Đọc `rules/manifest.yaml` và `guides/00-system-map.md` trước khi sửa harness. Không sửa tay `05-generated/` hoặc global runtime mirrors như canonical source. Không commit, push hoặc deploy nếu chưa được yêu cầu rõ.

