---
description: "SOP workflow — core, planning, execution, quality gates (Codex gốc, Composer tune)"
---

# 01-agent-workflow-sop

Gốc: gộp từ `codex/rules/` legacy. Grok/Codex/Antigravity: giữ coverage, bỏ ceremony cho task LOW.

## Core — Quy tắc lõi

**Kích hoạt:** Luôn.

**Ngôn ngữ:** Tiếng Việt có dấu; giữ tiếng Anh cho thuật ngữ kỹ thuật/code.

**Hợp đồng thực thi** (implement/fix/refactor/migrate):

1. Đọc entrypoint/index trước.
2. Đọc sâu đúng file liên quan — không đọc tràn.
3. Kiểm tra `plan/` nếu có.
4. HIGH risk / multi-domain: không execute mega-plan chưa slice.
5. Không dừng ở đề xuất nếu user muốn làm.
6. Không tự commit/push/deploy.
7. Không revert user.
8. Diff nhỏ, đúng scope.
9. Báo trước khi mở rộng scope.
10. Verify trước khi nói xong.

**Context:** Index trước (`AGENTS.md`, `00-index.md`, decision map) → rule chi tiết chỉ khi domain dính.

**Learning loop:** Feedback lặp → ghi L1 (project context) hoặc **Harness proposal** (xem `05-harness-mutation-gate.md`). **Cấm** tự sửa `grok/`, `.grok/`, `codex/rules/` trừ khi user yêu cầu rõ. Không tự commit.

**Báo cáo cuối (task không nhỏ):**

```text
Status: PASS | PARTIAL | BLOCKED
Files changed: ...
Verification: command -> pass/fail
Remaining risk: none | ...
```

---

## Planning

**Trigger plan khi:** ≥2 module, mơ hồ, MEDIUM/HIGH risk, nhiều lượt, có `plan/`, cần research map.

**Không plan khi:** LOW rõ, user muốn sửa nhanh, chỉ thảo luận.

**Locked plan** (`plan/<feature>/`):

- `00-index.md`, `01-...md`, `02-...md` — số liên tục, không skip.
- Mỗi slice verify độc lập.
- Phải có: Goal, Scope, Risk, Acceptance, Verification, Regression map, Evidence.

**Plan integrity:** Không xóa/tóm tắt phần không liên quan; không placeholder `... giữ nguyên`.

**Status:** `todo` | `doing` | `done` | `blocked` | `obsolete`. Chỉ `done` khi verify pass.

---

## Deep reasoning (có điều kiện)

**Trigger:** MEDIUM/HIGH risk, refactor lớn, debug logic nghiêm trọng, multi-module.

**Không trigger:** Task LOW 1 file, typo, rename local.

Khi bật:

- Trace call-sites (`rg`) trước khi sửa shared code.
- Data flow: input → transform → output.
- So ≥2 phương án **chỉ khi** HIGH risk hoặc architecture change; task vừa chọn 1 hướng + lý do ngắn.
- Self-criticism: worst case downstream? permission hole? simpler option?

---

## Execution

**Trigger:** implement, fix, refactor, continue, execute plan.

**Workflow:**

1. Đọc `AGENTS.md`, plan active nếu có.
2. Rule cross-check trước code DB/Auth/UI (trích rule project nếu có).
3. Mark plan `doing` → implement scope → verify → mark `done` hoặc `blocked`.
4. Verify fail: phân loại (code vs env vs plan) trước khi sửa tiếp.
5. Retry: LOW/MEDIUM max 3; HIGH max 1 rồi stop/ask.

**Hard stops:** plan shape invalid, diff >150% estimate, red flag, destructive command, scope creep auth/schema.

**Done = verified:** acceptance + verification contract + evidence. Không verify được → `PARTIAL`/`BLOCKED`.

---

## Root cause & verification

**Trigger:** bug, debug, fix, review, production verify.

- ≥90% confidence bằng evidence trực tiếp trước khi chốt.
- Tự verify bằng terminal/test/browser/log/DB khi có quyền.
- Chỉ hỏi user khi thiếu credential/approval.
- Tách Fact / Inference / Unknown.

**Quy trình:** đọc code → call path → reproduce → test → UI/browser nếu liên quan → verify sau fix.

---

## Quality gates

**Trigger:** implement, fix, review, refactor, production verify.

**Nguyên tắc:** Verify hành vi thật, không chỉ compile. Không `PASS` nếu gate cốt lõi chưa chạy mà có thể tự chạy.

**Smart verification** (`verify production hết`):

1. Đọc mapping/index trước.
2. Suy module/role/DB/UI/export/cross-flow.
3. Chạy matrix phù hợp.
4. Báo context loaded, env, gaps.

**Verification matrix (chọn theo bề mặt):**

| Bề mặt | Gate |
|---|---|
| Build | lint/typecheck/build stack |
| Unit/integration | logic, permission, validators |
| Browser/UI | click flow, responsive, overflow |
| CRUD | create/read/update/delete thật |
| Database | query trước/sau, trigger, RLS |
| Permission | đa account — không chỉ admin |
| Cross-module | data sync downstream |
| Export | tải file, format, nội dung |
| Toolbar/filter | bulk, chip, search vs data |

**Permission gate:** trace spec→code→API→DB; test read/action allowed/denied per role.

**Production gate:** đúng URL, build mới, test data an toàn, không phá data thật.

**Iteration:** Lỗi nghiêm trọng trong scope → sửa → re-verify đến PASS hoặc blocker rõ.