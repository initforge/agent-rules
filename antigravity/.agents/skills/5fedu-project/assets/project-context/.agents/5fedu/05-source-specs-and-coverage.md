# Pillar 5: Source Specs & Coverage Audit

Tài liệu này tổng hợp thông tin chi tiết từ các tài liệu đặc tả gốc (Google Sheets, hình ảnh) và bảng đối chiếu mức độ bao phủ (coverage) của mã nguồn so với yêu cầu gốc của dự án.

---

## 1. Bản Đồ Google Sheets Nghiệp Vụ (Source Mapping)

Các tab và cấu hình cột cụ thể được bóc tách từ Google Sheets làm spec chính:

### Bảng Hệ Thống (`var_`)
- **`var_cong_ty`**: Thương hiệu/logo, tên ứng dụng, mô tả ngắn, thông tin pháp nhân, tên công ty đầy đủ, mã số thuế, số điện thoại, email liên hệ, website, địa chỉ trụ sở.
- **`var_phong_ban`**: `id int8`, `tt` (thứ tự), `ma_phong_ban`, `ten_phong_ban`, `mo_ta`, `id_phong_ban_quan_ly` (cha), `trang_thai`.
- **`var_chuc_vu`**: `id int8`, `tt`, `ma_chuc_vu`, `ten_chuc_vu`, `mo_ta`, `id_phong_ban`, `cap_bac` (1: admin, 2: phòng, 3: nhóm, 4: cá nhân), `trang_thai`.
- **`var_nhan_vien`**: `id int8`, `ho_va_ten`, `avatar`, `trang_thai`, `id_phong_ban`, `id_chuc_vu`, `so_dien_thoai`, `email`, `ten_dang_nhap` (cho đăng nhập), `la_tai_xe` (boolean — cờ phân loại vai trò tài xế, dùng thay cho bảng `vt_tai_xe` riêng biệt).
- **`var_phan_quyen`**: `id int8`, `id_chuc_vu text`, `id_module text`, `quyen text` (xem/them/sua/xoa/quan_tri/kiem_tra), `mo_ta`.

### Bảng Vận Tải (`vt_`)
- **~~`vt_tai_xe`~~** *(Đã gộp)*: Tài xế không còn là bảng riêng. Dữ liệu tài xế được lưu trực tiếp trong `var_nhan_vien` với cờ `la_tai_xe = true`. Các cột bổ sung cho tài xế (`so_gplx`, `hang_bang`, `ngay_het_han_bang`, `id_xe_mac_dinh`, `thong_tin_khac`) nằm trong `var_nhan_vien`.
- **`vt_xe`**: `id int8`, `hang`, `model`, `doi`, `bien_so`, `loai_xe`, `tai_trong`, `han_dang_kiem`, `han_bao_hiem`, `thong_tin_khac`, `trang_thai`.
- **`vt_dia_diem`**: `id int8`, `nhom`, `ten`, `mo_ta`, `tien_luong` (lương chuyến mặc định), `chi_phi` (chi phí mặc định), `ghi_chu`, `dinh_vi`, `dia_chi`, `trang_thai`, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
- **`vt_chuyen_xe`**: `id int8`, `ngay`, `id_tai_xe`, `id_xe`, `so_chuyen`, `tong_tien_luong`, `tong_phi`, `ghi_chu`, `trang_thai` (Chưa thực hiện/Đã thực hiện/Đã duyệt/Hủy), `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
- **`vt_chuyen_xe_ct`**: `id int8`, `id_chuyen_xe`, `id_dia_diem`, `tien_luong` (thực nhận chuyến), `chi_phi` (chi phí chuyến, mặc định tham chiếu 80,000), `ghi_chu`, `trang_thai`, `phe_duyet` (Chưa duyệt/Đã duyệt), `tg_tao`, `tg_cap_nhat`.
- **`vt_luong`**: `id int8`, `nam`, `thang`, `id_tai_xe`, `tong_luong_chuyen` (tổng lương chuyến đi thực tế), `tong_chi_phi_chuyen` (tổng chi phí chuyến thực tế), `tru_tien_khac` (trừ tiền khác/ứng), `tong_chi_phi_khac` (chi phí phát sinh ngoài chuyến), `tong_con_lai` (tự tính = lương chuyến - trừ tiền khác), `ghi_chu_khoan_tru`, `ghi_chu_chi_phi`, `trang_thai` (Chưa duyệt/Đã duyệt), `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.

---

## 2. Đối Chiếu Bao Phủ Yêu Cầu (Coverage Checklist)

Mọi chỉnh sửa mã nguồn nghiệp vụ phải đi qua bảng kiểm soát bao phủ dưới đây:

- [ ] **Giao Diện & Menu**: Đảm bảo thứ tự Sidebar chuẩn (`Quản lý vận tải` -> `Hệ thống` -> `Thông tin bản quyền`). Tên folder và submenu sử dụng tiếng Việt.
- [ ] **Ràng Buộc Khóa Chính**: Kiểm tra DDL script trên production xem kiểu dữ liệu khóa chính `id` có đúng là `bigint` (int8) tự tăng và sequence hoạt động không.
- [ ] **Username Login & Sync**: Kiểm tra đăng nhập bằng username `admin` tự map fake email. Kiểm tra API `/api/employee-auth-sync` tự kích hoạt khi CRUD nhân viên.
- [ ] **Thiết Kế Master-Detail**: Bảng chi tiết chuyến đi nhúng trực tiếp trong chuyến xe cha, có kế thừa trạng thái duyệt khóa dòng con khi cha đã duyệt.
- [ ] **Auto Calculations**: Các cột tổng hợp lương chuyến, tổng chuyến đi, tiền còn lại... phải được tính tự động (ở client hoặc trigger db), không cho phép nhập tay.
- [ ] **Định Dạng Báo Cáo**: Excel export đúng kiểu dữ liệu number (`type 'n'`) và header màu navy; PDF export đúng font Unicode Roboto đăng ký base64 từ CDN.
- [ ] **RLS Policy**: Mọi bảng `vt_*` và `var_*` đều có policy `authenticated_all` trên Supabase.
- [ ] **Trigger Audit**: Mọi bảng đều có trigger tự cập nhật `tg_cap_nhat` trên `BEFORE UPDATE`.

---

## 3. Quy Trình Kiểm Tra Schema Drift (Schema Drift Verification)

**Vấn đề**: Schema trên production có thể bị thay đổi trực tiếp trên Supabase Dashboard (thêm cột, sửa kiểu, xóa ràng buộc) mà không được cập nhật lại vào tài liệu spec hoặc migration files. Điều này khiến Agent suy đoán sai cấu trúc bảng và tạo code lỗi.

**Quy trình bắt buộc**: Trước khi phát triển hoặc sửa đổi bất kỳ tính năng nào liên quan đến database, Agent **phải chạy truy vấn sau** trên Supabase SQL Editor:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '<tên_bảng>'
ORDER BY ordinal_position;
```

Đối chiếu kết quả với mô tả trong mục 1 của tài liệu này. Nếu có sai lệch, phải cập nhật lại tài liệu spec **trước** khi bắt đầu viết code.
