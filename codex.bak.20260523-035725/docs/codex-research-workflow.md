# Codex Research Workflow

## Purpose

Codex Research is the primary research layer.

It replaces any dependency on Antigravity or other external research-first helpers in the main operating model.

## When to trigger Codex Research

Trigger when:
- the user asks to research, compare, evaluate, explore, or review before coding
- latest docs, release notes, changelogs, or platform behavior may matter
- a bug fix keeps stalling after one or two direct implementation attempts
- the task touches an external platform and platform docs must be checked
- the repo is unfamiliar and architecture or call flow must be understood first
- a decision needs source-backed evidence before implementation

Do not trigger when:
- the task is a tiny local edit
- local `rg` plus one or two file reads are enough
- the user clearly asked for direct implementation only

## Research order

1. Local known context
   - `rg`
   - targeted file reads
2. Shared code and impact context
   - GitNexus when usable
3. External latest behavior
   - `web`, preferring official docs and primary sources

## Output contract

Every substantial research pass should produce a note, preferably under:

- `plan/<feature>/research/<topic>.md`
- `plan/<feature>/review/<topic>.md`

The note should contain:
- Summary
- Evidence
- Risks
- Recommendation
- Unknowns

## Model/profile mapping

Preferred profile:
- `researcher`

Default model:
- `gpt-5.4`
- reasoning effort: `medium`

Escalate to planner or reviewer-highrisk only when the task becomes architecture-heavy or high-risk.

## Bug-fix escalation rule

If a bug fix remains unresolved after one or two direct fix attempts:
- switch from implement mode to research mode
- gather repo facts and external platform facts
- write a research note
- then return to bugfix or implementation mode
