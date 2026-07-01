# Agent Rules — nhìn cây thư mục là hiểu

Repo này được tái cấu trúc để người mới mở ra là biết ngay đâu là global context, đâu là skills, đâu là context dự án, đâu là integrations cài sẵn, đâu là delta riêng từng nền tảng, và đâu là generated output không được sửa tay.

## Bản đồ tầng trên cùng

| Thư mục | Vai trò |
|---|---|
| `00-guides` | Tài liệu dẫn đường và sơ đồ hệ thống |
| `01-global/rules` | Global context luôn nạp |
| `01-global/skills` | Kỹ năng nạp lười theo trigger |
| `01-global/integrations` | Integrations bắt buộc, khuyến nghị, tùy chọn |
| `02-projects` | Context dự án và bộ 5fedu |
| `03-platforms` | Delta riêng cho Codex, Grok, Antigravity |
| `04-automation` | Script build, cài, kiểm tra, export, sync guard |
| `05-generated` | Build preview/generated runtime |
| `06-plans` | Research và lịch sử migration |

## Integrations nền

| Integration | Policy | Ý nghĩa |
|---|---|---|
| `codebase-memory-mcp` | bắt buộc | Lớp code intelligence mặc định |
| `context7` | khuyến nghị | Docs mới nhất cho library/framework |
| `caveman` | tùy chọn | Workflow nén, không auto-cài mặc định |

## Build và kiểm tra

```powershell
& .\04-automation\03-validate-context.ps1
& .\04-automation\04-verify-mirrors.ps1
& .\04-automation\02-install-runtime.ps1 -Platform all
```

�?c [B?n d? h? th?ng](00-guides/00-system-map.md) v� [M� h�nh runtime](00-guides/01-runtime-model.md) tru?c khi s?a harness.


