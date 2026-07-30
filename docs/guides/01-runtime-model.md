# Mô hình runtime

**Vai trò:** Giải thích build → install → doctor.  
**Ý đồ:** Canonical không bao giờ là mirror trên máy user.

## Pipeline

1. `automation/01-build-runtime.ps1` — copy `rules/`, `skills/`, overlay → `generated/runtime-build/<platform>/` + `manifest.json`
2. `automation/02-install-runtime.ps1` — wipe target, copy build, ghi `agent-rules-manifest.json`
3. `automation/09-doctor.ps1` — parity manifest + verify integration required

Core rules và skills **phải cùng hash** giữa Codex, Grok, Antigravity, Cursor (trừ `*-overlay.md`).

## Platform homes & MCP

| Platform | Home | Entrypoint | MCP config | Subagents | Notes |
|---|---|---|---|---|---|---|
| Codex | `~/.codex` | `AGENTS.md` | TOML `[mcp_servers.*]` | `agents/` subdirectory | native hooks, Plan Mode, MCP |
| Grok | `~/.grok` | `.grok/rules` | JSON `mcpServers` | `agents/` subdirectory | TOML personas, native hooks |
| Antigravity | `~/.gemini/config` | `GEMINI.md` | JSON `mcp_config.json` | `agents/` subdirectory | Antigravity host, PreInvocation hooks |
| Cursor | `~/.cursor` | `rules` | JSON `~/.cursor/mcp.json` | `agents/` subdirectory | IDE-native, local plugin |
| OpenCode | `~/.config/opencode/` | `AGENTS.md` | `opencode.json` (json_mcpServers) | `agents/` subdirectory | standalone adapter, no native hooks |

Adapters: `integrations/required/codebase-memory-mcp/adapters/` (Codex adapter = `codex.toml`).

## Project pointers

`.agents/AGENTS.md` và `.codex/AGENTS.md` trong repo dự án có thể trỏ `context/5fedu/` (nếu profile 5fedu được bật) — không mirror full global context.

Token budgets: single source `rules/manifest.yaml`.
