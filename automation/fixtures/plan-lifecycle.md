---
plan_id: "fixture-lifecycle-20260721"
revision: 0
workflow_mode: execution
status: READY
repo: agent-rules
lane: normal
context/5fedu: missing
primary_skills: [plan-and-handoff]
preferred_tier: L0
plan_author_min_tier: L1
---

## Outcome

Both lifecycle phases complete with exact source and ledger coverage.

## Scope lock

**IN (deliverables — đếm N):**
- D1: Implement phase one.
- D2: Implement phase two.

**OUT:**
- Do not edit runtime mirrors.

## Source coverage

- S001 -> D1 | Implement phase one
- S002 -> D2 | Implement phase two
- S003 -> CONTEXT | Preserve runtime mirrors
- S004 -> OUT(owner excluded deployment) | Deploy production runtime

## Context routing

- Read `skills/plan-and-handoff/SKILL.md` before execution.

## Phases

### Phase P1 — First contract
goal: Complete the first independently verifiable contract.
depends_on: []
preferred_tier: L0
min_tier: L0
allowed_tiers: [L0, L1]
escalate_if: [verify_fail_2x]
force_tier: null
tier_used: null
escalation_reason: null
scope_lock: [D1]
context_files:
  - skills/plan-and-handoff/SKILL.md (read for lifecycle contract)
files_touched:
  - automation/planctl.ps1 (modify — phase lifecycle)
contracts_refs:
  - automation/planctl.ps1 (CLI actions)
template_reference: null
skills_active: [plan-and-handoff]
edge_cases:
  - Completion before start must fail.
regression_map:
  - Phase two remains pending.
forbidden: [runtime mirror edits]
verify_gate:
  assumptions_check: pwsh -NoProfile -Command "Write-Output P1"
exit_criteria:
  - [ ] AC1 phase one proof | verify: pwsh -NoProfile -Command "Write-Output P1" | expected: P1
handoff_out:
  done: phase one is complete
  remaining: [P2]
  next: Execute P2

### Phase P2 — Second contract
goal: Complete the dependent second contract.
depends_on: [P1]
preferred_tier: L0
min_tier: L0
allowed_tiers: [L0, L1]
escalate_if: [verify_fail_2x]
force_tier: null
tier_used: null
escalation_reason: null
scope_lock: [D2]
context_files:
  - skills/plan-and-handoff/SKILL.md (read for lifecycle contract)
files_touched:
  - automation/test-planctl.ps1 (modify — lifecycle fixtures)
contracts_refs:
  - automation/planctl.ps1 (CLI actions)
template_reference: null
skills_active: [plan-and-handoff]
edge_cases:
  - Finalize before all phases complete must fail.
regression_map:
  - Phase one completion remains valid while its contract is unchanged.
forbidden: [runtime mirror edits]
verify_gate:
  assumptions_check: pwsh -NoProfile -Command "Write-Output P2"
exit_criteria:
  - [ ] AC1 phase two proof | verify: pwsh -NoProfile -Command "Write-Output P2" | expected: P2
handoff_out:
  done: phase two is complete
  remaining: []
  next: Finalize plan

## Known-unknowns

| ID | Unknown | Verify how | Phase |
|---|---|---|---|
| KU1 | Hook adapter availability | run hook wire-format tests | P2 |

## Plan QA

- [x] Source, deliverable, phase and acceptance coverage are explicit.

## HANDOFF

Execute all phases in dependency order and finalize.
