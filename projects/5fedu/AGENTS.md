# 5fedu Project Entry (template — copy via installer)

**Vai trò:** Entrypoint sau khi **cài vào repo** tại `context/5fedu/`.  
**Ý đồ:** File này trong `agent-rules` là template; agent làm app phải đọc bản trong **repo dự án**, không đọc bản harness.

## Dự án 5fedu thật

Chỉ **Tah-app** và **nostime** — xem `known-5fedu-repos.md` (agent-rules).

## Đọc trước

1. `00-context-map.md` — router domain (template)
2. **`project-local/00-index.md`** — router dự án (sheets, Supabase, decisions đã chốt) — **ưu tiên** nếu có
3. `decisions.md` (generic template) hoặc `project-local/decisions.md` (dự án)
4. `open-questions.md` hoặc `project-local/open-questions.md`

Layout cũ (`00-index.md` ở root): hợp lệ nếu chưa migrate — đọc `00-index.md` hoặc `project-local/00-index.md`.

## Behavior mặc định (UI)

**Mọi** task tạo/sửa/refactor module ERP → `00-context-map.md` → `domains/module-mapping.md` + `domains/ui-delivery.md` (+ `domains/references/ui-delivery-detail.md` khi implement) → mở module tham chiếu (Nhân viên/Phòng ban) + route hiện tại → đối chiếu **trước** khi code. **Cấm** `frontend-architect` / `master-image-generation` làm nguồn chính.

Khi user báo lệch/sai pattern: cùng flow trên + audit toàn surface.

Task dài / module mới: **PAF** + phase execute — `skills/plan-and-handoff/references/plan-artifact-template.md` (tier routing: `references/capability-tier-routing.md`).

## Cấu trúc (sau cài)

| Thư mục | Vai trò | Installer |
|---|---|---|
| `domains/` | Rule theo domain (generic) | Ghi đè |
| `project-local/` | **Dữ liệu dự án** — sheets, Supabase, spec chốt | **Không đụng** |
| `archive/nostime/` | Overlay template retail (profile nostime) | Ghi đè khi install nostime |
| `evidence/` | Không auto-load — feedback/audit | Ghi đè nếu trong template |
