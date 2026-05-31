# Codex Overlay

## Trigger

Active only inside Codex.

## Runtime locality

Use local runtime under:

```text
C:\Users\DELL\.codex\
```

`P:\agent-rules` is backup, sync, and bootstrap, not daily runtime dependency.

## Codex behavior

- Use targeted search before large reads.
- Use deterministic patching for edits when possible.
- Do not revert user changes unless asked.
- Do not auto-commit.
- Do not auto-push.
- Use `path:line` for exact review findings.
- Use `path:symbol` in plan files.

## Config

User config:

```text
C:\Users\DELL\.codex\config.toml
```

Project config:

```text
<repo>\.codex\config.toml
```

Project config applies only in trusted projects.

## Subagents / TOML

Optional only.

No automatic role switch guarantee.

Call explicitly:

- Use planner agent...
- Use implementer agent...
- Use reviewer agent...

Custom agents live in:

```text
C:\Users\DELL\.codex\agents\
```

Useful roles:

- planner: plan only, no app code edits
- implementer: execute one locked plan file
- reviewer: read-only correctness, security, test review
- explorer: read-only code mapping

## Skills

Skills are preferred for reusable workflows that have:

- instructions
- scripts
- references
- assets

Do not put long workflow docs into `AGENTS.md` if they can become a skill.

Codex skills live in:

```text
C:\Users\DELL\.codex\skills\
```

Each skill should have:

```text
<skill-name>\
|- SKILL.md
|- scripts\
|- references\
`- assets\
```

## Plugins

Use plugins when packaging skills, MCP, and app integrations for reusable install.

Do not create plugin before:

- runtime rules are stable
- skills are stable
- MCP registry is documented

## MCP

Configure MCP in:

```text
C:\Users\DELL\.codex\config.toml
```

or via:

```text
codex mcp
```

Record all MCP servers in:

```text
C:\Users\DELL\.codex\docs\mcp-registry.md
```

## Project AGENTS.md

Project-level `AGENTS.md` should contain only project-specific facts:

- build commands
- test commands
- stack
- project conventions
- directory-specific rules
- deployment or staging notes
- known flaky tests

Do not duplicate global runtime rules inside project `AGENTS.md`.
