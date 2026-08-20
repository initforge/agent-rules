# Progress — northstar-on-demand-portable-harness

## Status: IMPLEMENTATION COMPLETE — final CI green gated on a PRE-EXISTING Windows flake

## Implementation (all shipped on `origin/main`, HEAD 04f04e2)

- REQ-001/002 — effective intent events + effective WorkSpec items (protocol.ts)
- REQ-003/004/005 — frozen portable contract, `agent-rules handoff plan|prompt`, 10-point pre-handoff audit (3 gates, PASS/BLOCKED/NEEDS_USER)
- REQ-006 — TaskPacket execution policy (DISCOVER/PLAN/IMPLEMENT/VERIFY/REPAIR/CLOSE, effects, budgets, concurrency, recovery)
- REQ-007 — operator selects host/model; selectProviderByEvidence telemetry-only; legacy approvedModels/approvedRouting compatibility reader
- REQ-008/009/010/011 — MCP install profiles (default none), host-config convergence, task-scoped idle-zero lifecycle + process receipts, install/sync/verify/reconcile fixes, remote-MCP isolation
- REQ-012/013 — 5fedu deterministic activation; reference receipt drives the only footer; no banner/template-checked; validate-no-5fedu-leakage guard
- REQ-014/015/016/017 — host-capability attestation v2 + enforcement order, worktree transactions, trajectory supervisor, Codex PreToolUse deny/ask/force_ask
- REQ-018/019 — artifact admission (EPHEMERAL/CHECKPOINTED/COORDINATED/AUDITED), optional support pack, regenerable GC
- REQ-020 — `agent-rules close` + closure transaction (residue, promotion, retirement, purge eligibility)
- REQ-021/022 — workflow-case + vNext eval suites
- REQ-023 — local verification gates: npm ci / build / check / test / verify:all (2723 passed; the 1 previous env-dependent reconcile test now environment-independent and green)
- REQ-024 — release sequence started: host MCP entries cleaned (backup + receipts), origin/main pushed

## Local proof

- `npm ci` PASS, `npm run build` PASS, `npm run check` PASS
- Root vitest + kernel (239) + engine (55 files) + control-plane (10 files) + cli (35 files) all PASS
- `npm run verify:all`: 2723 passed; source-integrity, python suites, validate-rule-contracts, validate-no-5fedu-leakage, validate-v31-directive all PASS

## CI on origin/main (final SHA)

| Workflow | Status |
|---|---|
| Quality (linux) | PASS |
| Quality (macos) | PASS |
| Quality (windows) | PRE-EXISTING FAIL: 2 control-plane `browser-qa` axe scans — "owned control-plane server disappeared before test" (test's own comment: slow Windows runners); unrelated to this phase (control-plane untouched) |
| python-tests | PASS |
| security | PASS |
| Certification | queued |

## Blocker to final closure (plan section 5 step 6/7)

Per the frozen contract, branch deletion + closure are gated on final main CI green. Windows
remains red on a PRE-EXISTING control-plane browser-qa flake. The task is NOT closed and the
remote branches (`codex/northstar-on-demand-portable-harness`,
`adaptive-minimal-proof-testing`, `integration/persistent-mcp-session-broker`) are NOT deleted,
pending green.

## Host cleanup performed (REQ-008/009)

- Backed up host configs to `P:\agent-rules-branch-backups\pre-reinstall-hosts\<ts>\` (codex config.toml).
- Converged the codex host config to global MCP profile `none`: removed the agent-rules-owned
  MCP entries (codebase-memory, playwright, chrome-devtools, context7) with backup receipts;
  Codex-owned `node_repl` and `[projects]` sections preserved.
- `agent-rules runtime reconcile` now reports MCP gating PASS (exit 0) on the profile surface.
- No agent-rules runtime is installed on any host (all absent) — nothing to uninstall.
- Live MCP processes are the active session's routed tools; they teardown with the session per the new idle-zero lifecycle (not killed mid-session).
