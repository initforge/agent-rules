---
description: "Hợp đồng Opus-emulation — Composer đạt đầu ra Opus, harness nặng, ceremony tối thiểu"
---

# 06-opus-emulation-contract

Nguồn chung: `shared/opus-emulation-contract.md`. **Composer và Gemini dùng cùng đầu ra Opus** — không phân model theo việc.

## Mục tiêu

Bắt chước **kết quả** Opus (tự chủ, bền, verify, đúng scope), không bắt chước **nghi thức** làm Opus chậm.

## Outcome (luôn áp dụng)

1. **Chạy tới đích** — user yêu cầu làm → làm, không dừng ở gợi ý.
2. **Verify trước PASS** — chạy test/lint/browser/DB phù hợp; không fake PASS.
3. **Tự làm trước khi hỏi** — hỏi chỉ khi blocked (credential, quyền, approval).
4. **Không placeholder / mock giả** — code thật, đủ scope.
5. **PARTIAL/BLOCKED** chỉ khi thật sự không tiến được sau khi đã thử fallback.
6. **Không handoff sớm** — `07-finish-to-completion`: đóng hết deliverable scope; cấm GAP list / false choice / chuyển việc user khi agent tự làm được.

## Mặc định nặng

Coi task là **MEDIUM** trừ khi rõ LOW (typo 1 chỗ). Đừng hạ tier để khỏi verify.

| Tier | Thêm bắt buộc |
|---|---|
| MEDIUM | Regression nếu shared code; evidence cuối gọn |
| HIGH (DB/auth/5fedu UI/production/permission/export) | Full quality matrix; skill + context; `Template checked` nếu 5fedu UI |

## Domain gates (HIGH)

- **Bug/debug:** root cause ≥90% evidence (`01-agent-workflow-sop`).
- **Shared change:** `rg` call-sites (`02-code-quality-and-debt`).
- **5fedu UI:** `/template` trước (`04-skills-and-5fedu`).
- **Permission:** đa account, không chỉ admin.

## Ceremony cấm

- Preflight 8 câu mọi lượt → nội bộ ≤3 (LOW) / ≤5 (HIGH).
- 2 phương án mọi task → chỉ HIGH / architecture.
- Evidence label essay mọi chat → chỉ MEDIUM/HIGH.
- Explore không mục tiêu → index + file liên quan; HIGH đọc sâu có chỉ đích.

## Composer anti-stuck

- Câu hỏi chiến lược: trả lời trước, không đọc 15+ file.
- Implement MEDIUM/HIGH: đủ context để **đạt O1–O2**, không cắt verify vì sợ stuck.

## Final (MEDIUM/HIGH)

Yêu cầu xuất báo cáo cuối cùng theo định dạng danh sách xuống dòng rõ ràng, sử dụng thẻ HTML `<mark>` để highlight các từ khóa:

*   **Intent detected:** <mark>...</mark>
*   **Context loaded:** <mark>...</mark>
*   **Template checked:** <mark>... (nếu 5fedu UI)</mark>
*   **Verification:** <mark>...</mark>
*   **Technical debt check:** <mark>...</mark>
*   **Status:** <mark>PASS | PARTIAL | BLOCKED</mark>