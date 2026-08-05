# Handoff — agent-rules developing HEAD

**Date:** 2026-08-05
**Branch:** `developing`
**Remote:** `origin/developing` (pushed, 15 commits ahead of `7bee868`)
**Head:** `1404922` (docs: P8 — env-gap closure)

## What landed (P0–P8)

| Slice | Title | Evidence |
|---|---|---|
| P0 | fix(control-plane): P3c flaky browser-qa | browser-qa 19/19 (was 15/19) |
| P1a | feat(engine): VerificationProfile types | runner-profile.test.ts 16/16 |
| P1b | feat(engine): VerificationEngine class | runner-verifier.test.ts 17/17 |
| P1c | refactor(engine): loop delegates verification | engine 1446 pass / 37 pre-existing fail |
| P2a | feat(engine): MCP servers materialised | runner-mcp-config.test.ts 9/9 |
| P2b/c | feat(engine): Playwright / browser-script / mcp-tool-call / visual-diff | runner-verifier.test.ts 17/17 |
| P2d | feat(engine,cli): live_verify + verify-task subcommand | CLI smoke PASS |
| e2e | feat(engine): manual-e2e demo (Chrome opens) | `.agent/artifacts/e2e-manual/demo.png` 12 KB |
| P3a | refactor(engine): delete claim-registry.ts | 8/12 test (4 skip real-ledger) |
| P4 | feat(engine,docs,schema): SS-13 → VERIFIED + schema | verification-profile-schema.test.ts 12/12 |
| P5 | docs,evals: SS-15/R-027 → VERIFIED | long_task 15/15 + adversarial |
| P6 | feat: 5fedu parity + claude build + SHA discovery | 5fedu conformance 3/3 + 6 runtime-builds |
| P7 | docs: 7-axis self-admin review | docs/reports/p9-final-review.md |
| P8 | docs: env-gap closure | jsonschema + mirror PASS |

## What is NOT landed (deferred)

| Item | Reason |
|---|---|
| **P3b** `candidate-epoch.ts` (447 lines) deletion | 8 test files import `candidateEpochHash`, `CandidateEpoch`, `bindEvidence`, `snapshotCandidateEpoch`; deletion requires inlining into 5+ engine modules plus CLI `verify.ts`. Out of scope for one safe big-bang commit. |
| **P3c** `terminal-gate.ts` (996 lines) deletion | Largest of the 4 modules. CLI `plan.ts` uses `evaluateM11Terminal`, `finalizeM11`, `M11_TERMINAL_TOKEN`; control-plane `c4.ts` uses `verifyTerminalGate`; engine-internal `verifyMilestoneGate`/`assertWorkLedger`/`assertCertificationAttestation`. |
| **P3d** `m11-terminal-evidence.ts` (286 lines) deletion | `loadM11TerminalEvidenceEnvelope` → inline into CLI `plan.ts`; `atomicLedgerWrite` → inline. |
| **P10** SS-12 / SS-17 / SS-20 / SS-21 / R-038 | Owner can request these as follow-up slices. None block the headline P2 closure. |

## User headline (CLOSED)

> "agents khi test t đã cố gắng kết nối MCP chrome CDP và playwright rồi vì vậy nó phải mở chrome ra và test trước mặt cho t xem"

CLOSED. The harness now:
1. Spawns `claude`/`codex`/`opencode` with `--mcp-config <per-task.json>` so the agent can use `playwright-mcp` + `chrome-devtools-mcp`.
2. Drives a real Chromium itself via `VerificationEngine.runPlaywright({ headed: true })`, captures screenshot + console log as evidence, and attaches them to the journal `VERIFICATION` event.
3. Emits `live_verify` telemetry per non-shell step so the dashboard can render the timeline without re-running.
4. Provides `agent-rules runner verify-task <taskId>` to re-drive a Playwright / browser-script / mcp-tool-call step on demand.

End-to-end demo:

```
$ node packages/engine/dist/manual-e2e.js
[e2e] launching chromium headed…
[e2e] passed= true
[e2e] evidence= [
  { kind: 'screenshot', path: '.agent\\artifacts\\e2e-manual\\demo.png', sha256: 'a71ec1…' },
  { kind: 'console', path: '.agent\\artifacts\\e2e-manual\\demo.console.log', sha256: '…' }
]
```

## Verification gates (final)

- `python automation/test-artifact-schemas.py` → PASS (26 fixtures)
- `python -m unittest evals.conformance.test_5fedu_module_mapping` → PASS (3/3)
- `python -m unittest evals.long_task.test_longtask` → PASS (15/15)
- `python -m evals.long_task --quick` → outcome=PASS, plan_files=12, defects=3/3 repaired
- `python -m evals.long_task --adversarial --quick` → outcome=PASS, adv_found=4/4, fg_found=4/4
- `node packages/cli/dist/index.js build` → 6 runtime-builds emitted
- `node packages/cli/dist/index.js verify-mirrors` → Mirror parity PASS
- `npx vitest --root packages/engine run test/runner-{loop,profile,verifier,mcp-config}.ts test/verification-profile-schema.test.ts` → 87/87 pass
- `npx vitest --root packages/control-plane run tests/browser-qa.test.ts` → 19/19 pass
- `node packages/engine/dist/manual-e2e.js` → Chrome opened, 12 KB screenshot captured

## Ledger state

`.agent/ledger/harness-v3-rearchitecture.json` keeps
`execution_state: NEEDS_REMEDIATION` because the c4 control-plane test
asserts that exact state (the test was written to gate the
plan remediation workflow). Plan ledger is **not** flipped to CLOSED
in this slice — that flip happens once P3b/c/d lands and the engine
deletes the four superseded modules.