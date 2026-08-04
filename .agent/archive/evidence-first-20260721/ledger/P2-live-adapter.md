# Ledger: P2-live-adapter — empirical Codex runner
tier_used: L2

## CONTEXT
- Baseline done: benchmark corpus, deterministic runner, collector, report protocol, schemas and validation.
- Blocker to close: no isolated live-agent execution adapter or independently verified empirical triplet.
- Credential policy: never copy, print, or commit credential material; non-interactive execution requires `CODEX_API_KEY` in the process environment.

Slice ID: P2-live-adapter
Scope IN: automation live benchmark runtime builder, runner, verifier, fixtures, schemas, tests, docs, validation wiring
Scope OUT: canonical runtime installation, editing global Codex runtime, committing/pushing/deploying, automatic rule promotion

- [x] AC1 isolated baseline/core/full homes are reproducibly built without credential copies
  verify: `powershell -NoProfile -ExecutionPolicy Bypass -File automation/build-benchmark-runtime.ps1 -OutputRoot .agent/benchmarks/runtime -Force`
  evidence: `PASS: isolated benchmark runtimes built`; all three persistent homes checked without auth.json
- [x] AC2 live runner invokes codex exec with comparable model/effort/tool settings and captures machine-readable artifacts
  verify: `python automation/run-live-benchmark.py --self-test`
  evidence: `PASS: live benchmark runner contracts`; real triplet produced events, response, verifier and result artifacts
- [x] AC3 independent verifier scores workspace state and command evidence without trusting agent self-report
  verify: `python automation/verify-live-workspace.py --self-test`
  evidence: `PASS: independent live workspace verifier`; unexpected-file negative case rejected
- [x] AC4 credential handling is environment-only and never copies local session files
  verify: `python automation/test-live-agent-adapter.py --credential-contract`
  evidence: `PASS: credentials are environment-only; no auth file is copied`
- [x] AC5 at least one baseline/core/full empirical triplet is collected when authentication works
  verify: `python automation/report-agent-quality.py --routing .agent/benchmarks/results/routing.json --live .agent/benchmarks/results/live-normalized.jsonl --output-dir .agent/benchmarks/results/report`
  evidence: 3 empirical PASS records, 1 comparable triplet, average score 4.0 each; recommendation correctly `INSUFFICIENT_EVIDENCE`
- [x] AC6 benchmark contracts and repository validation remain green
  verify: `python automation/test-agent-quality-benchmark.py; python automation/test-live-agent-adapter.py; powershell -NoProfile -ExecutionPolicy Bypass -File automation/03-validate-context.ps1`
  evidence: 41 contracts PASS, routing 20/20, 6 executable oracle fixtures, Context validation PASS
- [x] AC7 context evolution and completion gates pass with no unresolved in-scope TODO
  verify: `& .\automation\audit-slice-ledger.ps1 -LedgerPath .agent/plans/evidence-first-20260721/ledger/P2-live-adapter.md -Strict`
  evidence: mirror parity PASS; harness health PASS; pre-commit audit exit 0; diff-check and in-scope miss-sweep clean
