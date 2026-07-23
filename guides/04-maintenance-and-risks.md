# Bảo trì và rủi ro

## Trước khi cài runtime

Chạy lần lượt:

1. `automation/03-validate-context.ps1`
2. `automation/01-build-runtime.ps1`
3. `automation/02-install-runtime.ps1`
4. `automation/09-doctor.ps1`

Canonical source là repo này. `05-generated/` và thư mục runtime toàn cục chỉ là đầu ra; không sửa tay rồi coi đó là nguồn chuẩn.

## Hook native

Codex, Grok, Antigravity và Cursor đều dùng hook đúng định dạng của nền tảng. Hook có ba nhiệm vụ nhỏ:

- đưa context đã route vào phiên làm việc;
- nhắc kiểm tra khi agent vừa sửa harness;
- ghi receipt (biên nhận) do host thực sự gọi.

Hook luôn fail-open (hook lỗi thì không khóa công việc). Stop chỉ quan sát và ghi receipt, không ép agent tiếp tục, không tự tạo plan và không tự phong PASS. Trạng thái dài/resume nằm trong `workctl`, còn quyết định vẫn thuộc agent chính.

`ADAPTER_PASS` chỉ chứng minh script chạy độc lập. `NATIVE_OBSERVED` cho biết adapter đã thấy một event khớp script hiện tại, nhưng local state không thể tự chứng minh event đó thật sự đến từ host. Vì vậy doctor không nâng observation này thành “native live”. Không được sửa receipt để làm doctor xanh.

## Cài trên từng máy

Linux và Windows là hai runtime riêng. Trên mỗi máy:

1. pull cùng commit;
2. build/install runtime;
3. chạy `automation/11-install-runtime-hooks.sh`;
4. reload hoặc mở session mới;
5. chạy doctor.

Không copy hook JSON giữa hai hệ điều hành vì đường dẫn Python và home khác nhau. Trên Windows ưu tiên Git Bash thật; không dựa vào WSL hỏng.

## Các rủi ro cần giữ

- Overlay chỉ chứa delta riêng nền tảng và phải nằm trong budget.
- Tool/integration phải có side effect (khả năng làm thay đổi dữ liệu), chi phí token, host native, fallback và proof status rõ ràng.
- Không preload skill, browser hay project context khi chưa có tín hiệu.
- Build không được dùng để chứng minh UI, API sống, dữ liệu, quyền, migration, concurrency hay performance.
- Reviewer độc lập là bắt buộc cho rủi ro đã khai báo; executor không được tự review.
- Artifact proof phải mới, có hash và khớp acceptance contract (hợp đồng nghiệm thu).
- Không commit/push/deploy nếu chưa có quyền rõ ràng.

Git pre-commit audit vẫn là backstop dùng chung mọi IDE/agent. Mặc định nó cảnh báo; `CONTEXT_AUDIT_STRICT=1` mới chặn commit.
