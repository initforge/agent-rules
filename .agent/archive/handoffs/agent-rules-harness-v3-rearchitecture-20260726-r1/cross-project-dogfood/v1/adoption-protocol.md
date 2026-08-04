# HV3 Dogfood Preview Adoption Protocol v1

## Truth boundary

This bundle applies AM-0019 through AM-0021 operating behavior before the full
Harness product is installed. Record the state as:

```text
PROMPT_ENFORCED_PREVIEW
PARTIALLY_ENGINE_ENFORCED
```

Never report `FULL_HARNESS_ENFORCED`, `LATEST_HARNESS_INSTALLED` or equivalent.

## Candidate freeze before native swarm fan-out

Both bound projects contain a large dirty candidate not represented by their
Git HEAD. Ordinary worktrees from HEAD would therefore execute and review the
wrong code.

Before dispatching writers:

1. Stop new mutations long enough to capture a stable candidate epoch.
2. Record HEAD/tree, tracked diff SHA, index diff SHA, untracked manifest SHA,
   original-plan SHA and legacy-ledger SHA.
3. Secret-scan untracked/build-critical files before any Git object or archive
   materialization. Exclude credentials, databases, caches and runtime output.
4. Prefer a reversible local checkpoint commit on a private integration branch
   when existing project authority permits local commits. Never push it merely
   for dogfood adoption.
5. Otherwise create a content-addressed patch plus allowlisted untracked-source
   archive and materialize isolated candidate copies; do not create worktrees
   from the stale HEAD.
6. Bind every worker base to the same candidate fingerprint.
7. Freeze the prior schema-v4 ledger as `LEGACY_CANDIDATE` evidence. Preserve
   bytes and hash; do not promote its self-claims to PASS.
8. Adopt one additive project-local preview amendment and use a separate
   namespace or canonical migration for new receipts/shadows.

## Swarm contract

Machine-wide target before global broker certification:

| Active slots | Writers | Verifiers | Reviewers | Integration owner |
|---:|---:|---:|---:|---:|
| 8 normal | 4 | 2 | 1 | 1 |
| 10 burst | 5 | 2 | 2 | 1 |

The ceiling is shared across `agent-rules`, `pos-ops` and `mini-toeic.score`.
Use fewer only for dependency, conflict, capability or observed resource reasons.

Each writer owns an isolated branch/worktree/candidate copy and exact path plus
semantic-resource leases. Verification and review are read-only, independent
and bind a stable candidate epoch. One integration owner merges fresh accepted
candidates in deterministic dependency order.

## Evidence and reporting

- Workers return candidates, not verdicts.
- Raw output stays in content-addressed evidence and main receives bounded
  receipts.
- Existing reports and ledger claims are revalidated from source/raw evidence.
- T2/T3 claims use specialist adversarial review.
- Post-review changes stale affected receipts.
- Final project status and dogfood/enforcement status are reported separately.

