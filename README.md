# Agent Rules — Syncable Codex Runtime

![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white)
![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=flat-square&logo=powershell&logoColor=white)
![TOML](https://img.shields.io/badge/TOML-9C4121?style=flat-square)
![JSON](https://img.shields.io/badge/JSON-000000?style=flat-square&logo=json&logoColor=white)
![Codex](https://img.shields.io/badge/Codex_Runtime-111111?style=flat-square)
![MCP](https://img.shields.io/badge/MCP_Registry-2D3748?style=flat-square)

`agent-rules` is the portable operating bundle for Codex: rules, agent profiles, skills, templates, scripts, and inventory snapshots. Its core purpose is not storing prompts; it keeps a reproducible working contract for planning, research, implementation, review, tool inventory, and machine bootstrap.

Daily work uses local runtimes such as `~/.codex`, `~/.gemini`, and `~/.grok`. `P:\agent-rules` is the versioned source and backup/bootstrap layer used for restore, sync, and sharing with other local agents. Local agent ecosystem skills such as Caveman and Cavecrew are backed up separately under `P:\agent-rules\agents-skills`.

## Main Areas

| Area | Role |
|---|---|
| `rules/` | Shared operating rules (Vietnamese): core, planning, execution, quality, context |
| `skills/` | Shared active skills across platforms (e.g. 5fedu-project, docs-style, check-work...) |
| `workflows/` | Shared workflow template definitions |
| `platforms/` | Platform adapters for specific configurations |
| `platforms/codex/` | Codex config: agent profiles, templates, hooks, docs, and inventory |
| `platforms/grok/` | Grok CLI config: hooks, scripts, and mapping structure |
| `platforms/antigravity/` | Google Antigravity adapter: overlay rules, global workflows |
| `scripts/` | Installation, synchronization (sync), and verification (validate) scripts |
| `docs/` | System documentation and [Open-source Tools Registry](docs/09-opensource-tools-registry.md) |
| `.agents/` | Project-local runtime live copy (used for testing on this repo) |
| `shared/` | Shared contracts (`opus-emulation-contract.md`) |

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
& "P:\agent-rules\platforms\codex\scripts\sync-p-to-codex.ps1"
```

## Grok CLI Harness

```bash
./scripts/sync-all-harness.sh   # rules + skills → 3 platforms
./scripts/validate-harness.sh   # check legacy or drift
grok inspect
```

**Không dùng Cursor** — runtime là Grok CLI. Triết lý: [docs/06](docs/06-harness-philosophy.md) · [docs/07](docs/07-grok-cli-harness.md) · [docs/08](docs/08-opus-emulation-harness.md)

## Read Next

- [Technical specification](docs/01-technical-specification.md)
- [Operations and sync](docs/02-operations-and-sync.md)
- [Maintenance and risks](docs/03-maintenance-and-risks.md)
- [Antigravity adapter](docs/04-antigravity-adapter.md)
- [Harness philosophy](docs/06-harness-philosophy.md)
