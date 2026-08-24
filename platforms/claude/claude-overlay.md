---
alwaysApply: true
description: Claude Code-only runtime delta for agent-rules harness.
---

# Claude Code overlay

- Global runtime: `$CLAUDE_CONFIG_DIR` or `~/.claude`; project `.claude/` is
  project-local config only.
- Global entrypoint: `$CLAUDE_CONFIG_DIR/CLAUDE.md`. Routed context is injected
  via the UserPromptSubmit additionalContext hook reading
  `$CLAUDE_CONFIG_DIR/rules/agent-rules-context.md`.
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

<!-- agent-rules:operator-profile:vibe-product BEGIN (source-sha bound; do not edit in place) -->
- profile_id: vibe-product
- version: 1.0.0
- language: vi (outcome-first: true)
- default_owner_mode: vibe-coder
- host: claude
- ask_only_for: material-decision, execution-authority
- technical_triggers: technical mode | giải thích kỹ thuật | đào sâu | chi tiết kỹ thuật
- technical_revert: after-task-or-topic
- never_weaken: verification, security, scope, pass-semantics
<!-- agent-rules:operator-profile:vibe-product END -->
