# AM-0018 — Durable Autopilot

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

## 1. Owner decision

The engine operates a formal durable autopilot for M8→M9.5→M10.
The autopilot is the activation-side contract that AM-0017's continuous
execution depends on.

1. Engine auto-detects M8 completion (all M8 gates satisfied, fresh
   reconciliation permits transition).
2. On M8 completion, engine automatically dispatches dependency-ready
   M9.5 work without human intervention.
3. On M9.5 completion, engine automatically dispatches dependency-ready
   M10 work without human intervention.
4. Autopilot is self-healing: interrupted activation or dispatch recovers
   atomically from the canonical journal.
5. Autopilot maintains a verifiable proof chain: every milestone dispatch,
   recovery, and completion is recorded in the canonical audit event log
   with cryptographic identity continuity.
6. No milestone handoff, notification, or pause interrupts the autopilot
   between M8 and M10. Only a genuine external blocker already permitted
   by the effective plan may pause execution.
7. The autopilot continues until fresh M10 reconciliation permits
   `HARNESS_V3_10_OF_10_COMPLETE`.

This amendment adds the autopilot contract.

### Preserved owner contracts

This amendment supersedes no existing quality, evidence, release, security,
review, or milestone gate. Every owner contract from AM-0001 through AM-0017
that does not conflict with the autopilot contract below remains fully
effective:

- AM-0001: Execution authorization — intact.
- AM-0002: Adaptive execution, verification topology, threat matrix,
  bookkeeping, communication, model routing, portable handoff — intact.
- AM-0003: Owner closure decisions — intact.
- AM-0005: Terminal convergence and control plane redesign — intact.
- AM-0006: Three-mode orchestration and OpenCode federation — intact.
- AM-0007: Cost-aware DeepSeek routing and release convergence — intact.
- AM-0008: Parallel OpenCode supervision and speed — intact.
- AM-0009: Session-scoped child pool and cache — intact.
- AM-0010: Dual-supervisor balanced concurrency — intact.
- AM-0011: Claude first-class host and permanent convergence — intact.
- AM-0012: Native swarm artifact handoff and fitness closure — intact.
- AM-0013: Rolling wavefront critical-path pipeline — intact.
- AM-0014: Clustered native swarm and resource safety — intact.
- AM-0015: Progressive quality release and main history consolidation
  — intact; only pause/stop-after-M8 semantics superseded by AM-0017.
- AM-0016: Required host certification — intact.
- AM-0017: Continuous execution through M10 — intact; this amendment
  supplies the activation-side autopilot contract that AM-0017 depends on.
  No clause of AM-0017 is superseded.

## 2. Activation contract

Activation appends AM-0018 after AM-0017, recomputes the effective
identity, marks prior evidence and review claims stale, regenerates
every shadow through the canonical atomic transaction, and retains
`NEEDS_REMEDIATION` until fresh evidence satisfies the unchanged gates.

Activation MUST:
a) Use the canonical ledger authoritative original plan SHA256
   `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`
   as the composition root. Do not silently substitute any working-byte
   or fixture-only hash.
b) Read prior effective identity from the canonical ledger
   (`e08dd77f091018755e80a56fa493a430d34c316a32726b9768c22e207e1584bc`,
   revision 52).
c) Post shadow revision to >52 (i.e., revision 53).
d) Persist ledger and shadows atomically via the canonical engine
   `boundedRepair` or `activateLedger` API. Generation directory,
   journal, lock, backup, and atomic rename must follow the canonical
   durable transaction protocol defined in `ledger-activation.ts`.
e) Call `staleEvidence()` to mark every assignment, review receipt,
   evidence claim, certification, and reconciliation bound to the prior
   identity as stale with `PENDING_FRESH_REVIEW`.
f) Throw on any shadow mismatch — silent acceptance of a hash mismatch
   is a security fault.

## 3. Acceptance criteria

1. Engine auto-detects M8 completion from canonical reconciliation.
2. Engine dispatches M9.5 work on M8 completion without handoff.
3. Engine dispatches M10 work on M9.5 completion without handoff.
4. Interrupted dispatch recovers atomically from journal (self-healing).
5. Every milestone dispatch and completion is recorded in audit events.
6. No pause or notification between milestones; external-blocker-only.
7. Engine maintains cryptographic identity continuity across dispatches.
8. Autopilot remains active until `HARNESS_V3_10_OF_10_COMPLETE`.
9. Activation is ordered after AM-0017 and recomputes canonical identity.
10. Prior evidence, reviews, certification, and reconciliation become stale.
11. Shadows are regenerated atomically from the canonical ledger.
12. Canonical execution state remains `NEEDS_REMEDIATION`.
13. Activation uses only the canonical ledger original SHA
    `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`;
    any fixture-only hash is rejected.
14. Prior effective identity `e08dd77f091018755e80a56fa493a430d34c316a32726b9768c22e207e1584bc`
    at revision 52 is confirmed before activation; mismatch aborts.
15. Post-activation shadow revision is exactly 1 greater than revision 52
    (i.e., 53). Any other value fails.
16. All prior assignments, review receipts, evidence claims,
    certifications, and reconciliations bound to the prior identity are
    marked `stale` with `ns0_status: PENDING_FRESH_REVIEW`. Verified
    by projection.
17. Every shadow file hash post-activation matches the ledger's
    `shadow_hashes` entries. A single mismatch throws an error;
    silent tolerance is prohibited.
18. `effective_plan_identity.sha256` post-activation differs from the
    prior identity and is computed via `computeCanonicalEffectivePlanIdentity`
    from original + AM-0001..AM-0018 approved amendments in order.
19. Activation atomically persists both ledger and all shadow files via
    canonical generation/journal/commit protocol. Partial write is
    impossible; rollback restores exact prior bytes.
20. Activation test (`ledger-activation.test.ts` or sibling) demonstrates
    all of the above with deterministic golden assertions.
