---
description: "Định tuyến ý đồ (Intent Router) và quy tắc kích hoạt chung cho Agent"
---

# 00-runtime-and-intent

Bộ quy tắc cốt lõi điều phối runtime và phân tích ý đồ (Intent Routing) của người dùng. Áp dụng cho cả Grok, Codex và Antigravity.

## Hợp đồng Ý đồ (Intent Contract)

### Mục tiêu
- Thực hiện chính xác ý đồ của người dùng (Intent Audit), xác thực tương xứng với mức độ rủi ro (Risk Profile).
- Ưu tiên kích hoạt các Kỹ năng chuyên biệt (Skills) khi yêu cầu khớp với Trigger.
- Mặc định độ ưu tiên công việc ở mức **MEDIUM**. Luôn tìm hiểu cấu trúc tổng quát (Index/Mapping) trước khi can thiệp sâu vào code.

### Quy tắc kích hoạt Kỹ năng (Skill Activation)

| Tình huống (Scenario) | Hành động bắt buộc (Required Action) |
|---|---|
| Thiết lập/khởi tạo 5fedu | Sử dụng Skill [5fedu-project](file:///home/linhnxdeveloper/Projects/agent-rules/skills/5fedu-project/SKILL.md) |
| Nghiên cứu/đọc tài liệu mới | Sử dụng Skill [codex-research](file:///home/linhnxdeveloper/Projects/agent-rules/skills/codex-research/SKILL.md) |
| Đánh giá/Kiểm tra mã nguồn (Review/Audit) | Đưa ra các phát hiện lỗi trước (Findings First) |
| Thao tác Database/Auth/Permissions | HIGH Risk — Phải lập kế hoạch rõ ràng, cấm tự vẽ Schema |

### Hành vi bị cấm
- Không tự ý thực hiện các lệnh `git commit`, `git push`, hoặc tự động Deploy trừ khi được yêu cầu trực tiếp trong phiên làm việc.
- Không sửa lan man ngoài phạm vi công việc được giao (Scope Lock).

### Trạng thái kết thúc (Final Status)
Mọi phản hồi kết thúc turn bắt buộc phải trả về trạng thái rõ ràng ở cuối:
`PASS` | `PARTIAL` | `BLOCKED`

## Bộ định tuyến ý đồ (Prompt Intent Router)

| Tín hiệu yêu cầu (Signal) | Cổng kiểm soát (Gate) |
|---|---|
| `5fedu` hoặc thư mục `.agents/5fedu/` / `.codex/5fedu/` | Skill `5fedu-project` + `00-index.md` |
| Yêu cầu UI, Giao diện, CSS (trong dự án 5fedu) | Kiểm tra mẫu giao diện `/template` trước |
| Liên quan đến Permission, Auth, RLS, phân quyền | Cổng kiểm soát phân quyền (Permission Gate) |
| Liên quan đến Database, Schema, Supabase, Migration | DB Gate + tìm nguyên nhân gốc rễ (Root Cause) |
| Kiểm thử trên môi trường chạy thử (Verify Production) | Quy trình xác thực thông minh (Smart Verification) |
| Kiểm tra, Đánh giá mã nguồn (Audit, Review) | Findings First + Phân loại nợ kỹ thuật (Technical Debt) |

## Hợp đồng thực thi nghiêm ngặt (Hard Activation Contract)
1. **Mã nguồn thực tế (Code thật):** Cấm sử dụng mã nguồn giả lập, placeholder, hoặc fake CRUD.
2. **Không báo cáo kết quả giả (No Fake PASS):** Luôn chạy kiểm thử thực tế và cung cấp bằng chứng (Raw Output, logs, screenshot) trước khi báo `PASS`.
3. **Trung thực về thông tin:** Phân biệt rõ ràng giữa Fact (sự thật trên đĩa), Inference (suy luận logic) và Unknown (chưa rõ).

## 5fedu Hard Mode
Khi phát hiện ngữ cảnh dự án 5fedu: Luôn tuân thủ quy trình: Mapping (Ánh xạ) → `/template` (Mẫu giao diện) → Code thực tế → Verify (Xác thực). Khi gặp lỗi "Chưa chuẩn", phải audit tìm khoảng trống (Gap Analysis) chứ không vá lỗi bề mặt.

## Kiểm soát nợ kỹ thuật (Technical Debt Gate)
Với các task vừa và lớn: Phân loại nợ kỹ thuật trước khi thực hiện; ưu tiên xử lý các nợ nghiêm trọng trong phạm vi sửa đổi trước khi báo `PASS`.