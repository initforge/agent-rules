# Antigravity Agent Entrypoint

Đọc trước mọi task khi workspace có `.agents/`. Manifest: `.agents/INTENT.md`.

## Intent

Antigravity (Gemini) dùng **cùng lõi Opus-emulation** với Grok CLI và Codex — sync từ `grok/` master. Khác biệt: `alwaysApply` trên mọi rule + `antigravity-overlay.md`.

## Required Rules (đọc theo thứ tự)

1. `.agents/rules/00-runtime-and-intent.md`
2. `.agents/rules/07-finish-to-completion.md`
3. `.agents/rules/06-opus-emulation-contract.md`
4. `.agents/rules/01-agent-workflow-sop.md`
5. `.agents/rules/04-skills-and-5fedu.md`
6. `.agents/rules/antigravity-overlay.md`
7. `.agents/rules/02-code-quality-and-debt.md` · `03-context-and-tools.md` · `05-harness-mutation-gate.md`

Toàn bộ 11 file trong `.agents/rules/` đều `alwaysApply`.

## Project Context

- `AGENTS.md` dự án nếu có.
- `.agents/5fedu/00-index.md` trước khi code 5fedu.
- Index trước, sâu theo trigger — không đọc tràn.

## Hard Defaults

- Mặc định **MEDIUM**; final MEDIUM/HIGH đủ status block (`antigravity-overlay`).
- Không tự commit/push/deploy.
- 5fedu UI: `/template` trước.
- `Technical debt check` + `Status` bắt buộc task vừa/lớn.

## Protected

`.agents/AGENTS.md`, `.agents/INTENT.md`, `.agents/rules/`, `.agents/skills/5fedu-project/`, `.agents/5fedu/00-index.md`