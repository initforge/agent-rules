---
name: plan-and-handoff
description: Use for multi-part work, plan mode, handoffs, resumable work, or a request that needs an executable plan before implementation. Do not use for a single clear fix, pure Q&A, or researcher-only work.
routing: {"signals":["plan","plan dài","nhiều phase","handoff","chia nhỏ","/goal","PAF","plan artifact","Plan Architect","Plan Scribe"],"excludes":["single small fix","pure q&a"],"priority":80,"loads":["skill:plan-and-handoff","adaptive-work-protocol"],"supports":["implementation-discovery"],"project_scope":"","platform_scope":"all","max_route_tokens":2200,"default":false}
---

# Plan and Handoff

Plan is an executable intent contract, not a ceremony. Its detail scales with the work; every version still identifies the outcome, scope, interfaces/files, proof, and a safe next action.

Read [`references/adaptive-work-protocol.md`](references/adaptive-work-protocol.md) first. It owns classification, questions, model routing, task packets, ledger use, and terminal behavior.

## Decision tree

1. Research only → `researcher`.
2. **Path D — Plan Reviewer:** pasted plan or request to assess a plan → report concrete gaps, do not execute.
3. Locked requirements needing a readable artifact → scribe the smallest executable plan.
4. Multi-part or uncertain implementation → inspect the affected repository interfaces, then produce a scaled plan using [`references/plan-artifact-template.md`](references/plan-artifact-template.md).
5. Owner says execute (or another explicit pivot) → automatically classify and begin execution through `finish-to-completion`. Do not ask the owner to relay phases.

## Plan quality

- Ask only a question that changes scope, behavior, safety, authority, or proof. Discover repository facts directly.
- Main agent owns owner intent, integration, final review, and terminal status. Delegate only bounded, disjoint slices with a context capsule.
- Use a risk-triggered independent reviewer: architecture/concurrency, security/auth, data migration, public contract, or weak proof. Tiny changes do not need one.
- A long/resumable plan requires a detailed ledger with source requirement and later-injection allocation. A medium/small task may use one only when coordination, proof, rollback, or interruption risk makes it useful.
- Its **Source coverage** is a readable requirement/injection-to-slice mapping, not an admission hash ritual.
- A phase is a dependency or ownership boundary, never a mandatory user relay or stop point. Continue dependency-ready work after the pivot; pause only for a genuine blocker or a requested checkpoint.

## References

- [`adaptive-work-protocol.md`](references/adaptive-work-protocol.md) — shared operating contract.
- [`plan-artifact-template.md`](references/plan-artifact-template.md) — scaled plan and context-capsule format.
- [`capability-tier-routing.md`](references/capability-tier-routing.md) — economy/standard/expert routing.
- [`../finish-to-completion/references/slice-gate-protocol.md`](../finish-to-completion/references/slice-gate-protocol.md) — compact delegated/resume slice receipt.
- [`owner-prompts.md`](references/owner-prompts.md) — optional concise prompts.

Use the current session’s plan/context capsule for resume; do not reload unrelated history.
