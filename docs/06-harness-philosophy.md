# Harness Philosophy — 4 nền, một lõi an toàn

Repo `agent-rules` phục vụ **bốn runtime agent**. Mỗi nền có triết lý độ nặng riêng; **không** copy-paste rule chéo mà không adapt.

## Bốn nền

| Nền | Cơ chế nạp | Độ nặng | Mục tiêu |
|---|---|---|---|
| **Codex** | `@import` trong `AGENTS.md` | Nặng vừa | Bù tính literal GPT/Codex |
| **Antigravity** | `alwaysApply` `.agents/rules/` | Nặng nhất | Ép Gemini verify, context, gates |
| **Grok/Composer** | scan `.grok/rules/*.md` | **Opus-emulation** | Composer đạt đầu ra Opus, ceremony tối thiểu |
| **Kiro** | `inclusion` `.kiro/steering/` | Mỏng | Opus thật — không cắt trần reasoning |

## Nguyên tắc chung

1. **Harness = hạ tầng**, không phải notepad. Agent mặc định **không** tự sửa harness khi làm task thường (`05-harness-mutation-gate`).
2. **Rules + Skills + Context** — thiếu một tầng → rule reference chết (vd `5fedu-project` không có trong `.grok/skills/`).
3. **Emulate outcome, not ceremony** — Opus-emulation: tự chủ, bền, verify; không preflight 8 câu mọi lượt.
4. **Master → live** — sửa `grok/` rồi `sync-all-harness.sh`; một lệnh sync cả Codex + Antigravity.

## Learning tiers

| Tier | Path | Khi nào ghi |
|---|---|---|
| L0 | Chat / báo cáo | Mọi lượt |
| L1 | `AGENTS.md`, `.grok/5fedu/`, `plan/` dự án | Feedback lặp trong dự án |
| L2 | `cursor/rules/`, `cursor/skills/` | User yêu cầu rõ sửa harness |
| L3 | `codex/`, `antigravity/`, `kiro/` | User yêu cầu + đúng nền |

## Opus-emulation (Composer + Gemini)

Lõi: `shared/opus-emulation-contract.md` → `grok/rules/06-*` → sync 3 nền.

- **Mặc định MEDIUM** — đa số task nặng đô, không hạ tier để khỏi verify.
- **HIGH** khi DB/auth/5fedu UI/production/permission/export.
- **Không phân việc theo model** — cùng contract outcome.

## Đọc tiếp

- [Grok CLI harness coverage](07-grok-cli-harness.md)
- [Opus emulation](08-opus-emulation-harness.md)