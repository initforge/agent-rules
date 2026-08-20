# AM-0002 — Full Adoption Mode (owner decision revision)

Amendment ID: AM-0002
Type: repair amendment (owner decision revision)
Date: 2026-08-14
Authority: owner decision revision transmitted as "FULL ADOPTION MODE — SKILL /
PROVIDER / MCP FABRIC".

## Revised decisions

- **DEC-005 (revised):** `selected_external_skills` is no longer kept empty.
  All external skill records and local composition candidates named by the
  research are reconciled into `MATERIALIZED_SKILL`, `MATERIALIZED_PROVIDER`,
  or `BLOCKED_WITH_EXACT_REASON` states.
- **DEC-007 (revised):** no source content is silently copied or executed;
  materialization is artifact-first: harness-owned provenance projections
  (SKILL.md + ROUTE.json) are materialized for every record, and upstream
  *content* materialization is gated by license/security evidence. Sources
  without an established license in the pinned tree are content-BLOCKED with
  the exact reason, never silently dropped.

## Scope (verbatim owner requirements)

1. Keep and route all 16 local skills (14 core + 2 profile).
2. Materialize/reconcile all 9 local candidates
   (frontend-design-contract, mobile-composition, backend-composition,
   database-stack, schema-migration, infra-devops-composition,
   security-review, claim-test-strategy, external-skill-governance).
3. Materialize/reconcile all 13 external records (11 skill sources +
   agent-device + chrome-devtools-mcp providers).
4. Every record ends in MATERIALIZED_SKILL / MATERIALIZED_PROVIDER /
   BLOCKED_WITH_EXACT_REASON.
5. Every materialized skill carries SKILL.md, ROUTE.json, source URL,
   immutable revision, content/tree hash, license, security review,
   permission review, install authority, trigger facts, activation class,
   provider/capability mapping, rollback path, host compatibility, eval
   status.
6. No materialized skill lacks a trigger; validators fail on missing route;
   triggers use deterministic RepoFacts/TaskFacts where possible and record an
   activation class (NATIVE / ROUTED / EXPLICIT / ON_DEMAND /
   PROVIDER_ROUTE / SEMANTIC_DISCOVERY).
7. Domain routing for frontend, mobile, backend, database, infra, security,
   QA.
8. Effectful/high-risk sources stay non-always-on (Impeccable explicit,
   Trail of Bits explicit security route, Pencil explicit-only, agent-device
   explicit, Chrome DevTools escalation, RTK middleware, Context7 on-demand,
   Serena explicit experimental).
9. No bypass of source pinning, hash verification, license/security review,
   permission review, rollback, host compatibility, route coverage, eval
   evidence. Full adoption never means running unlocked sources, `@latest`,
   global MCP, or skipping provider safety.
10. candidate-fabric: selected_external_skills lists all materialized
    external skill records; provider records typed provider/MCP; local
    candidates carry materialization receipts; every record carries route and
    rollback receipts.
11. Validators fail when: selected candidate lacks a materialized artifact;
    materialized skill lacks SKILL.md; materialized skill lacks ROUTE.json;
    provider lacks a capability route; route is keyword-only; source lacks an
    immutable pin/hash; registry and candidate-fabric diverge; selected set
    does not match the materialized set.
12. Invariants preserved: workers never author PASS; kernel owns scope/
    planning/verification/evidence/completion; global MCP=none; Pencil
    explicit-only; no hand edits of generated/; no legacy deletion before
    parity; no commit/push/deploy.
13. Traceability: plan.json lists CLM-001..CLM-014; ledger maps REQ-001..
    REQ-014; AC-001..AC-014 carry evidence; this repair amendment supersedes
    the previously hash-bound plan artifacts.
14. Full adoption report with install receipts, rollback receipts, route
    coverage, tests/evals, and remaining blockers.

## Materialization model (fail-closed)

- **Local candidates** → real local skills under `skills/<id>/` (harness-owned
  content: SKILL.md + ROUTE.json). No external license concern.
- **External skill sources** → repository-local provenance projections under
  `skills/external/<id>/` (harness-owned metadata: source URL, pinned commit,
  tree hash, license evidence, security scan receipt, permission model,
  install authority, activation class, rollback). Upstream *content* is never
  copied into the repository; `content_materialization` records the gate
  result (MATERIALIZED when license/security evidence exists, BLOCKED with
  exact reason otherwise). All 11 sources keep artifacts and routes.
- **Providers** → materialized integration records: agent-device added under
  `integrations/recommended/agent-device/` + registry entry (explicit-only);
  chrome-devtools-mcp already materialized (reconcile receipt).
- **Security review** → real static provenance scan of each pinned tree
  (file inventory, opaque binary detection, script/hook inventory) recorded as
  evidence; approval is scan-level, execution authority stays NONE.
