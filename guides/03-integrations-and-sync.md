# Tích hợp và đồng bộ

**Vai trò:** Policy integrations + hướng sync canonical.  
**Ý đồ:** Agent biết tool bắt buộc và không merge ngược tự do.

## Registry (`integrations/registry.json` + `registry.yaml`)

Một canonical registry duy nhất cho mọi integration và MCP server.

| Policy | Ý nghĩa |
|---|---|
| `required` | Phải cài + verify pass |
| `recommended` | Auto-check; thiếu thì install |
| `optional` | Không cài mặc định |

**Generated full registry** (including profiles, trusts, capabilities):  
[05-generated/references/integration-registry.md](../05-generated/references/integration-registry.md)  
Canonical source: `integrations/registry.json`. Regenerate after changes:

```bash
python automation/generate-doc-references.py
```

### Registry fields

Xem schema tại `integrations/registry.yaml` (header comments liệt kê tất cả 21 fields).  
**Không duplicate danh sách field ở đây** — nguồn chuẩn là registry.yaml.

### Current integrations (5)

| ID | Policy | Kind |
|---|---|---|
| `codebase-memory-mcp` | required | mcp |
| `context7` | recommended | mcp |
| `playwright-mcp` | recommended | mcp |
| `chrome-devtools-mcp` | recommended | mcp |
| `caveman` | optional | tool |

MCP adapter theo platform: `integrations/*/adapters/{codex.toml,grok.json,antigravity.json,cursor.json}`.

MCP tool schemas tại `mcps/<id>/tools/`; generated manifest tại `05-generated/mcps/<id>/schema-manifest.json`.

## Sync

- **Outbound:** `automation/01-build-runtime.ps1` → `02-install-runtime.ps1` (wipe target, merge MCP adapters)
- **Inbound:** chỉ `automation/07-import-reviewed-changes.ps1` + tombstone `.agent/tombstones/`
- Rule: [`rules/45-sync-canonical.md`](../rules/45-sync-canonical.md)

Chi tiết runtime homes: [`01-runtime-model.md`](01-runtime-model.md).
