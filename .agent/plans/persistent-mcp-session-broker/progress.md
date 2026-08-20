# Progress — persistent-mcp-session-broker

## Current State
- Phase 0 ✅ plan/CAS(gen 3)/ledger/contract; old plan closed + archived.
- Phase 1 ✅ broker/registry: SQLite WAL store (0600, migrations, token hashing),
  lease API, CAS transitions, receipts+reasons, exclusive default, explicit
  shared policy, stale ownership proof, reconcile/doctor/closeStale.
- Phase 2 ✅ guardian: lazy launch, process attribution (PID+start time+exe+cmdline),
  window attribution (no first-window), X11 EWMH placement (non-activating move,
  no auto-move after READY, relocation events), safe tree termination (PID-reuse
  BLOCKED), reconnect/recreate with RESOURCE_RECREATED receipts.
- Phase 3 ✅ OpenCode adapter (native session binding, per-session projection,
  no project-level bypass).
- Phase 4 ✅ DSH adapter (exact pin detection, headless projection, Web session
  uuid binding via ~/.dsh/sessions, honest granularity).
- Phase 5 ✅ Codex CLI/desktop adapters (project-scoped config, honest desktop
  granularity) + Streamable HTTP broker with lease-token ACL.
- Phase 6 ✅ refactored suite: 86/86 tests (15 files) incl. behavior matrix
  (8 distinct invariants, owner §8 refactor — see
  .agent/tmp/cleanup-20260815/test-refactor-matrix.md); no-bypass audit OK;
  live certification: 5 PASS / 4 BLOCKED (with exact reasons) / 1 UNSUPPORTED;
  live proofs: browser window attribution, MCP handshake (Playwright 24 tools),
  owner relocation with RELOCATED status + unchanged ids, MCP-death reconnect
  with preserved resource identity; illegal lease transitions fixed
  (RECONNECTING→FAILED and READY→FAILED are legal machine edges, regression
  tested). Requirements gen 2 (tests refactor) — requirements.yaml re-hashed.
- Pointer: re-adopted to persistent-mcp-session-broker via CAS (owner-authorized).

## Tasks
- [x] T-000: Phase 0 — plan/CAS/ledger + host capability matrix
- [x] T-001: Phase 1 — broker state store + lease API + lifecycle/doctor
- [x] T-002: Phase 2 — guardian launch/attribution/reconnect/relocation
- [x] T-003: Phase 3 — OpenCode adapter + projection + tests
- [x] T-004: Phase 4 — DeepSeek Harness adapter + DSH Web session binding + tests
- [x] T-005: Phase 5 — Codex CLI/desktop adapters + Streamable HTTP broker + tests
- [x] T-006: Phase 6 — live acceptance receipts, final report
- [x] T-007: Owner §8 test refactor — matrix-30 → behavior-matrix (8 distinct
      invariants), host-dsh-web merged into host-dsh, no-TTL lease test added,
      RECONNECTING→FAILED + READY→FAILED regression tests, requirements gen 2.
