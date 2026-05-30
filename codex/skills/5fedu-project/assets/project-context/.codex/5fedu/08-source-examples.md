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
