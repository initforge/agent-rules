# AM-0020 — Epistemic Integrity, Adversarial Review, and Truthful Terminal Reporting

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

## 1. Owner decision and preservation

AM-0020 is additive after AM-0019. It does not rewrite `original.md`, delete
M11-R11 through M11-R26, weaken an earlier quality gate, or erase superseded
history. It closes a newly demonstrated systemic failure: incomplete or
capability-invalid review can produce false ACCEPT, stop remediation, corrupt
ledger/terminal state and cause the main agent to report completion incorrectly.

The canonical outcome is:

```text
Effective Plan
→ Claim Registry
→ Immutable Candidate Epoch
→ Evidence Production
→ Evidence Validation and Freshness
→ Specialist Review
→ Repair and Reverification
→ Integration Review
→ Blind Adversarial Challenge
→ Conflict Adjudication when required
→ Reconciliation
→ Machine Terminal Report
→ Main Agent Explanation
```

Workers produce candidates, not verdicts. Verifiers prove executable behavior.
Reviewers can accept only their exact claim scope. Main agents may explain the
machine packet but cannot upgrade or downgrade its verdict. Only the engine
terminal gate can determine project state.

DeepSeek remains the economical implementation engine. Stronger or different-
provider reviewers are routed only at risk boundaries where a false ACCEPT has
material consequences.

## 2. Claim semantics registry

Each effective requirement compiles into one or more `ClaimDefinition` records:

```text
claim_id
plan_anchor
meaning
scope
risk_tier
positive_invariants
negative_invariants
required_evidence
required_capabilities
freshness_dependencies
allowed_deviations
terminal_weight
```

Evidence maturity states:

```text
UNOBSERVED
PRESENT
VALID
FRESH
INDEPENDENTLY_REPRODUCED
TERMINAL_ELIGIBLE
PARTIAL
CONTRADICTED
WAITING_CAPABILITY
SUPERSEDED
```

`PASS`, `ready`, `parity`, `CDP`, `production-like`, `clean` and other aggregate
terms are valid only when the corresponding machine formula is satisfied. A
reviewer or report cannot redefine these terms through prose rationale.

`LOCAL_READY`, `STAGING_READY`, `PRODUCTION_READY` and
`HV3_M11_LOCAL_COMPLETE` are engine-computed claim formulas. One required
`PARTIAL`, `CONTRADICTED`, stale or capability-invalid subclaim prevents
aggregate completion.

## 3. Immutable candidate epoch

Every final verification cycle binds to a `CandidateEpoch`:

```text
source_tree_sha
candidate_commit_or_tree
artifact_digest
container_image_digests
dependency_lock_hash
migration_set_hash
environment_hash
fixture_hash
topology_hash
created_at
```

A dirty worktree is allowed for implementation but cannot be the terminal
candidate. Before terminal evidence, create a local candidate commit, Git tree
object or equivalent content-addressed snapshot.

Any source, config, lockfile, migration, runner or tool change creates a new
candidate/evidence epoch. The freshness graph invalidates only dependent proof
for incremental work, but the final candidate always receives a full required
convergence run. A container, browser server, database snapshot or fixture
created before the candidate cannot prove the candidate unless its digest and
dependency relation demonstrate equivalence.

## 4. Evidence envelope and promotion

Every evidence record contains:

```text
evidence_id
claim_ids
candidate_epoch
producer
tool_and_runner_hash
command
exit_code
started_at
finished_at
raw_artifact_hashes
environment_and_fixture
coverage
limitations
freshness
```

Promotion path:

```text
PRESENT
→ PARSEABLE
→ SEMANTICALLY_VALID
→ BINDS_FINAL_CANDIDATE
→ CAPABILITY_VALID
→ INDEPENDENTLY_REPRODUCED
→ TERMINAL_ELIGIBLE
```

Examples enforced by the engine:

- Screenshot existence proves `PRESENT`, not visual parity.
- Wrong reference state fails `SEMANTICALLY_VALID`.
- Playwright Chromium without a CDP session cannot prove `RAW_CDP`.
- A no-vision reviewer cannot prove visual/taste parity.
- A test log produced before the final fix cannot bind the final candidate.
- A worker rerunning its own test does not prove independent reproduction.

Raw logs/artifacts are canonical evidence; summaries are derived projections.

## 5. Reviewer receipt and independence

`ReviewReceipt` requires:

```text
review_id
claim_scope
risk_tier
candidate_epoch
reviewer_session
reviewer_model_provider_effort
capability_attestation
independence_proof
blind_review_completed
threat_hypotheses
adversarial_probes
evidence_reproduced
findings
coverage
verdict
confidence
limitations
```

Allowed verdicts:

```text
ACCEPT_SCOPE
NEEDS_REPAIR
REJECT_EVIDENCE
REVIEW_CONFLICT
CAPABILITY_MISSING
```

`ACCEPT_SCOPE` never means project complete. Self-review, same-session review,
review on a different candidate, missing capability or missing independence
proof is invalid. Any post-review change affecting the claim makes the receipt
stale.

Blind review is mandatory: reviewer reads plan, candidate and raw evidence,
creates threat hypotheses and probes before reading the worker's verdict. Only
after that pass may it compare the worker report to ground truth.

Review disagreements are not majority-voted. `REVIEW_CONFLICT` is resolved by
deterministic reproduction where possible, otherwise by a strong adjudicator
given both arguments, the plan, candidate and raw evidence.

## 6. Risk-tiered review topology

| Tier | Scope | Required review |
|---|---|---|
| T0 | Mechanical/generated/deterministic | Deterministic verifier; LLM reviewer optional |
| T1 | Standard isolated behavior | One independent economical reviewer |
| T2 | Business logic/integration/auth | Specialist reviewer plus adversarial probe |
| T3 | Finance/concurrency/security/migration/release | Two independent reviewers; at least one strong or different-provider reviewer |
| T-Visual | UI parity/taste | Deterministic visual compiler plus a vision-capable reviewer |
| T-Global | Architecture/terminal release | Sharded specialist reviews plus blind final challenger |

Per branch:

```text
Writer → focused verifier → independent scope reviewer
→ consolidated repair pack → repair writer → fresh verifier/reviewer
```

After rolling integration:

```text
Integrated snapshot → contract/regression review
→ topology-impact review when applicable
```

Before terminal, architecture/maintainability, security/domain,
full-stack/release and UX/visual/accessibility reviews run in parallel. Their
accepted scopes feed a blind adversarial challenger. An adjudicator is spawned
only for unresolved conflicts.

Review findings are normalized, deduplicated and consolidated by root cause into
bounded repair packs. Review is sharded to preserve AM-0019 concurrency rather
than turning the system back into a sequential pipeline.

## 7. Adversarial counterexample compiler

The harness generates negative probes from plan invariants, topology and domain
profiles.

Finance/concurrency:

- Cross-organization and cross-tenant references.
- Double approval and duplicate idempotency key.
- Concurrent capacity oversubscription.
- TOCTOU between validation and commit.
- Partial transaction/crash recovery.
- Zero, negative, overflow and rounding boundaries.

Authorization/security:

- Wrong owner/object and cross-role access.
- Missing default-deny declaration.
- Enumeration/anti-oracle behavior.
- Stale/revoked token and proxy/header spoofing.

Browser/parity:

- Wrong reference-state mapping.
- Missing control/content/media.
- Redirect-to-home false-green.
- Console/network error during route mount.
- CDP buffer reset or double capture.
- Vacuous focus/accessibility assertions.
- Viewport, fixture, auth-role or theme mismatch.

Release:

- Test evidence preceding the final fix.
- Container/image preceding the final source epoch.
- Mutable image/dependency.
- Untracked build-critical source.
- Fresh-install/upgrade/rollback migration mismatch.

A T2/T3 claim cannot be accepted without a negative probe unless a deterministic
proof makes the probe formally unnecessary and the reviewer records why.

## 8. Cross-artifact consistency validator

The engine validates:

- Test totals from raw runner output versus summaries and final report.
- Warning/error presence versus claims that they were removed.
- Ledger status versus milestone/report status.
- Open finding severity and disposition.
- Evidence time and candidate epoch.
- Source tree versus installed artifact and container image.
- Required coverage versus routes/roles/viewports/states actually tested.
- Reviewer capabilities versus verdict type.
- `PARTIAL`, `HIGH_DIFF`, `SKIPPED`, `UNVERIFIED` or advisory records hidden by an
  aggregate PASS.
- CDP claims versus actual CDP API/session use.
- Reference-target pair identity and environmental equivalence.

Any contradiction creates a finding and blocks only affected claims. It cannot
be silenced with report prose.

## 9. Machine-generated terminal report

The terminal report is generated from the canonical ledger and contains:

```text
candidate identity
claim coverage
evidence maturity and freshness
review coverage and capabilities
open findings
CI/install/topology/parity/attestation bindings
residuals
terminal formula result
```

An LLM may translate and explain the packet in Vietnamese, but may not add a
PASS, delete a residual or upgrade a milestone. A terminal marker written by an
LLM/Markdown outside an engine event is invalid.

The report compiler fails closed when required evidence is stale, capability is
missing, a blocking finding is open, report totals conflict with raw artifacts,
or candidate/CI/install identities differ.

## 10. Calibration and model routing

Telemetry records:

- Worker self-PASS later rejected.
- Reviewer ACCEPT later rejected by challenger.
- False rejection overturned by adjudication.
- Defect escape by model/provider/domain.
- Duplicate findings and repair-loop count.
- Review latency/token/cost.
- Capability mismatch and evidence invalidation cost.

DeepSeek Flash High remains the primary writer. Flash Max handles difficult
repair. DeepSeek Pro or a strong different-provider reviewer is reserved for
T3/T-Global, repeated root-cause failure, security/architecture ambiguity or
review conflict. No strong model is consumed for T0/mechanical work.

Model reputation alone never authorizes a verdict; historical calibration,
capability and exact evidence do.

## 11. Controlled false-green and false-reject evaluations

Mini TOEIC-derived fixtures, without mutating that repository:

- All screenshot files exist but canonical states are mismapped.
- High pixel differences are upgraded by a no-vision reviewer.
- Playwright Chromium is reported as CDP.
- Offline `PARTIAL-PASS` is aggregated into ready.
- Security/advisory findings remain open.
- Journeys predate final source changes.
- Ledger is partial/unverified while report says staging-ready.
- Build-critical untracked files are absent from candidate manifest.

POS Ops-derived fixtures, without mutating that repository:

- CDP runner resets console/network buffers after route mount.
- Partial route/role coverage is described as full parity.
- Container and database snapshot predate final fixes.
- Test counts conflict across log, summary and report.
- Raw warning remains while summary says it is gone.
- Cross-org employee assignment succeeds.
- Concurrent clawbacks exceed capacity.
- Zero financial amount passes one trust boundary.
- Ledger, Golden Contract and finding statuses disagree.

False-reject fixtures prove expected 401/404/409, approved design-token deviation,
properly dispositioned non-exploitable advisories and resolved historical
findings do not cause infinite remediation.

Required acceptance:

- 100% seeded false-green fixtures are blocked.
- 100% known-good fixtures reach the correct status.
- Zero self-review terminal path.
- Zero capability-invalid PASS.
- Zero terminal report not bound to the final candidate.
- Zero unbounded same-root repair loop.
- Independent ready work continues during review conflict/capability wait.

## 12. Control Plane and adapter enforcement

Control Plane adds claim maturity, evidence freshness DAG, candidate identity,
reviewer independence/capability, blind/challenge/adjudication status,
calibration, contradictions and repair history. Green state cannot be derived
from reviewer count or test count alone.

Tier-A adapters must provide distinct writer/reviewer sessions, read-only review,
model and capability observation, candidate binding, Stop/resume continuity and
strong-review routing. No silent model/capability substitution is allowed.

## 13. Trade-off policy

- T0 does not require an LLM reviewer when deterministic proof is complete.
- T1 uses one reviewer; T2/T3 add review strength according to material risk.
- Review-of-review occurs only for T3/T-Global or actual conflict.
- Incremental freshness invalidation reruns only affected gates during work;
  final candidate still runs complete required convergence once.
- Provider/capability waiting blocks only affected claims.
- Strict metadata/evidence faults are repaired in their owning subsystem rather
  than mislabeled product defects.
- New adversarial findings must map to a plan invariant or approved amendment to
  prevent scope creep.
- Review overhead, false-positive and false-negative rates are measured and fed
  back into routing.

## 14. Additive requirements

- M11-R27 Claim semantics registry.
- M11-R28 Evidence provenance and freshness DAG.
- M11-R29 Capability-qualified verdicts.
- M11-R30 Adversarial counterexample compiler.
- M11-R31 Reviewer independence and diversity.
- M11-R32 Immutable candidate verification.
- M11-R33 Cross-artifact consistency validation.
- M11-R34 Machine-generated terminal reporting.
- M11-R35 Seeded false-green/false-reject evaluation.
- M11-R36 Claim calibration telemetry.

## 15. Activation and terminal contract

Before any final review or M11 terminal decision:

1. Let any currently running non-mutating test command finish and retain its raw
   output as candidate evidence.
2. Verify original, AM-0019 and this file by raw SHA-256.
3. Activate AM-0020 after AM-0019 through the canonical atomic engine API.
4. Recompute effective identity and stale old review/terminal claims for the new
   semantics.
5. Regenerate shadows/projections and retain `NEEDS_REMEDIATION`.
6. Treat reviews performed under the previous contract as candidate evidence;
   they are not terminal-eligible until capability, independence, freshness and
   claim-scope validation succeeds.
7. Implement and dogfood AM-0020 immediately using the AM-0019 native swarm,
   rolling integration and resource-governor behavior.
8. Continue repair/review/reconciliation until all R01–R36 are `MATCH` or
   approved `SUPERSEDED` and fresh engine evidence permits
   `HV3_M11_LOCAL_COMPLETE`.

The local-main, remote-push and branch-cleanup boundary remains exactly as
defined by AM-0019.
