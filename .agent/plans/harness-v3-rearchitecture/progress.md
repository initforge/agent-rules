# Progress — harness-v3-rearchitecture

**Updated:** 2026-08-04
**Overall:** S1 and S2 complete. Runner not yet built.

## Where this stands

The previous ledger reported `NEEDS_REMEDIATION` at revision 61 with 8 BLOCKED tasks,
and its progress log contained only hash reconciliations and bounded repairs — no
record of a shipped runtime capability. Migration to the flat ledger (change 0025)
restated scope as testable requirements and dropped three that were structurally
unclosable.

## Slices

| Slice | Status | What |
|---|---|---|
| S1 | DONE | Repo litter removed (root 23 → 7 files); PowerShell critical path fixed so `verify:all` runs on Linux |
| S2 | DONE | `.agent` protocol + flat ledger; 39 MB / ~480 files removed with progress intact |
| S3 | TODO | Durable runner: queue, headless executor, loop, journal extraction |
| S4 | TODO | Bounded review: `maxRepairDepth=2`, machine-checkable AC |
| S5 | TODO | Delete superseded orchestration (22 modules) — only after S3+S4 prove out |
| S6 | TODO | Port 4 PowerShell critical-path scripts to `.mjs` |
| S7 | TODO | Registry (context7 required, serena optional, drop caveman) + skills |
| S8 | TODO | Correct README P8 status and system-map `.agent` claim |

## Known open issues

- `README.md` still claims **Orchestration Runtime (P8) = VERIFIED**. Corrected in S8,
  after S3 makes it true rather than by editing the claim alone.
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
