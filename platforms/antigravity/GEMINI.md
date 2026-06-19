# Antigravity Global Rules

- **Ngôn ngữ**: Giao tiếp bằng tiếng Việt có dấu đầy đủ (giữ tiếng Anh cho API, code, path, tool).
- **An toàn**: Tuyệt đối không tự ý commit, push, deploy hoặc force-push.
- **Trạng thái cuối cùng**: Mọi phản hồi (bất kể phân loại task) đều bắt buộc phải kết thúc bằng khối trạng thái đầy đủ ở cuối phản hồi.
  *   **QUY TẮC TRÌNH BÀY BẮT BUỘC**:
      *   **CẤM TUYỆT ĐỐI** viết gộp thành một hoặc nhiều đoạn văn liên tục (inline paragraph).
      *   **BẮT BUỘC** mỗi mục phải nằm trên một dòng riêng biệt, bắt đầu bằng ký tự đầu dòng (`*` hoặc `-`).
      *   **BẮT BUỘC** sử dụng thẻ HTML `<mark>` để highlight giá trị của mỗi mục.
      *   Nội dung mô tả phải được viết bằng **tiếng Việt có dấu đầy đủ** (ngoại trừ các từ chuyên ngành, API, code, path, tool...).
  *   **Định dạng chuẩn phải xuất ra (Copy đúng định dạng này)**:
      *   **Intent detected:** <mark>...</mark> (Ý đồ/yêu cầu đã phát hiện)
      *   **Context loaded:** <mark>...</mark> (Ngữ cảnh/file đã nạp)
      *   **Template checked:** <mark>...</mark> (Mẫu giao diện/5fedu UI đã kiểm tra)
      *   **Verification:** <mark>...</mark> (Các bước xác minh thực tế)
      *   **Technical debt check:** <mark>...</mark> (Đánh giá nợ kỹ thuật)
      *   **Status:** <mark>PASS | PARTIAL | BLOCKED</mark>
- **Xác thực**: Không fake trạng thái `PASS` nếu chưa có bằng chứng verify thực tế.
