# <Feature> - index

Status: todo
Risk tier: low | medium | high
Last updated: <ISO timestamp>

## Profile plan
- Planning profile: planner
- Research profile: researcher
- Implementation profile: implementer
- Bugfix profile: bugfixer
- Escalated bugfix profile: bugfixer-escalated
- Review profile: reviewer
- High-risk review profile: reviewer-highrisk

## Goal
- <What the feature/fix/refactor must accomplish>

## Non-goals
- <What must not be changed>

## Execution order
1. 01-<slice>.md - status: todo - last updated: <ts>
2. 02-<slice>.md - status: todo - last updated: <ts>
3. 03-<slice>.md - status: todo - last updated: <ts>

Numbering rule:
- Keep slice files contiguous: `01`, `02`, `03`, no skipped or sparse numbers.
- If this plan replaces a large audit or roadmap file, link that source under Shared context and keep execution in these slice files.

## Dependencies
- 02 depends on 01.
- 03 depends on 02.

## Cross-references
- 01 and 02 share: path:symbol
- 02 and 03 share: path:symbol

## Shared context
- Main module: path:symbol
- Tests: path/dir
- External notes: research/<file>.md
- Prior decisions: decisions.md

## Global invariants
- <Behavior that must not change>
- <Security/privacy constraints>
- <UX constraints>

## Global red flags
- Stop if <condition>.
- Do not touch <module> without approval.
- Do not add production dependency without approval.

## Progress notes
- pending
