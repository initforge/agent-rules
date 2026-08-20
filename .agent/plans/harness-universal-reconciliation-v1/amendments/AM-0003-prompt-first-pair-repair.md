# AM-0003 — Prompt-first entrypoints and pair repair

Status: `OWNER_APPROVED_EFFECTIVE`

Applied to plan revision: `4`

## Owner correction

Ordinary conversation is the primary portable entrypoint. Host slash commands,
native goals, buttons, and CLI aliases are optional convenience adapters. They
must never own plan semantics, durable authority, completion truth, or recovery
state.

## Entrypoint contract

1. A normal prompt, optional slash command, CLI/API call, or native host action
   compiles into the same canonical `WorkRequest` and effective-plan binding.
2. Ordinary prompts are sufficient for plan start, resume, review, audit, and
   post-plan repair. No user is required to invoke `/goal` or any host-specific
   syntax.
3. Host adapters may improve ergonomics only. They cannot add/remove
   requirements, change lifecycle state, widen authority, alter repair budgets,
   weaken proof, or create a platform-specific fork of the plan.
4. Adapter identity is recorded as `conversation`, `command`, `cli`, `api`, or
   `native_host`; equivalent inputs must produce semantic-parity receipts.
5. `/goal` remains an optional emulated command where supported. Its absence is
   not an installation, portability, readiness, or completion failure.

## Pair-repair lifecycle

After implementation or apparent PASS, an ordinary user report may open a
pair-repair session. The runtime must:

1. Preserve the raw finding and bind it to the exact plan, candidate epoch,
   repository state, and observed surface.
2. Classify it as implementation defect, missing requirement, changed owner
   intent, evidence defect, environment/provider issue, or unrelated work.
3. Compute impacted requirements, claims, tasks, files, providers, and evidence.
   Reopen only the affected claims; unaffected accepted claims remain terminal.
4. Retain historical evidence but mark affected evidence stale for the new
   candidate epoch. Never rewrite the old PASS record.
5. Produce the smallest bounded repair packet and let user plus agent pair
   conversationally without forcing a new full plan or slash command.
6. Re-run claim-matched proof, acceptance reduction, reconciliation, and any
   risk-triggered regression scope before issuing a new terminal result.
7. Convert a genuine requirement or owner-intent change into an amendment rather
   than misclassifying it as a code defect.

If several active plans could own the finding, or source/owner truth is missing,
return `NEEDS_USER` instead of guessing. Prompt wording alone cannot choose plan
authority; repository, ledger, diff, candidate, and evidence facts must agree.

## Long-plan support

Long-running execution is conversation-independent. Durable plan identity,
requirements, decisions, task graph, checkpoints, repair findings, evidence,
candidate epochs, and next-safe-action state live in artifacts. Every host may
reconstruct the smallest current context capsule from those artifacts after
compaction, restart, model change, or handoff.

## Impact allocation

- S1: compile all entrypoints into one WorkRequest and make `/goal` optional.
- S7B: implement pair-repair finding, impact, selective claim reopen, stale
  evidence, repair packet, conversational resume, and re-acceptance contracts.
- S8: prove cross-entrypoint semantic parity and dogfood ordinary-prompt repair.
- DEC-021 supersedes DEC-018's mandatory `/goal` interpretation.
