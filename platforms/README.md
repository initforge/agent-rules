# Platforms

**Vai trò:** Delta riêng từng runtime — overlay + `runtime.yaml`.  
**Ý đồ:** Core giống nhau; chỉ khác cách cài MCP và home path.

| Platform | Overlay | Install home |
|---|---|---|
| `codex/` | `codex-overlay.md` | `~/.codex` |
| `grok/` | `grok-overlay.md` | `~/.grok` |
| `antigravity/` | `antigravity-overlay.md` | `~/.gemini/config` |
| `cursor/` | `cursor-overlay.md` | `~/.cursor` |

Build gom tất cả bốn platform trong `01-build-runtime.ps1`.

**Runtime hooks (ngoài build):** `platforms/codex/scripts/`, `platforms/antigravity/scripts/` — cài `./automation/11-install-runtime-hooks.sh`. Chi tiết hooks: **`guides/04-maintenance-and-risks.md`** (không duplicate ở đây).
