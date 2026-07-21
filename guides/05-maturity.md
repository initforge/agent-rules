# Maturity ladder

Measurable levels for agent-rules harness health. Structural checks run from `automation/03-validate-context.ps1`; behavior metrics are advisory from `<repo>/.agent/trace.jsonl`.

## M0 — Bare

No rules, skills, or automation. Validation fails.

## M1 — Policy scaffolding

Criteria (structural):
- `rules/manifest.yaml` load_order complete
- Core token budget within manifest limit
- Required skills and guides present
- All trigger-audit fixtures pass
- `automation/audit-ui-routing.ps1` pass (via `03-validate-context`)

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
- `rules/26-slice-completion-gate.md` remains lazy but is reachable from finish/plan slice procedures
- `skills/finish-to-completion/references/slice-gate-protocol.md` present

Criteria (advisory):
- Repeated friction in trace log leads to reviewed promotion (human gate)
- No stale `plans/` references in canonical docs
- Repos with multi-phase execution use `.agent/plans/<plan-id>/ledger/` with verify cmd per AC (SGP §11)

## M4 — Empirically measured

Criteria (structural):
- Benchmark corpus and schemas validate
- Existing route conformance plus evidence routing benchmark pass
- Live-result collector rejects invalid/privacy-sensitive records
- Quality reporter emits JSON and Markdown without auto-promoting rules

Criteria (empirical):
- Real live results exist under `.agent/benchmarks/`
- Comparable runs record model, effort, platform, tools and evidence
- Baseline/core/full claims use comparable task fixtures
- Synthetic fixtures are never counted as behavioral evidence
- Adapter operational status requires at least one complete empirical triplet
- A `KEEP` strength decision requires the corpus thresholds (currently 6 comparable cases and 12 triplets), not a single smoke case
- Native current-runtime smoke is useful operational evidence but cannot be combined with isolated baseline/core runs for causal comparison

## How to check

```bash
pwsh automation/03-validate-context.ps1   # structural M1–M4
pwsh automation/04-verify-mirrors.ps1      # mirror parity
python automation/test-agent-quality-benchmark.py
```

Behavior metrics remain advisory. M4 empirical status requires real live runs; structural fixture PASS alone does not qualify.
