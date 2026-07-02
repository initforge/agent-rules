---
alwaysApply: true
description: Living context writing style — short bullets, direct actions, anti-drift.
---

# Context style (living rules)

**Ý đồ:** Context phải đọc nhanh, hành động rõ — không văn xuôi dài trong always-load hoặc router.

## Format bắt buộc

- Router/index (`00-context-map`, `decisions`): bảng hoặc bullet **imperative** — trigger → file → hành động.
- Promote owner feedback: **1–5 bullet**, không quote chat dài (`evidence/` chỉ index).
- Skill `description`: trigger + **Do NOT** rõ; body không mâu thuẫn description (cấm "mọi task UI" nếu description loại trừ 5fedu parity).
- Domain pack: mở bằng **Hard gates** / **Hành động bắt buộc** ngắn; chi tiết dài để cuối file hoặc `references/`.

## Rủi ro khi không tuân

| Rủi ro | Triệu chứng |
|---|---|
| Skill body mâu thuẫn description | Agent load `frontend-architect` thay `ui-delivery` khi user nói "giao diện" |
| Trigger quá rộng | Recall cao, precision thấp — audit `trigger-audit.json` |
| `legacy/` / `evidence/` lẫn router | Context phình, agent làm theo rule cũ |
| Chỉ có output economy | Agent trả lời ngắn nhưng **đọc** context dài vẫn lệch |
| Không có precedence khi 2 skill khớp | Model chọn skill quen tay (redesign > parity) |
| Bảng router thiếu "cấm skill X" | Domain file đúng nhưng capability sai vẫn thắng |

## Kiểm tra sau khi sửa context

- `automation/03-validate-context.ps1`
- `automation/audit-ui-routing.ps1` (5fedu UI skill routing)
