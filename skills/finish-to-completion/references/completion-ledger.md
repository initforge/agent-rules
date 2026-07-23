# Detailed work ledger

Required for long/resumable work. Optional for medium/small work when it materially improves coordination, proof, rollback or interruption recovery.

Canonical machine state uses `automation/workctl.py` with `automation/work-ledger.schema.json`. The agent invokes it automatically; the owner does not need to operate the CLI.

The ledger records:

- original requirements, decisions, injections and discoveries mapped to slices;
- dependency-aware slices and observable acceptance claims;
- exclusive write ownership and narrow context capsules;
- model/effort route and per-assignment usage;
- parallel active slices, checkpoints and next safe actions;
- runner-backed proof or independently verifiable fresh artifacts;
- independent review findings, resolution and rollback/re-plan state.

Rules:

- Allocate every source requirement and later injection proportionally. Do not dump the full conversation into every agent context.
- Evidence is a fresh command, query, hashed artifact or observed interaction. Self-reported PASS and build-only proof for unrelated behavior are rejected.
- Keep the ledger current enough to resume. Do not demand it for a clear small change.
- The main agent owns integrated final review and terminal status.

For the delegated/resume receipt sequence, see [`slice-gate-protocol.md`](slice-gate-protocol.md).
