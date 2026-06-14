---
alwaysApply: true
priority: critical
---

# Deep Reasoning and Brainstorming Discipline

## Kích Hoạt
Áp dụng cho mọi tác vụ lập trình phức tạp, refactor quy mô lớn, thiết kế hệ thống, debug lỗi logic nghiêm trọng hoặc phân tích kiến trúc.

## 1. Cấm Tuyệt Đối Quét Bề Mặt (Anti-Surface Scanning Ban)
Khi tiếp nhận một vấn đề hoặc sửa đổi mã nguồn, Agent không được đưa ra giải pháp hời hợt hay chỉ tập trung vào file lỗi hiện tại. Phải thực hiện các bước sau:
- **Truy vết Call Graph**: Tìm kiếm tất cả các file chứa định nghĩa (definitions) và tất cả các nơi gọi đến (call-sites) của hàm/biến/class liên quan bằng `grep_search`.
- **Vẽ bản đồ luồng dữ liệu (Data Flow Map)**: Xác định rõ dữ liệu đầu vào (input), đầu ra (output), các trạm trung chuyển dữ liệu và các cấu trúc dữ liệu bị tác động.
- **Xác định Dependency Graph**: Đánh giá tầm ảnh hưởng của thay đổi đối với các module downstream và các file liên quan.

## 2. Brainstorming & Phân Tích Phương Án (Systematic Brainstorming)
Trước khi quyết định viết code hay thực hiện thay đổi, Agent **phải đưa ra ít nhất 2 phương án thiết kế/triển khai khác nhau** và so sánh chúng:
- **Phương án A (Ví dụ: Sửa nhanh/Trực tiếp)**:
  - Ưu điểm: (Tốc độ, độ phức tạp thấp, cô lập rủi ro...)
  - Nhược điểm: (Nợ kỹ thuật, khả năng tái sử dụng kém, khó mở rộng...)
- **Phương án B (Ví dụ: Refactor/Đúng chuẩn kiến trúc)**:
  - Ưu điểm: (Dễ bảo trì, mở rộng, sạch sẽ...)
  - Nhược điểm: (Tốn thời gian, rủi ro hồi quy cao...)
- **Quyết định**: Đưa ra lập luận chặt chẽ tại sao lại chọn phương án cuối cùng.

## 3. Kỷ Luật Tự Phản Biện (Self-Criticism & Critical Review)
Agent phải tự đặt ra và giải quyết các câu hỏi nghi vấn đối với giải pháp của mình:
- *"Nếu giải pháp này được áp dụng, điều tồi tệ nhất có thể xảy ra ở các module khác là gì?"*
- *"Giải pháp này có tạo ra lỗ hổng bảo mật hay nút thắt hiệu năng (Performance Bottleneck) nào không?"*
- *"Có phá vỡ hoặc xung đột với bất kỳ quy ước, template hoặc tri thức hiện có nào của dự án (ví dụ: quy ước 5fedu) không?"*
- *"Có phương án nào đơn giản hơn mà không cần viết thêm nhiều dòng code không?"*

## 4. Cơ Chế Suy Luận Thực Thi (Reasoning Budget Enforcement)
- Đối với các mô hình có độ sâu lập luận yếu hơn (như Gemini), việc viết mã giả (pseudocode), sơ đồ logic (Mermaid) và mô tả từng bước tư duy trong block `<thought>` là bắt buộc.
- Không được nhảy thẳng vào viết code hoặc đề xuất code khi chưa hoàn thành bước phân tích lập luận này.
