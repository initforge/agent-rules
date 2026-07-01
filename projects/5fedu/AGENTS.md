# 5fedu Project Entry (template — copy via installer)

**Vai trò:** Entrypoint sau khi **cài vào repo** tại `context/5fedu/`.  
**Ý đồ:** File này trong `agent-rules` là template; agent làm app phải đọc bản trong **repo dự án**, không đọc bản harness.

## Dự án 5fedu thật

Chỉ **Tah-app** và **nostime** — xem `known-5fedu-repos.md` (agent-rules).

## Đọc trước (layout mới)

1. `00-context-map.md`
2. `decisions.md`
3. `open-questions.md`

Layout cũ (`00-index.md`, file đánh số): vẫn hợp lệ nếu repo chưa migrate — đọc `00-index.md` trong repo đó.

## Behavior mặc định (UI)

Khi user báo lệch/sai pattern → `00-context-map.md` → `domains/module-mapping.md` → mở template + route hiện tại → đối chiếu trước khi sửa.

## Cấu trúc (sau cài)

| Thư mục | Vai trò |
|---|---|
| `domains/` | Rule theo domain |
| `project-overlay/` | Chỉ profile `nostime` — spec retail |
| `evidence/`, `legacy/` | Không auto-load |
