# Harness Universal Reconciliation v1 — Execution Plan

Status: `PLANNED`

## Delivery strategy

This is one resumable goal with ten dependency-aware slices. The coordinator
owns intent, integration, current-pointer activation, final review, and closeout.
At most two non-overlapping slices may execute concurrently. Interface changes
outside a recipe require an amendment before work continues.

## Slices

### S1 — Canonical plan, support pack, and prompt-first entrypoints

Unify the portable plan contract, intent compiler, support-pack compiler, task
recipes, checkpoints, and CLI. Make ordinary conversation the sufficient,
portable entrypoint. Compile normal prompts, optional slash commands, CLI/API
calls, and native host actions into the same canonical `WorkRequest`. `/goal`
may remain as a host convenience, but its presence, absence, or native semantics
must never change the contract or become execution authority.

Exit: a hash-bound bundle compiles, validates, resumes, and refuses unresolved
material decisions.

### S2 — External skill/source governance

Implement immutable source locks, qualification scoring, selected-set lifecycle,
portable SKILL.md plus ROUTE.json projection, and complete selected-skill parity
across installed hosts.

Exit: a candidate can deterministically become selected, rejected, or link-only;
blind import and unpinned installation fail closed.

### S3 — Provider catalog and verifier adapters

Add provider-neutral adapters and fixtures for Testcontainers, Pact,
Schemathesis, Storybook, Maestro, Semgrep/CodeQL, k6, and OpenTelemetry. Retain
the Playwright/DevTools/code-search providers and establish claim-specific
activation.

Exit: every provider has install, discover, health, effect, timeout, rollback,
positive, negative, and unavailable behavior.

### S4 — Host inventory, projection, and repair

Replace partial platform checks with the registered seven-host adapter contract.
Detect installed desktop/CLI hosts from multiple facts, materialize host-native
artifacts, compare desired/actual state, repair safe drift transactionally, and
emit parity receipts.

Exit: all seven adapters pass fixture parity and the live machine correctly
distinguishes installed hosts from stale config directories.

### S5 — Foreground browser, mobile, and Pencil

Migrate the proven detached Pencil candidate, repair its incomplete host
materialization, discover dynamic AppImage paths safely, and enforce foreground
local sessions with explicit CI-headless profiles.

Exit: Pencil/browser/mobile availability is observed live, never inferred from
config, and `/tmp/.mount_*` is never persisted.

### S6 — Typed closed-loop routing and claim-based verification

Route from RepoFacts, ChangeFacts, TaskFacts, claim class, impact, provider
availability, and risk. Add typed feedforward and feedback sensors, freshness,
independence, confidence, runtime clamps, failure-to-eval conversion, expiring
model workarounds, testability audit, cheapest-sufficient proof, bounded repair,
and human/owner residual handling.

Exit: seeded tasks select the right skill/provider/verifier without keyword-only
activation or unnecessary heavy checks, and every convergence decision has a
machine-checkable sensor/evidence trail.

### S7 — Lifecycle, compaction, and CI convergence

Replace phase-hard-coded active gates with pointer-driven validation, implement
evidence-preserving plan compaction, and remove CI waits that can remain queued
indefinitely.

Exit: old behavior remains available as history, CI has bounded waits, and
compaction preserves terminal evidence.

### S7A — High-impact rule and skill semantic convergence

Resolve semantic contradictions across lifecycle, planning, completion, context
sizing, delegation, research, browser QA, quality, and UI precedence. Add a
focused contradiction corpus and semantic validator while retaining full-catalog
structural fixtures.

Exit: high-impact workflow paths have one explicit owner and precedence rule,
repository delegation remains capped at two without recursion, and known
contradiction fixtures fail before the fix and pass after it.

### S7B — Prompt-first pair repair and selective claim reopening

Accept ordinary conversational review findings after or during a long plan.
Bind each finding to raw owner text and the active bundle, classify it as a
defect, approved change, missing evidence, environment issue, or unrelated
observation, compute affected requirements/claims/tasks/evidence, and reopen only
the impacted claims in a new evidence epoch. Preserve historical PASS evidence,
emit a bounded repair packet, pair with the owner through normal prompts, and
require fresh proof before the reopened claims return to terminal status.

Exit: a review finding can be repaired conversationally without `/goal`, without
restarting the plan, without silently widening scope, and without invalidating
unaffected claims or rewriting prior evidence.

### S8 — Integration, dogfood, reinstall, closeout, and final handoff

Integrate shared registries and commands, activate the new current pointer by
generation CAS, run the phase through its own prompt-first reconcile flow, verify exact
requirements, reinstall all detected hosts, and generate CloseoutReceipt. Deny
Control Plane eligibility until every skill/provider/tool/MCP/rule/command/host
and runtime projection, terminal claim, required CI check, install receipt, and
owner-approved harness closeout is complete.

Exit: local PASS plus exact hosted-CI and runtime parity evidence. Git mutation
beyond the implementation work remains gated by owner approval of the receipt.

## Dependency order

```text
S1 -> (S2, S3)
S1 -> S4 -> S5
(S2, S3, S4, S5) -> S6
(S1, S6) -> S7
(S2, S3, S6, S7) -> S7A
(S1, S6, S7, S7A) -> S7B
(S2, S3, S4, S5, S6, S7, S7A, S7B) -> S8
```

## Failure and recovery

- Missing source truth or authority: `NEEDS_USER`/`BLOCKED`.
- Missing optional provider: recorded fallback; no false PASS.
- Two failed repair attempts: stop the claim and preserve evidence.
- Shared contract conflict: halt affected slices, record amendment, regenerate
  only impacted recipes.
- CI/provider timeout: terminate children, retain logs, and report the bounded
  external blocker.
- Remote Git drift: invalidate CloseoutReceipt and prepare a new one.

## Final proof

Run focused checks after each slice, full build/check/test/verify at integration,
live installed-host reconciliation, foreground design/browser/mobile proof when
applicable, package smoke, and GitHub hosted CI for the exact SHA.

The Pencil-led Control Plane rebuild is the final phase, not an early successor
or parallel lane. Only after S8 proves the full eligibility gate may it begin:
visible Pencil MCP design and owner approval first, then frontend rebuild, Docker
Compose packaging, and foreground browser parity against the finished harness.
