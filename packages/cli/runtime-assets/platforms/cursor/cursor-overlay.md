---
alwaysApply: true
description: Cursor-specific runtime delta for agent-rules harness.
---

# Cursor overlay

- Runtime: `~/.cursor/rules`, `~/.cursor/skills`, and `~/.cursor/mcp.json`.
- Agent-rules does not install Cursor hooks; native rules, skills and MCP are sufficient.
- Hook failures are reported without creating plan state or forcing continuation.
- Canonical source remains `agent-rules`; use reviewed import for any reverse sync.
- Load browser QA only for live/manual UI proof.
