# Tích hợp và đồng bộ

**Vai trò:** Policy integrations + hướng sync canonical.  
**Ý đồ:** Agent biết tool bắt buộc và không merge ngược tự do.

## Integrations (`integrations/registry.json`)

| Policy | Ý nghĩa |
|---|---|
| `required` | Phải cài + verify pass |
| `recommended` | Auto-check; thiếu thì install |
| `optional` | Không cài mặc định |

Baseline: `codebase-memory-mcp` (required), `context7` (recommended), `caveman` (optional).

MCP adapter theo platform: `integrations/*/adapters/{codex.toml,grok.json,antigravity.json,cursor.json}`.

## Sync

- **Outbound:** `automation/01-build-runtime.ps1` → `02-install-runtime.ps1` (wipe target, merge MCP adapters)
- **Inbound:** chỉ `automation/07-import-reviewed-changes.ps1` + tombstone `plans/tombstones/`
- Rule: [`rules/45-sync-canonical.md`](../rules/45-sync-canonical.md)

Chi tiết runtime homes: [`01-runtime-model.md`](01-runtime-model.md).
