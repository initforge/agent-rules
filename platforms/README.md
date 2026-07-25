# Platforms

**Vai trò:** Delta riêng từng runtime — overlay + platform adapters.  

Contracts: `platforms/platform-contracts.json`

| Platform | Overlay | Install home | Install method |
|---|---|---|---|---|
| `codex/` | `codex-overlay.md` | `~/.codex` | `02-install-runtime.ps1 -Platform codex` |
| `grok/` | `grok-overlay.md` | `~/.grok` | `02-install-runtime.ps1 -Platform grok` |
| `antigravity/` | `antigravity-overlay.md` | `~/.gemini/config` | `02-install-runtime.ps1 -Platform antigravity` |
| `cursor/` | `cursor-overlay.md` | `~/.cursor` | `02-install-runtime.ps1 -Platform cursor` |
| `opencode/` | `opencode-overlay.md` | project `.opencode/` or `~/.config/opencode/` | `platforms/opencode/scripts/install-adapter.ps1` |

Build gom bốn platform trong `01-build-runtime.ps1` (Codex, Grok, Antigravity, Cursor).  
OpenCode adapter tự cài độc lập, không qua pipeline build.

**Runtime hooks (ngoài build):** `platforms/codex/scripts/`, `platforms/antigravity/scripts/` — cài `./automation/11-install-runtime-hooks.sh`. Chi tiết hooks: **`docs/guides/04-maintenance-and-risks.md`** (không duplicate ở đây).  
**OpenCode:** không có native hooks; native claims luôn là UNVERIFIED.
