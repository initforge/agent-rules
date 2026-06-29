# 08-ui-consistency-gate.md

## Universal UI/UX Gate Rules

Tất cả các Agent khi thực hiện công việc chỉnh sửa giao diện (UI) trên dự án Nostime bắt buộc phải tuân thủ nghiêm ngặt các quy tắc dưới đây. Không có ngoại lệ.

---

### 1. Đồng bộ Giao diện & Layout theo 5fedu Template

*   **CẤM tự chế toolbar hoặc bộ lọc**:
    *   Mọi bộ lọc trạng thái hoặc bộ lọc danh mục trên các màn hình danh sách bắt buộc phải sử dụng `ToolbarFilterChipGroup` kết hợp với `FilterChipMultiSelect` hoặc `FilterChipSingleSelect`.
    *   Nghiêm cấm việc đặt thẻ `Combobox`, `Select` hoặc các trường input lọc trơ trọi trực tiếp trên thanh toolbar làm vỡ layout ngang.
*   **BẮT BUỘC cấu hình ColumnManager (Tùy chọn ẩn/hiển thị cột)**:
    *   Tất cả các module kế thừa từ factory `createFeatureModule` phải định nghĩa `DEFAULT_COLUMNS` trong store và truyền đầy đủ 3 props:
        *   `columns={store.columns}`
        *   `onToggleColumn={store.toggleColumn}`
        *   `onResetColumns={store.resetColumns}`
        vào `GenericToolbar`.
*   **Audit icon nút Thêm mới ở Footer Form**:
    *   Nút Thêm mới mặc định ở footer drawer (`FormDrawerFooter.tsx`) là icon `Plus` (dấu cộng). Chỉ dùng `UserPlus` cho module Nhân viên / Tài khoản hệ thống.
*   **Quy chuẩn nút Quay lại (Back Button) & Actions popup**:
    *   Mọi popup chi tiết (`DetailComponent`) và form nhập liệu (`FormComponent`) phải có nút Quay lại/Đóng hoạt động nhất quán.
    *   Nút "Sửa" hoặc "Xóa" trên toolbar của popup chi tiết phải được định nghĩa qua `DetailToolbar` và bọc trong array `toolbarActions` một cách ngăn nắp, xóa bỏ các nút ảo không hoạt động.

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

### 5. Dọn dẹp trùng lặp Toolbar trong các Popup Details (Drawer)

*   **Nguyên tắc bố trí nút bấm trong Drawer**:
    *   Các nút thao tác cốt lõi của hệ thống gồm **Chỉnh sửa (Edit)**, **Xóa (Delete)** và **Đóng (Close)** phải được bố trí tập trung, đồng bộ ở phần **Footer** dưới cùng của Drawer.
    *   Thanh **DetailToolbar** (dạng nút tròn kèm text ở dưới) trong phần body của Drawer chỉ được phép hiển thị các **hành động nghiệp vụ mở rộng đặc thù** (ví dụ: Gọi điện, Gửi email, In phiếu, Duyệt phiếu...).
    *   **CẤM TUYỆT ĐỐI** hiển thị lặp lại các nút Chỉnh sửa và Xóa ở cả DetailToolbar (body) và bottom footer của Drawer.



