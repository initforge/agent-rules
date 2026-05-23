# Tool Registry

This file documents installed/open-source tools that Codex can use and how to reinstall them on a new machine.

## Required format

### <tool-name>

Purpose:
- ...

Install:

```powershell
<command>
```

Verify:

```powershell
<command>
```

Config:
- path:

Codex usage:
- when to use:
- when not to use:

Notes:
- ...

## Current tools

### Codex CLI

Purpose:
- Primary implementation owner.

Install:
- Installed globally through the local npm shim on this machine.

Verify:
- `codex --version`
- `codex --help`

Config:
- `C:\Users\DELL\.codex\config.toml`
- `C:\Users\DELL\.codex\AGENTS.md`

Codex usage:
- code implementation
- plan execution
- local verification
- final patch owner

### RTK

Purpose:
- Command compression / token-saving wrapper.

Verify:
- `rtk --version`
- `rtk gain`

Codex usage:
- external commands via `rtk <cmd>`
- PowerShell cmdlets via `rtk proxy powershell -NoProfile -Command "..."`

### GitNexus

Purpose:
- Code graph / impact analysis / symbol context.

Verify:
- `npx gitnexus --help`

Codex usage:
- MEDIUM/HIGH tasks
- shared module impact
- refactor/rename/delete
- unknown code paths

Notes:
- Do not run analyze every turn.
- Use preflight first.
- Fallback to `rg` if stale.
- Current machine has verified usable indexing on:
  - `P:\open-claw-setup`
  - `P:\midterm-mobile`
- When multiple repos are indexed, CLI query/context/impact commands require explicit `--repo`.
- Current machine still shows two non-fatal caveats:
  - FTS can be missing or degraded until a force rebuild recreates indexes
  - `.dart` parsing is partially unavailable because optional `tree-sitter-dart` is not installed

### Web / GitNexus / rg research stack

Purpose:
- Primary native research stack inside Codex.

Verify:
- `rg --version`
- `npx gitnexus --help`

Codex usage:
- `rg` for tight local search
- GitNexus for graph/impact/process context
- `web` for latest external docs and platform behavior

Notes:
- this replaces Antigravity as the main research layer

### ripgrep

Purpose:
- Fast text search.

Verify:
- `rg --version`

Codex usage:
- first-line search for known symbols/files

### Node / npm / pnpm / npx

Purpose:
- JS/TS package management and running Node-based tools.

Verify:
- `node --version`
- `npm --version`
- `pnpm --version`
- `npx --version`

### Python

Purpose:
- scripts, tooling, local automation.

Verify:
- `python --version`

### Flutter / Dart

Purpose:
- Flutter/Dart projects.

Verify:
- `flutter --version`
- `dart --version`
