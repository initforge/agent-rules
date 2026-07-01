# Agent Rules — nhìn cây thư mục là hiểu

Repo này được tái cấu trúc để người mới mở ra là biết ngay đâu là global context, đâu là skills, đâu là context dự án, đâu là integrations cài sẵn, đâu là delta riêng từng nền tảng, và đâu là generated output không được sửa tay.

## Bản đồ tầng trên cùng

| Thư mục | Vai trò |
|---|---|
| `00-huong-dan` | Tài liệu dẫn đường và sơ đồ hệ thống |
| `01-global/loi` | Global context luôn nạp |
| `01-global/ky-nang` | Kỹ năng nạp lười theo trigger |
| `01-global/tich-hop` | Integrations bắt buộc, khuyến nghị, tùy chọn |
| `02-du-an` | Context dự án và bộ 5fedu |
| `03-nen-tang` | Delta riêng cho Codex, Grok, Antigravity |
| `04-tu-dong-hoa` | Script build, cài, kiểm tra, export, sync guard |
| `05-ban-dung` | Build preview/generated runtime |
| `06-ke-hoach` | Research và lịch sử migration |

## Integrations nền

| Integration | Policy | Ý nghĩa |
|---|---|---|
| `codebase-memory-mcp` | bắt buộc | Lớp code intelligence mặc định |
| `context7` | khuyến nghị | Docs mới nhất cho library/framework |
| `caveman` | tùy chọn | Workflow nén, không auto-cài mặc định |

## Build và kiểm tra

```powershell
& .\04-tu-dong-hoa\03-kiem-tra-context.ps1
& .\04-tu-dong-hoa\04-kiem-tra-mirror.ps1
& .\04-tu-dong-hoa\02-cai-runtime.ps1 -Platform all
```

Đọc [Bản đồ hệ thống](00-huong-dan/00-ban-do-he-thong.md) và [Mô hình runtime](00-huong-dan/01-mo-hinh-runtime.md) trước khi sửa harness.
