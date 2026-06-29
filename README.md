# Agent Rules — canonical multi-platform context

One readable source builds the same compact core and capability catalog for Codex, Grok, and Antigravity. Platform folders contain only their delta; project folders contain only project context pointers.

## Subsystems

| Subsystem | Ownership |
|---|---|
| `knowledge/core` | Always-loaded platform-neutral contract |
| `knowledge/capabilities` | Triggered procedures grouped by domain |
| `knowledge/project-context` | Canonical schema and project templates |
| `integrations` | Pinned external tools such as Codebase Memory MCP and Caveman |
| `platforms` | Named platform overlays and runtime deltas |
| `automation` | Runtime build, install and parity validation |

## Build and verify

```powershell
& .\automation\validate-context.ps1
& .\automation\verify-mirrors.ps1
& .\automation\install-runtime.ps1 -Platform all
```

See [runtime model](docs/01-runtime-model.md) and [knowledge system](docs/02-knowledge-system.md).
