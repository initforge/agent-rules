# Agent Rules â€” readable runtime map

This repository is organized so a new maintainer can identify global context, skills, project context, integrations, platform adapters, automation scripts, and generated output directly from the tree.

## Top-level map

| Folder | Purpose |
|---|---|
| `00-guides` | Human-facing docs and system map |
| `01-global/rules` | Always-loaded global context |
| `01-global/skills` | Lazy-loaded skills |
| `01-global/integrations` | Required, recommended, and optional integrations |
| `02-projects` | Project context and 5fedu template pack |
| `03-platforms` | Platform-only deltas |
| `04-automation` | Build, install, verify, export, and sync scripts |
| `05-generated` | Generated runtime preview |
| `06-plans` | Research and migration history |

## Baseline integrations

| Integration | Policy | Meaning |
|---|---|---|
| `codebase-memory-mcp` | required | Code intelligence baseline |
| `context7` | recommended | Latest library and framework docs |
| `caveman` | optional | Compression workflow, not auto-installed |

## Build and verify

```powershell
& .\04-automation\03-validate-context.ps1
& .\04-automation\04-verify-mirrors.ps1
& .\04-automation\02-install-runtime.ps1 -Platform all
```

Start with [System map](00-guides/00-system-map.md) and [Runtime model](00-guides/01-runtime-model.md).

