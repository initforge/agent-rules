# AM-0012 — Native swarm, artifact handoff, sharded assurance, and fitness closure

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This is an additive owner-approved amendment. It supplements the immutable
original plan and the ordered approved amendment chain. It does not rewrite
`original.md`, any prior amendment, or historical evidence.

Immutable original SHA-256:
`c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`

AM-0004 remains absent and tombstoned.

## 1. Owner decisions and supersession

### 1.1 Remove cross-host live OpenCode session control

The harness must remove every active path where Codex or another host creates,
polls, resumes, interrupts, supervises, or controls OpenCode through durable live
sessions.

The following concepts are superseded:

- `CODEX_FEDERATED`.
- `SUPERVISED_SESSION`.
- Promotion from artifact handoff into a live OpenCode session.
- OpenCode live-session bridge, parent/child session controller, session cursor,
  and host-to-OpenCode session supervision as certified harness capabilities.
- Fixed one-supervisor or dual-supervisor topology as the execution default.

This supersedes only the live-session orchestration portions of AM-0006,
AM-0008, AM-0009, AM-0010 and AM-0011. Their durable execution lessons remain
requirements where they are transport-neutral.

### 1.2 Preserve OpenCode as an optional artifact-handoff host

OpenCode remains a valid optional host that may:

- Import and validate an immutable `.agent` bundle.
- Execute assignments locally under its own native agent capability.
- Return normalized diff, artifact, test, review and attestation receipts.
- Export the updated bundle for independent verification and integration.

OpenCode must not:

- Become the required controller for another host.
- Be controlled through live sessions by Codex or another platform.
- Rewrite the immutable original plan.
- Merge or declare global completion without the harness terminal authority.

OpenCode absence does not block the default native-swarm run. When an OpenCode
artifact-handoff capability is explicitly selected, its adapter and receipt must
still certify truthfully. Synthetic OpenCode attestation is prohibited.

### 1.3 Execution modes

The canonical execution modes become:

```text
NATIVE_SWARM
ARTIFACT_HANDOFF
SINGLE_AGENT
```

- `NATIVE_SWARM` is the default when the active host exposes native subagents.
- `ARTIFACT_HANDOFF` transfers an immutable execution bundle between hosts.
- `SINGLE_AGENT` is the bounded fallback when native delegation is unavailable.

Legacy live-session modes must be rejected by schema, resolver, CLI, UI,
platform adapters and certification fixtures after migration.

## 2. Plan recognition, adoption, and authorization

The harness must support both owner workflows without requiring a custom prompt
sequence.

### 2.1 Prebuilt `.agent` bundle

When Codex or another planner has already produced `.agent` artifacts, the
receiving host must:

1. Locate and validate the bundle.
2. Verify original bytes, original SHA-256, ordered amendments and baseline.
3. Reject competing ledgers or rewritten originals.
4. Import or resume the canonical work ledger.
5. Compile remaining requirements into the execution graph.
6. Begin execution only when the bundle or owner message carries explicit
   execution authorization.

### 2.2 Full plan pasted or referenced directly

When a full plan artifact is pasted or referenced, the harness must:

1. Classify it as a plan artifact rather than an ordinary prompt.
2. Capture it byte-for-byte before the first source edit.
3. Create the immutable original, ledger and atomic shadow bundle.
4. Validate plan completeness.
5. If the same owner message explicitly says execute, implement, continue, run,
   finish, or equivalent, enter execution automatically.
6. Otherwise stop at `VALIDATED`; do not mutate source merely because a plan was
   pasted.

Classification and authorization decisions must record source hash, confidence,
matched signals and owner override.

### 2.3 Plan-completeness gate

Before dispatch, the effective plan must define or derive:

- Requirements and stable identifiers.
- Acceptance criteria and executable verification.
- Dependencies and critical path.
- Owned and forbidden scope.
- Risk and capability tier.
- Evidence and independent-review contracts.
- Migration, rollback and cleanup constraints.
- Host/platform coverage.
- Terminal Definition of Done.
- Explicit execution authorization.

Missing material fields produce `NEEDS_PLAN_REPAIR`, not guessed scope.

## 3. Native-swarm scheduler

The main agent is an orchestrator, not a writer. It compiles the effective plan
into:

1. A requirement dependency DAG.
2. A semantic conflict graph.
3. Ready-task antichains that can execute concurrently.
4. A continuously updated critical path.

The conflict graph must cover more than file paths:

- Owned paths and symbols.
- Public contracts, schemas and types.
- Database migrations.
- Package manifests and lockfiles.
- Generated artifacts and runtime manifests.
- CI workflows and shared fixtures.
- API boundaries and integration points.

The scheduler dispatches the maximum safe set of independent ready tasks. It
must not use a fixed supervisor count as the product abstraction and must not
spawn work merely to fill capacity.

Each writer assignment receives:

- Unique assignment and branch identity.
- Isolated worktree and immutable baseline SHA.
- Exclusive owned paths and semantic ownership.
- Forbidden paths and conflict leases.
- Plan anchors or approved-amendment anchors.
- Acceptance criteria and exact verification commands.
- Model/capability tier and resource budget.
- Receipt and checkpoint contract.

Native subagents remain depth one unless the active host proves a safe deeper
native topology and policy explicitly permits it. Recursive uncontrolled fanout
is rejected.

## 4. Adaptive resource governor

Concurrency is computed from:

- Number of independent ready tasks.
- Available RAM, CPU and test-runner capacity.
- Provider concurrency, quota and rate limits.
- Reviewer capacity.
- Integration-queue depth.
- Evidence lag and stale-work rate.

The governor increases concurrency while throughput improves and reduces it
before swapping, throttling, integration congestion or evidence backlog.

Required behavior:

- No global fixed limit of two writers.
- No unbounded agent creation.
- Preserve at least one independent verification/review capacity when risk
  policy requires it.
- Cancel only an exact stale/duplicate assignment, never broad processes.
- Persist checkpoint, partial receipt and reason before cancellation.
- Share only verified content-addressed context/evidence artifacts.
- Never cache credentials, hidden reasoning or unverified worker claims.

## 5. Parallel implementation, testing, verification, and review

### 5.1 Writer waves

Independent writers operate on isolated branches/worktrees. Two writers may not
own the same path, contract or integration boundary concurrently.

### 5.2 Sharded tests and verification

Focused checks may be partitioned and executed concurrently by subsystem,
platform, claim or risk profile. Every shard binds:

- Candidate commit/tree fingerprint.
- Effective-plan hash.
- Verification command and environment.
- Evidence digest.
- Verifier identity.

The integrated full gate remains authoritative. A collection of focused shard
passes cannot replace integration, security, cross-platform or release gates.

### 5.3 Sharded independent review

Stable candidate snapshots may be reviewed concurrently by independent,
read-only reviewers for:

- Correctness and acceptance criteria.
- Security and trust boundaries.
- Maintainability and canonical ownership.
- Platform/runtime behavior.
- UI accessibility, visual quality and interaction behavior.

Reviewers may not review their own authored output. Local review can be sharded,
but the following remain global integrated reviews:

- Architecture and public-contract coherence.
- Cross-branch semantic compatibility.
- Security boundary closure.
- Full original/amendment reconciliation.
- Release and installation certification.

### 5.4 Repair loop

Rejected candidates remain isolated:

1. Finding binds the rejected snapshot and affected acceptance criteria.
2. A repair writer receives the exact finding and owned branch.
3. Focused verification runs again.
4. A fresh independent reviewer accepts or rejects the new snapshot.
5. Repeated equivalent failure escalates model/reviewer tier.

No rejected or stale candidate enters integration.

## 6. Deterministic integration train

Exactly one integration owner may import accepted candidates.

For each candidate:

1. Confirm review and evidence bind the candidate snapshot.
2. Rebase or replay onto the newest integrated HEAD.
3. Re-run affected focused and integration checks.
4. Invalidate stale downstream evidence.
5. Integrate in dependency order.
6. Record the integrated fingerprint and receipt.

Branch isolation alone is never treated as semantic-conflict proof.

Final global verification, independent review, reconciliation, CI, installation
and runtime doctor remain serial terminal authorities.

## 7. Transport-neutral durable execution

Removing live OpenCode sessions must not remove:

- Immutable original and approved amendments.
- Durable assignment/checkpoint identity.
- Idempotent dispatch and receipt handling.
- Liveness and bounded retries.
- Content-addressed context/evidence cache after integrity verification.
- RAM/token/provider backpressure.
- Independent review and stale-evidence invalidation.
- Resume after controller restart or context compaction.

These capabilities belong to engine contracts and native host adapters, not an
OpenCode-specific session bridge.

## 8. Model routing and immediate main fallback

Model names are runtime mappings, not permanent global rules.

Current owner routing intent:

- Main orchestrator primary: `gpt-5.6-sol`.
- Main orchestrator fallback target: exact
  `qwen3.8-max-preview`.
- Primary writer: `qwen3.7-max`.
- Secondary mechanical writer: `deepseek-v4-flash`.
- Independent final reviewer: `gpt-5.6-sol`, in a separate reviewer identity.

Fallback requirements:

- Discover provider/model capability before dispatch.
- Never alias `qwen3.8-max-preview` to `qwen3.7-max`.
- Until the exact fallback model is advertised, report
  `MODEL_FALLBACK_UNAVAILABLE` while continuing all work that does not require
  that fallback.
- Trigger main fallback only for quota exhaustion, rate limit, provider outage,
  timeout after retry policy, model unavailable or equivalent infrastructure
  failure.
- Do not fallback because implementation or tests are difficult.
- Preserve the same run, task, branch, ledger and checkpoint across fallback.
- Record requested, resolved and observed provider/model plus transition reason.

## 9. Proactive architecture-fitness audit

The harness must not wait for the owner to discover micro-level incompleteness.

Run and persist a fitness audit:

- After every architecture amendment.
- After every major execution wave.
- Before certification.
- After the same operational failure repeats twice.
- When tests pass but an independent reviewer finds Critical/High defects.
- When RAM, token, elapsed-time or stale-work budgets are exceeded.

Each audit scores and provides evidence for:

- Plan integrity and requirement coverage.
- Context taxonomy and router behavior.
- Every active skill and trigger.
- Agent topology and model routing.
- Engine and public contracts.
- Workspace isolation and integration.
- Verification, review and evidence integrity.
- CI, native certification and installer truth.
- Security and privacy.
- Maintainability and canonical ownership.
- Control Plane accessibility, visual quality, motion and real-data binding.
- Documentation, runtime mirrors and cleanup.

Scores are projections of evidence, never completion gates by themselves.
Critical/High findings block a 9–10 score and block release.

Repeated friction must be recorded in `.agent/trace.jsonl` and promoted through
the Context Evolution Protocol only after classification and duplicate audit.

## 10. Fitness-closure requirements

The active successor must close, not hide, the verified baseline gaps:

1. Remove active ownership duplication among `quality`, `clean-code` and
   `code-review`; retain one canonical owner with explicit deep-review modes.
2. Remove redundant pointer ownership between harness governance rules.
3. Make canonical/runtime skill and rule hashes converge.
4. Reduce `automation/` to necessary bootstrap or true canonical commands;
   move reusable behavior behind engine/CLI and remove duplicate wrappers.
5. Eliminate duplicate CI work and bind certification to fresh-checkout
   ephemeral/adopted plan artifacts.
6. Pin or integrity-lock required CI dependencies according to release policy.
7. Replace synthetic all-on-Ubuntu host claims with truthful host capability
   evidence.
8. Remove tracked build/dist output unless explicitly approved as release
   source.
9. Decompose high-risk giant orchestration/cache/contract modules and reject
   empty catches, integrity bypasses and unbounded `any` at trust boundaries.
10. Make Control Plane use canonical styles/tokens instead of inline-style
    architecture and add adequate component, browser, accessibility, visual and
    real-data tests.
11. Require a vision-capable reviewer for visual QA when available; otherwise
    use deterministic screenshot structure, accessibility, layout, contrast and
    seeded-defect analysis without fabricating human-like vision.
12. Make installer, runtime doctor and mirrors verify the exact certified SHA.
13. Close all open findings and reconcile every effective requirement.

The target is evidence-backed 9–10 quality across architecture,
implementation-enforcement, maintainability, UX, security and release truth.
The implementation must improve the system rather than inflate numerical
scores.

## 11. Implementation slices

The execution DAG must derive bounded tasks from these goals; section order is
not execution order.

### NS0 — Activate AM-0012 safely

- Preserve original bytes and prior history.
- Hash and approve AM-0012.
- Recompute effective identity.
- Invalidate stale reviews, reconciliations and attestations.
- Regenerate shadows atomically through engine ownership.
- Enter `NEEDS_REMEDIATION`.
- Re-anchor existing candidate diffs and findings; do not discard them.

### NS1 — Mode and schema migration

- Add `NATIVE_SWARM`, `ARTIFACT_HANDOFF`, `SINGLE_AGENT`.
- Remove live-session modes from active schemas, resolver, CLI and UI.
- Add migration diagnostics for legacy ledgers.

### NS2 — Remove cross-host OpenCode session control

- Remove the live session bridge and supervisor control paths.
- Preserve OpenCode optional artifact import/export/receipt behavior.
- Remove live-session certification claims and tests.

### NS3 — Plan recognition and automatic adoption

- Implement both prebuilt-bundle and direct-pasted-plan workflows.
- Add explicit execution-authorization detection.
- Add adversarial false-positive/false-negative fixtures.

### NS4 — Native DAG and semantic conflict scheduler

- Compile dependency and semantic conflict graphs.
- Add leases, isolated worktrees, adaptive concurrency and native dispatch.

### NS5 — Sharded assurance and repair

- Add test, verification and review shards.
- Bind every shard to immutable fingerprints.
- Implement repair loops and review freshness.

### NS6 — Integration train

- Implement single-owner accepted-candidate integration.
- Rebase/retest/invalidate evidence deterministically.

### NS7 — Routing, cache and resource governor

- Implement capability-discovered model routing and exact-model fallback.
- Preserve transport-neutral checkpoint/cache/backpressure.
- Close cache integrity, transaction, abort and completion-boundary findings.

### NS8 — Micro-fitness closure

- Execute the verified micro-audit backlog.
- Re-audit all active skills and concepts after consolidation.
- Close maintainability, CI, Control Plane, runtime and documentation gaps.

### NS9 — Terminal release

- Full miss sweep against original plus all approved amendments.
- Fresh independent global review.
- Same-HEAD quality and certification CI.
- Install exact artifact and run doctor/activation checks.
- Advance newest complete implementation to `main`.
- Verify remote `main`.
- Delete non-main branches/worktrees only after rescue and certification.

## 12. Acceptance criteria

1. No active code path lets Codex or another host control OpenCode live
   sessions.
2. OpenCode artifact handoff imports, validates, executes and exports without
   becoming a required controller.
3. Pasted plan plus execution authorization creates `.agent` before source
   mutation and begins execution automatically.
4. A pasted plan without execution authorization is adopted but does not mutate
   source.
5. Native scheduler executes the maximum resource-safe independent antichain,
   not a fixed two-writer topology.
6. Path-disjoint but contract-conflicting tasks serialize.
7. Writers cannot edit outside leased ownership.
8. Focused tests, verification and local reviews shard in parallel and bind the
   exact candidate fingerprint.
9. Integrated global reviews remain whole-system and authoritative.
10. Rejected candidates loop through repair and fresh independent review.
11. Exactly one integration owner imports accepted candidates.
12. Rebase or integration change invalidates affected stale evidence.
13. Main fallback preserves run/checkpoint identity and never aliases an
    unavailable model.
14. Repeated operational friction creates trace and fitness findings without
    dumping raw chat into living rules.
15. Every active skill has one canonical owner, precise trigger and verified
    runtime reachability.
16. No Critical/High finding remains in architecture, security,
    maintainability, UX or release audits.
17. Fresh local and GitHub gates pass on one exact HEAD.
18. Installed runtime and attestations bind that exact HEAD.
19. Final reconciliation marks every effective requirement `MATCH` or approved
    `SUPERSEDED`.
20. Only certified `main` remains after safe rescue and cleanup.

## 13. Activation contract

AM-0012 exists while current dogfood and AM-0011 candidates are still under
review. Existing diffs and receipts are untrusted candidates, not waste:

1. Finish collecting already-running reviewer receipts without starting another
   live-session wave.
2. Treat those receipts as raw findings bound to the old effective identity.
3. Activate AM-0012 before the next source wave.
4. Re-anchor preserved candidate changes to AM-0012 tasks.
5. Re-verify and re-review preserved candidates under the new effective hash.
6. Continue through NS0–NS9 until the real terminal gate passes.

No implementation or completion claim is created merely by this amendment.
