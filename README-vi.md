# Agent Rules — Context đa nền tảng có một nguồn chuẩn

Repo giữ một nguồn dễ đọc để build cùng Knowledge Core và capability catalog cho Codex, Grok và Antigravity. Thư mục nền tảng chỉ chứa phần khác biệt; thư mục dự án chỉ chứa context/pointer riêng của dự án.

## Các phân hệ

| Phân hệ | Quyền sở hữu |
|---|---|
| `knowledge/core` | Hợp đồng global, platform-neutral, luôn nạp |
| `knowledge/capabilities` | Quy trình lazy-load, gom theo nghiệp vụ |
| `knowledge/project-context` | Schema và template context dự án |
| `integrations` | Tool ngoài được pin như Codebase Memory MCP và Caveman |
| `platforms` | Overlay và delta runtime riêng từng nền tảng |
| `automation` | Build, cài runtime và kiểm tra mirror |

## Build và kiểm tra

```powershell
& .\automation\validate-context.ps1
& .\automation\verify-mirrors.ps1
& .\automation\install-runtime.ps1 -Platform all
```

Đọc [mô hình runtime](docs/01-runtime-model.md) và [hệ tri thức](docs/02-knowledge-system.md).
