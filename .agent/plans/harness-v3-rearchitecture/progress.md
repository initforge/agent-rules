# Progress — harness-v3-rearchitecture

**Updated:** 2026-08-04
**Overall:** S1–S8 done. The runner executes real work, end-to-end verified, and the
docs now describe what the code does.

## Where this stands

The previous ledger reported `NEEDS_REMEDIATION` at revision 61 with 8 BLOCKED tasks,
and its progress log contained only hash reconciliations and bounded repairs — no
record of a shipped runtime capability. Migration to the flat ledger (change 0025)
restated scope as testable requirements and dropped three that were structurally
unclosable.

The runner now does what the orchestration layer claimed to do. Verified against the
real `claude` CLI, not a mock:

- **Real work.** A task asking for `subtract()` in `src/math.ts` produced a genuine
  diff (`+4 lines`), and the verification command passed when re-run independently.
  Compare with the old `buildWorkerScript()`, which returned one `console.log`.
- **Bounded repair.** An unsatisfiable task ran exactly 3 times (depth 0 → 1 → 2) and
  stopped at `needs-user`. The old protocol had no bound and produced chains like
  `R3C → R3C-R1 → R3C-R1A → R3C-R1B → R3C-R2 → R3C-R2-R1`.
- **No gaming.** The agent did not weaken or delete the failing verification file to
  reach PASS; `src/` was untouched across all three attempts.
- **Real journal.** 6 records for one task with the hash chain verifying, versus 3
  lines in `.agent/trace.jsonl` for the entire previous history.
- **Compact immunity.** The runner holds no model context; each task is a separate
  process that exits. 12 sequential tasks in one run, no accumulation.

## Slices

| Slice | Status | What |
|---|---|---|
| S1 | DONE | Repo litter removed (root 23 → 7 files); PowerShell critical path fixed so `verify:all` runs on Linux |
| S2 | DONE | `.agent` protocol + flat ledger; 44 MB → 2.5 MB with progress intact; enforced by `validate-agent-dir.mjs` |
| S3 | DONE | Durable runner: `queue`, `headless-executor`, `diff`, `loop`, `journal`; `agent-rules runner` CLI; 64 tests |
| S4 | DONE | `maxRepairDepth` (default 2) enforced in code; verification is commands-only |
| S5 | PARTIAL | 10 of 23 superseded modules deleted (−10,349 lines). The other 13 have real consumers — see below |
| S6 | DONE | PowerShell runs fine on Linux via pwsh — the port was unnecessary. Fixed the 4 real bugs it was hiding instead |
| S7 | DONE | Registry: context7 → required, caveman dropped, Serena skipped (unverifiable here). Skills 16 → 14 |
| S8 | DONE | README/README-vi/AGENTS: P8 VERIFIED → Durable Runner OPERATIONAL + legacy SUPERSEDED |

## S8 note

`Orchestration Runtime (P8) = VERIFIED` was the single most damaging line in the repo:
it told every reader — including any agent that read it — that an executor existed. It
is now replaced by two honest rows: **Durable Runner / OPERATIONAL /
`packages/engine/src/runner/`**, and **Legacy orchestration runtime / SUPERSEDED**, the
latter with the reason it is still present (`host-kit/runtime` and two CLI/control-plane
call sites import it) and an explicit "do not build on them".

Note the ordering: the claim was corrected in S8, *after* S3 made it true, rather than
by editing the word in isolation.

Both READMEs and `AGENTS.md` now document how to actually run work unattended, so the
runner is discoverable rather than buried in the engine. `check-internal-links.py`
passes; `validate-context` PASSes at 14 skills.

## Remaining, for owner decision

1. **The other 13 orchestration modules.** Deleting them means refactoring
   `host-kit/runtime` and two call sites (see the S5 table). Mechanical deletion is not
   possible.
2. **`jsonschema` is missing** on this host and there is no `pip`, so
   `test-artifact-schemas.py` cannot pass here. Environment, not code.
3. **Runtime mirror drift.** The pre-commit hook reports `rules/` and `skills/` changes
   not yet mirrored to `~/.config` and `~/.grok`. Syncing writes outside the repo, so it
   is left to you: `./automation/run.sh 02-install-runtime && ./automation/run.sh
   04-verify-mirrors`.
4. **14 pre-existing test failures** across 9 files (symlink and cyclic-supersession
   assertions, `host-kit/oc-stuck`, `context-cache`). Present before this work and
   untouched by it.

## S7 notes

**Registry** — all four required integrations were verified to actually resolve
(`npx -y @playwright/mcp`, `chrome-devtools-mcp`, `@upstash/context7-mcp` each exit 0;
codebase-memory-mcp stays a pinned binary). context7 moved from `recommended` to
`required` and from `integrations/recommended/` to `integrations/required/` so the
directory matches its policy. `caveman` removed: `advisory-only` trust, capability
"workflow-utility", and a fallback that read "use canonical skills and normal task
reasoning" — i.e. it added nothing.

**Serena was NOT added.** The review proposed it as an optional semantic-edit MCP. It
needs `uvx` (absent on this host) and npm refuses git-source fetches here
(`EALLOWGIT`), so I could not verify it runs. Adding a registry entry I cannot
demonstrate is exactly the failure this whole refactor is correcting, so it is left out
rather than declared.

**Skills 16 → 14.** `code-review` and `clean-code` were both already marked DEPRECATED
while still carrying full routing metadata (`priority: 60`, `max_route_tokens: 4000`),
so they kept consuming routing budget for content that had moved to `quality`. Deleted,
with `clean-code-checklist.md` moved into `skills/quality/references/` first — that file
is load-bearing, `quality` references it three times.

**docs-style screenshots are now mandatory.** The old wording ("only when requested or
necessary", "only when the user asks") had produced an empty `docs/assets/` and a README
with no images. Now: drive the app and capture → capture production → **ask the user**.
No skip branch, and `TODO: xác minh` is explicitly not an escape hatch. Added a
per-project-type capture table and two new quality gates.

**Delegation receipts 7 → 2.** `rules/25-task-lifecycle.md` required
`subagent_requested/_resolved/_started/_completed`, `result_consumed/_rejected`,
`delegation_skipped`, and stated "missing receipts are detectable" — so the ceremony
itself generated findings. Now two facts: what was delegated, and the outcome.

Six dependent places had to be updated in step, which is a useful measure of how much
coupling a "simple" skill deletion carries: `automation/12-regression-harness-guards.ps1`,
`automation/audit-plan-artifact.ps1`, `automation/trigger-audit.json`,
`automation/repository-inventory.json`, `automation/03-validate-context.ps1` (a check
policing a trigger boundary between two now-merged skills), `rules/50-context-budget.md`,
and the `supports:` edges in three other skills — a dangling edge broke context-graph
loading outright.

## S6 finding: the port was the wrong fix

The plan called for porting 4 PowerShell scripts (1,809 lines) to `.mjs`. Two things
turned out to be false:

1. **`build`, `validate`, `doctor`, and `verify` are already native TypeScript.** Only
   `02-install-runtime.ps1` is still invoked from the CLI (by `install` and `sync`).
2. **PowerShell runs on Linux.** Executing `03-validate-context.ps1` through `pwsh`
   worked; it failed on *content*, not platform. `verify:all` had been broken solely
   because `package.json` invoked `powershell`, a Windows-only binary name.

So the port would have rewritten 1,809 working lines and changed nothing. What the
restored `verify:all` actually revealed was four real bugs it had been hiding:

| Bug | Fix |
|---|---|
| `validate-tool-registry.ps1` hardcoded 5 hosts, omitting `claude`, so a correct registry always failed | read the host list from `platforms/platform-contracts.json` |
| `sync-opencode-parity.ps1` hardcoded selector `gpt-5.6-sol`, violating "selectors live only in model-policy.json"; its own comment admitted it | added `platforms.claude.adapter_defaults.model_selectors.session_bridge` to the policy and read from it |
| `test-model-policy.py` asserted an exact 5-platform set, so adding a platform broke a correct policy — the pressure that caused the hardcode above | assert every contracted platform has a policy entry |
| `update-source-integrity.py` hardcoded `P:/agent-rules`, so it only ran on one Windows machine | resolve from `__file__`; added `--check` for CI |

Also fixed two protocol violations the new `.agent` validator caught, both of which
were tools writing where they should not:
- `03-validate-context.ps1` wrote `validate-ui-routing.log` to `.agent/` root → now
  `.agent/artifacts/`.
- `plan-lifecycle.test.ts` adopted a fixture into the real `.agent/plans/`, leaving
  `test-plan-adopt-1` among real plans → `adoptPlan()` now takes an injectable
  `plansDir`.
- Removed a stale empty `skills/5fedu-module-parity/` (only a `__pycache__`); the real
  skill already lives in `profiles/5fedu/skills/`.

`verify:all` on Linux now: BUILD OK, typecheck OK, `.agent` protocol OK, md-links OK,
model-policy OK, installer-trust-boundary OK, 5fedu-leakage OK, tool-registry OK,
`validate-context` PASS.

Remaining: `test-artifact-schemas.py` needs the `jsonschema` package, and this host has
no `pip`. That is an environment gap, not a code defect — recorded rather than papered
over.

## S5 finding: the deletion set is smaller than the review assumed

Dependency analysis (not assumption) showed only 10 of the 23 modules are leaves.
Deleted: `activation-projections`, `activation-semantics`, `activation-transaction`,
`autopilot-m11`, `c2`, `ledger-activation`, `ledger-migration`, `resume-hooks`,
`supervisor`, `worktree-train-bindings` — 4,726 source + 5,600 test lines.

Test failures went from 12 files / 20 tests to 9 files / 14 tests, with **no new or
worsened failure**. The remaining 14 are pre-existing and unrelated (symlink and cyclic
-supersession assertions, `host-kit/oc-stuck`, `context-cache`).

**Blocked, and why** — each needs a decision, not just a delete:

| Module | Blocker |
|---|---|
| `terminal-gate`, `m11-terminal-evidence` | imported by `packages/cli/src/commands/plan.ts` and `control-plane/src/routes/c4.ts` |
| `autopilot`, `execution-facade`, `worktree-train`, `candidate-epoch` | exported and consumed outside the engine |
| `controller`, `execution-runtime`, `watchdog`, `dispatch-ready-set`, `resource-broker`, `resource-governor` | anchored by `src/host-kit/runtime/*`, which the platform adapters use |
| `claim-registry` | used by `calibration`, `evidence-dag`, `review-receipt`, `review-independence`, `plan-readiness`, `om-deterministic-compiler` |
| `semantic-wake-policy` | used by `execution-facade` |

Cutting these means refactoring `host-kit/runtime` and two CLI/control-plane call
sites. That is a separate, owner-approved slice — not a mechanical delete.

## Bugs the end-to-end run found (both fixed)

1. **Runner state counted as task output.** The queue, logs, and journal live inside
   the repo, so a task that did nothing still produced a diff — defeating the
   "verification passed but nothing changed" check. `captureDiff` now excludes the
   runner's own paths.
2. **Journal identity keyed on git HEAD.** The revision changed as the runner
   committed, making the journal unopenable on the next run
   (`journal identity mismatch`). Identity is now the ledger schema version; the git
   SHA is per-run data in `RUN_START`. Both have regression tests.

## Known open issues

- `README.md` still claims **Orchestration Runtime (P8) = VERIFIED**. Corrected in S8.
- `verify:all` now runs on Linux and immediately surfaced two real pre-existing
  failures it had been hiding:
  - `validate-no-5fedu-leakage.ps1`: `5fedu-module-parity` sits in public `skills/`
    but belongs in `profiles/5fedu/skills/`.
  - `validate-tool-registry.ps1`: `codebase-memory-mcp` declares native host
    `claude`, which the validator rejects.
- Two broken doc links to `generated/references/` (deprecation-list,
  integration-registry) — generated files not produced by the current build.
- `automation/03-validate-context.ps1` and the Python artifact-schema check fail; not
  yet triaged.
