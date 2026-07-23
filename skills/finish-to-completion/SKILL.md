---
name: finish-to-completion
description: Anti-handoff execution for a locked slice of work. Use when user expects implementation done (fix, refactor, migrate, làm hết, hoàn thành) on a scope already defined — not for dumping a long multi-phase plan. Do NOT activate Turn-0 on pure Q&A, docs-only review, or when plan-and-handoff should decompose first (plan dài, đại trùng tu, nhiều phase). Read SKILL.md before claiming PASS.
routing: {"signals":["làm đi","implement","fix","refactor","migrate","hoàn thành","execute"],"intent_signals":["execution"],"excludes":["plan-only","pure q&a"],"priority":10,"loads":["skill:finish-to-completion"],"supports":["implementation-discovery","clean-code"],"project_scope":"","platform_scope":"all","max_route_tokens":1500,"default":false}
---

# Finish To Completion

## Skill activation (Turn-0)

Chỉ khi scope **đã khóa** (≤1 phase hoặc user giao slice rõ) và **mode=`execution`**.

**Hard boundaries (HB-1, HB-3):**
- Do not activate when mode is plan-authoring or plan-review (HB-1).
- Do not activate when deliverable is plan/report for another agent unless pivot phrase present (HB-2).
- Do not treat pasted [Plan] sections as locked code deliverables (HB-3).
- Prefer plan-and-handoff for plan modes.

Mode=`execution` + scope đã khóa → skill active; tiny/Q&A bỏ qua skill này.

HB-4: scope ≥2 files → lane tối thiểu `normal` (không `tiny`); **không** bắt buộc `plan-and-handoff`. Task dài/multi-phase chưa cắt slice → `plan-and-handoff` trước execution.

## Step 0 — Slice Gate (trước Turn-0)

Khi ≥3 AC, PAF phase, Path E, hoặc HANDOFF slice → đọc **bắt buộc** [`references/slice-gate-protocol.md`](references/slice-gate-protocol.md) và chạy Gates A–D. Bỏ qua với `tiny` (<3 AC, 1 file).

## Baseline

Một task được giao = cam kết **đóng scope**; partial handoff là output hỏng.

## Turn-0 — Scope Lock

1. Parse request → liệt kê deliverable (đếm N).
2. Không thêm deliverable ngầm (full E2E matrix, đóng mọi GAP, combinatorial) trừ khi user yêu cầu.
3. `TodoWrite` mỗi deliverable nếu N ≥ 2.

```text
Scope lock: N = [d1, d2, ...]
```

## Execution Loop

Trước vòng lặp: chạy **verify gate** (`implementation-discovery`) — đối chiếu giả định plan vs repo/interface/DB/template thật; báo lệch trước khi sửa.

```text
FOR each deliverable: implement → cheap dependency guard if needed → mark implemented.
Then batch-verify feasible work; fix and re-run impacted proof.
```

**Không** dừng sau "phần chính". **Không** chuyển sang báo cáo khi còn item `pending`.

## Verify Before Claim

Trước `PASS`:

1. Chạy command chứng minh (test/lint/build/browser) — fresh trong session.
2. Đọc output đầy đủ.
3. Cross-check deliverable count: done == N.
4. Owner yêu cầu deep/manual/UI QA → mid-flow combo `qa-skills` + `browser-qa`; không tự nở full exploratory matrix nếu scope không yêu cầu.

Không evidence → không `PASS`. Không "should work".

Với tracked PAF, gate này chỉ đóng phase và tạo `SLICE_PASS`; cấm biến slice sạch thành toàn-plan PASS. `PLAN_PASS` thuộc `planctl finalize` sau khi mọi phase/source/deliverable và ledger được re-audit.

**AC-gate (≥3 AC hoặc PAF phase):** operational contract → [`references/slice-gate-protocol.md`](references/slice-gate-protocol.md); AC format → [`references/completion-ledger.md`](references/completion-ledger.md). Trước `PASS`: Gate D machine checks — ledger còn `[ ]` → continue working.

## Banned Patterns (hard fail)

**Never end with:**

- GAP / remaining / backlog list như kết quả hợp lệ
- "Bước tiếp theo…" / "Bạn có thể chạy…"
- "Bạn muốn A hay B?" (unless BLOCKED)
- "Owner defer" khi agent còn làm được
- Bảng "đã làm" + section "còn lại" rồi dừng

**Never do:**

- Mô tả lệnh thay vì chạy lệnh (khi có shell)
- PASS khi verify chưa chạy
- Mở scope lớn → làm subset → dump phần còn

## Terminal States

| Status | Khi |
|---|---|
| `PASS` | N/N deliverables done + verify + evidence |
| `PARTIAL` | Chỉ progress nội bộ của continuous plan; không phải terminal response |
| `BLOCKED` | Credential/quyền/env/quyết định must-not-self-decide — không tiến được; ghi blocker (`open-questions.md` nếu có); escape-hatch theo `implementation-discovery` |

Với continuous PAF, terminal chỉ là `PLAN_PASS`, evidence-backed plan-wide `BLOCKED`, hoặc `ABORTED/ENFORCEMENT_EXHAUSTED`; một blocker cục bộ phải chạy phần độc lập tiếp theo.

## Miss Prevention Checklist

Trước final message:

- [ ] Scope lock: all N done?
- [ ] Mỗi file/function trong scope đã chạm?
- [ ] Verify đã chạy và pass?
- [ ] Không TODO mới trong scope?
- [ ] Không banned pattern trong prose?
- [ ] Không hỏi user việc agent tự làm được?

Fail bất kỳ → **continue working**, không respond final.

## Token / Multi-turn

- Same session: keep calling tools until PASS/BLOCKED.
- Hard pause only: `[PAUSED — X/N — next: <item>]`
- "tiếp tục"/"làm đi": resume item, no recap.

## Final Echo (normal/high-risk execution)

```text
Scope lock: N/N done
Verification: <cmd> → <outcome>
Miss check: pass
Status: PASS | PARTIAL | BLOCKED
Blocker: (if not PASS)
```

Tiny: chỉ `Status` + 1 dòng verify. Không Skill-scan theater trên Q&A/plan-only.
