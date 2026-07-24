# Detailed work ledger

Required for long/resumable work. Optional for medium/small work when it materially improves coordination, proof, rollback or interruption recovery.

Normal projects use the installed host launcher `agent-rules-tools/workctl`. Inside this harness repository, `automation/workctl.py` is the canonical source and fallback with `automation/work-ledger.schema.json`. The agent invokes it automatically; the owner does not operate the CLI.

The ledger records:

- original requirements, decisions, injections and discoveries mapped to slices;
- dependency-aware slices and observable acceptance claims;
- exclusive write ownership, semantic context capsules, and acknowledgment state;
- model/effort route and per-assignment usage;
- parallel active slices, checkpoints and next safe actions;
- semantic proof receipts: changed scope, fresh proof, unresolved risk, and next recovery action;
- independent review findings, resolution and rollback/re-plan state.

Rules:

- Allocate every source requirement and later injection proportionally. Capsules have semantic, not mechanical, budgets: include only what the recipient needs to act and prove; never dump the transcript or a repository inventory.
- Record the assignment transition from `pending` to `acknowledged` before a delegated slice starts. Treat `NEEDS_CONTEXT`, `CONFLICT`, and `BLOCKED` as recovery signals; add the minimum fact, reconcile boundaries, reassign narrowly, then declare unavailable orchestration for sequential recovery.
- Evidence is a fresh command, query, hashed artifact or observed interaction. Self-reported PASS and build-only proof for unrelated behavior are rejected.
- Keep the ledger current enough to resume. Do not demand it for a clear small change.
- Inspect a receipt only for its acceptance claim, negative invariant, scope boundary, and review triggers. The main agent owns integrated final review and terminal status.
- Keep delivery status (`PASS`/`PARTIAL`/`BLOCKED`) separate from control state such as acknowledgment, orchestration availability, and host observation.

For the delegated/resume receipt sequence, see [`slice-gate-protocol.md`](slice-gate-protocol.md).
