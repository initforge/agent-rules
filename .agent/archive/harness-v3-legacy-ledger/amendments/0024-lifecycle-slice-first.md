# AM-0024 — Lifecycle Slice First: Owner Delta Remediation

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This amendment is additive after AM-0022. It captures the post-AM-0022 owner delta
from the current handoff: remediation of the HASH-001 effective-contract hash mismatch
finding and the lifecycle-slice-first execution model. It does not rewrite AM-0022 or
any prior amendment. All prior artifacts remain immutable lineage evidence.

Prior ledger-effective amendment: `AM-0022`
Prior effective-plan SHA-256: `b99e044b21480ad796c54b48762a4c4067726aacaa47d751013d49468751ed5f`
Prior canonical shadow revision: `61`

## 1. Preservation and precedence

The effective contract is:

```text
immutable original
→ ordered effective amendments AM-0001…AM-0022
→ explicit concept-level supersession
→ carried non-conflicting capabilities and backlog
→ AM-0024 additive delta
→ compiled execution contract
```

AM-0024 supersedes only the execution-policy details named below. All other
requirements from AM-0022 and prior amendments remain effective.

## 2. Additive requirements

### M11-R65 — Lifecycle slice first

The canonical amendment lifecycle processes slices in dependency order. Slice S1
(collections, contracts, current pointer) executes before S2 (engine runtime) and
S3 (Vitest governance). No slice begins until its dependencies are satisfied and
their receipts are verified. The dirty candidate is preserved at every step; no
status transition occurs without a receipt-backed proof.

Acceptance:

1. S1 completes before S2 and S3 begin.
2. S2 and S3 are skipped (not started) when S1 is blocked.
3. A slice with no receipt-backed proof cannot advance to done.
4. The dirty candidate state is preserved across slice boundaries.

### M11-R66 — HASH-001 remediation via canonical generator

The HASH-001 finding (effective contract on-disk SHA-256 differs from lineage
capture) is remediated exclusively through the canonical bounded-repair API
(`boundedRepair` in `ledger-activation.ts`). No manual ledger or pointer edit
is permitted. The generator verifies the original, recomputes the effective
identity, stages all shadow files atomically, and advances the current pointer
via `commitCurrentPointer` generation compare-and-swap.

Acceptance:

1. The canonical generator processes the delta without hand-editing the ledger.
2. The current pointer advances by exactly one generation.
3. All referenced identities are reopen-verified after the commit.
4. The effective contract on-disk SHA-256 matches the lineage capture after repair.

### M11-R67 — Dirty candidate preservation

The dirty candidate (in-progress work with ready slices and open ACs) is preserved
as content-addressed tracked/index/untracked evidence before any canonical
activation. The candidate is never modified, deleted, or overwritten by the
activation process. The candidate remains the authoritative source of truth for
any rollback.

Acceptance:

1. The dirty candidate exists before and after canonical activation.
2. Activation never mutates the candidate.
3. Rollback restores the candidate to its pre-activation state.

## 3. Activation contract

This amendment (AM-0024) is processed by the canonical bounded-repair generator only:

1. Verify immutable original and AM-0001…AM-0022 against ledger hashes.
2. Verify AM-0024 raw bytes and captured SHA-256.
3. Compare the expected prior effective identity and shadow revision.
4. Append AM-0024 after AM-0022 through the canonical atomic lifecycle API.
5. Recompute effective identity and mark affected evidence/reviews stale.
6. Compile R65–R67 with plan anchors, ACs, evidence contracts, and review bundles.
7. Regenerate every projection/shadow atomically and verify their hashes.
8. Advance `.agent/current.json` by generation compare-and-swap.
9. Retain `NEEDS_REMEDIATION` until fresh evidence closes the effective backlog.

No amendment, pointer, schema, prompt, or source-file presence is implementation
or terminal evidence.
