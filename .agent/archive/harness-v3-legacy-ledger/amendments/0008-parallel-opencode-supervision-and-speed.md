AM-0008 — Durable parallel OpenCode supervision and delivery acceleration

Owner-approved additive amendment. This amendment supplements AM-0006 and AM-0007. It does not
rewrite `original.md` or any earlier amendment. AM-0004 remains absent/tombstoned. All prior
requirements remain in force unless an explicit statement below narrows a newly proposed policy.

Immutable original SHA-256: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31

## 1. Owner clarifications

1. Harness execution must not inspect, govern, stop, delete, or reconfigure unrelated OpenCode
   sessions or the owner's general OpenCode configuration.
2. Free models are not prohibited. They are non-preferred for normal implementation and review,
   but may remain available as an explicit capability fallback.
3. A future architecture may route a vision-capable model to assist DeepSeek with visual QA.
   That architecture is deferred and is not a blocker for the active Harness v3 successor.
4. OpenCode upgrades are allowed. The harness records the actual runtime version and verifies
   compatibility, but does not pin or prohibit a newer compatible version merely because a run
   started on an older version.
5. Delivery speed must improve through bounded parallelism, critical-path scheduling and durable
   supervision without weakening plan reconciliation, verification or release gates.

## 2. Provider and effort policy

- Normal implementation uses an authenticated paid provider when available.
- The current preferred worker route is `deepseek/deepseek-v4-flash` with `high` effort.
- `max` effort is used for elevated ambiguity, high-risk boundaries or a failed bounded attempt.
- DeepSeek Pro remains governed by AM-0007 escalation triggers and hard budgets.
- A free model may be selected only by an explicit capability or availability decision. The
  resolver must record why it was selected; it must never be a silent fallback.
- Provider, model, effort/variant and observed usage are recorded per assignment receipt.
- This policy applies only to harness-owned sessions. It does not modify global provider settings.

## 3. Durable session supervision

Every harness-owned OpenCode assignment persists:

```text
server_identity
session_id
assignment_id
controller_run_id
workspace_or_worktree
baseline_sha
owned_paths
provider
model
effort
event_cursor
lease_identity
lease_heartbeat
dispatch_fingerprint
last_checkpoint
termination_reason
```

Required behavior:

- Controller restart, Codex context compaction or a lost local process handle must reattach through
  the persisted OpenCode session identity and event cursor.
- Reattachment must not duplicate a prompt, assignment, receipt or integrated diff.
- An expired harness-owned lease is recovered, safely redispatched or aborted with a partial
  receipt. Unrelated sessions are never treated as orphans.
- Session final text is untrusted; only normalized receipt, independent verification and
  reconciliation may advance the task.
- Runtime version is attested at dispatch and receipt. A compatible upgrade is allowed; an
  incompatible API/capability change pauses only the affected assignment for adapter recovery.

## 4. Parallel scheduler and isolation

The controller schedules the dependency DAG in waves:

- Parallelize only ready tasks whose owned paths and integration boundaries do not overlap.
- Every writer receives an isolated worktree or equivalent immutable baseline plus exclusive owned
  paths. A harness-owned writer is rejected before prompt dispatch when workspace identity,
  baseline SHA or ownership does not match.
- Read-only reviewers may share an immutable snapshot. They must never review a branch while its
  fingerprint is changing.
- Integration uses a deterministic merge queue. Every candidate is revalidated against the latest
  integrated HEAD before acceptance.
- Duplicate dispatch is prevented by an idempotency key over plan, amendment chain, assignment,
  baseline, ownership and acceptance criteria.
- Two writers requesting overlapping paths or the same exclusive subsystem cannot run together.
- Nested OpenCode fan-out is disabled by default. `ARTIFACT_HANDOFF` may use depth one only when
  AM-0006 permits it and the child budget/ownership is persisted.

Initial adaptive capacity for this repository:

```text
normal active sessions: 3
maximum burst sessions: 4
normal writer limit: 2
read-only review/discovery reserve: 1
```

The supervisor may reduce capacity for provider rate limits, memory/CPU pressure, integration
contention or repeated stale work. It may increase from three to four only when ownership is
disjoint and the evidence pipeline remains current.

## 5. Speed and context controls

- Dispatch the critical path first; do not parallelize work merely to fill capacity.
- Package plan anchors, approved amendment excerpts, owned paths, exact diff and failing evidence
  instead of forcing every session to reread the full plan or repository.
- Reuse a session only while its context remains bounded and unchanged reads provide real cache
  value. A context watermark or repeated unchanged tool calls checkpoints the assignment and starts
  a smaller continuation session.
- Targeted tests run per isolated slice. Independent full gates run on the integrated snapshot.
- Quality, security and final reconciliation remain serial terminal authorities; concurrency cannot
  convert missing, skipped, stale or unknown evidence into PASS.
- A slice that expands beyond five focus files, its owned subsystem or a maintainable diff budget
  must be split or receive an explicit independent maintainability review.

## 6. Evidence-complete verification

- Verification commands are collected independently so an early failure cannot hide typecheck,
  security, schema or other gate results.
- Invalid test fixtures are findings, not permission to weaken implementation requirements.
- Test expectations must bind to public behavior and adversarial invariants rather than mirror the
  current implementation.
- Review receipts bind the immutable snapshot, effective plan hash, evidence set, provider/model
  identity and shadow revision.
- Any integrated change after review makes the affected review stale and schedules a bounded
  re-review.

## 7. Acceptance criteria

1. Simulated controller restart and context compaction reattach to the same session and event cursor
   without duplicate dispatch.
2. A harness-owned session launched in the wrong worktree or against the wrong baseline is rejected
   before it can edit.
3. Two disjoint writer assignments execute concurrently; overlapping ownership is serialized.
4. Duplicate prompt, event and receipt delivery are idempotent.
5. A stable snapshot can be reviewed concurrently by independent read-only reviewers, and any later
   diff makes their receipts stale.
6. Provider/model/effort are observable and paid Flash high/max is preferred without globally
   prohibiting free or vision-capable fallbacks.
7. No harness action mutates or terminates unrelated OpenCode sessions or global configuration.
8. Compatible OpenCode upgrade is accepted with version attestation; incompatible capability drift
   is isolated to the affected adapter assignment.
9. A failed test command does not prevent collection of typecheck and remaining required evidence.
10. Context watermark, rate-limit backoff and capacity reduction preserve a resumable partial
    receipt and never produce `COMPLETED`.
11. Deterministic integration revalidates each parallel candidate against the newest integrated HEAD.
12. Final completion remains blocked until the immutable original plus the ordered approved
    amendment chain, including this amendment, reconciles to PASS on the certified main SHA.

## 8. Activation

This amendment is `OWNER_APPROVED_PENDING_ACTIVATION`. The next canonical migration must preserve
revision-45 history, activate the ordered chain
`original + AM-0001 + AM-0002 + AM-0003 + AM-0005 + AM-0006 + AM-0007 + AM-0008`, stale all
obsolete completion/review evidence, regenerate shadows through the engine and enter
`NEEDS_REMEDIATION`. It must not rewrite any earlier artifact.
