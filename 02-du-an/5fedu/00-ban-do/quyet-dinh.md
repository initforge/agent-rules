# Pillar 4: Decision Status & Backlog

Tài liệu này lưu trữ ma trận trạng thái chốt duyệt tính năng, danh sách câu hỏi mở đang đợi làm rõ từ phía chủ dự án (owner), và nhật ký phản hồi thô (raw feedback log).

---

## 1. Quy Ước Trạng Thái
- **`DA_CHOT`**: Đã được người dùng hoặc owner xác nhận rõ, được phép dùng làm cơ sở triển khai.
- **`CHUA_CHOT`**: Mới là ghi nhận ban đầu hoặc mặc định theo 5fedu, chưa được phép triển khai phần rủi ro nếu chưa hỏi lại.
- **`CAN_HOI_THEM`**: Thiếu dữ kiện, ảnh/spec chưa đủ rõ, có nhiều cách hiểu, hoặc cần owner xác nhận thêm.

*Chỉ chuyển sang `DA_CHOT` khi có xác nhận chính thức từ người dùng qua chat, tài liệu spec, Google Sheets hoặc file ảnh đã được làm rõ.*

---

## 2. Ma Trận Quyết Định Hiện Tại (Decision Matrix)

| Mục | Trạng thái | Nguồn/xác nhận | Ghi chú |
| --- | --- | --- | --- |
| Dùng context 5fedu theo từng dự án | DA_CHOT | User prompt | Tránh làm phình global context |
| Repo `p:\5fedunew` là dự án 5fedu | DA_CHOT | User prompt | Đã setup project-local `AGENTS.md` |
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
| Báo cáo NXT 3 Tab | DA_CHOT | Template + owner feedback 2026-06-29 | `Tổng hợp theo kỳ`, `Chi tiết phiếu`, `Tồn tại thời điểm` |
| Nhân viên là canonical module architecture | DA_CHOT | Owner feedback 2026-06-29 | CRUD dùng nhánh list; thống kê/báo cáo dùng nhánh stats/tab-view của `createFeatureModule` |
| Không có module Tồn kho theo danh mục | DA_CHOT | Owner feedback 2026-06-29 | Chỉ giữ `Tồn kho` và `Báo cáo NXT` |
| Báo cáo Tài khoản tra cứu theo kỳ | DA_CHOT | Template | 2 tab `Danh sách` và `Tra cứu` |
| Auto-fill Tài khoản quỹ và Hạng mục P&L trên Đơn hàng | DA_CHOT | User feedback | Lấy mặc định từ DB theo `is_default === true` |
| Sửa chữa kết nối bảng Đối tác | DA_CHOT | User feedback | Phiếu sửa chữa lưu khóa ngoại `id_khach_hang` tới `kd_khach_hang` |
| Danh mục tài chính bỏ phân quyền xem/quản lý | DA_CHOT | User feedback | Giữ 2 cấp cha/con và cột Hạng mục P&L |
| Báo cáo tài chính đổi tên thành P&L | DA_CHOT | User feedback | Báo cáo so sánh cột theo tháng/quý/năm |

---

## 3. Danh Sách Câu Hỏi Mở (Open Questions)

### Chỉ hỏi khi chuẩn bị tích hợp thật:
- **Tác vụ Admin Auth**: Có cần service role key để quản trị tài khoản không? (Cung cấp qua env, không paste vào chat/docs).
- **Hàm index database**: Ý nghĩa chính xác là tạo SQL index, search function/RPC, hay convention nào khác? Có SQL mẫu không?
- **Quyền đặc thù**: Module nào có permission exception so với default `xem/them/sua/xoa/quan_tri`?
