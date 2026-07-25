# Bản Đồ Dữ Liệu Google Sheets Nghiệp Vụ Nostime

Tài liệu này lưu trữ đặc tả nghiệp vụ thực tế của Nostime được bóc tách từ 6 tab của Google Sheet chính thức:
- **Google Sheets URL**: https://docs.google.com/spreadsheets/d/1ROjN7Ag0MEcEFkY9C-MLnO2ntVmlru5ecGZM9P-2xGI/edit?gid=262534920
- **Sheet ID**: 1ROjN7Ag0MEcEFkY9C-MLnO2ntVmlru5ecGZM9P-2xGI

---

## 1. Cơ Cấu Phân Hệ Admin Nostime (Sau khi tinh lọc)

Dựa trên Google Sheet và các phản hồi loại bỏ của bạn, các phân hệ nghiệp vụ chính trong Admin bao gồm:

### 1. Tổng quan (Dashboard)
- Hiển thị thống kê nhanh: Doanh số bán hàng, đơn hàng, tổng tồn kho và thu chi.

### 2. Sản phẩm (Products) & Danh mục
- **Cấu trúc danh mục**: 2 cấp (**Brand** và **Model**).
- **Phân loại hàng**: **Sở hữu** hoặc **Ký gửi** (Hàng ký gửi ảnh hưởng đến cách tính lợi nhuận).
- **Quy tắc tồn kho**: Mỗi sản phẩm tương ứng với 1 mã duy nhất (Serial/Mã sản phẩm), **không quản lý số lượng** (mỗi chiếc chỉ có 1 cái độc nhất).
- **Bật/Tắt hiển thị**: Có nút bấm để cho phép hoặc không cho phép sản phẩm hiển thị trên website.
- **Quy tắc ảnh**: Các phần tải ảnh sản phẩm đều dùng hình thức gắn link URL ảnh, không cho phép upload tệp trực tiếp lên server. Gắn được nhiều ảnh cho một sản phẩm.

### 3. Đơn hàng (Orders) & Khách hàng
- Khách tự đặt hàng trên website (không cần đăng nhập, giỏ hàng lưu local storage) hoặc nhân viên tự thêm đơn mới trên admin.
- Trạng thái đơn hàng: **Mới, Đang đóng gói, Đang giao, Đã giao**.
- Quản lý thông tin khách hàng VIP mua hàng.

### 4. Nội dung (Bài viết Journal)
- Soạn thảo bài viết Journal.
- Tải ảnh bài viết bằng hình thức **gắn link URL ảnh** (không tải tệp lên), hỗ trợ gắn nhiều ảnh.
- Thêm mục lục cho bài viết và gắn các sản phẩm liên quan vào bài viết.

### 5. Banner & Giao diện
- Quản lý slide Hero banner trang chủ và các text mô tả hiển thị.

### 6. Sửa chữa & Nhập hàng (Kho)
- **Sửa chữa**: Phiếu dịch vụ sửa chữa đồng hồ (chỉ điền trên admin, không cần đưa lên web). Gắn người quản lý nội bộ và đối tác sửa chữa ngoài.
- **Nhập hàng**: Quản lý nhập mua, nhập ký gửi, nhập tồn kho (theo từng sản phẩm, mỗi chiếc chỉ có 1 cái).
- **Quản lý đối tác**: Danh sách đối tác cung cấp hàng (nhà cung cấp, khách ký gửi) và đối tác sửa chữa dịch vụ. Liên kết chặt chẽ với module "Sửa chữa" và "Nhập hàng".

### 7. Tài liệu nội bộ
- Quản lý tài liệu nội bộ 1 cấp.
- 2 module: **Danh sách tài liệu** và **Thiết lập tài liệu** (Loại tài liệu).
- Phân quyền xem tài liệu chi tiết theo chức vụ hoặc theo từng người.

### 8. Tài chính (Thu chi & Bảng lương)
- **Danh mục tài chính**: 2 tab danh mục thu, danh mục chi.
- **Thu chi & Phân bổ**: Cho phép nhập ngày bắt đầu - kết thúc phân bổ chi phí theo tháng. ListView hiển thị trạng thái phân bổ.
- **Thống kê thu chi**: Tra cứu tài khoản theo kỳ, danh mục và người tạo.
- **Bảng lương**:
  - Tích hợp cột lương vào trang Nhân viên.
  - Bảng điền tay đơn giản, hỗ trợ in phiếu lương.
  - Phân quyền: `cap_bac = 1` hoặc `quan_tri` xem hết, nhân viên bình thường chỉ xem được lương của chính mình.

---

## 2. Quy Tắc Cơ Sở Dữ Liệu Và Liên Kết Bảng

1. **Khóa chính**: `id int8` identity tự tăng dần cho mọi bảng nghiệp vụ của ứng dụng.
2. **Cột Audit**: Mọi bảng bắt buộc có `tg_tao` (timestamp default now()) và `tg_cap_nhat` (timestamp default now() + trigger cập nhật).
3. **Phân quyền Client-side**: Không sử dụng granular RLS database, thực hiện lọc app-side thông qua vai trò và cấp bậc người dùng đăng nhập.
