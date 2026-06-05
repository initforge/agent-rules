---
description: >-
  BAT BUOC. Quy tac van hanh cot loi cho Antigravity: ngon ngu tieng Viet,
  cach sua file, quality gate, impact analysis, intent audit, template
  reference, tu hoc feedback.
alwaysApply: true
---

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
- Khi cần tìm file hoặc chuỗi ký tự, ưu tiên `rg`/search tool sẵn có. Nếu một tool cụ thể không tồn tại trong session, dùng fallback tương đương và ghi rõ khi fallback ảnh hưởng tới bằng chứng.
- Khi sửa code, giữ scope nhỏ, theo pattern hiện có, verify bằng test/check phù hợp.
- Nếu có API route hoặc contract dùng chung, phải phân tích tác động trước khi sửa.

## Quality Gate

- **Phân biệt Fact, Assumption và Unknown**: Luôn xác minh thực tế trước khi suy luận.
- **Root Cause & Brainstorming**: Với mọi vấn đề (kể cả lỗi code hay thay đổi rules), Agent **bắt buộc phải dành bước đầu tiên để brainstorm và khảo sát tiền trạm**. Nghiêm cấm đề xuất chỉnh sửa ngay lập tức mà không phân tích sâu xa cấu trúc hệ thống.
- **Bảng Phân Tích Tác Động Tĩnh (Static Impact Table)**: Trước khi sửa đổi, Agent bắt buộc phải lập bảng phân tích chỉ rõ:
  1. Tệp sửa đổi trực tiếp.
  2. Các tệp liên quan gián tiếp (bao gồm API, component UI, cấu trúc type liên quan).
  3. Mối tương quan giữa: **Skill** (chỉ dẫn hành vi toàn cục), **Templates/Assets** (mẫu nguồn dùng chung), và **Active Context** (ngữ cảnh thực tế của dự án hiện hành). Khi cập nhật một quy tắc mới, Agent phải rà soát và cập nhật đồng thời ở cả 3 tầng này để tránh đứt gãy tri thức.
- **Giao Thức Phân Tích Ý Đồ & Rà Soát Ngoài Đề (Intent & Out-of-Prompt Audit Protocol)**:
  - Khi tiếp nhận yêu cầu từ người dùng, Agent cấm chỉ đọc bề nổi (literal text). Agent bắt buộc phải thực hiện phân tích 3 tầng:
    1. **Ý đồ ẩn sau (Hidden Intent)**: Xác định mục tiêu thực sự đằng sau yêu cầu (ví dụ: người dùng hỏi lỗi A, ý đồ thực tế có thể là muốn cải thiện tính ổn định của toàn hệ thống/ngăn chặn regressions).
    2. **Rà soát Ngoài Đề (Out-of-Prompt Risks)**: Chủ động truy lùng các nguy cơ/vấn đề không được nhắc trực tiếp trong prompt nhưng có khả năng bị ảnh hưởng (ví dụ: sửa đổi rule làm lệch pha giữa các dự án cục bộ, hoặc thay đổi DB làm hỏng phân quyền).
    3. **Brainstorm & Bàn luận**: Phải chủ động đề xuất và thảo luận các vấn đề phát hiện ngoài đề này với người dùng, thay vì chỉ làm thụ động đúng những gì được ghi trong prompt.
- **Kiểm tra UI/Frontend**: Phải kiểm tra responsive, overflow, spacing, state và browser screenshot khi có thể.
- **Database/Auth/Secret/Permission**: Coi là HIGH risk, hỏi rõ thiếu gì và không bịa schema.

## Antigravity Mapping

- Rules là hợp đồng hành vi ngắn. Mỗi file `.agents/rules/*.md` PHẢI có YAML frontmatter (`description` + `alwaysApply`) để Antigravity biết cách kích hoạt.
- `alwaysApply: true` = inject mọi turn. `alwaysApply: false` = agent tự quyết dựa vào `description`.
- Không có frontmatter = Antigravity mặc định bỏ qua file đó.
- Workflows là quy trình kích hoạt theo slash command.
- Không dùng profile/model config (TOML) trong Antigravity; model và effort do Antigravity runtime tự quản.
- Hooks (`hooks.json`) dùng format Codex CLI nhưng Antigravity IDE KHÔNG chạy hooks. Không dựa vào hooks cho enforcement.
- Global rules nằm tại `~/.gemini/GEMINI.md`, inject vào MỌI conversation MỌI workspace.
- Nếu workflow chuyên biệt tồn tại, ưu tiên gọi workflow thay vì diễn giải lại bằng lời dài.

## Platform Boundary: Antigravity vs Codex

Repo `P:\agent-rules` phục vụ 2 platform: Antigravity (bạn) và Codex CLI (agent khác).

### Hai cơ chế nạp rules KHÁC NHAU HOÀN TOÀN

- **Antigravity (bạn)**: scan `.agents/rules/` → đọc YAML frontmatter → `alwaysApply: true` hoặc model decision.
- **Codex**: đọc `AGENTS.md` → lần theo `@import` chain → nạp nội dung. Không cần frontmatter.

### Antigravity KHÔNG ĐƯỢC làm

1. Không xóa, sửa, cleanup `codex/` directory. Đó là territory của Codex.
2. Không port `codex/agents/*.toml` sang Antigravity. Antigravity không đọc TOML.
3. Không sửa `codex/AGENTS.md` — đó là import chain của Codex.

### Antigravity ĐƯỢC làm

1. Sửa nội dung rule trong `antigravity/.agents/rules/` và `.agents/rules/`.
2. Thêm/sửa frontmatter trong `.agents/rules/*.md`.
3. Đề xuất đồng bộ nếu phát hiện rule khác nội dung giữa 2 platform.
4. Sửa `~/.gemini/GEMINI.md` khi cần cập nhật global rules.

### Khi nào cần đồng bộ

Nếu nội dung rule thay đổi, báo cho user biết cần sync bên Codex. Không tự sửa bên Codex.

## Quy trình Chủ động Tự học hỏi & Auto-Sync (Không cần nhắc)

AI bắt buộc phải chủ động kích hoạt quy trình tự tiến hóa luật nền ngay khi hoàn thành bất kỳ tác vụ sửa lỗi (bug), điều chỉnh giao diện (UI) lệch chuẩn, hoặc nhận bất kỳ phản hồi chỉnh sửa nào từ người dùng, mà KHÔNG cần người dùng phải yêu cầu hay nhắc nhở:

1. **Tự phát hiện & Phân loại bài học**: Khi giải quyết xong một vấn đề/sai sót, AI tự động phân tích xem lỗi/yêu cầu đó có tính chất tổng quát và lặp lại hay không. Phân loại bài học thành các chủ đề tương ứng (Database, UI/Frontend, Auth, Clean Code...).
2. **Tự động Cập nhật Luật nền**: Cập nhật trực tiếp quy tắc hành vi mới vào tệp luật tương ứng tại `.agents/rules/` của dự án (hoặc tạo mới nếu chưa có) khi feedback đã đủ rõ và không cần quyết định thêm.
3. **Đồng bộ về Master & KI cục bộ**:
   - Cập nhật quy tắc tương ứng vào thư mục master `P:\agent-rules\antigravity\.agents\`.
   - **Bắt buộc tự động copy** các tệp luật vừa cập nhật sang thư mục KI cục bộ của Antigravity tại `C:\Users\DELL\.gemini\antigravity\knowledge\agent-rules-runtime\artifacts\` để đảm bảo bộ nhớ đệm hoạt động của tác tử luôn ở trạng thái mới nhất.
4. **Xử lý Ngoại lệ 5fedu (Tệp 10-12)**:
   - Các file từ `10` đến `12` của dự án `.agents/5fedu/` chỉ dùng để ghi nhận log phản hồi thô hoặc thông tin đặc thù (link sheet, credential mock).
   - Nếu phát hiện bài học trong đó có tính chất dùng chung (như định dạng Excel, catch lỗi API, footer phân trang), AI bắt buộc phải tự động chuyển hóa (promote) lên các file luật chung (05, 07 hoặc global rules). Không xóa log thô chỉ vì đã promote; chỉ rút gọn/xóa khi log trùng, nhiễu, đã có bằng chứng rule sống thay thế và việc xóa không làm mất tri thức.
   - **Bảo toàn ngữ cảnh riêng**: Các file thô 10-12 của dự án riêng không được đồng bộ ngược toàn bộ về repository tổng `P:\agent-rules` nếu chứa ngữ cảnh riêng, credential mock, link sheet, hoặc dữ liệu đặc thù. Chỉ promote phần đã tổng quát hóa thành rule tái sử dụng.
5. **Đồng bộ hóa chéo & Git Commit**:
   - Tự động chạy script `P:\agent-rules\scripts\sync-platform-skills.ps1` để cập nhật chéo sang Codex runtime (`~/.codex/`).
   - Không tự `git add`, `commit`, `push` hoặc deploy. Chỉ stage/commit/push khi người dùng yêu cầu rõ trong session hiện tại; khi commit được yêu cầu, chỉ stage đúng file liên quan.
6. **Báo cáo hành động**: Trong kết quả trả về, AI chủ động liệt kê rõ ràng bài học nào đã tự học và các tệp luật nào đã được cập nhật đồng bộ.

## Quy trình Đọc đầu tiên (First-Read Entry Point)

Khi bắt đầu tiếp nhận bất kỳ phiên làm việc hoặc nhiệm vụ nào, Agent bắt buộc phải tuân thủ thứ tự ưu tiên đọc tài liệu sau để định hướng ngữ cảnh chính xác, tránh đọc tràn lan gây loãng bộ nhớ (ngáo context):

1. **Bước 1 (Định vị bản đồ)**: Đọc tóm tắt **KI Summary** (ở đầu prompt khởi tạo) để nắm danh sách các kỹ năng (skills) đang được đăng ký trên máy.
2. **Bước 2 (Nắm ngữ cảnh dự án)**: Đọc tệp **`10-fast-context.md`** nằm tại `.agents/rules/10-fast-context.md` cục bộ của dự án hiện tại để hiểu ngay cấu trúc mã nguồn, vị trí file nghiệp vụ quan trọng.
3. **Bước 3 (Đọc quy tắc đặc thù)**: Quét thư mục `.agents/rules/` để tìm và đọc các tệp quy tắc đặc thù của riêng dự án đó (ví dụ: `devconnect-xml-drawing.md`, `local-rules.md`, hoặc `.agents/5fedu/AGENTS.md`) liên quan trực tiếp đến Task.
4. **Bước 4 (Lazy-load Skills)**: Chỉ khi cần dùng đến công cụ kiểm thử hoặc tài liệu thiết kế cụ thể, mới gọi `view_file` trên các tệp `SKILL.md` tương ứng. Tuyệt đối không đọc chéo hoặc chèn ép ngữ cảnh của dự án này vào dự án khác.
