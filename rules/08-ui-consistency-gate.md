# 08-ui-consistency-gate.md

## UI/UX Pattern & Template Parity Rules

Tất cả các Agent khi chỉnh sửa UI phải giữ parity với design system/template thật của dự án. Các rule bên dưới áp dụng cứng cho 5fedu hoặc dự án có template/list/table pattern tương đương; với dự án khác, áp dụng nguyên lý rộng và chỉ dùng tên component cụ thể khi codebase thật có component đó.

---

### 1. Đồng bộ Giao diện & Layout theo Template
*   **CẤM tự chế toolbar hoặc bộ lọc**:
    *   Mọi bộ lọc trạng thái hoặc bộ lọc danh mục trên các màn hình danh sách bắt buộc phải sử dụng bộ lọc dạng chip chuẩn (ví dụ: `ToolbarFilterChipGroup` kết hợp với `FilterChipMultiSelect` hoặc `FilterChipSingleSelect`).
    *   Nghiêm cấm việc đặt thẻ `Combobox`, `Select` hoặc các trường input lọc trơ trọi trực tiếp trên thanh toolbar làm vỡ layout ngang.
*   **BẮT BUỘC cấu hình ColumnManager (Tùy chọn ẩn/hiển thị cột) cho TOÀN BỘ HỆ THỐNG**:
    *   Tất cả các module hiển thị dạng bảng danh sách bắt buộc phải truyền đầy đủ các thuộc tính cấu hình quản lý cột (ví dụ: `columns`, `onToggleColumn`, `onResetColumns` trong component `GenericToolbar`).
    *   Tương ứng trong store/state manager của từng module, bắt buộc phải định nghĩa mảng định cấu hình cột dữ liệu và đồng bộ trạng thái (ví dụ lưu trữ trong store và sync với localStorage).
*   **Audit icon nút Thêm mới**:
    *   Nút Thêm mới mặc định ở footer drawer (`FormDrawerFooter.tsx` hoặc tương đương) là icon `Plus` (dấu cộng). Chỉ dùng `UserPlus` (hoặc icon người) cho module Nhân viên / Tài khoản hệ thống.
    *   Nút Thêm mới ở toolbar chính phải được render qua cơ chế nút Add chuẩn có icon `PlusCircle` (ví dụ: prop `onAdd` của `GenericToolbar`), cấm tự code nút thêm với icon khác hoặc lệch vị trí.
*   **Quy chuẩn nút Quay lại (Back Button) & Navigation**:
    *   Mọi popup chi tiết (`DetailComponent`) và form nhập liệu (`FormComponent`) phải có nút Quay lại/Đóng hoạt động nhất quán.
    *   Nút Quay lại ở thanh đường dẫn (Breadcrumbs) của các trang con bắt buộc phải hoạt động chính xác, cho phép chuyển hướng quay lại trang phân hệ chính, không được làm hỏng liên kết điều hướng.
    *   Nút "Sửa" hoặc "Xóa" trên toolbar của popup chi tiết phải được định nghĩa qua `DetailToolbar` (hoặc tương đương) và bọc trong array actions một cách ngăn nắp, xóa bỏ các nút ảo không hoạt động.
*   **Quy tắc Global Auditing (Quét diện rộng tự động)**:
    *   Khi phát hiện một lỗi UI lệch chuẩn (ví dụ: thiếu ColumnManager, thiếu bộ lọc chip, icon người ở nút thêm), Agent bắt buộc phải dùng công cụ tìm kiếm sẵn có (`rg`, IDE search, `grep_search`, GitNexus...) quét toàn bộ dự án để tìm tất cả các component/file cùng loại và sửa đồng loạt trong scope an toàn. Cấm chỉ sửa một điểm cục bộ được người dùng nhắc tên.

---

### 2. Thiết kế các Module Hiển thị RichText & Markdown Động

*   **CẤM chắp vá dữ liệu thô và ảnh/quote tĩnh**:
    *   Trang chi tiết bài viết/tài liệu ở client phải render động 100% nội dung từ DB. Nghiêm cấm fix cứng các ảnh inline demo hoặc quote tĩnh ở giữa bài viết.
*   **Yêu cầu Markdown Parser**:
    *   Sử dụng component parser chuẩn (như `MarkdownParser`) để phân tích nội dung soạn thảo từ trang quản trị.
    *   Tiêu đề `## ` phải tự động sinh `id` làm điểm neo cho mục lục (TOC).
    *   Ảnh inline `![alt](url)` phải được render thành thẻ `<figure>` kèm `<figcaption>` mô tả ảnh phía dưới một cách tinh tế.
    *   Quote `> ` phải được render thành blockquote prose-style sang trọng.
*   **Mục lục (Table of Contents) tự động**:
    *   Mục lục bên trái/phải bài viết phải được tự động trích xuất từ các tiêu đề `## ` có trong nội dung, khi click phải scroll mượt mà đến phần tương ứng.

---

### 3. Loại bỏ hoàn toàn Mock Data ở Client Web

*   Mọi trang client hiển thị danh sách thực thể phải kết nối qua repository/hooks API thực tế của backend, tuyệt đối không tạo mảng tĩnh local hoặc dữ liệu mock cứng trong code giao diện.

---

### 4. Nguyên lý Đồng bộ Cấu trúc & Tab Nghiệp vụ (Tab & Tree Table Parity)

*   **Nguyên lý Thiết kế Bảng phân cấp (Hierarchical Table Parity)**: Khi hiển thị dữ liệu có cấu trúc phân cấp (Cha/Con hoặc các cấp tương đương), Agent bắt buộc phải triển khai bảng dạng collapsible chuẩn của template, đảm bảo tính toán gom nhóm chính xác các cột chỉ số định lượng. Cấm tự chế các phần tử Accordion màu mè, lồng ghép lệch chuẩn.
*   **Nguyên lý Định tuyến Tab nghiệp vụ (Tab-based Routing Parity)**: Nếu template phân chia trang thành nhiều góc nhìn nghiệp vụ khác nhau (ví dụ: danh sách quản lý vs báo cáo tổng hợp), Agent bắt buộc phải triển khai đầy đủ hệ thống Tab đồng bộ với URL để người dùng chuyển đổi góc nhìn nhất quán. Cấm hiển thị dồn ép nội dung hoặc lược bỏ các tab nghiệp vụ của template.

---

### 5. Quy chuẩn Giao diện Danh sách & Xuất file (ListView & Export Standardization)

*   **Cấm lồng ghép class `h-page` ở Component con**:
    *   Không bao giờ được dùng class `.h-page` ở các component con hoặc trang con nhúng nằm bên trong TabGroup hoặc Layout cha. Lồng ghép class `h-page` sẽ kéo giãn chiều cao vượt quá viewport, đẩy các phần tử chân trang (Table footer, pagination, tổng số dòng) bị ẩn mất xuống dưới. Trang con nhúng bắt buộc chỉ sử dụng `h-full min-h-0` để co giãn tự động theo flex container cha.
*   **ListView & Actions Standardization**:
    *   **Xóa Header Dư Thừa**: Tuyệt đối không tự vẽ Page Header (tiêu đề, mô tả, icon lớn) bên trong panel nội dung của các trang nghiệp vụ/phân hệ khi layout cha đã có Breadcrumbs và Layout bao quát chung.
    *   **Dropdown Actions**: Các hành động có tính phá hủy dữ liệu (Xóa) hoặc phê duyệt không được hiển thị lộ thiên trực tiếp trên dòng của bảng. Phải đưa gọn gàng vào menu dropdown ẩn (như `DataTableRowActions`). Nút Sửa được để ngoài dạng icon button primary.
*   **Quy Chuẩn Xuất File Excel (Excel Export)**:
    *   **Kiểu dữ liệu (Cell Type 'n')**: Các cột chứa số liệu (tiền, số lượng, đợt...) bắt buộc phải được xuất dưới dạng Number thực tế để có thể tính toán (`SUM`, `AVERAGE`), cấm xuất dạng String/Text.
    *   **Định dạng**: Căn lề phải cho cột số, căn lề giữa cho ngày tháng/trạng thái, và căn lề trái cho text thường.
    *   **Màu sắc**: Sử dụng bảng màu thương hiệu chuẩn nhất quán, chữ trắng đậm, có viền mỏng bao quanh và màu nền dòng xen kẽ nhẹ.
*   **Quy Chuẩn Xuất File PDF (PDF Export)**:
    *   **Hỗ trợ Tiếng Việt (Unicode)**: Tuyệt đối không dùng các font mặc định không hỗ trợ tiếng Việt gây lỗi hiển thị mojibake.
    *   **Đăng ký Font Chữ**: Phải fetch tệp font TrueType hỗ trợ tiếng Việt (như `Roboto-Regular.ttf` hoặc tương tự từ CDN), chuyển đổi thành base64 và đăng ký với công cụ sinh PDF (như `doc.addFileToVFS` của jsPDF).

---

### 6. Dọn dẹp trùng lặp Toolbar trong các Popup Details (Drawer)

*   **Nguyên tắc bố trí nút bấm trong Drawer**:
    *   Các nút thao tác cốt lõi của hệ thống gồm **Chỉnh sửa (Edit)**, **Xóa (Delete)** và **Đóng (Close)** phải được bố trí tập trung, đồng bộ ở phần **Footer** dưới cùng của Drawer.
    *   Thanh toolbar phụ trong phần body của Drawer chỉ được phép hiển thị các **hành động nghiệp vụ mở rộng đặc thù** (ví dụ: Gọi điện, Gửi email, In phiếu, Duyệt phiếu...).
    *   **CẤM TUYỆT ĐỐI** hiển thị lặp lại các nút Chỉnh sửa và Xóa ở cả thanh toolbar phụ trong body và bottom footer của Drawer.

---

### 7. Bài học nghiệp vụ và Nguyên lý Compliance chung (Gom nhóm có đánh số)

Dưới đây là 5 bài học xương máu được hệ thống hóa thành nguyên lý bắt buộc áp dụng rộng rãi cho các dự án Web/App UI/UX:

#### Nhóm 1: Nguyên lý "Fidelity-First" (Bản sao tuyệt đối của Template)
*   *Nguyên lý*: Template là nguồn chân lý duy nhất. Mọi sự tự chế layout, bộ lọc, bảng biểu lệch chuẩn đều là rác kỹ thuật và bất tuân spec.
*   *Quy định*: Trước khi code bất kỳ view/toolbar/table nào, bắt buộc phải inspect code của UI template liên quan và clone 100% cấu trúc, logic, kiểu dữ liệu.

#### Nhóm 2: Nguyên lý "No-Merged-Information" (Rã gộp dữ liệu hiển thị)
*   *Nguyên lý*: Việc gộp chung nhiều thông tin vào một ô của bảng (ví dụ: Tên + SĐT khách hàng, Tên + Mã sản phẩm) làm tê liệt hoàn toàn chức năng tùy chọn hiển thị (ColumnManager), lọc và sắp xếp.
*   *Quy định*: Mọi trường thông tin cấu thành nên thực thể bắt buộc phải có một cột riêng biệt trong store và table. Không được gộp chung nếu làm mất khả năng tương tác độc lập của từng cột.

#### Nhóm 3: Nguyên lý "Clean-Nomenclature" (Ngắn gọn và Thích ứng)
*   *Nguyên lý*: Sử dụng các danh từ dài dòng, thừa thãi làm hẹp không gian hiển thị, vỡ layout và không đồng bộ giữa Client và Admin.
*   *Quy định*: Đổi tên ngắn gọn nhất (Ví dụ: thay vì "Thiết lập loại tài liệu" dùng "Loại tài liệu", thay vì "Thông tin giao nhận thực tế" dùng "Thông tin giao nhận"). Đảm bảo cấu trúc dữ liệu truyền nhận giữa phía Client và phía Admin là 1-1, đồng bộ trường dữ liệu và format.

#### Nhóm 4: Nguyên lý "Loop-Verification & Global Auditing" (Kiểm thử vòng lặp diện rộng)
*   *Nguyên lý*: Sửa lỗi cục bộ tại một vị trí được chỉ tên mà bỏ qua các file cùng loại là nguyên nhân dẫn đến việc chỉ hoàn thành được một phần công việc.
*   *Quy định*: Mỗi khi tiếp nhận feedback sửa lỗi giao diện/logic, Agent bắt buộc phải chạy lệnh tìm kiếm quét toàn bộ mã nguồn để tìm toàn bộ các component/file cùng họ hoặc cùng cấu trúc tương tự để sửa đổi đồng loạt.

#### Nhóm 5: Nguyên lý "Permission-Surface Parity" (UI phản ánh đúng phân quyền)
*   *Nguyên lý*: UI chỉ được hiển thị hoặc ẩn thao tác quyền hạn theo nguồn phân quyền tập trung của hệ thống, không tự tạo một lớp quyền cục bộ làm lệch với API/DB.
*   *Quy định*: Khi giao diện có control liên quan quyền truy cập, phải trace sang rule permission ở `02-code-quality-and-debt.md` và verify UI/API/DB cùng một kết quả.


