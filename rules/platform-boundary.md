---
alwaysApply: true
description: "Ranh giới 3 nền chính — Grok không sửa chéo"
---

# Platform Boundary

Repo `agent-rules` phục vụ **Codex, Antigravity, Grok CLI**. Lõi rule dùng chung (Opus-emulation); overlay riêng từng nền.

## Ba nền (harness đồng bộ)

| Nền | Master | Live | Cơ chế nạp |
|---|---|---|---|
| **Grok CLI** | `rules/` + `skills/` | `.grok/` + `~/.grok/` | scan `.grok/rules/*.md` |
| **Codex** | `rules/` + `skills/` + `platforms/codex/` | `~/.codex/` | `@import` AGENTS.md |
| **Antigravity** | `rules/` + `skills/` + `platforms/antigravity/` | `.agents/rules/` + `~/.gemini/GEMINI.md` | `alwaysApply` |

**Không có Cursor.** `.cursor/` không phải runtime — bỏ qua nếu thấy.

## Cấu trúc

```text
agent-rules/
├── rules/             ← Rules dùng chung (Tiếng Việt)
├── skills/            ← Active skills dùng chung
├── workflows/         ← Workflows dùng chung
├── platforms/         ← Platform adapters
│   ├── codex/         ← Cấu hình Codex
│   ├── grok/          ← Cấu hình Grok
│   └── antigravity/   ← Cấu hình Antigravity
├── .agents/           ← Antigravity live cục bộ cho repo này
└── shared/            ← opus-emulation-contract
```

## Sync một lệnh

```bash
./scripts/sync-all-harness.sh
```

## Không được (mặc định cho mọi nền)

1. Sửa platform mirror/runtime trực tiếp khi thay đổi thuộc lõi dùng chung — sửa ở `rules/`, `skills/`, `workflows/`, `shared/` rồi sync.
2. Copy ceremony riêng của một nền sang nền khác nếu đó không phải chuẩn outcome chung.
3. Tự commit/push harness khi người dùng chưa yêu cầu.

## Khi core safety đổi

1. Sửa `rules/` hoặc `shared/opus-emulation-contract.md`.
2. `./scripts/sync-all-harness.sh`.
3. User sync `~/.codex` / deploy adapter theo quy trình riêng.

## Antigravity IDE (Overlay rules)

1. Cấm tự ý gọi lệnh hoặc tham chiếu đến CLI `grok mcp`, `grok list` khi đang chạy trên Antigravity IDE. Cấu hình MCP của Antigravity phải được chỉnh sửa trực tiếp trong `~/.gemini/config/mcp_config.json`.
2. **Cấm ngụy biện (Anti-Rationalization):** Khi bị người dùng chỉ ra lỗi nhầm lẫn cấu hình hoặc đường dẫn (ví dụ: cấu hình nhầm sang `~/.grok/`), cấm tuyệt đối việc giải thích vòng vo, tìm cách hợp lý hóa lỗi sai hoặc ngụy biện. Phải thừa nhận lỗi ngay lập tức, sử dụng các công cụ tìm kiếm thực tế để định vị lại môi trường/đường dẫn chính xác và sửa đổi đúng mục tiêu.

## Quy tắc quản lý thư mục cấu hình cục bộ (.agents / .agent)

1. **Ranh giới nội dung**: Thư mục `.agents` (hoặc `.agent`) của các dự án đặc thù chỉ được phép chứa các tệp cấu hình nghiệp vụ/kỹ thuật chuyên biệt của riêng dự án đó (ví dụ: rules đặc thù 5fedu, QA workflows, database schema rules...). Cấm tuyệt đối chứa hoặc sao chép các tệp global rules dùng chung (ví dụ: các file `00-*`, `platform-boundary.md`...) hoặc nguyên tắc hệ thống chung vào đây.
2. **Xử lý bất thường (Harness Audit)**:
   - Nếu phát hiện thư mục `.agents` (hoặc `.agent`) xuất hiện ở một dự án thông thường (không phải dự án phát triển `agent-rules` hoặc không có quy chuẩn nghiệp vụ đặc biệt khắt khe như **5fedu**), hoặc:
   - Thư mục `.agents` của dự án đặc thù bị lẫn lộn các quy tắc global rules của hệ thống,
   -> Đây là dấu hiệu bộ harness đang hoạt động sai (hoặc có lỗi đồng bộ). Agent bắt buộc phải **xóa bỏ thư mục cấu hình cục bộ này ngay lập tức** trên cả máy cục bộ (local) và kho lưu trữ Git từ xa (remote).
