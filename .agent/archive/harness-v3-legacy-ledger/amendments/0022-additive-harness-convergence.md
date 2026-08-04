# AM-0022 — Additive Harness Convergence

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This amendment is additive after AM-0021. It preserves the immutable original,
the ordered amendment chain, every non-conflicting capability, and every
unimplemented requirement that remains valid backlog. It supersedes only the
conflicting execution details named below. Historical artifacts remain immutable
lineage evidence and are not rewritten or deleted.

Immutable original SHA-256:
`c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`

Prior ledger-effective amendment: `AM-0021`

Prior effective-plan SHA-256:
`d38e0cc94127a71f3dd5b6bbddeec94834e6178ff8ac6491dd045960b6951f4e`

Prior canonical shadow revision: `60`

AM-0004 remains absent and tombstoned.

## 1. Preservation and precedence

The effective contract is:

```text
immutable original
→ ordered effective amendments
→ explicit concept-level supersession
→ carried non-conflicting capabilities and backlog
→ compiled execution contract
```

Later wording does not erase an earlier requirement merely because it is old or
not implemented. A prior requirement leaves the effective backlog only when an
approved amendment identifies the conflicting concept and records a successor
requirement or explicitly rejects it as obsolete.

The following execution details are superseded:

| Earlier detail | Winning decision |
|---|---|
| Live cross-host OpenCode supervision, `CODEX_FEDERATED`, and fixed one/dual-supervisor defaults from AM-0006/0008/0009/0010/0011 | Depth-one native execution, optional artifact handoff, and no unapproved live-session bridge |
| AM-0019 total-child ceiling 14 and 10–14 burst guidance | 8 normal and 10 burst as adaptive machine targets |
| Remote push, deployment, production mutation, branch cleanup, or main-history rewrite implied by AM-0003/0006/0015 | Local checkpoint, commit, integration merge, and certified local-main actions only; later owner authority is required for external/destructive actions |
| Model-specific prompt and role names | Provider-neutral capability and authority classes resolved by the active adapter |
| Full semantic LLM review after every micro-change | Risk-tiered rolling review plus complete terminal convergence |

All other requirements remain effective. In particular, old unimplemented work
is backlog, not implicitly cancelled scope.

## 2. Additive requirements

### M11-R51 — Capability preservation and conflict-only supersession

The plan compiler emits a capability-preservation matrix for the full effective
chain. Every prior requirement or capability is `CARRIED`,
`SUPERSEDED_CONFLICT`, or `REJECTED_OBSOLETE`, with source IDs, reason, and
successor IDs. The default is `CARRIED`; missing implementation remains active
backlog. No compact prompt, pointer, cleanup, or projection may silently drop it.

Acceptance:

1. A carried but unimplemented requirement remains schedulable backlog.
2. Every superseded requirement names an actual conflict and successor.
3. Removing an unmapped prior capability fails contract compilation.

### M11-R52 — Fresh-session execution without process ceremony

A fresh supported session can resolve `.agent/current.json`, validate the
immutable original and amendment chain, load the compiled contract, and execute
all dependency-ready authorized work without rereading the chat transcript or
asking routine continuation questions.

The portable execution prompt is concise and model-neutral. It points to the
current contract and states only the objective, authority boundary, continuation
rule, and terminal evidence contract. Identity, current-pointer generation,
requirement/claim scope, candidate epoch, owned/forbidden paths, proof contract,
and receipt destination are injected by the engine capsule rather than repeated
as prompt prose. Provider/model selection remains adapter-owned runtime data.

Acceptance:

1. A fresh process resumes from artifacts without transcript replay.
2. A prompt without a complete identity/authority envelope fails closed.
3. Routine retries, review rejection, and repairable test failures do not ask the
   owner whether to continue.

### M11-R53 — Adaptive work shapes and frontstage-first delivery

Work shape is selected from risk, dependency, rollback, and proof needs:
`small`, `standard`, `large`, or `resumable`. File count is guidance, never the
primary classifier.

When multiple safe paths exist, execution is frontstage-first: deliver the
smallest end-to-end user-observable vertical path that shortens feedback time.
Frontstage-first may not bypass domain contracts, permissions, data integrity,
migrations, public schemas, verification, or rollback. Backend and contract work
that is required to make the visible path truthful stays on the critical path.

Acceptance:

1. A one-file safe fix does not spawn ceremonial agents.
2. A multi-layer user journey may remain one coherent cluster.
3. UI-only work cannot claim completion while its required contract is fake or
   missing.

### M11-R54 — Meaningful native swarm and safe ambition

The large/resumable active-run native-child targets are:

| Mode | Target |
|---|---:|
| Normal | 8 children: 4 writers, 2 verifiers, 1 reviewer, 1 integration-preparation utility |
| Safe burst | 10 children: 5 writers, 2 verifiers, 2 reviewers, 1 integration-preparation utility |

The main coordinator is separate from these child counts. These are
useful-capacity targets, not quotas. The scheduler uses fewer agents
when the ready graph, ownership conflicts, host capability, review/integration
capacity, or measured resource pressure makes more work unsafe or useless. It
does not create placeholder work to fill slots.

Small work normally uses one implementer and deterministic focused proof;
standard work uses two to four independent writers plus shared verification.
Subagent count is not reduced merely because local CPU is modest: child agents
and local heavy tools have separate resource pools.

For parallelizable medium/large dogfood, the directional SLO is a 70–90%
reduction in p50 wall-clock time against the current harness with equivalent
quality and evidence. Small work must not be slower than the direct pair-work
baseline. p95, retry, merge-wait, review-wait, and escaped-defect results remain
visible; 90% is a stretch target, not a universal guarantee.

Acceptance:

1. Eight safe independent roles may run normally and ten may run in a measured
   safe burst with the declared composition.
2. A lower count records the observed constraint.
3. A higher count is rejected by the compiled AM-0022 contract.
4. Dogfood reports p50 and p95 by work shape without weakening the proof gate.

### M11-R55 — Baseline resource tier and Vitest containment

The target development baseline is 16 GB RAM and an Intel Core i7-12700H-class
CPU. This is a performance/resource certification tier, not a host exclusion.
Weaker or hotter machines scale down honestly; stronger machines still obey the
AM-0022 8/10 child ceiling unless a later amendment changes it.

At most two Vitest parent processes may run concurrently per project, not two
for the whole machine. Each parent uses one internal worker and disables file
parallelism. Two independent focused shards may occupy the two slots. A full
project suite atomically consumes both project slots and excludes every other
Vitest parent for that project until it exits. Different projects may each use
their two slots while the adaptive host governor considers total CPU/RAM
pressure. Workers must not create duplicate watch, full-suite, or orphan Vitest
parents.

Acceptance:

1. The third concurrent Vitest parent for one project waits; another project is
   not blocked merely because the first project has two active parents.
2. Cancellation terminates the owned Vitest descendant process group.
3. A full suite waits for both slots and then runs exclusively.
4. Resource pressure reduces affected heavy-tool pools without stopping
   unrelated light work.

### M11-R56 — Main coordinator-only context economy

The main agent is coordinator-only for product source and tests. It preserves
intent, resolves material decisions, assigns ownership, inspects diffs and
evidence, integrates accepted work, reconciles requirements, and explains the
machine verdict. Product implementation belongs to bounded workers.

Main receives signed deltas, compact review bundles, and targeted drill-down.
Raw child JSONL, complete logs, full ledgers, repeated full-plan text, and
unbounded command output stay in content-addressed evidence by default. Context
economy never weakens correctness or blocks required drill-down.

Acceptance:

1. Direct main-authored product source/test changes are rejected.
2. Every main conclusion traces to an anchor, diff, evidence, or review receipt.
3. Fidelity failure loads exact canonical material and continues.

### M11-R57 — Clean worktrees, checkpoints, and local integration authority

Each writer owns an isolated branch/worktree, immutable base epoch, explicit
path and semantic leases, acceptance criteria, and rollback contract. One
integration owner may checkpoint, commit, rebase/replay, resolve bounded clean
integration conflicts, merge accepted candidates locally, and fast-forward a
freshly certified local `main` when the effective plan permits it.

AM-0022 does not authorize remote push, deployment, production mutation,
credential changes, force-push, remote branch deletion, or destructive history
rewrite. Those actions require later explicit owner authority.

Acceptance:

1. Only reviewed candidate snapshots enter the local integration train.
2. A merge-changing candidate invalidates affected evidence and review.
3. Push/deploy/production operations are denied under this authority envelope.

### M11-R58 — Rolling review economy and compact review bundles

Verification and review are risk-tiered:

- T0 deterministic/mechanical work uses deterministic proof; LLM review is
  optional.
- T1 isolated behavior uses one independent economical reviewer.
- T2/T3 security, data, auth, concurrency, migration, integration, release, or
  equivalent risk uses specialist/adversarial review.
- Stable accepted work enters rolling integration without waiting for a logical
  wave.
- Complete architecture, security, maintainability, full-stack, UX when
  relevant, reconciliation, install, and release convergence remains mandatory
  at the terminal boundary.

A compact review bundle binds candidate epoch, claim scope, affected plan
anchors, exact diff artifacts, evidence pointers, open findings, omitted-item
manifest, capability requirements, and drill-down rights. It excludes raw logs,
the full ledger, and full-plan replay by default.

Acceptance:

1. Findings for one stable snapshot are deduplicated into one repair pack.
2. A post-review relevant change makes the receipt stale.
3. Review economy cannot remove a required specialist or terminal review.

### M11-R59 — Stuck-child recovery

The supervisor detects stale heartbeat/lease, bounded no-progress loops,
provider loss, orphaned descendants, and lost responses. Before recovery it
persists a checkpoint, partial receipt, owned process-group identity, and exact
reason. It then terminates or adopts only the affected process group and
redispatches with a fresh worker identity when retry policy permits.

Broad process killing, duplicate mutation, same-writer infinite retry, and loss
of accepted partial evidence are prohibited.

Acceptance:

1. A stale child is recovered without cancelling independent siblings.
2. Recovery after controller restart is idempotent.
3. The third equivalent failure changes writer, task shape, design, or review
   tier.

### M11-R60 — Canonical Compose and full local simulation

Each service-bearing project identifies one canonical Compose topology for
full local simulation. Release-parity evidence may not be assembled from
one-shot ad-hoc containers that bypass this topology.

The simulation covers required services, public ingress, dependencies,
migrations, seed, async workers/queues, health, auth roles, persistence, restart,
rollback, logs, and cleanup as applicable. External-provider projects expose a
`real | local-sim` adapter switch, deterministic state profiles, and inbound
event injection for success, delay, timeout, duplicate, retry, out-of-order,
partial-success, and terminal-failure paths. Only one full Compose topology runs
per project by default.

Resetting an explicitly named non-production development volume is authorized
when the exact Compose project and volume resolve inside the current project,
the pre-reset state is classified, and the reset is required by a declared
fixture/rollback contract. Anonymous, external, shared, staging, or production
volume deletion is prohibited.

Acceptance:

1. Full local simulation uses the canonical topology and public ingress.
2. A one-shot container cannot satisfy the full-topology claim.
3. A volume reset without an exact non-production name and containment proof is
   denied.

### M11-R61 — Controlled cross-project conversion and dogfood

`pos-ops` and `mini-toeic.score` are approved controlled dogfood targets for the
portable AM-0022 behavior. `mini-toeic.score` is near completion and therefore
uses gap-closing/minimal-intervention mode: preserve accepted behavior, avoid
broad refactors, and touch only current blockers, missing evidence, or harness
adoption surfaces. `pos-ops` may use full convergence. Conversion is
preservation-first:

1. Inspect existing sessions, processes, branches, worktrees, and dirty state.
2. Freeze the real candidate as content-addressed tracked/index/untracked
   evidence before fan-out.
3. Adopt a project-local additive contract without rewriting that project's
   original intent or treating legacy self-claims as terminal truth.
4. Apply the shared machine 8-normal/10-burst ceiling and per-project Vitest cap.
5. Report project completion, behavioral dogfood, installed enforcement, and
   remaining authority separately.

Cross-project dogfood does not authorize push, deployment, production mutation,
or deletion of existing project work.

Acceptance:

1. Conversion never branches from stale HEAD while ignoring a dirty candidate.
2. Preview behavior is not reported as fully installed harness enforcement.
3. Each project retains independent plan, candidate, evidence, and terminal
   truth.

### M11-R62 — Extensible agent-role and capability contract

Roles are provider-neutral authority/capability contracts. The initial registry
supports coordinator, architect/integrator, implementer, researcher/utility,
verifier, reviewer, specialist challenger, and adjudicator. A future role may
be added without changing plan semantics when it declares authority, writable
scope, required capabilities, independence rules, receipt type, and fallback.

Capability absence remains `UNVERIFIED`, `WAITING_CAPABILITY`, or an explicit
fallback; it never silently becomes support. A role may not self-promote its
candidate into a global verdict.

Acceptance:

1. Unknown undeclared roles are rejected.
2. Adding a declared future role does not drop existing role capabilities.
3. Reviewer/verifier independence is enforced by identity and candidate epoch.

### M11-R63 — Atomic generation-based current pointer

`.agent/current.json` is the singular current-plan pointer. It records a
monotonic generation, immutable original, canonical ledger observation,
ledger-effective chain tip, candidate amendment tip, and compiled-contract
status.

Updates use generation compare-and-swap through a same-filesystem staged file,
validation, checksum, durable rename, and reopen verification. A stale expected
generation, absolute/traversing path, missing target, hash mismatch, or partial
write fails closed. The pointer never makes an amendment ledger-effective by
itself.

Until a safe canonical generator exists, the bootstrap pointer may truthfully
record AM-0022 as `PENDING_CANONICAL_ACTIVATION`; the ledger remains runtime
authority.

Acceptance:

1. Two writers cannot commit the same next generation.
2. Crash before rename preserves the previous valid pointer.
3. Pointer, amendment, and ledger identities are reopen-verified.

### M11-R64 — Preservation-first cleanup

Cleanup follows:

```text
inventory
→ classify ownership and authority
→ fingerprint dirty/untracked/worktree/volume/process state
→ rescue or explicitly reject useful work with evidence
→ verify accepted integration and rollback
→ delete only exact authorized non-production targets
```

Cleanup never exists to make status look clean. It must not delete unresolved
requirements, capability evidence, dirty user work, unreviewed branches,
unidentified volumes, shared caches, canonical lineage, or external project
state. Cleanup remains local unless later owner authority explicitly widens it.

Acceptance:

1. Every material deletion has an inventory entry, disposition, and rollback or
   irreversibility acknowledgement.
2. Unclassified work blocks only its cleanup closure; independent work proceeds.
3. Canonical lineage and old valid capability backlog survive cleanup.

## 3. Immediate execution steers

After canonical activation, the controller must:

1. Compile original plus AM-0001…AM-0022 into one effective execution contract.
2. Preserve all non-conflicting old capability and unimplemented backlog.
3. Prefer contract-safe frontstage vertical progress over infrastructure-only
   process expansion.
4. Target eight meaningful native children normally and ten only for a safe
   burst; use fewer when measured evidence requires it.
5. Enforce at most two Vitest parent processes per project.
6. Keep the main coordinator-only and use compact review/context bundles.
7. Checkpoint and integrate accepted work locally; do not push, deploy, or mutate
   production.
8. Use canonical Compose for full local simulation; reset only exact named
   non-production development volumes under the R60 containment contract.
9. Recover stuck children by exact lease/process-group ownership.
10. Convert and dogfood `pos-ops` and `mini-toeic.score` only after candidate
    freezing and project-local adoption.
11. Keep cleanup preservation-first.

## 4. Activation contract

This file does not mutate the canonical ledger or regenerate projections by
itself. Activation must be performed by a safe canonical generator:

1. Verify immutable original and AM-0001…AM-0021 against ledger hashes.
2. Verify AM-0022 raw bytes and captured SHA-256.
3. Compare the expected prior effective identity and shadow revision.
4. Append AM-0022 after AM-0021 through the canonical atomic lifecycle API.
5. Recompute effective identity and mark affected evidence/reviews stale.
6. Compile R51–R64 with plan anchors, ACs, evidence contracts, capability
   preservation, execution clusters, and review bundles.
7. Regenerate every projection/shadow atomically and verify their hashes.
8. Advance `.agent/current.json` by generation compare-and-swap.
9. Retain `NEEDS_REMEDIATION` until fresh evidence closes the effective backlog.

No amendment, pointer, schema, prompt, or source-file presence is implementation
or terminal evidence.
