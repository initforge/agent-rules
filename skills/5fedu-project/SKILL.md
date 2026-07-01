---
name: 5fedu-project
description: Scaffold or maintain 5fedu context in a real project repo. Use when 5fedu setup, context/5fedu, tah-app, nostime, owner decisions, Supabase/UI conventions. Trigger — thiết lập 5fedu, cài context dự án, tah-app, nostime. Do NOT read agent-rules/projects/5fedu/ during app implementation — only <repo>/context/5fedu/ after install. Do NOT use without 5fedu context in the active repo.
---

# 5fedu project

**Ý đồ:** Context sống **chỉ** trong repo dự án sau installer — không phải template harness.

## Dự án thật (duy nhất)

- **Tah-app** — React/Vite, template `5f-template-ket-noi-supabase`
- **nostime** — NOSTIME APP, Next.js legacy + overlay nostime

Registry: `agent-rules/projects/known-5fedu-repos.md`.

## Nguồn đọc khi code

```text
<active-repo>/context/5fedu/     ← ĐÚNG (layout mới hoặc legacy 00-index.md)
agent-rules/projects/5fedu/       ← SAI khi implement (chỉ template / maintain harness)
```

## Setup

```powershell
./automation/08-install-5fedu-context.ps1 -ProjectRoot <repo> -Profile tah-app|nostime
```

- `-UpdatePointersOnly` — sửa `.codex`/`.agents` pointer, giữ context cũ
- `-Force` — cài layout mới (backup context cũ)

## Maintenance

1. Sửa `<repo>/context/5fedu/` — không sửa template harness thay thế.
2. Promote lesson chung → `context-evolution-protocol` → agent-rules (nếu áp dụng mọi dự án).
3. UI lệch → `module-mapping.md` + đối chiếu template trước khi sửa code.

## Do NOT

- Không mirror full pack vào `.agents/5fedu` / `.codex/5fedu`
- Không giả định dự án 5fedu ngoài tah-app / nostime
