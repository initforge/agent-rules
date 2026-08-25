# Adaptive work protocol

This is the shared protocol for planning, execution, handoff, and review. It favors a complete, evidence-backed outcome over workflow theater.

## 1. Classify risk, then select plan level

| Level | Plan detail | Ledger | Delegation |
|---|---|---|---|
| Small | outcome, scope, acceptance, verification | optional | main-direct or none |
| Standard | requirements + decisions + change graph + verification matrix + constraints | optional when useful | delegated bounded slices |
| Resumable | standard + task graph + amendments + checkpoints + evidence ledger | required, detailed | independent disjoint slices only |

Start with the observable outcome and classify risk before selecting the plan level. A small plan uses only intent + acceptance. A standard plan adds traceable requirements (REQ-N), decisions (DEC-N), a change graph with fact/assumption/unknown/user_decision categories, and a verification matrix mapping requirements to acceptance criteria. A resumable plan adds slices with owners and dependencies, an amendment mechanism, session checkpoints, and an accumulated evidence ledger.

All three levels validate against `schemas/plan.schema.json`. See [`portable-plan-contract.md`](portable-plan-contract.md) for the full contract.

## 2. Meaningful questions and ownership

Ask only a meaningful question: one whose answer changes architecture, scope, compatibility, migration, behavior, proof level, or an irreversible decision. Read code, schemas, logs, tests, and documentation to discover facts instead. Record unresolved material questions in `unresolved_questions` with their impact category.

## 3. Roles and responsibilities

Every execution uses up to six distinct roles. A single agent may fill multiple roles for small work; the separation increases with risk and coordination need.

| Role | Responsibility | May implement? | Read-only? |
|---|---|---|---|
| **Coordinator** | Preserves user intent, manages requirement ledger, assigns slices, reports status | Narrow actions only (inspect, route, reconcile, merge, unblock) | no — may write coordination artifacts |
| **Architect/integrator** | Architecture decisions, shared contracts, state boundaries, cross-domain behavior, integration-critical implementation | Yes — integration-critical code | no |
| **Implementer** | Bounded slice with stable interfaces, explicit path ownership, clear ACs | Yes — its slice only | no |
| **Researcher/utility** | Read-only exploration, external research, inventory, mechanical changes | No | yes |
| **Reviewer** | Independent review of the final integrated diff, not worker summaries | No | yes |
| **Verifier** | Claim-specific proof checks; cannot convert unverified to PASS | No | yes |

### Delegation rule

Delegate when a slice has all five:
- a **stable boundary** (known interfaces and scope)
- **clear acceptance criteria** (provable claims)
- **non-overlapping write ownership** (exclusive paths)
- **sufficient context** (facts needed fit in a capsule)
- a **meaningful benefit** from parallelism or specialization

Do not delegate merely because the task has multiple files. Small tasks do not require ceremonial subagents; the coordinator or architect may implement directly.

### Context capsule

A sub-agent receives a context capsule, not the full transcript:

```text
source IDs and applicable later injections
goal and acceptance criteria
owned paths; read-only context paths; forbidden paths/actions
proof commands/artifacts and return receipt
```

Keep capsules compact: include only source IDs and facts needed for that slice; size assignments so one owner can implement and prove them without broad repository preload. No two writers own the same path.

### Lifecycle and receipts

Every ready assignment begins `pending`; its owner must acknowledge it before the slice starts, transitioning the assignment to `acknowledged`. `NEEDS_CONTEXT`, `CONFLICT`, and `BLOCKED` are recovery signals, not acknowledgment states: use them respectively for a bounded missing fact, ownership/interface overlap, or a decisive external dependency. Recover in order: supply the minimum missing context, reconcile ownership/interface boundaries, reassign a narrow slice, then use sequential execution only when native subagents are unavailable. Preserve acceptance, proof, checkpoints, and context boundaries; never silently fall back or weaken the outcome. Record this as orchestration `UNAVAILABLE`, not task `PARTIAL`; task outcome may still `PASS` when behavior is proven.

Delegation receipts are exactly two facts, owned by [`rules/10-execution-planning-delegation.md`](../../../rules/10-execution-planning-delegation.md):

| Fact | Meaning |
|---|---|
| `delegated` | what went out, to whom, and why |
| `outcome` | `consumed` \| `rejected` (with reason) \| `skipped` (with reason) |

The former seven-event receipt chain is retired. For a single operator it cost
more to emit than it ever paid back in traceability; skill documents do not
reintroduce it. Missing delegation facts are still detectable: every delegated
slice records both facts, and an absent `outcome` is a review finding.

### Risk-triggered review

Independent review is mandatory for security/auth, authorization, migration/data loss, public contracts, concurrency/distributed consistency, performance/cache/index freshness, resource lifetime, weakened proof, a material unknown, or two failed approaches. The reviewer must be independent of the implementation owner and use an expert route where the risk requires it.

### Semantic budgets

Capsules and receipts have semantic budgets, not word or token quotas. A capsule includes only the facts needed to implement and prove its slice; a receipt states changed scope, proof, unresolved risks, and the next recovery action. Do not pad them with transcript, inventory, or status theater.

## 4. Model and effort routing

Route by logical class and risk input, never by hardcoded provider model names. The canonical policy is `automation/model-policy.json`; projects use their installed host copy. See [`capability-tier-routing.md`](capability-tier-routing.md) for the full routing reference.

### Logical classes

| Class | Typical work |
|---|---|
| Utility | deterministic commands, search, inventory, stateless lookup |
| Economy | mechanical edits, narrow checks, retrieval, routine research |
| Standard | ordinary implementation, planning, integration review |
| Expert | architecture, shared contracts, security/migration/concurrency, repeated failure |

### Routing inputs

Evaluate: uncertainty, dependency breadth, shared contract changes, blast radius, reversibility, security/data risk, cross-layer state, architecture ambiguity, proof difficulty, repeated failure, and user model override. The coordinator records the class selection reason when it exceeds economy.

### Escalation

Escalate one class level per trigger, up to expert. Triggers include: uncertainty high, architecture ambiguity unresolved, shared contract changes affecting 3+ dependents, blast radius high, irreversible migration, security/data risk, cross-layer state change, proof difficulty high, repeated failure >= 2, user override. Cost savings cannot override capability. Missing class mapping is an error, never silent fallback.

### Requested/resolved/observed

Every route produces three states: requested (logical class + effort), resolved (provider + model family + effort from adapter), observed (runtime-attested provider/model/effort or UNVERIFIED). Missing host attestation is unknown, never inferred from request or resolution. No model is verified merely because its config file contains the intended ID.

### Fallback and denial

Fallback to the next available class when the requested class is unavailable; record fallback_reason. If no class is available, attestation_status is UNVERIFIED. A denied provider mode/model fails closed. An unavailable allowed choice may use only a policy-allowed fallback and remains `PARTIAL` until resolved and observed.

## 5. Pivot, Automatic execution, and proof

This is the Automatic execution contract; risk-triggered review remains mandatory when risk signals fire. Once the owner says execute, the main agent automatically classifies size/risk, chooses tools and agents, implements, reviews, fixes, and continues dependency-ready work. Do not require manual phase relay or default host Stop coercion.

Proof must match the claim. A build proves buildability, not UI parity, runtime behavior, authorization, migration safety, or distributed correctness. Inspect only evidence needed to establish the assigned acceptance claim, its negative invariant, scope boundary, and any review trigger; do not preload unrelated repository state or expose raw owner context. Use the least expensive evidence that actually proves the claim; use live UI/device interaction when that claim requires it.

## 6. Ledger and resume

Resumable work uses a detailed ledger with `amendments`, `checkpoints`, and `evidence_ledger`. It preserves original requirement IDs, later injections, their allocation to slices/agents, owner decisions, current proof, rollback notes, and next safe action. Standard work uses requirements + decisions + verification matrix without session recovery fields. Small work uses only outcome + acceptance.

When an amendment supersedes a prior decision, record it both in `decisions[].supersedes_id` and the `amendments` array. No code or agent may silently reverse a user decision (`category: user_decision` in `change_graph` or `intent.assumptions`).

The ledger is a continuity and evidence aid, not permission to declare success. A plan artifact remains intent; fresh runner-backed or observed evidence establishes completion. Keep task outcome separate from execution-control status: `PASS`, `PARTIAL`, or `BLOCKED` applies to delivery; acknowledgments, host observation, and orchestration availability remain distinct fields.
