# Platforms

Platform-specific behavior lives in overlays. The canonical behavior contract is
[`platform-contracts.json`](platform-contracts.json).

Artifact hashes and build output do not prove behavioral parity. Every platform
needs current live evidence for activation, context delivery, orchestration,
role permissions, model/effort, and MCP integration. Missing evidence on one
host makes overall parity `PARTIAL` or `BLOCKED`.

| Platform | Overlay | Rendered build contract |
|---|---|---|
| `codex/` | `codex-overlay.md` | `runtime-contract.json` |
| `grok/` | `grok-overlay.md` | `runtime-contract.json` |
| `antigravity/` | `antigravity-overlay.md` | `runtime-contract.json` |
| `cursor/` | `cursor-overlay.md` | `runtime-contract.json` |

`01-build-runtime.ps1` validates the canonical contract and renders one
`runtime-contract.json` for each platform build.

Runtime hooks remain outside the build in `platforms/*/scripts/`; install them
through `automation/11-install-runtime-hooks.sh`.
