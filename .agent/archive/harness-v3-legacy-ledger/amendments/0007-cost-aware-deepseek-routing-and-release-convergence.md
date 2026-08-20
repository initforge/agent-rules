AM-0007 — Cost-aware DeepSeek routing, scarce native boundaries, and single-main convergence

Owner-approved additive amendment. This amendment supplements AM-0006 and does not rewrite
`original.md` or any earlier amendment. All original requirements and approved amendments remain
in force. AM-0004 remains absent/tombstoned.

Immutable original SHA-256: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31

## 1. Owner decisions carried forward

1. Record all latest owner decisions in the active `.agent` plan bundle.
2. `NATIVE_SUBAGENT` is scarce. It is normally allowed only at the initial
   audit/architecture boundary and the final independent review/certification boundary.
3. Middle implementation and repair work normally uses OpenCode/DeepSeek through
   `ARTIFACT_HANDOFF` or `CODEX_FEDERATED`.
4. Final Git state is the newest, fully reconciled and certified commit on `main`.
5. After remote `main` passes its exact-SHA release gates, delete every other local and
   remote branch. Do not create a backup branch and do not force-push.

## 2. DeepSeek model economy policy

DeepSeek Pro is not banned. It is a scarce escalation/review tier whose use must be justified by
risk or repeated failure. The default path is:

```text
bounded implementation or routine repair
→ DeepSeek Flash high
→ DeepSeek Flash max when ambiguity or failure risk is elevated
→ independent bounded review
→ DeepSeek Pro only when an escalation trigger is present
```

Routine, narrow, mechanically verifiable, or low/medium-risk work must not use Pro merely because
it is available. Flash high/max remains the normal worker and routine reviewer tier.

### Pro escalation triggers

Pro may be resolved only when at least one persisted trigger is true:

- two repair attempts produce the same normalized failure signature;
- worker and independent reviewer disagree on a material finding;
- the evidence chain is unverifiable or suggests a false terminal claim;
- a high-risk schema, security, credential, data-loss, release, or architecture boundary remains
  ambiguous after repository-grounded discovery;
- final whole-plan reconciliation has cross-subsystem contradictions that Flash max cannot close;
- the owner explicitly requests Pro.

The resolver must store the trigger, expected decision value, model, effort, token/time/cost budget,
and termination condition. “Use the strongest model” is not a valid reason by itself.

### Bounded Pro invocation

Every Pro assignment must:

- cover one subsystem and at most five focus files or eight acceptance criteria;
- receive plan anchors, approved amendments, exact diff and failing evidence first;
- avoid rereading the full repository or full plan when signed anchor excerpts and artifact hashes
  are sufficient;
- be read-only when acting as reviewer;
- stop after a structured verdict or when its hard token/time/cost budget is exhausted;
- be interrupted when it repeats tool calls, rereads unchanged context, or exceeds its expected
  information gain;
- emit findings that a cheaper worker can repair whenever repair does not itself require Pro.

Pro never repairs the diff it independently reviewed.

## 3. Budget-aware resolver and supervisor

The engine owns a typed model-routing decision with:

```text
requested_model_tier
resolved_model_tier
reason
escalation_trigger
effort
token_budget
time_budget
cost_budget
observed_tokens
observed_cost
termination_reason
```

Requirements:

- A provider/model catalog supplies current pricing and capability metadata; hard-coded historical
  prices are not policy authority.
- The supervisor tracks rolling cost and token use per assignment, slice, batch and plan.
- Budget exhaustion interrupts the current invocation and returns evidence; it does not mark the
  task complete or silently weaken tests/contracts.
- A budget overrun re-routes to a smaller context, a bounded Flash max repair, or an owner-visible
  genuine blocker only when no in-scope autonomous path remains.
- Quality remains the priority: a documented Pro escalation is required when the cheaper path
  cannot resolve a critical finding.
- Cache reuse, plan-anchor excerpts, diff-first review and same-session follow-up should reduce
  repeated context ingestion.
- The liveness supervisor must detect runaway read/reason/tool loops and interrupt them without
  waiting for a natural model stop.

## 4. Review topology

- Initial boundary: native subagent audit/architecture may be used when it materially reduces
  uncertainty.
- Middle slices: Flash high/max workers; independent Flash max review by default.
- Pro review: only for the persisted triggers above.
- Final boundary: native independent review/certification; Pro may support it only when the resolver
  records a qualifying trigger.
- A model final message is never completion evidence. Engine reconciliation and terminal gates
  remain authoritative.

## 5. Acceptance criteria

1. Resolver tests prove routine work cannot silently route to Pro.
2. Trigger tests prove Pro remains reachable for justified high-risk or repeated-failure cases.
3. Supervisor tests interrupt repeated read/tool loops and preserve a partial receipt.
4. Token/time/cost budgets are persisted and observable without storing prompt/output content by
   default.
5. Diff-first and anchor-excerpt review avoids mandatory full-plan/full-repository reload.
6. Pro review is read-only and cannot repair its own reviewed diff.
7. Budget exhaustion cannot produce `COMPLETED`, weaken tests, or bypass remediation.
8. Native-subagent scarcity and final single-`main` convergence remain enforced.

## 6. Activation

This amendment is captured immediately as owner-approved execution intent. Its runtime policy
becomes effective through the same canonical engine/CLI activation transaction as AM-0003,
AM-0005 and AM-0006 after the current plan-lifecycle repair closes. Until then, it is
`OWNER_APPROVED_PENDING_ACTIVATION`; it must not be omitted from the next effective-plan identity.
