# Default operating policy

## Execution protocol

- Each slice belongs to one subsystem, at most five focus files, at most eight acceptance criteria.
- Repo must return to build-green before the next dependent slice.
- Independent batches may run in parallel only with non-overlapping ownership and workspace/worktree isolation.
- Dense dependencies or shared ownership require serialization.
- Release default: `maxDepth = 1`; controller enforces `maxWorkers`, token, cost, and time budgets.

## Model routing

- Provider-neutral role/risk tiers: economical-worker, economical-orchestrator, critical-reasoner, vision-planner, independent-reviewer.
- Escalate only when objective triggers fire: unresolved ambiguity, conflicting evidence, plan validation failure, repeated remediation failure, security boundary uncertainty.

## Evidence policy

- Worker receipts are not trusted for self-attestation.
- Verification claims require independent reducer result: `PASS | FAIL | BLOCKED | UNVERIFIED`.
- No manual checklist serves as evidence when a verifier exists for that dimension.

## Remediation

- Two same-error remediations require escalated model or reviewer tier.
- Any change after review makes the review stale.
- `EXTRA` changes must roll back or become owner-approved amendments.
- Loop ends only at `PASS` or a real blocker requiring owner/external dependency.
