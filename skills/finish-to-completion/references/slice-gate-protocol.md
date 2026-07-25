# Slice protocol

Use for a delegated or resumable slice. It is intentionally small; the shared adaptive protocol owns routing, ledger policy, and role definitions.

## Lifecycle

1. **Request:** coordinator evaluates the five delegation conditions and records `subagent_requested` or `delegation_skipped`.
2. **Resolve:** model and effort are resolved; record `subagent_resolved`.
3. **Recover:** read the current context capsule, relevant ledger row, targeted repository interfaces, and current diff.
4. **Lock ownership:** confirm owned paths, explicit exclusions, acceptance criteria, and proof. Resolve overlap before editing. The subagent records `subagent_started` on acknowledgment.
5. **Execute and prove:** implement the slice; run fresh claim-matched proof; record evidence and update the ledger when one is in use.
6. **Return receipt:** paths changed, decisions, proof run/results, risks/blockers, and next safe action. Record `subagent_completed`.
7. **Integrate:** coordinator or architect/integrator consumes the result. Record `result_consumed` or `result_rejected` with reason.

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

The coordinator records the delegation lifecycle separately: requested, resolved, started, completed, consumed/rejected, or skipped.

## Rules

- Do not stop the owner at a phase boundary. Continue dependency-ready work after the execute pivot.
- A blocker affects only the blocked work; complete independent work first.
- The reviewer inspects the final integrated diff, not worker summaries.
- Missing receipts are detectable: every slice must have a completed lifecycle or an explicit skip reason.
