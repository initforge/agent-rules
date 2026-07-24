# Adaptive work protocol

This is the shared protocol for planning, execution, handoff, and review. It favors a complete, evidence-backed outcome over workflow theater.

## 1. Classify risk, then act

| Shape | Plan detail | Ledger | Delegation |
|---|---|---|---|
| Small/clear | outcome, scope, approach, proof | optional | main-direct or none |
| Medium | executable plan with files/interfaces, acceptance criteria, proof, rollback note | optional when useful | independent bounded slices |
| Large | roadmap, task graph, ownership, proof and rollback | required | independent disjoint slices only |
| Resumable | large plan plus checkpoints and resume context capsules | required, detailed | independent disjoint slices only |

Start with the observable outcome and classify risk before operational shape. A plan names outcome, in/out scope, affected interfaces or files, implementation approach, acceptance/proof, and next safe action. Long work adds dependencies, ownership, rollback/handoff, and resume state; it does not add a mandatory phase ceremony.

## 2. Meaningful questions and ownership

Ask only a meaningful question: one whose answer changes scope, behavior, safety, authority, or proof. Read code, schemas, logs, tests, and documentation to discover facts instead.

The main agent holds the owner’s requirements, later instructions, cross-slice decisions, integration, final review, and terminal status. A sub-agent receives a context capsule, not the whole transcript:

```text
source IDs and applicable later injections
goal and acceptance criteria
owned paths; read-only context paths; forbidden paths/actions
proof commands/artifacts and return receipt
```

Keep capsules compact: include only source IDs and facts needed for that slice; size assignments so one owner can implement and prove them without broad repository preload. No two writers own the same path.

The main agent may implement directly only for small, clear work. On medium+ work, zero main-agent domain work is the default: it owns intent, allocation, integration, and final review. A narrow control-plane exception may only inspect, route, reconcile ownership, resolve a mechanical merge conflict, or run claim-matched proof needed to unblock or integrate delegated slices. It must not implement product behavior, domain rules, schema changes, or a planned main implementation slice.

Every ready assignment begins `pending`; its owner must acknowledge it before the slice starts, transitioning the assignment to `acknowledged`. `NEEDS_CONTEXT`, `CONFLICT`, and `BLOCKED` are recovery signals, not acknowledgment states: use them respectively for a bounded missing fact, ownership/interface overlap, or a decisive external dependency. Recover in order: supply the minimum missing context, reconcile ownership/interface boundaries, reassign a narrow slice, then use sequential execution only when native subagents are unavailable. Preserve acceptance, proof, checkpoints, and context boundaries; never silently fall back or weaken the outcome. Record this as orchestration `UNAVAILABLE`, not task `PARTIAL`; task outcome may still `PASS` when behavior is proven.

Risk-triggered independent review is mandatory for security/auth, authorization, migration/data loss, public contracts, concurrency/distributed consistency, performance/cache/index freshness, resource lifetime, weakened proof, a material unknown, or two failed approaches. The reviewer must be independent of the implementation owner and use an expert route where the risk requires it.

Capsules and receipts have semantic budgets, not word or token quotas. A capsule includes only the facts needed to implement and prove its slice; a receipt states changed scope, proof, unresolved risks, and the next recovery action. Do not pad them with transcript, inventory, or status theater.

## 3. Model and effort routing

| Route | Use |
|---|---|---|
| Economy | research, inventory, mechanical changes, narrow checks |
| Standard | ordinary implementation, normal plan/review |
| Expert | hard architecture or triggered independent review |

Resolve provider/model/effort through the installed host `model-policy.json`; inside `agent-rules`, `automation/model-policy.json` is canonical source and fallback. Capability class stays portable in plans and assignment packets. Record requested intent, host-resolved selection, and independently observed result separately. Missing host attestation is unknown, never inferred from request or resolution.

A denied provider mode/model fails closed. An unavailable allowed choice may use only a policy-allowed fallback and remains `PARTIAL` until resolved and observed.

Never exceed high effort. Escalate after material uncertainty, two failed approaches, or an expert-risk signal—not merely because the task has multiple files.

## 4. Pivot, automatic execution, and proof

Once the owner says execute, the main agent automatically classifies size/risk, chooses tools and agents, implements, reviews, fixes, and continues dependency-ready work. Do not require manual phase relay or default host Stop coercion.

Proof must match the claim. A build proves buildability, not UI parity, runtime behavior, authorization, migration safety, or distributed correctness. Inspect only evidence needed to establish the assigned acceptance claim, its negative invariant, scope boundary, and any review trigger; do not preload unrelated repository state or expose raw owner context. Use the least expensive evidence that actually proves the claim; use live UI/device interaction when that claim requires it.

## 5. Ledger and resume

Large/resumable work uses a detailed ledger. It preserves original requirement IDs, later injections, their allocation to slices/agents, owner decisions, current proof, rollback notes, and next safe action. Medium/small work may use it when interruption, coordination, proof, or rollback risk justifies it.

The ledger is a continuity and evidence aid, not permission to declare success. A plan artifact remains intent; fresh runner-backed or observed evidence establishes completion. Keep task outcome separate from execution-control status: `PASS`, `PARTIAL`, or `BLOCKED` applies to delivery; acknowledgments, host observation, and orchestration availability remain distinct fields.
