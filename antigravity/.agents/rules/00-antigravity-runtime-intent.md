# Antigravity Runtime Intent

Luật này là bộ quy tắc cốt lõi cho Antigravity. Nguồn chuẩn nằm tại thư mục master `P:\agent-rules\antigravity\.agents\rules\` và được tự động đồng bộ hóa xuống các dự án.

## Ngôn ngữ

- Giao tiếp với người dùng bằng tiếng Việt có dấu.
- Giữ tiếng Anh cho tên tool, API, package, schema key, command, path, model và code.
- Trạng thái cuối phải là `PASS`, `PARTIAL`, hoặc `BLOCKED`.

## Cách làm việc

- Task nhỏ rõ ràng: đọc đúng file liên quan, sửa trực tiếp, verify tối thiểu.
- Task vừa: đọc ngữ cảnh, nêu plan ngắn nếu có nhiều lát cắt, triển khai, verify.
- Task rủi ro cao hoặc multi-domain: tạo plan dạng `plan/<feature>/00-index.md`, rồi các slice liên tục `01-...md`, `02-...md`, `03-...md`.
- Không tạo mega-plan và không dùng số nhảy như `30`, `35`, `60` nếu repo chưa có convention rõ.

## Quy tắc sửa file

- Khi sửa code giao diện (UI/frontend), bắt buộc đối chiếu trực tiếp với mã nguồn mẫu gốc đặt tại thư mục `/template` của dự án để đảm bảo tính nhất quán.
- Không revert thay đổi của người dùng nếu không được yêu cầu.
- Không dùng lệnh destructive như `git reset --hard` hoặc checkout đè file khi chưa được yêu cầu rõ.
- Khi cần tìm file hoặc chuỗi ký tự, ưu tiên sử dụng tool `grep_search` của hệ thống để đạt hiệu năng tối ưu mà không cần xin quyền chạy terminal.
- Khi sửa code, giữ scope nhỏ, theo pattern hiện có, verify bằng test/check phù hợp.
- Nếu có API route hoặc contract dùng chung, phải phân tích tác động trước khi sửa.

## Quality Gate

- Luôn phân biệt fact, assumption và unknown.
- Với lỗi khó, phải tìm root cause trước khi vá.
- Với UI/frontend, phải kiểm tra responsive, overflow, spacing, state và browser screenshot khi có thể.
- Với database/auth/secret/permission, coi là HIGH risk, hỏi rõ thiếu gì và không bịa schema.

## Antigravity Mapping

- Rules là hợp đồng hành vi ngắn.
- Workflows là quy trình kích hoạt theo slash command.
- Không dùng profile/model config trong adapter Antigravity; model và effort do Antigravity runtime tự quản.
- Hooks chỉ dùng cho guard/preflight, không thay thế review của người dùng.
- Nếu workflow chuyên biệt tồn tại, ưu tiên gọi workflow thay vì diễn giải lại bằng lời dài.

## Quy trình Tự động hóa Chuyển hóa Kinh nghiệm (Auto-evolving Rules)

Khi người dùng yêu cầu chuyển hóa một phản hồi (feedback) hoặc bài học kinh nghiệm mới thành luật vận hành nền (người dùng không cần làm thủ công):
1. **Phân loại & Định vị**: Phân tích nội dung kinh nghiệm để xác định nhóm quy tắc liên quan (ví dụ: Database, UI/Frontend, Auth, Clean Code...) và xác định tệp luật nền tương ứng trong `.agents/rules/` (hoặc tạo mới nếu cần).
2. **Cập nhật Luật của Dự án**: Chèn điều khoản quy tắc mới này trực tiếp vào tệp luật đó dưới dạng quy định bắt buộc, ngắn gọn và có tính hành động cao.
3. **Cập nhật Bản mẫu Antigravity & Đồng bộ 100% với KI**: 
   - Chèn quy tắc này vào tệp rules/skills tương ứng trong master tại `P:\agent-rules\antigravity\.agents\` (ví dụ: `P:\agent-rules\antigravity\.agents\rules\` hoặc thư mục `skills/`).
   - **Bắt buộc đồng bộ trực tiếp sang KI của Antigravity**: Sao chép/ghi đè các file luật đã cập nhật từ master sang thư mục KI cục bộ tại `C:\Users\DELL\.gemini\antigravity\knowledge\agent-rules-runtime\artifacts\` để đảm bảo KI và master luôn giống nhau 100%.
4. **Xử lý Ngoại lệ Dự án 5fedu (File 10-12)**: 
   - Các file từ `10-owner-feedback-lessons.md` đến `12-owner-feedback-transport-ui.md` trong dự án 5fedu chứa các mapping đến link sheets hoặc feedback đặc thù của dự án đó.
   - Nếu feedback/bài học có tính tổng quát cao, mang giá trị chung (như quy chuẩn xuất Excel, catch lỗi Auth Sync), hãy tự động chuyển hóa thành luật nền toàn cục ở bước 1-3.
   - Nếu feedback hoàn toàn đặc thù cho riêng dự án đó (như link sheets hoặc logic nghiệp vụ cá biệt), giữ nguyên tại file dự án đó và KHÔNG chuyển hóa về global.
5. **Đồng bộ hóa chéo sang Codex**: Chạy tự động script `P:\agent-rules\scripts\sync-platform-skills.ps1` để đồng bộ chéo luật/kỹ năng mới này sang Codex (cả `P:\agent-rules\codex\` và local runtime `~/.codex/` của máy).
6. **Lưu trữ phiên bản**: Tự động chạy `git add -A` và `git commit` tại thư mục `P:\agent-rules` để lưu vết lịch sử thay đổi.
7. **Báo cáo**: Kết thúc và liệt kê cụ thể các tệp luật đã cập nhật kèm theo trạng thái cuối là `PASS`.
