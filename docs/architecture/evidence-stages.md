# Evidence stages — what proof actually means (AM-0005)

Every claim is accepted on evidence, and evidence has two independent axes:

- **Integrity** (`EvidenceMaturity`, `packages/kernel/src/claim-registry.ts`):
  is the observation present, valid, fresh, independently reproduced?
- **Stage** (`EvidenceStage`, same canonical owner): what was actually
  executed to produce the observation?

The stage ladder (never auto-promoted):

| Stage | Proves | Does NOT prove |
|---|---|---|
| `SOURCE_VERIFIED` | Artifact parses/compiles; shape is structurally valid | Behavior, runtime, usage |
| `TEST_VERIFIED` | Deterministic unit/integration/contract tests pass | Real usage, live stability |
| `NATIVE_SMOKE_VERIFIED` | One real execution through the built/installed runtime on a defined host, bound to exact artifact/revision | That real work was done; sustained stability |
| `LIVE_CANDIDATE` | Representative real tasks exist and were executed | Sufficient observation for operational claims |
| `LIVE_OBSERVED` | Real usage observed with run/session identity, exact artifact/revision, host, outcome, evidence refs | Long-term stability, escaped-regression statistics |
| `OPERATIONALLY_PROVEN` | Repeated real tasks across friction, owner correction, rework, escaped regressions, statistically sufficient | — |
| `LIVE_UNPROVEN` | Honest terminal fallback when real usage cannot be observed | Anything else |

## Rules

1. A static/test PASS never satisfies a claim whose minimum stage is
   `LIVE_CANDIDATE`, `LIVE_OBSERVED`, or `OPERATIONALLY_PROVEN`.
2. A claim may declare its minimum stage (`required_stage` /
   `required_evidence_stage`). The acceptance reducer fails closed below it.
3. Unlabeled records (written before AM-0005) default to the `TEST_VERIFIED`
   floor — the strongest stage an unlabeled verifier-observed pass can
   honestly support. Nothing unlabeled ever reaches a live stage.
4. Synthetic fixtures are labeled synthetic and never counted as empirical.
5. Command labels ("dogfood" in script names/labels) never set a stage.
   Stage is set only by what was executed and observed.
6. If the host cannot collect real usage: `BLOCKED` or `LIVE_UNPROVEN` with
   the next action recorded. Never simulated data.

## Owner correction

After a PASS, an owner correction is a durable finding
(`evidence_defect` or equivalent, `schemas/repair-finding.schema.json`).
It increments known false-PASS (`automation/agent_quality.py`), selectively
reopens the affected claim in a new candidate epoch
(`packages/kernel/src/northstar/pair-repair.ts`), stales the affected
historical evidence for the new epoch, and requires fresh proof. Historical
PASS records are never rewritten.

## Where it is enforced

- Canonical owner of the ladder: `packages/kernel/src/claim-registry.ts`
- Acceptance reducer: `packages/kernel/src/northstar/evidence-ledger.ts`
  (`deriveAcceptance` + `ClaimAcceptancePolicy.required_stage`)
- Plan reconciliation: `packages/kernel/src/canonical-reconcile.ts`
  (`evidence_stage_boundary` check, driven by
  `verification-matrix.json` → `required_evidence_stage`)
- Schemas: `schemas/claim-evidence-envelope.schema.json`,
  `schemas/claim-evidence.schema.json`, `schemas/evidence.schema.json`,
  `schemas/telemetry-event.schema.json`
- Validator + fixtures: `automation/validate-evidence-stage.mjs`,
  `evals/harness/evidence-stage/`
- Telemetry: runner-emitted observations are labeled `NATIVE_SMOKE_VERIFIED`
  (real execution through the built runtime); live stages require explicit
  evidence labeling, never runner prose.
