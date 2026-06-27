---
description: "Hợp đồng Opus-emulation — Composer đạt đầu ra Opus, harness nặng, ceremony tối thiểu"
---

# 06-opus-emulation-contract

Nguồn chung: `shared/opus-emulation-contract.md`. **Composer và Gemini dùng cùng đầu ra Opus** — không phân model theo việc.

## Mục tiêu

Bắt chước **kết quả** Opus (tự chủ, bền, verify, đúng scope), không bắt chước **nghi thức** làm Opus chậm.

## Outcome (luôn áp dụng)

1. **Chạy tới đích** — user yêu cầu làm → làm, không dừng ở gợi ý.
2. **Verify trước PASS** — chạy test/lint/browser/DB phù hợp; không fake PASS; bắt buộc cung cấp tối thiểu 5 dòng đầu/cuối của logs kiểm thử.
3. **Tự làm trước khi hỏi** — hỏi chỉ khi blocked (credential, quyền, approval).
4. **Không placeholder / mock giả** — code thật, đủ scope.
5. **Chống chắp vá khi quá tải token (Anti-Patching & Token limit)**: Nếu token context bị quá tải hoặc sắp chạm giới hạn kỹ thuật (token limit), cấm chắp vá code bằng các comment TODO hay cắt bớt logic. Bắt buộc phải dừng an toàn, lưu trạng thái hiện tại của công việc vào tệp `task.md` vật lý, báo cáo rõ ràng vị trí bị dừng lại và xin phép người dùng cho lượt tiếp theo để hoàn thành nốt.
6. **PARTIAL/BLOCKED** chỉ khi thật sự không tiến được sau khi đã thử fallback.
7. **Không handoff sớm** — `07-finish-to-completion`: đóng hết deliverable scope; cấm GAP list / false choice / chuyển việc user khi agent tự làm được.
8. **Không plan ảo** — MEDIUM/HIGH task phải qua Intent Fidelity Gate và Locked Plan Acceptance Gate trước khi implement. Plan nghe hợp lý nhưng thiếu evidence/schema/interface/linkage map thì trạng thái là `PLAN NOT LOCKED`, không được xem là kế hoạch thực thi.
9. **Không claim thiếu chứng cứ** — mọi khẳng định "đã làm/đã test/đã sync/đã deploy/đã đúng template" phải có bằng chứng trực tiếp trong repo, terminal, DB, browser, hoặc dashboard.
10. **Prompt dài phải được biên dịch** — input rời rạc/multi-domain phải được chuyển thành requirement graph, source-of-truth map, assumption ledger, acceptance contract trước khi plan/implement.
11. **UI phải qua browser** — mọi UI/web/frontend/admin/public/production task không được PASS nếu chưa có browser verification evidence hoặc blocker rõ ràng vì browser chưa bật.

## Mặc định nặng

Coi task là **MEDIUM** trừ khi rõ LOW (typo 1 chỗ). Đừng hạ tier để khỏi verify.

| Tier | Thêm bắt buộc |
|---|---|
| MEDIUM | Regression nếu shared code; evidence cuối gọn |
| HIGH (DB/auth/5fedu UI/production/permission/export/multi-domain prompt dài) | Intent Fidelity Gate; Locked Plan Acceptance Gate; full quality matrix; skill + context; `Template checked` nếu 5fedu UI |

## Domain gates (HIGH)

- **Bug/debug:** root cause ≥90% evidence (`01-agent-workflow-sop`).
- **Shared change:** `rg` call-sites (`02-code-quality-and-debt`).
- **5fedu UI:** `/template` trước (`04-skills-and-5fedu`).
- **Permission:** đa account, không chỉ admin.
- **Prompt dài / dữ liệu rời rạc / multi-domain:** gom ý đồ thành current-state, missing-state, linkage map, unknowns, acceptance, verification trước khi code.
- **Schema/API/route/module mới:** inspect existing repo/schema/spec trước; tên chưa verify phải đánh dấu `PROPOSED`.
- **UI/web/frontend:** browser click-through/screenshot evidence bắt buộc; thiếu browser thì `BLOCKED`, không fake PASS bằng build.

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
