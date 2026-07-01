# Agent Rules — readable runtime map

This repository is organized so a new maintainer can identify global context, skills, project context, integrations, platform adapters, automation scripts, and generated output directly from the tree.

## Top-level map

| Folder | Purpose |
|---|---|
| `00-huong-dan` | Human-facing docs and system map |
| `01-global/loi` | Always-loaded global context |
| `01-global/ky-nang` | Lazy-loaded skills |
| `01-global/tich-hop` | Required, recommended, and optional integrations |
| `02-du-an` | Project context and 5fedu template pack |
| `03-nen-tang` | Platform-only deltas |
| `04-tu-dong-hoa` | Build, install, verify, export, and sync scripts |
| `05-ban-dung` | Generated runtime preview |
| `06-ke-hoach` | Research and migration history |

## Baseline integrations

| Integration | Policy | Meaning |
|---|---|---|
| `codebase-memory-mcp` | required | Code intelligence baseline |
| `context7` | recommended | Latest library and framework docs |
| `caveman` | optional | Compression workflow, not auto-installed |

## Build and verify

```powershell
& .\04-tu-dong-hoa\03-kiem-tra-context.ps1
& .\04-tu-dong-hoa\04-kiem-tra-mirror.ps1
& .\04-tu-dong-hoa\02-cai-runtime.ps1 -Platform all
```

Start with [Bản đồ hệ thống](00-huong-dan/00-ban-do-he-thong.md) and [Mô hình runtime](00-huong-dan/01-mo-hinh-runtime.md).
