---
alwaysApply: true
description: Cursor-specific runtime delta for agent-rules harness.
---

# Cursor overlay

- Runtime: `~/.cursor/rules`, `~/.cursor/skills`, and `~/.cursor/mcp.json`.
- Native hooks: `~/.cursor/hooks.json`; they observe prompt/stop events and record host receipts only.
- Hook failures are fail-open; hooks never block tools, create plan state, or force a continuation.
- Canonical source remains `agent-rules`; use reviewed import for any reverse sync.
- Load browser QA only for live/manual UI proof.
