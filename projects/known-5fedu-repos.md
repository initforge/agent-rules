# Dự án 5fedu đã biết

**Vai trò:** Registry các repo 5fedu thật — không thêm dự án ảo.  
**Ý đồ:** Agent chỉ nạp `context/5fedu/` **trong repo đang mở**, không đọc template `agent-rules/projects/5fedu/`.

## Repo hợp lệ

| Slug | Path (máy dev) | Profile | Ghi chú |
|---|---|---|---|
| `tah-app` | `/home/linhnxdeveloper/Projects/Tah-app` (Linux) / `P:\Tah-app` (Windows) | `tah-app` | ERP TAH; deploy `tah-app.vercel.app` qua `git push` |
| `nostime` | `/home/linhnxdeveloper/Projects/nostime` (Linux) / `P:\nostime` (Windows) | `nostime` | NOSTIME APP; luxury retail |

Không có dự án 5fedu thứ ba trừ khi owner thêm vào đây và chạy installer.

## Context trong repo

- Context **chỉ** tại `<repo>/context/5fedu/` sau `08-install-5fedu-context.ps1`.
- Hai repo trên hiện dùng **layout context cũ** (`00-index.md`, file đánh số) — agent đọc đúng file trong repo đó cho đến khi migrate sang `domains/`.

## Lệnh thường dùng

```powershell
# Chỉ cập nhật pointer (giữ context cũ)
./automation/08-install-5fedu-context.ps1 -ProjectRoot /home/linhnxdeveloper/Projects/Tah-app -Profile tah-app -UpdatePointersOnly
./automation/08-install-5fedu-context.ps1 -ProjectRoot /home/linhnxdeveloper/Projects/nostime -Profile nostime -UpdatePointersOnly

# Cài layout mới (backup context cũ)
./automation/08-install-5fedu-context.ps1 -ProjectRoot ... -Profile tah-app -Force
```
