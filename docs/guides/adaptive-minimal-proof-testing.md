# Adaptive Minimal-Proof Testing — Global Harness Behavior

Status: **always-on invariant** (rules/20-proof-outcome.md — adaptive minimal-proof owner).
Applies to every repository, task, host, MCP provider, integration and
supported agent-rules platform. Not prompt-only, not batch-local, not optional.

## 1. What it is

For every task the harness selects the **smallest proof set that can actually
prove the task's claims** — minimal sufficient proof, not minimum effort and
not maximum test count. It never runs every test mechanically. A full-suite run
is required only when changed scope, dependency impact, architecture impact,
release risk or regression risk justifies it.

## 2. Canonical implementation map

| Layer | Path |
|---|---|
| Rule (always-on) | `rules/20-proof-outcome.md` |
| Rule contract | `rules/manifest.yaml` (`20-proof-outcome.md` entry) |
| Kernel: trigger, profiles, selection, status, receipts, refactor policy | `packages/kernel/src/northstar/proof-testing.ts` |
| Kernel: verification router | `packages/kernel/src/northstar/proof-router.ts` |
| Kernel: read-only project audit | `packages/kernel/src/northstar/project-audit.ts` |
| Engine facade | `packages/engine/src/northstar/proof-*.ts`, `project-audit.ts` |
| Schemas | `schemas/proof-trigger.schema.json`, `proof-receipt.schema.json`, `proof-profile.schema.json`, `proof-omission.schema.json`, `claim-to-proof.schema.json`, `risk-to-proof.schema.json`, `test-refactor-matrix.schema.json` |
| CLI | `agent-rules run` (minimal-proof selection is embedded in every North-Star run via the kernel proof router; standalone `proof-plan` command removed) |
| Validators | `automation/validate-proof-receipts.mjs`, `automation/validate-proof-mirror-parity.mjs` |
| Tests | `packages/kernel/test/northstar/proof-*.test.ts` (10 suites, 93 tests) |
| Project audit artifact | `.agent/plans/adaptive-minimal-proof-testing/project-audit.json` |

## 3. Trigger model

Activation derives from **changed scope, affected claims, affected
dependencies, risk class, runtime surface, project test architecture, host
capability and required evidence fidelity** — never from keywords alone. User
wording is a hint only.

## 4. Proof selection

1. Preserve raw intent. 2. Identify changed files/components. 3. Compile
claims/risks. 4. Inspect project test commands/architecture. 5. Inventory
evidence. 6. Build behavior-to-evidence map. 7. Select smallest sufficient
proof set. 8. Deterministic first. 9. Escalate fidelity only when required.
10–11. Record selected AND omitted proof with reasons. 12. Never silently skip.
13. Never PASS from weaker evidence. 14. Report limitations honestly.

## 5. Evidence categories (A–K)

static, unit, contract, integration, api, browser, live, security,
performance, data, packaging.

## 6. Default proof profiles

trivial-static, business-logic, api-service, ui-browser, mcp-session,
security, migration-data, performance-reliability. Profiles escalate
automatically, never silently downgrade.

## 7. Live-proof rules

Live claims (browser, desktop, MCP availability/tools, handshake,
process/window attribution, virtual desktop, focus, headed/visible mode,
session persistence, reconnect, resource recreation, network/provider, host
integration, real auth, real data-state) require real live proof — smallest
real provider, pinned versions, owner desktop/focus preserved, no hidden/
minimized/virtualized/silent-headless fallback for GUI providers, BLOCKED when
the environment capability is missing, UNSUPPORTED when the host cannot
provide the seam. Unit/fake evidence cannot replace live proof for a live claim.

## 8. Failure semantics

Exactly one of PASS | PARTIAL | BLOCKED | UNSUPPORTED | PRE-EXISTING |
NEEDS_USER. BLOCKED/UNSUPPORTED can never become PASS. Failures cannot be
hidden by deleting or weakening tests. The whole task cannot be PASS while a
required claim remains unresolved.

## 9. Test-refactor policy

Global: audit + coverage map before changing tests; protected tests
(security, authorization, data integrity, migration, concurrency, lifecycle,
regression, user-visible behavior) preserved; record every removed/merged/
rewritten/downgraded test; post-refactor proof run; before/after coverage
comparison. Forbidden: delete-to-green, weakened assertions, live→fake without
claim change, silent flaky skips, retry-masked failures, behavior-change-to-fit
tests, delete-without-mapping, coverage claims without evidence.

## 10. Usage

```bash
# Every North-Star run selects the smallest sufficient proof set and records a
# receipt with selected AND omitted proof. Selection is embedded in
# `agent-rules run` (routed by packages/kernel/src/northstar/proof-router.ts);
# there is no standalone proof-plan command.
agent-rules run "<task>" --own <path> --verify-exec <exe> --verify-arg <arg>
# Validate proof receipts + fixtures
node automation/validate-proof-receipts.mjs
# Validate platform mirror parity (run after npm run build)
node automation/validate-proof-mirror-parity.mjs
# Read-only project audit (programmatic)
node -e "import('./packages/kernel/dist/northstar/project-audit.js').then(m=>console.log(JSON.stringify(m.auditProject({repoRoot:'/path/to/repo'}),null,2)))"
```

## 11. Guarantees

- Always-on for every repository and future task (rule + router, not prompts).
- No keyword-only trigger.
- All evidence categories supported; selection minimal but sufficient.
- Live claims require live proof; no silent headless fallback.
- Refactors require coverage mapping; protected tests preserved.
- Failures cannot be hidden by deleting or weakening tests.
- Six-status semantics enforced; receipts record selected and omitted proof.
- Route/schema/negative validators pass; platform mirrors reconciled
  (source rule → generated route → installed mirror, hash-verified).
- Native host activation is never claimed from static file presence
  (NATIVE_UNVERIFIED unless a live host receipt exists).
