---
alwaysApply: true
description: Scope, execution, verification, and reporting contract.
---

# Execution

**Domain:** Execution contract, ship-first classification, proof matching, evidence standards, and stop conditions.
For mode classification, work shapes, roles, review budgets, and task state lifecycle, see [25-task-lifecycle.md](25-task-lifecycle.md).

## 1. Ship-first classification

At task intake, immediately classify work into three distinct categories:

1. **Core user outcome** — the primary functional deliverable, bug fix, or runtime capability requested by the owner.
2. **Release-blocking claims** — core user journeys, security/safety invariants, data integrity, permission boundaries, explicit acceptance criteria, and invariant protection. Only release blockers stay in the critical execution path.
3. **Non-blocking follow-up debt** — static residue outside the changed dependency graph, historical archive/doc cleanup, design polish outside the target surface, or non-runtime debt. These items must never block shipping core outcomes.

## 2. Execution rules

1. **Start from the observable outcome**: read the nearest entrypoint and only context that can change it.
2. **Preserve owner intent**: prioritize delivering the best usable product safely. Never silently expand scope from "fix core runtime" into an unbounded repository-wide audit.
3. **Scope split**: when a task contains both a ship lane and a cleanup lane, execute and verify the ship lane first. The cleanup lane blocks shipping only if the owner explicitly designated it as a mandatory release gate. Non-runtime residue, historical archives, or tombstones must not delay core delivery.
4. **Trace consumers before shared changes**: verify material assumptions against real interfaces.
5. **Continue feasible work**: complete all feasible in-scope work. A local blocker does not stop independent work.
6. **Match evidence to the claim**: build/lint proves static compatibility; start with the cheapest sufficient verifier and escalate by risk when static/tests cannot prove runtime, UI, API, or data behavior.
7. **Ask only when material**: if ambiguity materially affects architecture, safety, or proof, ask; otherwise, apply sound engineering assumptions and proceed.
8. **Bounded repair**: after two failed attempts, change approach, investigate, or escalate; do not repeat blindly.
9. **Never fake PASS**: workers never author PASS; verdicts are derived from verifier evidence. Never weaken, skip, delete, or hard-disable verification to make a run green.

## 3. Stop condition

When all core acceptance criteria PASS, all required proof PASS, and zero release blockers remain, the task **must terminate**.

- Do not pursue repo-wide perfection, historical cleanup, docs/design parity, or absolute zero-residue if they are outside the agreed release scope.
- In the final report, clearly distinguish:
  - **Shipped result**: core functional outcome and proof receipts.
  - **Follow-up debt**: non-blocking cleanup items, static residue, or deferred polish logged for future iterations.

## When signals conflict

1. Owner deliverable and explicit pivot.
2. Native plan-mode context.
3. Workflow mode and risk gate.
4. Matching skill or project router.

## Flexibility

- Load only the skill, rule, and tool matched by the current signal.
- Keep a cohesive procedure in one owner file; avoid mandatory reference chains for ordinary work.
- Treat hooks and audits as evidence or reminders, not a substitute for agent judgment.
