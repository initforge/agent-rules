# Pillar 3: UI/UX Parity & Delivery Quality Gates

Tài liệu này quy định các quy chuẩn thiết kế giao diện (UI/UX), cấu trúc component, định dạng xuất file báo cáo (Excel, PDF) và các cổng chất lượng (Quality Gates) bắt buộc kiểm duyệt trước khi bàn giao.

---

## 1. Quy Chuẩn Thiết Kế Giao Diện (UI/UX Parity)

### Nguyên Tắc Tham Chiếu Template Không Để Khoảng Trống (UI Parity - Zero Gaps)
- **Quy tắc**: Khi phát triển một phân hệ mới (ví dụ: Chuyến xe, Địa điểm, Bảng lương, Xe, v.v.), Agent **bắt buộc phải lấy phân hệ Nhân viên (`features/he-thong/nhan-vien`) làm Golden Reference (Khuôn mẫu vàng)** để đối chiếu trực tiếp.
- **Yêu cầu Zero Gaps**: Mọi phần tử giao diện trong phân hệ Nhân viên bắt buộc phải có mặt đầy đủ ở phân hệ mới ở mức độ trung thực cao nhất, bao gồm:
  - **Thanh Toolbar**: Ô tìm kiếm text, bộ lọc trạng thái dạng Combobox, nút Reset bộ lọc, nút Thêm mới (icon + chữ), nút Xuất Excel (icon-only kèm tooltip), dropdown chọn số dòng hiển thị.
  - **Bảng dữ liệu (Grid)**: Cột STT tự động tăng, cột thông tin chính (kèm avatar hoặc icon), các cột dữ liệu trung gian có icon đại diện đầu cột, badge màu hiển thị trạng thái chuẩn, cột hành động `DataTableRowActions` (nút Sửa/Xóa ẩn trong menu ba chấm).
  - **Chân trang (`TablePaginationFooter`)**: Phân trang có số trang, tổng số bản ghi và các nút chuyển trang.
  - **Drawer chi tiết**: Chia cột thông tin trực quan, các tab thông tin liên quan, footer split-layout.
  - **Mobile Card View**: Danh sách hiển thị dạng card thu gọn trên màn hình điện thoại di động.
- Mọi sự thiếu sót hoặc cắt giảm layout so với khuôn mẫu vàng trên bị coi là lỗi nghiêm trọng (UI Gap).

### Nguyên Tắc Cấm Generic Hóa Lười Biếng (Anti-Generic Constraint)
- **Bối cảnh**: Để đối phó và làm nhanh, Agents thường tự ý trừu tượng hóa các phân hệ cụ thể thành một component "Generic" dùng chung duy nhất (như tạo một bảng Generic nạp schema rồi tự render cho tất cả các trang, hoặc dùng một Form duy nhất tự sinh input). Việc này khiến UI trông rẻ tiền, thô sơ, thiếu các thành phần đặc thù của nghiệp vụ (như format tiền tệ, combobox động, ô thông tin lồng nhau, layout cột không đồng đều) và làm cho code cực kỳ khó bảo trì về sau.
- **Quy tắc**:
  1. **Cấm viết generic tùy tiện**: Mỗi phân hệ/trang nghiệp vụ (Nhân viên, Chuyến xe, Bảng lương, v.v.) **bắt buộc phải có các tệp tin view, table, form và service riêng biệt** nằm trong thư mục của feature đó.
  2. **Code tường minh (Explicit Logic)**: Các cột dữ liệu của Table, các trường nhập liệu của Form, các chi tiết hiển thị trong Drawer **phải được khai báo thủ công và tường minh** (explicitly declared) thay vì lặp qua một mảng cấu hình cấu trúc thô sơ.
  3. **Không lạm dụng generic components**: Chỉ sử dụng các components nền tảng dùng chung đã có sẵn trong dự án (như `GenericTable`, `GenericDrawer`, `Combobox`). Tuyệt đối cấm tạo thêm các hàm bọc hoặc component trung gian generic để gộp logic hiển thị của 2 phân hệ khác nhau. Mỗi phân hệ phải giữ cấu trúc độc lập để dễ dàng điều chỉnh nghiệp vụ chuyên biệt mà không ảnh hưởng phân hệ khác.

### Giao Diện Danh Sách & Thao Tác (ListView)
- **Xóa Header Dư Thừa**: Tuyệt đối không tự vẽ khối Page Header (tiêu đề, mô tả, icon lớn) bên trong panel nội dung của các trang phân hệ. Sử dụng Breadcrumbs và Layout bao quát chung của hệ thống.
- **Tiếng Việt Hóa Header**: Tên các cột trong bảng khi dựng động phải được ánh xạ qua bộ từ điển dịch `HEADER_LABELS` để hiển thị tiếng Việt có dấu chuẩn hóa.
- **Chân Trang Phân Trang (`TablePaginationFooter`)**: Tất cả các bảng dữ liệu (kể cả bảng báo cáo, thống kê tùy chỉnh) bắt buộc phải có footer phân trang chuẩn. Không để bảng trần.
- **Bảo Vệ Hành Động Phá Hủy**: Các nút Xóa (destructive) hoặc Duyệt phải đưa vào dropdown menu ẩn (`DataTableRowActions`), không hiển thị lộ thiên trên dòng dữ liệu hoặc chân Mobile Card.
- **Icon Trong Ô Bảng (Cell Icons)**: Các giá trị chính trong ô bảng (họ tên, sđt, biển số, tiền lương, ngày tháng, trạng thái) render kèm icon Lucide tương ứng (dùng `getFieldIcon(colId)`).

### Form & Detail Drawer Layout
- **Footer Drawer Chi Tiết**: Sử dụng split-layout compact (`h-8 px-3 text-xs`): nút Đóng (ghost button) nằm bên trái, nút Sửa (primary) và nút Xóa (destructive/outline) nằm bên phải. Sử dụng hàm nhãn nút chuẩn từ `lib/button-labels.ts` (`BTN_CLOSE()`, `BTN_EDIT()`, `BTN_DELETE()`).
- **Form Drawer Footer**: Tái sử dụng component `FormDrawerFooter` với thuộc tính `compact` và truyền `createIcon` (như `<Plus className="..." />`).
- **Nút Chỉnh Sửa**: Sử dụng đồng bộ icon `Edit` của Lucide cho tất cả các nút chỉnh sửa, không dùng icon `Pencil`.

### Thiết Kế Mô Hình Master-Detail (Cha - Con)
- **Bảng Con Nhúng (Embedded Sub-Grid)**: Sử dụng cặp `DetailSection` và `EmbeddedChildDataGrid` để đảm bảo giao diện đồng bộ 100% về viền, bóng, và chiều cao tự cuộn dọc.
- **Ngăn Chặn Sai Lệch Dữ Liệu**: Khi mở form con từ chi tiết cha, bắt buộc điền sẵn ID của cha và khóa cứng (disabled) trường liên kết đó.
- **Drawers Xếp Chồng (Stacked Drawers)**: Quản lý qua `nestedFormConfig` ở cấp trang cha. Khi Drawer con mở ra, sử dụng thuộc tính `stackLevel` để tự động thụt lề và đổ bóng chuẩn.
- **Kế Thừa Trạng Thái Khóa (Cascading Locks)**: Khi dòng cha ở trạng thái đã phê duyệt/hoàn thành, toàn bộ các dòng con đi kèm phải tự động bị khóa (ẩn các nút sửa, xóa, báo tiến độ ở cả grid lẫn drawer chi tiết con).

---

## 2. Kỷ Luật Biên Dịch & Code Hygiene

- **Phòng Vệ Temporal Dead Zone (TDZ)**: Khai báo tất cả các hàm handler (`askApprove`, `handleSave`...) ở đầu component (ngay sau state). Tuyệt đối cấm tham chiếu các handler này trong dependency array của `useMemo`/`useCallback` đặt ở phía trước dòng định nghĩa handler.
- **React Hooks Trong Render**: Tất cả các hooks (`useMemo`, `useCallback`, `useEffect`) bắt buộc phải được khai báo ở đầu component. Tuyệt đối không gọi hooks có điều kiện hoặc trả về sớm (JSX early return) ở phía trên các khai báo React Hook khác.
- **Kiểm Soát Import**: Không sử dụng component hoặc icon mà không import rõ ràng ở đầu file (tránh lỗi ReferenceError runtime do DOM toàn cục).
- **Phòng Vệ Kiểu Dữ liệu FK trên Form (FK Type Guard)**:
  - Khi form có trường `select` trỏ đến bảng khác (có `relation`) và trường đó **không bắt buộc** (`required: false`), giá trị mặc định của trường phải là `null` thay vì chuỗi rỗng `''`.
  - Hàm `normalizeFormValues()` bắt buộc phải xử lý: nếu trường có `relation` và giá trị hiện tại là `''` (chuỗi rỗng) hoặc `'0'`, phải chuyển thành `null` trước khi gửi lên service/repository.
  - Quy tắc này phòng vệ lỗi `invalid input syntax for type bigint: ""` khi PostgreSQL nhận chuỗi rỗng cho cột kiểu `int8`.

---

## 3. Quy Chuẩn Xuất File Báo Cáo (Excel & PDF)

### Xuất File Excel (`.xlsx`)
Sử dụng thư viện `xlsx-js-style` để định dạng chuyên nghiệp:
- **Kiểu Dữ Liệu Thực (Cell Type 'n')**: Các cột chứa số liệu (Tiền lương, Chi phí, Số chuyến...) bắt buộc xuất dưới dạng Number thực tế để có thể tính toán (`SUM`, `AVERAGE`), cấm xuất dạng String. Định dạng hiển thị số: `numFmt: "#,##0"`.
- **Căn Lề (Alignment)**: Cột số căn lề phải (right), cột ngày tháng/trạng thái/biển số căn giữa (center), cột text thường căn lề trái (left).
- **Header & Layout**: Header màu xanh dương đậm (`#1E3A8A`), chữ trắng, font Segoe UI, in đậm. Dùng màu nền dòng xen kẽ nhẹ nhàng để tăng độ tương phản.
- **Nút Xuất trên Toolbar**: Hiển thị dạng icon-only (Download icon) kèm tooltip mô tả, không dùng nút to bản kèm chữ.

### Xuất File PDF (`.pdf`)
Sử dụng jsPDF để định dạng:
- **Hỗ Trợ Tiếng Việt (Unicode)**: Cấm dùng font mặc định của jsPDF (như Helvetica, Times) gây lỗi hiển thị ký tự lạ (mojibake).
- **Đăng Ký Font Chữ**: Tải file font TrueType hỗ trợ tiếng Việt (`Roboto-Regular.ttf` và `Roboto-Medium.ttf` từ CDN), chuyển đổi sang base64 thông qua ArrayBuffer, và đăng ký với jsPDF bằng `doc.addFileToVFS` và `doc.addFont`.
- **Áp Dụng Font**: Đảm bảo tất cả văn bản vẽ bằng `doc.text` và bảng vẽ bằng `autoTable` đều chỉ định sử dụng font đã đăng ký (`font: 'Roboto'`).

---

## 4. Cổng Chất Lượng Bàn Giao (Quality Gates)

Trước khi bàn giao bất kỳ task nào, Agent bắt buộc phải vượt qua các cổng kiểm tra sau:

1.  **Cổng 1: Biên dịch cục bộ (Local Compile Check)**:
    - Chạy thử build production ở local: `npm run build` hoặc `npm run type-check`.
    - Phải giải quyết 100% lỗi cú pháp, TypeScript type mismatches, và thiếu import trước khi commit.
2.  **Cổng 2: Browser Click-through Test**:
    - Dùng browser subagent/Playwright mở localhost, đăng nhập `admin` / `5fedu.com`.
    - Thực hiện **chuỗi CRUD đầy đủ**: Thêm mới bản ghi -> Kiểm tra bảng -> Click chọn dòng -> Bấm sửa -> Lưu -> Mở drawer chi tiết -> Click xóa -> Kiểm tra dòng biến mất. Chụp ảnh/quay video màn hình làm bằng chứng kiểm thử.
3.  **Cổng 3: Verify-on-Production (Hậu Kiểm)**:
    - Sau khi CI/CD tự động deploy lên Vercel, lặp lại Bước 2 trực tiếp trên môi trường Live để đảm bảo tính năng không bị crash hoặc chặn do cấu hình CDN/cửa sổ bảo mật của trình duyệt.
4.  **Kỷ Luật Cấm Deploy Thủ Công**:
    - AI tuyệt đối không chạy lệnh deploy trực tiếp ứng dụng lên production qua terminal (`vercel --prod` hoặc tương đương) để tránh xung đột trạng thái build và rò rỉ secrets. Chỉ commit, push mã nguồn để CI/CD xử lý tự động.
