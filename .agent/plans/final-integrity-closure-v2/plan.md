# Native Implementation Plan — Final Integrity Closure v2

Projection of the canonical owner plan onto repository facts at baseline
`main@41b69eb` (== origin/main, clean tree). This artifact adds code-fact
grounding only; it removes, weakens or reinterprets no canonical requirement
(see `requirements.yaml`, reconciliation in `reconciliation.json`).

## Repository facts (verified fresh, not inherited)

- Baseline: local main == origin/main == 41b69eb; working tree clean.
- `packages/{kernel,engine,cli}` are the only workspaces; `packages/control-plane/`
  directory is already absent; residue remains in `package-lock.json`,
  `automation/control-plane-ci.mjs`, `automation/validate-control-plane-final-gate.mjs`,
  `automation/validate-ci-timeouts.mjs` (R3 regexes), `automation/workflow-semantic-cases.json`,
  `.github/workflows/certification.yml`, `docs/source-to-live-map.md`,
  `.agent/README.md`, plus string-level mentions in validators/fixtures.
- Canonical host matrix: 8 HostIds in `packages/kernel/src/northstar/host-adapters.ts`
  with honest capability attestation levels.
- Existing but insufficient handoff: `packages/kernel/src/artifact-handoff.ts`
  (plan-scoped, lacks the canonical envelope fields and pre-edit guards).
- `requirementCoverage` in `packages/cli/src/services/plan-compiler.ts` counts a
  requirement covered merely because a task references it — violates REQ-C22.
- Live-host verification harness exists: `automation/verify-windows-hosts.mjs`
  (owner-machine, honest UNSUPPORTED semantics) — reused for REQ-C26 evidence.
- Governed verification entry points: `npm run build|check|test|verify:all`,
  `node automation/run-governed-vitest.mjs`.

## Owned paths

- packages/kernel/src/northstar/operator-profile.ts (new)
- packages/kernel/src/cross-host-handoff.ts (new canonical envelope + guards)
- packages/kernel/src/northstar/capability-routing.ts (new policy module)
- packages/kernel/src/northstar/closure-gates.ts (PRIMARY_OUTCOME gate — adapted)
- operator-profiles/vibe-product/profile.json (+ schema) (new canonical source)
- packages/cli/src/commands/operator-profile.ts (new CLI command)
- packages/cli/src/services/host-projection.ts (new projection engine)
- packages/cli/src/commands/doctor.ts, handoff.ts, index.ts (wiring — adapted)
- packages/cli/src/services/plan-compiler.ts (coverage semantics — adapted)
- automation/, .github/workflows/, docs/, package-lock.json (CP residue removal)
- tests under packages/kernel/test/, packages/cli/test/

## Implementation slices (dependency-ordered)

1. S1 foundation: kernel modules (operator-profile, cross-host-handoff guards,
   capability-routing, closure-gates PRIMARY_OUTCOME) + canonical profile source.
2. S2 primary journey: CLI operator-profile command + host-projection service +
   doctor/handoff/index wiring.
3. S3 quality semantics: requirement_coverage claim+evidence gating.
4. S4 cleanup: zero active CP residue across lock/automation/CI/docs/CLI.
5. S5 proof: new governed tests incl. 56-pair mutation matrix, guard tests,
   profile canary/auto-revert, coverage regression, Review A/B defaults.
6. S6 closure: full suite, fresh-context Review A (max one correction), squash.

## Verification commands

- npm run build && npm run check
- npm test (governed vitest full mode)
- node automation/validate-workflow-semantics.mjs (and other touched validators)
- npm run verify:all ; git diff --check
- node automation/verify-windows-hosts.mjs (owner-machine live matrix)
- gh run watch (GitHub CI — runner-available behavior only)

## Honest boundary

Desktop GUI-only host journeys that cannot be driven from this session are
reported NEEDS_USER/BLOCKED with concrete evidence; they are never marked LIVE
from fixtures. Antigravity AUTO_EXECUTE is implemented as contract + tests;
native desktop proof stays in the owner-machine lane.
