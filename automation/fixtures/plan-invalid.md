---
plan_id: "fixture-invalid-20260718"
repo: agent-rules
---

## Scope lock
## Context routing
## Phases

### Phase P1 — Invalid phase
goal: Missing semantic proof.
depends_on: [P2]
scope_lock: [D1]
context_files:
  - missing-context.md
files_touched:
  - automation/planctl.ps1 (modify)
contracts_refs:
  - automation/planctl.ps1
edge_cases:
  - Missing verify.
regression_map:
  - Must not regress.
forbidden: [scope creep]
verify_gate:
  assumptions_check: <command>
exit_criteria:
  - [ ] AC1 vague improvement

## Known-unknowns
## Plan QA
## HANDOFF
