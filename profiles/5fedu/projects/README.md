# Template pack 5fedu (agent-rules)

**Vai trò:** Nguồn cài đặt — **KHÔNG** phải context đang chạy trong app.  
**Ý đồ:** Agent không đọc thư mục này khi code trong `Tah-app` / `nostime`; chỉ dùng khi maintain harness hoặc chạy installer.

## Quy tắc vàng

```text
agent-rules/projects/5fedu/  →  template (copy qua installer)
<repo>/context/5fedu/        →  context sống (chỉ sau khi cài vào repo)
```

**Không** coi template là context dự án. **Không** sửa template thay cho `context/5fedu/` trong repo đang làm.

## Dự án 5fedu thật (duy nhất)

| Repo | Profile | Stack |
|---|---|---|
| `Tah-app` | `tah-app` | React/Vite + `5f-template-ket-noi-supabase` |
| `nostime` | `nostime` | Next.js legacy + overlay `archive/nostime/` |

Chi tiết: [`known-5fedu-repos.md`](../known-5fedu-repos.md).

## Cài vào repo

```powershell
./automation/08-install-5fedu-context.ps1 -ProjectRoot /path/to/Tah-app -Profile tah-app
./automation/08-install-5fedu-context.ps1 -ProjectRoot /path/to/nostime -Profile nostime
```

`-UpdatePointersOnly` — chỉ sửa `.codex`/`.agents` pointer, giữ context hiện có.  
`-Force` — thay thế full (ghi đè trực tiếp, không backup).
