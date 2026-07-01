# 5fedu context map (skill reference)

**Vai trò:** Tóm tắt cho skill `5fedu-project` — chi tiết đầy đủ ở **repo dự án** sau cài.  
**Ý đồ:** Agent code app đọc `<repo>/context/5fedu/` — không đọc `agent-rules/projects/5fedu/`.

## Dự án thật

Chỉ **tah-app**, **nostime** — `agent-rules/projects/known-5fedu-repos.md`.

## Canonical paths (trong repo sau cài)

Layout mới:

```text
context/5fedu/AGENTS.md
context/5fedu/00-context-map.md
context/5fedu/domains/
```

Layout cũ (chưa migrate): `00-index.md` + file đánh số — vẫn hợp lệ.

## Router

Domain routing → **`00-context-map.md`** hoặc **`00-index.md`** (legacy).  
Module UI → **`domains/module-mapping.md`** hoặc file đánh số tương ứng trong repo.

## Decisions

`decisions.md` trong repo; Nostime overlay → `project-overlay/` sau cài profile `nostime`.
