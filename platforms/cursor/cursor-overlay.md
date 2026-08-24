---
alwaysApply: true
description: Cursor-specific runtime delta for agent-rules harness.
---

# Cursor overlay

- Runtime: `~/.cursor/rules`, `~/.cursor/skills`, and `~/.cursor/mcp.json`.
- Native hooks: `~/.cursor/hooks.json`; they observe prompt/stop events and record host receipts only.
- Hook telemetry has the portable event shape; unknown actors are UNVERIFIED. Hook failures are fail-open; hooks never block tools, create plan state, force a continuation, or block a worker because model telemetry is UNKNOWN.
- Canonical source remains `agent-rules`; use reviewed import for any reverse sync.
- Load browser QA only for live/manual UI proof.

<!-- agent-rules:operator-profile:vibe-product BEGIN (source-sha bound; do not edit in place) -->
- profile_id: vibe-product
- version: 1.0.0
- language: vi (outcome-first: true)
- default_owner_mode: vibe-coder
- host: cursor
- ask_only_for: material-decision, execution-authority
- technical_triggers: technical mode | giải thích kỹ thuật | đào sâu | chi tiết kỹ thuật
- technical_revert: after-task-or-topic
- never_weaken: verification, security, scope, pass-semantics
<!-- agent-rules:operator-profile:vibe-product END -->
