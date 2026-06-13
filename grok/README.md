# Grok CLI Harness (Master)

Harness cho **Grok CLI** — không liên quan Cursor IDE.

## Triết lý

- **Opus-emulation:** mặc định MEDIUM, full gates HIGH, ceremony tối thiểu.
- **Lõi chung** với Codex + Antigravity (`sync-all-harness.sh`).
- **Đủ 3 tầng:** rules + skills + 5fedu context (trên dự án khách).

## Cơ chế nạp

| Lớp | Path |
|---|---|
| Master | `grok/rules/`, `grok/skills/` |
| Live | `.grok/rules/`, `.grok/skills/` |
| Global | `~/.grok/` |

```bash
./grok/scripts/sync-all-harness.sh
grok inspect
```

## Đọc tiếp

- [docs/07-grok-cli-harness.md](../docs/07-grok-cli-harness.md)
- [docs/08-opus-emulation-harness.md](../docs/08-opus-emulation-harness.md)