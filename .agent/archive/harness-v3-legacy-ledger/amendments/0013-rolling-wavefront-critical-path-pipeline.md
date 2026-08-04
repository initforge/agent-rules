# AM-0013 — Rolling wavefront, continuous ready queue, and pipeline convergence

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This is an additive amendment to the immutable original plan and the ordered
approved amendment chain. It supplements AM-0012 and does not rewrite
`original.md`, AM-0012, or any historical artifact.

Immutable original SHA-256:
`c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`

AM-0012 SHA-256:
`2147aa9631fab0aab10a1e81b7339ba1b1b420d57080d2ef99bf2a88674b41a2`

## 1. Owner decision

The word “wave” is a reporting and grouping concept, not a completion barrier.
The harness must not wait for every task in a logical wave before dispatching
tasks whose dependencies are already satisfied.

The canonical scheduler is an event-driven rolling wavefront:

```text
receipt / finding / integration event
→ update DAG and semantic conflict graph
→ unlock newly-ready requirements
→ dispatch the maximum safe conflict-free set immediately
→ start focused test/review pipeline
```

This amendment optimizes elapsed time and critical-path length. It never weakens
verification, review, reconciliation, security, CI or release gates.

## 2. Continuous ready queue

The engine must maintain a durable ready queue keyed by:

- Requirement and acceptance-criterion IDs.
- Dependency completion.
- Semantic conflict leases.
- Risk and critical-path priority.
- Model/capability availability.
- Resource estimate and current backpressure.
- Review and integration capacity.

When one assignment is accepted, only its successors that have all required
predecessors become ready. They dispatch immediately; unrelated tasks continue
without waiting for the rest of the previous group.

The scheduler may pause a task only for a real dependency, conflict lease,
resource backpressure, provider unavailability or required global gate.

## 3. Logical wave versus blocking barrier

### Non-blocking logical wave

Tasks may be grouped for reporting, cost accounting and owner visibility, but:

- A slow task does not block independent successors.
- A failed task does not block independent branches.
- A reviewer delay does not block unrelated verification.
- A candidate accepted on one branch can enter the integration train while
  another candidate is still being repaired.

### Legitimate blocking barrier

The engine may wait only for:

- Immutable plan/amendment activation before source tasks bind to it.
- Shared public-contract/schema freeze before dependent writers start.
- A semantic conflict over the same contract or integration boundary.
- Integrated security, architecture, reconciliation, CI or release gates.

Every barrier must carry a dependency reason and expected successor set; “wave
not finished” is not a valid reason.

## 4. Pipeline scheduling

The following lanes run concurrently whenever their snapshots are stable:

1. Implementation writers on exclusive branches/worktrees.
2. Focused unit/type/schema/test shards.
3. Read-only correctness, security, maintainability and platform reviewers.
4. Evidence collection and receipt normalization.
5. Rebase preparation for accepted candidates.

Exactly one integration owner performs the final import. Integration itself is a
continuous merge train:

```text
ACCEPT candidate
→ rebase on newest integrated HEAD
→ run affected checks
→ invalidate stale affected evidence
→ integrate
→ unlock successors
```

The full integrated gate remains serial and authoritative.

## 5. Critical-path policy

At each event, calculate:

- Longest remaining dependency chain.
- Number of ready independent tasks.
- Expected task duration and verification duration.
- Integration/review queue time.
- Resource and provider capacity.

Priority is:

1. Ready tasks on the critical path.
2. Tasks that unlock the largest independent successor set.
3. High-risk contract/security tasks that would otherwise invalidate many
   branches.
4. Cheap independent tasks that keep reviewers and integrators productive.

Do not dispatch a task merely to fill a slot if it cannot shorten the critical
path or provide useful independent evidence.

## 6. Retry and redesign convergence

For an identical failure signature on the same assignment:

- Attempt 1: bounded repair by the current writer.
- Attempt 2: bounded repair with an independent reviewer diagnosis.
- Attempt 3: mandatory redesign/escalation.

Attempt 3 must not be another unconstrained patch by the same writer. It must
choose at least one:

- Split the component into bounded modules with explicit contracts.
- Use a fresh writer identity.
- Generate two isolated candidate implementations and select one by review.
- Escalate to a stronger available model/reviewer.

If the requested stronger model is unavailable, the engine records the
unavailability and still changes writer identity, task shape or design. It must
not silently turn unavailable escalation into endless same-writer retries.

## 7. Resource and reviewer pipeline limits

The ready queue may grow larger than active concurrency. Active concurrency is
adaptive, but the scheduler must keep separate pools:

- Native agent slots.
- Source-writer slots.
- Heavy test/browser slots.
- Read-only review slots.
- One integration slot.

RAM, CPU, provider quota, test runner and review throughput reduce only the
affected pool. A heavy browser test must not prevent lightweight read-only
auditors from progressing.

## 8. Receipt and freshness

Every rolling dispatch and unlock records:

- Triggering receipt/finding ID.
- New ready requirement IDs.
- Conflict leases considered.
- Resource decision.
- Candidate baseline and effective-plan hash.
- Review/test snapshot hash.

If an integration changes a shared contract, affected queued work is revalidated
or marked stale. Unaffected ready work continues.

## 9. Acceptance criteria

1. A slow task in a logical wave does not block an independent successor.
2. An accepted candidate immediately unlocks eligible downstream work.
3. A failed candidate does not block independent branches.
4. The scheduler records a valid dependency/conflict reason for every wait.
5. “Wave incomplete” alone is rejected as a scheduling reason.
6. Focused tests and read-only reviews run while independent writers continue.
7. Accepted candidates enter a continuous deterministic integration train.
8. Shared-contract changes invalidate only affected downstream evidence/work.
9. The third identical failure forces redesign, fresh writer, candidate comparison
   or explicit escalation.
10. Missing escalation model availability never creates an infinite same-writer
    loop.
11. Critical-path and ready-queue metrics are persisted and visible.
12. Final global gates remain serial and cannot be bypassed by rolling progress.

## 10. Activation

Before the next source wave:

1. Verify the original and all amendment hashes.
2. Append AM-0013 after AM-0012 in the ordered chain.
3. Recompute and persist the effective-plan identity.
4. Invalidate stale evidence and regenerate shadows atomically.
5. Recompile the full effective plan into a rolling ready queue.

No completion claim is valid merely because this amendment exists.
