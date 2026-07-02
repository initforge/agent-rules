---
name: plan-and-handoff
description: Use when the user gives a long or multi-part task, uses plan mode first, asks for phased work, or needs a task decomposed before execution. Trigger on "plan dài", "nhiều phase", "đại trùng tu", "làm từng bước", "handoff", "chia nhỏ task", or task scope clearly exceeding one session. Do NOT use for single small fixes or pure Q&A.
---

# Plan and Handoff

**Ý đồ:** Task dài thực thi **1 phase / 1 session**; plan + handoff nén context, không nhồi hết chat.

## Use when

- User dumps many requirements at once (plan mode)
- Task spans structure + code + docs + multiple domains
- Continuing work from a previous session

## Do NOT use when

- Single-file typo or one-line fix
- Pure explanation/review without execution plan
- User already gave a narrow slice with clear scope

## Steps

1. **Lock scope** — list deliverables; refuse scope creep in same phase.
2. **Cut phases** — each phase: goal, files touched, verify command, exit criteria.
3. **Write plan** in Cursor plan mode (`.cursor/plans/`) or as an in-chat structured plan with sections: Mục tiêu, Phases, Verify, Assumptions, **Known-unknowns**.
4. **Classify decisions** — `lock-at-plan` (scope, convention, credentials policy, permission rules owner đã chốt) vs `discover-at-implement` (call sites, template gaps, orphaned data, field mismatch, runtime-only bugs). Cái sau vào **Known-unknowns**; không giả vờ chốt.
5. **Write handoff** in-chat or at end of plan artifact:
   - Done
   - Decisions locked
   - Remaining
   - Next step (one phase only)
6. Execute **current phase only**; trước khi code phase, chạy verify gate (`implementation-discovery`); end with handoff update, not "bước tiếp theo?" footer.

## Phrase bank (recall)

plan dài, nhiều yêu cầu, đại trùng tu, làm từng phase, chia nhỏ, handoff, tiếp tục phase, session mới

## Platform-neutral

Plan/handoff dùng `.cursor/plans/` (Cursor) hoặc in-chat — mang qua Codex/Antigravity được khi handoff được copy vào session mới.
