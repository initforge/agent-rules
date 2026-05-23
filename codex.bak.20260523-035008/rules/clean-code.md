# Clean Code Runtime Rules

## Trigger

Activate when writing, reviewing, refactoring, or testing code.

## Philosophy

- Code is written for humans first.
- Optimize for future change.
- Easy to delete is better than clever abstraction.
- Easy to split is better than giant generic design.
- YAGNI beats premature DRY.
- Duplicate twice is acceptable; abstract around the third clear repetition.
- Behavior change and refactor should be separated when possible.
- Keep blast radius small.

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
