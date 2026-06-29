# 00-index.md

## Bản đồ Chỉ mục Định tuyến Tri thức của Agent (Knowledge Routing Index)

Tệp tin này hoạt động như một bản đồ định hướng chính thức. Tất cả các Agent trước khi cập nhật bất kỳ bài học, tri thức, quy tắc hay context mới nào từ feedback của người dùng **bắt buộc** phải tra cứu bản đồ này để ghi nhận đúng tệp tin quy tắc chuyên biệt của harness, nghiêm cấm việc điền bừa bãi.

---

### Bản đồ Định tuyến Quy tắc (Knowledge Routing Map)

| **Giao diện & UI/UX** | [.agents/rules/08-ui-consistency-gate.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/rules/08-ui-consistency-gate.md) | Spacing, Font chữ, Layout, ColumnManager, Lọc chip, Markdown Parser, Đồng bộ cấu trúc bảng phân cấp (Hierarchical Table), tab-routing parity. |
| **Chất lượng code & Lỗi DB** | [.agents/rules/02-code-quality-and-debt.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/rules/02-code-quality-and-debt.md) | Bẫy lỗi khóa ngoại Postgres thô, try-catch Edge function, clean code, chống lỗi hồi quy, nợ kỹ thuật (Technical Debt). |
| **Quy trình SOP & Giao tiếp** | [.agents/rules/01-agent-workflow-sop.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/rules/01-agent-workflow-sop.md) | Kỷ luật giao tiếp, checkoff prompt dài chống sót mệnh đề, báo cáo phân mục đánh số, cập nhật plan real-time, chống xoá đè mất context plan cũ, quy chuẩn tiến hóa context. |
| **Kỹ năng & Tích hợp 5fedu** | [.agents/rules/04-skills-and-5fedu.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/rules/04-skills-and-5fedu.md) | Kích hoạt skill 5fedu-project, rules local 5fedu. |
| **Ý đồ & Runtime chung** | [.agents/rules/00-runtime-and-intent.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/rules/00-runtime-and-intent.md) | Định tuyến ý đồ người dùng, trạng thái kết thúc (Final Status PASS/PARTIAL/BLOCKED). |
| **Quyền truy cập & Bảo mật** | [.agents/rules/platform-boundary.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/rules/platform-boundary.md) | RLS, Supabase service role, bảo mật API credentials. |
| **Đặc tả nghiệp vụ 5fedu cục bộ** | [.agents/5fedu/03-ui-ux-and-delivery-standards.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/5fedu/03-ui-ux-and-delivery-standards.md) | Specs chi tiết của từng module, logic hoàn kho, auto-fill, cấu trúc tab/cột cụ thể của dự án. |
| **Nhật ký Feedback / Bài học** | [.agents/5fedu/10-owner-feedback-lessons.md](file:///home/linhnxdeveloper/Projects/nostime/.agents/5fedu/10-owner-feedback-lessons.md) | Lưu trữ nhật ký feedback thô, lỗi lặp lại, bài học rút ra qua từng session để truy vết. |


---

### Quy trình cập nhật Tri thức mới (Knowledge Update Workflow)

1.  **Phân loại tri thức**: Phân tích xem bài học/yêu cầu mới của người dùng thuộc phân vùng nào (UI, Database, Workflow...).
2.  **Định vị File**: Tra cứu bảng trên để tìm đường dẫn file quy tắc lives tương ứng.
3.  **Cập nhật chính xác**: Sử dụng công cụ chỉnh sửa để thêm quy tắc vào đúng file đích. Giữ nguyên 100% các luật cũ trong file, không ghi đè cẩu thả.
4.  **Cập nhật Plan**: Cập nhật thay đổi này vào phần Nợ kỹ thuật / Nhật ký thay đổi của [implementation_plan.md](file:///home/linhnxdeveloper/.gemini/antigravity/brain/6895aae9-21c9-43a8-b4db-71cab295d352/implementation_plan.md).
