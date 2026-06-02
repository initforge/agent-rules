# 5fedu Context Index

Đây là bộ ngữ cảnh dự án (project-local context) cho dự án 5fedu. Toàn bộ quy ước và quy tắc của dự án nằm tại đây để Agent chỉ nạp khi làm việc trong repo này.

---

## 1. Hợp Đồng Thực Thi Khắt Khe (Bắt Buộc)

Để tránh tạo ra các lỗi hời hợt ("code lỏ"), code mock ảo, hoặc gây crash ứng dụng trên production, Agent bắt buộc phải tuân thủ quy trình vận hành và kiểm tra sau:

### A. Triệt Tiêu 4 Căn Bệnh Của Agent (Anti-Superficial & Anti-Lazy Rules)

1. **Căn bệnh 1: Không brainstorm/phân tích trước khi làm (No-Blind-Coding)**:
   - *Luật bắt buộc*: Trước khi viết bất kỳ dòng code nào, Agent **bắt buộc phải liệt kê Bảng phân tích tệp ảnh hưởng (Static Impact Table)** trong chat hoặc kế hoạch thực thi. Bảng này phải chỉ rõ:
     - Tệp sửa đổi trực tiếp.
     - Các tệp liên quan gián tiếp (API endpoints, tệp types/interfaces, component UI gọi dữ liệu).
     - Agent phải chứng minh đã đọc toàn bộ các tệp này để hiểu cấu trúc trước khi sửa.

2. **Căn bệnh 2: Không sửa các tệp liên quan (No-Isolated-Fixes)**:
   - *Luật bắt buộc*: Cấm sửa đơn lẻ ở một nơi và bỏ quên các nơi khác. Khi sửa Schema Database, bắt buộc phải cập nhật:
     - TypeScript interfaces/types của dự án.
     - Tầng Service/API (handlers).
     - Tất cả các Component giao diện hiển thị dữ liệu đó (bao gồm form, detail view, và các bộ lọc).

3. **Căn bệnh 3: Xác thực hời hợt, báo cáo sai lệch mục đích (Proof-of-Work Gate)**:
   - *Luật bắt buộc*: Báo cáo kết quả công việc phải đính kèm bằng chứng thực tế:
     - Output của lệnh compile thành công (`npm run build`).
     - Ảnh chụp màn hình (screenshot) hoặc video ghi lại quá trình CRUD, thao tác tính năng thành công trên trình duyệt thực tế, hiển thị rõ URL và dữ liệu thật từ Supabase.
     - Bản đối chiếu side-by-side kết quả chạy thử với spec/Google Sheets gốc để chứng minh không bị lệch mục đích nghiệp vụ.

4. **Căn bệnh 4: Agent lười, code placeholder (Exhaustive Output Policy)**:
   - *Luật bắt buộc*: Nghiêm cấm sử dụng code placeholder (`// Rest of code...`, `// Implement later...`, `// TODO...`). Bắt buộc phải viết đầy đủ 100% logic của tệp tin. Giải quyết triệt để tất cả các trường hợp biên (edge cases) và xử lý lỗi (error catch) đầy đủ, tránh crash runtime.

5. **Căn bệnh 5: Không mặc định sử dụng tiếng Việt cho kế hoạch và phản hồi (Vietnamese-by-Default Policy)**:
   - *Luật bắt buộc*: Agent **bắt buộc phải sử dụng tiếng Việt làm ngôn ngữ giao tiếp mặc định** cho tất cả các bản kế hoạch thực thi (`implementation_plan.md`), danh sách công việc (`task.md`), tóm tắt thay đổi (`walkthrough.md`) và tất cả các phản hồi hội thoại trực tiếp với người dùng. Chỉ viết tiếng Anh khi người dùng yêu cầu rõ ràng hoặc trong code/comments kỹ thuật.

6. **Căn bệnh 6: Không test liên đới, bỏ qua logic nghiệp vụ chéo (Cross-Module Impact Testing)**:
   - *Luật bắt buộc*: Khi kiểm thử một thay đổi, nghiêm cấm chỉ kiểm thử cô lập dòng code đó. Agent **bắt buộc phải test toàn bộ luồng nghiệp vụ chéo và các mối liên kết dữ liệu liên quan** (ví dụ: sửa công thức/địa điểm lương chuyến phải test trực tiếp sang tính năng Chuyến xe xem tổng tiền có tự tính lại không; sửa Nhân sự/Tài xế phải kiểm tra xem trang tính Lương tài xế có bị truy vấn lỗi không). Phải xác nhận dữ liệu thật chạy đúng dòng chảy logic (cascade/rollup) trước khi báo cáo thành công.

7. **Căn bệnh 7: Nói chuyện không bằng chứng, tự suy diễn (Evidence-First Assertion)**:
   - *Luật bắt buộc*: Nghiêm cấm Agent giả định hành vi hệ thống hoặc tự ý đưa ra kết luận lỗi mà không có bằng chứng kỹ thuật. Mọi phát biểu hoặc giải thích phải đi kèm **bằng chứng thực tế rõ ràng**:
     - Vị trí dòng code cụ thể (tên tệp tin + dòng code thực tế).
     - Log chi tiết từ Terminal, Console lỗi trình duyệt, hoặc API response.
     - Dữ liệu thực truy vấn được từ Supabase Database.

8. **Căn bệnh 8: Tư duy kiểm thử đối phó, thiếu End-to-End thực tế (Surface-Level Testing & Compliance Bias)**:
   - *Luật bắt buộc*: Nghiêm cấm Agent đưa ra các kế hoạch và hành động kiểm thử mang tính đối phó, "chỉ làm cho có lệ" (ví dụ: chỉ chạy `npm run build`, mở giao diện local xem cột/phân quyền hiển thị chưa rồi kết luận tính năng chạy tốt).
   - *Quy trình bắt buộc cho kiểm thử Phân quyền (Permission E2E Verification)*: Agent **bắt buộc phải thực hiện kiểm thử End-to-End (E2E) chéo vai trò thực tế**:
     1. Chuẩn bị/Tạo mới ít nhất **3 tài khoản kiểm thử đại diện cho các nhóm phân quyền khác nhau** (ví dụ: 1 Admin/Cấp 1 có toàn quyền, 1 Trưởng phòng/Cấp 2 có quyền xem/sửa phòng ban, 1 Nhân viên/Cấp 4 chỉ được xem/sửa phiếu cá nhân).
     2. Đăng nhập lần lượt vào từng tài khoản trên trình duyệt thực tế (hoặc dùng Playwright subagent) để xác nhận:
        - Giao diện có ẩn/hiển thị đúng các nút CRUD, cột dữ liệu và menu tương ứng hay không.
        - Thử cố ý thực hiện hành động trái phép (ví dụ: dùng tài khoản Nhân viên cấp 4 truy cập trực tiếp URL của chức năng Điều phối, hoặc gọi API sửa bản ghi của phòng ban khác) để chứng minh hệ thống chặn thành công.
     3. Thực hiện thay đổi quyền của một chức vụ (ví dụ: tắt quyền sửa của Cấp 2), đăng nhập lại ngay lập tức để kiểm chứng xem thay đổi phân quyền có **áp dụng ngay lập tức (apply immediately)** trên giao diện và API hay không.
     4. Trình bày bằng chứng kiểm thử bằng hình ảnh/video thực tế chụp lại kết quả từ các tài khoản khác nhau này. Mọi báo cáo bàn giao không có bằng chứng E2E chéo tài khoản sẽ bị coi là **Chưa hoàn thành**.

### B. Quy Tắc Tránh Code Lỏ Về UI (Anti-Lỏ UI Policies)
1. **Tuyệt đối cấm Mock ảo**: Tất cả các hành động (nhập liệu, lưu, xóa, sửa, duyệt) trên giao diện phải kích hoạt API/Service thật để cập nhật database. Nếu chưa có credentials hoặc API, phải báo Blocked chứ không dùng code mock ảo (`setTimeout` hay `toast` ảo) đánh lừa người dùng.
2. **Không dùng thẻ Select thô**: Các trường khóa ngoại trỏ đến danh mục lớn (Tài xế, Xe, Địa điểm, Chuyến xe) bắt buộc phải dùng `Combobox` hoặc `AsyncCombobox` hỗ trợ tìm kiếm. Cấm dùng thẻ `<select>` mặc định của trình duyệt.
3. **Tuân thủ Drawer Layout chuẩn**: Các Drawer chi tiết phải có footer split-layout: nút Đóng (ghost/outline compact) ở bên trái, nút Sửa (primary) và nút Xóa (destructive/outline) nằm bên phải. Sử dụng các hàm nhãn nút chuẩn từ `lib/button-labels.ts` (như `BTN_CLOSE()`, `BTN_EDIT()`, `BTN_DELETE()`).

### C. Quy Trình Vận Hành 5 Bước
1. **Bước 1: Phân tích Tĩnh & Rà soát Gaps**: Trước khi viết code, rà soát side-by-side với **Golden Reference (phân hệ Nhân viên)** để tìm và vá toàn bộ khoảng trống giao diện (gaps) trong file hiện tại.
2. **Bước 2: Cài đặt & Phòng vệ Hoisting**: Định nghĩa các callback handler ngay sau state ở đầu component. Cấm tham chiếu callback trong `useMemo`/`useCallback` trước dòng định nghĩa handler (tránh lỗi Temporal Dead Zone - TDZ).
3. **Bước 3: Biên dịch Cục bộ (Local Compile Check)**: Trước khi commit, bắt buộc phải chạy `npm run build` hoặc `npm run type-check` cục bộ. Mọi lỗi biên dịch, TypeScript, hoặc import thiếu Lucide icons phải được sửa triệt để.
4. **Bước 4: Browser Automation Test**: Dùng browser subagent/Playwright mở localhost, đăng nhập `admin` / `5fedu.com`, thực hiện chuỗi kiểm thử CRUD đầy đủ trên tính năng vừa sửa. Chụp ảnh/quay video màn hình làm bằng chứng.
5. **Bước 5: Hậu kiểm Production (Verify-on-Production)**: Sau khi Vercel tự động build và deploy từ GitHub push, lặp lại Bước 4 trên live link để phát hiện các lỗi chặn cookie/bảo mật đặc thù của môi trường.

### D. Quy Trình CI/CD & Deploy Tự Động Trên Vercel
1. **Tự động hóa CI/CD**: Dự án đã được liên kết trực tiếp với repository GitHub để Vercel tự động build và deploy mỗi khi có commit mới trên nhánh `main`.
2. **Tuyệt Đối Cấm Sử Dụng Vercel CLI (No-Vercel-CLI-Deployments)**:
   - Nghiêm cấm AI chạy bất kỳ lệnh Vercel CLI nào (như `vercel`, `vercel link`, `vercel deploy`, `vercel --prod`). Việc sử dụng CLI sẽ tạo ra các bản deploy độc lập/trùng lặp ngoài luồng kiểm soát của GitHub, gây lãng phí tài nguyên và sai lệch môi trường.
   - AI thực hiện `git push` như bình thường để cập nhật code. Trước khi push, nên chạy biên dịch cục bộ (`npm run build`) để tự tin mã nguồn không có lỗi cú pháp.
3. **Kiểm tra trạng thái từ xa (Remote Auditing)**: Sau khi `git push`, AI bắt buộc sử dụng `browser_subagent` truy cập trang GitHub Commits hoặc Dashboard Vercel để trực tiếp xác minh trạng thái build thành công (tích xanh) trước khi báo cáo hoàn thành.


---

## 2. Thư Mục Ngữ Cảnh 5fedu (5-Document System)

Quy hoạch tài liệu được băm nhỏ thành 4 trụ cột để Agent nạp theo nhu cầu (Lazy-loading):

*   **[01-architecture-and-specs.md](file:///p:/tahdieuphoi/.agents/5fedu/01-architecture-and-specs.md)**: Sơ đồ cấu trúc, tech stack, template tham chiếu `TAH_app`, Google Sheets source map.
*   **[02-database-and-auth-rules.md](file:///p:/tahdieuphoi/.agents/5fedu/02-database-and-auth-rules.md)**: Thiết kế DB (`id int8` auto increment, foreign keys, triggers, auto rollup), cơ chế đồng bộ Supabase Auth user và app-side permissions.
*   **[03-ui-ux-and-delivery-standards.md](file:///p:/tahdieuphoi/.agents/5fedu/03-ui-ux-and-delivery-standards.md)**: Quy chuẩn thiết kế Master-Detail, Drawers xếp chồng, icons trong ô bảng, TDZ prevention, định dạng Excel (cell type `'n'`) và font Unicode trong PDF.
*   **[04-decision-status-and-backlog.md](file:///p:/tahdieuphoi/.agents/5fedu/04-decision-status-and-backlog.md)**: Trạng thái chốt duyệt (`DA_CHOT`/`CHUA_CHOT`), danh sách câu hỏi mở và nhật ký raw feedback của owner.
*   **[05-source-specs-and-coverage.md](file:///p:/tahdieuphoi/.agents/5fedu/05-source-specs-and-coverage.md)**: Bảng đối chiếu spec Sheets với mã nguồn để kiểm tra độ phủ (coverage).

---

## 3. Cách Nạp Context Tiết Kiệm (Lazy-loading Policy)

`AGENTS.md` ở root dự án là con trỏ nhẹ, không ép nạp toàn bộ tài liệu mỗi lượt. Khi bắt đầu một task:
1. Agent bắt buộc phải đọc 3 file nền: `00-index.md`, `04-decision-status-and-backlog.md` (để kiểm tra trạng thái chốt và các câu hỏi) và `questions.md` (nếu có).
2. Sau đó, dựa vào scope công việc để nạp thêm **duy nhất** file chủ đề liên quan (ví dụ: làm backend/DB thì chỉ nạp thêm `02-database-and-auth-rules.md`).
3. Cách nạp này giữ context cực kỳ tinh gọn (<15KB), tránh làm Agent bị nhiễu loạn thông tin.

---

## 4. Phân Biệt Nền Tảng Độc Lập (.agents/ vs .codex/)

Dự án hỗ trợ song song hai cấu hình độc lập:
*   **`.agents/5fedu/`** dành riêng cho Antigravity runtime.
*   **`.codex/5fedu/`** dành riêng cho Codex CLI runtime.
Tuyệt đối không nhầm lẫn đường dẫn hoặc trộn lẫn cấu hình của hai nền tảng với nhau.

---

## 5. Quy Trình Bảo Toàn & Tiến Hóa Ngữ Cảnh (Context Preservation Contract)

Mỗi khi Agent thực hiện tái cấu trúc, gộp tệp tin, hoặc tối ưu hóa bộ ngữ cảnh, Agent **bắt buộc** phải tuân theo 3 nguyên tắc bảo toàn tri thức sau:
1. **Cấm tự ý cắt giảm luật chi tiết (No-Implicit-Pruning)**: Nghiêm cấm Agent tự ý xóa hoặc viết chung chung hóa các luật nghiệp vụ cụ thể (như cấu trúc cột DB, phân quyền chi tiết, cơ chế cascading lock, RLS policies, các lỗi đã fix) để làm tài liệu "ngắn đi" hoặc "đẹp hơn". Tinh gọn chỉ được phép thực hiện bằng cách tổ chức lại cấu trúc file cho mạch lạc, giữ nguyên 100% chi tiết kỹ thuật.
2. **Quy trình Kiểm tra Sự bảo toàn (Information Conservation Audit)**: Trước khi lưu đè hoặc xóa bất kỳ file ngữ cảnh cũ nào, Agent phải chạy một bản tự kiểm (Self-Audit) trong chat, ghi rõ:
   - Danh sách các luật cụ thể đang có ở file cũ.
   - Chỉ ra vị trí dòng code/dòng text tương ứng chứa luật đó trong cấu trúc file mới.
   - Đảm bảo tỷ lệ bảo toàn tri thức là 100%.
3. **Tiến hóa tri thức thông qua backlogs**: Bất kỳ phản hồi mới nào từ owner phải được tích hợp song song vào `04-decision-status-and-backlog.md` (nhật ký) và định nghĩa thành luật vĩnh viễn ở Pillar tương ứng (01, 02, 03) ngay lập tức, không để trôi nổi thông tin.
