# AM-0015 — Progressive quality release, uninterrupted 8→9.5→10 closure, and main history consolidation

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This amendment is additive to the immutable original plan and the ordered
approved amendment chain. It supplements AM-0012, AM-0013, and AM-0014. It
does not rewrite `original.md`, any earlier amendment, historical receipt,
review, reconciliation, or shadow projection.

Immutable original SHA-256:
`c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`

AM-0012 SHA-256:
`2147aa9631fab0aab10a1e81b7339ba1b1b420d57080d2ef99bf2a88674b41a2`

AM-0013 SHA-256:
`a8989935c5e0b188b42279b19b167ffad6458d39a17ecad5397ef29301433f0b`

AM-0014 SHA-256:
`951fe2028c3ed6db85530979ec910ed8fc14a7a5dfb041bb829da2f5e41fa209`

## 1. Owner decisions

### 1.1 Final target remains 10/10

The product target is evidence-backed 10/10 across every active fitness
dimension. Milestone 8/10 is an installable internal release, not a reduction
of the final target. Milestone 9.5/10 is a hardened release candidate, not a
terminal state.

Execution proceeds through one uninterrupted durable run:

```text
current NEEDS_REMEDIATION
→ M8 INTERNAL_READY
→ install and dogfood exact M8 artifact
→ M9.5 RELEASE_HARDENED
→ continue hardening and burn-in
→ M10 COMPLETE
```

The orchestrator must not stop, ask whether to continue, or hand control back
merely because M8 or M9.5 passed. It records and announces the milestone,
checkpoints durable state, then immediately dispatches the next ready work.

### 1.2 Milestone notifications are not completion claims

The only permitted milestone notifications are:

```text
MILESTONE_8_INTERNAL_READY
MILESTONE_9_5_RELEASE_HARDENED
HARNESS_V3_10_OF_10_COMPLETE
```

`MILESTONE_8_INTERNAL_READY` and `MILESTONE_9_5_RELEASE_HARDENED` must not set
the global plan to `COMPLETED`. The ledger remains an active resumable run until
M10 reconciliation passes.

### 1.3 Install and dogfood at M8

When M8 passes, the engine must:

1. Commit and push the exact milestone candidate through the approved release
   path.
2. Construct the consolidated `main` history described in section 6.
3. Re-run GitHub and local gates on the rewritten `main` SHA.
4. Install that exact artifact on the owner's machine.
5. Run doctor, activation, runtime-mirror, and smoke-project checks.
6. Mark the installed M8 artifact as the dogfood runtime.
7. Continue M9.5 work without waiting for another owner prompt.

Dogfood findings become anchored repair work in the same effective plan. They
do not rewrite the immutable original.

### 1.4 Consolidate all `main` history, not candidate branches

After the candidate has been pushed and independently verified, the complete
history of `main` is rewritten into a small semantic commit series.

- The rewrite applies to `main`, not to candidate/worker branches.
- Candidate branches remain unchanged until useful work is rescued.
- Old `main` and successor lineage are preserved by annotated tag and Git
  bundle with SHA-256 before rewrite.
- Rewritten `main` receives a new SHA; every old CI, review, attestation,
  reconciliation, and installation claim becomes stale.
- Force update must use an exact expected-old SHA/force-with-lease equivalent.
- Rewritten `main` must pass fresh CI and exact-artifact installation before
  non-main branches or worktrees are deleted.
- Final branch state is one local and remote branch: `main`. Historical tags
  and release bundles may remain as immutable evidence.

## 2. Evidence-backed fitness scale

A score is a projection of evidence, not an owner sentiment or worker claim.
The same rubric applies to every active dimension.

| Score | Minimum evidence state |
|---|---|
| 0–2 | Intent, prose, scaffold, or unconsumed schema only |
| 3–4 | Partial source exists; critical paths missing or unverified |
| 5–6 | Main paths implemented with focused tests; integration truth incomplete |
| 7 | Integrated locally; material portability, security, UX, or release gaps remain |
| 8 | Internal-release contract passes on one exact SHA with real CI, install, and independent evidence |
| 9 | Hardened across supported environments; no known high-risk debt; repeated gates pass |
| 9.5 | Release candidate survives adversarial, recovery, usability, and maintainability closure |
| 10 | Sustained real-project evidence, no known open defect, fresh full reconciliation, and repeatable release |

Scores may not be averaged to hide a weak dimension. Each milestone requires
the minimum score in every dimension individually. A Critical or High finding
caps the affected dimension below 8 and blocks M8.

## 3. Canonical fitness dimensions

The scorecard contains exactly these active dimensions unless an approved
amendment adds or supersedes one:

1. Vision and target architecture.
2. Repository hygiene.
3. 5fedu context preservation.
4. Plan lifecycle.
5. Engine/controller/verifier.
6. Native swarm orchestration.
7. Platform adapters.
8. Test engineering.
9. GitHub CI.
10. Certification.
11. Security.
12. Maintainability.
13. Control Plane engineering.
14. Control Plane data truth.
15. Control Plane taste and UX.
16. Documentation.
17. Install and release convergence.
18. Resource and speed control.

Every dimension must record:

- Current numeric score.
- Evidence URIs and hashes.
- Open findings by severity.
- Required work to reach the next milestone.
- Independent reviewer identity.
- Exact candidate and effective-plan identity.
- Timestamp and freshness.

## 4. M8 — INTERNAL_READY

### 4.1 Purpose

M8 is the first useful internal product release. It must be safe enough to
install on the owner's machine and use to execute other projects while the same
run continues toward M9.5 and M10.

### 4.2 Required gates

M8 passes only when:

1. Every fitness dimension is at least 8/10 with linked evidence.
2. Original bytes and all ordered amendments through AM-0015 are verified and
   activated.
3. C0 plan activation is transactional, deterministic, crash-safe, and
   independently accepted.
4. All useful worktree candidates are fingerprinted, rescued, integrated, or
   explicitly rejected with evidence.
5. No Critical or High finding remains open.
6. Local build, typecheck, unit, integration, schema, security, browser,
   accessibility, and visual gates pass on one exact candidate.
7. GitHub Quality passes on Linux, Windows, and macOS for that candidate.
8. Host and certification claims use truthful installed/supported capability;
   a matrix label is not native evidence.
9. The Control Plane reads the canonical ledger and never displays configured
   platforms as healthy without evidence.
10. The Control Plane reaches an independently reviewed 8/10 taste/UX baseline,
    including responsive, dark/light, loading/empty/error/stale/offline states,
    useful hierarchy, and real plan/architecture visualization.
11. Security scan has no Critical/High production finding; required actions and
    release dependencies are integrity-locked.
12. Runtime governor observes system available memory, swap, descendant RSS,
    thermal state, tool pools, provider limits, and orphan descendants.
13. Installer staging, atomic swap, rollback, doctor, and mirror verification
    pass for the exact rewritten `main` artifact.
14. At least one disposable fixture project and one representative local
    project complete a bounded smoke run using the installed harness.
15. Fresh reconciliation maps every M8-effective requirement to `MATCH` or
    approved `SUPERSEDED`; later milestone work remains explicitly open.

### 4.3 M8 release state

M8 produces:

- A rewritten, verified `main` SHA.
- An internal-release tag such as `v3.0.0-internal.1`.
- A release manifest binding source, bundle, installer, ledger, and CI.
- An installed runtime receipt.
- A dogfood baseline and open M9.5 task graph.

Global execution state remains active. M8 must not emit
`HARNESS_V3_10_OF_10_COMPLETE`.

## 5. Continuous dogfood after M8

The installed M8 harness becomes the execution runtime for the remaining
Harness work and selected other projects.

Each dogfood run records:

- Plan recognition and adoption behavior.
- Time to first safe dispatch and terminal outcome.
- Model/provider resolution and fallback.
- Native-agent concurrency and cache reuse.
- RAM, swap, CPU package temperature, and orphan-process behavior.
- Receipt freshness and false-PASS rejection.
- Maintainer acceptance and usability friction.
- Control Plane truth and interaction findings.

Dogfood failures are triaged:

- Critical/High: immediately reopen affected M8 acceptance criteria and repair.
- Medium: schedule on the M9.5 critical path.
- Low/polish: schedule for M9.5 or M10 without hiding it.

The installed internal version may be rolled back, but the durable run
continues from the last valid checkpoint.

## 6. Main-history consolidation contract

### 6.1 Pre-rewrite safety gate

Before rewriting `main`:

1. Push the full candidate lineage to a temporary remote integration ref.
2. Verify real CI on the pushed candidate SHA.
3. Record remote refs, commits, trees, worktrees, dirty candidates, and pull
   request/run URLs.
4. Create an annotated archival tag that binds old `main`, successor tip,
   effective-plan hash, and candidate SHA.
5. Create a Git bundle containing all pre-rewrite refs.
6. Compute SHA-256 for the bundle and store it in lineage/release evidence.
7. Prove restoration in a temporary clone or isolated repository.
8. Obtain an independent read-only history-rewrite review.

### 6.2 Semantic `main` history

The complete `main` tree is reconstructed as approximately four to six
coherent commits. The preferred five-commit narrative is:

1. `feat(harness): establish canonical architecture and contracts`
2. `feat(context): add rules, skills, profiles, and platform adapters`
3. `feat(engine): add plan lifecycle, orchestration, verification, and evidence`
4. `feat(control-plane): add truthful observability and refined UX`
5. `ci(release): add portable gates, installer, security, and documentation`

Commit boundaries may be adjusted to preserve buildability, but the final
series must remain small, semantic, and evidence-linked. It must not preserve
dozens of patch-loop or false-convergence commits on `main`.

### 6.3 Rewrite and re-certification

1. Reconstruct the semantic series from the verified candidate tree.
2. Compare final tree hash with the verified pre-rewrite candidate tree.
3. Update `main` with exact expected-old-SHA protection.
4. Push rewritten `main`.
5. Treat all prior evidence as stale.
6. Run fresh Quality, Certification, reconciliation, security, browser/visual,
   installer, and runtime doctor gates on rewritten `main`.
7. Install only the rewritten exact artifact.
8. If any gate fails, restore from the archival tag and bundle or repair
   rewritten `main`; never claim M8 from pre-rewrite evidence.
9. After M8 re-certification, delete non-main branches/worktrees only after
   their accepted/rejected evidence is recorded.

## 7. M9.5 — RELEASE_HARDENED

M9.5 passes only when:

1. Every fitness dimension is at least 9.5/10.
2. No Critical, High, or release-blocking Medium finding remains.
3. Three consecutive GitHub Quality and Certification cycles pass without
   retrying a flaky failure into green.
4. Native-host/support claims match real installed capability and freshness.
5. Crash, cancellation, timeout, resume, rollback, cache corruption,
   plan-tamper, shadow-drift, stale-review, provider-failure, and thermal
   scenarios pass adversarial tests.
6. Giant high-risk modules and duplicate automation are decomposed or accepted
   by explicit evidence-backed maintainability review.
7. Control Plane real-data, accessibility, motion, responsive behavior,
   visual quality, and error handling pass independent browser and visual QA.
8. Performance, token, provider, and resource telemetry demonstrate bounded
   operation under representative parallel load.
9. Documentation, runtime mirrors, manifests, commands, and support matrix are
   generated or checked from canonical truth.
10. Exact release candidate installs, upgrades, rolls back, and re-installs
    cleanly.

After notification, execution continues automatically to M10.

## 8. M10 — COMPLETE

M10 requires:

1. Every fitness dimension is 10/10 under the evidence rubric.
2. Every effective requirement is `MATCH` or approved `SUPERSEDED`.
3. Zero open finding of any severity accepted as product debt.
4. Fresh independent architecture, security, maintainability, UX, and terminal
   reviews bind the same exact `main` SHA.
5. Repeated scheduled CI and certification remain green across the configured
   burn-in window.
6. At least three distinct real-project dogfood runs complete successfully,
   including one long/resumable run and one injected-failure recovery run.
7. No false `COMPLETED`, stale evidence acceptance, branch ownership escape,
   orphan process, split-brain ledger, or synthetic native attestation is
   observed during burn-in.
8. Release creation from clean checkout is deterministic and its exact artifact
   passes install, doctor, smoke, rollback, and reinstall.
9. `main` is the newest complete implementation and the only local/remote
   branch.
10. Final reconciliation remains fresh after release artifact generation and
    installation.

The burn-in window is evidence-driven. Waiting for scheduled evidence is a
durable monitoring state, not a user handoff. The orchestrator continues all
ready work and reports only a genuine external blocker.

## 9. Automatic continuation and stopping policy

The orchestrator must:

- Checkpoint before context compaction, provider transition, install, history
  rewrite, and each milestone notification.
- Resume from filesystem, git, and canonical `.agent`, never from summary alone.
- Dispatch the maximum resource-safe conflict-free cluster set.
- Continue repair/review/reconciliation loops until the current milestone gate
  passes.
- After M8 and M9.5, update the next milestone DAG and continue immediately.
- Avoid owner questions for decisions already locked in the effective plan.

It may stop only for:

- A credential, account, hardware, protected-branch approval, or external
  service decision that cannot be derived or safely self-provisioned.
- A repository fact that makes the effective owner intent impossible and
  therefore requires an amendment.
- A destructive target whose identity cannot be proven.

Before reporting a blocker it must complete every independent in-scope task,
persist an exact checkpoint, and present one minimal actionable blocker.

## 10. Required implementation surfaces

AM-0015 must be enforced through:

- Engine milestone and scorecard contracts.
- Ledger schema, activation, shadow projection, and stale-evidence rules.
- Scheduler automatic-continuation behavior.
- CLI milestone status, install, history-preflight, and release commands.
- Platform adapters and resume hooks.
- Control Plane milestone/fitness/release views.
- CI fixtures for milestone gating and rewritten-SHA freshness.
- Installer and doctor exact-artifact verification.
- Documentation and ADRs.

Prompt prose alone is not implementation.

## 11. Acceptance criteria

1. Original and AM-0012 through AM-0015 hashes are verified before source work.
2. AM-0015 activates only after C0 safely supports ordered atomic activation.
3. Every fitness dimension has evidence-backed score and open-gap record.
4. M8 fails if any dimension is below 8.
5. M9.5 fails if any dimension is below 9.5.
6. M10 fails if any dimension is below 10.
7. No average score can hide a weak dimension.
8. Critical/High findings block M8.
9. M8 installs only a rewritten-`main` artifact with fresh post-rewrite gates.
10. M8 notification does not set the global plan to `COMPLETED`.
11. M8 automatically starts the M9.5 queue.
12. M9.5 automatically starts the M10 queue.
13. OpenCode/Claude/Codex or another host may resume from the same artifacts
    without a new owner prompt.
14. Pre-rewrite lineage is restorable from annotated tag and hashed Git bundle.
15. The complete `main` history, not worker branches, is consolidated.
16. Rewritten `main` has approximately four to six semantic commits.
17. Final rewritten tree matches the accepted candidate tree.
18. Pre-rewrite evidence is rejected as stale for rewritten `main`.
19. Fresh GitHub CI and exact installation bind rewritten `main`.
20. Dogfood findings create anchored repair work automatically.
21. Three distinct real-project runs contribute to M10 evidence.
22. The orchestrator stops only on a genuine external/owner blocker.
23. Only final M10 may emit `HARNESS_V3_10_OF_10_COMPLETE`.

## 12. Activation contract

Before the next source mutation:

1. Verify original and AM-0012 through AM-0015 bytes and hashes.
2. Preserve current candidates as fingerprinted untrusted work.
3. Complete C0 and activate AM-0012, AM-0013, AM-0014, and AM-0015 in order
   through the engine-owned atomic path.
4. Recompute the effective identity.
5. Invalidate stale reviews, reconciliations, attestations, CI, and scorecards.
6. Regenerate shadows atomically.
7. Compile M8 work into the clustered rolling ready queue.
8. Enter `NEEDS_REMEDIATION` honestly and continue until M10.

The amendment's presence is not activation, implementation, milestone, or
completion evidence.
