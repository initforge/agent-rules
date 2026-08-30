---
name: finish-to-completion
description: Use after an explicit execute pivot for a clear task or native plan. Implement all feasible in-scope work, prove the changed behavior, and stop when acceptance is met. Do not use for plan-only or pure Q&A.
metadata:
  signals: "làm đi, implement, fix, refactor, migrate, hoàn thành, execute"
  excludes: "plan-only, pure q&a"
  priority: "10"
  platform_scope: "all"
---

# Finish to Completion

The user-selected session model implements the native plan end to end. The
harness supplies behavior and capabilities; it does not replace the model,
create worker tiers, or require role handoffs.

## Execute

1. Recover the current native plan and inspect the affected interfaces.
2. Implement the dependency-ready core outcome before broad verification.
3. Run typecheck or the cheapest focused unit/integration/runtime proof that
   covers each changed seam.
4. If a proof fails, repair the cause and rerun only that proof and affected
   direct dependents.
5. Run the broad suite once at the release gate, or earlier only for a material
   security, data-loss, public-contract, or wide-runtime risk.
6. Read back live installed state when the claim concerns installation, hooks,
   integrations, host configuration, or runtime behavior.
7. Review the integrated result for material correctness and maintainability,
   fix real blockers, then stop when acceptance is proven.

## Completion

- **Done:** all in-scope acceptance conditions are implemented and supported by
  current proof or live readback.
- **Blocked:** a required permission, credential, owner decision, destructive
  authority, unavailable host, or external state prevents the remaining result.

Do not substitute model prose for proof. Do not rerun unchanged checks, generate
per-step evidence files, perform opportunistic cleanup, expand scope, or keep
working merely to produce a more elaborate report after acceptance is met.

Native delegation is optional and useful only for genuinely independent work.
If it is unavailable, continue directly; orchestration availability does not
change whether the final behavior is proven.
