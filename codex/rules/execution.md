# Execution Rules

## Trigger

Activate execution when the user says:

- implement
- lam
- code
- fix
- refactor
- create
- migrate
- lam tiep
- continue
- execute plan
- apply the plan

## Workflow

1. Read project `AGENTS.md`, `README.md`, `CONTRIBUTING.md` if present.
2. If `plan/` exists:
   - read `plan/00-index.md` if present
   - read the active `todo` or `doing` plan file
   - read relevant `decisions.md`
   - read relevant `handoff.md`
   - read linked `research/*.md`
   - read linked `review/*.md`
3. Validate the active plan shape before editing:
   - numbered execution files must use contiguous `01`, `02`, `03` order under a feature folder when the task has multiple slices
   - do not execute a large multi-domain plan stored as one numbered file
   - HIGH risk work must have per-slice scope, acceptance criteria, verification contract, red flags, evidence, and iteration log
   - when a repo has `plan/`, run `C:\Users\DELL\.codex\scripts\validate-plan-structure.ps1 -PlanRoot <repo>\plan` before executing plan-driven work
   - if the plan shape is invalid, restructure or report `BLOCKED` before implementation
4. Mark active plan file `Status: doing`.
5. Implement only the allowed scope.
6. Run the plan's verification commands.
   - If verification is incomplete, tự mở rộng kiểm tra trong phạm vi quyền hiện có.
   - Chỉ hỏi người dùng khi thiếu quyền, credentials, dữ liệu thật, môi trường nhạy cảm, hoặc approval cho hành động rủi ro.
   - Không báo done chỉ vì code đã sửa; phải verify behavior sau sửa bằng test/tool/browser/log/check phù hợp.
7. If verification fails, classify failure before fixing:
   - my code caused it -> fix and retry
   - test, env, or flaky issue -> do not change code blindly; report
   - plan wrong or insufficient -> update plan and stop unless minor amendment
8. Mark `done` only when acceptance criteria, verification contract, and evidence pass.
9. Update `00-index.md`, `handoff.md`, and `Iteration log`.

## Done means verified

A plan file can be marked `done` only when:

- all acceptance criteria are satisfied
- verification contract passed
- evidence is recorded
- regression map was checked
- no red flag triggered
- remaining risks are either none or explicitly documented

If verification cannot be run:
- do not report `PASS`
- use `PARTIAL` or `BLOCKED`
- explain missing environment, tool, or credential

## Retry budget

- LOW / MEDIUM: max 3 retries per verification step
- HIGH: max 1 retry, then stop or ask user
- same error with same symptom repeated twice -> stop and report

## Hard stops

Stop without further auto-fix if:

- active plan shape violates planning rules and cannot be corrected as a minor amendment
- diff exceeds estimated diff size by about 150%
- no estimate and diff exceeds 500 changed lines
- red flag from plan is triggered
- same failure repeats
- destructive command would run
- production dependency is needed
- schema, API, auth, or security behavior changes outside scope
- user interrupts or changes priority
- test failure cannot be tied to current change
- verification environment is missing

## Interrupt handling

If user says stop / khoan / lam cai khac:

- mark active plan `Status: blocked`
- append reason and last completed step to `Iteration log`
- write or update `handoff.md`
- do not leave state ambiguous

## Final report

Use:

```text
Status: PASS | PARTIAL | BLOCKED

Files changed:
- path/file1
- path/file2

Verification:
- <command/test> -> pass/fail
- <scenario/manual check> -> pass/fail

Iteration:
- N attempts total, M retries
- key fix: <one-line summary>

Remaining risk:
- none | <short bullet>

Plan files:
- plan/<feature>/01-...md -> done/blocked
- plan/<feature>/02-...md -> done/blocked
```
