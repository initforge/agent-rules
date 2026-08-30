---
name: plan-and-handoff
description: Use for multi-part work, native Plan Mode, pasted plans, handoffs, or resumable work that needs a clear execution sequence before implementation. Do not use for a single obvious fix or pure Q&A.
metadata:
  signals: "plan, plan mode, handoff, resumable work, executable plan, /goal"
  excludes: "single obvious fix, pure q&a"
  priority: "70"
  platform_scope: "all"
---

# Plan and Handoff

Use the host's native plan/progress surface. Do not create a second plan file,
ticket set, ledger, worker hierarchy, model policy, or PASS-grant workflow.

## Native plan contract

A useful plan contains only what the implementation model needs:

1. **Outcome** — the observable result.
2. **Scope** — components or files that may change, plus explicit exclusions.
3. **Acceptance** — concrete conditions that mean the work is done.
4. **Sequence** — ordered implementation slices and real dependencies.
5. **Verification** — the smallest proof for each changed seam and the one
   release gate, when applicable.
6. **Constraints** — safety, compatibility, ownership, or external blockers.

Keep small work compact. Add detail only where it prevents ambiguity, unsafe
changes, or lost continuity. For a long session, update the native plan with one
compact checkpoint and next action; do not mirror it into repository artifacts.

## Behavior

- Inspect real interfaces before finalizing a non-trivial plan.
- Ask only questions whose answers materially change scope, architecture,
  compatibility, safety, or acceptance.
- Preserve owner decisions. Amend the native plan explicitly when a later
  instruction supersedes one.
- The model selected by the user owns planning and implementation end to end.
- Use native delegation only when the user or running model deliberately chooses
  it for independent work; the harness never requires role handoffs.
- When the owner says execute, continue through `finish-to-completion` without
  waiting for phase-by-phase relay.

For a pasted plan, normalize it into this native format, preserve valid completed
work and evidence, remove ceremonial fields, and execute only after an explicit
pivot.
