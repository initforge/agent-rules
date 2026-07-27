# Agent Rules

**Luận đề:** Một harness canonical duy nhất cho AI agents — tổ chức thư mục phẳng theo vai trò, lazy skills, platform delta, và automation đồng bộ runtime mirror không cần sửa generated output bằng tay.

## Cấu trúc

| Thư mục | Vai trò | Phân loại |
|---------|---------|-----------|
| `docs/guides/` | Tài liệu maintainer và system map | stable (human-maintained) |
| `rules/` | Always-loaded global context (đánh số = thứ tự nạp) | stable |
| `skills/` | Lazy-loaded capabilities (flat slugs) | stable |
| `integrations/` | Required / optional tools | stable |
| `profiles/5fedu/projects/` | Project context templates | stable |
| `profiles/` | Optional organization profiles (e.g., `5fedu`) | stable |
| `platforms/` | Per-runtime overlays (Codex, Grok, Antigravity, Cursor, OpenCode) | stable |
| `automation/` | Build, install, validate, sync, doctor | stable |
| `generated/` | Build output — không sửa tay | generated (machine-only) |
| `.agent/` | Advisory trace log, research notes, tombstones (gitignored) | ephemeral |

**Integrations** — canonical registry tại `integrations/registry.json`. Bao gồm các integration required (codebase-memory-mcp, playwright-mcp, chrome-devtools-mcp) và optional (caveman).

## Chạy nhanh

```bash
cd packages/cli && npm ci && npm run build
npm run test
```

Linux/macOS:

```bash
./automation/run.sh 03-validate-context
```

```bash
./automation/01-build-runtime.ps1
./automation/04-verify-mirrors.ps1
./automation/02-install-runtime.ps1 -Platform all
./automation/09-doctor.ps1
```

Các thư mục cài đặt: `~/.codex`, `~/.grok`, `~/.gemini/config` (Antigravity), `~/.cursor`, và OpenCode schema native. Định dạng MCP khác nhau giữa các platform — xem `platforms/platform-contracts.json`.

**Grok rules path:** install ghi lean always-on vào `~/.grok/rules` (manifest) và `~/.grok/.grok/rules` (native inject). Khởi động lại Grok session sau khi cài.

**Source parity ≠ behavioral parity:** Tất cả platform được hỗ trợ chia sẻ source files tương đương. Điều này chỉ chứng minh *source parity*. Behavioral parity — hành vi agent giống hệt nhau trên các platform — vẫn chưa được chứng minh nếu thiếu per-platform runtime attestation. Doctor báo cáo điều này trung thực qua layered statuses (NATIVE_UNVERIFIED, NATIVE_OBSERVED, v.v.).

## Đọc tiếp

1. [System map](docs/guides/00-system-map.md)
2. [Runtime model](docs/guides/01-runtime-model.md)
3. [Platform capability matrix](docs/guides/06-platform-capability.md)
4. English overview: [README.md](README.md)
5. 5fedu projects: [profiles/5fedu/projects/AGENTS.md](profiles/5fedu/projects/AGENTS.md) (bật profile trước)

**Governance:** Chỉ sửa `rules/` và `skills/` tại đây — không sửa `generated/` hoặc installed mirrors. Reverse sync qua `automation/07-import-reviewed-changes.ps1`.
