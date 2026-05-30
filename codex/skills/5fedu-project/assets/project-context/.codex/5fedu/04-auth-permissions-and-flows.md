# Auth, Permissions Và Flow

## Đăng nhập

- Đăng nhập theo dạng fake email: người dùng nhập `admin`, app hiểu là `admin@gmail.com`.
- Bỏ tính năng đăng ký.
- Tài khoản mặc định: `admin`.
- Mật khẩu mặc định: `5fedu.com`.

## Module nhân viên

Module nhân viên giữ các trường chính:

- `id`
- `ho_va_ten`
- `avatar`
- `trang_thai`
- `id_phong_ban`
- `id_chuc_vu`
- `so_dien_thoai`
- `email`
- `ten_dang_nhap`

Khi tạo mới hoặc đổi `ten_dang_nhap`, Supabase cần tạo/xóa tài khoản theo dạng `<ten_dang_nhap>@gmail.com`, mật khẩu mặc định `123456`. Vì đây là auth/admin flow, phải hỏi rõ và lập plan trước khi triển khai.

## Quyền module

Mặc định module có các quyền:

- `xem`: thấy icon module trên submenu; nếu không có quyền thì vào route trực tiếp bị chặn.
- `them`: hiện nút thêm.
- `sua`: hiện nút sửa hoặc xử lý theo rule module cụ thể.
- `xoa`: tương tự sửa theo rule module cụ thể.
- `quan_tri`: luôn xem/thêm/sửa/xóa toàn bộ dòng bất kể rule.
- `tat_ca`: lựa chọn UI để tick tất cả quyền, không lưu thành quyền riêng trong database.

Module key lưu Supabase dùng slug module không dấu, ví dụ `nhan-vien`; không lưu kèm domain như `he-thong/nhan-vien`.

## Ví dụ rule phân quyền phiếu hành chính

Xem:

- Nhân sự có chức vụ `cap_bac=1` hoặc `quyen_quan_tri` được xem hết.
- Nhân sự có quyền xem và `cap_bac=2` xem trong `phong_id=phong_id`.
- Nhân sự có quyền xem và `cap_bac=3` xem trong `nhom_id=nhom_id`.
- Còn lại chỉ xem phiếu có `id_nhan_vien` của nhân sự đó.

Thêm:

- Nhân sự có chức vụ `cap_bac=1`.
- Nhân sự có `quyen_quan_tri`.
- Nhân sự có quyền `them`.

Sửa:

- Nhân sự có chức vụ `cap_bac=1`.
- Nhân sự có `quyen_quan_tri`.
- Nhân sự có quyền `sua`.

Xóa:

- Nhân sự có chức vụ `cap_bac=1`.
- Nhân sự có `quyen_quan_tri`.
- Nhân sự có quyền `xoa`.

## Flow thao tác

Quy tắc: đứng ở đâu quay lại đó.

- List view -> sửa -> form -> lưu/hủy -> quay lại list view.
- Detail view -> sửa -> form -> lưu/hủy -> quay lại detail view.
- Detail bảng cha -> thêm dòng con -> form -> lưu/hủy -> quay lại detail bảng cha.
