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
- Task ≥2 files = lane `normal`; không tự động ép PAF/ledger nếu task rõ, một phase và rủi ro thấp. PAF/ledger bắt buộc khi multi-phase, high-risk hoặc cần nhiều AC độc lập (`25-task-lifecycle.md`).
- Plan-only sessions: prefer one plan artifact, minimal code churn — clearer and cheaper than mistaken execute.

## Code exploration (webapp)

- Dùng **codebase-memory-mcp** + scope file rõ; không đọc cả cây "cho chắc".
- `rg` + đọc có chọn lọc trước; MCP khi cần impact/cross-file.
- Scope-lock: xác nhận phạm vi slice; không tự mở rộng ngoài slice đã chốt.

## Progressive disclosure

- Always-load: `rules/` + manifest budgets only.
- Domain/project packs: lazy qua router (`00-context-map.md`, skill triggers).
- References/scripts: chỉ khi skill/domain yêu cầu.

## Intentional oversize (owner — không “sửa gầy” vì số)

Các pack sau **được phép** vượt soft line/token guide vì cohesion / depth; audit **không FAIL** chỉ vì size:

| Pack | Lý do |
|---|---|
| `docs-style` (+ refs) | Self-contained docs workflow end-to-end |
| `plan-and-handoff` (+ refs) | PAF + tier + goal autopilot liền mạch |
| `finish-to-completion` (+ refs) | Slice completion / ledger depth |
| `code-review` | User-invoked strict maintainability; depth > soft 3500 |
| `projects/5fedu/**` domain packs | Progressive domain depth khi lazy-load |

Always-on `rules/` vẫn cứng theo `manifest.yaml` `core_total_tokens`.

## Benefit–Harm Gate (sửa / rút gọn / tinh chỉnh depth)

Trước khi **slim, rewrite gầy, xóa section**, hoặc đổi fail-open → deny trên skill/rule depth:

1. Ghi **Benefit** (1–3) và **Harm** (1–3).
2. **Net:**
   - **Lợi > hại rõ** (vd allowlist oversize, fix dead skill name) → **PROCEED**, ghi rationale ngắn.
   - **Hòa / mơ hồ / chỉ lợi install-ceremony** → **DISCUSS_OWNER** — không tự cắt depth.
   - **Hại ≥ lợi** (mất hard rules, approval bar, parity criteria) → **DISCUSS_OWNER** hoặc **ABORT**.
3. **Cấm slim-for-budget:** validate/token FAIL → ưu tiên intentional oversize, soft limit, hoặc `references/` **cùng depth khi load** — không xóa tiêu chí “cho qua số”.
4. `16-context-style` delete-first = bỏ **trùng/rác/ceremony**, không bỏ sức mạnh. Benefit–Harm **thắng** khi xung đột với “file phải gầy”.
