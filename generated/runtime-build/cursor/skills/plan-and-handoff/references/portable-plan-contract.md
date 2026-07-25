# Portable plan contract

This document defines three plan detail levels. Every plan names the outcome and acceptance;
higher levels add traceable requirements, decisions, change graph, and session-safe recovery.

Scale up only as risk, coordination, or interruption exposure justifies. A small plan is a
complete contract; ceremony beyond the level adds no enforcement value.

## Level selection

| If the work is... | Use level |
|---|---|
| A single focused change with one owner, no external dependency, and trivial rollback | **small** |
| Multi-file, bounded work with known interfaces and a single decision maker | **standard** |
| Multi-session, multi-owner, interruptible, or externally dependent | **resumable** |

## Small

A small plan is the minimum executable contract:

```json
{
  "schema": "artifact/plan",
  "version": 1,
  "level": "small",
  "meta": { "id": "plan-2401", "created_at": "…", "updated_at": "…", "source_refs": [] },
  "intent": {
    "outcome": "Clear observable result",
    "risk_classification": "low",
    "in_scope": ["what changes"],
    "non_goals": ["what does not change"]
  },
  "acceptance": [
    { "id": "AC1", "claim": "…", "proof_profile": "static-change", "required_dimensions": ["outcome"] }
  ],
  "execution_contract": {
    "mode": "automatic", "shape": "small", "ledger": "off", "strategy": "single-agent",
    "max_agents": 1, "max_depth": 0, "effort_cap": "low",
    "authorized_final_actions": ["edit"]
  }
}
```

- `intent.outcome` — what the user will observe.
- `intent.in_scope` / `non_goals` — explicit boundaries, no scope creep.
- `acceptance` — what must be proved and how.
- `execution_contract` — how the agent should run. Default: direct, single-agent, low effort.

No requirement IDs, no decision registry, no change graph. The owner's request is implicit in
`source_refs`.

## Standard

Standard adds requirement IDs, decisions, a change graph, and a verification matrix so that
workers can map results back to requirements and decisions cannot be silently overwritten.

```json
{
  "schema": "artifact/plan",
  "version": 1,
  "level": "standard",
  "meta": { … },
  "original_request_hash": "sha256-of-request",
  "intent": { … },
  "requirements": [
    { "id": "REQ-001", "summary": "…", "kind": "original" },
    { "id": "REQ-002", "summary": "…", "kind": "injection" }
  ],
  "decisions": [
    { "id": "DEC-001", "statement": "…", "rationale": "…", "supersedes_id": null }
  ],
  "repository_facts": {
    "baseline": "branch/commit",
    "architecture": ["…"],
    "reference_map": [{ "source": "…", "destination": "…", "reuse": "…", "deviation": "…" }]
  },
  "constraints_and_invariants": {
    "negative_invariants": ["must not regress X"],
    "migration_constraints": ["…"]
  },
  "change_graph": [
    {
      "id": "CG-001", "area": "…", "current_truth": "observed fact",
      "exact_change": "new implementation", "category": "fact",
      "files": ["…"], "depends_on": [], "requirement_ids": ["REQ-001"]
    }
  ],
  "acceptance": [
    { "id": "AC1", "claim": "…", "proof_profile": "…", "required_dimensions": ["…"],
      "requirement_ids": ["REQ-001"] }
  ],
  "verification_matrix": [
    { "requirement_id": "REQ-001", "acceptance_ids": ["AC1", "AC2"] }
  ],
  "path_ownership": {
    "exclusive_writers": { "owner-a": ["src/…"] },
    "read_only_paths": ["src/shared/…"],
    "forbidden_paths": ["secrets/"]
  },
  "execution_contract": {
    "mode": "automatic", "shape": "medium", "strategy": "delegated",
    "max_agents": 3, "max_depth": 1, "effort_cap": "medium",
    "authorized_final_actions": ["edit", "commit"]
  }
}
```

### Fact/assumption/unknown/user_decision

Every entry in `change_graph` and `intent.assumptions` carries a `category`:

| Category | Meaning | Example |
|---|---|---|
| `fact` | Discovered from the repository or confirmed by the owner | "The module registry is at routes/mod.rs" |
| `assumption` | Reasonable belief, not yet confirmed | "PostgreSQL 15 is available" |
| `unknown` | Known gap, needs discovery | "Which API version does the client use?" |
| `user_decision` | Explicit owner choice, must not be overwritten | "Use SQLite, not PostgreSQL" |

User decisions are first-class. If a later owner decision supersedes an earlier one, the
`decisions` array records `supersedes_id` pointing to the earlier decision. No code or agent
may silently reverse a `user_decision` category entry.

### Verification-by-claim

Each `acceptance` item has a `claim` (what is being proved) and ties to requirements via
`requirement_ids`. The `verification_matrix` makes the mapping explicit: every requirement
must be covered by at least one AC. A CI test or proof runner can check coverage.

## Resumable

Resumable includes all standard fields plus slices, amendments, checkpoints, and an evidence
ledger. It survives handoff and session loss.

```json
{
  "schema": "artifact/plan",
  "version": 1,
  "level": "resumable",
  "meta": { … },
  "supersedes": { "plan_id": "…", "superseded_at": "…", "reason": "…" },
  "requirements": [ … ],
  "decisions": [ … ],
  "change_graph": [ … ],
  "acceptance": [ … ],
  "verification_matrix": [ … ],
  "path_ownership": { … },
  "task_graph": [
    {
      "id": "S1", "name": "…", "work": "…", "owner": "…",
      "depends_on": [], "capability_class": "standard",
      "write_paths": ["src/…"], "acceptance_ids": ["AC1"],
      "requirement_ids": ["REQ-001"], "review_required": false, "rollback_point": "…"
    }
  ],
  "amendments": [
    {
      "id": "AMD-001", "reason": "Owner changed storage backend",
      "changes": [
        { "field": "decisions", "action": "superseded", "target_id": "DEC-001",
          "detail": "DEC-002 now requires SQLite" }
      ],
      "supersedes_prior": true,
      "applied_at": "…"
    }
  ],
  "checkpoints": [
    { "id": "CK-001", "slice_id": "S1", "commit": "abc123", "summary": "S1 baseline done",
      "next_action": "start S2", "created_at": "…" }
  ],
  "evidence_ledger": [
    { "receipt_id": "RCP-001", "acceptance_id": "AC1", "status": "PASS",
      "proof_kind": "unit", "dimensions": ["outcome"], "captured_at": "…" }
  ],
  "execution_contract": {
    "mode": "automatic", "shape": "resumable", "ledger": "required",
    "strategy": "parallel", "max_agents": 5, "max_depth": 2,
    "effort_cap": "high", "authorized_final_actions": ["edit", "commit"]
  }
}
```

### Amendments

An amendment is a recorded delta that explicitly supersedes prior decisions. Every amendment:

- Has a unique `AMD-N` ID.
- Lists each changed field, action, and target.
- Sets `supersedes_prior: true` to signal that conflicting earlier decisions no longer apply.
- Records `applied_at` and `applied_by` for audit.

No code or agent may accept a silent conflict between an amendment and the original plan.
When an amendment supersedes a decision, that decision's `superseded_by` field should
reference the superseding decision's ID.

### Checkpoints

Checkpoints allow session recovery. Each records:
- The slice that was checkpointed.
- The commit hash at checkpoint time.
- The next action to resume with.
- A summary of what was completed.

### Evidence ledger

The evidence ledger accumulates proof receipts. Each receipt ties to an acceptance criterion
and records PASS/FAIL/BLOCKED. On resume, the ledger shows what is already proved and what
still needs evidence.

## Questions

Ask only questions whose answer materially changes architecture, scope, compatibility,
migration, behavior, proof level, or an irreversible decision.

All other questions are answerable from the repository. Read code, schemas, logs, tests,
and documentation before asking. Record meaningful unresolved questions in
`unresolved_questions` with their impact category. Open questions in `intent.open_questions`
are lighter-weight — use `unresolved_questions` for the material ones.

## Compatibility with old format

The old plan-artifact-template.md defined 8 prose sections. The new portable plan contract
replaces it. Any tool or script referencing `plan-artifact-template.md` should be updated
to reference `portable-plan-contract.md` or the schemas.

The `.agent/plans/*/compiled.json` files use a different PAF format (schema version 2, phases,
deliverables). These are not affected — they are production plan artifacts from prior work.
Only new plans use the portable contract.

## Schema

All plans must validate against `schemas/plan.schema.json`. Use:

```bash
python -m jsonschema -i plan.json schemas/plan.schema.json
```
