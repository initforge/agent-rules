# Agent Rules — Runtime Codex Có Thể Đồng Bộ

![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white)
![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=flat-square&logo=powershell&logoColor=white)
![TOML](https://img.shields.io/badge/TOML-9C4121?style=flat-square)
![JSON](https://img.shields.io/badge/JSON-000000?style=flat-square&logo=json&logoColor=white)
![Codex](https://img.shields.io/badge/Codex_Runtime-111111?style=flat-square)
![MCP](https://img.shields.io/badge/MCP_Registry-2D3748?style=flat-square)

`agent-rules` là bộ runtime vận hành cho Codex: rules, agent profile, skill, template, script và inventory để một máy mới có thể dựng lại cùng một cách làm việc. Vấn đề chính của repo này không phải là "lưu vài prompt", mà là giữ cho nhiều agent/tool cùng hiểu một hợp đồng vận hành: khi nào phải lập plan, khi nào cần research, khi nào được sửa, khi nào phải dừng, và cách đồng bộ runtime mà không làm mất kiểm soát.

Repo này phân biệt rõ hai vai trò:

- `C:\Users\DELL\.codex` là runtime dùng hằng ngày.
- `P:\agent-rules\codex` là bản backup/sync/bootstrap để phục hồi hoặc chia sẻ sang môi trường khác.

## Cấu trúc chính

| Khu vực | Vai trò |
|---|---|
| `codex/AGENTS.md` | Điểm nạp runtime cho Codex, trỏ về các rule trong `C:\Users\DELL\.codex` |
| `codex/rules/` | Luật vận hành: core, planning, execution, quality gate, context tools, inventory |
| `codex/agents/` | Profile TOML cho planner, researcher, implementer, reviewer, bugfixer |
| `codex/skills/` | Skill cục bộ và skill vendor đã đóng gói |
| `codex/scripts/` | Script sync, bootstrap, inventory, phase/profile orchestration |
| `codex/docs/` | Registry và tài liệu runtime được copy vào `.codex/docs` |
| `codex/templates/` | Mẫu plan, research note, review report, handoff, final report |
| `codex/inventory/` | Snapshot tool, MCP, path, env và config |

## Tech Stack

| Layer | Stack |
|---|---|
| Runtime contract | ![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white) ![TOML](https://img.shields.io/badge/TOML-9C4121?style=flat-square) ![JSON](https://img.shields.io/badge/JSON-000000?style=flat-square&logo=json&logoColor=white) |
| Automation | ![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=flat-square&logo=powershell&logoColor=white) |
| Agent workflow | ![Codex](https://img.shields.io/badge/Codex_CLI-111111?style=flat-square) ![RTK](https://img.shields.io/badge/RTK-3B3B3B?style=flat-square) |
| Context layer | ![GitNexus](https://img.shields.io/badge/GitNexus-4B5563?style=flat-square) ![MCP](https://img.shields.io/badge/MCP-2D3748?style=flat-square) |

## Tại sao thiết kế như vậy?

Runtime nằm ở `C:\Users\DELL\.codex` để Codex không phụ thuộc vào ổ `P:` trong công việc hằng ngày. Bản `P:\agent-rules\codex` giữ vai trò backup và bootstrap: khi đổi máy, dựng lại môi trường, hoặc chia sẻ rule cho tool khác, chỉ cần đồng bộ bundle này.

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
& "P:\agent-rules\codex\scripts\sync-p-to-codex.ps1"
```

## Đọc tiếp

- [Đặc tả kỹ thuật](docs/01-technical-specification.md)
- [Vận hành và đồng bộ](docs/02-operations-and-sync.md)
- [Bảo trì và rủi ro](docs/03-maintenance-and-risks.md)
