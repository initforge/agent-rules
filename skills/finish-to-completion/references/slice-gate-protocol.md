# Slice protocol

Use for a delegated or resumable slice. It is intentionally small; the shared adaptive protocol owns routing, ledger policy, and role definitions.

## Lifecycle

1. **Request:** coordinator evaluates the five delegation conditions and records the `delegated` fact (what went out, to whom, and why) or `outcome: skipped` with reason.
2. **Recover:** read the current context capsule, relevant ledger row, targeted repository interfaces, and current diff.
3. **Lock ownership:** confirm owned paths, explicit exclusions, acceptance criteria, and proof. Resolve overlap before editing. The subagent acknowledges the assignment before starting.
4. **Execute and prove:** implement the slice; run fresh claim-matched proof; record evidence and update the ledger when one is in use.
5. **Return receipt:** paths changed, decisions, proof run/results, risks/blockers, and next safe action.
6. **Integrate:** coordinator or architect/integrator consumes the result and records the `outcome` fact (`consumed`, or `rejected` with reason).

## Receipt fields

A minimal receipt returned by a subagent:

```text
slice_id:
  acceptance_results: { AC_id: PASS/FAIL/BLOCKED }
  paths_changed: [...]
  evidence_refs: [...]
  unresolved_risks: [...]
  next_safe_action: "..."
```

The coordinator records the two delegation facts from [`rules/25-task-lifecycle.md`](../../../rules/25-task-lifecycle.md): `delegated` and `outcome` (`consumed`/`rejected` with reason, or `skipped` with reason). The former seven-event receipt chain is retired; skill documents do not reintroduce it.

## Rules

- Do not stop the owner at a phase boundary. Continue dependency-ready work after the execute pivot.
- A blocker affects only the blocked work; complete independent work first.
- The reviewer inspects the final integrated diff, not worker summaries.
- Missing delegation facts are detectable: every delegated slice records both facts, and an absent `outcome` is a review finding.
