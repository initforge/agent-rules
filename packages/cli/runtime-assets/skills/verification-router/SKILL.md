---
name: verification-router
description: "Select proof by scope, claim, risk, deps, regression, browser/mobile/runtime. Deterministic first."
metadata:
  signals: "verify, verification, proof, evidence, claim, risk, impact, affected, regression, acceptance"
  excludes: "pure Q&A, explain testing concept only"
  priority: "30"
  platform_scope: "all"

---

# Verification Router

Select the smallest evidence set that proves the requested claims across every
project. This is a focused execution aid, not a universal testing workflow.

## Flow

1. Inspect the changed seam, direct consumers, public boundaries, relevant
   state and prior failures. Preserve claim IDs when the plan already has them;
   do not invent IDs for ceremony.
2. Choose only the evidence dimensions required by the claim: static, affected
   deterministic test, contract, runtime, visual, accessibility, performance,
   security, recovery or semantic review.
3. Run the cheapest repository-native proof that covers the seam. A planned
   command is preferred when stable; an equivalent command discovered from the
   repository is valid when it proves the same claim.
4. Repair and repeat the affected proof after material changes. Escalate only
   when a required dimension is still unproved, the impact is broader than the
   affected graph, the claim is live/security/data-loss/public-contract, or the
   environment cannot provide truth.
5. Return the actual result: PASS only from current proof or live readback;
   otherwise report PARTIAL, BLOCKED or NEEDS_USER with the remaining reason.

## Claim selection

Map the accepted claim to the smallest proof that can falsify it. Preserve claim
IDs when supplied; otherwise use the described behavior directly. Consider
business impact, reversibility, public boundary, data/security risk and proof
difficulty, then select static, affected test, contract, runtime or live proof
only when that dimension is necessary.

## Change-kind proof

| Change kind | Required proof |
|---|---|
| `CREATE` | new behavior and direct contract |
| `MODIFY` | expected delta and regression of preserved behavior |
| `REPLACE` / refactor | active consumer/adoption proof, equivalent behavior and old-path retirement |
| `RETIRE` / delete | negative proof the retired authority is gone and preservation proof outside its scope |
| `MIGRATE` | upgrade, compatibility, rollback and data-loss contract |
| `PRESERVE` | focused regression only when the seam is affected |

A canonical component or service existing in source is not adoption proof; the
active import, route, consumer or runtime must use it. Deletion proof includes
operational capability and public/internal contracts, not only compile success.
UI geometry or interaction acceptance requires browser/visual proof, but source
checks remain required before a runtime gate. Bind blocker evidence to exact
acceptance: runtime proof blocked while independent source work is pending is
PARTIAL, not BLOCKED. Material-risk review may be required, but the harness does
not choose the reviewer or model.

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
- Keep evidence or readback only when it protects a live, safety, rollback or
  freshness claim. Do not create verification packets, phase artifacts, raw
  artifact stores or evidence history by default.

Missing source truth or an unavailable required environment is BLOCKED/NEEDS_USER,
not an invented pass.

For security/data/migration, major UI/refactor, repeated failures or another
high-cost irreversible claim, an owner/accepted plan may require a fresh-context
reviewer. Give that reviewer the outcome, baseline, locks, final diff,
acceptance and actual proof—not the implementer's self-evaluation. Review is
conditional and the owner selects the model; never create a mandatory worker.
