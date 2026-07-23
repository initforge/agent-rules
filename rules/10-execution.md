---
alwaysApply: true
description: Scope, execution, verification and reporting contract.
---

# Execution

1. Read the nearest entrypoint/index and only the context matched by the request.
2. Lock explicit deliverables; use a plan for ambiguous, multi-phase or high-risk work.
3. Trace affected interfaces and consumers before changing shared behavior.
4. Verify plan assumptions against real interfaces; use `implementation-discovery` when uncertainty is material.
5. In execution mode, complete the full in-scope outcome; do not stop after the main path.
6. Verify with runner-backed evidence proportional to risk: source, tests, build, API/data/permission checks or UI flow. Ledger prose alone is not proof for a tracked plan.
7. Re-run impacted checks after fixes; report remaining proof gaps honestly.
8. If the same approach fails twice, stop repeating it and escalate or revise the plan.
9. Với tracked plan: `complete` chỉ cho `SLICE_PASS`; chỉ `finalize` sau re-audit toàn phase mới cho `PLAN_PASS`. Cấm bare `Status: PASS` khi active plan chưa `DONE`.

## When signals conflict (read in order)

1. User deliverable and explicit pivot.
2. Native plan-mode context.
3. Workflow mode and risk gate.
4. Matching skill/project router.
5. Completion gate when execution scope is locked.

## Pivot phrases (plan → execution)

implement, execute, làm đi, bắt đầu code, triển khai, sửa code, apply plan, phase N execute, ok làm, ship it.

## Workflow

- Advisory → answer in domain language; inspect adjacent facts only when they affect the answer.
- Plan mode → read-only plan artifact; no source edits before pivot.
- Execution → verify assumptions, use the matching capability, and close the locked scope.
- Continuous/full-plan execution → tự đi phần việc dependency-ready tới `PLAN_PASS`; verification cadence, reference/release contract và blocker scheduling thuộc `plan-and-handoff`, không tự dừng bằng `PARTIAL`.
- Evidence enforcement is adaptive: tiny/normal work may use a justified alternate proof; an admitted continuous or high-risk plan must satisfy its typed proof profile, artifact freshness and environment contract. A build/lint-only signal never proves a deep behavior claim.
- Use browser QA only for explicit live/manual UI proof or when non-browser evidence cannot prove the outcome.

## Linh hoạt theo tình huống (behavior bắt buộc)

- **Không máy móc:** chỉ load skill/rule/hook khớp signal hiện tại; Q&A nhỏ / read-only / tiny fix → không ép plan-and-handoff, completion-ledger, hay full discovery.
- **Cohesion:** đọc skill/rule **một lượt liền mạch** trong file sở hữu — tránh bắt owner/agent nhảy 3+ references trước khi hành động (trừ deep-dive owner yêu cầu).
- **Hooks/audit:** advisory backstop — ghi nhận WARN, sửa khi chạm harness; không dừng product work vì oversize skill self-contained.
- **Escalate có chừng:** tier/slice/ledger khi scope thật sự multi-phase hoặc ≥3 AC — không over-apply cho bug 1 dòng.

