# M11-C10 eval suite — deterministic/adversarial evals (AM-0019 §12)

Controlled-cluster eval suite for the M11 run. Every case is an aggregate or
deterministic proof; nothing is self-scored. A case that cannot be proven on this
box is reported `WAITING_EXTERNAL` with the exact missing capability — never
claimed as passed. `HONEST_UNAVAILABLE` marks a metric whose instrumentation does
not exist yet (method recorded, no fabricated number).

Run all:

```bash
python3 automation/run-m11-evals.py              # live host attempt (bounded)
python3 automation/run-m11-evals.py --offline    # no model calls
```

Exit codes: `0` all PASS · `1` any FAIL/ERROR · `2` amber (WAITING_EXTERNAL /
HONEST_UNAVAILABLE present).

## Required cases (§12)

| Case | Eval | Evidence |
|---|---|---|
| 1. 100% semantic coverage | `coverage.py` | `verification-graph.yaml` (31 effective requirements: 15 REQ + 16 M11-R) |
| 2. Missing tool / CI failure / provider outage / reversible ambiguity continue without owner questions | `resilience.py` | C5 `autopilot-m11.test.ts` (WAITING_EXTERNAL/RETRY_SCHEDULED nonterminal, CI watcher) |
| 3. 14 conflict-free synthetic tasks, no wave barriers | `synthetic14.py` | C2 `dispatch-ready-set.test.ts` |
| 4. Tier-A >=8 concurrent native children | `live_concurrency.py` | live host probe + bounded dispatch attempt |
| 5. Ownership/API/schema/migration/lockfile/generated conflicts rejected | `conflicts.py` | C2 matrix + `aggregation.test.ts` (migration/port/shared/lease domains, path containment) + C3 `worktree-train.test.ts` |
| 6. Crash before/after dispatch, lost response, stale lease, compact, restart, reboot, duplicate receipt: no dup/lost work | `resilience.py` | C5 journal idempotency / stale-lease / stop-hook |
| 7. Controlled multi-service fixture | `resilience.py` | C6 `topology-compiler.test.ts` public-ingress journey (ingress/api/db/queue/worker/migration/seed/async/restart/rollback) |
| 8. Seeded browser defects caught (8-case matrix) | `parity.py` | C7 `parity-runner.test.ts` seeded-defect matrix |
| 9. Tier-A native + Grok functional attestation bind exact HEAD | `attestation.py` | `host-attestation.test.ts`, `write-host-attestations.test.ts`, live host probe |
| 10. Antigravity out-of-ownership mutation rejected | `antigravity.py` | scan of `platforms/antigravity` + host-policy matrix |
| 11. Control Plane browser/visual/accessibility/console/network QA | `control_plane.py` | scan of `packages/control-plane/tests` + C9 views API suite |
| 12. Claim calibration aggregation (M11-R36) | `calibration.test.ts` | `calibrationSummary`/`routeReviewStrength` on engine source: honest UNAVAILABLE, defect-escape by domain, calibration-driven routing |
| Performance gates | `performance.py` → `performance.ts` + `throughput.ts` | `computeReadySet` on 20-node graph (latency/utilization/idle) + controlled 48-task two-variant harness (throughput/e2e) against the compiled engine artifact |

## Performance gates (AM-0019 §12)

Measured in `performance.ts` against `packages/engine/dist`, with throughput and
e2e gates from the controlled two-variant harness in `throughput.ts`:

- READY-to-dispatch p95 < 2 s (50 samples on a 20-node graph)
- safe-capacity utilization >= 75 % (ready-set slots vs total pool ceiling)
- critical-path idle < 5 % (scheduler-sample granularity; wall-clock idle between
  dispatch turns is not instrumented by the engine — method recorded)
- implementation throughput >= 3× sequential baseline — measured by
  `throughput.ts`: the identical 48-task graph (4 ranks × 12, mixed pools, HARD
  deps across ranks only) driven sequential (1 worker, dispatchNext semantics) vs
  swarm (`computeReadySet` antichain, pool up to total ceiling 14); task
  completion is a bounded seeded sha256 hash-chain in worker_threads, so wall
  clock reflects real concurrency. Deterministic seed + warm-up pass.
- end-to-end workload >= 2× baseline without worse defect escape — same harness
  plus a deterministic receipt+integration phase; acceptance, review-rejection
  and evidence (receipt hashes) must be identical across both variants.

## Current honest state (feature/hv3-m11-c9-fix)

- C2/C3/C5/C6/C7/C9 aggregate proofs: PASS.
- Coverage: PARTIAL — REQ-001..008 COVERED, REQ-009..015 PARTIAL, M11-R11..R26 GAP;
  100 % claim not yet met.
- Case 4: codex 0.146.0 is discovered via its npm bundle
  (`~/.codex-cli-npm/.../codex-<platform>/vendor/*/bin/codex`, mirroring
  `host-attestation.ts` `bundledCodexCandidates`) — not via PATH. The live burst
  allocates children across the full Tier-A set (codex `exec` + claude
  `--print --model sonnet` + opencode `run`), every child verified by its exact
  output token, peak alive sampled at 10 Hz with governor thermal/RAM trace
  (AM-0019 §6 thresholds from resource-broker.ts). The gate passes only when
  >=8 concurrent native children are actually observed across the Tier-A set;
  on a hot window (pre-dispatch PAUSE) the probe self-reduces the burst and
  records the governor decision honestly.
- Case 9: `HOST_PROBE_SPECS` capability checks are presence-based (>=1 anchored
  line-start match) instead of exact-once, and command tokens accept a single
  space before positional args — aligned with the real claude 2.1.220 help
  (`--print` listed twice) and opencode 1.18.10 help (`opencode run [message..]`).
  Attestations for every installed host (codex, claude, grok, opencode,
  antigravity) are re-validated against the exact repository HEAD via
  `automation/control-plane-ci.mjs certification-validate`
  (`assertCertificationAttestation`). grok's functional dispatch stays
  WAITING_EXTERNAL until device-OAuth login (doctor/models observed).
- Case 10: WAITING_EXTERNAL — no antigravity adapter-level out-of-ownership
  mutation rejection (engine-level C2 path conflicts exist).
- Case 11: WAITING_EXTERNAL — no Control Plane browser QA harness (views API PASS).
