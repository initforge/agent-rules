---
alwaysApply: true
---

# Chất lượng mã nguồn & Nợ kỹ thuật (Code Quality & Technical Debt)

Bộ quy định kiểm soát chất lượng code, chống lỗi hồi quy (Anti-regression), kỷ luật phân quyền, và quản lý nợ kỹ thuật (Technical Debt Budget).

---

## 1. Mã nguồn sạch (Clean Code)

*   **Kích hoạt khi:** Thực hiện viết mới, sửa đổi, review, hoặc viết test code.
*   **Triết lý:** Viết code hướng tới người đọc; tuân thủ YAGNI (chỉ viết những gì cần thiết); giảm tối đa vùng ảnh hưởng (blast radius); Clean Code là để kiểm soát rủi ro bảo mật chứ không phải để phô diễn kỹ thuật.
*   **Kích thước tiêu chuẩn (Soft limit):** Một file tối đa ~300 dòng, một hàm tối đa ~30 dòng, và độ lồng nhau (nesting level) tối đa ~3 cấp.
*   **Tái cấu trúc (Refactoring):** Phân tách rõ ràng giữa việc thay đổi hành vi code (behavior change) và việc refactor. Tái cấu trúc có giám sát (Guarded Refactor) bắt buộc phải có plan và đánh giá vùng ảnh hưởng.

### Phân loại dọn dẹp mã nguồn (Cleanup Classes)

| Loại cleanup | Điều kiện áp dụng |
|---|---|
| **Opportunistic** (Tiện tay) | Cleanup nhỏ, cùng file đang sửa, hoàn toàn không đổi hành vi code |
| **Guarded** (Giám sát) | Bắt buộc lập plan + verify độc lập + scope lock |
| **Dead code** (Code rác) | Kiểm tra call-sites bằng `rg` hoặc GitNexus để đảm bảo không ai gọi trước khi xóa |
| **Cosmetic** (Làm đẹp) | Tránh thay đổi cosmetic mặc định nếu không liên quan tới task |

---

## 2. Chống lỗi hồi quy (Anti-regression) & Pattern Parity

*   **Trước khi chỉnh sửa Shared Logic (Logic dùng chung):**
    1.  Dùng `rg` hoặc công cụ tìm kiếm để quét tất cả call-sites và imports.
    2.  Chứng minh rõ ràng thay đổi không làm gãy các module downstream.
*   **Khi tạo mới hoặc sửa đổi UI Component (Quy tắc React & State):**
    *   Đối chiếu với ít nhất $\ge 1$ component tương tự để đảm bảo tính nhất quán (pattern, trạng thái loading, error, empty).
    *   **Async Button (Nút bất đồng bộ):** Bắt buộc có trạng thái `disabled` + hiển thị `spinner` (hoặc loading indicator) khi đang thực thi tác vụ bất đồng bộ, gắn sự kiện `onClick` thực tế và chống double-click.
    *   **Kỷ Luật Khai Báo React Hooks (Hooks Order Rule):** Tuyệt đối không viết các khối lệnh kiểm tra điều kiện và trả về JSX sớm (như `if (isLoading) return ...` hoặc `if (!data) return ...`) ở phía trên các khai báo React Hook khác (như `useMemo`, `useCallback`, `useEffect`). Toàn bộ các hook bắt buộc phải được khai báo ở đầu component, và các lệnh kiểm tra điều kiện trả về UI thay thế phải nằm ở cuối cùng của component, ngay trước khối `return` chính.
    *   **Đồng bộ Trạng thái Dữ liệu Chi Tiết (Detail State Sync):** Khi hiển thị chi tiết của một thực thể qua drawer/popup, tuyệt đối không truyền trực tiếp state thô đã lỗi thời vào component drawer (dữ liệu sẽ không tự cập nhật sau khi mutation/update thành công). Phải luôn sử dụng cơ chế query cache hoặc đồng bộ hóa qua store/React Query để tìm bản ghi mới nhất từ danh sách đang cache (Ví dụ: `const currentViewingRow = useMemo(() => rows.find(r => String(r.id) === String(viewingRow.id)) || viewingRow, [viewingRow, rows]);`).
    *   **Phòng Vệ Kiểu Dữ liệu Ngày Tháng (Date Parsing Robustness):** Tuyệt đối không sử dụng `new Date(dateString + "T00:00:00")` để so sánh hoặc tính toán năm/tháng vì gây lỗi `Invalid Date` hoặc sai lệch múi giờ trên các trình duyệt nghiêm ngặt (như Safari hoặc hệ điều hành iOS). Bắt buộc sử dụng phân tách chuỗi `dateString.split(/[-T]/)` hoặc các thư viện chuẩn hóa (như date-fns/dayjs) để trích xuất trực tiếp giá trị năm và tháng dưới dạng số.
*   **Chuẩn Hóa Tiện Ích Tải File (Base64 Normalization):**
    *   Trong hàm giải mã base64 của tiện ích download (`triggerFileDownload` hoặc tương đương), bắt buộc phải chuẩn hóa chuỗi base64 (ví dụ bằng cách gọi `decodeURIComponent(rawData)`) trước khi gọi `window.atob`. Điều này đảm bảo Blob URL luôn được sinh ra thành công đối với tất cả các link file Excel/PDF/CSV chứa ký tự Unicode đặc biệt.
*   **Xác thực tương tác:** Chạy verify bằng Playwright/Browser automation hoặc chụp ảnh màn hình khi có môi trường test chạy thật; nếu không có, thực hiện dry-run truy vết logic từng bước trong suy nghĩ (thought block).



---

## 3. Logic nghiệp vụ & Phân quyền đa cấp (Multi-level Permission)

*   **Nguyên tắc phân quyền:** Tuyệt đối cấm trường hợp chỉ test với quyền Admin thành công rồi báo `PASS`.
*   **Ma trận phân quyền (Permission Matrix):** Đảm bảo đồng bộ giữa ẩn/hiện trên UI và kiểm tra phân quyền thực tế ở API / Database RLS (Row Level Security).
*   **Tác động chéo (Cross-module):** Sửa đổi bảng dữ liệu A $\rightarrow$ bắt buộc kiểm tra tác động đến bảng B/C (rollup logic, triggers, hoặc cache).
*   **Không tự giả định (Zero Assumption):** Đọc kỹ specs, test cases, hoặc database constraints; cấm tự ý phán đoán quy tắc nghiệp vụ.
*   **Cảnh Giác Với Code Mock Auth/Session**:
    *   Khi phát triển/sửa đổi các tính năng bảo mật cốt lõi (Đổi mật khẩu, Đăng xuất, Phân quyền), nghiêm cấm sử dụng code mock ở Client (như setTimeout/toast ảo). Bắt buộc phải kết nối và gọi API/Services thực tế ở Server để đảm bảo tính an toàn.
*   **Kiểm Tra Đối Chiếu Phân Quyền Bắt Buộc (Permission Cross-Reference Gate)**:
    *   *Bước 1: Đối chiếu Context $\rightarrow$ Code (Spec-to-Code Trace)*: Rà soát kỹ lưỡng file specs/rules phân quyền của dự án. Với mỗi quy tắc (xem/thêm/sửa/xóa theo vai trò, cấp bậc, phòng ban, người tạo), phải định vị chính xác dòng code tương ứng chịu trách nhiệm kiểm tra logic đó trong module permissions của hệ thống.
    *   *Bước 2: Đối chiếu Code $\rightarrow$ Dòng Dữ Liệu (Implementation-to-Runtime Trace)*: Với mỗi trường/biến dùng để phân quyền dòng dữ liệu (như `id_phong_ban`, `capBac`, `employeeRecord`), phải trace ngược và xác nhận biến đó được hydrate đầy đủ lúc runtime; cấm để biến nhận giá trị rỗng/undefined làm sập hoặc ẩn sạch bảng dữ liệu.
    *   *Bước 3: Kiểm thử end-to-end cho từng cấp bậc vai trò*: Khi code xong phân quyền, bắt buộc phải giả lập kiểm thử tối thiểu trên 3 kịch bản tài khoản: Admin (quyền tối cao), Quản lý/Trưởng phòng (chỉ thấy dữ liệu thuộc phòng ban/chi nhánh), và Nhân sự thường (chỉ thấy dữ liệu do mình tạo hoặc liên đới trực tiếp).
*   **Không phân quyền phân mảnh (No Local Permissions)**:
    *   Quyền truy cập phải do tầng phân quyền tập trung quyết định (Role/RLS/Policy/Permission module), không nhét checkbox quyền xem/sửa/xóa cục bộ vào form của từng thực thể nghiệp vụ nếu hệ thống đã có cơ chế phân quyền chung.
    *   Nếu một module thật sự cần exception theo bản ghi, phải ghi rõ đây là yêu cầu nghiệp vụ có spec/owner chốt, trace được từ UI -> API -> DB policy và verify bằng nhiều vai trò tài khoản.


---

## 4. Quản lý nợ kỹ thuật (Technical Debt Control)

*   **Kích hoạt khi:** Thực hiện code, fix bug, review, refactor, dọn dẹp (cleanup), hoặc chuẩn bị commit/push code.
*   **Phân loại nợ (Taxonomy):** Correctness (tính đúng đắn), Data (dữ liệu), Permission (phân quyền), UX (trải nghiệm), Architecture (kiến trúc), Test (kiểm thử), Operational (vận hành), và Knowledge (tài liệu/kiến thức).
*   **Ngân sách nợ (Debt Budget):** Chỉ được phép để lại nợ kỹ thuật khi nó không phá vỡ điều kiện nghiệm thu (Acceptance Criteria), không che giấu lỗi nghiêm trọng, có lý do rõ ràng và được ghi nhận tại mục `Remaining debt`.
*   **Không để lại nợ nếu có thể xử lý ngay trong scope:**
    *   Các cảnh báo build/lint phát sinh do chính task này tạo ra.
    *   Nút bấm chết (dead button), CRUD giả lập (fake CRUD).
    *   Quy trình phân quyền chỉ hoạt động với Admin.
    *   Chức năng Export/Tải file không thực hiện tải dữ liệu thật.
    *   Dự án 5fedu UI không đối chiếu với giao diện `/template`.
    *   Các rules mới tự đặt ra trong hội thoại chat mà không được cập nhật vào tệp rules trên đĩa.

*   **Cổng kiểm soát nợ kỹ thuật (Pre-done Gate):**
    1.  Task này có phát sinh thêm nợ mới không?
    2.  Nợ nào có thể sửa ngay được trong turn hiện tại?
    3.  Các artifact tạm thời (scratch files) đã được dọn dẹp hoặc thêm vào `.gitignore` chưa?
    4.  Tài liệu context/decision của dự án có cần cập nhật không?

*   **Định dạng báo cáo Nợ kỹ thuật (Task trung bình/lớn):**
    ```text
    Technical debt check:
    - New debt: none | <mô tả nợ mới phát sinh>
    - Remaining debt: none | <mô tả nợ còn tồn đọng>
    ```

*   **Định nghĩa nợ kỹ thuật trong 5fedu:** Deploy nhưng chưa chạy verify trên production thực tế; UI lệch so với template chuẩn; phân quyền chưa test với đa tài khoản; database schema chưa được sync.

---

## 5. Xử lý Lỗi Database và Edge Functions/APIs

*   **Bắt lỗi vi phạm ràng buộc dữ liệu (DB Constraint Exception Handling):**
    *   Mọi tác vụ ghi/xóa (MUTATE/DELETE) có nguy cơ vi phạm ràng buộc dữ liệu (ví dụ: Foreign Key Constraint trong RDBMS/PostgreSQL) phải được bọc trong cấu trúc `try-catch` an toàn tại tầng mutation/service/repository tương ứng.
    *   Nghiêm cấm việc để lộ thông tin lỗi DB thô kỹ thuật (raw database error) lên giao diện người dùng. Phải bắt lỗi và hiển thị thông báo thân thiện bằng tiếng Việt (Ví dụ: thông báo Toast giải thích thực thể không thể xóa do đang được liên kết với dữ liệu khác).
*   **Bắt lỗi tích hợp dịch vụ/APIs ngoài (Edge Function/External API Resilience):**
    *   Các tác vụ tích hợp gọi API bên ngoài hoặc Edge Functions (ví dụ: dịch vụ xác thực, đồng bộ hóa) phải được bắt lỗi (try-catch) và xử lý ngoại lệ chu đáo. Nếu dịch vụ gặp sự cố hoặc lỗi mạng, phải Toast cảnh báo chi tiết và thực hiện cơ chế fallback (cập nhật trạng thái offline/cục bộ tạm thời nếu có thể) để không làm crash ứng dụng hoặc làm gián đoạn luồng trải nghiệm chính.
*   **Quy Trình Kiểm Tra Schema Drift (Schema Drift Verification):**
    *   *Bản chất rủi ro*: Cấu trúc database thực tế ở môi trường development/staging có thể bị thay đổi nóng hoặc không khớp với định nghĩa trong mã nguồn/specs.
    *   *Quy định*: Trước khi can thiệp vào bất kỳ code truy vấn/repository nào, Agent bắt buộc phải chạy truy vấn kiểm tra cấu trúc cột thực tế của bảng đích (Ví dụ đối với PostgreSQL: truy vấn thông tin bảng từ `information_schema.columns`). Đối chiếu trực tiếp với mã nguồn và specs trước khi tiến hành code.
*   **Bảo Đảm Nhất Quán Số Liệu Tự Tính (Database-level Roll-ups & Dynamic Calculation):**
    *   *Quy định*: Các trường dữ liệu tổng hợp (như tổng số lượng, tổng tiền) có thể tính toán động ở phía Client, nhưng ở phía Database hoặc các APIs downstream vẫn phải được đồng bộ chính xác. Bắt buộc phải triển khai cơ chế đảm bảo (như DB Triggers ở Database hoặc các API hook đồng bộ ở Server) để dữ liệu tổng hợp luôn chính xác khi truy xuất từ bất kỳ API bên thứ ba nào.
*   **Phòng Vệ Kiểu Dữ liệu Trường Liên Kết Trống trên Form (Foreign Key Normalization):**
    *   *Quy định*: Khi biểu mẫu (Form) có trường chọn liên kết trỏ đến bảng khác (Foreign Key relation) và trường đó không bắt buộc (`required: false`), giá trị mặc định của trường khi gửi lên database/repository phải được chuẩn hóa thành `null` thay vì chuỗi rỗng `''` hoặc số `'0'`. Hàm chuẩn hóa form bắt buộc phải xử lý chuyển đổi này để tránh các lỗi ép kiểu dữ liệu của Database (ví dụ lỗi PostgreSQL: `invalid input syntax for type bigint: ""`).
*   **Kỷ luật Quản lý Dependency & Deploy (Package Manager & Build Gates):**
    *   *Quy định*: Khi build hoặc nâng cấp dependencies, tuyệt đối cấm dùng các cờ ép buộc tiêu cực (như `--force` hoặc `--legacy-peer-deps` trong npm) để che giấu lỗi xung đột peer dependency. Phải rà soát và giải quyết triệt để xung đột phiên bản. Nghiêm cấm dùng các cảnh báo bảo mật tĩnh (như kết quả `npm audit`) làm rào cản ngăn chặn cài đặt các dependency hợp lệ khi chúng thực sự không có lỗi build/runtime.




---

## 6. Kỷ luật Khắc phục Sự cố & Kiểm soát Vận hành (Operational & Fix Controls)

*   **Chống Tư Duy Sửa Lỗi Hời Hợt (Anti-Superficial Bug Fixing & Audit Everything)**:
    *   *Bản chất sai lầm*: Khi fix bug, chỉ nhìn nhận bề nổi của lỗi (ví dụ: chỉ sửa logic UI hoặc chỉ đổi khóa ngoại DB) mà không audit toàn diện các luồng liên đới, dẫn đến lỗi dây chuyền (như cascade delete ở DB kích hoạt trigger gây ra lỗi khóa ngoại mới do insert vào bảng liên quan).
    *   *Kỷ luật bắt buộc (1 Phát Ăn Luôn)*: Khi sửa bất kỳ lỗi nào, phải thực hiện phân tích tĩnh (static analysis) và trace toàn bộ luồng thực thi:
        *   Nếu thay đổi DB schema (khóa ngoại, cascade): Phải rà soát tất cả các database triggers (`AFTER/BEFORE INSERT/UPDATE/DELETE`) trên các bảng bị ảnh hưởng để đảm bảo trigger không thực hiện insert/update các bản ghi vừa bị xóa, gây vi phạm khóa ngoại.
        *   Phải đặt kiểm tra phòng vệ trong trigger (ví dụ: `if not exists (select 1 from public.var_nhan_vien where id = v_id) then return null; end if;`) nếu trigger thực hiện đồng bộ hoặc tính toán tổng hợp.
        *   Nếu sửa đổi cơ chế giao tiếp trình duyệt (tải file, APIs): Phải đảm bảo không phá vỡ cơ chế kích hoạt đồng bộ của người dùng (user activation gesture). Tuyệt đối cấm sử dụng các phương thức bất đồng bộ trung gian (như FileReader onload) nằm ngoài tầm kiểm soát của gesture trước lệnh download để tránh bị trình duyệt chặn hoàn toàn.
        *   Tuyệt đối không được vội vàng kết luận lỗi đã được sửa khi chưa audit và kiểm tra kỹ lưỡng toàn bộ chuỗi tác động.
*   **Kỷ Luật Cấm Deploy Thủ Công Trên Production (No Manual Terminal Deployment Rule)**:
    *   *Bản chất quy tắc*: Việc tự ý chạy lệnh deploy trực tiếp từ terminal (như `vercel --prod` hay tương đương) từ phía AI có thể gây xung đột trạng thái build, ghi đè không mong muốn các bản phân phối ổn định, hoặc lộ bí mật môi trường.
    *   *Quy tắc cứng*: AI tuyệt đối không bao giờ được tự chạy lệnh deploy ứng dụng lên production thông qua terminal. AI chỉ thực hiện sửa code, kiểm thử local để đảm bảo chất lượng, commit và push mã nguồn lên repository và báo cáo kết quả để hệ thống CI/CD tự động xử lý hoặc người dùng kiểm tra độc lập.
*   **Tiêu chuẩn An Toàn Kiểm Thử E2E Production (E2E Test Safety Gates)**:
    *   *Bảo toàn dữ liệu thực tế (Data Safety)*: Mọi ca kiểm thử E2E có thay đổi dữ liệu (mutating tests) bắt buộc phải chụp snapshot dữ liệu trước khi test và khôi phục (restore) nguyên trạng dữ liệu ngay khi kết thúc test (thông qua hook `afterAll` hoặc `afterEach`).
    *   *Assert Database an toàn*: Chỉ thực hiện kiểm tra so sánh (assert) trực tiếp trên database khi các biến môi trường cấu hình DB credentials (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) tồn tại hợp lệ. Nếu thiếu, ghi nhận trạng thái kiểm thử là `PARTIAL` (chỉ kiểm thử UI), cấm để bộ test bị crash.
*   **Đối chiếu Prompt và Thiết kế Ban đầu (Coverage & Context Audit)**:
    *   *Kỷ luật*: Mọi thay đổi code phải được kiểm tra so khớp dòng-bằng-dòng (match-back) với file tóm tắt yêu cầu để đảm bảo không bị sót hoặc sai lệch ý của người dùng. Cấm việc suy đoán hoặc lược bớt các điều kiện chấp nhận (acceptance criteria).
