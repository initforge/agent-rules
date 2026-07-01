# Bảo Trì Và Rủi Ro

Trước khi cài global runtime, luôn chạy:

- kiểm tra context
- kiểm tra mirror
- kiểm tra runtime state nếu đang sửa integrations

Guardrails:

- overlay phải nhỏ và chỉ chứa delta riêng từng platform
- integrations phải có version/policy/verify rõ ràng
- generated output trong `05-ban-dung/` không được sửa tay
- evidence/legacy không được promote lên rule sống nếu chưa qua review
- không commit/push tự động
