# Fast Context Discipline

Mục tiêu là làm Antigravity nhạy và nhanh: nạp ít rule nền, đọc đúng file, dùng workflow khi có case rõ.

## Context Budget

- Không đọc toàn repo nếu chưa cần.
- Đầu tiên đọc `AGENTS.md`, README, package/config chính, và file gần task.
- Nếu task liên quan runtime Codex, đọc `P:\agent-rules\README.md`, `P:\agent-rules\docs\01-technical-specification.md`, và file cụ thể dưới `P:\agent-rules\codex`.
- Nếu task liên quan 5fedu, gọi workflow `/5fedu-project` hoặc đọc định nghĩa skill tại thư mục dự án cục bộ `.agents/skills/5fedu-project/SKILL.md` (hoặc bản backup master tại `P:\agent-rules\antigravity\.agents\skills\5fedu-project\SKILL.md`).

## Trigger Map

| Ngữ cảnh / Từ khóa trong prompt | Kỹ năng (Skill) tự động kích hoạt |
|---|---|
| "setup 5fedu", "scaffold 5fedu", "cập nhật context 5fedu" | Gọi `/5fedu-project` để bảo trì hoặc tạo mới nghiệp vụ dự án |
| "research", "tìm trên internet", "xác minh mới nhất" | Gọi `/codex-research` để thu thập bằng chứng và nguồn đáng tin cậy |
| "sync codex", "runtime lệch backup không" | Gọi `/runtime-sync-audit` để so sánh và đồng bộ |
| "review", "audit", "kiểm tra lỗi" | Review theo bug/risk/regression/test gap trước, summary sau |
| "viết docs", "readme", "spec", "tài liệu", "badges", "hướng dẫn" | Đọc và tuân thủ `docs-style` ( README, spec, badge chuẩn ) |
| "frontend", "UI/UX", "giao diện", "responsive", "css", "layout", "bento" | Kích hoạt `frontend-ui-quality` kết hợp `taste-skill` (hoặc `soft-skill`) |
| "logo", "identity", "brand", "guidelines", "visual board" | Áp dụng `brandkit` để dựng thiết kế thương hiệu cao cấp |
| "chụp ảnh màn hình", "screenshot", "browser verify", "playwright" | Kích hoạt `screenshot` hoặc `playwright` để tương tác và chụp kiểm thử giao diện |
| "security", "threat model", "lỗ hổng", "bảo mật", "phân quyền" | Kích hoạt `security-best-practices` hoặc `security-threat-model` |
| "PDF", "xuất file PDF", "đọc file PDF" | Sử dụng `pdf` (ReportLab / Poppler) để sinh hoặc kiểm tra PDF |
| "tối giản", "minimalist", "brutalist", "blueprints" | Kích hoạt `minimalist-skill` hoặc `brutalist-skill` tương ứng |

## Stop Conditions

- Dừng hỏi người dùng khi thiếu credential, schema, quyền truy cập, hoặc yêu cầu có thể phá dữ liệu.
- Báo `BLOCKED` chỉ khi không thể tiến tiếp sau khi đã xác minh blocker.
- Báo `PARTIAL` khi đã làm được một phần nhưng còn verification hoặc thông tin chưa đủ.
