---
alwaysApply: true
description: Global-first installation policy — every provider, CLI tool, runtime, and host-config install must be user-level (global); per-project installs are forbidden unless the project genuinely deviates from the global configuration AND the owner explicitly requests that specific deviation.
---

# Installation: global-first, never per-project

Hard gate: every install of the harness — MCP providers, CLI tools, runtimes, host
configs, hooks — is **global / user-level**. Per-project (repository-local) installs
are forbidden unless BOTH conditions hold:

1. The project genuinely deviates from the global configuration for that item, AND
2. The owner explicitly requested that specific deviation for that part.

## Install targets must be global

- Host configs: `~/.config/opencode`, `~/.codex`, `~/.grok`, `~/.cursor`,
  `~/.antigravity`, and equivalent user-home config dirs — never repository
  subfolders.
- Tools and binaries: npm `-g`, `uv tool install`, `$HOME/.local/bin`,
  `$HOME/.local/share`, pinned npx cache — never `node_modules`-or-repo-local
  copies created just for one project.
- MCP servers are wired in the **global host config only**; project-level copies
  of MCP entries are never created for convenience or to work around a per-session
  reload.
- The harness's own runtime sync (`automation/02-install-runtime.ps1`) already
  targets user-home host configs; preserve that as the only install path.

## Per-project installs (only when deviating AND owner-requested)

- Applies only to the item that actually deviates; everything else stays global.
- Record the owner request and the deviation in the task plan/receipt.
- Artifacts must still avoid polluting canonical source: installs land outside the
  repo; transient files go to `/tmp` or user state dirs, not inside the worktree.

## Verification

- Every install is verified against its registry pin: `--version`/`--help` matches
  `integrations/registry.json` (or the package manifest), and the resolved binary
  lives at a global location (`which`/`command -v` resolves outside the repo).
- Per-project MCP/host-config additions require an explicit owner request recorded
  in the receipt; absence of that record fails closed (BLOCKED).
