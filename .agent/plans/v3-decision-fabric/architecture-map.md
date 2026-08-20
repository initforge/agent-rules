# V3 architecture map and A-W planning output

This is the durable planning projection for the owner-provided 101-section
directive. The complete section index is `criteria-index.yaml`; this document
records the architecture, migration order, proof gates, and current limits.
No line in this document promotes worker output or external data to PASS.

## A. Authority and raw intent

Preserve the exact `WorkRequest.raw_intent`, source, owner `work_id`, current
generation, WorkSpec revision, TaskPacket identity, and claim traceability.
Canonical sources: `packages/kernel/src/northstar/protocol.ts` and
`.agent/current.json`.

## B. Current goal transaction

`.agent/current.json` is the only active pointer. Supersession uses generation
CAS and the live-amendment transaction; stale READY/RUNNING work is retained as
history and cannot land in the new generation.

## C. Decision Fabric

`RepoFacts`, `ChangeFacts`, and `TaskFacts` derive typed phase, policy,
capability, verifier, reviewer, and skill decisions. Phase is planner-bound;
skills may be empty. Shadow mode preserves legacy route evidence while active
mode is dogfooded in fixtures.

## D. Repository facts

Facts are deterministic, cacheable, source-hashed, and provenance-checked.
Missing facts remain unknown; they do not become invented domain truth.

## E. Change facts

Planned impact comes from WorkSpec. Post-change paths may be supplied as an
observed diff, and the fact explicitly records `planned` versus `observed`.
Meaningful diff observation is a separate proof step from planning.

## F. Task facts

TaskFacts combines phase, domains, stack, risk, impact, effects, claim classes,
and fact IDs. Schema impact requires migration-specific proof capabilities and
does not silently fall back to a generic application test.

## G. Contract boundaries

WorkSpec, TaskPacket, Verifier, EvidenceRecord, AgentDriver receipt, current
pointer, artifact references, and provider effect contracts are typed and
validated. Unknown fields fail closed.

## H. Phase and routing

Routing selects phase first, then capabilities/providers/verifiers/reviewers;
phrase matching is compatibility evidence only. A normal typed route has
`skills: []` unless a planner or explicit domain activation supplies skills.

## I. Provider effects and authority

Availability is not permission. Every provider declares effect, environment,
approval, reversibility, credentials, timeout, and evidence. Local task-scope
writes require owned scope; network/host write or destructive effects require
owner approval; explicit-only providers require explicit selection.

## J. Verification and PASS

Workers return observations only. The append-only evidence ledger, independent
verifiers, acceptance reducer, semantic validator, scope gate, and current
generation gate derive trusted outcomes. Missing truth is BLOCKED/NEEDS_USER.

## K. Artifact lifecycle

Source, plan, evidence, runtime output, generated output, archive, tombstone,
and scratch files have separate lifecycle classes. Deletion is recoverable or
recorded; generated output is never hand-edited as source.

## L. Large-repository context

Context compilation is bounded and claim-driven: localization, entrypoints,
symbols, semantic retrieval when available, bounded lexical fallback, and
context feedback on repair. Whole-repository dumps are prohibited.

## M. Domain packs

5fedu remains an explicit central reference pack. It is selected by project
scope, read through manifest-bound pointers, and never copied into a target.
Pencil is explicit-only and design evidence never substitutes runtime proof.

## N. Cross-host execution

AgentDriver is host-neutral. TaskEnvelope carries work/generation/task/spec
identity and bounded receipts. Codex and Antigravity are adapters, not
independent authorities; handoff is artifact-based and transcript-free.

## O. Control Plane

The Control Plane renders projections of current authority, execution, verify,
design, and system health. Any future goal-switch action must call the same
strong-planner/live-amendment transaction; a UI mutation may not edit pointer
files directly.

## P. Operator state

Operator-facing state is concise, Vietnamese-first where applicable, and
derived from canonical artifacts. Raw JSONL, provider responses, and progress
notes are not authority.

## Q. Metrics

Measure route parity, no-skill ablation, provider value, context bounds,
verification cost, repair convergence, stale rejection, and CI/local closure.
Metrics are receipts and cannot override a failing hard gate.

## R. Legacy migration

Keep proven runner behavior until replacement parity is demonstrated. Retired
surfaces receive explicit disposition, compatibility facades, or tombstones;
no behavior is deleted merely because V3 has a new name.

## S. Dogfood contract

Implementation uses the same V3 contracts, active Decision Fabric fixtures,
provider effect checks, authority pointer, and verification gates that future
user work will use. Dogfood is continuous, not a post-migration batch.

## T. Hard-truth gates

The 20 gates in directive section 94 are the closure audit surface. They cover
supersession, restart, semantic contradiction, zero-skill routing, Pencil,
migration proof, effect approval, artifact bounds, handoff, ownership, exact
generation projection, deterministic routing, bounded context, ablation, and
measurable provider value.

## U. Local verification

Required sequence: build, typecheck, focused dogfood suites, all workspace
tests, `verify:all`, and clean-worktree audit. The final commit is not closed
until its remote CI run is green on every required job.

## V. Ownership and scope

Each task declares owned and forbidden paths. Overlap is rejected or serialized;
non-overlapping work may be isolated. Forbidden-scope edits fail closed.

## W. Closure and residual truth

Close only with 101-section traceability, 24 requirement evidence, hard-truth
fixtures, local verification, and final GitHub CI. External hosts, business
truth, unavailable providers, or owner approvals remain explicit blockers rather
than synthesized success.

## Migration phases

1. **P0 inventory and authority:** pointer, ledger, criteria index, A-W map.
2. **P1 contracts:** typed WorkSpec/TaskPacket/evidence/artifact schemas.
3. **P2 Decision Fabric:** RepoFacts/ChangeFacts/TaskFacts and shadow receipts.
4. **P3 execution safety:** generation, supersession, stale recovery, semantic validation.
5. **P4 verification:** independent evidence, acceptance, convergence, hard-truth fixtures.
6. **P5 context scale:** bounded localization, semantic fallback, capsule and budgets.
7. **P6 capability effects:** provider registry, explicit activation, approval gates.
8. **P7 domains:** mobile/frontend/database/infra/security and Pencil boundaries.
9. **P8 portability:** AgentDriver, TaskEnvelope, cross-host artifact handoff.
10. **P9 Control Plane:** canonical projections and transaction-backed goal switching.
11. **P10 hygiene and parity:** lifecycles, tombstones, legacy parity, adoption ablations.
12. **P11 closure:** full local suite, remote CI, ledger receipt, clean worktree.
