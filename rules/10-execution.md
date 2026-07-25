---
alwaysApply: true
description: Scope, execution, verification, and reporting contract.
---

# Execution

**Domain:** Execution contract, proof matching, evidence standards, and risk-triggered review.
For mode classification, work shapes, roles, delegation, and task state lifecycle, see [25-task-lifecycle.md](25-task-lifecycle.md).

1. Start from the observable outcome; read the nearest entrypoint and only context that can change it.
2. Turn the request into deliverables, interfaces, and claim-matched proof. (Risk and work-shape classification: see 25-task-lifecycle.md.)
3. After execute is authorized, own orchestration: sequence dependencies, delegate independent work, integrate, review, fix, and continue.
4. Trace consumers before shared changes; verify material assumptions against real interfaces.
5. Complete all feasible in-scope work. A local blocker does not stop independent work.
6. Match evidence to the claim: build/lint proves static compatibility, tests prove exercised behavior, and live UI/API/data proof is required when claimed.
7. Re-run affected proof after fixes and report remaining gaps honestly.
8. After two failed attempts, change approach, investigate, or escalate; do not repeat blindly.
9. Risk-triggered review gates fire per the work protocol (see 25-task-lifecycle.md for delegation routing); independent review is required when risk triggers fire.

## When signals conflict

1. Owner deliverable and explicit pivot.
2. Native plan-mode context.
3. Workflow mode and risk gate.
4. Matching skill or project router.

## Flexibility

- Load only the skill, rule, and tool matched by the current signal.
- Keep a cohesive procedure in one owner file; avoid mandatory reference chains for ordinary work.
- Treat hooks and audits as evidence or reminders, not a substitute for agent judgment.
