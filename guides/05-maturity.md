# Maturity ladder

Measurable levels for agent-rules harness health. Structural checks run from `automation/03-validate-context.ps1`; behavior metrics are advisory from `<repo>/.agent/trace.jsonl`.

## M0 — Bare

No rules, skills, or automation. Validation fails.

## M1 — Policy scaffolding

Criteria (structural):
- `rules/manifest.yaml` load_order complete
- Core token budget within manifest limit
- Required skills and guides present
- Trigger audit 23/23 pass

## M2 — Durable advisory layer

Criteria (structural):
- M1 pass
- `rules/05-critical-thinking.md` and `rules/25-task-lifecycle.md` present
- Tombstone guard at `.agent/tombstones/` (via `07-import-reviewed-changes.ps1`)

Criteria (advisory, target repo):
- `.agent/trace.jsonl` exists for repos with normal/high-risk work
- Trace entries include `lane`, `status`, `friction`

## M3 — Evolution-ready

Criteria (structural):
- M2 pass
- `context-evolution-protocol` references `.agent/trace.jsonl` as friction signal source

Criteria (advisory):
- Repeated friction in trace log leads to reviewed promotion (human gate)
- No stale `plans/` references in canonical docs

## How to check

```bash
pwsh automation/03-validate-context.ps1   # structural M1–M3
pwsh automation/04-verify-mirrors.ps1      # mirror parity
```

Behavior metrics (advisory WARN only when `.agent/trace.jsonl` exists in the working repo).
