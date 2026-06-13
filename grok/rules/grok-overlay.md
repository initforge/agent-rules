---
description: "Overlay Grok CLI + Composer 2.5 — runtime thật user đang dùng"
---

# Grok CLI / Composer Overlay

Áp khi chạy **Grok CLI** (`grok` command, model Composer 2.5).

## Runtime locality (Grok CLI)

```text
<repo>/.grok/rules/          ← PRIMARY live (Grok luôn scan)
~/.grok/                     ← global rules, skills, config
agent-rules/grok/rules/      ← master (sửa ở đây)
```

Codex/Antigravity: cùng master, sync qua `sync-all-harness.sh`. Tham chiếu: `~/.codex`, `agent-rules/codex`.

## Kiểm tra harness đã nạp

```bash
grok inspect
```

Phải thấy các file trong `.grok/rules/`. Nếu không → chạy `cursor/scripts/sync-harness.sh`.

## Grok CLI behavior

- **Explore có budget:** Câu hỏi chiến lược → trả lời trước, không đọc 15+ file. Implementation → index + file liên quan (~8 file max trước hành động).
- **Tool-first:** Có shell/grep/read → tự chạy, không bắt user gõ lệnh.
- **Parallel:** File độc lập → đọc song song.
- **Subagent:** Task lớn → `explore`, `review`, `implement` skill thay vì đọc hết repo.
- Không revert user. Không auto-commit/push.

## Model modes

- **Fast** (`composer-2.5-fast`): task nhỏ; bỏ deep-reasoning ceremony; verify tối thiểu.
- **Full** (`composer-2.5`): MEDIUM/HIGH risk; planning slice, regression, verify sâu.

## Skills (Grok CLI)

Thứ tự ưu tiên:

1. `~/.grok/skills/` (bundled + user)
2. `<repo>/.grok/skills/` (nếu có)
3. `~/.codex/skills/` / repo skills (fallback)

Không nhồi workflow dài vào rule nếu đã có skill (`/implement`, `/review`, `codex-research`, ...).

## MCP

Project: `<repo>/.grok/config.toml`. Global: `~/.grok/config.toml`.

## Project AGENTS.md

Root `AGENTS.md` chỉ fact dự án (build, test, stack). Harness nằm trong `.grok/rules/`.