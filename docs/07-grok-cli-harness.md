# Grok CLI Harness — Coverage Map

Harness cho **Grok CLI** (`grok` command). **Không phải Cursor IDE.**

Lõi **Opus-emulation** đồng bộ sang Codex + Antigravity + Grok qua `scripts/sync-all-harness.sh`.

## Ba nền — cùng lõi

| Nền | Live | Đặc thù |
|---|---|---|
| **Grok CLI** | `.grok/rules/` + `.grok/skills/` | scan tự động, `grok inspect` |
| **Codex** | `platforms/codex/` + `~/.codex/` | `@import` AGENTS.md, `codex-overlay` |
| **Antigravity** | `.agents/rules/` | `alwaysApply` + `antigravity-overlay` |

## Master → live

```text
rules/ + skills/ + workflows/  MASTER
    ↓ sync-all-harness.sh
.grok/  platforms/codex/  .agents/rules/
```

## Rules (10 Codex / 10 Antigravity / 9 Grok)

| # | File | Vai trò |
|---|---|---|
| 00 | `00-runtime-and-intent` | Intent router, hard activation |
| 01 | `01-agent-workflow-sop` | Planning, execution, RC, quality matrix |
| 02 | `02-code-quality-and-debt` | Clean code, regression, debt |
| 03 | `03-context-and-tools` | Fast context, anti-stuck |
| 04 | `04-skills-and-5fedu` | Skills registry + 5fedu paths |
| 05 | `05-harness-mutation-gate` | Chống tự sửa harness |
| 06 | `06-opus-emulation-contract` | Outcome Opus, MEDIUM default |
| — | `grok-overlay` / `codex-overlay` / `antigravity-overlay` | Platform-specific |
| — | `platform-boundary` | Ranh giới nền |

## So với harness cũ (19 file rời)

| Khía cạnh | Codex/Antigravity cũ | Harness mới |
|---|---|---|
| Cấu trúc | 17–19 file trùng lặp | 9 lõi + 1 overlay |
| Opus-emulation | Không có `06` | Có — MEDIUM default |
| Skills registry | Rải rác / thiếu | `04-skills-and-5fedu` bắt buộc |
| Mutation gate | Không | `05` — chống tự tiến hóa |
| Antigravity alwaysApply | Một số file | **Tất cả** rule files |
| Ceremony | Preflight nặng (cũ) | Giữ outcome, bỏ ceremony thừa |

## Mạnh hơn chưa?

- **Lõi gate:** ≥ Codex cũ (cùng coverage, gộp gọn).
- **vs Antigravity cũ:** Cùng strength outcome + `alwaysApply` toàn bộ; **bỏ** preflight 8 câu / 2 phương án mọi task (nhanh hơn, không yếu verify).
- **Grok CLI:** Thêm `.grok/skills/` 30 skill + anti-stuck explore — **mạnh hơn Codex cũ** về kích hoạt skill.

Harness **nâng sàn** — không thay model weights Opus 4.8.
