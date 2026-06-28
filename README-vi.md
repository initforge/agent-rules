# Agent Rules — Runtime Codex Có Thể Đồng Bộ

![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white)
![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=flat-square&logo=powershell&logoColor=white)
![TOML](https://img.shields.io/badge/TOML-9C4121?style=flat-square)
![JSON](https://img.shields.io/badge/JSON-000000?style=flat-square&logo=json&logoColor=white)
![Codex](https://img.shields.io/badge/Codex_Runtime-111111?style=flat-square)
![MCP](https://img.shields.io/badge/MCP_Registry-2D3748?style=flat-square)

`agent-rules` là bộ runtime vận hành cho Codex: rules, agent profile, skill, template, script và inventory để một máy mới có thể dựng lại cùng một cách làm việc. Vấn đề chính của repo này không phải là "lưu vài prompt", mà là giữ cho nhiều agent/tool cùng hiểu một hợp đồng vận hành: khi nào phải lập plan, khi nào cần research, khi nào được sửa, khi nào phải dừng, và cách đồng bộ runtime mà không làm mất kiểm soát.

Repo này phân biệt rõ hai vai trò:

- `C:\Users\DELL\.codex` là runtime Codex dùng hằng ngày.
- `P:\agent-rules` là repo source/backup/bootstrap để phục hồi hoặc chia sẻ sang môi trường khác.

## Cấu trúc chính

| Khu vực | Vai trò |
|---|---|
| `rules/` | Luật vận hành dùng chung (Tiếng Việt): core, planning, execution, quality gate, context tools |
| `skills/` | Các skill dùng chung hoạt động cho các nền tảng (e.g. 5fedu-project, docs-style, check-work...) |
| `workflows/` | Các workflow mẫu định nghĩa các pha làm việc |
| `platforms/` | Các adapter cấu hình đặc thù cho từng nền tảng |
| `platforms/codex/` | Cấu hình Codex: profile agents, templates, hooks, docs và inventory |
| `platforms/grok/` | Cấu hình Grok CLI: hooks, scripts và cấu trúc mapping |
| `platforms/antigravity/` | Adapter cho Google Antigravity: overlay rules, workflows global |
| `scripts/` | Các tập lệnh cài đặt global, đồng bộ hóa (sync) và kiểm tra tính toàn vẹn (validate) |
| `docs/` | Tài liệu hệ thống và [Danh mục Open-source Tools](docs/09-opensource-tools-registry.md) |
| `.agents/` | Thư mục runtime live cục bộ dùng để kiểm thử trên repo này |

## Tech Stack

| Layer | Stack |
|---|---|
| Runtime contract | ![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white) ![TOML](https://img.shields.io/badge/TOML-9C4121?style=flat-square) ![JSON](https://img.shields.io/badge/JSON-000000?style=flat-square&logo=json&logoColor=white) |
| Automation | ![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=flat-square&logo=powershell&logoColor=white) |
| Agent workflow | ![Codex](https://img.shields.io/badge/Codex_CLI-111111?style=flat-square) ![RTK](https://img.shields.io/badge/RTK-3B3B3B?style=flat-square) |
| Context layer | ![GitNexus](https://img.shields.io/badge/GitNexus-4B5563?style=flat-square) ![MCP](https://img.shields.io/badge/MCP-2D3748?style=flat-square) |

## Tại sao thiết kế như vậy?

Runtime nằm ở `C:\Users\DELL\.codex` để Codex không phụ thuộc vào ổ `P:` trong công việc hằng ngày. Repo `P:\agent-rules` giữ vai trò source, backup và bootstrap: khi đổi máy, dựng lại môi trường, hoặc chia sẻ rule cho tool khác, chỉ cần đồng bộ từ repo này.

Các rule được tách khỏi agent profile vì hai thứ này thay đổi với nhịp khác nhau. Rule mô tả hợp đồng hành vi; profile chọn model/effort/sandbox cho từng pha. Script PowerShell nối hai lớp đó lại bằng các lệnh như `resolve-workflow-profile.ps1` và `start-codex-from-plan.ps1`.

## Chạy và kiểm tra

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
& "$env:USERPROFILE\.codex\scripts\verify-toolchain.ps1"
& "$env:USERPROFILE\.codex\scripts\inventory-current-machine.ps1"
```

Đồng bộ runtime hiện tại sang bản backup:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-codex-to-p.ps1"
```

Khôi phục từ backup về runtime local:

```powershell
& "P:\agent-rules\platforms\codex\scripts\sync-p-to-codex.ps1"
```

## Đọc tiếp

- [Đặc tả kỹ thuật](docs/01-technical-specification.md)
- [Vận hành và đồng bộ](docs/02-operations-and-sync.md)
- [Bảo trì và rủi ro](docs/03-maintenance-and-risks.md)
- [Antigravity adapter](docs/04-antigravity-adapter.md)
