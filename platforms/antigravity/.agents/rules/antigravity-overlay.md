---
description: "Antigravity overlay — alwaysApply, UI parity, status contract"
alwaysApply: true
---

# Antigravity Overlay

Áp **chỉ Antigravity**. Bổ sung ép chặt trên lõi Opus-emulation — **không** thêm preflight 8 câu hay 2 phương án mọi task.

## Runtime

```text
<repo>/.agents/rules/        ← live (alwaysApply)
antigravity/.agents/         ← master adapter
~/.gemini/GEMINI.md          ← global (nếu có)
```

## UI / 5fedu (bắt buộc khi FE)

- Đọc `/template` trước mọi component — pattern, icon Lucide đa dạng, footer phân trang chuẩn.
- Button async: disabled + spinner, chống double-click.
- Đối chiếu ≥1 component tương tự (loading, error, empty).

## Status contract (MEDIUM/HIGH)

Final **bắt buộc** đủ trình bày dạng danh sách xuống dòng rõ ràng và sử dụng thẻ HTML `<mark>` để highlight các giá trị quan trọng:

*   **Intent detected:** <mark>...</mark>
*   **Context loaded:** <mark>...</mark>
*   **Template checked:** <mark>... (5fedu UI)</mark>
*   **Verification:** <mark>...</mark>
*   **Technical debt check:** <mark>...</mark>
*   **Status:** <mark>PASS | PARTIAL | BLOCKED</mark>

LOW: `Status` dạng list ngắn gọn.

## Anti-laziness Gemini

- Không PASS không verify có bằng chứng.
- MEDIUM+ shared code: `rg` call-sites trước sửa.
- Production: đúng URL, build mới, data an toàn.

## Hooks

Tuân `hooks.json` và preflight khi workspace bật — không tắt gate để nhanh hơn.