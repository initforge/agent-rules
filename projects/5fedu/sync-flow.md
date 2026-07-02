# Cách sync 5fedu

**Vai trò:** Quy tắc sync context dự án.  
**Ý đồ:** Install một chiều; write-back có kiểm soát sau khi sửa trong repo.

Canonical agent-rules: **`P:\agent-rules`**.

## Đọc (implement)

- Khi code trong repo dự án: chỉ đọc `<repo>/context/5fedu/`, **không** đọc `agent-rules/projects/5fedu/` làm nguồn sống.

## Cài từ template → repo

Mặc định: `P:\agent-rules\projects\5fedu` → `context/5fedu` (repo dự án) qua `automation/08-install-5fedu-context.ps1`.

## Write-back (sau khi sửa — chỉ phần thay đổi)

Sync **ngay sau khi sửa**, không mirror toàn bộ skills hay `05-generated/`:

| Case | Nguồn sửa | Đích sync |
|------|-----------|-----------|
| **1. Global** | `rules/`, `skills/` toàn cục (trong session hoặc repo) | `P:\agent-rules\rules\`, `P:\agent-rules\skills\` |
| **2. Context 5fedu** | `<repo>/context/5fedu/` | `P:\agent-rules\projects\5fedu\` (cùng đường dẫn tương đối) |

Sau write-back: chạy `P:\agent-rules\automation\03-validate-context.ps1` rồi `01-build-runtime.ps1`. Review diff trước khi commit.

## Chính sách không backup

- **Không** tạo thư mục `*.backup-*` khi cài lại context (`-Force` ghi đè trực tiếp).
- Xóa backup cũ nếu còn; giữ bản live trong repo và `P:\agent-rules`.

## Được phép

- Cập nhật template canonical rồi chạy `automation/08-install-5fedu-context.ps1` (hoặc copy có review)
- Promote rule từ `evidence/` sang `domains/` sau khi review
- Cập nhật `decisions.md` khi owner chốt
- Write-back file đã sửa sang `P:\agent-rules` theo 2 case trên

## Không được phép

- Copy log/evidence vào global `rules/` hoặc `skills/`
- Copy nguyên `.agents/`, `.codex/`, `05-generated/` về canonical
- Sửa `legacy/` rồi coi như rule sống
- Đưa quyết định Nostime vào `decisions.md` chung — dùng `archive/nostime/decisions.md`
- Sync toàn bộ skills hay runtime generated khi chỉ sửa vài file context

Reverse sync có review: `P:\agent-rules\automation\07-import-reviewed-changes.ps1`.
