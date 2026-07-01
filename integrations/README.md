# Integrations

Thư mục này nói rõ ý đồ cài sẵn của repo, không bắt người đọc phải lục manifest mới hiểu.

## Policy

- `required/`: dependency nền, phải cài và verify pass.
- `recommended/`: dependency hữu ích, auto-check và auto-install khi thiếu.
- `optional/`: giữ wrapper và ownership, không auto-cài.

## Baseline hiện tại

- `required/codebase-memory-mcp`
- `recommended/context7`
- `optional/caveman`

Registry machine-readable nằm ở `registry.json`.


