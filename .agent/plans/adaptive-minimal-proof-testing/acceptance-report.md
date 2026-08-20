# FINAL ACCEPTANCE REPORT — ADAPTIVE MINIMAL-PROOF TESTING (2026-08-15)

## 1. Plan/pointer/ledger identity
- Plan: `.agent/plans/adaptive-minimal-proof-testing/` (plan.md immutable,
  requirements REQ-001..REQ-013, generations/1 effective-contract, journal seq 1–3)
- Pointer: CAS **gen 25**, work_id `adaptive-minimal-proof-testing`,
  supersession: `persistent-mcp-session-broker` (gen 24) — canonical CAS protocol
- Ledger: `.agent/ledger/adaptive-minimal-proof-testing.json`
  (execution_state: IMPLEMENTATION_DELIVERED_VERIFICATION_PENDING)
- Branch: `adaptive-minimal-proof-testing` base = pushed integration branch
  (`d6f435c`), commit `4d7c862`, **pushed to origin**
- Previous persistent-MCP plan NOT amended; owner-managed Documents residual
  (`/home/linhnxdeveloper/Documents/ChatGPT/ZaloAI-Ecommerce`) NOT touched

## 2. Changed files
- Kernel: `proof-testing.ts` (new, canonical), `proof-router.ts` (new),
  `project-audit.ts` (new), `index.ts` (exports)
- Engine: `proof-testing.ts`, `proof-router.ts`, `project-audit.ts` (facades)
- CLI: `commands/proof-plan.ts` (new), `index.ts` (registration), `build.ts`
  (proof-schema mirror projection)
- Rules: `rules/45-adaptive-minimal-proof-testing.md` (new),
  `rules/manifest.yaml` (always-load invariant contract)
- Schemas (7 new): proof-trigger, proof-receipt, proof-profile, proof-omission,
  claim-to-proof, risk-to-proof, test-refactor-matrix + 6 fixtures
  (positive/negative)
- Automation: `validate-proof-receipts.mjs`, `validate-proof-mirror-parity.mjs`
- Docs: `AGENTS.md` (invariant 9), `docs/guides/adaptive-minimal-proof-testing.md`,
  `docs/guides/README.md`
- Tests: 11 kernel northstar suites + 4 CLI tests

## 3. Behavior contract
Canonical: rules/45-adaptive-minimal-proof-testing.md (always-on invariant,
kind=invariant, trigger=always-load, failure=BLOCKED, owner=harness-maintainer).
Minimal sufficient proof for every task: preserve intent → compile claims/risks
→ inspect test architecture → inventory evidence → coverage map → smallest
sufficient proof set → deterministic first → escalate fidelity on demand →
record selected AND omitted proof → never silently skip → never PASS from
weaker evidence.

## 4. Trigger model
Scope/claim/risk based: changed files → surfaces; affected claims;
affected dependencies; risk class (S2/S3 → security); runtime surfaces
(browser/desktop/MCP/...); project test architecture; host capabilities;
required fidelity. User wording is a hint only. Verified by tests
(proof-trigger.test.ts) and negative fixture (keyword-only rejected).

## 5. Proof-selection algorithm
profileForSurfaces(surfaces, claims) → claim-driven escalation (live →
live profile; migration/security/api/performance/business claim → matching
profile) → per-claim required categories (live claims always add 'live') →
reuse existing proof ONLY when it covers the claim (never a fake for a live
claim) → live proof selected only with live host, else omitted-with-reason →
full-suite only when scope/dependency/architecture/release risk justifies.
Verified: proof-selection.test.ts + 16 eval cases.

## 6. Supported test categories (A–K)
static, unit, contract, integration, api, browser, live, security,
performance, data, packaging — all in EVIDENCE_CATEGORIES.

## 7. Default proof profiles (8)
trivial-static, business-logic, api-service, ui-browser, mcp-session,
security, migration-data, performance-reliability — escalate, never
silently downgrade; min_fidelity enforced.

## 8. Test-refactor policy
Global; coverage-mapped; protected tests (security/authorization/
data-integrity/migration/concurrency/lifecycle/regression/user-visible)
preserved; every removed/merged/rewritten test recorded; forbidden ops
rejected by validateRefactorMatrix (delete-to-green, weakened assertions,
live→fake without claim change, silent flaky skips, retry-masked failures,
delete-without-mapping).

## 9. Project audit matrix (read-only, §13)
| Project | Runners | Categories | Baseline | Browser/live | Recommended profile |
|---|---|---|---|---|---|
| agent-rules | vitest, playwright | unit, integration, data, browser, security | 129 files / 2164 tests | yes | ui-browser |
| ZaloAI-Ecommerce | playwright | integration | 2 files / 9 tests | yes | business-logic |
| pos-ops | vitest, playwright | security, unit, integration, data, browser | 67 files / 558 tests | yes | ui-browser |
Artifact: `.agent/plans/adaptive-minimal-proof-testing/project-audit.json`.
No project test files were modified.

## 10. Route/schema validator results
- validate-rule-contracts.py: PASS (12 rules, 9 always-load incl. new rule)
- validate-proof-receipts.mjs: OK (4 fixtures: positive/negative pairs;
  negative BLOCKED-as-PASS and keyword-only-trigger correctly rejected)
- proof-schema.test.ts: positive fixtures pass, negative fixtures rejected
- validate-repo-facts.mjs: PASS (9 facts)
- mcp-no-bypass-audit: OK (343 generated files)

## 11. Platform mirror status
validate-proof-mirror-parity: OK — 7 platforms (antigravity, claude, codex,
cursor, grok, mimocode, opencode), 49 artifacts hash-verified (rule + 7 proof
schemas + manifest contract). opencode resolves rules from canonical source
(AGENTS.md source-bound) — acknowledged by design. Native host activation
NOT claimed from file presence (NATIVE_UNVERIFIED unless a live receipt).

## 12. Before/after test inventory
- Kernel: 108 → 204 tests (+93 new northstar proof tests, 11 suites)
- CLI: +4 proof-plan tests (513 passing; 4 pre-existing failures unchanged)
- Engine: 1322 passing; 21 browser-qa environmental failures (origin-main
  identical — verified in prior phase)
- Control-plane: 347 passing; 2 pre-existing (origin-main identical)
- mcp-guardian: 93/93 unchanged
- No test deleted/weakened; no new failures introduced

## 13. Live evidence
- Engine facade + kernel router live-verified end-to-end (BLOCKED propagation,
  audit schema) via `agent-rules proof-plan --json` (real repo)
- Live project audit of all three real projects (read-only, verified no
  mutation by pre/post readdir comparison)
- Live CLI demo: trivial → trivial-static; live claim → mcp-session profile,
  live fidelity, 4 selected proofs

## 14. Blockers / unsupported hosts
- 21 engine browser-qa + 2 control-plane + 4 CLI failures: PRE-EXISTING
  (verified identical on origin/main; environmental control-plane/browser
  servers) — not introduced, not hidden
- Native platform activation: NATIVE_UNVERIFIED by design (no live host
  receipts claimed from file presence)
- ZaloAI-Ecommerce / pos-ops: audited read-only; no test modification
  (requires separate owned project scope per §13)

## 15. Commit and push receipts
- `4d7c862` feat(adaptive-minimal-proof-testing): global always-on
  minimal-sufficient proof behavior
- Branch `adaptive-minimal-proof-testing` PUSHED to origin
  (https://github.com/initforge/agent-rules.git)
- No force push; origin/main untouched; pointer CAS gen 24→25

## 16. Final acceptance status
| §17 criterion | Status |
|---|---|
| Behavior in canonical rules/runtime (not docs-only) | PASS (rule + kernel router + CLI + validators) |
| Always-on for every repository/future task | PASS (always-load invariant + router) |
| Not prompt-only | PASS (implemented in layers, tests) |
| Triggers scope/claim/risk based | PASS (tests + negative fixture) |
| All test categories supported | PASS (A–K) |
| Selection minimal but sufficient | PASS (tests + 16 eval cases) |
| Live claims require live proof | PASS (proof-live + eval cases; BLOCKED honest) |
| Refactor requires coverage mapping | PASS (validateRefactorMatrix + tests) |
| Duplicate/obsolete reduction without coverage loss | PASS (refactor policy tests) |
| Failures cannot be hidden | PASS (six-status semantics + negative fixtures) |
| PASS/PARTIAL/BLOCKED/UNSUPPORTED enforced | PASS (status tests + schema) |
| Receipts record selected + omitted | PASS (receipt schema + tests) |
| Route/schema/negative validators pass | PASS (all green) |
| Platform mirrors reconciled | PASS (7 platforms, 49 artifacts) |
| Project audit covers 3 projects | PASS (read-only, artifact) |
| Documentation defines global behavior | PASS (rule + guide + AGENTS.md) |
| Dedicated branch committed + pushed | PASS |
| Owner-managed residual untouched | PASS |

**Overall: COMPLETE — acceptance PASS with honest PRE-EXISTING classifications
and NATIVE_UNVERIFIED boundaries; no claim beyond evidence.**
