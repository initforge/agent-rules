# Cách sync 5fedu

**Vai trò:** Quy tắc sync context dự án.  
**Ý đồ:** Một chiều mặc định; promote có kiểm soát.

Mặc định: `projects/5fedu` (template) → `context/5fedu` (repo dự án).

## Được phép

- Cập nhật template canonical rồi chạy `automation/08-install-5fedu-context.ps1` (hoặc copy có review)
- Promote rule từ `evidence/` sang `domains/` sau khi review
- Cập nhật `decisions.md` khi owner chốt

## Không được phép

- Copy log/evidence vào global `rules/` hoặc `skills/`
- Copy nguyên `.agents/`, `.codex/`, `05-generated/` về canonical
- Sửa `legacy/` rồi coi như rule sống
- Đưa quyết định Nostime vào `decisions.md` chung — dùng `archive/nostime/decisions.md`

Reverse sync về repo `agent-rules`: `automation/07-import-reviewed-changes.ps1`.
