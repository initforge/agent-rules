---
name: plan-and-handoff
description: "Multi-part work, native Plan Mode, portable/pasted plans, cross-host handoffs, resumable work."
metadata:
  signals: "plan, plan mode, handoff, cross-host, portable plan, pasted plan, resumable work, executable plan, /goal"
  excludes: "single obvious fix, pure q&a"
  priority: "70"
  platform_scope: "all"
---

# Plan and Handoff

Use the host's native plan/progress surface. Agent Rules may mirror only the
accepted active plan and compact frontier under its owned `.agent/current`
state; do not create tickets, history, worker hierarchy, model policy, raw
evidence store, or PASS-grant workflow.

## Constraint-complete plan contract

A useful plan gives a cold-start implementation model the constraints that it
cannot safely invent:

1. **Outcome and product behavior** — the observable result and user-visible
   rules that must hold.
2. **Context and scope** — accessible inputs, relevant source truth, what may
   change, and explicit non-goals.
3. **Settled decisions** — architecture, public API or data contracts,
   invariants, safety and permission boundaries.
4. **Acceptance and stop condition** — concrete completion conditions and the
   owner-dependent changes that require a pause.
5. **Sequence and proof** — dependency-ready affected seams, expected deltas,
   required focused proof and any justified release gate.

## Five contracts

Every material plan closes five contracts in the native plan:

1. **Outcome contract** — observable product result and behavior.
2. **Change contract** — classify each requirement as `CREATE`, `MODIFY`,
   `REPLACE`, `RETIRE`, `MIGRATE` or `PRESERVE`.
3. **Preservation contract** — for replace/retire/migrate/refactor, name the
   public behavior, data/contracts, consumers, operational capabilities and
   user-visible states that must survive.
4. **Slice contract** — affected seam, current-to-expected delta,
   dependencies, locked invariants, source proof and required runtime proof.
5. **Completion contract** — exact conditions for PASS, PARTIAL, BLOCKED,
   NEEDS_USER and PRE-EXISTING.

Classify every material unknown as `OWNER_DECISION`, `SOURCE_DISCOVERABLE`,
`IMPLEMENTATION_LOCAL` or `EXTERNAL_BLOCKER`. Resolve owner decisions before
execution, give source-discoverable facts an authority/anchor, leave local
implementation choices open, and bind external blockers only to affected
slices. A plan is not runnable while a material unknown remains unclassified.

Use a stable path, symbol, route, API, schema or runtime-state locator only when
it identifies a material contract or avoids ambiguity. Do not turn a plan into a
file-by-file script: files, symbols, internal structure and exact commands stay
discoverable unless the contract itself fixes them.

## Autonomy envelope

The implementation model may inspect the repository to choose files and
symbols, internal design, necessary local refactors, and an equivalent
repository-native proof command. It may repeat focused repair-and-test cycles
after material changes. It must stop or ask before changing scope, product
behavior, architecture, public API or data contract, security or permission
boundary, destructive authority, or acceptance.

If source truth contradicts a local planning assumption but all locked
constraints remain valid, record the discovered fact in the active plan if
needed and continue; do not reopen an owner decision.

## Handoff behavior

- Inspect real interfaces before finalizing non-trivial work. Materialize
  task-specific conclusions from skills, profiles, images, logs, links and
  source contracts; never leave ordinal or conversational references.
- Resolve owner decisions before handoff. Discoverable implementation details
  remain implementation work, not blockers.
- Name each slice by affected seam and expected delta, with dependencies,
  invariants and required proof. Give an exact command only when it is a stable
  repository contract; otherwise permit an equivalent command discovered during
  implementation.
- Ask only questions whose answers materially change scope, architecture,
  compatibility, safety, product behavior or acceptance.
- Same-session execution is the default. An explicit owner-directed handoff
  changes the session, not model authority; never select a model or require
  delegation.
- Changing the selected model between plan and execution is also a handoff,
  even inside one thread. The receiving model may inspect source but must not
  depend on unstated planner reasoning.

## Cold-start closure

- **Source identity:** record branch, commit, working-tree state or a
  revalidation condition only when source drift could affect continuity.
- **Domain closure:** materialize task-specific architecture, public contracts,
  safety constraints and relevant edge cases from skills, profiles and source
  authorities; never leave only “follow skill X”.
- **Reference closure:** translate images, logs, links and attachments into
  implementation facts or stable locators. If a required resource is
  inaccessible and the textual contract is insufficient, return `NEEDS_USER`.
- **Slice delta:** for each dependency-ready seam, include observed current
  state when it affects the delta, expected behavior, dependencies, locked
  invariants, source acceptance and required runtime proof. Discoverable
  implementation details remain in the autonomy envelope, not blockers.
- **Blast-radius closure:** generic words such as cleanup, redesign, remove,
  replace and refactor never decide what may be deleted. The change and
  preservation contracts own that boundary.
- **Review closure:** record a material review trigger for security, data loss,
  public contracts, migrations, destructive removal, major UI geometry or
  cross-runtime behavior. The owner chooses the reviewer/model.

Before presenting a long or portable plan, read it without conversation history:
the receiver must know the outcome, constraints, seams, proof and stop condition
without needing product or architecture decisions again, distinguish what is
removed from what is preserved, and know which acceptance remains runnable when
an external dependency is unavailable. Keep it compact; do not copy skills,
source dumps, execution history or ceremonial fields.

For a pasted plan, preserve valid completed work and fresh evidence, remove
ceremony, normalize it to this contract, and execute only after an explicit
pivot.

## Explore → Distill → Commit

For architecture, migration, replacement, destructive, major redesign or
high-uncertainty work, explore source, runtime, alternatives, hidden consumers
and contradictions before locking the plan. Distill only confirmed facts,
material assumptions, options/tradeoffs, evidence anchors and owner decisions.
Commit the compact outcome, constraints, preservation, slices, proof and reopen
conditions; do not hand research dumps or dead ends to the implementer.

Critical work considers at least two materially different approaches, prefers
the safer reversible option when outcome fit is comparable, names a
five-dimensional code/behavior/data/operational/user-visible impact map, and
asks which counterexample could make the plan wrong. Obvious local fixes bypass
this ceremony.

## Active frontier and context quarantine

When the Agent Rules task-state surface is available, mirror the accepted plan
and compact frontier in its owned `.agent/current` state. Update only after a
material decision, proof, blocker or slice transition. Before handoff or known
compaction, record proved work, current slice, open assumptions, do-not-repeat,
exact next action and stop condition; after resume, reconcile them with source
and proof bindings before continuing.

Subagents default to zero. Use at most two, without recursion, only when the
owner/accepted plan permits genuinely independent exploration. Each returns
Findings, Evidence, Implication and Open uncertainty; raw searches and logs do
not enter the parent context. Never parallelize implementation of shared seams.
