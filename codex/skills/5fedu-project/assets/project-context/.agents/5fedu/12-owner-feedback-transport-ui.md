# Owner Feedback: Transport UI And Business Flow

Nguồn: phản hồi trực tiếp của owner/user ngày 2026-05-31 trong chat Codex, kèm ảnh phản hồi trước đó về `id int8`, `ten_dang_nhap`, và Supabase Auth sync.

File này là gate bắt buộc trước khi làm trang chủ, module Quản lý vận tải, list/detail/form, combobox, in/xuất/duyệt, thống kê, hoặc các trường tổng hợp. Mục tiêu là không lặp lại lỗi "có CRUD nhưng chưa đúng nghiệp vụ".

## Template Tham Chiếu

Template giao diện local:

```text
.agents/template-source/TAH_app
```

Commit chốt:

```text
47947e6eea0b1b7dc6723356f37f604e30ac690b
```

Khi làm giao diện phải đối chiếu template trước, đặc biệt:

- `components/shared/GenericTable.tsx`
- `components/shared/GenericToolbar.tsx`
- `components/shared/GenericDrawer.tsx`
- `components/shared/DetailSection.tsx`
- `components/shared/DetailFieldGrid.tsx`
- `components/shared/FormSection.tsx`
- `components/shared/FormGrid.tsx`
- `components/shared/FormDrawerFooter.tsx`
- `components/shared/MobileListCard.tsx`
- `components/ui/Combobox.tsx`
- `components/ui/AsyncCombobox.tsx`
- `components/ui/NumericFormatInput.tsx`
- module mẫu trong `features/he-thong/`

Không được tự dựng form/detail/list thô nếu template đã có pattern phù hợp.

## Chốt Theo Owner

### Trang chủ

- Thứ tự module trên trang chủ phải là:
  1. `Quản lý vận tải`
  2. `Hệ thống`
  3. `Thông tin bản quyền`

### Nhân viên Và Auth Email

- `ten_dang_nhap` chỉ dùng để sinh fake email đăng nhập Supabase Auth dạng `<ten_dang_nhap>@gmail.com`.
- Cần có trường email thực tế của nhân viên để họ điền email thật.
- Không trộn email thật với fake email auth.
- Ảnh owner đã chốt lại: `id int8`, login dùng `ten_dang_nhap`, thêm/sửa/xóa username phải sync Supabase Auth user. Các rule này vẫn nằm ở `.agents/5fedu/10-owner-feedback-lessons.md`.

### Phòng Ban Và Chức Vụ

- Nếu app không hiển thị dữ liệu phòng ban/chức vụ, không được kết luận database rỗng khi chưa kiểm tra Supabase thật.
- Phải kiểm tra đủ: env frontend, query/select, permission/filter UI, response từ Supabase, và console/browser.
- Với repo hiện tại ngày 2026-05-31: Supabase có dữ liệu `var_phong_ban` và `var_chuc_vu`; nếu UI trắng thì nguyên nhân nằm ở đường đọc/render/filter/permission chứ không phải mặc định do DB rỗng.

### Tài Xế

- List view bỏ text kiểu "Tiêu đề tài xế"; action `Xuất` chỉ icon only khi owner yêu cầu.
- Tài xế có thể là người ngoài công ty, không chỉ là nhân viên nội bộ. Schema/form phải lưu được thông tin tài xế bên ngoài.
- Form tài xế phải đủ thông tin nghiệp vụ cần thiết, ví dụ họ tên, số điện thoại, email, ngày sinh/tuổi nếu cần quản lý, địa chỉ, giấy phép lái xe, hạng bằng, ngày hết hạn, xe thường chạy, ghi chú, trạng thái.
- Nếu liên kết nhân viên nội bộ thì là optional, không được bắt buộc mọi tài xế phải có `id_nhan_vien`.
- Detail tài xế phải có lịch sử chuyến xe.
- Detail tài xế phải có lịch sử lương.
- Form/detail tài xế phải theo chuẩn template, không render field thô từ config nếu nghiệp vụ cần layout riêng.

### Địa Điểm

- Địa điểm không chỉ là CRUD thô. Form/detail/list phải theo chuẩn template và đủ nghiệp vụ vận tải.
- Cần thể hiện nhóm/tuyến, tên, mô tả, tiền lương mặc định, chi phí mặc định nếu có, định vị/địa chỉ, ghi chú, trạng thái.
- Detail địa điểm nên có lịch sử chuyến xe/chuyến chi tiết liên quan khi có dữ liệu.

### Danh Sách Xe

- Danh sách xe không chỉ là CRUD thô. Form/detail/list phải theo chuẩn template và đủ thông tin xe.
- Cần thể hiện biển số, hãng, model, đời xe, loại xe/tải trọng nếu cần, bảo hiểm/đăng kiểm/bảo trì nếu app cần, ghi chú, trạng thái.
- Detail xe nên có lịch sử chuyến xe liên quan khi có dữ liệu.

### Bảng Lương

- Tên tài xế trong form/filter phải dùng combobox/searchable picker, không dùng select thô.
- Form và detail phải theo chuẩn template.
- `tong_luong_chuyen` không được điền tay; phải lấy/tính từ chuyến đi thực tế.
- Cần thêm cột trừ tiền khác, ví dụ tiền ứng.
- Cần có cột tổng tiền còn lại.
- Cần có nút in bảng lương.
- Nút duyệt không được nằm trong form. Duyệt phải là action riêng ngoài form/detail/list tùy ngữ cảnh.
- Không được cho sửa các giá trị đã duyệt nếu rule nghiệp vụ khóa sau duyệt.

### Chuyến Xe

- Chuyến xe cũng phải theo chuẩn form/detail/list template, không chỉ CRUD generic.
- Ở bảng cha, các cột tổng tiền và tổng chuyến phải tính tự động từ dòng chi tiết.
- Không được nhập tay `so_chuyen`, `tong_tien_luong`, `tong_phi` nếu đã có chi tiết chuyến xe để tính.
- Dòng chi tiết đã duyệt thì không cho chỉnh sửa nếu rule đã chốt.

### Thống Kê Chuyến Đi

- Giao diện thống kê chuyến đi phải làm lại theo chuẩn dashboard/report, không dùng giao diện tạm hoặc chart/table chung chung.
- Bộ lọc phải bám nghiệp vụ: ngày, chuyến, tài xế, địa điểm, xe.
- Thống kê phải thể hiện được lương và chi phí, không chỉ đếm dòng.

## Nguyên Nhân Gốc Cần Tránh

- Không được nhầm "có bảng + CRUD" là đã xong module nghiệp vụ.
- Không được dùng một `generic config` cho nhiều module nếu form/detail/action/tổng hợp của mỗi module khác nhau rõ ràng.
- Nếu nhiều module sai giống nhau, phải kiểm tra shared page/config/service trước khi vá từng màn.
- Mọi field tổng hợp phải được phân loại: user nhập, hệ thống tính, hay hệ thống sync từ bảng khác.
- Mọi relation field có nhiều dòng phải dùng combobox/searchable picker.
- Mọi action nghiệp vụ phải được phân loại: form action, row action, bulk action, approval action, print/export action. Không nhét tất cả vào form.

## Checklist Bắt Buộc Trước Khi Báo Xong

- Đã đối chiếu template commit `47947e6eea0b1b7dc6723356f37f604e30ac690b`.
- Đã kiểm tra trang chủ đúng thứ tự module.
- Đã kiểm tra list view desktop và card view mobile.
- Đã kiểm tra form theo template, có validation, label rõ, field không bị thiếu.
- Đã kiểm tra detail theo template, có section nghiệp vụ và lịch sử liên quan khi cần.
- Đã kiểm tra relation field dùng combobox/searchable picker khi dữ liệu có thể nhiều.
- Đã kiểm tra tổng hợp không nhập tay nếu tính được từ dữ liệu con.
- Đã kiểm tra action in/xuất/duyệt nằm đúng vị trí, không nằm sai trong form.
- Đã kiểm tra dữ liệu thật Supabase hiển thị trên UI bằng browser, không chỉ kiểm tra REST/script.
- Đã verify bằng Playwright hoặc browser screenshot cho các màn UI bị sửa.

## Stop Conditions

Dừng và sửa plan trước khi code tiếp nếu gặp một trong các dấu hiệu:

- Module vận tải đang dùng generic form/detail không đủ nghiệp vụ.
- Tổng tiền/tổng chuyến/tổng còn lại đang cho nhập tay.
- Tài xế/địa điểm/xe thiếu detail lịch sử liên quan.
- Tài xế bắt buộc phải là nhân viên nội bộ trong khi owner cần lưu tài xế bên ngoài.
- Select thô được dùng cho danh sách quan hệ lớn như tài xế.
- Duyệt nằm trong form thay vì action riêng.
- UI không được verify bằng dữ liệu thật.

