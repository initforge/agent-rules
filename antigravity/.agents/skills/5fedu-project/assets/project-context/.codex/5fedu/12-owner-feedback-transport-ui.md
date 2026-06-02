# Bài học kinh nghiệm: Tránh lỗi giao diện không chuẩn hóa & Lỗi khởi tạo trên Production

> [!IMPORTANT]
> Tài liệu này đúc rút bài học sâu sắc từ việc nâng cấp phân hệ Quản lý vận tải nhằm đạt parity với phân hệ Nhân viên chuẩn. Các lỗi này phát sinh do sự thiếu linh hoạt khi tiếp nhận yêu cầu, không so sánh đối chiếu kỹ cả 2 bên và thiếu sót khi kiểm tra thứ tự khởi tạo/import.

## 1. Nguyên nhân cốt lõi của các lỗi vừa qua

1. **Thiếu linh hoạt & Chưa đối chiếu cẩn thận cả 2 phía**:
   - Khi tiếp nhận yêu cầu chuẩn hóa, ta chỉ tập trung làm theo cấu trúc Nhân viên nhưng không rà soát kỹ các cấu hình hiện có của Vận tải (ví dụ: các giá trị Trạng thái, các trường thông tin ẩn/hiện, cách hiển thị avatar).
   - Dẫn đến việc bỏ sót nút "Sửa 1 dòng" trên Bulk Actions và ghi sai nhãn nút từ "Ngừng hoạt động" thành "Tắt" (làm lệch chuẩn so với thiết kế ban đầu).
2. **Lỗi biên dịch & Lỗi Runtime trên Production**:
   - **Lỗi thiếu import**: Sử dụng icon mới `<Power />` trong giao diện nhưng quên không import từ thư viện `lucide-react` ở đầu file.
   - **Lỗi Temporal Dead Zone (TDZ) / `ReferenceError`**: Khai báo hàm `const askApprove = ...` ở phía cuối component, nhưng lại đưa nó vào mảng dependency của `useMemo` (`bulkStatusActions`) được khai báo ở phía trước. Khi React render component lần đầu, `bulkStatusActions` được tính toán trước khi biến `askApprove` được gán giá trị, gây ra lỗi crash trắng màn hình trên môi trường production.

---

## 2. Bài học và Quy trình kiểm soát chất lượng bắt buộc (Quality Gates)

Để không bao giờ lặp lại các lỗi trên, mọi thay đổi giao diện hoặc logic phải tuân thủ nghiêm ngặt:

### Quy tắc 1: Luôn đối chiếu side-by-side với Template gốc
- Trước khi chỉnh sửa bất kỳ module nghiệp vụ nào, phải mở mã nguồn của **Nhân viên (Golden Reference)** và file cần sửa để so sánh từng phần:
  - **Toolbar**: Có đầy đủ các nút bulk actions chưa? Khi chọn 1 dòng và nhiều dòng thì nút nào hiện/ẩn?
  - **Detail View Drawer**: Có đầy đủ Profile Card và `DetailToolbar` quick actions (Đổi trạng thái, Call, Mail...) chưa?
  - **Footer Drawer**: Có tuân thủ quy tắc `DETAIL_FOOTER_ORDER` (`Đóng` bên trái, `Sửa` và `Xóa` bên phải) không?
  - **Bộ lọc**: Cột nào có bộ lọc MultiSelect đầu cột (`ColumnHeaderFilter`), cột nào có tìm kiếm đầu cột (`ColumnHeaderSearch`)?

### Quy tắc 2: Kiểm tra thứ tự khai báo (Hoisting & TDZ)
- Khi định nghĩa các hàm Callback (`useCallback`, `useMemo` hoặc hàm arrow function thường):
  - **Tất cả các hàm xử lý hành động (action handlers)** như `askApprove`, `askDelete`, `handleSave`, `handleBulkEdit` **bắt buộc phải được khai báo ngay sau các React Query mutation** ở đầu component.
  - Tuyệt đối không khai báo hàm xử lý hành động ở giữa hoặc cuối component rồi truyền lên các Hook `useMemo` hoặc component con khai báo ở phía trên.

### Quy tắc 3: Xác thực bắt buộc bằng Browser Automation trên Live Production
- Sau khi thực hiện bất kỳ thay đổi nào và đẩy code lên:
  - Phải đợi Vercel/môi trường Live hoàn thành deploy.
  - Phải chạy script tự động hóa trình duyệt (`browser_subagent` hoặc Playwright) truy cập trực tiếp trang live, thực hiện **chuỗi kiểm thử CRUD đầy đủ**:
    1. Nhấp `Thêm` -> Điền thông tin -> `Lưu` -> Kiểm tra dữ liệu mới xuất hiện trên bảng.
    2. Tích chọn checkbox -> Kiểm tra hiển thị Bulk Actions -> Bấm `Sửa 1 dòng` -> Sửa thông tin -> `Lưu` -> Kiểm tra bảng được cập nhật.
    3. Nhấp xem chi tiết bản ghi mới -> Kiểm tra Drawer chi tiết có đủ Profile Card, Quick actions và footer đúng vị trí -> Nhấp `Xóa` -> Xác nhận xóa -> Kiểm tra bản ghi đã biến mất khỏi bảng.
    4. Thử click mở popover lọc/tìm kiếm ở tiêu đề cột.

### Quy tắc 4: Cấm lồng ghép class h-page gây tràn chiều cao và ẩn footer
- **Bài học thực tế**: Class `.h-page` quy định chiều cao tuyệt đối khớp với view-port (ví dụ: `100dvh - header - footer`). Khi trang cha (như `ChuyenXePage` hay `BangLuongPage`) đã có chiều cao `h-page` và chứa thêm tiêu đề/tab (`TabGroup` chiếm 48px), nếu component con bên trong (`TransportModulePage`) cũng dùng `.h-page`, chiều cao của con sẽ tự vẽ bằng viewport, cộng với 48px của tab tạo ra hiện tượng tràn trang (overflow). Hậu quả là phần chân trang của bảng (Table pagination footer) bị đẩy xuống dưới cùng và biến mất khỏi màn hình.
- **Tiêu chuẩn thiết kế bắt buộc**:
  - Chỉ thẻ wrapper ngoài cùng cấp Router của trang mới được sử dụng `.h-page`.
  - Tất cả các component con, phân hệ dùng chung hoặc sub-view nhúng bên trong **bắt buộc phải sử dụng `h-full min-h-0`** thay vì `h-page` để co dãn chính xác theo chiều cao phân bổ của `flex-1 min-h-0` của cha.

---

## 3. Tiêu chuẩn thiết kế mô hình Master-Detail (Bảng Cha - Bảng Con)

Khi nâng cấp hoặc thiết kế bất kỳ màn hình nghiệp vụ nào theo mô hình Master-Detail (như Chuyến xe - Chi tiết chuyến, Phòng ban - Phòng ban con):

1. **Giao diện bảng con nhúng (Embedded Sub-Grid)**:
   - Sử dụng cặp bài trùng `DetailSection` (định nghĩa trong `Section.tsx`) và `EmbeddedChildDataGrid` để đảm bảo giao diện đồng bộ 100% về viền, bóng, khoảng cách padding, sticky header, và chiều cao tự cuộn dọc (`maxVisibleBodyRows`).
2. **Ngăn chặn lỗi sai lệch dữ liệu liên kết**:
   - Khi mở form con từ chi tiết cha, **bắt buộc điền sẵn (prefill) ID của cha và khóa cứng (disabled) trường liên kết đó** để tránh việc người dùng chọn sai bản ghi cha liên kết.
3. **Stacked Drawers (Drawer xếp chồng)**:
   - Quản lý chồng các Drawer lồng nhau bằng `AnimatePresence` và biến `nestedViewingRow`/`nestedFormConfig` ở cấp trang cha.
   - Khi Drawer con mở ra, sử dụng thuộc tính `stackLevel` để tự động thụt lề và đổ bóng chuẩn theo template của hệ thống.
4. **Quy trình Nghiệp vụ hóa thay vì CRUD generic**:
   - Thay thế việc sửa trạng thái hời hợt bằng các nút hành động mang tính cam kết cao:
     - Nút **"Báo tiến độ OK"** trên toolbar dòng con (cập nhật trạng thái `'Đã thực hiện'`).
     - Nút **"Duyệt Chuyến"** trên `DetailToolbar` dòng cha (cập nhật trạng thái `'Đã duyệt'`).
5. **Kế thừa trạng thái khóa (Cascading Locks)**:
   - Khi dòng cha đã được Duyệt (`Đã duyệt`), toàn bộ các dòng con đi kèm phải tự động được tính toán khóa (`isParentLocked = parent.trang_thai === 'Đã duyệt'`), ẩn các nút Sửa, Xóa và Báo tiến độ ở cả sub-grid lẫn drawer chi tiết con.
6. **Deep Linking / Lịch sử liên quan**:
   - Sử dụng `useSearchParams` để bắt các tham số `id_tai_xe`, `id_xe`, `id_dia_diem`, `trang_thai` từ URL để khởi tạo bộ lọc/tìm kiếm tương ứng. Điều này cho phép chuyển hướng thông minh từ các màn hình chi tiết (tài xế, xe, địa điểm) sang danh sách chuyến xe được lọc sẵn.


