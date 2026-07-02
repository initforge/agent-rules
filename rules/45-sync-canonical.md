---
alwaysApply: true
description: Canonical sync governance — agent-rules is source of truth; reviewed inbound only.
---

# Sync canonical

**Ý đồ:** Tránh stale/deleted skills quay lại từ runtime hoặc repo con; mọi tiến hoá context phải về canonical.

## Outbound (canonical → runtime / project)

- Build: `automation/01-build-runtime.ps1` → `05-generated/runtime-build/`
- Install: `automation/02-install-runtime.ps1` — wipe target trước copy; không giữ file lạ ngoài manifest
- Doctor: `automation/09-doctor.ps1` sau install

## Inbound (repo khác → canonical)

- Chỉ qua `automation/07-import-reviewed-changes.ps1` sau diff review
- Phân loại: `global` | `skill` | `project` | `evidence` | `legacy`
- **Tombstone:** skill/rule đã xóa ở canonical không được import ngược; ghi `.agent/tombstones/` nếu cần audit
- Evidence/legacy không promote thành global rule sống

## Bắt buộc khi tiến hoá agent

Sửa context ở runtime hoặc repo con → **luôn** tìm và cập nhật `agent-rules` (rules/, skills/, projects/) trước khi coi xong.
