---
name: finish-to-completion
description: Use after an explicit execute pivot for a clear task or executable plan. Complete feasible in-scope work, verify
  claims with fresh evidence, and continue independent work around genuine blockers. Do not use for plan-only, pure Q&A, or
  an unbounded multi-part request that first needs plan-and-handoff.
metadata:
  signals: "làm đi, implement, fix, refactor, migrate, hoàn thành, execute"
  excludes: "plan-only, pure q&a"
  priority: "10"
  platform_scope: "all"
  source: ROUTE.json migrated

---

# Finish To Completion

An explicit pivot to execute authorizes automatic delivery. The main agent classifies risk before shape, selects tools/agents/proof, integrates, reviews, fixes, and reports without making the owner manually relay phases.

Read [`../plan-and-handoff/references/adaptive-work-protocol.md`](../plan-and-handoff/references/adaptive-work-protocol.md). For a long/resumable slice, also read [`references/completion-ledger.md`](references/completion-ledger.md).
For a delegated or resumed slice, use [`references/slice-gate-protocol.md`](references/slice-gate-protocol.md).

## Execute

1. Recover the executable plan or create the smallest one from the locked request. Verify assumptions against real interfaces before shared or risky changes.
2. Keep ownership disjoint. Delegate based on the five conditions: stable boundary, clear ACs, non-overlapping write ownership, sufficient context, and meaningful parallelism or specialization benefit. The coordinator may implement directly when delegation adds no value. The architect/integrator owns the shared contracts, state boundaries, and integration-critical implementation. Require each owner acknowledgment and follow its recovery ladder. If callable native subagents are unavailable, declare orchestration `UNAVAILABLE` and execute planned slices sequentially with the same context boundaries, checkpoints, acceptance, and proof.
3. Implement all feasible scoped deliverables. A local blocker does not stop independent work.
4. Match proof to the claim: build/lint for build claims; tests/API/data checks for behavior; live interaction/device evidence for UI/runtime claims when applicable. Re-run affected proof after fixes.
5. Review the integrated diff at a depth proportional to risk; mandatory independent review triggers are defined by the adaptive protocol. Inspect only evidence needed for the acceptance claim, negative invariant, scope boundary, and triggered review. Do not report PASS from prose, a ledger tick, or a build alone.

## Completion and blockers

- Continue automatically across dependency-ready slices after the pivot. Do not use default Stop coercion or require owner phase relay.
- `PASS`: all feasible deliverables are complete and evidence supports every material claim.
- `PARTIAL`: useful, verified progress remains but a non-authority constraint prevents the complete outcome.
- `BLOCKED`: a decision, credential, permission, destructive authority, or external state is genuinely required. State the one decisive blocker; preserve any independently completed work.
- Keep task outcome (`PASS`/`PARTIAL`/`BLOCKED`) separate from assignment acknowledgment (`pending`/`acknowledged`), orchestration, and host/model observation (`OBSERVED`, `UNVERIFIED`, `UNAVAILABLE`); fully proven task behavior may still `PASS`.

## Guardrails

- Never widen scope silently or replace proof with a suggested command.
- Never plan or silently use the sequential recovery fallback; activate it only when host subagent capability is absent or unavailable.
- Ask only meaningful questions; otherwise inspect and proceed.
- Preserve requested, resolved, and observed evidence separately; unresolved host evidence stays unknown, never implied PASS.
- Long/resumable work requires the detailed ledger. For medium/small work, use it only when it materially improves continuity or proof.
- For plan-only or unbounded multi-part work, return to `plan-and-handoff` rather than fabricating a partial implementation.
