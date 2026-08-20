# MCP Visible Workspace Isolation — Phase Plan

Plan ID: `mcp-visible-workspace-isolation-v1`
Relation to previous pointer: **supersession** — `skill-mcp-fabric-v1`
(generation 16, tip AM-0002) remains durable history in its own ledger; this
owner-authorized phase becomes the only active plan source.

## Outcome contract

Interactive GUI MCP providers (Playwright MCP, Chrome DevTools MCP, Pencil)
open real, headed, visible windows on the exact virtual desktop of the
originating project/session, without switching the owner's desktop, without
stealing the owner's active window, and without affecting any other
project/workspace/window. Headless is explicit CI/owner mode only, never a
silent fallback. Placement failures fail closed with BLOCKED/NEEDS_USER.

## Phases

- **Phase 0** — Gate, plan, ledger, pointer CAS (generation 16 → 17).
- **Phase 1** — Audit: read-only live checks (X11/Cinnamon state, window list,
  process tree, reconcile/session-binding diagnostics) and code audit.
- **Phase 2** — Implement: extended receipt proofs (non-iconic WM_STATE,
  other-windows-unchanged, provider steal-focus race guard) in
  `focus-workspace.ts`, receipt schema, unit tests, validator fixtures.
- **Phase 3** — Docs: visible/isolated/binding/guardian/headless distinction.
- **Phase 4** — Verify: build, kernel tests, focus-workspace validator,
  reconcile --check, verify:all (pre-existing failures distinguished).
- **Phase 5** — Live acceptance when host capability allows; otherwise
  BLOCKED/NEEDS_USER with manual commands. Final report.

## Requirements (requirements.yaml is the flat ledger)

REQ-001 visible default/headless explicit; REQ-002 strict attribution +
non-activating move; REQ-003 post-move proof (workspace + non-iconic + no
other window moved + focus preserved); REQ-004 race guard fail-closed;
REQ-005 explicit session binding (never current-desktop target);
REQ-006 routing/provider policy unchanged; REQ-007 receipts + schema;
REQ-008 docs + stale-drift flagging; REQ-009 live acceptance (host-gated);
REQ-010 full verification baseline with failure classification.

## Acceptance posture

No claim passes on prose. Every acceptance maps to verifier evidence
(unit tests, fixtures, validators, schema validation, live measurements where
isolatable). Host-limited items are BLOCKED/NEEDS_USER with the exact missing
capability and manual commands; nothing is fabricated.
