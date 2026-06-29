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
## Quy Tắc Thiết Kế Đăng Nhập & Đồng Bộ Supabase Auth (Quy Tắc Cứng)

1. **Thông Tin Đăng Nhập**:
   - Sử dụng thống nhất `ten_dang_nhap` để thực hiện xác thực, tuyệt đối không dùng `ma_nhan_vien` để đăng nhập.
   - Tài khoản kiểm thử mặc định:
     - Tên đăng nhập: `admin` (app tự động chuyển hóa thành fake email `admin@gmail.com`).
     - Mật khẩu mặc định: `5fedu.com`.

2. **Cơ Chế Đồng Bộ Supabase Auth Cho Tài Khoản Nhân Viên**:
   - **Khi Thêm Mới**: Tạo tài khoản nhân viên đồng thời phải tạo tài khoản Supabase Auth tương ứng bằng fake email `<ten_dang_nhap>@gmail.com` với mật khẩu mặc định là `123456`.
   - **Khi Chỉnh Sửa `ten_dang_nhap`**: Thực hiện cập nhật tài khoản Auth tương ứng bằng cách đổi email sang `<ten_dang_nhap_moi>@gmail.com` hoặc dùng API quản trị để thay thế.
   - **Khi Xóa Nhân Viên / Xóa `ten_dang_nhap`**: Bắt buộc phải xóa hoặc vô hiệu hóa tài khoản Supabase Auth tương ứng để ngăn chặn truy cập trái phép.

3. **Bảo Mật Quyền Quản Trị**:
   - Tất cả các tác vụ quản lý user trong Supabase Auth (tạo, cập nhật, xóa) là HIGH risk, bắt buộc phải thực hiện thông qua backend server/admin path (ví dụ: Supabase Edge Functions, database triggers hoặc admin APIs).
   - Tuyệt đối không được nhúng `service_role_key` của Supabase vào client-side/frontend code.

4. **Xử Lý Lỗi Đồng Bộ Auth Bất Lập Trình (Graceful Auth Sync Degradation)**:
   - Khi thực hiện CRUD Nhân viên, nếu API đồng bộ Auth (`/api/employee-auth-sync`) trả về lỗi hoặc thiếu các biến môi trường cấu hình Supabase Admin Keys trên môi trường Production/Vercel (gây ra lỗi `Supabase admin env is missing`), luồng nghiệp vụ chính vẫn phải được tiếp tục thực thi thành công ở tầng database.
   - Riêng tác vụ xóa nhân viên (`operation === 'delete'`), hoặc bất kỳ tác vụ nào gặp lỗi thiếu cấu hình (`env is missing`), tầng service phải tự động catch lỗi, ghi log cảnh báo và tiếp tục thực hiện lệnh xóa/chỉnh sửa database mà không được phép ném lỗi (throw error) chặn thao tác của người dùng.

## Checklist Triển Khai Phân Quyền (Implementation Verification — QUY TẮC CỨNG)

**Mỗi khi viết hoặc sửa code liên quan đến phân quyền, AI bắt buộc phải tự kiểm tra toàn bộ pipeline dữ liệu sau:**

- [ ] **Store đã khai báo đủ trường?** — `usePermissionGrantStore` phải có: `matrixActive`, `grantsByModule`, `capBac`, `employeeRecord` (bản ghi nhân viên từ `var_nhan_vien` khớp với user đang đăng nhập).
- [ ] **Hook hydrate đã tải đủ dữ liệu?** — `use-hydrate-position-permissions.ts` phải tải: (1) quyền theo chức vụ từ `var_phan_quyen`, (2) `cap_bac` từ `var_chuc_vu`, (3) bản ghi nhân viên từ `var_nhan_vien` theo `ten_dang_nhap`.
- [ ] **`lib/permissions.ts` có dùng biến nào chưa được populate không?** — Grep tất cả các biến được sử dụng trong các hàm `can()`, `filterRowsByPermissions()`, `canEditRow()`, `canDeleteRow()`, `canApproveRow()`, `canAddChildRow()` và đối chiếu với Store.
- [ ] **Các Module Factory đã truyền đúng tham số?** — `createFeatureModule`, `createFlatListFeatureModule`, `createHierarchyFeatureModule` phải lấy `employeeRecord` từ store và truyền vào `filterRowsByPermissions`.
- [ ] **Đã test/trace cho cả 3 cấp bậc?** — Admin (cap_bac=1), Trưởng phòng (cap_bac=2), Nhân viên (cap_bac≥3).

**Nếu bất kỳ mục nào FAIL → KHÔNG được báo hoàn thành task.**


