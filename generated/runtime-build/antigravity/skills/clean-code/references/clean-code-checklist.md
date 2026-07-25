# Clean-Code Checklist & Quality Guidelines

Tài liệu hướng dẫn thực tế về các tiêu chuẩn chất lượng code.

> [!IMPORTANT]
> **Triết lý cốt lõi:** Dễ đọc trước tiên (readability first); thực tế và thực dụng thay vì giáo điều; context quyết định độ nghiêm ngặt; cho phép phá luật khi luật làm code khó hiểu hoặc cồng kềnh hơn (phải ghi rõ lý do trong git commit/report).

---

## 1. Hard-Block List (ÁP DỤNG CHO MỌI LANE - KỂ CẢ TINY)

Cấm tuyệt đối các lỗi thiết kế sau. Nếu vi phạm, task tự động chuyển sang trạng thái `BLOCKED` hoặc `PARTIAL`.

### A. Dữ liệu & Hiệu năng (Performance)
1. **Truy vấn trong vòng lặp (N+1 query):** Không được gọi query DB/API riêng rẽ cho từng item trong vòng lặp. Bắt buộc gom nhóm và dùng `IN`, `findMany` hoặc `JOIN`.
2. **Không phân trang (Load-all DB):** Tránh tải toàn bộ bảng khi dữ liệu lớn mà không có giới hạn `limit/offset` hoặc cursor pagination.
3. **Thiếu index:** Các trường dữ liệu thường xuyên dùng để lọc (`filter`), sắp xếp (`sort`) hoặc liên kết (`join`) bắt buộc phải được đánh index trong DB schema.
4. **Không bọc transaction:** Các luồng nghiệp vụ ghi dữ liệu nhiều bước liên quan (vd: tạo đơn hàng -> trừ kho -> tạo hóa đơn) bắt buộc phải bọc trong transaction để đảm bảo tính toàn vẹn (atomic).

### B. Bảo mật & An toàn (Security)
5. **Tin tưởng client mù quáng:** Không được validate và phân quyền chỉ ở phía client. Mọi API endpoint ở backend bắt buộc phải validate dữ liệu đầu vào và kiểm tra quyền của user (authentication + authorization).
6. **Hardcode secrets:** Cấm ghi trực tiếp API keys, passwords, database credentials, token... vào mã nguồn hoặc repo. Dùng biến môi trường (`.env`).
7. **Lộ thông tin nhạy cảm:** Không được ghi logs các thông tin nhạy cảm của người dùng (password, cookie, token, thông tin thẻ tín dụng).
8. **Thiếu sanitize input:** Dữ liệu người dùng nhập vào phải được làm sạch và escape trước khi đưa vào câu lệnh SQL (chống SQL Injection) hoặc render ra HTML (chống XSS).
9. **Trả lỗi database thô cho client:** Tránh trả trực tiếp stack trace hoặc lỗi DB thô về client vì có thể lộ cấu trúc hệ thống. Hãy bọc lại bằng mã lỗi thân thiện.

### C. Đúng đắn & Trạng thái (Correctness / State)
10. **Thay đổi trạng thái tùy tiện:** Chuyển trạng thái (`status`) của entity phải đi qua hàm kiểm tra logic tập trung (ví dụ: `canChangeStatus(old, new)`) để tránh đi tắt bỏ qua bước duyệt.
11. **Nuốt lỗi (Swallow exception):** Cấm viết khối `catch` rỗng hoặc chỉ ghi log im lặng mà không xử lý/throw tiếp khi gặp lỗi hệ thống nghiêm trọng.

### D. Frontend
12. **Async thiếu trạng thái:** Mọi luồng fetch dữ liệu async bắt buộc phải xử lý đủ 3 trạng thái: `loading`, `empty` (không có dữ liệu) và `error` (gặp lỗi) để tránh crash trắng màn hình.
13. **Re-render vô tội vạ:** Sử dụng đúng cách `memo`, `useMemo`, `useCallback` hoặc cấu trúc lại React component để tránh render thừa gây giật lag UI khi dữ liệu lớn.

---

## 2. Guideline Checklist (Khuyến nghị linh hoạt)

Các quy tắc chất lượng giúp mã nguồn duy trì tốt dài hạn. Có thể linh hoạt thay đổi tùy theo quy mô của file.

### A. Quy mô và Ngưỡng Giới hạn
- **File kích thước lớn:** Treat file > 1000 dòng là một thiết kế có mùi (smell-review), yêu cầu phân tách thành các component/helper con.
- **Component Frontend (React/Vue):** Giới hạn từ 150-250 dòng cho mỗi file component là lý tưởng. Vượt quá ngưỡng này là tín hiệu cần tách component con (smell-review, không phải block cứng).

### B. Quy ước đặt tên (Naming)
- Đặt tên biến, hàm rõ ràng, tường minh ý nghĩa (nói rõ biến chứa gì, hàm làm gì).
- Đồng bộ kiểu đặt tên giữa FE và BE (vd: nếu DB dùng snake_case `user_id`, FE cũng nên giữ hoặc map cẩn thận sang camelCase `userId` tùy theo quy ước đã chốt).

### C. Nguyên tắc DRY & SOLID
- **Luật 3 lần (DRY):** Code lặp lại đến lần thứ 3 thì bắt buộc phải refactor và trích xuất (extract) thành helper/utility dùng chung.
- **SRP (Single Responsibility):** Một hàm hoặc class chỉ nên thực hiện đúng một nhiệm vụ duy nhất.
