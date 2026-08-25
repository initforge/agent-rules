---
name: verification-router
description: Use during implementation, review, or planning when proof must be selected by changed scope, claim, risk, affected dependencies, regression impact, evidence, browser, mobile, or runtime behavior. Start with deterministic proof and escalate fidelity only when required. Do not use for pure explanations with no verification decision.
metadata:
  signals: "verify, verification, proof, evidence, claim, risk, impact, affected, regression, acceptance"
  excludes: "pure Q&A, explain testing concept only"
  priority: "30"
  platform_scope: "all"
  source: ROUTE.json migrated

---

# Verification Router

Select the smallest evidence set that proves the requested claims across every
project. This is a routing workflow, not a universal testing agent.

## Route

1. Preserve requirement and claim IDs from the active plan.
2. Inspect the diff, owned scope, symbols, direct consumers, dependency edges,
   public boundaries, data/state surfaces, and previous failures.
3. Classify risk with explainable factors: business impact, failure likelihood,
   blast radius, reversibility, security/data risk, and proof difficulty.
4. Compile a claim evidence profile. Choose only dimensions required by the
   claim: static, affected tests, contract/boundary, runtime, visual,
   accessibility, performance, security, observability, recovery, or semantic.
5. Execute in this order unless the profile requires otherwise:
   ```
   scope/diff → static → affected deterministic tests → boundary/contract
   → domain runtime → non-functional/security/recovery → semantic residual
   ```
6. Escalate when a required dimension is unproved, a verifier fails, impact is
   broader than the affected graph, or the environment cannot provide truth.
   Do not escalate merely because a deeper tool is available.
7. Keep the funnel phases distinct: `VERIFICATION_PLAN` selects checks,
   `VERIFICATION_RUN` records actual execution, and `ACCEPTANCE_REDUCTION`
   evaluates freshness, applicability, required dimensions, and residual human
   decisions. A plan status such as `RUNNABLE` is never run evidence.
8. Persist exact commands, exit status, source/plan/environment hashes, raw
   artifacts and verifier identity. A replay recipe must bind to the same
   source, contract, fixture and environment class; stale bindings invalidate
   it.
9. Workers report results only. The independent verifier and acceptance reducer
   derive PASS/PARTIAL/BLOCKED. Human review handles residual product, visual,
   architectural, business or other semantic uncertainty.

## Provider routing

| Capability | Default | Escalation |
|---|---|---|
| `browser.verify` | Playwright CLI / committed Playwright test | Playwright MCP for exploratory state |
| `browser.debug` | Chrome DevTools MCP | logs, trace, network and performance diagnostics |
| `mobile.interact` | native platform driver | emulator/device or Appium adapter |
| `code.verify` | compiler, typecheck, lint, affected tests | broader regression or independent review |

## Invariants

- Do not run full regression for every edit when the claim profile is narrower.
- Do not skip a required high-fidelity check because a lower layer is green.
- Do not require API, DB, UI, analytics, performance and security evidence for
  every claim; derive the profile from risk and boundary.
- Do not treat a model narrative, screenshot alone, or stale replay as PASS.
- Keep capability evals separate from regression evals and isolate trial state.
- A discovered expensive flow may become a deterministic replay only after its
  expected outcome and fixture state are independently accepted.

## Output

Return a machine-readable verification plan containing:
`claim_ids`, `impact_summary`, `risk_factors`, `required_evidence_dimensions`,
`ordered_verifiers`, `escalation_conditions`, `replay_binding`, and
`human_residuals`.

Missing source truth or an unavailable required environment is BLOCKED/NEEDS_USER,
not an invented pass.

## Human residual packet

The terminal reducer should hand the operator a compact packet containing the
changed surface, risk, actual automated statuses and artifact hashes, replay and
freshness state, deterministic failures, blocked capabilities, and only the
remaining semantic/product/design/business questions. Human review records one
decision per residual. The operator verifies the critical journeys and packet,
not every automated check a second time.
