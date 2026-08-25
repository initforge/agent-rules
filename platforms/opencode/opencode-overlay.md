---
alwaysApply: true
description: OpenCode-specific runtime delta for agent-rules harness.
---

# OpenCode overlay

- Global runtime: `~/.config/opencode/`.
- Project config: `opencode.json` in the project root.
- Project-native assets: `.opencode/` for agents, commands, plugins, and skills.
- Agents live at `{home}/agents/` (`.md` files with YAML frontmatter).
- Skills live at `{home}/skills/<name>/SKILL.md`.
- MCP servers are configured in `opencode.json` under the `mcp` key.
- Model mapping is user-configured in `opencode.json` via the `model` and
  `agent.<name>.model` fields. The adapter maps logical classes
  (economy/standard/expert) to user-chosen provider/model IDs.
- `opencode.json` is user-owned. Installers never replace provider, credential,
  model, `enabled_providers`, or `disabled_providers` settings.
- Provider allowlists require explicit owner intent. The default adapter keeps
  `/connect` and `/models` open to every provider available to OpenCode.
- Doctor reports an unapproved provider allowlist as `NOT_LIVE`; intentional
  restrictions require the explicit doctor override.
- Missing mappings are visible as `"unset"` placeholders — they never silently
  default to a hardcoded provider.
- Agent permissions are defined in agent frontmatter (`permission:` key) and
  merged with the top-level `permission:` from opencode.json.
- Install modes: project-local (default, writes to `.opencode/`) and global
  (`--global`, writes to `~/.config/opencode/`).
- Ownership: `agent-rules-owned.json` in the target directory tracks every
  file the adapter creates. Uninstall removes only owned files.
- Backup: before destructive replacement, files are backed up to
  `.opencode/agent-rules-backups/` (project) or
  `~/.config/opencode/agent-rules-backups/` (global).
- The `initforge-` namespace prevents collisions with user-native agents.
- Native hooks: OpenCode does not expose native event hooks. Telemetry and
  adapter probes are observational only; no fail-open hook contract exists.
  All native claims remain UNVERIFIED unless a probe observes host delivery.
- Installer probe: `ADAPTER_PASS`. A matching event is `NATIVE_OBSERVED` only
  when a probe observes actual host-side delivery (not local file state).
