# Progress — adaptive-minimal-proof-testing

## Current State
- Phase 0 ✅ plan/CAS(gen 25)/ledger/contract; schemas created
  (proof-trigger, proof-receipt, proof-profile, proof-omission, claim-to-proof,
  risk-to-proof, test-refactor-matrix).
- Phase 1 ✅ kernel: proof-testing.ts (trigger model scope/claim/risk-based,
  11 evidence categories, 8 default profiles, minimal-sufficient selection,
  six-status semantics, proof receipts, refactor policy), proof-router.ts,
  project-audit.ts (read-only).
- Phase 2 ✅ engine facades (proof-testing/proof-router/project-audit),
  CLI `agent-rules proof-plan` (read-only planner, JSON receipt).
- Phase 3 ✅ validators: validate-proof-receipts.mjs (receipts + positive/
  negative fixtures), 16 eval cases, schema validators; all green.
- Phase 4 ✅ platform mirrors: proof schemas + rule projected into all 7
  mirrors; validate-proof-mirror-parity OK (49 artifacts hash-verified);
  opencode source-bound rules acknowledged (no mirror copy by design).
- Phase 5 ✅ project audit (read-only): agent-rules (vitest/playwright,
  129 files/2164 tests, ui-browser recommended), ZaloAI-Ecommerce
  (playwright, 2 files/9 tests, business-logic), pos-ops (vitest/playwright,
  67 files/558 tests, ui-browser) — artifact:
  .agent/plans/adaptive-minimal-proof-testing/project-audit.json.
- Phase 6 🔄 documentation (rule + manifest contract + AGENTS.md invariant +
  guides) done; acceptance verification in progress.

## Tasks
- [x] T-000: Phase 0 — plan/CAS/ledger + schemas
- [x] T-001: Phase 1 — kernel trigger + profiles + selection + status + receipt
- [x] T-002: Phase 2 — engine facade + router + CLI surface
- [x] T-003: Phase 3 — validators + fixtures + 16 eval cases
- [x] T-004: Phase 4 — platform mirrors
- [x] T-005: Phase 5 — project audit (read-only)
- [ ] T-006: Phase 6 — docs + acceptance + push
