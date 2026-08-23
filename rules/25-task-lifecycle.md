---
alwaysApply: true
description: Workflow classification, proportional work state, review budget, and execution ownership.
---

# Task lifecycle

**Domain:** Mode classification, work shapes, role definitions, delegation rules, review budget, plan review behavior, and task state lifecycle.
For execution contract, proof matching, evidence standards, and stop conditions, see [10-execution.md](10-execution.md).

## Decide the mode first

| Mode | Deliverable | Source edits |
|---|---|---|
| `advisory` | answer or recommendation | no |
| `plan` | executable plan or review | no, until execute pivot |
| `execution` | completed change and proof | yes |

- A pasted plan is review input, not authority to edit.
- An explicit execute pivot authorizes execution.

## Plan review behavior

1. **Explicit verdict**: plan reviews must conclude with exactly one verdict: `APPROVE`, `CONDITIONAL`, or `BLOCKED`.
2. **Bounded blockers**: reviewers return at most **3 high-priority blockers** per round.
3. **Conditional approval for debt**: if a plan is sufficient to ship core outcomes safely, grant `CONDITIONAL` approval with non-blocking follow-up debt rather than demanding plan perfection.
4. **Stable criteria**: reviewers must not invent new acceptance criteria after the implementer fixes previously raised blockers.
5. **No reopening**: closed findings cannot be reopened without new empirical evidence or an explicit scope expansion.

## Bounded review budget

To prevent unbounded audit loops from stalling releases:

1. **Budget limit**: at most **1 primary review** and **1 correction review** per scope.
2. **Post-correction filter**: after the correction review, do not raise new blockers unless the finding:
   - Makes a core user journey fail;
   - Violates a security, safety, scope, or data integrity invariant;
   - Deprives an agreed acceptance claim of valid verification proof;
   - Or constitutes an explicit owner-declared release gate.
3. **Follow-up debt**: any finding failing to meet the above criteria is logged as non-blocking follow-up debt and does not open a new review cycle.

## Scale the work

| Shape | Use | Durable state |
|---|---|---|
| `small` | focused, low-risk work | none unless useful |
| `medium` | multi-file or bounded change | concise scope and proof note |
| `large` | phased, high-risk, or coordinated work | roadmap, ownership, proof, and ledger |
| `resumable` | interruptible, multi-session, or externally waiting work | large state plus checkpoints and resume context |

- Classify risk first, then shape from dependencies, coordination, rollback, and proof needs; not a file-count classification.
- Escalate to `high-risk` for auth, migration/data loss, security, external providers, or weakened validation.
- Use portable classes: economy for retrieval/mechanical, standard for ordinary, expert for unresolved risk.
- If subagents are unavailable, declare and recover without weakening boundaries, acceptance, proof, or checkpoints.
- Report task outcome (`PASS`/`PARTIAL`/`BLOCKED`) separately from model-attestation state (`OBSERVED`/`UNVERIFIED`/`UNAVAILABLE`).
- Record durable state only when it improves handoff, recovery, coordination, or proof.

## Assign clear roles

**Coordinator** — preserves intent, manages ledger, assigns slices, reports status. Narrow actions: inspect, route, reconcile, merge, unblock.

**Architect/integrator** — architecture, contracts, state boundaries, cross-domain behavior, integration code.

**Implementer** — bounded slices with stable interfaces, explicit paths, clear ACs. No global reinterpretation.

**Researcher/utility** — read-only exploration, research, inventory, mechanical work.

**Reviewer** — reviews final diff, not summaries. Read-only. Risk-triggered. Adheres to review budgets.

**Verifier** — claim-specific checks. Read-only. Cannot make unverified into PASS.

## Delegate when it adds value

Delegate when: stable boundary, clear ACs, non-overlapping writes, sufficient context, meaningful parallelism. Not for multiple files alone. Small tasks need no subagents.

## Record what you delegated

Two facts, not a ceremony:

- `delegated` — what went out, to whom, and why
- `outcome` — `consumed` | `rejected` (with reason) | `skipped` (with reason)

A seven-event receipt chain was tracked here previously. For a single operator it cost
more to emit than it ever paid back in traceability, and missing entries were treated
as findings, which made the ceremony itself a source of review churn.
