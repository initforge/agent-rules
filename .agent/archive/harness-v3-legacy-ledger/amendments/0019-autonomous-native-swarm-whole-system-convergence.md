# AM-0019 — HV3-M11 Autonomous Native Swarm and Whole-System Convergence

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

## 1. Owner decision and preservation contract

AM-0019 is additive after AM-0018. It does not rewrite `original.md`, delete an
earlier requirement, or hide superseded history. Original plus AM-0001 through
AM-0018 remain visible. A conflicting execution detail is superseded only where
this amendment says so explicitly; every unaffected requirement remains active.

The objectives are:

- Compile the immutable effective plan into a decision-complete execution
  packet that agents can execute without repeatedly reinterpreting intent.
- Replace the sequential local-worker path with a depth-one native swarm using
  isolated branches/worktrees, rolling integration, sharded independent review,
  bounded repair and durable continuation.
- Continue every independent task when another dependency closure is waiting.
- Require component, contract, integration, exact deployed-topology, browser,
  production-like journey and rollback evidence before completion.
- Make Codex, Claude Code and OpenCode first-class Tier-A hosts; retain Grok as a
  required functional host; constrain Antigravity; defer Cursor without deleting
  its contract.
- Permit only the engine to emit terminal completion.
- Close every existing fitness dimension and the new M11 requirements with
  executable evidence rather than self-scored claims.

Owner-authorized Git boundary:

- Workers author only on owned feature branches/worktrees.
- One integration owner may merge accepted branches into the integration train.
- After fresh certification, the engine may fast-forward local `main` to the
  newest certified integration HEAD.
- All other branches/worktrees remain until owner reviews the local completion
  packet.
- Remote `main` push and local/remote branch/worktree cleanup require the later
  owner approval; they are not authorized by this amendment.

`pos-ops` and `mini-toeic.score` were inspected only as evidence of current
orchestration defects. AM-0019 must not mutate either repository. Equivalent
failure patterns are represented by controlled fixtures inside `agent-rules`.

## 2. Supersession and retained invariants

The following execution details are superseded:

- A fixed two-writer/one-reviewer operating default is replaced by adaptive
  max-useful concurrency, while depth one and one integration owner remain.
- Recoverable `BLOCKED` terminal behavior is replaced by durable nonterminal
  waiting/retry states.
- Phase/wave barriers are replaced by a cross-stage typed ready queue; only
  explicit hard dependencies and global gates can stop successor work.
- Any literal five-host release requirement is refined to the host policy in
  section 11: Tier-A native certification, Grok functional certification,
  Antigravity constrained/advisory and Cursor deferred.
- Human review remains mandatory before remote publication, but certified
  fast-forward of local `main` is pre-authorized.

The following invariants remain:

- Immutable original plan, ordered amendments, plan anchors and reconciliation.
- One main orchestrator, native subagents at depth one, no child-created trees.
- Main agent performs orchestration, diff inspection, reconciliation and
  terminal decision; it does not author product source or tests.
- Worker cannot verify or review its own output.
- One canonical engine lifecycle owner; CLI, hooks and platform overlays are
  thin clients.
- `HOST_NATIVE_CHILD` is allowed; `ARTIFACT_HANDOFF` is optional;
  `CROSS_HOST_NESTED_CLI` and unapproved `LIVE_SESSION_BRIDGE` are prohibited.
- No claim may exceed its exact executable evidence.

## 3. Plan-readiness and autonomy bundle

Before source mutation, the engine atomically generates machine projections:

```text
.agent/plans/<plan-id>/
├── original.md
├── projection.plan.yaml
├── autonomy.yaml
├── decisions.yaml
├── system-topology.yaml
├── execution-graph.yaml
├── conflict-graph.yaml
├── verification-graph.yaml
├── integration-train.yaml
└── resource-budget.yaml
```

The ledger JSON remains canonical. Markdown/YAML files are engine-generated
projections and manual drift is regenerated and audited.

Every normative claim in original plus ordered amendments must map to:

```text
PlanAnchor → Requirement → AcceptanceCriterion
→ VerificationProfile → EvidenceContract → ExecutionCluster
```

No generic `Implement R-N` task, unmapped section, orphan task, AC without proof,
or hard-coded requirement count is valid.

Readiness states:

```text
AUTONOMOUS_READY
BOUNDED_READY
OWNER_DECISION_REQUIRED
```

`AuthorityEnvelope` records allowed inspect/install/worktree/build/test/Compose/
browser/commit/local-merge actions and owner-only push/deploy/credential/
destructive actions. `DecisionMatrix` records reversible defaults and rollback.

All discoverable facts are inspected. Reversible ambiguity receives a recorded
default. Owner questions are batched once before execution and are allowed only
for product intent, unavailable credentials, destructive data changes or new
irreversible authority. A new owner-only unknown blocks only its transitive
dependency closure; independent work continues.

## 4. Typed cross-stage execution graph

Dependency types:

```text
HARD
SOFT
VERIFY_AFTER
SEMANTIC_CONFLICT
INTEGRATION
GLOBAL_GATE
EXTERNAL
```

Recoverable states:

```text
WAITING_EXTERNAL
WAITING_AUTHORITY
WAITING_RESOURCE
RETRY_SCHEDULED
NEEDS_REMEDIATION
```

`BLOCKED` is reserved for unrecoverable plan invalidation. Waiting states carry
wake condition, retry/backoff policy, deadline, fallback and affected successor
closure. They never terminate the overall run.

The scheduler computes the maximum conflict-free ready antichain across the
entire graph. It prioritizes critical-path work without starving independent
tasks. Later-stage preparation or implementation starts immediately when it has
no unsatisfied `HARD` or `GLOBAL_GATE` edge. Interface contracts are frozen by
integration epoch; a contract change invalidates only affected dependants.

## 5. Native swarm and branch topology

Every implementation cluster receives:

- Immutable integration base epoch.
- Feature branch and isolated worktree.
- Owned paths and semantic-resource leases.
- Acceptance, verification and repair contracts.
- Requested/resolved/observed provider, model and effort.
- Resource class, budget and expected duration.

Conflict detection covers path/glob, public API/schema, DB migration, lockfile,
generated manifest, port/container/fixture, shared data and browser-page leases.

Pool ceilings after the global broker is active:

| Pool | Ceiling |
|---|---:|
| Total native children | 14 |
| Writers | 8 |
| Reviewers/auditors | 5 |
| Integration owner | 1 |
| Browser-heavy | 2 default, 4 burst |
| Full build/test | 2 |
| Full Compose topology | 1 |

For standard/resumable plans, the scheduler fills at least six slots when six
independent tasks and safe resources exist. It may use 8 normally and 10–14 for
safe light/read/code bursts. A low child count is valid only when the graph,
host capability or measured resource pressure proves higher concurrency unsafe
or useless.

Review uses stable branch snapshots. Specialized reviewers may shard behavior,
tests, security, architecture, UX and maintainability. Their findings are
consolidated into one bounded repair pack. A different writer repairs the owned
branch and a different reviewer rechecks it. Any post-review commit makes the
prior review stale.

One integration owner rebases, validates and merges accepted branches into a
rolling train. Accepted work does not wait for an entire logical wave. Merge
order is deterministic and every accepted snapshot receives an integration
receipt.

## 6. Global resource and tool broker

A single governor arbitrates all projects and sessions on the machine. It reads
process-tree RSS, available RAM, memory PSI, swap churn, load, temperature, I/O,
browser/MCP counts and orphan processes. Per-session self-reported RSS is not
sufficient.

Tools are lazy-loaded. Content/context caches are content-addressed and shared.
Browser, Playwright and CDP are pooled rather than spawned per agent.

Defaults:

- Burst 10–14 light agents when available RAM is at least 30%, memory PSI is
  low, CPU is below 78°C and swap-in is negligible.
- Reduce heavy concurrency when RAM is below 20%, PSI/swap increases, CPU is at
  least 85°C or sustained load exceeds 1.25 times logical CPUs.
- Pause heavy work below 12% available RAM or at 92°C.
- Resume with hysteresis after RAM is at least 25% and CPU is at most 78°C for
  60 seconds.

Resource waiting is nonterminal. Process groups, browser contexts, MCP servers,
temporary ports and abandoned worktrees are reclaimed after completion/crash.

## 7. Durable autopilot and terminal truth

A host-neutral supervisor service owns journal, leases, heartbeat, CI watcher,
provider health, auto-repair and continuation outside one model turn. It resumes
after compaction, crash, lost response, app restart or reboot without duplicate
mutation.

Host Stop hooks checkpoint and may end a turn, but cannot declare completion
while the engine terminal gate is false. The supervisor dispatches the next
continuation without an infinite prompt loop.

Routine missing tools, CI failures, provider outages, reversible ambiguity and
repairable code defects are automatically provisioned, retried, rerouted or
repaired. Silent model substitution is prohibited; every fallback is policy-
approved and recorded. Two repairs with the same root cause escalate model and
review tier and open a root-cause task.

Only engine code can emit a terminal token. It derives all requirements from the
effective plan and binds exact source HEAD, integration tree, evidence envelope,
CI SHA, native attestations, installed artifact and current reconciliation.
Any later commit invalidates terminal evidence.

The existing M10 terminal marker is historical and stale for AM-0019. It cannot
authorize M11 completion.

## 8. Whole-system topology convergence

`SystemTopology` contains services/processes/images, ingress/internal ports,
DB/queue/object store/worker, external boundaries, migrations, seed, health,
startup/shutdown, auth roles, user journeys, persistence and rollback.

Verification layers are mandatory:

```text
unit → component → contract → service integration
→ exact deployed topology → public-ingress journey → release/rollback
```

Component evidence cannot close a release claim. The system verifier builds the
exact candidate artifact/image, starts a clean isolated topology, tests only
through public ingress and records source SHA, image digest, topology hash,
health, migrations, logs, data effects, restart, persistence and cleanup.

Run an early topology smoke, a gate after topology-affecting integration trains
and a final clean-stack gate. Other independent clusters continue during these
checks. A required topology gate cannot return PASS via `SKIPPED`; it moves to a
capable runner or remains nonterminal `WAITING_EXTERNAL`.

## 9. Paired browser parity and non-vision verification

Every `ParityPair` binds exact reference URL/checkout/MHTML revision or hash,
target ingress and candidate hash, fixture, role, locale, timezone, viewport,
DPR, theme, reduced motion, action sequence, state checkpoint, semantic anchors
and allowed deviations.

Each case leases two isolated pages/contexts:

- `REF:<pair-id>` for the reference.
- `TGT:<pair-id>` for the candidate.

Optional `SPEC` or `DATA` pages are permitted only by the case contract. A case
cannot PASS if only one side was opened.

Playwright drives journeys and assertions. CDP captures screenshots, ARIA tree,
DOM/layout, computed styles, paint order, focus order, console, network/HAR,
storage and relevant performance data. The non-vision compiler produces semantic,
geometry, style, accessibility, OCR/overflow, pixel/SSIM/edge and runtime diffs
with machine-readable coordinates and heatmaps.

A vision-capable reviewer is mandatory for UI/taste scope when available and
judges hierarchy, rhythm, polish and originality. Deterministic evidence remains
mandatory and cannot be replaced by visual opinion.

## 10. Platform policy

Shared adapter contract requires detect/version, build, install, update,
rollback, uninstall, doctor, native dispatch, worktree isolation, requested/
resolved/observed model, Stop/checkpoint/resume, receipt and attestation.

- Codex, Claude Code and OpenCode are Tier A and must provide native observed
  receipts for every required capability.
- Claude Code receives a first-class `platforms/claude` implementation and full
  build/install/doctor/runtime lifecycle.
- OpenCode contract and implementation must agree about native child dispatch;
  no standalone/session bridge may be mislabeled native.
- Grok must pass functional install/doctor/dispatch/receipt certification.
- Antigravity is constrained: signed context capsule, strict worktree/path lease,
  no merge, no canonical `.agent` mutation, diff-boundary validator and review
  by another host. Failure leaves it advisory/read-only.
- Cursor remains represented but deferred and nonblocking.

## 11. Control Plane, quality and security

Control Plane remains local-only and observational/configurational; it cannot
start, stop or cancel runs. It reads canonical evidence and adds views for plan
readiness, DAG/critical path, conflict graph, worktrees, native agent pool,
integration train, resources, topology, parity, waits/retries and terminal gates.

Frontend work must load and follow the taste skill. The interface is Apple-
inspired light-first with dark mode, strong hierarchy, progressive disclosure,
responsive master-detail, meaningful motion, WCAG 2.2 AA, reduced motion and
200% zoom. Raw JSON is not the default. Green status cannot be derived from
configuration or self-claim. Screenshots come from the exact certified build.

Security covers path/symlink/TOCTOU, branch/worktree boundaries, secret scan,
SAST/SCA, dependency/action pinning, process cleanup, local-origin enforcement,
schema migration fuzzing, receipt tampering, instruction capsule hash and
cross-host CLI denial.

CI remains exactly `quality.yml` and `certification.yml`. Required jobs cannot
pass through skip, advisory summary, timeout inflation or stale attestation.

## 12. Evaluation and performance acceptance

Required deterministic/adversarial cases:

- 100% original-plus-amendments semantic coverage.
- Missing tool, CI failure, provider outage and reversible ambiguity continue
  without owner questions.
- Credential, destructive migration and product-intent ambiguity are asked once
  as one batch while independent work continues.
- Engine schedules 14 conflict-free synthetic tasks without wave barriers.
- A Tier-A live run demonstrates at least eight concurrent native children on a
  host that advertises that capacity.
- Ownership, API/schema/migration/lockfile/generated conflicts are rejected.
- Crash before/after dispatch, lost response, stale lease, compact, restart,
  reboot and duplicate receipt do not duplicate or lose work.
- Controlled multi-service fixture proves ingress, frontend, API, DB, object
  store/queue, worker, migration, seed, async journey, restart and rollback.
- Seeded browser defects cover missing control, hierarchy, overflow, spacing,
  style, focus order, console and network errors.
- Tier-A native attestation and Grok functional attestation bind exact HEAD.
- Antigravity out-of-ownership mutation is rejected.
- Control Plane passes browser, visual, accessibility, console and network QA.

Performance gates:

- At least 75% utilization of safe runnable capacity.
- READY-to-dispatch p95 below two seconds.
- Critical-path idle below 5% while runnable work exists.
- Implementation throughput at least three times the sequential baseline.
- End-to-end workload at least twice the sequential baseline without worse
  defect escape, review rejection or evidence quality.

## 13. M11 terminal states

`HV3_M11_LOCAL_COMPLETE` requires:

- Every effective requirement is `MATCH` or approved `SUPERSEDED`.
- Zero open findings and zero null/`UNVERIFIED` fitness dimensions.
- Full-stack, parity, security, Tier-A, Grok, installer and CI evidence bind the
  same exact HEAD and artifact.
- Independent architecture, security, maintainability, UX and operations reviews
  accept the integrated diff.
- Exact certified artifact is installed from certified local `main`.
- Other branches/worktrees remain for owner review.

After owner approval, `HV3_M11_RELEASED` requires remote `main` push of that exact
HEAD, matching remote CI, rescue audit, deletion of all non-main local/remote
branches and worktrees, and fresh final reconciliation.

No terminal state is valid while execution is `NEEDS_REMEDIATION`, a required
gate waits, evidence is stale, a score is unverified, required parity/topology is
skipped, the installed artifact differs, or a terminal token was written outside
the engine.

## 14. Additive requirement registry

All previously approved fitness criteria remain. Add:

- M11-R11 Plan readiness and semantic coverage.
- M11-R12 Authority, decisions and clarification completeness.
- M11-R13 Typed cross-stage dependency graph.
- M11-R14 Max-useful native swarm scheduling.
- M11-R15 Worktree isolation and rolling integration train.
- M11-R16 Global resource/tool/browser broker.
- M11-R17 Durable nonterminal autopilot.
- M11-R18 System topology compiler.
- M11-R19 Verification-layer and exact full-stack gate.
- M11-R20 Paired reference/target browser contract.
- M11-R21 Non-vision visual verification.
- M11-R22 Codex/Claude/OpenCode Tier-A convergence.
- M11-R23 Host compliance boundaries.
- M11-R24 Canonical lifecycle and terminal truth.
- M11-R25 Subagent-first audit/review and main-context protection.
- M11-R26 Controlled dogfood and adversarial closure.

## 15. Activation contract

Before any AM-0019 source wave:

1. Verify immutable original and AM-0001 through AM-0018 against ledger hashes.
2. Capture this file by raw bytes and compute SHA-256.
3. Append AM-0019 after AM-0018 through the canonical atomic activation API.
4. Recompute effective identity from original plus ordered approved amendments.
5. Mark prior completion, scorecard, review, CI, attestation and reconciliation
   evidence stale for M11.
6. Regenerate every shadow/projection atomically and verify every hash.
7. Enter `NEEDS_REMEDIATION` honestly.
8. Compile and validate the new plan-readiness bundle.
9. Dogfood the new execution behavior immediately; do not wait for full product
   completion before using the accepted portions.
10. Continue without routine owner questions until `HV3_M11_LOCAL_COMPLETE` or a
    genuine owner-only decision outside this amendment is discovered.
