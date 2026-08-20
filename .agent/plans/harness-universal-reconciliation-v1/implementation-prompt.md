# Portable implementation prompt for OpenCode / DeepSeek

Paste the block below as one ordinary prompt in OpenCode. Normal conversation is
the primary portable entrypoint; `/goal` is optional host ergonomics only.

```text
You are the implementation owner for the resumable goal
`harness-universal-reconciliation-v1` in:

/home/linhnxdeveloper/Documents/ChatGPT/agent-rules

Do not create a new plan and do not reinterpret the architecture. The owner has
already approved the contract. Read these sources completely, in this order:

1. AGENTS.md and every imported rule it references.
2. .agent/plans/harness-universal-reconciliation-v1/original.md
3. .agent/plans/harness-universal-reconciliation-v1/amendments/AM-0001-control-loop-semantic-convergence.md
4. .agent/plans/harness-universal-reconciliation-v1/amendments/AM-0002-control-plane-final-phase-gate.md
5. .agent/plans/harness-universal-reconciliation-v1/amendments/AM-0003-prompt-first-pair-repair.md
6. .agent/research/harness-control-loop-skill-audit-20260812.md
7. .agent/plans/harness-universal-reconciliation-v1/decisions.json
8. .agent/plans/harness-universal-reconciliation-v1/requirements.yaml
9. .agent/plans/harness-universal-reconciliation-v1/task-graph.json
10. .agent/plans/harness-universal-reconciliation-v1/verification-matrix.json
11. .agent/plans/harness-universal-reconciliation-v1/source-index.json
12. .agent/plans/harness-universal-reconciliation-v1/source-lock.seed.json
13. .agent/artifacts/harness-universal-reconciliation-v1/support-pack/manifest.json
14. .agent/artifacts/harness-universal-reconciliation-v1/support-pack/amendment-receipt.json
15. The task recipe for the dependency-ready slice you are about to execute.

The effective contract is revision 4: 22 requirements, 22 claims, and 10 slices.
Expected support-pack SHA-256 is
`24a6ec4a8dca834eb34e783728f5651fadcb417f2699784ad2c840427468b772`;
expected manifest logical SHA-256 is
`5fdba6d2a47ab8ac71325dd2d326cdab3b9c9f8e240a3c9641db2972642cc716`.
Fail closed if those identities or source-anchor hashes do not match.

Repository baseline is main@6e9a554a164e3a7d26df3cdb296392284c8c3166.
Preserve existing user/untracked work. The detached commits d23b12a and b5231f7
are a tested Pencil candidate: inspect and migrate their proven behavior; do not
blindly cherry-pick or silently discard it.

Execution rules:

- Begin with S1. Acknowledge its recipe and record an implementation-intent
  receipt before mutation.
- Treat this ordinary prompt as the primary portable entrypoint. S1 must compile
  normal conversation, optional slash commands, CLI/API calls, and native host
  actions into the same canonical `WorkRequest` and prove semantic parity.
- `/goal` is optional host ergonomics. Preserve any existing generated OpenCode
  command as an `EMULATED` convenience, but never require it, treat its absence
  as failure, or let it become authority over the canonical bundle.
- The current pointer intentionally remains on completed V3.1 during support
  preparation. Do not hand-edit .agent/current.json. Add generic pointer/gate
  compatibility first; activate this goal only in S8 with generation CAS.
- Work dependency-first. At most two workers, no recursion, disjoint write paths.
- The coordinator owns shared contracts, integration, final review, and status.
- A worker may implement only its recipe. Interface/scope conflict requires a
  recorded amendment and selective recipe regeneration.
- Route by logical capability class and risk, not a hard-coded model name.
- Treat the harness as a typed closed-loop control system: record feedforward and
  feedback direction, oracle type, applicability, cost, independence, freshness,
  confidence, lifecycle timing, escalation, and evidence source.
- Convert repeated classified failures into reviewed eval candidates; replay
  historical failures before promotion. Model/provider workarounds require owner,
  trigger, bounded scope, revalidation, expiry, and retirement evidence.
- Runtime clamps override skill-local defaults: no skill/provider may widen
  authority, worker count above two, recursion depth above zero, owned scope,
  effect level, repair budget, or weaken required proof.
- Preserve raw intent -> requirement -> claim -> task -> diff -> evidence links.
- Use the cheapest proof that actually establishes the claim. For UI/business
  flows, prefer visible real browser/device interaction over ceremonial scripts.
- Local browser, mobile, and Pencil sessions must be foreground-observable.
  Headless is valid only in an explicit CI profile.
- Never persist /tmp/.mount_* Pencil paths.
- Cap repair at two attempts per claim; then return honest PARTIAL/NEEDS_USER/BLOCKED.
- Never weaken, delete, skip, or hard-disable verification to make a run green.
- Complete S7A semantic convergence. Fix the known contradictions around
  delegation receipt shape, file-count work sizing, best-of-N worker widening,
  browser QA loading, legacy PAF references, and Control Plane UI precedence;
  keep full-catalog rule/skill/route/link/mirror fixtures green.
- Complete S7B prompt-first pair repair. A normal review prompt must bind the raw
  finding to the active bundle, classify defect/change/evidence/environment/
  unrelated status, compute requirement/claim/task/evidence impact, reopen only
  affected claims in a new evidence epoch, issue a bounded repair packet, and
  require fresh proof without rewriting prior PASS or invalidating unaffected
  claims.
- Preserve `.agent/plans/control-plane-v2/` and `docs/handoffs/` unchanged. The
  Control Plane rebuild is the final phase only. It remains ineligible until all
  selected skills and every provider/tool/MCP/rule/command/host/runtime projection
  are complete and installed, all claims and required CI are green, receipts are
  fresh, and the harness closeout is owner-approved. Only then: foreground Pencil
  design + owner approval, rebuild, Docker Compose, and foreground browser parity.
- Preserve and integrate the current OpenCode dogfood patch that materializes the
  global AGENTS entrypoint, all harness skills, managed agents, and emulated
  `commands/goal.md`; review it as implementation evidence, not as automatic PASS.
- Do not commit, push, update main, delete branches, remove worktrees, or deploy
  without an exact owner-approved CloseoutReceipt.

Dogfood each completed foundation immediately. After each slice, run its exact
recipe proofs, inspect the integrated diff, update checkpoints/evidence, and
continue automatically to the next dependency-ready slice.

Before terminal PASS, require: all 22 requirement claims with fresh evidence,
full local build/check/test/verify, all seven host
fixtures, live installed-host reconciliation, selected-skill/provider parity,
foreground proof where applicable, exact hosted-CI SHA, evidence-preserving
.agent compaction, and an owner-gated closeout report.

Start now from this ordinary prompt by reading the sources, validating the
support-pack hashes, checking the baseline and existing user/untracked paths,
then execute S1 to completion. Do not wait for or invoke `/goal`.
```

If an optional host adapter exists, it may launch the same bundle, but this
prompt remains sufficient on every supported agent.
