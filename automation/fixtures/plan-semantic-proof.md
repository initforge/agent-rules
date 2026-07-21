---
plan_id: "fixture-semantic-proof-20260721"
schema_version: 2
revision: 0
workflow_mode: execution
status: READY
repo: agent-rules
lane: normal
risk_flags: []
context/5fedu: missing
primary_skills: [plan-and-handoff]
preferred_tier: L0
plan_author_min_tier: L1
---

## Outcome

The semantic proof fixture validates and produces a bound receipt.

## Scope lock

**IN (deliverables — đếm N):**
- D1: Validate the semantic proof contract.

**OUT:**
- Do not edit runtime mirrors.

## Context routing

- Read `skills/plan-and-handoff/SKILL.md` before execution.

## Phases

### Phase P1 — Semantic receipt
goal: Validate one deterministic contract with non-tautological evidence.
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
  - automation/planctl.ps1 (modify — semantic receipt contract)
contracts_refs:
  - automation/evidence-profiles.json (proof registry)
template_reference: null
skills_active: [plan-and-handoff]
edge_cases:
  - Output-only commands must fail validation.
regression_map:
  - Existing schema-v1 plans remain readable.
forbidden: [runtime mirror edits]
verify_gate:
  assumptions_check: powershell -NoProfile -Command "if ((2 + 2) -ne 4) { exit 1 }"
proof_profiles: [static-change]
proof_map:
  - AC1 -> static-change.outcome, static-change.regression | kind=unit-test | env=local
exit_criteria:
  - [ ] AC1 arithmetic assertion succeeds | verify: powershell -NoProfile -Command "if ((2 + 2) -ne 4) { exit 1 }" | expected: exit=0
handoff_out:
  done: semantic receipt validated
  remaining: []
  next: Finalize plan

## Known-unknowns

None.

## Plan QA

- [x] Proof profile, dimensions, command and typed matcher are explicit.

## HANDOFF

Execute Phase P1 and finalize.
