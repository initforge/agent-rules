# Vận Hành Và Đồng Bộ

## 1. Mục tiêu vận hành

Vận hành `agent-rules` xoay quanh một nguyên tắc: **đừng để bản runtime đang dùng và bản backup không rõ nguồn gốc**. Mỗi lần chỉnh rule, skill, script hoặc registry, cần biết thay đổi nằm ở `C:\Users\DELL\.codex`, `P:\agent-rules\codex`, hay repo Git.

## 2. Kiểm tra runtime local

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
& "$env:USERPROFILE\.codex\scripts\verify-toolchain.ps1"
```

`verify-codex-rules.ps1` kiểm tra các file bắt buộc như `AGENTS.md`, `rules/*.md`, docs registry và script orchestration. `verify-toolchain.ps1` kiểm tra các tool nền như Codex CLI, RTK, Git, Node, Python, Flutter và các công cụ liên quan.

## 3. Ghi inventory máy hiện tại

```powershell
& "$env:USERPROFILE\.codex\scripts\inventory-current-machine.ps1"
```

Inventory dùng để biết máy hiện tại có tool nào, path nào và MCP nào. Không ghi secret value vào inventory. Nếu cần tài liệu hóa secret, chỉ ghi tên biến và nơi thiết lập.

## 4. Sync local runtime sang backup

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-codex-to-p.ps1"
```

Dùng khi `C:\Users\DELL\.codex` là nguồn đúng và cần đẩy sang `P:\agent-rules\codex`. Đây là hướng sync thường dùng sau khi cập nhật skill, rule hoặc script trong runtime local.

## 5. Restore backup về local runtime

```powershell
& "P:\agent-rules\codex\scripts\sync-p-to-codex.ps1"
```

Dùng khi cần dựng lại `C:\Users\DELL\.codex` từ bản backup. Không chạy lệnh này nếu chưa chắc backup mới hơn hoặc đúng hơn bản local, vì nó có thể ghi đè thay đổi runtime hiện tại.

## 6. Bootstrap máy mới

Quy trình nằm trong `codex/docs/bootstrap-new-machine.md`:

1. Tạo `C:\Users\DELL\.codex` và `P:\agent-rules`.
2. Copy `P:\agent-rules\codex\*` vào `.codex`.
3. Chạy verify rules.
4. Chạy bootstrap/install tools.
5. Chạy toolchain verify.
6. Ghi inventory.
7. Đọc tool/MCP/skills registry để xử lý phần còn thiếu.

## 7. Phase orchestration

Khi một plan đã ghi phase/profile, có thể resolve profile bằng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\scripts\resolve-plan-profile.ps1" `
  -PlanFile .\plan\feature\01-slice.md
```

Hoặc dry-run lệnh Codex:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\scripts\start-codex-from-plan.ps1" `
  -PlanFile .\plan\feature\01-slice.md `
  -DryRun
```

Điểm thiết kế: phase không bị suy đoán trong đầu người chạy. Nó được ghi trong plan, resolve bằng script, và có thể kiểm tra trước khi chạy thật.

## 8. Khi nào cần dừng

Dừng và kiểm tra lại khi:

- `verify-codex-rules.ps1` báo thiếu file bắt buộc.
- `sync-p-to-codex.ps1` sắp ghi đè một runtime local mới hơn.
- MCP hoặc GitNexus trả context cũ.
- Inventory có dấu hiệu chứa secret.
- Plan slice không còn khớp scope ban đầu.
- Skill hoặc rule mới chưa chạy validation nhưng đã được sync.
