# 5fedu Project Entry (template — copy via installer)

**Vai trò:** Entrypoint sau khi **cài vào repo** tại `context/5fedu/`.  
**Ý đồ:** File này trong `agent-rules` là template; agent làm app phải đọc bản trong **repo dự án**, không đọc bản harness.

## Dự án 5fedu đã đăng ký

Xem registry hiện tại tại `projects/known-5fedu-repos.md` (agent-rules). Đây là danh sách repo đã đăng ký hiện tại, **không phải tập đóng vĩnh viễn**; owner có thể đăng ký repo mới và chạy installer trước khi dùng context 5fedu.

## Đọc theo trigger

1. Luôn đọc `00-context-map.md` — đây là router, không phải toàn bộ domain pack.
2. Nếu có `project-local/00-index.md`, chỉ đọc nó khi task chạm dữ liệu/quyết định của dự án.
3. Chỉ mở `organization/`, `domains/<domain>/`, `projects/<project-name>/` khi router chỉ đúng domain đó.
4. Không preload toàn bộ `organization/`, `domains/`, `evidence/`, `archive/` hoặc project-local.

## Source of truth (agent-rules canonical)

| Layer | agent-rules path | Synced to repo |
|---|---|---|
| Organization conventions | `organization/` | Yes (template) |
| Domain patterns | `domains/<domain>/` | Yes (template) |
| Project facts | `projects/<project-name>/` | No (project-local) |
| Evidence | `evidence/` | No |
| Archive | `archive/` | No |

## Behavior mặc định (UI)

Task tạo/sửa/refactor module ERP → `00-context-map.md` → chỉ mở `domains/ui/module-mapping.md` và `domains/ui/ui-delivery.md` khi trigger UI khớp; mở `domains/ui/ui-delivery-detail.md` khi surface cần detail/navigation/verify. Trước plan/code, discovery template cục bộ trong workspace theo `domains/ui/pattern-inventory.yaml`: chọn rõ một source, mở đúng anchors và ghi Git commit hoặc hash xác định. Không có/mơ hồ source → dừng slice parity và hỏi owner; không thay bằng remote, docs, screenshot hay memory. Sau đó mở module tham chiếu và route hiện tại trước khi code. **Cấm** `frontend-architect` / `master-image-generation` làm nguồn chính.

Khi user báo lệch/sai pattern: cùng flow trên + audit toàn surface.

Task dài / module mới: **PAF** + phase execute — `skills/plan-and-handoff/references/plan-artifact-template.md` (tier routing: `references/capability-tier-routing.md`).

## Cấu trúc (sau cài)

| Thư mục | Vai trò | Installer |
|---|---|---|
| `organization/` | Org-wide 5fedu conventions | Ghi đè |
| `domains/` | Rule theo domain (generic) | Ghi đè |
| `project-local/` | **Dữ liệu dự án** — sheets, Supabase, spec chốt | **Không đụng** |
| `evidence/` | Không auto-load — feedback/audit archival, chỉ truy vết khi router/owner chỉ định | Không sync |
| `archive/` | Không auto-load — historical project data | Không sync |
