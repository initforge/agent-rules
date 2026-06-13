# Grok CLI / Composer 2.5 Harness

Harness thứ 4 cho **Grok CLI** chạy model **Composer 2.5**. Live path chính: `.grok/rules/` (không phải `.cursor/`).

## Triết lý

- **Gốc nội dung:** `codex/rules/` (gộp 4 file + overlay + platform-boundary + opus contract).
- **Độ nặng:** **Opus-emulation** — mặc định MEDIUM, full gates HIGH; ceremony tối thiểu.
- **Khác Antigravity:** cùng outcome Opus (`06-opus-emulation-contract`), không status essay mọi lượt.
- **Khác Kiro:** Kiro chạy Opus thật → harness mỏng; Grok **ép** verify/context để nâng sàn.

## Cơ chế nạp (Grok CLI)

| Lớp | Path | Vai trò |
|---|---|---|
| Master | `cursor/rules/*.md` | Nguồn chỉnh sửa |
| **Live Grok** | **`.grok/rules/*.md`** | **Grok CLI luôn scan** |
| Live Cursor compat | `.cursor/rules/*.md` | Chỉ khi `[compat.cursor] rules = true` |
| Global | `~/.grok/` | Rules/skills/config user |
| Entrypoint | `cursor/AGENTS.md` | Hợp đồng nạp |

Grok load **mọi** `*.md` trong `.grok/rules/` và skill trong `.grok/skills/`. Verify: `grok inspect`.

**Đủ harness = rules + skills.** Thiếu skills → rule reference `5fedu-project` chết. Xem `cursor/INTENT.md`.

## Coverage

Bảng map Codex → Cursor: [docs/07-cursor-composer-harness.md](../docs/07-cursor-composer-harness.md).

## Sync master → live

```bash
./cursor/scripts/sync-harness.sh   # rules + skills
```

Sửa `cursor/rules/` hoặc `cursor/skills/`; script mirror xuống `.grok/`.

## Không làm

- Không copy nguyên Antigravity `alwaysApply` nặng.
- Không port rule chéo vào `codex/`, `antigravity/`, `kiro/` mà không adapt.
- Không đặt model/effort trong rule (Composer runtime tự quản).