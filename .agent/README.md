# `.agent/` — V3 execution authority

This directory contains durable plan authority, evidence pointers, and bounded
execution history. The repository is the source of truth; generated runtime
output and raw session telemetry are never promoted to authority.

## Authority order

1. `.agent/current.json` is the only active-plan pointer and is CAS-protected.
2. `.agent/ledger/<plan-id>.json` is the canonical plan projection consumed by
   the Control Plane and runtime installer.
3. `.agent/plans/<plan-id>/requirements.yaml` is the flat requirement ledger.
4. `journal.jsonl`, evidence, and progress are projections/receipts and cannot
   grant PASS by themselves.

Every executable task, run, lease, and result must preserve `work_id`,
`execution_generation`, `task_id`, and `spec_revision` when those identities are
available. A new owner goal supersedes old eligibility; stale results are kept
as history and never reconciled into the current generation.

## Layout

```text
.agent/
  current.json                 active pointer
  ledger/                      canonical plan projections
  plans/<plan-id>/             immutable plan + requirements + bounded changes
  runs/                        disposable run evidence
  artifacts/                   generated support receipts
  archive/                     retained history
  research/                    durable findings
  tombstones/                  retired surfaces
  tmp/                         ignored scratch output
```

Active requirements are testable and live in `requirements.yaml`. Scope changes
must add a bounded numbered change and preserve supersession links. No worker
prose, progress note, generated artifact, or external tool response is an
independent authority.
