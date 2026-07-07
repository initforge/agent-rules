---
name: plan-and-handoff
description: Use when the user gives a long or multi-part task, uses plan mode first, asks for phased work, or needs a task decomposed before execution. Trigger on plan dài, nhiều phase, đại trùng tu, làm từng bước, handoff, chia nhỏ task, /goal, khảo sát repo cho plan, viết plan cho gemini, viết plan cho flash, plan cho agent khác, plan mode, báo cáo theo mệnh đề, phân tích plan, review plan, PAF, plan artifact, Plan Architect, Plan Scribe. Do NOT use for single small fixes, pure Q&A, or external web/docs research only — use researcher.
---

# Plan and Handoff

**Ý đồ:** Task dài = **1 phase / 1 session**; output **PAF** + HANDOFF §8; tier routing [`references/capability-tier-routing.md`](references/capability-tier-routing.md).

**`/goal` + treo máy:** một nguồn — [`references/goal-autopilot.md`](references/goal-autopilot.md) (plan → execute → artifact Antigravity → task card). Skill này = decision tree + paths; không lặp prose autopilot ở đây.

## Which path? (decision tree — đọc trước)

1. **Web/docs compare only?** → STOP. Use `researcher` (L0+). Not this skill.
2. **Owner pasted plan / review gaps?** → Path **D** Plan Reviewer (`min_tier L1`)
3. **Owner spec fully locked, PAF format only?** → Path **B** Plan Scribe (`L0`)
4. **Survey repo + cut phases?** → Path **A** Plan Architect (`min_tier L1`, prefer L2)
5. **Pivot phrase + HANDOFF present?** → Path **C** → `finish-to-completion` owns execute
6. **Plan cũ đã execute một phần, kẹt <100%?** → Path **E** Gap-closure (audit → chỉ-còn-thiếu)

## Use when

- User dumps many requirements (plan mode)
- Task spans structure + code + docs + multiple domains
- Continuing from previous session handoff

## Do NOT use when

- Single-file typo → tiny execution
- User confirmed execute for current slice only → `finish-to-completion` directly
- External research only → `researcher`

## Path A — Plan Architect (default `plan-authoring`, Plan-first HB-1)

1. Read-only verify (`implementation-discovery`)
2. Lock scope; cut phases with tier fields per [`plan-artifact-template.md`](references/plan-artifact-template.md)
3. Context routing subset + template paths (5fedu → `module-mapping.md`)
4. Classify lock-at-plan vs Known-unknowns
5. Output PAF `READY` + HANDOFF §8 for **P1 only**
6. **HB-1:** no repo edits. No step C unless pivot in same message (HB-2)

## Path B — Plan Scribe (`plan-authoring`, L0)

- Owner spec **already locked** — normalize to PAF only
- **Do NOT** invent phases, templates, or assumptions
- Output `DRAFT` + gaps, or `READY` if Plan QA §7 passes
- L0 models (Flash, DeepSeek, Minimax, …) OK

## Path C — Execute handoff (`execution`, HB-2)

Delegates to **`finish-to-completion`** — start `phase.preferred_tier` (default L0); respect `min_tier`, `allowed_tiers`, `force_tier`; escalate per [`capability-tier-routing.md`](references/capability-tier-routing.md). Model that planned **may** execute if tier allows.

## Path D — Plan Reviewer (`plan-review`, HB-1)

- Input: PAF or pasted plan
- Output: gap list (missing sections, weak verify, wrong template, risk flags)
- **Do NOT** rewrite full plan unless owner asks
- **Do NOT** execute

## Path E — Gap-closure (`execution`, chống "tường 90%")

Audit delta chưa xong → gap checklist (format `completion-ledger.md`) → giao **từng slice** ≤~10 AC qua `finish-to-completion`. Operational procedure → `finish-to-completion/references/slice-gate-protocol.md` §8. MISS-SWEEP → SGP §8 step 4 (`goal-autopilot.md` Phần 2 cho `/goal` full-plan loop). Cấm: re-run full plan; dump GAP rồi dừng.

## HANDOFF format

Single source: PAF **§8** in [`plan-artifact-template.md`](references/plan-artifact-template.md) — do not redefine here.

## Phrase bank

plan dài, nhiều phase, đại trùng tu, handoff, chia nhỏ, tiếp tục phase, session mới, PAF, review plan

## Platform-neutral

`.cursor/plans/` (Cursor) or in-chat — copy HANDOFF to Codex/Antigravity for execute session.
