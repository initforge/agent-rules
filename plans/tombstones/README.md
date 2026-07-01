# Tombstones

**Vai trò:** Ghi skill/rule đã xóa khỏi canonical — chặn import ngược.  
**Ý đồ:** `07-import-reviewed-changes.ps1` từ chối restore skill có file `*.tombstone` ở đây.

Format: `<skill-slug>.tombstone` — một dòng lý do + ngày.
