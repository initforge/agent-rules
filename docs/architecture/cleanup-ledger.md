# Cleanup Ledger — M0 Repository Audit

Generated: 2026-07-26
Branch: refactor/final-harness-convergence
Baseline SHA: da6ab4d (HEAD before cleanup)

## CRITICAL findings

| # | Domain | Path | Finding | Action |
|---|--------|------|---------|--------|
| C-01 | Control plane | runs.ts, audit.ts | Error details leak to clients | Add apiError sanitization |
| C-02 | Automation | test-artifact-schemas.py:37-44 | Prefix collision: model-routing fixtures validated against wrong schema | Fix prefix extraction |
| C-03 | CI | quality.yml | Stale validate.log artifact — file never created | Remove artifact or write log |

## HIGH findings

| # | Domain | Path | Finding | Action |
|---|--------|------|---------|--------|
| H-01 | Automation | test-artifact-schemas.py:155-210 | Stale acceptance criteria checks for plan schema | Update test to match current plan schema |
| H-02 | Platform | generated/runtime-build/*/docs/06-platform-capability.md:30 | Stale: says "planned" should be "partial" | Rebuild runtime |
| H-03 | CI | evaluation.yml:108-124 | Suite selector incomplete — route-conformance has no if conditional | Add conditional |
| H-04 | Automation | build-context-graph.ps1:42-57 | Silent Python/yaml dependency corrupts graph | Add pre-check, surface as hard error |
| H-05 | Automation | CI quality.yml | pyyaml not installed for build-context-graph | Add pip install pyyaml |
| H-06 | Control plane | safety.ts, auth.ts | Zero test coverage | Add tests |
| H-07 | Control plane | safety.ts vs reader.ts | Duplicate root-resolution logic | Export ROOT from safety.ts |

## MEDIUM findings

| # | Domain | Path | Finding | Action |
|---|--------|------|---------|--------|
| M-01 | Automation | test-artifact-schemas.py | plan fixtures likely incompatible with updated schema | Audit and migrate fixtures |
| M-02 | Evals | evals/fixtures/README.md:98-103 | Stale benchmarks.compat import path | Fix to evals.fixtures.compat |
| M-03 | Rules | docs/architecture/current-repository-inventory.md:67 | Stale reference to deleted 45-sync-canonical.md | Remove row |
| M-04 | Skills | skills/README.md:6-20 | parity-verification missing from table | Add row |
| M-05 | Skills | skills/context-evolution-protocol/SKILL.md | Deep 5fedu embedding in public skill | Replace 5fedu-common with profile-common |
| M-06 | Platform | platforms/platform-contracts.json vs generated/ | OpenCode missing from build output | Add to pipeline or document gap |
| M-07 | Control plane | tsconfig.server.json | src/middleware/ not in include | Add to tsconfig |
| M-08 | Control plane | mutation.ts:65,74 | Double safeResolve with discarded first result | Reuse result |
| M-09 | Control plane | config.ts:69-75 | safePath computed but unused for JSON/YAML | Pass to reader or remove |
| M-10 | Control plane | db/schema.ts | Dead SQL schema code, never imported | Remove or integrate |
| M-11 | CI | quality.yml | Automation scripts execute out of order | Reorder to 01→03→04 |
| M-12 | Control plane | test-artifact-schemas.py | plan-decision-supersedes-nonexistent fixture | Update or remove |

## LOW findings (documentation, drift)

| # | Domain | Path | Finding |
|---|--------|------|---------|
| L-01 | CI | All workflows | Actions pinned to mutable semver tags |
| L-02 | CI | evaluation.yml | Build artifact never consumed |
| L-03 | CI | quality.yml, certification.yml | Duplicate test execution across jobs |
| L-04 | Platform | platforms/README.md:18 | Ambiguous install script path |
| L-05 | Evals | schemas/fixtures/positive/ | 25 positive vs 24 negative fixtures |
| L-06 | Skills | schemas/README.md | evidence vs claim-evidence boundary undocumented |

## INFO findings (accepted, no action)

| # | Domain | Path | Finding |
|---|--------|------|---------|
| I-01 | Automation | automation/fixtures/ | Directory never existed in repo |
| I-02 | Automation | generate-doc-references.ps1→.py | Clean migration confirmed |
| I-03 | Automation | repository-inventory.json | Manually maintained snapshot |
| I-04 | Automation | 04-verify-mirrors.ps1 | Correct minimal wrapper |
| I-05 | Automation | Merge-Mcp-Adapters.ps1 | Cross-platform paths correct |
| I-06 | All | Various | 5fedu routing references in skills (acceptable) |

## Dismissed findings (false positives from audit context)

| # | Domain | Path | Rationale |
|---|--------|------|-----------|
| D-01 | Automation | automation/08 gap | 08-install-5fedu-context.ps1 lives under profiles/ (by design) |
| D-02 | Automation | 11-install-runtime-hooks.sh vs .ps1 pattern | Shell scripts are inherently OS-specific |
| D-03 | Platform | generated/runtime-build/ no opencode/ subdir | By design: OpenCode self-installs separately |
