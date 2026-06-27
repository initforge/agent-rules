# Frontend Mapping

## Domain mặc định

- Trang chủ
- Hành chính
- Nhân sự
- Vận hành
- Kinh doanh
- Marketing
- Tài chính
- Mua hàng
- Sản xuất
- Kho vận
- Điều hành
- Hệ thống
- Trợ lý AI
- Thông tin bản quyền

## Mapping ví dụ đã thấy từ spec/ảnh

Khi người dùng đưa spec ít, dùng các ví dụ này để suy luận cách tổ chức, nhưng không coi là scope bắt buộc nếu app hiện tại chưa chốt.

- Hệ thống / Sơ đồ:
  - Phòng ban
  - Chức vụ
  - Nhân viên
- Hệ thống / Thiết lập khác:
  - Thông tin công ty
  - Phân quyền
- Quản lý vận tải / Kế hoạch:
  - Chuyến xe, tab `Danh sách`, `Danh sách CT`
  - Bảng lương, tab `Danh sách`
  - Thống kê chuyến, tab dạng lọc theo ngày/chuyến/tài xế/địa điểm/xe/thống kê lương/chi phí
  - Thống kê lương, tab dạng lọc theo ngày/tài xế
- Quản lý vận tải / Thiết lập:
  - Tài xế
  - Địa điểm
  - Danh sách xe

## Quy ước tên

- Tên submenu và thư mục module dùng tiếng Việt để người không biết tiếng Anh vẫn tra cứu được.
- Tên view dùng dạng hybrid tiếng Việt + English suffix, ví dụ `nhan-vien-form`.
- Module key lưu trên Supabase dùng tiếng Việt không dấu dạng slug của module thôi, ví dụ `nhan-vien`; không lưu dạng `he-thong/nhan-vien`.

## Mapping phải tạo trước khi code

Với mỗi yêu cầu, xác định:

```text
spec/source -> submenu -> module -> view -> tab -> route -> source path -> database table -> function/service
```

Nếu người dùng đưa ảnh mapping hoặc Google Sheet, dùng nó làm nguồn chính. Nếu chỉ có ảnh mờ/thiếu hàng/cột, hỏi lại thay vì đoán.

Nếu app mới có domain/module tương tự ví dụ trên, ưu tiên tìm trong template trước khi tạo mới.

## Pattern Fidelity Packet bắt buộc

Trước khi code bất kỳ phân hệ/trang UI nào, tạo packet ngắn gồm:

```text
Spec/source:
Submenu/module/tab/route:
Template/current-app reference:
Allowed toolbar actions:
Forbidden extra actions:
List/table columns:
Row actions:
Form fields:
Detail/drawer sections:
Mobile card fields:
Labels/descriptions source:
Database/service/permission mapping:
Unknowns:
```

Quy tắc khóa:

- Tên module, submenu, tab, route, button label, tooltip, description và empty state phải lấy từ spec/template/current app. Không tự viết lại cho "hay hơn".
- Nếu reference là `Hệ thống`, giữ cùng cấu trúc toolbar/list/detail/form/permission; chỉ đổi dữ liệu nghiệp vụ.
- Không thêm nút `Xuất`, `Import`, `Duyệt`, `In`, `Báo cáo`, bulk action, mini-tab hoặc filter mới nếu packet không chứng minh nguồn.
- Không đổi domain/submenu chỉ vì module nghe hợp hơn ở nơi khác; taxonomy trong spec/template thắng suy đoán.
- Unknowns phải được hỏi hoặc ghi `CAN_HOI_THEM`, không lấp bằng copy tự chế.

## Tab và route

Khi module có nhiều tab, tab đang mở phải có router query:

```text
?tab=<tab-hien-tai>
```

## UI chuẩn

- Desktop: list view.
- Mobile: card view.
- Các view chuẩn: list view, card view, detail view, form view.
- Search box phải tìm được tất cả trường trong bảng và trường liên kết hiển thị. Ví dụ bảng chỉ có `id_nguoi_tao` nhưng người dùng tìm theo tên nhân viên vẫn phải ra kết quả.
- Notification mặc định là demo: icon có dấu demo, bấm vào báo chức năng chưa sẵn có.

