# Quality Gates

## Trigger

Always activate before code changes.

## Purpose

Decide how much planning, verification, review, and stopping discipline is required.

## Risk classification

### LOW risk

Examples:
- docs or copy changes
- simple UI text
- test fixture
- one-file obvious bug
- grep or log summary

Behavior:
- direct edit allowed
- minimal verification
- no locked plan required unless user asks

### MEDIUM risk

Examples:
- normal feature with clear scope
- bug across 2-6 files
- scoped refactor
- test updates tied to behavior change
- feature slice with known files

Behavior:
- inspect callers and tests first
- use plan when task has multiple slices or unclear dependencies
- run relevant verification suite
- final review before done when behavior changed

### HIGH risk

Examples:
- auth, session, OAuth, permissions
- security, secrets, crypto
- payment, billing, pricing
- database schema, migration, data deletion
- concurrency, race, data loss
- production incident, deployment, infra
- broad architecture or refactor

Behavior:
- locked plan required before edit
- locked plan must be split into contiguous vertical-slice files when the work spans more than one domain
- do not execute a single large HIGH risk plan file that mixes audit, roadmap, and implementation work
- Risk Register required
- Verification Contract required
- reviewer gate required
- max 1 auto-retry
- pause after each plan file unless user explicitly says continue without pause
- never skip verification
- prefer dry-run or preview
- flag irreversible operations and wait for permission

## Verification tiers

Tier 0 - Static:
- format
- lint
- typecheck
- analyze

Tier 1 - Unit:
- validators
- pure functions
- mappers
- state notifiers
- services

Tier 2 - Integration:
- repository
- API
- state
- database
- auth flow across modules

Tier 3 - UI / Widget / E2E:
- form behavior
- navigation
- responsive
- visual states
- browser smoke

Tier 4 - Regression:
- downstream callers
- shared modules
- public API surface

Tier 5 - Risk-specific:
- migration dry-run
- rollback
- race or double-submit
- permission or security check
- staging smoke

## Verify matrix examples

Docs or copy:
- preview or spell check if needed

One-file logic:
- lint or typecheck
- unit test for touched function or module

Validator or mapper:
- valid input
- invalid input
- empty or boundary
- malformed input

Repository or API:
- success path
- network or dependency failure
- auth or permission failure if relevant
- integration or mock test

UI form:
- initial state
- invalid input
- loading state
- success state
- error state
- double-submit
- manual or visual smoke if needed

Auth, session, security:
- success
- expired token
- logout
- route guard
- no raw error leak
- no account enumeration
- regression tests

DB migration:
- dry-run
- rollback
- data integrity
- idempotency if possible

Concurrency:
- double-submit
- parallel request
- retry behavior
- idempotency

Shared module or refactor:
- caller impact
- downstream tests
- public API compatibility
- regression suite

## Risk register requirements

Every MEDIUM or HIGH plan must identify:

- planned risks
- existing risks
- emergent risks

Every HIGH plan must also identify:

- execution slices and their order
- what can be marked `done` independently
- what requires user approval before the next slice
- stop conditions that block the whole release versus only the current slice

## Evidence requirement

Do not say done without evidence:

- commands run
- pass or fail result
- behavior scenarios verified
- manual or visual artifacts if relevant
- remaining risks

## Reviewer gate

Use review when:

- HIGH risk
- behavior changed
- shared module touched
- plan had major assumptions
- tests were missing or flaky
- external docs or API behavior was uncertain

Reviewer focus:
- correctness
- regression
- missing tests
- security or data loss
- scope creep
- plan mismatch

Ignore style-only comments unless they hide real correctness risk.

## PASS / PARTIAL / BLOCKED

PASS:
- all acceptance criteria verified
- no red flag
- remaining risk none or explicitly acceptable

PARTIAL:
- useful work completed
- some verification missing
- environment, test, or tool unavailable
- non-core risk remains

BLOCKED:
- user decision needed
- plan invalid
- hard stop triggered
- missing credential or environment prevents core verification
- destructive or risky action requires confirmation
