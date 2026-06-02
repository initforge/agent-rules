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
  - **Nguyên tắc tham chiếu thư mục `/template`**: Trước khi sửa/viết bất kỳ component FE nào, AI bắt buộc phải đọc code mẫu trong `/template` để lấy mẫu chuẩn về cấu trúc, style, và pattern. Tuyệt đối không tự ý viết code thô hoặc bỏ qua bước tham chiếu.
  - **Đa dạng hóa Icon**: Tham chiếu và sử dụng linh hoạt các icon Lucide có sẵn trong `/template`. Hạn chế tối đa việc lặp lại 1-2 icon giống nhau cho các nhãn/trường dữ liệu khác nhau. Mỗi nhãn/hành động phải có icon tương ứng mô tả đúng ý nghĩa trực quan.
  - **Footer Bảng Phân Trang**: Mọi bảng dữ liệu danh sách và báo cáo của các module đều phải sử dụng component footer phân trang chuẩn (bao gồm: hiển thị số dòng dạng `1-X/Tổng: Y`, dropdown số dòng `/ trang` ở bên trái, và các nút điều hướng phân trang ở góc bên phải) đúng như thiết kế đã thống nhất.
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

## Quy trình Chủ động Tự học hỏi & Auto-Sync (Không cần nhắc)

AI bắt buộc phải chủ động kích hoạt quy trình tự tiến hóa luật nền ngay khi hoàn thành bất kỳ tác vụ sửa lỗi (bug), điều chỉnh giao diện (UI) lệch chuẩn, hoặc nhận bất kỳ phản hồi chỉnh sửa nào từ người dùng, mà KHÔNG cần người dùng phải yêu cầu hay nhắc nhở:

1. **Tự phát hiện & Phân loại bài học**: Khi giải quyết xong một vấn đề/sai sót, AI tự động phân tích xem lỗi/yêu cầu đó có tính chất tổng quát và lặp lại hay không. Phân loại bài học thành các chủ đề tương ứng (Database, UI/Frontend, Auth, Clean Code...).
2. **Tự động Cập nhật Luật nền**: Cập nhật trực tiếp quy tắc hành vi mới vào tệp luật tương ứng tại `.agents/rules/` của dự án (hoặc tạo mới nếu chưa có).
3. **Đồng bộ về Master & KI cục bộ**:
   - Cập nhật quy tắc tương ứng vào thư mục master `P:\agent-rules\antigravity\.agents\`.
   - **Bắt buộc tự động copy** các tệp luật vừa cập nhật sang thư mục KI cục bộ của Antigravity tại `C:\Users\DELL\.gemini\antigravity\knowledge\agent-rules-runtime\artifacts\` để đảm bảo bộ nhớ đệm hoạt động của tác tử luôn ở trạng thái mới nhất.
4. **Xử lý Ngoại lệ 5fedu (Tệp 10-12)**:
   - Các file từ `10` đến `12` của dự án `.agents/5fedu/` chỉ dùng để ghi nhận log phản hồi thô hoặc thông tin đặc thù (link sheet, credential mock).
   - Nếu phát hiện bài học trong đó có tính chất dùng chung (như định dạng Excel, catch lỗi API, footer phân trang), AI bắt buộc phải tự động chuyển hóa (promote) lên các file luật chung (05, 07 hoặc global rules) và xóa bỏ dạng thô trong log phản hồi để tránh làm nhiễu context.
5. **Đồng bộ hóa chéo & Git Commit**:
   - Tự động chạy script `P:\agent-rules\scripts\sync-platform-skills.ps1` để cập nhật chéo sang Codex runtime (`~/.codex/`).
   - Tự động thực hiện `git add -A` và `git commit` tại thư mục master `P:\agent-rules` để lưu vết lịch sử phiên bản của luật.
6. **Báo cáo hành động**: Trong kết quả trả về, AI chủ động liệt kê rõ ràng bài học nào đã tự học và các tệp luật nào đã được cập nhật đồng bộ.

## Quy trình Đọc đầu tiên (First-Read Entry Point)

Khi bắt đầu tiếp nhận bất kỳ phiên làm việc hoặc nhiệm vụ nào, Agent bắt buộc phải tuân thủ thứ tự ưu tiên đọc tài liệu sau để định hướng ngữ cảnh chính xác, tránh đọc tràn lan gây loãng bộ nhớ (ngáo context):

1. **Bước 1 (Định vị bản đồ)**: Đọc tóm tắt **KI Summary** (ở đầu prompt khởi tạo) để nắm danh sách các kỹ năng (skills) đang được đăng ký trên máy.
2. **Bước 2 (Nắm ngữ cảnh dự án)**: Đọc tệp **`10-fast-context.md`** nằm tại `.agents/rules/10-fast-context.md` cục bộ của dự án hiện tại để hiểu ngay cấu trúc mã nguồn, vị trí file nghiệp vụ quan trọng.
3. **Bước 3 (Đọc quy tắc đặc thù)**: Quét thư mục `.agents/rules/` để tìm và đọc các tệp quy tắc đặc thù của riêng dự án đó (ví dụ: `devconnect-xml-drawing.md`, `local-rules.md`, hoặc `.agents/5fedu/AGENTS.md`) liên quan trực tiếp đến Task.
4. **Bước 4 (Lazy-load Skills)**: Chỉ khi cần dùng đến công cụ kiểm thử hoặc tài liệu thiết kế cụ thể, mới gọi `view_file` trên các tệp `SKILL.md` tương ứng. Tuyệt đối không đọc chéo hoặc chèn ép ngữ cảnh của dự án này vào dự án khác.

