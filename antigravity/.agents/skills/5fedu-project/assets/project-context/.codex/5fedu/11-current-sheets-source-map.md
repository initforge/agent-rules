# Current Google Sheets Source Map

Nguồn chính đã public và tải ngày 2026-05-31:

- Sheet app/data/spec: `https://docs.google.com/spreadsheets/d/1NY4sVW2GZaOjtZ-Mivq-B5PlXZPL_QEhbJjAJe_0ddg/edit?usp=sharing`
- Sheet dự án/quy tắc: `https://docs.google.com/spreadsheets/d/1KF3Pe-N7S4DJm_6TKi9QXy4jXPKzqDmeLVHxgiuGoZY/edit?usp=sharing`

File export local dùng để phân tích:

- `output/sheets/current/sheet-1NY4sVW2GZaOjtZ-Mivq-B5PlXZPL_QEhbJjAJe_0ddg.xlsx`
- `output/sheets/current/sheet-1KF3Pe-N7S4DJm_6TKi9QXy4jXPKzqDmeLVHxgiuGoZY.xlsx`
- `output/sheets/current/google-sheets-analysis.md`
- `output/sheets/current/google-sheets-analysis.json`

## App và stack

Nguồn: Sheet app, tab `Mô tả chung`.

- `A1:B1`: app name là `TAH APP`.
- `A2:B6`: stack gồm React Vite TypeScript, Tailwind CSS, internal `components/ui`, TanStack Query, Zustand, React Hook Form, Zod, Supabase PostgreSQL/Auth, Cloudinary.
- `B5`: sheet ghi "mặc định dev có thể dùng mock", nhưng dự án hiện tại đã chốt backend Supabase thật; không được quay về mock nếu không có lý do rõ.

## Dự án và deadline

Nguồn: Sheet dự án/quy tắc, tab `Dự án`.

- `B2`: tên dự án `TAH app`.
- `D2`: trạng thái `Mới`.
- `E2`: deadline 80% là `03/06/2026`.
- `F2`: nghiệm thu là `18/06/2026`.
- `G2`: tổng tiền `3,000,000`.
- `L2`: còn lại `3,000,000`.

## Module/view/tab phải có

Nguồn: Sheet app, tab `Thiết kế View & Tab`.

| Submenu | Nhóm module | View/module | Tab |
| --- | --- | --- | --- |
| Hệ thống | Sơ đồ | Phòng ban | |
| Hệ thống | Sơ đồ | Chức vụ | |
| Hệ thống | Sơ đồ | Nhân viên | |
| Hệ thống | Thiết lập khác | Thông tin công ty | |
| Hệ thống | Thiết lập khác | Phân quyền | |
| Quản lý vận tải | Kế hoạch | Chuyến xe | Danh sách, Danh sách CT |
| Quản lý vận tải | Kế hoạch | Bảng lương | Danh sách |
| Quản lý vận tải | Kế hoạch | Thống kê chuyến đi | Lọc theo ngày, chuyến, tài xế, địa điểm, xe; thống kê lương, chi phí |
| Quản lý vận tải | Kế hoạch | Thống kê lương | Lọc theo ngày, tài xế |
| Quản lý vận tải | Thiết lập | Tài xế | |
| Quản lý vận tải | Thiết lập | Địa điểm | |
| Quản lý vận tải | Thiết lập | Danh sách xe | |

## Fix app bắt buộc

Nguồn: Sheet app, tab `Fix app`.

- `C2`: database là Supabase.
- `C3`: đăng nhập fake email, nhập `admin` thì app tự hiểu là `admin@gmail.com`.
- `C4`: bỏ tính năng đăng ký.
- `C5`: module nhân viên loại bỏ trường rườm rà, chỉ giữ trường chính: `id`, `ho_va_ten`, `avatar`, `trang_thai`, `id_phong_ban`, `id_chuc_vu`, `so_dien_thoai`, `email`, `ten_dang_nhap`.
- `C6`: khi tạo mới hoặc đổi tên đăng nhập, Supabase tự tạo/xóa auth account theo `ten_dang_nhap@gmail.com`, mật khẩu mặc định `123456`.
- `C7`: module chức vụ phải có `cap_bac`; cấp 1 xem hết, cấp 2 xem trong phòng, cấp 3 xem trong nhóm, cấp 4 tự xem của mình.

## Quy tắc triển khai chung

Nguồn: Sheet dự án/quy tắc, tab `Quy tắc`.

- `C2:C5`: code sạch, dùng lại tốt, dễ mở rộng; cấu trúc thư mục chia theo chức năng và tham khảo app template.
- `C6:D6`: tên submenu/thư mục module là tiếng Việt để người không biết tiếng Anh dễ tra cứu.
- `C7:D7`: tên view dạng hybrid tiếng Việt không dấu + suffix English, ví dụ `nhan-vien-form`.
- `C8:D8`: tên bảng dùng viết tắt submenu + tên module; đúng `var_nhan_su`, `hc_phieu_hanh_chinh`; sai `nhan-su`, `1.nhan-su`.
- `C9:D9`: cấu trúc bảng chung gồm `id int8`, label, nhóm/phân loại, cột liên kết `id_<doi_tuong>`, mô tả/diễn giải, ghi chú, trạng thái, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`; lỗi hay gặp là dùng `uuid` hoặc đặt sai tên cột liên kết.
- `C10`: bảng đầy đủ phải có cấu trúc cột, policy authenticated, hàm index, trigger `tg_cap_nhat`.
- `C14:D14`: đăng nhập fake email.
- `C15`: bỏ đăng ký.
- `C16`: tài khoản mặc định `admin` / `5fedu.com`.
- `C17:C18`: nhân viên tối giản và đồng bộ Supabase Auth theo `ten_dang_nhap@gmail.com`, mật khẩu `123456`.
- `C19`: desktop list view, mobile card view; list/card/detail/form theo template.
- `C20`: flow đứng ở đâu quay lại đó.
- `C21`: module nhiều tab phải có router `?tab=<tab>`.
- `C23`: search phải tìm được tất cả trường trực tiếp và trường liên kết hiển thị.
- `C24:D24`: notification mặc định là demo.
- `C25:D27`: permission gồm `xem/them/sua/xoa/quan_tri`, `tat_ca` chỉ UI helper; module key lưu Supabase là slug module không dấu như `nhan-vien`; lọc dữ liệu bằng app-side permission, không cần RLS mặc định.
- `C30:D30`: khi làm xong phải có plan tối ưu Supabase Egress + Vercel Edge Function theo tài liệu gốc.
- `C31`: khi push thì push GitHub theo quy trình repo.

## Database từ tab `database`

Nguồn: Sheet app, tab `database`.

Các bảng xuất hiện:

- `var_cong_ty`
- `var_phan_quyen`
- `var_phong_ban`
- `var_chuc_vu`
- `var_nhan_vien`
- `vt_tai_xe`
- `vt_xe`
- `vt_dia_diem`
- `vt_chuyen_xe`
- `vt_chuyen_xe_ct`
- `vt_luong`

Các điểm cần áp dụng chính xác:

- `var_phan_quyen`: `id int8`, `id_chuc_vu text`, `id_module text`, `quyen text`, `mo_ta`.
- `var_phong_ban`: `id int8`, `tt`, `ma_phong_ban`, `ten_phong_ban`, `mo_ta`, `id_phong_ban_quan_ly`, `trang_thai`, `tg_tao`, `tg_cap_nhat`.
- `var_chuc_vu`: có `id`, `tt`, `ma_chuc_vu`, `ten_chuc_vu`, `mo_ta`, `id_phong_ban`, `trang_thai`; phải bổ sung `cap_bac` theo tab `Fix app`/`Quy tắc`.
- `var_nhan_vien`: tối giản theo tab `Fix app`, có đăng nhập bằng tên đăng nhập + mật khẩu.
- `vt_tai_xe`: `id`, `ho_ten`, `trang_thai`, `id_nhan_vien`.
- `vt_xe`: `id`, `hang`, `model`, `doi`, `bien_so`, ghi chú/thông tin ngắn gọn.
- `vt_dia_diem`: `id`, `nhom`, `ten`, `mo_ta`, `tien_luong`, `ghi_chu`, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`, `dinh_vi`.
- `vt_chuyen_xe`: `id`, `ngay`, `id_tai_xe`, số chuyến, tổng tiền lương, tổng phí, ghi chú, trạng thái `Chưa thực hiện/Đã thực hiện/Hủy`.
- `vt_chuyen_xe_ct`: `id`, `id_chuyen_xe`, `id_dia_diem`, tiền lương initial, chi phí theo chuyến mặc định tham chiếu `80.000`, ghi chú, phê duyệt `Chưa duyệt/Đã duyệt`; đã duyệt thì không cho chỉnh sửa nữa.
- `vt_luong`: `id`, `nam`, `thang`, `id_tai_xe`, tổng lương theo chuyến, tổng chi phí theo chuyến, tổng chi phí khác, ghi chú chi phí, trạng thái `Chưa duyệt/Đã duyệt`, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.

## Dữ liệu vận tải theo tháng

Nguồn: Sheet app, các tab `T03 2025` đến `T05 2026`.

Mẫu dữ liệu gốc:

- Mỗi tab tháng có dòng ngày, nhiều cột `Chuyến 1..6`, nhiều cột `Lương chuyến 1..6`, `TỔNG CỘNG`, có tháng có `Phí`, `ỨNG`, `Chú thích`, `Tài xế`.
- Từ `T04 2026` có cột `Tài xế`, ví dụ `Xuyến`.
- Các địa điểm/chuyến xuất hiện thực tế gồm `Chợ Lớn`, `Dragon`, `PVĐồng`, `Opal`, `HTX`, `Food BD`, `Q7`, `VThanh`, `GVap`, `BCon`, `Phú Xuân`, `TSong VTinh`, v.v.

Khi seed/import dữ liệu demo thật:

- Không hardcode vài dòng giả chung chung nếu đã có sheet thật.
- Cần normalize tháng/ngày/chuyến/lương thành bảng `vt_chuyen_xe` và `vt_chuyen_xe_ct`.
- Lương theo từng chuyến phải khớp với địa điểm/chuyến tương ứng cùng hàng.
- Tổng cộng phải được verify bằng tổng lương chuyến cộng phí/ứng nếu có rule cụ thể.

## Owner Feedback Bổ Sung 2026-05-31

Các điểm dưới đây là owner feedback bổ sung sau khi đối chiếu app thật, được dùng cùng với source Google Sheets:

- Trang chủ: thứ tự `Quản lý vận tải` -> `Hệ thống` -> `Thông tin bản quyền`.
- Nhân viên: email trong bảng/form là email thực tế của nhân viên; fake email auth vẫn sinh từ `ten_dang_nhap@gmail.com`.
- Tài xế: có thể là người ngoài công ty, không bắt buộc liên kết nhân viên; form/detail cần đủ thông tin tài xế và lịch sử chuyến xe/lương.
- Địa điểm và xe: form/detail/list phải theo chuẩn template và có lịch sử chuyến liên quan khi có dữ liệu.
- Bảng lương: tài xế dùng combobox, tổng lương chuyến lấy từ chuyến đi thực tế, có trừ tiền khác, tổng còn lại, nút in, duyệt tách khỏi form.
- Chuyến xe: bảng cha tự tính tổng chuyến/tổng tiền từ chi tiết, không nhập tay các tổng nếu có dữ liệu con.
- Thống kê chuyến đi: phải làm giao diện report/dashboard đúng nghiệp vụ, không dùng giao diện tạm.

Chi tiết gate nằm ở `.codex/5fedu/12-owner-feedback-transport-ui.md`.
