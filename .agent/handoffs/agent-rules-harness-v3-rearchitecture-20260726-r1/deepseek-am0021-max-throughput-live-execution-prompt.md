# LIVE EXECUTION — ADOPT AM-0021, DOGFOOD IT IMMEDIATELY, KEEP THE MACHINE USEFULLY FULL

Trả lời và ghi status bằng tiếng Việt. Resume từ filesystem, Git, ledger, child
receipts và process ground truth hiện tại; không restart từ zero, không reset,
không clean, không discard candidate hoặc accepted work và không ghi đè ba file
source đang dirty nếu chưa xác minh ownership.

## 1. Read and verify before the next source wave

Read completely:

```text
/home/linhnx/Projects/agent-rules/.agent/handoffs/agent-rules-harness-v3-rearchitecture-20260726-r1/latest-concepts-dogfood-manifest.json
/home/linhnx/Projects/agent-rules/.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0019-autonomous-native-swarm-whole-system-convergence.md
/home/linhnx/Projects/agent-rules/.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0020-epistemic-integrity-adversarial-review-and-truthful-reporting.md
/home/linhnx/Projects/agent-rules/.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md
```

Expected hashes:

```text
original  c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31
AM-0019  074eda76c69d91b91bf25ab74888dc7ada13376cbfd29d0e67e4a8c6f8662a21
AM-0020  f99e603c2e9c60194518938f78de4ab90645eb02d893f2ef811b436c444ee0cc
AM-0021  0dfb45500fe8a7d80f177e57ef8a6c231b44e28f8e4f973b31f85bf7d527cf1c
```

HEAD, tree and shadow revision may have advanced after owner capture. Immutable
plan/amendment hashes may not change.

## 2. Checkpoint and activate without losing in-flight work

1. Let already-running non-mutating tests/reviews return receipts; interrupted
   children without valid receipts remain unaccepted candidates.
2. Checkpoint current integration HEAD, dirty paths, active child ownership,
   evidence cursor and next safe action.
3. Adopt AM-0021 after AM-0020 through the canonical atomic lifecycle API.
4. Preserve `original.md` byte-for-byte and all historical amendments/evidence.
5. Recompute effective identity, invalidate affected stale review/terminal
   eligibility, regenerate all shadow projections and retain
   `NEEDS_REMEDIATION`.
6. A read-only lifecycle reviewer independently verifies atomic persistence,
   fresh-process reopen, hashes, ordered chain, shadow revision and rollback.
7. No AM-0021 source cluster integrates before lifecycle `ACCEPT`.

Do not hand-edit canonical ledger/shadow state and do not create AM-0022 to work
around an activation defect.

## 3. Main-agent behavior starts now

The main is orchestration, reconciliation and semantic decision only. It does
not author source or tests.

Until engine, controller, adapters and terminal evidence prove this behavior
end-to-end, record dogfood as `PROMPT_ENFORCED / PARTIALLY_ENGINE_ENFORCED`.
Module or test-file presence alone is not enforcement evidence.

- Do not run child/native-agent JSONL commands in a way that expands raw output
  into main context.
- Child agents own raw inspection and return bounded receipts with artifact
  path/hash, command, exit code, counts, findings and next safe action.
- Main reads exact raw ranges only for architecture, conflict, fidelity failure
  or terminal reconciliation.
- Heartbeat, routine dispatch, polling and normal retry do not require broad
  main reasoning.
- Token targets are advisory. Never stop, cut scope or downgrade correctness to
  save main context.

Until ToolOutputBroker is implemented, emulate its boundary operationally:
writers/verifiers keep raw output in their worktree/evidence artifacts and send
only bounded structured receipts to main.

## 4. Max-useful native swarm

Before each dispatch burst, inspect current machine-wide agent/browser/test
processes. Until the global broker is fully installed, target **8–10 active
native children across agent-rules, pos-ops and mini-toeic.score combined**, not
8–10 per project.

When safe READY work exists, fill remaining capacity as follows:

| Active slots | Writers | Verifiers/test shards | Reviewers/auditors | Integration owner |
|---:|---:|---:|---:|---:|
| 8 normal | 4 | 2 | 1 | 1 |
| 10 burst | 5 | 2 | 2 | 1 |

These are adaptive targets, not ceremonial fixed counts. A low count requires
an observed dependency, ownership conflict, capability absence or real resource
pressure. Do not serialize unrelated stages.

Global heavy ceilings before the broker is certified:

```text
full build/test: 2
browser/CDP/Playwright heavy: 2
full Compose topology: 1
```

Every writer uses an isolated feature branch/worktree, immutable base epoch,
owned paths, forbidden paths, semantic leases and acceptance/evidence contract.
No two writers may own the same path, public schema, migration, lockfile,
generated manifest, port, fixture, browser page or shared data resource.

Reviewers are read-only and review a stable candidate they did not author.
Review and verification are sharded in parallel. Findings are deduplicated into
one root-cause repair pack. A different writer repairs; a fresh independent
reviewer rechecks. One integration owner rebases and merges accepted candidates
into the rolling integration train as soon as their dependencies pass.

Verify actual wiring rather than trusting interfaces: the controller must
dispatch a ready antichain concurrently; supervisor, DAG and branch train must
share the same assignments; integration must validate changed paths and
semantic leases; real native-child evidence must replace synthetic
worker-thread throughput. Until these gaps close, main may operationally
dispatch native children in parallel but must not claim product enforcement.

## 5. Compile and execute R37–R50 without a sequential phase barrier

Add AM-0021 requirements to the existing effective claim/execution graphs and
run these independent clusters whenever READY:

1. Contracts, canonical serialization and PlanAnchor chunk index.
2. Event reducer, ToolOutputBroker and artifact query gateway.
3. MainRunCapsule compiler, semantic wake policy and DecisionReceipt.
4. Context budget governor, token attribution, cache and checkpoint/resume.
5. Codex, Claude Code and OpenCode adapter conformance.
6. Control Plane real context-economy views.
7. Controlled high-output, omission, compaction, crash and long-task evals.
8. Docs, install/upgrade/rollback and final reconciliation.

Dogfood begins once clusters 1–2 expose a safe usable boundary: use capsule,
delta and bounded-output behavior for the remaining AM-0021 implementation.

Continue all AM-0019/0020 requirements that remain active. A waiting closure
does not stop independent READY work.

## 6. Review and truth rules

- Worker output is a candidate, never a verdict.
- Reviewer accepts only exact claim scope and required capability.
- T2/T3, security, concurrency, migration, release and terminal claims receive
  independent adversarial review under AM-0020.
- No-vision reviewer cannot PASS visual/taste; Playwright-only evidence cannot
  PASS raw CDP.
- Any candidate change stales affected evidence/review.
- Main cannot upgrade machine state or create a prose terminal marker.
- Token/context SLO misses become `DEGRADED_EFFICIENCY`, not `BLOCKED`.
- Capsule fidelity failure loads exact canonical sources and continues.

## 7. Continue-to-completion behavior

Do not stop to ask whether to continue after a repairable defect, review reject,
test failure, provider interruption, context pressure, pending independent
closure or milestone. Checkpoint, reroute, repair, reverify and keep unrelated
READY work running.

Pause only the exact closure that needs unavailable owner authority, destructive
external action or missing credential; report it as a nonterminal waiting state
while every independent task proceeds.

Do not push remote, deploy, delete branches/worktrees or overwrite user work
without later explicit owner authorization.

Final local completion requires every effective R01–R50 to be `MATCH` or valid
`SUPERSEDED`, zero open findings, fresh candidate-bound evidence, independent
terminal reviews, exact installed-artifact binding and an engine-generated
terminal result. Do not claim the newest harness is installed merely because
behavioral dogfood succeeded.

Status updates should be bounded and contain only:

```text
HEAD / effective identity / shadow revision
safe global capacity and active roles
READY/RUNNING/WAITING/REPAIR cluster counts
accepted/integration candidate receipts
new blocking root causes
main-context/token/output-broker telemetry when available
next automatic actions
```

Do not ask whether to proceed.
