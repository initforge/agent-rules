# Database Và Supabase

## Credentials

Ngay đầu dự án phải yêu cầu người dùng cung cấp credentials cần thiết và kiểm tra đúng format mà không in secret:

- Supabase project URL.
- Supabase anon key.
- Supabase service role key nếu cần tác vụ admin/auth server-side.
- Database connection string hoặc password nếu cần migration trực tiếp.
- Cloudinary cloud name, upload preset, API key/secret nếu có upload media.
- Google Sheets/AppSheet credentials nếu spec hoặc dữ liệu đến từ đó.
- Vercel token/project/env nếu có deploy hoặc Edge Function.

Không lưu secret thật vào repo, plan, docs, log hoặc câu trả lời.

## Nguyên tắc kết nối thật

- Frontend và database phải được nối thật khi credentials đã sẵn sàng.
- Không để chức năng thiếu handler, nút bấm không phản hồi, hoặc flow giả vờ thành công.
- Nếu buộc phải mock, ghi rõ phạm vi mock và điều kiện chuyển sang real data.
- Code handler/service nên tách rõ để dễ map frontend -> database -> debug.

## Quy tắc đặt tên bảng

Tên bảng dùng viết tắt submenu + tên module.

Đúng:

```text
hc_phieu_hanh_chinh
var_nhan_su
```

Sai:

```text
nhan-su
1.nhan-su
```

Cần xác nhận danh sách viết tắt submenu của từng dự án trước khi tạo schema.

## Ví dụ bảng/cột đã thấy từ spec/ảnh

Các ví dụ này là mẫu suy luận, không tự coi là schema final nếu dự án chưa chốt:

- `var_cong_ty`: thông tin yêu cầu như thương hiệu/logo, tên ứng dụng, mô tả ngắn, thông tin pháp nhân, tên công ty đầy đủ, mã số thuế, số điện thoại, email liên hệ, website, địa chỉ trụ sở.
- `var_phan_quyen`: `id int8`, `id_chuc_vu text`, `id_module text`, `quyen text`.
- `var_phong_ban`: `id int8`, `tt`, `ma_phong_ban`, `ten_phong_ban`, `mo_ta`, `id_phong_ban_quan_ly`, `trang_thai`.
- `var_chuc_vu`: `id int8`, `tt`, `ma_chuc_vu`, `ten_chuc_vu`, `mo_ta`, `id_phong_ban`, `trang_thai`.
- `var_nhan_vien`: có ghi chú `cho đăng nhập = tên đăng nhập`; trường chi tiết cần chốt theo module nhân viên rút gọn.
- `vt_tai_xe`: ví dụ gồm `id`, `ho_ten`, `trang_thai`, `id_nhan_vien`.
- `vt_xe`: ví dụ gồm `id`, `hang`, `model`, `doi`, `bien_so`.
- `vt_dia_diem`: ví dụ gồm `id`, `nhom`, `ten`, `mo_ta`, `tien_luong`, `ghi_chu`, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
- `vt_chuyen_xe`: ví dụ gồm `id`, `ngay`, `id_tai_xe`, số chuyến, tổng tiền lương, tổng phí, ghi chú, trạng thái.
- `vt_chuyen_xe_ct`: ví dụ gồm `id`, `id_chuyen_xe`, `id_dia_diem`, tiền lương initial, chi phí theo chuyến, ghi chú, trạng thái/phê duyệt.
- `vt_luong`: ví dụ gồm `id`, `nam`, `thang`, `id_tai_xe`, tổng lương theo chuyến, tổng chi phí theo chuyến, tổng chi phí khác, ghi chú chi phí, trạng thái, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.

Các prefix đã thấy gồm `var_` và `vt_`; prefix đầy đủ theo submenu vẫn cần chốt trước khi tạo schema mới.

## Cấu trúc bảng chung

Các bảng đầy đủ thường có:

- `id int8`, không mặc định dùng uuid.
- Cột label/tên chính, ví dụ `ten`, `ho_va_ten`.
- Các cột nhóm/phân loại.
- Cột liên kết dạng `id_<doi_tuong>`, ví dụ `id_khach_hang`, `id_san_pham`.
- `mo_ta` hoặc `dien_giai`.
- `ghi_chu`.
- `trang_thai`.
- `id_nguoi_tao` cho đa số bảng nghiệp vụ.
- `tg_tao`.
- `tg_cap_nhat`.

Ghi chú từ 5fedu: `id_nguoi_tao` phải có ở hầu hết bảng, trừ một số bảng hệ thống như phòng ban/chức vụ nếu owner xác nhận không cần. `tg_tao` và `tg_cap_nhat` thì bảng nào cũng có.

## Yêu cầu bảng đầy đủ

Mỗi bảng đầy đủ cần có:

- Cấu trúc cột rõ ràng.
- Policy authenticated.
- Index/function/indexing theo convention dự án.
- Trigger cập nhật `tg_cap_nhat`.

Nếu "hàm index" chưa có mẫu cụ thể, hỏi người dùng hoặc xin SQL mẫu trước khi tự thiết kế.

## Phân quyền dữ liệu

Mặc định lọc quyền trên app cho dữ liệu nghiệp vụ, không tự đẩy toàn bộ logic vào Supabase RLS nếu người dùng chưa yêu cầu. Lý do: AI cần đọc và kiểm soát được logic phân quyền trong app.
