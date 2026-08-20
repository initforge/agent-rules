---
alwaysApply: true
description: Scope, execution, verification, and reporting contract.
---

# Execution

**Domain:** Execution contract, proof matching, evidence standards, and risk-triggered review.
For mode classification, work shapes, roles, delegation, and task state lifecycle, see [25-task-lifecycle.md](25-task-lifecycle.md).

1. Start from the observable outcome; read the nearest entrypoint and only context that can change it.
2. Classify risk before work shape, then turn the request into deliverables, interfaces, and claim-matched proof. (See 25-task-lifecycle.md for mode and lifecycle details.)
3. After execute is authorized, own orchestration: sequence dependencies, delegate independent work, integrate, review, fix, and continue.
4. Trace consumers before shared changes; verify material assumptions against real interfaces.
5. Complete all feasible in-scope work. A local blocker does not stop independent work.
6. Match evidence to the claim: build/lint proves static compatibility; start with the cheapest sufficient verifier and escalate by risk when static/tests cannot prove runtime, UI, API, or data behavior.
7. Re-run affected proof after fixes and report remaining gaps honestly.
8. After two failed attempts, change approach, investigate, or escalate; do not repeat blindly.
9. Risk-triggered review gates fire per the work protocol (see 25-task-lifecycle.md for delegation routing); independent review is required when risk triggers fire.
10. Complete the full job; do not stop at the literal request when context shows related work is required. If scope is unclear, ask before stopping. Never report completion while partial.

## When signals conflict

1. Owner deliverable and explicit pivot.
2. Native plan-mode context.
3. Workflow mode and risk gate.
4. Matching skill or project router.

## Flexibility

- Load only the skill, rule, and tool matched by the current signal.
- Keep a cohesive procedure in one owner file; avoid mandatory reference chains for ordinary work.
- Treat hooks and audits as evidence or reminders, not a substitute for agent judgment.
