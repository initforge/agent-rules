# Adaptive Minimal-Proof Testing — Global Always-On Behavior

## Status
Always-on invariant. Applies to every repository, every task, every host, every
MCP provider, every integration and every supported agent-rules platform.
Not a batch-local rule, not a prompt-only instruction, not an optional skill,
not an MCP-specific policy, not a single-project convention.

## 1. Core principle
**Minimal sufficient proof, not minimum effort and not maximum test count.**

For every task the harness selects the smallest proof set that can actually
prove the task's claims. It never runs every test mechanically; a full-suite
run or repository-wide audit is never demanded merely because it is possible.
A broader run is required only when changed scope, dependency impact,
architecture impact, release risk or regression risk justifies it.

## 2. Trigger (scope/claim/risk based — never keyword-only)
Adaptive-minimal-proof-testing activates for every task, and its proof set is
derived from:

- changed scope (changed files → changed surfaces);
- affected claims;
- affected dependencies;
- risk class (S0–S3);
- runtime surface (browser/desktop/MCP/process/session/workspace/…);
- project test architecture;
- host capability;
- required evidence fidelity.

User wording is a hint only and can never be the sole basis for activation or
for choosing proof.

## 3. Proof selection & omitted proof
1. Preserve raw user intent.
2. Identify changed files and affected components.
3. Compile explicit requirements, claims and risks.
4. Inspect the project's existing test commands and test architecture.
5. Inventory existing evidence.
6. Build a behavior-to-evidence coverage map.
7. Select the smallest proof set that can actually prove the claims.
8. Run deterministic proof first.
9. Escalate fidelity only when the claim requires it.
10. Record selected proof.
11. Record omitted proof and the reason it was omitted.
12. **Omitted-proof blocker rule**: an omitted proof dimension is a release blocker ONLY if the explicit acceptance claim requires evidence in that dimension. Omitted proof outside the claim scope is logged as non-blocking follow-up debt.
13. Never silently skip required proof.
14. Never claim PASS from weaker evidence than the claim requires.
15. Report limitations and environmental boundaries honestly.

## 4. Evidence categories (A–K)
static, unit, contract, integration, api, browser, live, security,
performance, data, packaging (see packages/kernel/src/northstar/proof-testing.ts).

## 5. Default proof profiles
trivial-static, business-logic, api-service, ui-browser, mcp-session,
security, migration-data, performance-reliability. Profiles escalate
automatically but never silently downgrade.

## 6. Live-proof rules
Real live proof is required whenever the claim concerns browser behavior,
desktop behavior, MCP availability/tools, provider handshake, process/window
attribution, virtual desktop, focus, headed/visible mode, session persistence,
reconnect, resource recreation, network/provider behavior, host integration,
real authentication or real data-state. Use the smallest real provider that
proves the claim, with pinned versions; preserve owner desktop and focus; never
hide/minimize/virtualize/silently headless-fallback GUI providers; do not fake
PASS from static artifacts; report BLOCKED when the environment capability is
unavailable and UNSUPPORTED when the host cannot provide the seam. Unit tests
and fake environments may support live behavior but cannot replace live proof
for a live claim.

## 7. Failure semantics
Every proof result is exactly one of PASS | PARTIAL | BLOCKED | UNSUPPORTED |
PRE-EXISTING | NEEDS_USER. BLOCKED/UNSUPPORTED can never become PASS; failures
cannot be hidden by deleting or weakening tests; the whole task cannot be PASS
while a required claim remains unresolved.

## 8. Test-refactor policy
Global: audit and coverage-map before changing tests; protected tests
(security, authorization, data integrity, migration, concurrency, lifecycle,
regression, user-visible behavior) are preserved; record every
removed/merged/rewritten/downgraded test; run the post-refactor proof set;
compare behavior coverage before and after. Forbidden: deleting tests to make
CI green, weakening assertions, converting live tests to fake tests without a
claim change, silently skipping flaky tests, hiding failures behind retries,
changing expected behavior to fit tests, deleting tests without coverage
mapping, claiming coverage preserved without evidence.

## 9. Router and receipts
The verification router (packages/kernel/src/northstar/proof-router.ts) emits
a receipt with task identity, repository, changed scope, claims, risks,
selected proof profile, selected tests, omitted tests, omission reasons,
escalation decisions, environment, results, evidence references and final
status. The behavior works through the CLI (`agent-rules proof-plan`),
North-Star runtime, verification-router, plan/review/implementation flows,
handoff/resume flows, MCP/provider flows and platform adapters.

## 10. Enforcement
- Canonical implementation: packages/kernel/src/northstar/proof-testing.ts
  (trigger, profiles, selection, status, receipts, refactor policy),
  proof-router.ts (router), project-audit.ts (read-only project audit).
- Engine facade: packages/engine/src/northstar/ (re-exports).
- Schemas: schemas/proof-*.schema.json, schemas/test-refactor-matrix.schema.json.
- CLI: `agent-rules proof-plan`.
- Tests: packages/kernel/test/northstar/proof-*.test.ts (trigger, profile,
  selection, live, status, receipt, refactor, schema, eval-cases, project-audit).
- Validators: automation/validate-rule-contracts.py (this rule's contract),
  automation/validate-repo-facts.mjs (generated artifact parity).
