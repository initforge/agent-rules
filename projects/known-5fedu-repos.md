# Dự án 5fedu đã biết

**Vai trò:** Registry các repo 5fedu thật — không thêm dự án ảo.  
**Ý đồ:** Agent chỉ nạp `context/5fedu/` **trong repo đang mở**, không đọc template `agent-rules/projects/5fedu/`.

## Repo hợp lệ

| Slug | Path (máy dev) | Profile | Ghi chú |
|---|---|---|---|
| `tah-app` | `/home/linhnxdeveloper/Projects/Tah-app` (Linux) / `P:\Tah-app` (Windows) | `tah-app` | ERP TAH; deploy `tah-app.vercel.app` qua `git push` |
| `nostime` | `/home/linhnxdeveloper/Projects/nostime` (Linux) / `P:\nostime` (Windows) | `nostime` | NOSTIME APP; luxury retail |

Không có dự án 5fedu thứ ba trừ khi owner thêm vào đây và chạy installer.

## Context trong repo

- Context **chỉ** tại `<repo>/context/5fedu/` sau `08-install-5fedu-context.ps1`.
- Layout chuẩn: `00-context-map.md`, `domains/`, `AGENTS.md`; dữ liệu dự án trong `project-local/` (installer không ghi đè).
- Root `AGENTS.md` được migrate tự động bởi `10-sync-project-agents.ps1` (gọi từ `08-install`); rule cứng repo → `project-local/agents-hard-rules.md`.

### Bảng ánh xạ Layout cũ ↔ Layout mới (Domains)

| File cũ (nhập/đọc) | File mới tương đương | Nội dung tương ứng |
|---|---|---|
| `00-index.md` | `00-context-map.md` | Bản đồ điều hướng context |
| `01-tech-stack-and-template.md` | `domains/tech-stack.md` | Tech stack, template, libraries |
| `02-business-rules.md` | `domains/business.md` | Luật nghiệp vụ, workflow đặc thù |
| `03-database-supabase.md` | `domains/database.md` | Schema DB, migration, RLS, functions |
| `04-auth-permissions-and-flows.md` | `domains/permissions.md` | Phân quyền, ma trận quyền, luồng auth |
| `05-development-standards.md` | `domains/ui-delivery.md` | Tiêu chuẩn chất lượng, visual gate |
| `06-decision-status.md` | `decisions.md` | Trạng thái các quyết định đã khóa |
| `07-working-format.md` | `domains/module-mapping.md` | Quy trình code module, checklists |
| `08-source-examples.md` | `domains/business.md` | Ví dụ code và business linkage map |

## Lệnh thường dùng

```powershell
# Cài/sync template + auto migrate root AGENTS
./automation/run.sh 08-install-5fedu-context -ProjectRoot /home/linhnxdeveloper/Projects/Tah-app -Profile tah-app -Force -SkipPrompts
./automation/run.sh 08-install-5fedu-context -ProjectRoot /home/linhnxdeveloper/Projects/nostime -Profile nostime -Force -SkipPrompts

# Chỉ cập nhật pointer adapter (.codex/.agents)
./automation/run.sh 08-install-5fedu-context -ProjectRoot ... -Profile tah-app -UpdatePointersOnly
```
