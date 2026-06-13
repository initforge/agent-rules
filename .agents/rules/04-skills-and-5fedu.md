---
description: "Registry skills + đường dẫn 5fedu — Antigravity"
alwaysApply: true
---

# 04-skills-and-5fedu

Rules (`00-03`) là hành vi. **Skills** là quy trình. **5fedu context** là nghiệp vụ dự án. Thiếu skill = rule chết.

## Skills — nạp ở đâu (Antigravity)

| Ưu tiên | Path | Vai trò |
|---|---|---|
| 1 | `<repo>/.agents/skills/` | **Live Antigravity** |
| 2 | `antigravity/.agents/skills/` | Master adapter |
| 3 | `<repo>/.grok/skills/` | Grok mirror (compat scan) |

## Trigger → Skill (bắt buộc kích hoạt)

| Signal | Skill | Đọc |
|---|---|---|
| setup/scaffold 5fedu | `5fedu-project` | `.agents/skills/5fedu-project/SKILL.md` |
| research | `codex-research` | `.agents/skills/codex-research/SKILL.md` |
| UI quality | `frontend-ui-quality` | `.agents/skills/frontend-ui-quality/SKILL.md` |
| mockup | `ui-mockup-generator` | `.agents/skills/ui-mockup-generator/SKILL.md` |
| playwright | `playwright` | `.agents/skills/playwright/SKILL.md` |
| PDF | `pdf` | `.agents/skills/pdf/SKILL.md` |
| security | `security-*` | `.agents/skills/security-*/SKILL.md` |
| output đầy đủ | `output-skill` | `.agents/skills/output-skill/SKILL.md` |

UI aesthetic opt-in: `brandkit`, `stitch-skill`, `minimalist-skill`, `brutalist-skill`, `ui-ux-pro-max`, `image-to-code-skill`.

## 5fedu detection

```text
.agents/5fedu/  .grok/5fedu/  .codex/5fedu/  .kiro/5fedu/
```

Luôn đọc `AGENTS.md` + `.agents/5fedu/00-index.md` trước code. UI: `/template` trước component.

## Cấm

- Không implement 5fedu không đọc skill + project context.
- Không xóa `.agents/skills/5fedu-project` trong cleanup.