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

Final **bắt buộc** đủ:

```text
Intent detected: ...
Context loaded: ...
Template checked: ... (5fedu UI)
Verification: ...
Technical debt check: ...
Status: PASS | PARTIAL | BLOCKED
```

LOW: `Status` + việc đã làm (ngắn).

## Anti-laziness Gemini

- Không PASS không verify có bằng chứng.
- MEDIUM+ shared code: `rg` call-sites trước sửa.
- Production: đúng URL, build mới, data an toàn.

## Hooks

Tuân `hooks.json` và preflight khi workspace bật — không tắt gate để nhanh hơn.