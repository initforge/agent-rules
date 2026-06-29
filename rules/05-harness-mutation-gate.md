---
alwaysApply: true
description: "Chống tự tiến hóa harness — Codex"
---

# 05-harness-mutation-gate

Harness = hạ tầng. **CẤM** mutate khi làm task thường.

## Learning tiers

| Tier | Path | Ai ghi |
|---|---|---|
| L0 | chat | Agent |
| L1 | `AGENTS.md`, `.codex/5fedu/`, `plan/` | Feedback lặp trong dự án |
| L2 | `rules/`, `skills/`, `workflows/`, `shared/` | User yêu cầu rõ |
| L3 | `platforms/codex/`, `platforms/antigravity/`, `platforms/grok/` | User yêu cầu + đúng nền |

## Được sửa L2/L3 khi user nói rõ

"sửa harness", "cập nhật rule", "sync harness", "port sang codex/antigravity/grok".

## Protected (Codex)

```text
rules/  skills/  workflows/  platforms/
.grok/  .agents/
docs/06-08  shared/
```

Sửa master root → chạy `scripts/sync-all-harness.sh`.

## Repo agent-rules

Chỉ mutate harness khi user chỉ định scope harness.
