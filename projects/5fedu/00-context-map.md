# 5fedu Context Router

**Vai trò:** Bảng định tuyến domain. Template pack này là bản cài vào repo dự án.  
**Canonical source:** `agent-rules/` mirror tại `organization/`, `domains/`, `projects/<name>/`, `evidence/`, `archive/`.

## Cách dùng

1. Đọc `AGENTS.md` trước.
2. Đọc `project-local/00-index.md` nếu có (dữ liệu dự án — installer không đụng).
3. Khớp keyword với bảng dưới → mở đúng file, không mở cả pack.

| Domain | Trigger | File (trong template này) |
|---|---|---|
| UI / module | module, giao diện, parity, form, list | `domains/ui/module-mapping.md` + `ui-delivery.md` |
| Database | bảng, cột, migration, RLS, auth | `domains/database/conventions.md` |
| Nghiệp vụ ERP | master-detail, duyệt, rollup, export | `domains/business/patterns.md` |
| Phân quyền | permission, cap_bac, quyền | `domains/security/permissions.md` |
| Template/stack | template, vite, supabase, deploy | `domains/delivery/tech-stack.md` |
| Org conventions | org-wide rules, context policy | `organization/5fedu-conventions.md` |

## Source of truth hierarchy

| Layer | Vị trí trong agent-rules | Vị trí trong project repo |
|---|---|---|
| Organization | `organization/` | `context/5fedu/organization/` |
| Domain patterns | `domains/<domain>/` | `context/5fedu/domains/<domain>/` |
| Project facts | `projects/<project-name>/` | `context/5fedu/project-local/` |
| Evidence | `evidence/` | Not synced |
| Archive | `archive/` | Not synced |

## Không auto-load

- `evidence/` — feedback thô, audit, archival
- `archive/` — historical project data
- `project-local/` — dữ liệu sống từng dự án

## Skill routing (UI parity)

- UI parity ERP: `5fedu-module-parity` — không `frontend-architect` làm nguồn chính.
- `frontend-architect`: chỉ branding/landing/redesign ngoài shell module ERP.
