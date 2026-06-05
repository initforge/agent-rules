# Codex Runtime Intent

Luật này là adapter cho Codex. Nguồn chuẩn chạy hằng ngày là `~/.codex`; `P:\agent-rules\codex` là bản backup/bootstrap và nguồn sync dài hạn.

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
- Khi cần tìm file hoặc chuỗi ký tự, ưu tiên `rg`/search tool sẵn có. Nếu một tool cụ thể không tồn tại trong session, dùng fallback tương đương và ghi rõ khi fallback ảnh hưởng tới bằng chứng.
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

Khi người dùng yêu cầu chuyển hóa một phản hồi (feedback) hoặc bài học kinh nghiệm mới thành luật vận hành nền, hoặc phản hồi đó rõ ràng là rule tái sử dụng được:
1. **Phân loại & Định vị**: Phân tích nội dung kinh nghiệm để xác định nhóm quy tắc liên quan (ví dụ: Database, UI/Frontend, Auth, Clean Code...) và xác định tệp luật nền tương ứng trong `.agents/rules/` (hoặc tạo mới nếu cần).
2. **Cập nhật Luật của Dự án**: Chèn điều khoản quy tắc mới này trực tiếp vào tệp luật đó dưới dạng quy định bắt buộc, ngắn gọn và có tính hành động cao.
3. **Cập nhật Bản mẫu Codex**: Đồng thời chèn quy tắc này vào tệp rules/skills tương ứng trong local runtime tại `~/.codex/` (ví dụ: `~/.codex/rules/` hoặc thư mục assets của skill mẫu).
4. **Đồng bộ hóa ngược Master**: Chạy tự động script `P:\agent-rules\codex\scripts\sync-codex-to-p.ps1` để đồng bộ ngược về `P:\agent-rules\codex` và cập nhật thư mục master `antigravity/.agents/rules/` tương ứng.
5. **Git chỉ khi được yêu cầu**: Không tự `git add`, `commit`, `push` hoặc deploy. Chỉ stage/commit/push khi người dùng yêu cầu rõ trong session hiện tại; khi commit được yêu cầu, chỉ stage đúng file liên quan.
6. **Báo cáo**: Kết thúc và liệt kê cụ thể các tệp luật đã cập nhật, nơi đã sync, verification đã chạy, và trạng thái cuối `PASS`/`PARTIAL`/`BLOCKED`.
