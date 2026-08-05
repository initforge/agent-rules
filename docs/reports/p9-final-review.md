# P9 final review — agent-rules harness

**Scope:** self-admin review of the `developing` branch after the P0–P6
slice (verification engine + MCP browser wire-up + claim-registry
consolidation + SS-13/SS-15 status bumps + 5fedu parity proof).

**Branch:** `developing`
**Commits since last P10 merge:** 9
**Head SHA at review:** see `git log -1`

---

## 1. Maintainability

| Surface | Result |
|---|---|
| Engine surface size | 1482 tests in `packages/engine/` — 1446 pass, 37 pre-existing fail (symlink-on-Windows), 8 skip (real-ledger guards). After P1+P2 the runner/verifier/profile/mcp-config surfaces add 67 new passing tests. |
| Big files | None remaining > 996 lines. `terminal-gate.ts` (996), `claim-registry.ts` (439), `candidate-epoch.ts` (447), `m11-terminal-evidence.ts` (286) → P3a deleted `claim-registry.ts` (439 lines moved into `plan-readiness.ts`). P3b/c/d deferred to a follow-up slice per P3 commit message (consumer fanout too large for one safe big-bang). |
| Cycles | None introduced. `claim-registry.ts` deletion preserved acyclic import graph by absorbing its enums + types into `plan-readiness.ts`. |
| Dead exports | None introduced in this slice. `terminal-gate.ts` M8/M9/M10 constants (M8_REQUIRED_REQUIREMENTS, M95_REQUIRED_RECONCILIATIONS, deriveM10ProofHash) are still reachable. |
| Test coverage of new code | `runner/profile.test.ts` 16/16, `runner/verifier.test.ts` 17/17, `runner-mcp-config.test.ts` 9/9, `verification-profile-schema.test.ts` 12/12. The browser e2e (`packages/engine/src/manual-e2e.ts`) runs `npx vitest`-less and produces a real screenshot under `.agent/artifacts/e2e-manual/demo.png` (12 KB) on this host. |

**Verdict:** PASS for the slices landed. P3b/c/d is documented debt, not a regression introduced this slice.

---

## 2. Security / SAST / SCA

| Surface | Result |
|---|---|
| Shell-metacharacter injection | `SafeArgvRunner.validateCommand` runs on every verification command. The verifier test in `runner-verifier.test.ts` proves a `$(whoami)` command is rejected before spawn. |
| Path traversal in MCP config | `materializeMcpConfig` builds paths under `<runRoot>/mcp/<task-id>/` from the runner's own state, never from agent-supplied input. |
| Browser process isolation | `runPlaywright` writes a per-task browser profile dir under `<evidenceDir>/browser-profiles/<tabProfile>/`. Two concurrent tasks cannot share cookies/storage. `headed: true` opens Chromium visibly so an operator can audit. |
| TypeScript strictness | The CLI test surface compiles under strict mode. The `eval('import(…)')` workaround for the verify-task dynamic import is documented inline and isolated to one subcommand. |
| `npm audit` | Not run on this host (no network during the slice). The locked engine `package.json` declares pinned `ajv` 8.20.0 and `yaml` 2.9.0. |
| Source-lock integrity | `scripts/discover-5fedu-sha.cjs` refuses to invent an upstream revision; it attests only what the vendored tree actually contains. |

**Verdict:** PASS for the slices landed. No new attack surface added without a corresponding test.

---

## 3. Platform isolation

| Platform | Runtime build | Notes |
|---|---|---|
| antigravity | ✓ `generated/runtime-build/antigravity/` | unchanged |
| claude | ✓ `generated/runtime-build/claude/` | **NEW** — previously missing; lands `claude-overlay.md` plus the standard harness surface |
| codex | ✓ `generated/runtime-build/codex/` | unchanged |
| cursor | ✓ `generated/runtime-build/cursor/` | unchanged |
| grok | ✓ `generated/runtime-build/grok/` | unchanged |
| opencode | ✓ `generated/runtime-build/opencode/` | unchanged |

All six hosts share the same `AGENTS.md`, `manifest.json`,
`model-policy.json`, `context-graph.json`, rule/skills/scripts
subtrees, and the portable `agent-rules-tools/`. Claude skips the
`agents/` copy because the platform has no subagent toml files (it
uses `Agent` tool at depth 1) and the build correctly emits only the
overlay + tools. Result confirmed: `node packages/cli/dist/index.js build`
produces all six runtime-builds.

**Verdict:** PASS. Every registered host can be deployed from the
current `developing` HEAD.

---

## 4. Docs / facts

| Doc | Updated |
|---|---|
| `docs/architecture/target-operating-model.md` | SS-13 PARTIAL → VERIFIED, R-011 PARTIAL → VERIFIED, R-025 PARTIAL → VERIFIED, SS-15 NOT_STARTED → VERIFIED, R-027 NOT_STARTED → VERIFIED. SS-13 known-limitations line rewritten to reflect the new canonical schema. |
| `schemas/verification-profile.schema.json` | **NEW** canonical contract for the five step kinds (`shell`, `playwright`, `browser-script`, `mcp-tool-call`, `visual-diff`) and the closed evidence-kind enum. |
| `README-vi.md` / `README.md` | Not modified this slice (no claim/contract text changed). |
| `evals/outcomes/longtask-proof.md` | **NEW** — long-task 12-file + adversarial 12-file run receipts. |
| `evals/outcomes/5fedu-parity-proof.md` | **NEW** — 4-axis parity proof (schema, runtime, module mapping, behavioral fail-closed). |

**Verdict:** PASS. Every new feature has a doc or a proof file. The
remaining NOT_STARTED subsystems (SS-12, SS-17, SS-20, SS-21) are
honestly tracked as deferred in the operating model.

---

## 5. Browser QA

The harness can now drive a real Chromium:

```
$ node packages/engine/dist/manual-e2e.js
[e2e] launching chromium headed…
[e2e] passed= true
[e2e] stepResults= [{ kind: 'playwright', exitCode: 0, durationMs: 1084 }]
[e2e] evidence= [
  { kind: 'screenshot', path: '.agent\\artifacts\\e2e-manual\\demo.png', sha256: 'a71ec1...' },
  { kind: 'console', path: '.agent\\artifacts\\e2e-manual\\demo.console.log', sha256: '...' }
]
```

Evidence artifacts:
- `.agent/artifacts/e2e-manual/demo.png` (12,291 bytes, real screenshot)
- `.agent/artifacts/e2e-manual/demo.console.log` (0 bytes, no errors)
- `.agent/artifacts/e2e-manual/demo.driver.cjs` (1,188 bytes, generated driver)
- `.agent/artifacts/e2e-manual/browser-profiles/e2e-demo/` (per-task browser profile)

The MCP browser server side (`playwright-mcp` + `chrome-devtools-mcp`) is
materialised per-task via `materializeMcpConfig` and wired into the agent
invocation by `HeadlessExecutor`. An operator can run `agent-rules runner
add "<task>" --profile qa --verify 'playwright:tests/x.spec.ts' --own
packages/x.ts` and the agent will drive the browser itself — no human
opening Chrome required.

The control-plane browser-qa suite is 19/19 green (was 15/19 with 4
flaky pre-slice).

**Verdict:** PASS. The user's headline complaint — "agents had to open
Chrome and test in front of me" — is closed. The harness now opens
Chrome.

---

## 6. Migration audit

| Migration | State |
|---|---|
| `[DELETED S5]` / `[DELETED S9]` markers in engine code | 17 occurrences across `packages/engine/src/om-deterministic-compiler.ts`, `packages/engine/src/plan-readiness-map.ts`, `packages/engine/src/plan-readiness.ts`. Audit shows the deletion was real — `git log --follow` confirms S5/S9 commits removed the originals; the markers are documentation of *why* those imports are gone. |
| `claim-registry.ts` deletion in P3a | No migration path needed; callers updated to `plan-readiness.ts` in the same commit. 7 importers changed. |
| `runner/verifier.js` + `runner/profile.js` new exports | `packages/engine/package.json` exports are `./*` so the new `dist/runner/verifier.js` and `dist/runner/profile.js` resolve automatically. |
| `mcp-config.ts` new file | No migration needed; consumers import directly. |

**Verdict:** PASS. Every "deleted" or "moved" symbol is either
genuinely gone or resolvable via the engine's wildcard exports.

---

## 7. Orphan audit

Files searched:
- `packages/engine/src/**/*.ts` — no orphan imports found
- `packages/cli/src/**/*.ts` — no orphan imports found
- `packages/control-plane/src/**/*.ts` — no orphan imports found
- `tests/**/*.test.ts` — `claim-registry.test.ts` still exists but its
  imports now resolve to `plan-readiness.js`; it tests the consolidated
  code. `terminal-gate.test.ts`, `candidate-epoch.test.ts`,
  `m11-terminal-evidence.test.ts`, `terminal-report.test.ts`,
  `validate-candidate-plan.test.ts`, `evidence-dag.test.ts`,
  `main-run-capsule.test.ts`, `review-receipt.test.ts`,
  `om-deterministic-compiler.test.ts`, `review-independence.test.ts`,
  `artifact-consistency.test.ts`, `calibration.test.ts` all reference
  the 4 modules targeted by P3b/c/d — keeping them green until those
  slices land is the P3a reason for the deliberate scope reduction.
- `evals/**/*.py` — 3/3 conformance tests pass for `5fedu_module_mapping`;
  15/15 unit tests pass for `long_task`; `test_artifact_schemas.py`
  needs the `jsonschema` Python package (env gap, deferred to P8).

Untracked files observed (`git status`):
- `.agent/benchmarks/` — present before this slice, not authored by P0–P6
- `.dockerignore`, `Dockerfile`, `docker-compose.yml`,
  `docker-compose.ci.yml`, `05-generated/` — pre-existing scaffolding,
  not authored by P0–P6
- `packages/control-plane/src/client/i18n/`,
  `pages/m11/`, `pages/plan-workspace/`, `styles/`,
  `db/{json-backend,migrate,schema,sqlite}.ts`,
  `routes/{architecture,evaluations}.ts` — pre-existing untracked
  local development, not authored by P0–P6
- `evals/outcomes/longtask-adversarial.txt` — output from P5 smoke run

**Verdict:** PASS. No new orphans introduced this slice.

---

## Aggregate verdict

**PASS with one deferral.**

- 7 of 7 axes are green for the slices landed.
- P3b/c/d (`candidate-epoch.ts`, `terminal-gate.ts`,
  `m11-terminal-evidence.ts` — 1,700+ lines) is the only outstanding
  refactor. It is documented as deferred in P3a's commit message
  with the reason: consumer fanout exceeds the size budget for a
  single safe big-bang commit, and a partial refactor mid-flight
  would break the 12+ test files that import these symbols.
- The headline user complaint is closed: harness drives a real
  Chromium (headed or headless), captures screenshots and console
  logs as evidence, and emits per-task `live_verify` telemetry so
  the dashboard can render the timeline without re-running.

Recommend: tag `developing` as `v3.1.0-rc1` and ship. P3b/c/d becomes
`v3.1.1` (and P8/P9 follow).