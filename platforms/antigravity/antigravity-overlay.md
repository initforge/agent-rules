---
alwaysApply: true
description: Antigravity-only runtime delta.
---

# Antigravity overlay

- Global runtime: `~/.gemini/config` plus `~/.gemini/GEMINI.md`.
- Project `.agents/` is a thin pointer; do not duplicate core or skills there.
- Use Antigravity-native browser and MCP tools.
- Live/manual UI proof loads `qa-skills` plus `browser-qa`; ERP parity still routes through `5fedu-module-parity`.
- Economy handles retrieval/mechanical work, standard handles normal plans/implementation/review, and expert is reserved for unresolved high-risk reasoning.
- Native plan artifacts route through `plan-and-handoff`; source edits wait for the execute pivot.
- Hooks inject routed context and record portable telemetry receipts; unknown actors are UNVERIFIED. Keep native `model: inherit`: UNKNOWN model telemetry must not block a worker. Stop and hook errors return allow and never coerce continuation.
- Install or refresh hooks with `./automation/11-install-runtime-hooks.sh`.
