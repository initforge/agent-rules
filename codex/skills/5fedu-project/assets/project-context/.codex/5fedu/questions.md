# Câu Hỏi Cần Chốt

## Trước khi clone/adapt template

- Có clone `https://github.com/tahdieuphoi-ctrl/TAH_app` vào repo hiện tại không?
- Repo hiện tại là app mới hoàn toàn hay đã có code cần giữ?
- App name chính xác là gì?

## Trước khi code feature

- Spec chính nằm ở đâu: Google Sheet, ảnh, tài liệu, hay trao đổi chat?
- Module/domain/view/tab nào thuộc phạm vi lần này?
- Mapping nào đã được owner xác nhận?
- Có màn hình nào chỉ demo không?

## Trước khi nối backend

- Supabase URL và anon key đã có chưa?
- Có cần service role/admin auth flow không?
- Cloudinary credentials đã có chưa?
- Google Sheets/AppSheet credentials có dùng trong dự án này không?
- Vercel project/env có cần setup ngay không?

## Trước khi tạo schema

- Prefix submenu chuẩn là gì?
- Có SQL/table mẫu từ 5fedu không?
- "Hàm index" trong convention đang chỉ index SQL, function search, hay RPC riêng?
- Bảng nào được miễn `id_nguoi_tao`?
- Permission của từng module là rule mặc định hay rule riêng?
