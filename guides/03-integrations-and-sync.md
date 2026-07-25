# Tích hợp và đồng bộ

**Vai trờ:** Policy integrations + hướng sync canonical.  
**Ý đồ:** Agent biết tool bắt buộc và không merge ngược tự do.

## Registry (`integrations/registry.json` + `registry.yaml`)

Một canonical registry duy nhất cho mọi integration và MCP server.

| Policy | Ý nghĩa |
|---|---|
| `required` | Phải cài + verify pass |
| `recommended` | Auto-check; thiếu thì install |
| `optional` | Không cài mặc định |

### Registry fields

- `id` — canonical identifier (kebab-case)
- `displayName` — human-readable name
- `kind` — mcp / tool / adapter / native
- `policy` — required / recommended / optional
- `profiles` — profile group membership
- `source` — upstream origin + version + package info
- `integrity` — pin status + platform SHA-256 hashes
- `trust` — advisory-only / declared / adapter-verified / native-live
- `capabilities` — functional capability classes
- `triggers` — phrase triggers for skill routing
- `sideEffects` — side-effect classification
- `tokenClass` — low / medium / high
- `permissions` — access level
- `environment` — required env vars
- `install` — install/verify/uninstall scripts + type
- `health` — probe command + expected exit codes
- `schema` — tool schema source path + generated output
- `platform` — OS-specific install paths
- `nativeHosts` — platforms with native support
- `fallback` — documented fallback when absent
- `deprecatedAliases` — historical aliases this ID replaces

Baseline: `codebase-memory-mcp` (required), `context7` (recommended), `caveman` (optional).

MCP adapter theo platform: `integrations/*/adapters/{codex.toml,grok.json,antigravity.json,cursor.json}`.

MCP tool schemas tại `mcps/<id>/tools/`; generated manifest tại `05-generated/mcps/<id>/schema-manifest.json`.

## Sync

- **Outbound:** `automation/01-build-runtime.ps1` → `02-install-runtime.ps1` (wipe target, merge MCP adapters)
- **Inbound:** chỉ `automation/07-import-reviewed-changes.ps1` + tombstone `.agent/tombstones/`
- Rule: [`rules/45-sync-canonical.md`](../rules/45-sync-canonical.md)

Chi tiết runtime homes: [`01-runtime-model.md`](01-runtime-model.md).
