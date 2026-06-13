# Antigravity Runtime Intent Manifest

`.agents` = lớp ép hành vi bắt buộc cho Gemini. Lõi **Opus-emulation** — đồng bộ từ `grok/` master.

## Mục tiêu

- Intent audit — không chỉ literal text
- Index/mapping trước code; skill khi khớp trigger
- 5fedu: `/template` trước UI; production verify có gates
- MEDIUM default; final MEDIUM/HIGH đủ status block (`antigravity-overlay`)
- `PASS` | `PARTIAL` | `BLOCKED`

## Files bắt buộc (protected)

- `.agents/AGENTS.md`, `INTENT.md`, `README.md`, `hooks.json`
- `.agents/rules/` — 9 file Opus-emulation + `antigravity-overlay` (alwaysApply)
- `.agents/skills/5fedu-project/SKILL.md`
- `.agents/workflows/*.md`
- `.agents/5fedu/00-index.md` (khi dự án 5fedu)

Không cleanup/gitignore nếu user chưa yêu cầu đích danh.

## Enforcement

1. `.agents/AGENTS.md`
2. `.agents/rules/00-runtime-and-intent.md` + `06-opus-emulation-contract.md`
3. `.agents/rules/antigravity-overlay.md`
4. `scripts/antigravity-preflight.ps1`

Sync master: `agent-rules/grok/scripts/sync-all-harness.sh`