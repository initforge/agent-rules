---
alwaysApply: true
description: Claude Code-only runtime delta for agent-rules harness.
---

# Claude Code overlay

- Global runtime: `$CLAUDE_CONFIG_DIR` or `~/.claude`; project `.claude/` is
  project-local config only.
- Global entrypoint: `$CLAUDE_CONFIG_DIR/CLAUDE.md`. Static rules and native
  skills provide context without an agent-rules callback.
- Native subagents: `Agent` tool at depth one. Harness workers run as real
  `claude` native children (`claude -p --output-format stream-json`), never
  through another host's CLI, never as a synthetic session claim.
- Model evidence: requested is the harness `--model` value; resolved comes from
  the `system` init event; observed from assistant message metadata. Anything
  the host does not expose is recorded as `HOST_UNOBSERVABLE` — never
  fabricated.
- Worktree isolation: `claude --worktree <name>` per child; any path escaping
  the allowed root fails closed before spawn.
- Stop/checkpoint/resume: sessions persist under
  `$CLAUDE_CONFIG_DIR/projects/<slug>/<session-id>.jsonl`; resume via
  `claude --resume <session-id>`.
- Lifecycle: doctor `claude doctor`; install `claude install [version]`; update
  `claude update`. Receipts and attestations bind the exact git HEAD of the run.
- Report `PASS`, `PARTIAL`, or `BLOCKED` with verification evidence. No claim
  may exceed its exact executable evidence.

<!-- user custom config preserved -->
