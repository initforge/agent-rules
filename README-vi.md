# agent-rules

**agent-rules** là một framework mã nguồn mở để quản lý ngữ cảnh đa nền tảng cho các trợ lý AI coding. Framework này cung cấp CLI, lược đồ canonical, hợp đồng nền tảng, và quy trình CI/CD để xây dựng, xác thực, và triển khai các tác nhân AI một cách nhất quán.

## Tính năng chính

- **CLI đa nền tảng** — 10 lệnh (build, validate, verify-mirrors, install, doctor, v.v.)
- **Lược đồ canonical** — 9 lược đồ JSON với TypeScript types, fixture âm/dương
- **Hợp đồng nền tảng** — 5 platform adapter mô tả trong `platform-contracts.json`
- **CI/CD** — `static.yml` là required gate, tích hợp `npm run verify:all`

## Bắt đầu nhanh

```bash
git clone https://github.com/initforge/agent-rules
cd agent-rules/packages/cli && npm ci && npm run build
npm run test
npm run verify:all
```

## Repository map

| Đường dẫn | Mục đích |
|-----------|----------|
| `packages/cli/` | Cross-platform CLI (TypeScript) |
| `packages/control-plane/` | Local dashboard + API |
| `schemas/` | Canonical artifact schemas |
| `docs/` | Architecture, guides, decisions |
| `rules/` | Always-loaded global context |
| `skills/` | Lazy-loaded capability workflows |
| `profiles/` | Optional org overlays |

## Giấy phép

MIT
