# Codex Runtime Intent

Luật này là adapter cho Antigravity. Nguồn chuẩn vẫn là `C:\Users\DELL\.codex` khi chạy hằng ngày và `P:\agent-rules\codex` khi backup/bootstrap.

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
