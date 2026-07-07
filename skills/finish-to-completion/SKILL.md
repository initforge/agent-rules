---
name: finish-to-completion
description: Anti-handoff execution for a locked slice of work. Use when user expects implementation done (fix, refactor, migrate, làm hết, hoàn thành) on a scope already defined — not for dumping a long multi-phase plan. Do NOT activate Turn-0 on pure Q&A, docs-only review, or when plan-and-handoff should decompose first (plan dài, đại trùng tu, nhiều phase). Read SKILL.md before claiming PASS.
---

# Finish To Completion

Skill này chống **bệnh chừa việc**: làm một phần → liệt kê còn lại → hỏi user. Bổ sung: `rules/10-execution.md` và skill này (không có file `07-finish-to-completion.md` riêng).

## Skill activation (Turn-0)

Chỉ khi scope **đã khóa** (≤1 phase hoặc user giao slice rõ) và **mode=`execution`**.

**Hard boundaries (HB-1, HB-3):**
- Do not activate when mode is plan-authoring or plan-review (HB-1).
- Do not activate when deliverable is plan/report for another agent unless pivot phrase present (HB-2).
- Do not treat pasted [Plan] sections as locked code deliverables (HB-3).
- Prefer plan-and-handoff for plan modes.

Nếu thoả mãn các điều kiện thực thi (mode=`execution`):
```text
Skill scan: finish-to-completion (locked slice)
Skill activated: finish-to-completion
```

HB-4: scope ≥2 files → lane tối thiểu `normal` (không `tiny`); **không** bắt buộc `plan-and-handoff`. Task dài/multi-phase chưa cắt slice → `plan-and-handoff` trước execution.

## Step 0 — Slice Gate (trước Turn-0)

Khi ≥3 AC, PAF phase, Path E, hoặc HANDOFF slice → đọc **bắt buộc** [`references/slice-gate-protocol.md`](references/slice-gate-protocol.md) và chạy Gates A–D. Bỏ qua với `tiny` (<3 AC, 1 file).

## Baseline

Một task được giao = một cam kết **đóng scope**. Partial handoff là output hỏng.

Ưu tiên: **hoàn thành scope** > báo cáo đẹp > kết turn nhanh.

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
FOR each deliverable in scope:
  implement
  verify (if applicable)
  mark done
UNTIL all done OR hard BLOCKED
```

**Không** dừng sau "phần chính". **Không** chuyển sang báo cáo khi còn item `pending`.

## Verify Before Claim

Trước `PASS`:

1. Chạy command chứng minh (test/lint/build/browser) — fresh trong session.
2. Đọc output đầy đủ.
3. Cross-check deliverable count: done == N.

Không evidence → không `PASS`. Không "should work".

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
| `PARTIAL` | Đã hết fallback; thiếu đúng 1 thứ; blocker 1 dòng |
| `BLOCKED` | Credential/quyền/env/quyết định must-not-self-decide — không tiến được; ghi blocker (`open-questions.md` nếu có); escape-hatch theo `implementation-discovery` |

Không trạng thái "60% xong, phần còn tùy bạn".

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

## Final Echo (MEDIUM/HIGH)

```text
Skill scan: finish-to-completion
Skill activated: finish-to-completion
Scope lock: N/N done
Verification: <cmd> → <outcome>
Miss check: pass
Status: PASS | PARTIAL | BLOCKED
Blocker: (if not PASS)
```

## Quick Check

- User có thể dùng kết quả ngay không?
- Còn câu nào bắt user "đẩy thêm một nhịp" không?
- Nếu có → chưa xong, tiếp tục.