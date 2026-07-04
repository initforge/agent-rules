---
alwaysApply: true
description: Context budget, fresh sessions, and code exploration discipline.
---

# Context budget and exploration

**Ý đồ:** Tránh Lost-in-the-Middle; task dài = nhiều session có handoff, không một lượt.

## Session discipline

- **1 phase / 1 session** cho task lớn; dùng skill `plan-and-handoff`.
- Khi context đầy (~70%): handoff → session mới đọc handoff, không kéo full chat.
- Sub-agent/worktree khi task độc lập song song (skill `best-of-n` chỉ khi user yêu cầu).
- Task ≥2 files = task dài (`25-task-lifecycle.md`); không classify tiny.
- Plan-only sessions: prefer one plan artifact, minimal code churn — clearer and cheaper than mistaken execute.

## Code exploration (webapp)

- Dùng **codebase-memory-mcp** + scope file rõ; không đọc cả cây "cho chắc".
- `rg` + đọc có chọn lọc trước; MCP khi cần impact/cross-file.
- Scope-lock: xác nhận phạm vi slice; không tự mở rộng ngoài slice đã chốt.

## Progressive disclosure

- Always-load: `rules/` + manifest budgets only.
- Domain/project packs: lazy qua router (`00-context-map.md`, skill triggers).
- References/scripts: chỉ khi skill/domain yêu cầu.
