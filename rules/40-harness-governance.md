---
alwaysApply: true
description: Canonical ownership, promotion and mirror governance.
---

# Harness governance

- **Bất kỳ sửa đổi context/harness** (`rules/**`, `skills/**`, `AGENTS.md`, `GEMINI.md`, `platforms/**`, `projects/**`, overlay) → **bắt buộc** kích hoạt `context-evolution-protocol` (classification → Placement → Promotion Gate → **Auto-audit on edit**). Không phải bước tuỳ chọn.
- Cùng lượt: **mở và tuân** [41-harness-maintainer.md](41-harness-maintainer.md) (sync build/install/import, promotion gate đầy đủ) — file này `alwaysApply: false`, mid-flow khi chạm harness.
- Tinh gọn theo `16-context-style` §Chuẩn tinh gọn (bullet ≤20 từ, file ≤~40 dòng, một concept một nơi, delete-first). Exception size: `50-context-budget.md` §Intentional oversize.
- Không `PASS` task context nếu chưa chạy Auto-audit on edit.

See [41-harness-maintainer.md](41-harness-maintainer.md) for full canonical governance, sync rules, outbound and inbound protocols, and context promotion gates.

