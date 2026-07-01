# Agent Rules

**Luận điểm:** Một bộ harness canonical cho agent — cấu trúc phẳng theo vai trò, skill lazy-load, delta từng nền tảng, automation giữ runtime đồng bộ; không sửa tay output generated.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `guides/` | Tài liệu maintainer, bản đồ hệ thống |
| `rules/` | Context global luôn nạp (số = thứ tự ưu tiên) |
| `skills/` | Kỹ năng lazy (slug phẳng) |
| `integrations/` | Tool bắt buộc / khuyến nghị / tùy chọn |
| `projects/` | Gói dự án (`5fedu`) |
| `platforms/` | Overlay Codex, Grok, Antigravity, **Cursor** |
| `automation/` | Build, cài, validate, sync, doctor |
| `05-generated/` | Output build — không sửa tay |
| `plans/` | Plan, handoff, tombstone |

**Tích hợp**

| Tên | Chính sách |
|---|---|
| `codebase-memory-mcp` | bắt buộc |
| `context7` | khuyến nghị |
| `caveman` | tùy chọn |

## Chạy

```powershell
./automation/03-validate-context.ps1
./automation/01-build-runtime.ps1
./automation/04-verify-mirrors.ps1
./automation/02-install-runtime.ps1 -Platform all
./automation/09-doctor.ps1
```

Cài vào `~/.codex`, `~/.grok`, `~/.gemini/config`, `~/.cursor`. Định dạng MCP khác nhau từng nền — xem `platforms/*/runtime.yaml`.

## Đọc tiếp

1. [Bản đồ hệ thống](guides/00-system-map.md)
2. [Mô hình runtime](guides/01-runtime-model.md)
3. English overview: [README.md](README.md)
4. Dự án 5fedu: [projects/5fedu/AGENTS.md](projects/5fedu/AGENTS.md)

**Quy tắc:** Sửa canonical tại `rules/` và `skills/` — không sửa `05-generated/` hay mirror đã cài. Sync ngược qua `automation/07-import-reviewed-changes.ps1`.
