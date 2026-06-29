# Decision Status

## Quy ước trạng thái

- `DA_CHOT`: đã được người dùng hoặc owner xác nhận rõ, được phép dùng làm cơ sở triển khai.
- `CHUA_CHOT`: mới là ghi nhận ban đầu hoặc mặc định theo 5fedu, chưa được phép triển khai phần rủi ro nếu chưa hỏi lại.
- `CAN_HOI_THEM`: thiếu dữ kiện, ảnh/spec chưa đủ rõ, có nhiều cách hiểu, hoặc cần owner xác nhận thêm.

Chỉ cập nhật một mục sang `DA_CHOT` khi người dùng xác nhận rõ trong chat, tài liệu spec, Google Sheet, source chính thức của dự án, hoặc bằng chính ảnh/spec đã gửi.

## Trạng thái hiện tại

| Mục | Trạng thái | Nguồn/xác nhận | Ghi chú |
| --- | --- | --- | --- |
| Dùng context 5fedu theo từng dự án | DA_CHOT | User prompt | Tránh làm phình global context |
| Repo `P:\5fedunew` là dự án 5fedu | DA_CHOT | User prompt | Đã setup project-local `AGENTS.md` |
| Clone/adapt template `5f-template-ket-noi-supabase` | DA_CHOT | User prompt | Dùng template làm nền và kế thừa logic |
| Spec source hiện tại | DA_CHOT | Google Sheets quét thực tế | Quét trực tiếp 6 tab của sheet `1ROjN7Ag0MEcEFkY9C-MLnO2ntVmlru5ecGZM9P-2xGI` |
| Tech stack & backend Supabase thật | DA_CHOT | User cung cấp keys | Đã cấu hình env, kết nối Supabase thật |
| Quy chuẩn khóa chính `id int8` auto-increment | DA_CHOT | Owner feedback | Identity/bigserial; cấm uuid |
| Module CRM / Tư vấn VIP | DA_CHOT | User prompt 2026-06-23 | **LOẠI BỎ** hoàn toàn khỏi dự án |
| Module Báo cáo | DA_CHOT | User prompt 2026-06-23 | **LOẠI BỎ** hoàn toàn khỏi dự án |
| Module Voucher | DA_CHOT | User prompt 2026-06-23 | **LOẠI BỎ** hoàn toàn khỏi dự án |
| Module Thành viên | DA_CHOT | User prompt 2026-06-23 | **LOẠI BỎ** (Khách không cần đăng nhập/đăng ký) |
| Module Đánh giá | CAN_HOI_THEM | User prompt 2026-06-23 | Lưu trong context, cân nhắc xem xét sau |
| Module Liên hệ | CAN_HOI_THEM | User prompt 2026-06-23 | Lưu trong context, cân nhắc xem xét sau |
| Gắn ảnh sản phẩm & bài viết | DA_CHOT | Google Sheets tab 2 | Dùng dạng dán link URL ảnh, không upload file |
| Quản lý sản phẩm | DA_CHOT | Google Sheets tab 2 | Mỗi sản phẩm là 1 mã duy nhất, không quản lý số lượng |
| Kế thừa Danh mục 2 cấp | DA_CHOT | Mapping nghiệp vụ | Tái sử dụng cấu trúc cây của `var_phong_ban` (Phòng ban) |
| Bảng lương nhân viên | DA_CHOT | Mapping nghiệp vụ | Tích hợp cột lương trực tiếp vào Nhân viên, điền tay và in phiếu |
| Quản lý Đối tác | DA_CHOT | Mapping nghiệp vụ | Tái sử dụng cấu trúc CRUD của `var_chi_nhanh` (Chi nhánh) |
| Quản lý tài liệu | DA_CHOT | Google Sheets tab 2 | 2 module: Danh sách tài liệu & Thiết lập tài liệu, phân quyền theo chức vụ/người |
| Thu chi & Phân bổ tài chính | DA_CHOT | Google Sheets tab 2 | Danh mục Thu/Chi, nhập phân bổ theo tháng |
| Quy cách Admin Panel (xóa Dashboard, redirect /san-pham, điền sẵn login, SVG Watch Gear/Royal Oak Bezel) | DA_CHOT | User prompt | Rút gọn quy trình test và nâng tầm luxury brand context |
| Thống kê tồn kho theo danh mục | DA_CHOT | User feedback | Khai tử "Tồn kho 2 cấp". Thống kê 2 cấp (Hãng > Dòng) hiển thị 3 cột: Tổng - Còn - Đã bán kèm expand. |
| Báo cáo NXT 3 Tab | DA_CHOT | Scraped template | Tích hợp 3 Tab (Tổng hợp theo kỳ, Chi tiết phiếu, Tồn tại thời điểm). |
| Báo cáo Tài khoản Tra cứu theo kỳ | DA_CHOT | Scraped template | 2 Tab (Danh sách, Tra cứu). Hiển thị so sánh số dư đầu/cuối của tất cả tài khoản trong kỳ. |
| Auto-fill Tài khoản Quỹ & Hạng mục P&L trên Đơn hàng | DA_CHOT | User feedback | Tự động điền mặc định dựa trên flag `is_default === true` từ DB. |
| Sửa chữa kết nối bảng Đối tác | DA_CHOT | User feedback | Phiếu sửa chữa lưu khóa ngoại `id_khach_hang` tới bảng khách hàng/đối tác. |
| Danh mục tài chính bỏ phân quyền | DA_CHOT | User feedback | Loại bỏ các trường phân quyền xem/quản lý thừa thãi, hỗ trợ 2 cấp cha/con và cột Hạng mục P&L. |
| Báo cáo tài chính đổi tên thành P&L | DA_CHOT | User feedback | Báo cáo so sánh cột (Tháng, Quý, Năm). |


---

## Cách AI phải dùng file này

- Trước khi code: đọc bảng trạng thái và nêu rõ mục nào đang chặn phần việc thật sự.
- Không hỏi lại các mục đã `DA_CHOT`.
- Khi người dùng chốt: cập nhật trạng thái, nguồn/xác nhận, ghi chú.
- Khi phát hiện mâu thuẫn giữa ảnh, sheet, code template và lời chat: đổi sang `CAN_HOI_THEM`, hỏi lại, không tự chọn.
- Khi lập plan: đưa các mục `CHUA_CHOT`/`CAN_HOI_THEM` liên quan vào Risk Register hoặc Stop Conditions.
