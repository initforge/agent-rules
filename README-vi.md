# Agent Rules

**Luận điểm:** Một bộ harness canonical cho agent — cấu trúc phẳng theo vai trò, skill lazy-load, delta từng nền tảng, automation giữ runtime đồng bộ; không sửa tay output generated.

## Cấu trúc

| Thư mục | Vai trò | Phân loại |
|---|---|---|
| `guides/` | Tài liệu maintainer, bản đồ hệ thống | ổn định (người viết) |
| `rules/` | Context global luôn nạp (số = thứ tự ưu tiên) | ổn định |
| `skills/` | Kỹ năng lazy (slug phẳng) | ổn định |
| `integrations/` | Tool bắt buộc / khuyến nghị / tùy chọn | ổn định |
| `projects/` | Gói dự án mẫu | ổn định |
| `profiles/` | Hồ sơ tổ chức tùy chọn (vd: `5fedu`) | ổn định |
| `platforms/` | Overlay Codex, Grok, Antigravity, Cursor | ổn định |
| `automation/` | Build, cài, validate, sync, doctor | ổn định |
| `05-generated/` | Output build — không sửa tay | generated (máy tạo) |
| `.agent/` | Trace log, research notes, tombstones (gitignored) | tạm thời |

**Tích hợp** — xem [bảng đầy đủ](05-generated/references/integration-registry.md) cho cả 5 mục (bắt buộc/khuyến nghị/tùy chọn) kèm profile, trust, capabilities. Nguồn chuẩn: `integrations/registry.json`. Phải chạy lại sau khi sửa registry:

```bash
python automation/generate-doc-references.py
```

## Chạy

```powershell
./automation/03-validate-context.ps1
```

Linux/macOS (cần [PowerShell Core](https://github.com/PowerShell/PowerShell)):

```bash
./automation/run.sh 03-validate-context
```

```powershell
./automation/01-build-runtime.ps1
./automation/04-verify-mirrors.ps1
./automation/02-install-runtime.ps1 -Platform all
./automation/09-doctor.ps1
```

Cài vào `~/.codex`, `~/.grok`, `~/.gemini/config` (Antigravity), `~/.cursor`. Định dạng MCP khác nhau từng nền — xem `platforms/*/runtime.yaml`.

**Lưu ý:** `~/.gemini/config` là đường dẫn cài đặt của Antigravity, không phải Gemini CLI. Trình CLI `gemini` là runtime host của Antigravity. Xem [ma trận năng lực nền tảng](guides/06-platform-capability.md) để biết mức hỗ trợ từng sản phẩm.

**Source parity ≠ behavioral parity:** Tất cả nền tảng được hỗ trợ đều có source file giống nhau. Đó là *source parity* (nguồn giống nhau). *Behavioral parity* (hành vi giống nhau) giữa các nền tảng chưa được chứng minh nếu chưa có xác nhận runtime riêng. Doctor báo cáo trung thực qua layered status (NATIVE_UNVERIFIED, NATIVE_OBSERVED, v.v.).

## Đọc tiếp

1. [Bản đồ hệ thống](guides/00-system-map.md)
2. [Mô hình runtime](guides/01-runtime-model.md)
3. [Ma trận năng lực nền tảng](guides/06-platform-capability.md)
4. English overview: [README.md](README.md)
5. Dự án 5fedu: [projects/5fedu/AGENTS.md](projects/5fedu/AGENTS.md) (bật profile trước)

**Quy tắc:** Sửa canonical tại `rules/` và `skills/` — không sửa `05-generated/` hay mirror đã cài. Sync ngược qua `automation/07-import-reviewed-changes.ps1`.
