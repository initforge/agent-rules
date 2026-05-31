---
description: Scaffold or update project-local 5fedu context using the Codex 5fedu skill contract.
---

# 5fedu Project

1. Read the skill file in the project-local adapter at `.agents/skills/5fedu-project/SKILL.md` or the master backup at `P:\agent-rules\antigravity\.agents\skills\5fedu-project\SKILL.md`.
2. Phân biệt rõ vai trò hệ thống:
   - **Nền (Global Base rules)**: Bộ quy tắc chung (`agent-rules`) được cài đặt để Agent làm việc chuẩn mực trên nhiều dự án.
   - **Nghiệp vụ dự án (Workspace Context)**: Các tệp `.agents/5fedu/*.md` và `AGENTS.md` cục bộ chứa kiến thức đặc thù, thiết kế database, phân quyền và phản hồi của chính dự án đó.
3. Kiểm tra Repo hiện tại để xác định chế độ xử lý:
   - **Chưa có Context (New Project Setup)**: Chạy script `.agents/skills/5fedu-project/scripts/install-5fedu-context.ps1` (hoặc bản backup tại `P:\agent-rules\antigravity\.agents\skills\5fedu-project\scripts\install-5fedu-context.ps1`) để tạo cấu trúc mẫu. Thực hiện thích ứng (Adapt) cấu trúc và thuật ngữ phù hợp với loại hình dự án (ví dụ: app vận tải, webshop, ERP).
   - **Đã có Context (Context Maintenance & Update)**: KHÔNG chạy lại script cài đặt. Tự động chuyển sang chế độ **Cập nhật & Bổ sung**. Đọc các tệp `.agents/5fedu/` hiện có để hiểu bối cảnh, bổ sung bài học kinh nghiệm mới vào `10-owner-feedback-lessons.md`, cập nhật các đầu việc/quyết định vào `06-decision-status.md` hoặc giải đáp ở `questions.md` dựa theo phản hồi thực tế của khách hàng hoặc prompt của người dùng.
4. Load `.agents/skills/5fedu-project/references/5fedu-context-map.md` (hoặc bản backup tại `P:\agent-rules\antigravity\.agents\skills\5fedu-project\references\5fedu-context-map.md`) trước khi viết hoặc cập nhật các quy tắc nghiệp vụ dự án.
5. Preserve the intended project-local layout:

```text
AGENTS.md
.agents/5fedu/
|- 00-index.md
|- 01-tech-stack-and-template.md
|- 02-frontend-mapping.md
|- 03-database-supabase.md
|- 04-auth-permissions-and-flows.md
|- 05-delivery-quality.md
|- 06-decision-status.md
|- 07-working-format.md
|- 08-source-examples.md
|- 09-coverage-audit.md
|- 10-owner-feedback-lessons.md
|- 11-current-sheets-source-map.md
|- 12-owner-feedback-transport-ui.md
`- questions.md
```

6. Treat Supabase/auth/permission/database work as HIGH risk. Ask for missing schema, credentials, permissions or module mapping instead of inventing values.
7. Before implementation, read `06-decision-status.md`; do not implement areas marked `CHUA_CHOT` or `CAN_HOI_THEM`.
8. Before transport/UI/report/payroll/derived-total work, read `12-owner-feedback-transport-ui.md`.
9. End with files changed, verification run, unknowns, and final status `PASS`, `PARTIAL`, or `BLOCKED`.
