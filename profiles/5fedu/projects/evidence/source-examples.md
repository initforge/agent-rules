# Source Examples

## Mục tiêu

File này lưu ví dụ cụ thể đã rút từ prompt/ảnh ban đầu. Dùng nó như reference để AI suy luận đúng style 5fedu khi người dùng đưa ít instruction hơn, nhưng không thay thế việc chốt spec thật.

## Ảnh 1: app và stack

Ví dụ app:

- Tên app: `TAH APP`.

Stack thường thấy:

- Frontend: React (Vite) + TypeScript.
- UI: Tailwind CSS + component nội bộ trong `components/ui`, phong cách tương tự shadcn, không dùng registry shadcn/Radix nếu chưa cần.
- Dữ liệu: TanStack Query cho server state + Zustand cho client state.
- Form: React Hook Form + Zod.
- Backend: Supabase PostgreSQL + Auth.
- Dev mặc định có thể dùng mock nếu được chốt.
- Media: Cloudinary.
- Thông tin kết nối thường gồm Supabase và Cloudinary; có thể có Google Sheets/AppSheet tùy dự án.

## Ảnh 2: domain/sidebar

Domain/sidebar mẫu:

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

## Ảnh 3-4: module/view/tab mẫu

Ví dụ mapping từ sheet:

| Submenu | Nhóm module | Tên view/module | Tab |
| --- | --- | --- | --- |
| Hệ thống | Sơ đồ | Phòng ban | |
| Hệ thống | Sơ đồ | Chức vụ | |
| Hệ thống | Sơ đồ | Nhân viên | |
| Hệ thống | Thiết lập khác | Thông tin công ty | |
| Hệ thống | Thiết lập khác | Phân quyền | |
| Quản lý vận tải | Kế hoạch | Chuyến xe | Danh sách, Danh sách CT |
| Quản lý vận tải | Kế hoạch | Bảng lương | Danh sách |
| Quản lý vận tải | Kế hoạch | Thống kê chuyến | Lọc theo ngày, chuyến, tài xế, địa điểm, xe, thống kê lương, chi phí |
| Quản lý vận tải | Kế hoạch | Thống kê lương | Lọc theo ngày, tài xế |
| Quản lý vận tải | Thiết lập | Tài xế | |
| Quản lý vận tải | Thiết lập | Địa điểm | |
| Quản lý vận tải | Thiết lập | Danh sách xe | |

## Ảnh 5: mapping source

Khi người dùng đưa sheet/ảnh mapping tương tự, AI phải dùng nó làm nguồn chính để tìm trong source và map tới route/component/service/table.

Không được tự đổi domain/module/view/tab nếu chưa hỏi.

## Ảnh 6: schema ví dụ

Các bảng/cột ví dụ:

- `var_cong_ty`: thương hiệu/logo, tên ứng dụng, mô tả ngắn, thông tin pháp nhân, tên công ty đầy đủ, mã số thuế, số điện thoại, email liên hệ, website, địa chỉ trụ sở.
- `var_phan_quyen`: `id int8`, `id_chuc_vu text`, `id_module text`, `quyen text`.
- `var_phong_ban`: `id int8`, `tt`, `ma_phong_ban`, `ten_phong_ban`, `mo_ta`, `id_phong_ban_quan_ly`, `trang_thai`.
- `var_chuc_vu`: `id int8`, `tt`, `ma_chuc_vu`, `ten_chuc_vu`, `mo_ta`, `id_phong_ban`, `trang_thai`.
- `var_nhan_vien`: ghi chú `cho đăng nhập = tên đăng nhập`.
- `vt_tai_xe`: `id`, `ho_ten`, `trang_thai`, `id_nhan_vien`.
- `vt_xe`: `id`, `hang`, `model`, `doi`, `bien_so`.
- `vt_dia_diem`: `id`, `nhom`, `ten`, `mo_ta`, `tien_luong`, `ghi_chu`, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
- `vt_chuyen_xe`: `id`, `ngay`, `id_tai_xe`, số chuyến, tổng tiền lương, tổng phí, ghi chú, trạng thái.
- `vt_chuyen_xe_ct`: `id`, `id_chuyen_xe`, `id_dia_diem`, tiền lương initial, chi phí theo chuyến, ghi chú, trạng thái/phê duyệt.
- `vt_luong`: `id`, `nam`, `thang`, `id_tai_xe`, tổng lương theo chuyến, tổng chi phí theo chuyến, tổng chi phí khác, ghi chú chi phí, trạng thái, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.

## Ảnh 7: cấu trúc bảng chung

Khung cột chung:

- `id`
- tên/label
- trạng thái
- các trường nhóm/phân loại
- mô tả + ghi chú
- `id_nguoi_tao`
- `tg_tao`
- `tg_cap_nhat`

## Ảnh 8/chat owner

Quy tắc owner nói:

- `id_nguoi_tao` phải có ở hầu hết bảng.
- Các bảng hệ thống như phòng ban/chức vụ có thể không cần `id_nguoi_tao`.
- `tg_tao` và `tg_cap_nhat` thì bảng nào cũng có.
- Có vấn đề gì phải trao đổi lại ngay.

## Giới hạn suy luận

Được suy luận:

- Format tổ chức module.
- Hướng đặt tên bảng/cột.
- Cách mapping từ spec sang frontend/backend.
- Cách hỏi credentials và kiểm tra format.

Không được tự chốt:

- App hiện tại có đúng toàn bộ ví dụ trên không.
- Prefix mới ngoài ví dụ.
- SQL/migration production.
- Permission cụ thể từng module.
- Credentials hoặc secret.

## Ảnh Sheet 2 ngày 2026-05-30: dự án và quy tắc triển khai

Nguồn: ảnh người dùng gửi trong chat ngày 2026-05-30, sheet `5f edu - Xuân Lĩnh`.

### Dự án

- Tên dự án: `TAH app`.
- Trạng thái: `Mới`.
- Deadline 80%: `03/06/2026`.
- Nghiệm thu: `18/06/2026`.
- Tổng tiền: `3.000.000`.
- Còn lại: `3.000.000`.

### Quy tắc source/code

- Code sạch, dùng lại tốt, dễ mở rộng.
- Cấu trúc thư mục chia theo từng chức năng, ví dụ `Hệ thống`, `Nhân sự`.
- Cây thư mục tham khảo app template.
- File trong từng module tham khảo template.
- Tên submenu và thư mục module dùng tiếng Việt để người không biết tiếng Anh vẫn dễ tra cứu.
- Tên view dùng dạng hybrid tiếng Việt + English suffix, ví dụ `nhan-vien-form`.

### Quy tắc database chi tiết

- Tên bảng viết theo toàn bộ submenu + tên module bằng dạng slug/prefix đã chốt theo app.
- Ví dụ đúng: `var_nhan_su`, `hc_phieu_hanh_chinh`.
- Ví dụ sai: `nhan-su`, `1.nhan-su`.
- Cấu trúc bảng chung gồm: `id int8`, cột label/name, cột nhóm/phân loại, cột liên kết dạng `id_<doi_tuong>`, mô tả/diễn giải, ghi chú, trạng thái, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
- Bảng đầy đủ phải có cấu trúc cột, policy authenticated, hàm index/convention search, trigger cho `tg_cap_nhat`.
- Lỗi thường gặp cần tránh: dùng `uuid` cho `id`, sai cấu trúc tên cột liên kết.

### Auth, tài khoản và nhân viên

- Đăng nhập theo fake email: nhập `admin` thì app tự hiểu là `admin@gmail.com`.
- Bỏ tính năng đăng ký.
- Tài khoản mặc định để test: `admin` / `5fedu.com`.
- Module nhân viên giữ trường chính: `id`, `ho_va_ten`, `avatar`, `trang_thai`, `id_phong_ban`, `id_chuc_vu`, `so_dien_thoai`, `email`, `ten_dang_nhap`.
- Khi tạo mới hoặc đổi `ten_dang_nhap`, Supabase cần tạo/xóa tài khoản theo `<ten_dang_nhap>@gmail.com`, mật khẩu mặc định `123456`. Flow này cần xử lý bằng server/admin path, không đưa service role vào frontend.

### Flow, UI, search, notification

- Flow thao tác chuẩn: đang ở detail bảng cha -> bấm thêm dòng con -> mở form -> lưu hoặc hủy -> quay lại detail bảng cha.
- Module có nhiều tab phải lưu tab hiện tại bằng router query `?tab=<tab>`.
- Search box phải tìm được tất cả trường trong bảng và trường liên kết hiển thị. Ví dụ bảng chỉ có `id_nguoi_tao` nhưng người dùng tìm theo tên nhân viên vẫn phải ra kết quả.
- Notification mặc định là demo: trên icon có dấu demo, bấm vào báo chức năng không sẵn có để người dùng không đòi hỏi notification thật ở giai đoạn này.

### Permission chi tiết

- Mặc định module có quyền `xem`, `them`, `sua`, `xoa`, `quan_tri`.
- Có thể có nút chọn tất cả trên UI, nhưng khi lưu vẫn lưu từng quyền thật.
- Có quyền module thì hiển thị module/submenu; không có quyền thì bị chặn khi truy cập route.
- `quan_tri` luôn được xem, thêm, sửa, xóa toàn bộ bất kể rule chi tiết.
- Rule xem có thể phụ thuộc cấp bậc/phòng/nhóm:
  - `cap_bac=1`: xem hết.
  - `cap_bac=2`: xem trong phòng.
  - `cap_bac=3`: xem trong nhóm.
  - còn lại: chỉ xem dữ liệu của chính nhân sự đó.
- `them`: nhân sự có chức vụ `cap_bac=1`, hoặc có quyền `quan_tri`, hoặc có quyền `them`.
- `sua`: nhân sự có chức vụ `cap_bac=1`, hoặc có quyền `quan_tri`, hoặc có quyền `sua`.
- `xoa`: nhân sự có chức vụ `cap_bac=1`, hoặc có quyền `quan_tri`, hoặc có quyền `xoa`.
- Module key lưu trên Supabase phải là tiếng Việt không dấu của tên module, ví dụ đúng `nhan-vien`, sai `he-thong/nhan-vien`.
- Với module như bảng lương, dữ liệu có thể chỉ cho phép xem của chính người đó theo app-side permission. Không tự thêm RLS Supabase nếu chưa được chốt.

### Delivery

- Giao diện desktop dùng list view, mobile dùng card view; form/detail view theo template.
- Làm xong dự án phải có plan tối ưu tránh quá tải Supabase Egress và Vercel Edge Function, tham khảo tài liệu chính thức mới nhất của Supabase/Vercel.
- Khi push cần push GitHub theo quy trình repo hiện tại.
## Ảnh phản hồi owner ngày 2026-05-31

Nguồn: ảnh chat người dùng gửi ngày 2026-05-31.

Các ý đã chốt từ phản hồi:

- Owner nhắc: `id` các bảng phải là `int8` và tự động tăng dần.
- Supabase có tính năng auto increment cho `int8`; không được bỏ qua hoặc nói không có.
- Owner yêu cầu đọc lại note/sheet kỹ vì đang sai nhiều, nhất là phần đăng nhập.
- Bảng nhân viên phải bỏ các trường linh tinh.
- Phần login phải làm chuẩn trước: không phải mã nhân viên, mà là `ten_dang_nhap`.
- Khi thêm/sửa `ten_dang_nhap` phải tự sửa Supabase Auth user; khi xóa phải xóa Supabase Auth user tương ứng.
- Người dùng sẽ đăng nhập Google trong browser để cấp quyền đọc 2 Google Sheets làm source tham chiếu chính.

Các ý này đã được chuẩn hóa thành gate chi tiết ở `context/5fedu/evidence/owner-feedback-lessons.md` và `domains/ui-delivery.md`.


