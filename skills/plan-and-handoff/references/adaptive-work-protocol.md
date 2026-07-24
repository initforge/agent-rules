# Adaptive work protocol

This is the shared protocol for planning, execution, handoff, and review. It favors a complete, evidence-backed outcome over workflow theater.

## 1. Classify, then act

| Shape | Plan detail | Ledger | Delegation |
|---|---|---|---|
| Small/clear | outcome, scope, approach, proof | optional | main-direct or none |
| Medium | executable plan with files/interfaces, acceptance criteria, proof, rollback note | optional when useful | independent bounded slices |
| Large | roadmap, task graph, ownership, proof and rollback | required | independent disjoint slices only |
| Resumable | large plan plus checkpoints and resume context capsules | required, detailed | independent disjoint slices only |

Every plan is executable. It names the outcome, in/out scope, affected interfaces or files, implementation approach, acceptance/proof, and next safe action. Long work adds dependencies, ownership, rollback/handoff, and resume state; it does not add a mandatory phase ceremony.

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

The main agent may implement directly only for small, clear work. On medium/large work it owns intent, allocation, integration, and final review; direct implementation is limited to a bounded integration exception that unblocks or verifies delegated slices. Do not create a planned main implementation slice merely to retain work.

If callable native subagents are absent or unavailable, declare a host-capability exception and execute the planned slices sequentially in the main agent. Preserve acceptance, proof, checkpoints, and context/ownership boundaries; do not stop or weaken implementation solely because orchestration is unavailable. This is never a planned main slice or silent fallback. Record orchestration/model capability as `PARTIAL`/`UNVERIFIED`; the actual task may still `PASS` when its behavior is fully proven.

Use a risk-triggered independent expert reviewer or expert route only when warranted: security/auth, migration/data loss, public contract, concurrency/distributed consistency, performance/cache/index freshness, resource lifetime, weak proof, a material unknown, or two failed approaches.

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

Proof must match the claim. A build proves buildability, not UI parity, runtime behavior, authorization, migration safety, or distributed correctness. Use the least expensive evidence that actually proves the claim; use live UI/device interaction when that claim requires it.

## 5. Ledger and resume

Large/resumable work uses a detailed ledger. It preserves original requirement IDs, later injections, their allocation to slices/agents, owner decisions, current proof, rollback notes, and next safe action. Medium/small work may use it when interruption, coordination, proof, or rollback risk justifies it.

The ledger is a continuity and evidence aid, not permission to declare success. A plan artifact remains intent; fresh runner-backed or observed evidence establishes completion.
