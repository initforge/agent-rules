# MCP Availability Repair — Phase Plan

Plan ID: `mcp-availability-repair-v1`
Relation: **supersession** of `mcp-visible-workspace-isolation-v1` (gen 20) —
the prior phase remains durable history with PARTIAL status; this
owner-authorized phase becomes the only active plan source.

## Outcome

OpenCode sessions reliably resolve a single source binding so GUI MCP
providers launch through the guardian onto the correct virtual desktop —
without counting 9 candidate windows, without bypassing the guardian, without
manual window choice when identity resolution can decide, and with NEEDS_USER
(one concrete bind command) only for genuinely ambiguous multi-session cases.

## Scope

1. Repair session-binding + candidate resolution (grouping by OpenCode session
   identity; process ancestry + project root/CWD; exclude browser/MCP child
   windows).
2. Restore Playwright MCP + Chrome DevTools MCP availability in the current
   session through the guardian.
3. Keep the guardian mandatory; detect and reject direct-bypass configs.
4. DeepSeek Harness adapter: NOT implemented — record compatibility boundary
   and follow-up task only.

## Requirements (requirements.yaml is the flat ledger)

REQ-001 identity-based candidate grouping; REQ-002 ancestry+CWD project-root
resolution; REQ-003 child-window exclusion; REQ-004 grouped NEEDS_USER with a
single bind command; REQ-005 direct-bypass config rejection; REQ-006 live
handshake + receipt; REQ-007 regression tests + validators.

## Acceptance posture

No PASS from unit tests or config-valid alone. Live acceptance requires a
real MCP handshake through the guardian with the full receipt set.
