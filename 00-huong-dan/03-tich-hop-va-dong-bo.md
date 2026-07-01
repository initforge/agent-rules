# Tích Hợp Và Đồng Bộ

Integrations hiện được chia ba mức ngay trong `01-global/tich-hop/`:

- `bat-buoc`: phải cài và verify pass
- `khuyen-nghi`: auto-check, thiếu thì auto-install
- `tuy-chon`: không cài mặc định

Baseline hiện tại:

- `codebase-memory-mcp`: bắt buộc
- `context7`: khuyến nghị
- `caveman`: tùy chọn

Đồng bộ mặc định chỉ đi một chiều:

`canonical -> build -> runtime/project`

Reverse sync không được merge theo timestamp. Mọi import ngược phải đi qua reviewed import script với whitelist path và provenance rõ ràng.
