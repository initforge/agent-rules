# Planning Rules

## Trigger

Activate planning when:

- task touches 2 or more modules
- task is ambiguous
- task is MEDIUM or HIGH risk
- task may require multiple turns
- user asks for plan / "lap plan" / "chia task"
- repo already has `plan/`
- implementation must survive context compaction
- external research or codebase map must be preserved

Do not create locked plan when:

- user is only discussing
- task is LOW risk and obvious
- user explicitly asks for a quick direct edit
- approach is not converged yet

## Purpose

A plan is an executable contract.

A plan is:
- map
- scope lock
- context packet
- risk register
- verification contract
- handoff memory

A plan is not:
- transcript
- raw research dump
- full design document
- place to paste full source files
- place to paste full test logs

## Draft vs locked plan

### Draft plan

Use during discussion.

Rules:
- Can be in chat or `plan/<feature>/draft.md`.
- Not executable.
- Implementer must not execute draft plans.
- Can be heavily revised.

### Locked plan

Use when the user approved the approach or asked to implement.

Rules:
- Stored under `<project_root>/plan/`.
- Executable by Codex.
- Must include status, scope, acceptance criteria, verification, and stop conditions.
- Must be updated before implementation deviates.

## Folder layout

For multi-stage work:

```text
plan/<feature>/
├─ 00-index.md
├─ 01-<vertical-slice>.md
├─ 02-<vertical-slice>.md
├─ 03-<vertical-slice>.md
├─ research/
├─ review/
├─ decisions.md
└─ handoff.md
```

For one small plan:

```text
plan/<slug>.md
```

## Granularity

Prefer vertical slices, not arbitrary technical layers.

Good:
- `01-map-current-auth-flow.md`
- `02-add-reset-request-service.md`
- `03-add-reset-password-ui.md`
- `04-regression-and-manual-qa.md`

Bad:
- `01-database.md`
- `02-repository.md`
- `03-ui.md`
- `04-tests.md`

Each plan file should be independently verifiable or clearly explain why not.

## Locked plan must include

- Goal
- Context Packet
- Scope: allowed and not allowed
- Invariants
- Risk Register
- Existing Risks / Test Gaps
- Approach
- Estimated diff size
- Acceptance Criteria
- Edge Cases / Error Paths
- Regression Map
- Verification Contract
- Red flags
- Evidence
- Iteration log

## Context Packet rule

A Context Packet should tell the implementer what to read and why.

It should include:
- current behavior summary
- relevant files and symbols
- linked research notes
- prior decisions
- assumptions
- non-goals

It should not include:
- full files
- raw logs
- full docs copy
- large pasted code

## Minor amendment allowed

Codex may update the active plan and proceed when:

- discovered path or symbol differs but scope is unchanged
- verify command needs package-manager or local adjustment
- test path differs but acceptance criteria remain unchanged
- diff estimate changes slightly but remains under hard-stop budget
- external research note path changes
- stale file name is corrected

Must log amendment in `Iteration log`.

## Major amendment requires stop

Stop and report `BLOCKED` when:

- behavior, API, or schema must change
- production dependency must be added
- auth, payment, security, database migration, or data deletion is touched unexpectedly
- allowed files expand materially
- acceptance criteria must be removed or weakened
- red flag is triggered
- same failure repeats after retry budget
- task direction changes materially

## Plan lifecycle

Status values:
- `todo`
- `doing`
- `done`
- `blocked`
- `obsolete`

Rules:
- `todo`: not started
- `doing`: actively being worked
- `done`: acceptance + verification + evidence passed
- `blocked`: needs user decision or environment/tool missing
- `obsolete`: superseded/canceled, keep file and write reason

Before ending a turn that touched a plan:

- update `Status:`
- update `Last updated:`
- update `Evidence`
- update `Iteration log`

## Compact resilience

Before starting each plan file:
- re-read `00-index.md`
- re-read the active plan
- re-read `decisions.md`
- re-read `handoff.md`
- read linked `research/` and `review/` notes

After context compaction or long interruption:
- re-read the active plan's `Iteration log`
- do not rely on memory alone
