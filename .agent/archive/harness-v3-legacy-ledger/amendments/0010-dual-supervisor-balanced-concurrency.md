# AM-0010 — Dual-supervisor balanced concurrency

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This amendment supplements the immutable original plan and all earlier approved
amendments. It does not rewrite `original.md`.

## Owner decision

The normal maximum is two durable supervisors:

1. **Supervisor A — implementation**
   - Owns implementation waves.
   - May run at most two writers concurrently.
   - Writers must have disjoint owned paths.

2. **Supervisor B — QA, review and integration**
   - Primarily read-only.
   - Owns acceptance review, evidence validation, integration preparation and
     reconciliation.
   - A reviewer must not review its own output.

A third supervisor is allowed only as a temporary burst for a fully independent
subsystem such as Control Plane visual QA. It must not remain resident after the
bounded burst.

## Mandatory isolation

- Every supervisor has a separate worktree, owned-path set and ledger namespace.
- Exactly one integration owner may import accepted changes.
- Two writers must never mutate overlapping paths.
- All supervisors share a content-addressed context/evidence cache so the
  effective plan, repository facts and accepted receipts are not reread in full.
- RAM, CPU and token backpressure automatically reduce concurrency when a
  configured threshold is exceeded.
- Every wave returns a receipt and passes reconciliation before integration.
- No supervisor may claim `PASS` from a self-review.

## Operating default

Two supervisors are the balanced default for the current machine. Three
always-on supervisors are prohibited because coordination, RAM and token cost
can exceed the throughput benefit.

