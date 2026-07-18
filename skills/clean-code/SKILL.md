---
name: clean-code
description: Distilled clean-code guidelines, 2-phase code quality gate (pre-plan smell scan / post-plan strict review), triage lanes, and hard-block validation rules. Trigger on "clean code", "dọn dẹp code", "refactor code", "viết code đẹp", "tối ưu code", smell scan, hard-block. Do NOT use for deep maintainability audit — that is skill code-review (user-invoked).
routing: {"signals":["clean code","dọn dẹp code","refactor code","viết code đẹp","tối ưu code","smell scan","hard-block"],"excludes":["pure q&a"],"priority":50,"loads":["skill:clean-code"],"supports":["implementation-discovery","code-review"],"project_scope":"","platform_scope":"all","max_route_tokens":3500,"default":false}
---

# Clean Code Skill

**Chạy ở pha:** pre-plan (smell detect) / post-plan (review)

Đây là kỹ năng đóng vai trò bộ lọc chất lượng code (clean-code lens) hai giai đoạn trước và sau khi triển khai, áp dụng linh hoạt theo lane của task và hỗ trợ ghi đè đặc thù cho các module 5fedu ERP.

## 1. Cơ chế Triage Lanes

- **Lane `tiny` (1 file only):** hard-block check nhanh — không smell detect đầy đủ. Skip quy trình lập kế hoạch và review chi tiết.
- **Lane `normal`:** hard-block at finish; smell detect **optional** — chỉ khi user trigger hoặc high-risk. Lập kế hoạch (`plan-and-handoff`) chỉ khi task dài hoặc multi-phase.
- **Lane `high-risk`:** smell detect recommended pre-plan; hard-block at finish. Đánh giá chi tiết về rủi ro bảo mật (security) và hiệu năng (performance).
- **Only run in workflow mode=`execution`** — skip in plan-only (optional read-only path).

## 2. 5fedu Override Guard

Khi repo hiện tại có `context/5fedu/` và task liên quan đến các module ERP của 5fedu:
- **Độ ưu tiên:** Các quy ước và cấu trúc của 5fedu ERP (`module-mapping.md`, `ui-delivery.md`, `surface-taxonomy.md`) sẽ **ghi đè** các hướng dẫn clean-code chung này.
- Phải tuân thủ cấu trúc thư mục, đặt tên component và layout chuẩn của Nhân viên/Phòng ban template trước, rồi mới áp dụng clean-code để làm sạch logic nội bộ.

## 3. Liên kết Workflow

- **Pha DETECT (Trước code):** Gắn vào `implementation-discovery` để quét lỗi thiết kế, đưa kết quả phát hiện vào plan (nếu lane high-risk hoặc user trigger).
- **Pha REVIEW (Sau code):** Gắn vào `code-review` để chạy kiểm tra chất lượng nghiêm ngặt trước khi báo cáo kết quả hoàn thành.

Chi tiết danh sách Hard-block và hướng dẫn clean-code:
[clean-code-checklist.md](references/clean-code-checklist.md)
