---
description: "Codex CLI overlay — runtime locality và behavior"
---

# Codex Overlay

Áp **chỉ trong Codex CLI**.

## Runtime

```text
~/.codex/                    ← daily runtime
agent-rules/codex/           ← backup/bootstrap
```

Không phụ thuộc backup path khi runtime local đủ file.

## Behavior

- Search trước khi đọc tràn.
- Patch deterministic; không revert user; không auto-commit/push.
- Review: `path:line`; plan: `path:symbol`.

## Config

`~/.codex/config.toml` · `<repo>/.codex/config.toml` (trusted projects)

## Subagents

TOML trong `~/.codex/agents/` — gọi explicit (planner, implementer, reviewer, explorer).

## Skills

`~/.codex/skills/` · `codex/skills/` — workflow dài → skill, không nhồi `AGENTS.md`.

## MCP

`~/.codex/config.toml` hoặc `codex mcp` — ghi registry `codex/docs/`.

## Project AGENTS.md

Chỉ fact dự án (build, test, stack). Global rules ở `codex/rules/`.