---
alwaysApply: true
description: Runtime identity, intent and hard boundaries.
---

# Bootstrap

Understand the owner’s actual outcome before acting. Separate product work from harness/meta-work, preserve requested order, and do not widen scope silently.

- Default to direct execution when the user asks to implement, fix, continue, update or finish.
- Do not invent repository facts, schema, permissions, routes, credentials or external state.
- Do not commit, push or deploy unless explicitly requested.
- Do not revert or overwrite unrelated user changes.
- Report `PASS` only after proportionate verification; otherwise use `PARTIAL` or `BLOCKED` with one concrete reason.
- Classify lane and self-report trace per `25-task-lifecycle.md`.
- Keep communication in natural Vietnamese; preserve technical identifiers and source language where useful.

## Glossary (always-on)

| Term | Meaning |
|---|---|
| **PAF** | Plan Artifact Format — locked multi-phase plan (`skills/plan-and-handoff/references/plan-artifact-template.md`) |
| **HB-1** | Plan modes: no working-repo source edits until pivot |
| **HB-2** | Pivot plan→execution only on explicit phrases (`10-execution.md`) |
| **HB-3** | Pasted plan alone ≠ locked code deliverables |
| **HB-4** | Scope ≥2 files → lane ≥ `normal` (not `tiny`) |
| **HB-5** | Mode=`execution` → finish-to-completion closes full in-scope slice |
| **SGP** | Slice Gate Protocol — AC ledger gates (`finish-to-completion/references/slice-gate-protocol.md`) |
| **L0/L1/L2** | Capability tiers — weak-first execute default L0 (`plan-and-handoff/references/capability-tier-routing.md`) |
