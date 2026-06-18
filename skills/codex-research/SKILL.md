---
name: codex-research
description: Use this skill when Codex needs structured research before coding or while a bug fix is stalled. Trigger for latest docs, release notes, changelog review, external platform behavior, codebase exploration, option comparison, source-backed decision support, or difficult bug fixes that need repo facts plus external documentation before another implementation attempt.
---

# Codex Research

Codex Research is the primary research layer inside Codex.

Use it to gather facts, compare options, and write a reusable research note before implementation.

## Trigger

Use this skill when:
- the user asks to research or compare
- latest docs or platform behavior matters
- a bug keeps looping without resolution
- external platform documentation must be read
- architecture or impact is unclear
- a decision needs evidence before coding

Do not use it for:
- tiny local edits
- direct implementation with obvious context
- final code patch ownership

## Research order

1. `rg` and targeted local reads
2. GitNexus when usable for graph/impact/process context
3. `web` for latest or external facts

## Output contract

Write a note under:
- `plan/<feature>/research/*.md`
- or `plan/<feature>/review/*.md`

Expected sections:
- Summary
- Evidence
- Risks
- Recommendation
- Unknowns

## Profile

Preferred native profile:
- `researcher`

Escalation:
- use `planner` when the task becomes large architecture work
- use `bugfixer` when the research is in service of an unresolved bug

## Related references

Read:
- `references/usage.md`
