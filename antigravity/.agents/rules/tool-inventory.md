# Tool / MCP / Skills Inventory Rules

## Trigger

Activate when:

- user installs a new CLI, tool, MCP, skill, or plugin
- Codex discovers a useful installed tool
- setup changes in `C:\Users\DELL\.codex\config.toml`
- Codex Research, GitNexus, RTK, Node, Python, Flutter, etc. changes
- user asks to prepare for new machine setup
- user asks to document current machine setup
- a command succeeds or fails because a tool is missing

## Purpose

Keep machine knowledge reproducible.

A new machine should be restorable by reading docs and inventory under:

```text
C:\Users\DELL\.codex\docs
C:\Users\DELL\.codex\inventory
```

Then syncing from:

```text
P:\agent-rules\codex
```

## Required docs

Maintain:

```text
C:\Users\DELL\.codex\docs\
Ã¢â€Å“Ã¢â€â‚¬ machine-profile.md
Ã¢â€Å“Ã¢â€â‚¬ tool-registry.md
Ã¢â€Å“Ã¢â€â‚¬ mcp-registry.md
Ã¢â€Å“Ã¢â€â‚¬ skills-registry.md
Ã¢â€Å“Ã¢â€â‚¬ bootstrap-new-machine.md
Ã¢â€â€Ã¢â€â‚¬ troubleshooting.md
```

Maintain machine-readable inventory:

```text
C:\Users\DELL\.codex\inventory\
Ã¢â€Å“Ã¢â€â‚¬ tools.json
Ã¢â€Å“Ã¢â€â‚¬ env.json
Ã¢â€Å“Ã¢â€â‚¬ paths.json
Ã¢â€Å“Ã¢â€â‚¬ codex-config.snapshot.toml
Ã¢â€â€Ã¢â€â‚¬ mcp-list.txt
```

Sync the full `.codex` setup to:

```text
P:\agent-rules\codex\
```

## When adding a CLI or tool

Record:

- name
- purpose
- install command
- verify command
- expected version or version policy
- config path
- env vars needed, but never secret values
- common failure
- how Codex should use it
- when Codex should not use it
- whether it is runtime-critical or optional

## When adding an MCP

Record:

- MCP name
- purpose
- install command
- `codex mcp add` command if applicable
- config TOML block
- verify command
- required env var names
- usage trigger
- failure fallback
- whether stale output is possible

## When adding a skill

Record:

- skill name
- runtime: Codex / local tool / plugin / both
- path
- purpose
- trigger
- inputs
- outputs
- scripts used
- references or assets used
- install or copy command
- verify command

## Secrets policy

Never store secret values in docs.

Good:
- `OPENAI_API_KEY` required; set in user environment.

Bad:
- `OPENAI_API_KEY=sk-...`

Store only:
- env var names
- where to set them
- how to verify presence without printing value

## New-machine rule

A new machine should be restorable by reading:

- `bootstrap-new-machine.md`
- `tool-registry.md`
- `mcp-registry.md`
- `skills-registry.md`
- inventory JSON files

## Inventory refresh

When the user says:

- update inventory
- sync setup
- prepare new machine
- document tools

Run:

```powershell
C:\Users\DELL\.codex\scripts\inventory-current-machine.ps1
```

Then update docs and sync:

```powershell
C:\Users\DELL\.codex\scripts\sync-codex-to-p.ps1
```
