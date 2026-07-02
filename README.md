# Agent Rules

**Thesis:** One canonical harness for AI agents — flat role-based folders, lazy skills, platform deltas, and automation that keeps runtime mirrors in sync without editing generated output by hand.

## Shape

| Folder | Role |
|---|---|
| `guides/` | Maintainer docs and system map |
| `rules/` | Always-loaded global context (numbered = load priority) |
| `skills/` | Lazy-loaded capabilities (flat slugs) |
| `integrations/` | Required / recommended / optional tools |
| `projects/` | Project packs (`5fedu` template) |
| `platforms/` | Per-runtime overlays (Codex, Grok, Antigravity, **Cursor**) |
| `automation/` | Build, install, validate, sync, doctor |
| `05-generated/` | Build output — do not edit |
| `.agent/` | Advisory trace log, research notes, tombstones (gitignored) |

**Integrations**

| Name | Policy |
|---|---|
| `codebase-memory-mcp` | required |
| `context7` | recommended |
| `caveman` | optional |

## Run

```powershell
./automation/03-validate-context.ps1
```

Linux/macOS (requires [PowerShell Core](https://github.com/PowerShell/PowerShell)):

```bash
./automation/run.sh 03-validate-context
```

```powershell
./automation/01-build-runtime.ps1
./automation/04-verify-mirrors.ps1
./automation/02-install-runtime.ps1 -Platform all
./automation/09-doctor.ps1
```

Install targets: `~/.codex`, `~/.grok`, `~/.gemini/config`, `~/.cursor`. MCP config format differs per platform — see `platforms/*/runtime.yaml`.

## Read next

1. [System map](guides/00-system-map.md)
2. [Runtime model](guides/01-runtime-model.md)
3. Vietnamese overview: [README-vi.md](README-vi.md)
4. 5fedu projects: [projects/5fedu/AGENTS.md](projects/5fedu/AGENTS.md)

**Governance:** Edit `rules/` and `skills/` here only — not `05-generated/` or installed mirrors. Reverse sync via `automation/07-import-reviewed-changes.ps1`.
