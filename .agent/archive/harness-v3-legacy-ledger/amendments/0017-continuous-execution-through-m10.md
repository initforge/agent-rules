# AM-0017 — Continuous execution through M10

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

## 1. Owner decision

Execution continues durably through M8, M9.5, and M10. Passing M8 records,
announces, installs, and dogfoods the exact M8 artifact, then immediately
dispatches dependency-ready M9.5 work. Passing M9.5 immediately dispatches
dependency-ready M10 work. Neither milestone is a user handoff or completion.

This amendment supersedes only any clause that pauses or stops execution after
M8. Every AM-0015 quality, evidence, release, history, installation, dogfood,
security, review, and milestone gate remains effective without weakening.

Execution may pause only for a genuine external blocker already permitted by
the effective plan. The durable run remains active until fresh M10
reconciliation permits `HARNESS_V3_10_OF_10_COMPLETE`.

## 2. Activation contract

Activation appends AM-0017 after AM-0016, recomputes the effective identity,
marks prior evidence and review claims stale, regenerates every shadow through
the canonical atomic transaction, and retains `NEEDS_REMEDIATION` until fresh
evidence satisfies the unchanged gates.

## 3. Acceptance criteria

1. Only pause/stop-after-M8 semantics are superseded.
2. Every AM-0015 quality gate remains effective.
3. M8 and M9.5 milestone notifications cannot complete or pause the run.
4. Dependency-ready execution continues automatically through M10.
5. Activation is ordered after AM-0016 and recomputes canonical identity.
6. Prior evidence, reviews, certification, and reconciliation become stale.
7. Shadows are regenerated atomically from the canonical ledger.
8. Canonical execution state remains `NEEDS_REMEDIATION`.
