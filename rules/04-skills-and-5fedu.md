---
description: "Registry skills + đường dẫn 5fedu — Codex CLI"
---

# 04-skills-and-5fedu

Rules (`00-03`) là hành vi. **Skills** là quy trình. **5fedu context** là nghiệp vụ dự án.

## Skills — nạp ở đâu (Codex CLI)

| Ưu tiên | Path | Vai trò |
|---|---|---|
| 1 | `~/.codex/skills/` | Runtime user |
| 2 | `<repo>/codex/skills/` hoặc `<repo>/.codex/skills/` | Project/bootstrap |
| 3 | `<repo>/.grok/skills/` | Mirror Grok (nếu có) |

## Trigger → Skill (bắt buộc)

| Signal | Skill | Đọc |
|---|---|---|
| setup/scaffold 5fedu | `5fedu-project` | `codex/skills/5fedu-project/SKILL.md` |
| research, docs mới | `codex-research` | `codex/skills/codex-research/SKILL.md` |
| README, spec | `docs-style` | `codex/skills/docs-style/SKILL.md` |
| browser, UI flow | `playwright`, `playwright-interactive` | `codex/skills/playwright*/SKILL.md` |
| PDF | `pdf` | `codex/skills/pdf/SKILL.md` |
| security | `security-*` | `codex/skills/security-*/SKILL.md` |
| output đầy đủ | `output-skill` | `codex/skills/output-skill/SKILL.md` |
| phase routing | `workflow-router` | `codex/skills/workflow-router/SKILL.md` |

Index: `codex/skills/README.md` hoặc inventory trong `codex/docs/`.

## 5fedu detection

```text
.codex/5fedu/  .grok/5fedu/  .agents/5fedu/  .kiro/5fedu/
```

Cài context: skill `5fedu-project` → `scripts/install-5fedu-context.ps1` → `.codex/5fedu/` (+ mirrors).

## Cấm

- Không implement 5fedu chỉ từ rules — đọc skill + `.codex/5fedu/00-index.md`.
- Không assume schema/permission/UI.
- **Cấm tự ý áp dụng hoặc đồng bộ các tệp nghiệp vụ mẫu cũ** (như các tệp `11-*`, `12-*`, `13-*`, `14-*` đặc thù của dự án TAH) sang các dự án mới khác. Bắt buộc phải xóa bỏ các file nghiệp vụ cũ này khỏi context.
- **Bắt buộc khảo sát điền vào chỗ trống**: Ngay khi kích hoạt skill `5fedu-project` trên một dự án mới, Agent bắt buộc phải hiển thị ngay một form khảo sát trống yêu cầu người dùng cung cấp link Google Sheet spec, Repo URL, Live URL và credentials thực tế của dự án mới. Tuyệt đối không được đoán bừa hoặc tự ý mock thông tin.