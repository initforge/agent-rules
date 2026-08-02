# AM-0011 — Claude first-class host and permanent critical-path convergence

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

This amendment supplements the immutable original plan and all earlier approved
amendments. It does not rewrite `original.md` and it does not restate history.

## Owner decision

### Host set

1. **Claude is a first-class host.** Claude joins the native-attestation host set
   as a peer of the other required runtimes, not as an afterthought.
2. **Required-now hosts** (must produce truthful native attestations before the
   final terminal gate can PASS): **Codex runtime, Claude, Grok, OpenCode.**
   `REQUIRED_HOSTS` in the engine terminal gate must be exactly
   `['codex', 'claude', 'grok', 'opencode']`.
3. **Cursor and Antigravity are explicitly DEFERRED.** They remain valid build
   targets in the platform contracts / repository inventory, but they are **not**
   counted toward the terminal gate and must **never** be fabricated or
   back-filled with synthetic attestations to reach a green count.

### Routing

- Main controller: Opus (1M context) — orchestration, artifact comparison,
  dispatch, review supervision, reconciliation, integration and terminal-gate
  decisions only. The controller must not author production source or test code
  and must not review its own implementation.
- Workers and reviewers: the owner-approved Sonnet 4.6 route. Requested,
  resolved and observed model must be recorded in every receipt. If the
  environment cannot resolve the 4.6 route, the mismatch is recorded honestly in
  the receipt and the ledger rather than silently substituted or hidden. An
  upward substitution within the Sonnet family is acceptable only when recorded.

### Destination and cleanup

- Final destination is `main`.
- Cleanup of rescue branches and worktrees happens **only after** rescue,
  certification and green CI on the exact `main` HEAD — never before.
- Only `main` may remain locally and remotely at the end.

## Permanent execution behavior (productized, not prose)

Planning remains exhaustive and the original plan remains immutable. Execution is
optimized as a permanent, tested harness behavior — not merely a Markdown rule:

- Compile the detailed plan into an **Execution DAG**: dependency edges, critical
  path, owned paths, risk tier, model tier, token/time budget, acceptance
  criteria and verification contract per node.
- Group independent requirements into disjoint parallel waves. Do not implement
  sections sequentially merely because the plan is written sequentially.
- Continuously recalculate the critical path after each receipt, finding and
  repair.
- Never trade away full effective-plan scope, independent review, fresh evidence,
  reconciliation, terminal gates or truthful host attestation for speed.

Intent detection selects the execution mode and is recorded in the ledger with
trigger, source-artifact hash and confidence:

- full plan artifact pasted or referenced → artifact adoption / handoff;
- "native subagents" → `NATIVE_SUBAGENT` mode;
- "supervision / supervision sessions" → `SUPERVISED_SESSION` mode;
- "max tốc", "ship nhanh nhất", "ship trong 1–2 tiếng", "convergence sprint" →
  `CRITICAL_PATH_CONVERGENCE` mode;
- explicit owner instruction always overrides the classifier.

## Speed model

Planning is not shortened; execution is optimized. When the owner requests a
roughly two-hour target, converge as close as safely possible to it. Two hours is
a target, not a hard deadline, and is never a reason to cut scope, weaken review,
skip evidence, or declare a false PASS or SLA failure.

## Evidence integrity

- All stale, false-PASS or `fa85`-bound evidence is invalidated on activation of
  this amendment.
- No `COMPLETED` state is valid without fresh final reconciliation on the same
  HEAD that carries the certified artifact.
- CI must verify an ephemeral or adopted fixture ledger and plan bundle. It must
  not be weakened into committed-hash-only checks merely because `.agent` is
  gitignored.
