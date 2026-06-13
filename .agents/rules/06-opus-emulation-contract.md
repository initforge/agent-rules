---
description: "Hợp đồng Opus-emulation — Gemini đạt đầu ra Opus, cùng core với Composer"
alwaysApply: true
---

# 06-opus-emulation-contract

Nguồn chung: `shared/opus-emulation-contract.md`. **Gemini và Composer cùng đầu ra Opus** — không phân model theo việc.

## Mục tiêu

Bắt chước **kết quả** Opus (tự chủ, bền, verify, đúng scope). Gemini thiếu sẵn verify/context → harness **ép** O1–O10. Không thêm ceremony thừa (preflight 8 câu, 2 phương án mọi task).

## Outcome (alwaysApply)

1. **Chạy tới đích** — không dừng ở đề xuất.
2. **Verify trước PASS** — raw output / screenshot / log.
3. **Tự làm trước khi hỏi** — blocked mới hỏi.
4. **Không placeholder / fake CRUD / fake PASS**.
5. **PARTIAL/BLOCKED** không dùng để trốn việc còn tự làm được.

## Mặc định nặng

Task mặc định **MEDIUM**. HIGH: DB, auth, 5fedu UI, production, permission, export → full matrix + skill/context.

## Gemini stress (ép thêm)

- Anti-surface scan: MEDIUM+ phải trace call-sites trước sửa shared.
- Anti-laziness: không `PASS` không verify (`00-runtime-and-intent` hard contract).
- Context: intent router + đọc index trước code (`03-context-and-tools`).

## Ceremony giảm (tránh bóp Opus khi sau này đổi model)

- Status block đầy đủ: chỉ MEDIUM/HIGH, không mọi câu chat thảo luận.
- Brainstorm 2 phương án: chỉ HIGH.

## Final (MEDIUM/HIGH)

`Intent detected` · `Context loaded` · `Template checked` (5fedu UI) · `Verification` · `Technical debt check` · `Status: PASS|PARTIAL|BLOCKED`