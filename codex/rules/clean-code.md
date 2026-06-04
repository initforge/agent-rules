# Clean Code Runtime Rules

## Trigger

Activate when writing, reviewing, refactoring, or testing code.

These rules apply across tech stacks and languages. Project-specific rules can add stricter constraints, but cannot weaken the baseline unless the user explicitly approves a trade-off.

## Philosophy

- Code is written for humans first.
- Optimize for future change.
- Easy to delete is better than clever abstraction.
- Easy to split is better than giant generic design.
- YAGNI beats premature DRY.
- Duplicate twice is acceptable; abstract around the third clear repetition.
- Behavior change and refactor should be separated when possible.
- Keep blast radius small.
- Treat clean code as a risk-control tool, not as a beauty contest.
- Prefer changes that reduce bug risk, hidden dependency, or reading cost.
- Do not chase cosmetic cleanup when it does not improve safety or maintainability.

## Structure

- Prefer feature or module ownership over global dumping ground.
- Do not create empty folders for tiny features.
- Keep public API small.
- Do not leak implementation details through barrel exports.
- Avoid broad cross-project refactor unless explicitly planned.

## Size guide

Soft thresholds:

- file: about 300 lines
- method or function: about 30 lines
- widget or component render or build: about 50 lines
- parameters: about 4 before introducing object, record, or config
- nesting: max about 3 before early return or helper extraction

Exceeding a threshold is allowed only when it improves readability.

Document trade-off if non-obvious.

## Naming

- Names should explain intent before comments explain mechanics.
- Boolean names should start with `is`, `has`, `can`, `should`.
- Async names should describe side effect.
- Do not hide I/O behind vague `getX`.

## State and async behavior

Every user action should cover:

- happy path
- validation / 4xx
- network or dependency failure

Rules:

- Do not throw raw backend errors into UI.
- Keep user input on retryable failures.
- Optimistic updates only for reversible actions.
- Pessimistic confirmation for destructive or irreversible actions.
- Avoid generic "something went wrong" when a concrete message is available and safe.

## Refactor rules

- Refactor should not change behavior.
- Behavior change requires acceptance criteria and tests.
- Avoid broad refactor before release or without verification.
- If same file fails twice with same symptom, stop and reassess root cause.
- Do not mix unrelated refactors with feature implementation.

## Cleanup classes

### Opportunistic cleanup

Allowed during normal feature/fix work when all are true:
- tiny
- same local context
- no behavior change
- reduces risk or reading cost

Examples:
- remove unused local variable
- remove dead helper in the same file
- rename local variable for clearer intent
- extract one deep conditional block in the file already being edited

### Guarded refactor

Requires:
- explicit plan
- scoped blast-radius check
- clear verification
- scope lock

Examples:
- split module
- internal API change
- deduplicate shared logic
- reduce coupling between modules

### Dead code cleanup

Dead code removal requires evidence.

Before deleting:
- check callers/importers with GitNexus when the code is shared
- use `rg` for direct text references
- check tests/runtime paths if relevant
- mark deprecated first if deletion risk is still uncertain

### Cosmetic cleanup

Avoid by default.

Examples:
- rename only for style taste
- split file just because it feels long
- broad DRY rewrite without concrete pain
- style-only churn across unrelated files

## GitNexus-guided cleanup

Use GitNexus before:
- deleting shared code
- renaming public/shared symbols
- moving files used across modules
- refactoring modules with unclear callers

Fallback to `rg` only when GitNexus is unavailable or the scope is trivially local.

## Practical questions

Before cleanup/refactor, ask:
- does this reduce bug risk?
- does this reduce future reading cost?
- does this reduce blast radius or hidden dependency?
- does this remove real dead code or dead export?
- is this still within the requested task scope?

If the answer is mostly "it just looks cleaner", do not prioritize it.

## Cleanup and artifact rules

Cleanup is allowed without asking when all are true:
- the item is clearly generated, cache, temporary output, stale one-off script, duplicate backup, or unused artifact;
- removing it cannot affect runtime behavior, build, tests, deploy, docs, or configured tools;
- references were checked with `rg` or a stronger graph/tool when shared;
- the cleanup is in the same task scope or happens before a requested push/commit.

Before deleting scripts, configs, migrations, seed files, fixtures, generated clients, or docs:
- check direct references with `rg`;
- check package scripts, CI, hooks, workflows, and README/docs;
- keep the file if it may still be an operational entrypoint;
- when uncertain, move to a planned cleanup note instead of deleting.

Gitignore policy:
- ignore secrets, local env, cache, build output, test output, logs, screenshots/videos produced during verification, downloaded export files, and temporary one-off scratch files;
- do not ignore source scripts that are part of build, test, sync, verification, migration, or runtime operation;
- do not hide generated files required by the app unless the build regenerates them deterministically and docs say so.

Protected agent/runtime files are not cleanup targets:
- `AGENTS.md`
- `.agents/AGENTS.md`
- `.agents/hooks.json`
- `.agents/rules/00-hard-activation-contract.md`
- `.agents/rules/prompt-intent-router.md`
- `.agents/rules/quality-gates.md`
- `.agents/rules/technical-debt-control.md`
- `.agents/workflows/*.md`
- `.agents/skills/*/SKILL.md`
- `.agents/5fedu/00-index.md`
- `.codex/5fedu/00-index.md`

Do not delete or gitignore these files as "unused context" or "duplicate rules". They preserve agent behavior and must only be changed intentionally.

## Testing

Prioritize:

- unit tests for pure logic, validators, mappers, state logic
- widget or component tests for visible states and interactions
- integration or E2E for critical flows

## AI-agent guardrails

- One turn = one clear task.
- Verify in the same turn.
- If plan is wrong, update plan before deviating.
- Stop when repeated fixes do not converge.
- For UI changes, use screenshot, manual, or browser evidence when relevant.

## Path-specific behavior

### Fix path

- prioritize correctness
- allow only opportunistic cleanup unless plan says otherwise

### Feature path

- keep scope tight
- refactor only when it directly unblocks the feature or reduces obvious risk in the touched area

### Bug path

- if fixes stall, switch to research before more cleanup
- do cleanup after root cause is understood

### Cleanup path

- require a concrete objective: dead code, split module, reduce coupling, remove duplication, remove dead export
- avoid vague "make it cleaner"

### Shared-module path

- GitNexus check required before delete/rename/refactor when the surface is shared
