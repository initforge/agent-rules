---
name: plan-and-handoff
description: Use for multi-part work, native Plan Mode, portable or pasted plans, cross-host handoffs, or resumable work that needs a clear execution sequence before implementation. Do not use for a single obvious fix or pure Q&A.
metadata:
  signals: "plan, plan mode, handoff, cross-host, portable plan, pasted plan, resumable work, executable plan, /goal"
  excludes: "single obvious fix, pure q&a"
  priority: "70"
  platform_scope: "all"
---

# Plan and Handoff

Use the host's native plan/progress surface. Do not create a second plan file,
ticket set, ledger, worker hierarchy, model policy, or PASS-grant workflow.

## Native plan contract

A useful plan contains only what a cold-start implementation model needs:

1. **Outcome** — the observable result.
2. **Execution context** — repository/project, starting source state, accessible
   inputs, and task-specific conclusions from relevant domain authorities.
3. **Scope** — components or files that may change, plus explicit exclusions.
4. **Decisions and targets** — settled choices, invariants, and locators that
   identify the affected interface and runtime state.
5. **Acceptance** — concrete conditions that mean the work is done.
6. **Sequence** — ordered implementation slices and real dependencies.
7. **Verification** — exact smallest proof for each changed seam and the one
   release gate, when applicable.
8. **Constraints** — safety, compatibility, ownership, external blockers, and
   the stop condition.

Keep small work compact. Add detail only where it prevents ambiguity, unsafe
changes, or lost continuity. For a long session, update the native plan with one
compact checkpoint and next action; do not mirror it into repository artifacts.

## Behavior

- Inspect real interfaces before finalizing a non-trivial plan.
- Normalize raw input into requirements, evidence, assumptions, settled owner
  decisions, and unknowns. Discover repository facts before asking for them.
- Ask only questions whose answers materially change scope, architecture,
  compatibility, safety, or acceptance.
- Preserve owner decisions. Amend the native plan explicitly when a later
  instruction supersedes one.
- Same-session execution is the default. For an explicit owner-directed
  handoff, make the plan cold-start executable and let the receiving
  user-selected model own implementation end to end. Never select a model.
- Use native delegation only when the user or running model deliberately chooses
  it for independent work; the harness never requires role handoffs.
- When the owner says execute, continue through `finish-to-completion` without
  waiting for phase-by-phase relay.

## Close a portable handoff

1. **Close the source.** Prefer repository-relative paths and stable
   symbol/interface anchors. Identify the branch, commit, or current working
   tree only when source identity affects continuity. State which observed facts
   must be revalidated if the source drifts.
2. **Close domain authority.** Use applicable skills, profiles, source contracts,
   and project facts while planning, then materialize the task-specific
   architecture, patterns, API/data contracts, safety constraints, and edge
   cases. A receiving host may load the named authority for more guidance, but
   the plan must not merely say "follow skill X" or require that authority to be
   installed.
3. **Close references.** Translate images, logs, pasted code, links, and chat
   references into implementation facts. If an asset remains necessary for
   proof, give a stable repository-relative path or URL plus the relevant region
   and state. If the textual contract is sufficient, a missing asset does not
   block execution. If it is not sufficient, return `NEEDS_USER` before calling
   the plan runnable. Never depend on ordinal attachments or phrases such as
   "the image above", "that option", or "the earlier file".
4. **Close targets.** Bind every material requirement to a domain-appropriate
   locator. UI work may need route, viewport, mode/tab, pane/region, component,
   entry state, and trigger. Backend, data, infra, docs, and bug work use their
   own service, API, schema, resource, section, reproduction, or affected-seam
   locators; never force a UI schema onto other domains.
5. **Close slices.** Each dependency-ready slice states its target, observed
   current state, expected delta, invariants, dependencies, acceptance, and an
   exact proof command verified from the repository. Resolve architectural,
   product, compatibility, security, and acceptance decisions before handoff.
   Give discoverable unknowns a source anchor; expose only genuinely
   owner-dependent unknowns as blockers.

## Fresh-session audit

Before presenting a long or portable plan, read it as if the conversation and
source attachments were unavailable. The recipient must be able to identify the
source, target, delta, invariants, sequence, proof, and stop condition without
asking again. Remove unresolved nouns, pronouns, ordinal references, vague test
labels, repeated acceptance, source dumps, and copied skill content. Decision
complete does not mean exhaustive: add detail only where it removes judgment,
risk, or lost continuity.

For a pasted plan, normalize it into this contract, preserve valid completed
work and fresh evidence, remove ceremonial fields, and execute only after an
explicit pivot.
