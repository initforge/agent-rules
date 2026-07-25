# Generated Context Package Schema

**Purpose:** Define the structure of machine-generated context packages.  
**Routing:** Never auto-loaded. Read by context router and generation tools.

## Manifest (required in every generated context)

```yaml
generated_at: "2026-07-25T12:00:00Z"
source_commit: "abc123def456"
source_patterns:
  - "organization/*.md"
  - "domains/**/*.md"
  - "projects/<name>/*.md"
version: "1.0"
generator: "context-generator"
```

## Package contents

| Section | Required | Source |
|---|---|---|
| `manifest.yaml` | Yes | Generation metadata |
| `architecture.md` | No | Compiled architecture summary |
| `module-map.md` | No | Compiled module/route map |
| `decisions-compiled.md` | No | Compiled decisions from all layers |
| `routing-table.md` | No | Compiled routing rules |

## Staleness rules

A generated context is STALE if:
- `source_commit` ≠ current HEAD of source files
- `generated_at` is older than the modification time of any source file
- Version has been superseded

A stale context must NOT be loaded by the router — trigger regeneration instead.
