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
*   **Khi tạo mới hoặc sửa đổi UI Component:**
    *   Đối chiếu với ít nhất $\ge 1$ component tương tự để đảm bảo tính nhất quán (pattern, trạng thái loading, error, empty).
    *   **Async Button:** Bắt buộc có trạng thái `disabled` + hiển thị `spinner` khi đang chạy, gắn sự kiện `onClick` thực tế và chống double-click.
*   **Xác thực tương tác:** Chạy verify bằng Playwright/Browser automation hoặc chụp ảnh màn hình khi có môi trường test chạy thật; nếu không có, thực hiện dry-run truy vết logic từng bước trong suy nghĩ (thought block).

---

## 3. Logic nghiệp vụ & Phân quyền đa cấp (Multi-level Permission)

*   **Nguyên tắc phân quyền:** Tuyệt đối cấm trường hợp chỉ test với quyền Admin thành công rồi báo `PASS`.
*   **Ma trận phân quyền (Permission Matrix):** Đảm bảo đồng bộ giữa ẩn/hiện trên UI và kiểm tra phân quyền thực tế ở API / Database RLS (Row Level Security).
*   **Tác động chéo (Cross-module):** Sửa đổi bảng dữ liệu A $\rightarrow$ bắt buộc kiểm tra tác động đến bảng B/C (rollup logic, triggers, hoặc cache).
*   **Không tự giả định (Zero Assumption):** Đọc kỹ specs, test cases, hoặc database constraints; cấm tự ý phán đoán quy tắc nghiệp vụ.

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

## 5. Xử lý Lỗi Database (PG/SQL) và Edge Functions trên UI

*   **Bắt lỗi khóa ngoại PostgreSQL thô**:
    *   Mọi tác vụ xóa (DELETE) Thương hiệu, Dòng sản phẩm, Đối tác... có nguy cơ vi phạm ràng buộc khóa ngoại (Foreign Key Constraint) phải được bọc trong `try-catch` tại tầng mutation/service.
    *   Không được để lộ lỗi đỏ của DB lên màn hình. Phải bắt lỗi và hiển thị thông báo Toast tiếng Việt thân thiện: *"Không thể xóa thực thể này do vẫn còn dữ liệu liên quan trong kho. Vui lòng di chuyển hoặc xóa các dữ liệu liên kết trước!"*.
*   **Bắt lỗi Edge Function (employee-auth)**:
    *   Tác vụ đồng bộ/tạo auth nhân sự gọi Edge Function phải được try-catch an toàn. Nếu Edge Function chưa được deploy hoặc lỗi mạng, bắt lỗi và hiển thị Toast cảnh báo chi tiết thay vì crash app, đồng thời thực hiện fallback cập nhật trạng thái cục bộ để tránh làm gián đoạn luồng nghiệp vụ của Admin.
*   **Quy Trình Kiểm Tra Schema Drift (Schema Drift Verification)**:
    *   *Bản chất rủi ro*: Cấu trúc database thực tế có thể bị thay đổi (migration hoặc sửa đổi nóng qua dashboard) mà không khớp với specs.
    *   *Quy định*: Trước khi can thiệp vào bất kỳ code backend/queries nào, Agent bắt buộc phải chạy truy vấn SQL kiểm tra cấu trúc cột thực tế của bảng đích:
        ```sql
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '<tên_bảng>'
        ORDER BY ordinal_position;
        ```
        Đối chiếu trực tiếp với mã nguồn và specs trước khi tiến hành code.


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
*   **Đối chiếu Prompt và Thiết kế Ban đầu (Coverage & Context Audit)**:
    *   *Kỷ luật*: Mọi thay đổi code phải được kiểm tra so khớp dòng-bằng-dòng (match-back) với file tóm tắt yêu cầu để đảm bảo không bị sót hoặc sai lệch ý của người dùng. Cấm việc suy đoán hoặc lược bớt các điều kiện chấp nhận (acceptance criteria).