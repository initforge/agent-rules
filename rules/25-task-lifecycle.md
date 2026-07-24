---
alwaysApply: true
description: Workflow classification, proportional work state, and execution ownership.
---

# Task lifecycle

## Decide the mode first

| Mode | Deliverable | Source edits |
|---|---|---|
| `advisory` | answer or recommendation | no |
| `plan` | executable plan or review | no, until execute pivot |
| `execution` | completed change and proof | yes |

- A pasted plan is review input, not authority to edit.
- An explicit execute pivot authorizes execution; the main agent then owns classification, orchestration, and completion.
- Plan roles and model routing belong to the lazy work protocol, not this core rule.

## Scale the work

| Shape | Use | Durable state |
|---|---|---|
| `small` | focused, low-risk work | none unless useful |
| `medium` | multi-file or bounded change | concise scope and proof note |
| `large` | phased, high-risk, or coordinated work | roadmap, ownership, proof, and ledger |
| `resumable` | interruptible, multi-session, or externally waiting work | large state plus checkpoints and resume context |

- Classify risk first, then shape from dependencies, coordination, rollback, and proof needs; this is not a file-count or checklist classification.
- Escalate to `high-risk` for auth, authorization, migration/data loss, security, external providers, or weakened validation.
- For high-risk ambiguity, stop only for a material owner decision; otherwise investigate and continue safe independent work.
- Use portable classes: economy for retrieval/mechanical work, standard for ordinary implementation, expert for unresolved material risk.
- For medium+ work, default to zero main-agent domain work: it owns outcome, allocation, integration, and review. The protocol defines the narrow control-plane exception and recovery ladder.
- If callable subagents are unavailable, declare the exception and recover without weakening boundaries, acceptance, proof, or checkpoints.
- Report task outcome (`PASS`/`PARTIAL`/`BLOCKED`) separately from orchestration or model-attestation state (`OBSERVED`/`UNVERIFIED`/`UNAVAILABLE`).
- Delegate independent bounded work with clear ownership and evidence duties; the main agent integrates and verifies the result.
- Record durable state only when it improves handoff, recovery, coordination, rollback, or independent proof. Tiny and ordinary work do not need a ledger.
- Keep trace logs advisory. Repeated friction is evidence for a later context-evolution review, not a task blocker.
