# Agent Rules Setup Guide

This folder is the long-term sync, backup, and bootstrap source for agent setup.

## Canonical Model

Daily runtime:

```text
C:\Users\DELL\.codex
```

Sync and bootstrap copy:

```text
P:\agent-rules\codex
```

Compatibility loaders:

```text
P:\agent-rules\global-rules.md
P:\agent-rules\clean-code.md
P:\agent-rules\codex-overlay.md
```

Meaning:
- Codex should run from local files under `C:\Users\DELL\.codex`.
- `P:\agent-rules\codex` is the portable mirror for new-machine restore and backup.
- Root files under `P:\agent-rules` stay thin so older project `AGENTS.md` imports keep working.
- Do not store real secrets in rules, docs, skills, templates, or inventory.

## Current Layout

```text
P:\agent-rules\
|- agents-setup.md
|- clean-code.md
|- codex-overlay.md
|- global-rules.md
|- codex\
|  |- AGENTS.md
|  |- RTK.md
|  |- config.toml
|  |- rules\
|  |- templates\
|  |- prompts\
|  |- scripts\
|  |- agents\
|  |- skills\
|  |- docs\
|  `- inventory\
```

## New-Machine Restore

1. Ensure `P:\agent-rules\codex` is available.
2. Copy it into:

```text
C:\Users\DELL\.codex
```

3. Run:

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
& "$env:USERPROFILE\.codex\scripts\verify-toolchain.ps1"
& "$env:USERPROFILE\.codex\scripts\inventory-current-machine.ps1"
```

4. Read and fill gaps from:
- `C:\Users\DELL\.codex\docs\bootstrap-new-machine.md`
- `C:\Users\DELL\.codex\docs\tool-registry.md`
- `C:\Users\DELL\.codex\docs\mcp-registry.md`
- `C:\Users\DELL\.codex\docs\skills-registry.md`
- `C:\Users\DELL\.codex\docs\profile-matrix.md`

## Daily Maintenance

When local Codex setup changes:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-codex-to-p.ps1"
```

When restoring from sync copy:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-p-to-codex.ps1"
```

## Operating Rules

- Runtime logic lives in `C:\Users\DELL\.codex`.
- Portable bootstrap mirror lives in `P:\agent-rules\codex`.
- Root `P:\agent-rules\*.md` files are compatibility loaders only.
- User-facing Vietnamese must use full diacritics by default.
- Use `codex-research` as the main research layer.
- Use `workflow-router` and plan metadata for phase/profile routing.
- Use pragmatic clean-code rules: cleanup reduces risk, or it waits.
- Use GitNexus before shared-code delete, rename, move, or refactor when indexed.
