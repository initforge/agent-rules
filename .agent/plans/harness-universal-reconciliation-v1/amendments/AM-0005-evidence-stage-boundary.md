# AM-0005 — Evidence-stage boundary: test/validator PASS is not live proof

Status: `OWNER_APPROVED_EFFECTIVE`

Applied to plan revision: `5`

## Owner correction

A validator PASS proves the artifact is shaped per contract. It does not prove
the harness was used for real workflows, that a runtime path is live, or that
the system is operationally stable. The harness must never label test-only
evidence with "dogfood", "live", or "operationally proven" semantics, and must
never derive terminal live status from a static validator.

This amendment records the evidence-classification defect in the current plan
(REQ-016 / AC-016 / C-016) and establishes the stage boundary as a typed,
enforced contract.

## Classification

- Class: `evidence_defect` (per AM-0003 pair-repair classification).
- Raw finding (preserved verbatim): "REQ-016 claims the phase dogfooded
  compiled recipes, reconciliation, provider routing, evidence, and runtime
  parity, but C-016's only evidence is `node automation/validate-entrypoint-parity.mjs`
  (a structural validator run at S8). Validator PASS was recorded in the ledger
  reconciliation as PASS for REQ-016 and interpreted as dogfood/live completion,
  though no real task, runtime execution, or empirical observation exists for
  the claim."
- Impacted acceptance: `AC-016` / claim `C-016` / requirement `REQ-016`.
- `REQ-019` / `AC-019` / `C-019` are reviewed and NOT affected: the claim
  requires the closed-loop *model* (typed sensors, failure-to-eval conversion,
  workaround retirement) to be traceable — this is provable by schema and
  validator evidence, and the claim text does not assert dogfood/live usage.
- Historical PASS for C-016 is retained verbatim. The S8 evidence file is not
  rewritten. For the new candidate epoch (2) the affected evidence is stale for
  live/dogfood acceptance; fresh live-stage proof is required.

## Evidence stages (single canonical owner: `packages/kernel/src/claim-registry.ts`)

A claim's acceptance may declare a minimum evidence stage. Evidence records
declare the stage they actually reached. One axis never promotes another:

1. `SOURCE_VERIFIED` — artifact parses/compiles; shape is structurally valid.
2. `TEST_VERIFIED` — deterministic unit/integration/contract tests pass.
3. `NATIVE_SMOKE_VERIFIED` — one real execution through the built/installed
   runtime on a defined host, bound to exact artifact/revision.
4. `LIVE_CANDIDATE` — representative real tasks exist and were executed, but
   observation is not yet sufficient or fresh for operational claims.
5. `LIVE_OBSERVED` — real usage observed with session/run identity, exact
   artifact/revision binding, host, outcome, and evidence refs.
6. `OPERATIONALLY_PROVEN` — repeated real tasks across friction, owner
   correction, rework, and escaped regressions with statistical sufficiency.
7. `LIVE_UNPROVEN` — live claims with no sufficient real usage (honest
   fallback; never derived from validators or fixtures).

## Rules

1. Test-only evidence never satisfies a claim whose minimum stage is
   `LIVE_CANDIDATE`, `LIVE_OBSERVED`, or `OPERATIONALLY_PROVEN`.
2. Static validators may still PASS the test-level claim they protect.
3. The acceptance reducer fails closed: a live/dogfood claim with only
   static/test evidence resolves to `PARTIAL`/`BLOCKED`/`LIVE_UNPROVEN`, never
   PASS.
4. Synthetic fixtures are always labeled synthetic and never counted as
   empirical metrics.
5. An owner correction after a PASS is recorded as a durable finding
   (`evidence_defect` or equivalent), increments known false-PASS, and
   selectively reopens the affected claim in a new candidate epoch without
   rewriting history.
6. Command labels ("dogfood" in script names/labels) do not set evidence
   stage. Stage is set only by what was actually executed and observed.
7. If the host cannot collect real usage, the result is `BLOCKED` or
   `LIVE_UNPROVEN` with the next action recorded — never simulated data.
8. No minimum task-count is hardcoded globally; a bounded risk-aware policy
   (5–10 representative real tasks for a pilot) is configured and adjustable
   per profile/risk class.

## Impact on this plan

- REQ-016 remains legitimately proven at the structural/test level
  (`TEST_VERIFIED`): compiled recipes, entrypoint parity, and reconciliation
  validators stay green and valuable.
- The dogfood/live portion of REQ-016 is NOT proven. Ledger reconciliation for
  REQ-016 is narrowed to `PARTIAL` with reason, and the affected evidence is
  stale for epoch 2.
- The plan remains non-terminal until fresh real usage is observed; otherwise
  it ends honestly at `LIVE_UNPROVEN`/`LIVE_CANDIDATE`/`PARTIAL`.
- `npm run verify:all` labels that use the word "dogfood" are renamed to
  describe what they actually check (structural parity / explicit-only probe).
