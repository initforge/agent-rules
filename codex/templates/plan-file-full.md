# <Task slice>

Status: todo
Last updated: <ISO timestamp>
Risk tier: low | medium | high
Current phase: plan | research | implement | bugfix | review

## Execution profile
- Primary profile: <planner | researcher | implementer | bugfixer | reviewer>
- Escalation profile: <planner | researcher | bugfixer-escalated | reviewer-highrisk | n/a>
- Review profile: <reviewer | reviewer-highrisk | n/a>

## Goal
- <Specific outcome for this slice>

## Context Packet
- Current behavior:
- Relevant files/symbols:
- External notes:
- Prior decisions:
- Assumptions:

## Scope
Allowed:
- path:symbol or path/dir

Not allowed:
- path:symbol or behavior
- dependency/schema/API changes unless explicitly listed

## Clean Code Guard
Allowed cleanup:
- <tiny same-scope cleanup allowed here>

Forbidden cleanup:
- <cosmetic churn / unrelated refactor / broad DRY wave>

Deadcode candidates:
- <symbol/path or n/a>

Refactor boundary:
- <what may be refactored>
- <what must stay untouched>

## Invariants
- <Behavior that must not change>
- <Security/privacy constraint>
- <UX constraint>

## Risk Register
| Risk | Type | Severity | Likelihood | Mitigation | Verify |
|---|---|---:|---:|---|---|
| <risk> | regression/security/data/concurrency/etc | high/med/low | high/med/low | <mitigation> | <verify> |

## Existing Risks / Test Gaps
- <Known missing test/env weakness>
- <Manual QA required because...>

## Approach
- Step 1:
- Step 2:
- Step 3:

Alternative rejected:
- <Alternative> - rejected because <reason>.

Estimated diff size: ~N lines / M files

## Acceptance Criteria
- Given <state>, when <action>, then <observable result>.
- Given <bad input>, when <action>, then <safe failure>.
- Given <dependency failure>, when <action>, then <recovery/error behavior>.

## Edge Cases / Error Paths
- Empty/boundary:
- Malformed input:
- Dependency failure:
- Permission/security:
- Concurrency/race:
- Performance:
- Accessibility/responsive/UI states:

## Regression Map
Changing:
- path:symbol

Must re-check:
- path:symbol - <what to verify>
- path:symbol - <what to verify>

## Verification Contract
Static:
- command:
- pass criteria:

Behavior:
- scenario:
- evidence:

Regression:
- command:
- pass criteria:

Manual/visual:
- required: yes/no
- steps:
- evidence path:

Red flags:
- <condition that requires STOP>
- <condition that requires STOP>

## Pre-done checklist
- Correctness verified
- Dead code removal has evidence
- No unused export introduced
- Duplicate logic did not increase meaningfully
- Hidden dependency did not increase
- Scope stayed inside plan

## Evidence
- pending

## Iteration log
- pending
