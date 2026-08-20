# terminal-harness-vnext — progress

## Phase 0 — COMPLETED (no PASS claim)

- Frozen vNext contract persisted: `plan.md` SHA-256 `d7358d66d6e33096ca5266935074f3819d930ba46bf20af77f8f43e08dc96925`.
- Bootstrap envelope `BOOTSTRAP_UNCERTIFIED` with separated harness-source / consumer-target / host-runtime identities.
- Isolated branch `vnext/terminal-harness` created from baseline `e8481aa`; worktree clean.
- Evidence: `.agent/evidence/terminal-harness-vnext/phase-0-proof.json`.

## Phase 1 — IN PROGRESS

- Unified closure service: `packages/kernel/src/northstar/closure-service.ts` (exported via kernel and engine facades).
  - Mandatory gates: non-empty requirements, non-empty reconciliation, non-empty bound evidence, no unresolved/pending requirements, 40/64-hex behavioral baseline, complete four-identity binding.
  - Evidence binding identities: harness_release, installation_projection, consumer_repository/candidate, host_runtime.
  - Behavioral baseline B + allowlisted metadata commit C + exact-SHA terminal attestation.
  - Prepare/stage/commit single-point transaction with idempotent replay.
  - Invalid v1 closure correction -> SUPERSEDED/INACTIVE with terminal PARTIAL (never fabricates PASS).
  - Operational state ignore markers for consumer worktrees (source-clean after closure).
- CLI: `agent-rules close` rewired to the unified closure service (no shallow verified:true receipts, no empty-reconciliation PASS).
- CLI: new `agent-rules activate <plan-id>` for bootstrap/supersession CAS pointer moves.
- Tests: 19 kernel closure-service tests + 7 CLI trust-root tests PASS; kernel full suite 283 tests PASS.

### Proof

- `.agent/evidence/terminal-harness-vnext/phase-1-proof.json`

### Next

- Activate successor pointer (CAS generation 31 -> 32) in the dogfood repo.
- Phase 2: effective intent, disposition, compiled DoD, one-copy handoff.