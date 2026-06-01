# Bộ Nạp Runtime Chung

File này là điểm tương thích cho các project vẫn import:

```text
@P:\agent-rules\global-rules.md
```

Runtime Codex đang được bảo trì nằm tại:

```text
P:\agent-rules\codex
```

Đọc và tuân thủ các file sau:

```text
@P:\agent-rules\codex\rules\core.md
@P:\agent-rules\codex\rules\planning.md
@P:\agent-rules\codex\rules\execution.md
@P:\agent-rules\codex\rules\quality-gates.md
@P:\agent-rules\codex\rules\context-tools.md
@P:\agent-rules\codex\rules\tool-inventory.md
```

## Quy Tắc Ngôn Ngữ

- Trả lời bằng tiếng Việt có dấu đầy đủ theo mặc định.
- Không viết tiếng Việt không dấu, trừ khi người dùng yêu cầu rõ văn bản ASCII-only hoặc file đích đã có quy ước ASCII-only thật.
- Không dùng tiếng Anh nếu có cách nói tiếng Việt tự nhiên.
- Giữ tiếng Anh cho thuật ngữ kỹ thuật, tên model, lệnh, đường dẫn, API, package, schema key, tên tool, tên sản phẩm và mã nguồn.

## Quy Tắc Giao Diện (UI) & An Toàn Biên Dịch (Build Safety)

### 1. Quy Tắc Vận Hành Hệ Thống (Áp Dụng Cho Mọi Dự Án)

- **Ngăn ngừa rò rỉ Credential**: Không bao giờ được hardcode tài khoản, mật khẩu test hoặc API tokens vào mã nguồn giao diện. Nếu cần ghi nhớ để tiện test, hãy dùng `localStorage` động hoặc đọc qua biến môi trường.
- **Ẩn thông tin kỹ thuật thô**: Không hiển thị các tên bảng cơ sở dữ liệu thô (ví dụ: `vt_tai_xe`), ID thô hoặc các ký hiệu kỹ thuật trên tiêu đề, nhãn, Drawer của người dùng cuối. Hãy sử dụng ngôn ngữ tự nhiên đã bản địa hóa.
- **Đồng bộ Icon và Nhãn nút**: Đảm bảo các nút có cùng tính năng trên toàn hệ thống phải dùng đồng bộ một loại Icon (ví dụ: dùng thống nhất `Edit` thay vì trộn lẫn với `Pencil`, dùng thống nhất `Download` cho xuất báo cáo).
- **Kiểm thử biên dịch bắt buộc (Pre-flight Build Check)**: Trước khi commit bất kỳ thay đổi nào liên quan đến các file cấu hình dùng chung (như `vite.config.ts`, `tsconfig.json`, `package.json`), bắt buộc phải chạy thử lệnh build biên dịch (`npm run build` hoặc lệnh tương đương) tại local để đảm bảo không bị lỗi cú pháp làm hỏng pipeline CI/CD (như Vercel/GitHub Actions).

### 2. Quy Tắc Khái Quát Hóa Từ Bài Học 5fedu (Khuyến Nghị Áp Dụng Rộng Rãi)

- **Đồng bộ nhãn nút qua Helper (Button Labels Helper)**: Các nhãn nút bấm hành động chuẩn (như Đóng, Hủy, Lưu, Sửa, Xóa) nên sử dụng qua các helper/function định nghĩa sẵn (ví dụ: `BTN_CLOSE()`, `BTN_EDIT()`, `BTN_DELETE()`) để duy trì tính nhất quán ngôn ngữ và dịch thuật hệ thống.
- **Xử lý lỗi đồng bộ Auth mềm dẻo (Auth Sync Graceful Degradation)**: Khi thực hiện đồng bộ Auth giữa database và các dịch vụ bên thứ ba/auth provider (như Supabase Auth), mọi lỗi do thiếu cấu hình môi trường hoặc do mạng phải được bắt lỗi (catch) một cách mềm dẻo ở các tác vụ nhạy cảm như xóa (delete) để không ngăn cản/gây lỗi cho nghiệp vụ chính của người dùng ở database.
- **Suy luận giao diện theo Template & Hỏi phản hồi (Quy tắc vàng)**: Khi thực hiện chỉnh sửa/sửa lỗi frontend, bắt buộc phải suy luận chặt chẽ và đối chiếu trực tiếp với mã nguồn template gốc được chỉ định của dự án (ví dụ: thư mục `/template` hoặc template được chỉ định). Nếu nhận được phản hồi (feedback) từ người dùng, tuyệt đối cấm tự ý sửa đổi lung tung hay thay đổi sai lệch so với template chỉ để cố hoàn thành task cho xong. Trong trường hợp giao diện đã hoàn toàn chuẩn theo template mà người dùng vẫn phản hồi chưa đạt, phải dừng lại hỏi ngược người dùng ngay lập tức kèm theo phân tích/suy luận rõ vị trí đang nói tới là ở đâu.
- **Xác thực bắt buộc trên Production**: Mọi tính năng, sửa đổi UI hoặc sửa lỗi phải được verify trực tiếp trên môi trường production/live thực tế của dự án, không được chỉ kiểm tra ở môi trường local (vì môi trường local có thể tự sửa lỗi hoặc bỏ qua lỗi build/runtime như thiếu import hook React, gây sập trang khi lên live).
- **Quy chuẩn Định dạng Excel khi Xuất (Excel Export Format & Style)**: Mọi thao tác xuất dữ liệu ra file Excel (.xlsx) phải sử dụng thư viện thích hợp (như `xlsx-js-style`) để định dạng giao diện chuyên nghiệp:
  - Header của file Excel phải có font chữ, in đậm, màu chữ trắng (`#FFFFFF`) và nền ô là màu thương hiệu đậm (ví dụ: màu Navy `#1E3A8A`). Các ô header phải có viền mỏng và căn giữa.
  - Các cột số liệu (tiền lương, chi phí, doanh thu, số lượng...) bắt buộc phải được xuất dưới dạng **Number thực tế (cell type 'n')**, không được xuất dưới dạng String/Text (cell type 's') để tránh lỗi cảnh báo của Excel (green triangle) và cho phép người dùng sử dụng các hàm tính toán (SUM, AVERAGE, v.v.). Đồng thời, định dạng hiển thị số phải áp dụng `numFmt: "#,##0"`.
  - Các ô dữ liệu thông thường phải được căn chỉnh (align) hợp lý: cột số căn lề phải (right), cột ngày tháng/trạng thái/biển số căn giữa (center), các cột chữ khác căn lề trái (left). Các dòng xen kẽ có thể tô màu nền xám rất nhẹ (`#F8FAFC` và `#FFFFFF`) để tăng độ tương phản.




