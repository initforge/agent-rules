# Agent throughput, dogfood, and cross-host convergence

Date: 2026-08-03

## Summary

The dominant problem is not insufficient agent count. It is **specification
abundance with enforcement deficit**:

1. The active Harness plan already specifies adaptive concurrency, a cross-stage
   ready queue, isolated worktrees, rolling integration, independent review,
   resource pools, and an orchestration-only main.
2. Those concepts are split across 21 immutable amendments and several runtime
   projections, so a worker can consume far more governance than task context.
3. The main CLI path does not yet execute those concepts end to end. `agent-rules
   run` uses `LocalWorkerAdapter`; that adapter hashes owned files and runs
   verification commands, but it does not dispatch native coding agents or
   implement source changes.
4. The newer `Controller`, resource broker, worktree train, context broker, and
   OpenCode supervisor runner exist, but they are not one production execution
   path. In particular, `SupervisorRunner` is not wired into the CLI `run` path.
5. Host role restrictions are mostly prompt-enforced. OpenCode grants every role
   edit/write/task access. Claude Code starts without a default supervisor and
   its generated agents do not translate role tool restrictions.
6. Cross-project dogfood is currently a preview over large dirty candidates.
   The integration train has zero receipts, and ordinary worktrees would start
   from stale Git `HEAD` unless the dirty candidate is first materialized.

The architecture should therefore shift from “a comprehensive prompt drives the
system” to “a short launcher starts a deterministic execution engine.”

## Evidence

### Harness intent is already largely correct

- AM-0019 replaces fixed small pools with adaptive maximum-useful concurrency,
  wave barriers with a typed cross-stage ready queue, recoverable `BLOCKED` with
  nonterminal waiting/retry states, and assigns one feature branch/worktree per
  implementation cluster.
- AM-0019 sets ceilings of 14 native children, 8 writers, 5 reviewers, 2 full
  build/test processes, and 1 Compose topology. It expects at least six active
  slots only when six safe, useful tasks exist.
- AM-0020 defines risk-tiered review and the branch flow `writer -> focused
  verifier -> independent reviewer -> consolidated repair -> fresh recheck`.
- AM-0021 makes main orchestration-only and targets 10-15% of uncached input for
  main, zero raw child output by default, and a 4-8k-token run capsule.
- AM-0014 says a UI cluster should be a coherent vertical journey, not universal
  micro-slices, and that focused writers should run only focused checks.

Sources:

- `.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0014-clustered-native-swarm-and-resource-safety.md`
- `.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0019-autonomous-native-swarm-whole-system-convergence.md`
- `.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0020-epistemic-integrity-adversarial-review-and-truthful-reporting.md`
- `.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md`

### Runtime wiring does not yet match that intent

- `packages/cli/src/services/runner.ts` accepts only `local-worker` and executes
  all ready tasks through `LocalWorkerAdapter`.
- `packages/cli/src/adapters/local-worker-script.ts` reads/hashes existing owned
  files and runs allowlisted verification commands. It does not author code.
- `packages/engine/src/controller.ts` does use `computeReadySet` and the resource
  broker, but the CLI `run` service uses a separate orchestrator path.
- `platforms/opencode/supervisor-runner.ts` has native child-session dispatch and
  event waiting, but no non-test production importer connects it to CLI `run`.
- `compileCapsule` exists but has no non-test caller.
- The worktree train is exposed as separate manual CLI commands; the active
  integration-train projection has `receipts: []`.
- `waitForTerminalEvidence` times out after 120 seconds, returns an error, and
  does not itself abort, checkpoint, reshape, or reassign the stuck task.
- The supervisor validates lease expiry when actions occur, but there is no
  demonstrated periodic reaper in the main native execution path.

This is why the current Harness can describe high concurrency without reliably
producing it.

### Host adapters are not behaviorally equivalent

- OpenCode has `default_agent: supervisor-main`, but supervisor, workers, and
  reviewer all receive wildcard, bash, edit, write, task, question, and doom-loop
  permission. Prompt text asks them to respect boundaries, but the host does not
  enforce them.
- The current OpenCode supervisor prompt still caps itself at four concurrent
  subagents, conflicting with the newer 8-normal/10-burst target.
- Claude Code global settings have `agent: null` and bypass permissions. A fresh
  session is therefore not guaranteed to start as `supervisor-main`.
- `platforms/claude/scripts/sync-opencode-parity.ps1` copies descriptions,
  prompts, and permissive mode, but does not translate OpenCode permissions into
  Claude `tools`/`disallowedTools`, and does not select the supervisor as the
  default main.
- The local platform statement that OpenCode lacks native subagent spawning is
  stale. Current OpenCode documents automatic/manual subagent use through the
  Task tool and role-scoped `permission.task`.

Official host surfaces:

- OpenCode agents and permissions: https://opencode.ai/docs/agents
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code parallel agents/worktrees: https://code.claude.com/docs/en/agents
- Claude Code permissions: https://code.claude.com/docs/en/permissions

The Harness cannot control proprietary internal planning, but it can control the
native surfaces those hosts expose: selected main role, Task allowlists, tool
deny lists, hooks, child-session events, worktree isolation, leases, receipts,
timeouts, and integration ownership. The present difference is mostly adapter
and activation incompleteness, not an unavoidable closed-source limitation.

### Cross-project dogfood is not yet a real integration train

- `agent-rules` has one root worktree and 242 dirty entries. Its active plan
  directory contains 51 files and its train contains no integration receipt.
- `pos-ops` has 181 dirty entries, one root worktree, and 163 `.agent` files. Its
  Harness v3 amendment explicitly reports `PROMPT_ENFORCED_PREVIEW` and
  `PARTIALLY_ENGINE_ENFORCED`, with commit/local merge not authorized.
- `mini-toeic.score` has 98 dirty entries and 1,070 `.agent` files. Its old plan
  caps the run at four agents; the newer resume prompt asks for 8-10 roles but
  still uses phase waves, embeds host/model routing, and adds per-epic analyst,
  test author, and reviewer roles. One locked Claude worktree remains while its
  recorded PID is no longer present.
- Neither product project currently has a project-local host configuration that
  guarantees the same main/worker/reviewer behavior across hosts.

The dogfood protocol already identifies the key prerequisite: freeze a stable
candidate epoch before normal worktrees. With commit prohibited, workers must use
content-addressed patch/candidate copies instead; otherwise their worktrees are
based on stale `HEAD`. This defeats clean branch-based integration.

## Root causes

### 1. Workers are over-scoped

Current assignments often mix implementation, broad discovery, test authoring,
final verification, review, evidence ceremony, and cross-slice reconciliation.
That destroys locality and makes every child act like a small coordinator.

The correct boundary is:

- Writer: implement one coherent cluster and run a focused self-check.
- Verifier: independently reproduce the acceptance claims on a stable snapshot.
- Reviewer: inspect risk, negative behavior, and maintainability; read-only.
- Integrator: rebase/merge accepted snapshots and run affected integration gates.
- Main: resolve only plan, architecture, authority, contract, review, merge, and
  terminal conflicts.

A writer's focused self-check is not final verification or self-review.

### 2. Assignments lack an execution archetype

“Continue `.agent`”, “refactor”, or “finish frontend/backend” is not a sufficient
start point. Every cluster packet should declare one archetype:

- `UI_VERTICAL`
- `BACKEND_CONTRACT`
- `REFACTOR_PRESERVE_BEHAVIOR`
- `MIGRATION`
- `INFRA_TOPOLOGY`
- `CONTINUATION_REPAIR`

The packet must contain only: candidate epoch, start anchor, before state, target
observable behavior, owned/forbidden paths and semantic resources, dependencies,
acceptance claims, focused self-check, independent proof, and merge order.

### 3. Governance is read at the wrong granularity

Immutable plans and amendments are valuable as audit history, but a worker should
not read the entire history. Runtime should compile it into:

```text
.agent/run/current.json
.agent/run/queue.jsonl        (or one SQLite event store)
.agent/run/clusters/<id>.json
.agent/run/receipts/<id>.json
.agent/run/review-bundle.json
.agent/run/artifacts/<sha256>
```

The engine reads the full authority chain once. Main receives a bounded run
capsule. Each child receives one cluster packet. Raw logs stay behind artifact
pointers.

### 4. Concurrency is counted as agents, not bottleneck resources

More agents help only when there are disjoint READY clusters and downstream
review/test/merge capacity. Extra writers otherwise create work-in-progress,
conflicts, and stale evidence.

Recommended shared-machine operating mix:

| Mode | Writers | Verifiers | Reviewers | Integrator | Total |
|---|---:|---:|---:|---:|---:|
| Normal | 4 | 2 | 1 | 1 | 8 |
| Safe burst | 5 | 2 | 2 | 1 | 10 |

This is a shared ceiling across active repositories, not a per-project quota.
Fewer than six agents is valid when the graph, host, or measured resource state
shows that extra concurrency is unsafe or useless. That decision must be emitted
by the scheduler, not improvised by the main prompt.

Vitest should have a global ceiling of **two active processes**, not a mandatory
floor of two. Each focused invocation should be constrained to one internal
worker/no file parallelism. Two focused shards may run together; an integrated
full suite should receive an exclusive or explicitly budgeted slot. Otherwise
two Vitest processes can each fan out internally and overload the CPU.

### 5. The authority envelope contradicts the desired branch workflow

Real worktree dogfood requires a stable committed base. The default project
authority should pre-authorize:

- inspect, edit, install project dependencies;
- browser/local Compose verification;
- disposable local data reset;
- local branch/worktree creation;
- local checkpoint commits and local integration merges;
- process-group termination for owned stuck tasks.

It should continue to reserve push, publish, deploy, production credentials,
production data mutation, irreversible migration, force-push, and destructive
cleanup. “Open all blocks” should mean this finite envelope, not unlimited
production authority.

## Recommended execution architecture

### Product sequencing: contract-first, frontstage-first

For UI products such as `pos-ops` and `mini-toeic.score`, the user-visible
journey should become clickable and browser-verifiable early. However, “frontend
always first” is unsafe as a universal rule.

Use this ordering:

1. Freeze route/data/event/auth contracts and local simulation interfaces.
2. Complete one full clickable frontend journey against typed local adapters.
3. Verify desktop/mobile behavior immediately.
4. Implement backend providers behind the frozen contract in parallel.
5. Replace local adapters incrementally with real local services and rerun the
   same journey proof.

For financial, authorization, migration, and concurrency behavior in `pos-ops`,
schema and transaction invariants must precede UI claims. For the Harness repo,
the engine path is the product spine; Control Plane UI cannot substitute for it.

### Rolling queue, not review-at-end or review-every-file

Use this event-driven flow:

```text
READY cluster -> writer + focused self-check
stable snapshot -> verifier and risk-tier reviewer in parallel
findings -> one consolidated repair pack -> fresh recheck
ACCEPTED -> rolling integration train immediately
integrated head -> affected contract/regression gate
final head -> one release/security/UI terminal gate
```

Do not wait for an entire logical wave. Do not review unstable source after every
small edit. Review coherent cluster snapshots and reserve the full suite for
integration boundaries.

### Merge contract

Every candidate should provide a small machine-readable integration manifest:

- base epoch SHA and candidate head SHA;
- patch ID and changed path/symbol/contract set;
- dependency IDs and semantic leases;
- acceptance/proof digest;
- independent review receipt;
- expected integration order and invalidation set.

Before merge, the engine creates a synthetic merge or rebases against the latest
integration head, checks path plus semantic conflicts, and runs only affected
proof. One integration owner merges in deterministic topological order. After a
merge, only downstream evidence in the invalidation set is reopened.

### Review bundle for Codex

Codex should receive a stable final diff plus one bounded `ReviewBundle`, not
child chats or raw logs:

- original intent and non-negotiable behavior;
- base/head/candidate epoch;
- changed claims and acceptance criteria;
- diff statistics and artifact pointer;
- exact commands and exit-code digest;
- unresolved risks and requested review axes.

Output both JSON for machines and concise Markdown for a reviewer. This makes
cross-host review cheaper, more consistent, and auditable.

### Stuck-child recovery

Use semantic-progress watchdogs rather than wall time alone:

1. `RUNNING`: terminal/tool/event heartbeat is advancing.
2. `SOFT_STALLED`: no semantic progress for 90-120 seconds; inspect child state,
   process CPU/I/O, pending permission, and last tool event; send one bounded
   continuation/diagnostic signal.
3. `HARD_STALLED`: lease expires or the diagnostic signal produces no progress;
   checkpoint useful artifacts, abort the child session, terminate its owned
   process group, release leases, and reassign to a fresh child.
4. Same root cause twice: reshape/split the cluster or escalate its risk route;
   do not keep retrying the same prompt.

Long-running tests remain healthy when their process heartbeat/CPU/I/O advances.
Provider/rate-limit waits become explicit waiting states and do not block other
READY work.

### Docker and local simulation contract

Each project should have one canonical Compose topology. Prohibit ad hoc
`docker run`, `compose run`, dynamically named services, and one-shot seed
containers. Seed/reset through an existing application/database service with
`docker compose exec`, or through a host command connected only to the local
topology.

Local full mode should provide:

- one command to start and one to reset;
- project-scoped network, volumes, ports, and synthetic secrets;
- localhost-only exposure and fail-closed production endpoints;
- deterministic profiles such as `empty`, `demo`, `edge`, and `failure`;
- production-like synthetic data with no production dependency;
- explicit commands/API to inject external events and transition integration
  state.

For a Zalo-like integration, use a provider interface with `real` and
`local-sim` implementations. `local-sim` may set connection/QR states and inject
inbound messages, delivery failures, reconnects, duplicates, and ordering cases.
Startup must reject `local-sim` in staging/production. This is simulation, not a
production authentication bypass.

## Cross-host corrections

### OpenCode

- Keep supervisor as default primary agent.
- Supervisor: deny edit/write; permit Task only for approved child roles.
- Writers/debuggers: deny Task and question; allow only owned edit/write and
  bounded commands.
- Reviewers/verifiers: deny edit/write/Task; allow read and proof commands.
- Integration owner: deny source editing and child Task; allow only integration
  train commands and required verification.
- Wire native child sessions, event cursors, resource broker, watchdog, worktree
  train, and context broker into the CLI execution path.
- Remove the stale four-child prompt cap; scheduler policy owns concurrency.

### Claude Code

- Select `supervisor-main` as the actual default session agent, not only a
  generated optional subagent.
- Translate role permissions into `tools` and `disallowedTools` rather than
  copying bypass mode.
- Use `SubagentStart`, `SubagentStop`, `TaskCreated`, and `TaskCompleted` hooks to
  inject cluster packets and reject missing receipts/ownership breaches.
- Use native worktree isolation where supported.

Claude exposes richer native hooks and parallel workflow surfaces, so its main
can appear more involved. But the present main-heavy behavior is primarily
because the adapter does not select/enforce the supervisor role; it is not proof
that convergence is impossible on a closed-source host.

## Immediate dogfood sequence

### Phase 0: stabilize candidate epochs

For all three repositories, fingerprint tracked, staged, and allowlisted
untracked source and run a secret scan. Prefer owner-authorized local checkpoint
commits on private integration branches. If that authority remains unavailable,
materialize content-addressed candidate copies; do not spawn normal worktrees
from stale `HEAD`.

### Phase 1: activate project-local adapters

Install project-local role/config overlays so a new OpenCode or Claude Code
session starts with the same supervisor, task permissions, role tool limits,
resource budget, watchdog, and concise launcher. Remove model IDs from project
prompts; routing belongs to host configuration.

### Phase 2: compile product plans into vertical clusters

`mini-toeic.score` priority clusters:

1. shell/catalog/auth and exam start;
2. complete L&R journey;
3. Speaking journey and local media/grading simulation;
4. Writing journey and grading/result/history;
5. Admin/import lifecycle;
6. local full-mode data/state controls and integrated release proof.

`pos-ops` priority clusters:

1. shell/navigation plus one representative subjects/POS journey;
2. local demo identity/RBAC and system modules;
3. OCR intake/review local simulation;
4. transaction -> approval -> payout vertical journey;
5. commission and settlement/reconciliation journeys;
6. canonical local full mode, financial negative probes, and release proof.

Financial/schema ownership remains serialized while disjoint frontend and
provider-adapter clusters run concurrently.

### Phase 3: prove the mechanism, not merely the product

Dogfood acceptance should require:

- at least two simultaneously active isolated writer worktrees;
- stable snapshot verification by a different session;
- at least one accepted rolling local merge with an integration receipt;
- one stuck-child injected fixture proving abort/reassign/lease recovery;
- a measured Vitest ceiling of two processes;
- main-context metrics showing no raw logs and a bounded capsule;
- a fresh-session run that resumes from `.agent` without the owner supplying an
  objective again.

## Time-reduction expectation

A 70-90% end-to-end reduction should not be promised as a universal SLO.
With eight workers, even a perfectly parallel workload has an 87.5% theoretical
reduction. With a 20% serial fraction, the best theoretical time is
`0.20 + 0.80/8 = 0.30`, or a 70% reduction. Ten workers reach 90% only with zero
serial work, which real merge, migration, and final gates do not have.

Use these targets instead:

- p95 READY-to-dispatch under 2 seconds;
- writer utilization over 70% while safe READY work exists;
- near-zero main time spent polling or reading raw output;
- bounded review queue and merge queue latency;
- 40-70% end-to-end reduction for mixed product work;
- 70-90% reduction only for discovery, independent UI slices, or mechanical
  migrations with very low serial fraction.

## Concise fresh-session launcher

```text
Hoàn thành toàn bộ active plan trong `.agent` trên candidate hiện tại tới terminal PASS.
Main chỉ điều phối; đọc run capsule/READY queue, không tự code hoặc tự test sản phẩm.
Dùng scheduler để lấp tối đa các cluster READY không xung đột: 8 slot thường, 10 khi tài nguyên an toàn; ít hơn chỉ khi graph hoặc resource broker chứng minh không hữu ích.
Mỗi writer chỉ sở hữu một cluster/worktree, implement + focused self-check; verifier/reviewer độc lập kiểm tra stable snapshot; một integration owner merge rolling theo dependency.
Ưu tiên contract-first, frontstage-first cho sản phẩm UI: hoàn tất và browser-verify journey frontend sớm bằng local adapters, rồi thay dần bằng backend thật.
Giới hạn toàn máy tối đa 2 tiến trình Vitest, mỗi tiến trình 1 worker; full suite dùng cổng riêng theo budget. Full Compose tối đa 1.
Được phép inspect/edit/test, local browser/Compose, local fixture reset, tạo branch/worktree, checkpoint commit và local merge; không push/deploy/publish/chạm production/xóa phá hủy.
Tự xử lý lỗi sửa được, timeout, child stuck và retry; checkpoint rồi abort/reassign khi hết lease. Chỉ yield khi owner-only action là blocker duy nhất sau khi mọi việc local độc lập đã hoàn tất.
Không hỏi lại objective, không nhắc/chọn model, không đọc lại toàn bộ lịch sử khi projection hiện hành đã đủ.
```

This prompt is intentionally only a launcher. If the runtime does not enforce
the scheduler, permissions, worktrees, watchdog, and receipts, adding more prompt
text will not make the behavior reliable.

## Audit of prior `.agent` concepts and projections

### Verdict

The conceptual direction is about **70-75% aligned** with the desired operating
model, but the active artifacts are not yet sufficiently coherent or complete to
drive a fresh session reliably. The newest amendments contain most of the right
ideas; the main defects are contradictory historical policy leaking into runtime,
missing product-execution concepts, stale projections, and absent end-to-end
enforcement.

### Critical projection contradictions

1. The canonical ledger includes AM-0021 and effective identity
   `d38e0cc94127...`, while `projection.plan.yaml`, `autonomy.yaml`, and
   `integration-train.yaml` remain bound to AM-0020 identity
   `21d0a8bbaaf4...`. `projection.plan.yaml` is revision 59; shadow progress
   records an AM-0021 activation at revision 60.
2. `execution-graph.yaml` marks C0-C10 `COMPLETE`, but
   `verification-graph.yaml` reports 54 `GAP` requirements and one `PARTIAL`.
   File existence has been promoted into stage completion without matching
   executable evidence.
3. The ledger contains 51 assignments, but the nine AM-0012 NS1-NS9 assignments
   are `BLOCKED` with no objective and no owned paths. Later AM-0013-AM-0021
   requirements exist in the verification graph but are not represented by a
   usable implementation queue in the ledger.
4. The integration train contains zero receipts, so the branch/worktree merge
   topology has not been dogfooded.
5. The candidate epoch and projections are bound to commit `c417bc8`, while the
   current branch is at `37f3cfa` with 243 dirty entries. The active candidate
   epoch is therefore stale for current execution.
6. Resource projections report one CPU and about 15.6 GiB RAM, while the current
   host exposes 20 logical processors and about 34.1 GB physical RAM. Any
   scheduler decision based on the projection is invalid.

These contradictions must fail the active-projection fidelity gate and trigger a
single atomic recompile. A fresh main must never be allowed to choose whichever
projection is convenient.

### Keep as canonical concepts

- Immutable source plan and append-only amendment history.
- One deterministic lifecycle owner and one current effective identity.
- Typed cross-stage ready queue with explicit hard/global gates.
- Coherent implementation clusters rather than universal micro-tasks.
- Exact path plus semantic-resource leases.
- Isolated branch/worktree per writer and one rolling integration owner.
- Separate writer, verifier, reviewer, browser, test, Compose, and integration
  resource pools.
- Worker focused self-check separated from independent verification/review.
- Risk-tiered review and consolidated repair packs.
- Nonterminal waiting states and durable checkpoint/resume.
- Orchestration-only main, semantic wake policy, MainRunCapsule, EventDelta,
  artifact pointers, and raw-output broker.
- Truthful candidate/evidence binding and stale-evidence invalidation.

The strongest reusable material is AM-0013, AM-0014, the host-neutral parts of
AM-0019, the review semantics in AM-0020, and the context contract in AM-0021.

### Retain only as archive or compile away

- AM-0006 through AM-0011 contain obsolete host topology, live-federation,
  fixed-session, fixed-writer, wave, and provider-routing policies.
- AM-0007 and parts of AM-0009/AM-0012/AM-0020 hard-code provider/model families.
  Those names may remain in immutable history and telemetry, but must not enter
  project prompts or the active host-neutral execution packet.
- AM-0008/AM-0009/AM-0010 specify four-session, three/four-child, two-writer, or
  dual-supervisor defaults. Later adaptive policy supersedes them, but this
  precedence is not obvious to a worker reading the chain.
- AM-0018 states that the dual-supervisor policy remains intact, conflicting with
  AM-0012 and AM-0019 supersession. The compiled snapshot must resolve the later
  rule explicitly.
- AM-0015's `main` history rewrite and eventual single-branch cleanup is a
  repository-release migration, not a default execution behavior. It should be
  owner-only and excluded from ordinary product runs.
- Five-host/four-host certification belongs to Harness release certification,
  not completion of `pos-ops` or `mini-toeic.score`.
- Repeated “before next source wave” activation prose is historical ceremony;
  runtime needs one transaction and one receipt, not repeated worker reading.

Do not rewrite these immutable files. Keep them under archive authority and
generate one current policy snapshot that contains only the winning semantics.

### Concepts that exist but need sharper contracts

| Concept | Current weakness | Required correction |
|---|---|---|
| Adaptive concurrency | Several historical caps and prompts can still override it | Scheduler is sole owner; emit reason when below useful target |
| Main orchestration-only | AM-0019 still assigns diff inspection/reconciliation broadly | Main reads digests and only drills into conflict/risk evidence |
| Cluster ownership | Current ledger has empty-objective/empty-path blocked tasks | Reject compilation unless archetype, start anchor, objective, ownership, AC and proof exist |
| Review | Strong integrity model can over-review normal work | T0 deterministic; T1 one review; T2/T3 only at material risk boundaries |
| Autopilot | Durable states exist conceptually | Add semantic-progress watchdog, process-group reaper, checkpoint/abort/reassign |
| Worktree train | CLI exists separately | Make it part of the main execution transaction and dogfood it |
| Resource governor | Static/stale host projection | Live broker owns capacity; projections are time-stamped observations only |
| Vitest | Only generic full-build/test ceiling exists | Global Vitest semaphore=2; one internal worker per process; full-suite policy explicit |
| Host parity | Prompts and provider fields are mirrored | Enforce main selection, Task allowlists, tool deny lists, hooks and session events |
| Fresh-session resume | Full history remains discoverable and tempting | Load one signed current projection; archive is drill-down only |

### Missing concepts that should be added

1. **Execution archetypes.** The plan does not yet define a closed contract for
   `UI_VERTICAL`, `BACKEND_CONTRACT`, `REFACTOR_PRESERVE_BEHAVIOR`, `MIGRATION`,
   `INFRA_TOPOLOGY`, and `CONTINUATION_REPAIR`.
2. **Contract-first/frontstage-first product sequencing.** The current plan has
   UI/taste and vertical-journey ideas but no explicit policy that product UI
   should become complete/clickable early against typed local adapters.
3. **Canonical Compose topology discipline.** There is no policy forbidding ad
   hoc/one-shot seed containers or requiring every runtime container to belong to
   the declared topology.
4. **Local full-mode simulation.** There is no general contract for prod-like
   synthetic data, state profiles, external-provider simulation, inbound event
   injection, or production fail-closed guards.
5. **Stable review handoff.** `ReviewBundle` is not yet a canonical cross-host
   artifact for cheap Codex review.
6. **Dirty-candidate branch materialization.** Candidate epoch exists, but the
   authority and mechanism that convert dirty work into a safe worktree base are
   not one executable default.
7. **Queue and bottleneck SLOs.** The plan measures broad performance but does
   not make READY-to-dispatch, review wait, test wait, merge wait, and main wake
   cost the primary throughput signals.
8. **Projection single-source gate.** Ledger, projection, shadows, graphs, train,
   and candidate epoch must be atomically version-bound; any mismatch must stop
   dispatch and auto-rebuild the projections.

### Recommended structural change

Do not add another long amendment containing prose versions of the same ideas.
Use one short convergence amendment only to authorize the change, then compile:

```text
immutable archive (original + amendments)
              |
              v
single canonical ledger/event store
              |
              v atomic compile
current policy snapshot + queue + clusters + resource observation
              |
              v
host adapters / workers / reviewers / integration train
```

The active snapshot should include explicit `supersedes` resolution and be small
enough that main can validate it deterministically and workers never need to read
the amendment chain.

## Risks

- Authorizing local commits/merges over a dirty candidate without a captured
  epoch can mix unrelated user work.
- Frontend-first without frozen contracts creates mock-only behavior and costly
  backend rework.
- Fixed “always ten agents” operation amplifies merge, test, and context queues.
- Two unconstrained Vitest processes can still saturate CPU through internal
  fan-out.
- Global bypass permissions allow a mistaken role to violate ownership despite
  correct prompt text.
- A local simulation provider without environment fail-closed checks can become
  an accidental production bypass.

## Recommendation

Prioritize one vertical engine activation milestone before more amendments:

`compiled active projection -> native host dispatch -> isolated worktree ->
focused proof -> independent review -> rolling local merge -> watchdog recovery
-> bounded main capsule`.

Then dogfood that exact path on one cluster in `mini-toeic.score` and one in
`pos-ops`, sharing the same machine resource broker. Do not expand the permanent
agent taxonomy further; keep a small stable set of supervisor, cluster writer,
debugger, verifier, risk reviewer, and integration owner. Domain and work type
belong in the cluster packet.

Context-evolution classification:

- Global agent rule: orchestration-only main; self-check vs independent proof;
  finite authority envelope; no nested workers.
- Harness/runtime: scheduler, resource/test broker, worktree train, watchdog,
  review bundle, and host adapter enforcement.
- Project/profile: frontstage-first preference, product cluster maps, canonical
  Compose and local simulation requirements.
- Raw evidence only: observed slowness, stuck children, and current dirty/locked
  worktree state.

No living rule should be promoted from this research until the vertical engine
path is implemented and dogfood receipts demonstrate the behavior.

## Unknowns

- Whether the owner will authorize local checkpoint commits and local integration
  merges in the three dirty repositories.
- Which dirty candidate files are intentional and safe to include in each epoch.
- Actual shared-machine CPU topology: the current resource budget records one
  CPU, which appears stale and should be measured by the broker.
- Exact OpenCode event taxonomy/provider behavior for permission waits and hung
  tools under the installed version.
- Whether the locked `mini-toeic.score` Claude worktree contains useful committed
  work despite its missing recorded process.

Hand to Plan Architect
