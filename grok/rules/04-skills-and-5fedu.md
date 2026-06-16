---
description: "Registry skills + đường dẫn 5fedu — bắt buộc đọc khi harness/skill/5fedu"
---

# 04-skills-and-5fedu

Rules (`00-03`) là hành vi. **Skills** là quy trình. **5fedu context** là nghiệp vụ dự án. Ba thứ phải cùng tồn tại — thiếu skill = rule chết.

## Skills — nạp ở đâu (Grok CLI)

| Ưu tiên | Path | Vai trò |
|---|---|---|
| 1 | `<repo>/.grok/skills/` | **Canonical Grok** — sync từ `grok/skills/` |
| 2 | `<repo>/.agents/skills/` | Compat Antigravity (Grok auto-scan) |
| 3 | `~/.grok/skills/` | Bundled user (implement, review, docx, ...) |

Verify: `grok inspect` phải liệt kê skill.

## Trigger → Skill (bắt buộc kích hoạt)

| Signal | Skill | Đọc |
|---|---|---|
| setup/scaffold/bảo trì 5fedu | `5fedu-project` | `.grok/skills/5fedu-project/SKILL.md` |
| research, docs mới, changelog | `codex-research` | `.grok/skills/codex-research/SKILL.md` |
| README, spec, badge | `docs-style` | `.grok/skills/docs-style/SKILL.md` |
| browser, playwright, UI flow | `playwright` | `.grok/skills/playwright/SKILL.md` |
| screenshot desktop | `screenshot` | `.grok/skills/screenshot/SKILL.md` |
| PDF | `pdf` | `.grok/skills/pdf/SKILL.md` |
| security review | `security-best-practices` | `.grok/skills/security-best-practices/SKILL.md` |
| threat model | `security-threat-model` | `.grok/skills/security-threat-model/SKILL.md` |
| ownership map | `security-ownership-map` | `.grok/skills/security-ownership-map/SKILL.md` |
| implement, fix, continue, làm đi, làm hết | `finish-to-completion` | `.grok/skills/finish-to-completion/SKILL.md` |
| output đầy đủ, không placeholder | `output-skill` | `.grok/skills/output-skill/SKILL.md` |

**Codex-only** (có trong `.grok/skills/` nhưng chỉ chạy đủ trên Codex CLI): `workflow-router`, `playwright-interactive`.

**UI aesthetic** (opt-in, trong `.agents/skills/` compat): `frontend-ui-quality`, `ui-mockup-generator`, `minimalist-skill`, `brutalist-skill`, `brandkit`, `stitch-skill`, `image-to-code-skill`, `ui-ux-pro-max`.

Index đầy đủ: `.grok/skills/00-index.md`.

## 5fedu — context dự án ở đâu

### Detection (repo là 5fedu khi có MỘT trong)

```text
.grok/5fedu/
.codex/5fedu/
.agents/5fedu/
.kiro/5fedu/
```

**Có skill `5fedu-project` global ≠ repo là 5fedu.**

### Cài context vào dự án mới

1. Đọc skill `5fedu-project` (bắt buộc).
2. Chạy `scripts/install-5fedu-context.ps1` (hoặc adapt thủ công).
3. Kết quả trên dự án khách:

```text
AGENTS.md
.grok/5fedu/          ← Grok CLI (mirror .codex/5fedu)
.codex/5fedu/         ← Codex CLI
.agents/5fedu/        ← Antigravity
```

### Làm việc thường ngày (không cần /5fedu)

1. `AGENTS.md` + `.grok/5fedu/00-index.md` (hoặc sibling platform folder).
2. Domain files chỉ khi dính: `02-*` DB/auth, `03-*` UI, `10-*`/`12-*` feedback.
3. UI 5fedu: `/template` trước khi sửa component.

### Repo `agent-rules` (harness)

Đây **không phải** dự án 5fedu. Chứa master harness + skill assets. Context 5fedu mẫu nằm trong:

```text
.grok/skills/5fedu-project/assets/project-context/.grok/5fedu/
```

## Cấm

- Không implement 5fedu chỉ từ rules mà không đọc skill + project context.
- Không assume schema/permission/UI — đọc context hoặc hỏi.
- Không xóa `.grok/skills/` / `5fedu-project` trong cleanup.