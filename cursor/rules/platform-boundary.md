---
description: "Ranh giới 4 nền — Composer không sửa chéo"
---

# Platform Boundary — Composer POV

Repo `agent-rules` phục vụ **4 platform agent**. File này giúp Composer không phá kiến trúc nền khác.

## Bốn nền

| Nền | Cơ chế nạp | Triết lý | Live runtime |
|---|---|---|---|
| **Codex** | `@import` trong `AGENTS.md` | nặng vừa | `~/.codex` |
| **Antigravity** | `alwaysApply` `.agents/rules/` | nặng nhất | `.agents/` + `~/.gemini/GEMINI.md` |
| **Kiro** | `inclusion` `.kiro/steering/` | mỏng (Opus) | `.kiro/` + `~/.kiro/steering/` |
| **Grok/Composer** (bạn) | scan `.grok/rules/*.md` (primary) | **Codex-light** | `.grok/` + `~/.grok/` |

## Cấu trúc sở hữu

```text
agent-rules/
├── codex/           ← CHỈ CODEX
├── antigravity/     ← CHỈ ANTIGRAVITY
├── .agents/         ← Antigravity live
├── kiro/            ← Kiro master
├── .kiro/           ← Kiro live
├── cursor/          ← CHỈ GROK/COMPOSER (master). Bạn sửa ở đây.
├── .grok/           ← Grok CLI live (primary)
├── .cursor/         ← Cursor compat live (optional)
└── docs/
```

## Composer KHÔNG được

1. Xóa/sửa cleanup `codex/`, `antigravity/`, `.agents/`, `kiro/`, `.kiro/` (trừ sync có chủ đích).
2. Bỏ `alwaysApply` Antigravity hoặc `inclusion` Kiro.
3. Sync copy-paste rule chéo — phải adapt theo triết lý từng nền.

## Composer ĐƯỢC

1. Sửa `cursor/rules/*.md`, chạy `cursor/scripts/sync-live.sh`.
2. Đề xuất sync nội dung cốt lõi sang nền khác — user quyết định khi nào.

## Khi core safety đổi

| Nền | Cập nhật | Lưu ý |
|---|---|---|
| Codex | `codex/rules/` | nặng vừa |
| Antigravity | `antigravity/.agents/rules/` + `.agents/` | giữ alwaysApply |
| Kiro | `kiro/steering/` + `.kiro/` | giữ mỏng |
| Grok/Composer | `cursor/rules/` + `.grok/rules/` | Codex-light, gate có điều kiện |