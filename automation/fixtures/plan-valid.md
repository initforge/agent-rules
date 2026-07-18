---
plan_id: "fixture-valid-20260718"
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

The fixture validates with one independently verifiable phase.

## Scope lock

**IN (deliverables — đếm N):**
- D1: Validate the plan compiler.

**OUT:**
- Do not edit runtime mirrors.

## Context routing

- Read `skills/plan-and-handoff/SKILL.md` and the automation entrypoint.

## Phases

### Phase P1 — Validate compiler
goal: Prove a plan can be compiled without weakening executor freedom.
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
  - skills/plan-and-handoff/SKILL.md (read for routing contract)
files_touched:
  - automation/planctl.ps1 (modify — compiler entrypoint)
contracts_refs:
  - automation/planctl.ps1 (CLI actions)
template_reference: null
skills_active: [plan-and-handoff]
edge_cases:
  - Missing verify command must fail validation.
regression_map:
  - Existing Markdown plan remains the source of truth.
forbidden: [runtime mirror edits]
verify_gate:
  assumptions_check: pwsh -File automation/planctl.ps1 -Action validate -PlanPath automation/fixtures/plan-valid.md
exit_criteria:
  - [ ] AC1 plan compiles | verify: pwsh -File automation/planctl.ps1 -Action validate -PlanPath automation/fixtures/plan-valid.md | expected: PASS
  - [ ] build-green independently | verify: pwsh -NoProfile -Command "Test-Path automation/planctl.ps1" | expected: True
handoff_out:
  done: fixture is valid
  remaining: []
  next: none

## Known-unknowns

| ID | Unknown | Verify how | Phase |
|---|---|---|---|
| KU1 | Whether a runtime supports the hook | inspect doctor output | P1 |

## Plan QA

- [x] Meta, scope, phase, AC, verify and handoff are present.

## HANDOFF

Execute Phase P1 only.
