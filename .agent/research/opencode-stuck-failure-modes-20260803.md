# OpenCode stuck-task failure modes

Date: 2026-08-03

## Summary

OpenCode can appear stuck for several independent reasons. A spinner, log output,
or a live process is not proof of semantic progress. The harness must therefore
own recovery outside the model turn: persist child identity before waiting,
reconcile parent/child/transport state, compile non-interactive permissions,
bound tool and no-progress waits, cancel only owned process groups, and continue
unrelated READY work.

Prompt text and OpenCode's `doom_loop` permission are useful signals, but they do
not cover cross-session recursion, a crashed child reported as running, a lost
task handle, an unforwarded permission request, or an orphan native process.

## Evidence

### Upstream cases

| ID | Upstream failure | Required harness cover | Mandatory regression proof |
| --- | --- | --- | --- |
| OC-STUCK-01 | Child permissions may not inherit the primary agent's rules; an implicit `ask` can wait forever without a human. Headless `serve`/`attach` has also been reported to hide `ask` prompts. | Compile and attest permissions per generated role. Autonomous roles may have no unresolved `ask` or interactive `question`: safe actions are explicitly allowed; owner-only actions are denied and surfaced as durable `WAITING_AUTHORITY`, never a hidden wait. | Spawn every role under non-interactive execution and inject each permission class; fail if any prompt is invisible or unbounded. |
| OC-STUCK-02 | A global explicit `permission.task: allow` can override OpenCode's child nesting guard and permit unbounded recursive subagents. Per-session `steps` and `doom_loop` do not bound cross-session recursion. | Enforce depth and child/session budgets in the harness independently of host config. Only the coordinator may dispatch; every generated child role denies `task`. | Attempt child-to-child dispatch with permissive global config and prove rejection at depth 1 plus no leaked session. |
| OC-STUCK-03 | Under high concurrency a child can crash or be cancelled while the parent still shows it as running and waits forever. | An out-of-band watchdog reconciles actual child terminal state, event cursor and semantic cursor; parent spinner/status is never authoritative. | Kill and cancel selected children in a 10-child run; prove bounded detection, exact reassign, pool refill and sibling progress. |
| OC-STUCK-04 | On failure/cancel, the Task tool has been reported to omit `task_id`, leaving the parent unable to inspect or resume a persisted child session. | Allocate and journal the parent/child identity, task, worktree, lease and process group before awaiting execution. Preserve a terminal tombstone and support idempotent inspect/reattach/cancel even when the host result omits the ID. | Abort before the first child response and prove the ledger still resolves the child and preserves its partial checkpoint. |
| OC-STUCK-05 | REST/SDK execution has reported parent and child sessions remaining busy after subagent events hit a directory/session mismatch or `NotFoundError`. | Bind every event to run, project directory, parent and child identifiers; validate scope; reconcile from persisted session state when the event stream gaps or disagrees. | Inject an out-of-order event, missing message and wrong-directory event; prove quarantine/reconciliation and a terminal parent result. |
| OC-STUCK-06 | Subagents can stop after tool calls or a provider stream can fail to produce a final response, with no automatic timeout/retry. | Separate provider/request deadline, tool deadline, semantic soft stall and hard stall. Soft stall diagnoses once; hard stall checkpoints and exact-cancels/reassigns with a bounded retry budget and changed strategy after repeated equivalent failure. | Inject never-final provider output and tool-call-without-terminal-output; prove bounded recovery without cancelling siblings. |
| OC-STUCK-07 | Official OpenCode MCP documentation lists finite startup/catalog timeouts but a 12-hour default execution timeout. Authentication, catalog or execution can therefore monopolize a worker long after useful progress stops. | Adapter-owned MCP policy sets capability-specific startup/catalog/execution/no-progress deadlines, lazy activation, ownership, circuit breaking and clean disconnect. A tool heartbeat never advances semantic progress. | Inject MCP startup failure, auth-needed, hung catalog and hung execution; prove bounded terminal state, released lease and no duplicate MCP stack. |
| OC-STUCK-08 | Windows issues have included `.cmd` shim resolution failures, startup hangs and processes that keep running after interrupt/exit. | The Windows adapter resolves the actual executable/shim policy during preflight, applies startup deadlines, owns a process group/job, journals PID/port ancestry, and reaps exact descendants on completion, cancel or crash. | Exercise shim resolution, startup hang, Ctrl-C/cancel, parent crash and occupied port; prove no owned descendant or listener remains. |

Primary sources:

- OpenCode agents and permissions: https://opencode.ai/docs/agents/
- OpenCode MCP timeouts: https://opencode.ai/v2/docs/mcp-servers
- Hidden child permission wait: https://github.com/anomalyco/opencode/issues/12566
- Headless permission wait: https://github.com/anomalyco/opencode/issues/16367
- Recursive Task permission: https://github.com/anomalyco/opencode/issues/17721
- Phantom-running children under concurrency: https://github.com/anomalyco/opencode/issues/18378
- Lost failed/cancelled child handle: https://github.com/anomalyco/opencode/issues/13910
- REST/SDK child-event busy loop: https://github.com/anomalyco/opencode/issues/6573
- Subagent stalls after tool calls: https://github.com/anomalyco/opencode/issues/13841
- Provider/subagent hang without recovery: https://github.com/anomalyco/opencode/issues/11865
- Windows startup/shim hang: https://github.com/anomalyco/opencode/issues/11657
- Windows shim resolution fix context: https://github.com/anomalyco/opencode/issues/17295
- Windows interrupt/exit process lifecycle: https://github.com/anomalyco/opencode/issues/5476

### Local dogfood evidence

- The installed OpenCode supervisor is still limited to four concurrent children
  and relies on a ten-minute provider request timeout rather than an executing
  semantic-progress watchdog.
- `packages/engine/src/watchdog.ts` and `runExecutionRuntime` express the desired
  mechanism, but repository search found only test callers for that runtime.
- `platforms/opencode/supervisor-runner.ts` can abort, but its terminal-evidence
  wait returns a timeout result without composing checkpoint, exact cancellation
  and reassignment; repository search found only test construction.
- `packages/cli/src/services/runner.ts` currently accepts only `local-worker`, so
  native supervisor enforcement is not the installed production path.
- Mini TOEIC dogfood invoked Vitest for Jest tests, briefly creating many pool
  children, and left an API process whose parent had exited. This demonstrates
  that runner detection and process ownership must be enforced before execution.
- Owner steer messages can remain queued behind a busy main turn. Queue age and
  an out-of-band bounded interrupt/delivery path are required.

## Recommendation

Add this failure catalog through the canonical additive amendment/CAS lifecycle,
then implement it in the portable host-kit and generate platform-native config:

1. Compile model-neutral role Markdown, tool permissions and child-dispatch
   policy from one canonical role/capability registry. Provider/model mapping
   remains adapter-owned.
2. Persist run/parent/child/task/worktree/lease/process-group identity before
   dispatch, and expose terminal tombstones plus idempotent recovery operations.
3. Run the semantic watchdog and session-state reconciler outside the blocked
   model turn. Distinguish `RUNNING`, `WAITING_RESOURCE`, `WAITING_AUTHORITY`,
   `SOFT_STALL`, `HARD_STALL`, `CANCELLED`, `FAILED` and `RECOVERED`.
4. Enforce coordinator-only dispatch, depth 1, total child/session budget and
   adaptive 6/8/10 concurrency independent of OpenCode's prompt or permission
   behavior.
5. Detect the declared test runner before issuing proof commands. Govern each
   spawned process tree, port and tool lease with exact cleanup on all exits.
6. Add doctor output for loaded config hash, role permissions, child handles,
   semantic/event cursors, deadlines, queue age, retries, PIDs/ports, test leases,
   MCP/browser/Compose ownership and orphan candidates.
7. Make the eight fault-injection rows above a required installed fresh-process
   conformance suite. File presence, prompt text and self-reported PASS do not
   satisfy the requirement.

## Risks

- GitHub issue reports describe particular OpenCode versions and transports;
  fixes may land upstream. Harness conformance must test observed behavior rather
  than permanently keying logic to an issue number.
- A single wall-clock timeout can kill legitimate builds or interactive tools.
  Use capability-specific hard deadlines plus semantic-progress leases.
- Globally allowing every permission avoids some waits but expands authority and
  can enable recursive dispatch. Generate least-authority permissions per role.
- Killing by process name or broad port scan can destroy unrelated user work.
  Recovery must require proven run ownership and exact ancestry.

## Unknowns

- Which of the closed upstream issues are fixed in the exact installed OpenCode
  binary and which transports still differ between TUI, SDK, ACP and serve mode.
- Whether every installed provider exposes a reliable terminal/cancel event; the
  adapter must support polling reconciliation and process-level fallback.
- The safe capability-specific deadlines for unusually large project builds;
  these require measured policy rather than one universal number.

## Hand to Plan Architect

- Treat OC-STUCK-01 through OC-STUCK-08 as additive acceptance requirements, not
  a replacement for existing scheduler, watchdog, worktree or review behavior.
- Allocate canonical requirement IDs and activate them only through the normal
  immutable amendment, validation and compare-and-swap pointer path.
- Keep the launch prompt short by referencing the activated contract and this
  evidence note; keep detailed issue evidence out of the main-agent context.
