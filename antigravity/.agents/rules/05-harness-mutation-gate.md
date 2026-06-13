---
description: "Chống tự tiến hóa harness — Antigravity"
alwaysApply: true
---

# 05-harness-mutation-gate

Harness = hạ tầng. **CẤM** agent tự thêm/sửa rules/skills khi làm task thường.

## Learning tiers

| Tier | Path | Ai ghi |
|---|---|---|
| L0 | chat | Agent |
| L1 | `AGENTS.md`, `.agents/5fedu/`, `plan/` | Feedback lặp |
| L2 | `grok/rules/`, `grok/skills/` | User yêu cầu rõ |
| L3 | `antigravity/`, `codex/` | User + đúng nền |

## CẤM mặc định

- User phàn nàn → sửa **code**, không thêm rule.
- Cleanup → không đụng `.agents/rules/`, protected skills.

## Protected

```text
.agents/AGENTS.md  .agents/INTENT.md  .agents/rules/
.antigravity/.agents/  grok/  .grok/
docs/06-08  shared/
```

Master: `grok/` → `sync-all-harness.sh` → `.agents/rules/`.