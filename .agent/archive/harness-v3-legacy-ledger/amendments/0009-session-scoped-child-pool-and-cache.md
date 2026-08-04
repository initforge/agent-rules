AM-0009 — Session-scoped child pool, shared context cache, and native-gate scarcity

Owner-approved additive amendment. This amendment supplements AM-0006, AM-0007 and AM-0008.
It does not rewrite `original.md` or any earlier amendment. AM-0004 remains absent/tombstoned.
All prior requirements remain in force except where this amendment explicitly narrows the
top-level session capacity policy introduced by AM-0008.

Immutable original SHA-256: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31

## 1. Owner decision and optimization target

Harness delivery optimizes the critical path, not the number of visible sessions.

- The default execution topology is one durable OpenCode supervisor session for an active wave.
- The supervisor may create multiple asynchronous depth-one child assignments.
- Child concurrency supplies parallel speed; the supervisor session supplies durable context,
  scheduling, cache reuse, checkpointing and normalized receipts.
- Multiple top-level OpenCode sessions are not the normal way to fill capacity.
- The controller may open a second top-level supervisor only for a different repository, an
  incompatible runtime boundary, isolated recovery, or a proven critical-path improvement that
  cannot be obtained with the existing child pool.
- Quality, reconciliation and release gates are never weakened to reduce memory or token use.

This narrows AM-0008 section 4: its active-session and writer limits are child-assignment capacity
inside the harness-owned supervisor topology unless an explicit top-level exception above applies.

## 2. Canonical topology

```text
Codex controller
├── native audit/architecture gate (rare)
├── durable OpenCode supervisor session
│   ├── child writer A — isolated worktree and exclusive owned paths
│   ├── child writer B — isolated worktree and exclusive owned paths
│   └── child reviewer/verifier — immutable read-only snapshot
└── native terminal review/certification gate (rare)
```

Required invariants:

- The OpenCode supervisor is an orchestrator. It does not implement source changes.
- Child agents are depth one. They cannot invoke the task/subagent tool.
- A child has one bounded assignment, at most one subsystem, explicit owned and forbidden paths,
  acceptance criteria, model/effort and resource budget.
- Parallel writers require separate worktrees or equivalent immutable baselines and disjoint
  ownership. Shared paths, shared contracts or integration boundaries serialize.
- A reviewer never writes and never reviews a fingerprint that is still changing.
- The deterministic integration queue remains the only path from child output into the active
  integrated snapshot.
- Child final text is untrusted. Only normalized receipt, independent verification and
  reconciliation advance state.

Initial adaptive child capacity:

```text
top-level OpenCode supervisors: 1 normal, 2 exceptional maximum
active child assignments: 3 normal, 4 burst maximum
child writers: 2 maximum
read-only reviewer or verifier reserve: 1
child depth: exactly 1 maximum
```

The controller reduces capacity before dispatch when memory, CPU, provider rate limits, stale work,
integration contention or evidence lag exceed policy thresholds.

## 3. Durable OpenCode implementation

Certified federation uses the real OpenCode local server and SDK/API, not one-shot process text.

The adapter and supervisor must support:

- start or attach to one harness-owned server identity without touching unrelated sessions;
- create a named durable supervisor session;
- asynchronous prompts and queued child tasks;
- durable event cursors and replay after controller restart or Codex context compaction;
- follow-up prompts on the same supervisor session;
- wait with bounded timeout;
- interrupt or abort with a partial evidence receipt;
- resume without duplicate prompt, task, event, receipt or integrated diff;
- enumerate only child sessions whose parent is the harness-owned supervisor;
- record parent session ID, child session ID, depth, agent profile, provider, model and effort;
- deny the child task/subagent capability and fail certification if recursive fan-out is observed.

The OpenCode supervisor may use the host Task tool or equivalent SDK surface to create child
sessions only when the adapter proves the parent-child relationship and permission boundary.

## 4. Shared context and evidence cache

Session reuse alone is not treated as cache evidence. The harness owns a content-addressed cache.

Each immutable `ContextCapsule` is keyed by:

```text
effective_plan_sha256
ordered_amendment_sha256
baseline_sha
assignment_id
owned_paths
forbidden_paths
source_file_hashes
toolchain_manifest_sha256
acceptance_criteria_sha256
```

The capsule contains only plan anchors, approved amendment excerpts, relevant contracts, current
diff facts, failing evidence and exact verification commands. It never contains hidden reasoning,
credentials, unrelated transcript or a full repository dump.

Cache policy:

- Children receive capsule IDs and verified artifact references instead of repeated full-plan
  prompts.
- File reads, repository facts, route results and evidence artifacts may be reused only when their
  content hashes and trust roots still match.
- Amendment, baseline, owned-path, contract, source-hash or verification-command drift invalidates
  the affected cache entry.
- Provider-reported cache-read, cache-write, input, output and reasoning usage are recorded
  separately. Missing provider cache telemetry is `UNVERIFIED`, never fabricated.
- Repeated unchanged reads or a context watermark checkpoint the supervisor and compact the next
  child capsule rather than cloning accumulated chat.
- Cache corruption, hash mismatch or path escape fails closed and redispatches from canonical
  artifacts.

## 5. Resource-aware speed policy

The scheduler maximizes completed critical-path acceptance criteria per unit time subject to proof.

- Dispatch ready, disjoint critical-path tasks first.
- Do not create a child merely to fill capacity.
- Keep one read-only verification slot available while writers are active.
- Sample supervisor and child RSS, CPU, elapsed time, provider usage and evidence lag.
- Apply bounded backpressure before the operating system starts swapping or the provider starts
  repeated throttling.
- Cancel duplicate or stale child work by assignment identity, never by broad process matching.
- Targeted checks run inside child slices. Expensive full gates run once on the integrated
  fingerprint unless a risk policy requires otherwise.
- Cost optimization may select paid DeepSeek Flash high/max for normal work and DeepSeek Pro only
  on AM-0007 escalation triggers. It must not lower the acceptance bar.

## 6. Native Codex subagent gate

`NATIVE_SUBAGENT` remains scarce and may be resolved only for:

1. the initial high-risk audit or architecture boundary of a large execution; or
2. the final integrated independent review, visual gate or certification boundary of a large wave.

Native subagents are not used for micro-review, routine implementation, fixture repair, ordinary
test failure diagnosis or per-file approval. The engine rejects a native request outside the two
boundaries with a persisted reason and routes the work to the OpenCode supervisor topology.

Codex main remains controller and reconciliation authority. It may inspect, dispatch, integrate and
verify, but it does not implement project source while a child writer route is available.

## 7. Canonical ownership

| Concept | Canonical owner |
|---|---|
| Topology and mode resolution | Engine public contracts and resolver |
| Durable supervisor and child scheduler | Engine bounded supervisor module |
| Context/evidence cache | Engine bounded content-addressed cache module |
| OpenCode server/session/child API | `platforms/opencode/` adapter |
| OpenCode agent and permission delta | OpenCode platform overlay/agent profiles |
| Native scarcity invariant | `rules/25-task-lifecycle.md` short pointer to engine policy |
| Human workflow | Existing plan/finish skills, with no duplicate scheduler logic |
| Observability | Control Plane read-only projection |

Rules, skills, CLI, workflows and platform overlays must not implement competing schedulers or
duplicate cache policy.

## 8. Required acceptance tests

1. One durable supervisor dispatches two disjoint child writers concurrently and one independent
   read-only reviewer without creating multiple normal top-level sessions.
2. The two writers use different worktrees and cannot write outside exclusive owned paths.
3. An overlapping writer assignment serializes before dispatch.
4. A child attempting to invoke another child is denied and produces a policy finding.
5. Controller restart reattaches to the same supervisor and event cursor without duplicate work.
6. Context capsule reuse produces the same hash and avoids repeated plan/repository payload.
7. Baseline, amendment, owned-path or source-hash drift invalidates the affected cache entry.
8. Provider cache usage is recorded when observed and remains explicitly `UNVERIFIED` when absent.
9. Memory or rate-limit pressure reduces child capacity while preserving resumable receipts.
10. A stale child receipt cannot enter the integration queue.
11. Native mode is rejected for a routine implementation or micro-review assignment.
12. Native mode is accepted with capability evidence at initial architecture and final
    certification boundaries.
13. The integrated full gate remains authoritative and no cached or child-declared result can
    create `COMPLETED`.

## 9. Activation and completion

This amendment is `OWNER_APPROVED_PENDING_ACTIVATION`.

The next canonical migration must:

1. preserve immutable original bytes and all revision-45 history;
2. activate the ordered chain `original + AM-0001 + AM-0002 + AM-0003 + AM-0005 + AM-0006 +
   AM-0007 + AM-0008 + AM-0009`;
3. preserve AM-0004 as an explicit tombstone;
4. compute and persist the new effective-plan identity;
5. stale prior completion, review, reconciliation and certification evidence;
6. regenerate every shadow atomically through engine ownership;
7. enter `NEEDS_REMEDIATION`; and
8. implement and verify every acceptance test above before final reconciliation.

No implementation claim is valid merely because this artifact exists.
