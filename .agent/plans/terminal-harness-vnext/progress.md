# terminal-harness-vnext — progress

## Phase 0 — COMPLETED (no PASS claim)

- Frozen vNext contract persisted: `plan.md` SHA-256 `d7358d66d6e33096ca5266935074f3819d930ba46bf20af77f8f43e08dc96925`.
- Bootstrap envelope `BOOTSTRAP_UNCERTIFIED` with separated harness-source / consumer-target / host-runtime identities.
- Isolated branch `vnext/terminal-harness` created from baseline `e8481aa`; worktree clean.
- Evidence: `.agent/evidence/terminal-harness-vnext/phase-0-proof.json`.

## Phase 1 — COMPLETED

- Unified closure service (v2): `packages/kernel/src/northstar/closure-service.ts`
  - A: `deriveOutcome` never defaults PASS; `evidence_status` required per requirement; all reconciliation records must pass (not `some`).
  - B: atomic staging (rm residual → write → fsync → verify hash); atomic commit (single-commit-point); `manifest_hash` in receipt; idempotent replay with input drift detection.
  - C: five-identity binding with harness ≠ consumer; `host_runtime.validation_status` VALIDATED/UNSUPPORTED/UNKNOWN.
  - D: `attestTerminal` validates SHA matches baseline/candidate; validates evidence refs; binds to manifest_hash.
  - E: metadata delta disallows source implementation files.
  - F: `correctInvalidClosure` atomically updates ledger via stage→fsync→rename; returns BLOCKED when state insufficient.
- Tests: 36/36 closure-service, 13/13 generic fixtures, 7/7 CLI trust-root.

### Proof

- `.agent/evidence/terminal-harness-vnext/phase-1-proof.json`

## Phases 2–7 — COMPLETED

- Phase 2: intent corrections, `ExecutionDisposition`/`CompiledDoD`, target consumer identity.
- Phase 3: causal map, `semantic_role`/`applicable_phases`, artifact admission.
- Phase 4: MCP lifecycle `REGISTERED→TEARDOWN`, 7 resource lanes.
- Phase 5: Mimocode retired (source + `candidate-fabric` + `registry` + `schema` + `platforms/`).
- Phase 6: ledger `effective_plan_identity` hash fix.
- Phase 7: `verify:all` PASSED.

## Phase 8 — COMPLETED

- G1–G4 generic fixture matrix: 13/13 PASS.
- G1: fresh unrelated repo closure + source-clean + correction.
- G2: project AGENTS.md preserved + source untouched.
- G3: stale harness state corrected to SUPERSEDED/INACTIVE/PARTIAL.
- G4: 6-host matrix, artifact admission, causal maps, CompiledDoD.

## Phase 9 — COMPLETED

- G1 live proof: activate + close + correction on fresh fixture.
- 0 managed MCP processes (idle-zero).
- Source-clean after closure (only operational ignores).
- Terminal attestation receipt.
- `verify:all` PASSED.

## Final state

- Branch: `vnext/terminal-harness` (13 commits from `e8481aa`)
- Kernel: 325/325 ALL_PASS, 31 skipped
- CLI: 557/557 ALL_PASS, 4 skipped
- G1–G4: 13/13 PASS
- `verify:all`: PASSED
- Host evidence: OpenCode 1.18.18 (LIVE_CERTIFIED), Antigravity 2.8.1 (LIVE_CERTIFIED), Codex/Claude/Cursor/Grok (absent, static-only)
- Frozen contract: `d7358d66`, generation `32` CANONICALLY_ACTIVATED
