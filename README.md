# Agent Rules — Syncable Codex Runtime

![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white)
![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=flat-square&logo=powershell&logoColor=white)
![TOML](https://img.shields.io/badge/TOML-9C4121?style=flat-square)
![JSON](https://img.shields.io/badge/JSON-000000?style=flat-square&logo=json&logoColor=white)
![Codex](https://img.shields.io/badge/Codex_Runtime-111111?style=flat-square)
![MCP](https://img.shields.io/badge/MCP_Registry-2D3748?style=flat-square)

`agent-rules` is the portable operating bundle for Codex: rules, agent profiles, skills, templates, scripts, and inventory snapshots. Its core purpose is not storing prompts; it keeps a reproducible working contract for planning, research, implementation, review, tool inventory, and machine bootstrap.

Daily work uses `C:\Users\DELL\.codex`. The `P:\agent-rules\codex` copy is the backup/bootstrap layer used for restore, sync, and sharing with other local agents. Local agent ecosystem skills such as Caveman and Cavecrew are backed up separately under `P:\agent-rules\agents-skills`.

## Main Areas

| Area | Role |
|---|---|
| `codex/AGENTS.md` | Runtime entrypoint for Codex |
| `codex/rules/` | Core, planning, execution, quality, context, and inventory rules |
| `codex/agents/` | TOML profiles for planner, researcher, implementer, reviewer, and bugfixer |
| `codex/skills/` | Local and bundled skills |
| `agents-skills/` | Backup of `C:\Users\DELL\.agents\skills`, including Caveman, Cavecrew, and GitNexus helper skills |
| `codex/scripts/` | Sync, bootstrap, inventory, and phase orchestration scripts |
| `codex/docs/` | Runtime registries and setup docs copied into `.codex/docs` |
| `codex/templates/` | Plan, research, review, handoff, and final report templates |
| `codex/inventory/` | Machine/tool/MCP/config snapshots |
| `antigravity/` | Adapter for Google Antigravity rules, workflows, and preflight |

## Tech Stack

| Layer | Stack |
|---|---|
| Runtime contract | ![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white) ![TOML](https://img.shields.io/badge/TOML-9C4121?style=flat-square) ![JSON](https://img.shields.io/badge/JSON-000000?style=flat-square&logo=json&logoColor=white) |
| Automation | ![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=flat-square&logo=powershell&logoColor=white) |
| Agent workflow | ![Codex](https://img.shields.io/badge/Codex_CLI-111111?style=flat-square) ![RTK](https://img.shields.io/badge/RTK-3B3B3B?style=flat-square) |
| Context layer | ![GitNexus](https://img.shields.io/badge/GitNexus-4B5563?style=flat-square) ![MCP](https://img.shields.io/badge/MCP-2D3748?style=flat-square) |

## Run Checks

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
& "$env:USERPROFILE\.codex\scripts\verify-toolchain.ps1"
& "$env:USERPROFILE\.codex\scripts\inventory-current-machine.ps1"
```

Sync the current runtime to backup:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-codex-to-p.ps1"
```

Restore from backup to local runtime:

```powershell
& "P:\agent-rules\codex\scripts\sync-p-to-codex.ps1"
```

## Read Next

- [Technical specification](docs/01-technical-specification.md)
- [Operations and sync](docs/02-operations-and-sync.md)
- [Maintenance and risks](docs/03-maintenance-and-risks.md)
- [Antigravity adapter](docs/04-antigravity-adapter.md)
