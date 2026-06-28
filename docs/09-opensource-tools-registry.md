# Danh Mục Các Công Cụ Open-Source (Open-source Tools Registry)

Tài liệu này đóng vai trò là Sổ đăng ký tập trung (Centralized Registry) quy định các công cụ mã nguồn mở từ bên thứ ba (Third-party Open-source Tools) **bắt buộc hoặc khuyến nghị phải cài đặt** để hệ thống AI Agent hoạt động với hiệu suất tối ưu.

Việc gom nhóm các công cụ này vào một checklist chung giúp người dùng dễ dàng theo dõi, hiểu rõ ý đồ kiến trúc và tránh nhầm lẫn giữa các bộ công cụ đặc thù cho từng Harness (Antigravity, Grok, Codex).

---

## 1. Công cụ phân tích kiến trúc mã nguồn (Bắt buộc cho Antigravity & Grok)

Các AI Agent đời mới (như Antigravity/Opus, Grok) cần "nhìn" thấy bức tranh toàn cảnh của dự án thay vì chỉ đọc từng file đơn lẻ. Để khắc phục điểm mù (blind spots) trong các dự án lớn, hệ thống **bắt buộc** phải tích hợp ít nhất MỘT công cụ Code Intelligence (thông qua giao thức MCP).

> [!CAUTION]
> **Quy tắc xung đột**: Chỉ được phép chọn **MỘT** trong các công cụ Code Graph dưới đây để cài đặt vào cấu hình MCP. Cài nhiều công cụ cùng chức năng sẽ khiến AI bị rối loạn (Tool selection ambiguity) và làm ngốn RAM máy tính do hệ thống phải chạy đa tiến trình quét cùng một source code.

### 🏆 Đề xuất tốt nhất (Best Choice)
- [ ] **[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)**
  - **Ý đồ**: Là công cụ viết bằng Go/Rust, đóng gói dạng Single Binary. Phân tích cấu trúc mã nguồn siêu nhanh và tối ưu hóa lượng token tiêu thụ lên tới ~120x cho AI. Đây là lựa chọn **ngon nhất và được thiết lập mặc định** cho môi trường Antigravity.

### 🔄 Các giải pháp thay thế (Alternatives)
- [ ] **[GitNexus](https://github.com/abhigyanpatwari/GitNexus)**
  - **Ý đồ**: Công cụ phân tích mã nguồn sử dụng KuzuDB WASM, hỗ trợ giao diện Web UI trực quan. Thích hợp nếu bạn cần một sơ đồ đồ thị tương tác có thể xem bằng mắt thường.
- [ ] **[Codegraph](https://github.com/colbymchenry/codegraph)**
  - **Ý đồ**: Công cụ index tự động đồng bộ ngầm khi file thay đổi, tập trung vào khả năng "set and forget".

---

## 2. Công cụ vận hành mở rộng (Tùy chọn cho Antigravity & Grok)

Nên cài đặt thêm các MCP Server sau nếu ngữ cảnh dự án yêu cầu, vì chúng không trùng lặp chức năng với Code Graph:
- [ ] **[MCP Server GitHub](https://github.com/modelcontextprotocol/servers/tree/main/src/github)**
  - **Ý đồ**: Cho phép Agent tự động đọc Pull Requests, Issues, Commits từ GitHub thay vì chỉ đọc code local.
- [ ] **Playwright (Thông qua antigravity-overlay)**
  - **Ý đồ**: Trình duyệt giả lập để AI kiểm thử UI/UX và truy cập tài liệu trên web. 

---

## 3. Công cụ cắt giảm Token (Đặc thù của Codex CLI)

Không giống như Antigravity (vốn có context window lớn và công cụ quản lý log chạy nền gốc), **Codex CLI** rất dễ bị "tràn bộ nhớ" nếu dính các lệnh xuất ra hàng vạn dòng shell. Do đó, các công cụ dưới đây là bắt buộc cho Codex nhưng **KHÔNG CẦN THIẾT** cho Antigravity.

- [ ] **[RTK (Reduce Token-heavy)](https://github.com/rtk-ai/rtk)**
  - **Ý đồ**: Cắt gọt và tóm tắt rác console (ví dụ: `rtk npm test`) để Codex đọc được cốt lõi vấn đề mà không tiêu thụ lãng phí token.
- [ ] **[Caveman Compress](https://github.com/JuliusBrussee/caveman)**
  - **Ý đồ**: Nén các file bộ nhớ dài (như `CLAUDE.md`) thành định dạng "tiếng người tiền sử", giúp cắt giảm ~46% token context đầu vào mỗi phiên làm việc.

---

> [!IMPORTANT]
> **Checklist Review**: 
> - Nếu bạn đang cài đặt máy tính để chạy **Antigravity**, hãy đảm bảo bạn đã cài `codebase-memory-mcp` và KHÔNG cần bận tâm đến `RTK` hay `Caveman`.
> - Hãy kiểm tra file cấu hình (ví dụ: `claude_desktop_config.json` hoặc cấu hình nội bộ của Antigravity/Grok) để đảm bảo đường dẫn tới MCP Server được khai báo chính xác.
