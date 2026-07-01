---
name: finish-to-completion
description: Anti-handoff execution contract. ULTRA-SENSITIVE Turn-0 — activate on implement, fix, bugfix, refactor, migrate, continue, tiếp tục, làm đi, làm hết, xử lý, hoàn thành, build, add, update, execute, or any task where user expects work done not suggestions. Read SKILL.md before stopping or claiming PASS. Bans GAP footers, false choices, and deferred work within scope.
---

# Finish To Completion

Skill này chống **bệnh chừa việc**: làm một phần → liệt kê còn lại → hỏi user. Rule cứng: `07-finish-to-completion.md`.

## Skill activation (Turn-0)

Mọi task **thực thi** (không chỉ hỏi/tư vấn):

```text
Skill scan: finish-to-completion (implement/fix/continue)
Skill activated: finish-to-completion
```

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
| `BLOCKED` | Credential/quyền/env/quyết định — không tiến được |

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