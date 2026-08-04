# Ledger: P3-native-mode — safe current-Codex smoke lane
tier_used: L2

## CONTEXT
- Baseline done: isolated ablation runner, verifier, six executable fixtures and empirical result protocol.
- Owner decision: add native Codex testing without changing installed runtime or global system state.

Slice ID: P3-native-mode
Scope IN: live benchmark runner mode selection, contracts, benchmark docs, ignored native run artifacts
Scope OUT: global Codex configuration/runtime edits, auth copying, baseline/core claims from native evidence, commits/push/deploy

- [x] AC1 native mode uses current Codex auth/context read-only and permits only full variant
  verify: `python automation/run-live-benchmark.py --self-test`
  evidence: `PASS: live benchmark runner contracts`; native defaults to full and rejects baseline/core
- [x] AC2 native mode is ephemeral, ignores user config, and confines writes to generated fixture workspaces
  verify: `python automation/test-live-agent-adapter.py --native-contract`
  evidence: `PASS: native mode is full-only and artifact-confined`; command contract includes `--ephemeral --ignore-user-config`; auth artifact scan=0
- [x] AC3 ablation mode retains isolated baseline/core/full and API-key gate
  verify: `python automation/test-live-agent-adapter.py --credential-contract`
  evidence: `PASS: credentials are environment-only; no auth file is copied`; ablation default remains baseline/core/full
- [x] AC4 native smoke executes through the signed-in Codex CLI and passes independent verification
  verify: `python automation/run-live-benchmark.py --mode native --cases live-advisory-no-mutation --output .agent/benchmarks/results/native-smoke.jsonl`
  evidence: `codex-cli-native`, full, outcome PASS, scores 4/4/4/4/4, workspace expected=[] actual=[], Codex login remains ChatGPT
- [x] AC5 docs and structural validation describe native versus ablation without overstating comparability
  verify: `python automation/test-agent-quality-benchmark.py; powershell -NoProfile -ExecutionPolicy Bypass -File automation/03-validate-context.ps1`
  evidence: benchmark 41 cases PASS; routing 20/20; Context validation PASS; mirror parity and harness health PASS
- [x] AC6 completion gate and in-scope miss sweep pass
  verify: `& .\automation\audit-slice-ledger.ps1 -LedgerPath .agent/plans/evidence-first-20260721/ledger/P3-native-mode.md -Strict`
  evidence: pre-commit audit exit 0; git diff-check clean; no TODO/FIXME/pending in source scope
