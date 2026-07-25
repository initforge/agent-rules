---
alwaysApply: true
description: Workflow classification, proportional work state, and execution ownership.
---

# Task lifecycle

**Domain:** Mode classification, work shapes, role definitions, delegation rules, task state lifecycle, and delegation receipts.
For execution contract, proof matching, evidence standards, and risk-triggered review, see [10-execution.md](10-execution.md).

## Decide the mode first

| Mode | Deliverable | Source edits |
|---|---|---|
| `advisory` | answer or recommendation | no |
| `plan` | executable plan or review | no, until execute pivot |
| `execution` | completed change and proof | yes |

- A pasted plan is review input, not authority to edit.
- An explicit execute pivot authorizes execution.

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

**Reviewer** — reviews final diff, not summaries. Read-only. Risk-triggered.

**Verifier** — claim-specific checks. Read-only. Cannot make unverified into PASS.

## Delegate when it adds value

Delegate when: stable boundary, clear ACs, non-overlapping writes, sufficient context, meaningful parallelism. Not for multiple files alone. Small tasks need no subagents.

## Required delegation receipts

- `subagent_requested` — why delegated
- `subagent_resolved` — model/effort
- `subagent_started` — acknowledged
- `subagent_completed` — result returned
- `result_consumed` — integrated
- `result_rejected` — with reason
- `delegation_skipped` — why skipped

Missing receipts are detectable.
