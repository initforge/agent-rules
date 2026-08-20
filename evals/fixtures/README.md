# Agent quality evaluation

Evidence-first evaluation for `agent-rules`. The corpus has been reorganized into four layers:

1. **Conformance tests** — deterministic routing and schema validation; runnable in PR CI without model calls.
2. **Runtime telemetry** — event-based telemetry aligned with OpenTelemetry GenAI semantic conventions.
3. **Controlled evaluations** — compare harness variants (no-harness, core, full, full-minus-one) under fixed conditions.
4. **Real outcome tracking** — multidimensional tracking: completion, requirement coverage, false PASS rate, owner correction rate, escaped regression, evidence completeness, rework loops, wall time, tokens, context, tools, subagents, changed files, test executions, acceptance.

No single composite score is the primary verdict.

## Directory layout

- `agent-quality-benchmark.json` — case definitions (preserved v1)
- `agent-quality-benchmark.schema.json` — corpus schema (preserved v1)
- `live-result.schema.json` — v1 live result schema (preserved)
- `telemetry.schema.json` — OTel GenAI-aligned telemetry schema
- `evaluation-result.schema.json` — multidimensional evaluation schema
- `live-fixtures.json` — fixture definitions (preserved)
- `fixtures/` — test fixture JSONL files (preserved)
- `compat/` — compatibility reader for v1 reports
- `../conformance/` — model-free conformance test module
- `../telemetry/` — telemetry collector and exporter
- `../controlled/` — controlled + native evaluation module
- `../outcomes/` — outcome tracking module

## Conformance (PR CI, no model calls)

```powershell
python automation/test-conformance.py
```

Runs corpus integrity checks, routing contract validation against the context graph, and fixture oracle coverage. No model calls, no external dependencies beyond the standard library.

## Full test suite

```powershell
python automation/test-agent-quality-benchmark.py
python automation/test-conformance.py
python automation/test-live-agent-adapter.py
```

## Telemetry

```powershell
python -c "from evals.telemetry.collector import TelemetryCollector; c = TelemetryCollector(); c.record(c.build_event('session.end', 'codex', 'gpt-5.6-terra', 'medium', 'main', 'test', 'abc123', 'PASS')); c.flush('events.jsonl')"
```

Telemetry events follow OpenTelemetry GenAI conventions where practical. Fields include `gen_ai.system`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.*`, plus platform, host version, effort, role, task, tools, context, subagent lifecycle, verification, and outcome. Unobservable fields remain null.

## Controlled evaluations

```powershell
python -c "from evals.controlled.controlled import compare_variants; from evals.fixtures.compat.reader_v1 import load_json, read_records; corpus=load_json('evals/fixtures/agent-quality-benchmark.json'); recs=read_records(['evals/fixtures/fixtures/live-valid.jsonl']); results=compare_variants(recs, corpus); print(f'{len(results)} evaluation(s)')"
```

Hold constant: repository SHA, task, environment, tool availability, budget, time limit, model snapshot.

## Native evaluation

Native runs go through the actual platform adapter and produce a capability receipt. Synthetic fixtures are never reported as empirical native results.

## Outcome tracking

Tracks multiple dimensions (never a single score):

- completion
- requirement coverage
- false PASS rate
- owner correction rate
- escaped regression
- evidence completeness
- rework loops
- wall time
- input/output/cached tokens
- context sources and estimated size
- tool calls/failures/retries
- subagent spawn and handoff
- changed files/lines
- test executions
- final acceptance

## Legacy commands (preserved)

```powershell
python automation/test-agent-quality-benchmark.py
pwsh automation/build-benchmark-runtime.ps1 -OutputRoot .agent/benchmarks/runtime -Force
python automation/test-live-agent-adapter.py
python automation/run-live-benchmark.py --mode native --cases live-advisory-no-mutation --output .agent/benchmarks/results/native-smoke.jsonl
$env:CODEX_API_KEY = '<process-scoped key>'
python automation/run-live-benchmark.py --mode ablation --cases live-advisory-no-mutation live-tiny-one-file live-plan-no-execute live-pasted-plan-no-pivot live-permission-allowed-denied live-scope-expansion --repeat 2 --reasoning-effort medium
python automation/test-agent-quality-benchmark.py --routing-only --output .agent/benchmarks/run/routing.json
python automation/collect-live-results.py <result.jsonl> --output .agent/benchmarks/run/live.jsonl
python automation/report-agent-quality.py --routing .agent/benchmarks/run/routing.json --live .agent/benchmarks/run/live.jsonl --trace .agent/trace.jsonl --output-dir .agent/benchmarks/run
```

## Compatibility

Old v1 reports are readable through `evals.fixtures.compat.reader_v1`:

```python
from evals.fixtures.compat.reader_v1 import read_v1_report, convert_v1_report
report = read_v1_report("path/to/v1/report.json")
converted = convert_v1_report(report)
```

Live records can be converted individually:

```python
from evals.fixtures.compat.reader_v1 import convert_v1_live_record
new_format = convert_v1_live_record(old_record)
```

## Evidence boundary

- Store run artifacts under `.agent/benchmarks/`; they are advisory and gitignored.
- Persistent ablation homes never contain credentials. Ablation execution accepts only `CODEX_API_KEY`; copying `auth.json` is unsupported because refresh-token rotation can invalidate the active local session.
- `native` uses the current signed-in Codex home without copying it, runs `full` only, keeps the installed harness enabled, and confines artifacts to `.agent/benchmarks/`. It proves current-runtime behavior but is never baseline/core evidence.
- `ablation` uses credential-free isolated homes and a process-scoped `CODEX_API_KEY` to compare baseline/core/full.
- The runner checkpoints validated records after every completed variant so an interrupted triplet retains partial evidence without being misreported as comparable.
- Do not store chain-of-thought, secrets, full tool payloads, or sensitive prompts.
- `fixtures/live-valid.jsonl` uses `evidence_kind=synthetic`; reports exclude it from empirical metrics.
- Benchmark findings do not edit or promote rules automatically.
- Route fixtures are tests, not a second runtime trigger source.
