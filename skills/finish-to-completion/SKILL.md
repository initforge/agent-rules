---
name: finish-to-completion
description: Use after an explicit execute pivot for a clear task or executable plan. Complete feasible in-scope work, verify claims with fresh evidence, and continue independent work around genuine blockers. Do not use for plan-only, pure Q&A, or an unbounded multi-part request that first needs plan-and-handoff.
routing: {"signals":["làm đi","implement","fix","refactor","migrate","hoàn thành","execute"],"intent_signals":["execution"],"excludes":["plan-only","pure q&a"],"priority":10,"loads":["skill:finish-to-completion","adaptive-work-protocol"],"supports":["implementation-discovery","clean-code"],"project_scope":"","platform_scope":"all","max_route_tokens":1500,"default":false}
---

# Finish To Completion

An explicit pivot to execute authorizes automatic delivery. The main agent classifies work, selects tools/agents/proof, implements, reviews, fixes, and reports without making the owner manually relay phases.

Read [`../plan-and-handoff/references/adaptive-work-protocol.md`](../plan-and-handoff/references/adaptive-work-protocol.md). For a long/resumable slice, also read [`references/completion-ledger.md`](references/completion-ledger.md).
For a delegated or resumed slice, use [`references/slice-gate-protocol.md`](references/slice-gate-protocol.md).

## Execute

1. Recover the executable plan or create the smallest one from the locked request. Verify assumptions against real interfaces before shared or risky changes.
2. Keep ownership disjoint. The main agent retains intent, integration, and final review; each delegated packet contains only relevant source IDs, later injections, paths, acceptance criteria, proof, and forbidden scope.
3. Implement all feasible scoped deliverables. A local blocker does not stop independent work.
4. Match proof to the claim: build/lint for build claims; tests/API/data checks for behavior; live interaction/device evidence for UI/runtime claims when applicable. Re-run affected proof after fixes.
5. Review the integrated diff at a depth proportional to risk. Do not report PASS from prose, a ledger tick, or a build alone.

## Completion and blockers

- Continue automatically across dependency-ready slices after the pivot. Do not use default Stop coercion or require owner phase relay.
- `PASS`: all feasible deliverables are complete and evidence supports every material claim.
- `PARTIAL`: useful, verified progress remains but a non-authority constraint prevents the complete outcome.
- `BLOCKED`: a decision, credential, permission, destructive authority, or external state is genuinely required. State the one decisive blocker; preserve any independently completed work.

## Guardrails

- Never widen scope silently or replace proof with a suggested command.
- Ask only meaningful questions; otherwise inspect and proceed.
- Long/resumable work requires the detailed ledger. For medium/small work, use it only when it materially improves continuity or proof.
- For plan-only or unbounded multi-part work, return to `plan-and-handoff` rather than fabricating a partial implementation.
