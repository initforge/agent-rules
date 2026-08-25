---
name: plan-and-handoff
description: Use for multi-part work, plan mode, handoffs, resumable work, or a request that needs an executable plan before
  implementation. Do not use for a single clear fix, pure Q&A, or researcher-only work.
metadata:
  signals: "plan dài, nhiều phase, handoff, chia nhỏ, /goal, PAF, plan artifact, Plan Architect, Plan Scribe, resumable work, executable plan"
  excludes: "single small fix, pure q&a, sweep the front porch, water the garden vegetables"
  priority: "70"
  platform_scope: "all"
  source: ROUTE.json migrated

---

# Plan and Handoff

Plan is an executable intent contract, not a ceremony. Use the portable plan contract at three levels: small (outcome + AC), standard (+ requirements, decisions, change graph, verification), or resumable (+ slices, amendments, checkpoints, evidence ledger).

PAF (plan artifact) and Scribe are compatibility terms for the same executable plan handoff.

Scale detail to the work; every plan identifies outcome, scope, acceptance, and execution guardrails. Plans validate against `schemas/plan.schema.json`.

Read [`references/adaptive-work-protocol.md`](references/adaptive-work-protocol.md) first. It owns classification, questions, model routing, task packets, ledger use, and terminal behavior.

## Decision tree

1. Research only → `researcher`.
2. **Path D — Plan Reviewer:** pasted plan or request to assess a plan → report concrete gaps, do not execute.
3. Locked requirements needing a readable artifact → scribe the smallest executable plan using [`references/portable-plan-contract.md`](references/portable-plan-contract.md).
4. Multi-part or uncertain implementation → inspect the affected repository interfaces, then produce a scaled plan using [`references/portable-plan-contract.md`](references/portable-plan-contract.md) at standard or resumable level.
5. Owner says execute (or another explicit pivot) → automatically classify and begin execution through `finish-to-completion`. Do not ask the owner to relay phases.

## Plan quality

- Ask only a question that changes scope, behavior, safety, authority, or proof. Discover repository facts directly. Record meaningful unresolved questions in `unresolved_questions`.
- Main agent owns owner intent, integration, final review, and terminal status. Delegate only bounded, disjoint slices with a context capsule.
- Use a risk-triggered independent reviewer: architecture/concurrency, security/auth, data migration, public contract, or weak proof. Tiny changes do not need one.
- A resumable plan requires `amendments`, `checkpoints`, and `evidence_ledger` in addition to requirements, decisions, and task graph. A standard plan uses requirements + decisions + change graph + verification matrix without slices. A small plan uses only outcome + acceptance.
- **Source coverage** is a readable requirement-to-AC mapping via `verification_matrix` and `acceptance[].requirement_ids`, not an admission hash ritual.
- User decisions (category `user_decision`) must never be silently overwritten. When an amendment supersedes a prior decision, record it in `decisions[].supersedes_id` and the `amendments` array.
- A phase is a dependency or ownership boundary, never a mandatory user relay or stop point. Continue dependency-ready work after the pivot; pause only for a genuine blocker or a requested checkpoint.

## References

- [`adaptive-work-protocol.md`](references/adaptive-work-protocol.md) — shared operating contract.
- [`portable-plan-contract.md`](references/portable-plan-contract.md) — three-level plan contract with examples.
- [`plan-artifact-template.md`](references/plan-artifact-template.md) — legacy template (compatibility reference only).
- [`capability-tier-routing.md`](references/capability-tier-routing.md) — economy/standard/expert routing.
- [`../finish-to-completion/references/slice-gate-protocol.md`](../finish-to-completion/references/slice-gate-protocol.md) — compact delegated/resume slice receipt.
- [`owner-prompts.md`](references/owner-prompts.md) — optional concise prompts.

Use the current session's plan/context capsule for resume; do not reload unrelated history.
