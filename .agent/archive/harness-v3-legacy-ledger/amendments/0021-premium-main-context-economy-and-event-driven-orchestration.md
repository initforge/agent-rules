# AM-0021 — Premium-Main Context Economy and Event-Driven Orchestration

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

## 1. Owner decision and preservation

AM-0021 is additive after AM-0020. It does not rewrite `original.md`, remove any
requirement from AM-0001 through AM-0020, create a competing ledger, or weaken
plan, evidence, review, reconciliation or terminal gates.

The strongest and most expensive main model remains the logical owner of
original intent, architecture, material conflicts, reconciliation and terminal
decision. It must not spend most of its context reading heartbeats, raw child
JSONL, full logs, full ledgers, repeated plan text or routine dispatch state.

The selected runtime model is `EVENT_DRIVEN_HYBRID`:

```text
Original plan + amendments
→ deterministic engine and execution DAG
→ workers / verifiers / reviewers
→ content-addressed raw evidence
→ deterministic reducers and EventDelta
→ semantic wake decision
→ signed MainRunCapsule
→ premium-main decision
→ engine continuation and machine terminal report
```

Token and context economy are optimization objectives, not terminal blockers.
When correctness needs more context, the main may exceed the preferred budget
without owner approval. The overrun is attributed and audited, but work is not
interrupted, scope is not cut and the model is not silently downgraded.

## 2. Separation of deterministic control and premium reasoning

The deterministic engine continuously owns:

- Ready-queue calculation, dispatch, leases, heartbeat, retry and backpressure.
- Event journal, candidate epochs, evidence freshness and receipt validation.
- Routine CI polling, tool-output capture, cache, checkpoint and resume.
- Machine projections, reconciliation formula and terminal report compilation.

The premium main wakes only for:

```text
PLAN_LOCK
ARCHITECTURE_DECISION
OWNER_MESSAGE
AUTHORITY_REQUIRED
CONTRACT_CONFLICT
REPAIR_ESCALATION
REVIEW_CONFLICT
INTEGRATION_CONFLICT
CONTEXT_FIDELITY_FAILURE
TERMINAL_RECONCILIATION
```

Normal heartbeat, polling without state change, dispatch/ack, cache telemetry,
routine retry, raw command output and policy-resolved T0/T1 outcomes do not wake
the premium main.

Main remains orchestration-only. It does not author product source or tests.
Workers cannot verify or review their own output. Review and terminal authority
remain separated exactly as required by AM-0020.

## 3. MainRunCapsule contract

Every premium-main wake receives a content-addressed `MainRunCapsule`:

```text
schema
version
run_id
plan_id
original_plan_sha256
effective_plan_sha256
candidate_epoch
ledger_revision
event_cursor
capsule_revision
owner_intent_invariants
active_decisions
critical_path
ready_queue_digest
assignments_by_state
changed_claims
verification_digest
review_digest
open_findings
conflicts_requiring_decision
terminal_gate_digest
artifact_pointers
omitted_manifest
allowed_drilldowns
budget_envelope
capsule_sha256
```

The capsule binds the immutable original, ordered amendments, exact candidate
epoch and ledger revision. Every conclusion traces to an event, PlanAnchor,
claim, evidence hash or diff hunk. `omitted_manifest` reports counts and pointers
for facts excluded from the bounded capsule so omission cannot be hidden.

Raw logs, full diffs, screenshot binaries, the full ledger and the full chat
transcript are excluded by default. A stale, tampered or materially incomplete
capsule is rejected and invokes correctness fallback rather than a fabricated
decision.

## 4. EventDelta, artifact pointers and targeted drill-down

The engine emits ordered, idempotent `EventDelta` records:

```text
sequence
event_type
actor
affected_requirements
affected_claims
previous_state
current_state
severity
candidate_epoch
artifact_refs
wake_reason
created_at
event_sha256
```

Raw material remains in the content-addressed evidence store and is referenced
through `ArtifactPointer`:

```text
artifact_id
uri
sha256
media_type
candidate_epoch
claim_scope
byte_size
chunk_index
trust_class
redaction_state
```

The main may issue a `ContextQuery` for exact `PLAN_ANCHORS`, `DIFF_HUNKS`,
`EVIDENCE_EXCERPTS`, `REVIEW_CONFLICT`, `RAW_RANGE` or `FULL_ARTIFACT`. The
returned `DrilldownReceipt` records exact chunks, hashes, token usage and reason.
Correctness drill-down is always allowed inside current task authority.

## 5. Tool Output Broker

Every native-child command, CLI, test runner and browser runner executes behind
a host-neutral `ToolOutputBroker`:

- stdout/stderr streams to a content-addressed artifact rather than main context;
- a deterministic parser emits exit code, duration, counts, anomaly flags,
  bounded excerpt and artifact pointer;
- parser failure emits an error plus pointer, never the complete raw stream;
- control sequences, secrets and prompt-like text are classified as untrusted;
- raw range retrieval is explicit and receipt-bound;
- the broker preserves complete raw evidence even when no LLM reads it.

This explicitly prohibits a main session from directly ingesting unbounded
`opencode run --format json`, test JSONL or equivalent child output.

## 6. Plan adoption and context fidelity

At plan adoption the premium main reads the immutable original and approved
amendments directly, then issues `PlanLockReceipt`. The plan compiler creates a
content-addressed PlanAnchor/chunk index. Later turns receive only amendment and
event deltas plus exact affected anchors.

`CapsuleFidelityValidator` proves:

- original and ordered-amendment identities;
- coverage of every unresolved or high-risk claim;
- preservation of owner decisions and active authority;
- exact candidate/evidence/review freshness;
- traceability of every status to canonical material;
- disclosure of every intentionally omitted collection.

An optional economical summarizer may change presentation only. It cannot
change enums, evidence maturity, findings, readiness or terminal verdict.

When fidelity cannot be proven, the system loads the necessary canonical plan,
diff or evidence material and continues. It does not stop merely to preserve a
token target.

## 7. Checkpoint, compaction and resume

`MainCheckpoint` contains:

```text
last_capsule_sha256
last_event_cursor
unresolved_decisions
active_authority
candidate_epoch
ledger_revision
main_decision_hashes
next_wake_conditions
```

After compaction, app restart, crash or reboot, the engine verifies checkpoint
against ledger/event journal and compiles a new capsule from the next cursor. It
does not replay the whole transcript. Session rotation occurs only at a safe
checkpoint and never interrupts an in-progress semantic decision. If rotation
would threaten continuity more than it saves, the current main context may
continue and exceed the preferred budget.

## 8. Advisory context and token policy

Preferred operating targets for standard/resumable runs:

| Signal | Directional target |
|---|---:|
| Premium-main share of total uncached input | about 10–15% |
| Steady-state capsule | 4,000–8,000 tokens |
| Event delta | 1,000–3,000 tokens |
| Raw artifact loaded by default into main | 0 |
| Steady context occupancy | about 25–30% |
| Duplicate context | below 5% |
| Raw output kept outside main context | above 95% |

These are SLOs and optimization signals, not hard completion criteria.

```text
NORMAL
ADVISORY
DEGRADED_EFFICIENCY
FIDELITY_FALLBACK
```

No budget state terminates the run. The recovery order is duplicate removal,
delta projection, verified provider cache, safe compaction, targeted drill-down
and optional safe session rotation. If correctness still needs more context, a
`ContextOverrideReceipt` records the reason, affected claims, estimate, actual
usage and expiry while execution continues.

## 9. Host adapter behavior

Codex, Claude Code and OpenCode are the primary adapters for AM-0021:

- Codex maps native child events and compact checkpoints into the canonical
  event/capsule contracts.
- Claude Code Stop/compact hooks checkpoint and resume from capsule without
  replaying the chat transcript.
- OpenCode captures child JSONL through ToolOutputBroker and returns bounded
  receipts to the supervisor instead of expanding raw output in main.

Requested, resolved and observed provider/model/effort remain distinct. Missing
cache or context capability is reported honestly and does not authorize a
silent model substitution.

## 10. Control Plane

Run observability adds real-data views for:

- premium-main wake timeline and wake reasons;
- main/worker/verifier/reviewer token share;
- context occupancy, duplicate ratio and verified cache hits;
- top context sources and raw bytes prevented;
- drill-down history and context overrides;
- capsule fidelity, freshness and staleness.

Raw JSON remains hidden by default. Each aggregate metric links to its evidence
or telemetry receipt.

## 11. Additive requirements

| ID | Requirement |
|---|---|
| M11-R37 | Attribute main context, token usage and occupancy separately |
| M11-R38 | Every premium-main wake uses a signed MainRunCapsule |
| M11-R39 | Main consumes ordered EventDelta rather than transcript replay |
| M11-R40 | ToolOutputBroker prevents raw child output from flooding main |
| M11-R41 | Premium main wakes only under the closed semantic wake policy |
| M11-R42 | Capsule fidelity binds plan, ledger and candidate epoch |
| M11-R43 | Token, cost and cache telemetry is attributed by actor/run/source |
| M11-R44 | Duplicate context is removed by content-addressed chunk cache |
| M11-R45 | Main supports targeted drill-down and correctness override |
| M11-R46 | Compact/crash/restart preserves decisions without transcript replay |
| M11-R47 | Codex, Claude Code and OpenCode conform to one context contract |
| M11-R48 | Control Plane exposes real context-economy telemetry |
| M11-R49 | Optimization cannot reduce plan/evidence/review coverage |
| M11-R50 | Token SLO never changes the terminal truth formula |

## 12. Execution clusters and immediate dogfood

After canonical activation, implement as independent graph clusters:

1. Contracts, canonical serialization and PlanAnchor chunk index.
2. Event reducer, ToolOutputBroker and artifact query gateway.
3. Main capsule compiler, wake policy and decision receipts.
4. Context budget governor, cache attribution and checkpoint/resume.
5. Codex/Claude/OpenCode adapters and conformance fixtures.
6. Control Plane context-economy views.
7. Controlled evaluation, documentation and terminal reconciliation.

Dogfood begins as soon as clusters 1–2 can safely mediate later child output; it
does not wait for the full AM-0021 product to be installed.

## 13. Verification and acceptance

Required controlled cases include:

- deterministic hashes on Linux, macOS and Windows;
- capsule/delta/pointer tamper and stale-candidate rejection;
- an 824-line plan retained without repeated full replay;
- at least 100 MB child JSONL preserved but excluded from main context;
- exact anchor/diff/evidence drill-down;
- duplicate event and receipt idempotency;
- malicious prompt text inside raw logs;
- amendment, compact, crash and fresh-process resume;
- high-risk claim omitted from capsule causing fidelity fallback;
- main exceeding advisory budget without stopping or weakening work;
- quality and false-PASS rate no worse than the pre-AM-0021 baseline;
- controlled long-task main uncached input materially reduced, targeting at
  least 50% relative improvement without losing requirement coverage;
- Codex, Claude Code and OpenCode adapter conformance;
- independent adversarial review of context omission and terminal truth.

AM-0021 is complete only when premium main operates through capsules and deltas,
raw child output is brokered, exact drill-down remains available, context resume
is durable, observability is real, and final reconciliation binds original,
AM-0021, final candidate, evidence epoch and installed artifact.

