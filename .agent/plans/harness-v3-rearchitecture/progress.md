# Progress — harness-v3-rearchitecture

**Updated:** 2026-08-04
**Overall:** S1–S4 complete. The runner executes real work, end-to-end verified.

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
| S5 | TODO | Delete superseded orchestration (22 modules) — the runner has now proven out |
| S6 | TODO | Port 4 PowerShell critical-path scripts to `.mjs` |
| S7 | TODO | Registry (context7 required, serena optional, drop caveman) + skills |
| S8 | TODO | Correct README P8 status and system-map `.agent` claim |

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
