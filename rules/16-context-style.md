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

## Chuẩn tinh gọn (ngắn đến mức nào — có SỐ)

Nguyên tắc gốc: **đủ ngắn để đọc 1 lần hiểu ngay, đủ dài để không phải suy luận.** Ngắn hơn = mất enforcement; dài hơn = loãng.

- **1 bullet = 1 ý**, bắt đầu bằng động từ imperative, ≤ ~20 từ. Cần giải thích dài → xuống `references/` (deep-dive hiếm load).
- **`rules/**` always-load:** 1 concept/file, mục tiêu ≤ ~40 dòng / ≤ ~300 từ. Vượt → gộp câu hoặc đẩy reference — **không** áp ngưỡng này cho skill (skill: §Liền mạch).
- **Mở file bằng Hard gates / Hành động bắt buộc** (3–7 bullet); ví dụ/lý do/edge để cuối hoặc reference.
- **Token budget là ràng buộc cứng** — single source `rules/manifest.yaml` (core 4000, overlay 600, skill 3500). Không nhân bản số ở nơi khác.
- **Delete-first khi bổ sung:** trước khi THÊM, hỏi "gộp/thay câu cũ được không?". Thêm mới chỉ khi không rule nào cover (promotion gate `context-evolution-protocol`).
- **Không văn xuôi trong always-load/router:** bảng hoặc bullet; cấm đoạn giải thích dông dài.
- **Đánh thẳng vấn đề:** nêu hành động + điều kiện trigger, không kể bối cảnh.

## Liền mạch trước số dòng (cohesion — cấm tách máy móc)

**Nguyên tắc:** Context phục vụ **một luồng đọc–hiểu–làm** phải ở **một chỗ**, đánh thẳng — không rải link A→B→C.

- **Giữ nguyên 1 file** khi các mục cùng workflow (vd. docs-style: workflow → README → badges → cleanup → quality gates).
- **Chỉ tách** khi: (a) phần tách phục vụ trigger/lane **khác hẳn**, hoặc (b) block >80% thời gian **không** được load, hoặc (c) vượt **token budget cứng** manifest và không gộp được bằng gọn câu.
- **Cấm:** tách chỉ để pass `wc -l`/audit; thay nội dung liền mạch bằng "đọc thêm references/…" bắt buộc nhiều bước.
- **`references/`** = deep-dive hiếm dùng, ví dụ dài, benchmark mẫu — **không** là phần 2 bắt buộc của skill thực thi hàng ngày.
- **Skill thực thi** (docs-style, plan-and-handoff, finish-to-completion): ưu tiên **self-contained**; warn oversize nhẹ >~350 dòng, **không** auto-bắt tách.

## Linh hoạt theo tình huống (không máy móc mọi case)

- Agent **chọn** rule/skill/hook áp dụng theo signal task — không chạy full checklist mỗi turn.
- Hook/audit/pre-commit = **backstop WARN** (fail-open); không coi mọi WARN là blocker trừ owner bật STRICT.
- Ngân sách dòng/tokens = **hướng dẫn mềm** khi cohesion còn nguyên; **cứng** chỉ khi always-load phình hoặc trùng concept.
- Pivot, lane, tier: áp khi match — bỏ qua an toàn khi task tiny/Q&A/read-only rõ ràng.

## Rủi ro khi không tuân

| Rủi ro | Triệu chứng |
|---|---|
| Skill body mâu thuẫn description | Agent load `frontend-architect` thay `ui-delivery` khi user nói "giao diện" |
| Trigger quá rộng | Recall cao, precision thấp — audit `trigger-audit.json` |
| `legacy/` / `evidence/` lẫn router | Context phình, agent làm theo rule cũ |
| Chỉ có output economy | Agent trả lời ngắn nhưng **đọc** context dài vẫn lệch |
| Tách file vì số dòng, mất luồng | Agent nhảy references, miss bước, "thảm họa" link chain |
| Checklist máy móc mọi turn | Chậm, over-read context, bỏ lỡ task thực tế |
| Không có precedence khi 2 skill khớp | Model chọn skill quen tay (redesign > parity) |
| Bảng router thiếu "cấm skill X" | Domain file đúng nhưng capability sai vẫn thắng |

## Kiểm tra sau khi sửa context

1. `./automation/run.sh 03-validate-context` — PASS bắt buộc.
2. `./automation/run.sh 04-verify-mirrors` — PASS nếu sửa skill/rule/platform.
3. `./automation/11-install-runtime-hooks.sh` — smoke OK nếu sửa hook/script.
4. `./automation/audit-context-pre-commit.sh --files <paths>` — không DEAD PATH / OVERSIZE bất ngờ.
5. Sâu hơn: `./automation/run.sh 10-audit-harness-health` — concept overlap WARN.
