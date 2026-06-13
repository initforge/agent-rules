# Câu Hỏi Cần Hỏi Đúng Lúc

## Không hỏi lại

Các mục sau đã chốt, không hỏi lại kiểu scope ban đầu:

- Có clone/adapt template không: có.
- App name hiện tại: `TAH APP`.
- Spec source hiện tại: ảnh/spec người dùng đã gửi.
- Scope: làm full app A-Z, không hỏi "module đầu tiên/phase đầu".
- Backend mode: Supabase thật.
- Tech stack hiện tại: theo ảnh 1 và `07-working-format.md`.
- Rule/setup Sheet 2 đã thấy trong ảnh ngày 2026-05-30: source/module naming, database format, auth default, flow thao tác, tab query, search liên kết, notification demo, permission default/cấp bậc.

Nếu cần chia nhỏ việc làm, AI tự chia thành plan/slice nội bộ để kiểm soát rủi ro rồi báo thứ tự, không hỏi người dùng chọn "phase đầu".

## Chỉ hỏi khi chuẩn bị dùng thật

- Supabase URL và anon key là gì?
- Có cần service role cho auth/admin flow không? Nếu có, cung cấp qua kênh secret/env, không paste vào docs.
- Cloudinary credentials là gì nếu flow hiện tại cần upload/media thật?
- Google Sheets/AppSheet có dùng trong flow hiện tại không? Nếu có, cần credential format nào?
- Vercel project/env/token có cần khi deploy hoặc tối ưu Edge Function không?

## Chỉ hỏi khi tạo schema/migration thật

- "Hàm index" trong convention của 5fedu là SQL index, search function/RPC, hay mẫu riêng? Có SQL mẫu không?
- Với prefix mới ngoài các bảng đã thấy trong ảnh/spec, prefix chuẩn là gì?
- Module nào có permission exception so với default `xem/them/sua/xoa/quan_tri`?

## Cách hỏi

- Hỏi ngắn, đúng chỗ đang bị chặn.
- Không hỏi lại dữ kiện đã `DA_CHOT`.
- Không biến câu hỏi kỹ thuật nội bộ thành câu hỏi thu hẹp scope dự án.
## Cập nhật câu hỏi đang mở 2026-05-30

- Supabase: đã có project URL + publishable key + secret key trong chat và đã setup local env ignored. User đã cung cấp DB connection string ngày 2026-05-30; migration production đã chạy thành công, 11 bảng app trong schema `public` đã tồn tại và query được bằng user authenticated. Không ghi connection string/password thật vào repo/docs.
- Google Sheet 2: ảnh người dùng gửi đã đủ cho rule/setup đang thấy. Nếu cần export/survey toàn bộ cell bằng script thì vẫn cần user đăng nhập Google trong browser hoặc cấp quyền/link truy cập vì export từng trả `401 Unauthorized`.
## Cập nhật 2026-05-31

Không hỏi lại các điểm owner đã chốt:

- `id` bảng app phải là `int8` và tự động tăng dần.
- Supabase có hỗ trợ auto increment cho `int8`.
- Bảng nhân viên không được tự thêm trường linh tinh.
- Login dùng `ten_dang_nhap`, không dùng `ma_nhan_vien`.
- Thêm/sửa/xóa `ten_dang_nhap` phải đồng bộ Supabase Auth user tương ứng.

Chỉ hỏi lại khi:

- Google Sheet/source có thêm cột nhân viên ngoài danh sách tối giản và cần xác nhận có dùng thật không.
- Cần xử lý dữ liệu production đã lỡ tạo sai schema: hỏi phương án migrate/drop/recreate vì có thể mất dữ liệu.
- (ĐÃ GIẢI QUYẾT) Đồng bộ Supabase Auth 2 chiều: Sử dụng kết hợp serverless API `/api/employee-auth-sync` (từ App sang Auth) và Database triggers (từ Auth sang App) hoạt động đồng bộ hoàn chỉnh trên live production.


