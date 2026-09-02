# 5fedu Project Entry (template — copy via installer)

**Vai trò:** Entrypoint sau khi **cài vào repo** tại `context/5fedu/`.  
**Ý đồ:** File này trong `agent-rules` là template; agent làm app phải đọc bản trong **repo dự án**, không đọc bản harness.

## Dự án 5fedu đã đăng ký

Xem registry hiện tại tại `known-repos.md` (agent-rules). Đây là danh sách repo đã đăng ký hiện tại, **không phải tập đóng vĩnh viễn**; owner có thể đăng ký repo mới và chạy installer trước khi dùng context 5fedu.

## Đọc theo trigger

1. Luôn đọc `00-context-map.md` — đây là router, không phải toàn bộ domain pack.
2. Nếu có `project-local/00-index.md`, chỉ đọc nó khi task chạm dữ liệu/quyết định của dự án.
3. Chỉ mở `decisions.md`, `open-questions.md` hoặc bản `project-local/` khi router chỉ đúng domain đó.
4. Không preload toàn bộ `domains/`, `archive/`, `evidence/` hoặc project-local.

Layout cũ (`00-index.md` ở root): hợp lệ nếu chưa migrate — đọc `00-index.md` hoặc `project-local/00-index.md`.

## Behavior mặc định (UI)

Task tạo/sửa/refactor module ERP → `00-context-map.md` → chỉ mở `module-mapping.md` và `ui-delivery.md` khi trigger UI khớp; mở `ui-delivery-detail.md` khi surface cần detail/navigation/verify. Trước plan/code, discovery template cục bộ trong workspace theo `pattern-inventory.yaml`: chọn rõ một source, mở đúng anchors và ghi Git commit hoặc hash xác định. Không có/mơ hồ source → dừng slice parity và hỏi owner; không thay bằng remote, docs, screenshot hay memory. **[Mới] Tạo parity packet** tại `parity/<module>/` trước khi implement; workflow, schemas, examples, questions và worker contract chỉ load từ `skills/5fedu-module-parity/references/`. Sau đó mở module tham chiếu và route hiện tại trước khi code. **Cấm** `frontend-composition` / `master-image-generation` làm nguồn chính.

Khi user báo lệch/sai pattern: cùng flow trên + audit toàn surface.

Task dài / module mới: dùng skill `plan-and-handoff` và global portable-plan
contract; plan phải đóng kín source, quyết định, target, reference, acceptance
và proof trước khi execute, không dùng model tier hoặc template plan riêng.

## Cấu trúc (sau cài)

| Thư mục | Vai trò | Installer |
|---|---|---|---|
| `domains/` | Rule theo domain (generic) | Ghi đè |
| `parity/<module>/` | Packet runtime của module; canonical schemas/workflow/contracts/examples thuộc loaded skill `5fedu-module-parity` | Agent tạo/cập nhật theo packet gate |
| `project-local/` | **Dữ liệu dự án** — sheets, Supabase, spec chốt | **Không đụng** |
| `archive/nostime/` | Overlay template retail (profile nostime) | Ghi đè khi install nostime |
| `evidence/` | Không auto-load — feedback/audit archival, chỉ truy vết khi router/owner chỉ định | Ghi đè nếu trong template |
