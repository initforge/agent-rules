# Mô hình runtime

**Vai trò:** Giải thích build → install → doctor.  
**Ý đồ:** Canonical không bao giờ là mirror trên máy user.

## Pipeline

1. `automation/01-build-runtime.ps1` — copy `rules/`, `skills/`, overlay → `05-generated/runtime-build/<platform>/` + `manifest.json`
2. `automation/02-install-runtime.ps1` — wipe target, copy build, ghi `agent-rules-manifest.json`
3. `automation/09-doctor.ps1` — parity manifest + verify integration required

Core rules và skills **phải cùng hash** giữa Codex, Grok, Antigravity, Cursor (trừ `*-overlay.md`).

## Platform homes & MCP

| Platform | Home | MCP config |
|---|---|---|
| Codex | `~/.codex` | TOML `[mcp_servers.*]` |
| Grok | `~/.grok` | JSON `mcpServers` |
| Antigravity | `~/.gemini/config` | JSON `mcp_config.json` |
| Cursor | `~/.cursor` | JSON `~/.cursor/mcp.json` |

Adapters: `integrations/required/codebase-memory-mcp/adapters/` (Codex adapter = `codex.toml`).

## Project pointers

`.agents/AGENTS.md` và `.codex/AGENTS.md` trong repo dự án chỉ trỏ `context/5fedu/` — không mirror full global context.

Token budgets: single source `rules/manifest.yaml`.
