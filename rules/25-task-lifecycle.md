---
alwaysApply: true
description: Intake lane, risk gate, self-report trace, and advisory durable log.
---

# Task lifecycle

## Intake and lane

Classify non-trivial work into `tiny`, `normal`, or `high-risk`.

Risk flags (each that applies): auth; authorization; data model/migration; audit/security; external provider; public contract; cross-platform; existing tested behavior; weak proof; multi-domain.

Hard gate → `high-risk`: auth; authorization; data loss/migration; audit/security; external provider; weakening validation.

Lane behavior:
- `tiny`: patch directly; quick checks; minimal trace.
- `normal`: bounded validation; standard trace.
- `high-risk`: pause if direction is ambiguous; strongest verification; detailed trace.

Mid-task unknown that is must-not-self-decide (credentials, schema/migration, permission rule, large destructive change) → `BLOCKED` and record blocker per `implementation-discovery` escape-hatch — do not guess.

## Self-report trace (in response)

End task reports with: `Status` (PASS/PARTIAL/BLOCKED), `Lane`, files/layers changed, verification evidence, `Friction` (or `none`). Depth follows lane: tiny = minimal; normal = standard; high-risk = detailed.

## Advisory durable log

After `normal` or `high-risk` tasks, append one JSON line to `<working-repo>/.agent/trace.jsonl`:

`ts, lane, status, task_summary, files_changed, verification, friction`

`.agent/` is gitignored. This is advisory — not enforced from canonical. Repeated friction is a signal for `context-evolution-protocol` (human review only).
