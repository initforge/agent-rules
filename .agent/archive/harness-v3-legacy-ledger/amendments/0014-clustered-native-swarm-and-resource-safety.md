# AM-0014 — Clustered native swarm, batched assurance, and resource safety

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This amendment is additive to the immutable original plan and the ordered
approved amendment chain. It supplements AM-0012 and AM-0013. It does not
rewrite `original.md`, any earlier amendment, historical receipt, review,
reconciliation, or shadow projection.

Immutable original SHA-256:
`c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`

AM-0012 SHA-256:
`2147aa9631fab0aab10a1e81b7339ba1b1b420d57080d2ef99bf2a88674b41a2`

AM-0013 SHA-256:
`a8989935c5e0b188b42279b19b167ffad6458d39a17ecad5397ef29301433f0b`

## 1. Owner decision

Native subagents are the primary execution topology. OpenCode and other hosts
remain optional artifact-handoff destinations; one host must not supervise
another host through a live session bridge.

The implementation unit is now a coherent **execution cluster**, not a
universal micro-slice. The scheduler must dispatch the largest resource-safe
set of independent clusters and assurance jobs that shortens the critical path.

Detailed plans remain exhaustive, immutable, anchored, and fully reconciled.
This amendment changes how an accepted plan is compiled for implementation; it
does not reduce plan detail, acceptance criteria, evidence, or terminal gates.

## 2. Superseded execution-size constraints

The original plan's universal five-focus-file implementation-slice limit and
any later universal one-session/micro-slice cap are superseded for
`CLUSTERED_NATIVE_SWARM` execution.

They remain useful defaults for:

- A narrow hotfix.
- A high-risk leaf repair.
- A weak worker that needs a bounded packet.
- A task with an inseparable review boundary smaller than a cluster.

They are not allowed to fragment one coherent subsystem merely to satisfy a
file-count metric.

Cluster boundaries are selected by:

- Semantic cohesion.
- Public-contract ownership.
- Dependency and rollback boundary.
- Independent verifiability.
- Reviewability.
- Merge-conflict and stale-evidence risk.
- Expected critical-path reduction.

Typical guidance, not hard limits:

| Cluster kind | Typical focus |
|---|---|
| High-risk engine/security | 3–8 closely related files with an explicit trust-boundary contract |
| Normal subsystem | 5–15 focus files owned by one coherent outcome |
| UI vertical flow | One complete user journey including state, interaction, accessibility, and tests |
| Mechanical migration | 10–30 same-pattern files when automation and rollback are deterministic |

If a cluster becomes difficult to reason about, verify, review, or roll back, it
must be decomposed by contract. It must not be split only to satisfy a line,
file, token, or session count.

## 3. Plan-to-execution compilation

After plan adoption and amendment activation, the engine compiles:

```text
immutable requirements and acceptance criteria
→ semantic ownership graph
→ dependency DAG
→ conflict and stale-evidence graph
→ coherent execution clusters
→ critical path and rolling ready queue
```

Every cluster contains:

- Requirement and plan anchors.
- Owned paths, symbols, contracts, and integration boundaries.
- Forbidden paths and semantic conflict leases.
- Acceptance criteria and verification profiles.
- Baseline and effective-plan identity.
- Risk tier, rollback contract, model class, and resource estimate.
- Expected downstream unlocks.

Requirements may map to more than one cluster, but every cluster must map back
to approved requirements or amendments.

## 4. Branch and integration topology

Each implementation cluster receives an isolated branch and worktree.

- Multiple writers may execute simultaneously on different clusters.
- No two active writers may own the same path, symbol, public contract, or
  integration boundary.
- Path-disjoint work that changes the same behavior is a semantic conflict and
  must serialize.
- Rejected candidates remain isolated.
- Exactly one integration owner imports accepted candidates.
- The integration owner may rebase, replay, resolve bounded integration
  conflicts, and update execution metadata; it must not silently redesign
  rejected source.

Accepted candidates enter the rolling integration train immediately after
their exact snapshot passes focused assurance. Logical waves remain reporting
groups, never completion barriers.

## 5. Batched assurance instead of review churn

A stable cluster snapshot is reviewed once across parallel assurance axes:

- Correctness and acceptance criteria.
- Security and trust boundaries.
- Maintainability and canonical ownership.
- Test adequacy and false-PASS resistance.
- Platform/runtime behavior when relevant.
- Accessibility, interaction, visual quality, and motion for UI clusters.

Each reviewer is read-only, independent from the cluster's authors, and
preflights the exact branch, worktree, source/test hashes, baseline, and
effective-plan identity.

The orchestrator consolidates all valid findings for that snapshot into one
bounded repair pack. It does not trigger a new writer repair after every
individual comment.

Repair budget for one failure signature:

1. One consolidated repair round.
2. One fresh independent re-review and final bounded repair.
3. A third equivalent failure requires redesign, a fresh writer, or best-of-N;
   it must not repeat the same patch loop.

Whole-system architecture, security closure, original-plan reconciliation,
release CI, installation, and runtime certification remain serial terminal
authorities.

## 6. Separate concurrency pools

Agent concurrency and tool concurrency are different resources. The scheduler
maintains separate adaptive pools:

| Pool | Behavior |
|---|---|
| Native agents | May be numerous when context/provider and system resources permit |
| Source writers | Bounded by ready conflict-free clusters and integration capacity |
| Read-only reviewers | May run beside writers on stable snapshots |
| Focused test runners | Bounded independently from agent count |
| Full-suite runners | One per integrated snapshot by default |
| Browser/visual runners | One heavy browser pool by default |
| Integration | Exactly one owner |

The ready queue may contain more work than active slots. Filling an agent slot
is not useful if the result would wait behind a saturated test, reviewer, or
integration queue.

Initial policy for the current 16 GiB development machine:

- Up to 8 active native agents when they are mostly read/reason operations.
- Up to 4 source writers when clusters are conflict-free and no heavy test is
  running.
- Up to 3 independent read-only reviewers.
- Up to 2 focused test runners.
- One full-suite runner.
- One browser/visual runner.
- One integration owner.

These are startup ceilings, not fixed product limits. The resource governor
must reduce or increase only the affected pool from measured system state.

## 7. Resource and thermal governor

The current process-only RSS and load-average checks are insufficient. The
governor must observe:

- Total process-tree RSS for agents and their tool descendants.
- System available RAM and swap pressure.
- CPU package temperature and thermal critical limit when exposed by the OS.
- CPU load and sustained utilization.
- Test/browser process count.
- Provider quota, rate limit, and request concurrency.
- Reviewer and integration queue depth.
- Orphaned or detached child processes.

Default thermal policy, configurable by platform adapter:

| CPU package state | Required behavior |
|---|---|
| Below 85°C | Normal adaptive dispatch |
| 85–89°C | No scale-up; prefer read-only work |
| 90–94°C | Pause new heavy tests/browser work |
| 95–97°C | Checkpoint and pause new writer/heavy dispatch |
| At least 98°C or reported critical | Stop heavy descendant process groups and enter thermal backpressure |
| Below 80°C for two samples | Gradual resume with hysteresis |

Memory policy must consider system availability, not only the controller RSS:

- Stop scale-up when available RAM falls below 25%.
- Pause new writer/heavy dispatch below 15%.
- Prefer read-only review and metadata work while memory pressure recovers.
- Treat sustained swap-in/swap-out pressure as a scale-down signal.

Provider backpressure never permits evidence fabrication or task loss. A
checkpoint is persisted before cancellation or reassignment.

## 8. Tool-process containment

Every assignment owns a process group or equivalent platform job object.

- Focused writers run only focused checks for their cluster.
- Full engine/workspace suites run on stable accepted or integrated snapshots,
  not independently in every writer.
- Test-runner internal workers are capped by the focused/full-suite pool.
- Timeout, cancellation, worker exit, or controller restart terminates or
  adopts the full descendant process group.
- A test/browser child left detached or reparented without a durable owner is an
  `ORPHAN_PROCESS` finding.
- A receipt is invalid if its verification descendants were orphaned,
  truncated, or outlived the recorded assignment boundary.

## 9. Immediate dogfood clusters

The active Harness successor is compiled into the following initial clusters.
This list is an execution scaffold; the engine must revalidate ownership and
dependencies against repository truth before dispatch.

| ID | Cluster | Current source candidates |
|---|---|---|
| C0 | Immutable plan lifecycle, amendment activation, ledger transaction, deterministic shadows | NS0 v13 plus fresh transaction and semantics module worktrees |
| C1 | Native scheduler, conflict leases, process containment, resource and thermal governor | supervisor/context-cache candidate plus required redesign |
| C2 | Execution modes, plan recognition, artifact handoff, removal of live cross-host OpenCode control | OpenCode/platform/schema/router paths |
| C3 | Verification shards, batched review, repair pack, integration train, CI truth | engine verification, terminal gate, workflows, attestations |
| C4 | Control Plane real-data, plan visualization, Apple-inspired taste, accessibility, browser and visual QA | control-plane candidate plus fresh design review |
| C5 | 5fedu semantic migration, skills/taxonomy, installer/runtime mirrors, docs and cleanup | preserved 5fedu/CLI/automation candidate work |

C0 is the only legitimate source barrier because later assignments must bind an
activated effective-plan identity. Read-only inventory, architecture review,
test design, cluster contract preparation, and resource-governor design may
continue while C0 is implemented.

After C0 activation, C1–C5 enter the rolling ready queue according to real
dependency and semantic-conflict edges. They must not be serialized merely
because their IDs are ordered.

## 10. Recovery and final branch policy

The current repository contains useful uncommitted work in multiple worktrees.
Cleanup order is fixed:

```text
inventory and fingerprint every worktree
→ rescue useful candidate work
→ review and integrate accepted clusters
→ run local and GitHub gates on one HEAD
→ install and verify that exact artifact
→ advance and verify main
→ delete non-main worktrees and branches
```

No branch or worktree may be deleted merely to make the branch list look clean.
The terminal state remains exactly one local and remote branch, `main`, after
all useful work is either integrated or explicitly rejected with evidence.

## 11. Performance target

Approximately two hours is an adaptive ship-time target, not a deadline and not
a reason to reduce scope.

The scheduler records:

- Critical-path ETA.
- Ready and active cluster count.
- Writer, reviewer, test, and integration queue time.
- Cache reuse.
- Retry and redesign time.
- Thermal and memory backpressure.

It continuously chooses the highest safe concurrency that reduces the
critical-path ETA. It continues beyond the target until the real terminal gate
passes.

## 12. Acceptance criteria

1. Plan detail and immutable anchoring remain unchanged.
2. Cluster compilation supersedes universal micro-slicing without creating
   unreviewable mega-tasks.
3. Independent ready clusters run on isolated branches/worktrees.
4. Semantic conflicts serialize even when paths are disjoint.
5. Stable cluster reviews run across independent assurance axes.
6. Findings for one snapshot are consolidated into one repair pack.
7. The third equivalent failure forces redesign, fresh identity, or best-of-N.
8. Agent, writer, reviewer, focused-test, full-suite, browser, and integration
   pools are controlled independently.
9. Resource decisions use system and descendant-process measurements.
10. Thermal thresholds throttle heavy work and resume with hysteresis.
11. Assignment cancellation or timeout leaves no unowned test/browser process.
12. Orphaned verification invalidates the receipt.
13. Focused checks do not replace integrated full gates.
14. Only one integration owner imports accepted cluster candidates.
15. Useful work is rescued before branch/worktree cleanup.
16. Final certified `main` is the newest complete implementation and is the
   only remaining local and remote branch.
17. No source scope, evidence, review, reconciliation, CI, installation, or
   certification gate is weakened to meet the time target.

## 13. Activation contract

Before the next source mutation:

1. Verify original, AM-0012, AM-0013, and AM-0014 bytes and hashes.
2. Preserve all current candidate work as untrusted, fingerprinted inventory.
3. Complete C0 through a reviewed engine-owned activation path.
4. Append AM-0012, AM-0013, and AM-0014 in order.
5. Recompute and persist the effective-plan identity.
6. Invalidate stale evidence and regenerate shadows atomically.
7. Compile the effective requirements into clusters and a rolling ready queue.
8. Enter `NEEDS_REMEDIATION` honestly and dogfood the new policy immediately.

The amendment's presence does not activate it and is not completion evidence.
