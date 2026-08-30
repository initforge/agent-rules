---
name: finish-to-completion
description: Use after an explicit execute pivot for a clear task, native plan, or portable plan pasted from another session or host. Implement all feasible in-scope work, prove the changed behavior, and stop when acceptance is met. Do not use for plan-only or pure Q&A.
metadata:
  signals: "làm đi, implement, fix, refactor, migrate, hoàn thành, execute, execute plan, implement plan, thực thi plan, tiếp tục thực thi"
  excludes: "create plan, lập plan, plan mode, plan-only, pure q&a"
  priority: "10"
  platform_scope: "all"
---

# Finish to Completion

The user-selected receiving model implements the accepted native or portable
plan end to end. Same-session execution remains the default; an explicit
owner-directed handoff changes the session, not the authority of the plan. The
harness supplies behavior and capabilities; it does not select or replace the
model, create worker tiers, or require role handoffs.

## Execute

1. Recover the accepted native or pasted plan. Treat its outcome, scope,
   non-goals, settled decisions, invariants, acceptance, and constraints as
   authoritative unless they conflict with newer owner instructions, source
   truth, or safety.
2. Revalidate the source identity and target anchors, then inspect the affected
   interfaces. Discover files, symbols, components, and commands from the
   repository instead of asking the owner for discoverable facts.
3. Implement the next dependency-ready slice before broad verification.
4. Run typecheck or the cheapest focused unit/integration/runtime proof that
   covers each changed seam.
5. If a proof fails, repair the cause and rerun only that proof and affected
   direct dependents.
6. Continue through the remaining slices without phase-by-phase relay. If a
   local assumption is false but acceptance is unchanged, adjust to source truth
   and continue; do not reopen settled decisions.
7. Run the broad suite once at the release gate, or earlier only for a material
   security, data-loss, public-contract, or wide-runtime risk.
8. Read back live installed state when the claim concerns installation, hooks,
   integrations, host configuration, or runtime behavior.
9. Review the integrated result for material correctness and maintainability,
   fix real blockers, then stop when acceptance is proven.

## Completion

- **Done:** all in-scope acceptance conditions are implemented and supported by
  current proof or live readback.
- **Blocked:** a required permission, credential, owner decision, destructive
  authority, inaccessible material resource, unavailable host, or external
  state prevents the remaining result. Use `NEEDS_USER` only when the missing
  input materially changes scope, architecture, safety, or acceptance.

Do not substitute model prose for proof. Do not rerun unchanged checks, generate
per-step evidence files, perform opportunistic cleanup, expand scope, or keep
working merely to produce a more elaborate report after acceptance is met.

Native delegation is optional and useful only for genuinely independent work.
If it is unavailable, continue directly; orchestration availability does not
change whether the final behavior is proven.
