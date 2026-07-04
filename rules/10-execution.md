---
alwaysApply: true
description: Scope, execution, verification and reporting contract.
---

# Execution

1. Read the nearest entrypoint/index and inspect only context relevant to the request.
2. Lock explicit deliverables. For multi-module, ambiguous or high-risk work, use a reviewable plan and execute in slices.
3. Trace affected interfaces and downstream consumers before changing shared behavior; verify plan assumptions against real interfaces and scan known-unknowns (`implementation-discovery`).
4. When mode=`execution`, implement the complete in-scope outcome. When deliverable is plan/report, complete that artifact instead — implement only if user asked or confirmed.
5. Verify with the strongest available evidence appropriate to risk: lint/typecheck/build/tests, source trace, API/database/permission checks, generated artifact inspection or browser flow when the active platform allows it.
6. Re-run impacted checks after fixes. A compile pass alone does not prove UI, data or permission correctness; when browser proof is skipped by platform policy, compensate with targeted non-browser evidence and report any remaining gap honestly.
7. Final reports state scope completion, files/layers changed, verification evidence and status per `25-task-lifecycle.md` (Lane, Friction, advisory `.agent/trace.jsonl` for normal/high-risk). Never present unverified assumptions as facts.
8. When `Friction` names missing rules, repeated manual steps, or conflicting sources of truth, propose promotion via `context-evolution-protocol` — do not silently edit canonical context.
9. If an implementation/fix fails (builds, tests, or user feedback) >= 2 times, do not repeat the same approach or patch locally. Stop, verify target surface/component, propose >= 2 alternatives, and ask the user if the cause is ambiguous.

## When signals conflict (read in order)

1. User explicit deliverable + pivot phrases (HB-2)
2. Cursor Plan Mode context
3. Workflow mode (this file + 25-task-lifecycle)
4. Lane + file-count gate (HB-4)
5. Lazy skill triggers
6. finish-to-completion when mode=execution (HB-5)

## Pivot phrases (plan → execution)

implement, execute, làm đi, bắt đầu code, triển khai, sửa code, apply plan, phase N execute, ok làm, ship it.

## Workflow

0. Infer mode; optional one-liner.
1. advisory → answer; proactive expand.
2. plan-authoring / plan-review → plan-and-handoff; read-only discovery; deliver plan — **HB-1: no repo edits**.
3. execution → lane + discovery verify + finish-to-completion (HB-5).
4. Multi-phase: plan-and-handoff slice, then step 3 only after pivot (HB-2).
5. clean-code end of execution only; code-review user-invoked.

Use finish-to-completion for execution tasks when mode=execution. Not when plan modes (HB-1). Use `researcher` when current external behavior matters or investigation stalls. Use specialized capabilities only when their trigger matches.

