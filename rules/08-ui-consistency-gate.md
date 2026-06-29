# 08-ui-consistency-gate.md

## Universal UI/UX Gate Rules

Tất cả các Agent khi thực hiện công việc chỉnh sửa giao diện (UI) trên dự án Nostime bắt buộc phải tuân thủ nghiêm ngặt các quy tắc dưới đây. Không có ngoại lệ.

---

### 1. Đồng bộ Giao diện & Layout theo 5fedu Template
*   **CẤM tự chế toolbar hoặc bộ lọc**:
    *   Mọi bộ lọc trạng thái hoặc bộ lọc danh mục trên các màn hình danh sách bắt buộc phải sử dụng `ToolbarFilterChipGroup` kết hợp với `FilterChipMultiSelect` hoặc `FilterChipSingleSelect`.
    *   Nghiêm cấm việc đặt thẻ `Combobox`, `Select` hoặc các trường input lọc trơ trọi trực tiếp trên thanh toolbar làm vỡ layout ngang.
*   **BẮT BUỘC cấu hình ColumnManager (Tùy chọn ẩn/hiển thị cột) cho TOÀN BỘ HỆ THỐNG**:
    *   Tất cả các module hiển thị dạng bảng danh sách (bao gồm Sản phẩm, Đơn hàng, Nhập hàng, Bài viết, Tài liệu, Loại tài liệu, Banner, và các module khác) bắt buộc phải truyền đầy đủ 3 props vào `GenericToolbar`:
        *   `columns={store.columns}`
        *   `onToggleColumn={store.toggleColumn}`
        *   `onResetColumns={store.resetColumns}`
    *   Tương ứng trong store của từng module, bắt buộc phải định nghĩa mảng `columns` (kế thừa từ `createGenericStore` hoặc lưu trữ thủ công trong store và sync với localStorage).
*   **Audit icon nút Thêm mới**:
    *   Nút Thêm mới mặc định ở footer drawer (`FormDrawerFooter.tsx`) là icon `Plus` (dấu cộng). Chỉ dùng `UserPlus` cho module Nhân viên / Tài khoản hệ thống.
    *   Nút Thêm mới ở toolbar chính phải được render qua prop `onAdd` của `GenericToolbar` (để tự động hiển thị nút Add chuẩn có icon `PlusCircle`), cấm tự code nút thêm với icon khác hoặc lệch vị trí.
*   **Quy chuẩn nút Quay lại (Back Button) & Navigation**:
    *   Mọi popup chi tiết (`DetailComponent`) và form nhập liệu (`FormComponent`) phải có nút Quay lại/Đóng hoạt động nhất quán.
    *   Nút Quay lại ở thanh đường dẫn (Breadcrumbs) của các trang con (như trang chi tiết đơn hàng, nhập hàng) bắt buộc phải hoạt động chính xác, cho phép chuyển hướng quay lại trang phân hệ chính (Kinh doanh, Kho vận, Tài chính, v.v.), không được làm hỏng liên kết điều hướng.
    *   Nút "Sửa" hoặc "Xóa" trên toolbar của popup chi tiết phải được định nghĩa qua `DetailToolbar` và bọc trong array `toolbarActions` một cách ngăn nắp, xóa bỏ các nút ảo không hoạt động.
*   **Quy tắc Global Auditing (Quét diện rộng tự động)**:
    *   Khi phát hiện một lỗi UI lệch chuẩn (ví dụ: thiếu ColumnManager, thiếu bộ lọc chip, icon người ở nút thêm), Agent bắt buộc phải chạy lệnh `grep_search` quét toàn bộ dự án để tìm tất cả các component/file cùng loại và sửa đồng loạt. Cấm chỉ sửa một điểm cục bộ được người dùng nhắc tên.

---

### 2. Thiết kế Module Bài viết (Journal) dưới dạng RichText & Markdown Động

*   **CẤM chắp vá dữ liệu thô và ảnh/quote tĩnh**:
    *   Trang chi tiết bài viết ở client (`JournalDetail.tsx`) phải render động 100% nội dung từ DB. Nghiêm cấm fix cứng các ảnh inline demo hoặc quote tĩnh ở giữa bài viết.
*   **Yêu cầu Markdown Parser**:
    *   Sử dụng component `MarkdownParser` để phân tích nội dung soạn thảo từ Admin.
    *   Tiêu đề `## ` phải tự động sinh `id` làm điểm neo cho mục lục (TOC).
    *   Ảnh inline `![alt](url)` phải được render thành thẻ `<figure>` kèm `<figcaption>` mô tả ảnh phía dưới một cách tinh tế.
    *   Quote `> ` phải được render thành blockquote prose-style sang trọng.
*   **Mục lục (Table of Contents) tự động**:
    *   Mục lục bên trái bài viết phải được tự động trích xuất từ các tiêu đề `## ` có trong nội dung bài viết, khi click phải scroll mượt mà đến phần tương ứng.

---

### 3. Loại bỏ hoàn toàn Mock Data ở Client Web

*   Mọi trang client hiển thị danh sách thực thể (như Brands, Lookup, Cart) phải kết nối qua repository/hooks API Supabase thực tế, tuyệt đối không tạo mảng tĩnh local hoặc dữ liệu mock cứng.

---

### 4. Nguyên lý Đồng bộ Cấu trúc & Tab Nghiệp vụ (Tab & Tree Table Parity)

*   **Nguyên lý Thiết kế Bảng phân cấp (Hierarchical Table Parity)**: Khi hiển thị dữ liệu có cấu trúc phân cấp (Cha/Con hoặc các cấp tương đương), Agent bắt buộc phải triển khai bảng dạng collapsible chuẩn của template, đảm bảo tính toán gom nhóm chính xác các cột chỉ số định lượng. Cấm tự chế các phần tử Accordion màu mè, lồng ghép lệch chuẩn.
*   **Nguyên lý Định tuyến Tab nghiệp vụ (Tab-based Routing Parity)**: Nếu template phân chia trang thành nhiều góc nhìn nghiệp vụ khác nhau (ví dụ: danh sách quản lý vs báo cáo tổng hợp), Agent bắt buộc phải triển khai đầy đủ hệ thống Tab đồng bộ với URL để người dùng chuyển đổi góc nhìn nhất quán. Cấm hiển thị dồn ép nội dung hoặc lược bỏ các tab nghiệp vụ của template.



---

### 5. Quy chuẩn Giao diện Danh sách & Xuất file (ListView & Export Standardization)

*   **Cấm lồng ghép class `h-page` ở Component con**:
    *   Không bao giờ được dùng class `.h-page` ở các component con hoặc trang con nhúng nằm bên trong TabGroup hoặc Layout cha. Lồng ghép class `h-page` sẽ kéo giãn chiều cao vượt quá viewport, đẩy các phần tử chân trang (Table footer, pagination, tổng số dòng) bị ẩn mất xuống dưới. Trang con nhúng bắt buộc chỉ sử dụng `h-full min-h-0` để co giãn tự động theo flex container cha.
*   **ListView & Actions Standardization**:
    *   **Xóa Header Dư Thừa**: Tuyệt đối không tự vẽ Page Header (tiêu đề, mô tả, icon lớn) bên trong panel nội dung của các trang nghiệp vụ/phân hệ. Phải nhường vai trò này cho hệ thống Breadcrumbs và Layout bao quát chung để giao diện luôn sạch sẽ, thống nhất.
    *   **Dropdown Actions**: Các hành động có tính phá hủy dữ liệu (Xóa) hoặc phê duyệt không được hiển thị lộ thiên trực tiếp trên dòng của bảng. Phải đưa gọn gàng vào menu dropdown ẩn (`DataTableRowActions` hoặc `TableRowIconButton` có tooltips). Nút Sửa được để ngoài dạng icon button primary.
*   **Quy Chuẩn Xuất File Excel (Excel Export)**:
    *   **Kiểu dữ liệu (Cell Type 'n')**: Các cột chứa số liệu (tiền, số lượng, đợt...) bắt buộc phải được xuất dưới dạng Number thực tế để có thể tính toán (`SUM`, `AVERAGE`), cấm xuất dạng String/Text.
    *   **Định dạng**: Căn lề phải cho cột số, căn lề giữa cho ngày tháng/trạng thái, và căn lề trái cho text thường.
    *   **Màu sắc**: Header màu xanh dương đậm thương hiệu (`#1E3A8A`) chữ trắng đậm Segoe UI, có viền mỏng bao quanh và màu nền dòng xen kẽ nhẹ.
*   **Quy Chuẩn Xuất File PDF (PDF Export)**:
    *   **Hỗ trợ Tiếng Việt (Unicode)**: Tuyệt đối không dùng các font mặc định của jsPDF (như Helvetica) gây lỗi hiển thị mojibake.
    *   **Đăng ký Font Chữ**: Phải fetch tệp font TrueType hỗ trợ tiếng Việt (như `Roboto-Regular.ttf` từ CDN), chuyển đổi thành base64 và đăng ký với jsPDF bằng `doc.addFileToVFS` và `doc.addFont`.

---

### 6. Dọn dẹp trùng lặp Toolbar trong các Popup Details (Drawer)

*   **Nguyên tắc bố trí nút bấm trong Drawer**:
    *   Các nút thao tác cốt lõi của hệ thống gồm **Chỉnh sửa (Edit)**, **Xóa (Delete)** và **Đóng (Close)** phải được bố trí tập trung, đồng bộ ở phần **Footer** dưới cùng của Drawer.
    *   Thanh **DetailToolbar** (dạng nút tròn kèm text ở dưới) trong phần body của Drawer chỉ được phép hiển thị các **hành động nghiệp vụ mở rộng đặc thù** (ví dụ: Gọi điện, Gửi email, In phiếu, Duyệt phiếu...).
    *   **CẤM TUYỆT ĐỐI** hiển thị lặp lại các nút Chỉnh sửa và Xóa ở cả DetailToolbar (body) và bottom footer của Drawer.

---


### 7. Bài học nghiệp vụ và Nguyên lý Compliance chung (Gom nhóm có đánh số)

Dưới đây là 5 bài học xương máu được hệ thống hóa thành nguyên lý bắt buộc để loại bỏ hoàn toàn các lỗi cẩu thả:


#### Nhóm 1: Nguyên lý "Fidelity-First" (Bản sao tuyệt đối của Template)
*   *Bài học*: Template là nguồn chân lý duy nhất. Mọi sự tự chế (như tự chế Combobox lọc trạng thái, tự chế Accordion phân cấp, tự chế layout P&L, tự chế Tồn kho/NXT 2 cấp ảo) đều là rác kỹ thuật và bất tuân spec.
*   *Quy định*: Trước khi code bất kỳ view/toolbar/table nào, bắt buộc phải inspect code của `5fedu_template` có liên quan và clone 100% cấu trúc, logic, kiểu dữ liệu.

#### Nhóm 2: Nguyên lý "No-Merged-Information" (Rã gộp dữ liệu hiển thị)
*   *Bài học*: Việc gộp chung nhiều thông tin vào một ô của bảng (ví dụ: Tên + SĐT khách hàng, Tên + Mã sản phẩm, Số tiền + Trạng thái thanh toán) làm tê liệt hoàn toàn chức năng tùy chọn hiển thị (ColumnManager), lọc và sắp xếp.
*   *Quy định*: Mọi trường thông tin cấu thành nên thực thể bắt buộc phải có một cột riêng biệt trong store và table. Không được gộp chung nếu làm mất khả năng tương tác độc lập của từng cột.

#### Nhóm 3: Nguyên lý "Clean-Nomenclature" (Ngắn gọn và Thích ứng)
*   *Bài học*: Sử dụng các danh từ dài dòng, thừa thãi (như "Thiết lập loại tài liệu", "Thông tin giao nhận thực tế", "Nostime Journal") làm hẹp không gian hiển thị, vỡ layout và không đồng bộ giữa Cart client và Admin.
*   *Quy định*: Đổi tên ngắn gọn nhất: "Loại tài liệu", "Thông tin giao nhận", "Bài viết". Đảm bảo cấu trúc dữ liệu truyền nhận giữa Cart và Order Admin là 1-1, đồng bộ trường dữ liệu và format.

#### Nhóm 4: Nguyên lý "Loop-Verification & Global Auditing" (Kiểm thử vòng lặp diện rộng)
*   *Bài học*: Sửa lỗi cục bộ tại một vị trí được chỉ tên mà bỏ qua các file cùng loại là nguyên nhân dẫn đến việc chỉ hoàn thành được 10% công việc.
*   *Quy định*: Mỗi khi tiếp nhận feedback sửa lỗi giao diện/logic, Agent bắt buộc phải chạy lệnh `grep_search` quét toàn bộ folder `src/features/` để tìm toàn bộ các component/file tương tự và sửa đồng loạt.

#### Nhóm 5: Nguyên lý "No-Local-Permissions" (Không phân quyền phân mảnh)
*   *Bài học*: Việc đưa các checkbox phân quyền xem (cho chức vụ/phòng ban/nhân viên) trực tiếp vào form tạo tài liệu riêng lẻ là sai kiến trúc phân quyền tập trung RLS/Role-based.
*   *Quy định*: Quyền truy cập phải do vai trò tài khoản trong module Phân quyền quyết định chung. Nghiêm cấm đưa các trường cấu hình quyền truy cập cụ thể vào form dữ liệu của thực thể nghiệp vụ.



