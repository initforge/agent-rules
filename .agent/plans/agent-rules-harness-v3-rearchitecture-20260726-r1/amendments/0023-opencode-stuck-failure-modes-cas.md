# Amendment AM-0023: OpenCode Stuck-Task Failure Modes — CAS Conformance

**Status:** `OWNER_APPROVED_PENDING_ACTIVATION`

## 1. Purpose and Scope

This amendment addresses eight independent observed-condition failure modes (OC-STUCK-01 through OC-STUCK-08) in the OpenCode host adapter. These are required host-kit acceptance criteria, not optional notes or prompt-only guidance. The harness must own recovery outside the model turn.

## 2. Upstream Evidence

Source document: `.agent/research/opencode-stuck-failure-modes-20260803.md`
- SHA256: `5793c9683b659ae9c1bad2934bce146bfaf420a5945b1d5cae23129f8cc8ac4b`
- Lines: 120
- Capture date: 2026-08-03

### 2.1 OC-STUCK-01: Child Permission Inheritance

| Field | Value |
|-------|-------|
| ID | OC-STUCK-01 |
| Upstream failure | Child permissions may not inherit the primary agent's rules; an implicit `ask` can wait forever without a human. Headless `serve`/`attach` has also been reported to hide `ask` prompts. |
| Required harness cover | Compile and attest permissions per generated role. Autonomous roles may have no unresolved `ask` or interactive `question`: safe actions are explicitly allowed; owner-only actions are denied and surfaced as durable `WAITING_AUTHORITY`, never a hidden wait. |
| Mandatory regression proof | Spawn every role under non-interactive execution and inject each permission class; fail if any prompt is invisible or unbounded. |

**Primary sources:**
- OpenCode agents and permissions: https://opencode.ai/docs/agents/
- Hidden child permission wait: https://github.com/anomalyco/opencode/issues/12566
- Headless permission wait: https://github.com/anomalyco/opencode/issues/16367

### 2.2 OC-STUCK-02: Unbounded Recursive Subagents

| Field | Value |
|-------|-------|
| ID | OC-STUCK-02 |
| Upstream failure | A global explicit `permission.task: allow` can override OpenCode's child nesting guard and permit unbounded recursive subagents. Per-session `steps` and `doom_loop` do not bound cross-session recursion. |
| Required harness cover | Enforce depth and child/session budgets in the harness independently of host config. Only the coordinator may dispatch; every generated child role denies `task`. |
| Mandatory regression proof | Attempt child-to-child dispatch with permissive global config and prove rejection at depth 1 plus no leaked session. |

**Primary sources:**
- Recursive Task permission: https://github.com/anomalyco/opencode/issues/17721

### 2.3 OC-STUCK-03: Phantom Running Children

| Field | Value |
|-------|-------|
| ID | OC-STUCK-03 |
| Upstream failure | Under high concurrency a child can crash or be cancelled while the parent still shows it as running and waits forever. |
| Required harness cover | An out-of-band watchdog reconciles actual child terminal state, event cursor and semantic cursor; parent spinner/status is never authoritative. |
| Mandatory regression proof | Kill and cancel selected children in a 10-child run; prove bounded detection, exact reassign, pool refill and sibling progress. |

**Primary sources:**
- Phantom-running children under concurrency: https://github.com/anomalyco/opencode/issues/18378

### 2.4 OC-STUCK-04: Lost Child Handle

| Field | Value |
|-------|-------|
| ID | OC-STUCK-04 |
| Upstream failure | On failure/cancel, the Task tool has been reported to omit `task_id`, leaving the parent unable to inspect or resume a persisted child session. |
| Required harness cover | Allocate and journal the parent/child identity, task, worktree, lease and process group before awaiting execution. Preserve a terminal tombstone and support idempotent inspect/reattach/cancel even when the host result omits the ID. |
| Mandatory regression proof | Abort before the first child response and prove the ledger still resolves the child and preserves its partial checkpoint. |

**Primary sources:**
- Lost failed/cancelled child handle: https://github.com/anomalyco/opencode/issues/13910

### 2.5 OC-STUCK-05: Session Event Mismatch

| Field | Value |
|-------|-------|
| ID | OC-STUCK-05 |
| Upstream failure | REST/SDK execution has reported parent and child sessions remaining busy after subagent events hit a directory/session mismatch or `NotFoundError`. |
| Required harness cover | Bind every event to run, project directory, parent and child identifiers; validate scope; reconcile from persisted session state when the event stream gaps or disagrees. |
| Mandatory regression proof | Inject an out-of-order event, missing message and wrong-directory event; prove quarantine/reconciliation and a terminal parent result. |

**Primary sources:**
- REST/SDK child-event busy loop: https://github.com/anomalyco/opencode/issues/6573

### 2.6 OC-STUCK-06: Provider Stream Stall

| Field | Value |
|-------|-------|
| ID | OC-STUCK-06 |
| Upstream failure | Subagents can stop after tool calls or a provider stream can fail to produce a final response, with no automatic timeout/retry. |
| Required harness cover | Separate provider/request deadline, tool deadline, semantic soft stall and hard stall. Soft stall diagnoses once; hard stall checkpoints and exact-cancels/reassigns with a bounded retry budget and changed strategy after repeated equivalent failure. |
| Mandatory regression proof | Inject never-final provider output and tool-call-without-terminal-output; prove bounded recovery without cancelling siblings. |

**Primary sources:**
- Subagent stalls after tool calls: https://github.com/anomalyco/opencode/issues/13841
- Provider/subagent hang without recovery: https://github.com/anomalyco/opencode/issues/11865

### 2.7 OC-STUCK-07: MCP Monopolization

| Field | Value |
|-------|-------|
| ID | OC-STUCK-07 |
| Upstream failure | Official OpenCode MCP documentation lists finite startup/catalog timeouts but a 12-hour default execution timeout. Authentication, catalog or execution can therefore monopolize a worker long after useful progress stops. |
| Required harness cover | Adapter-owned MCP policy sets capability-specific startup/catalog/execution/no-progress deadlines, lazy activation, ownership, circuit breaking and clean disconnect. A tool heartbeat never advances semantic progress. |
| Mandatory regression proof | Inject MCP startup failure, auth-needed, hung catalog and hung execution; prove bounded terminal state, released lease and no duplicate MCP stack. |

**Primary sources:**
- OpenCode MCP timeouts: https://opencode.ai/v2/docs/mcp-servers

### 2.8 OC-STUCK-08: Windows Process Lifecycle

| Field | Value |
|-------|-------|
| ID | OC-STUCK-08 |
| Upstream failure | Windows issues have included `.cmd` shim resolution failures, startup hangs and processes that keep running after interrupt/exit. |
| Required harness cover | The Windows adapter resolves the actual executable/shim policy during preflight, applies startup deadlines, owns a process group/job, journals PID/port ancestry, and reaps exact descendants on completion, cancel or crash. |
| Mandatory regression proof | Exercise shim resolution, startup hang, Ctrl-C/Cancel, parent crash and occupied port; prove no owned descendant or listener remains. |

**Primary sources:**
- Windows startup/shim hang: https://github.com/anomalyco/opencode/issues/11657
- Windows shim resolution fix context: https://github.com/anomalyco/opencode/issues/17295
- Windows interrupt/exit process lifecycle: https://github.com/anomalyco/opencode/issues/5476

## 3. Local Dogfood Evidence

- The installed OpenCode supervisor is still limited to four concurrent children and relies on a ten-minute provider request timeout rather than an executing semantic-progress watchdog.
- `packages/engine/src/watchdog.ts` and `runExecutionRuntime` express the desired mechanism, but repository search found only test callers for that runtime.
- `platforms/opencode/supervisor-runner.ts` can abort, but its terminal-evidence wait returns a timeout result without composing checkpoint, exact cancellation and reassignment.
- `packages/cli/src/services/runner.ts` currently accepts only `local-worker`, so native supervisor enforcement is not the installed production path.
- Mini TOEIC dogfood invoked Vitest for Jest tests, briefly creating many pool children, and left an API process whose parent had exited.

## 4. Implementation Requirements

1. Compile model-neutral role Markdown, tool permissions and child-dispatch policy from one canonical role/capability registry.
2. Persist run/parent/child/task/worktree/lease/process-group identity before dispatch, and expose terminal tombstones plus idempotent recovery operations.
3. Run the semantic watchdog and session-state reconciler outside the blocked model turn. Distinguish `RUNNING`, `WAITING_RESOURCE`, `WAITING_AUTHORITY`, `SOFT_STALL`, `HARD_STALL`, `CANCELLED`, `FAILED` and `RECOVERED`.
4. Enforce coordinator-only dispatch, depth 1, total child/session budget and adaptive 6/8/10 concurrency independent of OpenCode's prompt or permission behavior.
5. Detect the declared test runner before issuing proof commands. Govern each spawned process tree, port and tool lease with exact cleanup on all exits.
6. Add doctor output for loaded config hash, role permissions, child handles, semantic/event cursors, deadlines, queue age, retries, PIDs/ports, test leases, MCP/browser/Compose ownership and orphan candidates.
7. Make the eight fault-injection rows above a required installed fresh-process conformance suite. File presence, prompt text and self-reported PASS do not satisfy the requirement.

## 5. Additive Scope

This amendment supplements the existing plan with eight new OC-STUCK-* acceptance criteria. It does not replace existing scheduler, watchdog, worktree or review behavior.

## 6. Activation Prerequisites

- `packages/engine/src/ledger-activation.ts` operational
- Bounded repair path verified
- CAS pointer path verified
- Research document hash verified against `5793c9683b659ae9c1bad2934bce146bfaf420a5945b1d5cae23129f8cc8ac4b`

## 7. Amendment Metadata

| Field | Value |
|-------|-------|
| Amendment ID | AM-0023 |
| Supplements Plan ID | agent-rules-harness-v3-rearchitecture-20260726-r1 |
| Source Document | .agent/research/opencode-stuck-failure-modes-20260803.md |
| Source SHA256 | 5793c9683b659ae9c1bad2934bce146bfaf420a5945b1d5cae23129f8cc8ac4b |
| Source Lines | 120 |
| OC-STUCK Count | 8 |
| OC-STUCK-01 | Child permission inheritance |
| OC-STUCK-02 | Unbounded recursive subagents |
| OC-STUCK-03 | Phantom running children |
| OC-STUCK-04 | Lost child handle |
| OC-STUCK-05 | Session event mismatch |
| OC-STUCK-06 | Provider stream stall |
| OC-STUCK-07 | MCP monopolization |
| OC-STUCK-08 | Windows process lifecycle |
