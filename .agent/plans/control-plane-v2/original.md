# Control Plane V2 — ý định gốc của chủ sở hữu

schema: artifact/control-plane-v2-intent
version: 2
plan_id: control-plane-v2
work_id: control-plane-v2
status: CANDIDATE

## Ý định gốc

Đập đi xây lại toàn bộ Control Plane. Giao diện hiện tại rời rạc, có nhiều
phần mang tính thời vụ, không ổn định và không phù hợp để dùng lâu dài. Thiết
kế phải bắt đầu trong Pencil bằng MCP thật, được chủ sở hữu xem trực tiếp rồi
mới được viết web. Sản phẩm phải hoàn toàn bằng tiếng Việt, nhẹ, sáng, trực
quan, có trang trí tinh tế theo tinh thần Apple, và giải quyết đúng từng case
vận hành thay vì là dashboard thẻ số liệu chung chung.

## Quyết định đã chốt

- Lấy workspace theo case làm màn hình chính: theo dõi công việc, xử lý chặn
  hoặc lỗi, chuẩn bị hành động có kiểm soát và xem lịch sử/bằng chứng.
- Ưu tiên đọc; mọi thay đổi phải đi qua authority, kiểm tra trước khi áp dụng,
  audit và rollback.
- Dùng React, TypeScript và Vite hiện có nếu chúng đáp ứng; không thay framework
  chỉ để làm mới giao diện.
- Chạy preview Docker cục bộ, cách ly, đọc repository mặc định và chỉ ghi store
  riêng.
- Thiết kế ở Pencil là cổng bắt buộc. Chưa có thao tác MCP, render, hiển thị
  foreground và phê duyệt của chủ sở hữu thì chưa được viết code, Docker hoặc
  test implementation.
- Chẩn đoán kỹ thuật nội bộ không phải tính năng sản phẩm: không đưa chúng vào
  navigation, URL mới, workspace, bản thiết kế `.pen`, copy hay acceptance UI.

## Ràng buộc không thương lượng

- Không làm suy yếu `.agent/current.json`, plan ledger, Evidence Ledger,
  PASS/BLOCKED semantics hoặc generation-CAS.
- Control Plane không được tự dựng authority từ label, selection, session hay
  telemetry.
- Không xóa legacy đã có bằng chứng trước khi replacement có parity evidence
  và lifecycle tombstone.
- `.pen` phải được tạo hoặc sửa qua MCP gắn với Pencil editor đang mở ở
  foreground; cấm tạo JSON/text `.pen` bằng shell, script hoặc editor khác.
- Nếu Pencil desktop, MCP hoặc render không dùng được, trả `BLOCKED` đúng lý do
  và dừng phase; không tạo thiết kế giả, mock thay thế hay tiếp tục code.
- Không sửa `generated/`, runtime mirror, kernel/engine semantics hoặc lịch sử
  `.agent` trong phase thiết kế.
- Không commit, push hay deploy nếu không có quyền riêng.

## Ngoài phạm vi

- Viết lại kernel, engine, CLI runner hoặc trust/evidence semantics.
- Biến Control Plane thành JSON editor tự do.
- Đóng gói hoặc chạy Pencil trong Docker.
- Thiết kế lại hay làm mới các màn hình/API chẩn đoán nội bộ.
